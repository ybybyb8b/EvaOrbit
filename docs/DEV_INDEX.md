# EvaOrbit 开发导航

本页只索引长期有效的结构、依赖与设计决定。新任务先定位模块，再读取对应入口及必要的详细文档；无需通读全部文档。架构、职责或重要依赖变化时更新本页，普通 Bug 修复和小幅 UI 调整无需更新。任务、验收和开发进度继续由 Project 系统管理。

模块名也是新聊天标题的统一用名，格式为 `模块｜具体任务`。Food 指 Food & Drink，Memory 包含 Memory Graph；Training 虽位于 Health 页面，仍可独立命名。跨模块工作可用 Core 或 Architecture，后者只是标题归类。

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

- **入口**：[App shell](../src/components/app-shell.tsx)、[Form Sheet](../src/components/form-sheet.tsx)、[全局样式](../src/app/globals.css)、[Settings](../src/app/settings/)、[Services](../src/lib/services/)、[Repository](../src/lib/repositories/index.ts)、[SQLite schema](../src/lib/db.ts)、[Postgres migrations](../supabase/migrations/)。
- **数据与接口**：`ui_preferences` 保存界面及相关偏好；认证位于 `src/lib/supabase/`；偏好 API 位于 `src/app/api/preferences/`。备份入口 `/api/data-backup/export`，表白名单与格式以 [data-backup.ts](../src/lib/data-backup.ts) 为准。
- **边界**：页面/API/AI/MCP 复用业务服务与 Repository；生产为 Supabase Auth + Postgres RLS，SQLite 为本地后备。请求身份和缓存必须按账户隔离；Secret 只在服务端加密处理。沿用全局组件、主题与交互，不为局部调整引入新体系。
- **时间与缓存**：[time.ts](../src/lib/time.ts) 与 [validation.ts](../src/lib/validation.ts) 统一日期处理；未知时间保留日期锚点及 explicit-time 标记。生活日分界由 [life-day.ts](../src/lib/life-day.ts) 和 [服务](../src/lib/services/life-day.ts) 计算循环完成日期，不把所有业务日期统一平移。新增可缓存 API 时同时检查 [cache-policy.ts](../src/lib/cache-policy.ts) 的读取白名单与依赖失效。
- **详文**：[开发规则](../AGENTS.md)、[部署](../DEPLOYMENT.md)、[客户端缓存](CLIENT_PAGE_CACHE.md)、[备份与本地恢复](DATA_BACKUP.md)、[表单体验](FORM_INPUT_EXPERIENCE_REVIEW.md)。

## Home

- **职责与入口**：[page.tsx](../src/app/page.tsx)、[home-calendar-timeline.tsx](../src/app/home-calendar-timeline.tsx)、[home-day 服务](../src/lib/services/home-day.ts)、[timeline 服务](../src/lib/services/timeline.ts)。
- **数据与接口**：`/api/home-day`、`/api/timeline`；读取 Calendar、Tasks、Food/Drink、Trackers、Health、Cats、Relations、Subscriptions 等原始记录。今日一记使用 `daily_journal_entries` 与 `/api/daily-journal`，服务为 [daily-journal.ts](../src/lib/services/daily-journal.ts)。
- **依赖与决定**：日/月摘要和时间线由原模块聚合，Home 不另存一套业务记录；编辑仍走所属模块。睡眠摘要复用 Health，日历餐次解析复用 Calendar；Home 快照与全局缓存共享账户隔离存储。
- **详文**：[客户端缓存](CLIENT_PAGE_CACHE.md)、[睡眠与 Calendar 窗口](HEALTHKIT_SLEEP.md)。

## Food

