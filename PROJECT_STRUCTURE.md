# 项目结构说明

> 依据仓库当前真实目录整理（`main` 分支）。所有路径相对仓库根目录。

## 总览

```
life-dashboard-agent/
├── public/              前端页面（原生 HTML/CSS/JS，无构建步骤）
├── server/              Node.js 主站：HTTP + 账户 + MySQL + AI 网关
├── ai-backend/          Python FastAPI：语音转写 + 模型规划
├── docs/                架构、部署、验收、路演材料
├── scripts/             建库 / 迁移 / 联调 / 前端检查
├── tests/               Node 测试
├── benchmarks/          模型延迟与质量基准
├── original-site/       旧站静态资源（历史保留，不参与运行）
├── .local/              本机私有文件（Git 忽略，不进仓库）
├── package.json         主站依赖与脚本
├── start-local.cmd      Windows 一键启动脚本（可选）
└── .env.example         主站环境变量模板
```

## 前端 `public/`

纯静态资源，由 Node 主站直接读取，不需要 `npm run build`。

| 文件 | 作用 |
| --- | --- |
| `index.html` | 唯一入口，先加载 `bootstrap.js` |
| `bootstrap.js` | 拉 `/api/state`，按顺序动态加载其余脚本 |
| `app.js` | 主渲染与页面框架 |
| `auth-screen.js` / `account-entry.js` | 登录、注册、访客入口 |
| `product-*.js` | 今日、任务、项目、记录等产品页面 |
| `life-core.js` | AI 交互状态、确认/撤销、快照面板 |
| `life-conversation.js` | 对话流 + 当前方案卡（单卡原地更新） |
| `agent-interaction.js` | 方案卡渲染、澄清选择、统一状态机 |
| `agent-ui.js` | 记忆管理、未来模拟 |
| `life-planner.js` / `life-home.js` / `life-plans.js` | 规划首页与计划页 |
| `markdown.js` / `ui-polish.js` | Markdown 渲染、面板与视觉细节 |
| `style.css` / `product.css` / `life-conversation.css` / `agent-interaction.css` | 样式，含 390px 移动端适配 |

## 主站 `server/`

| 文件 | 作用 |
| --- | --- |
| `index.mjs` | HTTP 入口：路由、静态文件、请求分发 |
| `accounts.mjs` | 账户、注册登录、session、数据库迁移 |
| `account-gateway.mjs` | 登录后为每个用户装配 AI 引擎 |
| `store.mjs` | `dashboard_state` / `dashboard_snapshots` 读写与 revision 冲突控制 |
| `schema.mjs` | 业务数据校验与空数据结构 |
| `life-proposals.mjs` | 提案生成、确认、撤销、快照缓存 |
| `planner.mjs` | 上下文构建、FAST/PLANNER 分层、澄清策略 |
| `agent-engine.mjs` | Agent 问答与记忆抽取编排 |
| `agent-memory.mjs` / `agent-observer.mjs` | 长期记忆、行为观察 |
| `ai-backend-client.mjs` | 调用 Python AI 服务的客户端与超时/错误映射 |
| `assistant*.mjs` | 早期助手能力（提醒、记录），仍被部分页面复用 |
| `guest-demo.mjs` | 访客演示数据（内存态，不写库） |

## AI 后端 `ai-backend/`

| 路径 | 作用 |
| --- | --- |
| `app.py` | FastAPI 应用入口 |
| `api/routes.py` | 通用健康检查、文本解析、语音转写 |
| `api/life_proposal_routes.py` | `/api/life/propose`：分层规划与失败降级 |
| `api/agent_routes.py` | `/api/agent/answer`、`/api/agent/memory`、`/api/agent/capture` |
| `services/llm/router.py` | 模型路由：FAST/PLANNER 分层 + 有序降级链 + 熔断 |
| `services/health.py` | 滑动窗口健康统计与冷却 |
| `services/llm/autodl_llm.py` | AutoDL OpenAI-compatible 调用 |
| `services/llm/openai_llm.py` / `local_qwen.py` / `mock.py` | 其他 LLM Provider |
| `services/asr/` | `gemini_asr.py` / `openai_asr.py` / `funasr.py` / `mock.py` |
| `services/capture_service.py` | 文本 → 结构化 capture 的服务层 |
| `schemas/` | Pydantic 数据结构与 JSON Schema |
| `core/config.py` | 全部环境变量与 Provider 校验 |
| `prompts/` | 提示词模板 |
| `tests/` | pytest 单元/接口测试 |
| `tools/` | 手动联调真实模型的小脚本（非自动化测试） |

## 文档与脚本

| 路径 | 内容 |
| --- | --- |
| `docs/ARCHITECTURE.md` | 系统架构 |
| `docs/SERVER_DEPLOYMENT.md` | 服务器部署与排障 |
| `docs/AGENT_INTERACTION_REPORT.md` | 交互验收 |
| `docs/知行-Life-Agent-路演说明.md` | 路演稿（面向非技术听众） |
| `docs/PRESENTATION_GUIDE.md` | 本次新增：PPT/演示提纲 |
| `scripts/migrate-*.mjs` | 账户、记忆、Life 核心表迁移 |
| `scripts/local-mysql.mjs` | Windows 本地独立 MySQL（可选） |
| `scripts/check-frontend.mjs` | 语法检查与静态构建归档 |
| `benchmarks/fast-model/` | 模型对比数据（含 2026-10-30 结果） |

## 一次请求怎么走

```
浏览器
  └─ POST /api/planner/turn           (Node 主站, 127.0.0.1:3000)
       └─ POST /api/life/propose      (Python AI, 127.0.0.1:6016)
            └─ LifeModelRouter: FAST = DeepSeek → Luna → GLM
  └─ 返回 proposal（不写库）
用户点「确认安排」
  └─ POST /api/life/confirm           (Node 主站)
       └─ MySQL 写入 + changeBatchId（可整批撤销）
```

模型调用与数据写入是分离的：**AI 只产出提案，确认后才落库**。
