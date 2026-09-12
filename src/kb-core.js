'use strict'

/**
 * @weibaohui/dsh-kb — kb-core
 *
 * 与宿主无关的「团队知识库」核心：
 *  - 一个固定 root 目录（默认 ~/.dsh/kb，DSH_KB_ROOT 可覆盖）作为知识库根；
 *  - 骨架自举：raw/（原始素材，不可变）+ wiki/{howtos,decisions,postmortems}/
 *    + index.md（目录）+ log.md（操作流水）+ schema.md（agent 规则）；
 *  - resolveSafe 家族保证所有磁盘路径都落在 root 内（词法边界 + 符号链接真实路径边界）；
 *  - 搜索：内置全文扫描（纯 JS，零外部依赖，文本类型文件、大小与命中数有上限）；
 *  - 写路径两条：上传到 raw/ 下（拒绝覆盖）+ 库约定 schema.md 的人工编辑
 *   （readSchema/writeSchema，白名单只此一个文件）。wiki 编辑收口在 agent（见 skill/dsh-kb）。
 *
 * 目录约定沿用 Karpathy LLM Wiki 模式：Raw(不可变) → Wiki(成文) → Schema(规则)，
 * 人丢素材、agent 加工维护，详见 skill/dsh-kb/SKILL.md。
 */

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const VERSION = '0.2.0'

const RAW_DIR = 'raw'
const WIKI_DIR = 'wiki'
const SCHEMA_FILE = 'schema.md'
const SCHEMA_MAX_BYTES = 256 * 1024       // 库约定编辑保存上限
const BOOT_DIRS = [RAW_DIR, path.join(WIKI_DIR, 'howtos'), path.join(WIKI_DIR, 'decisions'), path.join(WIKI_DIR, 'postmortems'), path.join(WIKI_DIR, 'notes')]
const BOOT_FILES = ['index.md', 'log.md', 'schema.md']

const MAX_LIST_ENTRIES = 5000
const MAX_DOC_BYTES = 8 * 1024 * 1024      // /doc 文本读取上限
const SEARCH_MAX_HITS = 300
const SEARCH_MAX_FILES = 20000
const SEARCH_SCAN_MAX_BYTES = 1.5 * 1024 * 1024
const UPLOAD_MAX_BYTES = Number(process.env.DSH_KB_MAX_MB > 0 ? process.env.DSH_KB_MAX_MB : 200) * 1024 * 1024

const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'log', 'csv', 'tsv', 'xml', 'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'ts', 'py', 'rb', 'go', 'rs', 'java', 'c', 'h', 'sh', 'bash', 'zsh', 'sql', 'properties'])

/** 业务错误：带 HTTP status，路由层原样转 JSON。 */
class KbError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function statOrThrow(abs, missingStatus = 404) {
  try {
    return fs.statSync(abs)
  } catch (e) {
    if (e && e.code === 'ENOENT') throw new KbError(missingStatus, `不存在: ${path.basename(abs)}`)
    if (e && (e.code === 'EACCES' || e.code === 'EPERM')) throw new KbError(403, `无权限: ${path.basename(abs)}`)
    throw e
  }
}

/** root 规范化：存在且必须是目录（不存在时由 bootstrap 创建后再进来）。 */
function ensureRoot(root) {
  if (typeof root !== 'string' || root.trim() === '') throw new KbError(500, '知识库根目录未配置')
  const r = path.resolve(root)
  const st = statOrThrow(r, 500)
  if (!st.isDirectory()) throw new KbError(500, '知识库根不是目录')
  return r
}

/** 词法边界：rel 解析后必须仍在 rootAbs 内；拒绝绝对路径与 NUL。 */
function lexicalAbs(rootAbs, rel) {
  const relStr = typeof rel === 'string' && rel !== '' ? rel : '.'
  if (relStr.includes('\0')) throw new KbError(400, '非法路径')
  if (path.isAbsolute(relStr)) throw new KbError(400, '不允许绝对路径')
  const abs = path.resolve(rootAbs, relStr)
  const relChk = path.relative(rootAbs, abs)
  if (relChk === '..' || relChk.startsWith('..' + path.sep)) throw new KbError(400, '路径越界')
  return abs
}

