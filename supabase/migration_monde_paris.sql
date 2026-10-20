-- =====================================================================
--  Le monde ouvert sur tout Paris devient le jeu (20/10/2026, demande du propriétaire : « à partir de maintenant, ça devient
--  l'endroit principal, implémente tout Paris ; la zone chat n'existe plus ; le dé n'existe plus non plus »).
--  Règles choisies par le propriétaire le même jour :
--   · salaire au km marché : 20 000 € par km, seulement sur les 5 km offerts du jour (Gauche : doublé) ;
--   · péage en passant : devant l'immeuble d'un autre joueur, on lui paie une petite part de son loyer du jour
--     (Extrême gauche paie moitié, Extrême droite encaisse +50 %), compté sur le trajet vraiment marché, à l'arrivée ;
--   · cartes Chance : des « ? » près des stations, jardins et places (30 % chaque jour), une fois par jour chacun ;
--   · km du jour : 5 offerts, puis 10 000 € le km ; métro : un ticket, toutes les lignes dans Paris.
--  Et : on achète un immeuble à portée (120 m, 300 m pour un monument, un jardin, une place), même en marchant ;
--  on voit les gens par carrés d'environ 1 km (canal temps réel privé « w:N ») ; on peut couper le chat (profiles.chat_off) ;
--  le dé est retiré (roll, go_to, buy_rolls refusent). Chiffres dans _world_cfg(). Rejouable sans risque.
-- =====================================================================

create or replace function _world_cfg() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'freeKm', 5, 'kmPrice', 10000, 'salary', 20000, 'ticket', 5000,
    'speed', 40, 'maxDur', 30,
    'reach', 120, 'reachBig', 300,
    'toll', 0.05, 'tollR', 22, 'tollCap', 0.1,
    'chanceR', 40, 'chancePct', 30,
    'w', 2.210, 'e', 2.480, 's', 48.805, 'n', 48.910,
    'start', jsonb_build_array(2.3488, 48.8530)) $$;   -- (si l'on n'a pas encore de position : devant Notre-Dame)

alter table walkers add column if not exists path jsonb;
alter table walkers add column if not exists settled boolean not null default true;
alter table profiles add column if not exists chat_off boolean not null default false;
create index if not exists cards_cx on cards(cx);

-- qui est où, par carré d'environ 1 km (on ne reçoit que les carrés autour de ce qu'on regarde)
create table if not exists world_people (
  user_id uuid primary key,
  cell    int not null,
  lon     float8 not null,
  lat     float8 not null,
  seen    timestamptz not null default now(),
  said_at timestamptz
);
alter table world_people enable row level security;
create index if not exists world_people_cell on world_people(cell, seen);

-- les « ? » déjà ramassés aujourd'hui
create table if not exists chance_taken (
  user_id uuid not null,
  day     date not null,
  card    int  not null,
  at      timestamptz not null default now(),
  primary key (user_id, day, card)
);
alter table chance_taken enable row level security;

