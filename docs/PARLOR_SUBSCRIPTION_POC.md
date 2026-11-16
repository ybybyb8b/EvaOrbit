# Parlor ChatGPT / Codex 订阅接入 PoC

调查日期：2026-11-16。状态：**独立 Swift 实验源码已加入；未编译、未上机、未完成真实授权或推理，不算 PoC 验收通过。**

2026-11-16 原生编译准备：用户已明确授权提交／推送 `codex/parlor-native-test` 并手动构建测试 IPA。workflow 新增默认关闭的 `subscription_poc`；仅手动运行、此测试分支且 `local_trackers=true` 才允许开启。开启后沿原 Release / iphoneos / ad-hoc 签名链编译 `PARLOR_SUBSCRIPTION_POC`，安装包启动直接打开独立面板，关闭返回 Parlor，无须 Xcode 启动参数。普通构建不含实验模块。编译是否通过以对应 Actions 结果为准，下面调查阶段的“未执行”不是新构建已成功的声明。

本批打包前验证：完整 Node 回归 855 项（840 通过、15 跳过、0 失败）；TypeScript 通过；ESLint 无错误，已有模型目录 fixture 的 3 个 unused-variable warning 保留；本地 React/Vite 构建通过，保留既有大 chunk 提示。新增两项构建契约测试实际执行 Bash guard 和 xcodebuild stub，确认实验包开关及分支／Host／触发方式限制。新增 Swift 测试仍未运行，沿原 CI 约定不添加 Simulator 执行。

## 结论与路线比较

