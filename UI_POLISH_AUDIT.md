# UI / UX 精修审计

## 当前问题
- voice-dashboard.js 回顾抽屉中的完成标题、项目名、日期是纯文本，不能深入；simpleRecordRow 同样无关联跳转。
- Drawer 仅支持关闭按钮和原生 Esc，遮罩和浏览器返回未统一。
- lifePlanPage 有真实日期分组，但任务名称不可进入详情，完成/逾期层级不足。
- 首页最近项目是紧凑文字行，个人页主要是设置，缺少基于真实活动的近况。

## 可复用组件
simpleProjects / simpleTasks / simpleRecords 是非破坏性聚合视图；productTaskForm 是现有任务详情；lifeComposer、dashboardCommand 保留不变。新增 EntityLink、统一面板生命周期、Review Timeline、Project Card 和 Weekly Track。

## 修改顺序与文件
P0：public/ui-polish.js 统一实体导航，原生 dialog 遮罩/Back/Esc；不拦截右键。
P1：回顾按日历与活动分组，计划日期时间线，项目进度和状态。
P2：首页与个人页最近活动、周轨迹，确定性数据摘要（不冒充模型输出、不额外调用 AI）。无天气或 MBTI 数据时隐藏。
P3：public/ui-polish.css 轻量交互、窄屏全屏 Sheet、键盘焦点；bootstrap.js 加载模块。
不修改后端、数据库、AI Router 或持久化协议。

## 验证
脚本检查、独立数据投影和实体链接测试、现有测试；浏览器工具可用时实际验证 Overlay / Esc / Back、页面及手机布局。禁止向用户库灌入测试数据。
