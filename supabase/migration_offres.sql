-- =====================================================================
--  Offres de rachat entre joueurs : « Faire une offre » sur le logement d'un autre joueur.
--  Prix ≥ 80 % de la valeur ; 24 h pour répondre ; une contre-proposition possible ;
--  l'argent de l'acheteur est bloqué pendant l'offre ; 3 offres en cours max ;
--  après un refus, pas de nouvelle offre sur ce logement avant 24 h ; option « ne pas recevoir d'offres ».
-- =====================================================================
alter table profiles add column if not exists no_offers boolean not null default false;
create table if not exists offers (
  id         bigserial primary key,
  card       int not null references cards(id),
  k          int not null,
  buyer      uuid not null references profiles(id) on delete cascade,
  seller     uuid not null references profiles(id) on delete cascade,
  price      bigint not null,
  counter    bigint,
  credit     boolean not null default false,
  held       bigint not null default 0,          -- argent bloqué chez l'acheteur
  status     text not null default 'open',       -- open, countered, accepted, refused, expired, cancelled
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  done_at    timestamptz
);
create index if not exists offers_buyer on offers(buyer, status);
create index if not exists offers_seller on offers(seller, status);
alter table offers enable row level security;

-- rendre l'argent bloqué et clore l'offre
create or replace function _offer_close(o offers, st text) returns void language plpgsql as $$
begin
  if o.held > 0 then
    update profiles set cash = cash + o.held where id = o.buyer;
    perform _log(o.buyer, 'offer', o.held, case st when 'refused' then 'Offre refusée : argent rendu' when 'expired' then 'Offre expirée : argent rendu' else 'Offre annulée : argent rendu' end, o.card);
  end if;
  update offers set status = st, held = 0, done_at = now() where id = o.id;
end $$;

create or replace function _offers_expire() returns void language plpgsql as $$
declare o offers;
begin
  for o in select * from offers where status in ('open','countered') and expires_at < now() for update skip locked loop
    perform _offer_close(o, 'expired');
  end loop;
end $$;

-- ce que l'acheteur doit bloquer pour un prix donné (tout, ou 10 % s'il achète à crédit)
create or replace function _offer_hold(p bigint, cr boolean) returns bigint language sql immutable as $$
  select case when cr then ceil(p * 0.1)::bigint else p end $$;

create or replace function make_offer(p_card int, p_k int, p_price bigint, p_credit boolean default false) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); c cards; l lots; h bigint; s profiles;
begin
  perform _sync(u); perform _offers_expire();
  select * into c from cards where id = p_card;
  if not found or c.lk = 'p' then raise exception 'On ne peut faire une offre que sur un logement ou un local'; end if;
  select * into l from lots where card = p_card and k = p_k;
  if not found then raise exception 'Ce logement est libre : achetez-le à la banque en tombant dessus avec le dé'; end if;
  if l.owner = u then raise exception 'Ce logement est déjà à vous'; end if;
  if coalesce(l.loan, 0) > 0 then raise exception 'Ce logement est acheté à crédit : il ne peut pas être vendu pour l''instant'; end if;
  if l.mort is not null then raise exception 'Ce logement est hypothéqué : il ne peut pas être vendu pour l''instant'; end if;
  select * into s from profiles where id = l.owner;
  if s.no_offers then raise exception '% ne reçoit pas d''offres', s.pseudo; end if;
  if p_price < ceil(c.v * 0.8) then raise exception 'Offre trop basse : au moins % € (80 %% de la valeur)', ceil(c.v * 0.8)::bigint; end if;
  if exists (select 1 from offers where buyer = u and card = p_card and k = p_k and status in ('open','countered')) then raise exception 'Vous avez déjà une offre en cours sur ce logement'; end if;
  if exists (select 1 from offers where buyer = u and card = p_card and k = p_k and status = 'refused' and done_at > now() - interval '24 hours') then
    raise exception 'Votre offre a été refusée : vous pourrez en refaire une dans 24 h'; end if;
  if (select count(*) from offers where buyer = u and status in ('open','countered')) >= 3 then raise exception 'Vous avez déjà 3 offres en cours : attendez une réponse'; end if;
  if coalesce(p_credit, false) and p_price - _offer_hold(p_price, true) > _loan_cap(u) then
    raise exception 'Capacité d''emprunt dépassée : la banque ne vous prête plus que % €', greatest(0, _loan_cap(u)); end if;
  h := _offer_hold(p_price, coalesce(p_credit, false));
  perform 1 from profiles where id = u for update;
  if (select cash from profiles where id = u) < h then raise exception 'Trésorerie insuffisante : il faut % € de côté pour faire cette offre', h; end if;
  update profiles set cash = cash - h where id = u;
  perform _log(u, 'offer', -h, 'Offre d''achat envoyée (argent bloqué)', p_card);
  insert into offers(card, k, buyer, seller, price, credit, held) values (p_card, p_k, u, l.owner, p_price, coalesce(p_credit, false), h);
  return my_offers();
