'use strict'

/**
 * @weibaohui/dsh-kb — Host half
 *
 * 固定知识库根目录（DSH_KB_ROOT 覆盖，默认 ~/.dsh/kb）上的同源 API：
 *  - apply 时骨架自举（bootstrap：raw/ + wiki/* + index/log/schema，不覆盖已有）；
 *  - 同源路由 /dsh-kb/api/*：status / tree / doc / file / search / upload / queue*，
 *    全部以知识库根为界（kb-core 双重边界拒绝越界与软链逃逸）；
 *  - 无独立端口、无 token/限流——只服务本机 dsh Web GUI（登录门禁由宿主用户体系负责）；
 *  - 写路径两条：upload 到 raw/（人）+ 自动蒸馏的 wiki 成文（kb-bot agent 会话）。
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
const inject = ['webServer', 'agents', 'agentDefaultModel', 'sessions', 'settings']
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
  return async function run(item, { signal }) {
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
        meta: { cwd: rootAbs },
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
        content: [{ type: 'text', text: queueCore.buildDistillPrompt(item) }],
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

    // ── 设置（settings 服务缺席时退回 config/默认值） ──
    let settingsScope = null
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
      return { ...DEFAULT_AUTO, ...(config.autoDistill || {}), ...v }
    }

    // ── 队列（台账在知识库根之外：~/.dsh/dsh-kb/queue.json） ──
    const ledgerFile = join(dshHome(), 'dsh-kb', 'queue.json')
    const queue = queueCore.createQueue({
      root: rootAbs,
      ledgerFile,
      runner: createAgentRunner({ ctx, rootAbs, readAuto, logger }),
      logger,
      getLimits: () => { const a = readAuto(); return { timeoutMs: a.timeoutMin * 60 * 1000, maxAttempts: a.maxAttempts } },
      isPaused: () => readAuto().enabled !== true,
    })
    queue.resume()
    try { queue.scan() } catch (e) { logger.warn(`dsh-kb: 启动扫描失败：${(e && e.message) || e}`) }
    queue.kick()

    // raw/ 监视（200ms 防抖）+ 周期兜底扫描；watcher 不可靠的文件系统由 sweep 覆盖
    try {
      const rawDir = join(rootAbs, core.RAW_DIR)
      fs.mkdirSync(rawDir, { recursive: true })
      const rescan = debounce(() => { try { queue.scan() } catch { /* sweep 兜底 */ } }, 200)
      const watcher = fs.watch(rawDir, { recursive: true }, rescan)
      ctx.effect(() => () => { try { watcher.close() } catch {} }, 'dsh-kb: raw watcher')
    } catch (e) { logger.warn(`dsh-kb: raw/ 监视不可用（兜底扫描覆盖）：${(e && e.message) || e}`) }

    let sweepTimer = null
    const sweep = () => {
      try { queue.scan(); queue.kick() } catch { /* 下一轮再试 */ }
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

              if (req.method === 'GET' && (rest === '/' || rest === '/status')) {
                sendJson(res, 200, core.statusPayload(root))
                return
              }
              if (req.method === 'GET' && rest === '/tree') {
                sendJson(res, 200, { ok: true, dir: (q.get('path') || ''), entries: core.listDir(root, q.get('path') || '') })
                return
              }
              if (req.method === 'GET' && rest === '/doc') {
                sendJson(res, 200, { ok: true, doc: core.readDoc(root, q.get('path') || '') })
                return
              }
              if (req.method === 'GET' && rest === '/file') {
                core.sendFile(res, root, q.get('path') || '', q.get('dl') === '1')
                return
              }
              if (req.method === 'GET' && rest === '/search') {
                const result = await core.search(root, q.get('q') || '')
                sendJson(res, 200, { ok: true, ...result })
                return
              }
              if (req.method === 'POST' && rest === '/upload') {
                const result = await core.uploadRaw(req, root, q.get('dir') || core.RAW_DIR, q.get('name') || '')
                try { queue.offer(`${result.dir}/${result.name}`) } catch (e) { logger.warn(`dsh-kb: 入队失败：${(e && e.message) || e}`) }
                sendJson(res, 201, { ok: true, ...result })
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