-- le métro dans Paris : chaque ligne, branche par branche, station par station (scripts/make_walk.py → walk.json)
create table if not exists metro_stop (
  line text not null,
  b    int  not null,
  i    int  not null,
  card int  not null,
  primary key (line, b, i)
);
alter table metro_stop enable row level security;
truncate metro_stop;   -- (pas « delete from » sans where : Supabase le refuse, extension pg-safeupdate)
insert into metro_stop(line, b, i, card) values
('1',0,0,1506832),
('1',0,1,1506816),
('1',0,2,703299),
('1',0,3,703304),
('1',0,4,703303),
('1',0,5,703298),
('1',0,6,703300),
('1',0,7,1585),
('1',0,8,1582),
('1',0,9,1581),
('1',0,10,1578),
('1',0,11,301902),
('1',0,12,301904),
('1',0,13,1103959),
('1',0,14,1103965),
('1',0,15,1103973),
('1',0,16,1103968),
('1',0,17,1905318),
('2',0,0,1506830),
('2',0,1,1506836),
('2',0,2,703299),
('2',0,3,703312),
('2',0,4,703301),
('2',0,5,703308),
('2',0,6,1606055),
('2',0,7,1606054),
('2',0,8,1706100),
('2',0,9,1706092),
('2',0,10,803154),
('2',0,11,803146),
('2',0,12,902918),
('2',0,13,1706096),
('2',0,14,1804273),
('2',0,15,1804265),
('2',0,16,902922),
('2',0,17,1905308),
('2',0,18,1004565),
('2',0,19,1004569),
('2',0,20,1905314),
('2',0,21,1905315),
('2',0,22,1004561),
('2',0,23,1004562),
('2',0,24,1103968),
('3',0,0,1606051),
('3',0,1,1606049),
('3',0,2,1606056),
('3',0,3,1606048),
('3',0,4,1606055),
('3',0,5,703302),
('3',0,6,703310),
('3',0,7,803150),
('3',0,8,803153),
('3',0,9,101897),
('3',0,10,101896),
('3',0,11,101899),
('3',0,12,101898),
('3',0,13,202033),
('3',0,14,202039),
('3',0,15,202037),
('3',0,16,1004571),
('3',0,17,1004574),
('3',0,18,1905314),
('3',0,19,1905310),
('3',0,20,1905316),
('3bis',0,0,1905310),
('3bis',0,1,1905313),
('3bis',0,2,1905321),
('3bis',0,3,1905319),
('4',0,0,1706101),
('4',0,1,1706103),
('4',0,2,1706098),
('4',0,3,1706093),
('4',0,4,902918),
('4',0,5,902924),
('4',0,6,902923),
('4',0,7,902920),
('4',0,8,101900),
('4',0,9,101898),
('4',0,10,1579),
('4',0,11,1580),
('4',0,12,1578),
('4',0,13,301901),
('4',0,14,502593),
('4',0,15,502590),
('4',0,16,502592),
('4',0,17,502595),
('4',0,18,502594),
('4',0,19,1406571),
('4',0,20,1304781),
('4',0,21,1304779),
('4',0,22,1304771),
('4',0,23,1304774),
('4',0,24,1304770),
('4',0,25,1304777),
('5',0,0,1804270),
('5',0,1,1804267),
('5',0,2,1804266),
('5',0,3,1804265),
('5',0,4,1804273),
('5',0,5,902924),
('5',0,6,902923),
('5',0,7,902925),
('5',0,8,202037),
('5',0,9,1004570),
('5',0,10,1004572),
('5',0,11,1004563),
('5',0,12,1103959),
('5',0,13,1103972),
('5',0,14,1204458),
('5',0,15,1204469),
('5',0,16,1204455),
('5',0,17,1204464),
('6',0,0,703299),
('6',0,1,1506823),
('6',0,2,1506817),
('6',0,3,1506835),
('6',0,4,1506828),
('6',0,5,1406559),
('6',0,6,1406565),
('6',0,7,1406569),
('6',0,8,1406561),
('6',0,9,1406575),
('6',0,10,1406572),
('6',0,11,1406571),
('6',0,12,1304772),
('6',0,13,1304779),
('6',0,14,1304771),
('6',0,15,1304780),
('6',0,16,1204459),
('6',0,17,1204457),
('6',0,18,1204464),
('6',0,19,1204462),
('6',0,20,1204456),
('6',0,21,1204468),
('6',0,22,1103961),
('6',0,23,1103964),
('6',0,24,1103963),
('6',0,25,1103960),
('6',0,26,1103969),
('6',0,27,1103968),
('7',0,0,1804269),
('7',0,1,1804262),
('7',0,2,1804263),
('7',0,3,1804272),
('7',0,4,1804273),
('7',0,5,902926),
('7',0,6,902921),
('7',0,7,902923),
('7',0,8,803155),
('7',0,9,803147),
('7',0,10,803151),
('7',0,11,803148),
('7',0,12,803153),
('7',0,13,1584),
('7',0,14,1582),
('7',0,15,1583),
('7',0,16,1578),
('7',0,17,301903),
('7',0,18,301905),
('7',0,19,402731),
('7',0,20,402733),
('7',0,21,402729),
('7',0,22,1204460),
('7',0,23,1204464),
('7',0,24,1204470),
('7',0,25,1204461),
('7',0,26,1204465),
('7',1,0,1204461),
('7',1,1,1204467),
('7',1,2,1204466),
('7bis',0,0,902926),
('7bis',0,1,1804265),
('7bis',0,2,1804259),
('7bis',0,3,1804261),
('7bis',0,4,1804260),
('7bis',0,5,1804268),
('7bis',0,6,1804271),
('7bis',0,7,1804264),
('7bis',0,8,1804260),
('8',0,0,1406558),
('8',0,1,1406570),
('8',0,2,1406560),
('8',0,3,1406567),
('8',0,4,1406563),
('8',0,5,1406569),
('8',0,6,602931),
('8',0,7,602933),
('8',0,8,602932),
('8',0,9,703300),
('8',0,10,703306),
('8',0,11,803153),
('8',0,12,803156),
('8',0,13,803149),
('8',0,14,902919),
('8',0,15,101900),
('8',0,16,202037),
('8',0,17,202035),
('8',0,18,202038),
('8',0,19,202034),
('8',0,20,1103959),
('8',0,21,1004568),
('8',0,22,1004566),
('8',0,23,1103973),
('8',0,24,1103967),
('8',0,25,1103963),
('8',0,26,1103966),
('8',0,27,1103971),
('8',0,28,1103970),
('9',0,0,1506831),
('9',0,1,1506820),
('9',0,2,1506826),
('9',0,3,1506825),
('9',0,4,1506822),
('9',0,5,1506833),
('9',0,6,1506824),
('9',0,7,1506834),
('9',0,8,1506835),
('9',0,9,1506821),
('9',0,10,703297),
('9',0,11,703303),
('9',0,12,703311),
('9',0,13,703307),
('9',0,14,703309),
('9',0,15,803150),
('9',0,16,803148),
('9',0,17,803156),
('9',0,18,803149),
('9',0,19,902919),
('9',0,20,101900),
('9',0,21,202037),
('9',0,22,1004570),
('9',0,23,1004575),
('9',0,24,1004576),
('9',0,25,1004564),
('9',0,26,1004573),
('9',0,27,1103968),
('9',0,28,1905309),
('9',0,29,1905312),
('9',0,30,1905317),
('10',0,0,1506829),
('10',0,1,1506825),
('10',0,2,1506819),
('10',0,3,1406568),
('10',1,0,1506826),
('10',1,1,1506818),
('10',1,2,1506827),
('10',1,3,1406568),
('10',1,4,1406562),
('10',1,5,1406557),
('10',1,6,1406569),
('10',1,7,1406574),
('10',1,8,602930),
('10',1,9,602938),
('10',1,10,602936),
('10',1,11,502588),
('10',1,12,502590),
('10',1,13,402730),
('10',1,14,402732),
('10',1,15,402728),
('10',1,16,402731),
('10',1,17,1204458),
('11',0,0,1578),
('11',0,1,301902),
('11',0,2,202036),
('11',0,3,202033),
('11',0,4,202037),
('11',0,5,1004567),
('11',0,6,1905308),
('11',0,7,1905320),
('11',0,8,1905311),
('11',0,9,1804268),
('11',0,10,1905322),
('11',0,11,1905319),
('12',0,0,1706102),
('12',0,1,1706099),
('12',0,2,1706098),
('12',0,3,1706095),
('12',0,4,1706097),
('12',0,5,1706091),
('12',0,6,803154),
('12',0,7,803157),
('12',0,8,803152),
('12',0,9,803158),
('12',0,10,703310),
('12',0,11,703306),
('12',0,12,703300),
('12',0,13,602929),
('12',0,14,602937),
('12',0,15,602934),
('12',0,16,602936),
('12',0,17,502591),
('12',0,18,502589),
('12',0,19,1406571),
('12',0,20,1406566),
('12',0,21,1406572),
('12',0,22,1406577),
('12',0,23,1406576),
('12',0,24,1406564),
('12',0,25,1406573),
('13',0,0,1606053),
('13',0,1,1706094),
('13',0,2,1606047),
('13',1,0,1606052),
('13',1,1,1606046),
('13',1,2,1606047),
('13',1,3,1706100),
('13',1,4,703305),
('13',1,5,703310),
('13',1,6,703307),
('13',1,7,703298),
('13',1,8,602932),
('13',1,9,602939),
('13',1,10,602935),
('13',1,11,602930),
('13',1,12,1406571),
('13',1,13,1304773),
('13',1,14,1304775),
('13',1,15,1304776),
('13',1,16,1304778),
('14',0,0,1606052),
('14',0,1,1606050),
('14',0,2,703310),
('14',0,3,703306),
('14',0,4,1584),
('14',0,5,1578),
('14',0,6,1103965),
('14',0,7,1103961),
('14',0,8,1103962),
('14',0,9,1204454),
('14',0,10,1204463),
('14',0,11,1204461)
;

