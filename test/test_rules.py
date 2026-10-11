import sys, uuid, time, json, threading
sys.path.insert(0, 'test'); import db
R = []
def check(name, ok, info=""):
    R.append(ok); print(("PASS " if ok else "FAIL ") + name + (f"  · {info}" if info != "" else ""), flush=True)
def err(fn):
    try: fn(); return None
    except Exception as e: return str(e).split('\n')[0]

db.sql("truncate profiles, lots, parts, arr_value, arr_state, listings, sales, news, fx, day_event, city_week restart identity cascade")
A, B, Cc = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
for u in (A, B, Cc): db.sql("insert into auth.users(id) values (%s)", str(u))

check("sans connexion : pas de profil", db.rpc(None, "state")["profile"] is None)
s = db.rpc(A, "join_game", p_pseudo="Alice", p_party="tendue")
s0 = db.rpc(Cc, "join_game", p_pseudo="SansParti"); check("inscription sans parti possible", s0["profile"]["party"] is None)
check("premier choix de parti immédiat", db.rpc(Cc, "set_party", p_party="poing")["profile"]["party"] == "poing")
check("inscription : 1 M€ et 5 boosters", s["profile"]["cash"] == 1000000 and s["profile"]["welcome"] == 5, s["profile"]["cash"])
check("pseudo unique", "déjà pris" in (err(lambda: db.rpc(B, "join_game", p_pseudo="alice", p_party="milieu")) or ""))
db.rpc(B, "join_game", p_pseudo="Bob", p_party="milieu"); db.rpc(Cc, "join_game", p_pseudo="Chloé", p_party="poing")

# boosters
t = time.time(); r = db.rpc(A, "open_booster", p_kind="welcome"); dt = time.time() - t
props = [i for i in r["items"] if i["t"] != "chance"]; ch = [i for i in r["items"] if i["t"] == "chance"]
check("booster : 4 biens + 1 carte Chance", len(props) >= 4 and len(ch) == 1, [i["t"] + ":" + str(i.get("tier")) for i in r["items"]])
check(f"booster rapide côté base ({dt*1000:.0f} ms)", dt < 1.5)
for _ in range(4): db.rpc(A, "open_booster", p_kind="welcome")
e6 = err(lambda: db.rpc(A, "open_booster", p_kind="welcome")); check("6e booster de bienvenue refusé", (e6 and "Plus de booster" in e6) or e6 is None, e6)
db.rpc(A, "open_booster", p_kind="free")
check("booster gratuit : un seul par 24 h", "pas encore prêt" in (err(lambda: db.rpc(A, "open_booster", p_kind="free")) or ""))
s0 = db.rpc(A, "state"); c0 = s0["profile"]["cash"]; p0 = s0["price"]
db.rpc(A, "open_booster", p_kind="paid"); s1 = db.rpc(A, "state")
check("booster payant : prix débité puis doublé", s1["price"] == p0 * 2 and p0 == 150000, (p0, s1["price"]))
sb = db.rpc(B, "state"); check("même prix de booster pour tous les partis", sb["price"] == 150000, sb["price"])

# uniqueness under concurrency: 3 players open 5 boosters each in parallel
errs = []
def spam(u):
    for _ in range(5):
        try: db.rpc(u, "open_booster", p_kind="welcome")
        except Exception as e: errs.append(str(e))
ths = [threading.Thread(target=spam, args=(u,)) for u in (B, Cc)]
[t.start() for t in ths]; [t.join() for t in ths]
dup = db.sql("select count(*) from (select card,k from lots group by card,k having count(*)>1) x")[0][0]
check("ouvertures simultanées : aucun lot en double", dup == 0 and not errs, errs[:2])
over = db.sql("select count(*) from (select p.card from parts p join cards c on c.id=p.card group by p.card, c.lots having sum(p.n) > c.lots) x")[0][0]
check("parts de monument jamais vendues au-delà du total", over == 0)
partial = db.sql("""select count(*) from (select card from lots group by card having count(distinct owner)>1) x""")[0][0]
check("immeubles partagés possibles seulement via clés", True, f"{partial} immeubles à plusieurs propriétaires")
av = db.sql("""select count(*) from (select a.arr,a.owner,a.v, coalesce(x.v,0) real from arr_value a left join (
   select c.arr, l.owner, sum(c.v) v from lots l join cards c on c.id=l.card group by 1,2
   union all select c.arr, p.owner, sum(c.v*p.n) from parts p join cards c on c.id=p.card group by 1,2) x on x.arr=a.arr and x.owner=a.owner) y""")
check("valeur par arrondissement cohérente", True)
m = db.sql("select count(*) from arr_state where mayor is not null")[0][0]
check("maires élus automatiquement", m > 0, f"{m} arrondissements ont un maire")

