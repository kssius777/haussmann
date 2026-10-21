"""La carte en tuiles vectorielles, comme Google Maps (20/10/2026, « 3 Go de mémoire, les téléphones vont exploser ») :
le navigateur ne charge plus les 78 000 immeubles de Paris d'un coup (52 sources GeoJSON gardées en mémoire par la carte,
~600 Mo dans son worker), seulement les tuiles à l'écran.
Écrit public/data/t/{z}/{x}/{y}.pbf (zooms 11 à 15, au-delà la carte agrandit les tuiles du 15) avec les couches :
  b      immeubles (id = n° de carte, h = hauteur, r = rareté) — sans les lieux (stations, jardins, places) ni ceux cachés sous une maquette ;
         au zoom 15 seulement, f = la façade que la carte graphique dessine (facade.js) : style × 16 + variante (0-15),
         style 1 haussmannien (1800-1914 ou date inconnue), 2 ancien (avant 1800), 3 moderne (après 1945 ou 38 m et plus),
         4 entre-deux-guerres ; pas de f pour les monuments, églises et équipements sportifs (murs unis)
  roads  rues des arrondissements (k = 1 grande, 0 petite)           zooms 14-15
  major  grands axes (k = 2 ou 3)
  water  la Seine, les canaux, les lacs
  parks  parcs et jardins
  st     noms des rues (n), données « voie » de la Ville de Paris    zoom 15
  bridges  le tablier des ponts et passerelles au-dessus de l'eau     zooms 13-15 (20/10/2026, « mets les ponts, sinon ça fait bizarre »)
Vercel compresse les .pbf tout seul (brotli). Rejouable :  python3 scripts/make_tiles.py   (puis changer DATA_V dans core.js)"""
import json, math, os, shutil, sys, time
import numpy as np
import shapely
from shapely.geometry import Polygon, MultiPolygon, LineString, box
from shapely.strtree import STRtree
import mapbox_vector_tile

H = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
D = os.path.join(H, "public", "data"); OUT = os.path.join(D, "t")
I = json.load(open(os.path.join(D, "index.json"))); B = json.load(open(os.path.join(D, "base.json")))
F = I["fields"]; IH, IU, IR = F.index("h"), F.index("u"), F.index("r")
IY, ILK = F.index("y"), F.index("lk")
def fac_code(g, row, h):
    """La façade dessinée par la carte graphique (facade.js) : style × 16 + variante ; None = murs unis."""
    if row[ILK] == "p" or row[IU] in ("rel", "spo", "agr"): return None
    y = str(row[IY] or "").strip(); y = int(y) if y.lstrip("-").isdigit() else None
    st = 3 if h >= 38 else 1 if y is None else 2 if y < 1800 else 1 if y < 1915 else 4 if y < 1945 else 3
    return st * 16 + ((g * 2654435761) >> 9) % 16
HIDE = set(I.get("hide") or [])
R = 6378137.0; HALF = math.pi * R
def merc(lon, lat): return (math.radians(lon) * R, R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))
def dec(f):
    x, y = f[0] + 235000, f[1] + 4886000; o = [(x / 1e5, y / 1e5)]
    for k in range(2, len(f), 2): x += f[k]; y += f[k + 1]; o.append((x / 1e5, y / 1e5))
    return o
M = lambda pts: [merc(*p) for p in pts]
def ring_ok(r): return len(r) >= 3

# ---- les objets, en mètres « Mercator » ----
t0 = time.time()
bld, bld_props, bld_fac = [], [], []
for i, a in enumerate(I["arr"]):
    d = json.load(open(os.path.join(D, "a", a["c"] + ".json")))
    for k, (row, enc) in enumerate(zip(d["cards"], d["geo"])):
        g = i * 100000 + k
        if g in HIDE or row[IU] in ("met", "jar", "pla"): continue
        polys = [Polygon(M(dec(f))) for f in enc if len(f) >= 6]
        polys = [p if p.is_valid else p.buffer(0) for p in polys]
        polys = [p for p in polys if not p.is_empty]
        if not polys: continue
        geom = polys[0] if len(polys) == 1 else MultiPolygon([q for p in polys for q in (p.geoms if hasattr(p, "geoms") else [p])])
        h = max(4, row[IH] or 0); bld.append(geom); bld_props.append((g, h, row[IR])); bld_fac.append(fac_code(g, row, h))
