"use strict";
// =====================================================================
//  Boosters : page + ouverture façon Cartalia (on touche le paquet,
//  les cartes sortent une par une, puis le récapitulatif)
// =====================================================================
let opening = false;
function oddsHTML() {
  return `<div class="odds">${["C", "U", "R", "L", "M"].map(r => `<span><i style="background:${RAR[r].c}"></i>${RAR[r].n} ${String(RAR[r].w).replace(".", ",")} %</span>`).join("")}</div>`;
}
function renderBoosterPage() {
  const s = ST.state; if (!s?.profile) return;
  const w = s.profile.welcome || 0, fin = freeIn(), free = fin <= 0, n = w + (free ? 1 : 0);
  const kind = w > 0 ? "welcome" : free ? "free" : null;
  $("#p-booster").innerHTML = `<div class="bstage"><div class="rays"></div>
    <h1 class="h1" style="color:#fff;margin:0">Booster</h1>
    <p class="bnote">4 vrais biens de Paris + 1 carte Chance</p>
    <button id="packbtn" aria-label="Ouvrir un booster">${packHTML(kind ? "ready" : "")}${n ? `<span class="pcount">${n}</span>` : ""}</button>
    <div class="bbtns">
      ${kind ? `<button class="btn white block big" data-open="${kind}">Ouvrir${n > 1 ? ` (${n})` : ""}</button>`
             : `<button class="btn gold block big" data-open="paid" ${liveCash() < s.price ? "disabled" : ""}>Acheter · ${fmtE(s.price)}</button>
                <p class="bnote">Prochain booster gratuit dans <b class="num" id="freein">${hm(fin)}</b></p>`}
    </div>
    <details class="oddsbox"><summary>Chances de tirage</summary>${oddsHTML()}<p class="bnote" style="font-size:12px;margin-top:8px">Un booster gratuit chaque jour. Acheté, son prix double à chaque fois dans la journée.</p></details>
  </div>`;
}
$("#p-booster").addEventListener("click", e => {
  const b = e.target.closest("[data-open]"); if (b) return openBooster(b.dataset.open);
  if (e.target.closest("#packbtn")) { const s = ST.state.profile; if (s.welcome > 0) return openBooster("welcome"); if (freeIn() <= 0) return openBooster("free"); toast(`Prochain booster gratuit dans ${hm(freeIn())} — ou achetez-en un.`); }
});

