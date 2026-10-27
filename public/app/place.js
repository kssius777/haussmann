"use strict";
// =====================================================================
//  Paris : le jeu (20/10/2026 : tout Paris ; du 21 au 26/10/2026 : le dé ; 26/10/2026, choix du propriétaire : « en cliquant, on
//  va se déplacer là où on veut, pile poil », la montgolfière vole où l'on veut).
//  · Toucher la carte : sa montgolfière y vole tout droit, au-dessus des toits ; toucher un immeuble : sa case avec « Y aller ».
//    Le vol use des km (le bouton du milieu : ce qu'il en reste ; 5 au plus, +500 m toutes les 30 min, 20 000 € par km volé),
//    le péage des immeubles roses survolés (le loyer écrit sur leur carte, une fois par jour chacun) ; posé sur un immeuble, sa
//    case s'ouvre : libre, on l'achète ; un « ? » du jour : une carte Chance.
//  · Le métro depuis une station où l'on s'est posé ; les gens autour (par carrés d'environ 500 m), sans un mot : on parle au
//    salon (salon.js), « Salon » à côté du bouton du milieu (on peut couper le chat dans le profil).
//  Serveur : migration_monde_paris.sql, migration_vol.sql. Les montgolfières en 3D : models.js (people3d).
// =====================================================================

// ---- la montgolfière (25/10/2026, choix du propriétaire ; avant : un personnage) ----------------
// « Ma montgolfière » garde les champs de look de l'ancien personnage (set_look les veut tous) : t = sa couleur (-1 : celle de
// son parti ; les 7 couleurs de l'ancien haut, dans le même ordre : chacun garde la sienne), a = son motif (0 fuseaux, 1 unie,
// 2 ceinture, 3 damier) ; g, s, h, c, b ne servent plus.
const BAL = {
  col: ["#0F172A", "#FFFFFF", "#DC2626", "#F59E0B", "#16A34A", "#2563EB", "#9333EA"],
  colN: ["Noire", "Blanche", "Rouge", "Jaune", "Verte", "Bleue", "Violette"],
  two: ["#F59E0B", "#2563EB", "#FFFFFF", "#DC2626", "#FFFFFF", "#FFFFFF", "#FDE68A"],   // la 2e couleur de chacune
  motN: ["Fuseaux", "Unie", "Ceinture", "Damier"]
};
// pas encore choisie : la couleur de son parti et un motif au hasard, toujours le même pour chacun
function lookOf(id, look) {
  if (look && look.s != null) return Object.assign({ g: 0, b: 0, a: 0 }, look);
  let h = 7; for (const ch of String(id || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { g: (h >>> 13) % 2, s: h % 6, h: (h >>> 5) % 6, c: (h >>> 9) % 3, t: -1, b: 0, a: (h >>> 3) % 4 };
}
// ses couleurs et son motif : pour la 3D (models.js) et l'aperçu (balloonSVG)
function balloonSpec(L, party) {
  const t = L.t >= 0 && L.t < BAL.col.length ? L.t : -1;
  return { c: t >= 0 ? BAL.col[t] : (PARTIES[party]?.c || "#64748B"), d: t >= 0 ? BAL.two[t] : "#FFFFFF", p: ((L.a | 0) % 4 + 4) % 4 };
}
// l'aperçu de face : l'enveloppe et ses fuseaux (des méridiens), la nacelle
let balN = 0;
function balloonSVG(s, h) {
  const id = "bl" + (++balN), M = th => 17 * Math.sin(th * Math.PI / 180);
  const env = "M20 2C30.4 2 37 9.7 37 19c0 7.9-5.6 12.8-9.7 16.9-.9.9-1.9 2.1-3.3 2.1h-8c-1.4 0-2.4-1.2-3.3-2.1C8.6 31.8 3 26.9 3 19 3 9.7 9.6 2 20 2z";
  const gore = (a, b) => { const xa = M(a), xb = M(b); return `M20 1A${Math.abs(xa).toFixed(2)} 18 0 0 ${xa >= 0 ? 1 : 0} 20 37A${Math.abs(xb).toFixed(2)} 18 0 0 ${xb >= 0 ? 0 : 1} 20 1z`; };
  const odd = [1, 3, 5, 7].map(i => gore(-90 + 22.5 * i, -67.5 + 22.5 * i)).join(""), even = [0, 2, 4, 6].map(i => gore(-90 + 22.5 * i, -67.5 + 22.5 * i)).join("");
  const pat = s.p === 0 ? `<path d="${odd}" fill="${s.d}"/>`
    : s.p === 2 ? `<rect y="17.4" width="40" height="7" fill="${s.d}"/><rect y="34.7" width="40" height="5" fill="${s.d}"/>`
    : s.p === 3 ? `<path d="${odd}" fill="${s.d}" clip-path="url(#${id}t)"/><path d="${even}" fill="${s.d}" clip-path="url(#${id}m)"/>` : "";
  return `<svg class="blsvg" width="${Math.round(h * 40 / 52)}" height="${h}" viewBox="0 0 40 52" aria-hidden="true"><defs><clipPath id="${id}"><path d="${env}"/></clipPath>
<clipPath id="${id}t"><rect width="40" height="13"/><rect y="25" width="40" height="14"/></clipPath><clipPath id="${id}m"><rect y="13" width="40" height="12"/></clipPath></defs>
<path d="M16.6 37.4 17.4 43M23.4 37.4 22.6 43" stroke="#4B3621" stroke-width=".9"/>
<g clip-path="url(#${id})"><path d="${env}" fill="${s.c}"/>${pat}<ellipse cx="14" cy="11" rx="5" ry="6.5" fill="#fff" opacity=".18"/></g>
<path d="${env}" fill="none" stroke="rgba(15,23,42,.32)" stroke-width=".8"/>
<rect x="16" y="43" width="8" height="6.5" rx="1.2" fill="#A0703F" stroke="#5B3A1F" stroke-width=".8"/></svg>`;
}
// l'éditeur (le profil, toucher son nom) : la couleur, le motif
function lookEditorHTML(L, party) {
  L = lookOf(ME, L); const S = balloonSpec(L, party), cur = k => k === "a" ? S.p : k === "t" ? (L.t >= 0 && L.t < BAL.col.length ? L.t : -1) : L[k];
  const row = (lbl, k, items, cls) => `<div class="lkrow"><span>${lbl}</span><div>${items.map(([v, inner, title]) => `<button class="lksw${cls ? " " + cls : ""}${cur(k) === v ? " on" : ""}" data-look="${k}:${v}" aria-label="${esc(title)}" title="${esc(title)}">${inner}</button>`).join("")}</div></div>`;
  const dot = c => `<i style="background:${c}"></i>`;
  return `<div class="lked"><div class="lkprev">${balloonSVG(S, 104)}</div><div class="lkrows">
    ${row("Couleur", "t", [[-1, dot(PARTIES[party]?.c || "#64748B"), "Couleur de mon parti"], ...BAL.col.map((c, i) => [i, dot(c), BAL.colN[i]])])}
    ${row("Motif", "a", BAL.motN.map((n, i) => [i, balloonSVG(Object.assign({}, S, { p: i }), 30), n]), "mot")}
  </div></div>`;
}
// un toucher sur une pastille : on change tout de suite, on enregistre juste après
let lookSaveT = 0;
function lookPick(btn, root) {
  const p = ST.state?.profile; if (!p) return;
  const [k, v] = btn.dataset.look.split(":"); const L = Object.assign({}, lookOf(ME, p.look), { [k]: +v });
  p.look = L; ST.lookLocal = { L, at: Date.now() }; root.innerHTML = lookEditorHTML(L, p.party);
  const me = meP(); if (me) { me.look = L; window.people3d?.look(me.id, spec3d(me)); drawLabel(me); renderDock(); }
  if (typeof salonLook === "function") salonLook(L);
  const pv = $("#p-detail .lkwrap"); if (pv && pv !== root) pv.innerHTML = lookEditorHTML(L, p.party);
  clearTimeout(lookSaveT); lookSaveT = setTimeout(() => rpc("set_look", { p_look: L }).catch(e => toast(e.message, "bad")), 500);
}
document.addEventListener("click", e => { const b = e.target.closest("[data-look]"); if (b) { const root = b.closest(".lkwrap"); if (root) lookPick(b, root); } });

// la montgolfière en 3D de quelqu'un (models.js)
const spec3d = p => balloonSpec(lookOf(p.id, p.look), p.party);

// ---- les distances ------------------------------------------------------------
const KXP = 111320 * Math.cos(48.856 * Math.PI / 180), KYP = 110574;   // mètres par degré
const mLL = (a, b) => Math.hypot((b[0] - a[0]) * KXP, (b[1] - a[1]) * KYP);
const pathLen = pts => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + mLL(pts[i - 1], pts[i])); return c; };
function inPolyLL(poly, x, y) {
  let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
// les parcs et jardins (base.json) : on y marche tout droit, sur les pelouses et les allées
let PARKS_P = null;
function parkAt(lon, lat) {
  if (!PARKS_P) PARKS_P = (BASE?.parks || []).map(rs => {
    const r = decodeRing(rs[0]); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, a = 0;
    r.forEach(([x, y], i) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); const q = r[(i + 1) % r.length]; a += (x * q[1] - q[0] * y); });
    return { r, b: [x0, y0, x1, y1], a: Math.abs(a / 2) * KXP * KYP };
  }).filter(p => p.a > 6000);
  for (let i = 0; i < PARKS_P.length; i++) { const p = PARKS_P[i]; if (lon >= p.b[0] && lon <= p.b[2] && lat >= p.b[1] && lat <= p.b[3] && inPolyLL(p.r, lon, lat)) return i; }
  return -1;
}

