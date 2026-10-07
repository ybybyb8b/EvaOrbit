# EvaOrbit MCP 接口精简审计

审计日期：2026-10-07（Asia/Shanghai）。基线：`6a210daa398e16913faf3cb5f54da40334b074c3`，开始时工作树干净。本轮只新增审计文档，不改变接口、业务代码、数据库或部署。

## 结论

推荐最终只公开 **8 个 `eo_*` tools**。现有 **24 个 tools = 16 个专用 + 8 个 generic**；生产 registry 有 **31 个业务资源、36 个 resource/action 组合**。

审计时仅 Tracker 两个专用工具已被 generic 覆盖。Food Log、Drink Log、Food Library、Nutrition Summary、Daily Energy 当时尚未注册；下面的分类按审计基线记录，实际实施进度以本节及末尾记录为准。

当前实施状态：已删除全部 16 个专用工具和 MCP_TOOL_NAMES 常量，并接入 food_log、drink_log、food_library、nutrition_daily、daily_energy。当前为 **8 generic tools、36 resources、37 actions**。Food/Drink 仓库调用已迁到 generic；Cat Routine 的 delete 与 archive 继续独立保留。Tracker 已支持 generic cursor 分页，因此不再建议直接移除公共 cursor 契约。外部消费方需要按 MCP.md 映射更新旧名称；尚未部署或验证生产调用。

没有注册 MCP 协议级 resources/resource templates/prompts；`eo_resources` 返回的是业务 registry，不是 `resources/list`。当前 actions 全部经 `eo_action` 调用，不是额外的顶层 tools。

所有现有业务资源均有独立领域价值，未发现足以直接删除整个资源的证据。精简重点是重复入口、遗留输入、契约不一致，而不是合并数据库或取消业务模块。

证据入口：

- `src/app/api/mcp/route.ts`：OAuth 验证及请求级 repository 上下文。
- `src/lib/mcp/server.ts`：16 个专用 tools、输入映射及响应投影。
- `src/lib/mcp/resource-tools.ts`：8 个 generic tools。
- `src/lib/mcp/resource-registry.server.ts`：生产业务服务绑定。
- `src/lib/mcp/resource-registry.ts`：资源、能力、字段和 actions 的实际契约。
- `src/lib/validation.ts`、`src/lib/cats-validation.ts`：解析器实际读取和忽略的字段。
- `src/lib/services/{food,drink,nutrition,tracker,reminder,cat-routine,cats}.ts`：业务副作用与归属约束。

## 建议保留

### Generic tools：8 个全部保留

| Tool | 判断依据 |
| --- | --- |
| `eo_resources` | 发现实际注册资源及能力，避免模型猜测资源名。 |
| `eo_schema` | 发现各领域字段、限制和 action，不能用一个开放 JSON CRUD 替代。 |
| `eo_search` | 检索集合，与按 ID 读取不同。 |
| `eo_get` | 精确读取及详情聚合，与 search 返回的摘要不同。 |
| `eo_create` | 创建记录，保留业务校验和默认值。 |
| `eo_update` | 局部更新；应统一兑现 PATCH 承诺。 |
| `eo_delete` | 保留确有删除业务的资源；归档型资源的能力需显式化。 |
| `eo_action` | 保留带业务副作用、事务或生命周期规则的操作。 |

`resource` 继续使用由 registry 校验的 string，保留 numeric、UUID、复合 ID 和 singleton ID 的领域差异。不要为减少工具数量把 8 个工具压成一个接受任意 operation 的入口。

### 资源与 actions：完整清单

下表 S/G/C/U/D/A 分别表示 search/get/create/update/delete/action，列出的是审计时实际能力。除特别说明外，当前资源及其 actions 建议保留。

