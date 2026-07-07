import { describe, it, expect } from 'vitest';
import { buildPortfolioState, type PortfolioStateInput, type PortfolioTransactionLike } from './portfolioState';

function input(overrides: Partial<PortfolioStateInput> = {}): PortfolioStateInput {
  return {
    holdings: [],
    transactions: [],
    latestQuotes: {},
    userCurrency: 'EUR',
    ...overrides,
  };
}

function buy(ticker: string, units: number, price: number, executed_at: string, extra: Partial<PortfolioTransactionLike> = {}): PortfolioTransactionLike {
  return { type: 'buy', ticker, units, price, amount: units * price, executed_at, ...extra };
}

function sell(ticker: string, units: number, price: number, executed_at: string, extra: Partial<PortfolioTransactionLike> = {}): PortfolioTransactionLike {
  return { type: 'sell', ticker, units, price, amount: units * price, executed_at, ...extra };
}

describe('buildPortfolioState — buys', () => {
  it('1. compra simples', () => {
    const result = buildPortfolioState(input({
      holdings: [{ ticker: 'AAPL', units: 10, avg_price: 100, currency: 'EUR', assetClass: 'stock', sector: 'tech' }],
      transactions: [buy('AAPL', 10, 100, '2024-01-01')],
      latestQuotes: { AAPL: { price: 120 } },
    }));

    expect(result.holdings).toHaveLength(1);
    const h = result.holdings[0];
    expect(h.ticker).toBe('AAPL');
    expect(h.units).toBe(10);
    expect(h.averageCost).toBe(100);
    expect(h.costBasis).toBe(1000);
    expect(h.price).toBe(120);
    expect(h.priceSource).toBe('quote');
    expect(h.marketValue).toBe(1200);
    expect(h.unrealizedGain).toBe(200);
    expect(h.unrealizedGainPct).toBeCloseTo(0.2);

    expect(result.marketValue).toBe(1200);
    expect(result.costBasis).toBe(1000);
    expect(result.averageCost).toBe(100);
    expect(result.cashBalance).toBe(-1000);
    expect(result.totalPortfolioValue).toBe(200);
    expect(result.dataQualityWarnings).toHaveLength(0);
  });

  it('2. compra em duas datas com custo médio', () => {
    const result = buildPortfolioState(input({
      transactions: [
        buy('AAPL', 10, 100, '2024-01-01'),
        buy('AAPL', 10, 200, '2024-02-01'),
      ],
      latestQuotes: { AAPL: { price: 150 } },
    }));

    const h = result.holdings.find(x => x.ticker === 'AAPL')!;
    expect(h.units).toBe(20);
    expect(h.averageCost).toBe(150); // (10*100 + 10*200) / 20
    expect(h.costBasis).toBe(3000);
    expect(h.marketValue).toBe(3000);
    expect(h.unrealizedGain).toBe(0);
  });

  it('averages correctly regardless of transaction input order (sorts by executed_at)', () => {
    const result = buildPortfolioState(input({
      transactions: [
        buy('AAPL', 10, 200, '2024-02-01'),
        buy('AAPL', 10, 100, '2024-01-01'),
      ],
      latestQuotes: { AAPL: { price: 150 } },
    }));
    const h = result.holdings.find(x => x.ticker === 'AAPL')!;
    expect(h.averageCost).toBe(150);
  });
});

describe('buildPortfolioState — sells', () => {
  it('3. venda parcial reduz unidades e costBasis sem alterar o averageCost', () => {
    const result = buildPortfolioState(input({
      transactions: [
        buy('AAPL', 10, 100, '2024-01-01'),
        sell('AAPL', 4, 150, '2024-03-01'),
      ],
      latestQuotes: { AAPL: { price: 150 } },
    }));

    const h = result.holdings.find(x => x.ticker === 'AAPL')!;
    expect(h.units).toBe(6);
    expect(h.averageCost).toBe(100);
    expect(h.costBasis).toBe(600);
    expect(result.realizedGain).toBe(4 * (150 - 100));
  });

  it('4. venda total remove a posição das holdings mas mantém o realizedGain', () => {
    const result = buildPortfolioState(input({
      transactions: [
        buy('AAPL', 10, 100, '2024-01-01'),
        sell('AAPL', 10, 150, '2024-03-01'),
      ],
      latestQuotes: { AAPL: { price: 150 } },
    }));

    expect(result.holdings).toHaveLength(0);
    expect(result.realizedGain).toBe(10 * (150 - 100));
    expect(result.marketValue).toBe(0);
  });

  it('clamps an oversell to the available units and warns instead of going negative', () => {
    const result = buildPortfolioState(input({
      transactions: [
        buy('AAPL', 5, 100, '2024-01-01'),
        sell('AAPL', 8, 150, '2024-02-01'),
      ],
      latestQuotes: { AAPL: { price: 150 } },
    }));

    expect(result.holdings).toHaveLength(0);
    expect(result.realizedGain).toBe(5 * (150 - 100));
    expect(result.dataQualityWarnings.some(w => w.code === 'invalid_transaction')).toBe(true);
  });
});

