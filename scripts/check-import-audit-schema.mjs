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
