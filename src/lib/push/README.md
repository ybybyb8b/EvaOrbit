# Reminder Web Push

The notification settings page exposes an explicit opt-in button. The browser subscription is stored through the owner-scoped repository, `sw.js` displays the payload, and `/api/reminders/deliver` sends due reminders when invoked by a scheduler such as Vercel Cron or Supabase Cron. Run the scheduler at least every 15 minutes so conditional meal reminders remain close to their configured times.

Production activation requires `EVAORBIT_VAPID_PUBLIC_KEY`, `EVAORBIT_VAPID_PRIVATE_KEY`, `EVAORBIT_VAPID_SUBJECT`, `CRON_SECRET`, and `SUPABASE_SECRET_KEY`. The delivery job records `last_notified_at` after at least one successful device delivery and removes expired subscriptions. On iOS, Web Push is intended for an installed Home Screen PWA.
