"use strict";
// =====================================================================
//  Accès au serveur (Supabase) — toutes les règles sont côté base
// =====================================================================
let SB = null, ME = null;
const ST = {
  state: null, stAt: 0,                 // état du joueur + instant de réception
  mine: new Map(),                      // card -> [k...]
  mineParts: new Map(),                 // card -> n
  mort: new Map(),                      // "card:k" -> {a, t} hypothéqués (k=-1 parts)
  loan: new Map(),                      // card -> reste à rembourser du crédit immobilier
  fx: [],
  own: new Map(),                       // card -> {owners:[], n}
  sale: new Set(),                      // cards with a listing
  mayors: Array(20).fill(null),         // arr index -> {mayor, party, pseudo}
  market: null, feed: null, board: null
};

function initBackend() {
  if (!LOCAL_MODE) {
    SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
}

// --- auth ---------------------------------------------------------------
async function currentUser() {
  if (LOCAL_MODE) { ME = localStorage.getItem("hm_uid"); return ME; }
  const { data } = await SB.auth.getSession(); ME = data.session?.user?.id || null; return ME;
}
// retour après Google ou après le lien de confirmation par e-mail : on garde le lien cadeau dans l'adresse
// (si la personne finit l'inscription dans un autre navigateur, le cadeau la suit quand même)
function backURL() { let g = null; try { g = localStorage.getItem("hm_gift"); } catch (e) { } return location.origin + (g ? "/?gift=" + encodeURIComponent(g) : ""); }
async function signUp(email, password) {
  if (LOCAL_MODE) return localSignIn(email);
  const { data, error } = await SB.auth.signUp({ email, password, options: { emailRedirectTo: backURL() } });
  if (error) throw new Error(frErr(error.message));
  ME = data.session?.user?.id || null;
  return { needsConfirm: !data.session };
}
async function signIn(email, password) {
  if (LOCAL_MODE) return localSignIn(email);
  const { data, error } = await SB.auth.signInWithPassword({ email, password });
  if (error) throw new Error(frErr(error.message));
  ME = data.user.id; return {};
}
async function signInGoogle() {
  if (LOCAL_MODE) return localSignIn("google@test");
  const { error } = await SB.auth.signInWithOAuth({ provider: "google", options: { redirectTo: backURL() } });
  if (error) throw new Error(frErr(error.message));
}
// La connexion Google est-elle activée dans Supabase ? (sinon on propose de jouer sans compte)
let GOOGLE_READY = null;
async function googleReady() {
  if (GOOGLE_READY !== null) return GOOGLE_READY;
  if (LOCAL_MODE) return (GOOGLE_READY = false);
  try { const r = await fetch(SUPABASE_URL + "/auth/v1/settings", { headers: { apikey: SUPABASE_ANON } }); const j = await r.json(); GOOGLE_READY = !!j.external?.google; }
  catch (e) { GOOGLE_READY = false; }
  return GOOGLE_READY;
}
// Jouer sans compte : un compte invisible est créé et gardé sur cet appareil
async function guestSignIn() {
  let cred = null; try { cred = JSON.parse(localStorage.getItem("hm_guest") || "null"); } catch (e) { }
  if (!cred) {
    const id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, "");
    cred = { email: `joueur-${id.slice(0, 14)}@haussmann.app`, password: id + "Hm!" };
    try { localStorage.setItem("hm_guest", JSON.stringify(cred)); } catch (e) { }
    const r = await signUp(cred.email, cred.password);
    if (r.needsConfirm) throw new Error("Le mode sans compte nécessite de désactiver la confirmation d'e-mail dans Supabase.");
    return r;
  }
  return signIn(cred.email, cred.password);
}
async function signOut() {
  if (LOCAL_MODE) localStorage.removeItem("hm_uid"); else await SB.auth.signOut();
  try { localStorage.removeItem("hm_guest"); } catch (e) { }
  location.reload();
}
async function localSignIn(email) {
  const r = await fetch("/auth", { method: "POST", body: JSON.stringify({ email }) });
  const j = await r.json(); ME = j.id; localStorage.setItem("hm_uid", ME); return {};
}
function frErr(m) {
  if (/Invalid login/i.test(m)) return "E-mail ou mot de passe incorrect.";
  if (/already registered/i.test(m)) return "Un compte existe déjà avec cet e-mail : connectez-vous.";
  if (/Password should be/i.test(m)) return "Le mot de passe doit faire au moins 6 caractères.";
  if (/Email not confirmed/i.test(m)) return "Confirmez d'abord votre e-mail (lien reçu par mail).";
  if (/rate limit/i.test(m)) return "Trop de tentatives, réessayez dans un moment.";
  return m;
}

// --- appels -------------------------------------------------------------
async function rpc(fn, args = {}) {
  for (let t = 0; t < 3; t++) {
    try {
      if (LOCAL_MODE) {
        const r = await fetch("/rpc/" + fn, { method: "POST", headers: { "X-User": ME || "" }, body: JSON.stringify(args) });
        const txt = await r.text();
        if (!r.ok) throw new Error(txt);
        return JSON.parse(txt);
      }
      const { data, error } = await SB.rpc(fn, args);
      if (error) throw new Error(error.message);
      return data;
    } catch (e) {
      const m = String(e.message || e);
      if (/deadlock|could not serialize|Failed to fetch|NetworkError/i.test(m) && t < 2) { await sleep(200 + t * 300); continue; }
      throw new Error(m.replace(/^.*?ERROR:\s*/, "").split("\n")[0]);
    }
  }
}

