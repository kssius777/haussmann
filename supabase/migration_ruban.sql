-- =====================================================================
--  Les cartes aux couleurs du parti qui en possède le plus (20/10/2026, choix du propriétaire : le « ruban »).
--  map_state() renvoie en plus, pour chaque carte, le parti qui y a le plus de logements (ou de parts) ;
--  personne si aucun propriétaire n'a de parti, ou s'il y a égalité en tête. Rejouable sans risque.
-- =====================================================================
create or replace function map_state() returns json language sql stable security definer set search_path = public as $$
  with lp as (select l.card, p.party, count(*)::numeric n from lots l join profiles p on p.id = l.owner where p.party is not null group by l.card, p.party),
       pp as (select x.card, p.party, sum(x.n)::numeric n from parts x join profiles p on p.id = x.owner where p.party is not null group by x.card, p.party),
       u as (select card, party, n, max(n) over (partition by card) mx from (select * from lp union all select * from pp) a),
       dom as (select card, case when count(*) filter (where n = mx) = 1 then min(party) filter (where n = mx) end party from u group by card)
  select json_build_object(
    'lots',  coalesce((select json_agg(json_build_array(x.card, x.owners, x.n, d.party)) from
               (select card, array_agg(distinct owner) owners, count(*) n from lots group by card) x left join dom d on d.card = x.card), '[]'),
    'parts', coalesce((select json_agg(json_build_array(y.card, y.owners, y.n, d.party)) from
               (select card, array_agg(owner) owners, sum(n) n from parts group by card) y left join dom d on d.card = y.card), '[]'),
    'sale',  coalesce((select json_agg(distinct card) from listings), '[]'),
    'arr',   coalesce((select json_agg(json_build_array(s.arr, s.mayor, s.party, p.pseudo)) from arr_state s left join profiles p on p.id=s.mayor), '[]'))
$$;
grant execute on function map_state() to anon, authenticated;
