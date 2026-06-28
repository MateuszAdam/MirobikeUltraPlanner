-- MiroBike — schemat Supabase. Uruchom w SQL Editor (Supabase Studio).
-- Model: jedna paczka (trasa + miejsca) na wiersz, jako jsonb. Sync = last-write-wins.
-- Bez E2E (dane POI są publiczne).

create table if not exists public.routes (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  name       text        not null,
  bundle     jsonb       not null,
  favorites  jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, name)
);

-- RLS: każdy użytkownik widzi i zmienia wyłącznie własne trasy.
alter table public.routes enable row level security;

drop policy if exists routes_select on public.routes;
create policy routes_select on public.routes
  for select using (auth.uid() = user_id);

drop policy if exists routes_insert on public.routes;
create policy routes_insert on public.routes
  for insert with check (auth.uid() = user_id);

drop policy if exists routes_update on public.routes;
create policy routes_update on public.routes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists routes_delete on public.routes;
create policy routes_delete on public.routes
  for delete using (auth.uid() = user_id);

-- Lekka tabela „ping" dla keep-alive (żeby projekt free nie zasnął po 7 dniach).
create table if not exists public.heartbeat (
  id int primary key default 1,
  pinged_at timestamptz not null default now()
);
insert into public.heartbeat (id) values (1) on conflict (id) do nothing;
alter table public.heartbeat enable row level security;
drop policy if exists heartbeat_anon on public.heartbeat;
create policy heartbeat_anon on public.heartbeat for select using (true);
