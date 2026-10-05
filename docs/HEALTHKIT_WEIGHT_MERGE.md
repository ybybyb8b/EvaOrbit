# HealthKit 体重重复样本合并

迁移 `202610050003_healthkit_weight_merge.sql` 仅合并 `source=apple_health` 且有 HealthKit 样本 ID 的记录，匹配账户、完整时间 instant、存储精度的体重值。保留最早创建的记录 ID；不按日期或相近时间合并，也不合并手工记录。

被合并记录完整保存到 `healthkit_weight_merged_samples.original_record`，每个样本 UUID 映射到保留记录。该归档仅 service role 可访问，不向浏览器开放。后续 ingest 识别旧 UUID，并合并相同时间和值的新 UUID；重试或重装扫描不会重新创建副本。删掉一个 HealthKit 副本时，若还有存活副本则替换代表样本，保留可见记录 ID；所有副本删除后移除导入记录。手工记录的 sync identifier 回传行为保持原样。

一次性执行工具：

```powershell
# 默认：真实数据库事务演练，最后完整回滚
node --env-file-if-exists=.env.local scripts/merge-healthkit-weight.mjs

# 用户授权合并后：先备份，再原子提交迁移与 migration ledger
node --env-file-if-exists=.env.local scripts/merge-healthkit-weight.mjs --apply
```

工具在锁定体重表后备份所有原始体重记录及旧 ingest 函数到本地 `tmp/healthkit-weight-merge/*.json`，不会打印健康值或连接凭据。该目录被 Git 忽略，备份应留在受保护的本地环境。工具检查手工记录未改变、重复组清零，并重放所有合并样本验证可见记录不变；任一步失败均回滚。

独立测试：

```powershell
node --env-file-if-exists=.env.local --test scripts/healthkit-weight-merge.test.mjs scripts/healthkit-idempotency.test.mjs
```

测试仅使用合成用户与样本，完整回滚。新增数据库规则直接由现有 RPC 使用，无需升级 Host 或 Web 才生效；此变更不清理 Apple Health 内的原始样本。
