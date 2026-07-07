import { test, expect } from '@playwright/test';
import { mockSupabase } from './helpers/supabase-mock';

// Two dividend transactions for AAPL and one for MSFT
const FAKE_DIVIDENDS = [
  { id: 'd1', user_id: 'aaaaaaaa-0000-0000-0000-000000000001', ticker: 'AAPL', type: 'dividend', units: null, price: null, amount: 12.50, currency: 'EUR', executed_at: '2025-03-15T10:00:00Z', notes: null, external_id: null },
  { id: 'd2', user_id: 'aaaaaaaa-0000-0000-0000-000000000001', ticker: 'AAPL', type: 'dividend', units: null, price: null, amount: 13.00, currency: 'EUR', executed_at: '2025-06-15T10:00:00Z', notes: null, external_id: null },
  { id: 'd3', user_id: 'aaaaaaaa-0000-0000-0000-000000000001', ticker: 'MSFT', type: 'dividend', units: null, price: null, amount: 8.75, currency: 'EUR', executed_at: '2025-04-10T10:00:00Z', notes: null, external_id: null },
];

async function pressPin(page: import('@playwright/test').Page, digits: string) {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).first().click();
  }
}

async function loginAndReachPortfolio(page: import('@playwright/test').Page) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('o_teu_username').fill('teste_e2e');
  await page.getByPlaceholder('••••••••').fill('Teste1234!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/auth/pin');
  await pressPin(page, '123456');
  await expect(page).toHaveURL('/dashboard', { timeout: 5000 });
  await page.goto('/portfolio');
}

test.describe('Portfolio buy/sell sheets', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
  });

  test('FAB Comprar opens buy sheet with ticker search field', async ({ page }) => {
    await loginAndReachPortfolio(page);

    // Open FAB
    await page.getByTestId('fab-toggle').click();
    await page.getByRole('button', { name: 'Comprar', exact: true }).click();

    // Buy sheet should be visible with search input
    await expect(page.getByText('Registar compra')).toBeVisible();
    await expect(page.getByPlaceholder(/AAPL.*NVDA/i)).toBeVisible();
  });

  test('FAB Vender opens sell sheet with portfolio holdings', async ({ page }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://supabase.test';

    // Add a holding so sell sheet has something to show
    await page.route(`${supabaseUrl}/rest/v1/holdings**`, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'h1', user_id: 'aaaaaaaa-0000-0000-0000-000000000001', ticker: 'AAPL', units: 5, avg_price: 180, currency: 'EUR' }]),
      }),
    );

    await loginAndReachPortfolio(page);

    // Open FAB
    await page.getByTestId('fab-toggle').click();
    await page.getByRole('button', { name: 'Vender', exact: true }).click();

    // Sell sheet should show portfolio holdings
    await expect(page.getByText('Registar venda')).toBeVisible();
    await expect(page.getByText('AAPL').first()).toBeVisible();
  });

  test('buy sheet shows error for invalid ticker', async ({ page }) => {
    await loginAndReachPortfolio(page);

    // Mock the quote API to return 404 for unknown tickers
    await page.route('/api/quote**', route => route.fulfill({ status: 404 }));

    await page.getByTestId('fab-toggle').click();
    await page.getByRole('button', { name: 'Comprar', exact: true }).click();

    await page.getByPlaceholder(/AAPL.*NVDA/i).fill('XXXINVALID');
    // Search is triggered explicitly (no auto-debounce) — click the search button
    await page.getByRole('button', { name: /Pesquisar/i }).click();

    await expect(page.getByText(/Ativo não encontrado/i)).toBeVisible();
  });
});

test.describe('Portfolio positions sorting', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);

    // ZANY: high value (100 units @ 10), no gain, alphabetically last.
    // ABCX: low value (1 unit @ 50), huge gain (10 -> 50), alphabetically first, fewest units.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://supabase.test';
    await page.route(`${supabaseUrl}/rest/v1/holdings**`, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { id: 'h1', user_id: 'aaaaaaaa-0000-0000-0000-000000000001', ticker: 'ZANY', units: 100, avg_price: 10, currency: 'EUR' },
          { id: 'h2', user_id: 'aaaaaaaa-0000-0000-0000-000000000001', ticker: 'ABCX', units: 1, avg_price: 10, currency: 'EUR' },
        ]),
      }),
    );
    await page.route('**/api/quote**', route => {
      const symbol = new URL(route.request().url()).searchParams.get('symbol');
      const price = symbol === 'ZANY' ? 10 : 50; // ZANY: flat (0% gain); ABCX: 10 -> 50 (400% gain)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ price, change: 0, changePercent: 0 }) });
    });
  });

  test('defaults to sorting by value, highest first', async ({ page }) => {
    await loginAndReachPortfolio(page);
    const rows = page.locator('div').filter({ hasText: /^(ZANY|ABCX)/ });
    await expect(rows.first()).toContainText('ZANY'); // 100×10=1000 > 1×50=50
  });

  test('sorting by rentabilidade puts the biggest gainer first', async ({ page }) => {
    await loginAndReachPortfolio(page);
    await page.getByText('Rentabilidade', { exact: true }).click();
    const rows = page.locator('div').filter({ hasText: /^(ZANY|ABCX)/ });
    await expect(rows.first()).toContainText('ABCX'); // +400% > 0%
  });

  test('sorting A-Z is alphabetical by ticker', async ({ page }) => {
    await loginAndReachPortfolio(page);
    await page.getByText('A-Z', { exact: true }).click();
    const rows = page.locator('div').filter({ hasText: /^(ZANY|ABCX)/ });
    await expect(rows.first()).toContainText('ABCX'); // 'ABCX' < 'ZANY'
  });

  test('sorting by unidades puts the largest position first', async ({ page }) => {
    await loginAndReachPortfolio(page);
    await page.getByText('Unidades', { exact: true }).click();
    const rows = page.locator('div').filter({ hasText: /^(ZANY|ABCX)/ });
    await expect(rows.first()).toContainText('ZANY'); // 100 units > 1 unit
  });
});

