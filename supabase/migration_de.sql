-- =====================================================================
--  Le dé revient (21/10/2026, choix du propriétaire : « on peut remettre le dé pour se déplacer », « 4 destinations au
--  choix », « on supprime la marche libre ») : dans le vrai Paris, sans plateau.
--  On lance (1 à 6) : le dé propose jusqu'à 4 immeubles à environ 100 m par point, un par direction (nord, est, sud,
--  ouest ; un « ? » du jour passe devant les autres). On en choisit un, son personnage y court par les rues (quelques
--  secondes) et y tombe :
--   · chez un autre joueur, on lui paie une journée de loyer (au plus 20 % de sa trésorerie ; pouvoirs des partis) ;
--   · libre, on peut l'acheter (à la banque, seulement là où l'on est tombé) ;
--   · chez soi, une journée de loyer en bonus ; sur un « ? » du jour, une carte Chance ;
--   · et un salaire à chaque lancer (20 000 €, doublé pour la Gauche).
--  10 lancers au plus, un de plus toutes les 30 min (_regen, pawn_cfg), 5 lancers en plus contre l'argent du jeu
--  (prix qui double à chaque achat dans la journée). Plus de marche libre, plus de km du jour, plus de péage en passant,
--  plus de « ? » ramassé en passant ; le métro reste (depuis une station où l'on est). Rejouable sans risque.
-- =====================================================================
create or replace function _world_cfg() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'freeKm', 5, 'kmPrice', 10000, 'salary', 20000, 'ticket', 5000,
    'speed', 22, 'maxDur', 60,
    'reach', 120, 'reachBig', 300,
    'toll', 0.05, 'tollR', 22, 'tollCap', 0.1,
    'chanceR', 40, 'chancePct', 30,
    'step', 100, 'runSpeed', 70, 'runMin', 2.5, 'runMax', 7,   -- le dé : 100 m par point ; on y court en 2,5 à 7 s
    'w', 2.210, 'e', 2.480, 's', 48.805, 'n', 48.910,
    'start', jsonb_build_array(2.3488, 48.8530)) $$;
revoke all on function _world_cfg() from public, anon, authenticated;

