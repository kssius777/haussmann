"use strict";
// =====================================================================
//  Le salon (25/10/2026, choix du propriétaire : « si tout le monde voit la map de Paris avec des mots partout, ça va être
//  n'importe quoi » ; « un salon chat comme avec le Champ-de-Mars, mais en plus vaste, avec un peu plus de capacité »).
//  Sur la carte de Paris, plus aucun mot. Le bouton « Salon » (« Parler » jusqu'au 26/10/2026) y emmène : le ciel de tout le
//  7e arrondissement et du Trocadéro (26/10/2026, « le lieu pour parler est trop petit » ; avant : du Trocadéro à l'École
//  militaire ; le 20/10 : le Champ-de-Mars seul), les montgolfières de ceux qui sont là (salles de 100, avant 80), leurs petits
//  mots en bulle (un par minute, 120 caractères) et les 5 derniers au-dessus de la barre. On arrive autour de la tour Eiffel ;
//  on fait glisser et on zoome (sans tourner ni pencher) ; toucher la carte : sa montgolfière y va.
//  « ← » ramène là où l'on était dans la partie. La pastille verte sur « Salon » : combien de joueurs y sont.
//  Serveur : migration_chat.sql (chat_join, chat_move, chat_say, chat_feed, chat_people, chat_ping, chat_leave, chat_count),
//  migration_salon.sql (salles de 100, un mot par minute, bannir), migration_salon_7e.sql (tout le 7e). Les montgolfières :
//  models.js (« s:» + id).
// =====================================================================

// le salon (26/10/2026, « le lieu pour parler est trop petit » ; choix du propriétaire : « tout le 7e ») : tout le 7e
// arrondissement (la tour Eiffel, le Champ-de-Mars, les Invalides, Orsay) et, de l'autre côté du pont d'Iéna, les jardins et le
// parvis du Trocadéro ; on arrive autour de la tour Eiffel (la bande du Champ-de-Mars, le salon d'avant : SPAWN, haut-gauche,
// haut-droite côté Trocadéro, bas-droite, bas-gauche côté École militaire)
const SPAWN = [[2.289499, 48.860658], [2.291770, 48.861962], [2.302233, 48.853962], [2.299963, 48.852659]];
const TROCA = [[2.2920, 48.8596], [2.2958, 48.8615], [2.2898, 48.8650], [2.2850, 48.8627]];
let SALON_P = null;
const salonPolys = () => SALON_P || (SALON_P = [(() => { const a = IDX.arr.find(x => x.n === 7); return a ? decodeRing(a.outline[0]) : SPAWN; })(), TROCA]);
const SALON_BOUNDS = [[2.2660, 48.8360], [2.3520, 48.8750]];   // (la caméra : le salon et autour, pour le voir en entier dézoomé)
const lerpLL = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const stageAt = (u, v) => lerpLL(lerpLL(SPAWN[0], SPAWN[1], u), lerpLL(SPAWN[3], SPAWN[2], u), v);
const inStage = (x, y) => salonPolys().some(P => inPolyLL(P, x, y));
// toucher plus loin que le salon : sa montgolfière va dans cette direction et s'arrête au bord (depuis où elle est, sinon la tour)
function stageClamp(x, y, from) {
  const o = from && inStage(from[0], from[1]) ? from : [2.2945, 48.8584]; let a = 0, b = 1;
  for (let i = 0; i < 20; i++) { const m = (a + b) / 2; if (inStage(o[0] + (x - o[0]) * m, o[1] + (y - o[1]) * m)) a = m; else b = m; }
  const m = a * .995; return [o[0] + (x - o[0]) * m, o[1] + (y - o[1]) * m];
}
// la caméra : depuis l'École militaire, la tour Eiffel au milieu, le Trocadéro au fond
const salonCam = () => ({ center: [2.29555, 48.85755], zoom: innerWidth < 700 ? 15.6 : innerWidth < 900 ? 15.8 : 16.05, pitch: 50, bearing: -41, padding: { top: 0, bottom: 0, left: 0, right: 0 } });

