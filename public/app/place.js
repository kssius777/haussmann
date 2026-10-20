"use strict";
// =====================================================================
//  Le personnage (pseudo au-dessus, bulles quand on parle) et le monde ouvert où il se promène (essai dans le 7e, plus bas).
//  Le chat du Champ-de-Mars (20/10/2026) est devenu ce monde : mêmes bulles, mêmes salles, même temps réel.
//  Entrée : tuile « Balade » en bas à gauche sur téléphone (miroir des boosters), 5e onglet sur ordinateur.
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
  p.look = L; root.innerHTML = lookEditorHTML(L, p.party);
  const me = PL.people.get(PL.me); if (me) { me.look = L; drawPerson(me); renderPlaceHead(); }
  const pv = $("#p-detail .lkwrap"); if (pv && pv !== root) pv.innerHTML = lookEditorHTML(L, p.party);
  clearTimeout(lookSaveT); lookSaveT = setTimeout(() => rpc("set_look", { p_look: L }).catch(e => toast(e.message, "bad")), 500);
}
document.addEventListener("click", e => { const b = e.target.closest("[data-look]"); if (b) { const root = b.closest(".lkwrap"); if (root) lookPick(b, root); } });

// =====================================================================
//  Le monde ouvert, essai dans le 7e (20/10/2026, demande du propriétaire : « on peut se déplacer dans la map en cliquant…
//  on cible le 7e, mets ça au niveau de l'onglet chat ») : il remplace le chat du Champ-de-Mars (mêmes bulles, mêmes salles).
//  On touche une rue : le personnage y va par les rues (plan public/data/walk7.json, trajet calculé ici) ; quelques km offerts
//  par jour, ensuite on paie au km. On touche un immeuble : sa case, « Y aller » ; arrivé devant, on peut l'acheter.
//  Une station : on y va, puis « Prendre le métro » vers les autres stations de la zone. Serveur : migration_monde.sql.
// =====================================================================
const KXP = 111320 * Math.cos(48.856 * Math.PI / 180), KYP = 110574;   // mètres par degré
// le Champ-de-Mars : on y marche aussi sur la pelouse, en ligne droite (comme l'ancien chat)
const LAWN = [[2.29193, 48.85769], [2.29199, 48.85778], [2.29554, 48.85983], [2.2969, 48.85904], [2.3035, 48.85413], [2.30247, 48.85023], [2.30138, 48.85096]];
const worldCam = () => ({ zoom: innerWidth < 900 ? 16.5 : 16.9, pitch: 55, bearing: -28 });
function inPolyLL(poly, x, y) {
  let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
const onLawn = (lon, lat) => inPolyLL(LAWN, lon, lat);

// ---- le plan pour marcher ---------------------------------------------------------
const WD = { g: null, p: null };
function loadWorld() {
  if (WD.g) return Promise.resolve(WD.g);
  return WD.p || (WD.p = (async () => {
    const d = await getJSON(DATA + "walk7.json?v=" + DATA_V);
    const pts = decodeRing(d.n), N = pts.length, X = new Float64Array(N), Y = new Float64Array(N);
    pts.forEach((p, i) => { X[i] = p[0] * KXP; Y[i] = p[1] * KYP; });
    const adj = Array.from({ length: N }, () => []), C = 60, grid = new Map();
    for (let k = 0; k < d.e.length; k += 2) {
      const a = d.e[k], b = d.e[k + 1], w = Math.hypot(X[a] - X[b], Y[a] - Y[b]);
      adj[a].push(b, w); adj[b].push(a, w);
      const i0 = Math.floor(Math.min(X[a], X[b]) / C), i1 = Math.floor(Math.max(X[a], X[b]) / C), j0 = Math.floor(Math.min(Y[a], Y[b]) / C), j1 = Math.floor(Math.max(Y[a], Y[b]) / C);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const key = i * 100000 + j; let l = grid.get(key); if (!l) grid.set(key, l = []); l.push(a, b); }
    }
    // le métro : chaque station, ses lignes, ses voisines (pour le trajet dessiné)
    const st = new Map();
    for (const [line, seq] of Object.entries(d.metro || {})) seq.forEach((g, i) => {
      if (!st.has(g)) st.set(g, { lines: [], nb: [] });
      const o = st.get(g); o.lines.push(line); if (i > 0) o.nb.push([seq[i - 1], line]); if (i < seq.length - 1) o.nb.push([seq[i + 1], line]);
    });
    return (WD.g = { pts, X, Y, adj, grid, C, zone: d.zone, bounds: d.bounds, metro: d.metro || {}, st });
  })());
}
// le point de rue le plus proche (projeté sur le tronçon), à moins de maxM mètres
function snapW(G, lon, lat, maxM = 320) {
  const x = lon * KXP, y = lat * KYP, ci = Math.floor(x / G.C), cj = Math.floor(y / G.C); let best = null;
  for (let r = 0; r <= Math.ceil(maxM / G.C) + 1; r++) {
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
      const l = G.grid.get(i * 100000 + j); if (!l) continue;
      for (let k = 0; k < l.length; k += 2) {
        const a = l[k], b = l[k + 1], dx = G.X[b] - G.X[a], dy = G.Y[b] - G.Y[a], L2 = dx * dx + dy * dy;
        const t = L2 ? Math.max(0, Math.min(1, ((x - G.X[a]) * dx + (y - G.Y[a]) * dy) / L2)) : 0, qx = G.X[a] + t * dx, qy = G.Y[a] + t * dy, d = Math.hypot(x - qx, y - qy);
        if (!best || d < best.d) best = { a, b, x: qx, y: qy, d };
      }
    }
    if (best && best.d <= r * G.C) break;
  }
  return best && best.d <= maxM ? best : null;
}
// le plus court chemin dans les rues entre deux points de rue (Dijkstra)
function routeW(G, s, t) {
  const N = G.pts.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), H = [];
  const push = (d, n) => { H.push([d, n]); let i = H.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (H[q][0] <= H[i][0]) break; [H[q], H[i]] = [H[i], H[q]]; i = q; } };
  const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return top; };
  const d0 = (n, p) => Math.hypot(G.X[n] - p.x, G.Y[n] - p.y);
  for (const n of [s.a, s.b]) { const d = d0(n, s); if (d < dist[n]) { dist[n] = d; prev[n] = -2; push(d, n); } }
  const goal = new Map([[t.a, d0(t.a, t)], [t.b, d0(t.b, t)]]); let best = Infinity, bestN = -1;
  while (H.length) {
    const [d, n] = pop(); if (d > dist[n]) continue; if (d >= best) break;
    if (goal.has(n) && d + goal.get(n) < best) { best = d + goal.get(n); bestN = n; }
    const A = G.adj[n]; for (let k = 0; k < A.length; k += 2) { const m = A[k], nd = d + A[k + 1]; if (nd < dist[m]) { dist[m] = nd; prev[m] = n; push(nd, m); } }
  }
  const P = p => [p.x / KXP, p.y / KYP];
  const same = (s.a === t.a && s.b === t.b) || (s.a === t.b && s.b === t.a), direct = same ? Math.hypot(s.x - t.x, s.y - t.y) : Infinity;
  if (direct <= best) return { len: direct, pts: [P(s), P(t)] };
  if (bestN < 0) return null;
  const nodes = []; for (let n = bestN; n >= 0; n = prev[n]) nodes.push(n);
  return { len: best, pts: [P(s), ...nodes.reverse().map(n => G.pts[n]), P(t)] };
}
const mLL = (a, b) => Math.hypot((b[0] - a[0]) * KXP, (b[1] - a[1]) * KYP);
// le trajet complet : de là où l'on est jusqu'au point touché (par les rues ; sur la pelouse du Champ-de-Mars, tout droit)
function planW(G, from, to, toBuilding) {
  if (onLawn(...from) && onLawn(...to)) return { len: mLL(from, to), pts: [from, to] };
  const s = snapW(G, ...from, 600), t = snapW(G, ...to, toBuilding ? 320 : 120);
  if (!s || !t) return null;
  const r = routeW(G, s, t); if (!r) return null;
  const pts = r.pts.slice(); let len = r.len;
  if (mLL(from, pts[0]) > 1.5) { len += mLL(from, pts[0]); pts.unshift(from); }
  const end = [t.x / KXP, t.y / KYP];
  if (!toBuilding && (t.d <= 35 || onLawn(...to))) { len += mLL(end, to); pts.push(to); }   // jusqu'au trottoir touché, ou sur la pelouse
  return { len, pts: simplifyW(pts, 1.2).slice(0, 380) };
}
function simplifyW(pts, tol) {   // Douglas-Peucker (mètres)
  if (pts.length < 3) return pts;
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
const pathLen = pts => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + mLL(pts[i - 1], pts[i])); return c; };

