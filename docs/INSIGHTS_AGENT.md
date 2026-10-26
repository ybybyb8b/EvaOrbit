# Insights 单 Agent 后台 · Phase 3

## 范围

执行方由用户选择为 ChatGPT 云端 Scheduled Task，且用户自行创建任务。EO 仅提供账户隔离的 MCP 协议、输入冻结、执行追踪、原子写回及有条件的重要通知，不调用 App Provider/Model，不配置本地自动化，不引入 Agent API Key、管理员令牌或独立 cron 认证通道。
任务正文与建议时间见 [Daily Task](INSIGHTS_DAILY_TASK.md)。本阶段仅 Daily，长期周期仍由 Phase 4/5 实现。

## MCP 契约

仍为八个通用工具；资源增至 39、actions 增至 41。

| 资源 | 能力与 ID |
| --- | --- |
| `insight_context` | get：`yesterday` / `day/YYYY-MM-DD`，沿用只读上下文及既有报告引用 |
| `insight_run` | get/search/action：Daily ID；get 包含状态及最多三次尝试元数据，search 的 `filters.status=due` 返回昨日和此前七天既有到期运行 |
| `insight_report` | get：报告 UUID 或 `UUID/v/N`，读取不可变报告、证据及修订关系 |

`start` 参数：`request_key`（UUID）、`context_fingerprint`（先前 get 的 SHA-256）。后台重新采集并比对，锁定报告基础快照后返回 `ready`、`attempt_id`、`lease_until`、`base_snapshot` 和 `output_schema_json`。只有 ready=true 才可以分析。

`complete` 参数：`attempt_id`、`output`。输出严格仅为 `summary/findings`；AI 发现最多 35 条、ID 为 `ai-*`，MCP 使用 `evidence_ids`、`report_id`、`finding_id`。后台拼入最多五条既有规则发现，保留冻结的指标、证据、来源及采集时间。JSON Schema 作为字符串返回，避免通用 MCP snake_case 转换损坏标准 JSON Schema 关键字。

`fail` 参数：`attempt_id`、`error`（最多 1000 字）、`retryable`。只关闭指定日期下属于当前账户的尝试；已经成功或已经终止的尝试不会被迟到的错误覆盖。常见 Token 模式会脱敏，Agent 仍不得提交原始凭据或私密记录全文。

禁止通过 MCP create/update 任意报告输入；自动分析必须从 start 获取服务端的固定输入，再 complete。

## 状态、重试与原子性

- 每用户/自然日一个稳定 `insight_runs`；每次尝试独立写入 `insight_run_attempts`。
- 单租约 30 分钟，同一日期只有一个有效执行者，最多三次尝试。开始前的重复请求返回原尝试；已有活跃租约不会被其他请求抢走。
- 首次目标日完全没有观测记录时，保存 `waiting_data` 尝试并延后一小时；这只是对记录延迟的保守等待，不宣称实际发生了数据延迟。下次仍为空也允许生成有效的“暂无发现”报告。
- 可重试失败等待十分钟；不在后台无限循环，后续 ChatGPT 触发才会补试。租约过期可重新领取，旧执行者不能提交新输出。第三次过期或失败停止该日自动尝试；检查错误后可用既有人工报告流程处理，不静默重置历史。
- 失败不会伪造一份 AI 报告，也不会覆盖此前有效报告。执行状态由 Run 管理，已保存报告继续维持其真实版本与内容。
- Postgres 完成 RPC 与 `save_insight_report` 共用账户事务锁：验证租约/输入绑定、保存新版本、结束尝试、更新运行结果在一个事务内。若报告被人工并发修改，整个完成事务回滚，Agent 应记录冲突后重试。
- SQLite 使用同样的 `BEGIN IMMEDIATE` 事务，复用报告事务内部写入；不嵌套开启事务。
- 相同完成输出重放返回原报告版本；不同输出、被改写的输入或证据、丢失的规则发现、已过期/被替代租约均拒绝。输入及终止后的尝试不可更改。
- 输出 Hash 使用键排序后的规范 JSON，输入绑定不依赖对象键顺序；Postgres → SQLite 恢复时即使 JSON 字段顺序改变，完成重放和仍有效租约也能继续。UTC / `+08:00` 租约与重试时间按真实时间比较，不按字符串排序。
- get/search 不创建 Run，也不回补业务记录。上下文捕获前的连接/数据库不可用，无法在 EO 中可靠建运行记录，由 ChatGPT 的任务日志记录；不能把它报成没有数据。

## 权限与接口

新增 Postgres 迁移 `202610250002_insight_runs.sql`，本地 SQLite 版本 86。两表均启用 RLS，authenticated 仅 SELECT；状态写入只通过 owner-scoped security-definer RPC，所有函数检查 `auth.uid()`，不接收调用方指定的用户 ID。引用的报告/版本来自受控保存结果。
MCP 仍使用现有 OAuth 身份与 Repository 上下文，不改认证协议和权限申请流程。