- **职责与入口**：[共同主页](../src/app/food-drink/)、[Food / Places / Library](../src/app/food/)、[Drinks](../src/app/drinks/)；服务入口 [food.ts](../src/lib/services/food.ts)、[drink.ts](../src/lib/services/drink.ts)、[food-catalog.ts](../src/lib/services/food-catalog.ts)、[food-drink-home.ts](../src/lib/services/food-drink-home.ts)。
- **数据与接口**：`food_logs`、`drink_logs`、`food_places`、`food_dishes`（含饮品菜单）、`food_library`、`drink_limits`；`/api/food/*`、`/api/drinks/*`、`/api/food-drink/home`。MCP：`food_log`、`drink_log`、`food_place`、`food_dish`、`food_library`、`drink_limit`。一条 Food 代表一顿饭，可关联多个来源；只读 `food_place_ids` 从用餐地点、菜品所属店铺、食品快照来源去重派生，单店每餐计一次。
- **依赖与决定**：Food / Drink 独立存储，共享来源与候选；共同主页负责 Brief、入口、Insights 和 Limits，能量分析由 Health 负责。食品可显式归属一个 Place，菜单可关联 Library 营养参考；历史消费关联不证明独占归属，不据此猜填。营养快照保留历史基准；未知食用重量/饮用量保持空，包装容量不等于实际摄入。日历推导的用餐时间不覆盖原始时间。
- **详文**：[信息架构](FOOD_DRINK_INFORMATION_ARCHITECTURE.md)、[食用量与营养快照](FOOD_CALCULATION.md)、[Places kind/scope](FOOD_PLACES_SOURCE_MODEL.md)。后者的早期“商品关系仅由记录派生”不覆盖当前目录归属规则，须同时看 [目录来源迁移](../supabase/migrations/202610100002_food_catalog_sources.sql) 与当前 catalog 服务；旧记录字段的兼容整理见 [精简迁移](../supabase/migrations/202610130003_simplify_consumption_records.sql)。

## Health

- **职责与入口**：[health/](../src/app/health/)、[health-dashboard.ts](../src/lib/health-dashboard.ts)；服务为 [health.ts](../src/lib/services/health.ts)、[sleep.ts](../src/lib/services/sleep.ts)、[weight.ts](../src/lib/services/weight.ts)、[nutrition.ts](../src/lib/services/nutrition.ts)、[period-medication.ts](../src/lib/services/period-medication.ts)。
- **数据与接口**：`health_records`、`weight_records`、`weight_settings`、`menstrual_periods`、`menstrual_flow_records`、`medication_presets`、`medication_dose_events`、`daily_nutrition_summaries`、`healthkit_daily_energy`、`healthkit_read_samples`；`/api/health/*`、`/api/nutrition/daily` 及其 history。MCP：`health_record`、`nutrition_daily`、`daily_energy`；不据页面功能推定其他资源已开放。
- **依赖与决定**：摄入实时汇总 Food + Drink，手工能量可覆盖 HealthKit，清空覆盖后回退；无消耗数据时能量差未知。Calendar 只提供 Sleep Window，不能冒充实际睡眠。训练使用下节独立服务；周期用药提醒投影到统一 Reminder。
- **详文**：[HealthKit Sleep](HEALTHKIT_SLEEP.md)、[体重样本合并](HEALTHKIT_WEIGHT_MERGE.md)；HealthKit 与经期同步涉及 Native 时先读 [维护契约](IOS_NATIVE_MAINTENANCE.md)。

## Training

- **职责与入口**：[training-section.tsx](../src/app/health/training-section.tsx)、[计划编辑器](../src/app/health/training-plan-editor.tsx)、[training 服务](../src/lib/services/training.ts)、[training-plan.ts](../src/lib/training-plan.ts)。页面属于 Health，没有独立 `/training` 路由。
- **数据与接口**：`training_logs`、`training_plans`；`/api/health/training`、`/api/health/training/plan`、`/api/health/training/plan/complete`；MCP `training_log` 只对应记录。
- **依赖与决定**：每账户一份循环计划，按训练日顺序推进，不按日历自动跳日；完成操作原子保存记录并推进，带版本冲突检查和请求幂等键。普通记录 CRUD 不承担计划推进；训练记录进入 Health 与 Timeline。
- **依据**：无单独专题文档；查 [计划迁移及事务](../supabase/migrations/202610150001_training_plans.sql)、[计划单测](../src/lib/training-plan.test.ts)、[SQLite 集成测试](../scripts/training-plan-sqlite.test.mjs)。

## Lucius

