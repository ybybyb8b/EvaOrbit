# Apple Health Workout 与训练补充详情

## 数据与同步

Workout 复用现有 HealthKit read samples 通道：`HealthReadMetric.workout` → observer / anchored query → `HealthLocalStore` 的 SQLite `read_samples` / `read_outbox` → 原 ingest URL 的 `readChanges` → `ingest_healthkit_read_changes`。不新增桥接方法、框架、entitlement 或 Apple Health 写权限。授权 revision 为 5，用户主动更新 Health Access 后读取 Workout；安装、启动和后台恢复不弹授权。

沿用现有 October 历史边界：仅导入记录时区中开始日期为 2026-10-01 及以后的 Workout，查询使用 UTC+14 的最早边界，再按 metadata/device 时区筛选。不是全量历史导入。开始/结束保留 ISO instant、时区及其来源，时长保留秒的小数精度，能量为 kcal、距离标准化为 m，保留原始 activity type、source、sync identity 和可用设备名称/型号/厂商；不采集设备唯一标识。距离采用 HealthKit 提供的总距离（单位换算为米）。

迁移 `202610270001_healthkit_workouts.sql` 在 `training_logs` 增加 `workout_sample_id`、原始 `workout` JSON、`workout_deleted`、`details_completed_at`、独立 `training_content`。账号与 sample UUID 的唯一索引保证每个 Workout 只生成一条训练记录。现有 `healthkit_read_receipts` 按 installation/stream/revision 拒绝旧重试；按账号与 UUID 加事务锁，原始数据更新只修改来源字段，保留用户详情。Sleep/heart 使用原 ingest 实现，整批事务失败时不提交回执或部分训练。

Apple Health 删除保留 `healthkit_workout_tombstones`；先删除后发现、重装扫描或其他设备旧重试不能复活同一 UUID。已有训练软删除，保留原始数据、记录 ID 和补充详情，普通历史/Timeline 列表不再展示；已打开详情的迟到保存返回冲突。不同 UUID 视为不同 Workout，不根据时间、标题猜测合并，也不自动绑定先前手动记录。

数据库触发器同时保护直接 authenticated CRUD：导入训练的来源、时间、类型和时长不可改，不能从 EO 删除；用户详情更新由服务器标记补充时间。同步通过 service_role 原子更新，不进入循环计划完成接口，不生成每日能量。单次 Workout kcal 仅供展示，每日统计仍由原 Daily Energy 管道负责。

## UI 与本地缓存

本地浏览器预览可运行 `npm run dev:workout`，使用 `tmp/workout-preview/preview.db` 和独立 `.next-workout-preview`，自动生成一条明确标识为模拟来源的待补充 Workout；重复启动保留填写结果。命令覆盖在线数据库配置，不读取或迁移 Supabase。已有 localhost 若连接真实 Supabase 而未应用迁移，会因缺少 `workout_deleted` 等列报错；本地 URL 不代表使用本地数据库。真实 HealthKit 读取仍需新 IPA/授权，不能通过普通浏览器模拟为真实同步成功。

Universal Log → Training 提供“记录新训练”与待补充 Workout 列表。选择 Workout 直接编辑原 ID，显示只读的来源、运动类型、时间、精确时长、能量与距离；可填写多选部位、训练内容、动作清单、老师、课程和备注。内容与备注独立保存，后续可从 Health 列表或 Home Calendar/Timeline 再次打开。手动训练及循环完成继续独立工作。

训练填写以动作清单作为主要“训练内容”，自由文本收进可选的“文字补充”，旧文本自动展开。动作首次填写名称、组数、每组次数/时长，可选单侧（每侧）或双侧；再次点选可取消侧别。侧别使用既有 target 文本的 `单侧 · …` / `双侧 · …` 保存，不新增数据库字段或迁移，旧任意次数/时长原文保持不变。历史候选带入该动作最近的组次/侧别，一键“沿用上次动作”复制最近有动作清单的训练；不覆盖当前已填动作、不重复添加、不复制完成进度。逐组完成记录折叠为可选进度，并提供“全部完成”。新增 suggestions 字段兼容旧快照，仍按账号、最近100条训练及30个候选的边界读取，不新增动作库或健康 MCP 输出。

