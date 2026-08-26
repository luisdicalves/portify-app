import { test, expect } from '@playwright/test';
import { mockSupabase } from './helpers/supabase-mock';

test.describe('Splash / session router', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
  });

  test('a session with no investment plan is sent to a real onboarding route, not a 404', async ({ page }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://supabase.test';
    // Override the default mock (which returns a plan) so this session looks like
    // it has never completed onboarding.
    await page.route(`${supabaseUrl}/rest/v1/investment_plans**`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );

    // Establish a real session via the login flow.
    await page.goto('/auth/login');
    await page.getByPlaceholder('o_teu_username').fill('teste_e2e');
    await page.getByPlaceholder('••••••••').fill('Teste1234!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL('/auth/pin');

    // Now hit the root splash/session-router screen directly with that session.
    await page.goto('/');

    await expect(page).toHaveURL('/auth/experience');
  });

  test('a session with a saved plan is sent to the PIN lock screen', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByPlaceholder('o_teu_username').fill('teste_e2e');
    await page.getByPlaceholder('••••••••').fill('Teste1234!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL('/auth/pin');

    await page.goto('/');

    await expect(page).toHaveURL('/auth/pin');
  });
});
