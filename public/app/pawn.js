"use strict";
// =====================================================================
//  Le pion et les dés : on avance dans les rues de Paris, on achète
//  autour de soi, on paie un péage chez les autres.
// =====================================================================
const BUY_RADIUS = 150;
let pawnMk = null, pending = null, tgtMarks = [], painted_t = new Set(), moving = false;
const pawnPos = () => ST.state?.profile?.pos ?? null;
function distM(a, b) { const A = centerOf(a), B = centerOf(b); return Math.hypot((A[0] - B[0]) * 111320 * 0.6579, (A[1] - B[1]) * 110574); }
function farFromPawn(g) { const p = pawnPos(); if (p == null || !ARR[ai(p)]?.cards || !ARR[ai(g)]?.cards) return 0; const d = distM(p, g); return d > BUY_RADIUS ? d : 0; }
const fmtDist = d => d >= 1000 ? (d / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " km" : Math.round(d / 10) * 10 + " m";

// ---- pion et zone d'achat -------------------------------------------------
function circle(ll, r) { const pts = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; pts.push([ll[0] + r * Math.cos(a) / (111320 * 0.6579), ll[1] + r * Math.sin(a) / 110574]); } return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } }; }
function initPawnLayers() {
  map.addSource("zone", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "zone-fill", type: "fill", source: "zone", paint: { "fill-color": "#0EA5A0", "fill-opacity": .1 } }, "anchor-b");
  map.addLayer({ id: "zone-line", type: "line", source: "zone", paint: { "line-color": "#0EA5A0", "line-width": 2, "line-dasharray": [2, 1.5], "line-opacity": .8 } }, "anchor-b");
  placePawn(true);
}
async function placePawn(fly) {
  const p = pawnPos(); if (p == null || !map) return; await ensureCards([p]);
  const ll = centerOf(p), pr = ST.state.profile, col = PARTIES[pr.party]?.c || "#0F1B2D";
  if (!pawnMk) { const el = document.createElement("div"); el.className = "pawn"; el.addEventListener("click", e => { e.stopPropagation(); previewBuilding(pawnPos()); }); pawnMk = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(ll).addTo(map); }
  pawnMk.getElement().innerHTML = `<i style="--pc:${col}">${esc((pr.pseudo || "?")[0].toUpperCase())}</i><b></b>`;
  pawnMk.setLngLat(ll); map.getSource("zone")?.setData(circle(ll, BUY_RADIUS));
  if (fly) map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), 16), pitch: 55, duration: 900 });
}

// ---- barre des dés ----------------------------------------------------------
function renderDice() {
  const p = ST.state?.profile; if (!p) return;
  const r = $("#b-roll"); const left = p.rolls ?? 0;
  if (pending) { r.querySelector("b").textContent = "Choisir une case"; $("#rolls").textContent = `${pending.n} pas à faire`; r.disabled = false; }
  else {
    r.querySelector("b").textContent = "Lancer les dés";
    const wait = Math.max(0, (ST.state.roll_in || 0) - (performance.now() - ST.stAt) / 1000);
    $("#rolls").textContent = left > 0 ? `${left} lancer${left > 1 ? "s" : ""} dispo` : `prochain dans ${hm(wait)}`;
    r.disabled = left <= 0;
  }
  $("#tps").textContent = `${p.tp ?? 0} restant${p.tp > 1 ? "s" : ""}`; $("#b-tp").disabled = !(p.tp > 0);
}
function setMovebar(html) { const m = $("#movebar"); if (!html) { m.hidden = true; m.innerHTML = ""; return; } m.hidden = false; m.innerHTML = html; }

// ---- lancer -----------------------------------------------------------------
async function doRoll() {
  if (moving) return;
  if (pending) { fitTargets(); return; }
  const b = $("#b-roll"); b.disabled = true; hidePreview(); hideHint();
  let r; try { r = await rpc("roll"); } catch (e) { toast(e.message, "bad"); renderDice(); return; }
  setState(r.state); await animDice(r.dice);
  await setPending(r); renderDice(); renderWallet();
}
async function setPending(r) {
  pending = { dice: r.dice, n: r.dice[0] + r.dice[1], targets: new Set(r.targets), chance: new Set(r.chance) };
  await ensureCards([...pending.targets]);
  paintTargets(); fitTargets();
  setMovebar(`<b>🎲 ${r.dice[0]} + ${r.dice[1]} = ${pending.n} pas</b><span>Touchez une case jaune pour y aller${pending.chance.size ? " · violet = case Chance" : ""}</span>`);
}
function fitTargets() {
  if (!pending) return; const pts = [...pending.targets, pawnPos()].map(centerOf); const lo = pts.map(p => p[0]), la = pts.map(p => p[1]);
  map.fitBounds([[Math.min(...lo), Math.min(...la)], [Math.max(...lo), Math.max(...la)]], { padding: { top: 140, bottom: 200, left: 50, right: 50 }, maxZoom: 17, pitch: 50, duration: 900 });
}
function paintTargets() {
  if (!mapReady) return;
  const want = pending ? pending.targets : new Set();
  for (const g of new Set([...painted_t, ...want])) { if (!map.getSource("b" + ai(g))) continue; map.setFeatureState({ source: "b" + ai(g), id: g }, { tgt: want.has(g) ? (pending.chance.has(g) ? 2 : 1) : 0 }); }
  painted_t = new Set([...want].filter(g => map.getSource("b" + ai(g))));
  tgtMarks.forEach(m => m.remove()); tgtMarks = [];
  for (const g of want) {
    const el = document.createElement("button"); el.className = "tgt" + (pending.chance.has(g) ? " ch" : ""); el.innerHTML = pending.chance.has(g) ? "?" : "";
    el.addEventListener("click", e => { e.stopPropagation(); doMove(g); });
    tgtMarks.push(new maplibregl.Marker({ element: el }).setLngLat(centerOf(g)).addTo(map));
  }
}
function onBuildingTap(g) { if (pending && pending.targets.has(g)) return doMove(g); if (!pending) setMovebar(""); previewBuilding(g); }

