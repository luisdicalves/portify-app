import { test, expect } from '@playwright/test';
import { mockSupabase } from './helpers/supabase-mock';

const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

// A single deposit well in the past (and below the €1500 the mocked
// holding is worth today), so XIRR has both a real elapsed period and a
// clearly non-zero, clearly positive rate to assert on, regardless of
// exactly when this test runs.
const FAKE_DEPOSITS = [
  { id: 't1', user_id: USER_ID, ticker: null, type: 'deposit', units: null, price: null, amount: 1000, currency: 'EUR', executed_at: '2020-01-01T10:00:00Z', notes: null, external_id: null },
];

async function pressPin(page: import('@playwright/test').Page, digits: string) {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).first().click();
  }
}

async function loginAndReachPerformance(page: import('@playwright/test').Page) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('o_teu_username').fill('teste_e2e');
  await page.getByPlaceholder('••••••••').fill('Teste1234!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/auth/pin');
  await pressPin(page, '123456');
  await expect(page).toHaveURL('/dashboard', { timeout: 5000 });
  await page.goto('/dashboard/performance');
}

test.describe('Performance page — XIRR', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
  });

  test('shows a real XIRR percentage and its estimate caption when deposits exist', async ({ page }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://supabase.test';

    await page.route(`${supabaseUrl}/rest/v1/holdings**`, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'h1', user_id: USER_ID, ticker: 'AAPL', units: 10, avg_price: 100, currency: 'EUR' }]),
      }),
    );
    await page.route(`${supabaseUrl}/rest/v1/transactions**`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_DEPOSITS) }),
    );
    await page.route('**/api/quote**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ price: 150, change: 5, changePercent: 3.45, companyName: 'Apple Inc.' }) }),
    );
    await page.route('**/api/history**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ history: [] }) }),
    );

    await loginAndReachPerformance(page);

    await expect(page.getByText('Anualizado')).toBeVisible();
    // A real XIRR percentage, not the "—" no-data fallback.
    await expect(page.getByText(/^[+-]\d+[.,]\d%$/)).toBeVisible();
    await expect(page.getByText(/XIRR/)).toBeVisible();
  });

  test('falls back to "—" instead of a fabricated percentage when there are no transactions', async ({ page }) => {
    // mockSupabase() already defaults holdings/transactions to [] — no extra routes needed.
    await loginAndReachPerformance(page);

    await expect(page.getByText('Anualizado')).toBeVisible();
    // exact: true — a bare '—' otherwise substring-matches the page <title>
    // ("Portify — Gestão de Portfólio"), which also contains an em dash.
    await expect(page.getByText('—', { exact: true })).toBeVisible();
  });
});

test.describe('Performance page — chart accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://supabase.test';
    await page.route(`${supabaseUrl}/rest/v1/holdings**`, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'h1', user_id: USER_ID, ticker: 'AAPL', units: 10, avg_price: 100, currency: 'EUR' }]),
      }),
    );
    await page.route('**/api/quote**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ price: 150, change: 5, changePercent: 3.45, companyName: 'Apple Inc.' }) }),
    );
    // Real history (>=2 points) so the grid/axis/table chart branch renders.
    await page.route('**/api/history**', route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ points: [{ date: '2026-01-01', close: 140 }, { date: '2026-03-01', close: 145 }, { date: '2026-06-01', close: 150 }] }),
      }),
    );
  });

  test('renders a real date axis and an accessible data table alongside the chart', async ({ page }) => {
    await loginAndReachPerformance(page);

    // Axis: 3 tick labels (start/mid/end), independent of locale date formatting.
    await expect(page.locator('svg text')).toHaveCount(3);

    // Accessible fallback: SVG title + a data table with the real (unformatted) dates.
    await expect(page.locator('svg title')).toHaveText('Retorno Total');
    const table = page.locator('table.sr-only');
    await expect(page.getByText('Tabela de dados do gráfico')).toBeAttached();
    await expect(table).toContainText('2026-01-01');
    await expect(table).toContainText('2026-06-01');
  });
});
