/**
 * lib/assetUniverse.ts
 *
 * Pipeline dinâmico de candidatos para o motor de recomendações.
 *
 * Três fases:
 *   1. fetchCandidates  — obtém tickers brutos via Finnhub /stock/symbol
 *   2. filterByQuality  — aplica critérios mínimos de qualidade
 *   3. enrichAssets     — adiciona setor, beta, dividend_yield, qualityScore
 *
 * Exporta getUniverse() — resultado cached 7 dias via lib/cache.ts
 *
 * Rate limits:
 *   Finnhub free tier: ~60 req/min
 *   → batches de 40 tickers com delay de 1.2s entre batches
 *   → TwelveData e Yahoo como fallback para não-US
 */

import { getCached } from '@/lib/cache';
import { mapSector, type PortifySector } from '@/lib/sectorMap';
import { qualityScoreFromMetrics } from '@/lib/qualityScore';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export type AssetClass = 'stock' | 'etf' | 'bond_etf';

export interface CandidateAsset {
  ticker:         string;        // ex: 'AAPL.US', 'AIR.FR'
  name:           string;
  exchange:       string;
  assetClass:     AssetClass;
  sector:         PortifySector;
  beta:           number;
  dividendYield:  number;        // % anual (ex: 2.5 = 2.5%)
  marketCap:      number;        // em EUR
  qualityScore:   number;        // 0–100
  currency:       string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const UNIVERSE_TTL = 7 * 24 * 60 * 60;  // 7 dias em segundos
const ASSET_TTL    = 24 * 60 * 60;       // 24h para metadados por ativo

// Exchanges a cobrir — sufixo XTB → Finnhub exchange code
const EXCHANGES: { suffix: string; finnhub: string; region: string }[] = [
  { suffix: 'US', finnhub: 'US',  region: 'us'     },
  { suffix: 'L',  finnhub: 'L',   region: 'uk'     },
  { suffix: 'PA', finnhub: 'PA',  region: 'europe'  },
  { suffix: 'DE', finnhub: 'DE',  region: 'europe'  },
  { suffix: 'MI', finnhub: 'MI',  region: 'europe'  },
  { suffix: 'LS', finnhub: 'LS',  region: 'europe'  },
  { suffix: 'SW', finnhub: 'SW',  region: 'europe'  },
  { suffix: 'T',  finnhub: 'T',   region: 'asia'    },
  { suffix: 'HK', finnhub: 'HKEX',region: 'asia'   },
  { suffix: 'TO', finnhub: 'TO',  region: 'america' },
];

// ETFs e bond ETFs curados — qualityScore estático (sem fundamentais individuais)
const CURATED_ETFS: Omit<CandidateAsset, 'beta' | 'dividendYield' | 'marketCap'>[] = [
  // ── ETFs globais ─────────────────────────────────────────────
  { ticker: 'VOO.US',  name: 'Vanguard S&P 500 ETF',                  exchange: 'NYSE',   assetClass: 'etf',      sector: 'other', qualityScore: 92, currency: 'USD' },
  { ticker: 'VTI.US',  name: 'Vanguard Total Stock Market ETF',        exchange: 'NYSE',   assetClass: 'etf',      sector: 'other', qualityScore: 90, currency: 'USD' },
  { ticker: 'VXUS.US', name: 'Vanguard Total International Stock ETF', exchange: 'NASDAQ', assetClass: 'etf',      sector: 'other', qualityScore: 85, currency: 'USD' },
  { ticker: 'QQQ.US',  name: 'Invesco QQQ Trust (Nasdaq 100)',         exchange: 'NASDAQ', assetClass: 'etf',      sector: 'tech',  qualityScore: 82, currency: 'USD' },
  { ticker: 'VIG.US',  name: 'Vanguard Dividend Appreciation ETF',     exchange: 'NYSE',   assetClass: 'etf',      sector: 'other', qualityScore: 80, currency: 'USD' },
  { ticker: 'SCHD.US', name: 'Schwab US Dividend Equity ETF',          exchange: 'NYSE',   assetClass: 'etf',      sector: 'other', qualityScore: 78, currency: 'USD' },
  { ticker: 'VNQ.US',  name: 'Vanguard Real Estate ETF',               exchange: 'NYSE',   assetClass: 'etf',      sector: 'realestate', qualityScore: 68, currency: 'USD' },
  // ── Bond ETFs ─────────────────────────────────────────────────
  { ticker: 'VGSH.US', name: 'Vanguard Short-Term Treasury ETF',       exchange: 'NASDAQ', assetClass: 'bond_etf', sector: 'other', qualityScore: 88, currency: 'USD' },
  { ticker: 'BND.US',  name: 'Vanguard Total Bond Market ETF',         exchange: 'NASDAQ', assetClass: 'bond_etf', sector: 'other', qualityScore: 85, currency: 'USD' },
  { ticker: 'AGGH.US', name: 'iShares Core Global Aggregate Bond ETF', exchange: 'NYSE',   assetClass: 'bond_etf', sector: 'other', qualityScore: 82, currency: 'USD' },
  { ticker: 'VGIT.US', name: 'Vanguard Intermediate-Term Treasury ETF',exchange: 'NASDAQ', assetClass: 'bond_etf', sector: 'other', qualityScore: 80, currency: 'USD' },
  { ticker: 'VGLT.US', name: 'Vanguard Long-Term Treasury ETF',        exchange: 'NASDAQ', assetClass: 'bond_etf', sector: 'other', qualityScore: 72, currency: 'USD' },
  { ticker: 'HYG.US',  name: 'iShares iBoxx High Yield Corporate Bond',exchange: 'NYSE',   assetClass: 'bond_etf', sector: 'other', qualityScore: 52, currency: 'USD' },
];

// Critérios mínimos de qualidade por classe
const QUALITY_THRESHOLDS = {
  stock: {
    minMarketCapEur: 1_000_000_000,  // 1B€
    minAvgVolume:    500_000,
    minPrice:        1,
  },
  etf: {
    minMarketCapEur: 500_000_000,    // 500M€
    minAvgVolume:    100_000,
  },
  bond_etf: {
    minMarketCapEur: 1_000_000_000,  // 1B€
    minAvgVolume:    50_000,
  },
};

// Taxa de câmbio EUR aproximada por moeda (fallback offline)
const FALLBACK_EUR_RATES: Record<string, number> = {
  USD: 0.92, GBP: 1.17, CHF: 1.04, JPY: 0.006, HKD: 0.12, CAD: 0.68,
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários
// ─────────────────────────────────────────────────────────────────────────────

async function fetchEurRate(currency: string): Promise<number> {
  if (currency === 'EUR') return 1;
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${currency}`);
    if (!res.ok) throw new Error('fx_fail');
    const data = await res.json();
    return data?.rates?.EUR ?? FALLBACK_EUR_RATES[currency] ?? 1;
  } catch {
    return FALLBACK_EUR_RATES[currency] ?? 1;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function batchProcess<T, R>(
  items: T[],
  batchSize: number,
  delayMs: number,
  fn: (batch: T[]) => Promise<R[]>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await fn(batch);
    results.push(...batchResults);
    if (i + batchSize < items.length) await sleep(delayMs);
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fase 1 — Obter candidatos brutos
// ─────────────────────────────────────────────────────────────────────────────

interface RawTicker {
  symbol:      string;
  description: string;
  type:        string;   // 'Common Stock', 'ETP', etc.
  exchange?:   string;
  suffix:      string;   // sufixo XTB ex: 'US', 'PA'
}

async function fetchExchangeTickers(
  exchange: { suffix: string; finnhub: string },
  apiKey: string,
): Promise<RawTicker[]> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/symbol?exchange=${exchange.finnhub}&token=${apiKey}`
    );
    if (!res.ok) return [];
    const data: { symbol: string; description: string; type: string }[] = await res.json();

    return data
      .filter(t =>
        // Só ações comuns e ETPs (ETFs)
        t.type === 'Common Stock' || t.type === 'ETP' || t.type === 'ETF'
      )
      .map(t => ({
        symbol:      t.symbol,
        description: t.description,
        type:        t.type,
        suffix:      exchange.suffix,
        exchange:    exchange.finnhub,
      }));
  } catch {
    return [];
  }
}

