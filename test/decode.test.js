'use strict'

/**
 * @weibaohui/dsh-kb — 编码探测单测（dsh-kb#3 缺陷1）
 *
 * 样本全部硬编码字节：Node 无内置 GBK 编码器，TextDecoder 只管解码；
 * 已知字节：GBK「中文」= D6 D0 CE C4，UTF-16LE「中文」= 2D 4E 87 65。
 */

const test = require('node:test')
const assert = require('node:assert')
const { decodeText } = require('../src/kb-core')

const GBK_ZHONGWEN = Buffer.from([0xD6, 0xD0, 0xCE, 0xC4])

test('decodeText：无 BOM 严格 UTF-8 直接命中', () => {
  const buf = Buffer.concat([Buffer.from('中文', 'utf8'), Buffer.from(' hello\n', 'utf8')])
  const r = decodeText(buf)
  assert.strictEqual(r.encoding, 'utf-8')
  assert.strictEqual(r.text, '中文 hello\n')
})

test('decodeText：UTF-8 BOM 剥离', () => {
  const buf = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('中文', 'utf8')])
  const r = decodeText(buf)
  assert.strictEqual(r.encoding, 'utf-8')
  assert.strictEqual(r.text, '中文')
})

test('decodeText：GBK 命中 gb18030 严格档', () => {
  const buf = Buffer.concat([GBK_ZHONGWEN, Buffer.from(' note\r\n', 'latin1')])
  const r = decodeText(buf)
  assert.strictEqual(r.encoding, 'gb18030')
  assert.strictEqual(r.text, '中文 note\r\n')
})

test('decodeText：UTF-16LE BOM', () => {
  const buf = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('中文\n', 'utf16le')])
  const r = decodeText(buf)
  assert.strictEqual(r.encoding, 'utf-16le')
  assert.strictEqual(r.text, '中文\n')
})

test('decodeText：UTF-16BE BOM（字节对交换后按 LE 解）', () => {
  const be = Buffer.from('中文\n', 'utf16le')
  be.swap16()
  const buf = Buffer.concat([Buffer.from([0xFE, 0xFF]), be])
  const r = decodeText(buf)
  assert.strictEqual(r.encoding, 'utf-16be')
  assert.strictEqual(r.text, '中文\n')
})

test('decodeText：无 BOM UTF-16LE 英文（NUL 启发命中，LE 可信度择优）', () => {
  const r = decodeText(Buffer.from('hi\nhi\n', 'utf16le'))
  assert.strictEqual(r.encoding, 'utf-16le')
  assert.strictEqual(r.text, 'hi\nhi\n')
})

test('decodeText：无 BOM UTF-16BE 中文（换行 NUL 触发启发，BE 可信度胜出）', () => {
  const be = Buffer.from('中文\n中文\n', 'utf16le')
  be.swap16()
  const r = decodeText(be)
  assert.strictEqual(r.encoding, 'utf-16be')
  assert.strictEqual(r.text, '中文\n中文\n')
})

test('decodeText：纯 ASCII 偶数长度不受 UTF-16 启发误伤', () => {
  const r = decodeText(Buffer.from('hello\n', 'utf8'))
  assert.strictEqual(r.encoding, 'utf-8')
  assert.strictEqual(r.text, 'hello\n')
})

test('decodeText：坏字节穿透 gb18030 宽容档 → 有损 UTF-8 兜底', () => {
  // 0xFF 超出 gb18030 lead 范围（0x81~0xFE）也非 UTF-8 起始字节，严格档全失败；
  // 宽容档 U+FFFD 占比 50% > 5% 仍不可收 → 有损 UTF-8 兜底
  const r = decodeText(Buffer.from([0xFF, 0x41]))
  assert.strictEqual(r.encoding, 'utf-8')
  assert.ok(r.text.includes('\uFFFD'), '兜底有损解码保留 U+FFFD')
})

test('decodeText：空 buffer', () => {
  assert.deepStrictEqual(decodeText(Buffer.alloc(0)), { encoding: 'utf-8', text: '' })
})

test('decodeText：GBK 大文件（6MB 量级、非头部字节也正确解码）', () => {
  const parts = []
  for (let i = 0; i < 200000; i++) parts.push(GBK_ZHONGWEN, Buffer.from(' line\n', 'latin1'))
  const buf = Buffer.concat(parts) // ≈2MB，超出 256KB 探测头部
  const r = decodeText(buf)
  assert.strictEqual(r.encoding, 'gb18030')
  assert.ok(r.text.startsWith('中文 line\n'))
  assert.ok(!r.text.includes('\uFFFD'), '尾部字节（探测窗口之外）无替换符')
})
