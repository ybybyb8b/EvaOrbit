# Food & Drink 本地只读阶段

## 界面与平台边界

Web 与本地 Host 直接复用 `FoodDrinkHomeView`、`FoodRecordsView`、`DrinkRecordsView`、两类记录卡片，以及原有 `FoodRecordEditor` / `DrinkRecordEditor`。Places、地点详情与 Library 直接使用 `FoodPlacesView`、`FoodPlaceDetailContent`、`FoodLibraryView` 原组件，覆盖筛选、地点资料、菜品/饮品菜单、关联记录、营养库及新增/已有表单预览。Web 保留原 API、刷新、创建、编辑、删除和 Next 导航；本地通过 `FoodDataProvider` 注入只读读取与导航适配，不重写展示层。

移动底栏由 `MobileBottomNavigation` 共用原来的导航样式；`QuickLogTrigger` / `QuickLogPicker` 供 Web 与本地使用。`bottom-log-core.tsx` 共享当前页面动作注册、最新回调和过期注册清理；Web 的 `bottom-log.tsx` 仅注入 Next 路径，本地 Provider 注入模块路径。开发版通用 Log 开放 Food、Drink、Tracker 三类表单预览，地点和库页面的 Log 使用各自的新增表单，食品/饮品列表使用当前日期的记录表单；Tracker 不执行快速捕获。本地设置入口只保存外观偏好。

`FormPreview` 明确区分“表单交互验收”与业务编辑权限。现有表单可以填写临时草稿，使用同一 FormSheet、日期时间、输入、选择器和校验；保存按钮禁用，提交函数再次拦截，删除入口不挂载。本地 Food 页面可从已下载目录读取候选、店铺、菜单及营养参考；不会回退云端业务 GET。未挂本地读取 Provider 的单独预览关闭云端候选及补查。草稿关闭/重启后不保留，既不写业务 SQLite，也不进入 outbox。Web 未挂预览 Provider，原写入流程不变。后续模块仍须逐个审计 effect 和提交函数，不能只隐藏按钮。

Home 去除外层额外的左右 20px；内容和状态说明分别沿用原 `.page` 宽度，保留横向安全区。共享 Home 标题本身不改版，开发验收导航/说明仍占据顶部空间。

Home、Tracker、Food 的开发说明、缓存范围、队列检查等通过共享 `DevelopmentDetails` 默认折叠，展开后可查看或手动刷新；实际错误和待处理冲突仍直接显示。表单内只显示“预览，不会保存”的折叠摘要，完整限制说明收进详情。折叠项使用原生 details/summary，支持键盘操作。

## 数据与安全

- 新增认证、账户隔离的 `GET /api/native/food-readonly`，响应 `eo-food-readonly-v1`。独立 `withFoodReadOnlyRepository` 只允许食品记录、饮品记录、饮品限额、日历设置、日历事件五类读取方法，拒绝其他 Repository 方法。
- 快照包含原版总览与最近 30 天的记录，每类最多 500 条；达到上限标明不完整，范围外日期标为未下载，不把它当作空历史。离线总览显示快照日期；旧快照不冒充今日统计。
- 原生新增 `food.readOnlySnapshot`，仅本地 PoC 主文档可用；通过既有认证 session 和同源限定 GET 获取数据，刷新前后核对账户及 controller generation。SQLite 新增可丢弃的 `food_readonly_cache`，每账户单条、上限 8 MiB。单条原子替换，失败保留旧缓存；不改变 schemaVersion 1 业务 state/outbox 或冻结队列。
- Windows 同一 React 界面通过 Vite 运行；真实账户使用相同只读接口，IndexedDB 按账户缓存。保存时在同一事务重新检查本地账户，跨账户响应不能覆盖旧快照。没有真实账户快照时不注入示例数据。
- 目录资源为 `/api/native/food-readonly/catalog/current`，沿用 Web 服务既有上限：最多 200 个地点、100 个库条目，返回 `placesComplete` / `libraryComplete` 标明达到上限时可能不完整。地点详情、菜单和关联记录按访问下载到 `/place/:id`；所选营养参考（包括归档引用）按需读取 `/item/:id`。响应格式 `eo-food-resource-v1`，已删除对象返回明确的 `data:null`；未下载或请求失败保留缓存并显示可重试错误，不能冒充删除。
- 原生新增 `food.readOnlyResource` 与账户隔离的 `food_resource_cache`：目录资源最多 8 MiB、其他单资源 512 KiB，保留目录及最近下载的 63 个详情/参考资源，总上限低于 40 MiB。浏览器在既有 IndexedDB 中按账户、种类、ID 使用同样边界。后台刷新通过现有 `eo:client-data-changed` 只通知界面重新读取，不触发写入同步。地点详情沿用原服务的有界菜单与近期关联记录，不能视为全量历史离线。
- API、Host 与 Native Bridge 都拒绝食品业务写入；没有新增权限、entitlement、framework 或签名流程。

## 本轮验证与发布边界

已运行：类型检查、lint、Next 生产构建、本地 React 构建；只读聚合在所有业务表禁止 INSERT/UPDATE/DELETE 的 SQLite 环境读取成功。原有食品表单交互/热量计算测试继续运行。浏览器使用临时数据库生成的合成记录验证在线下载、历史表单、只读草稿、强制提交拦截、离线重开、账户不符时保留缓存、旧队列不变，以及手机/桌面宽度。

测试入口：`scripts/food-readonly.test.mjs`、`scripts/food-offline-browser.mjs`、`scripts/home-offline-browser.mjs`；新增 XCTest 检查缓存重开、账户隔离、原队列保持及写请求拒绝。Windows 无 Xcode，因此新增 XCTest 和本次真机结果仍待 macOS CI / iPhone 验收，不能用浏览器通过替代。

本地完整套件 611 项：598 通过、12 跳过、1 项失败。失败是已有的 `long-term-memory.test.ts:93`，仍按旧的 Lucius 字面 Link 匹配导航源码；本阶段不调整无关模块。食品/饮品/地点表单交互、公共 Log 生命周期、Home 安全聚合及 Food 只读安全测试通过。浏览器使用合成数据验证四个入口、地点详情/菜单/营养表单、关联导航、上下文 Log、离线重开、未下载详情提示、账户不符时保留缓存及旧队列不变；业务写请求为零。真实账户/生产 RLS 与 iPhone 键盘、安全区仍待验收。

打包后资源也已在 Chrome 中通过 Bridge 模拟器验证：启用实际构建的 `connect-src 'none'` CSP，地点、详情、Library 与新增库表单正常打开，没有 `/api` / `/eo-api` 请求，也未调用业务写 Bridge。这只验证随包 React 运行路径，不能代替真实 WKWebView、Swift SQLite 或 iPhone 验收；原生资源缓存的持久化、裁剪、账户隔离和队列保持已补充 XCTest，待 macOS 实际执行。

新增生产 API **尚未发布**，本轮不执行生产 migration；真实账户下载食品快照需在单独批准 API 发布后验收。现有 #47 IPA 不含本次功能，需要新的独立 PoC IPA。生产 EO 安装不变，仍用 `EVAORBIT_SKIP_RENEWAL=1` 覆盖安装开发版，不能卸载或清除 SQLite。

回退可覆盖安装旧 PoC；新增只读缓存表留存不影响旧版，原业务数据/队列未迁移。生产 API 回退必须保留此前已发布的 Home 只读补丁；不能从未包含该补丁的旧 main 直接发布覆盖。后续 Actions 由用户监看，代理不自动 watch。