// ---- le plan pour marcher (tout Paris) --------------------------------------------
// tableaux compacts (peu de mémoire sur téléphone) : voisins de chaque point, grille de 60 m pour trouver la rue la plus proche
const WD = { g: null, p: null };
function loadWorld() {
  if (WD.g) return Promise.resolve(WD.g);
  return WD.p || (WD.p = (async () => {
    const d = await getJSON(DATA + "walk.json?v=" + DATA_V);
    const pts = decodeRing(d.n), N = pts.length, X = new Float64Array(N), Y = new Float64Array(N);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < N; i++) { const x = X[i] = pts[i][0] * KXP, y = Y[i] = pts[i][1] * KYP; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const EA = Int32Array.from(d.e), E = EA.length >> 1;
    const off = new Int32Array(N + 1); for (let k = 0; k < EA.length; k++) off[EA[k] + 1]++;
    for (let i = 0; i < N; i++) off[i + 1] += off[i];
    const nb = new Int32Array(2 * E), wt = new Float32Array(2 * E), fill = off.slice(0, N);
    for (let e = 0; e < E; e++) { const a = EA[2 * e], b = EA[2 * e + 1], w = Math.hypot(X[a] - X[b], Y[a] - Y[b]); nb[fill[a]] = b; wt[fill[a]++] = w; nb[fill[b]] = a; wt[fill[b]++] = w; }
    const C = 60, GW = Math.floor((x1 - x0) / C) + 1, GH = Math.floor((y1 - y0) / C) + 1, gc = new Int32Array(GW * GH + 1);
    const cells = (e, f) => { const a = EA[2 * e], b = EA[2 * e + 1];
      const i0 = Math.floor((Math.min(X[a], X[b]) - x0) / C), i1 = Math.floor((Math.max(X[a], X[b]) - x0) / C), j0 = Math.floor((Math.min(Y[a], Y[b]) - y0) / C), j1 = Math.floor((Math.max(Y[a], Y[b]) - y0) / C);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) f(j * GW + i); };
    for (let e = 0; e < E; e++) cells(e, c => gc[c + 1]++);
    for (let c = 0; c < GW * GH; c++) gc[c + 1] += gc[c];
    const gs = new Int32Array(gc[GW * GH]), gf = gc.slice(0, GW * GH);
    for (let e = 0; e < E; e++) cells(e, c => { gs[gf[c]++] = e; });
    // le métro : chaque station, ses lignes, ses voisines (branche par branche)
    const st = new Map();
    for (const [line, branches] of Object.entries(d.metro || {})) for (const seq of branches) seq.forEach((g, i) => {
      let o = st.get(g); if (!o) st.set(g, o = { lines: new Set(), nb: [] });
      o.lines.add(line); if (i > 0) o.nb.push(seq[i - 1]); if (i < seq.length - 1) o.nb.push(seq[i + 1]);
    });
    return (WD.g = { N, X, Y, EA, off, nb, wt, C, x0, y0, GW, GH, gc, gs, zone: d.zone, metro: d.metro || {}, st });
  })().catch(e => { WD.p = null; throw e; }));
}
// le point de rue le plus proche (projeté sur le tronçon), à moins de maxM mètres
function snapW(G, lon, lat, maxM = 320) {
  const x = lon * KXP, y = lat * KYP, ci = Math.floor((x - G.x0) / G.C), cj = Math.floor((y - G.y0) / G.C), R = Math.ceil(maxM / G.C) + 1; let best = null;
  for (let r = 0; r <= R; r++) {
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= G.GW || j >= G.GH) continue;
      const c = j * G.GW + i;
      for (let k = G.gc[c]; k < G.gc[c + 1]; k++) {
        const e = G.gs[k], a = G.EA[2 * e], b = G.EA[2 * e + 1], dx = G.X[b] - G.X[a], dy = G.Y[b] - G.Y[a], L2 = dx * dx + dy * dy;
        const t = L2 ? Math.max(0, Math.min(1, ((x - G.X[a]) * dx + (y - G.Y[a]) * dy) / L2)) : 0, qx = G.X[a] + t * dx, qy = G.Y[a] + t * dy, d = Math.hypot(x - qx, y - qy);
        if (!best || d < best.d) best = { a, b, x: qx, y: qy, d };
      }
    }
    if (best && best.d <= r * G.C) break;
  }
  return best && best.d <= maxM ? best : null;
}
// le plus court chemin dans les rues (A*, la ligne droite comme estimation)
function routeW(G, s, t) {
  const N = G.N; if (!G.dist) { G.dist = new Float64Array(N); G.prev = new Int32Array(N); G.mark = new Uint32Array(N); G.run = 0; }
  const run = ++G.run, dist = G.dist, prev = G.prev, mark = G.mark, X = G.X, Y = G.Y;
  const D = n => mark[n] === run ? dist[n] : Infinity, set = (n, d, p) => { mark[n] = run; dist[n] = d; prev[n] = p; };
  const h = n => Math.hypot(X[n] - t.x, Y[n] - t.y), hf = [], hn = [];
  const push = (f, n) => { let i = hf.length; hf.push(f); hn.push(n); while (i > 0) { const q = (i - 1) >> 1; if (hf[q] <= f) break; hf[i] = hf[q]; hn[i] = hn[q]; i = q; } hf[i] = f; hn[i] = n; };
  const pop = () => { const n = hn[0], lf = hf.pop(), ln = hn.pop(), L = hf.length; if (L) { let i = 0; for (;;) { let m = 2 * i + 1; if (m >= L) break; if (m + 1 < L && hf[m + 1] < hf[m]) m++; if (hf[m] >= lf) break; hf[i] = hf[m]; hn[i] = hn[m]; i = m; } hf[i] = lf; hn[i] = ln; } return n; };
  for (const n of [s.a, s.b]) { const d = Math.hypot(X[n] - s.x, Y[n] - s.y); if (d < D(n)) { set(n, d, -2); push(d + h(n), n); } }
  const goal = new Map([[t.a, Math.hypot(X[t.a] - t.x, Y[t.a] - t.y)], [t.b, Math.hypot(X[t.b] - t.x, Y[t.b] - t.y)]]);
  let best = Infinity, bestN = -1, it = 0;
  while (hf.length && it++ < 500000) {
    const f = hf[0], n = pop(), g = D(n);
    if (f >= best) break;
    if (f > g + h(n) + 1e-9) continue;   // une entrée périmée
    if (goal.has(n) && g + goal.get(n) < best) { best = g + goal.get(n); bestN = n; }
    for (let k = G.off[n]; k < G.off[n + 1]; k++) { const m = G.nb[k], nd = g + G.wt[k]; if (nd < D(m)) { set(m, nd, n); push(nd + h(m), m); } }
  }
  const P = (x, y) => [x / KXP, y / KYP];
  const same = (s.a === t.a && s.b === t.b) || (s.a === t.b && s.b === t.a), direct = same ? Math.hypot(s.x - t.x, s.y - t.y) : Infinity;
  if (direct <= best) return { len: direct, pts: [P(s.x, s.y), P(t.x, t.y)] };
  if (bestN < 0) return null;
  const nodes = []; for (let n = bestN; n >= 0; n = prev[n]) nodes.push(n);
  return { len: best, pts: [P(s.x, s.y), ...nodes.reverse().map(n => P(X[n], Y[n])), P(t.x, t.y)] };
}
// le trajet complet : de là où l'on est jusqu'au point touché (par les rues ; dans un même parc, tout droit)
function planW(G, from, to, toBuilding, exact) {   // exact : jusqu'au point lui-même (un « ? »)
  const pf = parkAt(...from), pt = parkAt(...to);
  if (pf >= 0 && pf === pt && parkAt((from[0] + to[0]) / 2, (from[1] + to[1]) / 2) === pf) return { len: mLL(from, to), pts: fitPath([from, to]) };
  const s = snapW(G, ...from, 600), t = snapW(G, ...to, toBuilding || exact ? 320 : 150);
  if (!s || !t) return null;
  const r = routeW(G, s, t); if (!r) return null;
  const pts = r.pts.slice(); let len = r.len;
  if (mLL(from, pts[0]) > 1.5) { len += mLL(from, pts[0]); pts.unshift(from); }
  if (!toBuilding && (t.d <= 35 || pt >= 0 || exact)) { len += mLL(pts[pts.length - 1], to); pts.push(to); }   // jusqu'au trottoir touché, ou dans le parc
  return { len, pts: fitPath(pts) };
}
function simplifyW(pts, tol) {   // Douglas-Peucker (mètres)
  if (pts.length < 3) return pts.map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]);
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [i, j] = st.pop(); let md = 0, mk = -1;
    const ax = pts[i][0] * KXP, ay = pts[i][1] * KYP, bx = pts[j][0] * KXP, by = pts[j][1] * KYP, dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    for (let k = i + 1; k < j; k++) { const d = Math.abs((pts[k][0] * KXP - ax) * dy - (pts[k][1] * KYP - ay) * dx) / L; if (d > md) { md = d; mk = k; } }
    if (md > tol) { keep[mk] = 1; st.push([i, mk], [mk, j]); }
  }
  return pts.filter((_, k) => keep[k]).map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]);
}
// le serveur prend 400 points au plus : un long trajet est un peu plus simplifié
function fitPath(pts) { for (const tol of [1.2, 3, 6, 12, 25, 50, 100]) { const q = simplifyW(pts, tol); if (q.length <= 380) return q; } return simplifyW(pts, 200); }

// ---- l'état -------------------------------------------------------------------
const W = { on: false, starting: false, tries: 0, me: null, admin: false, cfg: null, w: null, day: 0, taken: new Set(), chatOff: false, banned: false,
  people: new Map(), cells: new Set(), cellKey: "", chans: new Map(), chSt: new Map(), cg: new Map(), lay: 0, authed: false, feedEvery: 0, feedT: 0, listT: 0,
  last: 0, seen: new Set(), feeding: false, raf: 0, G: null, riding: false, q: [], first: true, stepT: 0,
  run: null, kmT: 0, tlT: 0 };   // run : le vol en cours
