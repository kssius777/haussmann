-- =====================================================================
--  Le mur de glace est la limite du vol (26/10/2026, choix du propriétaire : « oui, le mur est la limite »).
--  Avant : un rectangle autour de Paris (_world_cfg : w, e, s, n), on pouvait voler un peu au-delà de la ville.
--  Généré par scripts/make_wall.py (la même boucle que le mur dessiné par le site, data/mur.json) : ne pas éditer à la main.
--  fly et fly_quote sont celles de migration_vol.sql et migration_viseur.sql, avec « or not _in_paris(lo, la) » en plus.
-- =====================================================================
create or replace function _paris_ring() returns float8[] language sql immutable as $$
  select array[2.22406,48.85328,2.223888,48.853377,2.223824,48.853521,2.223918,48.855734,2.224136,48.856603,2.225288,48.85947,2.2268,48.862454,2.227883,48.865259,2.228037,48.865511,2.23032,48.868215,2.231464,48.869258,2.232657,48.869801,2.235405,48.870755,2.237879,48.87143,2.239043,48.871801,2.239751,48.872079,2.240697,48.872542,2.241575,48.873083,2.242694,48.873939,2.245451,48.876663,2.24563,48.876718,2.245827,48.876708,2.2467,48.876378,2.254804,48.874364,2.255088,48.874451,2.258096,48.880476,2.258223,48.880595,2.258431,48.880651,2.277446,48.878243,2.279321,48.878773,2.279603,48.878805,2.279795,48.879659,2.27971,48.879771,2.279701,48.879879,2.279753,48.879979,2.279889,48.880076,2.279934,48.880278,2.279874,48.880378,2.27985,48.880546,2.279922,48.880669,2.280039,48.880745,2.28029,48.88186,2.280165,48.881989,2.280155,48.882126,2.280461,48.882616,2.280477,48.882841,2.280635,48.883097,2.280776,48.883238,2.280943,48.883313,2.284067,48.885614,2.284085,48.885723,2.284155,48.885807,2.285397,48.886757,2.290285,48.889166,2.290966,48.889532,2.291552,48.889717,2.292916,48.889883,2.293055,48.889916,2.29321,48.889918,2.294844,48.890117,2.298397,48.891932,2.307469,48.896227,2.312277,48.898016,2.318299,48.899861,2.320262,48.901017,2.320406,48.901042,2.322057,48.901092,2.322275,48.901054,2.323248,48.901072,2.32583,48.901212,2.36209,48.901947,2.36228,48.90198,2.36258,48.901957,2.370798,48.902123,2.370788,48.902377,2.370832,48.902486,2.371001,48.902604,2.371201,48.90264,2.373077,48.902419,2.373283,48.902331,2.373381,48.902177,2.380142,48.90232,2.380414,48.90237,2.380627,48.90233,2.384562,48.902411,2.388301,48.901632,2.39104,48.901136,2.391348,48.900991,2.391578,48.900838,2.395846,48.898409,2.395981,48.898261,2.397981,48.894811,2.398387,48.893584,2.398631,48.892679,2.399531,48.888571,2.399561,48.887816,2.399751,48.887733,2.39986,48.887566,2.399852,48.887467,2.399596,48.886795,2.399644,48.88541,2.40046,48.883949,2.401783,48.882825,2.404763,48.881505,2.405738,48.881258,2.407799,48.880846,2.408004,48.880836,2.408348,48.880736,2.40948,48.88051,2.409611,48.880463,2.409712,48.880381,2.412829,48.876515,2.414044,48.872462,2.414356,48.869224,2.414356,48.867514,2.414406,48.866488,2.414346,48.864719,2.414535,48.863387,2.414815,48.860263,2.416733,48.849263,2.416746,48.848698,2.416052,48.844964,2.41568,48.843759,2.415712,48.843635,2.415814,48.843564,2.415866,48.843489,2.415885,48.843285,2.415842,48.843206,2.415739,48.843124,2.4156,48.843071,2.415461,48.84305,2.415224,48.842284,2.415315,48.842086,2.415314,48.841974,2.415226,48.841852,2.415065,48.841772,2.414936,48.841354,2.415042,48.841225,2.41506,48.841,2.414957,48.840877,2.414806,48.840809,2.414706,48.840612,2.413966,48.838223,2.412636,48.834482,2.412575,48.83439,2.412398,48.83425,2.412359,48.834085,2.412792,48.83403,2.413927,48.833973,2.4146,48.833992,2.415399,48.834049,2.416337,48.83421,2.417181,48.834431,2.419172,48.835064,2.421645,48.835924,2.421201,48.836711,2.420544,48.839267,2.420023,48.840339,2.41988,48.840525,2.419433,48.840954,2.419162,48.841373,2.418999,48.841961,2.418964,48.842313,2.419018,48.84267,2.419456,48.843173,2.419467,48.843491,2.41954,48.843614,2.421643,48.844663,2.421823,48.844702,2.422008,48.84468,2.422533,48.844399,2.422995,48.843969,2.423631,48.843033,2.424198,48.842419,2.42445,48.842238,2.424787,48.84211,2.425881,48.841979,2.433279,48.841337,2.433499,48.841436,2.433687,48.841462,2.436841,48.841185,2.4376,48.844769,2.437752,48.844883,2.437973,48.844922,2.440185,48.844733,2.440248,48.844979,2.440366,48.845091,2.440284,48.845246,2.440378,48.846029,2.440424,48.846098,2.440526,48.846172,2.440741,48.846222,2.446742,48.846055,2.446938,48.845979,2.44704,48.845845,2.446939,48.845193,2.449609,48.844937,2.452701,48.844477,2.457924,48.843806,2.461132,48.843189,2.462642,48.842759,2.463953,48.842241,2.46493,48.841743,2.465561,48.84134,2.466477,48.840577,2.467273,48.839731,2.468242,48.838594,2.469563,48.837441,2.470009,48.836913,2.470244,48.836423,2.470224,48.835772,2.470111,48.835161,2.469884,48.83454,2.469877,48.834391,2.469829,48.834324,2.469721,48.83425,2.469232,48.833668,2.468753,48.833314,2.4672,48.832551,2.466582,48.832136,2.465983,48.831509,2.465957,48.83138,2.465788,48.831201,2.465523,48.830662,2.4652,48.829634,2.465044,48.828933,2.465006,48.828536,2.465041,48.8279,2.465197,48.827931,2.465384,48.827912,2.466374,48.827559,2.466484,48.827497,2.466544,48.827433,2.46657,48.827286,2.466115,48.826168,2.465708,48.824927,2.465655,48.824841,2.465694,48.824736,2.465684,48.824645,2.46542,48.824005,2.463256,48.820116,2.463091,48.819329,2.46302,48.819217,2.463092,48.819096,2.463071,48.818968,2.462934,48.818849,2.459596,48.817273,2.459784,48.816937,2.459805,48.816839,2.459727,48.816694,2.45961,48.816624,2.459501,48.816595,2.459306,48.816597,2.458964,48.816748,2.458694,48.816768,2.455087,48.816818,2.453387,48.816891,2.452403,48.817072,2.450704,48.817476,2.449371,48.817649,2.447786,48.817707,2.44419,48.817618,2.442317,48.817638,2.441767,48.817685,2.439812,48.818025,2.43736,48.817918,2.437199,48.817933,2.43701,48.818026,2.436937,48.818148,2.437028,48.818984,2.436729,48.819128,2.435935,48.819333,2.435004,48.819399,2.434325,48.818988,2.434176,48.818959,2.43406,48.818963,2.433858,48.819036,2.433773,48.819122,2.433744,48.819224,2.433877,48.820068,2.432188,48.821253,2.432097,48.821365,2.431908,48.821436,2.430079,48.822702,2.43,48.822788,2.429975,48.822866,2.429998,48.82297,2.430071,48.823059,2.42953,48.823249,2.427854,48.823647,2.426179,48.823869,2.424652,48.823927,2.421849,48.823798,2.419915,48.82382,2.418808,48.823987,2.417641,48.824279,2.416448,48.82448,2.415301,48.824527,2.413808,48.824458,2.412586,48.824479,2.411687,48.824542,2.410513,48.824752,2.409929,48.824893,2.409172,48.825187,2.408037,48.825788,2.406593,48.826767,2.404868,48.828114,2.403582,48.828844,2.402694,48.829175,2.402248,48.829302,2.401924,48.829128,2.401769,48.8291,2.401637,48.829108,2.399349,48.828384,2.39803,48.828085,2.395829,48.82748,2.394494,48.827293,2.390308,48.82548,2.389642,48.825111,2.38714,48.824233,2.385421,48.8235,2.38179,48.822208,2.38109,48.821546,2.380953,48.821467,2.376021,48.819843,2.36727,48.817063,2.363463,48.815903,2.355747,48.815667,2.35555,48.815749,2.35444,48.816639,2.352342,48.818192,2.351477,48.817745,2.347231,48.81582,2.346534,48.815728,2.345193,48.815826,2.344804,48.815793,2.344845,48.815543,2.344788,48.815424,2.34462,48.815323,2.344396,48.8153,2.344258,48.815331,2.342862,48.815835,2.341609,48.816071,2.333671,48.816509,2.331785,48.816759,2.331649,48.816807,2.331571,48.816864,2.331522,48.816933,2.331506,48.817035,2.331971,48.818082,2.292159,48.826872,2.283386,48.830575,2.279147,48.832153,2.275589,48.829261,2.273626,48.8281,2.273412,48.827951,2.273285,48.827898,2.272986,48.827692,2.272796,48.827658,2.267844,48.827578,2.267649,48.827607,2.267328,48.827801,2.267238,48.827933,2.266957,48.831595,2.267077,48.831726,2.269373,48.833038,2.267825,48.834239,2.267654,48.834328,2.267522,48.834328,2.262759,48.833659,2.255075,48.834551,2.254866,48.834621,2.251576,48.838498,2.251371,48.838685,2.25132,48.838775,2.250824,48.842895,2.251946,48.845246,2.250384,48.845314,2.24218,48.847427,2.24206,48.847489,2.241452,48.847975,2.241191,48.848263,2.239884,48.849394,2.239535,48.849616,2.239023,48.849798,2.226459,48.852563,2.226047,48.852726,2.22406,48.85328]::float8[] $$;
