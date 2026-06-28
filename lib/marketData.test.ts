import { describe, it, expect } from 'vitest';
import { toYahooSymbol } from './marketData';

describe('toYahooSymbol', () => {
  it('returns the base ticker unchanged when there is no suffix', () => {
    expect(toYahooSymbol('AAPL')).toBe('AAPL');
  });

  it('maps known XTB-style suffixes to Yahoo Finance suffixes', () => {
    expect(toYahooSymbol('AIR.FR')).toBe('AIR.PA');
    expect(toYahooSymbol('ABN.NL')).toBe('ABN.AS');
    expect(toYahooSymbol('FB2A.DE')).toBe('FB2A.DE');
    expect(toYahooSymbol('GALP.PT')).toBe('GALP.LS');
  });

  it('strips the suffix for US tickers', () => {
    expect(toYahooSymbol('TSLA.US')).toBe('TSLA');
  });

  it('passes the ticker through unchanged for an unknown suffix', () => {
    expect(toYahooSymbol('XYZ.ZZ')).toBe('XYZ.ZZ');
  });
});
