// =====================================================================
//  Maquettes 3D stylisées des 22 monuments mythiques (three.js dans MapLibre)
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
    const hub=new T.Group(); hub.position.set(L*.25,20,4.2); for(let i=0;i<4;i++){ const b=new T.Mesh(new T.BoxGeometry(1.4,13,.4),M(COL.white)); b.position.y=6.5; const arm=new T.Group(); arm.rotation.z=i*Math.PI/2; arm.add(b); hub.add(arm); } g.add(hub); g.userData.spin=hub; }
};

window.addMonuments=function(map,models){
  const lon0=2.3488, lat0=48.8534; const origin=maplibregl.MercatorCoordinate.fromLngLat([lon0,lat0],0); const s=origin.meterInMercatorCoordinateUnits();
  const kx=111320*Math.cos(lat0*Math.PI/180), ky=110574;
  const scene=new T.Scene(); const camera=new T.Camera();
  scene.add(new T.HemisphereLight(0xffffff,0xb8c8da,.95));
  const sun=new T.DirectionalLight(0xffffff,.55); sun.position.set(-120,260,180); scene.add(sun);
  const spinners=[];
  for(const m of models){
    const g=new T.Group(); const fn=B[m.m]; if(!fn) continue;
    fn(g,m.L,m.W,m.h); if(m.m!=="louvre"&&m.m!=="eiffel") edges(g); if(g.userData.spin) spinners.push(g.userData.spin);
    const halo=new T.Mesh(new T.RingGeometry(Math.max(m.L,m.W)*.62,Math.max(m.L,m.W)*.7,48),new T.MeshBasicMaterial({color:COL.pink,transparent:true,opacity:.28,side:T.DoubleSide})); halo.rotation.x=-Math.PI/2; halo.position.y=.3; g.add(halo);
    let ang=m.ang; if(m.m!=="sacrecoeur"&&Math.cos(ang)<0) ang+=Math.PI; g.position.set((m.lon-lon0)*kx,0,-(m.lat-lat0)*ky); g.rotation.y=ang; scene.add(g);
  }
  // le pion du joueur : une vraie pièce d'échecs en 3D, aux couleurs de son parti
  const pawn=new T.Group(); pawn.visible=false;
  const prof=[[0,0],[13,0],[13.5,1.2],[13,3],[11.2,4],[11,5.6],[8.6,6.6],[6.4,8.6],[5.2,12],[4.5,18.5],[7.6,19.6],[7.8,21.2],[5,22.4],[4.4,23.4]].map(([r,y])=>new T.Vector2(r,y));
  const pmat=new T.MeshStandardMaterial({color:0x1C3FA8,roughness:.32,metalness:.18});
  const body=new T.Mesh(new T.LatheGeometry(prof,48),pmat); pawn.add(body);
  const head=new T.Mesh(new T.SphereGeometry(7.4,40,28),pmat); head.position.y=29.5; pawn.add(head);
  const ring=new T.Mesh(new T.TorusGeometry(15,1.1,8,48),new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.85})); ring.rotation.x=-Math.PI/2; ring.position.y=.6; pawn.add(ring);
  const shadow=new T.Mesh(new T.CircleGeometry(17,40),new T.MeshBasicMaterial({color:0x0f1b2d,transparent:true,opacity:.22})); shadow.rotation.x=-Math.PI/2; shadow.position.y=.3; pawn.add(shadow);
  scene.add(pawn);
  window.pawn3d={
    set(lng,lat){ pawn.position.set((lng-lon0)*kx,0,-(lat-lat0)*ky); pawn.visible=true; map.triggerRepaint(); },
    color(hex){ pmat.color.set(hex); map.triggerRepaint(); },
    hide(){ pawn.visible=false; map.triggerRepaint(); },
    k(z){ return 1.5*Math.max(1,Math.pow(2,(16.4-z)*.85)); },
    H:37
  };
  let renderer=null;
  const layer={id:"monuments",type:"custom",renderingMode:"3d",
    onAdd(map,gl){ renderer=new T.WebGLRenderer({canvas:map.getCanvas(),context:gl,antialias:true}); renderer.autoClear=false; },
    render(gl,matrix){
      if(map.getZoom()<12.4) return;
      if(pawn.visible){ const z=map.getZoom(); const k=window.pawn3d.k(z); pawn.scale.setScalar(k); }
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
