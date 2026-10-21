"use strict";
// =====================================================================
//  Paris : le jeu (20/10/2026 : tout Paris ; 21/10/2026, choix du propriétaire : « on peut remettre le dé pour se déplacer »,
//  « 4 destinations au choix », « des flèches minimalistes qui prennent pas trop de place », « on supprime la marche libre »).
//  · Le bouton du milieu : le dé. Il propose jusqu'à 4 immeubles autour de soi (~100 m par point, un par direction) : une
//    petite flèche de couleur autour de son personnage pour chacun (rose : on paie le loyer · vert : libre · bleu : chez soi ·
//    violet : un « ? »), l'immeuble de la même couleur sur la carte. On touche l'un ou l'autre : son personnage y court par
//    les vraies rues (plan public/data/walk.json, scripts/make_walk.py), et y tombe (salaire, loyer, bonus, carte Chance) ;
//    sa case s'ouvre : libre, on l'achète.
//  · Le métro depuis une station où l'on est tombé ; les gens autour (par carrés d'environ 500 m) et leurs bulles ; « Parler »
//    à côté du dé (on peut couper le chat dans le profil).
//  Serveur : migration_monde_paris.sql, migration_de.sql. Les personnages en 3D : models.js (people3d).
// =====================================================================

// ---- le personnage ------------------------------------------------------------
// g genre (0 homme, 1 femme) · s peau · h cheveux · c coupe · t haut (-1 = couleur du parti) · b bas · a accessoire
const LOOK = {
  skin: ["#F6D3B5", "#F2C9A0", "#E0AC80", "#C98E62", "#8D5A3B", "#5C3A26"],
  hair: ["#1A1A1A", "#3B2B20", "#6B4226", "#A0522D", "#E8B84A", "#EFE3C2", "#B4532A", "#9CA3AF"],   // noir, brun, châtain, auburn, blond, platine, roux, gris
  hairN: ["Noir", "Brun", "Châtain", "Auburn", "Blond", "Platine", "Roux", "Gris"],
  top: ["#0F172A", "#FFFFFF", "#DC2626", "#F59E0B", "#16A34A", "#2563EB", "#9333EA"],
  bot: ["#26324A", "#111827", "#3B5B92", "#C8B08A", "#F1F1EE"],
  cutN: ["Court", "Long", "Chignon", "Bouclé", "Carré", "Rasé"],
  accN: ["Rien", "Lunettes", "Lunettes de soleil", "Béret", "Casquette"]
};
const circ = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const CUTS = [
  "M7 9.5C7 4.8 10 2.5 14 2.5s7 2.3 7 7c-1.8-1.9-4.2-2.8-7-2.8s-5.2.9-7 2.8z",
  "M6.6 10.5C6.4 4.9 9.6 2.4 14 2.4s7.6 2.5 7.4 8.1v6.5c-1 .4-1.7.1-2-.6V9.2c-1.8-1.5-3.6-2.1-5.4-2.1S10.4 7.7 8.6 9.2v7.2c-.3.7-1 1-2 .6z",
  "M7 9.3C7 4.8 10 2.6 14 2.6s7 2.2 7 6.7c-2-1.4-4.4-2.1-7-2.1s-5 .7-7 2.1zM14 .2a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z",
  [[8.6, 6.4, 3.1], [11.8, 3.9, 3.4], [16.2, 3.9, 3.4], [19.4, 6.4, 3.1], [7, 9.6, 2.3], [21, 9.6, 2.3], [14, 3.2, 3]].map(c => circ(...c)).join(""),
  "M6.6 10.5C6.4 4.9 9.6 2.4 14 2.4s7.6 2.5 7.4 8.1v4.9h-2.3V9.2c-1.8-1.5-3.6-2.1-5.4-2.1S10.4 7.7 8.6 9.2v6.2H6.6z",
  "M7.2 8.6C7.6 4.9 10.3 3.1 14 3.1s6.4 1.8 6.8 5.5c-1.9-1.1-4.2-1.7-6.8-1.7s-4.9.6-6.8 1.7z"
];
// pas encore choisi : un personnage au hasard, toujours le même pour chacun, avec la couleur de son parti
function lookOf(id, look) {
  if (look && look.s != null) return Object.assign({ g: 0, b: 0, a: 0 }, look);
  let h = 7; for (const ch of String(id || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { g: (h >>> 13) % 2, s: h % 6, h: (h >>> 5) % 6, c: (h >>> 9) % 3, t: -1, b: 0, a: 0 };
}
const topColor = (L, party) => L.t >= 0 ? LOOK.top[L.t] : (PARTIES[party]?.c || "#64748B");
function accSVG(L, party) {
  const ink = "#1F2430";
  if (L.a === 1) return `<g fill="none" stroke="${ink}" stroke-width=".8"><circle cx="11.4" cy="11" r="2.1"/><circle cx="16.6" cy="11" r="2.1"/><path d="M13.5 11h1"/></g>`;
  if (L.a === 2) return `<g fill="${ink}"><rect x="8.9" y="9.6" width="4.4" height="2.8" rx="1.3"/><rect x="14.7" y="9.6" width="4.4" height="2.8" rx="1.3"/><rect x="13.1" y="10.3" width="1.8" height=".7"/></g>`;
  if (L.a === 3) return `<g fill="#1F2937"><ellipse cx="13.2" cy="4.4" rx="8.4" ry="2.7" transform="rotate(-8 13.2 4.4)"/><circle cx="13" cy="1.6" r=".9"/></g>`;
  if (L.a === 4) { const c = topColor(L, party); return `<path d="M7.3 7.8C7.6 4 10.4 2.3 14 2.3s6.4 1.7 6.7 5.5z" fill="${c}" stroke="rgba(15,23,42,.32)" stroke-width=".7"/><path d="M14 7.6h9.3c.7 0 .9.9.3 1.2-1.5.7-5.6.6-9.6.2z" fill="${c}" stroke="rgba(15,23,42,.32)" stroke-width=".6"/>`; }
  return "";
}
function avatarSVG(L, party, h) {
  L = Object.assign({ g: 0, b: 0, a: 0 }, L);
  const skin = LOOK.skin[L.s] || LOOK.skin[0], hair = LOOK.hair[L.h] || LOOK.hair[0], top = topColor(L, party), bot = LOOK.bot[L.b] || LOOK.bot[0];
  const o = 'stroke="rgba(15,23,42,.32)" stroke-width=".7"', f = L.g === 1;
  // femme : épaules un peu plus fines, une jupe ; homme : un pantalon
  const legs = f ? `<rect x="10" y="33" width="3.2" height="11" rx="1.6" fill="${skin}"/><rect x="14.8" y="33" width="3.2" height="11" rx="1.6" fill="${skin}"/>`
    : `<rect x="9" y="31" width="4.4" height="13" rx="2.2" fill="${bot}"/><rect x="14.6" y="31" width="4.4" height="13" rx="2.2" fill="${bot}"/>`;
  const skirt = f ? `<path d="M7.6 29.5h12.8l2.2 8.3c.1.5-.2.9-.7.9H6.1c-.5 0-.8-.4-.7-.9z" fill="${bot}" ${o}/>` : "";
  const tx = f ? 7.2 : 6.4, tw = f ? 13.6 : 15.2, ax = f ? 4 : 3.2, ax2 = f ? 20 : 20.6;
  return `<svg class="pp" width="${Math.round(h * 28 / 48)}" height="${Math.round(h)}" viewBox="0 0 28 48" aria-hidden="true">
<ellipse cx="14" cy="46" rx="9" ry="2.2" fill="rgba(15,23,42,.2)"/>
<g class="legs">${legs}<ellipse cx="11" cy="44.3" rx="3" ry="1.5" fill="#fff" ${o}/><ellipse cx="17" cy="44.3" rx="3" ry="1.5" fill="#fff" ${o}/></g>
<rect x="${ax}" y="18.5" width="4" height="12" rx="2" fill="${top}" ${o}/><rect x="${ax2}" y="18.5" width="4" height="12" rx="2" fill="${top}" ${o}/>
<circle cx="${ax + 2}" cy="31" r="1.9" fill="${skin}"/><circle cx="${ax2 + 2}" cy="31" r="1.9" fill="${skin}"/>
${skirt}<rect x="${tx}" y="17" width="${tw}" height="${f ? 14 : 16.5}" rx="5" fill="${top}" ${o}/>
<rect x="11.5" y="15.2" width="5" height="3.5" rx="1.5" fill="${skin}"/>
${L.c === 1 || L.c === 4 ? `<path d="${CUTS[L.c]}" fill="${hair}"/>` : ""}<circle cx="14" cy="10" r="7" fill="${skin}" ${o}/>
<path d="${CUTS[L.c] || CUTS[0]}" fill="${hair}"${L.c === 5 ? ' opacity=".85"' : ""}/>
<circle cx="11.4" cy="11" r="1" fill="#1F2430"/><circle cx="16.6" cy="11" r="1" fill="#1F2430"/>
${f ? '<path d="M10.2 9.7l-.7-.6M17.8 9.7l.7-.6" stroke="#1F2430" stroke-width=".6" stroke-linecap="round"/>' : ""}
<path d="M12 13.9c1.2.9 2.8.9 4 0" fill="none" stroke="#1F2430" stroke-width=".8" stroke-linecap="round"/>${accSVG(L, party)}</svg>`;
}
// l'éditeur : genre, peau, cheveux, coupe, haut, bas, accessoire (le profil et le chat s'en servent)
function lookEditorHTML(L, party) {
  L = lookOf(ME, L);
  const row = (lbl, k, items) => `<div class="lkrow"><span>${lbl}</span><div>${items.map(([v, inner, title]) => `<button class="lksw${L[k] === v ? " on" : ""}" data-look="${k}:${v}" aria-label="${esc(title)}" title="${esc(title)}">${inner}</button>`).join("")}</div></div>`;
  const dot = c => `<i style="background:${c}"></i>`, head = (extra) => `<svg viewBox="4 0 20 18" width="26" height="24">${extra}</svg>`;
  const cuts = CUTS.map((d, i) => [i, head(`${i === 1 || i === 4 ? `<path d="${d}" fill="${LOOK.hair[L.h]}"/>` : ""}<circle cx="14" cy="10" r="7" fill="${LOOK.skin[L.s]}"/><path d="${d}" fill="${LOOK.hair[L.h]}"/>`), LOOK.cutN[i]]);
  const accs = LOOK.accN.map((n, i) => [i, i ? head(`<circle cx="14" cy="10" r="7" fill="${LOOK.skin[L.s]}"/><path d="${CUTS[L.c]}" fill="${LOOK.hair[L.h]}"/>${accSVG(Object.assign({}, L, { a: i }), party)}`) : "<em>—</em>", n]);
  return `<div class="lked"><div class="lkprev">${avatarSVG(L, party, 96)}</div><div class="lkrows">
    ${row("Je suis", "g", [[0, "<em>Un homme</em>", "Un homme"], [1, "<em>Une femme</em>", "Une femme"]])}
    ${row("Peau", "s", LOOK.skin.map((c, i) => [i, dot(c), "Peau " + (i + 1)]))}
    ${row("Cheveux", "h", LOOK.hair.map((c, i) => [i, dot(c), LOOK.hairN[i]]))}
    ${row("Coupe", "c", cuts)}
    ${row("Haut", "t", [[-1, dot(PARTIES[party]?.c || "#64748B"), "Couleur de mon parti"], ...LOOK.top.map((c, i) => [i, dot(c), "Haut " + (i + 1)])])}
    ${row(L.g === 1 ? "Jupe" : "Pantalon", "b", LOOK.bot.map((c, i) => [i, dot(c), (L.g === 1 ? "Jupe " : "Pantalon ") + (i + 1)]))}
    ${row("En plus", "a", accs)}
  </div></div>`;
}
// un toucher sur une pastille : on change tout de suite, on enregistre juste après
let lookSaveT = 0;
function lookPick(btn, root) {
  const p = ST.state?.profile; if (!p) return;
  const [k, v] = btn.dataset.look.split(":"); const L = Object.assign({}, lookOf(ME, p.look), { [k]: +v });
  p.look = L; ST.lookLocal = { L, at: Date.now() }; root.innerHTML = lookEditorHTML(L, p.party);
  const me = meP(); if (me) { me.look = L; window.people3d?.look(me.id, spec3d(me)); renderDock(); }
  const pv = $("#p-detail .lkwrap"); if (pv && pv !== root) pv.innerHTML = lookEditorHTML(L, p.party);
  clearTimeout(lookSaveT); lookSaveT = setTimeout(() => rpc("set_look", { p_look: L }).catch(e => toast(e.message, "bad")), 500);
}
document.addEventListener("click", e => { const b = e.target.closest("[data-look]"); if (b) { const root = b.closest(".lkwrap"); if (root) lookPick(b, root); } });

// les couleurs du personnage en 3D (models.js)
function spec3d(p) {
  const L = lookOf(p.id, p.look);
  return { g: L.g, skin: LOOK.skin[L.s] || LOOK.skin[0], hair: LOOK.hair[L.h] || LOOK.hair[0], cut: L.c, top: topColor(L, p.party), bot: LOOK.bot[L.b] || LOOK.bot[0], acc: L.a };
}

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
  opts: [], die: 0, rolling: false, run: null, rolls: 0 };   // le dé : les destinations proposées, le lancer en cours, la course en cours
const meP = () => W.people.get(W.me);
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
  $("#b-main")?.addEventListener("click", doRoll);
  $("#b-say")?.addEventListener("click", () => { if (!canSay()) return; const f = $("#wsay"); return f && !f.hidden ? closeSay() : openSay(); });
  $("#pawnoff")?.addEventListener("click", () => centerOnMe(true));
  // sur ordinateur, comme dans un jeu : Entrée pour parler, Échap pour fermer
  document.addEventListener("keydown", e => {
    if (e.key !== "Enter" || e.repeat || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.("input,textarea,select,button,a,[contenteditable]") || !canSay() || cur() !== "map" || document.querySelector("#plsheet, #onb:not([hidden]), #reveal:not([hidden])")) return;
    e.preventDefault(); openSay();
  });
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
  map.on("moveend", throttle(() => { updateCells(); updateVisible(); }, 450)); map.on("moveend", layoutChips);
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
    if (ST.state?.profile?.pend?.length) resumeRoll();   // un dé lancé, pas encore joué (page rechargée) : les mêmes destinations
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
  window.people3d?.ring(0, 0, 0, false);   // (l'anneau « à portée pour acheter » de la marche : plus utile avec le dé)
}
async function rejoin() {
  if (W.run || W.riding || W.rolling) return;
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
// Elle suit son personnage image par image quand il court ; partie de la vue d'ensemble des destinations du dé, elle revient
// en douceur, pendant la course, à la vue « derrière le perso » (proche, inclinée ; le cap ne change pas : la course est
// rapide). Faire glisser la carte la libère (on regarde ailleurs) ; la flèche « Vous » ou un nouveau lancer la remettent sur lui.
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
    v.zoom = L(r.z0, r.z1); v.pitch = L(r.p0, r.p1); v.padding = { top: L(r.pad0.top || 0, r.pad1.top), bottom: L(r.pad0.bottom || 0, 0), left: L(r.pad0.left || 0, 0), right: L(r.pad0.right || 0, 0) };
  }
  map.jumpTo(v);
}

