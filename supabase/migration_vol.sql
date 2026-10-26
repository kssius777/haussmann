-- =====================================================================
--  La montgolfière vole où l'on veut (26/10/2026, demande du propriétaire : « le système du dé, c'est un peu galère parce que
--  c'est dur d'arriver exactement là où on veut ; en cliquant, on va se déplacer là où on veut, pile poil »). Le dé s'en va.
--  Choix du propriétaire le même jour :
--   · des km qui se rechargent : 5 km au plus, +500 m toutes les 30 min (en continu), 20 000 € de salaire par km volé sur ces km
--     (Gauche : doublé) ; +2 km contre 50 000 € (le prix double à chaque achat dans la journée), sans salaire ;
--   · le péage : survoler (à 25 m près) l'immeuble d'un autre joueur = lui payer le loyer écrit sur sa carte (un logement, une part),
--     une fois par jour par immeuble, jamais plus de 10 % de son argent par vol ; à plusieurs propriétaires, chacun sa part
--     (logements ou parts non hypothéqués) ; Extrême gauche : moitié prix ; Extrême droite : +50 % pour lui ;
--   · on n'achète à la banque que là où l'on s'est posé ; les « ? » : en s'y posant ; plus de bonus « chez soi » (on ferait des
--     allers-retours entre ses biens) ; le métro reste.
--  roll, dice_go, go_to, buy_rolls refusent (les sites d'avant). Chiffres : _world_cfg(). Rejouable sans risque.
-- =====================================================================

alter table profiles add column if not exists km_free float8 not null default 5;            -- les km offerts (ils se rechargent)
alter table profiles add column if not exists km_at timestamptz not null default now();     -- depuis quand km_free se recharge
alter table profiles add column if not exists km_buy float8 not null default 0;             -- les km achetés (sans salaire)

-- les immeubles déjà payés aujourd'hui par chacun (une fois par jour par immeuble)
create table if not exists toll_seen (
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  card int not null,
  primary key (user_id, day, card)
);
alter table toll_seen enable row level security;
revoke all on table toll_seen from public, anon, authenticated;

create or replace function _world_cfg() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'kmMax', 5, 'kmStep', 0.5, 'kmEvery', 30, 'kmPack', 2, 'kmPrice', 50000, 'salaryKm', 20000,
    'tollR', 25, 'tollCap', 0.1, 'flyMax', 12000,
    'runSpeed', 180, 'runMin', 1.2, 'runMax', 3,
    'ticket', 5000, 'reach', 120, 'reachBig', 300, 'chanceR', 40, 'chancePct', 30,
    'freeKm', 5, 'kmPriceOld', 10000, 'salary', 20000, 'toll', 0.05, 'step', 100, 'speed', 22, 'maxDur', 60,   -- (les sites d'avant)
    'w', 2.210, 'e', 2.480, 's', 48.805, 'n', 48.910,
    'start', jsonb_build_array(2.3488, 48.8530)) $$;
revoke all on function _world_cfg() from public, anon, authenticated;

-- les km offerts maintenant : ce qu'on avait, plus 500 m par demi-heure depuis, 5 au plus
create or replace function _kmfree(p profiles) returns float8 language sql stable as $$
  select least((_world_cfg()->>'kmMax')::float8, greatest(0, p.km_free) + greatest(0, extract(epoch from now() - p.km_at))
    / ((_world_cfg()->>'kmEvery')::float8 * 60) * (_world_cfg()->>'kmStep')::float8) $$;
-- le prix de 2 km en plus (il double à chaque achat dans la journée)
create or replace function km_price(p profiles) returns bigint language sql stable as $$
  select (_world_cfg()->>'kmPrice')::bigint * (2 ^ (case when p.rb_day = paris_today() then p.rb_n else 0 end))::bigint $$;

-- le péage d'un vol de (ax, ay) à (bx, by) : chaque immeuble d'un autre joueur survolé à 25 m près, pas encore payé aujourd'hui,
-- coûte le loyer écrit sur sa carte (partagé entre ses propriétaires) ; excl : l'immeuble d'où l'on part (déjà payé en arrivant)
create or replace function _ftoll(u uuid, ax float8, ay float8, bx float8, by_ float8, excl int) returns jsonb language plpgsql as $$
declare cfg jsonb := _world_cfg(); rr float8 := (cfg->>'tollR')::float8; me text := _party(u); tot numeric := 0; cap numeric; ratio numeric := 1;
  o record; hits jsonb; nb int; today date := paris_today(); dd float8;
begin
  create temp table if not exists _ft(card int, owner uuid, amt numeric, t float8) on commit drop;
  truncate _ft;
  dd := power((bx - ax) * 73240, 2) + power((by_ - ay) * 110574, 2);
  insert into _ft
  with cand as (
         select c.id, c.rent, c.cx / 1e5 lo, c.cy / 1e5 la from cards c
         where c.cx between floor((least(ax, bx) - rr / 73240) * 1e5) and ceil((greatest(ax, bx) + rr / 73240) * 1e5)
           and c.cy between floor((least(ay, by_) - rr / 110574) * 1e5) and ceil((greatest(ay, by_) + rr / 110574) * 1e5)
           and c.id is distinct from excl),
       near as (
         select cand.*, case when dd = 0 then 0 else greatest(0, least(1, ((cand.lo - ax) * 73240 * (bx - ax) * 73240 + (cand.la - ay) * 110574 * (by_ - ay) * 110574) / dd)) end t
         from cand where _wsegd(cand.lo, cand.la, ax, ay, bx, by_) <= rr
           and not exists (select 1 from toll_seen s where s.user_id = u and s.day = today and s.card = cand.id)),
       own as (
         select l.card, l.owner, 1::numeric n from lots l join near on near.id = l.card where l.owner <> u and l.mort is null
         union all select x.card, x.owner, x.n::numeric from parts x join near on near.id = x.card where x.owner <> u and x.mort is null and x.n > 0),
       sh as (select own.card, own.owner, sum(own.n) n from own group by own.card, own.owner),
       tt as (select sh.card, sum(sh.n) n from sh group by sh.card)
  -- (pouvoirs des partis : Extrême gauche paie moitié prix ; un propriétaire d'Extrême droite touche 50 % de plus)
  select near.id, sh.owner, near.rent::numeric * sh.n / tt.n * (case when me = 'poing' then 0.5 else 1 end)
           * (case when (select party from profiles where id = sh.owner) = 'rempart' then 1.5 else 1 end), near.t
  from near join sh on sh.card = near.id join tt on tt.card = near.id;
  select coalesce(sum(amt), 0), count(distinct card) into tot, nb from _ft;
  if tot < 1 then return jsonb_build_object('toll', 0, 'n', 0, 'hits', '[]'::jsonb); end if;
  insert into toll_seen(user_id, day, card) select distinct u, today, card from _ft on conflict do nothing;
  cap := floor((select cash from profiles where id = u) * (cfg->>'tollCap')::numeric);
  if tot > cap then ratio := case when tot = 0 then 0 else cap / tot end; end if;
  for o in select t.owner, sum(t.amt) amt from _ft t group by t.owner loop
    if floor(round(o.amt * ratio, 4)) >= 1 then insert into pay(owner, amount, why) values (o.owner, floor(round(o.amt * ratio, 4)), 'loyer de passage'); end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_array(h.card, h.a, round(h.t::numeric, 3)) order by h.t), '[]') into hits
    from (select card, floor(round(sum(amt) * ratio, 4)) a, min(t) t from _ft group by card order by min(t) limit 80) h;
  tot := least(cap, floor(round(tot * ratio, 4)));
  if tot >= 1 then
    update profiles set cash = greatest(0, cash - tot::bigint) where id = u;
    perform _log(u, 'toll_paid', -tot::bigint, 'Péage · ' || nb || ' immeuble' || case when nb > 1 then 's' else '' end);
  end if;
  return jsonb_build_object('toll', tot, 'n', nb, 'hits', hits, 'cap', ratio < 1, 'perk', case when me = 'poing' then 'poing' end);