function insideReal(realRoot, realTarget) {
  const r = path.relative(realRoot, realTarget)
  return !(r === '..' || r.startsWith('..' + path.sep))
}

/** 取「已存在路径」的真实（符号链接解析后）最近祖先。 */
function realAncestor(abs) {
  let p = abs
  for (;;) {
    try {
      return fs.realpathSync(p)
    } catch {
      const parent = path.dirname(p)
      if (parent === p) throw new KbError(500, '无法解析路径祖先')
      p = parent
    }
  }
}

/** 解析已存在条目；符号链接逃逸出 root 一律拒绝。 */
function resolveExisting(root, rel, kind = 'any') {
  const rootAbs = ensureRoot(root)
  const abs = lexicalAbs(rootAbs, rel)
  const st = statOrThrow(abs)
  if (kind === 'file' && !st.isFile()) throw new KbError(400, '不是文件')
  if (kind === 'dir' && !st.isDirectory()) throw new KbError(400, '不是目录')
  const realRoot = fs.realpathSync(rootAbs)
  const real = fs.realpathSync(abs)
  if (!insideReal(realRoot, real)) throw new KbError(400, '符号链接越界')
  return abs
}

/** 解析「待创建」路径（父链必须真实落在 root 内）。 */
function resolveCreatable(root, rel) {
  const rootAbs = ensureRoot(root)
  const abs = lexicalAbs(rootAbs, rel)
  const realRoot = fs.realpathSync(rootAbs)
  const anc = realAncestor(abs)
  if (!insideReal(realRoot, anc)) throw new KbError(400, '路径越界')
  return abs
}

function cleanSegment(raw, what = '名称') {
  const clean = path.basename(String(raw || '').replace(/\\/g, '/')).trim()
  if (!clean || clean === '.' || clean === '..') throw new KbError(400, `非法${what}`)
  return clean
}

/** 列目录：dirs 在前、名称按中文习惯排序。 */
function listDir(root, rel) {
  const abs = resolveExisting(root, rel, 'dir')
  const entries = []
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    let type = ent.isDirectory() ? 'dir' : null
    const full = path.join(abs, ent.name)
    try {
      const s = fs.statSync(full) // 跟随符号链接
      if (s.isDirectory()) type = 'dir'
      else if (s.isFile()) type = 'file'
      if (!type) continue
      entries.push({ name: ent.name, type, size: type === 'file' ? s.size : null, mtime: Math.round(s.mtimeMs) })
    } catch {
      continue
    }
    if (entries.length >= MAX_LIST_ENTRIES) break
  }
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, 'zh')
  })
  return entries
}

/** 极简 frontmatter 解析：key: value / key: [a, b] / 引号字符串。 */
function parseFrontmatter(text) {
  const src = String(text || '')
  if (!src.startsWith('---')) return { data: null, body: src }
  const end = src.indexOf('\n---', 3)
  if (end < 0) return { data: null, body: src }
  const head = src.slice(3, end).replace(/^\r?\n/, '')
  // 去掉闭合 --- 的换行与其后至多一个空行
  const body = src.slice(end + 4).replace(/^\r?\n/, '').replace(/^\r?\n/, '')
  const data = {}
  for (const line of head.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1]
    let val = m[2].trim()
    if (val.startsWith('[') && val.endsWith(']')) {
      const inner = val.slice(1, -1).trim()
      data[key] = inner ? inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : []
    } else {
      data[key] = val.replace(/^["']|["']$/g, '')
    }
  }
  return { data: Object.keys(data).length ? data : null, body }
}

/** 读文本文件：md 解析 frontmatter；超限/二进制给元数据由客户端走下载或 @。 */
function readDoc(root, rel) {
  const abs = resolveExisting(root, rel, 'file')
  const st = fs.statSync(abs)
  const ext = path.extname(abs).slice(1).toLowerCase()
  const base = { rel: path.relative(ensureRoot(root), abs).split(path.sep).join('/'), name: path.basename(abs), size: st.size, mtime: Math.round(st.mtimeMs), ext }
  if (TEXT_EXT.has(ext) && st.size <= MAX_DOC_BYTES) {
    const text = fs.readFileSync(abs, 'utf8')
    if (ext === 'md' || ext === 'markdown') {
      const { data, body } = parseFrontmatter(text)
      return { ...base, kind: 'md', frontmatter: data, body }
    }
    return { ...base, kind: 'text', frontmatter: null, body: text }
  }
  return { ...base, kind: 'binary', frontmatter: null, body: null }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.log': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.zip': 'application/zip', '.gz': 'application/gzip',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm',
}

function contentType(abs) {
  return MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream'
}

/** 原始字节流（图片/附件预览与下载）。 */
function sendFile(res, root, rel, download) {
  const abs = resolveExisting(root, rel, 'file')
  const st = fs.statSync(abs)
  const name = path.basename(abs)
  res.writeHead(200, {
    'content-type': contentType(abs),
    'content-length': st.size,
    'content-disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`,
    'cache-control': 'no-store',
  })
  const rs = fs.createReadStream(abs)
  rs.on('error', () => { try { res.destroy() } catch {} })
  rs.pipe(res)
}

function walkFiles(dirAbs, out, cap) {
  let entries
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true })
  } catch {
    return
  }
  for (const ent of entries) {
    if (out.length >= cap) return
    const full = path.join(dirAbs, ent.name)
    if (ent.isDirectory()) walkFiles(full, out, cap)
    else if (ent.isFile()) out.push(full)
  }
}

