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
  const mk = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d", { willReadFrequently: true }); draw(g); return g.getImageData(0, 0, w, h); };   // (lu tout de suite : pas de canvas sur la carte graphique, 21/10/2026)
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
  ["#2563EB", "#E5484D", "#111827", "#10B981", "#F59E0B"].forEach((col, i) => add("bike" + i, mk(28, 12, g => {
    g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(3, 6, 23, 3);
    g.fillStyle = "#1F2937"; g.fillRect(1, 5, 7, 2); g.fillRect(20, 5, 7, 2); g.fillRect(7, 5.5, 14, 1);   // roues et cadre
    g.fillStyle = col; g.beginPath(); g.ellipse(12, 6, 4.2, 4.6, 0, 0, 7); g.fill();
    g.fillStyle = ["#F1C9A5", "#8D5524", "#C68B59"][i % 3]; g.beginPath(); g.arc(13, 6, 2.4, 0, 7); g.fill();
    g.fillStyle = col; g.fillRect(16, 2.5, 2.5, 1.2); g.fillRect(16, 8.3, 2.5, 1.2);   // bras sur le guidon
  })));
  add("pigeon", mk(12, 8, g => { g.fillStyle = "#8B95A5"; g.beginPath(); g.ellipse(5, 4, 4, 2.6, 0, 0, 7); g.fill(); g.fillStyle = "#4B5563"; g.beginPath(); g.arc(9.3, 4, 1.8, 0, 7); g.fill(); g.fillStyle = "#6EE7B7"; g.fillRect(7.6, 3, 1, 2); }));
}

