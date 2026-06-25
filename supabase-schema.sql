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
  pin_hash text,
  investor_since int default extract(year from now())::int,
  risk_profile text default 'moderate' check (risk_profile in ('conservative','moderate','aggressive')),
  investment_goal text default 'retirement',
  experience_level text default 'beginner' check (experience_level in ('beginner','intermediate','advanced')),
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

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

-- PIN: hashed server-side, never exposed in plaintext to the client
create extension if not exists pgcrypto;

create or replace function public.set_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public
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
set search_path = public
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
  on public.holdings for all using (auth.uid() = user_id);

-- Transactions
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  ticker text not null,
  type text not null check (type in ('buy','sell','dividend')),
  units numeric,
  price numeric,
  amount numeric not null,
  currency text default 'EUR',
  executed_at timestamptz default now(),
  notes text
);

alter table public.transactions enable row level security;

create policy "Users manage their own transactions"
  on public.transactions for all using (auth.uid() = user_id);

-- Investment plan
create table if not exists public.investment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  amount numeric not null,
  frequency text not null check (frequency in ('weekly','monthly','quarterly','annual')),
  horizon_years int not null,
  goal_amount numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.investment_plans enable row level security;

create policy "Users manage their own plan"
  on public.investment_plans for all using (auth.uid() = user_id);
