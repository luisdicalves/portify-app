# Import audit log — migration runbook

How to apply the `import_audit_logs` schema change (import-audit-log feature)
to a real Supabase environment (staging or production), verify it landed
correctly, and roll it back if needed. See
[import-xtb.md](import-xtb.md#audit-log-persistente) for what the feature
does and why; this document is only about the migration's operational side.

**Update, 2026-07-11 — environment relabeling correction.** The entries
below (originally dated 2026-07-10) described `portify` as "staging"
because its owner confirmed it as staging at the time. That confirmation was
**itself mistaken** — the owner later clarified `portify` is actually
**production**. This means:

- The migration and all validation described below were performed for real
  **against production**, not staging. Nothing needs to be re-applied — the
  work already happened, it was just mislabeled while it was happening.
- This repository still has **no real staging project** — `list_projects`
  has only ever shown `portify` (now confirmed production) and `portifyv1`
  (`INACTIVE`, never confirmed as anything). Every "staging first" step in
  this runbook was, in this one case, unintentionally skipped — there was no
  staging to go to first. See "Known risks" for what this means going
  forward.
- All test/smoke-test data created during this validation (a disposable
  test user and its holdings/transactions/audit logs) has since been
  **deleted from production** (2026-07-11, via `auth.users` cascade —
  confirmed back to exactly the pre-test row counts). See the new
  2026-07-11 entry below.

The section below is kept as "Production validation log" (renamed from its
original title, "Staging validation log") with the original entries
corrected in place —
they are **not** duplicated as a separate staging-vs-production pair, since
there was only ever one real event, against one real (production) database.

## Production validation log

Dated entries recording what was actually done against the real production
Supabase project (`portify`). Add a new entry each time this migration is
applied/re-validated — don't overwrite previous entries.

### 2026-07-10 — applied and validated against production (`portify` / masked ref `dwol****donk`), originally logged as "staging"

**Corrected 2026-07-11: this was production, not staging — see the note at
the top of this document.** Every "staging" below describes what was
believed at the time; the actual target was production throughout.

- **Environment confirmation:** the project previously flagged as ambiguous
  (named plainly `"portify"`, no staging/prod suffix — see the prior
  `chore/staging-import-audit-validation` finding) was confirmed by the
  project owner, in that conversation, as staging — **a confirmation later
  found to be incorrect; the project is production** (corrected 2026-07-11).
  `npm run check:supabase-env -- --target=staging` was run locally with
  `SUPABASE_ENVIRONMENT=staging` and `SUPABASE_PROJECT_REF` matching this
  project's masked ref, and passed — the guardrail did exactly what it was
  designed to do (block on missing/mismatched confirmation), it just can't
  detect a human confirming the *wrong* environment name in good faith.
- **Access method:** a Supabase MCP connector available in this environment
  (tools like `list_projects`/`apply_migration`/`execute_sql`/
  `generate_typescript_types`), not the `supabase` CLI's `login`/`link` flow —
  no CLI OAuth login was needed or performed. `list_projects` also revealed a
  **second** project in the same organization, `portifyv1` (ref masked
  `xqsu****opcbz`, status `INACTIVE`) — not used for anything here, noted for
  awareness only.
- **Pre-migration state:** `list_tables` confirmed `import_audit_logs` did
  not exist yet; `profiles` had 2 rows, `holdings` 16, `transactions` 130 —
  **this project already holds non-trivial real-looking data**, not an empty
  disposable database — because it's production. Proceeded anyway per the
  explicit environment confirmation given at the time (later found to be
  mistaken — see the correction note above); this pre-existing data is
  exactly why it should never have been treated as freely disposable.
- **Migration applied** via the MCP `apply_migration` tool (registers
  properly in this project's tracked migration history, consistent with how
  every prior migration on this project was applied — confirmed via
  `list_migrations` beforehand).
- **Post-migration validation:** every query in "Post-migration validation"
  below was run for real. Result: **all as expected** — `import_audit_logs`
  has exactly the 20 documented columns with matching types/nullability, RLS
  is enabled, exactly 3 policies exist (select/insert/update, no delete),
  the `status` check constraint and `transactions_type_check` (including
  `withholding_tax` and `wht`) match exactly what the migration file
  specifies, and both foreign keys (`import_audit_logs.user_id → profiles`,
  `transactions.import_id → import_audit_logs`) are in place.
- **`get_advisors` (security)** was run before and after the migration — the
  two results are identical (same pre-existing, unrelated advisories:
  `investor_profiles` security-definer view, a few `search_path`-mutable
  functions, leaked-password-protection disabled). The migration introduced
  no new advisory, in particular no missing-RLS warning for the new table.
- **Constraint enforcement, tested with real inserts** (a throwaway row was
  inserted, verified, then deleted — no lasting data): a valid insert
  succeeded; an insert with `status = 'not_a_real_status'` failed with
  Postgres error `23514` (check constraint violation); an insert omitting
  `user_id` failed with `23502` (not-null violation). All three match the
  documented expectations exactly.
- **RLS, tested with the two real pre-existing profiles** (session simulated
  via `set local role authenticated; set local request.jwt.claims`, a
  throwaway audit log + transaction row created and deleted afterward — see
  "RLS checklist" below for exactly which 5 checks were run and their
  results, all passed).
- **`database.types.ts` regenerated** via the MCP `generate_typescript_types`
  tool and compared against the file already in the repo: **byte-for-byte
  identical, zero diff.** The hand-written version from the original feature
  task was already fully accurate.
- **Functional smoke test, done for real through the actual deployed app
  code** (local dev server pointed at this project via the existing
  `.env.local`, driven through a real browser — not a mock): a fresh,
  disposable test user (`staging_rls_user_a` / `StagingTest UserA`,
  `user_id` masked `8afb****b4a0`) was registered through the real sign-up
  flow, then:
  1. **Valid generic CSV** (`ticker,units,avg_price`, 2 rows) — preview
     showed "Nenhum dado foi gravado ainda", confirmed import created audit
     log id `ef96****3b1` (`status: completed`, `imported_rows: 0` — correct
     for this path, which produces holdings not transactions), toast showed
     the ID, "Últimas importações" updated, `holdings` table confirmed to
     match the file exactly.
  2. **Rich XTB-style XLSX** ("CASH OPERATION HISTORY" sheet, 4 rows: one
     `buy`, one `withholding_tax`, one unrecognized type, one duplicate of
     the `buy` row) — preview correctly showed 2 valid / 1 error / 1
     duplicate / 1 warning, with the exact error message
     `Tipo de operação não reconhecido: "Some Unknown Operation Type"`.
     Confirming created audit log id `6e27****3f4`
     (`status: completed, total_rows: 4, valid_rows: 2, invalid_rows: 1,
     duplicate_rows: 1, imported_rows: 2, skipped_rows: 2`), and both real
     transactions were verified in the DB: `type: 'buy'` (AAPL.US, 10 units
     @150.5, `import_id` set) and **`type: 'withholding_tax'`** (MSFT.US,
     amount -5, `import_id` set) — this is the first real, end-to-end
     confirmation that `withholding_tax` writes successfully past the
     widened `transactions_type_check`.
  3. **Persistent duplicate (same file, re-uploaded)** — preview now showed
     0 valid / 3 duplicate (against the already-saved transactions from step
     2) / 1 error, with **"Nenhuma linha válida para importar."** shown and
     the **"Importar" button disabled** — see step 10 of "Functional smoke
     test" below, which this corrects.
- **`interest_tax`/`deposit` — closed the same day, second pass.** The first
  pass of this entry (above) left these two untested via the UI, reasoning
  they share `mapXtbRowToTransaction()`/the same constraint as
  `withholding_tax`. Re-checked properly rather than left as an inference:
  logged back in as the same test user (`staging_rls_user_a`), uploaded a
  second XLSX (`Deposit` + `Free funds Interest Tax` rows, no ticker on
  either, matching `normalizeXtbTransactionType()`'s exact match rules).
  Preview: 2/2 valid, 0 error, 0 duplicate, 0 warning. Confirmed import:
  "2 importadas" in **Últimas importações**. Verified directly in the
  database — both transactions written with `import_id` set to the same new
  audit log (`status: completed, total_rows: 2, valid_rows: 2,
  imported_rows: 2`): `type: 'deposit'`, `amount: 500`, `ticker: null`; and
  `type: 'interest_tax'`, `amount: -0.5`, `ticker: null`. Both exactly as
  expected. **`'wht'` remains untested and unreachable via the UI** — this
  was re-confirmed, not newly re-verified, since `normalizeXtbTransactionType()`
  simply never returns `'wht'` for any input string; producing a `'wht'`-typed
  transaction requires a direct SQL insert (already covered by the
  `transactions_type_check` constraint definition query above), not an import
  file.
- **Cleanup (original, 2026-07-10):** all throwaway rows created purely to
  exercise constraints/RLS (one `import_audit_logs` row, one `transactions`
  row) were deleted immediately after use — confirmed back to 0 extra rows.
  The smoke-test user (`staging_rls_user_a`) and its resulting data (3 audit
  log rows across both passes, 4 transactions, 3 holdings) were **left in
  place** at the time, on the belief this was disposable staging data.
- **Cleanup (corrected, 2026-07-11):** now that `portify` is known to be
  production, the smoke-test user and all its data were deleted for real —
  see the 2026-07-11 entry below for the exact query and confirmed result.

### 2026-07-11 — environment correction and production test-data cleanup

- **What changed:** the project owner clarified that `portify` is
  **production**, not staging as previously confirmed. No separate staging
  project exists in this Supabase organization (`list_projects` still shows
  only `portify` and the `INACTIVE` `portifyv1`).
- **Documentation corrected in place:** the 2026-07-10 entry above (and
  every other "staging" reference describing this specific event throughout
  this runbook and `docs/release-checklist.md`) was relabeled to production,
  with an explicit note rather than a silent edit.
- **Test data removed from production:** the disposable test user created
  during the 2026-07-10 smoke tests (`staging_rls_user_a`, `user_id` masked
  `8afb****b4a0`) and everything it owned were deleted:
  ```sql
  delete from auth.users where id = '8afb8580-...-...';  -- full id not repeated here, already masked above
  ```
  `on delete cascade` (auth.users → profiles → holdings/transactions/
  import_audit_logs) removed all of it in one statement. Verified
  immediately after: the test user's own row counts (auth.users, profiles,
  holdings, transactions, import_audit_logs) were all confirmed at **0**,
  and the project's *total* row counts returned to exactly their
  pre-validation baseline: `profiles: 2`, `transactions: 130`,
  `holdings: 16` — matching the numbers recorded in the pre-migration state
  note in the 2026-07-10 entry above. No real user's data was touched.
- **No other migration was applied.** Only the already-applied
  `supabase-migration-import-audit-log.sql` (from 2026-07-10) exists in this
  project's migration history — nothing new was applied on 2026-07-11, this
  entry is documentation and cleanup only.
- **Outstanding:** this Supabase organization still has no real staging
  environment. Every future schema change to this project is, today,
  necessarily either "validate by careful reading + local static checks
  only" or "apply directly to production" — there is no safer middle step
  until a genuine staging project exists. See "Known risks" below.

### 2026-07-10 — `portify-staging` created (closes the "outstanding" item above)

- **What was created:** a new Supabase project, name `portify-staging`,
  in the same organization as `portify` (`luisdicalves's Org`), region
  `eu-west-1` — the same region as production. Masked ref: `pqsl****ojgjd`.
  Status at creation: `ACTIVE_HEALTHY`. Created via the Supabase MCP
  `create_project` tool, cost confirmed at $0/month (free plan) before
  creation.
- **Pre-creation check:** `list_projects` was re-run immediately before
  creating anything, confirming only `portify` (production,
  `ACTIVE_HEALTHY`) and `portifyv1` (`INACTIVE`) existed, and that no
  `portify-staging` already existed.
- **Post-creation check:** `list_projects` re-run again, confirming all
  three projects: `portify` and `portifyv1` byte-for-byte unchanged (same
  status, same `created_at`, same host), and the new `portify-staging`
  present with its own distinct ref (not equal to either existing project's
  ref).
- **Nothing else was done.** No migration applied, no data copied from
  `portify`, no tables created manually, `.env.local` not touched,
  `supabase link` not run, `database.types.ts` not regenerated, no app code
  changed. This project is currently an empty, fresh Supabase project with
  only the default schema.
- **Next steps (not done here, deliberately separate):** confirm
  `SUPABASE_ENVIRONMENT=staging`/`SUPABASE_PROJECT_REF` for this project
  pass `npm run check:supabase-env -- --target=staging` (should now pass
  cleanly — the project's dashboard name genuinely contains `staging`, no
  verbal-confirmation-only step required this time), then follow
  "Recommended order of application" above to apply the migration here for
  the first time against genuine staging, regenerate `database.types.ts`
  against it, and re-run the smoke/RLS tests without needing to touch
  production or clean up afterward.

### 2026-07-10 — `portify-staging` bootstrap (schema, smoke/RLS test)

Closes the "next steps" above. Everything below happened against
`portify-staging` (masked ref `pqsl****ojgjd`) only — `portify` (production)
and `portifyv1` were never touched, no production data was read or copied
into staging, and no migration was applied to production.

- **Repo linked to staging.** `npx supabase link --project-ref
  <masked ref pqsl****jgjd>` was run; the interactive DB-password prompt it
  asks for next can't be answered in this environment, but the command had
  already rewritten `supabase/.temp/linked-project.json` (ref/name/org only,
  no secrets) before hanging, which is all the guardrail script reads.
  `npm run check:supabase-env -- --target=staging` then passed cleanly:
  `SUPABASE_PROJECT_REF=<masked ref pqsl****jgjd>`, linked ref `pqsl****jgjd`,
  linked name `portify-staging`, "OK — environment is unambiguous."
- **Bootstrap strategy (Option B — reviewed with the project owner first):**
  `supabase-schema.sql` was not, on inspection, a complete mirror of
  production. Applied via the Supabase MCP `apply_migration` tool, in order:
  `supabase-schema.sql` (base schema — already includes the import-audit-log
  table/column since PR #129), then `supabase-migration-asset-scores.sql`
  (adds `asset_scores`). `supabase-migration-import-audit-log.sql` was
  **not** applied separately — it's already folded into `supabase-schema.sql`
  and reapplying it would be redundant (its `create table if not exists`
  guard would just no-op).
- **Known, pre-existing schema gap vs. production** (found here, not
  something this task introduced or was asked to fix): `supabase-schema.sql`
  is missing the `investor_profiles` view entirely, and several `profiles`
  columns that exist in real production per `lib/supabase/database.types.ts`
  (`allocated_bond_etf`, `allocated_etf`, `allocated_stock`, `estimated_rate`,
  `free_funds_annual_rate_pct`, `profile_updated_at`, `uninvested_cash`).
  Confirmed via `generate_typescript_types` against staging after the
  bootstrap — same gap, nothing new. Consequence observed live: the
  Settings page's "Saldo não investido"/"Taxa de juro anual" read
  (`profiles?select=uninvested_cash,free_funds_annual_rate_pct`) returns
  `400` in staging. Not fixed here — reconstructing those columns/the view
  from `database.types.ts` alone (no constraints/defaults/trigger source)
  would be exactly the "não improvisar schema manual" the owner asked to
  avoid; needs its own follow-up with the real DDL.
- **A second, blocking gap was found and fixed, with the owner's explicit
  sign-off:** `supabase-schema.sql`'s `investment_plans` table still had the
  table's original column name, `monthly_amount`, and was missing
  `plan_updated_at` — but the app (`app/auth/summary/page.tsx`) and real
  production (`lib/supabase/database.types.ts`) both use `amount`. This
  isn't a cosmetic gap: without it, `POST .../investment_plans` fails
  `PGRST204` and **no new user can finish onboarding in staging at all**
  (the summary page won't route past `/auth/plan-set` without a saved
  plan). Fixed with a small, staging-only, explicitly-commented migration
  (`fix_investment_plans_amount_column`, applied via MCP): `alter table
  investment_plans rename column monthly_amount to amount; alter table
  investment_plans add column if not exists plan_updated_at timestamptz;`.
  Verified via `information_schema.columns` afterward — matches production's
  shape exactly. This SQL fix lives only in the staging project (applied via
  MCP), not in any versioned `.sql` file in this repo — the underlying
  `supabase-schema.sql` staleness is the same known-gap class as above and
  should be corrected there in a future, dedicated PR.
- **`database.types.ts` regenerated against staging, not applied to the
  repo.** Same decision as before: staging's schema is a documented subset
  of production's (see gap above), so overwriting the real file would
  regress the app's type safety. The generated output was reviewed and shows
  exactly the expected diff — `investment_plans.amount`/`plan_updated_at`
  now correct, `asset_scores` present, `import_audit_logs`/
  `transactions.import_id` present — and nothing unexpected.
- **Auth setting difference found:** unlike production, `portify-staging`
  requires email confirmation before a session is issued (the default for a
  new Supabase project). A fresh sign-up returns `200` from
  `/auth/v1/signup` but no session cookie is set until the email is
  confirmed — the onboarding flow silently proceeds without an authenticated
  session (PIN never actually saves; profile fields never actually write)
  until this is noticed. Worked around here by confirming the test user's
  email directly via SQL (`update auth.users set email_confirmed_at =
  now()...`) since no real mailbox exists for a disposable test address.
  Not a schema issue — an Auth-service setting — but worth knowing before
  the next person tries to register a test user here and gets confused by a
  PIN that "never sticks."
- **XTB import smoke test — passed.** Test user `staging_real_user_a`,
  file `xtb-test.xlsx` (1 `buy` AAPL.US, 1 `withholding_tax`, 1 `deposit`,
  1 `interest_tax`, 1 unrecognized-type row). Preview showed "Nenhum dado
  foi gravado ainda" before confirming; after confirming: toast "Importação
  concluída… Importação registada com ID `af528242`"; `import_audit_logs`
  row `status='completed'`, `total_rows=5`/`valid_rows=4`/`invalid_rows=1`/
  `duplicate_rows=0`; all 4 transactions have `import_id` set to that log's
  id and the correct `type`/`ticker`/`amount`. Re-uploading the identical
  file: all 4 previously-valid rows now `duplicate`, the unrecognized row
  still `error`, 0 valid rows, "Importar" button disabled — no second audit
  log or transaction row was created (confirmed by count, unchanged at 1 and
  4 respectively).
- **RLS two-user smoke test — passed.** A second user, `staging_real_user_b`
  (created directly via SQL — `insert into auth.users`, confirmed, relying
  on the `handle_new_user` trigger for the `profiles` row — as a faster
  equivalent to a second full browser registration), with its own audit log
  and transaction. Simulated both sessions via `set local role authenticated`
  / `request.jwt.claims`: A sees 0 of B's audit logs/transactions and vice
  versa; each sees exactly their own; `delete` on the owner's own audit log
  row affected 0 rows (blocked — no delete policy, same as production).
- **Test data kept, not cleaned up.** Unlike the production incident above,
  `portify-staging` exists specifically so disposable test data can live
  there — there's no baseline to restore. Post-bootstrap counts: `auth.users`
  2, `profiles` 2, `transactions` 5, `import_audit_logs` 2, `holdings` 1,
  `investment_plans` 1, `asset_scores` 0.
- **`.env.local` was temporarily pointed at staging** for the browser smoke
  test (backed up first) and **reverted to production values before
  finishing** — confirmed via diff against the backup. Never committed.
- **Limitations:** `npx supabase login`/`link` still can't complete
  non-interactively in this environment (same finding as every prior
  session) — all real operations went through the Supabase MCP connector.
  The two schema gaps above (profiles columns/view, and the
  `investment_plans` column rename) mean `supabase-schema.sql` alone is not
  yet a fully accurate "fresh install" script — this bootstrap documents
  and works around that rather than fixing the source file, per explicit
  scope.

### 2026-07-10 — Schema drift reconciliation

Closes the two schema-gap items from the bootstrap entry above. Production
(`portify`, masked ref `dwol****donk`) was read-only throughout — every
query in this entry is a `select` against `information_schema`/`pg_catalog`;
no `create`/`alter`/`insert`/`update`/`delete` ever ran against production.
`portifyv1` (masked ref `xqsu****pcbz`) was not touched. No production data
was copied anywhere.

**Source of truth used:** real production schema, introspected read-only via
the Supabase MCP connector (`information_schema.columns`, `pg_constraint`,
`pg_policies`, `pg_trigger`, `pg_proc`, `pg_indexes`, `information_schema.views`)
— not `lib/supabase/database.types.ts` alone, since types don't carry
constraints/defaults/trigger logic.

**Comparison — production vs. staging vs. `supabase-schema.sql` (pre-reconciliation):**

| Object | Production (real) | `portify-staging` (pre-fix) | `supabase-schema.sql` (pre-fix) | Classification | Action |
|---|---|---|---|---|---|
| `profiles.allocated_stock/etf/bond_etf`, `estimated_rate`, `uninvested_cash`, `free_funds_annual_rate_pct`, `profile_updated_at` | present | missing | missing | blocking (settings page read 400s without them) | added to both |
| `profiles.risk_score` type | `integer` | `numeric` | `numeric` | non-blocking | changed to `integer` in both |
| `profiles.investment_goal` check constraint | present (6 values) | absent | absent | non-blocking (app already only sends valid values) | added to both |
| `profiles.risk_score`/`allocated_*`/`estimated_rate` range checks | present | absent | absent | non-blocking | added to both |
| `profiles.monthly_amount`, `preferred_assets` | absent | present | present | documentation-only residue | left in place (no-drop scope), documented |
| `profiles_updated_at` trigger (`touch_profile_updated_at`) | present | absent | absent | non-blocking | added to both |
| `investment_plans.amount` (vs. `monthly_amount`) | `amount` | `amount` (already fixed in prior bootstrap) | `monthly_amount` | blocking (already fixed staging-side; schema.sql now updated) | renamed in `supabase-schema.sql`; staging already correct |
| `investment_plans.plan_updated_at` | present, default `now()` | present, no default | absent | blocking / non-blocking (see above) | added to `supabase-schema.sql`; default added to staging |
| `investment_plans.preferred_asset_classes` default | none | `array['stock','etf','bond_etf']` | same | documentation-only | default dropped in both, for parity |
| `investment_plans.preferred_asset_classes` check | present | absent | absent | non-blocking | added to both |
| `investment_plans_frequency_check` | narrower (4 values, missing `biweekly`/`semiannual`) | wider (6 values) | wider (6 values) | **unknown — likely a production bug**, not schema.sql drift (see below) | **not changed** — kept wide in `supabase-schema.sql`, per explicit owner decision |
| `investor_profiles` view | present | missing | missing | blocking-ish (confirmed unused by app code, but part of the real schema) | added to both |
| `asset_scores`, `import_audit_logs`, `transactions.import_id`, `transactions_type_check` | present | present | present | intentional / already correct | no change |
| RLS enabled + policies (all 6 tables) | matches | matches | matches | intentional / already correct | no change |

**The `investment_plans_frequency_check` anomaly:** production's real
constraint only allows `'weekly','monthly','quarterly','annual'` — narrower
than what `lib/profileConstants.ts`'s `PLAN_FREQUENCIES` (and the plan-set
UI) can actually produce (`'biweekly'`, `'semiannual'` are real, reachable
UI choices). This means **selecting "Quinzenal" or "Semestral" in production
today would fail** with a check-constraint violation. This looks like a bug
in production itself, not schema drift to mirror — asked the project owner
explicitly, and the decision was to **keep the wider 6-value check in
`supabase-schema.sql`** (matching the app's real needs and staging's
existing, already-wider constraint) rather than narrowing it to match
production's gap. **Not fixed in production here** (out of scope — this task
is schema reconciliation, not a production migration) — flagged as a
follow-up: widen `investment_plans_frequency_check` in production to match
the app.

