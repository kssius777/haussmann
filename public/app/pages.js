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
  if (tab === "map" && map) { pumpGeo(); paintAll(); }
}
async function renderDetail(anim) {
  const top = stack[stack.length - 1]; if (!top) return; const el = $("#p-detail");
  el.hidden = false; if (anim) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); el.scrollTop = 0; }
  const K = { b: buildingPage, arr: arrPage, shop: shopPage, profile: profilePage, results: resultsPage, party: partyPage }[top.kind];
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
let assetF = "all";
function worthNow() { const s = ST.state; return liveCash() + (+s.value || 0) - (+s.debt || 0); }
function logWorth() {
  try { const d = new Date().toISOString().slice(0, 10); const h = JSON.parse(localStorage.getItem("hm_hist") || "{}"); h[d] = Math.round(worthNow());
    const keys = Object.keys(h).sort().slice(-30); const o = {}; keys.forEach(k => o[k] = h[k]); localStorage.setItem("hm_hist", JSON.stringify(o)); return o; } catch (e) { return {}; }
}
function sparkSVG(vals) {
  if (vals.length < 2) return "";
  const W = 320, H = 70, mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1;
  const pts = vals.map((v, i) => [i * W / (vals.length - 1), H - 6 - (v - mn) / sp * (H - 12)]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}L${W} ${H}L0 ${H}Z" fill="rgba(14,165,160,.12)"/><path d="${d}" fill="none" stroke="#0EA5A0" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
}
async function renderAssets() {
  const s = ST.state; if (!s?.profile) return;
  const hs = holdings().sort((a, b) => b.c.v * unitsOf(b) - a.c.v * unitsOf(a));
  const counts = { C: 0, U: 0, R: 0, L: 0, M: 0 }; for (const h of hs) counts[h.c.r]++;
  const list = assetF === "all" ? hs : hs.filter(h => h.c.r === assetF);
  const hist = logWorth(); const hv = Object.values(hist);
  const lm = counts.L + counts.M; const nLots = hs.reduce((a, h) => a + h.ks.length, 0);
  const morts = [...ST.mort.entries()];
  const rank = ST.board ? ST.board.findIndex(x => x.id === ME) + 1 : 0;
  $("#p-assets").innerHTML = `<div class="wrap">
    <p class="eyebrow">Patrimoine</p><h1 class="h1 num" id="worth">${fmtE(worthNow())}</h1>
    ${hv.length > 1 ? `<div class="box" style="padding:10px 12px 4px;margin:8px 0 12px">${sparkSVG(hv)}<div class="sub" style="margin:2px 0 6px;font-size:12px">Évolution sur ${hv.length} jours</div></div>` : ""}
    <div class="kpis" style="margin-top:10px">
      <div class="kpi"><span>Loyers par jour</span><b class="green num">+${fmtE(s.rate || 0)}</b>${s.taxes > 0 ? `<small class="muted">après ${fmtE(s.taxes)} de taxe des maires</small>` : `<small class="muted">versés en continu</small>`}</div>
      <div class="kpi"><span>Trésorerie</span><b class="num" id="cash2">${fmtE(liveCash())}</b><small class="muted">disponible</small></div>
      <div class="kpi"><span>Valeur des biens</span><b class="num">${fmtE(+s.value || 0)}</b><small class="muted">${nLots} logement${nLots > 1 ? "s" : ""}${s.debt > 0 ? ` · dette ${fmtE(s.debt)}` : ""}</small></div>
      <div class="kpi" role="button" data-push="results"><span>Classement</span><b class="num">${rank ? (rank === 1 ? "1<small>er</small>" : rank + "<small>e</small>") : "—"}</b><small class="muted">${ST.board ? `sur ${ST.board.length} joueur${ST.board.length > 1 ? "s" : ""}` : "voir"}</small></div>
    </div>
    <h2 class="h2">Ma collection</h2>
    <div class="chips"><button class="chip plain" data-af="all" aria-pressed="${assetF === "all"}">Tout · ${hs.length}</button>
      ${ORDER.split("").reverse().map(r => `<button class="chip" data-af="${r}" aria-pressed="${assetF === r}">${rarSq(r)}${counts[r]}</button>`).join("")}</div>
    <div class="kpis three" style="grid-template-columns:repeat(3,minmax(0,1fr));margin:8px 0 4px">
      <div class="kpi"><span>Biens</span><b>${hs.length}</b></div><div class="kpi"><span>Valeur totale</span><b class="num">${fmtE(+s.value || 0)}</b></div><div class="kpi"><span>Légend. + Myth.</span><b>${lm}</b></div></div>
    ${hs.length ? `
      ${assetF === "all" && hs.length > 3 ? `<h2 class="h2">Mes meilleures cartes</h2><div class="hscroll">${hs.slice(0, 6).map(h => `<button data-push="b" data-arg="${h.g}">${cardHTML(h.c, { w: "170px", item: { t: "own", ks: h.ks, n: h.n }, count: h.ks.length > 1 || h.n ? itemLabel(h.c, { t: "own", ks: h.ks, n: h.n }).split(" · ")[0] : "" })}</button>`).join("")}</div>` : ""}
      <h2 class="h2">${assetF === "all" ? "Toute la collection" : RAR[assetF].n}</h2>
      ${list.length ? `<div class="grid-cards">${list.map(h => `<button data-push="b" data-arg="${h.g}">${cardHTML(h.c, { w: "100%", item: { t: "own", ks: h.ks, n: h.n } })}</button>`).join("")}</div>` : `<div class="empty">Aucune carte de cette rareté.</div>`}`
    : `<div class="empty">Vous n'avez encore aucun bien.<br><br><button class="btn" data-go="booster">Ouvrir un booster</button></div>`}
    ${morts.length ? `<h2 class="h2">Mes hypothèques</h2><div class="rows">${morts.map(([key, m]) => { const [g, k] = key.split(":").map(Number); const c = card(g); return c ? `<button class="lrow" data-push="b" data-arg="${g}"><div class="th">${photo(c)}</div><div class="t"><b>${esc(title(c))}</b><span>${k >= 0 ? lotName(c, k) : "Parts"} · emprunté ${fmtE(m.a)}</span></div><div class="v num"><b>${fmtE(liftCost(m))}</b><span class="muted">à rembourser</span></div></button>` : ""; }).join("")}</div>` : ""}
  </div>`;
  if (!ST.board) rpc("leaderboard").then(b => { ST.board = b; if (cur() === "assets") renderAssets(); }).catch(() => { });
}
$("#p-assets").addEventListener("click", e => { const f = e.target.closest("[data-af]"); if (f) { assetF = f.dataset.af; renderAssets(); } });

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
    ${marketTab === "all" ? (others.length ? `<div class="rows">${rows(others, false)}</div>` : `<div class="empty">Aucune annonce pour l'instant.</div>`) : ""}
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
    case "sale": return ["🤝", `<b>${who}</b> achète <b>${esc(c ? title(c) : "un bien")}</b> pour ${fmtE(n.data?.price || 0)}`, a, "#F59E0B"];
    case "week": return ["🗳️", `<b>${esc(PARTIES[n.data?.party]?.n || "")}</b> remporte l'Hôtel de Ville cette semaine`, `${n.data?.mayors} maires · ${fmtE(n.data?.bonus || 0)}/j par membre`, PARTIES[n.data?.party]?.c];
    default: return ["•", n.kind, "", "#94A3B8"];
  }
}
async function renderParis() {
  const el = $("#p-paris");
  const [feed, board] = await Promise.all([rpc("feed").catch(() => []), rpc("leaderboard").catch(() => [])]);
  ST.feed = feed; ST.board = board;
  await ensureCards(feed.filter(n => n.card != null).map(n => n.card));
  const seats = seatCounts(); const w = ST.state?.week; const ev = ST.state?.event;
  el.innerHTML = `<div class="wrap">
    <h1 class="h1">Paris</h1>
    ${!ST.state?.profile?.party ? `<button class="box party-cta" data-push="party"><div class="pc-em">${PARTY_ORDER.map(k => emblemSVG(k, 30)).join("")}</div><b>Choisissez votre camp</b><span>Rejoignez un parti pour gagner +${MEMBER_BONUS} % de loyers là où il tient la mairie, et jouer pour l'Hôtel de Ville.</span></button>` : ""}
    <button class="box" data-push="results" style="display:block;width:100%;text-align:left;margin-top:8px">
      <p class="eyebrow">Résultats des arrondissements</p>
      ${hemicycle(seats)}
      <div class="score" style="box-shadow:none;padding:0;background:none"><div class="leg" style="justify-content:center">${PARTY_ORDER.map(k => `<span><i style="background:${PARTIES[k].c}"></i>${esc(PARTIES[k].n)} ${seats[k] || 0}</span>`).join("")}</div></div>
      ${w?.party ? `<p class="sub" style="text-align:center;margin:8px 0 0">Hôtel de Ville cette semaine : <b style="color:${PARTIES[w.party].c}">${esc(PARTIES[w.party].n)}</b></p>` : ""}
    </button>
    ${ev ? `<div class="box" style="margin-top:12px;display:flex;gap:12px;align-items:center"><span style="font-size:28px">${EVENTS[ev.ev]?.[1] || "📣"}</span><div><b>${esc(EVENTS[ev.ev]?.[0] || "Événement")} dans le ${ord(ev.arr)}</b><div class="sub" style="margin:2px 0 0">Aujourd'hui, les loyers du quartier sont à ×${String(ev.m).replace(".", ",")}</div></div></div>` : ""}
    <div class="seg" role="tablist"><button data-pt="news" aria-selected="${parisTab === "news"}">Actu</button><button data-pt="rank" aria-selected="${parisTab === "rank"}">Classement</button><button data-pt="arr" aria-selected="${parisTab === "arr"}">Arrondissements</button></div>
    ${parisTab === "news" ? (feed.length ? `<div class="feed">${feed.map(n => { const [ic, txt, sub, col] = newsLine(n); return `<${n.card != null ? `button data-push="b" data-arg="${n.card}"` : n.arr ? `button data-push="arr" data-arg="${n.arr - 1}"` : "div"} class="fi"><span class="ic" style="background:color-mix(in srgb,${col} 16%,#fff)">${ic}</span><span>${txt}<small>${esc(sub)}${sub ? " · " : ""}${ago(n.at)}</small></span></${n.card != null || n.arr ? "button" : "div"}>`; }).join("")}</div>` : `<div class="empty">Rien pour l'instant. Les grosses prises, les ventes et les nouveaux maires apparaîtront ici.</div>`) : ""}
    ${parisTab === "rank" ? (board.length ? board.map((p, i) => `<div class="rank${p.id === ME ? " me" : ""}"><span class="n">${i + 1}</span><span><span class="party-dot" style="background:${PARTIES[p.party]?.c || "#94A3B8"}"></span><b>${esc(p.pseudo)}</b>${p.mayorships ? ` <span class="pill" style="height:20px">maire ×${p.mayorships}</span>` : ""}</span><b class="num">${fmtE(p.worth)}</b></div>`).join("") : `<div class="empty">Aucun joueur.</div>`) : ""}
    ${parisTab === "arr" ? `<div class="rows">${IDX.arr.map((a, i) => arrRow(i)).join("")}</div>` : ""}
  </div>`;
}
$("#p-paris").addEventListener("click", e => { const t = e.target.closest("[data-pt]"); if (t) { parisTab = t.dataset.pt; renderParis(); } });
function arrRow(i) {
  const a = IDX.arr[i], m = ST.mayors[i], pc = m ? PARTIES[m.party] : null, st = IDX.stats[a.c] || {};
  return `<button class="lrow" data-push="arr" data-arg="${i}" style="grid-template-columns:52px minmax(0,1fr) auto"><span class="th" style="width:52px;height:52px;display:grid;place-items:center;background:${pc ? pc.c : "var(--soft2)"};color:${pc ? "#fff" : "var(--ink)"};font-weight:900;font-size:15px">${ord(a.n)}</span>
    <span class="t"><b>${ord(a.n)} arrondissement</b><span>${m ? `Maire : ${esc(m.pseudo)} · ${esc(pc?.n || "")}` : "Siège libre"}</span></span><span class="v"><b class="num">${fmtN(st.pm2 || 0)} €/m²</b></span></button>`;
}
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
    <h2 class="h2">Arrondissements</h2><div class="rows">${IDX.arr.map((a, i) => arrRow(i)).join("")}</div>
  </div>`;
}

