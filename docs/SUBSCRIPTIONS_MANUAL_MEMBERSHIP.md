# Subscriptions 手动续期会员

## 数据

`subscriptions.mode` 默认为 `recurring`，旧记录、旧请求及未带 mode 的快照继续按原固定周期处理。`manual` 使用必填的日期字段 `expires_on`，并禁止 `auto_renew`。有效期含截止日当天；`expired` 根据当前日期派生，不写入原 Active／Paused／Ended 生命周期。

保留旧表的非空周期列以兼容旧代码和缓存结构：手动会员使用无业务意义的默认周期，`next_renewal_on` 仅镜像 `expires_on`。所有补账、推进、预测和界面入口都按 mode 分流；该镜像不是下一次付款日期，MCP 和界面应读取 expires_on。创建手动会员不记录“初始购买”，历史实际付款须单独录入。

`subscription_payments` 继续是唯一支出事实。新增 `purchase_key`、`valid_until`、`purchased_value/unit`、`bonus_value/unit` 保存单次购买。没有另建会重复计费的购买表。购买日期写入 paid_on；scheduled_for 为旧账本的兼容值，不代表手动会员的计划扣款。

SQLite v87 与 Supabase `202610260001_manual_subscription_memberships.sql` 安全扩展原表；SQLite 付款表重建保留 ID、金额、原始日期、备注及创建时间。原固定账期唯一约束改为 purchase_key 为空时的部分唯一索引；手动购买按账户、会员、purchase_key 唯一，因此同一天可有不同购买。继承原表账户外键与 RLS，新增 RPC 使用 security invoker 与 auth.uid()。

## 写入与提醒

- `POST /api/subscriptions/:id/purchases`／MCP `subscription.record_purchase`：必填 paidOn、amount、currency、validUntil、purchaseKey；购买／赠送时长可选且数量与单位成对。HTTP 使用 camelCase，MCP 使用 snake_case。
- 每次打开购买表单生成一个稳定请求标识；重试复用。数据库事务锁定会员，插入一笔付款并更新有效期；相同标识及内容返回原付款，内容不同冲突。新购买以官方有效期为准；补录早于最近购买日期的历史不回退当前有效期。同日购买按记录顺序采用最新官方日期。
- 数量与单位只记录权益，并可辅助填写预计日期；最终日期仍需用户核对。预估从现有有效期与购买日期中较晚者累加付费及赠送时长，使用现有月末日期截断规则。
- PATCH expiresOn 仅调整有效期及对应提醒，不新增付款。会员到期、查询、提醒完成／跳过均不产生付款或推进有效期。
- 保留原 owned reminder 投影，标题显示会员到期，使用明确选择的提前天数和时间；后续购买／有效期修改后重算。购买可恢复暂停／结束会员为 Active；到期是否有效仍按最终日期判断。已完成的同一到期提醒不因幂等重试重新启用。
- 付款与有效期在数据库事务中提交，提醒投影沿用现有服务在提交后同步；投影失败可用同一购买标识重试修复，不会重复支出。没有增加后台付款重试或离线队列。

## 界面与统计

Overview、Ledger 和详情展示手动续期、有效期、有效／到期状态以及最近一笔实际付款；购买历史包含权益和每次购买后的官方有效期。保留现有图标上传、取色、堆叠卡片、字体、主题与分区手势。时间线区分付款计划与会员到期，不为会员到期展示应付款金额。

Trends 按实际付款日期和币种计入月度、累计支出；手动会员不会增加剩余周期支出预测。Expected 包含当月已付总额和固定订阅的剩余计划，因此当月手动购买已经实付的金额仍包含其中。

Web／本地复用购买与编辑组件。`business.request` 清单增加 purchases，快照验证保留 mode／expiresOn 和完整购买元数据，兼容旧固定模式快照。离线仍只查看，购买需联网；本轮不改变 Swift 桥接、权限或打包链。

## 备份与发布边界

