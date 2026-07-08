import { describe, it, expect } from 'vitest';
import { recommend, type RecommendOptions } from './recommendationEngine';
import type { CandidateAsset } from './assetUniverse';
import type { UserProfile } from './planCalculator';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStock(ticker: string, sector: CandidateAsset['sector'] = 'tech', qualityScore = 70): CandidateAsset {
  return {
    ticker,
    name:          ticker,
    exchange:      'US',
    assetClass:    'stock',
    sector,
    beta:          1.0,
    dividendYield: 1.5,
    marketCap:     10_000_000_000,
    qualityScore,
    currency:      'USD',
  };
}

function makeEtf(ticker: string, qualityScore = 80): CandidateAsset {
  return {
    ticker,
    name:          ticker,
    exchange:      'NYSE',
    assetClass:    'etf',
    sector:        'other',
    beta:          0.9,
    dividendYield: 2.0,
    marketCap:     50_000_000_000,
    qualityScore,
    currency:      'USD',
  };
}

function makeBondEtf(ticker: string, qualityScore = 85): CandidateAsset {
  return {
    ticker,
    name:          ticker,
    exchange:      'NASDAQ',
    assetClass:    'bond_etf',
    sector:        'other',
    beta:          0.1,
    dividendYield: 3.5,
    marketCap:     20_000_000_000,
    qualityScore,
    currency:      'USD',
  };
}

const PROFILE: UserProfile = {
  risk_profile:     'moderate',
  investment_goal:  'wealth_growth',
  experience_level: 'intermediate',
  market_reaction:  'hold',
  financial_status: 'stable',
  liquidity_need:   'unlikely',
  horizon_years:    10,
};

