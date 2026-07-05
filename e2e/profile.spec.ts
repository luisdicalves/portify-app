import { test, expect } from '@playwright/test';
import { mockSupabase } from './helpers/supabase-mock';

async function pressPin(page: import('@playwright/test').Page, digits: string) {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).first().click();
  }
}

async function loginAndReachProfile(page: import('@playwright/test').Page) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('nome@exemplo.com').fill('e2e@test.portify.app');
  await page.getByPlaceholder('••••••••').fill('Teste1234!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/auth/pin');
  await pressPin(page, '123456');
  await expect(page).toHaveURL('/dashboard', { timeout: 5000 });
  await page.goto('/profile');
}

test.describe('Profile page', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
  });

  test('horizonte temporal opens its own sheet, not the full plan sheet', async ({ page }) => {
    await loginAndReachProfile(page);

    // Click the "Horizonte temporal" settings row
    await page.getByText('Horizonte temporal').click();

    // Horizon chips should be visible
    await expect(page.getByText('5 – 10 anos')).toBeVisible();
    await expect(page.getByText('> 10 anos')).toBeVisible();

    // The full plan sheet field ("Objetivo financeiro") must NOT appear
    await expect(page.getByText('Objetivo financeiro')).not.toBeVisible();
  });

  test('plano ativo opens the full plan sheet', async ({ page }) => {
    await loginAndReachProfile(page);

    await page.getByText('Plano ativo').click();

    // Full plan sheet has the goal input label
    await expect(page.getByText('Objetivo financeiro')).toBeVisible();
  });
});
