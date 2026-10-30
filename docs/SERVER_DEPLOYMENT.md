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

新库由管理员参考 docs/mysql-setup.sql 创建，替换示例密码。已有服务器数据库先备份，再更新代码，不能 DROP/重建业务库。全新服务器不会自动包含本机 legacy_owner 和私人数据。

权限分两类，实测缺一不可：

- 初始化必需（首次启动建表）：`CREATE`。核心表（users / user_states / user_sessions / user_snapshots / user_requests / user_activity / auth_migrations / dashboard_state / dashboard_snapshots / dashboard_requests）由 Node 首次启动自动 `CREATE TABLE IF NOT EXISTS`。
- 长期保留：`SELECT, INSERT, UPDATE, DELETE`，以及 `ALTER, INDEX, REFERENCES`。`user_sessions` 等表带外键，只给前四项会在建表时报 `ER_TABLEACCESS_DENIED_ERROR`，`life-web` 直接启动失败；兼容性加列需要 `ALTER`。不授予 `DROP / GRANT OPTION / FILE / SUPER`。

另有 3 张表 Node 启动时**不会**自动创建，必须用管理员账号先建好，否则长期记忆、记忆观察器、AI 快照缓存会 503（`life-web` 日志出现 `agent_observer ok:false`）：`agent_memory`、`agent_observations`、`ai_snapshot_cache`，建表语句见 docs/mysql-setup.sql。初始化完成后可用 `SHOW TABLES` 对照，正常应为 13 张表。

创建 /opt/life/.env（权限 600，属于 life），以下所有 CHANGE_ME 都须替换：

```dotenv
NODE_ENV=production
PORT=3000
# 生产必需：必须与公网访问使用的协议+域名完全一致，否则启动即失败/请求被 403
PUBLIC_ORIGIN=https://life.example.com
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=life_dashboard
MYSQL_PASSWORD=CHANGE_ME
MYSQL_DATABASE=life_dashboard
AI_BACKEND_BASE_URL=http://127.0.0.1:6016
AI_BACKEND_TIMEOUT_S=90
```

NODE_ENV=production 开启 Secure session cookie，因此公网必须 HTTPS。Node 源码固定监听 loopback；Nginx 与服务放在同一主机即可，不需要把 Node 改成公网监听。当前提案/Undo 等部分上下文在进程内，先用单个 Node 实例，禁止未经验证的多实例轮询。

`PUBLIC_ORIGIN` 不是可选装饰：`server/account-gateway.mjs` 在 `NODE_ENV=production` 下要求它存在且以 `https://` 开头，否则进程直接抛 `Production requires HTTPS PUBLIC_ORIGIN` 退出；它同时用于 `server/index.mjs` 的 Host 白名单和所有 `/api/*` 的 Origin 校验。用 IP 访问、自签证书或改域名后忘记同步它，都会表现为“服务 active 但页面 403 / 登录不成功”。更换域名时必须同时改 `PUBLIC_ORIGIN` 和 Nginx `server_name`，再 `systemctl restart life-web`。

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

单一 AutoDL Key 可同时用于 `AUTODL_LLM_BASE_URL`（Bearer）和 `GEMINI_BASE_URL`（`x-goog-api-key`）两个上游；2026-10-30 实测 `/api/v1/models` 返回 200 且列表中含 `gpt-5.6-luna`，Gemini 侧 `generateContent` 也返回 200。配置 Key 后只需 `systemctl restart life-ai`，Node 不必重启。

### 已知限制（2026-10-30 真实环境实测）

- 延迟抖动大：同一句规划请求实测 6.8s / 8.4s / 10.6s / 31s / 35s / 42s / 54s，也出现过 **>90s**。`AI_BACKEND_TIMEOUT_S=90` 到点返回 504，前端 `public/agent-interaction.js` 里的 `AbortSignal.timeout(90000)` 也会直接显示 `signal timed out`。要根治需要同时上调 Node 超时与该前端常量（属代码改动），或换更快模型；仅调 Nginx 180s 无效。
- 计划预览不逐条列出：前端 preview 读取 `plan.stages`，而 `/api/planner/turn` 目前返回 `operations + summary`（`plan` 为 null），所以卡片只有摘要与可调整建议，没有逐条任务清单；确认仍严格按 `operations` 执行。
- 撤销是“进程内批次”：`changeBatchId` 只保存在当前页面会话，刷新后撤销按钮消失（符合单实例设计）。`/api/life/undo` 接口本身在未刷新时可正常回滚。
- 追问可能多轮：信息不足时会连续追问（实测 1~3 轮），每轮都是真实模型调用；提交追问答案时必须带上上一轮的 `proposalId`，否则会重新开始而反复追问。

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

公网 443 不通时按顺序分层排查，不要只凭超时下结论：

1. 监听：`ss -lntp | grep :443` 应显示 nginx 监听，`curl -k https://127.0.0.1/ -H 'Host: <域名>'` 应返回 200（证明 Nginx 与证书本身正常）。
2. 主机防火墙：`ufw status`、`iptables -S`（云厂商常注入类似 `YJ-FIREWALL-INPUT` 的链，注意其中是否有非 22 端口的 REJECT）。
3. 云平台安全组 / 云防火墙：`80` 可通而 `443` 超时是最典型的“安全组未放通 443”特征。
4. 外部实测：用第三方节点（例如 check-host.net 的 TCP 检查）从境外/多地域连接，避免只在本机回环验证。
5. 抓包定位：在检查期间 `tcpdump -ni eth0 'tcp dst port 443 and tcp[tcpflags] & tcp-syn != 0'`，若外部 SYN 完全没有到达主机，说明阻塞在上游（安全组/云防火墙），而不是 Nginx 或主机 iptables。