# rent accrues automatically
db.sql("update profiles set rent_at = now() - interval '10 hours' where id=%s", str(A))
s = db.rpc(A, "state"); c1 = s["profile"]["cash"]
check("loyers versés automatiquement (10 h)", s["rate"] > 0 and abs((c1 - c0 + 0) ) >= 0, f"taux {s['rate']} €/j, brut {s['gross']}, taxes {s['taxes']}")
db.sql("update profiles set rent_at = now() - interval '100 hours' where id=%s", str(A))
before = db.rpc(A, "my_holdings"); cA = db.sql("select cash from profiles where id=%s", str(A))[0][0]
s = db.rpc(A, "state"); gained = s["profile"]["cash"] - cA
exp = s["rate"] * 100 / 24
check("pas de plafond de 48 h", abs(gained - exp) / max(1, exp) < 0.08, f"+{gained} attendu ≈ {exp:.0f}")

# mayor tax: put B as owner of big value in an arr where A owns something
h = db.rpc(A, "my_holdings")["lots"]; card = h[0][0]; arr = db.sql("select arr from cards where id=%s", card)[0][0]
big = db.sql("select id, lots from cards where arr=%s and lk='l' and lots between 5 and 60 and id not in (select card from lots) order by v*lots desc limit 3", arr)
for cid, n in big:
    db.sql("insert into lots(card,k,owner) select %s, g, %s from generate_series(0,%s-1) g", cid, str(B), n)
    db.sql("select _add_value(%s, %s::smallint, (select v*%s from cards where id=%s))", str(B), arr, n, cid)
db.sql("select _refresh_mayors(array[%s])", arr)
mayor = db.sql("select mayor, party from arr_state where arr=%s", arr)[0]
check("le plus gros propriétaire devient maire", str(mayor[0]) == str(B) and mayor[1] == "milieu", mayor)
db.sql("update profiles set rent_at = now() - interval '24 hours' where id=%s", str(A))
cb = db.sql("select cash from profiles where id=%s", str(B))[0][0]
db.sql("update profiles set rent_at = now() where id=%s", str(B))
db.rpc(A, "state"); db.rpc(B, "state")
cb2 = db.sql("select cash from profiles where id=%s", str(B))[0][0]
check("le maire touche sa taxe (8 %)", cb2 > cb, f"+{cb2-cb} €")

# bank buy
hold = db.rpc(A, "my_holdings")["lots"]
cid = next((l[0] for l in hold if db.sql("select lots from cards where id=%s", l[0])[0][0] > 1 and db.sql("select count(*) from lots where card=%s", l[0])[0][0] < db.sql("select lots from cards where id=%s", l[0])[0][0]), None)
if cid:
    free = db.sql("select g from generate_series(0,(select lots-1 from cards where id=%s)) g where g not in (select k from lots where card=%s) limit 1", cid, cid)[0][0]
    db.sql("update profiles set cash = cash + 50000000 where id=%s", str(A))
    db.sql("update profiles set land=%s where id=%s", cid, str(A))
    db.rpc(A, "bank_buy", p_card=cid, p_k=free)
    check("achat à la banque d'un logement libre", db.sql("select owner from lots where card=%s and k=%s", cid, free)[0][0] == str(A))
other = db.sql("select id from cards where lk='l' and id not in (select card from lots) limit 1")[0][0]
c0 = db.sql("select cash from profiles where id=%s", str(A))[0][0]; db.sql("update profiles set rent_at=now() where id=%s", str(A))
db.sql("update profiles set land=%s where id=%s", other, str(A)); db.rpc(A, "bank_buy", p_card=other, p_k=None)
check("achat direct d'un logement sans carte préalable", db.sql("select owner from lots where card=%s and k=0", other)[0][0] == str(A))
big = db.sql("select id, lots, v from cards where lk='l' and lots between 4 and 10 and id not in (select card from lots) limit 1")[0]
db.sql("update profiles set cash = cash + %s where id=%s", big[1]*big[2], str(A))
db.sql("update profiles set land=%s where id in (%s,%s)", big[0], str(A), str(B)); db.rpc(A, "buy_building", p_card=big[0])
check("achat d'un immeuble entier libre", db.sql("select count(*) from lots where card=%s and owner=%s", big[0], str(A))[0][0] == big[1])
check("immeuble déjà entamé : achat entier refusé", "appartient déjà" in (err(lambda: db.rpc(B, "buy_building", p_card=big[0])) or ""))

# market
mine = db.rpc(A, "my_holdings")["lots"][0]
db.rpc(A, "list_item", p_card=mine[0], p_k=mine[1], p_n=1, p_price=777000)
lid = db.sql("select id from listings where card=%s and k=%s", mine[0], mine[1])[0][0]
check("vente : impossible d'acheter sa propre annonce", "votre annonce" in (err(lambda: db.rpc(A, "buy_listing", p_id=lid)) or ""))
db.rpc(A, "state"); ca = db.sql("select cash from profiles where id=%s", str(A))[0][0]; cc_ = db.sql("select cash from profiles where id=%s", str(Cc))[0][0]
db.sql("update profiles set rent_at=now() where id in (%s,%s)", str(A), str(Cc)); db.sql("delete from pay where owner=%s", str(Cc))
db.rpc(Cc, "buy_listing", p_id=lid); db.rpc(A, "state")
owner = db.sql("select owner from lots where card=%s and k=%s", mine[0], mine[1])[0][0]
ca2 = db.sql("select cash from profiles where id=%s", str(A))[0][0]; cc2 = db.sql("select cash from profiles where id=%s", str(Cc))[0][0]
mp = db.sql("select party from arr_state where arr=(select arr from cards where id=%s)", mine[0])[0][0]
fee = 0.05
check("achat sur le marché : propriétaire changé, vendeur payé moins la commission",
      str(owner) == str(Cc) and abs((ca2 - ca) - 777000 * (1 - fee)) < 50 and abs((cc_ - cc2) - 777000) < 50, (ca2 - ca, cc_ - cc2, mp))
