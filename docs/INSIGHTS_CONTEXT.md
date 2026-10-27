# Insights Context · Phase 1

> 当前每日复盘的餐次检查、过期识别、默认阅读版本和执行轮次以 [Insights 整体优化](INSIGHTS_REVIEW.md) 为准。以下保留原阶段契约与历史验证。

本篇保留 Phase 1 的原始审查结论。Phase 2 已增加报告存储及页面，见 [报告与版本](INSIGHTS_REPORTS.md)；Context 现在额外只读获取最多 50 个目标日前的 Daily 报告身份/当前版本引用，这些引用参与指纹。对应只读白名单从 11 个方法扩展到 12 个，另有独立的原始证据 GET 白名单；其余范围、基线和来源限制不变。

## 接口与边界

内部入口：`getInsightContext(id = "yesterday")`，位于 `src/lib/services/insight-context.ts`。
聚合结果及 `InsightContext`、`InsightPeriod`、`InsightReader` 类型位于 `src/lib/insight-context.ts`。
本阶段不引入数据表、页面、生成 Agent、调度、通知或报告写入，也不迁移原页面洞察。

MCP 保留八个通用工具，通过 Resource Registry 增加 `insight_context`，仅支持 `eo_get`：

```json
{"resource":"insight_context","id":"yesterday"}
```

```json
{"resource":"insight_context","id":"day/2026-10-24"}
```

`yesterday` 解析为上海日期的前一天。显式日期只能是已结束的自然日；非法日期、当天、未来、月/季度/年度 ID 均拒绝，不返回伪装成完整周期的 Daily 数据。
服务内部使用 camelCase，MCP 统一按既有规范转换为 snake_case；业务口径和指纹完全相同。

周期边界复用 `time.ts` 的 `dateRange` 和 `shiftDate`，均为 `Asia/Shanghai` 的左闭右开区间。
7/30 天基线是目标日前已结束的 7/30 个自然日，排除目标日；Food 既有规则单独保留截至目标日的近 30 天/前后 7 天窗口。

## 架构审查与复用

| 现有路径 | 实际语义与本阶段决定 |
| --- | --- |
| `services/food-drink-home.ts` → Food/Drink 服务 → Repository | 原首页近 30 天各取 500 行，单次查询不能保证长期完整。本服务按天各取 500，复用 `buildFoodDrinkInsights`；原页面保持原样。 |
| `services/food.ts` → `withMealTimes` | 会基于 Calendar 推导同一自然日内的餐次时间，不改变自然日。分析保留 Repository 的原始时间及显式时间标记，不推断进食时刻。 |
| `services/tracker.ts` → `buildTrackerInsights` | 复用 number/rating/time_range 和选择字段的原有统计口径，分别输出 Daily 和前 30 天统计；传入时间倒序以保持 latest 语义。省略热力图及锚点时间的时段分布。 |
| `services/training.ts` | 月/日参数最终转为 `from/to`，Repository 最大 100 行。本服务按自然日取 100 行，累计记录数、已知时长和缺失时长数量。 |
| Task Repository | 完成由 `completed/completedAt` 决定，Due 为 date-only。分别统计目标日到期和目标日完成；当前状态不能重建过去被重开的任务。全表可能触及默认 1000 行上限。 |
| Health/Weight/Period Repository | Health 最大 100 行；体重查询可到 2000、经量最大 500。本服务按天取 Health 100、体重/经量各 500，保留 manual/apple_health 来源。体重仅给观测均值，不声称已消除双来源重复；经量记录数不是周期长度。 |
| `services/nutrition.ts` | `nutrition_daily` 是派生服务，不是覆盖全部生活记录的独立表。历史日期来自手动能量设置和 HealthKit 能量，可能遗漏仅有饮食的日期；Food 长期查询亦有 500 行上限。复用 `calculateDailyNutrition` 直接计算目标日记录估算，保留手动能量，不调用该历史接口。 |
| `services/healthkit.ts` | 能量读取直接创建 Web Supabase client，不使用 MCP 请求 Repository。为避免 Web/MCP 身份与口径分裂，本阶段明确未接入；不把手动能量冒充有效 HealthKit 合并能量。睡眠 Repository 可分页，但睡眠日归属/去重/汇总本阶段未接入。 |
| `services/timeline.ts`、`services/home-day.ts` | Timeline 默认可补记订阅付款；只读模式仍有多个列表上限，Home 还带生活日/Calendar/睡眠展示语义。不能直接当完整分析数据源。本服务使用独立只读白名单，不调用这些有复合语义的聚合。 |
| Chronicle | 保留主观生活日语义。本阶段不把 Chronicle 日期解释为自然日，也不扫描其最多 200 条的无时间范围列表。 |
| Repository/MCP | 沿用已认证请求的账户隔离与 RLS，内部入口复用 `getRepository`。不新增凭据、管理员 client、跨请求缓存或任意表 CRUD。 |

## 输出与可信度

