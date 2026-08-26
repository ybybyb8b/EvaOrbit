# EvaOrbit

EvaOrbit 是一个私人、单用户的 Web / PWA 生活与思考空间，包含首页、想想、待办、Inbox、Memory、饮食与 Persona 设置。

## 架构

```text
Web UI / future authenticated MCP adapter
                    ↓
          Application Services
                    ↓
             Repository API
               ↙         ↘
Supabase Postgres       SQLite fallback
   (production)       (local/migration only)
```

React 组件不直接访问数据库。生产请求在服务端使用当前 Supabase Auth Session 调用 Data API，Postgres RLS 再按 `user_id` 做最终授权。SQLite 实现保留用于本地开发与首次数据迁移；Vercel 上不会把本地文件当作持久数据源。

## 当前能力

- Home：私人数据概览、Quick Action config、Today Food、近期任务、Memory 和会话
- Tasks：默认只填标题与快捷日期，具体日期、优先级、标签和备注按需展开
- Inbox / Memory：未整理内容与长期记忆分开保存；Inbox 可转为 Task 或 Memory
- Food / Drinks：饮食与饮品独立记录，支持日期、餐次、名称查询、编辑和删除
- Food Library：按名称和品牌保存包装标签、官方或手动营养参考
- Drink Limits：每日/每周数量线；只返回范围内、接近、到达或超过等事实状态
- Daily Nutrition：合并 Food + Drink 的 kcal 估算和 min/max；有消耗设置时再计算能量差
- 想想：流式 AI 回复、会话持久化和 Function Calling；Eva 回复使用安全的 GFM Markdown 渲染，User 右对齐、Eva 使用开放阅读区，Tool 原始 JSON 默认隐藏
- Conversation Appearance：双方显示名称、默认/Emoji/图片头像及名称/头像可见性；只改变 UI，不改变 `user` / `assistant` role、Persona 或历史消息
- Persona：从 `SELF_PERSONA.md`、行为偏好、时间、动态召回数据和当前上下文组装 System Prompt
- Supabase Auth：无公开注册入口的邮箱密码登录，支持授权邮箱限制
- Supabase Postgres：全部私人业务数据、会话和 AI / Persona 设置
- RLS：所有私人表只允许 authenticated user 操作自己的行
- PWA：保留安装体验；私人 HTML 和 API 响应不会进入 Service Worker 缓存

## 本地运行

要求 Node.js 24 或更高版本。

```bash
npm install
copy .env.example .env.local
npm run dev
```

本地 SQLite 后备配置：

```dotenv
EVAORBIT_DATA_BACKEND=sqlite
EVAORBIT_SQLITE_PATH=./data/eva-orbit.db
```

若旧 `data/personal-hub.db` 存在且未指定新路径，代码会继续使用它，避免无意创建空库。`PERSONAL_HUB_DB_PATH` 仅作为旧环境变量兼容入口保留。

SQLite schema v7 会先把旧 `api_key` 明文加密并删除明文列；schema v8 再把原单一连接无损迁成一条 `ai_providers` 与一条默认 `ai_model_configs`，并为 Conversation / Message 补上对应引用。若旧库已经保存过 API Key，请先在 `.env.local` 配置稳定的 `EVAORBIT_ENCRYPTION_KEY` 再启动。

## 生产配置

生产环境设置 `EVAORBIT_DATA_BACKEND=supabase`，并配置 Supabase、授权邮箱和服务器端 `EVAORBIT_ENCRYPTION_KEY`。Settings 可管理多个 Provider，并在每个 Provider 下管理多个 Model；API Key 仅保存在 Provider 层，只会在 EvaOrbit server 使用 AES-256-GCM 加密/解密，PostgreSQL 仅保存 ciphertext、IV 与 auth tag，客户端只收到掩码。所有 Secret 都不得使用 `NEXT_PUBLIC_*` 变量。

完整步骤见 [DEPLOYMENT.md](./DEPLOYMENT.md)。项目不会自动创建 Supabase / Vercel 项目，也不会自动上传现有 SQLite 数据。

## 数据库命令

```bash
# 对 DATABASE_URL 执行版本化 PostgreSQL migrations
npm run db:migrate

# 只检查 SQLite 数据与关系，不写 PostgreSQL
npm run db:import-sqlite -- --dry-run

# 明确确认后正式导入
npm run db:import-sqlite -- --apply
```

SQLite schema 为 v7；PostgreSQL schema 由 `supabase/migrations/` 管理。导入脚本会迁移原有数据以及 Inbox / Food / Drinks / Conversation UI Preferences，保留合理的 ID、时间戳、会话关系与 UTF-8 文本，并在事务提交前核对各表计数。AI Key 不随 SQLite 数据导入，部署后从网页 Settings 重新保存。

本地图片头像保存在 `EVAORBIT_AVATAR_DIR`（默认 `data/avatars`），不会转成 base64 写入数据库。Supabase 使用私有 `avatars` bucket；浏览器通过登录保护的 `/api/avatars/user` 与 `/api/avatars/assistant` 读取，数据库只保存头像类型和扩展名。

## 验证

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Food 数据与 AI Tool 流程见 [FOOD_SYSTEM.md](./FOOD_SYSTEM.md)，当前实现状态见 [PROJECT_STATUS.md](./PROJECT_STATUS.md)。未来 MCP 边界与安全约束记录在 `src/lib/mcp/README.md`；Web Push 预留边界记录在 `src/lib/push/README.md`。当前没有公开 MCP endpoint，也没有启用通知订阅或 Scheduler。
