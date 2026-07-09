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
  await page.getByPlaceholder('o_teu_username').fill('teste_e2e');
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
    await expect(warning.locator('text=warning')).toBeVisible();
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

test.describe('Notifications — PIN entry', () => {
  test('pin: wrong PIN renders a styled error banner, not plain text', async ({ page }) => {
    await mockSupabase(page);
    const sb = /https?:\/\/[^/]*supabase\.(co|test|io)/;
    await page.route(new RegExp(sb.source + '/rest/v1/rpc/verify_pin'), route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: 'false' }),
    );

    await page.goto('/auth/pin');
    await pressPin(page, '000000');

    const banner = page.locator('[data-testid="save-error"]');
    await expect(banner).toBeVisible();
    await expect(banner.locator('text=' + ERROR_ICON)).toBeVisible();
    await expect(banner).toHaveCSS('border-style', 'solid');
  });
});

test.describe('Notifications — profile pages', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
  });

  test('personal data: email update failure renders styled error banner', async ({ page }) => {
    await seedSession(page);

    const sb = /https?:\/\/[^/]*supabase\.(co|test|io)/;
    await page.route(new RegExp(sb.source + '/auth/v1/user'), route => {
      if (route.request().method() === 'PUT') {
        return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ message: 'forced error' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'aaaaaaaa-0000-0000-0000-000000000001', email: 'e2e@test.portify.app', aud: 'authenticated', role: 'authenticated' }) });
    });

    await page.goto('/profile/personal');
    await page.waitForLoadState('networkidle');
    await page.locator('input[type="email"]').fill('novo-email@test.com');
    await page.getByRole('button', { name: 'Guardar' }).click();

    const banner = page.locator('[data-testid="save-error"]');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner.locator('text=' + ERROR_ICON)).toBeVisible();
    await expect(banner).toHaveCSS('border-style', 'solid');
  });

  test('personal data: email update success renders styled success banner', async ({ page }) => {
    await seedSession(page);

    const sb = /https?:\/\/[^/]*supabase\.(co|test|io)/;
    await page.route(new RegExp(sb.source + '/auth/v1/user'), route => {
      if (route.request().method() === 'PUT') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'aaaaaaaa-0000-0000-0000-000000000001', email: 'novo-email@test.com', aud: 'authenticated', role: 'authenticated' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'aaaaaaaa-0000-0000-0000-000000000001', email: 'e2e@test.portify.app', aud: 'authenticated', role: 'authenticated' }) });
    });

    await page.goto('/profile/personal');
    await page.waitForLoadState('networkidle');
    await page.locator('input[type="email"]').fill('novo-email@test.com');
    await page.getByRole('button', { name: 'Guardar' }).click();

    const banner = page.locator('[data-testid="save-success"]');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner.locator('text=check_circle')).toBeVisible();
    await expect(banner).toHaveCSS('border-style', 'solid');
  });

  test('settings: import without a file keeps the analyze button disabled', async ({ page }) => {
    // The two-phase import flow (analyze -> preview -> confirm) disables
    // "Analisar ficheiro" until a file is chosen, instead of the old
    // single-step flow's "click and get told why" error banner.
    await page.goto('/profile/settings');
    await page.getByText('Importar Portfólio').click();

    await expect(page.getByRole('button', { name: 'Analisar ficheiro', exact: true })).toBeDisabled();
  });

  test('settings: import audit log failure renders styled error banner and saves nothing', async ({ page }) => {
    // analyzeImport() looks up the user's existing transactions before it can
    // build a preview, so this needs an authenticated session — unlike the
    // "no file" test above, which only checks a disabled-button state.
    const sb = /https?:\/\/[^/]*supabase\.(co|test|io)/;
    await page.route(new RegExp(sb.source + '/rest/v1/import_audit_logs'), route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'relation "import_audit_logs" does not exist' }) }),
    );
    await seedSession(page);

    await page.goto('/profile/settings');
    await page.getByText('Importar Portfólio').click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test-portfolio.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('ticker,units,avg_price\nAAPL,10,150.5'),
    });
    await page.getByRole('button', { name: 'Analisar ficheiro', exact: true }).click();
    await expect(page.getByText('Ficheiro analisado')).toBeVisible();

    await page.getByRole('button', { name: 'Importar', exact: true }).click();

    const banner = page.locator('[data-testid="save-error"]');
    await expect(banner).toBeVisible();
    await expect(banner.locator('text=' + ERROR_ICON)).toBeVisible();
    await expect(banner).toHaveCSS('border-style', 'solid');

    // The modal must still be open on the preview step — a failed audit log
    // means the import was aborted, not silently treated as done.
    await expect(page.getByText('Ficheiro analisado')).toBeVisible();
  });

  test('settings: successful import shows a completion toast referencing the audit log id', async ({ page }) => {
    const sb = /https?:\/\/[^/]*supabase\.(co|test|io)/;
    const fakeAuditLogId = 'aaaaaaaa-1111-0000-0000-000000000099';
    await page.route(new RegExp(sb.source + '/rest/v1/import_audit_logs'), route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: fakeAuditLogId, status: 'pending' }) }),
    );
    await seedSession(page);

    await page.goto('/profile/settings');
    await page.getByText('Importar Portfólio').click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test-portfolio.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('ticker,units,avg_price\nAAPL,10,150.5'),
    });
    await page.getByRole('button', { name: 'Analisar ficheiro', exact: true }).click();
    await expect(page.getByText('Ficheiro analisado')).toBeVisible();

    await page.getByRole('button', { name: 'Importar', exact: true }).click();

    await expect(page.getByText('Importação concluída.')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(fakeAuditLogId.slice(0, 8))).toBeVisible();
  });

  test('settings: account deletion failure renders styled error banner', async ({ page }) => {
    await page.route('**/api/account/delete', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));

    await page.goto('/profile/settings');
    await page.getByText('Eliminar conta').click();
    await page.getByPlaceholder('Escreve ELIMINAR').fill('ELIMINAR');
    await page.getByRole('button', { name: 'Eliminar conta permanentemente' }).click();

    const banner = page.locator('[data-testid="save-error"]');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner.locator('text=' + ERROR_ICON)).toBeVisible();
    await expect(banner).toHaveCSS('border-style', 'solid');
  });
});

