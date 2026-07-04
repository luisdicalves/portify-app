-- =============================================
-- Portify — RLS Audit & Schema Sync Migration
-- Aplica no SQL Editor do Supabase (idempotente)
-- =============================================

-- ── 1. profiles — colunas em falta ───────────────────────────────────────────
-- O app consulta e escreve estas colunas mas o schema original não as tinha.

alter table public.profiles
  add column if not exists market_reaction  text
    check (market_reaction in ('sell_all','sell_some','hold','buy_more')),
  add column if not exists financial_status text
    check (financial_status in ('unstable','stable','comfortable','wealthy')),
  add column if not exists liquidity_need   text
    check (liquidity_need in ('critical','possible','unlikely','never')),
  add column if not exists preferred_assets text[],
  add column if not exists risk_score       numeric,
  add column if not exists monthly_amount   numeric;

-- ── 2. profiles — corrigir check constraints desatualizadas ──────────────────
-- Os enums da app têm 5 valores para risk_profile e 5 para experience_level;
-- os constraints originais só cobriam 3.

alter table public.profiles
  drop constraint if exists profiles_risk_profile_check;

alter table public.profiles
  add constraint profiles_risk_profile_check
    check (risk_profile in (
      'very_conservative','conservative','moderate','aggressive','very_aggressive'
    ));

alter table public.profiles
  drop constraint if exists profiles_experience_level_check;

alter table public.profiles
  add constraint profiles_experience_level_check
    check (experience_level in (
      'none','beginner','intermediate','experienced','professional'
    ));

-- ── 3. investment_plans — renomear coluna amount → monthly_amount ─────────────
-- O app usa .select('monthly_amount') mas a coluna original chama-se "amount".
-- Renomear é safe: sem FK externas nesta coluna.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'investment_plans'
      and column_name  = 'amount'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'investment_plans'
      and column_name  = 'monthly_amount'
  ) then
    alter table public.investment_plans rename column amount to monthly_amount;
  end if;
end $$;

-- ── 4. transactions — alargar tipo para incluir movimentos de cash ────────────
-- O app regista 'deposit', 'interest', 'wht', 'interest_tax' mas o check
-- original só permitia 'buy','sell','dividend'.

alter table public.transactions
  drop constraint if exists transactions_type_check;

alter table public.transactions
  add constraint transactions_type_check
    check (type in ('buy','sell','dividend','deposit','interest','wht','interest_tax'));

-- ── 5. RLS — adicionar WITH CHECK explícito nas policies de escrita ───────────
-- Sem WITH CHECK, o Postgres usa o USING como CHECK implícito.
-- Tornar explícito impede UPDATE de mudar o user_id para outro utilizador.

-- profiles
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  using     (auth.uid() = id)
  with check (auth.uid() = id);

-- holdings
drop policy if exists "Users manage their own holdings" on public.holdings;
create policy "Users manage their own holdings"
  on public.holdings
  for all
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- transactions
drop policy if exists "Users manage their own transactions" on public.transactions;
create policy "Users manage their own transactions"
  on public.transactions
  for all
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- investment_plans
drop policy if exists "Users manage their own plan" on public.investment_plans;
create policy "Users manage their own plan"
  on public.investment_plans
  for all
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 6. profiles INSERT — sem policy explícita (correto por design) ─────────────
-- O INSERT é feito exclusivamente pelo trigger handle_new_user (SECURITY DEFINER).
-- Uma policy de INSERT aberta permitiria que clientes inserissem rows arbitrárias;
-- a ausência de policy (com RLS ativo) bloqueia todos os INSERTs diretos do cliente.
-- Não adicionar nada aqui é a configuração segura.

-- ── 7. Verificação rápida (descomenta e corre separadamente para confirmar) ────
/*
select
  tablename,
  policyname,
  cmd,
  qual        as using_expr,
  with_check  as with_check_expr
from pg_policies
where schemaname = 'public'
order by tablename, cmd;
*/
