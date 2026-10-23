# EvaOrbit iOS Native Host 维护契约

## 本地主用版收尾候选：原生连接

本地 React 通过桥接 v1 的 `native.invoke` 调用原有 HealthKit/EventKit/通知分派，`native.api` 只转发安装包 `native-routes.json` 清单内的配套业务接口。每次验证当前 SQLite 账户、服务器主账号原生授权和 generation；测试账号拒绝。原生操作完成前阻止切换账户；API 冻结 Cookie、拒绝重定向，不缓存系统凭据、不写业务离线队列。`host.getInfo.apiOrigin` 提供可信服务器地址，健康注册不使用 `eo-local://` 拼接 ingest URL。

本地设置直接复用原版三个原生控件，已有在线设置面板只作兼容保留。前台调度复用 `startEventKitAutoSync`、EventKit 同步、经量 pending 回放及通知校准；保存事件触发校准，原生数据刷新事件不反向触发同步。账户切换使正在等待的日历/通知校准失效，权限变化回到前台刷新状态；自动任务不请求权限。HealthKit observer/上传仍沿用原 coordinator，不重复实现。

本次没有新增权限、framework、entitlement 或改变签名链；需构建新的独立 IPA，既有成功 CI 不能代替该候选的 macOS/XCTest。主账号开关及 session 补丁发布需要单独确认，测试/模拟桥接通过不代表 Apple 实机已验收。范围和实际结果见 [在线业务层](LOCAL_ONLINE_BUSINESS.md)。

本地 React Host 设置 WKWebView `ignoresViewportScaleLimits=false`，仅对本地 Host 在主文档加载末尾注入固定为 1 的 viewport 缩放范围，并在初始化及每次 `didFinish` 禁用页面 pinch 手势，补齐仅初始化关闭手势仍可缩放的问题。保留 `viewport-fit=cover`、滚动、侧滑返回、DOM 图片自有触摸逻辑和系统辅助功能缩放；普通在线 Host、Web/PWA 和 Windows 预览不注入此限制。无权限、Bridge、签名变更。Windows 的脚本幂等检查通过；WKWebView 首次加载/重载 XCTest 已补充但未运行，下一次 IPA 必须验收真机双指、键盘和刷新行为。

本地开屏的就绪条件还包括 React 内容：`didFinish` 后通过页面观察器等待 `data-local-launch-ready="true"` 及渲染帧，再交给既有开屏协调器退出。账户未读完、首页缓存未就绪时保持原开屏；登录页、已缓存首页或明确错误状态可结束等待，缓存后的网络刷新不阻塞开屏。沿用25秒失败/重试出口，重载时旧导航回调不能关闭新开屏。没有新增 Bridge 方法；普通在线 Host 保留原行为。合成浏览器验证已通过，WKWebView XCTest 和真机时序待新 IPA 验收。

主用本地版候选新增 `navigation.openNativeSettings`：仅允许 Health/Apple Integration/Notifications 三个可信同源设置路径，隔离非持久 Cookie、锁定本地账户切换，正式账户须由服务端额外启用且拒绝测试账户。本地 core 不开放系统写方法；`session_expired` 错误用于保留页面草稿的重新登录弹层。Native 数据变更事件可通知本地 UI 刷新。无新权限、framework、entitlement 或签名链变更；新增面板与 XCTest 尚待 macOS CI/真机，不代表自动系统同步生命周期已完全迁移。详见 [在线业务层](LOCAL_ONLINE_BUSINESS.md)。

> 面向后续开发会话的必读文档。凡涉及 `ios/EvaOrbitHost`、iOS 权限或 capability、JS↔Swift bridge、IPA 打包、个人免费签名、Windows/WSL 真机安装，都应先完整阅读本文，再查看对应源码。
>
> 本文记录截至 2026-09-05 的仓库现状和已经走通的路径。源码和 CI 是最终事实来源；如果实现发生有意变化，必须在同一次改动中更新本文和详细 runbook [`docs/IOS_NATIVE_HOST.md`](./IOS_NATIVE_HOST.md)。

## 一、不可随意替换的当前架构

EvaOrbit 的主应用仍是由 Vercel 托管、Supabase 提供后端的 Next.js Web 应用。iOS 工程是一个轻量 Native Host：

```text
Next.js / Supabase（业务 source of truth）
          │ HTTPS，同一生产源
          ▼
WKWebView Native Host
          │ 单一、版本化、白名单 JS↔Swift bridge
          ├─ HealthKit：能量、体重与 Menstrual Flow CategorySample 双向同步
          ├─ EventKit：选定 Calendar / Reminder List 的日历事件与任务双向同步
          ├─ UserNotifications：本地提醒调度
          ├─ UIKit Haptics：按 Web 语义播放原生触感
          └─ Native loading / appearance：启动体验
```

必须保持以下边界：

- Web / 服务端负责业务规则、数据模型、提醒时间和通知文案；Swift 不复制业务规则。经批准的 Tracker Local-first PoC 可在独立运行模式保存账户隔离的 SQLite 业务副本与 outbox，共享 TypeScript 状态机维护本地操作；不建立第二套提醒 source of truth。
- Swift 只实现必须依赖 iOS 的能力，并通过现有 `NativeBridge` 暴露最小接口。
- Native Host 从 `Info.plist` 的 `EvaOrbitBaseURL` 加载 `https://eva-orbit.vercel.app`。Bridge 只允许与该 URL 完全相同的 HTTPS scheme、host 和有效端口。
- `/native` 仅保留为旧版 Host 的在线兼容跳转并立即回到 `/`；不承载 Service Worker 离线 Shell、IndexedDB Inbox 或同步队列。
- 浏览器和 PWA 必须继续独立工作。HealthKit 仅在 Native Host 中出现；Web Notification / Web Push / Cron 继续作为浏览器路径。
- 当前没有 APNs、remote push entitlement、Notification Service Extension 或远程后台通知。原生本地通知不需要增加 APNs capability。

独立 SwiftUI 客户端已废弃，仅作为参考代码来源。本仓库承载正式 Host 与渐进的本地 React 界面；客户端继续通过 Vercel 业务 API 同步，不直接访问 Supabase。普通构建仍加载线上 Web；`local_trackers=true` 的独立 PoC 构建加载安装包内 `eo-local://app/index.html`，使用不同 Bundle ID，不替换生产安装。实施与验收契约见 [Tracker Local-first PoC](TRACKER_LOCAL_FIRST_POC.md)。其协议 2 的事务化 RPC 替代旧 Native 同步写入；旧协议写入已停用，不影响 Web/MCP 或 HealthKit/EventKit 的独立接口。

### Tracker 真实账户只读验收模式

共享外观层由 Web 和本地 React 使用相同的 `fonts.css`、偏好控制器及设置组件。新版本地首用为英语／August；已有显式选择保留。字体随 IPA 打包，偏好保存在 WKWebView 持久存储，与 Tracker SQLite/outbox 分开。本次不增加权限、framework、entitlement 或 bridge 方法；原生 loading 继续走既有 `appearance.setPreference`。字体和 React 包更新要求重建 IPA。WKWebView 字体实际加载、语言/字体重载持久化已纳入 XCTest，未运行新 CI 前不能声称 iOS 已验证。

当前待验收版本通过既有生产 `GET /api/trackers`、`GET /api/trackers/:id` 与 session 接口读取，不要求部署新的生产 API 或 migration。Native 和 React 双层拒绝 Tracker commit 与 sync（包括空 mutations），只读缓存独立存放于 `tracker_readonly_cache`，不会替换旧 state/outbox。首次访问时先以 SQLite backup API 备份（包含 WAL），运行 quick_check，并展示旧队列数量。刷新前后校验账户、完整性和历史时间格式，失败保留旧缓存；旧 IPA 缺少新增方法时明确要求升级，不回退到旧同步。

