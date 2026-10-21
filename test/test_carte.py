"""La carte des autres sans tout recharger (migration_carte_delta.sql) : map_delta ne renvoie que ce qui a changé depuis le
curseur ; les remboursements de crédit et les hypothèques ne comptent pas ; une transaction encore en cours est rattrapée ;
map_state rend la même chose qu'avant ; les tables ne sont plus publiées en temps réel ; un achat prévient le carré du bien."""
import sys, uuid, json; sys.path.insert(0, 'test'); import db
R = []
def check(n, ok, info=""): R.append(bool(ok)); print(("PASS " if ok else "FAIL ") + n + (f"  · {info}" if info != "" else ""), flush=True)
def err(f):
    try: f(); return None
    except Exception as e: return str(e).split("\n")[0]
def player(name, party=None):
    u = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(u)); db.rpc(u, "join_game", p_pseudo=name + str(u)[:4], p_party=party); return u

c0 = db.conn(); cur = c0.cursor()
cur.execute("""create schema if not exists realtime;
  create table if not exists realtime.sent(payload jsonb, event text, topic text, private boolean, at timestamptz default clock_timestamp());
  create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as
  $$ insert into realtime.sent(payload, event, topic, private) values (payload, event, topic, private) $$;
  do $$ begin if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if; end $$;""")
cur.execute("""do $$ declare t text; begin foreach t in array array['lots', 'parts', 'listings', 'news', 'arr_state'] loop
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
    execute format('alter publication supabase_realtime add table public.%I', t); end if; end loop; end $$""")
c0.commit()
for f in ["migration_ruban.sql", "migration_carte_delta.sql", "migration_carte_delta.sql"]:   # la dernière 2 fois : rejouable
    cur.execute(open("supabase/" + f).read())
c0.commit()
pub = db.sql("select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('lots','parts','listings','news','arr_state')")
check("lots, parts, listings, news, arr_state ne partent plus en temps réel à tous les joueurs", pub == [], pub)

# map_state : la même réponse qu'avant (l'ancienne version de migration_ruban.sql, recopiée ici)
cur.execute("""create or replace function pg_temp.old_map_state() returns json language sql stable as $$
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
    'arr',   coalesce((select json_agg(json_build_array(s.arr, s.mayor, s.party, p.pseudo)) from arr_state s left join profiles p on p.id=s.mayor), '[]')) $$""")

A, B = player("Ana", "valeurs"), player("Ben", "poing")
cards = [r[0] for r in db.sql("select id from cards where lk='l' and lots between 3 and 8 and cx is not null and id not in (select card from lots) and id not in (select card from listings) order by id limit 4")]
g, h, g2, g3 = cards
pc = db.sql("select id from cards where lk='p' and cx is not null and id not in (select card from parts) order by id limit 1")[0][0]
db.sql("insert into lots(card,k,owner) values (%s,0,%s),(%s,1,%s),(%s,0,%s)", g, str(A), g, str(B), h, str(A))
db.sql("insert into parts(card,owner,n) values (%s,%s,3)", pc, str(B))
db.sql("insert into listings(seller,card,k,n,price) values (%s,%s,0,1,999000)", str(A), h)

def canon(m):
    lots = sorted((r[0], tuple(sorted(r[1])), int(r[2]), r[3]) for r in m["lots"])
    parts = sorted((r[0], tuple(sorted(r[1])), int(r[2]), r[3]) for r in m["parts"])
    return lots, parts, sorted(m["sale"]), sorted((r[0], r[1], r[2], r[3]) for r in m["arr"])
cur.execute("select pg_temp.old_map_state()"); old = cur.fetchone()[0]; c0.commit()
new = db.rpc(A, "map_state")
check("map_state : la même réponse qu'avant (logements, parts, à vendre, maires), plus le curseur v", canon(old) == canon(new) and new.get("v"), (len(old["lots"]), len(new["lots"])))

full = db.rpc(A, "map_delta", p_since=None)
check("map_delta sans curseur : toute la carte, comme map_state", full["full"] is True and canon(full) == canon(new) and full["v"])
v = full["v"]
d = db.rpc(A, "map_delta", p_since=v)
check("rien n'a changé : réponse vide (pas de carte, pas de maire)", d["cards"] == [] and d["lots"] == [] and d["arr"] is None and "full" not in d, d)

# un achat : seulement cette carte
db.sql("insert into lots(card,k,owner) values (%s,0,%s)", g2, str(A))
d = db.rpc(A, "map_delta", p_since=v)
row = [r for r in d["lots"] if r[0] == g2]
check("un achat : seulement cette carte, avec son propriétaire et le parti qui domine", d["cards"] == [g2] and row and row[0][1] == [str(A)] and row[0][2] == 1 and row[0][3] == "valeurs", d)
v = d["v"]
check("… et la fois d'après, plus rien", db.rpc(A, "map_delta", p_since=v)["cards"] == [])

# remboursement de crédit, hypothèque : rien ne change sur la carte, rien n'est renvoyé
db.sql("update lots set loan = 123456 where card = %s and k = 0", g2); db.sql("update lots set loan = null where card = %s", g2)
db.sql("update lots set mort = 1000, mort_at = now() where card = %s", h); db.sql("update parts set loan = 777 where card = %s", pc)
db.rpc(A, "state")   # _sync : rembourse les crédits à chaque action
check("crédits remboursés, hypothèques, loyers : rien n'est renvoyé (avant : un message à chaque joueur connecté)", db.rpc(A, "map_delta", p_since=v)["cards"] == [])

