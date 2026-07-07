import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  holdingsToPortfolioInput,
  transactionsToPortfolioInput,
  quotesToLatestQuotes,
  logPortfolioStateWarnings,
  DEFAULT_CURRENCY,
} from './portfolioStateAdapters';

describe('holdingsToPortfolioInput', () => {
  it('maps ticker/units/avg_price and stamps the default currency', () => {
    const result = holdingsToPortfolioInput([{ ticker: 'AAPL', units: 10, avg_price: 100 }]);
    expect(result).toEqual([{ ticker: 'AAPL', units: 10, avg_price: 100, currency: DEFAULT_CURRENCY }]);
  });
});

describe('transactionsToPortfolioInput', () => {
  it('maps a DB transaction row 1:1', () => {
    const result = transactionsToPortfolioInput([
      { id: 't1', ticker: 'AAPL', type: 'buy', units: 10, price: 100, amount: 1000, executed_at: '2024-01-01' },
    ]);
    expect(result).toEqual([
      { id: 't1', ticker: 'AAPL', type: 'buy', units: 10, price: 100, amount: 1000, executed_at: '2024-01-01' },
    ]);
  });

  it('passes through null ticker/units/price/executed_at (cash-flow rows)', () => {
    const result = transactionsToPortfolioInput([
      { id: 't2', ticker: null, type: 'deposit', units: null, price: null, amount: 500, executed_at: null },
    ]);
    expect(result[0]).toMatchObject({ ticker: null, units: null, price: null, executed_at: null });
  });
});

describe('quotesToLatestQuotes', () => {
  it('keeps only the price field, keyed by ticker', () => {
    const result = quotesToLatestQuotes({ AAPL: { price: 150 } });
    expect(result).toEqual({ AAPL: { price: 150 } });
  });

  it('drops missing/null/undefined quotes instead of keeping them as null', () => {
    const result = quotesToLatestQuotes({ AAPL: { price: 150 }, MSFT: null, GOOG: undefined });
    expect(result).toEqual({ AAPL: { price: 150 } });
    expect('MSFT' in result).toBe(false);
    expect('GOOG' in result).toBe(false);
  });
});

describe('logPortfolioStateWarnings', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not log when there are no warnings', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logPortfolioStateWarnings('test', []);
    expect(spy).not.toHaveBeenCalled();
  });

  it('logs warnings outside production', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const original = process.env.NODE_ENV;
    vi.stubEnv('NODE_ENV', 'test');
    logPortfolioStateWarnings('test', [{ code: 'missing_quote', message: 'no quote', ticker: 'AAPL' }]);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.stubEnv('NODE_ENV', original ?? 'test');
  });

  it('stays silent in production', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const original = process.env.NODE_ENV;
    vi.stubEnv('NODE_ENV', 'production');
    logPortfolioStateWarnings('test', [{ code: 'missing_quote', message: 'no quote', ticker: 'AAPL' }]);
    expect(spy).not.toHaveBeenCalled();
    vi.stubEnv('NODE_ENV', original ?? 'test');
  });
});
