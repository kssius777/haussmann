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
-- =====================================================================
truncate lots, parts, arr_value, arr_state, listings, sales, news, fx, day_event, city_week, pay,
         ledger, offers, gifts, stat_day, active_day,
         walkers, world_people, chance_taken, chat_msg, place_people, chat_bans,   -- (Paris à pied : positions, km du jour, « ? », bulles)
         map_dirty, arr_dirty restart identity cascade;   -- (ce qui a changé sur la carte, pour map_delta)
delete from profiles where true;   -- (« where true » : Supabase refuse un DELETE sans WHERE venant de l'API)
delete from auth.users where id not in (select id from admins);
