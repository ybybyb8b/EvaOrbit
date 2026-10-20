# Memo 只读离线阶段

- 复用 Web `MemoView`、`MemoDetailContent`；新增/编辑公共 `MemoEditor` 保存相同字段和校验。Web 默认 API/Next Link；本地 `MemoDataProvider` 注入 GET、链接与下载范围。
- 本地从既有纯读取 `GET /api/memos` 下载最近更新的 100 条完整碎片，最多 8 MiB/账户。搜索、标签、类型、状态筛选及表单标签/合并目标候选只查已下载记录；`limit=200` 历史候选请求也不能突破快照。合并目标不在窗口内时保留原 ID 展示，不自动解关联。
- `eventDate` 可为 null 或 date-only；`confirmedAt` 保留明确 instant；原文、标签、类型、状态、合并引用和迁移溯源字段不改写。Memo 正文沿用 Web 纯文本，不擅自改成 Markdown。
- 创建/编辑只保留临时草稿；保存、归档、删除及强制提交全部禁止；不触发 recent_life_context 通知。Memory Graph 不在本轮范围，本地不显示其未接入入口；Web 图谱入口保留。
- 浏览器账户缓存 `memo-readonly:<accountId>`；Native bridge v1 增加 `memo.readOnlySnapshot`，精确放行 `memos` GET 映射 `/api/memos`，不开放远程详情、查询参数、写方法。SQLite 仅新增 `memo_readonly_cache`；原记录/outbox/备份保留。刷新前后验证身份，提交时再查本地会话，Native 检查 generation。
- 验证格式、重复 ID、数据类型/日期、账户及体积；响应异常或账户变化不覆盖原缓存。旧 Host 缺能力时提示升级，不回退不安全路径。
- 本轮不需要生产 migration 或新 Memo API；其他模块尚未部署的只读 API 继续待单独确认，不因本轮顺手发布。新本地资源与 bridge 需要新 IPA；Web 表单调整需另行授权部署。签名链、权限、framework、HealthKit/EventKit/通知保留。
- 回退保持 App 安装、数据库和队列；旧版本忽略新增缓存表。不得以清库解决缓存或协议问题。
- 公共 Header 约定见 [统一导航 Header](SHARED_NAVIGATION_HEADER.md)。本轮同时移除重复账户齿轮、缩小 Chronicle 标题。

## 验证入口与限制

- `scripts/memo-readonly.test.mjs`：快照与读取适配器；在隔离 SQLite 所有业务表安装写入阻断后验证真实 Memo list/detail service。
- `scripts/memo-offline-browser.mjs`：原版页面/表单、搜索、离线浏览器配置重启、强制提交、异常/账户刷新保留缓存和冻结队列、打包 CSP + 模拟 bridge；公共 Header 和 Settings 入口。
- `scripts/page-back-button.test.mjs` / `navigation-freshness.test.mjs` 保持 Web 返回与数据刷新语义；Tracker/Cats/Chronicle 浏览器回归覆盖旧模块。
- Native XCTest 包含 Memo 缓存持久化、账户、损坏/超限拒绝、旧队列和 HTTP 白名单；Windows 未执行，待 macOS CI。真实账户、真机冷启动、顶部安全区和键盘未在本轮验收。

## 本轮实际结果

全量测试 616 通过、12 个 PostgreSQL/PGlite 环境依赖项跳过、0 失败；lint、typecheck、Next/Vite production build 与 diff 检查通过。Memo 浏览器端到端及隔离 Web CRUD/公共返回、Tracker 与 Cats/Chronicle 浏览器回归通过。Memo 的最终打包 CSP/模拟 Native bridge 验证无 API fetch、无业务写入。所有测试使用合成数据；新增 Native XCTest 未在 Windows 执行，也未触发本轮 CI/真机安装。JS 主包约 1.15 MB（gzip 349 kB），仍有大 chunk 警告，真实设备性能待验收。未提交/推送、未部署任何生产 API/migration。
