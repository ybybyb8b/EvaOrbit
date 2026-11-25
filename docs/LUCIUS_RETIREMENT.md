# Lucius 退役与恢复

移除范围为 Lucius 独立模块：Web 页面、API、MCP、导航、状态／动态／评论／日记服务、专属通知触发及本地 Workspace。Memo、Memory Graph、Relations、Parlor 中提到 Lucius 的内容不属于清理范围。保留历史迁移及可能被其他模块引用的通用图片；SQLite 历史表不再提供业务访问，也不在本次 Supabase 清理中删除本机原始记录。

## 私有备份

本机备份目录为 `backups/lucius-2026-11-25/`，由 Git 忽略，不能上传到 GitHub 或公开部署。它包含私人正文和账户归属，建议另外复制到个人备份盘。

- `code-before.zip`：移除前的完整工作区代码，包含当时未提交的 Home／Chronicle 改动，不包含密钥、依赖或构建产物。
- `code-manifest.json`、`working-tree-before.patch`：源文件校验值、Git 基线与未提交补丁。
- `lucius.sql`：PostgreSQL 17.6 `pg_dump` 导出的五张专属表，包含结构、原始内容、序列、约束、索引、触发器、RLS 和 grants。
- `lucius.json`、`raw-rows.json`：便于阅读的完整数据、原始 JSON 行及选中的共享配置／导入账本／访问历史。
- `dependencies.sql`：隔离恢复所需的既有共享鉴权函数定义，仅作依赖参考，不应覆盖生产的共享函数。
- `manifest.json`、`verification.json`：备份文件 SHA-256、数量、隔离 PostgreSQL 恢复与代码校验结果。

首次导出有状态 2 条、日记 33 篇、动态 22 条、评论 39 条；旧罪案库为空。导出保留所有账户归属，包含测试账户。没有发现文件名含 Lucius 的 Storage 对象；当前专属界面使用仓库内图片。文件备份不能只依赖数据库备份。

## 执行顺序

1. 保存代码及原始数据库备份，使用 `node backups/lucius-2026-11-25/verify.mjs` 在隔离的 PGlite PostgreSQL 中恢复 SQL、逐字段比对、检查 RLS／策略／外键并解压校验代码。
2. 完成回归和构建，发布兼容的新 Web/API。旧连接中遗留的 Lucius 权限在读取时被忽略，其他权限继续有效；新设置仍严格拒绝未知权限。
3. 确认生产部署对应本次提交且状态为 READY，才执行 `202611250001_retire_lucius.sql`。迁移需要会话设置 `evaorbit.lucius_backup_sha256` 为已验证 SQL 文件的 SHA-256；普通 `db:migrate` 未设置此门时会主动停止。
4. 在同一事务中锁住专属表，核对当前原始行仍与已验证备份一致。若有新增／更新，重新备份和验证，不能忽略差异。删除先评论再动态，随后日记、状态及空罪案库；不用 CASCADE。共享表只删除 Lucius 的导入账本／访问历史／通知记录，移除首页排序项和专属权限，保留其余配置。
5. 核验专属表和对应共享条目已经清除；将实际应用时间、备份摘要和生产提交记入私有备份目录。事务失败整体回滚。历史迁移不改写。

## 恢复

先从 `code-before.zip` 解压到独立目录，核对 manifest 和 Git 基线，选择性恢复模块及必要的共享绑定。不要整包覆盖目前的工作区，也不要直接反向应用整份补丁。

数据恢复应使用同一 Supabase 项目、原 Auth 用户仍存在的环境。先在隔离数据库验证，再在事务内执行 `lucius.sql`。该 SQL 不包含 Auth 用户及共享函数，原项目仍应具备 `set_updated_at`、`evaorbit_is_external_oauth` 等依赖；新建 Supabase 环境需要先按原代码应用相应历史迁移。禁止用普通 v19 全量 JSON 恢复代替本模块 SQL 恢复。

需要恢复导入账本、首页入口或 Agent 权限时，从 `lucius.json.shared` 按主键有选择地合并；发现 ID 冲突应停止，不覆盖其他模块的新记录或当前权限。恢复时保留 SQL 中的 ID、序列和账户归属。恢复完成后部署相应代码，并核对评论关联、RLS 和 MCP 权限。

## Host 与验证边界

新版本地 React 和 Swift 只接受 Tasks／Projects Workspace；清理的是可重新下载的 Lucius Workspace／在线访问缓存，不触碰 Tracker 副本和 outbox。Bridge v1、权限、framework、entitlement、签名及 Windows/WSL 安装链保持原样。

生产 Web 发布后，在线 Host 可获取新页面。本地 Host 的界面在 IPA 内，需要按原流程构建并覆盖安装新版；旧 IPA 仍可能显示包内入口与旧缓存，服务端已移除的接口不会因此恢复。Windows 的 Web／SQL 检查不代表 Swift 编译或 iPhone 16 Pro 真机验收通过；原生检查由本次 macOS CI 与后续真机验收承担。
