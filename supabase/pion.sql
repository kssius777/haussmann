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
alter table profiles add column if not exists heading float8;
alter table profiles add column if not exists aim boolean default false;  -- le joueur a choisi sa direction pour le prochain lancer                          -- direction de marche du pion (radians)
alter table profiles add column if not exists land int;                                -- immeuble où le pion s'est arrêté : achetable à la banque

create or replace function pawn_cfg() returns jsonb language sql immutable as $$ select '{
  "maxRolls":10, "rollEveryMin":30, "tpPerDay":3, "buyRadius":150, "tollCap":0.2, "spawn":400761, "chanceEvery":8, "stepMul":4, "dieMax":6, "rollsPrice":50000, "rollsPack":5, "salary":20000
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

-- Le pion marche tout seul. Il ne peut pas tourner en rond : on cherche tous les immeubles atteignables
-- en exactement n pas, on choisit l'un des plus éloignés (plutôt dans la direction du lancer précédent),
-- puis le pion suit le PLUS COURT chemin pour y aller.
create or replace function _walk(u uuid, start int, n int) returns int[] language plpgsql as $$
#variable_conflict use_column
declare hd float8; sx float8; sy float8; t int; cur int; path int[] := '{}'; dmax int; tx float8; ty float8; am boolean;
begin
  -- direction choisie par le joueur (aim) : on la suit de près ; sinon on continue à peu près tout droit
  select case when coalesce(aim, false) then heading + (random() - 0.5) * 0.4 else coalesce(heading, random() * 2 * pi()) + (random() - 0.5) * 1.8 end,
         coalesce(aim, false) into hd, am from profiles where id = u;
  select cx * 0.7324, cy * 1.10574 into sx, sy from cards where id = start;
  create temp table if not exists _wk(node int primary key, d int, par int) on commit drop;
  truncate _wk; insert into _wk select * from _reach(start, n);
  select max(d) into dmax from _wk;
  select r.node into t from _wk r join cards c on c.id = r.node
    where r.d = dmax
    order by sqrt(power(c.cx * 0.7324 - sx, 2) + power(c.cy * 1.10574 - sy, 2))
             * (case when am then power(greatest(0.02, 0.5 + 0.5 * cos(atan2(c.cy * 1.10574 - sy, c.cx * 0.7324 - sx) - hd)), 3)
                     else 0.55 + 0.45 * cos(atan2(c.cy * 1.10574 - sy, c.cx * 0.7324 - sx) - hd) end)
             * (0.85 + random() * 0.3) desc
    limit 1;
  if t is null then return array[start]; end if;
  cur := t;
  while cur is not null loop path := cur || path; select par into cur from _wk where node = cur; end loop;
  select cx * 0.7324, cy * 1.10574 into tx, ty from cards where id = t;
  update profiles set heading = atan2(ty - sy, tx - sx), aim = false where id = u;   -- la prochaine fois, à peu près la même direction
  return path;
end $$;

