# Parlor Group Chat · Parallel / Discussion 源码候选

本轮保留原工作区的订阅 Provider 整合、Vintage 与文案修改，以及用户已有文档。没有 commit、push、部署、IPA 打包或真实模型调用。

## 行为与边界

- 聊天顶栏增加创建群聊，选择 2–8 个已配置模型的人格；群名、成员通过顶栏编辑，历史列表及设置中的 Group Chat 可重新打开。
- `ai_personas` 继续保存默认 Sebastian，并支持最多 50 个 UUID 人格。每个人格独立绑定 Provider/Model；额外人格支持图片头像，Sebastian 保留原有账户设备头像。未接通模型的人格不能加入新群。
- 群配置保存选择时的人格、模型与 Provider 配置快照；编辑群成员时重新读取现有人格配置。每次发送另冻结一份上下文及配置，后续人格/Provider 编辑不会改写已发送轮次。
- 每次消息写入一次用户记录、按成员顺序写入独立回答占位，再同时启动任务。网络先完成的回答不会进入同一轮其他人的上下文；重生成读取原轮快照。
- 单独停止只取消对应任务；停止全部、后台或账户切换取消整组。错误/超时独立保存，不自动重试。部分输出与失败状态保留。
- 重生成作为新消息追加，`supersedesId` 指向旧尝试，不覆盖旧回答。Parallel 后续上下文使用未被替代且完成的回答；Discussion 也保留非空部分输出，但明确标为 incomplete，不视为完整结论。快照已冻结的后续轮次不因旧轮重生成而改写。
- 每条回答保存人格、模型、Provider、Usage、价格快照与请求次数；订阅不套用 API 价格。现支持文本 Parallel 与有界 Discussion、交叉回应及指定人格总结；不开发长期记忆。
- 同一 Native Runtime 一次运行一个会话轮次（可并行多个成员）；允许同轮不同角色独立重生成。列表保留既有最近 200 个会话显示限制，单会话最多 1000 条消息、输入上下文最多 128 KiB，群最多 200 个；不静默截断或删除历史。

## 架构与文件

| 文件 | 职责 |
| --- | --- |
| `ios/EvaOrbitHost/Sources/AIGroup.swift` | 群配置、人格/Provider/Model 快照、轮次上下文 |
| `ios/EvaOrbitHost/Sources/AIStore.swift` | v3 追加 ai_groups/ai_rounds，群创建/编辑和轮次原子写入、恢复、按账户清理 |
| `ios/EvaOrbitHost/Sources/AIRuntime.swift` | 群任务调度、幂等、原快照重生成、单独/全部取消；单聊与群聊共用 perform 传输 |
| `ios/EvaOrbitHost/Sources/AIModels.swift` | 消息 roundId / supersedesId / personaAvatar，兼容旧记录 |
| `ios/EvaOrbitHost/Sources/ParlorPersona.swift` | 多人格 ID、独立头像与配置校验 |
| `ios/EvaOrbitHost/Sources/SubscriptionPoC/SIWCRuntime.swift` | 同账户并行请求共享一次旋转令牌刷新；单个角色可取消等待，刷新本身完成后保存旋转凭据；退出先等待在途刷新，避免清除后重新写入 |
| `src/lib/native-eva.ts`、`src/components/native-eva-context.tsx` | 可选群聊能力、群/人格/消息/活动请求类型 |
| `src/components/native-eva-chat.tsx`、`parlor-group-sheet.tsx` | 群创建/管理、单聊人格选择、独立流式身份、生成控制与历史恢复 |
| `src/components/parlor-settings.tsx`、`src/local-trackers/native-eva-entry.tsx` | 多人格创建/编辑、群聊历史入口 |
| `src/components/parlor.module.css`、`parlor-chat.module.css` | 复用 Vintage、头像/署名、角色气泡与手机布局 |
| `src/components/native-eva-settings.tsx`、`parlor-activity.tsx` | 群活动状态兼容 Provider 配置与浮层 |
| `scripts/native-eva-fixture.js`、`native-eva-preview.mjs` | 明确隔离的模拟 Native 群聊、故障与流式事件；支持指定预览端口 |
| `scripts/parlor-groups.test.mjs`、`parlor-groups-browser.mjs` | 实际 SQLite migration/回滚/账户隔离、交错事件与浏览器验收 |
| `ios/EvaOrbitHost/Tests/AIRuntimeTests.swift`、`SIWCSubscriptionPoCTests.swift` | 真实 Native Runtime 的 Mock 测试，尚未在 macOS 执行 |
| `scripts/parlor-browser.mjs` | 原单聊回归对齐多人格状态快照 |

群配置及冻结轮次是同一 `AIStore` 的补充表，消息仍全部使用原 `ai_messages`，没有第二套聊天存储或 Provider 管理体系。原生 Bridge 主 frame、origin、账户与 generation 校验沿用原实现，普通在线 Host 不增加 AI 能力。所有模型请求仍经本地 Host 直连 Provider，Vercel/Supabase 不转发推理。

## 验证

- 完整 Node 回归：857 项，842 通过，15 可选环境跳过，0 失败。新增测试执行源码中的 SQLite v3 迁移，验证旧数据保留、重复迁移、原子回滚、顺序、部分输出恢复、账户隔离及独立交错事件。
- 浏览器在实际运行的隔离 React/Vite 环境以 402×874 / 1280×900 验证：两人格并行、单独停止后另一人格继续、重生成原快照、停止全部、重载历史、订阅/API 模拟混合、各自 Usage、一个 Provider 失败后另一完成、第三人格创建及加入后继续发送。没有访问真实模型或云端。
- 原 Parlor 单聊浏览器回归通过：流式、停止/重载、用量、人格编辑/署名历史、头像/背景/分段偏好、Provider 保存、不可用模型提示及旧 Host 降级。
- TypeScript、相关 ESLint、Vite 前端构建、diff 检查通过；Impeccable 扫描无发现。构建保留既有大 chunk 提示。模型目录与订阅 Provider 浏览器回归均通过。
- 新增 Swift 测试覆盖 Runtime 并行/相同快照、幂等、重生成、重开数据库、失败保留、单独/全部取消、账户中断、真实 Responses Mock + API Mock 混合、同账户共享刷新；Windows 无 Swift/Xcode，未编译或执行这些测试。已有 PoC 真机证据不能替代本候选验收。

