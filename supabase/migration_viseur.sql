-- =====================================================================
--  Viser puis voler (26/10/2026, choix du propriétaire : « c'est un peu galère quand on se déplace, on sait pas trop où on peut
--  cliquer ou pas » ; « les gens seront sur téléphone ») : avant de partir, le site montre la distance du vol, s'il reste assez de
--  km, et le péage (les immeubles d'autres joueurs survolés).
--  fly_quote(lon, lat, card) : ce que coûterait ce vol, sans rien payer ni bouger (mêmes règles que fly et _ftoll).
--  _ftoll_rows : les immeubles survolés et leur péage, partagé par _ftoll (qui paie) et fly_quote (qui montre).
--  Rejouable sans risque.
-- =====================================================================

-- les immeubles d'un vol de (ax, ay) à (bx, by) qui coûtent un péage : à 25 m près, pas encore payés aujourd'hui, le loyer écrit
-- sur la carte partagé entre ses propriétaires (logements ou parts non hypothéqués) ; excl : l'immeuble d'où l'on part
create or replace function _ftoll_rows(u uuid, ax float8, ay float8, bx float8, by_ float8, excl int)
returns table(r_card int, r_owner uuid, r_amt numeric, r_t float8) language sql stable set search_path = public as $$
  with k as (select (_world_cfg()->>'tollR')::float8 rr, power((bx - ax) * 73240, 2) + power((by_ - ay) * 110574, 2) dd,
                    _party(u) me, paris_today() today),
  cand as (
    select c.id, c.rent, c.cx / 1e5 lo, c.cy / 1e5 la from cards c, k
    where c.cx between floor((least(ax, bx) - k.rr / 73240) * 1e5) and ceil((greatest(ax, bx) + k.rr / 73240) * 1e5)
      and c.cy between floor((least(ay, by_) - k.rr / 110574) * 1e5) and ceil((greatest(ay, by_) + k.rr / 110574) * 1e5)
      and c.id is distinct from excl),
  near as (
    select cand.*, case when k.dd = 0 then 0 else greatest(0, least(1, ((cand.lo - ax) * 73240 * (bx - ax) * 73240
                                                                       + (cand.la - ay) * 110574 * (by_ - ay) * 110574) / k.dd)) end t
    from cand, k where _wsegd(cand.lo, cand.la, ax, ay, bx, by_) <= k.rr
      and not exists (select 1 from toll_seen s where s.user_id = u and s.day = k.today and s.card = cand.id)),
  own as (
    select l.card, l.owner, 1::numeric n from lots l join near on near.id = l.card where l.owner <> u and l.mort is null
    union all select x.card, x.owner, x.n::numeric from parts x join near on near.id = x.card where x.owner <> u and x.mort is null and x.n > 0),
  sh as (select own.card, own.owner, sum(own.n) n from own group by own.card, own.owner),
  tt as (select sh.card, sum(sh.n) n from sh group by sh.card)
  -- (pouvoirs des partis : Extrême gauche paie moitié prix ; un propriétaire d'Extrême droite touche 50 % de plus)
  select near.id, sh.owner, near.rent::numeric * sh.n / tt.n * (case when k.me = 'poing' then 0.5 else 1 end)
           * (case when (select p.party from profiles p where p.id = sh.owner) = 'rempart' then 1.5 else 1 end), near.t
  from near join sh on sh.card = near.id join tt on tt.card = near.id cross join k
$$;
revoke all on function _ftoll_rows(uuid, float8, float8, float8, float8, int) from public, anon, authenticated;

-- le péage d'un vol, payé : les mêmes immeubles (_ftoll_rows), une fois par jour chacun, jamais plus de 10 % de son argent
create or replace function _ftoll(u uuid, ax float8, ay float8, bx float8, by_ float8, excl int) returns jsonb language plpgsql as $$
declare cfg jsonb := _world_cfg(); me text := _party(u); tot numeric := 0; cap numeric; ratio numeric := 1;
  o record; hits jsonb; nb int; today date := paris_today();
begin
  create temp table if not exists _ft(card int, owner uuid, amt numeric, t float8) on commit drop;
  truncate _ft;
  insert into _ft select r.r_card, r.r_owner, r.r_amt, r.r_t from _ftoll_rows(u, ax, ay, bx, by_, excl) r;
  select coalesce(sum(amt), 0), count(distinct card) into tot, nb from _ft;
  if tot < 1 then return jsonb_build_object('toll', 0, 'n', 0, 'hits', '[]'::jsonb); end if;
  insert into toll_seen(user_id, day, card) select distinct u, today, card from _ft on conflict do nothing;
  cap := floor((select cash from profiles where id = u) * (cfg->>'tollCap')::numeric);
  if tot > cap then ratio := case when tot = 0 then 0 else cap / tot end; end if;
  for o in select t.owner, sum(t.amt) amt from _ft t group by t.owner loop
    if floor(round(o.amt * ratio, 4)) >= 1 then insert into pay(owner, amount, why) values (o.owner, floor(round(o.amt * ratio, 4)), 'loyer de passage'); end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_array(h.card, h.a, round(h.t::numeric, 3)) order by h.t), '[]') into hits
    from (select card, floor(round(sum(amt) * ratio, 4)) a, min(t) t from _ft group by card order by min(t) limit 80) h;
  tot := least(cap, floor(round(tot * ratio, 4)));
  if tot >= 1 then
    update profiles set cash = greatest(0, cash - tot::bigint) where id = u;
    perform _log(u, 'toll_paid', -tot::bigint, 'Péage · ' || nb || ' immeuble' || case when nb > 1 then 's' else '' end);
  end if;
  return jsonb_build_object('toll', tot, 'n', nb, 'hits', hits, 'cap', ratio < 1, 'perk', case when me = 'poing' then 'poing' end);