describe('buildPortfolioState — dividends', () => {
  it('5. separa dividendo bruto, imposto retido e líquido', () => {
    const result = buildPortfolioState(input({
      holdings: [{ ticker: 'AAPL', units: 10, avg_price: 100, currency: 'EUR' }],
      transactions: [
        { type: 'dividend', ticker: 'AAPL', amount: 100, executed_at: '2024-04-01' },
        { type: 'withholding_tax', ticker: 'AAPL', amount: 28, executed_at: '2024-04-01' },
      ],
      latestQuotes: { AAPL: { price: 100 } },
    }));

    expect(result.totalDividendsGross).toBe(100);
    expect(result.taxWithheld).toBe(28);
    expect(result.totalDividendsNet).toBe(72);
    expect(result.cashBalance).toBe(72);
  });
});

describe('buildPortfolioState — cash flows', () => {
  it('6. depósito de cash aumenta cashBalance e totalPortfolioValue', () => {
    const result = buildPortfolioState(input({
      transactions: [{ type: 'deposit', amount: 500, executed_at: '2024-01-01' }],
    }));
    expect(result.cashBalance).toBe(500);
    expect(result.totalPortfolioValue).toBe(500);
  });

  it('7. juro recebido aumenta cashBalance', () => {
    const result = buildPortfolioState(input({
      transactions: [{ type: 'interest', amount: 10, executed_at: '2024-01-01' }],
    }));
    expect(result.cashBalance).toBe(10);
  });

  it('8. imposto sobre juro reduz cashBalance', () => {
    const result = buildPortfolioState(input({
      transactions: [
        { type: 'interest', amount: 10, executed_at: '2024-01-01' },
        { type: 'interest_tax', amount: 2, executed_at: '2024-01-01' },
      ],
    }));
    expect(result.cashBalance).toBe(8);
  });
});

describe('buildPortfolioState — data quality', () => {
  it('9. preço de mercado em falta usa averageCost como fallback e gera warning', () => {
    const result = buildPortfolioState(input({
      holdings: [{ ticker: 'MSFT', units: 5, avg_price: 200, currency: 'EUR' }],
    }));

    const h = result.holdings[0];
    expect(h.priceSource).toBe('average_cost_fallback');
    expect(h.price).toBe(200);
    expect(h.marketValue).toBe(1000);
    expect(h.unrealizedGain).toBe(0);
    expect(result.dataQualityWarnings).toContainEqual(
      expect.objectContaining({ code: 'missing_quote', ticker: 'MSFT' }),
    );
  });

  it('10. ticker desconhecido numa transacção gera warning e não é contabilizado', () => {
    const result = buildPortfolioState(input({
      transactions: [
        { type: 'dividend', ticker: '', amount: 50, executed_at: '2024-01-01' },
      ],
    }));

    expect(result.totalDividendsGross).toBe(0);
    expect(result.dataQualityWarnings).toContainEqual(
      expect.objectContaining({ code: 'unknown_ticker' }),
    );
  });

  it('11. transacção com quantidade inválida não rebenta a função e gera warning', () => {
    const result = buildPortfolioState(input({
      transactions: [
        buy('AAPL', 0, 100, '2024-01-01'),
        buy('AAPL', -5, 100, '2024-01-02'),
        buy('AAPL', NaN, 100, '2024-01-03'),
      ],
    }));

    expect(result.holdings).toHaveLength(0);
    expect(result.dataQualityWarnings.filter(w => w.code === 'invalid_transaction')).toHaveLength(3);
  });

  it('does not throw on an unrecognized transaction type and warns instead', () => {
    expect(() => buildPortfolioState(input({
      transactions: [{ type: 'bogus_type', ticker: 'AAPL', amount: 10, executed_at: '2024-01-01' }],
    }))).not.toThrow();

    const result = buildPortfolioState(input({
      transactions: [{ type: 'bogus_type', ticker: 'AAPL', amount: 10, executed_at: '2024-01-01' }],
    }));
    expect(result.dataQualityWarnings).toContainEqual(
      expect.objectContaining({ code: 'invalid_transaction' }),
    );
  });

  it('12. carteira multi-moeda sem conversão FX gera warning explícito e soma sem converter', () => {
    const result = buildPortfolioState(input({
      holdings: [
        { ticker: 'AAPL', units: 1, avg_price: 100, currency: 'USD' },
        { ticker: 'SAP.DE', units: 1, avg_price: 100, currency: 'EUR' },
      ],
      transactions: [],
      latestQuotes: { 'AAPL': { price: 100 }, 'SAP.DE': { price: 100 } },
      userCurrency: 'EUR',
    }));

    expect(result.marketValue).toBe(200); // naive sum, no FX conversion
    expect(result.dataQualityWarnings).toContainEqual(
      expect.objectContaining({ code: 'multi_currency_no_fx' }),
    );
  });

  it('flags a holding with no known currency', () => {
    const result = buildPortfolioState(input({
      holdings: [{ ticker: 'AAPL', units: 1, avg_price: 100 }],
      latestQuotes: { AAPL: { price: 100 } },
    }));
    expect(result.holdings[0].currency).toBe('unknown');
    expect(result.dataQualityWarnings).toContainEqual(
      expect.objectContaining({ code: 'unknown_currency', ticker: 'AAPL' }),
    );
  });
});

