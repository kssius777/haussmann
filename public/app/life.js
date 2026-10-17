"use strict";
// =====================================================================
//  Paris vivant : voitures, passants, poussettes, chiens et pigeons
//  sur les vraies rues, et de temps en temps un passant raconte une
//  anecdote dans une bulle. Léger : une seule couche de symboles, mise à
//  jour ~18 fois par seconde, seulement quand on est zoomé sur la carte.
// =====================================================================
const LIFE = { on: false, agents: [], lines: null, linesKey: "", last: 0, tick: 0, bubble: null, nextTalk: 0 };
const LIFE_Z = 15;            // en dessous, on ne voit de toute façon rien
const M_LAT = 110540, M_LON = 111320 * Math.cos(48.86 * Math.PI / 180);

function lifeEnabled() {
  try { if (localStorage.getItem("hm_life") === "0") return false; } catch (e) { }
  return !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ---- petites images dessinées une fois (vue de dessus) ----
function lifeImages() {
  const mk = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); draw(g); return g.getImageData(0, 0, w, h); };
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
  const add = (id, img) => { if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio: 2 }); };
  ["#E5484D", "#2563EB", "#F5F5F4", "#1F2937", "#F59E0B", "#10B981", "#94A3B8"].forEach((col, i) => add("car" + i, mk(40, 20, g => {
    g.fillStyle = "rgba(0,0,0,.18)"; rr(g, 2, 3, 37, 16, 6);
    g.fillStyle = col; rr(g, 1, 1, 36, 16, 6);
    g.fillStyle = "rgba(20,30,50,.75)"; rr(g, 22, 3, 7, 12, 2); rr(g, 6, 4, 5, 10, 2);
    g.fillStyle = "rgba(255,255,255,.35)"; rr(g, 12, 3, 9, 12, 2);
  })));
  add("bus", mk(76, 22, g => { g.fillStyle = "rgba(0,0,0,.18)"; rr(g, 2, 3, 73, 18, 5); g.fillStyle = "#16A34A"; rr(g, 1, 1, 72, 18, 5); g.fillStyle = "#E8F5E9"; rr(g, 4, 4, 64, 12, 3); g.fillStyle = "#16A34A"; for (let x = 10; x < 66; x += 10) g.fillRect(x, 4, 2, 12); }));
  ["#2563EB", "#E5484D", "#111827", "#F59E0B", "#7C3AED", "#0EA5E9", "#DB2777", "#16A34A"].forEach((col, i) => add("ped" + i, mk(16, 16, g => {
    g.fillStyle = "rgba(0,0,0,.2)"; g.beginPath(); g.ellipse(9, 9, 6, 5, 0, 0, 7); g.fill();
    g.fillStyle = col; g.beginPath(); g.ellipse(8, 8, 6, 4.2, 0, 0, 7); g.fill();
    g.fillStyle = ["#F1C9A5", "#C68B59", "#8D5524", "#E0AC69"][i % 4]; g.beginPath(); g.arc(8, 8, 2.9, 0, 7); g.fill();
  })));
  add("stroll", mk(30, 16, g => {
    g.fillStyle = "rgba(0,0,0,.2)"; rr(g, 17, 3, 12, 11, 4);
    g.fillStyle = "#334155"; rr(g, 16, 2, 12, 11, 4); g.fillStyle = "#93C5FD"; rr(g, 19, 4, 7, 7, 3);
    g.fillStyle = "#DB2777"; g.beginPath(); g.ellipse(8, 8, 6, 4.2, 0, 0, 7); g.fill(); g.fillStyle = "#F1C9A5"; g.beginPath(); g.arc(8, 8, 2.9, 0, 7); g.fill();
  }));
  add("dog", mk(30, 16, g => {
    g.fillStyle = "#2563EB"; g.beginPath(); g.ellipse(8, 8, 6, 4.2, 0, 0, 7); g.fill(); g.fillStyle = "#C68B59"; g.beginPath(); g.arc(8, 8, 2.9, 0, 7); g.fill();
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 1; g.beginPath(); g.moveTo(13, 8); g.lineTo(19, 8); g.stroke();
    g.fillStyle = "#A0522D"; g.beginPath(); g.ellipse(23, 8, 5, 2.6, 0, 0, 7); g.fill(); g.beginPath(); g.arc(28, 8, 2, 0, 7); g.fill();
  }));
  add("pigeon", mk(12, 8, g => { g.fillStyle = "#8B95A5"; g.beginPath(); g.ellipse(5, 4, 4, 2.6, 0, 0, 7); g.fill(); g.fillStyle = "#4B5563"; g.beginPath(); g.arc(9.3, 4, 1.8, 0, 7); g.fill(); g.fillStyle = "#6EE7B7"; g.fillRect(7.6, 3, 1, 2); }));
}

