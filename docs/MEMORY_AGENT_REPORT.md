# 连续记忆与 Agent 本轮交付报告

## 旧账户验收
legacy_owner 已启用；用户已在真实网页确认5项目、20任务、6历史完整，修改任务后刷新/登出重登均保留。没有读取、保存或打印用户密码。隔离库自动测试认领、登录恢复、修改持久化与用户隔离。
认领脚本修复粘贴输入遇回车丢字符，抽出可测试 claimLegacy 工具层。

## 文件
新增：server/agent-memory.mjs、agent-engine.mjs、agent-observer.mjs、legacy-claim.mjs；public/agent-ui.js；ai-backend/api/agent_routes.py；scripts/migrate-memory.mjs。
修改：server/account-gateway.mjs、index.mjs、ai-backend-client.mjs；public/bootstrap.js、life-planner.js；ai-backend/app.py；scripts/legacy-owner.mjs。
测试：tests/agent-memory.test.mjs、agent-http.test.mjs、agent-browser.test.mjs；ai-backend/tests/test_agent_memory.py。
文档：AGENT_COMPETITION_ENHANCEMENT_PLAN.md、COMPETITION_INNOVATIONS.md、本报告。

## 数据库与迁移
agent_memory(user_id CHAR(36) PRIMARY KEY, body LONGTEXT)：记忆模型包含 id/userId/content/summary/category/importance/confidence/sourceType/sourceId/createdAt/updatedAt/lastUsedAt/useCount/status/key。
agent_observations(user_id CHAR(36) PRIMARY KEY,body LONGTEXT,revision INT,updated_at VARCHAR(32))：周期观察。
两个 user_id 均 NOT NULL，外键 users(id) ON DELETE CASCADE；主键提供用户索引。无独立向量索引，最多300条，规则相关性排序。
显式幂等迁移保留旧表、旧文档与 userMemories，仅首次复制旧记忆。应用账户权限未增加；管理连接只执行建表。记忆单独更新不推进业务 revision，避免异步提炼与前台保存冲突。
回退时停服务、导出账号备份并回退代码，保留新增表，不自动 DROP 或删除记忆。其他环境先完整备份，再用临时迁移账户运行脚本（MIGRATION_DB_USER/MIGRATION_DB_PASSWORD）；随后清除临时凭据。

## 完整链路
用户文字/转写 → session 用户 Context → 当前项目/必要任务 → retrieveRelevantMemories → 最多8条非可信辅助背景 → Python 既有 Provider → 原规划/Capture 或上下文回答 → 用户获得响应 → 异步提炼 → JSON/Pydantic及Node校验 → 敏感与低置信度过滤 → 同主题去重/更新 → user_id 行事务保存。
用户明确要求“记住偏好/目标”的短句使用快速规则立即保存并反馈结果；其他稳定事实响应后提炼。知识问答、临时状态、凭据不保存。暂停/删除的记忆不参与检索；使用次数与最近使用时间后台更新。

## Agent 架构与安全
Memory、Planner、Risk、Review、Action 是职责模块；复用一个现有模型服务，不额外启动5个模型。步骤轨迹只含实际工作摘要。
Radar：逾期、负载、停滞、缺少下一步，最多3条；后台10分钟轮询，不依赖打开网页，无外部推送。
Replan：用户选择建议后生成限时、绑定 revision 与当前会话的提案，明确确认才执行，记录 planningDecisions。旧版本或他人提案拒绝。
Simulator：深拷贝、按估时排程；采用时才保存。无估时按30分钟，超出日容量会给风险，未考虑未知依赖。
Temporary Context：“今天累”不记为长期习惯；仅影响本次缩减提案。

## API
GET /api/memories；POST /api/memories；PATCH/DELETE /api/memories/:id；POST /api/memories/search。
GET /api/agent/briefing、/api/agent/review；POST /api/agent/replan、/simulate、/commit、/dismiss、/feedback。
所有用户范围由 session 决定，忽略客户端指定的 userId；非GET需要当前会话CSRF。原 /api/account/memories 统一指向新服务；两个导出入口包含记忆。
Python 内网 /api/agent/memory、/answer、/capture 使用已有 Provider，不面向公网。模型输出不获得数据库访问权限。

## 实测
- Node数据库/账户/规划/记忆/HTTP：13/13通过。
- Chrome账户/Agent/首页/语音：5/5通过。实际点击记忆中心、Radar建议、模拟预览、确认保存；验证模拟前revision不变。
- Python：81/81通过（合成Provider测试）。
- 构建与76个JavaScript脚本检查通过。
- A偏好保存与相关检索通过；B期刊目标进入上下文通过；C期刊更新保留一条当前主题通过；D知识问题不保存通过；E跨用户搜索/修改/删除均隔离。
- Prompt上下文检查、暂停/删除、敏感过滤、低置信度、版本冲突、他人提案拒绝均有测试。
- 真实现有Provider合成样例：带期刊记忆问答正确，7046ms；结构化提炼通过schema，1条候选，7225ms；带记忆Capture返回1条行动，5394ms。未写入用户真实业务数据。
- 检索含数据库读取100次平均约0.13–0.22ms；这是本机小样本，不是高并发基准。主请求仍受模型服务时延影响。
- 未统计真实token账单，不能给出精确费用。普通知识问答不额外触发提炼；规则提炼、检索、风险、回顾、模拟不调用模型。

## 边界与风险
本轮完成了可操作的连续记忆、轻量职责编排、规则Radar、确认重排及模拟。尚未实现根据一个月行为自动训练任务粒度、任意复杂跨模块命令、专门的一键Demo数据注入、持久化跨重启提案或模型消耗账单。
语义去重使用主题键/规则而非向量，未知主题仍可能产生重复或矛盾；记忆中心可修正。背景提炼是本进程后处理，服务被强停可能丢掉未完成提炼，不保证任务队列级交付。
提案与短对话是会话内存，重启后需要重建；长期记忆在服务器持久化。后台轮询按现有单进程规模运行，无外部推送，也不会未经确认改用户任务。
日期沿用现有中国时区语义，多时区规划需下一轮专门验证。没有公网部署或安全审计承诺。

## 下一阶段建议（未执行）
观测行为与用户反馈建立有证据的规划模式；增强同义主题冲突处理；可恢复后台任务；多时区与高并发压力测试；更多组合命令与可重放演示脚本。