const S = { on: false, room: 0, me: null, admin: false, people: new Map(), last: 0, seen: new Set(), ch: null, rt: false, poll: 0, ping: 0, list: 0,
  raf: 0, t0: 0, ctl: null, pend: null, busy: false, feeding: false, log: [], saidAt: 0, hintT: 0, n: 0, bear: 0, dcT: 0 };
// au salon, la carte de la partie s'efface : les « ? » du jour, les destinations du dé, le trajet
const SALON_HIDE = ["wq-c", "wq-t", "dst-c", "wroute-c", "wroute", "wroute-e"];
function salonLayers(on) {
  for (const l of SALON_HIDE) if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", on ? "none" : "visible");
  if (!on) drawDst();   // (pendant le choix du dé, les « ? » restent cachés : drawDst le sait)
}
// au salon, on fait glisser et on zoome (sans tourner ni pencher), sans sortir du salon
const MAPI = ["dragPan", "scrollZoom", "boxZoom", "dragRotate", "keyboard", "doubleClickZoom", "touchZoomRotate", "touchPitch"];
function lockMap(on, prev) {
  if (on) {
    const was = { lim: { min: map.getMinZoom(), max: map.getMaxZoom(), b: map.getMaxBounds() } };
    for (const k of MAPI) { const h = map[k]; if (!h) continue; was[k] = h.isEnabled(); if (["dragPan", "scrollZoom", "touchZoomRotate"].includes(k)) h.enable(); else h.disable(); }
    map.touchZoomRotate?.disableRotation(); map.setMinZoom(innerWidth < 700 ? 13.6 : 14); map.setMaxZoom(18.2);   // (dézoomé : tout le 7e, les montgolfières encore en 3D)
    return was;
  }
  for (const k of MAPI) { const h = map[k]; if (h && (!prev || prev[k])) h.enable(); else if (h && prev && !prev[k]) h.disable(); }
  map.touchZoomRotate?.enableRotation();
  if (prev?.lim) { map.setMaxBounds(prev.lim.b); map.setMinZoom(prev.lim.min); map.setMaxZoom(prev.lim.max); }
}

