import { describe, it, expect } from 'vitest';
import { xlDateToIso, rowsToHoldings, parseHoldingsCsv, parseXlsxFile } from './holdingsImport';

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
  async function buildXtbBuffer(rows: (string | number | null)[][]): Promise<ArrayBuffer> {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CASH OPERATION HISTORY');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return out as ArrayBuffer;
  }

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
