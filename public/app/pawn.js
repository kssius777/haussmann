"use strict";
// =====================================================================
//  La case d'un immeuble (le panneau du bas sur téléphone, à droite sur ordinateur) : ce qu'il y a, et l'achat.
//  On achète à la banque l'immeuble sur lequel sa montgolfière s'est posée (26/10/2026 : elle vole où l'on veut, place.js).
// =====================================================================
let moving = false, panelKind = "", lastLanding = null, landPainted = null;   // moving : pendant un vol ou un trajet en métro
const landPos = () => ST.state?.profile?.land ?? null;   // l'immeuble où l'on s'est posé : celui qu'on peut acheter
// vrai si on ne peut pas acheter cet immeuble à la banque (on ne s'y est pas posé)
const notLanded = g => landPos() !== g;
const fmtDist = d => d >= 1000 ? (d / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " km" : Math.round(d / 10) * 10 + " m";
const FC = f => ({ type: "FeatureCollection", features: f });

// l'immeuble où l'on se trouve est surligné en jaune
function paintTargets() {
  if (!mapReady) return; const g = landPos();
  if (landPainted != null && landPainted !== g) map.setFeatureState(Object.assign({ id: landPainted }, BLD), { tgt: 0 });
  if (g != null) { map.setFeatureState(Object.assign({ id: g }, BLD), { tgt: 1 }); landPainted = g; }
}
function onBuildingTap(g) { if (!moving) worldTapAt(g); }   // sa case, avec « Y aller » (place.js)

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
  if (!html) { m.hidden = true; m.innerHTML = ""; if (landView) { landView = false; sel = null; paintAll(); if (typeof stripKind !== "undefined" && false) $("#strip").hidden = false; } } else { m.hidden = false; m.innerHTML = html; }
  document.body.classList.toggle("landopen", panelKind === "land");
  if (panelKind === "land") { $("#pawnoff").hidden = true; fitLand(); }
  if (typeof offMe === "function") offMe();
}
// téléphone : la case tient dans l'écran sans faire défiler — on rétrécit la carte jusqu'à ce que tout rentre
function fitLand() {
  const m = $("#movebar"), lc = m.querySelector(".land .lc");
  if (!lc) return;
  // on part de la plus grande carte possible (pas de trou au milieu sur les grands écrans), puis on réduit jusqu'à ce que tout tienne
  const maxW = Math.max(120, Math.min(m.clientWidth - 28, innerWidth < 700 ? innerWidth * .8 : 300, 340));
  lc.style.setProperty("--cw", maxW + "px");
  requestAnimationFrame(() => {
    let w = maxW, i = 0;
    while (m.scrollHeight > m.clientHeight + 1 && w > 96 && i++ < 60) { w -= 8; lc.style.setProperty("--cw", w + "px"); }
  });
}
addEventListener("resize", () => { if (panelKind === "land") fitLand(); });
// ---- la case où l'on se pose -----------------------------------------------------------
// L : ce que le serveur a renvoyé à l'arrivée (péage, Chance) ; sans L, on réaffiche la case actuelle
// gv : afficher un autre immeuble que la case (clic sur la carte, sur un monument…) — même panneau, mais on ne peut pas l'acheter à la banque
let landView = false;
function showLand(L, gv) {
  const view = gv != null && gv !== landPos();
  const g = view ? gv : landPos(); if (g == null) return;
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
  else if (jb) { head = (justBought.whole ? "✓ Tout l'immeuble acheté" : "✓ Acheté") + (justBought.credit ? " à crédit !" : " comptant !"); cls = "home"; }
  else if (mine > 0 && free > 0) { head = "Vous êtes chez vous"; cls = "home"; }
  else if (mine > 0) { head = "Tout l'immeuble est à vous"; cls = "home"; }
  else if (free > 0) { head = !isP && tot > 1 ? `Libre : ${tot} ${word(tot)} à vendre` : "Libre, à vendre !"; cls = "free"; }
  else { head = "Tout est déjà pris"; cls = ""; }
  // ce qui s'est passé pendant le vol et à l'arrivée (on n'affiche que ce qui compte : le péage, la Chance)
  const lines = [];
  if (L?.toll > 0) lines.push(`<span class="ln bad">Péage · <b>−${fmtE(L.toll)}</b></span>`);
  if (L?.chance) { const ch = L.chance; const [nm] = CHANCE[ch.k] || ["Chance"]; lines.push(`<span class="ln ${BAD.has(ch.k) ? "bad" : "good"}"><small>Case Chance${BAD.has(ch.k) ? " · pas de chance" : ""}</small>🃏 <b>${esc(nm)}</b> : ${esc(chanceText(ch))}</span>`); }
  // le plan des logements ; immeuble entièrement libre : juste les cases vides (on voit tout de suite combien il y en a)
  const occ = mine || others ? occHTML(c, mine, others, free) : !isP && tot > 1 && tot <= 40 ? `<div class="occ mini"><div class="oc">${"<i></i>".repeat(tot)}</div></div>` : "";
  let btns = "";
  if (free > 0) {
    const unit = isP ? "1 part" : tot > 1 ? `1 ${word(1)} sur ${tot}` : c.lk === "l" ? "le logement" : "le local", allFree = !isP && free === tot && tot > 1, total = c.v * tot;
    const cap = ST.state?.loan_cap ?? 1e12, down = p => Math.ceil(p * downRate());
    const cashOK = cash >= c.v, creditOK = cash >= down(c.v) && c.v - down(c.v) <= cap;
    const cr = creditOK && (landCredit === null ? true : landCredit) || (!cashOK && creditOK);
    if (!cashOK && !creditOK) {
      const need = cash >= down(c.v) ? 0 : down(c.v) - cash, rate = netRate(), days = rate > 0 ? Math.ceil(need / rate) : 0;
      btns = `<div class="nomoney"><b>Pas assez pour celui-ci</b><span>${cash < down(c.v) ? `Il manque ${fmtE(need)} pour l'apport${days ? ` (dans ${days} jour${days > 1 ? "s" : ""} avec vos loyers)` : ""}.` : `Pas assez de crédit : ${fmtE(Math.max(0, cap))} max.`}</span></div>`;
    } else {
      const seg = `<div class="pay"><button data-paymode="1" aria-selected="${cr}" ${creditOK ? "" : "disabled"}><b>À crédit</b><small>${creditOK ? fmtE(down(c.v)) : "pas assez"}</small></button><button data-paymode="0" aria-selected="${!cr}" ${cashOK ? "" : "disabled"}><b>Comptant</b><small>${cashOK ? fmtE(c.v) : "pas assez"}</small></button></div>`;
      const again = jb && free > 0 && !justBought.whole;
      btns = `${seg}${slideHTML(`data-lbuy="${g}"`, cr ? "" : "cash", again ? `Glissez pour en acheter ${isP ? "une autre" : "un autre"}` : "Glissez pour acheter", `Acheter ${unit} · ${fmtE(cr ? down(c.v) : c.v)}`)}`;
      if (allFree && (cr ? cash >= down(total) && total - down(total) <= cap : cash >= total)) btns += `<button class="btn block light" data-lbuild="${g}">Tout l'immeuble · ${fmtE(cr ? down(total) : total)} <small class="muted">(+60 % de loyer)</small></button>`;
    }
    landCreditNow = cr;
  }
  if (view) {   // on ne s'y est pas posé : « Y aller », et la fiche (on n'achète à la banque que là où l'on s'est posé)
    const listed = ST.sale.has(g), go = goBtn(g);
    btns = go + `<button class="btn block ${listed && !go ? "buy" : "light"}" data-lopen="${g}"><span>${listed ? "En vente au Marché · voir l'offre" : isP ? "Voir la fiche" : "Voir la fiche de l'immeuble"}</span></button>`;
  }
  if (!view) btns += worldLandBtns(g, false);   // posé sur une station : le métro
  // racheter à un autre joueur : faire une offre (pas pendant l'écran « Acheté ! »)
  if (!jb && others > 0 && !isP && !ST.sale.has(g)) btns += `<button class="btn block light" data-lofr="${g}">🤝 Proposer de racheter ${owners.length === 1 ? "au propriétaire" : "à un propriétaire"}</button>`;
  if (jb) {   // juste acheté : ce qui a été payé, ce que ça rapporte ; s'il reste des logements libres, on peut continuer à acheter ici
    const n = justBought.whole ? tot : 1, price = c.v * n, dn = Math.ceil(price * downRate()), rent = c.rent * n * (justBought.whole ? 1.6 : 1);
    const paid = justBought.credit ? `Apport ${fmtE(dn)} · prêt ${fmtE(price - dn)}` : `Payé ${fmtE(price)}`;
    const gain = justBought.credit ? `+${fmtE(Math.round(rent * .3))} / jour, puis ${fmtE(Math.round(rent))} une fois le crédit remboursé` : `+${fmtE(Math.round(rent))} / jour de loyer en plus`;
    lines.unshift(`<span class="ln good">${paid}<br><b>${gain}</b></span>`);
    if (free > 0 && !justBought.whole && btns.includes("data-lbuy")) {
      btns += `<button class="btn block light" data-mvclose>Continuer</button>`;
    } else if (free > 0 && btns.includes("nomoney")) {   // plus assez pour en acheter un autre : on dit pourquoi
      btns = btns.replace("Pas assez pour celui-ci", "Pas assez pour en acheter un autre") + `<button class="btn block light" data-mvclose>Continuer</button>`;
    } else btns = `<button class="btn block buy" data-mvclose><span>Continuer</span></button>`;
  }
  setMovebar(`<div class="land${lines.length ? " hasln" : ""}"><div class="grab"></div><div class="lc" data-lopen="${g}">${cardHTML(c)}</div>
    <div class="lr"><b class="lh ${cls}">${head}</b>${lines.length ? `<div class="lns">${lines.join("")}</div>` : ""}${netLine(g)}${occ}<div class="lb">${btns}</div></div>
    <button class="x" data-mvclose aria-label="Fermer">×</button></div>`, "land");
  $("#movebar").classList.add("r" + c.r);
  landView = view; sel = view ? g : null; if (view) paintAll();
  $("#movebar").scrollTop = 0;
  if (L?.chance && window.confetti && !BAD.has(L.chance.k)) confetti("#A855F7", 24);
}
// acheter en glissant : on pousse le rond de gauche à droite pour valider (pas d'achat par erreur d'un simple toucher)
function slideHTML(attrs, cls, label, aria) {
  return `<button class="slide ${cls}" ${attrs} aria-label="${esc(aria)} (glisser vers la droite, ou Entrée)"><span class="sl-t">${esc(label)}</span><span class="sl-k" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span></button>`;
}
function initSlides(root) {
  root.addEventListener("pointerdown", e => {
    const s = e.target.closest(".slide"); if (!s || s.disabled || s.dataset.ok) return;
    const k = s.querySelector(".sl-k"), max = s.clientWidth - k.offsetWidth - 8, x0 = e.clientX; let dx = 0;
    try { s.setPointerCapture(e.pointerId); } catch (x) { }
    s.classList.add("drag");
    const mv = ev => { dx = Math.max(0, Math.min(max, ev.clientX - x0)); k.style.transform = `translateX(${dx}px)`; s.style.setProperty("--p", (dx / max).toFixed(3)); };
    const up = () => {
      s.removeEventListener("pointermove", mv); s.removeEventListener("pointerup", up); s.removeEventListener("pointercancel", up); s.classList.remove("drag");
      if (dx >= max * .85) { k.style.transform = `translateX(${max}px)`; s.style.setProperty("--p", 1); s.dataset.ok = "1"; sfx?.("coin"); s.click(); }
      else { k.style.transform = ""; s.style.setProperty("--p", 0); }
    };
    s.addEventListener("pointermove", mv); s.addEventListener("pointerup", up); s.addEventListener("pointercancel", up);
  });
}
// le plan de l'immeuble : une case par logement (à vous / à d'autres / libre) — aussi utilisé par la fiche
function occHTML(c, mine, others, free) {
  const tot = c.lots, isP = c.lk === "p"; if (tot <= 1) return "";
  const u = n => isP ? fmtN(n) : n;   // le titre dit déjà « en 100 parts » : la légende tient sur une ligne
  const leg = [mine ? `<span class="o-me">${u(mine)} à vous</span>` : "", others ? `<span class="o-th">${u(others)} à d'autres</span>` : "", free ? `<span class="o-fr">${u(free)} libre${free > 1 ? "s" : ""}</span>` : ""].filter(Boolean).join("");
  const viz = !isP && tot <= 40 ? `<div class="oc">${"<i class='me'></i>".repeat(mine)}${"<i class='th'></i>".repeat(others)}${"<i></i>".repeat(Math.max(0, free))}</div>`
    : `<div class="obar"><i class="me" style="width:${mine / tot * 100}%"></i><i class="th" style="width:${others / tot * 100}%"></i></div>`;
  return `<div class="occ"><div class="ot">${isP ? `${SPOTN[spotOf(c.g)?.[1]] || "Monument"} en ${fmtN(tot)} parts` : `Immeuble de ${tot} ${lotWord(c, tot)}`}</div>${viz}<div class="ol">${leg}</div></div>`;
}
let landCredit = null, landCreditNow = false, justBought = null;   // null = choix automatique (crédit si l'on n'a pas assez pour payer comptant)
const CREDIT_DOWN = 0.1;