// ---- entrer, sortir -----------------------------------------------------------
async function openSalon() {
  if (S.on || !W.on || !map || !mapReady || !canSay()) return;
  if (W.run || W.rolling || W.riding) return toast("Attendez que votre montgolfière soit posée", "bad");
  if (cur() !== "map") go("map");
  if (panelKind) { justBought = null; setMovebar(""); }
  closeSheet(); if (!$("#search").hidden) closeSearch(); hidePreview();
  S.on = true; S.people.clear(); S.seen.clear(); S.last = 0; S.log = [];
  W.away = true; for (const p of W.people.values()) pose(p); layoutPeople();   // les montgolfières de Paris attendent
  document.body.classList.add("insalon"); document.body.classList.remove("picking");   // (« picking » cache le nom « Vous »)
  S.ctl = lockMap(true); CAM.on = false; S.bear = map.getBearing(); salonLayers(true);
  buildSalonUI();
  map.stop(); map.flyTo(Object.assign(salonCam(), { duration: 1100, essential: true }));
  map.once("moveend", () => { if (S.on) map.setMaxBounds(SALON_BOUNDS); });   // (après le vol : sinon la caméra sauterait)
  const sp = stageAt(.1 + Math.random() * .8, .3 + Math.random() * .35);   // on arrive autour de la tour Eiffel
  try {
    const j = await rpc("chat_join", { p_lon: sp[0], p_lat: sp[1] });
    if (!S.on) { rpc("chat_leave").catch(() => { }); return; }
    S.room = j.room; S.me = j.me; S.admin = !!j.admin; S.last = j.last || 0;
    salonSync(j.people); salonListen(); salonHead(); salonPast();
    clearInterval(S.ping); clearInterval(S.list);
    S.ping = setInterval(salonPing, 25000); S.list = setInterval(salonList, 30000);
  } catch (e) {
    const m = e.message || ""; if (/banni/i.test(m)) { W.banned = true; }
    toast(m, "bad"); closeSalon(true);
  }
}
function closeSalon(noLeave) {
  if (!S.on) return; S.on = false;
  const left = noLeave ? Promise.resolve() : rpc("chat_leave").catch(() => { });
  salonStop(); clearInterval(S.ping); clearInterval(S.list); cancelAnimationFrame(S.raf); S.raf = 0; clearTimeout(S.hintT);
  for (const p of S.people.values()) { clearTimeout(p.bt); window.people3d?.remove("s:" + p.id); }
  S.people.clear(); S.seen.clear(); S.log = [];
  for (const id of ["#place", "#spl", "#wsay", "#wlog"]) $(id)?.remove();
  closeSheet();
  document.body.classList.remove("insalon"); if (W.opts.length) document.body.classList.add("picking");
  lockMap(false, S.ctl); S.ctl = null; salonLayers(false);
  W.away = false; for (const p of W.people.values()) pose(p); updateVisible();
  // retour dans la partie, avec le cap d'avant : un dé lancé avant le salon, ses destinations ; sinon sa montgolfière
  const me = meP(); CAM.on = true; CAM.userB = false;
  if (W.opts.length) { map.jumpTo({ bearing: S.bear }); showOpts(true); }
  else if (me) { const v = worldView(); map.flyTo({ center: [me.lon, me.lat], zoom: v.zoom, pitch: v.pitch, padding: v.padding, bearing: S.bear, duration: 1200, essential: true }); }
  renderDock(); left.then(salonCount);
}
async function salonRejoin() {
  if (!S.on) return; const me = S.people.get(S.me), sp = me ? [me.lon, me.lat] : stageAt(.5, .4);
  try {
    const j = await rpc("chat_join", { p_lon: sp[0], p_lat: sp[1] });
    const moved = j.room !== S.room; S.room = j.room; S.last = Math.max(S.last, j.last || 0);
    salonSync(j.people); if (moved) salonListen(); salonHead();
  } catch (e) { toast(e.message, "bad"); if (/banni/i.test(e.message || "")) W.banned = true; closeSalon(true); }
}