-- une destination proposée par le dé : ce qui y attend (libre, chez soi, chez d'autres et combien, un « ? » du jour)
create or replace function _dice_item(u uuid, lo float8, la float8, t int) returns jsonb language sql stable as $$
  select _square(u, t) || jsonb_build_object(
    'dist', round(_wm(lo, la, c.cx / 1e5, c.cy / 1e5)),
    'chance', exists (select 1 from spots s where s.card = t) and _wchance_on(t, _wday())
              and not exists (select 1 from chance_taken k where k.user_id = u and k.day = paris_today() and k.card = t),
    'owners', (select coalesce(jsonb_agg(p.pseudo order by p.pseudo), '[]') from profiles p
               where p.id in (select owner from lots where card = t and owner <> u union select owner from parts where card = t and owner <> u)),
    -- le loyer qu'on paierait en tombant ici (comme _land : pouvoirs des partis, au plus 20 % de la trésorerie après le salaire)
    'pay', least(floor((me.cash + (pawn_cfg()->>'salary')::bigint * case when me.party = 'tendue' then 2 else 1 end) * (pawn_cfg()->>'tollCap')::numeric),
      coalesce((select floor(sum(z.amt)) from (
        select sum(x.r) * (case when me.party = 'poing' then 0.5 else 1 end) * (case when op.party = 'rempart' then 1.5 else 1 end) amt from (
          select l.owner, c.rent::numeric r from lots l where l.card = t and l.owner <> u and l.mort is null
          union all select x.owner, c.rent::numeric * x.n from parts x where x.card = t and x.owner <> u and x.mort is null) x
        join profiles op on op.id = x.owner group by x.owner, op.party) z), 0)),
    'bonus', floor(c.rent::numeric * ((select count(*) from lots where card = t and owner = u) + coalesce((select sum(n) from parts where card = t and owner = u), 0))))
  from cards c, profiles me where c.id = t and me.id = u $$;

-- les destinations : dans chaque quart (nord, est, sud, ouest), l'immeuble ou le lieu le plus près de la bonne distance et du
-- milieu du quart ; le meilleur « ? » du jour passe devant (un seul : sinon, près des lieux célèbres, on ne verrait que des « ? ») ;
-- si un quart est vide (la Seine, un bois), on élargit un peu (et beaucoup s'il en manque encore plus d'un)
create or replace function _dice_opts(u uuid, lo float8, la float8, d float8, excl int) returns jsonb language plpgsql stable as $$
declare band float8; ids int[]; rad float8; dmin float8; dmax float8; dy int := _wday(); today date := paris_today();
begin
  foreach band in array array[0.25, 0.5, 0.8, 2.5] loop
    dmin := greatest(30, d * (1 - band)); dmax := d * (1 + band) + case when band > 1 then 300 else 0 end; rad := dmax + 10;
    with c1 as (
      select k.id, k.lk, sqrt(power((k.cx / 1e5 - lo) * 73240, 2) + power((k.cy / 1e5 - la) * 110574, 2)) dist,
             degrees(atan2((k.cx / 1e5 - lo) * 73240, (k.cy / 1e5 - la) * 110574)) ang
      from cards k
      where k.cx between floor((lo - rad / 73240) * 1e5) and ceil((lo + rad / 73240) * 1e5)
        and k.cy between floor((la - rad / 110574) * 1e5) and ceil((la + rad / 110574) * 1e5)
        and k.id is distinct from excl),
    c2 as (
      select c1.id, c1.dist, c1.ang, (floor(mod((c1.ang + 405)::numeric, 360) / 90))::int dir,
             (c1.lk = 'p' and exists (select 1 from spots s where s.card = c1.id) and _wchance_on(c1.id, dy)
              and not exists (select 1 from chance_taken k where k.user_id = u and k.day = today and k.card = c1.id)) q
      from c1 where c1.dist between dmin and dmax),
    c3 as (
      select c2.*, abs(c2.dist - d) + 0.6 * d * radians(abs(mod((c2.ang - c2.dir * 90 + 540)::numeric, 360) - 180)::float8) base from c2),
    c4 as (
      select c3.id, c3.dir, c3.base - case when c3.q and row_number() over (partition by c3.q order by c3.base, c3.id) = 1 then d else 0 end sc from c3)
    select array_agg(z.id order by z.dir) into ids from (select distinct on (c4.dir) c4.id, c4.dir from c4 order by c4.dir, c4.sc, c4.id) z;
    exit when coalesce(array_length(ids, 1), 0) >= 4 or (band >= 0.8 and coalesce(array_length(ids, 1), 0) >= 3);   -- (4 si possible ; 3 en élargissant)
  end loop;
  return coalesce((select jsonb_agg(_dice_item(u, lo, la, x) order by o) from unnest(ids) with ordinality v(x, o)), '[]');
end $$;

-- tomber sur l'immeuble t (après le dé) : salaire, loyer aux propriétaires, bonus chez soi, carte Chance sur un « ? » du jour
create or replace function _land(u uuid, t int, a int, path int[]) returns json
language plpgsql as $$
#variable_conflict use_column
declare c cards; sq jsonb; me text := _party(u); sal bigint; perk text := null; toll numeric := 0; cap numeric; ratio numeric := 1; payees jsonb := '[]'; ch jsonb := null; o record; bonus bigint := 0;
begin
  sal := (pawn_cfg()->>'salary')::bigint * case when me = 'tendue' then 2 else 1 end;   -- Gauche : salaire doublé
  update profiles set pos = t, land = t, cash = cash + sal where id = u;   -- un salaire à chaque lancer
  perform _log(u, 'salary', sal, case when me = 'tendue' then 'Salaire du lancer (doublé : Gauche)' else 'Salaire du lancer' end, t);
  select * into c from cards where id = t;
  -- loyer à payer : chaque propriétaire reçoit une journée de loyer de ses biens ici (plafonné à 20 % de votre trésorerie)
  for o in
    select z.owner, sum(rent) * (case when me = 'poing' then 0.5 else 1 end) * (case when (select party from profiles where id = z.owner) = 'rempart' then 1.5 else 1 end) amt from (
      select l.owner, c.rent::numeric rent from lots l where l.card = t and l.owner <> u and l.mort is null
      union all select x.owner, c.rent::numeric * x.n from parts x where x.card = t and x.owner <> u and x.mort is null) z
    group by z.owner loop
    toll := toll + o.amt;
  end loop;
  if toll > 0 then
    cap := floor((select cash from profiles where id=u) * (pawn_cfg()->>'tollCap')::numeric);
    if toll > cap then ratio := case when toll = 0 then 0 else cap / toll end; end if;
    for o in
      select z.owner, p.pseudo, sum(rent) * (case when me = 'poing' then 0.5 else 1 end) * (case when (select party from profiles where id = z.owner) = 'rempart' then 1.5 else 1 end) amt from (
        select l.owner, c.rent::numeric rent from lots l where l.card = t and l.owner <> u and l.mort is null
        union all select x.owner, c.rent::numeric * x.n from parts x where x.card = t and x.owner <> u and x.mort is null) z
      join profiles p on p.id = z.owner group by z.owner, p.pseudo loop
      if floor(round(o.amt * ratio, 4)) >= 1 then   -- (arrondi : 13 060 × 4 200 / 13 060 = 4 200, pas 4 199)
        insert into pay(owner, amount, why) values (o.owner, floor(round(o.amt * ratio, 4)), 'loyer de passage');
        payees := payees || jsonb_build_object('pseudo', o.pseudo, 'amount', floor(round(o.amt * ratio, 4)));
        insert into news(kind, arr, card, actor, data) values ('toll', c.arr, t, u, jsonb_build_object('to', o.owner, 'pseudo', o.pseudo, 'amount', floor(round(o.amt * ratio, 4))));
      end if;
    end loop;
    toll := least(cap, floor(round(toll * ratio, 4)));
    if me = 'poing' then perk := 'poing'; elsif exists (select 1 from jsonb_array_elements(payees) e) and exists (select 1 from lots l join profiles p on p.id = l.owner where l.card = t and p.party = 'rempart' and l.owner <> u) then perk := 'rempart'; end if;
    update profiles set cash = greatest(0, cash - toll::bigint) where id = u;
    perform _log(u, 'toll_paid', -toll::bigint, 'Loyer de passage payé', t);
  end if;
  sq := _square(u, t);
  -- chez soi : une journée de loyer de ses biens ici en bonus
  if (sq->>'mine')::int > 0 then
    bonus := floor(c.rent::numeric * (sq->>'mine')::int);
    update profiles set cash = cash + bonus where id = u;
    perform _log(u, 'bonus', bonus, 'Bonus : chez vous', t);
  end if;
  -- un « ? » du jour (stations, jardins, places) : une carte Chance, une fois par jour pour chaque « ? »
  if exists (select 1 from spots s where s.card = t) and _wchance_on(t, _wday())
     and not exists (select 1 from chance_taken k where k.user_id = u and k.day = paris_today() and k.card = t) then
    insert into chance_taken(user_id, day, card) values (u, paris_today(), t) on conflict do nothing;
    ch := _chance(u);
  end if;
  if ch ? 'extra' and ch->'extra' <> 'null'::jsonb then perform _refresh_mayors(array[(select arr from cards where id = (ch->'extra'->>'card')::int)::int]); end if;
  return json_build_object('die', a, 'path', path, 'landing', json_build_object(
      'card', t, 'toll', toll, 'payees', payees, 'chance', ch, 'bonus', bonus, 'salary', sal, 'perk', perk, 'free', (sq->>'free')::int, 'mine', (sq->>'mine')::int),
    'state', state());
end $$;

-- lancer le dé : un lancer en moins, les destinations proposées (gardées tant qu'on n'a pas choisi : relancer les redonne)
create or replace function roll() returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); cfg jsonb := _world_cfg(); pr profiles; w walkers; a int; nxt int; opts jsonb; pos float8[];
begin
  perform _sync(u); perform _regen(u);
  select * into pr from profiles where id = u for update;
  select * into w from walkers where user_id = u;
  if not found then raise exception 'Revenez dans Paris'; end if;
  pos := _wpos(w);
  if pr.pend is not null and cardinality(pr.pend) > 0 then   -- déjà lancé : les mêmes destinations
    return json_build_object('die', pr.pend_die, 'options', coalesce((select jsonb_agg(_dice_item(u, pos[1], pos[2], x) order by o)
      from unnest(pr.pend) with ordinality v(x, o)), '[]'), 'state', state());
  end if;
  if w.dur > 0 and now() < w.t0 + make_interval(secs => w.dur) then raise exception 'Attendez d''être arrivé'; end if;
  if pr.rolls <= 0 then
    nxt := ceil(extract(epoch from (pr.rolls_at + ((pawn_cfg()->>'rollEveryMin') || ' minutes')::interval - now())) / 60);
    raise exception 'Plus de lancers : le prochain dans % min', greatest(1, nxt);
  end if;
  a := 1 + floor(random() * (pawn_cfg()->>'dieMax')::int)::int;
  opts := _dice_opts(u, pos[1], pos[2], a * (cfg->>'step')::float8, pr.land);
  if jsonb_array_length(opts) = 0 then raise exception 'Rien autour d''ici : prenez le métro'; end if;
  update profiles set rolls = rolls - 1, rolls_at = case when pr.rolls >= (pawn_cfg()->>'maxRolls')::int then now() else rolls_at end,
    pend = (select array_agg((e->>'card')::int order by o) from jsonb_array_elements(opts) with ordinality v(e, o)), pend_die = a where id = u;
  return json_build_object('die', a, 'options', opts, 'state', state());
