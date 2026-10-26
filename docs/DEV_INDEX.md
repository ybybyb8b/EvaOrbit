# EvaOrbit 开发导航

本页只索引长期有效的结构、依赖与设计决定。新任务先定位模块，再读取对应入口及必要的详细文档；无需通读全部文档。架构、职责或重要依赖变化时更新本页，普通 Bug 修复和小幅 UI 调整无需更新。任务、验收和开发进度继续由 Project 系统管理。

模块名也是新聊天标题的统一用名，格式为 `模块｜具体任务`。Food 指 Food & Drink，Memory 包含 Memory Graph；Training 虽位于 Health 页面，仍可独立命名。跨模块工作可用 Core 或 Architecture，后者只是标题归类。

## 本地业务在线读写

本地 React 当前在 Tracker 离线同步之外接入统一的 [在线业务请求层](LOCAL_ONLINE_BUSINESS.md)：原版表单通过账户绑定的 `BusinessRequestContext`、平台 `businessRequest` 与 Native `business.request` 使用既有 API；其余模块只在联网时保存，下载快照和访问缓存用于离线查看，不建立新的写入队列。Web 默认 fetch 和业务服务保持原职责。服务器须发布 `onlineBusinessProtocol:1` 并明确配置测试账号，不能仅靠 UI 解除只读；发布契约、已授权的 Media 迁移与独立 API 发布/回退记录见该文。

本地缺图仅退化到占位图，不得阻断业务快照；认证失败、损坏图片及容量越界仍拒绝。表单首次打开优先使用已下载数据，不等待在线候选请求。Tracker 的记录增删改继续使用独立副本；整个 Tracker 的永久删除单独走测试账号在线白名单 DELETE，确认后先同步并检查该 Tracker 自身待提交操作，不重放其他模块队列。修复与验收边界见 [本地版集中验收修复](LOCAL_ACCEPTANCE_FIXES.md)。

下方各模块的“只读阶段”说明保留其 GET 快照、缓存容量与原始迁移边界；当前真实账户的交互写入以本节为准。Home 跨模块链接经本地路由适配；系统权限写入、Eva/Graph 和 Tracker 高级设置仍未因此开放。

## 模块速查

