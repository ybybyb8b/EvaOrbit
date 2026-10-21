# Native API 与在线 Host 减负整合

本次从 main `93eb1f5064e08119f5fd4ad368be3e564e62aa8b` 单独整理补丁，不合并 Local-first 开发分支。正式首页保留 main 的页面结构与样式；不上传本地 React 工作区、原生 SQLite 副本、Settings 本地 UI、Swift、开屏、打包或签名改动。

## 服务端范围

- 将此前已在线上部署的 `/api/native/*-readonly`、工作区只读接口及 Tracker 协议2适配纳入 main；只读接口使用明确的 Repository 白名单，避免订阅补账、提醒校准等读取副作用。
- Tracker 同步只经过 `tracker_sync_v2` 原子 RPC，保留账户隔离、版本冲突、幂等回执、完整快照和远端删除对账。旧非事务 helper 不连接路由，回执失败时不释放已执行业务写入的占用。
- `202610180001_tracker_local_sync.sql` 是 2026-10-20 已单独获准应用的生产迁移，本次只补齐仓库文件，不重复执行任何生产 migration；不加入 Media completion 迁移或未发布的 Media 写入功能。
- Session 声明 `aiConfigurationProtocol:1` 与 `settingsConfigurationProtocol:1`；AI、生活日、日历解读设置附账户头时，proxy 在路由前校验当前账户。普通 Web 设置保持原认证方式。开发版尚未发布的新配置通道仍需其下一 IPA，本次不上传开发版改动。
- Media 只读集合、观看历史支持有界完整分页；同步修复服务器 SQLite 后备分页，以保持 Supabase/本地测试语义一致，不修改 Native SQLite。

## 在线 Host 减负

- Home 首次请求共享一次订阅补账，提醒校准与日/月聚合并行；在同一服务端渲染中复用人物、订阅与观看历史等已审计读取，缓存不跨请求或账户。
- 一次变更集中触发一次页面刷新，复用服务端今日与当前月，历史选中日期/跨月摘要仍按需刷新；保留日记草稿、选中日期和展开状态。网络恢复继续由统一协调器处理。
- EventKit 按启用的 Calendar/Reminder 类型查询和同步，关闭的类型不读写、不把未查询当成删除；全部关闭不做业务扫描。同步中间写入不逐条刷新，只发布已提交业务变化，失败前已提交的变化仍通知。
- 原生通知重叠请求复用同一轮，运行期间新增事件保留一轮补偿；日期/时区 formatter 与日期窗口复用，不改 date-only 或显式时间语义。

没有数据库模型、系统权限、entitlement 或原生二进制变化；在线 Host 加载更新后的 Web 即可生效，不需新 IPA。

## 验证与回退

在 main 隔离工作区运行 lint、typecheck、全套测试和生产构建。只读服务在隔离 SQLite 写入触发器封锁下验收；Tracker 使用临时 PostgreSQL/PGlite 校验重复迁移、回执重放、并发版本、远端删除及错账户拒绝。可选 SQL 引擎未安装时明确跳过；不将跳过计为通过。

保留发布前 API-only 部署 `dpl_2UWoJStXatpUb5FdYwNViWT9k2xh`。应用回退只提升旧部署，不卸载开发版、不清队列、不回填旧备份或删除协议2表/字段。本次不运行生产业务写入测试。

发布前本机实际验证：599 项测试，587 通过、12 项可选 SQL 环境跳过、0 失败；本机已安装的可选 PGlite 引擎执行了 Tracker 原子 RPC/幂等/RLS 测试。main 锁文件独立安装的运行时依赖下，lint、typecheck、生产构建通过。实际 Next 浏览器（独立临时 SQLite）验证 402/1280 宽度无横向溢出，连续 5 次已提交同步事件合并为一次 RSC 刷新，今日/当月重复 API 读取为 0，页面异常为 0；测试服务已关闭。

`npm ci` 沿用 main 锁文件，报告既有依赖审计 11 项（10 high、1 critical）。本次未升级依赖或执行 audit fix；依赖修复须单独评估，不能把原有审计告警算作本次已解决。