新增 bridge 方法为 `trackers.readOnlySnapshot`、`trackers.acceptanceStatus`；不改变 bridge 主版本、权限、framework、entitlement 或正式 Host 的默认加载方式。需要重新构建并覆盖安装独立 PoC IPA。只读通过不代表真实写入或系统能力已经真机验收。

Home 只读离线扩展新增 `home.readOnlyResource`，仅在本地 PoC 主文档的既有安全边界内可用。通过同源、限定 GET 的 `/api/native/home-readonly/...` 获取日/月/提醒聚合；禁止转发旧 Home GET（有订阅补账与药物提醒校准副作用）。`home_readonly_cache` 为可丢弃的账户隔离 SQLite 快照表，不修改原 state/outbox；单条 4 MiB、每账户 128 条 / 64 MiB，缓存最近七天与访问过的日期。新 API 发布仍需独立确认，不存在时显示未下载并保留缓存。上传图标经受限认证 GET 读取、验证类型与大小后保存在 Tracker 只读快照，不加载远程图片 URL。以上不增加 entitlement、权限或独立 SwiftUI 界面；回退旧 PoC 时保留安装及 SQLite，新缓存表可以继续留存。

Food & Drink 只读阶段新增 `food.readOnlySnapshot` 和 `food.readOnlyResource`，沿用上述仅限本地 PoC 的 origin / main-frame 校验；只允许 GET `/api/native/food-readonly` 及白名单 `catalog/current`、`place/:id`、`item/:id` 子资源，刷新前后验证账户与 generation。`food_readonly_cache` 每账户单条记录快照、上限 8 MiB；`food_resource_cache` 保留目录（最多 8 MiB）及最近 63 个详情/参考（每个最多 512 KiB），不修改 Tracker state/outbox。Web 与本地共享原版总览、记录列表、Places/地点详情、Library、卡片和表单；预览只读已下载候选，保存/删除/快速捕获不得执行。新接口需单独批准发布，新 React 包和 Swift 方法需重建 IPA；新增 XCTest 仍须实际 CI 验证。范围与回退见 [Food 本地只读阶段](FOOD_LOCAL_READONLY_POC.md)。

Cats 只读阶段新增 `cats.readOnlySnapshot`，沿用本地 PoC main-frame / origin 白名单，仅 GET `/api/native/cats-readonly`，刷新前后检查账户与 generation。独立 `cats_readonly_cache` 每账户 8 MiB，包含在用猫咪原版页面、历史原始表单数据、猫粮库存/购买及认证头像字节；不修改 state/outbox。原版表单可预览临时草稿，完成护理、提醒、上传/删除照片、扣减库存和所有业务写入禁用。API 需单独批准发布、IPA 需重建；不增加权限、framework 或 entitlement，新增 XCTest 尚待 macOS CI。详见 [Cats 只读阶段](CATS_LOCAL_READONLY_POC.md)。

Subscriptions 新增本地 PoC 专用 `subscriptions.readOnlySnapshot` 与 GET `/api/native/subscriptions-readonly`，账户/generation/备份校验沿用既有实现。`subscriptions_readonly_cache` 每账户最多 8 MiB，保存账簿、付款/价格历史与上传图标字节；不触碰 Tracker state/outbox。普通订阅 GET 会自动补账，因此必须保持与新只读接口隔离，不能用作回退。新接口只经 Repository 白名单读取，预览表单、暂停/结束、付款及图片上传/删除均禁止写入。需要单独确认 API 发布及重建 PoC IPA；权限、framework、entitlement 和签名链不变，新增 XCTest 待 macOS CI。见 [订阅阶段说明](SUBSCRIPTIONS_LOCAL_READONLY_POC.md)。

验收安装使用 `EVAORBIT_SKIP_RENEWAL=1 bash scripts/ios/xtool-install.sh <IPA>`，跳过安装后的生产续签 Task 写入。默认安装行为保持原样。环境脚本只在发现 WSL usbmuxd 运行时以 `sudo -n` 停止，权限不足立即报错；ActivationState 探测有超时。固定 xtool SHA 与 Windows USB transport 不变。

## 二、事实来源

| 领域 | 首要文件 |
| --- | --- |
| 工程、framework、Info.plist、entitlements | `ios/EvaOrbitHost/project.yml` |
| App 生命周期与原生协调器装配 | `ios/EvaOrbitHost/Sources/AppDelegate.swift` |
| WebView 与 bridge 注入 | `ios/EvaOrbitHost/Sources/WebViewController.swift` |
| Bridge 协议、白名单和参数校验 | `ios/EvaOrbitHost/Sources/NativeBridge.swift` |
| Web bridge 类型、能力检测和通知 reconcile | `src/lib/native-bridge.ts` |
| HealthKit 实现 | `ios/EvaOrbitHost/Sources/HealthKit*.swift`、`HealthLocalStore.swift`、`HealthUploadManager.swift`；Menstrual Flow 使用独立 CategorySample DTO/路径 |
| Local Notification 实现 | `ios/EvaOrbitHost/Sources/NotificationManager.swift` |
| EventKit 实现 | `ios/EvaOrbitHost/Sources/EventKitSyncEngine.swift`、`src/lib/eventkit-sync.ts`、`src/app/settings/apple-integration` |
| 原生触感执行器 | `ios/EvaOrbitHost/Sources/HapticFeedbackManager.swift`、`src/lib/native-haptics.ts` |
| 原生启动核心图 | `ios/EvaOrbitHost/Resources/Assets.xcassets/LoadingCore.imageset`、`ios/EvaOrbitHost/Sources/OrbitArtworkView.swift` |
| 原生 App Icon 浅深外观 | `ios/EvaOrbitHost/Resources/AppIconSources`、`ios/EvaOrbitHost/Resources/Assets.xcassets/AppIcon.appiconset`、`scripts/ios/prepare-assets.sh` |
| 原生通知 Settings | `src/components/native-notification-control.tsx` |
| 原生通知启动/恢复校准 | `src/components/native-notification-reconciler.tsx` |
| Web Push / Cron | `src/lib/push/**`、现有 reminders delivery API / cron 配置 |
| iOS CI 构建与打包 | `.github/workflows/ios-native-host.yml`、`scripts/ios/package-ad-hoc-ipa.sh` |
| patched xtool 构建 | `.github/workflows/xtool-patched.yml`、`tools/xtool/patches/**` |
| Windows / WSL 安装辅助 | `scripts/ios/xtool-env.sh`、`scripts/ios/xtool-install.sh` |
| IPA 简易安装 | `docs/IOS_IPA_INSTALL_QUICKSTART.md` |
| 完整安装与故障 runbook | `docs/IOS_NATIVE_HOST.md` |

不要依赖旧聊天记录猜测工程状态；先检查以上文件和当前 Git diff。

## 三、已经验证的构建、打包、免费签名和安装链

### 3.1 正确链路

Windows 不能直接完成正式的 Xcode/iPhoneOS 编译。当前已经验证的链路是：

```text
提交并 push Native 改动
  → GitHub Actions macos-15-intel + XcodeGen + Xcode
  → Simulator 编译和 iPhone 16 Pro Simulator 单测
  → iphoneos Release ad-hoc signed .app
  → 校验 HealthKit entitlements 后打包 IPA
  → 下载 artifact 到 Windows
  → WSL 中使用固定且已审计的 patched xtool
  → 个人免费 Apple Team 重签并通过 Windows usbmuxd 安装到 iPhone
```

这不是“在 Windows 编译 iOS”。Windows/WSL 负责 artifact 验证、个人免费签名和真机安装；Apple 平台编译发生在 macOS GitHub runner。

