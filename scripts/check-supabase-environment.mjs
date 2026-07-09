#!/usr/bin/env node
// Guardrail: refuses to let a migration / database.types.ts regeneration /
// any other sensitive Supabase operation proceed against an ambiguous
// environment. See docs/supabase-environments.md for the full policy this
// enforces, and docs/import-audit-migration-runbook.md's "Environment
// confirmation gate" for how it's meant to be used.
//
// Reads only SUPABASE_ENVIRONMENT / SUPABASE_PROJECT_REF / NEXT_PUBLIC_SUPABASE_URL
// (never a key or secret) and supabase/.temp/linked-project.json (ref/name
// only, never a token). Never prints an unmasked project ref. No network
// access, no Supabase client, no dependencies beyond Node's standard library.
//
// Usage:
//   node scripts/check-supabase-environment.mjs
//   node scripts/check-supabase-environment.mjs --target=staging
//   node scripts/check-supabase-environment.mjs --target=production --confirm-production

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseArgs, evaluateEnvironment, VALID_ENVIRONMENTS } from './check-supabase-environment-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readLinkedProject() {
  try {
    const raw = readFileSync(join(root, 'supabase/.temp/linked-project.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed?.ref !== 'string') return null;
    return { ref: parsed.ref, name: typeof parsed.name === 'string' ? parsed.name : undefined };
  } catch {
    return null;
  }
}

const { target, confirmProduction } = parseArgs(process.argv.slice(2));

const result = evaluateEnvironment({
  supabaseEnvironment: process.env.SUPABASE_ENVIRONMENT,
  projectRefEnv: process.env.SUPABASE_PROJECT_REF,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  target,
  confirmProduction,
  linkedProject: readLinkedProject(),
});

console.log('Supabase environment check');
console.log('---------------------------');
console.log(`SUPABASE_ENVIRONMENT : ${process.env.SUPABASE_ENVIRONMENT ?? '(not set)'}`);
console.log(`--target             : ${target ?? '(not set)'}`);
console.log(`--confirm-production : ${confirmProduction}`);
console.log(`SUPABASE_PROJECT_REF : ${result.maskedProjectRefEnv ?? '(not set)'}`);
console.log(`linked project ref   : ${result.maskedLinkedRef ?? '(none found)'}`);
console.log(`linked project name  : ${result.linkedProjectName ?? '(none found)'}`);
console.log(`allowed values       : ${VALID_ENVIRONMENTS.join(', ')}`);
console.log('');

if (result.warnings.length > 0) {
  console.log('Warnings:');
  for (const w of result.warnings) console.log(`  - ${w}`);
  console.log('');
}

if (result.errors.length > 0) {
  console.error('FAILED:');
  for (const e of result.errors) console.error(`  - ${e}`);
  console.error('');
  console.error('See docs/supabase-environments.md before proceeding.');
  process.exit(1);
}

console.log('OK — environment is unambiguous for the requested operation.');
process.exit(0);
