"""Vérifie les boosters sur la base locale : les chances par rareté (58 / 27 / 11 / 3,4 / 0,6 %) et que chaque sorte de carte peut sortir.
    python3 test/sim_boosters.py [nombre de boosters, 1500 par défaut]
Ouvre de vrais boosters (open_booster) avec des joueurs de test, puis tire directement chaque rareté (_draw) pour les sortes rares."""
import sys, uuid, json, collections, time; sys.path.insert(0, 'test'); import db
N = int(sys.argv[1]) if len(sys.argv) > 1 else 1500
spots = dict(db.sql("select card, kind from spots"))
info = {r[0]: r[1:] for r in db.sql("select id, r, lk, lots from cards")}
def kind_of(it):
    g = it["card"]; r, lk, lots = info[g]
    if it["t"] == "part":
        k = spots.get(g)
        return "part " + ({"m": "station", None: "monument"}.get(k, "jardin/place") if k in ("m", None) else "jardin/place")
    return {"key": "logement/local", "floor": "étage", "title": "immeuble entier"}[it["t"]]
tiers, kinds, card_r = collections.Counter(), collections.Counter(), collections.Counter()
t0 = time.time(); opened = 0; P = None
while opened < N:
    if P is None or opened % 200 == 0:   # un nouveau joueur toutes les 200 ouvertures (assez de trésorerie, pas de limite)
        P = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(P)); db.rpc(P, "join_game", p_pseudo="Sim" + str(P)[:6], p_party=None)
        db.sql("update profiles set welcome=100000 where id=%s", str(P))
    r = db.rpc(P, "open_booster", p_kind="welcome"); opened += 1
    for it in r["items"]:
        if it["t"] == "chance": continue
        tiers[it["tier"]] += 1; kinds[(it["tier"], kind_of(it))] += 1; card_r[info[it["card"]][0]] += 1
tot = sum(tiers.values())
print(f"{opened} boosters ouverts en {time.time() - t0:.0f} s, {tot} cases (hors Chance)\n")
print("Rareté de la case : observé (attendu)")
for t, w in zip("CURLM", (58, 27, 11, 3.4, .6)): print(f"  {t} : {tiers[t] / tot * 100:5.1f} % ({w} %)")
print("\nCe qu'a donné chaque rareté de case :")
for t in "CURLM":
    n = tiers[t]; row = sorted(((k, v) for (tt, k), v in kinds.items() if tt == t), key=lambda x: -x[1])
    print(f"  {t} ({n}) : " + ", ".join(f"{k} {v / n * 100:.0f} %" for k, v in row))
# chaque sorte, chaque rareté : tirages directs pour voir les plus rares
print("\nTirages directs (_draw) pour vérifier que tout peut sortir :")
Q = uuid.uuid4(); db.sql("insert into auth.users(id) values (%s)", str(Q)); db.rpc(Q, "join_game", p_pseudo="Sim2" + str(Q)[:5], p_party=None)
seen = collections.defaultdict(set)
for t in "CURLM":
    for i in range(1500 if t in "LM" else 600):
        x = db.sql("select _draw(%s, %s)", str(Q), t)[0][0]
        if not x: continue
        g = x["card"]; r, lk, lots = info[g]; k = kind_of(x)
        seen[k].add(r)
want = {"logement/local": "CURLM", "étage": "CUR", "immeuble entier": "CURL", "part monument": "URLM", "part station": "CURLM", "part jardin/place": "RLM"}
ok = True
for k, rs in want.items():
    miss = set(rs) - seen[k]; ok &= not miss
    print(f"  {k} : raretés obtenues {''.join(sorted(seen[k], key='CURLM'.index))}" + (f"  — MANQUE {''.join(sorted(miss))}" if miss else "  ✓"))
print("\nTOUT PEUT SORTIR" if ok else "\nATTENTION : certaines cartes ne sortent jamais")
