/* Generated from client/index.js by scripts/build-client.mjs — do not edit by hand.
 * Regenerate with: npm run build:client
 */
window.__ModuleLoader__.load({
  id: "@weibaohui/dsh-kb",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })
    var React = require("react")
    'use strict'

    /**
     * @weibaohui/dsh-kb — Client half
     *
     * 侧栏底部入口（sidebar.footer.action）→ 全页知识库 overlay（dsh-tasks 同款交互）：
     *  - 左栏：快捷入口（index/log/schema）+ wiki/ 与 raw/ 懒加载目录树 + 多库切换器；
     *  - 右栏：markdown 阅读渲染（frontmatter 徽章、[[wikilink]]、内部链接、图片、代码块）、
     *    全文搜索结果（内置扫描引擎，命中高亮）、蒸馏队列面板、
     *    库约定编辑器（schema.md，每库一份：⌘S 保存 / 恢复默认模板）；
     *  - raw/ 下可上传素材，任意条目可「@ 给 agent」注入 composer
     *    （先关 overlay 再注入，composer 不可得时退化为复制到剪贴板）。
     *
     * 数据通道：宿主同源路由 /dsh-kb/api（服务端边界校验）。
     * 自包含：只依赖注入的 react（createElement/hooks），不用 react-dom 等平台模块。
     */

    const API = '/dsh-kb/api'

    /** 客户端会话服务（apply 时 ctx.inject(['sessions']) 懒注入；缺席时「打开会话」降级提示）。 */
    let sessionsSvc = null
    let activeKbId = 'main' // 当前浏览的知识库（图片/下载链接按它取文件）
    let kbsCache = null
    async function fetchKbs(force) {
      if (!force && kbsCache && Date.now() - kbsCache.at < 30000) return kbsCache.kbs
      const d = await fetch(`${API}/kbs`).then(readJson).catch(() => null)
      if (d && d.kbs) { kbsCache = { kbs: d.kbs, at: Date.now() }; return d.kbs }
      return kbsCache ? kbsCache.kbs : null
    }

    const styles = {
      _head: null,
      insert(css) {
        if (typeof document === 'undefined') return
        if (!this._head) {
          const style = document.createElement('style')
          style.setAttribute('data-plugin', 'dsh-kb')
          document.head.appendChild(style)
          this._head = style
        }
        this._head.textContent = css
      },
    }

    styles.insert(`
    .kb-trigger{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12.5px;padding:7px 10px;border-radius:8px;cursor:pointer;text-align:left}
    .kb-trigger:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);color:var(--dsw-alias-label-primary)}
    .kb-page{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
    .kb-head{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none;background:var(--dsw-alias-bg-layer-2)}
    .kb-title{font-size:15px;font-weight:600;margin:0;display:flex;align-items:center;gap:8px}
    .kb-root{font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-family:var(--ds-font-family-code,ui-monospace,monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
    .kb-btn{font-size:12px;padding:5px 12px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;flex:none;transition:background .16s,border-color .16s}
    .kb-btn:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 24%,var(--dsw-alias-border-l2))}
    .kb-btn:disabled{opacity:.5;cursor:default}
    .kb-btn.primary{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,var(--dsw-alias-border-l2))}
    .kb-search{flex:none;width:min(360px,40vw);padding:6px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
    .kb-search:focus{outline:none;border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 50%,var(--dsw-alias-border-l2))}
    .kb-body{display:flex;flex:1;min-height:0}
    .kb-side{flex:none;width:250px;border-right:1px solid var(--dsw-alias-border-l2);overflow:auto;padding:10px 8px;background:var(--dsw-alias-bg-layer-2)}
    .kb-side-h{font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));padding:8px 8px 4px;display:flex;align-items:center;justify-content:space-between;gap:6px}
    .kb-side-h button{border:0;background:transparent;color:var(--dsw-alias-brand-primary);font-size:11px;cursor:pointer;padding:0}
    .kb-item{display:flex;align-items:center;gap:6px;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-primary);font-size:12.5px;padding:4px 8px;border-radius:7px;cursor:pointer;text-align:left;line-height:1.7}
    .kb-item:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}
    .kb-item[data-cur="true"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);color:var(--dsw-alias-brand-primary)}
    .kb-item .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .kb-item .caret{flex:none;width:12px;font-size:10px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
    .kb-item .at{flex:none;border:0;background:transparent;color:var(--dsw-alias-brand-primary);cursor:pointer;font-size:11px;padding:0 2px;opacity:0}
    .kb-item:hover .at{opacity:1}
    .kb-main{flex:1;min-width:0;overflow:auto;padding:20px 26px}
    .kb-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 6px}
    .kb-chip{font-size:11px;line-height:1.6;border-radius:999px;padding:1px 10px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
    .kb-chip.title{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 35%,var(--dsw-alias-border-l2));font-weight:600}
    .kb-docbar{display:flex;gap:8px;align-items:center;padding:0 0 10px;border-bottom:1px solid var(--dsw-alias-border-l2);margin-bottom:14px}
    .kb-docpath{font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-family:var(--ds-font-family-code,ui-monospace,monospace);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    /* markdown 渲染 */
    .kb-md{font-size:13.5px;line-height:1.85;max-width:860px}
    .kb-md .kb-md-h{margin:1.2em 0 .5em;line-height:1.4}
    .kb-md h1.kb-md-h{font-size:1.5em}.kb-md h2.kb-md-h{font-size:1.3em}.kb-md h3.kb-md-h{font-size:1.15em}
    .kb-md h4.kb-md-h,.kb-md h5.kb-md-h,.kb-md h6.kb-md-h{font-size:1em}
    .kb-md .kb-md-p{margin:.6em 0;white-space:pre-wrap;word-break:break-word}
    .kb-md .kb-md-code{font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:.92em;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:5px;padding:0 5px}
    .kb-md .kb-md-pre{font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12px;line-height:1.7;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:12px 14px;overflow:auto;white-space:pre-wrap;word-break:break-word}
    .kb-md .kb-md-quote{margin:.7em 0;padding:2px 14px;border-left:3px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
    .kb-md .kb-md-list{margin:.5em 0;padding-left:1.5em}
    .kb-md .kb-md-list li{margin:.2em 0}
    .kb-md .kb-md-table{border-collapse:collapse;margin:.8em 0;font-size:12.5px}
    .kb-md .kb-md-table th,.kb-md .kb-md-table td{border:1px solid var(--dsw-alias-border-l2);padding:5px 10px;text-align:left}
    .kb-md .kb-md-link,.kb-md .kb-md-wikilink{color:var(--dsw-alias-brand-primary);cursor:pointer;text-decoration:none}
    .kb-md .kb-md-wikilink::before{content:'⟦';opacity:.6}.kb-md .kb-md-wikilink::after{content:'⟧';opacity:.6}
    .kb-md .kb-md-img{max-width:100%;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);margin:.4em 0}
    .kb-md .kb-md-hr{border:0;border-top:1px solid var(--dsw-alias-border-l2);margin:1.2em 0}
    .kb-md mark{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 26%,transparent);color:inherit;border-radius:3px;padding:0 2px}
    /* 搜索结果 */
    .kb-hit{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 14px;margin:0 0 10px;background:var(--dsw-alias-bg-layer-2)}
    .kb-hit-file{border:0;background:transparent;color:var(--dsw-alias-brand-primary);font-size:13px;font-weight:600;cursor:pointer;padding:0;display:flex;gap:8px;align-items:center}
    .kb-hit-file:hover{text-decoration:underline}
    .kb-hit-line{font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary);margin-top:4px;word-break:break-word;white-space:pre-wrap}
    .kb-hit-line .ln{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));user-select:none;margin-right:8px}
    .kb-empty{padding:48px 0;text-align:center;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:13px}
    .kb-err{padding:10px 0;color:var(--dsw-alias-state-error-primary);font-size:12.5px}
    .kb-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 16px;font-size:12px;z-index:2147483600;box-shadow:0 4px 16px rgba(0,0,0,.18)}
    .kb-counts{font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
    input.kb-file{display:none}
    .kb-page.kb-drop::after{content:'⬇ 松开，上传素材到知识库（自动蒸馏入队）';position:absolute;inset:10px;border:2px dashed var(--dsw-alias-brand-primary);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent);pointer-events:none;z-index:10}
    .kb-up{border:0;background:transparent;color:var(--dsw-alias-brand-primary);font-size:12px;cursor:pointer;padding:0 2px}
    .kb-up:hover{color:var(--dsw-alias-brand-primary);opacity:.8}
    .kb-spin{padding:24px 0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:12px}
    /* 首页最近更新(log.md 尾部) */
    .kb-recent{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);padding:8px 12px;margin:0 0 14px}
    .kb-recent-h{font-size:12px;font-weight:600;margin:2px 0 4px;display:flex;gap:6px;align-items:center}
    .kb-recent-sub{font-weight:400;font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
    .kb-recent-row{font-size:12px;line-height:1.9;color:var(--dsw-alias-label-secondary)}
    .kb-recent-link{color:var(--dsw-alias-brand-primary);cursor:pointer}
    .kb-recent-link:hover{text-decoration:underline}
    .kb-recent-raw{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:11px}
    .kb-q-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px}
    .kb-q-stats{display:flex;gap:6px;flex-wrap:wrap;flex:1;min-width:0}
    .kb-q-banner{font-size:12px;line-height:1.6;border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 24%,var(--dsw-alias-border-l2));border-radius:8px;padding:8px 12px;margin:0 0 12px;color:var(--dsw-alias-label-secondary)}
    .kb-q-model{font-size:12px;color:var(--dsw-alias-label-secondary);margin:0 0 12px}
    .kb-q-model-hint{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));margin-left:4px}
    .kb-q-row{display:flex;align-items:flex-start;gap:10px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;margin:0 0 8px}
    .kb-q-main{flex:1;min-width:0}
    .kb-q-name{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .kb-q-rel{font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-family:var(--ds-font-family-code,ui-monospace,monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .kb-q-note{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .kb-q-note.err{color:#d64545}
    .kb-q-side{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:5px}
    .kb-q-time{font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
    .kb-q-acts{display:flex;gap:4px}
    .kb-q-acts .kb-btn{font-size:11px;padding:2px 8px}
    .kb-chip.running{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,var(--dsw-alias-border-l2));font-weight:600}
    .kb-chip.queued{color:var(--dsw-alias-label-secondary)}
    .kb-chip.done{color:#2e9e5b;border-color:color-mix(in srgb,#2e9e5b 40%,var(--dsw-alias-border-l2))}
    .kb-chip.failed{color:#d64545;border-color:color-mix(in srgb,#d64545 40%,var(--dsw-alias-border-l2));font-weight:600}
    .kb-chip.skipped{color:var(--dsw-alias-label-secondary);border-style:dashed}
    .kb-q-badge{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-layer-1);font-size:10.5px;font-weight:700;margin-left:6px}
    .kb-q-badge.alert{background:#d64545}
    /* 库约定编辑器（schema.md，每库一份） */
    .kb-schema{display:flex;flex-direction:column;max-width:980px;min-height:0}
    .kb-schema-hint{font-size:12px;line-height:1.7;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));margin:0 0 10px}
    .kb-schema-hint b{color:var(--dsw-alias-label-secondary);font-weight:600}
    .kb-schema-ta{height:calc(100vh - 280px);min-height:340px;width:100%;resize:vertical;font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12.5px;line-height:1.8;padding:14px 16px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word}
    .kb-schema-ta:focus{outline:none;border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 50%,var(--dsw-alias-border-l2))}
    `)

    async function readJson(response) {
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error((payload && payload.error) || `HTTP ${response.status}`)
      return payload
    }

    function fmtSize(n) {
      if (n == null) return ''
      if (n < 1024) return n + ' B'
      if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
      return (n / 1048576).toFixed(1) + ' MB'
    }

    function fmtTime(ms) {
      if (!ms) return ''
      try { return new Date(ms).toLocaleString() } catch { return '' }
    }

    function joinRel(a, b) { return (a ? a + '/' : '') + b }

    function normRel(href) {
      return String(href || '').replace(/^\.\//, '').replace(/^\/+/, '').split('#')[0]
    }

    function apiFile(rel, dl) {
      return `${API}/file?path=${encodeURIComponent(rel)}${dl ? '&dl=1' : ''}&kb=${encodeURIComponent(activeKbId)}`
    }

    /** @绝对路径 → composer（先关 overlay；失败退化复制到剪贴板）。
     *  composer 有两种形态：textarea（旧）/ contenteditable 输入区（2026-09 新组合，
     *  hasTa:false hasCe:true——只找 textarea 会静默退化成剪贴板）。 */
    function insertFileRef(abs) {
      const text = '@' + abs + ' '
      try {
        const card = document.querySelector('[data-composer-card]')
        const ta = card && card.querySelector('textarea')
        const ce = card && (card.querySelector('[contenteditable="true"]') || card.querySelector('[contenteditable=""]'))
        if (typeof document.execCommand === 'function' && (ta || ce)) {
          if (ta) {
            ta.focus()
            const len = ta.value ? ta.value.length : 0
            try { ta.setSelectionRange(len, len) } catch {}
          } else if (ce) {
            ce.focus()
            const sel = window.getSelection()
            const range = document.createRange()
            range.selectNodeContents(ce)
            range.collapse(false) // 光标到末尾
            sel.removeAllRanges()
            sel.addRange(range)
          }
          if (document.execCommand('insertText', false, text)) return 'ok'
        }
      } catch {}
      try { navigator.clipboard.writeText(text) } catch {}
      return 'copied'
    }

    /** 行内 markdown → React 节点：`code` **粗** *斜* [[wikilink]] [文本](链接) ![图片](路径)。 */
    function renderInline(text, nav) {
      const h = React.createElement
      const src = String(text || '')
      const nodes = []
      const re = /(`[^`]+`)|(\[\[([^\]]+)\]\])|(!\[([^\]]*)\]\(([^)]+)\))|(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g
      let last = 0
      let m
      let key = 0
      while ((m = re.exec(src))) {
        if (m.index > last) nodes.push(src.slice(last, m.index))
        if (m[1]) {
          nodes.push(h('code', { className: 'kb-md-code', key: key++ }, m[1].slice(1, -1)))
        } else if (m[3] !== undefined) {
          const target = m[3].trim()
          nodes.push(h('a', {
            className: 'kb-md-wikilink', key: key++, title: '搜索「' + target + '」',
            onClick: (e) => { e.preventDefault(); nav({ kind: 'search', q: target }) },
          }, target))
        } else if (m[5] !== undefined) {
          nodes.push(h('img', { className: 'kb-md-img', key: key++, src: apiFile(normRel(m[6])), alt: m[5], loading: 'lazy' }))
        } else if (m[8] !== undefined) {
          const href = m[9]
          if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
            nodes.push(h('a', { key: key++, href, target: '_blank', rel: 'noreferrer' }, m[8]))
          } else {
            const target = normRel(href)
            nodes.push(h('a', {
              className: 'kb-md-link', key: key++,
              onClick: (e) => { e.preventDefault(); nav({ kind: 'doc', rel: target }) },
            }, m[8]))
          }
        } else if (m[10]) {
          nodes.push(h('strong', { key: key++ }, renderInline(m[11], nav)))
        } else if (m[12]) {
          nodes.push(h('em', { key: key++ }, renderInline(m[13], nav)))
        }
        last = re.lastIndex
      }
      if (last < src.length) nodes.push(src.slice(last))
      return nodes
    }

    /** 极简块级 markdown 渲染：标题/段落/围栏代码/引用/列表/表格/hr。 */
    function renderMarkdown(body, nav) {
      const h = React.createElement
      const lines = String(body || '').split(/\r?\n/)
      const out = []
      let i = 0
      const isBlockStart = (l) => /^(#{1,6}\s|```|\s*>|\s*[-*+]\s|\s*\d+[.)]\s|\s*\|)/.test(l)
      while (i < lines.length) {
        const line = lines[i]
        if (/^```/.test(line)) {
          const buf = []
          i++
          while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++ }
          i++
          out.push(h('pre', { className: 'kb-md-pre', key: out.length }, buf.join('\n')))
          continue
        }
        const hm = /^(#{1,6})\s+(.*)$/.exec(line)
        if (hm) {
          out.push(h('h' + hm[1].length, { className: 'kb-md-h', key: out.length }, renderInline(hm[2], nav)))
          i++
          continue
        }
        if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
          out.push(h('hr', { className: 'kb-md-hr', key: out.length }))
          i++
          continue
        }
        if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
          const parseRow = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
          const head = parseRow(line)
          i += 2
          const rows = []
          while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(parseRow(lines[i])); i++ }
          out.push(h('table', { className: 'kb-md-table', key: out.length },
            h('thead', null, h('tr', null, head.map((c, j) => h('th', { key: j }, renderInline(c, nav))))),
            h('tbody', null, rows.map((r, k) => h('tr', { key: k }, r.map((c, j) => h('td', { key: j }, renderInline(c, nav)))))),
          ))
          continue
        }
        if (/^\s*>\s?/.test(line)) {
          const buf = []
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++ }
          out.push(h('blockquote', { className: 'kb-md-quote', key: out.length }, renderMarkdown(buf.join('\n'), nav)))
          continue
        }
        if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
          const ordered = /^\s*\d+[.)]\s+/.test(line)
          const items = []
          while (i < lines.length) {
            const mm = ordered ? /^\s*\d+[.)]\s+(.*)$/.exec(lines[i]) : /^\s*[-*+]\s+(.*)$/.exec(lines[i])
            if (!mm) break
            items.push(mm[1]); i++
          }
          out.push(h(ordered ? 'ol' : 'ul', { className: 'kb-md-list', key: out.length },
            items.map((it, j) => h('li', { key: j }, renderInline(it, nav)))))
          continue
        }
        if (!line.trim()) { i++; continue }
        const buf = [line]
        i++
        while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) { buf.push(lines[i]); i++ }
        out.push(h('p', { className: 'kb-md-p', key: out.length }, renderInline(buf.join(' '), nav)))
      }
      return out
    }

    /** 搜索命中行高亮。 */
    function HitLine(props) {
      const h = React.createElement
      const { text, q } = props
      const low = text.toLowerCase()
      const needle = q.toLowerCase()
      const parts = []
      let pos = 0
      let key = 0
      if (needle) {
        for (;;) {
          const idx = low.indexOf(needle, pos)
          if (idx < 0) break
          if (idx > pos) parts.push(text.slice(pos, idx))
          parts.push(h('mark', { key: key++ }, text.slice(idx, idx + needle.length)))
          pos = idx + needle.length
        }
      }
      if (pos < text.length) parts.push(text.slice(pos))
      return h('div', { className: 'kb-hit-line' }, h('span', { className: 'ln' }, '#' + props.line), parts)
    }

    /** 懒加载目录树（一个根节点段，如 wiki / raw）。 */
    function TreeSection(props) {
      const h = React.createElement
      const { rootRel, label, cur, onOpen, onAt, reloadTick, kb } = props
      const KBQ = `&kb=${encodeURIComponent(kb || 'main')}`
      const [entries, setEntries] = React.useState(null)
      const [open, setOpen] = React.useState({})
      const [kids, setKids] = React.useState({})

      React.useEffect(() => {
        let alive = true
        setEntries(null)
        fetch(`${API}/tree?path=${encodeURIComponent(rootRel)}${KBQ}`)
          .then(readJson)
          .then((d) => { if (alive) setEntries(d.entries || []) })
          .catch(() => { if (alive) setEntries([]) })
        return () => { alive = false }
      }, [rootRel, reloadTick])

      const loadDir = (rel) => {
        if (kids[rel]) return
        fetch(`${API}/tree?path=${encodeURIComponent(rel)}${KBQ}`)
          .then(readJson)
          .then((d) => setKids((k) => ({ ...k, [rel]: d.entries || [] })))
          .catch(() => setKids((k) => ({ ...k, [rel]: [] })))
      }

      const toggle = (rel) => {
        if (open[rel]) { setOpen((o) => ({ ...o, [rel]: false })); return }
        setOpen((o) => ({ ...o, [rel]: true }))
        loadDir(rel)
      }

      const renderLevel = (rel, depth) => {
        const list = rel === rootRel ? entries : kids[rel]
        if (!list) return [h('div', { className: 'kb-spin', key: rel + ':spin', style: { paddingLeft: depth * 14 + 8 } }, '…')]
        const rows = []
        for (const e of list) {
          const sub = joinRel(rel, e.name)
          if (e.type === 'dir') {
            const isOpen = Boolean(open[sub])
            rows.push(h('button', { className: 'kb-item', key: 'd:' + sub, 'data-cur': cur === sub, style: { paddingLeft: depth * 14 + 8 }, onClick: () => toggle(sub) },
              h('span', { className: 'caret' }, isOpen ? '▾' : '▸'),
              h('span', null, '📁'),
              h('span', { className: 'nm', title: sub }, e.name),
            ))
            if (isOpen) rows.push(...renderLevel(sub, depth + 1))
          } else {
            rows.push(h('div', { className: 'kb-item', key: 'f:' + sub, 'data-cur': cur === sub, style: { paddingLeft: depth * 14 + 8 } },
              h('span', { className: 'caret' }),
              h('span', null, '📄'),
              h('span', { className: 'nm', title: sub, onClick: () => onOpen(sub) }, e.name),
              h('button', { className: 'at', title: '@ 给 agent', onClick: () => onAt(sub) }, '@'),
            ))
          }
        }
        return rows
      }

      return [
        h('div', { className: 'kb-side-h', key: rootRel },
          h('span', null, label),
          props.onUpload && rootRel === 'raw' ? h('label', { className: 'kb-up', title: '上传素材到 raw/（自动蒸馏）' },
            '⬆ 上传',
            h('input', {
              type: 'file', multiple: true, className: 'kb-file',
              onChange: (e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length && props.onUpload) props.onUpload('raw', fs) },
            }),
          ) : null,
        ),
        ...renderLevel(rootRel, 0),
      ]
    }

    /** 首页「最近更新」：读 log.md 尾部，wiki 路径可点直达。 */
    function RecentUpdates(props) {
      const h = React.createElement
      const { onNav, kb } = props
      const [items, setItems] = React.useState(null)

      React.useEffect(() => {
        let alive = true
        fetch(`${API}/doc?path=${encodeURIComponent('log.md')}&kb=${encodeURIComponent(kb || 'main')}`)
          .then(readJson)
          .then((d) => {
            if (!alive) return
            const lines = String((d.doc && d.doc.body) || '').split(/\r?\n/)
              .map((l) => l.trim())
              .filter((l) => /^-\s?\d{4}-\d{2}-\d{2}/.test(l))
            setItems(lines.slice(-8).reverse())
          })
          .catch(() => { if (alive) setItems([]) })
      }, [])

      if (!items || !items.length) return null
      return h('div', { className: 'kb-recent' },
        h('div', { className: 'kb-recent-h' }, '🕘 最近更新', h('span', { className: 'kb-recent-sub' }, 'log.md 尾部，点路径直达')),
        items.map((line, i) => {
          const m = /(wiki\/[^\s←]+)/.exec(line)
          if (!m) return h('div', { className: 'kb-recent-row', key: i }, line)
          const cut = line.indexOf(m[1])
          const head = line.slice(0, cut)
          const tail = line.slice(cut + m[1].length)
          const rawMatch = /←\s*(.+)$/.exec(tail)
          return h('div', { className: 'kb-recent-row', key: i },
            head.trim() && h('span', null, head.trim()),
            h('a', {
              className: 'kb-recent-link',
              onClick: (e) => { e.preventDefault(); onNav({ kind: 'doc', rel: m[1] }) },
            }, m[1]),
            tail && rawMatch
              ? h('span', { className: 'kb-recent-raw' }, ' ← ' + rawMatch[1].trim())
              : (tail.trim() ? h('span', null, tail.trim()) : null),
          )
        }),
      )
    }

    /** 右栏：文档阅读视图。 */
    function DocView(props) {
      const h = React.createElement
      const { rel, root, onNav, onAt, reloadTick, kb } = props
      const [state, setState] = React.useState({ status: 'loading' })

      React.useEffect(() => {
        let alive = true
        setState({ status: 'loading' })
        fetch(`${API}/doc?path=${encodeURIComponent(rel)}&kb=${encodeURIComponent(kb || 'main')}`)
          .then(readJson)
          .then((d) => { if (alive) setState({ status: 'ok', doc: d.doc }) })
          .catch((e) => { if (alive) setState({ status: 'error', message: String((e && e.message) || e) }) })
        return () => { alive = false }
      }, [rel, reloadTick])

      if (state.status === 'loading') return h('div', { className: 'kb-spin' }, '加载中…')
      if (state.status === 'error') return h('div', { className: 'kb-err' }, '读取失败：' + state.message)
      const doc = state.doc
      const fm = doc.frontmatter || {}
      const inRaw = rel === 'raw' || rel.startsWith('raw/')
      const dirOf = rel.indexOf('/') >= 0 ? rel.slice(0, rel.lastIndexOf('/')) : ''

      const meta = []
      if (fm.title) meta.push(h('span', { className: 'kb-chip title', key: 't' }, fm.title))
      if (fm.author) meta.push(h('span', { className: 'kb-chip', key: 'a' }, '👤 ' + fm.author))
      if (fm.updated) meta.push(h('span', { className: 'kb-chip', key: 'u' }, '更新 ' + fm.updated))
      if (Array.isArray(fm.tags) && fm.tags.length) fm.tags.forEach((t, i) => meta.push(h('span', { className: 'kb-chip', key: 'g' + i }, '#' + t)))

      return h('div', null,
        meta.length ? h('div', { className: 'kb-meta' }, meta) : null,
        h('div', { className: 'kb-docbar' },
          h('span', { className: 'kb-docpath', title: rel }, rel + (doc.size != null ? ' · ' + fmtSize(doc.size) : '') + (doc.mtime ? ' · ' + fmtTime(doc.mtime) : '')),
          h('button', { className: 'kb-btn', onClick: () => onAt(rel) }, '@ 给 agent'),
          rel === 'schema.md' && props.onEditSchema ? h('button', { className: 'kb-btn', title: '编辑本库的加工约定（每库独立）', onClick: props.onEditSchema }, '✏️ 编辑约定') : null,
          doc.kind === 'binary' ? h('a', { className: 'kb-btn', style: { textDecoration: 'none' }, href: apiFile(rel, true) }, '下载') : null,
          inRaw ? h('label', { className: 'kb-btn', style: { cursor: 'pointer' }, title: '上传到 ' + (dirOf || 'raw') },
            '上传素材', h('input', { type: 'file', multiple: true, className: 'kb-file', onChange: (e) => props.onUpload(dirOf || 'raw', e.target.files), key: 'up' + rel + String(props.uploadTick || 0) }),
          ) : null,
        ),
        doc.kind === 'md' ? h('div', { className: 'kb-md' }, renderMarkdown(doc.body, onNav)) : null,
        rel === 'index.md' ? h(RecentUpdates, { onNav, kb: props.kb }) : null,
        doc.kind === 'text' ? h('pre', { className: 'kb-md-pre' }, doc.body) : null,
        doc.kind === 'binary' ? h('div', { className: 'kb-empty' }, '二进制/超大文件不支持在线阅读，可下载或 @ 给 agent 处理。') : null,
      )
    }

    /**
     * 右栏：库约定（schema.md）编辑器——每库一份、互不影响。
     * kb-bot 自动蒸馏与交互 agent 加工前都以它为最终权威，保存即对下次加工生效。
     */
    function SchemaEditor(props) {
      const h = React.createElement
      const { kb, kbName, onDone, onHint, onSaved } = props
      const [state, setState] = React.useState({ status: 'loading' })

      React.useEffect(() => {
        let alive = true
        setState({ status: 'loading' })
        fetch(`${API}/schema?kb=${encodeURIComponent(kb || 'main')}`)
          .then(readJson)
          .then((d) => { if (alive) setState({ status: 'ok', text: d.text, exists: d.exists !== false, dirty: false }) })
          .catch((e) => { if (alive) setState({ status: 'error', message: String((e && e.message) || e) }) })
        return () => { alive = false }
      }, [kb])

      const save = async () => {
        try {
          await readJson(await fetch(`${API}/schema?kb=${encodeURIComponent(kb || 'main')}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: state.text }),
          }))
          setState((s) => ({ ...s, dirty: false, exists: true }))
          onHint('约定已保存 · 自动蒸馏与 agent 的下次加工即按新约定执行 ✅')
          if (onSaved) onSaved()
        } catch (e) { onHint('保存失败：' + ((e && e.message) || e)) }
      }

      const resetDefault = async () => {
        try {
          const d = await readJson(await fetch(`${API}/schema/default`))
          setState((s) => ({ ...s, text: d.text, dirty: true }))
        } catch (e) { onHint('获取默认模板失败：' + ((e && e.message) || e)) }
      }

      if (state.status === 'loading') return h('div', { className: 'kb-spin' }, '加载中…')
      if (state.status === 'error') return h('div', { className: 'kb-err' }, '读取失败：' + state.message)
      return h('div', { className: 'kb-schema' },
        h('div', { className: 'kb-docbar' },
          h('span', { className: 'kb-docpath' }, `schema.md · 「${kbName || '主库'}」的加工约定`),
          h('button', { className: 'kb-btn', title: '把编辑框内容换成默认模板（仍需点保存才写入）', onClick: resetDefault }, '恢复默认模板'),
          h('button', { className: 'kb-btn', onClick: () => { if (!state.dirty || window.confirm('有未保存的修改，放弃并返回？')) onDone() } }, '取消'),
          h('button', { className: 'kb-btn primary', disabled: !state.dirty, title: '⌘S / Ctrl+S', onClick: save }, '保存'),
        ),
        h('p', { className: 'kb-schema-hint' },
          h('b', null, '这份约定只作用于当前知识库'), '：kb-bot 自动蒸馏与交互 agent 加工前都会先读它（最终权威），改完保存即生效，无需重启。各库约定互不影响，可按库定制页面规范、目录用途与加工流程。',
          !state.exists ? ' schema.md 当前不存在（曾被删除），保存后将按编辑框内容创建。' : null,
        ),
        h('textarea', {
          className: 'kb-schema-ta', value: state.text, spellCheck: false,
          onChange: (e) => setState((s) => ({ ...s, text: e.target.value, dirty: true })),
          onKeyDown: (e) => {
            if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S') && !(e.isComposing === true)) {
              e.preventDefault()
              if (state.dirty) save()
            }
          },
        }),
      )
    }

    /** 右栏：搜索结果视图。 */
    function SearchView(props) {
      const h = React.createElement
      const { q, onNav, onAt, kb } = props
      const [state, setState] = React.useState({ status: 'loading' })

      React.useEffect(() => {
        let alive = true
        setState({ status: 'loading' })
        fetch(`${API}/search?q=${encodeURIComponent(q)}&kb=${encodeURIComponent(kb || 'main')}`)
          .then(readJson)
          .then((d) => { if (alive) setState({ status: 'ok', data: d }) })
          .catch((e) => { if (alive) setState({ status: 'error', message: String((e && e.message) || e) }) })
        return () => { alive = false }
      }, [q])

      if (state.status === 'loading') return h('div', { className: 'kb-spin' }, '搜索中…')
      if (state.status === 'error') return h('div', { className: 'kb-err' }, '搜索失败：' + state.message)
      const d = state.data
      const hits = d.hits || []
      if (!hits.length) return h('div', { className: 'kb-empty' }, `没有匹配「${q}」的内容`)
      return h('div', null,
        h('p', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))', margin: '0 0 12px' } },
          `${hits.length} 个文件命中「${q}」· ${d.scanned || 0} 个文件已扫描 · ${d.durationMs || 0}ms`),
        hits.map((hit, i) => h('div', { className: 'kb-hit', key: i },
          h('button', { className: 'kb-hit-file', onClick: () => onNav({ kind: 'doc', rel: hit.rel }) }, '📄', hit.rel),
          h('button', { className: 'kb-item', style: { width: 'auto', display: 'inline-flex', marginLeft: 8, padding: '0 6px', fontSize: 11 }, onClick: () => onAt(hit.rel) }, '@'),
          hit.lines.map((l, j) => h(HitLine, { key: j, text: l.text, line: l.line, q })),
        )),
      )
    }

    /** 蒸馏队列状态 chip 文案。 */
    const Q_STATUS_LABEL = { queued: '排队', running: '蒸馏中', done: '完成', failed: '失败', skipped: '跳过' }

    /** 跳到 bot 会话（客户端 sessions 服务 open(id)，dsh-process 同款懒解析）。 */
    function openKbSession(sessionId, hint) {
      const svc = sessionsSvc
      if (!svc || typeof svc.open !== 'function') { hint('客户端会话服务不可用，无法跳转'); return }
      try { svc.open(sessionId); hint('已打开 bot 会话') } catch (e) { hint(String((e && e.message) || e)) }
    }

    /** 右栏：自动蒸馏队列视图（数据由 KbPage 统一轮询，这里只渲染+发起操作）。 */
    function QueueView(props) {
      const h = React.createElement
      const { data, kbs, onAction, onNav, onHint, onToggleDistill } = props
      const kbName = (id) => { const k = (kbs || []).find((x) => x.id === (id || 'main')); return k ? k.name : (id || 'main') }
      const distillKbs = (kbs || []).filter((k) => k.kind === 'material' && k.id !== 'main')
      if (!data) return h('div', { className: 'kb-spin' }, '读取队列…')
      const stats = data.stats || {}
      const statChips = ['running', 'queued', 'failed', 'done', 'skipped'].map((k) =>
        h('span', { className: `kb-chip ${k}`, key: k }, `${Q_STATUS_LABEL[k]} ${stats[k] || 0}`))
      const items = data.items || []
      return h('div', null,
        h('div', { className: 'kb-q-head' },
          h('div', { className: 'kb-q-stats' }, statChips,
            data.enabled === false ? h('span', { className: 'kb-chip skipped' }, '自动蒸馏已停用（设置）') : null,
            data.paused ? h('span', { className: 'kb-chip skipped' }, '已暂停') : null,
          ),
          h('button', { className: 'kb-btn', onClick: () => onAction('pause', { paused: !(data.pausedByUser || data.paused) }) },
            (data.pausedByUser || data.paused) ? '▶ 恢复' : '⏸ 暂停'),
          h('button', { className: 'kb-btn', onClick: () => onAction('scan', {}) }, '扫描 raw/'),
        ),
        distillKbs.length ? h('div', { className: 'kb-q-model' },
          '素材库自动蒸馏：',
          distillKbs.map((k) => h('button', {
            key: k.id, className: 'kb-btn', style: { marginLeft: 6, padding: '2px 8px', fontSize: 11.5 },
            title: k.distillEnabled === false ? '该库自动蒸馏已关，点击开启' : '该库自动蒸馏已开，点击关闭',
            onClick: () => onToggleDistill(k),
          }, `${k.name} · ${k.distillEnabled === false ? '关' : '开'}`)),
        ) : null,
        (data.executorDown || data.lastError) && h('div', { className: 'kb-q-banner' },
          `⚠️ 执行器不可用：${data.lastError || '稍后自动重试'}（排队条目会保留，配置好模型后自动继续）`),
        data.route ? h('div', { className: 'kb-q-model' },
          `⚙️ 蒸馏模型：${data.route.provider}/${data.route.model}`,
          data.route.source === 'default' ? h('span', { className: 'kb-q-model-hint' }, '（跟随宿主默认，设置 → 知识库 可指定）') : h('span', { className: 'kb-q-model-hint' }, '（设置中指定）'),
        ) : null,
        data.enabled === false && h('div', { className: 'kb-q-banner' },
          '自动蒸馏已在设置中停用：素材仍会入队留档，但不会执行；可手动 @ 给 agent 加工。'),
        !items.length && h('div', { className: 'kb-empty' }, '队列为空：往 raw/ 上传素材后会自动入队蒸馏。'),
        items.map((it) => h('div', { className: 'kb-q-row', key: it.id },
          h('div', { className: 'kb-q-main' },
            h('div', { className: 'kb-q-name' },
              h('span', { className: `kb-chip ${it.status}` }, Q_STATUS_LABEL[it.status] || it.status),
              ' ', it.rel.split('/').pop(),
              it.chunk ? h('span', { className: 'kb-q-time' }, `（片 ${it.chunk.idx}/${it.chunk.total}）`) : null,
              it.attempts > 1 ? h('span', { className: 'kb-q-time' }, `（第 ${it.attempts} 次）`) : null,
            ),
            h('div', { className: 'kb-q-rel' }, `[${
              kbName(it.kbId)}] ${it.rel}`),
            it.note ? h('div', { className: `kb-q-note${it.status === 'failed' ? ' err' : ''}`, title: it.error || it.note }, it.note || it.error) : null,
            it.error && it.note ? h('div', { className: 'kb-q-note err', title: it.error }, it.error) : null,
          ),
          h('div', { className: 'kb-q-side' },
            h('span', { className: 'kb-q-time' }, it.finishedAt || it.startedAt ? fmtTime(Date.parse(it.finishedAt || it.startedAt)) : ''),
            h('div', { className: 'kb-q-acts' },
              (it.status === 'done' || it.status === 'failed') && it.pages && it.pages.length
                ? h('button', { className: 'kb-btn', onClick: () => onNav({ kind: 'doc', rel: it.pages[0] }) }, '看产出') : null,
              it.sessionId && (it.status === 'running' || it.status === 'done' || it.status === 'failed')
                ? h('button', { className: 'kb-btn', onClick: () => openKbSession(it.sessionId, onHint) }, '打开会话') : null,
              (it.status === 'failed' || it.status === 'done' || it.status === 'skipped')
                ? h('button', { className: 'kb-btn', onClick: () => onAction('retry', { id: it.id }) }, '重试') : null,
              it.status === 'queued' ? h('button', { className: 'kb-btn', onClick: () => onAction('cancel', { id: it.id }) }, '取消') : null,
            ),
          ),
        )),
      )
    }

    // ── 对话框「+ 知识库」：composer 工具行按钮 + 目录选择浮层 ──────────────
    // 机制对齐 experts-management 的 +专家：conversation.input.left slot +
    // slash/input-insert-text 写草稿（写文本而非 @ 引用——@ 目录卡片行为未约定，
    // 绝对路径 + 明确指令对 agent 最稳）。

    let RDP = null
    try { RDP = require('react-dom') } catch {}

    let kbComposerStyles = null
    function ensureKbComposerStyles() {
      if (kbComposerStyles || typeof document === 'undefined') return
      const style = document.createElement('style')
      style.setAttribute('data-plugin', 'dsh-kb-composer')
      style.textContent = `
    .kbc-chip{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 9px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
    .kbc-chip:hover{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,var(--dsw-alias-border-l2))}
    .kbc-pop{position:fixed;z-index:2147483001;width:320px;max-height:340px;overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 8px 28px rgba(0,0,0,.18);padding:6px}
    .kbc-pop-h{font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));padding:6px 8px 4px}
    .kbc-row{display:flex;align-items:center;gap:6px;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;padding:5px 8px;border-radius:7px;cursor:pointer;text-align:left}
    .kbc-row:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}
    .kbc-row .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .kbc-row .caret{width:14px;flex:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));cursor:pointer;font-size:10px;padding:0}
    .kbc-row .path{font-size:10.5px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
    .kbc-back{position:fixed;inset:0;z-index:2147483000}
    .kb-set-root{font-size:13px;color:var(--dsw-alias-label-primary,var(--dsw-text-primary,inherit));max-width:560px}
    .kb-set-field{display:flex;align-items:center;gap:10px;margin:0 0 10px}
    .kb-set-label{width:220px;flex:none;color:var(--dsw-alias-label-secondary,var(--dsw-text-secondary,inherit))}
    .kb-set-input{flex:1;min-width:0;padding:5px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1,transparent);color:inherit;font:inherit;font-size:12.5px}
    .kb-set-input:focus{outline:none;border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 50%,var(--dsw-alias-border-l2))}
    select.kb-set-input{height:30px;padding:0 8px}

    .kb-set-hint{font-size:11.5px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
    `
      document.head.appendChild(style)
      kbComposerStyles = style
    }

    /** 把文本追加进会话草稿（宿主 slash/input-insert-text 事件，span CAS）。 */
    function insertComposerText(composerScope, sessionId, input, text) {
      const sessions = composerScope && composerScope.sessions
      if (!sessions) return false
      let actx
      try { actx = sessions.scope(sessionId) } catch { return false }
      if (actx === undefined || actx === null || typeof actx.bail !== 'function') return false
      const draft = (input && input.draft) || ''
      const at = draft.length
      try {
        return actx.bail(actx, 'slash/input-insert-text', {
          text,
          span: { start: at, end: at, draftRev: (input && input.draftRev) || 0 },
        }) === true
      } catch { return false }
    }

    let kbRootCache = null // { root, at }
    async function fetchKbRoot() {
      if (kbRootCache && Date.now() - kbRootCache.at < 60000) return kbRootCache.root
      const root = await fetch(`${API}/status`).then(readJson).then((d) => d.root).catch(() => null)
      if (root) kbRootCache = { root, at: Date.now() }
      return root
    }

    /** 知识库目录选择浮层：多库——每个库一节（素材库给 raw/wiki，产出库列根目录）；
     *  点目录/文件一律 @绝对路径 插入。基础行每渲染从 props 推导，懒加载子行存 map。 */
    function KbDirPicker(props) {
      const h = React.createElement
      const { kbs, anchor, onPick } = props
      const [expanded, setExpanded] = React.useState({})
      const [children, setChildren] = React.useState({}) // 'kbId|rel' → 子行
      const [err, setErr] = React.useState(null)

      const loadKids = (row) => {
        const key = row.kbId + '|' + row.rel
        if (children[key]) return
        fetch(`${API}/tree?kb=${encodeURIComponent(row.kbId)}&path=${encodeURIComponent(row.rel)}`)
          .then(readJson)
          .then((d) => {
            const depth = row.depth + 1
            const kids = (d.entries || []).map((e) => ({
              kbId: row.kbId, rel: row.rel ? row.rel + '/' + e.name : e.name,
              name: (e.type === 'dir' ? '📁 ' : '📄 ') + e.name, depth,
              kind: 'dir', expandable: e.type === 'dir',
            }))
            setChildren((c) => ({ ...c, [key]: kids }))
          })
          .catch((e) => setErr(String((e && e.message) || e)))
      }

      const toggle = (row) => {
        const key = row.kbId + '|' + row.rel
        setExpanded((x) => ({ ...x, [key]: !x[key] }))
        loadKids(row)
      }

      const visible = []
      const walk = (kbId, rel, name, depth) => {
        visible.push({ kbId, rel, name, depth })
        const key = kbId + '|' + rel
        if (expanded[key] !== true) return
        for (const c of (children[key] || [])) walk(c.kbId, c.rel, c.name, depth + 1)
      }
      for (const k of (kbs || [])) {
        walk(k.id, '', `📚 ${k.name}`, 0)
        if (k.kind === 'material' && expanded[k.id + '|raw'] === true) {
          // raw/wiki 伪目录：展开时从 loadKids 的缓存取
          walk(k.id, 'raw', 'raw · 原始素材', 1)
        }
        if (k.kind === 'material' && expanded[k.id + '|wiki'] === true) {
          walk(k.id, 'wiki', 'wiki · 成文知识', 1)
        }
      }

      const rowsView = visible.map((r, i) => {
        const key = r.kbId + '|' + r.rel
        const expandable = r.rel === '' || r.rel === 'raw' || r.rel === 'wiki' || (children[key] || []).some((c) => c.expandable) || (children[key] === undefined && r.depth >= 1)
        return h('div', {
          className: 'kbc-row', key: key + i, style: { paddingLeft: 8 + r.depth * 14 },
          onClick: () => {
            const k = (kbs || []).find((x) => x.id === r.kbId)
            if (!k) return
            const abs = r.rel ? k.root.replace(/\/+$/, '') + '/' + r.rel : k.root.replace(/\/+$/, '')
            onPick({ abs })
          },
        },
          expandable
            ? h('button', { className: 'caret', 'aria-label': '展开', onClick: (e) => { e.stopPropagation(); toggle({ kbId: r.kbId, rel: r.rel }) } }, expanded[key] ? '▾' : '▸')
            : h('span', { className: 'caret' }),
          h('span', { className: 'nm' }, r.name),
        )
      })

      const winW = typeof window !== 'undefined' ? window.innerWidth : 1280
      const winH = typeof window !== 'undefined' ? window.innerHeight : 800
      const style = {
        left: Math.max(8, Math.min(anchor.left, winW - 336)),
        bottom: Math.max(8, winH - anchor.top + 6),
        maxHeight: Math.max(180, Math.min(380, anchor.top - 20)),
      }
      return h('div', { className: 'kbc-pop', style, role: 'dialog' },
        h('div', { className: 'kbc-pop-h' }, '选择知识库目录或文件（@ 引用）'),
        err && h('div', { className: 'kbc-pop-h' }, '加载失败：' + err),
        rowsView,
      )
    }

    /** composer 直写兜底：宿主事件通道静默失败时直接操作输入区（textarea/contenteditable）。 */
    function insertTextViaDom(text) {
      try {
        const card = document.querySelector('[data-composer-card]')
        const ta = card && card.querySelector('textarea')
        const ce = card && (card.querySelector('[contenteditable="true"]') || card.querySelector('[contenteditable=""]'))
        if (typeof document.execCommand !== 'function' || (!ta && !ce)) return false
        if (ta) {
          ta.focus()
          const len = ta.value ? ta.value.length : 0
          try { ta.setSelectionRange(len, len) } catch {}
        } else {
          ce.focus()
          const sel = window.getSelection()
          const range = document.createRange()
          range.selectNodeContents(ce)
          range.collapse(false)
          sel.removeAllRanges()
          sel.addRange(range)
        }
        return document.execCommand('insertText', false, text) === true
      } catch { return false }
    }

    /** composer 工具行按钮（conversation.input.left slot）。 */
    function KbComposerButtonSlot(props) {
      const h = React.createElement
      React.useEffect(ensureKbComposerStyles, [])
      const [picker, setPicker] = React.useState(null)
      const [kbs, setKbs] = React.useState([])
      const [msg, setMsg] = React.useState(null)
      const btnRef = React.useRef(null)
      const liveInput = React.useRef(props.input)
      liveInput.current = props.input
      const composerScope = props.composerScopeRef ? props.composerScopeRef() : null
      if (!composerScope || !composerScope.sessions || !props.sessionId) return null

      const close = () => setPicker(null)
      const open = () => {
        let anchor = { left: 16, top: 400 }
        try { if (btnRef.current) anchor = btnRef.current.getBoundingClientRect() } catch {}
        setPicker(anchor)
        fetchKbs(true).then((list) => setKbs(list || []))
      }
      const pick = (target) => {
        const text = `@${target.abs} `
        let ok = insertComposerText(composerScope, props.sessionId, liveInput.current, text)
        if (!ok) ok = insertTextViaDom(text) // 宿主事件通道不响应时直写输入区
        if (ok) setMsg('✓ 已插入引用')
        else { try { navigator.clipboard.writeText(text) } catch {} setMsg('无法自动插入，已复制到剪贴板') }
        close()
        setTimeout(() => setMsg(null), 2600)
        try {
          const card = document.querySelector('[data-composer-card]')
          const ta = card && card.querySelector('textarea')
          if (ta && typeof ta.focus === 'function') ta.focus()
        } catch {}
      }
      const popover = picker !== null && RDP && typeof RDP.createPortal === 'function'
        ? RDP.createPortal(h(KbDirPicker, { kbs, anchor: picker, onPick: pick, onClose: close }), document.body)
        : null
      return h(React.Fragment, null,
        h('button', {
          className: 'kbc-chip', ref: btnRef, title: '基于知识库目录推理', 'aria-haspopup': 'dialog', 'aria-expanded': picker !== null,
          onClick: () => (picker === null ? open() : close()),
        }, '📚 知识库'),
        popover,
        msg ? RDP.createPortal(h('div', { className: 'kbc-pop', style: { position: 'fixed', left: 12, bottom: 12, width: 'auto', maxHeight: 'none', padding: '8px 14px', fontSize: 12.5 } }, msg), document.body) : null,
      )
    }

    // ── 侧栏导航入口（工艺库下方，dsh-process 同款 DOM 注入）────────────────
    const KB_ENTRY_ATTR = 'data-dsh-kb-entry'

    function kbSidebarRoot() {
      const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"], .dshDesktopUpstreamSidebar, .dshDesktopSidebarSurface')
      if (column === null) return undefined
      const logoOwner = column.querySelector('[class*="logoRow"]') && column.querySelector('[class*="logoRow"]').parentElement
      return logoOwner || (column.firstElementChild || undefined)
    }

    function kbNewSessionButton(root) {
      const nested = root.querySelector('button[class*="newSession"]')
      if (nested) return nested
      for (const child of root.children) {
        if (child instanceof HTMLButtonElement && !child.matches('[' + KB_ENTRY_ATTR + ']')) return child
      }
      const buttons = Array.from(root.querySelectorAll('button'))
      return buttons.find((b) => !b.matches('[' + KB_ENTRY_ATTR + ']') && /新会话|新建会话|new session/i.test(b.textContent || ''))
    }

    function placeKbEntry(root, entry) {
      const button = kbNewSessionButton(root)
      if (!button) return false
      if (entry.parentElement !== root) {
        const family = Array.from(root.children).filter((el) => el instanceof HTMLElement
          && el.matches('[data-dsh-prc-entry],[data-dsh-atb-entry],[data-dsh-taskboard-entry],[data-dsh-ssh-entry],[' + KB_ENTRY_ATTR + ']'))
        if (family.length > 0) {
          const last = family[family.length - 1]
          last.parentElement.insertBefore(entry, last.nextSibling)
        } else {
          const row = button.closest('[class*="logoRow"]')
          const base = (row && row.parentElement === root) ? row : button
          root.insertBefore(entry, base.nextSibling)
        }
      }
      return true
    }

    function mountKbSidebarEntry() {
      let style = document.getElementById('dsh-kb-sidebar-style')
      if (!style) {
        style = document.createElement('style')
        style.id = 'dsh-kb-sidebar-style'
        style.textContent = `
    .dsh-kb-entry{display:flex;align-items:center;gap:8px;width:100%;height:34px;padding:0 10px;margin:2px 0 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,var(--dsw-text-primary,inherit));font:inherit;font-size:13px;cursor:pointer;text-align:left}
    .dsh-kb-entry:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}
    .dsh-kb-entry .dsh-kb-entry-icon{flex:none}
    .dsh-kb-entry .dsh-kb-entry-stats{margin-left:auto;display:inline-flex;gap:3px;font-size:11px;color:var(--dsw-alias-label-secondary,var(--dsw-text-secondary,gray));font-variant-numeric:tabular-nums;white-space:nowrap}
    [data-sidebar-collapsed] .dsh-kb-entry,[class*="_collapsed"] .dsh-kb-entry{width:36px;height:36px;min-width:36px;margin:0 0 12px;padding:0;justify-content:center;gap:0;text-align:center}
    [data-sidebar-collapsed] .dsh-kb-entry .dsh-kb-entry-label,[data-sidebar-collapsed] .dsh-kb-entry .dsh-kb-entry-stats,[class*="_collapsed"] .dsh-kb-entry .dsh-kb-entry-label,[class*="_collapsed"] .dsh-kb-entry .dsh-kb-entry-stats{display:none}
    `
        document.head.appendChild(style)
      }
      const entry = document.createElement('button')
      entry.type = 'button'
      entry.setAttribute(KB_ENTRY_ATTR, '')
      entry.className = 'dsh-kb-entry'
      entry.title = '知识库 — 浏览 / 搜索 / 蒸馏队列'
      entry.innerHTML = '<span class="dsh-kb-entry-icon">📚</span><span class="dsh-kb-entry-label">知识库</span><span class="dsh-kb-entry-stats"></span>'
      entry.addEventListener('click', () => { if (kbOpen) kbOpen() })
      const stats = entry.querySelector('.dsh-kb-entry-stats')
      const refreshStats = () => {
        fetch(`${API}/status`).then((r) => r.json()).then((d) => {
          if (stats && d && d.counts) stats.textContent = d.counts.wiki + ' | ' + d.counts.raw
        }).catch(() => {})
      }
      refreshStats()
      const poll = setInterval(refreshStats, 30000)
      let root
      let placed = false
      const rootObserver = new MutationObserver(() => {
        if (!root || !root.isConnected) { placed = false; tryPlace(); return }
        if (!root.contains(entry)) placed = placeKbEntry(root, entry)
      })
      const tryPlace = () => {
        if (root && !root.isConnected) { rootObserver.disconnect(); root = undefined; placed = false }
        if (placed) { if (document.body.contains(entry)) return; rootObserver.disconnect(); root = undefined; placed = false }
        root = root || kbSidebarRoot()
        if (!root) return
        placed = placeKbEntry(root, entry)
        if (placed) rootObserver.observe(root, { childList: true })
      }
      const waitObserver = new MutationObserver(() => tryPlace())
      waitObserver.observe(document.body, { childList: true, subtree: true })
      const retry = setInterval(tryPlace, 2000)
      tryPlace()
      return () => {
        clearInterval(retry)
        waitObserver.disconnect()
        rootObserver.disconnect()
        try { entry.remove() } catch {}
      }
    }

    /** 设置页「知识库」区块：自动蒸馏开关与模型路由下拉（GET/PUT /autodistill + GET /models）。 */
    function KbSettingsSection() {
      const h = React.createElement
      React.useEffect(ensureKbComposerStyles, [])
      const [st, setSt] = React.useState(null)
      const [saving, setSaving] = React.useState(false)
      const [msg, setMsg] = React.useState(null)
      const [route, setRoute] = React.useState(null)
      const [providers, setProviders] = React.useState([])

      const load = () => {
        fetch(`${API}/autodistill`).then(readJson).then((d) => {
          setSt({
            enabled: d.settings.enabled !== false,
            provider: d.settings.provider || '',
            model: d.settings.model || '',
            timeoutMin: d.settings.timeoutMin,
            maxAttempts: d.settings.maxAttempts,
            sweepSec: d.settings.sweepSec,
          })
          setRoute(d.route)
        }).catch(() => setMsg('加载失败'))
        fetch(`${API}/models`).then(readJson).then((d) => setProviders(d.providers || [])).catch(() => setProviders([]))
      }
      React.useEffect(load, [])

      const set = (key) => (e) => {
        const v = e.target.type === 'checkbox' ? e.target.checked : (e.target.type === 'number' ? Number(e.target.value) : e.target.value)
        setSt((s) => ({ ...s, [key]: v }))
      }

      const row = (label, control) => h('div', { className: 'kb-set-field' },
        h('span', { className: 'kb-set-label' }, label),
        h('span', { style: { flex: 1, minWidth: 0 } }, control),
      )

      if (!st) return h('div', { className: 'kb-set-root' }, '加载中…')

      const providerSelect = providers.length
        ? (() => {
          const opts = providers.map((p) => h('option', { key: p.id, value: p.id }, p.name || p.id))
          if (st.provider && !providers.some((p) => p.id === st.provider)) opts.push(h('option', { key: '__cur', value: st.provider }, st.provider))
          return h('select', { className: 'kb-set-input', value: st.provider, onChange: (e) => setSt((s) => ({ ...s, provider: e.target.value, model: '' })) },
            h('option', { value: '' }, '跟随宿主默认'),
            opts,
          )
        })()
        : h('input', { className: 'kb-set-input', type: 'text', value: st.provider, placeholder: '如 deepseek-official', onChange: set('provider') })

      const providerModels = (() => {
        const p = providers.find((x) => x.id === st.provider)
        return p ? p.models.map((m) => ({ id: m.id, name: m.name || m.id })) : []
      })()
      const modelControl = st.provider === ''
        ? h('input', { className: 'kb-set-input', type: 'text', value: st.model, placeholder: '跟随宿主默认', disabled: providers.length > 0, onChange: set('model') })
        : (() => {
          const opts = providerModels.map((m) => h('option', { key: m.id, value: m.id }, m.name))
          if (st.model && !providerModels.some((m) => m.id === st.model)) opts.push(h('option', { key: '__cur', value: st.model }, st.model))
          return h('select', { className: 'kb-set-input', value: st.model, onChange: set('model') },
            h('option', { value: '' }, providerModels.length ? '选择模型（必填）' : '选择模型'),
            opts,
          )
        })()

      const save = async () => {
        setSaving(true)
        try {
          const d = await readJson(await fetch(`${API}/autodistill`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(st) }))
          setSt({ enabled: d.settings.enabled !== false, provider: d.settings.provider || '', model: d.settings.model || '', timeoutMin: d.settings.timeoutMin, maxAttempts: d.settings.maxAttempts, sweepSec: d.settings.sweepSec })
          setRoute(d.route)
          setMsg('✓ 已保存')
        } catch (e) { setMsg('保存失败：' + ((e && e.message) || e)) }
        setSaving(false)
        setTimeout(() => setMsg(null), 2600)
      }

      return h('div', { className: 'kb-set-root' },
        h('p', { className: 'kb-set-hint', style: { margin: '0 0 10px' } }, '上传到知识库 raw/ 的素材自动入队，由 bot 会话按 schema 蒸馏成文；进度见知识库页「蒸馏队列」。'),
        row('启用自动蒸馏', h('input', { type: 'checkbox', checked: st.enabled === true, onChange: set('enabled') })),
        row('Provider', providerSelect),
        row('Model', modelControl),
        row('单条目超时（分钟）', h('input', { className: 'kb-set-input', type: 'number', value: st.timeoutMin == null ? '' : st.timeoutMin, onChange: set('timeoutMin') })),
        row('失败重试上限', h('input', { className: 'kb-set-input', type: 'number', value: st.maxAttempts == null ? '' : st.maxAttempts, onChange: set('maxAttempts') })),
        row('兜底扫描周期（秒）', h('input', { className: 'kb-set-input', type: 'number', value: st.sweepSec == null ? '' : st.sweepSec, onChange: set('sweepSec') })),
        route ? h('div', { className: 'kb-set-hint' }, `当前生效：${route.provider}/${route.model}（${route.source === 'override' ? '设置指定' : '宿主默认'}）`) : null,
        h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 } },
          h('button', { className: 'kbc-chip', disabled: saving, onClick: save, style: saving ? { opacity: .6 } : null }, saving ? '保存中…' : '保存'),
          msg ? h('span', { className: 'kb-set-hint' }, msg) : null,
        ),
      )
    }

    /** 全页知识库 overlay + 侧栏触发按钮。 */
    let kbOpen = null // 侧栏 DOM 入口 → 打开 overlay 的桥（KbPage 挂载时注册）
    function KbPage() {
      const h = React.createElement
      const [open, setOpen] = React.useState(false)
      React.useEffect(() => {
        kbOpen = () => setOpen(true)
        return () => { kbOpen = null }
      }, [])
      const [status, setStatus] = React.useState(null)
      const [nav, setNav] = React.useState({ kind: 'doc', rel: 'index.md' })
      const [query, setQuery] = React.useState('')
      const [error, setError] = React.useState(null)
      const [toast, setToast] = React.useState(null)
      const [reloadTick, setReloadTick] = React.useState(0)
      const [uploadTick, setUploadTick] = React.useState(0)
      const [queueData, setQueueData] = React.useState(null)
      const [kbs, setKbs] = React.useState(null)
      const [kbId, setKbId] = React.useState('main')
      const [adding, setAdding] = React.useState(null) // null | {name, root, kind}
      const [busy, setBusy] = React.useState(false)

      const fetchQueue = () => {
        fetch(`${API}/queue`)
          .then(readJson)
          .then((d) => setQueueData(d))
          .catch(() => { /* 队列面板打开时自有错误提示；徽章静默 */ })
      }

      React.useEffect(() => {
        if (!open) return undefined
        fetchQueue()
        const timer = setInterval(fetchQueue, 2500)
        return () => clearInterval(timer)
      }, [open])

      const queueAction = async (op, body) => {
        try {
          await readJson(await fetch(`${API}/queue/${op}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body || {}),
          }))
          if (op !== 'scan') showHint(op === 'pause' ? (body.paused ? '队列已暂停（跑完当前为止）' : '队列已恢复') : '已执行')
        } catch (e) {
          showHint(`操作失败：${(e && e.message) || e}`)
        }
        fetchQueue()
      }

      const refresh = () => {
        setError(null)
        fetch(`${API}/status?kb=${encodeURIComponent(kbId)}`)
          .then(readJson)
          .then((s) => { setStatus(s); setReloadTick((t) => t + 1) })
          .catch((e) => setError(String((e && e.message) || e)))
      }

      React.useEffect(() => {
        if (open) { refresh(); fetchKbs(true).then((l) => setKbs(l || [])) }
      }, [open, kbId])
      React.useEffect(() => { activeKbId = kbId }, [kbId])

      React.useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && open && !(e.isComposing === true)) setOpen(false) }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [open])

      const showHint = (msg) => {
        setToast(msg)
        setTimeout(() => setToast(null), 3500)
      }

      const atRel = (rel) => {
        const root = status && status.root ? String(status.root).replace(/\/+$/, '') : ''
        if (!root) { showHint('知识库根不可用'); return }
        setOpen(false)
        const result = insertFileRef(root + '/' + rel)
        showHint(result === 'ok' ? `已把 @${rel} 插入输入框` : '无法自动插入，已复制到剪贴板，请在输入框粘贴')
      }

      const doSearch = () => {
        const q = query.trim()
        if (!q) return
        setNav({ kind: 'search', q })
      }

      const upload = async (dir, files) => {
        if (!files || !files.length) return
        const cur = (kbs || []).find((k) => k.id === kbId)
        if (cur && cur.kind !== 'material') { showHint('产出库只读，不支持上传'); return }
        setError(null)
        const list = Array.from(files)
        let okCount = 0
        for (const f of list) {
          try {
            await readJson(await fetch(`${API}/upload?dir=${encodeURIComponent(dir)}&name=${encodeURIComponent(f.name)}&kb=${encodeURIComponent(kbId)}`, { method: 'POST', body: f }))
            okCount++
          } catch (e) {
            setError(`上传 ${f.name} 失败：${(e && e.message) || e}`)
          }
        }
        if (okCount) showHint(`已上传 ${okCount} 个素材到 ${dir}/ · 自动蒸馏已入队 ⚗️`)
        setUploadTick((t) => t + 1)
        setReloadTick((t) => t + 1)
        fetchKbs(true).then((l) => setKbs(l || []))
      }

      // ── 多库管理 ──
      const delKb = async (k) => {
        if (!window.confirm(`移除知识库「${k.name}」？磁盘数据不受影响。`)) return
        try {
          await readJson(await fetch(`${API}/kb/delete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: k.id }) }))
          fetchKbs(true).then((l) => setKbs(l || []))
          if (kbId === k.id) setKbId('main')
          setReloadTick((t) => t + 1)
          showHint(`已移除「${k.name}」`)
        } catch (e) { showHint('移除失败：' + ((e && e.message) || e)) }
      }
      const toggleDistill = async (k) => {
        try {
          await readJson(await fetch(`${API}/kb/update`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: k.id, distillEnabled: k.distillEnabled === false }) }))
          fetchKbs(true).then((l) => setKbs(l || []))
        } catch (e) { showHint('操作失败：' + ((e && e.message) || e)) }
      }
      const addKb = async () => {
        if (!adding) return
        setBusy(true)
        try {
          const d = await readJson(await fetch(`${API}/kb`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(adding) }))
          setAdding(null)
          fetchKbs(true).then((l) => setKbs(l || []))
          setKbId(d.kb.id)
          setReloadTick((t) => t + 1)
          showHint(`已添加「${d.kb.name}」`)
        } catch (e) { showHint('添加失败：' + ((e && e.message) || e)) }
        setBusy(false)
      }

      // 上传目标目录：正在看 raw/ 下文档时传其所在目录，否则 raw/ 根
      const uploadTargetDir = () => {
        if (nav.kind === 'doc' && nav.rel && nav.rel.startsWith('raw/') && nav.rel.includes('/')) {
          const d = nav.rel.slice(0, nav.rel.lastIndexOf('/'))
          if (d && d !== 'raw') return d
        }
        return 'raw'
      }

      // 整窗拖拽投放（计数器防 dragleave 穿越子元素抖动）
      const dragDepth = React.useRef(0)
      const [dropping, setDropping] = React.useState(false)
      const onDragEnter = (e) => {
        e.preventDefault()
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
          dragDepth.current++
          setDropping(true)
        }
      }
      const onDragOver = (e) => { e.preventDefault() }
      const onDragLeave = () => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (!dragDepth.current) setDropping(false)
      }
      const onDrop = (e) => {
        e.preventDefault()
        dragDepth.current = 0
        setDropping(false)
        const files = Array.from((e.dataTransfer && e.dataTransfer.files) || [])
        if (files.length) upload(uploadTargetDir(), files)
      }

      const onNav = (n) => {
        setNav(n)
        if (n.kind === 'search') setQuery(n.q)
      }

      const quick = (rel, label, icon) => h('button', { className: 'kb-item', 'data-cur': nav.kind === 'doc' && nav.rel === rel, onClick: () => onNav({ kind: 'doc', rel }) },
        h('span', null, icon), h('span', { className: 'nm' }, label))

      const qStats = queueData && queueData.stats
      const qPending = qStats ? (qStats.queued || 0) + (qStats.running || 0) : 0
      const qFailed = qStats ? qStats.failed || 0 : 0
      const queueEntry = h('button', { className: 'kb-item', 'data-cur': nav.kind === 'queue', onClick: () => onNav({ kind: 'queue' }) },
        h('span', null, '⚗️'),
        h('span', { className: 'nm' }, '蒸馏队列'),
        qPending > 0 ? h('span', { className: `kb-q-badge${qFailed > 0 ? ' alert' : ''}` }, qPending) : null,
      )

      const counts = status && status.counts
        ? h('span', { className: 'kb-counts' }, `wiki ${status.counts.wiki} · raw ${status.counts.raw}`)
        : null

      const curKb = (kbs || []).find((k) => k.id === kbId)
      const schemaBtn = h('button', {
        className: 'kb-btn',
        title: curKb && curKb.kind !== 'material' ? '产出库只读' : '编辑当前知识库的加工约定（schema.md，每库独立）',
        disabled: !curKb || curKb.kind !== 'material',
        onClick: () => onNav({ kind: 'schema-edit' }),
      }, '📐 约定')

      return h(React.Fragment, null,
        h('button', { type: 'button', className: 'kb-trigger', onClick: () => setOpen(true), 'aria-label': '知识库' },
          h('span', { 'aria-hidden': 'true' }, '📚'), h('span', null, '知识库')),
        open && h('div', {
          className: 'kb-page' + (dropping ? ' kb-drop' : ''),
          role: 'dialog', 'aria-modal': 'true',
          onDragEnter, onDragOver, onDragLeave, onDrop,
        },
          h('div', { className: 'kb-head' },
            h('p', { className: 'kb-title' }, '📚 ', (kbs || []).find((k) => k.id === kbId)?.name || '知识库', counts),
            h('input', {
              className: 'kb-search', placeholder: '全文搜索（Enter）…', value: query,
              onChange: (e) => setQuery(e.target.value),
              onKeyDown: (e) => { if (e.key === 'Enter' && !(e.isComposing === true)) doSearch() },
            }),
            h('span', { className: 'kb-root', title: status && status.root }, status && status.root ? status.root : ''),
            schemaBtn,
            h('label', { className: 'kb-btn primary', style: { cursor: 'pointer' }, title: '上传素材（自动蒸馏入队）' },
              '⬆ 上传素材',
              h('input', {
                type: 'file', multiple: true, className: 'kb-file',
                onChange: (e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) upload(uploadTargetDir(), fs) },
              }),
            ),
            h('button', { className: 'kb-btn', onClick: refresh }, '刷新'),
            h('button', { className: 'kb-btn', onClick: () => setOpen(false) }, '✕ 关闭'),
          ),
          h('div', { className: 'kb-body' },
            h('div', { className: 'kb-side' },
              h('div', { className: 'kb-side-h' }, '知识库',
                h('button', { title: adding ? '取消添加' : '添加知识库（素材库可自动蒸馏；产出库只读）', onClick: () => setAdding(adding ? null : { name: '', root: '', kind: 'material', distillEnabled: true }) }, adding ? '× 取消' : '＋ 添加'),
              ),
              (kbs || []).map((k) => h('div', { key: k.id, style: { display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 } },
                h('button', {
                  className: 'kb-item', 'data-cur': k.id === kbId, style: { flex: '1 1 0', minWidth: 0, width: 'auto' }, title: k.root,
                  onClick: () => { setKbId(k.id); setNav({ kind: 'doc', rel: 'index.md' }) },
                },
                  h('span', null, k.kind === 'produced' ? '📁' : '📚'),
                  h('span', { className: 'nm' }, k.name),
                  k.counts ? h('span', { className: 'kb-counts' }, `${k.counts.wiki}|${k.counts.raw}`) : null,
                ),
                k.id !== 'main' ? h('button', { className: 'at', title: '移除该知识库（不删数据）', onClick: (e) => { e.stopPropagation(); delKb(k) } }, '✕') : null,
              )),
              adding ? h('div', { style: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 8, margin: '4px 0 8px', display: 'grid', gap: 6 } },
                h('input', { className: 'kb-search', style: { width: '100%' }, placeholder: '名称（默认取目录名）', value: adding.name, onChange: (e) => setAdding((a) => ({ ...a, name: e.target.value })) }),
                h('input', { className: 'kb-search', style: { width: '100%' }, placeholder: '文件夹绝对路径（不存在将自动创建）', value: adding.root, onChange: (e) => setAdding((a) => ({ ...a, root: e.target.value })) }),
                h('label', { style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 } },
                  h('input', { type: 'checkbox', checked: adding.kind === 'material', onChange: (e) => setAdding((a) => ({ ...a, kind: e.target.checked ? 'material' : 'produced' })) }),
                  '素材库（建骨架并可自动蒸馏；产出库只读）',
                ),
                h('button', { className: 'kb-btn primary', disabled: busy || !adding.root.trim(), onClick: addKb }, busy ? '添加中…' : '添加'),
                h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))' } }, '注意：添加后该目录将可经局域网 API 浏览/上传。'),
              ) : null,
              quick('index.md', '目录', '📖'),
              quick('log.md', '操作流水', '🧾'),
              quick('schema.md', 'KB 约定', '📐'),
              queueEntry,
              h(TreeSection, { rootRel: 'wiki', label: 'wiki · 成文知识', kb: kbId, cur: nav.kind === 'doc' ? nav.rel : '', onOpen: (rel) => onNav({ kind: 'doc', rel }), onAt: atRel, reloadTick }),
              h(TreeSection, { rootRel: 'raw', label: 'raw · 素材（不可变）', kb: kbId, cur: nav.kind === 'doc' ? nav.rel : '', onOpen: (rel) => onNav({ kind: 'doc', rel }), onAt: atRel, onUpload: upload, reloadTick }),
            ),
            h('div', { className: 'kb-main' },
              error && h('div', { className: 'kb-err' }, error),
              !error && nav.kind === 'doc' && h(DocView, { rel: nav.rel, root: status && status.root, kb: kbId, onNav, onAt: atRel, onUpload: upload, reloadTick, uploadTick, onEditSchema: nav.rel === 'schema.md' ? () => onNav({ kind: 'schema-edit' }) : null }),
              !error && nav.kind === 'schema-edit' && h(SchemaEditor, {
                kb: kbId, kbName: curKb && curKb.name, onHint: showHint,
                onDone: () => onNav({ kind: 'doc', rel: 'schema.md' }),
                onSaved: () => setReloadTick((t) => t + 1),
              }),
              !error && nav.kind === 'search' && h(SearchView, { q: nav.q, kb: kbId, onNav, onAt: atRel }),
              !error && nav.kind === 'queue' && h(QueueView, { data: queueData, kbs, onToggleDistill: toggleDistill, onAction: queueAction, onNav, onHint: showHint }),
            ),
          ),
        ),
        toast && h('div', { className: 'kb-toast' }, toast),
      )
    }

    module.exports = {
      name: '@weibaohui/dsh-kb',
      inject: ['slots'],

      apply(ctx) {
        const slots = ctx.get('slots')
        if (slots === undefined) return
        // 不 return 任何值（cordis-plugin-loader 把 apply 返回值当 disposable/effect）。

        // 会话服务：动态 inject（客户端 ctx 支持；缺席时「打开会话」降级提示）
        try {
          if (typeof ctx.inject === 'function') ctx.inject(['sessions'], (scope) => { sessionsSvc = scope && scope.sessions })
        } catch (e) { console.error('[dsh-kb] sessions inject:', e) }

        // 侧栏导航入口（工艺库下方，dsh-process 同款 DOM 注入）+ 隐藏挂载 overlay
        try {
          const RDClient = require('react-dom/client')
          if (RDClient && typeof RDClient.createRoot === 'function') {
            const mount = document.createElement('div')
            mount.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;'
            document.body.appendChild(mount)
            RDClient.createRoot(mount).render(React.createElement(KbPage))
            const disposeSidebar = mountKbSidebarEntry()
            ctx.effect(() => () => { disposeSidebar(); try { RDClient.createRoot(mount).unmount() } catch {} }, 'dsh-kb: sidebar entry')
          }
        } catch (e) { console.error('[dsh-kb] sidebar entry:', e) }

        // 设置页「知识库」区块（自动蒸馏配置）
        try {
          ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section',
            id: '@weibaohui/dsh-kb',
            order: 65,
            label: () => '知识库',
            inject: () => ({}),
          }, function KbSettingsSlot() {
            return React.createElement(KbSettingsSection)
          }))
        } catch (e) { console.error('[dsh-kb] settings section inject:', e) }

        // 对话框「+ 知识库」按钮（composer 工具行）：动态 inject（静态列服务会拖住插件激活）
        try {
          let composerScope = null
          if (typeof ctx.inject === 'function') {
            ctx.inject(['inputTriggers', 'sessions'], (scope) => { composerScope = scope })
          }
          ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
            name: 'conversation.input.left',
            id: '@weibaohui/dsh-kb',
            order: 63,
            label: () => '基于知识库推理',
            inject: () => ({}),
          }, function KbComposerSlot(apiProps) {
            return React.createElement(KbComposerButtonSlot, {
              composerScopeRef: () => composerScope,
              sessionId: apiProps && apiProps.sessionId,
              input: apiProps && apiProps.input,
            })
          }))
        } catch (e) { console.error('[dsh-kb] composer inject:', e) }
      },
    }

    return module.exports
  }
})
