# AI 访问管理

在网页「设置 → AI 访问管理」查看连接、选择功能与范围、确认授权、暂停、恢复或撤销，并查看连接的访问记录。新连接完成登录后处于待授权状态。

## 权限边界

- 连接以验签后的 `sub + client_id` 标识。共用一个 OAuth client 的 Agent 共用授权。Codex 应使用独立 client，授权时选择指定项目及项目事项的查询和详情。进度写回可单独开启，限制到允许字段和状态变化，`verified` 由用户在网页确认。
- 新 Hermes 连接可单独授予 Inbox 投递和仅限自身记录的读取。记录归属写入数据库。Tracker 权限检查目标 Tracker，任务完成使用独立操作。
- `tools/list`、`eo_resources` 和 `eo_schema` 显示本连接的能力。每次调用重新获取授权和到期状态。项目、项目事项、Tracker 和 Inbox 的查询在 Repository 应用范围后再限量或分页。详情和写入使用相同约束。
- 综合记忆和跨模块生活分析分别授权，范围按整个聚合定义。权限页提示涉及的数据域。Memory Graph 详情、Tracker 详情、提醒等资源的嵌套数据属于所选能力。订阅读取只返回已保存数据。独立提醒动作不处理会写入付款、任务进度或护理记录的其他模块提醒。
- MCP 到 Supabase 的 Data API 请求同时携带用户 JWT 和仅在服务端持有的桥接证明。PostgREST 的 pre-request 函数对 OAuth 请求验证证明，包括普通表和 RPC。原有账户 RLS 继续生效。Storage 使用独立的限制策略，迁移在现有业务 RLS 表、Realtime 发布表及私有消息表增加数据通道检查。新增业务和 Realtime 表应采用相同限制。
- 永久删除、Graph 合并与正式 Fact 写入、付款及结清留在网页端。Echo 笔记可单独授予添加或修改。MCP 记忆候选提交留待后续设计。
- 审计保留连接、资源、操作、可识别的目标 ID、时间和结果。调用前记录受理状态，完成后更新结果。审计和幂等回执不保存原始对话、内容正文或令牌。暂停和撤销以服务端状态为准，已经开始执行的调用可能完成。

## 既有连接迁移

迁移从 `auth.oauth_consents` 读取确实存在的授权。

- 已有有效 Auth 授权的 ChatGPT 客户端自动获得显式兼容权限，沿用原 client ID、MCP audience、access token 和 refresh token。用户无需重新登录或确认授权。记忆检索、日常记录、常规项目和任务操作继续可用。高风险操作，以及会写入业务的订阅读取副作用，按上述边界收紧。
- 旧 Hermes 连接在 EvaOrbit 内迁移为已撤销，并保留连接记录。旧 access token 和刷新后的 token 都无业务权限。Hermes 可用独立的新 OAuth client 再连接并单独授权，原消息通道使用独立凭据。
- 用户从管理页撤销时先持久化 EvaOrbit 撤销，再向 Supabase 撤销该连接的 OAuth grant。远端撤销失败时页面提示，EvaOrbit 拒绝状态仍然有效。

## 发布顺序

先在独立 Supabase 环境预演，再安排生产切换。应用提交本身不会执行生产迁移。

1. 查验目标项目启用 OAuth Server、Auth hook 指向 `public.evaorbit_mcp_access_token_hook`，并确认 ChatGPT client 有预期的现存 Auth 授权。记录当前应用部署与 PostgREST pre-request 设置。盘点已有依赖 OAuth 用户 JWT 直连 Supabase 的应用。激活会限制所有此类 JWT。已有其他 pre-request hook 时，先验证串联，激活脚本会拒绝覆盖。
2. 生成 32 字节随机值，使用 64 个小写十六进制字符。以服务端密钥 `EVAORBIT_AGENT_BRIDGE_KEY` 注入新部署及激活脚本的执行环境。密钥只进入服务端配置。
3. 应用 `202611180001_agent_access.sql`。这一步创建授权、审计、回执与 Auth hook，并导入已验证的旧连接。既有业务数据入口的限制由下一步显式启用。
4. 在目标数据库连接已核对、候选部署就绪后，执行 `node scripts/agent-access-activate.mjs --activate`。脚本在同一数据库事务中登记密钥摘要、增加 RLS 限制并设置 pre-request hook。激活后旧部署的 MCP 没有桥接证明，会拒绝请求。此时切换到已配置的新部署，保留原 `/api/mcp` 域名。新部署在数据库未激活时会拒绝业务调用。
5. 用切换前已经持有的 ChatGPT 凭据验证发现、Echo、综合记忆、任务和日常记录，并验证 OAuth 正常刷新。验收 Codex 仅能读取选中项目和事项。以新 Hermes 测试连接做 Inbox 投递与幂等重试，同时验证已撤销的旧 Hermes 凭据被拒绝。检查同账户及跨账户的直接 Data API 表读取、写入、RPC、私有 Storage，以及 Web 登录、Native 会话和同步。测试凭据与合成记录只用于对应环境。

## 回滚与密钥轮换

优先保留数据库边界，切回已验证支持该边界的应用版本。若没有这样的版本，暂停外部工具接入并保留普通 Web／Native 会话可用。要完整恢复旧 MCP，须单独确认恢复旧 OAuth 凭据直连数据库的权限，然后配套切回原应用并执行 [应急回滚 SQL](../scripts/agent-access-restore-legacy.sql)。脚本撤回本次安装的 Data API hook 和 RLS 策略，移除桥接密钥摘要，让 OAuth audience 恢复只对两个旧客户端签发。连接、回执、审计和 Auth 会话保留。重新切换时用已部署的桥接密钥再次执行激活，现有授权记录继续有效。

轮换桥接密钥时先激活新摘要，再部署使用新密钥的应用并验证，最后从私有表移除旧摘要。

## 隔离预演

已在一次性本地 Supabase 栈上完成预演，使用 PostgreSQL 17.11、PostgREST、Supabase Auth 和 Storage。账户、OAuth 客户端和业务数据均为测试数据。

- 切换前签发的 ChatGPT access token 在切换后读取 Echo 并投递 Inbox。原 refresh token 经真实 OAuth 续签后继续可用。旧 Hermes 的切换前凭据和续签凭据均被 MCP 拒绝。
- 真实 Data API 验证了 OAuth 直连业务表的读取、写入和 RPC 被拒绝。私有 Storage 对普通账户持有人可用，OAuth 客户端和另一个账户均无法读取该对象。
- 通过 EvaOrbit MCP 路由验证了 Codex 指定项目范围、立即撤销，以及新 Hermes 默认拒绝、只读自身提交、重复投递归并为一条记录。
- 执行应急回滚 SQL 并重新激活。实体数据、已有授权与撤销状态保留。ChatGPT 原授权继续可用。

生产切换仍需核对托管环境配置，并使用切换前持有的真实连接凭据验收。隔离预演未访问生产或 iPhone 真机。
