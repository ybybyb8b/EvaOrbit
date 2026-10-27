# Insights：每日生活复盘

本轮以既有只读 Context、不可变 Version、受控 Run 和 EvaOrbit 视觉系统为基础优化，不重建记录功能或接入新的模型服务。本文记录实现契约；生产迁移与部署需另行执行，不将本地验证称为线上验收。

## 产品与阅读顺序

首页默认打开最近一份有 AI 回顾的日报；没有 AI 回顾时打开最近整理的日期，首次使用则检查昨天。日期始终明确，历史日期可选择任意已结束的上海自然日。仅提供每日场景，不展示未实现的月报、季报、年报操作。

阅读顺序为日期与餐次状态 → 已记录概览 → 最多三条值得注意 → 中文当天回顾 → 折叠的来源、统计口径与版本。没有显著变化时不制造发现，也不展示大量零指标。数据更新后保留上次回顾并明确标注；当前缺餐时主区域停止展示可能误导的完整回顾，旧正文仍可在更多信息中读取。原始 JSON 仅在 development 且 URL 显式带 `debug=1` 时显示；普通来源读取展示内容和原记录入口。

## 午餐与晚餐

按 Food Log `mealType` / `meal_type` 分别检查 `lunch`、`dinner`，使用上海自然日的半开时间区间。早餐不强制，零食、夜宵和饮品不能替代正餐。缺餐不代表没吃饭；Food 查询达到上限时也不宣称完整。

- 缺餐时 Context 给出 `recording.complete=false`、缺少餐次与具体日期提示，页面进入 `waiting_records`。
- 手动规则生成、直接发布、请求复盘、MCP start 和正在执行的 complete 遵循同一检查。缺餐不创建空 Run，也不消耗尝试额度。
- PostgreSQL 的受控 save/claim/queue RPC 另外检查当前账户真实 Food Log。服务端在 complete 前重新读取上下文，数据发生变化即拒绝过时输出并记录可重试失败。
- 概览只展示已记录摄入估算，缺餐时隐藏热量汇总。未知热量不会被解释为零；Insights 不根据部分摄入记录计算实际热量缺口，原 Food/Drink/Health 的营养能力不受影响。

## 统一报告与历史

`current_version` 继续表示最后保存的版本，作为写入并发条件；新增 `reading_version`、`reading_method` 表示用户默认阅读版本。默认选择最新 AI 回顾；尚无 AI 时才选最新规则整理。新增版本后的数据库触发器和迁移回填采用相同规则，所以 AI v1 → Rule v2 不会改变默认正文；新的 AI v3 则成为默认。明确指定 UUID/v/N 读取仍可见的原快照；已删除版本不再对外读取。

规则仍负责统计、基线与候选，保留在冻结输入的 `metrics.ruleCandidates`；不再强制拼入 AI 发现。Insights 只取共享 Food 规则中具有前后变化依据的候选，不把常去地点、常吃食物本身每天变成发现。共享 Food/Drink 规则引擎本身不改动。AI 输出继续使用 summary/findings 和真实证据 ID，建议至多三条、允许为空；旧组合快照阅读时隐藏重复规则标签与重复标题。

### 删除日报

在日报「更多信息」选择「删除这份日报」并确认。DELETE /api/insights/:id 必须携带当前 version 与 generation，拒绝过期页面删除新内容；重复删除幂等。只处理当前账户的整份日报，不删除 Food/Drink/Training/Tracker 原始记录。

采用逻辑删除：deleted_at 标记删除，hidden_through_version 冻结已删除版本上界；列表、详情和 MCP 不再返回这些版本。保留实际快照及 Report/Version/Run 关联，避免其他日报修订引用失效。正在运行的尝试被终止，迟到完成不得写回；自动复盘返回 analysis_status=deleted、can_start=false，due 搜索不再收录。