| 资源 | 当前能力 | 当前全部 actions | 保留依据 / 调整 |
| --- | --- | --- | --- |
| `memory_entity` | S/G/C/U/A | `merge`, `archive`, `restore` | 规范实体、别名和合并重定向；merge 有原子业务语义。 |
| `memory_fact` | S/G/C/U/A | `invalidate`, `restore` | 结构化断言、有效期和纠错生命周期，不等价于 Memo。 |
| `memory_source` | S/G/C/U/D | 无 | Fact 来源及正反向追溯；删除只移除来源链接。 |
| `inbox` | S/G/C/U/D/A | `mark_processed`, `archive`, `restore` | 临时收集及整理状态；归档不等于硬删除。 |
| `task` | S/G/C/U/D/A | `complete`, `reopen` | 任务状态、Due 和独立提醒；动作必须保留业务副作用。 |
| `memo` | S/G/C/U/D | 无 | 人工维护的长文本事实/规则与历史状态。 |
| `chronicle` | S/G/C/U/D | 无 | 按日期保存 Markdown 纪事，不等价于 Task、Memo 或 Project。 |
| `lucius_diary` | S/G/C/U/D | 无 | 主观日记和标签。 |
| `lucius_case` | S/G/C/U/D/A | `record_recurrence` | 修正案例；复发动作原子更新计数和日期。需收紧直接写派生字段。 |
| `lucius_state` | G/U | 无 | 单例当前状态；目前只写 status/mood，旧 current_note 已移除。 |
| `project` | S/G/C/U | 无 | 项目容器及聚合计数；已用 status 归档。 |
| `project_item` | S/G/C/U | 无 | 持久需求/问题；done 与 verified 语义独立，不自动转 Chronicle。 |
| `relation_person` | S/G/C/U/A | `archive`, `restore` | 人物索引与主观关系状态；事件余额独立派生。 |
| `relation_event` | S/G/C/U/D/A | `settle_advance` | 多方往来、份额和资金流；结算不是普通字段赋值。 |
| `person_note` | S/G/C/U/D | 无 | 依附人物的记忆片段；Graph 不自动替代原有内容。 |
| `calendar_event` | S/G/C/U/D | 无 | 保真日历区间和全天边界；不同于 Task Due。 |
| `lucius_post` | S/G/C/U/D | 无 | 主页动态及其发布副作用。 |
| `lucius_post_comment` | S/G/C/U/D | 无 | 动态下的带作者对话；更新仅允许 content。 |
| `health_record` | S/G/C/U/D | 无 | 健康事件、持续状态和详情。 |
| `training_log` | S/G/C/U/D | 无 | 训练类型、部位、课程和时长。 |
| `media` | S/G/C/U/D/A | `add_viewing`, `update_viewing`, `delete_viewing` | 作品与观看历史不同；动作维护观看计数等派生值。 |
| `media_series` | S/G/C | 无 | 系列/Franchise 是可复用父对象，不属于旧标题别名。 |
| `drink_limit` | S/G/C/U/D | 无 | 用户饮品限制；当前 update 必须先改为 PATCH。 |
| `tracker` | S/G/C/U/D/A | `create_field`, `delete_field`, `create_entry`, `update_entry`, `delete_entry`, `create_goal`, `delete_goal`, `create_reminder`, `delete_reminder` | 自定义结构、数据及统计；保留 child actions，先修正字段映射和父子归属。 |
| `cat_pet` | S/G/C/U/D | 无 | 宠物主体；D 实际归档，建议迁移到显式 archive action。 |
| `cat_record` | S/G/C/U/D | 无 | 不同种类的宠物记录，`kind:id` 有必要；应补齐按 kind 的字段契约。 |
| `cat_routine` | S/G/C/U/D/A | `complete`, `skip`, `archive` | 护理周期与完成/跳过副作用；保留 D 与 archive 两个独立语义。archive 保留日程及执行历史，D 真正删除日程及关联提醒。 |
| `reminder` | S/G/C/U/D/A | `complete`, `skip`, `snooze` | 统一提醒视图和执行入口；投影的配置由 owner 维护。 |
| `subscription` | S/G/C/U/A | `pause`, `resume`, `end`, `record_payment` | 生命周期、实际付款和价格历史；付款不能由 PATCH 冒充。 |
| `food_place` | S/G/C/U/D | 无 | 共享饮食来源；kind/scope/service_type 分别描述来源、粒度与菜单能力。 |
| `food_dish` | S/G/C/U/D | 无 | 店铺菜单项，food/drink 共用；不同于带营养基准的 Food Library。 |

