'use strict'

/**
 * @weibaohui/dsh-kb — Client half
 *
 * 侧栏底部入口（sidebar.footer.action）→ 中栏接管知识库页（taskboard 同款：盖会话列不盖侧栏）：
 *  - 左栏：快捷入口（index/log/schema）+ wiki/ 与 raw/ 懒加载目录树 + 多库切换器；
 *  - 右栏：markdown 阅读渲染（frontmatter 徽章、[[wikilink]]、内部链接、图片、代码块）、
 *    全文搜索结果（内置扫描引擎，命中高亮）、蒸馏队列面板、
 *    库约定编辑器（schema.md，每库一份：⌘S 保存 / 恢复默认模板）、
 *    wiki 版本历史（查看/恢复快照）、页面反馈（记入 feedback.md 可交 agent）、
 *    「🤖 问 AI」（检索命中拼 prompt 写入输入框）、陈旧标记（>90 天未更新）；
 *  - raw/ 下可上传素材，任意条目可「@ 给 agent」注入 composer
 *    （先关 overlay 再注入，composer 不可得时退化为复制到剪贴板）。
 *
 * 数据通道：宿主同源路由 /dsh-kb/api（服务端边界校验）。
 * 自包含：只依赖注入的 react（createElement/hooks），不用 react-dom 等平台模块。
 */

const API = '/dsh-kb/api'

const NS = 'dshKb'

const ZH = {
  // 通用
  loading: '加载中…',
  searching: '搜索中…',
  cancel: '取消',
  submit: '提交',
  save: '保存',
  saving: '保存中…',
  confirm: '确定',
  refresh: '刷新',
  close: '✕ 关闭',
  openSession: '打开会话',
  retry: '重试',
  loadingQueue: '读取队列…',
  readFail: '读取失败：',
  searchFail: '搜索失败：',
  // composer 工具行按钮 + 目录选择浮层
  composerBtnLabel: '📚 知识库',
  composerBtnTitle: '基于知识库目录推理',
  pickerTitle: '选择知识库目录或文件（@ 引用）',
  pickerLoadFail: '加载失败：',
  insertedRef: '✓ 已插入引用',
  insertFailCopied: '无法自动插入，已复制到剪贴板',
  expandAria: '展开',
  // 侧栏入口
  sidebarLabel: '知识库',
  sidebarTitle: '知识库 — 浏览 / 搜索 / 蒸馏队列',
  sidebarTrigger: '知识库',
  // 全页 overlay 顶栏
  overlayTitle: '📚 知识库',
  searchPlaceholder: '全文搜索（Enter）…',
  askAiBtn: '🤖 问 AI',
  askAiTitle: '带着检索命中问 AI（写入输入框,agent 作答并附来源）',
  uploadBtn: '⬆ 上传素材',
  uploadTitle: '上传素材（自动蒸馏入队）',
  queueBtn: '⚗️ 蒸馏队列',
  queueBtnTitle: '蒸馏队列（全局，跨库串行加工）',
  // 侧栏（overlay 内）
  switchKb: '切换知识库',
  switchKbAria: '切换知识库',
  kbLoading: '加载中…',
  newKbTitle: '新建知识库（素材库可自动蒸馏；产出库只读）',
  delKbTitle: '移除当前知识库「{name}」（不删数据）',
  quickIndex: '目录',
  quickLog: '操作流水',
  quickSchema: 'KB 约定',
  treeWiki: 'wiki · 成文知识',
  treeRaw: 'raw · 素材（不可变）',
  uploadRawTitle: '上传素材到 raw/（自动蒸馏）',
  uploadRawBtn: '⬆ 上传',
  atAgent: '@ 给 agent',
  // 文档阅读视图
  docAtAgent: '@ 给 agent',
  editSchemaTitle: '编辑本库的加工约定（每库独立）',
  editSchemaBtn: '✏️ 编辑约定',
  historyBtn: '🕐 历史',
  historyTitle: '查看本页的修改历史,可恢复旧版本',
  feedbackBtn: '⚠️ 反馈',
  feedbackTitle: '页面内容有误或缺漏?记入反馈,后台 agent 自动核实修正',
  downloadBtn: '⬇ 下载',
  downloadBinary: '下载',
  downloadTitle: '下载/导出本页',
  uploadMaterial: '上传素材',
  uploadToTitle: '上传到 {dir}',
  staleChip: '⏳ {n} 天未更新',
  staleTitle: '内容可能过时,建议核对或交 agent 复查',
  updatedChip: '更新 {v}',
  wikilinkTitle: '搜索「{t}」',
  binaryHint: '二进制/超大文件不支持在线阅读，可下载或 @ 给 agent 处理。',
  // 反馈对话框
  feedbackAria: '页面反馈',
  feedbackHeader: '⚠️ 反馈：{title}',
  feedbackPlaceholder: '哪里有误/缺了什么/该补充什么…',
  feedbackAuto: '提交后自动交给 agent 后台处理（修完自动标 [done]，进度见蒸馏队列面板）',
  // schema 编辑器
  schemaPath: 'schema.md · 「{name}」的加工约定',
  schemaMainLib: '主库',
  schemaResetBtn: '恢复默认模板',
  schemaResetTitle: '把编辑框内容换成默认模板（仍需点保存才写入）',
  schemaDirtyConfirm: '有未保存的修改，放弃并返回？',
  schemaSavedHint: '约定已保存 · 自动蒸馏与 agent 的下次加工即按新约定执行 ✅',
  schemaSaveFail: '保存失败：',
  schemaResetFail: '获取默认模板失败：',
  schemaHint: '：kb-bot 自动蒸馏与交互 agent 加工前都会先读它（最终权威），改完保存即生效，无需重启。各库约定互不影响，可按库定制页面规范、目录用途与加工流程。',
  schemaHintBold: '这份约定只作用于当前知识库',
  schemaNotExist: ' schema.md 当前不存在（曾被删除），保存后将按编辑框内容创建。',
  // 历史视图
  historyPath: '🕐 {rel} 的版本历史（{n}）',
  historyBack: '← 返回页面',
  historyEmpty: '还没有历史版本。页面被修改后,宿主会自动快照(内容有变化才记一个版本)。',
  historyVer: '版本 {ts}',
  historyRestoreBtn: '恢复此版本',
  historyBackList: '返回列表',
  historyViewBtn: '查看',
  historyRestoreBtn2: '恢复',
  historyReadFail: '读取版本失败：',
  historyRestoreConfirm: '把「{rel}」恢复到 {ts} 的版本?当前内容将被覆盖(可再从历史恢复回来)。',
  historyRestoredHint: '已恢复该版本 ✅',
  historyRestoreFail: '恢复失败：',
  // 搜索结果视图
  searchNoHit: '没有匹配「{q}」的内容',
  searchSummary: '{hits} 个文件命中「{q}」· {scanned} 个文件已扫描 · {ms}ms',
  // 蒸馏队列
  qQueued: '排队',
  qRunning: '蒸馏中',
  qDone: '完成',
  qFailed: '失败',
  qSkipped: '跳过',
  fbQueued: '排队',
  fbRunning: '处理中',
  fbDone: '完成',
  fbFailed: '失败',
  fbHeader: '⚠️ 反馈处理（后台自动，完成自动标 [done]）',
  qDistillOff: '自动蒸馏已停用（设置）',
  qPaused: '已暂停',
  qResume: '▶ 恢复',
  qPause: '⏸ 暂停',
  qScanRaw: '扫描 raw/',
  qDistillLibs: '素材库自动蒸馏：',
  qDistillOnTitle: '该库自动蒸馏已开，点击关闭',
  qDistillOffTitle: '该库自动蒸馏已关，点击开启',
  qDistillOn: '开',
  qDistillOff: '关',
  qExecutorDown: '⚠️ 执行器不可用：{err}（排队条目会保留，配置好模型后自动继续）',
  qExecutorDownFallback: '稍后自动重试',
  qRoute: '⚙️ 蒸馏模型：{provider}/{model}',
  qRouteDefault: '（跟随宿主默认，设置 → 知识库 可指定）',
  qRouteOverride: '（设置中指定）',
  qDisabledBanner: '自动蒸馏已在设置中停用：素材仍会入队留档，但不会执行；可手动 @ 给 agent 加工。',
  qEmpty: '队列为空：往 raw/ 上传素材后会自动入队蒸馏。',
  qViewOutput: '看产出',
  qChunk: '（片 {idx}/{total}）',
  qAttempt: '（第 {n} 次）',
  // 新建知识库对话框
  newKbAria: '新建知识库',
  newKbHeader: '📚 新建知识库',
  newKbNamePh: '名称（默认取目录名）',
  newKbRootPh: '文件夹绝对路径（不存在将自动创建）',
  newKbKind: '素材库（建骨架并可自动蒸馏；产出库只读）',
  newKbAdding: '添加中…',
  newKbNote: '注意：添加后该目录将可经局域网 API 浏览/上传。',
  // toast / 提示
  toastKbRootUnavailable: '知识库根不可用',
  toastInserted: '已把 @{rel} 插入输入框',
  toastInsertCopied: '无法自动插入，已复制到剪贴板，请在输入框粘贴',
  toastAskAiHint: '先在搜索框输入问题,再点「问 AI」',
  toastAskAiInserted: '已在新任务页填入问题,发送即让 agent 带检索回答 🤖',
  toastAskAiCopied: '无法自动插入,问题已复制到剪贴板,请在输入框粘贴',
  toastAskAiFail: '插入失败,请手动把问题粘贴到输入框',
  toastFeedbackSaved: '反馈已记入 wiki/meta/feedback.md ✅（可稍后 @ 给 agent 处理）',
  toastFeedbackAuto: '已交给 agent 后台处理 🤖 修完自动标 [done]（进度见蒸馏队列面板）',
  toastFeedbackExecutorDownInserted: '执行器不可用,处理指令已写入输入框,发送即执行 ⚠️',
  toastFeedbackExecutorDownCopied: '执行器不可用,指令已复制到剪贴板,请粘贴发送',
  toastFeedbackFail: '反馈失败：',
  toastUploadReadOnly: '产出库只读，不支持上传',
  toastUploadFail: '上传 {name} 失败：',
  toastUploaded: '已上传 {n} 个素材到 {dir}/ · 自动蒸馏已入队 ⚗️',
  toastDelConfirm: '移除知识库「{name}」？磁盘数据不受影响。',
  toastDelDone: '已移除「{name}」',
  toastDelFail: '移除失败：',
  toastOpFail: '操作失败：',
  toastAddDone: '已添加「{name}」并选中',
  toastAddFail: '添加失败：',
  toastQueuePaused: '队列已暂停（跑完当前为止）',
  toastQueueResumed: '队列已恢复',
  toastQueueOpDone: '已执行',
  toastQueueOpFail: '操作失败：',
  toastSessionUnavailable: '客户端会话服务不可用，无法跳转',
  toastSessionOpened: '已打开 bot 会话',
  toastToggleDistillFail: '操作失败：',
  // 问 AI / 反馈降级 prompt（交给 agent 的指令文本，保持中文以匹配 schema 约定）
  promptAskAi: '请回答：{q}\n依据来自知识库（{root}）。',
  promptAskAiHits: '\n初步检索命中：{tops}。',
  promptAskAiNoHit: '\n初步检索无命中,请用工具在知识库根目录继续检索。',
  promptAskAiTail: '\n要求：先检索核对再下结论；回答末尾列出依据（来源页面路径）；与库内条目矛盾的说法要明确指出。',
  promptAskAiRootFallback: '见 @ 路径',
  promptFeedback: '@{root}/{rel} 请核查这条反馈:「{note}」。按当前库 schema 修正页面后,把 wiki/meta/feedback.md 里对应行的 [open] 改为 [done]。',
  // 设置页
  settingsLabel: '知识库',
  settingsHint: '上传到知识库 raw/ 的素材自动入队，由 bot 会话按 schema 蒸馏成文；进度见知识库页「蒸馏队列」。',
  settingsLoadFail: '加载失败',
  settingsEnable: '启用自动蒸馏',
  settingsProvider: 'Provider',
  settingsModel: 'Model',
  settingsTimeout: '单条目超时（分钟）',
  settingsMaxAttempts: '失败重试上限',
  settingsSweep: '兜底扫描周期（秒）',
  settingsFollowDefault: '跟随宿主默认',
  settingsProviderPh: '如 deepseek-official',
  settingsModelPh: '跟随宿主默认',
  settingsPickModel: '选择模型（必填）',
  settingsPickModelAny: '选择模型',
  settingsCurrentRoute: '当前生效：{provider}/{model}（{src}）',
  settingsRouteOverride: '设置指定',
  settingsRouteDefault: '宿主默认',
  settingsSaved: '✓ 已保存',
  settingsSaveFail: '保存失败：',
  // 拖拽提示
  dropHint: '⬇ 松开，上传素材到知识库（自动蒸馏入队）',
  recentTitle: '最近更新',
  recentSub: 'log.md 尾部，点路径直达',
}

