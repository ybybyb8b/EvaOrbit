<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# EvaOrbit development rules

## Working principles

- Before editing, inspect the current code, data model, services, APIs, and tests. Do not rely on old discussions, prompts, or assumed structure.
- Prefer the smallest low-risk change that satisfies the request. Do not refactor unrelated or stable modules for cleanup.
- Ask only when a decision changes product semantics, the data model, existing data, or important architecture. Resolve ordinary implementation details using established EvaOrbit patterns.
- Preserve the existing visual language, component system, and interaction conventions. Do not introduce a new UI framework or design system for a local change.

## Date and time semantics

- Records allow date-only values by default. Time is explicit only when the user enters it; never use a fabricated `00:00` for an unknown time.
- When storage requires a datetime, use the existing date-only anchor and persist the explicit-time flag with it.
- For date-related changes, keep create, edit, history, Timeline, MCP, and statistics behavior consistent.

## Mobile validation

- The primary real-device target is iPhone 16 Pro. For mobile UI changes, check its viewport, safe areas, Safari/PWA layout, and keyboard behavior.
- Keep layouts responsive. Do not hard-code a page width, device-specific offset, or magic number for iPhone 16 Pro.

## Local development servers

- If the task starts a dev server, record the exact process and close that server and its listening process before finishing. Verify that no new `localhost:3000`, `3001`, `3002`, or other test listener remains.
- Stop only processes started by the current task. Never broadly kill all Node processes or affect another project.

## Validation

- Run validation proportional to the change. Normal feature development defaults to lint, typecheck, tests, production build, and `git diff --check`.
- Report any skipped or failed check and its reason; never report an unrun check as passing.
- For database migrations, verify safe application to the existing schema, avoid duplicate objects and data loss, and only claim real-environment completion after a required migration has actually been applied.

## Git

- Do not create commits or push by default. Unless the current task explicitly requests otherwise, leave completed changes in the working tree and report them.
- Do not alter unrelated Git history or branches.

## Scope discipline

- Stay strictly within the current task. Report adjacent findings, but do not implement them unless they block the requested work.
- Do not refactor stable business modules merely to make the code look cleaner.
