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
