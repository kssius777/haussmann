"use strict";
// =====================================================================
//  Démarrage
// =====================================================================
let started = false;
async function boot() {
  try {
    initBackend();
    const [idx, base] = await Promise.all([getJSON(DATA + "index.json"), getJSON(DATA + "base.json")]);
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
    <h2>${esc(p.pseudo)}, voici de quoi démarrer</h2>
    <div class="wl"><span>💶</span><div><b>${fmtE(p.cash)} sur votre compte</b><p>Votre pion (marqué « Vous ») vous attend devant Notre-Dame. Les immeubles en vert, dans son cercle, sont à vendre au vrai prix du quartier.</p></div></div>
    <div class="wl"><span>🎲</span><div><b>Lancez le dé pour vous déplacer</b><p>Le dé va de 1 à 10. Choisissez ensuite une des destinations proposées : votre pion y marche, et vous achetez autour de lui. Chez un autre joueur, vous payez un péage ; une case violette, c'est une carte Chance. 10 lancers, un de plus toutes les 2 h.</p></div></div>
    <div class="wl"><span>🎁</span><div><b>${p.welcome} boosters offerts</b><p>Un booster, c'est une pochette surprise : 4 biens de Paris tirés au hasard (un appartement, parfois un étage ou un immeuble entier, voire un bout de monument) et 1 carte Chance. C'est la façon la moins chère de démarrer.</p></div></div>
    <div class="wl"><span>🏠</span><div><b>Vos biens rapportent tout seuls</b><p>Chaque bien verse un loyer en continu, même quand vous n'êtes pas là. Réinvestissez-le pour grandir et devenir maire de votre arrondissement.</p></div></div>
    <div class="bbtns"><button class="btn white block" data-w="open">Ouvrir mon premier booster</button><button class="btn glass block" data-w="map">D'abord, explorer la carte</button></div>
  </div></div>`;
  R.onclick = e => { const b = e.target.closest("[data-w]"); if (!b) return; R.onclick = null; R.hidden = true; R.innerHTML = "";
    if (b.dataset.w === "open") openBooster("welcome"); else { go("map"); showHint(); } };
}