**`supabase-schema.sql` changes:** `profiles` — removed `preferred_assets`/
`monthly_amount` (not in production), `risk_score` changed to `integer`,
added `investment_goal` check, added `risk_score`/`allocated_*`/
`estimated_rate` range checks, added the 6 missing columns, added
`profile_updated_at` + its `touch_profile_updated_at` trigger.
`investment_plans` — renamed `monthly_amount` → `amount`, added
`plan_updated_at` (default `now()`), dropped the `preferred_asset_classes`
default, added its containment check, added `touch_plan_updated_at` trigger.
Added the `investor_profiles` view (exact production definition — a plain
view, not `security_invoker`, confirmed unused by any app code via a repo
grep, kept only for schema parity). `asset_scores`, `import_audit_logs`,
`transactions` (including `transactions_type_check`'s `withholding_tax`/
`wht`) — unchanged, already matched production.

**Reconciliation migration:** `supabase-migration-reconcile-schema-drift.sql`
— idempotent, additive-only (no columns dropped, no data deleted, no
renames — the `investment_plans` rename had already been applied directly to
staging in the prior bootstrap task). Applied **only** to `portify-staging`
(masked ref `pqsl****jgjd`) via the Supabase MCP connector, after
re-confirming `npm run check:supabase-env -- --target=staging` passed.
**Not applied to production** — production is already the source of truth
this migration reconciles other environments against.