- **职责与入口**：[lucius/](../src/app/lucius/)、[lucius 服务](../src/lib/services/lucius.ts)。
- **数据与接口**：`lucius_state`、`lucius_posts`、`lucius_post_comments`、`lucius_diary_entries`、`lucius_cases`；`/api/lucius/*`；MCP `lucius_state`、`lucius_post`、`lucius_post_comment`、`lucius_diary`、`lucius_case`。
- **依赖与决定**：状态/动态和 Lucius 新评论经 Notifications 通知，投递失败不回滚已保存内容；Case 复发使用原子业务操作。状态仅保留 status/mood，已退役的 `current_note` 兼容列只能为空，不恢复为内容入口。生活近况 Memo 属于 Memory，不复制进状态表。
- **详文**：[通知触发边界](../src/lib/push/README.md)、[Bark 通道](BARK_NOTIFICATIONS.md)、[MCP 契约](../src/lib/mcp/README.md)。

## Memory

- **职责与入口**：[Memo](../src/app/memo/)、[Graph](../src/app/memo/graph/)、[旧 Memory](../src/app/memory/)；服务为 [memo.ts](../src/lib/services/memo.ts)、[memory-graph.ts](../src/lib/services/memory-graph.ts)，旧记忆经 [evaorbit.ts](../src/lib/services/evaorbit.ts)。
- **数据与接口**：叙事 `memos` → `/api/memos`、MCP `memo`；旧记忆 `memories` → `/api/memories`；Graph `memory_entities`、`memory_facts`、`memory_sources`、`memory_fact_candidates` → `/api/memory-graph` 及 candidates；MCP `memory_entity`、`memory_fact`、`memory_source`。
- **依赖与决定**：Graph 为 owner-scoped Entity → Fact → Source；不把 Persona、政策或 Memo 正文迁进去。自动候选经人工提升后才参与召回；正式 v0.2 Fact/Source 与替代链事务写入。Entity 合并保留重定向，Fact 撤销与现实有效期不同。AI 接收有来源的不可信召回上下文，召回失败不阻断回答；候选审核路径不等于通用 MCP 已开放该能力。特定近况 Memo 的内容更新会触发 Lucius 通知。
- **详文**：[Memory Graph](MEMORY_GRAPH.md)、[MCP 兼容与生命周期](../src/lib/mcp/README.md)、[Memo 通知条件](../src/lib/push/README.md)。

## AI

- **职责与入口**：[ai/](../src/app/ai/)、[chat API](../src/app/api/ai/chat/route.ts)、[persona.ts](../src/lib/persona.ts)、[ai-tools.ts](../src/lib/ai-tools.ts)、[Provider 设置](../src/app/settings/ai-providers-settings.tsx)。
- **数据与接口**：`chat_sessions`、`chat_messages`、`ai_settings`、`ai_providers`、`ai_model_configs`；`/api/ai/*`。
- **依赖与决定**：Persona 从 SELF_PERSONA、偏好、时间与动态上下文组装；业务 Tool Calling 复用服务，Graph 负责事实召回。界面昵称/头像不改变消息 role 或 Persona；Key 归 Provider，Model 引用 Provider，密钥不发送给客户端。内置聊天工具与远程 MCP 是不同入口，勿混用旧工具名。
- **详文**：[Persona 内容](../SELF_PERSONA.md)、[README 架构与密钥](../README.md)、[部署配置](../DEPLOYMENT.md)。

## Inbox

- **职责与入口**：[inbox/](../src/app/inbox/)、[inbox 服务](../src/lib/services/inbox.ts)；表 `inbox_items`，API `/api/inbox` 及 convert，MCP `inbox`。
- **依赖与决定**：待整理捕获与长期内容分开；现有 convert 目标是 Task 或旧 Memory（`memories`），不会直接生成 Memo/Graph；转换后保留原项及处理状态、目标引用。
- **契约**：[MCP 边界](../src/lib/mcp/README.md)；转换行为以服务为准。

## Tasks