// ---- les parcs (pas de voitures dedans, des vélos) ----
let LPARKS = null, LPARKG = null;
const PKX = .004, PKY = .0027, pkCell = (x, y) => Math.floor(x / PKX) * 100000 + Math.floor(y / PKY);
function inPark(x, y) {
  if (!LPARKS) LPARKS = (BASE?.parks || []).map(rs => { const r = decodeRing(rs[0]); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [a, b] of r) { x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); } return { r, bb: [x0, y0, x1, y1] }; });
  if (!LPARKG) {   // chaque parc dans les carrés que touche son rectangle
    LPARKG = new Map();
    for (const P of LPARKS) for (let gx = Math.floor(P.bb[0] / PKX); gx <= Math.floor(P.bb[2] / PKX); gx++) for (let gy = Math.floor(P.bb[1] / PKY); gy <= Math.floor(P.bb[3] / PKY); gy++) {
      const k = gx * 100000 + gy; let l = LPARKG.get(k); if (!l) LPARKG.set(k, l = []); l.push(P); }
  }
  for (const P of LPARKG.get(pkCell(x, y)) || []) {
    if (x < P.bb[0] || x > P.bb[2] || y < P.bb[1] || y > P.bb[3]) continue;
    let ins = false; const r = P.r; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins;
    if (ins) return true;
  }
  return false;
}
// ---- zones piétonnes : pas de voitures, comme dans un parc (le Champ-de-Mars, piétonnisé ; 20/10/2026) ----
const NOCAR = [[[2.29193, 48.85769], [2.29199, 48.85778], [2.29554, 48.85983], [2.2969, 48.85904], [2.3035, 48.85413], [2.30247, 48.85023], [2.30138, 48.85096]]];
const inPoly = (x, y, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins; return ins; };
const pedZone = p => NOCAR.some(r => [p[0], p[Math.floor(p.length / 2)], p[p.length - 1]].every(q => inPoly(q[0], q[1], r)));
// ---- les rues visibles, en mètres ----
function lifeLines() {
  if (LIFE.lines && performance.now() - LIFE.linesAt < 4000 && LIFE.linesKey) return LIFE.lines;
  const b = map.getBounds(), W = b.getWest(), E = b.getEast(), S = b.getSouth(), N = b.getNorth(), out = { car: [], walk: [], bike: [] };
  for (let i = 0; i < 20; i++) {
    const A = ARR[i]; if (!A?.roads) continue;
    const ab = IDX.arr[i].bbox; if (ab && (ab[2] < W || ab[0] > E || ab[3] < S || ab[1] > N)) continue;   // (pas à l'écran : rien à préparer)
    if (!A.lifeL) A.lifeL = A.roads.map(([k, f]) => {
      const p = decodeRing(f); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; const cum = [0];
      for (let j = 0; j < p.length; j++) { const [x, y] = p[j]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); if (j) cum.push(cum[j - 1] + Math.hypot((x - p[j - 1][0]) * M_LON, (y - p[j - 1][1]) * M_LAT)); }
      const m = p[Math.floor(p.length / 2)], m2 = p[0];
      return { k, p, cum, len: cum[cum.length - 1], bb: [x0, y0, x1, y1], park: (inPark((m[0] + m2[0]) / 2, (m[1] + m2[1]) / 2) && inPark(m[0], m[1])) || pedZone(p) };
    }).filter(l => l.len > 25);
    for (const l of A.lifeL) if (l.bb[2] > W && l.bb[0] < E && l.bb[3] > S && l.bb[1] < N) { out.walk.push(l); if (l.park) out.bike.push(l); else if (l.k === 1 && l.len > 60) out.car.push(l); }
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
  const pool = kind === "car" || kind === "bus" ? L.car : kind === "bike" ? L.bike.concat(L.car) : L.walk; if (!pool.length) return null;
  const l = pick(pool), dir = Math.random() < .5 ? 1 : -1;
  if (kind === "car" || kind === "bus") return { kind, l, d: rnd(0, l.len), dir, v: kind === "bus" ? rnd(6, 8) : rnd(8, 13), off: 1.3, col: kind === "bus" ? "#16A34A" : pick(CAR_COLS) };
  if (kind === "bike") {   // dans les parcs, ou sur la piste cyclable d'une rue
    const pk = L.bike.length && (Math.random() < .6 || !L.car.length), l = pk ? pick(L.bike) : pick(L.car); if (!l) return null;
    const dir = Math.random() < .5 ? 1 : -1; return { kind, l, d: rnd(0, l.len), dir, v: rnd(4, 6.5), off: pk ? rnd(-.6, .6) : 3.4, icon: "bike" + Math.floor(Math.random() * 5) };
  }
  if (kind === "pigeons") { const d = rnd(0, l.len), side = pick([-3, 3]); return { kind, l, d, flock: Array.from({ length: Math.floor(rnd(3, 7)) }, () => ({ dx: rnd(-4, 4), dy: rnd(-4, 4), a: rnd(0, 360), fly: 0 })), off: side, scare: rnd(6, 20) }; }
  const sub = Math.random(), icon = sub < .07 ? "stroll" : sub < .14 ? "dog" : "ped" + Math.floor(Math.random() * 8);
  return { kind: "ped", l, d: rnd(0, l.len), dir, v: rnd(1.6, 2.6), off: (l.k === 1 ? 3.6 : .9) * pick([-1, 1]) + rnd(-.4, .4), icon, pause: 0 };
}
function lifeTarget() {   // combien d'habitants selon le zoom et la taille de l'écran
  const z = map.getZoom(), area = innerWidth * innerHeight / (390 * 700), f = Math.min(1.6, area) * Math.min(1, (z - LIFE_Z + .6) / 1.2);
  return { car: Math.round(14 * f), bus: Math.round(1.5 * f), bike: Math.round(7 * f), ped: Math.round(30 * f), pigeons: Math.round(3 * f) };
}
function lifeStep(dt, draw) {
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
  for (const k of ["car", "bus", "bike", "ped", "pigeons"]) for (let n = count[k] || 0; n < want[k]; n++) { const a = lifeSpawn(k, L); if (!a) break; LIFE.agents.push(a); }
  const feats = [], boxes = [];
  for (const a of LIFE.agents) {
    if (a.x == null) continue;
    if (a.kind === "car" || a.kind === "bus") { vehicle(boxes, a); continue; }
    if (a.kind === "pigeons") { for (const p of a.flock) feats.push({ type: "Feature", properties: { i: "pigeon", r: p.a - 90, s: p.fly > 0 ? 1.25 : 1 }, geometry: { type: "Point", coordinates: [a.x + p.dx / M_LON, a.y + p.dy / M_LAT] } }); continue; }
    feats.push({ type: "Feature", properties: { i: a.icon, r: a.ang - 90, s: 1 }, geometry: { type: "Point", coordinates: [a.x, a.y] } });
  }
  if (draw) map.getSource("life")?.setData({ type: "FeatureCollection", features: feats });
  LIFE.cars3d = boxes;
}


