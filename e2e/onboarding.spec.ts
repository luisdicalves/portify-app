import { test, expect } from '@playwright/test';
import { mockSupabase } from './helpers/supabase-mock';

async function pressPin(page: import('@playwright/test').Page, digits: string) {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).first().click();
  }
}

async function selectFirst(page: import('@playwright/test').Page) {
  await page.locator('[data-testid="select-item"]').first().click();
}

async function fillRegisterForm(page: import('@playwright/test').Page) {
  await page.getByPlaceholder('Ricardo').fill('Teste');
  await page.getByPlaceholder('Ferreira').fill('E2E');
  await page.getByPlaceholder('DD / MM / AAAA').fill('01011990');
  await page.getByPlaceholder('o_teu_username').fill('teste_e2e');
  await page.getByPlaceholder('nome@exemplo.com').fill('e2e@test.portify.app');
  await page.getByPlaceholder('••••••••').fill('Teste1234!');
  await page.waitForTimeout(600);
  await page.locator('[data-testid="terms-checkbox"]').click();
}

test.describe('Onboarding flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
  });

  test('register → PIN set → onboarding steps → dashboard', async ({ page }) => {
    // ── 1. Register ──────────────────────────────────────────────────────────
    await page.goto('/auth/register');

    await page.getByPlaceholder('Ricardo').fill('Teste');
    await page.getByPlaceholder('Ferreira').fill('E2E');
    // DOB: fill raw digits; DatePicker's handleTextChange strips non-digits
    await page.getByPlaceholder('DD / MM / AAAA').fill('01011990');
    await page.getByPlaceholder('o_teu_username').fill('teste_e2e');
    await page.getByPlaceholder('nome@exemplo.com').fill('e2e@test.portify.app');
    await page.getByPlaceholder('••••••••').fill('Teste1234!');
    // Wait for username debounce (400 ms) + RPC round-trip to clear checkingUsername
    await page.waitForTimeout(600);
    // Click the terms div — use the checkbox icon as an anchor to avoid ambiguous text matches
    await page.locator('[data-testid="terms-checkbox"]').click();
    await page.getByRole('button', { name: 'Criar conta' }).click();

    await expect(page).toHaveURL('/auth/pin-set');

    // ── 2. Set PIN ───────────────────────────────────────────────────────────
    await pressPin(page, '123456');
    await pressPin(page, '123456');
    await expect(page).toHaveURL('/auth/experience');

    // ── 3. Experience ────────────────────────────────────────────────────────
    await selectFirst(page);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL('/auth/objective');

    // ── 5. Objective ─────────────────────────────────────────────────────────
    await selectFirst(page);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL('/auth/risk');

    // ── 6. Risk ──────────────────────────────────────────────────────────────
    await selectFirst(page);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL('/auth/reaction');

    // ── 8. Market reaction ───────────────────────────────────────────────────
    await selectFirst(page);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL('/auth/financial');

    // ── 9. Financial status ───────────────────────────────────────────────────
    await selectFirst(page);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL('/auth/liquidity');

    // ── 10. Liquidity need ────────────────────────────────────────────────────
    await selectFirst(page);
    await page.getByRole('button', { name: /Continuar/ }).click();
    await expect(page).toHaveURL('/auth/sectors');

    // ── 11. Sectors ───────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Tecnologia' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL('/auth/plan-ask');

    // ── 12. Plan ask → plan-set ───────────────────────────────────────────────
    await page.getByRole('button', { name: /Sim, quero/ }).click();
    await expect(page).toHaveURL('/auth/plan-set');

    await page.getByRole('button', { name: 'Ver resumo' }).click();
    await expect(page).toHaveURL('/auth/summary');

    // ── 13. Summary → dashboard ───────────────────────────────────────────────
    await page.getByRole('button', { name: 'Finalizar e entrar' }).click();
    await expect(page).toHaveURL('/dashboard', { timeout: 5000 });
  });

  test('summary page saves plan to DB and redirects to dashboard', async ({ page }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://supabase.test';
    let planUpsertCalled = false;

    // Intercept investment_plans: track upsert (POST) and return a plan on GET so the
    // PIN page can confirm onboarding is complete and redirect to /dashboard
    await page.route(`${supabaseUrl}/rest/v1/investment_plans**`, route => {
      if (route.request().method() === 'POST') planUpsertCalled = true;
      const body = route.request().method() === 'GET'
        ? JSON.stringify([{ id: 'plan-1', amount: 250, frequency: 'monthly', horizon_years: 10, goal_amount: 50000 }])
        : JSON.stringify([]);
      route.fulfill({ status: 200, contentType: 'application/json', body });
    });

    // Navigate directly to summary with plan state in sessionStorage
    await page.goto('/auth/login');
    await page.getByPlaceholder('o_teu_username').fill('teste_e2e');
    await page.getByPlaceholder('••••••••').fill('Teste1234!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL('/auth/pin');
    for (const d of '123456') await page.getByRole('button', { name: d, exact: true }).first().click();
    await expect(page).toHaveURL('/dashboard', { timeout: 5000 });

    // Seed sessionStorage with a valid onboarding plan and profile, then go to summary
    await page.evaluate(() => {
      sessionStorage.setItem('onb_plan', JSON.stringify({ amount: 100, frequency: 'monthly', horizon_years: 10, goal_amount: 50000, preferred_asset_classes: ['stock', 'etf'] }));
      sessionStorage.setItem('onb_profile', JSON.stringify({ risk_profile: 'moderate', investment_goal: 'wealth_growth', experience_level: 'beginner', market_reaction: 'hold', financial_status: 'stable', liquidity_need: 'unlikely' }));
    });

    await page.goto('/auth/summary');
    await expect(page.getByRole('button', { name: 'Finalizar e entrar' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Finalizar e entrar' }).click();

    await expect(page).toHaveURL('/dashboard', { timeout: 5000 });
    expect(planUpsertCalled).toBe(true);
  });

  test('navigating back restores previously selected option', async ({ page }) => {
    await mockSupabase(page);

    // Go to experience, pick the second option
    await page.goto('/auth/experience');
    const secondOption = page.locator('[data-testid="select-item"]').nth(1);
    await secondOption.click();
    const selectedText = await secondOption.textContent();

    // Advance to objective
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL('/auth/objective');

    // Go back to experience
    await page.goBack();
    await expect(page).toHaveURL('/auth/experience');

    // The previously selected option should still be highlighted
    const restored = page.locator('[data-testid="select-item"]').nth(1);
    await expect(restored).toHaveAttribute('data-selected', 'true');
    expect(await restored.textContent()).toBe(selectedText);
  });

  test('navigating back restores sectors selection', async ({ page }) => {
    await mockSupabase(page);

    await page.goto('/auth/sectors');

    // Select two sectors
    await page.getByRole('button', { name: 'Tecnologia' }).click();
    await page.getByRole('button', { name: 'Saúde' }).click();

    // Advance to plan-ask
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL('/auth/plan-ask');

    // Go back to sectors
    await page.goBack();
    await expect(page).toHaveURL('/auth/sectors');

    // Both sectors should still be selected (active background colour, not the surface-low default)
    const tech  = page.getByRole('button', { name: 'Tecnologia' });
    const saude = page.getByRole('button', { name: 'Saúde' });
    // When selected, the button has white text; when unselected it has on-surface text
    await expect(tech).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(saude).toHaveCSS('color', 'rgb(255, 255, 255)');
  });
});

test.describe('Register page — SCR-011 regression tests', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
  });

  test('password field is cleared after a failed submission', async ({ page }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://supabase.test';
    await page.route(`${supabaseUrl}/auth/v1/signup`, route =>
      route.fulfill({
        status: 422, contentType: 'application/json',
        body: JSON.stringify({ error_code: 'user_already_exists', msg: 'User already registered' }),
      }),
    );

    await page.goto('/auth/register');
    await fillRegisterForm(page);
    await page.getByRole('button', { name: 'Criar conta' }).click();

    await expect(page.getByText(/Já existe uma conta/i)).toBeVisible();
    await expect(page.getByPlaceholder('••••••••')).toHaveValue('');
  });

  test('back navigation with unsaved changes shows a discard confirmation', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByText('Criar conta').click();
    await expect(page).toHaveURL('/auth/register');

    await page.getByPlaceholder('Ricardo').fill('Teste');

    await page.locator('text=arrow_back_ios_new').click();
    await expect(page.getByText('Descartar alterações?')).toBeVisible();

    // Cancelling keeps the user on the page with the field intact.
    await page.getByRole('button', { name: 'Continuar a editar' }).click();
    await expect(page.getByPlaceholder('Ricardo')).toHaveValue('Teste');

    // Confirming discards and actually navigates back.
    await page.locator('text=arrow_back_ios_new').click();
    await page.getByRole('button', { name: 'Descartar' }).click();
    await expect(page).toHaveURL('/auth/login');
  });

  test('back navigation with no changes navigates immediately, no dialog', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByText('Criar conta').click();
    await expect(page).toHaveURL('/auth/register');

    await page.locator('text=arrow_back_ios_new').click();
    await expect(page.getByText('Descartar alterações?')).not.toBeVisible();
    await expect(page).toHaveURL('/auth/login');
  });
});