async function fetchCandidates(apiKey: string): Promise<RawTicker[]> {
  const allTickers: RawTicker[] = [];

  // Processar exchanges em sequência para respeitar rate limits
  for (const exchange of EXCHANGES) {
    const tickers = await getCached(
      `universe:raw:${exchange.finnhub}`,
      UNIVERSE_TTL,
      () => fetchExchangeTickers(exchange, apiKey),
    );
    allTickers.push(...tickers);
    await sleep(300); // pequeno delay entre exchanges
  }

  return allTickers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fase 2 — Filtro de qualidade
// ─────────────────────────────────────────────────────────────────────────────

interface FinnhubMetric {
  marketCapitalization?:       number;  // em milhões USD
  beta?:                       number;
  '52WeekHigh'?:               number;
  '52WeekLow'?:                number;
  dividendYieldIndicatedAnnual?: number;
  currentRatioAnnual?:         number;
  debtToEquityAnnual?:         number;
  freeCashFlowPerShareAnnual?: number;
  revenueGrowthTTMYoy?:        number;
  epsGrowthTTMYoy?:            number;
  revenueGrowth3Y?:            number;
  roeTTM?:                     number;
  netProfitMarginTTM?:         number;
  grossMarginTTM?:             number;
}

async function fetchMetrics(
  symbol: string,  // símbolo nativo Finnhub (sem sufixo XTB)
  apiKey: string,
): Promise<FinnhubMetric | null> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${apiKey}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.metric ?? null;
  } catch {
    return null;
  }
}

