-- =====================================================================
--  Le départ des nouveaux joueurs (21/10/2026, choix du propriétaire : « oui stp, hasard ») : devant un grand lieu
--  tiré au hasard, plutôt que tous devant Notre-Dame (pas de foule au même endroit le jour du lancement).
--  Chaque point est sur une rue du plan pour marcher (walk.json) avec des biens achetables à portée
--  (au moins 15 immeubles à 120 m, vérifié par test_monde.py). Les anciens joueurs reprennent où ils étaient
--  (ou là où était leur pion, s'ils n'étaient jamais entrés dans Paris). Rejouable sans risque.
-- =====================================================================
create or replace function _wspawns() returns jsonb language sql immutable as $$ select '[
  [2.34812, 48.85215],
  [2.29637, 48.85860],
  [2.31001, 48.85807],
  [2.29032, 48.86498],
  [2.29730, 48.87363],
  [2.30404, 48.87092],
  [2.32516, 48.87101],
  [2.30959, 48.88062],
  [2.33919, 48.86222],
  [2.33205, 48.87061],
  [2.34052, 48.88637],
  [2.33220, 48.88394],
  [2.34319, 48.84652],
  [2.33895, 48.84894],
  [2.33371, 48.85424],
  [2.32149, 48.84355],
  [2.35161, 48.85743],
  [2.35152, 48.86024],
  [2.36577, 48.85619],
  [2.37141, 48.85449],
  [2.36356, 48.86715],
  [2.36586, 48.87205],
  [2.35489, 48.87982],
  [2.37183, 48.84654],
  [2.39436, 48.84861],
  [2.35681, 48.83182],
  [2.37711, 48.87992],
  [2.37699, 48.87206],
  [2.38923, 48.85837]
]'::jsonb $$;
-- dans l'ordre : Notre-Dame, tour Eiffel, Invalides, Trocadéro, Arc de Triomphe, Champs-Élysées, Madeleine, parc Monceau,
-- Louvre, Opéra Garnier, Sacré-Cœur, Moulin Rouge, Panthéon, Luxembourg, Saint-Germain-des-Prés, Montparnasse,
-- Hôtel de Ville, Centre Pompidou, place des Vosges, Bastille, République, canal Saint-Martin, gare du Nord,
-- gare de Lyon, Nation, place d'Italie, Buttes-Chaumont, Belleville, Père-Lachaise
revoke all on function _wspawns() from public, anon, authenticated;

-- entrer dans le monde (ou y revenir) : on reprend où l'on était ; la première fois, devant un grand lieu tiré au hasard
-- (un ancien joueur du temps du dé : là où était son pion)
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
  -- le bien « à portée » d'avant (une case du dé, une visite d'hier) ne reste achetable que s'il est encore à portée
  lo := pos[1]; la := pos[2];   -- (pos est aussi une colonne de profiles)
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
revoke all on function world_join() from public, anon;
grant execute on function world_join() to authenticated;
