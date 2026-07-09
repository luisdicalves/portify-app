# Import audit log — migration runbook

How to apply the `import_audit_logs` schema change (import-audit-log feature)
to a real Supabase environment (staging or production), verify it landed
correctly, and roll it back if needed. See
[import-xtb.md](import-xtb.md#audit-log-persistente) for what the feature
does and why; this document is only about the migration's operational side.

**As of this writing, this migration has not been applied to any real
Supabase project by this task.** No Supabase access (staging or production)
was performed while preparing this runbook — everything below was validated
by static review only (see "What was and wasn't validated").

## Objective

Every *confirmed* XTB/CSV import must create a row in
`public.import_audit_logs` before writing any `holdings`/`transactions`, and
update it to a final status once the write is known. The app already enforces
this in code (`app/profile/settings/page.tsx`, `lib/db/importAudit.ts`) — if
`import_audit_logs` doesn't exist yet in a given environment, every import in
that environment currently fails closed (aborts, nothing saved, friendly
error shown). This migration is what makes imports work again in that
environment; until it's applied, the *safe-but-broken* state is expected and
correct.

## Files involved

| File | Role |
|---|---|
| [supabase-migration-import-audit-log.sql](../supabase-migration-import-audit-log.sql) | The migration itself — run this in the target project's SQL Editor. |
| [supabase-schema.sql](../supabase-schema.sql) | Consolidated fresh-install schema (already includes `import_audit_logs` and `transactions.import_id`). Use this only when bootstrapping a brand-new project; don't re-run it against an existing one. |
| [lib/supabase/database.types.ts](../lib/supabase/database.types.ts) | TypeScript types generated from the schema. Updated **manually** for this feature (no access to a real project when it was written) — must be regenerated for real once the migration is applied (see below). |
| [lib/db/importAudit.ts](../lib/db/importAudit.ts) | All persistence logic (`createImportAuditLog`/`completeImportAuditLog`/`failImportAuditLog`/`listImportAuditLogs`/`getImportAuditLog`). |
| [scripts/check-import-audit-schema.mjs](../scripts/check-import-audit-schema.mjs) (`npm run check:schema`) | Static text-based consistency check across the three files above. No DB access. Run it any time one of those three files changes. |

## Prerequisites

- Access to the target Supabase project's SQL Editor (staging first, always).
- The Supabase CLI, if you intend to regenerate types (`npx supabase login` /
  `npx supabase link`) — not required just to apply the SQL by hand.
- A recent `pg_dump` or Supabase's own point-in-time backup available for the
  target project, in case rollback is needed (see below). Supabase Pro+
  projects have PITR; free-tier projects should be manually backed up first.

## Environment confirmation gate

**Before running anything in "Recommended order of application" below,**
confirm the target environment is unambiguous. See
[docs/supabase-environments.md](supabase-environments.md) for the full
policy this enforces — this section is just the checklist.

1. Run the guardrail script for the environment you intend to target:
   ```bash
   npm run check:supabase-env -- --target=staging
   # or, for production:
   npm run check:supabase-env -- --target=production --confirm-production
   ```
   This fails (exit 1) if `SUPABASE_ENVIRONMENT` is unset/invalid, if
   `--target` doesn't match it, if `production` is requested without
   `--confirm-production`, or if `SUPABASE_PROJECT_REF` disagrees with
   `supabase/.temp/linked-project.json`. It never prints an unmasked project
   ref. **Do not proceed past a failing result** — fix the underlying
   ambiguity (see "Handling an ambiguous environment" in
   supabase-environments.md), don't just re-run with different flags until
   it happens to pass.
2. Manually confirm, in the Supabase dashboard (the script cannot verify
   these on its own):
   - **Project ref** matches what `SUPABASE_PROJECT_REF`/the linked project
     reports.
   - **Project name** — should contain `staging` or `prod`/`production` per
     the naming convention; if it doesn't yet, this is itself a blocker (see
     below).
   - **Dashboard URL** — matches the ref/name above.
   - **Owner** — you know who administers this project and that it's the
     one actually meant for this purpose.
   - **Environment** — cross-checked against the runbook's "Staging
     validation log" below, or added as a new entry there if this is the
     first time this project is being confirmed.
