# Chronicle 共享界面与只读离线阶段

## 范围与共享边界

- Web `/chronicle` 与本地 `ChronicleWorkspace` 直接使用同一 `ChronicleView`、`ChronicleDetailContent`、`ChronicleEditor`、主题、August 字体及 FormSheet。Web 的路由删除后导航留在 `ChronicleDetailView`。
- `ChronicleDataProvider` 仅注入 GET、链接与下载范围；Web 默认使用原 API 和 Next Link。本地包不启动 Next 服务。
- 本轮同时改善两端的标题/摘要换行、字号、正文阅读宽度、顶部编辑入口、可见搜索状态、重试与数量上限说明。新增/编辑共用正文 Write/Preview；日期仍为 date-only，来源与原始 Markdown 不改写。
- 开发版表单只预览临时草稿：禁用保存/删除，处理器再次拒绝强制提交；不进入 outbox。诊断说明默认折叠。

## 数据、安全与限制

- 复用既有纯读取 `GET /api/chronicle`（默认最近 100 篇，包含正文）；与订阅普通 GET 不同，该读取没有自动续费或业务更新。隔离测试对所有业务表安装写入阻断触发器后验证真实 list/detail service。
- Native 网络白名单只增加精确 `chronicle` GET，映射 `/api/chronicle`。不开放按 ID 的远端查询、任意参数或写入。本地搜索/详情来自已下载记录，早于下载窗口的记录仍在云端。
- JS 与 Native 包装 `eo-chronicle-readonly-v1`，含 accountId、capturedAt、items、complete。少于 100 篇时 complete=true；恰好 100 篇保守标为窗口不完整。缓存最大 8 MiB，超限/重复 ID/无效日期或来源拒绝覆盖。
- 浏览器 IndexedDB 账户专属 `chronicle-readonly:<accountId>`；SQLite 仅新增 `chronicle_readonly_cache`。保留已有 schema version、记录、队列及备份机制。刷新前后重新验证云端身份，提交时再查本地会话；Native 同时检查会话 generation。
- Native capability `chronicle.readOnlySnapshot` 沿用 bridge v1/main-frame/本地源规则；旧 Host 缺能力时提示升级，无不安全降级。
- 本地 Markdown 使用现有安全 renderer，额外以文字替代图片并禁用链接，避免浏览器开发环境发起外部/相对路径请求。原始 Markdown 完整保留；Web 原有图片/安全链接行为不变。媒体字节离线化待后续阶段。
- 自动刷新为打开模块、恢复网络、Host 前台事件；不是后台推送或双向写同步。

## 已运行验证与待验收

- `scripts/chronicle-readonly.test.mjs`：格式/账户/边界/日期/来源/原文、只读适配器路径及方法、真实服务无业务写入。
- `scripts/tracker-platform-readonly.test.mjs`：旧 Host 能力检测、真实账户写入禁令。
- `scripts/chronicle-offline-browser.mjs`：402/900/1280 布局、共享列表/详情/搜索/表单预览、强制提交、持续浏览器配置下离线重启、账户/损坏刷新保留缓存与冻结队列、远程 Markdown 请求拦截、打包 CSP + 模拟 Native bridge 无 API fetch。
- 本轮另外对隔离 Next + SQLite 运行 Web 实际 CRUD、预览、手机/桌面浅深色浏览器验证；未读取生产账户。
- 新增 XCTest 覆盖缓存重开、账户隔离、超限失败保留原缓存、原队列不变、网络路径/写入拦截。Windows 未执行 XCTest；真实 WKWebView、键盘、安全区、iPhone 离线冷启动仍需 macOS CI 与 iPhone 16 Pro 验收。

## 发布与回退

- 本阶段不需要生产数据库 migration 或新 API。Web 排版生效仍需单独授权部署；开发版需要重新构建 IPA。未自动 commit/push/部署。
- 延续现有 CI、签名安装链、权限、HealthKit、EventKit 与通知。新增能力不添加 framework、entitlement 或权限。
- 回退至上一开发版时保留新增只读缓存表即可，旧代码忽略它；不卸载 App、不清库、不清 outbox。下载失败继续显示原缓存，无法取得可信缓存时明确提示联网下载。
- 发布不得直接部署整条 PoC 开发分支；保留既有独立 Home API 补丁，其他未部署模块 API 仍需分别确认发布。

## 本轮检查结果

- lint、typecheck、Next production build、本地 Vite production build、`git diff --check` 通过。全量 Node 测试 613 通过、12 跳过、0 失败；跳过项依赖未配置的隔离 PostgreSQL/PGlite 环境，不计作通过。头像测试首次被沙箱阻止临时文件 rename，在允许该操作的隔离环境重跑完整套件后通过。
- Chronicle 浏览器端到端、Web 隔离 CRUD、Cats 与 Subscriptions 浏览器回归通过。所有数据为合成数据，真实账户和生产 Supabase 未参与本轮验收。
- 本地 JS 主包约 1.14 MB（gzip 344 kB），仍有大 chunk 警告；未新增依赖。真实设备解析耗时、首次下载耗时及离线冷启动性能尚未实测，不据浏览器结果宣称真机通过。
- 独立 A/B Impeccable 审阅改进前 25/40；CLI 0 项，浏览器截图确认排版问题。未进行改进后重评分；归档在 `.impeccable/critique/`。
