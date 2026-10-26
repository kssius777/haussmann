"""Un tour de Paris au format téléphone (400 × 820, écran ×2), comme un vrai joueur : voler dans plusieurs quartiers (depuis le
26/10/2026 ; avant : lancer le dé), dézoomer et aller loin, prendre le métro, ouvrir des cases, des fiches, des boosters, changer
d'onglet, survoler les 20 arrondissements ; pendant ce temps trois autres joueurs volent, parlent et achètent autour de lui.
À chaque étape : la mémoire (tas JS de la page et des workers de la carte, après ramasse-miettes), les éléments de la page,
les écouteurs, les minuteurs en cours, la mémoire des processus Chromium, les images par seconde, les longues tâches ;
et toutes les erreurs. Puis on refait le même tour : ce qui grossit encore la 2e fois est une fuite.
  python3 test/tour.py      (~20 min ; E2E_PORT et HM_DB comme l'e2e ; résultats dans test/shots/tour.json)"""
import asyncio, sys, os, uuid, json, time, random, math, subprocess
sys.path.insert(0, os.path.dirname(__file__)); import db
from playwright.async_api import async_playwright
PORT = os.environ.get("E2E_PORT", "8780")
OUT = os.path.join(os.path.dirname(__file__), "shots") + "/"; os.makedirs(OUT, exist_ok=True)
random.seed(7)

# instruments posés avant le jeu : minuteurs en cours, images demandées, erreurs, longues tâches
INIT = r"""(() => {
  const iv = new Set(), si = window.setInterval, ci = window.clearInterval;
  window.setInterval = function (f, t, ...a) { const id = si.call(window, f, t, ...a); iv.add(id); return id; };
  window.clearInterval = function (id) { iv.delete(id); return ci.call(window, id); };
  const to = new Set(), st = window.setTimeout, ct = window.clearTimeout;
  window.setTimeout = function (f, t, ...a) { const id = st.call(window, function () { to.delete(id); if (typeof f === 'function') return f.apply(this, arguments); }, t, ...a); to.add(id); return id; };
  window.clearTimeout = function (id) { to.delete(id); return ct.call(window, id); };
  const errs = [];
  addEventListener('error', e => errs.push('ERR ' + (e.message || e.type) + ' @ ' + String(e.filename || '').split('/').pop() + ':' + e.lineno));
  addEventListener('unhandledrejection', e => errs.push('PROMESSE ' + String(e.reason && (e.reason.stack || e.reason.message) || e.reason).slice(0, 300)));
  let lt = 0, ltMs = 0, ltMax = 0;
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) { lt++; ltMs += e.duration; ltMax = Math.max(ltMax, e.duration); } }).observe({ type: 'longtask', buffered: true }); } catch (e) { }
  window.__probe = () => { const r = { iv: iv.size, to: to.size, errs: errs.splice(0), lt, ltMs: Math.round(ltMs), ltMax: Math.round(ltMax) }; lt = 0; ltMs = 0; ltMax = 0; return r; };
})();"""
APP = """(() => {
  const sc = map.style.sourceCaches || {}; let tiles = 0, cache = 0;
  for (const k in sc) { tiles += Object.keys(sc[k]._tiles || {}).length; cache += sc[k]._cache?.order?.length || 0; }
  return { people: W.people.size, p3d: window.people3d ? people3d.count() : -1, seen: W.seen.size, log: (W.log || []).length,
    cells: W.cells.size, chans: W.chans.size, own: ST.own.size, arrs: ARR.filter(a => a && a.cards).length,
    objs: ARR.reduce((n, a) => n + (a && a.obj ? a.obj.filter(Boolean).length : 0), 0),
    markers: document.querySelectorAll('.maplibregl-marker').length, nodes: document.getElementsByTagName('*').length,
    layers: map.getStyle().layers.length, sources: Object.keys(map.getStyle().sources).length, tiles, cache,
    agents: typeof LIFE !== 'undefined' ? LIFE.agents.length : -1, z: +map.getZoom().toFixed(1) };
})()"""
def rss():
    out = subprocess.run(["ps", "-eo", "rss,args"], capture_output=True, text=True).stdout.splitlines()[1:]
    r = {"renderer": 0, "gpu": 0, "browser": 0, "other": 0}
    for l in out:
        k, a = l.strip().split(" ", 1)
        if "chrom" not in a or "ps -eo" in a: continue
        t = "renderer" if "--type=renderer" in a else "gpu" if "--type=gpu-process" in a else "other" if "--type=" in a else "browser"
        r[t] += int(k) / 1024
    return {k: round(v) for k, v in r.items()}
