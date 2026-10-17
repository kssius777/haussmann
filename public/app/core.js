"use strict";
// =====================================================================
//  HAUSSMANN — constantes, données statiques, utilitaires
// =====================================================================
const SUPABASE_URL = "https://fmqixxakhphkijtsyeqd.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtcWl4eGFraHBoa2lqdHN5ZXFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MzA1ODAsImV4cCI6MjEwNzIwNjU4MH0.DbX0oidMAdRe_JF2RDx2VwPJ6anAZaHw2nZKpAU42rw";
const LOCAL_MODE = new URLSearchParams(location.search).has("local") || location.hostname === "localhost" || location.hostname === "127.0.0.1";

const RAR = {
  C: { n: "Commune",     l: "C", c: "#8B9099", frame: "#8B9099", roof: "#E3E8EE", body: "#FFFFFF", w: 58 },
  U: { n: "Peu commune", l: "U", c: "#2E9E6A", frame: "#2E9E6A", roof: "#E3E8EE", body: "#FFFFFF", w: 27 },
  R: { n: "Rare",        l: "R", c: "#2F6BE0", frame: "#2F6BE0", roof: "#C9D8F5", body: "#F1F5FD", w: 11 },
  L: { n: "Légendaire",  l: "L", c: "#C9921A", frame: "linear-gradient(140deg,#F6D67A,#C08A17 40%,#F7DE8F 60%,#B07A10)", roof: "#F0D48A", body: "#FBF2DC", w: 3.4 },
  M: { n: "Mythique",    l: "M", c: "#8B3FD9", frame: "linear-gradient(140deg,#F2B3FF,#7FD4FF 35%,#B9F5C9 55%,#FFC7A1 75%,#C59BFF)", roof: "#D9B8F5", body: "#F4EAFD", w: 0.6 }
};
const ORDER = "MLRUC";
const USE = { res: "Résidentiel", ind: "Immeuble", com: "Commerces & services", ann: "Annexe", rel: "Lieu de culte", spo: "Sport", indus: "Industriel", agr: "Agricole" };