// ---- qui est autour : par carrés d'environ 1 km (temps réel, sinon relu toutes les 2,5 s) ------
let cellQ = 0;
function queueCells(now) { clearTimeout(cellQ); cellQ = setTimeout(updateCells, now ? 0 : 400); }
function updateCells() {
  if (!W.on || !map) return;
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
  else if (e.k === "say") {
    if (id !== W.me && p && !W.chatOff) {
      say(p, d.t);
      const me = meP();   // le fil : ceux qu'on voit, ou à moins de 250 m (dans une foule, il ne déborde pas)
      if (p.vis || (me && mLL([me.lon, me.lat], [p.lon, p.lat]) < 250)) logSay(p, d.t);
    }
  }
  else if (e.k === "look") { if (p) { p.look = d.look; window.people3d?.look(p.id, spec3d(p)); } }
  else if (e.k === "leave") removePerson(id);
  else if (e.k === "kick" && id === W.me) { W.banned = true; renderDock(); closeSay(); toast(d.h ? `Vous êtes banni du chat pour ${d.h} h` : "Vous êtes banni du chat", "bad"); }
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
const pose = p => window.people3d?.pose(p.id, p.lon, p.lat, p.head, p.walk, p.vis && !p.gone);
// qui on montre : soi toujours ; les autres quand on est assez près (au plus 40, les plus proches du centre)
function updateVisible() {
  if (!map || !W.on) return;
  const z = map.getZoom(), c = map.getCenter(), ok = z >= 14.6 && mode === "all";
  const keep = new Set(ok ? [...W.people.values()].filter(p => p.id !== W.me).map(p => [mLL([c.lng, c.lat], [p.lon, p.lat]), p.id]).sort((a, b) => a[0] - b[0]).slice(0, 40).map(x => x[1]) : []);
  for (const p of W.people.values()) { const v = p.id === W.me || keep.has(p.id); if (v !== p.vis) { p.vis = v; pose(p); } }
  layoutPeople();
}
// suivre un trajet (les rues) en dur secondes ; sans durée : à la vitesse du jeu
function walkAlong(p, pts, dur) {
  if (!pts || pts.length < 2) return;
  pts = pts.map(q => [+q[0], +q[1]]); pts[0] = [p.lon, p.lat];   // on part d'où il est vraiment à l'écran
  const cum = pathLen(pts), L = cum[cum.length - 1];
  if (L < .5) { const e = pts[pts.length - 1]; p.lon = e[0]; p.lat = e[1]; stopPerson(p); return; }
  const c = W.cfg || { speed: 40, maxDur: 30 };
  setTrip(p, pts, cum, dur || Math.min(c.maxDur, Math.max(1, L / c.speed)), 0);
}
function followTrip(p, path, dur, el) {   // un trajet déjà commencé depuis el secondes
  const pts = path.map(q => [+q[0], +q[1]]), cum = pathLen(pts);
  if (el >= dur || cum[cum.length - 1] < .5) { const e = pts[pts.length - 1]; p.lon = e[0]; p.lat = e[1]; stopPerson(p); return; }
  setTrip(p, pts, cum, dur, el);
}
function setTrip(p, pts, cum, dur, el) { p.path = pts; p.cum = cum; p.seg = 1; p.dur = Math.max(.2, dur); p.t0 = performance.now() - el * 1000; p.walk = true; p.gone = false; startTick(); }
function stopPerson(p) { p.path = null; p.walk = false; pose(p); }
function hop(p, lon, lat) {   // le métro : on disparaît, on réapparaît là-bas
  p.path = null; p.walk = false; p.gone = true; pose(p); layoutPeople();
  setTimeout(() => { p.lon = lon; p.lat = lat; p.gone = false; pose(p); updateVisible(); }, 1600);
}
function startTick() { if (!W.raf) W.raf = requestAnimationFrame(worldTick); }
function worldTick() {
  W.raf = 0; if (document.hidden || cur() !== "map") return;   // reprend en revenant sur la carte (les positions dépendent de l'heure)
  const now = performance.now(); let any = false;
  for (const p of W.people.values()) {
    if (!p.path) continue;
    const f = Math.min(1, (now - p.t0) / (p.dur * 1000)), at = f * p.cum[p.cum.length - 1];
    let i = p.seg; if (i < 1 || p.cum[i - 1] > at) i = 1; while (i < p.path.length - 1 && p.cum[i] < at) i++; p.seg = i;
    const a = p.path[i - 1], b = p.path[i], k = (at - p.cum[i - 1]) / ((p.cum[i] - p.cum[i - 1]) || 1);
    p.lon = a[0] + (b[0] - a[0]) * k; p.lat = a[1] + (b[1] - a[1]) * k;
    const dx = (b[0] - a[0]) * KXP, dy = (b[1] - a[1]) * KYP; if (dx * dx + dy * dy > .01) p.head = Math.atan2(dx, dy);
    if (f >= 1) { p.path = null; p.walk = false; pose(p); if (p.id === W.me) arrived(); continue; }
    p.walk = true; pose(p); any = true;
    if (p.id === W.me) meStep(now, i);
  }
  if (any) W.raf = requestAnimationFrame(worldTick);
}
// pendant qu'on court : le trajet qui reste, la caméra qui suit
function meStep(now, i) {
  const me = meP(); camStep(me, now);
  if (now - W.stepT > 220) { W.stepT = now; drawRoute(me.path.slice(i), [me.lon, me.lat]); offMe(); }
}

// ---- les noms au-dessus des têtes, les bulles --------------------------------------
function drawLabel(p) {
  const box = $("#wpl"); if (!box) return;
  if (!p.el) { p.el = document.createElement("button"); p.el.className = "wp" + (p.id === W.me ? " me" : ""); p.el.dataset.id = p.id; p.el.innerHTML = '<span class="bub" hidden></span><span class="nm"></span>'; p.el.style.display = "none"; box.appendChild(p.el); }
  p.el.querySelector(".nm").innerHTML = p.id === W.me ? "Vous" : `<i style="background:${PARTIES[p.party]?.c || "#94A3B8"}"></i>${esc(p.pseudo || "?")}`;
  p.el.setAttribute("aria-label", p.id === W.me ? "Mon personnage" : (p.pseudo || "Joueur"));
}
// après chaque image de la carte : le nom suit la tête (calculé comme la 3D), la zone à toucher couvre le personnage
function layoutPeople() {
  if (!W.on || !map) return;
  const z = map.getZoom(), far = z < 13.6, cw = map.getContainer().clientWidth, ch = map.getContainer().clientHeight;
  for (const p of W.people.values()) {
    const el = p.el; if (!el) continue; const me = p.id === W.me;
    let show = p.vis && !p.gone && (me || z >= 15), x = 0, y = 0, h = 0;
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
  declutterMe(); layoutChips();
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
  if ((panelKind === "land" && innerWidth < 900) || me.gone || cur() !== "map" || mode !== "all") return hide();
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

// ---- le dé (21/10/2026) : lancer, choisir où aller (une petite flèche par destination), y courir, y tomber -------------
// le dé : un cube blanc vu de biais (le même que du temps du plateau), la face du dessus = le résultat
const PIPXY = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.27, .27], [.5, .5], [.73, .73]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]], 5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]] };
const DSIDE = { 1: [2, 3], 2: [1, 3], 3: [1, 2], 4: [1, 5], 5: [1, 3], 6: [2, 4] };
function dieSVG(top, size) {
  const [l, r] = DSIDE[top] || [1, 3];
  const face = (m, fill, n) => `<g transform="matrix(${m})"><rect x=".02" y=".02" width=".96" height=".96" rx=".2" fill="${fill}"/>${PIPXY[n].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".095" fill="#0B0C10"/>`).join("")}</g>`;
  return `<svg class="dsvg" viewBox="7 1.5 26 32" width="${size}" height="${size}" aria-hidden="true"><ellipse cx="20" cy="31" rx="10" ry="2" fill="rgba(0,0,0,.18)"/>${face("10.4,6,-10.4,6,20,4", "#FFFFFF", top)}${face("10.4,6,0,12,9.6,10", "#E4E9F3", l)}${face("10.4,-6,0,12,20,16", "#C9D3E6", r)}</svg>`;
}
// ce qui attend sur une destination : [sorte, texte de la flèche] (rose : on paie le loyer · vert : libre · bleu : chez soi · violet : « ? »)
function optKind(o) {
  if (o.chance) return ["q", o.pay > 0 ? "? −" + kE(o.pay) : "?"];
  if (o.pay > 0) return ["pay", "−" + kE(o.pay)];
  if (o.mine > 0) return ["mine", o.bonus > 0 ? "+" + kE(o.bonus) : "Chez vous"];
  if (o.free > 0) return ["free", "Libre"];
  return ["none", "Pris"];
}
const DST = { pay: 1, free: 2, mine: 3, q: 4, none: 5 };   // l'état « dst » des immeubles (map.js : leur couleur)
function optLabel(o) {
  const c = card(o.card), n = c ? title(c) : "Immeuble";
  return o.k[0] === "q" ? `${n} : carte Chance` : o.k[0] === "pay" ? `${n} : loyer à payer, ${fmtE(o.pay)}` : o.k[0] === "mine" ? `${n} : chez vous, bonus ${fmtE(o.bonus)}` : o.k[0] === "free" ? `${n} : libre, à acheter` : `${n} : déjà pris`;
}
let dieT = 0;
function animDie() {   // le dé roule dans le bouton (les faces changent), puis se pose
  const b = $("#b-main"), ico = $("#mainico"); b?.classList.add("rolling");
  return new Promise(res => { const t0 = performance.now(); clearInterval(dieT);
    dieT = setInterval(() => { if (ico) ico.innerHTML = dieSVG(1 + Math.floor(Math.random() * 6), 46); if (performance.now() - t0 > 640) { clearInterval(dieT); res(); } }, 80); });
}
function stopDie() { clearInterval(dieT); $("#b-main")?.classList.remove("rolling"); if ($("#b-main")) $("#b-main").dataset.k = ""; }
async function doRoll() {
  if (!W.on || W.rolling || W.run || W.riding || moving) return;
  hideHint();
  if (W.opts.length) return showOpts(true);   // déjà lancé : on revoit les destinations
  const p = ST.state?.profile; if (!p) return;
  if ((p.rolls ?? 0) <= 0 && rollWait() > 1) return buyRollsSheet();   // (le prochain lancer vient d'arriver : le serveur le sait)
  W.rolling = true; justBought = null; setMovebar(""); closeSheet(); closeSay(); renderDock(); sfx("dice");
  const anim = animDie();
  let r;
  try { r = await rpc("roll"); await anim; }
  catch (e) {
    W.rolling = false; stopDie(); renderDock(); const m = e.message || "";
    if (/Plus de lancers/.test(m)) { await refreshState().catch(() => { }); renderDock(); return buyRollsSheet(); }
    if (/Revenez/.test(m)) rejoin();
    return toast(m, "bad");
  }
  setState(r.state); W.rolling = false; stopDie(); W.die = r.die; W.rolls = (W.rolls || 0) + 1;
  await ensureCards(r.options.map(o => o.card)).catch(() => { });
  setOpts(r.die, r.options); renderWallet();
}
async function resumeRoll() {   // un dé lancé mais pas encore joué (page rechargée, métro refusé…) : les mêmes destinations
  if (!W.on || W.rolling || W.run || W.opts.length) return;
  try { const r = await rpc("roll"); setState(r.state); W.die = r.die; await ensureCards(r.options.map(o => o.card)).catch(() => { }); setOpts(r.die, r.options); renderWallet(); } catch (e) { }
}
function setOpts(die, opts) {
  clearOpts(); W.die = die; W.opts = opts.filter(o => card(o.card)).map(o => Object.assign({}, o, { k: optKind(o), cen: centerOf(o.card) }));
  if (!W.opts.length) return renderDock();
  document.body.classList.add("picking");
  if (mapReady) for (const o of W.opts) map.setFeatureState(Object.assign({ id: o.card }, BLD), { dst: DST[o.k[0]] });   // l'immeuble de la couleur de sa flèche
  let box = $("#dchips");
  if (!box) {
    box = document.createElement("div"); box.id = "dchips"; map.getContainer().appendChild(box);
    box.addEventListener("click", e => { const b = e.target.closest("[data-dgo]"); if (b) { e.stopPropagation(); pickOpt(+b.dataset.dgo); } });
  }
  // (le bouton se place autour du personnage ; la pastille dedans apparaît en grandissant : sa taille ne déplace pas le bouton)
  box.innerHTML = W.opts.map((o, i) => `<button class="dchip d-${o.k[0]}" data-dgo="${o.card}" style="--i:${i}" aria-label="${esc(optLabel(o))}"><span class="dcp"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M2.5 8h9.5M8 3.5 12.5 8 8 12.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg><b>${esc(o.k[1])}</b></span></button>`).join("");
  box.hidden = false; drawDst();
  renderDock(); showOpts(false); layoutChips();
  if (typeof tutTick === "function") tutTick();
}
function clearOpts(keep) {   // keep : la destination choisie reste en couleur jusqu'à l'arrivée
  if (mapReady) for (const o of W.opts) if (o.card !== keep) map.setFeatureState(Object.assign({ id: o.card }, BLD), { dst: 0 });
  W.opts = []; const box = $("#dchips"); if (box) { box.innerHTML = ""; box.hidden = true; }
  document.body.classList.remove("picking"); drawDst();
}
// les destinations sur la carte : un point de la couleur de leur flèche (on les voit aussi de loin) ; pendant le choix, les autres
// « ? » du jour s'effacent (le violet est celui de la flèche « ? »)
function drawDst() {
  if (!map || !mapReady) return;
  const data = FC(W.opts.map(o => ({ type: "Feature", properties: { g: o.card, k: o.k[0] }, geometry: { type: "Point", coordinates: o.cen } })));
  for (const l of ["wq-c", "wq-t"]) if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", W.opts.length ? "none" : "visible");
  const src = map.getSource("dst"); if (src) return src.setData(data);
  map.addSource("dst", { type: "geojson", data });
  map.addLayer({ id: "dst-c", type: "circle", source: "dst", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 6, 16, 9, 18, 12],
    "circle-color": ["match", ["get", "k"], "pay", "#E2557A", "free", "#16A34A", "mine", "#2563EB", "q", "#7C3AED", "#64748B"], "circle-stroke-color": "#fff", "circle-stroke-width": 3, "circle-pitch-alignment": "viewport" } },
    map.getLayer("people") ? "people" : undefined);
}
// la vue pour choisir : son personnage au milieu de la zone libre (entre les barres du haut et le dock), un peu dézoomé et moins
// incliné, assez pour voir les immeubles proposés (pas plus loin que le zoom 15 : les flèches disent où ils sont)
function freeBand() {
  const c = map.getContainer().getBoundingClientRect(), mid = c.top + c.height / 2;
  const rs = s => [...document.querySelectorAll(s)].map(e => e.getBoundingClientRect()).filter(r => r.height > 0 && r.width > 0);
  const top = Math.max(c.top + 50, ...rs("#bar,#credbar,#filter,.maptop>*").filter(r => r.bottom < mid).map(r => r.bottom)) - c.top;
  const bot = Math.min(c.bottom - 50, ...rs("#dicebar,#tabs").filter(r => r.top > mid).map(r => r.top)) - c.top;
  return { top, bot, w: c.width, h: c.height };
}
function showOpts(again) {
  const me = meP(); if (!me || !W.opts.length || !map) return;
  const b = freeBand(), P = b.top + b.bot - b.h;   // le point visé au milieu de la bande libre
  const R = Math.max(90, ...W.opts.map(o => mLL([me.lon, me.lat], o.cen)));
  const half = Math.max(80, Math.min(b.w / 2 - 40, (b.bot - b.top) / 2 - 46));
  const z = Math.log2(40075016.686 * Math.cos(me.lat * Math.PI / 180) / (512 * R * 1.3 / half));
  CAM.on = true; hidePreviewOnly();
  map.easeTo({ center: [me.lon, me.lat], zoom: Math.max(15, Math.min(camZoom(), z)), pitch: 40, padding: { top: Math.max(0, P), bottom: Math.max(0, -P), left: 0, right: 0 }, duration: again ? 450 : 750, essential: true });
}
// les flèches autour de son personnage, chacune vers son immeuble (à l'écran) ; deux flèches trop proches s'écartent
function layoutChips() {
  const box = $("#dchips"); if (!box || box.hidden || !W.opts.length || !map) return;
  const me = meP(); if (!me) return;
  const s = window.people3d?.screen(me.id), q0 = map.project([me.lon, me.lat]);
  const cx = s ? s.hx : q0.x, cy = s ? (s.hy + s.fy) / 2 : q0.y - 14, h = s ? s.fy - s.hy : 28;
  const R = Math.max(innerWidth < 700 ? 54 : 62, h / 2 + 26), RX = R + 14;
  const ang = W.opts.map(o => { const q = map.project(o.cen); return Math.atan2(q.y - cy, q.x - cx); });
  const pos = ang.slice(), n = pos.length, MIN = .9;   // (radians, ~52°)
  for (let it = 0; it < 12; it++) {
    const ord = pos.map((a, i) => i).sort((i, j) => pos[i] - pos[j]); let moved = false;
    for (let k = 0; k < n; k++) {
      const i = ord[k], j = ord[(k + 1) % n]; let d = pos[j] - pos[i]; if (k === n - 1) d += 2 * Math.PI;
      if (n > 1 && d < MIN) { const m = (MIN - d) / 2; pos[i] -= m; pos[j] += m; moved = true; }
    }
    if (!moved) break;
  }
  [...box.children].forEach((el, i) => {
    const a = pos[i]; if (a == null) return;
    el.style.transform = `translate(${(cx + Math.cos(a) * RX).toFixed(1)}px,${(cy + Math.sin(a) * R).toFixed(1)}px) translate(-50%,-50%)`;
    const svg = el.querySelector("svg"); if (svg) svg.style.transform = `rotate(${ang[i].toFixed(3)}rad)`;
  });
}
// toucher une flèche, ou l'immeuble de sa couleur : son personnage y court par les rues (quelques secondes), la caméra suit
async function pickOpt(g) {
  const o = W.opts.find(x => x.card === g), me = meP();
  if (!o || !me || W.run || W.rolling || W.riding) return;
  hideHint();
  const to = o.cen, plan = W.G ? planW(W.G, [me.lon, me.lat], to, true) : null;
  let pts = plan ? plan.pts : [[me.lon, me.lat], to];
  if (mLL(pts[pts.length - 1], to) > 80) pts = fitPath([...pts, to]);   // (le serveur veut finir devant l'immeuble)
  const cum = pathLen(pts), len = cum[cum.length - 1], c = W.cfg || {};
  const dur = Math.min(c.runMax || 7, Math.max(c.runMin || 2.5, len / (c.runSpeed || 70)));
  const from = { lon: me.lon, lat: me.lat };
  clearOpts(g); moving = true;
  W.run = { g, t0: performance.now(), dur, z0: map.getZoom(), z1: camZoom(), p0: map.getPitch(), p1: camPitch(camZoom()), pad0: map.getPadding(), pad1: camPad() };
  CAM.on = true; map.stop();
  setTrip(me, pts, cum, dur, 0); drawRoute(pts); renderDock();
  const run = W.run;
  run.wait = rpc("dice_go", { p_card: g, p_path: pts }).then(r => {
    run.res = r;
    // le serveur a pris un autre trajet (tout droit) ou une autre durée : on suit le sien à partir d'ici
    if (W.run === run && me.path && (r.path?.length !== pts.length || Math.abs(r.dur - dur) > .05)) {
      const el = (performance.now() - run.t0) / 1000, left = Math.max(.4, r.dur - el);
      if (r.path?.length !== pts.length) walkAlong(me, r.path, left); else { const f = Math.min(1, el / dur); me.dur = r.dur; me.t0 = performance.now() - f * r.dur * 1000; }
      run.dur = Math.max(run.dur, el + left);
    }
    return r;
  }).catch(e => {
    if (W.run !== run) return null;
    W.run = null; moving = false; me.lon = from.lon; me.lat = from.lat; stopPerson(me); drawRoute(null);
    if (mapReady) map.setFeatureState(Object.assign({ id: g }, BLD), { dst: 0 });
    const m = e.message || ""; toast(m, "bad");
    if (/Revenez/.test(m)) rejoin(); else resumeRoll();
    renderDock(); return null;
  });
}
// arrivé au bout de sa course : ce qui s'est passé là (salaire, loyer payé, bonus, carte Chance), sa case s'ouvre
async function arrived() {
  const me = meP(), run = W.run; drawRoute(null); offMe();
  if (!run) return;   // (un trajet repris après un rechargement)
  if (CAM.on && map && cur() === "map" && !map.isMoving()) map.jumpTo({ center: [me.lon, me.lat], zoom: run.z1, pitch: run.p1, padding: run.pad1 });
  const r = run.res || await run.wait;
  if (W.run !== run) return;
  W.run = null; moving = false;
  if (mapReady) map.setFeatureState(Object.assign({ id: run.g }, BLD), { dst: 0 });
  renderDock(); queueCells(true);
  if (!r) return;
  setState(r.state); renderWallet();
  const L = r.landing; lastLanding = L; justBought = null; landCredit = null;
  if (L.chance) { W.taken.add(L.card); renderQ(); }
  if (L.salary > 0) moneyPop(L.salary);
  sfx(L.toll > 0 ? "bad" : "coin");
  await ensureCards([L.card]).catch(() => { });
  showLand(L);
  if (L.chance?.extra || ["booster", "bonne", "cle"].includes(L.chance?.k)) Promise.all([refreshHold(), refreshMap()]).then(() => { paintAll(); if (panelKind === "land") showLand(L); }).catch(() => { });
  if (typeof tutTick === "function") tutTick();
}
// toucher un immeuble, un monument ou le repère d'une station : une destination du dé, on y va ; sinon sa case (on regarde)
function worldTapAt(g) {
  if (W.opts.some(o => o.card === g)) return pickOpt(g);
  if (W.opts.length || W.run || W.rolling) return;   // (en train de choisir : on choisit une flèche)
  worldTapCard(g);
}
// toucher la carte ailleurs : le point d'une destination du dé, on y va ; sinon rien (plus de marche libre)
function worldMapClick(e) {
  if (!W.on || !W.opts.length || !map.getLayer("dst-c")) return false;
  const p = e.point, box = [[p.x - 10, p.y - 10], [p.x + 10, p.y + 10]];   // (un peu plus large que le point : on le touche au doigt)
  const q = map.queryRenderedFeatures(box, { layers: ["dst-c"] }).map(f => +f.properties.g).find(g => W.opts.some(o => o.card === g));
  if (q != null) { pickOpt(q); return true; }
  return false;
}
async function worldTapCard(g) {
  await ensureCards([g]); if (!card(g)) return;
  hideHint(); justBought = null; landCredit = null; showLand(null, g);
}
// les boutons de la case : là où l'on est tombé, une station : « Prendre le métro »
function worldLandBtns(g, view) {
  if (!W.on || !W.G || view) return "";
  return W.G.st.has(g) ? `<button class="btn block light" data-wmetro="${g}">🚇 Prendre le métro</button>` : "";
}
function moneyPop(n) {   // « +20 000 € » qui monte sous l'argent : le salaire du lancer
  const m = $("#bar .money"); if (!m || !n) return; const r = m.getBoundingClientRect(); if (!r.width) return;
  const el = document.createElement("div"); el.className = "mpop num"; el.textContent = "+" + fmtE(n);
  el.style.left = (r.left + r.width / 2) + "px"; el.style.top = (r.bottom + 2) + "px"; document.body.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}
// plus de lancers : le prochain dans combien de temps, ou 5 de plus contre l'argent du jeu
const rollWait = () => Math.max(0, (ST.state?.roll_in || 0) - (performance.now() - ST.stAt) / 1000);
function buyRollsSheet() {
  const price = ST.state?.rolls_price || 50000, m = Math.max(1, Math.ceil(rollWait() / 60));
  sheet(`<b class="plst">🎲 Plus de lancers</b><p class="plp">Le prochain dans ${m} min</p><button class="btn block buy" data-brolls ${liveCash() < price ? "disabled" : ""}><span>5 lancers · ${fmtE(price)}</span></button>`,
    async b => {
      const x = b.closest("[data-brolls]"); if (!x || x.disabled) return; x.disabled = true;
      try { setState(await rpc("buy_rolls")); closeSheet(); renderWallet(); toast("5 lancers en plus !", "good"); sfx("coin"); }
      catch (e) { x.disabled = false; toast(e.message, "bad"); }
    });
}

// ---- le bas de l'écran : le dé au milieu (choix du propriétaire, 21/10/2026), « Parler » à côté, les boosters de l'autre côté ----
const canSay = () => W.on && !W.chatOff && !W.banned;
function renderDock() {
  const b = $("#b-main"); if (!b) return;
  const p = ST.state?.profile, me = meP();
  if (me && p && (me.party !== p.party || me.pseudo !== p.pseudo)) { me.party = p.party; me.pseudo = p.pseudo; window.people3d?.look(me.id, spec3d(me)); }
  const left = p?.rolls ?? 0, pick = W.opts.length > 0, wait = rollWait();
  if (!W.rolling) { const face = W.die || 5, k = "d" + face; if (b.dataset.k !== k) { b.dataset.k = k; $("#mainico").innerHTML = dieSVG(face, 46); } }
  const n = $("#rollsn"), t = left > 0 ? String(left) : wait > 0 ? Math.max(1, Math.ceil(wait / 60)) + " min" : "…";
  if (n && n.textContent !== t) n.textContent = t;
  b.classList.toggle("empty", left <= 0 && !pick); b.classList.toggle("pick", pick); b.classList.toggle("busy", !!W.run);
  const al = pick ? "Revoir les destinations" : left > 0 ? `Lancer le dé (${left} lancer${left > 1 ? "s" : ""})` : `Plus de lancers : le prochain dans ${Math.max(1, Math.ceil(wait / 60))} min`;
  if (b.getAttribute("aria-label") !== al) b.setAttribute("aria-label", al);
  if (left <= 0 && wait <= 0 && p && !W.rsT) W.rsT = setTimeout(() => { W.rsT = 0; refreshState().then(renderDock).catch(() => { }); }, 2000);   // le lancer est revenu
  const s = $("#b-say"); if (s && s.hidden === canSay()) s.hidden = !canSay();
  sayBadge();
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
  clearOpts();   // un dé lancé et pas joué : le serveur le rend (ses destinations étaient autour de l'ancienne station)
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

// ---- parler, couper le chat --------------------------------------------------------
function openSay() {
  if (!W.on || W.chatOff || W.banned) return;
  let f = $("#wsay");
  if (!f) {   // (21/10/2026, « l'onglet du chat prend une ampleur démesurée ») : une seule petite barre, « envoyer » dedans
    f = document.createElement("form"); f.id = "wsay"; f.autocomplete = "off"; f.hidden = true;
    f.innerHTML = `<input id="wsq" maxlength="120" placeholder="Dire quelque chose…" enterkeyhint="send" aria-label="Message"><button class="go" aria-label="Envoyer"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>`;
    document.body.appendChild(f);
    f.addEventListener("submit", e => { e.preventDefault(); sendSay(); });
    const q = f.querySelector("#wsq");
    q.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); closeSay(); } });
    // le clavier se ferme ou l'on touche ailleurs sans avoir rien écrit : la barre s'en va (ce qu'on a écrit, lui, reste)
    q.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== q && !q.value.trim()) closeSay(); }, 180));
    f.querySelector(".go").addEventListener("pointerdown", e => e.preventDefault());   // (toucher « envoyer » ne ferme pas le clavier)
  }
  f.hidden = false; document.body.classList.add("saying"); $("#wsq").focus(); sayHint();
  W.unread = 0; renderLog();
}
function closeSay() { const f = $("#wsay"); if (f) f.hidden = true; document.body.classList.remove("saying"); $("#wsq")?.blur(); clearTimeout(W.sayHT); renderLog(); }
// le fil des messages (21/10/2026, choix du propriétaire) : ce que les gens autour ont dit, à relire en ouvrant « Parler » ;
// une pastille sur « Parler » compte ce qu'on n'a pas encore lu
function logSay(p, t) {
  if (!p || !t) return;
  (W.log = W.log || []).push({ id: p.id, who: p.id === W.me ? "Vous" : p.pseudo || "?", party: p.party, t: String(t).slice(0, 120) });
  if (W.log.length > 40) W.log.splice(0, W.log.length - 40);
  if (p.id !== W.me && $("#wsay")?.hidden !== false) W.unread = (W.unread || 0) + 1;
  renderLog();
}
function sayBadge() {
  const open = $("#wsay")?.hidden === false, n = W.unread || 0, nb = $("#saynb");
  if (nb) { nb.hidden = !n || open || !canSay(); nb.textContent = n > 9 ? "9+" : n; }
  return open;
}
function renderLog() {   // les 5 derniers messages, seulement s'il y en a d'autres que les siens (les siens sont dans sa bulle)
  const open = sayBadge();
  let el = $("#wlog"); const items = (W.log || []).slice(-5);
  if (!open || !items.some(m => m.id !== W.me)) { if (el) el.hidden = true; return; }
  if (!el) { el = document.createElement("div"); el.id = "wlog"; el.setAttribute("aria-live", "polite"); document.body.appendChild(el); }
  el.innerHTML = items.map(m => `<p${m.id === W.me ? ' class="me"' : ""}><b>${m.id === W.me ? "" : `<i style="background:${PARTIES[m.party]?.c || "#94A3B8"}"></i>`}${esc(m.who)}</b>${esc(m.t)}</p>`).join("");
  el.hidden = false; el.scrollTop = el.scrollHeight;
}
// un message par minute (21/10/2026, choix du propriétaire : « less is more ») : la barre affiche le temps qui reste
const sayWait = () => Math.max(0, Math.ceil(((W.saidAt || 0) + 60000 - Date.now()) / 1000));
function sayHint() {
  const q = $("#wsq"); if (!q) return; const s = sayWait();
  q.placeholder = s ? `Prochain message dans ${s} s` : "Dire quelque chose…";
  $("#wsay")?.classList.toggle("wait", s > 0);
  clearTimeout(W.sayHT); if (s && $("#wsay")?.hidden === false) W.sayHT = setTimeout(sayHint, 1000);
}
async function sendSay() {
  const q = $("#wsq"), t = (q?.value || "").replace(/\s+/g, " ").trim(); if (!t) return closeSay();
  if (sayWait()) return toast(`Doucement : un message par minute (encore ${sayWait()} s).`, "bad");   // (le texte reste dans la barre)
  q.value = "";
  try { await rpc("world_say", { p_text: t }); W.saidAt = Date.now(); say(meP(), t.slice(0, 120)); logSay(meP(), t); closeSay(); }   // (son message est dans sa bulle : la barre s'en va)
  catch (e) {
    const m = e.message || "";
    if (/Revenez/.test(m)) { q.value = t; return rejoin(); }
    if (/banni/i.test(m)) { W.banned = true; renderDock(); closeSay(); }
    if (/Doucement/.test(m)) { q.value = t; const s = +(m.match(/encore (\d+) s/) || [])[1]; if (s) { W.saidAt = Date.now() - (60 - s) * 1000; sayHint(); } }
    toast(m, "bad");
  }
}
// le profil : « ne plus voir les messages des joueurs » (on ne parle plus non plus)
async function setChatOff(off) {
  try { await rpc("set_chat_off", { p_off: !!off }); } catch (e) { return toast(e.message, "bad"); }
  W.chatOff = !!off; if (ST.state?.profile) ST.state.profile.chat_off = W.chatOff;
  if (off) { closeSay(); for (const p of W.people.values()) { clearTimeout(p.bt); p.bt = 0; const b = p.el?.querySelector(".bub"); if (b) b.hidden = true; } }
  renderDock();
}

// ---- les fenêtres du monde (qui est-ce, mon personnage, payer des km) ---------------------
// toucher quelqu'un : son nom, son parti et ce qu'il vend, en petites cartes (21/10/2026, demande du propriétaire : « voir ses biens
// en vente avec des cartes minimalistes, et un accès vers sa boutique ») ; un toucher ouvre la fiche du bien (acheter l'annonce,
// proposer de racheter) ; « Voir sa boutique » : ses annonces et sa collection (pages.js, playerShopPage). La fenêtre s'ouvre tout de
// suite, les cartes arrivent juste après.
function openWho(id) {
  const p = W.people.get(id); if (!p) return; const pr = PARTIES[p.party];
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
  sheet(`<b class="plst">Mon personnage</b><div class="lkwrap">${lookEditorHTML(lookOf(ME, p.look), p.party)}</div>`);
}
function sheet(html, onClick) {
  closeSheet();
  const s = document.createElement("div"); s.id = "plsheet";
  s.innerHTML = `<div class="plsb"><button class="plsx" aria-label="Fermer">×</button>${html}</div>`;
  s.addEventListener("click", e => { if (e.target === s || e.target.closest(".plsx")) return closeSheet(); onClick?.(e.target); });
  document.body.appendChild(s);
}
function closeSheet() { $("#plsheet")?.remove(); }
