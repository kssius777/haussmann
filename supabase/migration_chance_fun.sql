-- =====================================================================
--  Plus de cartes Chance, fun et parisiennes (19/10/2026, validées par le propriétaire).
--  9 bonus : ticket de métro trouvé (+2 €), pigeon (+77 777 €), coloc (+30 000 €), caution (+45 000 €),
--            squatteurs partis (+25 000 €), meilleure baguette (×1,3 24 h), clip de rap (×1,5 24 h),
--            Fashion Week (tous les loyers ×1,2 24 h), chambre de bonne en héritage (un logement offert).
--  9 malus : punaises de lit (un logement bloqué 48 h), rats (×0,7 24 h), perceuse du dimanche (×0,8 24 h),
--            DPE classé G (un logement bloqué 48 h), contrôleur (−50 €), encadrement des loyers (×0,8 48 h),
--            syndic (−1 % de la valeur d'un immeuble), locataire parti sans payer (−20 000 €), manif (×0,8 24 h).
--  Mêmes mécanismes que les anciennes cartes ; toujours environ 65 % de bonus / 35 % de malus.
--  Les protections des partis ne changent pas. Rejouable sans risque (create or replace).
-- =====================================================================
create or replace function _chance(p uuid) returns jsonb language plpgsql as $$
#variable_conflict use_column
declare k text; pr profiles; val bigint; a bigint; h record; st text;
  keys text[] := array['heritage','impots','prime','fete','subv','loto','boom','booster','cle','tournage','pub',
                       'ticket','pigeon','coloc','caution','squatpartis','baguette','clip','fashion','bonne',
                       'fisc','fonciere','notaire','amende','cambriolage','ravalement','degat','greve','ascenseur','termites','squat',
                       'punaises','rats','perceuse','dpe','controleur','encadrement','syndic','impaye','manif'];
  ws float8[] := array[8,10,8,8,6,1,3,4,5,4,4,
                       5,2,4,4,2,4,3,2,4,
                       4,4,4,4,4,3,3,2,2,1,2,
                       2,2,2,1,3,1,2,1,2];
  -- ce qu'on lit dans « Mon argent » pour les nouvelles cartes qui donnent ou prennent de l'argent
  lbl jsonb := '{"ticket":"ticket de métro trouvé","pigeon":"un pigeon vous a choisi","coloc":"votre coloc paie sa part",
                 "caution":"caution remboursée","squatpartis":"les squatteurs sont partis","controleur":"contrôleur dans le métro",
                 "impaye":"locataire parti sans payer"}';
  extra jsonb;
