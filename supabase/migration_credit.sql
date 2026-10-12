-- Haussmann · mise à jour du 12/10 : crédit immobilier + le pion ne tourne plus en rond.
-- À coller dans Supabase → SQL Editor → Run (une seule fois).

alter table lots add column if not exists loan bigint;
alter table parts add column if not exists loan bigint;


create or replace function cfg() returns jsonb language sql immutable as $$ select '{
  "start":1000000, "welcome":5, "pack":150000, "freeH":24,
  "fee":0.05, "mortRate":0.5, "mortDaily":0.005, "creditDown":0.3, "creditShare":0.5, "creditMax":3,
  "floorBonus":1.25, "titleBonus":1.6, "gardien":1.2, "cityShare":0.01,
  "tax":0.08
}'::jsonb $$;

create or replace function _sync(p uuid) returns void language plpgsql as $$
#variable_conflict use_column
declare pr profiles; secs float8; x record; w city_week; net float8 := 0; t float8;
begin
  select * into pr from profiles where id=p for update;
  with d as (delete from pay where owner=p returning amount) select coalesce(sum(amount),0) into t from d;
  if t > 0 then update profiles set cash = cash + t::bigint where id=p; end if;
  secs := extract(epoch from (now() - pr.rent_at));
  if secs < 1 then return; end if;
  for x in select * from _rates(p) loop
    t := x.rate * x.tax * secs / 86400;
    net := net + x.rate * secs / 86400 - t;
    if t >= 1 then insert into pay(owner, amount, why) values (x.mayor, floor(t)::bigint, 'taxe'); end if;
  end loop;
  w := _week();
  if w.party is not null and w.party = pr.party then net := net + w.bonus * secs / 86400; end if;
  -- crédit immobilier : la moitié du loyer de base de chaque bien à crédit part à la banque, jusqu'au remboursement
  with r as (select l.card, l.k, least(l.loan, floor(c.rent * (cfg()->>'creditShare')::float8 * secs / 86400))::bigint amt
             from lots l join cards c on c.id = l.card where l.owner = p and l.loan > 0 and l.mort is null),
       u1 as (update lots set loan = nullif(lots.loan - r.amt, 0) from r where lots.card = r.card and lots.k = r.k returning r.amt)
  select coalesce(sum(amt), 0) into t from u1;
  net := net - t;
  with r as (select x.card, least(x.loan, floor(c.rent * x.n * (cfg()->>'creditShare')::float8 * secs / 86400))::bigint amt
             from parts x join cards c on c.id = x.card where x.owner = p and x.loan > 0 and x.mort is null),
       u2 as (update parts set loan = nullif(parts.loan - r.amt, 0) from r where parts.card = r.card and parts.owner = p returning r.amt)
  select coalesce(sum(amt), 0) into t from u2;
  net := net - t;
  update profiles set cash = greatest(0, cash + floor(net)::bigint), rent_at = now() where id=p;
end $$;

create or replace function _credits(u uuid) returns int language sql stable as $$
  select count(distinct card)::int from (select card from lots where owner=u and loan > 0 union select card from parts where owner=u and loan > 0) x $$;

create or replace function _pay_or_borrow(u uuid, price bigint, credit boolean) returns bigint language plpgsql as $$
declare have bigint; down bigint;
begin
  select p.cash into have from profiles p where id=u for update;
  if not coalesce(credit, false) then
    if have < price then raise exception 'Trésorerie insuffisante'; end if;
    update profiles set cash = cash - price where id=u; return 0;
  end if;
  if _credits(u) >= (cfg()->>'creditMax')::int then raise exception 'Vous avez déjà % crédits en cours : remboursez-en un d''abord', (cfg()->>'creditMax')::int; end if;
  down := ceil(price * (cfg()->>'creditDown')::numeric);
  if have < down then raise exception 'Apport insuffisant : il faut % € (30 %% du prix)', down; end if;
  update profiles set cash = cash - down where id=u;
  return price - down;
end $$;

drop function if exists bank_buy(int,int);

