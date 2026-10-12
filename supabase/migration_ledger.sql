-- Haussmann · mise à jour du 12/10 (4) : historique de l'argent (ledger), départ du pion face à Notre-Dame.
-- À coller dans Supabase → SQL Editor → Run (une seule fois).

-- Historique de l'argent : chaque mouvement de trésorerie
create table if not exists ledger (
  id     bigserial primary key,
  owner  uuid not null references profiles(id) on delete cascade,
  at     timestamptz not null default now(),
  kind   text not null,          -- rent, tax, tax_in, salary, toll_paid, toll_in, buy, sale, chance, booster, rolls, mortgage, lift, repay, bonus, credit
  amount bigint not null,        -- positif = reçu, négatif = payé
  label  text,
  card   int
);
create index if not exists ledger_owner on ledger(owner, at desc);
alter table ledger enable row level security;
drop policy if exists ledger_own on ledger; create policy ledger_own on ledger for select using (owner = auth.uid());

create or replace function _log(p uuid, k text, amt bigint, lbl text default null, c int default null) returns void language plpgsql as $$
declare last ledger;
begin
  if amt = 0 then return; end if;
  -- les loyers arrivent en continu : on regroupe dans une même ligne pendant 1 h
  if k in ('rent','credit','tax') then
    select * into last from ledger where owner=p and kind=k order by at desc limit 1;
    if found and last.at > now() - interval '1 hour' then update ledger set amount = amount + amt, at = now() where id = last.id; return; end if;
  end if;
  insert into ledger(owner, kind, amount, label, card) values (p, k, amt, lbl, c);
end $$;

create or replace function _sync(p uuid) returns void language plpgsql as $$
#variable_conflict use_column
declare pr profiles; secs float8; x record; w city_week; net float8 := 0; t float8; gross float8 := 0; taxes float8 := 0; cr bigint := 0; py record;
begin
  select * into pr from profiles where id=p for update;
  for py in with d as (delete from pay where owner=p returning amount, why) select why, sum(amount) amt from d group by why loop
    update profiles set cash = cash + py.amt where id=p;
    perform _log(p, case py.why when 'taxe' then 'tax_in' when 'vente' then 'sale' else 'toll_in' end, py.amt::bigint, case py.why when 'taxe' then 'Taxe de maire reçue' when 'vente' then 'Vente au Marché' else 'Loyer de passage reçu' end);
  end loop;
  secs := extract(epoch from (now() - pr.rent_at));
  if secs < 1 then return; end if;
  for x in select * from _rates(p) loop
    t := x.rate * x.tax * secs / 86400;
    net := net + x.rate * secs / 86400 - t; gross := gross + x.rate * secs / 86400; taxes := taxes + t;
    if t >= 1 then insert into pay(owner, amount, why) values (x.mayor, floor(t)::bigint, 'taxe'); end if;
  end loop;
  w := _week();
  if w.party is not null and w.party = pr.party then net := net + w.bonus * secs / 86400; gross := gross + w.bonus * secs / 86400; end if;
  -- crédit immobilier : la moitié du loyer de base de chaque bien à crédit part à la banque, jusqu'au remboursement
  with r as (select l.card, l.k, least(l.loan, floor(c.rent * (cfg()->>'creditShare')::float8 * secs / 86400))::bigint amt
             from lots l join cards c on c.id = l.card where l.owner = p and l.loan > 0 and l.mort is null),
       u1 as (update lots set loan = nullif(lots.loan - r.amt, 0) from r where lots.card = r.card and lots.k = r.k returning r.amt)
  select coalesce(sum(amt), 0) into t from u1;
  net := net - t; cr := cr + t::bigint;
  with r as (select x.card, least(x.loan, floor(c.rent * x.n * (cfg()->>'creditShare')::float8 * secs / 86400))::bigint amt
             from parts x join cards c on c.id = x.card where x.owner = p and x.loan > 0 and x.mort is null),
       u2 as (update parts set loan = nullif(parts.loan - r.amt, 0) from r where parts.card = r.card and parts.owner = p returning r.amt)
  select coalesce(sum(amt), 0) into t from u2;
  net := net - t; cr := cr + t::bigint;
  update profiles set cash = greatest(0, cash + floor(net)::bigint), rent_at = now() where id=p;
  perform _log(p, 'rent', floor(gross)::bigint, 'Loyers');
  if taxes >= 1 then perform _log(p, 'tax', -floor(taxes)::bigint, 'Taxe des maires'); end if;
  if cr > 0 then perform _log(p, 'credit', -cr, 'Remboursement des crédits'); end if;