const EN = {
  loading: 'Loading…',
  searching: 'Searching…',
  cancel: 'Cancel',
  submit: 'Submit',
  save: 'Save',
  saving: 'Saving…',
  confirm: 'OK',
  refresh: 'Refresh',
  close: '✕ Close',
  openSession: 'Open chat',
  retry: 'Retry',
  loadingQueue: 'Reading queue…',
  readFail: 'Load failed: ',
  searchFail: 'Search failed: ',
  composerBtnLabel: '📚 Knowledge',
  composerBtnTitle: 'Reason from a knowledge-base folder',
  pickerTitle: 'Pick a knowledge-base folder or file (@ reference)',
  pickerLoadFail: 'Load failed: ',
  insertedRef: '✓ Reference inserted',
  insertFailCopied: 'Could not insert automatically — copied to clipboard',
  expandAria: 'Expand',
  sidebarLabel: 'Knowledge',
  sidebarTitle: 'Knowledge — browse / search / distill queue',
  sidebarTrigger: 'Knowledge',
  overlayTitle: '📚 Knowledge',
  searchPlaceholder: 'Full-text search (Enter)…',
  askAiBtn: '🤖 Ask AI',
  askAiTitle: 'Ask AI with search hits (written into the composer; the agent answers with sources)',
  uploadBtn: '⬆ Upload',
  uploadTitle: 'Upload material (auto-distill enqueued)',
  queueBtn: '⚗️ Distill',
  queueBtnTitle: 'Distill queue (global, serial across libraries)',
  switchKb: 'Switch knowledge base',
  switchKbAria: 'Switch knowledge base',
  kbLoading: 'Loading…',
  newKbTitle: 'New knowledge base (material libs auto-distill; produced libs are read-only)',
  delKbTitle: 'Remove current knowledge base "{name}" (data on disk is kept)',
  quickIndex: 'Index',
  quickLog: 'Activity log',
  quickSchema: 'KB rules',
  treeWiki: 'wiki · written knowledge',
  treeRaw: 'raw · sources (immutable)',
  uploadRawTitle: 'Upload material to raw/ (auto-distill)',
  uploadRawBtn: '⬆ Upload',
  atAgent: '@ to agent',
  docAtAgent: '@ to agent',
  editSchemaTitle: 'Edit this library\'s processing rules (per library)',
  editSchemaBtn: '✏️ Edit rules',
  historyBtn: '🕐 History',
  historyTitle: 'View this page\'s revision history; restore older versions',
  feedbackBtn: '⚠️ Feedback',
  feedbackTitle: 'Page wrong or missing something? Log it; a background agent verifies and fixes',
  downloadBtn: '⬇ Download',
  downloadBinary: 'Download',
  downloadTitle: 'Download / export this page',
  uploadMaterial: 'Upload',
  uploadToTitle: 'Upload to {dir}',
  staleChip: '⏳ {n} days stale',
  staleTitle: 'Content may be outdated — verify or ask an agent to review',
  updatedChip: 'updated {v}',
  wikilinkTitle: 'Search "{t}"',
  binaryHint: 'Binary / oversized files can\'t be read inline — download or @ an agent to handle them.',
  feedbackAria: 'Page feedback',
  feedbackHeader: '⚠️ Feedback: {title}',
  feedbackPlaceholder: 'What\'s wrong / missing / should be added…',
  feedbackAuto: 'After submitting, hand it to a background agent (marks [done] when fixed; progress in the distill queue panel)',
  schemaPath: 'schema.md · processing rules for "{name}"',
  schemaMainLib: 'Main library',
  schemaResetBtn: 'Reset to default template',
  schemaResetTitle: 'Replace the editor with the default template (save to write it)',
  schemaDirtyConfirm: 'Discard unsaved changes and go back?',
  schemaSavedHint: 'Rules saved · auto-distill and the agent\'s next run will use them ✅',
  schemaSaveFail: 'Save failed: ',
  schemaResetFail: 'Failed to load default template: ',
  schemaHint: ': kb-bot auto-distill and interactive agents read it first (final authority); saving takes effect immediately, no restart. Rules are per library and independent — tailor page conventions, folder roles, and the processing flow per library.',
  schemaHintBold: 'These rules only apply to the current knowledge base',
  schemaNotExist: ' schema.md does not exist yet (was deleted); saving creates it from the editor.',
  historyPath: '🕐 Revision history of {rel} ({n})',
  historyBack: '← Back to page',
  historyEmpty: 'No revisions yet. After a page is edited, the host snapshots it automatically (only when content changes).',
  historyVer: 'Version {ts}',
  historyRestoreBtn: 'Restore this version',
  historyBackList: 'Back to list',
  historyViewBtn: 'View',
  historyRestoreBtn2: 'Restore',
  historyReadFail: 'Failed to load version: ',
  historyRestoreConfirm: 'Restore "{rel}" to the {ts} version? The current content will be overwritten (you can restore it back from history).',
  historyRestoredHint: 'Version restored ✅',
  historyRestoreFail: 'Restore failed: ',
  searchNoHit: 'No matches for "{q}"',
  searchSummary: '{hits} file(s) match "{q}" · {scanned} scanned · {ms}ms',
  qQueued: 'Queued',
  qRunning: 'Distilling',
  qDone: 'Done',
  qFailed: 'Failed',
  qSkipped: 'Skipped',
  fbQueued: 'Queued',
  fbRunning: 'Processing',
  fbDone: 'Done',
  fbFailed: 'Failed',
  fbHeader: '⚠️ Feedback processing (background, auto-marks [done] when finished)',
  qDistillOff: 'Auto-distill disabled (settings)',
  qPaused: 'Paused',
  qResume: '▶ Resume',
  qPause: '⏸ Pause',
  qScanRaw: 'Scan raw/',
  qDistillLibs: 'Material libraries auto-distill:',
  qDistillOnTitle: 'Auto-distill on for this library — click to turn off',
  qDistillOffTitle: 'Auto-distill off for this library — click to turn on',
  qDistillOn: 'on',
  qDistillOff: 'off',
  qExecutorDown: '⚠️ Executor unavailable: {err} (queued items are kept; it resumes once a model is configured)',
  qExecutorDownFallback: 'will retry shortly',
  qRoute: '⚙️ Distill model: {provider}/{model}',
  qRouteDefault: '(follows host default; set in Settings → Knowledge)',
  qRouteOverride: '(set in settings)',
  qDisabledBanner: 'Auto-distill is disabled in settings: material still enqueues for the record but is not processed; you can @ an agent to process it manually.',
  qEmpty: 'Queue is empty: uploading material to raw/ auto-enqueues it for distilling.',
  qViewOutput: 'View output',
  qChunk: '(chunk {idx}/{total})',
  qAttempt: '(attempt {n})',
  newKbAria: 'New knowledge base',
  newKbHeader: '📚 New knowledge base',
  newKbNamePh: 'Name (defaults to the folder name)',
  newKbRootPh: 'Absolute folder path (created if missing)',
  newKbKind: 'Material library (scaffolds and can auto-distill; produced libraries are read-only)',
  newKbAdding: 'Adding…',
  newKbNote: 'Note: once added, this folder is browsable / uploadable via the LAN API.',
  toastKbRootUnavailable: 'Knowledge base root unavailable',
  toastInserted: '@{rel} inserted into the composer',
  toastInsertCopied: 'Could not insert automatically — copied to clipboard; paste into the composer',
  toastAskAiHint: 'Type a question in the search box first, then click "Ask AI"',
  toastAskAiInserted: 'Question filled into the new-task page — send to let the agent answer with retrieval 🤖',
  toastAskAiCopied: 'Could not insert automatically — question copied to clipboard; paste into the composer',
  toastAskAiFail: 'Insert failed — paste the question into the composer manually',
  toastFeedbackSaved: 'Feedback logged to wiki/meta/feedback.md ✅ (you can @ an agent to process it later)',
  toastFeedbackAuto: 'Handed to a background agent 🤖 marks [done] when fixed (progress in the distill queue panel)',
  toastFeedbackExecutorDownInserted: 'Executor unavailable — instruction written into the composer; send to run ⚠️',
  toastFeedbackExecutorDownCopied: 'Executor unavailable — instruction copied to clipboard; paste and send',
  toastFeedbackFail: 'Feedback failed: ',
  toastUploadReadOnly: 'Produced libraries are read-only; upload is not supported',
  toastUploadFail: 'Upload {name} failed: ',
  toastUploaded: 'Uploaded {n} item(s) to {dir}/ · auto-distill enqueued ⚗️',
  toastDelConfirm: 'Remove knowledge base "{name}"? Data on disk is unaffected.',
  toastDelDone: 'Removed "{name}"',
  toastDelFail: 'Remove failed: ',
  toastOpFail: 'Operation failed: ',
  toastAddDone: 'Added "{name}" and selected it',
  toastAddFail: 'Add failed: ',
  toastQueuePaused: 'Queue paused (finishes the current item)',
  toastQueueResumed: 'Queue resumed',
  toastQueueOpDone: 'Done',
  toastQueueOpFail: 'Operation failed: ',
  toastSessionUnavailable: 'Session service unavailable on this page',
  toastSessionOpened: 'Opened bot chat',
  toastToggleDistillFail: 'Operation failed: ',
  promptAskAi: 'Please answer: {q}\nEvidence is from the knowledge base ({root}).',
  promptAskAiHits: '\nInitial retrieval hits: {tops}.',
  promptAskAiNoHit: '\nNo initial hits — use tools to keep searching the knowledge base root.',
  promptAskAiTail: '\nRequirements: retrieve and verify before concluding; list sources (page paths) at the end; flag any claim that contradicts a library entry.',
  promptAskAiRootFallback: 'see @ paths',
  promptFeedback: '@{root}/{rel} Please review this feedback: "{note}". Following the current library rules, fix the page, then change the matching [open] line in wiki/meta/feedback.md to [done].',
  settingsLabel: 'Knowledge',
  settingsHint: 'Material uploaded to a knowledge base\'s raw/ is auto-enqueued and distilled into docs by a bot chat per schema; progress is in the "Distill" panel on the knowledge page.',
  settingsLoadFail: 'Load failed',
  settingsEnable: 'Enable auto-distill',
  settingsProvider: 'Provider',
  settingsModel: 'Model',
  settingsTimeout: 'Per-item timeout (minutes)',
  settingsMaxAttempts: 'Max retry on failure',
  settingsSweep: 'Fallback sweep interval (seconds)',
  settingsFollowDefault: 'Follow host default',
  settingsProviderPh: 'e.g. deepseek-official',
  settingsModelPh: 'Follow host default',
  settingsPickModel: 'Pick a model (required)',
  settingsPickModelAny: 'Pick a model',
  settingsCurrentRoute: 'In effect: {provider}/{model} ({src})',
  settingsRouteOverride: 'set in settings',
  settingsRouteDefault: 'host default',
  settingsSaved: '✓ Saved',
  settingsSaveFail: 'Save failed: ',
  dropHint: '⬇ Drop to upload material into the knowledge base (auto-distill enqueued)',
  recentTitle: 'Recent updates',
  recentSub: 'tail of log.md — click a path to jump',
}