// Partis, présentés de gauche à droite (noms fictifs). Mêmes règles pour tous :
// le maire touche 8 % des loyers de son arrondissement, les membres du parti du maire y gagnent +10 %,
// et chaque parti protège ses membres contre quelques cartes malus (risques équivalents).
const PARTIES = {
  poing:   { n: "Poing Levé",       side: "Extrême gauche",  c: "#D32F2F", motto: "Le toit est un droit.", pitch: "Le logement n'est pas une marchandise.", shield: ["greve", "amende"], power: "−50 % de loyer chez les autres", powerTxt: "Quand vous tombez chez un autre joueur, vous payez moitié moins de loyer. Exemple : 10 000 € → 5 000 €." },
  tendue:  { n: "Gauche Unie",      side: "Gauche",           c: "#E5679A", motto: "Ensemble, chez nous.", pitch: "Solidarité et services publics.",        shield: ["notaire", "ravalement"], power: "Salaire doublé", powerTxt: "Chaque lancer de dé vous rapporte 40 000 € au lieu de 20 000 €." },
  milieu:  { n: "Juste Milieu",     side: "Centre",           c: "#F2A33A", motto: "En toute mesure.", pitch: "Entreprendre, réformer, rassembler.",    shield: ["fonciere", "degat"], power: "Ventes sans commission", powerTxt: "Quand vous vendez (Marché ou offre de rachat), vous touchez 100 % du prix au lieu de 95 %." },
  valeurs: { n: "Droite Libre",     side: "Droite",           c: "#3E7BDC", motto: "Libre d'entreprendre.", pitch: "Propriété, mérite et tradition.",        shield: ["fisc", "termites", "ascenseur"], power: "Crédit facile", powerTxt: "Apport de 5 % au lieu de 10 %, et 50 % de capacité d'emprunt en plus. Exemple : un bien à 1 M€ = 50 000 € d'apport." },
  rempart: { n: "Rempart National", side: "Extrême droite", c: "#1E2B5E", motto: "Tenir la ville.", pitch: "Sécurité, ordre et souveraineté.",       shield: ["cambriolage", "squat"], power: "+50 % de loyer chez vous", powerTxt: "Quand un joueur tombe chez vous, il vous paie 50 % de loyer en plus. Exemple : 10 000 € → 15 000 €." }
};
const downRate = () => ST.state?.profile?.party === "valeurs" ? .05 : .1;   // Droite Libre : apport de 5 %
const PARTY_ORDER = ["poing", "tendue", "milieu", "valeurs", "rempart"];
const MAYOR_TAX = 8, MEMBER_BONUS = 10;
// Blasons des partis (écusson + emblème blanc)
const EMBLEM = {
  poing: '<path d="M8.6 10.2V6.6a1.1 1.1 0 012.2 0v3.2V5.4a1.1 1.1 0 012.2 0v4.4V6a1.1 1.1 0 012.2 0v4.2V7.6a1.1 1.1 0 012.2 0v5.2c0 2.6-1.6 4.4-4 4.6v2.8h-4v-3c-1.6-.7-2.6-2.1-2.6-4v-1.6l-1.2-1.2a1.05 1.05 0 011.5-1.5z"/>',
  tendue: '<circle cx="12" cy="8.6" r="3.4"/><path d="M12 5.2c1.8 1 1.8 3.6 0 4.4-1.8-.8-1.8-3.4 0-4.4z" fill="#000" fill-opacity=".18"/><path d="M8.2 9.2c0 3 1.7 4.4 3.8 4.4s3.8-1.4 3.8-4.4c-.9 1.2-2.2 1.8-3.8 1.8s-2.9-.6-3.8-1.8z"/><path d="M11.4 13.4h1.2V20h-1.2z"/><path d="M12.4 17c1.6-2 3.6-2.2 4.4-1.8-.6 1.8-2.4 2.6-4.4 2.4zM11.6 15.8c-1.4-1.6-3-1.8-3.8-1.4.6 1.5 2 2.2 3.8 2z"/>',
  milieu: '<path d="M11.3 4.5h1.4v13.3h-1.4z"/><path d="M8 19.2h8v1.4H8z"/><path d="M5 7.4h14v1.3H5z"/><circle cx="12" cy="5" r="1.3"/><path d="M6.6 8.7l-2.6 5.2h5.2zM17.4 8.7l-2.6 5.2h5.2z" fill="none" stroke="#fff" stroke-width="1.1"/><path d="M3.8 13.9h5.6a2.8 1.8 0 01-5.6 0zM14.6 13.9h5.6a2.8 1.8 0 01-5.6 0z"/>',
  valeurs: '<path d="M12 7.2c.9 0 1.6.7 1.6 1.6 0 .4-.1.7-.3 1l1.9 1.2 5.3-4.3-1.6 4.6 2.4-.6-3.6 3.6-3.3.3-.8 2.2 1.4 3.6-3-1.4-3 1.4 1.4-3.6-.8-2.2-3.3-.3L2.7 10.7l2.4.6-1.6-4.6 5.3 4.3 1.9-1.2c-.2-.3-.3-.6-.3-1 0-.9.7-1.6 1.6-1.6z"/><path d="M12.9 8.4l1.6.4-1.3.6z" fill="#000" fill-opacity=".25"/>',
  rempart: '<path d="M6.5 20V9.5h-1V5.8h2.1v1.6h1.6V5.8h1.7v1.6h2.2V5.8h1.7v1.6h1.6V5.8h2.1v3.7h-1V20z"/><path d="M10.3 20v-3.3a1.7 1.7 0 013.4 0V20z" fill="#000" fill-opacity=".3"/><path d="M8.6 11.6h1.4v2.4H8.6zM14 11.6h1.4v2.4H14z" fill="#000" fill-opacity=".3"/>'
};
function emblemSVG(k, size = 44) {
  const p = PARTIES[k]; if (!p) return "";
  return `<svg class="emblem" width="${size}" height="${size}" viewBox="0 0 24 24" aria-label="Blason ${esc(p.n)}" role="img"><path d="M12 .8l9.6 3.6v6.9c0 6.2-4.2 10.6-9.6 12.3C6.6 21.9 2.4 17.5 2.4 11.3V4.4z" fill="${p.c}" stroke="#fff" stroke-width="1"/><path d="M12 2.2l8.3 3.1v6c0 5.4-3.6 9.2-8.3 10.8-4.7-1.6-8.3-5.4-8.3-10.8v-6z" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width=".5"/><g fill="#fff" transform="translate(12 12.4) scale(.62) translate(-12 -12)">${EMBLEM[k]}</g></svg>`;
}
const shieldText = k => PARTIES[k].shield.map(x => CHANCE[x][0].toLowerCase()).join(", ").replace(/, ([^,]*)$/, " et $1");

