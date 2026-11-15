# Native Eva Phase 1A

> 后续变更：`codex/parlor-native-test` 已按用户授权退役 Hermes 插件、连接 API 与 UI 后备链路，仅保留共用聊天视觉及设备偏好。本文相关旧链路描述为历史记录，当前行为以 [Native 测试发布](PARLOR_NATIVE_TEST.md) 为准；生产 Web 分支未切换。

基准：用户提供的《EvaOrbit 内置 Eva AI — 产品与技术实施方案 V2》和本阶段明确实施范围；2026-11-16 开始实现。此文记录源码交付与实际验证，不表示已在 iPhone 安装验收。

## 工作区与复核

开始时为 `main`，HEAD `74d4a0f`（Use the local access launcher for workout previews），此前 Memory / Hermes 等旧工作已提交。唯一未跟踪文件为用户的 `docs/EVA_AI_V2.md`，本任务不修改它。重新读取 Phase 0 原报告及当前 AI / Hermes、Native Bridge / Controller、SQLite / Keychain、Diagnostics、主题与 Provider 代码后，确认仍没有原生 AI Runtime，旧 Node 聊天仍先收完整答案，现有 Native Provider 设置仍在线管理云端密钥。

## 本次实现

本地 Host 宣告完整 `ai.*` 方法时，首页原悬浮球直接打开 Eva；普通 Web、线上 Host 和旧本地 Host 继续原 Hermes 链路。不使用 User-Agent 判断支持。原 Hermes 历史可从 Eva 历史面板的次级按钮打开，不自动迁移。

用户在聊天设置或 Settings → AI & Connection 配置本机 Provider、HTTPS Base URL、手工文本模型、启停及可选 Token 单价。保存、读取配置和切换模型均不请求模型。默认 Eva 仅使用最小身份提示，不读取或修改 `SELF_PERSONA.md`。本阶段没有 Persona CRUD、Memory、Group 或任何 EO 工具。

| 文件 / 模块 | 具体职责 |
| --- | --- |
| `ios/EvaOrbitHost/Sources/AIModels.swift` | 配置 / 消息 / 用量类型，HTTPS 端点验证，固定安全错误，未知费用与用户价格快照 |
| `AIStream.swift` | URLSession 直连 Adapter；SSE 字节分帧、UTF-8、CRLF / CR、注释、多行 data、EOF、DONE、error、usage、事件大小限制；拒绝重定向、Cookie 和 credential cache |
| `AICredentialStore.swift` | 独立 Keychain 命名空间；账户 + Provider 复合键；WhenUnlockedThisDeviceOnly；读取、更新、删除和安全错误 |
| `AIStore.swift` | 独立 AI SQLite actor、事务、schema v1、账户隔离、原子消息对、增量更新和启动恢复 |
| `AIRuntime.swift` | 单个活动请求、冻结模型 / 价格快照、主请求一次发送、稳定 requestId 防重复、取消 / 后台 / 账户中断、持久化和事件 |
| `NativeBridge.swift` | 复用主 frame / origin / 方法白名单；仅本地宣告 AI，账户与 generation 前后校验，结构化事件投递；后台及销毁时中断 |
| `TrackerLocalController.swift` | 在既有账户切换 / 登出时通知 Runtime，提供账户 generation 防护；不更改业务队列 |
| `NativeDiagnostics.swift` | AI 受控错误接入既有安全诊断出口，不透传 Provider 原始错误体 |
| `src/lib/native-eva.ts` | JS 协议、完整能力探测、显式账户调用、事件账户 / 会话 / 请求 / 版本过滤 |
| `src/components/native-eva-context.tsx` | 本地壳能力上下文与旧 Host 降级 |
| `native-eva-chat.tsx` | 默认 Eva、历史 / 新建 / 删除、模型选择、流式呈现、停止、重挂载恢复、逐回答用量与费用、次级设置和 Hermes 历史入口 |
| `native-eva-settings.tsx` / `.module.css` | 本机配置面板，密钥只临时驻留密码输入；更改端点提示，密钥清理、价格未知、账户内 Provider / 多模型管理 |
| `chat-composer.tsx` / `use-chat-viewport.ts` | 从 Hermes 提取共享输入和键盘 / 视口适配；保留 IME、桌面 Enter、移动输入与贴底规则 |
| `hermes-chat.tsx` / `hermes-activity.tsx` | Hermes 复用共享输入 / 视口；悬浮球 native 模式读取本机状态，停止云消息轮询和回执监听；普通模式保持原链路 |
| `src/components/app-navigation.tsx` | 可注入 AI 入口名称，默认仍 Hermes；支持 Native 时本地侧栏 / 空间菜单显示 Eva |
| `src/local-trackers/native-eva-entry.tsx` / `main.tsx` / `settings-workspace.tsx` | 本地壳接入、能力分流与设置适配 |
| `ios/EvaOrbitHost/Tests/AIRuntimeTests.swift` | Swift Testing：SSE 边界、Keychain 真读写、SQLite 恢复、Mock 请求 / 取消 / 账户中断 / HTTP 错误 / 不重试 / 无密钥泄露；本环境尚未执行 |
| `src/lib/native-eva.test.ts` / `scripts/native-eva.test.mjs` | Windows 可运行的事件隔离、能力检测、实际 schema / 恢复 SQL 与安全契约检查 |
| `scripts/native-eva-preview.mjs` / `native-eva-fixture.js` / `native-eva-browser.mjs` | 仅显式启动的隔离 UI 模拟与浏览器回归；无真实账户、云端或模型请求，不打进正式 UI |

