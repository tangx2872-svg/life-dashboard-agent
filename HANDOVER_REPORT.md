# 项目交接报告

> 生成时间：2026-10-31。基线提交：`5d56212`（本文档的独立提交紧随其后）。
> 本文不包含任何真实密钥、密码或私钥。

## 当前项目状态

**已完成**

- 账户体系：注册/登录、session、CSRF、访客 Demo、账户数据隔离。
- 核心业务：今日、任务、项目、记录，MySQL 持久化，revision 冲突控制。
- AI 链路：语音转写 → 结构化解析 → 规划提案 → 确认写入 → 整批撤销。
- 规划体验：FAST/PLANNER 分层、澄清追问、单卡原地更新的方案展示。
- 长期记忆与快照（「Life 对你的理解」「未来一周」）。
- 模型路由：DeepSeek → Luna → GLM 有序降级 + 滑动窗口熔断 + 健康接口。
- 部署：Nginx + HTTPS + systemd 双服务，每日数据库备份与恢复演练定时器。
- 测试：Python 96 项通过；前端核心用例 10 项通过；语法/资产检查通过。

**未完成 / 已知限制**

- HTTPS 使用 **IP 自签名证书**，浏览器会提示不安全；尚无域名。
- 无 CI/CD：`git push` 后需要人工登录服务器 `pull + restart`。
- Node 全量测试有 15 项因缺少本地测试库夹具 `.local/mysql-local.json` 而失败（环境问题，非代码缺陷）。
- 仓库内没有预置产品截图与演示视频，需要现场生成。
- 单机部署（2 vCPU / 3.6G RAM），Node、Python、MySQL 同机，未做压测。
- 模型延迟存在上游抖动，p90 约 6.5s，极端情况 8～10s。

**建议继续做**

1. 申请域名 + Let's Encrypt，替换自签名证书。
2. 建立 Pull Request 流程与 `main` 分支保护。
3. 为测试提供独立 MySQL（Docker service 或 CI service container），恢复全量绿灯。
4. 增加只读数据库账号，降低误操作风险。
5. 录制 3 分钟演示视频，截图归档到 `docs/assets/`。

## Git

- Repo：`https://github.com/tangx2872-svg/life-dashboard-agent`（**Public**）
- Branch：`main`（唯一长期分支）
- Commit：基线 `5d56212`，交接文档随后独立提交
- 当前工作区：干净；与 `origin/main` 同步

> 因为是 Public 仓库，任何 push 都会立刻公开。提交前务必 `git status` 自查。

## 在线环境

- URL：`https://122.51.80.161`（自签名证书）
- API 前缀：`https://122.51.80.161/api/`
- AI 健康检查：`http://127.0.0.1:6016/health`（仅服务器本机）；主站转发为 `GET /api/ai/health`
- Server：`VM-0-16-ubuntu`，Ubuntu 22.04.5 LTS，2 vCPU / 3.6G RAM / 69G 磁盘，无 GPU
- SSH：`122.51.80.161:22`，用户名 `ubuntu`；服务器已授权公钥（见 `TEAM_ONBOARDING.md`，公钥不可用于登录），私钥或密码由负责人私密提供
- Deployment：Nginx（80→443 跳转，443 反代 `127.0.0.1:3000`）+ systemd
  - `life-web.service`：`node --env-file=/opt/life/.env server/index.mjs`
  - `life-ai.service`：`uvicorn app:app --host 127.0.0.1 --port 6016`
  - 备份：`life-backup.timer`（每日 03:34）、`life-restore-check.timer`

## 本地运行

**前端 + 主站**

```bash
cp .env.example .env      # 填 MySQL 连接
npm install
npm start                 # http://127.0.0.1:3000
```

**AI 后端**

```bash
cd ai-backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # 填 AUTODL_LLM_API_KEY / GEMINI_API_KEY
uvicorn app:app --host 127.0.0.1 --port 6016
```

数据库首次启动自动建表，无需手工导入。

## Secret

需要由负责人私密提供的类型（不含真实值）：

- AutoDL LLM API Key（规划模型）
- Gemini API Key（语音转写）
- MySQL 账号密码（生产 / 本地各自独立）
- 服务器 SSH 私钥或密码（公钥已记录在 `TEAM_ONBOARDING.md`，不能用于登录）
- GitHub Collaborator 邀请

模板见 `TEAM_SECRETS_TEMPLATE.md`。

## 数据库

- 类型：MySQL 8.0
- 数据库：`life_dashboard`
- 主要表：`users`、`user_sessions`、`user_states`、`user_snapshots`、`dashboard_state`、`dashboard_snapshots`、`dashboard_requests`、`agent_memory`、`agent_observations`、`user_activity`、`user_requests`、`ai_snapshot_cache`、`auth_migrations`
- 结构初始化：服务启动时 `CREATE TABLE IF NOT EXISTS`；增量迁移 `scripts/migrate-accounts.mjs`、`migrate-memory.mjs`、`migrate-life-core.mjs`
- 账号初始化：参考 `docs/mysql-setup.sql`（执行前替换示例密码）
- 备份：`/var/backups/life-dashboard/`，每日 03:34，保留 14 天 + 每月 180 天
- 本地：可用 Docker MySQL 8，或 `docs/mysql-setup.sql` 建账号；完全不想装数据库就用线上 Demo

## AI

- Provider：AutoDL OpenAI-compatible
- Endpoint：`https://www.autodl.art/api/v1`
- Model：
  - FAST 主：`DeepSeek-V4.1-Flash`；降级：`gpt-5.6-luna` → `GLM-5.3-Flash`
  - PLANNER 主：`gpt-5.6-luna`；降级：`DeepSeek-V4.1-Flash` → `GLM-5.3-Flash`
- ASR：Gemini `gemini-3.5-flash`
- API Key：**由负责人私密提供**

## 风险

1. **仓库是 Public**：一旦误提交 `.env`、Key、密码，会立刻公开。已确认当前 Git 历史中没有真实 `.env` 或密钥文件，但仍需每次提交前检查。
2. **自签名 HTTPS**：浏览器警告会降低演示可信度，且无法使用部分依赖受信证书的服务。
3. **多人直接改服务器**：容易造成线上与 Git 不一致，难以回滚。
4. **数据库误操作**：业务账号权限较高，误删数据只能依赖备份恢复。
5. **服务器与 Git 不同步**：本次交接时工作区干净，但后续若无规范，很容易漂移。
6. **单机资源有限**：Node + Python + MySQL 同机，模型调用并发高时可能互相影响。
7. **测试环境不完整**：Node 全量测试依赖本地测试库夹具，当前缺失。
8. **端口占用**：服务器 `:8000` 属于另一个无关项目，请勿停止或复用。

## 下一步推荐（按优先级）

1. 全员走 Git 分支 + PR，禁止直接 SSH 改生产。
2. 申请域名并配置 Let's Encrypt。
3. 配置只读数据库账号给文档/测试同学。
4. 补齐测试库夹具或接入 CI。
5. 录制演示视频、整理截图，供 PPT 直接使用。
6. 定期（每月）验证一次备份恢复。
