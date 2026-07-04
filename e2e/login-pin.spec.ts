import { test, expect } from '@playwright/test';
import { mockSupabase } from './helpers/supabase-mock';

async function pressPin(page: import('@playwright/test').Page, digits: string) {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).first().click();
  }
}

test.describe('Login + PIN flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
  });

  test('logs in with email/password then verifies PIN to reach dashboard', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page).toHaveURL('/auth/login');

    await page.getByPlaceholder('nome@exemplo.com').fill('e2e@test.portify.app');
    await page.getByPlaceholder('••••••••').fill('Teste1234!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page).toHaveURL('/auth/pin');

    await pressPin(page, '123456');

    await expect(page).toHaveURL('/dashboard', { timeout: 5000 });
  });

  test('shows error message on wrong PIN', async ({ page, context }) => {
    // Override verify_pin to return false for this test
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://supabase.test';
    await page.route(`${supabaseUrl}/rest/v1/rpc/verify_pin`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: 'false' }),
    );

    await page.goto('/auth/pin');
    await pressPin(page, '000000');

    await expect(page.getByText('PIN incorreto')).toBeVisible();
  });
});
