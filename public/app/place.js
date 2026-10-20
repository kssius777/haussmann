"use strict";
// =====================================================================
//  Le chat du Champ-de-Mars (20/10/2026, validé par le propriétaire sur maquette) :
//  on s'y promène avec son personnage (pseudo au-dessus), on parle, les bulles s'effacent après quelques secondes.
//  Le serveur signe tout (migration_chat.sql) : temps réel sur le canal privé « place:cdm:N », sinon chat_feed toutes les 2 s.
//  Entrée : tuile « Chat » en bas à gauche sur téléphone (miroir des boosters), 5e onglet sur ordinateur.
// =====================================================================

// ---- le personnage ------------------------------------------------------------
const LOOK = {
  skin: ["#F6D3B5", "#F2C9A0", "#E0AC80", "#C98E62", "#8D5A3B", "#5C3A26"],
  hair: ["#1A1A1A", "#3B2B20", "#6B4226", "#A0522D", "#C8A15A", "#E8D7B0"],
  top: ["#0F172A", "#FFFFFF", "#DC2626", "#F59E0B", "#16A34A", "#2563EB", "#9333EA"],
  cut: ["M7 9.5C7 4.8 10 2.5 14 2.5s7 2.3 7 7c-1.8-1.9-4.2-2.8-7-2.8s-5.2.9-7 2.8z",
    "M6.6 10.5C6.4 4.9 9.6 2.4 14 2.4s7.6 2.5 7.4 8.1v6.5c-1 .4-1.7.1-2-.6V9.2c-1.8-1.5-3.6-2.1-5.4-2.1S10.4 7.7 8.6 9.2v7.2c-.3.7-1 1-2 .6z",
    "M7 9.3C7 4.8 10 2.6 14 2.6s7 2.2 7 6.7c-2-1.4-4.4-2.1-7-2.1s-5 .7-7 2.1zM14 .2a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z"]
};
// pas encore choisi : un personnage au hasard, toujours le même pour chacun, avec la couleur de son parti
function lookOf(id, look) {
  if (look && look.s != null) return look;
  let h = 7; for (const ch of String(id || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { s: h % 6, h: (h >>> 5) % 6, c: (h >>> 9) % 3, t: -1 };
}
const topColor = (L, party) => L.t >= 0 ? LOOK.top[L.t] : (PARTIES[party]?.c || "#64748B");
function avatarSVG(L, party, h) {
  const skin = LOOK.skin[L.s] || LOOK.skin[0], hair = LOOK.hair[L.h] || LOOK.hair[0], top = topColor(L, party), o = 'stroke="rgba(15,23,42,.32)" stroke-width=".7"';
  return `<svg class="pp" width="${Math.round(h * 28 / 48)}" height="${Math.round(h)}" viewBox="0 0 28 48" aria-hidden="true">
<ellipse cx="14" cy="46" rx="9" ry="2.2" fill="rgba(15,23,42,.2)"/>
<g class="legs"><rect x="9" y="31" width="4.4" height="13" rx="2.2" fill="#26324A"/><rect x="14.6" y="31" width="4.4" height="13" rx="2.2" fill="#26324A"/>
<ellipse cx="11" cy="44.3" rx="3" ry="1.5" fill="#fff" ${o}/><ellipse cx="17" cy="44.3" rx="3" ry="1.5" fill="#fff" ${o}/></g>
<rect x="3.2" y="18.5" width="4.2" height="12" rx="2.1" fill="${top}" ${o}/><rect x="20.6" y="18.5" width="4.2" height="12" rx="2.1" fill="${top}" ${o}/>
<circle cx="5.3" cy="31" r="1.9" fill="${skin}"/><circle cx="22.7" cy="31" r="1.9" fill="${skin}"/>
<rect x="6.4" y="17" width="15.2" height="16.5" rx="5" fill="${top}" ${o}/>
<rect x="11.5" y="15.2" width="5" height="3.5" rx="1.5" fill="${skin}"/>
<circle cx="14" cy="10" r="7" fill="${skin}" ${o}/>
<path d="${LOOK.cut[L.c] || LOOK.cut[0]}" fill="${hair}"/>
<circle cx="11.4" cy="11" r="1" fill="#1F2430"/><circle cx="16.6" cy="11" r="1" fill="#1F2430"/>
<path d="M12 13.9c1.2.9 2.8.9 4 0" fill="none" stroke="#1F2430" stroke-width=".8" stroke-linecap="round"/></svg>`;
}
// l'éditeur : peau, cheveux, coupe, haut (le profil et le chat s'en servent)
function lookEditorHTML(L, party) {
  const row = (lbl, k, items) => `<div class="lkrow"><span>${lbl}</span><div>${items.map(([v, inner, title]) => `<button class="lksw${L[k] === v ? " on" : ""}" data-look="${k}:${v}" aria-label="${esc(title)}">${inner}</button>`).join("")}</div></div>`;
  const dot = c => `<i style="background:${c}"></i>`;
  const cuts = [0, 1, 2].map(i => [i, `<svg viewBox="4 0 20 18" width="26" height="24"><circle cx="14" cy="10" r="7" fill="${LOOK.skin[L.s]}"/><path d="${LOOK.cut[i]}" fill="${LOOK.hair[L.h]}"/></svg>`, ["Court", "Long", "Chignon"][i]]);
  return `<div class="lked"><div class="lkprev">${avatarSVG(L, party, 96)}</div><div class="lkrows">
    ${row("Peau", "s", LOOK.skin.map((c, i) => [i, dot(c), "Peau " + (i + 1)]))}
    ${row("Cheveux", "h", LOOK.hair.map((c, i) => [i, dot(c), "Cheveux " + (i + 1)]))}
    ${row("Coupe", "c", cuts)}
    ${row("Haut", "t", [[-1, dot(PARTIES[party]?.c || "#64748B"), "Couleur de mon parti"], ...LOOK.top.map((c, i) => [i, dot(c), "Haut " + (i + 1)])])}
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
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const stageAt = (u, v) => lerp2(lerp2(STAGE[0], STAGE[1], u), lerp2(STAGE[3], STAGE[2], u), v);
function inStage(x, y) {
  let ins = false; for (let i = 0, j = STAGE.length - 1; i < STAGE.length; j = i++) {
    const [xi, yi] = STAGE[i], [xj, yj] = STAGE[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

// ---- l'état -------------------------------------------------------------------
const PL = { on: false, room: 0, me: null, admin: false, people: new Map(), last: 0, seen: new Set(), ch: null, rt: false,
  poll: 0, ping: 0, list: 0, raf: 0, t0: 0, saved: null, busy: false, pend: null, feeding: false };
const MAPI = ["dragPan", "scrollZoom", "boxZoom", "dragRotate", "keyboard", "doubleClickZoom", "touchZoomRotate", "touchPitch"];
function lockMap(on, prev) {
  if (on) { const was = {}; for (const k of MAPI) { const h = map[k]; if (!h) continue; was[k] = h.isEnabled(); h.disable(); } return was; }
  for (const k of MAPI) { const h = map[k]; if (h && (!prev || prev[k])) h.enable(); }
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
    map.once("moveend", placeLayout);
  } catch (e) { toast(e.message, "bad"); closePlace(true); }
}
function closePlace(noLeave) {
  if (!PL.on) return; PL.on = false;
  if (!noLeave) rpc("chat_leave").catch(() => { });
  stopListen(); clearInterval(PL.ping); clearInterval(PL.list); cancelAnimationFrame(PL.raf); PL.raf = 0;
  for (const p of PL.people.values()) clearTimeout(p.bt);
  $("#place")?.remove(); $("#plsheet")?.remove();
  document.body.classList.remove("inplace");
  lockMap(false, PL.saved?.ctl);
  PL.people.clear(); PL.seen.clear();
  if (typeof placePawn === "function") placePawn(false);   // la montgolfière revient…
  if (PL.saved?.cam) map.flyTo(Object.assign({}, PL.saved.cam, { duration: 900 }));   // …et la carte comme avant le chat
  refreshChatCount();
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
  const base = innerWidth < 900 ? 1.45 : 1.75;
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

// ---- la pastille « N en ligne » sur l'entrée du chat -------------------------------
let chatCountT = 0;
async function refreshChatCount() {
  if (!ST.state?.profile) return;
  try {
    const n = await rpc("chat_count");
    for (const b of $$(".chatn")) { b.hidden = !(n > 0); b.textContent = n > 99 ? "99+" : n; }
  } catch (e) { }
}
function initPlace() {
  if (!map) return;
  map.on("click", placeClick);
  map.on("move", () => { if (PL.on) placeLayout(); });
  addEventListener("resize", () => { if (PL.on) { map.jumpTo(placeCam()); placeLayout(); } });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && PL.on) placePing(); });
  refreshChatCount(); clearInterval(chatCountT); chatCountT = setInterval(() => { if (!document.hidden && !PL.on) refreshChatCount(); }, 60000);
}
