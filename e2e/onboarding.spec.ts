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
    await expect(page).toHaveURL('/auth/horizon');

    // ── 6. Horizon ───────────────────────────────────────────────────────────
    await page.getByRole('button', { name: '10 anos' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL('/auth/risk');

    // ── 7. Risk ──────────────────────────────────────────────────────────────
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
    await page.getByPlaceholder('nome@exemplo.com').fill('e2e@test.portify.app');
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
});