describe('buildPortfolioState — allocations', () => {
  it('computes allocation slices by asset, asset class, sector and currency relative to totalPortfolioValue', () => {
    const result = buildPortfolioState(input({
      holdings: [
        { ticker: 'AAPL', units: 10, avg_price: 100, currency: 'EUR', assetClass: 'stock', sector: 'tech' },
        { ticker: 'BND.US', units: 10, avg_price: 100, currency: 'EUR', assetClass: 'bond_etf', sector: 'other' },
      ],
      latestQuotes: { AAPL: { price: 100 }, 'BND.US': { price: 100 } },
    }));

    expect(result.totalPortfolioValue).toBe(2000);
    expect(result.allocationByAsset).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'AAPL', value: 1000, pct: 0.5 }),
        expect.objectContaining({ key: 'BND.US', value: 1000, pct: 0.5 }),
      ]),
    );
    expect(result.allocationByAssetClass).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'stock', value: 1000, pct: 0.5 }),
        expect.objectContaining({ key: 'bond_etf', value: 1000, pct: 0.5 }),
      ]),
    );
    expect(result.allocationByCurrency).toEqual([
      expect.objectContaining({ key: 'EUR', value: 2000, pct: 1 }),
    ]);
  });

  it('holdings-only positions with no matching transactions still contribute to allocation (bulk import case)', () => {
    const result = buildPortfolioState(input({
      holdings: [{ ticker: 'VOO.US', units: 3, avg_price: 400, currency: 'USD', assetClass: 'etf', sector: 'other' }],
      latestQuotes: { 'VOO.US': { price: 420 } },
    }));

    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0].units).toBe(3);
    expect(result.holdings[0].marketValue).toBe(1260);
  });
});

describe('buildPortfolioState — purity', () => {
  it('does not mutate its input', () => {
    const original = input({
      holdings: [{ ticker: 'AAPL', units: 10, avg_price: 100, currency: 'EUR' }],
      transactions: [buy('AAPL', 10, 100, '2024-01-01')],
      latestQuotes: { AAPL: { price: 120 } },
    });
    const snapshot = JSON.parse(JSON.stringify(original));
    buildPortfolioState(original);
    expect(original).toEqual(snapshot);
  });

  it('is deterministic for the same input', () => {
    const args = input({
      holdings: [{ ticker: 'AAPL', units: 10, avg_price: 100, currency: 'EUR' }],
      transactions: [buy('AAPL', 10, 100, '2024-01-01')],
      latestQuotes: { AAPL: { price: 120 } },
    });
    expect(buildPortfolioState(args)).toEqual(buildPortfolioState(args));
  });
});
