"use strict";
// =====================================================================
//  Les façades des immeubles (21/10/2026, demandes du propriétaire : « simuler a minima la façade des appartements
//  haussmanniens, ça semble pauvre en design » ; « le plus beau, sans défoncer la mémoire du navigateur ni la vitesse »).
//  La carte graphique dessine elle-même, sur les murs des immeubles en 3D : les fenêtres de chaque étage, les balcons
//  filants en fer (2e et dernier étage), la corniche, les vitrines du rez-de-chaussée, les joints de pierre, et le
//  dernier étage en zinc avec ses lucarnes (couche rf), alignées sur les fenêtres.
//  Rien de plus en mémoire (pas d'image, pas de géométrie) : on complète la recette des murs de MapLibre (son shader
//  « fill-extrusion ») au moment où la carte la prépare. Les motifs sont filtrés (ils ne grésillent pas quand la caméra
//  bouge) et s'effacent quand ils deviennent plus petits qu'un pixel : de loin, les immeubles restent comme avant.
//  Le style suit l'époque (tuiles : propriété f, au zoom 15 seulement, scripts/make_tiles.py) : 1 haussmannien,
//  2 ancien (avant 1800), 3 moderne (après 1945), 4 entre-deux-guerres ; f = style × 16 + variante (largeur des travées).
//  Le code passe à la carte graphique dans l'alpha de la couleur, que MapLibre n'utilise pas pour les volumes :
//  alpha = (128 + code + 0,25) / 255 (un alpha de 1 : mur uni). L'étage en zinc (rf) a le code 80 + variante.
//  Si la recette est refusée par un appareil (compilation ou liaison), on remet celle de MapLibre : murs unis, sans bug.
// =====================================================================
const FAC = { ok: null, slow: false };   // ok : la recette passe (null : pas encore essayée) ; slow : appareil trop lent, murs unis (facWatch)
const facForce = (() => { try { return localStorage.getItem("hm_fac"); } catch (e) { return null; } })();   // « 1 » toujours, « 0 » jamais (tests)
const FAC_MH = 3;   // hauteur de l'étage en zinc (m)
// un étage en zinc : immeubles haussmanniens et anciens (f < 48) de 11 m et plus (les tuiles d'avant le zoom 15 n'ont pas f)
const facMans = () => ["all", ["has", "f"], ["<", ["get", "f"], 48], [">=", ["get", "h"], 11]];
const facTop = () => ["case", facMans(), FAC_MH, 1];   // ce qui est retiré du haut des murs de pierre (rf le dessine)
function facCol(e, A) {   // chaque couleur « #rrggbb » de l'expression, avec le code de la façade dans l'alpha
  if (typeof e === "string" && /^#[0-9a-f]{6}$/i.test(e)) { const n = parseInt(e.slice(1), 16); return ["rgba", n >> 16, (n >> 8) & 255, n & 255, A]; }
  return Array.isArray(e) ? e.map(x => facCol(x, A)) : e;
}
const facOn = () => FAC.ok !== false && !FAC.slow && facForce !== "0";
const facBody = e => facOn() ? facCol(e, ["case", ["has", "f"], ["/", ["+", 128.25, ["get", "f"]], 255], 1]) : e;
const facRoof = e => facOn() ? facCol(e, ["case", facMans(), ["/", ["+", 208.25, ["%", ["get", "f"], 16]], 255], 1]) : e;

// ---- la recette : ce qu'on ajoute aux shaders fill-extrusion de MapLibre 4.7 ----
const FAC_VS_AT = "float colorvalue=color.r*0.2126";
const FAC_FS_AT = "varying vec4 v_color;void main() {gl_FragColor=v_color;";
// sommets : le code (alpha), la couleur vraie, et pour les murs : (mètres le long du mur, hauteur, hauteur du mur, code + 1)
// (a_normal_ed.w : distance le long du contour en unités de tuile ; tuiles du zoom 15 à Paris : 0,098224 m l'unité)
const FAC_VS = "v_fa=vec4(0.0);{highp float hmA=color.a;highp float hmC=floor(hmA*255.0+0.5)-128.0;" +
  "if(hmC>-0.5&&hmC<126.5){color=vec4(color.rgb/hmA,1.0);" +
  "if(normal.z==0.0){v_fa=vec4(a_normal_ed.w*0.098224,t>0.0?height-base:0.0,height-base,hmC+1.0);}}}";
const FAC_FS = `varying vec4 v_color;
#if defined(GL_FRAGMENT_PRECISION_HIGH) || __VERSION__ >= 300
#define HM_FAC 1
varying highp vec4 v_fa;
// part d'un pixel (de taille w) à moins de h du centre d'un motif : l'anti-crénelage le moins cher
float hmIn(float d,float h,float w){return clamp((h-d)/max(w,1e-3)+0.5,0.0,1.0);}
vec3 hmFacade(vec3 c,highp vec4 fa,vec2 fw){
  float code=fa.w-1.0;float st=floor(code*0.0625+0.01);float va=code-st*16.0;
  bool mo=st>2.5&&st<3.5;bool an=st>1.5&&st<2.5;
  float B=mo?3.4:3.05+0.04*va;float wu=fw.x/B;
  float det=1.0-smoothstep(0.22,0.55,max(wu,fw.y*0.34));   // une travée de moins de 2 pixels : le mur uni, comme avant (et rien à calculer)
  if(det<0.002)return c;
  highp float xu=fa.x/B;float dx=abs(fract(xu)-0.5);   // dans la travée (fenêtre au milieu)
  float z=fa.y;float H=fa.z;
  vec3 o;
  if(st>4.5){   // l'étage en zinc (rf) et ses lucarnes
    float y=z/max(H,0.5);float fy=fw.y/max(H,0.5);
    vec3 zc=mix(c,vec3(dot(c,vec3(0.30,0.59,0.11)))*vec3(0.93,0.98,1.06),0.55);   // le zinc, à peine teinté de la couleur de jeu (le toit la garde)
    o=zc*(0.86+0.14*y);
    o=mix(o,zc*1.12,hmIn(dx,0.20,wu)*hmIn(abs(y-0.46),0.40,fy));
    o=mix(o,zc*vec3(0.27,0.31,0.37)+vec3(0.02,0.03,0.05),hmIn(dx,0.13,wu)*hmIn(abs(y-0.47),0.29,fy));
    o=mix(o,zc*0.55,hmIn(z,0.16,fw.y));   // la gouttière
    return mix(c,o,det);
  }
  float R=mo?3.6:(an?3.3:3.8);float C=mo?0.35:0.5;float fh=mo?2.8:(an?2.6:2.75);
  if(H<R+C+2.0)R=max(H-C,2.2);
  float U=max(H-C-R,0.01);float n=max(1.0,floor(U/fh+0.5));float F=U/n;
  vec3 gz=c*vec3(0.27,0.31,0.37)+vec3(0.02,0.03,0.05);   // les vitres
  o=c;
  if(z<R){   // rez-de-chaussée : vitrines, refends, bandeau
    float sh=hmIn(dx,an?0.24:0.38,wu)*hmIn(abs(z-(R-0.8)*0.5),(R-0.8)*0.5,fw.y);
    if(!mo){o*=1.0-0.07*hmIn(abs(fract(z*1.923)-0.065),0.065,fw.y*1.923);o=mix(o,c*1.07,hmIn(abs(z-R+0.15),0.15,fw.y));}
    o=mix(o,gz*0.9,sh);
  } else if(z<H-C){   // les étages : fenêtres et leurs encadrements, volets (ancien), balcons filants (2e et dernier étage)
    float zf=(z-R)/F;float fz=fw.y/F;float k=floor(zf);float fy=zf-k;
    float ww=(an?0.30:(st>3.5?0.46:0.40))+(mod(va,4.0)-1.5)*0.02;
    bool bk=!mo&&!an&&(k==1.0||(n>3.5&&k==n-1.0));
    float y0=an?0.26:(bk?0.04:0.17);float y1=an?0.80:0.86;float yh=(y1-y0)*0.5;float dy=abs(fy-y0-yh);
    float wi;
    if(mo)wi=hmIn(abs(fract(fa.x*0.588235)-0.5),0.42,fw.x*0.588235)*hmIn(abs(fy-0.58),0.28,fz);
    else{
      if(wu<0.16)o=mix(o,min(c*1.13,vec3(1.0)),0.8*hmIn(dx,ww*0.5+0.03,wu)*hmIn(dy,yh+0.035,fz));   // (de près seulement)
      if(an)o=mix(o,c*vec3(0.74,0.80,0.78),0.85*hmIn(abs(dx-ww*0.5-0.055),0.055,wu)*hmIn(dy,yh,fz));
      wi=hmIn(dx,ww*0.5,wu)*hmIn(dy,yh,fz);
    }
    o=mix(o,gz*(0.88+0.3*z/H)*(0.78+0.3*clamp((fy-y0)/(y1-y0),0.0,1.0)),wi);   // en haut, les vitres reflètent le ciel ; l'ombre du linteau
    if(bk)o=mix(o,c*0.26,0.78*hmIn(abs(fy-0.135),0.135,fz));
    o=mix(o,c*0.78,0.85*hmIn(abs(z-H+C+0.12),0.12,fw.y));   // l'ombre de la corniche
  } else o=c*1.07;   // la corniche
  return mix(c,o,det);
}
#else
varying vec4 v_fa;
#endif
void main() {gl_FragColor=v_color;
#ifdef HM_FAC
vec2 hmW=fwidth(v_fa.xy);
if(v_fa.w>0.5)gl_FragColor.rgb=hmFacade(v_color.rgb,v_fa,hmW);
#endif
`;
// WebGL 2 : la recette passe en GLSL ES 3.00 (les dérivées y sont toujours là) ; WebGL 1 : extension OES_standard_derivatives
function facPatch(s, gl2) {
  if (typeof s !== "string") return null;
  if (s.includes("attribute vec4 a_normal_ed;") && s.includes("varying vec4 v_color;") && s.includes(FAC_VS_AT)) {
    const o = s.replace("varying vec4 v_color;", "varying vec4 v_color;varying highp vec4 v_fa;").replace(FAC_VS_AT, FAC_VS + FAC_VS_AT);
    return gl2 ? "#version 300 es\n" + o.replace(/\battribute\b/g, "in").replace(/\bvarying\b/g, "out").replace(/\btexture2D\b/g, "texture") : o;
  }
  if (s.includes(FAC_FS_AT)) {
    const o = s.replace(FAC_FS_AT, FAC_FS);
    return gl2 ? "#version 300 es\nout highp vec4 hm_frag;\n" + o.replace(/\bvarying\b/g, "in").replace(/\btexture2D\b/g, "texture").replace(/\bgl_FragColor\b/g, "hm_frag")
               : "#extension GL_OES_standard_derivatives : enable\n" + o;
  }
  return null;
}
// à appeler juste après new maplibregl.Map (la carte prépare ses recettes à la première image)
function facInstall(m) {
  try {
    const gl = m && m.painter && m.painter.context && m.painter.context.gl;
    if (!gl || gl.__hmFac) return; gl.__hmFac = 1;
    if (new URLSearchParams(location.search).has("murs")) { FAC.ok = false; return; }   // ?murs : murs unis (pour comparer)
    const gl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    if (!gl2 && !gl.getExtension("OES_standard_derivatives")) { FAC.ok = false; return; }
    const orig = new WeakMap(), ss = gl.shaderSource, cs = gl.compileShader, lp = gl.linkProgram;
    const fail = why => {   // la recette ne passe pas sur cet appareil : murs unis (et couleurs sans code)
      if (FAC.ok !== false) { FAC.ok = false; console.warn("façades désactivées :", why); setTimeout(() => typeof applyMode === "function" && applyMode(), 0); }
    };
    gl.shaderSource = function (sh, s) {
      const p = FAC.ok === false ? null : facPatch(s, gl2);
      if (p) orig.set(sh, s); else orig.delete(sh);
      return ss.call(this, sh, p || s);
    };
    gl.compileShader = function (sh) {
      cs.call(this, sh);
      if (orig.has(sh) && !this.getShaderParameter(sh, this.COMPILE_STATUS)) {
        fail(this.getShaderInfoLog(sh)); ss.call(this, sh, orig.get(sh)); orig.delete(sh); cs.call(this, sh);
      }
    };
    gl.linkProgram = function (pr) {
      lp.call(this, pr);
      const shs = this.getAttachedShaders(pr) || []; if (!shs.some(x => orig.has(x))) return;
      if (this.getProgramParameter(pr, this.LINK_STATUS)) { if (FAC.ok === null) FAC.ok = true; return; }
      fail(this.getProgramInfoLog(pr));
      for (const x of shs) if (orig.has(x)) { ss.call(this, x, orig.get(x)); orig.delete(x); cs.call(this, x); }
      lp.call(this, pr);
    };
    facWatch(m);
  } catch (e) { FAC.ok = false; }
}
// « sans impacter la lenteur » : si l'appareil peine déjà quand la carte bouge (moins de 22 images par seconde en marchant
// ou en faisant glisser la carte, sur les 120 premières images après 15 s de jeu), on remet les murs unis pour la partie.
function facWatch(m) {
  if (facForce === "1") return;
  const t0 = performance.now(); let last = 0; const dts = [];
  const tick = () => {
    const now = performance.now(), dt = now - last; last = now;
    if (now - t0 < 15000 || document.visibilityState !== "visible" || dt > 2000) return;
    // (seulement quand la carte est redessinée à chaque image : la caméra suit son personnage qui marche, ou la carte bouge)
    const follow = typeof meP === "function" && !!(meP() || {}).path && typeof CAM !== "undefined" && CAM.on && (typeof cur !== "function" || cur() === "map");
    if (!follow && !m.isMoving()) return;
    dts.push(dt); if (dts.length < 120) return;
    m.off("render", tick); dts.sort((a, b) => a - b); const med = dts[60];
    if (med > 45 && FAC.ok === true) {   // la recette de MapLibre revient telle quelle (programmes refaits) et les couleurs perdent leur code
      FAC.slow = true; FAC.ok = false; console.warn(`façades coupées : ${Math.round(1000 / med)} images par seconde`);
      try { const c = m.painter && m.painter.cache; if (c) for (const k of Object.keys(c)) if (k.startsWith("fillExtrusion")) delete c[k]; } catch (e) { }
      if (typeof applyMode === "function") applyMode(); m.triggerRepaint();
    }
  };
  m.on("render", tick);
}