-- le carré (≈ 1 km) d'un point
create or replace function _wcell(lo float8, la float8) returns int language sql immutable as $$
  select 10000 + floor((lo - 2.20) / 0.0137)::int * 100 + floor((la - 48.80) / 0.009)::int $$;

-- distance d'un point à un segment, en mètres (Paris est petit : on reste à plat)
create or replace function _wsegd(px float8, py float8, ax float8, ay float8, bx float8, by_ float8) returns float8 language sql immutable as $$
  select sqrt(power((px - (ax + t * (bx - ax))) * 73240, 2) + power((py - (ay + t * (by_ - ay))) * 110574, 2)) from (
    select case when dd = 0 then 0 else greatest(0, least(1, ((px - ax) * 73240 * (bx - ax) * 73240 + (py - ay) * 110574 * (by_ - ay) * 110574) / dd)) end t
    from (select power((bx - ax) * 73240, 2) + power((by_ - ay) * 110574, 2) dd) q) r $$;

-- longueur d'un trajet (liste de [lon, lat])
create or replace function _wplen(p jsonb) returns float8 language sql immutable as $$
  select coalesce(sum(_wm((a.e->>0)::float8, (a.e->>1)::float8, (b.e->>0)::float8, (b.e->>1)::float8)), 0)
  from jsonb_array_elements(p) with ordinality a(e, i) join jsonb_array_elements(p) with ordinality b(e, i) on b.i = a.i + 1 $$;

-- où l'on est en ce moment : en route, au bon endroit du trajet (à vitesse constante, comme à l'écran)
create or replace function _wpos(w walkers) returns float8[] language plpgsql stable as $$
declare f float8; tot float8; target float8; acc float8 := 0; n int; ax float8; ay float8; bx float8; by_ float8; d float8;
begin
  if w.dur <= 0 or now() >= w.t0 + make_interval(secs => w.dur) then return array[w.lon, w.lat]; end if;
  f := greatest(0, extract(epoch from now() - w.t0) / w.dur);
  if w.path is null or jsonb_array_length(w.path) < 2 then
    return array[w.lon0 + (w.lon - w.lon0) * f, w.lat0 + (w.lat - w.lat0) * f];
  end if;
  n := jsonb_array_length(w.path); tot := _wplen(w.path); target := f * tot;
  for i in 0 .. n - 2 loop
    ax := (w.path->i->>0)::float8; ay := (w.path->i->>1)::float8; bx := (w.path->(i + 1)->>0)::float8; by_ := (w.path->(i + 1)->>1)::float8;
    d := _wm(ax, ay, bx, by_);
    if acc + d >= target then
      if d <= 0 then return array[ax, ay]; end if;
      return array[ax + (bx - ax) * (target - acc) / d, ay + (by_ - ay) * (target - acc) / d];
    end if;
    acc := acc + d;
  end loop;
  return array[w.lon, w.lat];
end $$;

