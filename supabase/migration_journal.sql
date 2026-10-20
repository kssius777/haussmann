-- =====================================================================
--  Journal des migrations ratées (20/10/2026). Quand Vercel n'arrive pas à appliquer une migration,
--  scripts/migrate.mjs note ici la première ligne de l'erreur ; migration_status() la montre avec la clé publique :
--  on comprend un déploiement raté sans ouvrir les journaux de Vercel. Rejouable sans risque.
-- =====================================================================
create table if not exists _migration_errors (
  id    bigserial primary key,
  name  text not null,
  error text not null,
  at    timestamptz not null default now()
);
alter table _migration_errors enable row level security;

create or replace function _migration_error(p_name text, p_error text) returns void
language sql security definer set search_path = public as $$
  delete from _migration_errors where at < now() - interval '30 days';
  insert into _migration_errors(name, error) values (left(p_name, 100), left(p_error, 300));
$$;

create or replace function migration_status() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'applied', (select json_build_object('name', name, 'at', at) from _migrations order by at desc, name desc limit 1),
    'error',   (select json_build_object('name', name, 'error', error, 'at', at) from _migration_errors order by id desc limit 1)) $$;

revoke all on function _migration_error(text, text), migration_status() from public;
revoke all on function _migration_error(text, text) from anon, authenticated;
grant execute on function _migration_error(text, text) to service_role;
grant execute on function migration_status() to anon, authenticated, service_role;
