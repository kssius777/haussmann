"""Les « lieux » en cartes à parts (20/10/2026, validé par le propriétaire) :
   - les 244 stations de métro de Paris, 100 parts chacune, rareté selon le nombre de lignes
     (1 ligne Commune, 2 Peu commune, 3 Rare, 4 et plus Légendaire, Châtelet Mythique) ;
   - 45 jardins, bois, places et le canal Saint-Martin, en parts comme les monuments (Rare 50, Légendaire 200, Mythique 1000) ;
   - 59 grands lieux qui manquaient (landmarks.json) : gares de l'Est, Montparnasse et de Bercy, ponts, cimetières,
     Champs-Élysées, tour Saint-Jacques, arènes de Lutèce, stades…
   Prix d'une part selon la rareté, comme les monuments (Commune : 80 000 €, loyer 280 €/jour).
   Les photos (Wikimedia Commons, avec auteur et licence) viennent de scripts/data/photos_lieux.json (scripts/add_place_photos.py).
   Les cartes d'immeubles célèbres restées sans nom reçoivent leur nom et leur photo (named.json).
Données : scripts/data/ (Wikidata, CC0 ; voir scripts/data/README.md).
Écrit : public/data/a/751xx.json (lieux ajoutés à la fin de chaque arrondissement + une petite emprise), index.json (« spots »,
        « mons »), cards.json, edges.json (chaque lieu relié aux immeubles voisins, pour le chemin du dé)
        et supabase/migration_lieux.sql (cartes, repères, liens, noms).
Rejouable : les lieux déjà ajoutés (toujours à la fin de chaque arrondissement) sont d'abord retirés, puis remis dans le même ordre
(stations, puis jardins et places, puis grands lieux) : leurs numéros de carte ne changent pas.
    python3 scripts/add_spots.py"""
import json, math, os
H = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
D = os.path.join(H, "public", "data") + "/"; DD = os.path.join(H, "scripts", "data")
IDX = json.load(open(D + "index.json")); F = IDX["fields"]; FI = {f: i for i, f in enumerate(F)}
load = lambda f: json.load(open(os.path.join(DD, f)))
STATIONS, PLACES, LANDMARKS, NAMED = load("stations.json"), load("places.json"), load("landmarks.json"), load("named.json")
PHOTOS = load("photos_lieux.json") if os.path.exists(os.path.join(DD, "photos_lieux.json")) else {}
SPOT_U = {"met", "jar", "pla"}
PER = {"C": (80000, 280), "U": (125000, 440), "R": (180000, 630), "L": (300000, 1050), "M": (450000, 1580)}   # prix et loyer d'une part
PARTS = {"U": 20, "R": 50, "L": 200, "M": 1000}                                                             # comme les monuments
PLACE_R = {   # les plus célèbres en Mythique, puis Légendaire, puis Rare
 "Jardin des Tuileries": "M", "Jardin du Luxembourg": "M", "Champ-de-Mars": "M", "Place de la Concorde": "M", "Place du Trocadéro": "M",
 "Place Charles-de-Gaulle (Étoile)": "M", "Place des Vosges": "M", "Place du Tertre": "M", "Parvis Notre-Dame – place Jean-Paul-II": "M",
 "Place de la République": "M", "Place du Châtelet": "M",   # « des places centrales » (le propriétaire, 20/10/2026)
 "Parc des Buttes-Chaumont": "L", "Parc Monceau": "L", "Jardin des Plantes": "L", "Parc de la Villette": "L", "Jardin du Palais-Royal": "L",
 "Bois de Boulogne": "L", "Bois de Vincennes": "L", "Canal Saint-Martin": "L", "Place de la Bastille": "L",
 "Place Vendôme": "L", "Place de l'Opéra": "L", "Esplanade des Invalides": "L", "Place de la Madeleine": "L",
 "Place Saint-Michel": "L", "Place Pigalle": "L", "Place des Abbesses": "L"}
KIND = {"jardin": "j", "bois": "b", "place": "p", "canal": "c"}
U_OF = lambda k: "met" if k == "m" else "jar" if k in ("j", "b", "k") else "pla"
kx, ky = 111320 * math.cos(math.radians(48.857)), 110574