// ---------------- FICHE IMMEUBLE ----------------
let selLot = null, saleMode = false, bInfo = null;
async function buildingPage(g) {
  await ensureCards([g]); const c = card(g); if (!c) return dhead("Immeuble") + `<div class="wrap"><p class="sub">Introuvable.</p></div>`;
  if (sel !== g) { sel = g; selLot = null; saleMode = false; }
  try { bInfo = await rpc("building", { p_card: g }); } catch (e) { bInfo = { lots: [], parts: [], listings: [], sales: [] }; }
  const owners = new Map(bInfo.lots.map(([k, o, ps, m]) => [k, { o, ps, m }]));
  const isP = c.lk === "p"; const myKs = ST.mine.get(g) || []; const myN = ST.mineParts.get(g) || 0;
  const sold = bInfo.parts.reduce((a, x) => a + x[2], 0);
  const free = isP ? c.lots - sold : c.lots - owners.size;
  const unitW = isP ? "part" : c.lk === "l" ? "logement" : "local";
  const days = Math.round(c.v / Math.max(1, c.rent));
  const listed = new Map(bInfo.listings.filter(l => l.k != null).map(l => [l.k, l]));
  // ce que je possède, avec les actions sur chaque bien
  let mine = "";
  if (myKs.length || myN) {
    const h = { g, c, ks: myKs, n: myN };
    const rows = isP ? "" : myKs.map(k => {
      const l = listed.get(k), m = ST.mort.get(g + ":" + k);
      const where = c.lk === "l" ? `${lotName(c, k)} · ${ord(floorOfLot(c, k))} étage` : lotName(c, k);
      let actions;
      if (l) actions = `<span class="pill" style="background:var(--sale);color:#fff">En vente ${fmtE(l.price)}</span><button class="btn sm ghost" data-act="unlist" data-id="${l.id}">Retirer</button>`;
      else if (m) actions = `<span class="pill">Hypothéqué</span><button class="btn sm green" data-act="lift" data-k="${k}" ${liveCash() < liftCost(m) ? "disabled" : ""}>Rembourser ${fmtE(liftCost(m))}</button>`;
      else if (saleMode === k) actions = `<input class="inp num" id="price" style="height:38px;width:130px" inputmode="numeric" type="number" min="1" step="1000" value="${Math.round(c.v * 1.1 / 1000) * 1000}" aria-label="Prix de vente"><button class="btn sm amber" data-act="list" data-k="${k}">Publier</button><button class="btn sm ghost" data-act="cancelsale">×</button>`;
      else actions = `<button class="btn sm amber" data-act="sale" data-k="${k}">Vendre</button><button class="btn sm light" data-act="mort" data-k="${k}">Hypothéquer</button>`;
      return `<div class="myrow"><b>${where}</b><div class="acts">${actions}</div></div>`;
    }).join("");
    mine = `<div class="box mine-box"><p class="eyebrow">Vous possédez</p><b style="font-size:18px">${esc(itemLabel(c, { t: "own", ks: myKs, n: myN }))}</b>
      <div class="sub num" style="margin:4px 0 0">Valeur ${fmtE(c.v * unitsOf(h))} · loyers ${fmtE(baseRent(h))} / jour${fullTitle(h) ? " · immeuble complet : +60 %" : myKs.some(k => fullFloor(c, myKs, k)) ? " · étage complet : +25 %" : ""}</div>
      ${rows ? `<div class="myrows">${rows}</div><p class="sub" style="margin:8px 0 0;font-size:12.5px">Vendre : votre annonce apparaît au Marché, vous recevez le prix moins 5 %. Hypothéquer : vous touchez tout de suite 50 % de la valeur, mais le logement ne rapporte plus jusqu'au remboursement.</p>` : ""}</div>`;
  }
  // annonces des autres joueurs
  const offers = bInfo.listings.filter(l => l.seller !== ME);
  const offersHTML = offers.length ? `<h2 class="h2">À vendre par des joueurs</h2><div class="rows">${offers.map(l => `<div class="lrow" style="grid-template-columns:1fr auto"><div class="t"><b>${l.k != null ? lotName(c, l.k) + (c.lk === "l" ? " · " + ord(floorOfLot(c, l.k)) + " étage" : "") : l.n + " part" + (l.n > 1 ? "s" : "")}</b><span>vendu par ${esc(l.pseudo)}</span></div><div class="v"><b class="num">${fmtE(l.price)}</b><button class="btn sm green" data-act="buyl" data-id="${l.id}" ${liveCash() < l.price ? "disabled" : ""}>Acheter</button></div></div>`).join("")}</div>` : "";
  // plan de l'immeuble
  let plan = "";
  if (!isP) {
    const groups = new Map(); for (let k = 0; k < c.lots; k++) { const f = floorOfLot(c, k); if (!groups.has(f)) groups.set(f, []); groups.get(f).push(k); }
    plan = `<details class="plan" ${selLot !== null ? "open" : ""}><summary>Voir le plan de l'immeuble, étage par étage</summary>
      <p class="sub" style="margin:8px 0">Touchez un ${unitW} pour le choisir précisément.</p>
      <div class="floors">${[...groups.entries()].sort((a, b) => b[0] - a[0]).map(([f, ks]) => `<div class="floor"><span>${c.lk === "l" ? ord(f) : "RDC"}</span><div>${ks.map(k => { const o = owners.get(k); const cls = o ? (o.o === ME ? "mine" : "theirs") : ""; return `<button class="lot ${cls}${o?.m ? " mort" : ""}${listed.has(k) ? " sale" : ""}" data-k="${k}" data-pick="1" aria-pressed="${selLot === k}" aria-label="${lotName(c, k)}, ${o ? (o.o === ME ? "à vous" : "à " + esc(o.ps)) : "libre"}">${k + 1}</button>`; }).join("")}</div></div>`).join("")}</div>
      <div class="legend-s"><span><i style="background:var(--soft);border:1.5px solid var(--line)"></i>Libre</span><span><i style="background:var(--mine)"></i>À vous</span><span><i style="background:#E2E8F0"></i>Autre joueur</span><span><i style="background:var(--sale)"></i>En vente</span></div></details>`;
  } else {
    const cols = ["#0EA5A0", "#3E7BDC", "#F2A33A", "#E5679A", "#7C8BA1"]; const gd = bInfo.parts[0];
    plan = `<h2 class="h2">Les propriétaires</h2><div class="box"><div class="bar2">${bInfo.parts.slice(0, 5).map(([u, ps, n], i) => `<i style="width:${100 * n / c.lots}%;background:${u === ME ? "var(--mine)" : cols[i + 1]}"></i>`).join("")}</div>
      <p class="sub" style="margin:10px 0 0">${gd && gd[2] * 4 >= c.lots ? `Gardien du monument : <b>${esc(gd[1])}</b> (+20 % de loyer)` : "Celui qui détient 25 % des parts devient Gardien du monument : +20 % de loyer."}</p></div>
      ${bInfo.parts.slice(0, 5).map(([u, ps, n], i) => `<div class="rank${u === ME ? " me" : ""}"><span class="n">${i + 1}</span><span>${esc(ps)}</span><b class="num">${fmtN(n)} parts</b></div>`).join("")}`;
  }
  const ext = MONS?.[g]; const about = ext?.ext ? `<h2 class="h2">À propos</h2><div class="about">${esc(ext.ext)}</div>` : "";
  const sales = bInfo.sales.length ? `<h2 class="h2">Dernières ventes entre joueurs</h2><div class="rows">${bInfo.sales.map(s => `<div class="lrow" style="grid-template-columns:1fr auto"><div class="t"><b>${s.k != null ? lotName(c, s.k) : s.n + " parts"}</b><span>${ago(s.at)}</span></div><div class="v num"><b>${fmtE(s.price)}</b></div></div>`).join("")}</div>` : "";
  return `<div class="bhero">${photo(c)}<button class="back" data-back>${ICON.back}Retour</button>${goodPhoto(c) && c.cr ? `<span class="credit">${esc(c.cr)}</span>` : ""}</div>
  <div class="wrap">
    <div class="btitle"><span class="pill rar" style="background:${RAR[c.r].c}">${RAR[c.r].n}</span><span class="pill">${esc(kindLabel(c))}</span>${ST.state?.event?.arr === c.arr ? `<span class="pill" style="background:#FEF3C7;color:#92400E">Quartier du jour</span>` : ""}</div>
    <h1 class="h1">${esc(title(c))}</h1><p class="sub">${esc(c.name && c.adr ? c.adr + " · " : "")}${ord(c.arr)} arrondissement · <button style="color:var(--blue2);font-weight:700" data-mapto="${g}">voir sur la carte</button></p>
    <div class="bstat num">
      <div><span>Prix d'un${isP ? "e" : ""} ${unitW}</span><b>${fmtE(c.v)}</b></div>
      <div><span>Loyer</span><b class="green">+${fmtE(c.rent)}<small>/jour</small></b></div>
      <div><span>Disponibles</span><b>${isP ? fmtN(free) : free}<small> / ${isP ? fmtN(c.lots) : c.lots}</small></b></div>
    </div>
    <p class="sub" style="margin-top:8px">${isP ? `Chaque part rapporte un loyer chaque jour.` : `Un ${unitW} se rembourse en ${days} jours de loyer. Bonus : tout un étage = loyers +25 %, l'immeuble entier = +60 %.`}${c.s && !isP ? ` Surface : ${c.s} m², prix réel de la rue : ${fmtN(c.pm2)} €/m².` : ""}</p>
    ${mine}${offersHTML}${plan}
    <h2 class="h2">La carte</h2><div style="display:flex;justify-content:center">${cardHTML(c, { w: "250px", item: myKs.length || myN ? { t: "own", ks: myKs, n: myN } : null })}</div>
    ${about}${sales}
    <div class="actbar" id="actbar">${buyActions(c, g, owners, free, isP)}</div>
  </div>`;
}
// la barre du bas : acheter (ou agir sur le logement choisi dans le plan)
function farHTML(d, g) { return `<div class="buyfar"><b>🎲 Pour l'acheter, tombez dessus avec le dé</b><span class="muted">À la banque, on n'achète que l'immeuble où son pion s'arrête. Vous pouvez aussi trouver ce bien dans un booster, ou l'acheter au Marché si un joueur le vend.</span><button class="btn sm light" data-mapto="${g}">Voir sur la carte</button></div>`; }
function buyActions(c, g, owners, free, isP) {
  const cash = liveCash(), far = notLanded(g);
  if (selLot !== null && !isP) {
    const k = selLot, o = owners.get(k), l = bInfo.listings.find(x => x.k === k);
    const head = `<div class="what"><b>${lotName(c, k)}${c.lk === "l" ? " · " + ord(floorOfLot(c, k)) + " étage" : ""}</b><span class="num">${o ? (o.o === ME ? "À vous" : "À " + esc(o.ps)) : "Libre"} · ${fmtE(c.v)} · +${fmtE(c.rent)}/jour</span></div>`;
    let btn;
    if (!o && far) btn = farHTML(far, g);
    else if (!o) btn = `<button class="btn block green" data-act="bank" data-k="${k}" ${cash < c.v ? "disabled" : ""}>Acheter ce ${c.lk === "l" ? "logement" : "local"} · ${fmtE(c.v)}</button>`;
    else if (o.o === ME) btn = `<div class="sub" style="margin:0">Il est à vous : gérez-le dans « Vous possédez » plus haut.</div>`;
    else btn = l ? `<button class="btn block green" data-act="buyl" data-id="${l.id}" ${cash < l.price ? "disabled" : ""}>Acheter à ${esc(l.pseudo)} · ${fmtE(l.price)}</button>` : `<div class="sub" style="margin:0">Ce logement appartient à ${esc(o.ps)} et n'est pas en vente.</div>`;
    return head + btn + `<button class="btn sm ghost" data-act="unpick">Annuler la sélection</button>`;
  }
  if (free <= 0) return `<div class="what"><b>Tout est déjà pris</b><span>Surveillez le Marché : les propriétaires peuvent mettre leurs biens en vente.</span></div>`;
  if (far) return farHTML(far, g);
  const total = c.v * c.lots, allFree = !isP && owners.size === 0 && c.lots > 1;
  const miss = cash < c.v ? `<div class="sub" style="margin:0;font-size:13px">Il vous manque ${fmtE(c.v - cash)}. Vos loyers arrivent en continu, ou ouvrez un booster.</div>` : "";
  return `<button class="btn block green" data-act="bank" ${cash < c.v ? "disabled" : ""}>${isP ? "Acheter 1 part" : `Acheter un ${c.lk === "l" ? "logement" : "local"}`} · ${fmtE(c.v)}</button>
    ${allFree ? `<button class="btn block light" data-act="bbuild" ${cash < total ? "disabled" : ""}>Acheter tout l'immeuble · ${fmtE(total)} <span class="green" style="font-size:12.5px">+60 % de loyer</span></button>` : ""}${miss}`;
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
  btn.disabled = true;
  const before = (ST.mine.get(g) || []).length + (ST.mineParts.get(g) || 0);
  if (a === "bank") { if (await act("bank_buy", { p_card: g, p_k: c.lk === "p" ? null : k }, null)) { celebrate(c); selLot = null; } }
  if (a === "bbuild") { if (await act("buy_building", { p_card: g }, null)) toast(`Tout l'immeuble est à vous ! Loyers +60 %`, "good"); }
  if (a === "list") { const p = +$("#price").value; await act("list_item", { p_card: g, p_k: k, p_n: 1, p_price: p }, "Annonce publiée au Marché"); saleMode = false; }
  if (a === "unlist") await act("unlist", { p_id: id }, "Annonce retirée");
  if (a === "buyl") await act("buy_listing", { p_id: id }, "Achat conclu !");
  if (a === "mort") await act("mortgage", { p_card: g, p_k: k }, "Hypothèque accordée : +" + fmtE(Math.round(c.v / 2)));
  if (a === "lift") await act("lift", { p_card: g, p_k: k }, "Hypothèque remboursée");
  renderDetail(false);
});

