// Deterministic, rule-based "risk score" report — no LLM involved, just thresholds
// applied to real fundamentals from Finnhub's free tier (US-listed tickers only;
// non-US exchanges aren't covered by the free plan, same restriction as /api/quote).

const FINNHUB_SUFFIX_MAP: Record<string, string> = { US: '' };

export function toFinnhubSymbol(ticker: string): string {
  const [base, suffix] = ticker.split('.');
  if (!suffix) return base;
  const mapped = FINNHUB_SUFFIX_MAP[suffix.toUpperCase()];
  return mapped === undefined ? ticker : `${base}${mapped}`;
}

type Tag = 'LOCK' | 'FLEX' | 'WATCH';

type Metric = { label: string; value: string; tag: Tag };

type Pillar = {
  score: number;
  weight: number;
  verdict: string;
  description: string;
  metrics: Metric[];
  plainEnglish: string;
};

export type RiskReport = {
  ticker: string;
  companyName: string;
  price: number;
  currency: string;
  sector: string;
  tagline: string;
  score: number;
  scoreLabel: 'low' | 'moderate' | 'high';
  pillars: { valuation: Pillar; health: Pillar; growth: Pillar };
  chart: { period: string; revenue: number; ebitda: number }[];
  executiveSummary: string;
  risks: string[];
  catalysts: string[];
  actionGuide: {
    aggressiveEntry: number;
    conservativeEntry: number;
    current: number;
    trim: number;
    stop: number;
    beta: number;
    savingsPlanSuitable: boolean;
  };
  footer: { tags: string[]; source: string; nextEarnings: string | null };
};

export function band(value: number | null | undefined, thresholds: [number, number][]): number {
  if (value == null || Number.isNaN(value)) return 50;
  for (const [limit, score] of thresholds) {
    if (value <= limit) return score;
  }
  return thresholds[thresholds.length - 1][1];
}

async function fetchEurRate(): Promise<number> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) return 0.92;
    const data = await res.json();
    return data?.rates?.EUR ?? 0.92;
  } catch {
    return 0.92;
  }
}

const T = {
  pt: {
    tagline: 'Análise de risco baseada em fundamentais reais (sem IA).',
    scoreLow: 'Risco baixo', scoreModerate: 'Risco moderado', scoreHigh: 'Risco elevado',
    valuationLabel: 'Valuation', healthLabel: 'Saúde Financeira', growthLabel: 'Crescimento',
    pe: 'P/E (TTM)', ps: 'P/S (TTM)', evRev: 'EV/Receita (TTM)',
    currentRatio: 'Rácio Corrente', debtEquity: 'Dívida/Capital Próprio', roe: 'ROE (TTM)', opMargin: 'Margem Operacional',
    revGrowth: 'Crescimento Receita (YoY)', epsGrowth: 'Crescimento EPS (YoY)', surprise: 'Surpresa Média (4 trim.)', analystRec: 'Recomendação Analistas',
    invested: 'Investido', revenue: 'Receita', ebitda: 'EBITDA',
    savingsPlanYes: 'Adequado para plano de investimento automático — a volatilidade (beta) favorece entradas regulares que diluem o preço médio.',
    savingsPlanNo: 'Mais adequado para lote único em zona de entrada — volatilidade moderada não justifica só por si um plano automático, mas também não o desaconselha.',
    sourceFootnote: 'Dados: Finnhub (fundamentais reportados/TTM)',
  },
  en: {
    tagline: 'Risk analysis based on real fundamentals (no AI).',
    scoreLow: 'Low risk', scoreModerate: 'Moderate risk', scoreHigh: 'High risk',
    valuationLabel: 'Valuation', healthLabel: 'Financial Health', growthLabel: 'Growth',
    pe: 'P/E (TTM)', ps: 'P/S (TTM)', evRev: 'EV/Revenue (TTM)',
    currentRatio: 'Current Ratio', debtEquity: 'Debt/Equity', roe: 'ROE (TTM)', opMargin: 'Operating Margin',
    revGrowth: 'Revenue Growth (YoY)', epsGrowth: 'EPS Growth (YoY)', surprise: 'Avg. Surprise (4 qtrs)', analystRec: 'Analyst Recommendation',
    invested: 'Invested', revenue: 'Revenue', ebitda: 'EBITDA',
    savingsPlanYes: 'Suitable for an automatic investment plan — volatility (beta) favors regular entries that average out the purchase price.',
    savingsPlanNo: 'Better suited to a lump sum at a good entry zone — moderate volatility alone doesn\'t require an automatic plan, but doesn\'t rule it out either.',
    sourceFootnote: 'Data: Finnhub (reported/TTM fundamentals)',
  },
};

