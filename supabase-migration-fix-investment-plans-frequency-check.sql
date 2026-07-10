-- Migration: widen investment_plans_frequency_check to match the app
-- Run this in the Supabase SQL Editor.
--
-- Production's real constraint only allowed 'weekly'/'monthly'/'quarterly'/
-- 'annual' — narrower than lib/profileConstants.ts's PLAN_FREQUENCIES, which
-- the plan-set UI can actually produce ('biweekly'/'semiannual' are real,
-- reachable choices there). Selecting "Quinzenal" or "Semestral" in
-- production would fail this check constraint today. Found and flagged
-- during the schema drift reconciliation (see
-- docs/import-audit-migration-runbook.md); this migration is the dedicated
-- fix for it. Widening a check constraint never invalidates existing rows,
-- so this is safe regardless of what's already stored.

alter table public.investment_plans
  drop constraint if exists investment_plans_frequency_check;

alter table public.investment_plans
  add constraint investment_plans_frequency_check
  check (
    frequency in (
      'weekly',
      'biweekly',
      'monthly',
      'quarterly',
      'semiannual',
      'annual'
    )
  );