end $$;

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

create or replace function buy_rolls() returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles; price bigint;
begin
  perform _sync(u); perform _regen(u);
  select * into pr from profiles where id=u for update;
  price := rolls_price(pr);
  if pr.cash < price then raise exception 'Trésorerie insuffisante : il faut %', price; end if;
  perform _log(u, 'rolls', -price, 'Achat de 5 lancers');
  update profiles set cash = cash - price, rolls = least(99, rolls + (pawn_cfg()->>'rollsPack')::int),
    rb_n = case when rb_day = paris_today() then rb_n + 1 else 1 end, rb_day = paris_today() where id=u;
  return state();
end $$;

create or replace function _chance(p uuid) returns jsonb language plpgsql as $$
#variable_conflict use_column
declare k text; pr profiles; val bigint; a bigint; h record; st text;
  keys text[] := array['heritage','impots','prime','fete','subv','loto','boom','booster','cle','tournage','pub',
                       'fisc','fonciere','notaire','amende','cambriolage','ravalement','degat','greve','ascenseur','termites','squat'];
  ws float8[] := array[8,10,8,8,6,1,3,4,5,4,4,  4,4,4,4,4,3,3,2,2,1,2];
  extra jsonb;
begin
  k := _pick_weighted(keys, ws);
  select * into pr from profiles where id=p for update;
  val := coalesce((select sum(v) from arr_value where owner=p),0);
  case k
    when 'heritage' then a := 250000;  when 'impots' then a := 80000; when 'prime' then a := 120000;
    when 'fete' then a := 60000;       when 'subv' then a := 150000;  when 'loto' then a := 1000000;
    when 'boom' then a := least(2000000, floor(val*0.02));
    when 'notaire' then a := -40000;   when 'amende' then a := -15000;
    when 'fisc' then a := -greatest(20000, floor(pr.cash*0.05));
    when 'fonciere' then a := -floor(val*0.004);
    else a := 0;
  end case;
  -- chaque parti protège ses membres contre quelques malus (risques équivalents)
  if (pr.party = 'poing'   and k in ('greve','amende'))
  or (pr.party = 'tendue'  and k in ('notaire','ravalement'))
  or (pr.party = 'milieu'  and k in ('fonciere','degat'))
  or (pr.party = 'valeurs' and k in ('fisc','termites','ascenseur'))
  or (pr.party = 'rempart' and k in ('cambriolage','squat')) then
    return jsonb_build_object('t','chance','k',k,'out','Sans effet : vous êtes protégé par votre parti');
  end if;

  if a <> 0 then
    update profiles set cash = greatest(0, cash + a) where id=p; perform _log(p, 'chance', a, 'Carte Chance');
    return jsonb_build_object('t','chance','k',k,'amount',a);
  end if;

  if k = 'booster' then update profiles set welcome = welcome + 1 where id=p; return jsonb_build_object('t','chance','k',k,'out','+1 booster'); end if;
  if k = 'cle' then
    extra := _draw(p, 'C');
    return jsonb_build_object('t','chance','k',k,'extra',extra);
  end if;
  if k = 'greve' then insert into fx(owner,kind,m,until) values (p,'all',0.8,now()+interval '24 hours'); return jsonb_build_object('t','chance','k',k); end if;

  -- cartes qui visent un de vos immeubles
  select l.card, l.k, c.arr, c.v, c.title into h from lots l join cards c on c.id=l.card where l.owner=p order by random() limit 1;
  if not found then return jsonb_build_object('t','chance','k',k,'out','Aucun bien concerné'); end if;
  select party into st from arr_state where arr=h.arr;
  case k
    when 'tournage'  then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,1.5,now()+interval '24 hours');
    when 'pub'       then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,1.3,now()+interval '24 hours');
    when 'ascenseur' then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,0.7,now()+interval '24 hours');
    when 'termites'  then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,0.6,now()+interval '48 hours');
    when 'degat'     then insert into fx(owner,kind,card,k,m,until) values (p,'lot',h.card,h.k,0,now()+interval '24 hours');
    when 'squat'     then insert into fx(owner,kind,card,k,m,until) values (p,'lot',h.card,h.k,0,now()+interval '48 hours');
    when 'cambriolage' then
      a := -30000; update profiles set cash = greatest(0, cash + a) where id=p; perform _log(p, 'chance', a, 'Carte Chance : cambriolage', h.card);
      return jsonb_build_object('t','chance','k',k,'amount',a,'card',h.card);
    when 'ravalement' then
      a := -floor(h.v*0.01); update profiles set cash = greatest(0, cash + a) where id=p; perform _log(p, 'chance', a, 'Carte Chance : ravalement', h.card);
      return jsonb_build_object('t','chance','k',k,'amount',a,'card',h.card);
    else null;
  end case;
  return jsonb_build_object('t','chance','k',k,'card',h.card);
