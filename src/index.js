'use strict'

/**
 * @weibaohui/dsh-kb — Host half
 *
 * 固定知识库根目录（DSH_KB_ROOT 覆盖，默认 ~/.dsh/kb）上的同源 API：
 *  - apply 时骨架自举（bootstrap：raw/ + wiki/* + index/log/schema，不覆盖已有）；
 *  - 同源路由 /dsh-kb/api/*：status / tree / doc / file / search / upload / queue*，
 *    全部以知识库根为界（kb-core 双重边界拒绝越界与软链逃逸）；
 *  - 无独立端口、无 token/限流——只服务本机 dsh Web GUI（登录门禁由宿主用户体系负责）；
 *  - 写路径四条：upload 到 raw/（人）+ 自动蒸馏的 wiki 成文（kb-bot agent 会话）
 *    + 库约定 schema.md 的人工编辑（GET/PUT /schema，白名单只此一个文件）
 *    + wiki 版本恢复（POST /history/restore，内容来自快照）与页面反馈（/feedback 追加）。
 *
 * 自动蒸馏（v0.2，设计文档 dsh-kb-auto-distill-design.md）：
 *  - 入料检测：upload 钩子 + raw/ fs.watch（200ms 防抖）+ 周期兜底扫描；
 *  - 队列台账 ~/.dsh/dsh-kb/queue.json（知识库根之外），串行逐条蒸馏；
 *  - 执行器 = 真实 agent 会话（agents.create + agentPreset standard + whenIdle + 事件泵），
 *    cwd 绑知识库根，bot 用自己的工具读 raw/、按 schema 写 wiki/index/log。
 *
 * 与 file-share 的分界：file-share 管「会话工作区」文件，dsh-kb 管「跨会话、
 * 跨人的固定知识库」——二者共享目录树/上传的手法但职责不同。
 */

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { join } = path
const { randomUUID } = require('node:crypto')
const core = require('./kb-core')
const queueCore = require('./queue')

const name = 'dsh-kb'
const inject = ['webServer', 'agents', 'agentDefaultModel', 'sessions', 'settings', 'llm']
const API_PREFIX = '/dsh-kb/api'

const AUTO_NS = 'dsh-kb-autodistill'
const DEFAULT_AUTO = { enabled: true, provider: '', model: '', timeoutMin: 20, maxAttempts: 2, sweepSec: 60 }

/** dsh 数据根（与宿主一致：$DSH_HOME，缺省 ~/.dsh）。 */
function dshHome() {
  return process.env.DSH_HOME ? path.resolve(process.env.DSH_HOME) : join(os.homedir(), '.dsh')
}

// 宿主沙箱内解析打包依赖可能抛 ERR_INTERNAL_ASSERTION（.pnpm 软链），因此优先沿
// dsh 全局安装取 settings 服务自用的那份副本（experts-management 同款）。
function loadSchemastery() {
  const errors = []
  const { createRequire } = require('node:module')
  for (const prefix of [process.env.DSH_GLOBAL_PREFIX, join(os.homedir(), '.local')].filter(Boolean)) {
    const hostCopy = join(prefix, 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'schemastery', 'lib', 'index.cjs')
    try { return createRequire(hostCopy)(hostCopy) } catch (e) { errors.push(String(e && e.code || e)) }
  }
  try { return require('@deepseek-ai/schemastery') } catch (e) { errors.push(String(e && e.code || e)) }
  return null
}

