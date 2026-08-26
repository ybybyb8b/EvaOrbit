# EvaOrbit 首次云部署

本文只描述部署准备和人工操作。仓库中的脚本不会创建线上项目、不会自动部署 Vercel，也不会在没有 `--apply` 的情况下写入 PostgreSQL。

## 1. 创建 Supabase Project

在 Supabase Dashboard 新建项目，选择合适区域并保存数据库密码。EvaOrbit 生产数据源是该项目的 PostgreSQL；SQLite 不再是 production source of truth。

在 Connect 面板取得：

- Project URL → `SUPABASE_URL`
- Publishable key → `SUPABASE_PUBLISHABLE_KEY`
- Postgres connection string → 本地执行迁移时使用的 `DATABASE_URL`

迁移是单次管理连接，优先使用 Dashboard 提供的 direct 或 session pooler 连接；不要把连接串提交到 Git。Supabase 的连接模式说明见其[官方 Postgres 连接文档](https://supabase.com/docs/guides/database/connecting-to-postgres)。

## 2. 配置 Auth

在 Authentication 中：

1. 保留 Email + Password 登录。
2. 关闭公开注册 / Sign ups。
3. 在 Users 中手工创建唯一的 EvaOrbit 私人账户。
4. 记下该用户 UUID，SQLite 导入时作为 `MIGRATION_USER_ID`。
5. 将同一邮箱配置为 `EVAORBIT_ALLOWED_EMAIL`。

应用没有注册页。Proxy 会刷新 SSR Cookie 并阻止未登录页面/API访问；数据 Repository 还会再次验证 Supabase claims 和授权邮箱。Proxy 不是最终权限边界，所有数据库查询仍受 RLS 约束。当前 Next.js 16 使用 `src/proxy.ts`，符合 [Next.js Proxy 约定](https://nextjs.org/docs/app/getting-started/proxy)和 [Supabase SSR Cookie 指南](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs&queryGroups=framework)。

## 3. 配置本地环境变量

复制 `.env.example` 为 `.env.local`，填写真实值；不要修改 `.env.example` 放入真实 Secret。

```dotenv
EVAORBIT_DATA_BACKEND=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-key>
EVAORBIT_ALLOWED_EMAIL=<private-account-email>
EVAORBIT_TIME_ZONE=Asia/Shanghai
DATABASE_URL=postgresql://...
# 用于加密 Settings 中提交的 Provider API Key，必须稳定且只存在服务端
EVAORBIT_ENCRYPTION_KEY=<32-byte-base64-or-64-char-hex>
```

`SUPABASE_PUBLISHABLE_KEY` 本身可公开，但本项目仍只从服务器读取。`DATABASE_URL` 和 `EVAORBIT_ENCRYPTION_KEY` 都是 server-only；绝不能添加 `NEXT_PUBLIC_` 前缀。可用 `openssl rand -base64 32` 生成加密密钥。密钥一旦用于保存 Provider API Key 就必须保持稳定，更换后旧密文将无法解密。

## 4. 执行 migrations

在已填写 `DATABASE_URL` 的本机运行：

```bash
npm run db:migrate
```

迁移脚本按文件名顺序执行：

- `202608250001_evaorbit_initial.sql`：原有私人数据、会话与 AI 设置。
- `202608250002_core_life_food.sql`：Inbox、Food、Drinks、Daily Summary 和 Push 预留。
- `202608250003_conversation_identity.sql`：Conversation UI Preferences 与私有头像 Storage bucket/policies。
- `202608250004_encrypted_ai_api_key.sql`：AI Provider API Key 的 AES-256-GCM 密文字段与完整性约束。

完整 private tables：

- `tasks`
- `memories`
- `ai_settings`
- `chat_sessions`
- `chat_messages`
- `inbox_items`
- `food_logs`
- `food_library`
- `drink_logs`
- `drink_limits`
- `daily_nutrition_summaries`
- `push_subscriptions`

每张表都有 `user_id uuid references auth.users(id) on delete cascade`。消息使用 `(session_id, user_id)` 复合外键，不能挂到其他用户的会话。`ai_settings` 只保存 Provider、模型与 Persona 等非敏感配置，不含 API Key 字段。

## 5. 检查 RLS 和权限

迁移会为全部 exposed private tables 开启 RLS、撤销 `anon` 全部权限，并为 authenticated 的 select / insert / update / delete 分别创建 owner policy：

```sql
(select auth.uid()) is not null
and (select auth.uid()) = user_id
```

没有 `USING (true)`、`WITH CHECK (true)`、public read 或 public write policy。可在 SQL Editor 检查：

```sql
select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('tasks','memories','ai_settings','chat_sessions','chat_messages','inbox_items','food_logs','food_library','drink_logs','drink_limits','daily_nutrition_summaries','push_subscriptions');

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('tasks','memories','ai_settings','chat_sessions','chat_messages')
order by table_name, grantee, privilege_type;
```

Supabase 官方建议将 grants 与 RLS 一起配置，并明确撤销 `anon` 权限；参考其 [RLS 指南](https://supabase.com/docs/guides/database/postgres/row-level-security)。

## 6. SQLite → PostgreSQL

先关闭本地 dev server，确保 SQLite WAL 已落盘。不要删除原数据库。

只读预检不需要 Supabase 用户 UUID。正式导入前再设置：

```dotenv
SQLITE_SOURCE_PATH=./data/personal-hub.db
MIGRATION_USER_ID=<Supabase Auth user UUID>
DATABASE_URL=postgresql://...
```

只读预检（只需确保 `SQLITE_SOURCE_PATH` 指向正确数据库）：

```bash
npm run db:import-sqlite -- --dry-run
```

确认输出计数后才正式导入：

```bash
npm run db:import-sqlite -- --apply
```

脚本处理 Tasks、Memory、Conversations、Messages、Inbox、Food、Food Library、Drinks、Limits、Daily Energy 设置、Conversation UI Preferences 和 AI / Persona 的非敏感设置；旧 SQLite 还没有新表时会按空数据处理。脚本保留 ID 与时间戳，验证 tags JSON、孤立消息和最终计数，并在同一 PostgreSQL transaction 中提交。SQLite `CURRENT_TIMESTAMP` 被按 UTC 转换。AI Key 不随 SQLite 数据导入；部署后在网页 Settings 中重新保存，服务端会用 `EVAORBIT_ENCRYPTION_KEY` 加密后写入 PostgreSQL。

SQLite 导入只迁移名称、Emoji 与显示开关；本地图片文件不会假装成为云端对象，图片类型会安全回退为默认头像。云端登录后在 Settings 重新上传一次即可进入私有 `avatars` bucket。

首次导入建议以空表为目标。脚本可重跑同一用户的相同 ID；若 ID 已属于另一用户，最终计数校验失败并回滚。

## 7. 配置 Vercel Environment Variables

在 Project Settings → Environment Variables 为 Production（需要时也为 Preview）添加：

- `EVAORBIT_DATA_BACKEND=supabase`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `EVAORBIT_ALLOWED_EMAIL`
- `EVAORBIT_TIME_ZONE=Asia/Shanghai`
- `EVAORBIT_ENCRYPTION_KEY`（必填；32 字节 Base64 或 64 位十六进制，供 Settings 加密 Provider API Key）

当前运行时通过带用户 Session 的 Supabase Data API 工作，因此 `DATABASE_URL` 只用于本机 migration / import，不需要放进 Vercel。这样生产函数不持有数据库管理员密码。Provider 名称、Base URL、Model 与加密后的 API Key 均由网页 Settings 管理；生产环境不会读取 `AI_API_KEY`。所有变量都不要使用 `NEXT_PUBLIC_`。Vercel 环境变量可按 Production / Preview / Development 分开配置，见[官方文档](https://vercel.com/docs/environment-variables)。

## 8. 部署 Vercel

将代码推送到你选择的 Git 仓库后，在 Vercel 导入该仓库，Framework Preset 选择 Next.js，Build Command 保持 `npm run build`。项目没有 Windows-only runtime path、永久本地进程或生产磁盘持久化依赖。

本轮不要在自动化脚本中执行 `vercel deploy`；由你在 Dashboard 确认环境变量后发起首次部署。

## 9. 生产验证

使用无痕窗口检查：

1. `/`、`/tasks`、`/inbox`、`/memory`、`/food`、`/food/library`、`/drinks`、`/ai`、`/settings` 在未登录时跳转 `/login`。
2. 未登录 `/api/tasks` 返回 401，而不是私人数据或 HTML。
3. 错误账户不能进入；授权账户可以登录和退出。
4. Home 返回正常，Tasks、Memory、Inbox、Food、Drinks CRUD 可用；Food Library 可按品牌区分；Drink Limit 状态正确。
5. 创建会话、发送 AI 消息、刷新页面后消息仍存在。
6. Persona 设置保存并重新加载；API Key 永远不出现在响应中。
7. PWA manifest/icon 可访问并可添加到主屏幕。
8. 登出后，断网也不能从 Service Worker 缓存重开私人页面。
9. Dashboard 中确认新行 `user_id` 等于当前 Auth 用户 UUID。
10. 在 Conversation Appearance 修改双方名称与 Emoji，刷新后仍保留；上传 JPG/PNG/WebP 后 `/api/avatars/user` 或 `/api/avatars/assistant` 仅登录状态可读取，SVG/HTML 和超过 4 MB 的文件被拒绝。

若使用第二个临时测试账户验证 RLS，测试结束后删除它；它应只能看到自己的空数据，不能看到私人账户的任何行。

## 10. 回滚

应用回滚：在 Vercel Deployments 中将上一稳定 deployment Promote / Redeploy。数据库 schema 不随 Vercel 回滚自动恢复。

数据库回滚优先使用 forward migration；若发生破坏性数据问题，停止写入后按 Supabase backup / PITR 能力恢复。正式导入前先生成逻辑备份或确认 Dashboard backup 可用。不要通过删除 PostgreSQL 表来“切回 SQLite”；生产 source of truth 一旦切换就是 PostgreSQL。

## 11. 备份

- 定期检查 Supabase 项目 backup 状态与保留期。
- 重要变更前创建额外逻辑备份。
- 定期做可恢复性演练，而不只确认“备份任务成功”。
- Supabase Storage 若未来存照片或文件，需要独立的对象文件备份方案；数据库备份不等于 Storage 文件备份。

Supabase 的托管备份和自行生成逻辑备份方式见[官方备份文档](https://supabase.com/docs/guides/platform/backups)。

## 12. Future MCP

当前没有 `/mcp` route，因此不存在未鉴权的公开 MCP endpoint。未来 Remote MCP 必须走 HTTPS、authentication、authorization 和 server-side database access，并复用 `src/lib/services/evaorbit.ts`。写工具需要 tool-level write protection，数据库密码、service key 和 AI Key 都不能进入客户端或工具输出。
