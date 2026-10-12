"use strict";
// =====================================================================
//  Cartes : photo ou dessin de façade, carte « plaque de rue »
// =====================================================================
const artCache = new Map();
function phStyle(c) { const [a, n] = c.ph; return `background-image:url(${atlasURL(a)});background-size:500% 800%;background-position:${(n % 5) * 25}% ${Math.floor(n / 5) * (100 / 7)}%`; }
// les photos de rue automatiques (Panoramax) sont souvent ratées : on garde le dessin pour elles
const goodPhoto = c => c.ph && !/anoramax/.test(c.cr || "");
function photo(c) {
  if (goodPhoto(c)) return `<div class="img" style="${phStyle(c)}" role="img" aria-label="Photo de ${esc(title(c))}"></div>`;
  try { return maquetteSVG(c); } catch (e) { return facadeSVG(c); }   // la vraie forme de l'immeuble ; à défaut, sa façade dessinée
}
// Façade dessinée fidèle à l'immeuble : époque, hauteur, largeur, usage
function eraOf(c) {
  const y = +c.y || 0;
  if (!y) return (c.h || 0) >= 38 ? "beton" : "hauss";
  if (y < 1800) return "ancien";
  if (y < 1915) return "hauss";
  if (y < 1945) return "brique";
  if (y < 1980) return "beton";
  return "contemp";
}
function facadeSVG(c) {
  const key = "f2" + c.g; if (artCache.has(key)) return artCache.get(key);
  const r = rng("fa" + c.g), pick = a => a[Math.floor(r() * a.length)], era = eraOf(c), rel = c.u === "rel";
  const shop = c.u === "com" || (era !== "beton" && era !== "contemp" && r() < .5);
  const maxEt = { ancien: 6, hauss: 8, brique: 9, beton: 14, contemp: 9 }[era];
  const et = Math.max(2, Math.min(maxEt, c.et2 || Math.round((c.h || 15) / 3)));
  const cols = Math.max(era === "ancien" ? 2 : 3, Math.min(8, Math.round(Math.sqrt(c.a || 250) / (era === "ancien" ? 4.6 : 4))));
  const W = 400, H = 300, G = 268;
  // largeur dessinée selon la largeur réelle (immeuble étroit = façade étroite)
  const BW = Math.min(340, Math.max(150, cols * 52)), X0 = (W - BW) / 2, X1 = X0 + BW, cw = BW / cols;
  const roofH = { ancien: 34, hauss: 30, brique: 10, beton: 6, contemp: 8 }[era];
  const fhMax = era === "beton" ? 19 : 27, top = Math.max(18 + roofH, G - (et + .4) * Math.min(fhMax, (G - 40 - roofH) / (et + .4)));
  const fh = (G - top) / (et + .4), gh = fh * 1.4, gy = G - gh;
  const P = {
    ancien: { wall: pick(["#ECDDBE", "#E7D2A6", "#EFE4CC", "#E3CDB0", "#F0D9B5"]), line: "#CDB894", win: "#56636B", shut: pick(["#5E7D6A", "#8797A2", "#6E8A9A", "#9C5B45"]) },
    hauss: { wall: pick(["#EADFCB", "#E6D8C0", "#EFE5D3", "#E2D3BA"]), line: "#D3C3A6", win: "#5A6B78" },
    brique: { wall: pick(["#B9694E", "#C17A5A", "#A85C46", "#CB9467"]), line: "#F1E7D8", win: "#4F5F6B" },
    beton: { wall: pick(["#D3D5D6", "#C9CCCE", "#DCDAD3", "#CFC9BE"]), line: "#B6B8B9", win: "#5D7181" },
    contemp: { wall: pick(["#F2F3F1", "#ECEDEA", "#E4E7E8"]), line: "#C9CED1", win: "#6F96AE", acc: pick(["#B98D62", "#7E8F86", "#C26E4E", "#3F4A55"]) }
  }[era];
  let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="sk${c.g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CFE0EA"/><stop offset="1" stop-color="#F3EEE6"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#sk${c.g})"/>`;
  // voisins, plus pâles
  const nb = era === "beton" || era === "contemp" ? "#E3E1DC" : "#E6DCCD";
  s += `<rect x="-10" y="${Math.min(G - 60, top + 26)}" width="${X0 + 12}" height="${G}" fill="${nb}"/><rect x="${X1 - 2}" y="${Math.min(G - 60, top + 40)}" width="${W}" height="${G}" fill="${nb}" opacity=".9"/>`;
  if (rel) {
    const st = "#E7DCC6", ln = "#CDBB9B";
    s += `<rect x="${W / 2 - 110}" y="70" width="220" height="${G - 70}" fill="${st}"/><polygon points="${W / 2 - 120},74 ${W / 2},26 ${W / 2 + 120},74" fill="${st}" stroke="${ln}" stroke-width="2"/>`;
    s += `<circle cx="${W / 2}" cy="122" r="30" fill="#7D6B9C" stroke="${ln}" stroke-width="5"/><circle cx="${W / 2}" cy="122" r="11" fill="#C9A44C"/><path d="M${W / 2 - 26} ${G}V${G - 56}a26 26 0 0152 0V${G}z" fill="#3E3328"/>`;
    for (const dx of [-80, 80]) s += `<path d="M${W / 2 + dx - 12} ${G - 30}V${G - 84}a12 12 0 0124 0V${G - 30}z" fill="#6E7F8C"/>`;
    s += `<rect x="0" y="${G}" width="${W}" height="${H - G}" fill="#D2CABD"/></svg>`; artCache.set(key, s); return s;
  }
  s += `<rect x="${X0}" y="${top}" width="${BW}" height="${G - top}" fill="${P.wall}"/>`;
  // ---- toit
  if (era === "ancien") {
    s += `<polygon points="${X0 - 6},${top} ${X1 + 6},${top} ${X1 - 10},${top - roofH} ${X0 + 10},${top - roofH}" fill="${pick(["#B5654A", "#A9583F", "#8F9CA7"])}"/>`;
    for (let i = 0; i < Math.max(1, cols - 1); i++) { const x = X0 + BW * (i + 1) / cols - 9; s += `<rect x="${x}" y="${top - roofH + 8}" width="18" height="${roofH - 12}" fill="${P.wall}"/><rect x="${x + 4}" y="${top - roofH + 12}" width="10" height="${roofH - 19}" fill="${P.win}"/><polygon points="${x - 2},${top - roofH + 9} ${x + 9},${top - roofH + 1} ${x + 20},${top - roofH + 9}" fill="#8A4A36"/>`; }
    s += `<rect x="${X0 + 14}" y="${top - roofH - 14}" width="16" height="16" fill="#C4A27E"/>`;
  } else if (era === "hauss") {
    s += `<polygon points="${X0 - 4},${top} ${X1 + 4},${top} ${X1 - 12},${top - roofH} ${X0 + 12},${top - roofH}" fill="#8F9CA7"/>`;
    for (let i = 0; i < cols; i++) { const x = X0 + cw * i + cw * .3; s += `<rect x="${x}" y="${top - roofH + 6}" width="${cw * .4}" height="${roofH - 8}" fill="#F2EEE7"/><rect x="${x + 3}" y="${top - roofH + 10}" width="${cw * .4 - 6}" height="${roofH - 15}" fill="#647684"/>`; }
    for (const cx of [X0 + 24, X1 - 44]) s += `<rect x="${cx}" y="${top - roofH - 12}" width="18" height="14" fill="#B79E80"/>`;
    s += `<rect x="${X0 - 5}" y="${top - 4}" width="${BW + 10}" height="6" fill="${P.line}"/>`;
  } else if (era === "brique") {
    s += `<rect x="${X0 - 4}" y="${top - roofH}" width="${BW + 8}" height="${roofH}" fill="#E9DFCF"/><rect x="${X0 + 20}" y="${top - roofH - 10}" width="${BW - 40}" height="10" fill="#8FA08A" opacity=".8"/>`;
  } else s += `<rect x="${X0 - 3}" y="${top - roofH}" width="${BW + 6}" height="${roofH}" fill="${era === "contemp" ? P.acc : "#B8BBBC"}"/>`;
  // ---- étages
  const bay = era === "brique" && cols >= 4 ? Math.floor(cols / 2) : -1;   // bow-window central des années 30
  for (let f = 0; f < et; f++) {
    const y0 = top + f * fh;
    if (era === "beton") {
      s += `<rect x="${X0 + 8}" y="${y0 + fh * .2}" width="${BW - 16}" height="${fh * .55}" fill="${P.win}"/><rect x="${X0 + 8}" y="${y0 + fh * .2}" width="${BW - 16}" height="${fh * .15}" fill="#90A6B6"/>`;
      for (let i = 1; i < cols * 2; i++) s += `<rect x="${X0 + 8 + (BW - 16) * i / (cols * 2) - .8}" y="${y0 + fh * .2}" width="1.6" height="${fh * .55}" fill="#E7EAEC"/>`;
      if (f % 2 === 1) s += `<rect x="${X0 + 4}" y="${y0 + fh * .74}" width="${BW - 8}" height="${fh * .1}" fill="#A9ADAF"/>`;
      continue;
    }
    if (era === "contemp") {
      for (let i = 0; i < cols; i++) { const big = r() < .45, x = X0 + cw * i + cw * (big ? .08 : .2), w = cw * (big ? .84 : .6);
        s += `<rect x="${x}" y="${y0 + fh * .14}" width="${w}" height="${fh * .74}" fill="${P.win}"/><polygon points="${x},${y0 + fh * .14} ${x + w * .45},${y0 + fh * .14} ${x},${y0 + fh * .6}" fill="#A9C4D4" opacity=".7"/>`;
        if (big && r() < .5) s += `<rect x="${x}" y="${y0 + fh * .66}" width="${w}" height="${fh * .22}" fill="none" stroke="#3F4A55" stroke-width="1.5"/>`; }
      if (r() < .35) s += `<rect x="${X0 + cw * Math.floor(r() * cols)}" y="${y0}" width="${cw}" height="${fh}" fill="${P.acc}" opacity=".85"/>`;
      continue;
    }
    if (era !== "brique") s += `<rect x="${X0}" y="${y0 + fh - 2}" width="${BW}" height="2" fill="${P.line}"/>`;
    for (let i = 0; i < cols; i++) {
      const jit = era === "ancien" ? (r() - .5) * cw * .12 : 0, w = cw * (era === "ancien" ? .34 : .42), h = fh * (era === "ancien" ? .55 : .62), x = X0 + cw * i + (cw - w) / 2 + jit, yy = y0 + fh * .2;
      if (i === bay) { s += `<rect x="${X0 + cw * i + 3}" y="${y0 + 2}" width="${cw - 6}" height="${fh - 2}" fill="${P.line}"/><rect x="${X0 + cw * i + 8}" y="${yy}" width="${cw - 16}" height="${h}" fill="${P.win}"/><rect x="${X0 + cw * i + cw / 2 - 1}" y="${yy}" width="2" height="${h}" fill="${P.line}"/>`; continue; }
      if (era === "ancien") s += `<rect x="${x - w * .45}" y="${yy}" width="${w * .45}" height="${h}" fill="${P.shut}"/><rect x="${x + w}" y="${yy}" width="${w * .45}" height="${h}" fill="${P.shut}"/>`;
      if (era === "brique") s += `<rect x="${x - 3}" y="${yy - 3}" width="${w + 6}" height="${h + 6}" fill="${P.line}"/>`;
      if (era === "hauss") s += `<rect x="${x - 3}" y="${yy - 5}" width="${w + 6}" height="3" fill="${P.line}"/>${f === 1 ? `<polygon points="${x - 4},${yy - 5} ${x + w / 2},${yy - 12} ${x + w + 4},${yy - 5}" fill="${P.line}"/>` : ""}`;
      s += `<rect x="${x}" y="${yy}" width="${w}" height="${h}" fill="${P.win}"/><rect x="${x}" y="${yy}" width="${w}" height="${h * .28}" fill="#8EA2B1"/><rect x="${x + w / 2 - .7}" y="${yy}" width="1.4" height="${h}" fill="#EDE6DA"/>`;
      if (era === "ancien" && f > 0) s += `<rect x="${x - 2}" y="${yy + h * .62}" width="${w + 4}" height="${h * .38}" fill="none" stroke="#2E2E2E" stroke-width="1" stroke-dasharray="1 3"/>`;
    }
    if (era === "hauss" && (f === 1 || f === et - 1)) s += `<rect x="${X0 + 6}" y="${y0 + fh * .68}" width="${BW - 12}" height="2.5" fill="#2E2E2E"/><rect x="${X0 + 6}" y="${y0 + fh * .68}" width="${BW - 12}" height="${fh * .14}" fill="none" stroke="#2E2E2E" stroke-width="1.2" stroke-dasharray="1.2 4"/>`;
    if (era === "brique" && f % 2 === 0) s += `<rect x="${X0}" y="${y0 + fh - 3}" width="${BW}" height="3" fill="#00000014"/>`;
  }
  // ---- rez-de-chaussée
  s += `<rect x="${X0}" y="${gy}" width="${BW}" height="${gh}" fill="${era === "hauss" ? "#E0D2B8" : era === "brique" ? "#D9CDB8" : era === "beton" ? "#B9BCBE" : era === "contemp" ? "#DADDDC" : P.wall}"/>`;
  if (era === "beton" && !shop) { for (let i = 0; i <= cols; i++) s += `<rect x="${X0 + 6 + (BW - 18) * i / cols}" y="${gy}" width="6" height="${gh}" fill="#9DA1A3"/>`; s += `<rect x="${W / 2 - 20}" y="${gy + gh * .3}" width="40" height="${gh * .7}" fill="#5D7181"/>`; }
  else if (shop) {
    const awn = pick(["#B5473A", "#2F5D50", "#B98B2E", "#3E4C7A", "#8C3B5E"]), n = Math.max(1, Math.floor(cols / 2)), sw = BW / n;
    for (let i = 0; i < n; i++) { const x = X0 + sw * i + 6, w = sw - 12; s += `<rect x="${x}" y="${gy + gh * .28}" width="${w}" height="${gh * .72}" fill="#4A5966"/><rect x="${x + 3}" y="${gy + gh * .34}" width="${w - 6}" height="${gh * .4}" fill="#A9BCC8"/>`;
      if (era !== "contemp") s += `<polygon points="${x - 3},${gy + gh * .12} ${x + w + 3},${gy + gh * .12} ${x + w + 8},${gy + gh * .34} ${x - 8},${gy + gh * .34}" fill="${awn}"/>`; }
  } else if (era === "hauss") s += `<path d="M${W / 2 - 18} ${G}V${gy + gh * .4}a18 18 0 0136 0V${G}z" fill="#2F4A3A"/>`;
  else s += `<rect x="${W / 2 - 13}" y="${gy + gh * .25}" width="26" height="${gh * .75}" fill="${era === "ancien" ? "#5B4636" : "#3F4A55"}"/>`;
  s += `<rect x="0" y="${G}" width="${W}" height="${H - G}" fill="#D2CABD"/><rect x="0" y="${G}" width="${W}" height="3" fill="#BDB4A6"/></svg>`;
  artCache.set(key, s); return s;
}
// ligne d'identité : « Construit vers 1700 · 6 étages · 19 m »
function idLine(c) {
  const y = +c.y || 0, et = c.et || 0, h = Math.round(c.h || 0);
  return [y ? `Construit vers ${y}` : "", et ? `${et} étage${et > 1 ? "s" : ""}` : "", h ? `${h} m` : ""].filter(Boolean).join(" · ");
}