// ---- volumes 3D (voitures, bus, bateaux) : petites boîtes extrudées ----
const CAR_COLS = ["#E5484D", "#2563EB", "#F8FAFC", "#1F2937", "#F59E0B", "#10B981", "#94A3B8", "#F8FAFC", "#64748B", "#FACC15"];
// (20/10/2026, mémoire des téléphones) : les boîtes sont dessinées par three.js (models.js, people3d.boxes), sans repasser par la carte
// à chaque image ; boxFeature() seulement si three.js n'est pas là
function box(out, x, y, ang, along, len, wid, base, h, col) {   // rectangle orienté (mètres) autour d'un point, de base à h
  const r = ang * Math.PI / 180;
  out.push({ x: x + Math.sin(r) * along / M_LON, y: y + Math.cos(r) * along / M_LAT, a: ang, l: len, w: wid, b: base, h, c: col });
}
function boxFeature(q) {
  const r = q.a * Math.PI / 180, fx = Math.sin(r), fy = Math.cos(r), sx = fy, sy = -fx, l = q.l / 2, w = q.w / 2;
  const P = (a, b) => [q.x + (fx * a + sx * b) / M_LON, q.y + (fy * a + sy * b) / M_LAT];
  return { type: "Feature", properties: { c: q.c, b: q.b, h: q.h }, geometry: { type: "Polygon", coordinates: [[P(l, w), P(l, -w), P(-l, -w), P(-l, w), P(l, w)]] } };
}
function drawBoxes(list) { if (window.people3d?.boxes) people3d.boxes(list); else map.getSource("life3d")?.setData({ type: "FeatureCollection", features: list.map(boxFeature) }); }
function vehicle(out, a) {
  const { x, y, ang } = a, k = 1.5;   // un peu plus gros que nature pour qu'on les voie
  if (a.kind === "bus") {
    box(out, x, y, ang, 0, 12 * k, 2.6 * k, .3, 1.3, "#15803D");
    box(out, x, y, ang, 0, 11.6 * k, 2.5 * k, 1.3, 2.7, "#1E293B");
    box(out, x, y, ang, 0, 12 * k, 2.6 * k, 2.7, 3.1, "#E2E8F0");
    return;
  }
  box(out, x, y, ang, 0, 4.6 * k, 2 * k, .25, 1.05, a.col);                  // caisse
  box(out, x, y, ang, -.25 * k, 2.5 * k, 1.75 * k, 1.05, 1.6, "#1E293B");     // vitres
  box(out, x, y, ang, -.25 * k, 2.3 * k, 1.7 * k, 1.6, 1.72, a.col);          // toit
}