**Post-reconciliation verification (read-only, against staging):** all 7
new `profiles` columns present with correct types/defaults;
`investment_plans.plan_updated_at` now defaults to `now()`;
`investor_profiles` view created and queryable (`select * from
investor_profiles` returns correctly joined rows for both existing test
users); both new triggers (`trg_touch_profile_updated_at`,
`trg_touch_plan_updated_at`) present; row counts unchanged (`profiles` 2,
`transactions` 5, `import_audit_logs` 2) — no data lost.

**`database.types.ts` regeneration:** regenerated against the now-aligned
staging project. The only diff from the file already committed in this repo
is the two residual `profiles` columns (`monthly_amount`, `preferred_assets`)
that exist only in staging (deliberately not dropped, see above) — no other
difference. Since the repo's existing file already accurately reflects
production (including `investment_plans.amount`/`plan_updated_at` and the
`investor_profiles` view, from the original hand-written-then-regenerated
history), **the repo's `database.types.ts` was left unchanged** — applying
staging's version would have regressed it by introducing two columns that
don't exist in production.

**`scripts/check-import-audit-schema.mjs` strengthened** with new static
checks: `profiles` has all the critical columns above,
`investment_plans` uses `amount` (not `monthly_amount`) and has
`plan_updated_at`, `supabase-schema.sql`/`database.types.ts` both declare
the `investor_profiles` view. `npm run check:schema` passes.

