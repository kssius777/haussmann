-- =====================================================================
--  REMISE À ZÉRO AVANT LE LANCEMENT — IRRÉVERSIBLE
--  Efface toute la partie : joueurs, biens, argent, historique, marché, offres,
--  actu, maires, événements, liens cadeaux, statistiques.
--  Garde : les 77 835 cartes, le plan des rues, la liste des admins et LEUR compte
--  de connexion (ils repartent de zéro, 1 M€ et 5 boosters, à leur prochaine visite).
--  Tous les autres comptes de connexion sont supprimés (les testeurs devront se réinscrire).
--
--  Ce fichier n'est PAS dans migrations.txt : il ne s'applique que le jour où le
--  propriétaire dit « go » (on l'ajoute alors à la fin de migrations.txt, et on le
--  retire juste après pour qu'il ne puisse jamais être rejoué).
--  Passée en production le 26/10/2026 (14:49 UTC), puis retirée de migrations.txt. `_migrations` la garde
--  comme passée : pour une autre remise à zéro un jour, copier ce fichier sous un autre nom (reset_2.sql…).
-- =====================================================================
-- garde-fou : sans compte admin, la remise à zéro effacerait aussi le compte du propriétaire (tous les comptes de connexion)
do $$ begin
  if not exists (select 1 from admins a join auth.users u on u.id = a.id) then
    raise exception 'Remise à zéro annulée : aucun compte admin (elle effacerait tous les comptes)';
  end if;
end $$;
truncate lots, parts, arr_value, arr_state, listings, sales, news, fx, day_event, city_week, pay,
         ledger, offers, gifts, stat_day, active_day,
         walkers, world_people, chance_taken, chat_msg, place_people, chat_bans,   -- (Paris à pied : positions, km du jour, « ? », bulles)
         map_dirty, arr_dirty,   -- (ce qui a changé sur la carte, pour map_delta)
         toll_seen, load_day, world_cells restart identity cascade;   -- (les péages du jour, les pics de joueurs, les groupes des carrés)
delete from profiles where true;   -- (« where true » : Supabase refuse un DELETE sans WHERE venant de l'API)
delete from auth.users where id not in (select id from admins);
