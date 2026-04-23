-- NitroFlow web schema
create extension if not exists "pgcrypto";

create type app_role as enum ('user', 'admin');
create type app_plan as enum ('free', 'pro');
create type ticket_status as enum ('open', 'closed');
create type message_sender as enum ('user', 'ai', 'admin');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  avatar_url text,
  role app_role not null default 'user',
  plan app_plan not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  active boolean not null default true,
  uses int not null default 0,
  stripe_promotion_code_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  message text not null,
  status ticket_status not null default 'open',
  ai_enabled boolean not null default true,
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  ai_response text,
  ai_error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  sender message_sender not null,
  sender_user_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets(id) on delete set null,
  title text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create or replace function public.increment_promo_usage(promo_code_input text)
returns void
language plpgsql
security definer
as $$
begin
  update public.promo_codes
  set uses = uses + 1
  where code = promo_code_input;
end;
$$;

alter table public.profiles enable row level security;
alter table public.promo_codes enable row level security;
alter table public.tickets enable row level security;
alter table public.admin_alerts enable row level security;
alter table public.ticket_messages enable row level security;

create policy "profile-self-read" on public.profiles
for select using (auth.uid() = id);

create policy "profile-self-update" on public.profiles
for update using (auth.uid() = id);

create policy "ticket-insert-own" on public.tickets
for insert with check (auth.uid() = user_id);

create policy "ticket-select-own-or-admin" on public.tickets
for select using (
  auth.uid() = user_id
  or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy "ticket-update-own-or-admin" on public.tickets
for update using (
  auth.uid() = user_id
  or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy "admin-read-promos" on public.promo_codes
for select using (
  exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy "admin-read-alerts" on public.admin_alerts
for select using (
  exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy "ticket-messages-read-own-or-admin" on public.ticket_messages
for select using (
  exists (
    select 1
    from public.tickets t
    where t.id = ticket_id
      and (
        t.user_id = auth.uid()
        or exists (
          select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
        )
      )
  )
);

create policy "ticket-messages-insert-own-user" on public.ticket_messages
for insert with check (
  sender = 'user'
  and sender_user_id = auth.uid()
  and exists (
    select 1 from public.tickets t where t.id = ticket_id and t.user_id = auth.uid()
  )
);

create policy "ticket-messages-insert-admin" on public.ticket_messages
for insert with check (
  sender = 'admin'
  and sender_user_id = auth.uid()
  and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
);
