-- Haussmann · choisir sa direction avant de lancer le dé. Rejouable sans risque.
alter table profiles add column if not exists aim boolean default false;
create or replace function _walk(u uuid, start int, n int) returns int[] language plpgsql as $$
#variable_conflict use_column
declare hd float8; sx float8; sy float8; t int; cur int; path int[] := '{}'; dmax int; tx float8; ty float8; am boolean;
begin
  -- direction choisie par le joueur (aim) : on la suit de près ; sinon on continue à peu près tout droit
  select case when coalesce(aim, false) then heading + (random() - 0.5) * 0.4 else coalesce(heading, random() * 2 * pi()) + (random() - 0.5) * 1.8 end,
         coalesce(aim, false) into hd, am from profiles where id = u;
  select cx * 0.7324, cy * 1.10574 into sx, sy from cards where id = start;
  create temp table if not exists _wk(node int primary key, d int, par int) on commit drop;
  truncate _wk; insert into _wk select * from _reach(start, n);
  select max(d) into dmax from _wk;
  select r.node into t from _wk r join cards c on c.id = r.node
    where r.d = dmax
    order by sqrt(power(c.cx * 0.7324 - sx, 2) + power(c.cy * 1.10574 - sy, 2))
             * (case when am then power(greatest(0.02, 0.5 + 0.5 * cos(atan2(c.cy * 1.10574 - sy, c.cx * 0.7324 - sx) - hd)), 3)
                     else 0.55 + 0.45 * cos(atan2(c.cy * 1.10574 - sy, c.cx * 0.7324 - sx) - hd) end)
             * (0.85 + random() * 0.3) desc
    limit 1;
  if t is null then return array[start]; end if;
  cur := t;
  while cur is not null loop path := cur || path; select par into cur from _wk where node = cur; end loop;
  select cx * 0.7324, cy * 1.10574 into tx, ty from cards where id = t;
  update profiles set heading = atan2(ty - sy, tx - sx), aim = false where id = u;   -- la prochaine fois, à peu près la même direction
  return path;
end $$;

-- Lancer le dé dans une direction choisie (angle en radians : 0 = est, π/2 = nord)
create or replace function roll(p_dir float8) returns json
language plpgsql security definer set search_path = public as $$
begin
  update profiles set heading = p_dir, aim = true where id = _need_me();
  return roll();
end $$;
grant execute on function roll(float8) to anon, authenticated;
