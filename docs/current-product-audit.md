# 当前产品审计

基线：bcfa606；本地已有用户提供的七个前端文件改进，实施前保存在 .local/pre-simplify-user-changes.patch，不回退。

页面：今日、任务、项目详情、时间轴、提醒、收件箱、Ideas、历史、路线、学习任务、实验、实验详情、AI、手动导入、数据管理。
路由：product-shell.js 用 page/hash 映射，上层八个入口，功能概念重叠。顶部有搜索、语音、快速添加三个动作；AI 页面与快速添加重复。
数据：projects 内嵌 phases/notes；tasks 独立关联 projectId；roadmaps 内嵌阶段与任务；experiments 内嵌步骤；另有 events/inbox/ideas/history/reminders/todayFocus/captureBatches。状态 version=1，MySQL JSON 文档+revision，完整备份与快照覆盖整个文档。
API：GET/PUT /api/state 为统一事务入口；/api/ai/capture/text 与 /api/ai/audio/transcribe 只解析；FastAPI 调用 GPT 和 Gemini；不需要为了展示层分类再创建一套数据库。
重复：历史和时间轴都展示过去；事项/路线/实验多个长期容器；任务和日程两套未来视图；快速添加/AI/语音入口分散。今日原先依赖 todayFocus 单独ID数组。添加反馈只有已保存，缺少类型、归属和可打开的结果。
策略：先建立无破坏的 Project/Task/Record 适配器，再统一导航和入口；旧接口、原数据结构和高级工具继续兼容。新增安排日期覆盖旧 todayFocus 读取；只在用户操作时写入，不在刷新时迁移。撤销仅撤回对应操作，不整体恢复旧快照。
验收：跨普通任务/路线/实验/日程的读写；刷新后安排保留；记录检索；快速记录保存目的地；删除撤销；AI失败无写入；手机底部入口；旧备份导入不丢失。所有写入测试必须用随机测试库。