| 统一名称 | 职责与页面入口 |
| --- | --- |
| [Core](#core) | 数据访问、认证、全局 UI、时间、缓存与备份 |
| [Home](#home) | `/`：日历、每日聚合、提醒与今日一记 |
| [Food](#food) | `/food-drink`、`/food`、`/drinks/history`、`/food/places`、`/food/library` |
| [Health](#health) | `/health`：睡眠、体重、能量、周期与健康记录 |
| [Training](#training) | `/health?view=training`：训练记录与循环计划 |
| [Lucius](#lucius) | `/lucius`：状态、动态、评论、日记与 Case |
| [Memory](#memory) | `/memo`、`/memo/graph`、`/memory`：叙事、图谱与旧记忆 |
| [AI](#ai) | `/ai`：想想、Persona、Provider 与 Model |
| [Insights](#insights) | `/insights`：报告、证据、不可变版本与只读分析上下文 |
| [Inbox](#inbox) | `/inbox`：捕获、处理与转换 |
| [Tasks](#tasks) | `/tasks`：待办及其提醒规则 |
| [Trackers](#trackers) | `/trackers`：自定义观测、属性、记录与目标 |
| [Calendar](#calendar) | Home 时间线、日历解释与 Apple Calendar 导入 |
| [Notifications](#notifications) | `/notifications`、`/settings/notifications`：统一提醒与投递 |
| [Cats](#cats) | `/cats`：猫咪、健康护理、例行事项与食品库存 |
| [Relations](#relations) | `/relations`：人物、交往、往来与人物笔记 |
| [Media](#media) | `/media`：影视收藏、系列与观看历史 |
| [Subscriptions](#subscriptions) | `/subscriptions`：订阅、续费、付款与价格历史 |
| [Projects](#projects) | `/projects`：项目与开发事项进度 |
| [Chronicle](#chronicle) | `/chronicle`：按日期保存的纪事 |
| [MCP](#mcp) | `/api/mcp`：对外业务资源与操作契约 |
| [Native](#native) | iOS Host、桥接、HealthKit、EventKit 与原生同步 |

下文列主要表和接口，不是完整 schema。MCP 名称指通用工具的业务 `resource`，不代表直接数据库 CRUD。字段及能力以当前实现为准：`src/lib/types.ts` → `src/lib/repositories/types.ts` → Services / Repository → migrations。详细文档保留原专题内容，不在此复制部署步骤或验证日志；早期 README、PROJECT_STATUS、FOOD_SYSTEM 中的状态与旧工具示例不作为当前能力清单。

## Core

- **分区滑动**：[use-section-swipe.ts](../src/components/use-section-swipe.ts) 统一触摸方向锁定、系统边缘保留、横向滚动控件避让和滑动后的误点抑制；页面声明分区顺序、切换回调与专属排除选择器。Subscriptions、Tracker、Notifications、猫咪详情、Lucius 主页、Tasks 列表／月历和 Project 视图按需接入；编辑表单或模态弹层打开时暂停，不注册全局页面手势，也不把筛选条件当作视图。

- **下拉刷新**：[pull-to-refresh-core.tsx](../src/components/pull-to-refresh-core.tsx) 共享手势、阻尼、阈值和提示；Web 包装失效缓存并刷新路由，本地 [适配器](../src/local-trackers/pull-to-refresh.tsx) 调用 [refresh.ts](../src/local-trackers/refresh.ts) 中当前挂载模块注册的既有加载器，不重载文档、不模拟网络恢复或前台事件。本地 Host 关闭原生刷新控件和滚动回弹，避免露出网页外背景；普通在线 Host 保持原行为。
- **入口**：[App shell](../src/components/app-shell.tsx)、[Form Sheet](../src/components/form-sheet.tsx)、[全局样式](../src/app/globals.css)、[Settings](../src/app/settings/)、[Services](../src/lib/services/)、[Repository](../src/lib/repositories/index.ts)、[SQLite schema](../src/lib/db.ts)、[Postgres migrations](../supabase/migrations/)。
- **数据与接口**：`ui_preferences` 保存界面及相关偏好；认证位于 `src/lib/supabase/`；偏好 API 位于 `src/app/api/preferences/`。备份入口 `/api/data-backup/export`，表白名单与格式以 [data-backup.ts](../src/lib/data-backup.ts) 为准。
- **边界**：页面/API/AI/MCP 复用业务服务与 Repository；生产为 Supabase Auth + Postgres RLS，SQLite 为本地后备。请求身份和缓存必须按账户隔离；Secret 只在服务端加密处理。沿用全局组件、主题与交互，不为局部调整引入新体系。
- **公共纯函数**：客户端与本地 React 的错误消息解析统一走 [response-error.ts](../src/lib/response-error.ts)，不依赖 Next 或自动重试请求；服务端列表参数复用 [api.ts](../src/lib/api.ts) 的 `optionalLimit` / `optionalEnum`，由路由显式保留数量上限、空白处理和业务枚举。日期平移复用 `time.ts` 的 `shiftDate`。
- **共享外观**：[fonts.css](../src/app/fonts.css) 统一 Web／本地的字体文件与注册；[appearance-preferences.ts](../src/lib/appearance-preferences.ts)、`LocaleController` 统一偏好读取、应用和持久化，`ThemeController` 统一系统外观及既有 Native loading 适配。两端使用同一 [AppearanceSettings](../src/components/appearance-settings.tsx)；Web 沿用偏好 API，本地只写设备持久存储，不进入业务 outbox。首次本地预览以英语／August 为基准，保留已有显式选择；Web 默认值不变。旧字体键 `ibm` 继续对应 August。
- **共享设置**：[SettingsDirectory](../src/app/settings/settings-directory.tsx) 由 Web 注入链接、本地注入导航，统一设置目录；[SettingsWorkspace](../src/local-trackers/settings-workspace.tsx) 复用外观、生活日、日历解读、AI 和导出卡片。生活日/日历规则经 [在线配置白名单](../src/lib/settings-configuration-request.ts) 与账户绑定 Bridge 保存，不缓存或进入 outbox，服务端 `settingsConfigurationProtocol:1` 就绪后启用。原生健康/日历/通知仅读取状态与来源，不开启业务同步；通知规则、云端完整备份与旧 Memory 仍通过 Web 管理。详见 [Settings 阶段](SETTINGS_LOCAL_SHARED.md)。
- **操作反馈**：Web 与本地 React 均挂载 [ErrorFeedbackProvider](../src/components/error-feedback.tsx) 和 [ActionToastViewport](../src/components/action-toast.tsx)。提交/页面错误通过 `ErrorNotice` 显示常驻顶部条幅，向上滑动或关闭可收起，来源卸载/错误清除时移除；同文案合并收起，具体字段校验可用 `inline`。成功胶囊在保存成功后触发，本地保存明确标为“已保存到本机”；同步冲突仍保留专用处理面板。组件内候选加载、字段校验等局部提示保留现场语境，尚未全部迁移。
- **共享记录入口**：[bottom-log-core.tsx](../src/components/bottom-log-core.tsx) 统一页面动作注册、最新回调及过期清理；Web 包装注入 Next 路径，本地 Provider 提供模块路径，两端共用底栏、Log 触发器、选择器及 [菜单定义](../src/components/quick-log-options.ts)。本地 [Universal Log](../src/local-trackers/quick-log.tsx) 与 Tracker 页面经 [tracker-session.ts](../src/local-trackers/tracker-session.ts) 共用会话 Store、字段校验和独立同步队列；首页向表单传递所选日期，一键快速记录沿用当前时间语义。其他模块复用原表单，明确授权的测试账户通过统一在线请求层保存，离线只读适配仍作为读取后备。`FormPreview` 只提供验收状态，具体模块仍须显式拦截提交、删除及未经适配的读取；不能仅凭禁用保存按钮认定安全。
- **共享导航**：[app-navigation.tsx](../src/components/app-navigation.tsx) 统一 Web 与本地 React 的侧栏菜单、图标、选中状态及手机抽屉（焦点约束、Escape、遮罩关闭和关闭后焦点恢复）。Web 保留全部入口、认证退出和系统协调器，本地仅注入已迁移模块链接；Home/Settings 继续复用底栏，本地不再维护顶部模块按钮。
- **本地数据状态**：[DownloadStatusProvider](../src/local-trackers/download-status.tsx) 将各业务加载器的下载时间、忙碌、失败及完整性投影到统一 Header 云朵入口，不另发请求，不把快照下载称为离线写同步。Tracker 保留独立副本状态与冲突处理。账户卡片两端复用 [AccountSettings](../src/components/account-settings.tsx)，入口归 Data & Backup；[数据与同步](../src/app/settings/data-sync/page.tsx) 是两端统一管理入口，本地 [LocalSyncManager](../src/local-trackers/sync-manager.tsx) 读取各账户快照状态、按两板块并发更新，Tracker 独立队列/冲突控制集中在其详情中；设置目录不再单列账户或 Tracker Sync。模块能力由 [sync-modules](../src/lib/sync-modules.ts) 明确声明，不能用 UI 开关伪装尚无协议的离线写入。
- **Header 与返回契约**：两端复用 [NavigationBackControl](../src/components/navigation-back-control.tsx)，Web 保留 `PageBackButton` 的历史/fallback 语义；本地壳层管理返回，详情仅注册动作，账户操作归 Settings。新模块不再自画返回按钮，现有模块的批量迁移边界见 [统一 Header](SHARED_NAVIGATION_HEADER.md)。
- **时间与缓存**：[time.ts](../src/lib/time.ts) 与 [validation.ts](../src/lib/validation.ts) 统一日期处理；未知时间保留日期锚点及 explicit-time 标记。生活日分界由 [life-day.ts](../src/lib/life-day.ts) 和 [服务](../src/lib/services/life-day.ts) 计算循环完成日期，不把所有业务日期统一平移。新增可缓存 API 时同时检查 [cache-policy.ts](../src/lib/cache-policy.ts) 的读取白名单与依赖失效。
- **详文**：[开发规则](../AGENTS.md)、[部署](../DEPLOYMENT.md)、[客户端缓存](CLIENT_PAGE_CACHE.md)、[备份与本地恢复](DATA_BACKUP.md)、[表单体验](FORM_INPUT_EXPERIENCE_REVIEW.md)。

## Home

- **共享界面与只读 Host**：[HomePageView](../src/components/home-page-view.tsx)、[HomeCalendarTimeline](../src/components/home-calendar-timeline.tsx)、[DueRemindersView](../src/components/due-reminders-view.tsx) 同时供 Web 和本地 React 使用；Web 包装注入 Next 导航、Log 和规则编辑器。本地 [HomeWorkspace](../src/local-trackers/home-workspace.tsx) 使用账户隔离快照，表单复用在线业务请求，跨模块链接由 [本地路由](../src/local-trackers/routes.tsx) 转入已迁移模块。
- **安全读取边界**：Host 只使用 `/api/native/home-readonly/{day|month|due}/{date|month|current}`；服务显式跳过订阅自动补账和药物提醒校准，Repository 进一步限制为审计过的读取方法。旧 Home GET 有补账副作用，不能作为只读回退。只读接口独立于 Tracker 同步协议及迁移；当前支持最近七天和访问过的日期缓存，缺失日期明确提示，非全量历史离线。
- **职责与入口**：[page.tsx](../src/app/page.tsx)、[home-calendar-timeline.tsx](../src/app/home-calendar-timeline.tsx)、[home-day 服务](../src/lib/services/home-day.ts)、[timeline 服务](../src/lib/services/timeline.ts)。
- **数据与接口**：`/api/home-day`、`/api/timeline`；读取 Calendar、Tasks、Food/Drink、Trackers、Health、Cats、Relations、Subscriptions 等原始记录。今日一记使用 `daily_journal_entries` 与 `/api/daily-journal`，服务为 [daily-journal.ts](../src/lib/services/daily-journal.ts)。
- **依赖与决定**：日/月摘要和时间线由原模块聚合，Home 不另存一套业务记录；编辑仍走所属模块。睡眠摘要复用 Health，日历餐次解析复用 Calendar；Home 快照与全局缓存共享账户隔离存储。
- **详文**：[客户端缓存](CLIENT_PAGE_CACHE.md)、[睡眠与 Calendar 窗口](HEALTHKIT_SLEEP.md)。

## Food

- **本地只读阶段**：[FoodWorkspace](../src/local-trackers/food-workspace.tsx) 复用总览、记录列表，以及原版 Places / 地点详情 / Library 组件和表单。[FoodDataProvider](../src/components/food-data-context.tsx) 注入只读数据与导航；[本地读取适配](../src/lib/food-local-reader.ts) 将账户快照投影成既有页面读取契约。SQLite / IndexedDB 缓存近 30 天记录、最多 200 个地点和 100 个库条目，以及按访问下载的有界详情/参考；不等于全量历史离线。`/api/native/food-readonly` 及其目录/详情子路由通过 Repository 白名单读取，生产发布与真机验收另行完成。共享 Log 核心、表单预览、缓存限制与回退见 [阶段说明](FOOD_LOCAL_READONLY_POC.md)。

- **职责与入口**：[共同主页](../src/app/food-drink/)、[Food / Places / Library](../src/app/food/)、[Drinks](../src/app/drinks/)；服务入口 [food.ts](../src/lib/services/food.ts)、[drink.ts](../src/lib/services/drink.ts)、[food-catalog.ts](../src/lib/services/food-catalog.ts)、[food-drink-home.ts](../src/lib/services/food-drink-home.ts)。
- **数据与接口**：`food_logs`、`drink_logs`、`food_places`、`food_dishes`（含饮品菜单）、`food_library`、`drink_limits`；`/api/food/*`、`/api/drinks/*`、`/api/food-drink/home`。MCP：`food_log`、`drink_log`、`food_place`、`food_dish`、`food_library`、`drink_limit`。一条 Food 代表一顿饭，可关联多个来源；只读 `food_place_ids` 从用餐地点、菜品所属店铺、食品快照来源去重派生，单店每餐计一次。
- **依赖与决定**：Food / Drink 独立存储，共享来源与候选；共同主页负责 Brief、入口和 Limits，行为发现进入 Insights，能量分析由 Health 负责。食品可显式归属一个 Place，菜单可关联 Library 营养参考；历史消费关联不证明独占归属，不据此猜填。营养快照保留历史基准；未知食用重量/饮用量保持空，包装容量不等于实际摄入。日历推导的用餐时间不覆盖原始时间。
- **详文**：[信息架构](FOOD_DRINK_INFORMATION_ARCHITECTURE.md)、[食用量与营养快照](FOOD_CALCULATION.md)、[Places kind/scope](FOOD_PLACES_SOURCE_MODEL.md)。后者的早期“商品关系仅由记录派生”不覆盖当前目录归属规则，须同时看 [目录来源迁移](../supabase/migrations/202610100002_food_catalog_sources.sql) 与当前 catalog 服务；旧记录字段的兼容整理见 [精简迁移](../supabase/migrations/202610130003_simplify_consumption_records.sql)。

## Health

- **本地只读阶段**：[HealthWorkspace](../src/local-trackers/health-workspace.tsx) 复用原 Health 内容、各分区及表单；[HealthDataProvider](../src/components/health-data-context.tsx) 注入快照读取与导航。新增 `/api/native/health-readonly` 经 Repository 白名单跳过补账/提醒校准；独立 SQLite/IndexedDB 缓存8 MiB，不修改旧队列。范围、验收和发布边界见 [Health 本地阶段](HEALTH_LOCAL_READONLY_POC.md)。

- **职责与入口**：[health/](../src/app/health/)、[health-dashboard.ts](../src/lib/health-dashboard.ts)；服务为 [health.ts](../src/lib/services/health.ts)、[sleep.ts](../src/lib/services/sleep.ts)、[weight.ts](../src/lib/services/weight.ts)、[nutrition.ts](../src/lib/services/nutrition.ts)、[period-medication.ts](../src/lib/services/period-medication.ts)。
- **数据与接口**：`health_records`、`weight_records`、`weight_settings`、`menstrual_periods`、`menstrual_flow_records`、`medication_presets`、`medication_dose_events`、`daily_nutrition_summaries`、`healthkit_daily_energy`、`healthkit_read_samples`；`/api/health/*`、`/api/nutrition/daily` 及其 history。MCP：`health_record`、`nutrition_daily`、`daily_energy`；不据页面功能推定其他资源已开放。
- **依赖与决定**：摄入实时汇总 Food + Drink，手工能量可覆盖 HealthKit，清空覆盖后回退；无消耗数据时能量差未知。Calendar 只提供 Sleep Window，不能冒充实际睡眠。训练使用下节独立服务；周期用药提醒投影到统一 Reminder。
- **详文**：[HealthKit Sleep](HEALTHKIT_SLEEP.md)、[体重样本合并](HEALTHKIT_WEIGHT_MERGE.md)；HealthKit 与经期同步涉及 Native 时先读 [维护契约](IOS_NATIVE_MAINTENANCE.md)。

## Training

- **动作快捷填写**：[training-session.ts](../src/lib/training-session.ts) 从现有训练历史生成最近动作参数和上次清单，Web/本地表单共用“一次填写、历史复用”；单／双侧与每组次数/时长保存在原 `target` 文本中，旧记录兼容。训练内容以动作清单为主，自由文本和完成进度按需展开，不新增动作库、独立偏好表或健康 MCP 输出。

- **Apple Health Workout**：复用 Native readChanges / SQLite outbox，在 `training_logs` 以账号＋Workout UUID 幂等保存原始运动 JSON，与 `training_content`、部位、老师、课程、备注及动作快照分开。Universal Log 可选待补充训练；Health、Calendar/Timeline 共用一条记录。删除保留墓碑防复活；同步不推进计划、不累计每日能量。Health 有界快照包含待补充候选，部署及真机边界见 [Workout 同步](HEALTHKIT_WORKOUTS.md)。

- **职责与入口**：[training-section.tsx](../src/app/health/training-section.tsx)、[计划编辑器](../src/app/health/training-plan-editor.tsx)、[training 服务](../src/lib/services/training.ts)、[training-plan.ts](../src/lib/training-plan.ts)。页面属于 Health，没有独立 `/training` 路由。
- **数据与接口**：`training_logs`、`training_plans`；`/api/health/training`、`/api/health/training/plan`、`/api/health/training/plan/complete`；MCP `training_log` 只对应记录。
- **依赖与决定**：每账户一份循环计划，按训练日顺序推进，不按日历自动跳日；完成操作原子保存记录并推进，带版本冲突检查和请求幂等键。普通记录 CRUD 不承担计划推进；训练记录进入 Health 与 Timeline。
- **填写与自主训练**：日志按老师、课程、动作名称分别提供历史候选，不再应用整组 Recent & Common 预设。训练日 JSON 可带轻量动作清单（名称、可选目标组数、次数/时长文本）；日志的可选 `session_details` 保存当次计划参考、动作组数进度与视频完成状态的独立快照。课程与备注记录实际情况；无动作库、逐组重量或热量推算。Web 与本地 Health 共用表单与在线业务请求，MCP `training_log` 保持原字段兼容并可选读写 `session_details`。
- **依据**：无单独专题文档；查 [计划迁移及事务](../supabase/migrations/202610150001_training_plans.sql)、[计划单测](../src/lib/training-plan.test.ts)、[SQLite 集成测试](../scripts/training-plan-sqlite.test.mjs)。

## Lucius

- **本地只读阶段**：[LuciusProfile](../src/app/lucius/lucius-profile.tsx) 与原日记/案底组件在 Web、Host 共享；缓存状态、动态/评论、日记和案底，图片从 bundle 加载，全部业务写入及通知停用。Eva 聊天仍不接入；见 [阶段说明](WORKSPACES_LOCAL_READONLY_POC.md)。

- **职责与入口**：[lucius/](../src/app/lucius/)、[lucius 服务](../src/lib/services/lucius.ts)。
- **数据与接口**：`lucius_state`、`lucius_posts`、`lucius_post_comments`、`lucius_diary_entries`、`lucius_cases`；`/api/lucius/*`；MCP `lucius_state`、`lucius_post`、`lucius_post_comment`、`lucius_diary`、`lucius_case`。
- **依赖与决定**：状态/动态和 Lucius 新评论经 Notifications 通知，投递失败不回滚已保存内容；Case 复发使用原子业务操作。状态仅保留 status/mood，已退役的 `current_note` 兼容列只能为空，不恢复为内容入口。生活近况 Memo 属于 Memory，不复制进状态表。
- **详文**：[通知触发边界](../src/lib/push/README.md)、[Bark 通道](BARK_NOTIFICATIONS.md)、[MCP 契约](../src/lib/mcp/README.md)。

## Memory

- **职责与入口**：[Memo](../src/app/memo/)、[Graph](../src/app/memo/graph/)、[旧 Memory](../src/app/memory/)；服务为 [memo.ts](../src/lib/services/memo.ts)、[memory-graph.ts](../src/lib/services/memory-graph.ts)，旧记忆经 [evaorbit.ts](../src/lib/services/evaorbit.ts)。
- **数据与接口**：叙事 `memos` → `/api/memos`、MCP `memo`；旧记忆 `memories` → `/api/memories`；Graph `memory_entities`、`memory_facts`、`memory_sources`、`memory_fact_candidates` → `/api/memory-graph` 及 candidates；MCP `memory_entity`、`memory_fact`、`memory_source`。
- **依赖与决定**：Graph 为 owner-scoped Entity → Fact → Source；不把 Persona、政策或 Memo 正文迁进去。自动候选经人工提升后才参与召回；正式 v0.2 Fact/Source 与替代链事务写入。Entity 合并保留重定向，Fact 撤销与现实有效期不同。AI 接收有来源的不可信召回上下文，召回失败不阻断回答；候选审核路径不等于通用 MCP 已开放该能力。特定近况 Memo 的内容更新会触发 Lucius 通知。
- **详文**：[Memory Graph](MEMORY_GRAPH.md)、[MCP 兼容与生命周期](../src/lib/mcp/README.md)、[Memo 通知条件](../src/lib/push/README.md)。

- **Memo 本地只读**：[MemoWorkspace](../src/local-trackers/memo-workspace.tsx) 复用 Web 列表、详情和 [MemoEditor](../src/app/memo/memo-editor.tsx)，通过 [MemoDataProvider](../src/components/memo-data-context.tsx) 注入账户快照 GET/导航。既有纯 GET 下载最近更新 100 条，保存/归档/删除禁用，图谱不在本阶段。范围、缓存和回退见 [Memo 只读阶段](MEMO_LOCAL_READONLY_POC.md)。

## AI

- **开发版 AI 配置**：开发版设置直接复用 [AiProvidersSettings](../src/app/settings/ai-providers-settings.tsx)，通过 `settings.aiConfiguration` 在线管理 Provider 和模型；不包含 Eva 聊天。白名单、账户绑定与服务端协议检查由 [AI 请求契约](../src/lib/ai-configuration-request.ts)、Native Controller、认证 proxy 共同执行。密钥仅临时驻留表单，请求不缓存、不进入业务 outbox；断网清除未提交密钥。旧服务端缺少账户安全协议时拒绝操作。

- **职责与入口**：[ai/](../src/app/ai/)、[chat API](../src/app/api/ai/chat/route.ts)、[persona.ts](../src/lib/persona.ts)、[ai-tools.ts](../src/lib/ai-tools.ts)、[Provider 设置](../src/app/settings/ai-providers-settings.tsx)。
- **数据与接口**：`chat_sessions`、`chat_messages`、`ai_settings`、`ai_providers`、`ai_model_configs`；`/api/ai/*`。
- **依赖与决定**：Persona 从 SELF_PERSONA、偏好、时间与动态上下文组装；业务 Tool Calling 复用服务，Graph 负责事实召回。界面昵称/头像不改变消息 role 或 Persona；Key 归 Provider，Model 引用 Provider，密钥不发送给客户端。内置聊天工具与远程 MCP 是不同入口，勿混用旧工具名。
- **详文**：[Persona 内容](../SELF_PERSONA.md)、[README 架构与密钥](../README.md)、[部署配置](../DEPLOYMENT.md)。

## Inbox

- **职责与入口**：[inbox/](../src/app/inbox/)、[inbox 服务](../src/lib/services/inbox.ts)；表 `inbox_items`，API `/api/inbox` 及 convert，MCP `inbox`。
- **依赖与决定**：待整理捕获与长期内容分开；现有 convert 目标是 Task 或旧 Memory（`memories`），不会直接生成 Memo/Graph；转换后保留原项及处理状态、目标引用。
- **契约**：[MCP 边界](../src/lib/mcp/README.md)；转换行为以服务为准。

- **本地只读**：[InboxWorkspace](../src/local-trackers/inbox-workspace.tsx) 复用 Web 列表/筛选和捕获表单，经 [InboxDataProvider](../src/components/inbox-data-context.tsx) 读取账户快照。既有纯 GET 下载最多500条，行内/Log 表单只预览，处理/归档/恢复/删除禁用；不保证完整历史。边界与回退见 [Inbox 只读阶段](INBOX_LOCAL_READONLY_POC.md)。

## Tasks

- **本地只读阶段**：[TasksContent](../src/app/tasks/tasks-content.tsx) 由 Web 路由与本地 Host 共同使用；日期、提醒和完成状态直接读取原业务投影，预览表单不完成任务、不协调提醒、不触发 EventKit。与 Projects/Lucius 共用 [WorkspaceDataProvider](../src/components/workspace-data-context.tsx) 和账户隔离快照；容量与验收见 [本地阶段](WORKSPACES_LOCAL_READONLY_POC.md)。

- **职责与入口**：[tasks/](../src/app/tasks/)、[task 服务](../src/lib/services/task.ts)；`tasks`、`task_reminders`；`/api/tasks`，MCP `task`。
- **依赖与决定**：到期日期、明确到期时间和提醒规则分别处理；模块拥有的 Reminder 由 Task 服务协调，完成/重开走业务操作。Apple Reminders 同步通过 EventKit，不能把 MCP 本地写入等同于设备同步完成；Home 聚合任务列表。
- **详文**：[MCP Task 与 Reminder 边界](../src/lib/mcp/README.md)、[EventKit 偏好恢复](EVENTKIT_ACCOUNT_PREFERENCES.md)。

## Trackers

- **职责与入口**：[trackers/](../src/app/trackers/)、[tracker 服务](../src/lib/services/tracker.ts)；`trackers`、`tracker_fields`、`tracker_entries`、`tracker_goals`、`tracker_reminders`；`/api/trackers/*`，MCP `tracker`。
- **依赖与决定**：属性 stable key/type 保持历史语义；归档保留记录，永久删除才清理数据。旧属性 DELETE 仍为归档，永久删除需显式选择。`time_range` 是自定义属性而非主记录时间，服务端重新计算时长。提醒依赖 Notifications，记录参与 Timeline。
- **详文**：[生命周期](TRACKER_SETTINGS_LIFECYCLE.md)、[时间段属性](TRACKER_TIME_RANGE.md)、[MCP 子对象操作](../MCP.md)。
- **本地客户端**：[共享 React 入口](../src/local-trackers/)、[本地工作区](../src/local-trackers/tracker-workspace.tsx)、[持久队列与状态机](../src/lib/tracker-local-store.ts)、[协议 2](../src/lib/tracker-local-contract.ts)。Web/本地共用 [登录外观](../src/components/login-surface.tsx)、`PageHeading`、Tracker 创建/记录表单、卡片内容、时间线/筛选、洞察及 [完整设置展示](../src/app/trackers/tracker-settings-view.tsx)；页面数据适配与认证传输分别保留在 Web 与本地入口。设置编辑器由 Web 注入原表单；本地真实账户现已接入独立 Tracker 编辑副本：新建 Tracker、数值/文本属性、记录增删改与基础信息修改；已有云端记录须先完成协议2版本握手再编辑。目标/提醒与认证图片仍来自独立只读快照。本轮编辑使用 `tracker_replica_state` / `replica-v1:`，旧记录和冻结 outbox 始终隔离；可在设置暂停编辑且保留本机草稿。同一IPA在服务端就绪后自动恢复同步，详见 [Tracker 编辑阶段](TRACKER_EDITABLE_REPLICA.md)。浏览器以 IndexedDB、Host 以 SQLite 原子保存记录和 outbox，创建 Tracker 与多个字段一次提交。云端事务 RPC 与数据库行版本覆盖 Web/MCP/Native 并发写入，完整快照处理删除；排序、属性管理、目标/提醒的本地写入迁移仍待后续阶段。范围与验收见 [Tracker Local-first PoC](TRACKER_LOCAL_FIRST_POC.md)。

## Calendar

- **职责与入口**：[calendar-event 服务](../src/lib/services/calendar-event.ts)、[timeline 服务](../src/lib/services/timeline.ts)、[日历解释设置](../src/app/settings/calendar-interpretation/)、[eventkit-sync.ts](../src/lib/eventkit-sync.ts)。主要 UI 在 Home。
- **数据与接口**：`calendar_events`、`eventkit_links`、`eventkit_logical_links`、`eventkit_preferences`；解释规则通过 Repository 偏好接口保存；`/api/calendar-events`、`/api/calendar-interpretation`、`/api/eventkit/*`、`/api/timeline`，MCP `calendar_event`。
- **依赖与决定**：Apple Calendar 单向导入 EO，MCP Calendar 写入只改 EO；不要套用 Apple Reminders 的同步方向。解释规则供 Sleep Window、餐次和时间线分类复用，餐次匹配结果仅派生。账户偏好和安装关联分层，重装后有歧义的列表暂停同步，不猜选。
- **详文**：[EventKit 偏好](EVENTKIT_ACCOUNT_PREFERENCES.md)、[Native 维护契约](IOS_NATIVE_MAINTENANCE.md)、[Sleep Window](HEALTHKIT_SLEEP.md)。

## Notifications

- **职责与入口**：[通知页](../src/app/notifications/)、[reminder 服务](../src/lib/services/reminder.ts)、[来源注册表](../src/lib/reminder-source-registry.ts)、[push/](../src/lib/push/)、[native-notifications.ts](../src/lib/native-notifications.ts)。
- **数据与接口**：`reminders`、`reminder_occurrences`、`notification_deliveries`、`push_subscriptions`、`meal_reminder_rules`、`bark_notification_settings`；`/api/reminders/*`、`/api/notifications`、`/api/push/*`；MCP `reminder`。
- **依赖与决定**：Tasks、Trackers、Cats、Subscriptions、周期用药、体重和餐次服务拥有各自提醒投影，统一层负责到期、完成、推迟与投递。启用 Bark 后使用主通道且不在失败时跨通道重复投递；保留 Apple 已负责的首次提醒归属。仅日期不能凭空生成提醒时间；即时 Lucius/Memo 通知与定时调度分开。
- **详文**：[Bark](BARK_NOTIFICATIONS.md)、[Web Push 与即时触发](../src/lib/push/README.md)、[原生通知维护](IOS_NATIVE_MAINTENANCE.md)。

## Cats

- **本地只读阶段**：[CatsWorkspace](../src/local-trackers/cats-workspace.tsx) 直接复用原版总览、猫咪时间线/健康/护理/档案、猫粮列表和详情；[CatsDataProvider](../src/components/cats-data-context.tsx) 注入账户快照的 GET 与导航，表单临时草稿及读取历史共享，保存/删除/护理完成/库存/头像写入均拦截。`/api/native/cats-readonly` 通过 Repository 白名单聚合，头像字节随快照缓存，原生 SQLite 与浏览器 IndexedDB 不触碰旧 outbox。边界、验收与发布/回退见 [Cats 只读阶段](CATS_LOCAL_READONLY_POC.md)。

- **职责与入口**：[cats/](../src/app/cats/)、[cats 服务](../src/lib/services/cats.ts)、[cat-routine.ts](../src/lib/services/cat-routine.ts)、[cat-food.ts](../src/lib/services/cat-food.ts)。
- **数据与接口**：`pets`、`cat_events`、`cat_symptoms`、`vet_visits`、`cat_medications`、`cat_measurements`、`cat_routines`、`cat_food_items`、`cat_food_purchases`；`/api/cats/*`；MCP `cat_pet`、`cat_record`、`cat_routine`。
- **依赖与决定**：Routine 通过 Reminder 周期执行，归档与永久删除不同；保留已生成护理记录与投递快照。猫咪删除兼容入口实际为归档。猫食品库存独立于人的 Food Library，不能合并；护理/健康事件进入 Timeline。
- **详文**：[MCP 生命周期与按 kind 字段](../src/lib/mcp/README.md)、[提醒契约](../MCP.md)。

## Relations

- **本地只读阶段**：[RelationsWorkspace](../src/local-trackers/relations-workspace.tsx) 复用原人物列表、详情和表单；[RelationsDataProvider](../src/components/relations-data-context.tsx) 注入账户快照和导航。新增 `/api/native/relations-readonly`，含认证照片、笔记、完整有界往来/余额校验，触及500行上限拒绝刷新；SQLite/IndexedDB独立缓存不触碰旧队列。边界与验证见 [Relations 本地阶段](RELATIONS_LOCAL_READONLY_POC.md)。

- **职责与入口**：[relations/](../src/app/relations/)、[relations 服务](../src/lib/services/relations.ts)；`/people` 重定向至 `/relations`。
- **数据与接口**：`relation_people`、`relation_events`、`relation_event_parties`、`relation_event_items`、`relation_event_flows`、`person_memory_notes`；`/api/relations/*`；MCP `relation_person`、`relation_event`、`person_note`。
- **依赖与决定**：人物笔记与 Graph Entity 是独立模型，不能仅凭名称合并。交往事件参与 Timeline；代垫结清以 flow ID 执行业务操作，不使用 event ID。事件 update 现有契约要求完整输入，不能当普通 PATCH。
- **详文**：[MCP 操作与限制](../src/lib/mcp/README.md)。

## Media

- **共享与本地只读**：[MediaWorkspace](../src/local-trackers/media-workspace.tsx) 复用 Web 收藏、母作品、详情和 MediaFields；Provider 仅适配读取与导航。母作品改名保留 ID，首次完成要求日期并依赖待批准的 completion RPC 迁移。账户缓存含封面和有界完整观看历史，不改旧 outbox；限制、发布和回退见 [Media 阶段](MEDIA_LOCAL_READONLY_POC.md)。

- **职责与入口**：[media/](../src/app/media/)、[media 服务](../src/lib/services/media.ts)；`media_items`、`media_series`、`media_viewings`；`/api/media/*`，MCP `media`、`media_series`。
- **依赖与决定**：收藏条目、系列和多次观看历史分别保存；封面由 [media-cover 服务](../src/lib/services/media-cover.ts) 管理，不把资源文件内嵌进备份 JSON。
- **详文**：[备份边界](DATA_BACKUP.md)、[MCP action schema](../MCP.md)。

## Subscriptions

- **本地订阅**：[SubscriptionsWorkspace](../src/local-trackers/subscriptions-workspace.tsx) 共用 Overview／Trends／Library、轮播、时间线、日期调整、详情及表单，复用分区手势。`SubscriptionsDataProvider` 注入账户快照 GET、本地导航与订阅／软件图标字节；`/api/native/subscriptions-readonly` 仅通过 Repository 白名单读取，不补记自动付款。缓存支持离线查看；写操作沿用账户绑定在线通道，不进入 outbox。容量与历史阶段见 [本地订阅](SUBSCRIPTIONS_LOCAL_READONLY_POC.md)。

- **职责与入口**：[subscriptions/](../src/app/subscriptions/)、[subscription 服务](../src/lib/services/subscription.ts)；`subscriptions`、`subscription_payments`、`subscription_price_changes`；`/api/subscriptions/*`，MCP `subscription`。
- **手动续期会员**：`mode=manual` 以 `expires_on` 管理权益，购买元数据与幂等标识存入原付款表，通过 `/api/subscriptions/:id/purchases`／MCP `record_purchase` 原子记录实际付款与有效期；不进入自动补账、固定周期推进或未来确定支出。截止日含当天，已到期为派生状态，生命周期仍保留 Active／Paused／Ended。Web／本地共享表单和展示；详见 [手动续期会员](SUBSCRIPTIONS_MANUAL_MEMBERSHIP.md)。
- **续费时间线**：总览保留品牌卡片，补充未来 30 天及未处理计划、已记录付款；日期调整复用订阅 PATCH，不补记被调整的旧计划，提醒跟随新日期，已有付款不改写。
- **软件库（Web／本地）**：`/subscriptions/library` 使用独立 `software_library` 表记录软件、自定义图标、平台、授权／获取方式及来源链接，手机四列图标网格与共享详情表单；`/api/subscriptions/library/*` 走账户隔离 Repository，纳入备份，不参与续费／支出。本地快照通过可选 `library`／`libraryIconSources` 扩展兼容旧缓存，最多 500 个软件，与订阅合计不超过 8 MiB；写入及图标上传复用 `business.request`。旧预览地址重定向至正式页。
- **依赖与决定**：自动续费的读取可补记付款并推进续费日，不视为纯无副作用查询；手工付款、跳过与启停走业务服务。提醒投影由订阅服务维护，付款参与 Timeline。
- **详文**：[MCP 读取副作用](../src/lib/mcp/README.md)、[通知通道](BARK_NOTIFICATIONS.md)。

## Projects

- **本地只读阶段**：原项目列表、详情、事项详情和表单由 [ReadOnlyWorkspace](../src/local-trackers/read-only-workspace.tsx) 注入读取与导航，保留 Done/Verified 和生命周期差异；不创建或修改事项。与 Tasks/Lucius 共用 `/api/native/workspace-readonly/:kind` 与独立缓存，见 [阶段说明](WORKSPACES_LOCAL_READONLY_POC.md)。

- **职责与入口**：[projects/](../src/app/projects/)、[project 服务](../src/lib/services/project.ts)；`projects`、`project_items`；`/api/projects`、`/api/project-items`，MCP `project`、`project_item`。
- **依赖与决定**：这里管理当前开发事项、模块、状态、结果和下一步；索引不替代进度系统。`done` 与 `verified` 分开，生命周期时间由服务端维护；写回须保留不相关内容并复用既有事项。
- **详文**：[AGENTS 的 Project 写回规则](../AGENTS.md)、[MCP 通用契约](../MCP.md)。

## Chronicle

- **职责与入口**：[chronicle/](../src/app/chronicle/)、[chronicle 服务](../src/lib/services/chronicle.ts)；`chronicle_entries`；`/api/chronicle`，MCP `chronicle`。
- **依赖与决定**：纪事保存 date、标题、Markdown 正文和来源；与 Home 今日一记、Lucius 日记、Memo 各有数据表及服务，修改时不要按“都是日记”互相替换。
- **契约**：[MCP](../MCP.md)；字段与校验以 [chronicle.ts](../src/lib/chronicle.ts) 为准。

- **共享/本地只读**：[ChronicleWorkspace](../src/local-trackers/chronicle-workspace.tsx) 通过 [ChronicleDataProvider](../src/components/chronicle-data-context.tsx) 复用原版列表、详情与 [ChronicleEditor](../src/app/chronicle/chronicle-editor.tsx)。既有纯 GET 下载最近 100 篇至账户隔离缓存；表单只预览、不写入 outbox。排版、阅读宽度及预览改进同时作用于 Web 和 Host。范围、媒体限制与回退见 [Chronicle 只读阶段](CHRONICLE_LOCAL_READONLY_POC.md)。

## Insights

- **职责与入口**：[报告页](../src/app/insights/)、[报告服务](../src/lib/services/insight-reports.ts)、[报告类型与校验](../src/lib/insight-reports.ts)、[Context service](../src/lib/services/insight-context.ts)。MCP `insight_context` 仅支持 get，ID 为 `yesterday`、`day/YYYY-MM-DD`，限已经结束的上海自然日。
- **数据与边界**：`insight_reports` 按账户/周期/起点保持稳定身份，`insight_report_versions` 保存不可变快照；`/api/insights` 与详情接口管理规则/AI 报告、证据与版本。`insight_runs` / `insight_run_attempts` 保存外部 Agent 的冻结输入、30 分钟租约、三次执行及结果引用，`/api/insights/runs` 提供只读状态查询。Postgres 仅授予账户 SELECT，受控 RPC 原子完成报告与运行；SQLite 保持对应事务及备份恢复。报告写入、执行控制与 Context 只读白名单分开。
- **依赖与决定**：复用 Food 行为规则、Tracker 字段统计与营养估算；Context 按日读取前 30 天基线，并附最多 50 个既往日报版本引用。公开覆盖限制，不调用订阅补记或独立 Web 身份 HealthKit 能量读取。Food 旧行为展示已迁移，Tracker 图表与统计保留。外部 AI 通过 MCP `insight_run` start/complete/fail 受控执行，`insight_report` 只读历史；用户选择自行配置 ChatGPT 云端 Scheduled Task，不调用 App 内模型。长期周期计算及独立本地 Host 适配未开启。
- **详文**：[Context 口径](INSIGHTS_CONTEXT.md)、[报告与 Phase 2](INSIGHTS_REPORTS.md)、[Agent 后台与 Phase 3](INSIGHTS_AGENT.md)、[用户定时任务正文](INSIGHTS_DAILY_TASK.md)。

## MCP

- **职责与入口**：[route.ts](../src/app/api/mcp/route.ts)、[server.ts](../src/lib/mcp/server.ts)、[resource-registry.ts](../src/lib/mcp/resource-registry.ts)、[服务适配](../src/lib/mcp/resource-registry.server.ts)。
- **数据与接口**：无独立业务数据表；OAuth 认证后进入当前用户 Repository 上下文，通用工具分派到前述资源与服务。
- **依赖与决定**：只注册八个通用工具，资源逐个显式注册，禁止任意表 CRUD。能力、字段、actions 和更新模式由 registry 决定；新增业务表不等于自动开放 MCP。检索不授权持久写入；个人记忆须有用户明确请求。
- **详文**：[远程 MCP 配置与契约](../MCP.md)、[服务边界与兼容限制](../src/lib/mcp/README.md)。

## Native

- **手机页面热更新**：[同网 HTTPS 开发配置](IOS_PHONE_PREVIEW.md) 复用已有 Debug 固定开发源；workflow 的 `tracker_development_url` 非空时仅允许本地 Debug 包，空值保持 Release/包内资源。Vite 显式配置证书后开放局域网 HTTPS/WSS，日用默认仍为 loopback。原 Bridge 白名单、Bundle ID、数据和签名安装链保留。
- **本地主用版收尾候选**：[LocalNativeIntegrations](../src/local-trackers/native-integrations.tsx) 只注入原生调用与 [原生 API 适配](../src/lib/native-api.ts)，复用 EventKit/通知/健康协调规则；`native.invoke`/`native.api` 验证主账号，测试账号禁止系统写入。共享 [native-routes.json](../src/lib/native-routes.json) 控制配套接口，不使用全局 fetch 替换，也不增加业务离线写队列。设置直接复用原版控件；原生结果刷新本地页面，账户切换停止旧校准。服务端 session/主账号开关与 IPA 分别发布，实际结果见 [在线业务层](LOCAL_ONLINE_BUSINESS.md)。

- **主用本地版候选**：Tracker 高级配置共享 `TrackerDetailContent`，在线业务账户通道由独立正式账户开关控制；会话过期弹层保留草稿。`navigation.openNativeSettings` 复用三项在线系统设置，账户锁定、Cookie 隔离、测试账户禁止；本地自动系统同步与真机验收尚未完成。详见 [在线业务层](LOCAL_ONLINE_BUSINESS.md)。

- **Tracker 只读验收边界**：`tracker-readonly.ts` 验证生产 GET 快照，`local-trackers/platform.ts` 和 Native bridge 的旧 commit/sync 通道继续关闭；独立编辑副本只放行新冻结队列，见 [编辑阶段](TRACKER_EDITABLE_REPLICA.md)；原生 SQLite 的独立 `tracker_readonly_cache` 不替换旧 state/outbox。`trackers.acceptanceStatus` 执行含 WAL 的自动 SQLite backup 与 quick_check。正式双向写入仍以单独批准的协议 2 部署为前提，参见 [验收记录](TRACKER_POC_VALIDATION.md)。

- **职责与入口**：[ios/EvaOrbitHost](../ios/EvaOrbitHost/)、[桥接](../src/lib/native-bridge.ts)、[同步服务](../src/lib/native-sync-service.ts)、[同步契约](../src/lib/native-sync-contract.ts)、[EventKit 自动同步](../src/lib/eventkit-auto-sync.ts)。
- **数据与接口**：`native_devices`、`native_sync_mutations`，以及 HealthKit / EventKit 各自的样本、回执与映射表；`/api/native/*`、`/api/healthkit/energy/ingest`、`/api/eventkit/*`。
- **依赖与决定**：Web 主体仍部署在 Vercel；普通 Host 加载线上页面，独立 Tracker PoC 模式加载安装包 React 资源，并经原生 SQLite/受限 bridge 读写本地业务副本。独立 SwiftUI 工程已废弃。`/api/native/sync` 使用协议 2 的 Tracker 事务同步，旧协议写入停用；HealthKit、EventKit、原生通知继续遵循各自契约。保留已验证的 macOS CI ad-hoc IPA → patched xtool → Personal Team 重签 → Windows/WSL 安装链。
- **详文**：涉及本节改动先完整阅读 [维护契约](IOS_NATIVE_MAINTENANCE.md)，再按需看 [Host Runbook](IOS_NATIVE_HOST.md)、[安装简版](IOS_IPA_INSTALL_QUICKSTART.md)、[Sleep](HEALTHKIT_SLEEP.md)、[体重合并](HEALTHKIT_WEIGHT_MERGE.md)、[EventKit 偏好](EVENTKIT_ACCOUNT_PREFERENCES.md)。
