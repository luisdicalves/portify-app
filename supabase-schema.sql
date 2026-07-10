-- =============================================
-- Portify — Supabase Schema
-- Copia e corre no SQL Editor do Supabase
-- =============================================

-- Profiles (extends auth.users)
-- Reconciled against real production, 2026-07-10 (see
-- docs/import-audit-migration-runbook.md's "Schema drift reconciliation"
-- entry) — this snapshot previously carried "preferred_assets"/
-- "monthly_amount", neither of which exist in production; "monthly_amount"
-- lives on investment_plans as "amount" instead, and "preferred_assets" was
-- never actually kept. risk_score is an integer in production (a 0–100
-- score), not numeric.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  user_handle text unique,
  avatar_url text,
  date_of_birth date,
  preferred_sectors text[],
  pin_hash text,
  investor_since int default extract(year from now())::int,
  risk_profile text default 'moderate'
    check (risk_profile in ('very_conservative','conservative','moderate','aggressive','very_aggressive')),
  investment_goal text default 'retirement'
    check (investment_goal in ('emergency_fund','short_purchase','income','wealth_growth','retirement','legacy')),
  experience_level text default 'beginner'
    check (experience_level in ('none','beginner','intermediate','experienced','professional')),
  market_reaction  text check (market_reaction  in ('sell_all','sell_some','hold','buy_more')),
  financial_status text check (financial_status in ('unstable','stable','comfortable','wealthy')),
  liquidity_need   text check (liquidity_need   in ('critical','possible','unlikely','never')),
  risk_score       integer check (risk_score >= 0 and risk_score <= 100),
  allocated_stock    numeric check (allocated_stock    >= 0 and allocated_stock    <= 1),
  allocated_etf      numeric check (allocated_etf      >= 0 and allocated_etf      <= 1),
  allocated_bond_etf numeric check (allocated_bond_etf  >= 0 and allocated_bond_etf <= 1),
  estimated_rate     numeric check (estimated_rate      >= 0 and estimated_rate     <= 1),
  uninvested_cash    numeric default 0,
  free_funds_annual_rate_pct numeric default 0,
  profile_updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using     (auth.uid() = id)
  with check (auth.uid() = id);

-- Keeps profile_updated_at current whenever the profile is edited (e.g. the
-- summary page's finalize write) — separate from created_at, which is set
-- once at row creation and never touched again.
create or replace function public.touch_profile_updated_at()
returns trigger language plpgsql as $$
begin new.profile_updated_at = now(); return new; end;
$$;

drop trigger if exists trg_touch_profile_updated_at on public.profiles;
create trigger trg_touch_profile_updated_at
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();

-- Auto-create profile on sign up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, first_name, last_name, user_handle, date_of_birth)
  values (
    new.id,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'username',
    (new.raw_user_meta_data->>'dob')::date
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Registration validations (defence in depth — the client also validates before sign up)
alter table public.profiles
  add constraint user_handle_min_length check (user_handle is null or char_length(user_handle) >= 3) not valid;

alter table public.profiles
  add constraint date_of_birth_min_age check (date_of_birth is null or date_of_birth <= (current_date - interval '18 years')) not valid;

-- Lets the (unauthenticated) signup form check username availability before submitting
create or replace function public.is_username_available(p_handle text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where lower(user_handle) = lower(p_handle)
  );
$$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- Login uses the user_handle (not email) as the identifier, but Supabase Auth's
-- signInWithPassword requires an email — this resolves handle -> email so the
-- client can look it up before calling signInWithPassword. Returns null (not an
-- error) when the handle doesn't exist, so the client shows the same generic
-- "invalid credentials" message either way and never reveals which ID exists.
create or replace function public.get_email_by_handle(p_handle text)
returns text
language sql
security definer
set search_path = public
as $$
  select u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(p.user_handle) = lower(p_handle)
  limit 1;
$$;

revoke all on function public.get_email_by_handle(text) from public;
grant execute on function public.get_email_by_handle(text) to anon, authenticated;

-- PIN: hashed server-side, never exposed in plaintext to the client
create extension if not exists pgcrypto;

create or replace function public.set_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin !~ '^[0-9]{6}$' then
    raise exception 'PIN must be exactly 6 digits';
  end if;
  update public.profiles
  set pin_hash = crypt(p_pin, gen_salt('bf'))
  where id = auth.uid();
end;
$$;

create or replace function public.verify_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  stored text;
begin
  select pin_hash into stored from public.profiles where id = auth.uid();
  if stored is null then
    return false;
  end if;
  return stored = crypt(p_pin, stored);
end;
$$;

revoke all on function public.set_pin(text) from public;
revoke all on function public.verify_pin(text) from public;
grant execute on function public.set_pin(text) to authenticated;
grant execute on function public.verify_pin(text) to authenticated;

-- Holdings
create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  ticker text not null,
  name text,
  units numeric not null,
  avg_price numeric not null,
  currency text default 'EUR',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, ticker)
);

