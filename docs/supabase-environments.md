# Supabase environments

How to tell environments apart, and why this repository refuses to run
sensitive Supabase operations (migrations, `database.types.ts` regeneration)
against a project it can't unambiguously identify. Written after a real
attempt to validate the import-audit-log migration discovered that **this
environment currently has only one real Supabase project, named plainly
`"portify"`, with no staging/production distinction anywhere**
(see [import-audit-migration-runbook.md](import-audit-migration-runbook.md#production-validation-log)).
This document is the guardrail for that gap — not a fix for it. Someone
still has to actually create/name a separate staging project; see
"Procedure — confirming staging" below for what that person needs to do.

**Update, 2026-07-11 — this exact failure mode happened for real.** The
project owner verbally confirmed `"portify"` as staging on 2026-07-10; that
confirmation was mistaken — `portify` is production, and a migration plus a
full round of smoke/RLS testing (with disposable test data, since cleaned
up) ran against it in the belief it was staging. `check:supabase-env`
performed exactly as designed (it enforces that *an* explicit confirmation
happened; it cannot verify that the confirmation itself is correct). See
"Procedure — confirming staging" below, which now reflects the lesson: a
verbal answer alone is not enough, cross-check against a dashboard detail
that cannot also be mistaken by the same person in the same way.

**Update, 2026-07-10 — a real staging project now exists.** A new Supabase
project, `portify-staging`, was created in the same organization as
`portify` (region `eu-west-1`, matching production), specifically to close
the gap described above. As of this writing:

- **`portify`** — production (`ACTIVE_HEALTHY`, `eu-west-1`). Unchanged.
- **`portify-staging`** — the new project (`ACTIVE_HEALTHY`, `eu-west-1`,
  masked ref `pqsl****ojgjd`). **Empty** at creation — no migration had been
  applied to it, and no production data was copied into it.
- **`portifyv1`** — unchanged, still `INACTIVE`, still not staging, still
  not used for anything.

This closes the *naming* half of the gap (a project that actually satisfies
the naming convention below now exists). See
`docs/import-audit-migration-runbook.md`'s "Production validation log" for
the dated record of this creation.

**Update, 2026-07-10 (later the same day) — staging bootstrapped and
linked.** `portify-staging` is no longer empty or unlinked:

- **Linked from this repo.** `supabase/.temp/linked-project.json` now points
  at `portify-staging` (ref `pqsl****jgjd`), and
  `npm run check:supabase-env -- --target=staging` passes cleanly against
  it.
- **Base schema applied** (`supabase-schema.sql` +
  `supabase-migration-asset-scores.sql`, via the Supabase MCP connector —
  `npx supabase link`'s non-interactive DB-password prompt still can't be
  answered in this environment, same finding as every prior session).
- **A schema gap vs. production was found and partially closed** — see
  `docs/import-audit-migration-runbook.md`'s "`portify-staging` bootstrap"
  entry for the full detail: a blocking `investment_plans.monthly_amount` vs.
  `amount` mismatch was fixed (with explicit sign-off) since it prevented
  *any* new user from finishing onboarding; several `profiles` columns and
  the `investor_profiles` view are still missing and documented as a known,
  unfixed gap.
- **Smoke-tested for real**, in a browser, against staging: full
  registration → PIN → onboarding flow, an XTB import (`buy`,
  `withholding_tax`, `deposit`, `interest_tax`, one invalid row, one
  duplicate re-upload), and a two-user RLS check (SQL session simulation) —
  all passed. Test data was deliberately **kept**, not cleaned up — unlike
  the production incident, staging exists specifically to hold this kind of
  disposable data.
- `.env.local` was temporarily pointed at staging for the browser test and
  reverted to production values before finishing; never committed.

## Objective

Prevent a migration, a type regeneration, or any other write-shaped Supabase
operation from ever running against the wrong project — most dangerously,
against production while believing it's staging — by requiring the
environment to be **explicitly and unambiguously identified** before the
operation is allowed to proceed, rather than inferred from whatever
`.env.local` happens to be loaded at the time.

## The three expected environments

| Environment | Purpose | Migrations allowed? |
|---|---|---|
| **local** | A developer's own machine — either no real Supabase project at all (most work here is against mocked/hardcoded data, see `CLAUDE.md`), or a local Supabase stack (`supabase start`) with disposable data. | Yes, freely — nothing here is shared or persistent in a way that matters. |
| **staging** | A real, separate Supabase project used to validate migrations and end-to-end flows against real Postgres/RLS/Auth before touching production. Disposable-ish data, but shared across whoever is testing. | Yes, always **first**, and only after the confirmation procedure below. |
| **production** | The real Supabase project backing the deployed app and its real users. | Only after staging has been validated, and only with the explicit production procedure below (backup/rollback plan, explicit confirmation flag). |

## Fundamental rule

**A migration may only be applied — and `database.types.ts` may only be
regenerated against a real project — when the target environment is
identified unambiguously.** "Unambiguous" means both of these are true:

1. `SUPABASE_ENVIRONMENT` is set to exactly one of `local` / `staging` /
   `production` (see below) — not inferred from the project's name, not
   assumed from context.
2. The project actually being pointed at (via `SUPABASE_PROJECT_REF` and/or
   whatever `supabase link` last recorded) is one you have manually
   confirmed corresponds to that environment — see "Procedures" below.

If either of these is missing, **the operation must abort**, not proceed
with a warning. See [scripts/check-supabase-environment.mjs](../scripts/check-supabase-environment.mjs)
(`npm run check:supabase-env`), which enforces exactly this before a human
runs any of the sensitive commands in the migration runbook.

## Naming convention

Every real (non-local) Supabase project should satisfy **at least one** of:

- The project's **name**, as shown in the Supabase dashboard, contains
  `staging` or `prod`/`production` (e.g. `portify-staging`,
  `portify-production`) — so a human glancing at the dashboard can't
  confuse the two.
- An explicit `SUPABASE_ENVIRONMENT` variable is set in the environment
  actually running the command, and matches what's expected.

**Neither is true** for `portify`, the project currently configured in this
repository's `.env.local` — it's named just `"portify"`, and no
`SUPABASE_ENVIRONMENT` has ever been set for it. That's exactly the
ambiguous state this document and its guardrail script exist to catch and
block, not silently work around. `portify-staging` (created 2026-07-10, see
above) does satisfy the naming convention, but nothing in this repo points
at it yet — `.env.local` still points at `portify`.

## Recommended environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (app won't build/run meaningfully without it) | The project's API URL. Already documented in `.env.local.example`/`DEPLOY.md`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | The project's public anon key. Same as above. |
| `SUPABASE_PROJECT_REF` | Recommended | The project's short ref (the subdomain in its URL, e.g. `abcd1234`). Lets tooling cross-check against `supabase/.temp/linked-project.json` without parsing the URL. |
| `SUPABASE_ENVIRONMENT` | **Required for any sensitive operation** | One of `local` / `staging` / `production` — see below. Not read by the Next.js app itself (no runtime behavior changes based on it); it exists purely for the guardrail script and human process below. |

### Allowed values for `SUPABASE_ENVIRONMENT`

Exactly one of:
- `local`
- `staging`
- `production`

Any other value (typo, blank, `prod`, `dev`, etc.) is treated as **invalid**,
not as a best-effort guess — see the guardrail script's behavior below.

## Security policy

- **Never use the service role key (`SUPABASE_SERVICE_ROLE_KEY`) in any
  client-side code.** It's already server-only in this codebase (see
  `.env.local.example`'s comment on it, and `app/api/account/delete`, its
  only current consumer) — this rule doesn't change anything, it just makes
  it explicit.
- **Never commit `.env.local`.** It's already gitignored; this is a
  reminder, not a new mechanism.
- **Never write a real secret (anon key, service role key, JWT secret,
  database URL/password, or a full unmasked project ref) into any doc,
  script output, or log.** When a project ref must appear in output for
  debugging, mask it (e.g. `abcd****wxyz` — first/last 4 characters only).
  `scripts/check-supabase-environment.mjs` does this automatically; do the
  same by hand in runbook entries (see the "Production validation log"
  pattern in [import-audit-migration-runbook.md](import-audit-migration-runbook.md)).
- **Never apply a migration if `SUPABASE_ENVIRONMENT` is absent.** No
  default, no "assume local if unset" — an unset variable means the
  operator hasn't gone through the confirmation procedure, full stop.
- **Never apply a migration if the project ref doesn't match the expected
  environment.** If `SUPABASE_PROJECT_REF` (or the linked project ref) was
  confirmed for staging yesterday, and today it points somewhere else, that
  is itself a reason to stop and re-confirm — refs can and do change when a
  developer runs `supabase link` against a different project for an
  unrelated reason.

## Procedure — confirming staging

**Retrospective, 2026-07-11:** on 2026-07-10, this procedure was not
actually followed to the letter — step 2 below was skipped (`"portify"`
does not contain `staging` anywhere, and it was not renamed before
proceeding) and step 4 had nothing to cross-check against (no production
ref had ever been recorded either, since this was the first project this
repository ever confirmed as *anything*). A verbal "yes, that's staging"
was accepted on its own. The result: a migration and a full smoke-test round
ran against production. Steps 2 and 4 below are now written as **hard
blockers**, not suggestions, precisely because of this.

Before running any command against a project as "staging" (including
running the guardrail script with `--target=staging`), a human must:

1. **Confirm the project ref in the Supabase dashboard** — open the target
   project's dashboard, note the ref (Settings → General), and check it
   matches `SUPABASE_PROJECT_REF`/`supabase/.temp/linked-project.json`.
2. **Confirm the project name actually contains `staging`.** If it doesn't,
   **stop and rename it in the dashboard first** (a safe, reversible,
   non-data operation) — do not proceed on a verbal assurance alone. A
   project named plainly (e.g. `"portify"`) is not staging until it's
   renamed; treating it as staging anyway is exactly what went wrong on
   2026-07-10.
3. **Confirm the URL** — `NEXT_PUBLIC_SUPABASE_URL`'s host should match the
   ref confirmed in step 1.
4. **Confirm this is *not* production** — cross-check against the known
   production project ref, recorded in the runbook's "Production validation
   log" ([import-audit-migration-runbook.md](import-audit-migration-runbook.md#production-validation-log))
   once one exists. **If no project has ever been confirmed as production
   yet, that is not license to assume the current one isn't it** — ask the
   person who actually administers the Supabase organization, in a way that
   requires them to look something up (dashboard, billing, DNS) rather than
   just answer from memory.
5. **Record the confirmation** in the runbook's "Production validation log"
   ([import-audit-migration-runbook.md](import-audit-migration-runbook.md#production-validation-log))
   — masked ref, project name, date, who confirmed it. This is what makes
   the next person's job step 1 "read the log" instead of "repeat this
   whole procedure from scratch." (Yes, "Production validation log" is the
   right link even for a *staging* confirmation — see that file's top note
   for why there's only one log, not a staging/production pair.)

Only after all five are done should `SUPABASE_ENVIRONMENT=staging` actually
be exported and `npm run check:supabase-env -- --target=staging` be run.

## Procedure — confirming production

Everything in the staging procedure, plus:

- **Require explicit manual confirmation from a human**, not just an
  environment variable — the guardrail script requires an additional
  `--confirm-production` flag on top of `SUPABASE_ENVIRONMENT=production
  --target=production`, specifically so that a copy-pasted command from a
  staging run can't silently also apply to production (the flag has to be
  added on purpose, every time).
- **Require a backup or rollback plan to exist before the migration runs.**
  For this specific migration, see
  [import-audit-migration-runbook.md](import-audit-migration-runbook.md#rollback-manual)'s
  "Rollback (manual)" section — confirm PITR is enabled or a fresh
  `pg_dump` exists for the production project specifically, not just "a
  backup exists somewhere."
- **Require `database.types.ts` to be regenerated against production
  immediately after the migration is applied there** — even though staging
  was already regenerated, production's copy can still drift (extensions,
  Postgres version, or manual dashboard changes that differ between
  projects) — see "Regenerating `database.types.ts`" in the runbook.

## Handling an ambiguous environment

If, at any point, the environment cannot be unambiguously identified as one
of local/staging/production (the exact situation discovered in
`chore/staging-import-audit-validation` — see the runbook's "Production
validation log"):

1. **Abort.** Do not proceed with the operation "just this once" or "to see
   what happens." `scripts/check-supabase-environment.mjs` enforces this
   automatically for anything that calls it; for anything that doesn't
   (e.g. a manual SQL Editor session), the same rule applies by hand.
2. **Document the block** — add or update an entry in the runbook's
   "Production validation log" explaining exactly what was ambiguous
   (missing `SUPABASE_ENVIRONMENT`? project ref mismatch? no staging/prod
   naming at all?), following the same format as the existing entries.
3. **Ask the project owner to resolve the ambiguity** — typically by
   creating/naming a proper staging project and recording its ref, or by
   setting `SUPABASE_ENVIRONMENT` correctly for the environment actually
   running the command. This is a one-time, low-risk fix (naming/creating a
   project, not touching data) that unblocks every future migration for
   this feature and any other schema change going forward.

## What this document deliberately does not do

- It does not create a staging project — that's a manual step for whoever
  owns the Supabase organization (see "Handling an ambiguous environment"
  above).
- It does not change any runtime behavior of the app — `SUPABASE_ENVIRONMENT`
  is read only by the guardrail script (`scripts/check-supabase-environment.mjs`),
  never by `lib/supabase/client.ts`/`server.ts` or any page/API route.
- It does not store the production project's ref anywhere in this repo,
  deliberately (see "Confirm this is *not* production" above).
