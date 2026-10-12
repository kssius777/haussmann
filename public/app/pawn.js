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
  map.on("move", pawnOff); placePawn(true);
}
async function placePawn(fly) {
  const p = pawnPos(); if (p == null || !map) return; await ensureCards([p]);
  const ll = centerOf(p), pr = ST.state.profile, col = PARTIES[pr.party]?.c || "#0F1B2D";
  if (!pawnMk) { const el = document.createElement("div"); el.className = "pawn"; el.addEventListener("click", e => { e.stopPropagation(); showLand(); }); pawnMk = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(ll).addTo(map); }
  pawnMk.getElement().innerHTML = `<em>Vous</em><svg class="pz" viewBox="0 0 44 60" width="40" height="55" aria-hidden="true"><defs><linearGradient id="pzg" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient></defs>
    <ellipse cx="22" cy="56" rx="14" ry="3.5" fill="#0F1B2D" opacity=".25"/>
    <g stroke="#fff" stroke-width="2.4" stroke-linejoin="round"><path d="M9 52h26l-2.5-7h-21z" fill="${col}"/><path d="M14.5 45l3-15h9l3 15z" fill="${col}"/><path d="M13 30.5h18" stroke-linecap="round"/><circle cx="22" cy="17" r="9.5" fill="${col}"/></g>
    <g fill="url(#pzg)"><path d="M9 52h26l-2.5-7h-21z"/><path d="M14.5 45l3-15h9l3 15z"/><circle cx="22" cy="17" r="9.5"/></g></svg><s></s>`;
  pawnMk.setLngLat(ll); paintTargets();
  if (window.pawn3d) { pawn3d.color(col); pawn3d.set(ll[0], ll[1]); pawnMk.getElement().classList.add("is3d"); }
  if (fly) map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), 16.2), pitch: 50, duration: 900, offset: [0, -90] });
}
// l'immeuble où l'on se trouve est surligné en jaune
function paintTargets() {
  if (!mapReady) return; const g = landPos();
  if (landPainted != null && landPainted !== g && map.getSource("b" + ai(landPainted))) map.setFeatureState({ source: "b" + ai(landPainted), id: landPainted }, { tgt: 0 });
  if (g != null && map.getSource("b" + ai(g))) { map.setFeatureState({ source: "b" + ai(g), id: g }, { tgt: 1 }); landPainted = g; }
}
function onBuildingTap(g) { if (panelKind && panelKind !== "land") setMovebar(""); previewBuilding(g); }

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
  const m = $("#movebar"); panelKind = html ? kind || "" : "";
  m.className = panelKind ? "k-" + panelKind : "";
  if (!html) { m.hidden = true; m.innerHTML = ""; } else { m.hidden = false; m.innerHTML = html; }
  $("#dicebar").classList.toggle("off", moving);
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
  if ((ST.state?.profile?.rolls ?? 0) <= 0) return showBuyRolls();
  const b = $("#b-roll"); b.disabled = true; hidePreview(); hideHint(); setMovebar("");
  let r; try { r = await rpc("roll"); } catch (e) { toast(e.message, "bad"); renderDice(); return; }
  if (!r.path) { toast("Le jeu est en cours de mise à jour : réessayez dans quelques minutes.", "bad"); renderDice(); return; }
  moving = true; renderDice(); sfx("dice");
  await animDice(r.die);
  await ensureCards(r.path);
  const line = smooth(r.path.map(centerOf)), lo = line.map(p => p[0]), la = line.map(p => p[1]);
  map.fitBounds([[Math.min(...lo), Math.min(...la)], [Math.max(...lo), Math.max(...la)]], { padding: { top: 140, bottom: 200, left: 50, right: 70 }, maxZoom: 17, pitch: 45, duration: 700 });
  await sleep(650);
  await walk(line, Math.min(3600, 700 + 110 * r.path.length));
  setState(r.state); moving = false;
  await placePawn(false); renderDice(); renderWallet();
  map.easeTo({ center: centerOf(r.landing.card), zoom: Math.max(map.getZoom(), 16.6), duration: 600, offset: [0, -150] });
  setTimeout(() => map.getSource("walked")?.setData(FC([])), 2500);
  lastLanding = r.landing; landCredit = null; showLand(r.landing);
  refreshHold().then(refreshMap).then(() => { paintAll(); renderWallet(); if (panelKind === "land") showLand(); }).catch(() => { });
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
function showLand(L) {
  const g = landPos(); if (g == null) { placePawn(true); return toast("Lancez le dé pour faire avancer votre pion"); }
  if (L && L.card !== g) L = null;
  L = L || (lastLanding && lastLanding.card === g ? lastLanding : null);
  const c = card(g); if (!c) return;
  hidePreviewOnly();
  const free = freeOf(g), mine = mineOf(g), cash = liveCash(), isP = c.lk === "p";
  const owners = (ST.own.get(g)?.owners || []).filter(o => o !== ME);
  let head, cls;
  if (L?.toll > 0) { head = `💸 Chez ${L.payees.map(p => esc(p.pseudo)).join(", ")}`; cls = "bad"; }
  else if (mine > 0) { head = "🏠 Vous êtes chez vous"; cls = "home"; }
  else if (free > 0) { head = "🔑 Libre ! À vendre"; cls = "free"; }
  else { head = owners.length ? "Déjà pris" : "Tout est vendu ici"; cls = ""; }
  const lines = [];
  if (L?.toll > 0) lines.push(`<span class="ln bad">Vous lui payez son loyer : <b>${fmtE(L.toll)}</b></span>`);
  if (L?.bonus > 0) lines.push(`<span class="ln good">Bonus : une journée de loyer offerte, <b>+${fmtE(L.bonus)}</b></span>`);
  if (L?.salary > 0) lines.push(`<span class="ln good">💼 Salaire du tour : <b>+${fmtE(L.salary)}</b></span>`);
  if (L?.chance) { const ch = L.chance; const [nm] = CHANCE[ch.k] || ["Chance"]; lines.push(`<span class="ln ${BAD.has(ch.k) ? "bad" : "good"}">🃏 Case Chance ! Carte tirée : <b>${esc(nm)}</b> → ${esc(chanceText(ch))}</span>`); }
  const word = n => lotWord(c, n), tot = c.lots;
  const info = isP ? `${fmtN(free)} parts libres` : tot > 1 ? `Immeuble de ${tot} ${word(tot)} · <b>${free} libre${free > 1 ? "s" : ""}</b>` : "";
  let btns = "";
  if (free > 0) {
    const unit = isP ? "1 part" : tot > 1 ? `1 ${word(1)}` : c.lk === "l" ? "le logement" : "le local", allFree = !isP && free === tot && tot > 1, total = c.v * tot;
    const cap = ST.state?.loan_cap ?? 1e12, down = p => Math.ceil(p * CREDIT_DOWN);
    const cashOK = cash >= c.v, creditOK = cash >= down(c.v) && c.v - down(c.v) <= cap;
    const cr = creditOK && (landCredit === null ? true : landCredit);   // à crédit par défaut : c'est ce que tout le monde choisit
    if (!cashOK && !creditOK) {
      const need = cash >= down(c.v) ? 0 : down(c.v) - cash, rate = netRate(), days = rate > 0 ? Math.ceil(need / rate) : 0;
      btns = `<div class="nomoney"><b>Pas assez pour celui-ci</b><span>${cash < down(c.v) ? `Il manque ${fmtE(need)} pour l'apport de 10 %${days ? `, vos loyers les apportent dans ${days} jour${days > 1 ? "s" : ""}` : ""}.` : `Votre capacité d'emprunt est atteinte (il reste ${fmtE(cap)}). Elle remonte à mesure que vos crédits se remboursent.`}</span></div>`;
    } else {
      btns = cr
        ? `<button class="btn block blue2" data-lbuy="${g}"><span>Acheter ${unit} à crédit</span><small>${fmtE(down(c.v))} maintenant · +${fmtE(Math.round(c.rent * .3))} / jour pour vous</small></button>
           <p class="crx">10 % maintenant. La banque avance le reste (${fmtE(c.v - down(c.v))}), remboursé <b>tout seul</b> par 70 % du loyer. Après, tout le loyer est à vous.</p>`
        : `<button class="btn block green" data-lbuy="${g}"><span>Acheter ${unit} · ${fmtE(c.v)}</span><small>+${fmtE(c.rent)} / jour</small></button>`;
      const links = [];
      if (cr && cashOK) links.push(`<button data-paymode="0">ou payer comptant (${fmtE(c.v)}) : tout le loyer tout de suite</button>`);
      if (!cr && creditOK) links.push(`<button data-paymode="1">ou à crédit : ${fmtE(down(c.v))} maintenant</button>`);
      if (allFree && (cr ? cash >= down(total) && total - down(total) <= cap : cash >= total)) links.push(`<button data-lbuild="${g}">${cr ? `tout l'immeuble à crédit · ${fmtE(down(total))} maintenant` : `tout l'immeuble · ${fmtE(total)}`} (+60 % de loyer)</button>`);
      if (links.length) btns += `<div class="llinks">${links.join("")}</div>`;
    }
    landCreditNow = cr;
  }
  setMovebar(`<div class="land"><div class="grab"></div><div class="lc" data-lopen="${g}">${cardHTML(c)}</div>
    <div class="lr"><b class="lh ${cls}">${head}</b>${info ? `<span class="linfo">${info}</span>` : ""}${lines.join("")}<div class="lb">${btns}</div></div>
    <button class="x" data-mvclose aria-label="Fermer">×</button></div>`, "land");
  if (L?.chance && window.confetti && !BAD.has(L.chance.k)) confetti("#A855F7", 24);
}
let landCredit = null, landCreditNow = false;   // null = choix automatique (crédit si l'on n'a pas assez pour payer comptant)
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
  const hs = holdings().sort((a, b) => b.c.v * unitsOf(b) - a.c.v * unitsOf(a));
  if (!hs.length) return toast("Vous n'avez pas encore de bien où vous téléporter");
  setMovebar(`<div class="mvh"><span class="pin">✨</span><div><b>Se téléporter sur un de ses biens</b><span>${ST.state.profile.tp} restante${ST.state.profile.tp > 1 ? "s" : ""} aujourd'hui · vous pourrez y acheter les logements encore libres</span></div><button class="x" data-mvclose aria-label="Fermer">×</button></div>
    <div class="chs tpl">${hs.slice(0, 30).map(h => `<button class="chc" data-tpgo="${h.g}"><span class="th">${photo(h.c)}</span><span class="t"><b>${esc(title(h.c))}</b><span class="tag">${ord(h.c.arr)} arr. · ${esc(itemLabel(h.c, { t: "own", ks: h.ks, n: h.n }))}${freeOf(h.g) > 0 ? ` · <span class="green">${freeOf(h.g)} libre${freeOf(h.g) > 1 ? "s" : ""}</span>` : ""}</span></span><span class="go">›</span></button>`).join("")}</div>`, "tp");
}
async function doTeleport(g) {
  try { setState(await rpc("teleport", { p_card: g })); } catch (e) { return toast(e.message, "bad"); }
  lastLanding = null; setMovebar(""); hidePreview(); await placePawn(true); renderDice(); toast("Téléportation réussie ✨", "good"); showLand();
}

