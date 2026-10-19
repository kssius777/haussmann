"use strict";
// =====================================================================
//  Connexion et inscription en 3 écrans
// =====================================================================
let onbStep = "login", onbPseudo = "", onbSignup = true;
function showOnb(step) {
  onbStep = step || onbStep; if (onbStep === "home") return showLanding();
  const O = $("#onb"); O.hidden = false; O.onclick = null; $("#loading")?.remove(); O.scrollTop = 0;
  const steps = n => `<div class="steps">${[1, 2, 3].map(k => `<i class="${k <= n ? "on" : ""}"></i>`).join("")}</div>`;
  if (onbStep === "login") {
    O.innerHTML = `<div class="onb">
      <button class="back" id="tohome" style="align-self:flex-start">${ICON.back}Accueil</button>
      <h1>Collectionnez les vrais immeubles de Paris.</h1>
      <p>Ouvrez des boosters, touchez les loyers, devenez maire de votre arrondissement.</p>
      <div class="seg" role="tablist" style="margin:4px 0 0"><button data-mode="up" aria-selected="${onbSignup}">Créer un compte</button><button data-mode="in" aria-selected="${!onbSignup}">J'ai un compte</button></div>
      <form id="authf" style="display:grid;gap:10px">
        <input class="inp" id="em" type="email" placeholder="Votre e-mail" autocomplete="email" required>
        <input class="inp" id="pw" type="password" placeholder="Mot de passe (6 caractères min.)" autocomplete="${onbSignup ? "new-password" : "current-password"}" minlength="6" required>
        <button class="btn block" type="submit">${onbSignup ? "Créer mon compte" : "Me connecter"}</button>
      </form>
      <button class="btn block light" id="google"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continuer avec Google</button>
      <p class="sub" id="autherr" style="color:var(--danger);min-height:20px"></p>
      <p class="sub" style="font-size:12.5px;text-align:center">En continuant, vous acceptez les <a href="/terms" target="_blank">conditions d'utilisation</a> et la <a href="/privacy" target="_blank">politique de confidentialité</a>.</p>
    </div>`;
    O.querySelector("#tohome").onclick = () => showOnb("home");
    O.querySelector("[data-mode=up]").onclick = () => { onbSignup = true; showOnb("login"); };
    O.querySelector("[data-mode=in]").onclick = () => { onbSignup = false; showOnb("login"); };
    O.querySelector("#google").onclick = async () => { try { if (await googleReady()) { await signInGoogle(); if (LOCAL_MODE) afterLogin(); } else { await guestSignIn(); afterLogin(); } } catch (e) { $("#autherr").textContent = e.message; } };
    googleReady().then(ok => { if (!ok && $("#google")) $("#google").innerHTML = "Jouer sans compte (sur cet appareil)"; });
    O.querySelector("#authf").onsubmit = async e => {
      e.preventDefault(); const em = $("#em").value.trim(), pw = $("#pw").value; const b = e.target.querySelector("button"); b.disabled = true;
      try {
        const r = onbSignup ? await signUp(em, pw) : await signIn(em, pw);
        if (r.needsConfirm) { $("#autherr").style.color = "var(--money)"; $("#autherr").textContent = "Compte créé : cliquez sur le lien reçu par e-mail pour le confirmer, puis revenez ici."; b.disabled = false; return; }
        afterLogin();
      } catch (err) { $("#autherr").textContent = err.message; b.disabled = false; }
    };
  }
  if (onbStep === "pseudo") {
    O.innerHTML = `<div class="onb"><h1>Comment voulez-vous qu'on vous appelle ?</h1><p>C'est le nom que verront les autres joueurs.</p>
      <form id="pf" style="display:grid;gap:10px"><input class="inp" id="ps" maxlength="20" minlength="2" placeholder="Ex. : Baron Haussmann" value="${esc(onbPseudo)}" required autocomplete="nickname">
      <button class="btn block" type="submit">Continuer</button></form><p class="sub" id="perr" style="color:var(--danger)"></p></div>`;
    // le pseudo, puis le parti (le cœur du jeu, demande du propriétaire du 19/10/2026) ; le compte n'est créé qu'à la fin
    O.querySelector("#pf").onsubmit = e => { e.preventDefault(); const v = $("#ps").value.trim(); if (v.length < 2) return; onbPseudo = v; pickParty = null; showOnb("party"); };
    setTimeout(() => $("#ps")?.focus(), 50);
  }
  if (onbStep === "party") {
    // 5 blasons sur l'axe gauche → droite ; toucher un parti montre son pouvoir en une ligne ; « plus tard » reste possible
    const det = k => k ? `<div class="opdet" style="--pc:${PARTIES[k].c}">${emblemSVG(k, 40)}<div><b>${esc(PARTIES[k].n)}</b><span>${esc(PARTIES[k].power)}</span></div></div>` : `<div class="opdet empty">Touchez un parti</div>`;
    O.innerHTML = `<div class="onb opty"><h1>Choisissez votre parti</h1><p>C'est le cœur du jeu : les partis se battent pour les mairies de Paris.</p>
      <div class="spectrum">${PARTY_ORDER.map(k => `<button class="sp-node" data-party="${k}" aria-pressed="${pickParty === k}" style="--pc:${PARTIES[k].c}" aria-label="${esc(PARTIES[k].n)}">${emblemSVG(k, 46)}<span>${esc(PARTIES[k].n)}</span></button>`).join("")}</div>
      <div id="opd">${det(pickParty)}</div>
      <button class="btn block" id="pgo" ${pickParty ? `style="background:${PARTIES[pickParty].c}"` : "disabled"}>Je rejoins ce parti</button>
      <p class="sub" style="text-align:center;margin:-2px 0 0">Vous pourrez en changer plus tard.</p>
      <button class="lnk" id="plater">Je choisirai plus tard</button>
      <p class="sub" id="perr" style="color:var(--danger)"></p></div>`;
    const join = async (party, b) => { b.disabled = true;
      try { setState(await rpc("join_game", { p_pseudo: onbPseudo, p_party: party })); O.onclick = null; O.hidden = true; startGame(true); }
      catch (err) { b.disabled = false; if (/pseudo/i.test(err.message)) { showOnb("pseudo"); setTimeout(() => $("#perr").textContent = err.message, 30); } else $("#perr").textContent = err.message; } };
    O.onclick = e => {
      const pc = e.target.closest("[data-party]"); if (pc) { pickParty = pc.dataset.party; O.querySelectorAll("[data-party]").forEach(x => x.setAttribute("aria-pressed", x === pc)); $("#opd").innerHTML = det(pickParty); const g = $("#pgo"); g.disabled = false; g.style.background = PARTIES[pickParty].c; return; }
      if (e.target.closest("#pgo") && pickParty) return join(pickParty, $("#pgo"));
      if (e.target.closest("#plater")) return join(null, $("#plater"));
    };
  }
}
async function afterLogin() {
  try { await refreshState(); } catch (e) { $("#autherr") && ($("#autherr").textContent = e.message); return; }
  if (!ST.state?.profile) return showOnb("pseudo");
  $("#onb").hidden = true; startGame(false);
}
