-- =====================================================================
--  Les groupes (21/10/2026, idée du propriétaire : « on n'est pas obligé de mettre tout le monde sur la même map en même
--  temps ») : dans un carré bondé, les joueurs sont répartis en groupes d'environ 40, et chacun ne voit (et ne reçoit) que le
--  sien. Sans ça, chaque pas part à tous ceux qui sont autour : 300 joueurs au même endroit (au départ, devant Notre-Dame),
--  ce serait 300 × 300 messages. Avec les groupes, le nombre de messages reste borné, quoi qu'il arrive.
--   · chaque joueur a une couche fixe, de 0 à 7, tirée de son identifiant (_wlayer) ;
--   · chaque carré a un nombre de groupes g = 1, 2, 4 ou 8 (world_cells ; pas de ligne = 1) : on double au-delà de 40 par
--     groupe ; on divise par deux sous 15 par groupe, pas plus d'une fois toutes les 30 s (_wregroup, à chaque arrivée,
--     départ ou trajet, et quand le site relit qui est là) ;
--   · un joueur est dans le groupe (couche % g) de son carré : ses évènements partent sur le canal « w:carré » si g = 1
--     (comme avant), sinon « w:carré.groupe » ; world_look / world_people / world_feed ne rendent que son groupe ;
--     un achat près d'ici (« map ») part à tous les groupes ;
--   · quand g change, un évènement « regroup » part sur les anciens canaux : le site réécoute les bons.
--  Rejouable sans risque.
-- =====================================================================
create table if not exists world_cells (cell int primary key, g smallint not null default 1, at timestamptz not null default now());
alter table world_cells enable row level security;   -- (aucune politique : seules les fonctions du jeu y touchent)
revoke all on world_cells from anon, authenticated;
alter table chat_msg add column if not exists gn smallint not null default 1;   -- combien de groupes avait le carré
alter table chat_msg add column if not exists gi smallint not null default 0;   -- le groupe qui l'a reçu
create index if not exists world_people_cell on world_people(cell);

create or replace function _wlayer(u uuid) returns int language sql immutable as $$
  select get_byte(decode(md5(u::text), 'hex'), 0) % 8 $$;
create or replace function _wg(p_cell int) returns int language sql stable as $$
  select coalesce((select g from world_cells where cell = p_cell), 1) $$;

-- un évènement pour un groupe d'un carré : gardé 2 minutes (pour ceux qui n'ont pas le temps réel) et envoyé sur son canal
create or replace function _wsend(p_cell int, p_g int, p_gi int, p_user uuid, p_kind text, p_data jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare i bigint;
begin
  insert into chat_msg(room, user_id, kind, data, gn, gi) values (p_cell, p_user, p_kind, coalesce(p_data, '{}'), p_g, p_gi) returning id into i;
  delete from chat_msg where at < now() - interval '2 minutes';
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    begin
      execute 'select realtime.send($1, $2, $3, true)'
        using jsonb_build_object('e', i, 'k', p_kind, 'u', p_user, 'c', p_cell, 'd', coalesce(p_data, '{}')), 'ev',
              'w:' || p_cell || case when p_g > 1 then '.' || p_gi else '' end;
    exception when others then null;   -- le temps réel ne doit jamais bloquer le jeu : le site relit world_feed()
    end;
  end if;
  return i;
end $$;

-- le bon nombre de groupes pour ce carré (et « regroup » sur les anciens canaux s'il change)
create or replace function _wregroup(p_cell int, p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int; g int := 1; t timestamptz; ng int; k int;
begin
  select wc.g, wc.at into g, t from world_cells wc where wc.cell = p_cell;
  g := coalesce(g, 1);
  select count(*) into n from world_people where cell = p_cell and seen > now() - interval '90 seconds';
  ng := g;
  while n > 40 * ng and ng < 8 loop ng := ng * 2; end loop;
  if ng = g and g > 1 and n < 15 * g and (t is null or t < now() - interval '30 seconds') then ng := g / 2; end if;
  if ng = g then return g; end if;
  if ng = 1 then delete from world_cells where cell = p_cell;
  else insert into world_cells(cell, g, at) values (p_cell, ng, now()) on conflict (cell) do update set g = excluded.g, at = now(); end if;
  for k in 0 .. g - 1 loop perform _wsend(p_cell, g, k, p_user, 'regroup', jsonb_build_object('g', ng)); end loop;
  return ng;
end $$;

-- un évènement du monde : à son groupe dans ce carré (à tous les groupes pour un achat près d'ici)
create or replace function _wemit(p_cell int, p_user uuid, p_kind text, p_data jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare g int; k int; i bigint;
begin
  g := case when p_kind in ('join', 'move', 'leave') then _wregroup(p_cell, p_user) else _wg(p_cell) end;   -- (le monde du carré a pu changer)
  if g <= 1 then return _wsend(p_cell, 1, 0, p_user, p_kind, p_data); end if;
  if p_kind = 'map' then
    for k in 0 .. g - 1 loop i := _wsend(p_cell, g, k, p_user, p_kind, p_data); end loop; return i;
  end if;
  return _wsend(p_cell, g, _wlayer(p_user) % g, p_user, p_kind, p_data);
end $$;

-- qui est là (son groupe seulement), le nombre de groupes des carrés qu'on regarde, et sa couche : tout pour bien écouter
create or replace function world_look(p_cells int[]) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); l int := _wlayer(u); c int;
begin
  update world_people set seen = now() where user_id = u returning cell into c;
  if c is not null then perform _wregroup(c, u); end if;
  return json_build_object('lay', l,
    'g', coalesce((select json_object_agg(wc.cell, wc.g) from world_cells wc where wc.cell = any(p_cells[1:16])), '{}'),
    'people', coalesce((select json_agg(_wperson(x.user_id)) from world_people x left join world_cells wc on wc.cell = x.cell
      where x.cell = any(p_cells[1:16]) and x.seen > now() - interval '90 seconds'
        and (coalesce(wc.g, 1) = 1 or _wlayer(x.user_id) % wc.g = l % wc.g)), '[]'));
end $$;

-- (les sites d'avant) les gens des carrés qu'on regarde : son groupe seulement
create or replace function world_people(p_cells int[]) returns json
language plpgsql security definer set search_path = public as $$
declare r json;
begin
  r := world_look(p_cells); return r->'people';
end $$;

-- les évènements de ces carrés depuis le dernier vu, pour son groupe (et le nombre de groupes, pour réécouter s'il a changé)
create or replace function world_feed(p_cells int[], p_since bigint) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); here boolean; l int := _wlayer(u);
begin
  update world_people set seen = now() where user_id = u returning true into here;
  return json_build_object('gone', here is null,
    'g', coalesce((select json_object_agg(wc.cell, wc.g) from world_cells wc where wc.cell = any(p_cells[1:16])), '{}'),
    'ev', coalesce((select json_agg(json_build_object('e', m.id, 'k', m.kind, 'u', m.user_id, 'c', m.room, 'd', m.data) order by m.id)
    from (select * from chat_msg where room = any(p_cells[1:16]) and id > coalesce(p_since, 0) and (gn <= 1 or gi = l % gn) order by id limit 300) m), '[]'));
end $$;

revoke all on function _wlayer(uuid), _wg(int), _wsend(int, int, int, uuid, text, jsonb), _wregroup(int, uuid), _wemit(int, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function world_look(int[]), world_people(int[]), world_feed(int[], bigint) from public, anon;
grant execute on function world_look(int[]), world_people(int[]), world_feed(int[], bigint) to authenticated;
