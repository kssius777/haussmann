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
    await Promise.all([refreshHold(), refreshMap()]).catch(() => { }); renderWallet(); paintAll?.(); renderDice?.();
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
  go("map"); renderWallet(); initPawnUI(); renderDice();
  rpc("is_admin").then(v => { ST.admin = v === true; }).catch(() => { });
  refreshOffers(); setInterval(refreshOffers, 60000);
  try { initPlace(); } catch (e) { console.warn("monde", e); }   // le monde ouvert, essai dans le 7e (place.js)
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
  startRealtime(async what => {
    try {
      await refreshMap(); updateArrFill();
      if (what === "poll") await Promise.all([refreshState(), refreshHold()]);
      paintAll(); renderWallet();
      if (cur() === "paris" && what !== "poll") renderParis();
      if (cur() === "market" && what === "market") renderMarket();
    } catch (e) { console.warn(e); }
  });
  if (first) setTimeout(showWelcome, 600); else showHint();
}
boot();

// Accueil du nouveau joueur : ce qu'il a, et ce qu'il peut faire
function showWelcome() {
  const R = $("#reveal"); R.hidden = false; const p = ST.state.profile;
  R.innerHTML = `<div class="bstage"><div class="rays"></div><div class="welcome">
    <p class="eyebrow" style="color:#9FB4D6">Bienvenue à Paris</p>
    <h2>${esc(p.pseudo)}, Paris est à prendre</h2>
    <div class="wl"><span>🎲</span><div><b>Lancez le dé</b><p>Votre personnage marche dans les vraies rues. Il s'arrête sur un immeuble : s'il est libre, achetez-le.</p></div></div>
    <div class="wl"><span>💶</span><div><b>${fmtE(p.cash)} et ${p.welcome} boosters pour démarrer</b><p>Un booster, c'est 4 biens de Paris au hasard + 1 carte Chance.</p></div></div>
    <div class="wl"><span>🏛️</span><div><b>Devenez maire</b><p>Le plus gros propriétaire d'un arrondissement touche 8 % des loyers des autres.</p></div></div>
    <div class="bbtns"><button class="btn white block" data-w="open">Ouvrir mon premier booster</button><button class="btn glass block" data-w="map">Lancer le dé d'abord</button></div>
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
//  Tutoriel en jouant : une bulle à la fois, au moment où la règle sert
//  1 lancer le dé · 2 la case (libre / chez un autre / Chance) · 3 après l'achat · 4 les boosters · 5 les mairies
// =====================================================================
let tutShown = "";
function tutGet() { try { return +(localStorage.getItem("hm_tut") || 99); } catch (e) { return 99; } }
function tutSet(n) { try { localStorage.setItem("hm_tut", String(n)); } catch (e) { } tutTick(); }
function tutTick() {
  const st = tutGet(); let k = "", anchor = null, html = "", ok = false;
  const idle = cur() === "map" && $("#reveal").hidden && $("#onb").hidden && !moving;
  if (st === 1 && idle && destMarks.length) { if (destSel == null) { k = "1p"; anchor = ".dpin"; html = "<b>Où voulez-vous aller ?</b>Touchez une flèche : votre montgolfière y vole. Vert : à acheter. Rose : chez un joueur, vous payez son loyer."; } }
  else if (st === 1 && idle && !panelKind) { k = "1"; anchor = "#b-roll"; html = "<b>Lancez le dé 🎲</b>Puis choisissez sur la carte l'immeuble où votre montgolfière va se poser."; }
  else if (st === 1 && panelKind === "land" && !landView) tutSet(2);
  else if (st === 2 && panelKind === "land" && !landView && !moving) {
    if (justBought) return tutSet(3);
    const g = landPos(), L = lastLanding && lastLanding.card === g ? lastLanding : null, fr = g != null ? freeOf(g) : 0;
    k = "2" + (L?.toll > 0 ? "t" : L?.chance ? "c" : fr > 0 ? "f" : "x"); anchor = "#movebar .lb"; ok = true;
    html = L?.toll > 0 ? "<b>Chez un autre joueur</b>Quand vous tombez sur son immeuble, vous lui payez une journée de loyer. À vous d'acheter les immeubles où les autres passent !"
      : L?.chance ? "<b>Case Chance 🃏</b>Environ une case sur huit : une surprise, bonne ou mauvaise. Ici, l'immeuble reste à acheter s'il est libre."
      : fr > 0 ? "<b>Il est libre : achetez-le !</b>À crédit, vous ne payez qu'une petite partie maintenant : la banque prête le reste, remboursé tout seul par le loyer."
      : "<b>Tout est déjà pris ici</b>Relancez le dé pour trouver un immeuble libre.";
  }
  else if (st === 2 && !panelKind && idle) tutSet(4);
  else if (st === 2.5) { if (justBought && panelKind === "land") return tutSet(3); if (!panelKind && idle) return tutSet(4); }
  else if (st === 3 && panelKind === "land") { k = "3"; anchor = ".money"; ok = true; html = "<b>Bravo, c'est votre premier bien !</b>Il vous rapporte des loyers en continu, même quand vous n'êtes pas connecté. Touchez votre argent, ici, pour voir tout l'historique."; }
  else if (st === 3 && !panelKind && idle) tutSet(4);
  else if (st === 4 && idle && !panelKind) { k = "4"; anchor = "#b-pack"; html = "<b>Ouvrez vos boosters</b>Chacun contient 4 vrais biens de Paris et 1 carte Chance. Vous en avez à ouvrir !"; }
  else if (st === 4 && (cur() === "booster" || !$("#reveal").hidden)) tutSet(5);
  else if (st === 5 && idle && !panelKind) { k = "5"; anchor = null; ok = true; html = "<b>Dernière chose : devenez maire 👑</b>Le plus gros propriétaire d'un arrondissement en devient le maire et touche 8 % des loyers du quartier. Bonne conquête de Paris !"; }
  // affichage de la bulle
  let el = $("#coach");
  if (!k) { if (el) el.remove(); tutShown = ""; return; }
  if (!el) { el = document.createElement("div"); el.id = "coach"; document.body.appendChild(el);
    el.addEventListener("click", e => { if (e.target.closest("[data-tok]")) { const s2 = tutGet(); tutSet(s2 === 2 ? 2.5 : s2 === 3 ? 4 : s2 === 5 ? 99 : s2); if (s2 === 2) el.remove(); } if (e.target.closest("[data-tskip]")) tutSet(99); }); }
  if (tutShown !== k) { tutShown = k; el.innerHTML = `<div class="ct">${html}</div><div class="cb">${ok ? `<button class="btn sm" data-tok>${st === 5 ? "C'est parti" : "OK"}</button>` : ""}<button class="lnk" data-tskip>Passer le tutoriel</button></div><i class="arr"></i>`; }
  // position : au-dessus ou en dessous de l'élément visé
  const a = anchor && document.querySelector(anchor), W = innerWidth, H = innerHeight, bw = Math.min(320, W - 24);
  el.style.width = bw + "px";
  if (!a) { el.style.left = (W - bw) / 2 + "px"; el.style.top = Math.round(H * .3) + "px"; el.className = "noarr"; return; }
  const r = a.getBoundingClientRect(), below = r.top < H / 2, cx = r.left + r.width / 2;
  const left = Math.max(12, Math.min(W - bw - 12, cx - bw / 2)); el.style.left = left + "px";
  el.className = below ? "below" : "above"; el.style.setProperty("--ax", (cx - left) + "px");
  if (below) el.style.top = (r.bottom + 12) + "px"; else el.style.top = Math.max(8, r.top - el.offsetHeight - 12) + "px";
}