// ---- recevoir : temps réel, sinon toutes les 2 s ----------------------------------
function salonListen() {
  salonStop();
  S.poll = setInterval(salonFeed, 2000);
  if (LOCAL_MODE || !SB) return;
  const room = S.room;
  (async () => {
    try { const { data } = await SB.auth.getSession(); if (data.session) SB.realtime.setAuth(data.session.access_token); } catch (e) { }
    if (!S.on || S.room !== room) return;
    S.ch = SB.channel("place:cdm:" + room, { config: { private: true } })
      .on("broadcast", { event: "ev" }, ({ payload }) => salonEvent(payload))
      .subscribe(st => {
        if (!S.on) return;
        if (st === "SUBSCRIBED") { S.rt = true; clearInterval(S.poll); S.poll = setInterval(salonFeed, 10000); }
        else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") { S.rt = false; clearInterval(S.poll); S.poll = setInterval(salonFeed, 2000); }
      });
  })();
}
function salonStop() { clearInterval(S.poll); S.poll = 0; if (S.ch) { try { SB.removeChannel(S.ch); } catch (e) { } S.ch = null; } S.rt = false; }
async function salonFeed() {
  if (!S.on || S.feeding || document.hidden) return; S.feeding = true;
  try { const f = await rpc("chat_feed", { p_since: S.last }); if (f.gone) await salonRejoin(); else for (const e of f.ev) salonEvent(e); }
  catch (e) { } finally { S.feeding = false; }
}
async function salonPing() { if (!S.on) return; try { await rpc("chat_ping"); } catch (e) { if (/Revenez/.test(e.message || "")) salonRejoin(); } }
async function salonList() { if (!S.on) return; try { salonSync(await rpc("chat_people")); } catch (e) { } }
// en arrivant : les petits mots des 2 dernières minutes (ceux de gens encore là), dans le fil seulement
async function salonPast() {
  try {
    const f = await rpc("chat_feed", { p_since: 0 });
    for (const e of f.ev || []) { if (e.k !== "say" || e.e > S.last) continue; const p = S.people.get(e.u); if (p) S.log.push({ id: p.id, who: p.id === S.me ? "Vous" : p.pseudo || "?", party: p.party, t: String(e.d?.t || "").slice(0, 120) }); }
    salonLogRender();
  } catch (e) { }
}
function salonEvent(e) {
  if (!S.on || !e || S.seen.has(e.e)) return;
  S.seen.add(e.e); if (e.e > S.last) S.last = e.e;
  if (S.seen.size > 600) S.seen = new Set([...S.seen].slice(-300));
  const id = e.u, d = e.d || {}, p = S.people.get(id);
  if (e.k === "join") salonUpsert(d);
  else if (e.k === "move") { if (id === S.me) return; if (p) salonGo(p, +d.lon, +d.lat); else salonList(); }
  else if (e.k === "say") { if (id === S.me) return; if (p) { say(p, d.t); salonLogAdd(p, d.t); salonDeclutter(); } else salonList(); }
  else if (e.k === "look") { if (p) { p.look = d.look; window.people3d?.look("s:" + p.id, spec3d(p)); if (id === S.me) salonHead(); } }
  else if (e.k === "leave") salonRemove(id);
  else if (e.k === "kick") {
    if (id === S.me) { W.banned = true; toast(d.h ? `Vous êtes banni du chat pour ${d.h} h` : "Vous êtes banni du chat", "bad"); closeSalon(true); }
    else salonRemove(id);
  }
}

