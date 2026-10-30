# 账户与服务器持久化交付说明

## 修改文件
server/accounts.mjs：Argon2id、用户/会话表、按 user_id 的状态/快照/幂等请求/活动记录、旧文档迁移。
server/account-gateway.mjs：身份入口、Origin/CSRF、登录注册限流、访客空间、按身份分离助手/规划会话、记忆与偏好、merge/export。
server/index.mjs：认证上下文注入所有业务与 AI 路由，生产 origin 配置。
public/account-entry.js、bootstrap.js、index.html：登录注册/访客、设备 IndexedDB、确认合并、登出清理、数据与隐私。
scripts/legacy-owner.mjs、migrate-accounts.mjs：本机旧账户设密、迁移核对及非删除回滚。
tests/accounts.test.mjs、accounts-browser.test.mjs：真实数据库/Chrome 回归。
package.json：Node >=24.7（原生 Argon2）；无新增外部依赖。

## 本机迁移结果
2026-10-30：旧文档逐字核对一致，5 项目、20 任务、6 历史，revision=4；原表保留。
原文档、原快照与原请求备份位于 .local/auth-backups/legacy-*.json。请复制至异机安全位置。
使用临时管理连接完成 DDL，应用账户权限未增加。运行时不重复执行已完成的 DDL。
legacy_owner 默认 locked，必须本机运行 node scripts/legacy-owner.mjs 设置自己的密码；终端不回显密码。

## 首次部署
1. 停止旧写入服务，完整备份数据库（包括账户表，使用部署平台的数据库备份工具）。
2. Node >=24.7，保留现有 MySQL 配置。迁移账户临时通过 MIGRATION_DB_USER / MIGRATION_DB_PASSWORD 环境变量注入（不要放命令行参数或提交 Git）；运行 node --env-file-if-exists=.env scripts/migrate-accounts.mjs，随后清除临时变量。
3. 本机交互运行 node --env-file-if-exists=.env scripts/legacy-owner.mjs；用户名 legacy_owner。
4. NODE_ENV=production，PUBLIC_ORIGIN=https://你的域名，PORT=3000。反向代理仅转发固定域名到 127.0.0.1:3000，提供 HTTPS。Cookie 生产自动 Secure/HttpOnly/SameSite=Strict。不信任任意 X-Forwarded-*，不开放跨域。FastAPI 保持内网并使用原服务间鉴权。
5. 启动 node --env-file-if-exists=.env server/index.mjs。未登录 state/backup/AI 均不可访问；正式数据只由账号 ID 决定归属。

## 回滚
停写并备份完整数据库。运行迁移脚本 --rollback 将 legacy 当前文档复制回原 dashboard_state（先备份原文档），不会删除新账户或其表。旧代码只看 legacy 空间；新账户必须保留数据库并待恢复账户版后访问。原快照/请求表保留，不宣称旧版能识别新账户。回滚仅用于紧急恢复 legacy，不能作为全用户降级。

## 数据语义
各业务实体仍在 user_states 的 JSON 内；NOT NULL user_id 外键在根文档、快照、请求和活动层保证归属。偏好 userPreferences、记忆 userMemories 随文档服务器持久化，可跨设备读取。不是独立关系实体表。
缓存用 user:<uuid> 分区；访客用 guest 分区。访客主要数据在设备，服务器暂存空间用于既有规划器，最长一天；关闭服务器后通过设备备份恢复。访客敏感内容仍会随 AI 功能发送服务，不能称为完全离线模式。
默认 merge 只追加未出现 ID，保留原有项目/引用；同 ID 项目不递归追加嵌套笔记，因此冲突项仍保留账号原内容。重试不会重复追加。

## 测试
9/9 数据库/账户/规划测试通过；账户浏览器测试验证访客创建项目/任务/记录、刷新、注册确认合并、刷新和另一个浏览器登录恢复。

## 尚未完成及生产限制
- 长期记忆已隔离持久化并可导入导出，但自动提炼、相关性检索与每次 AI Prompt 注入尚未接入；不要宣传已经具备完整个性化记忆。
- 本地缓存不是离线主存储，不自动重放离线修改队列；网络失败继续保留原有阻断/重连策略。未完成草稿暂不持久化。
- 会话和业务状态在服务器持久化；规划对话仍为会话内存，重启后丢失，不等于长期记忆。
- 登录限流为单进程/IP，访客数有上限；公网发布前需代理级限流、容量与安全复核。无密码找回/邮箱验证。
- 账号删除暂不开放；未来必须事务删除用户根数据并按备份保留策略处理备份。
- 默认本机部署；本轮未配置域名、TLS、远程 MySQL 或公网发布。

密码哈希参数参考 Node 原生 Crypto Argon2 文档：https://nodejs.org/download/release/v26.9.0/docs/api/crypto.html
