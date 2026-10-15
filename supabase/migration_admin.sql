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
