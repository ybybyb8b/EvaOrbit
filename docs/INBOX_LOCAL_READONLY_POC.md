# Inbox 共享界面与只读离线

## 范围

- `InboxWorkspace` 使用原 Web `InboxView`；列表、状态筛选和 `InboxCaptureForm` 两端共用。`InboxDataProvider` 仅注入只读 GET，未重写简化列表或表单。
- 原行内捕获表单和全局 Log 都可输入临时草稿；本地保存、处理、归档、恢复、删除和任何强制提交均拒绝。普通 Web 保留实际写入。旧版转换目标 `task` / `memory` 只展示其已有信息，不改成 Memo，不执行转换。
- 使用统一 Header，Inbox 根页面返回 Home；不增加业务页返回或设置按钮。主导航和通用 Log 选择器加入 Inbox。
- 本轮仅为失败反馈补齐公共 `ErrorNotice` / `responseError`，读取失败保留当前列表且提供重试；不再把 API 错误静默显示为空列表。捕获失败保留输入并反馈错误，Web 业务规则不变。

## 数据与边界

- 复用现有纯读取 `GET /api/inbox?status=all`，不需要新增生产 API 或 migration。原服务无分页完整性标记；客户端最多保存响应中的前 500 条、每账户 8 MiB，始终称为“已下载记录”，不宣称完整历史。
- 所有状态过滤仅查询下载缓存。保留内容原文、source、createdAt/updatedAt、nullable processedAt 与历史 convertedType/convertedId。
- 浏览器键 `inbox-readonly:<accountId>`；原生新表 `inbox_readonly_cache`，不修改 SQLite schema version、原记录、outbox 或备份。无静默清理/迁移原业务数据。
- Native bridge v1 增加 `inbox.readOnlySnapshot`，限本地 PoC main-frame/origin。网络只允许符号路径 `inbox` 的 GET；Native 固定构建 `/api/inbox?status=all`，不把参数拼进 path 或接受外部 URL。浏览器 Vite 的精确 `/eo-api/inbox` GET 同样映射该地址；写入/任意查询/详情/convert 禁止。
- 读取前后身份校验、提交时本地会话检查、Native generation 与备份检查沿用当前 PoC。格式、重复 ID、状态/时间/引用类型和体积失败均不覆盖原缓存。旧 Host 缺少 capability 时提示升级，无不安全回退。
- Native 导出、HealthKit、EventKit、通知、签名链及权限不变；没有新 framework 或 entitlement。

## 验证和发布

- `scripts/inbox-readonly.test.mjs`：快照、上限、旧引用、状态筛选、路径/写入拦截；隔离 SQLite 所有业务表安装写入阻断后验证真实服务 list/detail 无副作用。
- `scripts/inbox-offline-browser.mjs`：共享界面与状态筛选、行内/Log 同一捕获表单、强制提交、旧转换展示、402/900/1280 布局、离线浏览器重启、账户/异常刷新保留缓存和旧队列、打包 CSP/模拟 Native bridge 不发 API 请求。
- 新 XCTest 覆盖原生缓存重开、错误账户/损坏/超限拒绝、冻结队列保留与网络白名单。Windows 不执行 Xcode/XCTest；真实 WKWebView、键盘、顶部安全区和冷启动仍待 macOS CI 与 iPhone 16 Pro。
- 本轮留在工作树，未自动提交、推送、部署或生成 IPA。和 Memo、Header 修复一起进入下一次开发版构建；其他模块未部署的只读 API 仍需单独确认。
- 回退保留 App 安装与数据库；旧版本忽略新缓存表即可，不清库、不卸载、不恢复旧同步写入。

## 本轮实际检查结果

- 全量 Node 测试631项：619通过、12个隔离PostgreSQL/PGlite环境依赖项跳过、0失败。lint、typecheck、Next production build、本地 Vite build、git diff --check 通过。
- Inbox浏览器端到端、Web隔离SQLite捕获/处理/恢复/归档/删除与全局Log、失败保留草稿/错误条幅通过；Memo和Home浏览器回归通过。未读取生产账户，未操作生产数据。
- Native XCTest已补齐但Windows未执行，真实iPhone验收未进行；本轮未运行远端CI或打包IPA。JS主包约1.17MB（gzip352kB），仍有大chunk警告，真机解析与启动性能待验证。
- 本轮启动的预览/测试服务均关闭，原有next-env.d.ts改动保持原始内容。