新增五个原生文件是现有 Host 尚无 AI 网络协议、数据和任务生命周期所必需；复用系统 Foundation / Security / SQLite，不引入第三方运行时或新聊天框架。React 继续复用 `HermesMessageBody`、`MarkdownMessage`、`HermesErrorNotice`、头像 / 背景设置、FormSheet、原聊天 CSS 和 Vintage 深浅 tokens。

## 数据与 Bridge

数据库路径：`Application Support/EvaOrbitAI/ai.sqlite3`。表为 `ai_providers`、`ai_conversations`、`ai_messages`，按 account_id 隔离。模型配置嵌入 Provider 的 models；assistant 消息包含 requestId、模型 / 单价 / 币种快照、请求次数、usage 来源与费用，不含 Key。v1 迁移使用事务和 user_version，拒绝未知未来版本。启动恢复只改变孤立 streaming 的终态，保留已落盘内容，不触发网络。此迁移仅作为原生源码加入，本轮只在临时测试库执行 SQL，未在用户设备或 Supabase 应用。

Bridge 协议仍为 v1，增加上述六个方法和 `evaorbit:ai` 事件。事件带 accountId、conversationId、messageId、requestId、seq、eventType 和累计消息快照，按序增量显示；JS 丢弃跨账户 / 会话 / 请求及旧版本，初次或终态事件会对账本地状态。UI 重挂载不依赖事件一定送达。普通线上方法集合不包含 AI；不新建 handler，不绕过已有认证，不开放任意业务代理。

Keychain 不进入 SQLite、日志、默认导出和 Tracker 备份。更改端点时不允许静默复用旧 Key。Provider Session 不携带 EO Cookie / URLCredential，全部重定向拒绝；上游 HTTP / JSON 错误不转发正文。当前只支持 HTTPS，HTTP LAN Ollama 留待具体平台与权限评估。

## 请求、成本与限制