不要因为都是“记录/笔记”就删除 Memo、Diary、Chronicle、Person Note 或 Memory Graph；当前没有自动迁移或等价表示的证据。

### 不应误删的字段和边界

- `occurred_has_explicit_time`、started/ended 精度标志及日期锚点：用于区别日期与明确时刻，不能依靠 datetime 猜测。
- Food 的 `calendar_time_enabled`、original 时间及 calendar_meal：分别是匹配开关、原始输入和有效用餐时间，不是重复数据。
- `food_kcal_mode`、`estimated_kcal`、`kcal_min/max`、`confidence`：自动计算和人工估计有不同意义；自动模式下应标明字段是否被覆盖，不直接删除人工模式能力。
- Food Library 的 `reference_energy_kj`、`reference_kcal`、`serving_kcal`、`serving_weight`：计算器分别支持标签单位、标准参考和每份换算；有明确优先级，不能仅因都涉及热量就删除。可加冲突校验。
- Drink 的 `food_library_id`：仍是有效的单商品关联，没有 Food 多份量列表替代，不随 Food 的同名字段一起删除。
- `food_place.kind/scope/service_type`、`food_dish.kind`：不是同一个分类维度。
- `task` 提醒便捷字段与只读 `reminders`：写入入口与服务器规则投影，当前不是两套独立可写模型。
- `reminder` 与 Task/Tracker/Cat Routine/Subscription 的提醒配置：统一执行与领域规则不同。不得删除 owner 业务服务或把它们改成无约束通用写入。
- OAuth、按用户 repository 上下文、严格字段校验、服务级删除/事务、RLS 及 SDK transport 继续保留。`legacy: "stateless"` 是 SDK handler 配置，不是一个可删除的业务工具或 /sse endpoint。

## 建议删除

以下已有替代或没有实际效果；发布时仍须切换已知调用、更新测试并确认外部兼容窗口，不能据“仓库无调用”推断线上无人使用。

| 项目 | 判断依据 | 替代 / 删除边界 |
| --- | --- | --- |
| `tracker_create_entry` 专用 tool | 与 `tracker/create_entry` 调用同一 parser 和 service。 | `eo_action(resource=tracker, id=tracker_id, action=create_entry, data={occurred_at, values, note})`；`detail_fields` 改为 `values`，响应 `record` 改为 `result`。 |
| `tracker_list` 专用 tool | `eo_search(tracker)` + `eo_get(tracker,id)` 已覆盖列表与字段详情，专用入口只是聚合投影。 | 迁调用时保留未归档字段筛选、`group`→`group_name`，并处理 generic 默认 limit=20/max=100。若确有超过 100 个 Tracker 的用户，先解决完整列表读取；不能无条件宣称单次 search 等价。 |
| `tracker/create_goal` 的 `name`, `field_id`, `period_start`, `period_end` 输入映射 | 映射后 parser 完全不读取，保存目标数量、operator、period_type 等；不会创建命名/字段目标或日期区间。 | 从公开 action 契约和映射移除，并拒绝传入。保留 `operator/target_value/period_type/enabled`，按现有 parser 暴露 `custom_period`。若想要真实按字段目标，应另立产品需求。 |
| `tracker/create_reminder` 的 `days_of_week` | parser 不读取，不产生周几限制。 | 拒绝此字段，不暗示存在周计划能力。旧有效别名另外迁移。 |
| `cat_routine/archive` 的 `acted_at` | 当前接受并验证，但 archive 分支没有传给 service。 | archive 应只接受空 data；complete/skip 继续保留 acted_at。 |
| `food_library_search.keyword` | 仅是 `query || keyword` 后备别名，无独立查询能力。 | canonical 保留 query；name/brand/category 仍是有意义的筛选。随新资源迁移移除 keyword。 |
| 专用 Drink update 对 `name` 再次 `.optional()` | drinkFields.name 本来已 optional，覆盖没有行为差异。 | 随专用层删除；无需新增共享框架。 |
| `MCP_TOOL_NAMES` 导出常量 | 仓库内没有消费者，重复维护真实注册名单；测试也使用另一份 expectedTools。 | 删除无用导出，让实际注册/协议清单成为真相。测试中的预期清单有断言价值，不因“重复”删掉。 |

