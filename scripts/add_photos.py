"""Ajoute des photos libres (Wikimedia Commons, via Wikidata) aux cartes qui n'en ont pas.
Entrées : new.json (carte → image Wikidata), meta.json (auteur, licence), img/<carte>.jpg (vignettes).
Sorties : nouvelles planches public/data/atlas/aN.jpg (5 × 8 photos de 400 × 300) et champs ph / cr des cartes.
Rejouable : une carte qui a déjà une bonne photo est ignorée."""
import json, os, re, sys, glob
from PIL import Image, ImageOps
SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/claude-0/ph/"
H = os.path.join(os.path.dirname(__file__), "..", "public", "data") + "/"
IDX = json.load(open(H + "index.json")); F = IDX["fields"]; iph, icr = F.index("ph"), F.index("cr")
new = json.load(open(SRC + "new.json")); meta = json.load(open(SRC + "meta.json"))
FREE = re.compile(r"^(CC0|CC BY(-SA)? \d|Public domain|PD|Domaine public)", re.I)
files = {a["c"]: json.load(open(H + "a/%s.json" % a["c"])) for a in IDX["arr"]}
def row(g): return files[IDX["arr"][g // 100000]["c"]]["cards"][g % 100000]
todo = []
for o in new:
    m = meta.get(o["img"]); fn = SRC + "img/%d.jpg" % o["g"]
    if not m or not FREE.match(m["lic"] or "") or not os.path.exists(fn): continue
    if re.search(r"(plan|carte|map|logo|blason|plaque|signature|coat.of.arms|diagram|schema|\.svg|\.pdf|\.tif)", o["img"], re.I): continue
    if m.get("w") and m.get("h") and not (0.3 < m["w"] / m["h"] < 2.6): continue
    r = row(o["g"])
    if r[iph] and "anoramax" not in (r[icr] or ""): continue
    todo.append((o, m, fn))
print("à ajouter :", len(todo))
nxt = max(int(f[1:-4]) for f in os.listdir(H + "atlas")) + 1
for s in range(0, len(todo), 40):
    sheet = Image.new("RGB", (2000, 2400), (236, 237, 239)); a = nxt; nxt += 1; used = 0
    for n, (o, m, fn) in enumerate(todo[s:s + 40]):
        try:
            im = ImageOps.exif_transpose(Image.open(fn)).convert("RGB")
        except Exception as e:
            print("illisible", fn, e); continue
        w, h = im.size; k = max(400 / w, 300 / h); im = im.resize((max(400, round(w * k)), max(300, round(h * k))), Image.LANCZOS)
        w, h = im.size; x = (w - 400) // 2; y = int((h - 300) * 0.35)   # un peu au-dessus du centre : la façade plutôt que le trottoir
        sheet.paste(im.crop((x, y, x + 400, y + 300)), ((n % 5) * 400, (n // 5) * 300))
        r = row(o["g"]); r[iph] = [a, n]
        artist = re.sub(r"\s+", " ", m["artist"] or "Wikimedia Commons").strip()[:40]
        r[icr] = "Photo %s · %s" % (artist, m["lic"]); used += 1
    sheet.save(H + "atlas/a%d.jpg" % a, quality=80, optimize=True, progressive=True)
    print("planche", a, used)
for c, d in files.items():
    json.dump(d, open(H + "a/%s.json" % c, "w"), separators=(",", ":"), ensure_ascii=False)