// « Maquette » : la vraie forme de l'immeuble (son empreinte au sol et sa hauteur) vue en 3D isométrique,
// avec ses voisins en blanc autour, comme une maquette d'architecte.
function ringM(g) { const A = ARR[ai(g)]; return decodeRing(A.geo[li(g)][0]); }
// La « maquette » : la vraie forme de l'immeuble (empreinte au sol + hauteur) en 3D isométrique,
// posée sur le plan de son quartier, avec les couleurs de son époque.
function maquetteSVG(c) {
  const key = "mq" + c.g; if (artCache.has(key)) return artCache.get(key);
  const g = c.g, kx = 111320 * 0.6579, ky = 110574;
  let me = ringM(g); if (me.length < 3) throw new Error("forme inconnue");
  let cx = 0, cy = 0; me.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= me.length; cy /= me.length;
  const toM = r => { let q = r.map(p => [(p[0] - cx) * kx, (p[1] - cy) * ky]); if (q.length > 3 && Math.hypot(q[0][0] - q[q.length - 1][0], q[0][1] - q[q.length - 1][1]) < .05) q.pop();
    let A2 = 0; for (let i = 0; i < q.length; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % q.length]; A2 += x1 * y2 - x2 * y1; }
    return A2 < 0 ? q.reverse() : q; };   // toujours dans le sens inverse des aiguilles d'une montre
  const H0 = Math.max(6, c.h || (c.et2 || 4) * 3.2), mine = toM(me);
  const nbrs = [], R = 75, C = centersOf(ai(g));
  if (C) for (let k = 0; k < C.length / 2; k++) { const gg = ai(g) * 1e5 + k; if (gg === g) continue; const dx = (C[2 * k] - cx) * kx, dy = (C[2 * k + 1] - cy) * ky; if (Math.abs(dx) > R || Math.abs(dy) > R) continue; nbrs.push(toM(ringM(gg))); }
  const ang = -0.6, ca = Math.cos(ang), sa = Math.sin(ang);
  const rot = (x, y) => [x * ca - y * sa, x * sa + y * ca];
  const P = (x, y, z) => { const [X, Y] = rot(x, y); return [(X - Y) * .866, -(X + Y) * .5 - z]; };
  const depth = (x, y) => { const [X, Y] = rot(x, y); return X + Y; };
  const pr = mine.flatMap(([x, y]) => [P(x, y, 0), P(x, y, H0)]), xs = pr.map(p => p[0]), ys = pr.map(p => p[1]);
  const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
  const W = 400, H = 300, s = Math.min(W * .62 / bw, H * .68 / bh, 7), ox = W / 2 - (Math.max(...xs) + Math.min(...xs)) / 2 * s, oy = H * .54 - (Math.max(...ys) + Math.min(...ys)) / 2 * s;
  const T = ([x, y]) => `${(ox + x * s).toFixed(1)},${(oy + y * s).toFixed(1)}`;
  const era = eraOf(c), rel = c.u === "rel";
  const wallC = rel ? "#EFE5D0" : { ancien: "#F0DDBB", hauss: "#F2E4CB", brique: "#CB7A5A", beton: "#DADCDC", contemp: "#F4F5F3" }[era];
  const roofC = rel ? "#7D8C99" : { ancien: "#C06A4C", hauss: "#8A99A8", brique: "#A5AD9E", beton: "#BCC0C2", contemp: "#7E9088" }[era];
  const winC = era === "contemp" ? "#79A6C2" : era === "brique" ? "#44566A" : "#4F6A82";
  const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); const ch = i => Math.max(0, Math.min(255, Math.round(((n >> i) & 255) * f))); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; };
  let out = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="mg${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D7E6F0"/><stop offset=".45" stop-color="#EDE9E0"/><stop offset="1" stop-color="#E3DCCF"/></linearGradient><radialGradient id="ml${g}" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#ml${g})"/>`;   // le ciel vient de la carte (couleur de la rareté)
  // le quartier à plat
  for (const q of nbrs) out += `<polygon points="${q.map(([x, y]) => T(P(x, y, 0))).join(" ")}" fill="#FFFDF8" stroke="#D5CDBF" stroke-width=".9"/>`;
  // quelques arbres dans le quartier
  { const rr = rng("tr" + g); for (let t = 0; t < 7; t++) { const ang2 = rr() * 6.283, d = 26 + rr() * 45, x = Math.cos(ang2) * d, y = Math.sin(ang2) * d, rad = Math.min(2.6 + rr() * 1.6, (6 + rr() * 4) / s); const [px, py] = P(x, y, 0);
    out += `<ellipse cx="${(ox + px * s + rad * s * .5).toFixed(1)}" cy="${(oy + py * s + rad * s * .2).toFixed(1)}" rx="${(rad * s).toFixed(1)}" ry="${(rad * s * .55).toFixed(1)}" fill="#0F1B2D" opacity=".1"/><circle cx="${(ox + px * s).toFixed(1)}" cy="${(oy + py * s - rad * s * .6).toFixed(1)}" r="${(rad * s).toFixed(1)}" fill="#7DBE6A"/><circle cx="${(ox + px * s - rad * s * .3).toFixed(1)}" cy="${(oy + py * s - rad * s * .9).toFixed(1)}" r="${(rad * s * .5).toFixed(1)}" fill="#A6D98E"/>`; } }
  // ombre portée
  out += `<polygon points="${mine.map(([x, y]) => T(P(x + H0 * .5, y - H0 * .35, 0))).join(" ")}" fill="#0F1B2D" opacity=".16"/>`;
  // murs visibles, du plus loin au plus proche
  const walls = [];
  for (let i = 0; i < mine.length; i++) {
    const a = mine[i], b = mine[(i + 1) % mine.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < .3) continue;
    const nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L; if (depth(nx, ny) > -1e-6) continue;
    walls.push({ a, b, L, d: Math.max(depth(...a), depth(...b)) + depth((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), light: .8 + .2 * (nx * .6 - ny * .8) });
  }
  walls.sort((u, v) => v.d - u.d);
  const fl = Math.max(1, Math.min(14, Math.round(H0 / 3.1))), shop = c.u === "com";
  for (const w of walls) {
    const q = [P(...w.a, 0), P(...w.b, 0), P(...w.b, H0), P(...w.a, H0)];
    out += `<polygon points="${q.map(T).join(" ")}" fill="${shade(wallC, w.light)}" stroke="#00000020" stroke-width=".6"/>`;
    const pt = (t, z) => P(w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t, z);
    const nw = Math.min(14, Math.floor(w.L / 3.3));
    if (shop && nw) out += `<polygon points="${[pt(.04, .3), pt(.96, .3), pt(.96, H0 / fl * .85), pt(.04, H0 / fl * .85)].map(T).join(" ")}" fill="${shade("#4A5966", w.light)}"/>`;
    if (s * w.L < 14) continue;   // mur trop petit à l'écran : pas de fenêtres
    for (let e = 1; e < fl; e++) for (let k = 0; k < nw; k++) {
      const t0 = (k + .28) / nw, t1 = (k + .72) / nw, z0 = H0 * (e / fl) + .5, z1 = H0 * ((e + .6) / fl);
      out += `<polygon points="${[pt(t0, z0), pt(t1, z0), pt(t1, z1), pt(t0, z1)].map(T).join(" ")}" fill="${winC}" opacity=".85"/><polygon points="${[pt(t0, z0 + (z1 - z0) * .6), pt(t1, z0 + (z1 - z0) * .6), pt(t1, z1), pt(t0, z1)].map(T).join(" ")}" fill="#fff" opacity=".22"/>`;
    }
  }
  out += `<polygon points="${mine.map(([x, y]) => T(P(x, y, H0))).join(" ")}" fill="${roofC}" stroke="${shade(roofC, .72)}" stroke-width="1.2" stroke-linejoin="round"/>`;
  out += "</svg>"; artCache.set(key, out); return out;
}

