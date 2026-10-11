-- =====================================================================
-- HAUSSMANN · le pion et les dés
-- Chaque joueur a un pion posé sur un immeuble. Il lance un dé (1 à 10) et
-- avance d'autant de « cases » (immeubles voisins) en suivant les rues.
-- On n'achète directement que les immeubles proches de son pion.
-- =====================================================================
alter table cards add column if not exists cx int;   -- centre de l'immeuble, degrés × 100 000
alter table cards add column if not exists cy int;
create table if not exists edges (a int not null, b int not null, primary key (a, b));   -- immeubles voisins (dans les deux sens)
alter table edges enable row level security;
drop policy if exists read_all on edges;
create policy read_all on edges for select using (true);

alter table profiles add column if not exists pos int;                                 -- immeuble où se trouve le pion
alter table profiles add column if not exists rolls int not null default 10;           -- lancers de dés disponibles
alter table profiles add column if not exists rolls_at timestamptz not null default now();
alter table profiles add column if not exists tp int not null default 3;               -- téléportations du jour
alter table profiles add column if not exists tp_day date;
alter table profiles add column if not exists dice smallint[];                         -- dés lancés, en attente du déplacement
alter table profiles add column if not exists moves int[];                             -- destinations proposées après le lancer

create or replace function pawn_cfg() returns jsonb language sql immutable as $$ select '{
  "maxRolls":10, "rollEveryMin":120, "tpPerDay":3, "buyRadius":150, "tollCap":0.2, "spawn":300658, "chanceEvery":8, "stepMul":3, "dieMax":10
}'::jsonb $$;

-- distance en mètres entre deux immeubles (null si coordonnées inconnues)
create or replace function _dist(a int, b int) returns float8 language sql stable as $$
  select sqrt(power((x.cx - y.cx) * 0.7324, 2) + power((x.cy - y.cy) * 1.10574, 2))
  from cards x, cards y where x.id = a and y.id = b $$;

-- case Chance du jour (la même pour tous, change chaque jour)
create or replace function _is_chance(c int) returns boolean language sql stable as $$
  select abs(hashtext(c::text || paris_today()::text)) % (pawn_cfg()->>'chanceEvery')::int = 0 $$;

-- recharge des dés et des téléportations
create or replace function _regen(p uuid) returns void language plpgsql as $$
#variable_conflict use_column
declare pr profiles; every interval := ((pawn_cfg()->>'rollEveryMin') || ' minutes')::interval; mx int := (pawn_cfg()->>'maxRolls')::int; gain int;
begin
  select * into pr from profiles where id=p for update;
  if pr.rolls >= mx then
    update profiles set rolls_at = now() where id=p and rolls_at < now() - interval '1 minute';
  else
    gain := floor(extract(epoch from (now() - pr.rolls_at)) / extract(epoch from every))::int;
    if gain > 0 then
      update profiles set rolls = least(mx, pr.rolls + gain),
        rolls_at = case when pr.rolls + gain >= mx then now() else pr.rolls_at + every * gain end where id=p;
    end if;
  end if;
  if pr.tp_day is distinct from paris_today() then
    update profiles set tp = (pawn_cfg()->>'tpPerDay')::int, tp_day = paris_today() where id=p;
  end if;
  if pr.pos is null then update profiles set pos = coalesce((select id from cards where id=(pawn_cfg()->>'spawn')::int), (select min(id) from cards)) where id=p; end if;
end $$;

-- parcours en largeur : distance (en cases) et prédécesseur de chaque immeuble autour du départ
create or replace function _reach(start int, n int) returns table(node int, d int, par int) language plpgsql as $$
#variable_conflict use_column
declare lvl int;
begin
  create temp table if not exists _bfs(node int primary key, d int, par int) on commit drop;
  truncate _bfs;
  insert into _bfs values (start, 0, null);
  for lvl in 1..n loop
    insert into _bfs(node, d, par)
      select distinct on (e.b) e.b, lvl, e.a from _bfs f join edges e on e.a = f.node where f.d = lvl - 1 order by e.b, e.a
      on conflict (node) do nothing;
  end loop;
  return query select f.node, f.d, f.par from _bfs f;
end $$;

