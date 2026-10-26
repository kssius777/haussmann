-- =====================================================================
--  Le salon devient tout le 7e (26/10/2026, demande du propriétaire : « le lieu pour parler est trop petit » ; choix : « tout
--  le 7e ») : la tour Eiffel, le Champ-de-Mars, les Invalides, Orsay, et le Trocadéro de l'autre côté du pont d'Iéna (avant :
--  une bande du Trocadéro à l'École militaire). Le site garde chacun dans le 7e et le Trocadéro ; ici, on garde les positions
--  dans le rectangle qui les entoure. Le reste ne change pas (salles de 100, un mot par minute, bannir : migration_salon.sql).
--  Rejouable sans risque.
-- =====================================================================

-- entrer au salon (ou y revenir) : on garde sa salle, sinon la première qui a de la place (100)
create or replace function chat_join(p_lon float8, p_lat float8) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); b timestamptz; r int; lo float8; la float8;
begin
  b := _chat_ban_until(u);
  if b = 'infinity'::timestamptz then raise exception 'Vous êtes banni du chat.'; end if;
  if b is not null then raise exception 'Vous êtes banni du chat jusqu''au %', to_char(b at time zone 'Europe/Paris', 'DD/MM à HH24"h"MI'); end if;
  lo := least(2.3340, greatest(2.2845, coalesce(p_lon, 2.2950)));
  la := least(48.8655, greatest(48.8455, coalesce(p_lat, 48.8580)));
  delete from place_people where seen < now() - interval '90 seconds';
  select room into r from place_people where user_id = u;
  if r is null then
    select min(g) into r from generate_series(1, (select coalesce(max(room), 0) + 1 from place_people)) g
      where (select count(*) from place_people x where x.room = g) < 100;
  end if;
  insert into place_people(user_id, room, lon, lat, seen) values (u, r, lo, la, now())
    on conflict (user_id) do update set room = excluded.room, lon = excluded.lon, lat = excluded.lat, seen = now();
  perform _chat_emit(r, u, 'join', _chat_person(u));
  return json_build_object('room', r, 'me', u, 'people', chat_people(), 'last', coalesce((select max(id) from chat_msg where room = r), 0), 'admin', is_admin());
end $$;

-- se déplacer au salon (tout le 7e et le Trocadéro)
create or replace function chat_move(p_lon float8, p_lat float8) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); x place_people; lo float8; la float8;
begin
  select * into x from place_people where user_id = u for update;
  if not found then raise exception 'Revenez sur le Champ-de-Mars'; end if;
  lo := least(2.3340, greatest(2.2845, p_lon)); la := least(48.8655, greatest(48.8455, p_lat));
  update place_people set lon = lo, lat = la, seen = now() where user_id = u;
  perform _chat_emit(x.room, u, 'move', jsonb_build_object('lon', lo, 'lat', la));
end $$;

revoke all on function chat_join(float8, float8), chat_move(float8, float8) from public, anon;
grant execute on function chat_join(float8, float8), chat_move(float8, float8) to authenticated;
