export type ParsedHolding = { ticker: string; units: number; avg_price: number; name?: string };

export type TransactionType = 'buy' | 'sell' | 'dividend' | 'withholding_tax' | 'interest' | 'interest_tax' | 'deposit';

export type ParsedTransaction = {
  external_id: string;
  ticker?: string;
  type: TransactionType;
  units?: number;
  price?: number;
  amount: number;
  executed_at: string;
  notes?: string;
};

export type ParseResult = { holdings: ParsedHolding[]; transactions: ParsedTransaction[] };

// Excel serial date → ISO string
export function xlDateToIso(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString();
}

export function rowsToHoldings(header: string[], rows: string[][]): ParsedHolding[] {
  const h = header.map(c => c.toLowerCase().trim());
  const tickerIdx = h.indexOf('ticker');
  const unitsIdx = h.indexOf('units');
  const priceIdx = h.findIndex(c => c === 'avg_price' || c === 'price');
  const nameIdx = h.indexOf('name');
  if (tickerIdx === -1 || unitsIdx === -1 || priceIdx === -1) throw new Error('missing columns');
  return rows.map(cols => {
    const ticker = String(cols[tickerIdx] ?? '').trim().toUpperCase();
    const units = parseFloat(String(cols[unitsIdx]).replace(',', '.'));
    const avg_price = parseFloat(String(cols[priceIdx]).replace(',', '.'));
    if (!ticker || Number.isNaN(units) || Number.isNaN(avg_price)) throw new Error('bad row');
    return { ticker, units, avg_price, name: nameIdx >= 0 ? String(cols[nameIdx] ?? '').trim() || undefined : undefined };
  });
}

export function parseHoldingsCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error('empty');
  const header = lines[0].split(',');
  const rows = lines.slice(1).map(l => l.split(','));
  return { holdings: rowsToHoldings(header, rows), transactions: [] };
}

// Maps an XTB "Type" cell to our internal transaction type. Returns null for
// rows we intentionally ignore (e.g. rollovers, unrecognized categories).
function mapXtbType(rawType: string): TransactionType | null {
  const t = rawType.toLowerCase();
  if (t.includes('stock') || t.includes('etf')) return t.includes('sale') || t.includes('sell') ? 'sell' : 'buy';
  if (t === 'divident' || t === 'dividend') return 'dividend';
  if (t.includes('withholding')) return 'withholding_tax';
  if (t.includes('free funds interest') && t.includes('tax')) return 'interest_tax';
  if (t.includes('free funds interest')) return 'interest';
  if (t === 'deposit') return 'deposit';
  return null;
}

// Finds the header row and builds a column-name -> index map. Column order
// and exact naming (Symbol vs Ticker) vary between XTB export variants, so
// we resolve by name instead of fixed position.
function findXtbHeader(data: (string | number | null)[][]): { rowIdx: number; cols: Record<string, number> } | null {
  for (let i = 0; i < data.length; i++) {
    const row = data[i].map(c => String(c ?? '').trim().toLowerCase());
    if (row.includes('id') && row.includes('type')) {
      const cols: Record<string, number> = {};
      row.forEach((cell, idx) => { cols[cell] = idx; });
      return { rowIdx: i, cols };
    }
  }
  return null;
}

export async function parseXlsxFile(buffer: ArrayBuffer): Promise<ParseResult> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array' });

  // ── XTB format detection ──────────────────────────────────────────
  const cashSheet = wb.SheetNames.find(n => n.toUpperCase().includes('CASH OPERATION'));
  if (cashSheet) {
    const ws = wb.Sheets[cashSheet];
    const data = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1 });
    const header = findXtbHeader(data);
    if (!header) throw new Error('xtb_no_header');
    const { rowIdx, cols } = header;

    const idIdx = cols['id'];
    const typeIdx = cols['type'];
    const timeIdx = cols['time'];
    const commentIdx = cols['comment'];
    const symbolIdx = cols['symbol'] ?? cols['ticker'];
    const amountIdx = cols['amount'];

    const holdingsMap = new Map<string, { units: number; totalCost: number }>();
    const transactions: ParsedTransaction[] = [];

    for (const row of data.slice(rowIdx + 1)) {
      const extId = String(row[idIdx] ?? '').trim();
      const rawType = String(row[typeIdx] ?? '');
      const timeSer = typeof row[timeIdx] === 'number' ? (row[timeIdx] as number) : null;
      const comment = String(row[commentIdx] ?? '');
      const symbol = symbolIdx != null ? String(row[symbolIdx] ?? '').trim() : '';
      const amount = typeof row[amountIdx] === 'number' ? (row[amountIdx] as number) : 0;
      if (!extId || !rawType) continue;

      const txType = mapXtbType(rawType);
      if (!txType) continue;

      const executedAt = timeSer ? xlDateToIso(timeSer) : new Date().toISOString();

      if (txType === 'buy' || txType === 'sell') {
        const volumeMatch = comment.match(/OPEN (?:BUY|SELL) ([0-9.]+)/);
        const priceMatch = comment.match(/@ ([0-9.]+)/);
        if (!volumeMatch || !priceMatch || !symbol) continue;
        const volume = parseFloat(volumeMatch[1]);
        const price = parseFloat(priceMatch[1]);
        if (isNaN(volume) || isNaN(price)) continue;

        // Update holdings map. On a sale, reduce totalCost proportionally too
        // (at the average cost basis before this sale) so avg_price stays
        // constant instead of inflating as units are sold off.
        const h = holdingsMap.get(symbol) ?? { units: 0, totalCost: 0 };
        if (txType === 'sell') {
          const avgCostBefore = h.units > 0 ? h.totalCost / h.units : 0;
          h.units -= volume;
          h.totalCost -= volume * avgCostBefore;
        } else {
          h.units += volume;
          h.totalCost += volume * price;
        }
        holdingsMap.set(symbol, h);

        transactions.push({
          external_id: `xtb_${extId}`,
          ticker: symbol,
          type: txType,
          units: volume,
          price,
          amount: Math.abs(amount),
          executed_at: executedAt,
        });
        continue;
      }

      if (txType === 'dividend' || txType === 'withholding_tax') {
        if (!symbol) continue;
        transactions.push({
          external_id: `xtb_${extId}`,
          ticker: symbol,
          type: txType,
          amount,
          executed_at: executedAt,
          notes: comment || undefined,
        });
        continue;
      }

      // interest, interest_tax, deposit: no ticker
      transactions.push({
        external_id: `xtb_${extId}`,
        type: txType,
        amount,
        executed_at: executedAt,
        notes: comment || undefined,
      });
    }

    const holdings = Array.from(holdingsMap.entries())
      .filter(([, h]) => h.units > 0.0001)
      .map(([ticker, h]) => ({
        ticker,
        units: Math.round(h.units * 10000) / 10000,
        avg_price: Math.round((h.totalCost / h.units) * 100) / 100,
      }));

    return { holdings, transactions };
  }

  // ── Generic format ────────────────────────────────────────────────
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];
  if (data.length < 2) throw new Error('empty');
  const holdings = rowsToHoldings(data[0], data.slice(1).filter(r => r.some(c => c != null && c !== '')));
  return { holdings, transactions: [] };
}

export async function parseFile(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return parseHoldingsCsv(await file.text());
  if (ext === 'xlsx' || ext === 'xlsm') return parseXlsxFile(await file.arrayBuffer());
  throw new Error('unsupported_format');
}
