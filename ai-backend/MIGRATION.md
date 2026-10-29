# 迁移指南 / Migration

本说明用于把本仓库（`life-dashboard-ai-backend`）从 GitHub 拉到任意一台新机器（Linux / macOS / Windows）并跑起来。

**当前版本完全不需要 GPU**：正式链路只调用 AutoDL 的 OpenAI-compatible HTTP 接口。

---

## 1. 克隆仓库

```bash
git clone https://github.com/tangx2872-svg/life-dashboard-ai-backend.git
cd life-dashboard-ai-backend
```

Windows PowerShell 同样适用：

```powershell
git clone https://github.com/tangx2872-svg/life-dashboard-ai-backend.git
cd life-dashboard-ai-backend
```

---

## 2. 创建虚拟环境（推荐 Python 3.10）

Linux / macOS：

```bash
python3.10 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Windows / PowerShell：

```powershell
py -3.10 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

> 若使用 conda：`conda create -n life-agent python=3.10 -y && conda activate life-agent && pip install -r requirements.txt`

---

## 3. 配置环境变量

Linux / macOS：

```bash
cp .env.example .env
```

Windows / PowerShell：

```powershell
copy .env.example .env
```

然后编辑 `.env`，**唯一必填**的是 AutoDL Key：

```env
AUTODL_LLM_API_KEY=你的真实Key
```

其余保持默认即可（即已验证组合）：

```env
ASR_PROVIDER=mock
LLM_PROVIDER=autodl
AUTODL_LLM_BASE_URL=https://www.autodl.art/api/v1
AUTODL_LLM_MODEL=gpt-5.6-luna
```

> **真实 Key 只能写进 `.env`。** `.env` 已被 `.gitignore` 忽略，**不要提交到 Git**，
> 也不要写进任何源码、README、Issue 或聊天记录。

---

## 4. 启动服务

```bash
uvicorn app:app --host 0.0.0.0 --port 6006
```

常用变体：

```bash
uvicorn app:app --reload            # 开发模式，代码改动自动重载
uvicorn app:app --host 127.0.0.1 --port 6006   # 仅本机可访问
```

---

## 5. 验证

```bash
# 健康检查（期望 status=ok，providers.llm=autodl，llm_model=gpt-5.6-luna）
curl http://127.0.0.1:6006/health

# 文本 → Capture v2（真实调用，会产生少量费用）
curl -X POST http://127.0.0.1:6006/api/text-capture \
  -H "Content-Type: application/json" \
  -d '{"text":"明天下午三点开会。"}'

# 自动化测试（全 mock，免费、不需要 Key，建议在迁移后必跑）
pytest -q
```

Windows PowerShell 的等价调用：

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:6006/health
Invoke-RestMethod -Uri http://127.0.0.1:6006/api/text-capture -Method Post `
  -ContentType "application/json" -Body '{"text":"明天下午三点开会。"}'
```

---

## 6. 不需要安装的东西（重要）

当前正式链路（AutoDL HTTP 接口）**不依赖**以下任何一项，不要为了跑起来去装它们：

- CUDA / NVIDIA Driver / RTX GPU
- PyTorch（torch）
- transformers / accelerate / bitsandbytes / safetensors
- Hugging Face 或 ModelScope 模型权重
- Qwen 权重、`/root/autodl-tmp` 数据盘

只有在把环境变量改成可选 Provider 时才需要：

| 场景 | 环境变量 | 额外安装 |
|---|---|---|
| 本地 FunASR 中文 ASR | `ASR_PROVIDER=funasr` | `pip install funasr`（附带 torch，体积大） |
| 本地 Qwen 生成 | `LLM_PROVIDER=local_qwen` | `pip install transformers accelerate safetensors`（需 torch + GPU） |

---

## 7. 后续整合进 Life Dashboard 主后端

后续把 AI 能力迁进主后端时，建议按模块整体搬运，改动最小：

| 模块 | 内容 | 说明 |
|---|---|---|
| `core/config.py` | Settings | 并入主工程配置体系，Key 统一走主工程的 Secret 管理 |
| `core/errors.py` | `AppError` / `ErrorCode` | 可替换为主工程的统一错误结构，只需保留错误语义 |
| `schemas/capture.py` | Capture v2 模型 + 严格 JSON Schema | **契约核心**，建议以它为准对齐前端 |
| `services/llm/base.py` + `services/llm/autodl_llm.py` | LLM Provider 抽象与 AutoDL 实现 | 主后端接入时只需替换上层调用方式 |
| `services/llm/support.py` | items 校验 / 一次修复 / 计时 | 与 HTTP 无关，可直接复用 |
| `services/capture_service.py` | 编排（含 timings） | 改为返回主工程的响应类型即可 |
| `prompts/*.txt` | Prompt 模板 | 与代码解耦，便于迭代 |

不需要迁移：`app.py`、`api/routes.py`（主后端有自己的路由）、`uploads/`、`tools/`（开发脚本）。