async function fetchProfile(
  symbol: string,
  apiKey: string,
): Promise<{ name?: string; finnhubIndustry?: string; currency?: string; ipo?: string } | null> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Converte ticker XTB para símbolo Finnhub nativo
// ex: 'AIR.FR' → 'AIR.PA', 'AAPL.US' → 'AAPL'
const SUFFIX_TO_FINNHUB: Record<string, string> = {
  US: '', L: '.L', PA: '.PA', DE: '.DE', MI: '.MI',
  LS: '.LS', SW: '.SW', T: '.T', HK: '.HK', TO: '.TO',
};

function toFinnhubSymbol(ticker: string): string {
  const [base, suffix] = ticker.split('.');
  if (!suffix) return base;
  const mapped = SUFFIX_TO_FINNHUB[suffix.toUpperCase()];
  return mapped === undefined ? ticker : `${base}${mapped}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fase 3 — Enriquecimento
// ─────────────────────────────────────────────────────────────────────────────

async function enrichStock(
  raw: RawTicker,
  apiKey: string,
): Promise<CandidateAsset | null> {
  const finnhubSymbol = toFinnhubSymbol(`${raw.symbol}.${raw.suffix}`);

  const [metrics, profile] = await Promise.all([
    getCached(`universe:metric:${finnhubSymbol}`, ASSET_TTL, () => fetchMetrics(finnhubSymbol, apiKey)),
    getCached(`universe:profile:${finnhubSymbol}`, ASSET_TTL, () => fetchProfile(finnhubSymbol, apiKey)),
  ]);

  if (!metrics || !profile?.name) return null;

  // Market cap em EUR
  const currency = profile.currency ?? 'USD';
  const eurRate   = await fetchEurRate(currency);
  const marketCapEur = (metrics.marketCapitalization ?? 0) * 1_000_000 * eurRate;

  // Filtro de qualidade mínima
  const t = QUALITY_THRESHOLDS.stock;
  if (marketCapEur < t.minMarketCapEur) return null;

  // Verificar se tem IPO há mais de 1 ano
  if (profile.ipo) {
    const ipoDate = new Date(profile.ipo);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    if (ipoDate > oneYearAgo) return null;
  }

  const sector = mapSector(profile.finnhubIndustry);
  if (sector === 'other') return null; // sem classificação → não recomendar

  const beta         = metrics.beta ?? 1;
  const dividendYield = metrics.dividendYieldIndicatedAnnual ?? 0;

  const qualityScore = qualityScoreFromMetrics({
    currentRatioAnnual:        metrics.currentRatioAnnual,
    debtToEquityAnnual:        metrics.debtToEquityAnnual,
    freeCashFlowPerShareAnnual: metrics.freeCashFlowPerShareAnnual,
    revenueGrowthTTMYoy:       metrics.revenueGrowthTTMYoy,
    epsGrowthTTMYoy:           metrics.epsGrowthTTMYoy,
    revenueGrowth3Y:           metrics.revenueGrowth3Y,
    roeTTM:                    metrics.roeTTM,
    netProfitMarginTTM:        metrics.netProfitMarginTTM,
    grossMarginTTM:            metrics.grossMarginTTM,
    beta:                      metrics.beta,
    '52WeekHigh':              metrics['52WeekHigh'],
    '52WeekLow':               metrics['52WeekLow'],
  });

  return {
    ticker:        `${raw.symbol}.${raw.suffix}`,
    name:          profile.name,
    exchange:      raw.exchange ?? raw.suffix,
    assetClass:    'stock',
    sector,
    beta,
    dividendYield,
    marketCap:     marketCapEur,
    qualityScore,
    currency,
  };
}

// Enriquecer ETFs e bond ETFs curados com beta e dividend yield conhecidos
async function enrichCuratedEtf(
  etf: typeof CURATED_ETFS[number],
): Promise<CandidateAsset> {
  const ETF_BETA: Record<string, number> = {
    'VOO.US': 1.00, 'VTI.US': 1.00, 'VXUS.US': 0.95, 'QQQ.US': 1.10,
    'VIG.US': 0.85, 'SCHD.US': 0.80, 'VNQ.US': 1.15,
    'VGSH.US': 0.05, 'BND.US': 0.10, 'AGGH.US': 0.12,
    'VGIT.US': 0.15, 'VGLT.US': 0.25, 'HYG.US': 0.40,
  };

  const ETF_DIVIDEND: Record<string, number> = {
    'VOO.US': 1.3, 'VTI.US': 1.4, 'VXUS.US': 3.1, 'QQQ.US': 0.6,
    'VIG.US': 1.8, 'SCHD.US': 3.5, 'VNQ.US': 4.2,
    'VGSH.US': 4.8, 'BND.US': 3.2, 'AGGH.US': 3.0,
    'VGIT.US': 3.5, 'VGLT.US': 4.1, 'HYG.US': 5.8,
  };

  const ETF_MARKET_CAP: Record<string, number> = {
    'VOO.US':  450_000_000_000, 'VTI.US':  380_000_000_000,
    'VXUS.US': 70_000_000_000,  'QQQ.US':  250_000_000_000,
    'VIG.US':  90_000_000_000,  'SCHD.US': 60_000_000_000,
    'VNQ.US':  35_000_000_000,  'VGSH.US': 20_000_000_000,
    'BND.US':  110_000_000_000, 'AGGH.US': 15_000_000_000,
    'VGIT.US': 18_000_000_000,  'VGLT.US': 12_000_000_000,
    'HYG.US':  14_000_000_000,
  };

  return {
    ...etf,
    beta:         ETF_BETA[etf.ticker]       ?? 1,
    dividendYield: ETF_DIVIDEND[etf.ticker]  ?? 0,
    marketCap:    ETF_MARKET_CAP[etf.ticker] ?? 1_000_000_000,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline principal
// ─────────────────────────────────────────────────────────────────────────────

async function buildUniverse(): Promise<CandidateAsset[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn('[assetUniverse] FINNHUB_API_KEY não configurado — devolvendo só ETFs curados');
    return Promise.all(CURATED_ETFS.map(enrichCuratedEtf));
  }

  // 1. Obter tickers brutos por exchange
  const rawTickers = await fetchCandidates(apiKey);
  console.log(`[assetUniverse] ${rawTickers.length} tickers brutos obtidos`);

  // 2. Enriquecer em batches de 40 com delay de 1.5s (respeitar rate limit Finnhub)
  const enriched = await batchProcess(
    rawTickers,
    40,
    1500,
    async (batch) => {
      const results = await Promise.allSettled(
        batch.map(raw => enrichStock(raw, apiKey))
      );
      return results
        .filter((r): r is PromiseFulfilledResult<CandidateAsset> =>
          r.status === 'fulfilled' && r.value !== null
        )
        .map(r => r.value);
    },
  );

  console.log(`[assetUniverse] ${enriched.length} stocks após filtro de qualidade`);

  // 3. Adicionar ETFs e bond ETFs curados
  const etfs = await Promise.all(CURATED_ETFS.map(enrichCuratedEtf));

  const universe = [...enriched, ...etfs];
  console.log(`[assetUniverse] Universo final: ${universe.length} ativos`);

  return universe;
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devolve o universo dinâmico de ativos candidatos.
 * Cached 7 dias. Na primeira chamada ou após expirar, corre o pipeline completo.
 */
export async function getUniverse(): Promise<CandidateAsset[]> {
  return getCached('universe:v1', UNIVERSE_TTL, buildUniverse);
}

/**
 * Força a reconstrução do universo, ignorando o cache.
 * Usar apenas via app/api/universe/route.ts (endpoint admin).
 */
export async function rebuildUniverse(): Promise<CandidateAsset[]> {
  return buildUniverse();
}

/**
 * Filtra o universo pelas preferências do utilizador.
 * Aplica o filtro duro da Camada 1 do modelo de recomendações.
 */
export function filterUniverseForUser(
  universe: CandidateAsset[],
  opts: {
    preferredAssetClasses: AssetClass[];
    investmentGoal:        string;
    liquidityNeed:         string;
    horizonYears:          number;
    riskProfile:           string;
  },
): CandidateAsset[] {
  return universe.filter(asset => {
    // 1. Classe de ativo preferida
    if (!opts.preferredAssetClasses.includes(asset.assetClass)) return false;

    // 2. Fundo de emergência → só bond ETFs curto prazo
    if (opts.investmentGoal === 'emergency_fund') {
      return asset.assetClass === 'bond_etf' &&
        ['VGSH.US', 'BND.US', 'AGGH.US'].includes(asset.ticker);
    }

    // 3. Liquidez crítica → excluir stocks voláteis e bond ETFs de longo prazo
    if (opts.liquidityNeed === 'critical') {
      if (asset.assetClass === 'stock' && asset.beta > 1.2) return false;
      if (asset.ticker === 'VGLT.US' || asset.ticker === 'HYG.US') return false;
    }

    // 4. Horizonte curto com ativo muito volátil
    if (opts.horizonYears < 3 && asset.assetClass === 'stock' && asset.beta > 1.5) return false;

    // 5. Perfil muito conservador → excluir stocks de alto risco
    if (
      (opts.riskProfile === 'very_conservative' || opts.riskProfile === 'conservative') &&
      asset.assetClass === 'stock' &&
      asset.qualityScore < 50
    ) return false;

    return true;
  });
}
