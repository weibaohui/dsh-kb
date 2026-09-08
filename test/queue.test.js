'use strict'

/**
 * @weibaohui/dsh-kb — 自动蒸馏队列单测
 *
 * runner 一律注入假实现（不依赖 agents 服务/真实 LLM）；root 与台账都落
 * os.tmpdir() 沙箱，跑完清理（真实库零接触）。
 */

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const queueCore = require('../src/queue')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 沙箱：root（含 raw/ wiki/ 骨架）+ 独立台账路径，测试结束整体清理。 */
function sandbox(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kbq-'))
  const root = path.join(base, 'kb')
  for (const d of ['raw', path.join('wiki', 'howtos')]) fs.mkdirSync(path.join(root, d), { recursive: true })
  const ledgerFile = path.join(base, 'state', 'queue.json')
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true })
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  return { root, ledgerFile }
}

function writeRaw(root, name, content) {
  const abs = path.join(root, 'raw', name)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content, 'utf8')
  return 'raw/' + name
}

function writeWiki(root, rel, content) {
  const abs = path.join(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content, 'utf8')
}

/** 轮询直到条件成立（worker 全异步，用状态收敛代替延时猜测）。 */
async function until(fn, ms = 4000, what = 'condition') {
  const start = Date.now()
  for (;;) {
    let v
    try { v = fn() } catch { v = false }
    if (v) return v
    if (Date.now() - start > ms) throw new Error(`timeout waiting for ${what}`)
    await sleep(10)
  }
}

/** 可换实现的 runner 壳：测试中按需替换 impl。 */
function swappableRunner(initial) {
  const calls = []
  let impl = initial
  const runner = (item, ctx) => {
    calls.push({ id: item.id, rel: item.rel, phase: 'start' })
    return Promise.resolve(impl(item, ctx)).then((r) => {
      calls.push({ id: item.id, rel: item.rel, phase: 'end' })
      return r
    })
  }
  return { runner, calls, set: (fn) => { impl = fn } }
}

function makeQueue(opts) {
  return queueCore.createQueue({ logger: { info() {}, warn() {}, error() {} }, ...opts })
}

test('resolveRouteOverride：成对生效、缺一或全空回退默认', () => {
  assert.deepStrictEqual(queueCore.resolveRouteOverride('deepseek', 'deepseek-chat'), { provider: 'deepseek', model: 'deepseek-chat' })
  assert.deepStrictEqual(queueCore.resolveRouteOverride(' deepseek ', ' deepseek-chat '), { provider: 'deepseek', model: 'deepseek-chat' }, 'trim 后生效')
  assert.strictEqual(queueCore.resolveRouteOverride('deepseek', ''), null, '只填 provider 不生效')
  assert.strictEqual(queueCore.resolveRouteOverride('', 'deepseek-chat'), null, '只填 model 不生效')
  assert.strictEqual(queueCore.resolveRouteOverride('', ''), null, '全空回退默认')
  assert.strictEqual(queueCore.resolveRouteOverride(undefined, undefined), null)
  assert.strictEqual(queueCore.resolveRouteOverride('  ', '  '), null, '纯空白视同未配置')
})

test('extractJsonTail：取最后一个含 pages 的 JSON 行，忽略前后噪声', () => {
  const text = ['分析中…', '{"other": 1}', '结论如下：', '{"pages": ["wiki/howtos/a.md"], "summary": "好了"}', ''].join('\n')
  const r = queueCore.extractJsonTail(text)
  assert.deepStrictEqual(r.pages, ['wiki/howtos/a.md'])
  assert.strictEqual(r.summary, '好了')
  assert.strictEqual(queueCore.extractJsonTail('没有 json'), null)
})