function initPawnUI() {
  $("#minipack").innerHTML = packHTML("mini"); initSlides($("#movebar"));
  $("#movebar").addEventListener("click", async e => {
    if (e.target.closest("[data-mvclose]")) { justBought = null; setMovebar(""); return; }   // croix ou « Continuer » : la carte ne bouge pas
    const lg = e.target.closest("[data-lgo]"); if (lg) return flyMe(null, null, +lg.dataset.lgo);   // « Y aller » : sa montgolfière y vole
    const pm = e.target.closest("[data-paymode]"); if (pm) { landCredit = pm.dataset.paymode === "1"; return showLand(); }
    const lb = e.target.closest("[data-lbuy],[data-lbuild]"); if (lb) {
      if (lb.classList.contains("slide") && !lb.dataset.ok && e.detail !== 0) return;   // un simple toucher ne suffit pas : il faut pousser jusqu'au bout (au clavier, Entrée suffit)
      const g = +(lb.dataset.lbuy || lb.dataset.lbuild), whole = !!lb.dataset.lbuild, credit = landCreditNow; lb.disabled = true; lb.textContent = "Achat…";
      if (await act(whole ? "buy_building" : "bank_buy", Object.assign(whole ? { p_card: g } : { p_card: g, p_k: null }, credit ? { p_credit: true } : {}), null)) { justBought = { g, whole, credit: !!credit }; sfx("buy"); if (window.confetti) confetti("#2563EB", 30); }
      return showLand();
    }
    const lf = e.target.closest("[data-lofr]"); if (lf) { offerNext = +lf.dataset.lofr; sel = null; return push("b", offerNext); }
    const lo = e.target.closest("[data-lopen]"); if (lo) return push("b", +lo.dataset.lopen);
  });
}

function hidePreviewOnly() { const pv = $("#preview"); if (pv && !pv.hidden) { pv.hidden = true; sel = null; paintAll(); } }
