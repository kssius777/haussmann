"use strict";
// =====================================================================
//  Connexion et inscription en 3 écrans
// =====================================================================
let onbStep = "login", onbPseudo = "", onbSignup = true;
function showOnb(step) {
  onbStep = step || onbStep; const O = $("#onb"); O.hidden = false; $("#loading")?.remove();
  const steps = n => `<div class="steps">${[1, 2, 3].map(k => `<i class="${k <= n ? "on" : ""}"></i>`).join("")}</div>`;
  if (onbStep === "login") {
    O.innerHTML = `<div class="onb">${steps(1)}
      <span class="plaque-mini big" style="align-self:flex-start">HAUSSMANN</span>
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
    </div>`;
    O.querySelector("[data-mode=up]").onclick = () => { onbSignup = true; showOnb("login"); };
    O.querySelector("[data-mode=in]").onclick = () => { onbSignup = false; showOnb("login"); };
    O.querySelector("#google").onclick = async () => { try { await signInGoogle(); if (LOCAL_MODE) afterLogin(); } catch (e) { $("#autherr").textContent = e.message; } };
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
    O.innerHTML = `<div class="onb">${steps(2)}<h1>Votre nom de propriétaire</h1><p>C'est le nom que verront les autres joueurs, sur la carte et au classement.</p>
      <form id="pf" style="display:grid;gap:10px"><input class="inp" id="ps" maxlength="20" minlength="2" placeholder="Ex. : Baron Haussmann" value="${esc(onbPseudo)}" required autocomplete="nickname">
      <button class="btn block" type="submit">Continuer</button></form><p class="sub" id="perr" style="color:var(--danger)"></p></div>`;
    O.querySelector("#pf").onsubmit = e => { e.preventDefault(); const v = $("#ps").value.trim(); if (v.length < 2) return; onbPseudo = v; showOnb("party"); };
    setTimeout(() => $("#ps")?.focus(), 50);
  }
  if (onbStep === "party") {
    O.innerHTML = `<div class="onb" style="max-width:760px">${steps(3)}<h1>Choisissez votre parti</h1>
      <p>Chaque arrondissement élit pour maire son plus gros propriétaire. Votre parti décide avec qui vous gagnez : quand un membre devient maire, tous les membres y touchent +${MEMBER_BONUS} % de loyers. Vous pourrez en changer toutes les 48 h.</p>
      ${partyPickerHTML(null)}
      <button class="btn block" id="pgo">C'est parti</button><p class="sub" id="perr" style="color:var(--danger)"></p></div>`;
    O.onclick = async e => {
      const pc = e.target.closest("[data-party]"); if (pc) { pickParty = pc.dataset.party; O.querySelectorAll("[data-party]").forEach(b => b.setAttribute("aria-pressed", b === pc)); return; }
      if (e.target.closest("#pgo")) {
        if (!pickParty) return ($("#perr").textContent = "Choisissez un parti.");
        const b = $("#pgo"); b.disabled = true;
        try { setState(await rpc("join_game", { p_pseudo: onbPseudo, p_party: pickParty })); O.onclick = null; O.hidden = true; startGame(true); }
        catch (err) { b.disabled = false; if (/pseudo/i.test(err.message)) { onbPseudo = ""; showOnb("pseudo"); setTimeout(() => $("#perr").textContent = err.message, 30); } else $("#perr").textContent = err.message; }
      }
    };
  }
}
async function afterLogin() {
  try { await refreshState(); } catch (e) { $("#autherr") && ($("#autherr").textContent = e.message); return; }
  if (!ST.state?.profile) return showOnb("pseudo");
  $("#onb").hidden = true; startGame(false);
}
