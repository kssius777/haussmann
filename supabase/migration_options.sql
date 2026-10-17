-- Après le dé : plus de destinations proposées au bord de Paris (près des bois, de la Seine) : on accepte des immeubles un peu moins loin et dans un angle plus large
create or replace function _options(u uuid, start int, n int) returns jsonb
language plpgsql as $$
#variable_conflict use_column
declare sx float8; sy float8; q int; t int; dmax int; out jsonb := '[]'; seen int[] := '{}';
begin
  select cx * 0.7324, cy * 1.10574 into sx, sy from cards where id = start;
  create temp table if not exists _wk(node int primary key, d int, par int) on commit drop;
  truncate _wk; insert into _wk select * from _reach(start, n);
  select max(d) into dmax from _wk;
  for q in 0..3 loop
    select r.node into t from _wk r join cards c on c.id = r.node
      where r.d >= greatest(1, floor(dmax * 0.6)) and r.node <> all(seen) and r.node <> start
        and cos(atan2(c.cy * 1.10574 - sy, c.cx * 0.7324 - sx) - q * pi() / 2) > 0.3
      order by sqrt(power(c.cx * 0.7324 - sx, 2) + power(c.cy * 1.10574 - sy, 2)) * cos(atan2(c.cy * 1.10574 - sy, c.cx * 0.7324 - sx) - q * pi() / 2) desc
      limit 1;
    if t is not null then
      seen := seen || t;
      out := out || (_square(u, t) || jsonb_build_object('dir', q,
        'owners', (select coalesce(jsonb_agg(distinct p.pseudo), '[]') from (select owner from lots where card = t and owner <> u union select owner from parts where card = t and owner <> u) z join profiles p on p.id = z.owner)));
    end if;
    t := null;
  end loop;
  return out;
end $$;
