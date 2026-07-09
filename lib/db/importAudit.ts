// lib/db/importAudit.ts
//
// Persistent audit log for confirmed XTB/CSV imports (import_audit_logs
// table — see supabase-migration-import-audit-log.sql). Same conventions as
// the rest of lib/db/*: functions take a generic SupabaseClient<AppDatabase>
// (browser or server) as their first argument and return the raw Supabase
// response rather than throwing, so callers decide how to handle `.error`.
//
// No parser logic lives here — see docs/import-xtb.md for the full flow.
// This module only turns an already-built ImportPreview (lib/holdingsImport.ts)
// into rows for import_audit_logs, and never imports from holdingsImport.ts
// beyond its types, to keep the dependency graph one-directional
// (app/profile/settings/page.tsx -> both modules, not holdingsImport.ts -> this).

import type { AppDatabase } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportPreview } from '@/lib/holdingsImport';
import { createInputHash } from '@/lib/models/modelMeta';

type Client = SupabaseClient<AppDatabase>;
type ImportAuditLogInsert = AppDatabase['public']['Tables']['import_audit_logs']['Insert'];
type ImportAuditLogUpdate = AppDatabase['public']['Tables']['import_audit_logs']['Update'];

export type ImportAuditStatus = 'pending' | 'completed' | 'partial' | 'failed';