const OPTS: RecommendOptions = {
  universe:         [
    makeStock('AAPL.US', 'tech',    85),
    makeStock('MSFT.US', 'tech',    82),
    makeStock('GOOGL.US','comms',   78),
    makeStock('JNJ.US',  'health',  75),
    makeStock('XOM.US',  'energy',  65),
    makeEtf('VOO.US',              92),
    makeEtf('BND.US',              85),
  ],
  profile:          PROFILE,
  preferredSectors: ['tech', 'health'],
  monthlyAmount:    500,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('recommend — basic output shape', () => {
  it('returns an array of recommendations', () => {
    const result = recommend(OPTS);
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it('allocationPlan fractions sum to 1', () => {
    const { allocationPlan } = recommend(OPTS);
    const sum = allocationPlan.stock + allocationPlan.etf + allocationPlan.bond_etf;
    expect(sum).toBeCloseTo(1, 5);
  });

  it('includes governance meta with the recommendationEngine model name and version', () => {
    const { meta } = recommend(OPTS);
    expect(meta?.modelName).toBe('recommendationEngine');
    expect(meta?.modelVersion).toBe('3.0.0');
  });

  it('each recommendation has a positive suggestedAmount', () => {
    const { recommendations } = recommend(OPTS);
    recommendations.forEach(r => {
      expect(r.suggestedAmount).toBeGreaterThan(0);
    });
  });

  it('suggestedAmounts are multiples of 5', () => {
    const { recommendations } = recommend(OPTS);
    recommendations.forEach(r => {
      expect(r.suggestedAmount % 5).toBe(0);
    });
  });

  it('total suggestedAmount does not exceed monthlyAmount', () => {
    const { recommendations } = recommend(OPTS);
    const total = recommendations.reduce((s, r) => s + r.suggestedAmount, 0);
    expect(total).toBeLessThanOrEqual(OPTS.monthlyAmount + 5); // 5€ rounding tolerance
  });

  it('no more than maxPerClass recommendations per asset class', () => {
    const { recommendations } = recommend({ ...OPTS, maxPerClass: 2 });
    const byCls: Record<string, number> = {};
    recommendations.forEach(r => {
      byCls[r.asset.assetClass] = (byCls[r.asset.assetClass] ?? 0) + 1;
    });
    Object.values(byCls).forEach(count => expect(count).toBeLessThanOrEqual(2));
  });
});

describe('recommend — scoring order', () => {
  it('higher-quality assets appear before lower-quality ones within the same class', () => {
    const { recommendations } = recommend(OPTS);
    const stocks = recommendations.filter(r => r.asset.assetClass === 'stock');
    for (let i = 1; i < stocks.length; i++) {
      expect(stocks[i - 1].finalScore).toBeGreaterThanOrEqual(stocks[i].finalScore);
    }
  });

  it('finalScore is between 0 and 100', () => {
    const { recommendations } = recommend(OPTS);
    recommendations.forEach(r => {
      expect(r.finalScore).toBeGreaterThanOrEqual(0);
      expect(r.finalScore).toBeLessThanOrEqual(100);
    });
  });
});

describe('recommend — holdings-aware', () => {
  it('marks owned assets as reinforce type', () => {
    const result = recommend({
      ...OPTS,
      holdings: [{ ticker: 'AAPL.US', units: 10, avgPrice: 150 }],
    });
    const aapl = result.recommendations.find(r => r.asset.ticker === 'AAPL.US');
    if (aapl) {
      expect(aapl.type).toBe('reinforce');
      expect(aapl.alreadyOwned).toBe(true);
    }
  });

  it('marks new assets as new type', () => {
    const result = recommend({ ...OPTS, holdings: [] });
    result.recommendations.forEach(r => {
      expect(r.type).toBe('new');
      expect(r.alreadyOwned).toBe(false);
    });
  });
});

describe('recommend — empty universe', () => {
  it('returns empty recommendations without throwing', () => {
    const result = recommend({ ...OPTS, universe: [] });
    expect(result.recommendations).toHaveLength(0);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// v3.0 — preferred_asset_classes end-to-end (calcPlan zera + renormaliza,
// e o orçamento da classe excluída é redistribuído, não perdido)
// ─────────────────────────────────────────────────────────────────────────────

describe('recommend — preferredClasses (v3.0)', () => {
  const universeAllClasses: CandidateAsset[] = [
    makeStock('AAPL.US', 'tech',   85),
    makeStock('MSFT.US', 'tech',   80),
    makeEtf('VOO.US',              92),
    makeBondEtf('BND.US',          85),
  ];

  it('defaults to all three classes when preferredClasses is omitted', () => {
    const result = recommend({ ...OPTS, universe: universeAllClasses });
    expect(result.allocationPlan.stock).toBeGreaterThan(0);
    expect(result.allocationPlan.etf).toBeGreaterThan(0);
    expect(result.allocationPlan.bond_etf).toBeGreaterThanOrEqual(0);
  });

  it('zeroes an excluded class in allocationPlan and recommends nothing from it', () => {
    const result = recommend({
      ...OPTS,
      universe:         universeAllClasses,
      preferredClasses: ['etf', 'bond_etf'],
    });
    expect(result.allocationPlan.stock).toBe(0);
    expect(result.recommendations.some(r => r.asset.assetClass === 'stock')).toBe(false);
  });

  it("redistributes the excluded class's budget instead of losing it", () => {
    const withStock = recommend({
      ...OPTS,
      universe:         universeAllClasses,
      preferredClasses: ['stock', 'etf', 'bond_etf'],
    });
    const withoutStock = recommend({
      ...OPTS,
      universe:         universeAllClasses,
      preferredClasses: ['etf', 'bond_etf'],
    });

    const totalWith    = withStock.recommendations.reduce((s, r) => s + r.suggestedAmount, 0);
    const totalWithout = withoutStock.recommendations.reduce((s, r) => s + r.suggestedAmount, 0);

    // Same monthly budget either way — excluding a class should not shrink
    // the total recommended amount (previously the stock slice just vanished).
    expect(totalWithout).toBeGreaterThanOrEqual(totalWith - 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v3.0 — subpesado usa a fórmula do gap (targetWeight − currentWeight), não o
// valor plano da distribuição proporcional (Camada 3 · Passo 4)
// ─────────────────────────────────────────────────────────────────────────────

describe('recommend — subpesado / sobrepesado (v3.0)', () => {
  it('an underweighted holding gets suggestedAmount = round(monthlyAmount × gap / 5) × 5', () => {
    const opts: RecommendOptions = {
      universe: [
        makeStock('AAA.US', 'tech', 90),
        makeStock('BBB.US', 'tech', 90),
      ],
      profile:          PROFILE,
      preferredSectors: ['tech'],
      monthlyAmount:    500,
      preferredClasses: ['stock'],
      holdings: [
        { ticker: 'AAA.US', units: 1, avgPrice: 100,  assetClass: 'stock' }, // pequena posição
        { ticker: 'BBB.US', units: 1, avgPrice: 1900, assetClass: 'stock' }, // posição dominante
      ],
    };

    const result = recommend(opts);
    const aaa = result.recommendations.find(r => r.asset.ticker === 'AAA.US');
    const bbb = result.recommendations.find(r => r.asset.ticker === 'BBB.US');

    // BBB está claramente sobrepesado (95% da carteira) — não deve ser recomendado.
    expect(bbb).toBeUndefined();

    expect(aaa).toBeDefined();
    if (aaa) {
      expect(aaa.type).toBe('reinforce');
      expect(aaa.reason).toMatch(/Subpesado/);
      const expectedGapAmount = Math.max(5, Math.round((opts.monthlyAmount * (aaa.targetWeight - aaa.currentWeight)) / 5) * 5);
      expect(aaa.suggestedAmount).toBe(expectedGapAmount);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v3.0 — holdings em classes fora do plano aparecem como "fora do plano",
// não entram no cálculo de peso nem são recomendados para reforço
// ─────────────────────────────────────────────────────────────────────────────

describe('recommend — outOfPlanHoldings (v3.0)', () => {
  it('flags a holding whose assetClass is outside preferredClasses', () => {
    const result = recommend({
      ...OPTS,
      preferredClasses: ['stock', 'etf'],
      holdings: [
        { ticker: 'BND.US', units: 10, avgPrice: 80, assetClass: 'bond_etf' },
      ],
    });

    expect(result.outOfPlanHoldings).toHaveLength(1);
    expect(result.outOfPlanHoldings[0]).toMatchObject({ ticker: 'BND.US', assetClass: 'bond_etf', value: 800 });

    // Não deve ser tratado como reforço — a classe está fora do plano.
    const bnd = result.recommendations.find(r => r.asset.ticker === 'BND.US');
    if (bnd) expect(bnd.alreadyOwned).toBe(false);
  });

  it('does not flag holdings inside preferredClasses', () => {
    const result = recommend({
      ...OPTS,
      preferredClasses: ['stock', 'etf', 'bond_etf'],
      holdings: [{ ticker: 'AAPL.US', units: 1, avgPrice: 100, assetClass: 'stock' }],
    });
    expect(result.outOfPlanHoldings).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v3.0 — Passo 5: objetivo já atingido vs ritmo insuficiente (mutuamente exclusivos)
// ─────────────────────────────────────────────────────────────────────────────

describe('recommend — goalReached / paceAlert (v3.0)', () => {
  it('flags goalReached when active-class holdings already cover goalAmount', () => {
    const result = recommend({
      ...OPTS,
      goalAmount: 1000,
      holdings: [{ ticker: 'AAPL.US', units: 10, avgPrice: 150, assetClass: 'stock' }], // 1500€ ≥ 1000€
    });
    expect(result.goalReached).toBe(true);
    expect(result.paceAlert).toBe(false);
  });

  it('raises paceAlert when the remaining goal needs a pace above the current plan', () => {
    const result = recommend({
      ...OPTS,
      goalAmount: 1_000_000, // objetivo muito distante face ao plano mensal
      holdings:   [],
    });
    expect(result.goalReached).toBe(false);
    expect(result.paceAlert).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Market-value-aware weights — recommendationEngine now weighs holdings by
// HoldingSnapshot.marketValue (from portfolioState.ts) when available, instead
// of always deriving "current value" from units × avgPrice (cost).
// ─────────────────────────────────────────────────────────────────────────────

describe('recommend — market value weights', () => {
  it('1. weighs a holding by marketValue (200), not avgPrice × units (100), when both are set', () => {
    const opts: RecommendOptions = {
      universe: [makeStock('AAA.US', 'tech', 90), makeStock('BBB.US', 'tech', 90)],
      profile: PROFILE,
      preferredSectors: ['tech'],
      monthlyAmount: 500,
      preferredClasses: ['stock'],
      holdings: [
        // Equal cost (100 each) but AAA is worth 3x as much at market price.
        { ticker: 'AAA.US', units: 1, avgPrice: 100, assetClass: 'stock', marketValue: 300 },
        { ticker: 'BBB.US', units: 1, avgPrice: 100, assetClass: 'stock', marketValue: 100 },
      ],
    };
    const result = recommend(opts);
    const aaa = result.recommendations.find(r => r.asset.ticker === 'AAA.US');
    const bbb = result.recommendations.find(r => r.asset.ticker === 'BBB.US');

    // By cost both would be 50/50 (currentWeight 0.5 each). By market, total is
    // 400 → AAA 75%, BBB 25%. AAA is now the overweighted one, not balanced.
    if (aaa) expect(aaa.currentWeight).toBeCloseTo(0.75, 5);
    if (bbb) expect(bbb.currentWeight).toBeCloseTo(0.25, 5);
  });

  it('2. treats a holding as overweighted by market value even though it looked balanced by cost', () => {
    const opts: RecommendOptions = {
      universe: [makeStock('AAA.US', 'tech', 90), makeStock('BBB.US', 'tech', 90)],
      profile: PROFILE,
      preferredSectors: ['tech'],
      monthlyAmount: 500,
      preferredClasses: ['stock'],
      holdings: [
        { ticker: 'AAA.US', units: 1, avgPrice: 100, assetClass: 'stock', marketValue: 100 },
        { ticker: 'BBB.US', units: 1, avgPrice: 100, assetClass: 'stock', marketValue: 900 }, // 9x gain — dominates by market
      ],
    };
    const result = recommend(opts);
    const bbb = result.recommendations.find(r => r.asset.ticker === 'BBB.US');

    // By cost, BBB would be exactly 50% (balanced). By market it's 90% of the
    // portfolio — clearly overweighted, so it must not be recommended.
    expect(bbb).toBeUndefined();
  });

  it('3. does not offer a reinforce recommendation for a holding overweighted purely by market appreciation', () => {
    const opts: RecommendOptions = {
      universe: [makeStock('AAA.US', 'tech', 90), makeStock('BBB.US', 'tech', 90)],
      profile: PROFILE,
      preferredSectors: ['tech'],
      monthlyAmount: 500,
      preferredClasses: ['stock'],
      holdings: [
        { ticker: 'AAA.US', units: 1, avgPrice: 100, assetClass: 'stock', marketValue: 100 },
        { ticker: 'BBB.US', units: 1, avgPrice: 100, assetClass: 'stock', marketValue: 900 },
      ],
    };
    const result = recommend(opts);
    const reinforceTickers = result.recommendations.filter(r => r.type === 'reinforce').map(r => r.asset.ticker);
    expect(reinforceTickers).not.toContain('BBB.US');
  });

  it('4. falls back to units × avgPrice when marketValue is absent (unchanged prior behavior)', () => {
    // Same shape as the pre-existing "subpesado" scenario, without marketValue set.
    const opts: RecommendOptions = {
      universe: [makeStock('AAA.US', 'tech', 90), makeStock('BBB.US', 'tech', 90)],
      profile: PROFILE,
      preferredSectors: ['tech'],
      monthlyAmount: 500,
      preferredClasses: ['stock'],
      holdings: [
        { ticker: 'AAA.US', units: 1, avgPrice: 100 },
        { ticker: 'BBB.US', units: 1, avgPrice: 1900 },
      ],
    };
    const result = recommend(opts);
    const bbb = result.recommendations.find(r => r.asset.ticker === 'BBB.US');
    // 1900/(100+1900) = 95% by cost — same overweighted outcome as before this migration.
    expect(bbb).toBeUndefined();
  });

  it('5. still generates "new" recommendations for an empty portfolio', () => {
    const result = recommend({ ...OPTS, holdings: [] });
    expect(result.recommendations.length).toBeGreaterThan(0);
    result.recommendations.forEach(r => expect(r.type).toBe('new'));
  });

  it('6. a holding with marketValue 0 does not produce NaN or Infinity', () => {
    const opts: RecommendOptions = {
      universe: [makeStock('AAA.US', 'tech', 90)],
      profile: PROFILE,
      preferredSectors: ['tech'],
      monthlyAmount: 500,
      preferredClasses: ['stock'],
      holdings: [{ ticker: 'AAA.US', units: 1, avgPrice: 100, assetClass: 'stock', marketValue: 0 }],
    };
    const result = recommend(opts);
    result.recommendations.forEach(r => {
      expect(Number.isFinite(r.currentWeight)).toBe(true);
      expect(Number.isFinite(r.suggestedAmount)).toBe(true);
      expect(Number.isNaN(r.currentWeight)).toBe(false);
    });
  });

  it('7. still classifies recommendations as new vs reinforce with marketValue set', () => {
    const result = recommend({
      ...OPTS,
      holdings: [{ ticker: 'AAPL.US', units: 10, avgPrice: 150, assetClass: 'stock', marketValue: 1600 }],
    });
    const aapl = result.recommendations.find(r => r.asset.ticker === 'AAPL.US');
    if (aapl) expect(aapl.type).toBe('reinforce');
    result.recommendations
      .filter(r => r.asset.ticker !== 'AAPL.US')
      .forEach(r => expect(r.type).toBe('new'));
  });

  it('8. outOfPlanHoldings[].value uses marketValue when available, not units × avgPrice', () => {
    const result = recommend({
      ...OPTS,
      preferredClasses: ['stock', 'etf'],
      holdings: [
        { ticker: 'BND.US', units: 10, avgPrice: 80, assetClass: 'bond_etf', marketValue: 950 },
      ],
    });
    expect(result.outOfPlanHoldings).toHaveLength(1);
    expect(result.outOfPlanHoldings[0]).toMatchObject({ ticker: 'BND.US', assetClass: 'bond_etf', value: 950 });
  });

  it('9. RecommendationResult.meta remains present alongside the marketValue-aware calculation', () => {
    const result = recommend({
      ...OPTS,
      holdings: [{ ticker: 'AAPL.US', units: 10, avgPrice: 150, assetClass: 'stock', marketValue: 1700 }],
    });
    expect(result.meta?.modelName).toBe('recommendationEngine');
    expect(result.meta?.warnings).toEqual([]);
  });

  it('10. externalWarnings (e.g. from portfolioState fallbacks) surface in meta.warnings without breaking generation', () => {
    const result = recommend({
      ...OPTS,
      holdings: [{ ticker: 'AAPL.US', units: 10, avgPrice: 150, assetClass: 'stock' }], // no marketValue — simulates a missing-quote fallback
      externalWarnings: ['No live quote for AAPL.US; using average cost as a fallback'],
    });
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.meta?.warnings).toContain('No live quote for AAPL.US; using average cost as a fallback');
  });
});
