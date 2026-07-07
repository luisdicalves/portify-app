import { test, expect } from '@playwright/test';
import { mockSupabase } from './helpers/supabase-mock';

async function pressPin(page: import('@playwright/test').Page, digits: string) {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).first().click();
  }
}

async function loginAndReachProfile(page: import('@playwright/test').Page) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('o_teu_username').fill('teste_e2e');
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

  test('PlanEditor allocation updates immediately when toggling asset class', async ({ page }) => {
    await loginAndReachProfile(page);
    await page.getByText('Plano ativo').click();

    // All 3 classes selected by default — 3 allocation columns visible
    await expect(page.getByTestId('alloc-item')).toHaveCount(3);

    // Deselect Bond ETFs — allocation drops to 2 columns immediately
    await page.getByText('Bond ETFs').first().click();
    await expect(page.getByTestId('alloc-item')).toHaveCount(2);

    // Re-select Bond ETFs — 3 columns return
    await page.getByText('Bond ETFs').first().click();
    await expect(page.getByTestId('alloc-item')).toHaveCount(3);
  });

  test('PlanEditor allocation stays reactive when only one class remains', async ({ page }) => {
    await loginAndReachProfile(page);
    await page.getByText('Plano ativo').click();

    // Deselect ETFs → 2 columns
    await page.getByText('ETFs', { exact: true }).first().click();
    await expect(page.getByTestId('alloc-item')).toHaveCount(2);

    // Deselect Bond ETFs → 1 column
    await page.getByText('Bond ETFs').first().click();
    await expect(page.getByTestId('alloc-item')).toHaveCount(1);

    // Try to deselect last class — must stay at 1 (protection against empty selection)
    await page.getByText('Ações', { exact: true }).first().click();
    await expect(page.getByTestId('alloc-item')).toHaveCount(1);
  });

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

test.describe('Profile page — plan projection card', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);

    // The base mock's /rest/v1/profiles always returns an array body, which is fine for
    // most tests but means .single() (used by useProfileData) resolves to an array
    // instead of an object — undermining risk_profile/investment_goal reads that
    // calcPlan() needs to produce a projection. Mirror real PostgREST content
    // negotiation here (Accept: application/vnd.pgrst.object+json -> bare object) so
    // this describe block alone can exercise the projection card end-to-end.
    const sb = /https?:\/\/[^/]*supabase\.(co|test|io)/;
    await page.route(new RegExp(sb.source + '/rest/v1/profiles'), route => {
      if (route.request().method() !== 'GET') return route.fulfill({ status: 204 });
      const wantsSingle = (route.request().headers()['accept'] ?? '').includes('pgrst.object');
      const profileRow = {
        id: 'aaaaaaaa-0000-0000-0000-000000000001',
        first_name: 'Teste', last_name: 'E2E', user_handle: 'teste_e2e',
        risk_profile: 'moderate', investment_goal: 'wealth_growth',
        experience_level: 'beginner', market_reaction: 'hold',
        financial_status: 'stable', liquidity_need: 'unlikely',
        preferred_sectors: ['tech'], investor_since: 2024,
      };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wantsSingle ? profileRow : [profileRow]) });
    });
  });

  test('shows the estimated goal range on the plan card without opening the sheet', async ({ page }) => {
    await loginAndReachProfile(page);

    // Visible directly on the page — no click on "Plano ativo" needed
    await expect(page.getByText('Objetivo estimado')).toBeVisible();
    await expect(page.getByText(/250\s€\/mensal\s·\s10\sanos/)).toBeVisible();
  });
});

test.describe('Profile page — live risk score and allocation', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);

    // Same content-negotiation-aware override as the projection-card describe block above —
    // needed so calcPlan() actually receives a real profile object.
    const sb = /https?:\/\/[^/]*supabase\.(co|test|io)/;
    await page.route(new RegExp(sb.source + '/rest/v1/profiles'), route => {
      if (route.request().method() !== 'GET') return route.fulfill({ status: 204 });
      const wantsSingle = (route.request().headers()['accept'] ?? '').includes('pgrst.object');
      const profileRow = {
        id: 'aaaaaaaa-0000-0000-0000-000000000001',
        first_name: 'Teste', last_name: 'E2E', user_handle: 'teste_e2e',
        risk_profile: 'moderate', investment_goal: 'wealth_growth',
        experience_level: 'beginner', market_reaction: 'hold',
        financial_status: 'stable', liquidity_need: 'unlikely',
        preferred_sectors: ['tech'], investor_since: 2024,
      };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wantsSingle ? profileRow : [profileRow]) });
    });
  });

  test('changing risk profile updates the risk score immediately, without a reload', async ({ page }) => {
    await loginAndReachProfile(page);

    const scoreLocator = page.locator('text=/^\\d+\\/100$/');
    const scoreBefore = await scoreLocator.textContent();

    await page.getByText('Perfil de risco').first().click();
    await page.getByTestId('select-item').filter({ hasText: 'Muito agressivo' }).click();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();

    await expect(scoreLocator).not.toHaveText(scoreBefore ?? '');
  });

  test('deselecting an asset class updates the allocation immediately and persists it', async ({ page }) => {
    const sb = /https?:\/\/[^/]*supabase\.(co|test|io)/;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let upsertBody: any = null;
    await page.route(new RegExp(sb.source + '/rest/v1/investment_plans'), route => {
      if (route.request().method() === 'POST') {
        upsertBody = route.request().postDataJSON();
        return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      }
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'plan-1', amount: 250, frequency: 'monthly', horizon_years: 10, goal_amount: 50000, preferred_asset_classes: ['stock', 'etf', 'bond_etf'] }]),
      });
    });

    await loginAndReachProfile(page);

    // All 3 classes included initially — "Obrig." (bond_etf) shows a non-zero share
    const obrigPct = page.getByText('Obrig.', { exact: true }).locator('..').locator('div').first();
    await expect(obrigPct).not.toHaveText('0%');

    await page.getByText('Plano ativo').click();
    await page.getByText('Bond ETFs').first().click();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();

    // Sheet closes and the underlying page's allocation box reflects the exclusion immediately
    await expect(page.getByText('Podes alterar estes valores em qualquer altura.')).not.toBeVisible();
    await expect(obrigPct).toHaveText('0%');

    // ...and the exclusion was actually persisted, not just held in memory
    expect(upsertBody?.preferred_asset_classes).toEqual(['stock', 'etf']);
  });
});