## 截图

全部为本地运行界面、模拟 Native 连接及回答，保存在 `tmp/parlor-groups/`：

- `mobile-create.png` / `desktop-create.png`：群创建与人格选择。
- `mobile-parallel.png` / `desktop-parallel.png`：两个独立流式回答、气泡、人格/模型标识。
- `mobile-stop-one.png` / `desktop-stop-one.png`：停止 Sebastian，Ada 继续。
- `mobile-regenerate.png` / `desktop-regenerate.png`：单角色重生成。
- `mobile-three-personas.png` / `desktop-three-personas.png`：第三人格加入后的并行轮次。

## 待验收

需要以后经授权的新 IPA 才能使用新增 Native 方法；旧 IPA 保留单聊，隐藏群入口。尚未验证 macOS Swift 编译/测试、iPhone 安全区/真实键盘、真实订阅与 API 同时推理、真实额度归属、断网/切后台/账户切换和到期刷新/撤销。当前截图与浏览器模拟不能证明上述原生场景已通过。本轮无新增系统权限、framework、Info.plist、entitlement 或签名安装链改动。

## Discussion 阶段（本次新增）

- 群设置提供 Parallel / Discussion，默认仍是 Parallel；最多轮数 1–5，默认 3。每轮包含所有仍参与的人格；同轮并行、轮间等待。第 2 轮起读取上一轮全部落盘内容，提示人格点名补充、质疑或反驳；实际措辞取决于模型。
- 原 `AIGroupRound` 每轮保存一个新快照，原子保存讨论状态与回答占位。整个讨论冻结根轮的人格/模型配置。每个回答增加可选 `discussionId`、`discussionRound`、`purpose`，Usage / 请求次数沿用原消息字段；重生成仍读取原快照，不覆盖已完成轮次。
- `AIStore` v4 在同一 SQLite 追加 `ai_discussions`，保存根轮 ID、状态、已启动轮数、最大轮数、暂退角色与递增 revision。带 revision 的写入防止旧批次覆盖新暂停状态。启动恢复把 running / summarizing 改为 interrupted；不自动恢复付费请求。
- 输入区显示轮数与暂停／继续／结束／总结。插话先取消并等待当前任务退出，保留部分文本，再保存一次用户消息并带着新方向继续；插话不重置预算。已用尽预算时保存指引，供总结使用。结束后再次发送是用户明确开始的新讨论，重新使用群设置的预算。
- 单角色停止或失败只暂停该人格后续自动轮次，其余角色继续；全部角色暂退且仍有预算时，整场进入暂停，等待明确继续。暂停或结束后可逐条重生成；自动讨论中禁用 retry，避免用新尝试改写正在推进的上下文。明确点击继续会重新邀请所有群成员，消耗剩余轮数；暂停、停止和失败的轮次也计入预算。
- 总结前先终止并等待在途任务；选择群内一个人格单独请求，共识、分歧、未决事项与结论保存在普通消息中。总结不消耗讨论轮数，不自动启动下一轮。群配置仅在讨论结束或完成后可编辑。
- 本地新增可选 Bridge 方法 `ai.discussionControl`、`ai.discussionIntervene`、`ai.discussionSummarize`，旧群聊 Host 仍可使用 Parallel；Discussion 不可用时提示更新 Host。Provider、API/订阅传输、账户门、超时、部分输出和消息事件全部复用，未新增推理代理或服务端调度。

### 本次验证与截图

- Node 完整回归：858 项，843 通过、15 跳过、0 失败；新增执行实际 v4 SQL 的恢复／轮数／revision／账户隔离测试。
- Discussion 浏览器测试：402×874 与 1280×900 均通过，覆盖默认 Parallel、3 轮封顶、同轮一致快照、后续快照包含双方署名、插话与预算、暂停／继续／结束、单角色停止／重生成、指定 Ada 总结、各自 Usage、重开历史、失败后其余人格继续。API / 订阅为隔离 Native fixture，无真实模型或云请求。
- 单聊浏览器回归通过，原 Parallel 浏览器手机／桌面回归通过，包含三人格、混合 Provider、失败与独立控制。Discussion 验收也检查了设置页群聊入口与旧群聊 Host 的可选能力降级。TypeScript、相关 ESLint 和本地前端构建通过；ESLint 保留既有头像 img 提示，构建保留既有大 chunk 提示。
- 新增 4 个 Swift Runtime Mock 测试，覆盖轮次与快照／幂等／总结／恢复历史、插话取消与预算、失败隔离及原快照 retry、单独停止／暂停／继续／结束。Windows 没有 Swift/Xcode，**未编译或执行 Swift 测试**。真实 iPhone、多 Provider 实际流式、订阅刷新、后台及键盘仍待原生验收；本次不打包 IPA。
- 实际运行的 React 页面截图（模拟 Native）：`tmp/parlor-discussion/{mobile,desktop}-{create,discussion,paused,summary}.png`。浏览器脚本为 `scripts/parlor-discussion-browser.mjs`。

本次沿用既有未提交改动，没有 commit、push、部署或打包。