-- ce que les autres voient de quelqu'un ; s'il marche, son trajet (pour le voir avancer)
create or replace function _wperson(u uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('id', p.id, 'pseudo', p.pseudo, 'party', p.party, 'look', p.look, 'lon', x.lon, 'lat', x.lat, 'cell', x.cell)
    || coalesce((select jsonb_build_object('path', w.path, 'dur', w.dur, 'el', extract(epoch from now() - w.t0))
                 from walkers w where w.user_id = u and w.path is not null and w.dur > 0 and now() < w.t0 + make_interval(secs => w.dur)), '{}'::jsonb)
  from profiles p join world_people x on x.user_id = p.id where p.id = u $$;

-- un évènement du monde : gardé 2 minutes (pour ceux qui n'ont pas le temps réel) et envoyé sur le canal du carré
create or replace function _wemit(p_cell int, p_user uuid, p_kind text, p_data jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare i bigint;
begin
  insert into chat_msg(room, user_id, kind, data) values (p_cell, p_user, p_kind, coalesce(p_data, '{}')) returning id into i;
  delete from chat_msg where at < now() - interval '2 minutes';
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    begin
      execute 'select realtime.send($1, $2, $3, true)'
        using jsonb_build_object('e', i, 'k', p_kind, 'u', p_user, 'c', p_cell, 'd', coalesce(p_data, '{}')), 'ev', 'w:' || p_cell;
    exception when others then null;   -- le temps réel ne doit jamais bloquer le jeu : le site relit world_feed()
    end;
  end if;
  return i;
end $$;

-- le compteur du jour et la position, pour le site
create or replace function _wout(u uuid) returns json language sql stable security definer set search_path = public as $$
  select json_build_object('lon', w.lon, 'lat', w.lat, 'km', _wkm(w), 'left', greatest(0, (_world_cfg()->>'freeKm')::float8 - _wkm(w)),
    'walking', w.dur > 0 and now() < w.t0 + make_interval(secs => w.dur))
  from walkers w where w.user_id = u $$;

-- le salaire de la marche : seulement sur les km offerts du jour
create or replace function _wsal(km float8, party text) returns float8 language sql immutable as $$
  select least(greatest(km, 0), (_world_cfg()->>'freeKm')::float8) * (_world_cfg()->>'salary')::float8 * case when party = 'tendue' then 2 else 1 end $$;

-- le péage du trajet qu'on vient de marcher (ou de la partie marchée) : chaque immeuble d'un autre joueur
-- dont on est passé tout près (22 m) lui rapporte une part de son loyer du jour ; plafonné à 10 % de la trésorerie
create or replace function _wsettle(u uuid) returns jsonb language plpgsql as $$
declare w walkers; cfg jsonb := _world_cfg(); f float8; me text; rr float8; v_rate numeric; tot numeric := 0; cap numeric; ratio numeric := 1; o record;
  payees jsonb := '[]'; nb int := 0;
begin
  select * into w from walkers where user_id = u for update;
  if not found then return jsonb_build_object('toll', 0, 'n', 0, 'payees', '[]'::jsonb); end if;
  if w.settled then return jsonb_build_object('toll', 0, 'n', 0, 'payees', '[]'::jsonb); end if;
  update walkers set settled = true where user_id = u;
  if w.path is null or jsonb_array_length(w.path) < 2 then return jsonb_build_object('toll', 0, 'n', 0, 'payees', '[]'::jsonb); end if;
  f := case when w.dur <= 0 then 1 else least(1, greatest(0, extract(epoch from now() - w.t0) / w.dur)) end;
  me := _party(u); rr := (cfg->>'tollR')::float8; v_rate := (cfg->>'toll')::numeric;
  create temp table if not exists _wtoll(owner uuid, card int, amt numeric) on commit drop;
  truncate _wtoll;
  insert into _wtoll
  with p as (select i, (e->>0)::float8 lo, (e->>1)::float8 la from jsonb_array_elements(w.path) with ordinality t(e, i)),
       s as (select a.i, a.lo ax, a.la ay, b.lo bx, b.la by_, _wm(a.lo, a.la, b.lo, b.la) len from p a join p b on b.i = a.i + 1),
       s2 as (select s.*, sum(len) over (order by i) - len s0, sum(len) over () ptot from s),
       -- la partie vraiment marchée : les segments déjà parcourus, le dernier coupé là où l'on en est
       sw as (select i, ax, ay,
                     case when s0 + len <= f * ptot or len = 0 then bx else ax + (bx - ax) * (f * ptot - s0) / len end bx,
                     case when s0 + len <= f * ptot or len = 0 then by_ else ay + (by_ - ay) * (f * ptot - s0) / len end by_
              from s2 where s0 < f * ptot),
       bb as (select min(least(ax, bx)) - rr / 73240 x0, max(greatest(ax, bx)) + rr / 73240 x1,
                     min(least(ay, by_)) - rr / 110574 y0, max(greatest(ay, by_)) + rr / 110574 y1 from sw),
       cand as (select c.id, c.rent, c.cx / 1e5 lo, c.cy / 1e5 la from cards c, bb
                where c.cx between floor(bb.x0 * 1e5) and ceil(bb.x1 * 1e5) and c.cy between floor(bb.y0 * 1e5) and ceil(bb.y1 * 1e5)),
       near as (select cand.* from cand where exists (select 1 from sw where _wsegd(cand.lo, cand.la, sw.ax, sw.ay, sw.bx, sw.by_) <= rr))
  select z.owner, z.card, sum(z.rent) * v_rate from (
      select l.owner, n.id card, n.rent::numeric rent from lots l join near n on n.id = l.card where l.owner <> u and l.mort is null
      union all select x.owner, n.id, n.rent::numeric * x.n from parts x join near n on n.id = x.card where x.owner <> u and x.mort is null) z
  group by z.owner, z.card;
  for o in select sum(t.amt) * (case when me = 'poing' then 0.5 else 1 end) * (case when p.party = 'rempart' then 1.5 else 1 end) amt
           from _wtoll t join profiles p on p.id = t.owner group by t.owner, p.party loop
    tot := tot + o.amt;
  end loop;
  if tot < 1 then return jsonb_build_object('toll', 0, 'n', 0, 'payees', '[]'::jsonb); end if;
  perform _sync(u);
  cap := floor((select cash from profiles where id = u) * (cfg->>'tollCap')::numeric);
  if tot > cap then ratio := case when tot = 0 then 0 else cap / tot end; end if;
  for o in select t.owner, p.pseudo, count(*) nb,
                  sum(t.amt) * (case when me = 'poing' then 0.5 else 1 end) * (case when p.party = 'rempart' then 1.5 else 1 end) amt
           from _wtoll t join profiles p on p.id = t.owner group by t.owner, p.party, p.pseudo loop
    if floor(round(o.amt * ratio, 4)) >= 1 then
      insert into pay(owner, amount, why) values (o.owner, floor(round(o.amt * ratio, 4)), 'loyer de passage');
      payees := payees || jsonb_build_object('pseudo', o.pseudo, 'amount', floor(round(o.amt * ratio, 4)), 'n', o.nb);
      nb := nb + o.nb;
    end if;
  end loop;
  tot := least(cap, floor(round(tot * ratio, 4)));
  if tot >= 1 then
    update profiles set cash = greatest(0, cash - tot::bigint) where id = u;
    perform _log(u, 'toll_paid', -tot::bigint, 'Péage · ' || nb || ' immeuble' || case when nb > 1 then 's' else '' end);
  end if;
  return jsonb_build_object('toll', tot, 'n', nb, 'payees', payees);
end $$;

-- les « ? » du jour : 30 % des stations, jardins et places, les mêmes pour tout le monde (le site fait le même calcul)
create or replace function _wday() returns int language sql stable as $$ select (paris_today() - date '2026-01-01')::int $$;
create or replace function _wchance_on(p_card int, p_day int) returns boolean language sql immutable as $$
  select ((p_card::bigint * 2654435761 + p_day::bigint * 97) % 4294967296) % 100 < (_world_cfg()->>'chancePct')::int $$;

-- ---------------------------------------------------------------------
-- entrer dans le monde (ou y revenir) : on reprend où l'on était ; la première fois, devant son immeuble (là où était la montgolfière)
create or replace function world_join() returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); cfg jsonb := _world_cfg(); w walkers; lo float8; la float8; c cards; cl int; pos float8[];
begin
  if not exists (select 1 from profiles where id = u) then raise exception 'Créez d''abord votre compte de jeu'; end if;
  select * into w from walkers where user_id = u for update;
  if not found then
    select cd.* into c from profiles p join cards cd on cd.id = coalesce(p.land, p.pos) where p.id = u;
    if found then lo := c.cx / 1e5 + (random() - .5) * .0003; la := c.cy / 1e5 + (random() - .5) * .0002;
    else lo := (cfg->'start'->>0)::float8; la := (cfg->'start'->>1)::float8; end if;
    insert into walkers(user_id, lon0, lat0, lon, lat, day, km) values (u, lo, la, lo, la, paris_today(), 0) returning * into w;
  end if;
  if not w.settled and (w.dur <= 0 or now() >= w.t0 + make_interval(secs => w.dur)) then perform _wsettle(u); end if;
  pos := _wpos(w); cl := _wcell(w.lon, w.lat);
  -- le bien « à portée » d'avant (une case du dé, une visite d'hier) ne reste achetable que s'il est encore à portée
  lo := pos[1]; la := pos[2];   -- (pos est aussi une colonne de profiles)
  update profiles p set land = null where p.id = u and p.land is not null and not exists (
    select 1 from cards k where k.id = p.land and _wm(lo, la, k.cx / 1e5, k.cy / 1e5) <= 10 + (case
      when k.lk = 'p' and not exists (select 1 from spots s where s.card = k.id and s.kind = 'm') then cfg->>'reachBig' else cfg->>'reach' end)::float8);
  delete from world_people where seen < now() - interval '90 seconds';
  insert into world_people(user_id, cell, lon, lat, seen) values (u, cl, w.lon, w.lat, now())
    on conflict (user_id) do update set cell = excluded.cell, lon = excluded.lon, lat = excluded.lat, seen = now();
  perform _wemit(cl, u, 'join', _wperson(u));
  return json_build_object('me', u, 'pos', json_build_array(pos[1], pos[2]), 'w', _wout(u), 'cfg', cfg, 'admin', is_admin(),
    'trip', case when w.path is not null and w.dur > 0 and now() < w.t0 + make_interval(secs => w.dur)
                 then json_build_object('path', w.path, 'dur', w.dur, 'el', extract(epoch from now() - w.t0)) end,
    'chatOff', (select chat_off from profiles where id = u), 'land', (select land from profiles where id = u), 'last', coalesce((select max(id) from chat_msg), 0),
    'day', _wday(), 'taken', coalesce((select json_agg(card) from chance_taken where user_id = u and day = paris_today()), '[]'));
end $$;

-- les gens des carrés qu'on regarde (vus il y a moins de 90 s)
create or replace function world_people(p_cells int[]) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me();
begin
  update world_people set seen = now() where user_id = u;
  return coalesce((select json_agg(_wperson(x.user_id)) from world_people x
    where x.cell = any(p_cells[1:16]) and x.seen > now() - interval '90 seconds'), '[]');
end $$;

-- les évènements de ces carrés depuis le dernier vu (quand le temps réel ne répond pas)
create or replace function world_feed(p_cells int[], p_since bigint) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); here boolean;
begin
  update world_people set seen = now() where user_id = u returning true into here;
  return json_build_object('gone', here is null, 'ev', coalesce((select json_agg(json_build_object('e', m.id, 'k', m.kind, 'u', m.user_id, 'c', m.room, 'd', m.data) order by m.id)
    from (select * from chat_msg where room = any(p_cells[1:16]) and id > coalesce(p_since, 0) order by id limit 300) m), '[]'));
