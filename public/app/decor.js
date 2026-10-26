"use strict";
// =====================================================================
//  Décor de la carte : Paris « Pierre & zinc », des arbres, des ombres,
//  et un ciel qui suit l'heure réelle à Paris : jour → coucher de soleil → nuit
//  (fenêtres allumées, grands axes éclairés). Choix du propriétaire, 19/10/2026.
// =====================================================================
const SKY = {
  day: {
    mc: { mine: "#2563EB", mineB: "#BFD2FB", theirs: "#F4B4A5", theirsB: "#FCEDE9", sale: "#F5A524", saleB: "#FCE1AE", sel: "#0B0C10", selB: "#9DB4F7",
          mute: "#F4EEE3", muteR: "#E3DDD2", stone: "#F5E6CB", zinc: "#DDD6CB", zinc2: "#D5CDC0", zinc3: "#E4DED5", rarM: "#B98AE8", rarMB: "#EBDDF9", rarL: "#E2B23A", rarLB: "#F8E7B8",
          lit: "#DDD6CB", litB: "#F5E6CB", lit2B: "#F5E6CB" },   // toits : un zinc doré, trois nuances (26/10/2026, « tous les toits me semblent énormément gris »)
    g: { bg: "#EEE8DC", parks: "#A8D38C", water: "#6DB3E2", major: "#FFFDF8", majorCase: "#DDD3C1", road: "#FFFDF8", arrline: "#FFFFFF",
         names: "#5B6270", namesHalo: "#FFFFFF", shadow: "#5A4A30", shadowOp: .14, glow: 0,
         light: { anchor: "viewport", color: "#FFF4E0", intensity: .42, position: [1.15, 220, 55] },
         sky: { "sky-color": "#A9CBEF", "horizon-color": "#FFF3E2", "fog-color": "#F2ECE2", "sky-horizon-blend": .55, "horizon-fog-blend": .6, "fog-ground-blend": .8, "atmosphere-blend": 0 } },
    trees: ["#6FB35A", "#5DA04B", "#7FC066", "#4E9445"]
  },
  dusk: {   // coucher (et lever) du soleil : la pierre se réchauffe, tout reste lumineux
    mc: { mine: "#2563EB", mineB: "#BCCBF2", theirs: "#F2AA98", theirsB: "#F9E1D6", sale: "#F59E1B", saleB: "#F8D8A4", sel: "#0B0C10", selB: "#9DB4F7",
          mute: "#F3E6D5", muteR: "#E5D6C6", stone: "#F8E4CB", zinc: "#D9C6B2", zinc2: "#D0BCA6", zinc3: "#E0CFBD", rarM: "#B488DD", rarMB: "#E8D6F2", rarL: "#E2AC38", rarLB: "#F6DFAE",
          lit: "#C9A77E", litB: "#F8DDB4", lit2B: "#F8E4CB" },
    g: { bg: "#F1E4D3", parks: "#A9C98A", water: "#68A9CF", major: "#FFF5E8", majorCase: "#E5D1B6", road: "#FFF5E8", arrline: "#FFF8EF",
         names: "#6A5038", namesHalo: "#FFF7EC", shadow: "#6B3B1C", shadowOp: .16, glow: 0,
         light: { anchor: "viewport", color: "#FFD9B0", intensity: .44, position: [1.25, 245, 42] },
         sky: { "sky-color": "#F4B48A", "horizon-color": "#FFE2BC", "fog-color": "#F4DEC6", "sky-horizon-blend": .6, "horizon-fog-blend": .6, "fog-ground-blend": .8, "atmosphere-blend": 0 } },
    trees: ["#7EA453", "#6E9848", "#8DB05C", "#638C40"]
  },
  night: {
    mc: { mine: "#3B82F6", mineB: "#1E3F8F", theirs: "#C98F84", theirsB: "#3E2C2A", sale: "#F5A524", saleB: "#6A4815", sel: "#F8FAFC", selB: "#5B74C9",
          mute: "#1A202C", muteR: "#232A37", stone: "#1E2534", zinc: "#29313F", zinc2: "#262E3B", zinc3: "#2D3544", rarM: "#7C5AAE", rarMB: "#3A2F52", rarL: "#B08A2E", rarLB: "#4F4123",
          lit: "#6B5A33", litB: "#5A4A2A", lit2B: "#4A4030" },
    g: { bg: "#0E1420", parks: "#13261B", water: "#0B2238", major: "#F2B655", majorCase: "#2E2A1F", road: "#283244", arrline: "#2E3B55",
         names: "#AAB4C8", namesHalo: "#0E1420", shadow: "#000000", shadowOp: 0, glow: 1,
         light: { anchor: "viewport", color: "#C8D4FF", intensity: .3, position: [1.2, 200, 50] },
         sky: { "sky-color": "#070B16", "horizon-color": "#1E2640", "fog-color": "#0F1524", "sky-horizon-blend": .5, "horizon-fog-blend": .6, "fog-ground-blend": .8, "atmosphere-blend": 0 } },
    trees: ["#1D3A27", "#22422C", "#1A3524", "#244630"]
  }
};
const NIGHT_FLOW = ["#FFE9A8", "#FFE9A8", "#FFF6D8", "#FF6B5A", "#FFD27A"];   // la nuit : phares et feux arrière
const DECOR = { key: "", night: false, flow: null, trees: SKY.day.trees };