-- Lancer le dé : le pion avance et s'arrête sur un immeuble
-- Lancer le dé, puis CHOISIR où aller : le dé décide de la distance, le joueur choisit parmi
-- (jusqu'à) 4 immeubles atteignables, un par direction. Puis go_to(immeuble) fait voler la montgolfière.
alter table profiles add column if not exists pend int[];          -- destinations proposées après le dé
alter table profiles add column if not exists pend_die int;        -- le résultat du dé en attente

-- atterrissage sur l'immeuble t (salaire, loyer de passage, bonus, Chance)
create or replace function _land(u uuid, t int, a int, path int[]) returns json
language plpgsql as $$
#variable_conflict use_column
declare c cards; sq jsonb; toll numeric := 0; cap numeric; ratio numeric := 1; payees jsonb := '[]'; ch jsonb := null; o record; bonus bigint := 0;
begin
  update profiles set pos = t, land = t, cash = cash + (pawn_cfg()->>'salary')::bigint where id = u;   -- petit salaire à chaque lancer
  perform _log(u, 'salary', (pawn_cfg()->>'salary')::bigint, 'Salaire du tour', t);
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
        insert into news(kind, arr, card, actor, data) values ('toll', c.arr, t, u, jsonb_build_object('to', o.owner, 'pseudo', o.pseudo, 'amount', floor(o.amt * ratio)));
      end if;
    end loop;
    toll := floor(toll * ratio);
    update profiles set cash = greatest(0, cash - toll::bigint) where id = u;
    perform _log(u, 'toll_paid', -toll::bigint, 'Loyer de passage payé', t);
  end if;
  sq := _square(u, t);
  -- chez soi : une journée de loyer de ses biens ici en bonus
  if (sq->>'mine')::int > 0 then
    bonus := floor(c.rent::numeric * (sq->>'mine')::int);
    update profiles set cash = cash + bonus where id = u;
    perform _log(u, 'bonus', bonus, 'Bonus : chez vous', t);
  end if;
  if _is_chance(t) then ch := _chance(u); end if;
  if ch ? 'extra' and ch->'extra' <> 'null'::jsonb then perform _refresh_mayors(array[(select arr from cards where id = (ch->'extra'->>'card')::int)::int]); end if;
  return json_build_object('die', a, 'path', path, 'landing', json_build_object(
      'card', t, 'toll', toll, 'payees', payees, 'chance', ch, 'bonus', bonus, 'salary', (pawn_cfg()->>'salary')::bigint, 'free', (sq->>'free')::int, 'mine', (sq->>'mine')::int),
    'state', state());
end $$;

-- jusqu'à 4 destinations à exactement n pas : la plus lointaine dans chaque direction (est, nord, ouest, sud)
create or replace function _options(u uuid, start int, n int) returns jsonb
language plpgsql as $$
#variable_conflict use_column
declare sx float8; sy float8; q int; t int; dmax int; out jsonb := '[]'; seen int[] := '{}';
begin
  select cx * 0.7324, cy * 1.10574 into sx, sy from cards where id = start;
  create temp table if not exists _wk(node int primary key, d int, par int) on commit drop;
  truncate _wk; insert into _wk select * from _reach(start, n);
  select max(d) into dmax from _wk;
  for q in 0..3 loop
    select r.node into t from _wk r join cards c on c.id = r.node
      where r.d >= dmax - 1 and r.node <> all(seen) and r.node <> start
        and cos(atan2(c.cy * 1.10574 - sy, c.cx * 0.7324 - sx) - q * pi() / 2) > 0.5
      order by sqrt(power(c.cx * 0.7324 - sx, 2) + power(c.cy * 1.10574 - sy, 2)) * cos(atan2(c.cy * 1.10574 - sy, c.cx * 0.7324 - sx) - q * pi() / 2) desc
      limit 1;
    if t is not null then
      seen := seen || t;
      out := out || (_square(u, t) || jsonb_build_object('dir', q,
        'owners', (select coalesce(jsonb_agg(distinct p.pseudo), '[]') from (select owner from lots where card = t and owner <> u union select owner from parts where card = t and owner <> u) z join profiles p on p.id = z.owner)));
    end if;
    t := null;
  end loop;
  return out;
end $$;

create or replace function roll() returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles; a int; nxt int; opts jsonb;
begin
  perform _sync(u); perform _regen(u);
  select * into pr from profiles where id=u for update;
  if not exists (select 1 from edges limit 1) then raise exception 'Le plan des rues n''est pas encore chargé'; end if;
  -- un dé déjà lancé, pas encore joué : on repropose les mêmes destinations
  if pr.pend is not null and array_length(pr.pend, 1) > 0 then
    select coalesce(jsonb_agg(_square(u, x) || jsonb_build_object('dir', o - 1,
      'owners', (select coalesce(jsonb_agg(distinct p.pseudo), '[]') from (select owner from lots where card = x and owner <> u union select owner from parts where card = x and owner <> u) z join profiles p on p.id = z.owner))), '[]')
      into opts from unnest(pr.pend) with ordinality as w(x, o);
    return json_build_object('die', pr.pend_die, 'options', opts, 'state', state());
  end if;
  if pr.rolls <= 0 then
    nxt := ceil(extract(epoch from (pr.rolls_at + ((pawn_cfg()->>'rollEveryMin') || ' minutes')::interval - now())) / 60);
    raise exception 'Plus de lancers pour l''instant : le prochain arrive dans % min', greatest(1, nxt);
  end if;
  a := 1 + floor(random() * (pawn_cfg()->>'dieMax')::int)::int;
  update profiles set rolls = rolls - 1, dice = null, moves = null,
    rolls_at = case when pr.rolls >= (pawn_cfg()->>'maxRolls')::int then now() else rolls_at end where id=u;
  opts := _options(u, pr.pos, a * (pawn_cfg()->>'stepMul')::int);
  if jsonb_array_length(opts) = 0 then
    return json_build_object('die', a, 'path', array[pr.pos], 'landing', null, 'state', state());
  end if;
  update profiles set pend = (select array_agg((e->>'card')::int) from jsonb_array_elements(opts) e), pend_die = a where id = u;
  return json_build_object('die', a, 'options', opts, 'state', state());
end $$;

-- aller sur l'une des destinations proposées
create or replace function go_to(p_card int) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles; path int[] := '{}'; cur int; a int;
begin
  perform _sync(u);
  select * into pr from profiles where id=u for update;
  if pr.pend is null or not (p_card = any(pr.pend)) then raise exception 'Lancez d''abord le dé'; end if;
  a := pr.pend_die;
  create temp table if not exists _wk(node int primary key, d int, par int) on commit drop;
  truncate _wk; insert into _wk select * from _reach(pr.pos, a * (pawn_cfg()->>'stepMul')::int);
  cur := p_card;
  while cur is not null loop path := cur || path; select par into cur from _wk where node = cur; end loop;
  if path[1] is distinct from pr.pos then path := array[pr.pos, p_card]; end if;
  update profiles set pend = null, pend_die = null, heading = null where id = u;
  return _land(u, p_card, a, path);
end $$;

-- ancienne version (choisir la direction avant le dé) : on garde le nom, même comportement que roll()
create or replace function roll(p_dir float8) returns json
language plpgsql security definer set search_path = public as $$
begin return roll(); end $$;

revoke all on function _land(uuid, int, int, int[]), _options(uuid, int, int) from public, anon, authenticated;
grant execute on function roll(), roll(float8), go_to(int) to anon, authenticated;

drop function if exists move(int);

-- La téléportation est retirée du jeu (19/10/2026, migration_sans_teleport.sql) : seul le dé déplace la montgolfière
create or replace function teleport(p_card int) returns json
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'La téléportation a été retirée du jeu : seul le dé déplace la montgolfière.';
end $$;

-- Acheter des lancers de dé avec l'argent du jeu : 5 lancers, prix qui double à chaque achat dans la journée
alter table profiles add column if not exists rb_day date;
alter table profiles add column if not exists rb_n int not null default 0;
create or replace function rolls_price(p profiles) returns bigint language sql stable as $$
  select (pawn_cfg()->>'rollsPrice')::bigint * (2 ^ (case when p.rb_day = paris_today() then p.rb_n else 0 end))::bigint $$;
create or replace function buy_rolls() returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles; price bigint;
begin
  perform _sync(u); perform _regen(u);
  select * into pr from profiles where id=u for update;
  price := rolls_price(pr);
  if pr.cash < price then raise exception 'Trésorerie insuffisante : il faut %', price; end if;
  update profiles set cash = cash - price, rolls = least(99, rolls + (pawn_cfg()->>'rollsPack')::int),
    rb_n = case when rb_day = paris_today() then rb_n + 1 else 1 end, rb_day = paris_today() where id=u;
  return state();
end $$;
revoke all on function rolls_price(profiles) from public, anon, authenticated;
grant execute on function buy_rolls() to anon, authenticated;

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
revoke all on function teleport(int) from anon, authenticated;
grant execute on function roll() to anon, authenticated;
revoke all on function _dist(int,int), _is_chance(int), _regen(uuid), _reach(int,int), _near_or_fail(uuid,int), pawn_cfg(), _square(uuid,int), _walk(uuid,int,int) from public, anon, authenticated;