end $$;
create or replace function roll(p_dir float8) returns json language plpgsql security definer set search_path = public as $$
begin return roll(); end $$;

-- aller sur l'une des destinations : le site envoie le trajet par les rues (sinon : tout droit) ; on y court, on y tombe
create or replace function dice_go(p_card int, p_path jsonb default null) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); cfg jsonb := _world_cfg(); pr profiles; w walkers; x world_people; c cards; pos float8[]; a int;
  v_path jsonb := null; v_len float8; v_dur float8; lo float8; la float8; c0 int; c1 int; r json;
begin
  perform _sync(u);
  select * into pr from profiles where id = u for update;
  if pr.pend is null or not (p_card = any(pr.pend)) then raise exception 'Lancez d''abord le dé'; end if;
  select * into x from world_people where user_id = u for update;
  if not found then raise exception 'Revenez dans Paris'; end if;
  select * into w from walkers where user_id = u for update;
  if not found then raise exception 'Revenez dans Paris'; end if;
  select * into c from cards where id = p_card;
  pos := _wpos(w);
  -- le trajet du site (pour le dessin, et pour les autres) : il part d'où l'on est (80 m près) et finit devant l'immeuble (90 m)
  if jsonb_typeof(p_path) = 'array' and jsonb_array_length(p_path) between 2 and 400
     and _wm((p_path->0->>0)::float8, (p_path->0->>1)::float8, pos[1], pos[2]) <= 80
     and _wm((p_path->-1->>0)::float8, (p_path->-1->>1)::float8, c.cx / 1e5, c.cy / 1e5) <= 90 then
    v_len := _wplen(p_path);
    if v_len <= 4000 then v_path := p_path; end if;
  end if;
  if v_path is null then
    v_path := jsonb_build_array(jsonb_build_array(pos[1], pos[2]), jsonb_build_array(c.cx / 1e5, c.cy / 1e5));
    v_len := _wm(pos[1], pos[2], c.cx / 1e5, c.cy / 1e5);
  end if;
  lo := (v_path->-1->>0)::float8; la := (v_path->-1->>1)::float8;
  v_dur := least((cfg->>'runMax')::float8, greatest((cfg->>'runMin')::float8, v_len / (cfg->>'runSpeed')::float8));
  a := pr.pend_die;
  update profiles set pend = null, pend_die = null where id = u;
  update walkers set lon0 = pos[1], lat0 = pos[2], lon = lo, lat = la, t0 = now(), dur = v_dur, len = v_len, path = v_path, settled = true where user_id = u;
  c0 := x.cell; c1 := _wcell(lo, la);
  update world_people set cell = c1, lon = lo, lat = la, seen = now() where user_id = u;
  perform _wemit(c0, u, 'move', jsonb_build_object('lon', lo, 'lat', la, 'dur', v_dur, 'path', v_path));
  if c1 <> c0 then perform _wemit(c1, u, 'move', jsonb_build_object('lon', lo, 'lat', la, 'dur', v_dur, 'path', v_path, 'join', _wperson(u))); end if;
  r := _land(u, p_card, a, array[p_card]);
  return (r::jsonb || jsonb_build_object('dur', v_dur, 'len', round(v_len), 'path', v_path))::json;