test('offer：新文件入队；同内容去重；内容变更→旧条目 superseded+新条目', async (t) => {
  const { root, ledgerFile } = sandbox(t)
  const { runner } = swappableRunner(async () => ({}))
  const q = makeQueue({ root, ledgerFile, runner, getLimits: () => ({ timeoutMs: 5000, maxAttempts: 1 }) })
  q.setPaused(true) // 只测入队，不跑

  const rel = writeRaw(root, 'a.md', 'v1')
  const r1 = q.offer(rel)
  assert.strictEqual(r1.ok, true)
  const r2 = q.offer(rel)
  assert.strictEqual(r2.dedup, true)
  assert.strictEqual(q.snapshot().stats.queued, 1)

  // 磁盘直写覆盖（内容变化）→ 旧 skipped，新 queued
  writeRaw(root, 'a.md', 'v2-different-content')
  const r3 = q.offer(rel)
  assert.strictEqual(r3.ok, true && !r3.dedup, '变更应产生新条目')
  const snap = q.snapshot()
  assert.strictEqual(snap.stats.queued, 1)
  assert.strictEqual(snap.stats.skipped, 1)
  const superseded = snap.items.find((it) => it.status === 'skipped')
  assert.ok(superseded.note.includes('覆盖'))
})

test('串行执行：两条目严格顺序完成，不并发', async (t) => {
  const { root, ledgerFile } = sandbox(t)
  const { runner, calls } = swappableRunner(async () => {
    await sleep(40)
    return {}
  })
  const q = makeQueue({ root, ledgerFile, runner, getLimits: () => ({ timeoutMs: 5000, maxAttempts: 1 }) })
  q.offer(writeRaw(root, 'a.md', 'A'))
  q.offer(writeRaw(root, 'b.md', 'B'))
  await until(() => q.snapshot().stats.failed === 2) // 无产出 runner → 两条都终态 failed 即「跑过了」
  const seq = calls.map((c) => c.phase[0])
  // start/end 必须成对交替（s,e,s,e），不允许 s,s
  assert.deepStrictEqual(seq, ['s', 'e', 's', 'e'], `实际顺序: ${seq.join(',')}`)
})

test('done：JSON 尾协议 pages + summary 入账', async (t) => {
  const { root, ledgerFile } = sandbox(t)
  const { runner } = swappableRunner(async (item) => {
    item.sessionId = 'kb-distill-fake' // 真实执行器由 agents.create 的会话 id 设置
    const page = 'wiki/howtos/db-architecture.md'
    writeWiki(root, page, `---\ntitle: DB\ntags: [db]\nauthor: kb-bot\nsources: [${item.rel}]\n---\n正文`)
    return { tail: `分析完成。\n{"pages": ["${page}"], "summary": "数据库架构成文"}` }
  })
  const q = makeQueue({ root, ledgerFile, runner, getLimits: () => ({ timeoutMs: 5000, maxAttempts: 1 }) })
  q.offer(writeRaw(root, 'db.md', '素材'))
  const snap = await until(() => q.snapshot().stats.done === 1 && q.snapshot())
  const item = snap.items.find((it) => it.status === 'done')
  assert.deepStrictEqual(item.pages, ['wiki/howtos/db-architecture.md'])
  assert.strictEqual(item.note, '数据库架构成文')
  assert.ok(item.sessionId && item.sessionId.startsWith('kb-distill-'))
})

test('产出验证兜底：runner 没回 pages 但写了 wiki 文件 → diff 兜底成 done', async (t) => {
  const { root, ledgerFile } = sandbox(t)
  const { runner } = swappableRunner(async () => {
    writeWiki(root, 'wiki/howtos/silent.md', '---\ntitle: s\ntags: [x]\nauthor: kb-bot\n---\n…')
    return {}
  })
  const q = makeQueue({ root, ledgerFile, runner, getLimits: () => ({ timeoutMs: 5000, maxAttempts: 1 }) })
  q.offer(writeRaw(root, 's.md', '素材'))
  const snap = await until(() => q.snapshot().stats.done === 1 && q.snapshot())
  const item = snap.items.find((it) => it.status === 'done')
  assert.deepStrictEqual(item.pages, ['wiki/howtos/silent.md'])
})

test('失败路径：无产出→failed；attempts 耗尽停 failed；retry(id) 复位重跑', async (t) => {
  const { root, ledgerFile } = sandbox(t)
  const { runner } = swappableRunner(async () => ({})) // 永远无产出
  const q = makeQueue({ root, ledgerFile, runner, getLimits: () => ({ timeoutMs: 5000, maxAttempts: 1 }) })
  q.offer(writeRaw(root, 'f.md', '素材'))
  let snap = await until(() => q.snapshot().stats.failed === 1 && q.snapshot())
  const item = snap.items.find((it) => it.status === 'failed')
  assert.ok(item.error.includes('no output detected'))
  assert.strictEqual(item.attempts, 1)

  const r = q.retry(item.id)
  assert.strictEqual(r.ok, true)
  snap = await until(() => {
    const s = q.snapshot()
    const again = s.items.find((it) => it.id === item.id)
    return s.stats.failed === 1 && again.attempts === 1 && s
  }, 4000, 're-run failed again')
  assert.strictEqual(snap.stats.failed, 1)
})

