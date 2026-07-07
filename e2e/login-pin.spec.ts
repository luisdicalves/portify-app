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

  test('logs in with user ID/password then verifies PIN to reach dashboard', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page).toHaveURL('/auth/login');

    await page.getByPlaceholder('o_teu_username').fill('teste_e2e');
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

  test('shows a generic error for an unknown user ID, without revealing it does not exist', async ({ page }) => {
    // Override get_email_by_handle to simulate a user_handle that has no matching account
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://supabase.test';
    await page.route(`${supabaseUrl}/rest/v1/rpc/get_email_by_handle`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
    );

    await page.goto('/auth/login');
    await page.getByPlaceholder('o_teu_username').fill('does_not_exist');
    await page.getByPlaceholder('••••••••').fill('Teste1234!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page.getByText('ID de utilizador ou palavra-passe incorretos.')).toBeVisible();
  });

  test('shows the same generic error for a known user ID with the wrong password', async ({ page }) => {
    // get_email_by_handle resolves fine, but the password is rejected by Supabase Auth
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://supabase.test';
    await page.route(`${supabaseUrl}/rest/v1/rpc/get_email_by_handle`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('e2e@test.portify.app') }),
    );
    await page.route(`${supabaseUrl}/auth/v1/token**`, route =>
      route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }) }),
    );

    await page.goto('/auth/login');
    await page.getByPlaceholder('o_teu_username').fill('teste_e2e');
    await page.getByPlaceholder('••••••••').fill('wrong-password');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page.getByText('ID de utilizador ou palavra-passe incorretos.')).toBeVisible();
  });
});