end $$;

create or replace function open_booster(p_kind text) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles; price bigint; items jsonb := '[]'; it jsonb; tier char; i int; ch jsonb;
begin
  perform _sync(u);
  select * into pr from profiles where id=u for update;
  if p_kind = 'welcome' then
    if pr.welcome <= 0 then raise exception 'Plus de booster de bienvenue'; end if;
    update profiles set welcome = welcome - 1 where id=u;
  elsif p_kind = 'free' then
    if pr.free_at is not null and pr.free_at > now() - interval '24 hours' then raise exception 'Le booster gratuit n''est pas encore prêt'; end if;
    update profiles set free_at = now() where id=u;
  elsif p_kind = 'paid' then
    if pr.bought_day is distinct from paris_today() then pr.bought_n := 0; end if;
    price := (cfg()->>'pack')::bigint * (2 ^ pr.bought_n)::bigint;
    if pr.cash < price then raise exception 'Trésorerie insuffisante'; end if;
    update profiles set cash = cash - price, bought_day = paris_today(), bought_n = pr.bought_n + 1 where id=u;
    perform _log(u, 'booster', -price, 'Achat d''un booster');
  else raise exception 'Type de booster inconnu'; end if;

  for i in 1..4 loop
    tier := _pick_weighted(array['C','U','R','L','M'], array[58,27,11,3.4,0.6]);
    it := _draw(u, tier);
    if it is null then it := _draw(u, 'C'); end if;
    if it is not null then items := items || it; end if;
  end loop;
  ch := _chance(u);
  if ch ? 'extra' and ch->'extra' <> 'null'::jsonb then items := items || (ch->'extra'); end if;
  items := items || (ch - 'extra');
  perform _refresh_mayors(array(select (c.arr)::int from jsonb_array_elements(items) x join cards c on c.id = (x->>'card')::int));
  -- annonces dans le fil d'actu pour les grosses prises
  insert into news(kind, arr, card, actor, data)
    select 'pull', c.arr, c.id, u, jsonb_build_object('tier', x->>'tier', 't', x->>'t', 'n', x->'n')
    from jsonb_array_elements(items) x join cards c on c.id = (x->>'card')::int
    where x->>'tier' in ('L','M');
  return json_build_object('items', items, 'state', state());
end $$;

create or replace function _pay_or_borrow(u uuid, price bigint, credit boolean) returns bigint language plpgsql as $$
declare have bigint; down bigint;
begin
  select p.cash into have from profiles p where id=u for update;
  if not coalesce(credit, false) then
    if have < price then raise exception 'Trésorerie insuffisante'; end if;
    update profiles set cash = cash - price where id=u; perform _log(u, 'buy', -price, 'Achat comptant'); return 0;
  end if;
  down := ceil(price * (cfg()->>'creditDown')::numeric);
  if price - down > _loan_cap(u) then raise exception 'Capacité d''emprunt dépassée : la banque ne vous prête plus que % €', greatest(0, _loan_cap(u)); end if;
  if have < down then raise exception 'Apport insuffisant : il faut % € (10 %% du prix)', down; end if;
  update profiles set cash = cash - down where id=u; perform _log(u, 'buy', -down, 'Apport (achat à crédit)');
  return price - down;
end $$;

