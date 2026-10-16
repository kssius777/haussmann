-- =====================================================================
--  À coller UNE SEULE FOIS dans Supabase → SQL Editor → Run.
--  Ensuite, chaque déploiement Vercel applique tout seul les nouvelles migrations.
-- =====================================================================
create table if not exists _migrations (name text primary key, at timestamptz not null default now());
alter table _migrations enable row level security;

-- les migrations déjà passées à la main
insert into _migrations(name) values
  ('migration_pion.sql'), ('migration_pion2.sql'), ('migration_pion3.sql'), ('migration_pion4.sql'),
  ('migration_eco.sql'), ('migration_credit.sql'), ('migration_ledger.sql'),
  ('migration_absence.sql'), ('migration_direction.sql'), ('migration_choix.sql')
on conflict do nothing;

-- appliquer une migration (seulement avec la clé service_role, qui n'existe que dans Vercel)
create or replace function _run_migration(p_name text, p_sql text) returns json
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from _migrations where name = p_name) then return json_build_object('skipped', p_name); end if;
  execute p_sql;
  insert into _migrations(name) values (p_name);
  notify pgrst, 'reload schema';
  return json_build_object('applied', p_name);
end $$;
create or replace function _applied_migrations() returns json
language sql stable security definer set search_path = public as $$ select coalesce(json_agg(name), '[]') from _migrations $$;

revoke all on function _run_migration(text, text), _applied_migrations() from public, anon, authenticated;
grant execute on function _run_migration(text, text), _applied_migrations() to service_role;
notify pgrst, 'reload schema';
