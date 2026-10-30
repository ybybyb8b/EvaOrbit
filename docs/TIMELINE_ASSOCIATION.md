# Timeline 关联规则（第一阶段）

## 范围与存储

Settings `/settings/timeline-association` 支持新增、编辑、启停、删除 Calendar ↔ 指定 Tracker 规则。
仅生成 Timeline 展示分组，不写业务记录，不改变 Tracker、饮食或活动统计。
单次手动关联／拆分、其他关联类型不在本阶段。

`ui_preferences.timeline_association` 保存 `{schemaVersion:1,revision,rules:[]}`，沿用账户 RLS 和 revision CAS。
Postgres 为 JSONB，SQLite v93 为 JSON TEXT；备份沿用已有 ui_preferences 白名单。
API 精确 `GET/PUT /api/timeline-association`，校验配置及启用规则的 Tracker 存在性。
删除 Tracker 不自动删规则，用户可重新选择或停用失效规则；Tracker 改名不影响 ID 关联。
新类型通过 `type` 判别联合扩展，不提供脚本、正则、模糊名称或优先级。

## 匹配

- 标题完全／前缀匹配，沿用 NFC 与 emoji presentation selector 规范化，区分大小写，不解析备注。
- 默认 `near_end`：Tracker 结束时间（无结束则记录时间）距 Calendar 结束前后 5 分钟。
- `within`：整个 Tracker 时段落在 Calendar 时段及容差内；点记录按单点判断。
- `range`：双方明确起止，起止差均在容差内，交集／较长时段至少 80%。
- 容差为 0–60 整数分钟，双方活动最多 6 小时；Calendar 必须 confirmed、非全天、有效且带时区时间。
- 当前 Tracker 没有日期精度字段，原始 occurredAt 为明确时间。不从创建时间或午夜猜测精度；匹配器拒绝日期字符串及未来显式标记为未知时间的记录。
- 全部启用规则统一生成候选，重复命中同一对只记一次；两端候选数均为一才关联，不按顺序抢占或传递合并。
- 餐次日历保留给 Food，不参与 Tracker 自动匹配；餐次算法及 Food 编辑链路不变。

## 完整性与跨日

按可见范围前后各两天读取，覆盖 6 小时活动、60 分钟容差及竞争窗口。
Calendar、Tracker Entry 均使用 `id > cursor` 升序、每批 200 条，直到空页；短页不代表完成。
每源超过 10,000 条或游标异常时不自动合并，保留既有独立展示。请求错误走原 Home 错误／旧快照保留机制，不将失败当空列表。
此分页不提供并发编辑期间的数据库事务快照；下一次读取重新派生，不持久化自动结果。

匹配后按现有自然日与 Calendar 排他结束边界投影。跨日组每天最多一行；若 Tracker 位于日历结束后的次日（包括恰好午夜），原 Tracker 日期仍显示关联组。
`TimelineEvent.association` 保留完整 CalendarEvent、Tracker、TrackerEntry、命中规则 ID，原始时间不替换。字段可选，兼容旧快照。
首期只移除 Calendar／Tracker 行，不影响 Home 完成事实。原始日历可查看并在源应用编辑；Tracker 深链 `?entry=<id>` 打开所属原记录表单，服务端校验记录所属 Tracker，本地使用对应 serverId 副本。

## 双端、缓存与发布

Home 日、月、listTimeline 和 Native 只读聚合调用同一匹配／投影。
保存规则使 Web Home 快照及相关域失效。本地按账户记录保存时间，联网访问旧日／月快照时重新下载；离线保留带下载时间的旧快照，不再实现本地匹配器。
本机未同步 Tracker 继续使用独立副本，同步并刷新 Home 后才参与关联。
本地管理复用 `settings.configuration`，只增加精确路径及 GET/PUT，不入 outbox、不缓存配置、不自动重试。
旧 IPA 拒绝新管理路径，需升级或在 Web 管理；既有 Home 读取路径可展示服务端新结果。

纯函数测试覆盖冲突、容差、精度、跨日／月、截断；SQLite 集成覆盖持久化、CAS、旧偏好迁移、餐次和统计；PGlite 检查迁移幂等、RLS、CAS。
浏览器脚本 `scripts/timeline-association-browser.mjs` 使用合成账户／接口验证共享设置、Home、原始记录入口、并发冲突与 402/1280 视口，无线上写入。

正式发布顺序：先应用 `202610300001_timeline_association.sql`，再部署兼容 Web/API；本地 IPA 按用户确认的独立批次重建，不是 Web 发布的前置条件。
若本批次不打包 IPA，包含 Swift 改动的推送使用 `[skip actions]` 提交标记，避免触发现有 push 打包工作流，不修改工作流配置。发布与验收结果由 Project 记录。
Windows 的浏览器／构建检查不能替代 macOS XCTest／iPhone 16 Pro 真机验收。