优先选择 **Sign in with ChatGPT（SIWC）的 ChatGPT plan usage 动态注册路径**。当前官方资料已包含本地个人项目通过用户授权使用符合资格的 Plus/Pro 计划；不能继续笼统地认为“Plus 永远不能用于第三方请求”。身份登录和计划用量是不同权限，最终以账号授权返回的 scopes 和推理结果为准。[官方集成示例](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)、[入口与资格](https://developers.openai.com/siwc/quickstart)

| 路线 | 官方支持与 Plus 用量 | 对本次 Swift/iOS PoC 的判断 |
| --- | --- | --- |
| SIWC：身份 + ChatGPT plan usage | 本地／开源客户端有公开动态注册流程；仅身份登录不等于推理权限。符合资格的用户可授权使用计划。商业身份集成／付费或远程托管产品另有准入。 | 首选。自己注册 EvaOrbit 客户端，直连官方 Responses API，无需借用 Codex client ID。[官方概览](https://developers.openai.com/siwc/token-sharing-open-source) |
| Codex OAuth / App Server | 官方面向集成客户端提供授权、会话与流式 RPC；现有本地／开源集成可继续使用，官方建议迁往 SIWC。 | 它是本地 Codex 进程及 JSON-RPC 服务，不是 Swift OAuth SDK。即使不使用 Node，也增加本次不需要的进程和 Agent 运行层；本轮未尝试移植 iOS。[App Server](https://learn.chatgpt.com/docs/app-server#authentication-endpoints) |
| `chatgpt.com/backend-api/codex` | OpenAI 工程文章明确说明 Codex 的 ChatGPT 登录会使用其中的 `/responses`。因此它不是虚构地址，但不能据此认定它是任意第三方客户端的公共接口契约。 | 不用于本 PoC。SIWC 文档明确要求请求 `api.openai.com/v1/responses`，不要指向 `backend-api`。未核验 Aru 源码，不能根据截图推断它使用哪套 client ID、授权范围或刷新机制。[Codex 工程说明](https://openai.com/index/unrolling-the-codex-agent-loop/)、[SIWC 推理契约](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) |

若未来把此功能放进付费／远程托管产品，应先走[官方意向申请](https://openai.com/form/sign-in-with-chatgpt-interest/)，不能把个人本地 PoC 的结果视为商业资格获批。[适用范围](https://developers.openai.com/siwc/token-sharing-open-source)

## 已实现的独立实验

没有修改 `AIRuntime`、Provider schema、API Key 保存流程、Native Bridge 方法、数据库或 Web 页面。测试面板直接调用原生 PoC，对 JS 不暴露凭据或任意 HTTP 能力。

| 文件 | 本次功能 |
| --- | --- |
| `ios/EvaOrbitHost/Sources/SubscriptionPoC/SIWCProtocol.swift` | PKCE、随机 state/nonce、官方注册参数、回调校验、RS256/JWKS 身份校验、独立 Keychain、Responses 事件解析及安全错误码 |
| `ios/EvaOrbitHost/Sources/SubscriptionPoC/SIWCBrowserLogin.swift` | 系统 `ASWebAuthenticationSession` + 仅监听 `127.0.0.1` 的 `NWListener`；短连接、3 分钟期限、取消与资源回收 |
| `ios/EvaOrbitHost/Sources/SubscriptionPoC/SIWCRuntime.swift` | 授权码交换、到期刷新、旋转凭据保存、读取当前账户模型、一次最小请求、SSE 增量、取消和撤销 |
| `ios/EvaOrbitHost/Sources/SubscriptionPoC/SIWCViewController.swift` | 原生独立实验面板；登录、模型选择、明确点击发送、状态／错误／部分响应展示、停止、退出与 Usage 链接 |
| `ios/EvaOrbitHost/Sources/AppDelegate.swift` | Debug 启动参数或显式 PoC 构建开关在本地 Host 打开面板；底层路由指向 Parlor，关闭后返回 |
| `ios/EvaOrbitHost/Tests/SIWCSubscriptionPoCTests.swift` | Mock 协议与请求测试，详见下文；不访问真实账号 |
| `docs/DEV_INDEX.md`、`docs/IOS_NATIVE_MAINTENANCE.md`、`docs/IOS_NATIVE_HOST.md`、本文 | 记录独立边界、入口、真实验证状态与后续步骤 |

PoC Swift 源码用 `#if DEBUG || PARLOR_SUBSCRIPTION_POC` 隔离；Swift 测试保留 Debug。普通 Release 包不包含该实验模块或入口。后续原生编译准备仅在 Info.plist 增加默认关闭的 `EvaOrbitSubscriptionPoCEnabled`，由明确的测试包设置开启；没有修改签名、entitlement、URL scheme。模块使用系统 AuthenticationServices、Network、CryptoKit、Security，Swift framework imports 由工具链链接，无第三方包或 Node 运行时。

复用现有 `AISSEParser` 的字节级 UTF-8／CRLF framing，以及 `AIProviderAdapter.configuration()` 的无 Cookie／无 credential cache session 配置和拒绝重定向 delegate；**不使用其 Chat Completions 解析器**。复用既有受验证的 Native 深链导航进入 `/ai`，不增加 Bridge。

### 授权与安全

按官方动态注册流程生成并保存稳定 host ID；新注册使用 `dynamic_agent_client`，回调后保留 OpenAI 颁发的 client ID，用该 ID 交换代码及后续登录。每次使用独立 state、nonce、S256 PKCE，校验回调路径、端口及重复参数。ID Token 使用官方 JWKS 验签，再核对 issuer、audience、过期时间、nonce 和已有 subject。只有计划权限存在才可推理。[注册与登录](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)

独立 Keychain service：`com.evaorbit.nativehost.subscription-poc.v1`，`WhenUnlockedThisDeviceOnly`，不参与 iCloud 同步。host、注册映射和凭据都在此处，不写 SQLite、UserDefaults、日志、JS 或默认导出。PoC 仅一个明确选择的测试 profile，不自动关联 EO account，不读取 Codex／ChatGPT／旧 Provider 的任何凭据。不支持在此面板创建多个测试账号。

到期时以保存的 issued client ID 刷新，替换完整凭据集合；UI 每次只允许一个操作，Runtime 另拒绝重入刷新。退出尝试撤销 refresh token，随后清除本地 tokens、保留 host 与注册映射；远端撤销无法确认时明确显示错误并可去 ChatGPT Settings 断开。无后台重试。[会话与刷新](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)

仅固定 OpenAI HTTPS 端点接收凭据。所有网络 session 禁用 Cookie、缓存和 URL credential storage，拒绝重定向；不经过 EO 后端。面板只展示固定错误文案、允许的服务错误码和 HTTP 状态，不展示原始错误响应或授权 URL。模型文字仅留在测试面板内存中，关闭后不写聊天历史。

### iOS 回调是待验证的关键

SIWC 当前公开流程要求 HTTP `127.0.0.1:<port>/auth/callback`，不能擅自换成 EvaOrbit scheme。Apple 的正式 session callback 类型提供 custom scheme 与 HTTPS 匹配；本 PoC **不是声称 Apple 已支持 HTTP 匹配**，而是保持系统认证会话，由独立回环 listener 接收已校验的回调，然后主动取消／关闭浏览器并继续交换。[SIWC 回调要求](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)、[Apple callback API](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession/callback)

此组合是否能跨 iOS／默认浏览器可靠工作，**尚无真机证据**。它是实验假设，不是已确认的生产登录方案。进入后台会取消当前尝试，不延长后台运行；不能用唤起外部 Safari 后等待无限期后台监听替代此验证。当前只接受本机 TCP，不发布 Bonjour 或监听局域网；没有为此加权限。[Apple 网络隐私说明](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)

若真机回调无法完成，应停在此处，向 OpenAI 确认移动端允许的 HTTPS／custom scheme 或其它正式流程及注册资格，等待用户完成必要申请。不能自行借用 Codex 的 OAuth client ID 或改用网页 Cookie 绕过。

## 推理协议、模型和费用

模型目录使用当前授权令牌读取 `/v1/models`，按该 SIWC 路线的 `models[]`、`visibility`、`slug` 和 `display_name` 解析，不沿用 API Key Provider 的目录假设，也不硬编码账号可用模型。用户必须选择模型再点击一次发送。

最小请求为 `POST https://api.openai.com/v1/responses`，`input` 为数组、`store:false`、`stream:true`。只发送固定测试语句；不加入 `temperature`、`max_output_tokens` 或其它当前预览不支持的参数。逐个处理 `response.output_text.delta`，只有 `response.completed` 才算成功；失败、incomplete 或提前断流保留部分输出，不自动重试。[模型与推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)、[预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)

用量从完成事件读取；拿不到时标未知。**不把 API 按 token 美元报价当成订阅实际扣费**。Plus 的五小时限制在这些应用间共享，不会因为多注册一个客户端而获得独立额度；是否允许额外 credits 由用户在 [ChatGPT Usage](https://chatgpt.com/settings/usage) 管理。[用量与会话](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)

官方 SIWC 仍有预览和资格限制；额度错误可能在流式响应已开始后才出现。仅展示目录不等于模型有权使用，完整推理才是验证。不能保证接口永不变化或账号零风险。官方条款禁止共享／转售额度、账号轮转绕限和替其他用户完成请求，并可停用违规或有安全风险的应用。个人测试不等于正式产品获准。[恢复策略](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)、[SIWC 条款，2026-11-04 生效](https://openai.com/policies/sign-in-with-chatgpt-terms/)

## 验证结果与阻塞

| 项目 | 本次真实结果 |
| --- | --- |
| Git | 在 `codex/parlor-native-test`，基准 HEAD `6730661` 检查工作区；已有模型目录及聊天 UI 等未提交改动保留 |
| 官方公开资料与 OIDC discovery | 已读取；discovery 公布的 issuer、token、JWKS 与 revoke 端点和代码固定地址一致 |
| 现有 Parlor / SQLite / Bridge / Native-only 分支保护回归 | `node --test scripts/native-eva.test.mjs scripts/parlor-native-only.test.mjs`：4 通过，0 失败；不等于新 Swift PoC 通过 |
| diff 空白检查 | `git diff --check` 通过（已有 LF/CRLF 提示） |
| 新增 Swift Testing | 7 项已编写，**未执行**：PKCE／callback，安全请求／错误，逐字节 UTF-8 SSE／终止帧，Keychain CRUD／隔离，RS256 签名／身份拒绝，Mock refresh／持久化／完成响应，部分输出／取消 |
| Swift 类型检查、Native 构建、签名、真机 | **未执行**；当前 Windows 无 Swift／Xcode／iOS 运行环境 |
| Web 类型检查／Lint／构建 | 本轮未运行；本轮不改 Web/TS；不能将之前批次的结果视为 Native PoC 通过 |
| Plus 账号实际授权 | **未发起**；没有可运行的本次 iOS PoC，也未让用户在官方页面完成此次授权 |
| 真实模型请求／响应／实际扣额度 | **0 次请求；没有真实模型响应，无法确认账户资格或额度消耗** |
| 生产操作 | 没有部署、Migration、commit、push、CI 或 IPA 打包；未启动常驻开发服务 |

当前阻塞不是“确定需要商业 partner client ID”，也不是“已证实 Plus 不支持”，而是 **Native 源码尚未编译和上机，iOS 回环方案尚未实证，用户尚未完成本次 OAuth**。不得将 Mock 的 `mock-success` 文字当成真实模型验证。

## 下一步（需用户操作的阶段）

用户现已授权本批测试分支提交、推送并手动构建。使用既有 `iOS Native Host` workflow，选择 `codex/parlor-native-test`，`local_trackers=true`、`subscription_poc=true`；不得只构建普通 Release 后声称包含实验。构建结果由用户按既有协作约定查看，成功后下载对应 IPA，沿原审计 xtool／Personal Team 链覆盖安装，保留本地数据。

如有 Mac/Xcode，也可使用本地 Host 设置与 Debug configuration 运行 Swift Testing，并添加 Run Argument `--parlor-subscription-poc`。手机测试包使用上面的显式编译开关，不需要启动参数。旧 Release IPA 没有新模块，不能用于验收本实验。

之后在 iPhone 16 Pro 上执行：

1. 保持应用前台，点击 Continue with ChatGPT，在 OpenAI 官方页面选择自己的 Plus 账号并同意计划用量权限。不要把 token、Cookie 或完整回调 URL 发进聊天。
2. 记录能否回到测试面板，以及面板显示的安全状态。取消登录、拒绝权限、超时、切后台都应停止，不发送模型请求。回环失败则先停止，不换内部接口尝试。
3. 成功后读取目录、选一个模型，点击最小请求一次。记录模型、可见增量、首字时间、`response.completed` 与 usage。到 ChatGPT Usage 核对本应用授权及用量；目录和 OAuth 成功都不能替代这一步。
4. 若返回太短无法观察停止，再单独商定长输出测试语句；本版本固定短请求可能瞬间完成，不能据此宣称真机停止通过。Mock 取消测试也不能替代真机取消。
5. 杀掉重开应用，确认连接仍来自 Keychain；等到期后验证刷新。退出验证本地凭据已清除，远端撤销若未确认需在 Usage 中手动断开。返回 Parlor 检查原 API Key 对话仍可使用。

正式 Parlor 接入建议：先完成此独立实验的编译、回调、授权、一次真实流式请求与撤销，再决定是否增加一个**单独 OAuth 身份类型**，保持 API Key 通道兼容。优先 SIWC 官方 Responses；不要把 `backend-api/codex` 包装为稳定 Provider。后续正式集成需补 EO account／多个 ChatGPT 注册隔离、完整账户切换、会话管理和生产 UI，本轮没有提前改造这些结构。