// ---- mélange de deux palettes (couleurs, nombres, objets) ----
function hexMix(a, b, t) {
  const p = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)), A = p(a), B = p(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
function mixP(a, b, t) {
  if (t <= 0) return a; if (t >= 1) return b;
  if (typeof a === "string" && a[0] === "#" && a.length === 7) return hexMix(a, b, t);
  if (typeof a === "number") return a + (b - a) * t;
  if (Array.isArray(a)) return a.map((x, i) => mixP(x, b[i], t));
  if (a && typeof a === "object") { const o = {}; for (const k in a) o[k] = mixP(a[k], b[k], t); return o; }
  return t < .5 ? a : b;
}

// ---- hauteur du soleil au-dessus de l'horizon à Paris (en degrés, précision ~0,5°) ----
function sunAlt(date) {
  const r = Math.PI / 180, lat = 48.8566 * r, lon = 2.3522;
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const g = (357.529 + .98560028 * d) * r, q = 280.459 + .98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + .02 * Math.sin(2 * g)) * r, e = (23.439 - .00000036 * d) * r;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24, ha = (gmst * 15 + lon) * r - ra;
  return Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha)) / r;
}
// mode choisi : « auto » (heure réelle, par défaut) ou « jour » (profil) ; ?ciel=jour|soir|nuit pour tester
// toujours le jour (choix du propriétaire, 19/10/2026 : la nuit « déprime ») ; ?ciel=auto|soir|nuit seulement pour tester
function skyMode() {
  const q = new URLSearchParams(location.search).get("ciel"); if (q) return q;
  return "jour";
}
function skyPhase(now = new Date()) {
  const m = skyMode();
  if (m === "jour") return { dusk: 0, night: 0 };
  if (m === "soir") return { dusk: 1, night: 0 };
  if (m === "nuit") return { dusk: 1, night: 1 };
  const alt = sunAlt(now), q = x => Math.round(Math.max(0, Math.min(1, x)) * 20) / 20;
  return { dusk: q(alt >= 10 ? 0 : alt >= 0 ? (10 - alt) / 10 : 1), night: q(alt >= 0 ? 0 : -alt / 8), alt };
}

