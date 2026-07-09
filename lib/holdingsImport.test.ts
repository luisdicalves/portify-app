import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  xlDateToIso, rowsToHoldings, parseHoldingsCsv, parseXlsxFile,
  mapXtbRowToTransaction, parseXtbRows, detectImportDuplicates, previewFile,
  XTB_IMPORT_PARSER_VERSION,
  type ExistingTransactionLike,
} from './holdingsImport';

async function buildXtbBuffer(rows: (string | number | null)[][]): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CASH OPERATION HISTORY');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return out as ArrayBuffer;
}

function makeFile(name: string, buffer: ArrayBuffer): File {
  return new File([buffer], name);
}

function makeCols(header: string[]): Record<string, number> {
  const cols: Record<string, number> = {};
  header.forEach((h, i) => { cols[h.toLowerCase().trim()] = i; });
  return cols;
}

describe('xlDateToIso', () => {
  it('converts an Excel serial date to the matching ISO date', () => {
    // 44927 = 2023-01-01 in Excel's 1900 date system
    expect(xlDateToIso(44927)).toBe('2023-01-01T00:00:00.000Z');
  });
});

describe('rowsToHoldings', () => {
  it('parses ticker/units/avg_price columns regardless of order', () => {
    const header = ['units', 'ticker', 'price'];
    const rows = [['10', 'AAPL', '150.5']];
    expect(rowsToHoldings(header, rows)).toEqual([
      { ticker: 'AAPL', units: 10, avg_price: 150.5, name: undefined },
    ]);
  });

  it('accepts comma decimals and an optional name column', () => {
    const header = ['ticker', 'units', 'avg_price', 'name'];
    const rows = [['NVDA', '2,5', '875,3', 'NVIDIA Corp.']];
    expect(rowsToHoldings(header, rows)).toEqual([
      { ticker: 'NVDA', units: 2.5, avg_price: 875.3, name: 'NVIDIA Corp.' },
    ]);
  });

  it('throws when a required column is missing', () => {
    expect(() => rowsToHoldings(['ticker', 'units'], [['AAPL', '1']])).toThrow('missing columns');
  });

  it('throws on a row with an unparseable number', () => {
    expect(() => rowsToHoldings(['ticker', 'units', 'price'], [['AAPL', 'x', '1']])).toThrow('bad row');
  });
});

describe('parseHoldingsCsv', () => {
  it('parses a simple CSV into holdings with no transactions', () => {
    const csv = 'ticker,units,avg_price\nAAPL,10,150.5\nMSFT,5,300';
    expect(parseHoldingsCsv(csv)).toEqual({
      holdings: [
        { ticker: 'AAPL', units: 10, avg_price: 150.5, name: undefined },
        { ticker: 'MSFT', units: 5, avg_price: 300, name: undefined },
      ],
      transactions: [],
    });
  });

  it('throws on an empty file', () => {
    expect(() => parseHoldingsCsv('')).toThrow('empty');
  });
});