test('退避重试：maxAttempts=2 首败回 queued 带 retryAt，不立即重跑', async (t) => {
  const { root, ledgerFile } = sandbox(t)
  const { runner } = swappableRunner(async () => ({}))
  const q = makeQueue({ root, ledgerFile, runner, getLimits: () => ({ timeoutMs: 5000, maxAttempts: 2 }) })
  q.offer(writeRaw(root, 'b.md', '素材'))
  await until(() => { const s = q.snapshot(); return s.stats.queued === 1 && s.items.find((it) => it.status === 'queued')?.retryAt })
  const item = q.snapshot().items.find((it) => it.status === 'queued')
  assert.strictEqual(item.attempts, 1)
  assert.ok(Date.parse(item.retryAt) > Date.now() + 30 * 1000, '退避应约 60s')
  await sleep(80)
  assert.strictEqual(item.attempts, 1, '退避期内不得重跑')
  // 手动把 retryAt 拨到过去并 kick（生产里由 60s 唤醒定时器做同样的事）→ 应重跑并终局 failed
  item.retryAt = new Date(Date.now() - 10).toISOString()
  q.kick()
  await until(() => q.snapshot().stats.failed === 1)
  assert.strictEqual(q.snapshot().items.find((it) => it.id === item.id).attempts, 2)
})

test('执行器不可用：不计失败、保持 queued、executorDown=true；换可用 runner 后自动恢复', async (t) => {
  const { root, ledgerFile } = sandbox(t)
  const sw = swappableRunner(async () => { throw new queueCore.ExecutorUnavailableError('agents 服务不可用') })
  const q = makeQueue({ root, ledgerFile, runner: sw.runner, getLimits: () => ({ timeoutMs: 5000, maxAttempts: 2 }) })
  q.offer(writeRaw(root, 'x.md', '素材'))
  await until(() => q.snapshot().executorDown === true)
  const snap = q.snapshot()
  assert.strictEqual(snap.stats.queued, 1)
  assert.strictEqual(snap.items[0].attempts, 0, '不可用不烧尝试次数')

  sw.set(async (item) => {
    const page = 'wiki/howtos/recovered.md'
    writeWiki(root, page, 'ok')
    return { pages: [page], summary: '恢复后成功' }
  })
  q.kick()
  const done = await until(() => q.snapshot().stats.done === 1 && q.snapshot())
  assert.strictEqual(done.executorDown, false)
})

test('暂停语义：paused 时不 pick；恢复后继续', async (t) => {
  const { root, ledgerFile } = sandbox(t)
  const { runner } = swappableRunner(async () => ({ pages: [], summary: '' }))
  const q = makeQueue({ root, ledgerFile, runner, getLimits: () => ({ timeoutMs: 5000, maxAttempts: 1 }) })
  q.setPaused(true)
  q.offer(writeRaw(root, 'p.md', '素材'))
  await sleep(80)
  assert.strictEqual(q.snapshot().stats.queued, 1)
  q.setPaused(false)
  await until(() => q.snapshot().stats.failed === 1) // 无产出 runner → failed 即「跑过了」
})

test('重启恢复：台账中 running → resume() 后回 queued', async (t) => {
  const { root, ledgerFile } = sandbox(t)
  const rel = writeRaw(root, 'r.md', '素材')
  fs.writeFileSync(ledgerFile, JSON.stringify({
    version: 1, paused: false, updatedAt: '2026-09-08T00:00:00.000Z',
    items: [{ id: 'dq-x', rel, size: 6, mtime: 1, hash: 'sha256:stale:6', status: 'running', attempts: 1, enqueuedAt: '2026-09-08T00:00:00.000Z', startedAt: '2026-09-08T00:00:01.000Z', finishedAt: null, sessionId: 'kb-distill-dq-x', pages: [], note: '', error: null }],
  }), 'utf8')
  const { runner } = swappableRunner(async () => ({}))
  const q = makeQueue({ root, ledgerFile, runner, getLimits: () => ({ timeoutMs: 5000, maxAttempts: 1 }) })
  assert.strictEqual(q.snapshot().stats.running, 1)
  q.resume()
  const snap = q.snapshot()
  assert.strictEqual(snap.stats.queued, 1)
  assert.ok(snap.items[0].error.includes('重启'))
})