// ---- appliquer la palette du moment ----
function applyDecor(force) {
  const ph = skyPhase(), key = ph.dusk + "/" + ph.night;
  if (!force && key === DECOR.key) return; DECOR.key = key;
  const P = mixP(mixP(SKY.day, SKY.dusk, ph.dusk), SKY.night, ph.night);
  Object.assign(MC, P.mc); Object.assign(GROUND, P.g);
  DECOR.trees = P.trees; DECOR.night = ph.night >= .5; DECOR.flow = DECOR.night ? NIGHT_FLOW : null;
  document.body.classList.toggle("night", DECOR.night);
  if (typeof map === "undefined" || !map || !mapReady) return;
  const sp = (id, k, v) => { if (map.getLayer(id)) map.setPaintProperty(id, k, v); };
  applyMode();   // couleurs des immeubles (tous les arrondissements)
  sp("bg", "background-color", GROUND.bg); sp("parks", "fill-color", GROUND.parks); sp("water", "fill-color", GROUND.water);
  sp("major", "line-color", GROUND.major); sp("major", "line-blur", GROUND.glow * 1.6); sp("major-case", "line-color", GROUND.majorCase);
  sp("major", "line-opacity", GROUND.glow > .5 ? ["interpolate", ["linear"], ["zoom"], 12, .9, 15, .6, 18, .32] : 1);   // la nuit : grands axes éclairés, discrets de près
  sp("arrline", "line-color", GROUND.arrline); sp("snames", "text-color", GROUND.names); sp("snames", "text-halo-color", GROUND.namesHalo);
  sp("rd", "line-color", GROUND.road); sp("sh", "fill-color", GROUND.shadow); sp("sh", "fill-opacity", GROUND.shadowOp);
  sp("trees", "fill-extrusion-color", treeColors());
  sp("wakes", "fill-opacity", DECOR.night ? .14 : .5);   // sillages des bateaux : discrets la nuit
  try { map.setLight(GROUND.light); map.setSky(GROUND.sky); } catch (e) { }
}