function autoSettingsSchema() {
  const Schema = loadSchemastery()
  if (!Schema) return null
  return Schema.object({
    enabled: Schema.boolean(),
    provider: Schema.string(),
    model: Schema.string(),
    timeoutMin: Schema.number(),
    maxAttempts: Schema.number(),
    sweepSec: Schema.number(),
  })
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function readBody(req, cap = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > cap) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** 防抖（fs.watch 高频事件合并）。 */
function debounce(fn, ms) {
  let t = null
  return () => {
    if (t) clearTimeout(t)
    t = setTimeout(() => { t = null; try { fn() } catch {} }, ms)
    if (typeof t.unref === 'function') t.unref()
  }
}

/**
 * agent 会话执行器：一个条目一个新会话（kit runShareInProcess 形状）。
 * 返回 { tail }（模型可见回复全文，供 JSON 尾协议解析）；pages 由队列统一验证。
 */
function createAgentRunner({ ctx, rootAbs, readAuto, logger }) {
  return async function run(item, { signal, root: itemRoot }) {
    const kbRoot = itemRoot || rootAbs
    const agents = ctx.agents
    const adm = ctx.agentDefaultModel
    if (!agents || typeof agents.create !== 'function' || !adm || typeof adm.currentSelection !== 'function') {
      throw new queueCore.ExecutorUnavailableError('agents/agentDefaultModel 服务不可用')
    }
    const cfg = readAuto()
    // 路由：设置里 provider+model 成对配置则覆盖（dsh-smart-title 同语义），否则跟随宿主默认
    let selection = queueCore.resolveRouteOverride(cfg.provider, cfg.model)
    if (!selection) selection = adm.currentSelection()
    if (!selection || !selection.provider || !selection.model) {
      throw new queueCore.ExecutorUnavailableError('模型未配置（agentDefaultModel 为空）')
    }

    // sessionId 必须每次尝试全新（宿主拒绝 create 已存在的会话；dsh-process 同款教训）
    const sessionId = `kb-distill-${item.id}-${Date.now().toString(36)}`
    let agent
    try {
      const created = await agents.create({
        sessionId,
        meta: { cwd: kbRoot },
        agentOptions: { provider: selection.provider, model: selection.model },
        // 关键：meta.agentPreset 只是会话头标签，不带任何工具——没有 preset mount
        // 的会话一个工具都没有，模型只能干说「我无法执行命令」（真机抓过）。
        // 必须在 setup 里 mount 部署默认预设，和 web 网关/dsh-tasks 同款（dsh-tasks 原注释）。
        setup: async (agentCtx) => {
          const presets = typeof ctx.get === 'function' ? ctx.get('agentPresets') : undefined
          if (!presets || typeof presets.resolve !== 'function' || typeof presets.mount !== 'function') return
          const resolved = await presets.resolve(undefined)
          if (resolved && resolved.id) await presets.mount(agentCtx, resolved.id)
        },
      })
      agent = created && created.agent
    } catch (e) {
      throw new queueCore.ExecutorUnavailableError(`agents.create 失败：${(e && e.message) || e}`)
    }
    if (!agent) throw new queueCore.ExecutorUnavailableError('agents.create 未返回会话')
    item.sessionId = sessionId

    // 中止：尽力而为地停会话（agents 服务未暴露 abort 时由队列的竞态/宽限兜底）
    const stopAgent = () => {
      for (const m of ['stop', 'abort', 'cancel', 'dispose']) {
        try { if (typeof agent[m] === 'function') agent[m]() } catch { /* 尽力而为 */ }
      }
    }
    if (signal) {
      if (signal.aborted) stopAgent()
      else signal.addEventListener('abort', stopAgent, { once: true })
    }

    const firstSeq = agent.session.seq
    logger.info(`dsh-kb: [${item.id}] 会话就绪 seq=${firstSeq} preset=${agent.session && agent.session.agentPreset}`)
    // 标题进会话列表（失败非致命）；回合来源必须是 plugin——插件上下文里 kind:'user'
    // 的 followup 会被宿主静默丢弃（dsh-process 同款教训，今日真机 E2E 验证）
    try { agent.session.append('session/title', { title: `KB 蒸馏 · ${item.rel.split('/').pop()}`, messageSeqs: [], source: { kind: 'user' } }) } catch (e) { logger.warn(`dsh-kb: [${item.id}] 标题失败：${(e && e.message) || e}`) }
    // 权限旋钮：无人值守会话默认 approval=ask，写文件全会被拒（真机抓过）。
    // 旋钮=会话事件（dsh-permission-presets 的 fold 单元），追加即生效：
    // 沙箱 workspace-write（写范围=会话工作区，即知识库根）+ 审批 never。
    try {
      agent.session.append('sandbox/mode', { mode: 'workspace-write' })
      agent.session.append('approval/policy', { policy: 'never' })
    } catch (e) { logger.warn(`dsh-kb: [${item.id}] 权限旋钮失败：${(e && e.message) || e}`) }
    let output = ''
    let finalText = ''
    const seen = new Set()
    const eventList = () => {
      try { return Array.isArray(agent.session.events) ? agent.session.events : [] } catch { return [] }
    }
    // 事件泵：text-delta 增量（block-assembler 形状）；'text' 整块为旧形状兜底；
    // assistant/message 记录最终可见全文（JSON 尾协议从这里取，防流式输出被截断）。
    const pump = () => {
      for (const ev of eventList()) {
        if (ev.seq < firstSeq || seen.has(ev.seq)) continue
        seen.add(ev.seq)
        const d = ev.data || {}
        if (ev.type === 'assistant/chunk' && d.chunk && typeof d.chunk.text === 'string' && (d.chunk.type === 'text-delta' || d.chunk.type === 'text')) {
          output += d.chunk.text
        } else if (ev.type === 'assistant/message' && d.message && d.message.role === 'assistant' && Array.isArray(d.message.content)) {
          const text = d.message.content
            .filter((b) => b && (b.type === 'text' || b.type === undefined) && typeof b.text === 'string')
            .map((b) => b.text)
            .join('')
          if (text.trim() !== '') finalText = text
        }
      }
    }
    const timer = setInterval(pump, 300)
    if (typeof timer.unref === 'function') timer.unref()
    // 形状采样：本宿主事件形状漂移时，从队列诊断可见真实字段（各取前 2 条）
    const samples = { chunkText: [], message: [], tool: [] }
    const sample = (arr, ev) => { if (arr.length < 2) arr.push(JSON.stringify(ev).slice(0, 320)) }
    const sampleSeen = new Set()
    const samplePump = () => {
      for (const ev of eventList()) {
        if (ev.seq < firstSeq || sampleSeen.has(ev.seq)) continue
        sampleSeen.add(ev.seq)
        const d = ev.data || {}
        if (ev.type === 'assistant/chunk' && d.chunk && d.chunk.type === 'text-delta') sample(samples.chunkText, ev)
        else if (ev.type === 'assistant/message') sample(samples.message, ev)
        else if (ev.type === 'tool/call') sample(samples.tool, ev)
      }
    }
    const sampleTimer = setInterval(samplePump, 300)
    if (typeof sampleTimer.unref === 'function') sampleTimer.unref()
    try {
      // 回合来源 plugin + 完整消息形状（dsh-tasks 同款）；kind:'user' 在插件上下文会被静默丢弃
      agent.followup({
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: queueCore.buildDistillPrompt(item, kbRoot) }],
        source: { kind: 'plugin', plugin: 'dsh-kb' },
      })
      logger.info(`dsh-kb: [${item.id}] followup 已发，等 whenIdle…`)
      await agent.whenIdle()
      // 诊断信息随返回值走（插件 logger 不落盘；无产出时队列把它写进 item.error）
      const list = eventList()
      const counts = {}
      for (const ev of list) counts[ev.type] = (counts[ev.type] || 0) + 1
      const hist = Object.entries(counts).map(([t, n]) => `${t}:${n}`).join(' ').slice(0, 400)
      const last = list.length ? JSON.stringify(list[list.length - 1]).slice(0, 220) : '-'
      const chunkTypes = {}
      for (const ev of list) {
        if (ev.type === 'assistant/chunk' && ev.data && ev.data.chunk) chunkTypes[ev.data.chunk.type] = (chunkTypes[ev.data.chunk.type] || 0) + 1
      }
      const diag = `ev=${list.length} [${hist}] chunks=${JSON.stringify(chunkTypes)} last=${last} out=${output.length}B fin=${finalText.length}B`
        + `\nSAMPLE text-delta: ${samples.chunkText[0] || '-'}`
        + `\nSAMPLE message: ${samples.message[0] || '-'}`
        + `\nSAMPLE tool: ${samples.tool[0] || '-'}`
      logger.info(`dsh-kb: [${item.id}] whenIdle 结束：${diag}`)
      try { await ctx.sessions.flush(agent.session) } catch { /* 可选服务 */ }
      return { tail: finalText || output, diag }
    } finally {
      clearInterval(timer)
      clearInterval(sampleTimer)
      pump()
      samplePump()
    }
  }
}

