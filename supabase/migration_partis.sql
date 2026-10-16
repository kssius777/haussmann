-- =====================================================================
--  Chaque parti a son pouvoir (choix du propriétaire, 16/10/2026)
--  Poing Levé : −50 % de loyer quand on tombe chez un autre · Gauche Unie : salaire doublé à chaque lancer
--  Juste Milieu : pas de commission quand on vend · Droite Libre : apport 5 % et +50 % de capacité d'emprunt
--  Rempart National : +50 % de loyer quand un joueur tombe chez soi
-- =====================================================================
create or replace function _party(u uuid) returns text language sql stable as $$ select party from profiles where id = u $$;
create or replace function _down_rate(u uuid) returns numeric language sql stable as $$
  select case when _party(u) = 'valeurs' then 0.05 else (cfg()->>'creditDown')::numeric end $$;
create or replace function _offer_hold(p bigint, cr boolean, u uuid) returns bigint language sql stable as $$
  select case when cr then ceil(p * _down_rate(u))::bigint else p end $$;

create or replace function _loan_cap(u uuid) returns bigint language sql stable as $$
  select (case when _party(u) = 'valeurs' then 1.5 else 1 end * ((cfg()->>'creditCap')::bigint
       + (cfg()->>'creditCapDays')::bigint * (coalesce((select sum(c.rent) from lots l join cards c on c.id=l.card where l.owner=u),0)
                                             + coalesce((select sum(c.rent * x.n) from parts x join cards c on c.id=x.card where x.owner=u),0))))::bigint
       - coalesce((select sum(loan) from lots where owner=u),0)::bigint - coalesce((select sum(loan) from parts where owner=u),0)::bigint $$;

create or replace function _pay_or_borrow(u uuid, price bigint, credit boolean) returns bigint language plpgsql as $$
declare have bigint; down bigint;
begin
  select p.cash into have from profiles p where id=u for update;
  if not coalesce(credit, false) then
    if have < price then raise exception 'Trésorerie insuffisante'; end if;
    update profiles set cash = cash - price where id=u; perform _log(u, 'buy', -price, 'Achat comptant'); return 0;
  end if;
  down := ceil(price * _down_rate(u));
  if price - down > _loan_cap(u) then raise exception 'Capacité d''emprunt dépassée : la banque ne vous prête plus que % €', greatest(0, _loan_cap(u)); end if;
  if have < down then raise exception 'Apport insuffisant : il faut % € (10 %% du prix)', down; end if;
  update profiles set cash = cash - down where id=u; perform _log(u, 'buy', -down, 'Apport (achat à crédit)');
  return price - down;
end $$;

create or replace function _land(u uuid, t int, a int, path int[]) returns json
language plpgsql as $$
#variable_conflict use_column
declare c cards; sq jsonb; me text := _party(u); sal bigint; perk text := null; toll numeric := 0; cap numeric; ratio numeric := 1; payees jsonb := '[]'; ch jsonb := null; o record; bonus bigint := 0;
begin
  sal := (pawn_cfg()->>'salary')::bigint * case when me = 'tendue' then 2 else 1 end;   -- Gauche Unie : salaire doublé
  update profiles set pos = t, land = t, cash = cash + sal where id = u;   -- petit salaire à chaque lancer
  perform _log(u, 'salary', sal, case when me = 'tendue' then 'Salaire du tour (doublé : Gauche Unie)' else 'Salaire du tour' end, t);
  select * into c from cards where id = t;
  -- loyer à payer : chaque propriétaire reçoit une journée de loyer de ses biens ici (plafonné à 20 % de votre trésorerie)
  for o in
    select z.owner, sum(rent) * (case when me = 'poing' then 0.5 else 1 end) * (case when (select party from profiles where id = z.owner) = 'rempart' then 1.5 else 1 end) amt from (
      select l.owner, c.rent::numeric rent from lots l where l.card = t and l.owner <> u and l.mort is null
      union all select x.owner, c.rent::numeric * x.n from parts x where x.card = t and x.owner <> u and x.mort is null) z
    group by z.owner loop
    toll := toll + o.amt;
  end loop;
  if toll > 0 then
    cap := floor((select cash from profiles where id=u) * (pawn_cfg()->>'tollCap')::numeric);
    if toll > cap then ratio := case when toll = 0 then 0 else cap / toll end; end if;
    for o in
      select z.owner, p.pseudo, sum(rent) * (case when me = 'poing' then 0.5 else 1 end) * (case when (select party from profiles where id = z.owner) = 'rempart' then 1.5 else 1 end) amt from (
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
    if me = 'poing' then perk := 'poing'; elsif exists (select 1 from jsonb_array_elements(payees) e) and exists (select 1 from lots l join profiles p on p.id = l.owner where l.card = t and p.party = 'rempart' and l.owner <> u) then perk := 'rempart'; end if;
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
      'card', t, 'toll', toll, 'payees', payees, 'chance', ch, 'bonus', bonus, 'salary', sal, 'perk', perk, 'free', (sq->>'free')::int, 'mine', (sq->>'mine')::int),
    'state', state());