revoke all on function _paris_ring() from public, anon, authenticated;

-- dans Paris = dans la boucle du mur (le rectangle d'abord, pour aller vite)
create or replace function _in_paris(x float8, y float8) returns boolean language plpgsql immutable as $$
declare r float8[] := _paris_ring(); n int := array_length(r, 1) / 2; i int; j int; ins boolean := false; xi float8; yi float8; xj float8; yj float8;
begin
  if x is null or y is null or x < 2.223824 or x > 2.470244 or y < 48.8153 or y > 48.90264 then return false; end if;
  j := n;
  for i in 1..n loop
    xi := r[2 * i - 1]; yi := r[2 * i]; xj := r[2 * j - 1]; yj := r[2 * j];
    if ((yi > y) <> (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi) then ins := not ins; end if;
    j := i;
  end loop;
  return ins;
end $$;
revoke all on function _in_paris(float8, float8) from public, anon, authenticated;

-- voler : jusqu'à un immeuble (p_card : on s'y pose, sa case s'ouvre) ou un point de la carte ; tout droit, au-dessus des toits
create or replace function fly(p_lon float8, p_lat float8, p_card int default null) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); cfg jsonb := _world_cfg(); pr profiles; w walkers; x world_people; c cards; cur float8[];
  lo float8; la float8; v_len float8; km float8; kf float8; use_free float8; use_buy float8; sal bigint := 0; v_dur float8; v_path jsonb;
  c0 int; c1 int; tl jsonb; ch jsonb := null; sq jsonb := null; me text; from_card int;
begin
  perform _sync(u);
  select * into pr from profiles where id = u for update;
  select * into x from world_people where user_id = u for update;
  if not found then raise exception 'Revenez dans Paris'; end if;
  select * into w from walkers where user_id = u for update;
  if not found then raise exception 'Revenez dans Paris'; end if;
  if w.dur > 0 and now() < w.t0 + make_interval(secs => w.dur) then raise exception 'Attendez d''être arrivé'; end if;
  cur := _wpos(w);
  if p_card is not null then
    select * into c from cards where id = p_card;
    if not found then raise exception 'Immeuble inconnu'; end if;
    lo := c.cx / 1e5; la := c.cy / 1e5;
  else lo := p_lon; la := p_lat; end if;
  if lo is null or la is null or lo < (cfg->>'w')::float8 or lo > (cfg->>'e')::float8 or la < (cfg->>'s')::float8 or la > (cfg->>'n')::float8 or not _in_paris(lo, la) then
    raise exception 'Restez dans Paris';
  end if;
  v_len := _wm(cur[1], cur[2], lo, la);
  if v_len > (cfg->>'flyMax')::float8 then raise exception 'Trop loin pour un seul vol'; end if;
  km := v_len / 1000; kf := _kmfree(pr);
  if kf + pr.km_buy < km - 0.0005 then
    raise exception 'Pas assez de km : il vous en reste %', replace(to_char(kf + pr.km_buy, 'FM990.0'), '.', ',');
  end if;
  use_free := least(kf, km); use_buy := greatest(0, km - use_free); me := pr.party;
  sal := floor(use_free * (cfg->>'salaryKm')::numeric * case when me = 'tendue' then 2 else 1 end);   -- Gauche : salaire doublé
  from_card := pr.land;
  update profiles set km_free = kf - use_free, km_at = now(), km_buy = greatest(0, km_buy - use_buy), cash = cash + sal,
    land = p_card, pos = coalesce(p_card, pos) where id = u;
  if sal > 0 then perform _log(u, 'salary', sal, 'Salaire · ' || replace(to_char(km, 'FM990.0'), '.', ',') || ' km' || case when me = 'tendue' then ' (doublé : Gauche)' else '' end, p_card); end if;
  delete from toll_seen where user_id = u and day < paris_today() - 1;
  tl := _ftoll(u, cur[1], cur[2], lo, la, from_card);   -- (après le salaire : le plafond de 10 % le compte)
  v_dur := least((cfg->>'runMax')::float8, greatest((cfg->>'runMin')::float8, v_len / (cfg->>'runSpeed')::float8));
  v_path := jsonb_build_array(jsonb_build_array(cur[1], cur[2]), jsonb_build_array(lo, la));
  update walkers set lon0 = cur[1], lat0 = cur[2], lon = lo, lat = la, t0 = now(), dur = v_dur, len = v_len, path = v_path, settled = true where user_id = u;
  c0 := x.cell; c1 := _wcell(lo, la);
  update world_people set cell = c1, lon = lo, lat = la, seen = now() where user_id = u;
  perform _wemit(c0, u, 'move', jsonb_build_object('lon', lo, 'lat', la, 'dur', v_dur, 'path', v_path));
  if c1 <> c0 then perform _wemit(c1, u, 'move', jsonb_build_object('lon', lo, 'lat', la, 'dur', v_dur, 'path', v_path, 'join', _wperson(u))); end if;
  if p_card is not null then
    -- un « ? » du jour (stations, jardins, places) : une carte Chance, une fois par jour pour chaque « ? »
    if exists (select 1 from spots s where s.card = p_card) and _wchance_on(p_card, _wday())
       and not exists (select 1 from chance_taken k where k.user_id = u and k.day = paris_today() and k.card = p_card) then
      insert into chance_taken(user_id, day, card) values (u, paris_today(), p_card) on conflict do nothing;
      ch := _chance(u);
      if ch ? 'extra' and ch->'extra' <> 'null'::jsonb then perform _refresh_mayors(array[(select arr from cards where id = (ch->'extra'->>'card')::int)::int]); end if;
    end if;
    sq := _square(u, p_card);
  end if;
  return json_build_object('dur', v_dur, 'len', round(v_len), 'path', v_path, 'salary', sal, 'toll', tl,
    'km', round(((select _kmfree(p) + p.km_buy from profiles p where p.id = u))::numeric, 3),
    'landing', case when p_card is null then null else json_build_object('card', p_card, 'chance', ch, 'salary', sal,
      'toll', (tl->>'toll')::bigint, 'n', (tl->>'n')::int, 'perk', tl->>'perk', 'free', (sq->>'free')::int, 'mine', (sq->>'mine')::int) end,
    'state', state());
end $$;

-- ce que coûterait un vol jusqu'à un point (ou un immeuble) : la distance, assez de km ?, le salaire, le péage — sans rien payer
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
  if lo is null or la is null or lo < (cfg->>'w')::float8 or lo > (cfg->>'e')::float8 or la < (cfg->>'s')::float8 or la > (cfg->>'n')::float8 or not _in_paris(lo, la) then
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
