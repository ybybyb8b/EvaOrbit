# Parlor 与 Sebastian V1

> 后续变更：`codex/parlor-native-test` 已按用户授权退役 Hermes 插件、连接 API 与 UI 后备链路，仅保留共用聊天视觉及设备偏好。本文相关旧链路描述为历史记录，当前行为以 [Native 测试发布](PARLOR_NATIVE_TEST.md) 为准；生产 Web 分支未切换。

基于工作区现有 Native Eva Phase 1A 候选源码，未提交、推送、部署或构建 IPA。

## 产品与入口

- EvaOrbit 是生活系统，Parlor 是共用 AI 空间，Sebastian 是默认人格。首页原悬浮入口、导航与页面统一显示 Parlor；保留 `/ai` URL 和旧链接，本地模块标识为 `parlor`。
- 依 `host.getInfo.methods` 检测完整 Native 能力，不依赖 UA。具备新版 Runtime 的本地 Host 使用 Sebastian；Web／旧 Host 沿用真实 Hermes 通道及其 Agent 身份，不伪装为本地人格。
- 聊天复用 Hermes 消息、Markdown、输入、键盘、滚动、历史和 Vintage 视觉。左上角为人格快速入口，右侧为历史、新会话与设置。单个人格的首期切换面板只展示真实可用的 Sebastian。
- 首次进入使用指定欢迎语，空白新会话使用日常问候。普通回答不自动插入“已经处理妥当”等口头禅；操作成功仍使用已有真实结果反馈。
- 回答尾部展示模型显示名、输入与输出 Token 合计、时间；点击查看请求、人格历史署名、模型 ID、缓存、费用快照及用量来源。缺失数据保持未知。

## 集中设置与复用

`ParlorSettings` 同时供 Web 和本地壳使用，集中 Providers & Models、Personas、Memory、Context、Group Chat、Tools & Permissions、Usage & Cost、Data & Privacy。全局 Settings 中仅保留 Parlor 入口；旧 `/settings/ai-connection` 兼容进入新页面。

Native Provider 设置复用 Phase 1A 的 Keychain 配置表单；无 Runtime 时复用原在线 Provider 设置与账户安全请求。外观与头像继续复用 `HermesAppearanceSheet`，放在 Data & Privacy。身份提示词与价格折叠均使用项目通用 `Disclosure`，保留展开状态、整行点击和隐藏字段校验行为。

人格设置可保存名称、称呼、幽默／正式／亲近程度、系统提示词和可选默认 Provider／Model。未绑定时使用首个启用模型，不将人格和 Runtime／Provider 写死在一起。默认头像为简洁首字母，可通过既有外观设置上传设备本地头像。

显式绑定的模型被删除或停用后，暂停发送并提示重新选择，不静默改用其他服务商或模型。

Memory、自动上下文摘要、Group Chat、EO 工具和跨会话用量报表尚未启用，对应设置明确说明实际边界。没有伪造开关，也未提前实现 Persona CRUD。后续人格的独立生成参数、记忆范围、工具与群聊权限应扩展 Persona 配置及 Runtime 的独立权限检查，不能仅靠提示词授权。

## 本地数据与 Bridge

- 新增纯数据模型 `ParlorPersona`，完整默认提示词位于 Swift，未读写 `SELF_PERSONA.md`。Runtime 额外注入实际能力边界：当前没有 EO 工具、业务记录或长期记忆访问能力。
- `ai.sqlite3` schema v2 新增 `ai_personas(account_id,id,payload)`，主键按账户及人格隔离。v0/v1 可幂等升级，保留原 Provider、会话、消息和中断恢复逻辑；不涉及 Supabase。
- 默认 Sebastian 按账户惰性创建。保存人格不请求模型；不读取或迁移服务端密钥及 Hermes 历史。
- Bridge 增加 `ai.savePersona`，`ai.getState` 返回 Persona，`ai.send` 接受并校验当前 personaId。沿用可信本地主 frame、origin、账户及 generation 校验；活动请求期间不允许保存人格。
- 新 assistant 消息附带可选 `personaId/personaName` 快照；更改名称或提示词不修改旧回答。原 Phase 1A 消息没有此字段仍可解码，详情保留原 Eva 署名。
- API Key 仍只进入独立 Keychain，不进入 Persona、普通日志、SQLite 字段或默认备份。