-- Les destinations : au plus 4, une par direction (nord, est, sud, ouest), la plus lointaine à n pas.
-- Remplit la table temporaire _rt (parcours depuis le pion) et renvoie le nombre de pas réellement faits.
create or replace function _route_table(start int, n int) returns int language plpgsql as $$
declare dmax int;
begin
  create temp table if not exists _rt(node int primary key, d int, par int) on commit drop;
  truncate _rt; insert into _rt select * from _reach(start, n);
  select max(d) into dmax from _rt; return least(n, dmax);
end $$;
create or replace function _path_to(t int) returns int[] language plpgsql as $$
declare cur int := t; path int[] := '{}';
begin
  while cur is not null loop path := cur || path; select par into cur from _rt where node = cur; end loop;
  return path;
end $$;
-- ce qui attend le joueur sur une case : logements libres, à lui, péage, Chance
create or replace function _square(u uuid, t int) returns jsonb language sql stable as $$
  select jsonb_build_object('card', t, 'path', to_jsonb(_path_to(t)), 'chance', _is_chance(t),
    'free', c.lots - coalesce((select count(*) from lots where card = t), 0) - coalesce((select sum(n) from parts where card = t), 0),
    'mine', (select count(*) from lots where card = t and owner = u) + coalesce((select sum(n) from parts where card = t and owner = u), 0),
    'toll', exists (select 1 from lots where card = t and owner <> u and mort is null) or exists (select 1 from parts where card = t and owner <> u and mort is null))
  from cards c where c.id = t $$;

-- Lancer les dés
create or replace function roll() returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles; a int; n int; steps int; nxt int; mv int[]; x0 int; y0 int; angs float8[]; q record; gap int;
begin
  perform _sync(u); perform _regen(u);
  select * into pr from profiles where id=u for update;
  if not exists (select 1 from edges limit 1) then raise exception 'Le plan des rues n''est pas encore chargé'; end if;
  if pr.dice is null then
    if pr.rolls <= 0 then
      nxt := ceil(extract(epoch from (pr.rolls_at + ((pawn_cfg()->>'rollEveryMin') || ' minutes')::interval - now())) / 60);
      raise exception 'Plus de lancers pour l''instant : le prochain arrive dans % min', greatest(1, nxt);
    end if;
    a := 1 + floor(random() * (pawn_cfg()->>'dieMax')::int)::int;   -- un seul dé, de 1 à 10
    update profiles set dice = array[a]::smallint[], moves = null, rolls = rolls - 1, rolls_at = case when pr.rolls >= (pawn_cfg()->>'maxRolls')::int then now() else rolls_at end where id=u;
    pr.moves := null;
  else a := pr.dice[1]; end if;
  n := a * (pawn_cfg()->>'stepMul')::int;
  steps := _route_table(pr.pos, n);
  mv := pr.moves;
  if mv is null then
    -- la plus lointaine d'abord, puis les plus lointaines qui partent dans une autre direction (au moins 70° d'écart)
    select cx, cy into x0, y0 from cards where id = pr.pos;
    mv := '{}'; angs := '{}';
    foreach gap in array array[70, 35, 12] loop   -- si le quartier est étroit (une île, un pont), on accepte des directions plus proches
      for q in select r.node, degrees(atan2((c.cy - y0) * 1.10574, (c.cx - x0) * 0.7324)) ang
               from _rt r join cards c on c.id = r.node where r.d = steps and r.node <> all(mv)
               order by power((c.cx - x0) * 0.7324, 2) + power((c.cy - y0) * 1.10574, 2) desc, r.node loop
        exit when coalesce(array_length(mv, 1), 0) >= 4;
        if not exists (select 1 from unnest(angs) a where abs(mod((q.ang - a + 540)::numeric, 360) - 180) < gap) then
          mv := mv || q.node; angs := angs || q.ang;
        end if;
      end loop;
      exit when coalesce(array_length(mv, 1), 0) >= 3;
    end loop;
    update profiles set moves = mv where id = u;
  end if;
  return json_build_object('die', a, 'steps', steps,
    'choices', coalesce((select json_agg(_square(u, t) order by i) from unnest(mv) with ordinality as m(t, i)), '[]'),
    'state', state());
end $$;

-- Avancer jusqu'à une des destinations proposées
create or replace function move(p_target int) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles; n int; path int[]; c cards;
        toll numeric := 0; cap numeric; ratio numeric := 1; payees jsonb := '[]'; ch jsonb := null; o record; sq jsonb;
