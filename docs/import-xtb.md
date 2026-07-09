# XTB import — preview and duplicate reconciliation

How `app/profile/settings/page.tsx`'s "Importar Portfólio" flow works, what
[lib/holdingsImport.ts](../lib/holdingsImport.ts) validates, and what it
doesn't (yet). See [model-map.md](model-map.md) for where this fits among
the other models/parsers, and [current-state.md](current-state.md) for the
migration history.

## The two-phase flow

Before this task, choosing a file and pressing "Importar" parsed it and
wrote directly to Supabase in one step — nothing was shown to the user
first. Now:

1. **Select a file** (CSV or XLSX) — nothing happens yet.
2. **"Analisar ficheiro"** — calls `previewFile()`, which parses, validates
   every row, and checks for duplicates (against the file itself and, when
   available, the user's already-saved transactions). Returns an
   `ImportPreview`. **Nothing is written to Supabase in this step.**
3. The preview is shown: rows read, valid, with errors, duplicates,
   warnings, and — if any row failed — a compact list of which rows and
   why.
4. **"Confirmar" / "Importar"** — only now does anything get saved, and
   only rows with status `'valid'` or `'warning'` (i.e. not `'error'` or
   `'duplicate'`). The button is disabled when there are zero importable
   rows.
5. A summary toast confirms what was actually saved ("Importação
   concluída." + counts).

`previewFile()` never throws for a recoverable problem — an unparseable
file, a missing header row, or an empty file all come back as an
`ImportPreview` with `totalRows: 0` and a message in `errors[0]`, which the
UI renders as a banner. The try/catch around the call in
`analyzeImport()` is a safety net for anything genuinely unexpected, not
the primary error-reporting path.

## Two file shapes, two levels of validation

`lib/holdingsImport.ts` has always supported two different file shapes, and
this task didn't unify them into one:

### 1. XTB "CASH OPERATION HISTORY" export (`.xlsx`/`.xlsm`)

Detected by a sheet name containing "CASH OPERATION" and a header row with
both an "ID" and a "Type" column (column order/exact naming varies between
XTB export variants — resolved by name, not position). This is the rich
path: every data row is parsed and validated individually
(`mapXtbRowToTransaction()`), and problems attach to that specific row
instead of failing the whole file.

### 2. Generic `ticker,units,avg_price[,name]` file (`.csv`, or `.xlsx`/`.xlsm` without a CASH OPERATION sheet)

A plain holdings snapshot — no transaction history, no buy/sell/dividend
types. `rowsToHoldings()` still validates the batch **atomically**: a
single bad row throws, and the whole file becomes one file-level error in
the preview (`totalRows: 0`, one entry in `errors`) rather than a per-row
breakdown. This is a known, intentional limitation (see below) — the richer
per-row preview machinery was built for the XTB path, which is what this
task's brief was about.

## Supported transaction types and required fields

| Type | Ticker | Units | Price | Notes |
|---|---|---|---|---|
| `buy` / `sell` | required | required, `> 0` | required, `> 0` | parsed from the XTB comment (`OPEN BUY/SELL <units> @ <price>`) |
| `dividend` | required | — | — | |
| `withholding_tax` | required | — | — | warns if `amount === 0` |
| `interest` | — | — | — | no ticker — not tied to a position |
| `interest_tax` | — | — | — | warns if `amount === 0` |
| `deposit` | — | — | — | no ticker |

A row whose "Type" cell doesn't map to one of these (`normalizeXtbTransactionType()`
returns `null` — e.g. a rollover or a category we don't model) is an
`unknown_type` **error**, not a silent skip like it was before this task.

## Errors vs warnings

- **Errors** (`status: 'error'`) mean the row is not saved, full stop:
  missing ID/type, unrecognized type, missing ticker where one is required,
  an unparseable/non-positive unit quantity or price for a buy/sell.
- **Warnings** (`status: 'warning'`) don't block the row from being
  imported — they're informational: a missing date (falls back to "now"), a
  missing/unrecognized currency (only checked when the file has a
  `Currency` column at all — see limitations), a zero-amount tax row.
- Completely blank rows (every cell empty) are silently dropped before
  validation runs — they don't count toward `totalRows` and don't produce
  an issue. Trailing blank rows are common in broker exports; treating them
  as "nothing to review" avoided cluttering the preview with meaningless
  entries.

## Duplicate policy

Two independent checks, both applied during `previewFile()`:

- **Within the file** — two rows that resolve to the same
  `[date, type, ticker, units, price, amount]` key (see `buildDuplicateKey()`
  in `lib/holdingsImport.ts`) are flagged; the first occurrence stays
  `'valid'`/`'warning'`, later ones become `'duplicate'`.
- **Against already-saved transactions** — `app/profile/settings/page.tsx`
  fetches the user's existing transactions (`getTransactions()`) before
  calling `previewFile()` and passes them in as `existingTransactions`; any
  row matching one of them by the same key is also flagged `'duplicate'`.

**Duplicates are never imported by default** — the confirm step only writes
`'valid'`/`'warning'` rows. This is deliberately *not* the same mechanism as
the pre-existing `transactions_user_external_id_idx` unique index (which
still backstops an exact re-import of the same XTB file via
`upsert(..., ignoreDuplicates: true)`): the new key is business-field-based,
so it also catches a collision against a *manually* entered trade that has
no `external_id` at all, or two different XTB exports that assigned
different operation IDs to what's actually the same event.

The key deliberately does **not** use ticker+date alone — `type` is part of
it, so a buy and a sell of the same ticker on the same day never collide
with each other, and neither do a dividend and its matching
withholding_tax row.

## Holdings on confirm

Unchanged from before this task: the holdings snapshot in `ImportPreview.holdings`
is a replay of **this file's own** buy/sell rows (via `deriveHoldingsFromTransactions()`),
not a merge with what's already in the `holdings` table. Confirming an
import still **upserts and replaces** the position for every ticker the
file mentions, exactly like the old single-step flow did. This replay
includes rows flagged `'duplicate'` (excluding only `'error'` rows) — a
transaction already existing in the DB doesn't change what *this file*
says the resulting position should be.

No transaction replay across the *whole* portfolio (existing + imported)
happens anywhere in this task, and `portfolioState.ts` is not invoked by the
import flow — both explicitly out of scope.

## Known limitations

- **Currency isn't modeled on `ParsedTransaction`/the DB schema** — there's
  no persisted currency field for transactions. The `missing_currency`/
  `unknown_currency` warnings only fire when the source file happens to
  have a `Currency` column at all; files without one aren't checked, since
  there's nothing to check.
- **The generic CSV/holdings-only path validates atomically, not per-row**
  (see above) — a single bad row in a plain `ticker,units,avg_price` file
  produces one file-level error, not a row-by-row breakdown. Extending it
  to the same per-row model as the XTB path is a reasonable, small future
  improvement, not done here.
- **The duplicate key can produce a false positive** for two genuinely
  distinct transactions that happen to share every field on the same day
  (e.g. two identical purchases). This is an accepted trade-off of a
  field-based key without a nonce — day-level date granularity (rather than
  full timestamp) was chosen deliberately to avoid the opposite, worse
  failure mode (missing a real duplicate because of sub-second formatting
  differences between a freshly-parsed ISO string and a Postgres
  `timestamptz` round-trip).
- **Validation issue messages (`ImportIssue.message`) are Portuguese-only**,
  regardless of the app's `lang` setting. They're generated deep inside the
  pure parser, which doesn't depend on `lib/dict.ts`/React — threading
  `lang` through would mean either breaking the parser's no-React/no-Next.js
  purity rule or duplicating every message in two languages inside a
  non-UI module. The surrounding UI chrome (buttons, labels, stat tiles) is
  fully bilingual via `lib/dict/{pt,en}.ts`, as usual.
## Audit log persistente

**Requires the migration to be applied in each environment.** Every
confirmed import now creates a row in `public.import_audit_logs`
(schema in [supabase-migration-import-audit-log.sql](../supabase-migration-import-audit-log.sql),
consolidated into [supabase-schema.sql](../supabase-schema.sql); helpers in
[lib/db/importAudit.ts](../lib/db/importAudit.ts)). If the target Supabase
project hasn't run that migration yet, `createImportAuditLog` fails and
`confirmImport()` aborts before writing anything — the user sees a friendly
"database may not be up to date" message (`t.impAuditFailed`), and no
holdings/transactions are written. This is the intended fail-closed
behavior, not a bug. See
[import-audit-migration-runbook.md](import-audit-migration-runbook.md) for
how to apply the migration to staging/production, verify it, and roll it
back if needed. `ImportPreview.importId`
was reserved but always `undefined` before this task — it's still not
threaded onto the preview type itself (the parser stays fully decoupled from
persistence, see "Parser stays pure" below), but `app/profile/settings/page.tsx`
now surfaces the created audit log's `id` directly in the confirmation
toast.

### What's stored

| Column | What it holds |
|---|---|
| `user_id` | who imported (FK to `public.profiles(id)`, RLS-scoped) |
| `parser_name`, `parser_version` | which parser produced this preview, and which version — see `XTB_IMPORT_PARSER_VERSION` |
| `filename` | the **name** of the uploaded file only (e.g. `"extract.xlsx"`) — never a path, never the file itself |
| `file_hash` | see "File hash" below |
| `status` | `pending` → `completed` \| `partial` \| `failed` — see "Status lifecycle" |
| `total_rows`/`valid_rows`/`invalid_rows`/`duplicate_rows` | copied straight from the `ImportPreview` the user reviewed |
| `imported_rows`/`skipped_rows` | filled in once the write attempt is known |
| `warning_count`/`error_count` | counts, not the full issue text |
| `summary` | `ImportPreview.summary` (per-type counts, tickers, currencies) as jsonb |
| `warnings`/`errors` | `ImportPreview.warnings`/`errors` (the `ImportIssue[]` arrays: severity/code/message/rowNumber/field) as jsonb |
| `created_at`/`completed_at` | when the log was created vs. when its final status was set |

### What's never stored

- The raw file (bytes, base64, or otherwise) — `previewFile()`'s parsing
  happens entirely in the browser/request and nothing downstream of the
  `ImportPreview` object ever sees the original `File`/`ArrayBuffer` again.
- Per-cell original file content beyond what already flows through
  `ImportIssue.message`/`ImportPreviewSummary` (i.e. no dump of every row's
  raw spreadsheet cells into the audit log — `rows` is deliberately not a
  column on `import_audit_logs`).
- Any file path — `filename` is `File.name` (a bare filename, e.g.
  `"extract.xlsx"`), sourced entirely from the browser's `<input type="file">`,
  which never exposes the uploader's local filesystem path to begin with.

### File hash

`computeImportFileHash()` (`lib/db/importAudit.ts`) reuses
`lib/models/modelMeta.ts`'s `createInputHash()` — the same non-cryptographic,
32-bit rolling hash used elsewhere in this codebase for change detection
(see [model-governance.md](model-governance.md)). It fingerprints the
**parsed content** (parser version + each row's resulting transaction/
original cells), not the raw file bytes, and deliberately excludes the
filename — two exports of the same underlying data hash the same even if
renamed. This is an operational fingerprint for "does this look like
something I already imported", not a security or integrity mechanism, and
has no collision-resistance guarantees.

### Status lifecycle

1. **`pending`** — set the instant the audit log row is created, *before*
   any holdings/transactions write is attempted. If this insert itself
   fails, `confirmImport()` aborts immediately (`impAuditFailed` shown to
   the user) — holdings/transactions are never written without a matching
   audit log.
2. After the write attempt, `determineImportStatus()` (pure, unit-tested in
   `lib/db/importAudit.test.ts`) resolves the final status:
   - **`completed`** — every eligible row (`status: 'valid'`/`'warning'` in
     the preview) was written, or there were zero eligible rows to begin
     with (an all-invalid/all-duplicate file is a successful no-op, not a
     failure).
   - **`partial`** — some, but not all, eligible rows made it in.
   - **`failed`** — there were eligible rows but none were written (either
     the write call itself errored, or it nominally succeeded but wrote
     zero rows).
3. `completed_at` is set alongside the final status.

`invalid_rows`/`duplicate_rows` (rows never attempted, known from the
preview) are conceptually distinct from write-time gaps
(`eligibleRows − importedRows`, only knowable after the write) —
`skipped_rows` on the row is the **total** of both (`total_rows − imported_rows`).

### `transactions.import_id`

Every transaction written by a confirmed import is tagged with
`import_id = <the audit log's id>`, via a nullable FK
(`transactions.import_id references import_audit_logs(id) on delete set null`).
Manually-entered trades (`lib/hooks/useTrade.ts`) and transactions imported
before this task keep `import_id = null` — nothing about existing rows
changes. Deleting an audit log (not currently exposed to users — see RLS
below) would `set null` on its transactions rather than cascading, so
transaction history is never silently deleted as a side effect of an audit
log going away.

**No cross-user leakage:** `transactions`' own RLS policy
(`auth.uid() = user_id`, `for all`) is what actually gates every read/write
on that table — `import_id` is just a foreign key value, not a bypass. A
user querying `transactions` filtered by some `import_id` still only ever
sees rows where `user_id = auth.uid()`, regardless of whose audit log that
id belongs to.

### RLS

`import_audit_logs` has RLS enabled with `select`/`insert`/`update` policies
scoped to `auth.uid() = user_id` (with an explicit `with check` on
insert/update, same pattern as the rest of the schema post-RLS-audit — see
`supabase-migration-rls-audit.sql`). **No delete policy** — same pattern as
`profiles`' missing insert policy: RLS enabled + no policy for a command
blocks that command by default. An audit trail shouldn't be deletable by the
user it describes.

### Parser stays pure

`lib/holdingsImport.ts` was **not** changed by this task beyond what's
already documented above — it still exports `ImportPreview` with no
`import_id`/audit-log awareness, still does no I/O, and still doesn't import
from `lib/db/importAudit.ts` (verified by the same source-inspection purity
test as before). All persistence — creating the log, tagging transactions,
resolving the final status — lives in `app/profile/settings/page.tsx` and
`lib/db/importAudit.ts`, which the parser has no dependency on.

### Known limitation: pre-existing schema bug, fixed in passing

While building this, we found that `transactions`' `type` check constraint
only allowed `'wht'`, but the app (this parser included) has always written
`'withholding_tax'` — any import containing a withholding-tax row would have
failed the constraint. `supabase-migration-import-audit-log.sql` widens the
constraint to accept both (keeping `'wht'` for any rows that may already use
it). This is unrelated to the audit log feature itself but was directly
blocking correct `status: 'failed'` reporting for real imports, so it's
fixed in the same migration rather than filed separately.

## Next steps (future tasks, not started here)

- A dedicated import-history page (today: a short "last 5" list in
  `app/profile/settings/page.tsx`, see `listImportAuditLogs()`).
- Per-row validation for the generic CSV/holdings-only path.
- Currency as a first-class field on `transactions`, if/when multi-currency
  support is added elsewhere in the app (`portfolioState.ts` already has a
  `multi_currency_no_fx` warning code for the same underlying gap).
- Optional: let the user review/edit a row's parsed transaction before
  confirming, rather than only accept-or-reject at the row level.
- Unit tests for `createImportAuditLog`/`completeImportAuditLog`/
  `failImportAuditLog`/`listImportAuditLogs`/`getImportAuditLog` themselves
  (currently only `determineImportStatus`/`computeImportFileHash`/
  `buildImportAuditLogInsert` are unit-tested — the DB-client-dependent
  functions have no existing Supabase-mock pattern in this repo to follow;
  see the commit summary for the full reasoning).
