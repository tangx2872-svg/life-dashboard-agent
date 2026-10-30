# Life 核心 AI 链路交付报告

## 1. 当前真实连接与现状
已真实验证当前配置的 AutoDL OpenAI-compatible Responses 上游，返回真实流式大模型提案；不是mock或本地模板。没有凭据证明官方直连已开通，因此不声称已验证api.openai.com直连。
Python LifeLLMService支持服务器OPENAI_API_KEY/OPENAI_MODEL，存在该配置时使用官方OpenAI SDK；OPENAI_BASE_URL可选。缺省兼容现有AutoDL配置。密钥不进入浏览器。
原规划器模板仍为兼容/显式无模型测试保留；正常主服务启用新Provider后首页/全局请求不再走旧模板，模型失败直接报错，不悄悄降级成“假计划”。Risk规则、数值排程比较保留并明确标注。

## 2. API与Structured Outputs
现有Python SDK 3.41.0；使用Responses API、text.format=json_schema、strict=true、Pydantic校验。服务端stream=True记录首段输出，但只有response.completed之后才拼接并校验最终提案；failed/incomplete/断流拒绝，无半成品写入。
主Schema包含summary/intent/message/operations/warnings，五种操作：create_task/update_task/reschedule_task/create_project/update_project。nullable字段明确；禁止额外字段。Node再检查操作白名单、日期、时长、标题、状态、项目/任务归属，深拷贝执行后用真实业务schema复核。
参考：[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)、[Streaming Responses](https://developers.openai.com/api/docs/guides/streaming-responses)。

## 3. 文本与语音完整链路
文字/MediaRecorder → 同源Node → 现有AutoDL链路的Gemini ASR → transcript → lifeTurn → LifeContext → Python统一规划Provider → 结构化提案预览 → 确认 → Node LifeActions → 原版本保护事务保存 → UI读取确认结果。
修复：转写完成仍处于transcribing导致lifeTurn直接返回；空转写不再提前销毁录音；失败保留blob并可重试；GPT失败保留原文。
不支持ASR partial transcript，当前依然是可靠的整段录音转写，没有伪造流式转写。

## 4. 首页与全局麦克风
首页scope=home，优先相关项目与局部任务。悬浮麦克风scope=global，读取更广泛安排；入口复用已有录音/输入组件，没有界面重做。
当前项目由现有项目/计划路由解析；当前任务由任务详情打开时记录，后端只在当前用户状态中解析ID。不存在/他人ID不能查到对象。
局部Context最多18任务；全局最多45任务、16项目；包含必要阶段、里程碑、最近4条活动、相关记忆、偏好、最近4轮提案历史与当前时间。不是整库Prompt。

## 5. Proposal Session与连续修订
每会话最多32个提案，30分钟有效，包含proposalId、proposalVersion、baseRevision、最新完整proposal、最近8轮输入摘要。
“周三不要安排”等修订传回previous方案，返回完整替代方案。旧预览版本不能确认最新版本。确认后清掉前端已消费的proposalId，避免下一句话404。
当前提案/Undo在当前服务会话内存，进程重启后需要重新生成；没有把这部分宣传成跨重启持久会话。

## 6. Confirm与Undo
POST /api/life/confirm：显式confirm=true、最新提案版本、业务revision一致，服务端重新校验并原子保存。生成changeBatchId，保留修改前完整状态。
POST /api/life/undo：整批恢复；若之后发生其他业务修改则409拒绝覆盖。持有别人提案/错误CSRF均不能执行。至少保留当前会话最近一次AI批量操作。
无直接删除/清空操作开放给模型。新项目可用clientRef在同批任务中引用，服务器生成真正ID。

## 7. Memory与Snapshot
保留现有用户绑定自动记忆提炼/去重/检索；只从用户原话提炼稳定信息，临时请求/凭据过滤。记忆失败不阻断主要规划。
POST /api/life/snapshot(kind)：understanding/future/weekly/project。理解和未来入口复用已有“我”页面，另可进入原记忆管理和数值比较。
缓存记录generatedAt、业务revision+记忆状态/更新时间指纹。24小时且来源不变直接返回，不调用模型；来源变化/过期先给旧缓存并后台刷新。并发同类生成去重。
正式账号持久化到ai_snapshot_cache(user_id,kind)联合主键，外键users；跨登出重登可命中。Guest仅用会话缓存，不把体验内容写进正式账号表。首次尚无缓存仍需一次模型生成。

## 8. 数据库与配置
新增scripts/migrate-life-core.mjs，幂等创建ai_snapshot_cache，未改旧业务文档和表；本机已用临时管理连接完成，不扩展应用权限。回退保留缓存表即可，不删除用户源数据。
在ai-backend/.env配置：OPENAI_API_KEY、OPENAI_MODEL（直连），可选OPENAI_BASE_URL；现有AutoDL配置继续可用。LIFE_FAST_MODEL/LIFE_PLANNER_MODEL选择两档；未设置时复用当前模型，未擅自换成陌生模型。支持GPT模型的LIFE_REASONING_EFFORT缺省low。

## 9. Benchmark（真实样本，不是稳定SLA）
- 小Context：first token 2748ms，LLM完成5093ms，解析0.29ms。
- 完整体验数据减肥前：Context 0.71ms，first token 4135ms，LLM完成31482ms。
- 18任务/约3847字符Context优化样本：first token 2733ms，LLM完成5113ms，解析0.25ms。
- 后续真实浏览器样本：first token约1.69–7.23秒，完成约3.50–9.26秒；仍有上游波动。
- 合成语音真实ASR独立样本约5140ms（provider asr_ms=5133）。不上传来源不明的旧录音。
- 本机真实测试库动作保存约4–5ms，Guest内存执行约1–2ms。
日志仅记录耗时、类型、操作数、Provider，不记录用户完整输入、录音、Prompt或密钥。浏览器life.metrics保存请求/转写阶段指标，普通UI不展示技术日志。
上游流式首段输出是服务端测量，不等于浏览器首段文本展示；当前浏览器显示自然状态，最终完整校验后展示提案。

## 10. 测试与实际浏览器
Node默认完整集：30通过、15因未启用浏览器配置而跳过。单独配置Chrome后导航、Guest、登录合并、语音和核心A-G共8项指定回归通过。
Python83通过；流式完成才接受与断流拒绝有独立测试。
受控动作覆盖简单新增、更新、创建项目、项目关联、当前任务Context、非法操作/不存在ID/非法日期拒绝；未确认零写入；确认与整批Undo；业务revision和提案版本冲突；Guest/登录用户隔离。
Snapshot覆盖重复读取不调用模型、跨登出重登缓存、不同用户隔离。
真实模型浏览器已验证新增任务→修订同一方案→确认→Undo；项目页输入在该项目下生成并确认两任务。真实合成语音端到端结果见本轮最终联调输出；遇歧义允许澄清而不是强行修改。

## 11. 本轮文件
新增server/life-proposals.mjs、public/life-core.js、ai-backend/api/life_proposal_routes.py、scripts/migrate-life-core.mjs。
修改gateway、Node AI client/index、Python app、bootstrap与life-planner语音状态；复用现有UI。
新增life-proposals/core-http/core-browser/snapshot测试与显式真实模型integration；Python流式测试；审计与本报告。

## 12. 剩余边界
官方直连需要用户自己的服务器凭据，目前真实验证的是兼容代理。复杂请求仍受上游波动和配置超时约束。
没有向浏览器实时发送部分JSON/摘要；没有ASR分段流式；没有跨进程提案/Undo持久化。首次Snapshot仍有模型等待。
提案有结构/权限/版本保护，但语义质量仍取决于模型，不能保证所有自然语言组合零澄清。旧学习路线/实验嵌套实体尚未加入五种新动作，仍走原功能。
首次真实测试发现“只改日期”被模型误改成重排已有任务，已加强修订约束与显式新增语义；重要操作仍要求用户确认，不以Prompt替代权限校验。
未修改颜色、字体、侧栏；未公网部署，未声称完成生产安全或高并发验收。

## 最终真实端到端结果
最后一轮真实模型Chrome测试通过（约25.05秒完成整组场景）：新增→同一提案改日期→确认→Undo；当前项目中新建并确认两个任务；已知合成语音经浏览器上传、真实ASR、自动GPT得到待确认提案，未确认时任务数量不变。
语音到提案本次总计10859ms：ASR 6838ms；Context 0.34ms；GPT first token 2231ms；GPT完成3981ms；解析0.086ms；浏览器请求收到回复3988ms。此样本无需追加澄清。近期该组文字请求模型完成约3498/5153/3926ms，数据库/Guest动作约1.1ms。测试未操作正式用户数据。
某轮真实语音测试曾合理返回澄清而非操作，已保留测试允许通过连续回答完成，不强行把不确定请求写库。
补充安全点：确认请求必须带proposalVersion，旧版预览确认最新修订会409；确认后前端清理已消费的proposalId。
环境变量模板见 docs/LIFE_AI_ENV.example，复制到Python服务的.env，不能放到浏览器。
