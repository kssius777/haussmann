-- =====================================================================
--  Un message par minute (21/10/2026, demande du propriétaire : « on peut limiter à 1 message par min, voire moins,
--  pour privilégier less is more ») : avant, 1 par seconde et 5 par minute (migration_temps_reel.sql).
--  Le dernier message compte même après être sorti et revenu dans Paris (on regarde aussi chat_msg, gardé 2 minutes).
--  Rejouable sans risque.
-- =====================================================================
create or replace function world_say(p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); x world_people; t text; t0 timestamptz;
begin
  if _chat_ban_until(u) is not null then raise exception 'Vous êtes banni du chat.'; end if;
  select * into x from world_people where user_id = u for update;
  if not found then raise exception 'Revenez dans Paris'; end if;
  t := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  if t = '' then return; end if;
  t := left(t, 120);
  select greatest(x.said_at, max(at)) into t0 from chat_msg where user_id = u and kind = 'say' and at > now() - interval '60 seconds';
  if t0 > now() - interval '60 seconds' then
    raise exception 'Doucement : un message par minute (encore % s).', greatest(1, ceil(60 - extract(epoch from now() - t0)))::int;
  end if;
  update world_people set said_at = now(), seen = now() where user_id = u;
  perform _wemit(x.cell, u, 'say', jsonb_build_object('t', t));
end $$;
revoke all on function world_say(text) from public, anon;
grant execute on function world_say(text) to authenticated;
