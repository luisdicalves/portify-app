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

## Recommended order of application

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

Manual, against the deployed staging app, after the migration is applied:

1. Log in as a test user with no existing transactions.
2. Go to **Perfil → Definições → Importar Portfólio**.
3. Upload a small CSV (`ticker,units,avg_price` — e.g. 2–3 rows) or a small
   XTB "CASH OPERATION HISTORY" export.
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
     (`select import_id, count(*) from transactions where user_id = '<test-user>' group by import_id;`).
6. Repeat the import with a file containing a **withholding-tax** row
   (`withholding_tax` transaction type) — confirms the constraint fix; this
   would have failed with the pre-migration `transactions_type_check`.
7. Re-upload the **same** file again — confirm rows are flagged
   `'duplicate'` in the preview and are not re-imported (per
   [import-xtb.md](import-xtb.md#duplicate-policy)), and that a new audit log
   row is still created (`status: 'completed'`, `imported_rows: 0`, since
   there was nothing eligible to write — see "Status lifecycle" in
   import-xtb.md).
8. Optional: temporarily revoke the app's ability to reach
   `import_audit_logs` (e.g. test against a project where the migration has
   *not* yet been applied) and confirm the import aborts with the friendly
   `impAuditFailed` message and writes nothing — this is the same scenario
   already covered by the `e2e/notifications.spec.ts` test
   ("import audit log failure renders styled error banner and saves
   nothing"), just re-confirmed against a real backend instead of a mocked
   route.

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
