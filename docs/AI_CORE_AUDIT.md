# AI主链路审计与实施

已真实调用：Python现有AutoDL兼容Responses模型、录音Gemini转写、Capture结构化提取、部分上下文问答与记忆提炼。现有模型调用已在前轮实测，但不能把兼容代理称为已直连官方OpenAI。
规则实现：server/planner.mjs模板拆解/日期调整、agent-engine部分固定意图分支、Risk/Review/What-if排程。规则风险检查有价值，但不再冒充主规划智能。
缺口：首页提案由浏览器执行，缺少统一服务端Action验证与确认；连续方案与Undo多为会话内存；理解/未来快照缺乏统一缓存。

顺序：结构化模型规划→限量LifeContext→会话提案修订→服务端Actions/Confirm/Undo→首页与全局Context接入→缓存Snapshot→隔离/中断/非法ID/浏览器与真实模型测试。保留现有业务结构、ASR和登录，不做视觉重构。
模型密钥只在Python；直连OpenAI优先读取OPENAI_API_KEY/OPENAI_MODEL，兼容现有AutoDL代理配置。FAST/PLANNER由环境变量控制。Structured Outputs使用Responses text.format json_schema strict；流式完整结束后验证，绝不执行半成品。
