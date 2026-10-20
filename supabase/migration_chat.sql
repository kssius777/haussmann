-- =====================================================================
--  Le chat du Champ-de-Mars (20/10/2026, validé par le propriétaire sur maquette).
--  On s'y promène avec son personnage (pseudo au-dessus de la tête), on parle, les bulles s'effacent
--  au bout de quelques secondes. Salles de 40 personnes au plus (Champ-de-Mars 1, 2…).
--  Tout passe par ces fonctions : c'est le serveur qui signe chaque message (personne ne peut parler
--  à la place d'un autre), le garde 2 minutes (chat_msg) et l'envoie en temps réel sur le canal privé
--  « place:cdm:N » (realtime.send) ; les joueurs ne peuvent que recevoir sur ce canal.
--  Si le temps réel ne répond pas, le site relit chat_feed() toutes les 2 s.
--  L'admin peut bannir 24 h ou à vie (chat_ban). Le personnage (peau, cheveux, coupe, haut) est dans profiles.look.
--  Rejouable sans risque.
-- =====================================================================
alter table profiles add column if not exists look jsonb;

create table if not exists chat_bans (
  user_id uuid primary key,
  until   timestamptz,                 -- null = à vie
  by_user uuid,
  at      timestamptz not null default now()
);
alter table chat_bans enable row level security;

create table if not exists place_people (
  user_id uuid primary key,
  room    int not null default 1,
  lon     float8 not null,
  lat     float8 not null,
  seen    timestamptz not null default now(),
  said_at timestamptz
);
alter table place_people enable row level security;
create index if not exists place_people_room on place_people(room, seen);

create table if not exists chat_msg (
  id      bigserial primary key,
  room    int not null,
  user_id uuid not null,
  kind    text not null,               -- join | move | say | look | leave | kick
  data    jsonb not null default '{}',
  at      timestamptz not null default now()
);
alter table chat_msg enable row level security;
create index if not exists chat_msg_room on chat_msg(room, id);
create index if not exists chat_msg_at on chat_msg(at);

-- banni ? null = non ; 'infinity' = à vie ; sinon jusqu'à quand
create or replace function _chat_ban_until(u uuid) returns timestamptz language sql stable as $$
  select case when b.until is null then 'infinity'::timestamptz else b.until end
  from chat_bans b where b.user_id = u and (b.until is null or b.until > now()) $$;

-- ce que les autres voient de quelqu'un sur la pelouse
create or replace function _chat_person(u uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('id', p.id, 'pseudo', p.pseudo, 'party', p.party, 'look', p.look, 'lon', x.lon, 'lat', x.lat)
  from profiles p join place_people x on x.user_id = p.id where p.id = u $$;

-- un évènement de la salle : gardé 2 minutes, et envoyé en temps réel si c'est possible
create or replace function _chat_emit(p_room int, p_user uuid, p_kind text, p_data jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare i bigint;
begin
  insert into chat_msg(room, user_id, kind, data) values (p_room, p_user, p_kind, coalesce(p_data, '{}')) returning id into i;
  delete from chat_msg where at < now() - interval '2 minutes';
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    begin
      execute 'select realtime.send($1, $2, $3, true)'
        using jsonb_build_object('e', i, 'k', p_kind, 'u', p_user, 'd', coalesce(p_data, '{}')), 'ev', 'place:cdm:' || p_room;
    exception when others then null;   -- le temps réel ne doit jamais bloquer le chat : le site relit chat_feed()
    end;
  end if;
  return i;
end $$;

-- les gens présents dans ma salle (vus il y a moins de 90 s)
create or replace function chat_people() returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); r int;
begin
  select room into r from place_people where user_id = u;
  if r is null then return '[]'; end if;
  return coalesce((select json_agg(_chat_person(x.user_id)) from place_people x where x.room = r and x.seen > now() - interval '90 seconds'), '[]');
end $$;

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
      where (select count(*) from place_people x where x.room = g) < 40;
  end if;
  insert into place_people(user_id, room, lon, lat, seen) values (u, r, lo, la, now())
    on conflict (user_id) do update set room = excluded.room, lon = excluded.lon, lat = excluded.lat, seen = now();
  perform _chat_emit(r, u, 'join', _chat_person(u));
  return json_build_object('room', r, 'me', u, 'people', chat_people(), 'last', coalesce((select max(id) from chat_msg where room = r), 0), 'admin', is_admin());
end $$;

-- marcher : on touche la pelouse, le personnage y va
create or replace function chat_move(p_lon float8, p_lat float8) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); x place_people; lo float8; la float8;
begin
  select * into x from place_people where user_id = u for update;
  if not found then raise exception 'Revenez sur le Champ-de-Mars'; end if;
  lo := least(2.3050, greatest(2.2920, p_lon)); la := least(48.8600, greatest(48.8500, p_lat));
  update place_people set lon = lo, lat = la, seen = now() where user_id = u;
  perform _chat_emit(x.room, u, 'move', jsonb_build_object('lon', lo, 'lat', la));
end $$;

-- parler : 120 caractères au plus, un message par seconde
create or replace function chat_say(p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); x place_people; t text;
begin
  if _chat_ban_until(u) is not null then raise exception 'Vous êtes banni du chat.'; end if;
  select * into x from place_people where user_id = u for update;
  if not found then raise exception 'Revenez sur le Champ-de-Mars'; end if;
  t := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  if t = '' then return; end if;
  t := left(t, 120);
  if x.said_at is not null and x.said_at > now() - interval '1 second' then raise exception 'Doucement : un message par seconde.'; end if;
  update place_people set said_at = now(), seen = now() where user_id = u;
  perform _chat_emit(x.room, u, 'say', jsonb_build_object('t', t));
