-- =====================================================================
--  Le salon du Champ-de-Mars revient (25/10/2026, choix du propriétaire : « si tout le monde voit la map de Paris avec des
--  mots partout, ça va être n'importe quoi » ; « un salon chat comme avec le Champ-de-Mars, mais en plus vaste, avec un peu
--  plus de capacité »). Sur la carte de Paris, plus aucun mot : « Parler » emmène au salon, où l'on voit les montgolfières de
--  ceux qui sont là et leurs petits mots. Les fonctions du chat de migration_chat.sql reprennent du service, avec :
--   · plus vaste : du Trocadéro à l'École militaire, par-dessus la Seine (avant : le Champ-de-Mars) ;
--   · des salles de 100 (avant : 80) ;
--   · un mot par minute (avant : un par seconde), comme dans Paris : le compteur regarde aussi chat_msg, donc sortir et revenir
--     ne le remet pas à zéro ;
--   · bannir : la personne sort du salon tout de suite (« kick » dans sa salle : les autres ne la voient plus).
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
  lo := least(2.3050, greatest(2.2860, coalesce(p_lon, 2.2950)));
  la := least(48.8640, greatest(48.8500, coalesce(p_lat, 48.8580)));
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

-- se déplacer au salon (du Trocadéro à l'École militaire)
create or replace function chat_move(p_lon float8, p_lat float8) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); x place_people; lo float8; la float8;
begin
  select * into x from place_people where user_id = u for update;
  if not found then raise exception 'Revenez sur le Champ-de-Mars'; end if;
  lo := least(2.3050, greatest(2.2860, p_lon)); la := least(48.8640, greatest(48.8500, p_lat));
  update place_people set lon = lo, lat = la, seen = now() where user_id = u;
  perform _chat_emit(x.room, u, 'move', jsonb_build_object('lon', lo, 'lat', la));
end $$;

-- un petit mot : 120 caractères au plus, un par minute
create or replace function chat_say(p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); x place_people; t text; t0 timestamptz;
begin
  if _chat_ban_until(u) is not null then raise exception 'Vous êtes banni du chat.'; end if;
  select * into x from place_people where user_id = u for update;
  if not found then raise exception 'Revenez sur le Champ-de-Mars'; end if;
  t := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  if t = '' then return; end if;
  t := left(t, 120);
  select greatest(x.said_at, max(at)) into t0 from chat_msg where user_id = u and kind = 'say' and at > now() - interval '60 seconds';
  if t0 > now() - interval '60 seconds' then
    raise exception 'Doucement : un message par minute (encore % s).', greatest(1, ceil(60 - extract(epoch from now() - t0)))::int;
  end if;
  update place_people set said_at = now(), seen = now() where user_id = u;
  perform _chat_emit(x.room, u, 'say', jsonb_build_object('t', t));
end $$;

-- bannir du chat (admin) : il sort du salon tout de suite (sa salle le sait) ; il reste dans Paris
create or replace function chat_ban(p_user uuid, p_hours int default 24) returns json
language plpgsql security definer set search_path = public as $$
declare a uuid := _need_admin(); c int; r int;
begin
  if p_user = a then raise exception 'Vous ne pouvez pas vous bannir vous-même'; end if;
  if exists (select 1 from admins where id = p_user) then raise exception 'On ne bannit pas un admin'; end if;
  insert into chat_bans(user_id, until, by_user, at) values (p_user, case when p_hours is null then null else now() + make_interval(hours => p_hours) end, a, now())
    on conflict (user_id) do update set until = excluded.until, by_user = excluded.by_user, at = now();
  delete from place_people where user_id = p_user returning room into r;
  if r is not null then perform _chat_emit(r, p_user, 'kick', jsonb_build_object('h', p_hours)); end if;
  select cell into c from world_people where user_id = p_user;
  if c is not null then perform _wemit(c, p_user, 'kick', jsonb_build_object('h', p_hours)); end if;
  return chat_bans();
end $$;

revoke all on function chat_join(float8, float8), chat_move(float8, float8), chat_say(text), chat_ban(uuid, int) from public, anon;
grant execute on function chat_join(float8, float8), chat_move(float8, float8), chat_say(text), chat_ban(uuid, int) to authenticated;