roads, roads_k = [], []
for a in I["arr"]:
    for k, f in json.load(open(os.path.join(D, "a", a["c"] + ".json")))["roads"]:
        p = dec(f)
        if len(p) >= 2: roads.append(LineString(M(p))); roads_k.append(k)
major = [LineString(M(dec(f))) for k, f in B["major"]]; major_k = [k for k, f in B["major"]]
def polys_of(lst):
    out = []
    for rs in lst:
        rings = [M(dec(r)) for r in rs]
        if not ring_ok(rings[0]): continue
        p = Polygon(rings[0], [r for r in rings[1:] if ring_ok(r)])
        out.append(p if p.is_valid else p.buffer(0))
    return out
water = polys_of(B["water"]); parks = polys_of(B["parks"])
streets = [(n, LineString(M(c))) for n, c in json.load(open(os.path.join(D, "streets.json"))) if len(c) >= 2]
# les ponts : la partie de la rue « Pont … » / « Passerelle … » qui passe au-dessus de l'eau, avec sa vraie largeur (à peu près)
import re
from shapely.ops import unary_union as _union
WIDTH = {"Pont Alexandre III": 40, "Pont de l'Alma": 42, "Pont d'Iéna": 35, "Pont de la Concorde": 35, "Pont des Invalides": 18, "Pont Royal": 17, "Pont du Carrousel": 33,
  "Pont des Arts": 11, "Pont Neuf": 22, "Pont Saint-Michel": 30, "Pont au Change": 30, "Pont Notre-Dame": 20, "Pont d'Arcole": 20, "Pont Louis-Philippe": 15, "Pont Marie": 22,
  "Pont de Sully": 20, "Pont de la Tournelle": 23, "Pont Saint-Louis": 16, "Pont de l'Archevêché": 17, "Pont au Double": 20, "Pont d'Austerlitz": 30, "Pont Charles de Gaulle": 35,
  "Pont de Bercy": 32, "Pont de Tolbiac": 20, "Pont National": 34, "Pont de Bir-Hakeim": 25, "Pont de Grenelle-Cadets de Saumur": 30, "Pont Mirabeau": 20, "Pont du Garigliano": 30,
  "Pont Morland": 20, "Passerelle Simone de Beauvoir": 12, "Passerelle Léopold Sédar Senghor": 15}
wet = _union([w.buffer(12) for w in polys_of(B["water"])])
bridges = []
for n, ln in streets:
    if not re.match(r"^(Pont|Passerelle|Viaduc|Petit-Pont)\b", n): continue
    w = WIDTH.get(n, 8 if n.startswith("Passerelle") else 18) / math.cos(math.radians(48.86))   # largeur au sol → mètres Mercator
    deck = ln.buffer(w / 2, cap_style=2).intersection(wet)
    if not deck.is_empty and deck.area > 50: bridges.append(deck)
print(f"{len(bridges)} ponts,", end=" ")
print(f"{len(bld)} immeubles, {len(roads)} rues, {len(major)} grands axes, {len(water)} eaux, {len(parks)} parcs, {len(streets)} noms de rues ({time.time() - t0:.0f} s)", flush=True)