这里“建议删除”表示不需要新增业务能力作为替代，不代表可以跳过外部调用兼容检查。公共 cursor 现因 Tracker 完整列表读取而保留；其他资源未实现的 cursor 仍明确拒绝，不暗示它们支持分页。

## 需要先迁移再删除

### 余下 14 个专用 tools

| 当前工具（完整清单） | 当前为什么不能删除 | 推荐最终入口 |
| --- | --- | --- |
| `food_search_recent`, `food_create`, `food_update`, `food_delete` | registry 无 Food Log；food_place/food_dish 只是来源/菜单，不是一次饮食。 | 新增 `food_log` 的 S/G/C/U/D，复用 Food service。 |
| `drink_search_recent`, `drink_create`, `drink_update`, `drink_delete` | registry 无 Drink Log；drink_limit 只是配置。 | 新增 `drink_log` 的 S/G/C/U/D；写响应必须保留 limits 结果。 |
| `food_library_search`, `food_library_create`, `food_library_update`, `food_library_delete` | registry 无 Food Library；`food_dish` 不存营养基准。 | 新增 `food_library`，保留搜索、ID PATCH、删除或归档语义。create 当前调用 upsert，须保留按 name/brand 保存的行为或先迁调用，不能悄悄改为纯 insert。 |
| `nutrition_get_daily_summary` | registry 无聚合营养查询。 | 新增只读 `nutrition_daily`，`eo_get` 的 id 为 YYYY-MM-DD。复用计算服务，展示 manual/HealthKit 来源。 |
| `daily_energy_upsert` | registry 无每日能量写入；HealthKit ingest 不是手工 override 的替代。 | 新增 `daily_energy`：按日期读取手工值，`eo_action(...,upsert)` 保留当前按日替换语义与必要汇总响应；不要把全量替换伪装成 PATCH。 |

迁 Food/Drink 时需保留：有效 Calendar 时间、日期精度、菜单归属、关联省略/null/[] 语义、不可变营养快照、自动与手工 kcal 模式、历史关联，以及原有删除/归档行为。工具迁移不能直接绕到数据库 CRUD。

### 输入与领域动作迁移

