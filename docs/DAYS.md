# Days／如期

## 农历规则

- `date` 始终保存原始日子对应的真实公历日期，用于累计天数、排序和仅日期记录；不写入虚构时间。
- `calendar` 为 `solar`／`lunar`，默认公历；农历另存 `lunar: {year, month, day, leap}` 和 `lunarLeapPolicy`，保留最初年份，不拿今年的公历换算日代替原始日期。
- 农历年范围为 1901—2100；年度重复按农历月、日计算。普通月只纪念一次，不因同年另有闰月而重复提醒。
- 闰月事件默认 `regular`：有同名闰月时使用闰月，没有时按同名普通月；可选 `skip`：只在该闰月出现的年份纪念。
- 年度事件的三十日遇到小月按二十九日计算。原始日期仍须真实存在，不能把原本不存在的闰月或三十日自动当作合法输入。
- 支持范围末端找不到下一次日期时返回空，不编造排程；累计天数仍保留。公历原有 0100—9999 年范围不变。
- 表单切换历法保留同一个真实日期，联动年份、有效月份（含闰月）和日期；年份／月份变动造成日期调整时明确提示，并显示对应公历及下一次纪念日。

## 计算与存储

`lunar-calendar.ts` 与 `important-dates.ts` 为 Days、Home 日聚合及现有 Days Widget 共用的纯函数。`lunar-calendar-data.ts` 为 `lunar-javascript@1.7.8` 生成的 200 年月界与大小月数据；依赖只用于开发生成，不加入客户端运行时。不要使用平台 `Intl` 直接计算纪念日：本轮发现 Node ICU 77.1 对 2027 年春节返回 2 月 7 日，与香港天文台的 2 月 6 日不同，已有回归用例。

Postgres 迁移包含相同的固定数据及下一次日期计算函数；SQLite 使用共享 TypeScript 函数。日期保存和唯一提醒投影保持原事务边界，原来的后台年度提醒刷新覆盖农历，无需打开 App。

生成脚本：`node scripts/generate-lunar-calendar.mjs`。扩展范围或修正数据必须同时新增数据库迁移，不能改写已应用迁移。测试覆盖每个支持日期的双向换算、每个 Postgres 农历月的首尾、公农历跨年、大小月、2033 闰冬月、闰月两种重复政策、旧客户端和提醒更新。

发布顺序：先应用 `202611270001_important_dates_lunar.sql`，再发布 Web/API，最后更新本地 IPA。未显式提供历法字段的旧客户端保留既有农历信息；其公历锚点与农历不一致的修改会被拒绝。备份版本为 24，兼容旧公历备份；SQLite 与 Postgres 的农历备份统一为 JSON 对象。

## MCP

仍使用既有八个通用工具，不增加专用工具或任意表 CRUD：

- `important_date`：查询、详情、新增、部分更新；`pin`／`unpin`／`archive`／`restore` 操作。永久删除复用业务删除并取消所属提醒，保留通知历史；普通 OAuth 连接按现有规则不额外开放永久删除。
- `important_date_category`：只读分类名称、共享颜色覆盖、实际默认色与有效／归档数量。ID 是精确分类名，可返回保留的无事件分类。分类／颜色修改通过一个日子的 `category` 与 `category_color` 完成，Web 表单通过分类选择器独立保存名称与颜色；MCP 仍从日子修改共享配色。
- 两个资源支持 cursor 分页，默认 20、最多 100 条。日子默认 `status=active`，还可选 `archived`／`all`，以及分类、置顶、历法、重复规则、日期范围。
- `from`／`to` 为下一次实际公历日期的闭区间；`as_of` 为参考自然日，默认上海今天。返回 `next_date`、`remaining_days`、`elapsed_days`、`day_number`、`anniversary_years` 和 `calculated_for`。分页冻结参考日，须使用相同关键词和筛选；修改数据后重新开始遍历。
- 字段采用 snake_case：`lunar_leap_policy`、`category_color`、`reminder_time`、`reminder_days_before` 等；`lunar` 是完整 `{year,month,day,leap}` 对象，不接受只有 day 的嵌套补丁。
- `eo_update` 保留未提供的字段。农历日子修改完整 `lunar` 而省略 `date` 时推导新公历锚点；仅切换 `calendar` 时保留同一真实日期。派生字段、内部 user_id、未知字段均拒绝。
- `category_color` 显式改色会影响同分类全部日子，null 恢复默认色。只修改名称／备注不会重放旧的共享颜色。提醒必须有显式 HH:mm，上海时区；null 关闭，不把日期记录补成午夜。

