-- Option B: run with a MySQL administrator when using an EXISTING MySQL instance.
-- Replace the example password before executing. Do not put actual passwords in Git.
CREATE DATABASE IF NOT EXISTS life_dashboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'life_dashboard'@'127.0.0.1' IDENTIFIED BY 'REPLACE_WITH_A_STRONG_PASSWORD';

-- 权限说明（2026-10-30 实测）：
--   CREATE  : 业务表由 Node 首次启动时 CREATE TABLE IF NOT EXISTS 创建
--   REFERENCES / INDEX : user_sessions 等表含 FOREIGN KEY，缺少会报
--                        ER_TABLEACCESS_DENIED_ERROR 并导致 life-web 启动失败
--   ALTER   : 后续兼容性建表/加列需要
-- 不授予 DROP / GRANT OPTION / FILE / SUPER。
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON life_dashboard.* TO 'life_dashboard'@'127.0.0.1';

-- 核心业务表由 Node.js 服务首次启动时自动创建（users / user_states / user_sessions /
-- user_snapshots / user_requests / user_activity / auth_migrations / dashboard_state /
-- dashboard_snapshots / dashboard_requests）。
-- 以下 3 张表 Node 启动时不会创建，必须由管理员按下列语句建好，否则长期记忆、
-- 记忆观察器和 AI 快照缓存会返回 503（日志表现为 agent_observer ok:false）。
CREATE TABLE IF NOT EXISTS agent_memory(user_id CHAR(36) PRIMARY KEY,body LONGTEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS agent_observations(user_id CHAR(36) PRIMARY KEY,body LONGTEXT NOT NULL,revision INT NOT NULL,updated_at VARCHAR(32) NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ai_snapshot_cache(user_id CHAR(36) NOT NULL,kind VARCHAR(32) NOT NULL,body LONGTEXT NOT NULL,PRIMARY KEY(user_id,kind),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
