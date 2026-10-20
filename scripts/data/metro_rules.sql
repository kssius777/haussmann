create table if not exists spots (
  card  int primary key,                -- la carte (cards.id)
  kind  text not null,                  -- m station de métro · j jardin · b bois · p place · c canal
  lines text[]                          -- lignes de métro (stations)
);
alter table spots enable row level security;

-- bonus réseau : +1 % de loyers par station où l'on a au moins une part, jusqu'à +15 %
create or replace function _network(p uuid) returns int language sql stable as $$
  select least(15, count(*))::int from parts x join spots s on s.card = x.card where x.owner = p and s.kind = 'm' and x.n > 0 $$;
revoke all on function _network(uuid) from public, anon, authenticated;

-- les loyers (comme avant), multipliés par le bonus réseau
create or replace function _rates(p uuid) returns table(arr smallint, rate float8, mayor uuid, tax float8)
language plpgsql as $$
#variable_conflict use_column
declare ev day_event := _event(); myparty text; net float8 := 1 + _network(p) / 100.0;
begin
  select party into myparty from profiles where id=p;
  return query
  with ml as (
    select l.card, l.k, c.arr a, c.rent, c.lots, c.et, c.lk, l.mort,
           floor_of(c.lk, c.lots, c.et, l.k) f
    from lots l join cards c on c.id=l.card where l.owner=p
  ),
  per_card as (select card, count(*) n from ml group by card),
  per_floor as (select card, f, count(*) n from ml group by card, f),
  per_arr as (select a, count(*) n from ml group by a),
  fxa as (select * from fx where owner=p and until > now()),
  lotrates as (
    select ml.a,
      case when ml.mort is not null then 0
           when exists (select 1 from fxa where fxa.kind='lot' and fxa.card=ml.card and fxa.k=ml.k) then 0
      else ml.rent
        * case when pc.n = ml.lots and ml.lots > 1 then (cfg()->>'titleBonus')::float8
               when ml.lk='l' and floor_hi(ml.lots,ml.et,ml.f)-floor_lo(ml.lots,ml.et,ml.f)+1 >= 2
                    and pf.n = floor_hi(ml.lots,ml.et,ml.f)-floor_lo(ml.lots,ml.et,ml.f)+1 then (cfg()->>'floorBonus')::float8
               else 1 end
        * case when ev.arr = ml.a then ev.m else 1 end
        * case when s.party is not null and s.party = myparty then 1.10 else 1 end
        * coalesce((select exp(sum(ln(fxa.m))) from fxa where fxa.kind='all' or (fxa.kind='bld' and fxa.card=ml.card)), 1)
      end as r
    from ml join per_card pc on pc.card=ml.card
            join per_floor pf on pf.card=ml.card and pf.f=ml.f
            join per_arr pa on pa.a=ml.a
            left join arr_state s on s.arr=ml.a and s.mayor is not null
  ),
  partrates as (
    select c.arr a,
      case when pt.mort is not null then 0 else
        c.rent::float8 * pt.n
        * case when pt.n*4 >= c.lots and pt.owner = (select owner from parts x where x.card=pt.card order by n desc, owner limit 1) then (cfg()->>'gardien')::float8 else 1 end
        * case when ev.arr = c.arr then ev.m else 1 end
        * case when s.party is not null and s.party = myparty then 1.10 else 1 end
        * coalesce((select exp(sum(ln(fxa.m))) from fxa where fxa.kind='all' or (fxa.kind='bld' and fxa.card=pt.card)), 1)
      end as r
    from parts pt join cards c on c.id=pt.card left join arr_state s on s.arr=c.arr and s.mayor is not null
    where pt.owner=p
  ),
  allr as (select a, r from lotrates union all select a, r from partrates)
  select allr.a::smallint, sum(allr.r)::float8 * net,
         s.mayor,
         case when s.mayor is null or s.mayor = p then 0
              else (cfg()->>'tax')::float8 end
  from allr left join arr_state s on s.arr = allr.a
  group by allr.a, s.mayor, s.party;
end $$;