// ---- arbres en 3D : dans les parcs et le long des grands boulevards (seulement autour de l'écran) ----
const TREES = { box: null, major: null, water: null };
const treeColors = () => ["match", ["get", "ci"], 0, DECOR.trees[0], 1, DECOR.trees[1], 2, DECOR.trees[2], DECOR.trees[3]];
function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function inRing(r, x, y) { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins; return ins; }
const ringBox = r => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [a, b] of r) { x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); } return [x0, y0, x1, y1]; };
function buildTrees() {
  if (typeof map === "undefined" || !map || !mapReady || map.getZoom() < 14.2 || typeof BASE === "undefined" || !BASE) return;
  // l'écran, mais à 1,2 km au plus du point visé : la caméra inclinée voit jusqu'à l'horizon, les arbres lointains ne servent à rien
  const b = map.getBounds(), c0 = map.getCenter(), rx = 1200 / (111320 * Math.cos(48.86 * Math.PI / 180)), ry = 1200 / 110540;
  const W = Math.max(b.getWest(), c0.lng - rx), E = Math.min(b.getEast(), c0.lng + rx), S = Math.max(b.getSouth(), c0.lat - ry), N = Math.min(b.getNorth(), c0.lat + ry);
  if (TREES.box && W >= TREES.box[0] && E <= TREES.box[2] && S >= TREES.box[1] && N <= TREES.box[3]) return;   // déjà couvert
  const dx = (E - W) * .35, dy = (N - S) * .35, V = [W - dx, S - dy, E + dx, N + dy]; TREES.box = V;
  const ML = 111320 * Math.cos(48.86 * Math.PI / 180), MA = 110540, hit = bb => bb[2] > V[0] && bb[0] < V[2] && bb[3] > V[1] && bb[1] < V[3];
  if (!TREES.water) TREES.water = BASE.water.map(rs => { const r = decodeRing(rs[0]); return { r, bb: ringBox(r) }; });
  if (!TREES.major) TREES.major = BASE.major.filter(m => m[0] === 3).map(([k, f]) => { const p = decodeRing(f); return { p, bb: ringBox(p) }; });
  if (typeof inPark === "function") inPark(0, 0);   // prépare la liste des parcs (life.js)
  const parks = (typeof LPARKS !== "undefined" && LPARKS || []).filter(P => hit(P.bb)), waters = TREES.water.filter(w => hit(w.bb));
  const wet = (x, y) => waters.some(w => x > w.bb[0] && x < w.bb[2] && y > w.bb[1] && y < w.bb[3] && inRing(w.r, x, y));
  const feats = [], MAX = 3800;
  const oct = (x, y, r, base, h, ci) => { const ring = []; for (let k = 0; k <= 8; k++) { const a = k / 8 * 2 * Math.PI; ring.push([x + Math.cos(a) * r / ML, y + Math.sin(a) * r / MA]); } feats.push({ type: "Feature", properties: { ci, b: base, h }, geometry: { type: "Polygon", coordinates: [ring] } }); };
  const tree = (x, y, u) => { const r = 3 + u * 2.4, h = 9 + u * 7, ci = Math.floor(u * 997) % 4; oct(x, y, r, 2.4, h, ci); oct(x, y, r * .6, h, h + 2.2, ci); };
  // parcs : une grille régulière légèrement bousculée, plus espacée si beaucoup de parcs à l'écran
  let area = 0; for (const P of parks) area += Math.max(0, Math.min(P.bb[2], V[2]) - Math.max(P.bb[0], V[0])) * ML * Math.max(0, Math.min(P.bb[3], V[3]) - Math.max(P.bb[1], V[1])) * MA;
  const sp = Math.max(14, Math.sqrt(area / 2600));
  for (const P of parks) {
    const x0 = Math.max(P.bb[0], V[0]), x1 = Math.min(P.bb[2], V[2]), y0 = Math.max(P.bb[1], V[1]), y1 = Math.min(P.bb[3], V[3]);
    for (let gx = Math.ceil(x0 * ML / sp); gx * sp / ML < x1; gx++) for (let gy = Math.ceil(y0 * MA / sp); gy * sp / MA < y1; gy++) {
      if (hash2(gx, gy, 1) > .86) continue;
      const x = (gx + (hash2(gx, gy, 2) - .5) * .7) * sp / ML, y = (gy + (hash2(gx, gy, 3) - .5) * .7) * sp / MA;
      if (!inRing(P.r, x, y) || wet(x, y)) continue;
      tree(x, y, hash2(gx, gy, 4)); if (feats.length > MAX * 2) break;
    }
  }
  // alignements d'arbres des grands boulevards, des deux côtés, tous les 13 m
  for (const m of TREES.major) {
    if (feats.length > MAX * 2) break; if (!hit(m.bb)) continue;
    let acc = 0; const p = m.p;
    for (let j = 1; j < p.length; j++) {
      const [ax, ay] = p[j - 1], [bx, by] = p[j], vx = (bx - ax) * ML, vy = (by - ay) * MA, L = Math.hypot(vx, vy); if (!L) continue;
      const nx = -vy / L, ny = vx / L;
      for (let d = (13 - acc % 13) % 13; d < L; d += 13) {
        const t = d / L, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        if (x < V[0] || x > V[2] || y < V[1] || y > V[3]) continue;
        for (const s of [-11, 11]) { const tx = x + nx * s / ML, ty = y + ny * s / MA; if (!wet(tx, ty)) tree(tx, ty, hash2(Math.round(tx * 1e5), Math.round(ty * 1e5), 5)); }
      }
      acc += L;
    }
  }
  map.getSource("trees")?.setData({ type: "FeatureCollection", features: feats });
}
function decorInit() {
  if (typeof map === "undefined" || !map || !mapReady || !map.getLayer("anchor-top")) return false;
  map.addSource("trees", { type: "geojson", data: { type: "FeatureCollection", features: [] }, buffer: 0, tolerance: 0 });
  map.addLayer({ id: "trees", type: "fill-extrusion", source: "trees", minzoom: 14.2, paint: { "fill-extrusion-color": treeColors(), "fill-extrusion-base": ["get", "b"], "fill-extrusion-height": ["get", "h"],
    "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 14.2, 0, 14.8, 1], "fill-extrusion-vertical-gradient": true } }, "anchor-top");
  map.on("moveend", throttle(buildTrees, 700));
  buildTrees(); applyDecor(true);
  setInterval(() => applyDecor(false), 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) applyDecor(false); });
  return true;
}
applyDecor(true);   // avant la création de la carte : la carte naît directement avec les couleurs de l'heure
(function waitMap() { try { if (decorInit()) return; } catch (e) { console.warn("decor", e); return; } setTimeout(waitMap, 800); })();
