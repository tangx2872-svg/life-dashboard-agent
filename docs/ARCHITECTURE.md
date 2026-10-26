# 改动边界与接口

来源：线上第 14 版，源码提交 `d1f3ea3e1269daa0d06d24b14df33044d7b0dde8`。`original-site/` 与该版本 `dist/` 文件逐一保留。没有导出作者的浏览器个人数据。

## 保存流程

页面先 GET `/api/state`，取得数据、revision 和仅本次服务运行有效的防跨站 token，再加载原有页面脚本。

原有业务函数同步计算变更。`server-storage.js` 在统一命令边界暂存结果，原来的 `persistData()` 只做内存校验和暂存。命令结束后异步 PUT `/api/state`；数据库事务成功才显示成功提示。保存时阻止继续编辑，失败回退显示并要求刷新；不使用同步 XHR。

浏览器内存里的 `dashboardMemory` 是旧业务检查的兼容接口，不是 localStorage，也不写磁盘。不要误把它当作数据库；跨页面并发由后端 revision 检查负责。以后新增会写数据的页面入口，必须加入 `runDatabaseCommand`，表单回调自动经过该入口。未经过入口调用 `persistData` 会被拒绝。

SQL 使用参数绑定。数据库通过 `SELECT ... FOR UPDATE` 锁定单个控制台状态，检查 revision，在同一事务中写入操作前快照、状态和 requestId。重复请求按 requestId 与内容摘要识别。无效数据、冲突或写入异常回滚。请求体最多 20 MB。

完整数据沿用原字段，使用 LONGTEXT 保存序列化文档，避免 MySQL JSON 规范化影响原文；服务端使用原备份校验器检查后才写。没有拆表，没有丢弃未知字段或数组顺序。快照保留最近 30 次，请求去重记录目前保留全部。

## API

| 接口 | 用途 |
| --- | --- |
| GET /api/state | 已提交的完整状态、revision、savedAt、csrf |
| PUT /api/state | `{data,revision,requestId,reason}`，需 `X-Dashboard-Token` 请求头 |
| GET /api/backup | 当前数据库的 `life-dashboard.backup` v1 完整备份 |
| GET /api/snapshots | 操作前快照目录 |
| GET /api/snapshots/:revision | 下载一份完整快照；仍须通过预览确认才能恢复 |
| GET /api/experiments | 实验 ID / 标题目录，供后续 Agent 选择 |
| GET /api/experiments/:id | 单个实验与当前版本 |

没有注册模型调用或自动修改端点。Agent 将来不能直接生成 SQL，仍走校验与确认。

## 本地使用边界

服务仅绑定 127.0.0.1；校验 Host 与 Origin；写入要求页面取得的 token；不开放跨域；静态文件只来自 public。`.env`、`.local` 和源码不作为静态文件提供。

没有登录、多人租户隔离、云同步和服务端全文索引。当前搜索保留原页面逻辑，数据从 MySQL 读取后在页面检索。如将来部署多人系统，需单独实现认证授权及相应数据模型，不能直接改监听地址上线。

数据库连接和事务参考：
- https://sidorares.github.io/node-mysql2/docs/documentation/promise-wrapper
- https://dev.mysql.com/doc/refman/8.4/en/commit.html

## 智能助手 B

`public/assistant.js` 和 `assistant.css` 提供对话及预览，最后加载。原 JSON 导入转移到数据管理高级工具。

- GET /api/assistant/status：是否配置密钥，不测试实际网络。
- POST /api/assistant/turn：范围、消息、可选 sessionId；返回回答、澄清或草案摘要。
- POST /api/assistant/commit：sessionId、proposalId、confirmed=true；不能上传候选状态。
- POST /api/assistant/cancel：取消草案。

所有写接口沿用 Origin / CSRF 检查。候选状态仅在服务端内存保存，30 分钟过期，最多 32 个会话；模型只提供操作建议，不能执行代码或 SQL。服务端复用 experiments.js 中可信的 experimentCapture 规则，另检查操作范围和数量。确认时用草案生成时的 revision 原子提交；并发修改会导致拒绝，防止覆盖。提交失败后前端要求刷新核对真实数据库状态。

使用 OpenAI Responses API 的严格 JSON Schema，store:false。默认模型 gpt-4.1-mini 可由 OPENAI_MODEL 配置。密钥只从服务端环境与 .env 读取。官方参考：https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses
