# EvaOrbit iOS Native Host 维护契约

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
          ├─ HealthKit：读取与聚合能量、可靠上传
          ├─ UserNotifications：本地提醒调度
          └─ Native loading / appearance：启动体验
```

必须保持以下边界：

- Web / 服务端负责业务规则、数据模型、提醒时间和通知文案；Swift 不复制业务规则，也不建立第二套业务数据库。
- Swift 只实现必须依赖 iOS 的能力，并通过现有 `NativeBridge` 暴露最小接口。
- Native Host 从 `Info.plist` 的 `EvaOrbitBaseURL` 加载 `https://eva-orbit.vercel.app`。Bridge 只允许与该 URL 完全相同的 HTTPS scheme、host 和有效端口。
- 浏览器和 PWA 必须继续独立工作。HealthKit 仅在 Native Host 中出现；Web Notification / Web Push / Cron 继续作为浏览器路径。
- 当前没有 APNs、remote push entitlement、Notification Service Extension 或远程后台通知。原生本地通知不需要增加 APNs capability。

## 二、事实来源

| 领域 | 首要文件 |
| --- | --- |
| 工程、framework、Info.plist、entitlements | `ios/EvaOrbitHost/project.yml` |
| App 生命周期与原生协调器装配 | `ios/EvaOrbitHost/Sources/AppDelegate.swift` |
| WebView 与 bridge 注入 | `ios/EvaOrbitHost/Sources/WebViewController.swift` |
| Bridge 协议、白名单和参数校验 | `ios/EvaOrbitHost/Sources/NativeBridge.swift` |
| Web bridge 类型、能力检测和通知 reconcile | `src/lib/native-bridge.ts` |
| HealthKit 实现 | `ios/EvaOrbitHost/Sources/HealthKit*.swift`、`HealthLocalStore.swift`、`HealthUploadManager.swift` |
| Local Notification 实现 | `ios/EvaOrbitHost/Sources/NotificationManager.swift` |
| 原生通知 Settings | `src/components/native-notification-control.tsx` |
| 原生通知启动/恢复校准 | `src/components/native-notification-reconciler.tsx` |
| Web Push / Cron | `src/lib/push/**`、现有 reminders delivery API / cron 配置 |
| iOS CI 构建与打包 | `.github/workflows/ios-native-host.yml`、`scripts/ios/package-ad-hoc-ipa.sh` |
| patched xtool 构建 | `.github/workflows/xtool-patched.yml`、`tools/xtool/patches/**` |
| Windows / WSL 安装辅助 | `scripts/ios/xtool-env.sh`、`scripts/ios/xtool-install.sh` |
| 完整安装与故障 runbook | `docs/IOS_NATIVE_HOST.md` |

不要依赖旧聊天记录猜测工程状态；先检查以上文件和当前 Git diff。

## 三、已经验证的构建、打包、免费签名和安装链

### 3.1 正确链路

Windows 不能直接完成正式的 Xcode/iPhoneOS 编译。当前已经验证的链路是：

```text
提交并 push Native 改动
  → GitHub Actions macos-15 + XcodeGen + Xcode
  → Simulator 编译和 iPhone 16 Pro Simulator 单测
  → iphoneos Release ad-hoc signed .app
  → 校验 HealthKit entitlements 后打包 IPA
  → 下载 artifact 到 Windows
  → WSL 中使用固定且已审计的 patched xtool
  → 个人免费 Apple Team 重签并通过 Windows usbmuxd 安装到 iPhone
```

这不是“在 Windows 编译 iOS”。Windows/WSL 负责 artifact 验证、个人免费签名和真机安装；Apple 平台编译发生在 macOS GitHub runner。

### 3.2 CI 的关键约束

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
| HealthKit 能量读取 | `HealthKit.framework` | `NSHealthShareUsageDescription` | `com.apple.developer.healthkit`、`com.apple.developer.healthkit.background-delivery` | 用户在界面明确点击连接/授权后 |
| 原生本地通知 | `UserNotifications.framework` | 无额外用途文案 | 无 APNs entitlement | 仅当状态为 `not_determined` 且用户点击 Request Access |
| HealthKit 凭据安全存储 | `Security.framework` | 无 | 当前无需 Keychain Sharing capability | Web 注册完成后写入 app 自有 Keychain |
| Web Push | Web Service Worker / Push API | 浏览器管理 | 不属于 Native Host entitlement | 由浏览器设置中的独立按钮请求 |

不要把“引入 framework”“Info.plist 用途文案”“entitlement/capability”“运行时 permission prompt”混为一件事。新增原生权限前必须分别核对这四层，以及免费个人 Team 和 patched xtool 是否支持对应 entitlement。

### 4.2 HealthKit：当前获取与状态语义

当前只读取：

- Resting Energy
- Active Energy

安装或启动 App 不会自动弹出 HealthKit 授权。用户从现有 Apple Health 界面主动连接后，Web 调用版本化 bridge 的 `healthkit.requestAuthorization`；Swift 才调用 `HKHealthStore.requestAuthorization(toShare: [], read: ...)`。

需要保留的语义：

- EvaOrbit 只读，不请求向 Health 写入数据。
- iOS 不向 App 公开各读取类型是否被用户明确拒绝。因此 `authorizationRequested` 只表示系统授权流程已完成，不能写成“读取权限已授权”。
- `hasReadData` 只有在 EvaOrbit 实际读到 HealthKit 样本后才会变为真。
- App 启动时恢复 observer；已经请求过授权时再恢复 `.immediate` background delivery 并执行 anchored query。首次授权完成后也会开启 background delivery 并立即同步。
- 原始 HealthKit 样本、sample UUID 和 query anchor 保留在 Native 本地；上传的是按本地日期聚合的 resting/active kcal 快照。
- Native 使用 SQLite/outbox 保证上传；设备级 opaque credential 和 ingest URL 保存在 app 自有 Keychain，accessibility 为 `AfterFirstUnlock`。
- Bridge 只接受同源且路径严格为 `/api/healthkit/energy/ingest` 的 ingest URL；请求使用 Bearer credential 和 installation ID。

不要通过 `authorizationStatus(for:)` 推断 HealthKit 读取授权，也不要为了“显示 Denied”伪造 iOS 不提供的状态。

### 4.3 Local Notification：当前获取与降级语义

`NotificationManager` 使用 `UNUserNotificationCenter`，当前只请求 `.alert`。状态直接映射为：

- `not_determined`
- `denied`
- `authorized`
- `provisional`
- `ephemeral`

需要保留的行为：

- `notification.getStatus` 只读取真实状态，不触发弹窗。
- `notification.requestAuthorization` 仅在 `.notDetermined` 时调用系统请求；Denied 时不死循环重试。
- Denied 时 Settings 提供打开 iOS Settings 的入口，并保留 Web Notifications fallback。
- 只有 authorized / provisional / ephemeral 才允许 schedule。
- 第一版只包含 identifier、title、body、trigger time；不包含 APNs、badge、自定义声音、action、category 或图片。
- App 在前台收到本地通知时展示 banner/list。

原生通知 identifier 由 Web 稳定生成：

```text
evaorbit-reminder-{reminder.id}
```

同一个 identifier 再次提交给 iOS 会覆盖原 pending request，避免修改时间后重复。Swift 只接受 `evaorbit-reminder-` 和 `evaorbit-test-` 前缀，并校验内容长度和未来触发时间。

Web 侧 `reconcileNativeNotifications()` 才是校准逻辑：

1. 先检测完整 bridge capability；普通浏览器/PWA 没有 bridge 时直接返回，不调用 Native API。
2. 权限可调度时从 `/api/notifications` 获取现有有效 reminders。
3. 复用 `notificationSendAt()` 计算明确触发时间；date-only 且没有 snooze 时间的提醒不调度。
4. 排序后最多保留 48 条即将发生的 Native pending reminders。
5. 取消 iOS 中已不在 Web desired set 的 `evaorbit-reminder-*`。
6. 重新 schedule desired set；稳定 identifier 使缺失项补建、修改项覆盖、相同项不产生重复。

reconcile 在 App shell 初始化、`evaorbit:native-ready`、`evaorbit:native-active`、页面重新可见、用户 Refresh status，以及相关 reminder 创建/修改/完成/删除操作后触发。业务 source of truth 仍是 Web/API，不得在 Swift 再建 reminder 数据库。

Settings 中 Native Notifications 和 Browser push 是两个独立 channel。Native 控件只有检测到 Host 后才出现；浏览器不能伪装 Native 可用。不得为了接入原生通知修改或删除现有 Web Push / Cron。

## 五、JS↔Swift bridge 安全契约

当前只有一个 bridge：`window.EvaOrbitNative` / message handler `evaOrbit`，协议版本为 `1`。新增能力应扩展这个 bridge，不新建重复 handler 或绕过它。

以下约束必须保留：

- bootstrap 在 document start 注入，但 bridge 对象不可改写且被冻结。
- 只接受 main frame 调用。
- 只接受 `HostConfiguration` 允许的生产同源 URL。
- 每个请求必须包含匹配的 protocol version、非空 request id、方法名和对象参数。
- 方法必须同时加入 Swift 白名单并实现显式参数校验。
- Web 必须先通过 `host.getInfo` 的 `methods`/capabilities 做向后兼容检测，旧 IPA 不应因 Web 更新而报错。
- Swift 返回结构化成功/错误，不把 secret、系统原始错误体或设备标识送回 Web。
- HealthKit credential 配置继续限制 credential 最短长度、同源 HTTPS ingest URL 和固定 API path。
- Native 权限调用必须由可见的用户操作触发；bridge ready 或 App launch 只允许读状态、恢复已有后台能力或 reconcile 已获授权的项目。

如果同时修改 Web 和 Swift bridge，部署顺序应兼容旧 Host：Web 端先以 capability detection 做无害降级，再安装新 IPA。不要假设所有用户已经更新 Native Host。

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
