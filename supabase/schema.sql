-- =====================================================================
-- HAUSSMANN — schéma de la base et règles du jeu (Supabase / Postgres)
-- À coller une seule fois dans Supabase → SQL Editor → Run.
-- Toutes les actions de jeu passent par des fonctions SECURITY DEFINER :
-- le navigateur ne peut rien écrire directement (pas de triche possible).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Données statiques : une ligne par immeuble (chargée par /api/seed)
-- ---------------------------------------------------------------------
create table if not exists cards (
  id     int primary key,            -- arrIndex*100000 + index dans l'arrondissement
  arr    smallint not null,          -- 1..20
  r      char(1)  not null,          -- C U R L M
  lk     char(1)  not null,          -- l = logements, c = locaux, p = parts de monument
  lots   int      not null,          -- nombre de logements / locaux / parts
  et     smallint not null default 1,-- nombre d'étages (logements)
  v      bigint   not null,          -- valeur d'un lot (€)
  rent   int      not null,          -- loyer d'un lot par jour (€)
  pk     boolean  not null default false, -- proche d'un parc
  title  text
);
create index if not exists cards_r_lk on cards(r, lk);

-- ---------------------------------------------------------------------
-- Joueurs
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id         uuid primary key,       -- = auth.users.id
  pseudo     text not null,
  party      text,
  party_at   timestamptz,
  cash       bigint not null default 1000000,
  welcome    int    not null default 5,
  free_at    timestamptz,            -- dernier booster gratuit
  bought_day date,
  bought_n   int    not null default 0,
  rent_at    timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint cash_pos check (cash >= 0),
  constraint pseudo_len check (char_length(pseudo) between 2 and 20)
);
create unique index if not exists profiles_pseudo on profiles(lower(pseudo));

-- Un lot = un logement / local. La clé primaire (card,k) garantit
-- qu'un lot n'a JAMAIS deux propriétaires, même avec des milliers de joueurs.
create table if not exists lots (
  card    int  not null references cards(id),
  k       int  not null,
  owner   uuid not null references profiles(id) on delete cascade,
  mort    bigint,                    -- montant emprunté (hypothèque)
  mort_at timestamptz,
  at      timestamptz not null default now(),
  primary key (card, k)
);
alter table lots add column if not exists loan bigint;     -- crédit immobilier : reste à rembourser
create index if not exists lots_owner on lots(owner);

-- Parts de monuments
create table if not exists parts (
  card    int  not null references cards(id),
  owner   uuid not null references profiles(id) on delete cascade,
  n       int  not null check (n > 0),
  mort    bigint,
  mort_at timestamptz,
  primary key (card, owner)
);
alter table parts add column if not exists loan bigint;    -- crédit immobilier : reste à rembourser
create index if not exists parts_owner on parts(owner);

-- Valeur détenue par joueur et par arrondissement (sert à élire les maires)
create table if not exists arr_value (
  arr   smallint not null,
  owner uuid not null references profiles(id) on delete cascade,
  v     bigint not null default 0,
  primary key (arr, owner)
);
create index if not exists arr_value_rank on arr_value(arr, v desc);

create table if not exists arr_state (
  arr   smallint primary key,
  mayor uuid references profiles(id) on delete set null,
  party text,
  since timestamptz not null default now()
);

create table if not exists listings (
  id     bigserial primary key,
  seller uuid not null references profiles(id) on delete cascade,
  card   int  not null references cards(id),
  k      int,                        -- lot (null = parts)
  n      int  not null default 1,    -- nombre de parts
  price  bigint not null check (price > 0),
  at     timestamptz not null default now()
);
create unique index if not exists listings_lot on listings(card, k) where k is not null;

create table if not exists sales (
  id     bigserial primary key,
  card   int not null, k int, n int not null default 1,
  price  bigint not null,
  seller uuid, buyer uuid,
  at     timestamptz not null default now()
);

create table if not exists news (
  id    bigserial primary key,
  kind  text not null,               -- pull, mayor, sale, title, week, event
  arr   smallint,
  card  int,
  actor uuid,
  data  jsonb not null default '{}',
  at    timestamptz not null default now()
);
create index if not exists news_at on news(at desc);

-- Effets temporaires (cartes Chance)
create table if not exists fx (
  id    bigserial primary key,
  owner uuid not null references profiles(id) on delete cascade,
  kind  text not null,               -- all | bld | lot
  card  int, k int,
  m     real not null,
  until timestamptz not null
);
create index if not exists fx_owner on fx(owner, until);

-- Paiements en attente (taxe du maire, ventes) : encaissés par le destinataire
-- à sa prochaine synchro, pour ne jamais verrouiller le profil d'un autre joueur.
create table if not exists pay (
  id     bigserial primary key,
  owner  uuid not null references profiles(id) on delete cascade,
  amount bigint not null,
  why    text not null,
  at     timestamptz not null default now()
);
create index if not exists pay_owner on pay(owner);

create table if not exists day_event (
  d   date primary key,
  ev  int not null,
  arr smallint not null,
  m   real not null
);

-- Hôtel de Ville : le parti qui a le plus de maires gagne la semaine
create table if not exists city_week (
  week     date primary key,         -- lundi de la semaine (heure de Paris)
  party    text,
  mayors   int not null default 0,
  bonus    bigint not null default 0,-- € par jour et par membre
  members  int not null default 0
);

-- ---------------------------------------------------------------------
-- Lecture publique, aucune écriture directe
-- ---------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['cards','profiles','lots','parts','arr_value','arr_state','listings','sales','news','fx','day_event','city_week','pay'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists read_all on %I', t);
    execute format('create policy read_all on %I for select using (true)', t);
  end loop;
end $$;

-- Temps réel (Supabase)
do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    begin execute 'alter publication supabase_realtime add table lots, parts, listings, news, arr_state'; exception when others then null; end;
  end if;
end $$;

-- =====================================================================
-- Constantes et petites aides
-- =====================================================================
create or replace function cfg() returns jsonb language sql immutable as $$ select '{
  "start":1000000, "welcome":5, "pack":150000, "freeH":24,
  "fee":0.05, "mortRate":0.5, "mortDaily":0.005, "creditDown":0.1, "creditShare":0.7, "creditCap":5000000, "creditCapDays":20, "salary":20000,
  "floorBonus":1.25, "titleBonus":1.6, "gardien":1.2, "cityShare":0.01,
  "tax":0.08
}'::jsonb $$;

create or replace function paris_today() returns date language sql stable as $$ select (now() at time zone 'Europe/Paris')::date $$;
create or replace function paris_week() returns date language sql stable as $$ select date_trunc('week', now() at time zone 'Europe/Paris')::date $$;

create or replace function floor_of(lk char, lots int, et int, k int) returns int language sql immutable as $$
  select case when lk <> 'l' then 0 else least(et, 1 + (k*et)/lots) end $$;
-- premier / dernier k d'un étage
create or replace function floor_lo(lots int, et int, f int) returns int language sql immutable as $$
  select ceil((f-1)::numeric*lots/et)::int $$;
create or replace function floor_hi(lots int, et int, f int) returns int language sql immutable as $$
  select case when f >= et then lots-1 else ceil(f::numeric*lots/et)::int - 1 end $$;

create or replace function me() returns uuid language sql stable as $$ select auth.uid() $$;

create or replace function _need_me() returns uuid language plpgsql stable as $$
#variable_conflict use_column
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Connexion requise'; end if;
  if not exists (select 1 from profiles where id=u) then raise exception 'Profil introuvable'; end if;
  return u;
end $$;

-- Ajoute (ou retire) de la valeur détenue dans un arrondissement
create or replace function _add_value(p uuid, a smallint, dv bigint) returns void language plpgsql as $$
#variable_conflict use_column
begin
  insert into arr_value(arr, owner, v) values (a, p, dv)
    on conflict (arr, owner) do update set v = arr_value.v + excluded.v;
  delete from arr_value where arr=a and owner=p and v <= 0;
end $$;

-- Recalcule le maire des arrondissements touchés (toujours dans l'ordre, pour éviter les blocages)
create or replace function _refresh_mayors(arrs int[]) returns void language plpgsql as $$
#variable_conflict use_column
declare a int; top uuid; cur uuid; pt text; existed boolean;
begin
  for a in select distinct x from unnest(arrs) x where x is not null order by 1 loop
    select owner into top from arr_value where arr=a order by v desc, owner limit 1;
    select mayor, true into cur, existed from arr_state where arr=a for update;
    if existed is null then
      insert into arr_state(arr, mayor, party) values (a, top, (select party from profiles where id=top)) on conflict (arr) do nothing;
      if top is not null then insert into news(kind, arr, actor) values ('mayor', a, top); end if;
    elsif cur is distinct from top then
      select party into pt from profiles where id=top;
      update arr_state set mayor=top, party=pt, since=now() where arr=a;
      if top is not null then insert into news(kind, arr, actor, data) values ('mayor', a, top, jsonb_build_object('prev', cur)); end if;
    end if;
    existed := null;
  end loop;
end $$;

-- Événement du jour (tiré une fois par jour, le même pour tout le monde)
create or replace function _event() returns day_event language plpgsql as $$
#variable_conflict use_column
declare e day_event; ms real[] := array[1.3,1.25,1.4,1.15,1.2,1.3,1.35,0.8,0.85,0.8,0.9,1.2,1.5,0.75,1.3,1.25];
        i int;
begin
  select * into e from day_event where d = paris_today();
  if found then return e; end if;
  i := floor(random()*16)::int;
  insert into day_event(d, ev, arr, m) values (paris_today(), i, 1 + floor(random()*20)::int, ms[i+1])
    on conflict (d) do nothing;
  select * into e from day_event where d = paris_today();
  return e;
end $$;

-- Résultat de l'Hôtel de Ville pour la semaine en cours (calculé une fois)
create or replace function _week() returns city_week language plpgsql as $$
#variable_conflict use_column
declare w city_week; win text; nm int; tot numeric; mem int;
begin
  select * into w from city_week where week = paris_week();
  if found then return w; end if;
  select party, count(*) into win, nm from arr_state where party is not null group by party
    order by count(*) desc, party limit 1;
  -- égalité au sommet : personne ne gagne
  if win is not null and (select count(*) from (select party from arr_state where party is not null group by party having count(*) = nm) x) > 1 then
    win := null;
  end if;
  select coalesce(sum(c.rent),0) into tot from lots l join cards c on c.id=l.card where l.mort is null;
  select count(*) into mem from profiles where party = win;
  insert into city_week(week, party, mayors, bonus, members)
    values (paris_week(), win, coalesce(nm,0),
            case when win is null or mem = 0 then 0 else floor(tot * (cfg()->>'cityShare')::numeric / mem) end, coalesce(mem,0))
    on conflict (week) do nothing;
  select * into w from city_week where week = paris_week();
  if win is not null then insert into news(kind, data) values ('week', jsonb_build_object('party', win, 'mayors', nm, 'bonus', w.bonus)); end if;
  return w;
end $$;

-- Loyer brut par jour de p, ventilé par arrondissement (avant taxe du maire)
create or replace function _rates(p uuid) returns table(arr smallint, rate float8, mayor uuid, tax float8)
language plpgsql as $$
#variable_conflict use_column
declare ev day_event := _event(); myparty text;
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
  select allr.a::smallint, sum(allr.r)::float8,
         s.mayor,
         case when s.mayor is null or s.mayor = p then 0
              else (cfg()->>'tax')::float8 end
  from allr left join arr_state s on s.arr = allr.a
  group by allr.a, s.mayor, s.party;
end $$;

-- Historique de l'argent : chaque mouvement de trésorerie
create table if not exists ledger (
  id     bigserial primary key,
  owner  uuid not null references profiles(id) on delete cascade,
  at     timestamptz not null default now(),
  kind   text not null,          -- rent, tax, tax_in, salary, toll_paid, toll_in, buy, sale, chance, booster, rolls, mortgage, lift, repay, bonus, credit
  amount bigint not null,        -- positif = reçu, négatif = payé
  label  text,
  card   int
);
create index if not exists ledger_owner on ledger(owner, at desc);
alter table ledger enable row level security;
drop policy if exists ledger_own on ledger; create policy ledger_own on ledger for select using (owner = auth.uid());
create or replace function _log(p uuid, k text, amt bigint, lbl text default null, c int default null) returns void language plpgsql as $$
declare last ledger;
begin
  if amt = 0 then return; end if;
  -- les loyers arrivent en continu : on regroupe dans une même ligne pendant 1 h
  if k in ('rent','credit','tax') then
    select * into last from ledger where owner=p and kind=k order by at desc limit 1;
    if found and last.at > now() - interval '1 hour' then update ledger set amount = amount + amt, at = now() where id = last.id; return; end if;
  end if;
  insert into ledger(owner, kind, amount, label, card) values (p, k, amt, lbl, c);
end $$;

-- Verse les loyers dus depuis la dernière fois (appelé avant chaque action)
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

-- =====================================================================
-- HAUSSMANN · le pion et les dés
-- Comme au Monopoly : on lance un dé, le pion marche tout seul dans les rues
-- et s'arrête sur un immeuble. Libre : on peut l'acheter. À un autre joueur :
-- on lui paie son loyer. À soi : un bonus. Parfois : une case Chance.
-- =====================================================================
alter table cards add column if not exists cx int;   -- centre de l'immeuble, degrés × 100 000
alter table cards add column if not exists cy int;
create table if not exists edges (a int not null, b int not null, primary key (a, b));   -- immeubles voisins (dans les deux sens)
alter table edges enable row level security;
drop policy if exists read_all on edges;
create policy read_all on edges for select using (true);

alter table profiles add column if not exists pos int;                                 -- immeuble où se trouve le pion
alter table profiles add column if not exists rolls int not null default 10;           -- lancers de dés disponibles
alter table profiles add column if not exists rolls_at timestamptz not null default now();
alter table profiles add column if not exists tp int not null default 3;               -- téléportations du jour
alter table profiles add column if not exists tp_day date;
alter table profiles add column if not exists dice smallint[];                         -- dés lancés, en attente du déplacement
alter table profiles add column if not exists moves int[];                             -- (ancienne version, inutilisé)
alter table profiles add column if not exists heading float8;
alter table profiles add column if not exists aim boolean default false;  -- le joueur a choisi sa direction pour le prochain lancer                          -- direction de marche du pion (radians)
alter table profiles add column if not exists land int;                                -- immeuble où le pion s'est arrêté : achetable à la banque

create or replace function pawn_cfg() returns jsonb language sql immutable as $$ select '{
  "maxRolls":10, "rollEveryMin":30, "tpPerDay":3, "buyRadius":150, "tollCap":0.2, "spawn":400761, "chanceEvery":8, "stepMul":4, "dieMax":6, "rollsPrice":50000, "rollsPack":5, "salary":20000
}'::jsonb $$;

-- distance en mètres entre deux immeubles (null si coordonnées inconnues)
create or replace function _dist(a int, b int) returns float8 language sql stable as $$
  select sqrt(power((x.cx - y.cx) * 0.7324, 2) + power((x.cy - y.cy) * 1.10574, 2))
  from cards x, cards y where x.id = a and y.id = b $$;

-- case Chance du jour (la même pour tous, change chaque jour)
create or replace function _is_chance(c int) returns boolean language sql stable as $$
  select abs(hashtext(c::text || paris_today()::text)) % (pawn_cfg()->>'chanceEvery')::int = 0 $$;

-- recharge des dés et des téléportations
create or replace function _regen(p uuid) returns void language plpgsql as $$
#variable_conflict use_column
declare pr profiles; every interval := ((pawn_cfg()->>'rollEveryMin') || ' minutes')::interval; mx int := (pawn_cfg()->>'maxRolls')::int; gain int;
begin
  select * into pr from profiles where id=p for update;
  if pr.rolls >= mx then
    update profiles set rolls_at = now() where id=p and rolls_at < now() - interval '1 minute';
  else
    gain := floor(extract(epoch from (now() - pr.rolls_at)) / extract(epoch from every))::int;
    if gain > 0 then
      update profiles set rolls = least(mx, pr.rolls + gain),
        rolls_at = case when pr.rolls + gain >= mx then now() else pr.rolls_at + every * gain end where id=p;
    end if;
  end if;
  if pr.tp_day is distinct from paris_today() then
    update profiles set tp = (pawn_cfg()->>'tpPerDay')::int, tp_day = paris_today() where id=p;
  end if;
  if pr.pos is null then update profiles set pos = coalesce((select id from cards where id=(pawn_cfg()->>'spawn')::int), (select min(id) from cards)) where id=p; end if;
end $$;

