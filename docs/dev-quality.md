# Dev quality gates

This document lists the official commands for validating a change before it's considered done.

## Commands

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Runs `tsc --noEmit` — type-checks the whole project without emitting output. |
| `npm run lint` | Runs `next lint` (ESLint via `eslint-config-next`). |
| `npm test` | Runs the unit/component test suite with Vitest (`vitest run`). |
| `npm run test:e2e` | Runs the Playwright end-to-end suite. Not part of `check` — slower and needs a running app. |
| `npm run check` | Runs `typecheck`, then `lint`, then `test` in sequence. Use this as the single pre-commit/pre-PR gate. |
| `npm run check:schema` | Static, no-DB-access consistency check between `supabase-migration-import-audit-log.sql`, `supabase-schema.sql`, and `lib/supabase/database.types.ts` (see [scripts/check-import-audit-schema.mjs](../scripts/check-import-audit-schema.mjs) and [import-audit-migration-runbook.md](import-audit-migration-runbook.md)). Not part of `npm run check` yet — run it manually when touching the import-audit-log schema. |
| `npm run check:supabase-env` | Guardrail that refuses to let a migration/`database.types.ts` regeneration proceed against an ambiguous Supabase environment (see [scripts/check-supabase-environment.mjs](../scripts/check-supabase-environment.mjs) and [docs/supabase-environments.md](supabase-environments.md)). Reads only `SUPABASE_ENVIRONMENT`/`SUPABASE_PROJECT_REF`/`NEXT_PUBLIC_SUPABASE_URL` and `supabase/.temp/linked-project.json` — never a secret — and masks any project ref it prints. Fails (exit 1) if `SUPABASE_ENVIRONMENT` is unset/invalid, if `--target` doesn't match it, if `production` is requested without `--confirm-production`, or if the env-var project ref disagrees with the linked one. **Not part of `npm run check`** — most local dev environments have no `SUPABASE_ENVIRONMENT` set at all, and that's fine for day-to-day work; this check only matters before a sensitive Supabase operation. Usage: `npm run check:supabase-env -- --target=staging` or `npm run check:supabase-env -- --target=production --confirm-production`. |

`npm run check` stops at the first failing step (typecheck → lint → test), so a red `lint` step means typecheck already passed, etc. `check:schema` and `check:supabase-env` are intentionally separate from it: both are narrow (one feature's schema; Supabase environment identification) rather than a general project gate, and neither touches Supabase over the network — they only read local files/env vars.

<!-- test: temporary note for the skip-e2e required-check experiment; removed before merge -->

## Current status (as of this baseline)

As of this change, the codebase is clean on all three gates:

- `npm run typecheck` — 0 errors.
- `npm run lint` — 0 warnings/errors.
- `npm test` — all tests passing.
- `npm run build` — also succeeds with full type-checking and linting enabled (see below).

## Build-time enforcement

`next.config.js` **no longer sets `typescript.ignoreBuildErrors`**. Since the project had zero typecheck/lint errors at the time this baseline was established, production builds (`npm run build`) now type-check and lint the project as part of the build, and will fail the build if either introduces new errors.

If a future change needs to temporarily bypass this (e.g. to unblock a deploy while a fix is prepared), re-add `typescript: { ignoreBuildErrors: true }` to `next.config.js` deliberately, and document why in this file — don't leave it in silently.

Note: `eslint.ignoreDuringBuilds` was never set in this project's `next.config.js` (despite older docs suggesting otherwise); `next build` already linted the project before this change, it just wasn't type-checking it.

## `next lint` deprecation

`next lint` prints a deprecation warning (it will be removed in Next.js 16) and suggests migrating to the plain ESLint CLI via `npx @next/codemod@canary next-lint-to-eslint-cli .`. That migration is out of scope for this baseline — `next lint` still works correctly against `eslint-config-next@15.5.20` and should keep being used until Next.js 16 forces the move.

`next lint` also has a side effect: on first run it may rewrite `tsconfig.json` formatting and suggest adding `"target": "ES2017"`. That's a cosmetic/optional suggestion from Next, not required for `typecheck`/`lint`/`build` to pass — it was intentionally left out of this change to keep the diff minimal. Contributors who run `npm run lint` locally may see `tsconfig.json` get reformatted as an uncommitted change; discard it (`git checkout tsconfig.json`) unless you deliberately want to adopt the suggested `target`.

## `eslint-config-next` version

`eslint-config-next` was bumped from `14.2.18` to `^15.5.20` to match the installed `next` version (`15.5.20`). This was verified safe before making the change:

- `eslint-config-next@15.5.20`'s peer dependency range (`eslint: ^7.23.0 || ^8.0.0 || ^9.0.0`) is compatible with the project's `eslint@^8`, so no ESLint major upgrade or flat-config migration was required.
- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` were all re-verified after the bump and remain clean.

## Known pre-existing issues (not introduced by this change)

`npm audit` reports 3 vulnerabilities unrelated to this baseline work:

- `postcss` (moderate, via `next`'s own dependency tree) — fix requires downgrading `next` to `9.3.3`, not viable.
- `xlsx` (high, prototype pollution / ReDoS) — no fix currently published upstream.

Neither blocks `typecheck`, `lint`, `test`, or `build`. They're noted here so they aren't mistaken for something this baseline was supposed to fix.