快捷填写定向验证：19 项训练／SQLite／快照回归通过，修改源码 ESLint、类型检查、Next/Vite 构建通过。浏览器实际完成首次填写单侧组次、保存与回显、修改组数、下一次一键带入最新参数、检查新 ID 和零完成进度；402×874 中文深色与桌面布局通过，临时测试服务已关闭。此调整未改变 Swift 或生产 schema；未执行真机键盘验收或重复全量测试。

待补充查询复用 `GET /api/health/training?pendingDetails=true`，按发生时间降序，沿用最多 100 条边界；完成后移出候选，后续候选自然补入。日期/时间/时长不在补充 PATCH 中发送，避免客户端重建时间损失精度。独立手动表单仍保留原字段。

Health 账户隔离快照新增可选 `pendingTraining`（最多 100 条，整体仍为 8 MiB），旧快照回退到已下载的近 7 天记录。Native SQLite 保存完整 JSON，Web SQLite 后备 migration 89 保留对应字段和 UUID 唯一性；不另建业务 outbox。离线沿用现有只读和已访问详情缓存；在线保存继续走既有账户绑定 business request。Home 的 `?training=id` 本地导航支持已下载或在线读取详情；离线未下载时明确提示。

旧 IPA 的配置仅接收其 status.metrics 中支持的类型，原同步继续可用。新 Workout 读取需要新 IPA 和用户主动更新 Health Access；桥接主版本仍为 v1。`NSHealthShareUsageDescription` 增补 workouts，写用途、签名链和 entitlement 不变。未扩展 MCP 原始 Workout 输出。

## 交付与验收

本轮不执行生产迁移、部署、Apple Health 数据写入、CI 打包或安装。先按现有流程批准并应用迁移（含前置 training session details 迁移），再发布兼容 Web/API，再构建、签名和覆盖安装 IPA；保留原数据库和队列。回退客户端/API 不撤销迁移或删除同步墓碑。

本地可复验：

- `node --test scripts/healthkit-workout.test.mjs`：隔离 PGlite，真实迁移重入、精度、同 UUID 多设备幂等、详情回显/再次编辑、不覆盖事实、拒绝删除/修改来源、批次回滚重试、删除防复活、RLS、service_role 权限、Sleep 兼容、不推进计划/累加每日能量。
- `node --test scripts/training-workout-sqlite.test.mjs`：隔离 SQLite，详情、待补充筛选、手动 CRUD、Calendar/Timeline 链接、删除过滤、快照读取与源字段保护。
- `node scripts/training-workout-browser.mjs`：需配置 `EVAORBIT_PLAYWRIGHT_MODULE`，使用独立构建和合成 SQLite；Universal Log 选择、保存所有详情、从历史再次编辑、单记录、手动新建、402×874 / 1440×1000 溢出检查，结束关闭精确测试进程并验证监听停止。截图保存在该次 `tmp/workout-browser-*`。
- `HealthLocalStoreTests.testWorkoutUsesDurableReadOutboxWithoutEnergyAggregation`：Workout DTO、小数、anchor、持久队列重试、删除、授权重置和历史日期边界。Windows 无 Xcode，尚未运行该 XCTest。

仍需 macOS CI 的 XcodeGen、Simulator build/test、iphoneos ad-hoc build 与 IPA entitlement 断言。iPhone 16 Pro 须验收首次/更新授权、拒绝读取及恢复、Watch 来源、锁屏后台交付、杀进程后队列恢复、断网重试、两台设备刷新与删除同步，以及 WKWebView safe area、键盘、长列表与中文/深色。Windows Chrome 与合成数据测试不代表上述真机行为已通过。

本轮实际验证：Workout PGlite/SQLite、训练计划定向回归 8 项通过；Chrome 手机/桌面端到端通过；TypeScript、修改源码 ESLint、Impeccable 检测与 diff 空白检查通过。Next 生产构建在 Windows 沙箱内两次遇到 prerender 目录 `EPERM`，随后在相同隔离构建目录、合成 SQLite 配置下沙箱外完成；本地 React/Vite 构建通过，保留原有大 chunk 提示。全量 `npm test` 714 项：700 通过、13 个可选数据库环境项跳过、1 个既有 Cats 合成头像 rename 因沙箱 `EPERM` 失败，随后该文件沙箱外定向复验 2 项通过。未重复运行全量回归。全量 `npm run lint` 扫入已有 `.next-verify` 产物而失败，改用修改源码的定向 ESLint，未更改项目 lint 配置或清理其他任务产物。浏览器测试使用的 PID 18960/34868、端口 11697/6248 均在结束后关闭并核验无监听。
