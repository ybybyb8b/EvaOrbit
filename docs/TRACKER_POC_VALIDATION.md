# Tracker PoC CI and isolated validation — 2026-10-18

## Shared React UI iteration — 2026-10-19 (Windows)

- Web/local login share frame and fields. Actual Web vs bundled local checks at
  402/1440 px matched card width, padding, radius/surface, heading size/line height,
  input height and submit copy. The browser preview link is local-only.
- Creation (seven property types), entry timeline/actions, search/time/property
  filters and activity Insights use shared React components. Basic local settings
  and quick capture use the existing queue. Multi-property creation commits
  Tracker, fields and outbox atomically. Failed storage writes keep drafts and
  persist no partial records; restart and subsequent synchronization were tested.
- Windows: lint, typecheck, Next/local production builds, browser CRUD/restart/
  Insights/settings/quick-capture and persistent error/touch/keyboard recovery
  passed. Full suite: 596 tests, 583 passed, 12 skipped, one pre-existing
  `long-term-memory.test.ts` navigation-source assertion failed.
- This iteration is uncommitted and has no new macOS CI/XCTest result. Earlier CI
  and real Supabase results below describe their recorded commits. iPhone
  keyboard/safe-area/gesture acceptance is required after packaging. No production
  migration or API deployment ran.

## Scope and deployment boundary

- Development branch: `codex/tracker-local-first-poc`; production `main` remains
  `f29a89355b2eb3b087d35f9e46c4d4d2d8f24c10`.
- `vercel.json` disables Git deployments for this exact development branch.
  The guard was committed before the first push; GitHub reported no deployments
  for the implementation and integration-test commits.
- No production Supabase migration, API deployment, merge or device installation.
- Existing unrelated Home changes, its untracked test and `next-env.d.ts` were
  excluded from the commits and remain in the original working tree.

## macOS and native regression

Source commit `9460dd0`:

