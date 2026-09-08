'use strict'

/**
 * @weibaohui/dsh-kb — 自动蒸馏队列（v0.2）
 *
 * 台账 + 状态机 + 串行 worker + raw/ 扫描器。设计文档：dsh-kb-auto-distill-design.md。
 *
 * 职责边界：
 *  - 队列只管「哪个素材、什么状态、何时跑、跑成没成」；真正蒸馏由注入的 runner 执行
 *    （src/index.js 里的 agent 会话执行器；测试注入假 runner）。
 *  - 台账默认 ~/.dsh/dsh-kb/queue.json（刻意在知识库根之外，不污染搜索/目录树）。
 *  - 串行 concurrency=1：index.md/log.md 先读后写纪律在单一写者下最稳（dsh-process 前例）。
 *  - raw/ 不可变约定由本模块维护事实：hash 变化视为磁盘直写覆盖 → 重新入队并记 warning。
 *
 * 关键判定：
 *  - 去重：同 rel 且同 hash 且已有非终态或 done 记录 → 跳过；hash 变化 → 素材更新，重新入队。
 *  - 台账丢失恢复：wiki 各篇 frontmatter sources 已引用的 raw 文件不再入队（v0 每日任务思路）。
 *  - 产出验证双路：runner 回传的 pages ∪ 会话前后 wiki/ diff，都为空 → failed(no output)。
 */

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const core = require('./kb-core')

const LEDGER_VERSION = 1
const DONE_KEEP = 200                 // done/skipped 终态条目保留上限
const RETRY_BASE_MS = 60 * 1000       // 退避基数：60s × attempts
const HASH_HEAD_BYTES = 256 * 1024    // 大文件只哈希头部 + size（变更检测足够）
const WIKI_PREFIX = core.WIKI_DIR + '/'
const RAW_PREFIX = core.RAW_DIR + '/'
const CHUNK_THRESHOLD = 100 * 1024    // 超过此大小的素材自动分片（单回合吞不下整本书）
const CHUNK_TARGET = 32 * 1024        // 单片目标大小
const CHUNK_MAX_ITEMS = 50            // 分片数上限（超出则单片变大）

/** 执行器不可用（agents 服务缺失/模型未配置）：不计失败次数，条目保持 queued。 */
class ExecutorUnavailableError extends Error {}

function nowIso() { return new Date().toISOString() }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

function newItemId() {
  return 'dq-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex')
}

/** 变更检测指纹：sha256(头 256KB) + ':' + size（快，且同尺寸内容变更必变头部概率忽略）。 */
function fingerprint(abs) {
  const st = fs.statSync(abs)
  const fd = fs.openSync(abs, 'r')
  try {
    const buf = Buffer.alloc(Math.min(HASH_HEAD_BYTES, st.size))
    fs.readSync(fd, buf, 0, buf.length, 0)
    return { size: st.size, mtime: Math.round(st.mtimeMs), hash: 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32) + ':' + st.size }
  } finally {
    fs.closeSync(fd)
  }
}

/** wiki/ 快照：rel → size:mtime，用于会话前后 diff。 */
function wikiSnapshot(rootAbs) {
  const files = []
  core.walkFiles(path.join(rootAbs, core.WIKI_DIR), files, 20000)
  const map = new Map()
  for (const abs of files) {
    try {
      const st = fs.statSync(abs)
      map.set(path.relative(rootAbs, abs).split(path.sep).join('/'), st.size + ':' + Math.round(st.mtimeMs))
    } catch { /* 竞态删除忽略 */ }
  }
  return map
}

/** wiki diff：新增或变更的 wiki/ 相对路径。 */
function diffWiki(before, after) {
  const out = []
  for (const [rel, sig] of after) {
    if (before.get(rel) !== sig) out.push(rel)
  }
  return out
}

