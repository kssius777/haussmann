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
    if (SB) SB.auth.onAuthStateChange((ev, session) => { if (ev === "SIGNED_IN" && session && !started && $("#onb").hidden === false && onbStep === "login") { ME = session.user.id; afterLogin(); } });
    await currentUser();
    if (!ME) return showOnb("login");
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
  go("map"); renderWallet();
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
  if (first) { go("booster"); setTimeout(() => openBooster("welcome"), 350); }
}
boot();