-- parcours en largeur : distance (en cases) et prédécesseur de chaque immeuble autour du départ
create or replace function _reach(start int, n int) returns table(node int, d int, par int) language plpgsql as $$
#variable_conflict use_column
declare lvl int;
begin
  create temp table if not exists _bfs(node int primary key, d int, par int) on commit drop;
  truncate _bfs;
  insert into _bfs values (start, 0, null);
  for lvl in 1..n loop
    insert into _bfs(node, d, par)
      select distinct on (e.b) e.b, lvl, e.a from _bfs f join edges e on e.a = f.node where f.d = lvl - 1 order by e.b, e.a
      on conflict (node) do nothing;
  end loop;
  return query select f.node, f.d, f.par from _bfs f;
end $$;

-- ce qui attend le joueur sur un immeuble : logements libres, à lui, péage
create or replace function _square(u uuid, t int) returns jsonb language sql stable as $$
  select jsonb_build_object('card', t, 'chance', _is_chance(t),
    'free', c.lots - coalesce((select count(*) from lots where card = t), 0) - coalesce((select sum(n) from parts where card = t), 0),
    'mine', (select count(*) from lots where card = t and owner = u) + coalesce((select sum(n) from parts where card = t and owner = u), 0))
  from cards c where c.id = t $$;

-- Le pion marche tout seul. Il ne peut pas tourner en rond : on cherche tous les immeubles atteignables
-- en exactement n pas, on choisit l'un des plus éloignés (plutôt dans la direction du lancer précédent),
-- puis le pion suit le PLUS COURT chemin pour y aller.
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

-- Lancer le dé : le pion avance et s'arrête sur un immeuble
-- Lancer le dé, puis CHOISIR où aller : le dé décide de la distance, le joueur choisit parmi
-- (jusqu'à) 4 immeubles atteignables, un par direction. Puis go_to(immeuble) fait voler la montgolfière.
alter table profiles add column if not exists pend int[];          -- destinations proposées après le dé
alter table profiles add column if not exists pend_die int;        -- le résultat du dé en attente

-- atterrissage sur l'immeuble t (salaire, loyer de passage, bonus, Chance)
create or replace function _land(u uuid, t int, a int, path int[]) returns json
language plpgsql as $$
#variable_conflict use_column
declare c cards; sq jsonb; toll numeric := 0; cap numeric; ratio numeric := 1; payees jsonb := '[]'; ch jsonb := null; o record; bonus bigint := 0;
begin
  update profiles set pos = t, land = t, cash = cash + (pawn_cfg()->>'salary')::bigint where id = u;   -- petit salaire à chaque lancer
  perform _log(u, 'salary', (pawn_cfg()->>'salary')::bigint, 'Salaire du tour', t);
  select * into c from cards where id = t;
  -- loyer à payer : chaque propriétaire reçoit une journée de loyer de ses biens ici (plafonné à 20 % de votre trésorerie)
  for o in
    select owner, sum(rent) amt from (
      select l.owner, c.rent::numeric rent from lots l where l.card = t and l.owner <> u and l.mort is null
      union all select x.owner, c.rent::numeric * x.n from parts x where x.card = t and x.owner <> u and x.mort is null) z
    group by owner loop
    toll := toll + o.amt;
  end loop;
  if toll > 0 then
    cap := floor((select cash from profiles where id=u) * (pawn_cfg()->>'tollCap')::numeric);
    if toll > cap then ratio := case when toll = 0 then 0 else cap / toll end; end if;
    for o in
      select z.owner, p.pseudo, sum(rent) amt from (
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
      'card', t, 'toll', toll, 'payees', payees, 'chance', ch, 'bonus', bonus, 'salary', (pawn_cfg()->>'salary')::bigint, 'free', (sq->>'free')::int, 'mine', (sq->>'mine')::int),
    'state', state());
end $$;

-- jusqu'à 4 destinations à exactement n pas : la plus lointaine dans chaque direction (est, nord, ouest, sud)
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
      where r.d >= dmax - 1 and r.node <> all(seen) and r.node <> start
        and cos(atan2(c.cy * 1.10574 - sy, c.cx * 0.7324 - sx) - q * pi() / 2) > 0.5
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

create or replace function roll() returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles; a int; nxt int; opts jsonb;
begin
  perform _sync(u); perform _regen(u);
  select * into pr from profiles where id=u for update;
  if not exists (select 1 from edges limit 1) then raise exception 'Le plan des rues n''est pas encore chargé'; end if;
  -- un dé déjà lancé, pas encore joué : on repropose les mêmes destinations
  if pr.pend is not null and array_length(pr.pend, 1) > 0 then
    select coalesce(jsonb_agg(_square(u, x) || jsonb_build_object('dir', o - 1,
      'owners', (select coalesce(jsonb_agg(distinct p.pseudo), '[]') from (select owner from lots where card = x and owner <> u union select owner from parts where card = x and owner <> u) z join profiles p on p.id = z.owner))), '[]')
      into opts from unnest(pr.pend) with ordinality as w(x, o);
    return json_build_object('die', pr.pend_die, 'options', opts, 'state', state());
  end if;
  if pr.rolls <= 0 then
    nxt := ceil(extract(epoch from (pr.rolls_at + ((pawn_cfg()->>'rollEveryMin') || ' minutes')::interval - now())) / 60);
    raise exception 'Plus de lancers pour l''instant : le prochain arrive dans % min', greatest(1, nxt);
  end if;
  a := 1 + floor(random() * (pawn_cfg()->>'dieMax')::int)::int;
  update profiles set rolls = rolls - 1, dice = null, moves = null,
    rolls_at = case when pr.rolls >= (pawn_cfg()->>'maxRolls')::int then now() else rolls_at end where id=u;
  opts := _options(u, pr.pos, a * (pawn_cfg()->>'stepMul')::int);
  if jsonb_array_length(opts) = 0 then
    return json_build_object('die', a, 'path', array[pr.pos], 'landing', null, 'state', state());
  end if;
  update profiles set pend = (select array_agg((e->>'card')::int) from jsonb_array_elements(opts) e), pend_die = a where id = u;
  return json_build_object('die', a, 'options', opts, 'state', state());
end $$;

-- aller sur l'une des destinations proposées
create or replace function go_to(p_card int) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles; path int[] := '{}'; cur int; a int;
begin
  perform _sync(u);
  select * into pr from profiles where id=u for update;
  if pr.pend is null or not (p_card = any(pr.pend)) then raise exception 'Lancez d''abord le dé'; end if;
  a := pr.pend_die;
  create temp table if not exists _wk(node int primary key, d int, par int) on commit drop;
  truncate _wk; insert into _wk select * from _reach(pr.pos, a * (pawn_cfg()->>'stepMul')::int);
  cur := p_card;
  while cur is not null loop path := cur || path; select par into cur from _wk where node = cur; end loop;
  if path[1] is distinct from pr.pos then path := array[pr.pos, p_card]; end if;
  update profiles set pend = null, pend_die = null, heading = null where id = u;
  return _land(u, p_card, a, path);
end $$;

-- ancienne version (choisir la direction avant le dé) : on garde le nom, même comportement que roll()
create or replace function roll(p_dir float8) returns json
language plpgsql security definer set search_path = public as $$
begin return roll(); end $$;

revoke all on function _land(uuid, int, int, int[]), _options(uuid, int, int) from public, anon, authenticated;
grant execute on function roll(), roll(float8), go_to(int) to anon, authenticated;

drop function if exists move(int);

-- La téléportation est retirée du jeu (19/10/2026, migration_sans_teleport.sql) : seul le dé déplace la montgolfière
create or replace function teleport(p_card int) returns json
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'La téléportation a été retirée du jeu : seul le dé déplace la montgolfière.';
end $$;

-- Acheter des lancers de dé avec l'argent du jeu : 5 lancers, prix qui double à chaque achat dans la journée
alter table profiles add column if not exists rb_day date;
alter table profiles add column if not exists rb_n int not null default 0;
create or replace function rolls_price(p profiles) returns bigint language sql stable as $$
  select (pawn_cfg()->>'rollsPrice')::bigint * (2 ^ (case when p.rb_day = paris_today() then p.rb_n else 0 end))::bigint $$;
create or replace function buy_rolls() returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles; price bigint;
begin
  perform _sync(u); perform _regen(u);
  select * into pr from profiles where id=u for update;
  price := rolls_price(pr);
  if pr.cash < price then raise exception 'Trésorerie insuffisante : il faut %', price; end if;
  perform _log(u, 'rolls', -price, 'Achat de 5 lancers');
  update profiles set cash = cash - price, rolls = least(99, rolls + (pawn_cfg()->>'rollsPack')::int),
    rb_n = case when rb_day = paris_today() then rb_n + 1 else 1 end, rb_day = paris_today() where id=u;
  return state();
end $$;
revoke all on function rolls_price(profiles) from public, anon, authenticated;
grant execute on function buy_rolls() to anon, authenticated;

-- À la banque, on n'achète que l'immeuble sur lequel son pion s'est arrêté
create or replace function _near_or_fail(u uuid, card int) returns void language plpgsql as $$
declare l int;
begin
  select land into l from profiles where id=u;
  if l is distinct from card then
    raise exception 'Pour acheter cet immeuble à la banque, il faut tomber dessus avec le dé.';
  end if;
end $$;

revoke all on function roll(), teleport(int) from public;
revoke all on function teleport(int) from anon, authenticated;
grant execute on function roll() to anon, authenticated;
revoke all on function _dist(int,int), _is_chance(int), _regen(uuid), _reach(int,int), _near_or_fail(uuid,int), pawn_cfg(), _square(uuid,int), _walk(uuid,int,int) from public, anon, authenticated;

-- =====================================================================
-- API publique (appelée par le site)
-- =====================================================================

-- Créer son profil (après la connexion)
create or replace function join_game(p_pseudo text, p_party text default null) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Connexion requise'; end if;
  if p_party is not null and p_party not in ('poing','tendue','milieu','valeurs','rempart') then raise exception 'Parti inconnu'; end if;
  if char_length(trim(coalesce(p_pseudo,''))) < 2 then raise exception 'Le pseudo doit faire au moins 2 caractères'; end if;
  if exists (select 1 from profiles where lower(pseudo)=lower(trim(p_pseudo)) and id<>u) then raise exception 'Ce pseudo est déjà pris'; end if;
  insert into profiles(id, pseudo, party, party_at) values (u, trim(p_pseudo), p_party, case when p_party is null then null else now() end)
    on conflict (id) do update set pseudo = excluded.pseudo;
  return state();
end $$;

-- Changer de parti (une fois toutes les 48 h)
create or replace function set_party(p_party text) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles;
begin
  if p_party not in ('poing','tendue','milieu','valeurs','rempart') then raise exception 'Parti inconnu'; end if;
  perform _sync(u);
  select * into pr from profiles where id=u for update;
  -- premier choix libre ; ensuite un changement toutes les 48 h
  if pr.party is not null and pr.party_at is not null and pr.party_at > now() - interval '48 hours' then
    raise exception 'Vous pourrez changer de parti dans % h', ceil(extract(epoch from (pr.party_at + interval '48 hours' - now()))/3600);
  end if;
  update profiles set party=p_party, party_at=now() where id=u;
  update arr_state set party=p_party where mayor=u;
  return state();
end $$;

-- État du joueur (profil, loyers, boosters)
create or replace function state() returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := auth.uid(); pr profiles; gross float8 := 0; taxes float8 := 0; x record; w city_week; ev day_event; price bigint;
begin
  if u is null then return json_build_object('profile', null); end if;
  if not exists (select 1 from profiles where id=u) then return json_build_object('profile', null, 'uid', u); end if;
  perform _sync(u); perform _regen(u);
  select * into pr from profiles where id=u;
  for x in select * from _rates(u) loop gross := gross + x.rate; taxes := taxes + x.rate*x.tax; end loop;
  w := _week(); ev := _event();
  if w.party is not null and w.party = pr.party then gross := gross + w.bonus; end if;
  price := (cfg()->>'pack')::bigint * (2 ^ (case when pr.bought_day = paris_today() then pr.bought_n else 0 end))::bigint;
  return json_build_object(
    'uid', u, 'profile', row_to_json(pr),
    'rate', round(gross - taxes), 'gross', round(gross), 'taxes', round(taxes),
    'free_in', case when pr.free_at is null then 0 else greatest(0, extract(epoch from (pr.free_at + interval '24 hours' - now())))::int end,
    'price', price, 'week', row_to_json(w), 'event', row_to_json(ev),
    'value', coalesce((select sum(v) from arr_value where owner=u),0),
    'debt',  coalesce((select sum(mort) from lots where owner=u),0) + coalesce((select sum(mort) from parts where owner=u),0),
    'loans', coalesce((select sum(loan) from lots where owner=u),0) + coalesce((select sum(loan) from parts where owner=u),0),
    'credits', _credits(u), 'loan_cap', greatest(0, _loan_cap(u)),
    'loan_rate', coalesce((select sum(c.rent) from lots l join cards c on c.id=l.card where l.owner=u and l.loan > 0 and l.mort is null),0) * (cfg()->>'creditShare')::float8
               + coalesce((select sum(c.rent * x.n) from parts x join cards c on c.id=x.card where x.owner=u and x.loan > 0 and x.mort is null),0) * (cfg()->>'creditShare')::float8,
    'rolls_price', rolls_price(pr),
    'roll_in', case when pr.rolls >= (pawn_cfg()->>'maxRolls')::int then 0 else greatest(0, extract(epoch from (pr.rolls_at + ((pawn_cfg()->>'rollEveryMin') || ' minutes')::interval - now())))::int end,
    'now', now());
end $$;

-- ---------------------------------------------------------------------
-- Boosters
-- ---------------------------------------------------------------------
create or replace function _pick_weighted(opts text[], ws float8[]) returns text language plpgsql volatile as $$
#variable_conflict use_column
declare tot float8 := 0; r float8; i int;
begin
  for i in 1..array_length(ws,1) loop tot := tot + ws[i]; end loop;
  r := random() * tot;
  for i in 1..array_length(ws,1) loop r := r - ws[i]; if r <= 0 then return opts[i]; end if; end loop;
  return opts[array_length(opts,1)];
end $$;

-- Tente d'attribuer un bien d'une rareté donnée à p. Renvoie l'objet gagné ou null.
create or replace function _draw(p uuid, tier char) returns jsonb language plpgsql as $$
#variable_conflict use_column
declare t text; c cards; k int; f int; lo int; hi int; ks int[]; sold int; n int; att int; i int;
begin
  for att in 1..40 loop
    t := case tier
      when 'C' then _pick_weighted(array['key','floor'], array[88,12])
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

-- Cartes Chance : appliquées immédiatement (+18 cartes fun le 19/10/2026 : migration_chance_fun.sql)
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

-- Ouvrir un booster : p_kind = 'welcome' | 'free' | 'paid'
create or replace function open_booster(p_kind text) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); pr profiles; price bigint; items jsonb := '[]'; it jsonb; tier char; i int; ch jsonb;
begin
  perform _sync(u);
  select * into pr from profiles where id=u for update;
  if p_kind = 'welcome' then
    if pr.welcome <= 0 then raise exception 'Plus de booster de bienvenue'; end if;
    update profiles set welcome = welcome - 1 where id=u;
  elsif p_kind = 'free' then
    if pr.free_at is not null and pr.free_at > now() - interval '24 hours' then raise exception 'Le booster gratuit n''est pas encore prêt'; end if;
    update profiles set free_at = now() where id=u;
  elsif p_kind = 'paid' then
    if pr.bought_day is distinct from paris_today() then pr.bought_n := 0; end if;
    price := (cfg()->>'pack')::bigint * (2 ^ pr.bought_n)::bigint;
    if pr.cash < price then raise exception 'Trésorerie insuffisante'; end if;
    update profiles set cash = cash - price, bought_day = paris_today(), bought_n = pr.bought_n + 1 where id=u;
    perform _log(u, 'booster', -price, 'Achat d''un booster');
  else raise exception 'Type de booster inconnu'; end if;

  for i in 1..4 loop
    tier := _pick_weighted(array['C','U','R','L','M'], array[58,27,11,3.4,0.6]);
    it := _draw(u, tier);
    if it is null then it := _draw(u, 'C'); end if;
    if it is not null then items := items || it; end if;
  end loop;
  ch := _chance(u);
  if ch ? 'extra' and ch->'extra' <> 'null'::jsonb then items := items || (ch->'extra'); end if;
  items := items || (ch - 'extra');
  perform _refresh_mayors(array(select (c.arr)::int from jsonb_array_elements(items) x join cards c on c.id = (x->>'card')::int));
  -- annonces dans le fil d'actu pour les grosses prises
  insert into news(kind, arr, card, actor, data)
    select 'pull', c.arr, c.id, u, jsonb_build_object('tier', x->>'tier', 't', x->>'t', 'n', x->'n')
    from jsonb_array_elements(items) x join cards c on c.id = (x->>'card')::int
    where x->>'tier' in ('L','M');
  return json_build_object('items', items, 'state', state());