/** 收集 wiki/**.md frontmatter sources 引用的 raw rel 集合（台账丢失时的防重入对账）。 */
function collectWikiSources(rootAbs) {
  const files = []
  core.walkFiles(path.join(rootAbs, core.WIKI_DIR), files, 20000)
  const cited = new Set()
  for (const abs of files) {
    const ext = path.extname(abs).slice(1).toLowerCase()
    if (ext !== 'md' && ext !== 'markdown') continue
    let text
    try { text = fs.readFileSync(abs, 'utf8') } catch { continue }
    const { data } = core.parseFrontmatter(text)
    const src = data && data.sources
    if (!Array.isArray(src)) continue
    for (let s of src) {
      s = String(s).trim().replace(/^\.\//, '')
      if (s.startsWith(RAW_PREFIX)) cited.add(s)
    }
  }
  return cited
}

/**
 * 从模型回复尾部提取 JSON 结论行：{"pages": [...], "summary": "..."}。
 * 从后往前逐行尝试 JSON.parse（最多 80 行），命中含 pages 数组的对象为止。
 */
function extractJsonTail(text) {
  const lines = String(text || '').split(/\r?\n/)
  for (let i = lines.length - 1, tried = 0; i >= 0 && tried < 80; i--, tried++) {
    const line = lines[i].trim()
    if (!line || !(line.startsWith('{') && line.endsWith('}'))) continue
    try {
      const obj = JSON.parse(line)
      if (obj && typeof obj === 'object' && Array.isArray(obj.pages)) {
        return { pages: obj.pages.map((p) => String(p)), summary: typeof obj.summary === 'string' ? obj.summary : '' }
      }
    } catch { /* 继续往前找 */ }
  }
  return null
}

/**
 * 模型路由覆盖判定（dsh-smart-title 同语义）：provider+model 成对非空才生效；
 * 只填一个视为配置不完整（null），全空为未配置（null）。调用方拿到 null 时回退
 * 宿主 agentDefaultModel。
 */
function resolveRouteOverride(provider, model) {
  const p = typeof provider === 'string' ? provider.trim() : ''
  const m = typeof model === 'string' ? model.trim() : ''
  if (p && m) return { provider: p, model: m }
  return null
}

/** 蒸馏 prompt（自包含，不依赖会话上下文；规则与 schema.md 一致）。 */
function buildDistillPrompt(item) {
  const head = item.chunk
    ? `素材：${item.rel} 的第 ${item.chunk.idx}/${item.chunk.total} 片，本片内容在文件：${item.chunk.file}（只加工本片；其余片由其他会话处理）`
    : `素材：${item.rel}`
  return [
    '你是 dsh-kb 的自动加工 bot（author 固定写 kb-bot）。知识库根目录下的素材需要你按知识库约定加工成文。',
    '',
    head,
    '',
    '第一步必须读知识库根目录下的 schema.md（最终权威）与 index.md（已有条目清单）。',
    '- 严格两步加工：先分析（关键实体/步骤/结论，对照 wiki 已有条目找关联、矛盾、缺口），再生成',
    '- 页面规范照 schema.md：frontmatter 必填（title/tags/author/created/updated），author 固定写 kb-bot，sources 引用本 raw 路径',
    '- 与已有条目矛盾必须双边显式标注「⚠️ 与 [[对方]] 矛盾」并说明适用环境差异；不确定写「待确认」，不许编',
    '- raw/ 不可变，不得修改删除；写完页面后必须把新页面挂进 index.md 对应小节、log.md 追加一行，均先读后写（log 行 author 用 kb-bot）',
    '',
    '最终回复的最后一行输出 JSON：{"pages": ["wiki/...相对路径..."], "summary": "一句话摘要"}',
  ].join('\n')
}

/**
 * 按标题边界把 markdown 切成 ≤target 的片（单片超限按字符硬切、行尾对齐）。
 * 返回 [{title, body}]；字符偏移全程以 src 计。
 */
function splitMarkdown(text, target = CHUNK_TARGET, maxParts = CHUNK_MAX_ITEMS) {
  const src = String(text || '')
  if (src.length <= target) return [{ title: '', body: src }]
  const lines = src.split(/\r?\n/)
  const off = []
  let acc = 0
  for (const l of lines) { off.push(acc); acc += l.length + 1 }
  const heads = []
  for (let i = 0; i < lines.length; i++) if (/^#{1,3}\s/.test(lines[i])) heads.push(i)
  const bounds = []
  let s = 0
  for (const h of heads) { if (h > s) bounds.push([off[s], off[h]]); s = h }
  bounds.push([off[s], acc])
  const parts = []
  let partStart = bounds[0][0]
  let partLen = 0
  for (const [bs, be] of bounds) {
    const len = be - bs
    if (len > target) {
      if (partStart < bs) { parts.push({ title: '', body: src.slice(partStart, bs) }) }
      let p = bs
      while (p < be) {
        let e = Math.min(p + target, be)
        if (e < be) { const nl = src.indexOf('\n', e); if (nl !== -1 && nl <= be) e = nl + 1 }
        parts.push({ title: '', body: src.slice(p, e) })
        p = e
      }
      partStart = be
      partLen = 0
      continue
    }
    if (partLen + len > target && partStart < bs) {
      parts.push({ title: '', body: src.slice(partStart, bs) })
      partStart = bs
      partLen = 0
    }
    partLen += len
  }
  if (partStart < src.length) parts.push({ title: '', body: src.slice(partStart) })
  const kept = parts.filter((p) => p.body.length)
  if (kept.length > maxParts) {
    const per = Math.ceil(kept.length / maxParts)
    const merged = []
    for (let i = 0; i < kept.length; i += per) merged.push({ title: '', body: kept.slice(i, i + per).map((p) => p.body).join('') })
    return merged
  }
  return kept
}

/** 工厂：创建队列实例。runner(item, {signal}) => Promise<{pages?, summary?, tail?}>。 */
function createQueue({ root, ledgerFile, runner, logger = { info() {}, warn() {}, error() {} }, getLimits, isPaused }) {
  const rootAbs = core.ensureRoot(root)
  if (typeof runner !== 'function') throw new TypeError('runner required')

  const limits = () => {
    const l = (typeof getLimits === 'function' && getLimits()) || {}
    return {
      timeoutMs: Number(l.timeoutMs) > 0 ? Number(l.timeoutMs) : 20 * 60 * 1000,
      maxAttempts: Number(l.maxAttempts) > 0 ? Math.floor(Number(l.maxAttempts)) : 2,
    }
  }
  const externallyPaused = typeof isPaused === 'function' ? isPaused : () => false

  // ── 台账 ────────────────────────────────────────────────
  const items = [] // 按 enqueuedAt 升序（push 顺序即序）
  let paused = false
  let executorDown = false
  let lastError = null
  let busy = false
  let pendingScan = false
  let kicked = false
  let retryTimer = null

  function load() {
    let text
    try { text = fs.readFileSync(ledgerFile, 'utf8') } catch (e) {
      if (e && e.code !== 'ENOENT') throw e
      return
    }
    try {
      const data = JSON.parse(text)
      if (data && data.version === LEDGER_VERSION && Array.isArray(data.items)) {
        paused = data.paused === true
        for (const it of data.items) if (it && typeof it === 'object' && it.id && it.rel) items.push(it)
        return
      }
      throw new Error('bad shape')
    } catch (e) {
      const bad = ledgerFile + '.bad-' + Date.now()
      try { fs.renameSync(ledgerFile, bad) } catch { /* 忽略 */ }
      logger.warn(`dsh-kb: 队列台账损坏，已备份为 ${path.basename(bad)} 并重建（${(e && e.message) || e}）`)
      items.length = 0
      paused = false
    }
  }

  function persist() {
    // 终态条目超限淘汰最旧（防重入靠 hash 对账，不靠台账条目本身）
    const keep = []
    const terminal = []
    for (const it of items) (it.status === 'done' || it.status === 'skipped' ? terminal : keep).push(it)
    let out = keep.concat(terminal)
    const terminals = out.filter((it) => it.status === 'done' || it.status === 'skipped')
    if (terminals.length > DONE_KEEP) {
      const drop = new Set(terminals.slice(0, terminals.length - DONE_KEEP).map((it) => it.id))
      out = out.filter((it) => !drop.has(it.id))
    }
    const tmp = `${ledgerFile}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`
    fs.mkdirSync(path.dirname(ledgerFile), { recursive: true })
    fs.writeFileSync(tmp, JSON.stringify({ version: LEDGER_VERSION, paused, updatedAt: nowIso(), items: out }, null, 1), 'utf8')
    fs.renameSync(tmp, ledgerFile)
  }

  const byId = (id) => items.find((it) => it.id === id) || null
  const latestByRel = (rel) => { for (let i = items.length - 1; i >= 0; i--) if (items[i].rel === rel) return items[i]; return null }

  // ── 入队 ────────────────────────────────────────────────
  function addItem(rel, fp, extra) {
    const item = {
      id: newItemId(), rel, size: fp.size, mtime: fp.mtime, hash: fp.hash,
      status: 'queued', attempts: 0, enqueuedAt: nowIso(),
      startedAt: null, finishedAt: null, sessionId: null, pages: [], note: '', error: null,
    }
    if (extra && extra.chunk) item.chunk = extra.chunk
    items.push(item)
    return item
  }

  const chunksDir = path.join(path.dirname(ledgerFile), 'chunks')

  /** 超大素材分片落盘（分片文件放插件台账区，不进知识库根），并逐片入队。返回入队条数。 */
  function admit(rel, fp) {
    const abs = path.join(rootAbs, ...rel.split('/'))
    const ext = path.extname(abs).slice(1).toLowerCase()
    if (fp.size <= CHUNK_THRESHOLD || !core.TEXT_EXT.has(ext)) return addItem(rel, fp) && 1
    let text
    try { text = fs.readFileSync(abs, 'utf8') } catch { return addItem(rel, fp) && 1 }
    const parts = splitMarkdown(text)
    const relHash = crypto.createHash('sha256').update(rel).digest('hex').slice(0, 8)
    const dirName = relHash + '-' + fp.hash.slice(7, 15)
    const dir = path.join(chunksDir, dirName)
    try {
      fs.mkdirSync(chunksDir, { recursive: true })
      for (const d of fs.readdirSync(chunksDir)) {
        if (d.startsWith(relHash + '-') && d !== dirName) fs.rmSync(path.join(chunksDir, d), { recursive: true, force: true })
      }
      fs.mkdirSync(dir, { recursive: true })
      const width = String(parts.length).length
      parts.forEach((p, i) => {
        const file = path.join(dir, String(i + 1).padStart(width, '0') + '.md')
        fs.writeFileSync(file, p.body, 'utf8')
        addItem(rel, fp, { chunk: { idx: i + 1, total: parts.length, file } })
      })
    } catch (e) {
      logger.warn(`dsh-kb: 分片落盘失败，整文件入队：${(e && e.message) || e}`)
      return addItem(rel, fp) && 1
    }
    return parts.length
  }

  /** 同素材旧版本（hash 不同）的未完结条目全部让位。 */
  function supersede(rel, fp) {
    for (const it of items) {
      if (it.rel === rel && it.hash !== fp.hash && (it.status === 'queued' || it.status === 'failed')) {
        it.status = 'skipped'; it.finishedAt = nowIso(); it.note = '素材在磁盘被覆盖（raw 不可变），由新记录接替'
        logger.warn(`dsh-kb: raw 素材被磁盘直写覆盖（违反不可变约定），重新入队：${rel}`)
      }
    }
  }

  /** 单文件入队入口（upload 钩子 / 手动）。已跟踪且未变化时静默跳过。 */
  function offer(rel) {
    rel = String(rel || '').replace(/\\/g, '/').replace(/\/+$/, '')
    if (!rel.startsWith(RAW_PREFIX)) return { ok: false, reason: 'not-in-raw' }
    const abs = path.join(rootAbs, ...rel.split('/'))
    let fp
    try { fp = fingerprint(abs) } catch (e) {
      if (e && e.code === 'ENOENT') return { ok: false, reason: 'missing' }
      throw e
    }
    const prev = latestByRel(rel)
    if (prev && prev.hash === fp.hash && prev.status !== 'skipped') return { ok: true, dedup: true, item: prev }
    supersede(rel, fp)
    const added = admit(rel, fp)
    persist()
    kick()
    return { ok: true, added }
  }

  /** 全量对账扫描：新文件入队、变更重排、消失标记、台账丢失时按 wiki sources 防重入。 */
  function scan() {
    const files = []
    core.walkFiles(path.join(rootAbs, core.RAW_DIR), files, 5000)
    const onDisk = new Map()
    for (const abs of files) onDisk.set(path.relative(rootAbs, abs).split(path.sep).join('/'), abs)

    let cited = null
    const unknown = [...onDisk.keys()].filter((rel) => !latestByRel(rel))
    if (unknown.length) cited = collectWikiSources(rootAbs)

    let added = 0
    for (const [rel, abs] of onDisk) {
      const prev = latestByRel(rel)
      if (!prev) {
        if (cited && cited.has(rel)) continue // 台账没记录但 wiki 已引用 → 视为已加工
        try { added += admit(rel, fingerprint(abs)) } catch { /* stat 竞态忽略 */ }
        continue
      }
      if (prev.status === 'done' || prev.status === 'skipped') {
        let fp
        try { fp = fingerprint(abs) } catch { continue }
        if (fp.hash !== prev.hash) { supersede(rel, fp); added += admit(rel, fp) } // 磁盘直写覆盖终态素材 → 更新重排
        continue
      }
      // queued/running/failed：仅探测「覆盖」，不重复入队（offer 已处理多数场景）
      let fp
      try { fp = fingerprint(abs) } catch { continue }
      if (fp.hash !== prev.hash && prev.status !== 'running') {
        supersede(rel, fp)
        added += admit(rel, fp)
      }
    }
    for (const it of items) {
      if ((it.status === 'queued' || it.status === 'running' || it.status === 'failed') && !onDisk.has(it.rel)) {
        it.status = 'skipped'; it.finishedAt = nowIso(); it.note = 'raw 素材已不存在'
      }
    }
    if (added) { persist(); kick() }
    return { added, scanned: onDisk.size }
  }

  // ── 状态迁移 API ────────────────────────────────────────
  function setPaused(v) { paused = v === true; persist(); if (!paused) kick() }
  function retry(id) {
    const it = byId(id)
    if (!it) return { ok: false, reason: 'no-item' }
    if (it.status !== 'failed' && it.status !== 'skipped' && it.status !== 'done') return { ok: false, reason: 'bad-status' }
    if (it.status === 'skipped' && it.note && it.note.includes('覆盖')) return { ok: false, reason: 'superseded' }
    it.status = 'queued'; it.attempts = 0; it.error = null; it.retryAt = null; it.finishedAt = null; it.startedAt = null
    executorDown = false
    persist(); kick()
    return { ok: true, item: it }
  }
  function cancel(id) {
    const it = byId(id)
    if (!it) return { ok: false, reason: 'no-item' }
    if (it.status !== 'queued') return { ok: false, reason: 'bad-status' }
    it.status = 'skipped'; it.finishedAt = nowIso(); it.note = '已取消'
    persist()
    return { ok: true, item: it }
  }

  // ── 串行 worker ─────────────────────────────────────────
  function kick() {
    if (kicked) return
    kicked = true
    setTimeout(() => { kicked = false; tick().catch((e) => logger.error(`dsh-kb: 队列 worker 异常：${(e && e.stack) || e}`)) }, 0).unref?.()
  }

  function pick() {
    const now = Date.now()
    let nextRetry = Infinity
    let picked = null
    for (const it of items) {
      if (it.status !== 'queued') continue
      const rt = it.retryAt ? Date.parse(it.retryAt) : 0
      if (rt > now) { nextRetry = Math.min(nextRetry, rt); continue }
      if (!picked || Date.parse(it.enqueuedAt) < Date.parse(picked.enqueuedAt)) picked = it
    }
    return { picked, nextRetry: nextRetry === Infinity ? null : nextRetry }
  }

  function scheduleRetryWake(nextRetry) {
    if (!nextRetry || retryTimer) return
    retryTimer = setTimeout(() => { retryTimer = null; kick() }, Math.max(0, nextRetry - Date.now()) + 5).unref?.()
  }

  async function runItem(item) {
    // 非文本素材（PDF/图片等）：照常入队可见，pick 到时跳过，人工仍可 @ agent 处理
    const ext = path.extname(item.rel).slice(1).toLowerCase()
    if (!core.TEXT_EXT.has(ext)) {
      item.status = 'skipped'; item.finishedAt = nowIso()
      item.note = '非文本素材，不做自动蒸馏（可手动 @ 给 agent 处理）'
      persist()
      return 'skipped'
    }
    const lim = limits()
    item.status = 'running'; item.startedAt = nowIso(); item.attempts++; item.sessionId = null; item.error = null
    persist()

    const before = wikiSnapshot(rootAbs)
    const ctrl = new AbortController()
    let aborted = null
    let settled = false
    const runP = (async () => {
      const res = await runner(item, { signal: ctrl.signal })
      settled = true
      return res || {}
    })()
    runP.catch(() => {})
    const timer = setTimeout(() => { aborted = new Error(`超时（${Math.round(lim.timeoutMs / 60000)} 分钟）`); ctrl.abort(new Error('timeout')) }, lim.timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()

    let res
    try {
      res = await Promise.race([
        runP,
        (async () => { const { signal } = ctrl; if (signal.aborted) throw aborted || new Error('aborted'); await new Promise((_, rej) => signal.addEventListener('abort', () => rej(aborted || new Error('aborted')), { once: true })) })(),
      ])
    } catch (e) {
      // ExecutorUnavailable：不计失败，回 queued，worker 停摆等配置修复
      if (e instanceof ExecutorUnavailableError) {
        clearTimeout(timer)
        item.status = 'queued'; item.attempts--; item.startedAt = null; item.retryAt = null; item.error = null
        executorDown = true; lastError = e.message
        persist()
        return 'down'
      }
      if (!settled) {
        clearTimeout(timer)
        // runner 未随 abort 结束：给一段宽限，仍不结束则丢弃（记 warning 后继续，避免卡死队列）
        const grace = sleep(Math.min(60 * 1000, lim.timeoutMs))
        await Promise.race([runP.catch(() => {}), grace])
        if (!settled) logger.warn(`dsh-kb: 超时后 runner 未终止，已放弃等待：${item.rel}`)
        finalizeFailure(item, aborted && aborted.message === `超时（${Math.round(lim.timeoutMs / 60000)} 分钟）` ? aborted.message : String((e && e.message) || e), lim)
        return 'failed'
      }
      clearTimeout(timer)
      finalizeFailure(item, String((e && e.message) || e), lim)
      return 'failed'
    }
    clearTimeout(timer)
    executorDown = false

    // 产出验证双路：runner JSON pages ∪ wiki diff
    const after = wikiSnapshot(rootAbs)
    const diffPages = diffWiki(before, after).filter((rel) => rel.startsWith(WIKI_PREFIX))
    const tail = extractJsonTail(res.tail || res.output || '')
    const claimed = []
    for (const p of (Array.isArray(res.pages) ? res.pages : tail ? tail.pages : [])) {
      const rel = String(p).trim().replace(/^\.\//, '').replace(/\\/g, '/')
      if (!rel.startsWith(WIKI_PREFIX)) continue
      if (after.has(rel) && !claimed.includes(rel)) claimed.push(rel)
    }
    const pages = claimed.slice()
    for (const rel of diffPages) if (!pages.includes(rel)) pages.push(rel)

    if (!pages.length) {
      finalizeFailure(item, 'no output detected（无 JSON 结论且 wiki 无变更）' + (res.diag ? `；diag: ${res.diag}` : ''), lim)
      return 'failed'
    }
    item.status = 'done'; item.finishedAt = nowIso()
    item.pages = pages
    item.note = (res.summary || (tail && tail.summary) || '').slice(0, 300)
    persist()
    return 'done'
  }

  function finalizeFailure(item, message, lim) {
    if (item.attempts >= lim.maxAttempts) {
      item.status = 'failed'; item.finishedAt = nowIso(); item.error = String(message).slice(0, 4000)
    } else {
      item.status = 'queued'
      item.retryAt = new Date(Date.now() + RETRY_BASE_MS * item.attempts).toISOString()
      item.error = String(message).slice(0, 4000)
    }
    persist()
  }

  async function tick() {
    if (busy) return
    busy = true
    try {
      for (;;) {
        if (paused || externallyPaused()) break
        if (pendingScan) { pendingScan = false; try { scan() } catch (e) { logger.warn(`dsh-kb: 队列扫描失败：${(e && e.message) || e}`) } }
        const { picked, nextRetry } = pick()
        if (!picked) { scheduleRetryWake(nextRetry); break }
        const outcome = await runItem(picked)
        if (outcome === 'down') break
      }
    } finally {
      busy = false
    }
  }

  // ── 启动恢复与快照 ──────────────────────────────────────
  function resume() {
    let recovered = 0
    for (const it of items) {
      if (it.status === 'running') {
        it.status = 'queued'; it.startedAt = null; it.retryAt = null
        it.error = '宿主重启时中断，自动重排'
        recovered++
      }
    }
    if (recovered) { persist(); logger.warn(`dsh-kb: 队列恢复，${recovered} 条 running 重排为 queued`) }
  }

  function snapshot() {
    const stats = { queued: 0, running: 0, done: 0, failed: 0, skipped: 0 }
    for (const it of items) if (stats[it.status] !== undefined) stats[it.status]++
    const rank = { running: 0, queued: 1, failed: 2, skipped: 3, done: 4 }
    const list = items
      .slice()
      .sort((a, b) => (rank[a.status] - rank[b.status]) || String(b.finishedAt || b.enqueuedAt).localeCompare(String(a.finishedAt || a.enqueuedAt)))
      .slice(0, 200)
    const active = items.find((it) => it.status === 'running')
    return { paused: paused || externallyPaused(), pausedByUser: paused, executorDown, lastError, stats, active, items: list }
  }

  load()

  return {
    offer, scan, kick, setPaused, retry, cancel, resume, snapshot,
    buildPrompt: (item) => buildDistillPrompt(item),
    get paused() { return paused || externallyPaused() },
    get busy() { return busy },
    _items: items,
  }
}

module.exports = {
  createQueue, ExecutorUnavailableError, buildDistillPrompt, extractJsonTail,
  fingerprint, wikiSnapshot, diffWiki, collectWikiSources, splitMarkdown,
  resolveRouteOverride,
  RETRY_BASE_MS, DONE_KEEP, CHUNK_THRESHOLD, CHUNK_TARGET,
}