## 主要文件

| 文件 | 本次职责 |
| --- | --- |
| `src/components/parlor-settings.tsx`、`parlor.module.css` | 集中设置、默认人格编辑与快速入口样式 |
| `src/components/native-eva-chat.tsx` | Sebastian 身份、欢迎语、快速人格入口、精简消息元信息与详情 |
| `src/components/native-eva-settings.tsx`、对应 CSS | 复用本地 Provider 配置，价格折叠统一 Disclosure |
| `src/lib/native-eva.ts` | Persona 类型、历史署名字段与新增方法能力检测 |
| `ios/EvaOrbitHost/Sources/ParlorPersona.swift` | 独立人格值模型、默认提示词、偏好校验与实际能力约束 |
| `AIStore.swift`、`AIModels.swift`、`AIRuntime.swift` | v2 迁移、账户隔离保存、人格注入与历史快照 |
| `src/local-trackers/main.tsx`、`native-eva-entry.tsx`、`settings-workspace.tsx` | 本地 Parlor 模块、设置路由与返回恢复 |
| `src/app/ai/`、`src/app/settings/`、`app-navigation.tsx`、`hermes-activity.tsx`、`hermes-chat.tsx`、对应 CSS | Web／后备链路命名、集中设置入口与导航链接 |
| `scripts/parlor-browser.mjs`、Native Mock／测试脚本、`AIRuntimeTests.swift` | 新人格、迁移、交互、截图与既有链路回归 |

沿用已有未提交的 Phase 1A 改动，不覆盖用户其他工作；未增加依赖、UI 框架或平台权限。

## 验证与限制

Mock 预览：`node scripts/native-eva-preview.mjs`；浏览器回归与截图：`node scripts/parlor-browser.mjs`（原 `native-eva-browser.mjs` 保留兼容入口）。脚本需要可用的 Playwright，支持通过 `EVAORBIT_PLAYWRIGHT_MODULE` 指定已安装模块。预览仅绑定 127.0.0.1:4187，屏蔽云端接口，不调用真实模型；浏览器中的会话持久化属于模拟数据，不能代替原生 SQLite／Keychain 验收。

补充 Swift Testing 覆盖人格独立保存、账户隔离、重开数据库、历史署名与实际能力提示。Node SQLite 测试直接执行源码迁移 SQL，检查 v1→v2、重复迁移、部分输出保留和账户隔离。

Windows 环境没有 Xcode／Swift 工具链，本轮不能证明原生源码编译、Keychain 真机行为或 iPhone 16 Pro 键盘表现。仍需后续授权构建、安装新版 Host 并验收；未触发正式 IPA，也未调用真实 Provider。

本轮已执行：

| 检查 | 结果 |
| --- | --- |
| Native 协议／事件、源码 SQLite 迁移／Bridge 安全、导航、外观、Hermes 和返回按钮相关 Node 测试 | 9/9 通过 |
| 本地返回与原生转场测试 | 2/2 通过 |
| Parlor Mock 浏览器回归 | 手机 402×874、桌面 1280×900 通过；包含逐步输出、取消／刷新保留、人格持久化、历史署名、两处 Disclosure、Provider 保存、旧 Host 后备、失效模型绑定；真实外部请求为 0 |
| 旧 Hermes 全链路 Mock 浏览器回归 | 通过，40 次模拟写入、无页面错误；更新了重命名后的状态面板／连接按钮定位 |
| TypeScript／相关 ESLint | 通过，Lint 无错误或警告 |
| Next.js 生产构建、本地 React/Vite 构建 | 通过；Vite 仍有既有大 chunk 提示 |
| UI 静态设计检查／diff 空白检查 | 通过 |
| Swift Testing／原生编译／iOS 真机／真实 Provider | 未执行 |

截图由实际渲染的 Mock 页面截取，包含浅色／深色聊天、首次欢迎、集中设置、人格折叠及展开态。截图中的模拟提示词用于界面演示，实际默认提示词以 `ParlorPersona.swift` 为准。
