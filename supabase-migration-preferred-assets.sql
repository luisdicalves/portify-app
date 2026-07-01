-- Migration: add preferred_assets column to profiles
-- Run this in the Supabase SQL Editor

alter table public.profiles
  add column if not exists preferred_assets text[] default '{}';
