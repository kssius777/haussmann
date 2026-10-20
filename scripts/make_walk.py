"""Le plan pour marcher dans le monde ouvert (essai dans le 7e, 20/10/2026, demande du propriétaire) :
les rues de streets.json (données « voie » de la Ville de Paris) autour du 7e, reliées en un seul réseau,
et les lignes de métro de la zone (dans l'ordre des stations). Écrit public/data/walk7.json :
  zone   : le contour de la zone où l'on marche (le 7e + 250 m), en [lon, lat]
  bounds : [[ouest, sud], [est, nord]] pour la caméra
  n      : les points du réseau, codés comme les contours (decodeRing dans core.js : x0, y0, puis écarts, en 1/100 000 de degré)
  e      : les tronçons, par paires d'indices de points
  metro  : { ligne: [carte de la station, …] } dans l'ordre de la ligne (stations dans la zone)
Rejouable :  python3 scripts/make_walk.py"""
import json, math, os
from shapely.geometry import Polygon, LineString, Point, MultiLineString
from shapely.ops import unary_union

H = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
I = json.load(open(os.path.join(H, "public", "data", "index.json")))
S = json.load(open(os.path.join(H, "public", "data", "streets.json")))
ARR, BUF = 7, 250   # l'arrondissement de l'essai, et la marge autour (mètres)
KX = 111320 * math.cos(math.radians(48.856)); KY = 110574
def dec(f):
    x, y = f[0] + 235000, f[1] + 4886000; o = [(x / 1e5, y / 1e5)]
    for k in range(2, len(f), 2): x += f[k]; y += f[k + 1]; o.append((x / 1e5, y / 1e5))
    return o
m = lambda p: (p[0] * KX, p[1] * KY)
g = lambda p: (p[0] / KX, p[1] / KY)
A = I["arr"][ARR - 1]
P = unary_union([Polygon([m(p) for p in dec(r)]) for r in A["outline"]])
Z = P.buffer(BUF).simplify(12)

# 1) les rues coupées au bord de la zone
lines = []
for name, pts in S:
    if len(pts) < 2: continue
    L = LineString([m(p) for p in pts])
    if not L.intersects(Z): continue
    c = L.intersection(Z)
    for part in (c.geoms if hasattr(c, "geoms") else [c]):
        if isinstance(part, LineString) and part.length > 1: lines.append(list(part.coords))

# 2) les points (arrondis au mètre) et les tronçons
key = lambda p: (round(p[0]), round(p[1]))
nodes, xy, adj = {}, [], {}
def nid(p):
    k = key(p)
    if k not in nodes: nodes[k] = len(xy); xy.append(k); adj[nodes[k]] = set()
    return nodes[k]
for pts in lines:
    ids = [nid(p) for p in pts]
    for a, b in zip(ids, ids[1:]):
        if a != b: adj[a].add(b); adj[b].add(a)

# 3) les bouts de rue qui s'arrêtent juste avant une autre rue (un « T » mal fermé) : on les raccroche (12 m au plus)
CELL = 40
def segs():
    out = set()
    for a in adj:
        for b in adj[a]:
            if a < b: out.add((a, b))
    return out
