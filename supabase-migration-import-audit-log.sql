-- =============================================
-- Portify — Import Audit Log Migration
-- Aplica no SQL Editor do Supabase (idempotente)
-- =============================================

-- ── 1. import_audit_logs — um registo por importação confirmada ──────────────
-- Guarda quem/quando/que ficheiro/que parser, os totais do preview, e um
-- resumo agregado (summary/warnings/errors) — nunca o conteúdo bruto do
-- ficheiro. Ver docs/import-xtb.md "audit log persistente" para a política
-- de privacidade completa.

create table if not exists public.import_audit_logs (
  id uuid primary key default gen_random_uuid(),
  -- Referencia public.profiles(id), não auth.users(id) diretamente — mesma
  -- convenção de holdings/transactions/investment_plans neste schema
  -- (profiles.id já referencia auth.users(id) on delete cascade 1:1).
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

-- Mesmo padrão de policies separadas por comando (com with check explícito
-- em insert/update) já usado no resto do schema após a RLS-audit migration.
drop policy if exists "Users can view their own import audit logs" on public.import_audit_logs;
create policy "Users can view their own import audit logs"
  on public.import_audit_logs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own import audit logs" on public.import_audit_logs;
create policy "Users can insert their own import audit logs"
  on public.import_audit_logs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own import audit logs" on public.import_audit_logs;
create policy "Users can update their own import audit logs"
  on public.import_audit_logs for update
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sem policy de delete, deliberadamente — mesmo padrão que profiles' INSERT
-- (ver supabase-migration-rls-audit.sql secção 6): a ausência de policy com
-- RLS ativo bloqueia a operação por defeito. Um audit log é, por definição,
-- um registo que não deve poder ser apagado pelo próprio utilizador.

-- ── 2. transactions.import_id — liga transações importadas ao seu audit log ──

alter table public.transactions
  add column if not exists import_id uuid references public.import_audit_logs(id) on delete set null;

create index if not exists transactions_user_id_import_id_idx
  on public.transactions (user_id, import_id);

-- ── 3. transactions — corrigir bug pré-existente no check de "type" ───────────
-- A app (lib/holdingsImport.ts, lib/portfolio/portfolioState.ts,
-- components/ui/TransactionCard.tsx) usa 'withholding_tax' de forma
-- consistente em todo o lado, mas o check constraint só permitia 'wht'
-- (introduzido em supabase-migration-rls-audit.sql). Qualquer import XTB com
-- uma linha de retenção na fonte falharia este constraint. Mantém 'wht' na
-- lista (não remove) para não partir linhas antigas que o possam ter usado.

alter table public.transactions
  drop constraint if exists transactions_type_check;

alter table public.transactions
  add constraint transactions_type_check
    check (type in ('buy','sell','dividend','deposit','interest','withholding_tax','wht','interest_tax'));

-- ── 4. Verificação rápida (descomenta e corre separadamente para confirmar) ───
/*
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'import_audit_logs'
order by ordinal_position;

select tablename, policyname, cmd, qual as using_expr, with_check as with_check_expr
from pg_policies
where schemaname = 'public' and tablename = 'import_audit_logs';
*/