describe('parseXlsxFile (XTB format)', () => {
  it('aggregates buy/sell rows into holdings and emits matching transactions', async () => {
    const buffer = await buildXtbBuffer([
      ['ID', 'Type', 'Time', 'Comment', 'Symbol', 'Amount'],
      ['1', 'Stocks/ETF purchase', 44927, 'OPEN BUY 10 @ 150.5', 'AAPL.US', -1505],
      ['2', 'Stocks/ETF sale', 44928, 'OPEN SELL 4 @ 160', 'AAPL.US', 640],
    ]);

    const result = await parseXlsxFile(buffer);

    // avg_price (cost basis) should stay constant across a partial sale.
    expect(result.holdings).toEqual([
      { ticker: 'AAPL.US', units: 6, avg_price: 150.5 },
    ]);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({ external_id: 'xtb_1', ticker: 'AAPL.US', type: 'buy', units: 10, price: 150.5, amount: 1505 });
    expect(result.transactions[1]).toMatchObject({ external_id: 'xtb_2', ticker: 'AAPL.US', type: 'sell', units: 4, price: 160, amount: 640 });
  });

  it('emits a dividend transaction without affecting holdings', async () => {
    const buffer = await buildXtbBuffer([
      ['ID', 'Type', 'Time', 'Comment', 'Symbol', 'Amount'],
      ['3', 'dividend', 44930, '', 'AAPL.US', 12.34],
    ]);

    const result = await parseXlsxFile(buffer);

    expect(result.holdings).toEqual([]);
    expect(result.transactions).toEqual([
      { external_id: 'xtb_3', ticker: 'AAPL.US', type: 'dividend', amount: 12.34, executed_at: '2023-01-04T00:00:00.000Z' },
    ]);
  });

  it('drops a position entirely once units are fully sold', async () => {
    const buffer = await buildXtbBuffer([
      ['ID', 'Type', 'Time', 'Comment', 'Symbol', 'Amount'],
      ['1', 'Stocks/ETF purchase', 44927, 'OPEN BUY 10 @ 150.5', 'AAPL.US', -1505],
      ['2', 'Stocks/ETF sale', 44928, 'OPEN SELL 10 @ 160', 'AAPL.US', 1600],
    ]);

    const result = await parseXlsxFile(buffer);

    expect(result.holdings).toEqual([]);
  });

  it('throws when the sheet has no recognizable ID/Type header row', async () => {
    const buffer = await buildXtbBuffer([['something', 'else']]);
    await expect(parseXlsxFile(buffer)).rejects.toThrow('xtb_no_header');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapXtbRowToTransaction — per-row parse + validate (import preview layer)
// ─────────────────────────────────────────────────────────────────────────────

describe('mapXtbRowToTransaction', () => {
  const HEADER = ['ID', 'Type', 'Time', 'Comment', 'Symbol', 'Amount'];
  const cols = makeCols(HEADER);

  it('1. parses a valid buy row', () => {
    const { transaction, issues } = mapXtbRowToTransaction(['1', 'Stocks/ETF purchase', 44927, 'OPEN BUY 10 @ 150.5', 'AAPL.US', -1505], cols, 2);
    expect(issues).toEqual([]);
    expect(transaction).toMatchObject({ external_id: 'xtb_1', ticker: 'AAPL.US', type: 'buy', units: 10, price: 150.5, amount: 1505 });
  });

  it('2. parses a valid sell row', () => {
    const { transaction, issues } = mapXtbRowToTransaction(['2', 'Stocks/ETF sale', 44928, 'OPEN SELL 4 @ 160', 'AAPL.US', 640], cols, 3);
    expect(issues).toEqual([]);
    expect(transaction).toMatchObject({ external_id: 'xtb_2', ticker: 'AAPL.US', type: 'sell', units: 4, price: 160, amount: 640 });
  });

  it('3. parses a valid dividend row', () => {
    const { transaction, issues } = mapXtbRowToTransaction(['3', 'dividend', 44930, '', 'AAPL.US', 12.34], cols, 4);
    expect(issues).toEqual([]);
    expect(transaction).toMatchObject({ external_id: 'xtb_3', ticker: 'AAPL.US', type: 'dividend', amount: 12.34 });
  });

  it('4. parses a valid withholding_tax row', () => {
    const { transaction, issues } = mapXtbRowToTransaction(['4', 'Withholding tax', 44930, '', 'AAPL.US', -1.85], cols, 5);
    expect(issues).toEqual([]);
    expect(transaction).toMatchObject({ external_id: 'xtb_4', ticker: 'AAPL.US', type: 'withholding_tax', amount: -1.85 });
  });

  it('5. parses a valid interest row', () => {
    const { transaction, issues } = mapXtbRowToTransaction(['5', 'Free funds interest', 44930, '', '', 2.1], cols, 6);
    expect(issues).toEqual([]);
    expect(transaction).toMatchObject({ external_id: 'xtb_5', type: 'interest', amount: 2.1 });
    expect(transaction?.ticker).toBeUndefined();
  });

  it('6. parses a valid interest_tax row', () => {
    const { transaction, issues } = mapXtbRowToTransaction(['6', 'Free funds interest tax', 44930, '', '', -0.3], cols, 7);
    expect(issues).toEqual([]);
    expect(transaction).toMatchObject({ external_id: 'xtb_6', type: 'interest_tax', amount: -0.3 });
  });

  it('7. parses a valid deposit row', () => {
    const { transaction, issues } = mapXtbRowToTransaction(['7', 'deposit', 44930, '', '', 500], cols, 8);
    expect(issues).toEqual([]);
    expect(transaction).toMatchObject({ external_id: 'xtb_7', type: 'deposit', amount: 500 });
  });

  it('8. an unrecognized type produces a row-level error, not a thrown exception', () => {
    const { transaction, issues } = mapXtbRowToTransaction(['8', 'Rollover fee', 44930, '', '', -1], cols, 9);
    expect(transaction).toBeUndefined();
    expect(issues).toEqual([{ severity: 'error', code: 'unknown_type', message: expect.stringContaining('não reconhecido'), rowNumber: 9, field: 'type' }]);
  });

  it('9. a buy without a ticker produces an error', () => {
    const { transaction, issues } = mapXtbRowToTransaction(['9', 'Stocks/ETF purchase', 44927, 'OPEN BUY 10 @ 150.5', '', -1505], cols, 10);
    expect(transaction).toBeUndefined();
    expect(issues.some(i => i.severity === 'error' && i.code === 'missing_ticker')).toBe(true);
  });

  it('10. an unparseable/invalid unit quantity produces an error', () => {
    const { transaction, issues } = mapXtbRowToTransaction(['10', 'Stocks/ETF purchase', 44927, 'OPEN BUY abc @ 150.5', 'AAPL.US', -1505], cols, 11);
    expect(transaction).toBeUndefined();
    expect(issues.some(i => i.severity === 'error' && i.code === 'invalid_units')).toBe(true);
  });

  it('11. an unparseable/invalid price produces an error', () => {
    const { transaction, issues } = mapXtbRowToTransaction(['11', 'Stocks/ETF purchase', 44927, 'OPEN BUY 10 @ xyz', 'AAPL.US', -1505], cols, 12);
    expect(transaction).toBeUndefined();
    expect(issues.some(i => i.severity === 'error' && i.code === 'invalid_price')).toBe(true);
  });

  it('12. a missing currency produces a warning, not an error, when the column exists', () => {
    const colsWithCurrency = makeCols([...HEADER, 'Currency']);
    const { transaction, issues } = mapXtbRowToTransaction(['12', 'dividend', 44930, '', 'AAPL.US', 12.34, ''], colsWithCurrency, 13);
    expect(transaction).toBeDefined();
    expect(issues).toEqual([{ severity: 'warning', code: 'missing_currency', message: expect.any(String), rowNumber: 13, field: 'currency' }]);
  });

  it('a dividend without a ticker produces an error (no report generated instead)', () => {
    const { transaction, issues } = mapXtbRowToTransaction(['13', 'dividend', 44930, '', '', 12.34], cols, 14);
    expect(transaction).toBeUndefined();
    expect(issues.some(i => i.severity === 'error' && i.code === 'missing_ticker')).toBe(true);
  });
});

describe('parseXtbRows — blank rows and full-sheet parsing', () => {
  it('13. blank rows are ignored, not reported, and don\'t throw', () => {
    const data = [
      ['ID', 'Type', 'Time', 'Comment', 'Symbol', 'Amount'],
      ['1', 'dividend', 44930, '', 'AAPL.US', 12.34],
      [null, null, null, null, null, null],
      ['', '', '', '', '', ''],
      ['2', 'deposit', 44930, '', '', 100],
    ];
    const cols = makeCols(data[0] as string[]);
    const rows = parseXtbRows(data as (string | number | null)[][], 0, cols);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.status)).toEqual(['valid', 'valid']);
  });
});

describe('detectImportDuplicates', () => {
  const HEADER = ['ID', 'Type', 'Time', 'Comment', 'Symbol', 'Amount'];
  const cols = makeCols(HEADER);

  function rowAt(id: string, rowNumber: number) {
    const { transaction, issues } = mapXtbRowToTransaction([id, 'dividend', 44930, '', 'AAPL.US', 12.34], cols, rowNumber);
    return { rowNumber, status: 'valid' as const, original: {}, transaction, issues };
  }

  it('14. flags a within-file duplicate (same business fields, different external ids)', () => {
    const rows = [rowAt('1', 2), rowAt('2', 3)]; // same date/type/ticker/amount, different XTB ids
    const result = detectImportDuplicates(rows);
    expect(result[0].status).toBe('valid');
    expect(result[1].status).toBe('duplicate');
  });

  it('15. flags a row that duplicates an already-saved transaction', () => {
    const rows = [rowAt('1', 2)];
    const existing: ExistingTransactionLike[] = [
      { ticker: 'AAPL.US', type: 'dividend', amount: 12.34, executed_at: '2023-01-04T00:00:00.000Z' }, // 44930 = 2023-01-04, see xlDateToIso
    ];
    const result = detectImportDuplicates(rows, existing);
    expect(result[0].status).toBe('duplicate');
  });

  it('does not flag a buy and a sell on the same day/ticker as duplicates of each other', () => {
    const buy = mapXtbRowToTransaction(['1', 'Stocks/ETF purchase', 44927, 'OPEN BUY 10 @ 150.5', 'AAPL.US', -1505], cols, 2);
    const sell = mapXtbRowToTransaction(['2', 'Stocks/ETF sale', 44927, 'OPEN SELL 10 @ 150.5', 'AAPL.US', 1505], cols, 3);
    const rows = [
      { rowNumber: 2, status: 'valid' as const, original: {}, transaction: buy.transaction, issues: [] },
      { rowNumber: 3, status: 'valid' as const, original: {}, transaction: sell.transaction, issues: [] },
    ];
    const result = detectImportDuplicates(rows);
    expect(result.map(r => r.status)).toEqual(['valid', 'valid']);
  });
});

describe('previewFile', () => {
  it('16. buildImportPreview via previewFile computes totalRows/validRows/invalidRows/duplicateRows correctly', async () => {
    const buffer = await buildXtbBuffer([
      ['ID', 'Type', 'Time', 'Comment', 'Symbol', 'Amount'],
      ['1', 'Stocks/ETF purchase', 44927, 'OPEN BUY 10 @ 150.5', 'AAPL.US', -1505], // valid
      ['2', 'Rollover fee', 44928, '', '', -1],                                     // error (unknown type)
      ['3', 'dividend', 44930, '', 'AAPL.US', 12.34],                               // valid
      ['4', 'dividend', 44930, '', 'AAPL.US', 12.34],                               // duplicate of row 3
    ]);
    const preview = await previewFile(makeFile('extract.xlsx', buffer));

    expect(preview.totalRows).toBe(4);
    expect(preview.invalidRows).toBe(1);
    expect(preview.duplicateRows).toBe(1);
    expect(preview.validRows).toBe(2);
  });

  it('17. buildImportPreview generates a per-type summary', async () => {
    const buffer = await buildXtbBuffer([
      ['ID', 'Type', 'Time', 'Comment', 'Symbol', 'Amount'],
      ['1', 'Stocks/ETF purchase', 44927, 'OPEN BUY 10 @ 150.5', 'AAPL.US', -1505],
      ['2', 'dividend', 44930, '', 'AAPL.US', 12.34],
      ['3', 'Withholding tax', 44930, '', 'AAPL.US', -1.85],
      ['4', 'deposit', 44930, '', '', 500],
    ]);
    const preview = await previewFile(makeFile('extract.xlsx', buffer));

    expect(preview.summary).toMatchObject({ buys: 1, sells: 0, dividends: 1, withholdingTaxes: 1, deposits: 1 });
    expect(preview.summary.tickers).toEqual(['AAPL.US']);
  });

  it('19. parserVersion appears in the preview and matches XTB_IMPORT_PARSER_VERSION', async () => {
    const buffer = await buildXtbBuffer([
      ['ID', 'Type', 'Time', 'Comment', 'Symbol', 'Amount'],
      ['1', 'deposit', 44930, '', '', 500],
    ]);
    const preview = await previewFile(makeFile('extract.xlsx', buffer));
    expect(preview.parserVersion).toBe(XTB_IMPORT_PARSER_VERSION);
    expect(preview.parserName).toBe('xtb');
  });

  it('20. filtering preview.rows by valid/warning status (the confirm-step selection) excludes invalid and duplicate rows', async () => {
    const buffer = await buildXtbBuffer([
      ['ID', 'Type', 'Time', 'Comment', 'Symbol', 'Amount'],
      ['1', 'dividend', 44930, '', 'AAPL.US', 12.34],  // valid
      ['2', 'Rollover fee', 44930, '', '', -1],          // error
      ['3', 'dividend', 44930, '', 'AAPL.US', 12.34],  // duplicate of row 1
    ]);
    const preview = await previewFile(makeFile('extract.xlsx', buffer));
    const toImport = preview.rows.filter(r => r.status === 'valid' || r.status === 'warning');

    expect(toImport).toHaveLength(1);
    expect(toImport[0].transaction?.external_id).toBe('xtb_1');
  });

  it('does not throw for an XLSX with only a header row (no data)', async () => {
    const buffer = await buildXtbBuffer([['ID', 'Type', 'Time', 'Comment', 'Symbol', 'Amount']]);
    const preview = await previewFile(makeFile('extract.xlsx', buffer));
    expect(preview.totalRows).toBe(0);
    expect(preview.errors).toEqual([]);
  });

  it('reports a friendly error instead of throwing when there is no recognizable header row', async () => {
    const buffer = await buildXtbBuffer([['something', 'else']]);
    const preview = await previewFile(makeFile('extract.xlsx', buffer));
    expect(preview.errors[0]?.code).toBe('xtb_no_header');
    expect(preview.totalRows).toBe(0);
  });
});

describe('purity — lib/holdingsImport.ts', () => {
  it('18. does not import Supabase, React, Next.js, or lib/marketData', () => {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(currentDir, 'holdingsImport.ts'), 'utf-8');

    expect(source).not.toMatch(/@supabase/);
    expect(source).not.toMatch(/['"]react['"]/);
    expect(source).not.toMatch(/next\//);
    expect(source).not.toMatch(/lib\/marketData/);
  });
});
