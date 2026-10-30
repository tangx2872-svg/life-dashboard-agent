# 登录注册排查与验收

## 原因
注册接口原本要求 username/email/password，前端始终把首字段标为“用户名 / 邮箱”，注册时仍发送它作为 username。填写邮箱会因 @ 不符合用户名正则返回422。已通过旧结构请求自动复现，不声称取得了用户之前浏览器里的历史Network记录。
同时修复游客合并后 location.reload 与模态历史返回竞争：服务器已保存但网页可能仍显示原来的空数据。现读取提交后的服务器状态原地更新。

## 当前规则与兼容
POST /api/auth/register：前端只发送 email/password。邮箱trim并小写，格式验证且最多254字符；密码10–128字符。后端生成 life_ 加随机UUID的内部用户名。数据库 username/email 的 UNIQUE 约束均保留。
显式username仍兼容旧客户端，3–64位原正则不变。legacy_owner和旧用户名登录不变；登录支持邮箱或用户名，忽略账号两端空格。
重复邮箱409 + field=email + “这个邮箱已经注册过了，直接登录吧。”；重复用户名409 + field=username。无效邮箱/短密码422并返回对应field。错误密码401。服务器或网络异常前端转换成人类语言。
成功仍通过原有服务创建随机HttpOnly Cookie会话，直接进入应用；没有第二套认证体系。

## UI
440px温和绿色卡片；注册只有邮箱/密码；单主按钮，登录和体验为弱入口。label、字段级aria-describedby/aria-invalid、错误live区域、显示隐藏密码、Enter提交、loading与防重复点击、20秒超时均实现。390px实测无横向溢出。

## 访客
原IndexedDB空间与确认合并沿用。新增最多100条近期访客对话的设备保存，认证凭据类文本不缓存；确认合并时写入账号guestConversations字段，成功后才清理本地。此前从未保存过的历史对话无法补回，不包含模型内部会话状态。

## 文件
新增 public/auth-screen.js、public/auth-screen.css、tests/auth-flow.test.mjs。
修改 public/account-entry.js、index.html；server/accounts.mjs、index.mjs；tests/accounts-browser.test.mjs、agent-browser.test.mjs（适配邮箱注册）。
无数据库迁移，无旧记录重写，无应用权限变更。

## 实测
数据库SHOW INDEX验证email与username唯一。
自动化：邮箱单字段注册成功、重复邮箱、重复用户名、无效邮箱、短密码、旧用户名登录、注册后当前用户会话存在。
Chrome：注册200→进入应用→刷新恢复；重复邮箱409正文/字段提示；错误密码401；拦截网络请求后明确显示断网提示；正确密码Enter提交→刷新恢复。真实390×844截图位于.local/screenshots/auth-register-mobile.png。
游客：创建项目/任务/笔记→刷新→邮箱注册→确认合并→原地出现项目→刷新→另一浏览器邮箱登录，项目及测试对话存在。
原账户隔离、数据库、记忆HTTP及Agent浏览器回归继续通过。