### 3.2 CI 的关键约束

按用户明确的协作偏好：后续 push 后的 GitHub Actions 由用户查看结果；代理提供分支、提交、Actions 入口和本地验证情况，不默认启动 `gh run watch` 或反复轮询。用户带回失败信息或明确要求代查后再排障。未运行、未核实的 XCTest 仍须标为待验收，不能视为通过。

2026-10-05 起，workflow 配置使用标准 `macos-15-intel` runner，避开 GitHub 提示的 macOS arm64 容量排队；不使用付费 large runner，也不保证其他队列没有等待。`actions/checkout@v5` 和 `actions/upload-artifact@v6` 使用 Node.js 24 action runtime。此配置更新不改变设备目标、ad-hoc signing、entitlement 校验或 patched xtool；Intel runner 下的 Simulator 单测及完整 IPA 构建仍需下一次 macOS CI 实际验证，不能将此前的成功产物作为新 runner 已通过的证据。

`.github/workflows/ios-native-host.yml` 当前会：

1. 安装 XcodeGen，从 `ios/EvaOrbitHost/project.yml` 生成工程。
2. 对 Simulator 执行 `build-for-testing`。
3. 在 iPhone 16 Pro Simulator 执行 Native 单元测试。
4. 用 `iphoneos`、Release 和 ad-hoc code signing 构建设备 `.app`。
5. 由 `scripts/ios/package-ad-hoc-ipa.sh` 验证签名，并断言以下 entitlement 都是 `true`：
   - `com.apple.developer.healthkit`
   - `com.apple.developer.healthkit.background-delivery`
6. 发布 IPA、导出的 entitlements、SHA-256、dSYM、Git SHA 和 Xcode 版本。

设备 build 不能改成完全 unsigned 的 `CODE_SIGNING_ALLOWED=NO`。patched xtool 需要从 ad-hoc 签名中读取并重建 entitlement。Simulator 的 unsigned build 不受此限制。

GitHub Actions 只构建已经提交并 push 的内容；本地未提交文件不会进入 IPA。仓库规则仍是不默认替用户 commit 或 push。

### 3.3 Artifact 与重建判断

下载同一个 `EvaOrbitHost-ad-hoc-<run-number>` artifact 中的：

- `EvaOrbitHost-ad-hoc.ipa`
- `EvaOrbitHost-ad-hoc-entitlements.plist`
- `SHA256SUMS`
- `GIT_SHA.txt`
- `XCODE_VERSION.txt`
- dSYM（若 CI 产出）

先用 artifact 自带的 `SHA256SUMS` 校验 IPA。以下情况需要新建 IPA：

- Swift、原生资源、`project.yml`、Info.plist、entitlement 或 Native bridge 的 Swift 端发生变化。
- Web bridge 新能力同时依赖新的 Swift 方法；此时通常还要先部署兼容的 Web 端。

仅有 Web 页面或服务端改动，且没有改变原生接口时，通常只需部署 Web；Host 下次加载生产站点即可获取更新。个人免费签名过期但 Native 二进制未变时，可以重用同一个可信 IPA 重新签名安装。

原生启动轨道中央的核心图由 `LoadingCore.imageset` 负责：`LoadingCoreLight.png` 是 universal 默认（浅色外观），`LoadingCoreDark.png` 是 dark luminosity 变体。`OrbitArtworkView` 只负责按当前 trait collection 解析并显示该资源。替换任一文件都属于原生资源变化，必须重新构建 IPA；这项资源不会新增或改变 bridge、entitlement、framework、系统权限、签名方式及已验证的 IPA 打包/重签/安装链。

原生 App Icon 的源图位于 `Resources/AppIconSources`：浅色外观使用米白底与黑色核心石，深色外观使用炭黑底与米色核心石。`prepare-assets.sh` 在 CI 中将两张 1024×1024 RGB PNG 复制进 `AppIcon.appiconset`，其中深色图通过 `luminosity: dark` 声明交给支持该外观的 iOS 自动选择；旧系统继续使用默认浅色图。替换这些资源同样只要求重新构建并安装 IPA，不改变任何权限、entitlement、framework、bridge 或签名链。

### 3.4 个人免费签名基线

当前 xtool upstream 固定为：

```text
2d58d987edff728fccebc6df643b1672e3583f00
```

必须保留并审计：

- `0001-healthkit-background-delivery.patch`：让免费 Team 重签时把 HealthKit background delivery 作为 HealthKit capability 保留。
- `0002-password-auth-compatibility.patch`：安全诊断、严格受限的 AppTokens 503 重试、token 原子写入和 fresh-TLS compatibility。

2026-09-01 真机走通版本的 AppImage SHA-256 是：

```text
9f23739f9ca45a7506d3290878853e067706b26f510deefafc9728add3c5a628
```

`scripts/ios/xtool-env.sh` 默认强制校验这个值。不要随意升级 xtool、换用第三方预编译文件或把 `--skip-sha256` 作为日常参数。升级必须重新审计 patch、CI marker、导出的 entitlements、登录和真机行为，然后更新脚本及两份文档。

免费个人 Team 的安装通常约 7 天需要重新签名/安装。不要因此改掉现有构建链，也不要把 Apple ID、密码、2FA、token、cookie、UDID、IMEI 或序列号写入仓库、聊天、issue 或日志。

`xtool-install.sh` 仅在安装成功后调用 `scripts/ios/host-renewal-reminder.mjs`：先把 UTC 安装时间保存到 Git 忽略的 `tmp/ios-host-installation.json`，再通过本地 `.env.local` 的 `DATABASE_URL` 事务更新同一条「重新签名安装 EO Host」Task、Task Reminder 与派生 Reminder。默认安装后 6 天提醒，7 天是安装时刻的估算值，并非读取了重签后的 profile 到期时间。Windows Node.js 24+ 优先，WSL Node.js 24+ 可作替代。数据库连接使用 TLS；多账户时必须配置 `EVAORBIT_ALLOWED_EMAIL`，不猜测账户。提醒写入失败不改变 xtool 的安装成功结果，保留安装记录，可用 `node scripts/ios/host-renewal-reminder.mjs --retry` 重试，重试不会移动安装日期。打开 Host 后由现有 EventKit Tasks 双向同步导出/更新同一条 Apple Reminder；必须启用对应列表的 Tasks 路由，离线或不打开 Host 时不保证即时导出。没有新增 Native capability、entitlement 或 bridge。

### 3.5 Windows → WSL → iPhone 通信

已验证 transport 是：

```text
iPhone USB 连接 Windows（不使用 usbipd，不附加给 WSL）
  ↕
Apple Windows usbmuxd 127.0.0.1:27015
  → Windows portproxy 0.0.0.0:27016
  → WSL <windows-gateway>:27016
  → xtool
```

每个新 WSL shell：

```bash
cd /mnt/e/EvaOrbit
source scripts/ios/xtool-env.sh
xtool auth status
xtool devices
bash scripts/ios/xtool-install.sh /path/to/EvaOrbitHost-ad-hoc.ipa
```

必须 `source` 环境脚本。脚本会校验 xtool SHA、停止会竞争 transport 的 WSL usbmuxd、解析 Windows gateway、设置 `USBMUXD_SOCKET_ADDRESS`，并只读取 `ActivationState` 验证设备，避免输出设备标识。portproxy、防火墙、首次登录和 503 排障命令见 [`docs/IOS_NATIVE_HOST.md`](./IOS_NATIVE_HOST.md)。

## 四、iOS capability 与权限获取方式

### 4.1 当前 capability / framework 矩阵