def enc_ring(pts):   # comme decodeRing (core.js), à l'envers
    q = [(round(lon * 1e5), round(lat * 1e5)) for lon, lat in pts]
    out = [q[0][0] - 235000, q[0][1] - 4886000]
    for (x0, y0), (x1, y1) in zip(q, q[1:]): out += [x1 - x0, y1 - y0]
    return out
def dec(f):
    x, y = f[0] + 235000, f[1] + 4886000; pts = [(x / 1e5, y / 1e5)]
    for i in range(2, len(f), 2): x += f[i]; y += f[i + 1]; pts.append((x / 1e5, y / 1e5))
    return pts
def octagon(lon, lat, r):
    return [[lon + r * math.cos(k * math.pi / 4 + math.pi / 8) / kx, lat + r * math.sin(k * math.pi / 4 + math.pi / 8) / ky] for k in range(8)]
def row(name, u, r, lots, h, area, q, photo):
    v, rent = PER[r]; x = [None] * len(F)
    x[FI["lg"]] = 0; x[FI["h"]] = h; x[FI["u"]] = u; x[FI["r"]] = r; x[FI["lots"]] = lots; x[FI["lk"]] = "p"
    x[FI["v"]] = v; x[FI["rent"]] = rent; x[FI["a"]] = area; x[FI["s"]] = 0; x[FI["pk"]] = 1; x[FI["name"]] = name; x[FI["q"]] = q
    if photo: x[FI["ph"]] = photo["ph"]; x[FI["cr"]] = photo["cr"]
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

# 2) les ajouter, toujours dans le même ordre
spots, new_cards, new_spots = [], [], []
items = [("m", "Métro " + s["name"], s, st_rarity(s)) for s in STATIONS] \
      + [(KIND[p["kind"]], p["name"], p, PLACE_R.get(p["name"], "R")) for p in PLACES] \
      + [(o["kind"], o["name"], o, o["r"]) for o in LANDMARKS]
for kind, title, s, r in items:
    i = s["arr"] - 1; f = files[i]; k = len(f["cards"]); g = i * 100000 + k
    if kind == "m": lots, h, rad, area = 100, 3, 7, 0
    else: lots, h, rad, area = PARTS[r], 1, (30 if kind in ("j", "b", "k") else 14 if kind == "n" else 20), s.get("area") or 0
    f["cards"].append(row(title, U_OF(kind), r, lots, h, area, s.get("qid"), PHOTOS.get("q:" + s.get("qid", ""))))
    f["geo"].append([enc_ring(octagon(s["lon"], s["lat"], rad))])
    v, rent = PER[r]
    new_cards.append([g, s["arr"], r, "p", lots, 1, v, rent, 1, title, round(s["lon"] * 1e5), round(s["lat"] * 1e5)])
    new_spots.append((g, kind, s.get("lines") if kind == "m" else None))
    spots.append([g, kind, ",".join(s["lines"]) if kind == "m" else None, round(s["lon"], 6), round(s["lat"], 6), title, r])

# 3) chaque lieu relié aux immeubles voisins (le dé peut s'y arrêter) ; un pont : les deux rives
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
    if kind == "n": nb = near(lon, lat, 8, 320) or near(lon, lat, 4, 800)
    else: nb = near(lon, lat, 4 if kind == "m" else 6, 160) or near(lon, lat, 3, 400) or near(lon, lat, 3, 2500)   # les bois : les immeubles de la lisière
    assert nb, ("lieu isolé", c[9])
    for b in nb: links.add((min(g, b), max(g, b)))
links = sorted(links)

# 4) les immeubles célèbres restés sans nom : leur nom, leur fiche Wikidata, leur photo
named_rows = []
for n in NAMED:
    g = n["card"]; i, k = g // 100000, g % 100000; r = files[i]["cards"][k]
    r[FI["name"]] = n["name"]; r[FI["q"]] = n["qid"]
    ph = PHOTOS.get("g:%d" % g)
    if ph and not (r[FI["ph"]] and "anoramax" not in (r[FI["cr"]] or "")): r[FI["ph"]] = ph["ph"]; r[FI["cr"]] = ph["cr"]
    p = dec(files[i]["geo"][k][0]); lon = sum(q[0] for q in p) / len(p); lat = sum(q[1] for q in p) / len(p)
    named_rows.append((g, n["name"], r[FI["r"]], round(lon, 5), round(lat, 5)))
