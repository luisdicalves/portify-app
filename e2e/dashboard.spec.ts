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

test.describe('Dashboard chart accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://supabase.test';
    await page.route(`${supabaseUrl}/rest/v1/holdings**`, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'h1', user_id: 'aaaaaaaa-0000-0000-0000-000000000001', ticker: 'AAPL', units: 10, avg_price: 100, currency: 'EUR' }]),
      }),
    );
    await page.route('**/api/quote**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ price: 150, change: 5, changePercent: 3.45, companyName: 'Apple Inc.' }) }),
    );
    // Real history (>=2 points) so the chart branch renders instead of the empty state.
    await page.route('**/api/history**', route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ points: [{ date: '2026-01-01', close: 140 }, { date: '2026-06-01', close: 150 }] }),
      }),
    );
    await page.route('**/api/dividends**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ dividends: [] }) }),
    );
  });

  test('renders an accessible data table alongside the chart', async ({ page }) => {
    await loginAndReachDashboard(page);

    const table = page.locator('table.sr-only');
    await expect(page.getByText('Tabela de dados do gráfico')).toBeAttached();
    await expect(table).toContainText('2026-01-01');
    await expect(table).toContainText('2026-06-01');
    await expect(page.locator('svg title')).toHaveText('Valor Total do Portfólio');
  });
});

test.describe('Dashboard keyboard accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://supabase.test';
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
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ points: [] }) }),
    );
    await page.route('**/api/dividends**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ dividends: [] }) }),
    );
  });

  test('portfolio value card is keyboard-focusable and Enter activates it, same as a click', async ({ page }) => {
    await loginAndReachDashboard(page);

    const valueCard = page.getByText('Valor Total do Portfólio').locator('..');
    await expect(valueCard).toHaveAttribute('role', 'button');
    await expect(valueCard).toHaveAttribute('tabindex', '0');

    await valueCard.focus();
    await expect(valueCard).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/dashboard/net-worth');
  });

  test('bottom nav tap targets clear the safe-area inset instead of sitting flush at the true edge', async ({ page }) => {
    await loginAndReachDashboard(page);

    // No real notch in CI — inject a real inset value and measure the actual
    // rendered layout, the same way the bug was found and the fix verified.
    const gap = await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-bottom', '40px');
      const shellBottom = document.querySelector('.phone-shell')!.getBoundingClientRect().bottom;
      const navButton = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Painel'))!;
      const buttonBottom = navButton.getBoundingClientRect().bottom;
      return Math.round(shellBottom - buttonBottom);
    });

    // Before the fix this was 0 (nav ignored the shell's safe-bottom padding
    // entirely, being position:absolute). 12px base padding + 40px inset.
    expect(gap).toBe(52);
  });
});

test.describe('Dashboard timeframe SegmentedControl', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://supabase.test';
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

  test('timeframe buttons are real role=button elements with the correct active state', async ({ page }) => {
    await loginAndReachDashboard(page);

    const defaultTab = page.getByRole('button', { name: '1A', exact: true });
    const oneMonthTab = page.getByRole('button', { name: '1M', exact: true });

    // "1A" (index 4) is the default timeframe.
    await expect(defaultTab).toHaveAttribute('aria-pressed', 'true');
    await expect(oneMonthTab).toHaveAttribute('aria-pressed', 'false');

    await oneMonthTab.click();

    await expect(oneMonthTab).toHaveAttribute('aria-pressed', 'true');
    await expect(defaultTab).toHaveAttribute('aria-pressed', 'false');
  });
});