// ---- l'état -------------------------------------------------------------------
const PL = { on: false, room: 0, me: null, admin: false, people: new Map(), last: 0, seen: new Set(), ch: null, rt: false,
  poll: 0, ping: 0, list: 0, raf: 0, saved: null, feeding: false, cfg: null, w: null, target: null, mv: 0, G: null };
const MAPI = ["dragPan", "scrollZoom", "boxZoom", "dragRotate", "keyboard", "doubleClickZoom", "touchZoomRotate", "touchPitch"];
const MAP_FREE = new Set(["dragPan", "scrollZoom", "touchZoomRotate"]);   // dans le monde : glisser et zoomer, pas tourner ni pencher
function lockMap(on, prev) {
  if (on) {
    const was = {}; for (const k of MAPI) { const h = map[k]; if (!h) continue; was[k] = h.isEnabled(); if (MAP_FREE.has(k)) h.enable(); else h.disable(); }
    map.touchZoomRotate?.disableRotation?.(); return was;
  }
  map.touchZoomRotate?.enableRotation?.();
  for (const k of MAPI) { const h = map[k]; if (!h) continue; if (!prev || prev[k]) h.enable(); else h.disable(); }
}
function placeLimits(on) {   // la zone de l'essai (posée une fois la caméra arrivée), puis les limites d'avant en sortant
  if (on) { PL.saved.lim = { min: map.getMinZoom(), max: map.getMaxZoom(), b: map.getMaxBounds() }; map.setMaxBounds(PL.G.bounds); map.setMinZoom(14.6); map.setMaxZoom(18.6); return; }
  const l = PL.saved?.lim; if (!l) return; map.setMaxBounds(l.b || null); map.setMinZoom(l.min); map.setMaxZoom(l.max); PL.saved.lim = null;
}
const kmTxt = km => { const k = Math.round(km * 10) / 10; return k.toLocaleString("fr-FR", { minimumFractionDigits: k % 1 ? 1 : 0, maximumFractionDigits: 1 }) + " km"; };
const distTxt = m => m < 950 ? Math.max(10, Math.round(m / 10) * 10) + " m" : kmTxt(m / 1000);
// ce que coûterait un trajet de len mètres (0 tant qu'il reste des km offerts)
function walkCost(len) {
  const c = PL.cfg, w = PL.w; if (!c || !w) return 0;
  const f = km => Math.max(0, km - c.freeKm) * c.kmPrice;
  return Math.ceil(f(w.km + len / 1000) - f(w.km));
}

