# Reminder Web Push

The notification settings page exposes an explicit opt-in button. The browser subscription is stored through the owner-scoped repository, `sw.js` displays the payload, and `/api/reminders/deliver` sends due reminders when invoked by a scheduler such as Vercel Cron or Supabase Cron. Run the scheduler at least every 15 minutes so conditional meal reminders remain close to their configured times.

Production activation requires `EVAORBIT_VAPID_PUBLIC_KEY`, `EVAORBIT_VAPID_PRIVATE_KEY`, `EVAORBIT_VAPID_SUBJECT`, `CRON_SECRET`, and `SUPABASE_SECRET_KEY`. The delivery job records `last_notified_at` after at least one successful device delivery and removes expired subscriptions. Per-reminder “Remind me daily while overdue” is opt-in; each local-day slot is idempotent and stops as soon as the reminder is completed, skipped, or cancelled. On iOS, Web Push is intended for an installed Home Screen PWA.

The delivery client's table GET requests retry only HTTP 401 with `PGRST303` / `JWT issued at future`, after 500ms and 1500ms (three attempts total). This mitigates transient upstream JWT time validation failures; it does not change credentials or permissions. Each retry logs the table and attempt without query parameters or credentials. Exhausted retries preserve the original error for the route's diagnostic log. Writes, RPCs, push sends and the whole delivery job are never retried by this wrapper.

Lucius activity, comment reply and recent-life Memo notification triggers are retired. General reminder delivery, Bark settings and opt-in Web Push subscriptions remain available.
