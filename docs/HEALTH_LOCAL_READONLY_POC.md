# Health 本地只读阶段

## 共享边界

开发版直接渲染原 Web Health 总览、Sleep、Weight、Training、Energy、Period & medication、Records 列表及详情，以及原有创建/编辑表单。`HealthView` 和健康记录详情仅保留 Next 导航包装，实际内容由 Web 和本地共同使用；组件的数据请求默认仍走原 Web fetch。本地通过 `HealthDataProvider` 注入下载快照读取与受限导航，不重写业务规则或视觉样式。

本地支持表单临时草稿和既有控件。`FormPreview` 下所有提交函数、删除、解决/重开、训练日推进提前返回，保存/删除按钮禁用；只读适配层再次拒绝非 GET。体重和经量不会写 Apple Health，不配置原生凭据、不申请权限、不调度提醒。Sleep 的系统设置链接暂不可用，正式 Web 的 HealthKit/EventKit/通知能力保持原样。未接入独立的 Apple Health 设置页。

## 数据与缓存

新增 `GET /api/native/health-readonly`，由当前 Native 认证账户聚合原 Services/Repository。只读 Repository 白名单拒绝任何命令；原 `listScheduledNotifications` 增加显式只读选项，跳过订阅自动补账和用药提醒校准，Web 原默认行为不变。Apple Health 能量读取仍走原服务的认证 Supabase SELECT/RLS。

有界快照包含：最近 100 条健康记录、最多 1,000 条体重、今日和近七天训练、现有训练计划/候选、当日睡眠与能量、最近七条能量历史、近六个月周期（最多30条，加一个更早的进行中周期）、最多60条经量/服药及100条药物配置、既有用药提醒。到达数量边界不代表完整历史；ALL/筛选仅作用于已下载数据，不应将未下载解释为账户无记录。日期和 explicit-time 标记按原业务模型保存，不补造时间。

新增 `health.readOnlySnapshot`，Bridge v1 与本地 main-frame/origin 白名单不变。Native 只允许精确 GET `health-readonly`，执行既有 SQLite 备份验收、刷新前后身份/generation 校验；新增 `health_readonly_cache`，每账户最多8 MiB。不修改旧 state/outbox。浏览器沿用账户隔离 IndexedDB，保存事务再检查当前账户。非法响应、账户变化、404或断网不覆盖旧缓存；旧 Host 缺少方法时要求升级，不能回退至有副作用的聚合接口。

## 验证与发布

- `scripts/health-readonly.test.mjs`：隔离 SQLite，全业务表 INSERT/UPDATE/DELETE 触发器封锁；实际聚合、日期语义、适配层和错误快照验证。
- `scripts/health-offline-browser.mjs`：英语/August、402/900/1280、原版分区与表单、强制提交、断网重启、异常身份/响应保留缓存和队列、打包 CSP 与模拟 Native Bridge。
- Native XCTest 增加独立缓存持久化、错误账户/超限拒绝、网络路径和方法白名单、旧队列保留测试。Windows 无法运行 XCTest，须由 macOS CI 和 iPhone 16 Pro 补齐。

API 未部署时需要单独批准发布，不要求本阶段新增生产 Supabase migration。打包 React/Swift 均已改变，需要重建并覆盖安装独立 PoC IPA。生产 API/UI 发布、提交推送、真机通过各自单独记录，不能把浏览器模拟当成真机结果。回退时保留安装与数据库，允许新增缓存表留存，不清空旧队列。

本轮 Windows 验证：全量 Node 测试621通过、12环境依赖跳过；lint、typecheck、Next生产构建、本地资源构建及diff检查通过。浏览器验证了只读页面/表单、强制提交、体重尺键盘交互、离线重启、错误账户/非法响应保留缓存，以及打包CSP/模拟Bridge；隔离SQLite下原Web体重保存/设置、训练编辑器和健康记录解决/编辑API往返通过。临时服务已关闭。Vite保留既有大包告警（当前JS约1.30 MB，gzip约392 KB），未在本阶段引入拆包重构。生产API、macOS XCTest及iPhone验收尚未执行。
