# Tasks / Projects / Lucius 与 AI 配置本地阶段

## 范围

- Tasks：直接共享原任务列表、日历/标签筛选、任务表单。日期未知时间保持无时间；读取现有提醒，不完成/重开、不协调系统提醒。
- Projects：原项目列表、项目详情、事项详情及表单，保留 Done/Verified、模块、优先级和生命周期；不做业务写入。
- Lucius：原个人页、动态与评论、日记及案底列表/详情/表单。头像/封面从本地 bundle 加载；不发评论、不增删改日记或案底、不触发通知。
- Eva 聊天暂不迁移。设置直接复用原 AiProvidersSettings，允许显式在线管理 Provider、密钥与模型，测试连接会访问对应服务商。

## 共享入口与存储

Web 保留 Next 路由/server loader，客户端组件接受共享 WorkspaceDataProvider。Host 由 ReadOnlyWorkspace 注入快照 GET 与本地导航、FormPreview；保存按钮禁用，提交处理器再次拦截。全局 header 负责返回，原 Web 返回行为保留。

`GET /api/native/workspace-readonly/:kind` 经独立 Repository 白名单聚合，只有 tasks/projects/lucius 三种 kind。Native Bridge `workspaces.readOnlySnapshot` 与浏览器平台都校验账户、结构及容量，先读缓存、后台刷新、失败保留缓存。独立 SQLite 表 `workspace_readonly_cache` 按 account_id/kind 分区；Windows 预览使用既有 IndexedDB，每次持久化与账户会话同事务检查。旧业务 state/outbox 不修改。

每账户每模块上限8 MiB：Tasks 最多1,000项；Projects 最多200个项目、每项目200项，总事项超过5,000时拒绝刷新；Lucius 50条动态、500条评论、100篇日记、100个案底。任何集合触及上限标记部分下载，搜索仅覆盖已下载数据。没有覆盖全量历史的承诺。Tasks 复用既有逐项提醒读取，大数据量可能触及20秒请求超时；失败保持缓存，后续有实际性能证据再批量优化。

## AI 设置在线例外

只允许 `/api/ai/providers` GET/POST、`/providers/test` POST、`/providers/:id` PATCH/DELETE、`/providers/:id/models` POST、`/model-configs/:id` PATCH/DELETE，不允许查询、任意 URL、chat、sessions 或其他写入。

Host 能力为 `settings.aiConfiguration`。每次请求验证服务端会话、账户与 `aiConfigurationProtocol:1`；请求附带预期账户，由认证 proxy 在执行 API 之前校验。Native 固定单次 Cookie，无磁盘缓存临时连接，不使用通用业务请求通道。浏览器开发代理同样限制路径和方法。

原始密钥只在当前组件内存中输入，断网事件清空并禁用表单；退出页面/切换账户卸载组件。明确在线保存才传给既有服务端加密存储；不写 SQLite、IndexedDB、localStorage 或 outbox。断线/失败不排队、不自动重放；写入结果不确定时应重新查看云端配置再手动处理。服务器只返回密钥掩码。

**服务端 session 协议声明及 proxy 账户校验必须一起发布。未发布时拒绝在线配置请求，不回退到无保护请求。** 本轮没有部署。

## 验收与回退

1. 合成数据 SQLite 测试覆盖只读 Repository、旧历史空文本、日期/提醒、项目状态、评论归属、账户/kind/损坏/容量/路径拒绝，业务表写入触发器确保下载不写数据。
2. 浏览器验收 Web 原界面与本地共享界面、强制提交拦截、320/402/1280宽度、持久浏览器重启、断网缓存、错账户/损坏快照保留、旧冻结队列、AI 在线假接口及离线密钥清除、打包 CSP/Native Bridge mock。
3. XCTest 新增源代码覆盖 SQLite 三模块缓存重开、坏数据与账户拒绝、旧队列不变、在线配置白名单；Windows 未运行 macOS XCTest，也未做 iPhone 真机验收。
4. 发布前依次审查差异、隔离环境认证验证、单独批准 API 发布、构建独立 PoC IPA、覆盖安装后验收。只读模块无需生产 migration；Media 首次完成写入所需 migration 独立处理。
5. API 可回退旧部署，缺少新协议时拒绝 AI 设置；IPA 可覆盖回退。保留数据库、缓存及冻结队列，禁止卸载/清库。正式 Web Host、CI 签名和原生权限链维持原样。

本地验证：全套644项中632通过、12项可选SQL测试因未配置其隔离运行环境跳过；lint、类型检查、Next生产构建、本地Vite构建、上述浏览器回归及 `git diff --check` 通过。Vite仍提示大于500kB的共享脚本包，真实iPhone启动/解析性能待验收；不在本轮增加拆包重构。
