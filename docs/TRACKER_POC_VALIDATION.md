# Tracker PoC CI and isolated validation — updated 2026-10-19

This is a staged validation log. The latest server release is recorded in “Production Home read-only API release”; the combined IPA is recorded in “Shared Tracker settings, image cache and read-only Home”. Earlier sections describe their original stage, not the current delivery status.

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
- At this initial substage the iteration was uncommitted with no new macOS CI/XCTest result. Earlier CI
  and real Supabase results below describe their recorded commits. iPhone
  keyboard/safe-area/gesture acceptance is required after packaging. No production
  migration or API deployment ran.

## Scope and deployment boundary

- Development branch: `codex/tracker-local-first-poc`; production `main` remains
  `f29a89355b2eb3b087d35f9e46c4d4d2d8f24c10`.
- `vercel.json` disables Git deployments for this exact development branch.
  The guard was committed before the first push; GitHub reported no deployments
  for the implementation and integration-test commits.
- No production Supabase migration, sync-v2 API release or main merge. The separately approved Home read-only API release is recorded below. Earlier read-only device installation is recorded separately; the latest combination has not been installed.
- The initial unrelated Home changes and test were preserved, then included when Home became explicitly authorized scope. The pre-existing `next-env.d.ts` change remains excluded and unchanged.

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
- Windows bundled React read all 27 historical forms and all 7 timelines/insights from this real backup. Inputs/submission/deletion were disabled, cold browser restart preserved the snapshot, and a separate synthetic frozen canary queue remained unchanged. Cached list render measured 72 ms on the latest Windows run; this is not an iPhone timing or live network measurement.
- Native now blocks business commit/sync and stores snapshots in a separate account-scoped SQLite table. It automatically backs up SQLite including WAL before reading, verifies quick_check, and reports original pending/frozen queue counts. Automatic backup and isolation passed XCTest; the actual device's queue counts and read-only UI still await user verification.
- Windows → audited patched xtool → iPhone ActivationState preflight passed. The user confirmed USB unlock/trust and waived manual export because the old PoC contains no meaningful records. Automatic backup/queue isolation remain enabled; neither app is uninstalled. Device contents and its actual queue counts have not yet been inspected.
- Acceptance installation must set `EVAORBIT_SKIP_RENEWAL=1` to avoid the default production renewal Task write. Signing, HealthKit entitlements, formal Host and production data boundaries remain unchanged.

### New build and installation evidence

