'use strict'

// 正文编辑 + 回收站（软删除 / 还原 / 彻底删除）
//
// 这组能力补的是「页面内容只能看不能改、删了没法恢复」的缺口：
//   PUT    /doc            → writeDoc        改写 wiki/ 下已存在的文本页（保存即进版本历史）
//   DELETE /doc            → trashDoc        移入回收站（可还原，不是真删）
//   GET    /trash          → listTrash       回收站列表
//   POST   /trash/restore  → restoreTrash    还原
//   POST   /trash/purge    → purgeTrash      彻底删除单条
//   POST   /trash/purge-all→ purgeAllTrash   清空回收站

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const core = require('../src/kb-core')

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-kb-trash-test-'))
}

/** 建一个已 bootstrap 的库根 + 独立回收站目录 */
function setup() {
  const root = tmpRoot()
  core.bootstrap(root)
  const trash = path.join(tmpRoot(), 'trash')
  fs.mkdirSync(trash, { recursive: true })
  return { root, trash }
}

function writePage(root, rel, text) {
  const abs = path.join(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, text, 'utf8')
  return abs
}

// ── writeDoc：正文编辑 ──────────────────────────────────────────

test('writeDoc 改写已存在的 wiki 页面，落盘内容为新值', () => {
  const { root } = setup()
  writePage(root, 'wiki/page.md', '# 旧标题\n\n旧内容\n')

  const r = core.writeDoc(root, 'wiki/page.md', '# 新标题\n\n**新内容**\n')
  assert.equal(r.rel, 'wiki/page.md')
  assert.ok(r.size > 0)
  const after = fs.readFileSync(path.join(root, 'wiki/page.md'), 'utf8')
  assert.match(after, /新标题/)
  assert.match(after, /新内容/)
  assert.doesNotMatch(after, /旧内容/)
})

test('writeDoc 保留中文与换行原样写入（UTF-8 不损坏）', () => {
  const { root } = setup()
  writePage(root, 'wiki/zh.md', '占位\n')
  const text = '# 中文标题\n\n第一行\n第二行 —— 带破折号和 emoji 🎯\n'
  core.writeDoc(root, 'wiki/zh.md', text)
  assert.equal(fs.readFileSync(path.join(root, 'wiki/zh.md'), 'utf8'), text)
})

test('writeDoc 拒绝不存在的页面（新建走上传/蒸馏，不从这里开）', () => {
  const { root } = setup()
  assert.throws(() => core.writeDoc(root, 'wiki/missing.md', 'x'), /不存在/)
})

test('writeDoc 拒绝 wiki/ 之外的路径', () => {
  const { root } = setup()
  writePage(root, 'raw/data.txt', 'raw\n')
  assert.throws(() => core.writeDoc(root, 'raw/data.txt', 'x'), /只允许编辑 wiki/)
  assert.throws(() => core.writeDoc(root, 'index.md', 'x'), /只允许编辑 wiki/)
})

test('writeDoc 拒绝路径穿越', () => {
  const { root } = setup()
  assert.throws(() => core.writeDoc(root, 'wiki/../../etc/passwd', 'x'), /不存在|只允许/)
})

test('writeDoc 拒绝空内容与非文本扩展名', () => {
  const { root } = setup()
  writePage(root, 'wiki/empty.md', 'x\n')
  assert.throws(() => core.writeDoc(root, 'wiki/empty.md', '   '), /不能为空/)
  writePage(root, 'wiki/pic.png', 'x\n')
  assert.throws(() => core.writeDoc(root, 'wiki/pic.png', 'x'), /只支持文本/)
})

// ── trashDoc / listTrash：软删除 ────────────────────────────────

test('trashDoc 把 wiki 页面移入回收站，原位置消失', () => {
  const { root, trash } = setup()
  writePage(root, 'wiki/gone.md', '# 待删\n')
  const r = core.trashDoc(root, trash, 'wiki/gone.md')

  assert.equal(r.rel, 'wiki/gone.md')
  assert.equal(fs.existsSync(path.join(root, 'wiki/gone.md')), false)
  const items = core.listTrash(trash).items
  assert.equal(items.length, 1)
  assert.equal(items[0].rel, 'wiki/gone.md')
})

test('trashDoc 支持 raw/ 下的素材文件', () => {
  const { root, trash } = setup()
  writePage(root, 'raw/a.txt', 'raw 内容\n')
  core.trashDoc(root, trash, 'raw/a.txt')
  assert.equal(fs.existsSync(path.join(root, 'raw/a.txt')), false)
  assert.equal(core.listTrash(trash).items[0].rel, 'raw/a.txt')
})

test('listTrash 空目录返回空列表；多条按删除时间倒序', () => {
  const { root, trash } = setup()
  assert.deepEqual(core.listTrash(trash).items, [])

  writePage(root, 'wiki/a.md', 'a\n')
  writePage(root, 'wiki/b.md', 'b\n')
  core.trashDoc(root, trash, 'wiki/a.md')
  core.trashDoc(root, trash, 'wiki/b.md')

  const items = core.listTrash(trash).items
  assert.equal(items.length, 2)
  assert.ok(items[0].deletedAt >= items[1].deletedAt)
  // 每条都带 entry（还原/彻底删的句柄）与 rel（人读路径）
  for (const it of items) {
    assert.ok(it.entry)
    assert.ok(it.rel)
  }
})

