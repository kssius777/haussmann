"use strict";
// =====================================================================
//  Le chat du Champ-de-Mars (20/10/2026, validé par le propriétaire sur maquette) :
//  on s'y promène avec son personnage (pseudo au-dessus), on parle, les bulles s'effacent après quelques secondes.
//  Le serveur signe tout (migration_chat.sql) : temps réel sur le canal privé « place:cdm:N », sinon chat_feed toutes les 2 s.
//  Entrée : tuile « Chat » en bas à gauche sur téléphone (miroir des boosters), 5e onglet sur ordinateur.
// =====================================================================

// ---- le personnage ------------------------------------------------------------
// g genre (0 homme, 1 femme) · s peau · h cheveux · c coupe · t haut (-1 = couleur du parti) · b bas · a accessoire
const LOOK = {
  skin: ["#F6D3B5", "#F2C9A0", "#E0AC80", "#C98E62", "#8D5A3B", "#5C3A26"],
  hair: ["#1A1A1A", "#3B2B20", "#6B4226", "#A0522D", "#E8B84A", "#EFE3C2", "#B4532A", "#9CA3AF"],   // noir, brun, châtain, auburn, blond, platine, roux, gris
  hairN: ["Noir", "Brun", "Châtain", "Auburn", "Blond", "Platine", "Roux", "Gris"],
  top: ["#0F172A", "#FFFFFF", "#DC2626", "#F59E0B", "#16A34A", "#2563EB", "#9333EA"],
  bot: ["#26324A", "#111827", "#3B5B92", "#C8B08A", "#F1F1EE"],
  cutN: ["Court", "Long", "Chignon", "Bouclé", "Carré", "Rasé"],
  accN: ["Rien", "Lunettes", "Lunettes de soleil", "Béret", "Casquette"]
};
const circ = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const CUTS = [
  "M7 9.5C7 4.8 10 2.5 14 2.5s7 2.3 7 7c-1.8-1.9-4.2-2.8-7-2.8s-5.2.9-7 2.8z",
  "M6.6 10.5C6.4 4.9 9.6 2.4 14 2.4s7.6 2.5 7.4 8.1v6.5c-1 .4-1.7.1-2-.6V9.2c-1.8-1.5-3.6-2.1-5.4-2.1S10.4 7.7 8.6 9.2v7.2c-.3.7-1 1-2 .6z",
  "M7 9.3C7 4.8 10 2.6 14 2.6s7 2.2 7 6.7c-2-1.4-4.4-2.1-7-2.1s-5 .7-7 2.1zM14 .2a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z",
  [[8.6, 6.4, 3.1], [11.8, 3.9, 3.4], [16.2, 3.9, 3.4], [19.4, 6.4, 3.1], [7, 9.6, 2.3], [21, 9.6, 2.3], [14, 3.2, 3]].map(c => circ(...c)).join(""),
  "M6.6 10.5C6.4 4.9 9.6 2.4 14 2.4s7.6 2.5 7.4 8.1v4.9h-2.3V9.2c-1.8-1.5-3.6-2.1-5.4-2.1S10.4 7.7 8.6 9.2v6.2H6.6z",
  "M7.2 8.6C7.6 4.9 10.3 3.1 14 3.1s6.4 1.8 6.8 5.5c-1.9-1.1-4.2-1.7-6.8-1.7s-4.9.6-6.8 1.7z"
];
// pas encore choisi : un personnage au hasard, toujours le même pour chacun, avec la couleur de son parti
function lookOf(id, look) {
  if (look && look.s != null) return Object.assign({ g: 0, b: 0, a: 0 }, look);
  let h = 7; for (const ch of String(id || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { g: (h >>> 13) % 2, s: h % 6, h: (h >>> 5) % 6, c: (h >>> 9) % 3, t: -1, b: 0, a: 0 };
}
const topColor = (L, party) => L.t >= 0 ? LOOK.top[L.t] : (PARTIES[party]?.c || "#64748B");
function accSVG(L, party) {
  const ink = "#1F2430";
  if (L.a === 1) return `<g fill="none" stroke="${ink}" stroke-width=".8"><circle cx="11.4" cy="11" r="2.1"/><circle cx="16.6" cy="11" r="2.1"/><path d="M13.5 11h1"/></g>`;
  if (L.a === 2) return `<g fill="${ink}"><rect x="8.9" y="9.6" width="4.4" height="2.8" rx="1.3"/><rect x="14.7" y="9.6" width="4.4" height="2.8" rx="1.3"/><rect x="13.1" y="10.3" width="1.8" height=".7"/></g>`;
  if (L.a === 3) return `<g fill="#1F2937"><ellipse cx="13.2" cy="4.4" rx="8.4" ry="2.7" transform="rotate(-8 13.2 4.4)"/><circle cx="13" cy="1.6" r=".9"/></g>`;
  if (L.a === 4) { const c = topColor(L, party); return `<path d="M7.3 7.8C7.6 4 10.4 2.3 14 2.3s6.4 1.7 6.7 5.5z" fill="${c}" stroke="rgba(15,23,42,.32)" stroke-width=".7"/><path d="M14 7.6h9.3c.7 0 .9.9.3 1.2-1.5.7-5.6.6-9.6.2z" fill="${c}" stroke="rgba(15,23,42,.32)" stroke-width=".6"/>`; }
  return "";
}
function avatarSVG(L, party, h) {
  L = Object.assign({ g: 0, b: 0, a: 0 }, L);
  const skin = LOOK.skin[L.s] || LOOK.skin[0], hair = LOOK.hair[L.h] || LOOK.hair[0], top = topColor(L, party), bot = LOOK.bot[L.b] || LOOK.bot[0];
  const o = 'stroke="rgba(15,23,42,.32)" stroke-width=".7"', f = L.g === 1;
  // femme : épaules un peu plus fines, une jupe ; homme : un pantalon
  const legs = f ? `<rect x="10" y="33" width="3.2" height="11" rx="1.6" fill="${skin}"/><rect x="14.8" y="33" width="3.2" height="11" rx="1.6" fill="${skin}"/>`
    : `<rect x="9" y="31" width="4.4" height="13" rx="2.2" fill="${bot}"/><rect x="14.6" y="31" width="4.4" height="13" rx="2.2" fill="${bot}"/>`;
  const skirt = f ? `<path d="M7.6 29.5h12.8l2.2 8.3c.1.5-.2.9-.7.9H6.1c-.5 0-.8-.4-.7-.9z" fill="${bot}" ${o}/>` : "";
  const tx = f ? 7.2 : 6.4, tw = f ? 13.6 : 15.2, ax = f ? 4 : 3.2, ax2 = f ? 20 : 20.6;
  return `<svg class="pp" width="${Math.round(h * 28 / 48)}" height="${Math.round(h)}" viewBox="0 0 28 48" aria-hidden="true">
<ellipse cx="14" cy="46" rx="9" ry="2.2" fill="rgba(15,23,42,.2)"/>
<g class="legs">${legs}<ellipse cx="11" cy="44.3" rx="3" ry="1.5" fill="#fff" ${o}/><ellipse cx="17" cy="44.3" rx="3" ry="1.5" fill="#fff" ${o}/></g>
<rect x="${ax}" y="18.5" width="4" height="12" rx="2" fill="${top}" ${o}/><rect x="${ax2}" y="18.5" width="4" height="12" rx="2" fill="${top}" ${o}/>
<circle cx="${ax + 2}" cy="31" r="1.9" fill="${skin}"/><circle cx="${ax2 + 2}" cy="31" r="1.9" fill="${skin}"/>
${skirt}<rect x="${tx}" y="17" width="${tw}" height="${f ? 14 : 16.5}" rx="5" fill="${top}" ${o}/>
<rect x="11.5" y="15.2" width="5" height="3.5" rx="1.5" fill="${skin}"/>
${L.c === 1 || L.c === 4 ? `<path d="${CUTS[L.c]}" fill="${hair}"/>` : ""}<circle cx="14" cy="10" r="7" fill="${skin}" ${o}/>
<path d="${CUTS[L.c] || CUTS[0]}" fill="${hair}"${L.c === 5 ? ' opacity=".85"' : ""}/>
<circle cx="11.4" cy="11" r="1" fill="#1F2430"/><circle cx="16.6" cy="11" r="1" fill="#1F2430"/>
${f ? '<path d="M10.2 9.7l-.7-.6M17.8 9.7l.7-.6" stroke="#1F2430" stroke-width=".6" stroke-linecap="round"/>' : ""}
<path d="M12 13.9c1.2.9 2.8.9 4 0" fill="none" stroke="#1F2430" stroke-width=".8" stroke-linecap="round"/>${accSVG(L, party)}</svg>`;
}
// l'éditeur : genre, peau, cheveux, coupe, haut, bas, accessoire (le profil et le chat s'en servent)
function lookEditorHTML(L, party) {
  L = lookOf(ME, L);
  const row = (lbl, k, items) => `<div class="lkrow"><span>${lbl}</span><div>${items.map(([v, inner, title]) => `<button class="lksw${L[k] === v ? " on" : ""}" data-look="${k}:${v}" aria-label="${esc(title)}" title="${esc(title)}">${inner}</button>`).join("")}</div></div>`;
  const dot = c => `<i style="background:${c}"></i>`, head = (extra) => `<svg viewBox="4 0 20 18" width="26" height="24">${extra}</svg>`;
  const cuts = CUTS.map((d, i) => [i, head(`${i === 1 || i === 4 ? `<path d="${d}" fill="${LOOK.hair[L.h]}"/>` : ""}<circle cx="14" cy="10" r="7" fill="${LOOK.skin[L.s]}"/><path d="${d}" fill="${LOOK.hair[L.h]}"/>`), LOOK.cutN[i]]);
  const accs = LOOK.accN.map((n, i) => [i, i ? head(`<circle cx="14" cy="10" r="7" fill="${LOOK.skin[L.s]}"/><path d="${CUTS[L.c]}" fill="${LOOK.hair[L.h]}"/>${accSVG(Object.assign({}, L, { a: i }), party)}`) : "<em>—</em>", n]);
  return `<div class="lked"><div class="lkprev">${avatarSVG(L, party, 96)}</div><div class="lkrows">
    ${row("Je suis", "g", [[0, "<em>Un homme</em>", "Un homme"], [1, "<em>Une femme</em>", "Une femme"]])}
    ${row("Peau", "s", LOOK.skin.map((c, i) => [i, dot(c), "Peau " + (i + 1)]))}
    ${row("Cheveux", "h", LOOK.hair.map((c, i) => [i, dot(c), LOOK.hairN[i]]))}
    ${row("Coupe", "c", cuts)}
    ${row("Haut", "t", [[-1, dot(PARTIES[party]?.c || "#64748B"), "Couleur de mon parti"], ...LOOK.top.map((c, i) => [i, dot(c), "Haut " + (i + 1)])])}
    ${row(L.g === 1 ? "Jupe" : "Pantalon", "b", LOOK.bot.map((c, i) => [i, dot(c), (L.g === 1 ? "Jupe " : "Pantalon ") + (i + 1)]))}
    ${row("En plus", "a", accs)}
  </div></div>`;
}
// un toucher sur une pastille : on change tout de suite, on enregistre juste après
let lookSaveT = 0;
function lookPick(btn, root) {
  const p = ST.state?.profile; if (!p) return;
  const [k, v] = btn.dataset.look.split(":"); const L = Object.assign({}, lookOf(ME, p.look), { [k]: +v });
  p.look = L; root.innerHTML = lookEditorHTML(L, p.party);
  const me = PL.people.get(PL.me); if (me) { me.look = L; drawPerson(me); renderPlaceHead(); }
  const pv = $("#p-detail .lkwrap"); if (pv && pv !== root) pv.innerHTML = lookEditorHTML(L, p.party);
  clearTimeout(lookSaveT); lookSaveT = setTimeout(() => rpc("set_look", { p_look: L }).catch(e => toast(e.message, "bad")), 500);
}
document.addEventListener("click", e => { const b = e.target.closest("[data-look]"); if (b) { const root = b.closest(".lkwrap"); if (root) lookPick(b, root); } });

// ---- la scène : la pelouse visible depuis la caméra (mesurée sur un téléphone 390 × 844) -------------------------
const STAGE = [[2.295329, 48.856525], [2.297382, 48.857658], [2.299729, 48.855394], [2.298311, 48.854611]];   // haut-gauche, haut-droite, bas-droite, bas-gauche
const KXP = 111320 * Math.cos(48.856 * Math.PI / 180), KYP = 110574, SPEED = 38;   // mètres par degré ; vitesse de marche (m/s, version jeu)
const placeCam = () => ({ center: [2.2966, 48.8569], zoom: innerWidth < 900 ? 16.45 : 16.95, pitch: 62, bearing: -40 });
// on peut zoomer et se déplacer un peu, sans quitter le Champ-de-Mars (20/10/2026, « je peux pas zoomer ni me déplacer a minima »)
const WALK = [[2.29193, 48.85769], [2.29199, 48.85778], [2.29554, 48.85983], [2.2969, 48.85904], [2.3035, 48.85413], [2.30247, 48.85023], [2.30138, 48.85096]];
const PLACE_BOUNDS = [[2.2885, 48.8488], [2.3070, 48.8612]];
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const stageAt = (u, v) => lerp2(lerp2(STAGE[0], STAGE[1], u), lerp2(STAGE[3], STAGE[2], u), v);
function inStage(x, y) {
  let ins = false; for (let i = 0, j = WALK.length - 1; i < WALK.length; j = i++) {
    const [xi, yi] = WALK[i], [xj, yj] = WALK[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

// ---- l'état -------------------------------------------------------------------
const PL = { on: false, room: 0, me: null, admin: false, people: new Map(), last: 0, seen: new Set(), ch: null, rt: false,
  poll: 0, ping: 0, list: 0, raf: 0, t0: 0, saved: null, busy: false, pend: null, feeding: false };
const MAPI = ["dragPan", "scrollZoom", "boxZoom", "dragRotate", "keyboard", "doubleClickZoom", "touchZoomRotate", "touchPitch"];
const MAP_FREE = new Set(["dragPan", "scrollZoom", "touchZoomRotate"]);   // pendant le chat : glisser et zoomer, pas tourner ni pencher
function lockMap(on, prev) {
  if (on) {
    const was = {}; for (const k of MAPI) { const h = map[k]; if (!h) continue; was[k] = h.isEnabled(); if (MAP_FREE.has(k)) h.enable(); else h.disable(); }
    map.touchZoomRotate?.disableRotation?.(); return was;
  }
  map.touchZoomRotate?.enableRotation?.();
  for (const k of MAPI) { const h = map[k]; if (!h) continue; if (!prev || prev[k]) h.enable(); else h.disable(); }
}
// les limites du Champ-de-Mars (posées une fois la caméra arrivée), puis celles d'avant en sortant
function placeLimits(on) {
  if (on) { const z = placeCam().zoom; PL.saved.lim = { min: map.getMinZoom(), max: map.getMaxZoom(), b: map.getMaxBounds() }; map.setMaxBounds(PLACE_BOUNDS); map.setMinZoom(z - 1.1); map.setMaxZoom(18.4); return; }
  const l = PL.saved?.lim; if (!l) return; map.setMaxBounds(l.b || null); map.setMinZoom(l.min); map.setMaxZoom(l.max); PL.saved.lim = null;
}

// ---- entrer, sortir -----------------------------------------------------------
async function openPlace() {
  if (PL.on || !map || !mapReady) return;
  if (typeof moving !== "undefined" && moving) return toast("Attendez la fin du trajet", "bad");
  if (tab !== "map") go("map");
  if (panelKind) { justBought = null; setMovebar(""); }
  if (typeof clearDest === "function" && document.body.classList.contains("picking")) clearDest();
  PL.on = true; PL.people.clear(); PL.seen.clear(); PL.last = 0;
  document.body.classList.add("inplace");
  PL.saved = { ctl: lockMap(true), cam: { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() } };
  window.pawn3d?.hide();
  buildPlaceUI();
  map.flyTo(Object.assign(placeCam(), { duration: 1100 }));
  const sp = stageAt(.15 + Math.random() * .7, .55 + Math.random() * .4);
  try {
    const j = await rpc("chat_join", { p_lon: sp[0], p_lat: sp[1] });
    if (!PL.on) { rpc("chat_leave").catch(() => { }); return; }
    PL.room = j.room; PL.me = j.me; PL.admin = !!j.admin; PL.last = j.last || 0;
    syncPeople(j.people); listen(); renderPlaceHead();
    PL.ping = setInterval(placePing, 25000); PL.list = setInterval(placeList, 30000);
    map.once("moveend", () => { if (PL.on) { placeLimits(true); placeLayout(); } });
  } catch (e) { toast(e.message, "bad"); closePlace(true); }
}
function closePlace(noLeave) {
  if (!PL.on) return; PL.on = false;
  if (!noLeave) rpc("chat_leave").catch(() => { });
  stopListen(); clearInterval(PL.ping); clearInterval(PL.list); cancelAnimationFrame(PL.raf); PL.raf = 0;
  for (const p of PL.people.values()) clearTimeout(p.bt);
  $("#place")?.remove(); $("#plsheet")?.remove();
  document.body.classList.remove("inplace");
  placeLimits(false); lockMap(false, PL.saved?.ctl);
  PL.people.clear(); PL.seen.clear();
  if (typeof placePawn === "function") placePawn(false);   // la montgolfière revient…
  if (PL.saved?.cam) map.flyTo(Object.assign({}, PL.saved.cam, { duration: 900 }));   // …et la carte comme avant le chat
}
async function rejoin() {
  if (!PL.on) return; const me = PL.people.get(PL.me), sp = me ? [me.lon, me.lat] : stageAt(.5, .8);
  try {
    const j = await rpc("chat_join", { p_lon: sp[0], p_lat: sp[1] });
    const moved = j.room !== PL.room; PL.room = j.room; PL.last = Math.max(PL.last, j.last || 0);
    syncPeople(j.people); if (moved) listen(); renderPlaceHead();
  } catch (e) { toast(e.message, "bad"); closePlace(true); }
}

// ---- recevoir : temps réel, sinon toutes les 2 s ----------------------------------
function listen() {
  stopListen();
  PL.poll = setInterval(placeFeed, 2000);
  if (LOCAL_MODE || !SB) return;
  const room = PL.room;
  (async () => {
    try { const { data } = await SB.auth.getSession(); if (data.session) SB.realtime.setAuth(data.session.access_token); } catch (e) { }
    if (!PL.on || PL.room !== room) return;
    PL.ch = SB.channel("place:cdm:" + room, { config: { private: true } })
      .on("broadcast", { event: "ev" }, ({ payload }) => placeEvent(payload))
      .subscribe(st => {
        if (!PL.on) return;
        if (st === "SUBSCRIBED") { PL.rt = true; clearInterval(PL.poll); PL.poll = setInterval(placeFeed, 10000); }
        else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") { PL.rt = false; clearInterval(PL.poll); PL.poll = setInterval(placeFeed, 2000); }
      });
  })();
}
function stopListen() { clearInterval(PL.poll); PL.poll = 0; if (PL.ch) { try { SB.removeChannel(PL.ch); } catch (e) { } PL.ch = null; } PL.rt = false; }
async function placeFeed() {
  if (!PL.on || PL.feeding) return; PL.feeding = true;
  try { const f = await rpc("chat_feed", { p_since: PL.last }); if (f.gone) await rejoin(); else for (const e of f.ev) placeEvent(e); }
  catch (e) { } finally { PL.feeding = false; }
}
async function placePing() { if (!PL.on) return; try { await rpc("chat_ping"); } catch (e) { if (/Revenez/.test(e.message)) rejoin(); } }
async function placeList() { if (!PL.on) return; try { syncPeople(await rpc("chat_people")); } catch (e) { } }
function placeEvent(e) {
  if (!PL.on || !e || PL.seen.has(e.e)) return;
  PL.seen.add(e.e); if (e.e > PL.last) PL.last = e.e;
  if (PL.seen.size > 600) PL.seen = new Set([...PL.seen].slice(-300));
  const id = e.u, d = e.d || {}, p = PL.people.get(id);
  if (e.k === "join") upsertPerson(d);
  else if (e.k === "move") { if (id === PL.me) return; if (p) walkTo(p, d.lon, d.lat); else placeList(); }
  else if (e.k === "say") { if (id === PL.me) return; if (p) say(p, d.t); else placeList(); }
  else if (e.k === "look") { if (p) { p.look = d.look; drawPerson(p); } }
  else if (e.k === "leave") removePerson(id);
  else if (e.k === "kick") {
    if (id === PL.me) { toast(d.h ? "Vous avez été banni du chat pour " + d.h + " h" : "Vous avez été banni du chat", "bad"); closePlace(true); }
    else removePerson(id);
  }
}

// ---- les gens -----------------------------------------------------------------
function syncPeople(list) {
  const ids = new Set((list || []).map(p => p.id));
  for (const d of list || []) upsertPerson(d);
  for (const id of [...PL.people.keys()]) if (!ids.has(id) && id !== PL.me) removePerson(id);
}
function upsertPerson(d) {
  if (!d?.id) return; let p = PL.people.get(d.id);
  if (!p) { p = { id: d.id, pseudo: d.pseudo, party: d.party, look: d.look, lon: d.lon, lat: d.lat, tl: d.lon, tla: d.lat, el: null, face: 1 }; PL.people.set(d.id, p); drawPerson(p); }
  else {
    p.pseudo = d.pseudo; p.party = d.party;
    if (JSON.stringify(p.look || null) !== JSON.stringify(d.look || null)) { p.look = d.look; drawPerson(p); }
    if (d.id !== PL.me) walkTo(p, d.lon, d.lat);
  }
  renderPlaceHead(); placeLayout();
}
function removePerson(id) { const p = PL.people.get(id); if (!p) return; clearTimeout(p.bt); p.el?.remove(); PL.people.delete(id); renderPlaceHead(); }
function drawPerson(p) {
  const L = $("#plL"); if (!L) return; const me = p.id === PL.me, L0 = lookOf(p.id, p.look);
  if (!p.el) { p.el = document.createElement("button"); p.el.className = "av" + (me ? " me" : ""); p.el.dataset.id = p.id; p.el.innerHTML = `<span class="avi"><span class="bub" hidden></span><span class="nm"></span>${me ? '<span class="ring"></span>' : ""}<span class="bd"></span></span>`; L.appendChild(p.el); }
  p.el.querySelector(".nm").innerHTML = `<i style="background:${PARTIES[p.party]?.c || "#94A3B8"}"></i>${esc(me ? "Vous" : p.pseudo || "?")}`;
  p.el.querySelector(".bd").innerHTML = avatarSVG(L0, p.party, 48);
  p.el.setAttribute("aria-label", me ? "Mon personnage" : (p.pseudo || "Joueur"));
  placeLayout();
}
function walkTo(p, lon, lat) { if (lon == null || lat == null) return; p.tl = lon; p.tla = lat; startWalk(); }
function startWalk() { if (!PL.raf) { PL.t0 = 0; PL.raf = requestAnimationFrame(placeTick); } }
function placeTick(ts) {
  PL.raf = 0; if (!PL.on) return;
  const dt = PL.t0 ? Math.min(.06, (ts - PL.t0) / 1000) : 0; PL.t0 = ts; let any = false;
  for (const p of PL.people.values()) {
    const dx = (p.tl - p.lon) * KXP, dy = (p.tla - p.lat) * KYP, d = Math.hypot(dx, dy);
    if (d > .4) {
      const st = Math.min(d, SPEED * dt), a = map.project([p.lon, p.lat]), b = map.project([p.tl, p.tla]);
      if (Math.abs(b.x - a.x) > 1) p.face = b.x < a.x ? -1 : 1;
      p.lon += dx / d * st / KXP; p.lat += dy / d * st / KYP; p.walk = true; any = true;
    } else { p.lon = p.tl; p.lat = p.tla; p.walk = false; }
  }
  placeLayout();
  if (any) PL.raf = requestAnimationFrame(placeTick);
}
// positions à l'écran : plus loin = plus petit
function placeLayout() {
  if (!PL.on || !map) return;
  const top = (map.project(STAGE[0]).y + map.project(STAGE[1]).y) / 2, bot = (map.project(STAGE[2]).y + map.project(STAGE[3]).y) / 2;
  const base = (innerWidth < 900 ? 1.45 : 1.75) * Math.max(.6, Math.min(1.45, Math.pow(2, (map.getZoom() - placeCam().zoom) * .6)));
  for (const p of PL.people.values()) {
    if (!p.el) continue; const s = map.project([p.lon, p.lat]), t = Math.max(0, Math.min(1, (s.y - top) / ((bot - top) || 1)));
    const k = base * (.62 + .45 * t);
    p.el.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px)`;
    p.el.style.setProperty("--k", k.toFixed(3)); p.el.style.setProperty("--f", p.face || 1);
    p.el.style.zIndex = 10 + Math.round(s.y);
    p.el.classList.toggle("walk", !!p.walk);
    if (p.el.querySelector(".bub:not([hidden])")) clampBubble(p);
  }
}
function say(p, t) {
  if (!p?.el || !t) return; const b = p.el.querySelector(".bub");
  b.textContent = t; b.hidden = false; b.classList.remove("out"); void b.offsetWidth; b.classList.add("pop");
  clampBubble(p); clearTimeout(p.bt);
  p.bt = setTimeout(() => { b.classList.add("out"); p.bt = setTimeout(() => { b.hidden = true; b.classList.remove("out", "pop"); }, 400); }, Math.min(9000, 3800 + t.length * 50));
}
function clampBubble(p) {
  const b = p.el.querySelector(".bub"); b.style.setProperty("--dx", "0px");
  const r = b.getBoundingClientRect(), m = 8; let dx = 0;
  if (r.left < m) dx = m - r.left; else if (r.right > innerWidth - m) dx = innerWidth - m - r.right;
  if (dx) b.style.setProperty("--dx", dx / (parseFloat(p.el.style.getPropertyValue("--k")) || 1) + "px");
}

// ---- l'écran ------------------------------------------------------------------
function buildPlaceUI() {
  $("#place")?.remove();
  const el = document.createElement("div"); el.id = "place";
  el.innerHTML = `<div id="plL"></div>
    <header class="plh"><button class="plx" data-plx aria-label="Quitter le Champ-de-Mars">${ICON.back}</button><div><b id="plt">Champ-de-Mars</b><small><i></i><span id="pln">…</span></small></div>
      <button class="plme" data-pllook aria-label="Mon personnage"></button></header>
    ${(() => { try { return localStorage.getItem("hm_plhint") ? "" : '<div class="plhint">Touchez la pelouse pour marcher</div>'; } catch (e) { return ""; } })()}
    <form class="plin" id="plin" autocomplete="off"><input id="plq" maxlength="120" placeholder="Dire quelque chose…" enterkeyhint="send" aria-label="Message"><button aria-label="Envoyer"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button></form>`;
  document.body.appendChild(el);
  el.addEventListener("click", e => {
    if (e.target.closest("[data-plx]")) return closePlace();
    if (e.target.closest("[data-pllook]")) return openLookSheet();
    const a = e.target.closest(".av"); if (a) { e.stopPropagation(); return a.dataset.id === PL.me ? openLookSheet() : openWho(a.dataset.id); }
  });
  $("#plin").addEventListener("submit", e => { e.preventDefault(); sendSay(); });
  const vv = window.visualViewport;
  if (vv && !PL.vvOn) { PL.vvOn = true; const f = () => { const kb = Math.max(0, innerHeight - vv.height - vv.offsetTop); $("#place")?.style.setProperty("--kb", kb + "px"); }; vv.addEventListener("resize", f); vv.addEventListener("scroll", f); }
}
function renderPlaceHead() {
  const n = $("#pln"), t = $("#plt"); if (!n) return;
  const k = PL.people.size; n.textContent = `${k} joueur${k > 1 ? "s" : ""} ici`;
  t.textContent = "Champ-de-Mars" + (PL.room > 1 ? " " + PL.room : "");
  const b = $("#place .plme"), p = ST.state?.profile; if (b && p) b.innerHTML = avatarSVG(lookOf(ME, p.look), p.party, 34);
}
function placeClick(e) {
  if (!PL.on) return; const ll = e.lngLat;
  if (!inStage(ll.lng, ll.lat)) return;
  const me = PL.people.get(PL.me); if (!me) return;
  walkTo(me, ll.lng, ll.lat);
  const h = $("#place .plhint"); if (h) { h.remove(); try { localStorage.setItem("hm_plhint", "1"); } catch (er) { } }
  PL.pend = [ll.lng, ll.lat]; if (!PL.busy) sendMove();
}
async function sendMove() {
  PL.busy = true;
  while (PL.pend && PL.on) { const [lo, la] = PL.pend; PL.pend = null; try { await rpc("chat_move", { p_lon: lo, p_lat: la }); } catch (e) { if (/Revenez/.test(e.message)) await rejoin(); } }
  PL.busy = false;
}
async function sendSay() {
  const q = $("#plq"), t = (q?.value || "").replace(/\s+/g, " ").trim(); if (!t) return;
  q.value = "";
  try { await rpc("chat_say", { p_text: t }); say(PL.people.get(PL.me), t.slice(0, 120)); }
  catch (e) { toast(e.message, "bad"); if (/Revenez/.test(e.message)) rejoin(); if (/Doucement/.test(e.message)) q.value = t; }
}
// toucher quelqu'un : son nom et son parti ; l'admin peut le bannir
function openWho(id) {
  const p = PL.people.get(id); if (!p) return; const pr = PARTIES[p.party];
  sheet(`<div class="plwho">${pr ? emblemSVG(p.party, 40) : ""}<div><b>${esc(p.pseudo || "?")}</b><span>${pr ? esc(pr.n) : "Sans parti"}</span></div></div>
    ${PL.admin ? `<div class="plban"><button class="btn block light" data-ban="24">Bannir 24 h</button><button class="btn block danger" data-ban="0">Bannir à vie</button></div>` : ""}`,
    async b => {
      const x = b.closest("[data-ban]"); if (!x) return;
      if (!x.dataset.sure) { x.dataset.sure = "1"; x.dataset.lbl = x.textContent; x.textContent = "Sûr ? Touchez encore"; setTimeout(() => { if (x.isConnected) { delete x.dataset.sure; x.textContent = x.dataset.lbl; } }, 3000); return; }
      try { await rpc("chat_ban", { p_user: id, p_hours: x.dataset.ban === "0" ? null : 24 }); toast(`${p.pseudo} est banni${x.dataset.ban === "0" ? " à vie" : " 24 h"}`, "good"); removePerson(id); closeSheet(); }
      catch (e) { toast(e.message, "bad"); }
    });
}
function openLookSheet() {
  const p = ST.state?.profile; if (!p) return;
  sheet(`<b class="plst">Mon personnage</b><div class="lkwrap">${lookEditorHTML(lookOf(ME, p.look), p.party)}</div>`);
}
function sheet(html, onClick) {
  closeSheet();
  const s = document.createElement("div"); s.id = "plsheet";
  s.innerHTML = `<div class="plsb"><button class="plsx" aria-label="Fermer">×</button>${html}</div>`;
  s.addEventListener("click", e => { if (e.target === s || e.target.closest(".plsx")) return closeSheet(); onClick?.(e.target); });
  document.body.appendChild(s);
}
function closeSheet() { $("#plsheet")?.remove(); }

function initPlace() {
  if (!map) return;
  map.on("click", placeClick);
  map.on("move", () => { if (PL.on) placeLayout(); });
  addEventListener("resize", () => { if (PL.on) placeLayout(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && PL.on) placePing(); });
}
