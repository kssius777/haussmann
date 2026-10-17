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