/** t(key, vars)：bound 读当前激活语言；缺席回退 EN→ZH→key（对齐 dsh-process makeT）。 */
function makeT(bound) {
  return (key, vars) => {
    let out = (bound && bound(key)) || EN[key] || ZH[key] || key
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.split('{' + k + '}').join(String(v))
    return out
  }
}

/** 模块级 t：apply 里 bind 后赋值；组件用 useT() 订阅语言切换重渲染，DOM 入口加入 localeListeners。 */
let t = makeT(null)

/** 语言版本号：locale 变化时自增（apply 里 ctx.locale.subscribe(notifyLocale) 驱动），useT 的快照。 */
let localeVersion = 0
const localeListeners = new Set()
function notifyLocale() {
  localeVersion++
  setDropVar()
  for (const fn of localeListeners) { try { fn() } catch {} }
}

/** 按当前语言把拖拽提示写进 CSS 变量 --dsh-kb-drop（.kb-page.kb-drop::after 读它）。 */
function setDropVar() {
  if (typeof document === 'undefined') return
  try { document.documentElement.style.setProperty('--dsh-kb-drop', "'" + String(t('dropHint')).replace(/'/g, "\\'") + "'") } catch {}
}

/** React hook：返回 t；语言切换时组件重渲染（订阅 locale 服务，缺席时 t 仍可用，只是不随切换刷新）。 */
function useT() {
  // subscribe 仅管理本地 localeListeners：locale 变化由 apply 里的 ctx.locale.subscribe(notifyLocale)
  // 驱动，notifyLocale 自增 localeVersion（getSnap 读它）并通知所有监听者 → useSyncExternalStore 重渲染。
  const subscribe = React.useCallback((cb) => {
    localeListeners.add(cb)
    return () => { localeListeners.delete(cb) }
  }, [])
  const getSnap = React.useCallback(() => localeVersion, [])
  if (typeof React.useSyncExternalStore === 'function') React.useSyncExternalStore(subscribe, getSnap)
  return t
}

/** 客户端会话服务（apply 时 ctx.inject(['sessions']) 懒注入；缺席时「打开会话」降级提示）。 */
let sessionsSvc = null
/** 客户端 uiWorkspace 服务（侧栏「新会话」按钮背后的导航服务；缺席时「问 AI」退回写当前输入框）。 */
let uiWorkspaceSvc = null
/** composer 挂载槽（含 per-session 草稿通道；「+ 知识库」与「问 AI」共用）。 */
let composerScope = null
/** kb composer 槽随宿主视图渲染出的当前会话 id——「问 AI」用来确认视图已切到目标会话。 */
let kbLiveSessionId
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
/* 中栏接管视图（taskboard 同款）：容器挂进会话列末尾，html 属性驱动开合，只隐藏列内兄弟。
 * 三代壳层选择器兼容：dev shell data-pane / 官方 CSS-Module centerCol / Desktop 扩展框。 */
.dsh-kb-view{display:none}
html[data-dsh-kb-active] [data-pane="conversation"] > *:not([data-dsh-kb-view]),
html[data-dsh-kb-active] [class*="centerCol"] > *:not([data-dsh-kb-view]),
html[data-dsh-kb-active] .dshDesktopConversationSurface > *:not([data-dsh-kb-view]){display:none !important}
html[data-dsh-kb-active] .dsh-kb-view{display:flex;flex-direction:column;height:100%;overflow:hidden}
html[data-dsh-kb-active] .dsh-kb-view > .kb-trigger{display:none}
.kb-page{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.kb-head{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none;background:var(--dsw-alias-bg-layer-2)}
.kb-title{font-size:15px;font-weight:600;margin:0;display:flex;align-items:center;gap:8px;flex:none;white-space:nowrap}
.kb-root{font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-family:var(--ds-font-family-code,ui-monospace,monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.kb-btn{font-size:12px;padding:5px 12px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;flex:none;transition:background .16s,border-color .16s}
.kb-btn:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 24%,var(--dsw-alias-border-l2))}
.kb-btn:disabled{opacity:.5;cursor:default}
.kb-btn.primary{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,var(--dsw-alias-border-l2))}
.kb-btn[data-cur="true"]{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,var(--dsw-alias-border-l2))}
.kb-search{flex:0 1 auto;width:min(360px,40vw);min-width:150px;padding:6px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.kb-search:focus{outline:none;border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 50%,var(--dsw-alias-border-l2))}
/* 窄屏：搜索框先按比例收缩撑住单行；≤760px 切两行——按钮一行、搜索框独占一行 */
@media (max-width:760px){
  .kb-head{flex-wrap:wrap}
  .kb-root{display:none}
  .kb-title{margin-right:auto}
  .kb-search{flex:1 1 100%;order:9;width:auto;min-width:0}
}
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
.kb-chip.stale{color:#b7791f;border-color:color-mix(in srgb,#b7791f 45%,var(--dsw-alias-border-l2));background:color-mix(in srgb,#b7791f 8%,transparent)}
.kb-docbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:0 0 10px;border-bottom:1px solid var(--dsw-alias-border-l2);margin-bottom:14px}
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
.kb-page.kb-drop::after{content:var(--dsh-kb-drop,'⬇ 松开，上传素材到知识库（自动蒸馏入队）');position:absolute;inset:10px;border:2px dashed var(--dsw-alias-brand-primary);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent);pointer-events:none;z-index:10}
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
/* 库切换下拉 + 新建知识库对话框 */
.kb-kbrow{display:flex;gap:6px;align-items:center;padding:2px 4px 8px}
.kb-kbsel{flex:1;min-width:0;height:30px;padding:0 6px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px}
.kb-kbsel:focus{outline:none;border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 50%,var(--dsw-alias-border-l2))}
.kb-kbbtn{flex:none;width:30px;height:30px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font-size:14px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;padding:0}
.kb-kbbtn:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent)}
.kb-kbbtn.danger{color:var(--dsw-alias-state-error-primary,#d64545)}
.kb-kbbtn.danger:hover{background:color-mix(in srgb,#d64545 12%,transparent);border-color:color-mix(in srgb,#d64545 40%,var(--dsw-alias-border-l2))}
.kb-modal-mask{position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center}
.kb-modal{width:min(400px,92vw);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:16px;display:grid;gap:10px;box-shadow:0 8px 32px rgba(0,0,0,.25)}
.kb-modal-h{margin:0;font-size:14px;font-weight:600}
.kb-modal-in{width:100%}
.kb-modal-acts{display:flex;justify-content:flex-end;gap:8px;margin-top:2px}
.kb-modal-note{font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
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
        className: 'kb-md-wikilink', key: key++, title: t('wikilinkTitle', { t: target }),
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
          h('button', { className: 'at', title: t('atAgent'), onClick: () => onAt(sub) }, '@'),
        ))
      }
    }
    return rows
  }

  return [
    h('div', { className: 'kb-side-h', key: rootRel },
      h('span', null, label),
      props.onUpload && rootRel === 'raw' ? h('label', { className: 'kb-up', title: t('uploadRawTitle') },
        t('uploadRawBtn'),
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
    h('div', { className: 'kb-recent-h' }, '🕘 ' + t('recentTitle'), h('span', { className: 'kb-recent-sub' }, t('recentSub'))),
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
  const tt = useT()
  const { rel, root, onNav, onAt, reloadTick, kb } = props
  const [state, setState] = React.useState({ status: 'loading' })
  const [fb, setFb] = React.useState(null) // null | {note, ask} 反馈对话框

  React.useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    fetch(`${API}/doc?path=${encodeURIComponent(rel)}&kb=${encodeURIComponent(kb || 'main')}`)
      .then(readJson)
      .then((d) => { if (alive) setState({ status: 'ok', doc: d.doc }) })
      .catch((e) => { if (alive) setState({ status: 'error', message: String((e && e.message) || e) }) })
    return () => { alive = false }
  }, [rel, reloadTick])

  if (state.status === 'loading') return h('div', { className: 'kb-spin' }, tt('loading'))
  if (state.status === 'error') return h('div', { className: 'kb-err' }, tt('readFail') + state.message)
  const doc = state.doc
  const fm = doc.frontmatter || {}
  const inRaw = rel === 'raw' || rel.startsWith('raw/')
  const inWiki = rel === 'wiki' || rel.startsWith('wiki/')
  const isMd = doc.kind === 'md'
  const dirOf = rel.indexOf('/') >= 0 ? rel.slice(0, rel.lastIndexOf('/')) : ''

  // 陈旧提示：frontmatter updated（缺省退回文件 mtime）超过 90 天
  const staleDays = (() => {
    const upd = Date.parse(fm.updated || '') || (doc.mtime || 0)
    if (!upd) return null
    const d = Math.floor((Date.now() - upd) / 86400000)
    return d >= 90 ? d : null
  })()

  const meta = []
  if (fm.title) meta.push(h('span', { className: 'kb-chip title', key: 't' }, fm.title))
  if (fm.author) meta.push(h('span', { className: 'kb-chip', key: 'a' }, '👤 ' + fm.author))
  if (fm.updated) meta.push(h('span', { className: 'kb-chip', key: 'u' }, tt('updatedChip', { v: fm.updated })))
  if (Array.isArray(fm.tags) && fm.tags.length) fm.tags.forEach((tg, i) => meta.push(h('span', { className: 'kb-chip', key: 'g' + i }, '#' + tg)))
  if (staleDays !== null) meta.push(h('span', { className: 'kb-chip stale', key: 's', title: tt('staleTitle') }, tt('staleChip', { n: staleDays })))

  return h('div', null,
    meta.length ? h('div', { className: 'kb-meta' }, meta) : null,
    h('div', { className: 'kb-docbar' },
      h('span', { className: 'kb-docpath', title: rel }, rel + (doc.size != null ? ' · ' + fmtSize(doc.size) : '') + (doc.mtime ? ' · ' + fmtTime(doc.mtime) : '')),
      h('button', { className: 'kb-btn', onClick: () => onAt(rel) }, tt('docAtAgent')),
      rel === 'schema.md' && props.onEditSchema ? h('button', { className: 'kb-btn', title: tt('editSchemaTitle'), onClick: props.onEditSchema }, tt('editSchemaBtn')) : null,
      inWiki && isMd ? h('button', { className: 'kb-btn', title: tt('historyTitle'), onClick: () => onNav({ kind: 'history', rel }) }, tt('historyBtn')) : null,
      isMd && props.onFeedback ? h('button', { className: 'kb-btn', title: tt('feedbackTitle'), onClick: () => setFb({ note: '', ask: true }) }, tt('feedbackBtn')) : null,
      doc.kind !== 'binary' ? h('a', { className: 'kb-btn', style: { textDecoration: 'none' }, href: apiFile(rel, true), title: tt('downloadTitle') }, tt('downloadBtn')) : null,
      doc.kind === 'binary' ? h('a', { className: 'kb-btn', style: { textDecoration: 'none' }, href: apiFile(rel, true) }, tt('downloadBinary')) : null,
      inRaw ? h('label', { className: 'kb-btn', style: { cursor: 'pointer' }, title: tt('uploadToTitle', { dir: dirOf || 'raw' }) },
        tt('uploadMaterial'), h('input', { type: 'file', multiple: true, className: 'kb-file', onChange: (e) => props.onUpload(dirOf || 'raw', e.target.files), key: 'up' + rel + String(props.uploadTick || 0) }),
      ) : null,
    ),
    // 反馈对话框
    fb && h('div', { className: 'kb-modal-mask', onMouseDown: (e) => { if (e.target === e.currentTarget) setFb(null) } },
      h('div', { className: 'kb-modal', role: 'dialog', 'aria-label': tt('feedbackAria') },
        h('p', { className: 'kb-modal-h' }, tt('feedbackHeader', { title: fm.title || rel })),
        h('textarea', {
          className: 'kb-schema-ta', style: { height: 120, minHeight: 120, resize: 'vertical' },
          placeholder: tt('feedbackPlaceholder'), autoFocus: true, value: fb.note,
          onChange: (e) => setFb((f) => ({ ...f, note: e.target.value })),
        }),
        h('label', { style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 } },
          h('input', { type: 'checkbox', checked: fb.ask, onChange: (e) => setFb((f) => ({ ...f, ask: e.target.checked })) }),
          tt('feedbackAuto'),
        ),
        h('div', { className: 'kb-modal-acts' },
          h('button', { className: 'kb-btn', onClick: () => setFb(null) }, tt('cancel')),
          h('button', { className: 'kb-btn primary', disabled: !fb.note.trim(), onClick: () => { const cur = fb; setFb(null); props.onFeedback(rel, cur.note.trim(), cur.ask) } }, tt('submit')),
        ),
      ),
    ),
    doc.kind === 'md' ? h('div', { className: 'kb-md' }, renderMarkdown(doc.body, onNav)) : null,
    rel === 'index.md' ? h(RecentUpdates, { onNav, kb: props.kb }) : null,
    doc.kind === 'text' ? h('pre', { className: 'kb-md-pre' }, doc.body) : null,
    doc.kind === 'binary' ? h('div', { className: 'kb-empty' }, tt('binaryHint')) : null,
  )
}