// ---- les rues visibles, en mètres ----
function lifeLines() {
  if (LIFE.lines && performance.now() - LIFE.linesAt < 4000 && LIFE.linesKey) return LIFE.lines;
  const b = map.getBounds(), W = b.getWest(), E = b.getEast(), S = b.getSouth(), N = b.getNorth(), out = { car: [], walk: [] };
  for (let i = 0; i < 20; i++) {
    const A = ARR[i]; if (!A?.roads) continue;
    if (!A.lifeL) A.lifeL = A.roads.map(([k, f]) => {
      const p = decodeRing(f); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; const cum = [0];
      for (let j = 0; j < p.length; j++) { const [x, y] = p[j]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); if (j) cum.push(cum[j - 1] + Math.hypot((x - p[j - 1][0]) * M_LON, (y - p[j - 1][1]) * M_LAT)); }
      return { k, p, cum, len: cum[cum.length - 1], bb: [x0, y0, x1, y1] };
    }).filter(l => l.len > 25);
    for (const l of A.lifeL) if (l.bb[2] > W && l.bb[0] < E && l.bb[3] > S && l.bb[1] < N) { out.walk.push(l); if (l.k === 1 && l.len > 60) out.car.push(l); }
  }
  LIFE.linesKey = "ok"; LIFE.linesAt = performance.now(); LIFE.lines = out; return out;
}
function lifeAt(l, d, off) {   // position (et direction) à d mètres le long de la rue, décalée de off mètres sur le côté
  const c = l.cum; let j = 1; while (j < c.length - 1 && c[j] < d) j++;
  const a = l.p[j - 1], b = l.p[j], t = Math.max(0, Math.min(1, (d - c[j - 1]) / ((c[j] - c[j - 1]) || 1)));
  const dx = (b[0] - a[0]) * M_LON, dy = (b[1] - a[1]) * M_LAT, n = Math.hypot(dx, dy) || 1;
  return { x: a[0] + (b[0] - a[0]) * t + (dy / n) * off / M_LON, y: a[1] + (b[1] - a[1]) * t - (dx / n) * off / M_LAT, ang: Math.atan2(dx, dy) * 180 / Math.PI };
}