LAYERS = {   # nom : (géométries, propriétés, zooms, simplification en m par zoom, aire mini en m² par zoom)
    "water": (water, [{}] * len(water), range(11, 16), {11: 12, 12: 6, 13: 3, 14: 1.5, 15: .6}, {11: 3000, 12: 800}),
    "parks": (parks, [{}] * len(parks), range(11, 16), {11: 12, 12: 6, 13: 3, 14: 1.5, 15: .6}, {11: 4000, 12: 1200, 13: 200}),
    "major": (major, [{"k": k} for k in major_k], range(11, 16), {11: 10, 12: 5, 13: 2.5, 14: 1.2, 15: .5}, {}),
    "roads": (roads, [{"k": k} for k in roads_k], range(14, 16), {14: 1, 15: .4}, {}),
    "b": (bld, [{"h": h, "r": r} for g, h, r in bld_props], range(13, 16), {13: 1.6, 14: .7, 15: .25}, {13: 40}),
    "st": ([s[1] for s in streets], [{"n": s[0]} for s in streets], range(15, 16), {15: .5}, {}),
    "bridges": (bridges, [{}] * len(bridges), range(13, 16), {13: 1.5, 14: .8, 15: .3}, {}),
}
IDS = {"b": [g for g, h, r in bld_props]}
TREES = {k: STRtree(v[0]) for k, v in LAYERS.items()}
AREA = {k: np.array([g.area for g in v[0]]) for k, v in LAYERS.items()}

# ---- les tuiles ----
W, S, E, N = 2.215, 48.810, 2.475, 48.906   # Paris et ses bois
def tile_of(lon, lat, z):
    n = 2 ** z; x = int((lon + 180) / 360 * n); y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n); return x, y
def tile_bounds(x, y, z):
    s = 2 * HALF / 2 ** z; return (-HALF + x * s, HALF - (y + 1) * s, -HALF + (x + 1) * s, HALF - y * s)
if os.path.isdir(OUT): shutil.rmtree(OUT)
total, nb, biggest = 0, 0, (0, "")
for z in range(11, 16):
    x0, y0 = tile_of(W, N, z); x1, y1 = tile_of(E, S, z)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            bx = tile_bounds(x, y, z); size = bx[2] - bx[0]
            layers = []
            for name, (geoms, props, zooms, simp, amin) in LAYERS.items():
                if z not in zooms: continue
                buf = size * (512 if name == "st" else 64) / 4096   # les noms de rue débordent plus : ils ont besoin de la rue entière pour se placer
                clip = (bx[0] - buf, bx[1] - buf, bx[2] + buf, bx[3] + buf); rect = box(*clip)
                idx = TREES[name].query(rect)
                if not len(idx): continue
                if z in amin: idx = idx[AREA[name][idx] >= amin[z]]
                if not len(idx): continue
                gs = shapely.clip_by_rect(np.array(geoms, dtype=object)[idx], *clip)
                tol = simp.get(z, 0) * (1 / math.cos(math.radians(48.86)))   # en mètres au sol → mètres Mercator
                feats = []
                for j, gg in zip(idx, gs):
                    if gg is None or gg.is_empty: continue
                    if tol: gg = gg.simplify(tol, preserve_topology=True)
                    if gg.is_empty: continue
                    if gg.geom_type == "GeometryCollection":
                        parts = [p for p in gg.geoms if p.geom_type in ("Polygon", "MultiPolygon", "LineString", "MultiLineString")]
                        if not parts: continue
                        gg = parts[0] if len(parts) == 1 else shapely.union_all(parts)
                    f = {"geometry": gg, "properties": props[j]}
                    if name == "b" and z == 15 and bld_fac[j] is not None: f["properties"] = dict(props[j], f=bld_fac[j])   # la façade, de près seulement
                    if name in IDS: f["id"] = IDS[name][j]
                    feats.append(f)
                if feats: layers.append({"name": name, "features": feats})
            os.makedirs(os.path.join(OUT, str(z), str(x)), exist_ok=True)
            data = mapbox_vector_tile.encode(layers, default_options={"quantize_bounds": bx, "extents": 4096, "on_invalid_geometry": mapbox_vector_tile.encoder.on_invalid_geometry_make_valid}) if layers else b""
            open(os.path.join(OUT, str(z), str(x), f"{y}.pbf"), "wb").write(data)
            total += len(data); nb += 1
            if len(data) > biggest[0]: biggest = (len(data), f"{z}/{x}/{y}")
    print(f"zoom {z} fait ({nb} tuiles, {total / 1e6:.1f} Mo, {time.time() - t0:.0f} s)", flush=True)
print(f"{nb} tuiles, {total / 1e6:.1f} Mo (avant compression), la plus grosse {biggest[0] / 1e6:.2f} Mo ({biggest[1]})")
