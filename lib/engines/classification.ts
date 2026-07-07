// lib/engines/classification.ts
//
// Core / Satellite Classification — Portify Investment Engine v1.0, secção 5.
// Separa posições estruturais (core) de posições táticas (satellite).

import type { AssetClass, HoldingType } from './types';

// Tickers de trackers de índice amplo (MSCI World, FTSE All-World, S&P 500,
// obrigações agregadas) disponíveis em corretoras europeias comuns.
// Lista não-exaustiva, extensível conforme novos holdings core aparecerem.
const CORE_TICKERS = new Set([
  'VWCE', 'VWCE.DE', // Vanguard FTSE All-World
  'SWDA', 'SWDA.L', 'IWDA', 'IWDA.L', // iShares MSCI World
  'CSPX', 'CSPX.L', 'VUAA', 'VUAA.L', // S&P 500 trackers
  'EUNL', 'EUNL.DE', // iShares Core MSCI World (EUR)
  'AGGH', 'AGGH.L', // iShares Core Global Aggregate Bond
]);

export function classifyHoldingType(ticker: string, assetClass?: AssetClass): HoldingType {
  const base = ticker.split('.')[0].toUpperCase();
  if (CORE_TICKERS.has(ticker.toUpperCase()) || CORE_TICKERS.has(base)) return 'core';

  // Obrigações agregadas são estruturais por natureza, mesmo fora da lista curada.
  if (assetClass === 'bond_etf') return 'core';

  // ETFs temáticos/setoriais e stocks individuais são sempre satellite.
  return 'satellite';
}
