# 简化业务模型

项目 = 长期推进的事情；任务 = 下一步要做的事情；记录 = 已经发生或值得留下的事情。

项目可包含任务，任务允许无项目。完成任务生成记录；记录也可以直接写入项目，不强制先创建任务。学习和实验仅是内容，不再是主要导航概念。

simple-model.js 将原 Project、Roadmap、Experiment 映射成项目；将独立 Task、路线任务、实验步骤、Event 映射成任务；将 History、Note、学习笔记、实验结果与 records 映射成记录。虚拟键 route:/learn:/step:/event: 仅用于展示和定位，不替换原数据库ID，不用作高级JSON导入的实体ID。

今日是 scheduledDate 日期视图。旧 todayFocus 只兼容读取；明确移出会写空安排，避免旧选择重新生效。首页突出一件，接下来最多三件，全部今日任务在任务页查看。

AI 只输出 task/project/record；旧 event 兼容为任务，inbox/idea 兼容为记录。项目推荐为本地可解释关键词匹配，歧义时不自动归类，由用户在预览中选择，不宣称为语义置信度模型。
