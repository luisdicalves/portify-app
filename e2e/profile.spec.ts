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

  test('horizonte temporal opens stepper sheet, not the full plan sheet', async ({ page }) => {
    await loginAndReachProfile(page);

    await page.getByText('Horizonte temporal').click();

    // Stepper sheet: shortcut buttons and +/− controls should be visible
    await expect(page.getByRole('button', { name: '10', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '30', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '−', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '+', exact: true })).toBeVisible();

    // The full plan sheet field ("Objetivo financeiro") must NOT appear
    await expect(page.getByText('Objetivo financeiro')).not.toBeVisible();
  });

  test('horizonte temporal stepper updates value and confirms', async ({ page }) => {
    await loginAndReachProfile(page);

    await page.getByText('Horizonte temporal').click();

    // Click shortcut "20"
    await page.getByRole('button', { name: '20', exact: true }).click();
    await expect(page.getByText('20', { exact: true })).toBeVisible();

    // Use − to go to 19
    await page.getByRole('button', { name: '−', exact: true }).click();
    await expect(page.getByText('19')).toBeVisible();

    // Confirm closes the sheet
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('Objetivo financeiro')).not.toBeVisible();
    await expect(page.getByRole('button', { name: '−', exact: true })).not.toBeVisible();
  });

  test('plano ativo opens the full plan sheet', async ({ page }) => {
    await loginAndReachProfile(page);

    await page.getByText('Plano ativo').click();

    // Full plan sheet has the goal input label
    await expect(page.getByText('Objetivo financeiro')).toBeVisible();
  });
});
