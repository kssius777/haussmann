"""Builds the walking graph between buildings (for the pawn and the dice).

Writes:
  public/data/cards.json  : adds centroid x/y (×1e5 degrees, ints) to each row
  public/data/edges.json  : [[a, b], ...] undirected links between neighbouring buildings
"""
import json, os, sys, math
import numpy as np
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

src, out = sys.argv[1], sys.argv[2]   # src = folder with index.json + a/*.json ; out = public/data
ix = json.load(open(os.path.join(src, 'index.json')))
ids, pts = [], []
for i, a in enumerate(ix['arr']):
    d = json.load(open(os.path.join(src, 'a', a['c'] + '.json')))
    for k, enc in enumerate(d['geo']):
        f = enc[0]; x, y = f[0] + 235000, f[1] + 4886000; sx, sy, n = x, y, 1
        for j in range(2, len(f), 2):
            x += f[j]; y += f[j + 1]; sx += x; sy += y; n += 1
        ids.append(i * 100000 + k); pts.append((sx / n / 1e5, sy / n / 1e5))
P = np.array(pts)
lat0 = 48.857
M = np.c_[P[:, 0] * 111320 * math.cos(math.radians(lat0)), P[:, 1] * 110574]   # metres
tree = cKDTree(M)
K, R = 6, 70.0
dist, nb = tree.query(M, k=K + 1, distance_upper_bound=R)
edges = set()
for i in range(len(ids)):
    for d, j in zip(dist[i][1:], nb[i][1:]):
        if j < len(ids) and d <= R:
            edges.add((min(i, j), max(i, j)))
# isolated buildings: link to their 2 nearest, whatever the distance
deg = np.zeros(len(ids), int)
for a, b in edges: deg[a] += 1; deg[b] += 1
for i in np.where(deg == 0)[0]:
    d, j = tree.query(M[i], k=3)
    for jj in j[1:]: edges.add((min(i, jj), max(i, jj)))
# connect every component to the main one (bridges over the Seine, parks…)
def comps():
    a = np.array(list(edges)); g = coo_matrix((np.ones(len(a)), (a[:, 0], a[:, 1])), shape=(len(ids), len(ids)))
    return connected_components(g, directed=False)
n, lab = comps()
while n > 1:
    sizes = np.bincount(lab); main = np.argmax(sizes)
    mi = np.where(lab == main)[0]; mt = cKDTree(M[mi])
    for c in range(n):
        if c == main: continue
        ci = np.where(lab == c)[0]
        d, j = mt.query(M[ci]); best = np.argmin(d)
        a, b = ci[best], mi[j[best]]; edges.add((min(a, b), max(a, b)))
    n, lab = comps()
print(len(ids), 'buildings,', len(edges), 'links, connected =', n == 1)
deg = np.zeros(len(ids), int)
for a, b in edges: deg[a] += 1; deg[b] += 1
print('degree min/mean/max', deg.min(), round(deg.mean(), 2), deg.max())
json.dump([[ids[a], ids[b]] for a, b in sorted(edges)], open(os.path.join(out, 'edges.json'), 'w'), separators=(',', ':'))
# add centroids to cards.json rows ( ×1e5 ints )
cards = json.load(open(os.path.join(out, 'cards.json')))
pos = {g: (round(x * 1e5), round(y * 1e5)) for g, (x, y) in zip(ids, pts)}
for r in cards:
    r[10:] = []
    r.extend(pos[r[0]])
json.dump(cards, open(os.path.join(out, 'cards.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
