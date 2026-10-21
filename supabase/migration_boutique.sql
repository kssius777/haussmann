-- =====================================================================
--  La boutique d'un joueur (21/10/2026, demande du propriétaire : en touchant quelqu'un dans la rue, « voir ses biens en vente
--  avec des cartes minimalistes, et un accès vers sa boutique ») : ses annonces et ses plus beaux biens, en une seule demande
--  (le site n'a plus à tout charger pour trouver les plus beaux). Ce qui est déjà public : la carte montre déjà à qui sont les biens.
--  Rejouable sans risque.
-- =====================================================================
create or replace function player_shop(p_user uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'pseudo',   (select pseudo from profiles where id = p_user),
    'party',    (select party from profiles where id = p_user),
    'listings', coalesce((select json_agg(x) from (
                  select l.id, l.card, l.k, l.n, l.price, l.at from listings l where l.seller = p_user order by l.at desc limit 40) x), '[]'),
    'owned',    coalesce((select json_agg(x) from (
                  select card, sum(n)::int n, sum(v)::bigint v from (
                    select l.card, count(*) n, max(c.v) * count(*) v from lots l join cards c on c.id = l.card where l.owner = p_user group by l.card
                    union all
                    select x.card, x.n, c.v * x.n from parts x join cards c on c.id = x.card where x.owner = p_user) y
                  group by card order by sum(v) desc limit 24) x), '[]'))
$$;
revoke all on function player_shop(uuid) from public, anon;
grant execute on function player_shop(uuid) to authenticated;
