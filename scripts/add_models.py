"""Ajoute les maquettes 3D des grands monuments (obélisque, gares, églises…) dans public/data/index.json.

Rejouable : les entrées de NEW sont recalculées à chaque fois (les 22 maquettes d'origine ne bougent pas).
Pour chaque monument : position, orientation et taille viennent de l'empreinte du bâtiment (orientation dominante
des murs, rectangle orienté), sauf réglages donnés à la main ; les bâtiments sous la maquette sont cachés de la carte.
Après : changer DATA_V dans public/app/core.js.
    python3 scripts/add_models.py
"""
import json, math
from shapely.geometry import Polygon
import shapely

D = "public/data/"
# (carte ou None pour un simple décor, clé de la maquette dans models.js, cartes contiguës à ajouter à l'empreinte, réglages)
#  fx : bout de l'axe x où est la façade (-1/1) ; fz : côté z de la façade principale ; tz : côté de la tour
NEW = [
    (700000, "obelisque", [], dict(L=8, W=8, h=33, ang=0.0)),
    (301034, "hoteldeville", [], dict(h=50, fz=-1)),
    (602815, "invalides", [], dict(h=107, fx=-1)),
    (None, "horlogelyon", [], dict(lon=2.37296, lat=48.84466, L=11, W=11, h=67, near=1102464)),   # tour de l'horloge de la gare de Lyon
    (1200001, "austerlitz", [], dict(h=30, fx=-1)),
    (787, "carrousel", [], dict(L=19.5, W=7.3, h=19, ang=1.117)),   # perpendiculaire à l'axe Louvre - Concorde
    (1804003, "geode", [], dict(L=36, W=36, h=36)),
    (1102299, "bercy", [], dict(h=30)),
    (1101707, "operabastille", [], dict(h=48, fx=-1)),
    (401377, "museum", [], dict(h=30)),
    (600185, "ecolemilitaire", [], dict(h=36, fx=-1)),
    (491, "horloge", [], dict(h=47)),   # tour de l'Horloge (Conciergerie)
    (None, "vendome", [], dict(lon=2.32941, lat=48.86752, L=7, W=7, h=44, ang=0.0)),
    (None, "juillet", [], dict(lon=2.36914, lat=48.85321, L=14, W=14, h=51, ang=0.0)),
    (None, "saintjacques", [], dict(lon=2.34886, lat=48.85802, L=11, W=11, h=52, snap=True)),
    (401791, "valdegrace", [], dict(h=46, L=26, W=26)),
    (502573, "sulpice", [502575, 502576], dict(h=73, fx=-1)),
    (1150, "eustache", [], dict(h=58, fx=-1)),
    (602798, "clotilde", [602823], dict(h=69, fx=-1)),
    (1004477, "ambroise", [], dict(h=68, fx=-1)),
    (803006, "trinite", [803005], dict(h=65, fx=1)),
    (501884, "sgdp", [], dict(h=50, fx=-1)),
    (402645, "etienne", [], dict(h=52, fx=-1, tz=-1)),
    (901373, "vincent", [], dict(h=50, fx=-1)),
    (702577, "augustin", [], dict(h=80, fx=-1)),
    (301886, "paulstlouis", [], dict(h=55, fx=-1)),
]

ix = json.load(open(D + "index.json")); F = ix["fields"]
def dec(flat):
    x = flat[0] + 235000; y = flat[1] + 4886000; out = [(x / 1e5, y / 1e5)]
    for k in range(2, len(flat), 2):
        x += flat[k]; y += flat[k + 1]; out.append((x / 1e5, y / 1e5))
    return out
A = {i: json.load(open(D + "a/" + a["c"] + ".json")) for i, a in enumerate(ix["arr"])}
geo = {i * 100000 + k: [dec(r) for r in rings] for i, a in A.items() for k, rings in enumerate(a["geo"])}
cen = {g: (sum(p[0] for p in rs[0]) / len(rs[0]), sum(p[1] for p in rs[0]) / len(rs[0])) for g, rs in geo.items()}
_poly = {}
def poly(g):
    if g not in _poly: _poly[g] = shapely.unary_union([Polygon(r).buffer(0) for r in geo[g]])
    return _poly[g]

