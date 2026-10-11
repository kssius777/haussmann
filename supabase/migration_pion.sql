-- Haussmann · mise à jour : achat direct, parti plus tard, PION ET DÉS
-- À coller dans Supabase → SQL Editor → Run (une seule fois). Elle contient aussi la mise à jour du 11/10.

drop function if exists join_game(text,text);
drop function if exists bank_buy(int,int);

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

create or replace function join_game(p_pseudo text, p_party text default null) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Connexion requise'; end if;
  if p_party is not null and p_party not in ('poing','tendue','milieu','valeurs','rempart') then raise exception 'Parti inconnu'; end if;
  if char_length(trim(coalesce(p_pseudo,''))) < 2 then raise exception 'Le pseudo doit faire au moins 2 caractères'; end if;
  if exists (select 1 from profiles where lower(pseudo)=lower(trim(p_pseudo)) and id<>u) then raise exception 'Ce pseudo est déjà pris'; end if;
  insert into profiles(id, pseudo, party, party_at) values (u, trim(p_pseudo), p_party, case when p_party is null then null else now() end)
    on conflict (id) do update set pseudo = excluded.pseudo;
  return state();
end $$;

create or replace function set_party(p_party text) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles;
begin
  if p_party not in ('poing','tendue','milieu','valeurs','rempart') then raise exception 'Parti inconnu'; end if;
  perform _sync(u);
  select * into pr from profiles where id=u for update;
  -- premier choix libre ; ensuite un changement toutes les 48 h
  if pr.party is not null and pr.party_at is not null and pr.party_at > now() - interval '48 hours' then
    raise exception 'Vous pourrez changer de parti dans % h', ceil(extract(epoch from (pr.party_at + interval '48 hours' - now()))/3600);
  end if;
  update profiles set party=p_party, party_at=now() where id=u;
  update arr_state set party=p_party where mayor=u;
  return state();
end $$;

create or replace function state() returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := auth.uid(); pr profiles; gross float8 := 0; taxes float8 := 0; x record; w city_week; ev day_event; price bigint;
begin
  if u is null then return json_build_object('profile', null); end if;
  if not exists (select 1 from profiles where id=u) then return json_build_object('profile', null, 'uid', u); end if;
  perform _sync(u); perform _regen(u);
  select * into pr from profiles where id=u;
  for x in select * from _rates(u) loop gross := gross + x.rate; taxes := taxes + x.rate*x.tax; end loop;
  w := _week(); ev := _event();
  if w.party is not null and w.party = pr.party then gross := gross + w.bonus; end if;
  price := (cfg()->>'pack')::bigint * (2 ^ (case when pr.bought_day = paris_today() then pr.bought_n else 0 end))::bigint;
  return json_build_object(
    'uid', u, 'profile', row_to_json(pr),
    'rate', round(gross - taxes), 'gross', round(gross), 'taxes', round(taxes),
    'free_in', case when pr.free_at is null then 0 else greatest(0, extract(epoch from (pr.free_at + interval '24 hours' - now())))::int end,
    'price', price, 'week', row_to_json(w), 'event', row_to_json(ev),
    'value', coalesce((select sum(v) from arr_value where owner=u),0),
    'debt',  coalesce((select sum(mort) from lots where owner=u),0) + coalesce((select sum(mort) from parts where owner=u),0),
    'roll_in', case when pr.rolls >= (pawn_cfg()->>'maxRolls')::int then 0 else greatest(0, extract(epoch from (pr.rolls_at + ((pawn_cfg()->>'rollEveryMin') || ' minutes')::interval - now())))::int end,
    'now', now());
end $$;

create or replace function bank_buy(p_card int, p_k int default null) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
-- Achat direct d'un logement libre (p_k null = le premier libre) ou d'une part de monument
declare u uuid := _need_me(); c cards; sold int; vk int;
begin
  perform _sync(u);
  select * into c from cards where id=p_card;
  if not found then raise exception 'Bien inconnu'; end if;
  perform 1 from profiles where id=u for update;
  if (select cash from profiles where id=u) < c.v then raise exception 'Trésorerie insuffisante'; end if;
  perform _near_or_fail(u, c.id);
  if c.lk = 'p' then
    perform 1 from cards where id=c.id for update;
    select coalesce(sum(n),0) into sold from parts where card=c.id;
    if sold >= c.lots then raise exception 'Plus de parts disponibles'; end if;
    insert into parts(card,owner,n) values (c.id,u,1) on conflict (card,owner) do update set n = parts.n + 1;
  else
    if p_k is null then
      select g into vk from generate_series(0, c.lots-1) g where not exists (select 1 from lots where card=c.id and k=g) order by g limit 1;
      if vk is null then raise exception 'Plus aucun logement libre dans cet immeuble'; end if;
    else vk := p_k; end if;
    if vk < 0 or vk >= c.lots then raise exception 'Lot inconnu'; end if;
    insert into lots(card,k,owner) values (c.id,vk,u) on conflict do nothing;
    if not found then raise exception 'Ce logement vient d''être pris'; end if;
    if (select count(*) from lots where card=c.id and owner=u) = c.lots and c.lots > 1 then
      insert into news(kind, arr, card, actor) values ('title', c.arr, c.id, u);
    end if;
  end if;
  update profiles set cash = cash - c.v where id=u;
  perform _add_value(u, c.arr, c.v);
  perform _refresh_mayors(array[c.arr::int]);
  return state();
end $$;

create or replace function buy_building(p_card int) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); c cards; total bigint;
begin
  perform _sync(u);
  select * into c from cards where id=p_card;
  if not found or c.lk = 'p' then raise exception 'Bien inconnu'; end if;
  if exists (select 1 from lots where card=c.id) then raise exception 'Une partie de cet immeuble appartient déjà à quelqu''un'; end if;
  perform _near_or_fail(u, c.id);
  total := c.v * c.lots;
  perform 1 from profiles where id=u for update;
  if (select cash from profiles where id=u) < total then raise exception 'Trésorerie insuffisante'; end if;
  begin
    insert into lots(card,k,owner) select c.id, g, u from generate_series(0,c.lots-1) g;
  exception when unique_violation then raise exception 'Un logement vient d''être pris, réessayez'; end;
  update profiles set cash = cash - total where id=u;
  perform _add_value(u, c.arr, total);
  perform _refresh_mayors(array[c.arr::int]);
  if c.lots > 1 then insert into news(kind, arr, card, actor) values ('title', c.arr, c.id, u); end if;
  return state();
end $$;

revoke all on function join_game(text,text), set_party(text), state(), bank_buy(int,int), buy_building(int) from public;
grant execute on function join_game(text,text), set_party(text), state(), bank_buy(int,int), buy_building(int), roll(), move(int), teleport(int) to anon, authenticated;
notify pgrst, 'reload schema';
