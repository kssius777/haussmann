-- Acheter au Marché à crédit (apport 10 %, la banque prête le reste, remboursé par 70 % du loyer, comme à la banque)
drop function if exists buy_listing(bigint);
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
  fee := (cfg()->>'fee')::numeric;
  insert into pay(owner, amount, why) values (l.seller, floor(l.price*(1-fee)), 'vente');
  perform _add_value(l.seller, c.arr, -c.v*l.n);
  perform _add_value(u, c.arr, c.v*l.n);
  perform _refresh_mayors(array[c.arr::int]);
  delete from listings where id=p_id;
  insert into sales(card,k,n,price,seller,buyer) values (l.card,l.k,l.n,l.price,l.seller,u);
  if l.price >= 1000000 then insert into news(kind, arr, card, actor, data) values ('sale', c.arr, c.id, u, jsonb_build_object('price', l.price, 'seller', l.seller)); end if;
  return state();
end $$;
grant execute on function buy_listing(bigint, boolean) to anon, authenticated;
