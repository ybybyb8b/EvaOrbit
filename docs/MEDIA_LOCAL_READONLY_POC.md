# Media 共享界面与只读离线阶段

## 责任边界

Web 和本地包共同使用 `MediaView`（收藏/母作品）、`MediaDetailContent`、`MediaFields`、原版封面、主题与 FormSheet。`MediaDataProvider` 只替换数据读取和导航；Web 默认使用现有 API/Next Link。开发版从 Sidebar 进入，使用现有全局返回和底栏 Log，不维护第二套页面或表单样式。

Reacher 类记录允许原名、译名、季标题留空，仅保存母作品 ID 和季数。母作品改名保留 ID，不删除重建、不覆盖各季独立名称、封面或观看历史。单季详情直接提供编辑入口。默认书架覆盖 Documentary/Other；分类和附加条件分开，季标识保持可见。云端与本地共用 `selectMediaItems`，服务器分页读取后筛选/排序，页面每批200条，可继续加载。

## Web 写入修复

- Series：新增 `GET/PATCH /api/media/series/:id`，MCP `media_series` 支持改名；重复名称拒绝，未传字段保留。
- 首次完成：从其他状态改为 Completed 且没有观看记录时，要求 date-only 完成日期；修改历史已完成资料不自动补写日期。已有观看历史不重复创建；重看继续走原观看入口。
- SQLite 使用事务保存资料/首次完成。Supabase 使用新增 `complete_media_item` invoker RPC，沿用 RLS、行锁和现有观看编号触发器；保存失败整体回滚，同一完成请求重试不生成重看。MCP `media.update` 可传 `watched_date` 供首次完成使用，修改既有观看日期仍走 `update_viewing`。
- 迁移 `202610200001_media_completion.sql` 只交付源码。必须另行批准并应用生产迁移后才发布依赖该 RPC 的 Web 写入改动；不得先发布然后绕过事务保存。

## 本地读取

新增 `GET /api/native/media-readonly`，认证当前账户，经 Repository 白名单读取原始条目、系列、完整观看历史与认证封面字节。无业务更新、图片上传或旧队列上传，不回退到远程页面。

`eo-media-readonly-v1` 最多1000条作品和有界系列；现有 Supabase 读取达到1000条观看/系列边界时拒绝替换，避免把截断历史标为完整。每账户8 MiB，封面必须是真实 JPG/PNG/WebP，随快照缓存，图片读取失败保留整份旧缓存。关系、日期、历史编号、ID、账户及大小均校验。超限需要后续专门的分页/媒体资源缓存设计，本阶段不自动裁掉旧历史或封面。

Browser IndexedDB 与 Native SQLite 保存账户隔离快照；读取缓存后后台刷新，失败继续展示已下载数据。Bridge v1 增加 `media.readOnlySnapshot`，只允许精确 GET `/api/native/media-readonly`，沿用备份验收、前后账户/generation检查。旧 Host 明确要求升级，不回退写入。SQLite 只新增 `media_readonly_cache`，保留 Tracker state/outbox。

所有原有表单可打开并填写临时草稿；保存、删除、改名及封面上传在处理函数/适配器/请求边界拒绝。说明文字折叠在 Development info。无新权限、framework、entitlement，原签名/CI安装链不变。

## 验证与发布

- `scripts/media-readonly.test.mjs`：隔离 SQLite，局部 PATCH、母作品改名/冲突、编号单季、首次完成回滚/重试、200条之外搜索、只读服务/图片、坏快照与写入拒绝。
- `scripts/media-completion-postgres.test.mjs`：隔离 PGlite 应用真实 Media schema 与新迁移两次，验证事务回滚、重试、RLS双账户和匿名权限；不连接生产。
- `scripts/media-browser.mjs`：隔离 Web 写入和共享 UI、320/402/1280布局、只读表单强制提交、离线浏览器重启、图片、坏快照/账户变化保留旧缓存与队列、打包 CSP/模拟 Bridge。
- Native XCTest 覆盖缓存重启、损坏/超限保留、账户和网络路径白名单；Windows 无法运行 macOS/XCTest或真实 WKWebView，必须由后续 CI/iPhone完成。

发布顺序：另行批准并应用 completion 迁移 → 发布 Web/API → 原链构建独立 PoC IPA → 覆盖安装并验收。仅发布只读 API 的独立补丁不依赖 completion RPC，但不可夹带新写入页面。未授权时不部署、不推送。

回退：恢复上一 Web/API 部署或上一 PoC 包；保留已安装应用、SQLite/outbox及缓存，不卸载/清库。新 RPC 可保留为向后兼容能力，不需要删除生产历史数据或逆向迁移。只读通过不代表 Media 离线写入/双向同步已实现。
