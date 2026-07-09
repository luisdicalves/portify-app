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

// ─────────────────────────────────────────────────────────────────────────────
// Import preview — parse+validate+detect-duplicates before anything is saved.
// See docs/import-xtb.md for the full flow and docs/model-map.md for status.
//
// Bump XTB_IMPORT_PARSER_VERSION whenever the column mapping, transaction-type
// detection, or validation rules change — it's surfaced in every ImportPreview
// so a saved/reported preview can be traced back to the logic that produced it.
// Kept separate from lib/models/modelMeta.ts's ModelRunMeta: this parser reads
// broker export files, not user/market data feeding a scoring model, and has no
// natural "input" to hash the way the governed models do — a plain version
// string is simpler and sufficient here.
// ─────────────────────────────────────────────────────────────────────────────

export const XTB_IMPORT_PARSER_VERSION = '1.0.0';

/** Alias for readability at the preview-row boundary — same shape as ParsedTransaction. */
export type ImportedTransaction = ParsedTransaction;

export type ImportIssueSeverity = 'warning' | 'error';

export type ImportIssue = {
  severity: ImportIssueSeverity;
  code: string;
  message: string;
  rowNumber?: number;
  field?: string;
};

export type ImportRowStatus = 'valid' | 'warning' | 'error' | 'duplicate';

export type ImportPreviewRow = {
  rowNumber: number;
  status: ImportRowStatus;
  original: Record<string, unknown>;
  transaction?: ImportedTransaction;
  issues: ImportIssue[];
  duplicateKey?: string;
};

export type ImportPreviewSummary = {
  buys: number;
  sells: number;
  dividends: number;
  withholdingTaxes: number;
  interest: number;
  interestTaxes: number;
  deposits: number;
  /** Sum of `amount` across importable rows. Not a meaningful "P&L" figure — buy/sell/dividend/tax amounts mix signs and semantics; kept for a rough at-a-glance total only. */
  totalGrossAmount?: number;
  /** Not computed — "net" isn't well-defined across mixed transaction types with different signs. Reserved for a future, more specific need. */
  totalNetAmount?: number;
  currencies: string[];
  tickers: string[];
};

export type ImportPreview = {
  /** Reserved for a future persistent import-audit-log feature — always undefined today (out of scope for this task, see docs/import-xtb.md). */
  importId?: string;
  parserName: 'xtb';
  parserVersion: string;
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  warnings: ImportIssue[];
  errors: ImportIssue[];
  rows: ImportPreviewRow[];
  summary: ImportPreviewSummary;
  /** Holdings snapshot derived by replaying this file's own buy/sell rows (excluding error rows) — same "file replaces position" semantics the import already had, not a merge with existing DB holdings. */
  holdings: ParsedHolding[];
};

/** Minimal shape needed to compare a file row against an already-saved transaction for duplicate detection — matches lib/db/transactions.ts's getTransactions() row shape. */
export type ExistingTransactionLike = {
  ticker?: string | null;
  type: string;
  units?: number | null;
  price?: number | null;
  amount: number;
  executed_at?: string | null;
};

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
// rows we intentionally ignore (e.g. rollovers, unrecognized categories) —
// surfaced as an 'unknown_type' error by mapXtbRowToTransaction(), not silently
// dropped, unlike before this task's preview layer existed.
export function normalizeXtbTransactionType(rawType: string): TransactionType | null {
  const t = rawType.toLowerCase();
  if (t.includes('stock') || t.includes('etf')) return t.includes('sale') || t.includes('sell') ? 'sell' : 'buy';
  if (t === 'divident' || t === 'dividend') return 'dividend';
  if (t.includes('withholding')) return 'withholding_tax';
  if (t.includes('free funds interest') && t.includes('tax')) return 'interest_tax';
  if (t.includes('free funds interest')) return 'interest';
  if (t === 'deposit') return 'deposit';
  return null;
}

export function normalizeTicker(raw: string | number | null | undefined): string {
  return String(raw ?? '').trim().toUpperCase();
}

/** Parses a money/quantity cell that may use either a dot or a comma as the decimal separator. Returns NaN, never throws — callers decide whether that's an error. */
export function normalizeMoney(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return raw;
  const s = String(raw ?? '').trim().replace(',', '.');
  return s === '' ? NaN : parseFloat(s);
}

/** Excel serial number or a date-like string → ISO string, or null if unparseable/empty. */
export function normalizeDate(raw: string | number | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return xlDateToIso(raw);
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const KNOWN_CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'GBX', 'CHF', 'PLN', 'JPY', 'HKD', 'CAD', 'SEK', 'NOK', 'DKK']);