end $$;

-- la vente elle-même (au prix final) ; renvoie null si tout va bien, sinon la raison de l'échec
create or replace function _offer_exec(o offers, final bigint) returns text language plpgsql as $$
declare c cards; l lots; need bigint; v_loan bigint := 0; fee numeric; x offers;
begin
  select * into c from cards where id = o.card;
  select * into l from lots where card = o.card and k = o.k for update;
  if not found or l.owner <> o.seller or coalesce(l.loan, 0) > 0 or l.mort is not null then
    perform _offer_close(o, 'cancelled'); return 'Ce logement n''est plus disponible : l''offre est annulée'; end if;
  need := _offer_hold(final, o.credit);
  if o.credit then v_loan := final - need; end if;
  perform 1 from profiles where id = o.buyer for update;
  if v_loan > 0 and v_loan > _loan_cap(o.buyer) then perform _offer_close(o, 'cancelled'); return 'La banque ne prête plus assez à l''acheteur : l''offre est annulée'; end if;
  if need > o.held and (select cash from profiles where id = o.buyer) < need - o.held then perform _offer_close(o, 'cancelled'); return 'L''acheteur n''a plus assez d''argent : l''offre est annulée'; end if;
  -- l'argent bloqué devient le paiement (on complète ou on rend la différence)
  if need <> o.held then
    update profiles set cash = cash - (need - o.held) where id = o.buyer;
    perform _log(o.buyer, 'buy', -(need - o.held), case when need > o.held then 'Achat entre joueurs : complément' else 'Achat entre joueurs : trop-bloqué rendu' end, o.card);
  end if;
  update lots set owner = o.buyer, at = now(), loan = nullif(v_loan, 0) where card = o.card and k = o.k;
  delete from listings where card = o.card and k = o.k;
  fee := (cfg()->>'fee')::numeric;
  insert into pay(owner, amount, why) values (o.seller, floor(final * (1 - fee)), 'vente');
  perform _add_value(o.seller, c.arr, -c.v);
  perform _add_value(o.buyer, c.arr, c.v);
  perform _refresh_mayors(array[c.arr::int]);
  insert into sales(card, k, n, price, seller, buyer) values (o.card, o.k, 1, final, o.seller, o.buyer);
  if final >= 1000000 then insert into news(kind, arr, card, actor, data) values ('sale', c.arr, c.id, o.buyer, jsonb_build_object('price', final, 'seller', o.seller)); end if;
  update offers set status = 'accepted', held = 0, done_at = now() where id = o.id;
  for x in select * from offers where card = o.card and k = o.k and status in ('open','countered') and id <> o.id loop perform _offer_close(x, 'cancelled'); end loop;
  return null;
end $$;

