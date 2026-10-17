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
