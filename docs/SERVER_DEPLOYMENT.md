# Life 服务器部署交接（2026-10-30）

本文件是当前部署入口。README、ai-backend/README 和旧交接文档包含历史阶段信息；涉及无账号、浏览器 SpeechRecognition、ASR mock、单独 AI 仓库的描述不代表当前版本。不要为部署重构业务或初始化覆盖现有数据。

## 代码与地址

- 唯一部署仓库：https://github.com/tangx2872-svg/life-dashboard-agent ，分支 main（私有，服务器须有只读 GitHub 权限）。
- AI 源码已经在本仓库 ai-backend/，不要另外拉取旧 AI 仓库。
- 公网入口：`https://<你的域名>/#/today`。域名和服务器 IP 尚未提供，不能把这个占位地址当成已部署网址。
- Node：127.0.0.1:3000，负责网页、账户、session、MySQL 和 AI 代理。
- Python/FastAPI：127.0.0.1:6016；健康检查 /health，内部文档 /docs。
- MySQL：生产建议 127.0.0.1:3306；本机 Windows 独立实例是 33316，不能照搬数据目录到 Linux。
- Node AI 检查：/api/ai/health；登录状态：/api/auth/me。
- 现有 LLM 上游：https://www.autodl.art/api/v1 ，现有语音上游：https://www.autodl.art/api/v1/gemini 。这是第三方兼容服务。真实密钥不在 Git 中，需用户私下配置；模型可用性须在服务器实际验证。

## 运行环境与安装

以下以 Linux + systemd + Nginx、部署到 /opt/life、专用非 root 用户 life 为例。先确认现有站点/端口/服务，调整路径，不覆盖其他网站。Node 24.7+（本项目使用 node:crypto Argon2），Python 3.10+（本机验证 3.10）、MySQL 8、ffmpeg。无需 GPU、torch 或 funasr。

```bash
git clone --branch main https://github.com/tangx2872-svg/life-dashboard-agent.git /opt/life
cd /opt/life
npm install --omit=dev
node scripts/check-frontend.mjs --build
python3 -m venv ai-backend/.venv
ai-backend/.venv/bin/python -m pip install -r ai-backend/requirements.txt
```

依赖锁文件为 pnpm-lock.yaml；需要锁定 Node 依赖时使用与锁文件兼容的 pnpm install --frozen-lockfile --prod。npm 路径不提供同等锁文件保证。确保 life 用户可读取代码、配置，Python 运行目录可写。不要用 Windows start-local.cmd / local-mysql.mjs 在 Linux 初始化数据库。

## 数据库与业务配置

新库由管理员参考 docs/mysql-setup.sql 创建，替换示例密码。应用账号需要该库 SELECT/INSERT/UPDATE/DELETE/CREATE 权限；表在启动时自动创建，现有数据保持。已有服务器数据库先备份，再更新代码，不能 DROP/重建业务库。全新服务器不会自动包含本机 legacy_owner 和私人数据。

创建 /opt/life/.env（权限 600，属于 life），以下所有 CHANGE_ME 都须替换：

```dotenv
NODE_ENV=production
PORT=3000
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=life_dashboard
MYSQL_PASSWORD=CHANGE_ME
MYSQL_DATABASE=life_dashboard
AI_BACKEND_BASE_URL=http://127.0.0.1:6016
AI_BACKEND_TIMEOUT_S=90
```

NODE_ENV=production 开启 Secure session cookie，因此公网必须 HTTPS。Node 源码固定监听 loopback；Nginx 与服务放在同一主机即可，不需要把 Node 改成公网监听。当前提案/Undo 等部分上下文在进程内，先用单个 Node 实例，禁止未经验证的多实例轮询。

## AI 配置

创建 /opt/life/ai-backend/.env，权限同上。当前已验证组合为 Gemini ASR + AutoDL-compatible LLM：

```dotenv
APP_ENV=production
DEBUG=false
LOG_LEVEL=INFO
HOST=127.0.0.1
PORT=6016
ASR_PROVIDER=gemini
LLM_PROVIDER=autodl
AUTODL_LLM_API_KEY=CHANGE_ME
AUTODL_LLM_BASE_URL=https://www.autodl.art/api/v1
AUTODL_LLM_MODEL=gpt-5.6-luna
AUTODL_LLM_TIMEOUT_S=120
AUTODL_LLM_MAX_RETRIES=2
AUTODL_LLM_STRUCTURED=auto
GEMINI_API_KEY=CHANGE_ME
GEMINI_BASE_URL=https://www.autodl.art/api/v1/gemini
GEMINI_MODEL=gemini-3.5-flash
DEFAULT_TIMEZONE=Asia/Shanghai
DEFAULT_LOCALE=zh-CN
MODEL_DIR=/var/lib/life-ai/models
UPLOAD_DIR=/var/lib/life-ai/uploads
FFMPEG_BIN=ffmpeg
UPLOAD_MAX_MB=20
LIFE_REASONING_EFFORT=low
```

