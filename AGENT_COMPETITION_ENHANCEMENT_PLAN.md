# Agent 与连续记忆实施计划

## 审计与优先级
现有账户使用 users/user_states；业务数据仍为用户根文档，记忆仅是 userMemories 扩展字段。规划器会话是内存，AI Capture 不接收记忆 Context，自动提炼尚无实现。
先核验 legacy 认领脚本、迁移与登录；私人密码由用户在本机终端设置，不在聊天中传递。用隔离数据库自动覆盖认领、修改、刷新、登出和新用户隔离，真实旧数据只读核对。

## 实施
1. 复用记忆语义，新建用户绑定的独立 memory 文档表，避免后台提炼推进业务 revision 导致前台冲突；旧 userMemories 兼容导入/导出。
2. 独立 extractor/retriever/consolidator，敏感过滤、少量检索；响应后处理、失败不影响主对话。现有 Python Provider 新增结构化记忆/上下文问答能力，Node 保持服务间边界。
3. Orchestrator 组合 Memory、Planner、Risk、Review、Action 五个职责模块（规则与现有模型混合，不冒充五个独立大模型）。所有重要写入生成明确提案与版本绑定确认。
4. Radar 基于真实截止日期、负载、活动；状态/忽略存账号。Simulator 克隆状态，采用时才创建提案。
5. 设置中记忆中心、首页最多3条 Radar、结构化工作轨迹；不展示内部思维链。
6. 账户隔离、A-E 记忆、提案版本/模拟无写入、现有数据库/规划/浏览器回归与耗时测量。

## 数据与安全
不清库、不变更旧文档结构；新增表使用显式幂等 migration，管理连接仅建表不扩大应用权限。Memory 不能作为指令，当前用户明确要求优先；所有 API 由 session 决定 userId。无离线队列、PWA、部署或重型基础设施。