// ---- les montgolfières du salon ------------------------------------------------
// chacune flotte à sa hauteur (toujours la même pour chacun) : le ciel du salon a de la profondeur
const salonAlt = id => { let h = 3; for (const ch of String(id)) h = (h * 33 + ch.charCodeAt(0)) >>> 0; return .3 + (h % 100) / 100 * 1.5; };
function salonSync(list) {
  const ids = new Set((list || []).map(p => p.id));
  for (const d of list || []) salonUpsert(d);
  for (const id of [...S.people.keys()]) if (!ids.has(id) && id !== S.me) salonRemove(id);
}
function salonUpsert(d) {
  if (!d?.id) return; let p = S.people.get(d.id);
  if (!p) {
    p = { id: d.id, pseudo: d.pseudo, party: d.party, look: d.look, lon: +d.lon, lat: +d.lat, tl: +d.lon, tla: +d.lat, el: null, bt: 0, h: salonAlt(d.id) };
    S.people.set(d.id, p); window.people3d?.add("s:" + p.id, spec3d(p), p.id === S.me); salonLabel(p); salonPose(p);
  } else {
    p.pseudo = d.pseudo; p.party = d.party;
    if (JSON.stringify(p.look || null) !== JSON.stringify(d.look || null)) { p.look = d.look; window.people3d?.look("s:" + p.id, spec3d(p)); }
    salonLabel(p); if (d.id !== S.me) salonGo(p, +d.lon, +d.lat);
  }
  salonHead();
}
function salonRemove(id) {
  const p = S.people.get(id); if (!p || id === S.me) return;
  clearTimeout(p.bt); p.el?.remove(); window.people3d?.remove("s:" + id); S.people.delete(id); salonHead();
}
const salonPose = p => window.people3d?.pose("s:" + p.id, p.lon, p.lat, p.h, true);
function salonLabel(p) {
  let box = $("#spl"); if (!box) { box = document.createElement("div"); box.id = "spl"; map.getContainer().appendChild(box); box.addEventListener("click", salonWho); }
  const me = p.id === S.me;
  if (!p.el) { p.el = document.createElement("button"); p.el.className = "wp" + (me ? " me" : ""); p.el.dataset.id = p.id; p.el.innerHTML = '<span class="bub" hidden></span><span class="nm"></span>'; p.el.style.display = "none"; box.appendChild(p.el); }
  p.el.querySelector(".nm").innerHTML = me ? "Vous" : `<i style="background:${PARTIES[p.party]?.c || "#94A3B8"}"></i>${esc(p.pseudo || "?")}`;
  p.el.setAttribute("aria-label", me ? "Ma montgolfière" : (p.pseudo || "Joueur"));
}
function salonWho(e) {
  const b = e.target.closest(".wp"); if (!b) return; e.stopPropagation();
  if (b.dataset.id === S.me) openLookSheet(); else openWho(b.dataset.id);
}
// aller quelque part sur la pelouse : elle glisse (vite d'abord, puis doucement)
function salonGo(p, lon, lat) {
  if (!isFinite(lon) || !isFinite(lat)) return; p.tl = lon; p.tla = lat;
  if (!S.raf) { S.t0 = 0; S.raf = requestAnimationFrame(salonTick); }
}
function salonTick(ts) {
  S.raf = 0; if (!S.on) return;
  const dt = S.t0 ? Math.min(.06, (ts - S.t0) / 1000) : 0; S.t0 = ts; let any = false;
  for (const p of S.people.values()) {
    const dx = (p.tl - p.lon) * KXP, dy = (p.tla - p.lat) * KYP, d = Math.hypot(dx, dy);
    if (d < .5) { if (p.lon !== p.tl || p.lat !== p.tla) { p.lon = p.tl; p.lat = p.tla; salonPose(p); } continue; }
    const st = Math.min(d, Math.max(28, Math.min(160, d * 2.4)) * dt);
    p.lon += dx / d * st / KXP; p.lat += dy / d * st / KYP; salonPose(p); any = true;
  }
  if (any) S.raf = requestAnimationFrame(salonTick);
}
// après chaque image : les noms et les bulles suivent les montgolfières
function salonLayout() {
  if (!S.on || !map) return;
  const cw = map.getContainer().clientWidth, ch = map.getContainer().clientHeight;
  for (const p of S.people.values()) {
    const el = p.el; if (!el) continue;
    const s = window.people3d?.screen("s:" + p.id); let x, y, h = 0;
    if (s) { x = s.hx; y = s.hy; h = Math.max(10, s.fy - s.hy); } else { const q = map.project([p.lon, p.lat]); x = q.x; y = q.y; }
    if (x < -80 || x > cw + 80 || y < -60 || y > ch + 80) { if (el.style.display !== "none") el.style.display = "none"; continue; }
    if (el.style.display === "none") el.style.display = "";
    el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; el.style.setProperty("--h", h.toFixed(1) + "px");
    if (el.classList.contains("dot") !== !h) el.classList.toggle("dot", !h);
    el.style.zIndex = 10 + Math.round(y + h);
    if (p.bt) clampBubble(p);
    p.sx = x; p.sy = y;
  }
  clearTimeout(S.dcT); S.dcT = setTimeout(salonDeclutter, 120);
}
// au salon, beaucoup de monde : deux noms ne se chevauchent jamais (le sien d'abord, puis ceux qui parlent, puis les plus proches)
function salonDeclutter() {
  if (!S.on) return; const kept = [];
  const list = [...S.people.values()].filter(p => p.el && p.el.style.display !== "none" && p.sy != null)
    .sort((a, b) => (b.id === S.me) - (a.id === S.me) || !!b.bt - !!a.bt || b.sy - a.sy);
  for (const p of list) {
    const w = 26 + 7.2 * Math.min(18, (p.id === S.me ? 4 : (p.pseudo || "?").length)), r = { l: p.sx - w / 2, r: p.sx + w / 2, t: p.sy - 26, b: p.sy };
    const hit = kept.some(q => r.l < q.r && r.r > q.l && r.t < q.b && r.b > q.t);
    if (!hit) kept.push(r);
    if (p.el.classList.contains("hidenm") !== hit) p.el.classList.toggle("hidenm", hit);
  }
}
// toucher la carte : sa montgolfière y va (au bord du salon si l'on touche plus loin ; le serveur suit, une demande à la fois)
function salonTap(e) {
  const ll = e?.lngLat; if (!ll) return;
  const me = S.people.get(S.me); if (!me) return;
  const [lo, la] = inStage(ll.lng, ll.lat) ? [ll.lng, ll.lat] : stageClamp(ll.lng, ll.lat, [me.tl, me.tla]);
  salonGo(me, lo, la); $("#place .plhint")?.remove(); try { localStorage.setItem("hm_slhint", "1"); } catch (er) { }
  S.pend = [lo, la]; if (!S.busy) salonMove();
}
async function salonMove() {
  S.busy = true;
  while (S.pend && S.on) { const [lo, la] = S.pend; S.pend = null; try { await rpc("chat_move", { p_lon: lo, p_lat: la }); } catch (e) { if (/Revenez/.test(e.message || "")) await salonRejoin(); } }
  S.busy = false;
}

