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
  "fee":0.05, "mortRate":0.5, "mortDaily":0.005,
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

-- Verse les loyers dus depuis la dernière fois (appelé avant chaque action)
create or replace function _sync(p uuid) returns void language plpgsql as $$
#variable_conflict use_column
declare pr profiles; secs float8; x record; w city_week; net float8 := 0; t float8;
begin
  select * into pr from profiles where id=p for update;
  with d as (delete from pay where owner=p returning amount) select coalesce(sum(amount),0) into t from d;
  if t > 0 then update profiles set cash = cash + t::bigint where id=p; end if;
  secs := extract(epoch from (now() - pr.rent_at));
  if secs < 1 then return; end if;
  for x in select * from _rates(p) loop
    t := x.rate * x.tax * secs / 86400;
    net := net + x.rate * secs / 86400 - t;
    if t >= 1 then insert into pay(owner, amount, why) values (x.mayor, floor(t)::bigint, 'taxe'); end if;
  end loop;
  w := _week();
  if w.party is not null and w.party = pr.party then net := net + w.bonus * secs / 86400; end if;
  update profiles set cash = cash + floor(net)::bigint, rent_at = now() where id=p;
end $$;

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
  perform _sync(u);
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

-- Cartes Chance : appliquées immédiatement
create or replace function _chance(p uuid) returns jsonb language plpgsql as $$
#variable_conflict use_column
declare k text; pr profiles; val bigint; a bigint; h record; st text;
  keys text[] := array['heritage','impots','prime','fete','subv','loto','boom','booster','cle','tournage','pub',
                       'fisc','fonciere','notaire','amende','cambriolage','ravalement','degat','greve','ascenseur','termites','squat'];
  ws float8[] := array[8,10,8,8,6,1,3,4,5,4,4,  4,4,4,4,4,3,3,2,2,1,2];
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
    return jsonb_build_object('t','chance','k',k,'amount',a);
  end if;

  if k = 'booster' then update profiles set welcome = welcome + 1 where id=p; return jsonb_build_object('t','chance','k',k,'out','+1 booster'); end if;
  if k = 'cle' then
    extra := _draw(p, 'C');
    return jsonb_build_object('t','chance','k',k,'extra',extra);
  end if;
  if k = 'greve' then insert into fx(owner,kind,m,until) values (p,'all',0.8,now()+interval '24 hours'); return jsonb_build_object('t','chance','k',k); end if;

  -- cartes qui visent un de vos immeubles
  select l.card, l.k, c.arr, c.v, c.title into h from lots l join cards c on c.id=l.card where l.owner=p order by random() limit 1;
  if not found then return jsonb_build_object('t','chance','k',k,'out','Aucun bien concerné'); end if;
  select party into st from arr_state where arr=h.arr;
  case k
    when 'tournage'  then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,1.5,now()+interval '24 hours');
    when 'pub'       then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,1.3,now()+interval '24 hours');
    when 'ascenseur' then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,0.7,now()+interval '24 hours');
    when 'termites'  then insert into fx(owner,kind,card,m,until) values (p,'bld',h.card,0.6,now()+interval '48 hours');
    when 'degat'     then insert into fx(owner,kind,card,k,m,until) values (p,'lot',h.card,h.k,0,now()+interval '24 hours');
    when 'squat'     then insert into fx(owner,kind,card,k,m,until) values (p,'lot',h.card,h.k,0,now()+interval '48 hours');
    when 'cambriolage' then
      a := -30000; update profiles set cash = greatest(0, cash + a) where id=p;
      return jsonb_build_object('t','chance','k',k,'amount',a,'card',h.card);
    when 'ravalement' then
      a := -floor(h.v*0.01); update profiles set cash = greatest(0, cash + a) where id=p;
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
create or replace function bank_buy(p_card int, p_k int default null) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
-- Achat direct d'un logement libre (p_k null = le premier libre) ou d'une part de monument
declare u uuid := _need_me(); c cards; sold int; vk int;
begin
  perform _sync(u);
  select * into c from cards where id=p_card;
  if not found then raise exception 'Bien inconnu'; end if;
  perform 1 from profiles where id=u for update;
  if (select cash from profiles where id=u) < c.v then raise exception 'Trésorerie insuffisante'; end if;
  if c.lk = 'p' then
    perform 1 from cards where id=c.id for update;
    select coalesce(sum(n),0) into sold from parts where card=c.id;
    if sold >= c.lots then raise exception 'Plus de parts disponibles'; end if;
    insert into parts(card,owner,n) values (c.id,u,1) on conflict (card,owner) do update set n = parts.n + 1;
  else
    if p_k is null then
      select g into vk from generate_series(0, c.lots-1) g where not exists (select 1 from lots where card=c.id and k=g) order by g limit 1;
      if vk is null then raise exception 'Plus aucun logement libre dans cet immeuble'; end if;
    else vk := p_k; end if;
    if vk < 0 or vk >= c.lots then raise exception 'Lot inconnu'; end if;
    insert into lots(card,k,owner) values (c.id,vk,u) on conflict do nothing;
    if not found then raise exception 'Ce logement vient d''être pris'; end if;
    if (select count(*) from lots where card=c.id and owner=u) = c.lots and c.lots > 1 then
      insert into news(kind, arr, card, actor) values ('title', c.arr, c.id, u);
    end if;
  end if;
  update profiles set cash = cash - c.v where id=u;
  perform _add_value(u, c.arr, c.v);
  perform _refresh_mayors(array[c.arr::int]);
  return state();