| 能力 | Framework | Info.plist 用途文案 | Entitlement / capability | 权限请求时机 |
| --- | --- | --- | --- | --- |
| HealthKit 能量读取、体重与 Menstrual Flow 双向同步 | `HealthKit.framework` | `NSHealthShareUsageDescription`、`NSHealthUpdateUsageDescription` | `com.apple.developer.healthkit`、`com.apple.developer.healthkit.background-delivery` | 用户明确连接后请求授权；写入发生在用户保存经量/体重或主动重试待同步操作时 |
| 原生本地通知 | `UserNotifications.framework` | 无额外用途文案 | 无 APNs entitlement | 仅当状态为 `not_determined` 且用户点击 Request Access |
| HealthKit 凭据安全存储 | `Security.framework` | 无 | 当前无需 Keychain Sharing capability | Web 注册完成后写入 app 自有 Keychain |
| Web Push | Web Service Worker / Push API | 浏览器管理 | 不属于 Native Host entitlement | 由浏览器设置中的独立按钮请求 |
| 原生触感 | `UIKit`（已由 App 使用） | 无 | 无 | 无权限弹窗；只响应当前用户交互 |
| Apple Calendar / Reminders | `EventKit.framework` | `NSCalendarsFullAccessUsageDescription`、`NSRemindersFullAccessUsageDescription`（并保留 iOS 16 legacy keys） | 无 | 仅在 Apple Integration 中由用户点击分别请求；只同步明确选择的来源 |

不要把“引入 framework”“Info.plist 用途文案”“entitlement/capability”“运行时 permission prompt”混为一件事。新增原生权限前必须分别核对这四层，以及免费个人 Team 和 patched xtool 是否支持对应 entitlement。

### 4.2 HealthKit：当前获取与状态语义

当前读取：

- Resting Energy
- Active Energy
- Body Mass
- Menstrual Flow（`HKCategorySample`，保留 flow 分类与 cycle-start metadata）
- Sleep Analysis、Heart Rate、Resting Heart Rate、HRV (SDNN)：authorization revision `4` 新增只读类型。Sleep 启用同步；三项心脏指标具备 Native 读取/序列化/outbox 能力但默认 sync disabled，不新增 write、framework 或 entitlement。服务端 `HEALTHKIT_SYNC_METRICS` 与系统授权分离，细节及验证见 [`HEALTHKIT_SLEEP.md`](./HEALTHKIT_SLEEP.md)。

Body Mass 和 Menstrual Flow 可以由 EvaOrbit 写入 HealthKit。安装或启动 App 不会自动弹出 HealthKit 授权。用户从 Apple Health 界面主动连接后，Web 调用版本化 bridge 的 `healthkit.requestAuthorization`；Swift 才请求读取与 share 权限。用户保存经量或体重时，Web 先保存 EO 业务事实，再通过 capability detection 调用对应写入方法；旧 IPA 和普通浏览器保留 EO 记录为待同步。

HealthKit 请求的数据类型集合有独立 `authorizationRevision`。新版 Host 增加类型时必须提升该 revision，使已授权用户看到 `Update Health Access`，不能只依赖历史 `authorizationRequested=true`。

需要保留的语义：

- 静息和活动能量保持只读；只向 HealthKit 写入用户在 EvaOrbit 明确保存的体重。
- iOS 不向 App 公开各读取类型是否被用户明确拒绝。因此 `authorizationRequested` 只表示系统授权流程已完成，不能写成“读取权限已授权”。
- `hasReadData` 只有在 EvaOrbit 实际读到 HealthKit 样本后才会变为真。
- App 启动时恢复 observer；已经请求过授权时再恢复 `.immediate` background delivery 并执行 anchored query。首次授权完成后也会开启 background delivery 并立即同步。
- 能量原始样本保留在 Native 本地，上传按本地日期聚合的 resting/active kcal 快照。Body Mass 上传逐样本的 sample UUID、发生时间、kg、source 与 HealthKit sync identifier/version，以保留多条同日记录和幂等语义。
- Menstrual Flow 使用独立 anchored query、本地 sample/outbox 和 ingest DTO，保留 start/end、分类值、cycle-start、sample UUID、source 与 sync identifier/version；Swift 不建立或关联 Period。
- Sleep 使用独立 read sample / outbox / `readChanges`，保留完整 interval、原始 stage 和时区来源；Supabase 的 `healthkit_read_samples` 与 energy 聚合独立。窗口仍来自 3×3 / Calendar，实际睡眠按醒来日期聚合，仅可比较时计算效率。只读指标上传成功时向 Web 发出 health domain 数据刷新通知；不把本地 query 完成当作上传完成。
- 来源归属不可混用：EO 创建的 Menstrual Flow 由 EO 用稳定 sync identifier/version 更新或删除；Apple Health 导入样本在 EO 中只读，修改或删除应在 Apple Health 完成，再由 anchored query 同步。
- EO 写入失败时，业务记录保留 `pending`；稳定 sync identity 使手动 `Sync Now` 重试不会新建第二条 EO 事实。EO 删除先保留 `pending_delete` tombstone，HealthKit 删除成功后再完成硬删除。
- EO 经量使用稳定的 `evaorbit.menstrual_flow.{uuid}` 标识与递增版本。回读通过 sync identifier 更新原记录；明确 cycle-start 时由服务端建立或关联 Period。
- EO 手动体重使用稳定的 `evaorbit.weight.{uuid}` sync identifier；写回产生的新 HealthKit sample 再被 anchored query 读到时，服务端按该 identifier 更新原 EO 行，不创建重复记录。HealthKit 删除事件按 sample UUID 清理 Apple Health 导入记录；HealthKit 在版本替换时发出的旧 sample 删除不会删除 EO 原始行。
- Native 使用 SQLite/outbox 保证上传；设备级 opaque credential 和 ingest URL 保存在 app 自有 Keychain，accessibility 为 `AfterFirstUnlock`。
- Bridge 只接受同源且路径严格为 `/api/healthkit/energy/ingest` 的 ingest URL；请求使用 Bearer credential 和 installation ID。

不要通过 `authorizationStatus(for:)` 推断 HealthKit 读取授权，也不要为了“显示 Denied”伪造 iOS 不提供的状态。

### 4.3 Local Notification：当前获取与降级语义

`NotificationManager` 使用 `UNUserNotificationCenter`，请求 `.alert` 和 `.sound`，不请求 `.badge`。聚合授权状态直接映射为：

- `not_determined`
- `denied`
- `authorized`
- `provisional`
- `ephemeral`

需要保留的行为：

- `notification.getStatus` 只读取真实状态，不触发弹窗。
- 状态同时返回 iOS 的 `alertSetting` 和 `soundSetting`，用于识别“总体已授权、但 Alerts 或 Sounds 被单独关闭”的情况。
- `notification.requestAuthorization` 仅在 `.notDetermined` 时调用系统请求；Denied 时不死循环重试。
- Denied、Alerts 关闭或 Sounds 关闭时，Settings 提供打开 iOS Settings 的入口，并保留 Web Notifications fallback。
- 只有 authorized / provisional / ephemeral 才允许 schedule。
- 通知包含 identifier、title、body、trigger time，并使用 iOS 系统默认通知音；不包含 APNs、badge、action、category、图片或自定义声音资源。
- App 在前台收到本地通知时展示 banner/list 并播放通知内容关联的声音。

已经授权过旧版 `.alert`-only Host 的设备不会再次出现系统授权弹窗；若 `soundSetting` 显示 Disabled，需要用户在 iOS Settings 中手动打开 EvaOrbit 的 Sounds。

原生通知 identifier 由 Web 稳定生成：

```text
evaorbit-scheduled-{source}-{stable-id}
```

