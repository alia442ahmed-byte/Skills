-- Budgeting app schema. All tables are per-user and protected by RLS.
-- Applied to Supabase project qzfjozslmxadeiqnowjx; kept here so the schema is
-- reproducible on any project.

create table if not exists public.budget_settings (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  currency text not null default 'USD',
  month_start_day int not null default 1 check (month_start_day between 1 and 28),
  created_at timestamptz not null default now()
);

create table if not exists public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (length(trim(name)) > 0),
  kind text not null default 'expense' check (kind in ('expense','income')),
  color text not null default '#6b7280',
  monthly_limit numeric(12,2) not null default 0 check (monthly_limit >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.budget_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  occurred_on date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  type text not null check (type in ('expense','income')),
  category_id uuid references public.budget_categories(id) on delete set null,
  note text not null default '',
  source text not null default 'manual' check (source in ('manual','csv','recurring')),
  import_hash text,
  created_at timestamptz not null default now()
);

create index if not exists budget_transactions_user_date_idx
  on public.budget_transactions (user_id, occurred_on desc);

-- The dedupe guarantee: re-importing an overlapping bank statement, or posting the
-- same recurring bill twice for one month, cannot double-count.
create unique index if not exists budget_transactions_import_hash_key
  on public.budget_transactions (user_id, import_hash)
  where import_hash is not null;

create table if not exists public.budget_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (length(trim(name)) > 0),
  target_amount numeric(12,2) not null check (target_amount > 0),
  saved_amount numeric(12,2) not null default 0 check (saved_amount >= 0),
  target_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.budget_recurring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (length(trim(name)) > 0),
  amount numeric(12,2) not null check (amount > 0),
  type text not null default 'expense' check (type in ('expense','income')),
  category_id uuid references public.budget_categories(id) on delete set null,
  day_of_month int not null default 1 check (day_of_month between 1 and 31),
  active boolean not null default true,
  last_posted_month date,
  created_at timestamptz not null default now()
);

-- Row level security: a user may only ever touch their own rows. The browser talks
-- to PostgREST directly, so these policies are the only thing between accounts.
alter table public.budget_settings     enable row level security;
alter table public.budget_categories   enable row level security;
alter table public.budget_transactions enable row level security;
alter table public.budget_goals        enable row level security;
alter table public.budget_recurring    enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'budget_settings','budget_categories','budget_transactions','budget_goals','budget_recurring'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
  end loop;
end $$;