/**
 * 右栏：库约定（schema.md）编辑器——每库一份、互不影响。
 * kb-bot 自动蒸馏与交互 agent 加工前都以它为最终权威，保存即对下次加工生效。
 */
function SchemaEditor(props) {
  const h = React.createElement
  const tt = useT()
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
      onHint(tt('schemaSavedHint'))
      if (onSaved) onSaved()
    } catch (e) { onHint(tt('schemaSaveFail') + ((e && e.message) || e)) }
  }

  const resetDefault = async () => {
    try {
      const d = await readJson(await fetch(`${API}/schema/default`))
      setState((s) => ({ ...s, text: d.text, dirty: true }))
    } catch (e) { onHint(tt('schemaResetFail') + ((e && e.message) || e)) }
  }

  if (state.status === 'loading') return h('div', { className: 'kb-spin' }, tt('loading'))
  if (state.status === 'error') return h('div', { className: 'kb-err' }, tt('readFail') + state.message)
  return h('div', { className: 'kb-schema' },
    h('div', { className: 'kb-docbar' },
      h('span', { className: 'kb-docpath' }, tt('schemaPath', { name: kbName || tt('schemaMainLib') })),
      h('button', { className: 'kb-btn', title: tt('schemaResetTitle'), onClick: resetDefault }, tt('schemaResetBtn')),
      h('button', { className: 'kb-btn', onClick: () => { if (!state.dirty || window.confirm(tt('schemaDirtyConfirm'))) onDone() } }, tt('cancel')),
      h('button', { className: 'kb-btn primary', disabled: !state.dirty, title: '⌘S / Ctrl+S', onClick: save }, tt('save')),
    ),
    h('p', { className: 'kb-schema-hint' },
      h('b', null, tt('schemaHintBold')), tt('schemaHint'),
      !state.exists ? tt('schemaNotExist') : null,
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

/** 右栏：wiki 页面版本历史（列表 → 查看/恢复）。快照由宿主 wiki/ 监视自动写入。 */
function HistoryView(props) {
  const h = React.createElement
  const tt = useT()
  const { rel, kb, onNav, onHint, onRestored } = props
  const [state, setState] = React.useState({ status: 'loading' })
  const [viewing, setViewing] = React.useState(null) // {ts, text}

  const load = React.useCallback(() => {
    setState({ status: 'loading' })
    fetch(`${API}/history?path=${encodeURIComponent(rel)}&kb=${encodeURIComponent(kb || 'main')}`)
      .then(readJson)
      .then((d) => setState({ status: 'ok', items: d.items || [] }))
      .catch((e) => setState({ status: 'error', message: String((e && e.message) || e) }))
  }, [rel, kb])
  React.useEffect(() => { load() }, [load])

  const view = async (ts) => {
    try {
      const d = await readJson(await fetch(`${API}/history/file?path=${encodeURIComponent(rel)}&ts=${encodeURIComponent(ts)}&kb=${encodeURIComponent(kb || 'main')}`))
      setViewing({ ts, text: d.text })
    } catch (e) { onHint(tt('historyReadFail') + ((e && e.message) || e)) }
  }

  const restore = async (ts) => {
    if (!window.confirm(tt('historyRestoreConfirm', { rel, ts: ts.slice(0, 15) }))) return
    try {
      await readJson(await fetch(`${API}/history/restore?kb=${encodeURIComponent(kb || 'main')}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: rel, ts }),
      }))
      onHint(tt('historyRestoredHint'))
      onRestored()
      onNav({ kind: 'doc', rel })
    } catch (e) { onHint(tt('historyRestoreFail') + ((e && e.message) || e)) }
  }

  const fmtTs = (f) => {
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(f)
    return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : f
  }

  if (state.status === 'loading') return h('div', { className: 'kb-spin' }, tt('loading'))
  if (state.status === 'error') return h('div', { className: 'kb-err' }, tt('readFail') + state.message)
  return h('div', { className: 'kb-md', style: { maxWidth: 860 } },
    h('div', { className: 'kb-docbar' },
      h('span', { className: 'kb-docpath' }, tt('historyPath', { rel, n: state.items.length })),
      h('button', { className: 'kb-btn', onClick: () => onNav({ kind: 'doc', rel }) }, tt('historyBack')),
      h('button', { className: 'kb-btn', onClick: load }, tt('refresh')),
    ),
    state.items.length === 0 ? h('div', { className: 'kb-empty' }, tt('historyEmpty')) : null,
    viewing ? h('div', null,
      h('div', { className: 'kb-docbar' },
        h('span', { className: 'kb-docpath' }, tt('historyVer', { ts: fmtTs(viewing.ts) })),
        h('button', { className: 'kb-btn primary', onClick: () => restore(viewing.ts) }, tt('historyRestoreBtn')),
        h('button', { className: 'kb-btn', onClick: () => setViewing(null) }, tt('historyBackList')),
      ),
      h('pre', { className: 'kb-md-pre' }, viewing.text),
    ) : h('div', null, state.items.map((it) => h('div', { className: 'kb-q-row', key: it.ts },
      h('div', { className: 'kb-q-main' },
        h('div', { className: 'kb-q-name' }, fmtTs(it.ts)),
        h('div', { className: 'kb-q-rel' }, fmtSize(it.size)),
      ),
      h('div', { className: 'kb-q-acts' },
        h('button', { className: 'kb-btn', onClick: () => view(it.ts) }, tt('historyViewBtn')),
        h('button', { className: 'kb-btn', onClick: () => restore(it.ts) }, tt('historyRestoreBtn2')),
      ),
    ))),
  )
}

/** 右栏：搜索结果视图。 */
function SearchView(props) {
  const h = React.createElement
  const tt = useT()
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

  if (state.status === 'loading') return h('div', { className: 'kb-spin' }, tt('searching'))
  if (state.status === 'error') return h('div', { className: 'kb-err' }, tt('searchFail') + state.message)
  const d = state.data
  const hits = d.hits || []
  if (!hits.length) return h('div', { className: 'kb-empty' }, tt('searchNoHit', { q }))
  return h('div', null,
    h('p', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))', margin: '0 0 12px' } },
      tt('searchSummary', { hits: hits.length, scanned: d.scanned || 0, ms: d.durationMs || 0 })),
    hits.map((hit, i) => h('div', { className: 'kb-hit', key: i },
      h('button', { className: 'kb-hit-file', onClick: () => onNav({ kind: 'doc', rel: hit.rel }) }, '📄', hit.rel),
      h('button', { className: 'kb-item', style: { width: 'auto', display: 'inline-flex', marginLeft: 8, padding: '0 6px', fontSize: 11 }, onClick: () => onAt(hit.rel) }, '@'),
      hit.lines.map((l, j) => h(HitLine, { key: j, text: l.text, line: l.line, q })),
    )),
  )
}

/** 蒸馏队列状态 chip 文案。 */
function qStatusLabel(tt, k) {
  return { queued: tt('qQueued'), running: tt('qRunning'), done: tt('qDone'), failed: tt('qFailed'), skipped: tt('qSkipped') }[k] || k
}
function fbStatusLabel(tt, k) {
  return { queued: tt('fbQueued'), running: tt('fbRunning'), done: tt('fbDone'), failed: tt('fbFailed') }[k] || k
}

/** 跳到 bot 会话（客户端 sessions 服务 open(id)，dsh-process 同款懒解析）。 */
function openKbSession(sessionId, hint) {
  const svc = sessionsSvc
  if (!svc || typeof svc.open !== 'function') { hint(t('toastSessionUnavailable')); return }
  try { svc.open(sessionId); hint(t('toastSessionOpened')) } catch (e) { hint(String((e && e.message) || e)) }
}

/** 右栏：自动蒸馏队列视图（数据由 KbPage 统一轮询，这里只渲染+发起操作）。 */
function QueueView(props) {
  const h = React.createElement
  const tt = useT()
  const { data, kbs, onAction, onNav, onHint, onToggleDistill } = props
  const kbName = (id) => { const k = (kbs || []).find((x) => x.id === (id || 'main')); return k ? k.name : (id || 'main') }
  const distillKbs = (kbs || []).filter((k) => k.kind === 'material' && k.id !== 'main')
  if (!data) return h('div', { className: 'kb-spin' }, tt('loadingQueue'))
  const stats = data.stats || {}
  const statChips = ['running', 'queued', 'failed', 'done', 'skipped'].map((k) =>
    h('span', { className: `kb-chip ${k}`, key: k }, `${qStatusLabel(tt, k)} ${stats[k] || 0}`))
  const items = data.items || []
  const fbTasks = data.feedback || []
  return h('div', null,
    fbTasks.length ? h('div', null,
      h('div', { className: 'kb-q-model', style: { fontWeight: 600 } }, tt('fbHeader')),
      fbTasks.map((tk) => h('div', { className: 'kb-q-row', key: tk.runId },
        h('div', { className: 'kb-q-main' },
          h('div', { className: 'kb-q-name' },
            h('span', { className: `kb-chip ${tk.state === 'running' ? 'running' : tk.state === 'done' ? 'done' : tk.state === 'failed' ? 'failed' : 'queued'}` }, fbStatusLabel(tt, tk.state)),
            ' ', tk.rel.split('/').pop(),
          ),
          h('div', { className: 'kb-q-rel' }, `[${kbName(tk.kbId)}] ${tk.rel}`),
          tk.note ? h('div', { className: `kb-q-note${tk.state === 'failed' ? ' err' : ''}`, title: tk.note }, tk.note) : null,
          tk.error ? h('div', { className: 'kb-q-note err' }, tk.error) : null,
        ),
        h('div', { className: 'kb-q-side' },
          h('span', { className: 'kb-q-time' }, fmtTime(Date.parse(tk.at))),
          tk.sessionId && tk.state !== 'queued' ? h('div', { className: 'kb-q-acts' },
            h('button', { className: 'kb-btn', onClick: () => openKbSession(tk.sessionId, onHint) }, tt('openSession'))) : null,
        ),
      )),
    ) : null,
    h('div', { className: 'kb-q-head' },
      h('div', { className: 'kb-q-stats' }, statChips,
        data.enabled === false ? h('span', { className: 'kb-chip skipped' }, tt('qDistillOff')) : null,
        data.paused ? h('span', { className: 'kb-chip skipped' }, tt('qPaused')) : null,
      ),
      h('button', { className: 'kb-btn', onClick: () => onAction('pause', { paused: !(data.pausedByUser || data.paused) }) },
        (data.pausedByUser || data.paused) ? tt('qResume') : tt('qPause')),
      h('button', { className: 'kb-btn', onClick: () => onAction('scan', {}) }, tt('qScanRaw')),
    ),
    distillKbs.length ? h('div', { className: 'kb-q-model' },
      tt('qDistillLibs'),
      distillKbs.map((k) => h('button', {
        key: k.id, className: 'kb-btn', style: { marginLeft: 6, padding: '2px 8px', fontSize: 11.5 },
        title: k.distillEnabled === false ? tt('qDistillOffTitle') : tt('qDistillOnTitle'),
        onClick: () => onToggleDistill(k),
      }, `${k.name} · ${k.distillEnabled === false ? tt('qDistillOff') : tt('qDistillOn')}`)),
    ) : null,
    (data.executorDown || data.lastError) && h('div', { className: 'kb-q-banner' },
      tt('qExecutorDown', { err: data.lastError || tt('qExecutorDownFallback') })),
    data.route ? h('div', { className: 'kb-q-model' },
      tt('qRoute', { provider: data.route.provider, model: data.route.model }),
      data.route.source === 'default' ? h('span', { className: 'kb-q-model-hint' }, tt('qRouteDefault')) : h('span', { className: 'kb-q-model-hint' }, tt('qRouteOverride')),
    ) : null,
    data.enabled === false && h('div', { className: 'kb-q-banner' },
      tt('qDisabledBanner')),
    !items.length && h('div', { className: 'kb-empty' }, tt('qEmpty')),
    items.map((it) => h('div', { className: 'kb-q-row', key: it.id },
      h('div', { className: 'kb-q-main' },
        h('div', { className: 'kb-q-name' },
          h('span', { className: `kb-chip ${it.status}` }, qStatusLabel(tt, it.status)),
          ' ', it.rel.split('/').pop(),
          it.chunk ? h('span', { className: 'kb-q-time' }, tt('qChunk', { idx: it.chunk.idx, total: it.chunk.total })) : null,
          it.attempts > 1 ? h('span', { className: 'kb-q-time' }, tt('qAttempt', { n: it.attempts })) : null,
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
            ? h('button', { className: 'kb-btn', onClick: () => onNav({ kind: 'doc', rel: it.pages[0] }) }, tt('qViewOutput')) : null,
          it.sessionId && (it.status === 'running' || it.status === 'done' || it.status === 'failed')
            ? h('button', { className: 'kb-btn', onClick: () => openKbSession(it.sessionId, onHint) }, tt('openSession')) : null,
          (it.status === 'failed' || it.status === 'done' || it.status === 'skipped')
            ? h('button', { className: 'kb-btn', onClick: () => onAction('retry', { id: it.id }) }, tt('retry')) : null,
          it.status === 'queued' ? h('button', { className: 'kb-btn', onClick: () => onAction('cancel', { id: it.id }) }, tt('cancel')) : null,
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
  const tt = useT()
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
      walk(k.id, 'raw', tt('treeRaw'), 1)
    }
    if (k.kind === 'material' && expanded[k.id + '|wiki'] === true) {
      walk(k.id, 'wiki', tt('treeWiki'), 1)
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
        ? h('button', { className: 'caret', 'aria-label': tt('expandAria'), onClick: (e) => { e.stopPropagation(); toggle({ kbId: r.kbId, rel: r.rel }) } }, expanded[key] ? '▾' : '▸')
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
    h('div', { className: 'kbc-pop-h' }, tt('pickerTitle')),
    err && h('div', { className: 'kbc-pop-h' }, tt('pickerLoadFail') + err),
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

/** 轮询条件直到成立或超时；成立时返回真值，超时返回 null。 */
function waitCond(fn, timeout, step) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const tick = () => {
      let v = null
      try { v = fn() } catch {}
      if (v) return resolve(v)
      if (Date.now() - t0 >= timeout) return resolve(null)
      setTimeout(tick, step || 60)
    }
    tick()
  })
}

/** 会话列表快照（sessions 服务的 list store；缺席返回 null）。 */
function sessionSnap() {
  try { return (sessionsSvc && sessionsSvc.list && sessionsSvc.list.getSnapshot()) || null } catch { return null }
}

/** 把 prompt 落到「新建任务」页的输入框：走侧栏「新会话」同一条宿主导航（uiWorkspace.startSession，
 *  复用当前 workspace 的空白会话、否则新建），等视图切到位后直写 composer。
 *  uiWorkspace/会话服务缺席时退回旧行为（写当前视图的输入框）。返回 true=已写入。 */
async function newTaskInsert(prompt) {
  const snap = sessionSnap()
  const canNew = !!(uiWorkspaceSvc && typeof uiWorkspaceSvc.startSession === 'function' && snap)
  if (!canNew) return insertTextViaDom(prompt) === true
  const before = snap.current
  const beforeBlank = before != null && !!(snap.byId && snap.byId[before] && snap.byId[before].blank)
  if (!beforeBlank) {
    // 目标会话页不在「新任务」态：触发宿主导航（不等待返回值——它同步发起异步打开）
    try { uiWorkspaceSvc.startSession() } catch { return insertTextViaDom(prompt) === true }
    // 等 current 离开旧会话（新建/切到别的空白会话/清空回欢迎页）
    const switched = await waitCond(() => { const s = sessionSnap(); return s && s.current !== before ? s.current : null }, 2500)
    if (switched === null && before != null) {
      // 2.5s 仍停在原会话：导航没发生（如 startSession 复用失败），退回写当前视图，别把文本弄丢
      const again = sessionSnap()
      if (!(again && again.current === before && again.byId && again.byId[before] && again.byId[before].blank)) {
        return insertTextViaDom(prompt) === true
      }
    }
  }
  // 等视图真的切到目标：kb composer 槽渲染出的 sessionId 与 current 一致 + 输入卡在 DOM
  const ready = await waitCond(() => {
    const s = sessionSnap()
    return s && document.querySelector('[data-composer-card]') && kbLiveSessionId === s.current ? true : null
  }, 2000)
  if (!ready) {
    // 槽信号缺席（极端环境）：快照已切换的情况下再垫 350ms 等旧视图卸载，然后直写
    await new Promise((r) => setTimeout(r, 350))
  }
  return insertTextViaDom(prompt) === true
}

/** composer 工具行按钮（conversation.input.left slot）。 */
function KbComposerButtonSlot(props) {
  const h = React.createElement
  const tt = useT()
  React.useEffect(ensureKbComposerStyles, [])
  React.useEffect(() => { kbLiveSessionId = props.sessionId }, [props.sessionId]) // 提交后记录——「问 AI」以它确认视图已切到目标会话
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
    if (ok) setMsg(tt('insertedRef'))
    else { try { navigator.clipboard.writeText(text) } catch {} setMsg(tt('insertFailCopied')) }
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
      className: 'kbc-chip', ref: btnRef, title: tt('composerBtnTitle'), 'aria-haspopup': 'dialog', 'aria-expanded': picker !== null,
      onClick: () => (picker === null ? open() : close()),
    }, tt('composerBtnLabel')),
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

/**
 * 中栏接管视图（taskboard board-mount 同款）：容器 div 追加为会话列的末尾子节点
 * （React shell 不管理它），KbPage 常驻其中、`display:none` 待命；开合由
 * html[data-dsh-kb-active] 属性驱动（CSS 隐藏列内兄弟，侧栏和会话列表保持可见）。
 * 三代壳层选择器与侧栏入口同源：dev shell data-pane / 官方 CSS-Module / Desktop 扩展框。
 */
function mountKbView(RDClient) {
  const COLUMN_SELECTOR = '[data-pane="conversation"], [class*="centerCol"], .dshDesktopConversationSurface'
  let container = null
  let root = null
  const tryPlace = () => {
    if (container && container.isConnected) return
    const column = document.querySelector(COLUMN_SELECTOR)
    if (!column) return
    try { if (root) root.unmount() } catch {}
    try { if (container) container.remove() } catch {}
    container = document.createElement('div')
    container.setAttribute('data-dsh-kb-view', '')
    container.className = 'dsh-kb-view'
    column.appendChild(container)
    root = RDClient.createRoot(container)
    root.render(React.createElement(KbPage))
  }
  const waitObserver = new MutationObserver(tryPlace)
  waitObserver.observe(document.body, { childList: true, subtree: true })
  const retry = setInterval(tryPlace, 2000)
  tryPlace()
  return () => {
    clearInterval(retry)
    waitObserver.disconnect()
    try { if (root) root.unmount() } catch {}
    try { if (container) container.remove() } catch {}
    try { document.documentElement.removeAttribute(KB_ACTIVE_ATTR) } catch {}
  }
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
html[data-dsh-kb-active] .dsh-kb-entry{background:var(--dsw-active,rgba(128,128,128,.18));color:var(--dsw-text-primary,inherit);font-weight:500}
[data-sidebar-collapsed] .dsh-kb-entry .dsh-kb-entry-label,[data-sidebar-collapsed] .dsh-kb-entry .dsh-kb-entry-stats,[class*="_collapsed"] .dsh-kb-entry .dsh-kb-entry-label,[class*="_collapsed"] .dsh-kb-entry .dsh-kb-entry-stats{display:none}
`
    document.head.appendChild(style)
  }
  const entry = document.createElement('button')
  entry.type = 'button'
  entry.setAttribute(KB_ENTRY_ATTR, '')
  entry.className = 'dsh-kb-entry'
  const label = entry.appendChild(document.createElement('span'))
  label.className = 'dsh-kb-entry-label'
  const icon = document.createElement('span')
  icon.className = 'dsh-kb-entry-icon'
  icon.textContent = '📚'
  entry.insertBefore(icon, label)
  entry.appendChild(document.createElement('span')).className = 'dsh-kb-entry-stats'
  // 标签/标题按当前语言渲染；语言切换时 notifyLocale → applyLabel 重刷（DOM 不在 React 树里）
  const applyLabel = () => {
    entry.title = t('sidebarTitle')
    entry.setAttribute('aria-label', t('sidebarLabel'))
    label.textContent = t('sidebarLabel')
  }
  applyLabel()
  entry.addEventListener('click', () => { if (kbOpen) kbOpen() })
  const stats = entry.querySelector('.dsh-kb-entry-stats')
  const refreshStats = () => {
    fetch(`${API}/status`).then((r) => r.json()).then((d) => {
      if (stats && d && d.counts) stats.textContent = d.counts.wiki + ' | ' + d.counts.raw
    }).catch(() => {})
  }
  refreshStats()
  const poll = setInterval(refreshStats, 30000)
  // 语言切换时刷新 DOM 入口文案：apply 里 ctx.locale.subscribe(notifyLocale) → localeListeners 回调 applyLabel
  localeListeners.add(applyLabel)
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
    localeListeners.delete(applyLabel)
    try { entry.remove() } catch {}
  }
}

/** 设置页「知识库」区块：自动蒸馏开关与模型路由下拉（GET/PUT /autodistill + GET /models）。 */
function KbSettingsSection() {
  const h = React.createElement
  const tt = useT()
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
    }).catch(() => setMsg(tt('settingsLoadFail')))
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

  if (!st) return h('div', { className: 'kb-set-root' }, tt('loading'))

  const providerSelect = providers.length
    ? (() => {
      const opts = providers.map((p) => h('option', { key: p.id, value: p.id }, p.name || p.id))
      if (st.provider && !providers.some((p) => p.id === st.provider)) opts.push(h('option', { key: '__cur', value: st.provider }, st.provider))
      return h('select', { className: 'kb-set-input', value: st.provider, onChange: (e) => setSt((s) => ({ ...s, provider: e.target.value, model: '' })) },
        h('option', { value: '' }, tt('settingsFollowDefault')),
        opts,
      )
    })()
    : h('input', { className: 'kb-set-input', type: 'text', value: st.provider, placeholder: tt('settingsProviderPh'), onChange: set('provider') })

  const providerModels = (() => {
    const p = providers.find((x) => x.id === st.provider)
    return p ? p.models.map((m) => ({ id: m.id, name: m.name || m.id })) : []
  })()
  const modelControl = st.provider === ''
    ? h('input', { className: 'kb-set-input', type: 'text', value: st.model, placeholder: tt('settingsModelPh'), disabled: providers.length > 0, onChange: set('model') })
    : (() => {
      const opts = providerModels.map((m) => h('option', { key: m.id, value: m.id }, m.name))
      if (st.model && !providerModels.some((m) => m.id === st.model)) opts.push(h('option', { key: '__cur', value: st.model }, st.model))
      return h('select', { className: 'kb-set-input', value: st.model, onChange: set('model') },
        h('option', { value: '' }, providerModels.length ? tt('settingsPickModel') : tt('settingsPickModelAny')),
        opts,
      )
    })()

  const save = async () => {
    setSaving(true)
    try {
      const d = await readJson(await fetch(`${API}/autodistill`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(st) }))
      setSt({ enabled: d.settings.enabled !== false, provider: d.settings.provider || '', model: d.settings.model || '', timeoutMin: d.settings.timeoutMin, maxAttempts: d.settings.maxAttempts, sweepSec: d.settings.sweepSec })
      setRoute(d.route)
      setMsg(tt('settingsSaved'))
    } catch (e) { setMsg(tt('settingsSaveFail') + ((e && e.message) || e)) }
    setSaving(false)
    setTimeout(() => setMsg(null), 2600)
  }

  return h('div', { className: 'kb-set-root' },
    h('p', { className: 'kb-set-hint', style: { margin: '0 0 10px' } }, tt('settingsHint')),
    row(tt('settingsEnable'), h('input', { type: 'checkbox', checked: st.enabled === true, onChange: set('enabled') })),
    row(tt('settingsProvider'), providerSelect),
    row(tt('settingsModel'), modelControl),
    row(tt('settingsTimeout'), h('input', { className: 'kb-set-input', type: 'number', value: st.timeoutMin == null ? '' : st.timeoutMin, onChange: set('timeoutMin') })),
    row(tt('settingsMaxAttempts'), h('input', { className: 'kb-set-input', type: 'number', value: st.maxAttempts == null ? '' : st.maxAttempts, onChange: set('maxAttempts') })),
    row(tt('settingsSweep'), h('input', { className: 'kb-set-input', type: 'number', value: st.sweepSec == null ? '' : st.sweepSec, onChange: set('sweepSec') })),
    route ? h('div', { className: 'kb-set-hint' }, tt('settingsCurrentRoute', { provider: route.provider, model: route.model, src: route.source === 'override' ? tt('settingsRouteOverride') : tt('settingsRouteDefault') })) : null,
    h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 } },
      h('button', { className: 'kbc-chip', disabled: saving, onClick: save, style: saving ? { opacity: .6 } : null }, saving ? tt('saving') : tt('save')),
      msg ? h('span', { className: 'kb-set-hint' }, msg) : null,
    ),
  )
}