3. **Abort** (do not apply the migration) if any of the following is true:
   - The environment is ambiguous by any of the checks above.
   - The only project available is the one named plainly `"portify"` (the
     exact situation found in this repository as of 2026-07-09 — see
     "Staging validation log") — that project has not been confirmed as
     staging by this procedure and must not be treated as such.
   - There's no clear staging/production separation at all.
   - `lib/supabase/database.types.ts` cannot be regenerated against the
     confirmed environment immediately after applying the migration (if type
     regeneration isn't possible, the migration shouldn't be applied yet
     either — see "Regenerating `database.types.ts`" below).

## Recommended order of application

0. Complete the "Environment confirmation gate" above — do not start here.
1. **Staging first.** Never apply directly to production.
2. Take a backup / confirm PITR is available for the target project.
3. Open the target project's Supabase SQL Editor.
4. Run [supabase-migration-import-audit-log.sql](../supabase-migration-import-audit-log.sql) in full, top to bottom, in one execution. It is written to be
   safe to run more than once (see "Idempotency" below), so a partial failure
   followed by a retry is not destructive.
5. Run the verification queries (see "Post-migration validation").
6. Regenerate `lib/supabase/database.types.ts` against the now-migrated
   project (see below) and commit the regenerated file in its own commit/PR.
7. Run the functional smoke test (see below) against staging.
8. Only after staging looks correct, repeat steps 2–7 against production.

## Idempotency

The migration is written to be safely re-runnable:

- `create table if not exists` — won't error if the table already exists.
- `create index if not exists` — same.
- `alter table ... add column if not exists` — same, for `transactions.import_id`.
- `drop policy if exists` before every `create policy` — re-creating a policy
  doesn't error on a second run.
- `drop constraint if exists` before `add constraint` for the
  `transactions_type_check` widening — same reasoning.

There is no `down` migration file. Every statement is either additive
(`create ... if not exists`) or a constraint/policy replacement
(`drop ... if exists` + `create`/`add`) — nothing in this migration drops a
column or a table, so there's nothing that needs an automatic reversal.
Rollback (see below) is a manual, deliberate action, not a scripted inverse.

## Regenerating `database.types.ts`

`lib/supabase/database.types.ts` was updated **by hand** in the same task
that wrote this migration, because no real Supabase project was reachable
from that environment. Treat it as a best-effort draft, not a verified
artifact, until it's regenerated against the real, migrated project:

```bash
npx supabase login
npx supabase link --project-ref <target-project-ref>
npx supabase gen types typescript --linked > lib/supabase/database.types.ts
```

(Or, without linking, `npx supabase gen types typescript --project-id <ref> --schema public > lib/supabase/database.types.ts` using a personal access token.)

After regenerating, diff it against the current file. Expect it to match
almost exactly for `import_audit_logs`/`transactions.import_id` — a
meaningful diff there is a signal that the hand-written version drifted from
what was actually applied, and should be investigated before committing.

## Post-migration validation

Run these in the same SQL Editor, against the just-migrated project:

```sql
-- Table exists
select table_name from information_schema.tables where table_name = 'import_audit_logs';

-- All expected columns are present
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'import_audit_logs'
order by ordinal_position;

-- transactions.import_id exists and is nullable
select column_name, is_nullable
from information_schema.columns
where table_name = 'transactions' and column_name = 'import_id';

-- RLS policies: select/insert/update present, no delete policy
select policyname, cmd from pg_policies
where tablename = 'import_audit_logs' order by cmd;

-- status check constraint accepts only the four known values
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.import_audit_logs'::regclass and contype = 'c';

-- transactions type check now accepts withholding_tax
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.transactions'::regclass and conname = 'transactions_type_check';
```

Expected results:

- `import_audit_logs` has exactly 20 columns: `id`, `user_id`, `parser_name`,
  `parser_version`, `filename`, `file_hash`, `status`, `total_rows`,
  `valid_rows`, `invalid_rows`, `duplicate_rows`, `imported_rows`,
  `skipped_rows`, `warning_count`, `error_count`, `summary`, `warnings`,
  `errors`, `created_at`, `completed_at`.
