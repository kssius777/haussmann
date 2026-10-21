"use strict";
// =====================================================================
//  Démarrage
// =====================================================================
let started = false;
// lien cadeau : https://…/?gift=CODE — on le garde jusqu'à ce que le joueur soit connecté
try { const gq = new URLSearchParams(location.search).get("gift"); if (gq) { localStorage.setItem("hm_gift", gq); const u = new URL(location.href); u.searchParams.delete("gift"); history.replaceState(null, "", u); } } catch (e) { }
async function claimGift() {
  let code = null; try { code = localStorage.getItem("hm_gift"); localStorage.removeItem("hm_gift"); } catch (e) { }
  if (!code) return;
  try {
    const r = await rpc("claim_gift", { p_code: code }); setState(r.state);
    await Promise.all([refreshHold(), refreshMap()]).catch(() => { }); renderWallet(); paintAll?.(); renderDock?.();
    if (r.card) await ensureCards([r.card]);
    const c = r.card ? card(r.card) : null;
    const parts = [r.got && c ? `${r.got > 1 ? r.got + " " + lotWord(c, r.got) : (c.lk === "p" ? "1 part" : "1 " + lotWord(c, 1))} au ${title(c)}` : "", r.boosters ? `${r.boosters} booster${r.boosters > 1 ? "s" : ""}` : ""].filter(Boolean);
    toast(`🎁 Cadeau récupéré : ${parts.join(" + ")} !`, "good");
    if (window.confetti) confetti("#2563EB", 60);
    if (c) setTimeout(() => { flyTo(r.card); previewBuilding(r.card); }, 600);
  } catch (e) { toast("🎁 " + e.message, "bad"); }
}
async function boot() {
  try {
    initBackend();
    const [idx, base] = await Promise.all([getJSON(DATA + "index.json?v=" + DATA_V), getJSON(DATA + "base.json")]);
    IDX = idx; FIELDS = idx.fields; ARR = new Array(20).fill(null); BASE = base; (idx.hide || []).forEach(g => hideSet.add(g));
    getJSON(DATA + "mons.json").then(m => MONS = m).catch(() => { });
    initMapUI();
    if (SB) SB.auth.onAuthStateChange((ev, session) => { if (ev === "SIGNED_IN" && session && !started && $("#onb").hidden === false && (onbStep === "login" || onbStep === "home")) { ME = session.user.id; $("#onb").onclick = null; afterLogin(); } });
    await currentUser();
    if (!ME) return showOnb("home");
    await afterLogin();
  } catch (e) {
    console.error(e); $("#loadmsg") && ($("#loadmsg").textContent = "Impossible de charger le jeu : " + e.message);
  }
}
async function startGame(first) {
  if (started) return; started = true;
  $("#loadmsg") && ($("#loadmsg").textContent = "Chargement de vos biens…");
  await refreshAll();
  try { buildMap(BASE); } catch (e) { console.error(e); $("#map").innerHTML = `<div class="empty" style="margin:120px 16px 0">La carte 3D ne peut pas s'afficher sur cet appareil. Le reste du jeu fonctionne.</div>`; }
  $("#loading")?.remove();
  go("map"); renderWallet(); initPawnUI();
  rpc("is_admin").then(v => { ST.admin = v === true; }).catch(() => { });
  refreshOffers(); setInterval(refreshOffers, 60000);
  try { initWorld(); } catch (e) { console.warn("monde", e); }   // Paris à pied (place.js) : on y entre dès que la carte est prête
  setTimeout(claimGift, 1500);
  try { if (first) { if (localStorage.getItem("hm_tut") == null) localStorage.setItem("hm_tut", "1"); } else if (localStorage.getItem("hm_tut") == null) localStorage.setItem("hm_tut", "99"); } catch (e) { }
  setInterval(tutTick, 700);
  setInterval(() => {
    renderWallet();
    const w = $("#worth"); if (w && cur() === "assets") w.textContent = fmtE(worthNow());
    const c2 = $("#cash2"); if (c2 && cur() === "assets") c2.textContent = fmtE(liveCash());
    const f = $("#freein"); if (f) { const s = freeIn(); if (s <= 0 && cur() === "booster") renderBoosterPage(); else f.textContent = hm(s); }
  }, 1000);
  setInterval(() => refreshState().catch(() => { }), 60000);
  startRealtime(async (what, ch) => {   // ch : ce qui a changé sur la carte ({ full, cards, arr, sale }), voir refreshMap
    try {
      if (what === "poll") { const [, , c2] = await Promise.all([refreshState(), refreshHold(), refreshMap()]); ch = c2; }
      if (ch?.arr) updateArrFill();
      paintAll(); renderWallet();
      if (cur() === "paris" && ch?.arr) renderParis();
      if (cur() === "market" && ch?.sale) renderMarket();
    } catch (e) { console.warn(e); }
  });
  if (first) setTimeout(showWelcome, 600); else showHint();
}
boot();

