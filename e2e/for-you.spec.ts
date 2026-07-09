import { test, expect } from '@playwright/test';
import { mockSupabase } from './helpers/supabase-mock';

async function pressPin(page: import('@playwright/test').Page, digits: string) {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).first().click();
  }
}

async function loginAndReachForYou(page: import('@playwright/test').Page) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('o_teu_username').fill('teste_e2e');
  await page.getByPlaceholder('••••••••').fill('Teste1234!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/auth/pin');
  await pressPin(page, '123456');
  await expect(page).toHaveURL('/dashboard', { timeout: 5000 });
  await page.goto('/for-you');
}

const FAKE_RECOMMENDATION = {
  asset: {
    ticker: 'VOO.US', name: 'Vanguard S&P 500 ETF', exchange: 'NYSE', assetClass: 'etf', sector: 'other',
    beta: 0.95, dividendYield: 1.4, marketCap: 900_000_000_000, qualityScore: 88, currency: 'USD',
  },
  matchScore: 82, qualityScore: 88, finalScore: 84,
  suggestedAmount: 150, allocationPct: 0.6,
  type: 'new', currentWeight: 0, targetWeight: 0.6,
  reason: 'Diversificado · crescimento de capital · Diversificação automática · 84/100',
  alreadyOwned: false,
  explanation: {
    primaryReason: 'Ajuda a diversificar a carteira numa classe de ativo ainda pouco representada.',
    portfolioEffect: 'Aumenta a exposição a ETFs e aproxima a carteira da alocação-alvo.',
    riskNote: 'ETFs reduzem risco específico, mas continuam expostos ao mercado e à moeda.',
    dataConfidence: 'medium',
    scoreBreakdown: { profileMatch: 82, fundamentalQuality: 88, diversificationImpact: 100 },
    reasons: ['Sector: Outros', 'Objetivo: crescimento de capital', 'Fundamentais sólidos'],
    warnings: [],
  },
};

const FAKE_RESULT = {
  recommendations: [FAKE_RECOMMENDATION],
  allocationPlan: { stock: 0.3, etf: 0.6, bond_etf: 0.1 },
  riskScore: 65,
  monthlyAmount: 250,
  paceAlert: false,
  goalReached: false,
  outOfPlanHoldings: [],
};

test.describe('For You — recommendation explanation', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await page.route('**/api/recommendations**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_RESULT) }),
    );
  });

  test('shows the primary reason on the collapsed card', async ({ page }) => {
    await loginAndReachForYou(page);
    await expect(page.getByText('Ajuda a diversificar a carteira numa classe de ativo ainda pouco representada.')).toBeVisible();
  });

  test('shows data confidence and portfolio effect after expanding the card', async ({ page }) => {
    await loginAndReachForYou(page);
    await page.getByText('Vanguard S&P 500 ETF').click();
    await expect(page.getByText('Confiança dos dados')).toBeVisible();
    await expect(page.getByText('Média')).toBeVisible();
    await expect(page.getByText('Aumenta a exposição a ETFs e aproxima a carteira da alocação-alvo.')).toBeVisible();
  });
});
