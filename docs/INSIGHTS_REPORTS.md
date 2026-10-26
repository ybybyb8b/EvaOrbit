# Insights 报告与版本 · Phase 2

本篇保留 Phase 2 的实现与验收范围；现已增加 [Phase 3 外部 Agent 后台](INSIGHTS_AGENT.md)，定时任务由用户自行配置。

## 当前能力

`/insights` 使用现有 Web 组件、主题、字体、侧栏和移动导航。Daily 支持手动分析已经结束的上海自然日、保存报告、重新分析、修订说明、历史版本、证据窗口及原始记录查看。
Monthly / Quarterly / Yearly 入口用于浏览相应已保存报告；本阶段不生成这些周期的分析，也不自动调用 Agent 或发送通知。

规则发现复用 `buildFoodDrinkInsights`，与 AI 内容使用同一报告模型；每条发现区分领域、重要性、规则/AI、事实/解释/待验证假设及证据 ID。无特别发现是有效报告，不用假设填充页面。
Food & Drink 的行为洞察展示已移除，Brief、记录编辑、限额及入口保留。旧 Home API 的 `insights: []` 和窗口字段保留以兼容已下载快照；原有计算函数继续供 Insights 使用。Tracker 目前是记录摘要、图表、热力图及字段统计，没有独立解释结论需要迁走，保持原位。

## 数据与原子写入

- `insight_reports`：UUID 身份，账户、周期类型、起止日期、固定时区、当前版本、状态和服务端时间；唯一键为 `(user_id, period_type, period_start)`。
- `insight_report_versions`：UUID、所属报告、单调版本号、请求 UUID/Hash、完整 JSON 快照、服务端生成时间；唯一键为 `(report_id, version)` 和 `(user_id, request_key)`。
- 快照保存摘要、发现、来源/Agent、修订说明、证据、输入采集时间/指纹/覆盖/指标及限制，不复制完整业务数据表。每条发现可通过 `revises` 引用当前账户的既有报告版本和发现 ID；修订不修改旧结论。
- Postgres `save_insight_report` 以账户级事务锁串行化写入，检查当前版本；插入版本和推进报告在同一事务中完成。表对 authenticated 仅开放 SELECT，所有写入必须走校验过的 RPC。RLS 和引用检查均按 `auth.uid()` 隔离；无匿名执行权限。
- Postgres 和 SQLite 均用触发器阻止版本 UPDATE。应用没有版本删除接口；Postgres authenticated 无 DELETE 权限。SQLite 的受控全量备份恢复允许删除并重新导入历史行，更新触发器不会阻断恢复。
- SQLite 使用 `BEGIN IMMEDIATE`、同样的唯一键、版本检查、请求重放和修订引用检查。迁移版本 85 只追加新表和触发器，保留原数据。
- 乐观版本冲突、请求 UUID 重用于不同命令返回 409；丢失响应后使用原请求重试，返回首次不可变结果。规则生成的请求 Hash 基于命令，不含重新采集时间；发布 AI 内容的 Hash 覆盖完整命令和快照。日期及参数不变的重试不会增加报告或版本。

报告类型预留四种周期，当前受控写入仅支持 Daily。长期周期不通过重复拼接日报来伪装实现。

## 接口

`GET /api/insights?period=daily&before=YYYY-MM-DD`：每页最多 50 份，返回 `items/nextBefore`；`before` 为排他的周期起点游标。
`GET /api/insights?date=YYYY-MM-DD`：查找该日现有报告身份及当前版本，避免历史超出列表第一页时误用版本 0。
`GET /api/insights/{uuid}?version=N`：读取指定版本（省略时读当前版本）及最近 50 条版本元数据。
`GET /api/insights/{uuid}?beforeVersion=N`：读取更早版本元数据；不会加载所有历史 JSON 快照。
`GET /api/insights/{uuid}?version=N&evidence=证据ID`：先校验账户和保存的引用，再通过独立只读白名单访问原始记录；不接受任意表名或 Repository 方法。支持 Food、Drink、Training、Health、Weight、Period Flow、Tracker Entry 和 Task。