test('文件名含 __ 时回收站往返不串路径（base64url 编码，回归）', () => {
  const { root, trash } = setup()
  writePage(root, 'wiki/my__notes.md', '双下划线\n')
  writePage(root, 'wiki/sub/a__b/c.md', '嵌套\n')
  core.trashDoc(root, trash, 'wiki/my__notes.md')
  core.trashDoc(root, trash, 'wiki/sub/a__b/c.md')

  const items = core.listTrash(trash).items
  assert.equal(items.length, 2)
  assert.ok(items.some((it) => it.rel === 'wiki/my__notes.md'), '含 __ 的文件名必须原样解码')
  assert.ok(items.some((it) => it.rel === 'wiki/sub/a__b/c.md'))

  for (const it of items) {
    core.restoreTrash(root, trash, it.entry)
    assert.ok(fs.existsSync(path.join(root, it.rel)), '还原后应回到原路径: ' + it.rel)
  }
})

test('trashDoc 拒绝不存在的文件与越界路径', () => {
  const { root, trash } = setup()
  assert.throws(() => core.trashDoc(root, trash, 'wiki/none.md'), /不存在/)
  assert.throws(() => core.trashDoc(root, trash, '../../etc/passwd'), /不存在|不允许|只允许/)
})

// ── restoreTrash：还原 ────────────────────────────────────────

test('restoreTrash 还原到原路径且内容一字不差', () => {
  const { root, trash } = setup()
  const text = '# 会被删掉再还原\n\n内容必须原样回来\n'
  writePage(root, 'wiki/back.md', text)
  core.trashDoc(root, trash, 'wiki/back.md')

  const entry = core.listTrash(trash).items[0].entry
  const r = core.restoreTrash(root, trash, entry)

  assert.equal(r.rel, 'wiki/back.md')
  assert.equal(fs.readFileSync(path.join(root, 'wiki/back.md'), 'utf8'), text)
  assert.equal(core.listTrash(trash).items.length, 0, '还原后回收站条目应消失')
})

test('restoreTrash 自动补齐被删掉的中间目录', () => {
  const { root, trash } = setup()
  writePage(root, 'wiki/sub/deep.md', 'deep\n')
  core.trashDoc(root, trash, 'wiki/sub/deep.md')
  fs.rmdirSync(path.join(root, 'wiki/sub')) // 模拟目录也被清掉

  const entry = core.listTrash(trash).items[0].entry
  core.restoreTrash(root, trash, entry)
  assert.ok(fs.existsSync(path.join(root, 'wiki/sub/deep.md')))
})

test('restoreTrash 拒绝伪造的回收站条目名', () => {
  const { root, trash } = setup()
  assert.throws(() => core.restoreTrash(root, trash, '../../etc/passwd'), /非法|不存在/)
})

// ── purgeTrash / purgeAllTrash：彻底删除 ──────────────────────

test('purgeTrash 彻底删除单条，不可还原', () => {
  const { root, trash } = setup()
  writePage(root, 'wiki/p1.md', 'p1\n')
  writePage(root, 'wiki/p2.md', 'p2\n')
  core.trashDoc(root, trash, 'wiki/p1.md')
  core.trashDoc(root, trash, 'wiki/p2.md')

  const items = core.listTrash(trash).items
  const r = core.purgeTrash(trash, items[0].entry)
  assert.equal(r.purged, 1)
  assert.equal(core.listTrash(trash).items.length, 1, '只删一条')
})

test('purgeAllTrash 清空回收站', () => {
  const { root, trash } = setup()
  for (const n of ['a', 'b', 'c']) {
    writePage(root, `wiki/${n}.md`, n + '\n')
    core.trashDoc(root, trash, `wiki/${n}.md`)
  }
  const r = core.purgeAllTrash(trash)
  assert.equal(r.purged, 3)
  assert.deepEqual(core.listTrash(trash).items, [])
})

test('purgeAllTrash 对空回收站是幂等的', () => {
  const { trash } = setup()
  assert.equal(core.purgeAllTrash(trash).purged, 0)
  assert.equal(core.purgeAllTrash(trash).purged, 0)
})

// ── 组合链路 ──────────────────────────────────────────────────

test('完整链路：编辑 → 删除 → 列表 → 还原 → 内容仍是编辑后的值', () => {
  const { root, trash } = setup()
  writePage(root, 'wiki/lifecycle.md', '# 原始\n')

  core.writeDoc(root, 'wiki/lifecycle.md', '# 编辑后\n\n最终内容\n')
  core.trashDoc(root, trash, 'wiki/lifecycle.md')
  assert.equal(core.listTrash(trash).items.length, 1)

  const entry = core.listTrash(trash).items[0].entry
  core.restoreTrash(root, trash, entry)

  const final = fs.readFileSync(path.join(root, 'wiki/lifecycle.md'), 'utf8')
  assert.match(final, /编辑后/)
  assert.match(final, /最终内容/)
})