// une nouvelle version du jeu est en ligne : en revenant sur un onglet resté au moins 30 s en arrière-plan, on recharge
// (sinon un vieil onglet garde l'ancien code face au nouveau serveur ; 21/10/2026)
const APP_V = ((document.querySelector('script[src*="/app/main.js"]')?.getAttribute("src") || "").match(/[?&]v=([\w-]+)/) || [])[1] || "";
let hiddenAt = 0;
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  const away = hiddenAt && Date.now() - hiddenAt >= 30000; hiddenAt = 0;
  if (!away || !APP_V || !started || document.querySelector("input:focus, textarea:focus")) return;
  try {
    const h = await (await fetch("/?nv=" + Date.now(), { cache: "no-store" })).text();
    const v = (h.match(/\/app\/main\.js\?v=([\w-]+)/) || [])[1];
    if (v && v !== APP_V && !document.hidden) location.reload();
  } catch (e) { }
});

// Accueil du nouveau joueur : ce qu'il a, et ce qu'il peut faire
function showWelcome() {
  const R = $("#reveal"); R.hidden = false; const p = ST.state.profile;
  R.innerHTML = `<div class="bstage"><div class="rays"></div><div class="welcome">
    <p class="eyebrow" style="color:#9FB4D6">Bienvenue à Paris</p>
    <h2>${esc(p.pseudo)}, Paris est à prendre</h2>
    <div class="wl"><span>🚶</span><div><b>Promenez-vous dans Paris</b><p>Touchez une rue : votre personnage y marche. Un immeuble libre à côté de vous ? Achetez-le.</p></div></div>
    <div class="wl"><span>💶</span><div><b>${fmtE(p.cash)} et ${p.welcome} boosters pour démarrer</b><p>Un booster, c'est 4 biens de Paris au hasard + 1 carte Chance.</p></div></div>
    <div class="wl"><span>🏛️</span><div><b>Devenez maire</b><p>Le plus gros propriétaire d'un arrondissement touche 8 % des loyers des autres.</p></div></div>
    <div class="bbtns"><button class="btn white block" data-w="open">Ouvrir mon premier booster</button><button class="btn glass block" data-w="map">Aller dans Paris d'abord</button></div>
  </div></div>`;
  R.onclick = e => { const b = e.target.closest("[data-w]"); if (!b) return; R.onclick = null; R.hidden = true; R.innerHTML = "";
    if (b.dataset.w === "open") openBooster("welcome"); else { go("map"); showHint(); } };
}

// iPhone (Safari ignore « user-scalable=no ») : on bloque le zoom de la page au pincement (le double toucher est bloqué par touch-action),
// sauf sur la carte qui gère son propre zoom
document.addEventListener("gesturestart", e => { if (!e.target.closest?.("#map")) e.preventDefault(); }, { passive: false });
window.addEventListener("scroll", () => { if (window.scrollX || window.scrollY) window.scrollTo(0, 0); });

// une erreur inattendue s'affiche en petit message au lieu d'un écran blanc (utile pour comprendre un bug sur téléphone)
window.addEventListener("error", e => { try { toast("Petit bug : " + String(e.message || "").slice(0, 120), "bad"); } catch (_) { } });
window.addEventListener("unhandledrejection", e => { const m = String(e.reason?.message || e.reason || ""); if (/fetch|abort|network/i.test(m)) return; try { toast("Petit bug : " + m.slice(0, 120), "bad"); } catch (_) { } });