test('扫描对账：raw 消失→skipped；台账丢失但 wiki sources 已引用→不再入队', async (t) => {
  const { root, ledgerFile } = sandbox(t)
  const { runner } = swappableRunner(async () => ({}))
  const q = makeQueue({ root, ledgerFile, runner, getLimits: () => ({ timeoutMs: 5000, maxAttempts: 1 }) })
  q.setPaused(true)

  const rel = writeRaw(root, 'gone.md', '会消失')
  q.offer(rel)
  fs.rmSync(path.join(root, rel), { force: true })
  let r = q.scan()
  assert.strictEqual(r.scanned >= 0, true)
  assert.strictEqual(q.snapshot().items.find((it) => it.rel === rel).status, 'skipped')

  // 台账无记录 + wiki 已引用 → 不入队
  writeWiki(root, 'wiki/howtos/cited.md', '---\ntitle: c\ntags: [x]\nauthor: a\nsources: [raw/cited.md]\n---\n…')
  writeRaw(root, 'cited.md', '已被引用的素材')
  q.scan()
  assert.strictEqual(q.snapshot().items.find((it) => it.rel === 'raw/cited.md'), undefined)
})

test('非文本素材：pick 到时 skipped 并给原因', async (t) => {
  const { root, ledgerFile } = sandbox(t)
  const { runner, calls } = swappableRunner(async () => ({}))
  const q = makeQueue({ root, ledgerFile, runner, getLimits: () => ({ timeoutMs: 5000, maxAttempts: 1 }) })
  q.offer(writeRaw(root, 'diagram.pdf', '%PDF-1.4 …'))
  await until(() => q.snapshot().stats.skipped === 1)
  const item = q.snapshot().items.find((it) => it.status === 'skipped')
  assert.ok(item.note.includes('非文本'))
  assert.strictEqual(calls.length, 0, '不得真的调 runner')
})

test('取消：仅 queued 可取消', async (t) => {
  const { root, ledgerFile } = sandbox(t)
  const { runner } = swappableRunner(async () => ({}))
  const q = makeQueue({ root, ledgerFile, runner, getLimits: () => ({ timeoutMs: 5000, maxAttempts: 1 }) })
  q.setPaused(true)
  q.offer(writeRaw(root, 'c.md', '素材'))
  const item = q.snapshot().items[0]
  assert.strictEqual(q.cancel(item.id).ok, true)
  assert.strictEqual(q.cancel(item.id).ok, false, '二次取消应失败')
  assert.strictEqual(q.snapshot().stats.skipped, 1)
})

test('台账损坏：备份 .bad-* 并空库重建', (t) => {
  const { root, ledgerFile } = sandbox(t)
  fs.writeFileSync(ledgerFile, '这不是{json', 'utf8')
  const { runner } = swappableRunner(async () => ({}))
  const q = makeQueue({ root, ledgerFile, runner })
  assert.strictEqual(q.snapshot().items.length, 0)
  const bad = fs.readdirSync(path.dirname(ledgerFile)).find((f) => f.startsWith('queue.json.bad-'))
  assert.ok(bad, '应留下 .bad 备份')
})

test('超时：runner 无视 abort 时按超时失败并放弃等待', async (t) => {
  const { root, ledgerFile } = sandbox(t)
  const { runner } = swappableRunner(async () => { await sleep(500); return { pages: ['wiki/howtos/late.md'] } })
  const q = makeQueue({ root, ledgerFile, runner, getLimits: () => ({ timeoutMs: 60, maxAttempts: 1 }) })
  q.offer(writeRaw(root, 'slow.md', '素材'))
  const snap = await until(() => q.snapshot().stats.failed === 1 && q.snapshot())
  const item = snap.items.find((it) => it.status === 'failed')
  assert.ok(item.error.includes('超时'))
  assert.strictEqual(item.pages.length, 0, '超时后迟到的产出不得入账')
})