将 /var/lib/life-ai 及子目录创建并授予 life 用户写权限。用真实 API 请求验证模型名称、网络出口及 Responses 流式 + strict json_schema 支持，/health 成功不代表模型调用成功。不要把 mock 当作生产语音服务。若需改用其它模型配置，参考 docs/LIFE_AI_ENV.example 和 ai-backend/.env.example；不要只改首页文案冒充配置成功。

## systemd 示例

/etc/systemd/system/life-ai.service（先用实际路径确认 python 存在）：

```ini
[Unit]
Description=Life AI service
After=network-online.target
Wants=network-online.target

[Service]
User=life
Group=life
WorkingDirectory=/opt/life/ai-backend
ExecStart=/opt/life/ai-backend/.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 6016
Restart=on-failure
RestartSec=5
UMask=0077

[Install]
WantedBy=multi-user.target
```

/etc/systemd/system/life-web.service（示例 Node 路径 /usr/bin/node，先用 command -v node 确认并替换）：

```ini
[Unit]
Description=Life web service
After=network-online.target life-ai.service
Wants=network-online.target life-ai.service

[Service]
User=life
Group=life
WorkingDirectory=/opt/life
ExecStart=/usr/bin/node --env-file=/opt/life/.env /opt/life/server/index.mjs
Restart=on-failure
RestartSec=5
UMask=0077

[Install]
WantedBy=multi-user.target
```

Python 自动读取 ai-backend/.env。MySQL 须单独启动并设置开机运行（服务名按机器实际确认）。随后 systemctl daemon-reload，systemctl enable --now life-ai life-web；检查 systemctl status 和 journalctl -u life-ai -u life-web，日志不要公开密钥/私人对话。

## Nginx / HTTPS

使用服务器现有证书管理方式配置域名和有效证书。以下内容放在该域名的 HTTPS server 块内，HTTP 入口跳转 HTTPS；这不是完整可直接覆盖服务器的 Nginx 主配置：

```nginx
client_max_body_size 21m;
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 180s;
    proxy_send_timeout 180s;
    proxy_buffering off;
}
```

所有 /api/ 仍转发给 Node，不能把它直接转给 Python。无需静态 alias 指向构建目录，Node 自带 public/ 服务。hash 路由 /#/today 不需要独立服务端路径。不要公开 Python 的 /docs 或其未经账户网关保护的接口，不要公开 MySQL/3000/6016 端口；公网仅开放所需 HTTPS/HTTP 和管理入口。麦克风需要 HTTPS。

## 数据迁移、验收和回滚

- 只部署代码不会搬运本机数据库、密码或 legacy_owner。单用户内容可用账户导出/导入；需要保留全部账户/密码哈希/session/记忆时，对完整数据库做受保护备份并恢复到专用新库，不能只迁移 dashboard_state。不要上传 .local/mysql-data，不要在聊天或 Git 中传备份。
- 现有 legacy-owner.mjs 等迁移脚本保留，只在确有旧数据认领需求时按其说明本地交互使用，不在空库盲跑。升级前记录原 commit 并做可恢复数据库备份。
- 验收：游客进入/刷新；正式邮箱注册自动登录/刷新；退出重登；创建项目任务并刷新；游客新增内容合并（系统 Demo 不并入）；AI 追问选项→计划→确认→Undo；原文编辑重试；HTTPS 麦克风转写自动规划；手机无溢出；不同账户数据隔离。
- curl http://127.0.0.1:6016/health 和 http://127.0.0.1:3000/api/ai/health 检查连通；公开 HTTPS 上检查注册、session Cookie Secure 和真实模型请求。AI 故障不能影响手动 CRUD。
- 更新用 git fetch origin + git pull --ff-only origin main，检查本地改动，安装依赖/构建后重启两个服务。不要 force、reset 清理未知修改。回滚到已记录的版本时先停止服务并评估数据库兼容性，不能自动回滚业务数据覆盖新写入。
- 本机测试需要 .local/mysql-local.json 独立测试库，生产不要为了跑 npm test 去初始化/重建正式 MySQL。CI/开发环境完成这些测试，生产做上述受控验收。

交接时请服务器 AI 回报：实际 commit、域名、两个服务状态、MySQL 连接、HTTPS/session、AI/ASR 实测结果、备份位置与回滚办法。尚缺域名/IP/SSH 与真实密钥，不能声称已完成服务器部署。
