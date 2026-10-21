-- =====================================================================
--  Le personnage marche moins vite (21/10/2026, retour du propriétaire : « le personnage avance trop vite »,
--  vu de près avec la caméra derrière lui) : 12 m/s au lieu de 40, et un trajet dure jusqu'à 60 s au lieu de 30
--  (au-delà de 720 m, il accélère pour arriver en 60 s). Les autres réglages ne changent pas. Rejouable sans risque.
-- =====================================================================
create or replace function _world_cfg() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'freeKm', 5, 'kmPrice', 10000, 'salary', 20000, 'ticket', 5000,
    'speed', 12, 'maxDur', 60,
    'reach', 120, 'reachBig', 300,
    'toll', 0.05, 'tollR', 22, 'tollCap', 0.1,
    'chanceR', 40, 'chancePct', 30,
    'w', 2.210, 'e', 2.480, 's', 48.805, 'n', 48.910,
    'start', jsonb_build_array(2.3488, 48.8530)) $$;   -- (si l'on n'a pas encore de position : devant Notre-Dame)
revoke all on function _world_cfg() from public, anon, authenticated;
