# 身份与持久化实施审计

1. 当前架构：原生浏览器 JavaScript + Node HTTP/mysql2；FastAPI 仅承担 AI 和语音，无 ORM。
2. 当前存储：dashboard_state 单行完整 JSON；snapshot/request 表无用户维度。
3. 单用户假设：全局 CSRF、规划器会话、助手会话、无认证 state/backup；浏览器只有内存适配。
4. 新表：users、user_sessions、user_states、user_snapshots、user_requests、user_activity、auth_migrations。所有业务对象在 user_states 文档内，由 NOT NULL user_id 根边界隔离；不拆散旧实体关系。
5. 认证：Node Argon2id（Node >=24.7）、随机 HttpOnly SameSite Cookie、数据库存会话摘要、会话级 CSRF、输入校验和限流。生产固定 HTTPS origin，Secure Cookie。
6. Guest：独立 IndexedDB 保存状态，前端请求适配；匿名 AI 仅无持久化解析，不允许访问账户数据。
7. 老数据：保留旧表作回滚源，事务拷贝完整状态到锁定 legacy_owner；通过本地管理员脚本设置密码，禁止公网上领取。迁移前导出独立备份文件。
8. 缓存：用户 ID 分区 IndexedDB，仅已确认服务器快照；离线编辑暂不自动重放，避免覆盖跨设备更新。
9. 导出：沿用版本化业务信封，增加安全账户资料；导入先预览，默认按数组 ID merge，冲突保留服务端，不导入身份、凭据。
10. 风险：反向代理必须同域 HTTPS；AI 服务不能公开绕过主站；限流单进程，横向扩容需共享限流。生产旧单用户入口必须关闭。
11. 顺序：审计 → 备份/迁移与回滚 → 认证与隔离 → 前端账户 → Guest/缓存 → 数据控制 → 隔离集成测试。