test.describe('Portfolio dividends tab', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
  });

  test('received dividends are grouped by ticker with total per stock', async ({ page }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://supabase.test';

    // Override transactions mock to include dividend entries
    await page.route(`${supabaseUrl}/rest/v1/transactions**`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_DIVIDENDS) }),
    );

    await loginAndReachPortfolio(page);

    // Switch to dividends tab
    await page.getByRole('button', { name: 'Dividendos', exact: true }).click();

    // AAPL should appear once with 2 payments (12.50 + 13.00 = 25.50)
    await expect(page.getByText('AAPL').first()).toBeVisible();
    await expect(page.getByText('2 pagamentos')).toBeVisible();

    // MSFT should appear once with 1 payment
    await expect(page.getByText('MSFT')).toBeVisible();
    await expect(page.getByText('1 pagamento')).toBeVisible();
  });

  test('upcoming dividends section header is visible', async ({ page }) => {
    await loginAndReachPortfolio(page);

    // Switch to dividends tab
    await page.getByRole('button', { name: 'Dividendos', exact: true }).click();

    // The upcoming and received section headers should be visible
    await expect(page.getByText('Próximos', { exact: true })).toBeVisible();
    await expect(page.getByText('Recebidos', { exact: true })).toBeVisible();
  });
});

test.describe('Portfolio history filters', () => {
  // RECENT is "now" (never in the future, so TradeDateDialog never disables it);
  // OLD is a day in the previous calendar month, always before "first day of this month".
  const now = new Date();
  const OLD_ISO = new Date(now.getFullYear(), now.getMonth() - 1, 15, 10, 0, 0).toISOString();
  const RECENT_ISO = now.toISOString();

  async function mockHistoryTxns(page: import('@playwright/test').Page) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://supabase.test';
    await page.route(`${supabaseUrl}/rest/v1/transactions**`, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([
          { id: 'old-buy', user_id: 'aaaaaaaa-0000-0000-0000-000000000001', ticker: 'AAPL', type: 'buy', units: 10, price: 150, amount: 1500, currency: 'EUR', executed_at: OLD_ISO, notes: null, external_id: null },
          { id: 'recent-deposit', user_id: 'aaaaaaaa-0000-0000-0000-000000000001', ticker: null, type: 'deposit', units: null, price: null, amount: 500, currency: 'EUR', executed_at: RECENT_ISO, notes: null, external_id: null },
        ]),
      }),
    );
  }

  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
  });

  test('type filter shows only the selected transaction types', async ({ page }) => {
    await mockHistoryTxns(page);
    await loginAndReachPortfolio(page);
    await page.getByRole('button', { name: 'Histórico', exact: true }).click();

    // Both transactions visible by default (no filter selected)
    await expect(page.getByText('AAPL')).toBeVisible();
    await expect(page.getByText('+500,00 €')).toBeVisible();

    // Selecting "Compra" hides the deposit
    await page.getByRole('button', { name: 'Compra', exact: true }).click();
    await expect(page.getByText('AAPL')).toBeVisible();
    await expect(page.getByText('+500,00 €')).not.toBeVisible();

    // Also selecting "Depósito" (multi-select) brings it back
    await page.getByRole('button', { name: 'Depósito', exact: true }).click();
    await expect(page.getByText('AAPL')).toBeVisible();
    await expect(page.getByText('+500,00 €')).toBeVisible();
  });

  test('date-range filter excludes transactions outside the range', async ({ page }) => {
    await mockHistoryTxns(page);
    await loginAndReachPortfolio(page);
    await page.getByRole('button', { name: 'Histórico', exact: true }).click();

    await expect(page.getByText('AAPL')).toBeVisible();

    // "De" defaults its calendar to the current month — pick day 1, which excludes
    // the previous-month buy but keeps the "now" deposit.
    await page.getByRole('button', { name: 'event De' }).click();
    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();

    await expect(page.getByText('AAPL')).not.toBeVisible();
    await expect(page.getByText('+500,00 €')).toBeVisible();

    // Clearing the bound restores the full list
    await page.getByRole('button', { name: /event De:/ }).locator('text=close').click();
    await expect(page.getByText('AAPL')).toBeVisible();
  });

  test('shows an empty state when the filter matches nothing', async ({ page }) => {
    await mockHistoryTxns(page);
    await loginAndReachPortfolio(page);
    await page.getByRole('button', { name: 'Histórico', exact: true }).click();

    // Neither fixture transaction is a dividend
    await page.getByRole('button', { name: 'Dividendo', exact: true }).click();
    await expect(page.getByText('Nenhum movimento corresponde ao filtro.')).toBeVisible();
  });
});
