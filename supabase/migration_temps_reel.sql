-- =====================================================================
--  Le temps réel plus sobre (21/10/2026, demande du propriétaire : « je ne veux pas que ce soit WhatsApp ; il faut modérer
--  les phrases par minute pour pouvoir gérer au moins 10 000 joueurs pour pas cher »). Chaque message part à tous ceux qui
--  écoutent le même carré, et Supabase compte chaque réception : on écoute donc moins loin, et on parle moins vite.
--   · les carrés passent d'environ 1 km à environ 500 m de côté (le site n'écoute plus que ceux à 350 m autour de ce qu'il regarde) ;
--   · 5 messages par minute au plus (en plus d'un par seconde) : un chat de rue, pas une messagerie.
--  Rejouable sans risque.
-- =====================================================================
create or replace function _wcell(lo float8, la float8) returns int language sql immutable as $$
  select 10000 + floor((lo - 2.20) / 0.00685)::int * 100 + floor((la - 48.80) / 0.0045)::int $$;
update world_people set cell = _wcell(lon, lat) where cell is distinct from _wcell(lon, lat);   -- les gens déjà là : leur nouveau carré

create index if not exists chat_msg_user on chat_msg(user_id, at);

-- parler : 120 caractères au plus, un message par seconde et 5 par minute ; on l'entend autour de soi
create or replace function world_say(p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); x world_people; t text; n int; t0 timestamptz;
begin
  if _chat_ban_until(u) is not null then raise exception 'Vous êtes banni du chat.'; end if;
  select * into x from world_people where user_id = u for update;
  if not found then raise exception 'Revenez dans Paris'; end if;
  t := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  if t = '' then return; end if;
  t := left(t, 120);
  if x.said_at is not null and x.said_at > now() - interval '1 second' then raise exception 'Doucement : un message par seconde.'; end if;
  select count(*), min(at) into n, t0 from (
    select at from chat_msg where user_id = u and kind = 'say' and at > now() - interval '60 seconds' order by at desc limit 5) z;
  if n >= 5 then
    raise exception 'Doucement : 5 messages par minute (encore % s).', greatest(1, ceil(60 - extract(epoch from now() - t0)))::int;
  end if;
  update world_people set said_at = now(), seen = now() where user_id = u;
  perform _wemit(x.cell, u, 'say', jsonb_build_object('t', t));
end $$;
revoke all on function _wcell(float8, float8) from public, anon, authenticated;
revoke all on function world_say(text) from public, anon;
grant execute on function world_say(text) to authenticated;
