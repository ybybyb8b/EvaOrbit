# Food Places 来源模型

## 一餐多个来源（2026-10-17）

一条 Food Record 代表一顿饭，允许多家店铺的餐食菜单与包装食品共存。单值 `food_place_id` 保留为可选用餐地点及旧客户端的主要来源，不再限制菜品归属。网页选择食品时不自动占用用餐地点；食品／菜单本身保留来源，移除即解除对应关联。Food 与 Drink 的记录、菜单类型及表单候选仍独立。

`food_place_ids` 是数据库派生的只读来源集合，去重合并用餐地点、各菜品的店铺、食品快照中的 `item.foodPlaceId`。新快照记录当时的来源，更新 Library 归属不改写已有快照；旧快照未记录来源时继续采用原记录地点，不推测新归属。`food_places` 投影提供来源名、门店与城市。每家店每餐只计一次，Places 最近记录和 MCP 按店铺筛选覆盖所有来源。来源食品统计按该项的来源快照归集，无独立来源时沿用用餐地点，不将其他店铺的产品分配给主要店铺。

SQLite migration 82；Supabase `202610170001_food_meal_sources.sql`。迁移保留单值字段、已有数据、营养值和更新时间，支持重复执行。API/MCP 仍写 `food_dish_ids`、`food_library_items` 和可选的 `food_place_id`，只读集合无需另行维护。

## 地点字段精简（2026-10-16）

- 具体门店仅填写门店、城市和可选地址；商圈、区域、街道、楼层统一写入地址。不再展示独立区域控件，品牌 / 虚拟来源的字段显隐规则保持不变。
- Services 读取旧数据时将 `location` 合入 `address`，地址已包含同一片段时不重复拼接；读取无写入。下一次保存时写入统一地址并清空兼容列。显式修改或清空地址以新值为准，不恢复旧区域。
- 为无损容纳旧区域（200 字）与旧地址（500 字），地址上限调整为 1000 字；Supabase 发布前应用 `202610160004_food_place_address_capacity.sql`。不删除旧列或索引，不批量改写实体身份或记录关联。
- MCP 推荐城市和地址，`location` 仅作旧客户端兼容输入；Places 搜索覆盖地址。记录卡来源仅展示店名和门店，没有门店时退回城市，完整地址只在 Place 详情显示。

## 审计与改造边界

- 原 Places 同时被 `food_logs.food_place_id` 与 `drink_logs.food_place_id` 引用；Food / Drink 保持独立表。
- `service_type` 控制吃、喝或两者以及菜单兼容性，继续保留，不与来源类型混为一谈。
- 原 `branch / city / location` 没有 scope，纯饮品表单直接隐藏门店字段。改为由 scope 决定可见性。
- `rating` 是用户手动总体评价，不从单次记录评分平均生成。
- `frequent / occasional` 原本是手填状态，现在不再提供频率选项。保留旧值兼容历史与 API，界面显示为正常；暂停、避雷、关闭仍可手动管理。
- Drink 原有 `food_library_id`，但编辑器提交 null 会丢失关联。现在保留并可选择。Food 新增同等的可选关联，不合并记录表。

## Kind 与 scope

| kind | 显示名称 | 新建默认 scope |
| --- | --- | --- |
| restaurant | 餐饮 | branch |
| drink | 饮品 | brand |
| retail | 零售 | brand |
| homemade | 自制 | virtual |
| other | 其他 | branch |

所有 kind 都允许 brand、branch、virtual。PATCH 只更新明确提交的字段；改 kind 不在服务端强制改 scope。
表单改 kind 时，scope 尚处于上一类型默认值才随默认切换；已经自定义时保留。
branch 显示分店、城市、区域（沿用 location）与新增 address；brand / virtual 隐藏这些字段，但不删除原值。

旧数据只根据 service_type 和显式地点迁移：纯饮品无门店字段为 drink / brand，其余为 branch；不根据店名或品类猜测零售、自制。
唯一索引保留原身份字段并增加 kind、scope、address，允许同名品牌来源和门店并存。

## 派生关系

`frequency` = 关联到该来源的 Food 记录数 + Drink 记录数。一次记录只计一次，不按关联菜品数量放大。
不持久化手动 frequency，不给“常去”设定主观阈值；修改、解绑、删除立即影响结果。
Supabase 在数据库聚合记录数后返回，避免 PostgREST 明细行数上限影响长历史；SQLite 使用 COUNT。

关联包装食品从同时具有 `food_place_id` 与 `food_library_id` 的记录汇总，输出食品、记录次数和最近时间。
不新增商品目录或购买表，不从名称推测关联；一个食品可以从不同来源记录。
被引用的食品删除时归档，历史关联保留；新记录不能关联已归档食品，旧记录可编辑其他字段或解除关联。

## API / MCP

- Places create / update 接受 kind、scope、address；列表可按 kind、scope 筛选。
- `eo_schema(food_place)` 描述这些字段、只读 frequency 和 packaged_food。
- `eo_get(food_place)` 返回记录沉淀的 packaged_food；不提供人工写入商品关系。
- MCP 使用 `eo_create / eo_update`：`food_log` 通过 `food_library_items` 写入商品份量，省略表示保留、`[]` 表示解除；`drink_log` 继续支持 `food_library_id`，省略表示保留、`null` 表示解除。Food 的单值 food_library_id 仅为只读兼容投影。
- Library 单项 GET 供编辑器恢复被归档或不在当前搜索结果中的已选食品。
- Library 列表 GET 可传 `placeId`：优先返回该来源有 Food / Drink 记录的食品，并附带只读 `placeRecordCount`；其余候选仍来自整个 Library。搜索和品牌筛选同时作用于两部分，按 ID 去重，最多 100 条，已归档食品不作为新候选。
- Food / Drink 的共享食品选择器使用当前 Place 获取候选；更换来源立即撤下上一来源的候选，但保留已选择食品及历史营养快照。同一食品可在多个 Place 下出现；关系仍由实际记录派生，并非独占归属或人工维护的目录。

## 迁移与验证

SQLite migration 67；Supabase `202610040004_places_kind_scope_library.sql`。
Supabase 商品外键包括 user_id，两张聚合视图使用 security_invoker，遵循原表 RLS。
迁移不要改写旧 migration。SQLite 在打开数据库时应用；Supabase 发布代码前应应用新 SQL。
隔离 SQLite 测试覆盖旧门店迁移、scope 独立性、Food / Drink 汇总、记录修改与删除、食品归档、迁移重复打开和外键检查；MCP 测试覆盖字段与实际关联 CRUD。