end $$;

-- ---------------------------------------------------------------------
-- Banque, marché, hypothèque
-- ---------------------------------------------------------------------
-- Acheter un logement libre d'un immeuble où l'on possède déjà un lot (ou 1 part de plus)
-- nombre de crédits en cours (un crédit = un immeuble acheté à crédit)
create or replace function _credits(u uuid) returns int language sql stable as $$
  select count(distinct card)::int from (select card from lots where owner=u and loan > 0 union select card from parts where owner=u and loan > 0) x $$;
-- capacité d'emprunt : 5 M€ + 20 jours de loyers de base, moins ce qui est déjà emprunté
create or replace function _loan_cap(u uuid) returns bigint language sql stable as $$
  select (cfg()->>'creditCap')::bigint
       + (cfg()->>'creditCapDays')::bigint * (coalesce((select sum(c.rent) from lots l join cards c on c.id=l.card where l.owner=u),0)
                                             + coalesce((select sum(c.rent * x.n) from parts x join cards c on c.id=x.card where x.owner=u),0))::bigint
       - coalesce((select sum(loan) from lots where owner=u),0)::bigint - coalesce((select sum(loan) from parts where owner=u),0)::bigint $$;
-- prix comptant ou apport ; renvoie le montant emprunté
revoke all on function _loan_cap(uuid), _credits(uuid) from public, anon, authenticated;
create or replace function _pay_or_borrow(u uuid, price bigint, credit boolean) returns bigint language plpgsql as $$
declare have bigint; down bigint;
begin
  select p.cash into have from profiles p where id=u for update;
  if not coalesce(credit, false) then
    if have < price then raise exception 'Trésorerie insuffisante'; end if;
    update profiles set cash = cash - price where id=u; perform _log(u, 'buy', -price, 'Achat comptant'); return 0;
  end if;
  down := ceil(price * (cfg()->>'creditDown')::numeric);
  if price - down > _loan_cap(u) then raise exception 'Capacité d''emprunt dépassée : la banque ne vous prête plus que % €', greatest(0, _loan_cap(u)); end if;
  if have < down then raise exception 'Apport insuffisant : il faut % € (10 %% du prix)', down; end if;
  update profiles set cash = cash - down where id=u; perform _log(u, 'buy', -down, 'Apport (achat à crédit)');
  return price - down;
end $$;

drop function if exists bank_buy(int,int);
create or replace function bank_buy(p_card int, p_k int default null, p_credit boolean default false) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
-- Achat direct d'un logement libre (p_k null = le premier libre) ou d'une part de monument, comptant ou à crédit
declare u uuid := _need_me(); c cards; sold int; vk int; loan bigint;
begin
  perform _sync(u);
  select * into c from cards where id=p_card;
  if not found then raise exception 'Bien inconnu'; end if;
  perform 1 from profiles where id=u for update;
  if not coalesce(p_credit, false) and (select cash from profiles where id=u) < c.v then raise exception 'Trésorerie insuffisante'; end if;
  perform _near_or_fail(u, c.id);
  if c.lk = 'p' then
    perform 1 from cards where id=c.id for update;
    select coalesce(sum(n),0) into sold from parts where card=c.id;
    if sold >= c.lots then raise exception 'Plus de parts disponibles'; end if;
    loan := _pay_or_borrow(u, c.v, p_credit);
    insert into parts(card,owner,n,loan) values (c.id,u,1,nullif(loan,0)) on conflict (card,owner) do update set n = parts.n + 1, loan = nullif(coalesce(parts.loan,0) + excluded.loan, 0);
  else
    if p_k is null then
      select g into vk from generate_series(0, c.lots-1) g where not exists (select 1 from lots where card=c.id and k=g) order by g limit 1;
      if vk is null then raise exception 'Plus aucun logement libre dans cet immeuble'; end if;
    else vk := p_k; end if;
    if vk < 0 or vk >= c.lots then raise exception 'Lot inconnu'; end if;
    if exists (select 1 from lots where card=c.id and k=vk) then raise exception 'Ce logement vient d''être pris'; end if;
    loan := _pay_or_borrow(u, c.v, p_credit);
    insert into lots(card,k,owner,loan) values (c.id,vk,u,nullif(loan,0)) on conflict do nothing;
    if not found then raise exception 'Ce logement vient d''être pris'; end if;
    if (select count(*) from lots where card=c.id and owner=u) = c.lots and c.lots > 1 then
      insert into news(kind, arr, card, actor) values ('title', c.arr, c.id, u);
    end if;
  end if;
  perform _add_value(u, c.arr, c.v);
  perform _refresh_mayors(array[c.arr::int]);
  return state();
end $$;

-- Acheter un immeuble entier d'un coup (s'il est entièrement libre)
drop function if exists buy_building(int);
create or replace function buy_building(p_card int, p_credit boolean default false) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); c cards; total bigint; loan bigint;
begin
  perform _sync(u);
  select * into c from cards where id=p_card;
  if not found or c.lk = 'p' then raise exception 'Bien inconnu'; end if;
  if exists (select 1 from lots where card=c.id) then raise exception 'Une partie de cet immeuble appartient déjà à quelqu''un'; end if;
  perform _near_or_fail(u, c.id);
  total := c.v * c.lots;
  loan := _pay_or_borrow(u, total, p_credit);
  begin
    -- le crédit est réparti sur les logements de l'immeuble
    insert into lots(card,k,owner,loan) select c.id, g, u, nullif(floor(loan / c.lots) + case when g = 0 then loan - floor(loan / c.lots) * c.lots else 0 end, 0)
      from generate_series(0,c.lots-1) g;
  exception when unique_violation then raise exception 'Un logement vient d''être pris, réessayez'; end;
  perform _add_value(u, c.arr, total);
  perform _refresh_mayors(array[c.arr::int]);
  if c.lots > 1 then insert into news(kind, arr, card, actor) values ('title', c.arr, c.id, u); end if;
  return state();
end $$;

create or replace function list_item(p_card int, p_k int, p_n int, p_price bigint) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); c cards; have int; listed int;
begin
  select * into c from cards where id=p_card;
  if p_price is null or p_price <= 0 then raise exception 'Indiquez un prix'; end if;
  if c.lk = 'p' then
    if exists (select 1 from parts where card=p_card and owner=u and loan > 0) then raise exception 'Remboursez d''abord le crédit de ce bien pour le vendre'; end if;
    select n into have from parts where card=p_card and owner=u and mort is null;
    select coalesce(sum(n),0) into listed from listings where card=p_card and seller=u;
    if coalesce(have,0) - listed < greatest(1,p_n) then raise exception 'Pas assez de parts disponibles'; end if;
    insert into listings(seller,card,k,n,price) values (u,p_card,null,greatest(1,p_n),p_price);
  else
    if not exists (select 1 from lots where card=p_card and k=p_k and owner=u and mort is null) then raise exception 'Ce logement n''est pas à vous ou est hypothéqué'; end if;
    if exists (select 1 from lots where card=p_card and k=p_k and loan > 0) then raise exception 'Remboursez d''abord le crédit de ce logement pour le vendre'; end if;
    insert into listings(seller,card,k,n,price) values (u,p_card,p_k,1,p_price);
  end if;
  return state();
end $$;

create or replace function unlist(p_id bigint) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me();
begin
  delete from listings where id=p_id and seller=u;
  return state();
end $$;

drop function if exists buy_listing(bigint);
create or replace function buy_listing(p_id bigint, p_credit boolean default false) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); l listings; c cards; fee numeric; have int; v_loan bigint := 0;
begin
  select * into l from listings where id=p_id for update;
  if not found then raise exception 'Annonce déjà vendue ou retirée'; end if;
  if l.seller = u then raise exception 'C''est votre annonce'; end if;
  perform _sync(u);
  select * into c from cards where id=l.card;
  if coalesce(p_credit, false) then
    v_loan := _pay_or_borrow(u, l.price, true);          -- apport 10 %, vérifie la capacité d'emprunt
  else
    if (select cash from profiles where id=u) < l.price then raise exception 'Trésorerie insuffisante'; end if;
    update profiles set cash = cash - l.price where id=u; perform _log(u, 'buy', -l.price, 'Achat au Marché', l.card);
  end if;
  if l.k is not null then
    update lots set owner=u, at=now(), loan=nullif(v_loan,0) where card=l.card and k=l.k and owner=l.seller and mort is null;
    if not found then raise exception 'Ce bien n''est plus disponible'; end if;
  else
    select n into have from parts where card=l.card and owner=l.seller and mort is null;
    if coalesce(have,0) < l.n then raise exception 'Ces parts ne sont plus disponibles'; end if;
    if have = l.n then delete from parts where card=l.card and owner=l.seller; else update parts set n=n-l.n where card=l.card and owner=l.seller; end if;
    insert into parts(card,owner,n,loan) values (l.card,u,l.n,nullif(v_loan,0))
      on conflict (card,owner) do update set n = parts.n + excluded.n, loan = nullif(coalesce(parts.loan,0) + coalesce(excluded.loan,0), 0);
  end if;
  fee := (cfg()->>'fee')::numeric;
  insert into pay(owner, amount, why) values (l.seller, floor(l.price*(1-fee)), 'vente');
  perform _add_value(l.seller, c.arr, -c.v*l.n);
  perform _add_value(u, c.arr, c.v*l.n);
  perform _refresh_mayors(array[c.arr::int]);
  delete from listings where id=p_id;
  insert into sales(card,k,n,price,seller,buyer) values (l.card,l.k,l.n,l.price,l.seller,u);
  if l.price >= 1000000 then insert into news(kind, arr, card, actor, data) values ('sale', c.arr, c.id, u, jsonb_build_object('price', l.price, 'seller', l.seller)); end if;
  return state();
end $$;

-- Hypothèque : p_k = null pour des parts de monument
create or replace function mortgage(p_card int, p_k int) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); c cards; a bigint; n int;
begin
  perform _sync(u);
  select * into c from cards where id=p_card;
  if p_k is null then
    if exists (select 1 from parts where card=p_card and owner=u and loan > 0) then raise exception 'Ce bien est déjà à crédit : impossible de l''hypothéquer'; end if;
    select x.n into n from parts x where card=p_card and owner=u and mort is null;
    if n is null then raise exception 'Rien à hypothéquer'; end if;
    delete from listings where card=p_card and seller=u;
    a := floor(c.v*n*(cfg()->>'mortRate')::numeric);
    update parts set mort=a, mort_at=now() where card=p_card and owner=u;
  else
    a := floor(c.v*(cfg()->>'mortRate')::numeric);
    if exists (select 1 from lots where card=p_card and k=p_k and loan > 0) then raise exception 'Ce logement est déjà à crédit : impossible de l''hypothéquer'; end if;
    update lots set mort=a, mort_at=now() where card=p_card and k=p_k and owner=u and mort is null;
    if not found then raise exception 'Rien à hypothéquer'; end if;
    delete from listings where card=p_card and k=p_k;
  end if;
  update profiles set cash = cash + a where id=u; perform _log(u, 'mortgage', a, 'Hypothèque', p_card);
  return state();
end $$;

-- Rembourser en avance le crédit d'un bien (tout l'immeuble d'un coup)
create or replace function repay(p_card int) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); due bigint;
begin
  perform _sync(u);
  select coalesce((select sum(loan) from lots where card=p_card and owner=u), 0) + coalesce((select sum(loan) from parts where card=p_card and owner=u), 0) into due;
  if due <= 0 then raise exception 'Pas de crédit sur ce bien'; end if;
  perform 1 from profiles where id=u for update;
  if (select cash from profiles where id=u) < due then raise exception 'Trésorerie insuffisante : il faut %', due; end if;
  update profiles set cash = cash - due where id=u; perform _log(u, 'repay', -due, 'Crédit remboursé en avance', p_card);
  update lots set loan = null where card=p_card and owner=u;
  update parts set loan = null where card=p_card and owner=u;
  return state();
end $$;

create or replace function lift(p_card int, p_k int) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); m bigint; mt timestamptz; cost bigint;
begin
  perform _sync(u);
  if p_k is null then select mort, mort_at into m, mt from parts where card=p_card and owner=u;
  else select mort, mort_at into m, mt from lots where card=p_card and k=p_k and owner=u; end if;
  if m is null then raise exception 'Pas d''hypothèque ici'; end if;
  cost := floor(m * (1 + (cfg()->>'mortDaily')::numeric * extract(epoch from (now()-mt))/86400));
  perform 1 from profiles where id=u for update;
  if (select cash from profiles where id=u) < cost then raise exception 'Trésorerie insuffisante'; end if;
  update profiles set cash = cash - cost where id=u; perform _log(u, 'lift', -cost, 'Hypothèque remboursée', p_card);
  if p_k is null then update parts set mort=null, mort_at=null where card=p_card and owner=u;
  else update lots set mort=null, mort_at=null where card=p_card and k=p_k and owner=u; end if;
  return state();
end $$;

-- ---------------------------------------------------------------------
-- Lectures groupées (une seule réponse JSON, pas de pagination)
-- ---------------------------------------------------------------------
-- Pour colorer la carte : par immeuble, la liste des propriétaires
create or replace function map_state() returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'lots',  coalesce((select json_agg(json_build_array(card, owners, n)) from
               (select card, array_agg(distinct owner) owners, count(*) n from lots group by card) x), '[]'),
    'parts', coalesce((select json_agg(json_build_array(card, owners, n)) from
               (select card, array_agg(owner) owners, sum(n) n from parts group by card) y), '[]'),
    'sale',  coalesce((select json_agg(distinct card) from listings), '[]'),
    'arr',   coalesce((select json_agg(json_build_array(s.arr, s.mayor, s.party, p.pseudo)) from arr_state s left join profiles p on p.id=s.mayor), '[]'))
$$;

-- Tout ce que je possède
create or replace function my_holdings() returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'lots',  coalesce((select json_agg(json_build_array(card, k, mort, mort_at, loan)) from lots where owner = auth.uid()), '[]'),
    'parts', coalesce((select json_agg(json_build_array(card, n, mort, mort_at, loan)) from parts where owner = auth.uid()), '[]'),
    'fx',    coalesce((select json_agg(row_to_json(f)) from fx f where owner = auth.uid() and until > now()), '[]'))
$$;

-- Détail d'un immeuble
create or replace function building(p_card int) returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'lots',  coalesce((select json_agg(json_build_array(l.k, l.owner, p.pseudo, l.mort is not null)) from lots l join profiles p on p.id=l.owner where l.card=p_card), '[]'),
    'parts', coalesce((select json_agg(json_build_array(x.owner, p.pseudo, x.n, x.mort is not null) order by x.n desc) from parts x join profiles p on p.id=x.owner where x.card=p_card), '[]'),
    'listings', coalesce((select json_agg(json_build_object('id',l.id,'k',l.k,'n',l.n,'price',l.price,'seller',l.seller,'pseudo',p.pseudo)) from listings l join profiles p on p.id=l.seller where l.card=p_card), '[]'),
    'sales', coalesce((select json_agg(s) from (select k, n, price, at from sales where card=p_card order by at desc limit 10) s), '[]'))
$$;

-- Marché
create or replace function market() returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'listings', coalesce((select json_agg(x) from (select l.id, l.card, l.k, l.n, l.price, l.seller, p.pseudo, l.at
                  from listings l join profiles p on p.id=l.seller order by l.at desc limit 300) x), '[]'),
    'sales',    coalesce((select json_agg(x) from (select s.card, s.k, s.n, s.price, s.at, b.pseudo buyer
                  from sales s left join profiles b on b.id=s.buyer order by s.at desc limit 60) x), '[]'))
$$;

-- Fil d'actu
create or replace function feed() returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x), '[]') from (
    select n.id, n.kind, n.arr, n.card, n.data, n.at, p.pseudo, p.party
    from news n left join profiles p on p.id=n.actor order by n.at desc limit 60) x
$$;

-- Historique de mon argent (100 derniers mouvements)
create or replace function my_ledger() returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x), '[]') from (select kind, amount, label, card, at from ledger where owner = auth.uid() order by at desc limit 100) x
$$;

