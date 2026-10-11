"use strict";
// =====================================================================
//  Page d'accueil (avant connexion) : explique le jeu et la connexion
// =====================================================================
const G_ICON = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

async function landingHTML() {
  const samples = [[1000005, { t: "key", ks: [2] }, "C"], [231, { t: "floor", ks: [0, 1, 2, 3] }, "R"], [483, { t: "title", ks: [] }, "L"], [300658, { t: "part", n: 3 }, "M"]];
  try { await ensureCards(samples.map(x => x[0])); } catch (e) { }
  const fan = samples.map(([g, it, r], i) => {
    const c = card(g); if (!c) return ""; if (it.t === "title") it.ks = [...Array(c.lots).keys()];
    return `<div class="fan-c" style="--i:${i};--a:${(i - 1.5) * 7}deg;--y:${Math.abs(i - 1.5) * 14}px">${cardHTML(c, { w: "min(190px,42vw)", item: it, tier: r })}</div>`;
  }).join("");
  const steps = [
    ["📦", "Ouvrez des boosters", "Chaque booster contient 4 biens parisiens bien réels (un appartement, un étage entier, un immeuble complet ou des parts d'un monument) et 1 carte Chance. Vous en recevez 5 à l'inscription, puis un gratuit chaque jour."],
    ["🎲", "Lancez le dé, comme au Monopoly", "Votre pion marche dans les vraies rues de Paris et s'arrête sur un immeuble : s'il est libre, achetez-le ; s'il appartient à un joueur, payez-lui son loyer. Gare aux cases Chance !"],
    ["🔑", "Construisez votre patrimoine", "Chaque appartement de Paris n'existe qu'une seule fois dans le jeu et n'a qu'un propriétaire. Complétez un étage (+25 % de loyer) ou un immeuble entier (+60 %), achetez les logements libres de vos immeubles, revendez au marché."],
    ["💶", "Touchez vos loyers", "Vos biens rapportent de l'argent en continu, même quand vous n'êtes pas connecté. Réinvestissez-le dans de nouveaux boosters, des parts de monuments ou des appartements mis en vente par les autres joueurs."],
    ["🏛️", "Devenez maire", "Le plus gros propriétaire de chaque arrondissement en devient le maire et touche 8 % des loyers du quartier. Rejoignez l'un des 5 partis : chaque semaine, celui qui a le plus de maires remporte l'Hôtel de Ville."]
  ];
  const gOk = await googleReady();
  const cta = gOk ? `<div class="lcta"><button class="btn block gbtn" data-l="google">${G_ICON}Commencer avec Google</button><button class="btn block light" data-l="email">Créer un compte avec un e-mail</button></div>`
    : `<div class="lcta"><button class="btn block" data-l="guest">Jouer tout de suite</button><button class="btn block light" data-l="email">Créer un compte avec un e-mail</button><p class="sub small" style="margin:0">Sans compte, votre partie est gardée sur cet appareil. La connexion avec Google arrive très bientôt.</p></div>`;
  return `<div class="landing">
    <header class="lhead"><span class="plaque-mini">HAUSSMANN</span><button class="btn sm light" data-l="signin">Se connecter</button></header>
    <div class="ltop"><section class="lhero">
      <p class="eyebrow">Jeu gratuit · ordinateur et mobile</p>
      <h1>Tout Paris est à prendre.<br><span>Immeuble par immeuble.</span></h1>
      <p class="lead">Haussmann est un jeu de cartes à collectionner construit sur les vrais bâtiments de Paris : les 77 835 immeubles de la ville, de la petite rue du 20<sup>e</sup> à Notre-Dame. Ouvrez des boosters, bâtissez votre patrimoine, touchez des loyers et prenez le contrôle de votre arrondissement face aux autres joueurs, sur une carte de Paris en 3D.</p>
      ${cta}
      <p class="sub small">Gratuit, sans carte bancaire. 1 M€ de trésorerie virtuelle et 5 boosters offerts pour démarrer.</p>
    </section>
    <section class="fan" aria-label="Exemples de cartes">${fan}</section></div>
    <section class="lsec"><h2>Comment ça marche</h2>
      <div class="lsteps">${steps.map(([ic, t, d], i) => `<div class="lstep"><span class="lic">${ic}</span><div><b><span class="n">${i + 1}</span>${t}</b><p>${d}</p></div></div>`).join("")}</div></section>
    <section class="lsec"><h2>Les vrais chiffres de Paris</h2>
      <div class="lstats"><div><b>77 835</b><span>immeubles</span></div><div><b>1,1 million</b><span>de logements à collectionner</span></div><div><b>2021-2025</b><span>prix réels des ventes, rue par rue</span></div><div><b>22</b><span>monuments modélisés en 3D</span></div></div>
      <p class="sub">La valeur de chaque bien vient des vraies ventes immobilières publiées par l'État : un appartement du 7<sup>e</sup> vaut plus cher qu'un appartement du 19<sup>e</sup>, comme dans la réalité.</p></section>
    <section class="lsec"><h2>Cinq partis, une seule mairie</h2>
      <div class="lparties">${PARTY_ORDER.map(k => `<div>${emblemSVG(k, 46)}<b style="color:${PARTIES[k].c}">${esc(PARTIES[k].n)}</b><span>${esc(PARTIES[k].side)}</span></div>`).join("")}</div>
      <p class="sub">Des partis inventés, de la gauche radicale à la droite nationale, avec exactement les mêmes règles pour tous. Vous pourrez changer de camp toutes les 48 heures.</p></section>
    <section class="lsec lgoogle"><h2>Pourquoi se connecter avec Google ?</h2>
      <p>Votre compte sert à garder vos biens et votre argent d'une session à l'autre, sur ordinateur comme sur téléphone. Se connecter avec Google évite de créer un mot de passe de plus : un clic, et Google vous ramène ici.</p>
      <ul>
        <li><b>Ce que Google nous transmet :</b> votre adresse e-mail et votre nom, uniquement pour créer votre compte.</li>
        <li><b>Ce que nous ne faisons jamais :</b> publier quoi que ce soit en votre nom, lire vos e-mails, vos contacts ou vos fichiers.</li>
        <li><b>Ce que voient les autres joueurs :</b> seulement le pseudo que vous choisirez juste après. Votre e-mail reste privé.</li>
      </ul>
      <p>Vous préférez ne pas utiliser Google ? Créez un compte avec une adresse e-mail et un mot de passe : c'est exactement le même jeu. Détails dans notre <a href="/privacy" target="_blank">politique de confidentialité</a>.</p>
      ${cta}
    </section>
    <footer class="lfoot"><p>Haussmann est un jeu : posséder une carte ne donne aucun droit sur le bien réel, et le jeu n'a aucun lien avec les propriétaires des immeubles représentés. L'argent du jeu est virtuel et ne peut pas être converti en euros.</p><p><a href="/terms" target="_blank">Conditions d'utilisation</a> · <a href="/privacy" target="_blank">Confidentialité</a></p></footer>
  </div>`;
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
