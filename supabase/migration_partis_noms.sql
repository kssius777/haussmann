-- Les partis s'appellent maintenant par leur position (choix du propriétaire, 19/10/2026) :
-- Extrême gauche, Gauche, Centre, Droite, Extrême droite (les clés poing, tendue, milieu, valeurs, rempart ne changent pas).
-- Seul texte côté serveur qui citait un nom : la ligne de salaire doublé dans « Mon argent ». Rejouable sans risque.
create or replace function _land(u uuid, t int, a int, path int[]) returns json
language plpgsql as $$
#variable_conflict use_column
declare c cards; sq jsonb; me text := _party(u); sal bigint; perk text := null; toll numeric := 0; cap numeric; ratio numeric := 1; payees jsonb := '[]'; ch jsonb := null; o record; bonus bigint := 0;
begin
  sal := (pawn_cfg()->>'salary')::bigint * case when me = 'tendue' then 2 else 1 end;   -- Gauche Unie : salaire doublé
  update profiles set pos = t, land = t, cash = cash + sal where id = u;   -- petit salaire à chaque lancer
  perform _log(u, 'salary', sal, case when me = 'tendue' then 'Salaire du tour (doublé : Gauche)' else 'Salaire du tour' end, t);
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
      if floor(o.amt * ratio) >= 1 then
        insert into pay(owner, amount, why) values (o.owner, floor(o.amt * ratio), 'loyer de passage');
        payees := payees || jsonb_build_object('pseudo', o.pseudo, 'amount', floor(o.amt * ratio));
        insert into news(kind, arr, card, actor, data) values ('toll', c.arr, t, u, jsonb_build_object('to', o.owner, 'pseudo', o.pseudo, 'amount', floor(o.amt * ratio)));
      end if;
    end loop;
    toll := floor(toll * ratio);
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
  if _is_chance(t) then ch := _chance(u); end if;
  if ch ? 'extra' and ch->'extra' <> 'null'::jsonb then perform _refresh_mayors(array[(select arr from cards where id = (ch->'extra'->>'card')::int)::int]); end if;
  return json_build_object('die', a, 'path', path, 'landing', json_build_object(
      'card', t, 'toll', toll, 'payees', payees, 'chance', ch, 'bonus', bonus, 'salary', sal, 'perk', perk, 'free', (sq->>'free')::int, 'mine', (sq->>'mine')::int),
    'state', state());
end $$;
revoke all on function _land(uuid, int, int, int[]) from public, anon, authenticated;
update ledger set label = replace(label, 'Gauche Unie', 'Gauche') where label like '%Gauche Unie%';
