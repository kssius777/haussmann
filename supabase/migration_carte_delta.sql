-- =====================================================================
--  La carte des autres sans tout recharger (21/10/2026, demande du propriétaire : tenir « au moins 10 000 joueurs pour pas cher »).
--  Avant : lots, parts, listings, news et arr_state étaient dans le temps réel de Supabase (postgres_changes) : chaque achat,
--  chaque vente, et même chaque remboursement de crédit (_sync, à chaque action d'un joueur) partait à TOUS les joueurs
--  connectés, et chacun rechargeait toute la carte (map_state). À 1 000 joueurs connectés : des dizaines de milliers de
--  messages par seconde (Supabase plafonne à 2 500 et fait payer chacun), et la base noyée sous les map_state.
--  Maintenant :
--   · ces tables sortent du temps réel de Supabase ;
--   · ce qui change sur la carte (à qui sont les logements et les parts, ce qui est à vendre, le parti qui domine une carte,
--     les maires) est noté par des déclencheurs dans map_dirty / arr_dirty, avec le numéro de la transaction (xid8) ;
--   · le site demande « quoi de neuf depuis la dernière fois » (map_delta) toutes les 20 s, et tout de suite quand quelqu'un
--     achète ou vend près de lui (un petit évènement « map » sur le carré du bien, comme les gens qui marchent).
--  Le curseur rendu au site est le plus vieux numéro de transaction encore en cours (pg_snapshot_xmin) : une transaction qui
--  finit après la question est rattrapée à la suivante (rien n'est perdu ; au pire une carte est renvoyée deux fois).
--  Rejouable sans risque.
-- =====================================================================
create table if not exists map_dirty (card int primary key, x xid8 not null);
create index if not exists map_dirty_x on map_dirty(x);
create table if not exists arr_dirty (arr int primary key, x xid8 not null);
alter table map_dirty enable row level security;   -- (aucune politique : seules les fonctions du jeu y touchent)
alter table arr_dirty enable row level security;
revoke all on map_dirty, arr_dirty from anon, authenticated;
create index if not exists listings_card on listings(card);

-- une carte a changé (un logement, une part, une annonce) : notée ; la première fois dans la transaction, ceux qui regardent
-- son carré l'apprennent tout de suite (évènement « map » du monde)
create or replace function _map_touch() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end; g int := (r->>'card')::int; first boolean; cl int;
begin
  insert into map_dirty as m (card, x) values (g, pg_current_xact_id())
    on conflict (card) do update set x = excluded.x where m.x <> excluded.x
    returning true into first;
  if first and to_regprocedure('_wemit(integer,uuid,text,jsonb)') is not null then
    select _wcell(cx / 1e5, cy / 1e5) into cl from cards where id = g and cx is not null;
    if cl is not null then perform _wemit(cl, coalesce(r->>'owner', r->>'seller')::uuid, 'map', jsonb_build_object('g', g)); end if;
  end if;
  return null;
end $$;

-- un joueur change de parti (le ruban de ses cartes peut changer) ou de pseudo (s'il est maire)
create or replace function _map_touch_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.party is distinct from new.party then
    insert into map_dirty as m (card, x)
      select card, pg_current_xact_id() from (select card from lots where owner = new.id union select card from parts where owner = new.id) c
      on conflict (card) do update set x = excluded.x where m.x <> excluded.x;
  end if;
  insert into arr_dirty as m (arr, x) select arr, pg_current_xact_id() from arr_state where mayor = new.id
    on conflict (arr) do update set x = excluded.x where m.x <> excluded.x;
  return null;
end $$;

-- un nouveau maire, ou son parti
create or replace function _map_touch_arr() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into arr_dirty as m (arr, x) values (case when tg_op = 'DELETE' then old.arr else new.arr end, pg_current_xact_id())
    on conflict (arr) do update set x = excluded.x where m.x <> excluded.x;
  return null;
end $$;

drop trigger if exists lots_map on lots;
create trigger lots_map after insert or delete on lots for each row execute function _map_touch();
drop trigger if exists lots_map_owner on lots;   -- (pas les remboursements de crédit ni les hypothèques : rien ne change sur la carte)
create trigger lots_map_owner after update of owner on lots for each row when (old.owner is distinct from new.owner) execute function _map_touch();
drop trigger if exists parts_map on parts;
create trigger parts_map after insert or delete on parts for each row execute function _map_touch();
drop trigger if exists parts_map_n on parts;
create trigger parts_map_n after update of n, owner on parts for each row
  when (old.n is distinct from new.n or old.owner is distinct from new.owner) execute function _map_touch();
drop trigger if exists listings_map on listings;
create trigger listings_map after insert or delete on listings for each row execute function _map_touch();
drop trigger if exists profiles_map on profiles;
create trigger profiles_map after update of party, pseudo on profiles for each row
  when (old.party is distinct from new.party or old.pseudo is distinct from new.pseudo) execute function _map_touch_owner();
drop trigger if exists arr_state_map on arr_state;
create trigger arr_state_map after insert or update or delete on arr_state for each row execute function _map_touch_arr();

-- l'état de la carte pour une liste de cartes (null = toutes) : à qui (logements, parts), le parti qui en a le plus, à vendre
create or replace function _map_cards(p_cards int[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; f text := case when p_cards is null then 'true' else 'card = any($1)' end;
begin
  execute format($q$
    with lp as (select l.card, p.party, count(*)::numeric n from lots l join profiles p on p.id = l.owner where p.party is not null and %1$s group by l.card, p.party),
         pp as (select x.card, p.party, sum(x.n)::numeric n from parts x join profiles p on p.id = x.owner where p.party is not null and %1$s group by x.card, p.party),
         u as (select card, party, n, max(n) over (partition by card) mx from (select * from lp union all select * from pp) a),
         dom as (select card, case when count(*) filter (where n = mx) = 1 then min(party) filter (where n = mx) end party from u group by card)
    select jsonb_build_object(
      'lots',  coalesce((select jsonb_agg(jsonb_build_array(x.card, x.owners, x.n, d.party)) from
                 (select card, array_agg(distinct owner) owners, count(*) n from lots where %1$s group by card) x left join dom d on d.card = x.card), '[]'),
      'parts', coalesce((select jsonb_agg(jsonb_build_array(y.card, y.owners, y.n, d.party)) from
                 (select card, array_agg(owner) owners, sum(n) n from parts where %1$s group by card) y left join dom d on d.card = y.card), '[]'),
      'sale',  coalesce((select jsonb_agg(distinct card) from listings where %1$s), '[]'))$q$, f)
  into r using p_cards;
  return r;
end $$;

-- les maires (null = les 20 arrondissements)
create or replace function _map_arr(p_arrs int[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(s.arr, s.mayor, s.party, p.pseudo) order by s.arr), '[]')
  from arr_state s left join profiles p on p.id = s.mayor where p_arrs is null or s.arr = any(p_arrs) $$;

-- toute la carte (les sites d'avant l'appellent encore) : même réponse qu'avant, plus le curseur « v »
create or replace function map_state() returns json
language sql stable security definer set search_path = public as $$
  select (_map_cards(null) || jsonb_build_object('arr', _map_arr(null), 'v', pg_snapshot_xmin(pg_current_snapshot())::text))::json $$;

-- ce qui a changé depuis le curseur p_since (null : toute la carte, « full ») ; « cards » = les cartes à effacer avant
-- d'appliquer lots / parts / sale ; « arr » = les maires qui ont changé (null si aucun)
create or replace function map_delta(p_since text default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare s xid8; v text := pg_snapshot_xmin(pg_current_snapshot())::text; cs int[]; ar int[];
begin
  begin s := nullif(btrim(coalesce(p_since, '')), '')::xid8; exception when others then s := null; end;
  if s is not null then
    select array_agg(card order by card) into cs from map_dirty where x >= s;
    select array_agg(arr order by arr) into ar from arr_dirty where x >= s;
  end if;
  if s is null or coalesce(cardinality(cs), 0) > 2000 then   -- la première fois, ou trop de changements : toute la carte
    return (_map_cards(null) || jsonb_build_object('arr', _map_arr(null), 'v', v, 'full', true))::json;
  end if;
  return (case when cs is null then '{"lots": [], "parts": [], "sale": []}'::jsonb else _map_cards(cs) end
    || jsonb_build_object('v', v, 'cards', coalesce(to_jsonb(cs), '[]'::jsonb), 'arr', case when ar is null then null else _map_arr(ar) end))::json;
end $$;

-- ces tables ne partent plus en temps réel à tout le monde (les sites d'avant relisent la carte toutes les 60 s)
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['lots', 'parts', 'listings', 'news', 'arr_state'] loop
      if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        begin execute format('alter publication supabase_realtime drop table public.%I', t);
        exception when others then raise notice 'temps réel : % reste publiée (%)', t, sqlerrm; end;
      end if;
    end loop;
  end if;
end $$;

revoke all on function _map_touch(), _map_touch_owner(), _map_touch_arr(), _map_cards(int[]), _map_arr(int[]) from public, anon, authenticated;
revoke all on function map_delta(text) from public;
grant execute on function map_delta(text) to anon, authenticated;
grant execute on function map_state() to anon, authenticated;
