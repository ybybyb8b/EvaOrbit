请阅读《EvaOrbit 内置 Eva AI — 产品与技术实施方案 V2》，并以它作为本阶段的产品与技术基准。

本次任务目标：实现 Phase 1A——Native Eva 最小可用聊天链路。

### 一、开始前检查

1. 检查当前 Git 分支、工作区状态、已提交改动和未提交改动。
2. 用户已经整理过此前积累的旧改动，以当前仓库实际状态为准。
3. 阅读 Phase 0 原始审查报告，并重新核实其中与本阶段有关的结论。
4. 检查现有 HermesChat、NativeBridge、TrackerLocalDatabase、Keychain、Diagnostics、Provider 配置和主题实现。
5. 列出本阶段需要修改的文件及复用方案。

保护已有改动，不覆盖用户工作。

### 二、实现范围

完成以下能力：

1. 一个 OpenAI-compatible 文本 Provider Adapter。
2. 默认 Eva 聊天入口。
3. 本地 Provider 和 Model 配置。
4. 独立 Keychain 密钥管理，按 EO account 和 Provider 隔离。
5. 独立 ai.sqlite3 数据库及必要的版本迁移。
6. Swift Native AI Runtime。
7. 受现有安全机制保护的 Native Bridge。
8. 真正逐 token SSE 流式输出。
9. 请求取消和任务生命周期管理。
10. 本地消息持久化。
11. 应用重启后的会话恢复和中断状态。
12. 基础 Token Usage 与费用记录。
13. 保留现有 Hermes 聊天交互和 Vintage 视觉体系。

在本地 Native Host 支持 AI Runtime 时，首页悬浮球应直接进入 Native Eva。普通 Web/线上 Host 继续使用其现有可用链路，依据真实 Host 能力判断，不依赖 User-Agent。

### 三、技术边界

- 优先使用 Swift、Foundation URLSession、Security 和系统 SQLite。
- 复用现有 Hermes 消息组件、输入区、Markdown、滚动和错误呈现。
- 复用 NativeBridge 现有 origin、主 frame、账户和方法白名单校验。
- 复用现有 SQLite 事务、账户隔离和备份经验，但 AI 数据独立保存。
- Provider 请求不得携带 EO 登录 Cookie。
- API Key 不得写入 SQLite 普通字段、日志或默认导出。
- 不新增 AI 专属 Supabase 表或 Edge Functions。
- 不引入 Node Runtime、完整 Agent 框架、向量数据库或新的聊天 UI 框架。
- 不自动迁移旧 Hermes 历史或服务端 API Key。
- 不修改现有 SELF_PERSONA.md；Eva 的默认身份使用最小配置，原有内容作为待用户确认的参考。
- 不提前实现 Persona CRUD、Memory Manager、Group Engine 和 EO 写工具。

### 四、成本与流式要求

- 直接由 Native Host 请求 Provider。
- 支持 UTF-8 分片、CRLF、SSE 事件解析、结束帧和错误帧。
- 流式输出应真正逐步呈现，不能等完整回答生成后再一次性发送。
- 本地存储、人格切换、用量记录和取消操作不额外请求模型。
- 真实模型请求的 Token Usage 能获取则记录；无法获取时明确标记未知或估算。
- 不自动重试可能已经计费的请求。

### 五、测试

至少覆盖：

- SSE 分片和 UTF-8 边界。
- 正常结束和错误帧。
- 请求取消。
- Keychain 读取、更新和删除。
- 账户切换隔离。
- SQLite 持久化与重启恢复。
- 中断后部分输出保留。
- Provider 错误处理。
- 密钥不进入日志和数据库。
- Native Bridge 安全校验。

先使用 Mock Provider 和测试数据，不要擅自调用真实模型 API。真实 Provider 冒烟测试等待用户确认具体服务商和账户配置。

### 六、交付与验收

完成后报告：

1. 修改文件及具体功能。
2. 复用了哪些现有实现。
3. 新增了哪些模块，为什么需要新增。
4. 数据库和 Bridge 的变化。
5. 测试、类型检查、Lint 和构建结果。
6. iOS 真机验证情况。
7. 当前已知问题。
8. 尚未完成的 Phase 1A 验收项。
9. 下一阶段建议。

不要 commit、push、部署、执行 Supabase Migration 或触发正式 IPA 构建。

本阶段的验收目标是：关闭电脑 Hermes 后，用户仍然能够通过 EvaOrbit 首页悬浮球打开 Native Eva，使用本地配置的 API Key 直接请求模型，看到真正的流式回答，可以停止生成，并在重新打开应用后恢复会话。