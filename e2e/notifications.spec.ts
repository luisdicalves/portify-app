import { test, expect } from '@playwright/test';
import { mockSupabase } from './helpers/supabase-mock';

const ERROR_ICON = 'error';

async function pressPin(page: import('@playwright/test').Page, digits: string) {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).first().click();
  }
}

/** Log in through the mock so getSessionUserId() returns a valid user ID. */
async function seedSession(page: import('@playwright/test').Page) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('nome@exemplo.com').fill('e2e@test.portify.app');
  await page.getByPlaceholder('••••••••').fill('Teste1234!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/auth/pin');
  await pressPin(page, '123456');
  await expect(page).toHaveURL('/dashboard', { timeout: 5000 });
}

/** Mount the standard Supabase mock, seed a session, then override profiles PATCH to error. */
async function setupWithSaveError(page: import('@playwright/test').Page) {
  await mockSupabase(page);

  // Override profiles PATCH to simulate a DB error (must come after mockSupabase — LIFO wins)
  const sb = /https?:\/\/[^/]*supabase\.(co|test|io)/;
  await page.route(new RegExp(sb.source + '/rest/v1/profiles'), route => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'forced error' }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await seedSession(page);
}

test.describe('Notifications — consistent error banner style', () => {
  for (const { url, pageName } of [
    { url: '/auth/experience', pageName: 'experience' },
    { url: '/auth/objective',  pageName: 'objective'  },
    { url: '/auth/risk',       pageName: 'risk'       },
    { url: '/auth/reaction',   pageName: 'reaction'   },
    { url: '/auth/financial',  pageName: 'financial'  },
    { url: '/auth/liquidity',  pageName: 'liquidity'  },
  ]) {
    test(`${pageName}: save error renders styled banner with icon`, async ({ page }) => {
      await setupWithSaveError(page);
      await page.goto(url);

      await page.locator('[data-testid="select-item"]').first().click();
      await page.getByRole('button', { name: 'Continuar' }).click();

      const banner = page.locator('[data-testid="save-error"]');
      await expect(banner).toBeVisible({ timeout: 5000 });
      await expect(banner.locator('text=' + ERROR_ICON)).toBeVisible();
      await expect(banner).toHaveCSS('border-style', 'solid');
    });
  }

  test('sectors: save error renders styled banner with icon', async ({ page }) => {
    await setupWithSaveError(page);
    await page.goto('/auth/sectors');
    await page.getByRole('button', { name: 'Tecnologia' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();

    const banner = page.locator('[data-testid="save-error"]');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner.locator('text=' + ERROR_ICON)).toBeVisible();
    await expect(banner).toHaveCSS('border-style', 'solid');
  });
});

test.describe('Notifications — info and warning banners', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
  });

  test('financial: privacy note renders as a card with lock icon', async ({ page }) => {
    await page.goto('/auth/financial');
    const note = page.locator('[data-testid="privacy-note"]');
    await expect(note).toBeVisible();
    await expect(note.locator('text=lock')).toBeVisible();
    await expect(note).toHaveCSS('border-style', 'solid');
  });

  test('liquidity: critical warning banner appears when "É crítico" is selected', async ({ page }) => {
    await page.goto('/auth/liquidity');
    await page.locator('[data-testid="select-item"]').first().click();

    const warning = page.locator('[data-testid="critical-warning"]');
    await expect(warning).toBeVisible();
    await expect(warning.locator('text=info')).toBeVisible();
    await expect(warning).toHaveCSS('border-style', 'solid');
  });

  test('liquidity: critical warning is hidden when a non-critical option is selected', async ({ page }) => {
    await page.goto('/auth/liquidity');
    await page.locator('[data-testid="select-item"]').last().click();
    await expect(page.locator('[data-testid="critical-warning"]')).not.toBeVisible();
  });

  test('reaction: scenario banner is always visible', async ({ page }) => {
    await page.goto('/auth/reaction');
    const banner = page.locator('[data-testid="scenario-banner"]');
    await expect(banner).toBeVisible();
    await expect(banner.locator('text=trending_down')).toBeVisible();
    await expect(banner).toHaveCSS('border-style', 'solid');
  });
});
