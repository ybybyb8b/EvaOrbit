# Client page caching

The cache improves repeat navigation and reads; it is not an offline editing or synchronization system.

## Layers

- Next's native client page-segment cache retains dynamic routes for 120 seconds. Forward navigation to a different pathname explicitly starts at the top before paint, including API-owned loading pages; query-only changes and hash targets keep their own position. Browser Back/Forward retains native scroll handling, with a bounded height-aware retry for API-owned lists that render too late for the browser's first attempt. User scrolling cancels this retry. Navigation intent prefetches at most eight local destinations per shell lifetime, and respects Save-Data.
- `client-data-cache.ts` intercepts explicitly allowed same-origin JSON GETs in `DataChangeReconciler`. Account-scoped snapshots share the existing IndexedDB store with Home. Fresh data returns without a request; stale data returns immediately and revalidates in the background.
- Tasks/reminder list reads use 15 seconds of freshness; other allowed business reads use 60 seconds. Storage retains at most 250 snapshots, each below 1 MB, for up to seven days. Storage failures fall back to normal network reads.
- `useDataRefresh` updates mounted client-owned lists after a related write or changed background response. `useServerDataState` accepts new server props without resetting separate editor state. Filtered, API-owned lists keep ownership of their own results.
- `useRememberedState` retains small filters, tabs and search preferences in account-, path- and query-scoped session storage. It must not hold record bodies, device permission state, credentials or editor drafts.

## Updating data

Successful writes invalidate domains defined in `cache-policy.ts`, including dependent summaries. Server pages refresh in place, never by document reload. Local client-cache updates do not turn unrelated business modules stale. Home still uses its date/month reader but shares snapshot storage.

Native change events, cross-tab revision changes and manual pull-to-refresh also revalidate affected views. Returning to the app after 30 seconds performs a conservative freshness check for external/MCP changes. AI stream completion invalidates all domains because tools may have written to other modules.

Auth, native/device truth, notification scheduling, exports, API credentials and streaming replies are excluded from persistent API caching. The notification page can reuse its native route cache, but notification scheduling reads remain network-backed. Logout clears private snapshots and view preferences; a changed account keys a fresh shell. `cache: "reload"` bypasses the JSON cache when an individual read must use the network.

## Boundaries

There is no server revision endpoint or push subscription: this does not claim that network requests occur only after new data exists. A never-visited route and a new document's authenticated server render still need the server. The cache does not cache private HTML or RSC payloads in the service worker, and cannot cold-start the full app offline.

When API response contracts change incompatibly, bump the `client-v1` token in `revision()`; do not reuse incompatible snapshots. New modules must explicitly define both safe reads and write dependencies in `cache-policy.ts`.

Checks: `npm test` covers policy exclusions, related invalidation, request deduplication, account separation, stale reads, in-flight invalidation, filter restoration and draft-safe server updates. Mobile browser QA additionally checks real IndexedDB reloads and native route reuse.

Resource optimization: Web Home reuses one server refresh for today, its month and Due, and only refetches other selected dates or visible months. EventKit mapping/preferences and marked intermediate writes defer invalidation to the committed-domain notification, including partial failure. Native notification triggers merge into an active execution plus one follow-up.
