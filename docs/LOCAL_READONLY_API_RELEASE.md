# 本地只读 API 发布清单（待授权，未发布）

IPA 内置 React 界面与服务器 API 独立发布。开发分支禁用 Vercel 自动部署，push 或安装新 IPA 不会发布这些接口。独立开发版冷启动默认 Home；没有下载过 Home 时显示未下载，仍可从侧栏进入 Tracker 等模块。

## 新增只读接口

- Tasks / Projects / Lucius：`GET /api/native/workspace-readonly/tasks`、`projects`、`lucius`；有界快照，触及上限标记部分下载。
- Home：`GET /api/native/home-readonly/day/:date`、`month/:month`、`due/current`。
- Food & Drink：`GET /api/native/food-readonly`，以及 `/catalog/current`、`/place/:id`、`/item/:id`。
- Media：`GET /api/native/media-readonly`，含封面与完整有界观看历史。只读接口无新生产表；新版 Web 首次完成写入另需批准 `202610200001_media_completion.sql`。
- Relations：`GET /api/native/relations-readonly`，含人物照片和有界往来完整性校验。
- Health：`GET /api/native/health-readonly`，只聚合读取，跳过补账和提醒校准。
- Cats：`GET /api/native/cats-readonly`。
- Subscriptions：`GET /api/native/subscriptions-readonly`。

Tracker、Chronicle、Memo、Inbox 复用已有 GET 接口，不需要为只读模式新增接口。新增路由依赖对应 readonly service、Repository 及认证代码；不能只复制 route 文件。上述只读功能不要求新增数据库 migration；现有生产 schema 是否满足依赖仍需隔离环境核实。

## AI 配置的在线例外

开发版设置复用原 Provider/模型界面与 `/api/ai/providers*`、`/api/ai/model-configs/:id`；不开放聊天、会话或其他业务写入。此例外需一起发布 `/api/native/session` 的 `aiConfigurationProtocol:1` 与认证 proxy 的 `X-EvaOrbit-Account` 校验。旧服务器未声明支持时 Host/浏览器均拒绝配置请求，不能仅发布 UI 或跳过保护。API Key 只在显式在线请求中发送，服务端继续加密存储；Native 使用无磁盘缓存的临时连接及固定账户 Cookie，不保存密钥到 SQLite/IndexedDB/outbox。断网不保存草稿、不重放请求。

这些服务端改动尚未部署，仍需单独授权；没有新生产 schema。

## 发布前与验收

1. 准备独立 API 补丁，核对与生产代码差异；保持写入、旧 outbox 上传及有副作用的旧聚合 GET 回退关闭。
2. 隔离环境运行只读服务测试、双账户认证/隔离验证及生产构建，确认不触发补账或业务写入。
3. 单独获得生产 API 发布确认后再发布；本清单不构成部署授权。
4. 发布后用真实账户验证下载、缓存、离线重启及失败保留缓存。未登录请求不得泄露账户数据。
5. 服务端回退到上一部署时，保留手机安装、SQLite、缓存和未同步队列，不卸载或清库。

HTTP 404 仅显示接口不可用，不直接断定未部署；还需检查请求源、路由、资源及服务端响应。提示调整不会让缺失的 API 自动可用。默认页与 Native 提示变更需要重建并覆盖安装独立 PoC IPA；不改变正式 Web Host、Bridge、权限或签名链。
