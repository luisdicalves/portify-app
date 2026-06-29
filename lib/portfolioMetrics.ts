export type Holding = { ticker: string; units: number; avg_price: number };
export type HistoryPoint = { date: string; close: number };

export function calcTotalValue(holdings: Holding[], getPrice: (ticker: string) => number | undefined): number {
  return holdings.reduce((sum, h) => sum + h.units * (getPrice(h.ticker) ?? h.avg_price), 0);
}

export function calcTotalInvested(holdings: Holding[]): number {
  return holdings.reduce((sum, h) => sum + h.units * h.avg_price, 0);
}

// Builds a single combined portfolio value series from each holding's own
// history, forward-filling any date a given ticker is missing (e.g. its
// history is shorter, or that date fell on a different exchange's holiday)
// with the last known close, falling back to avg_price if nothing is known
// yet. The "backbone" of dates is the longest of the per-ticker histories.
export function buildPortfolioSeries(holdings: Holding[], histories: (HistoryPoint[] | null)[]): number[] | null {
  const backbone = histories
    .filter((h): h is HistoryPoint[] => h !== null)
    .sort((a, b) => b.length - a.length)[0];
  if (!backbone) return null;

  const seriesMaps = histories.map(h => {
    const map = new Map<string, number>();
    h?.forEach(p => map.set(p.date, p.close));
    return map;
  });

  const lastKnown = new Map<string, number>();
  const values = backbone.map(({ date }) => {
    let total = 0;
    holdings.forEach((h, i) => {
      const map = seriesMaps[i];
      const closeToday = map.get(date);
      const close = closeToday ?? lastKnown.get(h.ticker) ?? h.avg_price;
      if (closeToday != null) lastKnown.set(h.ticker, closeToday);
      total += h.units * close;
    });
    return total;
  });

  return values.length > 1 ? values : null;
}

// Builds an SVG line/area path from a series of values, scaled to the viewBox.
export function buildLinePath(values: number[], opts: { width?: number; height?: number; padding?: number } = {}) {
  const { width = 320, height = 110, padding = 8 } = opts;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - padding - ((v - min) / span) * (height - padding * 2);
    return [x, y];
  });
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  return { line, area };
}

// Weighted-average days-held across buy transactions, weighted by amount —
// used to annualize a return without a real per-position holding period.
// Clamped to >=30 days so a portfolio bought minutes ago doesn't produce an
// absurd annualized percentage.
export function calcWeightedAvgDaysHeld(buys: { amount: number; executed_at: string }[], now = Date.now()): number {
  if (buys.length === 0) return 365;
  const totalAmount = buys.reduce((s, b) => s + Math.abs(b.amount), 0);
  if (totalAmount === 0) return 365;
  const weightedDays = buys.reduce((s, b) => {
    const days = (now - new Date(b.executed_at).getTime()) / 86400000;
    return s + Math.abs(b.amount) * days;
  }, 0);
  return Math.max(30, weightedDays / totalAmount);
}

export function calcAnnualizedReturn(totalReturnPct: number, avgDaysHeld: number): number {
  return (Math.pow(1 + totalReturnPct / 100, 365 / avgDaysHeld) - 1) * 100;
}