const meP = () => W.people.get(W.me);
const FLY_ALT = 1.1;   // de combien la montgolfière monte en volant (unités du dessin de models.js)
const kmTxt = km => { const k = Math.round(km * 10) / 10; return k.toLocaleString("fr-FR", { minimumFractionDigits: k % 1 ? 1 : 0, maximumFractionDigits: 1 }) + " km"; };
const distTxt = m => m < 950 ? Math.max(10, Math.round(m / 10) * 10) + " m" : kmTxt(m / 1000);
const kE = n => { const a = Math.abs(n); return a >= 9.95e5 ? (a / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " M€" : a >= 1e4 ? Math.round(a / 1e3) + " k€" : a >= 1e3 ? (a / 1e3).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " k€" : Math.round(a) + " €"; };
const CELL_X = 0.00685, CELL_Y = 0.0045;   // des carrés d'environ 500 m (21/10/2026 : on écoute moins loin, chaque message coûte à chaque réception)
const cellOf = (lo, la) => 10000 + Math.floor((lo - 2.20) / CELL_X) * 100 + Math.floor((la - 48.80) / CELL_Y);   // comme _wcell()

// ---- démarrer : on entre dans Paris dès que la carte est prête ------------------------
function initWorld() {
  loadWorld().catch(() => { });   // le plan des rues arrive pendant que la carte se charge
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return quietSoon();
    wake(); if (W.on) { worldFeed(); refreshPeople(); startTick(); }
  });
  addEventListener("resize", () => { if (W.on) layoutPeople(); });
  document.addEventListener("click", e => {
    const mt = e.target.closest("[data-wmetro]"); if (mt) return metroSheet(+mt.dataset.wmetro);
  });
  const vv = window.visualViewport;
  if (vv) { const f = () => document.body.style.setProperty("--kb", Math.max(0, innerHeight - vv.height - vv.offsetTop) + "px"); vv.addEventListener("resize", f); vv.addEventListener("scroll", f); }
  $("#b-main")?.addEventListener("click", mainBtn);   // sa montgolfière : y revenir, ou ses km
  $("#b-say")?.addEventListener("click", () => openSalon());   // « Salon » : le salon (salon.js)
  $("#pawnoff")?.addEventListener("click", () => centerOnMe(true));
  renderDock();
}
// la carte est chargée (map.js) : les personnages en 3D, leurs noms, puis on entre dans Paris
function worldMapReady() {
  if (window.THREE && window.addPeople) { try { addPeople(map); } catch (e) { console.warn("personnages 3D", e); } }
  const box = document.createElement("div"); box.id = "wpl"; map.getContainer().appendChild(box);
  box.addEventListener("click", e => { const b = e.target.closest(".wp"); if (!b) return; e.stopPropagation(); if (b.dataset.id === W.me) openLookSheet(); else openWho(b.dataset.id); });
  map.on("render", layoutPeople); map.on("move", throttle(offMe, 150));   // (la flèche : 7 fois par seconde suffisent, la caméra bouge à chaque image)
  // la caméra derrière le perso : faire glisser la carte la libère ; la tourner ou l'incliner garde ce cap jusqu'au prochain trajet
  map.on("dragstart", e => { if (e.originalEvent) camOff(true); });
  for (const ev of ["rotatestart", "pitchstart"]) map.on(ev, e => { if (e.originalEvent) CAM.userB = true; });
  map.on("moveend", throttle(() => { updateCells(); updateVisible(); }, 450));
  map.on("mousemove", aimMove); map.on("mouseout", () => { aimEv = null; if (AIM.hov) aimClear(); map.getCanvas().style.cursor = ""; });   // (viser à la souris)
  initSalon();
  worldStart();
}
async function worldStart() {
  if (W.on || W.starting || !map || !mapReady) return; W.starting = true;
  try {
    const [G, j] = await Promise.all([loadWorld(), rpc("world_join")]);
    W.G = G; W.on = true; W.tries = 0; applyJoin(j);
    renderQ(); updateVisible(); renderDock();
    queueCells(true); clearInterval(W.listT); W.listT = setInterval(refreshPeople, 60000);
    if (W.first) { W.first = false; centerOnMe(false); }
  } catch (e) {
    console.warn("monde", e); W.on = false;
    if (/does not exist|Could not find the function/i.test(e.message || "")) toast("Le jeu est en cours de mise à jour : réessayez dans quelques minutes.", "bad");
    setTimeout(worldStart, Math.min(30000, 2500 * ++W.tries));
  } finally { W.starting = false; }
}
function applyJoin(j) {
  W.me = j.me; W.admin = !!j.admin; W.cfg = j.cfg; W.w = j.w; W.day = j.day; W.taken = new Set(j.taken || []); W.chatOff = !!j.chatOff; W.last = Math.max(W.last, j.last || 0);
  const pr = ST.state?.profile || {}; if (ST.state?.profile) { pr.chat_off = W.chatOff; if ("land" in j) { pr.land = j.land; paintTargets(); } }
  let me = meP(); if (!me) me = addPerson({ id: W.me, pseudo: pr.pseudo, party: pr.party, look: pr.look, lon: j.pos[0], lat: j.pos[1] });
  me.vis = true;
  if (j.trip?.path?.length >= 2) followTrip(me, j.trip.path, j.trip.dur, j.trip.el);
  else { me.lon = +j.pos[0]; me.lat = +j.pos[1]; stopPerson(me); }
  window.people3d?.ring(0, 0, 0, false);   // (l'anneau « à portée pour acheter » de la marche : plus utile)
}
async function rejoin() {
  if (W.run || W.riding) return;
  try { applyJoin(await rpc("world_join")); W.cellKey = ""; queueCells(true); renderQ(); renderDock(); } catch (e) { }
}
// la caméra « derrière le perso » (21/10/2026, choix du propriétaire : « voir la map comme un monde open world ») : proche, basse,
// son personnage dans le bas de la zone libre (entre les barres du haut et le dock), on voit la rue devant lui
const camZoom = () => innerWidth < 700 ? 17.2 : 17.4;
const camPitch = z => z >= 16.8 ? 60 : z >= 15.5 ? 56 : z >= 14.5 ? 50 : 45;   // (plus incliné, on voit plus loin : plus lourd sur téléphone)
// le point visé de la carte (son personnage) placé à ~70 % de la zone libre entre les barres du haut et le dock : on décale le haut
// de la vue (« padding ») au lieu de décaler le centre, pour que la caméra puisse le suivre image par image
function camPad() {
  const c = map.getContainer().getBoundingClientRect(), mid = c.top + c.height / 2;
  const rs = s => [...document.querySelectorAll(s)].map(e => e.getBoundingClientRect()).filter(r => r.height > 0 && r.width > 0);
  const top = Math.max(c.top + 50, ...rs("#bar,#credbar,#filter,.maptop>*").filter(r => r.bottom < mid).map(r => r.bottom)) - c.top;
  const bot = Math.min(c.bottom - 50, ...rs("#dicebar,#tabs").filter(r => r.top > mid).map(r => r.top)) - c.top;
  return { top: Math.max(0, Math.round(2 * (top + (bot - top) * .7) - c.height)), bottom: 0, left: 0, right: 0 };
}
function worldView() { return { zoom: camZoom(), pitch: camPitch(camZoom()), padding: camPad() }; }
function centerOnMe(quick, keepZoom) {   // keepZoom : on revient sur lui sans changer le zoom (on avait dézoomé pour aller loin)
  const me = meP(); if (!me || !map) return; const v = worldView();
  CAM.on = true; CAM.userB = false;
  const z = keepZoom || (quick && map.getZoom() >= 15.2) ? map.getZoom() : v.zoom;
  map.flyTo({ center: [me.lon, me.lat], zoom: z, pitch: keepZoom ? map.getPitch() : camPitch(z), padding: v.padding, duration: quick ? 600 : 1200, essential: true });
}
// Elle suit sa montgolfière image par image quand elle vole et revient en douceur, pendant le vol, à la vue « derrière le perso »
// (proche, inclinée ; le cap ne change pas : le vol est rapide) ; un long vol prend de la hauteur au milieu (arc). Faire glisser la
// carte la libère (on regarde ailleurs) ; le bouton du milieu, la flèche « Vous » ou un vol la remettent sur elle.
const CAM = { on: true, userB: false };
function camOff(keep) {   // keep : la carte reste où elle est (on la fait glisser) ; sinon on va ailleurs : le décalage du haut s'en va
  CAM.on = false; if (!keep && map) map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
}
function camStep(me, now) {
  // quelqu'un d'autre bouge la carte (un zoom à la molette, en pinçant) : on le laisse finir
  if (!CAM.on || !map || cur() !== "map" || map.isMoving()) return;
  const r = W.run, v = { center: [me.lon, me.lat] };
  if (r && r.z0 != null) {
    const f = Math.min(1, (now - r.t0) / (r.dur * 1000)), e = f * f * (3 - 2 * f), L = (a, b) => a + (b - a) * e;
    v.zoom = L(r.z0, r.z1) - (r.arc || 0) * Math.sin(Math.PI * f); v.pitch = L(r.p0, r.p1); v.padding = { top: L(r.pad0.top || 0, r.pad1.top), bottom: L(r.pad0.bottom || 0, 0), left: L(r.pad0.left || 0, 0), right: L(r.pad0.right || 0, 0) };
  }
  map.jumpTo(v);
}

