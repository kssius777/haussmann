"use strict";
// =====================================================================
//  Carte 3D de Paris : écran d'accueil, couleurs « soirée électorale »
// =====================================================================
let map = null, mapReady = false, mode = "all", sel = null;
const hideSet = new Set(), lastState = new Map(); let painted = new Set();
// Palette « Paris » : pierre de taille et toits en zinc
// (les toits sont un gris chaud clair : un Paris beige, pas bleu ; les immeubles des autres joueurs sont en terre cuite)
// thème « Blanc pur » : Paris en maquette blanche, seules les infos de jeu sont en couleur
// Couleurs des immeubles et du sol : « Pierre & zinc » le jour ; decor.js les fait varier avec l'heure réelle à Paris (coucher de soleil, nuit)
const MC = { mine: "#2563EB", mineB: "#BFD2FB", theirs: "#F4B4A5", theirsB: "#FCEDE9", sale: "#F5A524", saleB: "#FCE1AE",
  sel: "#0B0C10", selB: "#9DB4F7", mute: "#F4EEE3", muteR: "#E3DDD2", stone: "#F5E6CB", zinc: "#A9B4C4",
  rarM: "#B98AE8", rarMB: "#EBDDF9", rarL: "#E2B23A", rarLB: "#F8E7B8", lit: "#A9B4C4", litB: "#F5E6CB", lit2B: "#F5E6CB" };
const GROUND = { bg: "#EEE8DC", parks: "#A8D38C", water: "#6DB3E2", major: "#FFFDF8", majorCase: "#DDD3C1", road: "#FFFDF8", arrline: "#FFFFFF",
  names: "#5B6270", namesHalo: "#FFFFFF", shadow: "#5A4A30", shadowOp: .14, glow: 0,
  light: { anchor: "viewport", color: "#FFF4E0", intensity: .42, position: [1.15, 220, 55] },
  sky: { "sky-color": "#A9CBEF", "horizon-color": "#FFF3E2", "fog-color": "#F2ECE2", "sky-horizon-blend": .55, "horizon-fog-blend": .6, "fog-ground-blend": .8, "atmosphere-blend": 0 } };