export async function fetchRiskReport(ticker: string, lang: 'pt' | 'en'): Promise<RiskReport | null> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return null;
  const symbol = toFinnhubSymbol(ticker);
  const tx = T[lang];

  const [metricRes, profileRes, recRes, earningsRes, eurRate] = await Promise.all([
    fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${apiKey}`),
    fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${apiKey}`),
    fetch(`https://finnhub.io/api/v1/stock/recommendation?symbol=${symbol}&token=${apiKey}`),
    fetch(`https://finnhub.io/api/v1/stock/earnings?symbol=${symbol}&token=${apiKey}`),
    fetchEurRate(),
  ]);

  if (!metricRes.ok || !profileRes.ok) return null;
  const metricData = await metricRes.json();
  const profile = await profileRes.json();
  const recommendations = recRes.ok ? await recRes.json() : [];
  const earnings = earningsRes.ok ? await earningsRes.json() : [];

  const m = metricData.metric ?? {};
  const quarterly = metricData.series?.quarterly ?? {};
  if (!profile.name) return null;

  const toEur = (usd: number) => usd * eurRate;

  // ---- Valuation (35%) ----
  const peScore = band(m.peTTM, [[15, 100], [25, 80], [35, 60], [50, 40], [Infinity, 20]]);
  const psScore = band(m.psTTM, [[2, 100], [5, 80], [10, 60], [15, 40], [Infinity, 20]]);
  const evRevScore = band(m['evRevenueTTM'] ?? m.psTTM, [[2, 100], [5, 80], [10, 60], [15, 40], [Infinity, 20]]);
  const valuationScore = Math.round((peScore + psScore + evRevScore) / 3);

  // ---- Financial Health (35%) ----
  const currentRatioScore = band(m.currentRatioAnnual, [[0.7, 30], [1, 50], [1.5, 70], [2, 85], [Infinity, 100]]);
  const debtEquityScore = band(m['totalDebt/totalEquityAnnual'], [[0.3, 100], [0.7, 85], [1.2, 65], [2, 45], [Infinity, 25]]);
  const roeScore = band(m.roeTTM, [[0, 20], [10, 50], [20, 75], [40, 90], [Infinity, 100]]);
  const marginScore = band(m.operatingMarginTTM, [[0, 20], [10, 50], [20, 75], [30, 90], [Infinity, 100]]);
  const healthScore = Math.round((currentRatioScore + debtEquityScore + roeScore + marginScore) / 4);

  // ---- Growth (30%) ----
  const revGrowthScore = band(m.revenueGrowthTTMYoy, [[0, 20], [5, 50], [15, 75], [30, 90], [Infinity, 100]]);
  const epsGrowthScore = band(m.epsGrowthTTMYoy, [[0, 20], [5, 50], [15, 75], [30, 90], [Infinity, 100]]);
  const avgSurprise = Array.isArray(earnings) && earnings.length
    ? earnings.slice(0, 4).reduce((s: number, e: { surprisePercent?: number }) => s + (e.surprisePercent ?? 0), 0) / Math.min(4, earnings.length)
    : 0;
  const surpriseScore = avgSurprise >= 0 ? 70 : 40;
  const growthScore = Math.round((revGrowthScore + epsGrowthScore + surpriseScore) / 3);

  const overall = Math.round(valuationScore * 0.35 + healthScore * 0.35 + growthScore * 0.30);
  const scoreLabel: RiskReport['scoreLabel'] = overall >= 70 ? 'low' : overall >= 50 ? 'moderate' : 'high';

  const tag = (riskyCondition: boolean, base: Tag = 'LOCK'): Tag => (riskyCondition ? 'WATCH' : base);

  const valuation: Pillar = {
    score: valuationScore, weight: 35,
    verdict: valuationScore >= 70 ? (lang === 'pt' ? 'Valuation razoável.' : 'Reasonable valuation.') : valuationScore >= 50 ? (lang === 'pt' ? 'Valuation exigente.' : 'Demanding valuation.') : (lang === 'pt' ? 'Valuation muito esticada.' : 'Very stretched valuation.'),
    description: lang === 'pt'
      ? `O mercado paga ${m.peTTM?.toFixed(1) ?? '—'}x os lucros e ${m.psTTM?.toFixed(1) ?? '—'}x a receita. Múltiplos mais altos implicam mais risco de correção se o crescimento desapontar.`
      : `The market pays ${m.peTTM?.toFixed(1) ?? '—'}x earnings and ${m.psTTM?.toFixed(1) ?? '—'}x revenue. Higher multiples mean more downside risk if growth disappoints.`,
    metrics: [
      { label: tx.pe, value: m.peTTM != null ? `${m.peTTM.toFixed(1)}x` : '—', tag: tag(m.peTTM > 35) },
      { label: tx.ps, value: m.psTTM != null ? `${m.psTTM.toFixed(1)}x` : '—', tag: tag(m.psTTM > 10) },
      { label: tx.evRev, value: m['evRevenueTTM'] != null ? `${m['evRevenueTTM'].toFixed(1)}x` : '—', tag: 'FLEX' },
    ],
    plainEnglish: lang === 'pt'
      ? 'Quanto mais caro o ativo em relação aos lucros/receita, mais espaço há para cair se as coisas não correrem como esperado.'
      : 'The more expensive the asset relative to earnings/revenue, the more room it has to fall if things don\'t go as expected.',
  };

  const health: Pillar = {
    score: healthScore, weight: 35,
    verdict: healthScore >= 70 ? (lang === 'pt' ? 'Balanço sólido.' : 'Solid balance sheet.') : healthScore >= 50 ? (lang === 'pt' ? 'Balanço aceitável.' : 'Acceptable balance sheet.') : (lang === 'pt' ? 'Balanço frágil.' : 'Fragile balance sheet.'),
    description: lang === 'pt'
      ? `Rácio corrente de ${m.currentRatioAnnual?.toFixed(2) ?? '—'} e dívida/capital próprio de ${m['totalDebt/totalEquityAnnual']?.toFixed(2) ?? '—'}x. ROE de ${m.roeTTM?.toFixed(1) ?? '—'}%.`
      : `Current ratio of ${m.currentRatioAnnual?.toFixed(2) ?? '—'} and debt/equity of ${m['totalDebt/totalEquityAnnual']?.toFixed(2) ?? '—'}x. ROE of ${m.roeTTM?.toFixed(1) ?? '—'}%.`,
    metrics: [
      { label: tx.currentRatio, value: m.currentRatioAnnual != null ? m.currentRatioAnnual.toFixed(2) : '—', tag: tag(m.currentRatioAnnual < 1) },
      { label: tx.debtEquity, value: m['totalDebt/totalEquityAnnual'] != null ? `${m['totalDebt/totalEquityAnnual'].toFixed(2)}x` : '—', tag: tag(m['totalDebt/totalEquityAnnual'] > 1.2) },
      { label: tx.roe, value: m.roeTTM != null ? `${m.roeTTM.toFixed(1)}%` : '—', tag: 'LOCK' },
      { label: tx.opMargin, value: m.operatingMarginTTM != null ? `${m.operatingMarginTTM.toFixed(1)}%` : '—', tag: 'LOCK' },
    ],
    plainEnglish: lang === 'pt'
      ? 'Mede se a empresa tem capacidade de pagar as suas contas e dívidas mesmo se as vendas abrandarem.'
      : 'Measures whether the company can pay its bills and debts even if sales slow down.',
  };

  const growth: Pillar = {
    score: growthScore, weight: 30,
    verdict: growthScore >= 70 ? (lang === 'pt' ? 'Crescimento forte.' : 'Strong growth.') : growthScore >= 50 ? (lang === 'pt' ? 'Crescimento moderado.' : 'Moderate growth.') : (lang === 'pt' ? 'Crescimento fraco.' : 'Weak growth.'),
    description: lang === 'pt'
      ? `Receita a crescer ${m.revenueGrowthTTMYoy?.toFixed(1) ?? '—'}% e EPS ${m.epsGrowthTTMYoy?.toFixed(1) ?? '—'}% ano a ano. Surpresa média dos últimos 4 trimestres: ${avgSurprise.toFixed(1)}%.`
      : `Revenue growing ${m.revenueGrowthTTMYoy?.toFixed(1) ?? '—'}% and EPS ${m.epsGrowthTTMYoy?.toFixed(1) ?? '—'}% year over year. Average surprise over the last 4 quarters: ${avgSurprise.toFixed(1)}%.`,
    metrics: [
      { label: tx.revGrowth, value: m.revenueGrowthTTMYoy != null ? `${m.revenueGrowthTTMYoy.toFixed(1)}%` : '—', tag: tag(m.revenueGrowthTTMYoy < 0, 'FLEX') },
      { label: tx.epsGrowth, value: m.epsGrowthTTMYoy != null ? `${m.epsGrowthTTMYoy.toFixed(1)}%` : '—', tag: tag(m.epsGrowthTTMYoy < 0, 'FLEX') },
      { label: tx.surprise, value: `${avgSurprise.toFixed(1)}%`, tag: 'FLEX' },
    ],
    plainEnglish: lang === 'pt'
      ? 'Crescimento consistente reduz o risco de a empresa decepcionar o mercado nos próximos resultados.'
      : 'Consistent growth lowers the risk of the company disappointing the market in upcoming earnings.',
  };

  const chart: { period: string; revenue: number; ebitda: number }[] = [];
  const ebitdaSeries: { period: string; v: number }[] = quarterly.ebitda ?? [];
  const salesPerShareSeries: { period: string; v: number }[] = quarterly.salesPerShare ?? [];
  const shareOutstanding = profile.shareOutstanding ?? 0;
  const last5 = ebitdaSeries.slice(0, 5).reverse();
  last5.forEach((e, i) => {
    const sps = salesPerShareSeries.find(s => s.period === e.period)?.v ?? 0;
    chart.push({ period: e.period, revenue: Math.round(sps * shareOutstanding), ebitda: Math.round(e.v) });
  });

  const latestRec = recommendations[0];
  const recText = latestRec
    ? `${latestRec.strongBuy + latestRec.buy} buy / ${latestRec.hold} hold / ${latestRec.sell + latestRec.strongSell} sell`
    : '—';

  const risks: string[] = [];
  const catalysts: string[] = [];
  if (m.peTTM > 35) risks.push(lang === 'pt' ? `Valuation exigente (P/E ${m.peTTM.toFixed(1)}x) — sensível a qualquer abrandamento.` : `Demanding valuation (P/E ${m.peTTM.toFixed(1)}x) — sensitive to any slowdown.`);
  if (m['totalDebt/totalEquityAnnual'] > 1.2) risks.push(lang === 'pt' ? 'Endividamento elevado face ao capital próprio.' : 'High leverage relative to equity.');
  if (m.currentRatioAnnual < 1) risks.push(lang === 'pt' ? 'Rácio corrente abaixo de 1 — liquidez de curto prazo apertada.' : 'Current ratio below 1 — tight short-term liquidity.');
  if (m.revenueGrowthTTMYoy < 0) risks.push(lang === 'pt' ? 'Receita em contração ano a ano.' : 'Revenue contracting year over year.');
  if (risks.length === 0) risks.push(lang === 'pt' ? 'Sem sinais de alerta relevantes nos fundamentais analisados.' : 'No major red flags in the fundamentals analyzed.');

  if (m.revenueGrowthTTMYoy > 15) catalysts.push(lang === 'pt' ? 'Crescimento de receita acima de 15% ano a ano.' : 'Revenue growth above 15% year over year.');
  if (avgSurprise > 2) catalysts.push(lang === 'pt' ? 'Histórico recente de superar as estimativas de resultados.' : 'Recent track record of beating earnings estimates.');
  if (latestRec && latestRec.strongBuy + latestRec.buy > latestRec.hold + latestRec.sell + latestRec.strongSell) catalysts.push(lang === 'pt' ? 'Maioria dos analistas em compra.' : 'Majority of analysts rate it a buy.');
  if (catalysts.length === 0) catalysts.push(lang === 'pt' ? 'Sem catalisadores fortes identificados nos dados disponíveis.' : 'No strong catalysts identified in the available data.');

  const beta = m.beta ?? 1;
  const spread = Math.min(0.25, Math.max(0.08, beta * 0.08));

  const executiveSummary = lang === 'pt'
    ? `${profile.name} apresenta um score global de ${overall}/100 (${scoreLabel === 'low' ? 'risco baixo' : scoreLabel === 'moderate' ? 'risco moderado' : 'risco elevado'}). A valuation está em ${valuationScore}/100, a saúde financeira em ${healthScore}/100 e o crescimento em ${growthScore}/100. Beta de ${beta.toFixed(2)} indica volatilidade ${beta > 1.3 ? 'bem acima' : beta > 1 ? 'acima' : 'próxima ou abaixo'} da do mercado. ${risks[0]}`
    : `${profile.name} has an overall score of ${overall}/100 (${scoreLabel} risk). Valuation scores ${valuationScore}/100, financial health ${healthScore}/100, and growth ${growthScore}/100. A beta of ${beta.toFixed(2)} indicates volatility ${beta > 1.3 ? 'well above' : beta > 1 ? 'above' : 'near or below'} the market. ${risks[0]}`;

  return {
    ticker,
    companyName: profile.name,
    price: 0, // filled in by the page from the already-fetched /api/quote price
    currency: 'EUR',
    sector: profile.finnhubIndustry ?? '—',
    tagline: tx.tagline,
    score: overall,
    scoreLabel,
    pillars: { valuation, health, growth },
    chart: chart.map(c => ({ ...c, revenue: Math.round(toEur(c.revenue)), ebitda: Math.round(toEur(c.ebitda)) })),
    executiveSummary,
    risks,
    catalysts,
    actionGuide: {
      aggressiveEntry: 1 - spread * 0.5,
      conservativeEntry: 1 - spread,
      current: 1,
      trim: 1 + spread * 1.5,
      stop: 1 - spread * 1.8,
      beta,
      savingsPlanSuitable: beta >= 1.1,
    },
    footer: {
      tags: [profile.finnhubIndustry, recText].filter(Boolean),
      source: tx.sourceFootnote,
      nextEarnings: null,
    },
  };
}