-- les boosters : une case Commune peut aussi donner une part de station de métro (les stations à une ligne sont Communes)
create or replace function _draw(p uuid, tier char) returns jsonb language plpgsql as $$
#variable_conflict use_column
declare t text; c cards; k int; f int; lo int; hi int; ks int[]; sold int; n int; att int; i int;
begin
  for att in 1..40 loop
    t := case tier
      when 'C' then _pick_weighted(array['key','floor','part'], array[80,12,8])   -- 'part' : une part de station de métro (20/10/2026)
      when 'U' then _pick_weighted(array['key','floor','part'], array[35,45,20])
      when 'R' then _pick_weighted(array['key','floor','title','part'], array[15,30,40,15])
      when 'L' then _pick_weighted(array['title','part','key'], array[45,45,10])
      else          _pick_weighted(array['part','title'], array[75,25]) end;
    if att > 30 then t := 'key'; end if;  -- filet de sécurité : il reste toujours des clés libres

    if t = 'key' then
      select * into c from cards where r = any(case when tier='L' then array['L','M'] else array[tier] end) and lk <> 'p'
        order by random() limit 1;
      if not found then continue; end if;
      for i in 1..8 loop
        k := floor(random()*c.lots)::int;
        insert into lots(card,k,owner) values (c.id,k,p) on conflict do nothing;
        if found then
          perform _add_value(p, c.arr, c.v);
          return jsonb_build_object('t','key','card',c.id,'ks',jsonb_build_array(k),'tier',tier);
        end if;
      end loop;

    elsif t = 'floor' then
      select * into c from cards where r = any(case tier when 'C' then array['C'] when 'U' then array['C','U'] else array['U','R'] end)
        and lk='l' and lots >= 2 and et >= 2 order by random() limit 1;
      if not found then continue; end if;
      f := 1 + floor(random()*c.et)::int;
      lo := floor_lo(c.lots,c.et,f); hi := floor_hi(c.lots,c.et,f);
      if hi - lo + 1 < 2 then continue; end if;
      -- l'étage doit être entièrement libre
      if exists (select 1 from lots where card=c.id and k between lo and hi) then continue; end if;
      begin
        insert into lots(card,k,owner) select c.id, g, p from generate_series(lo,hi) g;
      exception when unique_violation then continue; end;
      perform _add_value(p, c.arr, c.v*(hi-lo+1));
      select array_agg(g) into ks from generate_series(lo,hi) g;
      return jsonb_build_object('t','floor','card',c.id,'ks',to_jsonb(ks),'tier',tier);

    elsif t = 'title' then
      select * into c from cards cc where r = any(case tier when 'R' then array['C','U'] when 'L' then array['C','U','R'] else array['R','L'] end)
        and lk <> 'p' and lots between 2 and (case tier when 'R' then 12 when 'L' then 40 else 80 end)
        and not exists (select 1 from lots where card=cc.id)
        order by random() limit 1;
      if not found then continue; end if;
      begin
        insert into lots(card,k,owner) select c.id, g, p from generate_series(0,c.lots-1) g;
      exception when unique_violation then continue; end;
      perform _add_value(p, c.arr, c.v*c.lots);
      insert into news(kind, arr, card, actor) values ('title', c.arr, c.id, p);
      return jsonb_build_object('t','title','card',c.id,'ks',(select jsonb_agg(g) from generate_series(0,c.lots-1) g),'tier',tier);

    else -- part
      select * into c from cards where r = tier and lk='p' order by random() limit 1;
      if not found then continue; end if;
      perform 1 from cards where id=c.id for update;           -- verrou : un seul tirage à la fois sur ce monument
      select coalesce(sum(x.n),0) into sold from parts x where x.card=c.id;
      if sold >= c.lots then continue; end if;
      n := least(case tier when 'U' then 3 when 'R' then 2 else 1 end, c.lots - sold);
      insert into parts(card,owner,n) values (c.id,p,n) on conflict (card,owner) do update set n = parts.n + excluded.n;
      perform _add_value(p, c.arr, c.v*n);
      return jsonb_build_object('t','part','card',c.id,'n',n,'tier',tier);
    end if;
  end loop;
  return null;
end $$;
revoke all on function _draw(uuid, char) from public, anon, authenticated;
