# Life Dashboard 开发交接（文字版）

交接日期：2026-10-29（北京时间）。功能基线提交：b382bb5。本文不含真实密钥；同机私有配置清单见 `.local/HANDOFF-PRIVATE.md`。请先读本文件再开发。

## 1. 项目目标和当前形态

这是个人长期事项控制台，帮助用户从一个想法出发，组织事项、阶段、任务和日程，记录完成与学习过程。目标是逐步形成 Agent：理解用户意图、必要时追问、提出计划、预览变更、用户确认后执行。

已经完成的是本地控制台、数据库保存、自然语言新增内容、录音转写、编辑预览与确认落库。不要把现状描述为已经具备完整自主规划、自然语言任意修改删除或后台主动执行的 Agent。

前端是原生 HTML/CSS/JavaScript，不是 Vue；主后端是 Node.js 原生 HTTP，不是 Spring Boot；AI 服务是 Python/FastAPI；数据库为 MySQL。保留现有架构继续做功能，不要为换技术栈重做系统。

## 2. 本地目录与仓库

本地完整项目：
`C:/Users/Lenovo/Documents/Codex/2026-09-23/sites-plugin-sites-openai-curated-remote/outputs/life-dashboard-standalone`

主仓库：https://github.com/tangx2872-svg/life-dashboard-agent

AI 原始仓库：https://github.com/tangx2872-svg/life-dashboard-ai-backend

AI 原始 c19d4c57906abc29b148f804fffc6c1a0baeda94 已通过 git subtree 合入主仓库 `ai-backend/`。之后的 Gemini 转写等改动在主仓库中，不能只拉原始 AI 仓库就认为代码齐全。下一位优先以主仓库 main 为准。

## 3. 地址清单

- 网页及 Node 业务接口：http://127.0.0.1:3000
- 本机 FastAPI AI 服务：http://127.0.0.1:6016
- AI 健康检查：http://127.0.0.1:6016/health
- 主站代理健康检查：http://127.0.0.1:3000/api/ai/health
- FastAPI 接口文档：http://127.0.0.1:6016/docs
- 本项目独立 MySQL：127.0.0.1:33316，具体库名/用户在根目录 `.env`。
- GPT 上游兼容接口：https://www.autodl.art/api/v1
- Gemini 上游原生接口：https://www.autodl.art/api/v1/gemini
- AutoDL 模型平台：https://www.autodl.art/

127.0.0.1 仅指运行这套服务的电脑，不是公网部署地址，其他电脑或手机不能直接用它访问。本轮没有部署公网服务，也没有记录可交接的远端 SSH 主机地址。旧 6006 曾为 SSH 转发；当前服务已改为本机 6016，不再依赖该隧道。

## 4. 用户功能

侧栏 8 个入口：今日、任务、事项、时间轴、学习与实验、记录与想法、AI Capture、数据管理。

今日：用户选择最多四项，第一项未完成任务为主要行动，其余为次要安排；展示少量进行中的事项和最近完成记录。今日选择保存在 todayFocus 中，按日期生效。

任务：待办、进行中、已完成、全部；点击打开抽屉，可改描述、优先级、日期时间、所属事项与阶段、子任务、标签等。完成会加入历史；重新打开时恢复完成前子任务状态。事项进度复用任务/子任务真实完成比例。

事项：Project 包含阶段、关联任务、里程碑和笔记；详情优先突出下一行动。删除父级时清理活动关联记录，已完成历史保留为独立记录。

学习路线：Roadmap 内嵌阶段和学习任务，支持勾选、排序、里程碑及学习笔记。实验：实验目标、按顺序的步骤、结果和补充，不编造实验结果。

时间轴：显示未来节点、今天、待跟进节点和过去记录，过去可以折叠；提醒在页面打开时检查，关掉网页后不会推送。

收件箱和 Ideas：暂未明确归属的想法可先收集，再转成任务或事项。Ctrl/Cmd+K 可搜索事项、任务、笔记和想法。hash 地址支持刷新和浏览器前后退。

## 5. 文字 AI 的完整流程

用户打字，点击「整理为行动」。前端只请求本站 `POST /api/ai/capture/text`。Node 校验 CSRF 和参数，通过统一 Client 请求 Python `POST /api/text-capture`。Python 调用 AutoDL GPT Provider，得到条目，经 Pydantic 校验再返回。

模型当前为 gpt-5.6-luna。响应包含 status、capture、timings；capture 的条目使用 type/title/start_datetime/end_datetime/note。Node 只透传必要字段，不透传密钥、服务器路径或异常堆栈。

