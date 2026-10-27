# 本地版错误诊断

共用入口负责保留错误来源和原因，不改变业务读写、重试策略、账户隔离或缓存／队列内容。Native `NativeDiagnostics.swift` 分类原生异常，`TrackerLocalController` 补充连接、响应解析、协议验证、本地缓存和安全备份阶段；`NativeBridge` 保留 `session_expired` 等代码并在显示文案中附 `[EO:code]`。JS `request-diagnostics.ts` 为桥接投递、浏览器网络和解码补充上下文，`response-error.ts` 保留业务提示、HTTP 状态及服务端业务 code。

示例：`trackers.syncReplica: GET /api/native/session · connection: The server request timed out. (URL error -1001) [EO:network_timeout]`。这表示 Tracker 同步前的账户检查连接超时，不代表 Tracker 写入失败、数据库损坏或同步成功。

| 范围 | 诊断码举例 | 区别 |
| --- | --- | --- |
| 网络 | `network_timeout`、`network_offline`、`network_connection_lost`、`network_dns_failed`、`network_unreachable`、`network_tls_failed` | 超时、离线、断线、域名、连接及证书问题分开；浏览器 fetch 无法提供底层原因时使用 `request_failed`，不假称已确认断网 |
| HTTP | `http_401`、`http_403`、`http_404`、`http_409`、`http_429`、`http_5xx`（实际数字） | 保留 HTTP 状态；服务端提供业务 code 时优先保留它；重定向拒绝和响应超限单列 |
| 格式与版本 | `json_decode_failed`、`response_decode_failed`、`invalid_data`、`bridge_invalid_response` | JSON 解析、协议结构及 Bridge 回包区分，并保留对应步骤 |
| 本地数据 | `local_storage_failed`、`storage_full`、`storage_access_denied`、`local_file_missing`、`local_file_failed`、`local_io_failed` | SQLite、空间、访问、文件及缓存解码分开；不清空数据恢复 |
| 账户与开关 | `session_expired`、`account_mismatch`、`account_changed`、`read_only` | 保留重新登录和禁止跨账户写入语义 |
| 系统功能 | `eventkit_*`、`healthkit_*`、`notification_*`、`secure_storage_failed` | 权限、来源不可用、输入不合法、健康 anchor、系统存储等分别标识 |
| 其他 | `operation_cancelled`、`native_unavailable`、`native_unexpected` | 取消、Host 不可用及未识别异常保留各自上下文和安全数字代码 |

写请求未收到结果仍提示先联网核对，不能宣称没有写入或自动重发。已确认保存成功但后续离线副本刷新失败时，继续明确显示“Saved online”，并附刷新失败来源。图片资源下载失败也不能回滚已确认的 Tracker 同步。现有后台错误展示边界保留，不新增跨页面弹窗。

不输出请求正文、密码、Cookie、token、设备标识、系统原始 userInfo、HTML 错误页、查询参数或本地文件路径。保留原有面向用户的业务校验消息，不以通用码替换冲突等业务语义。普通浏览器及旧 Host 不要求新 Bridge 能力；新 Native 分类需重建 IPA。

验证使用模拟异常和本地测试，不读取或改动真实账户数据。Swift XCTest 在 Windows 无法执行；错误显示检查和 Node 测试不代表新 IPA 编译或真机已验收。