create or replace function bank_buy(p_card int, p_k int default null, p_credit boolean default false) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
-- Achat direct d'un logement libre (p_k null = le premier libre) ou d'une part de monument, comptant ou à crédit
declare u uuid := _need_me(); c cards; sold int; vk int; loan bigint;
begin
  perform _sync(u);
  select * into c from cards where id=p_card;
  if not found then raise exception 'Bien inconnu'; end if;
  perform 1 from profiles where id=u for update;
  if not coalesce(p_credit, false) and (select cash from profiles where id=u) < c.v then raise exception 'Trésorerie insuffisante'; end if;
  perform _near_or_fail(u, c.id);
  if c.lk = 'p' then
    perform 1 from cards where id=c.id for update;
    select coalesce(sum(n),0) into sold from parts where card=c.id;
    if sold >= c.lots then raise exception 'Plus de parts disponibles'; end if;
    loan := _pay_or_borrow(u, c.v, p_credit);
    insert into parts(card,owner,n,loan) values (c.id,u,1,nullif(loan,0)) on conflict (card,owner) do update set n = parts.n + 1, loan = nullif(coalesce(parts.loan,0) + excluded.loan, 0);
  else
    if p_k is null then
      select g into vk from generate_series(0, c.lots-1) g where not exists (select 1 from lots where card=c.id and k=g) order by g limit 1;
      if vk is null then raise exception 'Plus aucun logement libre dans cet immeuble'; end if;
    else vk := p_k; end if;
    if vk < 0 or vk >= c.lots then raise exception 'Lot inconnu'; end if;
    if exists (select 1 from lots where card=c.id and k=vk) then raise exception 'Ce logement vient d''être pris'; end if;
    loan := _pay_or_borrow(u, c.v, p_credit);
    insert into lots(card,k,owner,loan) values (c.id,vk,u,nullif(loan,0)) on conflict do nothing;
    if not found then raise exception 'Ce logement vient d''être pris'; end if;
    if (select count(*) from lots where card=c.id and owner=u) = c.lots and c.lots > 1 then
      insert into news(kind, arr, card, actor) values ('title', c.arr, c.id, u);
    end if;
  end if;
  perform _add_value(u, c.arr, c.v);
  perform _refresh_mayors(array[c.arr::int]);
  return state();
end $$;

drop function if exists buy_building(int);

create or replace function buy_building(p_card int, p_credit boolean default false) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); c cards; total bigint; loan bigint;
begin
  perform _sync(u);
  select * into c from cards where id=p_card;
  if not found or c.lk = 'p' then raise exception 'Bien inconnu'; end if;
  if exists (select 1 from lots where card=c.id) then raise exception 'Une partie de cet immeuble appartient déjà à quelqu''un'; end if;
  perform _near_or_fail(u, c.id);
  total := c.v * c.lots;
  loan := _pay_or_borrow(u, total, p_credit);
  begin
    -- le crédit est réparti sur les logements de l'immeuble
    insert into lots(card,k,owner,loan) select c.id, g, u, nullif(floor(loan / c.lots) + case when g = 0 then loan - floor(loan / c.lots) * c.lots else 0 end, 0)
      from generate_series(0,c.lots-1) g;
  exception when unique_violation then raise exception 'Un logement vient d''être pris, réessayez'; end;
  perform _add_value(u, c.arr, total);
  perform _refresh_mayors(array[c.arr::int]);
  if c.lots > 1 then insert into news(kind, arr, card, actor) values ('title', c.arr, c.id, u); end if;
  return state();
end $$;

create or replace function list_item(p_card int, p_k int, p_n int, p_price bigint) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); c cards; have int; listed int;
begin
  select * into c from cards where id=p_card;
  if p_price is null or p_price <= 0 then raise exception 'Indiquez un prix'; end if;
  if c.lk = 'p' then
    if exists (select 1 from parts where card=p_card and owner=u and loan > 0) then raise exception 'Remboursez d''abord le crédit de ce bien pour le vendre'; end if;
    select n into have from parts where card=p_card and owner=u and mort is null;
    select coalesce(sum(n),0) into listed from listings where card=p_card and seller=u;
    if coalesce(have,0) - listed < greatest(1,p_n) then raise exception 'Pas assez de parts disponibles'; end if;
    insert into listings(seller,card,k,n,price) values (u,p_card,null,greatest(1,p_n),p_price);
  else
    if not exists (select 1 from lots where card=p_card and k=p_k and owner=u and mort is null) then raise exception 'Ce logement n''est pas à vous ou est hypothéqué'; end if;
    if exists (select 1 from lots where card=p_card and k=p_k and loan > 0) then raise exception 'Remboursez d''abord le crédit de ce logement pour le vendre'; end if;
    insert into listings(seller,card,k,n,price) values (u,p_card,p_k,1,p_price);
  end if;
  return state();
end $$;

create or replace function mortgage(p_card int, p_k int) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); c cards; a bigint; n int;
begin
  perform _sync(u);
  select * into c from cards where id=p_card;
  if p_k is null then
    if exists (select 1 from parts where card=p_card and owner=u and loan > 0) then raise exception 'Ce bien est déjà à crédit : impossible de l''hypothéquer'; end if;
    select x.n into n from parts x where card=p_card and owner=u and mort is null;
    if n is null then raise exception 'Rien à hypothéquer'; end if;
    delete from listings where card=p_card and seller=u;
    a := floor(c.v*n*(cfg()->>'mortRate')::numeric);
    update parts set mort=a, mort_at=now() where card=p_card and owner=u;
  else
    a := floor(c.v*(cfg()->>'mortRate')::numeric);
    if exists (select 1 from lots where card=p_card and k=p_k and loan > 0) then raise exception 'Ce logement est déjà à crédit : impossible de l''hypothéquer'; end if;
    update lots set mort=a, mort_at=now() where card=p_card and k=p_k and owner=u and mort is null;
    if not found then raise exception 'Rien à hypothéquer'; end if;
    delete from listings where card=p_card and k=p_k;
  end if;
  update profiles set cash = cash + a where id=u;
  return state();