M = lambda a, b: math.hypot((a[0] - b[0]) * 73240, (a[1] - b[1]) * 110574)

async def main():
    # trois autres joueurs, riches, autour du point de départ
    bots = []
    for name in ["Zoé", "Malik", "Inès"]:
        u = str(uuid.uuid4()); db.sql("insert into auth.users(id) values (%s)", u)
        db.rpc(u, "join_game", p_pseudo=name + u[:4], p_party=random.choice(["poing", "tendue", "milieu", "valeurs", "rempart"]))
        db.sql("update profiles set cash = 1000000000 where id=%s", u); db.rpc(u, "world_join"); bots.append(u)
    rows, errs_all = [], []
    async with async_playwright() as p:
        br = await p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        ctx = await br.new_context(viewport={"width": 400, "height": 820}, device_scale_factor=2, is_mobile=True, has_touch=True)
        await ctx.add_init_script(INIT)
        pg = await ctx.new_page(); E = pg.evaluate; W = lambda js, t=120000: pg.wait_for_function(js, timeout=t, polling=200)
        pg.on("pageerror", lambda e: errs_all.append("pageerror " + str(e)[:300]))
        pg.on("console", lambda m: m.type == "error" and errs_all.append("console " + m.text[:300]))
        cdp = await ctx.new_cdp_session(pg)
        wk, resp = {}, {}
        cdp.on("Target.attachedToTarget", lambda ev: wk.__setitem__(ev["sessionId"], ev["targetInfo"]["type"]))
        cdp.on("Target.detachedFromTarget", lambda ev: wk.pop(ev.get("sessionId"), None))
        cdp.on("Target.receivedMessageFromTarget", lambda ev: resp.__setitem__((ev["sessionId"], json.loads(ev["message"]).get("id")), json.loads(ev["message"])))
        await cdp.send("Target.setAutoAttach", {"autoAttach": True, "waitForDebuggerOnStart": False, "flatten": False})
        mid = [100]
        async def worker_heaps():
            tot, n = 0, 0
            for sid in list(wk):
                mid[0] += 2; a, b = mid[0], mid[0] + 1
                try:
                    await cdp.send("Target.sendMessageToTarget", {"sessionId": sid, "message": json.dumps({"id": a, "method": "HeapProfiler.collectGarbage"})})
                    await cdp.send("Target.sendMessageToTarget", {"sessionId": sid, "message": json.dumps({"id": b, "method": "Runtime.getHeapUsage"})})
                except Exception: continue
            await asyncio.sleep(1.5)
            for sid in list(wk):
                for (s, i), m in list(resp.items()):
                    if s == sid and "result" in m and "usedSize" in m["result"]: tot += m["result"]["usedSize"]; n += 1; resp.pop((s, i), None)
            return n, tot
        async def measure(label, t0):
            await cdp.send("HeapProfiler.collectGarbage"); await asyncio.sleep(0.5); await cdp.send("HeapProfiler.collectGarbage")
            h = await cdp.send("Runtime.getHeapUsage"); d = await cdp.send("Memory.getDOMCounters")
            nw, wh = await worker_heaps()
            fps = await E("new Promise(r => { let n = 0; const f = () => n++; map.on('render', f); setTimeout(() => { map.off('render', f); r(Math.round(n / 3)); }, 3000); })")
            pr = await E("window.__probe()"); app = await E(APP)
            row = {"étape": label, "min": round((time.time() - t0) / 60, 1), "tas": round(h["usedSize"] / 1e6), "workers": round(wh / 1e6), "nw": nw,
                   "noeuds": d["nodes"], "écouteurs": d["jsEventListeners"], "docs": d["documents"], "minuteurs": pr["iv"], "attentes": pr["to"],
                   "img/s": fps, "longues": pr["lt"], "longues_ms": pr["ltMs"], "pire_ms": pr["ltMax"], **{"rss_" + k: v for k, v in rss().items()}, **app}
            errs_all.extend(pr["errs"]); rows.append(row)
            print(json.dumps(row, ensure_ascii=False), flush=True)
            return row

        # ---- un compte, comme un nouveau joueur, puis on revient (joueur qui revient le lendemain) ----
        em = f"tour{int(time.time())}@test.fr"
        await pg.goto(f"http://localhost:{PORT}/?local"); await W("!document.querySelector('#onb').hidden")
        await pg.click(".lhero [data-l=email]"); await W("document.querySelector('#em')")
        await pg.fill("#em", em); await pg.fill("#pw", "secret12"); await pg.click("#authf button")
        await W("document.querySelector('#ps')"); await pg.fill("#ps", "Tour" + em.split("@")[0][-5:]); await pg.click("#pf button")
        await W("document.querySelector('#plater')"); await pg.click("#plater"); await W("document.querySelector('.welcome')")
        me = await E("ME")
        await E("localStorage.setItem('hm_tut','99'); localStorage.setItem('hm_hint3','1'); 1")
        db.sql("update profiles set cash = 50000000 where id=%s", me)
        await pg.reload(); await W("typeof W !== 'undefined' && W.on && !!meP()", 180000); await pg.wait_for_timeout(8000)
        t0 = time.time()
        stop = asyncio.Event()

        # ---- les autres joueurs : ils lancent le dé et courent autour de lui, parlent (1 message par minute), achètent ----
        async def life_of_bots():
            k, said, bought = 0, {b: 0 for b in bots}, 0
            while not stop.is_set():
                try:
                    me_pos = await asyncio.to_thread(lambda: db.sql("select lon, lat from walkers where user_id=%s", me)[0])
                    b = bots[k % len(bots)]; k += 1
                    bp = await asyncio.to_thread(lambda: db.sql("select lon, lat from walkers where user_id=%s", b)[0])
                    if M(bp, me_pos) > 400:   # trop loin : il revient près de lui (comme s'il était arrivé au dé)
                        x, y = me_pos[0] + random.uniform(-.0012, .0012), me_pos[1] + random.uniform(-.0008, .0008)
                        await asyncio.to_thread(lambda: (db.sql("update walkers set lon=%s, lat=%s, lon0=%s, lat0=%s, dur=0, path=null, settled=true, t0=now()-interval '1 minute' where user_id=%s", x, y, x, y, b),
                                                         db.sql("update world_people set lon=%s, lat=%s, cell=_wcell(%s,%s), seen=now() where user_id=%s", x, y, x, y, b)))
                        bp = (x, y)
                    def go():   # un vol vers un point au hasard tout près (26/10/2026 : la montgolfière vole où l'on veut ; avant : le dé)
                        db.sql("update profiles set km_free = 5, km_at = now() where id=%s", b)
                        db.sql("update walkers set t0 = now() - interval '1 minute' where user_id=%s", b)   # (son vol d'avant est fini)
                        db.rpc(b, "fly", p_lon=bp[0] + random.uniform(-.004, .004), p_lat=bp[1] + random.uniform(-.0027, .0027))
                    await asyncio.to_thread(go)
                    if time.time() - said[b] > 62:
                        said[b] = time.time()
                        await asyncio.to_thread(lambda: db.rpc(b, "world_say", p_text=random.choice(["Salut !", "Qui vend dans le 5e ?", "Belle vue d'ici", "J'achète !", "On se retrouve à Châtelet ?", "Bonne journée"])))
                    if time.time() - bought > 40:
                        bought = time.time()
                        def buy():
                            r = db.sql("select id from cards where lk='l' and cx between %s and %s and cy between %s and %s and id not in (select card from lots) limit 1",
                                       int(me_pos[0] * 1e5) - 300, int(me_pos[0] * 1e5) + 300, int(me_pos[1] * 1e5) - 200, int(me_pos[1] * 1e5) + 200)
                            if r: db.sql("insert into lots(card,k,owner) values (%s,0,%s)", r[0][0], b)
                        await asyncio.to_thread(buy)
                except Exception as e: errs_all.append("robot " + str(e).split("\n")[0][:200])
                try: await asyncio.wait_for(stop.wait(), 4)
                except asyncio.TimeoutError: pass
        bot_task = asyncio.create_task(life_of_bots())

        # ---- ce que fait le joueur ----
        async def walk(far=False):   # un vol (dézoomé avant : far) vers un immeuble à l'écran, au hasard, ou une rue ; sa case
            db.sql("update profiles set km_free = 5, km_at = now(), km_buy = 20 where id=%s", me); await E("refreshState().then(() => { renderDock(); return 1; })")
            if far:
                await E("camOff(true); map.jumpTo({ center: [meP().lon, meP().lat], zoom: 13.9, pitch: 40 }); 1"); await pg.wait_for_timeout(1500)
            ok = await E("""(() => { const gs = [...new Set(map.queryRenderedFeatures({ layers: ['bd'] }).map(f => f.id).filter(g => g != null && card(g)))];
              if (gs.length && Math.random() < .7) { flyMe(null, null, gs[Math.floor(Math.random() * gs.length)]); return true; }
              const m = meP(); flyMe(m.lon + (Math.random() - .5) * .006, m.lat + (Math.random() - .5) * .004, null); return true; })()""")
            try: await W("!!W.run", 10000)
            except Exception: errs_all.append("vol : pas parti en 10 s"); return False
            try: await W("!W.run && !meP().path", 80000)
            except Exception: errs_all.append("vol : pas arrivé en 80 s")
            await E("justBought = null; setMovebar(''); 1"); await pg.wait_for_timeout(600)
            return True
        bld = """(() => [...new Set(map.queryRenderedFeatures({ layers: ['bd'] }).map(f => f.id).filter(g => g != null && card(g)))].slice(0, 80))()"""
        async def cases(n):
            gs = await E(bld)
            for g in random.sample(gs, min(n, len(gs))):
                await E(f"setMovebar(''); worldTapCard({g}); 1"); await pg.wait_for_timeout(1200); await E("setMovebar(''); 1"); await pg.wait_for_timeout(300)
        async def fiches(n):
            gs = await E(bld)
            for g in random.sample(gs, min(n, len(gs))):
                await E(f"push('b', {g}); 1"); await W("document.querySelector('#p-detail [data-back]')", 20000); await pg.wait_for_timeout(900)
                await pg.click("#p-detail [data-back]"); await pg.wait_for_timeout(500)
        async def boosters(n):
            db.sql("update profiles set welcome = %s where id=%s", n, me); await E("refreshState().then(() => 1)")
            for i in range(n):
                await pg.click("#b-pack"); await W("document.querySelector('#packbtn')"); await pg.wait_for_timeout(300)
                await pg.click("#packbtn"); await W("!document.querySelector('#reveal').hidden", 30000)
                for _ in range(14):
                    if await E("!!document.querySelector('.sumgrid')"): break
                    await pg.click("#reveal", position={"x": 200, "y": 400}); await pg.wait_for_timeout(150)
                await W("document.querySelector('.sumgrid')", 30000); await pg.wait_for_timeout(500)
                await pg.click("[data-r=map]"); await pg.wait_for_timeout(800)
        async def onglets():
            for t in ["assets", "market", "paris", "map"]:
                await pg.click(f"#tabs [data-tab={t}]"); await pg.wait_for_timeout(1800)
        async def metro():   # tombé sur la station la plus proche (posé là par la base, comme après un lancer), puis le métro
            st = await E("(() => { const m = meP(); let best = null; for (const [g] of W.G.st) { const s = spotOf(g); if (!s) continue; const d = mLL([m.lon, m.lat], [s[3], s[4]]); if (!best || d < best[1]) best = [g, d]; } return best[0]; })()")
            sx, sy = db.sql("select cx / 1e5, cy / 1e5 from cards where id=%s", st)[0]
            db.sql("update walkers set lon=%s, lat=%s, lon0=%s, lat0=%s, dur=0, path=null, settled=true, t0=now()-interval '1 minute' where user_id=%s", sx, sy, sx, sy, me)
            db.sql("update profiles set land=%s, pend=null where id=%s", st, me)
            await E("rejoin().then(() => refreshState()).then(() => { setMovebar(''); showLand(); return 1; })")
            await W("document.querySelector('#movebar [data-wmetro]')", 15000)
            await pg.click("#movebar [data-wmetro]"); await W("document.querySelector('#plsheet .mtls')", 5000)
            q, dest = random.choice([("nation", None), ("pigalle", None), ("trocad", None), ("bastille", None), ("montparnasse", None)])
            await pg.fill("#mtq", q); await W("document.querySelector('#mtres [data-wride]')", 5000)
            await pg.click("#mtres [data-wride]"); await W("!W.riding && !meP().gone", 40000); await pg.wait_for_timeout(1500); await E("setMovebar(''); 1")
        async def survol(k=20):
            for i in range(k):
                await E(f"camOff(); map.jumpTo({{ center: IDX.arr[{i}].center, zoom: 16.4, pitch: 58, bearing: {(i * 37) % 360} }}); 1"); await pg.wait_for_timeout(3500)
            await E("centerOnMe(true); 1"); await pg.wait_for_timeout(2500)

        async def tour(n):
            await measure(f"{n} · départ", t0)
            for i in range(5): await walk()
            await measure(f"{n} · 5 lancers de dé", t0)
            for i in range(2): await walk(far=True)
            await measure(f"{n} · 2 lancers dézoomé", t0)
            await metro(); await measure(f"{n} · métro", t0)
            await cases(8); await fiches(5); await measure(f"{n} · 8 cases, 5 fiches", t0)
            await boosters(2); await measure(f"{n} · 2 boosters", t0)
            await onglets(); await measure(f"{n} · onglets", t0)
            await survol(); await measure(f"{n} · survol des 20 arrondissements", t0)
            await pg.wait_for_timeout(60000); await measure(f"{n} · 1 min sans rien faire", t0)

        await tour(1)
        await tour(2)
        stop.set(); await bot_task
        await pg.screenshot(path=OUT + "tour_fin.png")
        await br.close()
    json.dump({"rows": rows, "errs": errs_all}, open(OUT + "tour.json", "w"), ensure_ascii=False, indent=1)
    print("\nERREURS :", len(errs_all)); [print("  ", e) for e in errs_all[:40]]
    a = {r["étape"].split(" · ", 1)[1]: r for r in rows if r["étape"].startswith("1 ·")}; b = {r["étape"].split(" · ", 1)[1]: r for r in rows if r["étape"].startswith("2 ·")}
    print("\n2e tour − 1er tour, même étape (ce qui grossit encore = fuite) :")
    for k in b:
        if k in a: print(f"  {k:42s} tas {b[k]['tas'] - a[k]['tas']:+4d} Mo · workers {b[k]['workers'] - a[k]['workers']:+4d} Mo · nœuds {b[k]['noeuds'] - a[k]['noeuds']:+6d} · écouteurs {b[k]['écouteurs'] - a[k]['écouteurs']:+5d} · minuteurs {b[k]['minuteurs'] - a[k]['minuteurs']:+3d} · renderer {b[k]['rss_renderer'] - a[k]['rss_renderer']:+5d} Mo")
asyncio.run(main())
