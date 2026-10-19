# Subscriptions 本地只读验收

本阶段将订阅接入现有独立 UIKit + WKWebView Host 的本地 React 包，不开发独立 SwiftUI 界面。侧栏和手机抽屉沿用共享导航；英语、August、主题及响应式样式与 Web 相同。

## 复用与边界

- Web 与本地共用 `SubscriptionsContent`、`SubscriptionPreview`、`SubscriptionDetailView`、`SubscriptionIconField` 及原有轮播、颜色采样、统计、日期与表单组件。Web 包装只保留 Next router.refresh；本地通过 `SubscriptionsDataProvider` 注入本地导航、GET 与图片来源。
- 包括总览卡片/轮播、状态筛选、账簿列表、分币种趋势、付款历史、价格变动，以及新增、编辑、付款、恢复表单。表单可编辑临时草稿，提交按钮与 handler 双重阻断；暂停/结束、图标上传/移除及所有业务写入禁用。恢复按钮允许打开日期表单，不实际修改状态。
- 正常订阅服务 `listSubscriptions/getSubscription/getSubscriptionDetail` 会补记自动续费并推进续费日，不能当作只读接口。新增 `/api/native/subscriptions-readonly` 认证当前账户后，仅通过 `withSubscriptionsReadOnlyRepository` 白名单直接读取原 Repository；不调用补账、提醒校准或状态命令。原 Web/MCP 业务语义不变。
- 已上传图标通过原认证图片读取服务获取字节，内嵌为 data URL；内置品牌图标随 React 包加载。本地不回退到普通订阅 GET、受保护图片 URL 或第三方图片接口。

## 数据与离线

`subscriptions.readOnlySnapshot` 扩展既有 bridge v1，仅对本地 PoC main frame 开放。Swift 白名单只允许 GET 新快照接口；刷新前后检查账户和 generation，沿用首次读取前 SQLite 备份与 quick_check。旧 Host 缺少能力时提示升级，不调用旧 GET。

原生新增独立 `subscriptions_readonly_cache`，每账户单条快照最多 8 MiB；浏览器使用现有 IndexedDB 的账户隔离键 `subscriptions-readonly:{accountId}`。两个平台均先展示缓存、后台刷新，支持网络恢复和回到前台刷新。失败、账户不符、缺失图标、损坏或超限响应保留旧快照，不修改 Tracker state/outbox 或原队列。

快照最多 200 个订阅、5,000 条历史（付款与价格变动合计），单订阅任一历史列表达到 1,000 行边界时拒绝下载，不能声称全量历史已完成；上游列表仍需后续分页方案。上传图标单张最多 4 MiB，仍受总体 8 MiB 限制。首次下载耗时需真实账户验收。

账簿、历史和统计基于已下载记录及下载当日，不伪造扣款；预期支出继续使用原版纯计算，实际支出按记录及币种独立计算。离线期间不会补记自动续费，Web/MCP 后续正常操作可能推进云端数据；待刷新后呈现新快照。只读聚合不是跨表事务快照，不能等同于财务同步或写入验收。

## 验证

- `subscriptions-readonly.test.mjs` 使用临时 SQLite 和合成逾期自动续费订阅、不同币种付款、价格变化、暂停/结束订阅及图标；对所有业务表添加写入阻断后执行真实只读服务，证明不补账、不推进日期、不修改提醒、状态或金额历史。另校验账户、日期、重复 ID、父引用、金额合计、图片和容量。
- `subscriptions-offline-browser.mjs` 检查原版轮播/列表/趋势/详情、图片加载、表单强制 submit、离线关闭后重启、错误账户/损坏响应保留快照、旧冻结队列不变、402/900/1280 布局。实际打包 CSP + bridge 模拟无 API fetch；使用合成数据，不等于 WKWebView/真机或真实 Supabase 账户验收。
- 新增 Native XCTest 覆盖 SQLite 重开持久化、错误账户/超限拒绝、旧队列不变、账户隔离与 GET 白名单。Windows 无 Xcode，需 macOS CI 实际执行后才可称通过。

本轮已执行：lint、typecheck、Next 生产构建、本地 React 打包通过；全量 Node 测试 622 项，610 通过、12 跳过、0 失败。订阅浏览器验收以及 Cat、Food/Drink/Places/Library、Home/Tracker 离线回归通过，业务写请求为 0。全部使用隔离合成数据；尚未部署新 API、运行新增 XCTest 或进行本模块真实账户真机验收。打包仍提示单 JS chunk 大于 500 kB，未在本阶段另行重构拆包。

## 发布与回退

当前只改源码，未提交、推送、部署、应用生产 migration 或打包新 IPA。无需生产数据库迁移；新只读 API 的生产发布仍需单独确认。生产发布必须保留先前独立上线的 Home 只读补丁，不能直接部署整个开发分支。

需要新独立 PoC IPA 才能在手机访问本地订阅。HealthKit、EventKit、通知、签名、权限、framework 和 entitlement 不变，沿用已有 macOS CI → ad-hoc IPA → patched xtool → Personal Team → Windows/WSL 安装链。Actions 运行结果由用户查看。

真机需验收真实上传图标、历史兼容、轮播触摸、表单键盘、安全区、下载耗时及离线冷启动。回退可覆盖安装已验证的上一独立 IPA，保留 SQLite 和未同步队列；新增缓存表可留存，不卸载开发版/正式 EO、不清队列。验收安装使用 `EVAORBIT_SKIP_RENEWAL=1`，避免改动生产续签 Task。
