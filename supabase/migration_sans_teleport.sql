-- La téléportation est retirée du jeu (choix du propriétaire, 19/10/2026) : seul le dé déplace la montgolfière.
-- La fonction reste (un vieil onglet resté ouvert reçoit un message clair) mais plus aucun joueur ne peut l'appeler.
-- Rejouable sans risque.
create or replace function teleport(p_card int) returns json
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'La téléportation a été retirée du jeu : seul le dé déplace la montgolfière.';
end $$;
revoke all on function teleport(int) from public, anon, authenticated;