const CHANCE = {
  heritage: ["Héritage d'une tante", "€"], impots: ["Remboursement d'impôts", "↩"], prime: ["Prime de la mairie", "★"],
  fete: ["Fête des voisins", "♫"], subv: ["Subvention rénovation", "⌂"], loto: ["Gros lot au loto", "7"],
  boom: ["Boom immobilier", "↗"], booster: ["Booster offert", "✦"], cle: ["Coup de cœur", "⚿"],
  tournage: ["Tournage chez vous", "▶"], pub: ["Coup de pub", "✺"],
  fisc: ["Contrôle fiscal", "!"], fonciere: ["Taxe foncière", "%"], notaire: ["Frais de notaire", "§"],
  amende: ["Amende de stationnement", "P"], cambriolage: ["Cambriolage", "⚠"], ravalement: ["Ravalement obligatoire", "▦"],
  degat: ["Dégât des eaux", "≈"], greve: ["Grève RATP", "⏸"], ascenseur: ["Panne d'ascenseur", "↕"],
  termites: ["Termites", "☣"], squat: ["Squat", "✖"]
};
const CHANCE_TXT = {
  tournage: "Un de vos immeubles rapporte ×1,5 pendant 24 h.", pub: "Un de vos immeubles rapporte ×1,3 pendant 24 h.",
  greve: "Vos loyers sont à ×0,8 pendant 24 h.", ascenseur: "Un de vos immeubles rapporte ×0,7 pendant 24 h.",
  termites: "Un de vos immeubles rapporte ×0,6 pendant 48 h.", degat: "Un logement ne rapporte rien pendant 24 h.",
  squat: "Un logement est bloqué pendant 48 h.", booster: "Un booster gratuit en plus.", cle: "Une clé en plus, tout de suite."
};
const BAD = new Set(["fisc", "fonciere", "notaire", "amende", "cambriolage", "ravalement", "degat", "greve", "ascenseur", "termites", "squat"]);
const EVENTS = [
  ["Fête de quartier", "🎉"], ["Tournage d'un film", "🎬"], ["Fashion Week", "👗"], ["Brocante géante", "🧺"],
  ["Marché de créateurs", "🛍️"], ["Nuit blanche", "🌙"], ["Ouverture d'une station de métro", "🚇"], ["Travaux de voirie", "🚧"],
  ["Coupure de courant", "💡"], ["Grève des éboueurs", "🗑️"], ["Marathon de Paris", "🏃"], ["Festival de jazz", "🎷"],
  ["Classement à l'UNESCO", "🏛️"], ["Inondation des caves", "🌊"], ["Journées du patrimoine", "🏰"], ["Salon de l'immobilier", "🏠"]
];

// ---------------- utilitaires ----------------
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const ord = n => n === 1 ? "1er" : n + "e";
const fmtN = n => Math.round(n).toLocaleString("fr-FR");
function fmtE(n) {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 9.995e8) return s + (a / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " Md€";
  if (a >= 9.995e5) return s + (a / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: a >= 1e8 ? 0 : 2 }) + " M€";
  if (a >= 1e4) return s + (Math.round(a / 100) * 100).toLocaleString("fr-FR") + " €";
  return s + Math.round(a).toLocaleString("fr-FR") + " €";
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = hash(seed); return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const ai = g => Math.floor(g / 1e5), li = g => g % 1e5;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function ago(t) {
  const s = (Date.now() - new Date(t).getTime()) / 1000;
  if (s < 60) return "à l'instant"; if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`; return `il y a ${Math.floor(s / 86400)} j`;
}
function hm(sec) { const m = Math.max(0, Math.ceil(sec / 60)); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`; }
function toast(msg, kind) {
  const t = $("#toast"); t.textContent = msg; t.className = "on " + (kind || "");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = "", 2800);
}