- 一次用户提交最多启动一个主模型请求，不做自动重试、额外记忆 / 摘要或模型命名调用。Provider 不返回 usage 时保持未知，不用字符估算冒充真实 Token。
- usage 包含输入、输出、缓存 Token；费用由请求启动时的用户单价快照计算。缺价格或必要缓存单价显示未知，不显示 0 元。请求次数表示启动请求尝试，不代表服务商已确认计费；准备阶段取消而未启动网络时记为 0。
- 取消、进入后台或账户切换会取消当前任务；部分输出在向 UI 显示前持久化。系统杀进程后，重开库标 interrupted，不承诺后台无限推理。
- Phase 1A 有一个全局活动模型任务；可浏览旧会话，另一会话运行中会提供返回入口。每个增量目前写入并发送累计快照，长输出可能需要后续合并写入 / 事件优化。
- 会话不做自动裁剪 / 压缩；传输上下文硬上限 128 KiB，最多 1000 条消息、单条回复 2 MiB、单个 SSE 事件 256 KiB。超限提示新建会话，不假装已有 Token Context Manager。
- 历史面板显示最近 200 段会话，不自动删更早记录；全文搜索 / 全量分页和 AI 独立备份恢复尚未实现。系统文件保护不等同于 SQLCipher。
- 首批真实服务商、stream_options 支持和 tokenizer / 模型能力尚待实际账户验证。不支持的协议返回安全错误，不能为了兼容静默再发一次模型请求。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| 全量 Node 回归 | 首次 852 项：835 通过、15 跳过、2 失败。Cats 的临时头像重命名和 Memory HTTP 清理均遇 Windows EPERM；Cats 单独重跑通过。Memory HTTP 在工作区临时目录 / 提升执行后仍因清理 SQLite 文件的 EPERM 失败，不能报告全绿 |
| 最终相关 Node 检查 | 17 / 17 通过：Native Eva、Bridge / session、Hermes RPC、账户配置、共享导航和外观 |
| TypeScript | `tsc --noEmit --incremental false`；通过 |
| 定向 ESLint | 所有新增 TS / TSX / JS 测试脚本和受影响共享组件，0 errors / warnings |
| 本地前端构建 | Vite 打包到 `tmp/eva-phase1a/web-build`，通过；存在既有大 chunk 提示，不触发 IPA 或覆盖 Host 正式资源目录 |
| Native Eva 浏览器 | 402×874 移动端与 1280×900 桌面：悬浮入口、分段输出、停止保留、刷新恢复、用量未知、本地设置保存、深浅色、无横向溢出及旧 Host Hermes 降级均通过；外部请求 0、运行时错误 0 |
| 原 Hermes 浏览器回归 | 通过；40 次合成交互、10 张截图，无运行时错误 |
| UI 检查 | 浏览器插件缺网络策略，按排障后改用已捆绑 Playwright / Chrome 隔离测试；截图人工检查了聊天深浅色、桌面和移动配置，修正本地导航名称与模型行排版；impeccable detector 返回 [] |
| Swift / Keychain / URLSession 原生执行 | 未执行：当前 Windows 无 Swift / Xcode，WSL 无发行版；Swift Testing 代码已提供，不能用 Node / Browser Mock 代替它的通过结论 |
| iPhone 16 Pro | 未测试；真实软键盘、Keychain 签名访问、前后台网络取消、进程杀死恢复和流畅度仍待真机 |
| 真实 Provider | 未调用；没有消耗真实模型 API，待用户确认服务商与本机账户配置后再冒烟 |

浏览器截图和原始检查日志保存在忽略的 `tmp/eva-phase1a/`。测试过程中 Next 曾临时更新 next-env / tsconfig，测试已恢复，最终不包含这两项改动。测试启动的服务在本轮结束前关闭并核验监听；没有停止用户既有服务。

可重复运行：

```powershell
node --test src/lib/native-eva.test.ts scripts/native-eva.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/vite/bin/vite.js build --config vite.trackers.config.ts --outDir E:/EvaOrbit/tmp/eva-phase1a/web-build
# 另一个终端启动本地隔离 UI；完成后 Ctrl+C 关闭
node scripts/native-eva-preview.mjs
# 已安装 Playwright 时；也可用 EVAORBIT_PLAYWRIGHT_MODULE 指向已有模块的 file URL
node scripts/native-eva-browser.mjs
```

## 尚未完成的验收与下一步

源码和 Windows Mock 链路已交付，**Phase 1A 的 iOS 端到端验收尚未完成**。下一步先在 macOS 运行 XcodeGen、原生 build-for-testing 和 Swift Testing，修正可能的编译 / SDK 差异；本轮没有触发这些任务，也没有正式 IPA。之后经用户授权沿现有安装签名链安装新版本地 Host，再使用用户选定服务商做最小真实请求，关闭电脑 Hermes 验证首页入口、逐步输出、取消、Keychain、重新打开应用后的历史 / interrupted 及用量记录。

不把未执行的原生测试、真机或真实 Provider 项标为已完成；先完成这些验收，再进入 Phase 1B 的更多服务商兼容与可靠性扩展。已有依赖安全升级仍应独立安排，本轮未执行 audit fix。

本轮无新增第三方依赖、Supabase 表 / Edge Function / migration、EO 业务数据副本、framework、权限、entitlement、签名变化；未 commit、push、部署或构建正式 IPA。`SELF_PERSONA.md` 与用户已有 V2 文件保持原样。