- [Tracker PoC CI](https://github.com/ybybyb8b/EvaOrbit/actions/runs/39126110755):
  macOS build and isolated integration jobs both passed.
- [Ordinary online Host CI](https://github.com/ybybyb8b/EvaOrbit/actions/runs/39126109829): passed.
- Earlier native verification of identical Swift sources at `113fca2` also passed
  in both modes. PoC XCTest: **42 tests, zero failures**, including the three new
  local asset/origin, bundled WKWebView startup and SQLite persistence/queue tests.
- Existing EventKit, HealthLocalStore, HostConfiguration, loading experience,
  data-change, theme and NotificationManager suites passed.
- Simulator build, Release iPhoneOS build, ad-hoc signing, HealthKit entitlement
  assertions and IPA packaging passed. No framework, entitlement or permission
  was added. Xcode 16.4 / iOS 18.5 SDK; Swift language mode remains 5.
- Initial `npm ci` failed because the Windows-generated lock omitted two optional
  peer dependencies. Regenerating with npm 11.21.1 repaired the lock without
  upgrading existing packages; subsequent macOS installs succeeded.
- Downloaded `EvaOrbitHost-TrackersPoC-ad-hoc-37` and independently verified the
  IPA SHA-256: `adeeeed82703924fa85f6f887027f92c64db0971c532cd4beab4672ad98ccb8a`.
  `GIT_SHA.txt` matches `9460dd0`; bundled `TrackerWeb` resources and both HealthKit
  entitlements are present. No Personal Team re-signing or installation was run.

Simulator tests do not prove real HealthKit permissions/read-write delivery,
EventKit permissions/source recovery, notification delivery, or Personal Team
re-signing/install behavior on the physical iPhone.

## Windows checks

- lint, typecheck, Next production build, local UI production build and diff checks passed.
- Development and bundled React UI: create/edit/delete, process restart with the
  same browser profile, theme switching, dark mode and responsive layout passed.
- Focused protocol/queue/PostgreSQL/deployment-guard tests: **18 passed**.
- Full suite: **585 tests; 572 passed, 12 skipped, one existing failure**.
  `long-term-memory.test.ts:93` expects an obsolete literal Lucius navigation
  markup pattern. The same pattern fails against the unchanged baseline AppShell;
  this task does not modify that component or its test.

## Isolated Supabase integration

**Passed** in run `39126110755`, after the macOS build passed. The runner used
disposable local Docker services, synthetic users and local keys, refused hosted
URLs, and had no production secrets. Temporary services stopped successfully.

Verified against real Auth/PostgREST/PostgreSQL:

- All preceding migration files apply; the new migration applies repeatedly and
  preserves records created before it.
- Missing migration fails closed while preserving the complete durable queue.
- Restart and loss of a committed response recover with no duplicate creation.
- Local writes appear in real Next Tracker routes and the production MCP handler;
  Web updates and MCP creation/update/deletion propagate back into the replica.
- Concurrent edits retain local content and require explicit resolution; clean
  remote deletions propagate, while dirty deleted records remain recoverable.
- Two genuine Auth users remain isolated through RLS and MCP repository context;
  wrong-account sync returns 409 and unauthenticated sync returns 401.
- Disconnect, logout/re-login and local store reopen preserve pending operations.
- Temporarily withdrawing the RPC makes sync fail without losing the queue;
  restoring the RPC drains the same retained operations successfully.

The MCP test uses a genuine local Auth JWT and the ordinary MCP request repository
context. It does not exercise ChatGPT's hosted OAuth consent, resource audience
issuance or the external `/api/mcp` bearer-token authentication exchange.

## Real-account read-only acceptance preparation (2026-10-19)

- Completed an owner-scoped repeatable-read, READ ONLY PostgreSQL export of structured Tracker data. SHA-256 and JSON read-back verified: 7 trackers, 11 fields, 27 entries, 1 Tracker reminder and 1 related reminder. The private ignored backup contains no binary image assets. No production migration, API deployment or business write was performed.
- Windows bundled React read all 27 historical forms and all 7 timelines/insights from this real backup. Inputs/submission/deletion were disabled, cold browser restart preserved the snapshot, and a separate synthetic frozen canary queue remained unchanged. Cached list render measured 80 ms on this Windows run; this is not an iPhone timing or live network measurement.
- Native now blocks business commit/sync and stores snapshots in a separate account-scoped SQLite table. It automatically backs up SQLite including WAL before reading, verifies quick_check, and reports original pending/frozen queue counts. New macOS XCTest and physical-device results remain pending until the new artifact is built and installed.
- Windows → audited patched xtool → iPhone ActivationState preflight passed. The user confirmed USB unlock/trust and waived manual export because the old PoC contains no meaningful records. Automatic backup/queue isolation remain enabled; neither app is uninstalled. Device contents and its actual queue counts have not yet been inspected.
- Acceptance installation must set `EVAORBIT_SKIP_RENEWAL=1` to avoid the default production renewal Task write. Signing, HealthKit entitlements, formal Host and production data boundaries remain unchanged.

## Remaining risks and release order

1. Compare the deployed schema/migration ledger read-only with the tested schema
   before any production migration. A fresh isolated stack cannot detect every
   historical drift in production.
2. Full account snapshots and a versioned JSON document in SQLite are bounded PoC
   choices (64 MiB write ceiling, foreground synchronization). Large histories need
   measured startup/merge costs and eventually indexed storage/change transport.
3. Real iPhone offline cold launch, core CRUD through the real Native Bridge,
   keyboard/safe areas, force quit/relaunch, account switching and system feature
   regressions remain an explicit subsequent acceptance stage.
4. A later approved release should apply the additive migration, deploy the
   compatible API, verify Web/MCP and real account sync, then install the PoC via
   the existing audited signing chain. Until then the IPA cannot be treated as a
   production-connected protocol-2 client.
5. Roll back UI/API while retaining the additive schema, receipts and local
   installation. Preserve/export unsynced queues. Never uninstall/reset the PoC
   database or re-enable legacy unsafe writes as a routine rollback.
6. Existing HealthKitCoordinator async `NSLock` warnings remain in Swift 5 mode.
   These are separate migration work before adopting Swift 6 language mode.
