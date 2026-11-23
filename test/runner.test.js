'use strict'

/**
 * @weibaohui/dsh-kb — 蒸馏 runner 单测（真 runner + 假 agent 服务，dsh-kb#3 缺陷3 回归）
 *
 * ctx.agents/agentDefaultModel/sessions 全部注入内存假实现；事件时间线可编排——
 * followup 同步推首批事件，whenIdle 先返回、末批事件延迟入列，复现
 * 「whenIdle 返回早于末批事件入列」的竞态（v0.7.18 96 个会话全部 out=0B 的根因）。
 */

const test = require('node:test')
const assert = require('node:assert')

const { createAgentRunner } = require('../src/index')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const logger = { info() {}, warn() {}, error() {} }

/** 假 agent：事件时间线可编排，snapshotEvents 与宿主 0.1.5+ 形状一致。 */
function fakeAgent({ lateDelayMs = 400, withTool = true } = {}) {
  const events = []
  let seq = 0
  const push = (type, data) => events.push({ seq: ++seq, type, data })
  const lateBatch = [
    ['assistant/message', { message: { role: 'assistant', content: [{ type: 'text', text: '完毕\n{"pages": ["wiki/howtos/a.md"], "summary": "好"}' }] } }],
  ]
  if (withTool) lateBatch.push(['tool/call', { call: { tool: 'read_file' } }])
  const agent = {
    session: { seq: 0, agentPreset: 'test', append() {}, snapshotEvents: () => events.slice() },
    followup() {
      push('assistant/chunk', { chunk: { type: 'text-delta', text: '开工…' } })
      // 复现竞态：whenIdle 已返回，末批事件（含 JSON 结论尾）lateDelayMs 后才入列
      setTimeout(() => { for (const [type, data] of lateBatch) push(type, data) }, lateDelayMs)
    },
    whenIdle: () => sleep(50),
    stop() {},
  }
  return agent
}

function fakeCtx(agent) {
  return {
    agents: { create: async () => ({ agent }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'fake', model: 'fake-model' }) },
    sessions: { flush: async () => {} },
    get: () => undefined,
  }
}

const ROOT = '/tmp/kb-runner-test'

test('runner：whenIdle 后迟到的事件被 quiesce 收进 tail，toolCalls 正确计数', async () => {
  const agent = fakeAgent({})
  const run = createAgentRunner({ ctx: fakeCtx(agent), rootAbs: ROOT, readAuto: () => ({}), logger })
  const item = { id: 'dq-runner1', rel: 'raw/a.md', kbId: 'main' }
  const res = await run(item, { signal: null, root: ROOT })
  assert.ok(item.sessionId && item.sessionId.startsWith('kb-distill-'), 'sessionId 已回填')
  assert.ok(res.tail.includes('{"pages": ["wiki/howtos/a.md"]'), '迟到的 JSON 结论尾应进 tail（旧实现此处是空串）')
  assert.strictEqual(res.toolCalls, 1)
  assert.ok(res.diag.includes('tools=1'), 'diag 应带工具计数')
})

test('runner：无 tool 事件时 toolCalls=0（no-output 归因的输入）', async () => {
  const agent = fakeAgent({ withTool: false })
  const run = createAgentRunner({ ctx: fakeCtx(agent), rootAbs: ROOT, readAuto: () => ({}), logger })
  const res = await run({ id: 'dq-runner2', rel: 'raw/b.md', kbId: 'main' }, { signal: null, root: ROOT })
  assert.ok(res.tail.includes('{"pages"'), '零工具会话的 JSON 尾照常进 tail')
  assert.strictEqual(res.toolCalls, 0)
  assert.ok(res.diag.includes('tools=0'))
})
