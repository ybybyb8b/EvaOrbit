# Parlor Memory · Phase A

> 历史阶段记录：后续 [Phase B](PARLOR_MEMORY_PHASE_B.md) 已加入本地上下文组装、记忆读取、schema v7 和备份 v2；两阶段合并为源码候选，尚未正式验收。下文的 v6/不注入描述指 Phase A 当时的范围。

本阶段交付 Native Persona Memory 基础源码及隔离验证。没有构建、安装或发布 IPA，没有修改真实设备数据库、Supabase 或生产 API。Windows 无 Swift/Xcode，原生编译、Swift Testing 和 iPhone 16 Pro 验收尚未执行。

## 范围与现有改动

以任务开始时已有的 ai.sqlite3 v5、会话模型切换、Parallel 和 Discussion 源码为基础。保留工作区原有改动，包括 AIGroup、会话模型 UI、测试与已有文档。没有提交、推送、部署或改动签名安装链。

只实现本地数据基础和管理。未接 Echo、MCP、自动提取、Memory Model、摘要压缩或记忆注入；手动 CRUD 和备份不发模型请求。人格提示词继续如实表示模型尚不能访问长期记忆。

## 数据与迁移

AIStore 接受 schema 0–6，现有库升级到 v6 前用 SQLite online backup API 保存包含 WAL 的安全副本，并执行 quick_check。旧迁移按原始版本执行，v6 在一个 BEGIN IMMEDIATE 事务内增加：

| 表 | 作用 |
| --- | --- |
| ai_conversation_owners | account_id + conversation_id 主键；single、group、unresolved；只有 single 有 persona_id |
| ai_persona_memories | account_id + persona_id + id + version 主键；kind、status、Codable payload；同一记忆最多一个 active 版本 |

没有重建旧表或覆盖旧消息。迁移 SQL 位于 AIStoreMemory.swift。这里只在隔离 SQLite 中执行过实际 SQL；真实设备迁移须在之后运行新 Host 时发生。

旧 v5 Host 会拒绝更高版本数据库；回退二进制不能直接继续读 v6。迁移前的内部 SQLite 安全副本用于恢复排障，不自动降级或覆盖当前数据。

记忆包含 UUID、账户和人格、类型、正文、1–5 重要度、认知性质、创建/更新时间、版本、生命周期及来源。类型为 experience、understanding、observation、commitment、ongoingTopic；认知性质为 userStatement、sharedExperience、personaObservation、promise。来源保留原始 conversationId、可选 messageId 和逐字摘录；保存时验证账户、访问范围、消息关联和原文匹配，不接受虚构摘录。

编辑保持同一记忆 ID，增加版本并把前版标为 superseded。写入携带 expectedVersion，拒绝过期编辑和删除，删除标记不能经普通编辑复活。列表只读取当前人格的 active 版本，详情可查看同一人格的版本链。

## 单聊归属与兼容

- ai_groups、ai_rounds、ai_discussions 或消息 roundId 证明是群聊的记录优先归 group。
- 非群聊只有在存在 assistant 消息、全部 assistant 都有同一 personaId 且人格属于同一账户时自动回填。
- 空历史、缺失署名、混合人格及引用不存在人格的历史保留 unresolved，不猜测默认 Sebastian。
- Memory 设置可先查看旧历史，再明确指定整段会话的归属。已确认归属不能通过该操作覆盖。
- 新单聊在消息事务中绑定人格；打开已有单聊显示所属人格；切换到另一人格会新建会话。未确认历史可浏览，但不能直接继续发送。
- 群聊继续使用公共历史和既有轮次快照，不在公共快照中保存人格记忆。
- 原有启动恢复保留：每次重开把孤立消息及 running/summarizing Discussion 标为 interrupted，不启动推理。

## 管理界面与 Bridge

Memory 分区提供人格选择、类型筛选、列表、详情、新增、编辑替代版本、删除、来源选择、原文验证和版本浏览。使用现有 Vintage、表单和 Disclosure，聊天界面只在旧历史待确认时给出设置入口。

八个可选方法：ai.memoryList、ai.memoryDetail、ai.memorySave、ai.memoryDelete、ai.memorySources、ai.assignConversationPersona、ai.exportBackup、ai.restoreBackup。沿用 Bridge v1 的可信主 frame、origin、账户和 generation 校验。记忆读写显式携带 personaId；备份是当前账户的显式管理操作。旧 Host 保留聊天，记忆设置提示升级。

来源选择不允许读取另一人格的私人单聊。群聊当前成员可选择公共历史；退出群聊的人格只可读取自己参与过的历史轮次作为来源。来源权限在 Native 层校验，前端筛选不是安全边界。

## 删除与备份

删除记忆会清空全部版本正文和证据，并保留无内容的 deleted 元数据。删除会话会在同一数据库事务中移除其消息、群聊/讨论/轮次/模型选择/归属，并清空所有引用该会话的记忆版本链。

删除前清理包含对应账户/人格记忆或会话的 App 内安全副本和 App 自己创建的临时分享文件；无法检查或清理时不声称忘记完成。原始来源聊天不会因为单独删除记忆而被删除。用户已另存到 App 外部的备份不受删除影响；这些副本及用户主动从旧备份恢复的数据仍由用户控制。本阶段不承诺 SQLite/WAL 已释放页的取证级擦除。

独立 JSON 导出格式为 parlor-native-backup，version 1、schemaVersion 6，单文件上限 16 MiB，超限拒绝而不截断。包含当前账户全部人格、Provider 配置、会话、消息、群聊、轮次、讨论、会话模型选择、记忆版本和来源；不受历史 UI 最近 200 段限制。不读取或导出 API Key、订阅令牌、Cookie 或 Keychain。

