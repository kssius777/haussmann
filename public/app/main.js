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
    console.error(e); $("#loadmsg") && ($("#loadmsg").textContent = "Impossible de charger le jeu : " + e.message); $("#loading .ld-bar")?.remove();
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
  refreshOffers(); setInterval(() => { if (!document.hidden) refreshOffers(); }, 60000);   // (rien quand l'onglet est caché)
  try { initWorld(); } catch (e) { console.warn("monde", e); }   // Paris à pied (place.js) : on y entre dès que la carte est prête
  setTimeout(claimGift, 1500);
  try { if (first) { if (localStorage.getItem("hm_tut") == null) localStorage.setItem("hm_tut", "1"); localStorage.setItem("hm_hint4", "1"); } else if (localStorage.getItem("hm_tut") == null) localStorage.setItem("hm_tut", "99"); } catch (e) { }   // (« fini le dé » : seulement pour ceux qui l'ont connu)
  setInterval(tutTick, 700);
  setInterval(() => {
    renderWallet();
    const w = $("#worth"); if (w && cur() === "assets") w.textContent = fmtE(worthNow());
    const c2 = $("#cash2"); if (c2 && cur() === "assets") c2.textContent = fmtE(liveCash());
    const f = $("#freein"); if (f) { const s = freeIn(); if (s <= 0 && cur() === "booster") renderBoosterPage(); else f.textContent = hm(s); }
  }, 1000);
  startRealtime(async (what, ch) => {   // (son état, toutes les 60 s : par « poll », plus par un 2e minuteur qui tournait même onglet caché)   // ch : ce qui a changé sur la carte ({ full, cards, arr, sale }), voir refreshMap
    try {
      // ses biens : relus toutes les 5 min, ou tout de suite quand la carte dit qu'un des siens a changé (21/10/2026 :
      // avant, toute sa collection repartait chaque minute)
      if (what === "poll") { const [, , c2] = await Promise.all([refreshState(), Date.now() - (ST.holdAt || 0) > 300000 ? refreshHold() : null, refreshMap()]); ch = c2; }
      if (ch?.mine && Date.now() - (ST.holdAt || 0) > 3000) await Promise.all([refreshHold(), refreshState()]);
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
    <div class="wl"><span>🎈</span><div><b>Volez où vous voulez</b><p>Touchez un immeuble : votre montgolfière s'y pose. Libre ? Achetez-le.</p></div></div>
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
//  Tutoriel en jouant : une bulle à la fois, au moment où la règle sert (26/10/2026 : la montgolfière vole où l'on veut ; avant : le dé)
//  1 toucher un immeuble libre (en vert, tout près) · 1.5 « Y aller » · 2 la case · 3 après l'achat · 3.5 les km et le péage ·
//  4 les boosters · 5 les mairies · 99 fini
// =====================================================================
let tutShown = "", tutMv = -1, tutG = null, tutLL = null, tutCam = "";
// un point de la carte (un immeuble) où pointer la bulle ; null s'il n'est pas bien visible à l'écran
function tutPoint(ll) {
  if (!map || !ll) return null;
  const r = map.getContainer().getBoundingClientRect(), q = map.project(ll), x = r.left + q.x, y = r.top + q.y;
  if (x < 30 || x > innerWidth - 30 || y < 140 || y > innerHeight - 200) return null;
  let a = $("#tutpt"); if (!a) { a = document.createElement("i"); a.id = "tutpt"; a.setAttribute("aria-hidden", "true"); document.body.appendChild(a); }
  a.style.cssText = `position:fixed;left:${x - 1}px;top:${y - 1}px;width:2px;height:2px;pointer-events:none`;
  return "#tutpt";
}
// le premier immeuble à prendre : un immeuble de logements libre, près de sa montgolfière, en vert, et qu'on voit vraiment
// (26/10/2026 : la bulle montrait un immeuble caché sous sa propre montgolfière et sous son nom ; le joueur touchait là où
// pointait la flèche et rien ne se passait) ; la flèche pointe un endroit de l'immeuble qu'on touche vraiment (tutLL)
function tutMark(g) {
  if (tutG === g) return;
  if (tutG != null && mapReady && (!W.run || W.run.g !== tutG)) map.setFeatureState(Object.assign({ id: tutG }, BLD), { dst: 0 });
  tutG = g; if (g != null && mapReady) map.setFeatureState(Object.assign({ id: g }, BLD), { dst: 2 });
}
// ce qui cache la carte autour de sa montgolfière : son nom (en HTML) et la montgolfière elle-même (en 3D, dans la toile)
function tutAvoid(me) {
  const out = [], c = map.getContainer().getBoundingClientRect(), q = map.project([me.lon, me.lat]), l = me.el?.getBoundingClientRect();
  if (l && l.width) out.push({ left: l.left - 8, right: l.right + 8, top: l.top - 8, bottom: l.bottom + 8 });
  const s = window.people3d?.screen(me.id);
  if (s) { const w = Math.max(40, Math.abs(s.fy - s.hy) * .55); out.push({ left: c.left + Math.min(s.hx, s.fx) - w, right: c.left + Math.max(s.hx, s.fx) + w, top: c.top + Math.min(s.hy, s.fy) - 10, bottom: c.top + Math.max(q.y, s.fy) + 18 }); }
  else out.push({ left: c.left + q.x - 50, right: c.left + q.x + 50, top: c.top + q.y - 150, bottom: c.top + q.y + 18 });
  return out;
}
// un endroit de l'écran où l'on touche vraiment cet immeuble (pas derrière un autre, un arbre, sa montgolfière ou un repère)
function tutSpot(g, avoid) {
  const c = map.getContainer().getBoundingClientRect(), q = map.project(centerOf(g)), lay = ["bd", "rf", "trees"].filter(l => map.getLayer(l)); let best = null;
  for (let dy = -36; dy <= 36; dy += 9) for (let dx = -36; dx <= 36; dx += 9) {
    const x = q.x + dx, y = q.y + dy, X = c.left + x, Y = c.top + y;
    if (X < 40 || X > innerWidth - 40 || Y < 160 || Y > innerHeight - 230) continue;   // (la bulle doit tenir : tutPoint)
    if (avoid.some(r => X > r.left && X < r.right && Y > r.top && Y < r.bottom)) continue;
    const f = map.queryRenderedFeatures([x, y], { layers: lay })[0]; if (!f || f.layer.id === "trees" || f.id !== g) continue;
    if (document.elementFromPoint(X, Y) !== map.getCanvas()) continue;
    const d = Math.hypot(dx, dy); if (!best || d < best.d) best = { x, y, d };
  }
  return best;
}
function tutFree() {
  const me = meP(); if (!me || !mapReady || map.isMoving()) return tutG;
  const z = map.getCenter(), cam = [z.lng.toFixed(6), z.lat.toFixed(6), map.getZoom().toFixed(2), map.getBearing().toFixed(1), map.getPitch().toFixed(1), me.lon.toFixed(6), me.lat.toFixed(6)].join();
  if (tutG != null && freeOf(tutG) > 0 && cam === tutCam) return tutG;   // (rien n'a bougé : le même)
  tutCam = cam;
  const avoid = tutAvoid(me), q = map.project([me.lon, me.lat]);
  if (tutG != null && freeOf(tutG) > 0) { const s = tutSpot(tutG, avoid); if (s) { tutLL = map.unproject([s.x, s.y]); return tutG; } }
  const seen = new Set(), cands = [];
  for (const f of map.queryRenderedFeatures([[q.x - 180, q.y - 330], [q.x + 180, q.y + 60]], { layers: ["bd"] })) {
    const g = f.id; if (g == null || seen.has(g)) continue; seen.add(g);
    const c = card(g); if (!c || c.lk !== "l" || freeOf(g) <= 0) continue;
    const p = map.project(centerOf(g)), d = Math.hypot(p.x - q.x, p.y - q.y); if (d >= 60) cands.push([d, g]);
  }
  cands.sort((a, b) => a[0] - b[0]);
  let best = null; tutLL = null;
  for (const [, g] of cands.slice(0, 8)) { const s = tutSpot(g, avoid); if (s) { best = g; tutLL = map.unproject([s.x, s.y]); break; } }
  tutMark(best); return best;
}
function tutGet() { try { return +(localStorage.getItem("hm_tut") || 99); } catch (e) { return 99; } }
function tutSet(n) { try { localStorage.setItem("hm_tut", String(n)); } catch (e) { } tutTick(); }
function tutTick() {
  const st = tutGet(); let k = "", anchor = null, html = "", ok = false;
  const idle = cur() === "map" && $("#reveal").hidden && $("#onb").hidden && !moving && W.on;
  const caseOpen = panelKind === "land" && !landView, viewOpen = panelKind === "land" && landView && !!$("#movebar [data-lgo]");
  if (st !== 1) tutMark(null);
  if ((st === 1 || st === 1.5) && caseOpen) return tutSet(2);
  else if (st === 1 && viewOpen) return tutSet(1.5);
  else if (st === 1 && idle && !panelKind) {
    const g = tutFree(); anchor = g != null && tutLL ? tutPoint(tutLL) : null;
    k = g != null ? "1" : "1n"; html = g != null ? "<b>Touchez un immeuble</b>En vert : il est libre, vous pourrez l'acheter." : "<b>Touchez un immeuble</b>";
  }
  else if (st === 1.5 && viewOpen) { k = "1.5"; anchor = "#movebar [data-lgo]"; html = "<b>Volez-y !</b>Chaque km parcouru vous rapporte 20 000 €."; }
  else if (st === 1.5 && !panelKind && idle) return tutSet(1);
  else if (st === 2 && caseOpen) {
    if (justBought) return tutSet(3);
    const g = landPos(), fr = g != null ? freeOf(g) : 0;
    k = "2" + (fr > 0 ? "f" : "x"); anchor = "#movebar .lb"; ok = true;
    html = fr > 0 ? "<b>Il est libre : achetez-le !</b>À crédit, vous ne payez qu'une petite partie maintenant : la banque prête le reste, remboursé tout seul par le loyer."
      : "<b>Tout est déjà pris ici</b>Volez vers un autre immeuble : il y en a de libres partout dans Paris.";
  }
  else if ((st === 2 || st === 2.5) && !panelKind && idle) return tutSet(3.5);
  else if (st === 2.5 && justBought && caseOpen) return tutSet(3);
  else if (st === 3 && panelKind === "land") { k = "3"; anchor = ".money"; ok = true; html = "<b>Bravo, c'est votre premier bien !</b>Chaque jour, la banque vous verse son loyer, même quand vous n'êtes pas connecté. Touchez votre argent pour voir l'historique."; }
  else if (st === 3 && !panelKind && idle) return tutSet(3.5);
  else if (st === 3.5 && idle && !panelKind) {
    if (tutMv < 0) tutMv = W.flights || 0; else if ((W.flights || 0) > tutMv) return tutSet(4);
    k = "w"; anchor = "#b-main"; ok = true; html = "<b>Vos km se rechargent</b>+500 m toutes les 30 min. Survoler un immeuble rose (à un autre joueur) coûte un péage : vous le voyez avant de partir.";
  }
  // (26/10/2026 : ces deux bulles avaient sauté avec le passage au vol ; personne n'apprenait qu'on devient maire)
  else if (st === 4 && (cur() === "booster" || !$("#reveal").hidden)) return tutSet(5);
  else if (st === 4 && idle && !panelKind) {
    if (!packsReady()) return tutSet(5);   // (rien à ouvrir pour l'instant : on passe aux mairies)
    k = "4"; anchor = "#b-pack"; html = "<b>Ouvrez vos boosters</b>Chacun contient 4 vrais biens de Paris et 1 carte Chance. Vous en avez à ouvrir !";
  }
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