def grid(ss):
    G = {}
    for a, b in ss:
        (x1, y1), (x2, y2) = xy[a], xy[b]
        for cx in range(int(min(x1, x2) // CELL), int(max(x1, x2) // CELL) + 1):
            for cy in range(int(min(y1, y2) // CELL), int(max(y1, y2) // CELL) + 1):
                G.setdefault((cx, cy), []).append((a, b))
    return G
def proj(p, a, b):
    (x1, y1), (x2, y2) = xy[a], xy[b]; dx, dy = x2 - x1, y2 - y1; L2 = dx * dx + dy * dy
    t = 0 if L2 == 0 else max(0, min(1, ((p[0] - x1) * dx + (p[1] - y1) * dy) / L2))
    q = (x1 + t * dx, y1 + t * dy); return math.hypot(p[0] - q[0], p[1] - q[1]), t, q
joined = 0
for _ in range(2):
    ss = segs(); G = grid(ss)
    for n in [n for n in adj if len(adj[n]) == 1]:
        p = xy[n]; best = None
        for cx in range(int(p[0] // CELL) - 1, int(p[0] // CELL) + 2):
            for cy in range(int(p[1] // CELL) - 1, int(p[1] // CELL) + 2):
                for a, b in G.get((cx, cy), []):
                    if n in (a, b) or a in adj[n] or b in adj[n]: continue
                    d, t, q = proj(p, a, b)
                    if d <= 12 and (best is None or d < best[0]): best = (d, t, q, a, b)
        if not best: continue
        d, t, q, a, b = best
        if b not in adj[a]: continue   # déjà coupé à ce tour-ci
        if t <= 0.02: k = a
        elif t >= 0.98: k = b
        else:
            k = nid(q)
            if k not in (a, b): adj[a].discard(b); adj[b].discard(a); adj[a].add(k); adj[k].add(a); adj[b].add(k); adj[k].add(b)
        if k != n: adj[n].add(k); adj[k].add(n); joined += 1

# 4) on garde le grand réseau (les petits morceaux isolés tombent)
seen, comps = set(), []
for s in adj:
    if s in seen: continue
    st, c = [s], []; seen.add(s)
    while st:
        u = st.pop(); c.append(u)
        for v in adj[u]:
            if v not in seen: seen.add(v); st.append(v)
    comps.append(c)
comps.sort(key=len, reverse=True)
keep = set(comps[0])
idx = {}; out_n = []
for n in sorted(keep):
    idx[n] = len(out_n); out_n.append(g(xy[n]))
edges = sorted({(min(idx[a], idx[b]), max(idx[a], idx[b])) for a in keep for b in adj[a] if b in keep and a != b})

# 5) le métro : les lignes de la zone, dans l'ordre (les stations hors zone sont sautées)
SEQ = {
  "6": ["Cambronne", "La Motte-Picquet – Grenelle", "Dupleix", "Bir-Hakeim"],
  "8": ["Commerce", "La Motte-Picquet – Grenelle", "École Militaire", "La Tour-Maubourg", "Invalides", "Concorde"],
  "10": ["Avenue Émile Zola", "La Motte-Picquet – Grenelle", "Ségur", "Duroc", "Vaneau", "Sèvres – Babylone", "Mabillon"],
  "12": ["Concorde", "Assemblée nationale", "Solférino", "Rue du Bac", "Sèvres – Babylone", "Rennes", "Notre-Dame-des-Champs", "Montparnasse – Bienvenüe", "Falguière"],
  "13": ["Champs-Élysées – Clemenceau", "Invalides", "Varenne", "Saint-François-Xavier", "Duroc", "Montparnasse – Bienvenüe"],
}
st = {s[5].replace("Métro ", ""): s for s in I["spots"] if s[1] == "m"}
inz = lambda s: Z.contains(Point(m((s[3], s[4]))))
metro = {}
for line, names in SEQ.items():
    seq = [st[n][0] for n in names if n in st and inz(st[n])]
    missing = [n for n in names if n not in st]
    if missing: print("  station inconnue :", line, missing)
    if len(seq) >= 2: metro[line] = seq

# 6) écrire
def enc(pts):
    f = []; px = py = None
    for lon, lat in pts:
        x, y = round(lon * 1e5) - 235000, round(lat * 1e5) - 4886000
        if px is None: f += [x, y]
        else: f += [x - px, y - py]
        px, py = x, y
    return f
zone = [tuple(round(c, 5) for c in g(p)) for p in Z.exterior.coords]
bx = Z.buffer(400).bounds; w, s = g((bx[0], bx[1])); e, n = g((bx[2], bx[3]))
out = {"zone": zone, "bounds": [[round(w, 5), round(s, 5)], [round(e, 5), round(n, 5)]], "n": enc(out_n), "e": [i for ab in edges for i in ab], "metro": metro}
dst = os.path.join(H, "public", "data", "walk7.json")
json.dump(out, open(dst, "w"), separators=(",", ":"))
km = sum(math.hypot(*(lambda a, b: (a[0] - b[0], a[1] - b[1]))(m(out_n[a]), m(out_n[b]))) for a, b in edges) / 1000
print(f"{len(out_n)} points, {len(edges)} tronçons, {km:.0f} km de rues ; {joined} « T » raccrochés ; {len(comps) - 1} petits morceaux laissés ;",
      "métro :", {k: len(v) for k, v in metro.items()}, f"; {os.path.getsize(dst) // 1024} Ko")