begin
  perform _sync(u); perform _regen(u);
  select * into pr from profiles where id=u for update;
  if pr.dice is null then raise exception 'Lancez d''abord les dés'; end if;
  if pr.moves is null or not (p_target = any(pr.moves)) then raise exception 'Choisissez une des destinations proposées'; end if;
  n := pr.dice[1] * (pawn_cfg()->>'stepMul')::int;
  perform _route_table(pr.pos, n);
  path := _path_to(p_target);
  sq := _square(u, p_target);
  update profiles set pos = p_target, dice = null, moves = null where id = u;
  select * into c from cards where id = p_target;
  -- péage : chaque propriétaire de l'immeuble reçoit un jour de loyer de ses biens (plafonné à 20 % de votre trésorerie)
  for o in
    select owner, sum(rent) amt from (
      select l.owner, c.rent::numeric rent from lots l where l.card = p_target and l.owner <> u and l.mort is null
      union all select x.owner, c.rent::numeric * x.n from parts x where x.card = p_target and x.owner <> u and x.mort is null) z
    group by owner loop
    toll := toll + o.amt;
  end loop;
  if toll > 0 then
    cap := floor((select cash from profiles where id=u) * (pawn_cfg()->>'tollCap')::numeric);
    if toll > cap then ratio := case when toll = 0 then 0 else cap / toll end; end if;
    for o in
      select z.owner, p.pseudo, sum(rent) amt from (
        select l.owner, c.rent::numeric rent from lots l where l.card = p_target and l.owner <> u and l.mort is null
        union all select x.owner, c.rent::numeric * x.n from parts x where x.card = p_target and x.owner <> u and x.mort is null) z
      join profiles p on p.id = z.owner group by z.owner, p.pseudo loop
      if floor(o.amt * ratio) >= 1 then
        insert into pay(owner, amount, why) values (o.owner, floor(o.amt * ratio), 'péage');
        payees := payees || jsonb_build_object('pseudo', o.pseudo, 'amount', floor(o.amt * ratio));
      end if;
    end loop;
    toll := floor(toll * ratio);
    update profiles set cash = greatest(0, cash - toll::bigint) where id = u;
  end if;
  if _is_chance(p_target) then ch := _chance(u); end if;
  if ch ? 'extra' and ch->'extra' <> 'null'::jsonb then perform _refresh_mayors(array[(select arr from cards where id = (ch->'extra'->>'card')::int)::int]); end if;
  return json_build_object('path', path, 'landing', json_build_object(
      'card', p_target, 'toll', toll, 'payees', payees, 'chance', ch, 'free', (sq->>'free')::int, 'mine', (sq->>'mine')::int),
    'state', state());
end $$;

-- Se téléporter sur un de ses biens
create or replace function teleport(p_card int) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles;
begin
  perform _sync(u); perform _regen(u);
  select * into pr from profiles where id=u for update;
  if pr.tp <= 0 then raise exception 'Plus de téléportation aujourd''hui (3 par jour)'; end if;
  if not exists (select 1 from lots where card=p_card and owner=u) and not exists (select 1 from parts where card=p_card and owner=u) then
    raise exception 'On ne peut se téléporter que sur un de ses biens'; end if;
  update profiles set pos = p_card, dice = null, moves = null, tp = tp - 1 where id=u;
  return state();
end $$;

-- L'achat direct n'est possible qu'autour du pion
create or replace function _near_or_fail(u uuid, card int) returns void language plpgsql as $$
declare p int; d float8; r float8 := (pawn_cfg()->>'buyRadius')::float8;
begin
  select pos into p from profiles where id=u;
  if p is null then return; end if;
  d := _dist(p, card);
  if d is not null and d > r then
    raise exception 'Trop loin : votre pion est à % m. Approchez-vous à moins de % m pour acheter ici.', round(d)::int, r::int;
  end if;
end $$;

revoke all on function roll(), move(int), teleport(int) from public;
grant execute on function roll(), move(int), teleport(int) to anon, authenticated;
revoke all on function _dist(int,int), _is_chance(int), _regen(uuid), _reach(int,int), _near_or_fail(uuid,int), pawn_cfg(), _route_table(int,int), _path_to(int), _square(uuid,int) from public, anon, authenticated;