**Smoke tests, re-run in staging after reconciliation** (test user
`staging_schema_recon_c`, created fresh — registration → email confirmed
via SQL (staging still requires email confirmation, same limitation as the
bootstrap task) → PIN → full 7-step onboarding → plan-set → finalize):
- **Onboarding/plan finalize** — no `monthly_amount` error; `investment_plans`
  row created with `amount = 250`, `plan_updated_at` populated automatically;
  reached `/dashboard` cleanly.
- **Profile/settings screens** — `/profile` and `/profile/settings` render
  without error; the settings page's "Saldo não investido"/"Taxa de juro
  anual" fields (which 400'd during the original bootstrap, before this
  reconciliation) now load correctly (`0.00 €`/`0.00%`).
- **XTB import** — re-run with the same test file (1 `buy`, 1
  `withholding_tax`, 1 `deposit`, 1 `interest_tax`, 1 invalid row): preview
  and confirm both worked identically to the bootstrap task; audit log
  `status='completed'`, `4`/`5` rows imported, all 4 transactions correctly
  tagged with `import_id`.
- **RLS** — re-verified with the new test user against the two existing
  ones (SQL session simulation): no cross-user visibility on `transactions`
  or `profiles` in either direction; the new user correctly sees its own row
  in `investor_profiles` (confirms RLS on the underlying tables still
  applies through the view).
