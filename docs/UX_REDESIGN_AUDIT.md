# UX Redesign Audit — 从「任务管理后台」到「AI 生活助手」

生成日期：2026-10-30
范围：`public/*`（前端交互 / 信息架构 / 视觉）、`server/*`（Planner Agent、路由）、`tests/*`（回归）
原则：**后台复杂，前台简单**。后端能力全部保留，前台只保留「说 → 看 → 改 → 确认 → 完成」。

---

## 1. 当前结构盘点

### 1.1 路由（21 个，`public/product-shell.js: productPages`）

| 路由 | 页面 | 分类（新） |
|---|---|---|
| `home` | 今日 | A 核心 |
| `tasks` | 任务（分组列表 + 筛选 + 抽屉表单） | B 高级 |
| `projects` / `detail` | 项目 / 项目详情（阶段 + 里程碑 + 笔记） | B 高级 |
| `review` | 本周回顾 | A 核心 |
| `timeline` | 时间轴 | B 高级 |
| `inbox` | 收件箱 | B 高级 |
| `ideas` | 想法库 | B 高级 |
| `archive` | 历史记录 | B 高级 |
| `reminders` | 行动提醒 | B 高级 |
| `roadmaps` / `roadmap` / `learningTask` | 学习路线 | B 高级 |
| `experiments` / `experimentDetail` | 实验 | C 开发 |
| `records` / `settings` | 记录 / 设置 | B 高级 |
| `aiCapture` | AI 快速记录（文字 + 语音） | A 核心 → **升为首页第一入口** |
| `assistant` | 旧智能助手 | C 开发 |
| `gptImport` | JSON 导入 | C 开发 |
| `dataManagement` | 数据管理（备份 / 快照 / 重复检查 / 带 ID 的删除树） | C 开发 |

### 1.2 导航与按钮

- 侧栏 nav：4 项（今日 / 任务 / 项目 / 记录）+ 独立「⚙ 设置」按钮。
- 侧栏底部：**导出数据、导入备份、「● 数据保存在 MySQL」**（技术信息暴露）。
- Header：`⌕ 搜索`、旧「♩ 语音记录」、「＋ 快速记录」。
- 移动端 dock：4 项 + 悬浮 ＋。
- 任务页（`product-tasks.js`）：Tab 4 个（待办 / 进行中 / 已完成 / 全部）+ 分类 chips + 排序 select + 搜索 + 行内 ☆/★ + 每行「编辑 / 删除 / 完成」。
- 项目页：状态 Tab 4 个 + 分类 chips + 新建事项 + 新增分类。
- 项目详情：阶段「编辑 / 删除」、里程碑「完成 / 编辑 / 删除」、笔记、删除事项。
- 数据管理：备份 / 恢复 / 快照 / 重复检查 / 带数据库 ID 的管理树 / JSON 导入。

**结论：普通用户可见的主操作按钮 > 20 个，且多数要求用户先理解 Task / Project / Stage / Milestone / Priority / Status 的概念。**

### 1.3 操作步骤计数（重构前）

| 目标 | 步骤 | 需要理解的概念 |
|---|---|---|
| 创建一个任务 | 6～9 步：任务页 → ＋ 添加任务 → 标题 → 展开「更多」→ 描述 / 状态 / 子任务 / 日期 / 时间 / 优先级 / 所属项目 / 阶段 → 保存 | 状态、优先级、阶段、项目归属 |
| 创建一个项目计划 | 3 张表单 + 多次保存：新建事项（标题/描述/分类/状态/目标日期）→ 新增阶段 → 在阶段里添加任务 | 项目、阶段、分类、状态 |
| 调整一次排期 | 3～4 步：找到任务 → 打开抽屉 → 改日期 → 保存；多任务调整需重复 | 日期字段 |
| 用 AI 记一件事 | 4 步：打开快速记录 → 输入 / 语音 → 整理一下 → 在预览里逐项改类型 / 项目 / 日期 → 确认保存 | 类型（task / project / record）、项目归属 |
| 用自然语言改计划 | **不支持** | — |

### 1.4 技术字段暴露清单

