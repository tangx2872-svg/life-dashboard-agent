> 历史阶段记录：后续需求已改为转写后自动规划；当前行为以 [AGENT_INTERACTION_REPORT.md](AGENT_INTERACTION_REPORT.md) 为准。

# 主输入区统一交互

文字按钮和键盘都通过submitLifeInput → lifeTurn → 原LifeContext/模型/Proposal；没有新增第二套规划逻辑，也不会直接写任务。
输入为空disabled，分析中“正在整理…”并禁重复点击；成功或失败后恢复。普通Enter换行，Ctrl/Command+Enter提交；中文输入法组合中不误提交。textarea三行起，自动增高至240px，之后内部滚动。
语音只完成文字输入，不再自动请求AI；完成后提示“已经转成文字，可以继续修改，再点帮我安排”。已有文字保留并按标点/换行追加。手动编辑后的当前内容才提交。ASR失败保留草稿和录音，可重试；模型/网络失败保留文字。
澄清问题放在主输入框附近的轻状态，不再显示第二块“重新语音输入”区域。正常答案/正式提案仍保留；用户可继续修改主输入，并基于原proposalId修订。
提交成功后继续保留文字以便修改，用户主动取消/完成后可清空；访客最近对话沿用原保存，失败请求不再误写成旧回复的对话历史。

## 修改文件
public/life-home.js（统一composer/输入辅助函数）、life-planner.js（转写仅追加草稿）、life-core.js（清理重复入口与状态）、life-input.css、index.html、account-entry.js（不保存失败回复）。
测试新增tests/unified-input-browser.test.mjs；原life/core浏览器及显式真实模型测试更新为Ctrl+Enter/手动提交转写，不再期待自动提交。
没有后端业务、数据库、账户、模型Provider或外观系统重构。

## 验证
真实Chrome：直接按钮提交出提案；普通Enter多行不发请求；Ctrl/Command+Enter提交；纯转写后无模型请求；改写转写后发送新文字；打字后语音追加；ASR失败保留草稿/blob；模型失败保留文字；连续3次点击只1次模型请求；空输入disabled。
390×844检查：麦克风与主按钮分居操作栏两端，触控高度均≥44px，页面无横向溢出。截图.local/screenshots/unified-input-mobile.png；未声称实测所有实体手机键盘行为。
核心提案/Undo、导航、原录音重试回归通过。构建与92项脚本语法/资源检查通过。

## 行为更新
本轮明确取代上一阶段“ASR结束立即自动进入GPT”的默认策略。现在文字、语音、混合输入均先成为同一个可编辑草稿，由用户点击“帮我安排”或快捷键提交。