end $$;

-- toujours là (toutes les 25 s)
create or replace function world_ping() returns int
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); c int;
begin
  update world_people set seen = now() where user_id = u returning cell into c;
  if c is null then raise exception 'Revenez dans Paris'; end if;
  return c;
end $$;

create or replace function world_leave() returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); c int;
begin
  delete from world_people where user_id = u returning cell into c;
  if c is not null then perform _wemit(c, u, 'leave', '{}'); end if;
end $$;

-- parler : 120 caractères au plus, un message par seconde ; on l'entend autour de soi
create or replace function world_say(p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); x world_people; t text;
begin
  if _chat_ban_until(u) is not null then raise exception 'Vous êtes banni du chat.'; end if;
  select * into x from world_people where user_id = u for update;
  if not found then raise exception 'Revenez dans Paris'; end if;
  t := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  if t = '' then return; end if;
  t := left(t, 120);
  if x.said_at is not null and x.said_at > now() - interval '1 second' then raise exception 'Doucement : un message par seconde.'; end if;
  update world_people set said_at = now(), seen = now() where user_id = u;
  perform _wemit(x.cell, u, 'say', jsonb_build_object('t', t));
end $$;

-- marcher : le site a calculé le trajet dans les rues (p_path) ; le serveur compte les km (jamais moins que la ligne droite),
-- verse le salaire des km offerts, fait payer ceux d'au-delà (seulement si p_pay : le site demande d'abord),
-- encaisse le péage du trajet précédent, et prévient les gens autour (le trajet part avec)
create or replace function world_move(p_lon float8, p_lat float8, p_len float8 default null, p_path jsonb default null, p_pay boolean default false) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); cfg jsonb := _world_cfg(); w walkers; x world_people; pos float8[]; v_len float8; km0 float8; km1 float8;
  kmo float8; rem float8; back bigint := 0; cost bigint := 0; sal bigint := 0; v_dur float8; have bigint; v_path jsonb := null; tl jsonb; party text; c0 int; c1 int;