// ---------------- ARRONDISSEMENT ----------------
async function arrPage(i) {
  const a = IDX.arr[i]; const st = IDX.stats[a.c] || {};
  let info = null; try { info = await rpc("arr_info", { p_arr: a.n }); } catch (e) { }
  const s = info?.state, pc = s?.party ? PARTIES[s.party] : null; const ev = ST.state?.event;
  const myParty = ST.state?.profile?.party;
  return dhead(`${ord(a.n)} arrondissement`) + `<div class="wrap">
    <div class="box" style="border-top:8px solid ${pc ? pc.c : "#CBD5E1"}">
      <p class="eyebrow">Maire</p>
      <b style="font-size:20px">${s?.pseudo ? esc(s.pseudo) : "Siège libre"}</b>
      ${pc ? `<div style="margin-top:8px;display:flex;gap:10px;align-items:center">${emblemSVG(s.party, 36)}<div><b style="color:${pc.c}">${esc(pc.n)}</b><div class="motto">« ${esc(pc.motto)} »</div></div></div>` : ""}
      <p class="sub" style="margin:10px 0 0">${s?.mayor ? `Le maire touche ${MAYOR_TAX} % des loyers des autres propriétaires du quartier. Les membres de ${esc(pc?.n || "son parti")} y gagnent +${MEMBER_BONUS} % de loyers${myParty === s.party ? " (c'est votre parti !)" : ""}.` : "Le premier joueur à posséder un bien ici devient maire."}</p>
    </div>
    ${ev?.arr === a.n ? `<div class="box" style="margin-top:12px;background:#FFFBEB"><b>${EVENTS[ev.ev]?.[1] || ""} ${esc(EVENTS[ev.ev]?.[0] || "")}</b><div class="sub" style="margin:2px 0 0">Aujourd'hui, loyers ×${String(ev.m).replace(".", ",")} dans tout l'arrondissement.</div></div>` : ""}
    <div class="kv num" style="margin-top:12px">
      <div><span>Prix réel moyen</span><b>${fmtN(st.pm2 || 0)} €/m²</b></div><div><span>Ventes réelles (2021-25)</span><b>${fmtN(st.n || 0)}</b></div>
      <div><span>Vos biens ici</span><b>${fmtE(info?.mine || 0)}</b></div><div><span>Immeubles</span><b>${fmtN(a.count)}</b></div></div>
    <h2 class="h2">Plus gros propriétaires</h2>
    ${info?.top?.length ? info.top.slice(0, 3).map((t, k) => `<div class="rank${t.owner === ME ? " me" : ""}"><span class="n">${k + 1}</span><span><span class="party-dot" style="background:${PARTIES[t.party]?.c || "#94A3B8"}"></span>${esc(t.pseudo)}</span><b class="num">${fmtE(t.v)}</b></div>`).join("") : `<div class="empty">Personne ne possède encore de bien ici.</div>`}
    <div style="margin-top:16px"><button class="btn block light" data-arrmap="${i}">Voir sur la carte</button></div>
  </div>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-arrmap]"); if (!b) return; const a = IDX.arr[+b.dataset.arrmap]; go("map"); setTimeout(() => map?.flyTo({ center: a.center, zoom: 14.4, pitch: 50, duration: 1200 }), 60); });