同一个 identifier 再次提交给 iOS 会覆盖原 pending request，避免修改时间后重复。Swift 接受当前 `evaorbit-scheduled-`、兼容旧版 `evaorbit-reminder-`，并接受手动测试使用的 `evaorbit-test-` 前缀；同时校验内容长度和未来触发时间。

Web 侧 `reconcileNativeNotifications()` 才是校准逻辑：

1. 先检测完整 bridge capability；普通浏览器/PWA 没有 bridge 时直接返回，不调用 Native API。
2. 权限可调度时从 `/api/notifications` 获取 Reminder Source Registry 允许 `native_local` 的确定性投影。
3. 条件型未记录提醒与经期用药提醒只由服务端 Cron/Web Push 判断；date-only 且没有 snooze 时间的普通 reminder 不调度。
4. 排序后最多保留 48 条即将发生的 Native pending reminders。
5. 取消 iOS 中已不在 Web desired set 的 `evaorbit-scheduled-*`（同时兼容旧 `evaorbit-reminder-*`）。
6. 重新 schedule desired set；稳定 identifier 使缺失项补建、修改项覆盖、相同项不产生重复。

逾期每日提醒：Task 的独立 Due 边界允许为空（没有 Due 时不推断逾期）；Cat Routine、手工 Reminder 等来源则使用 `nextDueAt` 作为逾期边界，数据库返回 `overdue_after=null` 不得关闭它们的每日重复。Apple 负责首次通知的重复来源仍需进入 upcoming 投影，提前预排后续每日 Native 通知；其首次 Native 通知被抑制以免与 Apple 双响。当前预排今天起 7 天的日期窗口，并受 48 条上限约束，打开/恢复 Host 后补充；不是无限后台排程。

reconcile 在 App shell 初始化、`evaorbit:native-ready`、`evaorbit:native-active`、页面重新可见、用户 Refresh status，以及相关 reminder 创建/修改/完成/删除操作后触发。业务 source of truth 仍是 Web/API，不得在 Swift 再建 reminder 数据库。

Settings 中 Native Notifications 和 Browser push 是两个独立 channel。Native 控件只有检测到 Host 后才出现；浏览器不能伪装 Native 可用。不得为了接入原生通知修改或删除现有 Web Push / Cron。

### 4.4 EventKit：来源选择、同步与边界

- 删除重装是正常升级路径。先按时间顺序应用 `202610040001_eventkit_calendar_import.sql` 与 `202610050001_eventkit_logical_links.sql`；本轮只交付源码和迁移，不发布或构建 IPA。
- Web mapping GET 使用 `protocol=2`，完整分页读取账户 logical links 与所有 bindings，再选择本 installation 或最新历史基线。旧 Web 协议返回 409，避免按旧 installation 范围重复创建。新 bridge `eventkit.recover` 不请求权限，按历史本地 ID、external ID 和 Reminder marker 恢复；Reminder marker 查找覆盖所有可读列表与所有完成时间，未选择列表中的候选只触发暂停，不被同步。Calendar 不写恢复标记。
- 恢复必须唯一；多候选、来源不可读、权限不足、旧 Host 无 recover 能力时保留逻辑关系，返回 identity conflict 并阻止该对象类型的新导入/导出。已绑定正常更新继续按原 EO ID。只有明确确认不存在才删除 EO Calendar 或按当前 Task 状态重建镜像。
- Reminder 创建前服务端预留稳定 UUID、创建基线与两分钟创建租约；创建后绑定写失败保留 Apple marker 与 pending logical link，后续先找回，不能靠标题/日期判断为新对象。租约未到期且尚未找到镜像时稍后重试。循环 domain 下一期使用新的 mirror token，避免认领旧完成项。解绑本地 binding 不删除账户逻辑关联、不重置其他安装的通知归属。
- 迁移保留所有 EO IDs 与 binding 基线。`eventkit_identity_conflicts` 为 RLS/security-invoker 只读疑似重复列表；同 external identity 对应多个 logical links 时暂停，不自动合并或删除。Apple external ID 不保证全局唯一，所有恢复线索失效时需要人工确认。


- Calendar 与 Reminders 分别请求权限；启动、恢复和 bridge ready 不主动弹权限框。
- Calendar 来源按设备保存 `Off / Import only`；即使旧配置残留 `Two-way`，同步核心也必须降级为 Import only。`Off` 只暂停该来源，不删除映射或任一侧数据，也不会把未读取误判为 Apple 删除。
- Calendar 永远是 Apple → EO 单向读取：EO 不创建、修改或删除 Apple Event。Reminders 通过 `EO → Reminder List` 将 Tasks、Cats、Cats Household、Trackers、Health 与 Subscriptions 独立路由到可写 Apple List；同一 List 内没有 EO link 的私人项目不会进入 EO。旧版 `EO Tasks only` 配置首次读取时迁移为 Tasks route。
- Task link 继续同步 title、notes、Due 与完成状态，但只为尚未完成的未关联 EO Task 新建 Apple Reminder；历史已完成 Task 不参与首次导出，已关联 Task 仍会把后续完成状态同步给 Apple。其他 domain reminder 以 EO 为 source of truth，只接受 Apple 侧的完成动作；改名、改期等 Apple-only 编辑会在下一次同步恢复为 EO 当前值。若 Apple 镜像缺失，则保留 EO 记录并重新创建镜像。
- Web/Supabase 仍是 EO 业务 source of truth。Swift 只读写 EventKit，账户级逻辑关联存在 `eventkit_logical_links`；`eventkit_links` 是 installation binding，保留每次安装的本地 identifiers 与三方基线。EventKit installation ID 仍使用 UserDefaults，删除重装可变化；HealthKit Keychain identity 保持独立。
- 发布 domain routes 前必须先应用 `supabase/migrations/202609300001_eventkit_reminder_domain_routes.sql`，使 `eventkit_links` 可以记录通用 EO Reminder 映射。
- Calendar 的新事件发现使用设备本地时间 `2026-10-01 00:00` 到同步时刻未来 365 天的窗口；已有 mapping 的事件不受该窗口限制。EO Calendar 批量列表按 ID 游标分页，mapping 列表也完整分页；已关联 Calendar/Task 优先按 mapping 的 EO ID 直接读取，只有 HTTP 404 才表示 EO 记录不存在。
- Reminders 批量发现使用未完成项和最近 30 天完成项。已关联 Apple 对象若不在批量结果中，先用 `eventkit.getItem` 按原 identifier 查询，并尝试 external identifier 恢复；返回 `found / missing / unavailable`。实时权限不足、原 Calendar/List 或 source 不可读、匹配有歧义时不能确认删除。来源 Off 时暂停；只有明确 `missing` 才删除对应 EO Calendar 或重建未完成 Task 镜像。Task 重建以当前 completed 为准，旧完成基线不会阻止 reopen；已完成 Task 不重建。
- Calendar 新导入通过 `/api/eventkit/calendar-import` 和 `import_eventkit_calendar_event` RPC 原子识别/创建 EO event 与 mapping；事务失败不遗留 EO event，提交后的重试复用原 ID。发布 Web 前必须应用 `supabase/migrations/202610040001_eventkit_calendar_import.sql`。后续抗重装迁移 `202610050001_eventkit_logical_links.sql` 将幂等身份提升到账户级，跨 installation 重试复用原 EO ID；不清理历史重复记录。
- 新 Host 在 bridge v1 增加 `eventkit.getItem`，批量读取权限/来源异常会报错，既有 Reminder identifier 保存时查找失败也报错而非隐式新建。Web 通过 `host.getInfo` 检测；旧 IPA 缺少 getItem 时保留批量未读到的关联，不删除/重建。窗口外已关联状态更新与明确删除检测需要新 IPA。部署顺序：应用迁移 → 部署兼容 Web → 按原签名/安装链构建并安装新 IPA；不新增 framework、权限或 entitlement。
- reconcile 使用 Base / EO current / Apple current：非重叠字段合并，同字段改动报告 conflict，不静默覆盖；比较和 hash 前将 timed start/end 与 completion date 转为 UTC ISO canonical，date-only 保持原日期；成功后更新 snapshot/hash，抑制 echo。
- recurring events 当前只安全读取并标记，不导入、不写回、不删除 series 或 occurrence。普通单次 Event 只参与 Apple → EO 导入与更新。
- all-day 边界使用 date-only、end exclusive；timed event 保留 ISO instant 与 IANA timezone。
- Reminder 映射包含 title、notes、Due 日期/明确时间、completed 与 completion date。带明确时间的 Due 创建普通的零偏移 Apple alert；date-only Due 不创建定时通知，也不映射 priority。更新既有 Apple Reminder 时保留 Apple 侧已有的自定义 alarm 与 priority。Tags、URL、location 与 Apple recurrence 不进入 EO 业务模型；EO 镜像的空 URL 可保存 `evaorbit://eventkit/<opaque UUID>` 恢复标记，用户已有 URL 永不覆盖；EO recurrence 只投影当前一期，完成后由原业务服务推进并创建下一期 Apple Reminder。
- 实际已有 Apple alert 的已映射 Task 或 domain Reminder 由 `apple_reminders` channel 负责首次通知；没有 Apple alert 时继续由 EO 投递。Due 卡与投递渠道无关，`repeat_while_overdue` 在 Due 后继续由 EO 投递，避免首次通知双响。
- 全局 App shell 挂载 EventKit reconciler，不依赖 Apple Integration 页。启动、bridge ready、回到前台/页面可见、网络恢复、来源/路由配置变动与 `EKEventStoreChanged` 都触发同步（Web 1.5 秒防抖；Native store change 另有 1.5 秒防抖）。前台在线在上一轮结束后等待 60 秒再补偿同步 EO/远端修改（运行期间不累计定时重跑）；隐藏或离线时跳过，重叠调用复用 single-flight，运行期间到达的事件保留一轮补偿。失败等待下一次触发重试；设置页显示自动同步时间/错误，导入后刷新当前页面。自动同步不请求权限，选定来源权限被撤销时停止该轮，避免误判删除。没有 APNs silent push，App 长期不运行时不保证即时同步。
- Reminders 标题包含 `续火花` 时排除导入、导出和已有关联项的更新/删除/重建；匹配 Apple 当前标题、EO 当前标题和映射基线标题。保留已有数据和映射，不把屏蔽项当成 Apple 删除；不影响 Calendar。

