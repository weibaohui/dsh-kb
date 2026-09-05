/**
 * Build `client/bundle.js` from `client/index.js`.
 *
 * 静态 bundle 协议：window.__ModuleLoader__.load({ id, factory }) 注册 lazy CommonJS
 * factory，react 是 platform module。本脚本注入 var React = require("react") 和
 * module/exports 脚手架，包裹动态插件源。client/index.js 自包含（无外部 helpers，
 * 不用 react-dom 等平台模块）。运行：npm run build:client
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const sourcePath = join(here, '..', 'client', 'index.js')
const bundlePath = join(here, '..', 'client', 'bundle.js')
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'))
const source = readFileSync(sourcePath, 'utf8')

const banner = `/* Generated from client/index.js by scripts/build-client.mjs — do not edit by hand.
 * Regenerate with: npm run build:client
 */
window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })
    var React = require("react")
`

const footer = `
    return module.exports
  }
})
`

const indent = (code) => code
  .split('\n')
  .map((line) => (line.length === 0 ? line : '    ' + line))
  .join('\n')

writeFileSync(bundlePath, banner + indent(source) + footer, 'utf8')
console.log(`built ${bundlePath} (${source.length} source bytes)`)
