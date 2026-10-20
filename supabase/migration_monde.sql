-- =====================================================================
--  Monde ouvert, essai dans le 7e (20/10/2026, demande du propriétaire : « on peut se déplacer dans la map en cliquant,
--  un peu comme dans le chat… on cible le 7e, mets ça au niveau de l'onglet chat » ; « pouvoir se déplacer en métro aussi »).
--  Remplace le chat du Champ-de-Mars (mêmes salles de 80, mêmes bulles, même canal temps réel « place:cdm:N ») :
--  on marche dans les rues du 7e (le plan est dans public/data/walk7.json, le site calcule le trajet),
--  quelques km offerts par jour puis on paie au km, on achète l'immeuble devant lequel on s'est arrêté,
--  on prend le métro d'une station à l'autre (un ticket, pas de km). Chiffres provisoires : _world_cfg().
--  Rejouable sans risque.
-- =====================================================================

-- les réglages (provisoires, à valider par le propriétaire)
create or replace function _world_cfg() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'freeKm', 5,            -- km offerts chaque jour
    'kmPrice', 10000,       -- € le km au-delà
    'ticket', 5000,         -- € le ticket de métro (toutes les stations de la zone, changements compris)
    'speed', 40,            -- m/s (vitesse de jeu)
    'maxDur', 30,           -- s : un trajet ne dure jamais plus
    'reach', 90,            -- m : jusqu'où l'on « est devant » un immeuble
    'reachBig', 250,        -- m : pour un monument, un jardin, une place
    'w', 2.2856, 'e', 2.3374, 's', 48.8432, 'n', 48.8664,   -- la zone (le 7e et ses bords)
    'start', jsonb_build_array(2.3002, 48.8546)) $$;           -- première arrivée : le Champ-de-Mars, côté École militaire

-- où chacun se trouve dans le monde (gardé d'une visite à l'autre) et ses km du jour
create table if not exists walkers (
  user_id uuid primary key,
  lon0 float8 not null, lat0 float8 not null,   -- départ du trajet en cours
  lon  float8 not null, lat  float8 not null,   -- arrivée
  t0   timestamptz not null default now(),       -- heure de départ
  dur  float8 not null default 0,                -- durée du trajet (s)
  len  float8 not null default 0,                -- longueur (m)
  day  date,                                     -- jour du compteur (heure de Paris)
  km   float8 not null default 0                 -- km marchés ce jour-là
);
alter table walkers enable row level security;

-- les lignes de métro de la zone, station par station (scripts/make_walk.py)
create table if not exists metro_line (
  line text not null,
  i    int  not null,
  card int  not null,
  primary key (line, i)
);
alter table metro_line enable row level security;
insert into metro_line(line, i, card) values
  ('8', 0, 602931), ('8', 1, 602933), ('8', 2, 602932),
  ('10', 0, 1406574), ('10', 1, 602930), ('10', 2, 602938), ('10', 3, 602936),
  ('12', 0, 602929), ('12', 1, 602937), ('12', 2, 602934), ('12', 3, 602936),
  ('13', 0, 602932), ('13', 1, 602939), ('13', 2, 602935), ('13', 3, 602930)
on conflict (line, i) do update set card = excluded.card;

-- distance en mètres (Paris est petit : on reste à plat)
create or replace function _wm(lo1 float8, la1 float8, lo2 float8, la2 float8) returns float8 language sql immutable as $$
  select sqrt(power((lo2 - lo1) * 73240.0, 2) + power((la2 - la1) * 110574.0, 2)) $$;

-- où l'on est en ce moment (en route : quelque part entre le départ et l'arrivée)
create or replace function _wpos(w walkers) returns float8[] language sql stable as $$
  select case when w.dur <= 0 or now() >= w.t0 + make_interval(secs => w.dur) then array[w.lon, w.lat]
    else array[w.lon0 + (w.lon - w.lon0) * extract(epoch from now() - w.t0) / w.dur,
               w.lat0 + (w.lat - w.lat0) * extract(epoch from now() - w.t0) / w.dur] end $$;

-- ce que coûtent les km au-delà des km offerts
create or replace function _wcost(km float8) returns float8 language sql immutable as $$
  select greatest(0, km - (_world_cfg()->>'freeKm')::float8) * (_world_cfg()->>'kmPrice')::float8 $$;

-- le compteur du jour (remis à zéro à minuit, heure de Paris)
create or replace function _wkm(w walkers) returns float8 language sql stable as $$
  select case when w.day is distinct from paris_today() then 0 else w.km end $$;

create or replace function _wout(u uuid) returns json language sql stable security definer set search_path = public as $$
  select json_build_object('lon', w.lon, 'lat', w.lat, 'km', _wkm(w), 'left', greatest(0, (_world_cfg()->>'freeKm')::float8 - _wkm(w)),
    'walking', w.dur > 0 and now() < w.t0 + make_interval(secs => w.dur))
  from walkers w where w.user_id = u $$;

