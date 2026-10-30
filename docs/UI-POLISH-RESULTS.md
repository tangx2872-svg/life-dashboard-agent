# UI 精修验证

- 新增 UI_POLISH_AUDIT.md，保留后端、数据库与 AI Router。
- Review：记录/任务/项目/日期共享 EntityLink；已删除实体不伪造目标，完成快照可独立查看。
- Drawer：原生 Esc、点击外部、浏览器 Back；手机全宽 Sheet。未拦截右键。
- Plan：真实日期分组、未定时标识、完成/逾期/重点区分、任务详情入口和面包屑。
- 首页/个人页：真实近期项目、任务进度、七天轨迹与轻量 SVG；不额外调用模型。
- Chrome 实测：日历打开、Esc、Overlay、Back、项目卡片、Today、390px Sheet，无页面脚本错误。
- tests/life-browser.test.mjs 和 tests/voice-browser.test.mjs：3/3 通过（隔离测试库）。旧布局选择器已随新卡片与时间线更新。
- 构建与 60 个 JavaScript 语法检查通过。

## 边界
本轮没有新增天气接口、MBTI 设置、定时 AI 项目摘要或全站图标库迁移。近况属于确定性活动投影，并非模型生成。关联导航覆盖主回顾、记录、计划与新项目卡；旧高级页保留原操作。