module.exports = {
  name,
  inject,
  version: core.VERSION,

  apply(ctx, config = {}) {
    const logger = ctx.logger || { info() {}, warn() {}, error() {} }
    const webServer = ctx.webServer
    const root = core.defaultRoot()

    try {
      fs.mkdirSync(root, { recursive: true })
      core.bootstrap(root, logger)
    } catch (e) {
      logger.error(`dsh-kb: 知识库根目录不可用 ${root}: ${(e && e.message) || e}`)
      return
    }
    const rootAbs = path.resolve(root)

    // ── 多知识库注册表（主库隐式；added 持久化在 ~/.dsh/dsh-kb/kbs.json） ──
    const registryFile = join(dshHome(), 'dsh-kb', 'kbs.json')
    const addedKbs = core.loadKbRegistry(registryFile).kbs
    const persistRegistry = () => core.saveKbRegistry(registryFile, { version: core.REGISTRY_VERSION, kbs: addedKbs })
    const MAIN_KB = { id: 'main', name: '主库', root: rootAbs, kind: 'material', distillEnabled: true }
    const allKbs = () => [MAIN_KB, ...addedKbs]
    const resolveKb = (kbId) => allKbs().find((k) => k.id === (kbId || 'main')) || null
    const distillTargets = () => allKbs().filter((k) => k.kind === 'material' && k.distillEnabled !== false)

    // ── 设置（settings 服务缺席时退回 config/默认值） ──
    let settingsScope = null
    const autoOverrides = {} // settings 服务缺席时 PUT /autodistill 的运行时兜底
    try {
      if (ctx.settings && typeof ctx.settings.register === 'function') {
        settingsScope = ctx.settings.register(AUTO_NS, autoSettingsSchema(), { base: { ...DEFAULT_AUTO, ...(config.autoDistill && typeof config.autoDistill === 'object' ? config.autoDistill : {}) } })
      } else if (config.autoDistill && typeof config.autoDistill === 'object') {
        settingsScope = { get: () => ({ ...config.autoDistill }) }
      }
    } catch (e) { logger.warn(`dsh-kb: settings register: ${(e && e.message) || e}`) }
    const readAuto = () => {
      let v = {}
      try { if (settingsScope && typeof settingsScope.get === 'function') v = settingsScope.get() || {} } catch { v = {} }
      return { ...DEFAULT_AUTO, ...(config.autoDistill || {}), ...autoOverrides, ...v }
    }

    // ── 队列（台账在知识库根之外：~/.dsh/dsh-kb/queue.json） ──
    const ledgerFile = join(dshHome(), 'dsh-kb', 'queue.json')
    const queue = queueCore.createQueue({
      root: rootAbs,
      rootOf: (kbId) => {
        const k = resolveKb(kbId)
        return k ? k.root : null
      },
      ledgerFile,
      runner: createAgentRunner({ ctx, rootAbs, readAuto, logger }),  // runner 内部按 item.kbId 取根
      logger,
      getLimits: () => { const a = readAuto(); return { timeoutMs: a.timeoutMin * 60 * 1000, maxAttempts: a.maxAttempts } },
      isPaused: () => readAuto().enabled !== true,
    })
    queue.resume()
    try { for (const k of distillTargets()) queue.scan(k.id) } catch (e) { logger.warn(`dsh-kb: 启动扫描失败：${(e && e.message) || e}`) }
    queue.kick()

    // raw/ 监视（200ms 防抖）：主库 + 每个素材库各一个；watcher 不可靠的文件系统由 sweep 覆盖
    const kbWatchers = new Map() // kbId → fs.Watcher
    const historyRoot = join(dshHome(), 'dsh-kb', 'history')
    const histDirOf = (kbId) => join(historyRoot, kbId || 'main')
    const snapKbWiki = (kb) => { try { core.snapWikiTree(kb.root, histDirOf(kb.id)) } catch { /* 下一轮再试 */ } }
    const watchKb = (kb) => {
      if (kbWatchers.has(kb.id) || kb.kind !== 'material' || kb.distillEnabled === false) return
      try {
        const rawDir = join(kb.root, core.RAW_DIR)
        fs.mkdirSync(rawDir, { recursive: true })
        const rescan = debounce(() => { try { queue.scan(kb.id) } catch { /* sweep 兜底 */ } }, 200)
        kbWatchers.set(kb.id, fs.watch(rawDir, { recursive: true }, rescan))
      } catch (e) { logger.warn(`dsh-kb: ${kb.name} raw/ 监视不可用（兜底扫描覆盖）：${(e && e.message) || e}`) }
      // wiki/ 监视 → 版本历史快照（所有素材库，含蒸馏关闭的：人/agent 的编辑都要留版本）
      try {
        const wikiDir = join(kb.root, core.WIKI_DIR)
        fs.mkdirSync(wikiDir, { recursive: true })
        const snap = debounce(() => snapKbWiki(kb), 800)
        kbWatchers.set(kb.id + ':wiki', fs.watch(wikiDir, { recursive: true }, snap))
      } catch (e) { logger.warn(`dsh-kb: ${kb.name} wiki/ 监视不可用（无版本历史）：${(e && e.message) || e}`) }
    }
    const unwatchKb = (kbId) => {
      for (const key of [kbId, kbId + ':wiki']) {
        const w = kbWatchers.get(key)
        if (w) { try { w.close() } catch {} kbWatchers.delete(key) }
      }
    }
    watchKb(MAIN_KB)
    for (const k of addedKbs) watchKb(k)
    for (const k of allKbs()) if (k.kind === 'material') snapKbWiki(k) // 启动先补一次快照
    ctx.effect(() => () => { for (const w of kbWatchers.values()) { try { w.close() } catch {} } }, 'dsh-kb: raw/wiki watchers')

    let sweepTimer = null
    const sweep = () => {
      try { for (const k of distillTargets()) queue.scan(k.id); queue.kick() } catch { /* 下一轮再试 */ }
      const sec = Math.max(15, Number(readAuto().sweepSec) || 60)
      sweepTimer = setTimeout(sweep, sec * 1000)
      if (typeof sweepTimer.unref === 'function') sweepTimer.unref()
    }
    sweepTimer = setTimeout(sweep, Math.max(15, Number(readAuto().sweepSec) || 60) * 1000)
    if (typeof sweepTimer.unref === 'function') sweepTimer.unref()
    ctx.effect(() => () => { if (sweepTimer) clearTimeout(sweepTimer) }, 'dsh-kb: sweep timer')

    if (webServer && typeof webServer.register === 'function') {
      ctx.effect(() => {
        webServer.register({
          kind: 'prefix',
          path: API_PREFIX,
          handler: async (req, res) => {
            let url
            try {
              url = new URL(req.url || '/', 'http://dsh.local')
              const p = url.pathname
              if (!p.startsWith(API_PREFIX)) { sendJson(res, 404, { ok: false, error: 'not found' }); return }
              const rest = p.slice(API_PREFIX.length) || '/'
              const q = url.searchParams

              // 多知识库：可选 ?kb=<id>（缺省主库）；未知 id 一律 400
              const kb = resolveKb(q.get('kb'))
              if (!kb) { sendJson(res, 400, { ok: false, error: '未知知识库' }); return }

              if (req.method === 'GET' && (rest === '/' || rest === '/status')) {
                sendJson(res, 200, { ...core.statusPayload(kb.root), kb: { id: kb.id, name: kb.name, kind: kb.kind } })
                return
              }
              if (req.method === 'GET' && rest === '/tree') {
                sendJson(res, 200, { ok: true, dir: (q.get('path') || ''), entries: core.listDir(kb.root, q.get('path') || '') })
                return
              }
              if (req.method === 'GET' && rest === '/doc') {
                sendJson(res, 200, { ok: true, doc: core.readDoc(kb.root, q.get('path') || '') })
                return
              }
              if (req.method === 'GET' && rest === '/file') {
                core.sendFile(res, kb.root, q.get('path') || '', q.get('dl') === '1')
                return
              }
              if (req.method === 'GET' && rest === '/search') {
                const result = await core.search(kb.root, q.get('q') || '')
                sendJson(res, 200, { ok: true, ...result })
                return
              }
              // ── 库约定 schema.md（每库一份，kb-bot/交互 agent 的最终权威） ──
              if (req.method === 'GET' && rest === '/schema') {
                sendJson(res, 200, { ok: true, kb: kb.id, ...core.readSchema(kb.root) })
                return
              }
              if (req.method === 'GET' && rest === '/schema/default') {
                sendJson(res, 200, { ok: true, text: core.BOOT_SCHEMA })
                return
              }
              if (req.method === 'PUT' && rest === '/schema') {
                if (kb.kind !== 'material') { sendJson(res, 403, { ok: false, error: '产出库只读，不支持编辑约定' }); return }
                const body = JSON.parse((await readBody(req, 512 * 1024)) || '{}')
                const r = core.writeSchema(kb.root, body.text)
                sendJson(res, 200, { ok: true, kb: kb.id, ...r })
                return
              }
              // ── 版本历史（wiki/ 快照，读任意库；恢复仅素材库） ──
              if (req.method === 'GET' && rest === '/history') {
                sendJson(res, 200, { ok: true, items: core.listSnapshots(histDirOf(kb.id), q.get('path') || '') })
                return
              }
              if (req.method === 'GET' && rest === '/history/file') {
                sendJson(res, 200, { ok: true, text: core.readSnapshot(histDirOf(kb.id), q.get('path') || '', q.get('ts') || '') })
                return
              }
              if (req.method === 'POST' && rest === '/history/restore') {
                if (kb.kind !== 'material') { sendJson(res, 403, { ok: false, error: '产出库只读，不支持恢复' }); return }
                const body = JSON.parse((await readBody(req)) || '{}')
                const r = core.restoreSnapshot(kb.root, histDirOf(kb.id), body.path, body.ts)
                logger.info(`dsh-kb: [${kb.id}] 版本恢复 ${r.rel}（${r.size}B）`)
                sendJson(res, 200, { ok: true, ...r })
                return
              }
              // ── 页面反馈（追加进本库 wiki/meta/feedback.md） ──
              if (req.method === 'POST' && rest === '/feedback') {
                if (kb.kind !== 'material') { sendJson(res, 403, { ok: false, error: '产出库只读，不支持反馈' }); return }
                const body = JSON.parse((await readBody(req)) || '{}')
                const r = core.appendFeedback(kb.root, body.path, body.note)
                sendJson(res, 200, { ok: true, ...r })
                return
              }
              if (req.method === 'POST' && rest === '/upload') {
                if (kb.kind !== 'material') { sendJson(res, 403, { ok: false, error: '产出库只读，不支持上传' }); return }
                const result = await core.uploadRaw(req, kb.root, q.get('dir') || core.RAW_DIR, q.get('name') || '')
                try { queue.offer(`${result.dir}/${result.name}`, kb.id) } catch (e) { logger.warn(`dsh-kb: 入队失败：${(e && e.message) || e}`) }
                sendJson(res, 201, { ok: true, ...result })
                return
              }
              // ── 多知识库管理 ──
              if (req.method === 'GET' && rest === '/kbs') {
                const kbs = allKbs().map((k) => ({
                  id: k.id, name: k.name, root: k.root, kind: k.kind || 'material', distillEnabled: k.distillEnabled !== false,
                  counts: core.statusPayload(k.root).counts,
                }))
                sendJson(res, 200, { ok: true, kbs })
                return
              }
              if (req.method === 'POST' && rest === '/kb') {
                const body = JSON.parse((await readBody(req)) || '{}')
                const check = core.normalizeKbRoot(body.root, os.homedir())
                if (!check.ok) throw new core.KbError(400, check.error)
                const kind = body.kind === 'produced' ? 'produced' : 'material'
                if (allKbs().some((k) => core.kbRootsOverlap(k.root, check.abs))) throw new core.KbError(400, '与已有知识库目录重叠')
                const entry = {
                  id: core.newKbId(),
                  name: String(body.name || '').trim().slice(0, 60) || path.basename(check.abs),
                  root: check.abs, kind,
                  distillEnabled: body.distillEnabled !== false,
                  createdAt: new Date().toISOString(),
                }
                addedKbs.push(entry)
                persistRegistry()
                if (entry.kind === 'material') {
                  try { core.bootstrap(entry.root, logger) } catch (e) { logger.warn(`dsh-kb: 新库骨架自举失败：${(e && e.message) || e}`) }
                  watchKb(entry)
                  try { queue.scan(entry.id) } catch {}
                }
                sendJson(res, 201, { ok: true, kb: entry })
                return
              }
              if (req.method === 'POST' && rest === '/kb/delete') {
                const body = JSON.parse((await readBody(req)) || '{}')
                const idx = addedKbs.findIndex((k) => k.id === body.id)
                if (idx < 0) throw new core.KbError(404, '知识库不存在或不可删除')
                const [gone] = addedKbs.splice(idx, 1)
                persistRegistry()
                unwatchKb(gone.id)
                try { for (const it of queue.snapshot().items) if ((it.kbId || 'main') === gone.id && (it.status === 'queued')) queue.cancel(it.id) } catch {}
                sendJson(res, 200, { ok: true, id: gone.id })
                return
              }
              if (req.method === 'POST' && rest === '/kb/update') {
                const body = JSON.parse((await readBody(req)) || '{}')
                const k = addedKbs.find((x) => x.id === body.id)
                if (!k) throw new core.KbError(404, '知识库不存在或不可修改')
                if (typeof body.name === 'string' && body.name.trim()) k.name = body.name.trim().slice(0, 60)
                if (typeof body.distillEnabled === 'boolean') k.distillEnabled = body.distillEnabled
                persistRegistry()
                if (k.distillEnabled === false) unwatchKb(k.id)
                else { watchKb(k); try { queue.scan(k.id) } catch {} }
                sendJson(res, 200, { ok: true, kb: k })
                return
              }
              // ── 自动蒸馏队列 ──
              if (req.method === 'GET' && rest === '/queue') {
                const cfg = readAuto()
                const override = queueCore.resolveRouteOverride(cfg.provider, cfg.model)
                let route = override
                if (!route) {
                  try { route = ctx.agentDefaultModel && ctx.agentDefaultModel.currentSelection() } catch { route = null }
                }
                route = route && route.provider && route.model
                  ? { provider: route.provider, model: route.model, source: override ? 'override' : 'default' }
                  : null
                const snap = queue.snapshot()
                sendJson(res, 200, { ok: true, enabled: cfg.enabled, route, ledger: ledgerFile, ...snap })
                return
              }
              // GET /models — 设置页模型下拉的目录（llm.listProviders + 逐家 listModels；缺席降级空目录）
              if (req.method === 'GET' && rest === '/models') {
                const out = { default: null, providers: [] }
                try {
                  if (ctx.agentDefaultModel && typeof ctx.agentDefaultModel.currentSelection === 'function')
                    out.default = ctx.agentDefaultModel.currentSelection()
                } catch {}
                try {
                  const providers = ctx.llm && typeof ctx.llm.listProviders === 'function' ? ctx.llm.listProviders() : []
                  for (const p of providers || []) {
                    let models = []
                    try { models = (await ctx.llm.listModels(p.id)) || [] } catch {}
                    out.providers.push({ id: p.id, name: p.name || p.id, models: models.map((m) => ({ id: m.id, name: m.name || m.id })) })
                  }
                } catch {}
                sendJson(res, 200, out)
                return
              }
              if (req.method === 'GET' && rest === '/autodistill') {
                const cfg = readAuto()
                const override = queueCore.resolveRouteOverride(cfg.provider, cfg.model)
                let route = override
                if (!route) {
                  try { route = ctx.agentDefaultModel && ctx.agentDefaultModel.currentSelection() } catch { route = null }
                }
                route = route && route.provider && route.model
                  ? { provider: route.provider, model: route.model, source: override ? 'override' : 'default' }
                  : null
                sendJson(res, 200, { ok: true, settings: cfg, route })
                return
              }
              if (req.method === 'PUT' && rest === '/autodistill') {
                const body = JSON.parse((await readBody(req)) || '{}')
                const patch = queueCore.sanitizeAutoPatch(body)
                if (settingsScope && typeof settingsScope.update === 'function') await settingsScope.update(patch)
                else Object.assign(autoOverrides, patch)
                sendJson(res, 200, { ok: true, settings: readAuto() })
                return
              }
              if (req.method === 'POST' && rest === '/queue/pause') {
                const body = JSON.parse((await readBody(req)) || '{}')
                queue.setPaused(body.paused === true)
                sendJson(res, 200, { ok: true, paused: queue.paused })
                return
              }
              if (req.method === 'POST' && rest === '/queue/enqueue') {
                const body = JSON.parse((await readBody(req)) || '{}')
                const r = queue.offer(String(body.rel || ''))
                if (!r.ok) throw new core.KbError(400, `无法入队：${r.reason}`)
                sendJson(res, 200, { ok: true, item: r.item })
                return
              }
              if (req.method === 'POST' && rest === '/queue/retry') {
                const body = JSON.parse((await readBody(req)) || '{}')
                const r = queue.retry(String(body.id || ''))
                if (!r.ok) throw new core.KbError(400, `无法重试：${r.reason}`)
                sendJson(res, 200, { ok: true, item: r.item })
                return
              }
              if (req.method === 'POST' && rest === '/queue/cancel') {
                const body = JSON.parse((await readBody(req)) || '{}')
                const r = queue.cancel(String(body.id || ''))
                if (!r.ok) throw new core.KbError(400, `无法取消：${r.reason}`)
                sendJson(res, 200, { ok: true, item: r.item })
                return
              }
              if (req.method === 'POST' && rest === '/queue/scan') {
                sendJson(res, 200, { ok: true, ...queue.scan() })
                return
              }
              sendJson(res, 404, { ok: false, error: 'not found' })
            } catch (e) {
              if (e instanceof core.KbError) { sendJson(res, e.status, { ok: false, error: e.message }); return }
              try { sendJson(res, 500, { ok: false, error: String((e && e.message) || e) }) } catch {}
            }
          },
        })
      }, 'dsh-kb: kb api route')
    } else {
      logger.warn('dsh-kb: webServer 不可用，知识库 API 未注册')
    }

    // 不 return 任何值——cordis-plugin-loader 把 apply 的返回值当作 disposable/effect。
  },
}
