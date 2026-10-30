-- 一起早睡 · watermelon collection (run once in Supabase SQL Editor)

-- what the couple is growing right now; at most one growing seed per couple
create table if not exists public.plantings (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  seed text not null,
  started_night date not null,
  planted_by uuid default auth.uid(),
  status text not null default 'growing' check (status in ('growing', 'done', 'removed')),
  created_at timestamptz not null default now()
);
create unique index if not exists plantings_one_growing on public.plantings (couple_id) where status = 'growing';

-- everything harvested; result is the seed itself, or 'Classic Red' when its challenge was missed
create table if not exists public.harvests (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  planting_id uuid unique references public.plantings on delete set null,
  seed text not null,
  result text not null,
  night date not null,
  created_at timestamptz not null default now()
);
create index if not exists harvests_couple on public.harvests (couple_id, created_at);

alter table public.plantings enable row level security;
alter table public.harvests enable row level security;

drop policy if exists plantings_rw on public.plantings;
create policy plantings_rw on public.plantings for all
  using (couple_id = public.my_couple()) with check (couple_id = public.my_couple());
drop policy if exists harvests_rw on public.harvests;
create policy harvests_rw on public.harvests for all
  using (couple_id = public.my_couple()) with check (couple_id = public.my_couple());

do $$ begin alter publication supabase_realtime add table public.plantings; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.harvests; exception when others then null; end $$;

select 'garden ok' as result;
