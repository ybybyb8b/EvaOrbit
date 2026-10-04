# Food & Drink 信息架构

统一一级入口：/food-drink。Food records（/food）、Drink records（/drinks/history）、Drink insights / limits（/drinks）、Places（/food/places）与 Library（/food/library）均属于这个一级空间；保留原 URL 与深链接。

共同主页复用现有 FoodRecordEditor / DrinkRecordEditor、nutrition daily、drink limits / preferences 和 Places API。底层记录表、服务、API 与 MCP 保持独立，无数据库迁移。

新增记录先选择 Food / Drink；日期概览与混合时间线随所选日期加载。只有日期的记录显示“仅日期”，在所属日期的已知时间记录之后排列，不推测时间。饮品限额仍按当前日期计算，并明确说明。未知热量不当作完整摄入，显示未估算条数；餐次数按餐次类型去重，外食/外卖按 Food 记录条数展示。

Place detail 将现有两组最近记录混排，每项分别打开原 Food / Drink 编辑器。原菜单和来源字段保留。最近来源为现有最近 200 个 Places 中有实际关联记录的最近三个来源，不宣称全库频率排名。

新总图标由用户提供的盘子、叉子与杯子图编辑生成，去除全部叶子，保留透明背景；按现有脚本统一 512px 画布、384px 主体与光学居中，生成全部主题和深浅模式版本。原 Food / Drink 图标用于子入口。

验证边界：自动测试覆盖混合排序、时区、日期记录、重复来源 ID、概览计数及导航父级。现有完整 lint / typecheck / tests / build 与 diff 检查适用于本次改动；浏览器环境不可用时不得宣称已完成 iPhone Safari、键盘或视觉实测。

审计发现原饮品编辑器固定提交 caffeineMg: null；已补上可选咖啡因字段、回填与数值保存（使用原有 0–5000 mg 校验），避免编辑旧记录时清空。