-- Classement
create or replace function leaderboard() returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x), '[]') from (
    select p.id, p.pseudo, p.party,
           p.cash + coalesce((select sum(v) from arr_value a where a.owner=p.id),0)
                  - coalesce((select sum(mort) from lots l where l.owner=p.id),0)
                  - coalesce((select sum(mort) from parts t where t.owner=p.id),0)
                  - coalesce((select sum(loan) from lots l where l.owner=p.id),0)
                  - coalesce((select sum(loan) from parts t where t.owner=p.id),0) as worth,
           (select count(*) from arr_state s where s.mayor=p.id) as mayorships
    from profiles p order by worth desc limit 50) x
$$;

-- Un arrondissement
create or replace function arr_info(p_arr int) returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'state', (select row_to_json(x) from (select s.*, p.pseudo from arr_state s left join profiles p on p.id=s.mayor where s.arr=p_arr) x),
    'top',   coalesce((select json_agg(x) from (select a.owner, p.pseudo, p.party, a.v from arr_value a join profiles p on p.id=a.owner where a.arr=p_arr order by a.v desc limit 5) x), '[]'),
    'mine',  coalesce((select v from arr_value where arr=p_arr and owner=auth.uid()), 0))
$$;

-- Droits d'exécution
-- Les fonctions internes (_draw, _sync, _add_value…) ne doivent JAMAIS être appelables depuis le site.
-- Supabase donne par défaut le droit d'exécution à anon/authenticated : on le retire partout, puis on le rend aux seules fonctions publiques.
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
do $$ declare f text; begin
  foreach f in array array['join_game(text,text)','set_party(text)','state()','open_booster(text)','bank_buy(int,int,boolean)','buy_building(int,boolean)','repay(int)','roll()','buy_rolls()',
    'list_item(int,int,int,bigint)','unlist(bigint)','buy_listing(bigint,boolean)','mortgage(int,int)','lift(int,int)',
    'map_state()','my_holdings()','building(int)','market()','feed()','leaderboard()','arr_info(int)','my_ledger()'] loop
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

-- =====================================================================
--  Admin + liens cadeaux (giveaway) : le premier qui ouvre le lien gagne
--  Rejouable sans risque.
-- =====================================================================
create table if not exists admins (id uuid primary key);
alter table admins enable row level security;            -- personne ne lit cette table directement

create table if not exists gifts (
  code       text primary key,
  card       int references cards(id),
  n          int not null default 1,          -- nombre de logements (ou de parts) offerts
  boosters   int not null default 0,          -- boosters offerts
  created_by uuid,
  created_at timestamptz not null default now(),
  claimed_by uuid,
  claimed_at timestamptz
);
alter table gifts enable row level security;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where id = auth.uid()) $$;

create or replace function _need_admin() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from admins where id = auth.uid()) then raise exception 'Réservé à l''administrateur'; end if;
  return auth.uid();
end $$;

-- logements (ou parts) encore libres dans un immeuble
create or replace function _free_units(p_card int) returns int
language sql stable as $$
  select case when c.lk = 'p' then c.lots - coalesce((select sum(n) from parts where card = c.id), 0)::int
              else c.lots - (select count(*) from lots where card = c.id)::int end
  from cards c where c.id = p_card $$;

-- créer un lien cadeau : une carte (n logements) et/ou des boosters
create or replace function admin_gift_create(p_card int default null, p_n int default 1, p_boosters int default 0) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_admin(); code text;
begin
  if p_card is null and coalesce(p_boosters, 0) <= 0 then raise exception 'Choisissez une carte ou des boosters'; end if;
  if p_card is not null then
    if not exists (select 1 from cards where id = p_card) then raise exception 'Carte inconnue'; end if;
    if coalesce(p_n, 1) < 1 then raise exception 'Au moins 1 logement'; end if;
    if _free_units(p_card) < p_n then raise exception 'Pas assez de logements libres dans cet immeuble (% libres)', _free_units(p_card); end if;
  end if;
  if coalesce(p_boosters, 0) < 0 or coalesce(p_boosters, 0) > 50 then raise exception 'Entre 0 et 50 boosters'; end if;
  code := substr(md5(random()::text || clock_timestamp()::text), 1, 10);
  insert into gifts(code, card, n, boosters, created_by) values (code, p_card, case when p_card is null then 0 else coalesce(p_n, 1) end, coalesce(p_boosters, 0), u);
  return json_build_object('code', code);
end $$;

create or replace function admin_gifts() returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_admin();
begin
  return coalesce((select json_agg(x order by x.created_at desc) from (
    select g.code, g.card, g.n, g.boosters, g.created_at, g.claimed_at, p.pseudo as winner
    from gifts g left join profiles p on p.id = g.claimed_by order by g.created_at desc limit 100) x), '[]');
end $$;

create or replace function admin_gift_cancel(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_admin();
begin
  delete from gifts where code = p_code and claimed_by is null;
  return admin_gifts();
end $$;

-- ce que contient un lien (visible avant de se connecter)
create or replace function gift_info(p_code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('card', g.card, 'n', g.n, 'boosters', g.boosters, 'claimed', g.claimed_by is not null,
    'winner', (select pseudo from profiles where id = g.claimed_by))
  from gifts g where g.code = p_code $$;

-- récupérer le cadeau : le premier qui arrive l'emporte
create or replace function claim_gift(p_code text) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); g gifts; c cards; got int := 0; vk int; i int;
begin
  if not exists (select 1 from profiles where id = u) then raise exception 'Créez d''abord votre partie'; end if;
  select * into g from gifts where code = p_code for update;
  if not found then raise exception 'Ce lien cadeau n''existe pas (ou a été annulé)'; end if;
  if g.claimed_by = u then raise exception 'Vous avez déjà récupéré ce cadeau'; end if;
  if g.claimed_by is not null then raise exception 'Trop tard : ce cadeau a déjà été récupéré par %', coalesce((select pseudo from profiles where id = g.claimed_by), 'un autre joueur'); end if;
  if g.created_by = u then raise exception 'C''est vous qui avez créé ce cadeau : partagez le lien !'; end if;
  perform _sync(u);
  if g.card is not null then
    select * into c from cards where id = g.card for update;
    if c.lk = 'p' then
      got := least(g.n, _free_units(c.id));
      if got > 0 then insert into parts(card, owner, n) values (c.id, u, got) on conflict (card, owner) do update set n = parts.n + excluded.n; end if;
    else
      for i in 1..g.n loop
        select s into vk from generate_series(0, c.lots - 1) s where not exists (select 1 from lots where card = c.id and k = s) order by s limit 1;
        exit when vk is null;
        insert into lots(card, k, owner) values (c.id, vk, u); got := got + 1; vk := null;
      end loop;
    end if;
    if got = 0 and g.boosters = 0 then raise exception 'Trop tard : cet immeuble est complet'; end if;
    if got > 0 then perform _add_value(u, c.arr, c.v * got); perform _refresh_mayors(array[c.arr::int]); end if;
  end if;
  if g.boosters > 0 then update profiles set welcome = welcome + g.boosters where id = u; end if;
  update gifts set claimed_by = u, claimed_at = now() where code = p_code;
  return json_build_object('card', g.card, 'got', got, 'boosters', g.boosters, 'state', state());
end $$;

revoke all on function _need_admin(), _free_units(int) from public, anon, authenticated;
revoke all on function admin_gift_create(int, int, int), admin_gifts(), admin_gift_cancel(text), claim_gift(text) from public, anon;
grant execute on function is_admin() to anon, authenticated;
grant execute on function gift_info(text) to anon, authenticated;
grant execute on function admin_gift_create(int, int, int), admin_gifts(), admin_gift_cancel(text), claim_gift(text) to authenticated;

-- =====================================================================
--  À coller UNE SEULE FOIS dans Supabase → SQL Editor → Run.
--  Ensuite, chaque déploiement Vercel applique tout seul les nouvelles migrations.
-- =====================================================================
create table if not exists _migrations (name text primary key, at timestamptz not null default now());
alter table _migrations enable row level security;

-- les migrations déjà passées à la main
insert into _migrations(name) values
  ('migration_pion.sql'), ('migration_pion2.sql'), ('migration_pion3.sql'), ('migration_pion4.sql'),
  ('migration_eco.sql'), ('migration_credit.sql'), ('migration_ledger.sql'),
  ('migration_absence.sql'), ('migration_direction.sql'), ('migration_choix.sql')
on conflict do nothing;

-- appliquer une migration (seulement avec la clé service_role, qui n'existe que dans Vercel)
create or replace function _run_migration(p_name text, p_sql text) returns json
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from _migrations where name = p_name) then return json_build_object('skipped', p_name); end if;
  execute p_sql;
  insert into _migrations(name) values (p_name);
  notify pgrst, 'reload schema';
  return json_build_object('applied', p_name);
end $$;
create or replace function _applied_migrations() returns json
language sql stable security definer set search_path = public as $$ select coalesce(json_agg(name), '[]') from _migrations $$;

revoke all on function _run_migration(text, text), _applied_migrations() from public, anon, authenticated;
grant execute on function _run_migration(text, text), _applied_migrations() to service_role;
notify pgrst, 'reload schema';

-- Vérifie que les migrations automatiques marchent (sans effet sur le jeu)
create or replace function migrations_ok() returns boolean language sql stable as $$ select true $$;
grant execute on function migrations_ok() to anon, authenticated;

-- Acheter au Marché à crédit (apport 10 %, la banque prête le reste, remboursé par 70 % du loyer, comme à la banque)
drop function if exists buy_listing(bigint);
create or replace function buy_listing(p_id bigint, p_credit boolean default false) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); l listings; c cards; fee numeric; have int; v_loan bigint := 0;
begin
  select * into l from listings where id=p_id for update;
  if not found then raise exception 'Annonce déjà vendue ou retirée'; end if;
  if l.seller = u then raise exception 'C''est votre annonce'; end if;
  perform _sync(u);
  select * into c from cards where id=l.card;
  if coalesce(p_credit, false) then
    v_loan := _pay_or_borrow(u, l.price, true);          -- apport 10 %, vérifie la capacité d'emprunt
  else
    if (select cash from profiles where id=u) < l.price then raise exception 'Trésorerie insuffisante'; end if;
    update profiles set cash = cash - l.price where id=u; perform _log(u, 'buy', -l.price, 'Achat au Marché', l.card);
  end if;
  if l.k is not null then
    update lots set owner=u, at=now(), loan=nullif(v_loan,0) where card=l.card and k=l.k and owner=l.seller and mort is null;
    if not found then raise exception 'Ce bien n''est plus disponible'; end if;
  else
    select n into have from parts where card=l.card and owner=l.seller and mort is null;
    if coalesce(have,0) < l.n then raise exception 'Ces parts ne sont plus disponibles'; end if;
    if have = l.n then delete from parts where card=l.card and owner=l.seller; else update parts set n=n-l.n where card=l.card and owner=l.seller; end if;
    insert into parts(card,owner,n,loan) values (l.card,u,l.n,nullif(v_loan,0))
      on conflict (card,owner) do update set n = parts.n + excluded.n, loan = nullif(coalesce(parts.loan,0) + coalesce(excluded.loan,0), 0);
  end if;
  fee := (cfg()->>'fee')::numeric;
  insert into pay(owner, amount, why) values (l.seller, floor(l.price*(1-fee)), 'vente');
  perform _add_value(l.seller, c.arr, -c.v*l.n);
  perform _add_value(u, c.arr, c.v*l.n);
  perform _refresh_mayors(array[c.arr::int]);
  delete from listings where id=p_id;
  insert into sales(card,k,n,price,seller,buyer) values (l.card,l.k,l.n,l.price,l.seller,u);
  if l.price >= 1000000 then insert into news(kind, arr, card, actor, data) values ('sale', c.arr, c.id, u, jsonb_build_object('price', l.price, 'seller', l.seller)); end if;
  return state();
end $$;
grant execute on function buy_listing(bigint, boolean) to anon, authenticated;

-- =====================================================================
--  Offres de rachat entre joueurs : « Faire une offre » sur le logement d'un autre joueur.
--  Prix ≥ 80 % de la valeur ; 24 h pour répondre ; une contre-proposition possible ;
--  l'argent de l'acheteur est bloqué pendant l'offre ; 3 offres en cours max ;
--  après un refus, pas de nouvelle offre sur ce logement avant 24 h ; option « ne pas recevoir d'offres ».
-- =====================================================================
alter table profiles add column if not exists no_offers boolean not null default false;
create table if not exists offers (
  id         bigserial primary key,
  card       int not null references cards(id),
  k          int not null,
  buyer      uuid not null references profiles(id) on delete cascade,
  seller     uuid not null references profiles(id) on delete cascade,
  price      bigint not null,
  counter    bigint,
  credit     boolean not null default false,
  held       bigint not null default 0,          -- argent bloqué chez l'acheteur
  status     text not null default 'open',       -- open, countered, accepted, refused, expired, cancelled
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  done_at    timestamptz
);
create index if not exists offers_buyer on offers(buyer, status);
create index if not exists offers_seller on offers(seller, status);
alter table offers enable row level security;

-- rendre l'argent bloqué et clore l'offre
create or replace function _offer_close(o offers, st text) returns void language plpgsql as $$
begin
  if o.held > 0 then
    update profiles set cash = cash + o.held where id = o.buyer;
    perform _log(o.buyer, 'offer', o.held, case st when 'refused' then 'Offre refusée : argent rendu' when 'expired' then 'Offre expirée : argent rendu' else 'Offre annulée : argent rendu' end, o.card);
  end if;
  update offers set status = st, held = 0, done_at = now() where id = o.id;
end $$;

create or replace function _offers_expire() returns void language plpgsql as $$
declare o offers;
begin
  for o in select * from offers where status in ('open','countered') and expires_at < now() for update skip locked loop
    perform _offer_close(o, 'expired');
  end loop;
end $$;

-- ce que l'acheteur doit bloquer pour un prix donné (tout, ou 10 % s'il achète à crédit)
create or replace function _offer_hold(p bigint, cr boolean) returns bigint language sql immutable as $$
  select case when cr then ceil(p * 0.1)::bigint else p end $$;

create or replace function make_offer(p_card int, p_k int, p_price bigint, p_credit boolean default false) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); c cards; l lots; h bigint; s profiles;
begin
  perform _sync(u); perform _offers_expire();
  select * into c from cards where id = p_card;
  if not found or c.lk = 'p' then raise exception 'On ne peut faire une offre que sur un logement ou un local'; end if;
  select * into l from lots where card = p_card and k = p_k;
  if not found then raise exception 'Ce logement est libre : achetez-le à la banque en tombant dessus avec le dé'; end if;
  if l.owner = u then raise exception 'Ce logement est déjà à vous'; end if;
  if coalesce(l.loan, 0) > 0 then raise exception 'Ce logement est acheté à crédit : il ne peut pas être vendu pour l''instant'; end if;
  if l.mort is not null then raise exception 'Ce logement est hypothéqué : il ne peut pas être vendu pour l''instant'; end if;
  select * into s from profiles where id = l.owner;
  if s.no_offers then raise exception '% ne reçoit pas d''offres', s.pseudo; end if;
  if p_price < ceil(c.v * 0.8) then raise exception 'Offre trop basse : au moins % € (80 %% de la valeur)', ceil(c.v * 0.8)::bigint; end if;
  if exists (select 1 from offers where buyer = u and card = p_card and k = p_k and status in ('open','countered')) then raise exception 'Vous avez déjà une offre en cours sur ce logement'; end if;
  if exists (select 1 from offers where buyer = u and card = p_card and k = p_k and status = 'refused' and done_at > now() - interval '24 hours') then
    raise exception 'Votre offre a été refusée : vous pourrez en refaire une dans 24 h'; end if;
  if (select count(*) from offers where buyer = u and status in ('open','countered')) >= 3 then raise exception 'Vous avez déjà 3 offres en cours : attendez une réponse'; end if;
  if coalesce(p_credit, false) and p_price - _offer_hold(p_price, true) > _loan_cap(u) then
    raise exception 'Capacité d''emprunt dépassée : la banque ne vous prête plus que % €', greatest(0, _loan_cap(u)); end if;
  h := _offer_hold(p_price, coalesce(p_credit, false));
  perform 1 from profiles where id = u for update;
  if (select cash from profiles where id = u) < h then raise exception 'Trésorerie insuffisante : il faut % € de côté pour faire cette offre', h; end if;
  update profiles set cash = cash - h where id = u;
  perform _log(u, 'offer', -h, 'Offre d''achat envoyée (argent bloqué)', p_card);
  insert into offers(card, k, buyer, seller, price, credit, held) values (p_card, p_k, u, l.owner, p_price, coalesce(p_credit, false), h);
  return my_offers();
