# 团队协作上手指南（5～10 分钟）

> 面向：PPT、项目文档、演示、测试，以及需要做少量代码修改的同学。
> 更细的部署与排障见 `docs/SERVER_DEPLOYMENT.md` 和 `HANDOVER_REPORT.md`。

## 1. 项目是什么

Life Dashboard（知行 Life Agent）是一个个人生活助理 Web 应用：用户用一句话（打字或语音）说出想法，AI 追问关键信息、给出可调整的安排，用户点「确认安排」后才会真正写入任务/项目。

技术上是两个服务：

- **主站**：Node.js + MySQL，负责页面、账户、数据持久化和 API 网关。
- **AI 后端**：Python FastAPI，负责语音转写（ASR）和模型规划（LLM），通过 `127.0.0.1:6016` 供主站调用。

## 2. 先看线上版本（不需要装任何环境）

- 地址：**https://122.51.80.161**
- 当前是 IP + 自签名证书，浏览器会提示「不安全」，点「高级 → 继续访问」即可。
- 自己注册一个账号使用；线上是共享环境，请不要删除别人的数据。
- 默认访客入口会带一份演示数据，适合直接截图。

### 服务器（了解即可，不需要每个人登录）

- 公网 IP：`122.51.80.161`
- SSH：端口 `22`，用户名 `ubuntu`
- 项目目录：`/opt/life`；AI 后端：`/opt/life/ai-backend`
- 运行方式：`life-web.service`（Node，127.0.0.1:3000）、`life-ai.service`（Python，127.0.0.1:6016）、MySQL 8（127.0.0.1:3306）、Nginx（80/443）
- 数据库：MySQL，库名 `life_dashboard`
- 已授权的 SSH 公钥（**公钥可以公开，但不能用于登录**；私钥由负责人私密提供）：

```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDAS4eDZIgOKesy1qFLku7Rqn6yxmcBwKaHoQWDsr6lItwoORfdaWfAXjFb6uYvL6lyfsNGi55Vg9pQgV62be91Gq4qPEVIZRLmaCURBARO9XzSX4O5MutvzMVQ9/pcd9rp6eQDB+ccB862CBG9ofp5C0mCrUOoZr2DN3iaOV8oBZHIY1NaMG8xOoGuc46SqvYWBcna1vhC6bD9Im4lrwUmZZ9NM9Gj3R5fjTg2FrN0tkjoWftbApGngl6gOaJuWt7qfmheIuTm9EvWWjS4KTykdy/0yTL94lZ4LyO7DgvbI/XugIez6FFbTUFLJTXRrhX+oMKIS8EhiVeOgLltYDXZ skey-9xqp473p
```

> 服务器只用于部署、查看日志和验证最终版本。**不要在服务器上长期开发或直接改生产代码。**

## 3. 拿到代码

仓库（**Public**，可直接 clone）：

```bash
git clone https://github.com/tangx2872-svg/life-dashboard-agent.git
cd life-dashboard-agent
```

- `main` 是唯一长期分支，当前最新提交以 `git log -1` 为准。
- 因为是 Public 仓库，**任何提交都会立刻对所有人可见**，绝对不要把 `.env`、Key、密码提交上来。
- 想 push 需要仓库所有者把你加为 Collaborator。

## 4. 目录速览

| 目录 | 作用 |
| --- | --- |
| `public/` | 前端页面（原生 HTML/CSS/JS，无打包步骤） |
| `server/` | Node 主站：HTTP、账户、数据、AI 网关 |
| `ai-backend/` | Python AI 服务：ASR、LLM、模型路由 |
| `docs/` | 架构、部署、历史报告、路演材料 |
| `scripts/` | 建库、迁移、联调、前端检查 |
| `tests/` | Node 测试 |
| `ai-backend/tests/` | Python 测试（pytest） |
| `benchmarks/` | 快速模型延迟/质量基准结果 |

完整说明见 `PROJECT_STRUCTURE.md`。

## 5. 本地启动

### 5.1 只做 PPT / 文档

不用启动项目，直接用线上版本截图即可，见 `docs/PRESENTATION_GUIDE.md`。