// ---- qui est autour : par carrés d'environ 1 km (temps réel, sinon relu toutes les 2,5 s) ------
let cellQ = 0;
function queueCells(now) { clearTimeout(cellQ); cellQ = setTimeout(updateCells, now ? 0 : 400); }
function updateCells() {
  if (!W.on || !map || W.away) return;   // (au salon : on garde les carrés de là où l'on était)
  const out = new Set(), me = meP(); if (me) out.add(cellOf(me.lon, me.lat));
  if (map.getZoom() >= 14.6 && mode === "all") {   // les carrés de ce qu'on regarde : à 350 m au plus du point visé (9 au plus)
    const c = map.getCenter(), R = 350, b = map.getBounds();
    const w = Math.max(b.getWest(), c.lng - R / KXP), e = Math.min(b.getEast(), c.lng + R / KXP), s = Math.max(b.getSouth(), c.lat - R / KYP), n = Math.min(b.getNorth(), c.lat + R / KYP);
    for (let x = Math.floor((w - 2.20) / CELL_X); x <= Math.floor((e - 2.20) / CELL_X); x++)
      for (let y = Math.floor((s - 48.80) / CELL_Y); y <= Math.floor((n - 48.80) / CELL_Y); y++) if (out.size < 9) out.add(10000 + x * 100 + y);
  }
  const key = [...out].sort().join(","); if (key === W.cellKey) return;
  W.cellKey = key; W.cells = out; listen(); refreshPeople();
}
// les groupes (21/10/2026, migration_groupes.sql) : dans un carré bondé, on n'écoute que son groupe, « w:carré.groupe »
// (groupe = sa couche % le nombre de groupes du carré, rendus par world_look et world_feed, ou annoncés par « regroup »)
const chanOf = c => { const g = W.cg.get(c) || 1; return g > 1 ? `w:${c}.${(W.lay || 0) % g}` : `w:${c}`; };
function setGroups(gm) {   // gm : { carré: nombre de groupes } pour les carrés bondés (les autres : 1)
  if (!gm) return; let ch = false;
  for (const c of W.cells) { const g = +(gm[c] || 1); if ((W.cg.get(c) || 1) !== g) { ch = true; if (g > 1) W.cg.set(c, g); else W.cg.delete(c); } }
  if (ch) { listen(); queuePeople(); }
}
async function listen() {
  if (!LOCAL_MODE && SB) {
    if (!W.authed) { W.authed = true; try { const { data } = await SB.auth.getSession(); if (data?.session) SB.realtime.setAuth(data.session.access_token); } catch (e) { } }
    const want = new Set([...W.cells].map(chanOf));
    for (const [n, ch] of [...W.chans]) if (!want.has(n)) { try { SB.removeChannel(ch)?.catch?.(() => { }); } catch (e) { } W.chans.delete(n); W.chSt.delete(n); }
    for (const n of want) if (!W.chans.has(n)) {
      const ch = SB.channel(n, { config: { private: true } }).on("broadcast", { event: "ev" }, ({ payload }) => worldEvent(payload));
      W.chans.set(n, ch); W.chSt.set(n, "");
      ch.subscribe(st => { if (W.chans.get(n) !== ch) return; W.chSt.set(n, st); rtCheck(); });
    }
  }
  rtCheck();
}
// un onglet resté 30 s en arrière-plan n'écoute plus personne (21/10/2026 : Supabase compte chaque message reçu, et chaque
// connexion ; un onglet oublié ouvert recevait tout ce qui se disait autour) ; en revenant, on réécoute et on relit qui est là
let quietT = 0;
function quietSoon() { clearTimeout(quietT); quietT = setTimeout(() => { if (document.hidden) quiet(); }, 30000); }
function quiet() {
  for (const ch of W.chans.values()) { try { SB.removeChannel(ch)?.catch?.(() => { }); } catch (e) { } }
  W.chans.clear(); W.chSt.clear(); W.cellKey = ""; W.authed = false; W.quiet = true;   // (plus aucun canal : supabase-js ferme la connexion)
  clearInterval(W.feedT); W.feedEvery = 20000; W.feedT = setInterval(worldFeed, 20000);
}
function wake() { clearTimeout(quietT); if (!W.quiet) return; W.quiet = false; if (W.on) queueCells(true); }
function rtCheck() {   // tous les carrés en temps réel : on relit lentement (filet de sécurité, et « toujours là ») ; sinon toutes les 2,5 s
  const ok = !LOCAL_MODE && !!SB && W.cells.size > 0 && [...W.cells].every(c => W.chSt.get(chanOf(c)) === "SUBSCRIBED"), every = ok ? 20000 : 2500;
  if (W.feedEvery !== every) { W.feedEvery = every; clearInterval(W.feedT); W.feedT = setInterval(worldFeed, every); }
  // qui est là : avec le temps réel, les arrivées et les départs arrivent tout seuls ; on ne relit la liste que toutes les 3 min
  // (filet de sécurité), sinon toutes les minutes (21/10/2026 : chaque relecture renvoie tout le monde autour, avec ses trajets)
  const look = ok ? 180000 : 60000;
  if (W.lookEvery !== look) { W.lookEvery = look; clearInterval(W.listT); W.listT = setInterval(refreshPeople, look); }
}
async function worldFeed() {
  if (!W.on || W.feeding || document.hidden || !W.cells.size) return; W.feeding = true;
  try { const f = await rpc("world_feed", { p_cells: [...W.cells], p_since: W.last }); if (f.gone) await rejoin(); else { setGroups(f.g); for (const e of f.ev) worldEvent(e); } }
  catch (e) { } finally { W.feeding = false; }
}
let peopleQ = 0;
function queuePeople() { clearTimeout(peopleQ); peopleQ = setTimeout(refreshPeople, 600); }
async function refreshPeople() {
  if (!W.on || !W.cells.size || document.hidden) return;
  try {
    let r = null;
    try { r = await rpc("world_look", { p_cells: [...W.cells] }); }
    catch (e) { if (!/world_look|Could not find|does not exist/i.test(e.message || "")) throw e; r = { people: await rpc("world_people", { p_cells: [...W.cells] }) }; }   // (serveur d'avant)
    if (r.lay != null && r.lay !== W.lay) { W.lay = r.lay; listen(); }
    setGroups(r.g); syncPeople(r.people);
  } catch (e) { }
}
function syncPeople(list) {
  const ids = new Set();
  for (const d of list || []) { if (!d?.id) continue; ids.add(d.id); if (d.id !== W.me) upsertPerson(d); }
  for (const id of [...W.people.keys()]) if (id !== W.me && !ids.has(id)) removePerson(id);
  updateVisible();
}
function worldEvent(e) {
  if (!W.on || !e || W.seen.has(e.e)) return;
  W.seen.add(e.e); if (e.e > W.last) W.last = e.e;
  if (W.seen.size > 800) W.seen = new Set([...W.seen].slice(-400));
  if (e.k === "map") return syncMapSoon(300 + Math.random() * 1200);
  if (e.k === "regroup") { if (W.cells.has(e.c)) setGroups(Object.assign(Object.fromEntries([...W.cg]), { [e.c]: (e.d && e.d.g) || 1 })); return; }   // ce carré est plus ou moins bondé : on réécoute le bon groupe   // quelqu'un a acheté ou vendu près d'ici : la carte, tout de suite (api.js)
  const id = e.u, d = e.d || {}; let p = W.people.get(id);
  if (e.k === "join") { if (id !== W.me) { upsertPerson(d); updateVisible(); } }
  else if (e.k === "move") {
    if (id === W.me) return;
    const key = `${d.lon},${d.lat},${d.dur}`;
    if (!p && d.join) { p = upsertPerson(d.join); p.mvKey = key; p.mvAt = performance.now(); return updateVisible(); }
    if (!p) return queuePeople();
    if (p.mvKey === key && performance.now() - p.mvAt < 3000) return;   // le même trajet, reçu par deux carrés
    p.mvKey = key; p.mvAt = performance.now();
    if (d.metro) hop(p, d.lon, d.lat); else walkAlong(p, d.path || [[p.lon, p.lat], [d.lon, d.lat]], d.dur);
  }
  // (« say » : plus aucun mot sur la carte de Paris depuis le 25/10/2026, on parle au salon ; un site d'avant peut encore en envoyer)
  else if (e.k === "look") { if (p) { p.look = d.look; window.people3d?.look(p.id, spec3d(p)); drawLabel(p); } }
  else if (e.k === "leave") removePerson(id);
  else if (e.k === "kick" && id === W.me) { W.banned = true; closeSalon(true); renderDock(); toast(d.h ? `Vous êtes banni du chat pour ${d.h} h` : "Vous êtes banni du chat", "bad"); }
}

// ---- les gens -----------------------------------------------------------------
function addPerson(d) {
  const p = { id: d.id, pseudo: d.pseudo, party: d.party, look: d.look, lon: +d.lon, lat: +d.lat, path: null, cum: null, seg: 1, t0: 0, dur: 0, walk: false, head: Math.PI,
    el: null, gone: false, vis: false, bt: 0, mvKey: "", mvAt: 0 };
  W.people.set(p.id, p); window.people3d?.add(p.id, spec3d(p), p.id === W.me); drawLabel(p); return p;
}
function upsertPerson(d) {
  let p = W.people.get(d.id), trip = d.path && d.dur > 0 && (d.el || 0) < d.dur;
  if (!p) { p = addPerson(d); if (trip) followTrip(p, d.path, d.dur, d.el || 0); else pose(p); return p; }
  const relook = JSON.stringify(p.look || null) !== JSON.stringify(d.look || null) || p.party !== d.party;
  p.pseudo = d.pseudo; p.party = d.party; p.look = d.look; if (relook) window.people3d?.look(p.id, spec3d(p));
  drawLabel(p);
  if (trip) { if (!p.path) followTrip(p, d.path, d.dur, d.el || 0); }
  else if (!p.path && mLL([p.lon, p.lat], [+d.lon, +d.lat]) > 3) walkAlong(p, [[p.lon, p.lat], [+d.lon, +d.lat]]);
  return p;
}
function removePerson(id) {
  if (id === W.me) return; const p = W.people.get(id); if (!p) return;
  clearTimeout(p.bt); p.el?.remove(); window.people3d?.remove(id); W.people.delete(id);
}
const pose = p => window.people3d?.pose(p.id, p.lon, p.lat, p.alt || 0, p.vis && !p.gone && !W.away);   // (W.away : on est au salon)
// qui on montre : soi toujours ; les autres quand on est assez près (au plus 40, les plus proches du centre)
function updateVisible() {
  if (!map || !W.on) return;
  const z = map.getZoom(), c = map.getCenter(), ok = z >= 14.6 && mode === "all";
  const keep = new Set(ok ? [...W.people.values()].filter(p => p.id !== W.me).map(p => [mLL([c.lng, c.lat], [p.lon, p.lat]), p.id]).sort((a, b) => a[0] - b[0]).slice(0, 40).map(x => x[1]) : []);
  for (const p of W.people.values()) { const v = p.id === W.me || keep.has(p.id); if (v !== p.vis) { p.vis = v; pose(p); } }
  layoutPeople();
}
// la durée d'une course (comme dice_go) : à la vitesse du jeu, entre runMin et runMax secondes (1,2 à 3 s)
function runDur(L) { const c = W.cfg || {}; return Math.min(c.runMax || 3, Math.max(c.runMin || 1.2, L / (c.runSpeed || 180))); }
// suivre un trajet (les rues) en dur secondes ; sans durée : comme une course du dé
function walkAlong(p, pts, dur) {
  if (!pts || pts.length < 2) return;
  pts = pts.map(q => [+q[0], +q[1]]); pts[0] = [p.lon, p.lat];   // on part d'où il est vraiment à l'écran
  const cum = pathLen(pts), L = cum[cum.length - 1];
  if (L < .5) { const e = pts[pts.length - 1]; p.lon = e[0]; p.lat = e[1]; stopPerson(p); return; }
  setTrip(p, pts, cum, dur || runDur(L), 0);
}
function followTrip(p, path, dur, el) {   // un trajet déjà commencé depuis el secondes
  const pts = path.map(q => [+q[0], +q[1]]), cum = pathLen(pts);
  if (el >= dur || cum[cum.length - 1] < .5) { const e = pts[pts.length - 1]; p.lon = e[0]; p.lat = e[1]; stopPerson(p); return; }
  setTrip(p, pts, cum, dur, el);
}
function setTrip(p, pts, cum, dur, el) { p.path = pts; p.cum = cum; p.seg = 1; p.dur = Math.max(.2, dur); p.t0 = performance.now() - el * 1000; p.gone = false; startTick(); }
function stopPerson(p) { p.path = null; p.alt = 0; pose(p); }
function hop(p, lon, lat) {   // le métro : on disparaît, on réapparaît là-bas
  p.path = null; p.alt = 0; p.gone = true; pose(p); layoutPeople();
  setTimeout(() => { p.lon = lon; p.lat = lat; p.gone = false; pose(p); updateVisible(); }, 1600);
}
function startTick() { if (!W.raf) W.raf = requestAnimationFrame(worldTick); }
function worldTick() {
  W.raf = 0; if (document.hidden || cur() !== "map") return;   // reprend en revenant sur la carte (les positions dépendent de l'heure)
  const now = performance.now(); let any = false;
  for (const p of W.people.values()) {
    if (!p.path) continue;
    // la montgolfière part en douceur, glisse et ralentit en arrivant ; elle monte puis redescend (FLY_ALT)
    const f = Math.min(1, (now - p.t0) / (p.dur * 1000)), at = f * f * (3 - 2 * f) * p.cum[p.cum.length - 1];
    let i = p.seg; if (i < 1 || p.cum[i - 1] > at) i = 1; while (i < p.path.length - 1 && p.cum[i] < at) i++; p.seg = i;
    const a = p.path[i - 1], b = p.path[i], k = (at - p.cum[i - 1]) / ((p.cum[i] - p.cum[i - 1]) || 1);
    p.lon = a[0] + (b[0] - a[0]) * k; p.lat = a[1] + (b[1] - a[1]) * k;
    const dx = (b[0] - a[0]) * KXP, dy = (b[1] - a[1]) * KYP; if (dx * dx + dy * dy > .01) p.head = Math.atan2(dx, dy);
    if (f >= 1) { p.path = null; p.alt = 0; pose(p); if (p.id === W.me) arrived(); continue; }
    p.alt = FLY_ALT * Math.sin(Math.PI * f); pose(p); any = true;   // (elle monte, puis redescend sur l'immeuble)
    if (p.id === W.me) meStep(now, i);
  }
  if (any) W.raf = requestAnimationFrame(worldTick);
}
// pendant qu'on vole : le trajet qui reste, la caméra qui suit
function meStep(now, i) {
  const me = meP(); camStep(me, now);
  if (W.run?.hits) tollStep(W.run, Math.min(1, (now - me.t0) / (me.dur * 1000)));
  if (now - W.stepT > 220) { W.stepT = now; drawRoute(me.path.slice(i), [me.lon, me.lat]); offMe(); }
}