end $$;

create or replace function buy_listing(p_id bigint, p_credit boolean default false) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); l listings; c cards; fee numeric; have int; v_loan bigint := 0;
begin
  select * into l from listings where id=p_id for update;
  if not found then raise exception 'Annonce déjà vendue ou retirée'; end if;
  if l.seller = u then raise exception 'C''est votre annonce'; end if;
  perform _sync(u);
  select * into c from cards where id=l.card;
  if coalesce(p_credit, false) then
    v_loan := _pay_or_borrow(u, l.price, true);          -- apport 10 %, vérifie la capacité d'emprunt
  else
    if (select cash from profiles where id=u) < l.price then raise exception 'Trésorerie insuffisante'; end if;
    update profiles set cash = cash - l.price where id=u; perform _log(u, 'buy', -l.price, 'Achat au Marché', l.card);
  end if;
  if l.k is not null then
    update lots set owner=u, at=now(), loan=nullif(v_loan,0) where card=l.card and k=l.k and owner=l.seller and mort is null;
    if not found then raise exception 'Ce bien n''est plus disponible'; end if;
  else
    select n into have from parts where card=l.card and owner=l.seller and mort is null;
    if coalesce(have,0) < l.n then raise exception 'Ces parts ne sont plus disponibles'; end if;
    if have = l.n then delete from parts where card=l.card and owner=l.seller; else update parts set n=n-l.n where card=l.card and owner=l.seller; end if;
    insert into parts(card,owner,n,loan) values (l.card,u,l.n,nullif(v_loan,0))
      on conflict (card,owner) do update set n = parts.n + excluded.n, loan = nullif(coalesce(parts.loan,0) + coalesce(excluded.loan,0), 0);
  end if;
  fee := case when _party(l.seller) = 'milieu' then 0 else (cfg()->>'fee')::numeric end;   -- Juste Milieu : pas de commission
  insert into pay(owner, amount, why) values (l.seller, floor(l.price*(1-fee)), 'vente');
  perform _add_value(l.seller, c.arr, -c.v*l.n);
  perform _add_value(u, c.arr, c.v*l.n);
  perform _refresh_mayors(array[c.arr::int]);
  delete from listings where id=p_id;
  insert into sales(card,k,n,price,seller,buyer) values (l.card,l.k,l.n,l.price,l.seller,u);
  if l.price >= 1000000 then insert into news(kind, arr, card, actor, data) values ('sale', c.arr, c.id, u, jsonb_build_object('price', l.price, 'seller', l.seller)); end if;
  return state();
end $$;

create or replace function _offer_exec(o offers, final bigint) returns text language plpgsql as $$
declare c cards; l lots; need bigint; v_loan bigint := 0; fee numeric; x offers;
begin
  select * into c from cards where id = o.card;
  select * into l from lots where card = o.card and k = o.k for update;
  if not found or l.owner <> o.seller or coalesce(l.loan, 0) > 0 or l.mort is not null then
    perform _offer_close(o, 'cancelled'); return 'Ce logement n''est plus disponible : l''offre est annulée'; end if;
  need := _offer_hold(final, o.credit, o.buyer);
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
  fee := case when _party(o.seller) = 'milieu' then 0 else (cfg()->>'fee')::numeric end;
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
  if coalesce(p_credit, false) and p_price - _offer_hold(p_price, true, u) > _loan_cap(u) then
    raise exception 'Capacité d''emprunt dépassée : la banque ne vous prête plus que % €', greatest(0, _loan_cap(u)); end if;
  h := _offer_hold(p_price, coalesce(p_credit, false), u);
  perform 1 from profiles where id = u for update;
  if (select cash from profiles where id = u) < h then raise exception 'Trésorerie insuffisante : il faut % € de côté pour faire cette offre', h; end if;
  update profiles set cash = cash - h where id = u;
  perform _log(u, 'offer', -h, 'Offre d''achat envoyée (argent bloqué)', p_card);
  insert into offers(card, k, buyer, seller, price, credit, held) values (p_card, p_k, u, l.owner, p_price, coalesce(p_credit, false), h);
  return my_offers();
end $$;

revoke all on function _party(uuid), _down_rate(uuid), _offer_hold(bigint, boolean, uuid) from public, anon, authenticated;