// =====================================================================
//  Tutoriel en jouant : une bulle à la fois, au moment où la règle sert (20/10/2026 : plus de dé, on se promène)
//  1 acheter près de soi (ou marcher) · 2 la case · 3 après l'achat · 3.5 marcher · 4 les boosters · 5 les mairies · 99 fini
// =====================================================================
let tutShown = "", tutMv = -1;
// un point de la carte (un immeuble) où pointer la bulle ; null s'il n'est pas bien visible à l'écran
function tutPoint(ll) {
  if (!map || !ll) return null;
  const r = map.getContainer().getBoundingClientRect(), q = map.project(ll), x = r.left + q.x, y = r.top + q.y;
  if (x < 30 || x > innerWidth - 30 || y < 140 || y > innerHeight - 200) return null;
  let a = $("#tutpt"); if (!a) { a = document.createElement("i"); a.id = "tutpt"; a.setAttribute("aria-hidden", "true"); document.body.appendChild(a); }
  a.style.cssText = `position:fixed;left:${x - 1}px;top:${y - 1}px;width:2px;height:2px;pointer-events:none`;
  return "#tutpt";
}
function tutGet() { try { return +(localStorage.getItem("hm_tut") || 99); } catch (e) { return 99; } }
function tutSet(n) { try { localStorage.setItem("hm_tut", String(n)); } catch (e) { } tutTick(); }
function tutTick() {
  const st = tutGet(); let k = "", anchor = null, html = "", ok = false;
  const idle = cur() === "map" && $("#reveal").hidden && $("#onb").hidden && !moving && W.on;
  const caseOpen = panelKind === "land" && !landView;
  if (st === 1 && caseOpen) return tutSet(2);
  else if (st === 1 && idle && !panelKind) {
    const pt = W.near.length ? tutPoint(centerOf(W.near[0])) : null;   // la bulle pointe l'immeuble vert le plus proche
    if (pt) { k = "1b"; anchor = pt; html = "<b>Achetez près de vous 🏠</b>En vert : à vendre, à portée de main. Touchez-en un."; }
    else { k = "1w"; html = "<b>Touchez la carte 🚶</b>Votre personnage y marche. En vert près de vous : à vendre."; }
  }
  else if (st === 2 && caseOpen) {
    if (justBought) return tutSet(3);
    const g = landPos(), fr = g != null ? freeOf(g) : 0;
    k = "2" + (fr > 0 ? "f" : "x"); anchor = "#movebar .lb"; ok = true;
    html = fr > 0 ? "<b>Il est libre : achetez-le !</b>À crédit, vous ne payez qu'une petite partie maintenant : la banque prête le reste, remboursé tout seul par le loyer."
      : "<b>Tout est déjà pris ici</b>Promenez-vous : il y a des immeubles libres partout dans Paris.";
  }
  else if ((st === 2 || st === 2.5) && !panelKind && idle) return tutSet(3.5);
  else if (st === 2.5 && justBought && caseOpen) return tutSet(3);
  else if (st === 3 && panelKind === "land") { k = "3"; anchor = ".money"; ok = true; html = "<b>Bravo, c'est votre premier bien !</b>Il vous rapporte des loyers en continu, même quand vous n'êtes pas connecté. Touchez votre argent, ici, pour voir tout l'historique."; }
  else if (st === 3 && !panelKind && idle) return tutSet(3.5);
  else if (st === 3.5 && idle && !panelKind) {
    if (tutMv < 0) tutMv = W.mv; else if (W.mv > tutMv) return tutSet(4);
    k = "w"; ok = true; html = "<b>Promenez-vous 🚶</b>Touchez la carte : votre personnage y marche. Chaque km rapporte un salaire. Devant chez les autres, on paie un petit péage.";
  }
  else if (st === 4 && idle && !panelKind) { k = "4"; anchor = "#b-pack"; html = "<b>Ouvrez vos boosters</b>Chacun contient 4 vrais biens de Paris et 1 carte Chance. Vous en avez à ouvrir !"; }
  else if (st === 4 && (cur() === "booster" || !$("#reveal").hidden)) return tutSet(5);
  else if (st === 5 && idle && !panelKind) { k = "5"; anchor = null; ok = true; html = "<b>Dernière chose : devenez maire 👑</b>Le plus gros propriétaire d'un arrondissement en devient le maire et touche 8 % des loyers du quartier. Bonne conquête de Paris !"; }
  // affichage de la bulle
  let el = $("#coach");
  if (!k) { if (el) el.remove(); tutShown = ""; return; }
  if (!el) { el = document.createElement("div"); el.id = "coach"; document.body.appendChild(el);
    el.addEventListener("click", e => { if (e.target.closest("[data-tok]")) { const s2 = tutGet(); tutSet(s2 === 2 ? 2.5 : s2 === 3 ? 3.5 : s2 === 3.5 ? 4 : s2 === 5 ? 99 : s2); if (s2 === 2) el.remove(); } if (e.target.closest("[data-tskip]")) tutSet(99); }); }
  if (tutShown !== k) { tutShown = k; el.innerHTML = `<div class="ct">${html}</div><div class="cb">${ok ? `<button class="btn sm" data-tok>${st === 5 ? "C'est parti" : "OK"}</button>` : ""}<button class="lnk" data-tskip>Passer le tutoriel</button></div><i class="arr"></i>`; }
  // position : au-dessus ou en dessous de l'élément visé
  const a = anchor && document.querySelector(anchor), W0 = innerWidth, H = innerHeight, bw = Math.min(320, W0 - 24);
  el.style.width = bw + "px";
  if (!a || !a.getBoundingClientRect().width) { el.style.left = (W0 - bw) / 2 + "px"; el.style.top = Math.round(H * .3) + "px"; el.className = "noarr"; return; }
  const r = a.getBoundingClientRect(), below = r.top < H / 2, cx = r.left + r.width / 2;
  const left = Math.max(12, Math.min(W0 - bw - 12, cx - bw / 2)); el.style.left = left + "px";
  el.className = below ? "below" : "above"; el.style.setProperty("--ax", (cx - left) + "px");
  if (below) el.style.top = (r.bottom + 12) + "px"; else el.style.top = Math.max(8, r.top - el.offsetHeight - 12) + "px";
}
