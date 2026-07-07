import { test, expect } from '@playwright/test';
import { mockSupabase } from './helpers/supabase-mock';

test.describe('Plan editor periodicity', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/auth/plan-set');
  });

  test('offers weekly, biweekly, monthly, quarterly, semiannual and annual options', async ({ page }) => {
    for (const label of ['Semanal', 'Quinzenal', 'Mensal', 'Trimestral', 'Semestral', 'Anual']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('changing periodicity changes the estimated goal amount', async ({ page }) => {
    // Default is Mensal — capture the estimated goal range.
    const projection = page.getByText(/€ – .*€|€–.*€/).first();
    await expect(page.getByText('Mensal', { exact: true })).toBeVisible();
    const monthlyText = await projection.textContent();

    await page.getByText('Anual', { exact: true }).click();
    await expect(projection).not.toHaveText(monthlyText ?? '');

    const annualText = await projection.textContent();
    expect(annualText).not.toEqual(monthlyText);
  });

  test('same contribution compounds to a smaller goal when moving from monthly to annual', async ({ page }) => {
    // 250€ selected by default; the projection line reads "250 €/mensal · 10 anos · ..." (NBSP between amount and €)
    await expect(page.getByText(/250\s€\/mensal/)).toBeVisible();

    const goalHeading = page.locator('div', { hasText: 'Objetivo estimado' }).locator('..').locator('div').nth(1);
    const monthlyGoal = await goalHeading.textContent();

    await page.getByText('Anual', { exact: true }).click();
    await expect(page.getByText(/250\s€\/anual/)).toBeVisible();

    const annualGoal = await goalHeading.textContent();
    expect(annualGoal).not.toEqual(monthlyGoal);
  });
});
