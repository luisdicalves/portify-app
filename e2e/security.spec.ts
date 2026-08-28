import { test, expect } from '@playwright/test';
import { mockSupabase } from './helpers/supabase-mock';

async function pressPin(page: import('@playwright/test').Page, digits: string) {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).first().click();
  }
}

async function seedSession(page: import('@playwright/test').Page) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('o_teu_username').fill('teste_e2e');
  await page.getByPlaceholder('••••••••').fill('Teste1234!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/auth/pin');
  await pressPin(page, '123456');
  await expect(page).toHaveURL('/dashboard', { timeout: 5000 });
}

test.describe('Security page — Switch (migrated from local Toggle)', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await seedSession(page);
    await page.goto('/profile/security');
  });

  test('Face ID and 2FA render as accessible switches with the expected default state', async ({ page }) => {
    const faceId = page.getByRole('switch', { name: 'Face ID' });
    const twoFa = page.getByRole('switch', { name: 'Autenticação de dois fatores' });

    await expect(faceId).toBeVisible();
    await expect(faceId).toHaveAttribute('aria-checked', 'true');

    await expect(twoFa).toBeVisible();
    await expect(twoFa).toHaveAttribute('aria-checked', 'false');
  });

  test('clicking the Face ID switch toggles its checked state', async ({ page }) => {
    const faceId = page.getByRole('switch', { name: 'Face ID' });
    await expect(faceId).toHaveAttribute('aria-checked', 'true');

    await faceId.click();
    await expect(faceId).toHaveAttribute('aria-checked', 'false');

    await faceId.click();
    await expect(faceId).toHaveAttribute('aria-checked', 'true');
  });

  test('clicking the two-factor switch toggles its checked state independently of Face ID', async ({ page }) => {
    const faceId = page.getByRole('switch', { name: 'Face ID' });
    const twoFa = page.getByRole('switch', { name: 'Autenticação de dois fatores' });

    await twoFa.click();
    await expect(twoFa).toHaveAttribute('aria-checked', 'true');
    await expect(faceId).toHaveAttribute('aria-checked', 'true');
  });

  test('switches are keyboard-focusable native buttons', async ({ page }) => {
    const faceId = page.getByRole('switch', { name: 'Face ID' });
    await faceId.focus();
    await expect(faceId).toBeFocused();
    await expect(faceId).toHaveJSProperty('tagName', 'BUTTON');
  });
});
