"use strict";
// =====================================================================
//  Navigation et pages : Patrimoine, Marché, Paris, fiches
// =====================================================================
const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  chev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>'
};
let tab = "map"; const stack = [];
const TABS = ["map", "booster", "assets", "market", "paris"];
const cur = () => stack.length ? "detail" : tab;

function go(t) {
  stack.length = 0; $("#p-detail").hidden = true;
  tab = t;
  for (const x of TABS) { const el = $("#p-" + x); const on = x === t; if (on && el.hidden) { el.hidden = false; el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); } else el.hidden = !on; }
  $$("#tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t));
  if (t === "map") { if (map) { map.resize(); pumpGeo(); if (paintAll.pending) setTimeout(paintAll, 0); renderTags(); } } else { hidePreview?.(); if (!moving && panelKind) { justBought = null; setMovebar(""); } }   // changer d'onglet ferme la case ouverte
  renderTab(t);
}
function renderTab(t) {
  if (t === "booster") renderBoosterPage();
  if (t === "assets") renderAssets();
  if (t === "market") renderMarket();
  if (t === "paris") renderParis();
  if (t === "map") { renderScore(); renderFilterCounts(); }
}
function push(kind, arg) { stack.push({ kind, arg }); renderDetail(true); }
function back() {
  stack.pop(); if (stack.length) return renderDetail(true);
  $("#p-detail").hidden = true; sel = null; renderTab(tab);
  if (tab === "map" && map) { pumpGeo(); paintAll(); if (pawnPos() != null && !moving) map.easeTo({ center: centerOf(pawnPos()), duration: 500 }); }   // retour sur la carte : recentrée sur la montgolfière
}
async function renderDetail(anim) {
  const top = stack[stack.length - 1]; if (!top) return; const el = $("#p-detail");
  el.hidden = false; if (anim) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); el.scrollTop = 0; }
  const K = { b: buildingPage, arr: arrPage, shop: shopPage, money: moneyPage, profile: profilePage, results: resultsPage, party: partyPage, gifts: giftsPage, admin: adminPage }[top.kind];
  if (!K) return;
  const html = await K(top.arg);
  if (stack[stack.length - 1] !== top) return;
  const y = el.scrollTop; el.innerHTML = html; if (!anim) el.scrollTop = y;
  afterDetail?.(top);
}
const dhead = t => `<div class="dhead"><button class="back" data-back>${ICON.back}Retour</button><b>${esc(t)}</b></div>`;

// délégation des clics
document.addEventListener("click", e => {
  const t = e.target.closest("[data-tab]"); if (t) return go(t.dataset.tab);
  const g = e.target.closest("[data-go]"); if (g) return go(g.dataset.go);
  const p = e.target.closest("[data-push]"); if (p) { const a = p.dataset.arg; return push(p.dataset.push, a == null ? undefined : isNaN(+a) ? a : +a); }
  if (e.target.closest("[data-back]")) return back();
});

// ---------------- barre du haut ----------------
function renderWallet() {
  const s = ST.state; if (!s?.profile) return;
  $("#cash").textContent = fmtE(liveCash());
  $("#rate").textContent = netRate() ? `+${fmtE(netRate())}/j` : "";
  const pl = $("#plaque"); if (pl) {   // la plaque du logo indique l'arrondissement où se trouve la montgolfière
    const a = s.profile.pos != null && typeof IDX !== "undefined" ? IDX?.arr?.[ai(s.profile.pos)]?.n : null;
    pl.dataset.sub = a ? (a === 1 ? "1ᵉʳ Arrᵗ" : a + "ᵉ Arrᵗ") : "Paris";
  }
  const cb = $("#credbar"); if (cb && s.loan_cap != null) {   // crédit encore disponible, sous la barre du haut
    const cap = Math.max(0, +s.loan_cap || 0), loans = +s.loans || 0, pct = loans + cap ? Math.round(loans / (loans + cap) * 100) : 0;
    cb.innerHTML = `<span>🏦 Crédit dispo <b>${fmtE(cap)}</b></span><i class="trk"><i style="width:${pct}%" class="${pct < 60 ? "" : pct < 90 ? "mid" : "hi"}"></i></i><span class="pc">${pct} % du plafond</span>`;
    cb.hidden = false; document.body.classList.add("hascred");
  }
  const pr = PARTIES[s.profile.party]; const av = $("#avatar");
  av.textContent = (s.profile.pseudo || "?")[0].toUpperCase(); av.style.background = pr ? pr.c : "#94A3B8";
  const n = packsReady(); const b = $("#packbadge"); b.hidden = !n; b.textContent = n;
}

