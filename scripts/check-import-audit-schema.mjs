#!/usr/bin/env node
// Static, dependency-free consistency check between the import-audit-log
// migration, the consolidated schema, and the generated Supabase types.
// Does not connect to any database — pure text checks on repo files, safe to
// run without Supabase access. See docs/import-audit-migration-runbook.md.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readOrFail(relPath) {
  try {
    return readFileSync(join(root, relPath), 'utf8');
  } catch {
    return null;
  }
}

const checks = [];

function check(label, condition) {
  checks.push({ label, ok: !!condition });
}

const migration = readOrFail('supabase-migration-import-audit-log.sql');
const schema = readOrFail('supabase-schema.sql');
const types = readOrFail('lib/supabase/database.types.ts');

check('supabase-migration-import-audit-log.sql exists', migration !== null);
check('supabase-schema.sql exists', schema !== null);
check('lib/supabase/database.types.ts exists', types !== null);

if (schema !== null) {
  check('supabase-schema.sql defines import_audit_logs table', /create table if not exists public\.import_audit_logs/.test(schema));
  check('supabase-schema.sql adds transactions.import_id', /transactions[\s\S]*?import_id uuid references public\.import_audit_logs\(id\)/.test(schema));
  check('supabase-schema.sql transactions type check allows withholding_tax', /type text not null check \(type in \([^)]*'withholding_tax'/.test(schema));
  check('supabase-schema.sql import_audit_logs has RLS enabled', /alter table public\.import_audit_logs enable row level security/.test(schema));
  check('supabase-schema.sql import_audit_logs has select/insert/update policies', [
    /create policy[^;]*on public\.import_audit_logs for select/,
    /create policy[^;]*on public\.import_audit_logs for insert/,
    /create policy[^;]*on public\.import_audit_logs for update/,
  ].every(re => re.test(schema)));
  check('supabase-schema.sql import_audit_logs has no delete policy', !/create policy[^;]*on public\.import_audit_logs for delete/.test(schema));
  check('supabase-schema.sql import_audit_logs stores no raw file content column', !/raw_content|file_content|raw_rows|file_bytes|file_data/.test(schema));
}

if (migration !== null) {
  check('migration defines import_audit_logs table', /create table if not exists public\.import_audit_logs/.test(migration));
  check('migration adds transactions.import_id', /add column if not exists import_id uuid references public\.import_audit_logs\(id\)/.test(migration));
  check('migration is additive (uses if not exists / if exists guards)', /if not exists|if exists/.test(migration));
}

if (types !== null) {
  check('database.types.ts declares import_audit_logs table', /import_audit_logs:\s*\{/.test(types));
  check('database.types.ts transactions Row has import_id', /transactions:[\s\S]*?Row:\s*\{[\s\S]*?import_id: string \| null/.test(types));
}

// Transaction types the app is known to read/write (see lib/holdingsImport.ts,
// lib/portfolio/portfolioState.ts, components/ui/TransactionCard.tsx) plus
// 'wht', kept in the DB check constraint only for backward compatibility with
// rows written before the app standardized on 'withholding_tax' — no current
// code path writes or reads 'wht'.
const REQUIRED_TRANSACTION_TYPES = ['wht', 'withholding_tax', 'interest_tax', 'deposit', 'buy', 'sell', 'dividend'];

if (schema !== null) {
  const constraintMatch = schema.match(/type text not null check \(type in \(([^)]*)\)\)/);
  const constraintValues = constraintMatch ? constraintMatch[1] : '';
  const missingTypes = REQUIRED_TRANSACTION_TYPES.filter(t => !constraintValues.includes(`'${t}'`));
  check('supabase-schema.sql transactions type check covers all required transaction types', constraintMatch !== null && missingTypes.length === 0);
  if (missingTypes.length > 0) console.error('  missing transaction types in schema check constraint:', missingTypes.join(', '));
}

const REQUIRED_DOCS = [
  'docs/import-xtb.md',
  'docs/import-audit-migration-runbook.md',
  'docs/release-checklist.md',
];

for (const doc of REQUIRED_DOCS) {
  check(`${doc} exists`, readOrFail(doc) !== null);
}

check('lib/db/importAudit.test.ts exists', readOrFail('lib/db/importAudit.test.ts') !== null);

const REQUIRED_COLUMNS = [
  'id', 'user_id', 'parser_name', 'parser_version', 'filename', 'file_hash',
  'status', 'total_rows', 'valid_rows', 'invalid_rows', 'duplicate_rows',
  'imported_rows', 'skipped_rows', 'warning_count', 'error_count', 'summary',
  'warnings', 'errors', 'created_at', 'completed_at',
];

if (schema !== null) {
  const missing = REQUIRED_COLUMNS.filter(col => !new RegExp(`\\b${col}\\b`).test(schema));
  check(`supabase-schema.sql mentions all ${REQUIRED_COLUMNS.length} expected import_audit_logs columns`, missing.length === 0);
  if (missing.length > 0) console.error('  missing in schema:', missing.join(', '));
}

// Schema drift reconciliation (2026-07-10) — see
// docs/import-audit-migration-runbook.md's "Schema drift reconciliation"
// entry. These columns/shapes were confirmed against real production;
// catches this consolidated snapshot silently drifting from it again.
const REQUIRED_PROFILES_COLUMNS = [
  'allocated_stock', 'allocated_etf', 'allocated_bond_etf', 'estimated_rate',
  'uninvested_cash', 'free_funds_annual_rate_pct', 'profile_updated_at',
];

if (schema !== null) {
  const profilesMatch = schema.match(/create table if not exists public\.profiles \(([\s\S]*?)\n\);/);
  const profilesBody = profilesMatch ? profilesMatch[1] : '';
  const missingProfilesCols = REQUIRED_PROFILES_COLUMNS.filter(col => !new RegExp(`\\b${col}\\b`).test(profilesBody));
  check('supabase-schema.sql profiles has all critical columns used by the app', profilesMatch !== null && missingProfilesCols.length === 0);
  if (missingProfilesCols.length > 0) console.error('  missing in schema profiles:', missingProfilesCols.join(', '));

  const plansMatch = schema.match(/create table if not exists public\.investment_plans \(([\s\S]*?)\n\);/);
  const plansBody = plansMatch ? plansMatch[1] : '';
  check('supabase-schema.sql investment_plans uses "amount" (not "monthly_amount")', /\bamount\s+numeric\s+not null\b/.test(plansBody) && !/\bmonthly_amount\b/.test(plansBody));
  check('supabase-schema.sql investment_plans has plan_updated_at', /\bplan_updated_at\b/.test(plansBody));

  check('supabase-schema.sql defines the investor_profiles view', /create or replace view public\.investor_profiles as/.test(schema));
}

if (types !== null) {
  check('database.types.ts investment_plans Row has "amount" (not "monthly_amount")', /investment_plans:[\s\S]*?Row:\s*\{[\s\S]*?\bamount: number/.test(types));
  check('database.types.ts declares the investor_profiles view', /investor_profiles:\s*\{/.test(types));
}

if (types !== null) {
  const missing = REQUIRED_COLUMNS.filter(col => !new RegExp(`\\b${col}\\b`).test(types));
  check(`database.types.ts mentions all ${REQUIRED_COLUMNS.length} expected import_audit_logs columns`, missing.length === 0);
  if (missing.length > 0) console.error('  missing in types:', missing.join(', '));
}

const failed = checks.filter(c => !c.ok);

for (const c of checks) {
  console.log(`${c.ok ? 'ok' : 'FAIL'} - ${c.label}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nAll import_audit_logs schema/type consistency checks passed.');
