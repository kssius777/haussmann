"use strict";
// =====================================================================
//  Cartes : photo ou dessin de façade, carte « plaque de rue »
// =====================================================================
const artCache = new Map();
function phStyle(c) { const [a, n] = c.ph; return `background-image:url(${atlasURL(a)});background-size:500% 800%;background-position:${(n % 5) * 25}% ${Math.floor(n / 5) * (100 / 7)}%`; }
// les photos de rue automatiques (Panoramax) sont souvent ratées : on garde le dessin pour elles
const goodPhoto = c => c.ph && !/anoramax/.test(c.cr || "");
function photo(c) { return goodPhoto(c) ? `<div class="img" style="${phStyle(c)}" role="img" aria-label="Photo de ${esc(title(c))}"></div>` : facadeSVG(c); }
function facadeSVG(c){
  const key="f"+c.g; if(artCache.has(key)) return artCache.get(key);
  const r=rng("fa"+c.g), pick=a=>a[Math.floor(r()*a.length)];
  const y=+c.y||0, modern=y>=1955||(!y&&(c.h||0)>=38), rel=c.u==="rel", shop=c.u==="com"||r()<.45;
  const et=Math.max(2,Math.min(modern?11:8,c.et2||Math.round((c.h||15)/3)));
  const cols=Math.max(3,Math.min(7,Math.round(Math.sqrt(c.a||250)/4)));
  const W=400,H=300,X0=34,X1=366,G=268, BW=X1-X0;
  const stone=modern?pick(["#DAD6CF","#D3D0CA","#E2DDD4"]):pick(["#EADFCB","#E6D8C0","#EFE5D3","#E2D3BA"]);
  const line=modern?"#C3BFB8":"#D3C3A6";
  let s=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="sk${c.g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CFE0EA"/><stop offset="1" stop-color="#F3EEE6"/></linearGradient></defs>`;
  s+=`<rect width="${W}" height="${H}" fill="url(#sk${c.g})"/>`;
  // neighbours
  s+=`<rect x="-10" y="70" width="${X0+12}" height="${G-70}" fill="#E4DACB"/><rect x="${X1-2}" y="96" width="60" height="${G-96}" fill="#E8DFD1"/><rect x="-10" y="58" width="${X0+12}" height="14" fill="#9AA6B0"/><rect x="${X1-2}" y="84" width="60" height="14" fill="#9AA6B0"/>`;
  const roofH=modern?6:30, top=Math.max(16,G-(et+.35)*Math.min(28,(G-60)/(et+.35)));
  const fh=(G-top-roofH)/(et+.35), gh=fh*1.35, cw=BW/cols;
  if(rel){
    s+=`<rect x="${X0+40}" y="70" width="${BW-80}" height="${G-70}" fill="${stone}"/><polygon points="${X0+30},74 ${W/2},28 ${X1-30},74" fill="${stone}" stroke="${line}" stroke-width="2"/>`;
    s+=`<circle cx="${W/2}" cy="122" r="30" fill="#7D6B9C" stroke="${line}" stroke-width="5"/><circle cx="${W/2}" cy="122" r="12" fill="#C9A44C"/>`;
    s+=`<path d="M${W/2-26} ${G}V${G-56}a26 26 0 0152 0V${G}z" fill="#3E3328"/>`;
    for(const dx of [-88,88]) s+=`<path d="M${W/2+dx-12} ${G-30}V${G-84}a12 12 0 0124 0V${G-30}z" fill="#6E7F8C"/>`;
  } else {
    s+=`<rect x="${X0}" y="${top}" width="${BW}" height="${G-top}" fill="${stone}"/>`;
    if(!modern){ // mansard roof with dormers and chimneys
      s+=`<polygon points="${X0-4},${top} ${X1+4},${top} ${X1-12},${top-roofH} ${X0+12},${top-roofH}" fill="#8F9CA7"/>`;
      for(let i=0;i<cols;i++){ const x=X0+cw*i+cw*.3; s+=`<rect x="${x}" y="${top-roofH+6}" width="${cw*.4}" height="${roofH-8}" fill="#F2EEE7"/><rect x="${x+3}" y="${top-roofH+10}" width="${cw*.4-6}" height="${roofH-15}" fill="#647684"/>`; }
      for(const cx of [X0+30,X1-50]) s+=`<rect x="${cx}" y="${top-roofH-12}" width="18" height="14" fill="#B79E80"/>`;
      s+=`<rect x="${X0-4}" y="${top-3}" width="${BW+8}" height="5" fill="${line}"/>`;
    } else s+=`<rect x="${X0-3}" y="${top-6}" width="${BW+6}" height="8" fill="#BEB9B1"/>`;
    for(let f=0;f<et;f++){
      const y0=top+f*fh;
      if(!modern) s+=`<rect x="${X0}" y="${y0+fh-2}" width="${BW}" height="2" fill="${line}"/>`;
      if(modern){ s+=`<rect x="${X0+10}" y="${y0+fh*.22}" width="${BW-20}" height="${fh*.52}" fill="#6F8090"/><rect x="${X0+10}" y="${y0+fh*.22}" width="${BW-20}" height="${fh*.16}" fill="#93A6B5"/>`; continue; }
      for(let i=0;i<cols;i++){ const x=X0+cw*i+cw*.29, w=cw*.42, h=fh*.62, yy=y0+fh*.2;
        s+=`<rect x="${x-2}" y="${yy-3}" width="${w+4}" height="3" fill="${line}"/><rect x="${x}" y="${yy}" width="${w}" height="${h}" fill="#5F707D"/><rect x="${x}" y="${yy}" width="${w}" height="${h*.3}" fill="#8EA2B1"/><rect x="${x+w/2-.7}" y="${yy}" width="1.4" height="${h}" fill="#EDE6DA"/>`; }
      if(f===1||f===et-1) s+=`<rect x="${X0+6}" y="${y0+fh*.68}" width="${BW-12}" height="2.5" fill="#2E2E2E"/><rect x="${X0+6}" y="${y0+fh*.68}" width="${BW-12}" height="${fh*.14}" fill="none" stroke="#2E2E2E" stroke-width="1.2" stroke-dasharray="1.2 4"/>`;
    }
    const gy=G-gh;
    s+=`<rect x="${X0}" y="${gy}" width="${BW}" height="${gh}" fill="${modern?"#CFCBC4":"#E0D2B8"}"/>`;
    if(shop){ const awn=pick(["#B5473A","#2F5D50","#B98B2E","#3E4C7A","#8C3B5E"]); const n=Math.max(2,Math.floor(cols/2));
      const sw=BW/n; for(let i=0;i<n;i++){ const x=X0+sw*i+6, w=sw-12; s+=`<rect x="${x}" y="${gy+gh*.28}" width="${w}" height="${gh*.72}" fill="#4A5966"/><rect x="${x+3}" y="${gy+gh*.34}" width="${w-6}" height="${gh*.4}" fill="#A9BCC8"/>`;
        s+=`<polygon points="${x-3},${gy+gh*.12} ${x+w+3},${gy+gh*.12} ${x+w+8},${gy+gh*.34} ${x-8},${gy+gh*.34}" fill="${awn}"/><rect x="${x-8}" y="${gy+gh*.32}" width="${w+16}" height="3" fill="#00000022"/>`; }
    } else {
      s+=`<path d="M${W/2-18} ${G}V${gy+gh*.4}a18 18 0 0136 0V${G}z" fill="#2F4A3A"/>`;
      for(let i=0;i<cols;i++){ const x=X0+cw*i+cw*.3; if(Math.abs(x+cw*.2-W/2)<30) continue; s+=`<rect x="${x}" y="${gy+gh*.3}" width="${cw*.4}" height="${gh*.5}" fill="#5F707D"/>`; }
    }
  }
  s+=`<rect x="0" y="${G}" width="${W}" height="${H-G}" fill="#D2CABD"/><rect x="0" y="${G}" width="${W}" height="3" fill="#BDB4A6"/>`;
  s+=`</svg>`; artCache.set(key,s); return s;
}

