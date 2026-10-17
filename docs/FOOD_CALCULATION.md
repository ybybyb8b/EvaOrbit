# Food Record 食用量热量计算

沿用 Food Library 选择器，每条记录可关联多项。每项输入 quantity 和 unit（g、ml、serving），按营养基准即时换算。完整合计写入 estimatedKcal；直接编辑最终热量会切换为手动模式，食用量变化不会覆盖手动值。无法完整换算时可手动填写 estimatedKcal / kcal range。

手动维护表单通过顶部搜索连续追加菜单或 Library 食品，选中后清空搜索词并在下方显示可移除胶囊，保留已有关联和手写记录名称。一餐允许多家店铺，来源由各项保留，用餐地点独立可选。移除菜单胶囊时同步移除其营养关联，仍被其他菜单使用的营养引用保留。单项按克计量时复用顶部克数输入；按毫升或份计量时显示独立数量与单位，总克数不覆盖这些显式用量。有每份重量时切换克／份会换算数量；无法换算的单位切换会清空数量，等待填写，不猜测密度。改重量保留手动热量模式；未改热量时保留原区间，手动改热量或产生新的自动计算结果时清空旧区间。可信度仍保留 MCP 给出的值，备注维持自由维护。

- per_100g：参考 kcal × 克数 / 100。
- per_100ml：参考 kcal × 毫升数 / 100。
- per_serving：每份 kcal × 份数；servingKcal 优先，其次 referenceKcal，再其次 referenceEnergyKj / 4.184。
- 有 servingWeight 时支持克与份的转换；不猜测克与毫升的密度。
- 单项快照保留两位小数，总计在求和后取整。空食用量不同于 0；不可计算的项不会被当作 0。

food_logs 新增 food_library_items（SQLite JSON 文本 / Supabase JSONB）和 food_kcal_mode（auto / manual）。快照保存食品 ID、名称、品牌、quantity / unit、nutritionReference 和 calculatedKcal。服务端计算并保存快照，不信任客户端传入的营养值。历史记录编辑继续采用原快照，包括修改食用量；食品库更新不会改写历史。

food_library_id 保留为首项，旧客户端仍可单项关联。旧记录默认 manual，迁移不回填营养数据、不改变已有热量。食品库归档引用检查和来源统计包含所有关联项。

Web API 使用 foodLibraryItems / foodKcalMode；MCP 使用 food_library_items / food_kcal_mode，每项传 food_library_id / quantity / unit。自动汇总需明确传 auto；手动覆盖仍用原 estimated kcal 字段。

SQLite 启动自动应用迁移 68。Supabase 发布新版前需应用 `202610050001_food_consumption_snapshots.sql`；本次开发不自动应用生产迁移。保持 food_logs 现有所有者 RLS。

验证：`node --test src/lib/food-calculation.test.ts scripts/food-consumption-sqlite.test.mjs`，覆盖换算、保存、历史基准、手动覆盖、MCP、来源统计和旧库迁移重复启动。
