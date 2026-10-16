-- Vérifie que les migrations automatiques marchent (sans effet sur le jeu)
create or replace function migrations_ok() returns boolean language sql stable as $$ select true $$;
grant execute on function migrations_ok() to anon, authenticated;
