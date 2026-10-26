"use strict";
// =====================================================================
//  PROPRIO (ex-Haussmann) — constantes, données statiques, utilitaires
// =====================================================================
// Base de données : la vraie sur le site public (proprio.games, haussmann-beige.vercel.app) ;
// la base de test sur les sites de test de Vercel (branche « dev ») dès que DB_TEST est rempli.
const DB_PROD = { url: "https://fmqixxakhphkijtsyeqd.supabase.co", anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtcWl4eGFraHBoa2lqdHN5ZXFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MzA1ODAsImV4cCI6MjEwNzIwNjU4MH0.DbX0oidMAdRe_JF2RDx2VwPJ6anAZaHw2nZKpAU42rw" };
const DB_TEST = { url: "", anon: "" };   // projet Supabase de test : adresse + clé publique (anon), à remplir
const IS_PROD_SITE = /(^|\.)proprio\.games$|^haussmann-beige\.vercel\.app$/.test(location.hostname);
const DB_IS_TEST = !IS_PROD_SITE && !!DB_TEST.url;
const SUPABASE_URL = (DB_IS_TEST ? DB_TEST : DB_PROD).url;
const SUPABASE_ANON = (DB_IS_TEST ? DB_TEST : DB_PROD).anon;
if (DB_IS_TEST) document.documentElement.classList.add("dbtest");   // bandeau « site de test » pour ne pas confondre
const LOCAL_MODE = new URLSearchParams(location.search).has("local") || location.hostname === "localhost" || location.hostname === "127.0.0.1";

const RAR = {
  C: { n: "Commune",     l: "C", c: "#8B9099", frame: "#8B9099", roof: "#E3E8EE", body: "#FFFFFF", w: 58 },
  U: { n: "Peu commune", l: "U", c: "#2E9E6A", frame: "#2E9E6A", roof: "#E3E8EE", body: "#FFFFFF", w: 27 },
  R: { n: "Rare",        l: "R", c: "#2F6BE0", frame: "#2F6BE0", roof: "#C9D8F5", body: "#F1F5FD", w: 11 },
  L: { n: "Légendaire",  l: "L", c: "#C9921A", frame: "linear-gradient(140deg,#F6D67A,#C08A17 40%,#F7DE8F 60%,#B07A10)", roof: "#F0D48A", body: "#FBF2DC", w: 3.4 },
  M: { n: "Mythique",    l: "M", c: "#8B3FD9", frame: "linear-gradient(140deg,#F2B3FF,#7FD4FF 35%,#B9F5C9 55%,#FFC7A1 75%,#C59BFF)", roof: "#D9B8F5", body: "#F4EAFD", w: 0.6 }
};
const ORDER = "MLRUC";
const USE = { res: "Résidentiel", ind: "Immeuble", com: "Commerces & services", ann: "Annexe", rel: "Lieu de culte", spo: "Sport", indus: "Industriel", agr: "Agricole", met: "Station de métro", jar: "Jardin", pla: "Place" };
// les lieux en cartes à parts (20/10/2026, scripts/add_spots.py) : stations de métro, jardins, bois, places, le canal
// IDX.spots = [[carte, sorte, lignes, lon, lat]] ; sorte : m station · j jardin · b bois · p place · c canal
const SPOTK = { m: "Station de métro", j: "Jardin", b: "Bois", p: "Place", c: "Canal", g: "Gare", n: "Pont", k: "Cimetière", o: "Monument", a: "Avenue" };
const LINE_C = { "1": "#FFCD00", "2": "#003CA6", "3": "#837902", "3bis": "#6EC4E8", "4": "#CF009E", "5": "#FF7E2E", "6": "#6ECA97", "7": "#FA9ABA", "7bis": "#6ECA97",
  "8": "#E19BDF", "9": "#B6BD00", "10": "#C9910D", "11": "#704B1C", "12": "#007852", "13": "#6EC4E8", "14": "#62259D" };
const LINE_DARK = new Set(["1", "3bis", "5", "6", "7", "7bis", "8", "9", "13"]);   // numéro en noir sur les couleurs claires
let SPOTM = null;
const spotOf = g => { if (!SPOTM && typeof IDX !== "undefined" && IDX?.spots) SPOTM = new Map(IDX.spots.map(s => [s[0], s])); return SPOTM?.get(g) || null; };
const isStation = g => spotOf(g)?.[1] === "m";
const SPOTN = { m: "Station", j: "Jardin", b: "Bois", p: "Place", c: "Canal", g: "Gare", n: "Pont", k: "Cimetière", o: "Monument", a: "Avenue" };
const SPOTDE = { m: "de la station", j: "du jardin", b: "du bois", p: "de la place", c: "du canal", g: "de la gare", n: "du pont", k: "du cimetière", o: "du monument", a: "de l'avenue" };
// la station : ses lignes, et ce que rapporte le réseau (+1 % sur tous ses loyers par station, jusqu'à +15 %)
const netLine = g => isStation(g) ? `<div class="netl"><span class="lnbs">${lineBadges(g, 18)}</span><span>+1 % sur tous vos loyers par station${myStations() ? `<b>vous : +${myStations()} %</b>` : ""}</span></div>` : "";
const stationLines = g => (spotOf(g)?.[2] || "").split(",").filter(Boolean);
const myStations = () => Math.min(15, [...ST.mineParts.keys()].filter(isStation).length);   // bonus réseau : +1 % par station, jusqu'à +15 %
const lineBadges = (g, size = 20) => stationLines(g).map(n => `<i class="lnb${LINE_DARK.has(n) ? " dk" : ""}" style="--lc:${LINE_C[n] || "#64748B"};--ls:${size}px">${n.replace("bis", "b")}</i>`).join("");

// Partis, présentés de gauche à droite (noms fictifs). Mêmes règles pour tous :
// le maire touche 8 % des loyers de son arrondissement, les membres du parti du maire y gagnent +10 %,
// et chaque parti protège ses membres contre quelques cartes malus (risques équivalents).
const PARTIES = {
  poing:   { n: "Extrême gauche",   side: "Extrême gauche",  c: "#D32F2F", motto: "Le toit est un droit.", pitch: "Le logement n'est pas une marchandise.", shield: ["greve", "amende"], power: "−50 % de péage", powerTxt: "Quand vous survolez l'immeuble d'un autre joueur, vous payez moitié moins de péage. Exemple : 2 000 € → 1 000 €." },
  tendue:  { n: "Gauche",           side: "Gauche",           c: "#E5679A", motto: "Ensemble, chez nous.", pitch: "Solidarité et services publics.",        shield: ["notaire", "ravalement"], power: "Salaire doublé", powerTxt: "Chaque km volé vous rapporte 40 000 € au lieu de 20 000 €." },
  milieu:  { n: "Centriste",        side: "Centriste",           c: "#F2A33A", motto: "En toute mesure.", pitch: "Entreprendre, réformer, rassembler.",    shield: ["fonciere", "degat"], power: "Ventes sans commission", powerTxt: "Quand vous vendez (Marché ou offre de rachat), vous touchez 100 % du prix au lieu de 95 %." },
  valeurs: { n: "Droite",           side: "Droite",           c: "#3E7BDC", motto: "Libre d'entreprendre.", pitch: "Propriété, mérite et tradition.",        shield: ["fisc", "termites", "ascenseur"], power: "Crédit facile", powerTxt: "Apport de 5 % au lieu de 10 %, et 50 % de capacité d'emprunt en plus. Exemple : un bien à 1 M€ = 50 000 € d'apport." },
  rempart: { n: "Extrême droite",   side: "Extrême droite", c: "#1E2B5E", motto: "Tenir la ville.", pitch: "Sécurité, ordre et souveraineté.",       shield: ["cambriolage", "squat"], power: "+50 % de péage chez vous", powerTxt: "Quand un joueur survole votre immeuble, il vous paie 50 % de péage en plus. Exemple : 2 000 € → 3 000 €." }
};
const downRate = () => ST.state?.profile?.party === "valeurs" ? .05 : .1;   // Droite : apport de 5 %
const PARTY_ORDER = ["poing", "tendue", "milieu", "valeurs", "rempart"];
// le ruban des cartes : la couleur du parti qui en possède le plus (clair, foncé)
const RIB = { poing: ["#E5483F", "#B3201B"], tendue: ["#EE7FAE", "#C93C78"], milieu: ["#F7B34E", "#D9851A"], valeurs: ["#4C8BEA", "#1F56C2"], rempart: ["#3A4A94", "#18214F"] };
const MAYOR_TAX = 8, MEMBER_BONUS = 10;
// Blasons des partis (écusson + emblème blanc)
// blasons des partis, version 2 (20/10/2026) : des pictogrammes pleins et gros, lisibles même tout petits
const EMBLEM = {
  // le poing levé
  poing: '<path d="M9.4 15.6h5.2v5.6H9.4z"/><rect x="6.8" y="5.6" width="10.4" height="10.6" rx="2.8"/><g fill="none" stroke="#000" stroke-opacity=".28" stroke-width="1" stroke-linecap="round"><path d="M9.4 6v3.6M12 6v3.6M14.6 6v3.6"/><path d="M7.4 11.6h5.4c.8 0 1.3.6 1.3 1.3"/></g>',
  // la rose
  tendue: '<circle cx="12" cy="8.6" r="4.7"/><g fill="none" stroke="#000" stroke-opacity=".26" stroke-width="1" stroke-linecap="round"><path d="M12.2 5.8c1.6.4 2.3 1.8 1.7 3.1-.6 1.3-2.2 1.5-3.1.6"/><path d="M8.9 9.4c.6 1.7 2 2.6 3.7 2.4"/></g><rect x="11.3" y="12.8" width="1.4" height="8.6" rx=".7"/><path d="M12.6 17.4c1.5-2.4 3.9-2.9 5-2.3-.7 2.2-2.9 3.1-5 2.8zM11.4 15.8c-1.3-1.8-3.1-2.1-4-1.6.5 1.7 2.1 2.4 4 2.1z"/>',
  // la balance
  milieu: '<rect x="11.2" y="5.2" width="1.6" height="13.6"/><rect x="7.6" y="18.4" width="8.8" height="2.4" rx="1.2"/><rect x="3.9" y="6.9" width="16.2" height="1.9" rx=".95"/><circle cx="12" cy="5.2" r="1.7"/><path d="M6 8.6l-2.5 5M6 8.6l2.5 5M18 8.6l-2.5 5M18 8.6l2.5 5" stroke="#fff" stroke-width="1.1" fill="none"/><path d="M2.9 13.4h6.2a3.1 2.3 0 0 1-6.2 0zM14.9 13.4h6.2a3.1 2.3 0 0 1-6.2 0z"/>',
  // l'aigle
  valeurs: '<ellipse cx="12" cy="12.6" rx="2.4" ry="4.4"/><circle cx="12" cy="7.1" r="2"/><path d="M13.7 6.9l1.9.7-1.9.6z"/><path d="M10.1 10.4L2.4 5.8l1.3 3.6-1.9.3 2.8 2.8-1.5.7 3.9 1.7 3.3.1zM13.9 10.4l7.7-4.6-1.3 3.6 1.9.3-2.8 2.8 1.5.7-3.9 1.7-3.3.1z"/><path d="M10.5 16.4h3l1.3 4-2.8-1.3-2.8 1.3z"/>',
  // la tour
  rempart: '<path d="M7 21.2V9.4H5.8V4.6h2.7v2.2h2.2V4.6h2.6v2.2h2.2V4.6h2.7v4.8H17v11.8z"/><path d="M10.4 21.2v-3.4a1.6 1.6 0 0 1 3.2 0v3.4zM9 11.4h1.6v2.6H9zM13.4 11.4H15v2.6h-1.6z" fill="#000" fill-opacity=".3"/>'
};
function emblemSVG(k, size = 44) {
  const p = PARTIES[k]; if (!p) return "";
  return `<svg class="emblem" width="${size}" height="${size}" viewBox="0 0 24 24" aria-label="Blason ${esc(p.n)}" role="img"><path d="M12 .6l10 3.7v7.2c0 6.4-4.4 10.9-10 12.6C6.4 22.4 2 17.9 2 11.5V4.3z" fill="${p.c}" stroke="#fff" stroke-width="1.1"/><g fill="#fff" transform="translate(12 12.3) scale(.8) translate(-12 -12.6)">${EMBLEM[k]}</g></svg>`;
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
  termites: ["Termites", "☣"], squat: ["Squat", "✖"],
  // cartes fun ajoutées le 19/10/2026 (validées par le propriétaire)
  ticket: ["Ticket de métro trouvé par terre", "M"], pigeon: ["Un pigeon vous a choisi", "♣"], coloc: ["Votre coloc paie enfin sa part", "½"],
  caution: ["Caution enfin remboursée", "✓"], squatpartis: ["Les squatteurs sont partis", "✎"], baguette: ["Meilleure baguette de Paris", "♛"],
  clip: ["Clip de rap tourné dans votre cour", "♪"], fashion: ["Fashion Week", "✂"], bonne: ["Chambre de bonne en héritage", "▲"],
  punaises: ["Punaises de lit", "⁂"], rats: ["Rats dans la cour", "∾"], perceuse: ["Le voisin perce le dimanche à 8 h", "⚒"],
  dpe: ["DPE classé G", "G"], controleur: ["Contrôleur dans le métro", "⊘"], encadrement: ["Encadrement des loyers", "⇣"],
  syndic: ["Le syndic augmente les charges", "⇡"], impaye: ["Locataire parti sans payer", "∅"], manif: ["Manif sous vos fenêtres", "⚑"]
};
const CHANCE_TXT = {
  tournage: "Un de vos immeubles rapporte ×1,5 pendant 24 h.", pub: "Un de vos immeubles rapporte ×1,3 pendant 24 h.",
  greve: "Vos loyers sont à ×0,8 pendant 24 h.", ascenseur: "Un de vos immeubles rapporte ×0,7 pendant 24 h.",
  termites: "Un de vos immeubles rapporte ×0,6 pendant 48 h.", degat: "Un logement ne rapporte rien pendant 24 h.",
  squat: "Un logement est bloqué pendant 48 h.", booster: "Un booster gratuit en plus.", cle: "Une clé en plus, tout de suite.",
  pigeon: "Ça porte bonheur !", squatpartis: "… et ils ont tout repeint !", baguette: "En bas de chez vous : un immeuble ×1,3 pendant 24 h.",
  clip: "Un de vos immeubles rapporte ×1,5 pendant 24 h.", fashion: "Tous vos loyers ×1,2 pendant 24 h.", bonne: "Un logement offert, tout de suite.",
  punaises: "Un logement ne rapporte rien pendant 48 h.", rats: "Un de vos immeubles rapporte ×0,7 pendant 24 h.",
  perceuse: "Un de vos immeubles rapporte ×0,8 pendant 24 h.", dpe: "Un logement interdit à la location pendant 48 h.",
  controleur: "Vous n'aviez pas validé.", encadrement: "Un de vos immeubles rapporte ×0,8 pendant 48 h.", manif: "Un de vos immeubles rapporte ×0,8 pendant 24 h."
};
const BAD = new Set(["fisc", "fonciere", "notaire", "amende", "cambriolage", "ravalement", "degat", "greve", "ascenseur", "termites", "squat",
  "punaises", "rats", "perceuse", "dpe", "controleur", "encadrement", "syndic", "impaye", "manif"]);
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
// au plus une fois tous les ms, et une dernière fois à la fin : pour ce qui suit la caméra quand elle bouge sans arrêt
// (elle suit son personnage image par image : « moveend » arrive alors à chaque image)
function throttle(fn, ms) {
  let t = 0, q = 0;
  return function () { const now = performance.now(), wait = t + ms - now; clearTimeout(q);
    if (wait <= 0) { t = now; fn(); } else q = setTimeout(() => { t = performance.now(); fn(); }, wait); };
}
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
const DATA_V = "20261021a";   // à changer quand les fichiers de public/data changent (sinon le navigateur garde l'ancienne version un jour)
async function getJSON(u) { const r = await fetch(u); if (!r.ok) throw new Error(u + " : HTTP " + r.status); return r.json(); }
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
const knownName = n => (typeof SHORT !== "undefined" && SHORT[n]) || cap(n);   // « Gare du Nord » plutôt que « Paris-Nord » (SHORT dans map.js)
const title = c => c.name ? knownName(c.name) : (c.adr || "Immeuble sans adresse");
const floorOfLot = (c, k) => c.lk !== "l" ? 0 : Math.min(c.et2, 1 + Math.floor(k * c.et2 / c.lots));
function lotsOfFloor(c, f) { const o = []; for (let k = 0; k < c.lots; k++) if (floorOfLot(c, k) === f) o.push(k); return o; }
const lotName = (c, k) => c.lk === "l" ? `Appartement n°${k + 1}` : c.lk === "c" ? `Local commercial n°${k + 1}` : "Part";
const lotWord = (c, n) => c.lk === "l" ? (n > 1 ? "logements" : "logement") : c.lk === "p" ? (n > 1 ? "parts" : "part") : (n > 1 ? "locaux" : "local");
const kindLabel = c => SPOTK[spotOf(c.g)?.[1]] || (c.lk === "p" ? "Monument" : c.lk === "c" ? "Commerces & bureaux" : (USE[c.u] || "Immeuble"));

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