// ---- les habitants ----
const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
function lifeSpawn(kind, L) {
  const pool = kind === "car" || kind === "bus" ? L.car : L.walk; if (!pool.length) return null;
  const l = pick(pool), dir = Math.random() < .5 ? 1 : -1;
  if (kind === "car" || kind === "bus") return { kind, l, d: rnd(0, l.len), dir, v: kind === "bus" ? rnd(6, 8) : rnd(8, 13), off: 1.3, icon: kind === "bus" ? "bus" : "car" + Math.floor(Math.random() * 7) };
  if (kind === "pigeons") { const d = rnd(0, l.len), side = pick([-3, 3]); return { kind, l, d, flock: Array.from({ length: Math.floor(rnd(3, 7)) }, () => ({ dx: rnd(-4, 4), dy: rnd(-4, 4), a: rnd(0, 360), fly: 0 })), off: side, scare: rnd(6, 20) }; }
  const sub = Math.random(), icon = sub < .07 ? "stroll" : sub < .14 ? "dog" : "ped" + Math.floor(Math.random() * 8);
  return { kind: "ped", l, d: rnd(0, l.len), dir, v: rnd(1.6, 2.6), off: (l.k === 1 ? 3.6 : .9) * pick([-1, 1]) + rnd(-.4, .4), icon, pause: 0 };
}
function lifeTarget() {   // combien d'habitants selon le zoom et la taille de l'écran
  const z = map.getZoom(), area = innerWidth * innerHeight / (390 * 700), f = Math.min(1.6, area) * Math.min(1, (z - LIFE_Z + .6) / 1.2);
  return { car: Math.round(16 * f), bus: Math.round(1.5 * f), ped: Math.round(30 * f), pigeons: Math.round(3 * f) };
}
function lifeStep(dt) {
  const L = lifeLines(), want = lifeTarget(), b = map.getBounds().toArray(), pad = .004;
  const inView = (x, y) => x > b[0][0] - pad && x < b[1][0] + pad && y > b[0][1] - pad && y < b[1][1] + pad;
  const count = {}; LIFE.agents = LIFE.agents.filter(a => {
    if (a.kind !== "pigeons") {
      if (a.pause > 0) a.pause -= dt; else if (!a.talk) a.d += a.v * a.dir * dt;
      if (a.d < 0 || a.d > a.l.len) return false;
      if (a.kind === "ped" && Math.random() < dt / 25) a.pause = rnd(1.5, 5);   // on s'arrête devant une vitrine
    } else {
      a.scare -= dt;
      for (const p of a.flock) { if (p.fly > 0) { p.fly -= dt; p.dx += Math.sin(p.a * Math.PI / 180) * 9 * dt; p.dy += Math.cos(p.a * Math.PI / 180) * 9 * dt; } else if (Math.random() < dt * 1.5) { p.a = rnd(0, 360); p.dx += rnd(-.4, .4); p.dy += rnd(-.4, .4); } }
      if (a.scare < 0) { a.scare = rnd(10, 25); const ang = rnd(0, 360); a.flock.forEach(p => { p.fly = rnd(1, 1.8); p.a = ang + rnd(-25, 25); }); }
      if (a.flock.every(p => Math.hypot(p.dx, p.dy) > 60)) return false;
    }
    const q = lifeAt(a.l, Math.max(0, Math.min(a.l.len, a.d)), a.off * (a.dir || 1)); a.x = q.x; a.y = q.y; a.ang = a.dir < 0 ? q.ang + 180 : q.ang;
    if (!a.talk && !inView(a.x, a.y)) return false;
    count[a.kind] = (count[a.kind] || 0) + 1; return true;
  });
  for (const k of ["car", "bus", "ped", "pigeons"]) for (let n = count[k] || 0; n < want[k]; n++) { const a = lifeSpawn(k, L); if (!a) break; LIFE.agents.push(a); }
  const feats = [];
  for (const a of LIFE.agents) {
    if (a.x == null) continue;
    if (a.kind === "pigeons") { for (const p of a.flock) feats.push({ type: "Feature", properties: { i: "pigeon", r: p.a - 90, s: p.fly > 0 ? 1.25 : 1 }, geometry: { type: "Point", coordinates: [a.x + p.dx / M_LON, a.y + p.dy / M_LAT] } }); continue; }
    feats.push({ type: "Feature", properties: { i: a.icon, r: a.ang - 90, s: 1 }, geometry: { type: "Point", coordinates: [a.x, a.y] } });
  }
  map.getSource("life")?.setData({ type: "FeatureCollection", features: feats });
}

