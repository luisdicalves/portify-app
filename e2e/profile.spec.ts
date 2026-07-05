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

  // ── Horizonte temporal ─────────────────────────────────────────────────────

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

  // ── Plano ativo (PlanEditor) ───────────────────────────────────────────────

  test('plano ativo opens PlanEditor with mode selector and projection card', async ({ page }) => {
    await loginAndReachProfile(page);

    await page.getByText('Plano ativo').click();

    // Mode selector buttons
    await expect(page.getByRole('button', { name: 'Calcular objetivo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Calcular prazo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Calcular montante' })).toBeVisible();

    // Projection card shows "Objetivo estimado" in default mode
    await expect(page.getByText('Objetivo estimado')).toBeVisible();
  });

  test('PlanEditor calc_years mode shows goal input and projected years', async ({ page }) => {
    await loginAndReachProfile(page);
    await page.getByText('Plano ativo').click();

    await page.getByRole('button', { name: 'Calcular prazo' }).click();

    // Goal input should appear
    await expect(page.getByText('Objetivo financeiro (€)')).toBeVisible();

    // Enter a goal amount
    await page.locator('input[inputmode="numeric"]').fill('50000');
    await expect(page.getByText('Prazo estimado')).toBeVisible();
  });

  test('PlanEditor calc_amount mode shows montante necessário', async ({ page }) => {
    await loginAndReachProfile(page);
    await page.getByText('Plano ativo').click();

    await page.getByRole('button', { name: 'Calcular montante' }).click();

    await expect(page.getByText('Objetivo financeiro (€)')).toBeVisible();
    await page.locator('input[inputmode="numeric"]').fill('100000');
    await expect(page.getByText('Montante mensal necessário')).toBeVisible();
  });

  test('PlanEditor confirm closes the sheet', async ({ page }) => {
    await loginAndReachProfile(page);
    await page.getByText('Plano ativo').click();

    await expect(page.getByText('Calcular objetivo')).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('Calcular objetivo')).not.toBeVisible();
  });

  // ── Conhecimento e comportamento ───────────────────────────────────────────

  test('experiência opens SelectList sheet and confirms', async ({ page }) => {
    await loginAndReachProfile(page);

    await page.getByText('Experiência').click();

    // Sheet title
    await expect(page.getByText('Experiência a investir')).toBeVisible();

    // Options from EXPERIENCE_OPTIONS
    await expect(page.getByTestId('select-item').filter({ hasText: 'Iniciante' })).toBeVisible();
    await expect(page.getByTestId('select-item').filter({ hasText: 'Experiente' })).toBeVisible();

    // Select "Experiente"
    await page.getByTestId('select-item').filter({ hasText: 'Experiente' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();

    // Sheet closes
    await expect(page.getByText('Experiência a investir')).not.toBeVisible();
  });

  test('reação a quedas opens sheet with scenario banner', async ({ page }) => {
    await loginAndReachProfile(page);

    await page.getByText('Reação a quedas').click();

    await expect(page.getByText('Reação a uma queda')).toBeVisible();
    // Scenario banner
    await expect(page.getByText(/10\.000€/)).toBeVisible();

    // Options
    await expect(page.getByTestId('select-item').filter({ hasText: 'Vendo tudo' })).toBeVisible();
    await expect(page.getByTestId('select-item').filter({ hasText: 'Compro mais' })).toBeVisible();

    await page.getByTestId('select-item').filter({ hasText: 'Compro mais' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('Reação a uma queda')).not.toBeVisible();
  });

  test('situação financeira opens sheet and confirms', async ({ page }) => {
    await loginAndReachProfile(page);

    await page.getByText('Situação financeira').click();

    await expect(page.getByText('A tua capacidade de poupança atual.')).toBeVisible();
    await expect(page.getByTestId('select-item').filter({ hasText: 'Estável' })).toBeVisible();
    await expect(page.getByTestId('select-item').filter({ hasText: 'Confortável' })).toBeVisible();

    await page.getByTestId('select-item').filter({ hasText: 'Confortável' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('A tua capacidade de poupança atual.')).not.toBeVisible();
  });

  test('acesso ao dinheiro shows warning when critical is selected', async ({ page }) => {
    await loginAndReachProfile(page);

    await page.getByText('Acesso ao dinheiro').click();

    await expect(page.getByText('E se precisares do dinheiro antes do prazo?')).toBeVisible();

    // Select "É crítico"
    await page.getByTestId('select-item').filter({ hasText: 'É crítico' }).click();

    // Warning should appear
    await expect(page.getByText(/considera uma conta poupança/)).toBeVisible();

    // Button label changes
    await expect(page.getByRole('button', { name: 'Confirmar mesmo assim' })).toBeVisible();

    await page.getByRole('button', { name: 'Confirmar mesmo assim' }).click();
    await expect(page.getByText('E se precisares do dinheiro antes do prazo?')).not.toBeVisible();
  });

  test('acesso ao dinheiro shows regular confirm for non-critical options', async ({ page }) => {
    await loginAndReachProfile(page);

    await page.getByText('Acesso ao dinheiro').click();
    await page.getByTestId('select-item').filter({ hasText: 'Improvável' }).click();

    await expect(page.getByRole('button', { name: 'Confirmar', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar mesmo assim' })).not.toBeVisible();
  });
});
