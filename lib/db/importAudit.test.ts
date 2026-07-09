import { describe, it, expect } from 'vitest';
import {
  determineImportStatus, computeImportFileHash, buildImportAuditLogInsert,
  type CreateImportAuditLogInput,
} from './importAudit';
import type { ImportPreview, ImportPreviewRow } from '@/lib/holdingsImport';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<ImportPreviewRow> = {}): ImportPreviewRow {
  return {
    rowNumber: 2,
    status: 'valid',
    original: { id: '1', type: 'dividend' },
    transaction: {
      external_id: 'xtb_1', ticker: 'AAPL.US', type: 'dividend',
      amount: 12.34, executed_at: '2023-01-04T00:00:00.000Z',
    },
    issues: [],
    ...overrides,
  };
}

function makePreview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  const rows = overrides.rows ?? [makeRow()];
  return {
    parserName: 'xtb',
    parserVersion: '1.0.0',
    fileName: 'extract.xlsx',
    totalRows: rows.length,
    validRows: rows.filter(r => r.status === 'valid' || r.status === 'warning').length,
    invalidRows: rows.filter(r => r.status === 'error').length,
    duplicateRows: rows.filter(r => r.status === 'duplicate').length,
    warnings: rows.flatMap(r => r.issues.filter(i => i.severity === 'warning')),
    errors: rows.flatMap(r => r.issues.filter(i => i.severity === 'error')),
    rows,
    summary: { buys: 0, sells: 0, dividends: 1, withholdingTaxes: 0, interest: 0, interestTaxes: 0, deposits: 0, currencies: [], tickers: ['AAPL.US'] },
    holdings: [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// determineImportStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('determineImportStatus', () => {
  it('is "completed" when every eligible row was imported and there was no write error', () => {
    expect(determineImportStatus({ eligibleRows: 3, importedRows: 3, writeError: false })).toBe('completed');
  });

  it('is "completed" when there was nothing eligible to import (not a failure)', () => {
    expect(determineImportStatus({ eligibleRows: 0, importedRows: 0, writeError: false })).toBe('completed');
  });

  it('is "partial" when some, but not all, eligible rows were imported', () => {
    expect(determineImportStatus({ eligibleRows: 5, importedRows: 2, writeError: false })).toBe('partial');
  });

  it('is "failed" when there were eligible rows but none were imported', () => {
    expect(determineImportStatus({ eligibleRows: 3, importedRows: 0, writeError: false })).toBe('failed');
  });

  it('is "failed" when the write itself errored and nothing was imported', () => {
    expect(determineImportStatus({ eligibleRows: 3, importedRows: 0, writeError: true })).toBe('failed');
  });

  it('is "partial" when the write errored but some rows had already been imported', () => {
    expect(determineImportStatus({ eligibleRows: 3, importedRows: 1, writeError: true })).toBe('partial');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeImportFileHash
// ─────────────────────────────────────────────────────────────────────────────

describe('computeImportFileHash', () => {
  it('is deterministic for the same preview content', () => {
    const a = computeImportFileHash(makePreview());
    const b = computeImportFileHash(makePreview());
    expect(a).toBe(b);
  });

  it('changes when the row content changes', () => {
    const a = computeImportFileHash(makePreview());
    const b = computeImportFileHash(makePreview({ rows: [makeRow({ transaction: { external_id: 'xtb_2', ticker: 'MSFT.US', type: 'dividend', amount: 5, executed_at: '2023-01-04T00:00:00.000Z' } })] }));
    expect(a).not.toBe(b);
  });

  it('is independent of the uploaded filename (content-based, not name-based)', () => {
    const a = computeImportFileHash(makePreview({ fileName: 'jan-extract.xlsx' }));
    const b = computeImportFileHash(makePreview({ fileName: 'february-export.xlsx' }));
    expect(a).toBe(b);
  });

  it('changes when the parser version changes', () => {
    const a = computeImportFileHash(makePreview({ parserVersion: '1.0.0' }));
    const b = computeImportFileHash(makePreview({ parserVersion: '1.1.0' }));
    expect(a).not.toBe(b);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildImportAuditLogInsert — pure payload builder, no Supabase client needed
// ─────────────────────────────────────────────────────────────────────────────

describe('buildImportAuditLogInsert', () => {
  function makeInput(overrides: Partial<CreateImportAuditLogInput> = {}): CreateImportAuditLogInput {
    return {
      userId: 'user-1',
      filename: 'extract.xlsx',
      parserName: 'xtb',
      parserVersion: '1.0.0',
      preview: makePreview(),
      ...overrides,
    };
  }

  it('starts every new audit log as "pending"', () => {
    const row = buildImportAuditLogInsert(makeInput());
    expect(row.status).toBe('pending');
    expect(row.imported_rows).toBe(0);
    expect(row.skipped_rows).toBe(0);
  });

  it('carries over totalRows/validRows/invalidRows/duplicateRows from the preview', () => {
    const preview = makePreview({
      rows: [makeRow(), makeRow({ status: 'error', issues: [{ severity: 'error', code: 'x', message: 'bad' }] })],
      totalRows: 2, validRows: 1, invalidRows: 1, duplicateRows: 0,
    });
    const row = buildImportAuditLogInsert(makeInput({ preview }));
    expect(row.total_rows).toBe(2);
    expect(row.valid_rows).toBe(1);
    expect(row.invalid_rows).toBe(1);
    expect(row.duplicate_rows).toBe(0);
  });

  it('counts warnings and errors from the preview', () => {
    const warningRow = makeRow({ status: 'warning', issues: [{ severity: 'warning', code: 'w1', message: 'careful' }] });
    const errorRow = makeRow({ status: 'error', issues: [{ severity: 'error', code: 'e1', message: 'bad' }] });
    const preview = makePreview({
      rows: [warningRow, errorRow],
      warnings: [{ severity: 'warning', code: 'w1', message: 'careful' }],
      errors: [{ severity: 'error', code: 'e1', message: 'bad' }],
    });
    const row = buildImportAuditLogInsert(makeInput({ preview }));
    expect(row.warning_count).toBe(1);
    expect(row.error_count).toBe(1);
  });

  it('never includes raw file content — only the preview summary/warnings/errors', () => {
    const row = buildImportAuditLogInsert(makeInput());
    const keys = Object.keys(row);
    expect(keys).not.toContain('content');
    expect(keys).not.toContain('rawFile');
    expect(keys).not.toContain('rows');
  });

  it('serializes summary/warnings/errors as valid JSON', () => {
    const row = buildImportAuditLogInsert(makeInput());
    expect(() => JSON.stringify(row)).not.toThrow();
    const roundTripped = JSON.parse(JSON.stringify(row));
    expect(roundTripped.summary).toEqual(row.summary);
    expect(roundTripped.warnings).toEqual(row.warnings);
    expect(roundTripped.errors).toEqual(row.errors);
  });

  it('defaults file_hash to null when not provided', () => {
    const row = buildImportAuditLogInsert(makeInput());
    expect(row.file_hash).toBeNull();
  });

  it('uses the provided fileHash when given', () => {
    const row = buildImportAuditLogInsert(makeInput({ fileHash: 'abc123' }));
    expect(row.file_hash).toBe('abc123');
  });
});