只有用户在该日期明确选择「重新生成日报」才解除删除标记并开启新轮次。旧版本仍隐藏，新报告沿用稳定 ID、继续递增版本号；重新生成前不会回显旧正文。MCP insight_report 仍只读，不开放 Agent 删除或恢复能力。此操作不是物理擦除，保留的内部历史也包含在备份中。

## 指纹与过期

Context v2 的 `snapshot_fingerprint` 只覆盖已读取的源数据、基线与元数据，排除采集时间和其他报告引用，避免输出改变输入指纹。`fingerprint_version=2` 同步保存到 Version 输入。缺少版本标记的旧 AI 报告不会被猜为最新，展示为需要重新分析。

页面 `GET /api/insights/review?date=YYYY-MM-DD` 返回餐次、概览、指纹、当前默认报告和五类状态：

| 状态 | 含义 |
| --- | --- |
| deleted | 用户删除日报，自动分析停止，用户可明确请求重新生成 |
| waiting_records | 午餐或晚餐缺失，或当日 Food 读取不完整 |
| waiting_analysis | 已具备必要餐次，尚无 AI 回顾 |
| completed | 默认 AI 回顾与当前源数据指纹相同 |
| data_updated | AI 回顾的输入已过期或为旧指纹口径 |

Food、Drink、Health/Training、Tracker、Tasks 的客户端数据变更会使当前 Insights 读取失效并重新检查；未改写这些模块的数据。

## 安全的重新分析

同一日期保留稳定 Run ID；Run 和 Attempt 新增 `generation`，每轮最多三次尝试，唯一键为 `(run_id,generation,attempt_number)`。输入指纹变更后可以开启下一轮；同一指纹的失败不允许通过重复请求重置上限。

用户请求通过 `POST /api/insights/runs` 提交日期和刚检查的指纹。服务重新核对数据，使用 `queue_insight_run` 生成待处理状态。排队时 current_attempt_id 为空，直到真实领取才引用 Attempt；它只排队，不冒充已调用外部 AI；页面明确等待自动复盘。重复请求同一输入不产生新轮次或报告。已完成且输入相同的报告无需重做。显式请求新输入会终止旧活跃尝试；旧 worker 的迟到完成被租约/身份检查拒绝。

MCP 原有 start/complete/fail 名称和输出写入格式保持兼容；start 自动识别新指纹并安全开启新轮次。相同请求 UUID 返回原 Attempt，相同完成输出返回原 Version；即使已开启后续轮次，也不会错误返回该 Run 最新一次报告。完成后的内容与输入仍不可修改。

已有成功 Run 的 `status` 可继续为 succeeded，但源数据更新后 `needs_reanalysis=true`、`can_start=true`。自动任务必须以 `can_start` 和 `recording.complete` 为准，不能只见 succeeded 就跳过。due 搜索还包括用户明确排队的较早日期，不批量新建历史回填。

## MCP 与自动任务兼容

- `insight_context` 新增 `recording`、`overview`、`analysis_guidance`、`fingerprint_version`。
- `insight_run` 新增餐次、`analysis_status`、`needs_reanalysis` 与轮次信息；历史尝试元数据最多返回最近 50 条，数据完整保留在库中。
- `insight_report` 未指定版本时使用默认阅读版本，新增当前记录检查 `review`；显式历史 ID 读取可见快照，已删除版本返回不存在。
- 八个通用 MCP 工具和三项 Run actions 保留，不开放任意报告 CRUD。用户自行维护的 Scheduled Task 不由本轮改写；更新建议正文见 [每日任务](INSIGHTS_DAILY_TASK.md)。

## 数据迁移、备份与边界

新增 PostgreSQL `202610270002_insight_review.sql`、`202610270003_insight_deletion.sql`；SQLite 迁移 90、91。删除迁移仅增加字段、保护触发器与受控操作，不清空报告或源数据。PostgreSQL 迁移不改写旧 Version、不删除 Run/Attempt；SQLite 重建 Run/Attempt 约束时逐行保留原 ID、结果引用、输入与状态，随后创建新轮次唯一键和原不可变保护。