// --- libellés -------------------------------------------------------------
function itemLabel(c, it) {
  if (!it) return c.lk === "p" ? `${fmtN(c.lots)} parts` : `${c.lots} ${lotWord(c, c.lots)}`;
  if (it.t === "key") { const k = it.ks[0]; return c.lk === "l" ? `Clé · ${lotName(c, k)} · ${ord(floorOfLot(c, k))} étage` : `Clé · ${lotName(c, k)}`; }
  if (it.t === "floor") return `${ord(floorOfLot(c, it.ks[0]))} étage entier · ${it.ks.length} logements`;
  if (it.t === "title") return `Immeuble entier · ${c.lots} ${lotWord(c, c.lots)}`;
  if (it.t === "part") return `${it.n} part${it.n > 1 ? "s" : ""} sur ${fmtN(c.lots)}`;
  if (it.t === "own") {
    if (it.n) return `${fmtN(it.n)} part${it.n > 1 ? "s" : ""} sur ${fmtN(c.lots)}`;
    if (it.ks.length === c.lots && c.lots > 1) return `Immeuble entier · ${c.lots} ${lotWord(c, c.lots)}`;
    if (it.ks.length === 1) return c.lk === "l" ? `${lotName(c, it.ks[0])} · ${ord(floorOfLot(c, it.ks[0]))} étage` : lotName(c, it.ks[0]);
    return `${it.ks.length} ${lotWord(c, it.ks.length)} sur ${c.lots}`;
  }
  return "";
}
const itemUnits = it => it.n || (it.ks ? it.ks.length : 1);
function rarSq(r, size) { return `<span class="sq" style="background:${RAR[r].c};${size ? `width:${size}px;height:${size}px` : ""}">${RAR[r].l}</span>`; }