end $$;

-- toujours là (toutes les 25 s) ; renvoie le nombre de gens dans la salle
create or replace function chat_ping() returns int
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); r int;
begin
  update place_people set seen = now() where user_id = u returning room into r;
  if r is null then raise exception 'Revenez sur le Champ-de-Mars'; end if;
  return (select count(*) from place_people where room = r and seen > now() - interval '90 seconds');
end $$;

create or replace function chat_leave() returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); r int;
begin
  delete from place_people where user_id = u returning room into r;
  if r is not null then perform _chat_emit(r, u, 'leave', '{}'); end if;
end $$;

-- les évènements de ma salle depuis le dernier vu (quand le temps réel ne répond pas)
create or replace function chat_feed(p_since bigint) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); r int;
begin
  update place_people set seen = now() where user_id = u returning room into r;
  if r is null then return json_build_object('gone', true, 'ev', '[]'::json); end if;
  return json_build_object('ev', coalesce((select json_agg(json_build_object('e', m.id, 'k', m.kind, 'u', m.user_id, 'd', m.data) order by m.id)
    from (select * from chat_msg where room = r and id > coalesce(p_since, 0) order by id limit 300) m), '[]'));
end $$;

-- combien de joueurs sur le Champ-de-Mars en ce moment (la pastille verte)
create or replace function chat_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from place_people where seen > now() - interval '90 seconds' $$;

-- admin : bannir 24 h (p_hours) ou à vie (p_hours null), débannir, la liste
create or replace function chat_bans() returns json
language plpgsql security definer set search_path = public as $$
declare a uuid := _need_admin();
begin
  return coalesce((select json_agg(json_build_object('id', b.user_id, 'pseudo', p.pseudo, 'until', b.until, 'at', b.at) order by b.at desc)
    from chat_bans b left join profiles p on p.id = b.user_id where b.until is null or b.until > now()), '[]');
end $$;

create or replace function chat_ban(p_user uuid, p_hours int default 24) returns json
language plpgsql security definer set search_path = public as $$
declare a uuid := _need_admin(); r int;
begin
  if p_user = a then raise exception 'Vous ne pouvez pas vous bannir vous-même'; end if;
  if exists (select 1 from admins where id = p_user) then raise exception 'On ne bannit pas un admin'; end if;
  insert into chat_bans(user_id, until, by_user, at) values (p_user, case when p_hours is null then null else now() + make_interval(hours => p_hours) end, a, now())
    on conflict (user_id) do update set until = excluded.until, by_user = excluded.by_user, at = now();
  delete from place_people where user_id = p_user returning room into r;
  if r is not null then perform _chat_emit(r, p_user, 'kick', jsonb_build_object('h', p_hours)); end if;
  return chat_bans();
end $$;

create or replace function chat_unban(p_user uuid) returns json
language plpgsql security definer set search_path = public as $$
declare a uuid := _need_admin();
begin
  delete from chat_bans where user_id = p_user;
  return chat_bans();
end $$;

-- son personnage : s peau (0-5), h cheveux (0-5), c coupe (0-2), t haut (-1 = couleur du parti, 0-6)
create or replace function set_look(p_look jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); l jsonb; r int;
  pick int[]; k text; v int;
begin
  l := '{}'::jsonb;
  foreach k in array array['s', 'h', 'c', 't'] loop
    pick := case k when 's' then array[0, 5] when 'h' then array[0, 5] when 'c' then array[0, 2] else array[-1, 6] end;
    v := case when jsonb_typeof(p_look -> k) = 'number' then (p_look ->> k)::numeric::int else null end;
    if v is null or v < pick[1] or v > pick[2] then raise exception 'Choix de personnage inconnu'; end if;
    l := l || jsonb_build_object(k, v);
  end loop;
  update profiles set look = l where id = u;
  select room into r from place_people where user_id = u;
  if r is not null then perform _chat_emit(r, u, 'look', jsonb_build_object('look', l)); end if;
  return l;
end $$;

revoke all on function _chat_ban_until(uuid), _chat_person(uuid), _chat_emit(int, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function chat_people(), chat_join(float8, float8), chat_move(float8, float8), chat_say(text), chat_ping(), chat_leave(), chat_feed(bigint),
  chat_count(), chat_bans(), chat_ban(uuid, int), chat_unban(uuid), set_look(jsonb) from public, anon;
grant execute on function chat_people(), chat_join(float8, float8), chat_move(float8, float8), chat_say(text), chat_ping(), chat_leave(), chat_feed(bigint),
  chat_count(), chat_bans(), chat_ban(uuid, int), chat_unban(uuid), set_look(jsonb) to authenticated;

-- temps réel : sur le canal privé du chat, les joueurs connectés reçoivent (et personne ne peut y écrire
-- directement : seul le serveur envoie). Si cette partie de Supabase n'existe pas, on passe (le site relira chat_feed).
do $$
begin
  if to_regclass('realtime.messages') is not null then
    begin
      execute 'drop policy if exists "chat : les joueurs reçoivent" on realtime.messages';
      execute $q$create policy "chat : les joueurs reçoivent" on realtime.messages for select to authenticated
               using ((select realtime.topic()) like 'place:cdm:%')$q$;
    exception when others then raise notice 'chat : politique temps réel non créée (%)', sqlerrm;
    end;
  end if;
end $$;
