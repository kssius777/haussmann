"use strict";
// =====================================================================
//  Page d'accueil (avant connexion) : explique le jeu et la connexion
// =====================================================================
const G_ICON = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

async function landingHTML() {
  // les cartes en éventail, chacune avec le ruban du parti qui en possède le plus (une illustration, pas la vraie partie)
  const samples = [[600002, { t: "part", n: 1 }, "valeurs"], [1704021, { t: "title", ks: [] }, "poing"], [1572, { t: "part", n: 1 }, "tendue"], [101891, { t: "title", ks: [] }, "milieu"]];
  try { await ensureCards(samples.map(x => x[0])); } catch (e) { }
  const fan = samples.map(([g, it, pt], i) => {
    const c = card(g); if (!c) return ""; if (it.t === "title") it.ks = [...Array(c.lots).keys()];
    return `<div class="fan-c" style="--i:${i}">${cardHTML(c, { w: "var(--cw)", item: it, tier: c.r, party: pt })}</div>`;
  }).join("");
  const steps = [
    ["Ouvrez des boosters", "De vrais biens parisiens dans chaque booster. 5 offerts, puis un par jour."],
    ["Lancez le dé", "Choisissez où aller parmi 4 immeubles : libre, achetez-le."],
    ["Encaissez vos loyers", "Ils tombent tout seuls, même quand vous n'êtes pas là."],
    ["Devenez maire", "Le plus gros propriétaire d'un arrondissement prend la mairie."]
  ];
  const gOk = await googleReady();
  // arrivé par un lien cadeau : on montre ce qui l'attend
  let giftB = "";
  try { const code = localStorage.getItem("hm_gift"); if (code) { const gi = await rpc("gift_info", { p_code: code });
    if (gi) { if (gi.card) await ensureCards([gi.card]); const gc = gi.card ? card(gi.card) : null;
      const what = [gc ? `${gi.n > 1 ? gi.n + " " + lotWord(gc, gi.n) : (gc.lk === "p" ? "une " : "un ") + lotWord(gc, 1)} au ${title(gc)}` : "", gi.boosters ? `${gi.boosters} booster${gi.boosters > 1 ? "s" : ""}` : ""].filter(Boolean).join(" + ");
      giftB = gi.claimed ? `<div class="giftb gone">🎁 Trop tard : ce cadeau a déjà été récupéré${gi.winner ? " par " + esc(gi.winner) : ""}. Mais tout Paris reste à prendre !</div>`
        : `<div class="giftb">🎁 <b>Un cadeau vous attend : ${esc(what)}.</b><span>Premier arrivé, premier servi : créez votre compte pour le récupérer.</span></div>`; } } } catch (e) { }
  const cta = gOk ? `<div class="lcta"><button class="btn block gbtn" data-l="google">${G_ICON}Commencer avec Google</button><button class="btn block dark" data-l="email">Créer un compte avec un e-mail</button></div>`
    : `<div class="lcta"><button class="btn block goldb" data-l="guest">Jouer tout de suite</button><button class="btn block dark" data-l="email">Créer un compte avec un e-mail</button></div>`;
  const chips = `<div class="pchips">${PARTY_ORDER.map(k => `<span class="pc">${emblemSVG(k, 26)}<b>${esc(PARTIES[k].n)}</b></span>`).join("")}</div>`;
  return `<div class="landing v3">
    <header class="lhead"><span class="lbrand"><img class="bico" src="/icons/logo.svg" alt="" width="40" height="40"><span class="plaque-mini" data-sub="7ᵉ Arrᵗ">PROPRIO</span></span><button class="btn sm sgn" data-l="signin">Se connecter</button></header>
    <div class="ltop">
      <section class="lhero">${giftB}
        <h1>Collectionnez Paris. Prenez la mairie.</h1>
        <p class="lead">Achetez les vrais immeubles de Paris, devenez maire de votre arrondissement et faites gagner votre parti.</p>
        ${cta}
        <p class="tiny">Gratuit · 1 M€ de jeu et 5 boosters offerts</p>
        <div class="side">${chips}</div>
      </section>
      <section class="lvis" aria-label="La carte de Paris aux couleurs des partis, et des cartes à collectionner">
        <div class="shot" role="img" aria-label="Paris, arrondissement par arrondissement, aux couleurs des partis qui tiennent la mairie"><b>Qui gouverne Paris ?</b></div>
        <div class="fan">${fan}</div>
      </section>
    </div>
    <section class="lsec camp"><h2>Choisissez votre camp.</h2>
      <div class="lparties">${PARTY_ORDER.map(k => `<div>${emblemSVG(k, 40)}<b>${esc(PARTIES[k].n)}</b><span>${esc(PARTIES[k].power)}</span></div>`).join("")}</div></section>
    <section class="lsec"><h2>Quatre gestes, tout Paris.</h2>
      <div class="lsteps2">${steps.map(([t, d]) => `<div><b>${t}</b><p>${d}</p></div>`).join("")}</div></section>
    <section class="lfinal"><h2>Votre premier immeuble vous attend.</h2>${cta}</section>
    <footer class="lfoot"><p>Proprio est un jeu : posséder une carte ne donne aucun droit sur le bien réel. L'argent du jeu est virtuel. <a href="/cgu" target="_blank">Conditions d'utilisation</a> · <a href="/confidentialite" target="_blank">Confidentialité</a> · <a href="mailto:contact@proprio.games">Contact</a></p></footer>
  </div>`;
}
// carte de Paris de l'accueil : quelques arrondissements déjà tenus par un parti (une illustration, pas la vraie partie), les autres à prendre
const LAND_DEMO = { 2: "rempart", 5: "valeurs", 9: "milieu", 15: "tendue", 17: "poing", 10: "valeurs" };
function landingMapSVG() {
  if (!IDX?.arr) return "";
  const kx = 0.6579, rings = IDX.arr.map(a => a.outline.map(r => decodeRing(r))), xs = [], ys = [];
  rings.flat(2).forEach(([x, y]) => { xs.push(x * kx); ys.push(y); });
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), W = 520, H = W * (y1 - y0) / (x1 - x0);
  const P = ([x, y]) => [(x * kx - x0) / (x1 - x0) * W, (y1 - y) / (y1 - y0) * H];
  const polys = IDX.arr.map((a, i) => { const k = LAND_DEMO[a.n], c = k ? PARTIES[k].c : null;
    return rings[i].map(r => `<polygon points="${r.map(q => P(q).map(v => v.toFixed(1)).join(",")).join(" ")}" fill="${c || "rgba(255,255,255,.06)"}" stroke="${c ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.24)"}" stroke-width="1.5" stroke-linejoin="round"/>`).join(""); }).join("");
  const marks = IDX.arr.map(a => { const [x, y] = P(a.center), k = LAND_DEMO[a.n];
    return k ? `<svg x="${(x - 13).toFixed(1)}" y="${(y - 14).toFixed(1)}" width="26" height="28" viewBox="0 0 26 28">${emblemSVG(k, 26)}</svg>`
      : `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="800" fill="rgba(255,255,255,.42)">${a.n}</text>`; }).join("");
  return `<svg class="lmap" viewBox="-6 -6 ${W + 12} ${(H + 12).toFixed(0)}" aria-hidden="true">${polys}${marks}</svg>`;
}
async function showLanding() {
  const O = $("#onb"); O.hidden = false; onbStep = "home";
  O.innerHTML = await landingHTML(); $("#loading")?.remove(); O.scrollTop = 0;
  O.onclick = async e => {
    const b = e.target.closest("[data-l]"); if (!b) return; const a = b.dataset.l;
    if (a === "google") { try { await signInGoogle(); if (LOCAL_MODE) { O.onclick = null; afterLogin(); } } catch (err) { toast(err.message, "bad"); } }
    if (a === "guest") { b.disabled = true; b.textContent = "Création de votre partie…"; try { await guestSignIn(); O.onclick = null; afterLogin(); } catch (err) { b.disabled = false; b.textContent = "Jouer tout de suite"; toast(err.message, "bad"); } }
    if (a === "email" || a === "signin") { onbSignup = a === "email"; O.onclick = null; showOnb("login"); }
  };
}