| 项目 | 判断依据 | 迁移方案 |
| --- | --- | --- |
| Food create/update 的 `food_dish_id` | parser 优先使用 `food_dish_ids`，单值是明确 legacy alias。已有测试主动验证旧字段。 | 旧调用映射到数组，新资源只公开 food_dish_ids；**搜索 filter 的 food_dish_id 表示“包含某菜品”，仍有独立意义，保留**。底层单值列/历史投影本轮不删除。 |
| Food create/update 的 `food_library_id` | 与多份量 `food_library_items` 重叠，但旧单关联切换会清空份量列表，与新列表不完全等价。 | 先逐项核对关联和快照；保留 manual/auto 原有行为，新 MCP 只写 food_library_items，旧单值可暂留只读兼容。不得顺带删除 Drink 同名字段。 |
| `media` create 的 legacy `title` | 仍实际参与 legacyTitle 和显示标题生成；同时 schema 将其标为 read_only 又列为 writable。update 已拒绝 title。 | 调用者改传 original_title/translated_title，历史显示逻辑保留；新写契约删除 title，仅保留派生显示标题。watched_date 保留 create-only，观看历史继续用 actions。 |
| `lucius_case` 直接写复发派生值 | create/update 可写 latest_occurred_date、occurrence_count、recurrence_interval_days、is_recurrence，能绕过 record_recurrence 的一致性。 | 普通新建/修改由服务器管理复发值；历史导入转专门导入路径并保留数据后，取消这些字段的普通写权限。first_occurred_date 仍是事实；consecutive_correct_count/reset_threshold 不被复发 action 完整替代，不盲删。 |
| Memo/Diary/Case 的 `source_system/source_id/imported_at` 普通写权限 | 属于迁移追踪，业务正文修改不应随意改写 provenance；并非无效字段。 | 先确认实际导入/纠错流程并转到受控导入，之后改为只读。`source_url` 有可用溯源价值，不因为属于同一字段组一起删除；不删存量数据。 |
| `tracker/create_reminder` 的 `reminder_type/time_of_day/interval_days` | 是 parser 仍有效读取的旧别名；generic action 却未映射新版字段。 | 公开 reminder_mode/configured_time/period_days/anchor_date/timezone/enabled，兼容期翻译有效旧别名，再删除旧别名。days_of_week 是无效字段，另行拒绝。 |
| `cat_routine` 的 `first_due_at/next_due_at` 旧写入口 | parser 已有 first_due_date/next_due_date/configured_reminder_time/recurrence_mode/anchor_date/timezone；generic map 只带旧 datetime，PATCH 会丢新版属性。 | 先补齐新版模型和完整合并，再迁写入到日期+显式提醒时间；旧 datetime 作为派生输出保留。不要删除业务上明确的提醒时刻。 |
| `cat_pet` 的 delete capability | 实际 archivePet 会禁用相关提醒和 routine；PATCH is_active=false 不会执行同样服务链。 | 先新增 archive action，复用 archivePet，迁调用后取消 D；不能仅改成 is_active=false。恢复继续沿已有领域规则处理。 |
| Reminder 的 owner 投影配置输入 | source_type/source_id 可写但不在 schema.fields；业务服务阻止配置模块自管投影。公开可写列表因此过宽。 | 明确 manual 与 owner 投影；保留 source 信息只读及必要手工关联，owner 配置走原资源。逐个处理允许手工关联的 vet_visit/medication，不能全删 source 字段。 |

## 必须先修正的契约问题

这些是精简阻塞项，不是理由去删除有用业务能力。

1. **Action schema 只有名字。** `eo_schema` 返回 supported_actions，却没有 action 的 id 要求、可写/必填字段、类型与响应约定。Tracker action 字段问题说明客户端无法靠现有 discovery 可靠调用。建议就地为 actions 加明确参数描述，并保证未知字段拒绝；无需新 tool。
2. **Create/update 字段混用。** ResourceSchema 只有一份 writable_fields，实际 Media、Memory Fact、Memory Source、Lucius Comment、Cat Record 等允许写入的字段随操作不同。拆分 create_fields/update_fields（含条件必填和只读约束）；兼容期保留旧摘要，之后删含糊 writable_fields。
3. **Drink Limit update 不是 PATCH。** 当前直接调用 parseDrinkLimit，全量 required 校验导致 `{enabled:false}` 失败。应读取现值合并再校验，或明确改为 replace action；推荐前者，继续兑现 eo_update 的统一语义。
4. **Cat Routine PATCH 重置已保存规则。** 当前用 snakeRecord(existing) 合并 data，随后 mappedInput 丢掉 recurrence_mode/anchor_date/configured_reminder_time/timezone 等新字段；仅改 notes 就可将 fixed/UTC 变成 completion/Asia/Shanghai。必须在迁旧字段前修正完整模型映射。
5. **Tracker action 严格性与父子作用域。** create_field/create_entry/create_goal/create_reminder 缺少 assertOnlyKeys，未映射字段静默丢失。update_entry 和各 delete child 仅传 child ID 给服务，未核对属于指定 tracker；仍受用户 repository 隔离，但可能操作同用户另一 Tracker 的子对象。补边界校验，不把无效字段当支持能力。
6. **Schema 缺项与误导。** cat_record 的多数字段只列在 writable_fields，fields 中没有定义；details 被描述为对象却不接受 details 写入。cat_routine/reminder 未描述 repeat_while_overdue；subscription 要求 amount，但 fields 没有 amount。补齐真实字段，并为 cat_record 按 kind 描述，不把它拆成多个顶层工具。
7. **Reminder 搜索与写类型不一致。** schema/search 接受 health/subscription，parser 创建只接受 cat/cat_household/tracker；统一视图还包含 task 投影但当前 target_type 筛选不支持 task。应分清可搜索类型、手工可创建类型和 owner 专属类型，保留执行 actions。
8. **删除实现与语义不一致。** cat_routine 的 delete 与 archive 错误共用归档服务，必须拆分：delete 删除日程和关联提醒（执行明细随提醒级联删除），archive 保留日程、提醒及执行历史并停用提醒。已生成的护理记录和通知投递快照独立保留。cat_pet 仍是兼容归档入口，应明确报告 archived。