function isBlankRow(row: (string | number | null)[]): boolean {
  return row.every(c => c == null || String(c).trim() === '');
}

function issue(severity: ImportIssueSeverity, code: string, message: string, rowNumber: number, field?: string): ImportIssue {
  return { severity, code, message, rowNumber, field };
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

/**
 * Parses and validates a single XTB "CASH OPERATION HISTORY" row. Pure and
 * side-effect-free: never throws, never calls Supabase/an API/React — any
 * problem becomes an ImportIssue instead. Returns `transaction: undefined`
 * when an error issue means the row can't be turned into one at all.
 *
 * Shared by the legacy parseXlsxFile() (which keeps a row only when there are
 * no error-severity issues, reproducing its pre-existing silent-skip
 * behavior) and parseXtbRows() (which keeps every row, errors included, for
 * the import preview).
 */
export function mapXtbRowToTransaction(
  row: (string | number | null)[],
  cols: Record<string, number>,
  rowNumber: number,
): { transaction?: ImportedTransaction; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const cell = (name: string): string | number | null => {
    const idx = cols[name];
    return idx != null ? row[idx] ?? null : null;
  };

  const extId = String(cell('id') ?? '').trim();
  const rawType = String(cell('type') ?? '').trim();
  const timeCell = cell('time');
  const comment = String(cell('comment') ?? '');
  const symbol = normalizeTicker(cell('symbol') ?? cell('ticker'));
  const amountCell = cell('amount');
  const amount = typeof amountCell === 'number' ? amountCell : 0;
  const currencyCell = cols['currency'] != null ? String(cell('currency') ?? '').trim().toUpperCase() : undefined;

  if (!extId) issues.push(issue('error', 'missing_id', 'Linha sem ID de operação.', rowNumber, 'id'));
  if (!rawType) issues.push(issue('error', 'missing_type', 'Linha sem tipo de operação.', rowNumber, 'type'));
  if (!extId || !rawType) return { issues };

  const txType = normalizeXtbTransactionType(rawType);
  if (!txType) {
    issues.push(issue('error', 'unknown_type', `Tipo de operação não reconhecido: "${rawType}".`, rowNumber, 'type'));
    return { issues };
  }

  if (timeCell == null || timeCell === '') {
    issues.push(issue('warning', 'missing_date', 'Data em falta — foi usada a data actual.', rowNumber, 'time'));
  }
  const executedAt = typeof timeCell === 'number' ? xlDateToIso(timeCell) : (normalizeDate(timeCell) ?? new Date().toISOString());

  if (currencyCell !== undefined) {
    if (!currencyCell) issues.push(issue('warning', 'missing_currency', 'Moeda em falta nesta linha.', rowNumber, 'currency'));
    else if (!KNOWN_CURRENCIES.has(currencyCell)) issues.push(issue('warning', 'unknown_currency', `Moeda não reconhecida: "${currencyCell}".`, rowNumber, 'currency'));
  }

  if (txType === 'buy' || txType === 'sell') {
    if (!symbol) issues.push(issue('error', 'missing_ticker', `${txType === 'buy' ? 'Compra' : 'Venda'} sem ticker.`, rowNumber, 'symbol'));

    const volumeMatch = comment.match(/OPEN (?:BUY|SELL) ([0-9.]+)/);
    const priceMatch = comment.match(/@ ([0-9.]+)/);
    const volume = volumeMatch ? parseFloat(volumeMatch[1]) : NaN;
    const price = priceMatch ? parseFloat(priceMatch[1]) : NaN;

    if (!volumeMatch || Number.isNaN(volume) || volume <= 0) issues.push(issue('error', 'invalid_units', 'Não foi possível determinar uma quantidade de unidades válida.', rowNumber, 'comment'));
    if (!priceMatch || Number.isNaN(price) || price <= 0) issues.push(issue('error', 'invalid_price', 'Não foi possível determinar um preço válido.', rowNumber, 'comment'));
    if (issues.some(i => i.severity === 'error')) return { issues };

    return {
      issues,
      transaction: { external_id: `xtb_${extId}`, ticker: symbol, type: txType, units: volume, price, amount: Math.abs(amount), executed_at: executedAt },
    };
  }

  if (txType === 'dividend' || txType === 'withholding_tax') {
    if (!symbol) {
      issues.push(issue('error', 'missing_ticker', `${txType === 'dividend' ? 'Dividendo' : 'Retenção na fonte'} sem ticker.`, rowNumber, 'symbol'));
      return { issues };
    }
    if (txType === 'withholding_tax' && amount === 0) issues.push(issue('warning', 'zero_amount', 'Retenção na fonte com valor zero.', rowNumber, 'amount'));
    return {
      issues,
      transaction: { external_id: `xtb_${extId}`, ticker: symbol, type: txType, amount, executed_at: executedAt, notes: comment || undefined },
    };
  }

  // interest, interest_tax, deposit — no ticker
  if (txType === 'interest_tax' && amount === 0) issues.push(issue('warning', 'zero_amount', 'Imposto sobre juros com valor zero.', rowNumber, 'amount'));
  return {
    issues,
    transaction: { external_id: `xtb_${extId}`, type: txType, amount, executed_at: executedAt, notes: comment || undefined },
  };
}

// Replays a sequence of transactions' buy/sell rows (in the order given) into
// a holdings snapshot — the file "replaces" the position, it isn't merged
// with whatever is already saved. Shared by parseXlsxFile() and the preview
// builder so both compute the exact same aggregate the same way.
function deriveHoldingsFromTransactions(transactions: ImportedTransaction[]): ParsedHolding[] {
  const holdingsMap = new Map<string, { units: number; totalCost: number }>();

  for (const tx of transactions) {
    if (tx.type !== 'buy' && tx.type !== 'sell') continue;
    if (!tx.ticker || tx.units == null || tx.price == null) continue;

    // On a sale, reduce totalCost proportionally too (at the average cost
    // basis before this sale) so avg_price stays constant instead of
    // inflating as units are sold off.
    const h = holdingsMap.get(tx.ticker) ?? { units: 0, totalCost: 0 };
    if (tx.type === 'sell') {
      const avgCostBefore = h.units > 0 ? h.totalCost / h.units : 0;
      h.units -= tx.units;
      h.totalCost -= tx.units * avgCostBefore;
    } else {
      h.units += tx.units;
      h.totalCost += tx.units * tx.price;
    }
    holdingsMap.set(tx.ticker, h);
  }

  return Array.from(holdingsMap.entries())
    .filter(([, h]) => h.units > 0.0001)
    .map(([ticker, h]) => ({
      ticker,
      units: Math.round(h.units * 10000) / 10000,
      avg_price: Math.round((h.totalCost / h.units) * 100) / 100,
    }));
}

/**
 * Parses every data row of an already-located XTB header into
 * ImportPreviewRow[] — every row is kept (valid, warning, or error), nothing
 * is silently skipped. Blank trailing rows (common in broker exports) are
 * dropped entirely rather than reported, per docs/import-xtb.md. Duplicate
 * detection is a separate pass (see detectImportDuplicates) — every row here
 * is 'valid'/'warning'/'error' only.
 */
export function parseXtbRows(
  data: (string | number | null)[][],
  rowIdx: number,
  cols: Record<string, number>,
): ImportPreviewRow[] {
  const rows: ImportPreviewRow[] = [];
  let rowNumber = rowIdx + 1;

  for (const row of data.slice(rowIdx + 1)) {
    rowNumber += 1;
    if (isBlankRow(row)) continue;

    const { transaction, issues } = mapXtbRowToTransaction(row, cols, rowNumber);
    const original: Record<string, unknown> = {};
    for (const [name, idx] of Object.entries(cols)) original[name] = row[idx] ?? null;

    const hasError = issues.some(i => i.severity === 'error');
    const status: ImportRowStatus = hasError ? 'error' : issues.length > 0 ? 'warning' : 'valid';

    rows.push({ rowNumber, status, original, transaction, issues });
  }

  return rows;
}

function buildDuplicateKey(tx: { ticker?: string | null; type: string; units?: number | null; price?: number | null; amount: number; executed_at?: string | null }): string {
  // Day-level date granularity (not full timestamp): freshly-parsed ISO
  // strings and Postgres timestamptz round-trips can differ in sub-second
  // precision/timezone formatting, which would otherwise cause real
  // duplicates to go undetected. Risking an over-eager match on the rare
  // case of two genuinely distinct same-day, same-values transactions is the
  // safer trade-off — see docs/import-xtb.md's "known limitations".
  const date = tx.executed_at ? tx.executed_at.slice(0, 10) : '';
  const ticker = normalizeTicker(tx.ticker ?? '');
  const units = tx.units != null ? Math.round(tx.units * 10000) / 10000 : '';
  const price = tx.price != null ? Math.round(tx.price * 100) / 100 : '';
  const amount = Math.round(tx.amount * 100) / 100;
  return [date, tx.type, ticker, units, price, amount].join('|');
}

/**
 * Flags rows whose transaction collides — by business fields, not by
 * external_id — with either another row earlier in the same file or an
 * already-saved transaction the caller passes in. Pure: the caller is
 * responsible for fetching `existingTransactions` (e.g. via
 * lib/db/transactions.ts's getTransactions()) — this function does no I/O.
 * Rows already flagged 'error' are left alone (they won't be saved either
 * way, and double-flagging would just be noise in the preview).
 */
export function detectImportDuplicates(
  rows: ImportPreviewRow[],
  existingTransactions: ExistingTransactionLike[] = [],
): ImportPreviewRow[] {
  const existingKeys = new Set(existingTransactions.map(buildDuplicateKey));
  const seenInFile = new Set<string>();

  return rows.map(row => {
    if (row.status === 'error' || !row.transaction) return row;

    const key = buildDuplicateKey(row.transaction);
    const isDuplicate = existingKeys.has(key) || seenInFile.has(key);
    seenInFile.add(key);
    if (!isDuplicate) return row;

    return {
      ...row,
      status: 'duplicate',
      duplicateKey: key,
      issues: [...row.issues, issue('warning', 'duplicate', 'Transação idêntica já existe ou está repetida no ficheiro.', row.rowNumber)],
    };
  });
}

function emptySummary(): ImportPreviewSummary {
  return { buys: 0, sells: 0, dividends: 0, withholdingTaxes: 0, interest: 0, interestTaxes: 0, deposits: 0, currencies: [], tickers: [] };
}

function buildSummary(rows: ImportPreviewRow[]): ImportPreviewSummary {
  const count = (type: TransactionType) => rows.filter(r => r.transaction?.type === type).length;
  const currencies = new Set<string>();
  const tickers = new Set<string>();
  let totalGrossAmount = 0;
  let any = false;

  for (const r of rows) {
    const currencyCell = r.original['currency'];
    if (typeof currencyCell === 'string' && currencyCell.trim()) currencies.add(currencyCell.trim().toUpperCase());
    if (r.transaction?.ticker) tickers.add(r.transaction.ticker);
    if (r.transaction) { totalGrossAmount += r.transaction.amount; any = true; }
  }

  return {
    buys: count('buy'), sells: count('sell'), dividends: count('dividend'),
    withholdingTaxes: count('withholding_tax'), interest: count('interest'), interestTaxes: count('interest_tax'),
    deposits: count('deposit'),
    totalGrossAmount: any ? Math.round(totalGrossAmount * 100) / 100 : undefined,
    currencies: Array.from(currencies).sort(),
    tickers: Array.from(tickers).sort(),
  };
}

// Builds the final ImportPreview from already-duplicate-checked rows.
function buildImportPreviewFromRows(rows: ImportPreviewRow[], fileName: string): ImportPreview {
  const invalidRows = rows.filter(r => r.status === 'error').length;
  const duplicateRows = rows.filter(r => r.status === 'duplicate').length;
  const totalRows = rows.length;
  const validRows = totalRows - invalidRows - duplicateRows;

  // Importable = will actually be saved on confirm (errors and duplicates are skipped).
  const importable = rows.filter(r => r.status === 'valid' || r.status === 'warning');
  // Holdings replay uses every non-error row (including duplicates) — this
  // file's own position snapshot doesn't depend on whether a given
  // transaction row also happens to already exist in the DB.
  const forHoldings = rows.filter(r => r.status !== 'error' && r.transaction).map(r => r.transaction!);

  return {
    parserName: 'xtb',
    parserVersion: XTB_IMPORT_PARSER_VERSION,
    fileName,
    totalRows,
    validRows,
    invalidRows,
    duplicateRows,
    warnings: rows.flatMap(r => r.issues.filter(i => i.severity === 'warning')),
    errors: rows.flatMap(r => r.issues.filter(i => i.severity === 'error')),
    rows,
    summary: buildSummary(importable),
    holdings: deriveHoldingsFromTransactions(forHoldings),
  };
}

function emptyPreview(fileName: string, error: ImportIssue): ImportPreview {
  return {
    parserName: 'xtb', parserVersion: XTB_IMPORT_PARSER_VERSION, fileName,
    totalRows: 0, validRows: 0, invalidRows: 0, duplicateRows: 0,
    warnings: [], errors: [error], rows: [], summary: emptySummary(), holdings: [],
  };
}

// Coarse-grained preview for the generic ticker/units/avg_price format (no
// per-row transaction semantics — rowsToHoldings() already validates the
// whole batch atomically, so a bad row surfaces as a single file-level error
// rather than a row-by-row breakdown, unlike the richer XTB path above. See
// docs/import-xtb.md's "known limitations".
const GENERIC_PARSE_ERROR_MESSAGES: Record<string, string> = {
  'missing columns': 'O ficheiro não tem as colunas esperadas (ticker, units, avg_price/price).',
  'bad row': 'Uma ou mais linhas têm um ticker ou número inválido.',
  empty: 'O ficheiro está vazio.',
};

function buildGenericHoldingsPreview(header: string[], dataRows: string[][], fileName: string): ImportPreview {
  let holdings: ParsedHolding[];
  try {
    holdings = rowsToHoldings(header, dataRows.filter(r => r.some(c => c != null && c !== '')));
  } catch (e) {
    const rawMessage = e instanceof Error ? e.message : 'parse_error';
    const message = GENERIC_PARSE_ERROR_MESSAGES[rawMessage] ?? 'Não foi possível ler as posições deste ficheiro. Verifica o formato.';
    return emptyPreview(fileName, issue('error', 'file_parse_error', message, 0));
  }

  const rows: ImportPreviewRow[] = holdings.map((h, i) => ({
    rowNumber: i + 2, // row 1 is the header
    status: 'valid',
    original: { ticker: h.ticker, units: h.units, avg_price: h.avg_price, name: h.name },
    issues: [],
  }));

  return {
    parserName: 'xtb', parserVersion: XTB_IMPORT_PARSER_VERSION, fileName,
    totalRows: rows.length, validRows: rows.length, invalidRows: 0, duplicateRows: 0,
    warnings: [], errors: [], rows,
    summary: { ...emptySummary(), tickers: holdings.map(h => h.ticker).sort() },
    holdings,
  };
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

    const rows = parseXtbRows(data, rowIdx, cols);
    // Legacy, lenient behavior: keep a row only when it has no error-severity
    // issue — reproduces this function's pre-existing silent-skip-on-any-
    // problem behavior exactly (see mapXtbRowToTransaction's docstring).
    const transactions = rows.filter(r => r.status !== 'error' && r.transaction).map(r => r.transaction!);
    const holdings = deriveHoldingsFromTransactions(transactions);

    return { holdings, transactions };
  }

  // ── Generic format ────────────────────────────────────────────────
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];
  if (data.length < 2) throw new Error('empty');
  const holdings = rowsToHoldings(data[0], data.slice(1).filter(r => r.some(c => c != null && c !== '')));
  return { holdings, transactions: [] };
}