// ---- anecdotes ----
const ANECDOTES = [
  [2.2945, 48.8584, "L'été, la tour Eiffel grandit de plusieurs centimètres : le fer se dilate à la chaleur."],
  [2.2945, 48.8584, "La tour Eiffel est repeinte à la main environ tous les 7 ans : il faut une soixantaine de tonnes de peinture."],
  [2.3488, 48.8534, "Devant Notre-Dame, une plaque marque le « point zéro » : c'est d'ici qu'on mesure les distances des routes de France."],
  [2.3413, 48.8572, "Le Pont Neuf est le plus vieux pont de Paris encore debout : il a été achevé en 1607, malgré son nom."],
  [2.3522, 48.8566, "Ici, c'était la place de Grève. Les ouvriers sans travail venaient y chercher une embauche : d'où l'expression « faire grève »."],
  [2.3462, 48.8462, "En 1851, Léon Foucault a montré que la Terre tourne avec un pendule accroché sous la coupole du Panthéon."],
  [2.3212, 48.8656, "L'obélisque de la Concorde a plus de 3 000 ans : il vient du temple de Louxor, en Égypte."],
  [2.2950, 48.8738, "Douze avenues partent de la place de l'Étoile, autour de l'Arc de Triomphe."],
  [2.3431, 48.8867, "Le Sacré-Cœur reste blanc tout seul : quand il pleut, sa pierre libère de la calcite qui la nettoie."],
  [2.3317, 48.8720, "Sous l'Opéra Garnier, il y a une vraie réserve d'eau : elle a inspiré le lac du Fantôme de l'Opéra."],
  [2.3359, 48.8610, "La pyramide du Louvre compte 673 vitres, et pas 666 comme le dit la légende."],
  [2.3655, 48.8556, "La place des Vosges, inaugurée en 1612, est la plus ancienne place construite d'un seul plan à Paris."],
  [2.3462, 48.8532, "La rue du Chat-qui-Pêche est l'une des plus étroites de Paris : à peine 1,80 m de large par endroits."],
  [2.3522, 48.8606, "Les tuyaux du Centre Pompidou ont un code couleur : bleu pour l'air, vert pour l'eau, jaune pour l'électricité, rouge pour les déplacements."],
  [2.3266, 48.8600, "Le musée d'Orsay était une gare, construite pour l'Exposition universelle de 1900."],
  [2.3017, 48.8634, "Au pont de l'Alma, la statue du Zouave sert à mesurer les crues : en 1910, l'eau lui arrivait aux épaules."],
  [2.2796, 48.8500, "Au bout de l'île aux Cygnes, une petite statue de la Liberté regarde vers New York."],
  [2.3375, 48.8583, "En 2015, on a retiré environ 45 tonnes de cadenas d'amoureux du pont des Arts."],
  [2.3401, 48.8880, "Montmartre a encore sa vigne, le Clos Montmartre : ses vendanges sont fêtées chaque automne."],
  [2.3828, 48.8809, "Le parc des Buttes-Chaumont a été aménagé sur d'anciennes carrières de gypse."],
  [2.3324, 48.8339, "Sous Denfert-Rochereau, les catacombes gardent les restes de plusieurs millions de Parisiens."],
  [2.3125, 48.8550, "En 1989, le dôme des Invalides a été redoré avec plus d'un demi-million de feuilles d'or."],
  [2.3690, 48.8590, "Le canal Saint-Martin passe sous la place de la Bastille, dans un long tunnel."],
  [2.3471, 48.8526, "À la librairie Shakespeare and Company, de jeunes écrivains de passage peuvent dormir entre les rayons."],
  [2.3372, 48.8462, "Au jardin du Luxembourg, les enfants poussent des petits voiliers sur le bassin depuis plus d'un siècle."],
  [null, null, "Sur un immeuble haussmannien, les balcons filants sont souvent au 2ᵉ et au 5ᵉ étage. Le 2ᵉ, c'était « l'étage noble »."],
  [null, null, "Sous Haussmann, la hauteur des immeubles dépendait de la largeur de la rue."],
  [null, null, "Les fontaines Wallace, vertes, ont été offertes à Paris par Richard Wallace dans les années 1870."],
  [null, null, "Les colonnes Morris affichent les spectacles depuis les années 1860."],
  [null, null, "Les arrondissements de Paris tournent en spirale, comme un escargot, en partant du centre."],
  [null, null, "Avant 1860, Paris n'avait que 12 arrondissements."],
  [null, null, "Les plaques de rue bleues de Paris sont en lave émaillée."],
  [null, null, "Les entrées de métro « Art nouveau », avec leurs lampes en forme de fleur, ont été dessinées par Hector Guimard."],
  [null, null, "Les bouquinistes des quais de Seine forment l'une des plus grandes librairies à ciel ouvert du monde."],
  [null, null, "Dans une rue de Paris, les numéros commencent du côté de la Seine."],
];
function lifeSeen() { try { return JSON.parse(localStorage.getItem("hm_anec") || "[]"); } catch (e) { return []; } }
function lifeTalk() {
  if (LIFE.bubble || typeof moving !== "undefined" && moving) return;
  const B = document.body.classList; if (B.contains("landopen") || B.contains("picking") || document.querySelector("#coach:not([hidden]), #maphint")) return;
  const cw = map.getCanvas().clientWidth, ch = map.getCanvas().clientHeight;
  const peds = LIFE.agents.filter(a => { if (a.kind !== "ped" || a.x == null) return false; const q = map.project([a.x, a.y]); return q.x > 125 && q.x < cw - 125 && q.y > 190 && q.y < ch - 230; });
  if (!peds.length) { LIFE.nextTalk = performance.now() + 8000; return; }
  const b = map.getBounds(), seen = lifeSeen();
  const near = ANECDOTES.map((a, i) => [a, i]).filter(([a, i]) => a[0] != null && b.contains([a[0], a[1]]) && !seen.includes(i));
  const gen = ANECDOTES.map((a, i) => [a, i]).filter(([a, i]) => a[0] == null && !seen.includes(i));
  let pickd = near.length ? pick(near) : gen.length ? pick(gen) : null;
  if (!pickd) { try { localStorage.setItem("hm_anec", "[]"); } catch (e) { } return; }
  const [a, i] = pickd;
  let who = pick(peds);
  if (a[0] != null) who = peds.reduce((m, p) => Math.hypot(p.x - a[0], p.y - a[1]) < Math.hypot(m.x - a[0], m.y - a[1]) ? p : m, peds[0]);
  try { localStorage.setItem("hm_anec", JSON.stringify(seen.concat(i).slice(-60))); } catch (e) { }
  who.talk = true;
  const el = document.createElement("div"); el.className = "lbub";
  el.innerHTML = `<div class="lb-in"><small>Le saviez-vous ?</small>${esc(a[2])}</div>`;
  const mk = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -6] }).setLngLat([who.x, who.y]).addTo(map);
  const end = () => { if (!LIFE.bubble) return; el.classList.add("out"); setTimeout(() => mk.remove(), 260); who.talk = false; LIFE.bubble = null; };
  el.onclick = e => { e.stopPropagation(); end(); };
  LIFE.bubble = { end, who }; setTimeout(end, 9000);
}

