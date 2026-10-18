# Tracker Local-first PoC

## Scope and execution paths

The independent SwiftUI client is retired. This PoC lives in the existing
UIKit/WKWebView Host. The ordinary Host still starts the production website.
The opt-in Tracker build starts `eo-local://app/index.html` from its signed bundle.

- `src/local-trackers/`: React entry and platform adapter. Reuses the existing
  Tracker record editor, card content, FormSheet, inputs, icons, CSS and fonts.
- `src/lib/tracker-local-store.ts`: one shared, durable queue/state machine for
  browser and iOS. Local UUIDs are distinct from server IDs. Upload commands are
  frozen and committed before networking; retries reuse the same mutation ID,
  payload and base/parent versions.
- Browser adapter: account-scoped IndexedDB transactions with revision CAS.
- Host adapter: account-scoped SQLite transactions with revision CAS. Swift
  persists records and outbox together; business rules remain shared TypeScript
  and server-side. No arbitrary SQL, endpoint, cookie or token is exposed to JS.
- `/api/native/sync`: protocol 2 only, authenticated account checked against the
  request. Protocol 1 writes are disabled, including Task/Calendar branches.
- `tracker_sync_v2`: security-invoker/RLS RPC; row locks, monotonic versions and
  receipts commit with business writes in one transaction. Web/MCP writes advance
  the same versions through database triggers. Field edits also advance the parent
  Tracker schema version. Original requests determine idempotency, not normalized
  input that may change after schema changes.
  Each account's snapshot has a transactionally ordered revision, so a late
  response cannot replace a newer snapshot already applied by another window.

The PoC supports Tracker creation with an optional number/text property, and
record create/edit/delete. Existing cloud properties are read and rendered by the
shared editor, including `time_range`. Tracker deletion, archive/property editing,
images, goals, reminders and Insights management stay in Web. System HealthKit,
EventKit and notifications continue through the existing online Host path.

The replica deliberately uses one versioned document per account (64 MiB Host
write ceiling), complete account snapshots, and foreground synchronization.
Snapshots are generated in one SQL statement without PostgREST row truncation;
incomplete/malformed responses are never applied. This is suitable for the bounded
Tracker PoC, not a general replication platform. Introduce indexed record tables
and paginated immutable bootstrap/change-log transport before broadening modules.

## Windows development

```powershell
npm ci
npm run dev:trackers
```

Open `http://127.0.0.1:4178`. The same React sources run in the Host. Browser edits
reload through Vite and records persist in IndexedDB. “本机预览” uses an isolated
preview account and never uploads its data. “连接 EvaOrbit” uses the development
proxy to the existing native session and sync APIs; the proxy does not carry a
service-role key. Production is the default HTTPS API origin; optionally configure
`EVAORBIT_TRACKER_API_URL` to another trusted HTTPS deployment before starting Vite.
The proxy's loopback cookie adjustment exists only in the dev server.

Build the offline bundle with `npm run build:trackers`. Generated assets are ignored
by Git and included as the `TrackerWeb` folder resource by XcodeGen. Never copy a
Next.js build or `.env.local` into this folder. The release HTML has a CSP that
blocks remote scripts and network connections; requests use the restricted Native
Bridge. Fonts/icons are installed with the app.

For an already-installed Debug development Host, a trusted HTTPS Vite/tunnel origin
can be pinned using `EVAORBIT_TRACKER_DEV_URL`. Only Debug builds honor this exact
origin; Release ignores it and starts bundled assets. Ordinary browser preview
needs neither a tunnel nor a new IPA. Native bridge/Swift changes still require CI.

## Deployment and iOS build

The development branch `codex/tracker-local-first-poc` explicitly disables Vercel
Git deployments in `vercel.json`. Keep this guard when pushing CI fixes. This
does not deploy an API or apply any database migration. Production deployment
requires a separate decision; never use production credentials for PoC fixtures.

1. Review/apply `202610180001_tracker_local_sync.sql` using the existing migration
   process, after all preceding migrations. Publish the compatible Web/API.
   Without the migration, sync fails closed and local data remains queued.