// --- libellés -------------------------------------------------------------
function itemLabel(c, it) {
  if (!it) return c.lk === "p" ? `${fmtN(c.lots)} parts` : `${c.lots} ${lotWord(c, c.lots)}`;
  if (it.t === "key") { const k = it.ks[0]; return c.lk === "l" ? `Clé · Apt ${k + 1} · ${ord(floorOfLot(c, k))} étage` : `Clé · Local n°${k + 1}`; }
  if (it.t === "floor") return `${ord(floorOfLot(c, it.ks[0]))} étage entier · ${it.ks.length} logements`;
  if (it.t === "title") return `Immeuble entier · ${c.lots} ${lotWord(c, c.lots)}`;
  if (it.t === "part") return `${it.n} part${it.n > 1 ? "s" : ""} sur ${fmtN(c.lots)}`;
  if (it.t === "own") {
    if (it.n) return `${fmtN(it.n)} part${it.n > 1 ? "s" : ""} sur ${fmtN(c.lots)}`;
    if (it.ks.length === c.lots && c.lots > 1) return `Immeuble entier · ${c.lots} ${lotWord(c, c.lots)}`;
    if (it.ks.length === 1) return c.lk === "l" ? `Apt ${it.ks[0] + 1} · ${ord(floorOfLot(c, it.ks[0]))} étage` : c.lk === "c" ? `Local n°${it.ks[0] + 1}` : lotName(c, it.ks[0]);
    return `${it.ks.length} ${lotWord(c, it.ks.length)} sur ${c.lots}`;
  }
  return "";
}
const itemUnits = it => it.n || (it.ks ? it.ks.length : 1);
function rarSq(r, size) { return `<span class="sq" style="background:${RAR[r].c};${size ? `width:${size}px;height:${size}px` : ""}">${RAR[r].l}</span>`; }