// ombre portée des immeubles sur le sol (un simple décalage de leur emprise)
const SHADOW_T = ["interpolate", ["linear"], ["zoom"], 13.5, ["literal", [1.5, 1]], 15, ["literal", [5, 3.5]], 16, ["literal", [10, 7]], 18, ["literal", [38, 27]]];

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
  const st = ["coalesce", ["feature-state", "s"], 0], se = ["boolean", ["feature-state", "sel"], false], tg = ["coalesce", ["feature-state", "tgt"], 0], nr = ["coalesce", ["feature-state", "near"], 0];
  const rarR = d => ["match", ["get", "r"], "M", MC.rarM, "L", MC.rarL, d], rarB = d => ["match", ["get", "r"], "M", MC.rarMB, "L", MC.rarLB, d];
  const lit = (d, a, b) => ["case", ["==", ["%", ["id"], 5], 0], a, ["==", ["%", ["id"], 7], 1], b, d];   // la nuit, des fenêtres allumées
  if (m === "mine") return { roof: ["case", se, MC.sel, [">=", st, 3], MC.mine, MC.muteR], body: ["case", se, MC.selB, [">=", st, 3], MC.mineB, MC.mute] };
  if (m === "sale") return { roof: ["case", se, MC.sel, ["==", st, 4], MC.sale, MC.muteR], body: ["case", se, MC.selB, ["==", st, 4], MC.saleB, MC.mute] };
  return { roof: ["case", ["==", tg, 2], "#A855F7", ["==", tg, 1], "#FACC15", se, MC.sel, [">=", st, 3], MC.mine, ["==", st, 4], MC.sale, ["==", nr, 1], "#4FCB7E", ["==", st, 2], MC.theirs, rarR(lit(MC.zinc, MC.lit, MC.lit))],
           body: ["case", ["==", tg, 2], "#D8B4FE", ["==", tg, 1], "#FDE68A", se, MC.selB, [">=", st, 3], MC.mineB, ["==", st, 4], MC.saleB, ["==", nr, 1], "#E3F4E8", ["==", st, 2], MC.theirsB, rarB(lit(MC.stone, MC.litB, MC.lit2B))] };
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
    map.addLayer({ id: "sh" + i, type: "fill", source: "b" + i, minzoom: 13.5, paint: { "fill-color": GROUND.shadow, "fill-opacity": GROUND.shadowOp, "fill-translate": SHADOW_T, "fill-translate-anchor": "map" } }, "anchor-g");
    map.addLayer({ id: "rd" + i, type: "line", source: "r" + i, minzoom: 14, paint: { "line-color": GROUND.road, "line-opacity": .95, "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 14, ["match", ["get", "k"], 1, 1.2, .5], 18, ["match", ["get", "k"], 1, 10, 3]] } }, "sh" + i);
    map.addLayer({ id: "bd" + i, type: "fill-extrusion", source: "b" + i, minzoom: 12.6, paint: { "fill-extrusion-color": e.body, "fill-extrusion-height": ["-", ["get", "h"], 1], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true } }, "anchor-top");
    map.addLayer({ id: "rf" + i, type: "fill-extrusion", source: "b" + i, minzoom: 15.2, paint: { "fill-extrusion-color": e.roof, "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": ["-", ["get", "h"], 1], "fill-extrusion-opacity": 1 } }, "anchor-top");
    for (const L of ["bd" + i, "rf" + i]) {
      map.on("click", L, ev => { const f = ev.features[0]; if (f) { ev.preventDefault(); onBuildingTap(f.id); } });
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
  painted = want; renderMarks(); renderTags(); renderScore(); renderFilterCounts(); paintTargets();
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
  map.setPaintProperty("arrfill", "fill-opacity", mode === "all" ? ["interpolate", ["linear"], ["zoom"], 11, .62, 12.6, .45, 13.2, .12, 13.8, 0] : ["interpolate", ["linear"], ["zoom"], 11, .18, 14, 0]);
  renderTags(); renderMarks();
}

function buildMap(base) {
  const outline = { type: "FeatureCollection", features: IDX.arr.map((a, i) => ({ type: "Feature", id: i, properties: { n: a.n }, geometry: { type: "MultiPolygon", coordinates: a.outline.map(r => { const d = decodeRing(r); return [d.concat([d[0]])]; }) } })) };
  const mfill = { type: "FeatureCollection", features: IDX.models.filter(m => m.g != null).map(m => {   // les décors sans carte (colonnes, tour de l'horloge de la gare de Lyon) ne sont pas cliquables
    const kx = 111320 * Math.cos(m.lat * Math.PI / 180), ky = 110574; const ca = Math.cos(m.ang), sa = Math.sin(m.ang);
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([u, v]) => { const x = u * m.L / 2, y = v * m.W / 2; return [m.lon + (x * ca - y * sa) / kx, m.lat + (x * sa + y * ca) / ky]; });
    return { type: "Feature", id: m.g, properties: {}, geometry: { type: "Polygon", coordinates: [pts] } }; }) };
  const ev = ST.state?.event;
  map = new maplibregl.Map({
    container: "map", attributionControl: false, center: [2.3440, 48.8566], zoom: 14.2, pitch: 55, bearing: 0, maxPitch: 75, minZoom: 10.8,
    maxBounds: [[2.16, 48.77], [2.54, 48.95]], fadeDuration: 0, dragRotate: true, touchPitch: true, pitchWithRotate: true,
    style: { version: 8, glyphs: "/fonts/{fontstack}/{range}.pbf",
      light: GROUND.light, sky: GROUND.sky,
      sources: { water: { type: "geojson", data: polysGeo(base.water) }, parks: { type: "geojson", data: polysGeo(base.parks) }, major: { type: "geojson", data: linesGeo(base.major) }, arr: { type: "geojson", data: outline }, mfill: { type: "geojson", data: mfill } },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": GROUND.bg } },
        { id: "arrfill", type: "fill", source: "arr", paint: { "fill-color": partyFill(), "fill-opacity": ["interpolate", ["linear"], ["zoom"], 11, .62, 12.6, .45, 13.2, .12, 13.8, 0] } },
        { id: "parks", type: "fill", source: "parks", paint: { "fill-color": GROUND.parks, "fill-opacity": 1 } },
        { id: "water", type: "fill", source: "water", paint: { "fill-color": GROUND.water } },
        { id: "major-case", type: "line", source: "major", paint: { "line-color": GROUND.majorCase, "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 11, ["match", ["get", "k"], 3, 1.6, .6], 18, ["match", ["get", "k"], 3, 34, 20]] } },
        { id: "major", type: "line", source: "major", paint: { "line-color": GROUND.major, "line-blur": GROUND.glow * 1.6, "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 11, ["match", ["get", "k"], 3, 1.2, .4], 18, ["match", ["get", "k"], 3, 30, 17]] } },
        { id: "mfill", type: "fill", source: "mfill", paint: { "fill-color": "#F5D98A", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 12, .35, 16, .25] } },
        { id: "mfill-line", type: "line", source: "mfill", paint: { "line-color": "#B8860B", "line-width": 1.5, "line-dasharray": [2, 1.5] } },
        { id: "anchor-g", type: "background", layout: { visibility: "none" }, paint: {} },   // sous ce repère : rues et ombres des arrondissements
        { id: "anchor-b", type: "background", layout: { visibility: "none" }, paint: {} },   // entre les deux : passants, voitures, trafic, sillages (life.js)
        { id: "arrline", type: "line", source: "arr", paint: { "line-color": GROUND.arrline, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.6, 16, 3] } },
        { id: "evline", type: "line", source: "arr", filter: ["==", ["id"], ev ? ev.arr - 1 : -1], paint: { "line-color": "#F59E0B", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 3, 16, 6], "line-dasharray": [2, 1.2] } },
        { id: "anchor-top", type: "background", layout: { visibility: "none" }, paint: {} }
      ] }
  });
  map.touchZoomRotate.enableRotation();
  // on ne peut pas dézoomer plus loin que « tout Paris remplit l'écran »
  const fitMin = () => { const c = map.cameraForBounds([[2.235, 48.818], [2.455, 48.900]], { padding: 8 }); if (c?.zoom) map.setMinZoom(Math.max(10.5, Math.min(12.6, c.zoom - .15))); };
  addEventListener("resize", () => setTimeout(fitMin, 50));
  map.on("load", () => { fitMin();
    mapReady = true; pumpGeo();
    if (window.THREE && window.addMonuments) addMonuments(map, IDX.models);
    map.on("click", "mfill", e => { const f = e.features[0]; if (f) onBuildingTap(f.id); });
    map.on("click", e => { if (e.defaultPrevented) return;
      // un toucher sur la carte ferme la case ouverte (comme la croix)
      if (panelKind === "land" && !moving) { justBought = null; if (landView) { landView = false; sel = null; paintAll(); if (false) $("#strip").hidden = false; } setMovebar(""); closeSearch(); return; }
      if (!map.queryRenderedFeatures(e.point).some(f => /^(bd|rf)\d|^mfill$/.test(f.layer.id))) hidePreview(); closeSearch(); });
    IDX.arr.forEach((a, i) => {
      const el = document.createElement("button"); el.className = "amark"; el.innerHTML = `<b>${ord(a.n)}</b><span id="am${i}"></span>`;
      el.addEventListener("click", ev => { ev.stopPropagation(); push("arr", i); });
      a.marker = new maplibregl.Marker({ element: el }).setLngLat(a.center).addTo(map);
    });
    buildMonMarkers(); buildParkLabels(); map.on("move", queueDeclutter); map.on("resize", queueDeclutter);
    map.on("zoom", renderMarks); map.on("zoomend", () => typeof declutterDest === "function" && declutterDest()); map.on("rotateend", () => typeof declutterDest === "function" && declutterDest()); map.on("moveend", renderTags);
    // la boussole n'apparaît que si la carte a été tournée ; elle remet le nord en haut
    map.on("rotate", () => { const b = map.getBearing(); $("#t-north").hidden = Math.abs(b) < 2; $("#needle").style.transform = `rotate(${-b}deg)`; });
    ARR.forEach((A, i) => { if (A?.cards) addArrToMap(i); });
    // noms des rues, comme sur une carte classique (données de la Ville de Paris), quand on zoome
    fetch("/data/streets.json").then(r => r.json()).then(list => {
      map.addSource("snames", { type: "geojson", data: { type: "FeatureCollection", features: list.map(([n, c]) => ({ type: "Feature", properties: { n }, geometry: { type: "LineString", coordinates: c } })) } });
      map.addLayer({ id: "snames", type: "symbol", source: "snames", minzoom: 15.3, layout: { "symbol-placement": "line", "text-field": ["get", "n"], "text-font": ["Noto Sans Medium"], "text-size": ["interpolate", ["linear"], ["zoom"], 15.3, 10.5, 18, 14], "text-max-angle": 30, "symbol-spacing": 320, "text-padding": 4 },
        paint: { "text-color": GROUND.names, "text-halo-color": GROUND.namesHalo, "text-halo-width": 1.6 } });
    }).catch(() => { });   // arrondissements chargés avant la carte (ex. celui du pion)
    updateArrFill(); applyMode(); paintAll(); initPawnLayers();
    loadAllProgressive();
  });
}
// les grands parcs et places, écrits sur la carte
const PARKS = [["Bois de Vincennes", 2.4350, 48.8280, 11], ["Bois de Boulogne", 2.2490, 48.8620, 11], ["Jardin du Luxembourg", 2.3370, 48.8465, 13], ["Jardin des Tuileries", 2.3270, 48.8635, 13], ["Parc des Buttes-Chaumont", 2.3830, 48.8800, 13], ["Parc Monceau", 2.3090, 48.8795, 13.5], ["Parc Montsouris", 2.3380, 48.8225, 13], ["Jardin des Plantes", 2.3600, 48.8430, 13], ["Parc de la Villette", 2.3910, 48.8930, 12.5], ["Parc de Bercy", 2.3830, 48.8345, 13.5], ["Champ-de-Mars", 2.2980, 48.8560, 13], ["Place de la Concorde", 2.3210, 48.8656, 13.5], ["Place de la Bastille", 2.3690, 48.8530, 13.5], ["Place de la République", 2.3640, 48.8675, 13.5], ["Place de la Nation", 2.3960, 48.8485, 13.5], ["Cimetière du Père-Lachaise", 2.3935, 48.8610, 12.5], ["Parc André-Citroën", 2.2750, 48.8410, 13.5], ["Parc Georges-Brassens", 2.2990, 48.8320, 14], ["Les Invalides", 2.3125, 48.8560, 13], ["Champs-Élysées", 2.3070, 48.8700, 13]];
const PLACES = [["La Seine", 2.2975, 48.8605, 12.5, "w"], ["La Seine", 2.3655, 48.8470, 13, "w"], ["Canal Saint-Martin", 2.3655, 48.8712, 13.4, "w"], ["Bassin de la Villette", 2.3772, 48.8856, 13.4, "w"], ["Canal de l'Ourcq", 2.3905, 48.8902, 13.6, "w"], ["Île de la Cité", 2.3445, 48.8547, 14, "w"], ["Île Saint-Louis", 2.3572, 48.8518, 14, "w"],
  ["Montmartre", 2.3405, 48.8868, 12.6, "q"], ["Le Marais", 2.3600, 48.8590, 12.6, "q"], ["Quartier latin", 2.3445, 48.8490, 12.6, "q"], ["Saint-Germain-des-Prés", 2.3335, 48.8538, 12.8, "q"], ["Belleville", 2.3825, 48.8720, 12.6, "q"], ["Pigalle", 2.3375, 48.8822, 13.2, "q"], ["Les Halles", 2.3460, 48.8618, 13.2, "q"], ["Opéra", 2.3320, 48.8712, 13.2, "q"], ["Montparnasse", 2.3240, 48.8425, 12.8, "q"], ["Batignolles", 2.3195, 48.8865, 13, "q"], ["Butte-aux-Cailles", 2.3505, 48.8275, 13.2, "q"], ["Bercy", 2.3860, 48.8340, 13, "q"], ["Trocadéro", 2.2875, 48.8620, 13, "q"], ["Bastille", 2.3700, 48.8540, 13.2, "q"], ["Oberkampf", 2.3740, 48.8650, 13.4, "q"], ["Saint-Michel", 2.3440, 48.8530, 14, "q"]];
let parkMarks = [];
function buildParkLabels() {
  parkMarks = [...PARKS, ...PLACES].map(([n, lon, lat, minz, k]) => { const el = document.createElement("div"); el.className = "plabel" + (k ? " " + k : ""); el.textContent = n; return { mk: new maplibregl.Marker({ element: el }).setLngLat([lon, lat]), minz, on: false }; });
}
// noms courts pour les étiquettes de la carte
const SHORT = { "Centre national d'art et de culture Georges-Pompidou": "Centre Pompidou", "cathédrale Notre-Dame de Paris": "Notre-Dame", "basilique du Sacré-Cœur de Montmartre": "Sacré-Cœur", "arc de triomphe de l'Étoile": "Arc de Triomphe", "palais de l'Élysée": "Élysée", "Paris-Nord": "Gare du Nord", "grande mosquée de Paris": "Grande Mosquée", "palais du Luxembourg": "Sénat (Luxembourg)", "Musée du Louvre": "Louvre", "église de la Madeleine": "La Madeleine", "palais Garnier": "Opéra Garnier", "catacombes de Paris": "Catacombes", "Palais Omnisports de Paris-Bercy": "Accor Arena (Bercy)", "Paris-Lyon": "Gare de Lyon", "Muséum national d'histoire naturelle": "Muséum", "hôtel de ville de Paris": "Hôtel de Ville", "conciergerie de Paris": "Conciergerie", "Paris-Est": "Gare de l'Est", "Paris-Montparnasse": "Gare Montparnasse", "Paris-Saint-Lazare": "Gare Saint-Lazare", "Paris-Austerlitz": "Gare d'Austerlitz", "obélisque de Louxor": "Obélisque", "Tombeau de l'Empereur Napoléon aux Invalides": "Les Invalides", "église Saint-Sulpice de Paris": "Saint-Sulpice", "église Saint-Eustache de Paris": "Saint-Eustache", "abbaye Royale de Saint-Germain-des-Prés": "Saint-Germain-des-Prés", "basilique Sainte-Clotilde": "Sainte-Clotilde", "église de la Sainte-Trinité de Paris": "La Trinité", "église Saint-Augustin de Paris": "Saint-Augustin", "église du Val-de-Grâce": "Val-de-Grâce", "église Saint-Étienne-du-Mont": "Saint-Étienne-du-Mont", "église Saint-Vincent-de-Paul": "Saint-Vincent-de-Paul", "église Saint-Ambroise": "Saint-Ambroise", "église Saint-Paul-Saint-Louis de Paris": "Saint-Paul", "arc de triomphe du Carrousel": "Arc du Carrousel", "opéra Bastille": "Opéra Bastille" };
const shortName = n => SHORT[n] || cap(n).replace(/^(Église|Musée|Théâtre|Hôtel|Palais|Basilique|Gare) /, "$1 ").replace(/ de Paris$/, "");
let monMarks = [];
function buildMonMarkers() {
  const withModel = new Set(IDX.models.map(x => x.g));
  monMarks = IDX.mons.filter(m => m[2] === "M" || m[2] === "L" || withModel.has(m[0])).map(([g, n, r, lon, lat]) => {
    const model = IDX.models.find(x => x.g === g); const el = document.createElement("button"); el.className = "mmark"; el.style.setProperty("--mc", RAR[r].c);
    el.innerHTML = `<i></i>${esc(shortName(n))}`;
    el.addEventListener("click", ev => { ev.stopPropagation(); onBuildingTap(g); });
    const mk = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(model ? [model.lon, model.lat] : [lon, lat]); if (model) mk.setOffset([0, -Math.min(140, model.h * .35)]);
    return { g, r, mk, el, on: false };
  });
}
// vue dézoomée : quel parti tient chaque mairie (légende en haut de la carte)
function renderPartyLegend(z) {
  let el = $("#partyleg"); if (!el) { el = document.createElement("div"); el.id = "partyleg"; el.onclick = () => { go("paris"); setTimeout(() => push("results"), 30); }; $("#p-map").appendChild(el); }
  const show = z < 13.4 && mode === "all" && !document.body.classList.contains("mymode") && !document.body.classList.contains("picking");
  document.body.classList.toggle("legon", show);
  el.hidden = !show; if (!show) return;
  const n = {}; ST.mayors.forEach(m => m && PARTIES[m.party] && (n[m.party] = (n[m.party] || 0) + 1));
  const free = 20 - Object.values(n).reduce((a, b) => a + b, 0);
  const html = PARTY_ORDER.filter(k => n[k]).sort((a, b) => n[b] - n[a]).map(k => `<span style="--pc:${PARTIES[k].c}" title="${esc(PARTIES[k].power)}">${emblemSVG(k, 16)}<b>${esc(PARTIES[k].n)}</b><em>${n[k]}</em></span>`).join("")
    + (free > 0 ? `<span class="free"><i></i><b>Sans maire</b><em>${free}</em></span>` : "");
  if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = `<p>Qui gouverne Paris</p><div>${html}</div>`; }
}
function renderMarks() {
  if (!mapReady) return; const z = map.getZoom();
  document.body.classList.toggle("zfar", z < 12.4);   // tout dézoomé : étiquettes réduites, sans le nom des maires
  IDX.arr.forEach((a, i) => {
    const el = a.marker?.getElement(); if (!el) return; el.style.display = z < 14 && mode === "all" ? "" : "none";
    const m = ST.mayors[i]; el.style.setProperty("--pc", m ? PARTIES[m.party]?.c || "#64748B" : "#94A3B8");
    const s = document.getElementById("am" + i); if (s) s.innerHTML = stripByArr ? (stripByArr[i] ? `${stripByArr[i]} bien${stripByArr[i] > 1 ? "s" : ""}` : "") : "";   // le nom du maire : en touchant l'arrondissement (moins chargé)
    el.classList.toggle("has", !!(stripByArr && stripByArr[i])); el.classList.toggle("none", !!(stripByArr && !stripByArr[i]));
    const bb = el.querySelector("b"), key = (m?.party || "") + a.n; if (bb && bb.dataset.k !== key) { bb.dataset.k = key; bb.innerHTML = (m && PARTIES[m.party] ? emblemSVG(m.party, 16) : "") + ord(a.n); }
  });
  renderPartyLegend(z);
  // noms des quartiers et des parcs : un peu plus tard qu'avant (carte moins chargée)
  for (const p of parkMarks) { const show = z >= p.minz + (p.minz < 12.6 ? 0 : .6) && z < 17.5; if (show && !p.on) { p.mk.addTo(map); p.on = true; } else if (!show && p.on) { p.mk.remove(); p.on = false; } }
  for (const m of monMarks) {
    const show = z >= (m.r === "M" ? (innerWidth < 700 ? 13.8 : 13.4) : 14.4); m.el.classList.toggle("far", z < (m.r === "M" ? (innerWidth < 700 ? 14.8 : 14.4) : 15.5)); if (show && !m.on) { m.mk.addTo(map); m.on = true; } else if (!show && m.on) { m.mk.remove(); m.on = false; }
    if (show && !m.ph) { const c = card(m.g); if (c) { m.ph = true; if (c.ph) m.el.querySelector("i").setAttribute("style", phStyle(c)); } }
  }
  queueDeclutter();
}
// téléphone : pas de noms de lieux collés sous les barres du haut (19/10/2026, demande du propriétaire : « ne pas surcharger la partie haute »)
let topLim = 0, dtRaf = 0;
function declutterTop() {
  if (!mapReady) return;
  topLim = 0;
  if (innerWidth < 900 && document.body.classList.contains("mapfull")) {
    const rs = [...document.querySelectorAll("#bar .wallet,#credbar,#filter")].map(e => e.getBoundingClientRect()).filter(r => r.height > 0 && r.bottom < innerHeight / 2);
    if (rs.length) topLim = Math.max(...rs.map(r => r.bottom)) + 6;
  }
  const c = map.getContainer().getBoundingClientRect().top;
  const chk = (mk, el, h, bottom) => { if (!el) return; let hide = false;
    if (topLim) { const p = map.project(mk.getLngLat()), y = c + p.y + mk.getOffset().y; hide = (bottom ? y - h : y - h / 2) < topLim; }
    if (el.classList.contains("undertop") !== hide) el.classList.toggle("undertop", hide); };
  for (const m of monMarks) if (m.on) chk(m.mk, m.el, 34, true);
  for (const p of parkMarks) if (p.on) chk(p.mk, p.mk.getElement(), 18, false);
  for (const a of IDX.arr) if (a.marker) chk(a.marker, a.marker.getElement(), 30, false);
}
function queueDeclutter() { if (!dtRaf) dtRaf = requestAnimationFrame(() => { dtRaf = 0; declutterTop(); }); }
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
  const s = seatCounts(), tot = ST.mayors.filter(Boolean).length, none = tot - Object.values(s).reduce((a, b) => a + b, 0);
  const lead = Object.entries(s).sort((a, b) => b[1] - a[1])[0];
  const w = ST.state?.week;
  const lk = lead && lead[1] ? lead[0] : null;
  $("#score").innerHTML = `<div class="t">${lk ? `${emblemSVG(lk, 16)}<b style="color:${PARTIES[lk].c}">${esc(PARTIES[lk].n)}</b><span>mène</span>` : `<span>🏛 ${tot ? "Hôtel de Ville" : "Aucun maire élu"}</span>`}<em>${lk ? `${s[lk]} mairie${s[lk] > 1 ? "s" : ""} sur 20` : `${tot} maire${tot > 1 ? "s" : ""} élu${tot > 1 ? "s" : ""}`}</em></div>
    <div class="seats">${PARTY_ORDER.map(k => s[k] ? `<i style="width:${s[k] * 5}%;background:${PARTIES[k].c}"></i>` : "").join("")}${none ? `<i style="width:${none * 5}%;background:#94A3B8"></i>` : ""}</div>`;
}
async function loadAllProgressive() {
  const c = map.getCenter(); const order = IDX.arr.map((a, i) => [i, Math.hypot(a.center[0] - c.lng, a.center[1] - c.lat)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
  let k = 0; const worker = async () => { while (k < order.length) { const i = order[k++]; try { await loadArr(i); } catch (e) { console.warn(e); } } };
  await Promise.all([worker(), worker(), worker()]);
}
function centerOf(g) { const c = card(g); const A = ARR[ai(g)]; const r = decodeRing(A.geo[li(g)][0]); let x = 0, y = 0; r.forEach(p => { x += p[0]; y += p[1]; }); return [x / r.length, y / r.length]; }
function flyTo(g) { if (!map || !mapReady) return; const m = IDX.models.find(x => x.g === g); map.flyTo({ center: m ? [m.lon, m.lat] : centerOf(g), zoom: m ? Math.max(15.6, 16.8 - m.h / 150) : 17, pitch: 58, duration: 1300 }); }
function showOnMap(g) { go("map"); setTimeout(() => { flyTo(g); previewBuilding(g); }, 80); }

// aperçu d'un immeuble : le même panneau que la case (à droite sur ordinateur, en bas sur téléphone)
async function previewBuilding(g) {
  await ensureCards([g]); if (!card(g)) return; closeSearch(); hideHint();
  if (g === landPos()) { landView = false; showLand(); } else showLand(null, g);
}
function hidePreview() { if (!moving && (panelKind !== "land" || landView)) { if (landView) { landView = false; sel = null; paintAll(); if (false) $("#strip").hidden = false; } setMovebar(""); } const pv = $("#preview"); if (pv && !pv.hidden) { pv.hidden = true; sel = null; paintAll(); if (false) $("#strip").hidden = false; } }
function closeSearch() { $("#search").hidden = true; }

function initMapUI() {
  $("#preview").addEventListener("click", async e => {
    if (e.target.closest("[data-closepv]")) return hidePreview();
    const o = e.target.closest("[data-open]"); if (o) return push("b", +o.dataset.open);
    const b = e.target.closest("[data-pvbuy]"); if (b) { const g = +b.dataset.pvbuy; b.disabled = true; b.textContent = "Achat…";
      if (await act("bank_buy", { p_card: g, p_k: null }, null)) { const c = card(g); celebrate(c); }
      previewBuilding(g); }
  });
  $("#filter").addEventListener("click", e => {
    const b = e.target.closest("[data-m]"); if (!b) return;
    // « Mes biens » / « À vendre » : la carte garde ses couleurs (les tiens sont déjà en bleu, à vendre en orange)
    // et une rangée de cartes s'ouvre en bas ; toucher une carte emmène à l'immeuble
    hidePreview(); showStrip(b.dataset.m);
  });
  $("#t-home").addEventListener("click", () => map.flyTo({ center: [2.3420, 48.8580], zoom: 11.9, pitch: 30, bearing: 0, duration: 1200 }));
  $("#t-north").addEventListener("click", () => map.easeTo({ bearing: 0, duration: 600 }));
  // sur téléphone, les filtres sont rangés derrière un bouton
  $("#t-filter").addEventListener("click", e => { e.stopPropagation(); $("#filter").classList.toggle("open"); });
  $("#filter").addEventListener("click", () => setTimeout(() => $("#filter").classList.remove("open"), 150));
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

// petit message d'aide sur la carte, jusqu'au premier achat ou aperçu
function showHint() { try { if (localStorage.getItem("hm_hint") || +(localStorage.getItem("hm_tut") || 99) < 99) return; } catch (e) { } if ($("#maphint")) return; const h = document.createElement("div"); h.id = "maphint"; h.innerHTML = "🎲 Lancez le dé, puis choisissez l'immeuble où votre montgolfière se pose. S'il est libre, achetez-le !"; $("#p-map").appendChild(h); }
function hideHint() { $("#maphint")?.remove(); try { localStorage.setItem("hm_hint", "1"); } catch (e) { } }
function celebrate(c) { toast(`Félicitations ! ${title(c)} est à vous. Loyer : +${fmtE(c.rent)}/jour`, "good"); if (window.confetti) confetti("#0EA5A0", 30); }

// ---- rangée de cartes en bas de la carte : mes biens / à vendre ----------------------------
let stripKind = "", stripPins = [];
function setStripPins(items) {
  stripPins.forEach(m => m.remove()); stripPins = [];
  for (const x of items || []) { const el = document.createElement("button"); el.className = "spin" + (stripKind === "sale" ? " sale" : ""); el.setAttribute("aria-label", title(x.c));
    el.addEventListener("click", ev => { ev.stopPropagation(); flyTo(x.g); previewBuilding(x.g); });
    stripPins.push(new maplibregl.Marker({ element: el }).setLngLat(centerOf(x.g)).addTo(map)); }
}
let stripByArr = null;
function stripCount(items) {
  stripByArr = new Array(20).fill(0); items.forEach(x => stripByArr[x.c.arr - 1]++);
  let el = $("#stripsum"); if (!el) { el = document.createElement("div"); el.id = "stripsum"; $("#p-map").appendChild(el); }
  const n = stripByArr.filter(Boolean).length, sale = stripKind === "sale";
  el.innerHTML = `<i class="${sale ? "sale" : ""}"></i><b>${items.length} ${sale ? (items.length > 1 ? "biens à vendre" : "bien à vendre") : (items.length > 1 ? "biens" : "bien")}</b><span>dans ${n} arrondissement${n > 1 ? "s" : ""} · touchez un point</span><button data-sclose aria-label="Fermer">×</button>`;
  el.hidden = false;
}
function showStrip(kind) {
  const el = $("#strip"); if (!el) return;
  $$("#filter button").forEach(x => x.setAttribute("aria-selected", x.dataset.m === (kind === "all" ? "all" : kind)));
  if (kind === "all" || kind === stripKind) { stripKind = ""; el.hidden = true; el.innerHTML = ""; setStripPins(null); document.body.classList.remove("mymode", "salemode"); stripByArr = null; $("#stripsum") && ($("#stripsum").hidden = true); applyMode(); renderMarks(); $$("#filter button").forEach(x => x.setAttribute("aria-selected", x.dataset.m === "all")); return; }
  stripKind = kind;
  const items = kind === "mine" ? holdings().sort((a, b) => b.c.v * unitsOf(b) - a.c.v * unitsOf(a)).map(h => ({ g: h.g, c: h.c, item: { t: "own", ks: h.ks, n: h.n } }))
    : [...ST.sale].map(g => ({ g, c: card(g) })).filter(x => x.c);
  if (!items.length) { stripKind = kind; showStrip("all"); return toast(kind === "mine" ? "Vous n'avez encore aucun bien : lancez le dé ou ouvrez un booster !" : "Rien à vendre en ce moment."); }
  // pas de rangée de cartes : seulement les points sur la carte (demande du propriétaire)
  el.hidden = true; setStripPins(items); document.body.classList.add("mymode"); document.body.classList.toggle("salemode", kind === "sale"); map.setPaintProperty("arrfill", "fill-opacity", 0);
  stripCount(items); renderMarks();
  // vue d'ensemble de Paris : on reste dézoomé, même s'il n'y a qu'un bien
  { const pts = items.map(x => centerOf(x.g)), lo = pts.map(p => p[0]), la = pts.map(p => p[1]);
    map.fitBounds([[Math.min(...lo, 2.27), Math.min(...la, 48.83)], [Math.max(...lo, 2.41), Math.max(...la, 48.89)]], { padding: { top: 70, bottom: 130, left: 20, right: 20 }, maxZoom: 13, pitch: 0, bearing: 0, duration: 900 }); }
  el.innerHTML = `<div class="sh"><b>${kind === "mine" ? `Mes biens · ${items.length}` : `À vendre · ${items.length}`}</b><span>Touchez une carte pour y aller</span><button class="x" data-sclose aria-label="Fermer">×</button></div>
    <div class="sr">${items.slice(0, 60).map(x => `<button data-sg="${x.g}">${cardHTML(x.c, { w: "96px", item: x.item })}<small>${ord(x.c.arr)} arr.</small></button>`).join("")}</div>`;
}
document.addEventListener("click", e => {
  if (e.target.closest("[data-sclose]")) return showStrip("all");
  const b = e.target.closest("#strip [data-sg]"); if (!b) return;
  const g = +b.dataset.sg; $$("#strip [data-sg]").forEach(x => x.classList.toggle("on", x === b));
  $("#strip").hidden = true;   // l'aperçu prend la place ; la rangée revient quand on le ferme
  ensureCards([g]).then(() => { flyTo(g); previewBuilding(g); });
});
