'use strict'

/**
 * @weibaohui/dsh-kb — Client half
 *
 * 侧栏底部入口（sidebar.footer.action）→ 全页知识库 overlay（dsh-tasks 同款交互）：
 *  - 左栏：快捷入口（index/log/schema）+ wiki/ 与 raw/ 懒加载目录树；
 *  - 右栏：markdown 阅读渲染（frontmatter 徽章、[[wikilink]]、内部链接、图片、代码块）
 *    或全文搜索结果（内置扫描引擎，命中高亮）；
 *  - raw/ 下可上传素材（唯一写路径，服务端强制），任意条目可「@ 给 agent」注入 composer
 *    （先关 overlay 再注入，composer 不可得时退化为复制到剪贴板）。
 *
 * 数据通道：宿主同源路由 /dsh-kb/api（固定知识库根，服务端边界校验）。
 * 自包含：只依赖注入的 react（createElement/hooks），不用 react-dom 等平台模块。
 */

const API = '/dsh-kb/api'

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
.kb-spin{padding:24px 0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:12px}
/* 首页最近更新(log.md 尾部) */
.kb-recent{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);padding:8px 12px;margin:0 0 14px}
.kb-recent-h{font-size:12px;font-weight:600;margin:2px 0 4px;display:flex;gap:6px;align-items:center}
.kb-recent-sub{font-weight:400;font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.kb-recent-row{font-size:12px;line-height:1.9;color:var(--dsw-alias-label-secondary)}
.kb-recent-link{color:var(--dsw-alias-brand-primary);cursor:pointer}
.kb-recent-link:hover{text-decoration:underline}
.kb-recent-raw{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:11px}
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
  return `${API}/file?path=${encodeURIComponent(rel)}${dl ? '&dl=1' : ''}`
}

