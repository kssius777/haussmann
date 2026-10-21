-- =====================================================================
--  La charge du jeu (21/10/2026, demande du propriétaire : « lève l'alerte quand ça chauffe et dis-moi ce que je dois
--  faire »). Supabase Pro bloque à 500 connexions temps réel tant que le plafond de dépense est activé : on suit le nombre
--  de joueurs dans Paris en même temps (en ce moment, le pic du jour, le pic des 7 jours) et la taille de la base (8 Go
--  compris dans Pro).
--   · load_day : le pic du jour, mis à jour à chaque arrivée dans Paris (déclencheur sur world_people) ;
--   · admin_load() : pour le tableau de bord admin ; load_status() : les mêmes chiffres, sans rien de personnel, pour la
--     vérification automatique de chaque jour (clé publique) ;
--   · niveau : vert, orange dès 250 joueurs en même temps (ou 6 Go de base), rouge dès 400 (ou 7,5 Go).
--  Rejouable sans risque.
-- =====================================================================
create table if not exists load_day (day date primary key, peak int not null default 0, at timestamptz not null default now());
alter table load_day enable row level security;   -- (aucune politique : seules les fonctions du jeu y touchent)
revoke all on load_day from anon, authenticated;
create index if not exists world_people_seen on world_people(seen);

create or replace function _load_peak() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; d date := paris_today();
begin
  select count(*) into n from world_people where seen > now() - interval '90 seconds';
  if n > coalesce((select peak from load_day where day = d), 0) then
    insert into load_day(day, peak, at) values (d, n, now()) on conflict (day) do update set peak = greatest(load_day.peak, excluded.peak), at = now();
  end if;
  return null;
end $$;
drop trigger if exists world_people_peak on world_people;
create trigger world_people_peak after insert on world_people for each row execute function _load_peak();

create or replace function _load() returns jsonb
language sql stable security definer set search_path = public as $$
  with x as (select (select count(*) from world_people where seen > now() - interval '90 seconds')::int now_n,
                    coalesce((select peak from load_day where day = paris_today()), 0) today,
                    coalesce((select max(peak) from load_day where day > paris_today() - 7), 0) week,
                    (pg_database_size(current_database()) / 1048576)::int db_mb)
  select jsonb_build_object('now', now_n, 'peak_today', today, 'peak_7d', week, 'db_mb', db_mb,
    'level', case when greatest(now_n, today) >= 400 or db_mb >= 7680 then 'rouge'
                  when greatest(now_n, today) >= 250 or db_mb >= 6144 then 'orange' else 'vert' end) from x $$;

create or replace function admin_load() returns json
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Réservé aux admins'; end if;
  return _load()::json;
end $$;

create or replace function load_status() returns json
language sql stable security definer set search_path = public as $$ select (_load() - 'db_mb')::json $$;

revoke all on function _load_peak(), _load() from public, anon, authenticated;
revoke all on function admin_load() from public, anon;
grant execute on function admin_load() to authenticated;
grant execute on function load_status() to anon, authenticated;