alter table public.holdings enable row level security;

create policy "Users manage their own holdings"
  on public.holdings for all
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Import audit logs — one row per confirmed XTB/CSV import (lib/db/importAudit.ts).
-- Created before "transactions" since transactions.import_id references it.
-- Never stores raw file content — see docs/import-xtb.md.
create table if not exists public.import_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  parser_name text not null default 'xtb',
  parser_version text not null,
  filename text not null,
  file_hash text,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'partial', 'failed')),
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  warning_count integer not null default 0,
  error_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists import_audit_logs_user_id_created_at_idx
  on public.import_audit_logs (user_id, created_at desc);

alter table public.import_audit_logs enable row level security;

create policy "Users can view their own import audit logs"
  on public.import_audit_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own import audit logs"
  on public.import_audit_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own import audit logs"
  on public.import_audit_logs for update
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy, deliberately — same pattern as profiles' missing INSERT
-- policy: RLS active + no policy for a command blocks it by default. An
-- audit log shouldn't be deletable by the user it belongs to.

-- Transactions
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  ticker text,
  type text not null check (type in ('buy','sell','dividend','deposit','interest','withholding_tax','wht','interest_tax')),
  units numeric,
  price numeric,
  amount numeric not null,
  currency text default 'EUR',
  executed_at timestamptz default now(),
  notes text,
  external_id text,
  import_id uuid references public.import_audit_logs(id) on delete set null
);

-- Plain (non-partial) unique index: required so upsert(... onConflict: 'user_id,external_id')
-- can target it via ON CONFLICT. Postgres allows multiple NULL external_id rows under this
-- index (NULL <> NULL), so manually-entered trades (no external_id) are unaffected.
create unique index if not exists transactions_user_external_id_idx on public.transactions (user_id, external_id);

create index if not exists transactions_user_id_import_id_idx on public.transactions (user_id, import_id);

alter table public.transactions enable row level security;

create policy "Users manage their own transactions"
  on public.transactions for all
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Investment plan
-- Reconciled against real production, 2026-07-10: this snapshot's column was
-- "monthly_amount", but the app (app/auth/summary/page.tsx) and production
-- both use "amount"; "plan_updated_at" was also missing. See
-- docs/import-audit-migration-runbook.md's "Schema drift reconciliation"
-- entry. NOTE: production's own "frequency" check is narrower than this
-- (missing 'biweekly'/'semiannual', which the app's plan-set UI can still
-- produce) — that is treated as a bug in production to fix separately, not
-- as drift to mirror here; this snapshot deliberately keeps the wider list.
create table if not exists public.investment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  amount numeric not null,
  frequency text not null check (frequency in ('weekly','biweekly','monthly','quarterly','semiannual','annual')),
  horizon_years int not null,
  goal_amount numeric,
  preferred_asset_classes text[]
    check (preferred_asset_classes <@ array['stock','etf','bond_etf']),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  plan_updated_at timestamptz default now()
);

alter table public.investment_plans enable row level security;

create policy "Users manage their own plan"
  on public.investment_plans for all
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keeps plan_updated_at current whenever the plan is edited — separate from
-- created_at/updated_at (updated_at isn't actually written by the app today,
-- kept only for schema parity with what already existed).
create or replace function public.touch_plan_updated_at()
returns trigger language plpgsql as $$
begin new.plan_updated_at = now(); return new; end;
$$;

drop trigger if exists trg_touch_plan_updated_at on public.investment_plans;
create trigger trg_touch_plan_updated_at
  before update on public.investment_plans
  for each row execute function public.touch_plan_updated_at();

-- Read-only convenience view joining a profile with its plan — not currently
-- queried anywhere in the app (confirmed by grepping app/, lib/,
-- components/), only appears in lib/supabase/database.types.ts as a
-- generated foreign-key relation. Kept for schema parity with production;
-- RLS on the underlying tables still applies to whoever queries it.
create or replace view public.investor_profiles as
select
  p.id as user_id,
  p.risk_profile,
  p.investment_goal,
  p.experience_level,
  p.preferred_sectors,
  p.market_reaction,
  p.financial_status,
  p.liquidity_need,
  p.risk_score,
  p.allocated_stock,
  p.allocated_etf,
  p.allocated_bond_etf,
  p.estimated_rate,
  ip.amount as monthly_amount,
  ip.frequency,
  ip.horizon_years,
  ip.goal_amount,
  ip.preferred_asset_classes,
  (p.risk_score is not null and ip.amount is not null and ip.horizon_years is not null) as onboarding_complete
from public.profiles p
left join public.investment_plans ip on ip.user_id = p.id;
