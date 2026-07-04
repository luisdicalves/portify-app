import { test, expect } from '@playwright/test';
import { mockSupabase } from './helpers/supabase-mock';

async function pressPin(page: import('@playwright/test').Page, digits: string) {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).first().click();
  }
}

/**
 * Clicks the first option in a SelectList.
 * SelectList renders divs (not buttons) each containing a span.icf icon.
 * This distinguishes them from navigation <button> elements.
 */
async function selectFirst(page: import('@playwright/test').Page) {
  await page.locator('div:has(span.icf)').first().click();
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
    await expect(page).toHaveURL('/auth/assets');

    // ── 3. Assets ────────────────────────────────────────────────────────────
    await page.getByText('Ações').click(); // select at least one asset to enable the button
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL('/auth/experience');

    // ── 4. Experience ────────────────────────────────────────────────────────
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

    // ── 9. Financial status ───────────────────────────────────────────────────
    await selectFirst(page);
    await page.getByRole('button', { name: 'Continuar' }).click();

    // ── 10. Liquidity need ────────────────────────────────────────────────────
    await selectFirst(page);
    await page.getByRole('button', { name: /Continuar/ }).click();

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
});