end $$;

-- la vente elle-même (au prix final) ; renvoie null si tout va bien, sinon la raison de l'échec
create or replace function _offer_exec(o offers, final bigint) returns text language plpgsql as $$
declare c cards; l lots; need bigint; v_loan bigint := 0; fee numeric; x offers;
begin
  select * into c from cards where id = o.card;
  select * into l from lots where card = o.card and k = o.k for update;
  if not found or l.owner <> o.seller or coalesce(l.loan, 0) > 0 or l.mort is not null then
    perform _offer_close(o, 'cancelled'); return 'Ce logement n''est plus disponible : l''offre est annulée'; end if;
  need := _offer_hold(final, o.credit);
  if o.credit then v_loan := final - need; end if;
  perform 1 from profiles where id = o.buyer for update;
  if v_loan > 0 and v_loan > _loan_cap(o.buyer) then perform _offer_close(o, 'cancelled'); return 'La banque ne prête plus assez à l''acheteur : l''offre est annulée'; end if;
  if need > o.held and (select cash from profiles where id = o.buyer) < need - o.held then perform _offer_close(o, 'cancelled'); return 'L''acheteur n''a plus assez d''argent : l''offre est annulée'; end if;
  -- l'argent bloqué devient le paiement (on complète ou on rend la différence)
  if need <> o.held then
    update profiles set cash = cash - (need - o.held) where id = o.buyer;
    perform _log(o.buyer, 'buy', -(need - o.held), case when need > o.held then 'Achat entre joueurs : complément' else 'Achat entre joueurs : trop-bloqué rendu' end, o.card);
  end if;
  update lots set owner = o.buyer, at = now(), loan = nullif(v_loan, 0) where card = o.card and k = o.k;
  delete from listings where card = o.card and k = o.k;
  fee := (cfg()->>'fee')::numeric;
  insert into pay(owner, amount, why) values (o.seller, floor(final * (1 - fee)), 'vente');
  perform _add_value(o.seller, c.arr, -c.v);
  perform _add_value(o.buyer, c.arr, c.v);
  perform _refresh_mayors(array[c.arr::int]);
  insert into sales(card, k, n, price, seller, buyer) values (o.card, o.k, 1, final, o.seller, o.buyer);
  if final >= 1000000 then insert into news(kind, arr, card, actor, data) values ('sale', c.arr, c.id, o.buyer, jsonb_build_object('price', final, 'seller', o.seller)); end if;
  update offers set status = 'accepted', held = 0, done_at = now() where id = o.id;
  for x in select * from offers where card = o.card and k = o.k and status in ('open','countered') and id <> o.id loop perform _offer_close(x, 'cancelled'); end loop;
  return null;
end $$;

-- le vendeur répond : accept, refuse, counter (une seule contre-proposition)
create or replace function respond_offer(p_id bigint, p_action text, p_price bigint default null) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); o offers; c cards; err text;
begin
  perform _sync(u); perform _offers_expire();
  select * into o from offers where id = p_id for update;
  if not found or o.seller <> u then raise exception 'Offre introuvable'; end if;
  if o.status <> 'open' then raise exception 'Cette offre n''attend plus de réponse'; end if;
  if p_action = 'refuse' then perform _offer_close(o, 'refused'); return my_offers(); end if;
  if p_action = 'accept' then
    err := _offer_exec(o, o.price);
    if err is not null then return (jsonb_build_object('error', err) || my_offers()::jsonb)::json; end if;
    perform _sync(u); return my_offers();
  end if;
  if p_action = 'counter' then
    select * into c from cards where id = o.card;
    if p_price is null or p_price <= o.price then raise exception 'Votre contre-proposition doit être plus haute que l''offre (% €)', o.price; end if;
    update offers set status = 'countered', counter = p_price, expires_at = now() + interval '24 hours' where id = o.id;
    return my_offers();
  end if;
  raise exception 'Action inconnue';
end $$;

-- l'acheteur répond à la contre-proposition
create or replace function answer_counter(p_id bigint, p_accept boolean) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); o offers; err text;
begin
  perform _sync(u); perform _offers_expire();
  select * into o from offers where id = p_id for update;
  if not found or o.buyer <> u then raise exception 'Offre introuvable'; end if;
  if o.status <> 'countered' then raise exception 'Pas de contre-proposition en attente'; end if;
  if not p_accept then perform _offer_close(o, 'refused'); return my_offers(); end if;
  err := _offer_exec(o, o.counter);
  if err is not null then return (jsonb_build_object('error', err) || my_offers()::jsonb)::json; end if;
  return my_offers();
end $$;

create or replace function cancel_offer(p_id bigint) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); o offers;
begin
  select * into o from offers where id = p_id and buyer = u and status in ('open','countered') for update;
  if not found then raise exception 'Offre introuvable'; end if;
  perform _offer_close(o, 'cancelled'); return my_offers();
end $$;

create or replace function set_no_offers(p_on boolean) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me();
begin update profiles set no_offers = coalesce(p_on, false) where id = u; return state(); end $$;

-- mes offres : reçues et envoyées (en cours + 20 dernières terminées)
create or replace function my_offers() returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then return json_build_object('received', '[]'::json, 'sent', '[]'::json); end if;
  perform _offers_expire();
  return json_build_object(
    'received', coalesce((select json_agg(x order by x.live desc, x.created_at desc) from (
      select o.id, o.card, o.k, o.price, o.counter, o.credit, o.status, o.created_at, o.expires_at, o.done_at, p.pseudo as other, o.status in ('open','countered') as live
      from offers o join profiles p on p.id = o.buyer where o.seller = u and (o.status in ('open','countered') or o.done_at > now() - interval '7 days') order by o.created_at desc limit 40) x), '[]'),
    'sent', coalesce((select json_agg(x order by x.live desc, x.created_at desc) from (
      select o.id, o.card, o.k, o.price, o.counter, o.credit, o.status, o.created_at, o.expires_at, o.done_at, p.pseudo as other, o.status in ('open','countered') as live
      from offers o join profiles p on p.id = o.seller where o.buyer = u and (o.status in ('open','countered') or o.done_at > now() - interval '7 days') order by o.created_at desc limit 40) x), '[]'),
    'state', state());
end $$;

revoke all on function _offer_close(offers, text), _offers_expire(), _offer_hold(bigint, boolean), _offer_exec(offers, bigint) from public, anon, authenticated;
grant execute on function make_offer(int, int, bigint, boolean), respond_offer(bigint, text, bigint), answer_counter(bigint, boolean), cancel_offer(bigint), set_no_offers(boolean), my_offers() to authenticated;

-- =====================================================================
--  Chaque parti a son pouvoir (choix du propriétaire, 16/10/2026)
--  Poing Levé : −50 % de loyer quand on tombe chez un autre · Gauche Unie : salaire doublé à chaque lancer
--  Juste Milieu : pas de commission quand on vend · Droite Libre : apport 5 % et +50 % de capacité d'emprunt
--  Rempart National : +50 % de loyer quand un joueur tombe chez soi
-- =====================================================================
create or replace function _party(u uuid) returns text language sql stable as $$ select party from profiles where id = u $$;
create or replace function _down_rate(u uuid) returns numeric language sql stable as $$
  select case when _party(u) = 'valeurs' then 0.05 else (cfg()->>'creditDown')::numeric end $$;
create or replace function _offer_hold(p bigint, cr boolean, u uuid) returns bigint language sql stable as $$
  select case when cr then ceil(p * _down_rate(u))::bigint else p end $$;

create or replace function _loan_cap(u uuid) returns bigint language sql stable as $$
  select (case when _party(u) = 'valeurs' then 1.5 else 1 end * ((cfg()->>'creditCap')::bigint
       + (cfg()->>'creditCapDays')::bigint * (coalesce((select sum(c.rent) from lots l join cards c on c.id=l.card where l.owner=u),0)
                                             + coalesce((select sum(c.rent * x.n) from parts x join cards c on c.id=x.card where x.owner=u),0))))::bigint
       - coalesce((select sum(loan) from lots where owner=u),0)::bigint - coalesce((select sum(loan) from parts where owner=u),0)::bigint $$;

create or replace function _pay_or_borrow(u uuid, price bigint, credit boolean) returns bigint language plpgsql as $$
declare have bigint; down bigint;
begin
  select p.cash into have from profiles p where id=u for update;
  if not coalesce(credit, false) then
    if have < price then raise exception 'Trésorerie insuffisante'; end if;
    update profiles set cash = cash - price where id=u; perform _log(u, 'buy', -price, 'Achat comptant'); return 0;
  end if;
  down := ceil(price * _down_rate(u));
  if price - down > _loan_cap(u) then raise exception 'Capacité d''emprunt dépassée : la banque ne vous prête plus que % €', greatest(0, _loan_cap(u)); end if;
  if have < down then raise exception 'Apport insuffisant : il faut % € (10 %% du prix)', down; end if;
  update profiles set cash = cash - down where id=u; perform _log(u, 'buy', -down, 'Apport (achat à crédit)');
  return price - down;
end $$;

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

create or replace function buy_listing(p_id bigint, p_credit boolean default false) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); l listings; c cards; fee numeric; have int; v_loan bigint := 0;
begin
  select * into l from listings where id=p_id for update;
  if not found then raise exception 'Annonce déjà vendue ou retirée'; end if;
  if l.seller = u then raise exception 'C''est votre annonce'; end if;
  perform _sync(u);
  select * into c from cards where id=l.card;
  if coalesce(p_credit, false) then
    v_loan := _pay_or_borrow(u, l.price, true);          -- apport 10 %, vérifie la capacité d'emprunt
  else
    if (select cash from profiles where id=u) < l.price then raise exception 'Trésorerie insuffisante'; end if;
    update profiles set cash = cash - l.price where id=u; perform _log(u, 'buy', -l.price, 'Achat au Marché', l.card);
  end if;
  if l.k is not null then
    update lots set owner=u, at=now(), loan=nullif(v_loan,0) where card=l.card and k=l.k and owner=l.seller and mort is null;
    if not found then raise exception 'Ce bien n''est plus disponible'; end if;
  else
    select n into have from parts where card=l.card and owner=l.seller and mort is null;
    if coalesce(have,0) < l.n then raise exception 'Ces parts ne sont plus disponibles'; end if;
    if have = l.n then delete from parts where card=l.card and owner=l.seller; else update parts set n=n-l.n where card=l.card and owner=l.seller; end if;
    insert into parts(card,owner,n,loan) values (l.card,u,l.n,nullif(v_loan,0))
      on conflict (card,owner) do update set n = parts.n + excluded.n, loan = nullif(coalesce(parts.loan,0) + coalesce(excluded.loan,0), 0);
  end if;
  fee := case when _party(l.seller) = 'milieu' then 0 else (cfg()->>'fee')::numeric end;   -- Juste Milieu : pas de commission
  insert into pay(owner, amount, why) values (l.seller, floor(l.price*(1-fee)), 'vente');
  perform _add_value(l.seller, c.arr, -c.v*l.n);
  perform _add_value(u, c.arr, c.v*l.n);
  perform _refresh_mayors(array[c.arr::int]);
  delete from listings where id=p_id;
  insert into sales(card,k,n,price,seller,buyer) values (l.card,l.k,l.n,l.price,l.seller,u);
  if l.price >= 1000000 then insert into news(kind, arr, card, actor, data) values ('sale', c.arr, c.id, u, jsonb_build_object('price', l.price, 'seller', l.seller)); end if;
  return state();
end $$;

create or replace function _offer_exec(o offers, final bigint) returns text language plpgsql as $$
declare c cards; l lots; need bigint; v_loan bigint := 0; fee numeric; x offers;
begin
  select * into c from cards where id = o.card;
  select * into l from lots where card = o.card and k = o.k for update;
  if not found or l.owner <> o.seller or coalesce(l.loan, 0) > 0 or l.mort is not null then
    perform _offer_close(o, 'cancelled'); return 'Ce logement n''est plus disponible : l''offre est annulée'; end if;
  need := _offer_hold(final, o.credit, o.buyer);
  if o.credit then v_loan := final - need; end if;
  perform 1 from profiles where id = o.buyer for update;
  if v_loan > 0 and v_loan > _loan_cap(o.buyer) then perform _offer_close(o, 'cancelled'); return 'La banque ne prête plus assez à l''acheteur : l''offre est annulée'; end if;
  if need > o.held and (select cash from profiles where id = o.buyer) < need - o.held then perform _offer_close(o, 'cancelled'); return 'L''acheteur n''a plus assez d''argent : l''offre est annulée'; end if;
  -- l'argent bloqué devient le paiement (on complète ou on rend la différence)
  if need <> o.held then
    update profiles set cash = cash - (need - o.held) where id = o.buyer;
    perform _log(o.buyer, 'buy', -(need - o.held), case when need > o.held then 'Achat entre joueurs : complément' else 'Achat entre joueurs : trop-bloqué rendu' end, o.card);
  end if;
  update lots set owner = o.buyer, at = now(), loan = nullif(v_loan, 0) where card = o.card and k = o.k;
  delete from listings where card = o.card and k = o.k;
  fee := case when _party(o.seller) = 'milieu' then 0 else (cfg()->>'fee')::numeric end;
  insert into pay(owner, amount, why) values (o.seller, floor(final * (1 - fee)), 'vente');
  perform _add_value(o.seller, c.arr, -c.v);
  perform _add_value(o.buyer, c.arr, c.v);
  perform _refresh_mayors(array[c.arr::int]);
  insert into sales(card, k, n, price, seller, buyer) values (o.card, o.k, 1, final, o.seller, o.buyer);
  if final >= 1000000 then insert into news(kind, arr, card, actor, data) values ('sale', c.arr, c.id, o.buyer, jsonb_build_object('price', final, 'seller', o.seller)); end if;
  update offers set status = 'accepted', held = 0, done_at = now() where id = o.id;
  for x in select * from offers where card = o.card and k = o.k and status in ('open','countered') and id <> o.id loop perform _offer_close(x, 'cancelled'); end loop;
  return null;
end $$;

create or replace function make_offer(p_card int, p_k int, p_price bigint, p_credit boolean default false) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); c cards; l lots; h bigint; s profiles;
begin
  perform _sync(u); perform _offers_expire();
  select * into c from cards where id = p_card;
  if not found or c.lk = 'p' then raise exception 'On ne peut faire une offre que sur un logement ou un local'; end if;
  select * into l from lots where card = p_card and k = p_k;
  if not found then raise exception 'Ce logement est libre : achetez-le à la banque en tombant dessus avec le dé'; end if;
  if l.owner = u then raise exception 'Ce logement est déjà à vous'; end if;
  if coalesce(l.loan, 0) > 0 then raise exception 'Ce logement est acheté à crédit : il ne peut pas être vendu pour l''instant'; end if;
  if l.mort is not null then raise exception 'Ce logement est hypothéqué : il ne peut pas être vendu pour l''instant'; end if;
  select * into s from profiles where id = l.owner;
  if s.no_offers then raise exception '% ne reçoit pas d''offres', s.pseudo; end if;
  if p_price < ceil(c.v * 0.8) then raise exception 'Offre trop basse : au moins % € (80 %% de la valeur)', ceil(c.v * 0.8)::bigint; end if;
  if exists (select 1 from offers where buyer = u and card = p_card and k = p_k and status in ('open','countered')) then raise exception 'Vous avez déjà une offre en cours sur ce logement'; end if;
  if exists (select 1 from offers where buyer = u and card = p_card and k = p_k and status = 'refused' and done_at > now() - interval '24 hours') then
    raise exception 'Votre offre a été refusée : vous pourrez en refaire une dans 24 h'; end if;
  if (select count(*) from offers where buyer = u and status in ('open','countered')) >= 3 then raise exception 'Vous avez déjà 3 offres en cours : attendez une réponse'; end if;
  if coalesce(p_credit, false) and p_price - _offer_hold(p_price, true, u) > _loan_cap(u) then
    raise exception 'Capacité d''emprunt dépassée : la banque ne vous prête plus que % €', greatest(0, _loan_cap(u)); end if;
  h := _offer_hold(p_price, coalesce(p_credit, false), u);
  perform 1 from profiles where id = u for update;
  if (select cash from profiles where id = u) < h then raise exception 'Trésorerie insuffisante : il faut % € de côté pour faire cette offre', h; end if;
  update profiles set cash = cash - h where id = u;
  perform _log(u, 'offer', -h, 'Offre d''achat envoyée (argent bloqué)', p_card);
  insert into offers(card, k, buyer, seller, price, credit, held) values (p_card, p_k, u, l.owner, p_price, coalesce(p_credit, false), h);
  return my_offers();
