-- 一起早睡 · database schema
-- Run once in Supabase SQL Editor.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- couples -------------------------------------------------------------
create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  bed_target time not null default '23:30',
  wake_target time not null default '07:30',
  grace_min int not null default 10,
  leaves_per_month int not null default 4,
  stake text not null default '输的人请一杯奶茶',
  created_at timestamptz not null default now()
);

-- profiles ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '我',
  couple_id uuid references public.couples on delete set null,
  tz text not null default 'Asia/Shanghai',
  remind_bed boolean not null default true,
  notify_partner boolean not null default true,
  created_at timestamptz not null default now()
);

-- check-ins -----------------------------------------------------------
-- night = local date of (time - 12h): sleep at 23:40 Oct 7 and wake at 07:10 Oct 8 both belong to night 2026-10-07
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  couple_id uuid not null references public.couples on delete cascade,
  kind text not null check (kind in ('sleep','wake','leave')),
  night date not null,
  at timestamptz not null default now(),
  local_min int not null,            -- minutes since local midnight at check-in
  note text,                         -- goodnight message or leave reason
  photo_path text,
  unique (user_id, night, kind)
);
create index if not exists checkins_couple_night on public.checkins (couple_id, night);

-- push subscriptions & bookkeeping (server only) ------------------------
create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.reminder_log (
  user_id uuid not null,
  night date not null,
  kind text not null,
  primary key (user_id, night, kind)
);
create table if not exists public.app_secrets (
  name text primary key,
  value jsonb not null
);

-- helpers ---------------------------------------------------------------
create or replace function public.my_couple() returns uuid
language sql stable security definer set search_path = public as $$
  select couple_id from profiles where id = auth.uid()
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, tz)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'name', '我'),
          coalesce(new.raw_user_meta_data->>'tz', 'Asia/Shanghai'));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.create_couple() returns text
language plpgsql security definer set search_path = public as $$
declare c text; cid uuid;
begin
  if (select couple_id from profiles where id = auth.uid()) is not null then
    return (select code from couples where id = (select couple_id from profiles where id = auth.uid()));
  end if;
  loop
    c := lpad((floor(random()*1000000))::int::text, 6, '0');
    exit when not exists (select 1 from couples where code = c);
  end loop;
  insert into couples (code) values (c) returning id into cid;
  update profiles set couple_id = cid where id = auth.uid();
  return c;
end $$;

create or replace function public.join_couple(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select id into cid from couples where code = p_code;
  if cid is null then return false; end if;
  if (select count(*) from profiles where couple_id = cid) >= 2 then return false; end if;
  update profiles set couple_id = cid where id = auth.uid();
  return true;
end $$;

-- row level security ------------------------------------------------------
alter table public.couples enable row level security;
alter table public.profiles enable row level security;
alter table public.checkins enable row level security;
alter table public.push_subs enable row level security;
alter table public.reminder_log enable row level security;
alter table public.app_secrets enable row level security;

drop policy if exists couples_rw on public.couples;
create policy couples_rw on public.couples for all
  using (id = public.my_couple()) with check (id = public.my_couple());

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or (couple_id is not null and couple_id = public.my_couple()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists checkins_read on public.checkins;
create policy checkins_read on public.checkins for select
  using (couple_id = public.my_couple());
drop policy if exists checkins_insert on public.checkins;
create policy checkins_insert on public.checkins for insert
  with check (user_id = auth.uid() and couple_id = public.my_couple());
drop policy if exists checkins_delete on public.checkins;
create policy checkins_delete on public.checkins for delete
  using (user_id = auth.uid());

drop policy if exists push_own on public.push_subs;
create policy push_own on public.push_subs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- realtime so the partner's check-in shows up instantly
do $$ begin
  alter publication supabase_realtime add table public.checkins;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.couples;
exception when others then null; end $$;

-- photo storage ---------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
  on conflict (id) do nothing;
drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects for select
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_couple()::text);
drop policy if exists photos_insert on storage.objects;
create policy photos_insert on storage.objects for insert
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_couple()::text);