### 5.2 主站（Node + MySQL）

前置：Node.js >= 24.7（`package.json` 要求）、MySQL 8.0。

```bash
# 1) 准备数据库（已有 MySQL 可跳过）
docker run -d --name life-mysql -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=change_me \
  -e MYSQL_DATABASE=life_dashboard \
  -e MYSQL_USER=life_dashboard \
  -e MYSQL_PASSWORD=change_me \
  mysql:8.0

# 2) 配置环境变量
cp .env.example .env
#    把 MYSQL_PASSWORD 改成你自己的密码

# 3) 安装并启动
npm install
npm start
```

打开 **http://127.0.0.1:3000**。首次启动会自动建表（`CREATE TABLE IF NOT EXISTS`），不需要手动导入 SQL。

### 5.3 AI 后端（Python）

```bash
cd ai-backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
#    填 AUTODL_LLM_API_KEY（规划模型）与 GEMINI_API_KEY（语音转写）

uvicorn app:app --host 127.0.0.1 --port 6016
```

主站 `.env` 里的 `AI_BACKEND_BASE_URL` 默认就是 `http://127.0.0.1:6016`，两个服务都起来即可。

### 5.4 没有 API Key 怎么办

`ai-backend/.env` 里设置 `LLM_PROVIDER=mock`、`ASR_PROVIDER=mock` 可以跑通「录音/文本 → 结构化结果」的链路，用于调前端 UI；**真实 AI 规划需要 Key**。只想演示效果，请直接用线上版本。

## 6. 环境变量（两个 `.env`）

| 文件 | 内容 | 是否提交 |
| --- | --- | --- |
| `.env`（根目录） | 端口、MySQL、AI 服务地址 | 否，只提交 `.env.example` |
| `ai-backend/.env` | LLM/ASR 的 Key、模型名、路由参数 | 否，只提交 `.env.example` |

两个文件都可以 `cp .env.example .env` 起步，把占位符替换成真实值。

## 7. 需要负责人提供的配置

以下 4 项需要找负责人**私聊**获取，不要在群里发、不要提交 Git：

- AutoDL LLM API Key（规划模型）
- Gemini API Key（语音转写）
- MySQL 账号密码（生产 / 本地各一套）
- 服务器 SSH 私钥或密码（公钥已在上面，不能用于登录）

填写位置：根目录 `.env` 与 `ai-backend/.env`。完整清单见 `TEAM_SECRETS_TEMPLATE.md`。

## 8. Git 协作流程

不要多人直接 SSH 到生产服务器改代码。

```bash
git pull origin main
git checkout -b docs/ppt          # 或 feature/xxx、fix/xxx、test/xxx
# 修改
git add .
git commit -m "docs: update presentation materials"
git push origin docs/ppt
# 然后在 GitHub 发起 Pull Request，合并到 main
```

小团队可以省掉 PR，但仍建议：**一个功能一个分支，合并前先 `git pull origin main`**。

## 9. PPT / 文档同学主要看哪里

- 产品与路演稿：`docs/知行-Life-Agent-路演说明.md`
- 架构：`docs/ARCHITECTURE.md`
- 交互与验收：`docs/AGENT_INTERACTION_REPORT.md`
- 语音链路：`docs/VOICE-TRANSCRIPTION.md`
- 模型选型与延迟数据：`benchmarks/fast-model/results/`
- 本次交接的讲解提纲：`docs/PRESENTATION_GUIDE.md`

## 10. 出问题先检查什么

1. 页面打不开：`systemctl status life-web`（线上）或 `npm start` 是否报 MySQL 连接错误。
2. 页面能开但 AI 不响应：`curl http://127.0.0.1:6016/health`，再看 `ai-backend/.env` 的 Key 是否过期。
3. 数据库连不上：确认 MySQL 在跑、`.env` 的库名/账号/密码一致。
4. 刚改完代码没生效：静态文件是 `no-store`，硬刷新即可；Node 代码改动需要重启进程。
5. 测试报 `mysql-local.json`：`tests/` 需要独立的本地测试库，见 `HANDOVER_REPORT.md` 的已知问题。