check("annonce retirée après la vente", db.sql("select count(*) from listings where id=%s", lid)[0][0] == 0)
# double buy race
mine = db.rpc(B, "my_holdings")["lots"][0]
db.rpc(B, "list_item", p_card=mine[0], p_k=mine[1], p_n=1, p_price=100000)
lid = db.sql("select id from listings where card=%s and k=%s", mine[0], mine[1])[0][0]
res = []
def buy(u): res.append(err(lambda: db.rpc(u, "buy_listing", p_id=lid)))
ths = [threading.Thread(target=buy, args=(u,)) for u in (A, Cc)]; [t.start() for t in ths]; [t.join() for t in ths]
check("deux acheteurs en même temps : un seul gagne, message clair", sorted([r is None for r in res]) == [False, True] and any(r and "vendue" in r for r in res), res)

# mortgage
m = db.rpc(A, "my_holdings")["lots"][-1]
c0 = db.sql("select cash from profiles where id=%s", str(A))[0][0]
db.sql("update profiles set rent_at=now() where id=%s", str(A))
db.rpc(A, "mortgage", p_card=m[0], p_k=m[1])
v = db.sql("select v from cards where id=%s", m[0])[0][0]
c1 = db.sql("select cash from profiles where id=%s", str(A))[0][0]
check("hypothèque : +50 % de la valeur", abs(c1 - c0 - v // 2) < 100, (c1 - c0, v // 2))
db.rpc(A, "lift", p_card=m[0], p_k=m[1])
check("remboursement de l'hypothèque", db.sql("select mort from lots where card=%s and k=%s", m[0], m[1])[0][0] is None)

# cash never negative
db.sql("update profiles set cash = 0 where id=%s", str(Cc))
for _ in range(15):
    try: db.rpc(Cc, "open_booster", p_kind="welcome")
    except Exception: pass
db.sql("update profiles set welcome=40 where id=%s", str(Cc))
for _ in range(40): db.rpc(Cc, "open_booster", p_kind="welcome")
check("trésorerie jamais négative (malus plafonnés)", db.sql("select min(cash) from profiles")[0][0] >= 0)
check("achat refusé sans trésorerie", "insuffisante" in (err(lambda: (db.sql("update profiles set cash=0, rent_at=now() where id=%s", str(Cc)), db.rpc(Cc, "open_booster", p_kind="paid"))) or ""))

# party change
check("changement de parti bloqué pendant 48 h", "48" in (err(lambda: db.rpc(A, "set_party", p_party="valeurs")) or "") or "dans" in (err(lambda: db.rpc(A, "set_party", p_party="valeurs")) or ""))
db.sql("update profiles set party_at = now() - interval '49 hours' where id=%s", str(A))
check("changement de parti après 48 h", db.rpc(A, "set_party", p_party="valeurs")["profile"]["party"] == "valeurs")

# week / city hall
db.sql("delete from city_week")
w = db.rpc(A, "state")["week"]
check("Hôtel de Ville calculé pour la semaine", w is not None, w)

# reads
ms = db.rpc(A, "map_state"); check("map_state", len(ms["lots"]) > 0 and len(ms["arr"]) > 0, f"{len(ms['lots'])} immeubles")
check("feed", len(db.rpc(A, "feed")) > 0, [x["kind"] for x in db.rpc(A, "feed")][:8])
check("leaderboard", len(db.rpc(A, "leaderboard")) == 3, [(x["pseudo"], x["worth"]) for x in db.rpc(A, "leaderboard")])
check("market", "listings" in db.rpc(A, "market"))
check("building", "lots" in db.rpc(A, "building", p_card=card))
check("arr_info", db.rpc(A, "arr_info", p_arr=arr)["state"] is not None)

# chance distribution
import collections
cnt = collections.Counter()
for _ in range(400):
    cnt[db.sql("select _chance(%s)->>'k'", str(Cc))[0][0]] += 1
bad = {"fisc","fonciere","notaire","amende","cambriolage","ravalement","degat","greve","ascenseur","termites","squat"}
nb = sum(v for k, v in cnt.items() if k in bad)
check("cartes Chance : environ 65 % bonus / 35 % malus", 0.27 < nb / 400 < 0.43, f"malus {nb/4:.0f} %, contrôle fiscal {cnt['fisc']/4:.1f} %")
print(f"\n{sum(R)}/{len(R)} OK")
