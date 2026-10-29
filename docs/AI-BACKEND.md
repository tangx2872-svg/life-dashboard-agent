> 后续验证（2026-10-29）：正式 capture 接口已成功，HTTP 200、约 5.7 秒；新版前端支持编辑预览后确认保存。以下初次联调记录中的 501 为历史状态。

# AutoDL AI Backend 接入

## 当前架构

前端 → Life Dashboard Node.js 原生 HTTP 后端 → 独立 AI Backend。MySQL/mysql2 的事务、快照和写入逻辑未改动。本轮不自动导入，也不修改 AutoDL 内部实现。

server/ai-backend-client.mjs 集中处理 HTTP、超时、响应校验和字段白名单；server/index.mjs 只负责本站请求校验与调用 Client。旧助手直连 GPT 已停用，不把 AutoDL Capture 硬转成旧助手协议。

## 配置

项目根 `.env`（不提交）与 `.env.example`：

```ini
AI_BACKEND_BASE_URL=http://127.0.0.1:6006
AI_BACKEND_TIMEOUT_S=30
```

进程环境变量优先于 .env。迁移仅改 BASE_URL 并重启；不需要模型 API Key。已有本地 OpenAI 配置项已删除。启动不依赖 AI 健康检查成功。

## 本站接口

- GET /api/ai/health：只返回 status:ok，或安全错误，不暴露上游配置。
- POST /api/ai/capture/text：只调用正式 /api/text-capture。需要本站 Origin 和 X-Dashboard-Token（从 /api/state 取得），JSON Content-Type。
- 参数：text（1～4000字），timezone（默认 Asia/Shanghai），locale（默认 zh-CN），可选 current_datetime（带时区 ISO）。
- 返回 status、capture、transcript、timings。Capture 按当前上游公开协议过滤字段；未来协议增加字段需显式升级白名单，避免携带内部配置。
- Debug 只存在独立 Client 方法 debug_text_capture 与手动联调脚本，不提供前端 debug 路由，不自动回退。

错误码：AI_BACKEND_UNAVAILABLE（503，连接不可用）、AI_BACKEND_TIMEOUT（504）、AI_BACKEND_INVALID_RESPONSE（502）、AI_CAPTURE_FAILED（502）。上游原始错误、traceback、路径、密钥和配置不传给前端。健康检查成功不代表模型解析一定可用。

## 真实联调：2026-10-29

输入：明天下午三点开会，晚上八点修改论文。

- 直接 GET AutoDL /health：HTTP 200，status ok，约624ms。
- Client health：成功497ms。
- 本站代理 health：HTTP 200，88ms。
- Client debug：成功4484ms，上游 llm_ms=4376。
- GPT debug 输出：用户准备明天下午三点开会，晚上八点修改论文。
- 本站正式代理：返回安全 AI_CAPTURE_FAILED，约142ms。
- 单独确认上游正式接口：HTTP 501，错误码 PROVIDER_NOT_CONFIGURED。没有成功生成正式 Capture，未将 debug 文本冒充 Capture。

下一步需要 AI Backend 完成正式 Provider 配置。上游 Capture items 使用 type/start_datetime/end_datetime，本站既有导入使用 kind 等字段，尚未兼容，本轮未转换和写入。

## 测试

`node --test tests/ai-backend.test.mjs` 使用注入的模拟 HTTP 响应和内存 store，不需要 AutoDL、SSH、MySQL 或真实 GPT。覆盖健康、默认请求参数、正式路径、返回字段过滤、断线、超时、错误状态、畸形响应、CSRF、不写库和离线时本站首页/状态仍可用。

真实联调单独运行 `node scripts/integration-ai-backend.mjs`，会调用真实 AI；只发送固定示例文本，在临时本地端口启动同一 createApp 路由，store 禁止写入，报告保存在忽略目录 `.local/ai-integration.json`。没有自动 fallback。现有14项回归测试通过，测试不需要真实 AutoDL。

没有实际关闭用户的 AutoDL 实例；离线行为用 mock 验证。

## 下一步语音

上游公开了 /api/voice-capture。后续在同一 Client 增加 parse_voice_capture，以 multipart 上传音频及 timezone/locale/current_datetime；本站增加自己的语音代理，前端仍不接触 AutoDL 地址。沿用超时、白名单和错误映射，另设音频大小/MIME限制。返回 transcript/capture 后先预览，协议适配和导入作为后续独立任务。