示例调用（dateId 必须来自查询结果）：

```js
eo_search({resource:"important_date", filters:{calendar:"lunar", as_of:"2027-07-01", from:"2027-07-01", to:"2027-07-31"}})
eo_create({resource:"important_date", data:{title:"农历生日",calendar:"lunar",lunar:{year:2025,month:6,day:1,leap:true},recurrence:"yearly",lunar_leap_policy:"regular"}})
eo_update({resource:"important_date",id:dateId,data:{note:"只改备注，保留原日期和提醒"}})
eo_action({resource:"important_date",id:dateId,action:"archive"})
eo_search({resource:"important_date_category"})
```

发布须在农历迁移后应用 `202611270002_important_dates_mcp.sql`，再发布 API；不需要新的 Bridge 或 IPA 才能开放远端 MCP。日期与分类表继续按账户隔离，OAuth 仍须经过已验证的服务端 Data API 桥接。新资源不会自动加入既有连接权限，在 AI 访问管理中显式授权。检索不构成新增／改写日子的授权。

## 与 Days Matter 的功能差距

以下是功能评估，不代表本轮已实施。参照 [Days Matter 官方介绍](https://app.ipad.ly/idays?lang=zh_hans)、[官方 Android 介绍](https://daysmatter.com/android?lang=zh_hans) 与 [App Store](https://apps.apple.com/cn/app/倒数日-days-matter/id406170251)。

| 优先级 | 缺失能力 | 对 EvaOrbit 的建议 |
| --- | --- | --- |
| 已补齐 | MCP 查询及管理（EvaOrbit 自身能力） | `important_date` 与只读 `important_date_category`，复用日期校验、年度规则和提醒。 |
| 已补齐 | 月／周重复 | 每周固定星期；公历每月缺日取月底且不漂移；农历每个实际月含闰月，小月三十取二十九。 |
| 已补齐 | 起始日计数方式 | 事件级计数支持已过天数或第几天，Days、Home 与内部 Widget 共享展示，不改变提醒和排序。 |
| 中 | 100／365／1000 天等里程碑提醒 | 从原始日期派生，复用通知通道，避免自动创建重复 Task 或 Calendar 事实。 |
| 中 | 重要日子日历总览 | 先做日历上的日期投影／标记，包含农历的实际公历落日；不把未来纪念日写成已发生事件。 |
| 中 | 日期计算器 | 两日期间隔、某日加减天数；范围小，可复用自然日算法，不绑定事件保存。 |
| 部分完成 | 背景、图标、海报分享 | 已支持材质、纯色、渐变、照片、完整图片预览及裁切；图标与导出分享后置。 |
| 低 | 独立隐私锁、历史上的今天 | 隐私锁需明确 App 生命周期与安全目标；历史内容需要独立的数据来源，均不属于农历补齐。 |
| 后置 | 系统小组件、Watch、iMessage | 沿用先不做的约定；与软件内部现有 Home Widget 区分。 |

现有基础已包含公历／农历正倒数、年度重复、分类与共享颜色、固定三张置顶、搜索、归档、云端保存／备份、Bark／Web Push 和 Home 的日子展示。支持月周重复；其余独立功能尚未扩展。

农历参考：[香港天文台公农历对照](https://www.hko.gov.hk/en/gts/time/conversion.htm)、[2027 年对照文本](https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2027e.txt)、[lunar-javascript 源码与 MIT 许可](https://github.com/6tail/lunar-javascript)。

## 背景、分类与计数

- 发布前须按序应用 202611270001、202611270002、202611270003 和 `202611270004_important_date_repeats.sql`，再发布 UI/API。SQLite 迁移 106/107 增加背景与计数设置。备份 v24 含照片字节、背景参数及计数口径，兼容旧版本。
- `countMode` / MCP `count_mode` 默认 `elapsed`，保持旧记录显示；`ordinal` 从原始日子累计，当天为第 1 天（英文 Day 1），年度重复不重置。未来日期仍倒数。不改变排序、下一次日期和提醒。MCP `day_number` 在原始日前为 null，其余为 elapsed_days + 1。
- `background` 是完整替换对象：none；solid + color；gradient + color/secondary；photo + x/y 0—100、shade 0—1、zoom 1—3（默认 1）。颜色为 #RRGGBB。新增照片需 image data URL，修改裁切时省略 image 保留原图；省略 background 保留现有设置。
- 浏览器接受最大 20 MiB 的 JPG/PNG/WebP，压缩为最长边不超过 1024、小于 100 KB（100,000 字节） 的 JPEG，与事件原子保存。保存后保留压缩原图，可重新裁切，不因每次裁切破坏性重采样。表单裁切预览为 4:5，支持拖动、位置、缩放和遮罩，用于首页卡片。展开预览按照片原始比例完整显示，不应用裁切或遮罩；名称、计数和日期位于照片下方，玻璃材质用于外框与信息区。
- `important_dates.background_image` 与 md5 版本独立存储，列表、保存结果和 MCP 排除图片字节；账户隔离的 JSON `GET /api/important-dates/:id/background?v=版本` 按需读取，沿用账户绑定业务缓存。无缓存时退回主题材质，不阻断列表。
- 点击列表或置顶进入主题预览，外侧「编辑日子」打开原表单；复用 FormSheet 焦点、关闭和滚动管理，减少动态效果时移除形变。列表照片只作右侧低对比背景，置顶保持固定三张，长名称完整换行。
- 分类在共享 SearchableSelect 内选择、新建及改色；`POST /api/important-dates/categories` 显式独立保存，取消事件不撤销已保存分类。颜色由分类共享，事件表单不再提交旧 categoryColor；既有 API/MCP 的显式 category_color 仍兼容。

## 月周重复和展示方向

- `recurrence` 支持 none / weekly / monthly / yearly；公历月重复遇到不存在的日号取当月最后一天，下个月重新使用原始日号。农历月重复按每个实际月（含闰月）计算，三十遇小月取二十九；年度闰月策略只影响年度重复。周重复始终按原始日期每 7 个自然日计算。
- `displayMode` / MCP `display_mode` 为 auto / elapsed / countdown。auto 保持已有行为；elapsed 从原始日期累计；countdown 按下一次发生日期倒数，单次日期过后显示已过天数。未来原始日期始终显示倒数。
- `countMode` 独立控制正数累计：elapsed 起始日为 0，ordinal 起始日为第 1 天。选择倒数会暂时忽略计数口径，切回正数保留设置。累计值不会按重复周期重置。
- 周提醒可提前 0—6 天，月提醒 0—27 天，避免提醒越过下一周期而永远落在过去；表单、API/MCP 和 Postgres 约束一致。现有后台提醒刷新现覆盖周、月、年，改名或置顶不重复发送。
- 新迁移 202611270004 更新 Postgres 约束、下一次发生日、保存 RPC、照片预算和提醒刷新；SQLite 108 保留旧表所有列、索引及自增历史。备份 v24 兼容 v23 及以前，旧客户端省略 displayMode 保留现有设置。
- 新图片严格小于 100,000 字节；浏览器逐步压缩分辨率与质量，API/MCP 和数据库校验相同上限。既有 100—128 KiB 图片继续读取及调整裁切，不强制丢失或重传原图。