end $$;

revoke all on function _party(uuid), _down_rate(uuid), _offer_hold(bigint, boolean, uuid) from public, anon, authenticated;

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

-- ===== migration_stats.sql =====
-- Tableau de bord de l'administrateur : joueurs, activité, économie.
-- Rejouable sans risque.

-- dernière fois que le joueur a fait quelque chose lui-même (pas quand un autre lui paie un loyer)
alter table profiles add column if not exists seen_at timestamptz;

-- petits compteurs par jour (boosters ouverts…)
create table if not exists stat_day (
  day  date not null,
  kind text not null,
  n    bigint not null default 0,
  primary key (day, kind)
);
alter table stat_day enable row level security;
revoke all on stat_day from anon, authenticated;

create or replace function _stat(p_kind text, p_n int default 1) returns void
language sql security definer set search_path = public as $$
  insert into stat_day(day, kind, n) values ((now() at time zone 'Europe/Paris')::date, p_kind, p_n)
  on conflict (day, kind) do update set n = stat_day.n + excluded.n $$;

create or replace function _profiles_track() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = new.id then new.seen_at := now(); end if;
  if new.welcome < old.welcome then perform _stat('booster', old.welcome - new.welcome); end if;
  if new.free_at is not null and new.free_at is distinct from old.free_at then perform _stat('booster'); end if;
  if new.bought_n > old.bought_n or (new.bought_day is distinct from old.bought_day and new.bought_n > 0) then perform _stat('booster'); perform _stat('booster_paid'); end if;
  return new;
end $$;
drop trigger if exists profiles_track on profiles;
create trigger profiles_track before update on profiles for each row execute function _profiles_track();

create or replace function admin_stats() returns json
language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'Europe/Paris')::date; t0 timestamptz := (today::timestamp at time zone 'Europe/Paris');
begin
  perform _need_admin();
  return json_build_object(
    'players',     (select count(*) from profiles),
    'new_today',   (select count(*) from profiles where created_at >= t0),
    'new_7d',      (select count(*) from profiles where created_at >= now() - interval '7 days'),
    'new_30d',     (select count(*) from profiles where created_at >= now() - interval '30 days'),
    'active_today',(select count(*) from profiles where greatest(seen_at, created_at) >= t0
                      or id in (select owner from ledger where at >= t0 and kind in ('salary','buy','booster','rolls'))),
    'active_7d',   (select count(*) from profiles where greatest(seen_at, created_at) >= now() - interval '7 days'
                      or id in (select owner from ledger where at >= now() - interval '7 days' and kind in ('salary','buy','booster','rolls'))),
    'rolls_today', (select count(*) from ledger where kind = 'salary' and at >= t0),
    'rolls_7d',    (select count(*) from ledger where kind = 'salary' and at >= now() - interval '7 days'),
    'boosters_today', (select coalesce(sum(n), 0) from stat_day where kind = 'booster' and day = today),
    'boosters_7d', (select coalesce(sum(n), 0) from stat_day where kind = 'booster' and day > today - 7),
    'buys_today',  (select count(*) from ledger where kind = 'buy' and at >= t0),
    'buys_7d',     (select count(*) from ledger where kind = 'buy' and at >= now() - interval '7 days'),
    'sales_7d',    (select count(*) from sales where at >= now() - interval '7 days'),
    'lots_owned',  (select count(*) from lots),
    'cash_total',  (select coalesce(sum(cash), 0) from profiles),
    'loans_total', (select coalesce(sum(loan), 0) from lots) + (select coalesce(sum(loan), 0) from parts),
    'parties',     (select coalesce(json_object_agg(coalesce(party, 'aucun'), n), '{}') from (select party, count(*) n from profiles group by party) x),
    'by_day',      (select coalesce(json_agg(x order by x.day), '[]') from (
                      select d::date as day,
                        (select count(*) from profiles where created_at >= (d::timestamp at time zone 'Europe/Paris') and created_at < ((d + interval '1 day')::timestamp at time zone 'Europe/Paris')) as signups,
                        (select count(distinct owner) from ledger where kind in ('salary','buy','booster','rolls') and at >= (d::timestamp at time zone 'Europe/Paris') and at < ((d + interval '1 day')::timestamp at time zone 'Europe/Paris')) as active
                      from generate_series(today - 13, today, interval '1 day') d) x),
    'latest',      (select coalesce(json_agg(x), '[]') from (select pseudo, party, created_at, seen_at, cash,
                      (select count(*) from lots l where l.owner = p.id) as lots from profiles p order by created_at desc limit 15) x),
    'top',         (select coalesce(json_agg(x), '[]') from (select * from json_to_recordset(leaderboard()) as r(id uuid, pseudo text, party text, worth numeric, mayorships int) limit 10) x)
  );
end $$;
revoke all on function admin_stats() from public, anon;
grant execute on function admin_stats() to authenticated;
revoke all on function _stat(text, int) from public, anon, authenticated;
revoke all on function _profiles_track() from public, anon, authenticated;

-- ===== migration_retention.sql =====
-- Taux de retour des joueurs (rétention) pour le tableau de bord de l'administrateur :
-- parmi les inscrits d'un jour, combien reviennent le lendemain, 7 jours après, 30 jours après.
-- Rejouable sans risque.

-- un jour où le joueur a ouvert le jeu ou joué (une ligne par joueur et par jour)
create table if not exists active_day (
  u   uuid not null references profiles(id) on delete cascade,
  day date not null,
  primary key (u, day)
);
alter table active_day enable row level security;
revoke all on active_day from anon, authenticated;

-- historique d'avant cette migration : reconstitué à partir de ce que le joueur a fait lui-même
-- (lancers de dé, achats, boosters payés, cartes Chance, loyers payés en passant…) et de sa dernière visite
insert into active_day(u, day)
  select distinct owner, (at at time zone 'Europe/Paris')::date from ledger
  where kind in ('salary', 'buy', 'booster', 'rolls', 'repay', 'mortgage', 'lift', 'chance', 'toll_paid')
on conflict do nothing;
insert into active_day(u, day)
  select id, (seen_at at time zone 'Europe/Paris')::date from profiles where seen_at is not null
on conflict do nothing;

-- à partir de maintenant : chaque fois que le joueur ouvre le jeu ou agit lui-même (state() met son profil à jour)
create or replace function _profiles_track() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = new.id then
    new.seen_at := now();
    insert into active_day(u, day) values (new.id, (now() at time zone 'Europe/Paris')::date) on conflict do nothing;
  end if;
  if new.welcome < old.welcome then perform _stat('booster', old.welcome - new.welcome); end if;
  if new.free_at is not null and new.free_at is distinct from old.free_at then perform _stat('booster'); end if;
  if new.bought_n > old.bought_n or (new.bought_day is distinct from old.bought_day and new.bought_n > 0) then perform _stat('booster'); perform _stat('booster_paid'); end if;
  return new;
end $$;
drop trigger if exists profiles_track on profiles;
create trigger profiles_track before update on profiles for each row execute function _profiles_track();
revoke all on function _profiles_track() from public, anon, authenticated;

-- rétention « classique » : revenu exactement le lendemain (J+1), le 7e jour (J+7), le 30e jour (J+30).
-- Les comptes administrateurs ne sont pas comptés.
create or replace function admin_retention() returns json
language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'Europe/Paris')::date;
begin
  perform _need_admin();
  return (
    with c as (
      select p.id, (p.created_at at time zone 'Europe/Paris')::date as d0
      from profiles p where p.id not in (select id from admins)),
    r as (
      select c.d0,
        exists (select 1 from active_day a where a.u = c.id and a.day = c.d0 + 1)  as r1,
        exists (select 1 from active_day a where a.u = c.id and a.day = c.d0 + 7)  as r7,
        exists (select 1 from active_day a where a.u = c.id and a.day = c.d0 + 30) as r30,
        exists (select 1 from active_day a where a.u = c.id and a.day > c.d0)      as back
      from c)
    select json_build_object(
      'd1',   (select json_build_object('n', count(*), 'back', count(*) filter (where r1))   from r where d0 <= today - 1),
      'd7',   (select json_build_object('n', count(*), 'back', count(*) filter (where r7))   from r where d0 <= today - 7),
      'd30',  (select json_build_object('n', count(*), 'back', count(*) filter (where r30))  from r where d0 <= today - 30),
      'ever', (select json_build_object('n', count(*), 'back', count(*) filter (where back)) from r where d0 <= today - 1),
      'cohorts', (select coalesce(json_agg(x order by x.day desc), '[]') from (
          select d0 as day, count(*) as n,
            case when d0 <= today - 1  then count(*) filter (where r1)  end as d1,
            case when d0 <= today - 7  then count(*) filter (where r7)  end as d7,
            case when d0 <= today - 30 then count(*) filter (where r30) end as d30
          from r where d0 > today - 35 group by d0) x)
    ));
end $$;
revoke all on function admin_retention() from public, anon;
grant execute on function admin_retention() to authenticated;

-- ===== migration_chat.sql =====
-- =====================================================================
--  Le chat du Champ-de-Mars (20/10/2026, validé par le propriétaire sur maquette).
--  On s'y promène avec son personnage (pseudo au-dessus de la tête), on parle, les bulles s'effacent
--  au bout de quelques secondes. Salles de 40 personnes au plus (Champ-de-Mars 1, 2…).
--  Tout passe par ces fonctions : c'est le serveur qui signe chaque message (personne ne peut parler
--  à la place d'un autre), le garde 2 minutes (chat_msg) et l'envoie en temps réel sur le canal privé
--  « place:cdm:N » (realtime.send) ; les joueurs ne peuvent que recevoir sur ce canal.
--  Si le temps réel ne répond pas, le site relit chat_feed() toutes les 2 s.
--  L'admin peut bannir 24 h ou à vie (chat_ban). Le personnage (peau, cheveux, coupe, haut) est dans profiles.look.
--  Rejouable sans risque.
-- =====================================================================
alter table profiles add column if not exists look jsonb;

create table if not exists chat_bans (
  user_id uuid primary key,
  until   timestamptz,                 -- null = à vie
  by_user uuid,
  at      timestamptz not null default now()
);
alter table chat_bans enable row level security;

create table if not exists place_people (
  user_id uuid primary key,
  room    int not null default 1,
  lon     float8 not null,
  lat     float8 not null,
  seen    timestamptz not null default now(),
  said_at timestamptz
);
alter table place_people enable row level security;
create index if not exists place_people_room on place_people(room, seen);

create table if not exists chat_msg (
  id      bigserial primary key,
  room    int not null,
  user_id uuid not null,
  kind    text not null,               -- join | move | say | look | leave | kick
  data    jsonb not null default '{}',
  at      timestamptz not null default now()
);
alter table chat_msg enable row level security;
create index if not exists chat_msg_room on chat_msg(room, id);
create index if not exists chat_msg_at on chat_msg(at);

-- banni ? null = non ; 'infinity' = à vie ; sinon jusqu'à quand
create or replace function _chat_ban_until(u uuid) returns timestamptz language sql stable as $$
  select case when b.until is null then 'infinity'::timestamptz else b.until end
  from chat_bans b where b.user_id = u and (b.until is null or b.until > now()) $$;

-- ce que les autres voient de quelqu'un sur la pelouse
create or replace function _chat_person(u uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('id', p.id, 'pseudo', p.pseudo, 'party', p.party, 'look', p.look, 'lon', x.lon, 'lat', x.lat)
  from profiles p join place_people x on x.user_id = p.id where p.id = u $$;

-- un évènement de la salle : gardé 2 minutes, et envoyé en temps réel si c'est possible
create or replace function _chat_emit(p_room int, p_user uuid, p_kind text, p_data jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare i bigint;
begin
  insert into chat_msg(room, user_id, kind, data) values (p_room, p_user, p_kind, coalesce(p_data, '{}')) returning id into i;
  delete from chat_msg where at < now() - interval '2 minutes';
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    begin
      execute 'select realtime.send($1, $2, $3, true)'
        using jsonb_build_object('e', i, 'k', p_kind, 'u', p_user, 'd', coalesce(p_data, '{}')), 'ev', 'place:cdm:' || p_room;
    exception when others then null;   -- le temps réel ne doit jamais bloquer le chat : le site relit chat_feed()
    end;
  end if;
  return i;
end $$;

-- les gens présents dans ma salle (vus il y a moins de 90 s)
create or replace function chat_people() returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); r int;
begin
  select room into r from place_people where user_id = u;
  if r is null then return '[]'; end if;
  return coalesce((select json_agg(_chat_person(x.user_id)) from place_people x where x.room = r and x.seen > now() - interval '90 seconds'), '[]');
end $$;

-- entrer sur le Champ-de-Mars (ou y revenir) : on garde sa salle, sinon la première qui a de la place
create or replace function chat_join(p_lon float8, p_lat float8) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); b timestamptz; r int; lo float8; la float8;
begin
  b := _chat_ban_until(u);
  if b = 'infinity'::timestamptz then raise exception 'Vous êtes banni du chat.'; end if;
  if b is not null then raise exception 'Vous êtes banni du chat jusqu''au %', to_char(b at time zone 'Europe/Paris', 'DD/MM à HH24"h"MI'); end if;
  lo := least(2.3050, greatest(2.2920, coalesce(p_lon, 2.2985)));
  la := least(48.8600, greatest(48.8500, coalesce(p_lat, 48.8556)));
  delete from place_people where seen < now() - interval '90 seconds';
  select room into r from place_people where user_id = u;
  if r is null then
    select min(g) into r from generate_series(1, (select coalesce(max(room), 0) + 1 from place_people)) g
      where (select count(*) from place_people x where x.room = g) < 40;
  end if;
  insert into place_people(user_id, room, lon, lat, seen) values (u, r, lo, la, now())
    on conflict (user_id) do update set room = excluded.room, lon = excluded.lon, lat = excluded.lat, seen = now();
  perform _chat_emit(r, u, 'join', _chat_person(u));
  return json_build_object('room', r, 'me', u, 'people', chat_people(), 'last', coalesce((select max(id) from chat_msg where room = r), 0), 'admin', is_admin());
end $$;

-- marcher : on touche la pelouse, le personnage y va
create or replace function chat_move(p_lon float8, p_lat float8) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); x place_people; lo float8; la float8;
begin
  select * into x from place_people where user_id = u for update;
  if not found then raise exception 'Revenez sur le Champ-de-Mars'; end if;
  lo := least(2.3050, greatest(2.2920, p_lon)); la := least(48.8600, greatest(48.8500, p_lat));
  update place_people set lon = lo, lat = la, seen = now() where user_id = u;
  perform _chat_emit(x.room, u, 'move', jsonb_build_object('lon', lo, 'lat', la));
end $$;

-- parler : 120 caractères au plus, un message par seconde
create or replace function chat_say(p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); x place_people; t text;
begin
  if _chat_ban_until(u) is not null then raise exception 'Vous êtes banni du chat.'; end if;
  select * into x from place_people where user_id = u for update;
  if not found then raise exception 'Revenez sur le Champ-de-Mars'; end if;
  t := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  if t = '' then return; end if;
  t := left(t, 120);
  if x.said_at is not null and x.said_at > now() - interval '1 second' then raise exception 'Doucement : un message par seconde.'; end if;
  update place_people set said_at = now(), seen = now() where user_id = u;
  perform _chat_emit(x.room, u, 'say', jsonb_build_object('t', t));
end $$;

-- toujours là (toutes les 25 s) ; renvoie le nombre de gens dans la salle
create or replace function chat_ping() returns int
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); r int;
begin
  update place_people set seen = now() where user_id = u returning room into r;
  if r is null then raise exception 'Revenez sur le Champ-de-Mars'; end if;
  return (select count(*) from place_people where room = r and seen > now() - interval '90 seconds');
end $$;

create or replace function chat_leave() returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); r int;
begin
  delete from place_people where user_id = u returning room into r;
  if r is not null then perform _chat_emit(r, u, 'leave', '{}'); end if;
end $$;

-- les évènements de ma salle depuis le dernier vu (quand le temps réel ne répond pas)
create or replace function chat_feed(p_since bigint) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); r int;
begin
  update place_people set seen = now() where user_id = u returning room into r;
  if r is null then return json_build_object('gone', true, 'ev', '[]'::json); end if;
  return json_build_object('ev', coalesce((select json_agg(json_build_object('e', m.id, 'k', m.kind, 'u', m.user_id, 'd', m.data) order by m.id)
    from (select * from chat_msg where room = r and id > coalesce(p_since, 0) order by id limit 300) m), '[]'));
end $$;

-- combien de joueurs sur le Champ-de-Mars en ce moment (la pastille verte)
create or replace function chat_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from place_people where seen > now() - interval '90 seconds' $$;

