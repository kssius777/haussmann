// =====================================================================
//  Maquettes 3D stylisées des grands monuments de Paris (three.js dans MapLibre)
//  Repère local : x = longueur (axe du monument), y = hauteur, z = largeur ; mètres.
// =====================================================================
(function(){
const T=window.THREE;
const COL={stone:0xf4efe4,stone2:0xe6dccb,cream:0xfbf7ee,zinc:0x9fb4c7,slate:0x6f8396,copper:0x86cfb8,gold:0xf2c14e,glass:0xa8dcf7,iron:0xb47a52,red:0xe2483d,dark:0x3b4a5e,white:0xffffff,blue:0x4f7cff,green:0x5fbf8f,yellow:0xf6c443,pink:0xD9A441};
const mats={};
function M(c,o){ const k=c+":"+(o||1); if(!mats[k]){ mats[k]=new T.MeshStandardMaterial({color:c,roughness:.75,metalness:.05,flatShading:true,transparent:(o||1)<1,opacity:o||1}); } return mats[k]; }
function box(g,w,h,d,c,x,y,z,o){ const m=new T.Mesh(new T.BoxGeometry(w,h,d),M(c,o)); m.position.set(x||0,(y||0)+h/2,z||0); g.add(m); return m; }
function cyl(g,rt,rb,h,c,x,y,z,seg,o){ const m=new T.Mesh(new T.CylinderGeometry(rt,rb,h,seg||20),M(c,o)); m.position.set(x||0,(y||0)+h/2,z||0); g.add(m); return m; }
function dome(g,r,c,x,y,z,sy){ const m=new T.Mesh(new T.SphereGeometry(r,24,12,0,Math.PI*2,0,Math.PI/2),M(c)); m.scale.y=sy||1; m.position.set(x||0,y||0,z||0); g.add(m); return m; }
function cone(g,r,h,c,x,y,z,seg){ const m=new T.Mesh(new T.ConeGeometry(r,h,seg||16),M(c)); m.position.set(x||0,(y||0)+h/2,z||0); g.add(m); return m; }
function prism(g,L,h,W,c,x,y,z){ // pitched roof along x
  const s=new T.Shape(); s.moveTo(-W/2,0); s.lineTo(W/2,0); s.lineTo(0,h); s.lineTo(-W/2,0);
  const geo=new T.ExtrudeGeometry(s,{depth:L,bevelEnabled:false}); geo.translate(0,0,-L/2); const m=new T.Mesh(geo,M(c)); m.rotation.y=Math.PI/2; m.position.set(x||0,y||0,z||0); g.add(m); return m; }
function vault(g,L,r,c,x,y,z,o){ const m=new T.Mesh(new T.CylinderGeometry(r,r,L,24,1,false,0,Math.PI),M(c,o)); m.rotation.z=Math.PI/2; m.rotation.y=0; m.position.set(x||0,y||0,z||0); g.add(m); return m; }
function beam(g,a,b,t,c){ const A=new T.Vector3(...a),B=new T.Vector3(...b); const len=A.distanceTo(B); const m=new T.Mesh(new T.BoxGeometry(t,len,t),M(c)); m.position.copy(A.clone().add(B).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),B.clone().sub(A).normalize()); g.add(m); return m; }
function columns(g,L,W,h,n,r,c,y){ for(let i=0;i<n;i++){ const x=-L/2+L*(i+.5)/n; cyl(g,r,r,h,c,x,y||0,W/2); cyl(g,r,r,h,c,x,y||0,-W/2); } }
// ---- aides des monuments ajoutés le 19/10/2026 (obélisque, gares, églises…) ----
// tronc de pyramide à base rectangulaire (toits à la Mansart, pavillons, talus) : L×W en bas, k·L × k·W en haut
function frustum(g,L,W,h,k,c,x,y,z){ const geo=new T.CylinderGeometry(k,1,h,4,1); geo.rotateY(Math.PI/4); const m=new T.Mesh(geo,M(c)); m.scale.set(L/Math.SQRT2,1,W/Math.SQRT2); m.position.set(x||0,(y||0)+h/2,z||0); g.add(m); return m; }
// cadran d'horloge (disque blanc + 2 aiguilles) tourné vers +x (1), -x (-1), +z (2) ou -z (-2)
function clock(g,r,x,y,z,dir){ const grp=new T.Group(); const d=new T.Mesh(new T.CylinderGeometry(r,r,.5,24),M(COL.white)); d.rotation.x=Math.PI/2; grp.add(d);
  const a=new T.Mesh(new T.BoxGeometry(r*.12,r*.62,.3),M(COL.dark)); a.position.set(0,r*.28,.32); grp.add(a); const b=new T.Mesh(new T.BoxGeometry(r*.5,r*.1,.3),M(COL.dark)); b.position.set(r*.22,0,.32); grp.add(b);
  grp.traverse(o=>o.userData.noEdge=true); grp.position.set(x,y,z); grp.rotation.y=dir===1?Math.PI/2:dir===-1?-Math.PI/2:dir===-2?Math.PI:0; g.add(grp); return grp; }
// une église « type » : nef + bas-côtés, transept, abside, façade (0, 1 ou 2 tours, ou une tour sur le côté), portique, dôme
//  fx : bout de l'axe x où est la façade (-1/1) ; n : hauteur de la nef ; nw : largeur de la nef (part de W) ; t : tours (0, 1, 2, "side") ;
//  tw/th : largeur et hauteur des tours ; top : "spire" | "round" | "dome" | "pyr" | plat ; sp : hauteur du haut des tours ; por : colonnes du portique ;
//  gothic : arcs-boutants ; xsp : flèche à la croisée ; dome : {u (part de L depuis la façade), r, d (tambour), sy, c}
function church(g,L,W,o){
  const fx=o.fx||-1, n=o.n||22, nw=W*(o.nw||.46), ap=o.ap!==false, X=u=>fx*(L/2-u), rp=o.rp||.4, rc=o.rc||COL.slate;
  const tw=o.tw||nw*.42, fw=Math.min(W,(o.fw||.9)*W), fd=o.t?tw:(o.por?6:3), nl=L-fd-(ap?nw/2:0), nc=X(fd+nl/2);
  if(o.aisle!==false) box(g,nl,n*.6,Math.min(W*.92,nw*1.9),COL.stone2,nc,0);
  box(g,nl,n,nw,COL.stone,nc,0); prism(g,nl,nw*rp,nw,rc,nc,n);
  if(o.tr!==false){ const tu=fd+nl*(o.tu||.68), tl=Math.min(W,nw*2.2); box(g,nw*.9,n,tl,COL.stone,X(tu),0); prism(g,tl,nw*rp,nw*.9,rc,X(tu),n).rotation.y=0;
    if(o.xsp) cone(g,nw*.1,o.xsp,rc,X(tu),n+nw*rp*.7,0,8); }
  if(ap){ cyl(g,nw/2,nw/2,n,COL.stone,X(L-nw/2),0,0,14); cone(g,nw/2+.4,nw*.36,rc,X(L-nw/2),n,0,14); }
  if(o.gothic) for(let i=0;i<6;i++){ const x=X(fd+nl*(i+.5)/6); for(const s of [-1,1]) beam(g,[x,n*.6,s*Math.min(W*.46,nw*.95)],[x,n*.92,s*nw/2],1.3,COL.stone2); }
  box(g,fd,n*(o.fh||1.12),fw,COL.stone,X(fd/2),0);
  if(!o.t||o.t==="side") prism(g,fw,nw*.4,fd,COL.stone2,X(fd/2),n*(o.fh||1.12)).rotation.y=0;
  const tower=z=>{ const x=X(tw/2); box(g,tw,o.th,tw,COL.stone,x,0,z);
    if(o.top==="spire") cone(g,tw*.5,o.sp,o.spc||rc,x,o.th,z,8);
    else if(o.top==="round"){ cyl(g,tw*.36,tw*.4,o.sp*.7,COL.stone,x,o.th,z,16); dome(g,tw*.36,rc,x,o.th+o.sp*.7,z,.6); }
    else if(o.top==="dome"){ cyl(g,tw*.32,tw*.32,o.sp*.45,COL.stone,x,o.th,z,12); dome(g,tw*.32,rc,x,o.th+o.sp*.45,z,1.2); cyl(g,.4,.4,o.sp*.25,COL.gold,x,o.th+o.sp*.45+tw*.32*1.2,z,6); }
    else if(o.top==="pyr") frustum(g,tw,tw,o.sp,.08,rc,x,o.th,z);
    else box(g,tw*1.06,1.2,tw*1.06,COL.stone2,x,o.th,z); };
  if(o.t===2){ tower(fw/2-tw/2); tower(-(fw/2-tw/2)); } else if(o.t===1) tower(0); else if(o.t==="side") tower((o.tz||-1)*(nw/2+tw/2));
  if(o.por){ const px=X(-2.4); for(let i=0;i<o.por;i++) cyl(g,.9,.9,n*.7,COL.cream,px,0,-fw*.38+fw*.76*i/(o.por-1),10);
    box(g,4.8,1.6,fw*.84,COL.stone2,px,n*.7); prism(g,fw*.84,4.5,4.8,COL.stone2,px,n*.7+1.6).rotation.y=0; }
  if(o.dome){ const d=o.dome, dx=X(d.u*L), sy=d.sy||1.3, dy=n+(d.d||0); if(d.d) cyl(g,d.r,d.r,d.d,COL.stone,dx,n,0,20); dome(g,d.r,d.c||rc,dx,dy,0,sy);
    const ly=dy+d.r*sy; cyl(g,d.r*.16,d.r*.2,d.r*.5,COL.stone2,dx,ly-1,0,10); cone(g,d.r*.17,d.r*.4,COL.gold,dx,ly-1+d.r*.5,0,10); }
}
// fusion : un seul maillage par couleur et un seul jeu de traits par monument (des centaines d'appels de dessin en moins, plus léger sur téléphone)
function cat(geos){ let n=0; for(const q of geos) n+=q.attributes.position.count; const pos=new Float32Array(n*3), nor=geos[0].attributes.normal?new Float32Array(n*3):null; let o=0;
  for(const q of geos){ pos.set(q.attributes.position.array,o*3); if(nor&&q.attributes.normal) nor.set(q.attributes.normal.array,o*3); o+=q.attributes.position.count; }
  const r=new T.BufferGeometry(); r.setAttribute("position",new T.BufferAttribute(pos,3)); if(nor) r.setAttribute("normal",new T.BufferAttribute(nor,3)); return r; }
function merge(g){
  g.updateMatrixWorld(true); const inv=new T.Matrix4().copy(g.matrixWorld).invert(), spin=g.userData.spin, meshes=new Map(), lines=new Map(), drop=[];
  g.traverse(o=>{ if(o===g) return; let p=o; while(p&&p!==g){ if(p===spin) return; p=p.parent; }
    if(!(o.isMesh||o.isLineSegments)) return; const k=o.isMesh?o.material.uuid:o.material.color.getHex()+":"+o.material.opacity, map=o.isMesh?meshes:lines;
    let q=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone(); q.applyMatrix4(new T.Matrix4().multiplyMatrices(inv,o.matrixWorld));
    if(!map.has(k)) map.set(k,{mat:o.material,geos:[]}); map.get(k).geos.push(q); drop.push(o); });
  for(const o of drop){ o.parent.remove(o); o.geometry.dispose(); }
  for(const {mat,geos} of meshes.values()) g.add(new T.Mesh(cat(geos),mat));
  for(const {mat,geos} of lines.values()) g.add(new T.LineSegments(cat(geos),mat));
}
function edges(g,c){ g.traverse(o=>{ if(o.isMesh&&!o.userData.noEdge){ const e=new T.LineSegments(new T.EdgesGeometry(o.geometry,30),new T.LineBasicMaterial({color:c||0x8a7d68,transparent:true,opacity:.35})); e.position.copy(o.position); e.rotation.copy(o.rotation); e.scale.copy(o.scale); e.quaternion.copy(o.quaternion); g.add(e); } }); }

const B={
  eiffel(g){ const legs=[[1,1],[1,-1],[-1,1],[-1,-1]]; const lv=[[0,62],[57,36],[116,15],[276,4.5]];
    for(const [sx,sz] of legs){ for(let i=0;i<3;i++){ const [y0,r0]=lv[i],[y1,r1]=lv[i+1]; const t=i===0?9:i===1?6:4;
      beam(g,[sx*r0,y0,sz*r0],[sx*r1,y1,sz*r1],t,COL.iron);
      beam(g,[sx*r0,y0,sz*(r0-12+i*4)],[sx*r1,y1,sz*r1],2.2,COL.iron); beam(g,[sx*(r0-12+i*4),y0,sz*r0],[sx*r1,y1,sz*r1],2.2,COL.iron); } }
    // arches between legs
    for(let s=0;s<4;s++){ const a=new T.Mesh(new T.TorusGeometry(40,1.6,6,24,Math.PI),M(COL.iron)); a.rotation.y=s*Math.PI/2; const dx=Math.cos(s*Math.PI/2)*52, dz=Math.sin(s*Math.PI/2)*52; a.position.set(dx,10,dz); a.rotation.y=s%2?0:Math.PI/2; g.add(a); }
    box(g,78,5,78,COL.iron,0,57); box(g,40,4,40,COL.iron,0,115); box(g,12,6,12,COL.iron,0,274);
    cyl(g,1.2,2.4,48,COL.iron,0,280); cyl(g,.4,.4,14,COL.gold,0,326,0,8);
    const glow=cyl(g,3,3,3,COL.gold,0,330,0,10); glow.material=new T.MeshBasicMaterial({color:COL.gold}); },
  arc(g,L,W,h){ const pier=L*.32; box(g,pier,h*.62,W,COL.stone,-L/2+pier/2,0); box(g,pier,h*.62,W,COL.stone,L/2-pier/2,0); box(g,L,h*.38,W,COL.stone2,0,h*.62);
    const a=new T.Mesh(new T.CylinderGeometry(L*.18,L*.18,W*1.01,24,1,false,0,Math.PI),M(COL.stone)); a.rotation.x=Math.PI/2; a.rotation.z=Math.PI/2; a.position.set(0,h*.62,0); a.scale.set(1,1,1); g.add(a);
    box(g,L*1.02,1.4,W*1.02,COL.cream,0,h*.86); },
  notredame(g,L,W){ const facade=-1; const nl=L*.78; box(g,nl,33,W*.42,COL.stone,L*.06,0); prism(g,nl,12,W*.42,COL.slate,L*.06,33);
    box(g,W*.38,30,W*.95,COL.stone,L*.12,0); prism(g,W*.38,10,W*.95,COL.slate,L*.12,30); g.children[g.children.length-1].rotation.y=0;
    cyl(g,W*.21,W*.21,33,COL.stone,L*.45,0,0,16); dome(g,W*.21,COL.slate,L*.45,33,0,.8);
    const fx=facade*(L/2-8); box(g,16,69,14,COL.stone,fx,0,W*.24); box(g,16,69,14,COL.stone,fx,0,-W*.24); box(g,16,45,W*.34,COL.stone2,fx,0,0);
    cone(g,2.4,48,COL.slate,L*.12,40,0,8);
    for(let i=0;i<6;i++){ beam(g,[L*(-.25+i*.12),0,W*.42],[L*(-.25+i*.12),26,W*.22],1.6,COL.stone2); beam(g,[L*(-.25+i*.12),0,-W*.42],[L*(-.25+i*.12),26,-W*.22],1.6,COL.stone2); } },
  sacrecoeur(g,L,W){ box(g,L*.7,30,W*.8,COL.white,-L*.05,0); box(g,W*.8,30,W*1.1,COL.white,-L*.05,0);
    cyl(g,10,10,18,COL.white,-L*.05,30,0,24); dome(g,10,COL.white,-L*.05,48,0,1.5); cyl(g,1.4,2.4,10,COL.white,-L*.05,63,0,12); cone(g,1.4,6,COL.white,-L*.05,73,0,12);
    for(const [dx,dz] of [[1,1],[1,-1],[-1,1],[-1,-1]]){ cyl(g,4,4,8,COL.white,-L*.05+dx*13,30,dz*12,16); dome(g,4,COL.white,-L*.05+dx*13,38,dz*12,1.4); }
    box(g,12,58,12,COL.white,L*.38,0); dome(g,6,COL.white,L*.38,58,0,1.5); box(g,14,14,W*.7,COL.cream,-L*.42,0); },
  montparnasse(g,L,W,h){ const m=box(g,L,h,W,COL.dark,0,0); m.material=new T.MeshStandardMaterial({color:COL.dark,metalness:.4,roughness:.25,flatShading:true});
    box(g,L*1.01,4,W*1.01,COL.white,0,h-6); box(g,L*.6,6,W*.6,COL.slate,0,h); for(let i=1;i<14;i++) box(g,L*1.005,.6,W*1.005,0x5a6b80,0,i*h/14); },
  louvre(g,L,W,h){ const p=new T.Mesh(new T.ConeGeometry(L*.71,h,4),M(COL.glass,.62)); p.rotation.y=Math.PI/4; p.position.y=h/2; p.userData.noEdge=true; g.add(p);
    const e=new T.LineSegments(new T.EdgesGeometry(p.geometry),new T.LineBasicMaterial({color:0x5b7a96})); e.rotation.y=Math.PI/4; e.position.y=h/2; g.add(e);
    box(g,L*1.6,.6,L*1.6,COL.cream,0,0); },
  pantheon(g,L,W,h){ box(g,L*.6,30,W*.3,COL.stone,0,0); box(g,W*.3,30,L*.6,COL.stone,0,0); box(g,L*.18,26,W*.42,COL.stone2,-L*.39,0); columns(g,L*.16,W*.36,20,4,1.2,COL.cream,0);
    g.children.slice(-8).forEach(m=>m.position.x+=-L*.39); prism(g,L*.18,7,W*.42,COL.stone2,-L*.39,26);
    cyl(g,16,16,16,COL.stone,0,30,0,24); for(let i=0;i<16;i++){ const a=i/16*Math.PI*2; cyl(g,.8,.8,14,COL.cream,Math.cos(a)*17.5,30,Math.sin(a)*17.5,6); }
    cyl(g,14,14,6,COL.stone,0,46,0,24); dome(g,14,COL.slate,0,52,0,1.15); cyl(g,2.5,2.5,8,COL.stone,0,67,0,12); dome(g,2.5,COL.slate,0,75,0,1.4); },
  garnier(g,L,W,h){ box(g,L,22,W,COL.stone,0,0); box(g,L*.18,30,W*.9,COL.stone2,-L*.42,0); prism(g,L*.3,14,W*.7,COL.copper,L*.32,22);
    dome(g,W*.28,COL.copper,0,22,0,.55); cyl(g,2,2,6,COL.gold,0,22+W*.28*.55,0,10);
    for(const dz of [-1,1]) box(g,4,8,4,COL.gold,-L*.5+2,30,dz*W*.38); box(g,4,10,4,COL.gold,L*.47,36,0); columns(g,L*.16,W*.86,14,7,.9,COL.cream,8); g.children.slice(-14).forEach(m=>{m.position.x+=-L*.43;}); },
  grandpalais(g,L,W,h){ box(g,L,16,W,COL.stone,0,0); const v=vault(g,L*.92,W*.22,COL.glass,0,16,0,.55); v.userData.noEdge=true;
    const v2=vault(g,W*.85,W*.18,COL.glass,0,16,0,.55); v2.rotation.y=Math.PI/2; v2.userData.noEdge=true;
    cyl(g,W*.2,W*.2,4,COL.stone2,0,16,0,24); dome(g,W*.2,COL.glass,0,20,0,1.2).material=M(COL.glass,.6); cyl(g,1,1,8,COL.gold,0,20+W*.24,0,8); },
  pompidou(g,L,W,h){ const b=box(g,L,h,W,COL.glass,0,0,0,.7); b.userData.noEdge=true; const cols=[COL.blue,COL.green,COL.red,COL.yellow];
    for(let i=0;i<12;i++){ const c=cols[i%4]; const p=cyl(g,1.6,1.6,L,c,0,4+i*3.2,W/2+2,10); p.rotation.z=Math.PI/2; p.position.y=4+i*3.2; }
    for(let i=0;i<9;i++){ box(g,1.2,h,1.2,COL.white,-L/2+i*L/8,0,-W/2-1); box(g,1.2,h,1.2,COL.white,-L/2+i*L/8,0,W/2+1); }
    beam(g,[-L*.45,2,-W/2-4],[L*.4,h-2,-W/2-4],3.4,COL.red); for(const x of [-L*.3,0,L*.3]) cyl(g,2.2,2.2,10,cols[(x>0)+1],x,h,0,12); },
  orsay(g,L,W,h){ box(g,L,20,W,COL.stone,0,0); const v=vault(g,L*.86,W*.34,COL.glass,0,20,0,.6); v.userData.noEdge=true;
    for(const sx of [-1,1]){ box(g,W*.32,32,W*.9,COL.stone2,sx*(L/2-W*.16),0); const ck=cyl(g,5.5,5.5,1,COL.gold,sx*(L/2-W*.16),24,-W*.46,24); ck.rotation.x=Math.PI/2; ck.position.y=26; prism(g,W*.32,6,W*.9,COL.slate,sx*(L/2-W*.16),32); } },
  madeleine(g,L,W,h){ box(g,L,6,W,COL.stone2,0,0); box(g,L*.84,18,W*.66,COL.stone,0,6); columns(g,L*.94,W*.86,18,13,1.3,COL.cream,6);
    for(let i=0;i<5;i++){ cyl(g,1.3,1.3,18,COL.cream,-L*.47,6,-W*.43+i*W*.215,8); cyl(g,1.3,1.3,18,COL.cream,L*.47,6,-W*.43+i*W*.215,8); }
    box(g,L,2.5,W,COL.stone2,0,24); prism(g,L,7,W,COL.slate,0,26.5); },
  luxembourg(g,L,W,h){ box(g,L,18,W*.24,COL.stone,0,0,W*.38); prism(g,L,7,W*.24,COL.slate,0,18,W*.38); for(const sx of [-1,1]){ box(g,L*.18,18,W,COL.stone,sx*L*.41,0); prism(g,W,7,L*.18,COL.slate,sx*L*.41,18).rotation.y=0; }
    box(g,L*.2,22,W*.3,COL.stone2,0,0,-W*.35); dome(g,L*.08,COL.slate,0,22,-W*.35,1.3); cyl(g,1,1,5,COL.gold,0,22+L*.1,-W*.35,8); },
  elysee(g,L,W,h){ box(g,L*.7,16,W*.3,COL.stone,0,0,-W*.2); prism(g,L*.7,6,W*.3,COL.slate,0,16,-W*.2); for(const sx of [-1,1]){ box(g,L*.15,12,W*.7,COL.stone,sx*L*.37,0,W*.1); prism(g,W*.7,5,L*.15,COL.slate,sx*L*.37,12,W*.1).rotation.y=0; }
    box(g,L*.12,4,2,COL.blue,0,17,-W*.36); },
  palaisroyal(g,L,W,h){ const t=W*.16; box(g,L,h,t,COL.stone,0,0,-W/2+t/2); box(g,L,h,t,COL.stone,0,0,W/2-t/2); box(g,t,h,W,COL.stone,-L/2+t/2,0); box(g,t,h,W,COL.stone,L/2-t/2,0);
    prism(g,L,6,t,COL.slate,0,h,-W/2+t/2); prism(g,L,6,t,COL.slate,0,h,W/2-t/2); box(g,L*.86,.4,W*.6,COL.green,0,0); for(let i=0;i<10;i++) cyl(g,.8,.8,1.6,COL.white,-L*.35+i*L*.078,0,0,8); },
  saintechapelle(g,L,W,h){ box(g,L,28,W,COL.stone,0,0); prism(g,L,16,W,COL.slate,0,28); cone(g,1.8,32,COL.gold,L*.1,40,0,8);
    for(let i=0;i<5;i++){ for(const sz of [-1,1]){ const w=box(g,L*.12,18,.6,i%2?0x6d5bd0:0x3f6fd8,-L*.4+i*L*.2,6,sz*(W/2+.3)); w.userData.noEdge=true; } }
    for(const sx of [-1,1]) cone(g,1.4,10,COL.stone2,sx*L*.5,28,W*.5,6); },
  sorbonne(g,L,W,h){ box(g,L,18,W,COL.stone,0,0); prism(g,L,6,W,COL.slate,0,18); box(g,W*.4,24,W*.42,COL.stone2,-L*.3,0); cyl(g,8,8,8,COL.stone2,-L*.3,24,0,20); dome(g,8,0x3c4f7a,-L*.3,32,0,1.3); cyl(g,1.6,1.6,6,COL.stone2,-L*.3,42,0,10); },
  mosquee(g,L,W,h){ box(g,L,9,W,COL.white,0,0); box(g,L*.7,.6,W*.5,COL.green,0,9); box(g,9,33,9,COL.white,L*.36,0,-W*.3); box(g,10,2,10,COL.green,L*.36,33,-W*.3); cyl(g,2,2,4,COL.green,L*.36,35,-W*.3,8); dome(g,2,COL.gold,L*.36,39,-W*.3,1.4);
    box(g,L*.3,1,W*.3,0x9fe0d0,-L*.1,9.2,0); },
  petitpalais(g,L,W,h){ box(g,L,18,W*.32,COL.stone,0,0,-W*.34); prism(g,L,6,W*.32,COL.slate,0,18,-W*.34); for(const sx of [-1,1]) box(g,L*.2,16,W,COL.stone,sx*L*.4,0);
    box(g,L*.16,24,W*.36,COL.stone2,0,0,-W*.34); dome(g,L*.08,COL.slate,0,24,-W*.34,1.3); const a=new T.Mesh(new T.TorusGeometry(L*.06,.8,6,20,Math.PI),M(COL.gold)); a.position.set(0,12,-W*.5-.2); g.add(a); },
  garedunord(g,L,W,h){ box(g,L,30,8,COL.stone,0,0,-W/2+4); for(let i=0;i<9;i++) box(g,2,6,2,COL.cream,-L*.45+i*L*.112,30,-W/2+4); prism(g,L*.3,8,8,COL.stone2,0,30,-W/2+4);
    for(let i=0;i<4;i++){ const v=vault(g,W*.85,L*.11,COL.glass,-L*.36+i*L*.24,8,W*.04,.55); v.rotation.y=Math.PI/2; v.userData.noEdge=true; box(g,L*.22,8,W*.85,COL.slate,-L*.36+i*L*.24,0,W*.04,.5).userData.noEdge=true; } },
  catacombes(g,L,W,h){ box(g,L,h,W,COL.stone,0,0); prism(g,L,3,W,COL.slate,0,h); box(g,3,5,.4,0x1b1b1b,0,0,W/2+.2); const ring=new T.Mesh(new T.TorusGeometry(6,.6,6,32),new T.MeshBasicMaterial({color:COL.pink})); ring.rotation.x=Math.PI/2; ring.position.y=.4; g.add(ring); },
  moulinrouge(g,L,W,h){ box(g,L,12,W,COL.red,0,0); box(g,L*1.02,1.2,W*1.02,COL.yellow,0,10); box(g,7,10,7,COL.red,L*.25,12,0); cone(g,5.5,6,COL.red,L*.25,22,0,4);
    const hub=new T.Group(); hub.position.set(L*.25,20,4.2); for(let i=0;i<4;i++){ const b=new T.Mesh(new T.BoxGeometry(1.4,13,.4),M(COL.white)); b.position.y=6.5; const arm=new T.Group(); arm.rotation.z=i*Math.PI/2; arm.add(b); hub.add(arm); } g.add(hub); g.userData.spin=hub; },
  // ---- ajoutés le 19/10/2026 (demande du propriétaire : l'obélisque, les gares, les églises…) ----
  obelisque(g){ box(g,7.5,1.2,7.5,COL.stone2,0,0); box(g,5,4.4,5,0xcdc3b2,0,1.2); box(g,3.7,3.2,3.7,0xbfb3a0,0,5.6);
    const sg=new T.CylinderGeometry(1.15,1.75,21.6,4,1); sg.rotateY(Math.PI/4); const s=new T.Mesh(sg,M(0xd6ab86)); s.position.y=8.8+10.8; g.add(s);
    const pg=new T.ConeGeometry(1.15,2.4,4); pg.rotateY(Math.PI/4); const p=new T.Mesh(pg,M(COL.gold)); p.position.y=8.8+21.6+1.2; g.add(p); },
  hoteldeville(g,L,W,h,m){ const fz=m.fz||-1;
    box(g,L,21,W,COL.stone,0,0); box(g,L*1.01,1,W*1.01,COL.stone2,0,20.4); frustum(g,L*.98,W*.98,10,.78,COL.slate,0,21);
    for(const sx of [-1,1]) for(const sz of [-1,1]){ const x=sx*(L/2-L*.075), z=sz*(W/2-W*.11); box(g,L*.15,26,W*.22,COL.stone,x,0,z); frustum(g,L*.15,W*.22,11,.12,COL.slate,x,26,z); }
    for(const sx of [-1,1]){ const x=sx*(L/2-L*.05); box(g,L*.1,25,W*.26,COL.stone,x,0,0); frustum(g,L*.1,W*.26,9,.2,COL.slate,x,25,0); }
    const zc=fz*(W/2-W*.1); box(g,L*.17,29,W*.2,COL.stone,0,0,zc); frustum(g,L*.17,W*.2,8,.35,COL.slate,0,29,zc);
    box(g,6.4,9,6.4,COL.stone,0,35,zc); clock(g,1.7,0,40,zc+fz*3.25,fz>0?2:-2); frustum(g,7,7,9,.1,COL.slate,0,44,zc); cyl(g,.35,.35,5,COL.gold,0,53,zc,6); },
  invalides(g,L,W,h,m){ const fx=m.fx||-1, b=28;
    box(g,L*.86,b,W*.5,COL.stone,0,0); box(g,L*.5,b,W*.92,COL.stone,0,0); box(g,L*.74,b*.82,W*.78,COL.stone2,0,0);
    const px=fx*(L*.43+2.6); for(let i=0;i<6;i++) cyl(g,.9,.9,b*.55,COL.cream,px,0,-W*.16+W*.064*i,10); box(g,5.2,1.6,W*.4,COL.stone2,px,b*.55); prism(g,W*.4,5,5.2,COL.stone2,px,b*.55+1.6).rotation.y=0;
    cyl(g,15,15,18,COL.stone,0,b,0,24); for(let i=0;i<20;i++){ const a=i/20*Math.PI*2; cyl(g,.75,.75,15,COL.cream,Math.cos(a)*15.7,b,Math.sin(a)*15.7,6); }
    cyl(g,14.6,14.6,4,COL.stone2,0,b+18,0,24); dome(g,14.4,COL.gold,0,b+22,0,1.35);
    const dt=b+22+14.4*1.35; cyl(g,2.4,2.8,9,COL.gold,0,dt-1,0,12); dome(g,2.4,COL.gold,0,dt+8,0,1.2); cone(g,.9,107-(dt+10.8),COL.gold,0,dt+10.8,0,8); },
  horlogelyon(g){ box(g,10,40,10,COL.stone,0,0); box(g,11.2,11,11.2,COL.stone,0,40); for(const [d,x,z] of [[1,5.62,0],[-1,-5.62,0],[2,0,5.62],[-2,0,-5.62]]) clock(g,3.4,x,46,z,d);
    for(const sx of [-1,1]) for(const sz of [-1,1]){ cyl(g,.9,.9,4,COL.stone2,sx*5.2,51,sz*5.2,8); cone(g,1,3,COL.slate,sx*5.2,55,sz*5.2,8); }
    frustum(g,10.6,10.6,9,.12,COL.slate,0,51,0); cyl(g,1.1,1.3,3,COL.stone2,0,60,0,8); cone(g,1.2,4,COL.gold,0,63,0,8); },
  austerlitz(g,L,W,h,m){ const fx=m.fx||-1, hl=L*.86, hc=-fx*L*.07, r=W/2-2;
    for(const s of [-1,1]) box(g,hl,11,4,COL.stone,hc,0,s*(W/2-2));
    const v=vault(g,hl,r,COL.glass,hc,10,0,.55); v.scale.x=.55; v.userData.noEdge=true;
    for(let i=0;i<9;i++){ const a=new T.Mesh(new T.TorusGeometry(r,.5,4,24,Math.PI),M(COL.iron)); a.rotation.y=Math.PI/2; a.scale.y=.55; a.position.set(hc-hl/2+hl*i/8,10,0); a.userData.noEdge=true; g.add(a); }
    const hx=fx*(L/2-L*.06); box(g,L*.12,20,W,COL.stone,hx,0); frustum(g,L*.12,W,6,.8,COL.slate,hx,20); clock(g,2.4,hx+fx*L*.061,15,0,fx>0?1:-1);
    for(const s of [-1,1]){ box(g,L*.12,24,W*.16,COL.stone,hx,0,s*(W/2-W*.08)); frustum(g,L*.12,W*.16,6,.3,COL.slate,hx,24,s*(W/2-W*.08)); } },
  carrousel(g,L,W){ const H=10.5, P=[-L*.4,-L*.14,L*.14,L*.4]; for(const x of P) box(g,L*.12,H,W,0xf1e6e0,x,0);
    box(g,L,4.1,W,COL.stone,0,H); box(g,L*1.03,.6,W*1.05,COL.stone2,0,H+3.5);
    for(const sz of [-1,1]) for(const x of P) cyl(g,.45,.45,H,0xd27a86,x,0,sz*(W/2+.5),10);
    box(g,3.8,2.3,2.4,0x5d8b7a,0,H+4.1); box(g,1.3,2,1.5,COL.gold,0,H+6.4); },
  geode(g,L){ const r=Math.min(18,L/2); const s=new T.Mesh(new T.IcosahedronGeometry(r,2),new T.MeshStandardMaterial({color:0xf1f5f9,metalness:.25,roughness:.28,flatShading:true})); s.position.y=r; s.userData.noEdge=true; g.add(s); cyl(g,r*.7,r*.75,1,COL.stone2,0,0,0,24); },
  bercy(g,L,W){ frustum(g,L,W,22,.62,0x7fb069,0,0); box(g,L*.6,7,W*.6,COL.glass,0,22,0,.8); for(let i=0;i<5;i++){ box(g,L*.62,.8,.8,COL.iron,0,29,-W*.28+W*.14*i); box(g,.8,.8,W*.62,COL.iron,-L*.28+L*.14*i,29,0); } },
  operabastille(g,L,W,h,m){ const fx=m.fx||-1; box(g,L*.7,30,W,0xe9edf1,-fx*L*.15,0); box(g,L*.34,48,W*.5,0xd5dbe2,-fx*L*.08,0);
    const c=new T.Mesh(new T.CylinderGeometry(W*.48,W*.48,26,24,1,false,0,Math.PI),M(COL.glass,.75)); c.scale.x=.5; c.rotation.y=fx<0?Math.PI:0; c.position.set(fx*L*.2,13,0); c.userData.noEdge=true; g.add(c);
    box(g,L*.02,2,W*.98,0x9aa5b1,fx*L*.2,26); },
  museum(g,L,W){ box(g,L,22,W,COL.stone,0,0); box(g,L*1.01,1.4,W*1.01,COL.stone2,0,20.6); const v=vault(g,L*.8,W*.3,COL.glass,0,22,0,.6); v.scale.x=.5; v.userData.noEdge=true; },
  ecolemilitaire(g,L,W,h,m){ const fx=m.fx||-1, px=fx*(L/2+1.3); box(g,L,22,W,COL.stone,0,0);
    for(let i=0;i<8;i++) cyl(g,.7,.7,16,COL.cream,px,3,-W*.35+W*.1*i,10); box(g,3,1.4,W*.8,COL.stone2,px,19); prism(g,W*.8,3.5,3,COL.stone2,px,20.4).rotation.y=0;
    const dg=new T.SphereGeometry(L*.36,4,6,0,Math.PI*2,0,Math.PI/2); dg.rotateY(Math.PI/4); const d=new T.Mesh(dg,M(COL.slate)); d.scale.set(1,1.15,1); d.position.y=22; g.add(d); cyl(g,.8,.8,4,COL.gold,0,22+L*.36*1.15,0,8); },
  horloge(g,L,W){ box(g,L,33,W,COL.stone,0,0); box(g,L*1.04,1,W*1.04,COL.stone2,0,32); frustum(g,L,W,11,.08,COL.slate,0,33); for(const sx of [-1,1]) cone(g,.9,6,COL.slate,sx*L*.4,33,W*.4,6); cone(g,.4,4,COL.gold,0,44,0,6); },
  vendome(g){ box(g,6.2,6.6,6.2,0x6b5a3e,0,0); cyl(g,1.85,1.95,30,0x77633f,0,6.6,0,16); box(g,4.2,1.6,4.2,0x6b5a3e,0,36.6); cyl(g,1.3,1.3,2.4,0x6b5a3e,0,38.2,0,12); cyl(g,.5,.7,3.7,0x5b4a30,0,40.6,0,8); },
  juillet(g){ cyl(g,7,7,2.4,COL.stone2,0,0,0,24); box(g,6.6,7,6.6,COL.stone,0,2.4); box(g,4.6,4,4.6,0x3f6e62,0,9.4); cyl(g,1.9,2,30,0x3f6e62,0,13.4,0,16);
    for(let i=0;i<3;i++) cyl(g,2.1,2.1,.6,COL.gold,0,20+i*8,0,16); box(g,3.6,1.6,3.6,0x3f6e62,0,43.4); cyl(g,1.2,1.4,2.2,0x3f6e62,0,45,0,10); cone(g,.9,3.6,COL.gold,0,47.2,0,8); },
  saintjacques(g,L){ const s=Math.min(10,L*.9); box(g,s,44,s,0xf2ece0,0,0); for(const sx of [-1,1]) for(const sz of [-1,1]){ box(g,1.8,48,1.8,COL.stone2,sx*s*.46,0,sz*s*.46); cone(g,1.1,4,COL.stone2,sx*s*.46,48,sz*s*.46,4); }
    box(g,s*1.06,1.2,s*1.06,COL.stone2,0,44); cyl(g,.6,.6,3,COL.stone2,0,45.2,0,8); },
  valdegrace(g,L,W){ box(g,L,15,W,COL.stone,0,0); box(g,L*1.02,1,W*1.02,COL.stone2,0,14.5); cyl(g,9.2,9.2,11,COL.stone,0,15,0,20); for(let i=0;i<16;i++){ const a=i/16*Math.PI*2; cyl(g,.5,.5,9,COL.cream,Math.cos(a)*9.8,15,Math.sin(a)*9.8,6); }
    dome(g,9,COL.slate,0,26,0,1.35); cyl(g,1.6,1.9,5,COL.gold,0,37.6,0,10); cone(g,1.2,3,COL.gold,0,42.6,0,8); },
  sulpice(g,L,W,h,m){ church(g,L,W,{fx:m.fx,n:33,nw:.44,t:2,tw:13.5,th:52,top:"round",sp:18,por:10,fw:.98,tu:.6}); },
  eustache(g,L,W,h,m){ church(g,L,W,{fx:m.fx,n:33,nw:.48,rp:.5,gothic:true,xsp:16,t:2,tw:9,th:40,top:"pyr",sp:6,tu:.55}); },
  clotilde(g,L,W,h,m){ church(g,L,W,{fx:m.fx,n:26,nw:.5,gothic:true,t:2,tw:9,th:40,top:"spire",sp:29,fw:.62}); },
  ambroise(g,L,W,h,m){ church(g,L,W,{fx:m.fx,n:22,nw:.5,t:2,tw:8,th:42,top:"spire",sp:26,fw:.6}); },
  trinite(g,L,W,h,m){ church(g,L,W,{fx:m.fx,n:22,nw:.52,t:1,tw:12,th:48,top:"dome",sp:17,fw:.75}); },
  sgdp(g,L,W,h,m){ church(g,L,W,{fx:m.fx,n:19,nw:.5,aisle:false,t:1,tw:10,th:36,top:"spire",sp:14,fw:.5}); },
  etienne(g,L,W,h,m){ church(g,L,W,{fx:m.fx,n:24,nw:.55,t:"side",tz:m.tz,tw:7,th:42,top:"dome",sp:10,fw:.7}); },
  vincent(g,L,W,h,m){ church(g,L,W,{fx:m.fx,n:22,nw:.5,t:2,tw:8,th:46,fw:.62,por:6}); },
  augustin(g,L,W,h,m){ church(g,L,W,{fx:m.fx,n:24,nw:.5,tr:false,dome:{u:.72,r:13,d:24,sy:1.5},fw:.6}); },
  paulstlouis(g,L,W,h,m){ church(g,L,W,{fx:m.fx,n:25,nw:.6,fh:1.5,dome:{u:.6,r:9,d:10,sy:1.3},fw:.9}); }
};

window.MON={B,merge,edges};   // pour les tests (aperçu des maquettes)
window.addMonuments=function(map,models){
  const lon0=2.3488, lat0=48.8534; const origin=maplibregl.MercatorCoordinate.fromLngLat([lon0,lat0],0); const s=origin.meterInMercatorCoordinateUnits();
  const kx=111320*Math.cos(lat0*Math.PI/180), ky=110574;
  const scene=new T.Scene(); const camera=new T.Camera();
  scene.add(new T.HemisphereLight(0xffffff,0xb8c8da,.95));
  const sun=new T.DirectionalLight(0xffffff,.55); sun.position.set(-120,260,180); scene.add(sun);
  const spinners=[];
  for(const m of models){
    const g=new T.Group(); const fn=B[m.m]; if(!fn) continue;
    fn(g,m.L,m.W,m.h,m); if(m.m!=="louvre"&&m.m!=="eiffel") edges(g); if(g.userData.spin) spinners.push(g.userData.spin);
    const halo=new T.Mesh(new T.RingGeometry(Math.max(m.L,m.W)*.62,Math.max(m.L,m.W)*.7,48),new T.MeshBasicMaterial({color:COL.pink,transparent:true,opacity:.28,side:T.DoubleSide})); halo.rotation.x=-Math.PI/2; halo.position.y=.3; g.add(halo);
    let ang=m.ang; if(m.m!=="sacrecoeur"&&Math.cos(ang)<0) ang+=Math.PI; g.position.set((m.lon-lon0)*kx,0,-(m.lat-lat0)*ky); g.rotation.y=ang; scene.add(g); merge(g);
  }
  // le joueur : une montgolfière (née à Paris en 1783) aux couleurs de son parti, qui survole les toits ;
  // au sol, un anneau qui pulse marque l'immeuble où elle est posée
  const pawn=new T.Group(); pawn.visible=false;
  const bal=new T.Group(); pawn.add(bal);
  const SM=c=>new T.MeshStandardMaterial({color:c,roughness:.55,metalness:0,flatShading:false,side:T.DoubleSide});
  const colMat=SM(0x1C3FA8), whiteMat=SM(0xFFFFFF), goldMat=new T.MeshStandardMaterial({color:0xF2C14E,roughness:.4,metalness:.3});
  const wickerMat=new T.MeshStandardMaterial({color:0x9A6A3C,roughness:.9,flatShading:true}), ropeMat=new T.LineBasicMaterial({color:0x5B4630});
  // enveloppe en forme de goutte, en 12 fuseaux alternés couleur / blanc
  const prof=[]; for(let i=0;i<=24;i++){ const t=i/24, a=-Math.PI/2+t*Math.PI; const r=t<.32? 4+ (14-4)*Math.sin(t/.32*Math.PI/2): 14*Math.cos((t-.32)/.68*Math.PI/2*.98)+.01; prof.push(new T.Vector2(Math.max(.01,r), (t<.32? t/.32*16 : 16+Math.sin((t-.32)/.68*Math.PI/2)*15))); }
  const ENV_Y=46, N=12;
  for(let i=0;i<N;i++){ const m=new T.Mesh(new T.LatheGeometry(prof,6,i*Math.PI*2/N,Math.PI*2/N),i%2?whiteMat:colMat); m.position.y=ENV_Y; bal.add(m); }
  const band=new T.Mesh(new T.TorusGeometry(10.6,.55,8,40),goldMat); band.rotation.x=Math.PI/2; band.position.y=ENV_Y+6; bal.add(band);
  const top=new T.Mesh(new T.SphereGeometry(2.2,12,8),goldMat); top.position.y=ENV_Y+31; bal.add(top);
  // nacelle et cordes
  const basket=new T.Mesh(new T.BoxGeometry(6,4.5,6),wickerMat); basket.position.y=ENV_Y-9.5; bal.add(basket);
  const rim=new T.Mesh(new T.BoxGeometry(6.6,.8,6.6),new T.MeshStandardMaterial({color:0x6B4527,roughness:.9})); rim.position.y=ENV_Y-7.1; bal.add(rim);
  for(const [x,z] of [[3,3],[3,-3],[-3,3],[-3,-3]]){ const g=new T.BufferGeometry().setFromPoints([new T.Vector3(x,ENV_Y-7,z),new T.Vector3(x*1.3,ENV_Y+.5,z*1.3)]); bal.add(new T.Line(g,ropeMat)); }
  const flame=new T.Mesh(new T.ConeGeometry(1,3,8),new T.MeshBasicMaterial({color:0xFFB020,transparent:true,opacity:.9})); flame.position.y=ENV_Y-4.5; bal.add(flame);
  // fil vertical discret jusqu'au sol + ombre + anneau
  const tether=new T.Mesh(new T.CylinderGeometry(.18,.18,ENV_Y-12,6),new T.MeshBasicMaterial({color:0x0F1B2D,transparent:true,opacity:.25,depthWrite:false})); tether.position.y=(ENV_Y-12)/2; pawn.add(tether);
  const ringMat=new T.MeshBasicMaterial({color:0x1C3FA8,transparent:true,opacity:.85,depthWrite:false,side:T.DoubleSide});
  const ring=new T.Mesh(new T.RingGeometry(9,11.5,48),ringMat); ring.rotation.x=-Math.PI/2; ring.position.y=.8; pawn.add(ring);
  const ring2=new T.Mesh(new T.RingGeometry(9,10.5,48),ringMat.clone()); ring2.rotation.x=-Math.PI/2; ring2.position.y=.9; pawn.add(ring2);
  const disc=new T.Mesh(new T.CircleGeometry(9,40),new T.MeshBasicMaterial({color:0x0F1B2D,transparent:true,opacity:.2,depthWrite:false})); disc.rotation.x=-Math.PI/2; disc.position.y=.7; pawn.add(disc);
  scene.add(pawn);
  let lastPos=null, moveUntil=0, vx=0, vz=0;
  window.pawn3d={
    set(lng,lat){ const x=(lng-lon0)*kx, z=-(lat-lat0)*ky;
      if(lastPos){ const dx=x-lastPos[0], dz=z-lastPos[1]; if(Math.hypot(dx,dz)>.05){ vx=dx; vz=dz; moveUntil=performance.now()+220; } }
      lastPos=[x,z]; pawn.position.set(x,0,z); pawn.visible=true; map.triggerRepaint(); },
    color(hex){ colMat.color.set(hex); ringMat.color.set(hex); ring2.material.color.set(hex); map.triggerRepaint(); },
    hide(){ pawn.visible=false; map.triggerRepaint(); },
    k(z){ return Math.max(1,Math.pow(2,(16.2-z)*.8))*(innerWidth<700?1.35:1); },   /* plus gros sur téléphone : on doit voir tout de suite que c'est nous */
    H:80
  };
  const animPawn=()=>{ const tt=performance.now()/1000, mv=performance.now()<moveUntil;
    bal.position.y=Math.sin(tt*1.6)*1.4; bal.rotation.y=tt*.25;
    const L=Math.hypot(vx,vz)||1, tilt=mv?.12:0; bal.rotation.x=tilt*(vz/L); bal.rotation.z=-tilt*(vx/L);
    flame.scale.y=.8+.4*Math.abs(Math.sin(tt*9)); flame.material.opacity=mv?.95:.6;
    const pz=1+1.1*((tt*.7)%1); ring2.scale.set(pz,pz,1); ring2.material.opacity=.85*(1-((tt*.7)%1)); };
  let renderer=null;
  const layer={id:"monuments",type:"custom",renderingMode:"3d",
    onAdd(map,gl){ renderer=new T.WebGLRenderer({canvas:map.getCanvas(),context:gl,antialias:true}); renderer.autoClear=false; },
    render(gl,matrix){
      if(map.getZoom()<12.4) return;
      if(pawn.visible){ const z=map.getZoom(); const k=window.pawn3d.k(z); pawn.scale.setScalar(k); animPawn(); if(performance.now()<moveUntil+1200) map.triggerRepaint(); }   /* on ne redessine en boucle que pendant le vol (sinon le téléphone rame) */
      const rot=new T.Matrix4().makeRotationAxis(new T.Vector3(1,0,0),Math.PI/2);
      const l=new T.Matrix4().makeTranslation(origin.x,origin.y,origin.z).scale(new T.Vector3(s,-s,s)).multiply(rot);
      camera.projectionMatrix=new T.Matrix4().fromArray(matrix).multiply(l);
      const t=performance.now()/1000; spinners.forEach(sp=>sp.rotation.z=-t*.8);
      renderer.resetState(); renderer.render(scene,camera);
      if(spinners.length&&map.getZoom()>15.5){ const c=map.getCenter(); if(Math.abs(c.lng-2.3323)<.01&&Math.abs(c.lat-48.8841)<.007) map.triggerRepaint(); }
    }};
  map.addLayer(layer,"anchor-top");
};
})();