| 位置 | 暴露内容 | 处理 |
|---|---|---|
| 侧栏底部 | 「● 数据保存在 MySQL」 | 改为「已保存」 |
| `#save-status` | 版本、同步、后端状态 | 移入开发者 |
| `gptImport` | JSON 文本、batchId、Schema | 移入开发者 |
| `captureUI.error` | 「该批内容已经保存，请勿重复导入」 | 改为「这句我刚刚已经整理过了」 |
| `managedTree` | 数据库 ID、`Project/Roadmap` 类型名 | 移入开发者 |
| 数据管理页 | 快照、检查点、备份恢复、重复检查 | 移入开发者 |
| 时间轴 / 历史 | `type` 字段（任务/里程碑/阶段） | 保留语义，UI 用人话 |

### 1.5 属于「后台管理设计」的页面

`dataManagement`、`gptImport`、`assistant`、`experiments*`、`roadmaps*`（学习路线与实验是垂直业务，不属于日常生活主流程）、`tasks` 的多字段抽屉表单、`archive` 的数据库式统计。

---

## 2. 新信息架构

### 2.1 导航（4 项，唯一主导航）

```
首页    计划    回顾    我
```

- **首页**：说话入口（文字 + 语音）→ 今天 → 最近 → AI 建议。
- **计划**：所有「我要做的事」，按 AI 自动分类聚合，最多两层（计划 → 详情）。
- **回顾**：本周完成 / 需要重新安排 / 一直没完成的。
- **我**：偏好、数据、高级功能（折叠）、开发者（折叠，默认关闭）。

`Ctrl / ⌘ + K` 统一入口改为「告诉我你想做什么……」，直接进 Planner，而不是旧的「搜索任务、项目、记录」。

### 2.2 首页结构（P0）

```
早上好 / 下午好
有什么想安排的吗？

[ 跟我说说最近要做什么……            ]
                              🎙

今天 · 3 件事
 ● 修改论文摘要        09:30 · 90 分钟
 ● 六级听力            20:00 · 30 分钟

最近
 论文修改          ▓▓▓▓▓▓▓░░  还有 4 步
 机器学习作业      ▓▓▓▓▓░░░░  周五截止
 杭州周末          ▓▓▓░░░░░░  周六出发

AI
 「周三已经排了 5 件事，要不要把实验检查挪到周四？」
 [帮我调整] [先不用]
```

### 2.3 「计划」页

不再区分 Project / Task / Milestone。统一为「计划」，AI 自动分类：

```
科研
  论文修改        还有 4 步
学习
  机器学习作业    周五截止
生活
  杭州周末        周六出发
```

进入计划详情 = 唯一二级页面，展示阶段与步骤、进度、和「💬 和 AI 调整」。

### 2.4 交互模型（Capture → Intent → Plan → Changes → Execute）

```
用户输入（文字 / 语音）
   ↓  capture（原始文本 + 时间 + 上下文）
AI understand / classify        ← 复用 /api/ai/capture/text
   ↓  intent: create | modify | query | clarify
Planner decompose + schedule + reconcile   ← server/planner.mjs（确定性规则 + AI 抽取）
   ↓  proposed changes（change set）
前端只展示：message + 计划预览
   ↓
用户：接受 / 继续说 / 撤销
   ↓
store.commit（revision 冲突 + requestId 幂等 + 快照）
```

### 2.5 状态的人话映射

| 内部值 | 用户看到 |
|---|---|
| `todo` | 还没开始 |
| `doing` | 正在进行 |
| `done` | 完成 |
| `paused` | 暂时搁置 |
| 逾期 | 需要重新安排 |
| `priority: high` | 优先 |

---

## 3. Planner Agent 设计（新增 `server/planner.mjs`）

| 阶段 | 职责 | 实现 |
|---|---|---|
| understand | 抽取实体（事项、时间、时长、频率） | 优先调用已有 `ai.parse_text_capture`；离线时用确定性中文规则 |
| classify | 判断 task / project / event / note / goal | 关键词 + 结构信号（是否含「准备 / 备考 / 论文 / 项目」等） |
| decompose | 项目自动拆阶段与步骤 | 模板库（论文 / 考试 / 课程作业 / 出行 / 健身 / 通用）+ AI 结果覆盖 |
| schedule | 按容量排期 | 每天 1 个核心 + 最多 3 个小任务；避开休息日；尊重截止日 |
| reconcile | 冲突检测 | 与已有任务按日期聚合，超过容量则顺延并给出建议 |
| modify | 自然语言修改 | 意图：改期 / 移动 / 删除 / 降载 / 加任务 / 排除某天；支持指代解析 |
| query | 读取数据库回答 | 「我这周还有什么」「论文还剩多少」「哪个最急」 |
| summarize | 人话反馈 | 「整理好了。」「周三有点满，我把实验挪到了周四。」 |