前端将结果变成可编辑预览：可改标题、类型、日期、时间、说明，可取消某项，可选择同时加入今日。此时没有写库。用户点击确认后，才通过原有数据库保存通道写入 MySQL。

会检查 batchId 重复和预览期间版本变化；多次确认不能重复保存。当前新 AI Capture 确认支持新增任务、日程、收件箱。自然语言更新/删除尚未接入这个新契约。

## 6. 录音的完整流程

AI Capture 使用 MediaRecorder 录音，不使用 SpeechRecognition。用户点开始、说完整段、点结束；最长两分钟。录音期间不能整理，结束后才上传，不逐秒调用 AI、不追加中间识别结果。

前端将音频发送到 `POST /api/ai/audio/transcribe`。Node 校验 CSRF、格式、大小，将音频经统一 Client 转给 Python `POST /api/audio/transcribe`。Python 保存临时音频，使用 Gemini 3.5 Flash 的原生音频输入生成转写文字，成功或失败都会清理这次临时文件。

返回文字后追加到原输入；用户可以检查修改，再主动点击整理。转写本身不生成行动、不改数据库。失败保留原文字和浏览器内存中的录音，用户可重试；不自动切换 Mock 或内置识别。麦克风轨道在结束时释放。

当前 ASR_PROVIDER=gemini；LLM_PROVIDER=autodl。即 Gemini 负责听音频，GPT 负责整理文字。普通 OpenAI 兼容 `/models` 没有列出 Gemini，`/audio/transcriptions` 返回404，不代表 AutoDL 独立 Gemini 入口不可用；已用真实音频验证成功。

## 7. 两套 JSON 协议不要混淆

高级手动导入使用 life-dashboard.capture v2，包含 op/kind、精确 ID、expectedTitle 等，可以新增、更新、删除，仍保留预览和确认。权威协议见 public/gpt-import.js 的 GPT_FORMAT 及 capture-edits.js。

新 AI 服务也使用相同 format/version 标签，但当前 payload 的 items 是 type/title/时间/note 的轻量解析条目，并不等同于完整高级变更协议。不要将新服务输出直接传入旧 compileCapture。转换位于 product-ai.js。

后续要做自然语言修改删除，先设计明确的变更契约、目标定位、用户确认和版本保护，不能用同名新增冒充修改。原对话助手代码仍保留，生产直连 GPT 已停用；注入模型的测试通过不代表生产对话助手已接通。

## 8. 数据保存与安全

业务数据存在 MySQL，不依赖 localStorage。Node 以 JSON 状态文档保存，使用 revision 做并发保护，requestId 保证请求幂等，每次修改保留操作前快照，最近30次。runDatabaseCommand 同步计算候选状态，等待服务端事务确认后才显示成功；网络结果不确定时回滚界面并要求重连。

完整备份包含全部持久化业务数据、完成状态、笔记、顺序、提醒、今日选择等。恢复是整体恢复：校验、摘要、确认、操作前快照、恢复；不是追加导入。「复制给 GPT」是轻量目录，不是完整备份。

不要清空用户库、删除 `.local/mysql-data` 或把测试数据灌入真实数据库。测试 helpers 只创建并删除随机 life_dashboard_test_* 库。网页只在本机监听，无账号隔离，不能直接改为公网监听投入多人使用。

## 9. 关键代码入口

- public/bootstrap.js：先读服务端数据，再顺序加载脚本。
- public/product-shell.js：导航、hash路由、快捷输入、搜索。
- public/product-pages.js：首页、项目页、周回顾。
- public/product-tasks.js：任务行、抽屉、完成恢复、今日选择、删除确认。
- public/product-ai.js：录音、转写、文字解析、编辑预览和确认保存。
- public/product-api.js：新流程同源 API Client。
- public/product.css：统一布局和控件样式。
- public/server-storage.js：统一数据库命令、版本和保存反馈。
- public/data-schema.js：共享状态验证、完整备份信封；旧字段和未知扩展字段保留。
- public/app.js、roadmap.js、experiments.js：原有业务规则。
- public/gpt-import.js、capture-edits.js、data-management.js：高级导入、变更、删除、备份恢复。
- server/index.mjs：Node 路由、静态资源、CSRF和主机检查。
- server/ai-backend-client.mjs：集中访问 AI 服务、超时、白名单和统一错误。
- server/store.mjs：MySQL 事务与快照，勿随意改写。
- ai-backend/api/routes.py：FastAPI 接口，含只转写接口。
- ai-backend/services/asr/gemini_asr.py：Gemini 原生音频转写。
- ai-backend/services/providers.py、core/config.py：Provider 选择及配置。
- ai-backend/services/llm/：保留原 GPT 实现；prompts/ 为提示词。

