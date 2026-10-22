# 本地 React：在线业务读写

## 范围

这是现有 Tracker Local-first 的补充，不是把所有模块改成离线同步。

- Tracker 保留独立 SQLite/IndexedDB 副本、协议 2、冲突处理与 outbox；旧队列不参与本轮请求。
- Food/Drink（含地点、库和限额）、Health、Cats、Subscriptions、Chronicle、Memo、Inbox、Relations、Media、Tasks、Projects、Lucius 复用原版页面、业务 API 和表单，新增在线保存、修改及原页面提供的删除/归档/完成操作。
- Home 开放已有日记和 Due 操作；跨模块详情导航仍沿用当前本地导航边界。
- 离线可以打开安装包、查看已下载快照和填写临时表单；除 Tracker 外，保存需要联网，不建立离线写入队列。
- Settings 的 AI/生活日/日历解释继续使用各自已有的在线白名单。Tracker 高级设置共享 Web 控制器，联网保存；Eva、Memory Graph 不在本轮扩展。系统设置面板及其启用边界见下文。

## 共享实现与安全边界

- `BusinessRequestContext` 为表单提供绑定到打开该表单账户的 request；Web 默认仍调用原 fetch。多步提交的第二个请求不能因为后来登录另一个账号而改变归属。
- `business-request.ts` 仅为候选历史等非 React 读取帮助函数提供本地适配，不替换 `window.fetch`；本地环境下，其无绑定入口拒绝写入。
- `business-routes.json` 是显式的路由/方法清单，Vite 代理和 Swift 读取同一份清单；本地包构建时将其输出到 `TrackerWeb/business-routes.json`。禁止任意 URL、路径转义、MCP、备份、凭据、Tracker 同步、HealthKit/EventKit ingest 和提醒投递接口。
- Native 新方法 `business.request` 只供本地包主框架使用；先校验 SQLite 当前账号、会话身份及 `onlineBusinessProtocol:1`，冻结 Cookie，使用 ephemeral URLSession，禁止重定向，写入前后校验 generation。服务端 proxy 对所有带 `X-EvaOrbit-Account` 的业务 API 检查 Cookie 账号，错配 409。
- 只接受 JSON 或图片表单使用的 multipart，单次正文最多 8 MiB。网络结果不明确时提示先刷新确认，不自动重试，不宣称通用 API 具备 Tracker 的幂等/冲突协议。
- 已确认的云端保存不会因为后续缓存刷新失败而变成“保存失败”；另行提示本地副本尚待刷新。
- 本轮修复了 Native Settings 分派中 HTTP method 覆盖 bridge method 名称的问题，避免 `settings.configuration` 被错送到 AI 白名单。

## 下载和缓存

保留原有账户隔离快照及容量范围，进入模块时先显示缓存再刷新。在线保存确认后立即返回，后台刷新相应模块快照，再通知已打开页面读取新数据；失败单独提示，不把已保存操作变成失败。快照优先于较旧的 API 列表缓存，避免已获知的远端删除重新显示。

在线 GET 另有访问缓存：Native 存 SQLite 的 `online_business_cache`，每账户最多 128 项/64 MiB、单项最多 8 MiB；Windows 浏览器存既有 IndexedDB `states` 命名空间，每账户最多 128 项、单项最多 8 MiB。写入失效只针对相关模块，不清空其他模块快照、Tracker 副本或旧队列。

Food 记录可按日期联网查询，访问结果可以缓存；其他列表沿用原 API 的筛选与数量限制。**近期快照与访问缓存不等于整个账户的全量历史下载**。删除/归档遵守各模块原服务语义。普通订阅 API 保留 Web 原有自动补账行为，不能用于后台只读预下载。

## 测试账号和发布前置

`EVAORBIT_ALLOWED_EMAIL` 仍为原账户；额外测试账号必须由服务器显式配置 `EVAORBIT_TEST_EMAILS`（逗号分隔，默认空）。Native 登录、Web 登录、session、proxy 和业务 Repository 使用同一判断，Supabase 用户身份及 RLS 不变，不使用 service-role 绕过隔离。未配置时，创建 Supabase 用户仍不能登录 EO。新增在线业务通道另要求 session 的 `onlineBusinessTestAccount:true`；正式邮箱即使误填入测试清单也不能使用该通道，避免普通订阅 GET 自动补账。原账户继续使用现有 Tracker 同步和其他模块只读快照。

