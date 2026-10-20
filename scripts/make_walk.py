"""Le plan pour marcher dans le monde ouvert, tout Paris (20/10/2026 ; essai dans le 7e le même jour) :
les rues de streets.json (données « voie » de la Ville de Paris), ponts et passerelles compris, reliées en un seul réseau,
et les lignes de métro dans Paris (dans l'ordre des stations). Écrit public/data/walk.json :
  zone   : le contour de Paris où l'on marche (les 20 arrondissements, bois compris, + 150 m), en [lon, lat]
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
BUF = 150   # la marge autour de Paris (mètres) : on marche sur les boulevards des Maréchaux et un peu au-delà
KX = 111320 * math.cos(math.radians(48.856)); KY = 110574
def dec(f):
    x, y = f[0] + 235000, f[1] + 4886000; o = [(x / 1e5, y / 1e5)]
    for k in range(2, len(f), 2): x += f[k]; y += f[k + 1]; o.append((x / 1e5, y / 1e5))
    return o
m = lambda p: (p[0] * KX, p[1] * KY)
g = lambda p: (p[0] / KX, p[1] / KY)
P = unary_union([Polygon([m(p) for p in dec(r)]) for A in I["arr"] for r in A["outline"]])
Z = P.buffer(BUF).simplify(12)
if Z.geom_type != "Polygon": Z = max(Z.geoms, key=lambda g: g.area)

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

# 5) le métro : les lignes dans Paris, dans l'ordre (une ligne à branches = plusieurs suites ; une boucle = une station répétée)
SEQ = {
  "1": [["Porte Maillot", "Argentine", "Charles de Gaulle – Étoile", "George V", "Franklin D. Roosevelt", "Champs-Élysées – Clemenceau", "Concorde", "Tuileries", "Palais Royal – Musée du Louvre", "Louvre – Rivoli", "Châtelet", "Hôtel de Ville", "Saint-Paul", "Bastille", "Gare de Lyon", "Reuilly – Diderot", "Nation", "Porte de Vincennes"]],
  "2": [["Porte Dauphine", "Victor Hugo", "Charles de Gaulle – Étoile", "Ternes", "Courcelles", "Monceau", "Villiers", "Rome", "Place de Clichy", "Blanche", "Pigalle", "Anvers", "Barbès – Rochechouart", "La Chapelle", "Stalingrad", "Jaurès", "Colonel Fabien", "Belleville", "Couronnes", "Ménilmontant", "Père Lachaise", "Philippe Auguste", "Alexandre Dumas", "Avron", "Nation"]],
  "3": [["Porte de Champerret", "Pereire", "Wagram", "Malesherbes", "Villiers", "Europe", "Saint-Lazare", "Havre – Caumartin", "Opéra", "Quatre-Septembre", "Bourse", "Sentier", "Réaumur – Sébastopol", "Arts et Métiers", "Temple", "République", "Parmentier", "Rue Saint-Maur", "Père Lachaise", "Gambetta", "Porte de Bagnolet"]],
  "3bis": [["Gambetta", "Pelleport", "Saint-Fargeau", "Porte des Lilas"]],
  "4": [["Porte de Clignancourt", "Simplon", "Marcadet – Poissonniers", "Château Rouge", "Barbès – Rochechouart", "Gare du Nord", "Gare de l'Est", "Château d'Eau", "Strasbourg – Saint-Denis", "Réaumur – Sébastopol", "Étienne Marcel", "Les Halles", "Châtelet", "Cité", "Saint-Michel", "Odéon", "Saint-Germain-des-Prés", "Saint-Sulpice", "Saint-Placide", "Montparnasse – Bienvenüe", "Vavin", "Raspail", "Denfert-Rochereau", "Mouton-Duvernet", "Alésia", "Porte d'Orléans"]],
  "5": [["Porte de Pantin", "Ourcq", "Laumière", "Jaurès", "Stalingrad", "Gare du Nord", "Gare de l'Est", "Jacques Bonsergent", "République", "Oberkampf", "Richard-Lenoir", "Bréguet – Sabin", "Bastille", "Quai de la Rapée", "Gare d'Austerlitz", "Saint-Marcel", "Campo-Formio", "Place d'Italie"]],
  "6": [["Charles de Gaulle – Étoile", "Kléber", "Boissière", "Trocadéro", "Passy", "Bir-Hakeim", "Dupleix", "La Motte-Picquet – Grenelle", "Cambronne", "Sèvres – Lecourbe", "Pasteur", "Montparnasse – Bienvenüe", "Edgar Quinet", "Raspail", "Denfert-Rochereau", "Saint-Jacques", "Glacière", "Corvisart", "Place d'Italie", "Nationale", "Chevaleret", "Quai de la Gare", "Bercy", "Dugommier", "Daumesnil", "Bel-Air", "Picpus", "Nation"]],
  "7": [["Porte de la Villette", "Corentin Cariou", "Crimée", "Riquet", "Stalingrad", "Louis Blanc", "Château-Landon", "Gare de l'Est", "Poissonnière", "Cadet", "Le Peletier", "Chaussée d'Antin – La Fayette", "Opéra", "Pyramides", "Palais Royal – Musée du Louvre", "Pont-Neuf", "Châtelet", "Pont Marie", "Sully – Morland", "Jussieu", "Place Monge", "Censier – Daubenton", "Les Gobelins", "Place d'Italie", "Tolbiac", "Maison Blanche", "Porte d'Italie"], ["Maison Blanche", "Porte de Choisy", "Porte d'Ivry"]],
  "7bis": [["Louis Blanc", "Jaurès", "Bolivar", "Buttes Chaumont", "Botzaris", "Place des Fêtes", "Pré-Saint-Gervais", "Danube", "Botzaris"]],
  "8": [["Balard", "Lourmel", "Boucicaut", "Félix Faure", "Commerce", "La Motte-Picquet – Grenelle", "École Militaire", "La Tour-Maubourg", "Invalides", "Concorde", "Madeleine", "Opéra", "Richelieu – Drouot", "Grands Boulevards", "Bonne Nouvelle", "Strasbourg – Saint-Denis", "République", "Filles du Calvaire", "Saint-Sébastien – Froissart", "Chemin Vert", "Bastille", "Ledru-Rollin", "Faidherbe – Chaligny", "Reuilly – Diderot", "Montgallet", "Daumesnil", "Michel Bizot", "Porte Dorée", "Porte de Charenton"]],
  "9": [["Porte de Saint-Cloud", "Exelmans", "Michel-Ange – Molitor", "Michel-Ange – Auteuil", "Jasmin", "Ranelagh", "La Muette", "Rue de la Pompe", "Trocadéro", "Iéna", "Alma – Marceau", "Franklin D. Roosevelt", "Saint-Philippe du Roule", "Miromesnil", "Saint-Augustin", "Havre – Caumartin", "Chaussée d'Antin – La Fayette", "Richelieu – Drouot", "Grands Boulevards", "Bonne Nouvelle", "Strasbourg – Saint-Denis", "République", "Oberkampf", "Saint-Ambroise", "Voltaire", "Charonne", "Rue des Boulets", "Nation", "Buzenval", "Maraîchers", "Porte de Montreuil"]],
  "10": [["Porte d'Auteuil", "Michel-Ange – Auteuil", "Église d'Auteuil", "Javel – André Citroën"], ["Michel-Ange – Molitor", "Chardon-Lagache", "Mirabeau", "Javel – André Citroën", "Charles Michels", "Avenue Émile Zola", "La Motte-Picquet – Grenelle", "Ségur", "Duroc", "Vaneau", "Sèvres – Babylone", "Mabillon", "Odéon", "Cluny – La Sorbonne", "Maubert – Mutualité", "Cardinal Lemoine", "Jussieu", "Gare d'Austerlitz"]],
  "11": [["Châtelet", "Hôtel de Ville", "Rambuteau", "Arts et Métiers", "République", "Goncourt", "Belleville", "Pyrénées", "Jourdain", "Place des Fêtes", "Télégraphe", "Porte des Lilas"]],
  "12": [["Porte de la Chapelle", "Marx Dormoy", "Marcadet – Poissonniers", "Jules Joffrin", "Lamarck – Caulaincourt", "Abbesses", "Pigalle", "Saint-Georges", "Notre-Dame-de-Lorette", "Trinité – d'Estienne d'Orves", "Saint-Lazare", "Madeleine", "Concorde", "Assemblée nationale", "Solférino", "Rue du Bac", "Sèvres – Babylone", "Rennes", "Notre-Dame-des-Champs", "Montparnasse – Bienvenüe", "Falguière", "Pasteur", "Volontaires", "Vaugirard", "Convention", "Porte de Versailles"]],
  "13": [["Porte de Saint-Ouen", "Guy Môquet", "La Fourche"], ["Porte de Clichy", "Brochant", "La Fourche", "Place de Clichy", "Liège", "Saint-Lazare", "Miromesnil", "Champs-Élysées – Clemenceau", "Invalides", "Varenne", "Saint-François-Xavier", "Duroc", "Montparnasse – Bienvenüe", "Gaîté", "Pernety", "Plaisance", "Porte de Vanves"]],
  "14": [["Porte de Clichy", "Pont Cardinet", "Saint-Lazare", "Madeleine", "Pyramides", "Châtelet", "Gare de Lyon", "Bercy", "Cour Saint-Émilion", "Bibliothèque François-Mitterrand", "Olympiades", "Maison Blanche"]],
}
st = {s[5].replace("Métro ", ""): s for s in I["spots"] if s[1] == "m"}
metro, seen, bad = {}, set(), []
for line, branches in SEQ.items():
    for names in branches:
        missing = [n for n in names if n not in st]
        if missing: print("  station inconnue :", line, missing); continue
        seq = [st[n][0] for n in names]
        for a_, b_ in zip(names, names[1:]):   # deux stations qui se suivent : jamais à plus de 1,6 km
            d = math.hypot(*(lambda p, q: (p[0] - q[0], p[1] - q[1]))(m((st[a_][3], st[a_][4])), m((st[b_][3], st[b_][4]))))
            if d > 1600: bad.append((line, a_, b_, round(d)))
        metro.setdefault(line, []).append(seq); seen.update(names)
alls = {s[5].replace("Métro ", "") for s in I["spots"] if s[1] == "m"}
if alls - seen: print("  stations sur aucune ligne :", sorted(alls - seen))
if bad: print("  stations trop loin l'une de l'autre :", bad)

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
dst = os.path.join(H, "public", "data", "walk.json")
json.dump(out, open(dst, "w"), separators=(",", ":"))
km = sum(math.hypot(*(lambda a, b: (a[0] - b[0], a[1] - b[1]))(m(out_n[a]), m(out_n[b]))) for a, b in edges) / 1000
print(f"{len(out_n)} points, {len(edges)} tronçons, {km:.0f} km de rues ; {joined} « T » raccrochés ; {len(comps) - 1} petits morceaux laissés ;",
      "métro :", sum(len(b) for v in metro.values() for b in v), "arrêts sur", len(metro), f"lignes ; {os.path.getsize(dst) // 1024} Ko")
