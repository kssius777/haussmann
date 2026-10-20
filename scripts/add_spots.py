"""Les « lieux » en cartes à parts (20/10/2026, validé par le propriétaire) :
   - les 244 stations de métro de Paris, 100 parts chacune, rareté selon le nombre de lignes
     (1 ligne Commune, 2 Peu commune, 3 Rare, 4 et plus Légendaire, Châtelet Mythique) ;
   - 45 jardins, bois, places et le canal Saint-Martin, en parts comme les monuments (Rare 50, Légendaire 200, Mythique 1000).
   Prix d'une part selon la rareté, comme les monuments (Commune : 80 000 €, loyer 280 €/jour).
Données : scripts/data/stations.json et places.json (Wikidata, CC0 ; voir scripts/data/README.md).
Écrit : public/data/a/751xx.json (cartes ajoutées à la fin de chaque arrondissement + une petite emprise),
        index.json (« spots » : les repères de la carte), cards.json, edges.json (chaque lieu relié aux immeubles voisins,
        pour le chemin du dé) et supabase/migration_metro.sql (cartes, repères, liens, bonus réseau).
Rejouable : les lieux déjà ajoutés (toujours à la fin de chaque arrondissement) sont d'abord retirés.
    python3 scripts/add_spots.py"""
import json, math, os
H = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
D = os.path.join(H, "public", "data") + "/"
IDX = json.load(open(D + "index.json")); F = IDX["fields"]; FI = {f: i for i, f in enumerate(F)}
STATIONS = json.load(open(os.path.join(H, "scripts", "data", "stations.json")))
PLACES = json.load(open(os.path.join(H, "scripts", "data", "places.json")))
SPOT_U = {"met", "jar", "pla"}
PER = {"C": (80000, 280), "U": (125000, 440), "R": (180000, 630), "L": (300000, 1050), "M": (450000, 1580)}   # prix et loyer d'une part
PARTS = {"U": 20, "R": 50, "L": 200, "M": 1000}                                                             # comme les monuments
PLACE_R = {   # les plus célèbres en Mythique, puis Légendaire, puis Rare
 "Jardin des Tuileries": "M", "Jardin du Luxembourg": "M", "Champ-de-Mars": "M", "Place de la Concorde": "M", "Place du Trocadéro": "M",
 "Place Charles-de-Gaulle (Étoile)": "M", "Place des Vosges": "M", "Place du Tertre": "M", "Parvis Notre-Dame – place Jean-Paul-II": "M",
 "Parc des Buttes-Chaumont": "L", "Parc Monceau": "L", "Jardin des Plantes": "L", "Parc de la Villette": "L", "Jardin du Palais-Royal": "L",
 "Bois de Boulogne": "L", "Bois de Vincennes": "L", "Canal Saint-Martin": "L", "Place de la Bastille": "L", "Place de la République": "L",
 "Place Vendôme": "L", "Place de l'Opéra": "L", "Esplanade des Invalides": "L", "Place de la Madeleine": "L", "Place du Châtelet": "L",
 "Place Saint-Michel": "L", "Place Pigalle": "L", "Place des Abbesses": "L"}
KIND = {"jardin": "j", "bois": "b", "place": "p", "canal": "c"}
kx, ky = 111320 * math.cos(math.radians(48.857)), 110574

def enc_ring(pts):   # comme decodeRing (core.js), à l'envers
    q = [(round(lon * 1e5), round(lat * 1e5)) for lon, lat in pts]
    out = [q[0][0] - 235000, q[0][1] - 4886000]
    for (x0, y0), (x1, y1) in zip(q, q[1:]): out += [x1 - x0, y1 - y0]
    return out
def octagon(lon, lat, r):
    return [[lon + r * math.cos(k * math.pi / 4 + math.pi / 8) / kx, lat + r * math.sin(k * math.pi / 4 + math.pi / 8) / ky] for k in range(8)]
def row(name, u, r, lots, h, area, q):
    v, rent = PER[r]; x = [None] * len(F)
    x[FI["lg"]] = 0; x[FI["h"]] = h; x[FI["u"]] = u; x[FI["r"]] = r; x[FI["lots"]] = lots; x[FI["lk"]] = "p"
    x[FI["v"]] = v; x[FI["rent"]] = rent; x[FI["a"]] = area; x[FI["s"]] = 0; x[FI["pk"]] = 1; x[FI["name"]] = name; x[FI["q"]] = q
    return x
def st_rarity(s):
    if s["name"] == "Châtelet": return "M"
    return {1: "C", 2: "U", 3: "R"}.get(len(s["lines"]), "L")

# 1) retirer les lieux d'un passage précédent (ils sont à la fin de chaque arrondissement)
files, old = {}, set()
for i, a in enumerate(IDX["arr"]):
    f = json.load(open(D + "a/%s.json" % a["c"])); n = len(f["cards"])
    while n and f["cards"][n - 1][FI["u"]] in SPOT_U: n -= 1
    assert not any(r[FI["u"]] in SPOT_U for r in f["cards"][:n]), "un lieu au milieu des immeubles ?"
    old |= {i * 100000 + k for k in range(n, len(f["cards"]))}
    f["cards"], f["geo"] = f["cards"][:n], f["geo"][:n]; files[i] = f
cards = [c for c in json.load(open(D + "cards.json")) if c[0] not in old]
edges = [e for e in json.load(open(D + "edges.json")) if e[0] not in old and e[1] not in old]

