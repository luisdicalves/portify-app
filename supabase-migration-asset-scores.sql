-- Migration: add asset_scores table (Portify Investment Engine v1.0, Fase 1)
-- Run this in the Supabase SQL Editor.
--
-- Append-only history of Quality/Risk/Conviction Engine snapshots per (user, ticker).
-- Scoped by user_id (not a global per-asset table) to match this schema's existing
-- RLS pattern — see the plan's "Desvios deliberados" note for why.

create table if not exists public.asset_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  created_at timestamptz not null default now(),

  quality_score int,
  risk_score int,
  conviction_score int,

  valuation_score int,
  financial_health_score int,
  growth_score int,

  holding_type text check (holding_type in ('core', 'satellite')),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists asset_scores_user_ticker_idx
  on public.asset_scores (user_id, ticker, created_at desc);

alter table public.asset_scores enable row level security;

create policy "asset_scores_select_own" on public.asset_scores
  for select using (auth.uid() = user_id);

create policy "asset_scores_insert_own" on public.asset_scores
  for insert with check (auth.uid() = user_id);

-- No update/delete policy: scores are append-only history, per the spec's
-- "histórico de scores obrigatório" requirement.