begin
  if p_lon is null or p_lat is null or p_lon < (cfg->>'w')::float8 or p_lon > (cfg->>'e')::float8 or p_lat < (cfg->>'s')::float8 or p_lat > (cfg->>'n')::float8 then
    raise exception 'On ne peut pas sortir de Paris pour l''instant'; end if;
  select * into x from world_people where user_id = u for update;
  if not found then raise exception 'Revenez dans Paris'; end if;
  select * into w from walkers where user_id = u for update;
  if not found then raise exception 'Revenez dans Paris'; end if;
  if w.dur > 0 and now() < w.t0 + interval '250 milliseconds' then raise exception 'Doucement'; end if;
  tl := _wsettle(u);                                -- le péage du trajet d'avant (ce qui en a été marché)
  select * into w from walkers where user_id = u;
  party := _party(u);
  kmo := _wkm(w); km0 := kmo; pos := _wpos(w);
  -- un trajet coupé en route : on rend ce qui n'a pas été marché (km, et l'argent si on avait payé)
  if w.day = paris_today() and w.dur > 0 and now() < w.t0 + make_interval(secs => w.dur) then
    rem := w.len * (1 - extract(epoch from now() - w.t0) / w.dur) / 1000;
    km0 := greatest(0, kmo - rem);
    back := floor(round((_wcost(kmo) - _wcost(km0))::numeric, 2));
  end if;
  -- le trajet envoyé par le site : il doit partir d'où l'on est (à 80 m près) et finir au point demandé
  if jsonb_typeof(p_path) = 'array' and jsonb_array_length(p_path) between 2 and 400
     and _wm((p_path->0->>0)::float8, (p_path->0->>1)::float8, pos[1], pos[2]) <= 80
     and _wm((p_path->-1->>0)::float8, (p_path->-1->>1)::float8, p_lon, p_lat) <= 2 then
    v_path := p_path;
  end if;
  v_len := greatest(coalesce(p_len, 0), _wm(pos[1], pos[2], p_lon, p_lat), coalesce(_wplen(v_path), 0));
  if v_len > 15000 then raise exception 'Trop loin d''un coup : prenez le métro'; end if;
  km1 := km0 + v_len / 1000;
  cost := ceil(round((_wcost(km1) - _wcost(km0))::numeric, 2));   -- (arrondi : 0,3 km = 3 000 €, pas 3 001)
  if cost > back then
    if not coalesce(p_pay, false) then raise exception 'PAYER:%', cost - back; end if;   -- le site affiche le prix et redemande avec p_pay
  end if;
  sal := floor(_wsal(km1, party) - _wsal(kmo, party));   -- négatif si on a fait demi-tour : le salaire suit les km vraiment marchés
  perform _sync(u);
  select p.cash into have from profiles p where p.id = u for update;
  if have + back + sal < cost then raise exception 'Pas assez d''argent : ce trajet coûte % €', cost; end if;
  update profiles set cash = greatest(0, cash + back + sal - cost), land = null where id = u;
  if back > 0 then perform _log(u, 'walk', back, 'Trajet écourté'); end if;
  if cost > 0 then perform _log(u, 'walk', -cost, 'Marche · ' || replace(to_char(v_len / 1000, 'FM990.0'), '.', ',') || ' km'); end if;
  if sal <> 0 then perform _log(u, 'salary', sal, case when sal < 0 then 'Salaire (trajet écourté)' when party = 'tendue' then 'Salaire de la marche (doublé : Gauche)' else 'Salaire de la marche' end); end if;
  v_dur := least((cfg->>'maxDur')::float8, greatest(1, v_len / (cfg->>'speed')::float8));
  update walkers set lon0 = pos[1], lat0 = pos[2], lon = p_lon, lat = p_lat, t0 = now(), dur = v_dur, len = v_len, km = km1,
    day = paris_today(), path = v_path, settled = false where user_id = u;
  c0 := x.cell; c1 := _wcell(p_lon, p_lat);
  update world_people set cell = c1, lon = p_lon, lat = p_lat, seen = now() where user_id = u;
  perform _wemit(c0, u, 'move', jsonb_build_object('lon', p_lon, 'lat', p_lat, 'dur', v_dur) || case when v_path is null then '{}'::jsonb else jsonb_build_object('path', v_path) end);
  if c1 <> c0 then perform _wemit(c1, u, 'move', jsonb_build_object('lon', p_lon, 'lat', p_lat, 'dur', v_dur, 'join', _wperson(u)) || case when v_path is null then '{}'::jsonb else jsonb_build_object('path', v_path) end); end if;
  return json_build_object('dur', v_dur, 'len', v_len, 'cost', cost, 'back', back, 'salary', sal, 'toll', tl, 'w', _wout(u));
