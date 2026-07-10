-- Migration: reconcile schema drift found during the portify-staging bootstrap
-- Run this in the Supabase SQL Editor.
--
-- Brings an environment that's still on the older supabase-schema.sql
-- snapshot (missing several profiles columns, the plan_updated_at/
-- profile_updated_at triggers, and the investor_profiles view) up to the
-- real, canonical shape confirmed against production on 2026-07-10. See
-- docs/import-audit-migration-runbook.md's "Schema drift reconciliation"
-- entry for the full comparison.
--
-- Idempotent and additive only: no column is dropped, no data is deleted,
-- nothing is renamed here (the investment_plans monthly_amount -> amount
-- rename was already applied directly to portify-staging in the prior
-- bootstrap task — see that same runbook entry). Safe to run against an
-- environment that already has some or all of this.
--
-- Do NOT run this against production — production is already the source of
-- truth this migration reconciles other environments against.

-- ── 1. profiles — add missing columns ────────────────────────────────────
alter table public.profiles
  add column if not exists allocated_stock    numeric,
  add column if not exists allocated_etf      numeric,
  add column if not exists allocated_bond_etf numeric,
  add column if not exists estimated_rate     numeric,
  add column if not exists uninvested_cash    numeric default 0,
  add column if not exists free_funds_annual_rate_pct numeric default 0,
  add column if not exists profile_updated_at timestamptz default now();

-- profiles.risk_score is numeric in this environment's older snapshot but
-- an integer (0–100 score) in production — align the type without touching
-- existing values (they're already whole numbers in practice).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'risk_score' and data_type = 'numeric'
  ) then
    alter table public.profiles alter column risk_score type integer using risk_score::integer;
  end if;
end $$;

-- profiles check constraints that were missing from the older snapshot.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_investment_goal_check') then
    alter table public.profiles
      add constraint profiles_investment_goal_check
        check (investment_goal in ('emergency_fund','short_purchase','income','wealth_growth','retirement','legacy'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_risk_score_check') then
    alter table public.profiles
      add constraint profiles_risk_score_check check (risk_score >= 0 and risk_score <= 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_allocated_stock_check') then
    alter table public.profiles
      add constraint profiles_allocated_stock_check check (allocated_stock >= 0 and allocated_stock <= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_allocated_etf_check') then
    alter table public.profiles
      add constraint profiles_allocated_etf_check check (allocated_etf >= 0 and allocated_etf <= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_allocated_bond_etf_check') then
    alter table public.profiles
      add constraint profiles_allocated_bond_etf_check check (allocated_bond_etf >= 0 and allocated_bond_etf <= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_estimated_rate_check') then
    alter table public.profiles
      add constraint profiles_estimated_rate_check check (estimated_rate >= 0 and estimated_rate <= 1);
  end if;
end $$;

create or replace function public.touch_profile_updated_at()
returns trigger language plpgsql as $$
begin new.profile_updated_at = now(); return new; end;
$$;

drop trigger if exists trg_touch_profile_updated_at on public.profiles;
create trigger trg_touch_profile_updated_at
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();

-- ── 2. investment_plans — add missing column/constraint/trigger ──────────
-- (The monthly_amount -> amount rename itself was already applied directly
-- to portify-staging in the prior bootstrap task; this only covers what
-- that fix didn't.)
alter table public.investment_plans
  add column if not exists plan_updated_at timestamptz default now();

-- The prior bootstrap task added this column directly (without a default)
-- before this migration existed — set the default now regardless, so it
-- matches production whether the column is brand new or already there.
alter table public.investment_plans alter column plan_updated_at set default now();

alter table public.investment_plans alter column preferred_asset_classes drop default;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'investment_plans_preferred_asset_classes_check') then
    alter table public.investment_plans
      add constraint investment_plans_preferred_asset_classes_check
        check (preferred_asset_classes <@ array['stock','etf','bond_etf']);
  end if;
end $$;

create or replace function public.touch_plan_updated_at()
returns trigger language plpgsql as $$
begin new.plan_updated_at = now(); return new; end;
$$;

drop trigger if exists trg_touch_plan_updated_at on public.investment_plans;
create trigger trg_touch_plan_updated_at
  before update on public.investment_plans
  for each row execute function public.touch_plan_updated_at();

-- ── 3. investor_profiles — add the missing view ───────────────────────────
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

-- ── Known, deliberately untouched residue ─────────────────────────────────
-- profiles.preferred_assets and profiles.monthly_amount exist in this
-- environment's older snapshot but not in production, and not in this
-- migration's "add missing columns" — they are unused leftovers, not part
-- of the canonical schema. Left in place rather than dropped, per this
-- reconciliation's explicit no-drop/no-data-loss scope; a future, dedicated
-- cleanup migration can remove them once confirmed unused everywhere.