# une annonce, puis retirée ; un logement qui change de main ; un logement rendu ; des parts
db.sql("insert into listings(seller,card,k,n,price) values (%s,%s,0,1,500000)", str(A), g2)
d = db.rpc(A, "map_delta", p_since=v); v = d["v"]
check("mis en vente : la carte revient avec « à vendre »", d["cards"] == [g2] and d["sale"] == [g2], d)
db.sql("delete from listings where card = %s", g2)
d = db.rpc(A, "map_delta", p_since=v); v = d["v"]
check("annonce retirée : la carte revient, plus à vendre (le site efface ce qu'il savait d'elle)", d["cards"] == [g2] and d["sale"] == [], d)
db.sql("update lots set owner = %s where card = %s and k = 0", str(B), g2)
d = db.rpc(A, "map_delta", p_since=v); v = d["v"]
row = [r for r in d["lots"] if r[0] == g2]
check("un logement change de main : son nouveau propriétaire et son parti", row and row[0][1] == [str(B)] and row[0][3] == "poing", d)
db.sql("delete from lots where card = %s", g2)
d = db.rpc(A, "map_delta", p_since=v); v = d["v"]
check("plus personne : la carte revient sans logement (redevenue libre)", d["cards"] == [g2] and d["lots"] == [], d)
db.sql("update parts set n = 5 where card = %s", pc)
d = db.rpc(A, "map_delta", p_since=v); v = d["v"]
check("des parts en plus : la carte revient avec le nouveau nombre", d["cards"] == [pc] and d["parts"][0][2] == 5, d)

# changer de parti : le ruban de ses cartes
db.sql("update profiles set party = 'milieu' where id = %s", str(B))
d = db.rpc(A, "map_delta", p_since=v); v = d["v"]
check("un joueur change de parti : ses cartes reviennent (le ruban change)", set(d["cards"]) == {g, pc} and [r[3] for r in d["parts"] if r[0] == pc] == ["milieu"], d["cards"])

# un nouveau maire
db.sql("insert into arr_state(arr, mayor, party) values (19, %s, 'valeurs') on conflict (arr) do update set mayor = excluded.mayor, party = excluded.party", str(A))
d = db.rpc(A, "map_delta", p_since=v); v = d["v"]
check("un nouveau maire : seulement son arrondissement", d["arr"] and [r[0] for r in d["arr"]] == [19] and d["arr"][0][1] == str(A), d["arr"])
db.sql("update profiles set pseudo = %s where id = %s", "Ana2" + str(A)[:4], str(A))
d = db.rpc(A, "map_delta", p_since=v); v = d["v"]
check("le maire change de pseudo : ses arrondissements reviennent", d["arr"] and 19 in [r[0] for r in d["arr"]] and d["cards"] == [], d)

# une transaction pas encore finie quand on demande : rattrapée à la question suivante
t = db.conn(); tc = t.cursor(); tc.execute("insert into lots(card,k,owner) values (%s,0,%s)", (g3, str(A)))
d1 = db.rpc(A, "map_delta", p_since=v)
t.commit(); t.close()
d2 = db.rpc(A, "map_delta", p_since=d1["v"])
check("un achat qui finit pendant qu'on demande : pas encore vu, puis rattrapé (rien n'est perdu)", g3 not in d1["cards"] and g3 in d2["cards"], (d1["cards"], d2["cards"]))
v = d2["v"]

# beaucoup de changements d'un coup : toute la carte
db.sql("insert into map_dirty(card, x) select -i, pg_current_xact_id() from generate_series(1, 2100) i")
d = db.rpc(A, "map_delta", p_since=v)
check("plus de 2 000 cartes changées : toute la carte d'un coup", d.get("full") is True and canon(d) == canon(db.rpc(A, "map_state")))
db.sql("delete from map_dirty where card < 0")
check("un curseur abîmé : toute la carte", db.rpc(A, "map_delta", p_since="pas un nombre").get("full") is True)

# ceux qui regardent le carré du bien l'apprennent tout de suite (une seule fois par transaction et par carte)
db.sql("truncate realtime.sent")
g4 = db.sql("select id from cards where lk='l' and lots >= 3 and cx is not null and id not in (select card from lots) order by id desc limit 1")[0][0]
db.sql("insert into lots(card,k,owner) values (%s,0,%s),(%s,1,%s),(%s,2,%s)", g4, str(A), g4, str(A), g4, str(A))
cell = db.sql("select _wcell(cx / 1e5, cy / 1e5) from cards where id = %s", g4)[0][0]
ev = db.sql("select topic, payload from realtime.sent where payload->>'k' = 'map'")
check("un achat prévient le carré du bien (évènement « map »), une seule fois pour 3 logements", len(ev) == 1 and ev[0][0] == f"w:{cell}" and ev[0][1]["d"]["g"] == g4, ev)
db.sql("update lots set loan = 5 where card = %s", g4)
check("… pas un remboursement de crédit", len(db.sql("select 1 from realtime.sent where payload->>'k' = 'map'")) == 1)

# droits : les joueurs ne touchent pas aux tables ni aux fonctions internes
def as_role(role, q):
    c = db.conn(); k = c.cursor()
    try: k.execute(f"set role {role}"); k.execute(q); return "ok"
    except Exception as e: return str(e).split("\n")[0]
    finally: c.rollback(); c.close()
check("les joueurs ne lisent pas map_dirty directement", "permission" in as_role("authenticated", "select * from map_dirty"))
check("les fonctions internes _map_* sont interdites aux joueurs", "permission" in as_role("authenticated", "select _map_cards(null)"))
check("map_delta est ouverte (comme map_state)", as_role("anon", "select map_delta(null)") == "ok")

# nettoyage
db.sql("delete from listings where card in (%s,%s)", h, g2); db.sql("delete from lots where card = any(%s)", [g, h, g2, g3, g4]); db.sql("delete from parts where card = %s", pc)
print(f"\n{sum(R)}/{len(R)} tests OK"); sys.exit(0 if all(R) else 1)
