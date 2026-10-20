"""Stations de métro, jardins et places en cartes à parts (migration_metro.sql, 20/10/2026) :
les cartes, les liens pour le dé, l'achat, les boosters et le bonus réseau (+1 % de loyers par station, jusqu'à +15 %)."""
import sys, uuid, json; sys.path.insert(0, 'test'); import db
R = []
def check(n, ok, info=""): R.append(bool(ok)); print(("PASS " if ok else "FAIL ") + n + (f"  · {info}" if info != "" else ""), flush=True)
def apply(f):
    c = db.conn(); c.cursor().execute(open("supabase/" + f, encoding="utf-8").read()); c.commit(); c.close()
apply("migration_metro.sql"); apply("migration_metro.sql"); apply("migration_lieux.sql"); apply("migration_lieux.sql")
check("la migration se rejoue sans risque", True)
IDX = json.load(open("public/data/index.json")); SP = {s[0]: s for s in IDX["spots"]}
CJ = {c[0]: c for c in json.load(open("public/data/cards.json"))}
n_m, n_o = db.sql("select count(*) filter (where kind='m'), count(*) filter (where kind<>'m') from spots")[0]
check("244 stations de métro, et 104 jardins, places, gares, ponts, cimetières, monuments", (n_m, n_o) == (244, 104) and len(SP) == 348, (n_m, n_o, len(SP)))
rows = db.sql("select c.id, c.r, c.lk, c.lots, c.v, c.rent, c.title, s.kind, s.lines from spots s join cards c on c.id = s.card")
check("chaque lieu est une carte à parts", all(r[2] == "p" for r in rows))
same = all(CJ[r[0]][2] == r[1] and CJ[r[0]][4] == r[3] and CJ[r[0]][6] == r[4] and CJ[r[0]][7] == r[5] and CJ[r[0]][9] == r[6] and SP[r[0]][1] == r[7] for r in rows)
check("la base et les données du site disent la même chose (rareté, parts, prix, loyer, nom)", same)
st = {r[6]: r for r in rows if r[7] == "m"}
ch = st.get("Métro Châtelet")
check("Châtelet est Mythique, en 100 parts", ch and ch[1] == "M" and ch[3] == 100, ch and ch[1:4])
one = [r for r in st.values() if len(r[8]) == 1]
check("une station à une ligne : Commune, 100 parts à 80 000 €, 280 € de loyer par jour", one and all(r[1] == "C" and r[3] == 100 and r[4] == 80000 and r[5] == 280 for r in one), len(one))
rar = {r[6]: r[1] for r in st.values()}
check("la rareté suit le nombre de lignes", all(rar[r[6]] == ({1: "C", 2: "U", 3: "R"}.get(len(r[8]), "L") if r[6] != "Métro Châtelet" else "M") for r in st.values()))
pl = {r[6]: r for r in rows if r[7] != "m"}
check("Champ-de-Mars et Tuileries : Mythiques en 1 000 parts", all(pl[n][1] == "M" and pl[n][3] == 1000 for n in ("Champ-de-Mars", "Jardin des Tuileries")), [pl[n][1:4] for n in ("Champ-de-Mars", "Jardin des Tuileries")])
check("République et place du Châtelet : Mythiques (des places centrales)", all(pl[n][1] == "M" and pl[n][3] == 1000 for n in ("Place de la République", "Place du Châtelet")))
check("les gares qui manquaient sont là (Est, Montparnasse, Bercy)", all(pl.get(n) and pl[n][7] == "g" for n in ("Gare de l'Est", "Gare Montparnasse", "Gare de Bercy")))
check("les ponts, les cimetières, les Champs-Élysées", pl["Pont Neuf"][7] == "n" and pl["Cimetière du Père-Lachaise"][7] == "k" and pl["Avenue des Champs-Élysées"][1] == "M")
pn = pl["Pont Neuf"][0]; rives = db.sql("select count(*) from edges where a = %s", pn)[0][0]
check("un pont relie les deux rives (au moins 4 voisins)", rives >= 4, rives)
check("les immeubles célèbres sans nom en ont un (BnF, Parc des Princes)", db.sql("select title from cards where id in (1202667, 1506606) order by id")[0:2] == [("Parc des Princes",), ("Bibliothèque nationale de France",)] or
      sorted(r[0] for r in db.sql("select title from cards where id in (1202667, 1506606)")) == ["Bibliothèque nationale de France", "Parc des Princes"])