## 五、JS↔Swift bridge 安全契约

### 同步完成后的 Web 数据刷新

EventKit 编排对单次只读步骤设置 30 秒等待上限，包括账户偏好、EO GET、Apple 批量读取/关联恢复与能力检测。超时报告具体步骤并结束该轮，不将超时当作空列表或删除依据；迟到的只读响应不会恢复该轮业务写入。已提交更改保持，完成通知超时则降级为本地数据刷新事件。写入与权限请求不使用此超时包装，不因超时重放写入；既有调度时机、身份校验及 Native 在途操作锁保留。此保护不能证明真机卡住的具体原因，需要更新本地包后依据报错步骤继续排查。

EventKit 完整同步仍由 Web 编排，Swift 只读写 Apple 对象。Web 复用本轮完整分页 Calendar 和 Tasks 的批量读取结果；窗口外或批次缺失的 EO 记录才按 ID 单独读取，只有明确 404 表示不存在。关联恢复安全屏障完成后先核对 Calendar，已提交的 Calendar 变化立即通过 bridge v1 的 `host.notifyDataChanged` 通知页面，再处理 Reminder 镜像；其余已提交的 `tasks / reminders` 变化在 single-flight 结束时通知。已成功通知的 Calendar domain 不重复发送，后续失败仍报告错误并保留已提交变化；Swift 经现有生产同源、main-frame 和方法白名单校验，向当前 WKWebView 发出 `eo:data-changed`，detail 为 `{ domains, source: "eventkit" }`。方法也接受 `health` domain 和 `healthkit` source，供后续 Native 同步复用，本轮不改变 HealthKit 同步流程。

旧 IPA 未声明该方法或通知调用失败时，Web 本地发出相同事件；通知失败不撤销已提交的数据。无 EO 变化的同步不发通知；若同步后段失败但前段已提交 EO 变化，仍通知这些已提交的 domains。Homepage 的 client 日历缓存只 refetch 当前日期及可见月份，其他缓存失效，选中日期、展开状态和未保存日记保持；Tasks/Reminders 变化另用 `router.refresh()` 更新服务端 Due 卡片，不跳转、不整页 reload。新事件不是 EventKit scheduler 的触发源，刷新组件不启动同步，原启动/前台/store-change/定时等触发时机不变。

Swift 新方法需要按现有链路构建新 IPA，兼容 Web 可先部署并在旧 Host 上使用本地通知降级。没有新增 framework、Info.plist 用途文案、权限或 entitlement；Windows 本地无法执行 iOS XCTest/Simulator 验证，须由 macOS CI 和 iPhone 16 Pro 真机验证补齐。

当前只有一个 bridge：`window.EvaOrbitNative` / message handler `evaOrbit`，协议版本为 `1`。新增能力应扩展这个 bridge，不新建重复 handler 或绕过它。

以下约束必须保留：

- bootstrap 在 document start 注入，但 bridge 对象不可改写且被冻结。
- 只接受 main frame 调用。
- 在线页面只接受 `HostConfiguration` 允许的生产同源 URL。启用 Tracker PoC 时，本地 `eo-local://app` 主框架可调用专用 `trackers.*` 白名单及少量 host/外观/触感方法；本地页面不可配置 HealthKit 凭据。生产网页不可调用 Tracker 本地存储方法。Debug 可单独固定一个 HTTPS 开发源，Release 不采纳开发源；不得泛化为任意网页白名单。
- 每个请求必须包含匹配的 protocol version、非空 request id、方法名和对象参数。
- 方法必须同时加入 Swift 白名单并实现显式参数校验。
- Web 必须先通过 `host.getInfo` 的 `methods`/capabilities 做向后兼容检测，旧 IPA 不应因 Web 更新而报错。
- Swift 返回结构化成功/错误，不把 secret、系统原始错误体或设备标识送回 Web。
- 原生开屏只有浅色与深色两种外观，不跟随 Web 颜色主题。Web 调用旧版 Host 的 `appearance.setPreference` 时固定传入兼容的 `editorial` 启动标识，避免 `rosewood / powderblue` 等页面主题连带阻断 `system / light / dark` 的窗口外观切换；Web 页面仍保留真实颜色主题。
- HealthKit credential 配置继续限制 credential 最短长度、同源 HTTPS ingest URL 和固定 API path。
- Native 权限调用必须由可见的用户操作触发；bridge ready 或 App launch 只允许读状态、恢复已有后台能力或 reconcile 已获授权的项目。

如果同时修改 Web 和 Swift bridge，部署顺序应兼容旧 Host：Web 端先以 capability detection 做无害降级，再安装新 IPA。不要假设所有用户已经更新 Native Host。

### 5.1 原生触感语义

`haptic.play` 只接受 `selection`、`light`、`medium`、`success`、`warning`、`error` 六种固定语义。Web 决定当前业务动作的语义，Swift 只使用 UIKit feedback generator 播放并做短间隔去重；不得把业务规则复制进 Swift，也不得允许 Web 提交任意强度、时长或自定义波形。

