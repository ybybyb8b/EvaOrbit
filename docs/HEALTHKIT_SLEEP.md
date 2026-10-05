# HealthKit Sleep 与只读指标

## 权限与同步

Host authorization revision 为 `4`。用户在 Settings → Health & Native 点 `Update Health Access` / `Connect / Request Access` 时，新增申请 Sleep Analysis、Heart Rate、Resting Heart Rate、HRV (SDNN) 的 **read** 权限。原有 Body Mass / Menstrual Flow share 权限保持；四个新增类型均无 write 方法、无 share 权限。iOS 不公开各类型是否允许读取，Settings 的 Access requested 只表示授权流程完成。

原有 HealthKit framework、两个 entitlement、免费 Personal Team / patched xtool / usbmuxd 安装链保持不变。只更新 Info.plist 的读取用途文案，不增加 entitlement、framework 或 bridge method；bridge 协议仍为 v1。

`HEALTHKIT_SYNC_METRICS` 是服务端配置，默认 `sleep`。心率三项默认不会启动读取查询、产生 Native 样本/outbox、上传或写入 Supabase；服务端在任何 ingest 写入前拒绝 disabled metric，RPC 默认也只接受 sleep。Host 已包含四项类型的 observer、anchored read、标准单位序列化、持久 outbox 和上传路径。

后续启用配置示例：`HEALTHKIT_SYNC_METRICS=sleep,heart_rate,resting_heart_rate,hrv`。部署配置后在 Settings 重新连接（Revoke native upload → Connect / Request Access），注册响应会把 `syncMetrics` 传入既有 `healthkit.configureCredential`。不需修改或重建已包含 v4 能力的 Host。服务端量值使用 bpm (`count/min`) 与 HRV SDNN 毫秒 (`ms`)，没有心率 UI。

## 数据与可靠性

新增迁移：`supabase/migrations/202610050002_healthkit_sleep_read_samples.sql`。`healthkit_read_samples` 是逐样本的区间/阶段结构，独立于 Energy、3×3 Calendar 和手工健康记录；睡眠保存 start/end instant、原始 category、source、sync identifier/version、时区及其来源。允许未来 category 保留原值，摘要不会把未知阶段计为 asleep。服务端不切割跨午夜样本。

`healthkit_read_receipts` 存储设备/本地 stream 的单调版本；Native SQLite 的 stream UUID 跨重启稳定、随本地数据库重建而变化，避免 Keychain installation identity 跨重装保留而版本归零的问题。账户级 sample UUID 去重，永久删除 tombstone 防止失败重试或重装回扫复活原 UUID。anchor 与样本/outbox 在同一 SQLite transaction 提交；网络失败指数退避、重启恢复 inflight。上传仍走固定同源 `/api/healthkit/energy/ingest` envelope 中的独立 `readChanges`，不把 Sleep 编码为 kcal。

Sleep 首次完整读取可访问历史；明确更新 Health Access 会重置只读 anchors，避免先前未允许读取时的空 query 阻止补读。新只读数据上传成功后，通过现有 `eo:data-changed` 的 health domain 刷新 Home / Sleep 区域；本地 query 完成不等于远端上传完成。

## 摘要语义

- 3×3 / Calendar 继续是 **Sleep Window**；没有 HealthKit Sleep 时 Home 显示窗口时长，明确标记 **Timeline estimate / 时间线估算**。Health 的 Actual Sleep、效率与差值保持未知，不把窗口写成实际睡眠。
- Actual Sleep 计入 `asleepUnspecified / Core / Deep / REM`，排除 `In Bed / Awake`；同来源重叠区间取并集并扣除其 Awake，不重复加总。多个来源优先有阶段的来源，再按有效时长和来源 bundle 稳定选择；不叠加多个设备/来源。原始样本全部保留。
- HealthKit 无统一 session ID；连续/重叠区间或间隔不超过 **90 分钟**的区间归为同一 episode，较长间隔作为独立睡眠/小睡。这是摘要的明确启发式规则，不能宣称与 Apple Health 聚合结果逐分钟相同。
- 完整夜间 episode 按最后实际 asleep 区间结束的当地日期归属，午夜前阶段也保留在醒来日期。优先样本 metadata 时区；缺失时记录读取时的设备时区及 `device` 标记，无法还原缺失的历史时区。DST 用真实 instant 时差，不用墙钟相减。
- Home 与 Health 主摘要显示该醒来日期时长最长的实际睡眠；其他 episode 作为额外睡眠单列。窗口选择与主睡眠重叠最多的 Calendar 窗口；没有实际睡眠时保持既有主窗口 fallback。
- 有重叠窗口时：差值 = **Window − Actual**，效率 = **Actual / Window**。无窗口或不重叠时不计算。超过 100% 原样保留并提示检查窗口，不能截断掩盖不一致。

## 部署与验证

顺序：应用迁移 → 部署 Web/API → 原有 macOS CI 构建 IPA → 按已有链路免费重签安装 → 用户更新 Health Access。旧 IPA 与普通浏览器继续使用 timeline estimate；表尚未创建时 Web 对缺表做兼容回退，其他读取错误正常报告。

本轮的数据库测试运行命令：

```powershell
node --env-file-if-exists=.env.local --test scripts/healthkit-sleep-db.test.mjs
```

它在真实数据库单个事务内重放迁移、验证幂等/重装/旧版本/删除、disabled 心率零写入、显式配置启用、失败批次原子回滚和账户 RLS；最后回滚所有测试与迁移变更，**不等于已应用正式迁移**。Native outbox/策略单测位于 `HealthLocalStoreTests.swift`，需 macOS CI 执行。

真机仍须检查 iPhone 16 Pro 的首次/升级授权、Sleep 用户不允许读取、后台与前台同步、离线恢复、跨午夜/多来源/删除、Health Access 后补读，以及 Safari/WKWebView/PWA safe areas。不能以合成样本的 Web UI 截图替代这些检查。本轮不默认 commit、push、部署或发布 IPA。


## 2026-10-05：睡眠同步范围与首次历史积压

实际睡眠只展示醒来日期 `2026-10-01` 及之后的记录。Native anchored query 改为有界 overlap 查询，保留首个醒来日前一晚的阶段；为兼容样本原始时区，查询保留一天边界缓冲（最早 `2026-09-29T10:00:00Z`）。缓冲中的原始阶段不作为更早日期的实际睡眠展示。

升级 Host 后只重置一次 Sleep anchor，重新读取有限范围；已有更早睡眠的 pending upsert 不再上传，已有本地及服务端记录不删除，delete 任务保留。近期样本优先上传，delete 优先；原有 UUID / stream revision 去重保护继续有效。Energy、Weight、Menstrual Flow 的查询范围和同步行为不变，三项心脏指标仍默认关闭。

此次数据库排查没有找到 `2026-10-05` 的实际睡眠，只找到 2023–2024 年的历史睡眠上传。原队列 FIFO 会让历史积压排在近期数据之前。这证明了当前日期数据未到 EO，不能证明设备上近期数据已成功读取；安装新 Host 后仍需检查真实上传结果。

睡眠范围与队列调整需要重新构建、安装 Host。本地 Windows 未执行 Swift / iOS 构建或真机验证。