## 10. 密钥与配置文件

真实值在私有交接清单，不在本文和仓库中。根 `.env` 放 MySQL 和 AI_BACKEND_BASE_URL=http://127.0.0.1:6016；`ai-backend/.env` 放 AutoDL/Gemini 密钥与模型配置。Python 才读取模型密钥，前端和 Node 业务代码不保存它。

本机 Python 环境：`.local/ai-venv/Scripts/python.exe`。模型调用依赖网络，但不需要本机 GPU。未安装 torch/funasr，正常使用不需要安装它们。

## 11. 启动与停止

先在项目目录启动本项目独立 MySQL：`node scripts/local-mysql.mjs`。若旧3000/6016已运行，不要重复启动或随意关闭别的进程。

统一启动真实双服务：`npm run start:full`，内部启动本机6016和3000，读取既有私有配置。已有独立6016服务时，只启动主站：`npm start`。单独启动 AI：进入 ai-backend 后执行 `../.local/ai-venv/Scripts/python.exe -m uvicorn app:app --host 127.0.0.1 --port 6016`。

如系统找不到 node，本机可用 `C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`。不要把该个人路径写死为别人的必需环境。

当前服务已启动；关闭终端或重启电脑后需要重新运行。没有配置开机自启。修改后端或 `.env` 后需重启对应服务，改前端静态文件通常刷新即可。

`npm run start:mock` 仅用于明确的模拟，不代表真实模型成功。停止只针对本项目确认过的进程或用启动终端 Ctrl+C，不关闭其他 MySQL实例。

## 12. 测试与当前证据

`npm run build`：静态资源校验和本地构建输出；`npm run lint`：JS语法和入口资源引用校验，不是完整 ESLint。

`npm test`：主站测试；`npm run test:ai`：Python自动化；`npm run test:integration`：真实本地 Python HTTP + Node + 浏览器 + 隔离MySQL，模型强制Mock。浏览器测试需 BROWSER_MODULE 指向 Playwright 的入口，本机为 `C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`。

`RUN_LIVE_AI=1` 才显式运行 `npm run test:live`，会产生真实模型费用。普通测试不需要 AutoDL 实例和真实模型在线。

最近自动化：Python78项、主站与本地整合17项全部通过；47个JS文件语法及入口校验通过。涵盖备份恢复、并发、失败回滚、旧导入、路线、实验、提醒、桌面手机、录音上传和重试。

真实文字联调约3.9至5.2秒；真实录音经主站转发到Gemini约7.5秒，准确返回测试句「我想周末去杭州玩，请先帮我记录这个想法。」，数据库版本未变。音频为本机生成的测试语音，不代表真实用户口音的全面准确率评估。

本地测试结果与截图位于 `.local/ai-live-result.json`、`.local/asr-live-result.json`、`.local/screenshots/`，未提交。不要把这些测试结果误当成当前模型永远在线的保证。

## 13. 下一位优先继续什么

第一，用户实际试录音，收集口音、停顿、专业名词、噪声案例，调整转写提示与错误提示，不承诺和ChatGPT语音完全一致。

第二，补齐新AI契约的更新与删除：读取必要上下文，准确定位ID，遇到同名或歧义先追问，展示前后差异，用户确认后按版本写入，保留快照。原GPT Provider不要无理由重写。

第三，逐步做规划Agent：一句想法先判断是否缺时间、预算、地点等关键信息；只追问必要问题；输出阶段与可执行小任务；提醒时间可由系统建议、用户修改；最终确认后保存。当前尚未完整实现。

第四，梳理旧高级页面与旧助手入口。新版AI Capture已经不用浏览器识别，但旧高级功能仍有历史代码，改动时检查所有可见语音入口，统一体验并更新测试，不要把旧测试Mock能力当作生产能力。

第五，手机当前是响应式网页，不是原生App；后台提醒、通知权限、PWA/安装和公网账户系统都未完成。涉及公网和多用户必须另行设计权限与数据隔离。

保持操作简单、文字清楚、确认后落库，不堆无意义的功能。先读现有代码和数据结构，再做小步改动、独立测试、提交。不要在交接过程中修改用户的完成状态、笔记和真实数据。

更多材料：FRONTEND-AUDIT.md、FRONTEND-RESULTS.md、AI-INTEGRATION.md、VOICE-TRANSCRIPTION.md。