备份版本 15 保留删除标记、已隐藏版本上界、默认阅读指针、轮次与指纹；v1–v14 可读，缺少新列的历史行使用数据库默认值，Version 恢复时重建语义阅读选择。恢复包含所有旧轮次，不依赖最新 Run 的结果引用猜历史完成结果。

初次实现阶段仅覆盖 Web；双端发布补充见下文。部署顺序为先应用迁移，再发布对应 Web/MCP 服务，最后构建本地 IPA。

## 整体优化验证（删除功能之前）

- 最终全量：732 项，719 通过、13 项可选数据库／EventKit 环境检查跳过、0 失败。跳过项需要独立 `DATABASE_URL` 或 `EVENTKIT_PGLITE_PATH` 等环境，不将其记为通过。
- TypeScript、相关 ESLint、Web 生产构建通过；设计机械检查无报告项。PostgreSQL 迁移在隔离 PGlite 中重复应用并带存量报告／运行验证；SQLite 90 用有旧数据的迁移、跨轮次恢复和外键检查验证。
- 浏览器真实本地 API 流程覆盖 320/402/1280px、深浅模式、缺餐提示、1492→1692 kcal 补录过期、AI v1→Rule v2 默认仍读 AI、重新分析后默认 v3、历史切换、排队请求丢失响应重试、无 JSON 普通界面和无显著发现。导航几何检查确认滚动到底后末尾内容位于固定底栏上方，预览进程已关闭。
- 接受场景 1–9 均有相应自动化验证：餐次与无早餐通过数据服务及浏览器检查；过期／默认版本／无显著发现通过服务和页面检查；旧版本、源表只读、账户隔离和备份恢复通过 SQLite/PGlite/MCP 回归。

这些是隔离数据与合成 AI 输出验证，不等同于真实模型质量、生产迁移、生产部署或无人值守任务验收。本轮没有修改真实生活记录、清空报告、创建或改写 Scheduled Task、构建 IPA，也未提交或推送 Git。

## 删除功能验证

- 新增删除专项 2 项通过：PostgreSQL 重复迁移、账户隔离、版本与轮次并发保护、取消执行与迟到回写、显式重建；SQLite/MCP 隐藏历史、保留跨报告引用、源记录不变、外键一致及备份恢复。
- 浏览器真实本地 API 覆盖取消确认、确认删除、重复 DELETE、删除状态、显式排队重建、新正文默认显示及旧版拒绝读取；320/402/1280px 检查通过，预览进程已关闭。
- 全量 734 项：720 通过、13 项可选环境跳过、1 项 Cats 图片临时目录重命名因执行权限失败。相同 Cats 测试在放宽进程权限后单独复测 2 项通过，未修改 Cats 业务代码。
- TypeScript、相关 ESLint、Web 生产构建通过。以上仅为隔离数据验证，生产迁移与发布尚未执行。

## 双端发布补充

本地 App 的 InsightsWorkspace 复用同一个 InsightsView、日报服务及 UI，包含日期、餐次检查、默认 AI 正文、重新分析和删除。经现有 business.request 账户通道读取与写入，仅在 manifest 放行 Insights 列表/检查/运行 GET、运行 POST 及 UUID 报告 GET/DELETE；不新增 Swift bridge、系统权限或签名能力。Insights 需要联网读取最新状态；断网不显示缓存结论或接受写入，重连/回到前台/下拉刷新重新读取。手动生成仍排队外部 AI，不调用 App 内模型。

发布前全量回归734项：721通过、13项可选环境跳过、0失败。类型检查、相关ESLint、Web生产构建与本地Vite打包通过。Web真实隔离API与打包后的本地模拟Bridge均通过320/402/1280px验收；本地CSP下无直接API请求，删除/重建/断网提示通过。原生编译交由macOS打包工作流，手机安装与实际使用待验收。

生产两项迁移已应用并校验：Food/Drink/Training/Tracker 原始记录、Report/Version/Run/Attempt 数量全部保持不变。应用发布与 IPA 触发结果以本次发布回执为准。
