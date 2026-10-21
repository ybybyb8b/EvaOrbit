<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# EvaOrbit development rules

## Development navigation

- Start each task with the relevant module in [docs/DEV_INDEX.md](docs/DEV_INDEX.md), then inspect its current implementation.
- Read only task-relevant detailed documents; do not load all documentation by default.
- Update the index when architecture, module responsibilities, or important cross-module dependencies change. Ordinary bug fixes and small UI adjustments do not require index updates.
- Keep the index structural and durable. Track current work in the existing Project system, not in the index.

## New chat titles

- Before the first reply in a new Codex chat ends, use the available title tool to name the current chat `模块｜具体任务`, then verify the returned title. If the tool is unavailable or fails, report that truthfully.
- Prefer the canonical module names in [docs/DEV_INDEX.md](docs/DEV_INDEX.md); use Core or Architecture for cross-module work. Keep the task concise and specific, e.g. `Home｜日历胶囊预览`, `Food｜Places版式与归属地`, `Memory｜Graph架构升级`.
- Do not require a date prefix or 开发／设计／审阅 category. If the topic is unclear, retain the current title. Preserve historical chat titles; only rename other or archived chats when explicitly requested.

## Working principles

- Before editing, inspect the current code, data model, services, APIs, and tests. Do not rely on old discussions, prompts, or assumed structure.
- Prefer the smallest low-risk change that satisfies the request. Do not refactor unrelated or stable modules for cleanup.
- Ask only when a decision changes product semantics, the data model, existing data, or important architecture. Resolve ordinary implementation details using established EvaOrbit patterns.
- Preserve the existing visual language, component system, and interaction conventions. Do not introduce a new UI framework or design system for a local change.
- Do not use fine hairlines as the default way to express visual boundaries. Prefer spacing, surface tone, grouping, and restrained elevation; reserve borders for controls or genuinely semantic separation.

## Date and time semantics

- Records allow date-only values by default. Time is explicit only when the user enters it; never use a fabricated `00:00` for an unknown time.
- When storage requires a datetime, use the existing date-only anchor and persist the explicit-time flag with it.
- For date-related changes, keep create, edit, history, Timeline, MCP, and statistics behavior consistent.

## Mobile validation

- The primary real-device target is iPhone 16 Pro. For mobile UI changes, check its viewport, safe areas, Safari/PWA layout, and keyboard behavior.
- Keep layouts responsive. Do not hard-code a page width, device-specific offset, or magic number for iPhone 16 Pro.

## iOS Native Host

- Before changing `ios/EvaOrbitHost`, iOS permissions or capabilities, the JS↔Swift bridge, IPA packaging/signing, patched xtool, or Windows/WSL device installation, read `docs/IOS_NATIVE_MAINTENANCE.md` completely.
- Preserve the verified macOS CI ad-hoc IPA → audited patched xtool → free Personal Team re-signing → Windows usbmuxd/WSL installation chain unless the task explicitly authorizes a migration and the replacement is fully verified on device.
- Do not add an entitlement without checking Personal Team support, xtool preservation, packaged entitlements, and the real-device result. Local notifications do not require APNs capability.

## Local development servers

- If the task starts a dev server, record the exact process and close that server and its listening process before finishing. Verify that no new `localhost:3000`, `3001`, `3002`, or other test listener remains.
- Stop only processes started by the current task. Never broadly kill all Node processes or affect another project.

## Validation

- Run validation proportional to the change; do not default to running the full test suite for every edit.
- Documentation-only changes need a diff review and `git diff --check`; no application tests or builds are required.
- Style, copy, and animation changes need relevant page/component checks and the applicable build or native tests, rather than unrelated module tests.
- Single-module changes need that module's tests and regression checks for affected shared-component callers. Run lint, typecheck, and builds as relevant to the changed files.
- Sync, authentication, shared data-layer changes, and formal releases need one final full regression run after the changes are ready.
- Once checks pass, rerun only checks affected by subsequent edits. Repeat the full suite only when new changes, failures, or unresolved cross-module risks justify it; explain the reason before doing so.
- Report any skipped or failed check and its reason; never report an unrun check as passing.
- For database migrations, verify safe application to the existing schema, avoid duplicate objects and data loss, and only claim real-environment completion after a required migration has actually been applied.

## Git

- Do not create commits or push by default. Unless the current task explicitly requests otherwise, leave completed changes in the working tree and report them.
- Do not alter unrelated Git history or branches.

## Project progress write-back (trial)

- After completing an EvaOrbit project task and receiving the user's approval of its result, write its progress back to EvaOrbit Project through the connected tools without asking for approval again. This is a trial rule; stop applying it if the user cancels it.
- Prefer a known Project Item ID. Otherwise search the owning project with focused task keywords, inspecting only relevant matches; reuse a matching Item and avoid duplicates. If no suitable Item exists, create one with the actual request, appropriate module/type, and a concise outcome. Ask only if the owning project or matching Item remains ambiguous.
- Distinguish approval from acceptance testing: implementation approved but actual usage unverified means `done`; explicit user confirmation that the result works as intended means `verified`. For approved partial progress, retain `doing` and record the remaining work; do not complete a broader Item for a smaller subtask.
- Keep write-backs short: status, outcome, necessary validation/limitations, and remaining next steps. Reuse existing module names and preserve unrelated content, existing data, and server-managed lifecycle timestamps.
- Track independent tasks, not every edit, test, or commit. Do not create Items for ordinary questions, unadopted proposals, or casual discussion. Avoid full Project scans, lengthy conversation copies, and repeated writes when progress has not changed.
- Verify the returned record before reporting success. If the connector is unavailable or the write fails, report that progress was not saved and identify the pending update; never claim a successful write.

## Scope discipline

- Stay strictly within the current task. Report adjacent findings, but do not implement them unless they block the requested work.
- Do not refactor stable business modules merely to make the code look cleaner.