/**
 * 搜索：内置全文扫描（大小写不敏感子串匹配）。
 * FDE 知识库量级（数百~数千篇）下毫秒到秒级；同步执行，量级可控
 * （单文件 ≤1.5MB、仅文本类型、命中 ≤300、扫描文件 ≤2 万）。
 * 返回按文件分组的命中。
 */
function search(root, query) {
  const rootAbs = ensureRoot(root)
  const q = String(query || '').trim().toLowerCase()
  if (!q) throw new KbError(400, '缺少搜索词')
  const started = Date.now()
  const files = []
  walkFiles(rootAbs, files, SEARCH_MAX_FILES)
  const hits = []
  let scanned = 0
  let matchCount = 0
  for (const abs of files) {
    if (matchCount >= SEARCH_MAX_HITS) break
    let st
    try { st = fs.statSync(abs) } catch { continue }
    if (st.size > SEARCH_SCAN_MAX_BYTES) continue
    const ext = path.extname(abs).slice(1).toLowerCase()
    if (!TEXT_EXT.has(ext)) continue
    let text
    try { text = fs.readFileSync(abs, 'utf8') } catch { continue }
    scanned++
    const lines = text.split(/\r?\n/)
    const rel = path.relative(rootAbs, abs).split(path.sep).join('/')
    const item = { rel, name: path.basename(abs), lines: [] }
    for (let i = 0; i < lines.length && item.lines.length < 5; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        item.lines.push({ line: i + 1, text: lines[i].slice(0, 400) })
        matchCount++
        if (matchCount >= SEARCH_MAX_HITS) break
      }
    }
    if (item.lines.length) hits.push(item)
  }
  return { hits, query: String(query || '').trim(), durationMs: Date.now() - started, total: hits.length, scanned }
}