// ---- entrer, sortir -----------------------------------------------------------
async function openPlace() {
  if (PL.on || !map || !mapReady) return;
  if (typeof moving !== "undefined" && moving) return toast("Attendez la fin du trajet", "bad");
  if (tab !== "map") go("map");
  if (panelKind) { justBought = null; setMovebar(""); }
  if (typeof clearDest === "function" && document.body.classList.contains("picking")) clearDest();
  PL.on = true; PL.people.clear(); PL.seen.clear(); PL.last = 0; PL.target = null;
  document.body.classList.add("inplace", "inworld");
  PL.saved = { ctl: lockMap(true), cam: { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() } };
  window.pawn3d?.hide();
  buildPlaceUI();
  try {
    const [G, j] = await Promise.all([loadWorld(), rpc("world_join")]);
    if (!PL.on) { rpc("chat_leave").catch(() => { }); return; }
    PL.G = G; PL.room = j.room; PL.me = j.me; PL.admin = !!j.admin; PL.last = j.last || 0; PL.cfg = j.cfg; PL.w = j.w;
    const pos = j.pos || [j.w.lon, j.w.lat];
    syncPeople(j.people);
    const me = PL.people.get(PL.me); if (me) { me.lon = pos[0]; me.lat = pos[1]; me.path = null; }
    map.flyTo(Object.assign(worldCam(), { center: pos, duration: 1100 }));
    listen(); renderPlaceHead(); drawZone();
    PL.ping = setInterval(placePing, 25000); PL.list = setInterval(placeList, 30000);
    map.once("moveend", () => { if (PL.on) { placeLimits(true); placeLayout(); } });
  } catch (e) { toast(e.message, "bad"); closePlace(true); }
}
function closePlace(noLeave) {
  if (!PL.on) return; PL.on = false;
  if (!noLeave) rpc("chat_leave").catch(() => { });
  stopListen(); clearInterval(PL.ping); clearInterval(PL.list); cancelAnimationFrame(PL.raf); PL.raf = 0;
  for (const p of PL.people.values()) clearTimeout(p.bt);
  $("#place")?.remove(); $("#plsheet")?.remove();
  if (panelKind) { justBought = null; setMovebar(""); }
  document.body.classList.remove("inplace", "inworld");
  placeLimits(false); lockMap(false, PL.saved?.ctl); drawRoute(null); drawZone(true);
  PL.people.clear(); PL.seen.clear(); PL.target = null;
  // la montgolfière est là où l'on s'est arrêté pour la dernière fois (immeuble, station) : elle revient, et la carte va sur elle
  refreshState().catch(() => { }).finally(async () => {
    await placePawn(false); const g = pawnPos();
    if (g != null) { const v = pawnView(); map.flyTo({ center: centerOf(g), zoom: v.zoom, pitch: v.pitch, bearing: 0, offset: v.offset, duration: 900 }); }
    else if (PL.saved?.cam) map.flyTo(Object.assign({}, PL.saved.cam, { duration: 900 }));
    renderWallet();
  });
}
async function rejoin() {
  if (!PL.on) return;
  try {
    const j = await rpc("world_join");
    const moved = j.room !== PL.room; PL.room = j.room; PL.last = Math.max(PL.last, j.last || 0); PL.w = j.w;
    syncPeople(j.people); if (moved) listen(); renderPlaceHead();
  } catch (e) { toast(e.message, "bad"); closePlace(true); }
}