// ---------------- PATRIMOINE ----------------
let assetF = "all", assetArr = 0, assetSort = "v", assetN = innerWidth < 700 ? 18 : 30, distAll = false;
function worthNow() { const s = ST.state; return liveCash() + (+s.value || 0) - (+s.debt || 0) - (+s.loans || 0); }
function logWorth() {
  try { const d = new Date().toISOString().slice(0, 10); const h = JSON.parse(localStorage.getItem("hm_hist") || "{}"); h[d] = Math.round(worthNow());
    const keys = Object.keys(h).sort().slice(-30); const o = {}; keys.forEach(k => o[k] = h[k]); localStorage.setItem("hm_hist", JSON.stringify(o)); return o; } catch (e) { return {}; }
}
function sparkSVG(vals) {   // petite courbe d'évolution du patrimoine (30 derniers jours)
  if (vals.length < 2) return "";
  const W = 320, H = 70, mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1;
  const pts = vals.map((v, i) => [i * W / (vals.length - 1), H - 6 - (v - mn) / sp * (H - 12)]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}L${W} ${H}L0 ${H}Z" fill="rgba(37,99,235,.10)"/><path d="${d}" fill="none" stroke="#2563EB" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
}
async function renderAssets() {
  try { await renderAssets0(); }
  catch (e) { console.error(e); $("#p-assets").innerHTML = `<div class="wrap"><h1 class="h1">Patrimoine</h1><p class="sub">Le chargement a échoué : ${esc(String(e?.message || e))}</p><button class="btn" onclick="renderAssets()">Réessayer</button></div>`; }
}
async function renderAssets0() {
  const s = ST.state; if (!s?.profile) return;
  const val = h => h.c.v * unitsOf(h);
  const hs = holdings();
  const counts = { C: 0, U: 0, R: 0, L: 0, M: 0 }; for (const h of hs) counts[h.c.r]++;
  const onLoan = h => ST.loan.has(h.g), mortd = h => h.ks.some(k => ST.mort.has(h.g + ":" + k)) || ST.mort.has(h.g + ":-1");
  const nLoan = hs.filter(onLoan).length, nMort = hs.filter(mortd).length;
  // répartition par arrondissement : une ligne par arrondissement, barre proportionnelle à la valeur
  const by = new Map(); for (const h of hs) { const a = h.c.arr; const o = by.get(a) || { a, v: 0, rent: 0, n: 0 }; o.v += val(h); o.rent += baseRent(h); o.n++; by.set(a, o); }
  const dist = [...by.values()].sort((x, y) => y.v - x.v), vmax = dist[0]?.v || 1, vtot = dist.reduce((t, d) => t + d.v, 0) || 1;
  const distRow = d => { const m = ST.mayors[d.a - 1], pc = m ? PARTIES[m.party]?.c : null;
    return `<button class="drow" data-aa="${d.a}" aria-pressed="${assetArr === d.a}" style="--pc:${pc || "#2D55C8"}"><b>${ord(d.a)}</b><span class="bar"><small>${m?.mayor === ME ? "👑 Vous êtes le maire · " : ""}${d.n} bien${d.n > 1 ? "s" : ""} · ${Math.round(d.v / vtot * 100)} %</small><i style="width:${Math.max(3, d.v / vmax * 100)}%"></i></span><span class="v num"><b>${fmtE(d.v)}</b><small>+${fmtE(d.rent)}/j</small></span></button>`; };
  // la collection : filtres, tri, et pagination pour rester lisible avec des centaines de cartes
  let list = assetF === "all" ? hs : assetF === "loan" ? hs.filter(onLoan) : assetF === "mort" ? hs.filter(mortd) : hs.filter(h => h.c.r === assetF);
  if (assetArr) list = list.filter(h => h.c.arr === assetArr);
  const SORT = { v: (a, b) => val(b) - val(a), rent: (a, b) => baseRent(b) - baseRent(a), r: (a, b) => ORDER.indexOf(a.c.r) - ORDER.indexOf(b.c.r) || val(b) - val(a), arr: (a, b) => a.c.arr - b.c.arr || val(b) - val(a) };
  list = list.slice().sort(SORT[assetSort] || SORT.v);
  const hist = logWorth(); const hv = Object.values(hist);
  const nLots = hs.reduce((a, h) => a + h.ks.length, 0);
  const rank = ST.board ? ST.board.findIndex(x => x.id === ME) + 1 : 0;
  const loans = +s.loans || 0, debt = +s.debt || 0;
  const debtHTML = (loans || debt) ? (() => { const v = +s.value || 0, ratio = v ? Math.round((loans + debt) / v * 100) : 0, cap = Math.max(0, +s.loan_cap || 0), pct = loans + cap ? Math.round(loans / (loans + cap) * 100) : 0;
    const lvl = pct < 60 ? "" : pct < 90 ? "mid" : "hi";
    return `<div class="debt2">
      <div class="d2h"><span>Endettement <b>${ratio} %</b> <em class="${ratio < 50 ? "ok" : ratio < 80 ? "mid" : "hi"}">${ratio < 50 ? "sain" : ratio < 80 ? "élevé" : "très élevé"}</em></span><small class="muted">vos dettes ÷ la valeur de vos biens</small></div>
      <div class="d2h"><span>Plafond d'emprunt <b>${pct} %</b> utilisé</span><span>Encore empruntable : <b>${fmtE(cap)}</b></span></div>
      <div class="dbar ${lvl}"><i style="width:${pct}%"></i></div>
      <small class="muted">${pct >= 90 ? "Votre plafond est presque atteint : il remonte à mesure que vos loyers augmentent et que vos crédits se remboursent." : "Le plafond augmente avec vos loyers ; les crédits se remboursent tout seuls avec 70 % du loyer des biens achetés à crédit."}</small></div>`; })() : "";
  const distHTML = dist.length ? `<div class="dh2"><h2 class="h3">Où sont vos biens</h2>${assetArr ? `<button class="lnk" data-aa="0">Tous les arrondissements</button>` : `<span class="muted">${dist.length} arr. · touchez pour filtrer</span>`}</div>
    <div class="drows">${(distAll || assetArr ? dist : dist.slice(0, 5)).map(d => { const m = ST.mayors[d.a - 1], my = m?.mayor === ME; return `<button class="drow" data-aa="${d.a}" aria-pressed="${assetArr === d.a}"><span class="dn${my ? " may" : ""}">${d.a}<sup>${d.a === 1 ? "er" : "e"}</sup>${my ? `<em title="Vous êtes maire">👑</em>` : ""}</span><span class="dmid"><span class="dtop"><b class="num">${fmtE(d.v)}</b><small>${d.n} bien${d.n > 1 ? "s" : ""}</small></span><i class="dbar"><i style="width:${Math.max(3, d.v / vmax * 100)}%"></i></i></span><span class="dr num">+${fmtE(d.rent)}<small>/jour</small></span></button>`; }).join("")}</div>
    ${!assetArr && dist.length > 5 ? `<button class="dmore" data-dall>${distAll ? "Réduire" : `Voir les ${dist.length} arrondissements`}</button>` : ""}` : "";
  $("#p-assets").innerHTML = `<div class="wrap">
    <div class="pathead"><div><p class="eyebrow">Patrimoine net</p><h1 class="h1 num big" id="worth">${fmtE(worthNow())}</h1>
      <p class="sub" style="margin:0">Trésorerie + biens − dettes</p></div>
      ${hv.length > 1 ? `<div class="aspark">${sparkSVG(hv)}<small>sur ${hv.length} jours</small></div>` : ""}</div>
    ${rank ? `<button class="rankpill" data-push="results">🏆 Classement : vous êtes <b>${rank === 1 ? "1er" : rank + "e"}</b> sur ${ST.board.length} joueur${ST.board.length > 1 ? "s" : ""}</button>` : ""}
    <div class="kpis k4">
      <div class="kpi"><span>Trésorerie</span><b class="num" id="cash2">${fmtE(liveCash())}</b><small class="muted">disponible</small></div>
      <div class="kpi"><span>Loyers / jour</span><b class="green num">+${fmtE(netRate())}</b><small class="muted">${s.loan_rate > 0 ? `+ ${fmtE(s.loan_rate)} remboursent vos crédits` : s.taxes > 0 ? `après ${fmtE(s.taxes)} de taxe des maires` : "versés en continu"}</small></div>
      <div class="kpi"><span>Valeur des biens</span><b class="num">${fmtE(+s.value || 0)}</b><small class="muted">${nLots} logement${nLots > 1 ? "s" : ""}</small></div>
      <div class="kpi ${loans || debt ? "warn" : ""}" ${loans ? `data-af="loan" data-scroll="1" role="button" title="Voir mes biens à crédit" style="cursor:pointer"` : ""}><span>Dettes${loans ? " ›" : ""}</span><b class="num">${fmtE(loans + debt)}</b><small class="muted">${loans ? `${s.credits || 0} crédit${(s.credits || 0) > 1 ? "s" : ""} en cours` : "aucun crédit"}${debt ? ` · hypothèques ${fmtE(debt)}` : ""}</small></div>
    </div>
    ${debtHTML}
    ${distHTML}
    <h2 class="h2">Ma collection <span class="muted" style="font:700 14px var(--f)">${hs.length} carte${hs.length > 1 ? "s" : ""}</span></h2>
    <div class="chips"><button class="chip plain" data-af="all" aria-pressed="${assetF === "all"}">Tout</button>
      ${nLoan ? `<button class="chip plain" data-af="loan" aria-pressed="${assetF === "loan"}">🏦 À crédit · ${nLoan}</button>` : ""}
      ${nMort ? `<button class="chip plain" data-af="mort" aria-pressed="${assetF === "mort"}">🔒 Hypothéqués · ${nMort}</button>` : ""}
      ${ORDER.split("").reverse().map(r => counts[r] ? `<button class="chip" data-af="${r}" aria-pressed="${assetF === r}">${rarSq(r)}${counts[r]}</button>` : "").join("")}</div>
    <div class="ctools">${assetArr ? `<span class="afilter">${ord(assetArr)} arrondissement<button data-aa="0" aria-label="Retirer le filtre">×</button></span>` : `<span class="muted" style="font-size:13px;font-weight:700">${list.length} affichée${list.length > 1 ? "s" : ""}</span>`}
      <select id="asort" aria-label="Trier">${[["v", "Les plus chères"], ["rent", "Les meilleurs loyers"], ["r", "Les plus rares"], ["arr", "Par arrondissement"]].map(([k, l]) => `<option value="${k}" ${assetSort === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    ${assetF === "loan" ? `<div class="crx" style="margin:0 0 10px">Chaque bien à crédit se rembourse tout seul avec 70 % de son loyer. Vous pouvez aussi le rembourser en avance depuis sa fiche.</div>` : ""}
    ${!hs.length ? `<div class="empty">Vous n'avez encore aucun bien.<br><br><button class="btn" data-go="booster">Ouvrir un booster</button></div>`
      : !list.length ? `<div class="empty">Rien dans cette catégorie.</div>`
      : `<div class="grid-cards">${list.slice(0, assetN).map(cardBtn).join("")}</div>${list.length > assetN ? `<button class="btn light gmore" data-gmore>Afficher plus (${list.length - assetN})</button>` : ""}`}
  </div>`;
  function cardBtn(h) { return `<button data-push="b" data-arg="${h.g}" class="cw">${cardHTML(h.c, { w: "100%", item: { t: "own", ks: h.ks, n: h.n } })}${onLoan(h) ? `<span class="tagc loan">🏦 crédit</span>` : mortd(h) ? `<span class="tagc mort">🔒 hypothéqué</span>` : ""}</button>`; }
  if (!ST.board) rpc("leaderboard").then(b => { ST.board = b; if (cur() === "assets") renderAssets(); }).catch(() => { });
}
$("#p-assets").addEventListener("click", e => {
  const f = e.target.closest("[data-af]"); if (f) { assetF = f.dataset.af; assetN = 30; renderAssets(); if (f.dataset.scroll) setTimeout(() => $("#p-assets .chips")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30); return; }
  if (e.target.closest("[data-dall]")) { distAll = !distAll; return renderAssets(); }
  const a = e.target.closest("[data-aa]"); if (a) { const v = +a.dataset.aa; assetArr = assetArr === v ? 0 : v; assetN = 30; renderAssets(); if (assetArr) setTimeout(() => $("#p-assets .chips")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30); return; }
  if (e.target.closest("[data-dall]")) { distAll = !distAll; return renderAssets(); }
  if (e.target.closest("[data-gmore]")) { assetN += 60; return renderAssets(); }
});
$("#p-assets").addEventListener("change", e => { if (e.target.id === "asort") { assetSort = e.target.value; renderAssets(); } });

// acheter une annonce : à crédit (apport 10 %) ou comptant ; attr = attributs du bouton selon la page
function listingBuy(l, attr) {
  const cash = liveCash(), cap = ST.state?.loan_cap ?? 1e12, down = Math.ceil(l.price * downRate()), crOK = cash >= down && l.price - down <= cap;
  return `<span class="lbuy"><button class="btn sm blue2" ${attr(l.id, 1)} ${crOK ? "" : "disabled"} title="La banque prête 90 %, remboursé tout seul par le loyer">À crédit · ${fmtE(down)}</button><button class="lnk" ${attr(l.id, 0)} ${cash < l.price ? "disabled" : ""}>ou comptant ${fmtE(l.price)}</button></span>`;
}
// ---------------- OFFRES DE RACHAT ----------------
let ofCounter = null;
function setOffers(r) { if (!r) return; if (r.state) setState(r.state); ST.offers = { received: r.received || [], sent: r.sent || [] }; paintOfferBadge(); }
const offersBadge = () => !ST.offers ? 0 : ST.offers.received.filter(o => o.status === "open").length + ST.offers.sent.filter(o => o.status === "countered").length;
function paintOfferBadge() {
  const t = $('#tabs [data-tab="market"]'); if (!t) return; let b = t.querySelector(".tbadge"); const n = offersBadge();
  if (!n) { b?.remove(); return; } if (!b) { b = document.createElement("i"); b.className = "tbadge"; t.appendChild(b); } b.textContent = n;
}
let ofSeen = null;
async function refreshOffers() {
  try { const r = await rpc("my_offers"); const before = ofSeen; setOffers(r); const ids = new Set(ST.offers.received.filter(o => o.status === "open").map(o => o.id).concat(ST.offers.sent.filter(o => o.status === "countered").map(o => -o.id)));
    if (before) { const nw = [...ids].filter(x => !before.has(x)); if (nw.length) toast(`🤝 ${nw.length > 1 ? nw.length + " nouvelles réponses ou offres" : "Nouvelle offre ou contre-proposition"} : voir le Marché → Offres`, "good"); }
    ofSeen = ids; } catch (e) { }
}
function lotLabel(c, k) { return `${lotName(c, k)}${c.lk === "l" ? " · " + ord(floorOfLot(c, k)) + " étage" : ""}`; }
const OST = { open: "en attente", countered: "contre-proposition", accepted: "✓ vendu", refused: "refusée", expired: "expirée", cancelled: "annulée" };
async function offersHTML() {
  try { setOffers(await rpc("my_offers")); } catch (e) { return `<div class="empty">Les offres arrivent bientôt (mise à jour en cours).</div>`; }
  const all = ST.offers.received.concat(ST.offers.sent); await ensureCards(all.map(o => o.card));
  const left = o => { const s = (new Date(o.expires_at) - Date.now()) / 1000; return s > 0 ? `encore ${hm(s)}` : ""; };
  const row = (o, mine) => { const c = card(o.card); if (!c) return "";
    let act = "";
    if (mine && o.status === "open") act = ofCounter === o.id
      ? `<div class="ofc"><input class="inp num" id="ofcp" type="number" inputmode="numeric" step="1000" value="${Math.round(o.price * 1.15 / 1000) * 1000}"><button class="btn sm" data-of="counter" data-id="${o.id}">Envoyer</button><button class="btn sm ghost" data-of="nocounter">×</button></div>`
      : `<button class="btn sm green" data-of="accept" data-id="${o.id}">Accepter</button><button class="btn sm light" data-of="countero" data-id="${o.id}">Contre-proposer</button><button class="btn sm ghost" data-of="refuse" data-id="${o.id}">Refuser</button>`;
    if (!mine && o.status === "countered") act = `<button class="btn sm green" data-of="yes" data-id="${o.id}">Accepter ${fmtE(o.counter)}</button><button class="btn sm ghost" data-of="no" data-id="${o.id}">Refuser</button>`;
    if (!mine && o.status === "open") act = `<button class="btn sm ghost" data-of="cancel" data-id="${o.id}">Annuler</button>`;
    const live = o.status === "open" || o.status === "countered";
    return `<div class="orow${live ? " live" : ""}"><button class="th" data-push="b" data-arg="${o.card}">${photo(c)}</button>
      <div class="t"><b>${esc(title(c))}</b><span>${esc(lotLabel(c, o.k))} · ${mine ? "offre de " : "à "}${esc(o.other)}</span>
        <span class="num"><b>${fmtE(o.price)}</b>${o.counter ? ` → contre-proposition <b>${fmtE(o.counter)}</b>` : ""} · ${o.credit ? "à crédit" : "comptant"} · <em class="st-${o.status}">${OST[o.status] || o.status}</em>${live ? " · " + left(o) : ""}</span></div>
      ${act ? `<div class="oacts2">${act}</div>` : ""}</div>`; };
  const R = ST.offers.received, S = ST.offers.sent;
  return `<p class="sub" style="margin:4px 0 10px">Proposez à un joueur de lui racheter son logement depuis la fiche de l'immeuble (« Faire une offre »). Il a 24 h pour accepter, refuser ou faire une contre-proposition.</p>
    <h2 class="h3">Reçues</h2>${R.length ? `<div class="rows">${R.map(o => row(o, true)).join("")}</div>` : `<div class="empty">Aucune offre reçue.</div>`}
    <h2 class="h3">Envoyées</h2>${S.length ? `<div class="rows">${S.map(o => row(o, false)).join("")}</div>` : `<div class="empty">Aucune offre envoyée.</div>`}`;
}
async function offerAct(b) {
  const a = b.dataset.of, id = +b.dataset.id;
  if (a === "countero") { ofCounter = id; return renderMarket(); }
  if (a === "nocounter") { ofCounter = null; return renderMarket(); }
  b.disabled = true;
  try {
    let r;
    if (a === "accept") r = await rpc("respond_offer", { p_id: id, p_action: "accept" });
    if (a === "refuse") r = await rpc("respond_offer", { p_id: id, p_action: "refuse" });
    if (a === "counter") { r = await rpc("respond_offer", { p_id: id, p_action: "counter", p_price: +($("#ofcp")?.value || 0) }); ofCounter = null; }
    if (a === "yes") r = await rpc("answer_counter", { p_id: id, p_accept: true });
    if (a === "no") r = await rpc("answer_counter", { p_id: id, p_accept: false });
    if (a === "cancel") r = await rpc("cancel_offer", { p_id: id });
    setOffers(r);
    if (r?.error) toast(r.error, "bad"); else toast({ accept: "Vendu ! L'argent arrive dans votre trésorerie", refuse: "Offre refusée", counter: "Contre-proposition envoyée", yes: "Acheté ! Le logement est à vous", no: "Contre-proposition refusée", cancel: "Offre annulée : l'argent vous est rendu" }[a], "good");
    await Promise.all([refreshState(), refreshHold(), refreshMap()]).catch(() => { }); renderWallet(); paintAll?.();
  } catch (e) { toast(e.message, "bad"); }
  renderMarket();
}
// ---------------- MARCHÉ ----------------
let marketTab = "all", sellAll = false;
function sellList() {   // mes biens qu'on peut mettre en vente : un toucher ouvre la fiche, formulaire de vente déjà ouvert
  const hs = holdings().filter(h => !ST.loan.has(h.g) && (h.c.lk === "p" ? !ST.mort.has(h.g + ":-1") : h.ks.some(k => !ST.mort.has(h.g + ":" + k)))).sort((a, b) => b.c.v * unitsOf(b) - a.c.v * unitsOf(a));
  if (!hs.length) return `<div class="empty">Aucun bien à vendre pour l'instant : les biens achetés à crédit se vendent une fois le crédit remboursé.</div>`;
  const shown = sellAll ? hs : hs.slice(0, 12);
  return `<h2 class="h3">Mettre un de mes biens en vente</h2><div class="rows">${shown.map(h => `<button class="lrow" data-sellg="${h.g}"><div class="th">${photo(h.c)}</div><div class="t"><b>${esc(title(h.c))}</b><span>${esc(ownSentence(h.c, h.ks, h.n))} · ${ord(h.c.arr)} arr.</span></div><div class="v"><b class="num">${fmtE(h.c.v * unitsOf(h))}</b><span class="btn sm amber">Vendre</span></div></button>`).join("")}</div>
    ${hs.length > shown.length ? `<button class="btn light gmore" data-sellall>Voir les ${hs.length} biens</button>` : ""}`;
}
async function renderMarket() {
  const el = $("#p-market");
  if (!ST.market) el.innerHTML = `<div class="wrap"><h1 class="h1">Marché</h1><p class="sub">Chargement…</p></div>`;
  try { ST.market = await rpc("market"); } catch (e) { toast(e.message, "bad"); return; }
  const L = ST.market.listings; await ensureCards([...L.map(l => l.card), ...ST.market.sales.map(s => s.card)]);
  const mineL = L.filter(l => l.seller === ME), others = L.filter(l => l.seller !== ME);
  const rows = (arr, own) => arr.map(l => { const c = card(l.card); if (!c) return ""; const est = c.v * (l.n || 1); const d = (l.price - est) / est;
    return `<div class="lrow"><button class="th" data-push="b" data-arg="${l.card}" aria-label="Voir la fiche">${photo(c)}</button>
      <div class="t"><b>${esc(title(c))}</b><span>${l.k != null ? lotName(c, l.k) : l.n + " part" + (l.n > 1 ? "s" : "")} · ${ord(c.arr)} arr. · ${own ? "votre annonce" : "par " + esc(l.pseudo)}</span>
      <span><span class="pill" style="height:20px;font-size:11px;${d <= 0 ? "background:#DCFCE7;color:#15803D" : d > .25 ? "background:#FEE2E2;color:#B91C1C" : ""}">${d <= 0 ? "Bonne affaire" : "+" + Math.round(d * 100) + " % vs estimation"}</span></span></div>
      <div class="v"><b class="num">${fmtE(l.price)}</b>${own ? `<button class="btn sm ghost" data-unlist="${l.id}">Retirer</button>` : listingBuy(l, (id, cr) => `data-buy="${id}" data-cr="${cr}"`)}</div></div>`; }).join("");
  const sales = ST.market.sales.map(s => { const c = card(s.card); return c ? `<button class="lrow" data-push="b" data-arg="${s.card}"><div class="th">${photo(c)}</div><div class="t"><b>${esc(title(c))}</b><span>${s.k != null ? lotName(c, s.k) : s.n + " parts"} · acheté par ${esc(s.buyer || "?")} · ${ago(s.at)}</span></div><div class="v num"><b>${fmtE(s.price)}</b></div></button>` : ""; }).join("");
  el.innerHTML = `<div class="wrap"><h1 class="h1">Marché</h1><p class="sub">Les biens mis en vente par les joueurs. Le vendeur reçoit le prix moins 5 % de commission.</p>
    <div class="seg" role="tablist"><button data-mt="all" aria-selected="${marketTab === "all"}">Annonces${others.length ? " · " + others.length : ""}</button><button data-mt="mine" aria-selected="${marketTab === "mine"}">Vendre${mineL.length ? " · " + mineL.length : ""}</button><button data-mt="offers" aria-selected="${marketTab === "offers"}">Offres${offersBadge() ? ` <i class="obadge">${offersBadge()}</i>` : ""}</button><button data-mt="sales" aria-selected="${marketTab === "sales"}">Ventes</button></div>
    ${marketTab === "all" ? (others.length ? `<div class="rows">${rows(others, false)}</div>` : `<div class="empty"><b>Aucune annonce pour l'instant.</b><br><span class="muted">Les joueurs peuvent vendre leurs biens ici, 5 % de commission. Soyez le premier !</span><br><br><button class="btn sm light" data-mt="mine">Vendre un de mes biens</button></div>${sales ? `<h2 class="h3">Dernières ventes</h2><div class="rows">${sales}</div>` : ""}`) : ""}
    ${marketTab === "mine" ? (mineL.length ? `<div class="rows">${rows(mineL, true)}</div>` : "") + sellList() : ""}
    ${marketTab === "offers" ? await offersHTML() : ""}
    ${marketTab === "sales" ? (sales ? `<div class="rows">${sales}</div>` : `<div class="empty">Pas encore de vente entre joueurs.</div>`) : ""}</div>`;
}
$("#p-market").addEventListener("click", async e => {
  const t = e.target.closest("[data-mt]"); if (t) { marketTab = t.dataset.mt; return renderMarket(); }
  const of = e.target.closest("[data-of]"); if (of) return offerAct(of);
  const sg = e.target.closest("[data-sellg]"); if (sg) { sellNext = +sg.dataset.sellg; sel = null; return push("b", sellNext); }
  if (e.target.closest("[data-sellall]")) { sellAll = true; return renderMarket(); }
  const b = e.target.closest("[data-buy]"); if (b) { b.disabled = true; const cr = b.dataset.cr === "1"; await act("buy_listing", Object.assign({ p_id: +b.dataset.buy }, cr ? { p_credit: true } : {}), cr ? "Achat conclu à crédit : la banque a prêté 90 %" : "Achat conclu !"); return renderMarket(); }
  const u = e.target.closest("[data-unlist]"); if (u) { u.disabled = true; await act("unlist", { p_id: +u.dataset.unlist }, "Annonce retirée"); return renderMarket(); }
});

// action générique : appel serveur + mise à jour
async function act(fn, args, okMsg) {
  try { setState(await rpc(fn, args)); await Promise.all([refreshHold(), refreshMap()]); if (okMsg) toast(okMsg, "good"); renderWallet(); paintAll(); return true; }
  catch (e) { toast(e.message, "bad"); return false; }
}

// ---------------- PARIS : résultats, actu, classement ----------------
let parisTab = "news";
function newsLine(n) {
  const c = n.card != null ? card(n.card) : null; const who = esc(n.pseudo || "Un joueur"); const pc = PARTIES[n.party]?.c || "#94A3B8";
  const a = n.arr ? `${ord(n.arr)} arrondissement` : "";
  switch (n.kind) {
    case "mayor": return ["🏛️", `<b>${who}</b> devient maire du ${a}`, PARTIES[n.party]?.n || "", pc];
    case "title": return ["🏢", `<b>${who}</b> possède maintenant tout le <b>${esc(c ? title(c) : "immeuble")}</b>`, a, "#0EA5A0"];
    case "pull": return [n.data?.tier === "M" ? "✨" : "⭐", `<b>${who}</b> tire une carte ${RAR[n.data?.tier]?.n || ""} : <b>${esc(c ? title(c) : "")}</b>`, a, RAR[n.data?.tier]?.c];
    case "toll": return ["💸", `<b>${who}</b> passe chez <b>${esc(n.data?.pseudo || "")}</b>${n.data?.to === ME ? " (vous)" : ""} et lui paie ${fmtE(n.data?.amount || 0)}`, c ? title(c) : "", n.data?.to === ME ? "#0FA968" : "#94A3B8"];
    case "sale": return ["🤝", `<b>${who}</b> achète <b>${esc(c ? title(c) : "un bien")}</b> pour ${fmtE(n.data?.price || 0)}`, a, "#F59E0B"];
    case "week": return ["🗳️", `<b>${esc(PARTIES[n.data?.party]?.n || "")}</b> remporte l'Hôtel de Ville cette semaine`, `${n.data?.mayors} maires · ${fmtE(n.data?.bonus || 0)}/j par membre`, PARTIES[n.data?.party]?.c];
    default: return ["•", n.kind, "", "#94A3B8"];
  }
}
function evText(ev) {
  const e = EVENTS[ev.ev] || ["Événement", "📣"], pct = Math.round(Math.abs(ev.m - 1) * 100);
  return { ic: e[1], t: `${e[0]} dans le ${ord(ev.arr)}`, d: ev.m >= 1 ? `Aujourd'hui, les loyers y sont augmentés de ${pct} %.` : `Aujourd'hui, les loyers y baissent de ${pct} %.` };
}
// carte de Paris : chaque arrondissement aux couleurs du parti de son maire
function mayorsMapSVG() {
  const kx = 0.6579; let xs = [], ys = [];
  const rings = IDX.arr.map(a => a.outline.map(r => decodeRing(r)));
  rings.flat(2).forEach(([x, y]) => { xs.push(x * kx); ys.push(y); });
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), W = 400, H = W * (y1 - y0) / (x1 - x0);
  const P = ([x, y]) => `${((x * kx - x0) / (x1 - x0) * W).toFixed(1)},${((y1 - y) / (y1 - y0) * H).toFixed(1)}`;
  return `<svg class="pmap" viewBox="-4 -4 ${W + 8} ${(H + 8).toFixed(0)}">${IDX.arr.map((a, i) => { const m = ST.mayors[i], c = m ? PARTIES[m.party]?.c || "#94A3B8" : "#E2E8F0";
    return `<g data-push="arr" data-arg="${i}" style="cursor:pointer">${rings[i].map(r => `<polygon points="${r.map(P).join(" ")}" fill="${c}" stroke="#fff" stroke-width="2.2"/>`).join("")}</g>`; }).join("")}
    ${IDX.arr.map((a, i) => { const [x, y] = P(a.center).split(","); const m = ST.mayors[i]; return `<text x="${x}" y="${+y + 4}" text-anchor="middle" font-size="12" font-weight="900" fill="${m ? "#fff" : "#64748B"}" pointer-events="none">${a.n}</text>`; }).join("")}</svg>`;
}
async function renderParis() {
  const el = $("#p-paris");
  const [feed, board] = await Promise.all([rpc("feed").catch(() => []), rpc("leaderboard").catch(() => [])]);
  ST.feed = feed; ST.board = board;
  await ensureCards(feed.filter(n => n.card != null).map(n => n.card));
  const seats = seatCounts(); const w = ST.state?.week; const ev = ST.state?.event;
  const medal = i => ["🥇", "🥈", "🥉"][i] || `<span class="n">${i + 1}</span>`;
  el.innerHTML = `<div class="wrap">
    <h1 class="h1">Paris</h1>
    ${!ST.state?.profile?.party ? `<button class="box party-cta" data-push="party"><div class="pc-em">${PARTY_ORDER.map(k => emblemSVG(k, 26)).join("")}</div><b>Choisissez votre camp</b><span>+${MEMBER_BONUS} % de loyers là où votre parti tient la mairie.</span></button>` : ""}
    <div class="box pbox">
      <div class="pb-h"><p class="eyebrow">Les 20 mairies</p>${w?.party ? `<button class="pill" data-push="results" style="background:${PARTIES[w.party].c};color:#fff;border:0">🏛 Hôtel de Ville : ${esc(PARTIES[w.party].n)} ›</button>` : ""}</div>
      <div data-push="results" style="cursor:pointer">${mayorsMapSVG()}</div>
      <div class="pleg">${PARTY_ORDER.map(k => `<span><i style="background:${PARTIES[k].c}"></i>${esc(PARTIES[k].n)} <em>(${esc(PARTIES[k].side.toLowerCase())})</em> <b>${seats[k] || 0}</b></span>`).join("")}</div>
      <p class="sub" style="margin:8px 0 0;font-size:12.5px">Le maire d'un arrondissement est le joueur qui y possède le plus. Chaque lundi, le parti qui a le plus de maires gagne l'Hôtel de Ville.</p>
      <button class="hdvbtn" data-push="results"><span>🏛</span><b>La course à l'Hôtel de Ville</b><em>Résultats, prime de la semaine ›</em></button>
    </div>
    ${ev ? (() => { const t = evText(ev); return `<button class="box evbox" data-push="arr" data-arg="${ev.arr - 1}"><span class="ei">${t.ic}</span><span><small>Événement du jour</small><b>${esc(t.t)}</b><span>${t.d}</span></span></button>`; })() : ""}
    <div class="seg" role="tablist"><button data-pt="news" aria-selected="${parisTab === "news"}">Actu</button><button data-pt="rank" aria-selected="${parisTab === "rank"}">Classement</button><button data-pt="arr" aria-selected="${parisTab === "arr"}">Arrondissements</button></div>
    ${parisTab === "news" ? (feed.length ? `<div class="feed">${feed.map(n => { const [ic, txt, sub, col] = newsLine(n); return `<${n.card != null ? `button data-push="b" data-arg="${n.card}"` : n.arr ? `button data-push="arr" data-arg="${n.arr - 1}"` : "div"} class="fi"><span class="ic" style="background:color-mix(in srgb,${col} 18%,#fff)">${ic}</span><span class="ft">${txt}${sub ? `<small>${esc(sub)}</small>` : ""}</span><time>${ago(n.at)}</time></${n.card != null || n.arr ? "button" : "div"}>`; }).join("")}</div>` : `<div class="empty">Rien pour l'instant. Les grosses prises, les ventes et les nouveaux maires apparaîtront ici.</div>`) : ""}
    ${parisTab === "rank" ? (board.length ? `<div class="ranks">${board.map((p, i) => `<div class="rk${p.id === ME ? " me" : ""}"><span class="md">${medal(i)}</span><span class="av" style="background:${PARTIES[p.party]?.c || "#94A3B8"}">${esc((p.pseudo || "?")[0].toUpperCase())}</span><span class="who"><b>${esc(p.pseudo)}${p.id === ME ? " (vous)" : ""}</b><small>${p.mayorships ? `Maire de ${p.mayorships} arrondissement${p.mayorships > 1 ? "s" : ""}` : PARTIES[p.party]?.n || "Sans parti"}</small></span><b class="num">${fmtE(p.worth)}</b></div>`).join("")}</div><p class="sub" style="margin-top:8px;font-size:12.5px">Classement au patrimoine net : trésorerie + biens − dettes.</p>` : `<div class="empty">Aucun joueur.</div>`) : ""}
    ${parisTab === "arr" ? `<div class="atiles">${IDX.arr.map((a, i) => arrTile(i)).join("")}</div>` : ""}
  </div>`;
}
$("#p-paris").addEventListener("click", e => { const t = e.target.closest("[data-pt]"); if (t) { parisTab = t.dataset.pt; renderParis(); } });
function arrTile(i) {
  const a = IDX.arr[i], m = ST.mayors[i], pc = m ? PARTIES[m.party] : null;
  return `<button class="atile" data-push="arr" data-arg="${i}" style="--pc:${pc ? pc.c : "#CBD5E1"}"><b>${ord(a.n)}</b><span>${m ? esc(m.pseudo) : "Siège libre"}</span></button>`;
}
function arrRow(i) { return arrTile(i); }
function hemicycle(seats) {
  // 20 sièges en demi-cercle, de gauche à droite
  const order = []; PARTY_ORDER.forEach(k => { for (let i = 0; i < (seats[k] || 0); i++) order.push(PARTIES[k].c); });
  while (order.length < 20) order.push("#E2E8F0");
  const rows = [4, 7, 9], pts = [];
  rows.forEach((n, r) => { const R = 46 + r * 26; for (let i = 0; i < n; i++) { const t = Math.PI - (i + .5) * Math.PI / n; pts.push([150 + R * Math.cos(t), 120 - R * Math.sin(t), t]); } });
  pts.sort((a, b) => b[2] - a[2]);
  return `<div class="hemi"><svg viewBox="0 0 300 130">${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="9" fill="${order[i]}"/>`).join("")}<text x="150" y="117" text-anchor="middle" font-family="Inter" font-weight="900" font-size="19" fill="#0F1B2D">${Object.values(seats).reduce((a, b) => a + b, 0)}/20</text></svg></div>`;
}
async function resultsPage() {
  const seats = seatCounts(); const w = ST.state?.week;
  const members = {}; for (const p of ST.board || []) members[p.party] = (members[p.party] || 0) + 1;
  return dhead("Hôtel de Ville") + `<div class="wrap">
    <p class="sub">Chaque arrondissement a pour maire le joueur qui y possède la plus grande valeur. Chaque lundi, le parti qui a le plus de maires remporte l'Hôtel de Ville : 1 % de tous les loyers de Paris est partagé entre ses membres pendant la semaine.</p>
    <div class="box">${hemicycle(seats)}</div>
    ${w?.party ? `<div class="box" style="margin-top:12px;border-left:6px solid ${PARTIES[w.party].c}"><p class="eyebrow">Vainqueur de la semaine</p><div style="display:flex;gap:10px;align-items:center;margin-top:4px">${emblemSVG(w.party, 40)}<b style="font-size:18px;color:${PARTIES[w.party].c}">${esc(PARTIES[w.party].n)}</b></div><div class="sub" style="margin:4px 0 0">${w.mayors} maires · chaque membre touche ${fmtE(w.bonus)} par jour</div></div>` : `<div class="box" style="margin-top:12px"><b>Pas de vainqueur cette semaine</b><div class="sub" style="margin:4px 0 0">Aucun parti n'avait seul la majorité des maires lundi.</div></div>`}
    <h2 class="h2">Les partis, de gauche à droite</h2>
    <div class="parties">${PARTY_ORDER.map(k => { const p = PARTIES[k]; return `<div class="prow">${emblemSVG(k, 40)}<div><b>${esc(p.n)}</b><small>${esc(p.side)} · « ${esc(p.motto)} »</small><small>Protège de : ${esc(shieldText(k))}</small></div><span class="seats num" style="color:${p.c}">${seats[k] || 0}</span></div>`; }).join("")}</div>
    <h2 class="h2">Arrondissements</h2><div class="atiles">${IDX.arr.map((a, i) => arrTile(i)).join("")}</div>
  </div>`;
}

// ---------------- FICHE IMMEUBLE ----------------
let sellNext = null, offerNext = null, ofPrice = 0, ofCredit = true;
let selLot = null, saleMode = false, bInfo = null, bCredit = null, ownSheet = null, ownN = 1, ownPrice = 0;
async function buildingPage(g) {
  await ensureCards([g]); const c = card(g); if (!c) return dhead("Immeuble") + `<div class="wrap"><p class="sub">Introuvable.</p></div>`;
  if (sel !== g) { sel = g; selLot = null; saleMode = false; bCredit = null; ownSheet = sellNext === g ? "sale" : null; ownN = 1; ownPrice = 0; ofPrice = 0; ofCredit = true; } sellNext = null;
  try { bInfo = await rpc("building", { p_card: g }); } catch (e) { bInfo = { lots: [], parts: [], listings: [], sales: [] }; }
  const owners = new Map(bInfo.lots.map(([k, o, ps, m]) => [k, { o, ps, m }]));
  if (offerNext === g) { offerNext = null; const lk = new Set(bInfo.listings.map(x => x.k)); const t = [...owners.entries()].find(([k, o]) => o.o !== ME && !o.m && !lk.has(k)); if (t) selLot = t[0]; }
  const isP = c.lk === "p"; const myKs = ST.mine.get(g) || []; const myN = ST.mineParts.get(g) || 0;
  const sold = bInfo.parts.reduce((a, x) => a + x[2], 0);
  const free = isP ? c.lots - sold : c.lots - owners.size;
  const unitW = isP ? "part" : c.lk === "l" ? "logement" : "local";
  const listed = new Map(bInfo.listings.filter(l => l.k != null).map(l => [l.k, l]));
  const loan = ST.loan.get(g) || 0;
  // ce que je possède
  let mine = "";
  if (myKs.length || myN) {
    const h = { g, c, ks: myKs, n: myN };
    const lotsL = c.lk === "l";
    const wd = (n, x) => n > 1 ? `${n} ${x}s` : `1 ${x}`;
    // seulement les logements qui demandent une action (en vente, hypothéqués) : pas une ligne par logement
    const rows = isP ? "" : myKs.filter(k => listed.has(k) || ST.mort.get(g + ":" + k)).map(k => {
      const l = listed.get(k), m = ST.mort.get(g + ":" + k);
      const where = lotsL ? `${lotName(c, k)} · ${ord(floorOfLot(c, k))} étage` : `${lotName(c, k)} · rez-de-chaussée`;
      const actions = l ? `<span class="pill" style="background:var(--sale);color:#fff">En vente ${fmtE(l.price)}</span><button class="btn sm ghost" data-act="unlist" data-id="${l.id}">Retirer</button>`
        : `<span class="pill">🔒 Hypothéqué</span><button class="btn sm green" data-act="lift" data-k="${k}" ${liveCash() < liftCost(m) ? "disabled" : ""}>Rembourser ${fmtE(liftCost(m))}</button>`;
      return `<div class="myrow"><b>${where}</b><div class="acts">${actions}</div></div>`;
    }).join("");
    // ce qu'on peut encore vendre ou hypothéquer
    const freeKs = isP ? [] : myKs.filter(k => !listed.has(k) && !ST.mort.get(g + ":" + k));
    const pMort = isP && ST.mort.has(g + ":-1"), pListed = isP ? bInfo.listings.filter(l => l.seller === ME).reduce((t, l) => t + l.n, 0) : 0;
    const avail = isP ? (pMort ? 0 : myN - pListed) : freeKs.length;
    const unit = isP ? "part" : lotsL ? "logement" : "local";
    const unitV = c.v, unitR = c.rent;
    if (ownSheet && (loan || !avail)) ownSheet = null;
    const nSel = Math.max(1, Math.min(avail, ownN || 1));
    let sheet = "";
    if (ownSheet === "sale") {
      const price = ownPrice || Math.round(unitV * 1.1 / 1000) * 1000;
      const presets = [[unitV, "Sa valeur"], [Math.round(unitV * 1.1 / 1000) * 1000, "+10 %"], [Math.round(unitV * 1.25 / 1000) * 1000, "+25 %"]];
      sheet = `<div class="osheet"><div class="osh"><b>Mettre en vente au Marché</b><button class="x" data-act="osclose" aria-label="Annuler">×</button></div>
        ${avail > 1 ? `<div class="ostep"><span>Combien de ${unit}s ?</span><div class="stepper"><button data-act="osn" data-k="-1" ${nSel <= 1 ? "disabled" : ""}>−</button><b class="num">${nSel}</b><button data-act="osn" data-k="1" ${nSel >= avail ? "disabled" : ""}>+</button></div><small>sur ${avail}</small></div>` : ""}
        <div class="ostep col"><span>Prix par ${unit}</span>
          <div class="oprice"><input class="inp num" id="price" inputmode="numeric" type="number" min="1" step="1000" value="${price}" aria-label="Prix de vente"><span>€</span></div>
          <div class="ochips">${presets.map(([v, l]) => `<button data-act="ospreset" data-k="${v}" aria-pressed="${v === price}">${l}<small>${fmtE(v)}</small></button>`).join("")}</div></div>
        <p class="onote">Sa valeur (${fmtE(unitV)}) est estimée d'après les vraies ventes du quartier. Plus vous vendez cher, plus il faudra attendre un acheteur.</p>
        <div class="osum"><span>Vous recevrez quand un joueur achète</span><b class="num" id="osget">${fmtE(Math.floor(price * .95) * nSel)}</b><small>prix − 5 % de commission${nSel > 1 ? ` · pour ${nSel} ${unit}s` : ""} · annonce retirable à tout moment</small></div>
        <button class="btn block amber" data-act="oslist">Publier l'annonce${nSel > 1 ? ` · ${nSel} ${unit}s` : ""}</button></div>`;
    } else if (ownSheet === "mort") {
      const nM = isP ? avail : nSel, gain = Math.floor(unitV * .5) * nM, lost = Math.round(unitR * nM);
      sheet = `<div class="osheet"><div class="osh"><b>Hypothéquer : de l'argent tout de suite</b><button class="x" data-act="osclose" aria-label="Annuler">×</button></div>
        ${!isP && avail > 1 ? `<div class="ostep"><span>Combien de ${unit}s ?</span><div class="stepper"><button data-act="osn" data-k="-1" ${nSel <= 1 ? "disabled" : ""}>−</button><b class="num">${nSel}</b><button data-act="osn" data-k="1" ${nSel >= avail ? "disabled" : ""}>+</button></div><small>sur ${avail}</small></div>` : ""}
        <div class="omort"><div><span>La banque vous verse</span><b class="green num">+${fmtE(gain)}</b><small>la moitié de la valeur</small></div><div><span>En échange, plus de loyer</span><b class="num" style="color:#B91C1C">−${fmtE(lost)} / jour</b><small>tant que ce n'est pas remboursé</small></div></div>
        <p class="onote">Le bien reste à vous. Pour le récupérer, vous remboursez la somme + 0,5 % par jour, quand vous voulez.</p>
        <button class="btn block" data-act="osmort">Confirmer · recevoir ${fmtE(gain)}</button></div>`;
    }
    const status = isP ? (pMort ? "🔒 hypothéquées" : pListed ? `${wd(pListed, "part")} en vente` : "")
      : [myKs.filter(k => listed.has(k)).length && `${wd(myKs.filter(k => listed.has(k)).length, unit)} en vente`, myKs.filter(k => ST.mort.get(g + ":" + k)).length && `${wd(myKs.filter(k => ST.mort.get(g + ":" + k)).length, unit)} hypothéqué${myKs.filter(k => ST.mort.get(g + ":" + k)).length > 1 ? "s" : ""}`].filter(Boolean).join(" · ");
    const days = loan ? Math.ceil(loan / Math.max(1, c.rent * unitsOf(h) * .7)) : 0;
    mine = `<div class="box mine-box"><div class="mb-h"><span>Vous possédez</span><b>${esc(ownSentence(c, myKs, myN))}</b><small class="num">+${fmtE(baseRent(h))} / jour${fullTitle(h) ? " · immeuble complet +60 %" : myKs.some(k => fullFloor(c, myKs, k)) ? " · étage complet +25 %" : ""}${status ? " · " + status : ""}</small></div>
      ${loan ? `<div class="loanbox"><b>🏦 Crédit en cours : reste ${fmtE(loan)}</b><span>Il se rembourse tout seul avec 70 % du loyer (encore ~${days} jours). Remboursé, vous touchez tout le loyer et pouvez vendre ou hypothéquer.</span><button class="btn sm green" data-act="repay" ${liveCash() < loan ? "disabled" : ""}>Rembourser maintenant · ${fmtE(loan)}</button></div>` : ""}
      ${!loan && avail && !sheet ? `<div class="oacts"><button class="btn amber" data-act="osopen" data-k="sale">Vendre…</button><button class="btn light" data-act="osopen" data-k="mort">Hypothéquer…</button></div>` : ""}
      ${sheet}
      ${rows ? `<div class="myrows">${rows}</div>` : ""}</div>`;
  }
  const offers = bInfo.listings.filter(l => l.seller !== ME);
  const offersHTML = offers.length ? `<h2 class="h3">À vendre par des joueurs</h2><div class="rows">${offers.map(l => `<div class="lrow" style="grid-template-columns:1fr auto"><div class="t"><b>${l.k != null ? lotName(c, l.k) + (c.lk === "l" ? " · " + ord(floorOfLot(c, l.k)) + " étage" : "") : l.n + " part" + (l.n > 1 ? "s" : "")}</b><span>vendu par ${esc(l.pseudo)}</span></div><div class="v"><b class="num">${fmtE(l.price)}</b>${listingBuy(l, (id, cr) => `data-act="buyl" data-id="${id}" data-k="${cr}"`)}</div></div>`).join("")}</div>` : "";
  let plan = "";
  if (!isP) {
    const groups = new Map(); for (let k = 0; k < c.lots; k++) { const f = floorOfLot(c, k); if (!groups.has(f)) groups.set(f, []); groups.get(f).push(k); }
    plan = `<details class="plan" ${selLot !== null ? "open" : ""}><summary>Choisir un ${unitW} précis, étage par étage</summary>
      <div class="floors">${[...groups.entries()].sort((a, b) => b[0] - a[0]).map(([f, ks]) => `<div class="floor"><span>${c.lk === "l" ? ord(f) : "RDC"}</span><div>${ks.map(k => { const o = owners.get(k); const cls = o ? (o.o === ME ? "mine" : "theirs") : ""; return `<button class="lot ${cls}${o?.m ? " mort" : ""}${listed.has(k) ? " sale" : ""}" data-k="${k}" data-pick="1" aria-pressed="${selLot === k}" aria-label="${lotName(c, k)}, ${o ? (o.o === ME ? "à vous" : "à " + esc(o.ps)) : "libre"}">${k + 1}</button>`; }).join("")}</div></div>`).join("")}</div>
      <div class="legend-s"><span><i style="background:var(--soft);border:1.5px solid var(--line)"></i>Libre</span><span><i style="background:var(--mine)"></i>À vous</span><span><i style="background:#E2E8F0"></i>Autre joueur</span><span><i style="background:var(--sale)"></i>En vente</span></div></details>`;
  } else {
    const gd = bInfo.parts[0];
    plan = bInfo.parts.length ? `<h2 class="h3">Propriétaires</h2>${bInfo.parts.slice(0, 5).map(([u, ps, n], i) => `<div class="rank${u === ME ? " me" : ""}"><span class="n">${i + 1}</span><span>${esc(ps)}${i === 0 && gd[2] * 4 >= c.lots ? " · Gardien (+20 %)" : ""}</span><b class="num">${fmtN(n)} parts</b></div>`).join("")}` : "";
  }
  const ext = MONS?.[g]; const about = ext?.ext ? `<details class="plan"><summary>À propos</summary><div class="about">${esc(ext.ext)}</div></details>` : "";
  const status = free > 0 ? `<span class="st ok">${isP ? fmtN(free) + " parts libres" : free + " libre" + (free > 1 ? "s" : "") + " sur " + c.lots}</span>` : `<span class="st">Tout est pris</span>`;
  return `${dhead("")}<div class="wrap bp">
    <div class="bp-card">${cardHTML(c, { item: myKs.length || myN ? { t: "own", ks: myKs, n: myN } : null })}${goodPhoto(c) && c.cr ? `<small class="credit2">${esc(c.cr)}</small>` : ""}</div>
    <div class="bp-info">
      <h1 class="h1">${esc(title(c))}</h1>
      <p class="sub">${esc(kindLabel(c))} · ${ord(c.arr)} arr.${c.y ? ` · vers ${esc(c.y)}` : ""} · <button class="lnk" data-mapto="${g}">voir sur la carte</button></p>
      ${occHTML(c, isP ? myN : myKs.length, isP ? Math.max(0, sold - myN) : Math.max(0, owners.size - myKs.length), free)}
      <div class="actbar2 lbx" id="actbar"><div class="lb">${buyActions(c, g, owners, free, isP)}</div></div>
      ${mine}${offersHTML}${plan}${about}
      ${ST.admin ? adminGiftBox(c, g, free) : ""}
    </div>
  </div>`;
}
// ---------------- ADMIN : liens cadeaux (le premier qui ouvre le lien gagne) ----------------
let adminN = 1, adminLink = null;
const giftURL = code => `${location.origin}/?gift=${code}`;
function giftLinkHTML(url) {
  return `<div class="agl"><input class="inp" readonly value="${esc(url)}" aria-label="Lien cadeau"><button class="btn sm" data-act="acopy" data-k="${esc(url)}">Copier</button>${navigator.share ? `<button class="btn sm light" data-act="ashare" data-k="${esc(url)}">Partager</button>` : ""}</div>`;
}
function adminGiftBox(c, g, free) {
  const n = Math.max(1, Math.min(adminN, Math.max(1, free)));
  return `<div class="box adminbox"><b>🛠 Admin · offrir cette carte</b>
    <p class="sub" style="margin:2px 0 10px">Crée un lien à partager (X, Instagram…) : le premier joueur qui l'ouvre reçoit ${c.lk === "p" ? "les parts" : "les logements"}.</p>
    ${free > 0 ? `<div class="ostep"><span>Combien ?</span><div class="stepper"><button data-act="an" data-k="-1" ${n <= 1 ? "disabled" : ""}>−</button><b class="num">${n}</b><button data-act="an" data-k="1" ${n >= free ? "disabled" : ""}>+</button></div><small>sur ${free} libre${free > 1 ? "s" : ""}</small></div>
      <button class="btn block" data-act="agift" data-k="${n}" style="margin-top:10px">🎁 Créer le lien cadeau</button>` : `<p class="sub">Plus rien de libre dans cet immeuble.</p>`}
    ${adminLink && adminLink.g === g ? giftLinkHTML(adminLink.url) : ""}</div>`;
}
// ---- tableau de bord de l'administrateur ----
async function adminPage() {
  let d, R = null; try { [d, R] = await Promise.all([rpc("admin_stats"), rpc("admin_retention").catch(() => null)]); } catch (e) { return dhead("Tableau de bord") + `<div class="wrap"><p class="sub">${esc(e.message)}</p></div>`; }
  const N = n => fmtN(+n || 0), K = (t, v, sub) => `<div class="kpi"><span>${t}</span><b class="num">${v}</b>${sub ? `<small class="muted">${sub}</small>` : ""}</div>`;
  const days = d.by_day || [], mx = Math.max(1, ...days.map(x => Math.max(x.signups, x.active)));
  const bars = `<div class="adbars">${days.map(x => `<div title="${x.day} · ${x.signups} inscrits · ${x.active} actifs"><i class="a" style="height:${x.active / mx * 100}%"></i><i class="s" style="height:${x.signups / mx * 100}%"></i><small>${x.day.slice(8, 10)}</small></div>`).join("")}</div>
    <div class="adleg"><span><i class="a"></i>joueurs actifs</span><span><i class="s"></i>inscrits</span></div>`;
  const ago2 = t => t ? ago(t) : "—";
  return dhead("Tableau de bord") + `<div class="wrap">
    <h2 class="h3">Joueurs</h2>
    <div class="kpis k4">${K("Inscrits", N(d.players), `+${N(d.new_today)} aujourd'hui`)}${K("Nouveaux 7 j", N(d.new_7d), `${N(d.new_30d)} sur 30 j`)}${K("Actifs aujourd'hui", N(d.active_today))}${K("Actifs 7 j", N(d.active_7d), d.players ? `${Math.round(d.active_7d / d.players * 100)} % des inscrits` : "")}</div>
    <div class="box" style="margin-top:10px"><b>14 derniers jours</b>${bars}</div>
    ${R ? retentionHTML(R) : ""}
    <h2 class="h3">Activité</h2>
    <div class="kpis k4">${K("Lancers de dé", N(d.rolls_today), `${N(d.rolls_7d)} sur 7 j`)}${K("Boosters ouverts", N(d.boosters_today), `${N(d.boosters_7d)} sur 7 j`)}${K("Achats", N(d.buys_today), `${N(d.buys_7d)} sur 7 j`)}${K("Ventes au Marché", N(d.sales_7d), "sur 7 j")}</div>
    <h2 class="h3">Économie</h2>
    <div class="kpis k4">${K("Argent en circulation", fmtE(d.cash_total))}${K("Crédits en cours", fmtE(d.loans_total))}${K("Logements possédés", N(d.lots_owned))}${K("Partis", `<span style="font-size:14px;line-height:1.35;display:block">${Object.entries(d.parties || {}).map(([k, n]) => `${esc(PARTIES[k]?.n || "Sans parti")} ${n}`).join(" · ") || "—"}</span>`)}</div>
    <h2 class="h3">Classement</h2>
    <div class="box adlist">${(d.top || []).map((x, i) => `<div><span>${i + 1}. ${esc(x.pseudo)}</span><b class="num">${fmtE(x.worth)}</b></div>`).join("") || "—"}</div>
    <h2 class="h3">Derniers inscrits</h2>
    <div class="box adlist">${(d.latest || []).map(x => `<div><span>${esc(x.pseudo)} <small class="muted">${x.lots} logt · vu ${ago2(x.seen_at)}</small></span><small class="muted">inscrit ${ago2(x.created_at)}</small></div>`).join("") || "—"}</div>
    <p class="sub" style="font-size:12px;margin-top:12px">« Actif » = a lancé le dé, acheté ou ouvert un booster (compté depuis le 17/10/2026 pour les boosters).</p>
  </div>`;
}
// taux de retour : parmi les inscrits d'un jour, combien reviennent le lendemain, 7 jours après, 30 jours après
function retentionHTML(R) {
  const pc = (b, n) => n ? Math.round(b / n * 100) : null;
  const tile = (t, o, goal) => { const p = pc(o.back, o.n), cls = p == null ? "" : goal == null ? "" : p >= goal ? "ok" : p >= goal / 2 ? "mid" : "hi";
    return `<div class="kpi rt ${cls}"><span>${t}</span><b class="num">${p == null ? "—" : p + " %"}</b><small class="muted">${o.n ? `${o.back} sur ${o.n} joueur${o.n > 1 ? "s" : ""}${goal != null ? ` · objectif ${goal} %` : ""}${o.n < 20 ? " · encore peu de joueurs" : ""}` : "pas encore assez de recul"}</small></div>`; };
  const cell = (b, n) => b == null ? `<span class="muted">…</span>` : `${pc(b, n)} %<small>${b}/${n}</small>`;
  const day = s => new Date(s + "T12:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });
  return `<h2 class="h3">Taux de retour</h2>
    <div class="kpis k4">${tile("Revenus le lendemain", R.d1, 40)}${tile("Revenus 7 jours après", R.d7, 20)}${tile("Revenus 30 jours après", R.d30, 10)}${tile("Revenus au moins une fois", R.ever, null)}</div>
    ${R.cohorts?.length ? `<div class="box adtab"><div class="th"><span>Inscrits le</span><span>Inscrits</span><span>Lendemain</span><span>7 j après</span><span>30 j après</span></div>
      ${R.cohorts.slice(0, 14).map(c => `<div><span>${day(c.day)}</span><span class="num">${c.n}</span><span class="num">${cell(c.d1, c.n)}</span><span class="num">${cell(c.d7, c.n)}</span><span class="num">${cell(c.d30, c.n)}</span></div>`).join("")}</div>` : ""}
    <p class="sub" style="font-size:12px;margin:8px 0 0">« Revenu le lendemain » = a ouvert le jeu le jour suivant son inscription. Repère pour un bon jeu : 40 % le lendemain, 20 % à 7 jours, 10 % à 30 jours. Les comptes admin ne comptent pas ; avant le 17/10/2026, les visites sont reconstituées à partir des lancers et des achats (un peu sous-estimées).</p>`;
}
async function giftsPage() {
  let L = []; try { L = await rpc("admin_gifts"); } catch (e) { return dhead("Liens cadeaux") + `<div class="wrap"><p class="sub">${esc(e.message)}</p></div>`; }
  await ensureCards(L.filter(x => x.card).map(x => x.card));
  return dhead("Liens cadeaux") + `<div class="wrap">
    <div class="box adminbox"><b>🎁 Offrir des boosters</b><p class="sub" style="margin:2px 0 10px">Le premier qui ouvre le lien les reçoit.</p>
      <div class="ochips">${[1, 3, 5].map(n => `<button data-act="agb" data-k="${n}">${n} booster${n > 1 ? "s" : ""}</button>`).join("")}</div>
      ${adminLink && adminLink.g == null ? giftLinkHTML(adminLink.url) : ""}</div>
    <p class="sub">Pour offrir une carte : ouvrez la fiche de l'immeuble, en bas « Admin · offrir cette carte ».</p>
    <div class="rows">${L.map(x => { const c = x.card ? card(x.card) : null;
      const what = [c ? `${x.n} × ${title(c)}` : "", x.boosters ? `${x.boosters} booster${x.boosters > 1 ? "s" : ""}` : ""].filter(Boolean).join(" + ");
      return `<div class="lrow" style="grid-template-columns:1fr auto"><div class="t"><b>${esc(what)}</b><span>${x.winner ? `✓ récupéré par ${esc(x.winner)}` : "en attente"} · ${ago(x.created_at)}</span></div>
        <div class="v">${x.winner ? "" : `<button class="btn sm" data-act="acopy" data-k="${esc(giftURL(x.code))}">Copier</button><button class="btn sm ghost" data-act="acancel" data-k="${esc(x.code)}">Annuler</button>`}</div></div>`; }).join("") || `<div class="empty">Aucun lien pour l'instant.</div>`}</div></div>`;
}
async function adminAct(a, btn, g) {   // actions admin, sur la fiche ou la page des cadeaux
  const k = btn.dataset.k;
  if (a === "an") { adminN = Math.max(1, adminN + +k); return renderDetail(false); }
  if (a === "acopy") { try { await navigator.clipboard.writeText(k); toast("Lien copié", "good"); } catch (e) { prompt("Copiez le lien :", k); } return; }
  if (a === "ashare") { try { await navigator.share({ title: "Un cadeau sur Proprio", text: "🎁 Le premier qui ouvre ce lien gagne cette carte !", url: k }); } catch (e) { } return; }
  btn.disabled = true;
  try {
    if (a === "agift") { const r = await rpc("admin_gift_create", { p_card: g, p_n: +k, p_boosters: 0 }); adminLink = { g, url: giftURL(r.code) }; }
    if (a === "agb") { const r = await rpc("admin_gift_create", { p_card: null, p_n: 1, p_boosters: +k }); adminLink = { g: null, url: giftURL(r.code) }; }
    if (a === "acancel") { await rpc("admin_gift_cancel", { p_code: k }); toast("Lien annulé", "good"); }
  } catch (e) { toast(e.message, "bad"); }
  renderDetail(false);
}
function farHTML(d, g) { return `<div class="buyfar"><b>🎲 Pour l'acheter à la banque, tombez dessus avec le dé.</b><span class="muted">Ou trouvez-le dans un booster, ou au Marché si un joueur le vend.</span></div>`; }
function payToggle(price, rent) {
  const cap = ST.state?.loan_cap ?? 1e12, cash = liveCash(), down = Math.ceil(price * downRate()), can = price - down <= cap && cash >= down;
  const cr = can && (bCredit === null ? true : bCredit);
  return [cr, `<div class="pay" role="tablist"><button data-act="paymode" data-k="1" aria-selected="${cr}" ${can ? "" : "disabled"}><b>À crédit</b><small>${fmtE(down)} · <em>+${fmtE(Math.round(rent * .3))}/j</em></small></button><button data-act="paymode" data-k="0" aria-selected="${!cr}"><b>Comptant</b><small>${fmtE(price)} · <em>+${fmtE(rent)}/j</em></small></button></div>`];
}
const buySub = cr => `<small>${cr ? "La banque prête le reste, remboursé tout seul par le loyer" : "Tout le loyer est pour vous, et le bien peut être revendu"}</small>`;
function buyActions(c, g, owners, free, isP) {
  const cash = liveCash(), far = notLanded(g);
  if (selLot !== null && !isP) {
    const k = selLot, o = owners.get(k), l = bInfo.listings.find(x => x.k === k);
    const head = `<div class="what"><b>${lotName(c, k)}${c.lk === "l" ? " · " + ord(floorOfLot(c, k)) + " étage" : ""}</b><span class="num">${o ? (o.o === ME ? "À vous" : "À " + esc(o.ps)) : "Libre"}</span></div>`;
    let btn;
    if (!o && far) btn = farHTML(far, g);
    else if (!o) { const [cr, tg] = payToggle(c.v, c.rent); btn = tg + `<button class="btn block buy" data-act="bank" data-k="${k}" ${cash < (cr ? Math.ceil(c.v * downRate()) : c.v) ? "disabled" : ""}><span>Acheter · ${fmtE(cr ? Math.ceil(c.v * downRate()) : c.v)}</span>${buySub(cr)}</button>`; }
    else if (o.o === ME) btn = `<div class="sub" style="margin:0">Il est à vous.</div>`;
    else btn = l ? `<div class="sub" style="margin:0 0 6px">En vente par ${esc(l.pseudo)} : ${fmtE(l.price)}</div>${listingBuy(l, (id, cr) => `data-act="buyl" data-id="${id}" data-k="${cr}"`)}` : `<div class="sub" style="margin:0">Appartient à ${esc(o.ps)}, pas en vente.</div>${offerForm(c, k, o)}`;
    return head + btn + `<button class="btn sm ghost" data-act="unpick">Annuler</button>`;
  }
  const canOffer = !isP && [...owners.values()].some(o => o.o !== ME);
  const offerLink = canOffer ? `<button class="btn block light" data-act="ofpick">🤝 Faire une offre à un propriétaire</button>` : "";
  if (free <= 0) return `<div class="what"><span>Tout est pris. ${canOffer ? "Proposez à un propriétaire de lui racheter son logement :" : "Surveillez le Marché : les propriétaires peuvent mettre leurs biens en vente."}</span></div>${offerLink}`;
  if (far) return farHTML(far, g);
  const total = c.v * c.lots, allFree = !isP && owners.size === 0 && c.lots > 1, [cr, tg] = payToggle(c.v, c.rent), need = p => cr ? Math.ceil(p * downRate()) : p;
  return tg + `<button class="btn block buy" data-act="bank" ${cash < need(c.v) ? "disabled" : ""}><span>${isP ? "Acheter 1 part" : `Acheter 1 ${c.lk === "l" ? "logement" : "local"}`} · ${fmtE(need(c.v))}</span>${buySub(cr)}</button>
    ${allFree && cash >= need(total) && (!cr || total - need(total) <= (ST.state?.loan_cap ?? 1e12)) ? `<button class="btn block light" data-act="bbuild">Tout l'immeuble · ${fmtE(need(total))} <small class="muted">(+60 % de loyer)</small></button>` : ""}
    ${!cr && cash < c.v ? `<small class="muted">Il vous manque ${fmtE(c.v - cash)}.</small>` : ""}${offerLink}`;
}
function offerForm(c, k, o) {
  const min = Math.ceil(c.v * .8), price = ofPrice || Math.round(c.v * 1.1 / 1000) * 1000, hold = ofCredit ? Math.ceil(price * downRate()) : price;
  const presets = [[Math.round(c.v / 1000) * 1000, "Sa valeur"], [Math.round(c.v * 1.1 / 1000) * 1000, "+10 %"], [Math.round(c.v * 1.25 / 1000) * 1000, "+25 %"]];
  return `<div class="ofr"><b>🤝 Proposer à ${esc(o.ps)} de lui racheter</b>
    <div class="oprice"><input class="inp num" id="ofp" type="number" inputmode="numeric" min="${min}" step="1000" value="${price}" aria-label="Votre offre"><span>€</span></div>
    <div class="ochips">${presets.map(([v, l]) => `<button data-act="ofpreset" data-k="${v}" aria-pressed="${v === price}">${l}<small>${fmtE(v)}</small></button>`).join("")}</div>
    <div class="pay"><button data-act="ofmode" data-k="1" aria-selected="${ofCredit}"><b>À crédit</b><small>apport ${Math.round(downRate() * 100)} %</small></button><button data-act="ofmode" data-k="0" aria-selected="${!ofCredit}"><b>Comptant</b><small>tout de suite</small></button></div>
    <p class="onote">Au moins ${fmtE(min)} (80 % de sa valeur). <b id="ofhold">${fmtE(hold)}</b> sont mis de côté pendant 24 h au plus, et rendus si ${esc(o.ps)} refuse. Il peut aussi vous faire une contre-proposition.</p>
    <button class="btn block buy" data-act="offer" data-k="${k}"><span>Envoyer l'offre</span></button></div>`;
}
$("#p-detail").addEventListener("click", async e => {
  const top = stack[stack.length - 1]; if (!top) return;
  const mt = e.target.closest("[data-mapto]"); if (mt) { const g = +mt.dataset.mapto; showOnMap(g); return; }
  { const ab = e.target.closest("[data-act]"); if (ab && /^a(n|copy|share|gift|gb|cancel)$/.test(ab.dataset.act)) return adminAct(ab.dataset.act, ab, top.kind === "b" ? top.arg : null); }
  if (top.kind === "party" || top.kind === "profile") return partyClick(e);
  if (top.kind === "shop") { const o = e.target.closest("[data-offer]"); if (o) toast("Le paiement arrive bientôt : la boutique sera ouverte au lancement.", ""); return; }
  if (top.kind !== "b") return;
  const g = top.arg; const c = card(g);
  const pick = e.target.closest("[data-pick]"); if (pick) { selLot = +pick.dataset.k; saleMode = false; return renderDetail(false); }
  const btn = e.target.closest("[data-act]"); if (!btn) return; const a = btn.dataset.act;
  const k = btn.dataset.k != null ? +btn.dataset.k : null; const id = +btn.dataset.id;
  if (a === "osopen") { ownSheet = btn.dataset.k; ownN = 1; ownPrice = 0; return renderDetail(false); }
  if (a === "osclose") { ownSheet = null; return renderDetail(false); }
  if (a === "osn") { ownPrice = +($("#price")?.value || 0) || ownPrice; ownN = Math.max(1, (ownN || 1) + k); return renderDetail(false); }
  if (a === "ospreset") { ownPrice = k; return renderDetail(false); }
  if (a === "oslist" || a === "osmort") {
    const myKs = (ST.mine.get(g) || []).slice(), isP = c.lk === "p", price = +($("#price")?.value || 0);
    if (a === "oslist" && !(price > 0)) return toast("Indiquez un prix", "bad");
    btn.disabled = true;
    const listedK = new Set((bInfo?.listings || []).filter(l => l.seller === ME && l.k != null).map(l => l.k));
    const ks = myKs.filter(k => !listedK.has(k) && !ST.mort.get(g + ":" + k)).sort((x, y) => y - x).slice(0, Math.max(1, ownN));
    let done = 0;
    try {
      if (a === "oslist") { if (isP) { setState(await rpc("list_item", { p_card: g, p_k: null, p_n: Math.max(1, ownN), p_price: price * Math.max(1, ownN) })); done = ownN; } else for (const kk of ks) { setState(await rpc("list_item", { p_card: g, p_k: kk, p_n: 1, p_price: price })); done++; } }
      else { if (isP) { setState(await rpc("mortgage", { p_card: g, p_k: null })); done = 1; } else for (const kk of ks) { setState(await rpc("mortgage", { p_card: g, p_k: kk })); done++; } }
    } catch (err) { toast(err.message, "bad"); }
    await Promise.all([refreshHold(), refreshMap()]).catch(() => { }); renderWallet(); paintAll();
    if (done) toast(a === "oslist" ? "Annonce publiée au Marché" : "Hypothèque accordée : l'argent est sur votre compte", "good");
    ownSheet = null; return renderDetail(false);
  }
  if (a === "sale") { saleMode = k; return renderDetail(false); }
  if (a === "cancelsale") { saleMode = false; return renderDetail(false); }
  if (a === "unpick") { selLot = null; return renderDetail(false); }
  if (a === "paymode") { bCredit = k === 1; return renderDetail(false); }
  if (a === "ofpick") { const lk = new Set(bInfo.listings.map(x => x.k)); const t = bInfo.lots.find(([kk, o, ps, m]) => o !== ME && !m && !lk.has(kk)); if (!t) return toast("Aucun logement à racheter ici pour l'instant", "bad"); selLot = t[0]; renderDetail(false); return setTimeout(() => $(".ofr")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60); }
  if (a === "ofpreset") { ofPrice = k; return renderDetail(false); }
  if (a === "ofmode") { ofPrice = +($("#ofp")?.value || 0) || ofPrice; ofCredit = k === 1; return renderDetail(false); }
  if (a === "offer") { const p = +($("#ofp")?.value || 0); btn.disabled = true;
    try { const r = await rpc("make_offer", Object.assign({ p_card: g, p_k: k, p_price: p }, ofCredit ? { p_credit: true } : {})); setOffers(r); toast("Offre envoyée ! Réponse sous 24 h au plus", "good"); selLot = null; ofPrice = 0; renderWallet(); }
    catch (er) { toast(er.message, "bad"); }
    return renderDetail(false); }
  btn.disabled = true;
  const before = (ST.mine.get(g) || []).length + (ST.mineParts.get(g) || 0);
  const credit = btn.closest("#actbar")?.querySelector('.pay [aria-selected="true"]')?.dataset.k === "1";
  if (a === "bank") { if (await act("bank_buy", Object.assign({ p_card: g, p_k: c.lk === "p" ? null : k }, credit ? { p_credit: true } : {}), null)) { celebrate(c); selLot = null; } }
  if (a === "bbuild") { if (await act("buy_building", Object.assign({ p_card: g }, credit ? { p_credit: true } : {}), null)) toast(`Tout l'immeuble est à vous ! Loyers +60 %`, "good"); }
  if (a === "repay") await act("repay", { p_card: g }, "Crédit remboursé : tout le loyer est à vous !");
  if (a === "list") { const p = +$("#price").value; await act("list_item", { p_card: g, p_k: k, p_n: 1, p_price: p }, "Annonce publiée au Marché"); saleMode = false; }
  if (a === "unlist") await act("unlist", { p_id: id }, "Annonce retirée");
  if (a === "buyl") await act("buy_listing", Object.assign({ p_id: id }, k === 1 ? { p_credit: true } : {}), k === 1 ? "Achat conclu à crédit : la banque a prêté 90 %" : "Achat conclu !");
  if (a === "mort") await act("mortgage", { p_card: g, p_k: k }, "Hypothèque accordée : +" + fmtE(Math.round(c.v / 2)));
  if (a === "lift") await act("lift", { p_card: g, p_k: k }, "Hypothèque remboursée");
  renderDetail(false);
});

// ---------------- ARRONDISSEMENT ----------------
async function arrPage(i) {
  const a = IDX.arr[i];
  let info = null; try { info = await rpc("arr_info", { p_arr: a.n }); } catch (e) { }
  const s = info?.state, pc = s?.party ? PARTIES[s.party] : null, ev = ST.state?.event, top = info?.top || [], mine = +info?.mine || 0;
  const iAmMayor = s?.mayor === ME, lead = top[0], gap = lead ? Math.max(0, lead.v - mine + 1) : 0, maxV = lead?.v || 1;
  let goal;
  if (iAmMayor) goal = `<div class="goal ok"><b>👑 Vous êtes le maire !</b><span>Vous touchez ${MAYOR_TAX} % des loyers des autres propriétaires d'ici. Gardez la première place.</span></div>`;
  else if (!lead) goal = `<div class="goal"><b>Siège libre</b><span>Achetez un bien ici : vous deviendrez maire.</span></div>`;
  else goal = `<div class="goal"><b>Pour devenir maire</b><span>Possédez plus que ${esc(lead.pseudo)} ici : il vous manque <b class="num">${fmtE(gap)}</b> de biens.</span></div>`;
  return dhead("") + `<div class="wrap">
    <div class="ahead" style="--pc:${pc ? pc.c : "#94A3B8"}"><span class="an">${ord(a.n)}</span><div><small>arrondissement</small><b>${s?.pseudo ? "Maire : " + esc(s.pseudo) : "Pas encore de maire"}</b>${pc ? `<span class="ap">${emblemSVG(s.party, 18)}${esc(pc.n)} · ${esc(pc.side.toLowerCase())}</span>` : ""}</div></div>
    ${goal}
    ${ev?.arr === a.n ? (() => { const t = evText(ev); return `<div class="box evbox" style="margin-top:10px"><span class="ei">${t.ic}</span><span><small>Aujourd'hui</small><b>${esc(t.t)}</b><span>${t.d}</span></span></div>`; })() : ""}
    <h2 class="h3">Plus gros propriétaires</h2>
    ${top.length ? `<div class="ranks">${top.map((t, k) => `<div class="rk${t.owner === ME ? " me" : ""}"><span class="md">${k === 0 ? "👑" : `<span class="n">${k + 1}</span>`}</span><span class="av" style="background:${PARTIES[t.party]?.c || "#94A3B8"}">${esc((t.pseudo || "?")[0].toUpperCase())}</span><span class="who"><b>${esc(t.pseudo)}${t.owner === ME ? " (vous)" : ""}</b><i class="bar"><i style="width:${Math.max(4, 100 * t.v / maxV)}%;background:${PARTIES[t.party]?.c || "#94A3B8"}"></i></i></span><b class="num">${fmtE(t.v)}</b></div>`).join("")}</div>` : `<div class="empty">Personne ne possède encore de bien ici.</div>`}
    ${mine && !top.some(t => t.owner === ME) ? `<p class="sub" style="margin-top:8px">Vos biens ici : <b class="num">${fmtE(mine)}</b></p>` : ""}
    ${pc ? `<p class="sub" style="margin-top:12px;font-size:12.5px">Les membres de ${esc(pc.n)} touchent +${MEMBER_BONUS} % de loyers dans cet arrondissement.</p>` : ""}
    <div style="margin-top:14px"><button class="btn block light" data-arrmap="${i}">Voir sur la carte</button></div>
  </div>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-arrmap]"); if (!b) return; const a = IDX.arr[+b.dataset.arrmap]; go("map"); setTimeout(() => map?.flyTo({ center: a.center, zoom: 14.4, pitch: 50, duration: 1200 }), 60); });

// ---------------- BOUTIQUE, PROFIL ----------------
// ---------------- MON ARGENT : historique ----------------
const LK = { offer: ["🤝", "Offre de rachat"], rent: ["🏠", "Loyers"], rent_away: ["🌙", "Loyers pendant votre absence"], tax: ["🏛️", "Taxe des maires"], tax_in: ["👑", "Taxe de maire reçue"], salary: ["💼", "Salaire du tour"], toll_paid: ["💸", "Loyer de passage payé"], toll_in: ["💰", "Loyer de passage reçu"], buy: ["🔑", "Achat"], sale: ["🤝", "Vente"], chance: ["🃏", "Carte Chance"], booster: ["📦", "Booster"], rolls: ["🎲", "Lancers"], mortgage: ["🏦", "Hypothèque"], lift: ["🏦", "Hypothèque remboursée"], repay: ["🏦", "Crédit remboursé"], bonus: ["🏠", "Bonus"], credit: ["🏦", "Remboursement des crédits"] };
async function moneyPage() {
  let rows = []; try { rows = await rpc("my_ledger"); } catch (e) { }
  await ensureCards(rows.filter(r => r.card != null).map(r => r.card));
  const s = ST.state; const days = new Map();
  for (const r of rows) { const d = new Date(r.at); const key = d.toDateString(); if (!days.has(key)) days.set(key, { d, items: [], tot: 0 }); const g = days.get(key); g.items.push(r); g.tot += +r.amount; }
  const dayLabel = d => { const t = new Date(), y = new Date(Date.now() - 864e5); return d.toDateString() === t.toDateString() ? "Aujourd'hui" : d.toDateString() === y.toDateString() ? "Hier" : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); };
  const line = r => { const [ic, dft] = LK[r.kind] || ["•", r.kind]; const c = r.card != null ? card(r.card) : null; const a = +r.amount;
    return `<${c ? `button data-push="b" data-arg="${r.card}"` : "div"} class="ml"><span class="ic">${ic}</span><span class="t"><b>${esc((r.label || dft).split(" · ")[0])}</b>${(r.label || "").includes(" · ") ? `<small>pendant ${esc(r.label.split(" · ")[1])}</small>` : c ? `<small>${esc(title(c))}</small>` : ""}</span><b class="num ${a >= 0 ? "green" : "red"}">${a >= 0 ? "+" : "−"}${fmtE(Math.abs(a))}</b></${c ? "button" : "div"}>`; };
  return dhead("Mon argent") + `<div class="wrap">
    <div class="box" style="text-align:center"><p class="eyebrow">Trésorerie</p><b class="num" style="font-size:30px" id="cash2">${fmtE(liveCash())}</b><div class="sub" style="margin:4px 0 0">+${fmtE(netRate())} de loyers par jour${s?.loan_rate > 0 ? ` · ${fmtE(s.loan_rate)} / jour remboursent vos crédits` : ""}</div>
      </div>
    <h2 class="h2">Historique</h2>
    ${rows.length ? [...days.values()].map(g => `<div class="mday"><div class="mdh"><span>${dayLabel(g.d)}</span><b class="num ${g.tot >= 0 ? "green" : "red"}">${g.tot >= 0 ? "+" : "−"}${fmtE(Math.abs(g.tot))}</b></div>${g.items.map(line).join("")}</div>`).join("") : `<div class="empty">Vos premiers mouvements apparaîtront ici : loyers, achats, salaires…</div>`}
  </div>`;
}
async function shopPage() {
  const offers = [[0.99, 1e6], [4.99, 6e6, "Populaire"], [9.99, 13e6], [19.99, 28e6], [49.99, 75e6, "Meilleur prix"]];
  return dhead("Boutique") + `<div class="wrap">
    <div class="box" style="text-align:center"><p class="eyebrow">Trésorerie</p><b class="num" style="font-size:28px">${fmtE(liveCash())}</b><div class="sub" style="margin:4px 0 0">+${fmtE(ST.state?.rate || 0)} de loyers par jour</div></div>
    <h2 class="h2">Ajouter de l'argent</h2>
    <div class="shop">${offers.map(([p, a, tag]) => `<button class="offer" data-offer="${p}"><span class="num">${fmtE(a)}${tag ? `<span class="best">${tag}</span>` : ""}</span><span class="p num">${String(p).replace(".", ",")} €</span></button>`).join("")}</div>
    <p class="sub" style="margin-top:12px">L'argent du jeu sert uniquement dans Proprio et ne peut jamais être reconverti en euros.</p></div>`;
}
async function profilePage() {
  const p = ST.state.profile; const pr = PARTIES[p.party];
  const wait = p.party_at ? Math.max(0, 48 * 3600 - (Date.now() - new Date(p.party_at).getTime()) / 1000) : 0;
  return dhead("Mon profil") + `<div class="wrap">
    <div class="box" style="display:flex;gap:14px;align-items:center"><span class="avatar" style="width:56px;height:56px;display:grid;place-items:center;font-size:22px;background:${pr?.c || "#94A3B8"}">${esc(p.pseudo[0].toUpperCase())}</span><div><b style="font-size:19px">${esc(p.pseudo)}</b><div class="sub" style="margin:2px 0 0">Membre depuis le ${new Date(p.created_at).toLocaleDateString("fr-FR")}</div></div></div>
    <div class="kpis k4" style="margin-top:12px">
      <div class="kpi"><span>Biens</span><b>${holdings().length}</b></div>
      <div class="kpi"><span>Maire de</span><b>${ST.mayors.filter(m => m?.mayor === ME).length}<small> arr.</small></b></div>
      <div class="kpi"><span>Patrimoine net</span><b class="num">${fmtE(worthNow())}</b></div>
      <div class="kpi"><span>Classement</span><b>${ST.board ? (ST.board.findIndex(x => x.id === ME) + 1 || "—") : "—"}<small>${ST.board ? ` / ${ST.board.length}` : ""}</small></b></div>
    </div>
    <h2 class="h2">Mon parti</h2>
    ${!pr ? `<div class="box"><b>Vous n'avez pas encore de parti</b><p class="sub" style="margin:4px 0 0">Rejoignez un camp pour toucher +${MEMBER_BONUS} % de loyers dans les arrondissements qu'il tient, et jouer pour l'Hôtel de Ville.</p></div>` : ""}
    ${pr ? `<div class="box" style="border-left:6px solid ${pr.c};display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center">${emblemSVG(p.party, 56)}<div><b style="color:${pr.c};font-size:17px">${esc(pr.n)}</b> <span class="muted">· ${esc(pr.side)}</span><div class="motto">« ${esc(pr.motto)} »</div><div class="sub" style="margin:4px 0 0;font-size:13px"><b>Pouvoir :</b> ${esc(pr.power)}</div><p class="sub" style="margin:6px 0 0">Vous protège de : ${esc(shieldText(p.party))}. Dans les arrondissements tenus par ${esc(pr.n)}, vos loyers sont à +${MEMBER_BONUS} %.</p></div></div>` : ""}
    <div style="margin-top:10px"><button class="btn block ${pr ? "light" : ""}" data-push="party" ${pr && wait > 0 ? "disabled" : ""}>${!pr ? "Choisir mon parti" : wait > 0 ? `Changer de parti possible dans ${hm(wait)}` : "Changer de parti"}</button></div>
    ${ST.admin ? `<h2 class="h2">Admin</h2><button class="btn block" data-push="admin">📊 Tableau de bord</button><button class="btn block light" data-push="gifts" style="margin-top:8px">🎁 Liens cadeaux (giveaway)</button>` : ""}
    <h2 class="h2">Réglages</h2>
    <button class="btn block light" id="lifeb">${(() => { try { return localStorage.getItem("hm_life") === "0" ? "🚶 Passants et voitures masqués · afficher" : "🚶 Passants et voitures · masquer"; } catch (e) { return "🚶 Passants"; } })()}</button>
    <button class="btn block light" id="mute">${(() => { try { return localStorage.getItem("hm_sound") === "1" ? "🔊 Sons activés · couper" : "🔇 Sons coupés · activer"; } catch (e) { return "🔇 Sons"; } })()}</button>
    <button class="btn block light" id="nooffers" style="margin-top:8px">${p.no_offers ? "🚫 Offres de rachat refusées · les accepter" : "🤝 J'accepte de recevoir des offres de rachat · désactiver"}</button>
    <h2 class="h2">Compte</h2>
    <button class="btn block ghost" id="logout">Se déconnecter</button>
    <p class="sub" style="margin-top:16px;text-align:center"><a href="/terms" target="_blank">Conditions d'utilisation</a> · <a href="/privacy" target="_blank">Confidentialité</a></p>
  </div>`;
}
async function partyPage() {
  return dhead("Choisir un parti") + `<div class="wrap">${partyPickerHTML(ST.state.profile.party)}</div>`;
}
let pickParty = null;
// l'éventail politique : 5 blasons sur un axe gauche → droite, le détail s'affiche dessous
function partyPickerHTML(current) {
  pickParty = current || PARTY_ORDER[2];
  return `<p class="sub">Chaque arrondissement a pour maire son plus gros propriétaire. Rejoignez un camp : quand un membre devient maire, tous les membres y touchent +${MEMBER_BONUS} % de loyers, et chaque semaine le parti qui a le plus de maires remporte l'Hôtel de Ville.</p>
    <div class="spectrum"><div class="sp-line"></div>${PARTY_ORDER.map(k => `<button class="sp-node" data-party="${k}" aria-pressed="${pickParty === k}" style="--pc:${PARTIES[k].c}" aria-label="${esc(PARTIES[k].n)}">${emblemSVG(k, 46)}<span>${esc(PARTIES[k].n)}</span><small>${esc(PARTIES[k].side)}</small></button>`).join("")}</div>
    
    <div id="pdetail">${partyDetailHTML(pickParty)}</div>`;
}
function partyDetailHTML(k) {
  const p = PARTIES[k]; const cur = ST.state?.profile?.party;
  return `<div class="pdet" style="--pc:${p.c}">
    <div class="pdet-h">${emblemSVG(k, 72)}<div><span class="ps">${esc(p.side)}</span><b>${esc(p.n)}</b><em class="motto">« ${esc(p.motto)} »</em></div></div>
    <p>${esc(p.pitch)}</p>
    <div class="ppower"><span>Pouvoir du parti</span><b>${esc(p.power)}</b><p>${esc(p.powerTxt)}</p></div>
    <ul><li><b>Protège ses membres</b> contre : ${esc(shieldText(k))}.</li><li><b>Dans ses arrondissements</b>, ses membres touchent +${MEMBER_BONUS} % de loyers.</li></ul>
    <button class="btn block" id="party-save" style="background:${p.c}" ${cur === k ? "disabled" : ""}>${cur === k ? "C'est déjà votre parti" : `Rejoindre ${esc(p.n)}`}</button>
    <p class="sub" style="margin:8px 0 0;font-size:12.5px;text-align:center">${cur ? "Vous pourrez changer de nouveau dans 48 h." : "Vous pourrez en changer plus tard (une fois toutes les 48 h)."}</p></div>`;
}
async function partyClick(e) {
  const pc = e.target.closest("[data-party]"); if (pc) { pickParty = pc.dataset.party; $$("#p-detail [data-party]").forEach(b => b.setAttribute("aria-pressed", b === pc)); $("#pdetail").innerHTML = partyDetailHTML(pickParty); return; }
  if (e.target.closest("#party-save")) { if (await act("set_party", { p_party: pickParty }, `Bienvenue chez ${PARTIES[pickParty].n} !`)) { renderWallet(); back(); } return; }
  if (e.target.closest("#logout")) return signOut();
  if (e.target.closest("#nooffers")) { await act("set_no_offers", { p_on: !ST.state.profile.no_offers }, ST.state.profile.no_offers ? "Vous recevez à nouveau les offres" : "Vous ne recevrez plus d'offres"); return renderDetail(false); }
  if (e.target.closest("#lifeb")) { try { localStorage.setItem("hm_life", localStorage.getItem("hm_life") === "0" ? "1" : "0"); } catch (x) { } return renderDetail(false); }
  if (e.target.closest("#mute")) { try { localStorage.setItem("hm_sound", localStorage.getItem("hm_sound") === "1" ? "0" : "1"); } catch (x) { } return renderDetail(false); }
}
function afterDetail(top) { }
// offre de rachat : l'argent mis de côté suit le prix tapé
$("#p-detail").addEventListener("input", e => {
  if (e.target.id !== "ofp") return; const p = +e.target.value || 0; ofPrice = p;
  const h = $("#ofhold"); if (h) h.textContent = fmtE(ofCredit ? Math.ceil(p * downRate()) : p);
  $$(".ofr .ochips button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.k === p));
});
// prix de vente : « vous recevrez » suit ce qu'on tape
$("#p-detail").addEventListener("input", e => {
  if (e.target.id !== "price" || !$("#osget")) return;
  const p = +e.target.value || 0, n = Math.max(1, +($(".osheet .stepper b")?.textContent || 1)); ownPrice = p;
  $("#osget").textContent = fmtE(Math.floor(p * .95) * n);
  $$(".ochips button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.k === p));
});
