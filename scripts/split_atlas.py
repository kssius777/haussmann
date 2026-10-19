"""Découpe les planches de photos (public/data/atlas/aN.jpg, 5 × 8 photos de 400 × 300) en une petite image par carte :
public/data/ph/N_k.webp. Le navigateur ne décode plus une planche entière (2000 × 2400, ~19 Mo en mémoire) pour afficher
une seule photo : c'est ce qui faisait monter la mémoire du jeu sur téléphone. Rejouable : les images déjà faites sont gardées.
Les photos Panoramax (jamais affichées) sont sautées.
Usage : python3 scripts/split_atlas.py [qualité=72]"""
import json, glob, os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "data")
Q = int(sys.argv[1]) if len(sys.argv) > 1 else 72
W, H, COLS = 400, 300, 5

F = json.load(open(os.path.join(ROOT, "index.json")))["fields"]
PH, CR = F.index("ph"), F.index("cr")
want = {}
for f in glob.glob(os.path.join(ROOT, "a", "*.json")):
    for r in json.load(open(f))["cards"]:
        ph = r[PH] if PH < len(r) else None
        if ph and "anoramax" not in (r[CR] or ""):
            want.setdefault(ph[0], set()).add(ph[1])

out = os.path.join(ROOT, "ph"); os.makedirs(out, exist_ok=True)
made = kept = 0; size = 0
for a in sorted(want):
    sheet = None
    for n in sorted(want[a]):
        dst = os.path.join(out, f"{a}_{n}.webp")
        if os.path.exists(dst): kept += 1; size += os.path.getsize(dst); continue
        if sheet is None: sheet = Image.open(os.path.join(ROOT, "atlas", f"a{a}.jpg")).convert("RGB")
        x, y = (n % COLS) * W, (n // COLS) * H
        sheet.crop((x, y, x + W, y + H)).save(dst, "WEBP", quality=Q, method=6)
        made += 1; size += os.path.getsize(dst)
print(f"{made} images faites, {kept} déjà là, {size / 1e6:.1f} Mo en tout")