// --- la carte « plaque de rue » ---------------------------------------------
function plaqueTitle(c) { return c.name ? cap(c.name) : (c.adr || "Immeuble"); }
const STARS = { C: 1, U: 2, R: 3, L: 4, M: 5 };
const ERA_N = { ancien: "Ancien Paris", hauss: "Haussmannien", brique: "Années folles", beton: "Trente Glorieuses", contemp: "Contemporain" };
function cardHTML(c, { w, item, tier, count } = {}) {
  const r = tier || c.r, n = item ? Math.max(1, itemUnits(item)) : 1;
  const t = plaqueTitle(c), long = t.length > 22;
  // carte d'un immeuble entier (pas d'un bien possédé) : les chiffres sont ceux d'UN logement
  const per = !item && c.lots > 1 ? (c.lk === "p" ? "/ PART" : c.lk === "l" ? "/ LOGT" : "/ LOCAL") : "";
  return `<div class="hc t${r}" style="${w ? `--w:${w}` : ""}"><div class="fr"><div class="in">
    <div class="plq"><small>${c.arr === 1 ? "1<sup>er</sup>" : c.arr + "<sup>e</sup>"} Arr<sup>t</sup></small><b class="${long ? "long" : ""}">${esc(t)}</b></div>
    <div class="ph">${photo(c)}<i class="foil"></i>${c.lk !== "p" && c.u !== "rel" && !goodPhoto(c) ? `<span class="era e-${eraOf(c)}">${ERA_N[eraOf(c)]}${c.y ? ` · ${esc(c.y)}` : ""}</span>` : ""}<span class="rb">${RAR[r].l}</span>${count ? `<span class="cnt">${esc(count)}</span>` : ""}</div>
    <div class="bd"><div class="kd">${esc(itemLabel(c, item) || kindLabel(c))}</div>
      <div class="nums num"><div><span>${per ? "LOYER " + per : "LOYER / JOUR"}</span><b class="g">${fmtE(c.rent * n)}</b></div><div class="r"><span>${per ? "PRIX " + per : "VALEUR"}</span><b>${fmtE(c.v * n)}</b></div></div>
      <div class="rn"><span><i class="stars">${"★".repeat(STARS[r])}</i>${RAR[r].n.toUpperCase()}</span><em>N° ${String(c.arr).padStart(2, "0")}-${String(li(c.g)).padStart(5, "0")}</em></div></div>
  </div></div></div>`;
}
function chanceText(it) {
  if (it.out) return it.out;
  if (it.amount) return (it.amount > 0 ? "+" : "−") + fmtE(Math.abs(it.amount));
  return CHANCE_TXT[it.k] || "";
}
function chanceCardHTML(it, w) {
  const [n, g] = CHANCE[it.k] || ["Carte Chance", "?"]; const bad = BAD.has(it.k);
  const col = bad ? ["#FDECEC", "#C62828", "MALUS"] : ["#E7F6EC", "#15803D", "BONUS"];
  const amt = it.amount ? (it.amount > 0 ? "+" : "−") + fmtE(Math.abs(it.amount)) : (it.out || "");
  const desc = it.amount ? "" : (CHANCE_TXT[it.k] || "");
  return `<div class="hc chance tC" style="--rc:${col[1]};--rt:${col[1]};--chs:${col[0]};--chc:${col[1]};${w ? `--w:${w}` : ""}"><div class="fr"><div class="in">
    <div class="plq"><small>Carte Chance · ${col[2]}</small><b>${esc(n)}</b></div>
    <div class="ph"><span class="glyph">${esc(g)}</span></div>
    <div class="bd"><div class="desc">${esc(desc)}</div>${amt ? `<div class="amt num">${esc(amt)}</div>` : ""}</div>
  </div></div></div>`;
}
function itemFace(it, w) {
  if (it.t === "chance") return chanceCardHTML(it, w);
  const c = card(it.card); if (!c) return "";
  return cardHTML(c, { w, item: { t: it.t, ks: it.ks, n: it.n }, tier: it.tier });
}
// petit visuel d'enveloppe de booster
let packN = 0;
function packHTML(cls = "") {
  const gid = "pkgold" + (++packN);
  return `<div class="pack ${cls}" role="img" aria-label="Booster Haussmann"><div class="tear"></div><div class="holo"></div><div class="pin">
    <span class="plaq">HAUSSMANN</span>
    <svg class="facade" viewBox="0 0 120 84" fill="none" stroke="url(#${gid})" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE7A3"/><stop offset=".5" stop-color="#E9B949"/><stop offset="1" stop-color="#FFF1C4"/></linearGradient></defs>
      <path d="M6 32h108M14 32l7-13h78l7 13M10 82V32M110 82V32M3 82h114"/><path d="M30 19v-7h8v7M82 19v-7h8v7"/>
      ${[0, 1, 2, 3, 4].map(i => `<path d="M${17 + i * 19} 50v-10a4.5 4.5 0 019 0v10z"/><rect x="${17 + i * 19}" y="58" width="9" height="13"/>`).join("")}
      <path d="M12 53h96M12 74h96"/></svg>
    <span class="lbl">BOOSTER<small>4 biens · 1 Chance</small></span></div><div class="shine"></div></div>`;
}

// phrase claire pour « ce que je possède » dans un immeuble
function ownSentence(c, ks, n) {
  if (n) return `${fmtN(n)} part${n > 1 ? "s" : ""} du monument sur ${fmtN(c.lots)}`;
  const w = x => c.lk === "l" ? (x > 1 ? "logements" : "logement") : (x > 1 ? "locaux commerciaux" : "local commercial");
  if (ks.length === c.lots && c.lots > 1) return `Tout l'immeuble : ses ${c.lots} ${w(c.lots)}`;
  return `${ks.length} ${w(ks.length)} sur les ${c.lots} de l'immeuble`;
}