## 调用关系与必要兼容依赖

当前链路：

```text
POST /api/mcp
  → authenticateMcpRequest
  → withMcpRequestRepository（OAuth identity / user repository）
  → SDK handler
  → tool 的 runTool / withMcpRepository
      → 专用 parser + service
      → 或 ResourceRegistry → 资源校验 + parser + 同一业务 service
  → repository → Supabase / SQLite
```

- 仓库内对专用 MCP 名称的主要调用在测试和文档，未发现 Web UI/Native/内置 AI 通过这些 MCP 名称调用服务。
- `src/lib/ai-tools.ts`/`ai-tool-definitions.ts` 是另一套内置 AI function-calling 入口，直接调 service，使用 camelCase 参数与独立写权限开关。删 MCP tool 不等于可以删这些入口或共享 parser/service。
- `src/lib/mcp-tools.test.ts` 明确锁定“保留 16 专用+8 generic”；需改为验证目标清单及兼容阶段。`src/lib/mcp-resource-registry.test.ts` 验证资源边界和动作。
- `scripts/food-mcp.test.mjs` 大量依赖专用名称、record/records 响应、关联及旧 food_dish_id；`scripts/food-consumption-sqlite.test.mjs` 调 food_create。需迁到 generic，同时保留业务断言。
- `MCP.md` 仍说只有 memo/chronicle/lucius_diary/lucius_case，已落后于 31 资源；README 仍说没有公开 MCP endpoint，也已与路由实现不符。应更新接口文档而不是拿旧文档判断能力。
- 没有检查生产调用日志、外部客户端配置或实际 tools/list。无法证明任一专用工具“无人使用”，也不能把本地源码等同于已部署版本。上线前需要核对配置、消费方和实际协议清单；兼容窗口按已知客户端情况决定，不虚构使用率或固定天数。
- 精简顶层入口不会取消关联校验、归档/取消提醒副作用、营养快照、价格/付款历史或 recurrence RPC。它们属于业务依赖，不是 MCP 冗余。

## 推荐最终 MCP 结构

```text
/api/mcp：保持 OAuth + stateless Streamable HTTP

tools（仅 8 个）
  eo_resources / eo_schema
  eo_search / eo_get
  eo_create / eo_update / eo_delete
  eo_action

业务 registry
  保留目前 31 个资源的领域划分
  新增 food_log / drink_log / food_library
  新增 nutrition_daily（只读，日期 ID）
  新增 daily_energy（日期 ID；明确 upsert action）

actions
  保留生命周期、历史子记录及原子业务操作
  cat_routine 保留 delete 与 archive：真正删除和保留历史归档独立服务
  cat_pet 新增 archive，替代现有归档型 delete
  tracker child actions 保留，修正输入和父子归属

schema
  清楚区分字段输出、create、PATCH、filters 和 action 参数
  只公开真实支持的字段，派生和导入属性按用途只读
  保持严格校验，不接受表名或任意数据库 CRUD

MCP 协议 resources / templates / prompts
  继续不新增；当前任务没有证明重复暴露 registry 的价值
```

最终资源增加到 36 是将已有业务能力纳入统一入口，并非新增产品功能。公开工具从 24 降到 8，减少约 67%；保持业务能力，而非为了减少资源数量合并不同模型。