// ---- les noms au-dessus des têtes, les bulles --------------------------------------
function drawLabel(p) {
  const box = $("#wpl"); if (!box) return;
  const me = p.id === W.me;
  if (!p.el) { p.el = document.createElement("button"); p.el.className = "wp" + (me ? " me" : ""); p.el.dataset.id = p.id; p.el.innerHTML = '<span class="bub" hidden></span><span class="nm"></span>' + (me ? '<span class="bl"></span>' : ""); p.el.style.display = "none"; box.appendChild(p.el); }
  p.el.querySelector(".nm").innerHTML = me ? "Vous" : `<i style="background:${PARTIES[p.party]?.c || "#94A3B8"}"></i>${esc(p.pseudo || "?")}`;
  p.el.setAttribute("aria-label", me ? "Ma montgolfière" : (p.pseudo || "Joueur"));
  // dézoomé (26/10/2026, « au lieu de voir “vous” comme les autres trucs, un minimum de différenciation ») : sa montgolfière en
  // petit, à ses couleurs, à la place d'un point bleu comme ceux de ses biens
  if (me) { const sp = spec3d(p), k = JSON.stringify(sp); if (p.blk !== k) { p.blk = k; p.el.querySelector(".bl").innerHTML = balloonSVG(sp, 34); } }
}
// après chaque image de la carte : le nom suit la tête (calculé comme la 3D), la zone à toucher couvre le personnage
function layoutPeople() {
  if (!W.on || !map) return;
  const z = map.getZoom(), far = z < 13.6, cw = map.getContainer().clientWidth, ch = map.getContainer().clientHeight;
  for (const p of W.people.values()) {
    const el = p.el; if (!el) continue; const me = p.id === W.me;
    let show = p.vis && !p.gone && !W.away && (me || z >= 15), x = 0, y = 0, h = 0;
    if (show) {
      const s = !far ? window.people3d?.screen(p.id) : null;
      if (s) { x = s.hx; y = s.hy; h = Math.max(10, s.fy - s.hy); }
      else { const q = map.project([p.lon, p.lat]); x = q.x; y = q.y; h = 0; }
      if (x < -80 || x > cw + 80 || y < -60 || y > ch + 80) show = false;
    }
    if (!show) { if (el.style.display !== "none") el.style.display = "none"; continue; }
    if (el.style.display === "none") el.style.display = "";
    el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; el.style.setProperty("--h", h.toFixed(1) + "px");
    const dot = !h; if (el.classList.contains("dot") !== dot) el.classList.toggle("dot", dot);
    el.style.zIndex = 10 + Math.round(y + h);
    if (p.bt) clampBubble(p);
  }
  declutterMe();
}
// un nom de lieu posé sur son personnage s'efface (on doit toujours se voir)
let dmT = 0;
function declutterMe() {
  const now = performance.now(); if (now - dmT < 200) return; dmT = now;
  const el = meP()?.el, show = el && el.style.display !== "none", r = show ? el.getBoundingClientRect() : null;
  const box = r && { l: r.left - 6, r: r.right + 6, t: r.top - 24, b: r.bottom + 4 };   // le nom compris
  for (const list of [monMarks, spotMarks, parkMarks]) for (const m of list) {
    const e = m.el || m.mk?.getElement(); if (!e) continue;
    let on = false; if (box && m.on) { const q = e.getBoundingClientRect(); on = q.width > 0 && q.left < box.r && q.right > box.l && q.top < box.b && q.bottom > box.t; }
    if (e.classList.contains("behindme") !== on) e.classList.toggle("behindme", on);
  }
}
function say(p, t) {
  if (!p?.el || !t) return; const b = p.el.querySelector(".bub");
  b.textContent = t; b.hidden = false; b.classList.remove("out"); void b.offsetWidth; b.classList.add("pop");
  clearTimeout(p.bt); clampBubble(p);
  p.bt = setTimeout(() => { b.classList.add("out"); p.bt = setTimeout(() => { b.hidden = true; b.classList.remove("out", "pop"); p.bt = 0; }, 400); }, Math.min(9000, 3800 + t.length * 50));
}
function clampBubble(p) {
  const b = p.el.querySelector(".bub"); if (b.hidden) return; b.style.setProperty("--dx", "0px");
  const r = b.getBoundingClientRect(), m = 8; let dx = 0;
  if (r.left < m) dx = m - r.left; else if (r.right > innerWidth - m) dx = innerWidth - m - r.right;
  if (dx) b.style.setProperty("--dx", dx + "px");
}
// quand son personnage sort de l'écran : une flèche au bord indique où il est
function offMe() {
  const el = $("#pawnoff"), me = meP(); if (!el || !me || !W.on || !map) return;
  const hide = () => { if (!el.hidden) el.hidden = true; };   // (n'écrire que si ça change : sinon tout le style de la page est recalculé)
  if ((panelKind === "land" && innerWidth < 900) || me.gone || W.away || cur() !== "map" || mode !== "all") return hide();
  const Wd = map.getContainer().clientWidth, H = map.getContainer().clientHeight, pt = map.project([me.lon, me.lat]);
  const top = 110, bot = H - (($(".mapbottom")?.offsetHeight || 80) + 24), left = 30, right = Wd - 30 - (panelKind === "land" && innerWidth >= 900 ? 400 : 0);
  if (pt.x > left && pt.x < right && pt.y > top && pt.y < bot) return hide();
  const cx = Wd / 2, cy = (top + bot) / 2, dx = pt.x - cx, dy = pt.y - cy;
  const k = Math.min((right - 50 - cx) / Math.abs(dx || 1e-6), (bot - 20 - cy) / Math.abs(dy || 1e-6));
  el.hidden = false; el.style.left = (cx + dx * k) + "px"; el.style.top = (cy + dy * k) + "px";
  el.querySelector("i").style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI + 90}deg)`;
  const c = map.getCenter(); el.querySelector("span").textContent = "Vous · " + fmtDist(mLL([c.lng, c.lat], [me.lon, me.lat]));
}

// ---- le trajet dessiné sur la carte ------------------------------------------------
function drawRoute(pts, head, metro) {
  if (!map || !mapReady) return; const src = map.getSource("wroute");
  if (!pts || pts.length < 1) { src?.setData(FC([])); return; }
  const line = head ? [head, ...pts] : pts, k = metro ? "m" : "l";
  const data = FC([{ type: "Feature", properties: { k }, geometry: { type: "LineString", coordinates: line.length > 1 ? line : [line[0], line[0]] } },
    { type: "Feature", properties: { k: "e" }, geometry: { type: "Point", coordinates: line[line.length - 1] } }]);
  if (src) return src.setData(data);
  map.addSource("wroute", { type: "geojson", data });
  const before = map.getLayer("anchor-top") ? "anchor-top" : undefined, isL = ["!=", ["get", "k"], "e"];
  map.addLayer({ id: "wroute-c", type: "line", source: "wroute", filter: isL, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 9, "line-opacity": .9 } }, before);
  map.addLayer({ id: "wroute", type: "line", source: "wroute", filter: isL, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["match", ["get", "k"], "m", "#0EA5E9", "#2563EB"], "line-width": 4.5, "line-dasharray": [1.1, 1.3] } }, before);
  map.addLayer({ id: "wroute-e", type: "circle", source: "wroute", filter: ["==", ["get", "k"], "e"], paint: { "circle-radius": 7, "circle-color": "#2563EB", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } }, before);
}

// ---- la montgolfière vole où l'on veut (26/10/2026, choix du propriétaire : « le système du dé, c'est un peu galère parce que
// c'est dur d'arriver exactement là où on veut ; en cliquant, on va se déplacer là où on veut, pile poil ») ---------------------
// Toucher la carte : elle y vole tout droit (zoomé assez pour voir où l'on va). Toucher un immeuble ou un lieu : sa case, avec
// « Y aller · 650 m » (on ne gaspille pas de km en regardant). Le vol use des km : 5 au plus, +500 m toutes les 30 min, 20 000 €
// de salaire par km (Gauche ×2) ; des km en plus contre l'argent du jeu. En survolant l'immeuble d'un autre joueur (rose), on lui
// paie le loyer écrit sur sa carte, une fois par jour par immeuble (le serveur compte : migration_vol.sql) : un seul compteur sur
// sa montgolfière, les immeubles survolés clignotent, rien d'écrit sur la carte.
// les km : ceux qui se rechargent (comme _kmfree côté serveur, depuis le dernier état reçu) et ceux qu'on a achetés
function kmFree() {
  const s = ST.state; if (!s || s.km_free == null) return 0; const c = W.cfg || {};
  const el = Math.max(0, (performance.now() - (ST.stAt || performance.now())) / 1000);
  return Math.min(c.kmMax || 5, +s.km_free + el / ((c.kmEvery || 30) * 60) * (c.kmStep || .5));
}
const kmLeft = () => kmFree() + (+ST.state?.km_buy || 0);
const kmShort = km => km >= .95 ? kmTxt(km) : Math.max(0, Math.floor(km * 100) * 10) + " m";   // (sous 1 km : en mètres, arrondi en dessous)
// voler : jusqu'à un immeuble (g : on s'y pose, sa case s'ouvre) ou un point de la carte ; la caméra suit, et prend de la hauteur
// pour un long vol
async function flyMe(lon, lat, g) {
  const me = meP(); if (!me || !W.on || W.run || W.riding || moving) return;
  hideHint();
  if (g != null) { const c = card(g) ? centerOf(g) : null; if (!c) return; lon = c[0]; lat = c[1]; }
  const c = W.cfg || {};
  if (lon < (c.w ?? 2.21) || lon > (c.e ?? 2.48) || lat < (c.s ?? 48.805) || lat > (c.n ?? 48.91)) return toast("Restez dans Paris", "bad");
  const L = mLL([me.lon, me.lat], [lon, lat]);
  if (L < 3 && g == null) return aimClear();
  if (L / 1000 > kmLeft() + .0005) return kmSheet(L);
  aimClear(); if (typeof LIFE !== "undefined") LIFE.bubble?.end();   // (la bulle « Le saviez-vous ? » partait hors de l'écran avec la caméra)
  const pts = [[me.lon, me.lat], [lon, lat]].map(q => [+q[0].toFixed(6), +q[1].toFixed(6)]);
  const cum = pathLen(pts), dur = runDur(L), from = { lon: me.lon, lat: me.lat };
  justBought = null; landCredit = null; setMovebar(""); closeSheet(); moving = true;
  W.run = { g, t0: performance.now(), dur, z0: map.getZoom(), z1: camZoom(), p0: map.getPitch(), p1: camPitch(camZoom()), pad0: map.getPadding(), pad1: camPad(),
    arc: Math.max(0, Math.min(2.2, Math.log2(L / 500))), hits: null, hi: 0, sum: 0 };
  if (g != null && mapReady) map.setFeatureState(Object.assign({ id: g }, BLD), { dst: 2 });   // l'immeuble visé, en vert
  CAM.on = true; map.stop();
  setTrip(me, pts, cum, dur, 0); drawRoute(pts); renderDock();
  const run = W.run;
  run.wait = rpc("fly", g != null ? { p_lon: null, p_lat: null, p_card: g } : { p_lon: pts[1][0], p_lat: pts[1][1], p_card: null }).then(r => {
    run.res = r; run.hits = r.toll?.hits || [];
    // le serveur a compté une autre durée : on suit la sienne à partir d'ici
    if (W.run === run && me.path && Math.abs(r.dur - run.dur) > .05) {
      const f = Math.min(1, (performance.now() - run.t0) / 1000 / run.dur); me.dur = r.dur; me.t0 = performance.now() - f * r.dur * 1000; run.t0 = me.t0; run.dur = r.dur;
    }
    return r;
  }).catch(e => {
    if (W.run !== run) return null;
    W.run = null; moving = false; me.lon = from.lon; me.lat = from.lat; stopPerson(me); drawRoute(null); tollLabel(0);
    if (g != null && mapReady) map.setFeatureState(Object.assign({ id: g }, BLD), { dst: 0 });
    const m = e.message || ""; toast(m, "bad");
    if (/Revenez/.test(m)) rejoin(); else if (/km/.test(m)) refreshState().then(renderDock).catch(() => { });
    renderDock(); return null;
  });
}
// pendant le vol : le péage des immeubles survolés (le serveur les rend dans l'ordre du vol) — le compteur sur sa montgolfière
// monte, l'immeuble clignote en rose ; à l'arrivée, les derniers
function tollStep(run, f) {
  const H = run.hits; if (!H) return;
  while (run.hi < H.length && H[run.hi][2] <= f + .02) {
    const [g, a] = H[run.hi++]; run.sum += a; tollLabel(run.sum);
    if (mapReady && g !== run.g) { map.setFeatureState(Object.assign({ id: g }, BLD), { dst: 1 }); setTimeout(() => { if (mapReady && (!W.run || W.run.g !== g)) map.setFeatureState(Object.assign({ id: g }, BLD), { dst: 0 }); }, 750); }
  }
}
function tollLabel(n) {
  const el = meP()?.el?.querySelector(".nm"); if (!el) return;
  const t = n > 0 ? "−" + fmtE(n) : "Vous"; if (el.textContent !== t) el.textContent = t;
  el.parentElement.classList.toggle("toll", n > 0);
}
// posée au bout de son vol : le salaire, le péage, et sa case (un immeuble : libre, on l'achète ; un « ? » : une carte Chance)
async function arrived() {
  const me = meP(), run = W.run; drawRoute(null); offMe();
  if (!run) return;   // (un vol repris après un rechargement)
  if (CAM.on && map && cur() === "map" && !map.isMoving()) map.jumpTo({ center: [me.lon, me.lat], zoom: run.z1, pitch: run.p1, padding: run.pad1 });
  const r = run.res || await run.wait;
  if (W.run !== run) return;
  if (r) tollStep(run, 1);
  W.run = null; moving = false;
  if (run.g != null && mapReady) map.setFeatureState(Object.assign({ id: run.g }, BLD), { dst: 0 });
  renderDock(); queueCells(true);
  if (!r) return tollLabel(0);
  W.flights = (W.flights || 0) + 1;
  setState(r.state); renderWallet(); renderDock();
  const toll = r.toll?.toll || 0;
  if (r.salary > 0) moneyPop(r.salary);
  if (toll > 0) { setTimeout(() => moneyPop(-toll), 700); tollHint(toll); }
  clearTimeout(W.tlT); W.tlT = setTimeout(() => { if (!W.run) tollLabel(0); }, toll > 0 ? 2600 : 0);
  sfx(toll > 0 ? "bad" : "coin");
  const L = r.landing;
  if (L) {
    lastLanding = L; justBought = null; landCredit = null;
    if (L.chance) { W.taken.add(L.card); renderQ(); }
    await ensureCards([L.card]).catch(() => { });
    showLand(L);
    if (L.chance?.extra || ["booster", "bonne", "cle"].includes(L.chance?.k)) Promise.all([refreshHold(), refreshMap()]).then(() => { paintAll(); if (panelKind === "land") showLand(L); }).catch(() => { });
  }
  if (typeof tutTick === "function") tutTick();
}
// le premier péage (une fois, nouveaux et anciens joueurs) : une phrase pour comprendre
function tollHint(n) {
  try { if (localStorage.getItem("hm_tollhint")) return; localStorage.setItem("hm_tollhint", "1"); } catch (e) { return; }
  toast(`Péage −${fmtE(n)} : vous avez survolé l'immeuble d'un autre joueur (en rose). Une fois par jour par immeuble.`, "bad");
}
// toucher un immeuble, un monument ou le repère d'une station : sa case, avec « Y aller » (là où l'on s'est posé : sa case d'achat)
function worldTapAt(g) { if (W.run || W.riding) return; worldTapCard(g); }
// toucher la carte ailleurs : un « ? » du jour sous le doigt, sa case ; sinon, au téléphone, on vise (la cible, « Y aller ») ;
// à l'ordinateur, la cible suivait déjà la souris : un clic, on part
function worldGround(e) {
  if (!W.on || !e?.lngLat || mode !== "all" || W.run || W.riding || moving) return;
  const p = e.point, box = [[p.x - 12, p.y - 12], [p.x + 12, p.y + 12]];
  if (map.getLayer("wq-c")) { const f = map.queryRenderedFeatures(box, { layers: ["wq-c"] })[0]; if (f) return worldTapCard(+f.properties.g); }
  hideHint();
  if (aimHoverDev()) return inParisLL(e.lngLat.lng, e.lngLat.lat) ? flyMe(e.lngLat.lng, e.lngLat.lat, null) : toast("Hors de Paris", "bad");   // (à la souris, un clic vole : pas au-delà du mur)
  aimAt(e.lngLat.lng, e.lngLat.lat, false);
}
async function worldTapCard(g) {
  aimClear();
  await ensureCards([g]); if (!card(g)) return;
  hideHint(); justBought = null; landCredit = null; showLand(null, g);
}
// « Y aller » sur une case qu'on regarde : la distance, et le péage du vol (ou ce qu'il reste de km) quand le serveur a répondu
function goBtn(g) {
  const me = meP(), c = card(g) ? centerOf(g) : null; if (!W.on || !me || !c || (typeof S !== "undefined" && S.on)) return "";
  const d = mLL([me.lon, me.lat], c);
  setTimeout(() => goQuote(g), 0);
  return `<button class="btn block buy" data-lgo="${g}"><span>Y aller · ${distTxt(d)}</span><small class="gtl" data-gtl="${g}" hidden></small></button>`;
}
const GQ = new Map();   // les vols déjà demandés au serveur (immeuble et d'où l'on part → réponse), 20 s
async function goQuote(g) {
  const me = meP(); if (!me) return;
  const key = g + ":" + me.lon.toFixed(5) + "," + me.lat.toFixed(5), hit = GQ.get(key);
  let q = hit && Date.now() - hit.at < 20000 ? hit.q : null;
  if (!q) {
    try { q = await rpc("fly_quote", { p_lon: null, p_lat: null, p_card: g }); } catch (e) { return; }   // (serveur d'avant : rien)
    GQ.set(key, { at: Date.now(), q }); if (GQ.size > 60) GQ.delete(GQ.keys().next().value);
  }
  const el = document.querySelector(`[data-gtl="${g}"]`); if (!el || !q) return;
  const t = q.ok && q.toll > 0 ? `Péage −${fmtE(q.toll)}` : q.why === "km" ? `Il vous reste ${kmShort(+q.km)}` : "";
  el.hidden = !t; el.textContent = t; el.classList.toggle("km", q.why === "km");
}

// ---- viser puis voler (26/10/2026, choix du propriétaire : « c'est un peu galère quand on se déplace, car le curseur ne change
// pas ; on sait pas trop où on peut cliquer ou pas » ; « les gens seront sur téléphone ») -------------------------------------
// Téléphone : toucher la carte pose une cible (l'endroit exact), la ligne du vol et « Y aller · 350 m », avec « Péage −12 000 € »
// quand on survolerait les immeubles d'autres joueurs (fly_quote : le serveur compte comme pour le vrai vol) ; toucher « Y aller »
// (ou la cible) : on part ; trop loin : « Il vous reste 300 m » (ses km). Ordinateur : la même cible suit la souris, la main sur
// les immeubles, et un clic suffit.
const AIM = { on: false, lon: 0, lat: 0, mk: null, el: null, ln: null, seq: 0, qT: 0, hov: false, state: "", L: 0 };
const aimHoverDev = () => !W.touchAim && matchMedia("(hover: hover) and (pointer: fine)").matches;   // (W.touchAim : les tests jouent « au téléphone »)
const aimCanFly = () => W.on && !W.run && !W.riding && !moving && mode === "all" && cur() === "map" && !(typeof S !== "undefined" && S.on) && !!meP();
function aimEls() {
  if (AIM.el || !map) return;
  const el = document.createElement("div"); el.className = "aim";
  el.innerHTML = `<span class="ap" hidden></span><button class="ab" type="button"></button><i class="at" aria-hidden="true"></i>`;
  el.addEventListener("click", e => { e.stopPropagation(); aimGo(); });
  AIM.el = el; AIM.mk = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, 11] }).setLngLat([0, 0]);
  const sv = document.createElementNS("http://www.w3.org/2000/svg", "svg"); sv.id = "aimln"; sv.setAttribute("aria-hidden", "true");
  sv.innerHTML = `<line class="c"/><line class="l"/>`; sv.style.display = "none";
  map.getCanvasContainer().insertBefore(sv, map.getCanvas().nextSibling); AIM.ln = sv;
  map.on("render", aimLine);
}
// la ligne du vol, de sa montgolfière à la cible, au-dessus des toits (dessinée sur l'écran : une ligne droite au sol reste droite)
function aimLine() {
  if (!AIM.on || !AIM.ln) return; const me = meP(); if (!me) return;
  const a = map.project([me.lon, me.lat]), b = map.project([AIM.lon, AIM.lat]);
  for (const l of AIM.ln.children) { l.setAttribute("x1", a.x.toFixed(1)); l.setAttribute("y1", a.y.toFixed(1)); l.setAttribute("x2", b.x.toFixed(1)); l.setAttribute("y2", b.y.toFixed(1)); }
  // « Y aller » reste dans l'écran : décalé près des bords, sous la cible tout en haut (sous les barres)
  const cw = map.getContainer().clientWidth, half = (AIM.w || 140) / 2 + 10;
  const dx = b.x - half < 0 ? half - b.x : b.x + half > cw ? cw - half - b.x : 0, dn = b.y < 190;
  if (AIM.dx !== dx) { AIM.dx = dx; AIM.el.style.setProperty("--dx", Math.round(dx) + "px"); }
  if (AIM.dn !== dn) { AIM.dn = dn; AIM.el.classList.toggle("dn", dn); }
}
function aimAt(lon, lat, hover) {
  if (!map || !meP()) return; aimEls();
  AIM.on = true; AIM.lon = lon; AIM.lat = lat; AIM.hov = !!hover;
  AIM.el.classList.toggle("hov", !!hover); AIM.mk.setLngLat([lon, lat]); if (!AIM.mk._map) AIM.mk.addTo(map);
  AIM.ln.style.display = ""; aimText(null); aimLine();
  clearTimeout(AIM.qT); const seq = ++AIM.seq;
  if (AIM.state !== "ok") return;   // (trop loin, hors de Paris : pas besoin du serveur)
  AIM.qT = setTimeout(async () => {
    let q = null; try { q = await rpc("fly_quote", { p_lon: +lon.toFixed(6), p_lat: +lat.toFixed(6), p_card: null }); } catch (e) { return; }
    if (seq === AIM.seq && AIM.on) aimText(q);
  }, hover ? 260 : 0);   // (à la souris : quand elle s'arrête)
}
// dans Paris = dans la boucle du mur de glace (26/10/2026, « oui, le mur est la limite » ; map.js, WALL.ring ; le serveur : _in_paris)
function inParisLL(lo, la) {
  const c = W.cfg || {}; if (lo < (c.w ?? 2.21) || lo > (c.e ?? 2.48) || la < (c.s ?? 48.805) || la > (c.n ?? 48.91)) return false;
  return typeof WALL === "undefined" || !WALL.ring || inPolyLL(WALL.ring, lo, la);
}
function aimText(q) {
  const me = meP(); if (!me) return;
  const L = mLL([me.lon, me.lat], [AIM.lon, AIM.lat]), left = q?.km != null ? +q.km : kmLeft();
  const out = !inParisLL(AIM.lon, AIM.lat);
  const far = q?.why === "far", short = !out && !far && (q ? q.why === "km" : L / 1000 > left + .0005);
  AIM.state = out ? "out" : far ? "far" : short ? "km" : "ok"; AIM.L = L;
  const b = AIM.el.querySelector(".ab"), p = AIM.el.querySelector(".ap");
  const t = out ? "Hors de Paris" : far ? "Trop loin" : short ? `Il vous reste ${kmShort(left)}` : `Y aller · ${distTxt(L)}`;
  if (b.textContent !== t) b.textContent = t;
  AIM.el.classList.toggle("no", AIM.state !== "ok");
  const toll = AIM.state === "ok" && q?.toll > 0 ? q.toll : 0;
  p.hidden = !toll; if (toll) p.textContent = `Péage −${fmtE(toll)}`;
  AIM.w = Math.max(b.offsetWidth, toll ? p.offsetWidth : 0); aimLine();
}
function aimGo() {
  if (!AIM.on || AIM.state === "out" || AIM.state === "far") return;
  if (AIM.state === "km") return kmSheet(AIM.L);
  flyMe(AIM.lon, AIM.lat, null);
}
function aimClear() {
  if (!AIM.on) return; AIM.on = false; AIM.hov = false; AIM.seq++; clearTimeout(AIM.qT);
  AIM.mk?.remove(); if (AIM.ln) AIM.ln.style.display = "none";
}
// à la souris : la main sur ce qu'on peut ouvrir (immeubles, « ? »), la cible sur le sol où l'on peut voler
let aimRaf = 0, aimEv = null;
function aimMove(e) { aimEv = e; if (!aimRaf) aimRaf = requestAnimationFrame(aimHoverNow); }
function aimHoverNow() {
  aimRaf = 0; const e = aimEv; if (!e || !map || !mapReady) return;
  const cv = map.getCanvas(), set = k => { if (cv.style.cursor !== k) cv.style.cursor = k; };
  if (e.originalEvent?.buttons || (typeof S !== "undefined" && S.on)) { if (AIM.hov) aimClear(); return set(""); }   // (on fait glisser la carte ; au salon : salon.js)
  const lay = ["bd", "rf", "wq-c"].filter(l => map.getLayer(l));
  if (map.queryRenderedFeatures(e.point, { layers: lay }).length) { if (AIM.hov) aimClear(); return set("pointer"); }
  if (aimHoverDev() && aimCanFly() && panelKind !== "land") { set(inParisLL(e.lngLat.lng, e.lngLat.lat) ? "crosshair" : "not-allowed"); aimAt(e.lngLat.lng, e.lngLat.lat, true); }
  else { if (AIM.hov) aimClear(); set(""); }
}
// les boutons de la case : là où l'on s'est posé, une station : « Prendre le métro »
function worldLandBtns(g, view) {
  if (!W.on || !W.G || view) return "";
  return W.G.st.has(g) ? `<button class="btn block light" data-wmetro="${g}">🚇 Prendre le métro</button>` : "";
}
function moneyPop(n) {   // « +12 000 € » (le salaire) qui monte sous l'argent ; « −2 000 € » (le péage) en rouge, juste dessous
  const m = $("#bar .money"); if (!m || !n) return; const r = m.getBoundingClientRect(); if (!r.width) return;
  const el = document.createElement("div"); el.className = "mpop num" + (n < 0 ? " bad" : ""); el.textContent = (n < 0 ? "−" : "+") + fmtE(Math.abs(n));
  el.style.left = (r.left + r.width / 2) + "px"; el.style.top = (r.bottom + 2 + (n < 0 ? 20 : 0)) + "px"; document.body.appendChild(el);
  setTimeout(() => el.remove(), 1900);
}
// ses km : combien il en reste, ce qui revient, en acheter (need : la distance d'un vol trop long)
function kmSheet(need) {
  const left = kmLeft(), price = ST.state?.km_price || W.cfg?.kmPrice || 50000, pack = W.cfg?.kmPack || 2, full = kmFree() >= (W.cfg?.kmMax || 5) - .001;
  const head = need ? `Il faut ${distTxt(need)} : il vous reste ${kmShort(left)}` : `${kmShort(left)} pour voler`;
  sheet(`<b class="plst">${esc(head)}</b><p class="plp">${full ? `${kmTxt(W.cfg?.kmMax || 5)} : c'est le plein` : "+500 m toutes les 30 min"} · 20 000 € par km parcouru</p>
    <button class="btn block buy" data-bkm ${liveCash() < price ? "disabled" : ""}><span>+${pack} km · ${fmtE(price)}</span></button>`,
    async b => {
      const x = b.closest("[data-bkm]"); if (!x || x.disabled) return; x.disabled = true;
      try { setState(await rpc("buy_km")); closeSheet(); renderWallet(); renderDock(); toast(`+${pack} km !`, "good"); sfx("coin"); }
      catch (e) { x.disabled = false; toast(e.message, "bad"); }
    });
}
// le bouton du milieu : sa montgolfière (26/10/2026, choix du propriétaire : « au lieu du dé, ça affiche plutôt le nombre de mètres
// qui nous restent » ; « même si la montgolfière est un peu à gauche, on doit pouvoir recentrer dessus simplement ») : la caméra
// n'est pas sur elle, on y revient ; sinon, ses km
function mainBtn() {
  const me = meP(); if (!W.on || !me) return;
  hideHint();
  if (W.run) return centerOnMe(true);
  const q = map ? map.project([me.lon, me.lat]) : null, cw = map?.getContainer().clientWidth || 0, ch = map?.getContainer().clientHeight || 0;
  const off = !CAM.on || !q || Math.abs(q.x - cw / 2) > cw * .18 || q.y < ch * .2 || q.y > ch * .85 || map.getZoom() < 15.2 || cur() !== "map";
  if (cur() !== "map") go("map");
  if (off) return centerOnMe(true);
  kmSheet();
}
const BALLOON_ICO = `<svg viewBox="0 0 40 52" width="40" height="52" aria-hidden="true"><path d="M20 3C29.6 3 36 10.2 36 18.8c0 7.3-5.2 11.9-9 15.7-.9.9-1.8 1.9-3 1.9h-8c-1.2 0-2.1-1-3-1.9C9.2 30.7 4 26.1 4 18.8 4 10.2 10.4 3 20 3z" fill="#fff"/><path d="M20 3c-4.6 4.6-6 10.4-6 15.8 0 6.6 2.6 12.4 6 17.6 3.4-5.2 6-11 6-17.6C26 13.4 24.6 7.6 20 3z" fill="#BFD2FB"/><path d="M16.6 36.6 17.3 42M23.4 36.6 22.7 42" stroke="#fff" stroke-width="1.4"/><rect x="15.5" y="42" width="9" height="7" rx="1.6" fill="#fff"/></svg>`;

// ---- le bas de l'écran : sa montgolfière au milieu et ses km dessous (26/10/2026 ; du 21 au 26/10 : le dé), « Salon » à côté,
// les boosters de l'autre côté ----
const canSay = () => W.on && !W.chatOff && !W.banned;
function renderDock() {
  const b = $("#b-main"); if (!b) return;
  const p = ST.state?.profile, me = meP();
  if (me && p && (me.party !== p.party || me.pseudo !== p.pseudo)) { me.party = p.party; me.pseudo = p.pseudo; window.people3d?.look(me.id, spec3d(me)); drawLabel(me); }
  if (b.dataset.k !== "bal") { b.dataset.k = "bal"; $("#mainico").innerHTML = BALLOON_ICO; }
  const km = kmLeft(), n = $("#rollsn"), t = ST.state?.km_free == null ? "…" : kmShort(km);
  if (n && n.textContent !== t) n.textContent = t;
  b.classList.toggle("empty", km < .01); b.classList.toggle("busy", !!W.run); b.classList.remove("pick");
  const al = `Ma montgolfière : ${t} pour voler`;
  if (b.getAttribute("aria-label") !== al) b.setAttribute("aria-label", al);
  // les km se rechargent : on remet le chiffre à jour de temps en temps (pas besoin du serveur)
  clearTimeout(W.kmT); if (km < (W.cfg?.kmMax || 5) + (+ST.state?.km_buy || 0) - .001) W.kmT = setTimeout(renderDock, 9000);
  const s = $("#b-say"); if (s && s.hidden === canSay()) s.hidden = !canSay();
  salonBadge();
}

// ---- les « ? » : une carte Chance en tombant dessus (30 % des stations, jardins, places chaque jour, les mêmes pour tous) ------
const chanceOn = g => ((g * 2654435761 + W.day * 97) % 4294967296) % 100 < (W.cfg?.chancePct ?? 30);   // comme _wchance_on()
function renderQ() {
  if (!map || !mapReady || !W.on) return;
  W.q = (IDX.spots || []).filter(s => chanceOn(s[0]) && !W.taken.has(s[0])).map(s => ({ g: s[0], lon: s[3], lat: s[4] }));
  const data = FC(W.q.map(q => ({ type: "Feature", properties: { g: q.g }, geometry: { type: "Point", coordinates: [q.lon, q.lat] } })));
  const src = map.getSource("wq"); if (src) return src.setData(data);
  map.addSource("wq", { type: "geojson", data });
  const before = map.getLayer("people") ? "people" : undefined;
  map.addLayer({ id: "wq-c", type: "circle", source: "wq", minzoom: 13.6, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 13.6, 7, 16, 12, 18, 17], "circle-color": "#7C3AED", "circle-stroke-color": "#fff", "circle-stroke-width": 2.5, "circle-pitch-alignment": "viewport" } }, before);
  map.addLayer({ id: "wq-t", type: "symbol", source: "wq", minzoom: 13.6, layout: { "text-field": "?", "text-font": ["Noto Sans Medium"], "text-size": ["interpolate", ["linear"], ["zoom"], 13.6, 11, 16, 17, 18, 23], "text-allow-overlap": true, "text-ignore-placement": true, "text-pitch-alignment": "viewport" }, paint: { "text-color": "#fff" } }, before);
}

// ---- le métro : depuis une station, vers n'importe quelle station de Paris (un ticket) --------------
const lineSort = (a, b) => parseFloat(a) - parseFloat(b) || a.localeCompare(b);
const stName = g => (spotOf(g)?.[5] || "").replace(/^Métro /, "");
const lineBadge = (l, s) => `<i class="lnb${LINE_DARK.has(l) ? " dk" : ""}" style="--lc:${LINE_C[l] || "#64748B"};--ls:${s}px">${l.replace("bis", "b")}</i>`;
function metroSheet(from) {
  const G = W.G; if (!G || !G.st.has(from)) return;
  const mine = [...G.st.get(from).lines].sort(lineSort), others = Object.keys(G.metro).filter(l => !mine.includes(l)).sort(lineSort);
  const rows = l => G.metro[l].map(seq => `<div class="mtl">${lineBadge(l, 24)}<div>${seq.map(g => g === from ? `<span class="mts here">${esc(stName(g))}</span>` : `<button class="mts" data-wride="${g}">${esc(stName(g))}</button>`).join("")}</div></div>`).join("");
  sheet(`<b class="plst">🚇 Métro · ${fmtE(W.cfg?.ticket || 0)}</b><input class="mtq" id="mtq" placeholder="Aller à… (une station)" autocomplete="off" enterkeyhint="search" aria-label="Chercher une station">
    <div class="mtres" id="mtres"></div><div class="mtls" id="mtls">${mine.map(rows).join("")}</div>
    <div class="mtoth">${others.map(l => `<button data-wline="${l}" aria-label="Ligne ${l}">${lineBadge(l, 30)}</button>`).join("")}</div>`,
    b => {
      const x = b.closest("[data-wride]"); if (x) { closeSheet(); return ride(from, +x.dataset.wride); }
      const l = b.closest("[data-wline]"); if (l) { const m = $("#mtls"); m.innerHTML = rows(l.dataset.wline); m.scrollIntoView({ block: "nearest" }); }
    });
  const q = $("#mtq"); q.addEventListener("input", () => {
    const v = noAcc(q.value.trim()), out = $("#mtres"); if (v.length < 2) { out.innerHTML = ""; return; }
    out.innerHTML = [...G.st.keys()].filter(g => g !== from && noAcc(stName(g)).includes(v)).slice(0, 8)
      .map(g => `<button class="mts" data-wride="${g}">${esc(stName(g))}<span>${[...G.st.get(g).lines].sort(lineSort).map(l => lineBadge(l, 18)).join("")}</span></button>`).join("") || `<span class="plp">Aucune station</span>`;
  });
}
function metroPath(from, to) {   // de station en station (changements compris) : pour le dessin
  const G = W.G, prev = new Map([[from, null]]), q = [from];
  while (q.length) { const g = q.shift(); if (g === to) break; for (const n of G.st.get(g)?.nb || []) if (!prev.has(n)) { prev.set(n, g); q.push(n); } }
  const out = []; if (!prev.has(to)) return [from, to];
  for (let g = to; g != null; g = prev.get(g)) out.unshift(g); return out;
}
async function ride(from, to) {
  const me = meP(); if (!me || W.riding || W.run) return;
  W.riding = true; moving = true;
  let r; try { r = await rpc("world_metro", { p_to: to }); } catch (e) { W.riding = false; moving = false; return toast(e.message, "bad"); }
  setState(r.state); W.w = r.w || W.w; renderWallet(); renderDock();
  if (panelKind) { justBought = null; setMovebar(""); }
  const stops = metroPath(from, to); await ensureCards(stops.concat([to]));
  const line = stops.map(g => { const s = spotOf(g); return s ? [s[3], s[4]] : centerOf(g); });
  stopPerson(me); me.gone = true; pose(me); layoutPeople(); drawRoute(line, null, true); sfx("dice");
  const dest = centerOf(to), ms = Math.min(4200, 1400 + 220 * stops.length), v = worldView();
  CAM.on = true; map.flyTo({ center: dest, zoom: v.zoom, pitch: v.pitch, padding: v.padding, duration: ms, essential: true });
  await sleep(ms);
  me.lon = dest[0]; me.lat = dest[1]; me.gone = false; pose(me); drawRoute(null);
  W.riding = false; moving = false; queueCells(true); layoutPeople();
  justBought = null; landCredit = null; showLand(null, to);
}