end $$;

-- arrivé au bout de son trajet : on paie le péage des immeubles devant lesquels on est passé
create or replace function world_stop() returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me();
begin
  return json_build_object('toll', _wsettle(u), 'w', _wout(u));
end $$;

-- à portée d'un immeuble (ou d'un lieu) : c'est sa case, on peut l'acheter comme en tombant dessus avec le dé, même en marchant
create or replace function world_arrive(p_card int) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); cfg jsonb := _world_cfg(); w walkers; c cards; d float8; pos float8[]; big boolean;
begin
  select * into w from walkers where user_id = u;
  if not found then raise exception 'Revenez dans Paris'; end if;
  select * into c from cards where id = p_card;
  if not found then raise exception 'Bien inconnu'; end if;
  pos := _wpos(w);
  d := _wm(pos[1], pos[2], c.cx / 1e5, c.cy / 1e5);
  -- un monument, un jardin, une place : on peut être plus loin ; une station, c'est un point (comme un immeuble)
  big := c.lk = 'p' and not exists (select 1 from spots s where s.card = c.id and s.kind = 'm');
  if d > (case when big then cfg->>'reachBig' else cfg->>'reach' end)::float8 then raise exception 'Trop loin : % m', round(d); end if;
  update profiles set land = p_card, pos = p_card, pend = null, pend_die = null where id = u;
  return state();
end $$;

-- le métro : depuis la station où l'on est (120 m), vers n'importe quelle station de Paris ; un ticket, changements compris, pas de km
create or replace function world_metro(p_to int) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); cfg jsonb := _world_cfg(); w walkers; x world_people; here int; dh float8; t cards; cost bigint; have bigint; pos float8[]; c0 int; c1 int; tl jsonb;
begin
  select * into x from world_people where user_id = u for update;
  if not found then raise exception 'Revenez dans Paris'; end if;
  select * into w from walkers where user_id = u for update;
  if not found then raise exception 'Revenez dans Paris'; end if;
  pos := _wpos(w);
  select m.card, _wm(pos[1], pos[2], c.cx / 1e5, c.cy / 1e5) into here, dh
    from (select distinct card from metro_stop) m join cards c on c.id = m.card order by 2 limit 1;
  if here is null or dh > (cfg->>'reach')::float8 then raise exception 'Allez d''abord jusqu''à une station'; end if;
  if not exists (select 1 from metro_stop where card = p_to) then raise exception 'Station inconnue'; end if;
  if p_to = here then raise exception 'Vous y êtes déjà'; end if;
  tl := _wsettle(u);
  cost := (cfg->>'ticket')::bigint;
  perform _sync(u);
  select p.cash into have from profiles p where p.id = u for update;
  if have < cost then raise exception 'Pas assez d''argent pour le ticket (% €)', cost; end if;
  update profiles set cash = cash - cost, land = p_to, pos = p_to, pend = null, pend_die = null where id = u;
  perform _log(u, 'metro', -cost, 'Ticket de métro', p_to);
  select * into t from cards where id = p_to;
  update walkers set lon0 = t.cx / 1e5, lat0 = t.cy / 1e5, lon = t.cx / 1e5, lat = t.cy / 1e5, t0 = now(), dur = 0, len = 0, path = null, settled = true where user_id = u;
  c0 := x.cell; c1 := _wcell(t.cx / 1e5, t.cy / 1e5);
  update world_people set cell = c1, lon = t.cx / 1e5, lat = t.cy / 1e5, seen = now() where user_id = u;
  perform _wemit(c0, u, 'move', jsonb_build_object('lon', t.cx / 1e5, 'lat', t.cy / 1e5, 'metro', true));
  if c1 <> c0 then perform _wemit(c1, u, 'join', _wperson(u)); end if;
  return json_build_object('from', here, 'to', p_to, 'toll', tl, 'w', _wout(u), 'state', state());
end $$;

-- à r mètres de la partie déjà marchée du trajet (on ramasse un « ? » en passant, même vite : le site et le serveur
-- ne voient pas le personnage exactement au même endroit au même instant)
create or replace function _wnear_walked(w walkers, lo float8, la float8, r float8) returns boolean language sql stable as $$
  with p as (select i, (e->>0)::float8 x, (e->>1)::float8 y from jsonb_array_elements(case when jsonb_typeof(w.path) = 'array' then w.path else '[]'::jsonb end) with ordinality t(e, i)),
       s as (select a.i, a.x ax, a.y ay, b.x bx, b.y by_, _wm(a.x, a.y, b.x, b.y) len from p a join p b on b.i = a.i + 1),
       s2 as (select s.*, sum(len) over (order by i) - len s0, sum(len) over () ptot from s),
       f as (select case when w.dur <= 0 then 1 else least(1, greatest(0, extract(epoch from now() - w.t0) / w.dur)) end v)
  select exists (select 1 from s2, f where s2.s0 <= f.v * s2.ptot and _wsegd(lo, la, ax, ay,
      case when s0 + len <= f.v * ptot or len = 0 then bx else ax + (bx - ax) * (f.v * ptot - s0) / len end,
      case when s0 + len <= f.v * ptot or len = 0 then by_ else ay + (by_ - ay) * (f.v * ptot - s0) / len end) <= r) $$;