2026-10-21 已根据用户追加授权完成服务端发布：用户创建并确认测试账号 `504063450@qq.com`；生产新增独立的 `EVAORBIT_TEST_EMAILS` 配置，正式账户配置未改动。已应用下述 Media 迁移、发布 API 候选并验证正式域名。未合并 main，未安装本轮真机包。

发布必须基于实际候选核对业务 API，而不是只添加 session 协议标识：开发分支包含尚未进入 main 的 Media 母作品改名、首次完成契约等。`202610200001_media_completion.sql` 已在隔离 PostgreSQL 验证并获用户授权后应用生产；其安全调用者 RPC、权限与迁移校验和已核验。API 候选同时包含原版 Media 页面与首次完成契约；候选在隔离 SQLite 上验证母作品改名、纯季度数字和首次完成日期。不得为了绕过缺失能力降低校验或非原子补写观看历史。

## 验证与回退

`scripts/online-business-browser.mjs` 使用完全拦截的合成账户验证各模块通道、原版 Inbox 表单创建/状态更新/删除、离线业务请求中断后的重载和拒绝写入、旧协议/错账号/正式账户阻断、结果不明时不重试、旧队列不变，以及本地打包界面的原版 Inbox/体重表单 Bridge/CSP。这不等同于真实 Supabase RLS 或 iPhone 已验收。

新增 XCTest 覆盖共享清单和 SQLite 缓存重开、账号隔离、模块失效。Windows 不能运行 XCTest，需 macOS CI。真实测试账号的两账户隔离、图片上传、各模块完整业务验收和真机启动/键盘/安装覆盖仍需实际执行。

回退只替换旧 IPA/API 并撤销额外测试账号的服务器授权，不卸载、不删除本地数据库或冻结队列。新缓存表是附加表，旧 Host 可以忽略。

## 本轮实际验证记录

- 完整测试运行一次：654 项中首次 610 通过、32 失败、12 项可选数据库环境跳过。失败均为旧测试夹具缺少新 Context/策略/账号函数；补齐夹具后，受影响组及新增策略共 49 项通过。最终测试账户限制追加验证 16 项通过；未重复运行完整套件。
- 14 个业务入口的合成账户通道检查，以及原版 Inbox 增改删、业务网络中断后重载/拒绝写入、正式账户/错账号/旧协议阻断、丢失响应不重试、旧队列不变通过。打包资源中的原版 Inbox 和 Weight 表单通过模拟 Native Bridge 保存，CSP 下没有直接 API 网络请求。此处是传输与共享界面验证，不是所有模块的真实 Supabase CRUD 验收。
- Tracker 原独立副本浏览器回归通过，包括重启、断网恢复、丢回复幂等、冲突、远端删除和暂停；不替代既有真机结论。
- lint、TypeScript、本地 React 包构建通过。Web 编译/类型曾通过但沙箱两次在写入 prerender 目录时遇到 Windows EPERM；使用隔离 SQLite 在沙箱外完成 Web 构建。
- XCTest 及本轮 iPhone 验收尚待 macOS CI 和用户执行；没有测试账户密码，因此没有宣称真实登录后的全部模块 HTTP CRUD 已验收。

## 服务端发布与回退记录（2026-10-21）