/** @绝对路径 → composer（先关 overlay；失败退化复制到剪贴板）。 */
function insertFileRef(abs) {
  const text = '@' + abs + ' '
  try {
    const card = document.querySelector('[data-composer-card]')
    const ta = card && card.querySelector('textarea')
    if (ta && typeof document.execCommand === 'function') {
      ta.focus()
      const len = ta.value ? ta.value.length : 0
      try { ta.setSelectionRange(len, len) } catch {}
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
  const { rootRel, label, cur, onOpen, onAt, reloadTick } = props
  const [entries, setEntries] = React.useState(null)
  const [open, setOpen] = React.useState({})
  const [kids, setKids] = React.useState({})

  React.useEffect(() => {
    let alive = true
    setEntries(null)
    fetch(`${API}/tree?path=${encodeURIComponent(rootRel)}`)
      .then(readJson)
      .then((d) => { if (alive) setEntries(d.entries || []) })
      .catch(() => { if (alive) setEntries([]) })
    return () => { alive = false }
  }, [rootRel, reloadTick])

  const loadDir = (rel) => {
    if (kids[rel]) return
    fetch(`${API}/tree?path=${encodeURIComponent(rel)}`)
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
    h('div', { className: 'kb-side-h', key: rootRel }, h('span', null, label)),
    ...renderLevel(rootRel, 0),
  ]
}

/** 首页「最近更新」：读 log.md 尾部，wiki 路径可点直达。 */
function RecentUpdates(props) {
  const h = React.createElement
  const { onNav } = props
  const [items, setItems] = React.useState(null)

  React.useEffect(() => {
    let alive = true
    fetch(`${API}/doc?path=${encodeURIComponent('log.md')}`)
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
  const { rel, root, onNav, onAt, reloadTick } = props
  const [state, setState] = React.useState({ status: 'loading' })

  React.useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    fetch(`${API}/doc?path=${encodeURIComponent(rel)}`)
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
      doc.kind === 'binary' ? h('a', { className: 'kb-btn', style: { textDecoration: 'none' }, href: apiFile(rel, true) }, '下载') : null,
      inRaw ? h('label', { className: 'kb-btn', style: { cursor: 'pointer' }, title: '上传到 ' + (dirOf || 'raw') },
        '上传素材', h('input', { type: 'file', multiple: true, className: 'kb-file', onChange: (e) => props.onUpload(dirOf || 'raw', e.target.files), key: 'up' + rel + String(props.uploadTick || 0) }),
      ) : null,
    ),
    doc.kind === 'md' ? h('div', { className: 'kb-md' }, renderMarkdown(doc.body, onNav)) : null,
    rel === 'index.md' ? h(RecentUpdates, { onNav }) : null,
    doc.kind === 'text' ? h('pre', { className: 'kb-md-pre' }, doc.body) : null,
    doc.kind === 'binary' ? h('div', { className: 'kb-empty' }, '二进制/超大文件不支持在线阅读，可下载或 @ 给 agent 处理。') : null,
  )
}

/** 右栏：搜索结果视图。 */
function SearchView(props) {
  const h = React.createElement
  const { q, onNav, onAt } = props
  const [state, setState] = React.useState({ status: 'loading' })

  React.useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    fetch(`${API}/search?q=${encodeURIComponent(q)}`)
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

/** 全页知识库 overlay + 侧栏触发按钮。 */
function KbPage() {
  const h = React.createElement
  const [open, setOpen] = React.useState(false)
  const [status, setStatus] = React.useState(null)
  const [nav, setNav] = React.useState({ kind: 'doc', rel: 'index.md' })
  const [query, setQuery] = React.useState('')
  const [error, setError] = React.useState(null)
  const [toast, setToast] = React.useState(null)
  const [reloadTick, setReloadTick] = React.useState(0)
  const [uploadTick, setUploadTick] = React.useState(0)

  const refresh = () => {
    setError(null)
    fetch(`${API}/status`)
      .then(readJson)
      .then((s) => { setStatus(s); setReloadTick((t) => t + 1) })
      .catch((e) => setError(String((e && e.message) || e)))
  }

  React.useEffect(() => {
    if (open) refresh()
  }, [open])

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
    setError(null)
    const list = Array.from(files)
    for (const f of list) {
      try {
        await readJson(await fetch(`${API}/upload?dir=${encodeURIComponent(dir)}&name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f }))
        showHint(`已上传 ${f.name} 到 ${dir}/`)
      } catch (e) {
        setError(`上传 ${f.name} 失败：${(e && e.message) || e}`)
      }
    }
    setUploadTick((t) => t + 1)
    setReloadTick((t) => t + 1)
  }

  const onNav = (n) => {
    setNav(n)
    if (n.kind === 'search') setQuery(n.q)
  }

  const quick = (rel, label, icon) => h('button', { className: 'kb-item', 'data-cur': nav.kind === 'doc' && nav.rel === rel, onClick: () => onNav({ kind: 'doc', rel }) },
    h('span', null, icon), h('span', { className: 'nm' }, label))

  const counts = status && status.counts
    ? h('span', { className: 'kb-counts' }, `wiki ${status.counts.wiki} · raw ${status.counts.raw}`)
    : null

  return h(React.Fragment, null,
    h('button', { type: 'button', className: 'kb-trigger', onClick: () => setOpen(true), 'aria-label': '知识库' },
      h('span', { 'aria-hidden': 'true' }, '📚'), h('span', null, '知识库')),
    open && h('div', { className: 'kb-page', role: 'dialog', 'aria-modal': 'true' },
      h('div', { className: 'kb-head' },
        h('p', { className: 'kb-title' }, '📚 知识库', counts),
        h('input', {
          className: 'kb-search', placeholder: '全文搜索（Enter）…', value: query,
          onChange: (e) => setQuery(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter' && !(e.isComposing === true)) doSearch() },
        }),
        h('span', { className: 'kb-root', title: status && status.root }, status && status.root ? status.root : ''),
        h('button', { className: 'kb-btn', onClick: refresh }, '刷新'),
        h('button', { className: 'kb-btn', onClick: () => setOpen(false) }, '✕ 关闭'),
      ),
      h('div', { className: 'kb-body' },
        h('div', { className: 'kb-side' },
          quick('index.md', '目录', '📖'),
          quick('log.md', '操作流水', '🧾'),
          quick('schema.md', 'KB 约定', '📐'),
          h(TreeSection, { rootRel: 'wiki', label: 'wiki · 成文知识', cur: nav.kind === 'doc' ? nav.rel : '', onOpen: (rel) => onNav({ kind: 'doc', rel }), onAt: atRel, reloadTick }),
          h(TreeSection, { rootRel: 'raw', label: 'raw · 素材（不可变）', cur: nav.kind === 'doc' ? nav.rel : '', onOpen: (rel) => onNav({ kind: 'doc', rel }), onAt: atRel, reloadTick }),
        ),
        h('div', { className: 'kb-main' },
          error && h('div', { className: 'kb-err' }, error),
          !error && nav.kind === 'doc' && h(DocView, { rel: nav.rel, root: status && status.root, onNav, onAt: atRel, onUpload: upload, reloadTick, uploadTick }),
          !error && nav.kind === 'search' && h(SearchView, { q: nav.q, onNav, onAt: atRel }),
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

    slots.inject('sidebar.footer.action', () => slots.register(
      { name: 'sidebar.footer.action', id: '@weibaohui/dsh-kb', order: 32 },
      () => React.createElement(KbPage),
    ))
  },
}