// ---- recevoir : temps réel, sinon toutes les 2 s ----------------------------------
function listen() {
  stopListen();
  PL.poll = setInterval(placeFeed, 2000);
  if (LOCAL_MODE || !SB) return;
  const room = PL.room;
  (async () => {
    try { const { data } = await SB.auth.getSession(); if (data.session) SB.realtime.setAuth(data.session.access_token); } catch (e) { }
    if (!PL.on || PL.room !== room) return;
    PL.ch = SB.channel("place:cdm:" + room, { config: { private: true } })
      .on("broadcast", { event: "ev" }, ({ payload }) => placeEvent(payload))
      .subscribe(st => {
        if (!PL.on) return;
        if (st === "SUBSCRIBED") { PL.rt = true; clearInterval(PL.poll); PL.poll = setInterval(placeFeed, 10000); }
        else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") { PL.rt = false; clearInterval(PL.poll); PL.poll = setInterval(placeFeed, 2000); }
      });
  })();
}
function stopListen() { clearInterval(PL.poll); PL.poll = 0; if (PL.ch) { try { SB.removeChannel(PL.ch); } catch (e) { } PL.ch = null; } PL.rt = false; }
async function placeFeed() {
  if (!PL.on || PL.feeding) return; PL.feeding = true;
  try { const f = await rpc("chat_feed", { p_since: PL.last }); if (f.gone) await rejoin(); else for (const e of f.ev) placeEvent(e); }
  catch (e) { } finally { PL.feeding = false; }
}
async function placePing() { if (!PL.on) return; try { await rpc("chat_ping"); } catch (e) { if (/Revenez/.test(e.message)) rejoin(); } }
async function placeList() { if (!PL.on) return; try { syncPeople(await rpc("chat_people")); } catch (e) { } }
function placeEvent(e) {
  if (!PL.on || !e || PL.seen.has(e.e)) return;
  PL.seen.add(e.e); if (e.e > PL.last) PL.last = e.e;
  if (PL.seen.size > 600) PL.seen = new Set([...PL.seen].slice(-300));
  const id = e.u, d = e.d || {}, p = PL.people.get(id);
  if (e.k === "join") upsertPerson(d);
  else if (e.k === "move") { if (id === PL.me) return; if (!p) return placeList(); if (d.metro) hop(p, d.lon, d.lat); else walkAlong(p, d.path || [[p.lon, p.lat], [d.lon, d.lat]], d.dur); }
  else if (e.k === "say") { if (id === PL.me) return; if (p) say(p, d.t); else placeList(); }
  else if (e.k === "look") { if (p) { p.look = d.look; drawPerson(p); } }
  else if (e.k === "leave") removePerson(id);
  else if (e.k === "kick") {
    if (id === PL.me) { toast(d.h ? "Vous avez été banni du chat pour " + d.h + " h" : "Vous avez été banni du chat", "bad"); closePlace(true); }
    else removePerson(id);
  }
}