// ---------------- données statiques ----------------
let IDX = null, FIELDS = [], ARR = [], BASE = null, MONS = null;
const DATA = "/data/";
const DATA_V = "20261017";   // à changer quand les fichiers de public/data changent (sinon le navigateur garde l'ancienne version un jour)
async function getJSON(u) { const r = await fetch(u); if (!r.ok) throw new Error(u + " : HTTP " + r.status); return r.json(); }
const atlasURL = a => `${DATA}atlas/a${a}.jpg`;
function decodeRing(f) { let x = f[0] + 235000, y = f[1] + 4886000; const o = [[x / 1e5, y / 1e5]]; for (let k = 2; k < f.length; k += 2) { x += f[k]; y += f[k + 1]; o.push([x / 1e5, y / 1e5]); } return o; }

function card(g) {
  const A = ARR[ai(g)]; if (!A?.cards) return null;
  let c = A.obj[li(g)]; if (c) return c;
  const row = A.cards[li(g)]; if (!row) return null;
  c = { g }; FIELDS.forEach((f, k) => c[f] = row[k]); c.arr = IDX.arr[ai(g)].n; c.code = IDX.arr[ai(g)].c;
  c.et2 = c.lk === "l" ? Math.max(1, c.et || Math.round((c.h || 12) / 3)) : 1;
  A.obj[li(g)] = c; return c;
}
async function loadArr(i) {
  if (ARR[i]?.cards) return ARR[i];
  if (ARR[i]?.p) return ARR[i].p;
  const p = (async () => { const d = await getJSON(`${DATA}a/${IDX.arr[i].c}.json?v=${DATA_V}`); ARR[i] = { cards: d.cards, geo: d.geo, roads: d.roads, obj: [] }; window.onArrLoaded?.(i); return ARR[i]; })();
  ARR[i] = { p }; return p;
}
async function ensureCards(gs) { await Promise.all([...new Set(gs.map(ai))].map(loadArr)); }
const title = c => c.name ? cap(c.name) : (c.adr || "Immeuble sans adresse");
const floorOfLot = (c, k) => c.lk !== "l" ? 0 : Math.min(c.et2, 1 + Math.floor(k * c.et2 / c.lots));
function lotsOfFloor(c, f) { const o = []; for (let k = 0; k < c.lots; k++) if (floorOfLot(c, k) === f) o.push(k); return o; }
const lotName = (c, k) => c.lk === "l" ? `Appartement n°${k + 1}` : c.lk === "c" ? `Local commercial n°${k + 1}` : "Part";
const lotWord = (c, n) => c.lk === "l" ? (n > 1 ? "logements" : "logement") : c.lk === "p" ? (n > 1 ? "parts" : "part") : (n > 1 ? "locaux" : "local");
const kindLabel = c => c.lk === "p" ? "Monument" : c.lk === "c" ? "Commerces & bureaux" : (USE[c.u] || "Immeuble");

// lien vers la vraie rue (Google Street View, dans un nouvel onglet)
function streetURL(g) { try { const [x, y] = centerOf(g); return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${y.toFixed(6)},${x.toFixed(6)}`; } catch (e) { return ""; } }

// petits sons (sans fichier audio) : dé, achat, arrivée
let _ac = null;
function sfx(kind) {
  try {
    if (localStorage.getItem("hm_sound") !== "1") return;   // coupés par défaut (on joue souvent au bureau)
    _ac = _ac || new (window.AudioContext || window.webkitAudioContext)(); const ac = _ac, t = ac.currentTime;
    const tone = (f, t0, d, type = "sine", g = .08) => { const o = ac.createOscillator(), v = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0); v.gain.setValueAtTime(0, t0); v.gain.linearRampToValueAtTime(g, t0 + .01); v.gain.exponentialRampToValueAtTime(.0001, t0 + d); o.connect(v).connect(ac.destination); o.start(t0); o.stop(t0 + d); };
    if (kind === "dice") for (let i = 0; i < 6; i++) tone(180 + Math.random() * 120, t + i * .07, .06, "square", .03);
    if (kind === "buy") { tone(523, t, .12); tone(659, t + .1, .12); tone(784, t + .2, .25); }
    if (kind === "coin") { tone(880, t, .08, "triangle", .06); tone(1320, t + .06, .12, "triangle", .06); }
    if (kind === "bad") { tone(220, t, .18, "sawtooth", .04); tone(170, t + .15, .25, "sawtooth", .04); }
  } catch (e) { }
}