// ─────────────────────────────────────────────────────────────────────────
// computeImportFileHash — operational fingerprint, not a security mechanism
// ─────────────────────────────────────────────────────────────────────────
//
// Reuses lib/models/modelMeta.ts's createInputHash() (same 32-bit rolling
// hash, same limitations: no collision resistance, never use it for anything
// security-sensitive). Fingerprints the *parsed content* (parser version and
// each row's resulting transaction/original cells) rather than the raw file
// bytes — the raw file is never read into this hash and never stored
// anywhere. Deliberately excludes fileName: two uploads of the same
// underlying data should hash the same even if the file was renamed or
// re-exported under a different name, so this can help a user (or a future
// UI) notice "I think I already imported this" regardless of what the file
// was called — not a guarantee, just a heuristic.
export function computeImportFileHash(preview: ImportPreview): string {
  return createInputHash({
    parserVersion: preview.parserVersion,
    rows: preview.rows.map(r => r.transaction ?? r.original),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// determineImportStatus — pure, so it's directly unit-testable
// ─────────────────────────────────────────────────────────────────────────
//
//   eligibleRows — rows the confirm step actually attempted to write
//                  (preview.validRows: status 'valid' or 'warning').
//   importedRows — rows that were actually written.
//   writeError   — true when the write call itself returned/threw an error
//                  (as opposed to just writing fewer rows than expected).
//
// 'failed' means nothing was saved despite there being something to save.
// 'partial' means some, but not all, eligible rows made it in. An eligible
// count of 0 (nothing to import — e.g. every row was invalid or a duplicate)
// is 'completed', not 'failed': the import ran successfully, it just had
// nothing to write.
export function determineImportStatus(input: {
  eligibleRows: number;
  importedRows: number;
  writeError: boolean;
}): ImportAuditStatus {
  if (input.writeError) return input.importedRows > 0 ? 'partial' : 'failed';
  if (input.eligibleRows === 0) return 'completed';
  if (input.importedRows === 0) return 'failed';
  if (input.importedRows < input.eligibleRows) return 'partial';
  return 'completed';
}

// ─────────────────────────────────────────────────────────────────────────
// Create — called once, right after the user confirms, before any
// holdings/transactions write happens. If this fails, the caller must not
// proceed with the import (see docs/import-xtb.md).
// ─────────────────────────────────────────────────────────────────────────

export interface CreateImportAuditLogInput {
  userId: string;
  filename: string;
  fileHash?: string;
  parserName: 'xtb';
  parserVersion: string;
  preview: ImportPreview;
}

/**
 * Pure — turns a CreateImportAuditLogInput into the row to insert, with no
 * I/O. Split out from createImportAuditLog() so the payload-building logic
 * (counts, JSON serialization of summary/warnings/errors) is unit-testable
 * without a Supabase client/mock — see lib/db/importAudit.test.ts.
 */
export function buildImportAuditLogInsert(input: CreateImportAuditLogInput): ImportAuditLogInsert {
  return {
    user_id: input.userId,
    parser_name: input.parserName,
    parser_version: input.parserVersion,
    filename: input.filename,
    file_hash: input.fileHash ?? null,
    status: 'pending',
    total_rows: input.preview.totalRows,
    valid_rows: input.preview.validRows,
    invalid_rows: input.preview.invalidRows,
    duplicate_rows: input.preview.duplicateRows,
    imported_rows: 0,
    skipped_rows: 0,
    warning_count: input.preview.warnings.length,
    error_count: input.preview.errors.length,
    summary: input.preview.summary as unknown as ImportAuditLogInsert['summary'],
    warnings: input.preview.warnings as unknown as ImportAuditLogInsert['warnings'],
    errors: input.preview.errors as unknown as ImportAuditLogInsert['errors'],
  };
}

export async function createImportAuditLog(db: Client, input: CreateImportAuditLogInput) {
  return db.from('import_audit_logs').insert(buildImportAuditLogInsert(input)).select().single();
}

// ─────────────────────────────────────────────────────────────────────────
// Complete — called after a write attempt that did not itself error.
// ─────────────────────────────────────────────────────────────────────────

export interface CompleteImportAuditLogInput {
  userId: string;
  importId: string;
  /** Rows the confirm step attempted to write (preview.validRows). */
  eligibleRows: number;
  importedRows: number;
  /** Total rows never saved, for any reason (invalid + duplicate + any write-time gap). */
  skippedRows: number;
}

export async function completeImportAuditLog(db: Client, input: CompleteImportAuditLogInput) {
  const status = determineImportStatus({
    eligibleRows: input.eligibleRows,
    importedRows: input.importedRows,
    writeError: false,
  });

  const patch: ImportAuditLogUpdate = {
    status,
    imported_rows: input.importedRows,
    skipped_rows: input.skippedRows,
    completed_at: new Date().toISOString(),
  };

  return db
    .from('import_audit_logs')
    .update(patch)
    .eq('id', input.importId)
    .eq('user_id', input.userId)
    .select()
    .single();
}

// ─────────────────────────────────────────────────────────────────────────
// Fail — called when the write call itself errored (network/DB error), not
// merely when some rows were skipped. Overwrites `errors` with the write
// failure rather than appending to the preview-time errors already stored at
// creation — a write failure is a different kind of problem (infrastructure,
// not row validation) and is more useful surfaced on its own.
// ─────────────────────────────────────────────────────────────────────────

export interface FailImportAuditLogInput {
  userId: string;
  importId: string;
  error: string;
  /** Rows that did make it in before the failure, if any (partial writes) — defaults to 0. */
  importedRows?: number;
}

export async function failImportAuditLog(db: Client, input: FailImportAuditLogInput) {
  const importedRows = input.importedRows ?? 0;
  const status = determineImportStatus({ eligibleRows: 1, importedRows, writeError: true });

  const patch: ImportAuditLogUpdate = {
    status,
    imported_rows: importedRows,
    completed_at: new Date().toISOString(),
    errors: [{ severity: 'error', code: 'write_failed', message: input.error }] as unknown as ImportAuditLogUpdate['errors'],
  };

  return db
    .from('import_audit_logs')
    .update(patch)
    .eq('id', input.importId)
    .eq('user_id', input.userId)
    .select()
    .single();
}

// ─────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────

export async function listImportAuditLogs(db: Client, userId: string, limit = 5) {
  return db
    .from('import_audit_logs')
    .select('id, filename, parser_name, parser_version, status, total_rows, imported_rows, skipped_rows, created_at, completed_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
}

export async function getImportAuditLog(db: Client, userId: string, importId: string) {
  return db
    .from('import_audit_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('id', importId)
    .maybeSingle();
}
