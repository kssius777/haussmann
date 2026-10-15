-- Haussmann · on lance le dé, PUIS on choisit où aller (jusqu'à 4 destinations). Rejouable sans risque.
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

-- se téléporter annule les destinations en attente
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
  update profiles set pos = p_card, land = p_card, dice = null, moves = null, pend = null, pend_die = null, tp = tp - 1 where id=u;
  return state();
end $$;