end $$;
create or replace function go_to(p_card int) returns json language plpgsql security definer set search_path = public as $$
begin return dice_go(p_card, null); end $$;

-- 5 lancers en plus contre l'argent du jeu (le prix double à chaque achat dans la journée : rolls_price)
create or replace function buy_rolls() returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles; price bigint;
begin
  perform _sync(u); perform _regen(u);
  select * into pr from profiles where id = u for update;
  price := rolls_price(pr);
  if pr.cash < price then raise exception 'Trésorerie insuffisante : il faut % €', price; end if;
  perform _log(u, 'rolls', -price, 'Achat de 5 lancers');
  update profiles set cash = cash - price, rolls = least(99, rolls + (pawn_cfg()->>'rollsPack')::int),
    rb_n = case when rb_day = paris_today() then rb_n + 1 else 1 end, rb_day = paris_today() where id = u;
  return state();
end $$;

-- plus de marche libre : on avance au dé (et au métro)
create or replace function world_move(p_lon float8, p_lat float8, p_len float8 default null, p_path jsonb default null, p_pay boolean default false) returns json
language plpgsql security definer set search_path = public as $$
begin raise exception 'Lancez le dé pour avancer'; end $$;

-- sa case : seulement là où le dé (ou le métro) l'a posé
create or replace function world_arrive(p_card int) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me();
begin
  if (select land from profiles where id = u) is distinct from p_card then raise exception 'Lancez le dé pour aller jusque-là'; end if;
  return state();
