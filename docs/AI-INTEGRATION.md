# 主站与 AI 后端整合

## 源码来源与边界

源仓库：https://github.com/tangx2872-svg/life-dashboard-ai-backend

合入版本：`c19d4c57906abc29b148f804fffc6c1a0baeda94`。

使用 `git subtree` 将源仓库合入 `ai-backend/`，普通 clone 主仓库就有两端完整源码，不需要再初始化 submodule。保留源仓库及其提交溯源，未 force push。AI 的 `services/`、`prompts/`、接口实现原样保留，没有改写 GPT 实现。

```text
浏览器
  → Node.js 主后端 /api/ai/capture/text
    → FastAPI /api/text-capture
      → 原有 AutoDL 模型 Provider
    ← 校验后的 Capture JSON
  ← 可编辑预览
用户确认 → Node /api/state → MySQL 事务与快照
```

Python 处理模型调用，Node 保留业务与数据库职责；不是把 Python 代码改写成 JavaScript。AI 后端不直接写 MySQL。

## 当前可用方式

当前 `.env` 继续使用 `AI_BACKEND_BASE_URL=http://127.0.0.1:6006`，连接既有 SSH 转发服务。已验证真实模型调用成功。没有把远端密钥复制进主站或 Git。

普通运行仍用 `npm start` 或 `start-local.cmd`。也可 `npm run start:integrated`，默认连接现有外部 AI 服务；AI 暂时离线不妨碍主站启动。

## 本地运行合入的 Python 服务

先在主仓库根目录准备环境（Windows）：

```powershell
py -3 -m venv .local/ai-venv
.local/ai-venv/Scripts/python.exe -m pip install -r ai-backend/requirements.txt
Copy-Item ai-backend/.env.example ai-backend/.env
```

Linux/macOS 改用 `python3 -m venv .local/ai-venv` 和 `.local/ai-venv/bin/python`。无需 GPU、torch 或模型权重。

真实调用需在 **ai-backend/.env** 中配置 `AUTODL_LLM_API_KEY`；Key 留在 Python 服务配置中，不放到主仓库根 `.env`、前端或 Node 业务代码。

启动前保证 MySQL 已运行，并关闭同端口的旧主站进程：

```powershell
npm run start:full
```

此命令启动 Python `127.0.0.1:6016` 和 Node `127.0.0.1:3000`，仅对该次 Node 子进程设置 AI 地址，不改写 `.env` 中原来的 6006 地址。6016 避免占用 SSH 转发的 6006。`AI_LOCAL_PORT` 可改端口；`AI_PYTHON` 可指定已有 Python 解释器的绝对路径。端口占用时退出，不关闭别的服务。

不配置 Key 也能做本地模拟：

```powershell
npm run start:mock
```

这是明确的 Mock 模式，返回占位条目，只验证流程，不代表真实理解能力。绝不在真实 AI 失败时自动切到 Mock。

## 配置隔离

- 主仓库 `.env`：MySQL、`AI_BACKEND_BASE_URL`、`AI_BACKEND_TIMEOUT_S`。
- `ai-backend/.env`：模型 Provider、模型 Key、上传目录等。
- `.local/ai-venv`、上传音频、模型文件、缓存、运行日志、两处 `.env` 均不提交。
- `.env.example` 改为本机回环监听，上传目录留空时使用服务内 `uploads/audio`，避免照搬远端 `/root` 路径。
- Node 超时当前仍为 30 秒，前端请求上限 40 秒；没有为迁移擅自延长等待。

## 契约修正

1. 主站 Client 允许透传安全的 `validation_ms`，与 Python 正式响应一致。
2. 输入框最多 4000 字，与 Node/Pydantic 一致。
3. AI `type/title/start_datetime/end_datetime/note` 通过已有前端预览层转换；没有把它误当成旧高级 JSON 的 `op/kind` 协议。
4. 新增 pytest.ini 限定自动化目录为 `tests`，避免默认收集 `tools/test_qwen*` 的手工 GPU 脚本。

## 测试命令

```powershell
npm test
npm run test:ai
# 需要设置 BROWSER_MODULE 为 Playwright 入口；使用独立随机测试数据库
npm run test:integration
```

`test:integration` 启动真正的本地 Python HTTP 进程，但强制 LLM/ASR 为 Mock；覆盖网页、Node 代理、FastAPI、预览、确认写库、刷新和 AI 进程关闭。测试不要求 SSH 或真实 GPT，不写用户数据库。

真实模型联调单独执行（会产生一次模型调用）：

```powershell
$env:RUN_LIVE_AI='1'
npm run test:live
Remove-Item Env:RUN_LIVE_AI
```

它也只使用临时测试数据库，默认未授权标志时跳过，不属于 `npm test`。

## 本次验收结果

- Python 自动化：75 passed。
- 主站回归与本地整合：16 passed；真实联调单独 1 passed；构建、46 个 JavaScript 文件语法及入口资源检查通过。
- 本地跨服务整合：通过，确认前数据库版本不变；确认后写入 1 项；刷新后仍存在。
- 停止测试 Python 服务：主站 AI 返回 503 / `AI_BACKEND_UNAVAILABLE`，普通数据接口仍返回 200，已有任务保留。
- 真实服务健康检查：6006 `/health` 正常，Provider 为 autodl。
- 真实浏览器整链路：通过，约 **3912 ms**。输入「明天下午三点开会，晚上八点修改论文」，返回 2026-10-30 15:00 开会、20:00 修改论文。预览阶段无写入，用户确认路径保存测试任务成功；测试库随后删除。
- 真实联调截图：`.local/screenshots/merged-ai-live-preview.png`；结果：`.local/ai-live-result.json`，不提交运行产物。

当前真实调用仍走既有 AutoDL 服务；新合入的本地 Python 已用 Mock 完成端到端验证。本地 Python 直接调用真实模型需要单独配置其 Key，本次没有迁移密钥。

## 后续同步 AI 源仓库

先确保工作区干净，然后：

```bash
git subtree pull --prefix=ai-backend https://github.com/tangx2872-svg/life-dashboard-ai-backend.git main --squash
```

保留本次本地 pytest 配置与便携路径调整，并重新执行两端测试。语音接口已包含在 Python 源码中，但本次未新增前端录音上传代理，也不将 ASR Mock 冒充为真实语音识别。