-- le vendeur répond : accept, refuse, counter (une seule contre-proposition)
create or replace function respond_offer(p_id bigint, p_action text, p_price bigint default null) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); o offers; c cards; err text;
begin
  perform _sync(u); perform _offers_expire();
  select * into o from offers where id = p_id for update;
  if not found or o.seller <> u then raise exception 'Offre introuvable'; end if;
  if o.status <> 'open' then raise exception 'Cette offre n''attend plus de réponse'; end if;
  if p_action = 'refuse' then perform _offer_close(o, 'refused'); return my_offers(); end if;
  if p_action = 'accept' then
    err := _offer_exec(o, o.price);
    if err is not null then return (jsonb_build_object('error', err) || my_offers()::jsonb)::json; end if;
    perform _sync(u); return my_offers();
  end if;
  if p_action = 'counter' then
    select * into c from cards where id = o.card;
    if p_price is null or p_price <= o.price then raise exception 'Votre contre-proposition doit être plus haute que l''offre (% €)', o.price; end if;
    update offers set status = 'countered', counter = p_price, expires_at = now() + interval '24 hours' where id = o.id;
    return my_offers();
  end if;
  raise exception 'Action inconnue';
end $$;

-- l'acheteur répond à la contre-proposition
create or replace function answer_counter(p_id bigint, p_accept boolean) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); o offers; err text;
begin
  perform _sync(u); perform _offers_expire();
  select * into o from offers where id = p_id for update;
  if not found or o.buyer <> u then raise exception 'Offre introuvable'; end if;
  if o.status <> 'countered' then raise exception 'Pas de contre-proposition en attente'; end if;
  if not p_accept then perform _offer_close(o, 'refused'); return my_offers(); end if;
  err := _offer_exec(o, o.counter);
  if err is not null then return (jsonb_build_object('error', err) || my_offers()::jsonb)::json; end if;
  return my_offers();
end $$;

create or replace function cancel_offer(p_id bigint) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); o offers;
begin
  select * into o from offers where id = p_id and buyer = u and status in ('open','countered') for update;
  if not found then raise exception 'Offre introuvable'; end if;
  perform _offer_close(o, 'cancelled'); return my_offers();
end $$;

create or replace function set_no_offers(p_on boolean) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me();
begin update profiles set no_offers = coalesce(p_on, false) where id = u; return state(); end $$;

-- mes offres : reçues et envoyées (en cours + 20 dernières terminées)
create or replace function my_offers() returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then return json_build_object('received', '[]'::json, 'sent', '[]'::json); end if;
  perform _offers_expire();
  return json_build_object(
    'received', coalesce((select json_agg(x order by x.live desc, x.created_at desc) from (
      select o.id, o.card, o.k, o.price, o.counter, o.credit, o.status, o.created_at, o.expires_at, o.done_at, p.pseudo as other, o.status in ('open','countered') as live
      from offers o join profiles p on p.id = o.buyer where o.seller = u and (o.status in ('open','countered') or o.done_at > now() - interval '7 days') order by o.created_at desc limit 40) x), '[]'),
    'sent', coalesce((select json_agg(x order by x.live desc, x.created_at desc) from (
      select o.id, o.card, o.k, o.price, o.counter, o.credit, o.status, o.created_at, o.expires_at, o.done_at, p.pseudo as other, o.status in ('open','countered') as live
      from offers o join profiles p on p.id = o.seller where o.buyer = u and (o.status in ('open','countered') or o.done_at > now() - interval '7 days') order by o.created_at desc limit 40) x), '[]'),
    'state', state());
end $$;

revoke all on function _offer_close(offers, text), _offers_expire(), _offer_hold(bigint, boolean), _offer_exec(offers, bigint) from public, anon, authenticated;
grant execute on function make_offer(int, int, bigint, boolean), respond_offer(bigint, text, bigint), answer_counter(bigint, boolean), cancel_offer(bigint), set_no_offers(boolean), my_offers() to authenticated;