`GET /api/insights/runs`：最近最多 50 个已建运行，外加昨日未开始候选。
`GET /api/insights/runs?date=YYYY-MM-DD`：该日状态、可开始标记及三次尝试历史，不返回完整输入快照。用户只需现有登录会话。
这两个接口只读；本轮按用户要求保留 Phase 2 前端，不增加调度设置界面。

MCP 和报告 POST 声明 `maxDuration=60` 为部署平台提供分析读取预算；该配置不等于线上延迟或平台时限已验证。现有 Context 仍逐日读取 217 组查询，生产启用前需实测完整 get/start 延迟。

## 通知

仅新完成的报告可能发送通知；重放完成不会重复尝试投递。必须是 AI 标记的重要客观事实，所有统计来源未触及读取上限且目标日确有记录，才进入通知路径；假设、普通/低重要性、空数据和不完整统计均不通知。
复用现有 owner-scoped 即时通知方法，Bark 启用时仍优先且失败不跨通道；否则使用既有 Web Push 配置。未配置渠道时不发送。
这是现有通知机制的一次 best-effort 尝试，不宣称 exactly-once 送达；通知失败不会撤销报告、重开运行或导致重新分析。消息只包含重要发现标题和报告链接，普通结果只保存到 Insights。

## 备份与恢复

备份版本 12 追加 `insight_runs`、`insight_run_attempts`，顺序为报告 → 版本 → 运行 → 尝试，删除时反向执行。v1–v11 缺少新资源时补为空数组；v12 缺失即拒绝。保留状态、输入、租约、请求身份和结果引用，源凭据不进入备份。
恢复不会修改终止历史；仍处于运行中的旧租约按服务端时间过期，后续领取执行时按相同规则处理。

## 验证与发布

`scripts/insight-runs.test.mjs` 使用 PGlite 校验迁移重复执行、RLS、输入绑定、规则保留、成功/失败重放、数据等待、租约替换、三次上限、人工版本冲突和终止历史不可变；隔离 SQLite 通过真实 MCP Registry 跑 get/start/complete/fail，验证源表写入阻断，并将运行与尝试完整备份恢复。
既有 MCP HTTP 契约继续验证八工具、资源发现和 action schema；没有用真实模型的虚构结果充当线上验收。

生产顺序：先应用 `202610250001_insight_reports.sql`，再应用 `202610250002_insight_runs.sql`，随后发布服务。确认真实 MCP 上 get/start/complete 回写成功后，用户再启用 ChatGPT 云端任务。
不默认提交/推送或修改当前工作分支历史；本轮尚未部署，不声称云端调度、生产迁移或生产性能已验证。

本轮全量 `npm test`：702 项，689 通过、12 项可选数据库检查因缺少 `DATABASE_URL` / `EVENTKIT_PGLITE_PATH` 跳过、1 项 Cats 头像夹具在 Windows 临时目录 rename 时遇到 `EPERM`；该文件随后单独复测两项通过。租约时区、JSON 顺序变化、终止历史及仍在运行尝试的备份恢复均通过相应回归；未修改 Cats 业务代码。

最终代码的 Insights/备份相关回归 16 项、MCP 契约回归 24 项通过；相关 ESLint 与 `npm run build`（包含 TypeScript 检查）通过。构建产物包含 `/api/insights/runs`。

## 生产发布验证（2026-10-26）

基于正式分支 `28ac476` 隔离集成 Insights，保留已发布的手动续期会员；不纳入本地 Host、导航重构及其他工作区改动。本轮按用户要求跳过 IPA 打包与安装。当前 MCP 为 39 个资源、41 个 actions（包含此前已发布的会员购买 action）；完整备份版本为 13，保留 Insights v11/v12 的兼容语义及会员字段。

最终候选全量回归 632 项：620 通过、12 项可选环境检查跳过、0 失败；相关 ESLint、TypeScript、生产构建通过。浏览器通过 402×874 与 1440×1000 的空状态、生成报告、三版本历史、来源、修订及网络重试检查；测试服务器已关闭。

两份 Insights 迁移已依序应用生产并登记规范 SHA-256，四张表 RLS 已核验。真实 PostgreSQL 使用既有测试账户验证 claim → finish → 同输出 replay 及跨账户不可见，事务回滚且确认无测试运行残留。发布服务后仍需用真实 MCP 检查资源发现和读取延迟；用户自行配置 Scheduled Task，本轮未创建调度、未使用 App 模型。旧应用可回退，新增表保留，不执行删除数据式回退。

发布结果：正式分支提交 `d2a164d5975c7c6383530883181f7e57e20e74db`；Vercel `dpl_CybjAQUWGhZWWowYTuYHx2VPqbQd` 为 READY，正式域名 `https://eva-orbit.vercel.app` 已切换。五项匿名检查通过（页面跳登录，API/MCP POST 返回 401）；连接中的 MCP 已发现三个 Insights 资源、共 39 资源，真实昨日 Context 在约 7 秒内返回有效指纹，Run 为 `not_started` / `can_start=true`。没有生成真实 AI 报告。GitHub 未触发本提交的 IPA 工作流。上一部署 `dpl_74QSHMAv7CE5EGT8rWewfz5quhYM` 可供应用回退；保留新增表。项目进度已写入 Project Item 200，状态 done，等待用户实际使用确认。