end $$;
revoke all on function _ftoll(uuid, float8, float8, float8, float8, int) from public, anon, authenticated;

-- ce que coûterait un vol jusqu'à un point (ou un immeuble) : la distance, assez de km ?, le salaire, le péage — sans rien payer
-- why : 'km' (pas assez de km), 'far' (trop loin pour un seul vol), 'paris' (hors de Paris), 'flying' (déjà en vol), 'away', 'card'
create or replace function fly_quote(p_lon float8, p_lat float8, p_card int default null) returns json
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); cfg jsonb := _world_cfg(); pr profiles; w walkers; c cards; cur float8[];
  lo float8; la float8; v_len float8; km float8; kf float8; sal numeric; tot numeric; nb int; cap numeric;
begin
  select * into pr from profiles where id = u;
  if not found then return json_build_object('ok', false, 'why', 'away'); end if;
  select * into w from walkers where user_id = u;
  if not found then return json_build_object('ok', false, 'why', 'away'); end if;
  if w.dur > 0 and now() < w.t0 + make_interval(secs => w.dur) then return json_build_object('ok', false, 'why', 'flying'); end if;
  if p_card is not null then
    select * into c from cards where id = p_card;
    if not found then return json_build_object('ok', false, 'why', 'card'); end if;
    lo := c.cx / 1e5; la := c.cy / 1e5;
  else lo := p_lon; la := p_lat; end if;
  if lo is null or la is null or lo < (cfg->>'w')::float8 or lo > (cfg->>'e')::float8 or la < (cfg->>'s')::float8 or la > (cfg->>'n')::float8 then
    return json_build_object('ok', false, 'why', 'paris');
  end if;
  cur := _wpos(w);
  v_len := _wm(cur[1], cur[2], lo, la); km := v_len / 1000; kf := _kmfree(pr);
  sal := floor(least(kf, km) * (cfg->>'salaryKm')::numeric * case when pr.party = 'tendue' then 2 else 1 end);   -- (comme fly)
  select coalesce(sum(r.r_amt), 0), count(distinct r.r_card) into tot, nb from _ftoll_rows(u, cur[1], cur[2], lo, la, pr.land) r;
  cap := floor((pr.cash + sal) * (cfg->>'tollCap')::numeric);   -- (fly compte le plafond après le salaire)
  return json_build_object(
    'ok', v_len <= (cfg->>'flyMax')::float8 and kf + pr.km_buy >= km - 0.0005,
    'why', case when v_len > (cfg->>'flyMax')::float8 then 'far' when kf + pr.km_buy < km - 0.0005 then 'km' end,
    'len', round(v_len::numeric), 'km', round((kf + pr.km_buy)::numeric, 3), 'salary', sal,
    'toll', least(cap, floor(round(tot, 4))), 'n', nb, 'cap', tot > cap);
end $$;
revoke all on function fly_quote(float8, float8, int) from public, anon;
grant execute on function fly_quote(float8, float8, int) to authenticated;
notify pgrst, 'reload schema';