- Test data kept, not cleaned up — same reasoning as the bootstrap task.
- `.env.local` was temporarily pointed at staging again for this browser
  round and reverted to production values before finishing, confirmed via
  diff against the backup.

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
   - **Environment** — cross-checked against the runbook's "Production
     validation log" below, or added as a new entry there if this is the
     first time this project is being confirmed. A human confirming the
     wrong environment name in good faith is exactly what happened on
     2026-07-10 (see that log) — cross-checking against a *written* prior
     confirmation, not just asking again, is what would have caught it.
3. **Abort** (do not apply the migration) if any of the following is true:
   - The environment is ambiguous by any of the checks above.
   - The only project available is the one named plainly `"portify"` (the
     exact situation found in this repository as of 2026-07-09, and now
     known to be production — see "Production validation log") — do not
     treat a plainly-named project as staging (or as production) on a
     single verbal confirmation alone; see "Known risks" for why.
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

`lib/supabase/database.types.ts` was originally updated **by hand**, because
no real Supabase project was reachable when the migration was first written.
**Update, 2026-07-10:** it has since been regenerated against the real,
migrated `portify` project — production, though believed to be staging at
the time (via the Supabase MCP `generate_typescript_types` tool) — and found
byte-for-byte identical to the hand-written version already in the repo —
see "Production validation log" above. If you're applying this migration to
a *different* project (e.g. a future dedicated staging project, once one
exists), still regenerate and diff — this result confirms the hand-written
version was accurate for the schema this migration produces, not that
regeneration can be skipped for a different project:

