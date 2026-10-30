# 导航收尾验收

统一入口 lifeNavigate / lifeGoHome，sidebar品牌与header Life共享逻辑。使用现有hash路由，不刷新；同页不增加history。Enter/Space与aria-label“返回首页”可用。
面包屑为稳定结构导航，最多4层；当前项span aria-current=page，上级为按钮。项目父级直达列表，不依赖Back。弹窗跳转先关闭当前详情及其历史项，避免返回冲突。
覆盖首页、计划、项目与详情、任务抽屉、记录、回顾、历史、近期安排、设置，以及记忆/AI对话/AI面板/模拟等详情。认证表单保持独立简洁布局。登录态“我”作为设置。
手机隐藏中间列表层，保留Life、重要父级、当前项；单行截断，title可看完整名称，不显示ID。隐藏旧的重复页内面包屑，未重排页面UI。项目没有暗色主题，本轮不新增主题。

实测流程：项目详情→任务抽屉→点击父级项目→Life返回首页；同页Logo不新增history；Space/Enter；浏览器后退；直接打开/刷新#/projects/{id}；390px无溢出、当前项不跳转。默认测试24通过（14项需浏览器配置跳过），另执行指定导航/登录/Guest/Agent/语音回归。

提交检查：前几轮账户/记忆/Demo等尚未提交的成果独立提交；本轮navigation.js/navigation.css/bootstrap加载和导航测试独立提交。保留迁移脚本，移除临时测试console输出。环境配置、.local数据库/备份/截图均在忽略范围，不跟踪、不推送。
