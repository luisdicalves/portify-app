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
  await page.getByPlaceholder('nome@exemplo.com').fill('e2e@test.portify.app');
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
    await page.getByRole('button', { name: 'add' }).click();
    await page.getByRole('button', { name: 'Comprar' }).click();

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
    await page.getByRole('button', { name: 'add' }).click();
    await page.getByRole('button', { name: 'Vender' }).click();

    // Sell sheet should show portfolio holdings
    await expect(page.getByText('Registar venda')).toBeVisible();
    await expect(page.getByText('AAPL').first()).toBeVisible();
  });

  test('buy sheet shows error for invalid ticker', async ({ page }) => {
    await loginAndReachPortfolio(page);

    // Mock the quote API to return 404 for unknown tickers
    await page.route('/api/quote**', route => route.fulfill({ status: 404 }));

    await page.getByRole('button', { name: 'add' }).click();
    await page.getByRole('button', { name: 'Comprar' }).click();

    await page.getByPlaceholder(/AAPL.*NVDA/i).fill('XXXINVALID');
    await page.waitForTimeout(800); // debounce

    await expect(page.getByText(/Ativo não encontrado/i)).toBeVisible();
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