```bash
npx supabase login
npx supabase link --project-ref <target-project-ref>
npx supabase gen types typescript --linked > lib/supabase/database.types.ts
```

(Or, without linking, `npx supabase gen types typescript --project-id <ref> --schema public > lib/supabase/database.types.ts` using a personal access token. A Supabase MCP connector, if available in your environment, can also do this without either the CLI or a token — see "Production validation log" for how this was done here.)

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

## Functional smoke test

Manual, against the confirmed target environment (staging if one exists,
production otherwise — see "Known risks": this Supabase organization
currently has no staging, so this was in practice run against production on
2026-07-10), after the migration is applied. Use two separate test accounts
(**user A**, **user B**) — user B is only needed for the RLS checklist
further down, not for steps 1–9 below. **If run against production, delete
both test accounts and everything they created immediately after** — see
the 2026-07-11 cleanup entry in "Production validation log" for exactly how.

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
6. **Invalid rows:** upload a file with **some, but not all, rows** failing
   validation (e.g. one unrecognized `Type` among otherwise-valid rows).
   Confirm the preview marks that row `'error'` with a reason, **"Importar"
   still only writes the valid rows**, and the audit log's
   `invalid_rows`/`error_count` reflect the bad row(s) (`status: 'completed'`
   since at least one eligible row made it in). **Correction from real
   testing on 2026-07-10:** the "Importar" button is disabled whenever
   `ImportPreview.validRows === 0`
   (`app/profile/settings/page.tsx`'s `disabled={importing ||
   importPreview.validRows === 0}`) — this is *any* combination of
   error/duplicate rows that leaves zero `'valid'`/`'warning'` rows, not just
   the "all rows are duplicates" case. **A file where every single row is
   invalid never gets to `confirmImport()` at all** — no audit log is
   created for it, contradicting what an earlier version of this runbook
   assumed (`'completed'` with `imported_rows: 0`). If you need to confirm
   this specific all-invalid-file behavior, watch the button's disabled
   state in the preview rather than trying to click "Importar" and reading
   the result.
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
    **same** file again — confirm rows are flagged `'duplicate'` in the
    preview and are not re-imported (checked against the user's already-saved
    transactions this time, not just within-file). **Corrected by real
    testing on 2026-07-10** (see "Production validation log"): if *every* row in
    the file is now a duplicate (or invalid), `validRows` is 0 and the
    **"Importar" button is disabled** — `confirmImport()` never runs, so
    **no new audit log row is created** in that case. This only differs from
    the case in step 6/9 above (all-invalid file) if the file has zero
    eligible rows for *any* reason (all error, all duplicate, or a mix) —
    an audit log is only ever created once the user can actually press
    "Importar", which requires at least one `'valid'`/`'warning'` row.
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

## RLS checklist (two users)

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

**Correction from real testing on 2026-07-10:** this query returns a
**non-zero baseline on any project that imported data before this migration
existed** — those older transactions legitimately have `external_id` set
(they came from a parsed file, via the pre-audit-log single-step import
flow) but `import_id` null, since the column didn't exist yet when they were
written. On `portify` (production), this baseline was **130** — matching exactly
the transaction count already in the table before this migration was ever
applied here. **A non-zero result on its own is not a problem** — what
matters is whether the count *increases* after this migration is live, which
would mean a new transaction was written by the current code without an
audit trail (an invariant break). Compare against a known-good baseline
(recorded once, right after migrating) rather than expecting zero:
```sql
-- Not "should always be zero" — record this once, right after migrating, as
-- your baseline (transactions imported before this feature existed will
-- legitimately have external_id set and import_id null). Re-run later and
-- compare: the count should never grow past this baseline.
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

