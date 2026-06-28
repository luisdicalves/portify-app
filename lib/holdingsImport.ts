export type ParsedHolding = { ticker: string; units: number; avg_price: number; name?: string };
export type ParsedTransaction = {
  external_id: string;
  ticker: string;
  type: 'buy' | 'sell' | 'dividend';
  units?: number;
  price?: number;
  amount: number;
  executed_at: string;
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

export async function parseXlsxFile(buffer: ArrayBuffer): Promise<ParseResult> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array' });

  // ── XTB format detection ──────────────────────────────────────────
  const cashSheet = wb.SheetNames.find(n => n.toUpperCase().includes('CASH OPERATION'));
  if (cashSheet) {
    const ws = wb.Sheets[cashSheet];
    const data = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1 });
    const headerIdx = data.findIndex(row => String(row[0]).trim() === 'ID' && String(row[1]).trim() === 'Type');
    if (headerIdx === -1) throw new Error('xtb_no_header');

    const holdingsMap = new Map<string, { units: number; totalCost: number }>();
    const transactions: ParsedTransaction[] = [];

    for (const row of data.slice(headerIdx + 1)) {
      const extId = String(row[0] ?? '').trim();
      const type = String(row[1] ?? '');
      const timeSer = typeof row[2] === 'number' ? row[2] : null;
      const comment = String(row[3] ?? '');
      const symbol = String(row[4] ?? '').trim();
      const amount = typeof row[5] === 'number' ? row[5] : 0;
      if (!extId || !type) continue;

      const typeLow = type.toLowerCase();
      const executedAt = timeSer ? xlDateToIso(timeSer) : new Date().toISOString();

      if (typeLow.includes('stock')) {
        const volumeMatch = comment.match(/OPEN (?:BUY|SELL) ([0-9.]+)/);
        const priceMatch = comment.match(/@ ([0-9.]+)/);
        if (!volumeMatch || !priceMatch || !symbol) continue;
        const volume = parseFloat(volumeMatch[1]);
        const price = parseFloat(priceMatch[1]);
        if (isNaN(volume) || isNaN(price)) continue;
        const isSale = typeLow.includes('sale') || typeLow.includes('sell');
        const txType = isSale ? 'sell' : 'buy';

        // Update holdings map. On a sale, reduce totalCost proportionally too
        // (at the average cost basis before this sale) so avg_price stays
        // constant instead of inflating as units are sold off.
        const h = holdingsMap.get(symbol) ?? { units: 0, totalCost: 0 };
        if (isSale) {
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
      } else if (typeLow === 'divident' || typeLow === 'dividend') {
        if (!symbol) continue;
        transactions.push({
          external_id: `xtb_${extId}`,
          ticker: symbol,
          type: 'dividend',
          amount,
          executed_at: executedAt,
        });
      }
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
  if (ext === 'xlsx') return parseXlsxFile(await file.arrayBuffer());
  const text = await file.text();
  return parseHoldingsCsv(text);
}
