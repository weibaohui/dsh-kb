'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const core = require('../src/kb-core')

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-kb-test-'))
}

function fakeReq(text) {
  const chunk = Buffer.from(text, 'utf8')
  return {
    async *[Symbol.asyncIterator]() {
      yield chunk
    },
  }
}

test('bootstrap 创建骨架且幂等、不覆盖已有文件', () => {
  const root = tmpRoot()
  const created = core.bootstrap(root)
  assert.ok(created.includes('raw/'))
  assert.ok(created.includes('index.md'))
  for (const rel of core.BOOT_DIRS) assert.ok(fs.statSync(path.join(root, rel)).isDirectory(), rel)
  for (const name of core.BOOT_FILES) assert.ok(fs.existsSync(path.join(root, name)), name)
  // 二次自举：不再新建、不覆盖内容
  fs.writeFileSync(path.join(root, 'index.md'), '# 已有目录\n', 'utf8')
  const again = core.bootstrap(root)
  assert.equal(again.length, 0)
  assert.equal(fs.readFileSync(path.join(root, 'index.md'), 'utf8'), '# 已有目录\n')
})

test('resolveExisting 拒绝词法越界 / 绝对路径 / 软链逃逸', () => {
  const root = tmpRoot()
  core.bootstrap(root)
  fs.writeFileSync(path.join(root, 'a.md'), 'hi', 'utf8')
  assert.throws(() => core.resolveExisting(root, '../outside'), /越界/)
  assert.throws(() => core.resolveExisting(root, '/etc/passwd'), /绝对路径/)
  assert.throws(() => core.resolveExisting(root, 'a\0b'), /非法路径/)
  // 软链指向 root 外
  const outside = path.join(path.dirname(root), path.basename(root) + '-outside.md')
  fs.writeFileSync(outside, 'secret', 'utf8')
  try {
    fs.symlinkSync(outside, path.join(root, 'leak.md'))
    assert.throws(() => core.resolveExisting(root, 'leak.md'), /符号链接越界/)
  } finally {
    fs.rmSync(outside, { force: true })
  }
  // 正常相对路径可解析
  assert.equal(core.resolveExisting(root, 'a.md'), path.join(root, 'a.md'))
})

test('parseFrontmatter 支持 tags 数组与引号值', () => {
  const { data, body } = core.parseFrontmatter('---\ntitle: "现场处置: 证书过期"\ntags: [网络, 重启]\nauthor: zhang\n---\n\n正文第一行\n')
  assert.equal(data.title, '现场处置: 证书过期')
  assert.deepEqual(data.tags, ['网络', '重启'])
  assert.equal(data.author, 'zhang')
  assert.match(body, /^正文第一行/)
  assert.equal(core.parseFrontmatter('无 frontmatter').data, null)
})

test('readDoc 解析 md 文档并带 frontmatter', () => {
  const root = tmpRoot()
  core.bootstrap(root)
  const rel = 'wiki/howtos/cert-renew.md'
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  fs.writeFileSync(path.join(root, rel), '---\ntitle: 证书续期\ntags: [tls]\n---\n\n步骤一\n', 'utf8')
  const doc = core.readDoc(root, rel)
  assert.equal(doc.kind, 'md')
  assert.equal(doc.frontmatter.title, '证书续期')
  assert.equal(doc.rel, rel)
  assert.match(doc.body, /步骤一/)
  // 二进制文件给 binary
  fs.writeFileSync(path.join(root, 'raw/dump.bin'), Buffer.from([0, 1, 2, 3]))
  assert.equal(core.readDoc(root, 'raw/dump.bin').kind, 'binary')
})

test('search 全文扫描：分组命中、大小写不敏感', () => {
  const root = tmpRoot()
  core.bootstrap(root)
  fs.writeFileSync(path.join(root, 'wiki/howtos/restart.md'), '---\ntitle: 重启\n---\n\n先停 nginx\n再启 nginx\n', 'utf8')
  fs.writeFileSync(path.join(root, 'raw/server.log'), 'NGINX failed to start\nother line\n', 'utf8')
  const r = core.search(root, 'nginx')
  assert.ok(r.hits.length >= 2)
  const byRel = new Map(r.hits.map((h) => [h.rel, h]))
  assert.ok(byRel.get('wiki/howtos/restart.md').lines.length === 2)
  assert.ok(byRel.get('raw/server.log').lines[0].text.includes('NGINX failed'))
  assert.ok(r.durationMs >= 0)
  assert.throws(() => core.search(root, '   '), /缺少搜索词/)
})

test('uploadRaw 只准进 raw/、拒绝覆盖、支持 raw 子目录自动创建', async () => {
  const root = tmpRoot()
  core.bootstrap(root)
  // 拒绝 wiki
  await assert.rejects(() => core.uploadRaw(fakeReq('x'), root, 'wiki', 'a.md'), /只允许上传到 raw/)
  await assert.rejects(() => core.uploadRaw(fakeReq('x'), root, 'raw-evil', 'a.md'), /只允许上传到 raw/)
  // raw 根
  const r1 = await core.uploadRaw(fakeReq('hello'), root, 'raw', 'a.log')
  assert.equal(r1.name, 'a.log')
  assert.equal(fs.readFileSync(path.join(root, 'raw/a.log'), 'utf8'), 'hello')
  // 拒绝覆盖
  await assert.rejects(() => core.uploadRaw(fakeReq('y'), root, 'raw', 'a.log'), /同名文件已存在/)
  // raw 子目录自动创建
  const r2 = await core.uploadRaw(fakeReq('z'), root, 'raw/2026-09', 'b.log')
  assert.equal(r2.dir, 'raw/2026-09')
  assert.equal(fs.readFileSync(path.join(root, 'raw/2026-09/b.log'), 'utf8'), 'z')
  // 路径部分被 basename 清洗（与 file-share 同语义）,'../evil' 落为 'evil'
  const r3 = await core.uploadRaw(fakeReq('z'), root, 'raw', '../evil')
  assert.equal(r3.name, 'evil')
  assert.ok(fs.existsSync(path.join(root, 'raw/evil')))
})

