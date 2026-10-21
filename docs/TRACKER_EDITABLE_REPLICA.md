# Tracker 独立编辑副本

本轮只开放 Tracker。其他业务模块仍为只读快照/表单预览，AI 配置沿用独立在线例外。

## 开放范围

- 新建 Tracker，新增数值/文本属性；记录新增、修改、删除；基础名称、分组和快速记录开关。
- 复用既有 React 表单、时间线和设置外观。现有选择、评分、时间段等属性在取得云端版本后可填写记录；不开放属性管理、图片上传、目标/提醒、归档及永久删除 Tracker。
- 先写本地、记录和 outbox 原子持久化，不等网络。恢复网络/前台/60秒前台补偿使用现有 SyncEngine。

## 数据安全边界

新 SQLite 表 `tracker_replica_state`、浏览器键 `replica-v1:<account>` 保存本轮记录和队列。`tracker_state`、原 IndexedDB 账户键、旧冻结操作及只读缓存不迁移、不清除、不上传。

没有新副本时可读取原只读快照，但不伪造 sync_version。其云端记录在完成协议2全量版本握手前禁用修改、删除及追加记录；新建本地 Tracker 仍可离线记录。失败时继续读取旧快照并保留新草稿。版本副本建立后，只读下载不能覆盖它的业务记录。

每次传输先发送空 mutations，完整验证协议2、账户、完整快照、版本和回执，再发送本轮冻结命令。旧接口/协议1或缺少 migration 不能收到业务 mutations。Native 仅接受新副本中已冻结且内容完全匹配的命令；业务账号与当前登录账号由客户端、Native、服务端多层校验。Swift 固定请求 Cookie 并校验 generation，旧桥接写入方法仍关闭。

服务端协议2已有的事务/RLS、幂等回执、记录版本、父结构版本、全量删除对账及冲突保留逻辑继续复用。网络丢失响应后重试同一冻结命令；不改 mutationId 或已发 payload。冲突保留双方内容，需要明确选择，不静默覆盖。

## 暂停与回退

同步状态通过 Tracker 标题旁的小云图标呈现，不占用页面顶部说明区；待同步、离线和异常以图标标记区分。点击图标或进入 Settings 可查看共享同步面板：队列数量、待处理记录、当前会话上次成功同步时间、手动重试、暂停和冲突处理。旧队列与备份检查折叠在“存储与安全”。后台网络失败只保留在该面板，不弹顶部同步错误；本机读写失败仍明确反馈。保存成功继续使用“已保存到本机”胶囊，不将本机保存误报为云端已同步。

设置可暂停 Tracker 编辑；页面重新加载后仍显示独立副本中的新记录，禁止编辑和上传。恢复编辑不需要再次打包。导出为 `eo-trackers-export-v2`，同时包含 legacy 与 replica；不是自动恢复或上传指令。

旧 Host 未声明三个新 Bridge 方法时保持只读，不回退到旧提交/同步方法。回退旧 IPA/API 不删除新表和新队列；旧 IPA 可能看不到新副本，需恢复新版或导出后处理，不得卸载清库。签名、CI、HealthKit、EventKit、通知及正式版 EO 均保留。

## 发布与验收

生产协议2 API 和 `202610180001_tracker_local_sync.sql` 已在用户单独授权后发布/应用，详情见下方发布记录。服务端就绪后，包含独立编辑副本的同一 IPA 可开始版本握手和同步，不需为启用同步重复打包。

Windows 自动验证使用合成数据和假 HTTP 云端，不等于真实 Supabase 或 iPhone 验收。必须补齐 macOS XCTest、独立IPA构建、隔离真实 Supabase API/MCP/RLS回归，再用专用测试 Tracker 验证设备 CRUD/重启/断网/冲突，之后才扩大真实数据使用。