// ---- parler : au salon du Champ-de-Mars (salon.js, 25/10/2026) ; couper le chat --------------------
// le profil : « ne plus voir les messages des joueurs » (plus de « Parler » : plus de salon)
async function setChatOff(off) {
  try { await rpc("set_chat_off", { p_off: !!off }); } catch (e) { return toast(e.message, "bad"); }
  W.chatOff = !!off; if (ST.state?.profile) ST.state.profile.chat_off = W.chatOff;
  if (off) closeSalon();
  renderDock();
}

// ---- les fenêtres du monde (qui est-ce, ma montgolfière) ---------------------
// toucher quelqu'un : son nom, son parti et ce qu'il vend, en petites cartes (21/10/2026, demande du propriétaire : « voir ses biens
// en vente avec des cartes minimalistes, et un accès vers sa boutique ») ; un toucher ouvre la fiche du bien (acheter l'annonce,
// proposer de racheter) ; « Voir sa boutique » : ses annonces et sa collection (pages.js, playerShopPage). La fenêtre s'ouvre tout de
// suite, les cartes arrivent juste après.
function openWho(id) {
  const p = (S.on && S.people.get(id)) || W.people.get(id); if (!p) return; const pr = PARTIES[p.party];
  sheet(`<div class="plwho">${pr ? emblemSVG(p.party, 40) : ""}<div><b>${esc(p.pseudo || "?")}</b><span>${pr ? esc(pr.n) : "Sans parti"}</span></div></div>
    <div class="whcards" id="whc" hidden></div>
    <button class="btn block light whshop" data-push="pshop" data-arg="${esc(id)}">Voir sa boutique</button>
    ${W.admin ? `<div class="plban"><button class="btn block light" data-ban="24">Bannir du chat 24 h</button><button class="btn block danger" data-ban="0">Bannir du chat à vie</button></div>` : ""}`,
    async b => {
      if (b.closest("[data-push]")) return closeSheet();   // la fiche d'un bien, sa boutique : pages.js les ouvre
      const x = b.closest("[data-ban]"); if (!x) return;
      if (!x.dataset.sure) { x.dataset.sure = "1"; x.dataset.lbl = x.textContent; x.textContent = "Sûr ? Touchez encore"; setTimeout(() => { if (x.isConnected) { delete x.dataset.sure; x.textContent = x.dataset.lbl; } }, 3000); return; }
      try { await rpc("chat_ban", { p_user: id, p_hours: x.dataset.ban === "0" ? null : 24 }); toast(`${p.pseudo} est banni du chat${x.dataset.ban === "0" ? " à vie" : " 24 h"}`, "good"); closeSheet(); }
      catch (e) { toast(e.message, "bad"); }
    });
  rpc("player_shop", { p_user: id }).then(async d => {
    const ls = (d.listings || []).slice(0, 8); if (!ls.length) return;
    await ensureCards([...new Set(ls.map(l => l.card))]).catch(() => { });
    const box = $("#whc"); if (!box) return;
    box.innerHTML = ls.filter(l => card(l.card)).map(l => `<button data-push="b" data-arg="${l.card}" class="whcard" aria-label="${esc(title(card(l.card)))}, ${fmtE(l.price)}">${cardHTML(card(l.card), { w: "100%" })}<b class="whp num">${fmtE(l.price)}</b></button>`).join("");
    box.hidden = !box.innerHTML;
  }).catch(() => { });
}
function openLookSheet() {
  const p = ST.state?.profile; if (!p) return;
  sheet(`<b class="plst">Ma montgolfière</b><div class="lkwrap">${lookEditorHTML(lookOf(ME, p.look), p.party)}</div>`);
}
function sheet(html, onClick) {
  closeSheet();
  const s = document.createElement("div"); s.id = "plsheet";
  s.innerHTML = `<div class="plsb"><button class="plsx" aria-label="Fermer">×</button>${html}</div>`;
  s.addEventListener("click", e => { if (e.target === s || e.target.closest(".plsx")) return closeSheet(); onClick?.(e.target); });
  document.body.appendChild(s);
}
function closeSheet() { $("#plsheet")?.remove(); }
