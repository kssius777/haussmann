"use strict";
// =====================================================================
//  Le pion et les dés : on lance, on choisit une destination parmi 3 ou 4
//  (une par direction), le pion y marche, puis on achète autour de lui.
// =====================================================================
const BUY_RADIUS = 150, LETTERS = "ABCD";
let pawnMk = null, pending = null, tgtMarks = [], painted_t = new Set(), moving = false, nearPainted = new Set(), panelKind = "";
const pawnPos = () => ST.state?.profile?.pos ?? null;
function distM(a, b) { const A = centerOf(a), B = centerOf(b); return Math.hypot((A[0] - B[0]) * 111320 * 0.6579, (A[1] - B[1]) * 110574); }
function farFromPawn(g) { const p = pawnPos(); if (p == null || !ARR[ai(p)]?.cards || !ARR[ai(g)]?.cards) return 0; const d = distM(p, g); return d > BUY_RADIUS ? d : 0; }
const fmtDist = d => d >= 1000 ? (d / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " km" : Math.round(d / 10) * 10 + " m";

// ---- calques : zone d'achat, itinéraires --------------------------------------
function circle(ll, r) { const pts = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; pts.push([ll[0] + r * Math.cos(a) / (111320 * 0.6579), ll[1] + r * Math.sin(a) / 110574]); } return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } }; }
const FC = f => ({ type: "FeatureCollection", features: f });
function initPawnLayers() {
  map.addSource("zone", { type: "geojson", data: FC([]) });
  map.addSource("routes", { type: "geojson", data: FC([]) });
  map.addSource("walked", { type: "geojson", data: FC([]) });
  map.addLayer({ id: "zone-fill", type: "fill", source: "zone", paint: { "fill-color": "#0EA5A0", "fill-opacity": .13 } }, "anchor-b");
  map.addLayer({ id: "zone-line", type: "line", source: "zone", paint: { "line-color": "#0EA5A0", "line-width": 3, "line-opacity": .9 } }, "anchor-b");
  map.addLayer({ id: "routes-case", type: "line", source: "routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 10, "line-opacity": .95 } });
  map.addLayer({ id: "routes", type: "line", source: "routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "c"], "line-width": 6, "line-dasharray": [1.4, 1] } });
  map.addLayer({ id: "walked", type: "line", source: "walked", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#0F1B2D", "line-width": 6 } });
  map.on("click", "routes", e => { const g = e.features[0]?.properties?.g; if (g && pending) { e.preventDefault(); doMove(+g); } });
  map.on("move", pawnOff); placePawn(true);
  if (ST.state?.profile?.dice) resumeRoll();
}
async function placePawn(fly) {
  const p = pawnPos(); if (p == null || !map) return; await ensureCards([p]);
  const ll = centerOf(p), pr = ST.state.profile, col = PARTIES[pr.party]?.c || "#0F1B2D";
  if (!pawnMk) { const el = document.createElement("div"); el.className = "pawn"; el.addEventListener("click", e => { e.stopPropagation(); showNearby(); }); pawnMk = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(ll).addTo(map); }
  pawnMk.getElement().innerHTML = `<em>Vous</em><i style="--pc:${col}"><svg viewBox="0 0 24 24" width="24" height="24" fill="#fff"><circle cx="12" cy="5.6" r="3.4"/><path d="M8.6 10.2h6.8l-1 2.2 1.9 5.6H7.7l1.9-5.6z"/><rect x="5.5" y="18.4" width="13" height="3.2" rx="1.6"/></svg></i><b></b><s></s>`;
  pawnMk.setLngLat(ll); map.getSource("zone")?.setData(circle(ll, BUY_RADIUS)); paintNear();
  if (fly) map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), 16.2), pitch: 50, duration: 900, offset: [0, -90] });
}

// ---- immeubles achetables autour du pion ---------------------------------------
const CEN = [];
function centersOf(i) {
  if (CEN[i]) return CEN[i]; const A = ARR[i]; if (!A?.geo) return null;
  const out = new Float64Array(A.geo.length * 2);
  A.geo.forEach((enc, k) => { const r = decodeRing(enc[0]); let x = 0, y = 0; r.forEach(p => { x += p[0]; y += p[1]; }); out[2 * k] = x / r.length; out[2 * k + 1] = y / r.length; });
  return (CEN[i] = out);
}
function freeOf(g) { const c = card(g); if (!c) return 0; const o = ST.own.get(g); return c.lots - (c.lk === "p" ? (o?.parts || 0) : (o?.n || 0)); }
function nearby() {
  const p = pawnPos(); if (p == null || !ARR[ai(p)]?.cards) return [];
  const [x0, y0] = centerOf(p), kx = 111320 * 0.6579, ky = 110574, out = [];
  for (let i = 0; i < 20; i++) {
    if (!ARR[i]?.cards) continue; const ac = IDX.arr[i].center; if (Math.hypot((ac[0] - x0) * kx, (ac[1] - y0) * ky) > 3500) continue;
    const C = centersOf(i); if (!C) continue;
    for (let k = 0; k < C.length / 2; k++) {
      const dx = (C[2 * k] - x0) * kx; if (dx > BUY_RADIUS || dx < -BUY_RADIUS) continue;
      const d = Math.hypot(dx, (C[2 * k + 1] - y0) * ky); if (d > BUY_RADIUS) continue;
      const g = i * 1e5 + k; if (hideSet.has(g) || freeOf(g) <= 0) continue; out.push({ g, d });
    }
  }
  const cash = liveCash(); out.forEach(o => o.ok = card(o.g).v <= cash);
  return out.sort((a, b) => (b.ok - a.ok) || a.d - b.d);
}
function paintNear() {
  if (!mapReady) return; const want = new Set(nearby().map(x => x.g));
  for (const g of new Set([...nearPainted, ...want])) if (map.getSource("b" + ai(g))) map.setFeatureState({ source: "b" + ai(g), id: g }, { near: want.has(g) ? 1 : 0 });
  nearPainted = want;
}

// ---- panneau du bas (destinations, arrivée, autour de moi) ---------------------
function setMovebar(html, kind) {
  const m = $("#movebar"); panelKind = html ? kind || "" : "";
  if (!html) { m.hidden = true; m.innerHTML = ""; } else { m.hidden = false; m.innerHTML = html; }
  $("#dicebar").classList.toggle("off", !!pending || moving);
}
function renderDice() {
  const p = ST.state?.profile; if (!p) return;
  const r = $("#b-roll"), left = p.rolls ?? 0;
  const wait = Math.max(0, (ST.state.roll_in || 0) - (performance.now() - ST.stAt) / 1000);
  r.querySelector("b").textContent = "Lancer le dé";
  $("#rolls").textContent = left > 0 ? `${left} lancer${left > 1 ? "s" : ""} dispo` : `prochain dans ${hm(wait)}`;
  r.disabled = left <= 0 || moving;
  $("#tps").textContent = `${p.tp ?? 0} restant${p.tp > 1 ? "s" : ""}`; $("#b-tp").disabled = !(p.tp > 0);
  $("#dicebar").classList.toggle("off", !!pending || moving);
}

// ---- lancer -----------------------------------------------------------------
async function doRoll() {
  if (moving || pending) return;
  const b = $("#b-roll"); b.disabled = true; hidePreview(); hideHint(); setMovebar("");
  let r; try { r = await rpc("roll"); } catch (e) { toast(e.message, "bad"); renderDice(); return; }
  if (!r.choices) { toast("Le jeu est en cours de mise à jour : réessayez dans quelques minutes.", "bad"); renderDice(); return; }
  setState(r.state); await animDice(r.die); await setPending(r); renderWallet();
}
async function resumeRoll() { try { const r = await rpc("roll"); if (!r.choices) return; setState(r.state); await setPending(r); } catch (e) { } }
const choiceColor = c => c.chance ? "#A855F7" : "#EAB308";
function smooth(pts) {   // adoucit le trajet d'immeuble en immeuble (Chaikin)
  let p = pts; for (let it = 0; it < 2; it++) { const q = [p[0]]; for (let i = 0; i < p.length - 1; i++) { const [a, b] = [p[i], p[i + 1]]; q.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } q.push(p[p.length - 1]); p = q; } return p;
}
function choiceTag(c) {
  if (c.chance) return ["ch", "🃏 Case Chance"];
  if (c.mine > 0) return ["home", "🏠 Chez vous"];
  if (c.toll) return ["toll", "💸 Péage à payer"];
  if (c.free > 0) return ["free", `🔑 ${c.free} libre${c.free > 1 ? "s" : ""}`];
  return ["", "Déjà pris"];
}
async function setPending(r) {
  pending = { die: r.die, steps: r.steps, choices: r.choices };
  await ensureCards(r.choices.flatMap(c => c.path));
  r.choices.forEach(c => c.line = smooth(c.path.map(centerOf)));
  map.getSource("routes")?.setData(FC(r.choices.map(c => ({ type: "Feature", properties: { c: choiceColor(c), g: c.card }, geometry: { type: "LineString", coordinates: c.line } }))));
  renderChoices(); renderDice(); paintTargets(); fitTargets();
}
function renderChoices() {
  if (!pending) return;
  setMovebar(`<div class="mvh"><div class="dmini">${dieHTML(pending.die)}</div><div><b>Où voulez-vous aller ?</b><span>Touchez une destination, ici ou sur la carte.</span></div></div>
    <div class="chs grid">${pending.choices.map((c, i) => { const cd = card(c.card), [cls, tag] = choiceTag(c);
      return `<button class="chc" data-dest="${c.card}"><i class="lt ${c.chance ? "ch" : ""}">${LETTERS[i]}</i><span class="t"><b>${esc(cd ? title(cd) : "")}</b><span class="tag ${cls}">${tag}</span></span></button>`; }).join("")}</div>`, "choose");
}
function fitTargets() {
  if (!pending) return; const pts = pending.choices.flatMap(c => c.line); const lo = pts.map(p => p[0]), la = pts.map(p => p[1]);
  const bottom = ($(".mapbottom")?.offsetHeight || 200) + 30;
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  map.fitBounds([[Math.min(...lo), Math.min(...la)], [Math.max(...lo), Math.max(...la)]], { padding: { top: 110, bottom, left: 30, right: 70 }, maxZoom: 17, pitch: 40, duration: 900 });
}
function paintTargets() {
  if (!mapReady) return;
  const want = new Map((pending?.choices || []).map(c => [c.card, c.chance ? 2 : 1]));
  for (const g of new Set([...painted_t, ...want.keys()])) { if (!map.getSource("b" + ai(g))) continue; map.setFeatureState({ source: "b" + ai(g), id: g }, { tgt: want.get(g) || 0 }); }
  painted_t = new Set([...want.keys()].filter(g => map.getSource("b" + ai(g))));
  tgtMarks.forEach(m => m.remove()); tgtMarks = [];
  (pending?.choices || []).forEach((c, i) => {
    const el = document.createElement("button"); el.className = "tgt" + (c.chance ? " ch" : ""); const [cls, tag] = choiceTag(c);
    el.innerHTML = `<i>${LETTERS[i]}</i><span class="${cls}">${tag}</span>`;
    el.addEventListener("click", e => { e.stopPropagation(); doMove(c.card); });
    tgtMarks.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(centerOf(c.card)).addTo(map));
  });
  paintNear();
}
function onBuildingTap(g) { if (pending && pending.choices.some(c => c.card === g)) return doMove(g); if (!pending) setMovebar(""); previewBuilding(g); }

// ---- se déplacer -------------------------------------------------------------
async function doMove(g) {
  if (moving || !pending) return; const ch = pending.choices.find(c => c.card === g); if (!ch) return;
  moving = true; hidePreview(); setMovebar(`<div class="mvh"><span class="pin">🚶</span><div><b>En route…</b><span>${esc(title(card(g)))}</span></div></div>`, "walk");
  let r; try { r = await rpc("move", { p_target: g }); } catch (e) { moving = false; toast(e.message, "bad"); renderChoices(); renderDice(); return; }
  const line = ch.line; pending = null;
  map.getSource("routes")?.setData(FC([])); paintTargets();
  tgtMarks.forEach(m => m.remove()); tgtMarks = [];
  map.getSource("zone")?.setData(FC([]));
  await walk(line, Math.min(3200, 900 + 90 * r.path.length));
  setState(r.state); map.getSource("walked")?.setData(FC([]));
  moving = false; await placePawn(false); map.easeTo({ center: centerOf(g), zoom: Math.max(map.getZoom(), 16.4), duration: 700, offset: [0, -130] });
  renderDice(); renderWallet(); landing(r.landing); hidePreviewOnly();
  refreshHold().then(refreshMap).then(() => { paintAll(); renderWallet(); if (panelKind === "near") landing(r.landing); }).catch(() => { });
}
function walk(line, ms) {   // le pion suit le trajet, la ligne parcourue se dessine derrière lui
  const seg = [0]; for (let i = 1; i < line.length; i++) seg.push(seg[i - 1] + Math.hypot((line[i][0] - line[i - 1][0]) * .66, line[i][1] - line[i - 1][1]));
  const L = seg[seg.length - 1] || 1, src = map.getSource("walked");
  return new Promise(res => {
    const t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / ms), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, at = e * L;
      let i = 1; while (i < line.length - 1 && seg[i] < at) i++;
      const f = (at - seg[i - 1]) / ((seg[i] - seg[i - 1]) || 1), p = [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * f, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * f];
      pawnMk.setLngLat(p); src?.setData(FC([{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [...line.slice(0, i), p] } }]));
      if (t < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}
function nearHTML() {
  const list = nearby(), cash = liveCash();
  if (!list.length) return `<p class="nearnone">Rien de libre dans votre cercle. Relancez les dés pour aller plus loin.</p>`;
  return `<div class="nearh"><b>À acheter autour de vous</b><span>${list.length} dans le cercle</span></div>
    <div class="nears">${list.slice(0, 12).map(({ g }) => { const c = card(g), f = freeOf(g);
      return `<div class="nc" data-ng="${g}"><span class="th">${photo(c)}</span><b>${esc(title(c))}</b><span class="muted">${f} libre${f > 1 ? "s" : ""} · ${rarSq(c.r, 14)}</span><span class="num"><b>${fmtE(c.v)}</b> <em class="green">+${fmtE(c.rent)}/j</em></span><button class="btn sm green" data-nbuy="${g}" ${cash < c.v ? "disabled" : ""}>Acheter</button></div>`; }).join("")}</div>`;
}
function landing(L) {
  const c = card(L.card); const lines = [];
  if (L.toll > 0) lines.push(`<span class="ln bad">💸 Péage : vous payez <b>${fmtE(L.toll)}</b> à ${L.payees.map(p => esc(p.pseudo)).join(", ")}</span>`);
  if (L.chance) { const ch = L.chance; const [nm] = CHANCE[ch.k] || ["Chance"]; lines.push(`<span class="ln ${BAD.has(ch.k) ? "bad" : "good"}">🃏 Case Chance : <b>${esc(nm)}</b> ${esc(chanceText(ch))}</span>`); if (window.confetti && !BAD.has(ch.k)) confetti("#A855F7", 24); }
  if (L.mine > 0) lines.push(`<span class="ln">🏠 Vous êtes chez vous : pas de péage.</span>`);
  setMovebar(`<div class="mvh"><span class="pin">📍</span><div><b>Vous êtes à ${esc(c ? title(c) : "")}</b><span>${c ? ord(c.arr) + " arrondissement" : ""}</span></div><button class="x" data-mvclose aria-label="Fermer">×</button></div>${lines.join("")}${nearHTML()}`, "near");
}
function showNearby() {
  if (pending || moving) return; hidePreview(); placePawn(true);
  const c = card(pawnPos());
  setMovebar(`<div class="mvh"><span class="pin">📍</span><div><b>Votre pion : ${esc(c ? title(c) : "")}</b><span>Vous pouvez acheter dans un rayon de ${BUY_RADIUS} m</span></div><button class="x" data-mvclose aria-label="Fermer">×</button></div>${nearHTML()}`, "near");
}

// ---- téléportation ------------------------------------------------------------
function openTeleport() {
  const hs = holdings().sort((a, b) => b.c.v * unitsOf(b) - a.c.v * unitsOf(a));
  if (!hs.length) return toast("Vous n'avez pas encore de bien où vous téléporter");
  setMovebar(`<div class="mvh"><span class="pin">✨</span><div><b>Se téléporter sur un de ses biens</b><span>${ST.state.profile.tp} téléportation${ST.state.profile.tp > 1 ? "s" : ""} restante${ST.state.profile.tp > 1 ? "s" : ""} aujourd'hui</span></div><button class="x" data-mvclose aria-label="Fermer">×</button></div>
    <div class="chs tpl">${hs.slice(0, 30).map(h => `<button class="chc" data-tpgo="${h.g}"><span class="th">${photo(h.c)}</span><span class="t"><b>${esc(title(h.c))}</b><span class="tag">${ord(h.c.arr)} arr. · ${esc(itemLabel(h.c, { t: "own", ks: h.ks, n: h.n }))}</span></span><span class="go">${pawnPos() != null && ARR[ai(pawnPos())]?.cards ? fmtDist(distM(pawnPos(), h.g)) : "›"}</span></button>`).join("")}</div>`, "tp");
}
async function doTeleport(g) {
  try { setState(await rpc("teleport", { p_card: g })); } catch (e) { return toast(e.message, "bad"); }
  pending = null; paintTargets(); setMovebar(""); hidePreview(); await placePawn(true); renderDice(); toast("Téléportation réussie ✨", "good"); showNearby();
}

// ---- les dés en animation -----------------------------------------------------
// un seul dé, de 1 à 10 : une face avec un grand chiffre
const dieHTML = n => `<div class="die"><b>${n}</b></div>`;
async function animDice(n) {
  const D = $("#dice3d"); D.hidden = false;
  for (let i = 0; i < 10; i++) { D.innerHTML = `<div class="dice rolling">${dieHTML(1 + Math.floor(Math.random() * 10))}</div>`; await sleep(70); }
  D.innerHTML = `<div class="dice">${dieHTML(n)}</div>`; await sleep(650);
  D.hidden = true;
}

function initPawnUI() {
  $("#b-roll").addEventListener("click", doRoll);
  $("#b-tp").addEventListener("click", openTeleport);
  $("#b-me").addEventListener("click", showNearby);
  $("#movebar").addEventListener("click", async e => {
    if (e.target.closest("[data-mvclose]")) return setMovebar("");
    const go = e.target.closest("[data-dest]"); if (go) return doMove(+go.dataset.dest);
    const tp = e.target.closest("[data-tpgo]"); if (tp) return doTeleport(+tp.dataset.tpgo);
    const nb = e.target.closest("[data-nbuy]"); if (nb) { const g = +nb.dataset.nbuy; nb.disabled = true; nb.textContent = "Achat…";
      if (await act("bank_buy", { p_card: g, p_k: null }, null)) celebrate(card(g));
      const sc = $("#movebar .nears")?.scrollLeft || 0; showNearbyKeep(); const n2 = $("#movebar .nears"); if (n2) n2.scrollLeft = sc; return; }
    const nc = e.target.closest("[data-ng]"); if (nc) return push("b", +nc.dataset.ng);
  });
  setInterval(() => { if (cur() === "map") renderDice(); }, 15000);
  $("#pawnoff").addEventListener("click", () => placePawn(true));
}
function showNearbyKeep() { const head = $("#movebar .mvh")?.outerHTML || ""; const lines = [...$$("#movebar > .ln")].map(x => x.outerHTML).join(""); setMovebar(head + lines + nearHTML(), "near"); paintNear(); }

// quand le pion sort de l'écran : une flèche au bord indique où il est
function pawnOff() {
  const el = $("#pawnoff"); if (!pawnMk || !el) return;
  const W = map.getContainer().clientWidth, H = map.getContainer().clientHeight, pt = map.project(pawnMk.getLngLat());
  const top = 110, bot = H - (($(".mapbottom")?.offsetHeight || 80) + 24), left = 30, right = W - 30;
  if (pt.x > left && pt.x < right && pt.y > top && pt.y < bot) { el.hidden = true; return; }
  const cx = W / 2, cy = (top + bot) / 2, dx = pt.x - cx, dy = pt.y - cy;
  const k = Math.min((right - 50 - cx) / Math.abs(dx || 1e-6), (bot - 20 - cy) / Math.abs(dy || 1e-6));
  el.hidden = false; el.style.left = (cx + dx * k) + "px"; el.style.top = (cy + dy * k) + "px";
  el.querySelector("i").style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI + 90}deg)`;
  const d = pawnPos() != null ? map.getCenter().distanceTo(pawnMk.getLngLat()) : 0;
  el.querySelector("span").textContent = "Votre pion · " + fmtDist(d);
}
function hidePreviewOnly() { const pv = $("#preview"); if (pv && !pv.hidden) { pv.hidden = true; sel = null; paintAll(); } }