end $$;

-- Acheter un immeuble entier d'un coup (s'il est entièrement libre)
create or replace function buy_building(p_card int) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); c cards; total bigint;
begin
  perform _sync(u);
  select * into c from cards where id=p_card;
  if not found or c.lk = 'p' then raise exception 'Bien inconnu'; end if;
  if exists (select 1 from lots where card=c.id) then raise exception 'Une partie de cet immeuble appartient déjà à quelqu''un'; end if;
  total := c.v * c.lots;
  perform 1 from profiles where id=u for update;
  if (select cash from profiles where id=u) < total then raise exception 'Trésorerie insuffisante'; end if;
  begin
    insert into lots(card,k,owner) select c.id, g, u from generate_series(0,c.lots-1) g;
  exception when unique_violation then raise exception 'Un logement vient d''être pris, réessayez'; end;
  update profiles set cash = cash - total where id=u;
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
    select n into have from parts where card=p_card and owner=u and mort is null;
    select coalesce(sum(n),0) into listed from listings where card=p_card and seller=u;
    if coalesce(have,0) - listed < greatest(1,p_n) then raise exception 'Pas assez de parts disponibles'; end if;
    insert into listings(seller,card,k,n,price) values (u,p_card,null,greatest(1,p_n),p_price);
  else
    if not exists (select 1 from lots where card=p_card and k=p_k and owner=u and mort is null) then raise exception 'Ce logement n''est pas à vous ou est hypothéqué'; end if;
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

create or replace function buy_listing(p_id bigint) returns json
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid := _need_me(); l listings; c cards; fee numeric; have int; mp text;
begin
  select * into l from listings where id=p_id for update;
  if not found then raise exception 'Annonce déjà vendue ou retirée'; end if;
  if l.seller = u then raise exception 'C''est votre annonce'; end if;
  perform _sync(u);
  select * into c from cards where id=l.card;
  if (select cash from profiles where id=u) < l.price then raise exception 'Trésorerie insuffisante'; end if;
  if l.k is not null then
    update lots set owner=u, at=now() where card=l.card and k=l.k and owner=l.seller and mort is null;
    if not found then delete from listings where id=p_id; raise exception 'Ce bien n''est plus disponible'; end if;
  else
    select n into have from parts where card=l.card and owner=l.seller and mort is null;
    if coalesce(have,0) < l.n then delete from listings where id=p_id; raise exception 'Ces parts ne sont plus disponibles'; end if;
    if have = l.n then delete from parts where card=l.card and owner=l.seller; else update parts set n=n-l.n where card=l.card and owner=l.seller; end if;
    insert into parts(card,owner,n) values (l.card,u,l.n) on conflict (card,owner) do update set n = parts.n + excluded.n;
  end if;
  select party into mp from arr_state where arr=c.arr;
  fee := (cfg()->>'fee')::numeric;
  update profiles set cash = cash - l.price where id=u;
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
    select x.n into n from parts x where card=p_card and owner=u and mort is null;
    if n is null then raise exception 'Rien à hypothéquer'; end if;
    delete from listings where card=p_card and seller=u;
    a := floor(c.v*n*(cfg()->>'mortRate')::numeric);
    update parts set mort=a, mort_at=now() where card=p_card and owner=u;
  else
    a := floor(c.v*(cfg()->>'mortRate')::numeric);
    update lots set mort=a, mort_at=now() where card=p_card and k=p_k and owner=u and mort is null;
    if not found then raise exception 'Rien à hypothéquer'; end if;
    delete from listings where card=p_card and k=p_k;
  end if;
  update profiles set cash = cash + a where id=u;
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
  update profiles set cash = cash - cost where id=u;
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
    'lots',  coalesce((select json_agg(json_build_array(card, k, mort, mort_at)) from lots where owner = auth.uid()), '[]'),
    'parts', coalesce((select json_agg(json_build_array(card, n, mort, mort_at)) from parts where owner = auth.uid()), '[]'),
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

-- Classement
create or replace function leaderboard() returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x), '[]') from (
    select p.id, p.pseudo, p.party,
           p.cash + coalesce((select sum(v) from arr_value a where a.owner=p.id),0)
                  - coalesce((select sum(mort) from lots l where l.owner=p.id),0)
                  - coalesce((select sum(mort) from parts t where t.owner=p.id),0) as worth,
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
  foreach f in array array['join_game(text,text)','set_party(text)','state()','open_booster(text)','bank_buy(int,int)','buy_building(int)',
    'list_item(int,int,int,bigint)','unlist(bigint)','buy_listing(bigint)','mortgage(int,int)','lift(int,int)',
    'map_state()','my_holdings()','building(int)','market()','feed()','leaderboard()','arr_info(int)'] loop
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