// ---- le dé : un vrai cube en 3D qui roule puis s'arrête sur la bonne face ----
const PIPS = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };
const dieHTML = n => `<div class="die n${n}">${[1, 2, 3, 4, 5, 6].map(f => `<i class="f${f}">${"<b></b>".repeat(f)}</i>`).join("")}</div>`;
async function animDice(n) {
  const D = $("#dice3d"); D.hidden = false;
  D.innerHTML = `<div class="dice rolling">${dieHTML(n)}</div>`; await sleep(650);
  D.querySelector(".dice").classList.remove("rolling"); await sleep(650);
  D.hidden = true;
}

function initPawnUI() {
  $("#b-roll").addEventListener("click", doRoll);
  $("#b-tp").addEventListener("click", openTeleport);
  $("#b-me").addEventListener("click", () => { placePawn(true); showLand(); });
  $("#movebar").addEventListener("click", async e => {
    if (e.target.closest("[data-mvclose]")) return setMovebar("");
    const tp = e.target.closest("[data-tpgo]"); if (tp) return doTeleport(+tp.dataset.tpgo);
    if (e.target.closest("[data-buyrolls]")) { if (await act("buy_rolls", {}, "5 lancers en plus !")) { setMovebar(""); renderDice(); } return; }
    const pm = e.target.closest("[data-paymode]"); if (pm) { landCredit = pm.dataset.paymode === "1"; return showLand(); }
    const lb = e.target.closest("[data-lbuy],[data-lbuild]"); if (lb) {
      const g = +(lb.dataset.lbuy || lb.dataset.lbuild), whole = !!lb.dataset.lbuild, credit = landCreditNow; lb.disabled = true; lb.textContent = "Achat…";
      if (await act(whole ? "buy_building" : "bank_buy", Object.assign(whole ? { p_card: g } : { p_card: g, p_k: null }, credit ? { p_credit: true } : {}), null)) { celebrate(card(g)); sfx("buy"); if (credit) toast("Acheté à crédit : il se rembourse tout seul avec la moitié du loyer.", "good"); }
      return showLand();
    }
    const lo = e.target.closest("[data-lopen]"); if (lo) return push("b", +lo.dataset.lopen);
  });
  setInterval(() => { if (cur() === "map") renderDice(); }, 15000);
  $("#pawnoff").addEventListener("click", () => placePawn(true));
}

// quand le pion sort de l'écran : une flèche au bord indique où il est
function pawnOff() {
  const el = $("#pawnoff"); if (!pawnMk || !el) return;
  if (window.pawn3d) {   // l'étiquette « Vous » flotte au-dessus du pion 3D
    const z = map.getZoom(), mpp = 40075016 * Math.cos(48.86 * Math.PI / 180) / (512 * Math.pow(2, z));
    const px = pawn3d.H * pawn3d.k(z) / mpp * Math.sin(map.getPitch() * Math.PI / 180);
    pawnMk.getElement().style.setProperty("--ph", Math.round(Math.max(18, px) + 6) + "px");
  }
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