// ---- les gens -----------------------------------------------------------------
function syncPeople(list) {
  const ids = new Set((list || []).map(p => p.id));
  for (const d of list || []) upsertPerson(d);
  for (const id of [...PL.people.keys()]) if (!ids.has(id) && id !== PL.me) removePerson(id);
}
function upsertPerson(d) {
  if (!d?.id) return; let p = PL.people.get(d.id);
  if (!p) { p = { id: d.id, pseudo: d.pseudo, party: d.party, look: d.look, lon: d.lon, lat: d.lat, el: null, face: 1, path: null }; PL.people.set(d.id, p); drawPerson(p); }
  else {
    p.pseudo = d.pseudo; p.party = d.party;
    if (JSON.stringify(p.look || null) !== JSON.stringify(d.look || null)) { p.look = d.look; drawPerson(p); }
    if (d.id !== PL.me && !p.path && mLL([p.lon, p.lat], [d.lon, d.lat]) > 2) walkAlong(p, [[p.lon, p.lat], [d.lon, d.lat]]);
  }
  renderPlaceHead(); placeLayout();
}
function removePerson(id) { const p = PL.people.get(id); if (!p) return; clearTimeout(p.bt); p.el?.remove(); PL.people.delete(id); renderPlaceHead(); }
function drawPerson(p) {
  const L = $("#plL"); if (!L) return; const me = p.id === PL.me, L0 = lookOf(p.id, p.look);
  if (!p.el) { p.el = document.createElement("button"); p.el.className = "av" + (me ? " me" : ""); p.el.dataset.id = p.id; p.el.innerHTML = `<span class="avi"><span class="bub" hidden></span><span class="nm"></span>${me ? '<span class="ring"></span>' : ""}<span class="bd"></span></span>`; L.appendChild(p.el); }
  p.el.querySelector(".nm").innerHTML = `<i style="background:${PARTIES[p.party]?.c || "#94A3B8"}"></i>${esc(me ? "Vous" : p.pseudo || "?")}`;
  p.el.querySelector(".bd").innerHTML = avatarSVG(L0, p.party, 48);
  p.el.setAttribute("aria-label", me ? "Mon personnage" : (p.pseudo || "Joueur"));
  placeLayout();
}
// suivre un trajet (les rues) en dur secondes ; sans durée : à la vitesse du jeu
function walkAlong(p, pts, dur) {
  if (!pts || pts.length < 2) return;
  pts = pts.slice(); pts[0] = [p.lon, p.lat];   // on part d'où l'on est vraiment à l'écran
  const cum = pathLen(pts), L = cum[cum.length - 1];
  if (L < .5) { p.lon = pts[pts.length - 1][0]; p.lat = pts[pts.length - 1][1]; p.path = null; placeLayout(); return; }
  const c = PL.cfg || { speed: 40, maxDur: 30 };
  p.path = pts; p.cum = cum; p.t0 = performance.now(); p.dur = dur || Math.min(c.maxDur, Math.max(1, L / c.speed)); p.gone = false;
  startTick();
}
function hop(p, lon, lat) {   // le métro : on disparaît, on réapparaît là-bas
  p.path = null; p.gone = true; placeLayout();
  setTimeout(() => { p.lon = lon; p.lat = lat; p.gone = false; placeLayout(); }, 1600);
}
function startTick() { if (!PL.raf) PL.raf = requestAnimationFrame(placeTick); }
function placeTick(ts) {
  PL.raf = 0; if (!PL.on) return; let any = false;
  for (const p of PL.people.values()) {
    if (!p.path) { p.walk = false; continue; }
    const f = Math.min(1, (ts - p.t0) / (p.dur * 1000)), L = p.cum[p.cum.length - 1], at = f * L;
    let i = 1; while (i < p.path.length - 1 && p.cum[i] < at) i++;
    const a = p.path[i - 1], b = p.path[i], k = (at - p.cum[i - 1]) / ((p.cum[i] - p.cum[i - 1]) || 1);
    p.lon = a[0] + (b[0] - a[0]) * k; p.lat = a[1] + (b[1] - a[1]) * k;
    const sa = map.project(a), sb = map.project(b); if (Math.abs(sb.x - sa.x) > 1) p.face = sb.x < sa.x ? -1 : 1;
    p.walk = f < 1; any = true;
    if (f >= 1) { p.path = null; p.walk = false; if (p.id === PL.me) arrived(); }
    else if (p.id === PL.me && ts - (PL.rt0 || 0) > 220) { PL.rt0 = ts; drawRoute(p.path.slice(i), [p.lon, p.lat]); follow(p, ts); }
  }
  placeLayout();
  if (any) PL.raf = requestAnimationFrame(placeTick);
}
// la caméra suit son personnage quand il s'approche du bord (jamais pendant qu'on fait glisser la carte)
function follow(p, ts) {
  if (map.isMoving() || ts - (PL.ft || 0) < 1500) return;
  const s = map.project([p.lon, p.lat]), W = innerWidth, H = innerHeight;
  if (s.x > W * .15 && s.x < W * .85 && s.y > H * .28 && s.y < H * .78) return;
  PL.ft = ts; const end = p.path?.[p.path.length - 1], mid = end ? [(p.lon + end[0]) / 2, (p.lat + end[1]) / 2] : [p.lon, p.lat];
  map.easeTo({ center: mLL([p.lon, p.lat], mid) < 250 ? mid : [p.lon, p.lat], duration: 1100 });
}
// à l'écran : plus loin (plus haut) = plus petit ; hors de l'écran = caché
function placeLayout() {
  if (!PL.on || !map) return;
  const H = innerHeight, W = innerWidth, z = map.getZoom();
  const base = (W < 900 ? 1.3 : 1.55) * Math.max(.5, Math.min(1.5, Math.pow(2, (z - worldCam().zoom) * .65)));
  for (const p of PL.people.values()) {
    if (!p.el) continue; const s = map.project([p.lon, p.lat]);
    const off = p.gone || s.x < -60 || s.x > W + 60 || s.y < -20 || s.y > H + 160;
    p.el.style.display = off ? "none" : ""; if (off) continue;
    const k = base * (.66 + .42 * Math.max(0, Math.min(1, s.y / H)));
    p.el.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px)`;
    p.el.style.setProperty("--k", k.toFixed(3)); p.el.style.setProperty("--f", p.face || 1);
    p.el.style.zIndex = 10 + Math.round(s.y);
    p.el.classList.toggle("walk", !!p.walk);
    if (p.el.querySelector(".bub:not([hidden])")) clampBubble(p);
  }
}
function say(p, t) {
  if (!p?.el || !t) return; const b = p.el.querySelector(".bub");
  b.textContent = t; b.hidden = false; b.classList.remove("out"); void b.offsetWidth; b.classList.add("pop");
  clampBubble(p); clearTimeout(p.bt);
  p.bt = setTimeout(() => { b.classList.add("out"); p.bt = setTimeout(() => { b.hidden = true; b.classList.remove("out", "pop"); }, 400); }, Math.min(9000, 3800 + t.length * 50));
}
function clampBubble(p) {
  const b = p.el.querySelector(".bub"); b.style.setProperty("--dx", "0px");
  const r = b.getBoundingClientRect(), m = 8; let dx = 0;
  if (r.left < m) dx = m - r.left; else if (r.right > innerWidth - m) dx = innerWidth - m - r.right;
  if (dx) b.style.setProperty("--dx", dx / (parseFloat(p.el.style.getPropertyValue("--k")) || 1) + "px");
}

// ---- le trajet dessiné sur la carte, la zone de l'essai ----------------------------------------
function drawRoute(pts, head) {
  if (!map) return; const src = map.getSource("wroute");
  if (!pts) { src?.setData(FC([])); return; }
  const line = head ? [head, ...pts] : pts;
  const data = FC([{ type: "Feature", properties: { k: "l" }, geometry: { type: "LineString", coordinates: line } }, { type: "Feature", properties: { k: "e" }, geometry: { type: "Point", coordinates: line[line.length - 1] } }]);
  if (src) return src.setData(data);
  map.addSource("wroute", { type: "geojson", data });
  map.addLayer({ id: "wroute-c", type: "line", source: "wroute", filter: ["==", ["get", "k"], "l"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 9, "line-opacity": .9 } });
  map.addLayer({ id: "wroute", type: "line", source: "wroute", filter: ["==", ["get", "k"], "l"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#2563EB", "line-width": 4.5, "line-dasharray": [1.1, 1.3] } });
  map.addLayer({ id: "wroute-e", type: "circle", source: "wroute", filter: ["==", ["get", "k"], "e"], paint: { "circle-radius": 7, "circle-color": "#2563EB", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
}
function drawZone(off) {   // le bord de la zone : un trait discret (au-delà, on ne marche pas encore)
  if (!map) return; const src = map.getSource("wzone");
  if (off) { src?.setData(FC([])); return; }
  const z = PL.G?.zone; if (!z) return;
  const data = FC([{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: z.concat([z[0]]) } }]);
  if (src) return src.setData(data);
  map.addSource("wzone", { type: "geojson", data });
  map.addLayer({ id: "wzone", type: "line", source: "wzone", paint: { "line-color": "#2563EB", "line-width": 2.5, "line-opacity": .55, "line-dasharray": [2, 2] } }, map.getLayer("anchor-top") ? "anchor-top" : undefined);
}

// ---- marcher ------------------------------------------------------------------
const meP = () => PL.people.get(PL.me);
// toucher la carte (pas un immeuble) : on y va par les rues
function placeClick(e) {
  if (!PL.on || e.defaultPrevented) return;
  if (map.queryRenderedFeatures(e.point).some(f => /^(bd|rf)\d|^mfill$/.test(f.layer.id))) return;   // un immeuble : worldTapCard s'en occupe
  if (panelKind) { justBought = null; setMovebar(""); return; }   // une case ouverte : le toucher la ferme
  const ll = [e.lngLat.lng, e.lngLat.lat];
  walkTo(ll, null);
}
// partir vers un point (target : l'immeuble ou la station visé, qu'on ouvre en arrivant)
async function walkTo(ll, target, pay) {
  const me = meP(); if (!me || !PL.G) return;
  if (!inPolyLL(PL.G.zone, ll[0], ll[1])) return toast("Pour l'essai, on reste dans le 7e", "bad");
  const plan = planW(PL.G, [me.lon, me.lat], ll, target != null);
  if (!plan) return toast("Pas de rue par là", "bad");
  if (plan.len < 3 && target != null) { PL.target = target; return arrived(); }
  const cost = walkCost(plan.len);
  if (cost > 0 && !pay) return askPay(plan.len, cost, () => walkTo(ll, target, true));
  const h = $("#place .plhint"); if (h) { h.remove(); try { localStorage.setItem("hm_whint", "1"); } catch (er) { } }
  PL.target = target; const mv = ++PL.mv, before = { lon: me.lon, lat: me.lat };
  walkAlong(me, plan.pts); drawRoute(plan.pts);
  try {
    const r = await rpc("world_move", { p_lon: plan.pts[plan.pts.length - 1][0], p_lat: plan.pts[plan.pts.length - 1][1], p_len: Math.round(plan.len), p_path: plan.pts, p_pay: !!pay });
    if (mv !== PL.mv) return;
    PL.w = r.w; renderPlaceHead();
    if (me.path && Math.abs(me.dur - r.dur) > .3) { const f = (performance.now() - me.t0) / (me.dur * 1000); me.dur = r.dur; me.t0 = performance.now() - f * r.dur * 1000; }
    if (r.cost > 0 || r.back > 0) refreshState().then(() => renderWallet?.()).catch(() => { });
  } catch (e) {
    if (mv !== PL.mv) return;
    const m = /PAYER:(\d+)/.exec(e.message || "");
    me.path = null; me.lon = before.lon; me.lat = before.lat; drawRoute(null); PL.target = null; placeLayout();
    if (m) return askPay(plan.len, +m[1], () => walkTo(ll, target, true));
    if (/Revenez/.test(e.message)) return rejoin();
    toast(e.message, "bad");
  }
}
// arrivé : si l'on visait un immeuble ou une station, on s'y arrête (on peut l'acheter) et sa case s'ouvre
async function arrived() {
  drawRoute(null); const g = PL.target; PL.target = null; if (g == null || !PL.on) return;
  try { setState(await rpc("world_arrive", { p_card: g })); await ensureCards([g]); justBought = null; landCredit = null; showLand(null, g); }
  catch (e) { toast(e.message, "bad"); }
}
// toucher un immeuble, un monument ou une station : sa case (vue), avec « Y aller » ; déjà devant : on peut l'acheter
async function worldTapCard(g) {
  if (!PL.on || !PL.G) return; await ensureCards([g]);
  const me = meP(); if (!me) return;
  if (here(g) && !me.path) { try { setState(await rpc("world_arrive", { p_card: g })); } catch (e) { } }
  justBought = null; landCredit = null; showLand(null, g);
}
// à portée de l'immeuble (comme le serveur le compte)
function here(g) {
  const c = card(g), me = meP(); if (!c || !me) return false;
  const reach = c.lk === "p" && !isStation(g) ? PL.cfg?.reachBig || 250 : PL.cfg?.reach || 90;   // une station : comme un immeuble
  return mLL([me.lon, me.lat], centerOf(g)) <= reach - 5;
}
// les boutons de la case dans le monde : « Y aller » (pas encore devant), « Prendre le métro » (devant une station)
function worldLandBtns(g, view) {
  if (!PL.on || !PL.G) return "";
  if (view) {
    const me = meP(); if (!me) return "";
    const plan = planW(PL.G, [me.lon, me.lat], centerOf(g), true);
    if (!plan || !inPolyLL(PL.G.zone, ...centerOf(g))) return `<div class="farbuy">Hors de la zone de l'essai (7e).</div>`;
    const cost = walkCost(plan.len);
    return `<button class="btn block buy wgo" data-wgo="${g}" data-pay="${cost > 0 ? 1 : ""}"><span>🚶 Y aller · ${distTxt(plan.len)}${cost > 0 ? ` · ${fmtE(cost)}` : ""}</span></button>`;
  }
  return PL.G.st.has(g) ? `<button class="btn block light" data-wmetro="${g}">🚇 Prendre le métro</button>` : "";
}
function askPay(len, cost, go) {
  sheet(`<b class="plst">Plus de km offerts aujourd'hui</b><p class="plp">Ce trajet : ${distTxt(len)}</p><button class="btn block buy" data-wpay><span>Payer ${fmtE(cost)}</span></button>`,
    b => { if (b.closest("[data-wpay]")) { closeSheet(); go(); } });
}
// le métro : toutes les stations de la zone, un ticket
function metroSheet(from) {
  const G = PL.G, c = PL.cfg; if (!G) return;
  const rows = Object.entries(G.metro).map(([line, seq]) => `<div class="mtl"><i class="lnb${LINE_DARK.has(line) ? " dk" : ""}" style="--lc:${LINE_C[line]};--ls:24px">${line}</i><div>${seq.map(g => {
    const s = spotOf(g), nm = (s?.[5] || "").replace(/^Métro /, "");
    return g === from ? `<span class="mts here">${esc(nm)}</span>` : `<button class="mts" data-wride="${g}">${esc(nm)}</button>`;
  }).join("")}</div></div>`).join("");
  sheet(`<b class="plst">Prendre le métro · ${fmtE(c?.ticket || 0)}</b><div class="mtls">${rows}</div>`, b => { const x = b.closest("[data-wride]"); if (x) { closeSheet(); ride(from, +x.dataset.wride); } });
}
// le trajet en métro (de station en station, changements compris) : pour le dessin
function metroPath(from, to) {
  const G = PL.G, prev = new Map([[from, null]]), q = [from];
  while (q.length) { const g = q.shift(); if (g === to) break; for (const [n] of G.st.get(g)?.nb || []) if (!prev.has(n)) { prev.set(n, g); q.push(n); } }
  const out = []; for (let g = to; g != null; g = prev.get(g)) out.unshift(g); return out[0] === from ? out : [from, to];
}
async function ride(from, to) {
  const me = meP(); if (!me) return;
  let r; try { r = await rpc("world_metro", { p_to: to }); } catch (e) { return toast(e.message, "bad"); }
  setState(r.state); PL.w = r.w; renderPlaceHead(); renderWallet?.(); if (panelKind) { justBought = null; setMovebar(""); }
  await ensureCards(metroPath(from, to));
  const stops = metroPath(from, to), line = stops.map(g => spotOf(g) ? [spotOf(g)[3], spotOf(g)[4]] : centerOf(g));
  drawRoute(line); me.path = null; me.gone = true; placeLayout(); sfx?.("dice");
  const dest = line[line.length - 1];
  map.flyTo({ center: dest, zoom: worldCam().zoom, duration: 1400 + 450 * stops.length, essential: true });
  await sleep(1400 + 450 * stops.length);
  me.lon = dest[0]; me.lat = dest[1]; me.gone = false; drawRoute(null); placeLayout();
  toast(`Station ${(spotOf(to)?.[5] || "").replace(/^Métro /, "")}`, "good");
}