规则生成示例：

```json
{
  "mode": "rules",
  "command": {
    "date": "2026-10-24",
    "expectedVersion": 0,
    "requestKey": "10000000-0000-4000-8000-000000000001",
    "revisionNote": ""
  }
}
```

`POST /api/insights` 的 `mode=publish` 另需 `snapshot`，通过 `parseInsightSnapshot` 的严格 Schema：最多 40 条发现、200 个证据、512 KiB，证据 ID 唯一且引用存在，超出/未知字段、非法链接、错误事实类型等拒绝。`input` 必须包含采集时间、64 位 SHA-256 指纹、覆盖、指标和限制。
内部入口为 `generateRuleInsightReport`、`publishInsightReport`。AI 发布是存储入口，不代表已接入自动 Agent 或验证外部 Agent 的推理真实性；Phase 3 仍须约束实际执行身份、上下文与输出的关联、失败状态和调度。

## 证据与历史

规则报告保存 Context 的有界指标及证据引用、查询窗口、完整性限制。原始记录按钮读取的是**当前**内容，页面明确可能已在分析后修改；保存的指标始终来自原版本快照。原记录删除或失去权限后返回 404，旧报告及其证据仍可查看。
支持按已有模块链接回看来源；Food 链接保留对应自然日，Tracker Entry 校验父 Tracker ID。不会为了提供统一证据跳转而改写原业务记录或向原模块添加 Insights 卡片。

## 备份、迁移及发布边界

新增 Postgres 迁移 `202610250001_insight_reports.sql`；备份版本升为 11，先导出/导入报告，再处理版本。v1–v10 备份缺少这两张表时自动补为空数组；v11 缺表视为不完整备份。
PGlite 验证重复应用、原数据保留、RLS、RPC 重放/冲突、引用归属、版本不可变和权限。隔离 SQLite 验证真实服务、旧表写入阻断、54 个版本的分页，以及整个备份恢复后继续访问旧版本。

本轮不自动应用生产迁移或部署。生产发布顺序应先应用迁移，再部署依赖新表的 Context/报告服务及页面；不要先移除生产 Food 展示再发布 Insights。仍未验证真实 Supabase 网络延迟、生产账户 API 或真机 Safari/PWA/键盘。
普通在线 Web/iOS Host 共用本页；独立本地 React Host 的账户桥接、模块路由及离线快照未接入本阶段，不修改 Native 协议或 IPA。

## 验证

- `scripts/insight-reports.test.mjs`：Postgres/RLS/RPC 与 SQLite 服务、并发版本冲突、54 版分页、旧备份兼容和恢复。
- `scripts/food-drink-home.test.mjs`：原记录和限额行为保留，旧行为发现进入持久化报告，原始证据读取及删除后历史快照保留。
- `scripts/insight-context.test.mjs`、MCP 契约测试：只读边界和内部/MCP 口径一致。
- `scripts/insights-browser.mjs`：隔离 SQLite/Next 预览，Chrome 下 402×874 与 1440×1000，检查空状态、生成、重新分析、证据、版本、响应丢失重试、周期切换、Food 展示迁移和横向溢出；浅/深色截图写入 `tmp/insights-*.png`。该脚本启动的监听端口为 3107，结束时仅停止它自己的进程树。

Phase 3 的实际 Agent/调度/重试投递、月/季/年计算、HealthKit 能量统一读取、Chronicle 生活日映射和完整范围分页继续保持原阶段边界。

本轮实测：类型检查、改动文件 ESLint、生产构建、Impeccable 检测及 diff 空白检查通过；真实页面检查通过。全量 `npm test` 共 700 项，687 通过、12 可选数据库测试因缺少 `DATABASE_URL` / `EVENTKIT_PGLITE_PATH` 跳过、1 项 Cats 夹具 rename 遇到 Windows `EPERM`，随后单独复测该文件两项均通过。没有把该次全量运行报告为零失败。
