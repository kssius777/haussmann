-- Haussmann · mise à jour du 11/10 : achat direct, parti choisi plus tard
-- À coller dans Supabase → SQL Editor → Run (une seule fois)

drop function if exists join_game(text,text);
drop function if exists bank_buy(int,int);

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

revoke all on function join_game(text,text), set_party(text), bank_buy(int,int), buy_building(int) from public;
grant execute on function join_game(text,text), set_party(text), bank_buy(int,int), buy_building(int) to anon, authenticated;
notify pgrst, 'reload schema';
