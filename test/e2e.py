import asyncio, math, sys, time, os, json, uuid
sys.path.insert(0, os.path.dirname(__file__)); import db
from playwright.async_api import async_playwright
T = os.path.join(os.path.dirname(__file__), "shots") + "/"; os.makedirs(T, exist_ok=True)
R = []
def check(n, ok, info=""): R.append(ok); print(("PASS " if ok else "FAIL ") + n + (f"  · {info}" if info != "" else ""), flush=True)
async def main():
    db.sql("truncate profiles, lots, parts, arr_value, arr_state, listings, sales, news, fx, day_event, city_week, pay, walkers, world_people, chance_taken, chat_msg, place_people restart identity cascade")
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 400, "height": 820}, device_scale_factor=2)
        errs = []
        pg.on("pageerror", lambda e: errs.append("ERR " + str(e)[:300]))
        pg.on("console", lambda m: m.type == "error" and errs.append("console: " + m.text[:200]))
        E = pg.evaluate; W = lambda js, t=30000: pg.wait_for_function(js, timeout=t, polling=50)
        async def slide(sel):   # acheter en glissant : on pousse le rond jusqu'au bout, comme un joueur
            box = await pg.locator(sel).first.bounding_box(); y = box["y"] + box["height"] / 2
            await pg.mouse.move(box["x"] + 28, y); await pg.mouse.down()
            for i in range(1, 13): await pg.mouse.move(box["x"] + 28 + (box["width"] - 40) * i / 12, y)
            await pg.mouse.up()
        t = time.time(); await pg.goto(f"http://localhost:{os.environ.get('E2E_PORT', '8780')}/?local")   # E2E_PORT=8781 : un 2e serveur (HM_DB=hm2)
        await W("!document.querySelector('#onb').hidden", 60000)
        check(f"écran de connexion ({time.time()-t:.1f} s)", True)
        await W("document.querySelector('.landing .fan .hc')"); await pg.wait_for_timeout(500)
        check("accueil B : le titre, la carte des partis et les cartes avec leur ruban", await E("document.querySelector('.landing.v3 h1').textContent.includes('Collectionnez Paris') && !!document.querySelector('.landing.v3 .shot') && document.querySelectorAll('.landing.v3 .fan .hc.pr .rib').length === 4"))
        await pg.screenshot(path=T + "00_landing.png", timeout=120000); await pg.screenshot(path=T + "00b_landing_full.png", full_page=True, timeout=120000)
        await E("document.querySelector('#onb').scrollTop=99999; 1"); await pg.wait_for_timeout(200); await pg.screenshot(path=T + "00c_landing_bottom.png", timeout=120000)
        await pg.click(".lhero [data-l=email]"); await W("document.querySelector('#em')")
        await pg.screenshot(path=T + "01_login.png", timeout=120000)
        await pg.fill("#em", "alice@test.fr"); await pg.fill("#pw", "secret12"); await pg.click("#authf button")
        await W("document.querySelector('#ps')")
        await pg.fill("#ps", "Alice"); await pg.click("#pf button")
        await W("document.querySelector('.onb.opty .sp-node')"); await pg.click(".sp-node[data-party=valeurs]"); await pg.wait_for_timeout(200); await pg.screenshot(path=T + "01b_party.png", timeout=120000)
        check("inscription : le parti est proposé tout de suite, avec « plus tard »", await E("!document.querySelector('#pgo').disabled && !!document.querySelector('#plater') && document.querySelector('.opdet').innerText.includes('Droite')"))
        await pg.click("#plater")
        await W("document.querySelector('.welcome')"); await E("localStorage.setItem('hm_tut','99'); 1"); await pg.wait_for_timeout(400); await pg.screenshot(path=T + "02_welcome.png", timeout=120000)
        check("bienvenue : 1 M€ et 5 boosters expliqués, sans choix de parti", await E("!ST.state.profile.party && document.querySelector('.welcome').innerText.includes('boosters pour démarrer')"))
        await pg.click("[data-w=open]")
        await W("!document.querySelector('#reveal').hidden && document.querySelector('#rpack .sachet.open')", 30000)
        await W("document.querySelector('#slot .hc')")
        await pg.wait_for_timeout(700); await pg.screenshot(path=T + "03_reveal.png", timeout=120000)
        n = 0
        for i in range(10):
            if await E("!!document.querySelector('.sumgrid')"): break
            await pg.click("#reveal", position={"x": 200, "y": 400}); n += 1; await pg.wait_for_timeout(120)
        await W("document.querySelector('.sumgrid')")
        cards = await E("document.querySelectorAll('.sumgrid .hc').length")
        check("premier booster ouvert automatiquement, cartes une par une puis résumé", cards >= 5, f"{cards} cartes, {n} touches")
        await pg.wait_for_timeout(600); await pg.screenshot(path=T + "04_summary.png", timeout=120000)
        await pg.click("[data-r=again]")
        for k in range(4):
            await W("document.querySelector('#slot .hc')")
            for i in range(12):
                if await E("!!document.querySelector('.sumgrid')"): break
                await pg.click("#reveal", position={"x": 200, "y": 400}); await pg.wait_for_timeout(60)
            await W("document.querySelector('.sumgrid')")
            if k < 3:
                if await E("!!document.querySelector('[data-r=again]')"): await pg.click("[data-r=again]")
                else: break
        st = await E("({w:ST.state.profile.welcome, n:ST.mine.size+ST.mineParts.size, cash:ST.state.profile.cash})")
        check("5 boosters de bienvenue ouverts", st["w"] <= 4 and st["n"] >= 15, st)
        await pg.click("[data-r=map]"); await W("!document.querySelector('#p-map').hidden")
        await pg.wait_for_timeout(2500); await pg.screenshot(path=T + "05_map.png", timeout=120000)
        check("carte : maires affichés", await E("ST.mayors.filter(Boolean).length") > 0, await E("document.querySelector('#score').innerText.slice(0,120)"))
        await pg.click("[data-m=mine]"); await pg.wait_for_timeout(1800); await pg.screenshot(path=T + "06_map_mine.png", timeout=120000)
        await pg.click("[data-m=all]")
        # le départ est tiré au hasard devant un grand lieu (21/10/2026) ; la suite du test a ses repères devant Notre-Dame
        await W("W.on && !!meP()", 40000); uid = await E("ME"); p0 = await E("[meP().lon, meP().lat]"); SP = db.sql("select _wspawns()")[0][0]
        check("départ : devant un des 29 grands lieux, tiré au hasard", min(abs(p0[0] - a) * 73240 + abs(p0[1] - b) * 110574 for a, b in SP) < 15, p0)
        db.sql("update walkers set lon=2.3486, lat=48.85203, lon0=2.3486, lat0=48.85203, dur=0, path=null, settled=true where user_id=%s", uid)   # (l'ancien départ : 18 rue de la Bûcherie)
        db.sql("update world_people set lon=2.3486, lat=48.85203, cell=_wcell(2.3486, 48.85203) where user_id=%s", uid)
        await pg.reload(); await W("typeof W !== 'undefined' && W.on && !!meP() && mapReady", 120000)
        # la montgolfière vole où l'on veut (26/10/2026, « en cliquant, on va se déplacer là où on veut, pile poil ») : au milieu du
        # dock, sa montgolfière et ses km (5) ; sa montgolfière en 3D (25/10/2026)
        await W("W.on && !!meP()", 40000); await E("centerOnMe(false); 1"); await pg.wait_for_timeout(1500); await W("!map.isMoving() && map.areTilesLoaded()", 30000); await pg.wait_for_timeout(1000)
        await pg.screenshot(path=T + "05b_walker.png", timeout=120000)
        check("Paris : sa montgolfière sur la carte (« Vous »), au milieu du dock sa montgolfière et ses 5 km", await E("!!document.querySelector('#b-main .mi svg') && document.querySelector('#rollsn').textContent === '5 km' && !document.querySelector('.t-chat') && meP().el.style.display !== 'none' && meP().el.textContent.includes('Vous') && (!window.people3d || people3d.count() >= 1)"), await E("document.querySelector('#rollsn').textContent"))
        check("la carte en tuiles : immeubles et ponts chargés", await E("map.querySourceFeatures('pv', {sourceLayer: 'b'}).length > 200 && map.querySourceFeatures('pv', {sourceLayer: 'bridges'}).length > 0"), await E("[map.querySourceFeatures('pv', {sourceLayer: 'b'}).length, map.querySourceFeatures('pv', {sourceLayer: 'bridges'}).length]"))
        check("les façades : la carte graphique dessine fenêtres, balcons et étage en zinc (recette acceptée ; tuiles du zoom 15 avec f)",
              await E("(FAC.ok === true || FAC.slow) && map.querySourceFeatures('pv', {sourceLayer: 'b'}).some(f => f.properties.f >= 16 && f.properties.f < 80)"), await E("[FAC.ok, FAC.slow]"))
        check("les bulles des lieux : 7 au plus, aucune sur une autre, seulement près de soi (21/10/2026, « trop de bulles »)", await E("""(() => { renderLabels();
          const v = [...document.querySelectorAll('.mmark,.smark')].filter(e => e.isConnected && !e.classList.contains('lhide') && !e.classList.contains('undertop')).map(e => e.getBoundingClientRect()).filter(r => r.width);
          const hit = v.some((a, i) => v.some((b, j) => j > i && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
          return v.length <= 7 && !hit && monMarks.every(m => !m.on || m.d <= lblReach('mon', map.getZoom())) && spotMarks.every(s => !s.on || s.d <= lblReach('spot', map.getZoom())); })()"""))
        check("en bas : sa montgolfière au milieu, « Salon » à côté, les boosters (plus de dé ni de « Moi »)", await E("!document.querySelector('#b-say').hidden && !document.querySelector('#b-me') && !document.querySelector('#b-main .dsvg') && !!document.querySelector('#b-pack')"))
        # toucher un immeuble libre : sa case avec « Y aller » ; on y vole, on s'y pose, sa case s'ouvre ; libre : on l'achète en glissant
        fb = await E("""(() => { const r = map.getContainer().getBoundingClientRect(), m = meP();
          for (let y = 170; y < r.height - 280; y += 21) for (let x = 24; x < r.width - 24; x += 21) {
            const f = map.queryRenderedFeatures([x, y], { layers: ['bd', 'rf'] }); const g = f.length ? f[0].id : null; if (g == null) continue;
            const c = card(g); if (!c || c.lk !== 'l' || freeOf(g) <= 0 || ST.own.has(g)) continue;
            const d = mLL([m.lon, m.lat], centerOf(g)); if (d < 60 || d > 600) continue;
            const el = document.elementFromPoint(r.left + x, r.top + y); if (!el || el.tagName !== 'CANVAS') continue;
            return { g, pt: [r.left + x, r.top + y], d: Math.round(d) }; } return null; })()""")
        await pg.mouse.click(fb["pt"][0], fb["pt"][1]); await W("document.querySelector('#movebar [data-lgo]')", 15000); gch = fb["g"]
        check("toucher un immeuble : sa case, avec « Y aller · N m » (on n'achète qu'en s'y posant)", await E(f"/^Y aller · \\d+ m$/.test(document.querySelector('#movebar [data-lgo]').textContent.trim()) && !document.querySelector('#movebar [data-lbuy]') && landView && sel === {gch}"),
              (fb, await E("document.querySelector('#movebar [data-lgo]').textContent")))
        await pg.wait_for_timeout(300); await pg.screenshot(path=T + "05c_yaller.png", timeout=120000)
        await pg.click("#movebar [data-lgo]"); await pg.wait_for_timeout(200)
        check("« Y aller » : sa montgolfière y vole tout droit (trajet dessiné, 1,2 à 3 s), la case se ferme, l'immeuble visé en vert", await E(f"!!W.run && W.run.g === {gch} && meP().path?.length === 2 && !!map.getSource('wroute') && document.querySelector('#movebar').hidden && W.run.dur >= 1.19 && W.run.dur <= 3.01 && map.getFeatureState({{ id: {gch}, source: 'pv', sourceLayer: 'b' }}).dst === 2"))
        # au milieu du vol (on y avance la montgolfière : le rendu logiciel est trop lent pour tomber dessus à coup sûr), elle est montée
        mid = await E("""new Promise(r => { const m = meP(); if (!m.path) return r(-1); const d0 = m.dur; m.dur = 30; m.t0 = performance.now() - 15000;
          requestAnimationFrame(() => requestAnimationFrame(() => { const a = m.alt || 0; m.dur = d0; m.t0 = performance.now() - d0 * 500; r(a); })); })""")
        await W("!W.run", 60000); await W("!document.querySelector('#movebar').hidden", 15000); await pg.wait_for_timeout(600)
        check("… en volant, elle monte au-dessus des toits, puis redescend sur l'immeuble", mid > .8 and await E("!meP().alt"), mid)
        cam = await E("(() => ({ on: CAM.on, z: +map.getZoom().toFixed(1), pitch: +map.getPitch().toFixed(0) }))()")
        check("posée : la caméra proche et inclinée sur sa montgolfière (« derrière le perso »), elle est redescendue", cam["on"] and cam["z"] >= 16.5 and cam["pitch"] >= 55 and await E("!meP().alt"), cam)
        check("posée : sa case s'ouvre, un salaire par km volé, des km en moins", await E(f"ST.state.profile.land === {gch} && panelKind === 'land' && !landView && kmLeft() < 4.99 && document.querySelector('#rollsn').textContent !== '5 km'")
              and db.sql("select land from profiles where id=%s", uid)[0][0] == gch and db.sql("select count(*) from ledger where owner=%s and kind='salary' and label like 'Salaire · %% km'", uid)[0][0] == 1,
              await E("document.querySelector('#rollsn').textContent"))
        ng = gch
        await W("document.querySelector('#movebar [data-lbuy]:not([disabled])')", 15000)
        await pg.wait_for_timeout(500); await pg.screenshot(path=T + "05e_buy.png", timeout=120000)
        await pg.click("[data-lbuy]"); await pg.wait_for_timeout(400)
        check("un simple toucher sur le bouton d'achat n'achète pas", await E(f"!(ST.mine.get({ng})||[]).length && !ST.mineParts.has({ng})"))
        await slide("[data-lbuy]")
        try: await W(f"(ST.mine.get({ng})||[]).length>=1 || ST.mineParts.has({ng})", 10000)
        except Exception: print("ACHAT KO:", await E("document.querySelector('#toast')?.innerText"), await E("document.querySelector('#movebar').innerText.slice(0,300)")); raise
        await pg.wait_for_timeout(500); await pg.screenshot(path=T + "05f_bought.png", timeout=120000); check("achat en glissant, là où l'on s'est posé", True)
        await pg.click("#movebar [data-mvclose]"); await W("document.querySelector('#movebar').hidden")
        await E("localStorage.setItem('hm_hist', JSON.stringify({'2026-01-01':900000,'2026-01-02':1100000})); 1")   # 2 jours d'historique : la courbe s'affiche
        await pg.click("#tabs [data-tab=assets]"); await W("document.querySelector('#p-assets .kpi')")
        check("patrimoine : courbe d'évolution affichée", await E("!!document.querySelector('#p-assets .aspark svg')"))
        await pg.wait_for_timeout(500); await pg.screenshot(path=T + "07_assets.png", timeout=120000)
        await E("document.querySelector('#p-assets').scrollTop=700"); await pg.wait_for_timeout(300); await pg.screenshot(path=T + "07b_assets.png", timeout=120000)
        check("patrimoine : collection affichée", await E("document.querySelectorAll('#p-assets .grid-cards .hc').length") > 3)
        # achat direct d'un immeuble qu'on ne possède pas, depuis l'aperçu de la carte
        await pg.click("#tabs [data-tab=map]"); await pg.wait_for_timeout(300)
        fg = await E("(async()=>{ await loadArr(10); for(let k=0;k<4000;k++){ const g=10*1e5+k, c=card(g); if(c&&c.lk==='l'&&c.lots>=4&&c.lots<=12&&!ST.own.has(g)&&c.v<300000) return g; } })()")
        await E(f"previewBuilding({fg}); 1"); await W("document.querySelector('#movebar .lb [data-lopen]')"); await pg.wait_for_timeout(300); await pg.screenshot(path=T + "06a_preview_far.png", timeout=120000)
        check("un immeuble lointain : sa case avec « Y aller · N km » et sa fiche, pas d'achat avant de s'y poser", await E("!document.querySelector('#movebar [data-lbuy]') && /^Y aller · [\\d,]+ k?m$/.test(document.querySelector('#movebar [data-lgo]')?.textContent.trim() || '') && !!document.querySelector('#movebar .lb [data-lopen]')"), await E("document.querySelector('#movebar .lb').innerText.replace(/\\n/g, ' · ')"))
        # bug du 19/10/2026 : toucher la carte loin de chez soi (ou revenir d'une fiche) déplaçait la carte
        await E(f"map.jumpTo({{center: centerOf({fg}), zoom: 16}}); previewBuilding({fg}); 1"); await W("document.querySelector('#movebar .lb [data-lopen]')"); await pg.wait_for_timeout(600)
        far = await E("""(async () => { const c0 = map.getCenter(); let pt = null;
          for (let y = 220; y < 640 && !pt; y += 17) for (let x = 16; x < 384 && !pt; x += 17) if (!map.queryRenderedFeatures([x, y]).some(f => /^(bd|rf|mfill)$/.test(f.layer.id))) pt = [x, y];
          map.fire('click', { point: pt, lngLat: map.unproject(pt), originalEvent: {}, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });
          await new Promise(r => setTimeout(r, 900)); const c1 = map.getCenter();
          return { closed: document.querySelector('#movebar').hidden, d: Math.hypot(c1.lng - c0.lng, c1.lat - c0.lat), walk: !!meP().path }; })()""")
        check("toucher la carte ailleurs ferme la case, sans bouger la carte (ni sa montgolfière)", far["closed"] and far["d"] < 1e-5 and not far["walk"], far)
        c0 = await E("map.getCenter().toArray()"); await E(f"push('b',{fg}); 1"); await W("document.querySelector('#p-detail [data-back]')"); await pg.click("#p-detail [data-back]"); await pg.wait_for_timeout(900)
        c1 = await E("map.getCenter().toArray()"); check("retour d'une fiche : la carte reste où elle était", abs(c1[0] - c0[0]) + abs(c1[1] - c0[1]) < 1e-5, (c0, c1))
        db.sql(f"update profiles set land={fg}, cash=cash+1000000"); await E("refreshState().then(()=>1)")
        await E(f"previewBuilding({fg}); 1"); await W("document.querySelector('#movebar [data-lbuy]:not([disabled])')"); await pg.wait_for_timeout(300); await pg.screenshot(path=T + "06b_preview_buy.png", timeout=120000)
        await slide("#movebar [data-lbuy]"); await W(f"(ST.mine.get({fg})||[]).length===1")
        check("achat direct depuis la carte, sans booster", True)
        db.sql("update profiles set cash = cash + 2000000"); await E("refreshState().then(()=>1)")
        await E(f"push('b',{fg}); 1"); await W("document.querySelector('#actbar [data-act=bank]:not([disabled])')"); await pg.wait_for_timeout(300); await pg.screenshot(path=T + "08a_building_buy.png", timeout=120000)
        await pg.click("#actbar [data-act=bank]"); await W(f"(ST.mine.get({fg})||[]).length===2"); check("fiche : « Acheter un logement » en un clic", True)
        db.sql("update profiles set cash = cash + 3000000"); await E("refreshState().then(()=>1)")
        ag = await E("(async()=>{ await loadArr(11); for(let k=0;k<4000;k++){ const g=11*1e5+k, c=card(g); if(c&&c.lk==='l'&&c.lots>=3&&c.lots<=6&&!ST.own.has(g)&&c.v*c.lots<liveCash()) return g; } })()")
        db.sql(f"update profiles set land={ag}"); await E("refreshState().then(()=>1)")
        await pg.click("[data-back]"); await E(f"push('b',{ag}); 1"); await W("document.querySelector('#actbar .pay')")
        await E("bCredit=false; renderDetail(false); 1"); await pg.wait_for_timeout(800)   # comptant : la capacité d'emprunt peut être atteinte ici
        try: await W("document.querySelector('[data-act=bbuild]')", 15000)
        except Exception: print("ACTBAR:", await E("document.querySelector('#actbar')?.innerText"), ag); raise
        await pg.click("[data-act=bbuild]"); await W(f"(ST.mine.get({ag})||[]).length===card({ag}).lots"); check("achat d'un immeuble entier", True)
        await pg.click("[data-back]")
        db.sql("update profiles set cash = cash + 50000000"); await E("refreshState().then(()=>1)")
        g = await E("(()=>{ for(const [g,ks] of ST.mine){ const c=card(g); if(c.lk!=='p' && c.lots>ks.length && c.lots<60) return g; } return [...ST.mine.keys()][0]; })()")
        db.sql(f"update profiles set land={g}"); await E("refreshState().then(()=>1)")
        await E(f"push('b',{g}); 1"); await W("document.querySelector('.floors')")
        await pg.wait_for_timeout(400); await pg.screenshot(path=T + "08_building.png", timeout=120000)
        free = await E(f"(()=>{{ const c=card({g}); const own=new Set(bInfo.lots.map(x=>x[0])); for(let k=0;k<c.lots;k++) if(!own.has(k)) return k; return -1; }})()")
        if free >= 0:
            check("fiche : un seul plan de l'immeuble, avec les nombres", await E("!document.querySelector('.bp-info .occ') && !!document.querySelector('.bplan .bleg') && !document.querySelector('details.plan .floors')"))
            await pg.click(f".lot[data-k='{free}']"); await W("document.querySelector('#lotbar [data-act=bank]')")
            if await E("!!document.querySelector('#lotbar [data-act=paymode][data-k=\"0\"]:not([disabled])')"): await pg.click('#lotbar [data-act=paymode][data-k="0"]')
            await pg.click("#lotbar [data-act=bank]")
            await W(f"(ST.mine.get({g})||[]).includes({free})")
            check("achat d'un logement précis via le plan", True)
        k = free if free >= 0 else await E(f"ST.mine.get({g})[0]")
        db.sql(f"update lots set loan=null where card={g} and owner=(select id from profiles where pseudo='Alice')"); await E("refreshHold().then(()=>renderDetail(false))"); await pg.wait_for_timeout(300)
        await pg.click("[data-act=osopen][data-k=sale]"); await pg.fill("#price", "888000"); await pg.click("[data-act=oslist]")
        await W(f"ST.sale.has({g})"); check("mise en vente", True)
        await pg.wait_for_timeout(300); await pg.screenshot(path=T + "09_selling.png", timeout=120000)
        await pg.click(".myrow [data-act=unlist]"); await W(f"!ST.sale.has({g})"); check("annonce retirée", True)
        # hypothèque depuis le Patrimoine : la tuile « Hypothéquer » → la liste → la fiche, formulaire déjà ouvert
        await pg.click("[data-back]"); await E("setMovebar(''); 1"); await pg.click("#tabs [data-tab=assets]"); await W("document.querySelector('#p-assets [data-amort=\"1\"]')")
        await pg.click("#p-assets [data-amort='1']"); await W("document.querySelector('#p-assets [data-mortg]')")
        if await E("!!document.querySelector('#p-assets [data-mortall]')"): await pg.click("#p-assets [data-mortall]")
        await W(f"document.querySelector('#p-assets [data-mortg=\"{g}\"]')"); await pg.wait_for_timeout(300); await pg.screenshot(path=T + "09b_mortlist.png", timeout=120000)
        await pg.click(f"#p-assets [data-mortg='{g}']"); await W("document.querySelector('#p-detail .omort')")
        check("patrimoine : « Hypothéquer » ouvre la fiche, formulaire prêt", True)
        await pg.click("[data-act=osmort]")
        await W(f"[...ST.mort.keys()].some(x=>x.startsWith('{g}:'))"); check("hypothèque (avec confirmation)", True)
        await pg.click(".myrow [data-act=lift]"); await W(f"![...ST.mort.keys()].some(x=>x.startsWith('{g}:'))"); check("remboursement", True)
        rv = str(uuid.uuid4()); db.sql("insert into auth.users(id) values (%s)", rv); db.rpc(rv, "join_game", p_pseudo="Rival", p_party="rempart")
        db.rpc(rv, "open_booster", p_kind="welcome"); h = db.rpc(rv, "my_holdings")["lots"][0]
        db.rpc(rv, "list_item", p_card=h[0], p_k=h[1], p_n=1, p_price=400000)
        await pg.click("[data-back]"); await E("setMovebar(''); 1"); await pg.click("#tabs [data-tab=market]"); await W("document.querySelector('[data-buy]')")
        await pg.wait_for_timeout(300); await pg.screenshot(path=T + "10_market.png", timeout=120000)
        await pg.click("[data-buy]:not([disabled])"); await W(f"(ST.mine.get({h[0]})||[]).includes({h[1]})"); check("achat sur le marché à un autre joueur", True)
        await pg.click("#tabs [data-tab=paris]"); await W("document.querySelector('#p-paris .pcard [data-push=party]')")
        await pg.click("#p-paris .pcard [data-push=party]"); await W("document.querySelector('.spectrum')"); await pg.click(".sp-node[data-party=rempart]"); await pg.wait_for_timeout(200); await pg.screenshot(path=T + "11b_party.png", timeout=120000)
        await pg.click(".sp-node[data-party=milieu]"); await pg.click("#party-save"); await W("ST.state.profile.party==='milieu'"); check("choix du parti plus tard, depuis Paris", True)
        await W("document.querySelector('#p-paris .pmap')")
        await pg.wait_for_timeout(300); await pg.screenshot(path=T + "11_paris.png", timeout=120000)
        check("fil d'actu", await E("document.querySelectorAll('#p-paris .fi').length") > 0)
        await pg.click("[data-pt=rank]"); await pg.wait_for_timeout(400); check("classement", await E("document.querySelectorAll('#p-paris .rk').length") >= 2); await pg.screenshot(path=T + "11b_rank.png", timeout=120000)
        await pg.click("[data-pt=arr]"); await pg.wait_for_timeout(400); await pg.click("#p-paris .atile"); await W("document.querySelector('#p-detail .ar-h')")
        await pg.wait_for_timeout(300); await pg.screenshot(path=T + "12_arr.png", timeout=120000); check("page arrondissement", True)
        await pg.click("[data-back]"); await E("push('results'); 1"); await W("document.querySelector('#p-detail .parties')"); await pg.screenshot(path=T + "13_results.png", timeout=120000)
        await pg.click("[data-back]")
        db.sql("update profiles set free_at=now(), welcome=0"); await E("refreshState().then(()=>1)")
        await pg.click("#tabs [data-tab=map]"); await pg.wait_for_timeout(300); await pg.click("#b-pack"); await W("document.querySelector('#packbtn')"); await pg.wait_for_timeout(400); await pg.screenshot(path=T + "14_booster.png", timeout=120000)
        off = await E("(()=>{ const s=document.querySelector('#packbtn .sachet').getBoundingClientRect(), r=document.createRange(); r.selectNodeContents(document.querySelector('#packbtn .sachet .brand')); const b=r.getBoundingClientRect(); return Math.round(Math.abs((b.left+b.right)/2-(s.left+s.right)/2)); })()")
        check("sachet : « PROPRIO » bien centré", off <= 6, f"{off} px du centre")
        await pg.click("[data-open=paid]")
        await W("document.querySelector('#slot .hc')"); await pg.click("#reveal .close"); await W("document.querySelector('.sumgrid')")
        await pg.click("[data-r=map]"); check("booster payant (prix suivant doublé)", await E("ST.state.price===300000"), await E("ST.state.price"))
        await pg.click(".money"); await W("document.querySelector('.ml')"); await pg.screenshot(path=T + "15_money.png", timeout=120000); check("mon argent : historique des mouvements", await E("document.querySelectorAll('.ml').length") >= 3, await E("document.querySelectorAll('.ml').length"))
        check("pas de boutique en vrai argent pour l'instant", await E("!document.querySelector('[data-push=shop]')")); await pg.click("[data-back]")
        await pg.click("#avatar"); await W("document.querySelector('#logout')"); await pg.screenshot(path=T + "16_profile.png", timeout=120000); await pg.click("[data-back]")
        check("en bas : sa montgolfière au milieu, « Salon » à côté, les boosters (plus de téléportation)", await E("!document.querySelector('#b-tp') && !!document.querySelector('#b-main .mi svg') && !document.querySelector('#b-say').hidden && !!document.querySelector('#b-pack')"))
        await pg.click("#t-search"); await pg.fill("#q", "eiffel"); await W("document.querySelector('#results button')", 60000); await pg.click("#results button")
        await W("document.querySelector('#movebar [data-lopen]')"); await pg.wait_for_timeout(2500); await pg.screenshot(path=T + "17_preview.png", timeout=120000)
        await pg.click("#movebar .lb [data-lopen]"); await W("document.querySelector('#p-detail .bp')"); await pg.wait_for_timeout(400); await pg.screenshot(path=T + "18_monument.png", timeout=120000)
        check("recherche → aperçu → fiche monument", True)
        check("monuments en 3D : obélisque, gares, églises", await E("IDX.models.length>=48 && ['obelisque','invalides','horlogelyon','sulpice','hoteldeville'].every(k=>IDX.models.some(m=>m.m===k)) && IDX.models.every(m=>window.MON && MON.B[m.m])"))
        await pg.click("[data-back]"); await E("setMovebar(''); 1"); await pg.wait_for_timeout(300)   # la case fermée (sur téléphone la loupe est en bas à droite, sous la case)
        await pg.click("#t-search"); await pg.mouse.click(200, 450); await pg.wait_for_timeout(200)
        check("la recherche se ferme en touchant ailleurs", await E("document.querySelector('#search').hidden"))
        # Paris, avec les autres (place.js) : les gens autour et leurs bulles, plus de marche libre, le dé (l'immeuble de la couleur
        # d'une flèche), le salon, sa montgolfière, couper le chat, un « ? », le métro sur toutes les lignes, sa position hors de l'écran
        await E("setMovebar(''); closeSearch(); 1")
        me = await E("ME"); mx, my = await E("[meP().lon, meP().lat]")
        ou = str(uuid.uuid4()); db.sql("insert into auth.users(id) values (%s)", ou); db.rpc(ou, "join_game", p_pseudo="Ella" + ou[:4], p_party="rempart")
        db.rpc(ou, "world_join"); ex, ey = mx + 0.0004, my + 0.0002
        db.sql("update walkers set lon=%s, lat=%s, lon0=%s, lat0=%s, dur=0, path=null, settled=true where user_id=%s", ex, ey, ex, ey, ou)
        db.sql("update world_people set lon=%s, lat=%s, cell=_wcell(%s, %s), seen=now() where user_id=%s", ex, ey, ex, ey, ou)
        await E("centerOnMe(false); 1"); await pg.wait_for_timeout(1500); await W("!map.isMoving()", 20000); await E("W.cellKey = ''; updateCells(); 1")
        await W(f"W.people.has('{ou}') && W.people.get('{ou}').el.style.display !== 'none'", 15000)
        check("on voit les autres joueurs autour de soi : leur montgolfière en 3D, avec leur nom", await E(f"W.people.get('{ou}').el.textContent.includes('Ella') && (!window.people3d || people3d.count() >= 2)"))
        db.rpc(ou, "world_say", p_text="Bienvenue !"); await pg.wait_for_timeout(3500)   # (un site d'avant peut encore en envoyer)
        check("plus aucun mot sur la carte de Paris (25/10/2026 : on parle au salon)", await E("![...document.querySelectorAll('#wpl .bub:not([hidden])')].length"))
        await pg.screenshot(path=T + "19_monde.png", timeout=120000)
        # toucher un autre joueur : ce qu'il vend et ses biens ; un toucher ouvre la fiche (acheter l'annonce, proposer de racheter)
        eg = db.sql("select id from cards where lk='l' and lots between 2 and 6 and id not in (select card from lots) limit 1")[0][0]
        db.sql("insert into lots(card,k,owner) values (%s,0,%s),(%s,1,%s)", eg, ou, eg, ou); db.rpc(ou, "list_item", p_card=eg, p_k=0, p_n=1, p_price=777000)
        await E("refreshMap().then(() => 1)")
        await E(f"document.querySelector('#wpl .wp[data-id=\"{ou}\"]').click(); 1"); await W(f"document.querySelector('#plsheet .whcard[data-arg=\"{eg}\"]')", 10000)
        check("toucher un autre joueur : ce qu'il vend en petites cartes, et « Voir sa boutique »", await E("document.querySelector('#plsheet .whcard .hc') && document.querySelector('#plsheet .whp').textContent.includes('777') && !!document.querySelector('#plsheet [data-push=pshop]')"))
        await pg.wait_for_timeout(300); await pg.screenshot(path=T + "19c_joueur.png", timeout=120000)
        await pg.click(f"#plsheet .whcard[data-arg='{eg}']"); await W("document.querySelector('#p-detail [data-back]')", 10000)
        check("… un toucher sur la carte ouvre la fiche du bien (acheter l'annonce, proposer de racheter)", await E("!document.querySelector('#p-detail').hidden && !document.querySelector('#plsheet')"))
        await pg.click("#p-detail [data-back]"); await pg.wait_for_timeout(700)
        await E(f"document.querySelector('#wpl .wp[data-id=\"{ou}\"]').click(); 1"); await W("document.querySelector('#plsheet [data-push=pshop]')", 10000)
        await pg.click("#plsheet [data-push=pshop]"); await W("document.querySelector('#p-detail .pshop .grid-cards')", 15000)
        check("sa boutique : ses annonces et sa collection, en cartes", await E("document.querySelector('#p-detail').innerText.includes('Boutique de Ella') && document.querySelector('#p-detail').innerText.includes('En vente') && document.querySelector('#p-detail').innerText.includes('Sa collection')"))
        await pg.wait_for_timeout(300); await pg.screenshot(path=T + "19d_boutique.png", timeout=120000)
        await pg.click("#p-detail [data-back]"); await pg.wait_for_timeout(700)
        # la carte des autres sans tout recharger (map_delta, 21/10/2026) : Ella achète un immeuble tout près → la carte le sait
        # tout de suite (évènement « map » sur le carré du bien), et seulement cette carte revient
        nb = db.sql("select id from cards where lk='l' and cx between %s and %s and cy between %s and %s and id not in (select card from lots) and id not in (select card from listings) limit 1",
                    int(mx * 1e5) - 250, int(mx * 1e5) + 250, int(my * 1e5) - 150, int(my * 1e5) + 150)[0][0]
        v0 = await E("ST.mapV"); db.sql("insert into lots(card,k,owner) values (%s,0,%s)", nb, ou)
        await W(f"ST.own.has({nb}) && ST.own.get({nb}).owners.includes('{ou}') && stateFor({nb}) === 2", 12000)
        dl = db.rpc(ou, "map_delta", p_since=v0)
        check("quelqu'un achète tout près : la carte le sait tout de suite, sans tout recharger (seulement cette carte)",
              db.sql("select count(*) from chat_msg where kind='map' and (data->>'g')::int=%s", nb)[0][0] == 1 and nb in dl["cards"] and len(dl["cards"]) <= 3 and not dl.get("full"), dl.get("cards"))
        # un onglet resté caché n'écoute plus personne ; en revenant, il réécoute les carrés autour
        await E("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); quiet(); 1")
        q1 = await E("({ q: W.quiet === true, ch: W.chans.size, every: W.feedEvery })")
        await E("delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); 1")
        await W("!W.quiet && W.cellKey !== '' && W.cells.size > 0 && W.feedEvery === 2500", 8000)
        check("onglet caché : il n'écoute plus personne ; en revenant, il réécoute", q1["q"] and q1["ch"] == 0 and q1["every"] == 20000, q1)
        check("nouvelle version en ligne : le site sait comparer la sienne (rechargement en revenant sur un vieil onglet)",
              await E("fetch('/?nv=1', { cache: 'no-store' }).then(r => r.text()).then(h => !!APP_V && (h.match(/\\/app\\/main\\.js\\?v=([\\w-]+)/) || [])[1] === APP_V)"))
        # toucher une rue : sa montgolfière y vole, pile là où l'on a touché (26/10/2026)
        db.sql("update profiles set km_free = 5, km_at = now(), km_buy = 0 where id=%s", me); await E("refreshState().then(() => 1)")
        await E("setMovebar(''); centerOnMe(false); 1"); await pg.wait_for_timeout(1500); await W("!map.isMoving()", 20000)
        tap = await E("""(() => { const m = meP();
          for (let y = 160; y < innerHeight - 270; y += 19) for (let x = 24; x < innerWidth - 24; x += 19) {
            const q = map.unproject([x, y]), d = mLL([m.lon, m.lat], [q.lng, q.lat]); if (d < 60 || d > 450) continue;
            if (map.queryRenderedFeatures([x, y]).some(f => /^(bd|rf|mfill|wq-c)$/.test(f.layer.id))) continue;
            const el = document.elementFromPoint(x, y); if (!el || el.tagName !== 'CANVAS') continue;
            return { ll: [q.lng, q.lat], pt: [x, y] }; } return null; })()""")
        await pg.mouse.click(tap["pt"][0], tap["pt"][1]); await pg.wait_for_timeout(300)
        check("toucher une rue : sa montgolfière y vole (pas de case)", await E("!!W.run && W.run.g == null && meP().path?.length === 2"), tap)
        await W("!W.run", 60000); await pg.wait_for_timeout(500)
        wk = db.sql("select lon, lat from walkers where user_id=%s", me)[0]
        check("… pile là où l'on a touché (à 3 m près), et ce n'est pas une case à acheter", abs(wk[0] - tap["ll"][0]) * 73240 < 3 and abs(wk[1] - tap["ll"][1]) * 110574 < 3
              and db.sql("select land from profiles where id=%s", me)[0][0] is None and await E("document.querySelector('#movebar').hidden"), (wk, tap["ll"]))
        # le péage : un immeuble d'Ella (en rose) sous le trajet ; le compteur sur sa montgolfière, la ligne dans sa case
        mx2, my2 = wk
        tg = db.sql("""select id, cx / 1e5, cy / 1e5 from cards c where lk = 'l' and lots >= 3 and id not in (select card from lots) and _wm(%s, %s, cx / 1e5, cy / 1e5) between 150 and 280
          and exists (select 1 from cards k where k.lk = 'l' and k.id <> c.id and k.id not in (select card from lots) and _wsegd(k.cx / 1e5, k.cy / 1e5, %s, %s, c.cx / 1e5, c.cy / 1e5) <= 15 and _wm(%s, %s, k.cx / 1e5, k.cy / 1e5) > 50)
          order by id limit 1""", mx2, my2, mx2, my2, mx2, my2)[0]
        pk, prent = db.sql("""select id, rent from cards k where k.lk = 'l' and k.id <> %s and k.id not in (select card from lots) and _wsegd(k.cx / 1e5, k.cy / 1e5, %s, %s, %s, %s) <= 15 and _wm(%s, %s, k.cx / 1e5, k.cy / 1e5) > 50 order by id limit 1""",
                           tg[0], mx2, my2, tg[1], tg[2], mx2, my2)[0]
        db.sql("delete from toll_seen where user_id=%s", me)
        for t_ in ("lots", "parts"): db.sql(f"delete from {t_} where owner <> %s and card in (select id from cards where _wsegd(cx / 1e5, cy / 1e5, %s, %s, %s, %s) <= 30)", me, mx2, my2, tg[1], tg[2])
        db.sql("insert into lots(card,k,owner) values (%s,0,%s)", pk, ou); db.sql("delete from pay where owner=%s", ou)
        await E(f"refreshMap().then(() => ensureCards([{tg[0]}, {pk}])).then(() => {{ paintAll(); worldTapCard({tg[0]}); return 1; }})"); await W("document.querySelector('#movebar [data-lgo]')", 15000)
        check("un immeuble d'un autre joueur est rose sur la carte", await E(f"stateFor({pk}) === 2"))
        await pg.click("#movebar [data-lgo]"); await W("!!W.run && !!W.run.res", 20000)
        hits = await E("W.run.hits")
        await W("!W.run", 60000); await pg.wait_for_timeout(300)
        lab = await E("meP().el.querySelector('.nm').textContent")
        await W("!document.querySelector('#movebar').hidden", 15000); await pg.wait_for_timeout(300)
        mp = db.sql("select party from profiles where id=%s", me)[0][0]; want = math.floor(prent * (0.5 if mp == "poing" else 1) * 1.5)   # (Ella est d'extrême droite : +50 %)
        check("survoler l'immeuble rose d'un autre joueur : le péage = le loyer écrit sur sa carte, compté sur sa montgolfière, une ligne dans sa case, payé à Ella",
              [h[0] for h in hits] == [pk] and hits[0][1] == want and lab == "−" + await E(f"fmtE({want})") and await E(f"(document.querySelector('#movebar .lns')?.textContent || '').includes('Péage') && (document.querySelector('#movebar .lns')?.textContent || '').includes(fmtE({want}))")
              and int(db.sql("select coalesce(sum(amount),0) from pay where owner=%s", ou)[0][0]) == want, (hits, lab, prent, want, mp))
        await pg.screenshot(path=T + "19e_peage.png", timeout=120000)
        await E("setMovebar(''); 1")
        # faire glisser la carte libère la caméra ; le bouton du milieu la remet sur sa montgolfière ; centrée, il montre ses km
        gp = await E("(() => { for (let y = 250; y < 520; y += 20) for (let x = 40; x < 360; x += 20) { const el = document.elementFromPoint(x, y); if (el && el.tagName === 'CANVAS') return [x, y]; } return [200, 360]; })()")
        await pg.mouse.move(gp[0], gp[1]); await pg.mouse.down(); await pg.mouse.move(gp[0] + 40, gp[1] + 60, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(500)
        free = await E("CAM.on")
        await pg.click("#b-main"); await pg.wait_for_timeout(1500); await W("!map.isMoving()", 20000)
        check("faire glisser la carte libère la caméra ; le bouton du milieu la remet sur sa montgolfière", free is False and await E("CAM.on && !document.querySelector('#plsheet') && (q => Math.abs(q.x - innerWidth / 2) < 30)(map.project([meP().lon, meP().lat]))"))
        await pg.click("#b-main"); await W("document.querySelector('#plsheet [data-bkm]')", 5000)
        k0 = await E("kmLeft()"); await pg.click("#plsheet [data-bkm]"); await W("!document.querySelector('#plsheet')", 10000)
        check("centrée : le bouton du milieu montre ses km ; +2 km contre 50 000 €", abs(await E("kmLeft()") - k0 - 2) < .02 and db.sql("select count(*) from ledger where owner=%s and kind='km'", me)[0][0] == 1, (k0, await E("kmLeft()")))
        # le salon du Champ-de-Mars (25/10/2026) : « Parler » y emmène ; la pastille verte dit combien de joueurs y sont
        db.sql("delete from chat_msg where user_id=%s and kind='say'", ou)
        db.rpc(ou, "chat_join", p_lon=2.2975, p_lat=48.8562); await E("salonCount().then(() => 1)")
        check("« Salon » (« Parler » avant le 26/10/2026) : une pastille verte, combien de joueurs y sont", await E("document.querySelector('#b-say small').textContent === 'Salon' && !document.querySelector('#saynb').hidden && document.querySelector('#saynb').textContent === '1'"), await E("document.querySelector('#saynb').textContent"))
        await pg.click("#b-say"); await W(f"S.on && S.people.has('{ou}') && S.people.has(ME)", 20000); await pg.wait_for_timeout(1500); await W("!map.isMoving()", 20000)
        check("« Salon » emmène au salon : les montgolfières de ceux qui sont là, le jeu s'efface", await E(f"""document.body.classList.contains('insalon') && W.away && document.querySelector('#sln').textContent === '2 joueurs ici' && document.querySelector('#slt').textContent === 'Salon'
          && !!document.querySelector('#spl .wp[data-id="{ou}"]') && getComputedStyle(document.querySelector('#tabs')).display === 'none' && getComputedStyle(document.querySelector('#wpl')).display === 'none'
          && inStage(S.people.get(ME).lon, S.people.get(ME).lat) && map.getBearing() < -30"""))
        db.rpc(ou, "chat_say", p_text="Bienvenue !")
        await W("[...document.querySelectorAll('#spl .bub:not([hidden])')].some(b => b.textContent === 'Bienvenue !')", 10000)
        check("au salon : le petit mot d'un autre en bulle, et dans le fil", await E("!document.querySelector('#wlog').hidden && document.querySelector('#wlog').innerText.includes('Bienvenue !')"))
        await pg.fill("#wsq", "Salut !"); await pg.press("#wsq", "Enter")
        await W("[...document.querySelectorAll('#spl .wp.me .bub:not([hidden])')].some(b => b.textContent === 'Salut !')", 10000)
        check("son petit mot : dans sa bulle, signé par le serveur", db.sql("select data->>'t', user_id::text, room from chat_msg where kind='say' order by id desc limit 1")[0][:2] == ("Salut !", me))
        check("un mot par minute : la barre affiche le temps qui reste", await E("/^Prochain mot dans \\d+ s$/.test(document.querySelector('#wsq').placeholder) && document.querySelector('#wsay').classList.contains('wait')"), await E("document.querySelector('#wsq').placeholder"))
        await pg.screenshot(path=T + "20_salon.png", timeout=120000)
        # toucher la pelouse : sa montgolfière y va (le serveur le sait)
        lp = await E("""(() => { for (const [u, v] of [[.3, .7], [.7, .7], [.5, .85], [.25, .5], [.75, .45]]) { const ll = stageAt(u, v), q = map.project(ll), r = map.getContainer().getBoundingClientRect();
            const el = document.elementFromPoint(r.left + q.x, r.top + q.y); if (el && el.tagName === 'CANVAS') return { ll, pt: [r.left + q.x, r.top + q.y] }; } return null; })()""")
        if lp: await pg.mouse.click(lp["pt"][0], lp["pt"][1])
        await pg.wait_for_timeout(1500)
        pos = db.sql("select lon, lat from place_people where user_id=%s", me)
        check("au salon : toucher la pelouse, sa montgolfière y va", lp and pos and abs(pos[0][0] - lp["ll"][0]) < 2e-5 and abs(pos[0][1] - lp["ll"][1]) < 2e-5, (lp, pos))
        check("le salon : tout le 7e et le Trocadéro (Orsay, les Invalides, le parvis) ; plus loin, on s'arrête au bord", await E("""inStage(2.3266, 48.8600) && inStage(2.3126, 48.8551) && inStage(2.2870, 48.8628) && !inStage(2.3212, 48.8656) && !inStage(2.2800, 48.8500)
          && (c => inStage(c[0], c[1]))(stageClamp(2.3212, 48.8656, [2.2945, 48.8584])) && (c => inStage(c[0], c[1]))(stageClamp(2.2700, 48.8400))"""))
        await pg.click("[data-slx]"); await W("!S.on && !map.isMoving()", 20000); await pg.wait_for_timeout(600)
        check("« ← » : retour dans la partie, là où l'on était (le salon le sait)", await E("!document.body.classList.contains('insalon') && !W.away && meP().vis && getComputedStyle(document.querySelector('#tabs')).display !== 'none' && !document.querySelector('#wsay')")
              and not db.sql("select 1 from place_people where user_id=%s", me))
        # dézoomé (26/10/2026) : « Vous » en petite montgolfière (plus un point bleu comme ses biens) ; les limites des arrondissements
        await E("camOff(); map.jumpTo({ center: [meP().lon, meP().lat], zoom: 12.6, pitch: 0 }); 1"); await pg.wait_for_timeout(800); await W("!map.isMoving()", 20000)
        check("dézoomé : « Vous » en petite montgolfière, les arrondissements délimités", await E("(() => { const e = document.querySelector('#wpl .wp.me'); return e.classList.contains('dot') && getComputedStyle(e.querySelector('.bl')).display === 'block' && !!e.querySelector('.bl svg') && !!map.getLayer('arrsym') && map.hasImage('arrdash'); })()"))
        await E("centerOnMe(false); 1"); await pg.wait_for_timeout(800); await W("!map.isMoving()", 20000)
        # sa montgolfière : toucher son nom
        await E("document.querySelector('#wpl .wp.me').click(); 1"); await W("document.querySelector('#plsheet .lked')")
        await pg.click("#plsheet [data-look='t:5']"); await pg.wait_for_timeout(1200)
        check("toucher sa montgolfière : choisir sa couleur (enregistrée)", db.sql("select look->>'t' from profiles where id=%s", me)[0][0] == "5")
        await pg.click("#plsheet [data-look='a:2']"); await pg.wait_for_timeout(1200)
        check("… et son motif (enregistré)", db.sql("select look->>'a' from profiles where id=%s", me)[0][0] == "2" and await E("!!document.querySelector(\"#plsheet [data-look='a:2'].on\")"))
        await pg.click("#plsheet .plsx")
        # couper le chat (profil) : plus de « Parler », plus de salon
        await pg.click("#avatar"); await W("document.querySelector('#chatoff')"); await pg.click("#chatoff"); await W("W.chatOff === true", 5000)
        check("profil : couper le chat (plus de « Parler »)", await E("document.querySelector('#b-say').hidden") and db.sql("select chat_off from profiles where id=%s", me)[0][0] is True)
        await pg.click("[data-back]"); await pg.wait_for_timeout(300)
        check("chat coupé : plus de salon", await E("openSalon().then(() => !S.on)"))
        await pg.click("#avatar"); await W("document.querySelector('#chatoff')"); await pg.click("#chatoff"); await W("W.chatOff === false", 5000); await pg.click("[data-back]")
        db.rpc(ou, "chat_leave")
        # un « ? » du jour : on s'y pose, une carte Chance
        await E("setMovebar(''); 1")
        db.sql("update profiles set km_free = 5, km_at = now(), km_buy = 30 where id=%s", me); await E("refreshState().then(() => 1)")
        qg = await E("(() => { const m = meP(); let best = null; for (const q of W.q) { const d = mLL([m.lon, m.lat], [q.lon, q.lat]); if (!best || d < best[1]) best = [q.g, d]; } return best && best[0]; })()")
        await E(f"ensureCards([{qg}]).then(() => flyMe(null, null, {qg})).then(() => 1)"); await W("!!W.run", 10000); await W("!W.run", 60000); await W("!document.querySelector('#movebar').hidden", 15000); await pg.wait_for_timeout(500)
        check("se poser sur un « ? » du jour : une carte Chance (dans sa case)", await E("/chance/i.test(document.querySelector('#movebar .lns')?.textContent || '') && W.taken.has(" + str(qg) + ")")
              and db.sql("select count(*) from chance_taken where user_id=%s and card=%s", me, qg)[0][0] == 1)
        await pg.screenshot(path=T + "21_chance.png", timeout=120000)
        # le métro : posé sur la station la plus proche, puis Châtelet (ou l'École Militaire) en cherchant son nom
        await E("setMovebar(''); 1")
        st = await E("(() => { const m = meP(); let best = null; for (const [g] of W.G.st) { const s = spotOf(g); if (!s) continue; const d = mLL([m.lon, m.lat], [s[3], s[4]]); if (!best || d < best[1]) best = [g, d]; } return best[0]; })()")
        dest, q = (602931, "ecole mil") if st == 1578 else (1578, "chatel")
        await E(f"ensureCards([{st}]).then(() => flyMe(null, null, {st})).then(() => 1)"); await W("!!W.run", 10000); await W("!W.run", 60000); await W("document.querySelector('#movebar [data-wmetro]')", 15000)
        await pg.click("#movebar [data-wmetro]"); await W("document.querySelector('#plsheet .mtls')", 5000)
        await pg.fill("#mtq", q); await W(f"document.querySelector('#mtres [data-wride=\"{dest}\"]')", 5000)
        check("le métro : on cherche une station de tout Paris par son nom", True)
        await pg.screenshot(path=T + "22_metro_sheet.png", timeout=120000)
        await pg.click(f"#mtres [data-wride='{dest}']"); await W("!W.riding && !meP().gone", 30000)
        wk = db.sql("select lon, lat from walkers where user_id=%s", me)[0]; dx, dy = map(float, db.sql("select cx / 1e5, cy / 1e5 from cards where id=%s", dest)[0])
        check("le métro emmène à la station choisie (un ticket), sa case s'ouvre", abs(wk[0] - dx) < 1e-4 and abs(wk[1] - dy) < 1e-4 and await E(f"ST.state.profile.land === {dest}")
              and db.sql("select count(*) from ledger where owner=%s and kind='metro' and card=%s", me, dest)[0][0] == 1, wk)
        await pg.wait_for_timeout(500); await W("!map.isMoving()", 30000); await E("setMovebar(''); 1")
        # sa montgolfière hors de l'écran : une flèche au bord, qui ramène sur lui
        await E("map.jumpTo({center: [2.30, 48.87], zoom: 15.5}); 1"); await pg.wait_for_timeout(800)
        check("sa montgolfière hors de l'écran : une flèche au bord, « Vous · … km »", await E("!document.querySelector('#pawnoff').hidden && document.querySelector('#pawnoff').textContent.includes('Vous ·')"))
        await pg.click("#pawnoff"); await pg.wait_for_timeout(1500); await W("!map.isMoving()", 20000)
        check("toucher la flèche ramène sur sa montgolfière", await E("document.querySelector('#pawnoff').hidden"))
        await pg.click("#avatar"); await W("document.querySelector('#p-detail .lkwrap .lksw.on')")
        check("profil : « Ma montgolfière » avec la couleur choisie", await E("!!document.querySelector(\"#p-detail .lkwrap [data-look='t:5'].on\")")); await pg.click("[data-back]")
        # les lieux (20/10/2026) : la station Châtelet sur la carte, sa case avec ses lignes et le bonus réseau ; la recherche sans accent
        await pg.click("#tabs [data-tab=map]"); await pg.wait_for_timeout(300); await E("setMovebar(''); map.jumpTo({center:[2.347119, 48.85852], zoom:16.2, pitch:40}); 1"); await pg.wait_for_timeout(1500)
        await W("!!document.querySelector(\".smark.k-m[aria-label='Métro Châtelet']\")", 15000)
        await E("worldTapCard(spotMarks.find(m => m.el.getAttribute('aria-label') === 'Métro Châtelet').g); 1"); await W("document.querySelector('#movebar .netl')", 15000); await pg.wait_for_timeout(600)
        check("métro : la station Châtelet sur la carte, sa case avec ses 5 lignes et le bonus réseau", await E("document.querySelectorAll('#movebar .netl .lnb').length === 5 && document.querySelector('#movebar .hc .plq b').textContent.includes('Châtelet')"))
        await pg.screenshot(path=T + "20_metro.png", timeout=120000)
        await E("setMovebar(''); 1"); await pg.click("#t-search"); await pg.fill("#q", "chatelet"); await pg.wait_for_timeout(300)
        check("recherche sans accent : « chatelet » trouve la station", await E("[...document.querySelectorAll('#results button')].some(b => b.textContent.includes('Métro Châtelet'))"))
        await pg.fill("#q", "gare de l'est"); await pg.wait_for_timeout(300)
        check("la gare de l'Est est dans le jeu", await E("[...document.querySelectorAll('#results button')].some(b => b.textContent.includes(\"Gare de l'Est\"))"))
        await pg.fill("#q", "gare du nord"); await pg.wait_for_timeout(300)
        check("« gare du nord » trouve Paris-Nord, affichée « Gare du Nord »", await E("[...document.querySelectorAll('#results button')].some(b => b.textContent.includes('Gare du Nord'))"))
        await E("refreshMap().then(() => ensureCards([...ST.mine.keys()].slice(0, 5))).then(() => 1)")
        check("le ruban du parti sur une carte qu'on domine", await E("(() => { const g = [...ST.mine.keys()].find(g => ST.own.get(g)?.party && card(g)); return g != null && cardHTML(card(g)).includes('class=\"rib\"'); })()"))
        await E("closeSearch(); 1")
        # ordinateur (21/10/2026) : la case est sur le côté ; un clic sur la carte la ferme (et ne fait plus avancer)
        await pg.set_viewport_size({"width": 1280, "height": 800}); await pg.wait_for_timeout(800)
        await E("setMovebar(''); centerOnMe(false); 1"); await pg.wait_for_timeout(1500); await W("!map.isMoving()", 20000); await W("!meP().path", 95000)
        await E("showLand(); 1"); await W("!document.querySelector('#movebar').hidden", 10000); await pg.wait_for_timeout(400)
        # (vue moins inclinée pour chercher une rue : de biais, les murs des immeubles cachent souvent toutes les rues visibles)
        await E("map.jumpTo({ pitch: 25 }); 1"); await pg.wait_for_timeout(700); await W("!map.isMoving()", 20000)
        dt = await E("""(() => { const m = meP();
          for (let y = 160; y < innerHeight - 270; y += 19) for (let x = 24; x < innerWidth - 24; x += 19) {
            const q = map.unproject([x, y]), d = mLL([m.lon, m.lat], [q.lng, q.lat]); if (d < 60 || d > 450) continue;
            const s = snapW(W.G, q.lng, q.lat, 30); if (!s) continue; const ll = [s.x / KXP, s.y / KYP], p = map.project(ll);
            if (Math.hypot(p.x - x, p.y - y) > 14 || p.y < 150 || p.y > innerHeight - 260) continue;
            if (map.queryRenderedFeatures([p.x, p.y]).some(f => /^(bd|rf|mfill|wq-c)$/.test(f.layer.id))) continue;
            const el = document.elementFromPoint(p.x, p.y); if (!el || el.tagName !== 'CANVAS') continue;
            return { ll, pt: [p.x, p.y] }; } return null; })()""")
        await pg.mouse.click(dt["pt"][0], dt["pt"][1]); await pg.wait_for_timeout(600)
        check("ordinateur : un clic sur la carte ferme la case, sans faire avancer", await E("document.querySelector('#movebar').hidden && !meP().path"), dt)
        await pg.screenshot(path=T + "23_desktop_walk.png", timeout=120000)
        check("aucune erreur JavaScript", not errs, errs[:5])
        await b.close()
    print(f"\n{sum(R)}/{len(R)} OK")
asyncio.run(main())