2. Run `iOS Native Host` with `local_trackers=true`. It builds local assets, runs
   shared protocol tests, performs existing Simulator tests, then builds the same
   Host with local mode enabled, Bundle ID `com.evaorbit.nativehost.trackerspoc`
   and URL scheme `evaorbit-trackers-poc`. Its display name/artifact identify it as
   `EvaOrbit Trackers PoC`; this does not replace the production app.
3. Use the existing ad-hoc IPA → patched xtool → Personal Team → Windows/WSL device
   installation chain. Existing HealthKit entitlement assertions remain in place.
4. Sign in once online. Cached account identity opens local data immediately on
   later launches; an expired cloud session pauses upload without deleting data.
   Initial installation cannot display cloud records that have never been synced.

No new framework, entitlement, permission prompt, APNs capability or signing tool
is introduced. The existing SDK dependencies already include WebKit and SQLite.
The `Web` link opens the current online Tracker route in the Host; back navigation
returns to the local entry. The online page retains its existing system bridge.

## Acceptance stages

1. Server transactions: replay, different-content mutation reuse, rollback,
   stale versions, Web/MCP version advancement, schema conflicts, deleted records,
   account isolation, migration reapplication, >1,000-row complete snapshot.
   Run `node --test scripts/tracker-sync-postgres.test.mjs` (isolated PGlite PostgreSQL).
2. Shared replica: offline parent/field/record chain, restart, edits during upload,
   response loss, batches >100 queued operations, CAS across windows, clean/dirty
   remote deletion, explicit conflict resolution, malformed response protection.
   Run `node --test src/lib/tracker-local.test.ts src/lib/native-sync.test.ts`.
3. UI: create/edit/delete using the shared form, browser-process restart with the
   same profile, theme changes, long content, 402px and desktop layouts. Test the
   packaged bundle as well as development sources; a development server result
   does not prove bundled WKWebView behavior.
   Run `npm run test:trackers:browser` and, after building, add `-- --bundle` to
   test release assets. The runner uses Playwright plus installed Chrome by
   default; set `EVAORBIT_PLAYWRIGHT_MODULE` to an available Playwright module URL
   if it is supplied by the workspace runtime, and optionally set
   `EVAORBIT_BROWSER_CHANNEL`. It closes its own Vite server and browser profile.
4. Host XCTest/Simulator and iPhone 16 Pro: flight mode + force quit + relaunch;
   local CRUD and crash/relaunch persistence; reconnect and Web/MCP visibility;
   concurrent edits, remote deletion, expired auth/re-login; keyboard/safe areas;
   blocked foreign frames/origins; original HealthKit/EventKit/notification flow.

The manual PoC CI runs an additional Ubuntu job only after the macOS build,
XCTest and IPA checks succeed. Supabase CLI 2.121.0 creates a disposable Docker
stack with real Auth/PostgREST/PostgreSQL. `scripts/tracker-isolated-sync.mjs`
rejects non-loopback targets, applies all preceding migrations, seeds synthetic
users/data, then tests the new migration, real Next API transport, real MCP
business handler/repository, two-account RLS, response loss, conflicts/deletions,
logout/re-login and transport rollback while preserving the durable queue.
The MCP test supplies a genuine local Auth JWT to the normal repository context;
hosted OAuth consent/audience issuance remains a separate acceptance item.
Neither CI job receives production credentials or deploys an API. A local stack
cannot prove compatibility with every difference in the hosted production schema.

The repository's lint, typecheck, full tests, Next production build, local bundle
build and `git diff --check` remain required. CI/real-device and live Supabase
results must be reported separately from Windows checks.

## Recovery

Conflict/rejected records retain their local content and outbox. Choose a remote
version only after explicit confirmation; keep/revise local content with a new
mutation ID and current remote base. Pending deletion retains its delete intent.
If a parent was deleted, export retained data before deciding how to reorganize it.

Logout clears the active local session but preserves account-scoped records/queue.
No automatic reset or delete-and-recreate migration exists. Export includes private
records and pending commands; store it accordingly. iOS exports use the native
share sheet; browser exports download JSON.

Rollback by using the ordinary Host build or disabling local mode. Keep the PoC
installation/database until queued data is synced or exported. Do not uninstall
the app as a routine upgrade or rollback: unsynced local data belongs to its sandbox.
Keep the additive version/receipt migration when rolling back UI/API; dropping
receipts would remove retry protection. Do not re-enable legacy sync writes.