// ---- se déplacer -------------------------------------------------------------
async function doMove(g) {
  if (moving) return; moving = true; hidePreview();
  let r; try { r = await rpc("move", { p_target: g }); } catch (e) { moving = false; toast(e.message, "bad"); return; }
  pending = null; paintTargets(); setMovebar("");
  await ensureCards(r.path);
  for (let i = 1; i < r.path.length; i++) {
    const ll = centerOf(r.path[i]); pawnMk.setLngLat(ll);
    if (i % 3 === 0 || i === r.path.length - 1) map.easeTo({ center: ll, duration: 420 });
    await sleep(170);
  }
  setState(r.state); map.getSource("zone")?.setData(circle(centerOf(g), BUY_RADIUS));
  moving = false; renderDice(); renderWallet();
  refreshHold().then(refreshMap).then(() => { paintAll(); renderWallet(); }).catch(() => { });
  landing(r.landing);
}
function landing(L) {
  const c = card(L.card); const lines = [];
  if (L.toll > 0) lines.push(`<span class="ln bad">💸 Péage : vous payez <b>${fmtE(L.toll)}</b> à ${L.payees.map(p => esc(p.pseudo)).join(", ")}</span>`);
  if (L.chance) { const ch = L.chance; const [nm, gl] = CHANCE[ch.k] || ["Chance", "?"]; lines.push(`<span class="ln ${BAD.has(ch.k) ? "bad" : "good"}">🃏 Case Chance : <b>${esc(nm)}</b> ${esc(chanceText(ch))}</span>`); if (window.confetti && !BAD.has(ch.k)) confetti("#A855F7", 24); }
  if (L.mine > 0) lines.push(`<span class="ln">🏠 Vous êtes chez vous.</span>`);
  else if (L.free > 0) lines.push(`<span class="ln good">🔑 ${L.free} ${c ? lotWord(c, L.free) : "biens"} libre${L.free > 1 ? "s" : ""} ici : vous pouvez acheter autour de vous.</span>`);
  else if (!L.toll) lines.push(`<span class="ln">Tout est déjà pris ici.</span>`);
  setMovebar(`<b>Vous arrivez : ${esc(c ? title(c) : "")}</b>${lines.join("")}`);
  previewBuilding(L.card);
}

// ---- téléportation ------------------------------------------------------------
function openTeleport() {
  const hs = holdings().sort((a, b) => b.c.v * unitsOf(b) - a.c.v * unitsOf(a));
  if (!hs.length) return toast("Vous n'avez pas encore de bien où vous téléporter");
  const pv = $("#preview"); pv.hidden = false;
  pv.innerHTML = `<div class="tplist"><b>✨ Se téléporter sur un de ses biens</b><span class="muted">${ST.state.profile.tp} téléportation${ST.state.profile.tp > 1 ? "s" : ""} restante${ST.state.profile.tp > 1 ? "s" : ""} aujourd'hui</span>
    <div class="rows">${hs.slice(0, 30).map(h => `<button class="lrow" data-tpgo="${h.g}" style="grid-template-columns:44px minmax(0,1fr) auto"><span class="th" style="width:44px;height:44px">${photo(h.c)}</span><span class="t"><b>${esc(title(h.c))}</b><span>${ord(h.c.arr)} arr. · ${esc(itemLabel(h.c, { t: "own", ks: h.ks, n: h.n }))}</span></span><span class="v">${pawnPos() != null && ARR[ai(pawnPos())]?.cards ? fmtDist(distM(pawnPos(), h.g)) : ""}</span></button>`).join("")}</div></div>
    <button class="x" data-closepv aria-label="Fermer">×</button>`;
}
async function doTeleport(g) {
  try { setState(await rpc("teleport", { p_card: g })); } catch (e) { return toast(e.message, "bad"); }
  pending = null; paintTargets(); setMovebar(""); hidePreview(); await placePawn(true); renderDice(); toast("Téléportation réussie ✨", "good");
}

// ---- les dés en animation -----------------------------------------------------
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const dieHTML = n => `<div class="die">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => `<i class="${PIPS[n].includes(i) ? "on" : ""}"></i>`).join("")}</div>`;
async function animDice([a, b]) {
  const D = $("#dice3d"); D.hidden = false;
  for (let i = 0; i < 9; i++) { D.innerHTML = `<div class="dice rolling">${dieHTML(1 + Math.floor(Math.random() * 6))}${dieHTML(1 + Math.floor(Math.random() * 6))}</div>`; await sleep(70); }
  D.innerHTML = `<div class="dice">${dieHTML(a)}${dieHTML(b)}<span>${a + b}</span></div>`; await sleep(750);
  D.hidden = true;
}

function initPawnUI() {
  $("#b-roll").addEventListener("click", doRoll);
  $("#b-tp").addEventListener("click", openTeleport);
  $("#b-me").addEventListener("click", () => placePawn(true));
  $("#preview").addEventListener("click", e => { const t = e.target.closest("[data-tpgo]"); if (t) doTeleport(+t.dataset.tpgo); });
  setInterval(() => { if (cur() === "map") renderDice(); }, 15000);
}
