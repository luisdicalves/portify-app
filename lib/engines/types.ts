// lib/engines/types.ts
//
// Domain types shared across the investment-engine modules (lib/engines/*).
// Engines communicate only through these plain objects — no direct engine-to-engine
// imports, per the Portify Investment Engine spec.

export type QualityLabel = 'excellent' | 'good' | 'average' | 'weak' | 'poor';
export type AssetClass = 'stock' | 'etf' | 'bond_etf';
export type HoldingType = 'core' | 'satellite';

// ─────────────────────────────────────────────────────────────────────────────
// Quality Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface QualityEngineInput {
  // Valuation — 35%
  peTTM?: number;
  psTTM?: number;
  evRevenueTTM?: number;

  // Financial Health — 35%
  currentRatioAnnual?: number;
  debtToEquityAnnual?: number;
  roeTTM?: number;
  operatingMarginTTM?: number;

  // Growth — 30%
  revenueGrowthTTMYoy?: number;
  epsGrowthTTMYoy?: number;
  avgEarningsSurprisePct?: number;
}

export interface QualityEngineResult {
  valuationScore: number;
  financialHealthScore: number;
  growthScore: number;
  total: number;
  label: QualityLabel;
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface RiskEngineInput {
  beta?: number;
  dailyCloses?: number[]; // chronological, ~1y of daily closes
  debtToEquityAnnual?: number;
  marketCapUsd?: number; // liquidity proxy — see riskEngine.ts
}

export interface RiskEngineResult {
  betaScore: number;
  volatilityScore: number;
  drawdownScore: number;
  debtScore: number;
  liquidityScore: number;
  total: number; // 100 = muito seguro, 0 = muito arriscado
}

// ─────────────────────────────────────────────────────────────────────────────
// Conviction Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface ConvictionEngineInput {
  quarterlyEarningsSurprisesPct?: number[];
  quarterlyRevenueGrowthPct?: number[];
  quarterlyMarginsPct?: number[];
  analystBuy?: number;
  analystHold?: number;
  analystSell?: number;
  quarterlyEpsGrowthPct?: number[];
}

export interface ConvictionEngineResult {
  surpriseConsistency: number;
  revenueGrowthStability: number;
  marginStability: number;
  analystConsensus: number;
  epsStability: number;
  total: number;
}
