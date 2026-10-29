# 数据兼容与迁移

本轮不执行物理迁移，不清空用户库，不在打开页面时保存转换结果。原结构、ID、完成状态、笔记、实验结果与顺序保留。simple-workflows.js 将操作写回原始对象，主API和MySQL事务不重写。

新增可选 records 数组，记录包括 id/title/content/date/projectKey；任务按需追加 scheduledDate。新任务关联旧路线/实验时用 projectKey，原 projectId 留空，避免伪造普通项目外键。完整备份保留这些扩展，旧备份缺字段仍可读取。

高级导入继续使用原 op/kind/expectedTitle 契约，不与新AI轻量解析协议混用。旧收件箱整理在确认成功后才移除原条目，源数据保存在新实体 sourceSnapshot。

撤销为针对当前实体的操作，不整体覆盖旧数据快照；原父级已删除时拒绝恢复，防止孤立数据。继续由 revision/requestId、失败回滚和操作前快照保障事务。

若未来物理统一数据库，应另外做备份、ID映射、幂等迁移和回滚脚本，本轮不隐式执行。