end $$;

-- les « ? » : seulement en tombant dessus avec le dé (_land)
create or replace function world_chance(p_card int) returns json
language plpgsql security definer set search_path = public as $$
begin raise exception 'Tombez dessus avec le dé pour tirer une carte Chance'; end $$;

-- à la banque, on n'achète que l'immeuble sur lequel on est tombé
create or replace function _near_or_fail(u uuid, card int) returns void language plpgsql as $$
declare l int;
begin
  select land into l from profiles where id = u;
  if l is distinct from card then raise exception 'Tombez dessus avec le dé pour l''acheter.'; end if;
end $$;

-- le métro (depuis la station où l'on est, vers n'importe quelle station de Paris, un ticket) : comme avant ; un dé lancé
-- et pas encore joué est rendu (ses destinations étaient autour de l'ancienne station)
create or replace function world_metro(p_to int) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); cfg jsonb := _world_cfg(); w walkers; x world_people; here int; dh float8; t cards; cost bigint; have bigint; pos float8[]; c0 int; c1 int; tl jsonb;
begin
  select * into x from world_people where user_id = u for update;
  if not found then raise exception 'Revenez dans Paris'; end if;
  select * into w from walkers where user_id = u for update;
  if not found then raise exception 'Revenez dans Paris'; end if;
  pos := _wpos(w);
  select m.card, _wm(pos[1], pos[2], c.cx / 1e5, c.cy / 1e5) into here, dh
    from (select distinct card from metro_stop) m join cards c on c.id = m.card order by 2 limit 1;
  if here is null or dh > (cfg->>'reach')::float8 then raise exception 'Allez d''abord jusqu''à une station'; end if;
  if not exists (select 1 from metro_stop where card = p_to) then raise exception 'Station inconnue'; end if;
  if p_to = here then raise exception 'Vous y êtes déjà'; end if;
  tl := _wsettle(u);
  cost := (cfg->>'ticket')::bigint;
  perform _sync(u);
  select p.cash into have from profiles p where p.id = u for update;
  if have < cost then raise exception 'Pas assez d''argent pour le ticket (% €)', cost; end if;
  update profiles set cash = cash - cost, land = p_to, pos = p_to,
    rolls = rolls + case when pend is not null and cardinality(pend) > 0 then 1 else 0 end, pend = null, pend_die = null where id = u;
  perform _log(u, 'metro', -cost, 'Ticket de métro', p_to);
  select * into t from cards where id = p_to;
  update walkers set lon0 = t.cx / 1e5, lat0 = t.cy / 1e5, lon = t.cx / 1e5, lat = t.cy / 1e5, t0 = now(), dur = 0, len = 0, path = null, settled = true where user_id = u;
  c0 := x.cell; c1 := _wcell(t.cx / 1e5, t.cy / 1e5);
  update world_people set cell = c1, lon = t.cx / 1e5, lat = t.cy / 1e5, seen = now() where user_id = u;
  perform _wemit(c0, u, 'move', jsonb_build_object('lon', t.cx / 1e5, 'lat', t.cy / 1e5, 'metro', true));
  if c1 <> c0 then perform _wemit(c1, u, 'join', _wperson(u)); end if;
  return json_build_object('from', here, 'to', p_to, 'toll', tl, 'w', _wout(u), 'state', state());