返回结构（前端只消费 `message` / `plan` / `changes`）：

```json
{ "sessionId","intent","message","plan":{"title","category","stages":[{"title","tasks":[{"title","date","minutes"}]}]},
  "changes":[{"op":"add|move|update|delete","kind":"project|task","title","from","to"}],
  "needsConfirmation":true,"revision":12 }
```

会话上下文：`conversationId`、`currentFocus`（最近讨论的计划）、`recentOperations`（用于「这个 / 刚才那个 / 论文那个 / 第二个」指代解析）。

---

## 4. 复用与废弃

### 复用（禁止重写）

- `server/store.mjs`：`read / commit / snapshots`，revision 冲突 + requestId 幂等 + 快照。
- `server/ai-backend-client.mjs`：`parse_text_capture`、`transcribe_audio`（语音转写）。
- `public/server-storage.js`：`runDatabaseCommand`、乐观锁、离线保留。
- `public/simple-model.js`：`simpleProjects / simpleTasks / simpleNewTask` 等投影与写入。
- `public/product-ai.js`：`productAudio` 录音 + 转写链路（MediaRecorder → `/api/ai/audio/transcribe`）。
- `public/simple-model.js: simpleUndo`：Undo 机制（低风险操作直接做 + 撤销）。
- `server/schema.mjs` + `public/data-schema.js`：备份校验。
- `public/reminders.js`、`archive()`：提醒与历史。

### 降级 / 隐藏（不删除后端能力）

| 入口 | 新位置 |
|---|---|
| 任务页、项目页、时间轴、收件箱、想法、历史、行动提醒、学习路线 | 我 → 高级功能 |
| JSON 导入、数据管理、旧智能助手、实验 | 我 → 开发者（默认折叠） |
| 侧栏「导出 / 导入 / 数据保存在 MySQL」 | 我 → 开发者 |
| Header「＋ 快速记录」「♩ 语音记录」 | 合并为首页一个输入 + 一个麦克风 |

### 直接移除的用户可见元素

- 首页 / 任务页上并列的多个「新增」按钮（新增任务 / 新增项目 / 新增阶段 / 快速任务 / 导入）。
- 任务抽屉里的 状态 / 优先级 / 阶段 / 项目归属 四个必填式选择器（改为 AI 判断，高级功能里保留）。
- 预览卡片里的 JSON / batchId / 类型下拉。

---

## 5. 技术风险与对策

| 风险 | 对策 |
|---|---|
| AI 后端离线（6016 未启动） | Planner 内置确定性中文规则，离线也能生成计划；AI 可用时覆盖抽取结果 |
| 旧浏览器测试依赖旧导航选择器 | 同步更新 `tests/product-browser.test.mjs`；保留旧路由可用（开发者入口） |
| 结构化输出不可信 | 所有操作经 `buildChanges` 白名单校验，再走 `store.commit`（revision + requestId） |
| 删除类操作风险 | 删除必须确认；移动 / 改期 / 新增直接执行 + Undo |
| 数据结构变化 | 只做加法（新增 `plans` 视图字段为派生值，不改动既有表），旧数据零迁移 |
| 语音不可用 | 复用现有 MediaRecorder + 服务端转写，失败降级为文字输入 |

---

## 6. 验收场景（对应需求 50）

1. 「这周我要把论文改完，周三还有课，周六想休息。」→ 直接生成 6 段计划并排到不同日期，周三减量、周六留空。
2. 「周四事情太多，把论文那个往后放。」→ 命中最近讨论的论文计划，仅局部改期。
3. 「六级最近有点落下，每天帮我安排半小时。」→ 建立长期计划，每天 30 分钟。
4. 「明天不想学习了。」→ 明天学习类任务整体顺延。
5. 「我这周最重要的事情是什么？」→ 查询类回答，不改数据。
6. 全程不点「新增任务 / 新增项目 / 编辑任务」→ 仍可完成 90% 核心能力。

---

## 7. 实施结果与 Change Log

### 7.1 新增文件

