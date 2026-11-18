# Parlor 会话模型快捷切换（源码候选）

单聊顶部显示当前模型的 `AIModel.name`，名称与人格下拉分为两个独立按钮。人格选择弹层用统一 grid 和 12px 间距，卡片显示人格名及当前会话模型。群聊输入区上方的“模型”入口按人格选择模型，复用已配置 Provider 的模型及连接状态；不读取新目录、不保存新凭据。

## 行为

- 点击空闲时的其他模型立即切换；点击当前模型不产生写入或停止。选择列表支持按名称、ID、Provider 搜索。
- 单聊正在生成时明确选择“停止并切换”，Native 先取消并等待当前任务退出，保留部分输出，再保存选择。
- Parallel 只停止被切换的人格，其余人格继续原轮；Discussion 使用“暂停并切换”，取消并等待整轮退出，再保存选择。点击继续后，剩余轮次读取新模型；不重置讨论预算，不自动恢复推理。
- 选择按账户／会话／人格持久化，覆盖人格默认绑定，但不修改 `ai_personas` 或群的默认配置。重新进入保留选择；新会话使用默认配置。第一次在尚未发送的单聊选模型，会保存一个可重新打开的空会话。
- 每个已创建的回答与轮次保留原 Provider／Model／Usage 快照；单条 retry 仍使用原轮配置，不使用新选择。重新发送才读取当前会话配置。
- 失效绑定不静默回退；单聊提示重新选择，并直接打开会话模型列表。旧 Host 无新能力时显示模型名称，禁用快捷切换，保留既有聊天与人格设置入口。

## 实现与边界

| 文件 | 职责 |
| --- | --- |
| `ios/EvaOrbitHost/Sources/AIGroup.swift` | 会话模型选择及不含密钥的配置快照 |
| `ios/EvaOrbitHost/Sources/AIStore.swift` | 同一 `ai.sqlite3` v5 追加 `ai_conversation_models`，按账户／会话／人格 upsert；随会话删除，保留旧表与消息 |
| `ios/EvaOrbitHost/Sources/AIRuntime.swift` | `ai.setConversationModel` 验证当前成员、可用 Provider／Model／凭据、账户及 epoch；停止／暂停后落盘；单聊参数一致性、后续群轮应用选择 |
| `src/lib/native-eva.ts`、`src/components/native-eva-context.tsx` | 可选能力检测、会话选择类型及统一模型解析 |
| `src/components/native-eva-chat.tsx`、`parlor-conversation-models.tsx` | 顶部双入口、人格列表、群聊模型入口、搜索与在途切换确认 |
| `src/components/parlor.module.css` | 列表间距、模型名省略、Vintage 及响应式样式 |
| `scripts/native-eva-fixture.js` | 隔离 Native 模拟、会话配置与切换时的生成控制 |
| `scripts/parlor-groups.test.mjs` | 实际 SQLite v5 SQL 的保留／隔离／upsert 与模型解析测试 |
| `scripts/parlor-model-switch-browser.mjs`、`parlor-browser.mjs` | 新交互验收与原单聊检查更新 |
| `ios/EvaOrbitHost/Tests/AIRuntimeTests.swift` | 3 个 Native Mock 测试源码：单聊停止／无效选择保护／持久化，Parallel 新旧配置与 retry，Discussion 暂停／预算／后续模型 |

Bridge v1、主 frame、origin、账户隔离、Keychain、推理传输及超时仍沿用原边界；普通线上 Host 不增加 AI 能力。不新增服务端推理、模型管理体系或独立存储服务；本次没有修改 framework、Info.plist、权限、entitlement、签名或安装链。需要以后授权构建并安装新 IPA 才能验证新增 Native 方法；没有触发 CI／打包／提交／推送／部署。

## 验证

- 完整 Node 回归：860 项，845 通过、15 可选环境跳过、0 失败。
- 新浏览器验收在实际 React/Vite 页面＋模拟 Native Host 下以 402×874、1280×900 验证：顶部 display name、人格卡片间距、选择持久化及会话隔离、人格默认不变、在途单聊切换、Parallel 同伴继续、原快照 retry、Discussion 暂停及剩余预算、历史恢复和旧 Host 降级。没有真实模型或云请求。
- 原 Parallel 与 Discussion 手机／桌面浏览器回归通过。原单聊回归覆盖人格编辑、头像、流式、停止／重开、Provider 设置、分段偏好与失效模型恢复；结果见 `tmp/parlor-model-switch-single-regression.log`。
- TypeScript、相关 ESLint、本地前端构建、diff 检查及 Impeccable 扫描；最终日志在 `tmp/parlor-model-switch-*`。构建保留既有大 chunk 提示。
- **Windows 无 Swift/Xcode，新增 Swift 源码及 Mock 测试未编译／执行。** 本地浏览器不证明真实订阅/API 切换、iPhone WKWebView、键盘和取消行为已通过，需后续原生编译与真机验收。

截图：`tmp/parlor-model-switch/{mobile,desktop}-{personas,single,group-models,picker}.png`，均为本地 React 运行页面、模拟 Native 连接。

本次保留先前未提交的标题行高修复，以及用户已有的独立文档改动。