function setState(s) { if (s) { ST.state = s; ST.stAt = performance.now(); } return s; }
const P = () => ST.state?.profile;
function liveCash() {
  const s = ST.state; if (!s?.profile) return 0;
  return s.profile.cash + netRate() * (performance.now() - ST.stAt) / 864e5;
}
// loyers qui arrivent vraiment dans la trésorerie (après la part qui rembourse les crédits)
function netRate() { const s = ST.state; return Math.max(0, (s?.rate || 0) - (s?.loan_rate || 0));
}
async function refreshState() { return setState(await rpc("state")); }
async function refreshHold() {
  const h = await rpc("my_holdings");
  ST.mine = new Map(); ST.mineParts = new Map(); ST.mort = new Map(); ST.loan = new Map();
  for (const [c, k, m, t, ln] of h.lots) { if (!ST.mine.has(c)) ST.mine.set(c, []); ST.mine.get(c).push(k); if (m) ST.mort.set(c + ":" + k, { a: +m, t }); if (ln) ST.loan.set(c, (ST.loan.get(c) || 0) + +ln); }
  for (const [c, n, m, t, ln] of h.parts) { ST.mineParts.set(c, n); if (m) ST.mort.set(c + ":-1", { a: +m, t }); if (ln) ST.loan.set(c, (ST.loan.get(c) || 0) + +ln); }
  for (const ks of ST.mine.values()) ks.sort((a, b) => a - b);
  ST.fx = h.fx || [];
  await ensureCards([...ST.mine.keys(), ...ST.mineParts.keys()]);
}
async function refreshMap() {
  const m = await rpc("map_state");
  ST.own = new Map();
  for (const [c, owners, n, party] of m.lots) ST.own.set(c, { owners, n: +n, party });   // party : le parti qui en possède le plus (ruban des cartes)
  for (const [c, owners, n, party] of m.parts) { const o = ST.own.get(c); if (o) { o.owners = [...new Set([...o.owners, ...owners])]; o.parts = +n; o.party = o.party || party; } else ST.own.set(c, { owners, n: 0, parts: +n, party }); }
  ST.sale = new Set(m.sale || []);
  ST.mayors = Array(20).fill(null);
  for (const [arr, mayor, party, pseudo] of m.arr) if (mayor) ST.mayors[arr - 1] = { mayor, party, pseudo };
}
async function refreshAll() { await Promise.all([refreshState(), refreshHold(), refreshMap()]); }

// Mes biens, regroupés par immeuble
function holdings() {
  const out = [];
  for (const [g, ks] of ST.mine) { const c = card(g); if (c) out.push({ g, c, ks, n: 0 }); }
  for (const [g, n] of ST.mineParts) { const c = card(g); if (c) out.push({ g, c, ks: [], n }); }
  return out;
}
const unitsOf = h => h.n || h.ks.length;
const fullTitle = h => h.c.lk !== "p" && h.ks.length === h.c.lots && h.c.lots > 1;
function fullFloor(c, ks, k) { if (c.lk !== "l") return false; const f = floorOfLot(c, k), fl = lotsOfFloor(c, f); return fl.length > 1 && fl.every(x => ks.includes(x)); }
// estimation locale du loyer de base d'un bien (les effets de parti et d'événement sont calculés par le serveur)
function baseRent(h) {
  if (h.n) return h.c.rent * h.n;
  let r = 0; for (const k of h.ks) { if (ST.mort.has(h.g + ":" + k)) continue; r += h.c.rent * (fullTitle(h) ? 1.6 : fullFloor(h.c, h.ks, k) ? 1.25 : 1); } return r;
}

// --- temps réel ---------------------------------------------------------
let rtT = null;
function startRealtime(onChange) {
  const bump = (what) => { clearTimeout(rtT); rtT = setTimeout(() => onChange(what), 700); };
  if (LOCAL_MODE) { setInterval(() => bump("poll"), 8000); return; }
  SB.channel("hm-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "lots" }, () => bump("map"))
    .on("postgres_changes", { event: "*", schema: "public", table: "parts" }, () => bump("map"))
    .on("postgres_changes", { event: "*", schema: "public", table: "listings" }, () => bump("market"))
    .on("postgres_changes", { event: "*", schema: "public", table: "arr_state" }, () => bump("map"))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "news" }, () => bump("feed"))
    .subscribe();
  setInterval(() => bump("poll"), 60000);
}

const liftCost = m => Math.round(m.a * (1 + 0.005 * (Date.now() - new Date(m.t).getTime()) / 864e5));
function packsReady() { const s = ST.state; if (!s?.profile) return 0; return (s.profile.welcome || 0) + (s.free_in <= 0 ? 1 : 0); }
function freeIn() { const s = ST.state; if (!s) return 0; return Math.max(0, s.free_in - (performance.now() - ST.stAt) / 1000); }