-- admin : bannir 24 h (p_hours) ou à vie (p_hours null), débannir, la liste
create or replace function chat_bans() returns json
language plpgsql security definer set search_path = public as $$
declare a uuid := _need_admin();
begin
  return coalesce((select json_agg(json_build_object('id', b.user_id, 'pseudo', p.pseudo, 'until', b.until, 'at', b.at) order by b.at desc)
    from chat_bans b left join profiles p on p.id = b.user_id where b.until is null or b.until > now()), '[]');
end $$;

create or replace function chat_ban(p_user uuid, p_hours int default 24) returns json
language plpgsql security definer set search_path = public as $$
declare a uuid := _need_admin(); r int;
begin
  if p_user = a then raise exception 'Vous ne pouvez pas vous bannir vous-même'; end if;
  if exists (select 1 from admins where id = p_user) then raise exception 'On ne bannit pas un admin'; end if;
  insert into chat_bans(user_id, until, by_user, at) values (p_user, case when p_hours is null then null else now() + make_interval(hours => p_hours) end, a, now())
    on conflict (user_id) do update set until = excluded.until, by_user = excluded.by_user, at = now();
  delete from place_people where user_id = p_user returning room into r;
  if r is not null then perform _chat_emit(r, p_user, 'kick', jsonb_build_object('h', p_hours)); end if;
  return chat_bans();
end $$;

create or replace function chat_unban(p_user uuid) returns json
language plpgsql security definer set search_path = public as $$
declare a uuid := _need_admin();
begin
  delete from chat_bans where user_id = p_user;
  return chat_bans();
end $$;

-- son personnage : s peau (0-5), h cheveux (0-5), c coupe (0-2), t haut (-1 = couleur du parti, 0-6)
create or replace function set_look(p_look jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); l jsonb; r int;
  pick int[]; k text; v int;
begin
  l := '{}'::jsonb;
  foreach k in array array['s', 'h', 'c', 't'] loop
    pick := case k when 's' then array[0, 5] when 'h' then array[0, 5] when 'c' then array[0, 2] else array[-1, 6] end;
    v := case when jsonb_typeof(p_look -> k) = 'number' then (p_look ->> k)::numeric::int else null end;
    if v is null or v < pick[1] or v > pick[2] then raise exception 'Choix de personnage inconnu'; end if;
    l := l || jsonb_build_object(k, v);
  end loop;
  update profiles set look = l where id = u;
  select room into r from place_people where user_id = u;
  if r is not null then perform _chat_emit(r, u, 'look', jsonb_build_object('look', l)); end if;
  return l;
end $$;