// ---- boucle ----
function lifeActive() {
  return LIFE.ok && lifeEnabled() && !document.hidden && typeof tab !== "undefined" && tab === "map" && map.getZoom() >= LIFE_Z - .3 && !document.body.classList.contains("mymode");
}
function lifeLoop(t) {
  requestAnimationFrame(lifeLoop);
  if (!LIFE.ok) return;
  const act = lifeActive();
  if (!act) { if (LIFE.on) { LIFE.on = false; LIFE.agents = []; map.getSource("life")?.setData({ type: "FeatureCollection", features: [] }); LIFE.bubble?.end(); } return; }
  if (!LIFE.on) { LIFE.on = true; LIFE.last = t; LIFE.nextTalk = t + 25000; }
  if (t - LIFE.last < 55) return;   // ~18 images par seconde suffisent
  const dt = Math.min(.2, (t - LIFE.last) / 1000); LIFE.last = t;
  lifeStep(dt);
  if (t > LIFE.nextTalk) { LIFE.nextTalk = t + rnd(40000, 70000); lifeTalk(); }
}
function lifeInit() {
  if (LIFE.ok || typeof map === "undefined" || !map || !map.getLayer?.("anchor-b") || !map.isStyleLoaded?.()) return false;
  lifeImages();
  map.addSource("life", { type: "geojson", data: { type: "FeatureCollection", features: [] }, buffer: 0, tolerance: 0, maxzoom: 18 });
  map.addLayer({ id: "life", type: "symbol", source: "life", minzoom: LIFE_Z - .3, layout: {
    "icon-image": ["get", "i"], "icon-rotate": ["get", "r"], "icon-rotation-alignment": "map", "icon-pitch-alignment": "map",
    "icon-allow-overlap": true, "icon-ignore-placement": true,
    "icon-size": ["interpolate", ["linear"], ["zoom"], 15, ["*", .55, ["get", "s"]], 16, ["*", .95, ["get", "s"]], 17, ["*", 1.5, ["get", "s"]], 18, ["*", 2.3, ["get", "s"]]] },
    paint: { "icon-opacity": ["interpolate", ["linear"], ["zoom"], LIFE_Z - .3, 0, LIFE_Z + .2, 1] } }, "anchor-b");
  map.on("moveend", () => { LIFE.linesKey = ""; });
  LIFE.ok = true; requestAnimationFrame(lifeLoop); return true;
}
(function waitMap() { try { if (lifeInit()) return; } catch (e) { console.warn("life", e); return; } setTimeout(waitMap, 1000); })();
