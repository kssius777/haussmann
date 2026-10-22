-- =====================================================================
--  Une course plus rapide (22/10/2026, le propriétaire : « le perso avance trop lentement ») : vers la destination du dé,
--  son personnage court à 180 m/s (avant : 70), en 1,2 à 3 s (avant : 2,5 à 7 s). Le reste ne change pas.
--  (À l'écran, il part vite et ralentit en arrivant : place.js.) Rejouable sans risque.
-- =====================================================================
create or replace function _world_cfg() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'freeKm', 5, 'kmPrice', 10000, 'salary', 20000, 'ticket', 5000,
    'speed', 22, 'maxDur', 60,
    'reach', 120, 'reachBig', 300,
    'toll', 0.05, 'tollR', 22, 'tollCap', 0.1,
    'chanceR', 40, 'chancePct', 30,
    'step', 100, 'runSpeed', 180, 'runMin', 1.2, 'runMax', 3,   -- le dé : 100 m par point ; on y court en 1,2 à 3 s
    'w', 2.210, 'e', 2.480, 's', 48.805, 'n', 48.910,
    'start', jsonb_build_array(2.3488, 48.8530)) $$;
revoke all on function _world_cfg() from public, anon, authenticated;
