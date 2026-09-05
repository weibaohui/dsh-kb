'use strict'

/**
 * @weibaohui/dsh-kb — Host half
 *
 * 固定知识库根目录（DSH_KB_ROOT 覆盖，默认 ~/.dsh/kb）上的同源 API：
 *  - apply 时骨架自举（bootstrap：raw/ + wiki/* + index/log/schema，不覆盖已有）；
 *  - 同源路由 /dsh-kb/api/*：status / tree / doc / file / search / upload，
 *    全部以知识库根为界（kb-core 双重边界拒绝越界与软链逃逸）；
 *  - 无独立端口、无 token/限流——只服务本机 dsh Web GUI（登录门禁由宿主用户体系负责）；
 *  - 写路径只有 upload 到 raw/；wiki 编辑收口在 agent（skill/dsh-kb/SKILL.md）。
 *
 * 与 file-share 的分界：file-share 管「会话工作区」文件，dsh-kb 管「跨会话、
 * 跨人的固定知识库」——二者共享目录树/上传的手法但职责不同。
 */

const fs = require('node:fs')
const path = require('node:path')
const core = require('./kb-core')

const name = 'dsh-kb'
const inject = ['webServer']
const API_PREFIX = '/dsh-kb/api'

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

module.exports = {
  name,
  inject,
  version: core.VERSION,

  apply(ctx) {
    const logger = ctx.logger || { info() {}, warn() {}, error() {} }
    const webServer = ctx.webServer
    const root = core.defaultRoot()

    try {
      fs.mkdirSync(root, { recursive: true })
      core.bootstrap(root, logger)
    } catch (e) {
      logger.error(`dsh-kb: 知识库根目录不可用 ${root}: ${(e && e.message) || e}`)
    }

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
                sendJson(res, 201, { ok: true, ...result })
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