end $$;

-- voler : jusqu'à un immeuble (p_card : on s'y pose, sa case s'ouvre) ou un point de la carte ; tout droit, au-dessus des toits
create or replace function fly(p_lon float8, p_lat float8, p_card int default null) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); cfg jsonb := _world_cfg(); pr profiles; w walkers; x world_people; c cards; cur float8[];
  lo float8; la float8; v_len float8; km float8; kf float8; use_free float8; use_buy float8; sal bigint := 0; v_dur float8; v_path jsonb;
  c0 int; c1 int; tl jsonb; ch jsonb := null; sq jsonb := null; me text; from_card int;
begin
  perform _sync(u);
  select * into pr from profiles where id = u for update;
  select * into x from world_people where user_id = u for update;
  if not found then raise exception 'Revenez dans Paris'; end if;
  select * into w from walkers where user_id = u for update;
  if not found then raise exception 'Revenez dans Paris'; end if;
  if w.dur > 0 and now() < w.t0 + make_interval(secs => w.dur) then raise exception 'Attendez d''être arrivé'; end if;
  cur := _wpos(w);
  if p_card is not null then
    select * into c from cards where id = p_card;
    if not found then raise exception 'Immeuble inconnu'; end if;
    lo := c.cx / 1e5; la := c.cy / 1e5;
  else lo := p_lon; la := p_lat; end if;
  if lo is null or la is null or lo < (cfg->>'w')::float8 or lo > (cfg->>'e')::float8 or la < (cfg->>'s')::float8 or la > (cfg->>'n')::float8 then
    raise exception 'Restez dans Paris';
  end if;
  v_len := _wm(cur[1], cur[2], lo, la);
  if v_len > (cfg->>'flyMax')::float8 then raise exception 'Trop loin pour un seul vol'; end if;
  km := v_len / 1000; kf := _kmfree(pr);
  if kf + pr.km_buy < km - 0.0005 then
    raise exception 'Pas assez de km : il vous en reste %', replace(to_char(kf + pr.km_buy, 'FM990.0'), '.', ',');
  end if;
  use_free := least(kf, km); use_buy := greatest(0, km - use_free); me := pr.party;
  sal := floor(use_free * (cfg->>'salaryKm')::numeric * case when me = 'tendue' then 2 else 1 end);   -- Gauche : salaire doublé
  from_card := pr.land;
  update profiles set km_free = kf - use_free, km_at = now(), km_buy = greatest(0, km_buy - use_buy), cash = cash + sal,
    land = p_card, pos = coalesce(p_card, pos) where id = u;
  if sal > 0 then perform _log(u, 'salary', sal, 'Salaire · ' || replace(to_char(km, 'FM990.0'), '.', ',') || ' km' || case when me = 'tendue' then ' (doublé : Gauche)' else '' end, p_card); end if;
  delete from toll_seen where user_id = u and day < paris_today() - 1;
  tl := _ftoll(u, cur[1], cur[2], lo, la, from_card);   -- (après le salaire : le plafond de 10 % le compte)
  v_dur := least((cfg->>'runMax')::float8, greatest((cfg->>'runMin')::float8, v_len / (cfg->>'runSpeed')::float8));
  v_path := jsonb_build_array(jsonb_build_array(cur[1], cur[2]), jsonb_build_array(lo, la));
  update walkers set lon0 = cur[1], lat0 = cur[2], lon = lo, lat = la, t0 = now(), dur = v_dur, len = v_len, path = v_path, settled = true where user_id = u;
  c0 := x.cell; c1 := _wcell(lo, la);
  update world_people set cell = c1, lon = lo, lat = la, seen = now() where user_id = u;
  perform _wemit(c0, u, 'move', jsonb_build_object('lon', lo, 'lat', la, 'dur', v_dur, 'path', v_path));
  if c1 <> c0 then perform _wemit(c1, u, 'move', jsonb_build_object('lon', lo, 'lat', la, 'dur', v_dur, 'path', v_path, 'join', _wperson(u))); end if;
  if p_card is not null then
    -- un « ? » du jour (stations, jardins, places) : une carte Chance, une fois par jour pour chaque « ? »
    if exists (select 1 from spots s where s.card = p_card) and _wchance_on(p_card, _wday())
       and not exists (select 1 from chance_taken k where k.user_id = u and k.day = paris_today() and k.card = p_card) then
      insert into chance_taken(user_id, day, card) values (u, paris_today(), p_card) on conflict do nothing;
      ch := _chance(u);
      if ch ? 'extra' and ch->'extra' <> 'null'::jsonb then perform _refresh_mayors(array[(select arr from cards where id = (ch->'extra'->>'card')::int)::int]); end if;
    end if;
    sq := _square(u, p_card);
  end if;
  return json_build_object('dur', v_dur, 'len', round(v_len), 'path', v_path, 'salary', sal, 'toll', tl,
    'km', round(((select _kmfree(p) + p.km_buy from profiles p where p.id = u))::numeric, 3),
    'landing', case when p_card is null then null else json_build_object('card', p_card, 'chance', ch, 'salary', sal,
      'toll', (tl->>'toll')::bigint, 'n', (tl->>'n')::int, 'perk', tl->>'perk', 'free', (sq->>'free')::int, 'mine', (sq->>'mine')::int) end,
    'state', state());
