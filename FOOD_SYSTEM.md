# EvaOrbit Food System

Food 是数据系统，Eva 是主要输入界面。页面负责查看、搜索、修改和补漏，不要求用户把日常吃喝变成一套密集表单。

## 数据结构

- `food_logs`：一次饮食；含时间、餐次、标题/明细、分量、场景、kcal estimate + min/max、可信度和图片/附件预留。
- `food_library`：可重复使用的食品参考；名称与品牌共同唯一，支持 per 100g、per 100ml、per serving，以及包装标签、官方、估算和手动来源。
- `drink_logs`：独立饮品记录；含品牌、类型、容量、糖度、咖啡因、kcal 范围、可信度和可选 Food Library 关联。
- `drink_limits`：针对饮品类型或名称关键词的每日/每周数量线。
- `daily_nutrition_summaries`：只持久化当天的静息消耗、活动消耗和备注；摄入与能量差始终从 Food + Drink 实时计算，避免日志修改后出现陈旧汇总。

## 计算规则

每条记录优先使用 `estimated_kcal`，缺失时使用 min/max 中点；总计同时累加 min 与 max。任一记录可信度低，则全天可信度低；否则有中则为中。只有设置了静息或活动消耗时才计算：

```text
total expenditure = resting energy + active energy
energy balance = estimated intake - total expenditure
```

能量差同样保留 min/max。没有消耗数据时返回 `null`，不制造看似精确的余额。

## Eva Tool 流程

典型饮食输入：模型根据 Tool schema 识别意图 → 搜索 Food Library → 拆分并估算主要食物 → `create_food_log` → 简短报告范围和可信度。典型饮品输入：搜索 Food Library → `create_drink_log` → Application Service 自动检查 Drink Limits → 返回计数状态。

修正“刚才只喝了一半”时，先用 `get_today_drinks` 找最近对应记录，再调用 `update_drink_log`；汇总下次查询时自动重算，不新建重复项。所有 AI Tool 和 HTTP API 都复用 `FoodService`、`DrinkService`、`NutritionService` 与 Repository abstraction。

## 匹配与措辞

Food Library 搜索可同时传名称与品牌。同名不同品牌不默认等价；信息不足时保留估算范围并降低 confidence。Drink Limits 只陈述 `within_limit`、`near_limit`、`reached_limit`、`exceeded_limit` 对应的数量事实，不使用失败、违规、破戒或食物好坏标签。

## 暂不包含

当前不做宏量营养素、扫码、图片识别、健康平台、Meal Planning、减肥计划、复杂图表或完整 Push Scheduler。跨日期“最近哪天吃得最多”等进一步聚合分析留作后续；现有服务已支持按日期、餐次、名称查询以及查看最近匹配记录。
