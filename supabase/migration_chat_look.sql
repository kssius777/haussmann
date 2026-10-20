-- =====================================================================
--  Mon personnage, un peu plus de choix (20/10/2026, demande du propriétaire : homme ou femme, blond, « un peu plus de custo,
--  mais minimaliste ») : genre (g), 8 couleurs de cheveux (h), 6 coupes (c), couleur du bas (b), un accessoire (a).
--  Les personnages déjà enregistrés restent valables (g, b, a absents = 0).
--  Salles de 80 au lieu de 40 : on peut maintenant marcher sur tout le Champ-de-Mars. Rejouable sans risque.
-- =====================================================================
create or replace function set_look(p_look jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); l jsonb; r int; k text; v int; lo int; hi int; opt boolean;
begin
  l := '{}'::jsonb;
  foreach k in array array['g', 's', 'h', 'c', 't', 'b', 'a'] loop
    lo := case k when 't' then -1 else 0 end;
    hi := case k when 'g' then 1 when 's' then 5 when 'h' then 7 when 'c' then 5 when 't' then 6 else 4 end;
    opt := k in ('g', 'b', 'a');
    v := case when jsonb_typeof(p_look -> k) = 'number' then (p_look ->> k)::numeric::int else null end;
    if v is null and opt then v := 0; end if;
    if v is null or v < lo or v > hi then raise exception 'Choix de personnage inconnu'; end if;
    l := l || jsonb_build_object(k, v);
  end loop;
  update profiles set look = l where id = u;
  select room into r from place_people where user_id = u;
  if r is not null then perform _chat_emit(r, u, 'look', jsonb_build_object('look', l)); end if;
  return l;
end $$;
revoke all on function set_look(jsonb) from public, anon;
grant execute on function set_look(jsonb) to authenticated;

-- entrer sur le Champ-de-Mars (ou y revenir) : on garde sa salle, sinon la première qui a de la place
create or replace function chat_join(p_lon float8, p_lat float8) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); b timestamptz; r int; lo float8; la float8;
begin
  b := _chat_ban_until(u);
  if b = 'infinity'::timestamptz then raise exception 'Vous êtes banni du chat.'; end if;
  if b is not null then raise exception 'Vous êtes banni du chat jusqu''au %', to_char(b at time zone 'Europe/Paris', 'DD/MM à HH24"h"MI'); end if;
  lo := least(2.3050, greatest(2.2920, coalesce(p_lon, 2.2985)));
  la := least(48.8600, greatest(48.8500, coalesce(p_lat, 48.8556)));
  delete from place_people where seen < now() - interval '90 seconds';
  select room into r from place_people where user_id = u;
  if r is null then
    select min(g) into r from generate_series(1, (select coalesce(max(room), 0) + 1 from place_people)) g
      where (select count(*) from place_people x where x.room = g) < 80;   -- 80 par salle (20/10/2026 : tout le Champ-de-Mars est ouvert)
  end if;
  insert into place_people(user_id, room, lon, lat, seen) values (u, r, lo, la, now())
    on conflict (user_id) do update set room = excluded.room, lon = excluded.lon, lat = excluded.lat, seen = now();
  perform _chat_emit(r, u, 'join', _chat_person(u));
  return json_build_object('room', r, 'me', u, 'people', chat_people(), 'last', coalesce((select max(id) from chat_msg where room = r), 0), 'admin', is_admin());
end $$;