普通浏览器、PWA 和未包含该方法的旧 IPA 必须静默降级。触感失败不得阻断保存、删除、导航或其他业务操作。普通导航、滚动、输入、后台同步和 AI 流式 token 不触发反馈；选择变化、表单正式提交、完成、危险动作、可见错误和下拉刷新阈值才可使用。该能力基于 UIKit，不需要 Core Haptics framework、Info.plist 用途文案、权限或 entitlement。

## 六、新增或修改 iOS 权限的检查清单

只有产品明确要求时才新增原生权限。改动前逐项回答：

1. 该能力是否真的必须由 Native 完成，现有 Web 能力是否仍需 fallback？
2. 需要的最低 iOS 版本、framework、Info.plist usage description、entitlement 各是什么？
3. 免费 Personal Team 是否允许这个 capability？patched xtool 是否能保留它？
4. 权限请求是否由明确的用户点击触发？启动和 bridge ready 不得突然弹权限框。
5. `not determined`、authorized、denied/restricted 等系统真实状态如何映射？iOS 不公开的状态不得伪造。
6. Denied 后如何降级、如何打开 iOS Settings、如何避免循环请求？
7. 是否能复用 `NativeBridge` 和现有 Settings section，而不是另建桥或页面？
8. 业务 source of truth 是否仍在 Web/服务端，Swift 是否只做系统操作？
9. `project.yml`、打包脚本的 entitlement 断言、xtool patch/workflow 和本文是否需要同步更新？
10. 是否完成 Simulator build/test、Web lint/typecheck/test/build、artifact entitlement 检查和 iPhone 16 Pro 真机验证？

任何 entitlement 变化都属于高风险签名链变化，不能只在 `project.yml` 加一个键就结束。必须验证 CI 导出值、免费 Team profile、patched xtool 重签结果和真机行为。

## 七、按改动类型验证

| 改动 | 最低验证 |
| --- | --- |
| 仅文档 | 链接/路径核对，`git diff --check` |
| 仅 Web UI / bridge capability detection | 项目现有 lint、typecheck、相关测试、生产 build；普通浏览器和 Native Host 两种路径 |
| Swift / 原生资源 | XcodeGen、Simulator build-for-testing、Native 单测、iphoneos ad-hoc build、IPA 打包 entitlement 断言 |
| HealthKit / 通知权限行为 | 上述检查 + iPhone 16 Pro 真机首次授权、Denied/恢复、App 重启/恢复 |
| entitlement / signing / xtool | 上述检查 + patch 审计、AppImage/IPA SHA、导出 entitlement、免费 Team 重签和真机安装 |
| Web + Swift bridge 协议 | 旧 IPA 的 Web 降级、新 IPA 的完整能力、非 Native 浏览器不调用 API、同源/main-frame/白名单测试 |

测试结果必须区分“已运行通过”“受当前 Windows 环境限制未运行”和“需要 CI/真机完成”，不能把静态检查写成真机通过。

## 八、禁止事项与维护原则

### Bark 通知链接与续签提醒证书

Host 在 Info.plist 注册 `evaorbit` URL scheme，由 AppDelegate 将 `evaorbit://open/<page>?...` 交给 WebViewController。HostConfiguration 只把允许的页面路径映射到配置中的 HTTPS 源，拒绝跨源、凭据、端口和目录穿越；冷启动先保存目标，前台收到链接重新导航。`evaorbit://eventkit/<token>` 仍仅是恢复标记，不作为导航入口。没有新增 bridge、系统权限、framework 或 entitlement，但需要重新构建/安装 IPA。

Bark 的 `open_in_host` 默认 false；安装新版后才能在通知设置切换，旧 IPA 继续使用网页。部署前应用 `202610130002_bark_host_links.sql`。

安装后的续签脚本使用公开的 `scripts/ios/supabase-root-2021.crt` 验证数据库 TLS，保持 `rejectUnauthorized: true`。证书来源为 Supabase 官方下载 `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`，SHA-256 指纹 `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`，有效期至 2031-04-26。更新时核验来源与指纹，不关闭证书校验。

- 不在 Windows 本地伪造 Xcode 构建结果；Swift build/test 以 macOS CI 为准。
- 不把设备 Release 包改成完全 unsigned。
- 不删除 HealthKit background-delivery entitlement、对应 xtool patch 或打包断言。
- 不随意升级、替换或跳过已审计 xtool SHA。
- 不使用 `usbipd` 取代已经验证的 Windows usbmuxd transport，除非明确进行一项完整迁移并重新真机验证。
- 不频繁重试 Apple AppTokens 503，不随意 reset pseudo-device 或使用 `--reset-2fa`。
- 不自动弹 HealthKit 或 Notification permission。
- 不建立第二套 bridge、第二套 reminder source of truth，或把 Web 业务规则搬进 Swift。
- 不为 Local Notification 添加 APNs/remote push capability。
- 不破坏 Web Push、Cron、PWA、HealthKit bridge 或免费个人签名续签路径。
- 不记录或输出 Apple 凭据、HealthKit 原始样本、设备唯一标识或其他 secret。
- 不默认 commit/push；先保留用户工作树中的无关改动。

## 九、改动后的交付说明模板

涉及 Native Host 的完成说明至少应列出：

- 修改文件和各自职责。
- Web / Native 的责任边界是否变化。
- 新增或变化的 framework、Info.plist、entitlement 和系统权限。
- Bridge 方法、协议版本与旧 IPA 的降级方式。
- 是否需要重新部署 Web、重新构建 IPA、重新签名安装。
- CI、Web checks、导出 entitlement 和真机验证的实际结果。
- 尚未覆盖的场景，以及哪些验证必须由 macOS CI 或真机完成。

具体的 Windows 管理员命令、WSL 初装、xtool 登录、AppTokens 503、续签和升级步骤继续以 [`docs/IOS_NATIVE_HOST.md`](./IOS_NATIVE_HOST.md) 为准；本文负责维护架构和不变量，避免后续开发会话破坏已经验证的实现方式。

### Chronicle 只读缓存补充

本地包复用 Web Chronicle 列表/详情/表单；bridge v1 增加 `chronicle.readOnlySnapshot`，底层只放行精确 `GET /api/chronicle`，包装最近 100 篇到 8 MiB 账户缓存。SQLite 仅新增 `chronicle_readonly_cache`，保留既有记录/outbox/备份及身份检查；旧 Host 通过能力检测提示升级。未增加系统权限、framework 或 entitlement，安装签名链不变。此模块无需新增生产 API/migration；Web 视觉更新仍需单独授权部署，Host 需重建 IPA。Windows 浏览器验证不替代 macOS XCTest/iPhone 验收。详见 [Chronicle 只读阶段](CHRONICLE_LOCAL_READONLY_POC.md)。

### Memo 只读缓存补充

本地复用原 Memo React 页面与表单；bridge v1 增加 `memo.readOnlySnapshot`，仅精确 GET `/api/memos`，最近更新 100 条/每账户8 MiB，新增 `memo_readonly_cache` 而不改旧 state/outbox/备份。身份/generation 校验与旧 Host 能力检测沿用现有契约；保存、归档、删除和通知触发禁用，Memory Graph 未接入。本模块不需新生产 API/migration，需要新 PoC IPA；不增加权限/framework/entitlement。Windows 不替代 macOS XCTest/iPhone 验收。见 [Memo 只读阶段](MEMO_LOCAL_READONLY_POC.md)。

### Inbox 只读缓存补充

