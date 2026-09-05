---
name: dsh-kb
description: 团队知识库（dsh-kb）的查询与沉淀。干活前先查知识库；踩坑、决策、复盘后按 schema 两步加工入库（分析→成文），矛盾必须显式标注，raw 素材不可变。适用于 FDE 离线盒子上的现场知识共享。| Query & distill the team knowledge base (dsh-kb): search before work, distill lessons/decisions/postmortems into wiki pages after work, mark contradictions explicitly, keep raw/ immutable.
---

# dsh-kb 团队知识库

知识库根目录：`$DSH_KB_ROOT`（未设置时为 `~/.dsh/kb`）。人机共写——**人往 raw/ 丢素材，你负责加工成文和维护 index**。动笔前先读 `schema.md`，它是最终权威；本技能与其冲突时以 schema.md 为准。

## 何时查

任务涉及现场故障、客户环境差异、操作步骤、历史决策时，**先查再干**：

1. 先看 `index.md`（目录）；没有把握就用全文搜索知识库根目录关键词（症状、报错原文、模块名、客户名）
2. 命中多条时优先 `updated` 新、有 `[[互链]]` 多的条目；注意条目的适用环境（frontmatter tags）
3. 查不到就直说查不到，不要编造条目

## 何时写

出现以下情况，会话结束前完成沉淀：

- 踩坑并找到解法 → `wiki/howtos/`
- 做了有取舍的决策 → `wiki/decisions/`
- 故障复盘 → `wiki/postmortems/`

## 两步加工（不要合并成一步）

1. **分析**：读 raw 素材（log、截图描述、聊天记录），列出关键实体、步骤、结论；然后对照 wiki 已有条目，找出：关联（该链到谁）、矛盾（与哪条冲突、环境差异是什么）、缺口（index 上哪些小节该有而没有）
2. **生成**：按分析结果写/更新页面，然后维护 `index.md` 挂链接、`log.md` 追加一行

## 页面规范

- 文件名 kebab-case 英文；目录按上面三类，不新增顶层目录
- frontmatter 必填：`title / tags / author / created / updated`（author 问用户或用用户名；updated 每次改动都要更新）
- 正文模板：howto = 症状 → 原因 → 步骤 → 验证；decision = 背景 → 选项 → 结论 → 后果；postmortem = 时间线 → 根因 → 改进项
- 引用素材写进 frontmatter `sources: [raw/...]`
- 互链用 `[[页面名]]`；**矛盾必须显式化**：与已有条目冲突时，两个页面都要加「⚠️ 与 [[对方]] 矛盾：适用环境差异是……」
- 不确定的内容写进页面末尾「待确认」小节，不要编

## 硬性禁令

- **raw/ 不可变**：不得修改、移动、删除 raw/ 下任何文件
- 不得删除 wiki/ 下文件；纠错靠更新页面并在 log.md 记录
- 新页面必须挂进 index.md，否则视为未完成
- **index.md/log.md 先读后写**：写入前重新读最新文件再追加（不要拿会话里缓存的旧版本整文件重写——其他会话可能刚写过），写完确认自己的行还在
- log.md 每次写操作追加一行：`- YYYY-MM-DD HH:mm <author> <新增|更新|标注矛盾> <wiki 路径> ← <raw 路径>`

## author 规则

- 宿主能拿到当前登录用户就自动用；拿不到则**本次会话第一次写入前问一次**，之后记住不再问

## 月度 lint（由 dsh-tasks 定时触发时执行）

检查并输出清单：`[[...]]` 死链、index 不可达的孤儿页、`updated` 超 90 天的条目；结果写入 `wiki/postmortems/` 平级的新页 `wiki/meta/lint-YYYY-MM.md` 并记 log，等人工处理。
