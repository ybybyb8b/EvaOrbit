# Food Places 来源模型

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
