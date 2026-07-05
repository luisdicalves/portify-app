import { test, expect } from '@playwright/test';
import { mockSupabase } from './helpers/supabase-mock';

test.describe('Plan-set page header', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
  });

  test('shows large title and subtitle without step counter or progress bar', async ({ page }) => {
    await page.goto('/auth/plan-set');

    // Large title present
    await expect(page.getByText('Define o teu plano')).toBeVisible();

    // Subtitle present
    await expect(page.getByText('Podes alterar estes valores a qualquer momento.')).toBeVisible();

    // No step counter (e.g. "Passo 1/7") should appear
    await expect(page.getByText(/Passo \d+\/\d+/)).not.toBeVisible();

    // Back arrow present (same icon as plan-ask)
    await expect(page.locator('text=arrow_back_ios_new')).toBeVisible();
  });

  test('back arrow navigates back', async ({ page }) => {
    await page.goto('/auth/plan-ask');
    await page.getByRole('button', { name: /Sim, quero/ }).click();
    await expect(page).toHaveURL('/auth/plan-set');

    await page.locator('text=arrow_back_ios_new').click();
    await expect(page).toHaveURL('/auth/plan-ask');
  });

  test('header matches plan-ask visual style (no progress segments)', async ({ page }) => {
    await page.goto('/auth/plan-set');

    // Progress bar segments (span elements used in StepHeader) should NOT be present
    // StepHeader renders N spans for the progress bar; plan-set should have none of those
    const progressSegments = page.locator('span[style*="border-radius: var(--radius-full)"][style*="height: 5px"]');
    await expect(progressSegments).toHaveCount(0);
  });
});
