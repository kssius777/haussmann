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
  if (t === "map") { if (map) { map.resize(); pumpGeo(); if (paintAll.pending) setTimeout(paintAll, 0); renderTags(); } } else hidePreview?.();
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
  const K = { b: buildingPage, arr: arrPage, shop: shopPage, money: moneyPage, profile: profilePage, results: resultsPage, party: partyPage }[top.kind];
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
  const pr = PARTIES[s.profile.party]; const av = $("#avatar");
  av.textContent = (s.profile.pseudo || "?")[0].toUpperCase(); av.style.background = pr ? pr.c : "#94A3B8";
  const n = packsReady(); const b = $("#packbadge"); b.hidden = !n; b.textContent = n;
}

// ---------------- PATRIMOINE ----------------
let assetF = "all", assetArr = 0, assetSort = "v", assetN = 30, distAll = false;
function worthNow() { const s = ST.state; return liveCash() + (+s.value || 0) - (+s.debt || 0) - (+s.loans || 0); }
function logWorth() {
  try { const d = new Date().toISOString().slice(0, 10); const h = JSON.parse(localStorage.getItem("hm_hist") || "{}"); h[d] = Math.round(worthNow());
    const keys = Object.keys(h).sort().slice(-30); const o = {}; keys.forEach(k => o[k] = h[k]); localStorage.setItem("hm_hist", JSON.stringify(o)); return o; } catch (e) { return {}; }
}
async function renderAssets() {
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
  $("#p-assets").innerHTML = `<div class="wrap">
    <p class="eyebrow">Patrimoine net</p><h1 class="h1 num big" id="worth">${fmtE(worthNow())}</h1>
    <p class="sub" style="margin:0 0 4px">Trésorerie + valeur de vos biens − ce que vous devez à la banque</p>
    ${rank ? `<button class="rankpill" data-push="results">🏆 Classement : vous êtes <b>${rank === 1 ? "1er" : rank + "e"}</b> sur ${ST.board.length} joueur${ST.board.length > 1 ? "s" : ""}</button>` : ""}
    ${hv.length > 1 ? `<div class="box" style="padding:10px 12px 4px;margin:8px 0 6px">${sparkSVG(hv)}<div class="sub" style="margin:2px 0 6px;font-size:12px">Évolution sur ${hv.length} jours</div></div>` : ""}
    <div class="kpis k4">
      <div class="kpi"><span>Trésorerie</span><b class="num" id="cash2">${fmtE(liveCash())}</b><small class="muted">disponible</small></div>
      <div class="kpi"><span>Loyers / jour</span><b class="green num">+${fmtE(netRate())}</b><small class="muted">${s.loan_rate > 0 ? `+ ${fmtE(s.loan_rate)} remboursent vos crédits` : s.taxes > 0 ? `après ${fmtE(s.taxes)} de taxe des maires` : "versés en continu"}</small></div>
      <div class="kpi"><span>Valeur des biens</span><b class="num">${fmtE(+s.value || 0)}</b><small class="muted">${nLots} logement${nLots > 1 ? "s" : ""}</small></div>
      <div class="kpi ${loans || debt ? "warn" : ""}"><span>Dettes</span><b class="num">${fmtE(loans + debt)}</b><small class="muted">${loans ? `crédits ${s.credits || 0}/3` : "aucun crédit"}${debt ? ` · hypothèques ${fmtE(debt)}` : ""}</small></div>
    </div>
    ${dist.length ? `<h2 class="h2">Où sont vos biens</h2><div class="dist">${(distAll ? dist : dist.slice(0, 5)).map(distRow).join("")}${dist.length > 5 ? `<button class="dmore" data-dall>${distAll ? "Réduire" : `Voir les ${dist.length} arrondissements`}</button>` : ""}</div>` : ""}
    <h2 class="h2">Ma collection <span class="muted" style="font:700 14px var(--f)">${hs.length} carte${hs.length > 1 ? "s" : ""}</span></h2>
    <div class="chips"><button class="chip plain" data-af="all" aria-pressed="${assetF === "all"}">Tout</button>
      ${ORDER.split("").reverse().map(r => counts[r] ? `<button class="chip" data-af="${r}" aria-pressed="${assetF === r}">${rarSq(r)}${counts[r]}</button>` : "").join("")}
      ${nLoan ? `<button class="chip plain" data-af="loan" aria-pressed="${assetF === "loan"}">🏦 À crédit · ${nLoan}</button>` : ""}
      ${nMort ? `<button class="chip plain" data-af="mort" aria-pressed="${assetF === "mort"}">🔒 Hypothéqués · ${nMort}</button>` : ""}</div>
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
  const f = e.target.closest("[data-af]"); if (f) { assetF = f.dataset.af; assetN = 30; return renderAssets(); }
  const a = e.target.closest("[data-aa]"); if (a) { const v = +a.dataset.aa; assetArr = assetArr === v ? 0 : v; assetN = 30; renderAssets(); if (assetArr) setTimeout(() => $("#p-assets .chips")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30); return; }
  if (e.target.closest("[data-dall]")) { distAll = !distAll; return renderAssets(); }
  if (e.target.closest("[data-gmore]")) { assetN += 60; return renderAssets(); }
});
$("#p-assets").addEventListener("change", e => { if (e.target.id === "asort") { assetSort = e.target.value; renderAssets(); } });

// ---------------- MARCHÉ ----------------
let marketTab = "all";
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
      <div class="v"><b class="num">${fmtE(l.price)}</b>${own ? `<button class="btn sm ghost" data-unlist="${l.id}">Retirer</button>` : `<button class="btn sm green" data-buy="${l.id}" ${liveCash() < l.price ? "disabled" : ""}>Acheter</button>`}</div></div>`; }).join("");
  const sales = ST.market.sales.map(s => { const c = card(s.card); return c ? `<button class="lrow" data-push="b" data-arg="${s.card}"><div class="th">${photo(c)}</div><div class="t"><b>${esc(title(c))}</b><span>${s.k != null ? lotName(c, s.k) : s.n + " parts"} · acheté par ${esc(s.buyer || "?")} · ${ago(s.at)}</span></div><div class="v num"><b>${fmtE(s.price)}</b></div></button>` : ""; }).join("");
  el.innerHTML = `<div class="wrap"><h1 class="h1">Marché</h1><p class="sub">Les biens mis en vente par les joueurs. Le vendeur reçoit le prix moins 5 % de commission.</p>
    <div class="seg" role="tablist"><button data-mt="all" aria-selected="${marketTab === "all"}">Annonces · ${others.length}</button><button data-mt="mine" aria-selected="${marketTab === "mine"}">Les miennes · ${mineL.length}</button><button data-mt="sales" aria-selected="${marketTab === "sales"}">Ventes</button></div>
    ${marketTab === "all" ? (others.length ? `<div class="rows">${rows(others, false)}</div>` : `<div class="empty"><b>Aucune annonce pour l'instant.</b><br><span class="muted">Les joueurs peuvent vendre leurs biens ici, 5 % de commission. Soyez le premier !</span><br><br><button class="btn sm light" data-go="assets">Vendre un de mes biens</button></div>${sales ? `<h2 class="h3">Dernières ventes</h2><div class="rows">${sales}</div>` : ""}`) : ""}
    ${marketTab === "mine" ? (mineL.length ? `<div class="rows">${rows(mineL, true)}</div>` : `<div class="empty">Pour vendre un bien, ouvrez sa fiche depuis votre Patrimoine puis « Mettre en vente ».</div>`) : ""}
    ${marketTab === "sales" ? (sales ? `<div class="rows">${sales}</div>` : `<div class="empty">Pas encore de vente entre joueurs.</div>`) : ""}</div>`;
}
$("#p-market").addEventListener("click", async e => {
  const t = e.target.closest("[data-mt]"); if (t) { marketTab = t.dataset.mt; return renderMarket(); }
  const b = e.target.closest("[data-buy]"); if (b) { b.disabled = true; await act("buy_listing", { p_id: +b.dataset.buy }, "Achat conclu !"); return renderMarket(); }
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
      <div class="pb-h"><p class="eyebrow">Les 20 mairies</p>${w?.party ? `<span class="pill" style="background:${PARTIES[w.party].c};color:#fff">🏛 Hôtel de Ville : ${esc(PARTIES[w.party].n)}</span>` : ""}</div>
      ${mayorsMapSVG()}
      <div class="pleg">${PARTY_ORDER.map(k => `<span><i style="background:${PARTIES[k].c}"></i>${esc(PARTIES[k].n)} <em>(${esc(PARTIES[k].side.toLowerCase())})</em> <b>${seats[k] || 0}</b></span>`).join("")}</div>
      <p class="sub" style="margin:8px 0 0;font-size:12.5px">Le maire d'un arrondissement est le joueur qui y possède le plus. Chaque lundi, le parti qui a le plus de maires gagne l'Hôtel de Ville. <button class="lnk" data-push="results">En savoir plus</button></p>
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
let selLot = null, saleMode = false, bInfo = null, bCredit = null;
async function buildingPage(g) {
  await ensureCards([g]); const c = card(g); if (!c) return dhead("Immeuble") + `<div class="wrap"><p class="sub">Introuvable.</p></div>`;
  if (sel !== g) { sel = g; selLot = null; saleMode = false; bCredit = null; }
  try { bInfo = await rpc("building", { p_card: g }); } catch (e) { bInfo = { lots: [], parts: [], listings: [], sales: [] }; }
  const owners = new Map(bInfo.lots.map(([k, o, ps, m]) => [k, { o, ps, m }]));
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
    const rows = isP ? "" : myKs.map(k => {
      const l = listed.get(k), m = ST.mort.get(g + ":" + k);
      const where = c.lk === "l" ? `${lotName(c, k)} · ${ord(floorOfLot(c, k))} étage` : `${lotName(c, k)} · rez-de-chaussée`;
      let actions;
      if (loan) actions = `<span class="pill">🏦 à crédit</span>`;
      else if (l) actions = `<span class="pill" style="background:var(--sale);color:#fff">En vente ${fmtE(l.price)}</span><button class="btn sm ghost" data-act="unlist" data-id="${l.id}">Retirer</button>`;
      else if (m) actions = `<span class="pill">🔒 Hypothéqué</span><button class="btn sm green" data-act="lift" data-k="${k}" ${liveCash() < liftCost(m) ? "disabled" : ""}>Rembourser ${fmtE(liftCost(m))}</button>`;
      else if (saleMode === k) actions = `<input class="inp num" id="price" style="height:34px;width:120px" inputmode="numeric" type="number" min="1" step="1000" value="${Math.round(c.v * 1.1 / 1000) * 1000}" aria-label="Prix de vente"><button class="btn sm amber" data-act="list" data-k="${k}">Publier</button><button class="btn sm ghost" data-act="cancelsale">×</button>`;
      else actions = `<button class="btn sm amber" data-act="sale" data-k="${k}">Vendre</button><button class="btn sm light" data-act="mort" data-k="${k}">Hypothéquer</button>`;
      return `<div class="myrow"><b>${where}</b><div class="acts">${actions}</div></div>`;
    }).join("");
    const days = loan ? Math.ceil(loan / Math.max(1, c.rent * unitsOf(h) * .7)) : 0;
    mine = `<div class="box mine-box"><div class="mb-h"><span>Vous possédez</span><b>${esc(ownSentence(c, myKs, myN))}</b><small class="num">+${fmtE(baseRent(h))} / jour${fullTitle(h) ? " · immeuble complet +60 %" : myKs.some(k => fullFloor(c, myKs, k)) ? " · étage complet +25 %" : ""}</small></div>
      ${loan ? `<div class="loanbox"><b>🏦 Crédit en cours : reste ${fmtE(loan)}</b><span>Il se rembourse tout seul avec 70 % du loyer (encore ~${days} jours). Remboursé, vous touchez tout le loyer et pouvez vendre ou hypothéquer.</span><button class="btn sm green" data-act="repay" ${liveCash() < loan ? "disabled" : ""}>Rembourser maintenant · ${fmtE(loan)}</button></div>` : ""}
      ${rows ? `<div class="myrows">${rows}</div>` : ""}</div>`;
  }
  const offers = bInfo.listings.filter(l => l.seller !== ME);
  const offersHTML = offers.length ? `<h2 class="h3">À vendre par des joueurs</h2><div class="rows">${offers.map(l => `<div class="lrow" style="grid-template-columns:1fr auto"><div class="t"><b>${l.k != null ? lotName(c, l.k) + (c.lk === "l" ? " · " + ord(floorOfLot(c, l.k)) + " étage" : "") : l.n + " part" + (l.n > 1 ? "s" : "")}</b><span>vendu par ${esc(l.pseudo)}</span></div><div class="v"><b class="num">${fmtE(l.price)}</b><button class="btn sm green" data-act="buyl" data-id="${l.id}" ${liveCash() < l.price ? "disabled" : ""}>Acheter</button></div></div>`).join("")}</div>` : "";
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
    </div>
  </div>`;
}
function farHTML(d, g) { return `<div class="buyfar"><b>🎲 Pour l'acheter à la banque, tombez dessus avec le dé.</b><span class="muted">Ou trouvez-le dans un booster, ou au Marché si un joueur le vend.</span></div>`; }
function payToggle(price, rent) {
  const cap = ST.state?.loan_cap ?? 1e12, cash = liveCash(), down = Math.ceil(price * .1), can = price - down <= cap && cash >= down;
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
    else if (!o) { const [cr, tg] = payToggle(c.v, c.rent); btn = tg + `<button class="btn block buy" data-act="bank" data-k="${k}" ${cash < (cr ? Math.ceil(c.v * .1) : c.v) ? "disabled" : ""}><span>Acheter · ${fmtE(cr ? Math.ceil(c.v * .1) : c.v)}</span>${buySub(cr)}</button>`; }
    else if (o.o === ME) btn = `<div class="sub" style="margin:0">Il est à vous.</div>`;
    else btn = l ? `<button class="btn block green" data-act="buyl" data-id="${l.id}" ${cash < l.price ? "disabled" : ""}>Acheter à ${esc(l.pseudo)} · ${fmtE(l.price)}</button>` : `<div class="sub" style="margin:0">Appartient à ${esc(o.ps)}, pas en vente.</div>`;
    return head + btn + `<button class="btn sm ghost" data-act="unpick">Annuler</button>`;
  }
  if (free <= 0) return `<div class="what"><span>Tout est pris. Surveillez le Marché : les propriétaires peuvent mettre leurs biens en vente.</span></div>`;
  if (far) return farHTML(far, g);
  const total = c.v * c.lots, allFree = !isP && owners.size === 0 && c.lots > 1, [cr, tg] = payToggle(c.v, c.rent), need = p => cr ? Math.ceil(p * .1) : p;
  return tg + `<button class="btn block buy" data-act="bank" ${cash < need(c.v) ? "disabled" : ""}><span>${isP ? "Acheter 1 part" : `Acheter 1 ${c.lk === "l" ? "logement" : "local"}`} · ${fmtE(need(c.v))}</span>${buySub(cr)}</button>
    ${allFree && cash >= need(total) ? `<button class="btn block light" data-act="bbuild">Tout l'immeuble · ${fmtE(need(total))} <small class="muted">(+60 % de loyer)</small></button>` : ""}
    ${!cr && cash < c.v ? `<small class="muted">Il vous manque ${fmtE(c.v - cash)}.</small>` : ""}`;
}
$("#p-detail").addEventListener("click", async e => {
  const top = stack[stack.length - 1]; if (!top) return;
  const mt = e.target.closest("[data-mapto]"); if (mt) { const g = +mt.dataset.mapto; showOnMap(g); return; }
  if (top.kind === "party" || top.kind === "profile") return partyClick(e);
  if (top.kind === "shop") { const o = e.target.closest("[data-offer]"); if (o) toast("Le paiement arrive bientôt : la boutique sera ouverte au lancement.", ""); return; }
  if (top.kind !== "b") return;
  const g = top.arg; const c = card(g);
  const pick = e.target.closest("[data-pick]"); if (pick) { selLot = +pick.dataset.k; saleMode = false; return renderDetail(false); }
  const btn = e.target.closest("[data-act]"); if (!btn) return; const a = btn.dataset.act;
  const k = btn.dataset.k != null ? +btn.dataset.k : null; const id = +btn.dataset.id;
  if (a === "sale") { saleMode = k; return renderDetail(false); }
  if (a === "cancelsale") { saleMode = false; return renderDetail(false); }
  if (a === "unpick") { selLot = null; return renderDetail(false); }
  if (a === "paymode") { bCredit = k === 1; return renderDetail(false); }
  btn.disabled = true;
  const before = (ST.mine.get(g) || []).length + (ST.mineParts.get(g) || 0);
  const credit = btn.closest("#actbar")?.querySelector('.pay [aria-selected="true"]')?.dataset.k === "1";
  if (a === "bank") { if (await act("bank_buy", Object.assign({ p_card: g, p_k: c.lk === "p" ? null : k }, credit ? { p_credit: true } : {}), null)) { celebrate(c); selLot = null; } }
  if (a === "bbuild") { if (await act("buy_building", Object.assign({ p_card: g }, credit ? { p_credit: true } : {}), null)) toast(`Tout l'immeuble est à vous ! Loyers +60 %`, "good"); }
  if (a === "repay") await act("repay", { p_card: g }, "Crédit remboursé : tout le loyer est à vous !");
  if (a === "list") { const p = +$("#price").value; await act("list_item", { p_card: g, p_k: k, p_n: 1, p_price: p }, "Annonce publiée au Marché"); saleMode = false; }
  if (a === "unlist") await act("unlist", { p_id: id }, "Annonce retirée");
  if (a === "buyl") await act("buy_listing", { p_id: id }, "Achat conclu !");
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
const LK = { rent: ["🏠", "Loyers"], tax: ["🏛️", "Taxe des maires"], tax_in: ["👑", "Taxe de maire reçue"], salary: ["💼", "Salaire du tour"], toll_paid: ["💸", "Loyer de passage payé"], toll_in: ["💰", "Loyer de passage reçu"], buy: ["🔑", "Achat"], sale: ["🤝", "Vente"], chance: ["🃏", "Carte Chance"], booster: ["📦", "Booster"], rolls: ["🎲", "Lancers"], mortgage: ["🏦", "Hypothèque"], lift: ["🏦", "Hypothèque remboursée"], repay: ["🏦", "Crédit remboursé"], bonus: ["🏠", "Bonus"], credit: ["🏦", "Remboursement des crédits"] };
async function moneyPage() {
  let rows = []; try { rows = await rpc("my_ledger"); } catch (e) { }
  await ensureCards(rows.filter(r => r.card != null).map(r => r.card));
  const s = ST.state; const days = new Map();
  for (const r of rows) { const d = new Date(r.at); const key = d.toDateString(); if (!days.has(key)) days.set(key, { d, items: [], tot: 0 }); const g = days.get(key); g.items.push(r); g.tot += +r.amount; }
  const dayLabel = d => { const t = new Date(), y = new Date(Date.now() - 864e5); return d.toDateString() === t.toDateString() ? "Aujourd'hui" : d.toDateString() === y.toDateString() ? "Hier" : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); };
  const line = r => { const [ic, dft] = LK[r.kind] || ["•", r.kind]; const c = r.card != null ? card(r.card) : null; const a = +r.amount;
    return `<${c ? `button data-push="b" data-arg="${r.card}"` : "div"} class="ml"><span class="ic">${ic}</span><span class="t"><b>${esc(r.label || dft)}</b>${c ? `<small>${esc(title(c))}</small>` : ""}</span><b class="num ${a >= 0 ? "green" : "red"}">${a >= 0 ? "+" : "−"}${fmtE(Math.abs(a))}</b></${c ? "button" : "div"}>`; };
  return dhead("Mon argent") + `<div class="wrap">
    <div class="box" style="text-align:center"><p class="eyebrow">Trésorerie</p><b class="num" style="font-size:30px" id="cash2">${fmtE(liveCash())}</b><div class="sub" style="margin:4px 0 0">+${fmtE(netRate())} de loyers par jour${s?.loan_rate > 0 ? ` · ${fmtE(s.loan_rate)} / jour remboursent vos crédits` : ""}</div>
      <div style="margin-top:10px"><button class="btn sm gold" data-push="shop">+ Ajouter de l'argent</button></div></div>
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
    <p class="sub" style="margin-top:12px">L'argent du jeu sert uniquement dans Haussmann et ne peut jamais être reconverti en euros.</p></div>`;
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
    ${pr ? `<div class="box" style="border-left:6px solid ${pr.c};display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center">${emblemSVG(p.party, 56)}<div><b style="color:${pr.c};font-size:17px">${esc(pr.n)}</b> <span class="muted">· ${esc(pr.side)}</span><div class="motto">« ${esc(pr.motto)} »</div><p class="sub" style="margin:6px 0 0">Vous protège de : ${esc(shieldText(p.party))}. Dans les arrondissements tenus par ${esc(pr.n)}, vos loyers sont à +${MEMBER_BONUS} %.</p></div></div>` : ""}
    <div style="margin-top:10px"><button class="btn block ${pr ? "light" : ""}" data-push="party" ${pr && wait > 0 ? "disabled" : ""}>${!pr ? "Choisir mon parti" : wait > 0 ? `Changer de parti possible dans ${hm(wait)}` : "Changer de parti"}</button></div>
    <h2 class="h2">Réglages</h2>
    <button class="btn block light" id="mute">${(() => { try { return localStorage.getItem("hm_sound") === "1" ? "🔊 Sons activés · couper" : "🔇 Sons coupés · activer"; } catch (e) { return "🔇 Sons"; } })()}</button>
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
    <ul><li><b>Protège ses membres</b> contre : ${esc(shieldText(k))}.</li><li><b>Dans ses arrondissements</b>, ses membres touchent +${MEMBER_BONUS} % de loyers.</li><li><b>Mêmes règles pour tous</b> : seuls l'esprit et la protection changent d'un parti à l'autre.</li></ul>
    <button class="btn block" id="party-save" style="background:${p.c}" ${cur === k ? "disabled" : ""}>${cur === k ? "C'est déjà votre parti" : `Rejoindre ${esc(p.n)}`}</button>
    <p class="sub" style="margin:8px 0 0;font-size:12.5px;text-align:center">${cur ? "Vous pourrez changer de nouveau dans 48 h." : "Vous pourrez en changer plus tard (une fois toutes les 48 h)."}</p></div>`;
}
async function partyClick(e) {
  const pc = e.target.closest("[data-party]"); if (pc) { pickParty = pc.dataset.party; $$("#p-detail [data-party]").forEach(b => b.setAttribute("aria-pressed", b === pc)); $("#pdetail").innerHTML = partyDetailHTML(pickParty); return; }
  if (e.target.closest("#party-save")) { if (await act("set_party", { p_party: pickParty }, `Bienvenue chez ${PARTIES[pickParty].n} !`)) { renderWallet(); back(); } return; }
  if (e.target.closest("#logout")) return signOut();
  if (e.target.closest("#mute")) { try { localStorage.setItem("hm_sound", localStorage.getItem("hm_sound") === "1" ? "0" : "1"); } catch (x) { } return renderDetail(false); }
}
function afterDetail(top) { }