导出复用原生 UIActivityViewController，用户选择存储到文件等系统目标；临时文件使用 complete file protection，分享结束清理。没有依赖 WKWebView 的 blob 下载。分享面板打开不等于用户已经保存文件。

恢复先验证格式、版本、当前账户、SHA-256 内容校验和、身份唯一性、记忆版本链、类型、大小、来源摘录和跨表引用；校验和用于检查内容一致性，不是身份签名。完整校验通过后才准备安全副本并替换当前账户数据，SQLite 写入失败回滚，其他账户保持不变。API Key 不跟随恢复的端点，恢复流程清理相关本机 API Key 并停用恢复的 Provider；重新连接后使用。Keychain 与 SQLite 没有跨存储事务，凭据清理失败会中止恢复，已清理的 Key 可能需要重新输入。

恢复中的 streaming 消息和进行中 Discussion 转 interrupted。冻结回答仍保留原模型，但生成前必须检查当前 Provider 启用状态及端点一致性，不能借旧快照绕过恢复后的停用状态或把新端点凭据发送到旧端点。

## 文件清单

| 文件 | 本阶段内容 |
| --- | --- |
| ios/EvaOrbitHost/Sources/AIPersonaMemory.swift | 记忆、认知性质、来源与校验 |
| ios/EvaOrbitHost/Sources/AIStoreMemory.swift | v6 SQL、归属、隔离、CRUD、版本及清理 |
| ios/EvaOrbitHost/Sources/AIStoreBackup.swift | 一致性安全副本、导出、校验、恢复及内部副本清理 |
| ios/EvaOrbitHost/Sources/AIStore.swift | 迁移、会话归属、关联清理及历史元数据 |
| ios/EvaOrbitHost/Sources/AIModels.swift | 会话归属及受控错误 |
| ios/EvaOrbitHost/Sources/AIRuntime.swift | 本地方法分派、恢复与请求安全检查 |
| ios/EvaOrbitHost/Sources/NativeBridge.swift | 账户校验后的原生文件分享 |
| src/lib/native-eva.ts、src/components/native-eva-context.tsx | 类型、可选能力 |
| src/components/parlor-memory.tsx、parlor-memory.module.css | 记忆管理、归属确认与备份控件 |
| src/components/parlor-settings.tsx、native-eva-chat.tsx | 设置入口及单聊所属人格 |
| ios/EvaOrbitHost/Tests/AIPersonaMemoryTests.swift、AIRuntimeTests.swift | Swift 数据与 Runtime 测试源码 |
| scripts/parlor-memory.test.mjs | 实际 SQLite 迁移与底层操作检查 |
| scripts/parlor-memory-fixture.js、parlor-memory-browser.mjs | 隔离 Native 模拟及真实 React 界面回归 |
| scripts/native-eva-fixture.js、parlor-browser.mjs | 原模拟链路扩展和 Memory 已开放断言 |

## 验证与截图

- Node 全量覆盖 864 项：849 通过、15 可选环境跳过。初次沙箱运行的 Cats 临时图片 rename、两项 Bash 检查和 Memory HTTP 临时目录清理失败；这四项在普通本地进程权限下定向重跑通过，不伪装为初次全绿。日志见 tmp/parlor-memory/node-remainder.log、isolated-rerun.log。
- 本阶段实际迁移/底层 SQL 和相关 Native JS 契约检查 13/13 通过，包括 v6 重复迁移、保守归属、账户/人格隔离、唯一 active 版本、版本清空、WAL 一致性快照及事务回滚。源码恢复检查另验证了 v6 重开仍恢复 Discussion 状态。
- 手机 402×874、桌面 1280×900 的 Memory 浏览器流程通过：CRUD、版本、类型筛选、人格隔离、来源、旧归属确认、文件导出/恢复和旧 Host 降级。模拟模型推理请求 0、外部请求 0、页面运行错误 0。页面真实渲染，Native 数据及系统分享由隔离 fixture 模拟。
- 原单聊、Parallel、Discussion 手机/桌面浏览器回归通过。Parallel 首次桌面失败等待超时，诊断重跑完整通过；单聊旧“Memory 尚未开放”断言已更新。未用 Mock 结果声称真实模型或真机通过。
- TypeScript、定向 ESLint、本地前端生产构建、Impeccable detector 和 git diff --check 通过。保留已有 fixture 的 3 条未使用报价字段 lint 警告、构建的大 chunk 与静态/动态导入提示。
- 新增八项 Swift 测试源码，覆盖真实 AIStore 迁移、来源、版本、归属、备份恢复、WAL 副本、删除清理和恢复后冻结请求安全。Windows 无 Swift/Xcode，尚未编译或执行；这是交付的明确限制。
- 本轮启动的 Vite 预览及测试服务已结束；4187 监听关闭，并核验没有遗留本轮 Native 预览／Memory HTTP／Next 测试进程。

截图均在 tmp/parlor-memory/：mobile/desktop-memories.png、memories-dark.png、versions.png、edit-source.png、backup.png。它们是实际 React 页面截图，不是 iPhone 真机截图。

## 后续验收

在 macOS 编译 Native 并执行 Swift Testing；之后使用原签名/安装链的新 IPA，在 iPhone 16 Pro 验证 v5 升级、冷启动、软键盘、安全区、原生分享/文件恢复、Keychain 失败、账户切换及存储不足。无需新增 entitlement、权限、Supabase 表、API 或 MCP 调用。本阶段到此停止，后续上下文及自动记忆能力等待下一阶段安排。