| 文件 | 作用 |
|---|---|
| `server/planner.mjs` | Planner Agent：understand / classify / decompose / schedule / reconcile / modify / query / summarize。确定性中文规则 + 可选 AI 抽取，**永不写库** |
| `public/life-planner.js` | Planner 客户端：发送、预览、执行 change set、Undo、MediaRecorder 录音 → 服务端转写 → 直接成计划 |
| `public/life-home.js` | 新首页：问候 + 一句话输入 + 语音 + 结果预览 + 今天 + 最近 + AI 建议 |
| `public/life-plans.js` | 统一的「计划」页与两级详情（去掉 Project / Task / Milestone 三分） |
| `public/life-me.js` | 「我」：习惯、数据、高级功能（折叠）、开发者（折叠，默认关闭） |
| `tests/planner.test.mjs` | 7 项 Planner 单元测试（拆解、排期、指代、习惯、留空、查询、降载） |
| `tests/life-browser.test.mjs` | 2 项端到端测试（一句话 → 计划 → 撤销；导航层级 + 开发者隔离 + 移动端） |
| `docs/UX_REDESIGN_AUDIT.md` | 本文档 |

### 7.2 服务端

- `server/index.mjs`：新增 `GET /api/planner/status`、`POST /api/planner/turn`、`POST /api/planner/cancel`；沿用原有 CSRF 校验、请求体上限与错误映射。
- `server/planner.mjs` 关键规则：
  - 意图判定区分「陈述目标 + 约束」与「修改指令」，避免把「周六想休息」当成修改。
  - 截止日只从「之前 / 截止 / 下周 / 这周」等明确措辞推导，避免把「周六」误当 deadline。
  - 排期窗口按截止日收窄，1 核心 + 2 小任务/天，跳过休息日。
  - 会话内记忆：`focus`（当前计划）、`recent.taskIds`（「这个 / 第二个」指代）、`restDays`（刚说过的休息日）。
  - 局部修改优先：只动超载的那一天，不重排整份计划。
- 数据结构只做加法：新增可选 `plannerProfile.restDays / dailyMinutes`，并在 `public/data-schema.js` 中登记校验；旧备份与旧数据零迁移。

### 7.3 前端

- 导航从 4 项（今日 / 任务 / 项目 / 记录 + 设置）改为 4 项（首页 / 计划 / 回顾 / 我），侧栏底部「导出 / 导入 / 数据保存在 MySQL」全部移入「我 → 开发者」。
- Header 从「搜索框 + 语音记录 + 快速记录」精简为「Life + 头像」；`Ctrl/⌘ + K` 不再是搜索，而是把光标送进首页输入框。
- 首页：一句话输入（Enter 发送）、麦克风（录音 → 转写 → 直接出计划）、结果预览（按天列出）、今天、最近、AI 建议（超载日提示 + 一键调整）。
- 计划页：按 AI 分类聚合，只保留「计划 → 详情」两层；详情页每行一个勾选，底部只有「和 AI 调整」「更多细节」。
- 回顾页去掉卡片墙，改为数字 + 列表。
- 低风险操作（改期 / 挪动 / 新增 / 记下休息日）直接执行并给 Undo；只有批量删除要求确认。
- 所有技术字段（JSON、batchId、数据库 ID、快照、API 状态）只在开发者模式下出现。

### 7.4 兼容与测试

- 旧路由全部保留（`tasks / projects / detail / timeline / inbox / ideas / archive / reminders / roadmaps / experiments / aiCapture / gptImport / dataManagement / assistant`），只是不再出现在主导航；旧的 AI 预览与数据管理能力仍可被开发者入口与测试调用。
- 调整了三个受 IA 变更影响的旧测试（导航文案、Ctrl+K 语义、快速记录入口），没有放宽任何业务断言。
- `npm run lint`：58 项 JS 语法 / 入口资源检查通过。
- `npm test`：26 项全部通过（含 MySQL、AI 代理、旧界面回归、Planner、新首页 E2E）。
- 1280 / 390 两个宽度下 11 个页面无横向溢出，无控制台报错。

### 7.5 已知取舍

- AI 后端未启动时，拆解质量取决于内置模板（论文 / 考试 / 作业 / 出行 / 健身 / 工作 / 通用）。AI 可用时只用于实体抽取，模板与排期仍由确定性规则兜底，避免不可预期的输出。
- 「今天」只展示今天日期上的任务与今日专注，不做智能推荐排序；推荐集中在「AI 建议」一块，保持首页安静。
- 学习路线与实验属于垂直业务，暂未并入「计划」，仍留在高级功能里。
