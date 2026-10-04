# Food & Drink 信息架构

统一一级入口 `/food-drink` 只承担 Brief、四个轻量入口、Insights 和 Limits。独立功能页为 Food records（`/food`）、Drink records（`/drinks/history`）、Places（`/food/places`）和 Library（`/food/library`）。旧 `/drinks` 跳转到共同主页，首页快捷记录通过 `?record=food|drink` 直接打开对应编辑器。

Brief 显示今天 Food 记录条数、Drink 杯数、最近一条记录和最需要注意的限额提醒。按实际发生日期/时间选择最近记录；仅日期的记录仍显示“仅日期”，不推测时间。共同主页不显示完整时间线、热量或能量平衡；健康分析继续由 Health 负责。Food/Drink 历史保留原有记录详情、筛选和专属字段。

Insights 比较最近 7 天与前 7 天，根据变化幅度、常吃/常喝、评价、糖度/冷热/类型/品牌偏好、共同 Place 和内容多样性排序，优先选择不同维度，最多五条。数据不足时少展示或显示空状态，不为了凑数编造变化。不将未记录视为未摄入，不宣称新出现的品名是首次吃喝。只读聚合 API `/api/food-drink/home` 为两种记录分别读取最近 14 天、最多 500 条；达到上限时提示样本不完整并暂停前后比较。

Limits 使用原有饮品限额规则，展示日/周/月周期内的杯数与状态。点击直接打开 sheet，支持新增、编辑、自定义品名关键词、启停和删除。停用规则仍可查看和重新启用。限额对象匹配饮品类型或品名关键词，计量是杯数；不把咖啡因毫克数转换为新的限制语义。

共同主页复用原 FoodRecordEditor / DrinkRecordEditor、饮品偏好计算和限额服务。Food / Drink 表、已有 API、MCP 与历史候选生成保持独立，不需要数据库迁移。编辑、删除记录或限额后重新加载聚合数据；完整偏好 API 保留，主页展示近期有代表性的内容。

Place detail 保留混合 Food / Drink 最近记录、原菜单和来源字段，各项分别打开原记录编辑器。共同图标及主题版本沿用现有资产，原 Food / Drink 图标用于子入口。

验证覆盖洞察不足、比较窗口、偏好变化、菜单品名、组合来源、热量无关性，以及独立记录和限额增改删后的主页状态、仅日期记录和导航父级。另运行 lint、typecheck、全量 tests、production build 和 diff 检查；浏览器或真实设备不可用时不宣称通过 iPhone Safari/PWA 或键盘实测。