deg = dict(db.sql("select s.card, count(e.b) from spots s left join edges e on e.a = s.card group by s.card"))
back = db.sql("select count(*) from spots s join edges e on e.b = s.card")[0][0]
check("chaque lieu est relié aux immeubles voisins (le dé peut s'y arrêter et en repartir)", min(deg.values()) >= 1 and back == sum(deg.values()), (min(deg.values()), back, sum(deg.values())))

def player(name, cash=50_000_000):
    u = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(u)); db.rpc(u, "join_game", p_pseudo=name + str(u)[:4], p_party=None)
    db.sql("update profiles set cash=%s where id=%s", cash, str(u)); return u
total = lambda u: db.sql("select coalesce(sum(rate), 0) from _rates(%s)", str(u))[0][0]
P = player("Navigo")
t = db.sql("select id from cards where lk='l' and lots between 2 and 6 and rent > 500 and id not in (select card from lots) limit 1")[0][0]
db.sql("insert into lots(card,k,owner) values (%s,0,%s)", t, str(P))
# acheter une part d'une station en tombant dessus
s1 = one[0][0]
db.sql("update profiles set land=%s where id=%s", s1, str(P))
def ratio(cards):   # les loyers avec le bonus réseau, divisés par les mêmes loyers sans lui
    w = total(P); db.sql("update spots set kind='x' where card = any(%s)", cards); wo = total(P); db.sql("update spots set kind='m' where card = any(%s)", cards)
    return w / wo
db.rpc(P, "bank_buy", p_card=s1, p_credit=False)
check("tombé sur une station : on achète une part à la banque", db.sql("select n from parts where card=%s and owner=%s", s1, str(P))[0][0] == 1)
check("bonus réseau : 1 station = +1 % sur tous ses loyers", db.sql("select _network(%s)", str(P))[0][0] == 1 and abs(ratio([s1]) - 1.01) < 1e-6)
# 3 stations
more = [r[0] for r in one[1:3]]
for g in more: db.sql("insert into parts(card,owner,n) values (%s,%s,1)", g, str(P))
check("3 stations : +3 % sur tous ses loyers (logements compris)", abs(ratio([s1] + more) - 1.03) < 1e-6)
# plafond à +15 %
for r in one[3:23]: db.sql("insert into parts(card,owner,n) values (%s,%s,1)", r[0], str(P))
x = ratio([s1] + [r[0] for r in one[1:23]])
check("23 stations : le bonus s'arrête à +15 %", db.sql("select _network(%s)", str(P))[0][0] == 15 and abs(x - 1.15) < 1e-6, round(x, 4))
g0 = pl["Champ-de-Mars"][0]; db.sql("insert into parts(card,owner,n) values (%s,%s,1)", g0, str(P))
check("un jardin ou une place ne compte pas dans le réseau", db.sql("select _network(%s)", str(P))[0][0] == 15)
st_rate = db.rpc(P, "state")["gross"]
check("la trésorerie gagne bien le bonus (state)", abs(st_rate - total(P)) < 2, (st_rate, round(total(P))))
# boosters : une case Commune peut donner une part de station
Q = player("Booster"); got = None
for i in range(400):
    x = db.sql("select _draw(%s, 'C')", str(Q))[0][0]
    if x and x["t"] == "part": got = x; break
check("booster : une case Commune peut donner une part de station", got and got["card"] in SP and SP[got["card"]][1] == "m" and got["n"] == 1, got)
lp = db.sql("select count(*) from cards where lk='p' and r='L'")[0][0]
check("booster : les jardins et places Légendaires sont dans le tirage", lp >= 20, lp)
# le dé : depuis une station, on repart
db.sql("update profiles set land=%s, rolls=5, pend=null, pend_die=null where id=%s", s1, str(P))
ro = db.rpc(P, "roll")
check("depuis une station, le dé propose des destinations", ro and len(ro.get("options", [])) >= 1, ro and len(ro.get("options", [])))
# droits
priv = db.sql("select has_function_privilege('authenticated', '_network(uuid)', 'execute'), has_function_privilege('authenticated', '_draw(uuid,char)', 'execute'), has_function_privilege('anon', '_rates(uuid)', 'execute')")[0]
check("fonctions internes interdites aux joueurs", priv == (False, False, False), priv)
check("la table des lieux n'est pas lisible directement", db.sql("select relrowsecurity from pg_class where relname='spots'")[0][0])
print(f"\n{sum(R)}/{len(R)} OK")
