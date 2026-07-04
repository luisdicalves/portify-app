import type { Page } from '@playwright/test';

const FAKE_USER = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  email: 'e2e@test.portify.app',
  aud: 'authenticated',
  role: 'authenticated',
};

const FAKE_SESSION = {
  access_token:  'fake-access-token',
  refresh_token: 'fake-refresh-token',
  expires_in:    3600,
  token_type:    'bearer',
  user:          FAKE_USER,
};

const FAKE_PROFILE = {
  id:                FAKE_USER.id,
  first_name:        'Teste',
  last_name:         'E2E',
  user_handle:       'teste_e2e',
  risk_profile:      'moderate',
  investment_goal:   'wealth_growth',
  experience_level:  'beginner',
  market_reaction:   'hold',
  financial_status:  'stable',
  liquidity_need:    'unlikely',
  preferred_sectors: ['tech'],
  investor_since:    2024,
};

/** Intercepts all Supabase API calls so tests don't hit the real backend. */
export async function mockSupabase(page: Page) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://supabase.test';

  // ── Auth ───────────────────────────────────────────────────────────────────

  await page.route(`${supabaseUrl}/auth/v1/signup`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_SESSION) }),
  );

  await page.route(`${supabaseUrl}/auth/v1/token**`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_SESSION) }),
  );

  await page.route(`${supabaseUrl}/auth/v1/logout**`, route =>
    route.fulfill({ status: 204 }),
  );

  await page.route(`${supabaseUrl}/auth/v1/user`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_USER) }),
  );

  // ── REST (profiles, investment_plans, holdings, transactions) ─────────────

  await page.route(`${supabaseUrl}/rest/v1/profiles**`, route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([FAKE_PROFILE]),
      });
    }
    return route.fulfill({ status: 204 });
  });

  await page.route(`${supabaseUrl}/rest/v1/investment_plans**`, route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ amount: 250, frequency: 'monthly', horizon_years: 10, goal_amount: 50000 }]),
      });
    }
    return route.fulfill({ status: 204 });
  });

  await page.route(`${supabaseUrl}/rest/v1/holdings**`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );

  await page.route(`${supabaseUrl}/rest/v1/transactions**`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );

  // ── RPC (set_pin, verify_pin) ─────────────────────────────────────────────

  await page.route(`${supabaseUrl}/rest/v1/rpc/set_pin`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
  );

  await page.route(`${supabaseUrl}/rest/v1/rpc/verify_pin`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'true' }),
  );
}
