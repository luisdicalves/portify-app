-- =============================================
-- Portify — Supabase Schema
-- Copia e corre no SQL Editor do Supabase
-- =============================================

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  user_handle text unique,
  avatar_url text,
  date_of_birth date,
  preferred_sectors text[],
  preferred_assets  text[],
  pin_hash text,
  investor_since int default extract(year from now())::int,
  risk_profile text default 'moderate'
    check (risk_profile in ('very_conservative','conservative','moderate','aggressive','very_aggressive')),
  investment_goal text default 'retirement',
  experience_level text default 'beginner'
    check (experience_level in ('none','beginner','intermediate','experienced','professional')),
  market_reaction  text check (market_reaction  in ('sell_all','sell_some','hold','buy_more')),
  financial_status text check (financial_status in ('unstable','stable','comfortable','wealthy')),
  liquidity_need   text check (liquidity_need   in ('critical','possible','unlikely','never')),
  risk_score       numeric,
  monthly_amount   numeric,
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

-- Transactions
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  ticker text not null,
  type text not null check (type in ('buy','sell','dividend','deposit','interest','wht','interest_tax')),
  units numeric,
  price numeric,
  amount numeric not null,
  currency text default 'EUR',
  executed_at timestamptz default now(),
  notes text,
  external_id text
);

-- Plain (non-partial) unique index: required so upsert(... onConflict: 'user_id,external_id')
-- can target it via ON CONFLICT. Postgres allows multiple NULL external_id rows under this
-- index (NULL <> NULL), so manually-entered trades (no external_id) are unaffected.
create unique index if not exists transactions_user_external_id_idx on public.transactions (user_id, external_id);

alter table public.transactions enable row level security;

create policy "Users manage their own transactions"
  on public.transactions for all
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Investment plan
create table if not exists public.investment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  monthly_amount numeric not null,
  frequency text not null check (frequency in ('weekly','biweekly','monthly','quarterly','semiannual','annual')),
  horizon_years int not null,
  goal_amount numeric,
  preferred_asset_classes text[] default array['stock','etf','bond_etf'],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.investment_plans enable row level security;

create policy "Users manage their own plan"
  on public.investment_plans for all
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);
