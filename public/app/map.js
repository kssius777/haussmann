"use strict";
// =====================================================================
//  Carte 3D de Paris : écran d'accueil, couleurs « soirée électorale »
// =====================================================================
let map = null, mapReady = false, mode = "all", sel = null;
const hideSet = new Set(), lastState = new Map(); let painted = new Set();
const MC = { mine: "#0EA5A0", mineB: "#9FE3DE", theirs: "#7C8BA1", theirsB: "#DCE3EC", sale: "#F59E0B", saleB: "#FBE1B0",
  sel: "#0F1B2D", selB: "#94A3B8", mute: "#EEF2F6", muteR: "#E1E7EE" };

function geoArr(i) {
  const A = ARR[i], feats = []; const ih = FIELDS.indexOf("h"), ir = FIELDS.indexOf("r");
  A.geo.forEach((enc, k) => {
    const g = i * 1e5 + k; if (hideSet.has(g)) return; const row = A.cards[k]; const h = Math.max(4, row[ih] || 0);
    const polys = enc.map(f => { const d = decodeRing(f); return [d.concat([d[0]])]; });
    feats.push({ type: "Feature", id: g, properties: { h, r: row[ir] }, geometry: polys.length === 1 ? { type: "Polygon", coordinates: polys[0] } : { type: "MultiPolygon", coordinates: polys } });
  });
  return { type: "FeatureCollection", features: feats };
}
const linesGeo = list => ({ type: "FeatureCollection", features: list.map(([k, f]) => ({ type: "Feature", properties: { k }, geometry: { type: "LineString", coordinates: decodeRing(f) } })) });
const polysGeo = list => ({ type: "FeatureCollection", features: list.map(rs => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: rs.map(r => { const d = decodeRing(r); return d.concat([d[0]]); }) } })) });

function colorExprs(m) {
  const st = ["coalesce", ["feature-state", "s"], 0], se = ["boolean", ["feature-state", "sel"], false];
  const rarR = d => ["match", ["get", "r"], "M", RAR.M.roof, "L", RAR.L.roof, "R", RAR.R.roof, d], rarB = d => ["match", ["get", "r"], "M", RAR.M.body, "L", RAR.L.body, "R", RAR.R.body, d];
  if (m === "mine") return { roof: ["case", se, MC.sel, [">=", st, 3], MC.mine, MC.muteR], body: ["case", se, MC.selB, [">=", st, 3], MC.mineB, MC.mute] };
  if (m === "sale") return { roof: ["case", se, MC.sel, ["==", st, 4], MC.sale, MC.muteR], body: ["case", se, MC.selB, ["==", st, 4], MC.saleB, MC.mute] };
  return { roof: ["case", se, MC.sel, [">=", st, 3], MC.mine, ["==", st, 2], MC.theirs, ["==", st, 4], MC.sale, rarR("#E1E7EE")],
           body: ["case", se, MC.selB, [">=", st, 3], MC.mineB, ["==", st, 2], MC.theirsB, ["==", st, 4], MC.saleB, rarB("#FFFFFF")] };
}
function partyFill() {
  return ["match", ["coalesce", ["feature-state", "p"], ""], ...PARTY_ORDER.flatMap(k => [k, PARTIES[k].c]), "#FFFFFF"];
}