end $$;

-- 2 km en plus contre l'argent du jeu (le prix double à chaque achat dans la journée)
create or replace function buy_km() returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles; price bigint; n float8 := (_world_cfg()->>'kmPack')::float8;
begin
  perform _sync(u);
  select * into pr from profiles where id = u for update;
  price := km_price(pr);
  if pr.cash < price then raise exception 'Trésorerie insuffisante : il faut % €', price; end if;
  perform _log(u, 'km', -price, 'Achat de ' || n::int || ' km');
  update profiles set cash = cash - price, km_buy = least(99, km_buy + n),
    rb_n = case when rb_day = paris_today() then rb_n + 1 else 1 end, rb_day = paris_today() where id = u;
  return state();
end $$;

-- le dé s'en va (les sites d'avant)
create or replace function roll() returns json language plpgsql security definer set search_path = public as $$
begin raise exception 'Nouvelle version du jeu : rechargez la page'; end $$;
create or replace function roll(p_dir float8) returns json language plpgsql security definer set search_path = public as $$
begin raise exception 'Nouvelle version du jeu : rechargez la page'; end $$;
create or replace function dice_go(p_card int, p_path jsonb default null) returns json language plpgsql security definer set search_path = public as $$
begin raise exception 'Nouvelle version du jeu : rechargez la page'; end $$;
create or replace function go_to(p_card int) returns json language plpgsql security definer set search_path = public as $$
begin raise exception 'Nouvelle version du jeu : rechargez la page'; end $$;
create or replace function buy_rolls() returns json language plpgsql security definer set search_path = public as $$
begin raise exception 'Nouvelle version du jeu : rechargez la page'; end $$;
create or replace function world_move(p_lon float8, p_lat float8, p_len float8 default null, p_path jsonb default null, p_pay boolean default false) returns json
language plpgsql security definer set search_path = public as $$
begin raise exception 'Nouvelle version du jeu : rechargez la page'; end $$;
create or replace function world_chance(p_card int) returns json language plpgsql security definer set search_path = public as $$
begin raise exception 'Nouvelle version du jeu : rechargez la page'; end $$;