async function openBooster(kind) {
  if (opening) return; opening = true;
  const R = $("#reveal"); R.hidden = false;
  R.innerHTML = `<div class="bstage"><div class="rays"></div><button class="close" data-rclose aria-label="Fermer">×</button>
    <div class="rv"><div class="slot" id="slot"></div><div id="rpack">${packHTML("shake")}</div></div>
    <p class="bnote" id="rhint">Ouverture…</p></div>`;
  const pack = R.querySelector(".pack");
  const t0 = performance.now();
  let res;
  try { res = await rpc("open_booster", { p_kind: kind }); }
  catch (e) { R.hidden = true; opening = false; toast(e.message, "bad"); return; }
  setState(res.state);
  const items = res.items || [];
  await ensureCards(items.filter(i => i.card != null).map(i => i.card));
  // ordre : la carte la plus rare à la fin, la Chance avant-dernière
  const order = { M: 0, L: 1, R: 2, U: 3, C: 4 };
  const props = items.filter(i => i.t !== "chance").sort((a, b) => order[b.tier] - order[a.tier]);
  const ch = items.filter(i => i.t === "chance");
  const seq = props.length ? [...props.slice(0, -1), ...ch, props[props.length - 1]] : ch;
  await sleep(Math.max(0, 450 - (performance.now() - t0)));
  pack.classList.remove("shake"); pack.classList.add("open");
  await sleep(420);
  R.querySelector("#rpack").classList.add("gone"); sfx("coin");   // le paquet s'efface, les cartes sortent à sa place
  await sleep(220);
  refreshHold().then(refreshMap).then(() => { paintAll(); renderWallet(); }).catch(() => { });
  await revealSeq(seq);
  opening = false;
}
function confetti(color, n) {
  const cols = [color, "#F6D67A", "#ffffff", "#7FD4FF"];
  for (let i = 0; i < n; i++) {
    const s = document.createElement("i"); s.className = "conf";
    s.style.left = (10 + Math.random() * 80) + "vw"; s.style.top = (-4 - Math.random() * 10) + "vh"; s.style.background = cols[i % cols.length];
    s.style.setProperty("--dx", (Math.random() * 30 - 15) + "vw"); s.style.setProperty("--r", (Math.random() * 720 - 360) + "deg");
    s.style.animationDelay = (Math.random() * .3) + "s"; document.body.appendChild(s); setTimeout(() => s.remove(), 2400);
  }
}
function itemTitle(it) {
  if (it.t === "chance") { const bad = BAD.has(it.k); return [bad ? "Pas de chance…" : "Carte Chance", bad ? "#FCA5A5" : "#86EFAC"]; }
  return [RAR[it.tier].n, it.tier === "C" ? "#E2E8F0" : RAR[it.tier].c];
}
function revealSeq(seq) {
  return new Promise(resolve => {
    const R = $("#reveal"); let i = 0;
    const slot = R.querySelector("#slot"), hint = R.querySelector("#rhint");
    const show = () => {
      const it = seq[i]; const [tt, col] = itemTitle(it); const hot = it.t !== "chance" && "RLM".includes(it.tier);
      const c = it.card != null ? card(it.card) : null;
      slot.innerHTML = `${hot ? `<div class="burst" style="--glow:${col}"></div>` : ""}<div class="rc${hot ? " hot" : ""}" style="--glow:${col}">${itemFace(it, "min(270px,68vw)")}</div>`;
      hint.innerHTML = `<span class="rtitle" style="color:${col}">${esc(tt)}<small>${c ? `${esc(title(c))} · ${ord(c.arr)} arr.` : esc(chanceText(it))}</small></span>
        <div class="dots" style="justify-content:center">${seq.map((_, k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("")}</div>
        <div style="margin-top:6px">${i < seq.length - 1 ? `Touchez pour la carte suivante · ${i + 1}/${seq.length}` : "Touchez pour voir vos cartes"}</div>`;
      if (hot) confetti(col, it.tier === "R" ? 26 : it.tier === "L" ? 50 : 80);
    };
    const finish = () => { R.onclick = null; summary(seq); resolve(); };
    R.onclick = e => { if (e.target.closest("[data-rclose]")) return finish(); i++; if (i >= seq.length) return finish(); show(); };
    show();
  });
}
function summary(seq) {
  const R = $("#reveal");
  const props = seq.filter(x => x.card != null); const tot = props.reduce((s, x) => s + (card(x.card)?.v || 0) * itemUnits(x), 0);
  const more = packsReady();
  R.innerHTML = `<div class="bstage" style="justify-content:flex-start;overflow:auto"><div class="rays"></div>
    <p class="pill-l" style="margin-top:8px">AJOUTÉ À VOTRE PATRIMOINE</p>
    <h2 class="h1 num" style="color:#fff;margin:0">${fmtE(tot)}</h2>
    <div class="sumgrid">${seq.map((it, k) => `<button ${it.card != null ? `data-sg="${it.card}"` : ""} style="animation-delay:${k * 60}ms">${itemFace(it, "min(150px,42vw)")}</button>`).join("")}</div>
    <div class="bbtns" style="grid-template-columns:1fr 1fr;width:min(100%,420px)">
      <button class="btn glass" data-r="map">Retour à la carte</button>
      ${more ? `<button class="btn white" data-r="again">Ouvrir (${more})</button>` : `<button class="btn white" data-r="assets">Mon patrimoine</button>`}
    </div></div>`;
  R.onclick = e => {
    const b = e.target.closest("[data-r],[data-sg]"); if (!b) return;
    R.hidden = true; R.innerHTML = ""; R.onclick = null;
    if (b.dataset.sg) { go("assets"); push("b", +b.dataset.sg); return; }
    const a = b.dataset.r;
    if (a === "again") { const s = ST.state.profile; return openBooster(s.welcome > 0 ? "welcome" : "free"); }
    if (a === "assets") return go("assets");
    go("map");
  };
  renderWallet(); if (cur() === "booster") renderBoosterPage();
}