// ---- l'écran : en haut « ← Salon · N joueurs », en bas la barre pour un petit mot et les derniers mots --------------
function buildSalonUI() {
  for (const id of ["#place", "#wsay", "#wlog"]) $(id)?.remove();
  const el = document.createElement("div"); el.id = "place";
  let hint = ""; try { if (!localStorage.getItem("hm_slhint")) hint = '<div class="plhint">Touchez la carte pour y aller</div>'; } catch (e) { }
  el.innerHTML = `<header class="plh"><button class="plx" data-slx aria-label="Revenir dans la partie">${ICON.back}</button><div><b id="slt">Salon</b><small><i></i><span id="sln">…</span></small></div>
    <button class="plme" data-sllook aria-label="Ma montgolfière"></button></header>${hint}`;
  document.body.appendChild(el);
  el.addEventListener("click", e => {
    if (e.target.closest("[data-slx]")) return closeSalon();
    if (e.target.closest("[data-sllook]")) return openLookSheet();
  });
  const f = document.createElement("form"); f.id = "wsay"; f.autocomplete = "off";
  f.innerHTML = `<input id="wsq" maxlength="120" placeholder="Un petit mot…" enterkeyhint="send" aria-label="Un petit mot"><button class="go" aria-label="Envoyer"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>`;
  document.body.appendChild(f);
  f.addEventListener("submit", e => { e.preventDefault(); salonSay(); });
  f.querySelector(".go").addEventListener("pointerdown", e => e.preventDefault());   // (toucher « envoyer » ne ferme pas le clavier)
  $("#wsq").addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); if ($("#wsq").value.trim()) $("#wsq").blur(); else closeSalon(); } });
  salonHint();
}
function salonHead() {
  const n = $("#sln"), t = $("#slt"); if (!n) return;
  const k = S.people.size; n.textContent = `${k} joueur${k > 1 ? "s" : ""} ici`;
  t.textContent = "Salon" + (S.room > 1 ? " " + S.room : "");
  const b = $("#place .plme"), p = ST.state?.profile; if (b && p) b.innerHTML = balloonSVG(balloonSpec(lookOf(ME, p.look), p.party), 30);
}
// sa couleur ou son motif changent (« Ma montgolfière ») : au salon aussi
function salonLook(L) {
  if (!S.on) return; const me = S.people.get(S.me); if (!me) return;
  me.look = L; window.people3d?.look("s:" + me.id, spec3d(me)); salonHead();
}
// un mot par minute (choix du propriétaire, 21/10/2026 : « less is more ») : la barre affiche le temps qui reste
const salonWait = () => Math.max(0, Math.ceil((S.saidAt + 60000 - Date.now()) / 1000));
function salonHint() {
  const q = $("#wsq"); if (!q) return; const s = salonWait();
  q.placeholder = s ? `Prochain mot dans ${s} s` : "Un petit mot…";
  $("#wsay")?.classList.toggle("wait", s > 0);
  clearTimeout(S.hintT); if (s && S.on) S.hintT = setTimeout(salonHint, 1000);
}
async function salonSay() {
  const q = $("#wsq"), t = (q?.value || "").replace(/\s+/g, " ").trim(); if (!t) return;
  if (salonWait()) return toast(`Doucement : un message par minute (encore ${salonWait()} s).`, "bad");   // (le texte reste dans la barre)
  q.value = "";
  try {
    await rpc("chat_say", { p_text: t }); S.saidAt = Date.now();
    const me = S.people.get(S.me); if (me) { say(me, t.slice(0, 120)); salonLogAdd(me, t); }
    q.blur(); salonHint();
  } catch (e) {
    const m = e.message || "";
    if (/Revenez/.test(m)) { q.value = t; return salonRejoin(); }
    if (/banni/i.test(m)) { W.banned = true; closeSalon(true); }
    if (/Doucement/.test(m)) { q.value = t; const s = +(m.match(/encore (\d+) s/) || [])[1]; if (s) { S.saidAt = Date.now() - (60 - s) * 1000; salonHint(); } }
    toast(m, "bad");
  }
}
// le fil : les 5 derniers mots de la salle, au-dessus de la barre
function salonLogAdd(p, t) {
  if (!p || !t) return;
  S.log.push({ id: p.id, who: p.id === S.me ? "Vous" : p.pseudo || "?", party: p.party, t: String(t).slice(0, 120) });
  if (S.log.length > 40) S.log.splice(0, S.log.length - 40);
  salonLogRender();
}
function salonLogRender() {
  let el = $("#wlog"); const items = S.log.slice(-5);
  if (!S.on || !items.length) { if (el) el.hidden = true; return; }
  if (!el) { el = document.createElement("div"); el.id = "wlog"; el.setAttribute("aria-live", "polite"); document.body.appendChild(el); }
  el.innerHTML = items.map(m => `<p${m.id === S.me ? ' class="me"' : ""}><b>${m.id === S.me ? "" : `<i style="background:${PARTIES[m.party]?.c || "#94A3B8"}"></i>`}${esc(m.who)}</b>${esc(m.t)}</p>`).join("");
  el.hidden = false; el.scrollTop = el.scrollHeight;
}

// ---- la pastille verte sur « Salon » : combien de joueurs y sont -------------------------
async function salonCount() {
  if (!W.on || S.on || document.hidden || !ST.state?.profile) return;
  try { S.n = (await rpc("chat_count")) | 0; } catch (e) { return; }
  salonBadge();
}
function salonBadge() {
  const nb = $("#saynb"); if (!nb) return;
  const show = S.n > 0 && canSay() && !S.on, t = S.n > 99 ? "99+" : String(S.n);
  if (nb.hidden === show) nb.hidden = !show; if (nb.textContent !== t) nb.textContent = t;
}
function initSalon() {
  if (!map || initSalon.done) return; initSalon.done = true;
  map.on("render", salonLayout);
  addEventListener("resize", () => { if (S.on) salonLayout(); });   // (le clavier qui s'ouvre ne fait pas revenir la caméra)
  document.addEventListener("visibilitychange", () => { if (!document.hidden && S.on) salonPing(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && S.on && !e.target.closest?.("input,textarea") && !$("#plsheet")) closeSalon(); });
  salonCount(); setInterval(salonCount, 60000);
}