-- ramasser un « ? » (à 40 m, ou en passant à 40 m sur son trajet) : une carte Chance, une fois par jour pour chaque « ? »
create or replace function world_chance(p_card int) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); cfg jsonb := _world_cfg(); w walkers; c cards; pos float8[]; ch jsonb;
begin
  select * into w from walkers where user_id = u;
  if not found then raise exception 'Revenez dans Paris'; end if;
  if not exists (select 1 from spots where card = p_card) or not _wchance_on(p_card, _wday()) then raise exception 'Pas de carte Chance ici aujourd''hui'; end if;
  select * into c from cards where id = p_card;
  pos := _wpos(w);
  if _wm(pos[1], pos[2], c.cx / 1e5, c.cy / 1e5) > (cfg->>'chanceR')::float8
     and not _wnear_walked(w, c.cx / 1e5, c.cy / 1e5, (cfg->>'chanceR')::float8) then raise exception 'Approchez-vous du « ? »'; end if;
  begin
    insert into chance_taken(user_id, day, card) values (u, paris_today(), p_card);
  exception when unique_violation then raise exception 'Déjà ramassé aujourd''hui';
  end;
  perform _sync(u);
  ch := _chance(u);
  if ch ? 'extra' and ch->'extra' <> 'null'::jsonb then perform _refresh_mayors(array[(select arr from cards where id = (ch->'extra'->>'card')::int)::int]); end if;
  return json_build_object('chance', ch, 'state', state());
end $$;

-- couper le chat : on ne voit plus les bulles des autres et on ne parle plus
create or replace function set_chat_off(p_off boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me();
begin
  update profiles set chat_off = coalesce(p_off, false) where id = u;
  return coalesce(p_off, false);
end $$;

-- son personnage : les gens autour le voient changer tout de suite
create or replace function set_look(p_look jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); l jsonb; r int; c int; k text; v int; lo int; hi int; opt boolean;
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
  select cell into c from world_people where user_id = u;
  if c is not null then perform _wemit(c, u, 'look', jsonb_build_object('look', l)); end if;
  select room into r from place_people where user_id = u;
  if r is not null then perform _chat_emit(r, u, 'look', jsonb_build_object('look', l)); end if;
  return l;
end $$;

-- bannir du chat (admin) : la personne ne peut plus parler ; elle reste dans Paris
create or replace function chat_ban(p_user uuid, p_hours int default 24) returns json
language plpgsql security definer set search_path = public as $$
declare a uuid := _need_admin(); c int;
begin
  if p_user = a then raise exception 'Vous ne pouvez pas vous bannir vous-même'; end if;
  if exists (select 1 from admins where id = p_user) then raise exception 'On ne bannit pas un admin'; end if;
  insert into chat_bans(user_id, until, by_user, at) values (p_user, case when p_hours is null then null else now() + make_interval(hours => p_hours) end, a, now())
    on conflict (user_id) do update set until = excluded.until, by_user = excluded.by_user, at = now();
  delete from place_people where user_id = p_user;
  select cell into c from world_people where user_id = p_user;
  if c is not null then perform _wemit(c, p_user, 'kick', jsonb_build_object('h', p_hours)); end if;
  return chat_bans();
end $$;

-- à la banque, on n'achète que l'immeuble devant lequel on est (world_arrive)
create or replace function _near_or_fail(u uuid, card int) returns void language plpgsql as $$
declare l int;
begin
  select land into l from profiles where id=u;
  if l is distinct from card then raise exception 'Approchez-vous de cet immeuble pour l''acheter.'; end if;
end $$;
revoke all on function _near_or_fail(uuid, int) from public, anon, authenticated;

-- le dé est retiré (choix du propriétaire, 20/10/2026) : on se promène dans Paris
create or replace function roll() returns json language plpgsql security definer set search_path = public as $$
begin raise exception 'Le dé n''existe plus : on se promène dans Paris.'; end $$;
create or replace function roll(p_dir float8) returns json language plpgsql security definer set search_path = public as $$
begin raise exception 'Le dé n''existe plus : on se promène dans Paris.'; end $$;
create or replace function go_to(p_card int) returns json language plpgsql security definer set search_path = public as $$
begin raise exception 'Le dé n''existe plus : on se promène dans Paris.'; end $$;
create or replace function buy_rolls() returns json language plpgsql security definer set search_path = public as $$
begin raise exception 'Le dé n''existe plus : on se promène dans Paris.'; end $$;

revoke all on function _wcell(float8, float8), _wsegd(float8, float8, float8, float8, float8, float8), _wplen(jsonb), _wpos(walkers), _wperson(uuid),
  _wemit(int, uuid, text, jsonb), _wout(uuid), _wsal(float8, text), _wsettle(uuid), _wday(), _wchance_on(int, int), _world_cfg(),
  _wnear_walked(walkers, float8, float8, float8) from public, anon, authenticated;
revoke all on function world_join(), world_people(int[]), world_feed(int[], bigint), world_ping(), world_leave(), world_say(text),
  world_move(float8, float8, float8, jsonb, boolean), world_stop(), world_arrive(int), world_metro(int), world_chance(int), set_chat_off(boolean), set_look(jsonb), chat_ban(uuid, int) from public, anon;
grant execute on function world_join(), world_people(int[]), world_feed(int[], bigint), world_ping(), world_leave(), world_say(text),
  world_move(float8, float8, float8, jsonb, boolean), world_stop(), world_arrive(int), world_metro(int), world_chance(int), set_chat_off(boolean), set_look(jsonb), chat_ban(uuid, int) to authenticated;

-- temps réel : sur les canaux privés des carrés, les joueurs connectés reçoivent (seul le serveur envoie)
do $$
begin
  if to_regclass('realtime.messages') is not null then
    begin
      execute 'drop policy if exists "monde : les joueurs reçoivent" on realtime.messages';
      execute $q$create policy "monde : les joueurs reçoivent" on realtime.messages for select to authenticated
               using ((select realtime.topic()) like 'w:%')$q$;
    exception when others then raise notice 'monde : politique temps réel non créée (%)', sqlerrm;
    end;
  end if;
end $$;