/** 中栏接管知识库页 + 侧栏触发按钮（taskboard 同款：挂进会话列，html 属性驱动开合）。 */
let kbOpen = null // 侧栏 DOM 入口 → 打开页面的桥（KbPage 挂载时注册）

const KB_ACTIVE_ATTR = 'data-dsh-kb-active'
const KB_PANEL_NAME = 'dsh-kb'
const KB_ACTIVATE_EVENT = 'dsh-panel-activate'
/** 兄弟面板的开合属性（本面板打开时清掉，保持同刻只开一个）。 */
const KB_OTHER_ACTIVE_ATTRS = ['data-dsh-atb-active', 'data-dsh-taskboard-active', 'data-dsh-ssh-active', 'data-dsh-prc-active', 'data-dsh-git-active']
/** 侧栏会话行（点击即回会话，面板自动关闭）。 */
const KB_SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="newSession"]'

function KbPage() {
  const h = React.createElement
  const tt = useT()
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    kbOpen = () => setOpen(true)
    return () => { kbOpen = null }
  }, [])
  // 兄弟面板激活 → 关自己（互斥协议，dsh-panel-activate 家族）
  React.useEffect(() => {
    const onOtherActivate = (e) => { if (e && e.detail !== KB_PANEL_NAME) setOpen(false) }
    document.addEventListener(KB_ACTIVATE_EVENT, onOtherActivate)
    return () => { document.removeEventListener(KB_ACTIVATE_EVENT, onOtherActivate) }
  }, [])
  // 点侧栏会话行自动关面板（自家入口子树豁免，防先关再开的竞态）
  const openRef = React.useRef(false)
  openRef.current = open
  React.useEffect(() => {
    const onClickRow = (e) => {
      if (!openRef.current) return
      const target = e.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-dsh-kb-entry]')) return
      if (target.closest(KB_SIDEBAR_ROW_SELECTOR)) setOpen(false)
    }
    document.addEventListener('click', onClickRow, true)
    return () => { document.removeEventListener('click', onClickRow, true) }
  }, [])
  // open ↔ html 属性同步（useLayoutEffect：开/关都在绘制前生效，避免闪一帧空列）
  React.useLayoutEffect(() => {
    try {
      if (open) {
        for (const attr of KB_OTHER_ACTIVE_ATTRS) document.documentElement.removeAttribute(attr)
        document.documentElement.setAttribute(KB_ACTIVE_ATTR, '')
        document.dispatchEvent(new CustomEvent(KB_ACTIVATE_EVENT, { detail: KB_PANEL_NAME }))
      } else {
        document.documentElement.removeAttribute(KB_ACTIVE_ATTR)
      }
    } catch {}
  }, [open])
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
      if (op !== 'scan') showHint(op === 'pause' ? (body.paused ? tt('toastQueuePaused') : tt('toastQueueResumed')) : tt('toastQueueOpDone'))
    } catch (e) {
      showHint(tt('toastQueueOpFail') + ((e && e.message) || e))
    }
    fetchQueue()
  }

  const refresh = () => {
    setError(null)
    fetch(`${API}/status?kb=${encodeURIComponent(kbId)}`)
      .then(readJson)
      .then((s) => { setStatus(s); setReloadTick((tk) => tk + 1) })
      .catch((e) => setError(String((e && e.message) || e)))
  }

  React.useEffect(() => {
    if (open) { refresh(); fetchKbs(true).then((l) => setKbs(l || [])) }
  }, [open, kbId])
  React.useEffect(() => { activeKbId = kbId }, [kbId])

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || !open || e.isComposing === true) return
      if (adding) setAdding(null) // 对话框开着时 Esc 只关对话框
      else setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, adding])

  const showHint = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const atRel = (rel) => {
    const root = status && status.root ? String(status.root).replace(/\/+$/, '') : ''
    if (!root) { showHint(tt('toastKbRootUnavailable')); return }
    setOpen(false)
    const result = insertFileRef(root + '/' + rel)
    showHint(result === 'ok' ? tt('toastInserted', { rel }) : tt('toastInsertCopied'))
  }

  const doSearch = () => {
    const q = query.trim()
    if (!q) return
    setNav({ kind: 'search', q })
  }

  // 「🤖 问 AI」：先检索当前库,把命中页 @ 引用 + 问题落到「新建任务」页输入框,agent 带着依据作答
  const askAi = async () => {
    const q = query.trim()
    if (!q) { showHint(tt('toastAskAiHint')); return }
    let hits = []
    try {
      hits = (await readJson(await fetch(`${API}/search?q=${encodeURIComponent(q)}&kb=${encodeURIComponent(kbId)}`))).hits || []
    } catch { /* 检索失败也给 agent 兜底指引 */ }
    const root = status && status.root ? String(status.root).replace(/\/+$/, '') : ''
    const tops = hits.slice(0, 5).map((x) => '@' + root + '/' + x.rel).join(' ')
    const prompt = tt('promptAskAi', { q, root: root || tt('promptAskAiRootFallback') })
      + (tops ? tt('promptAskAiHits', { tops }) : tt('promptAskAiNoHit'))
      + tt('promptAskAiTail')
    setOpen(false)
    const r = await newTaskInsert(prompt)
    if (r !== true) {
      try { await navigator.clipboard.writeText(prompt); showHint(tt('toastAskAiCopied')) } catch { showHint(tt('toastAskAiFail')) }
    } else showHint(tt('toastAskAiInserted'))
  }

  // 页面反馈:记录进本库 wiki/meta/feedback.md;勾选自动处理时由后台会话执行,执行器缺席降级为写入输入框
  const submitFeedback = async (rel, note, auto) => {
    try {
      const d = await readJson(await fetch(`${API}/feedback?kb=${encodeURIComponent(kbId)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: rel, note, auto: auto === true }),
      }))
      setReloadTick((tk) => tk + 1)
      if (!auto) { showHint(tt('toastFeedbackSaved')); return }
      if (d.run) { showHint(tt('toastFeedbackAuto')); return }
      // 执行器不可用：降级为 composer 指令
      const root = status && status.root ? String(status.root).replace(/\/+$/, '') : ''
      const instruction = tt('promptFeedback', { root, rel, note })
      setOpen(false)
      const r = insertTextViaDom(instruction)
      if (r !== true) { try { await navigator.clipboard.writeText(instruction) } catch {} }
      showHint(r === true ? tt('toastFeedbackExecutorDownInserted') : tt('toastFeedbackExecutorDownCopied'))
    } catch (e) { showHint(tt('toastFeedbackFail') + ((e && e.message) || e)) }
  }

  const upload = async (dir, files) => {
    if (!files || !files.length) return
    const cur = (kbs || []).find((k) => k.id === kbId)
    if (cur && cur.kind !== 'material') { showHint(tt('toastUploadReadOnly')); return }
    setError(null)
    const list = Array.from(files)
    let okCount = 0
    for (const f of list) {
      try {
        await readJson(await fetch(`${API}/upload?dir=${encodeURIComponent(dir)}&name=${encodeURIComponent(f.name)}&kb=${encodeURIComponent(kbId)}`, { method: 'POST', body: f }))
        okCount++
      } catch (e) {
        setError(tt('toastUploadFail', { name: f.name }) + ((e && e.message) || e))
      }
    }
    if (okCount) showHint(tt('toastUploaded', { n: okCount, dir }))
    setUploadTick((tk) => tk + 1)
    setReloadTick((tk) => tk + 1)
    fetchKbs(true).then((l) => setKbs(l || []))
  }

  // ── 多库管理 ──
  const delKb = async (k) => {
    if (!window.confirm(tt('toastDelConfirm', { name: k.name }))) return
    try {
      await readJson(await fetch(`${API}/kb/delete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: k.id }) }))
      fetchKbs(true).then((l) => setKbs(l || []))
      if (kbId === k.id) setKbId('main')
      setReloadTick((tk) => tk + 1)
      showHint(tt('toastDelDone', { name: k.name }))
    } catch (e) { showHint(tt('toastDelFail') + ((e && e.message) || e)) }
  }
  const toggleDistill = async (k) => {
    try {
      await readJson(await fetch(`${API}/kb/update`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: k.id, distillEnabled: k.distillEnabled === false }) }))
      fetchKbs(true).then((l) => setKbs(l || []))
    } catch (e) { showHint(tt('toastToggleDistillFail') + ((e && e.message) || e)) }
  }
  const addKb = async () => {
    if (!adding) return
    setBusy(true)
    try {
      const d = await readJson(await fetch(`${API}/kb`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(adding) }))
      const l = await fetchKbs(true)
      setKbs(l || [])
      setAdding(null)
      setKbId(d.kb.id) // 下拉框刷新后选中新建的知识库
      setNav({ kind: 'doc', rel: 'index.md' })
      setReloadTick((tk) => tk + 1)
      showHint(tt('toastAddDone', { name: d.kb.name }))
    } catch (e) { showHint(tt('toastAddFail') + ((e && e.message) || e)) }
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

  // 蒸馏队列是全局的（跨库串行），入口放顶栏右上角；徽章=待处理数，有失败变红
  const curKb = (kbs || []).find((k) => k.id === kbId)
  const queueBtn = h('button', {
    className: 'kb-btn', 'data-cur': nav.kind === 'queue',
    title: tt('queueBtnTitle'),
    onClick: () => onNav({ kind: 'queue' }),
  },
    tt('queueBtn'),
    qPending > 0 ? h('span', { className: `kb-q-badge${qFailed > 0 ? ' alert' : ''}`, style: { marginLeft: 4 } }, qPending) : null,
  )

  return h(React.Fragment, null,
    h('button', { type: 'button', className: 'kb-trigger', onClick: () => setOpen(true), 'aria-label': tt('sidebarTrigger') },
      h('span', { 'aria-hidden': 'true' }, '📚'), h('span', null, tt('sidebarLabel'))),
    open && h('div', {
      className: 'kb-page' + (dropping ? ' kb-drop' : ''),
      role: 'dialog', 'aria-modal': 'true',
      onDragEnter, onDragOver, onDragLeave, onDrop,
    },
      h('div', { className: 'kb-head' },
        h('p', { className: 'kb-title' }, tt('overlayTitle')),
        h('input', {
          className: 'kb-search', placeholder: tt('searchPlaceholder'), value: query,
          onChange: (e) => setQuery(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter' && !(e.isComposing === true)) doSearch() },
        }),
        h('button', { className: 'kb-btn', title: tt('askAiTitle'), onClick: askAi }, tt('askAiBtn')),
        h('span', { className: 'kb-root', title: status && status.root }, status && status.root ? status.root : ''),
        queueBtn,
        h('label', { className: 'kb-btn primary', style: { cursor: 'pointer' }, title: tt('uploadTitle') },
          tt('uploadBtn'),
          h('input', {
            type: 'file', multiple: true, className: 'kb-file',
            onChange: (e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) upload(uploadTargetDir(), fs) },
          }),
        ),
        h('button', { className: 'kb-btn', onClick: refresh }, tt('refresh')),
        h('button', { className: 'kb-btn', onClick: () => setOpen(false) }, tt('close')),
      ),
      h('div', { className: 'kb-body' },
        h('div', { className: 'kb-side' },
          h('div', { className: 'kb-kbrow' },
            h('select', {
              className: 'kb-kbsel', value: kbs ? kbId : '', title: tt('switchKb'), 'aria-label': tt('switchKbAria'),
              onChange: (e) => { setKbId(e.target.value); setNav({ kind: 'doc', rel: 'index.md' }) },
            },
              !kbs ? [h('option', { key: 'loading', value: '', disabled: true }, tt('kbLoading'))]
                : (kbs || []).map((k) => h('option', { key: k.id, value: k.id },
                  (k.kind === 'produced' ? '📁 ' : '📚 ') + k.name)),
            ),
            h('button', { className: 'kb-kbbtn', title: tt('newKbTitle'), onClick: () => setAdding({ name: '', root: '', kind: 'material', distillEnabled: true }) }, '＋'),
            curKb && curKb.id !== 'main' ? h('button', { className: 'kb-kbbtn danger', title: tt('delKbTitle', { name: curKb.name }), onClick: () => delKb(curKb) }, '✕') : null,
          ),
          quick('index.md', tt('quickIndex'), '📖'),
          quick('log.md', tt('quickLog'), '🧾'),
          quick('schema.md', tt('quickSchema'), '📐'),
          h(TreeSection, { rootRel: 'wiki', label: tt('treeWiki'), kb: kbId, cur: nav.kind === 'doc' ? nav.rel : '', onOpen: (rel) => onNav({ kind: 'doc', rel }), onAt: atRel, reloadTick }),
          h(TreeSection, { rootRel: 'raw', label: tt('treeRaw'), kb: kbId, cur: nav.kind === 'doc' ? nav.rel : '', onOpen: (rel) => onNav({ kind: 'doc', rel }), onAt: atRel, onUpload: upload, reloadTick }),
        ),
        h('div', { className: 'kb-main' },
          error && h('div', { className: 'kb-err' }, error),
          !error && nav.kind === 'doc' && h(DocView, { rel: nav.rel, root: status && status.root, kb: kbId, onNav, onAt: atRel, onUpload: upload, reloadTick, uploadTick, onFeedback: submitFeedback, onEditSchema: nav.rel === 'schema.md' ? () => onNav({ kind: 'schema-edit' }) : null }),
          !error && nav.kind === 'history' && h(HistoryView, { rel: nav.rel, kb: kbId, onNav, onHint: showHint, onRestored: () => setReloadTick((tk) => tk + 1) }),
          !error && nav.kind === 'schema-edit' && h(SchemaEditor, {
            kb: kbId, kbName: curKb && curKb.name, onHint: showHint,
            onDone: () => onNav({ kind: 'doc', rel: 'schema.md' }),
            onSaved: () => setReloadTick((tk) => tk + 1),
          }),
          !error && nav.kind === 'search' && h(SearchView, { q: nav.q, kb: kbId, onNav, onAt: atRel }),
          !error && nav.kind === 'queue' && h(QueueView, { data: queueData, kbs, onToggleDistill: toggleDistill, onAction: queueAction, onNav, onHint: showHint }),
        ),
      ),
    ),
    adding && h('div', { className: 'kb-modal-mask', onMouseDown: (e) => { if (e.target === e.currentTarget) setAdding(null) } },
      h('div', { className: 'kb-modal', role: 'dialog', 'aria-label': tt('newKbAria') },
        h('p', { className: 'kb-modal-h' }, tt('newKbHeader')),
        h('input', {
          className: 'kb-search kb-modal-in', placeholder: tt('newKbNamePh'), autoFocus: true, value: adding.name,
          onChange: (e) => setAdding((a) => ({ ...a, name: e.target.value })),
          onKeyDown: (e) => { if (e.key === 'Enter' && !(e.isComposing === true) && adding.root.trim() && !busy) addKb() },
        }),
        h('input', {
          className: 'kb-search kb-modal-in', placeholder: tt('newKbRootPh'), value: adding.root,
          onChange: (e) => setAdding((a) => ({ ...a, root: e.target.value })),
          onKeyDown: (e) => { if (e.key === 'Enter' && !(e.isComposing === true) && adding.root.trim() && !busy) addKb() },
        }),
        h('label', { style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 } },
          h('input', { type: 'checkbox', checked: adding.kind === 'material', onChange: (e) => setAdding((a) => ({ ...a, kind: e.target.checked ? 'material' : 'produced' })) }),
          tt('newKbKind'),
        ),
        h('div', { className: 'kb-modal-acts' },
          h('button', { className: 'kb-btn', onClick: () => setAdding(null) }, tt('cancel')),
          h('button', { className: 'kb-btn primary', disabled: busy || !adding.root.trim(), onClick: addKb }, busy ? tt('newKbAdding') : tt('confirm')),
        ),
        h('div', { className: 'kb-modal-note' }, tt('newKbNote')),
      ),
    ),
    toast && h('div', { className: 'kb-toast' }, toast),
  )
}

