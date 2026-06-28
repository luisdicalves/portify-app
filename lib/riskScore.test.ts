import { describe, it, expect } from 'vitest';
import { band, toFinnhubSymbol } from './riskScore';

describe('toFinnhubSymbol', () => {
  it('returns the base ticker unchanged when there is no suffix', () => {
    expect(toFinnhubSymbol('AAPL')).toBe('AAPL');
  });

  it('strips the .US suffix (Finnhub uses bare tickers for US stocks)', () => {
    expect(toFinnhubSymbol('AAPL.US')).toBe('AAPL');
  });

  it('passes the ticker through unchanged for a non-US suffix (not covered by free Finnhub)', () => {
    expect(toFinnhubSymbol('AIR.FR')).toBe('AIR.FR');
  });
});

describe('band', () => {
  const thresholds: [number, number][] = [[10, 90], [20, 60], [30, 30]];

  it('returns the score for the first threshold the value falls under', () => {
    expect(band(5, thresholds)).toBe(90);
    expect(band(15, thresholds)).toBe(60);
    expect(band(25, thresholds)).toBe(30);
  });

  it('returns the last threshold score when the value exceeds every limit', () => {
    expect(band(100, thresholds)).toBe(30);
  });

  it('returns a neutral 50 when the value is missing or NaN', () => {
    expect(band(null, thresholds)).toBe(50);
    expect(band(undefined, thresholds)).toBe(50);
    expect(band(NaN, thresholds)).toBe(50);
  });
});