-- entrer dans le monde (ou y revenir) : on reprend où l'on était ; la première fois, au Champ-de-Mars
-- (ou devant son immeuble si la montgolfière est déjà dans le 7e)
create or replace function world_join() returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); cfg jsonb := _world_cfg(); b timestamptz; r int; w walkers; lo float8; la float8; c cards;
begin
  b := _chat_ban_until(u);
  if b = 'infinity'::timestamptz then raise exception 'Vous êtes banni du chat.'; end if;
  if b is not null then raise exception 'Vous êtes banni du chat jusqu''au %', to_char(b at time zone 'Europe/Paris', 'DD/MM à HH24"h"MI'); end if;
  select * into w from walkers where user_id = u for update;
  if not found then
    select cd.* into c from profiles p join cards cd on cd.id = p.pos where p.id = u;
    if found and c.cx / 1e5 between (cfg->>'w')::float8 and (cfg->>'e')::float8 and c.cy / 1e5 between (cfg->>'s')::float8 and (cfg->>'n')::float8 then
      lo := c.cx / 1e5; la := c.cy / 1e5;
    else   -- un peu au hasard autour du départ, pour ne pas arriver tous au même endroit
      lo := (cfg->'start'->>0)::float8 + (random() - .5) * .0005; la := (cfg->'start'->>1)::float8 + (random() - .5) * .0003; end if;
    insert into walkers(user_id, lon0, lat0, lon, lat, day, km) values (u, lo, la, lo, la, paris_today(), 0) returning * into w;
  end if;
  lo := (_wpos(w))[1]; la := (_wpos(w))[2];
  delete from place_people where seen < now() - interval '90 seconds';
  select room into r from place_people where user_id = u;
  if r is null then
    select min(g) into r from generate_series(1, (select coalesce(max(room), 0) + 1 from place_people)) g
      where (select count(*) from place_people x where x.room = g) < 80;
  end if;
  insert into place_people(user_id, room, lon, lat, seen) values (u, r, w.lon, w.lat, now())
    on conflict (user_id) do update set room = excluded.room, lon = excluded.lon, lat = excluded.lat, seen = now();
  perform _chat_emit(r, u, 'join', _chat_person(u));
  return json_build_object('room', r, 'me', u, 'people', chat_people(), 'last', coalesce((select max(id) from chat_msg where room = r), 0),
    'admin', is_admin(), 'pos', json_build_array(lo, la), 'w', _wout(u), 'cfg', cfg);
end $$;

