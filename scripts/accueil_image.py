"""L'image de la page d'accueil : la vraie carte du jeu vue de haut, les arrondissements aux couleurs des maires.
Une Paris de démonstration (pas la vraie partie) : chaque parti tient quelques arrondissements, 3 sont encore à prendre.
À lancer sur la base locale de test (elle est vidée !) avec le serveur local (sh test/up.sh) :
    python3 scripts/accueil_image.py
Écrit public/img/accueil-paris.webp (1280 × 980)."""
import asyncio, os, sys, uuid, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "test")); import db
from playwright.async_api import async_playwright
from PIL import Image
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "img"); os.makedirs(OUT, exist_ok=True)
MAP = {18: "poing", 19: "poing", 20: "poing", 10: "tendue", 11: "tendue", 13: "tendue", 14: "tendue", 2: "milieu", 9: "milieu", 12: "milieu", 15: "milieu",
       6: "valeurs", 7: "valeurs", 8: "valeurs", 17: "valeurs", 1: "rempart", 16: "rempart"}
async def main():
    db.sql("truncate profiles, lots, parts, arr_value, arr_state, listings, sales, news, fx, day_event, city_week, pay, offers restart identity cascade")
    who = {}
    for party in sorted(set(MAP.values())):
        u = str(uuid.uuid4()); db.sql("insert into auth.users(id) values (%s)", u); db.rpc(u, "join_game", p_pseudo="Demo" + party[:4].title(), p_party=party); who[party] = u
    for arr, party in MAP.items():
        for (g, lots, v) in db.sql("select id, lots, v from cards where arr=%s and lk='l' and lots between 4 and 30 order by v desc limit 6", arr):
            db.sql("insert into lots(card,k,owner) select %s, k, %s from generate_series(0, %s) k on conflict do nothing", g, who[party], min(lots, 4) - 1)
            db.sql("select _add_value(%s, %s::smallint, %s::bigint)", who[party], arr, v * min(lots, 4))
    db.sql("select _refresh_mayors(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20])")
    async with async_playwright() as p:
        br = await p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = await br.new_page(viewport={"width": 1280, "height": 980}, device_scale_factor=1)
        E = pg.evaluate; W = lambda js, t=120000: pg.wait_for_function(js, timeout=t, polling=200)
        em = f"accueil{int(time.time())}@test.fr"
        await pg.goto("http://localhost:8780/?local"); await W("!document.querySelector('#onb').hidden")
        await pg.click(".lhero [data-l=email], [data-l=email]"); await W("document.querySelector('#em')")
        await pg.fill("#em", em); await pg.fill("#pw", "secret12"); await pg.click("#authf button")
        await W("document.querySelector('#ps')"); await pg.fill("#ps", "Accueil"); await pg.click("#pf button"); await W("document.querySelector('#plater')"); await pg.click("#plater"); await W("document.querySelector('.welcome')")
        me = str(uuid.uuid5(uuid.NAMESPACE_URL, em)); db.sql("update profiles set welcome=0 where id=%s", me)
        await E("localStorage.setItem('hm_tut','99'); localStorage.setItem('hm_hint','1'); localStorage.setItem('hm_life','0'); 1")
        await pg.reload(); await W("ST.state && ST.state.profile && map && map.loaded()"); await pg.wait_for_timeout(2500)
        await pg.add_style_tag(content="#bar,#credbar,#tabs,.mapbottom,.maptop,#filter,.mapside,#partyleg,#score,#stripsum,#pawnoff,.dicebar,#b-pack,#b-chat,.plabel,.mmark,.smark,.pricetag,#movebar,.pawn,#coach{display:none!important}")
        await E("pawn3d && pawn3d.hide(); map.jumpTo({center:[2.3432,48.8566], zoom:12.35, pitch:42, bearing:-8}); 1"); await pg.wait_for_timeout(12000)
        png = os.path.join(OUT, "accueil-paris.png"); await pg.screenshot(path=png)
        await br.close()
    Image.open(png).convert("RGB").save(os.path.join(OUT, "accueil-paris.webp"), "WEBP", quality=80, method=6); os.remove(png)
    print("public/img/accueil-paris.webp", os.path.getsize(os.path.join(OUT, "accueil-paris.webp")) // 1024, "Ko")
asyncio.run(main())
