"""Ajoute les ponts et passerelles au graphe de marche du dé (public/data/edges.json + supabase/migration_ponts.sql).

Le graphe d'origine (build_graph.py) relie chaque immeuble à ses voisins à moins de 70 m : la Seine, plus large,
n'était presque jamais traversée, et depuis les îles on restait coincé sur une rive (sans téléportation, c'est pénalisant).
Ici : pour chaque tronçon de pont ou de passerelle de la Ville de Paris (streets.json), on relie les 3 immeubles les plus
proches de chaque extrémité (à moins de 110 m) aux 3 de l'autre extrémité. Rejouable : ne fait qu'ajouter des liens.
    python3 scripts/add_bridges.py
"""
import json, math, re
D = "public/data/"
cards = json.load(open(D + "cards.json"))
streets = json.load(open(D + "streets.json"))
edges = json.load(open(D + "edges.json"))
kx, ky = 111320 * math.cos(math.radians(48.857)), 110574
pts = [(r[0], r[10] / 1e5 * kx, r[11] / 1e5 * ky) for r in cards]
cell = {}
for g, x, y in pts: cell.setdefault((int(x // 100), int(y // 100)), []).append((g, x, y))
def near(lon, lat, k=3, R=110):
    x, y = lon * kx, lat * ky; out = []
    for i in range(int(x // 100) - 2, int(x // 100) + 3):
        for j in range(int(y // 100) - 2, int(y // 100) + 3):
            for g, gx, gy in cell.get((i, j), []):
                d = math.hypot(gx - x, gy - y)
                if d <= R: out.append((d, g))
    return [g for d, g in sorted(out)[:k]]
have = {(a, b) for a, b in edges} | {(b, a) for a, b in edges}
new, nb = [], 0
for name, line in streets:
    if not re.match(r"^(Pont|Passerelle|Petit Pont)", name): continue
    (x0, y0), (x1, y1) = line[0], line[-1]
    if math.hypot((x1 - x0) * kx, (y1 - y0) * ky) < 25: continue
    A, B = near(x0, y0), near(x1, y1); nb += 1
    for a in A:
        for b in B:
            if a != b and (a, b) not in have: have.add((a, b)); have.add((b, a)); new.append((min(a, b), max(a, b)))
new = sorted(set(new))
json.dump(sorted({(min(a, b), max(a, b)) for a, b in edges} | set(new)), open(D + "edges.json", "w"), separators=(",", ":"))
vals = ",\n".join(f"({a},{b}),({b},{a})" for a, b in new)
open("supabase/migration_ponts.sql", "w").write(f"""-- =====================================================================
--  Les ponts et passerelles dans le graphe de marche du dé (19/10/2026, demande du propriétaire :
--  depuis les îles, on doit toujours pouvoir passer sur l'autre rive). Généré par scripts/add_bridges.py.
--  Rejouable sans risque : on ne fait qu'ajouter des liens (dans les deux sens).
-- =====================================================================
insert into edges(a, b) values
{vals}
on conflict do nothing;
""")
print(nb, "tronçons de ponts,", len(new), "liens ajoutés")