-- sa case : seulement là où l'on s'est posé
create or replace function world_arrive(p_card int) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me();
begin
  if (select land from profiles where id = u) is distinct from p_card then raise exception 'Allez-y d''abord'; end if;
  return state();
end $$;
create or replace function _near_or_fail(u uuid, card int) returns void language plpgsql as $$
declare l int;
begin
  select land into l from profiles where id = u;
  if l is distinct from card then raise exception 'Posez-vous dessus pour l''acheter.'; end if;
end $$;

-- le métro : depuis une station où l'on est (120 m), vers n'importe quelle station de Paris, un ticket (pas de km)
create or replace function world_metro(p_to int) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); cfg jsonb := _world_cfg(); w walkers; x world_people; here int; dh float8; t cards; cost bigint; have bigint; cur float8[]; c0 int; c1 int;
begin
  select * into x from world_people where user_id = u for update;
  if not found then raise exception 'Revenez dans Paris'; end if;
  select * into w from walkers where user_id = u for update;
  if not found then raise exception 'Revenez dans Paris'; end if;
  if w.dur > 0 and now() < w.t0 + make_interval(secs => w.dur) then raise exception 'Attendez d''être arrivé'; end if;
  cur := _wpos(w);
  select m.card, _wm(cur[1], cur[2], c.cx / 1e5, c.cy / 1e5) into here, dh
    from (select distinct card from metro_stop) m join cards c on c.id = m.card order by 2 limit 1;
  if here is null or dh > (cfg->>'reach')::float8 then raise exception 'Allez d''abord jusqu''à une station'; end if;
  if not exists (select 1 from metro_stop where card = p_to) then raise exception 'Station inconnue'; end if;
  if p_to = here then raise exception 'Vous y êtes déjà'; end if;
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
  return json_build_object('from', here, 'to', p_to, 'w', _wout(u), 'state', state());