- `pg_policies` returns exactly 3 rows for `import_audit_logs`: `select`,
  `insert`, `update`. **No `delete` row — this is intentional**, not a gap.
- `transactions.import_id` is nullable (`is_nullable = 'YES'`).
- The `status` check constraint's definition includes exactly
  `'pending', 'completed', 'partial', 'failed'`.
- The `transactions_type_check` definition includes `'withholding_tax'`
  (in addition to the pre-existing values, including `'wht'`, which is kept
  for backward compatibility with any existing rows).

Also acceptable as a quick sanity pass, without SQL access: run
`npm run check:schema` locally — it re-confirms the migration/schema/types
files agree with each other (it does **not** touch the real database; it's a
static text check, complementary to the queries above, not a replacement).

## Functional smoke test (staging)

Manual, against the deployed staging app, after the migration is applied.
Use two separate test accounts (**user A**, **user B**) — user B is only
needed for the RLS checklist further down, not for steps 1–9 below.

1. Log in as **user A**, a test user with no existing transactions.
2. Go to **Perfil → Definições → Importar Portfólio**.
3. **Valid file:** upload a small CSV (`ticker,units,avg_price` — e.g. 2–3
   rows) or a small XTB "CASH OPERATION HISTORY" export.
4. Click **Analisar ficheiro** — confirm the preview shows the expected row
   counts (nothing written to the DB yet at this point).
5. Click **Importar**. Confirm:
   - A completion toast appears referencing an audit log ID
     (`impRegisteredWithId`).
   - **Últimas importações** (last-5 list) shows the new entry with the
     correct filename/status/row counts.
   - In the SQL Editor: `select * from import_audit_logs order by created_at desc limit 1;`
     shows `status = 'completed'`, `imported_rows` matching what the toast said.
   - The imported transactions have `import_id` set to that row's `id`
     (`select import_id, count(*) from transactions where user_id = '<user-a-id>' group by import_id;`).
6. **Invalid rows:** upload a file with at least one row that fails
   validation (e.g. a "CASH OPERATION" row with an unrecognized `Type`, or a
   `buy` row missing units/price). Confirm the preview marks that row
   `'error'` with a reason, **"Importar" still only writes the valid rows**,
   and the audit log's `invalid_rows`/`error_count` reflect the bad row(s)
   (`status` should still be `'completed'` if at least the valid rows made
   it in — an all-invalid file is `'completed'` with `imported_rows: 0`, not
   `'failed'`; see "Status lifecycle" in import-xtb.md).