// ---- la Seine : péniches et bateaux-mouches (visibles même dézoomé) ----
const SEINE = [[[2.39231,48.82491],[2.39198,48.82508],[2.39133,48.82542],[2.3907,48.82578],[2.39008,48.82615],[2.38948,48.82654],[2.38889,48.82695],[2.38831,48.82737],[2.38773,48.8278],[2.38716,48.82824],[2.3866,48.82869],[2.38604,48.82915],[2.38548,48.82961],[2.38493,48.83008],[2.38436,48.83054],[2.38381,48.83098],[2.38326,48.83143],[2.38271,48.83186],[2.38218,48.83228],[2.38165,48.8327],[2.38112,48.83311],[2.38059,48.83353],[2.38007,48.83394],[2.37954,48.83435],[2.37902,48.83476],[2.3785,48.83517],[2.37799,48.83559],[2.37748,48.83601],[2.37697,48.83644],[2.37647,48.83687],[2.37599,48.83731],[2.37549,48.83774],[2.37502,48.83818],[2.37456,48.83863],[2.37409,48.83908],[2.3736,48.83952],[2.37311,48.83995],[2.37259,48.84038],[2.37205,48.84079],[2.37149,48.8412],[2.37094,48.84161],[2.37039,48.84201],[2.36984,48.84242],[2.36928,48.84282],[2.36873,48.84323],[2.36818,48.84364],[2.36762,48.84404],[2.36708,48.84443],[2.36656,48.84481],[2.36604,48.8452],[2.36554,48.8456],[2.36503,48.84599],[2.3645,48.8464],[2.36396,48.84682],[2.3634,48.84722],[2.36283,48.84762],[2.36228,48.84802],[2.36172,48.84844],[2.36109,48.84881],[2.36044,48.84915],[2.35981,48.84945],[2.35913,48.84973],[2.35841,48.84995],[2.35773,48.8502],[2.35702,48.85044],[2.35624,48.85069],[2.35546,48.85094],[2.35479,48.85117],[2.35413,48.85144],[2.35337,48.8516],[2.34102,48.85774],[2.34037,48.85821],[2.33939,48.85837],[2.33856,48.85849],[2.33775,48.85861],[2.33696,48.85876],[2.33615,48.8589],[2.33535,48.85904],[2.33457,48.85919],[2.33379,48.85936],[2.33301,48.85953],[2.33224,48.85971],[2.33155,48.85988],[2.33087,48.86007],[2.3302,48.86026],[2.32954,48.86048],[2.32888,48.8607],[2.32816,48.86095],[2.32742,48.86121],[2.32669,48.86146],[2.32595,48.8617],[2.3252,48.86194],[2.32444,48.86218],[2.32368,48.8624],[2.32292,48.86262],[2.32216,48.86284],[2.3214,48.86307],[2.3207,48.86327],[2.31999,48.8635],[2.31925,48.86369],[2.31849,48.86383],[2.31771,48.86392],[2.31687,48.86396],[2.31603,48.86395],[2.31521,48.86393],[2.31439,48.8639],[2.31358,48.86387],[2.31277,48.86385],[2.31196,48.86383],[2.31114,48.86382],[2.31032,48.86381],[2.3095,48.86381],[2.30868,48.8638],[2.30786,48.86379],[2.30704,48.86377],[2.30622,48.86376],[2.3054,48.86374],[2.30459,48.86373],[2.30376,48.86372],[2.30292,48.86371],[2.30205,48.86368],[2.30117,48.86364],[2.30028,48.86356],[2.2994,48.86345],[2.29856,48.86329],[2.29776,48.8631],[2.29698,48.86288],[2.29622,48.86264],[2.29549,48.86236],[2.29479,48.86205],[2.29413,48.86169],[2.29351,48.8613],[2.2929,48.86085],[2.2923,48.86041],[2.29172,48.85997],[2.29114,48.85954],[2.29057,48.8591],[2.29003,48.85868],[2.28952,48.85824],[2.28904,48.85779],[2.28861,48.85733],[2.28808,48.85689],[2.28776,48.85633],[2.28634,48.85432],[2.28582,48.85396],[2.28526,48.85356],[2.28469,48.85316],[2.28413,48.85277],[2.28357,48.85237],[2.28301,48.85197],[2.28245,48.85158],[2.28189,48.85118],[2.28136,48.85079],[2.27938,48.8498],[2.27871,48.84947],[2.27803,48.84912],[2.27747,48.84869],[2.27694,48.84828],[2.27642,48.84785],[2.27592,48.8474],[2.27541,48.84696],[2.27492,48.84651],[2.27444,48.84606],[2.27397,48.8456],[2.2735,48.84514],[2.27306,48.84468],[2.27262,48.84422],[2.27218,48.84376],[2.27174,48.8433],[2.27131,48.84284],[2.27088,48.84237],[2.27045,48.84191],[2.27003,48.84144],[2.2696,48.84098],[2.26927,48.84062],[2.26891,48.84023],[2.26852,48.83982],[2.26809,48.83938],[2.26763,48.83891],[2.26703,48.8383],[2.26643,48.83771],[2.26583,48.83714],[2.26521,48.83662],[2.26456,48.83615],[2.26425,48.83592],[2.26391,48.83571]],[[2.39227,48.82443],[2.39194,48.8246],[2.39161,48.82477],[2.39095,48.82511],[2.3903,48.82548],[2.38967,48.82586],[2.38905,48.82626],[2.38845,48.82667],[2.38786,48.82711],[2.38728,48.82754],[2.3867,48.82799],[2.38613,48.82844],[2.38557,48.8289],[2.38501,48.82936],[2.38446,48.82983],[2.3839,48.83028],[2.38334,48.83073],[2.3828,48.83118],[2.38226,48.8316],[2.38172,48.83203],[2.38119,48.83244],[2.38066,48.83286],[2.38013,48.83327],[2.37961,48.83368],[2.37908,48.83409],[2.37856,48.83451],[2.37804,48.83492],[2.37752,48.83534],[2.37701,48.83576],[2.37649,48.83619],[2.37599,48.83663],[2.37551,48.83707],[2.37501,48.8375],[2.37453,48.83796],[2.37407,48.83841],[2.37361,48.83885],[2.37312,48.83928],[2.37264,48.83971],[2.37213,48.84012],[2.3716,48.84053],[2.37105,48.84093],[2.37049,48.84134],[2.36994,48.84175],[2.36939,48.84215],[2.36884,48.84256],[2.36829,48.84296],[2.36773,48.84337],[2.36718,48.84377],[2.36664,48.84416],[2.36611,48.84455],[2.36559,48.84494],[2.36508,48.84534],[2.36457,48.84573],[2.36404,48.84614],[2.36351,48.84655],[2.36296,48.84695],[2.36239,48.84735],[2.36183,48.84775],[2.3613,48.84815],[2.3607,48.8485],[2.36007,48.84884],[2.35948,48.84912],[2.35885,48.84938],[2.35814,48.8496],[2.35745,48.84985],[2.35675,48.85008],[2.35598,48.85033],[2.3552,48.85059],[2.3545,48.85082],[2.35387,48.85108],[2.35319,48.85122],[2.35098,48.85167],[2.34455,48.85392],[2.3438,48.85424],[2.34311,48.85459],[2.34249,48.85497],[2.34008,48.85786],[2.33925,48.85798],[2.33844,48.85811],[2.3376,48.85822],[2.3368,48.85837],[2.336,48.85852],[2.33519,48.85866],[2.3344,48.85881],[2.3336,48.85898],[2.33282,48.85915],[2.33203,48.85934],[2.33133,48.85951],[2.33063,48.8597],[2.32994,48.8599],[2.32927,48.86012],[2.32861,48.86035],[2.32788,48.8606],[2.32715,48.86085],[2.32642,48.8611],[2.32568,48.86134],[2.32494,48.86158],[2.32419,48.86181],[2.32344,48.86204],[2.32268,48.86226],[2.32191,48.86248],[2.32115,48.8627],[2.32045,48.86291],[2.31975,48.86313],[2.31906,48.86331],[2.31835,48.86344],[2.31764,48.86353],[2.31685,48.86357],[2.31605,48.86356],[2.31524,48.86353],[2.31443,48.8635],[2.31361,48.86347],[2.31279,48.86345],[2.31198,48.86344],[2.31115,48.86342],[2.31033,48.86342],[2.30951,48.86341],[2.30869,48.8634],[2.30788,48.86339],[2.30706,48.86337],[2.30624,48.86336],[2.30542,48.86334],[2.3046,48.86333],[2.30378,48.86332],[2.30294,48.86331],[2.30208,48.86329],[2.30123,48.86324],[2.30038,48.86317],[2.29954,48.86306],[2.29875,48.86291],[2.29798,48.86272],[2.29722,48.86252],[2.2965,48.86229],[2.29581,48.86202],[2.29515,48.86173],[2.29453,48.86139],[2.29394,48.86102],[2.29335,48.86059],[2.29275,48.86015],[2.29217,48.8597],[2.29159,48.85928],[2.29102,48.85884],[2.29049,48.85843],[2.29001,48.85801],[2.28955,48.85757],[2.2891,48.8571],[2.2886,48.85669],[2.28831,48.85617],[2.2872,48.85465],[2.28685,48.85411],[2.28625,48.85368],[2.28569,48.85329],[2.28513,48.85289],[2.28457,48.85249],[2.28401,48.8521],[2.28345,48.8517],[2.28289,48.85131],[2.28234,48.85091],[2.28176,48.8505],[2.28107,48.85016],[2.28041,48.84982],[2.27974,48.84949],[2.27908,48.84915],[2.27844,48.84883],[2.27793,48.84843],[2.2774,48.84802],[2.2769,48.8476],[2.2764,48.84716],[2.2759,48.84672],[2.27541,48.84628],[2.27493,48.84583],[2.27446,48.84538],[2.27401,48.84493],[2.27357,48.84447],[2.27313,48.84401],[2.27269,48.84355],[2.27225,48.84309],[2.27182,48.84263],[2.27139,48.84216],[2.27097,48.8417],[2.27054,48.84123],[2.27011,48.84077],[2.26979,48.84041],[2.26942,48.84002],[2.26903,48.8396],[2.26859,48.83916],[2.26813,48.83869],[2.26753,48.83808],[2.26693,48.83748],[2.26631,48.8369],[2.26567,48.83637],[2.26501,48.83588],[2.26467,48.83564],[2.26433,48.83542]]].map(p => { const cum = [0]; for (let j = 1; j < p.length; j++) cum.push(cum[j - 1] + Math.hypot((p[j][0] - p[j - 1][0]) * M_LON, (p[j][1] - p[j - 1][1]) * M_LAT)); return { p, cum, len: cum[cum.length - 1] }; });
const BOATS = [];
function boatsInit() {
  const kinds = ["mouche", "peniche", "mouche", "peniche", "peniche", "vedette", "mouche", "peniche", "vedette", "peniche", "mouche", "peniche"];
  kinds.forEach((kind, i) => { const lane = i % 2, l = SEINE[lane]; BOATS.push({ kind, lane, l, d: rnd(0, l.len), dir: lane ? -1 : 1, v: kind === "vedette" ? rnd(6, 8) : kind === "mouche" ? rnd(3.5, 4.5) : rnd(2.4, 3.2), pause: 0, col: pick(["#7C2D12", "#1E3A8A", "#14532D", "#3F3F46", "#7F1D1D"]) }); });
}
function boatStep(dt, out, wakes) {
  for (const b of BOATS) {
    if (b.pause > 0) b.pause -= dt; else b.d += b.v * b.dir * dt;
    if (b.d < 0 || b.d > b.l.len) { b.dir *= -1; b.lane = 1 - b.lane; b.l = SEINE[b.lane]; b.d = b.dir > 0 ? 0 : b.l.len; b.pause = rnd(20, 60); }   // demi-tour au bout de Paris, après une escale
    const q = lifeAt(b.l, Math.max(0, Math.min(b.l.len, b.d)), 0), ang = b.dir < 0 ? q.ang + 180 : q.ang, x = q.x, y = q.y;
    const k = Math.max(1.6, 1.6 * 2 ** ((14.5 - map.getZoom()) * .7));
    if (b.kind === "peniche") {
      box(out, x, y, ang, 0, 40 * k, 6 * k, 0, 1.8, "#27272A");
      box(out, x, y, ang, 2 * k, 26 * k, 5 * k, 1.8, 2.4, b.col);                 // bâches de la cale
      box(out, x, y, ang, -16 * k, 6 * k, 5 * k, 1.8, 4.6, "#F8FAFC");            // cabine à l'arrière
    } else if (b.kind === "mouche") {
      box(out, x, y, ang, 0, 42 * k, 8 * k, 0, 1.5, "#F8FAFC");
      box(out, x, y, ang, -1 * k, 36 * k, 7 * k, 1.5, 3.6, "#93C5FD");           // pont vitré
      box(out, x, y, ang, -1 * k, 34 * k, 6.6 * k, 3.6, 3.9, "#FFFFFF");
    } else {
      box(out, x, y, ang, 0, 14 * k, 4 * k, 0, 1.2, "#F8FAFC");
      box(out, x, y, ang, -1.5 * k, 5 * k, 3 * k, 1.2, 2.6, "#1E3A8A");
    }
    if (b.pause <= 0) {   // sillage : un V blanc qui s'élargit derrière le bateau
      const L = (b.kind === "vedette" ? 14 : 40) * k / 2, wk = k / 1.6, r = ang * Math.PI / 180, fx = Math.sin(r), fy = Math.cos(r), sx = fy, sy = -fx;
      const P = (a, w) => [x + (fx * a + sx * w) / M_LON, y + (fy * a + sy * w) / M_LAT], back = (b.kind === "vedette" ? 60 : 95) * wk;
      wakes.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[P(-L + 2, 3 * wk), P(-L - back, 22 * wk), P(-L - back * .7, 0), P(-L - back, -22 * wk), P(-L + 2, -3 * wk), P(-L + 2, 3 * wk)]] } });
    }
  }
}