end $$;

-- l'état du joueur : comme avant, plus ses km (offerts maintenant, achetés, le prix de 2 km de plus)
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
    'loans', coalesce((select sum(loan) from lots where owner=u),0) + coalesce((select sum(loan) from parts where owner=u),0),
    'credits', _credits(u), 'loan_cap', greatest(0, _loan_cap(u)),
    'loan_rate', coalesce((select sum(c.rent) from lots l join cards c on c.id=l.card where l.owner=u and l.loan > 0 and l.mort is null),0) * (cfg()->>'creditShare')::float8
               + coalesce((select sum(c.rent * x.n) from parts x join cards c on c.id=x.card where x.owner=u and x.loan > 0 and x.mort is null),0) * (cfg()->>'creditShare')::float8,
    'rolls_price', rolls_price(pr),
    'roll_in', case when pr.rolls >= (pawn_cfg()->>'maxRolls')::int then 0 else greatest(0, extract(epoch from (pr.rolls_at + ((pawn_cfg()->>'rollEveryMin') || ' minutes')::interval - now())))::int end,
    'km_free', round(_kmfree(pr)::numeric, 4), 'km_buy', round(pr.km_buy::numeric, 4), 'km_price', km_price(pr),
    'now', now());
end $$;

-- les destinations proposées par le dé ne valent plus rien
update profiles set pend = null, pend_die = null where pend is not null;

revoke all on function _kmfree(profiles), km_price(profiles), _ftoll(uuid, float8, float8, float8, float8, int), _near_or_fail(uuid, int) from public, anon, authenticated;
revoke all on function fly(float8, float8, int), buy_km(), roll(), roll(float8), dice_go(int, jsonb), go_to(int), buy_rolls(),
  world_move(float8, float8, float8, jsonb, boolean), world_chance(int), world_arrive(int), world_metro(int) from public, anon;
grant execute on function fly(float8, float8, int), buy_km(), roll(), roll(float8), dice_go(int, jsonb), go_to(int), buy_rolls(),
  world_move(float8, float8, float8, jsonb, boolean), world_chance(int), world_arrive(int), world_metro(int) to authenticated;
grant execute on function state() to anon, authenticated;   -- (comme avant : sans compte, state() répond « pas de profil »)