test('retry(done) 可重蒸馏同一素材', async (t) => {
  const { root, ledgerFile } = sandbox(t)
  let round = 0
  const { runner } = swappableRunner(async () => {
    round++
    const page = `wiki/howtos/r${round}.md`
    writeWiki(root, page, `第 ${round} 版`)
    return { pages: [page], summary: `v${round}` }
  })
  const q = makeQueue({ root, ledgerFile, runner, getLimits: () => ({ timeoutMs: 5000, maxAttempts: 1 }) })
  q.offer(writeRaw(root, 're.md', '素材'))
  await until(() => q.snapshot().stats.done === 1)
  const item = q.snapshot().items.find((it) => it.status === 'done')
  assert.strictEqual(item.pages[0], 'wiki/howtos/r1.md')
  assert.strictEqual(q.retry(item.id).ok, true)
  await until(() => round === 2)
  await until(() => q.snapshot().items.find((it) => it.id === item.id).pages[0] === 'wiki/howtos/r2.md')
})

test('splitMarkdown：按标题切块、单片超限硬切、片数封顶', () => {
  const big = ['# A', 'a'.repeat(40), '## B', 'b'.repeat(40), '## C', 'c'.repeat(40)].join('\n')
  const parts = queueCore.splitMarkdown(big, 50)
  assert.ok(parts.length >= 3, `应切成多片（实际 ${parts.length}）`)
  assert.ok(parts.every((p) => p.body.length <= 60), '单片不应超限太多')

  const noHeading = 'x'.repeat(300)
  const hard = queueCore.splitMarkdown(noHeading, 100)
  assert.ok(hard.length === 3 && hard.every((p) => p.body.length <= 101), '无标题按行硬切')

  const joined = queueCore.splitMarkdown(big, 50, 2)
  assert.ok(joined.length <= 2, '片数封顶生效')

  assert.strictEqual(queueCore.splitMarkdown('short', 100).length, 1)
})

test('大文件自动分片：逐片入队、逐片蒸馏、来源指向分片文件', async (t) => {
  const { root, ledgerFile } = sandbox(t)
  const chapter = (n) => `## 第 ${n} 章\n\n${('内容'.repeat(30) + '\n').repeat(120)}` // ≈7.7KB/章
  const content = Array.from({ length: 16 }, (_, i) => chapter(i + 1)).join('\n') // ≈123KB > 100KB 阈值
  const rel = writeRaw(root, 'bigbook.md', content)
  const distilled = []
  const { runner } = swappableRunner(async (item) => {
    assert.ok(item.chunk, '大文件条目应带 chunk 描述')
    const chunkText = fs.readFileSync(item.chunk.file, 'utf8')
    assert.ok(chunkText.length <= 40 * 1024, '单片 ≤ 目标大小附近')
    const page = `wiki/howtos/chunk-${item.chunk.idx}.md`
    writeWiki(root, page, `片 ${item.chunk.idx}`)
    distilled.push(item.chunk.idx)
    return { pages: [page], summary: `片 ${item.chunk.idx}` }
  })
  const q = makeQueue({ root, ledgerFile, runner, getLimits: () => ({ timeoutMs: 5000, maxAttempts: 1 }) })
  q.offer(rel)
  await until(() => q.snapshot().items.some((it) => it.chunk) && q.snapshot().stats.done >= 1, 4000, '分片入队')
  const total = q.snapshot().items.find((it) => it.chunk).chunk.total
  assert.ok(total >= 2, `大文件应切成多片（实际 ${total}）`)
  await until(() => q.snapshot().stats.done >= total, 8000, '全部分片蒸馏完成')
  const items = q.snapshot().items.filter((it) => it.rel === rel)
  assert.strictEqual(items.length, total)
  assert.strictEqual(items.length, distilled.length)
  assert.strictEqual(new Set(distilled).size, distilled.length, '每片恰好一次')
  const oldHash = items[0].hash

  // 同内容再次 offer → 去重；内容变化 → 新版分片重新入队（旧 done 条目留档）
  assert.strictEqual(q.offer(rel).dedup, true)
  writeRaw(root, 'bigbook.md', content + '\n## 新章节\n\n' + '新'.repeat(500))
  q.offer(rel)
  await until(() => q.snapshot().items.some((it) => it.status === 'queued' && it.chunk && it.hash !== oldHash), 4000, '新版分片入队')
})
