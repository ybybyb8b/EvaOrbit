# Reminder Web Push

The notification settings page exposes an explicit opt-in button. The browser subscription is stored through the owner-scoped repository, `sw.js` displays the payload, and `/api/reminders/deliver` sends due reminders when invoked by a scheduler such as Vercel Cron or Supabase Cron. Run the scheduler at least every 15 minutes so conditional meal reminders remain close to their configured times.

Production activation requires `EVAORBIT_VAPID_PUBLIC_KEY`, `EVAORBIT_VAPID_PRIVATE_KEY`, `EVAORBIT_VAPID_SUBJECT`, `CRON_SECRET`, and `SUPABASE_SECRET_KEY`. The delivery job records `last_notified_at` after at least one successful device delivery and removes expired subscriptions. Per-reminder “Remind me daily while overdue” is opt-in; each local-day slot is idempotent and stops as soon as the reminder is completed, skipped, or cancelled. On iOS, Web Push is intended for an installed Home Screen PWA.

Lucius state changes and Post creation/edits send an immediate owner-scoped Web Push through the same opt-in subscriptions. The notification is “Lucius有新动态 / 要来看看吗？” and opens `/lucius`. Identical updates and deletes do not notify. Delivery failures do not undo saved changes. This path uses the request repository for both web and MCP identity and requires the three VAPID variables; it does not require a scheduler.

New Lucius-authored Post comments also notify the owner with “Lucius回复了你的评论” and open `/lucius`. User comments, edits, deletes, and failed saves do not send reply notifications. Reply tags are scoped to their parent Post and separate from activity notices.

Content changes to the active `recent_life_context` Memo tagged `lucius` send “生活近况已更新 / Lucius 更新了 recent_life_context” and open that Memo's detail page. Both web and MCP updates use the same service. Identical content, metadata-only edits, other Memos, and archived Memos do not notify. The payload does not include private Memo content; delivery uses the existing Web Push subscriptions and VAPID configuration, and failures do not undo the save.