test('listDir 目录在前、中文排序', () => {
  const root = tmpRoot()
  core.bootstrap(root)
  fs.writeFileSync(path.join(root, 'b.md'), 'x', 'utf8')
  fs.writeFileSync(path.join(root, '阿.md'), 'x', 'utf8')
  const entries = core.listDir(root, '')
  const names = entries.map((e) => e.name)
  const dirIdx = names.indexOf('raw')
  const bIdx = names.indexOf('b.md')
  const cIdx = names.indexOf('阿.md')
  assert.ok(dirIdx >= 0 && dirIdx < bIdx, '目录排在文件前')
  assert.ok(cIdx >= 0, '中文名可见')
})

test('statusPayload 返回根目录与计数', () => {
  const root = tmpRoot()
  core.bootstrap(root)
  fs.writeFileSync(path.join(root, 'raw/x.log'), 'x', 'utf8')
  const s = core.statusPayload(root)
  assert.equal(s.ok, true)
  assert.equal(s.root, path.resolve(root))
  assert.equal(s.counts.raw, 1)
  assert.ok(s.counts.wiki >= 0)
})

test('defaultRoot 遵循 DSH_KB_ROOT 覆盖', () => {
  const old = process.env.DSH_KB_ROOT
  try {
    process.env.DSH_KB_ROOT = '/tmp/kb-override'
    assert.equal(core.defaultRoot(), '/tmp/kb-override')
    delete process.env.DSH_KB_ROOT
    assert.equal(core.defaultRoot(), path.join(os.homedir(), '.dsh', 'kb'))
  } finally {
    if (old === undefined) delete process.env.DSH_KB_ROOT
    else process.env.DSH_KB_ROOT = old
  }
})

test('normalizeKbRoot：目录不存在时自动创建', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kbnorm-'))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const target = path.join(base, 'deep', 'nested', 'newkb')
  const r = core.normalizeKbRoot(target, os.homedir())
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.abs, target)
  assert.ok(fs.statSync(target).isDirectory(), '目录已递归创建')

  // 非 ENOENT 错误仍拒绝（目标是文件）
  const filePath = path.join(base, 'afile')
  fs.writeFileSync(filePath, 'x')
  const r2 = core.normalizeKbRoot(filePath, os.homedir())
  assert.strictEqual(r2.ok, false)
  assert.ok(r2.error.includes('不是目录'))

  // 危险路径仍拒绝
  assert.strictEqual(core.normalizeKbRoot('/', os.homedir()).ok, false)
  assert.strictEqual(core.normalizeKbRoot(os.homedir(), os.homedir()).ok, false)
  assert.strictEqual(core.normalizeKbRoot('', os.homedir()).ok, false)
})

test('readSchema：缺失回退默认模板；bootstrap 后读原文（含 frontmatter）', () => {
  const empty = tmpRoot()
  const missing = core.readSchema(empty)
  assert.equal(missing.exists, false)
  assert.ok(missing.text.includes('KB 约定'), '回退默认模板')

  const root = tmpRoot()
  core.bootstrap(root)
  const s = core.readSchema(root)
  assert.equal(s.exists, true)
  assert.ok(s.text.startsWith('---'), '原文含 frontmatter（区别于 /doc 的剥离渲染）')
})

test('writeSchema：写入回读一致、原子替换；空内容/超限/软链越界拒绝', (t) => {
  const root = tmpRoot()
  core.bootstrap(root)
  const custom = '---\ntitle: 解决方案库约定\n---\n\n# 本库只收「解决方案」形态，页面规范自定\n'
  const r = core.writeSchema(root, custom)
  assert.ok(r.size > 0)
  const back = core.readSchema(root)
  assert.equal(back.exists, true)
  assert.equal(back.text, custom)

  // 空内容
  assert.throws(() => core.writeSchema(root, '   '), /不能为空/)
  assert.throws(() => core.writeSchema(root, null), /不能为空/)
  // 超限
  const big = 'x'.repeat(core.SCHEMA_MAX_BYTES + 1)
  assert.throws(() => core.writeSchema(root, big), /大小上限/)
  // schema.md 被换成指向库外的软链 → 拒绝
  const outside = path.join(path.dirname(root), path.basename(root) + '-schema-out.md')
  fs.writeFileSync(outside, 'secret', 'utf8')
  try {
    fs.rmSync(path.join(root, 'schema.md'))
    fs.symlinkSync(outside, path.join(root, 'schema.md'))
    assert.throws(() => core.writeSchema(root, 'hijack'), /符号链接越界|路径越界/)
    assert.equal(fs.readFileSync(outside, 'utf8'), 'secret', '库外文件未被改动')
  } finally {
    fs.rmSync(outside, { force: true })
  }
  // 无残留临时文件
  const leftovers = fs.readdirSync(root).filter((n) => n.includes('dsh-tmp'))
  assert.deepEqual(leftovers, [])
})
