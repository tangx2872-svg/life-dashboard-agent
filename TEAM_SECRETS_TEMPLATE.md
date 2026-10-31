# 私密配置清单（模板）

> 这是**模板**，只列需要共享的信息类型，不包含任何真实值。
> 真实填写版本请另存为 `TEAM_SECRETS.md`（已被 `.gitignore` 忽略），
> 通过私密渠道（一对一）发给需要的组员，**不要提交到 Git，不要发群聊**。

填写状态：`[ ] 待提供` / `[x] 已提供`

## AI / LLM（规划模型）

- Provider：`AutoDL OpenAI-compatible`
- Base URL：`https://www.autodl.art/api/v1`
- API Key：`[ ] 由负责人私密提供`
- 模型（FAST 主 / 备）：`DeepSeek-V4.1-Flash` → `gpt-5.6-luna` → `GLM-5.3-Flash`
- 模型（PLANNER 主）：`gpt-5.6-luna`
- 额度/计费：`[ ] 说明是否有额度限制、是否按量计费`

## ASR / 语音服务

- Provider：`Gemini`（OpenAI-compatible 代理）
- Endpoint：`https://www.autodl.art/api/v1/gemini`
- Model：`gemini-3.5-flash`
- API Key：`[ ] 由负责人私密提供`

## 数据库（MySQL）

- Host：`[ ]`
- Port：`[ ]`
- Database：`[ ]`
- Username：`[ ]`
- Password：`[ ] 由负责人私密提供`
- 备注：生产库账号只授予 `life_dashboard` 库权限；测试库独立创建。

## Web 服务器

- 公网 IP：`122.51.80.161`
- SSH Port：`22`
- SSH Username：`ubuntu`
- 已授权公钥：见 `TEAM_ONBOARDING.md`（公钥可公开，**不能用于登录**）
- 登录方式：`[ ] 私钥文件 / 密码`（私密传递，不要放仓库）
- sudo 权限：`[ ] 说明`

## AutoDL 服务器（如另有 GPU 机器）

- Host：`[ ]`
- SSH Port：`[ ]`
- Username：`[ ]`
- 登录方式：`[ ]`
- 项目路径：`[ ]`
- GPU 型号：`[ ]`
- API 服务端口：`[ ]`
- 备注：当前线上部署**不使用 GPU**，模型全部通过 API 调用。

## 其他第三方服务

- GitHub 仓库权限（Collaborator 邀请）：`[ ]`
- HTTPS 证书（当前为 IP 自签名，位于服务器 `/etc/ssl/life/`）：`[ ]`
- 备份存放位置与保留策略：`[ ]`（当前 `/var/backups/life-dashboard/`，保留 14 天 + 每月 180 天）
- 域名 / DNS（如后续申请）：`[ ]`
- 监控/告警（如有）：`[ ]`

## 传递规范

1. 一对一私聊发送，不建群、不贴文档、不写进 PPT。
2. 组员只在本机 `.env` / `ai-backend/.env` 中使用，禁止提交。
3. 成员退出项目时，负责人应轮换对应 Key 与数据库密码。
4. 一旦怀疑泄露：立即轮换 → 再清理 Git 历史 → 通报全员（顺序不能反）。