end $$;

create or replace function repay(p_card int) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); due bigint;
begin
  perform _sync(u);
  select coalesce((select sum(loan) from lots where card=p_card and owner=u), 0) + coalesce((select sum(loan) from parts where card=p_card and owner=u), 0) into due;
  if due <= 0 then raise exception 'Pas de crédit sur ce bien'; end if;
  perform 1 from profiles where id=u for update;
  if (select cash from profiles where id=u) < due then raise exception 'Trésorerie insuffisante : il faut %', due; end if;
  update profiles set cash = cash - due where id=u;
  update lots set loan = null where card=p_card and owner=u;
  update parts set loan = null where card=p_card and owner=u;
  return state();
end $$;

create or replace function my_holdings() returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'lots',  coalesce((select json_agg(json_build_array(card, k, mort, mort_at, loan)) from lots where owner = auth.uid()), '[]'),
    'parts', coalesce((select json_agg(json_build_array(card, n, mort, mort_at, loan)) from parts where owner = auth.uid()), '[]'),
    'fx',    coalesce((select json_agg(row_to_json(f)) from fx f where owner = auth.uid() and until > now()), '[]'))
$$;

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
    'roll_in', case when pr.rolls >= (pawn_cfg()->>'maxRolls')::int then 0 else greatest(0, extract(epoch from (pr.rolls_at + ((pawn_cfg()->>'rollEveryMin') || ' minutes')::interval - now())))::int end,
    'now', now());
end $$;

create or replace function _walk(u uuid, start int, n int) returns int[] language plpgsql as $$
#variable_conflict use_column
declare cur int := start; path int[] := array[start]; hd float8; x0 int; y0 int; sx int; sy int; best record; i int; d float8;
begin
  select coalesce(heading, random() * 2 * pi()) + (random() - 0.5) * 1.2 into hd from profiles where id = u;
  select cx, cy into sx, sy from cards where id = start;
  for i in 1..n + 15 loop
    select cx, cy into x0, y0 from cards where id = cur;
    select e.b node, atan2((c.cy - y0) * 1.10574, (c.cx - x0) * 0.7324) brg,
           sqrt(power((c.cx - sx) * 0.7324, 2) + power((c.cy - sy) * 1.10574, 2)) dist into best
      from edges e join cards c on c.id = e.b
      where e.a = cur
      order by (e.b = any(path)),                                                     -- jamais deux fois la même case si possible
               abs(mod((atan2((c.cy - y0) * 1.10574, (c.cx - x0) * 0.7324) - hd + 3 * pi())::numeric, (2 * pi())::numeric) - pi())
               - 0.012 * sqrt(power((c.cx - sx) * 0.7324, 2) + power((c.cy - sy) * 1.10574, 2))   -- s'éloigner du départ
               + random() * 0.5
      limit 1;
    exit when best.node is null;
    hd := hd + 0.5 * (mod((best.brg - hd + 3 * pi())::numeric, (2 * pi())::numeric) - pi());
    cur := best.node; path := path || cur; d := best.dist;
    exit when i >= n and d >= 60;
  end loop;
  update profiles set heading = hd where id = u;
  return path;
end $$;

create or replace function leaderboard() returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x), '[]') from (
    select p.id, p.pseudo, p.party,
           p.cash + coalesce((select sum(v) from arr_value a where a.owner=p.id),0)
                  - coalesce((select sum(mort) from lots l where l.owner=p.id),0)
                  - coalesce((select sum(mort) from parts t where t.owner=p.id),0)
                  - coalesce((select sum(loan) from lots l where l.owner=p.id),0)
                  - coalesce((select sum(loan) from parts t where t.owner=p.id),0) as worth,
           (select count(*) from arr_state s where s.mayor=p.id) as mayorships
    from profiles p order by worth desc limit 50) x
$$;

revoke all on function _credits(uuid), _pay_or_borrow(uuid,bigint,boolean), _walk(uuid,int,int), _sync(uuid), cfg() from public, anon, authenticated;
grant execute on function bank_buy(int,int,boolean), buy_building(int,boolean), repay(int), list_item(int,int,int,bigint), mortgage(int,int), my_holdings(), state(), leaderboard() to anon, authenticated;
notify pgrst, 'reload schema';
