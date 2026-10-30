# Settings 共享页面

开发版直接复用 Web 的共享设置目录，包含 Timeline 关联规则。页面内部只向全局 Header 注册返回动作，不增加第二个返回/设置按钮。保留英语/August 视觉基准、主题和字号体系。账户、Tracker 暂停开关保留；技术说明折叠。

Timeline 管理沿用既有配置通道，增加精确 GET/PUT `/api/timeline-association`，账户、generation、无缓存／队列／重试边界不变。旧 IPA 拒绝该路径，管理需新包或 Web；Home 沿用服务端快照展示结果。见 [关联规则契约](TIMELINE_ASSOCIATION.md)。

## 已接入

- 外观：原 AppearanceSettings，本机立即保存，离线可用；不改 Web 云端偏好语义。
- 生活日：原 LifeDaySettings，通过注入 request 在线 GET/PATCH；不在离线伪造规则或排队保存。
- 日历解读：原列表、规则 FormSheet、分类、图标与版本冲突处理。仅分离 Next router 包装和共享表单内容，Web 仍 refresh，本地不依赖 Next 上下文。完整 Reicon 目录由已安装包生成独立懒加载资源，不调用本地不存在的 `/api/reicon`，不增加第三方依赖。
- AI：保留既有在线 Provider/model 配置和密钥清除边界，无离线密钥、聊天或重试队列。
- Apple Health / Apple Integration / 原生通知：原共享组件的 readOnly 模式读取实际权限、指标/来源、排程数量；不请求权限、不配凭据、不同步或 schedule/cancel。仅用户点击时可打开 iOS Settings。浏览器与旧 Host 明确降级，不能伪装原生可用。
- 数据与备份：复用 BackupExportCard，导出本账户原隔离 Tracker 与编辑副本及队列。云端业务完整导出、旧 Memory 和 Bark/网页推送/提醒规则/投递历史通过 Web 管理；不把本机 Tracker 导出称为全站缓存备份。

## 传输及兼容

Bridge v1 增加 `settings.configuration`，精确放行 GET/PATCH `/api/preferences/life-day` 和 GET/PUT `/api/calendar-interpretation`；路径/query/方法之外一律拒绝。复用 AI 配置通道的账户/generation 检查、冻结 Cookie、临时 URLSession、请求/响应大小上限及禁止重定向；不保存请求或响应。Web proxy 对附带 `X-EvaOrbit-Account` 的上述接口核验当前账户，不影响普通 Web 表单。

Session 新增 `settingsConfigurationProtocol:1`。旧 API 未声明时不发送配置读写；旧 IPA 缺少方法时提示升级。Native 仅额外放行既有 `healthkit.getStatus`、`eventkit.getStatus`、`notification.getStatus` 与 `notification.openSettings`；不放开权限申请和原生业务写入。

不增加 migration、系统权限、framework、Info.plist、entitlement 或改变 CI/签名/安装链。本轮不部署生产、不默认 commit/push；使用新页面需重建开发版 IPA，在线规则保存另需发布 session/proxy 补丁。生产当前 API-only 补丁未并入 main 的约束继续有效，发布时不能用旧 main 覆盖既有接口。

回退只替换 IPA/API，不卸载、不清除任何 SQLite/队列。新增通道没有业务队列或离线回放，回退后不会有旧配置操作自动上传。

## 验证入口

- `scripts/settings-local-browser.mjs`：共享目录/详情、生活日与日历在线保存、图标、账户/旧API/离线阻断、旧队列导出、包内 CSP/Native 只读状态及移动/桌面布局，全部为合成账户与拦截响应。
- `src/lib/settings-configuration-request.test.ts`、`scripts/ai-configuration-account.test.mjs`：精确白名单与服务端账户保护，兼容既有 AI/Web 设置。
- `ios/EvaOrbitHost/Tests/TrackerLocalTests.swift`：Native 白名单与权限隔离；macOS XCTest、真实 API/真机仍须在后续构建验收。

本轮实际结果：完整测试 648 项，636 通过、12 项可选 SQL 环境跳过、0 失败；lint、typecheck、Web 与本地生产构建通过。Settings 专项浏览器、原 Tracker 包内 CRUD/持久化/外观回归，以及 Web/本地 Tasks/Projects/Lucius/AI 回归通过；移动和桌面无横向溢出，包内 CSP 下没有直接 API 请求。Impeccable detector 无发现。测试仅合成数据，测试服务器已关闭；未运行 macOS XCTest、真实配置 API 或新 IPA 真机验收。