7. **Internal duplicates:** upload a file where two rows resolve to the same
   `[date, type, ticker, units, price, amount]` key (see
   [import-xtb.md](import-xtb.md#duplicate-policy)). Confirm the preview
   flags the later row(s) `'duplicate'`, only the first occurrence is
   imported, and the audit log's `duplicate_rows` count matches.
8. **Withholding tax:** repeat the import with a file containing a
   **`withholding_tax`** row — confirms the `transactions_type_check` fix;
   this row would have failed the pre-migration constraint (`'wht'`-only).
9. **`interest_tax` and `deposit`:** repeat with a file containing an
   `interest_tax` row and a `deposit` row (no ticker on either) — confirm
   both import without error and appear correctly in **Actividade**.
   `'wht'` itself is **not producible through the import UI** — the parser
   (`normalizeXtbTransactionType()` in `lib/holdingsImport.ts`) only ever
   emits `'withholding_tax'`; `'wht'` is kept in the DB check constraint
   purely for backward compatibility with rows written before that naming
   was standardized (see "Known risks" below for the one place this matters:
   `portfolioState.ts` doesn't recognize a `'wht'`-typed row either). There is
   nothing to test here beyond confirming the constraint still *accepts*
   `'wht'` (covered by the post-migration validation query above) — don't
   try to manufacture a `'wht'` row through the UI, it can't happen.
10. **Persistent duplicate (same file, re-imported):** re-upload the
    **same** file from step 5 again — confirm rows are flagged `'duplicate'`
    in the preview and are not re-imported (checked against the user's
    already-saved transactions this time, not just within-file), and that a
    **new** audit log row is still created (`status: 'completed'`,
    `imported_rows: 0`, since there was nothing eligible to write).
11. **Unmigrated DB simulation:** if you have access to a *second*,
    not-yet-migrated staging-like project (or can temporarily revoke the
    app's grants on `import_audit_logs` in a disposable project), point the
    app at it and confirm the import aborts with the friendly
    `impAuditFailed` message and writes nothing. This is the same scenario
    already covered by the `e2e/notifications.spec.ts` test ("import audit
    log failure renders styled error banner and saves nothing"), just
    re-confirmed against a real backend instead of a mocked route. Skip this
    step if no such environment exists — the e2e test is the fallback
    coverage.

## RLS checklist (staging, two users)

Requires two distinct authenticated test accounts, **user A** and **user
B**, each with at least one completed import from the smoke test above.
Run as each user (either through the app while logged in as that user, or
via the SQL Editor using `set local role authenticated; set local request.jwt.claim.sub = '<user-id>';`
to simulate their session — the app-level check is the one that actually
matters, the SQL Editor version is a faster way to iterate).

- [ ] **User A cannot see user B's imports.** As user A,
      `select * from import_audit_logs where user_id = '<user-b-id>';`
      returns zero rows (RLS `select` policy scopes to `auth.uid() = user_id`).
      In the app, user A's **Últimas importações** list never shows user B's
      filenames.
- [ ] **User A cannot update user B's imports.** As user A,
      `update import_audit_logs set status = 'failed' where user_id = '<user-b-id>';`
      affects **0 rows** (RLS `update` policy's `using`/`with check` both
      require `auth.uid() = user_id`) — it should not error outright with
      most Supabase clients, it should just silently match nothing.
- [ ] **Delete is not permitted, for anyone.**
      `delete from import_audit_logs where user_id = '<own-user-id>';` (as
      that same user) affects **0 rows** — there is deliberately no `delete`
      policy, and RLS-enabled tables block any command with no matching
      policy by default, including deleting your own rows.
- [ ] **`transactions.import_id` is recorded correctly and stays scoped per
      user.** After user A's import, `select id, import_id from transactions where user_id = '<user-a-id>' and import_id is not null;`
      shows the expected rows, all pointing at an `import_audit_logs.id`
      that also belongs to user A (`import_id` is just a foreign key value —
      it does not bypass `transactions`' own RLS policy, which is what
      actually gates every read/write on that table; see
      [import-xtb.md](import-xtb.md#audit-log-persistente) "No
      cross-user leakage").

## Rollback (manual)

There is no automatic down-migration. If the feature needs to be reverted
after being applied:

1. **Prefer disabling the feature in the app over dropping the schema.**
   The schema change alone (an extra table + a nullable FK column + a widened
   check constraint) is inert if the app stops calling `createImportAuditLog`
   — reverting `app/profile/settings/page.tsx` to not call the audit-log
   functions (or redeploying a previous build) is lower-risk than a
   destructive SQL rollback, and buys time to investigate.
2. If the schema genuinely needs to be reverted:
   ```sql
   -- Only if you are certain no other code depends on these:
   alter table public.transactions drop constraint if exists transactions_type_check;
   alter table public.transactions add constraint transactions_type_check
     check (type in ('buy','sell','dividend','deposit','interest','wht','interest_tax'));
   -- (this re-narrows the constraint to the pre-migration set — will start
   -- rejecting new 'withholding_tax' rows again; existing rows are untouched)

   alter table public.transactions drop column if exists import_id;
   drop table if exists public.import_audit_logs;
   ```
3. **Data loss warning:** dropping `import_audit_logs` deletes every audit log
   row ever written. `transactions.import_id` values are lost when the column
   is dropped (the transactions themselves are not deleted — only the FK
   linking them to their audit log). Confirm this is genuinely wanted, and
   that a backup/PITR snapshot from before the rollback exists, before
   running step 2.
4. After a schema rollback, `lib/supabase/database.types.ts` and the app code
   would need to be rolled back too (or the app will start failing every
   import again, the same as an unmigrated environment) — coordinate the
   schema rollback with a code deploy, don't do just one.

## Troubleshooting / mitigation

**If the migration fails partway through the SQL Editor run:**
- Re-run the whole file from the top. Every statement in it is guarded
  (`if not exists`/`if exists`/`drop ... if exists` before `create`/`add`),
  so re-running after a partial failure is safe — it picks up wherever it
  left off rather than erroring on "already exists".
- If a specific statement keeps failing, run the "Post-migration validation"
  queries above to see exactly what state the schema is actually in before
  retrying, rather than guessing.
- If the failure looks like a permissions error (not a syntax/constraint
  error), confirm you're running the SQL Editor as the project owner/service
  role, not a restricted role.

**If the app shows the "audit log unavailable" error
(`impAuditFailed`) in a supposedly-migrated environment:**
- Open the browser console — `createImportAuditLog failed: ...` is logged
  there with the real Supabase error (see `app/profile/settings/page.tsx`),
  which is not shown to the user by design.
- Most likely causes, in order of likelihood: (1) migration genuinely
  wasn't applied to *this* project/environment (double-check
  `NEXT_PUBLIC_SUPABASE_URL` points where you think it does), (2) RLS
  rejected the insert because the authenticated session's `auth.uid()`
  doesn't match the `userId` being sent (stale session, or `useUser()`
  resolved to a stale/mismatched id — check the session in the same
  browser tab), (3) a real transient Supabase outage.
- The app's behavior in all three cases is identical and correct: abort,
  write nothing, show the friendly message. No further mitigation is needed
  on the data-integrity side — this is fixing availability, not safety.

**How to confirm no transaction was ever written without a matching audit
log (data-integrity spot-check, any time):**
```sql
-- Should always return zero rows: a transaction written by an import
-- (external_id not null, i.e. came from a parsed file, not a manual trade)
-- with no import_id at all would mean the invariant broke somewhere.
-- Manually-entered trades (external_id is null) are expected to have
-- import_id = null and are correctly excluded by this filter.
select count(*) from transactions
where external_id is not null and import_id is null;

-- Should always return zero rows: an import_audit_logs row stuck in
-- 'pending' for a long time (older than a few minutes) means confirmImport()
-- crashed between creating the audit log and calling complete/failImportAuditLog
-- — the try/catch in confirmImport() should prevent this, but this query is
-- the fast way to notice if it ever does happen.
select id, user_id, filename, created_at from import_audit_logs
where status = 'pending' and created_at < now() - interval '10 minutes';
```

## Known risks

- **`database.types.ts` was hand-written, not generated.** Until it's
  regenerated against a real migrated project (see above), there's a
  (currently believed low, but unverified) risk of a subtle type mismatch —
  e.g. a column's nullability or default not exactly matching what Postgres
  actually enforces. `npm run check:schema` only checks textual presence of
  fields, not their exact types/nullability against a live schema.
- **No automated test exercises the migration SQL itself.** This task's
  validation was static (read-through comparison of the migration, the
  consolidated schema, and the types file — see "What was and wasn't
  validated"), not an actual `psql`/Supabase run. The SQL has not been
  executed anywhere as part of preparing this runbook.
- **The `transactions_type_check` widening is a live-traffic-affecting
  change**, not purely additive: it's a `drop constraint` + `add constraint`
  on an existing table. On a large `transactions` table this is normally a
  fast metadata-only operation in Postgres (no full table rewrite, since it's
  a check constraint, not a type change) but it does take a brief lock —
  apply outside of a peak-traffic window on production if the table is large.
- **RLS depends entirely on `auth.uid()` matching `user_id` at write time.**
  If any future code path calls `createImportAuditLog`/`completeImportAuditLog`/
  `failImportAuditLog` with a `userId` that doesn't match the authenticated
  session, the insert/update will be silently rejected by RLS (0 rows
  affected, not necessarily a thrown error depending on the client) rather
  than writing to the wrong user's row — this is the intended fail-closed
  behavior, but worth knowing if a future symptom looks like "audit log
  silently didn't update."
- **`'wht'` is a DB-only legacy value, unhandled by `portfolioState.ts`.**
  `transactions_type_check` accepts `'wht'` (kept for backward compatibility
  with rows written before the app standardized on `'withholding_tax'`), but
  `lib/portfolio/portfolioState.ts`'s `TransactionType` union and its
  ledger-replay `switch`/`if` chain only recognize `'withholding_tax'`, not
  `'wht'` — a legacy `'wht'`-typed row would silently not contribute to
  `taxWithheld`/`cashBalance` if it ever reached that code path (it's
  currently only reached when `transactions: []` is *not* passed, which none
  of Dashboard/Portfolio/For You do today — see
  [current-state.md](current-state.md)). This is a **pre-existing
  characteristic of any `'wht'`-labeled legacy row**, not something
  introduced by the import-audit-log migration, and out of scope for this
  task to fix (`portfolioState.ts` is explicitly off-limits — see
  [model-map.md](model-map.md)). No current code path writes `'wht'`; the
  import parser (`normalizeXtbTransactionType()`) only ever produces
  `'withholding_tax'`. Flagging here so it isn't mistaken for a regression
  if it's ever noticed downstream.
- **The `holdings` upsert in `confirmImport()` isn't checked for errors.**
  `app/profile/settings/page.tsx`'s `confirmImport()` awaits
  `supabase.from('holdings').upsert(...)` but doesn't inspect its `.error` —
  if that specific call fails (network blip, RLS misconfiguration) while the
  audit log and transactions writes both succeed, the audit log will report
  `'completed'` even though the holdings snapshot wasn't actually updated.
  This is a **pre-existing gap in `confirmImport()`, not introduced by this
  task**, and fixing it would mean changing the import write path itself —
  out of scope here (this task's brief is schema/docs/copy, not import
  behavior). Noted so it's a known, not a surprise.

## What was and wasn't validated

**Validated (static, no Supabase access):**
- Full field-by-field comparison of `supabase-migration-import-audit-log.sql`,
  `supabase-schema.sql`, and `lib/supabase/database.types.ts` — all 20
  `import_audit_logs` columns, the `status` check values, both foreign keys
  (`import_audit_logs.user_id → profiles(id)`,
  `transactions.import_id → import_audit_logs(id) on delete set null`), both
  indexes, and all three RLS policies (select/insert/update, no delete) are
  consistent across the three files. No divergence found; no fix was needed.
- `npm run check:schema` (new) automates the same textual cross-check.
- Read-through of `lib/db/importAudit.ts` and `app/profile/settings/page.tsx`
  confirms the app aborts the import (writes nothing) if
  `createImportAuditLog` fails, matching the migration's fail-closed design
  intent.
- The existing `e2e/notifications.spec.ts` test
  ("import audit log failure renders styled error banner and saves nothing")
  already exercises this abort path against a mocked 500 response simulating
  an unmigrated database.
- The `transactions_type_check` constraint was confirmed (by reading
  `lib/holdingsImport.ts`, `lib/portfolio/portfolioState.ts`, and
  `components/ui/TransactionCard.tsx`) to cover every transaction type the
  app actually produces or reads (`buy`, `sell`, `dividend`, `deposit`,
  `interest`, `withholding_tax`, `interest_tax`), plus the legacy-only
  `'wht'` — see "Known risks" above for the one place `'wht'` isn't
  recognized downstream (`portfolioState.ts`, pre-existing, out of scope).
- `npm run check:schema` was extended (this task) to also statically check:
  RLS is enabled with select/insert/update policies and no delete policy on
  `import_audit_logs`, no raw-file-content column exists, all 7 required
  transaction types are present in the `transactions_type_check` definition,
  and all the docs/test files this runbook depends on actually exist.

**Not validated (pending, needs a real or local Postgres/Supabase instance):**
- Actually executing the migration SQL against any Postgres instance (local
  or remote) — the Supabase CLI is not installed in the environment this
  runbook was written in, and the local Docker daemon was not running.
  Starting either was avoided deliberately, per this task's scope (no heavy
  service installs without a clear need, no real Supabase access without
  explicit instruction).
- Constraint-violation behavior under a real engine (e.g. confirming the
  `status` check actually rejects an out-of-whitelist value, confirming
  `user_id not null` actually rejects a missing value) — believed correct by
  inspection (standard Postgres `check`/`not null` semantics, nothing exotic
  in the DDL), but not empirically exercised in this task.
- Regenerating `database.types.ts` against a real project.
- The functional smoke test above, against a real staging deploy.

## Checklist before production

See [release-checklist.md](release-checklist.md#import-audit-log-release-checklist)
for the full pre-production checklist.