begin
  k := _pick_weighted(keys, ws);
  select * into pr from profiles where id=p for update;
  val := coalesce((select sum(v) from arr_value where owner=p),0);
  case k
    when 'heritage' then a := 250000;  when 'impots' then a := 80000; when 'prime' then a := 120000;
    when 'fete' then a := 60000;       when 'subv' then a := 150000;  when 'loto' then a := 1000000;
    when 'boom' then a := least(2000000, floor(val*0.02));
    when 'notaire' then a := -40000;   when 'amende' then a := -15000;
    when 'fisc' then a := -greatest(20000, floor(pr.cash*0.05));
    when 'fonciere' then a := -floor(val*0.004);
    when 'ticket' then a := 2;         when 'pigeon' then a := 77777;    when 'coloc' then a := 30000;
    when 'caution' then a := 45000;    when 'squatpartis' then a := 25000;
    when 'controleur' then a := -50;   when 'impaye' then a := -20000;
    else a := 0;
  end case;
  -- chaque parti protège ses membres contre quelques malus (risques équivalents)
  if (pr.party = 'poing'   and k in ('greve','amende'))
  or (pr.party = 'tendue'  and k in ('notaire','ravalement'))
  or (pr.party = 'milieu'  and k in ('fonciere','degat'))
  or (pr.party = 'valeurs' and k in ('fisc','termites','ascenseur'))
  or (pr.party = 'rempart' and k in ('cambriolage','squat')) then
    return jsonb_build_object('t','chance','k',k,'out','Sans effet : vous êtes protégé par votre parti');
  end if;

  if a <> 0 then
    update profiles set cash = greatest(0, cash + a) where id=p;
    perform _log(p, 'chance', a, 'Carte Chance' || coalesce(' : ' || (lbl->>k), ''));
    return jsonb_build_object('t','chance','k',k,'amount',a);
  end if;

  if k = 'booster' then update profiles set welcome = welcome + 1 where id=p; return jsonb_build_object('t','chance','k',k,'out','+1 booster'); end if;
  if k in ('cle','bonne') then
    extra := _draw(p, 'C');
    return jsonb_build_object('t','chance','k',k,'extra',extra);
  end if;
  if k = 'greve' then insert into fx(owner,kind,m,until) values (p,'all',0.8,now()+interval '24 hours'); return jsonb_build_object('t','chance','k',k); end if;
  if k = 'fashion' then insert into fx(owner,kind,m,until) values (p,'all',1.2,now()+interval '24 hours'); return jsonb_build_object('t','chance','k',k); end if;

  -- cartes qui visent un de vos immeubles
  select l.card, l.k, c.arr, c.v, c.title into h from lots l join cards c on c.id=l.card where l.owner=p order by random() limit 1;
  if not found then return jsonb_build_object('t','chance','k',k,'out','Aucun bien concerné'); end if;
  select party into st from arr_state where arr=h.arr;
  case k
    when 'tournage'    then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,1.5,now()+interval '24 hours');
    when 'pub'         then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,1.3,now()+interval '24 hours');
    when 'ascenseur'   then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,0.7,now()+interval '24 hours');
    when 'termites'    then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,0.6,now()+interval '48 hours');
    when 'degat'       then insert into fx(owner,kind,card,k,m,until) values (p,'lot',h.card,h.k,0,now()+interval '24 hours');
    when 'squat'       then insert into fx(owner,kind,card,k,m,until) values (p,'lot',h.card,h.k,0,now()+interval '48 hours');
    when 'baguette'    then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,1.3,now()+interval '24 hours');
    when 'clip'        then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,1.5,now()+interval '24 hours');
    when 'rats'        then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,0.7,now()+interval '24 hours');
    when 'perceuse'    then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,0.8,now()+interval '24 hours');
    when 'encadrement' then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,0.8,now()+interval '48 hours');
    when 'manif'       then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,0.8,now()+interval '24 hours');
    when 'punaises'    then insert into fx(owner,kind,card,k,m,until) values (p,'lot',h.card,h.k,0,now()+interval '48 hours');
    when 'dpe'         then insert into fx(owner,kind,card,k,m,until) values (p,'lot',h.card,h.k,0,now()+interval '48 hours');
    when 'cambriolage' then
      a := -30000; update profiles set cash = greatest(0, cash + a) where id=p; perform _log(p, 'chance', a, 'Carte Chance : cambriolage', h.card);
      return jsonb_build_object('t','chance','k',k,'amount',a,'card',h.card);
    when 'ravalement' then
      a := -floor(h.v*0.01); update profiles set cash = greatest(0, cash + a) where id=p; perform _log(p, 'chance', a, 'Carte Chance : ravalement', h.card);
      return jsonb_build_object('t','chance','k',k,'amount',a,'card',h.card);
    when 'syndic' then
      a := -floor(h.v*0.01); update profiles set cash = greatest(0, cash + a) where id=p; perform _log(p, 'chance', a, 'Carte Chance : charges du syndic', h.card);
      return jsonb_build_object('t','chance','k',k,'amount',a,'card',h.card);
    else null;
  end case;
  return jsonb_build_object('t','chance','k',k,'card',h.card);
end $$;
revoke all on function _chance(uuid) from public, anon, authenticated;