// ---- l'écran ------------------------------------------------------------------
function buildPlaceUI() {
  $("#place")?.remove();
  const el = document.createElement("div"); el.id = "place";
  el.innerHTML = `<div id="plL"></div>
    <header class="plh"><button class="plx" data-plx aria-label="Quitter le monde">${ICON.back}</button><div><b id="plt">7e arrondissement</b><small><i></i><span id="pln">…</span></small></div>
      <span class="plkm" id="plkm" title="Km offerts aujourd'hui"></span><button class="plme" data-pllook aria-label="Mon personnage"></button></header>
    ${(() => { try { return localStorage.getItem("hm_whint") ? "" : '<div class="plhint">Touchez une rue pour marcher</div>'; } catch (e) { return ""; } })()}
    <button class="plloc" data-plloc aria-label="Revenir sur mon personnage"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></button>
    <form class="plin" id="plin" autocomplete="off"><input id="plq" maxlength="120" placeholder="Dire quelque chose…" enterkeyhint="send" aria-label="Message"><button aria-label="Envoyer"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button></form>`;
  document.body.appendChild(el);
  el.addEventListener("click", e => {
    if (e.target.closest("[data-plx]")) return closePlace();
    if (e.target.closest("[data-pllook]")) return openLookSheet();
    if (e.target.closest("[data-plloc]")) { const me = meP(); if (me) map.easeTo({ center: [me.lon, me.lat], duration: 600 }); return; }
    const a = e.target.closest(".av"); if (a) { e.stopPropagation(); return a.dataset.id === PL.me ? openLookSheet() : openWho(a.dataset.id); }
  });
  $("#plin").addEventListener("submit", e => { e.preventDefault(); sendSay(); });
  const vv = window.visualViewport;
  if (vv && !PL.vvOn) { PL.vvOn = true; const f = () => { const kb = Math.max(0, innerHeight - vv.height - vv.offsetTop); $("#place")?.style.setProperty("--kb", kb + "px"); }; vv.addEventListener("resize", f); vv.addEventListener("scroll", f); }
}
function renderPlaceHead() {
  const n = $("#pln"); if (!n) return;
  const k = PL.people.size; n.textContent = `${k} joueur${k > 1 ? "s" : ""} ici`;
  const km = $("#plkm"), w = PL.w, c = PL.cfg;
  if (km && w && c) { const left = Math.max(0, Math.floor((c.freeKm - w.km) * 10 + 1e-6) / 10); km.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="13" cy="4" r="2.2"/><path d="M9.5 21l2.2-6.4 2.8 2.6V21h2v-5l-2.6-2.6.8-3.4c1 1.3 2.6 2.1 4.3 2.1v-2c-1.4 0-2.6-.8-3.2-1.9l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L7 7.5V12h2V8.9l1.6-.6L8.3 21z"/></svg>${left > 0 ? kmTxt(left) : fmtE(c.kmPrice) + "/km"}`; km.classList.toggle("out", left <= 0); }
  const b = $("#place .plme"), p = ST.state?.profile; if (b && p) b.innerHTML = avatarSVG(lookOf(ME, p.look), p.party, 34);
}
async function sendSay() {
  const q = $("#plq"), t = (q?.value || "").replace(/\s+/g, " ").trim(); if (!t) return;
  q.value = "";
  try { await rpc("chat_say", { p_text: t }); say(meP(), t.slice(0, 120)); }
  catch (e) { if (/Revenez/.test(e.message)) { rejoin(); q.value = t; return; } toast(e.message, "bad"); if (/Doucement/.test(e.message)) q.value = t; }
}
// toucher quelqu'un : son nom et son parti ; l'admin peut le bannir
function openWho(id) {
  const p = PL.people.get(id); if (!p) return; const pr = PARTIES[p.party];
  sheet(`<div class="plwho">${pr ? emblemSVG(p.party, 40) : ""}<div><b>${esc(p.pseudo || "?")}</b><span>${pr ? esc(pr.n) : "Sans parti"}</span></div></div>
    ${PL.admin ? `<div class="plban"><button class="btn block light" data-ban="24">Bannir 24 h</button><button class="btn block danger" data-ban="0">Bannir à vie</button></div>` : ""}`,
    async b => {
      const x = b.closest("[data-ban]"); if (!x) return;
      if (!x.dataset.sure) { x.dataset.sure = "1"; x.dataset.lbl = x.textContent; x.textContent = "Sûr ? Touchez encore"; setTimeout(() => { if (x.isConnected) { delete x.dataset.sure; x.textContent = x.dataset.lbl; } }, 3000); return; }
      try { await rpc("chat_ban", { p_user: id, p_hours: x.dataset.ban === "0" ? null : 24 }); toast(`${p.pseudo} est banni${x.dataset.ban === "0" ? " à vie" : " 24 h"}`, "good"); removePerson(id); closeSheet(); }
      catch (e) { toast(e.message, "bad"); }
    });
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

function initPlace() {
  if (!map) return;
  map.on("click", placeClick);
  map.on("move", () => { if (PL.on) placeLayout(); });
  addEventListener("resize", () => { if (PL.on) placeLayout(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && PL.on) placePing(); });
  // la case dans le monde : « Y aller », « Prendre le métro »
  document.addEventListener("click", e => {
    if (!PL.on) return;
    const go = e.target.closest("[data-wgo]");
    if (go) { const g = +go.dataset.wgo, pay = !!go.dataset.pay; justBought = null; setMovebar(""); return walkTo(centerOf(g), g, pay); }
    const mt = e.target.closest("[data-wmetro]"); if (mt) return metroSheet(+mt.dataset.wmetro);
  });
}
