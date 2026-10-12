# Bark 通知

在部署前应用 `supabase/migrations/202610130001_bark_notifications.sql`。表开启 RLS，设备 Key 使用现有 `EVAORBIT_ENCRYPTION_KEY` 加密；沿用服务器上的密钥，不要更换。Key 不进入公开设置响应、导出备份或日志。

1. 打开 EO「设置 → 通知」，粘贴 Bark 中的官方推送地址并保存。
2. 发送测试通知，在手机上点击并确认打开 EO。
3. 点击「设为主通道」。如使用 EO Host，再打开一次 Host 同步设置、清理旧的本地业务通知。

目前支持 `https://api.day.app/设备Key`，每个账户连接一个设备。更换地址会暂停 Bark，需重新测试并启用。

启用后，定时业务提醒和 Lucius/Memo 即时通知走 Bark，不再发送同账户的 Web Push，也不再安排 Host 本地业务提醒。网页订阅保留，暂停 Bark 后恢复原有通道。发送失败记录为失败，定时提醒由下次调度重试；不会切换到另一通道制造重复通知。Bark 接口接受请求不等于设备已收到通知。

Apple 提醒事项已经负责的首次提醒保持原有归属；开启「逾期每天提醒」后的后续提醒走 Bark。完成普通提醒后停止，完成 Cat Routine 后按原有周期生成下一次。任务通知跳转到对应 Task，其他提醒跳转到通知页并展开对应提醒。链接打开 HTTPS 网页，不保证进入原生 Host。

定时通知继续使用 `/api/reminders/deliver`，需要服务器 `SUPABASE_SECRET_KEY` 和调度器发送 `Authorization: Bearer <CRON_SECRET>`，建议每分钟调用。Bark 不依赖 VAPID、PWA 安装或 Host 同步到 Apple；但必须有活动提醒和有效推送时间。仅有日期、未设置提醒时间的记录不会凭空产生通知时间。

## 打开 EO Host

应用 `202610130002_bark_host_links.sql` 后，每个账户可选择「打开网页」或「打开 Host」。默认仍为网页；安装支持 `evaorbit://open/...` 的新版 Host 后，点击「改为打开 Host」并发送测试通知。旧 IPA 未注册该协议，不能直接唤起；暂停/恢复 Bark 不改变打开方式。

Host 将链接映射为配置中的 EO HTTPS 源，仅接收 Tasks、通知设置、Food、Health、Lucius 和 Memo 页面，拒绝凭据、外部主机、非页面路径和目录穿越。不通过链接自动完成任务或请求系统权限。冷启动和已运行时均处理该入口。只添加 Info.plist URL Types，不新增 framework、entitlement、APNs 或 bridge 方法。

修改 Host 后需要按既有 macOS CI → ad-hoc IPA → patched xtool → WSL 安装链构建并重装；网页部署与原生安装分别验证。睡眠分界和循环任务日期语义保持原有行为。