module.exports = {
  name: '@weibaohui/dsh-kb',
  inject: ['slots', 'locale'],

  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    // 不 return 任何值（cordis-plugin-loader 把 apply 返回值当 disposable/effect）。

    // i18n：注册 zh/en 词典并绑定 t（对齐 dsh-process / dsh-skill-explorer）。
    // bound 在调用时读当前激活语言，所以组件每次重渲染都拿到新文案；
    // 语言切换通过 ctx.locale.subscribe → notifyLocale 触发 useT 订阅者重渲染 + DOM 入口重刷。
    try {
      if (ctx.locale && typeof ctx.locale.register === 'function') {
        ctx.locale.register(NS, 'zh', ZH)
        ctx.locale.register(NS, 'en', EN)
        const bound = typeof ctx.locale.bind === 'function' ? ctx.locale.bind(NS) : null
        if (bound) t = makeT(bound)
        if (typeof ctx.locale.subscribe === 'function') {
          // 语言切换由 locale 服务回调 notifyLocale：自增 localeVersion（驱动 useT/useSyncExternalStore 重渲染）
          // + 通知 localeListeners（DOM 入口 applyLabel 等）。必须以方法调用 ctx.locale.subscribe(fn) 触发，
          // 裸赋值 localeSubscribe = ctx.locale.subscribe 会丢 this、回调时 this.listeners 抛 TypeError（0.7.7 回归）。
          try { ctx.locale.subscribe(notifyLocale) } catch (e) { console.error('[dsh-kb] locale subscribe:', e) }
          // 立即通知一次：让已挂载的 DOM 入口和 CSS 变量用 bound（而非兜底词典）刷新
          notifyLocale()
        }
      }
    } catch (e) { console.error('[dsh-kb] locale init:', e) }
    setDropVar()

    // 会话服务：动态 inject（客户端 ctx 支持；缺席时「打开会话」降级提示）
    try {
      if (typeof ctx.inject === 'function') ctx.inject(['sessions'], (scope) => { sessionsSvc = scope && scope.sessions })
    } catch (e) { console.error('[dsh-kb] sessions inject:', e) }
    // uiWorkspace：侧栏「新会话」按钮背后的导航服务，「问 AI」用它落到新建任务页（缺席降级）
    try {
      if (typeof ctx.inject === 'function') ctx.inject(['uiWorkspace'], (scope) => { uiWorkspaceSvc = scope && (scope.uiWorkspace || scope) })
    } catch (e) { console.error('[dsh-kb] uiWorkspace inject:', e) }

    // 侧栏导航入口（工艺库下方，dsh-process 同款 DOM 注入）+ 中栏接管视图（taskboard 同款挂载）
    try {
      const RDClient = require('react-dom/client')
      if (RDClient && typeof RDClient.createRoot === 'function') {
        const disposeView = mountKbView(RDClient)
        const disposeSidebar = mountKbSidebarEntry()
        ctx.effect(() => () => { disposeSidebar(); disposeView() }, 'dsh-kb: sidebar entry')
      }
    } catch (e) { console.error('[dsh-kb] sidebar entry:', e) }

    // 设置页「知识库」区块（自动蒸馏配置）
    try {
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: '@weibaohui/dsh-kb',
        order: 65,
        locale: NS,
        label: () => t('settingsLabel'),
        inject: () => ({}),
      }, function KbSettingsSlot() {
        return React.createElement(KbSettingsSection)
      }))
    } catch (e) { console.error('[dsh-kb] settings section inject:', e) }

    // 对话框「+ 知识库」按钮（composer 工具行）：动态 inject（静态列服务会拖住插件激活）
    try {
      composerScope = null
      if (typeof ctx.inject === 'function') {
        ctx.inject(['inputTriggers', 'sessions'], (scope) => { composerScope = scope })
      }
      ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left',
        id: '@weibaohui/dsh-kb',
        order: 63,
        locale: NS,
        label: () => t('composerBtnTitle'),
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
