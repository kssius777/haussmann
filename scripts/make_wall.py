"""Le mur de glace autour de Paris (26/10/2026, demande du propriétaire : « aux frontières de Paris, un mur de glace, avec des
remontées mécaniques, tout autour, afin de délimiter visuellement », « tout en n'abîmant pas la vue de Paris, surtout aux frontières »).
Rejouable (~20 s) : python3 scripts/make_wall.py → public/data/mur.json, puis changer MUR_V dans map.js.

Le mur suit la limite de Paris (les 20 arrondissements de index.json, et les immeubles du bord, pour qu'aucun ne soit touché),
à 20 m à l'extérieur : il ne cache aucun immeuble. Il est fait de blocs de glace de 45 à 75 m de long, 18 m d'épaisseur,
50 à 66 m de haut (trois nuances), avec des pics de glace en gradins sur le haut. Aux grandes portes, un ascenseur en bois
contre la face intérieure : le rail, la cabine à mi-hauteur, ses deux câbles, la cabane du treuil sur le haut (toit enneigé),
la cabane d'en bas. Tout est en volumes simples (fill-extrusion de MapLibre, propriétés b = bas, h = haut, k = sorte).
La ligne du mur (k = "r") sert aussi à la carte dézoomée (un trait de glace autour de Paris) et à savoir si la caméra est dehors."""
import json, math, os, hashlib
from shapely.geometry import Polygon, LineString, Point, mapping
from shapely.ops import unary_union, substring

R = os.path.dirname(os.path.abspath(__file__)) + "/../public/data/"
ML, MA = 111320 * math.cos(48.86 * math.pi / 180), 110540   # mètres par degré (comme decor.js)
LON0, LAT0 = 2.35, 48.86
to_m = lambda lon, lat: ((lon - LON0) * ML, (lat - LAT0) * MA)
to_ll = lambda x, y: (round(LON0 + x / ML, 6), round(LAT0 + y / MA, 6))

def ring(f):   # le format des contours de index.json et des immeubles (decodeRing de core.js)
    x, y = f[0] + 235000, f[1] + 4886000; o = [(x, y)]
    for k in range(2, len(f), 2): x += f[k]; y += f[k + 1]; o.append((x, y))
    return [to_m(a / 1e5, b / 1e5) for a, b in o]

def h01(*a):   # un hasard fixe (le mur est le même à chaque fois)
    return int(hashlib.md5(repr(a).encode()).hexdigest()[:8], 16) / 0xFFFFFFFF

idx = json.load(open(R + "index.json"))
arr = unary_union([Polygon(ring(r)).buffer(0) for a in idx["arr"] for r in a["outline"]]).buffer(6).buffer(-6)
# les immeubles près du bord : le mur passe dehors, même là où le contour simplifié des arrondissements coupe un immeuble
edge = arr.exterior.buffer(400)
blds = []
for a in idx["arr"]:
    d = json.load(open(R + f"a/{a['c']}.json"))
    for g in d["geo"]:
        try:
            p = Polygon(ring(g[0]))
            if p.is_valid and p.area > 4 and edge.intersects(p): blds.append(p.buffer(2))
        except Exception: pass
paris = unary_union([arr] + blds).buffer(12).buffer(-12)
if paris.geom_type == "MultiPolygon": paris = max(paris.geoms, key=lambda g: g.area)
paris = Polygon(paris.exterior)

T, GAP = 18.0, 20.0   # épaisseur du mur, écart entre la limite (ou le dernier immeuble) et sa face intérieure
line = Polygon(paris.buffer(GAP + T / 2, join_style=1).exterior).simplify(1.5).exterior
L = line.length
print(f"limite : {len(paris.exterior.coords)} points, {len(blds)} immeubles du bord ; ligne du mur : {L / 1000:.1f} km, {len(line.coords)} points")

feats = []
def poly(coords_m, k, b, h, **pr):
    xy = [to_ll(x, y) for x, y in coords_m]
    if xy[0] != xy[-1]: xy.append(xy[0])
    feats.append({"type": "Feature", "properties": {"k": k, "b": round(b, 1), "h": round(h, 1), **pr}, "geometry": {"type": "Polygon", "coordinates": [xy]}})

def band(s0, s1, w):   # la bande du mur entre deux abscisses (avec le retour au début de la boucle)
    if s1 <= L: seg = substring(line, s0, s1)
    else: seg = LineString(list(substring(line, s0, L).coords) + list(substring(line, 0, s1 - L).coords)[1:])
    return seg.buffer(w / 2, cap_style=2, join_style=2).simplify(.4)