/**
 * Two-phase import, phase 1: parse + validate + detect duplicates, without
 * saving anything. Pass `existingTransactions` (fetched by the caller, e.g.
 * via lib/db/transactions.ts's getTransactions()) to also flag rows that
 * collide with what's already saved — omit it to only check for duplicates
 * within the file itself.
 */
export async function previewFile(
  file: File,
  opts: { existingTransactions?: ExistingTransactionLike[] } = {},
): Promise<ImportPreview> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return emptyPreview(file.name, issue('error', 'empty_file', 'O ficheiro está vazio.', 0));
    return buildGenericHoldingsPreview(lines[0].split(','), lines.slice(1).map(l => l.split(',')), file.name);
  }

  if (ext === 'xlsx' || ext === 'xlsm') {
    const XLSX = await import('xlsx');
    let wb: ReturnType<typeof XLSX.read>;
    try {
      wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    } catch {
      return emptyPreview(file.name, issue('error', 'invalid_file', 'Não foi possível ler este ficheiro XLSX — pode estar corrompido ou num formato não suportado.', 0));
    }

    const cashSheet = wb.SheetNames.find(n => n.toUpperCase().includes('CASH OPERATION'));
    if (cashSheet) {
      const ws = wb.Sheets[cashSheet];
      const data = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1 });
      const header = findXtbHeader(data);
      if (!header) return emptyPreview(file.name, issue('error', 'xtb_no_header', 'Não foi encontrada uma linha de cabeçalho reconhecível (colunas "ID" e "Type").', 0));

      const rawRows = parseXtbRows(data, header.rowIdx, header.cols);
      const rows = detectImportDuplicates(rawRows, opts.existingTransactions ?? []);
      return buildImportPreviewFromRows(rows, file.name);
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];
    if (data.length < 2) return emptyPreview(file.name, issue('error', 'empty_file', 'O ficheiro não tem linhas de dados.', 0));
    return buildGenericHoldingsPreview(data[0], data.slice(1), file.name);
  }

  return emptyPreview(file.name, issue('error', 'unsupported_format', 'Formato de ficheiro não suportado — usa CSV ou XLSX.', 0));
}

export async function parseFile(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return parseHoldingsCsv(await file.text());
  if (ext === 'xlsx' || ext === 'xlsm') return parseXlsxFile(await file.arrayBuffer());
  throw new Error('unsupported_format');
}