-- marcher : le site a calculé le trajet dans les rues (p_path, p_len en mètres) ; le serveur compte les km
-- (jamais moins que la ligne droite), fait payer ce qui dépasse les km offerts (seulement si p_pay : le site demande d'abord),
-- et prévient les autres (le trajet part avec, pour qu'ils voient le personnage suivre les rues)
create or replace function world_move(p_lon float8, p_lat float8, p_len float8 default null, p_path jsonb default null, p_pay boolean default false) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); cfg jsonb := _world_cfg(); w walkers; x place_people; pos float8[]; v_len float8; km0 float8; km1 float8;
  rem float8; back bigint; cost bigint; v_dur float8; have bigint; path jsonb := null;
begin
  if p_lon is null or p_lat is null or p_lon < (cfg->>'w')::float8 or p_lon > (cfg->>'e')::float8 or p_lat < (cfg->>'s')::float8 or p_lat > (cfg->>'n')::float8 then
    raise exception 'On ne peut pas aller plus loin pour l''instant'; end if;
  select * into x from place_people where user_id = u for update;
  if not found then raise exception 'Revenez dans le 7e'; end if;
  select * into w from walkers where user_id = u for update;
  if not found then raise exception 'Revenez dans le 7e'; end if;
  km0 := _wkm(w); pos := _wpos(w);
  -- un trajet coupé en route : on rend la part pas marchée (km, et l'argent si on avait payé)
  if w.day = paris_today() and w.dur > 0 and now() < w.t0 + make_interval(secs => w.dur) then
    rem := w.len * (1 - extract(epoch from now() - w.t0) / w.dur) / 1000;
    back := floor(round((_wcost(km0) - _wcost(greatest(0, km0 - rem)))::numeric, 2));
    km0 := greatest(0, km0 - rem);
    if back > 0 then perform _sync(u); update profiles set cash = cash + back where id = u; perform _log(u, 'walk', back, 'Trajet écourté'); end if;
  end if;
  v_len := greatest(coalesce(p_len, 0), _wm(pos[1], pos[2], p_lon, p_lat));
  if v_len > 8000 then raise exception 'Trop loin d''un coup'; end if;
  km1 := km0 + v_len / 1000;
  cost := ceil(round((_wcost(km1) - _wcost(km0))::numeric, 2));   -- (arrondi : 0,3 km = 3 000 €, pas 3 001)
  if cost > 0 then
    if not coalesce(p_pay, false) then raise exception 'PAYER:%', cost; end if;   -- le site affiche le prix et redemande avec p_pay
    perform _sync(u);
    select p.cash into have from profiles p where p.id = u for update;
    if have < cost then raise exception 'Pas assez d''argent : ce trajet coûte % €', cost; end if;
    update profiles set cash = cash - cost where id = u;
    perform _log(u, 'walk', -cost, 'Marche · ' || replace(to_char(v_len / 1000, 'FM990.0'), '.', ',') || ' km');
  end if;
  v_dur := least((cfg->>'maxDur')::float8, greatest(1, v_len / (cfg->>'speed')::float8));
  update walkers set lon0 = pos[1], lat0 = pos[2], lon = p_lon, lat = p_lat, t0 = now(), dur = v_dur, len = v_len, km = km1, day = paris_today() where user_id = u;
  update place_people set lon = p_lon, lat = p_lat, seen = now() where user_id = u;
  update profiles set land = null where id = u and land is not null;   -- on est parti : on n'est plus devant l'immeuble
  if jsonb_typeof(p_path) = 'array' and jsonb_array_length(p_path) between 2 and 400 then path := p_path; end if;
  perform _chat_emit(x.room, u, 'move', jsonb_build_object('lon', p_lon, 'lat', p_lat, 'dur', v_dur) || case when path is null then '{}'::jsonb else jsonb_build_object('path', path) end);
  return json_build_object('dur', v_dur, 'len', v_len, 'cost', cost, 'back', coalesce(back, 0), 'w', _wout(u));
end $$;

-- arrivé devant un immeuble (ou un lieu) : on peut l'acheter comme une case du dé (la montgolfière y est aussi)
create or replace function world_arrive(p_card int) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); cfg jsonb := _world_cfg(); w walkers; c cards; d float8;
begin
  select * into w from walkers where user_id = u;
  if not found then raise exception 'Revenez dans le 7e'; end if;
  if w.dur > 0 and now() < w.t0 + make_interval(secs => greatest(0, w.dur - 2)) then raise exception 'Vous n''êtes pas encore arrivé'; end if;
  select * into c from cards where id = p_card;
  if not found then raise exception 'Bien inconnu'; end if;
  d := _wm(w.lon, w.lat, c.cx / 1e5, c.cy / 1e5);
  -- un monument, un jardin, une place : on peut être un peu plus loin ; une station, c'est un point (comme un immeuble)
  if d > (case when c.lk = 'p' and not exists (select 1 from spots s where s.card = c.id and s.kind = 'm') then cfg->>'reachBig' else cfg->>'reach' end)::float8 then
    raise exception 'Approchez-vous encore'; end if;
  update profiles set land = p_card, pos = p_card, pend = null, pend_die = null where id = u;
  return state();
end $$;

-- le métro : depuis la station où l'on est, vers n'importe quelle station de la zone (un ticket, changements compris)
create or replace function world_metro(p_to int) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); cfg jsonb := _world_cfg(); w walkers; x place_people; here int; dh float8; t cards; cost bigint; have bigint;
begin
  select * into x from place_people where user_id = u for update;
  if not found then raise exception 'Revenez dans le 7e'; end if;
  select * into w from walkers where user_id = u for update;
  if not found then raise exception 'Revenez dans le 7e'; end if;
  if w.dur > 0 and now() < w.t0 + make_interval(secs => greatest(0, w.dur - 2)) then raise exception 'Attendez d''être arrivé'; end if;
  select m.card, _wm(w.lon, w.lat, c.cx / 1e5, c.cy / 1e5) into here, dh
    from (select distinct card from metro_line) m join cards c on c.id = m.card order by 2 limit 1;
  if here is null or dh > (cfg->>'reach')::float8 + 30 then raise exception 'Allez d''abord jusqu''à une station'; end if;
  if not exists (select 1 from metro_line where card = p_to) then raise exception 'Cette station n''est pas encore ouverte'; end if;
  if p_to = here then raise exception 'Vous y êtes déjà'; end if;
  cost := (cfg->>'ticket')::bigint;
  perform _sync(u);
  select p.cash into have from profiles p where p.id = u for update;
  if have < cost then raise exception 'Pas assez d''argent pour le ticket (% €)', cost; end if;
  update profiles set cash = cash - cost, land = p_to, pos = p_to, pend = null, pend_die = null where id = u;
  perform _log(u, 'metro', -cost, 'Ticket de métro', p_to);
  select * into t from cards where id = p_to;
  update walkers set lon0 = t.cx / 1e5, lat0 = t.cy / 1e5, lon = t.cx / 1e5, lat = t.cy / 1e5, t0 = now(), dur = 0, len = 0 where user_id = u;
  update place_people set lon = t.cx / 1e5, lat = t.cy / 1e5, seen = now() where user_id = u;
  perform _chat_emit(x.room, u, 'move', jsonb_build_object('lon', t.cx / 1e5, 'lat', t.cy / 1e5, 'metro', true));
  return json_build_object('from', here, 'to', p_to, 'w', _wout(u), 'state', state());
end $$;

revoke all on function _world_cfg(), _wm(float8, float8, float8, float8), _wpos(walkers), _wcost(float8), _wkm(walkers), _wout(uuid) from public, anon, authenticated;
revoke all on function world_join(), world_move(float8, float8, float8, jsonb, boolean), world_arrive(int), world_metro(int) from public, anon;
grant execute on function world_join(), world_move(float8, float8, float8, jsonb, boolean), world_arrive(int), world_metro(int) to authenticated;