- Source: `c0f9a6856b1a2c55d653d4b805bf3f79381ed111`, branch `codex/tracker-local-first-poc`. Vercel's exact-branch deployment-disable guard remains enabled; main was not merged. Unrelated local Home/next-env work was excluded from the commit.
- [Online Host CI 39149123208](https://github.com/ybybyb8b/EvaOrbit/actions/runs/39149123208): passed, **43 XCTest / 0 failures**, signed device build and entitlement packaging passed.
- [Tracker PoC CI 39149308064](https://github.com/ybybyb8b/EvaOrbit/actions/runs/39149308064): passed, **43 XCTest / 0 failures**. The isolated real Supabase migration/API/MCP/RLS/recovery integration passed again, and temporary services stopped. These are isolated data writes, not real-account write acceptance.
- Artifact `EvaOrbitHost-TrackersPoC-ad-hoc-39`, Xcode 16.4. Verified GIT_SHA, SHA-256 `5b7c870244ffcc0face5e7f9308de431314e276891ded50e18ef857fe1ccc8d9`, independent bundle `com.evaorbit.nativehost.trackerspoc`, independent URL scheme, bundled UI/read-only bridge methods and both HealthKit entitlements.
- Audited patched xtool / Personal Team / Windows usbmuxd installation **succeeded** over the existing development app. No uninstall was executed; the script explicitly confirmed production renewal reminders were left unchanged. Installation does not prove real login, actual device backup, offline startup or system-feature behavior.
- Windows lint, typecheck, Next production build, bundled UI build, editable-preview browser regression, persistent-error touch/keyboard regression and diff checks passed. Full suite: **600 tests, 587 passed, 12 skipped, 1 unchanged baseline failure** (`long-term-memory.test.ts:93`, obsolete AppShell Lucius markup assertion). Seven forbidden Vite proxy requests were rejected before upstream access; an immediate test-server shutdown caused a dependency-scan cancellation warning. No task-created test listeners remained after shutdown.
- Physical-device feedback: the user reports the original queue has **2 pending operations, 1 frozen, not uploaded**, and confirms the list, timeline and history remain accessible after the requested offline-restart procedure. This verifies the reported read path; exact list count, the automatic backup receipt, disabled submit/delete controls, startup timing and keyboard/safe-area behavior were not individually confirmed.
- Visual acceptance is **not passed**: previously uploaded icons are absent and the settings page differs from Web. Inspection confirms the local workspace renders only the legacy `icon` string through `TrackerPicture`, while Web's `TrackerIcon` reads the authenticated `/api/trackers/:id/icon` image endpoint. The native read-only allowlist and bundled asset handler currently provide no account-scoped image cache. Local settings is intentionally a reduced basic-info/property summary; it does not yet share Web's complete settings presentation or expose goal/reminder metadata through its local projection.
- Next visual substage: authenticated read-only image retrieval with account/version-scoped durable cache, shared image rendering for cards/detail/settings and offline fallback; then extract/reuse Web settings presentation with read-only controls and preserved business semantics. Verify account switching, image refresh/removal/failure, offline process restart and Web/local visual regression before a new device build. Do not relax business-write guards to restore visual parity.
- Real-account CRUD/Web/MCP write acceptance remains disabled pending separately approved production protocol-2 migration/API deployment. Original queue operations remain isolated; the user's report does not authorize draining or clearing them.

## Shared appearance layer (Windows substage)

- Web/local use the same font registrations, preference controller, system appearance handling and `AppearanceSettings` controls. Local first-use defaults are English/August; existing explicit settings and the persisted `ibm` key are preserved. Web defaults and its preference PATCH contract are unchanged. Local saves use device storage and never invoke the production preference API or Tracker outbox.
- Actual Chrome platform-font inspection confirms August renders on both builds. Original font bytes and login heading text/font size/weight/line-height/dimensions match at 402px and 1440px. Four English and four Chinese selections, light/dark/system switching, language switching and a fresh persistent-browser context passed. This is Windows coverage, not a newly installed iPhone build.
- Shared login copy now participates in localization. The exact public `/theme-init.js` path bypasses authentication so anonymous first paint receives JavaScript rather than a login redirect; business/API authentication stays in place.
- Tracker bundled preview CRUD/persistence/insights and error-banner touch/keyboard regressions passed. Real-backup read-only regression again checked all 27 historical forms, restart and unchanged synthetic canary queue; it performed no cloud business writes. Full tests: **602 total, 589 passed, 12 skipped, 1 known Lucius-navigation literal assertion failure**. Lint, typecheck, Next production build, bundled UI build and diff checks passed.
- WKWebView XCTest was updated to check the actual August asset and language/font persistence on reload; its macOS result is recorded in the combined delivery below. This appearance substage changed no Swift production implementation, bridge method, framework, permission or entitlement. The iPhone still has the preceding read-only build.
- These appearance changes were committed with the subsequent shared settings/Home delivery. Real-account write acceptance remains disabled.

## Shared Tracker settings, image cache and read-only Home — implementation stage

- The original Tracker settings markup is now `tracker-settings-view.tsx`, shared by Web and the local workspace. Web retains the original editor slots and handlers; real-account local controls are disabled with their handlers removed. Goals/reminders remain read-only snapshot metadata outside the mutation records/outbox.
- Authenticated uploaded icons are cached as bounded PNG/JPEG/WebP data URLs, scoped by account and Tracker version. Failed refresh retains the previous verified image; 404/410 or restoring the default drops it. Neither cache projection nor image refresh creates mutations.
- Home shares the original masthead, calendar, timeline, sleep/details, day-note and Due components. Local transport caches recent seven days and visited dates/months in native SQLite or browser IndexedDB, separately from business records and frozen queues. Each resource is capped at 4 MiB; Home retention is capped at 128 resources / 64 MiB per account. Missing snapshots are explicitly unavailable, never inferred empty records.
- Existing Home GET services can catch up automatic subscription payments and reconcile medication reminders. A new authenticated `GET /api/native/home-readonly/[kind]/[key]` invokes read-only service options inside an audited repository allowlist. No fallback to old Home endpoints is allowed. No production migration is required for this endpoint; **production API deployment is not authorized or performed**.
- Windows bundled-browser tests passed: Home cached startup/restart, forced note submission blocked, shared settings controls disabled, uploaded-image persistence, unchanged old canary queue, zero business writes and no overflow at 402/1440 px. Core Tracker browser create/edit/delete/quick capture/settings/insights/restart regression passed. Synthetic UI tests are not real-device acceptance.
- Read-only aggregation tests run against a disposable SQLite database containing an overdue automatic subscription, with triggers rejecting all INSERT/UPDATE/DELETE operations. Day/month/due reads pass; repository write attempts fail closed. Icon unit tests cover version reuse, refresh failure, missing/default images and cross-account cache rejection.
- Local full suite: **607 tests, 594 passed, 12 skipped, one pre-existing Lucius navigation source-literal failure**. Lint/typecheck, bundled/Next builds and diff checks passed. Additional browser checks confirm an older offline date is not labeled Today and all Due actions are disabled. Real-backup regression read all 27 historical forms; its isolated canary queue stayed unchanged, with zero cloud business writes.
- Source **`95cba265a41e77de7886baf7f11f477716552138`**: [combined PoC CI](https://github.com/ybybyb8b/EvaOrbit/actions/runs/39200197072) passed **44 XCTest cases** and isolated Supabase integration; [online Host regression](https://github.com/ybybyb8b/EvaOrbit/actions/runs/39200195812) also passed **44 XCTest cases**. WKWebView verified actual August loading and persistent language/font reload. Native tests verified Home SQLite cache persistence, account isolation, rejection of unsafe/invalid request paths and unchanged legacy outbox.
- The disposable Supabase run verified authenticated day/month/due reads, unauthenticated 401 and invalid-date 400. An overdue automatic subscription retained its renewal date and generated zero payments through these reads. Existing real API/MCP/RPC migration, idempotency, concurrent edits, remote deletion, RLS, re-login and rollback/queue recovery regressions also passed. No hosted Supabase target was used.
- Artifact **`EvaOrbitHost-TrackersPoC-ad-hoc-47`**, Xcode 16.4 / 16F6, SHA-256 **`cfaf4b8db5e838354fd0bc7e151a626f2dfe73d5bae13ad0552bcc94e04fb0ba`**. Downloaded IPA audit confirmed independent `com.evaorbit.nativehost.trackerspoc` and URL scheme, local Home bridge code, offline CSP, exact August font bytes and both HealthKit entitlements. Artifact run number is 47; the existing plist CFBundleVersion remains 1. No new entitlement was introduced.
- **Combined device acceptance pending**: the IPA is ready; its initial Home API release gate was subsequently approved and completed in the next section. The seven-file API-only patch excludes UI changes, sync-v2 deployment and all migrations. Keep real Tracker writes disabled and preserve the original device queue.

## Production Home read-only API release — 2026-10-19

- User explicitly approved this API-only production release after confirming that IPA #47 needs no rebuild. A separate managed checkout/branch `codex/home-readonly-api-release` was based on the verified production/main commit `f29a89355b2eb3b087d35f9e46c4d4d2d8f24c10`. Release source **`7848320`** changes exactly seven API/service/tracing files: 81 insertions, 11 deletions. No UI, native, sync-v2 route or migration change was included.
- Standalone release checks: production Next build, typecheck and lint passed; the temporary test fixture's two unused-import warnings were removed and it was linted again. Full baseline suite: **572 tests, 559 passed, 12 skipped, one existing Lucius navigation source assertion failed**. Both read-only boundary tests passed, including SQLite triggers rejecting every business-table write while an overdue automatic subscription is present. The broader isolated Supabase evidence above covers the identical Home read-only implementation.
- Vercel candidate **`dpl_Ev1DPq5eyYAdEW3fZDuTTjZkwLFd`**, `https://eva-orbit-m2itv9qao-echopad.vercel.app`, built successfully with the existing production environment and `npm run build`. The build contains `/api/native/home-readonly/[kind]/[key]`. Candidate checks passed before the primary production domain was promoted. The CLI-created temporary deployment-protection bypass was revoked after verification; EO account authentication was never bypassed.
- Promoted and verified **`https://eva-orbit.vercel.app`** points to this READY deployment. Live checks: login 200, unauthenticated native session 200, unauthenticated Home day/month/due all 401 JSON. These are live availability/auth checks, **not authenticated real-account Home acceptance**. No record content was requested by those live checks.
- No production migration, business write, main merge, IPA rebuild or new device installation was performed. The existing #47 IPA can now use the new Home endpoint. Real-account download, images, device appearance, offline restart and actual Native Bridge/Home integration remain device acceptance work.
- Previous production deployment is retained: **`dpl_2SuJ7sAL3pLw5DMkjeebEbkZWrDA`**, `https://eva-orbit-cpi2nk1wh-echopad.vercel.app`. Rollback can promote that deployment again, without touching Supabase or any device database/queue. The PoC must preserve cached data and fail closed if the endpoint is rolled back.
- **Release follow-up:** main remains unchanged by request. Before the next main-based production deployment, incorporate this seven-file API patch so that deployment does not remove Home read-only support. The separate release checkout/commit is retained for review/reuse. No release-branch push or new Actions run was required. Future Actions monitoring belongs to the user unless explicitly requested otherwise.

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


## Agent-run pre-primary acceptance — 2026-10-22

User delegated automated acceptance; no production account records, Apple Health, Calendar or Reminders were modified. No IPA installation, database migration, production flags or deployment was performed.

- Current local run: 34 Tracker PostgreSQL/replica/EventKit scheduler/notification contract tests passed, without skips. PGlite executes the actual Tracker migration/RPC and replica state against isolated PostgreSQL semantics: replay identity, changed-payload rejection, committed response loss, stale-version conflicts, delete reconciliation, transaction rollback, complete snapshots and two-account isolation. This is not a hosted Supabase request.
- Tracker browser regression passed: offline create/edit/reopen, response-loss retry, conflict, remote deletion, permanent deletion preserving unrelated pending edits, pause/draft retention and unchanged legacy queue. Synthetic transport, no real account writes. Its test listener was closed.
- HealthKit contract tests: 11 passed. EventKit migration/import transaction test was initially skipped for an unset optional engine path; rerun with the existing PGlite dependency passed (1/1), checking atomic import/reinstallation and account isolation. These are not real Apple permission or sample-write tests.
- At the user's explicit one-time authorization, inspected existing run [39720469729](https://github.com/ybybyb8b/EvaOrbit/actions/runs/39720469729), commit 073ce5f: completed/success; both build (macOS build/XCTest) and isolated Supabase Tracker integration jobs succeeded. No new dispatch or continued polling. Current unpushed spacing/pinch changes are outside that run.
- iPhone was subsequently connected: audited xtool SHA, Windows/WSL TCP transport and Activated state verified. No device identifiers logged. Screenshot service was unavailable because a developer image was not mounted; no screen or UI operation was claimed. The existing WKWebView source has no explicit inspectable-page configuration, and current tooling provides no verified remote page automation.
- Not passed: complete local-shell native lifecycle. The online AppShell mounts EventKitReconciler/NativeNotificationReconciler, while local main does not; localCoreMethods deliberately excludes HealthKit manual writes. The trusted online settings panel is not proof of automatic local-shell parity. HealthKit restoreAtLaunch remains present. Primary native opt-in was not enabled and actual iPhone permission/write-back/background behavior remains unverified.