test.describe('Notifications — summary page', () => {
  test('shows a boxed conflict warning, a boxed info note, and a styled save-error banner', async ({ page }) => {
    await mockSupabase(page);
    const sb = /https?:\/\/[^/]*supabase\.(co|test|io)/;

    // Aggressive risk profile + "sell everything" reaction triggers a behavioral conflict warning.
    // Summary page uses .single(), which expects a bare object body, not an array.
    await page.route(new RegExp(sb.source + '/rest/v1/profiles'), route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'aaaaaaaa-0000-0000-0000-000000000001',
            first_name: 'Teste', last_name: 'E2E', user_handle: 'teste_e2e',
            risk_profile: 'aggressive', investment_goal: 'wealth_growth',
            experience_level: 'beginner', market_reaction: 'sell_all',
            financial_status: 'stable', liquidity_need: 'unlikely',
            preferred_sectors: ['tech'],
          }),
        });
      }
      return route.fulfill({ status: 204 });
    });

    // Force the final save (POST) to fail so the save-error banner shows too, but keep
    // GET returning an existing plan so PIN verification lands on /dashboard, not onboarding.
    await page.route(new RegExp(sb.source + '/rest/v1/investment_plans'), route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ message: 'forced error' }) });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'plan-1', amount: 250, frequency: 'monthly', horizon_years: 10, goal_amount: 50000 }]),
      });
    });

    await page.goto('/auth/login');
    await page.getByPlaceholder('o_teu_username').fill('teste_e2e');
    await page.getByPlaceholder('••••••••').fill('Teste1234!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL('/auth/pin');
    await pressPin(page, '123456');
    await expect(page).toHaveURL('/dashboard', { timeout: 5000 });

    await page.evaluate(() => {
      sessionStorage.setItem('onb_plan', JSON.stringify({ amount: 100, frequency: 'monthly', horizon_years: 10, goal_amount: 50000, preferred_asset_classes: ['stock', 'etf'] }));
    });
    await page.goto('/auth/summary');

    // Conflict warning is boxed (loss-container + border), not plain text
    const conflictBox = page.locator('[data-testid="conflict-warning"]');
    await expect(conflictBox).toBeVisible();
    await expect(conflictBox.getByText(/Disseste ser agressivo/)).toBeVisible();
    await expect(conflictBox).toHaveCSS('border-style', 'solid');

    // The "data only saved on Finalizar" note is boxed, not floating icon+text
    const noteBox = page.locator('[data-testid="save-note"]');
    await expect(noteBox).toBeVisible();
    await expect(noteBox).toHaveCSS('border-style', 'solid');

    await page.getByRole('button', { name: 'Finalizar e entrar' }).click();
    const banner = page.locator('[data-testid="save-error"]');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner.locator('text=' + ERROR_ICON)).toBeVisible();
    await expect(banner).toHaveCSS('border-style', 'solid');
  });
});
