# 录音转写

AI Capture 使用 MediaRecorder 录制音频，明确开始/结束；结束后上传至本站 `POST /api/ai/audio/transcribe`，由 Node Client 转发到 Python `POST /api/audio/transcribe`。这一流程不调用浏览器 SpeechRecognition，不生成行动，也不写数据库。

目前本机配置使用 AutoDL 的 Gemini 3.5 Flash 识别语音，原有 AutoDL GPT Provider 继续处理「整理为行动」。AutoDL 的 Gemini 使用独立原生入口：`https://www.autodl.art/api/v1/gemini`，并非 `/audio/transcriptions`，所以不能用普通 OpenAI 兼容模型列表判断 Gemini 是否可用。

接口说明：https://autodl.art/docs/gemini-3.1-pro-preview/

Python 私有 `ai-backend/.env` 配置：

```ini
ASR_PROVIDER=gemini
GEMINI_API_KEY=在本地填写
GEMINI_BASE_URL=https://www.autodl.art/api/v1/gemini
GEMINI_MODEL=gemini-3.5-flash
```

密钥仅由 Python 读取。Node 与前端不接触模型密钥；配置和测试音频均被 Git 忽略。仍可通过 `ASR_PROVIDER=openai` 使用已有 OpenAI 转写 Provider，并单独配置相应音频服务。

页面流程：开始录音 → 结束录音 → 正在识别 → 文字回填 → 用户检查 → 手动整理为行动 → 编辑预览 → 用户确认保存。单次录音最多两分钟；权限失败可直接打字；转写失败保留原文字和内存中的音频供主动重试。不会自动回退到 Mock 或内置识别。

上传大小由 Node/Python 限制；Gemini 内联音频额外限制为 14MB。Python 在转写成功或失败后删除本次临时音频。麦克风轨道在结束或失败时释放。

本次验证：

- 使用本机合成的中文 WAV，真实通过主站 → Node → Python → AutoDL Gemini，HTTP 200，约 7514 ms。
- 返回「我想周末去杭州玩，请先帮我记录这个想法。」，数据库版本不变。
- 这是接口连通与示例验证，不能据此断言所有口音、噪声或专业术语都能准确识别。
- 浏览器 Mock 测试覆盖真实音频上传路径、明确结束、一次上传、文字保留、失败重试、麦克风释放、不触发整理、不写库，且将 SpeechRecognition 设为抛错来验证不使用它。
- Python 测试覆盖转写不调用 LLM 规划、临时文件清理、失败清理、Gemini 音频请求和忽略思考字段。
- 跨服务测试覆盖 Node/Python 录音转写、CSRF、类型校验与无数据库写入。

运行：`npm run test:ai`；浏览器及本地整合按 AI-INTEGRATION.md 设置 Playwright 后执行。真实录音测试不会作为默认自动化测试的一部分。