- **职责与入口**：[tasks/](../src/app/tasks/)、[task 服务](../src/lib/services/task.ts)；`tasks`、`task_reminders`；`/api/tasks`，MCP `task`。
- **依赖与决定**：到期日期、明确到期时间和提醒规则分别处理；模块拥有的 Reminder 由 Task 服务协调，完成/重开走业务操作。Apple Reminders 同步通过 EventKit，不能把 MCP 本地写入等同于设备同步完成；Home 聚合任务列表。
- **详文**：[MCP Task 与 Reminder 边界](../src/lib/mcp/README.md)、[EventKit 偏好恢复](EVENTKIT_ACCOUNT_PREFERENCES.md)。

## Trackers

- **职责与入口**：[trackers/](../src/app/trackers/)、[tracker 服务](../src/lib/services/tracker.ts)；`trackers`、`tracker_fields`、`tracker_entries`、`tracker_goals`、`tracker_reminders`；`/api/trackers/*`，MCP `tracker`。
- **依赖与决定**：属性 stable key/type 保持历史语义；归档保留记录，永久删除才清理数据。旧属性 DELETE 仍为归档，永久删除需显式选择。`time_range` 是自定义属性而非主记录时间，服务端重新计算时长。提醒依赖 Notifications，记录参与 Timeline。
- **详文**：[生命周期](TRACKER_SETTINGS_LIFECYCLE.md)、[时间段属性](TRACKER_TIME_RANGE.md)、[MCP 子对象操作](../MCP.md)。

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

- **职责与入口**：[cats/](../src/app/cats/)、[cats 服务](../src/lib/services/cats.ts)、[cat-routine.ts](../src/lib/services/cat-routine.ts)、[cat-food.ts](../src/lib/services/cat-food.ts)。
- **数据与接口**：`pets`、`cat_events`、`cat_symptoms`、`vet_visits`、`cat_medications`、`cat_measurements`、`cat_routines`、`cat_food_items`、`cat_food_purchases`；`/api/cats/*`；MCP `cat_pet`、`cat_record`、`cat_routine`。
- **依赖与决定**：Routine 通过 Reminder 周期执行，归档与永久删除不同；保留已生成护理记录与投递快照。猫咪删除兼容入口实际为归档。猫食品库存独立于人的 Food Library，不能合并；护理/健康事件进入 Timeline。
- **详文**：[MCP 生命周期与按 kind 字段](../src/lib/mcp/README.md)、[提醒契约](../MCP.md)。

## Relations

- **职责与入口**：[relations/](../src/app/relations/)、[relations 服务](../src/lib/services/relations.ts)；`/people` 重定向至 `/relations`。
- **数据与接口**：`relation_people`、`relation_events`、`relation_event_parties`、`relation_event_items`、`relation_event_flows`、`person_memory_notes`；`/api/relations/*`；MCP `relation_person`、`relation_event`、`person_note`。
- **依赖与决定**：人物笔记与 Graph Entity 是独立模型，不能仅凭名称合并。交往事件参与 Timeline；代垫结清以 flow ID 执行业务操作，不使用 event ID。事件 update 现有契约要求完整输入，不能当普通 PATCH。
- **详文**：[MCP 操作与限制](../src/lib/mcp/README.md)。

## Media

- **职责与入口**：[media/](../src/app/media/)、[media 服务](../src/lib/services/media.ts)；`media_items`、`media_series`、`media_viewings`；`/api/media/*`，MCP `media`、`media_series`。
- **依赖与决定**：收藏条目、系列和多次观看历史分别保存；封面由 [media-cover 服务](../src/lib/services/media-cover.ts) 管理，不把资源文件内嵌进备份 JSON。
- **详文**：[备份边界](DATA_BACKUP.md)、[MCP action schema](../MCP.md)。

## Subscriptions

- **职责与入口**：[subscriptions/](../src/app/subscriptions/)、[subscription 服务](../src/lib/services/subscription.ts)；`subscriptions`、`subscription_payments`、`subscription_price_changes`；`/api/subscriptions/*`，MCP `subscription`。
- **依赖与决定**：自动续费的读取可补记付款并推进续费日，不视为纯无副作用查询；手工付款、跳过与启停走业务服务。提醒投影由订阅服务维护，付款参与 Timeline。
- **详文**：[MCP 读取副作用](../src/lib/mcp/README.md)、[通知通道](BARK_NOTIFICATIONS.md)。

