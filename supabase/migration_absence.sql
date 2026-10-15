-- Haussmann · « Mon argent » : les loyers gagnés pendant une absence apparaissent sur une ligne à part,
-- avec la durée (« Loyers pendant votre absence · 2 j 4 h »). Rejouable sans risque.
create or replace function _sync(p uuid) returns void language plpgsql as $$
#variable_conflict use_column
declare pr profiles; secs float8; x record; w city_week; net float8 := 0; t float8; gross float8 := 0; taxes float8 := 0; cr bigint := 0; py record;
begin
  select * into pr from profiles where id=p for update;
  for py in with d as (delete from pay where owner=p returning amount, why) select why, sum(amount) amt from d group by why loop
    update profiles set cash = cash + py.amt where id=p;
    perform _log(p, case py.why when 'taxe' then 'tax_in' when 'vente' then 'sale' else 'toll_in' end, py.amt::bigint, case py.why when 'taxe' then 'Taxe de maire reçue' when 'vente' then 'Vente au Marché' else 'Loyer de passage reçu' end);
  end loop;
  secs := extract(epoch from (now() - pr.rent_at));
  if secs < 1 then return; end if;
  for x in select * from _rates(p) loop
    t := x.rate * x.tax * secs / 86400;
    net := net + x.rate * secs / 86400 - t; gross := gross + x.rate * secs / 86400; taxes := taxes + t;
    if t >= 1 then insert into pay(owner, amount, why) values (x.mayor, floor(t)::bigint, 'taxe'); end if;
  end loop;
  w := _week();
  if w.party is not null and w.party = pr.party then net := net + w.bonus * secs / 86400; gross := gross + w.bonus * secs / 86400; end if;
  -- crédit immobilier : la moitié du loyer de base de chaque bien à crédit part à la banque, jusqu'au remboursement
  with r as (select l.card, l.k, least(l.loan, floor(c.rent * (cfg()->>'creditShare')::float8 * secs / 86400))::bigint amt
             from lots l join cards c on c.id = l.card where l.owner = p and l.loan > 0 and l.mort is null),
       u1 as (update lots set loan = nullif(lots.loan - r.amt, 0) from r where lots.card = r.card and lots.k = r.k returning r.amt)
  select coalesce(sum(amt), 0) into t from u1;
  net := net - t; cr := cr + t::bigint;
  with r as (select x.card, least(x.loan, floor(c.rent * x.n * (cfg()->>'creditShare')::float8 * secs / 86400))::bigint amt
             from parts x join cards c on c.id = x.card where x.owner = p and x.loan > 0 and x.mort is null),
       u2 as (update parts set loan = nullif(parts.loan - r.amt, 0) from r where parts.card = r.card and parts.owner = p returning r.amt)
  select coalesce(sum(amt), 0) into t from u2;
  net := net - t; cr := cr + t::bigint;
  update profiles set cash = greatest(0, cash + floor(net)::bigint), rent_at = now() where id=p;
  -- absence de plus d'une heure : une ligne à part, « Loyers pendant votre absence · 2 j 4 h »
  if secs >= 3600 then
    perform _log(p, 'rent_away', floor(gross)::bigint, 'Loyers pendant votre absence · ' ||
      case when secs >= 86400 then floor(secs/86400)::int || ' j ' || floor(mod(secs::numeric, 86400)/3600)::int || ' h'
           else floor(secs/3600)::int || ' h ' || lpad(floor(mod(secs::numeric, 3600)/60)::int::text, 2, '0') end);
  else
    perform _log(p, 'rent', floor(gross)::bigint, 'Loyers');
  end if;
  if taxes >= 1 then perform _log(p, 'tax', -floor(taxes)::bigint, 'Taxe des maires'); end if;
  if cr > 0 then perform _log(p, 'credit', -cr, 'Remboursement des crédits'); end if;
end $$;