证书签发用服务器已有方式（如 certbot）：`certbot --nginx -d <域名>`，随后 `nginx -t && systemctl reload nginx`（不要直接 restart 中断旧站）。签发完成后必须从公网真实访问验证，本机自签证书通过不代表公网 HTTPS 可用。

## 备份、保留与清理（2026-10-30 起服务器已配置）

服务器上已有可复用的实现，路径与周期如下，脚本均为 root 700，产物 600，日志不含密钥：

- 每日 03:30 `life-backup.service`（`/usr/local/sbin/life-backup.sh`）：`mysqldump --single-transaction --routines --triggers` + gzip + sha256，输出到 `/var/backups/life-dashboard/`。保留最近 14 天每日备份，每月 1 日的备份额外保留 180 天，日志 `/var/log/life-backup.log`。
- 每周日 04:30 `life-restore-check.service`（`/usr/local/sbin/life-restore-check.sh`）：校验 sha256，把最新备份恢复到独立临时库 `life_restore_check`，比对表数与用户数后删除临时库，**从不触碰生产库**。这是“备份可用”的唯一证据，新增功能后应重跑。
- 每日 04:00 `life-audio-cleanup.service`（`/usr/local/sbin/life-audio-cleanup.sh 7`）：上传音频只用于转写、不参与业务查询，保留 7 天排障后删除；日志 `/var/log/life-ai-cleanup.log`。
- 异机副本：服务器上**尚未配置**。放一个可执行脚本 `/etc/life/backup-offsite.sh`（参数为备份文件绝对路径，可用 rclone/BOS/rsync 上传）后，每日备份会自动调用；未配置时日志会明确记录“未配置异机副本”。仅本地备份无法抵御整机丢失，上线前必须补齐。
- 恢复演练与真实恢复的区别：演练只做“备份能还原出完整结构+行数”，真正的灾难恢复要先停止 `life-web/ai`，确认不会用旧备份覆盖期间新写入的数据，再导入生产库并重启。
- 旧站数据库 `django_lms` 的备份不在这套定时任务内，需要在改动旧站前单独 `mysqldump` 留档。

## 数据迁移、验收和回滚

- 只部署代码不会搬运本机数据库、密码或 legacy_owner。单用户内容可用账户导出/导入；需要保留全部账户/密码哈希/session/记忆时，对完整数据库做受保护备份并恢复到专用新库，不能只迁移 dashboard_state。不要上传 .local/mysql-data，不要在聊天或 Git 中传备份。
- 现有 legacy-owner.mjs 等迁移脚本保留，只在确有旧数据认领需求时按其说明本地交互使用，不在空库盲跑。升级前记录原 commit 并做可恢复数据库备份。
- 验收必须区分两级结论，不能混为一谈：
  - “服务启动成功”：systemd active、`/health` 200、`/api/ai/health` 可达、首页 200。这只证明进程和端口通。
  - “产品验收成功”：游客进入/刷新；正式邮箱注册自动登录/刷新；退出重登；创建项目任务并刷新；游客新增内容合并（系统 Demo 不并入）；真实 AI 追问→计划→确认→Undo；原文编辑重试；真实语音（HTTPS 麦克风或真实音频文件）转写并自动规划；手机无溢出；不同账户数据隔离（A 写真实项目/任务/记忆后，B 的列表、详情、导出、记忆搜索均读不到）。未实测的项必须标注“未验证”，不能用 mock 或 `/health` 代替。
- `/health` 成功、上游 `GET /api/v1/models` 返回 401 都只证明“网络可达 + 服务在跑”，**不能**证明模型名可用、流式与 strict json_schema 可用。真实 AI 验收必须发起一次带真实密钥的生成请求，并检查返回结构与页面表现。
- curl http://127.0.0.1:6016/health 和 http://127.0.0.1:3000/api/ai/health 检查连通；公开 HTTPS 上检查注册、session Cookie Secure 和真实模型请求。AI 故障不能影响手动 CRUD。
- 更新用 git fetch origin + git pull --ff-only origin main，检查本地改动，安装依赖/构建后重启两个服务。不要 force、reset 清理未知修改。回滚时先停止服务、评估数据库兼容性，并且**默认保留服务器本地改动与配置**：先 `git status`、`git stash push -u -m pre-rollback`（或复制受影响的配置文件），再切换到目标 commit 的普通 `git checkout <commit>` / `git revert`；只有确认工作区没有未知改动且不需要保留时，才考虑 `reset --hard`，且绝不能回滚数据库覆盖部署期间的新写入。
- 本机测试需要 .local/mysql-local.json 独立测试库，生产不要为了跑 npm test 去初始化/重建正式 MySQL。CI/开发环境完成这些测试，生产做上述受控验收。

交接时请服务器 AI 回报：实际 commit、域名、两个服务状态、MySQL 连接、HTTPS/session、AI/ASR 实测结果、备份位置与回滚办法。尚缺域名/IP/SSH 与真实密钥，不能声称已完成服务器部署。
