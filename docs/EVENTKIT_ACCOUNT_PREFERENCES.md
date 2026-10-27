# EventKit 同步偏好与重装恢复

设置页分别提供 `Sync Calendar`、`Sync Reminders`，保留 `Sync all`。单项执行只处理对应类型，不修改已保存的来源或路由；一键同步依次执行两项，错误和最近成功时间各自显示，一项失败仍检查另一项。共享同步锁按范围区分同次请求，不同范围等待当前操作结束，避免并发写入或把另一类型的结果当成本次结果。来源及 Reminder domain 路由默认折叠，摘要展示当前选择。权限请求继续分别进行，不由同步按钮代为申请。

Supabase 模式将 Calendar / Reminder 的 Off、Import、EO route enabled 及每个 EO domain 的 Reminder List 路由保存到登录账户的 `eventkit_preferences`。本地 localStorage 仅作为恢复后的缓存；保存成功后才更新缓存，网络或认证失败不会写入空偏好或启动错误同步。

Web 更新后，在现有 Host 打开一次 EO：若账户还没有备份，已有本地同步偏好会自动上传。看到设置页“同步偏好已保存到 EO 账户”后，卸载再安装并登录同一账户即可恢复。已经卸载且从未上传的旧偏好无法恢复。SQLite 本地模式不提供账户备份。

恢复优先匹配原 identifier；变更后按同一 source identifier + 列表名、或 source 名 + 列表名唯一匹配。同名歧义、来源缺失、写权限不足时暂停相关同步，并保留账户原偏好。不会随意选择同名列表。权限重新开放、来源重新出现后可以继续匹配。显式清空路由保留为关闭选择。

迁移 `202610050004_eventkit_preferences.sql` 使用用户行级读取隔离与 authenticated RPC 保存，不接受调用方指定 user_id；revision 检查拒绝并发覆盖。迁移已在真实数据库应用，相关数据库测试使用事务回滚，不保留测试账户和偏好。

账户恢复使用现有 `eventkit.getStatus` 能力，单独这一功能不需要新 Host。重装后 iOS 的日历、提醒权限仍按系统要求授权；保存偏好不代替系统权限。

本轮睡眠查询范围和历史队列调整需要新 Host，详见 `HEALTHKIT_SLEEP.md`。本轮不提交、推送或发布 Web / Host。