- `period`：日期、时区、边界和 30 天基线范围。
- `coverage` / `metadataCoverage`：各来源样本数、出现记录的天数、触及上限的日期及元数据上限。`within_query_limits` 仅表示没有碰到已知查询上限；真实记录完整性始终为 `unknown`。
- `metrics`：当日观测数、7/30 天记录日均、相对 7 天日均的差值、31 天逐日计数及重复观测提示。任一天触及该来源上限，基线均值和差值置空，标记 `complete=false`。
- `domainMetrics`：训练已知分钟/缺失数量、体重观测均值、健康类型分布；这些值必须结合对应来源的 `coverage` 使用，截断时不是全量统计。
- `trackerStatistics`：窗口内最多 20 个 Tracker，每个统计最多 20 个数值字段和 20 个选择字段，每个选择字段最多 20 个选项；分别暴露省略/截断标记。
- `tasks`：Due/完成计数、缺失完成时间的记录数以及完整性标记。不是历史任务状态快照。
- `nutrition`：仅记录饮食估算及手动能量，未知热量可能按既有算法贡献 0；明确不等同于有效 `nutrition_daily` 能量汇总。Food/Drink 任一日触及上限时摘要置空。
- `findings`：复用 Food 确定性规则，标记 `method=rule`、`kind=interpretation`，包含来源和规则证据窗口；截断时全部抑制，样本不足允许空数组。数值是记录事实，规则标题中的偏好/变化解释不是因果结论，不生成 AI 假设。
- `evidence`：目标日最多 100 个引用；`baselineReferences` 最多 30 个基线引用。均提供总数/返回数/截断标记。业务表名仅用于来源标识，不授予表访问能力。Tracker 的 `id` 为 entry ID，`resourceId` 为父 Tracker ID；未开放 MCP 资源的体重/经量资源为 null，仍可通过表名、记录 ID 和模块链接追溯。
- `snapshotFingerprint`：对所有实际读入数据、周期、字段元数据及覆盖状态做规范化 SHA-256；排序消除返回顺序影响，采集时间不参与。同样输入稳定，输入变化更新指纹。省略数据不在指纹内，不承诺数据库事务快照或并发编辑期间的一致视图。
- `limitations` / `omitted`：报告存储、Chronicle、睡眠、HealthKit 能量、经期区间与其他事件未接入；不暗示这些领域没有活动。采集时间不等于数据的最后摄入时间，延迟仍为未知。

## 只读与容量

`withInsightsReadOnlyRepository` 使用现有 AsyncLocalStorage 请求上下文和显式方法白名单。白名单仅有本服务实际使用的 11 个读取方法；命令方法及订阅读取均拒绝。失败向上传递，不把数据库错误转换成“空数据”。

每天 7 组范围查询，目标日加前 30 天合计 217 次列表读取，另有 3 次任务/Tracker/手动能量读取和最多 20 次字段读取。按日顺序、日内并行，避免同时向数据库发起数百个请求。本轮不新增全局缓存。真实 Supabase 延迟及生产 MCP 响应时限仍需部署后验证；扩展月/季/年之前应增加账户隔离的完整范围分页/数据库聚合，不能简单扩大逐日循环。

上限以当前 Repository 及 Supabase 默认 1000 行响应上限审查结果为准；改变 Supabase 行数配置时必须同步复核。碰到上限仅声明“可能截断”，即使 SQLite 当天正好等于上限也保守处理。

## 验收与后续

`scripts/insight-context.test.mjs` 覆盖上海跨日/跨年/闰日、非法与未结束周期、查询边界、7/30 天计算、任务完成边界、Tracker latest 和父资源 ID、来源、指纹稳定及变化、证据截断、数据截断抑制和错误传递。
隔离 SQLite 中预置过期自动订阅，对所有表安装拒绝 INSERT/UPDATE/DELETE 的触发器；实际服务和 MCP Repository 上下文读取均执行，并比较所有表前后快照、指纹及指标，验证无业务写入与口径一致。
`scripts/mcp-contracts.test.mjs` 通过真实 MCP handler 校验资源发现、Schema、Daily get、写入拒绝及未支持周期拒绝，保留八工具和原业务操作回归。

本阶段无需数据库迁移；未部署、未对生产数据运行、未验证真实 MCP 网络延迟，不声称这些检查已通过。
Phase 2 需建立报告稳定身份和不可变版本、幂等与并发控制、RLS/备份兼容、证据查询与历史页面，并在新页面具备对应能力后迁移旧洞察。HealthKit 能量的账户统一读取、完整分页、来源去重和 Chronicle 日期映射仍需按后续实际范围补齐。

本轮实际验证：`npm run typecheck`、改动文件 ESLint、`npm run build` 及 `git diff --check` 通过。Insights/MCP/请求缓存相关 27 项测试通过。
最后一次 `npm test` 共 698 项，685 通过、12 跳过、1 失败：Cats 头像测试夹具在 Windows 临时目录 rename 时遇到 `EPERM`；随后单独复测 `scripts/cats-readonly.test.mjs` 的两项均通过。没有修改 Cats 代码，也不将这次全量运行报告为零失败。12 项原有可选数据库测试因缺少 `DATABASE_URL` 或 `EVENTKIT_PGLITE_PATH` 跳过，未执行生产数据库验证。