// ---- dézoomé : le trafic des grands axes, en petits points ----
const FLOW = { lines: null, dots: [] };
function flowLines() {
  if (FLOW.lines) return FLOW.lines;
  FLOW.lines = (BASE?.major || []).map(([k, f]) => { const p = decodeRing(f), cum = [0]; for (let j = 1; j < p.length; j++) cum.push(cum[j - 1] + Math.hypot((p[j][0] - p[j - 1][0]) * M_LON, (p[j][1] - p[j - 1][1]) * M_LAT)); return { k, p, cum, len: cum[cum.length - 1] }; }).filter(l => l.len > 120 && !pedZone(l.p));   // pas de trafic sur les zones piétonnes
  return FLOW.lines;
}
function flowStep(dt, feats) {
  const b = map.getBounds().toArray(), pad = .002, inV = (x, y) => x > b[0][0] - pad && x < b[1][0] + pad && y > b[0][1] - pad && y < b[1][1] + pad;
  const z = map.getZoom(), area = innerWidth * innerHeight / (390 * 700), want = Math.round(Math.min(1.8, area) * (z < 13.5 ? 170 : 130));
  FLOW.dots = FLOW.dots.filter(d => { d.d += d.v * d.dir * dt; if (d.d < 0 || d.d > d.l.len) return false; const q = lifeAt(d.l, d.d, 2.5 * d.dir); d.x = q.x; d.y = q.y; return inV(d.x, d.y); });
  if (FLOW.dots.length < want) {
    if (!FLOW.vis || performance.now() - FLOW.visAt > 3000) { FLOW.vis = flowLines().filter(l => l.p.some(([x, y]) => inV(x, y))); FLOW.visAt = performance.now(); }
    for (let n = 0; n < 12 && FLOW.dots.length < want && FLOW.vis.length; n++) { const l = pick(FLOW.vis); FLOW.dots.push({ l, d: rnd(0, l.len), dir: pick([-1, 1]), v: rnd(9, 15), c: pick(typeof DECOR !== "undefined" && DECOR.flow || ["#334155", "#334155", "#475569", "#64748B", "#EF4444", "#2563EB", "#FACC15"]) }); }
  }
  for (const d of FLOW.dots) if (d.x != null) feats.push({ type: "Feature", properties: { c: d.c }, geometry: { type: "Point", coordinates: [d.x, d.y] } });
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
  const B = document.body.classList; if (B.contains("landopen") || B.contains("picking") || B.contains("insalon") || document.querySelector("#coach:not([hidden]), #maphint")) return;
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
function lifeBase() {
  return LIFE.ok && lifeEnabled() && !document.hidden && typeof tab !== "undefined" && tab === "map" && !document.body.classList.contains("mymode");
}
const EMPTY = () => ({ type: "FeatureCollection", features: [] });
function lifeLoop(t) {
  requestAnimationFrame(lifeLoop);
  if (!LIFE.ok) return;
  const base = lifeBase(), z = base ? map.getZoom() : 0;
  const street = base && z >= LIFE_Z - .3, flow = base && z >= 12.4 && z < 15.4, boats = base && z >= 12.2;
  if (!street && LIFE.on) { LIFE.on = false; LIFE.agents = []; LIFE.cars3d = []; map.getSource("life")?.setData(EMPTY()); LIFE.bubble?.end(); }
  if (!flow && FLOW.dots.length) { FLOW.dots = []; map.getSource("flow")?.setData(EMPTY()); }
  if (!base || !(street || flow || boats)) { if (LIFE.any) { LIFE.any = false; drawBoxes([]); map.getSource("wakes")?.setData(EMPTY()); } return; }
  if (street && !LIFE.on) { LIFE.on = true; LIFE.nextTalk = t + 25000; }
  if (t - LIFE.last < 55) return;   // ~18 images par seconde suffisent
  const dt = Math.min(.2, (t - LIFE.last) / 1000 || .05); LIFE.last = t; LIFE.any = true; LIFE.tick++;
  // les passants, le trafic en points et les sillages bougent lentement : la carte ne les relit qu'une image sur deux (ou trois)
  if (street) lifeStep(dt, LIFE.tick % 2 === 0); else LIFE.cars3d = [];
  const box3d = (LIFE.cars3d || []).slice(), wakes = [];
  if (!BOATS.length) boatsInit();
  boatStep(dt, boats ? box3d : [], wakes);
  drawBoxes(box3d);
  if (LIFE.tick % 3 === 0) map.getSource("wakes")?.setData({ type: "FeatureCollection", features: boats ? wakes : [] });
  if (flow) { const f = []; flowStep(dt, f); if (LIFE.tick % 2 === 0) map.getSource("flow")?.setData({ type: "FeatureCollection", features: f }); }
  if (street && t > LIFE.nextTalk) { LIFE.nextTalk = t + rnd(40000, 70000); lifeTalk(); }
}
function lifeInit() {
  if (LIFE.ok || typeof map === "undefined" || !map || !map.getLayer?.("anchor-b") || !map.isStyleLoaded?.()) return false;
  lifeImages();
  const src = id => map.addSource(id, { type: "geojson", data: EMPTY(), buffer: 0, tolerance: 0, maxzoom: 18 });
  ["life", "life3d", "wakes", "flow"].forEach(src);
  map.addLayer({ id: "wakes", type: "fill", source: "wakes", minzoom: 12.2, paint: { "fill-color": "#FFFFFF", "fill-opacity": .5 } }, "anchor-b");
  map.addLayer({ id: "flow", type: "circle", source: "flow", minzoom: 12.4, maxzoom: 15.4, paint: { "circle-color": ["get", "c"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 12.4, 1.7, 15, 3], "circle-stroke-color": "#FFFFFF", "circle-stroke-width": .8, "circle-opacity": ["interpolate", ["linear"], ["zoom"], 12.4, 0, 12.8, .95, 14.8, .95, 15.4, 0], "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 12.4, 0, 12.8, .9, 14.8, .9, 15.4, 0], "circle-pitch-alignment": "map" } }, "anchor-b");
  map.addLayer({ id: "life", type: "symbol", source: "life", minzoom: LIFE_Z - .3, layout: {
    "icon-image": ["get", "i"], "icon-rotate": ["get", "r"], "icon-rotation-alignment": "map", "icon-pitch-alignment": "map",
    "icon-allow-overlap": true, "icon-ignore-placement": true,
    "icon-size": ["interpolate", ["linear"], ["zoom"], 15, ["*", .55, ["get", "s"]], 16, ["*", .95, ["get", "s"]], 17, ["*", 1.5, ["get", "s"]], 18, ["*", 2.3, ["get", "s"]]] },
    paint: { "icon-opacity": ["interpolate", ["linear"], ["zoom"], LIFE_Z - .3, 0, LIFE_Z + .2, 1] } }, "anchor-b");
  map.addLayer({ id: "life3d", type: "fill-extrusion", source: "life3d", minzoom: 12.2, paint: { "fill-extrusion-color": ["get", "c"], "fill-extrusion-base": ["get", "b"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true } }, "anchor-top");
  map.on("moveend", throttle(() => { LIFE.linesKey = ""; FLOW.vis = null; }, 1000));
  LIFE.ok = true; requestAnimationFrame(lifeLoop); return true;
}
(function waitMap() { try { if (lifeInit()) return; } catch (e) { console.warn("life", e); return; } setTimeout(waitMap, 1000); })();
