-- Haussmann · mise à jour : le pion façon Monopoly (un dé de 1 à 6, une case par lancer).
-- À coller dans Supabase → SQL Editor → Run (une seule fois).

drop function if exists _square(uuid,int);
drop function if exists roll();

-- =====================================================================
-- HAUSSMANN · le pion et les dés
-- Comme au Monopoly : on lance un dé, le pion marche tout seul dans les rues
-- et s'arrête sur un immeuble. Libre : on peut l'acheter. À un autre joueur :
-- on lui paie son loyer. À soi : un bonus. Parfois : une case Chance.
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
alter table profiles add column if not exists moves int[];                             -- (ancienne version, inutilisé)
alter table profiles add column if not exists heading float8;                          -- direction de marche du pion (radians)
alter table profiles add column if not exists land int;                                -- immeuble où le pion s'est arrêté : achetable à la banque

create or replace function pawn_cfg() returns jsonb language sql immutable as $$ select '{
  "maxRolls":10, "rollEveryMin":30, "tpPerDay":3, "buyRadius":150, "tollCap":0.2, "spawn":300658, "chanceEvery":8, "stepMul":4, "dieMax":6
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

-- ce qui attend le joueur sur un immeuble : logements libres, à lui, péage
create or replace function _square(u uuid, t int) returns jsonb language sql stable as $$
  select jsonb_build_object('card', t, 'chance', _is_chance(t),
    'free', c.lots - coalesce((select count(*) from lots where card = t), 0) - coalesce((select sum(n) from parts where card = t), 0),
    'mine', (select count(*) from lots where card = t and owner = u) + coalesce((select sum(n) from parts where card = t and owner = u), 0))
  from cards c where c.id = t $$;

-- Le pion marche tout seul : il garde à peu près sa direction et tourne au hasard aux carrefours.
create or replace function _walk(u uuid, start int, n int) returns int[] language plpgsql as $$
#variable_conflict use_column
declare cur int := start; path int[] := array[start]; hd float8; x0 int; y0 int; nx int; best record; i int;
begin
  select coalesce(heading, random() * 2 * pi()) into hd from profiles where id = u;
  for i in 1..n loop
    select cx, cy into x0, y0 from cards where id = cur;
    select e.b node, atan2((c.cy - y0) * 1.10574, (c.cx - x0) * 0.7324) brg into best
      from edges e join cards c on c.id = e.b
      where e.a = cur
      order by (e.b = any(path)),                                                     -- pas de retour en arrière si possible
               abs(mod((atan2((c.cy - y0) * 1.10574, (c.cx - x0) * 0.7324) - hd + 3 * pi())::numeric, (2 * pi())::numeric) - pi()) + random() * 0.6
      limit 1;
    exit when best.node is null;
    hd := hd + 0.5 * (mod((best.brg - hd + 3 * pi())::numeric, (2 * pi())::numeric) - pi());
    cur := best.node; path := path || cur;
  end loop;
  update profiles set heading = hd where id = u;
  return path;
end $$;

-- Lancer le dé : le pion avance et s'arrête sur un immeuble
create or replace function roll() returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles; a int; nxt int; path int[]; t int; c cards; sq jsonb;
        toll numeric := 0; cap numeric; ratio numeric := 1; payees jsonb := '[]'; ch jsonb := null; o record; bonus bigint := 0;