create or replace function buy_listing(p_id bigint) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); l listings; c cards; fee numeric; have int; mp text;
begin
  select * into l from listings where id=p_id for update;
  if not found then raise exception 'Annonce déjà vendue ou retirée'; end if;
  if l.seller = u then raise exception 'C''est votre annonce'; end if;
  perform _sync(u);
  select * into c from cards where id=l.card;
  if (select cash from profiles where id=u) < l.price then raise exception 'Trésorerie insuffisante'; end if;
  if l.k is not null then
    update lots set owner=u, at=now() where card=l.card and k=l.k and owner=l.seller and mort is null;
    if not found then delete from listings where id=p_id; raise exception 'Ce bien n''est plus disponible'; end if;
  else
    select n into have from parts where card=l.card and owner=l.seller and mort is null;
    if coalesce(have,0) < l.n then delete from listings where id=p_id; raise exception 'Ces parts ne sont plus disponibles'; end if;
    if have = l.n then delete from parts where card=l.card and owner=l.seller; else update parts set n=n-l.n where card=l.card and owner=l.seller; end if;
    insert into parts(card,owner,n) values (l.card,u,l.n) on conflict (card,owner) do update set n = parts.n + excluded.n;
  end if;
  select party into mp from arr_state where arr=c.arr;
  fee := (cfg()->>'fee')::numeric;
  update profiles set cash = cash - l.price where id=u; perform _log(u, 'buy', -l.price, 'Achat au Marché', l.card);
  insert into pay(owner, amount, why) values (l.seller, floor(l.price*(1-fee)), 'vente');
  perform _add_value(l.seller, c.arr, -c.v*l.n);
  perform _add_value(u, c.arr, c.v*l.n);
  perform _refresh_mayors(array[c.arr::int]);
  delete from listings where id=p_id;
  insert into sales(card,k,n,price,seller,buyer) values (l.card,l.k,l.n,l.price,l.seller,u);
  if l.price >= 1000000 then insert into news(kind, arr, card, actor, data) values ('sale', c.arr, c.id, u, jsonb_build_object('price', l.price, 'seller', l.seller)); end if;
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
  update profiles set cash = cash + a where id=u; perform _log(u, 'mortgage', a, 'Hypothèque', p_card);
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
  update profiles set cash = cash - due where id=u; perform _log(u, 'repay', -due, 'Crédit remboursé en avance', p_card);
  update lots set loan = null where card=p_card and owner=u;
  update parts set loan = null where card=p_card and owner=u;
  return state();
end $$;

create or replace function lift(p_card int, p_k int) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); m bigint; mt timestamptz; cost bigint;
begin
  perform _sync(u);
  if p_k is null then select mort, mort_at into m, mt from parts where card=p_card and owner=u;
  else select mort, mort_at into m, mt from lots where card=p_card and k=p_k and owner=u; end if;
  if m is null then raise exception 'Pas d''hypothèque ici'; end if;
  cost := floor(m * (1 + (cfg()->>'mortDaily')::numeric * extract(epoch from (now()-mt))/86400));
  perform 1 from profiles where id=u for update;
  if (select cash from profiles where id=u) < cost then raise exception 'Trésorerie insuffisante'; end if;
  update profiles set cash = cash - cost where id=u; perform _log(u, 'lift', -cost, 'Hypothèque remboursée', p_card);
  if p_k is null then update parts set mort=null, mort_at=null where card=p_card and owner=u;
  else update lots set mort=null, mort_at=null where card=p_card and k=p_k and owner=u; end if;
  return state();
end $$;

create or replace function my_ledger() returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x), '[]') from (select kind, amount, label, card, at from ledger where owner = auth.uid() order by at desc limit 100) x
$$;

revoke all on function _log(uuid,text,bigint,text,int), _sync(uuid), _chance(uuid), _pay_or_borrow(uuid,bigint,boolean) from public, anon, authenticated;
grant execute on function my_ledger(), roll(), buy_rolls(), open_booster(text), buy_listing(bigint), mortgage(int,int), repay(int), lift(int,int) to anon, authenticated;
create or replace function pawn_cfg() returns jsonb language sql immutable as $$ select '{
  "maxRolls":10, "rollEveryMin":30, "tpPerDay":3, "buyRadius":150, "tollCap":0.2, "spawn":400761, "chanceEvery":8, "stepMul":4, "dieMax":6, "rollsPrice":50000, "rollsPack":5, "salary":20000
}'::jsonb $$;
update profiles set pos = 400761, land = null where pos in (300658, 300354);
revoke all on function pawn_cfg() from public, anon, authenticated;
notify pgrst, 'reload schema';