revoke all on function _chat_ban_until(uuid), _chat_person(uuid), _chat_emit(int, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function chat_people(), chat_join(float8, float8), chat_move(float8, float8), chat_say(text), chat_ping(), chat_leave(), chat_feed(bigint),
  chat_count(), chat_bans(), chat_ban(uuid, int), chat_unban(uuid), set_look(jsonb) from public, anon;
grant execute on function chat_people(), chat_join(float8, float8), chat_move(float8, float8), chat_say(text), chat_ping(), chat_leave(), chat_feed(bigint),
  chat_count(), chat_bans(), chat_ban(uuid, int), chat_unban(uuid), set_look(jsonb) to authenticated;

-- temps réel : sur le canal privé du chat, les joueurs connectés reçoivent (et personne ne peut y écrire
-- directement : seul le serveur envoie). Si cette partie de Supabase n'existe pas, on passe (le site relira chat_feed).
do $$
begin
  if to_regclass('realtime.messages') is not null then
    begin
      execute 'drop policy if exists "chat : les joueurs reçoivent" on realtime.messages';
      execute $q$create policy "chat : les joueurs reçoivent" on realtime.messages for select to authenticated
               using ((select realtime.topic()) like 'place:cdm:%')$q$;
    exception when others then raise notice 'chat : politique temps réel non créée (%)', sqlerrm;
    end;
  end if;
end $$;

-- ===== migration_metro.sql =====
-- =====================================================================
--  Les lieux en cartes à parts (20/10/2026, validé par le propriétaire) : les 244 stations de métro
--  de Paris (100 parts, rareté selon le nombre de lignes, Châtelet Mythique) et 45 jardins, bois,
--  places et le canal Saint-Martin (parts selon la rareté, comme les monuments).
--  Bonus réseau : +1 % sur tous ses loyers par station où l'on a au moins une part, jusqu'à +15 %.
--  Boosters : une case Commune peut aussi donner une part de station (8 %).
--  Généré par scripts/add_spots.py (données Wikidata, CC0). Rejouable sans risque.
-- =====================================================================
--  (ici seulement les règles et la liste des lieux : les cartes et les liens du dé viennent de cards.json et edges.json, chargés par /api/seed)
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

insert into spots(card, kind, lines) values
(1578,'m',array['1','4','7','11','14']),
(1579,'m',array['4']),
(1580,'m',array['4']),
(1581,'m',array['1']),
(1582,'m',array['1','7']),
(1583,'m',array['7']),
(1584,'m',array['7','14']),
(1585,'m',array['1']),
(101896,'m',array['3']),
(101897,'m',array['3']),
(101898,'m',array['3','4']),
(101899,'m',array['3']),
(101900,'m',array['4','8','9']),
(202033,'m',array['3','11']),
(202034,'m',array['8']),
(202035,'m',array['8']),
(202036,'m',array['11']),
(202037,'m',array['3','5','8','9','11']),
(202038,'m',array['8']),
(202039,'m',array['3']),
(301901,'m',array['4']),
(301902,'m',array['1','11']),
(301903,'m',array['7']),
(301904,'m',array['1']),
(301905,'m',array['7']),
(402728,'m',array['10']),
(402729,'m',array['7']),
(402730,'m',array['10']),
(402731,'m',array['7','10']),
(402732,'m',array['10']),
(402733,'m',array['7']),
(502588,'m',array['10']),
(502589,'m',array['12']),
(502590,'m',array['4','10']),
(502591,'m',array['12']),
(502592,'m',array['4']),
(502593,'m',array['4']),
(502594,'m',array['4']),
(502595,'m',array['4']),
(602929,'m',array['12']),
(602930,'m',array['10','13']),
(602931,'m',array['8']),
(602932,'m',array['8','13']),
(602933,'m',array['8']),
(602934,'m',array['12']),
(602935,'m',array['13']),
(602936,'m',array['10','12']),
(602937,'m',array['12']),
(602938,'m',array['10']),
(602939,'m',array['13']),
(703297,'m',array['9']),
(703298,'m',array['1','13']),
(703299,'m',array['1','2','6']),
(703300,'m',array['1','8','12']),
(703301,'m',array['2']),
(703302,'m',array['3']),
(703303,'m',array['1','9']),
(703304,'m',array['1']),
(703305,'m',array['13']),
(703306,'m',array['8','12','14']),
(703307,'m',array['9','13']),
(703308,'m',array['2']),
(703309,'m',array['9']),
(703310,'m',array['3','12','13','14']),
(703311,'m',array['9']),
(703312,'m',array['2']),
(803146,'m',array['2']),
(803147,'m',array['7']),
(803148,'m',array['7','9']),
(803149,'m',array['8','9']),
(803150,'m',array['3','9']),
(803151,'m',array['7']),
(803152,'m',array['12']),
(803153,'m',array['3','7','8']),
(803154,'m',array['2','12']),
(803155,'m',array['7']),
(803156,'m',array['8','9']),
(803157,'m',array['12']),
(803158,'m',array['12']),
(902918,'m',array['2','4']),
(902919,'m',array['8','9']),
(902920,'m',array['4']),
(902921,'m',array['7']),
(902922,'m',array['2']),
(902923,'m',array['4','5','7']),
(902924,'m',array['4','5']),
(902925,'m',array['5']),
(902926,'m',array['7','7bis']),
(1004561,'m',array['2']),
(1004562,'m',array['2']),
(1004563,'m',array['5']),
(1004564,'m',array['9']),
(1004565,'m',array['2']),
(1004566,'m',array['8']),
(1004567,'m',array['11']),
(1004568,'m',array['8']),
(1004569,'m',array['2']),
(1004570,'m',array['5','9']),
(1004571,'m',array['3']),
(1004572,'m',array['5']),
(1004573,'m',array['9']),
(1004574,'m',array['3']),
(1004575,'m',array['9']),
(1004576,'m',array['9']),
(1103959,'m',array['1','5','8']),
(1103960,'m',array['6']),
(1103961,'m',array['6','14']),
(1103962,'m',array['14']),
(1103963,'m',array['6','8']),
(1103964,'m',array['6']),
(1103965,'m',array['1','14']),
(1103966,'m',array['8']),
(1103967,'m',array['8']),
(1103968,'m',array['1','2','6','9']),
(1103969,'m',array['6']),
(1103970,'m',array['8']),
(1103971,'m',array['8']),
(1103972,'m',array['5']),
(1103973,'m',array['1','8']),
(1204454,'m',array['14']),
(1204455,'m',array['5']),
(1204456,'m',array['6']),
(1204457,'m',array['6']),
(1204458,'m',array['5','10']),
(1204459,'m',array['6']),
(1204460,'m',array['7']),
(1204461,'m',array['7','14']),
(1204462,'m',array['6']),
(1204463,'m',array['14']),
(1204464,'m',array['5','6','7']),
(1204465,'m',array['7']),
(1204466,'m',array['7']),
(1204467,'m',array['7']),
(1204468,'m',array['6']),
(1204469,'m',array['5']),
(1204470,'m',array['7']),
(1304770,'m',array['4']),
(1304771,'m',array['4','6']),
(1304772,'m',array['6']),
(1304773,'m',array['13']),
(1304774,'m',array['4']),
(1304775,'m',array['13']),
(1304776,'m',array['13']),
(1304777,'m',array['4']),
(1304778,'m',array['13']),
(1304779,'m',array['4','6']),
(1304780,'m',array['6']),
(1304781,'m',array['4']),
(1406557,'m',array['10']),
(1406558,'m',array['8']),
(1406559,'m',array['6']),
(1406560,'m',array['8']),
(1406561,'m',array['6']),
(1406562,'m',array['10']),
(1406563,'m',array['8']),
(1406564,'m',array['12']),
(1406565,'m',array['6']),
(1406566,'m',array['12']),
(1406567,'m',array['8']),
(1406568,'m',array['10']),
(1406569,'m',array['6','8','10']),
(1406570,'m',array['8']),
(1406571,'m',array['4','6','12','13']),
(1406572,'m',array['6','12']),
(1406573,'m',array['12']),
(1406574,'m',array['10']),
(1406575,'m',array['6']),
(1406576,'m',array['12']),
(1406577,'m',array['12']),
(1506816,'m',array['1']),
(1506817,'m',array['6']),
(1506818,'m',array['10']),
(1506819,'m',array['10']),
(1506820,'m',array['9']),
(1506821,'m',array['9']),
(1506822,'m',array['9']),
(1506823,'m',array['6']),
(1506824,'m',array['9']),
(1506825,'m',array['9','10']),
(1506826,'m',array['9','10']),
(1506827,'m',array['10']),
(1506828,'m',array['6']),
(1506829,'m',array['10']),
(1506830,'m',array['2']),
(1506831,'m',array['9']),
(1506832,'m',array['1']),
(1506833,'m',array['9']),
(1506834,'m',array['9']),
(1506835,'m',array['6','9']),
(1506836,'m',array['2']),
(1606046,'m',array['13']),
(1606047,'m',array['13']),
(1606048,'m',array['3']),
(1606049,'m',array['3']),
(1606050,'m',array['14']),
(1606051,'m',array['3']),
(1606052,'m',array['13','14']),
(1606053,'m',array['13']),
(1606054,'m',array['2']),
(1606055,'m',array['2','3']),
(1606056,'m',array['3']),
(1706091,'m',array['12']),
(1706092,'m',array['2']),
(1706093,'m',array['4']),
(1706094,'m',array['13']),
(1706095,'m',array['12']),
(1706096,'m',array['2']),
(1706097,'m',array['12']),
(1706098,'m',array['4','12']),
(1706099,'m',array['12']),
(1706100,'m',array['2','13']),
(1706101,'m',array['4']),
(1706102,'m',array['12']),
(1706103,'m',array['4']),
(1804259,'m',array['7bis']),
(1804260,'m',array['7bis']),
(1804261,'m',array['7bis']),
(1804262,'m',array['7']),
(1804263,'m',array['7']),
(1804264,'m',array['7bis']),
(1804265,'m',array['2','5','7bis']),
(1804266,'m',array['5']),
(1804267,'m',array['5']),
(1804268,'m',array['7bis','11']),
(1804269,'m',array['7']),
(1804270,'m',array['5']),
(1804271,'m',array['7bis']),
(1804272,'m',array['7']),
(1804273,'m',array['2','5','7']),
(1905308,'m',array['2','11']),
(1905309,'m',array['9']),
(1905310,'m',array['3','3bis']),
(1905311,'m',array['11']),
(1905312,'m',array['9']),
(1905313,'m',array['3bis']),
(1905314,'m',array['2','3']),
(1905315,'m',array['2']),
(1905316,'m',array['3']),
(1905317,'m',array['9']),
(1905318,'m',array['1']),
(1905319,'m',array['3bis','11']),
(1905320,'m',array['11']),
(1905321,'m',array['3bis']),
(1905322,'m',array['11']),
(1586,'j',null),
(502596,'j',null),
(602940,'j',null),
(1804274,'j',null),
(703313,'j',null),
(402734,'j',null),
(1304782,'j',null),
(1804275,'j',null),
(1406578,'j',null),
(1103974,'j',null),
(1587,'j',null),
(1588,'j',null),
(1905323,'j',null),
(1103975,'j',null),
(1406579,'j',null),
(602941,'j',null),
(1506837,'j',null),
(1506838,'b',null),
(1103976,'b',null),
(703314,'p',null),
(1506839,'p',null),
(301906,'p',null),
(1103977,'p',null),
(202040,'p',null),
(1606057,'p',null),
(1589,'p',null),
(1706104,'p',null),
(1103978,'p',null),
(1204471,'p',null),
(101901,'p',null),
(101902,'p',null),
(1590,'p',null),
(502597,'p',null),
(1591,'p',null),
(703315,'p',null),
(301907,'p',null),
(803159,'p',null),
(402735,'p',null),
(402736,'p',null),
(502598,'p',null),
(301908,'p',null),
(1304783,'p',null),
(1606058,'p',null),
(1706105,'p',null),
(902927,'c',null)
on conflict (card) do update set kind = excluded.kind, lines = excluded.lines;

-- ===== migration_chat_look.sql =====
-- =====================================================================
--  Mon personnage, un peu plus de choix (20/10/2026, demande du propriétaire : homme ou femme, blond, « un peu plus de custo,
--  mais minimaliste ») : genre (g), 8 couleurs de cheveux (h), 6 coupes (c), couleur du bas (b), un accessoire (a).
--  Les personnages déjà enregistrés restent valables (g, b, a absents = 0).
--  Salles de 80 au lieu de 40 : on peut maintenant marcher sur tout le Champ-de-Mars. Rejouable sans risque.
-- =====================================================================
create or replace function set_look(p_look jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); l jsonb; r int; k text; v int; lo int; hi int; opt boolean;
begin
  l := '{}'::jsonb;
  foreach k in array array['g', 's', 'h', 'c', 't', 'b', 'a'] loop
    lo := case k when 't' then -1 else 0 end;
    hi := case k when 'g' then 1 when 's' then 5 when 'h' then 7 when 'c' then 5 when 't' then 6 else 4 end;
    opt := k in ('g', 'b', 'a');
    v := case when jsonb_typeof(p_look -> k) = 'number' then (p_look ->> k)::numeric::int else null end;
    if v is null and opt then v := 0; end if;
    if v is null or v < lo or v > hi then raise exception 'Choix de personnage inconnu'; end if;
    l := l || jsonb_build_object(k, v);
  end loop;
  update profiles set look = l where id = u;
  select room into r from place_people where user_id = u;
  if r is not null then perform _chat_emit(r, u, 'look', jsonb_build_object('look', l)); end if;
  return l;
end $$;
revoke all on function set_look(jsonb) from public, anon;
grant execute on function set_look(jsonb) to authenticated;

-- entrer sur le Champ-de-Mars (ou y revenir) : on garde sa salle, sinon la première qui a de la place
create or replace function chat_join(p_lon float8, p_lat float8) returns json
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_me(); b timestamptz; r int; lo float8; la float8;
begin
  b := _chat_ban_until(u);
  if b = 'infinity'::timestamptz then raise exception 'Vous êtes banni du chat.'; end if;
  if b is not null then raise exception 'Vous êtes banni du chat jusqu''au %', to_char(b at time zone 'Europe/Paris', 'DD/MM à HH24"h"MI'); end if;
  lo := least(2.3050, greatest(2.2920, coalesce(p_lon, 2.2985)));
  la := least(48.8600, greatest(48.8500, coalesce(p_lat, 48.8556)));
  delete from place_people where seen < now() - interval '90 seconds';
  select room into r from place_people where user_id = u;
  if r is null then
    select min(g) into r from generate_series(1, (select coalesce(max(room), 0) + 1 from place_people)) g
      where (select count(*) from place_people x where x.room = g) < 80;   -- 80 par salle (20/10/2026 : tout le Champ-de-Mars est ouvert)
  end if;
  insert into place_people(user_id, room, lon, lat, seen) values (u, r, lo, la, now())
    on conflict (user_id) do update set room = excluded.room, lon = excluded.lon, lat = excluded.lat, seen = now();
  perform _chat_emit(r, u, 'join', _chat_person(u));
  return json_build_object('room', r, 'me', u, 'people', chat_people(), 'last', coalesce((select max(id) from chat_msg where room = r), 0), 'admin', is_admin());
end $$;

-- ===== migration_ruban.sql =====
-- =====================================================================
--  Les cartes aux couleurs du parti qui en possède le plus (20/10/2026, choix du propriétaire : le « ruban »).
--  map_state() renvoie en plus, pour chaque carte, le parti qui y a le plus de logements (ou de parts) ;
--  personne si aucun propriétaire n'a de parti, ou s'il y a égalité en tête. Rejouable sans risque.
-- =====================================================================
create or replace function map_state() returns json language sql stable security definer set search_path = public as $$
  with lp as (select l.card, p.party, count(*)::numeric n from lots l join profiles p on p.id = l.owner where p.party is not null group by l.card, p.party),
       pp as (select x.card, p.party, sum(x.n)::numeric n from parts x join profiles p on p.id = x.owner where p.party is not null group by x.card, p.party),
       u as (select card, party, n, max(n) over (partition by card) mx from (select * from lp union all select * from pp) a),
       dom as (select card, case when count(*) filter (where n = mx) = 1 then min(party) filter (where n = mx) end party from u group by card)
  select json_build_object(
    'lots',  coalesce((select json_agg(json_build_array(x.card, x.owners, x.n, d.party)) from
               (select card, array_agg(distinct owner) owners, count(*) n from lots group by card) x left join dom d on d.card = x.card), '[]'),
    'parts', coalesce((select json_agg(json_build_array(y.card, y.owners, y.n, d.party)) from
               (select card, array_agg(owner) owners, sum(n) n from parts group by card) y left join dom d on d.card = y.card), '[]'),
    'sale',  coalesce((select json_agg(distinct card) from listings), '[]'),
    'arr',   coalesce((select json_agg(json_build_array(s.arr, s.mayor, s.party, p.pseudo)) from arr_state s left join profiles p on p.id=s.mayor), '[]'))
$$;
grant execute on function map_state() to anon, authenticated;

-- ===== migration_lieux.sql =====
--  Les lieux, deuxième vague (gares, ponts, cimetières, monuments, immeubles célèbres nommés) : ici la liste des lieux et les noms ;
--  les cartes et les liens du dé viennent de cards.json et edges.json (/api/seed).
-- la liste des lieux (pour une base neuve : les cartes et les liens viennent de cards.json et edges.json)
insert into spots(card, kind, lines) values
(1578,'m',array['1','4','7','11','14']),
(1579,'m',array['4']),
(1580,'m',array['4']),
(1581,'m',array['1']),
(1582,'m',array['1','7']),
(1583,'m',array['7']),
(1584,'m',array['7','14']),
(1585,'m',array['1']),
(101896,'m',array['3']),
(101897,'m',array['3']),
(101898,'m',array['3','4']),
(101899,'m',array['3']),
(101900,'m',array['4','8','9']),
(202033,'m',array['3','11']),
(202034,'m',array['8']),
(202035,'m',array['8']),
(202036,'m',array['11']),
(202037,'m',array['3','5','8','9','11']),
(202038,'m',array['8']),
(202039,'m',array['3']),
(301901,'m',array['4']),
(301902,'m',array['1','11']),
(301903,'m',array['7']),
(301904,'m',array['1']),
(301905,'m',array['7']),
(402728,'m',array['10']),
(402729,'m',array['7']),
(402730,'m',array['10']),
(402731,'m',array['7','10']),
(402732,'m',array['10']),
(402733,'m',array['7']),
(502588,'m',array['10']),
(502589,'m',array['12']),
(502590,'m',array['4','10']),
(502591,'m',array['12']),
(502592,'m',array['4']),
(502593,'m',array['4']),
(502594,'m',array['4']),
(502595,'m',array['4']),
(602929,'m',array['12']),
(602930,'m',array['10','13']),
(602931,'m',array['8']),
(602932,'m',array['8','13']),
(602933,'m',array['8']),
(602934,'m',array['12']),
(602935,'m',array['13']),
(602936,'m',array['10','12']),
(602937,'m',array['12']),
(602938,'m',array['10']),
(602939,'m',array['13']),
(703297,'m',array['9']),
(703298,'m',array['1','13']),
(703299,'m',array['1','2','6']),
(703300,'m',array['1','8','12']),
(703301,'m',array['2']),
(703302,'m',array['3']),
(703303,'m',array['1','9']),
(703304,'m',array['1']),
(703305,'m',array['13']),
(703306,'m',array['8','12','14']),
(703307,'m',array['9','13']),
(703308,'m',array['2']),
(703309,'m',array['9']),
(703310,'m',array['3','12','13','14']),
(703311,'m',array['9']),
(703312,'m',array['2']),
(803146,'m',array['2']),
(803147,'m',array['7']),
(803148,'m',array['7','9']),
(803149,'m',array['8','9']),
(803150,'m',array['3','9']),
(803151,'m',array['7']),
(803152,'m',array['12']),
(803153,'m',array['3','7','8']),
(803154,'m',array['2','12']),
(803155,'m',array['7']),
(803156,'m',array['8','9']),
(803157,'m',array['12']),
(803158,'m',array['12']),
(902918,'m',array['2','4']),
(902919,'m',array['8','9']),
(902920,'m',array['4']),
(902921,'m',array['7']),
(902922,'m',array['2']),
(902923,'m',array['4','5','7']),
(902924,'m',array['4','5']),
(902925,'m',array['5']),
(902926,'m',array['7','7bis']),
(1004561,'m',array['2']),
(1004562,'m',array['2']),
(1004563,'m',array['5']),
(1004564,'m',array['9']),
(1004565,'m',array['2']),
(1004566,'m',array['8']),
(1004567,'m',array['11']),
(1004568,'m',array['8']),
(1004569,'m',array['2']),
(1004570,'m',array['5','9']),
(1004571,'m',array['3']),
(1004572,'m',array['5']),
(1004573,'m',array['9']),
(1004574,'m',array['3']),
(1004575,'m',array['9']),
(1004576,'m',array['9']),
(1103959,'m',array['1','5','8']),
(1103960,'m',array['6']),
(1103961,'m',array['6','14']),
(1103962,'m',array['14']),
(1103963,'m',array['6','8']),
(1103964,'m',array['6']),
(1103965,'m',array['1','14']),
(1103966,'m',array['8']),
(1103967,'m',array['8']),
(1103968,'m',array['1','2','6','9']),
(1103969,'m',array['6']),
(1103970,'m',array['8']),
(1103971,'m',array['8']),
(1103972,'m',array['5']),
(1103973,'m',array['1','8']),
(1204454,'m',array['14']),
(1204455,'m',array['5']),
(1204456,'m',array['6']),
(1204457,'m',array['6']),
(1204458,'m',array['5','10']),
(1204459,'m',array['6']),
(1204460,'m',array['7']),
(1204461,'m',array['7','14']),
(1204462,'m',array['6']),
(1204463,'m',array['14']),
(1204464,'m',array['5','6','7']),
(1204465,'m',array['7']),
(1204466,'m',array['7']),
(1204467,'m',array['7']),
(1204468,'m',array['6']),
(1204469,'m',array['5']),
(1204470,'m',array['7']),
(1304770,'m',array['4']),
(1304771,'m',array['4','6']),
(1304772,'m',array['6']),
(1304773,'m',array['13']),
(1304774,'m',array['4']),
(1304775,'m',array['13']),
(1304776,'m',array['13']),
(1304777,'m',array['4']),
(1304778,'m',array['13']),
(1304779,'m',array['4','6']),
(1304780,'m',array['6']),
(1304781,'m',array['4']),
(1406557,'m',array['10']),
(1406558,'m',array['8']),
(1406559,'m',array['6']),
(1406560,'m',array['8']),
(1406561,'m',array['6']),
(1406562,'m',array['10']),
(1406563,'m',array['8']),
(1406564,'m',array['12']),
(1406565,'m',array['6']),
(1406566,'m',array['12']),
(1406567,'m',array['8']),
(1406568,'m',array['10']),
(1406569,'m',array['6','8','10']),
(1406570,'m',array['8']),
(1406571,'m',array['4','6','12','13']),
(1406572,'m',array['6','12']),
(1406573,'m',array['12']),
(1406574,'m',array['10']),
(1406575,'m',array['6']),
(1406576,'m',array['12']),
(1406577,'m',array['12']),
(1506816,'m',array['1']),
(1506817,'m',array['6']),
(1506818,'m',array['10']),
(1506819,'m',array['10']),
(1506820,'m',array['9']),
(1506821,'m',array['9']),
(1506822,'m',array['9']),
(1506823,'m',array['6']),
(1506824,'m',array['9']),
(1506825,'m',array['9','10']),
(1506826,'m',array['9','10']),
(1506827,'m',array['10']),
(1506828,'m',array['6']),
(1506829,'m',array['10']),
(1506830,'m',array['2']),
(1506831,'m',array['9']),
(1506832,'m',array['1']),
(1506833,'m',array['9']),
(1506834,'m',array['9']),
(1506835,'m',array['6','9']),
(1506836,'m',array['2']),
(1606046,'m',array['13']),
(1606047,'m',array['13']),
(1606048,'m',array['3']),
(1606049,'m',array['3']),
(1606050,'m',array['14']),
(1606051,'m',array['3']),
(1606052,'m',array['13','14']),
(1606053,'m',array['13']),
(1606054,'m',array['2']),
(1606055,'m',array['2','3']),
(1606056,'m',array['3']),
(1706091,'m',array['12']),
(1706092,'m',array['2']),
(1706093,'m',array['4']),
(1706094,'m',array['13']),
(1706095,'m',array['12']),
(1706096,'m',array['2']),
(1706097,'m',array['12']),
(1706098,'m',array['4','12']),
(1706099,'m',array['12']),
(1706100,'m',array['2','13']),
(1706101,'m',array['4']),
(1706102,'m',array['12']),
(1706103,'m',array['4']),
(1804259,'m',array['7bis']),
(1804260,'m',array['7bis']),
(1804261,'m',array['7bis']),
(1804262,'m',array['7']),
(1804263,'m',array['7']),
(1804264,'m',array['7bis']),
(1804265,'m',array['2','5','7bis']),
(1804266,'m',array['5']),
(1804267,'m',array['5']),
(1804268,'m',array['7bis','11']),
(1804269,'m',array['7']),
(1804270,'m',array['5']),
(1804271,'m',array['7bis']),
(1804272,'m',array['7']),
(1804273,'m',array['2','5','7']),
(1905308,'m',array['2','11']),
(1905309,'m',array['9']),
(1905310,'m',array['3','3bis']),
(1905311,'m',array['11']),
(1905312,'m',array['9']),
(1905313,'m',array['3bis']),
(1905314,'m',array['2','3']),
(1905315,'m',array['2']),
(1905316,'m',array['3']),
(1905317,'m',array['9']),
(1905318,'m',array['1']),
(1905319,'m',array['3bis','11']),
(1905320,'m',array['11']),
(1905321,'m',array['3bis']),
(1905322,'m',array['11']),
(1586,'j',null),
(502596,'j',null),
(602940,'j',null),
(1804274,'j',null),
(703313,'j',null),
(402734,'j',null),
(1304782,'j',null),
(1804275,'j',null),
(1406578,'j',null),
(1103974,'j',null),
(1587,'j',null),
(1588,'j',null),
(1905323,'j',null),
(1103975,'j',null),
(1406579,'j',null),
(602941,'j',null),
(1506837,'j',null),
(1506838,'b',null),
(1103976,'b',null),
(703314,'p',null),
(1506839,'p',null),
(301906,'p',null),
(1103977,'p',null),
(202040,'p',null),
(1606057,'p',null),
(1589,'p',null),
(1706104,'p',null),
(1103978,'p',null),
(1204471,'p',null),
(101901,'p',null),
(101902,'p',null),
(1590,'p',null),
(502597,'p',null),
(1591,'p',null),
(703315,'p',null),
(301907,'p',null),
(803159,'p',null),
(402735,'p',null),
(402736,'p',null),
(502598,'p',null),
(301908,'p',null),
(1304783,'p',null),
(1606058,'p',null),
(1706105,'p',null),
(902927,'c',null),
(703316,'a',null),
(1905324,'k',null),
(1304784,'k',null),
(1706106,'k',null),
(1506840,'k',null),
(1103979,'k',null),
(1606059,'k',null),
(1406580,'g',null),
(902928,'g',null),
(1103980,'g',null),
(1804276,'o',null),
(1103981,'o',null),
(402737,'o',null),
(301909,'o',null),
(1204472,'o',null),
(1506841,'o',null),
(1592,'o',null),
(1103982,'o',null),
(602942,'o',null),
(1506842,'j',null),
(1103983,'j',null),
(1506843,'j',null),
(1506844,'j',null),
(1506845,'j',null),
(1103984,'j',null),
(1804277,'c',null),
(1593,'n',null),
(602943,'n',null),
(1594,'n',null),
(602944,'n',null),
(1406581,'n',null),
(1406582,'n',null),
(602945,'n',null),
(602946,'n',null),
(301910,'n',null),
(301911,'n',null),
(301912,'n',null),
(1103985,'n',null),
(402738,'n',null),
(301913,'n',null),
(703317,'n',null),
(602947,'n',null),
(301914,'n',null),
(301915,'n',null),
(301916,'n',null),
(1595,'n',null),
(301917,'n',null),
(1204473,'n',null),
(402739,'n',null),
(1103986,'n',null),
(301918,'n',null),
(1596,'n',null),
(301919,'n',null),
(1506846,'n',null),
(1204474,'n',null),
(1406583,'n',null),
(1103987,'n',null),
(1204475,'n',null),
(1506847,'n',null)
on conflict (card) do update set kind = excluded.kind, lines = excluded.lines;
update cards set title = 'Bibliothèque nationale de France' where id = 1202667;
update cards set title = 'Parc des Princes' where id = 1506606;
update cards set title = 'Stade Roland-Garros' where id = 1506797;
update cards set title = 'Musée des Arts et Métiers' where id = 200003;
update cards set title = 'Palais de Tokyo' where id = 1502073;
update cards set title = 'Hôtel de Matignon' where id = 601996;
update cards set title = 'Musée Grévin' where id = 800984;
update cards set title = 'Palais de Chaillot' where id = 1506634;
update cards set title = 'Institut de France' where id = 500022;
update cards set title = 'Bibliothèque Sainte-Geneviève' where id = 402237;
update cards set title = 'Maxim''s' where id = 700013;
update cards set title = 'Stade Jean-Bouin' where id = 1506743;
update cards set title = 'Le Dôme' where id = 1304328;
update cards set title = 'Maison de Balzac' where id = 1504365;
update cards set title = 'Hôpital Lariboisière' where id = 901729;
update cards set title = 'La Tour d''Argent' where id = 400590;
update cards set title = 'Piscine Molitor' where id = 1506742;
update cards set title = 'Palais de la Découverte' where id = 701535;
update cards set title = 'Palais de la Légion d''honneur' where id = 602760;
update cards set title = 'Café de la Paix' where id = 800620;
update cards set title = 'Institut du monde arabe' where id = 400382;
update cards set title = 'Collège de France' where id = 402726;
update cards set title = 'École normale supérieure' where id = 401664;
update cards set title = 'Conservatoire national des arts et métiers' where id = 200920;
update cards set title = 'Institut Pasteur' where id = 1405018;
update cards set title = 'Les Deux Magots' where id = 501212;
