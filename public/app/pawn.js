"use strict";
// =====================================================================
//  Le pion, façon Monopoly : on lance le dé, le pion marche tout seul
//  dans les rues et s'arrête sur un immeuble. Libre : on peut l'acheter.
//  À un autre joueur : on lui paie son loyer. À soi : un bonus.
// =====================================================================
let pawnMk = null, moving = false, panelKind = "", lastLanding = null, landPainted = null;
const pending = null;   // (ancienne version : destinations au choix) — gardé pour la compatibilité
const pawnPos = () => ST.state?.profile?.pos ?? null;
const landPos = () => ST.state?.profile?.land ?? null;
function distM(a, b) { const A = centerOf(a), B = centerOf(b); return Math.hypot((A[0] - B[0]) * 111320 * 0.6579, (A[1] - B[1]) * 110574); }
// vrai si on ne peut pas acheter cet immeuble à la banque (le pion n'est pas tombé dessus)
const notLanded = g => landPos() !== g;
const fmtDist = d => d >= 1000 ? (d / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " km" : Math.round(d / 10) * 10 + " m";
const FC = f => ({ type: "FeatureCollection", features: f });

// ---- calques et pion -------------------------------------------------------------
function initPawnLayers() {
  map.addSource("walked", { type: "geojson", data: FC([]) });
  map.addLayer({ id: "walked-case", type: "line", source: "walked", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 10, "line-opacity": .9 } });
  map.addLayer({ id: "walked", type: "line", source: "walked", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#0F1B2D", "line-width": 5, "line-dasharray": [1.2, 1.2] } });
  map.on("move", pawnOff); placePawn(true); setTimeout(resumeDest, 1500);
}
async function placePawn(fly) {
  const p = pawnPos(); if (p == null || !map) return; await ensureCards([p]);
  const ll = centerOf(p), pr = ST.state.profile, col = PARTIES[pr.party]?.c || "#2F5BD3";
  if (!pawnMk) { const el = document.createElement("div"); el.className = "pawn"; el.addEventListener("click", e => { e.stopPropagation(); showLand(); }); pawnMk = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(ll).addTo(map); }
  pawnMk.getElement().innerHTML = `<em>Vous</em><svg class="pz" viewBox="0 0 44 60" width="40" height="55" aria-hidden="true"><defs><linearGradient id="pzg" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient></defs>
    <ellipse cx="22" cy="56" rx="14" ry="3.5" fill="#0F1B2D" opacity=".25"/>
    <g stroke="#fff" stroke-width="2.4" stroke-linejoin="round"><path d="M9 52h26l-2.5-7h-21z" fill="${col}"/><path d="M14.5 45l3-15h9l3 15z" fill="${col}"/><path d="M13 30.5h18" stroke-linecap="round"/><circle cx="22" cy="17" r="9.5" fill="${col}"/></g>
    <g fill="url(#pzg)"><path d="M9 52h26l-2.5-7h-21z"/><path d="M14.5 45l3-15h9l3 15z"/><circle cx="22" cy="17" r="9.5"/></g></svg><s></s>`;
  pawnMk.setLngLat(ll); paintTargets();
  if (window.pawn3d) { pawn3d.color(col); pawn3d.set(ll[0], ll[1]); pawnMk.getElement().classList.add("is3d"); }
  if (fly) map.flyTo({ center: ll, zoom: Math.min(15.8, Math.max(map.getZoom(), 15.2)), pitch: 50, duration: 900, offset: [0, -90] });
}
// l'immeuble où l'on se trouve est surligné en jaune
function paintTargets() {
  if (!mapReady) return; const g = landPos();
  if (landPainted != null && landPainted !== g && map.getSource("b" + ai(landPainted))) map.setFeatureState({ source: "b" + ai(landPainted), id: landPainted }, { tgt: 0 });
  if (g != null && map.getSource("b" + ai(g))) { map.setFeatureState({ source: "b" + ai(g), id: g }, { tgt: 1 }); landPainted = g; }
}
function onBuildingTap(g) {
  if (moving) return;
  if (panelKind === "land" && !landView) { justBought = null; setMovebar(""); return; }   // 1er toucher : on ferme la case où l'on est tombé
  previewBuilding(g);
}

// centres des immeubles (pour les maquettes des cartes)
const CEN = [];
function centersOf(i) {
  if (CEN[i]) return CEN[i]; const A = ARR[i]; if (!A?.geo) return null;
  const out = new Float64Array(A.geo.length * 2);
  A.geo.forEach((enc, k) => { const r = decodeRing(enc[0]); let x = 0, y = 0; r.forEach(p => { x += p[0]; y += p[1]; }); out[2 * k] = x / r.length; out[2 * k + 1] = y / r.length; });
  return (CEN[i] = out);
}
function freeOf(g) { const c = card(g); if (!c) return 0; const o = ST.own.get(g); return c.lots - (c.lk === "p" ? (o?.parts || 0) : (o?.n || 0)); }
function mineOf(g) { return (ST.mine.get(g)?.length || 0) + (ST.mineParts.get(g) || 0); }

// ---- panneau du bas ------------------------------------------------------------
function setMovebar(html, kind) {
  const m = $("#movebar"), wasLand = panelKind === "land"; panelKind = html ? kind || "" : "";
  m.className = panelKind ? "k-" + panelKind : "";
  if (!html && wasLand && !landView && !moving && pawnPos() != null && map) map.easeTo({ center: centerOf(pawnPos()), offset: [0, 0], duration: 500 });   // case fermée : on revient sur la montgolfière
  if (!html) { m.hidden = true; m.innerHTML = ""; if (landView) { landView = false; sel = null; paintAll(); if (typeof stripKind !== "undefined" && false) $("#strip").hidden = false; } } else { m.hidden = false; m.innerHTML = html; }
  $("#dicebar").classList.toggle("off", moving);
  document.body.classList.toggle("landopen", panelKind === "land");
  if (panelKind === "land") $("#pawnoff").hidden = true;
}
function renderDice() {
  const p = ST.state?.profile; if (!p) return;
  const r = $("#b-roll"), left = p.rolls ?? 0;
  const wait = Math.max(0, (ST.state.roll_in || 0) - (performance.now() - ST.stAt) / 1000);
  $("#rolls").textContent = left > 0 ? `${left} lancer${left > 1 ? "s" : ""}` : `dans ${hm(wait)}`;
  r.disabled = moving; r.classList.toggle("empty", left <= 0);
  $("#tps").textContent = p.tp ?? 0; $("#b-tp").disabled = !(p.tp > 0);
  $("#dicebar").classList.toggle("off", moving);
}

// ---- lancer le dé ------------------------------------------------------------------
function smooth(pts) {   // adoucit le trajet d'immeuble en immeuble
  let p = pts; for (let it = 0; it < 2; it++) { const q = [p[0]]; for (let i = 0; i < p.length - 1; i++) { const [a, b] = [p[i], p[i + 1]]; q.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } q.push(p[p.length - 1]); p = q; } return p;
}
async function doRoll() {
  if (moving) return;
  const pend = ST.state?.profile?.pend?.length > 0;
  if (!pend && (ST.state?.profile?.rolls ?? 0) <= 0) return showBuyRolls();
  const b = $("#b-roll"); b.disabled = true; hidePreview(); hideHint(); setMovebar(""); clearDest();
  let r;
  try { r = await rpc("roll"); }
  catch (e) { toast(e.message, "bad"); renderDice(); return; }
  if (r.options) {   // nouveau jeu : le dé d'abord, puis on choisit où aller
    setState(r.state); renderDice();
    if (!pend) { moving = true; renderDice(); sfx("dice"); await animDice(r.die); moving = false; }
    setDieIcon(r.die); renderDice();
    if (r.options.length === 1) return goTo(r.options[0].card);
    return showDest(r.die, r.options);
  }
  if (!r.path) { toast("Le jeu est en cours de mise à jour : réessayez dans quelques minutes.", "bad"); renderDice(); return; }
  moving = true; renderDice(); sfx("dice");
  await animDice(r.die); setDieIcon(r.die);
  await travel(r);
}
async function goTo(g) {
  if (moving) return; moving = true; clearDest(); renderDice();
  let r; try { r = await rpc("go_to", { p_card: g }); }
  catch (e) { moving = false; toast(e.message, "bad"); renderDice(); return; }
  await travel(r);
}
async function travel(r) {   // le pion marche jusqu'à la case, puis la case s'ouvre
  moving = true; renderDice();
  await ensureCards(r.path);
  const line = smooth(r.path.map(centerOf)), lo = line.map(p => p[0]), la = line.map(p => p[1]);
  map.fitBounds([[Math.min(...lo), Math.min(...la)], [Math.max(...lo), Math.max(...la)]], { padding: { top: 140, bottom: 200, left: 50, right: 70 }, maxZoom: 15.6, pitch: 50, duration: 500 });
  await sleep(450);
  await walk(line, Math.min(2400, 500 + 80 * r.path.length));
  setState(r.state); moving = false;
  await placePawn(false); renderDice(); renderWallet();
  setTimeout(() => map.getSource("walked")?.setData(FC([])), 2500);
  if (!r.landing) return;
  lastLanding = r.landing; landCredit = null; justBought = null; showLand(r.landing);
  // la case reste visible au-dessus du panneau (téléphone) ou à gauche (ordinateur)
  const mb = $("#movebar"), mobile = innerWidth < 900;
  // la montgolfière reste visible : au-dessus de la case (téléphone) ou à gauche (ordinateur)
  const cv = map.getCanvas().getBoundingClientRect(), pt = mb.getBoundingClientRect().top;
  const yWant = Math.max(cv.top + 40, (cv.top + pt) / 2);
  map.easeTo({ center: centerOf(r.landing.card), zoom: Math.min(15.8, Math.max(map.getZoom(), 15.2)), duration: 600,
    offset: mobile ? [0, Math.round(yWant - (cv.top + cv.height / 2))] : [-Math.round((mb.offsetWidth || 380) / 2), 0] });
  refreshHold().then(refreshMap).then(() => { paintAll(); renderWallet(); if (panelKind === "land") showLand(); }).catch(() => { });
}

// ---- après le dé : choisir sa destination parmi 2 à 4 immeubles ---------------------------
let destMarks = [], destOpts = [], destSel = null;
function clearDest() { destMarks.forEach(m => m.remove()); destMarks = []; map?.getSource("destlines")?.setData(FC([])); map?.off("move", aimArrows); destOpts = []; destSel = null; $("#pick")?.remove(); const d = $("#destcard"); if (d) { d.hidden = true; d.innerHTML = ""; } document.body.classList.remove("picking", "picksel"); }
function destInfo(o) {   // [classe, icône, mot court sous le point, phrase complète]
  if (o.chance) return ["chance", "?", "Carte Chance", "Carte Chance : une surprise, bonne ou mauvaise."];
  if (o.mine > 0) return ["mine", "★", "Chez vous", "Chez vous : vous touchez une journée de loyer en bonus."];
  const who = o.owners?.length ? o.owners.slice(0, 2).join(", ") + (o.owners.length > 2 ? "…" : "") : "";
  if (who) return ["theirs", "", "Loyer à " + o.owners[0], `Chez ${who} : vous lui payez une journée de loyer.` + (o.free > 0 ? ` ${o.free} ${card(o.card) ? lotWord(card(o.card), o.free) : "logement"} à acheter.` : "")];
  const c = card(o.card), w = n => c ? lotWord(c, n) : n > 1 ? "logements" : "logement";
  if (o.free > 0) return ["free", "", "À acheter", `${o.free} ${w(o.free)} ${o.free > 1 ? "libres" : "libre"} : vous pourrez acheter.`];
  return ["theirs", "", "Loyer à payer", "Tout est déjà pris : loyer à payer."];
}
function declutterDest() { }
async function showDest(die, opts) {
  clearDest(); destOpts = opts;
  await ensureCards(opts.map(o => o.card).concat(pawnPos() != null ? [pawnPos()] : []));
  const pts = [];
  opts.forEach((o, i) => {
    const [k, ic, short] = destInfo(o), ll = centerOf(o.card); pts.push(ll);
    const el = document.createElement("div"); el.className = "destm";   // maplibre place l'élément avec transform : l'animation est sur le bouton intérieur
    el.innerHTML = `<button class="dpin d-${k}" style="animation-delay:${i * 70}ms" aria-label="${esc(short)}"><i><svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 12h13M12 5l7 7-7 7" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></i><span>${esc(short)}</span></button>`;
    el.addEventListener("click", ev => { ev.stopPropagation(); goTo(o.card); });   // toucher un point = la montgolfière y va ; on achète une fois arrivé
    destMarks.push(new maplibregl.Marker({ element: el, anchor: "top", offset: [0, -23] }).setLngLat(ll).addTo(map));
  });
  // un trait pointillé de la montgolfière vers chaque destination, et des flèches qui pointent dans le sens du trajet
  if (pawnPos() != null) {
    const from = centerOf(pawnPos());
    if (!map.getSource("destlines")) { map.addSource("destlines", { type: "geojson", data: FC([]) });
      map.addLayer({ id: "destlines", type: "line", source: "destlines", layout: { "line-cap": "round" }, paint: { "line-color": ["get", "c"], "line-width": 4, "line-opacity": .85, "line-dasharray": [1, 1.6] } }); }
    const COL = { free: "#16A34A", theirs: "#E2557A", mine: "#2563EB", chance: "#7C3AED" };
    map.getSource("destlines").setData(FC(opts.map(o => ({ type: "Feature", properties: { c: COL[destInfo(o)[0]] }, geometry: { type: "LineString", coordinates: [from, centerOf(o.card)] } }))));
    map.on("move", aimArrows); setTimeout(aimArrows, 50);
  }
  const p = document.createElement("div"); p.id = "pick";
  p.innerHTML = `<span class="pd">${dieSVG(die, DSIDE[die][0], DSIDE[die][1], 26)}</span><span>Vous avez fait <b>${die}</b> · Touchez une flèche pour y aller</span>`;
  $("#p-map").appendChild(p); document.body.classList.add("picking");
  if (pawnPos() != null) pts.push(centerOf(pawnPos()));
  const lo = pts.map(x => x[0]), la = pts.map(x => x[1]), mobile = innerWidth < 900;
  map.fitBounds([[Math.min(...lo), Math.min(...la)], [Math.max(...lo), Math.max(...la)]], { padding: { top: mobile ? 120 : 130, bottom: mobile ? 190 : 160, left: mobile ? 45 : 140, right: mobile ? 45 : 140 }, maxZoom: 16.2, pitch: 30, duration: 700 });
  if (typeof tutTick === "function") tutTick();
}
function aimArrows() {   // chaque flèche pointe de la montgolfière vers sa destination, à l'écran
  if (!destMarks.length || pawnPos() == null) return; const a = map.project(centerOf(pawnPos()));
  destMarks.forEach((m, i) => { const b = map.project(destOpts[i] ? centerOf(destOpts[i].card) : m.getLngLat()); const svg = m.getElement().querySelector("svg"); if (svg) svg.style.transform = `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`; });
}
function selectDest(i) {
  const o = destOpts[i]; if (!o) return; destSel = i;
  destMarks.forEach((m, j) => m.getElement().querySelector(".dpin").classList.toggle("on", j === i));
  const c = card(o.card), [k, ic, , txt] = destInfo(o), d = $("#destcard");
  d.innerHTML = `<div class="dc-h"><i class="d-${k}">${ic}</i><div><b>${esc(c ? (c.adr || title(c)) : "Immeuble")}</b><span>${esc(txt)}</span></div><button class="x" data-dcx aria-label="Choisir un autre">×</button></div>
    <button class="btn block dc-go" data-dcgo>Y aller</button>`;
  d.hidden = false; document.body.classList.add("picksel");
  d.onclick = e => { if (e.target.closest("[data-dcgo]")) goTo(o.card); else if (e.target.closest("[data-dcx]")) { d.hidden = true; destSel = null; document.body.classList.remove("picksel"); destMarks.forEach(m => m.getElement().querySelector(".dpin").classList.remove("on")); } };
  map.easeTo({ center: centerOf(o.card), duration: 400, offset: [0, innerWidth < 900 ? -60 : 0] });
}
async function resumeDest() {   // un dé lancé mais pas encore joué (page rechargée) : on repropose les destinations
  if (!ST.state?.profile?.pend?.length || moving || destMarks.length) return;
  try { const r = await rpc("roll"); if (r.options) { setState(r.state); setDieIcon(r.die); renderDice(); showDest(r.die, r.options); } } catch (e) { }
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
      pawnMk.setLngLat(p); window.pawn3d?.set(p[0], p[1]); src?.setData(FC([{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [...line.slice(0, i), p] } }]));
      if (t < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}

// ---- la case où l'on tombe -----------------------------------------------------------
// L : ce que le serveur a renvoyé à l'arrivée (loyer payé, bonus, Chance) ; sans L, on réaffiche la case actuelle
// gv : afficher un autre immeuble que la case (clic sur la carte, sur un monument…) — même panneau, mais on ne peut pas l'acheter à la banque
let landView = false;
function showLand(L, gv) {
  const view = gv != null && gv !== landPos();
  const g = view ? gv : landPos(); if (g == null) { placePawn(true); return toast("Lancez le dé pour avancer"); }
  if (view || (L && L.card !== g)) L = null;
  if (!view) L = L || (lastLanding && lastLanding.card === g ? lastLanding : null);
  const c = card(g); if (!c) return;
  hidePreviewOnly();
  const free = freeOf(g), mine = mineOf(g), cash = liveCash(), isP = c.lk === "p";
  const owners = (ST.own.get(g)?.owners || []).filter(o => o !== ME);
  const taken = isP ? (ST.own.get(g)?.parts || 0) : (ST.own.get(g)?.n || 0), others = Math.max(0, taken - mine), tot = c.lots;
  const word = n => lotWord(c, n);
  let head, cls;
  const jb = !view && justBought && justBought.g === g;
  if (view) { head = mine > 0 ? (free > 0 ? "À vous en partie" : "À vous") : free > 0 ? (isP ? "Parts disponibles" : "Libre") : owners.length ? "Déjà pris" : "Tout est vendu"; cls = mine > 0 ? "home" : free > 0 ? "free" : ""; }
  else if (jb) { head = justBought.whole ? "✓ Acheté ! Tout l'immeuble est à vous" : `✓ Acheté ! ${isP ? "Une part" : tot > 1 ? "Un " + word(1) : "Il"} est à vous`; cls = "home"; }
  else if (L?.toll > 0) { head = `Chez ${L.payees.map(p => esc(p.pseudo)).join(", ")}`; cls = "bad"; }
  else if (mine > 0 && free > 0) { head = "Vous êtes chez vous"; cls = "home"; }
  else if (mine > 0) { head = "Tout l'immeuble est à vous"; cls = "home"; }
  else if (free > 0) { head = "Libre, à vendre !"; cls = "free"; }
  else { head = "Tout est déjà pris"; cls = ""; }
  // ce qui s'est passé à l'arrivée (on n'affiche que ce qui compte : loyer payé, bonus, Chance)
  const lines = [];
  if (L?.toll > 0) lines.push(`<span class="ln bad">Vous payez son loyer · <b>−${fmtE(L.toll)}</b>${L.perk === "poing" ? " <small>(−50 % grâce au Poing Levé)</small>" : L.perk === "rempart" ? " <small>(+50 % : propriétaire Rempart National)</small>" : ""}</span>`);
  if (L?.bonus > 0) lines.push(`<span class="ln good">Bonus chez vous · <b>+${fmtE(L.bonus)}</b></span>`);
  if (L?.chance) { const ch = L.chance; const [nm] = CHANCE[ch.k] || ["Chance"]; lines.push(`<span class="ln ${BAD.has(ch.k) ? "bad" : "good"}"><small>Case Chance${BAD.has(ch.k) ? " · pas de chance" : ""}</small>🃏 <b>${esc(nm)}</b> : ${esc(chanceText(ch))}</span>`); }
  const occ = mine || others ? occHTML(c, mine, others, free) : "";   // immeuble entièrement libre : le plan n'apprend rien
  let btns = "";
  if (free > 0) {
    const unit = isP ? "1 part" : tot > 1 ? `1 ${word(1)}` : c.lk === "l" ? "le logement" : "le local", allFree = !isP && free === tot && tot > 1, total = c.v * tot;
    const cap = ST.state?.loan_cap ?? 1e12, down = p => Math.ceil(p * downRate());
    const cashOK = cash >= c.v, creditOK = cash >= down(c.v) && c.v - down(c.v) <= cap;
    const cr = creditOK && (landCredit === null ? true : landCredit) || (!cashOK && creditOK);
    if (!cashOK && !creditOK) {
      const need = cash >= down(c.v) ? 0 : down(c.v) - cash, rate = netRate(), days = rate > 0 ? Math.ceil(need / rate) : 0;
      btns = `<div class="nomoney"><b>Pas assez pour celui-ci</b><span>${cash < down(c.v) ? `Il manque ${fmtE(need)} pour l'apport${days ? ` · vos loyers l'apportent dans ${days} jour${days > 1 ? "s" : ""}` : ""}.` : `Capacité d'emprunt atteinte. Elle remonte à mesure que vos crédits se remboursent.`}</span></div>`;
    } else {
      const seg = creditOK && cashOK ? `<div class="pay"><button data-paymode="1" aria-selected="${cr}"><b>À crédit</b><small>${fmtE(down(c.v))} · <em>+${fmtE(Math.round(c.rent * .3))}/j</em></small></button><button data-paymode="0" aria-selected="${!cr}"><b>Comptant</b><small>${fmtE(c.v)} · <em>+${fmtE(c.rent)}/j</em></small></button></div>` : "";
      btns = `${seg}<button class="btn block ${cr ? "blue2" : "green"} buy" data-lbuy="${g}"><span>Acheter ${unit} · ${fmtE(cr ? down(c.v) : c.v)}</span><small>${cr ? "La banque prête le reste, remboursé tout seul par le loyer" : "Tout le loyer est pour vous, et le bien peut être revendu"}</small></button>`;
      if (allFree && (cr ? cash >= down(total) && total - down(total) <= cap : cash >= total)) btns += `<button class="btn block light" data-lbuild="${g}">Tout l'immeuble · ${fmtE(cr ? down(total) : total)} <small class="muted">(+60 % de loyer)</small></button>`;
    }
    landCreditNow = cr;
  }
  if (view) {
    const listed = ST.sale.has(g);
    btns = `${free > 0 ? `<div class="farbuy">🎲 Pour l'acheter à la banque, tombez dessus avec le dé.${listed ? "" : " Ou trouvez-le dans un booster."}</div>` : ""}<button class="btn block ${listed ? "buy" : "light"}" data-lopen="${g}"><span>${listed ? "En vente au Marché · voir l'offre" : "Voir la fiche de l'immeuble"}</span></button>`;
  }
  // racheter à un autre joueur : faire une offre (pas pendant l'écran « Acheté ! »)
  if (!jb && others > 0 && !isP && !ST.sale.has(g)) btns += `<button class="btn block light" data-lofr="${g}">🤝 Proposer de racheter ${owners.length === 1 ? "au propriétaire" : "à un propriétaire"}</button>`;
  if (jb) {   // juste acheté : s'il reste des logements libres, on peut continuer à acheter ici sans quitter la case
    const gain = `+${fmtE(Math.round(c.rent * (landCreditNow ? .3 : 1)))} / jour de loyer en plus`;
    if (free > 0 && !justBought.whole && btns.includes("data-lbuy")) {
      lines.unshift(`<span class="ln good">${gain}</span>`);
      btns = btns.replace(/Acheter (1 |une |un )/, (m, w) => `Acheter ${w === "1 " ? "1 autre " : w === "une " ? "une autre " : "un autre "}`) + `<button class="btn block light" data-mvclose>Continuer</button>`;
    } else btns = `<button class="btn block buy" data-mvclose><span>Continuer</span><small>${gain}</small></button>`;
  }
  setMovebar(`<div class="land${lines.length ? " hasln" : ""}"><div class="grab"></div><div class="lc" data-lopen="${g}">${cardHTML(c)}</div>
    <div class="lr"><b class="lh ${cls}">${head}</b>${lines.length ? `<div class="lns">${lines.join("")}</div>` : ""}${occ}<div class="lb">${btns}</div></div>
    <button class="x" data-mvclose aria-label="Fermer">×</button></div>`, "land");
  $("#movebar").classList.add("r" + c.r);
  landView = view; sel = view ? g : null; if (view) paintAll();
  $("#movebar").scrollTop = 0;
  if (L?.chance && window.confetti && !BAD.has(L.chance.k)) confetti("#A855F7", 24);
}
// le plan de l'immeuble : une case par logement (à vous / à d'autres / libre) — aussi utilisé par la fiche
function occHTML(c, mine, others, free) {
  const tot = c.lots, isP = c.lk === "p"; if (tot <= 1) return "";
  const u = n => isP ? fmtN(n) + " part" + (n > 1 ? "s" : "") : n;
  const leg = [mine ? `<span class="o-me">${u(mine)} à vous</span>` : "", others ? `<span class="o-th">${u(others)} à d'autres</span>` : "", free ? `<span class="o-fr">${u(free)} libre${free > 1 ? "s" : ""}</span>` : ""].filter(Boolean).join("");
  const viz = !isP && tot <= 40 ? `<div class="oc">${"<i class='me'></i>".repeat(mine)}${"<i class='th'></i>".repeat(others)}${"<i></i>".repeat(Math.max(0, free))}</div>`
    : `<div class="obar"><i class="me" style="width:${mine / tot * 100}%"></i><i class="th" style="width:${others / tot * 100}%"></i></div>`;
  return `<div class="occ"><div class="ot">${isP ? `Monument en ${fmtN(tot)} parts` : `Immeuble de ${tot} ${lotWord(c, tot)}`}</div>${viz}<div class="ol">${leg}</div></div>`;
}
let landCredit = null, landCreditNow = false, justBought = null;   // null = choix automatique (crédit si l'on n'a pas assez pour payer comptant)
const CREDIT_DOWN = 0.1;

// ---- plus de lancers : en attendre un, ou en acheter ------------------------------
function showBuyRolls() {
  const s = ST.state, price = s.rolls_price || 50000, wait = Math.max(0, (s.roll_in || 0) - (performance.now() - ST.stAt) / 1000);
  setMovebar(`<div class="mvh"><span class="pin">🎲</span><div><b>Plus de lancers pour l'instant</b><span>Un lancer revient toutes les 30 min (le prochain dans ${hm(wait)}).</span></div><button class="x" data-mvclose aria-label="Fermer">×</button></div>
    <button class="btn block gold" data-buyrolls ${liveCash() < price ? "disabled" : ""}>Acheter 5 lancers · ${fmtE(price)}</button>
    <small class="muted" style="text-align:center">Le prix double à chaque achat dans la journée.</small>`, "buy");
}

// ---- téléportation ------------------------------------------------------------
function openTeleport() {
  // téléportation aléatoire sur un de ses biens (de préférence un immeuble où il reste des logements libres) ; on prévient d'abord
  const hs = holdings().filter(h => h.g !== pawnPos()); if (!hs.length) return toast("Vous n'avez pas encore de bien où vous téléporter");
  if (panelKind === "tp") return setMovebar("");
  const tp = ST.state?.profile?.tp ?? 0;
  setMovebar(`<div class="mvh"><span class="pin">✨</span><div><b>Se téléporter ?</b><span>Votre personnage sera envoyé <b>au hasard</b> sur l'un de vos immeubles. Vous pourrez y acheter les logements restés libres.</span></div><button class="x" data-mvclose aria-label="Fermer">×</button></div>
    <div class="tpb"><button class="btn block" data-tpgo="0">Me téléporter</button><button class="btn light" data-mvclose>Annuler</button></div>
    <small class="muted" style="text-align:center">Il vous reste ${tp} téléportation${tp > 1 ? "s" : ""} aujourd'hui.</small>`, "tp");
}
function teleportRandom() {
  const hs = holdings().filter(h => h.g !== pawnPos()); if (!hs.length) return toast("Vous n'avez pas encore de bien où vous téléporter");
  const pool = hs.filter(h => freeOf(h.g) > 0); const pick = (pool.length ? pool : hs)[Math.floor(Math.random() * (pool.length ? pool : hs).length)];
  doTeleport(pick.g);
}
async function doTeleport(g) {
  try { setState(await rpc("teleport", { p_card: g })); clearDest(); } catch (e) { return toast(e.message, "bad"); }
  lastLanding = null; setMovebar(""); hidePreview(); sfx("coin"); await placePawn(true); renderDice(); showLand();
}

// ---- le dé : un vrai cube en 3D qui roule puis s'arrête sur la bonne face ----
const PIPS = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };
const PIPXY = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.27, .27], [.5, .5], [.73, .73]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]], 5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]] };
const DSIDE = { 1: [2, 3], 2: [1, 3], 3: [1, 2], 4: [1, 5], 5: [1, 3], 6: [2, 4] };
function setDieIcon(n) { const e = $("#dieico"); if (e) e.innerHTML = dieSVG(n, ...DSIDE[n]); }
function dieSVG(top = 5, left = 1, right = 3, size = 40) {
  const face = (m, fill, n, pip) => `<g transform="matrix(${m})"><rect x=".02" y=".02" width=".96" height=".96" rx=".2" fill="${fill}"/>${PIPXY[n].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".095" fill="${pip}"/>`).join("")}</g>`;
  return `<svg class="dsvg" viewBox="7 1.5 26 32" width="${size}" height="${size}" aria-hidden="true"><ellipse cx="20" cy="31" rx="10" ry="2" fill="rgba(0,0,0,.16)"/>
    ${face("10.4,6,-10.4,6,20,4", "#FFFFFF", top, "#0B0C10")}${face("10.4,6,0,12,9.6,10", "#E4E9F3", left, "#0B0C10")}${face("10.4,-6,0,12,20,16", "#C9D3E6", right, "#0B0C10")}</svg>`;
}
const dieHTML = n => `<div class="die n${n}">${[1, 2, 3, 4, 5, 6].map(f => `<i class="f${f}">${"<b></b>".repeat(f)}</i>`).join("")}</div>`;
async function animDice(n) {   // le même dé que sur le bouton : il tourne en changeant de face, puis se pose sur le résultat
  const D = $("#dice3d"); D.hidden = false; D.classList.remove("shown");
  D.innerHTML = `<div class="dland rolling">${dieSVG(1, 2, 3, 150)}</div>`; const box = D.querySelector(".dland");
  const t0 = performance.now();
  while (performance.now() - t0 < 850) { const a = 1 + Math.floor(Math.random() * 6); box.innerHTML = dieSVG(a, ...DSIDE[a], 150); await sleep(85); }
  box.classList.remove("rolling"); box.innerHTML = dieSVG(n, ...DSIDE[n], 150); D.classList.add("shown");
  await sleep(1300);
  D.classList.remove("shown"); D.hidden = true;
}

function initPawnUI() {
  $("#b-roll").addEventListener("click", doRoll);
  $("#b-tp").addEventListener("click", openTeleport);
  $("#minipack").innerHTML = packHTML("mini"); setDieIcon(5);
  $("#movebar").addEventListener("click", async e => {
    if (e.target.closest("[data-mvclose]")) { justBought = null; return setMovebar(""); }
    const tp = e.target.closest("[data-tpgo]"); if (tp) return teleportRandom();
    if (e.target.closest("[data-buyrolls]")) { if (await act("buy_rolls", {}, "5 lancers en plus !")) { setMovebar(""); renderDice(); } return; }
    const pm = e.target.closest("[data-paymode]"); if (pm) { landCredit = pm.dataset.paymode === "1"; return showLand(); }
    const lb = e.target.closest("[data-lbuy],[data-lbuild]"); if (lb) {
      const g = +(lb.dataset.lbuy || lb.dataset.lbuild), whole = !!lb.dataset.lbuild, credit = landCreditNow; lb.disabled = true; lb.textContent = "Achat…";
      if (await act(whole ? "buy_building" : "bank_buy", Object.assign(whole ? { p_card: g } : { p_card: g, p_k: null }, credit ? { p_credit: true } : {}), null)) { justBought = { g, whole }; sfx("buy"); if (window.confetti) confetti("#2563EB", 30); }
      return showLand();
    }
    const lf = e.target.closest("[data-lofr]"); if (lf) { offerNext = +lf.dataset.lofr; sel = null; return push("b", offerNext); }
    const lo = e.target.closest("[data-lopen]"); if (lo) return push("b", +lo.dataset.lopen);
  });
  setInterval(() => { if (cur() === "map") renderDice(); }, 15000);
  $("#pawnoff").addEventListener("click", () => placePawn(true));
}

// quand le pion sort de l'écran : une flèche au bord indique où il est
function pawnOff() {
  const el = $("#pawnoff"); if (!pawnMk || !el) return;
  if (panelKind === "land" && innerWidth < 900) { el.hidden = true; return; }
  if (window.pawn3d) {   // l'étiquette « Vous » flotte au-dessus de la montgolfière ; de loin (la 3D n'est plus dessinée) : un point bleu sur la carte
    const z = map.getZoom(), far = z < 12.4, mpp = 40075016 * Math.cos(48.86 * Math.PI / 180) / (512 * Math.pow(2, z));
    const px = pawn3d.H * pawn3d.k(z) / mpp * Math.sin(map.getPitch() * Math.PI / 180);
    const el0 = pawnMk.getElement(); el0.classList.toggle("far", far);
    el0.style.setProperty("--ph", far ? "4px" : Math.round(Math.max(18, px) + 6) + "px");
  }
  const W = map.getContainer().clientWidth, H = map.getContainer().clientHeight, pt = map.project(pawnMk.getLngLat());
  const top = 110, bot = H - (($(".mapbottom")?.offsetHeight || 80) + 24), left = 30, right = W - 30 - (panelKind === "land" && innerWidth >= 900 ? 400 : 0);
  if (pt.x > left && pt.x < right && pt.y > top && pt.y < bot) { el.hidden = true; return; }
  const cx = W / 2, cy = (top + bot) / 2, dx = pt.x - cx, dy = pt.y - cy;
  const k = Math.min((right - 50 - cx) / Math.abs(dx || 1e-6), (bot - 20 - cy) / Math.abs(dy || 1e-6));
  el.hidden = false; el.style.left = (cx + dx * k) + "px"; el.style.top = (cy + dy * k) + "px";
  el.querySelector("i").style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI + 90}deg)`;
  const d = pawnPos() != null ? map.getCenter().distanceTo(pawnMk.getLngLat()) : 0;
  el.querySelector("span").textContent = "Vous · " + fmtDist(d);
}
function hidePreviewOnly() { const pv = $("#preview"); if (pv && !pv.hidden) { pv.hidden = true; sel = null; paintAll(); } }