end $$;

-- entrer dans Paris (ou y revenir) : comme avant (départ au hasard, migration_depart.sql) ; la case où l'on est tombé reste
-- la sienne tant qu'on y est (on regarde où le trajet finit : recharger la page pendant qu'on court ne la fait pas perdre)
create or replace function world_join() returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); cfg jsonb := _world_cfg(); w walkers; lo float8; la float8; c cards; cl int; pos float8[]; sp jsonb;
begin
  if not exists (select 1 from profiles where id = u) then raise exception 'Créez d''abord votre compte de jeu'; end if;
  select * into w from walkers where user_id = u for update;
  if not found then
    select cd.* into c from profiles p join cards cd on cd.id = coalesce(p.land, p.pos) where p.id = u;
    if found and c.id is distinct from (pawn_cfg()->>'spawn')::int then
      lo := c.cx / 1e5 + (random() - .5) * .0003; la := c.cy / 1e5 + (random() - .5) * .0002;
    else
      sp := _wspawns(); sp := sp->(floor(random() * jsonb_array_length(sp))::int);
      lo := (sp->>0)::float8 + (random() - .5) * .00016; la := (sp->>1)::float8 + (random() - .5) * .0001;   -- (± 6 m : pas tous sur le même point)
    end if;
    insert into walkers(user_id, lon0, lat0, lon, lat, day, km) values (u, lo, la, lo, la, paris_today(), 0) returning * into w;
  end if;
  if not w.settled and (w.dur <= 0 or now() >= w.t0 + make_interval(secs => w.dur)) then perform _wsettle(u); end if;
  pos := _wpos(w); cl := _wcell(w.lon, w.lat);
  lo := w.lon; la := w.lat;   -- (pos est aussi une colonne de profiles)
  update profiles p set land = null where p.id = u and p.land is not null and not exists (
    select 1 from cards k where k.id = p.land and _wm(lo, la, k.cx / 1e5, k.cy / 1e5) <= 10 + (case
      when k.lk = 'p' and not exists (select 1 from spots s where s.card = k.id and s.kind = 'm') then cfg->>'reachBig' else cfg->>'reach' end)::float8);
  delete from world_people where seen < now() - interval '90 seconds';
  insert into world_people(user_id, cell, lon, lat, seen) values (u, cl, w.lon, w.lat, now())
    on conflict (user_id) do update set cell = excluded.cell, lon = excluded.lon, lat = excluded.lat, seen = now();
  perform _wemit(cl, u, 'join', _wperson(u));
  return json_build_object('me', u, 'pos', json_build_array(pos[1], pos[2]), 'w', _wout(u), 'cfg', cfg, 'admin', is_admin(),
    'trip', case when w.path is not null and w.dur > 0 and now() < w.t0 + make_interval(secs => w.dur)
                 then json_build_object('path', w.path, 'dur', w.dur, 'el', extract(epoch from now() - w.t0)) end,
    'chatOff', (select chat_off from profiles where id = u), 'land', (select land from profiles where id = u), 'last', coalesce((select max(id) from chat_msg), 0),
    'day', _wday(), 'taken', coalesce((select json_agg(card) from chance_taken where user_id = u and day = paris_today()), '[]'));
end $$;

-- les destinations proposées du temps du plateau (avant la marche, le 20/10/2026) ne valent plus rien ici
update profiles set pend = null, pend_die = null where pend is not null;

revoke all on function _dice_item(uuid, float8, float8, int), _dice_opts(uuid, float8, float8, float8, int), _land(uuid, int, int, int[]),
  _near_or_fail(uuid, int) from public, anon, authenticated;
revoke all on function roll(), roll(float8), dice_go(int, jsonb), go_to(int), buy_rolls(), world_move(float8, float8, float8, jsonb, boolean),
  world_arrive(int), world_chance(int), world_metro(int), world_join() from public, anon;
grant execute on function roll(), roll(float8), dice_go(int, jsonb), go_to(int), buy_rolls(), world_move(float8, float8, float8, jsonb, boolean),
  world_arrive(int), world_chance(int), world_metro(int), world_join() to authenticated;
