# Web Push boundary

This directory only reserves the Web Push boundary. The database migration contains owner-scoped `push_subscriptions`, and the service worker can display an authenticated server-sent payload. EvaOrbit does not currently request notification permission, create subscriptions, hold VAPID keys, or schedule notifications.

Before activation, add an authenticated Application Service and API route that validates the browser subscription, stores it through the Repository, and never exposes another user's endpoint. Permission must be requested from a deliberate UI action. A scheduler may later emit `task_due`, `drink_limit`, `meal_missing`, or `daily_review`, but only when an enabled rule changes state; it must not send routine per-meal nags.