def frame(s):   # au point s du mur : le point, la tangente, la normale vers Paris
    p = line.interpolate(s % L); q = line.interpolate((s + 3) % L)
    tx, ty = q.x - p.x, q.y - p.y; n = math.hypot(tx, ty) or 1; tx, ty = tx / n, ty / n
    nx, ny = -ty, tx
    if not paris.contains(Point(p.x + nx * (T / 2 + GAP + 2), p.y + ny * (T / 2 + GAP + 2))) and paris.distance(Point(p.x + nx * 30, p.y + ny * 30)) > paris.distance(Point(p.x - nx * 30, p.y - ny * 30)): nx, ny = -nx, -ny
    return p.x, p.y, tx, ty, nx, ny

def rect(s, u0, u1, v0, v1):   # un rectangle dans le repère du mur au point s (u le long du mur, v vers Paris)
    x, y, tx, ty, nx, ny = frame(s)
    return [(x + tx * u + nx * v, y + ty * u + ny * v) for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]

height = lambda s: 58 + 5 * math.sin(s / 610) + 2.5 * math.sin(s / 173 + 1.3)
# les blocs de glace
s, nb = 0.0, 0
while s < L - 1:
    l = 45 + 30 * h01("l", nb); l = min(l, L - s) if L - s - l < 25 else l
    hb = height(s + l / 2) + (h01("h", nb) - .5) * 8
    g = band(s, s + l, T)
    if g.geom_type == "Polygon":
        poly(list(g.exterior.coords), "w", 0, hb, c=int(h01("c", nb) * 3))
        poly(list(g.exterior.coords), "t", hb, hb + 1.6)   # la neige sur le haut (un liseré blanc : on lit tout de suite « de la glace »)
    s += l; nb += 1
# les pics de glace, en gradins, sur le haut
s, ns = 60.0, 0
while s < L - 40:
    hb = height(s) + 3
    for k, (w, d1) in enumerate(((10, 8), (6.5, 7), (3, 6))):
        poly(rect(s, -w / 2, w / 2, -w / 2, w / 2), "s", hb - 3 if k == 0 else hb, hb + d1)
        hb += d1
    s += 120 + 100 * h01("s", ns); ns += 1
# les ascenseurs aux grandes portes
PORTES = {"Maillot": (2.2827, 48.8779), "Clichy": (2.3135, 48.8948), "Chapelle": (2.3594, 48.8985), "Villette": (2.3858, 48.8975),
          "Bagnolet": (2.4097, 48.8644), "Vincennes": (2.4105, 48.8471), "Italie": (2.3594, 48.8184), "Orléans": (2.3250, 48.8233),
          "Versailles": (2.2884, 48.8323), "Saint-Cloud": (2.2570, 48.8379)}
for nom, (lo, la) in PORTES.items():
    sp = line.project(Point(*to_m(lo, la))); H = height(sp) + 2; hc = round(H * .42, 1); v = T / 2
    poly(rect(sp, -9, 9, -v - 1, v + 1), "w", 0, H)                     # le bloc de glace sous la cabane
    poly(rect(sp, -2, 2, v, v + 2.5), "lw", 0, H + 4, p=nom)             # le rail
    poly(rect(sp, -5, 5, v + 2.5, v + 9.5), "lc", hc, hc + 7)            # la cabine
    for u in (-3.5, 3.5): poly(rect(sp, u - .35, u + .35, v + 5.6, v + 6.3), "lk", hc + 7, H + 3)   # ses deux câbles
    poly(rect(sp, -8, 8, -v + 1, v + 10), "lw", H, H + 9)                # la cabane du treuil
    poly(rect(sp, -9, 9, -v, v + 11), "lr", H + 9, H + 10.5)             # son toit enneigé
    poly(rect(sp, -7, 7, v + 1, v + 11), "lw", 0, 6)                     # la cabane d'en bas
    poly(rect(sp, -7.6, 7.6, v + .5, v + 11.6), "lr", 6, 7)              # son toit