开发工作区备份版本 13（包含尚未发布的 Insights 资源）在原 subscriptions／subscription_payments 资源保留新增列，继续支持版本 1–12；本次正式发布不包含 Insights，保留生产备份版本 10 并更新 schema 标识，会员新增列随原表完整导出。正常恢复顺序和账户重绑定不变。生产迁移已于 2026-10-26 应用，原有 8 个订阅与 8 笔付款数据指纹不变。Web main `28ac476` 已部署成功，线上 MCP 已确认 `record_purchase`；本地源码 `3b65661` 已推送。本轮跳过 IPA 打包与 iPhone 真机验收。

`scripts/manual-memberships.test.mjs` 覆盖购买、赠送、同日多次购买、幂等冲突、过期不补账、提醒、MCP、模式切换、真实备份恢复、SQLite 旧表迁移与 Postgres RLS；`scripts/manual-memberships-browser.mjs` 使用临时 SQLite 与合成原生桥接验证共享界面及账户请求通道。

2026-10-26 实际验证：完整 Node 回归 705 项，693 通过、12 跳过；最后提醒防重复调整后的 32 项相关检查通过。Web／本地前端构建、TypeScript 和相关 ESLint 通过。Chromium／WebKit 完成创建、购买、权益历史、仅改有效期、已到期筛选、深浅主题，以及本地打包界面通过桥接购买与离线拒绝写入；375／402／1280 宽度无横向溢出。本地模拟额外关闭 randomUUID，验证幂等标识使用 getRandomValues，不依赖安全上下文专属 API。所有服务器使用本轮临时 SQLite 并在结束后关闭，截图和日志保留在 `tmp/manual-memberships-evidence/`。

正式发布副本另行完整回归 626 项（614 通过、12 跳过），构建、Lint 和隔离手机深浅色流程通过；本地源码副本构建、类型检查和 32 项相关检查通过。生产部署、迁移核验与发布截图保留在 `tmp/manual-memberships-deployment-evidence/`。Project #199 已记录为 done，待用户实际验收，不标 verified。

## 购买历史修改（工作区实现，尚未发布）

手动会员详情的购买历史逐条提供「修改」入口，复用购买 Sheet 并回填原值；可修正购买日期、实付金额／币种、购买及赠送时长、官方有效期、备注。编辑时不以当前会员有效期重新估算时长，避免重复累加权益。

`PATCH /api/subscriptions/:id/purchases/:paymentId` 更新原付款行，保留 ID、purchase_key、created_at，不生成新付款或价格历史。保存后累计／月度实际支出依照修正后的金额、币种和日期重新汇总。固定周期付款不开放此购买编辑入口。Web／本地继续复用同一 Sheet 和账户绑定请求通道，离线不写入。

SQLite 即时事务及 Postgres `202610260002_edit_subscription_purchases.sql` 的 security-invoker RPC 使用与新增购买相同的会员锁；核对订阅归属、记录类型和原内容，相同结果重试可重复确认，过期原内容返回冲突。购买日期不能晚于今天；有效期不能早于购买日。

仅当日期／购买后有效期发生变化，且当前会员有效期仍与修改前最新购买一致时，才按 paid_on、id 降序重新确定最新购买并同步会员有效期及提醒。独立调整过的有效期保持不变；编辑历史不会恢复暂停或结束状态。此迁移只新增函数，不重写既有表或付款数据；生产应用与部署需另行执行。

修改功能验证：20 项订阅／续费／快照／请求白名单／缓存相关测试通过；TypeScript、相关 ESLint、Web 与本地 Vite 构建通过（本地仍有现有 chunk 大小提示）。Chromium 和 WebKit 在隔离 SQLite、合成本地桥接环境完成创建及编辑同一付款、支出刷新、有效期修正、深浅模式与 375／402／1280 宽度验证。WebKit 截图：`tmp/manual-memberships-browser-MQP8Al/`，Chromium：`tmp/manual-memberships-browser-SAQ5jO/`。测试监听均已关闭；未做 iPhone 真机、生产迁移／部署或 IPA 打包。