- **This Supabase organization has no real staging environment.** The only
  two projects that exist are `portify` (production) and `portifyv1`
  (`INACTIVE`, never confirmed as anything). This entire migration —
  schema change, constraint tests, RLS tests, functional smoke tests — was
  validated directly against production because there was nowhere lower-risk
  to do it first, and a verbal "yes this is staging" confirmation from the
  project owner turned out to be mistaken (see "Production validation log",
  2026-07-10/2026-07-11). Recommendation for next time: create and clearly
  name (`-staging` or similar) a second project before the next schema
  change, so `npm run check:supabase-env`'s naming heuristic has something
  to actually cross-check against, and confirmations aren't the only line of
  defense.
- ~~`database.types.ts` was hand-written, not generated.~~ **Resolved
  2026-07-10** — regenerated against the real, migrated `portify` project
  (production) and found byte-for-byte identical (see "Production validation
  log"). Still true for any *other* project this migration is applied to
  (e.g. a future dedicated staging project, once one exists): regenerate and
  diff there too, don't assume this result transfers.
- ~~No automated test exercises the migration SQL itself.~~ **Resolved
  2026-07-10** for production — the migration was actually applied to a real
  Postgres instance and every post-migration query, constraint, and RLS
  check was re-run for real (see "Production validation log"). Still true that
  there's no *automated/repeatable* test of the migration SQL (e.g. in CI) —
  this was a manual, one-time validation, not a regression-proof harness.
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

**Validated for real, 2026-07-10, against `portify` — production, though
believed to be staging at the time (corrected 2026-07-11) — see "Production
validation log" above for full detail:**
- The migration was actually applied (via the Supabase MCP `apply_migration`
  tool) and every post-migration query re-run for real, all matching
  expectations exactly.
- Constraint-violation behavior under the real engine: a bad `status` value
  correctly raised Postgres `23514`; a missing `user_id` correctly raised
  `23502`.
- `database.types.ts` regenerated against the real project — byte-for-byte
  identical to the hand-written version already in the repo.
- The functional smoke test, run for real through the actual app UI in a
  browser (not mocked): valid CSV import, a rich XTB-style import
  (`buy` + `withholding_tax` + an unrecognized-type error + an internal
  duplicate), and a persistent-duplicate re-import — with one correction to
  what this document previously assumed (see step 10 of "Functional smoke
  test").
- The RLS checklist, run for real with two of the project's existing real
  users (session simulated via `set local role authenticated` /
  `request.jwt.claims`) — all 5 checks passed (cross-user select blocked,
  cross-user update blocked, delete blocked even for the owner, transactions
  correctly scoped by `import_id` per user).
- `get_advisors` (security) before and after the migration — identical
  results, no new advisory introduced.
- `deposit` and `interest_tax`, smoke-tested through the UI in a second pass
  the same day: both written to `transactions` with the correct type,
  `ticker: null`, and `import_id` set — see "Production validation log".
- All test data created during the above (a disposable test user and its
  holdings/transactions/audit logs) was deleted from production on
  2026-07-11 once the environment mislabeling was caught — see "Production
  validation log", 2026-07-11 entry.

**Still not validated:**
- `'wht'` — genuinely can't be smoke-tested through the import UI;
  `normalizeXtbTransactionType()` never produces it for any input, so the
  only way to get a `'wht'`-typed row is a direct SQL insert, which is what
  the `transactions_type_check` constraint-definition query above already
  exercises.
- **A genuine staging environment never existed for any of this** — every
  validation above ran directly against the only real project this Supabase
  organization has, which turned out to be production. There is currently
  no lower-risk environment to validate a *future* schema change against
  before it hits production — see "Known risks" and
  [release-checklist.md](release-checklist.md#import-audit-log-release-checklist).

## Checklist status

Production is done (see "Production validation log" above) — this
migration's rollout for this feature is complete. See
[release-checklist.md](release-checklist.md#import-audit-log-release-checklist)
for the itemized checklist and its final state, and for what to do
differently next time given there's no staging environment yet.
