# EvaOrbit Project Status

## 已实现

- 私人 Supabase Auth、授权邮箱限制、SSR Session、Postgres RLS，以及 SQLite 本地后备和事务导入。
- SELF_PERSONA 真实接入 System Prompt；Identity、Voice、当前时间、动态 Memory/Task、上下文与 Tools 分区组装。
- AI Conversation、Tasks、Memory 保持可用；长对话保留近期 28 条和约 45,000 字符。
- Task 极简创建、独立 Inbox 与手动/AI Convert。
- Food Log、Food Library、Drink Log、Drink Limits、Daily Nutrition Summary 的 SQLite/Postgres/Repository/Application Service/API/UI 全链路。
- Eva 可按 Tool Calling 查询、创建和修正 Food/Drink，查询汇总与限制，并操作 Inbox。
- Conversation 已支持安全 GFM Markdown、代码块复制、移动端可滚动表格，以及 User 右侧紧凑消息 / Eva 左侧开放内容的轻量布局。
- Conversation Identity 支持双方显示名称、默认/Emoji/私有图片头像、分组身份签名、显示开关和 Settings 即时 Preview；偏好与 Persona、Memory、message role 完全分离。
- 首页 Quick Actions 改为配置数据，增加轻量 Today Food；新增 `/inbox`、`/food`、`/food/library`、`/drinks` 页面。
- PWA 不缓存私人 HTML/API；Push Subscription schema、payload 类型和 Service Worker 接收边界已预留。

## 刻意未实现

- 旧会话自动摘要，目前只截断并优先保留近期消息。
- Vision 食物识别、条码、宏量营养素、健康平台、完整通知订阅与 Scheduler。
- 跨多日的复杂排名和大型可视化；当前分析以当天汇总、历史检索和饮品限制为主。
- 受本机 Edge 策略限制的可信真设备截图。

## 部署状态

代码已包含两份顺序执行的 PostgreSQL migration。云端项目创建、环境变量、迁移、SQLite 正式导入和首次 Vercel 发布仍由项目所有者确认执行，详见 `DEPLOYMENT.md`。