// géométrie construite petit à petit, seulement quand la carte est visible
const geoQ = []; let geoBusy = false;
function addArrToMap(i) {
  geoQ.push({ i, f: () => {
    if (map.getSource("b" + i)) return;
    map.addSource("b" + i, { type: "geojson", data: geoArr(i), maxzoom: 15, buffer: 32, tolerance: .5 });
    map.addSource("r" + i, { type: "geojson", data: linesGeo(ARR[i].roads), maxzoom: 15, buffer: 32 });
    const e = colorExprs(mode);
    map.addLayer({ id: "rd" + i, type: "line", source: "r" + i, minzoom: 14, paint: { "line-color": "#FFFFFF", "line-opacity": .95, "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 14, ["match", ["get", "k"], 1, 1.2, .5], 18, ["match", ["get", "k"], 1, 10, 3]] } }, "anchor-b");
    map.addLayer({ id: "bd" + i, type: "fill-extrusion", source: "b" + i, minzoom: 12.6, paint: { "fill-extrusion-color": e.body, "fill-extrusion-height": ["-", ["get", "h"], 1], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true } }, "anchor-top");
    map.addLayer({ id: "rf" + i, type: "fill-extrusion", source: "b" + i, minzoom: 15.2, paint: { "fill-extrusion-color": e.roof, "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": ["-", ["get", "h"], 1], "fill-extrusion-opacity": 1 } }, "anchor-top");
    for (const L of ["bd" + i, "rf" + i]) {
      map.on("click", L, ev => { const f = ev.features[0]; if (f) { ev.preventDefault(); previewBuilding(f.id); } });
      map.on("mouseenter", L, () => map.getCanvas().style.cursor = "pointer"); map.on("mouseleave", L, () => map.getCanvas().style.cursor = "");
    }
    for (const g of [...lastState.keys()]) if (ai(g) === i) lastState.delete(g);
    paintAll();
  } });
  pumpGeo();
}
function pumpGeo() {
  if (geoBusy || !mapReady || cur() !== "map" || !geoQ.length) return;
  geoBusy = true;
  const c = map.getCenter(); const d = i => Math.hypot(IDX.arr[i].center[0] - c.lng, IDX.arr[i].center[1] - c.lat);
  geoQ.sort((a, b) => d(a.i) - d(b.i));
  const it = geoQ.shift(); try { it.f(); } catch (e) { console.warn(e); }
  setTimeout(() => { geoBusy = false; pumpGeo(); }, 60);
}
window.onArrLoaded = i => { if (map) addArrToMap(i); };

function stateFor(g) {
  const o = ST.own.get(g);
  if (o && o.owners.includes(ME)) { const ks = ST.mine.get(g); const c = card(g); return c && ks && ks.length === c.lots && c.lots > 1 ? 5 : 3; }
  if (ST.sale.has(g)) return 4;
  if (o) return 2; return 0;
}
function paintAll() {
  if (!mapReady) return;
  if (cur() !== "map" || !$("#reveal").hidden) { paintAll.pending = true; return; } paintAll.pending = false;
  const want = new Set([...ST.own.keys(), ...ST.sale]); if (sel !== null) want.add(sel);
  for (const g of new Set([...painted, ...want])) {
    if (!ARR[ai(g)]?.cards || !map.getSource("b" + ai(g)) || hideSet.has(g)) continue;
    const s = stateFor(g), se = g === sel, k = s * 2 + (se ? 1 : 0); if (lastState.get(g) === k) continue;
    lastState.set(g, k); map.setFeatureState({ source: "b" + ai(g), id: g }, { s, sel: se });
  }
  painted = want; renderMarks(); renderTags(); renderScore(); renderFilterCounts();
}
let arrKey = "";
function updateArrFill() {
  if (!mapReady) return; const key = ST.mayors.map(m => m?.party || "").join(",");
  if (key === arrKey) return; arrKey = key;
  IDX.arr.forEach((a, i) => map.setFeatureState({ source: "arr", id: i }, { p: ST.mayors[i]?.party || "" }));
}
function applyMode() {
  if (!mapReady) return; const e = colorExprs(mode);
  for (let i = 0; i < 20; i++) { if (map.getLayer("rf" + i)) map.setPaintProperty("rf" + i, "fill-extrusion-color", e.roof); if (map.getLayer("bd" + i)) map.setPaintProperty("bd" + i, "fill-extrusion-color", e.body); }
  map.setPaintProperty("arrfill", "fill-opacity", mode === "all" ? ["interpolate", ["linear"], ["zoom"], 11, .5, 13.5, .28, 15.5, .06] : ["interpolate", ["linear"], ["zoom"], 11, .18, 14, .04]);
  renderTags(); renderMarks();
}

function buildMap(base) {
  const outline = { type: "FeatureCollection", features: IDX.arr.map((a, i) => ({ type: "Feature", id: i, properties: { n: a.n }, geometry: { type: "MultiPolygon", coordinates: a.outline.map(r => { const d = decodeRing(r); return [d.concat([d[0]])]; }) } })) };
  const mfill = { type: "FeatureCollection", features: IDX.models.map(m => {
    const kx = 111320 * Math.cos(m.lat * Math.PI / 180), ky = 110574; const ca = Math.cos(m.ang), sa = Math.sin(m.ang);
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([u, v]) => { const x = u * m.L / 2, y = v * m.W / 2; return [m.lon + (x * ca - y * sa) / kx, m.lat + (x * sa + y * ca) / ky]; });
    return { type: "Feature", id: m.g, properties: {}, geometry: { type: "Polygon", coordinates: [pts] } }; }) };
  const ev = ST.state?.event;
  map = new maplibregl.Map({
    container: "map", attributionControl: false, center: [2.3420, 48.8580], zoom: 11.9, pitch: 35, bearing: -14, maxPitch: 75, minZoom: 10.8,
    maxBounds: [[2.10, 48.74], [2.60, 48.98]], fadeDuration: 0, dragRotate: true, touchPitch: true, pitchWithRotate: true,
    style: { version: 8,
      light: { anchor: "viewport", color: "#FFFFFF", intensity: .3, position: [1.15, 200, 30] },
      sky: { "sky-color": "#BFDDF3", "horizon-color": "#EAF3FA", "fog-color": "#EAF3FA", "sky-horizon-blend": .6, "horizon-fog-blend": .7, "fog-ground-blend": .8, "atmosphere-blend": 0 },
      sources: { water: { type: "geojson", data: polysGeo(base.water) }, parks: { type: "geojson", data: polysGeo(base.parks) }, major: { type: "geojson", data: linesGeo(base.major) }, arr: { type: "geojson", data: outline }, mfill: { type: "geojson", data: mfill } },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": "#EEF2F5" } },
        { id: "arrfill", type: "fill", source: "arr", paint: { "fill-color": partyFill(), "fill-opacity": ["interpolate", ["linear"], ["zoom"], 11, .5, 13.5, .28, 15.5, .06] } },
        { id: "parks", type: "fill", source: "parks", paint: { "fill-color": "#CFE8C9", "fill-opacity": .85 } },
        { id: "water", type: "fill", source: "water", paint: { "fill-color": "#9FD0EE" } },
        { id: "major-case", type: "line", source: "major", paint: { "line-color": "#DCE3EA", "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 11, ["match", ["get", "k"], 3, 1.6, .6], 18, ["match", ["get", "k"], 3, 34, 20]] } },
        { id: "major", type: "line", source: "major", paint: { "line-color": "#FFFFFF", "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 11, ["match", ["get", "k"], 3, 1.2, .4], 18, ["match", ["get", "k"], 3, 30, 17]] } },
        { id: "mfill", type: "fill", source: "mfill", paint: { "fill-color": "#C9921A", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 12, .2, 16, .06] } },
        { id: "anchor-b", type: "background", layout: { visibility: "none" }, paint: {} },
        { id: "arrline", type: "line", source: "arr", paint: { "line-color": "#FFFFFF", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.6, 16, 3] } },
        { id: "evline", type: "line", source: "arr", filter: ["==", ["id"], ev ? ev.arr - 1 : -1], paint: { "line-color": "#F59E0B", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 3, 16, 6], "line-dasharray": [2, 1.2] } },
        { id: "anchor-top", type: "background", layout: { visibility: "none" }, paint: {} }
      ] }
  });
  map.touchZoomRotate.enableRotation();
  map.on("load", () => {
    mapReady = true; pumpGeo();
    if (window.THREE && window.addMonuments) addMonuments(map, IDX.models);
    map.on("click", "mfill", e => { const f = e.features[0]; if (f) previewBuilding(f.id); });
    map.on("click", e => { if (e.defaultPrevented) return; if (!map.queryRenderedFeatures(e.point).some(f => /^(bd|rf)\d|^mfill$/.test(f.layer.id))) hidePreview(); closeSearch(); });
    IDX.arr.forEach((a, i) => {
      const el = document.createElement("button"); el.className = "amark"; el.innerHTML = `<b>${ord(a.n)}</b><span id="am${i}"></span>`;
      el.addEventListener("click", ev => { ev.stopPropagation(); push("arr", i); });
      a.marker = new maplibregl.Marker({ element: el }).setLngLat(a.center).addTo(map);
    });
    buildMonMarkers();
    map.on("zoom", renderMarks); map.on("moveend", renderTags);
    updateArrFill(); applyMode(); paintAll();
    loadAllProgressive();
  });
}
let monMarks = [];
function buildMonMarkers() {
  monMarks = IDX.mons.filter(m => m[2] === "M" || m[2] === "L").map(([g, n, r, lon, lat]) => {
    const model = IDX.models.find(x => x.g === g); const el = document.createElement("button"); el.className = "mmark"; el.style.setProperty("--mc", RAR[r].c);
    el.innerHTML = `<i></i>${esc(cap(n))}`;
    el.addEventListener("click", ev => { ev.stopPropagation(); previewBuilding(g); });
    const mk = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(model ? [model.lon, model.lat] : [lon, lat]); if (model) mk.setOffset([0, -Math.min(140, model.h * .35)]);
    return { g, r, mk, el, on: false };
  });
}
function renderMarks() {
  if (!mapReady) return; const z = map.getZoom();
  IDX.arr.forEach((a, i) => {
    const el = a.marker?.getElement(); if (!el) return; el.style.display = z < 14 && mode === "all" ? "" : "none";
    const m = ST.mayors[i]; el.style.setProperty("--pc", m ? PARTIES[m.party]?.c || "#64748B" : "#94A3B8");
    const s = document.getElementById("am" + i); if (s) s.innerHTML = m ? `${emblemSVG(m.party, 15)}${esc(m.pseudo)}` : "Siège libre";
  });
  for (const m of monMarks) {
    const show = z >= (m.r === "M" ? 13.2 : 16.3); if (show && !m.on) { m.mk.addTo(map); m.on = true; } else if (!show && m.on) { m.mk.remove(); m.on = false; }
    if (show && !m.ph) { const c = card(m.g); if (c) { m.ph = true; if (c.ph) m.el.querySelector("i").setAttribute("style", phStyle(c)); } }
  }
}
let tagMarks = [];
function renderTags() {
  tagMarks.forEach(t => t.remove()); tagMarks = [];
  if (!mapReady || cur() !== "map" || mode === "all") return;
  let items = [];
  if (mode === "mine") items = holdings().map(h => ({ g: h.g, v: h.c.v * unitsOf(h), mine: true }));
  else items = [...ST.sale].filter(g => card(g)).map(g => ({ g, v: 0, mine: false }));
  if (map.getZoom() < 14.2) {
    const grp = {}; for (const it of items) { const a = ai(it.g); (grp[a] = grp[a] || { n: 0, v: 0 }).n++; grp[a].v += it.v; }
    for (const [a, gp] of Object.entries(grp)) {
      const A = IDX.arr[a]; const el = document.createElement("button"); el.className = "pricetag grp num" + (mode === "mine" ? " mine" : "");
      el.innerHTML = `<b>${gp.n}</b>${mode === "mine" ? fmtE(gp.v) : "à vendre"}`;
      el.addEventListener("click", ev => { ev.stopPropagation(); map.flyTo({ center: A.center, zoom: 14.8, pitch: 50, duration: 1100 }); });
      tagMarks.push(new maplibregl.Marker({ element: el }).setLngLat(A.center).addTo(map));
    }
    return;
  }
  const b = map.getBounds();
  items = items.map(it => ({ ...it, ll: centerOf(it.g) })).filter(it => b.contains(it.ll)).slice(0, 60);
  for (const it of items) {
    const el = document.createElement("button"); el.className = "pricetag num" + (it.mine ? " mine" : ""); el.textContent = it.mine ? fmtE(it.v) : "À vendre";
    el.addEventListener("click", ev => { ev.stopPropagation(); previewBuilding(it.g); }); tagMarks.push(new maplibregl.Marker({ element: el }).setLngLat(it.ll).addTo(map));
  }
}
function renderFilterCounts() {
  $("#n-mine").textContent = ST.mine.size + ST.mineParts.size ? `(${ST.mine.size + ST.mineParts.size})` : "";
  $("#n-sale").textContent = ST.sale.size ? `(${ST.sale.size})` : "";
}
// bandeau « résultats » en haut de la carte
function seatCounts() { const s = {}; for (const m of ST.mayors) if (m?.party) s[m.party] = (s[m.party] || 0) + 1; return s; }
function renderScore() {
  const s = seatCounts(), tot = Object.values(s).reduce((a, b) => a + b, 0);
  const lead = Object.entries(s).sort((a, b) => b[1] - a[1])[0];
  const w = ST.state?.week;
  $("#score").innerHTML = `<div class="t"><span>Hôtel de Ville${w?.party ? ` · cette semaine : <b style="color:${PARTIES[w.party]?.c}">${esc(PARTIES[w.party]?.n || "")}</b>` : ""}</span><b>${tot}/20 maires</b></div>
    <div class="seats">${PARTY_ORDER.map(k => s[k] ? `<i style="width:${s[k] * 5}%;background:${PARTIES[k].c}"></i>` : "").join("")}</div>
    <div class="leg">${PARTY_ORDER.filter(k => s[k]).map(k => `<span>${emblemSVG(k, 14)}${esc(PARTIES[k].n)} ${s[k]}</span>`).join("") || `<span>Aucun maire élu pour l'instant</span>`}</div>`;
}
async function loadAllProgressive() {
  const c = map.getCenter(); const order = IDX.arr.map((a, i) => [i, Math.hypot(a.center[0] - c.lng, a.center[1] - c.lat)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
  let k = 0; const worker = async () => { while (k < order.length) { const i = order[k++]; try { await loadArr(i); } catch (e) { console.warn(e); } } };
  await Promise.all([worker(), worker(), worker()]);
}
function centerOf(g) { const c = card(g); const A = ARR[ai(g)]; const r = decodeRing(A.geo[li(g)][0]); let x = 0, y = 0; r.forEach(p => { x += p[0]; y += p[1]; }); return [x / r.length, y / r.length]; }
function flyTo(g) { if (!map || !mapReady) return; const m = IDX.models.find(x => x.g === g); map.flyTo({ center: m ? [m.lon, m.lat] : centerOf(g), zoom: m ? Math.max(15.6, 16.8 - m.h / 150) : 17, pitch: 58, duration: 1300 }); }
function showOnMap(g) { go("map"); setTimeout(() => { flyTo(g); previewBuilding(g); }, 80); }

async function previewBuilding(g) {
  await ensureCards([g]); const c = card(g); if (!c) return; sel = g; paintAll(); closeSearch();
  const ks = ST.mine.get(g), np = ST.mineParts.get(g); const o = ST.own.get(g);
  const owned = c.lk === "p" ? (o?.parts || 0) : (o?.n || 0);
  const mine = ks ? itemLabel(c, { t: "own", ks, n: 0 }) : np ? itemLabel(c, { t: "own", ks: [], n: np }) : null;
  const pv = $("#preview"); pv.hidden = false;
  pv.innerHTML = `<div class="th">${photo(c)}</div><div class="t"><b>${esc(title(c))}</b><span>${ord(c.arr)} arr. · ${esc(kindLabel(c))}</span>
    <div class="meta">${rarSq(c.r)}${mine ? `<span class="pill" style="background:var(--mine);color:#fff">À vous · ${esc(mine)}</span>` : `<span class="pill num">${c.lk === "p" ? `${fmtN(owned)}/${fmtN(c.lots)} parts prises` : `${owned}/${c.lots} pris`}</span>`}${ST.sale.has(g) ? `<span class="pill" style="background:var(--sale);color:#fff">En vente</span>` : ""}</div>
    <div class="meta num"><b>${fmtE(c.v)}</b><span class="muted">${c.lk === "p" ? "la part" : c.lk === "l" ? "le logement" : "le local"}</span><b class="green">+${fmtE(c.rent)}/j</b></div>
    <button class="btn sm" data-open="${g}">Voir la fiche</button></div><button class="x" data-closepv aria-label="Fermer">×</button>`;
}
function hidePreview() { const pv = $("#preview"); if (pv && !pv.hidden) { pv.hidden = true; sel = null; paintAll(); } }
function closeSearch() { $("#search").hidden = true; }

function initMapUI() {
  $("#preview").addEventListener("click", e => { if (e.target.closest("[data-closepv]")) return hidePreview(); const o = e.target.closest("[data-open]"); if (o) push("b", +o.dataset.open); });
  $("#filter").addEventListener("click", e => {
    const b = e.target.closest("[data-m]"); if (!b) return; mode = b.dataset.m;
    $$("#filter button").forEach(x => x.setAttribute("aria-selected", x === b)); hidePreview(); applyMode();
    if (mode === "mine") { const hs = holdings(); if (hs.length) { const pts = hs.map(h => centerOf(h.g)); const lo = pts.map(p => p[0]), la = pts.map(p => p[1]); map.fitBounds([[Math.min(...lo), Math.min(...la)], [Math.max(...lo), Math.max(...la)]], { padding: 90, maxZoom: 15.5, pitch: 45, duration: 1100 }); } else toast("Vous n'avez encore aucun bien : ouvrez un booster !"); }
  });
  $("#t-home").addEventListener("click", () => map.flyTo({ center: [2.3420, 48.8580], zoom: 11.9, pitch: 35, bearing: -14, duration: 1200 }));
  $("#t-north").addEventListener("click", () => map.easeTo({ bearing: 0, duration: 600 }));
  $("#t-tilt").addEventListener("click", () => map.easeTo({ pitch: map.getPitch() > 20 ? 0 : 58, duration: 700 }));
  $("#t-search").addEventListener("click", e => { e.stopPropagation(); const s = $("#search"); s.hidden = !s.hidden; if (!s.hidden) $("#q").focus(); });
  document.addEventListener("pointerdown", e => { if (!$("#search").hidden && !e.target.closest("#search,#t-search")) closeSearch(); });
  $("#q").addEventListener("input", () => {
    const v = $("#q").value.trim().toLowerCase(); const out = $("#results"); if (v.length < 2) { out.innerHTML = ""; return; }
    const hits = [];
    for (const [g, n, r] of IDX.mons) { if (n.toLowerCase().includes(v)) hits.push([0, ORDER.indexOf(r), g, cap(n), r]); if (hits.length > 40) break; }
    const ia = FIELDS.indexOf("adr"), ir = FIELDS.indexOf("r");
    for (let i = 0; i < 20 && hits.length < 60; i++) { const A = ARR[i]; if (!A?.cards) continue; A.cards.forEach((row, k) => { const a = row[ia]; if (a && a.toLowerCase().includes(v) && hits.length < 60) hits.push([1, ORDER.indexOf(row[ir]), i * 1e5 + k, a, row[ir]]); }); }
    hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    out.innerHTML = hits.length ? hits.slice(0, 14).map(h => `<button data-g="${h[2]}">${rarSq(h[4])}${esc(h[3])}<small>${ord(IDX.arr[ai(h[2])].n)} arr.</small></button>`).join("") : `<p class="sub" style="padding:8px 10px;margin:0">Aucun résultat.</p>`;
  });
  $("#results").addEventListener("click", async e => { const b = e.target.closest("[data-g]"); if (!b) return; const g = +b.dataset.g; closeSearch(); await ensureCards([g]); flyTo(g); previewBuilding(g); });
}