## 推荐实施顺序与验收

1. 先修 action discovery、字段严格性、PATCH 与 Cat Routine 映射；给这些已复现行为留下针对性回归测试。
2. 加入缺失的 5 个资源；复用既有 services，明确 Drink limits、Food Library upsert、Daily Energy replace 的响应/语义。保持旧工具作为临时薄适配，避免双份业务规则。
3. 迁仓库测试、文档和已知客户端；新示例只推荐 eo_*。比对关联、日期精度、快照、默认查询与 lifecycle 副作用，处理 tracker_list 的 limit 差异。
4. 确认外部消费者后删除 16 个专用工具及重复投影/映射；保留 cat_routine 的 D 与 archive，取消迁移完成后的 cat_pet D。移除 legacy 输入应拒绝旧字段，不能继续静默忽略。
5. 导入、复发和时间模型字段另按兼容依赖收紧写权限，不删存量追溯或底层字段；无需仅为本次工具精简做数据库删列迁移。
6. 最终核验真实 tools/list 为 8 个、生产 eo_resources 为完整资源列表，schema 能指导每种 create/update/action；运行 lint/typecheck/tests/build/diff check，并按日期/提醒改动做所需端到端验证。

本轮验证：

- `node --test src/lib/mcp-tools.test.ts src/lib/mcp-resource-registry.test.ts`：20/20 通过。
- 直接加载 createResourceRegistry、按生产 bindings 生成清单：31 resources / 36 actions。
- 使用无数据库 fake operations 复现：Tracker Goal 丢字段、Tracker Reminder 丢新版参数、Cat Routine delete/archive 同服务、archive 忽略 acted_at、Cat Routine 备注 PATCH 重置规则与时区、Drink Limit 单字段 PATCH 失败。
- 这些复现检查验证 MCP 映射/解析行为，没有写入真实数据库；不代表所有资源的集成行为已经验证。
- 未跑 lint/typecheck/完整 tests/build、生产 OAuth 或真实数据库集成测试：本轮只做只读代码审计与文档，不改可执行代码、不启动服务。

## 后续修复记录

按用户后续要求，已先修复本报告中的现有契约问题，仍保留 24 个 tools、31 个资源和 36 个 actions；未实施工具删除、资源迁移、数据库改动或部署。

- 所有 actions 都有可发现的 `action_schemas`（ID 含义、参数、必填项、限制、结果），在统一入口拒绝未知字段及错误的文本、布尔和容器类型。
- Schema 增加 `create_fields`/`update_fields`，保留旧 `writable_fields`；修正 Media legacy title 的角色说明，区分 Memory Fact/Source、Comment、Person Note 和 Cat Record 的创建/更新权限。
- Drink Limit 单字段 PATCH 保留其他配置；Cat Routine PATCH 保留现代日期、模式、锚点、提醒时刻、时区和提醒 ID，兼容旧 datetime 编辑。
- Tracker Goal 正确接收 custom_period，拒绝无效的旧目标字段；Tracker Reminder 正确接收新版字段，保留有效旧别名并拒绝冲突和 days_of_week。
- Tracker entry update 和各 child delete 校验指定父 Tracker 的成员归属。
- Cat Record 补齐字段定义及按 kind 的字段/必填契约，拒绝与 kind 无关的输入；Reminder 补 source/逾期字段说明及 task/cat_food 搜索类型，明确 owner 投影不可经手工 PATCH 修改。
- Cat Pet 的兼容 delete 返回 `deleted:false, action:archived`。Cat Routine 的 delete 已拆分为真正删除并返回 `deleted:true`；archive 保留历史且拒绝不起作用的 acted_at，complete/skip 继续支持。Web DELETE 同步使用真正删除服务。
- 已同步 MCP.md、MCP 边界文档和 README 的当前接口说明。

修复验证：