沿用桥接 v1 增加本地 PoC 专用 `inbox.readOnlySnapshot`。仅符号路径 `inbox` 的 GET 固定映射既有 `/api/inbox?status=all`；不开放外部查询、详情、convert 或写方法。最多缓存500条/每账户8 MiB，独立 `inbox_readonly_cache`，身份/generation/备份校验和旧 Host capability 检测沿用现有契约。React 列表与捕获表单共享，行内/Log 只预览，处理/归档/恢复/删除禁止。不需生产 API/migration，但需要新 PoC IPA；无新权限、framework、entitlement 或签名链变化。Windows 不能替代 macOS XCTest/真机。见 [Inbox 只读阶段](INBOX_LOCAL_READONLY_POC.md)。

本地开发版默认启动页已调整为 Home；HTTP 404 仅提示只读接口不可用并保留缓存，不等同于确定未部署。需要重建 PoC IPA，API 发布仍独立审批。接口清单见 [只读 API 发布清单](LOCAL_READONLY_API_RELEASE.md)。

Health 本地只读扩展增加 `health.readOnlySnapshot` 和账户隔离 `health_readonly_cache`（8 MiB）。仅精确 GET `/api/native/health-readonly`，保持身份/generation/备份验收与旧队列不变；复用原 Web 各分区和表单，禁止 Apple Health、业务和提醒写入。不增加权限、framework、entitlement 或改变签名链。新 API 需单独批准发布，PoC IPA 需重建，macOS XCTest/真机验收待完成。见 [Health 阶段](HEALTH_LOCAL_READONLY_POC.md)。

Relations 本地只读扩展增加 `relations.readOnlySnapshot` 和账户隔离 `relations_readonly_cache`（8 MiB，最多100人物）；仅精确 GET `/api/native/relations-readonly`，保持备份、身份/generation和旧队列保护。照片字节随快照缓存，业务写入/照片上传/还款禁用。无新权限、framework、entitlement或签名链变化。API发布需单独批准，PoC IPA需重建，macOS XCTest及真机待验收。见 [Relations 阶段](RELATIONS_LOCAL_READONLY_POC.md)。

Media 本地只读扩展增加 `media.readOnlySnapshot` 与账户隔离 `media_readonly_cache`（8 MiB）。只放行精确 GET `/api/native/media-readonly`，复用原备份/账户/generation校验并保留旧 state/outbox。共享原版 React 收藏/母作品/详情/表单，封面字节随快照缓存；全部业务写入和上传禁用。不增加权限、framework、entitlement或改变签名链。新 API、Web completion 迁移和 IPA 发布均需分别确认；新增 XCTest 待 macOS CI/iPhone 验证。详见 [Media 阶段](MEDIA_LOCAL_READONLY_POC.md)。

## Workspace 只读与在线 AI 配置边界

- `workspaces.readOnlySnapshot` 仅允许 tasks/projects/lucius，独立 SQLite 缓存按账户和 kind 分区，刷新校验失败保留旧快照；不写业务队列。
- `settings.aiConfiguration` 仅允许既有 Provider/模型设置路径与对应方法；普通 `request` 白名单继续拒绝 AI/业务写入。配置请求先验证会话账户及 `aiConfigurationProtocol:1`，附 `X-EvaOrbit-Account` 由服务端认证 proxy 校验。Native 冻结 Cookie 到单次无磁盘缓存连接，不保存密钥或重试请求。
- 必须同时发布会话协议声明和账户校验后才启用在线设置；未发布时应拒绝。覆盖安装保留数据库/队列，不新增 entitlement、系统权限或签名流程。回退只更换旧 IPA/API，禁止卸载或清理本地数据库。

## Tracker 独立编辑副本

本地 bridge v1 新增 `trackers.readReplica`、`trackers.commitReplica`、`trackers.syncReplica`，按能力检测启用；旧 Host 保持只读。SQLite 新增 `tracker_replica_state`，复用既有 CAS/原子文档提交，不改 `tracker_state` 或冻结旧 outbox。旧 `trackers.commitState`/`trackers.sync` 仍关闭。上传只能使用新表中已冻结且内容完全匹配的 wire；先空批次验证协议2完整快照，再允许实际批次，账户/generation/冻结 Cookie 与服务端 request.accountId 联合保护。协议1/缺少 migration/请求失败时只保存本机，不上传旧队列。设置暂停编辑保留新副本及队列；导出包含 legacy/replica 两部分。无新权限、framework、entitlement 或签名链变化；新IPA及 macOS XCTest/真机验收仍需要。见 [编辑阶段](TRACKER_EDITABLE_REPLICA.md)。

## Settings 共享目录与在线偏好

开发版复用 Web 八项设置目录与现有表单。Bridge v1 增加 `settings.configuration`，仅精确 GET/PATCH `/api/preferences/life-day`、GET/PUT `/api/calendar-interpretation`；复用现有 AI 通道的账户/generation、冻结 Cookie、ephemeral URLSession 和无缓存/队列/重试约束。服务端需声明 `settingsConfigurationProtocol:1` 并对账户头做校验；旧服务端/旧 Host 拒绝该通道，不回退到任意 fetch。

本地 core 白名单额外允许既有 `healthkit.getStatus`、`eventkit.getStatus`、`notification.getStatus` 与用户主动 `notification.openSettings`。原组件 readOnly 模式不请求权限、不配置凭据、不触发健康/日历/提醒写入或通知排程/取消。其他原生业务方法仍禁止；在线 Host 原行为保留。无新 framework、权限、Info.plist、entitlement 或签名链变化。需要重建开发版 IPA，在线偏好另需 session/proxy 发布；本轮不部署、不迁移。验证与回退见 [Settings 共享阶段](SETTINGS_LOCAL_SHARED.md)。

## 本地包短开屏

本地 Host 使用同一个 `LoadingOverlayView` 的 `.local` 播放方式：完整既有轨道/核心与字标以 0.28 秒淡入和轻微缩放显现，页面就绪后 0.16 秒淡出，快速冷启动约 0.44 秒；减少动态效果时只做 0.10 + 0.10 秒淡入淡出。`LoadingExperienceCoordinator` 仅本地冷启动等待这段短入场结束；不等待账户网络请求或云端同步，页面未就绪时仍保留静态加载层。重试不重播冷启动动画，前台恢复/模块切换不新建动画层。在线 Web Host 保留原播放方式和快速就绪即退出语义。

复用 `OrbitArtworkView`、`LoadingCore` 浅深资源与既有布局，不添加 React 开屏或新资源。无 Bridge、权限、framework、entitlement、数据库或签名链变化；需重建开发版 IPA。新增 XCTest 覆盖快/慢就绪、重复 ready、失败重试和时长预算；Windows 无 Xcode/可用 Swift 工具链，尚未运行 XCTest 或真机动画验收。

## 本地包在线业务请求

本地 PoC bridge v1 新增 `business.request`，仅在既有本地主框架白名单内可用。与 TypeScript/Vite 共用安装包 `TrackerWeb/business-routes.json` 的显式路径/方法清单，不允许任意 URL、Tracker 同步、凭据、MCP 或系统同步接口。请求校验当前 SQLite 账号、会话 `onlineBusinessProtocol:1`、generation 和 `X-EvaOrbit-Account`，冻结 Cookie、使用 ephemeral URLSession、拒绝重定向；JSON/multipart 正文最多 8 MiB，不重试或入队。其他模块离线仍只读，Tracker 独立同步不变。

附加 SQLite `online_business_cache` 保存账户隔离的访问结果（128 项/64 MiB，单项 8 MiB），不改旧数据/队列。Settings 分派保留 bridge method 与 HTTP verb 的区别。无权限、framework、entitlement、签名或安装链变化。必须先核验并获准发布配套业务 API、测试账户配置和必要 migration，再安装集中验收 IPA；未运行新 macOS CI/XCTest 或真实账户验收前不得声称已完成。详见 [在线业务层](LOCAL_ONLINE_BUSINESS.md)。
