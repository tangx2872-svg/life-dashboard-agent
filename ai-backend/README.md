# Life Dashboard AI Backend

Life Dashboard 的 **AI 服务层**：把自然语言（中文语音转写或文本）解析成严格的
[Capture v2](#capture-v2-输出结构) JSON。

当前已跑通并验证的正式链路：

```text
Natural Language
        ↓
      FastAPI
        ↓
AutoDL OpenAI-compatible API
        ↓
    gpt-5.6-luna
        ↓
Structured Response (json_schema + strict)
        ↓
Pydantic Validation（失败最多修复一次）
        ↓
   Capture v2 JSON
```

> 本项目当前独立运行，后续会被整合进 Life Dashboard 主后端（届时 `core/`、`schemas/capture.py`、
> `services/llm/` 会整体迁入主工程的 AI 模块）。

---

## 当前接口

服务默认监听 `http://0.0.0.0:6006`，交互式文档在 `http://127.0.0.1:6006/docs`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | 服务信息与当前 Provider 组合 |
| GET | `/health` | 健康检查（含 asr / llm / llm_model） |
| POST | `/api/text-capture` | **正式接口**：自然语言文本 → Capture v2 JSON |
| POST | `/api/text-capture/debug` | 调试接口：文本 → AutoDL 模型原始输出（不做结构化） |
| POST | `/api/audio/upload` | 上传音频（wav / mp3 / m4a / webm）并返回 audio_id |
| POST | `/api/voice-capture` | 语音 → ASR → Capture v2（ASR 当前为 mock） |
| POST | `/api/local-llm/test` | 可选：本地 Qwen 生成测试（需自行安装 torch/transformers） |

### Text Capture 请求 / 响应

```bash
curl -X POST http://127.0.0.1:6006/api/text-capture \
  -H "Content-Type: application/json" \
  -d '{"text":"明天下午三点开会。"}'
```

成功：

```jsonc
{
  "status": "ok",
  "input": "明天下午三点开会。",
  "capture": {
    "format": "life-dashboard.capture",
    "version": 2,
    "batchId": "capture-20261029-text-301eda54",   // 后端生成，模型不参与
    "items": [
      {
        "type": "event",
        "title": "开会",
        "start_datetime": "2026-10-30T15:00:00+08:00",
        "end_datetime": null,
        "note": null
      }
    ]
  },
  "timings": { "llm_ms": 4639, "validation_ms": 0, "total_ms": 4681 }
}
```

失败（统一错误结构，不含堆栈、不含密钥）：

```jsonc
{
  "status": "error",
  "error": { "code": "INVALID_CAPTURE_JSON", "message": "…", "details": { "errors": [] } }
}
```

错误码：`INVALID_REQUEST` / `INVALID_AUDIO` / `AUDIO_TOO_LARGE` / `ASR_FAILED` /
`LLM_FAILED` / `INVALID_CAPTURE_JSON` / `PROVIDER_NOT_CONFIGURED`。

### Capture v2 输出结构

```text
format   : "life-dashboard.capture"（固定）
version  : 2（固定）
batchId  : capture-YYYYMMDD-text-<8位随机hex>，由后端生成
items[]  :
    type            task（待办）/ event（有明确时间的日程）
    title           条目标题
    start_datetime  ISO 8601（YYYY-MM-DD 或带时间/时区），无法确定时为 null
    end_datetime    同上，仅当用户明确给出结束时间或时长
    note            补充说明
```

模型只负责输出 `items`，`batchId` 由后端生成；
相对时间（"明天""周五""下个月"）依赖注入的当前本地时间 + 时区换算，不确定时填 `null`，绝不臆造。

---

## 环境

- Python **3.10**（已验证 3.10.22）
- **不需要 GPU / CUDA / PyTorch**：正式链路只调用 AutoDL HTTP 接口

> `torch` / `transformers` / `funasr` 只在可选 Provider 里惰性导入，不装也能正常启动服务。

---

## 安装（Linux / macOS）

```bash
python3.10 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 安装（Windows / PowerShell）

```powershell
py -3.10 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## 配置

```bash
cp .env.example .env
```

然后编辑 `.env`，填入 AutoDL Key：

```env
AUTODL_LLM_API_KEY=your_key_here
```

其余按需调整（默认即已验证组合）：

```env
ASR_PROVIDER=mock
LLM_PROVIDER=autodl
AUTODL_LLM_BASE_URL=https://www.autodl.art/api/v1
AUTODL_LLM_MODEL=gpt-5.6-luna
AUTODL_LLM_TIMEOUT_S=120
AUTODL_LLM_MAX_RETRIES=2
AUTODL_LLM_STRUCTURED=auto
```

> **安全：真实 Key 只允许写在 `.env`。**
> `.env` 已被 `.gitignore` 忽略，**不得提交到 Git**；
> 日志与错误响应均经过脱敏，不会输出 Key。

## 启动

```bash
uvicorn app:app --host 0.0.0.0 --port 6006
```

## 测试

```bash
pytest -q
```

测试全部使用 mock Provider，**不需要任何 API Key，也不产生任何真实调用与费用**。

## Health

```bash
curl http://127.0.0.1:6006/health
```

---

## 目录结构

```text
life-dashboard-ai-backend/
├── app.py                       FastAPI 入口（lifespan + 统一异常处理）
├── api/routes.py                路由：接收参数 → 调 Service → 回 Response
├── core/
│   ├── config.py                Settings：统一从 .env 读取，API Key 只在字段级存在
│   ├── errors.py                AppError + ErrorCode + 全局异常处理器
│   ├── logging.py               日志（脱敏，绝不打印 Key）
│   └── prompts.py               Prompt 模板渲染（prompts/*.txt）
├── prompts/
│   ├── life_dashboard_v2.txt        Capture v2 解析 Prompt
│   ├── life_dashboard_v2_repair.txt 一次修复 Prompt
│   ├── autodl_debug.txt             AutoDL 连通性调试 Prompt
│   └── local_qwen_task.txt          本地 Qwen 测试 Prompt
├── schemas/                     请求 / 响应 / Capture v2 的 Pydantic 模型
│   ├── capture.py               Capture v2 模型 + 供 LLM 的严格 JSON Schema
│   └── voice.py / health.py / errors.py / autodl.py / local_llm.py
├── services/
│   ├── providers.py             Provider 工厂（SDK 惰性导入）
│   ├── capture_service.py       编排：LLM → 校验 → 组装 CapturePayload → 计时
│   ├── audio_service.py         上传校验与临时文件保存
│   ├── asr/                     funasr | openai_asr | mock
│   └── llm/                     autodl_llm | openai_llm | local_qwen | mock
├── tests/                       自动化测试（全 mock，无真实调用）
├── tools/                       手工真实调用脚本（会产生 API 消费）
└── uploads/                     上传音频临时目录（内容不入库）
```

---

## 说明：手工真实调用脚本

```bash
python tools/test_text_capture_real.py            # 跑 10 条样例
python tools/test_text_capture_real.py --perf 10  # 连续 10 次真实调用统计延迟
python tools/test_text_capture_real.py --direct   # 直连 Provider，打印 attempts / repaired
```

这些脚本会**真实调用 AutoDL 并产生费用**，日常开发请用 `pytest -q`（全 mock）。

---

## 安全

- 真实 Key 只存在于 `.env`（已被 `.gitignore` 忽略），源码 / 日志 / 测试均不含 Key；
- 没有 API Key 时服务依然可以启动，调用对应 Provider 时才返回结构化错误；
- 错误响应与日志不输出堆栈、不输出密钥内容。
