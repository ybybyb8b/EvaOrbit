# Bark 通知

在部署前应用 `supabase/migrations/202610130001_bark_notifications.sql`。表开启 RLS，设备 Key 使用现有 `EVAORBIT_ENCRYPTION_KEY` 加密；沿用服务器上的密钥，不要更换。Key 不进入公开设置响应、导出备份或日志。

1. 打开 EO「设置 → 通知」，粘贴 Bark 中的官方推送地址并保存。
2. 发送测试通知，在手机上点击并确认打开 EO。
3. 点击「设为主通道」。如使用 EO Host，再打开一次 Host 同步设置、清理旧的本地业务通知。

目前支持 `https://api.day.app/设备Key`，每个账户连接一个设备。更换地址会暂停 Bark，需重新测试并启用。

启用后，定时业务提醒和 Lucius/Memo 即时通知走 Bark，不再发送同账户的 Web Push，也不再安排 Host 本地业务提醒。网页订阅保留，暂停 Bark 后恢复原有通道。发送失败记录为失败，定时提醒由下次调度重试；不会切换到另一通道制造重复通知。Bark 接口接受请求不等于设备已收到通知。

Apple 提醒事项已经负责的首次提醒保持原有归属；开启「逾期每天提醒」后的后续提醒走 Bark。完成普通提醒后停止，完成 Cat Routine 后按原有周期生成下一次。任务通知跳转到对应 Task，其他提醒跳转到通知页并展开对应提醒。链接打开 HTTPS 网页，不保证进入原生 Host。

定时通知继续使用 `/api/reminders/deliver`，需要服务器 `SUPABASE_SECRET_KEY` 和调度器发送 `Authorization: Bearer <CRON_SECRET>`，建议每分钟调用。Bark 不依赖 VAPID、PWA 安装或 Host 同步到 Apple；但必须有活动提醒和有效推送时间。仅有日期、未设置提醒时间的记录不会凭空产生通知时间。

本次不修改睡眠分界、循环任务日期语义或原生 IPA。
