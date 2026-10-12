-- Haussmann · mise à jour du 12/10 (2) : le pion suit le plus court chemin (fini les boucles), achat de lancers de dé.
-- À coller dans Supabase → SQL Editor → Run (une seule fois).

alter table profiles add column if not exists rb_day date;
alter table profiles add column if not exists rb_n int not null default 0;

create or replace function pawn_cfg() returns jsonb language sql immutable as $$ select '{
  "maxRolls":10, "rollEveryMin":30, "tpPerDay":3, "buyRadius":150, "tollCap":0.2, "spawn":300658, "chanceEvery":8, "stepMul":4, "dieMax":6, "rollsPrice":50000, "rollsPack":5
}'::jsonb $$;

create or replace function _walk(u uuid, start int, n int) returns int[] language plpgsql as $$
#variable_conflict use_column
declare hd float8; sx float8; sy float8; t int; cur int; path int[] := '{}'; dmax int; tx float8; ty float8;
begin
  select coalesce(heading, random() * 2 * pi()) + (random() - 0.5) * 1.8 into hd from profiles where id = u;
  select cx * 0.7324, cy * 1.10574 into sx, sy from cards where id = start;
  create temp table if not exists _wk(node int primary key, d int, par int) on commit drop;
  truncate _wk; insert into _wk select * from _reach(start, n);
  select max(d) into dmax from _wk;
  select r.node into t from _wk r join cards c on c.id = r.node
    where r.d = dmax
    order by sqrt(power(c.cx * 0.7324 - sx, 2) + power(c.cy * 1.10574 - sy, 2))
             * (0.55 + 0.45 * cos(atan2(c.cy * 1.10574 - sy, c.cx * 0.7324 - sx) - hd))
             * (0.85 + random() * 0.3) desc
    limit 1;
  if t is null then return array[start]; end if;
  cur := t;
  while cur is not null loop path := cur || path; select par into cur from _wk where node = cur; end loop;
  select cx * 0.7324, cy * 1.10574 into tx, ty from cards where id = t;
  update profiles set heading = atan2(ty - sy, tx - sx) where id = u;   -- la prochaine fois, à peu près la même direction
  return path;
end $$;

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
    'credits', _credits(u),
    'loan_rate', coalesce((select sum(c.rent) from lots l join cards c on c.id=l.card where l.owner=u and l.loan > 0 and l.mort is null),0) * (cfg()->>'creditShare')::float8
               + coalesce((select sum(c.rent * x.n) from parts x join cards c on c.id=x.card where x.owner=u and x.loan > 0 and x.mort is null),0) * (cfg()->>'creditShare')::float8,
    'rolls_price', rolls_price(pr),
    'roll_in', case when pr.rolls >= (pawn_cfg()->>'maxRolls')::int then 0 else greatest(0, extract(epoch from (pr.rolls_at + ((pawn_cfg()->>'rollEveryMin') || ' minutes')::interval - now())))::int end,
    'now', now());
end $$;

revoke all on function rolls_price(profiles), _walk(uuid,int,int), pawn_cfg() from public, anon, authenticated;
grant execute on function buy_rolls(), state() to anon, authenticated;
notify pgrst, 'reload schema';
