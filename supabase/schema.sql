-- Kairos cloud data: one row per account holding the whole app data, with a version number so
-- two devices saving at once don't overwrite each other (same idea as server/index.mjs).
-- Run it in the Supabase dashboard (SQL Editor) when setting up a project. Safe to re-run.

create table if not exists public.kairos_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  version    integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.kairos_data enable row level security;

-- Each account can only see and change its own row.
drop policy if exists "own row" on public.kairos_data;
create policy "own row" on public.kairos_data
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Hourly backups of the previous version, like the local server keeps.
create table if not exists public.kairos_backups (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists kairos_backups_user on public.kairos_backups (user_id, created_at desc);
alter table public.kairos_backups enable row level security;
drop policy if exists "own backups" on public.kairos_backups;
create policy "own backups" on public.kairos_backups
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Save if nobody else saved since `base_version`; otherwise hand back the newer copy.
-- Returns {"version": n} or {"conflict": true, "data": ..., "version": n}.
create or replace function public.kairos_save(base_version integer, new_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cur public.kairos_data;
  last_backup timestamptz;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  select * into cur from public.kairos_data where user_id = uid for update;
  if not found then
    insert into public.kairos_data (user_id, data, version) values (uid, new_data, 1);
    return jsonb_build_object('version', 1);
  end if;
  if cur.version <> base_version then
    return jsonb_build_object('conflict', true, 'data', cur.data, 'version', cur.version);
  end if;
  select max(created_at) into last_backup from public.kairos_backups where user_id = uid;
  if last_backup is null or last_backup < now() - interval '1 hour' then
    insert into public.kairos_backups (user_id, data) values (uid, cur.data);
    delete from public.kairos_backups
      where user_id = uid
        and id not in (select id from public.kairos_backups where user_id = uid order by id desc limit 200);
  end if;
  update public.kairos_data
    set data = new_data, version = cur.version + 1, updated_at = now()
    where user_id = uid;
  return jsonb_build_object('version', cur.version + 1);
end;
$$;

revoke all on function public.kairos_save(integer, jsonb) from public, anon;
grant execute on function public.kairos_save(integer, jsonb) to authenticated;

-- Signed-in accounts may read their own row (row security above); writes only go through kairos_save.
revoke all on public.kairos_data, public.kairos_backups from anon, authenticated;
grant select on public.kairos_data, public.kairos_backups to authenticated;

-- Live updates: devices hear about each other's saves within seconds (row security still applies).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kairos_data'
  ) then
    alter publication supabase_realtime add table public.kairos_data;
  end if;
end
$$;
