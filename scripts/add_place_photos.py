"""Photos des lieux (stations, jardins, places, gares, ponts, cimetières…) et des monuments nommés à la main.
Pour chaque lieu : l'image Wikidata (P18) sur Wikimedia Commons, son auteur et sa licence (crédit affiché sous la carte).
Les photos sont rangées dans de nouvelles planches public/data/atlas/aN.jpg (5 × 8 photos de 400 × 300, comme les autres) ;
scripts/split_atlas.py les découpe ensuite en public/data/ph/N_k.webp.
Écrit scripts/data/photos_lieux.json : {"q:Q…" ou "g:carte": {"ph": [planche, case], "cr": "Photo Auteur · Licence"}}.
Rejouable : les photos déjà téléchargées (scripts/data/.cache_photos/) ne sont pas redemandées ; un remplacement à la main se met
dans scripts/data/photos_choix.json ({"q:Q…": "Nom du fichier sur Commons.jpg"}, ou "" pour garder le dessin).
Une photo garde sa case pour toujours (les navigateurs gardent public/data une semaine en cache) : une photo changée prend
une nouvelle case, jamais celle d'une autre.
    python3 scripts/add_place_photos.py                 # télécharge ce qui manque puis range tout
    python3 scripts/add_place_photos.py --sans-reseau   # range seulement les photos déjà téléchargées"""
import json, os, re, sys, time, hashlib, html, urllib.parse, urllib.request
from io import BytesIO
from PIL import Image, ImageOps
H = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DD = os.path.join(H, "scripts", "data"); ATLAS = os.path.join(H, "public", "data", "atlas")
CACHE = os.path.join(DD, ".cache_photos"); os.makedirs(CACHE, exist_ok=True)
UA = "ProprioGame/1.0 (https://www.proprio.games; contact@proprio.games)"
W, HH, COLS, ROWS = 400, 300, 5, 8

want = {}   # clé → nom de fichier Commons
for f in ("stations.json", "places.json", "landmarks.json"):
    for s in json.load(open(os.path.join(DD, f))): want["q:" + s["qid"]] = s["image"]
for n in json.load(open(os.path.join(DD, "named.json"))):
    if n.get("image"): want["g:%d" % n["card"]] = n["image"]
choix = os.path.join(DD, "photos_choix.json")
if os.path.exists(choix): want.update(json.load(open(choix)))
want = {k: v for k, v in want.items() if v}   # "" = pas de photo, on garde le dessin
OFFLINE = "--sans-reseau" in sys.argv
print(len(want), "photos à trouver", flush=True)

def get(url, binary=False):
    for attempt in range(40):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60)
            return r.read() if binary else json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 503, 502):
                wait = int(e.headers.get("Retry-After") or 0) or 20 * (attempt + 1)
                print(f"  attente {wait} s ({e.code})", flush=True); time.sleep(min(wait + 5, 900)); continue   # on attend ce que Wikimedia demande
            raise
        except Exception as e:
            print("  réseau :", str(e)[:80], flush=True); time.sleep(10 * (attempt + 1))
    raise RuntimeError("abandon : " + url)

# 1) auteur, licence et adresse de la vignette (500 px), 50 fichiers par demande
meta_p = os.path.join(CACHE, "meta.json"); meta = json.load(open(meta_p)) if os.path.exists(meta_p) else {}
files = [] if OFFLINE else sorted({v for v in want.values() if v not in meta})
def clean(s):
    s = html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip(); s = re.sub(r"\s+", " ", s)
    return s
for i in range(0, len(files), 50):
    batch = files[i:i + 50]
    q = {"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url|extmetadata|size", "iiurlwidth": "500",
         "iiextmetadatafilter": "Artist|LicenseShortName|Credit", "titles": "|".join("File:" + f for f in batch)}
    j = get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(q))
    norm = {n["to"]: n["from"] for n in j["query"].get("normalized", [])}
    for p in j["query"]["pages"].values():
        title = norm.get(p["title"], p["title"]); fn = title[5:] if title.startswith("File:") else title
        ii = (p.get("imageinfo") or [{}])[0]; em = ii.get("extmetadata", {})
        artist = clean(em.get("Artist", {}).get("value")) or clean(em.get("Credit", {}).get("value"))
        meta[fn] = {"thumb": ii.get("thumburl"), "w": ii.get("width"), "h": ii.get("height"), "artist": artist[:70], "lic": clean(em.get("LicenseShortName", {}).get("value"))}
    json.dump(meta, open(meta_p, "w"), ensure_ascii=False); print(f"métadonnées {min(i + 50, len(files))}/{len(files)}", flush=True); time.sleep(2)

# 2) les vignettes
for k, fn in sorted(want.items()):
    m = meta.get(fn) or meta.get(fn.replace("_", " "))
    if not m or not m.get("thumb"): print("  pas trouvé sur Commons :", k, fn, flush=True); continue
    dst = os.path.join(CACHE, hashlib.md5(fn.encode()).hexdigest() + ".jpg")
    if os.path.exists(dst): continue
    if OFFLINE: print("  pas encore téléchargée :", k, flush=True); continue
    b = get(m["thumb"], binary=True); open(dst, "wb").write(b); time.sleep(4)
print("vignettes prêtes", flush=True)

# 3) les planches : 400 × 300 recadrées au centre (un peu plus haut pour les façades)
def first_free():
    n = max(int(x[1:-4]) for x in os.listdir(ATLAS) if re.match(r"a\d+\.jpg$", x)) + 1
    return n
old_p = os.path.join(DD, "photos_lieux.json"); old = json.load(open(old_p)) if os.path.exists(old_p) else {}
nxt = old.pop("_next", 0)   # la prochaine case jamais donnée (compte depuis la première planche des lieux)
base = old.pop("_base", None) or first_free()
PER = COLS * ROWS
keys = [k for k in sorted(want) if os.path.exists(os.path.join(CACHE, hashlib.md5(want[k].encode()).hexdigest() + ".jpg"))]
out = {}
for k in keys:
    fn = want[k]; m = meta.get(fn) or meta.get(fn.replace("_", " ")); o = old.get(k)
    if o and o.get("f") == fn: ph = o["ph"]
    else: ph = [base + nxt // PER, nxt % PER]; nxt += 1
    who = m["artist"] or "Wikimedia Commons"; lic = m["lic"] or "licence libre"
    out[k] = {"ph": ph, "cr": f"Photo {who} · {lic}", "f": fn}
# on refait les planches des lieux avec toutes les photos à leur case
sheets = {}
for k, v in out.items():
    a, n = v["ph"]
    if a not in sheets:
        f = os.path.join(ATLAS, f"a{a}.jpg")
        sheets[a] = Image.open(f).convert("RGB") if os.path.exists(f) else Image.new("RGB", (W * COLS, HH * ROWS), (240, 240, 240))
    im = ImageOps.exif_transpose(Image.open(os.path.join(CACHE, hashlib.md5(want[k].encode()).hexdigest() + ".jpg"))).convert("RGB")
    sheets[a].paste(ImageOps.fit(im, (W, HH), Image.LANCZOS, centering=(0.5, 0.42)), ((n % COLS) * W, (n // COLS) * HH))
for a, img in sheets.items(): img.save(os.path.join(ATLAS, f"a{a}.jpg"), "JPEG", quality=88)
json.dump({"_base": base, "_next": nxt, **out}, open(old_p, "w"), ensure_ascii=False, indent=0)
print(len(out), "photos rangées dans les planches", base, "à", base + max(nxt - 1, 0) // PER, "· ensuite : python3 scripts/add_spots.py puis python3 scripts/split_atlas.py")