本地全套647项中635通过、12项可选SQL测试因未配置其运行环境跳过。新增浏览器回归覆盖旧协议仅收到空批次、离线新建/编辑/删除与重启、丢失响应的同命令重试、远端更新/并发冲突/删除、暂停后保留草稿、切换账户拒绝提交、旧队列完全不变；原打包预览模式的表单、快速记录、设置、洞察及持久化回归通过。新增Native XCTest源代码验证独立SQLite表、CAS、冻结wire与账户保护，尚未在macOS运行。

只读附件元数据与其他模块仍来自各自快照：未同步的本机 Tracker 记录暂不合并到 Home；图片、目标和提醒的编辑没有开放。暂停编辑后可按原只读刷新路径更新附件元数据，恢复编辑保留版本副本和队列。

## 生产服务端发布记录（2026-10-20）

- 开发分支提交 `8e475a06101cbf2690c61d0c6516881be6d4d433` 已推送；未合并 main。独立 Host 构建及 XCTest 由用户监督 Actions，本记录不声明 CI 或真机通过。
- 正式 API 补丁以当时 main `93eb1f5064e08119f5fd4ad368be3e564e62aa8b` 为基础，仅移入 Native 接口及所需服务，保留该版本 Web UI、字体与修复。Vercel 自动读取了所在开发分支的 Git 元数据，部署内容以补丁清单为准，不代表部署了整个开发分支。
- 正式域名 `https://eva-orbit.vercel.app` 已提升至 `dpl_2UWoJStXatpUb5FdYwNViWT9k2xh`，不可变地址 `https://eva-orbit-bi4a4fiha-echopad.vercel.app`。
- 仅执行 `202610180001_tracker_local_sync.sql`，规范化 SHA-256 为 `f2edfb09e8d4938c235b563a98d16b46eac985c1a1165be825c0c427cff38435`，已登记 migration ledger。未执行 Media completion 或其他迁移。
- 发布前对授权账户导出逻辑备份及原始 Tracker 行并回读校验。迁移在同一事务中锁定 Tracker 表，对比该账户迁移前后行内容（排除新增 sync_version）完全一致。未修改或清除设备旧队列。
- 生产数据库验证：三个业务表版本字段、RPC security invoker / authenticated 权限 / anon 禁用、新同步表 RLS；本账户空操作协议2全量快照与备份数量一致，错账户 RPC 返回 42501。探测事务最终回滚；未新增、编辑或删除生产业务记录。PostgREST 已识别新 RPC，匿名调用按权限拒绝。
- 候选与正式域名检查：登录页正常，未认证 session 返回 false，各只读模块与同步 POST 拒绝未登录请求。临时 Vercel 部署保护 bypass 已撤销。登录后的完整 HTTP 同步与真机写入仍待专用测试 Tracker 验收。
- 本机私有证据在忽略目录 `tmp/tracker-production-backup-manifest.json`、`tmp/private-tracker-production-release/2026-10-20T15-27-01.116Z/`、`tmp/tracker-production-migration-result.json`、`tmp/tracker-production-audit.json`、`tmp/tracker-release-production-smoke.json`；其中备份含私人数据，不得提交 Git。

回退时先在开发版设置暂停 Tracker 编辑/同步并保留导出与队列，再将生产域名回退到保留的旧部署 `dpl_9uCdBY1nWnVuPoB49RJDFzxeNJ7a`（`https://eva-orbit-bznf02lbh-echopad.vercel.app`）。保留新增同步列、表、回执及版本触发器，不执行破坏性反向 migration；旧 API 缺失协议2时新版客户端只会握手失败，不应上传 mutations。旧部署无法覆盖发布后新写入，数据恢复必须另外评估，不能直接导入旧备份。

2026-10-21 更新：上述 API 与 Settings 服务端保护已纳入 main `43dfca3a7ff9fc20a256abdb945121f33f45876b` 并正式发布；此前“API-only 补丁尚未进入 main”的风险已解除。本地 React/Host UI 改造仍在独立开发分支，不能将两端 UI 已共享等同于这些改动已发布线上。当前差异与验证边界见 [Web/本地对照](LOCAL_WEB_PARITY_REVIEW.md)。