# 2) les ajouter
spots, new_cards, new_spots = [], [], []
items = [("m", s["name"], s, st_rarity(s)) for s in STATIONS] + [(KIND[p["kind"]], p["name"], p, PLACE_R.get(p["name"], "R")) for p in PLACES]
for kind, name, s, r in items:
    i = s["arr"] - 1; f = files[i]; k = len(f["cards"]); g = i * 100000 + k
    if kind == "m":
        title, u, lots, h, rad, area = "Métro " + name, "met", 100, 3, 7, 0
    else:
        title, u, lots, h = name, ("pla" if kind == "p" else "jar"), PARTS[r], 1
        area = s.get("area") or 0; rad = 20 if kind == "p" else 30
    f["cards"].append(row(title, u, r, lots, h, area, s.get("qid")))
    f["geo"].append([enc_ring(octagon(s["lon"], s["lat"], rad))])
    v, rent = PER[r]
    new_cards.append([g, s["arr"], r, "p", lots, 1, v, rent, 1, title, round(s["lon"] * 1e5), round(s["lat"] * 1e5)])
    new_spots.append((g, kind, s.get("lines") if kind == "m" else None))
    spots.append([g, kind, ",".join(s["lines"]) if kind == "m" else None, round(s["lon"], 6), round(s["lat"], 6), title, r])   # nom et rareté : repères et recherche sans charger l'arrondissement

# 3) chaque lieu relié aux immeubles voisins (le dé peut s'y arrêter)
cell = {}
for c in cards:
    x, y = c[10] / 1e5 * kx, c[11] / 1e5 * ky; cell.setdefault((int(x // 100), int(y // 100)), []).append((c[0], x, y))
def near(lon, lat, k, R):
    x, y = lon * kx, lat * ky; out = []; m = math.ceil(R / 100)
    for a in range(int(x // 100) - m, int(x // 100) + m + 1):
        for b in range(int(y // 100) - m, int(y // 100) + m + 1):
            for g, gx, gy in cell.get((a, b), []):
                d = math.hypot(gx - x, gy - y)
                if d <= R: out.append((d, g))
    return [g for d, g in sorted(out)[:k]]
links = set()
for (g, kind, _), c in zip(new_spots, new_cards):
    lon, lat = c[10] / 1e5, c[11] / 1e5
    nb = near(lon, lat, 4 if kind == "m" else 6, 160) or near(lon, lat, 3, 400) or near(lon, lat, 3, 2500)   # les bois : les immeubles de la lisière
    assert nb, ("lieu isolé", c[9])
    for b in nb: links.add((min(g, b), max(g, b)))
links = sorted(links)

# 4) écrire les données du site
for i, a in enumerate(IDX["arr"]):
    json.dump(files[i], open(D + "a/%s.json" % a["c"], "w"), separators=(",", ":"), ensure_ascii=False)
IDX["spots"] = spots
json.dump(IDX, open(D + "index.json", "w"), separators=(",", ":"), ensure_ascii=False)
json.dump(cards + new_cards, open(D + "cards.json", "w"), separators=(",", ":"), ensure_ascii=False)
json.dump(sorted({(min(a, b), max(a, b)) for a, b in edges} | set(links)), open(D + "edges.json", "w"), separators=(",", ":"))

# 5) la migration : les cartes, les repères, les liens, et le bonus réseau dans le calcul des loyers
q = lambda t: "'" + t.replace("'", "''") + "'"
arr_sql = lambda L: "null" if not L else "array[" + ",".join(q(x) for x in L) + "]"
RULES = open(os.path.join(H, "scripts", "data", "metro_rules.sql")).read()
sql = f"""-- =====================================================================
--  Les lieux en cartes à parts (20/10/2026, validé par le propriétaire) : les {sum(1 for s in new_spots if s[1] == 'm')} stations de métro
--  de Paris (100 parts, rareté selon le nombre de lignes, Châtelet Mythique) et {sum(1 for s in new_spots if s[1] != 'm')} jardins, bois,
--  places et le canal Saint-Martin (parts selon la rareté, comme les monuments).
--  Bonus réseau : +1 % sur tous ses loyers par station où l'on a au moins une part, jusqu'à +15 %.
--  Boosters : une case Commune peut aussi donner une part de station (8 %).
--  Généré par scripts/add_spots.py (données Wikidata, CC0). Rejouable sans risque.
-- =====================================================================
{RULES}
insert into cards(id, arr, r, lk, lots, et, v, rent, pk, title, cx, cy) values
""" + ",\n".join(f"({c[0]},{c[1]},{q(c[2])},'p',{c[4]},1,{c[6]},{c[7]},true,{q(c[9])},{c[10]},{c[11]})" for c in new_cards) + """
on conflict (id) do update set arr = excluded.arr, r = excluded.r, lk = excluded.lk, lots = excluded.lots, et = excluded.et, v = excluded.v,
  rent = excluded.rent, pk = excluded.pk, title = excluded.title, cx = excluded.cx, cy = excluded.cy;

insert into spots(card, kind, lines) values
""" + ",\n".join(f"({g},{q(k)},{arr_sql(L)})" for g, k, L in new_spots) + """
on conflict (card) do update set kind = excluded.kind, lines = excluded.lines;

insert into edges(a, b) values
""" + ",\n".join(f"({a},{b}),({b},{a})" for a, b in links) + """
on conflict do nothing;
"""
open(os.path.join(H, "supabase", "migration_metro.sql"), "w").write(sql)
print(len(new_spots), "lieux :", sum(1 for s in new_spots if s[1] == "m"), "stations,", sum(1 for s in new_spots if s[1] != "m"), "jardins et places ;", len(links), "liens")
