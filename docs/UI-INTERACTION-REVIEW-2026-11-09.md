# UI / 交互优化修改记录

修改日期：2026-11-09。

本次围绕比赛演示的观感、操作反馈和页面一致性进行前端精修，沿用现有原生 JavaScript 页面、任务详情抽屉、方案卡及保存通道。首页与 Today 仍为同一主页面，地址为 `#/today`。

## 修改内容

| 模块 | 修改结果 |
| --- | --- |
| Today 完成反馈 | 今日待办过滤已完成任务；新增可展开的“今天已完成”区，显示勾选状态并支持恢复待办，修复完成后仍显示未勾选的问题 |
| Today 操作 | 任务标题可打开现有详情抽屉；待办默认展示前四项，超过四项时可展开全部 |
| Agent 撤销 | 撤销成功后，方案卡与执行回执同步显示“已撤销”；旧方案不能重新确认；撤销失败保留原保存状态；阻止重复撤销请求 |
| Agent 输入定位 | 首页与助理弹窗分别读取和聚焦自己的输入框；同步处理草稿、自定义回答、方案内调整及录音计时；弹窗控件使用独立 ID |
| Review 统计 | 顶部数字、日历和近 30 天记录采用同一活动范围；“完成数”仍只统计完成记录，“有进展的天数”包含笔记等活动 |
| Review 日历 | 增加日期范围、月份提示、星期标题与星期对齐、活动颜色图例、当天和选中日期状态 |
| 首页主次 | 宽屏下输入区与 Today 放在主栏，近期项目、本周轨迹与建议放在次栏；首页最多展示两个近期项目，保留“全部计划”入口；移除回退内容中的重复标题 |
| 内容宽度 | 主内容最大宽度统一为 1040px；视口宽度达到 1200px 时使用主次双栏，较窄屏幕按主次上下排列；统一标题对齐和区块间距 |
| 长对话滚动 | 对话区域限制高度并支持键盘滚动；更新时保留阅读位置，原本位于末尾时跟随新内容；阅读旧消息时提供“回到最新”入口 |
| Agent 等待反馈 | 显示实际等待秒数，等待达到 15 秒、45 秒时更新说明；等待、取消和错误提示放在对话滚动区域外；计时更新不重绘输入框和对话 |
| Agent 取消与重试 | 支持取消等待、继续补充和重新整理；取消后保留本次对话中的原话与已有方案，忽略迟到响应；自动重试延续累计等待时间；等待调整期间禁止确认旧方案 |
| 移动端避让 | 底栏、顶栏与面包屑统一使用 760px 断点；手机保留底栏助理入口；提醒、Toast 和保存提示按底栏高度及安全区避让 |
| 图标与可读性 | 主导航、麦克风、发送、关闭、菜单和关联跳转使用共用内联 SVG；助理入口统一使用绿色；增强项目卡与今日任务辅助文字的可读性 |
| 无数据库预览 | 新增独立本机预览入口，加载真实前端和已有虚构示例；无需 MySQL、`.env`、依赖安装或 Python；编辑暂存在预览服务内存，Agent 为明确标注的固定示例交互 |

取消等待复用现有 AbortController，中止浏览器等待并忽略迟到结果；上游模型是否停止计算由服务端决定。原话保留在本次会话内存中，计划仍在用户确认后通过原有通道保存。

## 无数据库本地预览

在项目根目录执行 `node scripts/preview-ui.mjs`。浏览器访问 **http://127.0.0.1:4173/#/today**，保持启动终端运行。也可使用 `npm run preview:ui`。

该模式支持当前 Node.js 20，自动提供 8 个示例项目和 40 个示例任务，便于查看首页、Today、计划、Review、任务详情及 Agent 方案卡。交互变化仅保存在预览服务内存中，点击顶部“重置示例”或重启服务恢复；固定示例方案支持确认与撤销。真实模型、语音转写等功能使用完整后端。

## 主要修改文件

| 文件 | 用途 |
| --- | --- |
| [life-planner.js](../public/life-planner.js)、[life-home.js](../public/life-home.js) | 今日任务筛选、完成展示、详情入口、输入区与录音计时 |
| [life-core.js](../public/life-core.js)、[agent-interaction.js](../public/agent-interaction.js) | 撤销状态同步、方案卡反馈及等待期间的操作保护 |
| [life-conversation.js](../public/life-conversation.js)、[life-conversation.css](../public/life-conversation.css) | 输入定位、长对话滚动、等待计时、取消与重试 |
| [ui-polish.js](../public/ui-polish.js)、[ui-polish.css](../public/ui-polish.css) | 首页主次布局、Review 日历、任务展示及统一样式 |
| [voice-dashboard.js](../public/voice-dashboard.js)、[voice-dashboard.css](../public/voice-dashboard.css) | 统计口径、助理弹窗控件、内容宽度与入口样式 |
| [product-shell.js](../public/product-shell.js)、[product.css](../public/product.css) | 主导航、底栏图标与基础布局 |
| [navigation.css](../public/navigation.css)、[demo-ui.js](../public/demo-ui.js) | 面包屑和顶栏的移动端断点 |
| [ui-icons.js](../public/ui-icons.js)、[bootstrap.js](../public/bootstrap.js) | 新增共用 SVG 图标，并接入现有脚本加载顺序 |
| [ui-feedback.test.mjs](../tests/ui-feedback.test.mjs) | 新增前端状态与交互反馈回归测试 |
| [preview-ui.mjs](../scripts/preview-ui.mjs)、[ui-preview.js](../public/ui-preview.js) | 无数据库预览服务及独立页面适配 |
| [package.json](../package.json)、[README.md](../README.md)、[ui-preview.test.mjs](../tests/ui-preview.test.mjs) | 预览命令、启动说明和本机 HTTP 验证 |

## 验证结果

最近一次代码验证结果如下：

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 语法、入口资源与静态构建 | `node scripts/check-frontend.mjs --build` | 通过，检查 105 个 JavaScript 文件及入口资源引用 |
| 对话卡片、交互反馈与无数据库预览 | `node --test tests/life-conversation-card.test.mjs tests/ui-feedback.test.mjs tests/ui-preview.test.mjs` | 21/21 通过 |

静态构建输出位于 `.local/build/public/`。

回归覆盖 Today 完成与恢复、长列表展开、Review 统计范围、弹窗输入定位、确认与撤销、撤销失败和重复请求保护、滚动位置保持、等待计时、取消后的迟到响应、新旧请求并发、自动重试及“回到最新”。

无数据库预览已通过本机 HTTP 检查：首页返回 200、预览适配脚本已注入、8 个示例项目和 40 个示例任务可读取。测试还覆盖前端资源加载、示例编辑与重置、固定方案预览、确认及撤销。

上述回归使用内存数据、模拟请求及本机预览 HTTP 接口；真实数据库及模型服务的端到端联调不包含在本次验证中。

## 待完成的视觉验收

本次自动化预览工具未连接到可用浏览器，尚未取得实际页面截图。以下项目需在项目启动后打开网页验收：

- 在 1366×768、1440×900 下检查首页双栏、内容宽度、标题对齐和首屏主次。
- 在 390×844、720×900 下检查上下布局、顶栏换行、底栏安全区，以及到期提醒和保存提示的避让。
- 使用长任务名、空数据、10 条今日任务及多轮对话，检查换行、展开、滚动和“回到最新”。
- 检查长等待、取消、重试、确认、撤销、Esc、点击遮罩和浏览器返回的实际交互反馈。
