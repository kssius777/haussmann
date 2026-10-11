-- =====================================================================
-- HAUSSMANN · le pion et les dés
-- Chaque joueur a un pion posé sur un immeuble. Il lance deux dés et
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

create or replace function pawn_cfg() returns jsonb language sql immutable as $$ select '{
  "maxRolls":10, "rollEveryMin":120, "tpPerDay":3, "buyRadius":150, "tollCap":0.2, "spawn":300658, "chanceEvery":12
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
      select distinct on (e.b) e.b, lvl, e.a from _bfs f join edges e on e.a = f.node where f.d = lvl - 1
      on conflict (node) do nothing;
  end loop;
  return query select f.node, f.d, f.par from _bfs f;
end $$;

-- Lancer les dés
create or replace function roll() returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles; a int; b int; tg int[]; ch int[]; nxt int;
begin
  perform _sync(u); perform _regen(u);
  select * into pr from profiles where id=u for update;
  if not exists (select 1 from edges limit 1) then raise exception 'Le plan des rues n''est pas encore chargé'; end if;
  if pr.dice is null then
    if pr.rolls <= 0 then
      nxt := ceil(extract(epoch from (pr.rolls_at + ((pawn_cfg()->>'rollEveryMin') || ' minutes')::interval - now())) / 60);
      raise exception 'Plus de lancers pour l''instant : le prochain arrive dans % min', greatest(1, nxt);
    end if;
    a := 1 + floor(random()*6)::int; b := 1 + floor(random()*6)::int;
    update profiles set dice = array[a,b]::smallint[], rolls = rolls - 1, rolls_at = case when pr.rolls >= (pawn_cfg()->>'maxRolls')::int then now() else rolls_at end where id=u;
  else a := pr.dice[1]; b := pr.dice[2]; end if;
  select array_agg(node) into tg from _reach(pr.pos, a + b) where d = a + b;
  -- impasse rare : on accepte les cases les plus lointaines atteignables
  if tg is null then select array_agg(node) into tg from _reach(pr.pos, a + b) r where r.d = (select max(d) from _reach(pr.pos, a + b)); end if;
  select array_agg(x) into ch from unnest(tg) x where _is_chance(x);
  return json_build_object('dice', array[a,b], 'targets', coalesce(tg, '{}'), 'chance', coalesce(ch, '{}'), 'state', state());
end $$;

-- Avancer jusqu'à une case atteignable
create or replace function move(p_target int) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles; n int; dmax int; path int[] := '{}'; cur int; t record; c cards;
        toll numeric := 0; cap numeric; ratio numeric := 1; payees jsonb := '[]'; ch jsonb := null; o record;
begin
  perform _sync(u); perform _regen(u);
  select * into pr from profiles where id=u for update;
  if pr.dice is null then raise exception 'Lancez d''abord les dés'; end if;
  n := pr.dice[1] + pr.dice[2];
  create temp table if not exists _path_tmp(node int primary key, d int, par int) on commit drop; truncate _path_tmp;
  insert into _path_tmp select * from _reach(pr.pos, n);
  select max(d) into dmax from _path_tmp;
  select * into t from _path_tmp where node = p_target;
  if not found or t.d <> least(n, dmax) then raise exception 'Cette case n''est pas à % pas de votre pion', n; end if;
  cur := p_target;
  while cur is not null loop path := cur || path; select par into cur from _path_tmp where node = cur; end loop;
  update profiles set pos = p_target, dice = null where id = u;
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
      'card', p_target, 'toll', toll, 'payees', payees, 'chance', ch,
      'free', c.lots - coalesce((select count(*) from lots where card = p_target), 0) - coalesce((select sum(n) from parts where card = p_target), 0),
      'mine', (select count(*) from lots where card = p_target and owner = u) + coalesce((select n from parts where card = p_target and owner = u), 0)),
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
  update profiles set pos = p_card, dice = null, tp = tp - 1 where id=u;
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
revoke all on function _dist(int,int), _is_chance(int), _regen(uuid), _reach(int,int), _near_or_fail(uuid,int), pawn_cfg() from public, anon, authenticated;