// --- la carte « plaque de rue » ---------------------------------------------
function plaqueTitle(c) { return c.name ? cap(c.name) : (c.adr || "Immeuble"); }
function cardHTML(c, { w, item, tier, count } = {}) {
  const r = tier || c.r, n = item ? Math.max(1, itemUnits(item)) : 1;
  const t = plaqueTitle(c), long = t.length > 22;
  return `<div class="hc t${r}" style="${w ? `--w:${w}` : ""}"><div class="in">
    <div class="plq"><small>${c.arr === 1 ? "1<sup>er</sup>" : c.arr + "<sup>e</sup>"} Arr<sup>t</sup></small><b class="${long ? "long" : ""}">${esc(t)}</b></div>
    <div class="ph">${photo(c)}<span class="rb">${RAR[r].l}</span>${count ? `<span class="cnt">${esc(count)}</span>` : ""}</div>
    <div class="bd"><div class="kd">${esc(itemLabel(c, item) || kindLabel(c))}</div>
      <div class="nums num"><div><span>LOYER / JOUR</span><b class="g">${fmtE(c.rent * n)}</b></div><div class="r"><span>VALEUR</span><b>${fmtE(c.v * n)}</b></div></div>
      <div class="rn"><span>${RAR[r].n.toUpperCase()}</span><em>N° ${String(c.arr).padStart(2, "0")}-${String(li(c.g)).padStart(5, "0")}</em></div></div>
  </div></div>`;
}
function chanceText(it) {
  if (it.out) return it.out;
  if (it.amount) return (it.amount > 0 ? "+" : "−") + fmtE(Math.abs(it.amount));
  return CHANCE_TXT[it.k] || "";
}
function chanceCardHTML(it, w) {
  const [n, g] = CHANCE[it.k] || ["Carte Chance", "?"]; const bad = BAD.has(it.k);
  const col = bad ? ["#FDECEC", "#C62828", "MALUS"] : ["#E7F6EC", "#15803D", "BONUS"];
  const amt = it.amount ? (it.amount > 0 ? "+" : "−") + fmtE(Math.abs(it.amount)) : (it.out || "");
  const desc = it.amount ? "" : (CHANCE_TXT[it.k] || "");
  return `<div class="hc chance tC" style="--rc:${col[1]};--rt:${col[1]};--chs:${col[0]};--chc:${col[1]};${w ? `--w:${w}` : ""}"><div class="in">
    <div class="plq"><small>Carte Chance · ${col[2]}</small><b>${esc(n)}</b></div>
    <div class="ph"><span class="glyph">${esc(g)}</span></div>
    <div class="bd"><div class="desc">${esc(desc)}</div>${amt ? `<div class="amt num">${esc(amt)}</div>` : ""}</div>
  </div></div>`;
}
function itemFace(it, w) {
  if (it.t === "chance") return chanceCardHTML(it, w);
  const c = card(it.card); if (!c) return "";
  return cardHTML(c, { w, item: { t: it.t, ks: it.ks, n: it.n }, tier: it.tier });
}
// petit visuel d'enveloppe de booster
function packHTML(cls = "") {
  return `<div class="pack ${cls}" role="img" aria-label="Booster Haussmann"><div class="tear"></div><div class="pin">
    <span class="plaq">HAUSSMANN</span>
    <svg class="facade" viewBox="0 0 120 80" fill="none" stroke="#9FB4D6" stroke-width="2" stroke-linejoin="round">
      <path d="M6 30h108M14 30l6-12h80l6 12M10 78V30M110 78V30M4 78h112"/><path d="M30 18v-6h8v6M82 18v-6h8v6"/>
      ${[0, 1, 2, 3, 4].map(i => `<rect x="${17 + i * 19}" y="36" width="9" height="12"/><rect x="${17 + i * 19}" y="54" width="9" height="12"/>`).join("")}
      <path d="M12 51h96M12 69h96" stroke-dasharray="2 3"/></svg>
    <span class="lbl">BOOSTER<small>4 biens · 1 Chance</small></span></div></div>`;
}
