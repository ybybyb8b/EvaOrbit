# Tracker 时间段属性

`time_range` 是自定义属性类型，不改变 Tracker 的时间模型或记录主时间。属性值仍放在 `values[field.key]` 中：

```json
{"startAt":"2026-10-05T15:30:00Z","endAt":"2026-10-05T17:00:00Z","durationMinutes":90}
```

开始与结束必须为带时区的明确时间，结束晚于开始；跨午夜使用不同日期。界面使用本地日期时间输入，提交 UTC 时间。服务端创建和修改均重新计算分钟数，不信任传入的 durationMinutes。统计、时间线和属性筛选使用派生时长。可选属性可以留空，但开始和结束不能只填一项。已有 Number 属性和历史值不会自动转换。

SQLite 启动迁移 69 扩展类型约束，保留字段 ID、稳定 key、归档状态、索引和自增序列。Supabase 对应 `supabase/migrations/202610050005_tracker_time_range.sql`；上线前须应用该迁移。本次验证使用独立临时 SQLite 数据库，未修改生产 Supabase。

回归测试覆盖跨午夜、非法时间、倒置范围、伪造时长的重新计算、创建与更新、统计，以及旧 SQLite 数据和迁移重复执行。浏览器检查覆盖桌面 modal、402 × 874 手机视口 bottom sheet、Group 自动展开/创建/键盘关闭与时间段保存；真实 Safari、PWA 和软键盘仍需实机验证。