// ---------------- BOUTIQUE, PROFIL ----------------
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
    <h2 class="h2">Mon parti</h2>
    ${!pr ? `<div class="box"><b>Vous n'avez pas encore de parti</b><p class="sub" style="margin:4px 0 0">Rejoignez un camp pour toucher +${MEMBER_BONUS} % de loyers dans les arrondissements qu'il tient, et jouer pour l'Hôtel de Ville.</p></div>` : ""}
    ${pr ? `<div class="box" style="border-left:6px solid ${pr.c};display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center">${emblemSVG(p.party, 56)}<div><b style="color:${pr.c};font-size:17px">${esc(pr.n)}</b> <span class="muted">· ${esc(pr.side)}</span><div class="motto">« ${esc(pr.motto)} »</div><p class="sub" style="margin:6px 0 0">Vous protège de : ${esc(shieldText(p.party))}. Dans les arrondissements tenus par ${esc(pr.n)}, vos loyers sont à +${MEMBER_BONUS} %.</p></div></div>` : ""}
    <div style="margin-top:10px"><button class="btn block ${pr ? "light" : ""}" data-push="party" ${pr && wait > 0 ? "disabled" : ""}>${!pr ? "Choisir mon parti" : wait > 0 ? `Changer de parti possible dans ${hm(wait)}` : "Changer de parti"}</button></div>
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
    <div class="spectrum"><div class="sp-line"></div>${PARTY_ORDER.map(k => `<button class="sp-node" data-party="${k}" aria-pressed="${pickParty === k}" style="--pc:${PARTIES[k].c}" aria-label="${esc(PARTIES[k].n)}">${emblemSVG(k, 46)}<span>${esc(PARTIES[k].n)}</span></button>`).join("")}</div>
    <div class="sp-ends"><span>Gauche</span><span>Centre</span><span>Droite</span></div>
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
}
function afterDetail(top) { }