- 独立 API 分支 `codex/local-online-api-release`，提交 `7706e8f56e89bd4468925fef1c529b92c2462017`，以 main `43dfca3` 为基线选择发布；未合并 main。候选构建时唯一未提交差异为 Next 自动生成的 `next-env.d.ts`。
- 正式域名 `https://eva-orbit.vercel.app` 已指向 `dpl_9XSdmsi5sGRJRVoQNXSo4y2TMnsV`（`eva-orbit-ia40i5tex-echopad.vercel.app`），候选和切换后的 22 项匿名访问/会话缓存检查通过，临时保护绕过令牌已撤销。
- 旧部署 `dpl_EJQaA7gy6xqALuoaXwu2XvLfs1am` 保持 READY，可重新 promote 回退；新迁移仅增加 RPC，回退应用不需删除表或数据。新增测试授权可通过本地发布记录中的准确环境变量 ID 撤销。
- Media 迁移 SHA-256：`59d391ad7bbc79fce0df2943aa176fb7420a1bcdd34745f95125553680af3dc6`。所有者 5 个母作品、13 个作品、13 条观看记录经迁移前后原始数据比较保持一致。备份存于本机忽略目录，不提交个人数据。
- 生产数据库使用已确认测试用户的 authenticated/RLS 身份探查 22 张表：看不到正式账户记录，跨账户 Media 完成被拒绝；测试季重复完成只有一条观看记录。探查事务已回滚，不保留业务测试行。
- API 候选完整回归首次 599 项：586 通过、1 项旧登录夹具失败、12 项可选环境跳过；修正夹具后相关 6 项通过。候选构建、Media 浏览器流程与 320/402/1280 宽度检查通过。未重复完整套件。
- main 仍为旧基线，后续若自动部署 main 会覆盖这次独立 API 发布；再次发布前须保留此补丁或另行确认选择性集成。开发分支禁用 Vercel 自动部署，IPA 由指定分支手动触发 CI，避免混入正式 Web 发布。

## 验收修复：Tracker 永久删除的窄例外

Tracker 记录仍使用原独立副本和同步协议。本地设置使用共享 `TrackerDetailContent`，联网管理字段、目标、提醒、图标、归档与永久删除；创建使用共享 `createTrackerWithProperties`，支持 Web 已有字段类型。清单只增加既有 Tracker 配置 API，不开放 entries 或 `/api/native/sync`。修改前先同步并拒绝该 Tracker 自身仍有待提交操作或冲突时修改，其他 Tracker 的冲突不阻断无关配置。创建已确认后，图标/字段后续失败只报告部分完成，不自动重新创建。离线创建仍维持既有有限字段能力。本节是代码实现边界，不代表新 IPA 或修复 API 已发布。

## 主用本地版候选（未发布）

- 正式账户在线通道额外要求 `EVAORBIT_LOCAL_ONLINE_ENABLED=true`；默认关闭，必须与准确的正式邮箱匹配。测试白名单保持原行为，不扩大为任意 Supabase 用户。前述“仅测试账户”是既有发布版边界；新 session 使用 `onlineBusinessAccountAllowed`，保留旧字段兼容旧 Host。
- 登录失效通过账户绑定事件打开重新登录弹层，不销毁当前页面和表单。同一账户登录后继续原草稿；换账户重置导航与账户作用域。
- 本地新增 `navigation.openNativeSettings`，仅允许三个既有系统设置路径。服务端还须显式 `EVAORBIT_LOCAL_NATIVE_ENABLED=true`；测试账户始终拒绝。面板复用线上设置和原生 Bridge，隔离 Cookie，打开期间锁定本地账户切换，不把系统写方法加入本地通用白名单。
- 此面板提供系统设置入口，不等于本地主界面的完整原生自动同步生命周期。EventKit/通知的页面协调器运行范围、手工体重/经期写回 Apple Health，仍需后续衔接和真机验证；不能据此宣布主用版已就绪。
- 原生数据上传完成事件可以通知本地 UI 失效缓存。首页健康快捷表单读取已有本地快照，保存经在线账户通道；提交不再被只读适配层拦截。
- 本轮不需新数据库 migration。发布需单独核准 API/session/资产补丁和上述环境开关，再进行独立 IPA 的 macOS 构建、XCTest、覆盖安装与账户验收；不合并 main，不卸载、不清空 SQLite 或旧队列。回退保留旧 API/IPA，关闭新增正式账户开关。

候选验证：一次全量 669 项，646 通过、11 项旧平台夹具缺少新增会话事件导入、12 项可选环境跳过；补齐夹具后相关 18 项全部通过，未重复全套。合成账户浏览器覆盖 14 模块传输边界、重新登录保留草稿、打包 Inbox/体重表单提交；慢快照刷新不会阻塞已确认提交。7 模块 390/402/1280 布局及统一同步管理器、Tracker 独立副本回归通过。TypeScript、相关 ESLint、Web 和本地 React 包构建、diff 检查通过，所有本轮测试服务器已关闭。均未接触真实账户数据，不替代真实全模块 CRUD 或原生验收。新增 XCTest 未运行（Windows 无 Xcode）；本轮没有提交、推送、生产发布或修改生产开关。