def frame(gs):
    """rectangle orienté de l'union des empreintes : orientation dominante des murs (modulo 90°), puis étendues"""
    p = shapely.unary_union([poly(g) for g in gs]); c = p.centroid; cx, cy = c.x, c.y
    kx = 111320 * math.cos(math.radians(cy)); ky = 110574
    pm = shapely.transform(p, lambda xy: (xy - [cx, cy]) * [kx, ky]); geoms = pm.geoms if hasattr(pm, "geoms") else [pm]
    hist = [0.0] * 90
    for q in geoms:
        cs = list(q.exterior.coords)
        for (x0, y0), (x1, y1) in zip(cs, cs[1:]):
            l = math.hypot(x1 - x0, y1 - y0)
            if l < 1: continue
            a = int(round(math.degrees(math.atan2(y1 - y0, x1 - x0)))) % 90
            for d in (-2, -1, 0, 1, 2): hist[(a + d) % 90] += l * (1 - abs(d) / 3)
    th = math.radians(max(range(90), key=lambda a: hist[a]))
    def ext(t):
        ca, sa = math.cos(t), math.sin(t); us = [x * ca + y * sa for q in geoms for x, y in q.exterior.coords]; return min(us), max(us)
    a0, a1 = ext(th), ext(th + math.pi / 2)
    if a1[1] - a1[0] > a0[1] - a0[0]: th += math.pi / 2; a0, a1 = a1, a0
    if math.cos(th) < 0: th += math.pi; a0 = (-a0[1], -a0[0]); a1 = (-a1[1], -a1[0])
    th = math.atan2(math.sin(th), math.cos(th))
    um, vm = (a0[0] + a0[1]) / 2, (a1[0] + a1[1]) / 2; ca, sa = math.cos(th), math.sin(th)
    return dict(lon=cx + (um * ca - vm * sa) / kx, lat=cy + (um * sa + vm * ca) / ky, ang=th, L=a0[1] - a0[0], W=a1[1] - a1[0], area=pm.area)

def nearest(lon, lat, R=12):
    kx = 111320 * math.cos(math.radians(lat)); ky = 110574; best = None
    for g, (x, y) in cen.items():
        d = math.hypot((x - lon) * kx, (y - lat) * ky)
        if d < R and (best is None or d < best[0]): best = (d, g)
    return best[1] if best else None

keys = {m for _, m, _, _ in NEW}
models = [m for m in ix["models"] if m["m"] not in keys]
added = []
for g, key, extra, o in NEW:
    o = dict(o)
    if g is not None:
        f = frame([g] + extra)
    elif o.pop("snap", False) and nearest(o["lon"], o["lat"]):   # décor posé sur un bâtiment de la carte (ex. tour Saint-Jacques) : on prend sa position et son orientation
        f = frame([nearest(o["lon"], o["lat"])]); o.pop("lon"); o.pop("lat")
    else:
        f = dict(lon=o["lon"], lat=o["lat"], ang=0.0, L=o["L"], W=o["W"], area=o["L"] * o["W"])
    if "near" in o: f["ang"] = frame([o.pop("near")])["ang"]   # même orientation que le bâtiment voisin (la gare)
    f.update({k: v for k, v in o.items()})
    e = {"g": g, "m": key, "lon": round(f["lon"], 6), "lat": round(f["lat"], 6), "ang": round(f["ang"], 4), "L": round(f["L"], 1), "W": round(f["W"], 1), "h": f["h"], "area": round(f["area"])}
    for k in ("fx", "fz", "tz"):
        if k in o: e[k] = o[k]
    models.append(e); added.append(e)
    print(f"{key:14s} {g!s:8s} L={e['L']:6.1f} W={e['W']:6.1f} ang={math.degrees(e['ang']):6.1f} h={e['h']}")
ix["models"] = models

# bâtiments de la carte cachés sous les nouvelles maquettes : le monument et ses parties, plus les petits bâtiments non résidentiels
# dont le centre tombe dans le rectangle (les immeubles de logements restent toujours visibles : des joueurs peuvent les posséder)
ilk = F.index("lk"); iname = F.index("name")
LK = {i * 100000 + k: row[ilk] for i, a in A.items() for k, row in enumerate(a["cards"])}
NAMED = {i * 100000 + k for i, a in A.items() for k, row in enumerate(a["cards"]) if row[iname]}   # un autre monument garde son propre bâtiment
hide = set(ix.get("hide", []))
for m in added:
    kx = 111320 * math.cos(math.radians(m["lat"])); ky = 110574; ca, sa = math.cos(m["ang"]), math.sin(m["ang"])
    if m["g"] is not None: hide.add(m["g"])
    for g in next((e for gg, k2, e, _ in NEW if k2 == m["m"]), []): hide.add(g)
    for g, (x, y) in cen.items():
        if LK[g] == "l" or g in NAMED: continue
        dx = (x - m["lon"]) * kx; dy = (y - m["lat"]) * ky
        if abs(dx) > 400 or abs(dy) > 400: continue
        c = poly(g).centroid; dx = (c.x - m["lon"]) * kx; dy = (c.y - m["lat"]) * ky
        u = dx * ca + dy * sa; v = -dx * sa + dy * ca
        if abs(u) <= m["L"] * .5 and abs(v) <= m["W"] * .5: hide.add(g)
ix["hide"] = sorted(hide)
json.dump(ix, open(D + "index.json", "w"), ensure_ascii=False, separators=(",", ":"))
print(len(models), "maquettes,", len(ix["hide"]), "bâtiments cachés")