begin
  perform _sync(u); perform _regen(u);
  select * into pr from profiles where id=u for update;
  if not exists (select 1 from edges limit 1) then raise exception 'Le plan des rues n''est pas encore chargé'; end if;
  if pr.rolls <= 0 then
    nxt := ceil(extract(epoch from (pr.rolls_at + ((pawn_cfg()->>'rollEveryMin') || ' minutes')::interval - now())) / 60);
    raise exception 'Plus de lancers pour l''instant : le prochain arrive dans % min', greatest(1, nxt);
  end if;
  a := 1 + floor(random() * (pawn_cfg()->>'dieMax')::int)::int;
  update profiles set rolls = rolls - 1, dice = null, moves = null,
    rolls_at = case when pr.rolls >= (pawn_cfg()->>'maxRolls')::int then now() else rolls_at end where id=u;
  path := _walk(u, pr.pos, a * (pawn_cfg()->>'stepMul')::int);
  t := path[array_length(path, 1)];
  update profiles set pos = t, land = t where id = u;
  select * into c from cards where id = t;
  -- loyer à payer : chaque propriétaire reçoit une journée de loyer de ses biens ici (plafonné à 20 % de votre trésorerie)
  for o in
    select owner, sum(rent) amt from (
      select l.owner, c.rent::numeric rent from lots l where l.card = t and l.owner <> u and l.mort is null
      union all select x.owner, c.rent::numeric * x.n from parts x where x.card = t and x.owner <> u and x.mort is null) z
    group by owner loop
    toll := toll + o.amt;
  end loop;
  if toll > 0 then
    cap := floor((select cash from profiles where id=u) * (pawn_cfg()->>'tollCap')::numeric);
    if toll > cap then ratio := case when toll = 0 then 0 else cap / toll end; end if;
    for o in
      select z.owner, p.pseudo, sum(rent) amt from (
        select l.owner, c.rent::numeric rent from lots l where l.card = t and l.owner <> u and l.mort is null
        union all select x.owner, c.rent::numeric * x.n from parts x where x.card = t and x.owner <> u and x.mort is null) z
      join profiles p on p.id = z.owner group by z.owner, p.pseudo loop
      if floor(o.amt * ratio) >= 1 then
        insert into pay(owner, amount, why) values (o.owner, floor(o.amt * ratio), 'loyer de passage');
        payees := payees || jsonb_build_object('pseudo', o.pseudo, 'amount', floor(o.amt * ratio));
      end if;
    end loop;
    toll := floor(toll * ratio);
    update profiles set cash = greatest(0, cash - toll::bigint) where id = u;
  end if;
  sq := _square(u, t);
  -- chez soi : une journée de loyer de ses biens ici en bonus
  if (sq->>'mine')::int > 0 then
    bonus := floor(c.rent::numeric * (sq->>'mine')::int);
    update profiles set cash = cash + bonus where id = u;
  end if;
  if _is_chance(t) then ch := _chance(u); end if;
  if ch ? 'extra' and ch->'extra' <> 'null'::jsonb then perform _refresh_mayors(array[(select arr from cards where id = (ch->'extra'->>'card')::int)::int]); end if;
  return json_build_object('die', a, 'path', path, 'landing', json_build_object(
      'card', t, 'toll', toll, 'payees', payees, 'chance', ch, 'bonus', bonus, 'free', (sq->>'free')::int, 'mine', (sq->>'mine')::int),
    'state', state());
end $$;

drop function if exists move(int);

-- Se téléporter sur un de ses biens (on peut alors y acheter les logements encore libres)
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
  update profiles set pos = p_card, land = p_card, dice = null, moves = null, tp = tp - 1 where id=u;
  return state();
end $$;

-- À la banque, on n'achète que l'immeuble sur lequel son pion s'est arrêté
create or replace function _near_or_fail(u uuid, card int) returns void language plpgsql as $$
declare l int;
begin
  select land into l from profiles where id=u;
  if l is distinct from card then
    raise exception 'Pour acheter cet immeuble à la banque, il faut tomber dessus avec le dé.';
  end if;
end $$;

revoke all on function roll(), teleport(int) from public;
grant execute on function roll(), teleport(int) to anon, authenticated;
revoke all on function _dist(int,int), _is_chance(int), _regen(uuid), _reach(int,int), _near_or_fail(uuid,int), pawn_cfg(), _square(uuid,int), _walk(uuid,int,int) from public, anon, authenticated;

notify pgrst, 'reload schema';