- **软件库（Web）**：`/subscriptions/library` 使用独立 `software_library` 表记录软件、平台、授权／获取方式及来源链接，三列紧凑网格与详情表单；`/api/subscriptions/library/*` 走账户隔离 Repository，纳入备份，不参与续费／支出。本地原生快照、桥接白名单与原生入口暂不接入，旧预览地址重定向至正式页。

## Projects

- **职责与入口**：[projects/](../src/app/projects/)、[project 服务](../src/lib/services/project.ts)；`projects`、`project_items`；`/api/projects`、`/api/project-items`，MCP `project`、`project_item`。
- **依赖与决定**：这里管理当前开发事项、模块、状态、结果和下一步；索引不替代进度系统。`done` 与 `verified` 分开，生命周期时间由服务端维护；写回须保留不相关内容并复用既有事项。
- **详文**：[AGENTS 的 Project 写回规则](../AGENTS.md)、[MCP 通用契约](../MCP.md)。

## Chronicle

- **职责与入口**：[chronicle/](../src/app/chronicle/)、[chronicle 服务](../src/lib/services/chronicle.ts)；`chronicle_entries`；`/api/chronicle`，MCP `chronicle`。
- **依赖与决定**：纪事保存 date、标题、Markdown 正文和来源；与 Home 今日一记、Lucius 日记、Memo 各有数据表及服务，修改时不要按“都是日记”互相替换。
- **契约**：[MCP](../MCP.md)；字段与校验以 [chronicle.ts](../src/lib/chronicle.ts) 为准。

## MCP

- **职责与入口**：[route.ts](../src/app/api/mcp/route.ts)、[server.ts](../src/lib/mcp/server.ts)、[resource-registry.ts](../src/lib/mcp/resource-registry.ts)、[服务适配](../src/lib/mcp/resource-registry.server.ts)。
- **数据与接口**：无独立业务数据表；OAuth 认证后进入当前用户 Repository 上下文，通用工具分派到前述资源与服务。
- **依赖与决定**：只注册八个通用工具，资源逐个显式注册，禁止任意表 CRUD。能力、字段、actions 和更新模式由 registry 决定；新增业务表不等于自动开放 MCP。检索不授权持久写入；个人记忆须有用户明确请求。
- **详文**：[远程 MCP 配置与契约](../MCP.md)、[服务边界与兼容限制](../src/lib/mcp/README.md)。

## Native

- **职责与入口**：[ios/EvaOrbitHost](../ios/EvaOrbitHost/)、[桥接](../src/lib/native-bridge.ts)、[同步服务](../src/lib/native-sync-service.ts)、[Tracker 协议2](../src/lib/tracker-local-contract.ts)、[EventKit 自动同步](../src/lib/eventkit-auto-sync.ts)。旧 [协议1](../src/lib/native-sync-contract.ts) 仅保留兼容代码，不再连接生产同步路由。
- **数据与接口**：`native_devices`、`tracker_sync_receipts`、`tracker_sync_heads` 与 Tracker 行版本，以及 HealthKit / EventKit 各自样本、回执与映射表；`/api/native/sync` 使用原子 RPC，`/api/native/*-readonly` 使用各模块只读 Repository 白名单；旧 `native_sync_mutations` 保留。在线配置会话声明及账户头保护见 [main 整合说明](NATIVE_API_MAIN_RELEASE.md)。
- **依赖与决定**：Web 主体仍部署在 Vercel，Host 用 WKWebView 提供原生能力；设备本地 outbox/幂等与账户数据隔离。HealthKit、EventKit、原生通知分别遵循各自授权及同步契约，网页缓存不能替代设备状态。保留已验证的 macOS CI ad-hoc IPA → patched xtool → Personal Team 重签 → Windows/WSL 安装链。
- **详文**：涉及本节改动先完整阅读 [维护契约](IOS_NATIVE_MAINTENANCE.md)，再按需看 [Host Runbook](IOS_NATIVE_HOST.md)、[安装简版](IOS_IPA_INSTALL_QUICKSTART.md)、[Sleep](HEALTHKIT_SLEEP.md)、[体重合并](HEALTHKIT_WEIGHT_MERGE.md)、[EventKit 偏好](EVENTKIT_ACCOUNT_PREFERENCES.md)。