/** 上传（唯一写路径）：dir 必须位于 raw/ 之下；拒绝覆盖；临时文件 + 原子 rename。 */
async function uploadRaw(req, root, dirRel, rawName) {
  const rootAbs = ensureRoot(root)
  const dir = String(dirRel || RAW_DIR).replace(/\/+$/, '')
  if (dir !== RAW_DIR && !dir.startsWith(RAW_DIR + '/')) throw new KbError(403, '只允许上传到 raw/（原始素材区）')
  const dirAbs = resolveCreatable(rootAbs, dir)
  fs.mkdirSync(dirAbs, { recursive: true })
  const clean = cleanSegment(rawName, '文件名')
  const target = path.join(dirAbs, clean)
  if (fs.existsSync(target)) throw new KbError(409, '同名文件已存在（raw 不可变，请改名后重传）')
  const tmp = `${target}.dsh-tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
  let received = 0
  const out = fs.createWriteStream(tmp, { flags: 'wx' })
  try {
    for await (const chunk of req) {
      received += chunk.length
      if (received > UPLOAD_MAX_BYTES) {
        out.destroy()
        throw new KbError(413, `超过大小上限 ${UPLOAD_MAX_BYTES} 字节`)
      }
      if (!out.write(chunk)) {
        await new Promise((resolve, reject) => {
          out.once('drain', resolve)
          out.once('error', reject)
        })
      }
    }
    await new Promise((resolve, reject) => {
      out.end(() => resolve())
      out.on('error', reject)
    })
    fs.renameSync(tmp, target)
    return { dir: dir, name: clean, size: received }
  } catch (e) {
    try { out.destroy() } catch {}
    try { fs.rmSync(tmp, { force: true }) } catch {}
    throw e
  }
}

function countFiles(rootAbs, sub) {
  const files = []
  walkFiles(path.join(rootAbs, sub), files, 5000)
  return files.length
}

/** 状态负载。 */
function statusPayload(root) {
  const rootAbs = ensureRoot(root)
  return {
    ok: true,
    version: VERSION,
    root: rootAbs,
    counts: { raw: countFiles(rootAbs, RAW_DIR), wiki: countFiles(rootAbs, WIKI_DIR) },
    maxBytes: UPLOAD_MAX_BYTES,
  }
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

const BOOT_SCHEMA = `---
title: KB 约定（schema）
updated: ${today()}
---

# KB 约定

本目录是团队知识库（FDE 离线盒子）。人机共写：人往 raw/ 丢素材，agent 按 schema 加工成文、维护 index。

## 目录

- \`raw/\` 原始素材，**不可变**：任何情况下不得修改或删除（log/现场证据要回溯）
- \`wiki/howtos/\` 操作手册：症状 → 原因 → 步骤 → 验证
- \`wiki/decisions/\` 决策记录：背景 → 选项 → 结论 → 后果
- \`wiki/postmortems/\` 复盘：时间线 → 根因 → 改进项
- \`wiki/notes/\` 读书摘记/成书笔记：教材、书籍、长文等不成 howto/decision/postmortem 形态的素材
- \`index.md\` 目录：每篇成文必须挂进对应小节
- \`log.md\` 操作流水：每次加工追加一行

## 页面规范

- 文件名 kebab-case 英文；frontmatter 必填：\`title / tags / keywords / author / created / updated\`
- \`keywords\`: 3~8 个检索关键词（metadata 区块的一部分，人查库与 agent 回溯都靠它）
- \`sources\`: [raw/...] 原始素材位置；有分片/章节等属性时加 \`source-note: 类型｜范围｜分片\`（如 \`书籍分片｜第一集 18~26 章｜3/49\`）
- 读到产出文件时：从 frontmatter \`sources\` 回溯原始素材位置，需要细节直接回读原文
- 互链用 \`[[页面名]]\`；**矛盾必须显式化**：新内容与已有条目矛盾时，两个页面都要标注「⚠️ 与 [[对方]] 矛盾」并说明适用环境差异（客户环境经常不同，救火时拿错方案是要出事的）
- 不确定的内容写进页面末尾「待确认」小节，不要编

## 加工流程（两步）

1. **分析**：读 raw 素材，列出关键实体/步骤，对照 wiki 已有条目找出关联与矛盾
2. **生成**：写/更新 wiki 页面 → index.md 挂链接 → log.md 追加一行；raw 原样保留并在 sources 里引用

## 并发与身份

- index.md/log.md **先读后写**：写入前重新读最新文件再追加，写完确认自己的行还在（其他会话可能同时入库）
- author：宿主有登录身份就用；否则本会话第一次写入前问一次，之后记住

## log.md 行格式

\`\`\`
- YYYY-MM-DD HH:mm <author> <新增|更新|标注矛盾> <wiki 路径> ← <raw 路径>
\`\`\`

## 自动蒸馏（v0.2+）

- 插件内置自动蒸馏：新入 raw/ 的素材自动入队，由 kb-bot 会话按本 schema 逐个加工（串行）
- log.md 中 author 为 \`kb-bot\` 的行来自自动队列；交互会话不必重复加工已入队素材（以队列为准）
- 队列台账在 \`~/.dsh/dsh-kb/queue.json\`（插件运行时状态，不在本库内）
- kb-bot 加工的页面 author 一律 \`kb-bot\`；人工纠错照常更新页面并把 author 写自己
`

const BOOT_INDEX = `---
title: 知识库目录
updated: ${today()}
---

# 知识库

> 找东西用搜索（🔍）最快；新条目加工后请在对应小节挂链接。

## Howtos

（暂无）

## Decisions

（暂无）

## Postmortems

（暂无）
`

const BOOT_LOG = `# 操作流水

<!-- 格式：- YYYY-MM-DD HH:mm <author> <新增|更新|标注矛盾> <wiki 路径> ← <raw 路径> -->
`

/**
 * 库约定（schema.md，每库一份）读写：人工编辑入口的受控写路径。
 * 约定是 kb-bot 自动蒸馏与交互 agent 加工的最终权威——每库改自己的，
 * 互不影响；白名单固定 schema.md（软链越界拒绝），原子写。
 */
function readSchema(root) {
  try {
    const abs = resolveExisting(root, SCHEMA_FILE, 'file')
    return { exists: true, text: fs.readFileSync(abs, 'utf8') }
  } catch (e) {
    if (e instanceof KbError && e.status === 404) return { exists: false, text: BOOT_SCHEMA }
    throw e
  }
}

function writeSchema(root, text) {
  if (typeof text !== 'string' || !text.trim()) throw new KbError(400, '约定内容不能为空')
  const body = Buffer.from(text, 'utf8')
  if (body.length > SCHEMA_MAX_BYTES) throw new KbError(413, `超过大小上限 ${SCHEMA_MAX_BYTES} 字节`)
  const abs = resolveCreatable(root, SCHEMA_FILE)
  const tmp = `${abs}.dsh-tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
  try {
    fs.writeFileSync(tmp, body)
    fs.renameSync(tmp, abs)
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }) } catch {}
    throw e
  }
  return { size: body.length }
}

/** 骨架自举：目录 + 三个约定文件，已存在的一律不覆盖。返回新建内容列表。 */
function bootstrap(root, logger = { info() {}, warn() {} }) {
  const rootAbs = ensureRoot(root)
  const created = []
  for (const rel of BOOT_DIRS) {
    const abs = path.join(rootAbs, rel)
    if (!fs.existsSync(abs)) {
      fs.mkdirSync(abs, { recursive: true })
      created.push(rel + '/')
    }
  }
  const contents = { 'index.md': BOOT_INDEX, 'log.md': BOOT_LOG, 'schema.md': BOOT_SCHEMA }
  for (const name of BOOT_FILES) {
    const abs = path.join(rootAbs, name)
    if (!fs.existsSync(abs)) {
      fs.writeFileSync(abs, contents[name], 'utf8')
      created.push(name)
    }
  }
  if (created.length) logger.info(`dsh-kb: 知识库骨架就绪 ${rootAbs}（新建 ${created.join(', ')}）`)
  return created
}

// ── 版本历史（wiki 快照，存知识库根之外：~/.dsh/dsh-kb/history/<kbId>/<rel>/<ts>.md） ──
// wiki 由 agent/人共写且不经插件 API，无法在写路径上挂钩子——用 wiki/ 目录监视
// 对内容变化做快照（与最新快照逐字比对，内容没变不入版本），上限单文件 1MB、每文件 50 份。
const SNAP_MAX_BYTES = 1024 * 1024
const SNAP_KEEP = 50
const SNAP_EXTS = new Set(['md', 'markdown', 'txt'])

/** 只接受 wiki/ 下的相对路径；其余（含越界尝试）返回 null。 */
function safeWikiRel(rel) {
  const r = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!r.startsWith(WIKI_DIR + '/') || r.split('/').includes('..') || r.includes('\0')) return null
  return r
}

let snapSeq = 0
function snapTs() {
  // 秒级时间戳 + 进程内单调序号:同一秒内多次快照也能保证字典序=时间序
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '-') + String(++snapSeq % 100000).padStart(5, '0') + crypto.randomBytes(2).toString('hex')
}

function snapDirFor(histKbDir, rel) {
  return path.join(histKbDir, ...String(rel).split('/'))
}

/** 快照一个知识库的 wiki/ 树：内容有变化的文件各写入一个新版本，并淘汰超量旧版本。 */
function snapWikiTree(rootAbs, histKbDir) {
  const files = []
  walkFiles(path.join(rootAbs, WIKI_DIR), files, 2000)
  let snapped = 0
  for (const abs of files) {
    const rel = path.relative(rootAbs, abs).split(path.sep).join('/')
    const ext = path.extname(abs).slice(1).toLowerCase()
    if (!SNAP_EXTS.has(ext)) continue
    let text
    try {
      if (fs.statSync(abs).size > SNAP_MAX_BYTES) continue
      text = fs.readFileSync(abs, 'utf8')
    } catch { continue }
    const dir = snapDirFor(histKbDir, rel)
    try {
      const vers = fs.readdirSync(dir).sort()
      if (vers.length && fs.readFileSync(path.join(dir, vers[vers.length - 1]), 'utf8') === text) continue
    } catch { /* 首次快照 */ }
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, snapTs() + '.' + ext), text, 'utf8')
      snapped++
      const vers = fs.readdirSync(dir).sort()
      if (vers.length > SNAP_KEEP) for (const f of vers.slice(0, vers.length - SNAP_KEEP)) fs.rmSync(path.join(dir, f), { force: true })
    } catch { /* 单文件失败忽略 */ }
  }
  return { snapped }
}

/** 某个 wiki 文件的版本列表（新→旧）。 */
function listSnapshots(histKbDir, rel) {
  const r = safeWikiRel(rel)
  if (!r) throw new KbError(400, '仅支持 wiki/ 下文件的历史')
  let vers = []
  try {
    vers = fs.readdirSync(snapDirFor(histKbDir, r)).filter((f) => /^\d{8}T\d{6}-[0-9a-f]+\./.test(f)).sort()
  } catch { /* 无历史 */ }
  return vers.reverse().map((f) => {
    let size = 0
    try { size = fs.statSync(path.join(snapDirFor(histKbDir, r), f)).size } catch {}
    return { ts: f, size }
  })
}

/** 读某个版本的文本内容。 */
function readSnapshot(histKbDir, rel, ts) {
  const r = safeWikiRel(rel)
  if (!r) throw new KbError(400, '仅支持 wiki/ 下文件的历史')
  if (!/^\d{8}T\d{6}-[0-9a-f]+(\.(md|markdown|txt))?$/.test(String(ts || ''))) throw new KbError(400, '非法版本号')
  const dir = snapDirFor(histKbDir, r)
  let name = String(ts)
  if (!/\.(md|markdown|txt)$/.test(name)) {
    const cand = fs.readdirSync(dir).filter((f) => f.startsWith(name))
    if (!cand.length) throw new KbError(404, '版本不存在')
    name = cand[0]
  }
  try {
    return fs.readFileSync(path.join(dir, name), 'utf8')
  } catch {
    throw new KbError(404, '版本不存在')
  }
}

/** 恢复版本：把快照内容写回当前 wiki 文件（受控写路径，仅 wiki/）。 */
function restoreSnapshot(root, histKbDir, rel, ts) {
  const r = safeWikiRel(rel)
  if (!r) throw new KbError(400, '仅支持恢复 wiki/ 下文件')
  const text = readSnapshot(histKbDir, rel, ts)
  const abs = resolveCreatable(root, r)
  fs.writeFileSync(abs, text, 'utf8')
  return { rel: r, size: Buffer.byteLength(text) }
}

// ── 页面反馈（追加进本库 wiki/meta/feedback.md，agent 处理后标 [done]） ──
function appendFeedback(root, rel, note) {
  const r = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!r || r.split('/').includes('..') || r.includes('\0')) throw new KbError(400, '非法页面路径')
  const clean = String(note || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 500)
  if (!clean) throw new KbError(400, '反馈内容不能为空')
  const metaDir = resolveCreatable(root, path.join(WIKI_DIR, 'meta'))
  fs.mkdirSync(metaDir, { recursive: true })
  const file = path.join(metaDir, 'feedback.md')
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch (e) { if (!(e && e.code === 'ENOENT')) throw e }
  if (!text) text = '# 页面反馈\n\n<!-- 阅读页「⚠️ 反馈」写入；agent 处理完把 [open] 改 [done] -->\n'
  const line = `- ${today()} ${new Date().toTimeString().slice(0, 5)} [open] ${r} — ${clean}`
  fs.writeFileSync(file, text.replace(/\n*$/, '\n') + line + '\n', 'utf8')
  return { feedback: path.relative(ensureRoot(root), file).split(path.sep).join('/'), line }
}

// ── 多知识库注册表 ───────────────────────────────────────────
const REGISTRY_VERSION = 1

/** 读注册表（文件缺失/损坏返回空表；损坏不备份——注册表可随时重建）。 */
function loadKbRegistry(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (data && data.version === REGISTRY_VERSION && Array.isArray(data.kbs)) {
      const kbs = data.kbs.filter((k) => k && k.id && typeof k.root === 'string' && k.root)
      return { version: REGISTRY_VERSION, kbs }
    }
  } catch { /* 缺失按空表 */ }
  return { version: REGISTRY_VERSION, kbs: [] }
}

/** 原子写注册表。 */
function saveKbRegistry(file, data) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1), 'utf8')
  fs.renameSync(tmp, file)
}

function newKbId() {
  return 'kb-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex')
}

/** 新库根目录校验：绝对路径、目录不存在时自动创建（recursive）、不为 / 或用户主目录本身。返回 {ok, abs|error}。 */
function normalizeKbRoot(root, home) {
  const raw = String(root || '').trim()
  if (!raw) return { ok: false, error: '路径不能为空' }
  if (raw.includes('\0')) return { ok: false, error: '非法路径' }
  const abs = path.resolve(raw.replace(/^~(?=\/|$)/, home || ''))
  if (!path.isAbsolute(abs)) return { ok: false, error: '必须是绝对路径' }
  if (abs === '/' || abs === home) return { ok: false, error: '不能添加整个磁盘或主目录' }
  let st
  try {
    st = fs.statSync(abs)
  } catch (e) {
    if (!(e && e.code === 'ENOENT')) return { ok: false, error: `无法读取目录：${(e && e.message) || e}` }
    try { fs.mkdirSync(abs, { recursive: true }) } catch (e2) {
      return { ok: false, error: `目录不存在且创建失败：${(e2 && e2.message) || e2}` }
    }
    try { st = fs.statSync(abs) } catch (e3) {
      return { ok: false, error: `创建后仍不可读：${abs}` }
    }
  }
  if (!st.isDirectory()) return { ok: false, error: '不是目录' }
  return { ok: true, abs }
}

/** 两根目录是否重叠（互相包含视为重叠）。 */
function kbRootsOverlap(a, b) {
  const ra = path.relative(a, b)
  const rb = path.relative(b, a)
  return ra === '' || rb === '' || (!ra.startsWith('..' + path.sep) && !path.isAbsolute(ra))
}

/** 默认根目录：DSH_KB_ROOT 覆盖，否则 ~/.dsh/kb。 */
function defaultRoot() {
  if (process.env.DSH_KB_ROOT && process.env.DSH_KB_ROOT.trim()) return path.resolve(process.env.DSH_KB_ROOT.trim())
  return path.join(require('node:os').homedir(), '.dsh', 'kb')
}

module.exports = {
  VERSION, KbError,
  RAW_DIR, WIKI_DIR, SCHEMA_FILE, SCHEMA_MAX_BYTES, BOOT_DIRS, BOOT_FILES,
  TEXT_EXT, walkFiles,
  REGISTRY_VERSION, loadKbRegistry, saveKbRegistry, newKbId, normalizeKbRoot, kbRootsOverlap,
  ensureRoot, resolveExisting, resolveCreatable, lexicalAbs, cleanSegment,
  listDir, parseFrontmatter, readDoc, sendFile, search, uploadRaw,
  readSchema, writeSchema,
  safeWikiRel, snapWikiTree, listSnapshots, readSnapshot, restoreSnapshot, appendFeedback,
  SNAP_MAX_BYTES, SNAP_KEEP,
  statusPayload, bootstrap, defaultRoot,
  BOOT_INDEX, BOOT_LOG, BOOT_SCHEMA,
}
