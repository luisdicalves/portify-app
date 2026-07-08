import { test, expect } from '@playwright/test';
import { mockSupabase } from './helpers/supabase-mock';

async function pressPin(page: import('@playwright/test').Page, digits: string) {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).first().click();
  }
}

async function loginAndReachDashboard(page: import('@playwright/test').Page) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('o_teu_username').fill('teste_e2e');
  await page.getByPlaceholder('••••••••').fill('Teste1234!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/auth/pin');
  await pressPin(page, '123456');
  await expect(page).toHaveURL('/dashboard', { timeout: 5000 });
}

test.describe('Dashboard totals', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://supabase.test';
    // 10 units @ 100 avg price = 1000 invested; quote price 150 -> 1500 market value, +50%
    await page.route(`${supabaseUrl}/rest/v1/holdings**`, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'h1', user_id: 'aaaaaaaa-0000-0000-0000-000000000001', ticker: 'AAPL', units: 10, avg_price: 100, currency: 'EUR' }]),
      }),
    );
    await page.route('**/api/quote**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ price: 150, change: 5, changePercent: 3.45, companyName: 'Apple Inc.' }) }),
    );
    await page.route('**/api/history**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ history: [] }) }),
    );
    await page.route('**/api/dividends**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ dividends: [] }) }),
    );
  });

  test('shows total value and return computed from portfolio state', async ({ page }) => {
    await loginAndReachDashboard(page);

    await expect(page.getByText('€ 1500,00')).toBeVisible();
    await expect(page.getByText('+50.0%')).toBeVisible();
  });

  test('shows the only holding as top gainer', async ({ page }) => {
    await loginAndReachDashboard(page);

    await expect(page.getByText('Apple Inc.')).toBeVisible();
    await expect(page.getByText('AAPL')).toBeVisible();
  });
});