- 新增 6 组单元回归，以及 1 组通过真实 SDK handler、用户 repository 上下文、业务 services 与隔离 SQLite 的端到端回归；不访问生产数据库、不启动监听服务。
- lint、typecheck、生产 build、`git diff --check` 通过。
- 全量 `npm test`：434 项，428 通过、0 失败、6 跳过。1 项需要 EVENTKIT_PGLITE_PATH，5 项需要 DATABASE_URL；这些是未配置的数据库集成测试，不能视为通过。
- 尚未进行生产 OAuth/真实 Supabase 环境验证。迁移前才能删除的兼容工具、字段和写权限继续保留。

## 重复入口删除与 Food/Drink generic 迁移记录

- 已删除 tracker_list、tracker_create_entry 的注册、专用输入/输出映射和服务导入，以及没有消费者的 MCP_TOOL_NAMES；移除 Drink update 对已 optional 的 name 再次 optional 的覆盖。
- Tracker 替代入口为 eo_search + eo_get 和 eo_action/create_entry。搜索支持 next_cursor，205 个 Tracker 的分页回归验证无遗漏；get 保留历史字段，展示活跃字段时按 archived_at 筛选。
- 注册 food_log、drink_log、food_library、nutrition_daily、daily_energy，共 36 resources / 37 actions；tools 暂为 22（14 个 Food/Drink 兼容工具 + 8 generic）。
- Food/Drink CRUD 继续复用领域 parser 和 service。Food get 同样经过 Calendar 时间匹配，不直接输出原始数据库时间；Food 写入只公开多菜品和多份量，legacy 单关联仍作为只读投影，搜索 food_dish_id 保留包含语义。
- Drink create/update 在 item.limits 返回既有限制评估；Food Library create 保留 name/brand upsert，delete 保留被引用归档语义。daily_energy 通过显式 upsert 替换手工值和备注，nutrition_daily 返回有效能量及来源。
- Food Consumption 的 MCP 验证改用 generic；SDK + 隔离 SQLite 回归覆盖 5 个资源的 CRUD/动作、时间匹配与精度、关联/null/[]、快照、热量、归档历史、limits 和能量替换。旧工具的兼容回归继续保留。
- 14 个旧工具尚未删除：仓库外消费者/实际线上调用情况未确认；资源迁移已完成，消费方切换与兼容入口退场是下一步。本轮未收紧其他 legacy 时间、导入属性、复发字段或 Cat Pet 的兼容入口。
- 未改数据库结构、未部署、未提交；真实 OAuth/生产 Supabase 验证仍未执行。全量测试 435 项：429 通过、0 失败、6 项因缺少数据库环境跳过。

## Generic 迁移收尾

按用户继续迁移的要求，已删除剩余 14 个 Food/Drink 专用工具及专用 Zod 字段定义、输入映射、compact 响应投影和服务导入。server 仅保留 MCP transport、用户 repository 上下文、错误处理与 generic 注册；所有业务能力继续通过 registry 复用既有服务。

- SDK 实际 tools/list 与源码清单均验证恰好为 8 个 eo_* tools；生产 registry 保持 36 resources / 37 actions。
- food-mcp 端到端调用全部改为 generic，并保留原有地点、菜单归属、日期精度、热量汇总、归档引用和 null/[] 关联断言。Food 的 legacy 单值写入改为 food_dish_ids / food_library_items，响应改为 item/items；Drink 的 limits 作为独立响应附加信息验证。
- 删除 2 项仅检查已移除专用定义的源码测试；相应字段/能量行为由 generic schema、SDK 与真实业务服务回归覆盖。当前全量测试 433 项，427 通过、0 失败、6 跳过（EVENTKIT_PGLITE_PATH / DATABASE_URL 未配置）。
- lint、typecheck、生产 build、git diff --check 通过。仓库内无残留专用调用；历史审计与 MCP.md 迁移对照保留旧名称作为说明。
- MCP.md 已说明旧名称到 generic resource 的请求/响应映射及默认 limit 差异。未替用户修改仓库外客户端、未部署、未验证生产 OAuth/真实 Supabase；外部消费者需要刷新 tools discovery 并切换旧名称。