# aucun volume du mur ne touche Paris ni un immeuble du bord (« sans abîmer la vue de Paris, surtout aux frontières »)
near = min(paris.distance(Polygon([to_m(*c) for c in f["geometry"]["coordinates"][0]])) for f in feats)
assert near > 5, f"le mur touche Paris ({near:.1f} m)"
print(f"le mur le plus près de Paris : {near:.1f} m")
# la ligne du mur (la carte dézoomée, et la caméra dehors ou dedans)
feats.append({"type": "Feature", "properties": {"k": "r"}, "geometry": {"type": "LineString", "coordinates": [to_ll(x, y) for x, y in line.coords]}})
out = {"type": "FeatureCollection", "features": feats}
s = json.dumps(out, separators=(",", ":"))
open(R + "mur.json", "w").write(s)
print(f"{nb} blocs, {ns} pics, {len(PORTES)} ascenseurs ; {len(feats)} volumes ; mur.json : {len(s) // 1024} Ko")

# la limite du vol, c'est le mur (26/10/2026, choix du propriétaire : « oui, le mur est la limite » ; avant : un rectangle autour
# de Paris, on pouvait voler un peu au-delà) : supabase/migration_mur.sql, généré ici avec la même ligne que le site (mur.json, k = "r") :
# _paris_ring() (la boucle), _in_paris(lon, lat), et fly / fly_quote avec ce contrôle en plus de l'ancien rectangle
S = os.path.dirname(os.path.abspath(__file__)) + "/../supabase/"
def fn(path, start):
    t = open(S + path, encoding="utf8").read(); i = t.index(start); j = t.index("\nend $$;", i) + len("\nend $$;")
    return t[i:j]
CHECK = "lo is null or la is null or lo < (cfg->>'w')::float8 or lo > (cfg->>'e')::float8 or la < (cfg->>'s')::float8 or la > (cfg->>'n')::float8"
fly, quote = fn("migration_vol.sql", "create or replace function fly("), fn("migration_viseur.sql", "create or replace function fly_quote(")
assert fly.count(CHECK) == 1 and quote.count(CHECK) == 1, "fly / fly_quote ont changé : revoir migration_mur.sql"
NEW = CHECK + " or not _in_paris(lo, la)"
ll = [to_ll(x, y) for x, y in line.coords]
xs, ys = [p[0] for p in ll], [p[1] for p in ll]
sql = f"""-- =====================================================================
--  Le mur de glace est la limite du vol (26/10/2026, choix du propriétaire : « oui, le mur est la limite »).
--  Avant : un rectangle autour de Paris (_world_cfg : w, e, s, n), on pouvait voler un peu au-delà de la ville.
--  Généré par scripts/make_wall.py (la même boucle que le mur dessiné par le site, data/mur.json) : ne pas éditer à la main.
--  fly et fly_quote sont celles de migration_vol.sql et migration_viseur.sql, avec « or not _in_paris(lo, la) » en plus.
-- =====================================================================
create or replace function _paris_ring() returns float8[] language sql immutable as $$
  select array[{",".join(f"{x},{y}" for x, y in ll)}]::float8[] $$;
revoke all on function _paris_ring() from public, anon, authenticated;

-- dans Paris = dans la boucle du mur (le rectangle d'abord, pour aller vite)
create or replace function _in_paris(x float8, y float8) returns boolean language plpgsql immutable as $$
declare r float8[] := _paris_ring(); n int := array_length(r, 1) / 2; i int; j int; ins boolean := false; xi float8; yi float8; xj float8; yj float8;
begin
  if x is null or y is null or x < {min(xs)} or x > {max(xs)} or y < {min(ys)} or y > {max(ys)} then return false; end if;
  j := n;
  for i in 1..n loop
    xi := r[2 * i - 1]; yi := r[2 * i]; xj := r[2 * j - 1]; yj := r[2 * j];
    if ((yi > y) <> (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi) then ins := not ins; end if;
    j := i;
  end loop;
  return ins;
end $$;
revoke all on function _in_paris(float8, float8) from public, anon, authenticated;

-- voler : jusqu'à un immeuble (p_card : on s'y pose, sa case s'ouvre) ou un point de la carte ; tout droit, au-dessus des toits
{fly.replace(CHECK, NEW)}

-- ce que coûterait un vol jusqu'à un point (ou un immeuble) : la distance, assez de km ?, le salaire, le péage — sans rien payer
{quote.replace(CHECK, NEW)}
"""
open(S + "migration_mur.sql", "w", encoding="utf8").write(sql)
print(f"migration_mur.sql : {len(ll)} points, {len(sql) // 1024} Ko")