cmap = {c[0]: c for c in cards}
for g, nm, r, lon, lat in named_rows: cmap[g][9] = nm
mons = [m for m in IDX["mons"] if m[0] not in {x[0] for x in named_rows}] + [list(x) for x in named_rows]

# 5) écrire les données du site
for i, a in enumerate(IDX["arr"]):
    json.dump(files[i], open(D + "a/%s.json" % a["c"], "w"), separators=(",", ":"), ensure_ascii=False)
IDX["spots"] = spots; IDX["mons"] = mons
json.dump(IDX, open(D + "index.json", "w"), separators=(",", ":"), ensure_ascii=False)
json.dump(cards + new_cards, open(D + "cards.json", "w"), separators=(",", ":"), ensure_ascii=False)
json.dump(sorted({(min(a, b), max(a, b)) for a, b in edges} | set(links)), open(D + "edges.json", "w"), separators=(",", ":"))

# 6) la migration (les règles — table spots, bonus réseau — sont déjà passées avec migration_metro.sql)
q = lambda t: "'" + t.replace("'", "''") + "'"
arr_sql = lambda L: "null" if not L else "array[" + ",".join(q(x) for x in L) + "]"
spots_sql = "insert into spots(card, kind, lines) values\n" + ",\n".join(f"({g},{q(k)},{arr_sql(L)})" for g, k, L in new_spots) + \
    "\non conflict (card) do update set kind = excluded.kind, lines = excluded.lines;\n"
names_sql = "".join(f"update cards set title = {q(nm)} where id = {g};\n" for g, nm, *_ in named_rows)
sql = f"""-- =====================================================================
--  Les lieux en cartes à parts, deuxième vague (20/10/2026, demande du propriétaire : « la gare de l'Est n'est pas présente ? ») :
--  {sum(1 for s in new_spots if s[1] == 'm')} stations, {sum(1 for s in new_spots if s[1] in 'jbpc')} jardins, bois, places et canal (République et Châtelet passent en Mythique),
--  {len(LANDMARKS)} grands lieux qui manquaient (gares, ponts, cimetières, Champs-Élysées, monuments, stades), et {len(named_rows)} immeubles célèbres
--  qui n'avaient pas de nom (BnF, Parc des Princes, Roland-Garros…). Généré par scripts/add_spots.py. Rejouable sans risque.
-- =====================================================================
insert into cards(id, arr, r, lk, lots, et, v, rent, pk, title, cx, cy) values
""" + ",\n".join(f"({c[0]},{c[1]},{q(c[2])},'p',{c[4]},1,{c[6]},{c[7]},true,{q(c[9])},{c[10]},{c[11]})" for c in new_cards) + """
on conflict (id) do update set arr = excluded.arr, r = excluded.r, lk = excluded.lk, lots = excluded.lots, et = excluded.et, v = excluded.v,
  rent = excluded.rent, pk = excluded.pk, title = excluded.title, cx = excluded.cx, cy = excluded.cy;

""" + spots_sql + """
insert into edges(a, b) values
""" + ",\n".join(f"({a},{b}),({b},{a})" for a, b in links) + """
on conflict do nothing;

""" + names_sql
open(os.path.join(H, "supabase", "migration_lieux.sql"), "w").write(sql)
open(os.path.join(DD, "spots_schema.sql"), "w").write("-- la liste des lieux (pour une base neuve : les cartes et les liens viennent de cards.json et edges.json)\n" + spots_sql + names_sql)
print(len(new_spots), "lieux :", sum(1 for s in new_spots if s[1] == "m"), "stations,", sum(1 for s in new_spots if s[1] in "jbpc"), "jardins et places,",
      len(LANDMARKS), "grands lieux ;", len(links), "liens ;", sum(1 for x in items if PHOTOS.get("q:" + (x[2].get("qid") or ""))), "avec photo ;", len(named_rows), "immeubles nommés")
