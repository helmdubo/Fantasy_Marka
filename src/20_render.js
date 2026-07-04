/* ================= RENDER (browser only) ================= */
let R=null;
function makeBatch(){return {pos:[],uv:[],idx:[]}}
function bQuad(b,x0,y0,x1,y1,spr,flip){
  const i=b.pos.length/3;
  b.pos.push(x0,y0,0, x1,y0,0, x1,y1,0, x0,y1,0);
  const u0=flip?spr.u1:spr.u0,u1=flip?spr.u0:spr.u1;
  b.uv.push(u0,spr.v0, u1,spr.v0, u1,spr.v1, u0,spr.v1);
  b.idx.push(i,i+1,i+2, i,i+2,i+3);
}
function meshFromBatch(b,order){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(b.pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));
  g.setIndex(b.idx);
  const m=new THREE.Mesh(g,R.mat);
  m.renderOrder=order;m.frustumCulled=false;
  return m;
}
function cellTerr(x,y){if(x<0||y<0||x>=S.W||y>=S.H)return T.WATER;return S.terr[idx(x,y)]}
// Полоса между колонками x и x+1, ряды y..y+1: два треугольника ('r' ▶ и 'l' ◀).
// corners в порядке спрайта ('r': TL,BL,апекс-право; 'l': TR,BR,апекс-лево);
// wyTop — мировой Y верхней кромки bbox (равен WYCC базовой колонки, ряд y).
function colTris(x,y){
  const e=!(x&1);
  if(e)return [
    {or:'r',corners:[[x,y],[x,y+1],[x+1,y]],     baseCol:x},
    {or:'l',corners:[[x+1,y],[x+1,y+1],[x,y+1]], baseCol:x+1}];
  return [
    {or:'r',corners:[[x,y],[x,y+1],[x+1,y+1]],   baseCol:x},
    {or:'l',corners:[[x+1,y],[x+1,y+1],[x,y]],   baseCol:x+1}];
}
function buildTerrain(){
  for(const m of R.terrMeshes){R.scene.remove(m);m.geometry.dispose()}
  R.terrMeshes=[];
  const base=makeBatch();
  for(let x=-1;x<=S.W;x++)for(let y=-2;y<=S.H+1;y++){
    for(const tr of colTris(x,y)){
      const wyTop=WYCC(tr.baseCol,y);
      const spr=SPR['tri0_'+tr.or+'_full'+(hash2(x*2+(tr.or==='r'?1:0),y,5)<0.5?0:1)];
      bQuad(base,WXC(x),wyTop-1,WXC(x)+CW,wyTop,spr);
    }
  }
  let m=meshFromBatch(base,1);R.scene.add(m);R.terrMeshes.push(m);
  let order=2;
  for(const t of [T.GRASS,T.FOREST,T.ROCK,T.MTN]){
    const b=makeBatch();
    for(let x=-1;x<=S.W;x++)for(let y=-2;y<=S.H+1;y++){
      for(const tr of colTris(x,y)){
        const c0=cellTerr(tr.corners[0][0],tr.corners[0][1])>=t?1:0;
        const c1=cellTerr(tr.corners[1][0],tr.corners[1][1])>=t?1:0;
        const c2=cellTerr(tr.corners[2][0],tr.corners[2][1])>=t?1:0;
        const bits=c0|(c1<<1)|(c2<<2);
        if(bits===0)continue;
        const wyTop=WYCC(tr.baseCol,y);
        const spr=(bits===7)?SPR['tri'+t+'_'+tr.or+'_full'+(hash2(x*2,y,t)<0.5?0:1)]:SPR['tri'+t+'_'+tr.or+'_'+bits];
        bQuad(b,WXC(x),wyTop-1,WXC(x)+CW,wyTop,spr);
      }
    }
    m=meshFromBatch(b,order++);R.scene.add(m);R.terrMeshes.push(m);
  }
  S.terrDirty=false;
}
function buildRoads(){
  if(R.roadMesh){R.scene.remove(R.roadMesh);R.roadMesh.geometry.dispose();R.roadMesh=null}
  const b=makeBatch();
  // П.2, «паутина дорог»: у гекса строения рисуется максимум ОДНО дорожное
  // ответвление («подъезд»). Данные (S.road/roadConn) не меняются — только визуал.
  const isBldCell=(x,y)=>{const bi=S.bld[idx(x,y)];return bi>=0&&S.buildings[bi].type!=='townhall'};
  const doorK=(x,y)=>{ // выбранный слот подъезда для гекса строения
    const dirs=hexDirs(x);let bestK=-1,bd=1e9;
    for(let k=0;k<6;k++){
      const nx=x+dirs[k][0],ny=y+dirs[k][1];
      if(!inMap(nx,ny))continue;
      const ni=idx(nx,ny);
      if(!S.road[ni])continue;
      const d=(S.roadConn[ni]?0:1000)+cheb(nx,ny,S.th.x,S.th.y)+(isBldCell(nx,ny)?100:0);
      if(d<bd){bd=d;bestK=k}
    }
    return bestK;
  };
  for(let y=0;y<S.H;y++)for(let x=0;x<S.W;x++){
    if(!S.road[idx(x,y)])continue;
    let m=0;
    const dirs=hexDirs(x); // порядок слотов: N,S,NE,NW,SE,SW; hexDirs зависит от колонки x
    if(isBldCell(x,y)){
      const k=doorK(x,y);
      if(k>=0)m=1<<k;
    }else{
      for(let k=0;k<6;k++){
        const nx=x+dirs[k][0],ny=y+dirs[k][1];
        if(!inMap(nx,ny)||!S.road[idx(nx,ny)])continue;
        if(isBldCell(nx,ny)){ // отросток к дому рисуем только если его подъезд смотрит на нас
          const dk=doorK(nx,ny),dd=hexDirs(nx);
          if(dk<0||nx+dd[dk][0]!==x||ny+dd[dk][1]!==y)continue;
        }
        m|=(1<<k);
      }
    }
    const cx=WXC(x),cy=WYCC(x,y);
    bQuad(b,cx-CW*0.5,cy-0.5,cx+CW*0.5,cy+0.5,SPR['road_'+m]);
  }
  for(const pl of S.roadPlans)
    for(let k=pl.i;k<pl.cells.length;k++){
      const c=pl.cells[k];
      const cx=WXC(c.x),cy=WYCC(c.x,c.y);
      bQuad(b,cx-0.5,cy-0.5,cx+0.5,cy+0.5,SPR['stake']);
    }
  R.roadMesh=meshFromBatch(b,6);R.scene.add(R.roadMesh);
  S.roadDirty=false;
}
// Drop I: debug-оверлей сеток — как «Main grid & dual grid» у Оскара.
// Dual (красный): рёбра треугольной решётки между центрами хексов.
// Main (синий): контуры Вороной-хексов — рёбра между центрами смежных треугольников.
function buildGridOverlay(){
  if(R.gridDual){R.scene.remove(R.gridDual);R.gridDual.geometry.dispose();R.gridDual=null}
  if(R.gridMain){R.scene.remove(R.gridMain);R.gridMain.geometry.dispose();R.gridMain=null}
  const dual=[],main=[];
  const cwx=(c)=>WXC(c[0]), cwy=(c)=>WYCC(c[0],c[1]);
  const edgeMap=new Map();
  for(let x=-1;x<=S.W;x++)for(let y=-1;y<=S.H;y++){
    for(const tr of colTris(x,y)){
      let gx=0,gy=0;
      for(const c of tr.corners){gx+=cwx(c);gy+=cwy(c)}
      gx/=3;gy/=3;
      for(let k=0;k<3;k++){
        const a=tr.corners[k],b=tr.corners[(k+1)%3];
        dual.push(cwx(a),cwy(a),0, cwx(b),cwy(b),0);
        const key=[a,b].map(c=>c[0]+','+c[1]).sort().join('|');
        const e=edgeMap.get(key);
        if(e===undefined)edgeMap.set(key,[gx,gy]);
        else{main.push(e[0],e[1],0, gx,gy,0);edgeMap.set(key,null)}
      }
    }
  }
  const mk=(arr,color,op)=>{
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(arr),3));
    const m=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color,transparent:true,opacity:op,depthTest:false}));
    m.renderOrder=35;m.frustumCulled=false;m.visible=!!S.showGrid;
    R.scene.add(m);return m;
  };
  R.gridDual=mk(dual,0xc03a34,0.45);
  R.gridMain=mk(main,0x3a6ac0,0.55);
}
function toggleGrid(){
  S.showGrid=!S.showGrid;
  if(!R.gridDual)buildGridOverlay();
  R.gridDual.visible=R.gridMain.visible=!!S.showGrid;
  const b=el('dbg_grid');if(b)b.classList.toggle('on',!!S.showGrid);
}
function buildStatics(){
  if(R.featMesh){R.scene.remove(R.featMesh);R.featMesh.geometry.dispose()}
  const b=makeBatch();
  for(let y=0;y<S.H;y++)for(let x=0;x<S.W;x++){
    const f=S.feat[idx(x,y)];
    if(!f)continue;
    const cx=WXC(x),yb=WYCC(x,y)-0.5;
    bQuad(b,cx-0.5,yb,cx+0.5,yb+1,SPR['f_'+f]);
  }
  for(const L of S.lairs){
    if(L.dead)continue;
    const spr=SPR['l_'+L.id],h=spr.h/16;
    const cx=WXC(L.x),yb=WYCC(L.x,L.y)-0.5;
    bQuad(b,cx-0.5,yb,cx+0.5,yb+h,spr);
  }
  R.featMesh=meshFromBatch(b,10);R.scene.add(R.featMesh);
  S.featDirty=false;
}
function buildBuildings(){
  if(R.bldMesh){R.scene.remove(R.bldMesh);R.bldMesh.geometry.dispose()}
  const b=makeBatch();
  for(const bd of S.buildings){
    const spr=bd.built?((bd.type==='library'&&(bd.tier||1)>=2)?SPR['b_knowledge']:SPR['b_'+bd.type]):SPR['b_site'];
    const h=spr.h/16;
    const cx=WXC(bd.x),yb=WYCC(bd.x,bd.y)-0.5;
    bQuad(b,cx-0.5,yb,cx+0.5,yb+h,spr);
    if(bd.built&&(bd.ruined||bd.abandoned)){
      bQuad(b,cx-0.5,yb,cx+0.5,yb+h,SPR['ash']);
    }
    if(bd.built&&(bd.tier||1)>=2&&!bd.ruined){
      const pn=SPR['pennant'];
      bQuad(b,cx-0.55,yb+h-0.15,cx-0.05,yb+h+0.35,pn);
      if(bd.tier>=3)bQuad(b,cx+0.1,yb+h-0.15,cx+0.6,yb+h+0.35,pn);
    }
  }
  R.bldMesh=meshFromBatch(b,11);R.scene.add(R.bldMesh);
  S.bldDirty=false;
}
function makeGlowMesh(){
  const cv=document.createElement('canvas');cv.width=24;cv.height=24;
  const c=cv.getContext('2d');
  // Попиксельное радиальное свечение: низкое разрешение + Bayer-дизеринг.
  for(let y=0;y<24;y++)for(let x=0;x<24;x++){
    const dx=x+0.5-12,dy=y+0.5-12;
    const d=Math.sqrt(dx*dx+dy*dy)/11.5;
    let a=clamp(1-d,0,1);
    a=a*a*0.75; // v2.1: пик свечения в центре приглушён на 25%
    a=clamp(a+(bayer4(x,y)-0.5)*0.20,0,0.75);
    if(a>0.025){c.fillStyle='rgba(255,174,70,'+a.toFixed(3)+')';c.fillRect(x,y,1,1)}
  }
  R.glowTex=new THREE.CanvasTexture(cv);
  R.glowTex.magFilter=THREE.NearestFilter;R.glowTex.minFilter=THREE.NearestFilter;R.glowTex.generateMipmaps=false;
  R.glowMat=new THREE.MeshBasicMaterial({map:R.glowTex,transparent:true,opacity:0,
    blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false});
  const MAX=48;
  const geo=new THREE.BufferGeometry();
  R.gPos=new Float32Array(MAX*4*3);
  R.gUv=new Float32Array(MAX*4*2);
  const ia=new Uint16Array(MAX*6);
  for(let i=0;i<MAX;i++){const v=i*4,o=i*6;
    ia[o]=v;ia[o+1]=v+1;ia[o+2]=v+2;ia[o+3]=v;ia[o+4]=v+2;ia[o+5]=v+3}
  geo.setAttribute('position',new THREE.BufferAttribute(R.gPos,3));
  geo.setAttribute('uv',new THREE.BufferAttribute(R.gUv,2));
  geo.setIndex(new THREE.BufferAttribute(ia,1));
  R.glowGeo=geo;
  const m=new THREE.Mesh(geo,R.glowMat);
  m.renderOrder=45; // над ночным мраком (40)
  m.frustumCulled=false;
  R.scene.add(m);
}
function buildingOccupancy(bi){
  let n=0;
  for(const u of S.settlers)if(u.inside===bi)n++;
  const b=S.buildings[bi];
  if(b&&b.workerId!=null)n++;
  return n;
}
function fillGlow(){
  let n=0;
  for(let bi=0;bi<S.buildings.length;bi++){
    const b=S.buildings[bi];
    if(!b.built)continue;
    if(!({townhall:1,hut:1,tavern:1,tower:1}[b.type]))continue;
    const occ=buildingOccupancy(bi);
    if(occ<=0)continue;
    const pulse=1+0.09*Math.sin(S.time*2.6+bi*1.7);
    const r=(b.type==='tower'?1.55:1.25)*pulse;
    const cx=WXC(b.x),cy=WYCC(b.x,b.y)+0.15;
    const o=n*12,uo=n*8;
    R.gPos[o]=cx-r;R.gPos[o+1]=cy-r;R.gPos[o+2]=0;
    R.gPos[o+3]=cx+r;R.gPos[o+4]=cy-r;R.gPos[o+5]=0;
    R.gPos[o+6]=cx+r;R.gPos[o+7]=cy+r;R.gPos[o+8]=0;
    R.gPos[o+9]=cx-r;R.gPos[o+10]=cy+r;R.gPos[o+11]=0;
    R.gUv[uo]=0;R.gUv[uo+1]=0;R.gUv[uo+2]=1;R.gUv[uo+3]=0;
    R.gUv[uo+4]=1;R.gUv[uo+5]=1;R.gUv[uo+6]=0;R.gUv[uo+7]=1;
    n++;if(n>=48)break;
  }
  R.glowGeo.setDrawRange(0,n*6);
  R.glowGeo.attributes.position.needsUpdate=true;
  R.glowGeo.attributes.uv.needsUpdate=true;
  R.glowMat.opacity=clamp(R.nightO*1.75*(0.85+0.15*Math.sin(S.time*3.1)),0,1);
}
function makeFxMesh(){
  const MAX=32;
  const g=new THREE.BufferGeometry();
  R.fPos=new Float32Array(MAX*4*3);
  R.fUv=new Float32Array(MAX*4*2);
  const ia=new Uint16Array(MAX*6);
  for(let i=0;i<MAX;i++){const v=i*4,o=i*6;
    ia[o]=v;ia[o+1]=v+1;ia[o+2]=v+2;ia[o+3]=v;ia[o+4]=v+2;ia[o+5]=v+3}
  g.setAttribute('position',new THREE.BufferAttribute(R.fPos,3));
  g.setAttribute('uv',new THREE.BufferAttribute(R.fUv,2));
  g.setIndex(new THREE.BufferAttribute(ia,1));
  R.fxGeo=g;
  const m=new THREE.Mesh(g,R.mat);
  m.renderOrder=22;m.frustumCulled=false;
  R.scene.add(m);
}
function fillFx(){
  let n=0;
  const insideSet=new Set();
  for(const u of S.settlers)if(u.inside>=0)insideSet.add(u.inside);
  const buildingNow=new Set();
  for(const u of S.settlers)if(u.act==='work'&&u.job&&u.job.kind==='build')buildingNow.add(u.job.b);
  for(let bi=0;bi<S.buildings.length;bi++){
    const b=S.buildings[bi];
    let sprKey=null;
    if(!b.built){
      if(buildingNow.has(bi))sprKey='fxh_'+((Math.floor(S.time*3)+bi)%2);
      else continue;
    }else{
      const active=(b.workerId!=null)||(insideSet.has(bi)&&(b.type==='tavern'||b.type==='townhall'));
      if(!active)continue;
      sprKey='fx_'+((Math.floor(S.time*2)+bi)%2);
    }
    const i=idx(b.x,b.y);
    if(!S.visible[i]&&!S.explored[i]&&!S.revealAll)continue;
    const spr=SPR[sprKey];
    const bh=(SPR['b_'+b.type]?SPR['b_'+b.type].h:16)/16;
    const cx=WXC(b.x),yb=WYCC(b.x,b.y)-0.5;
    const x0=cx-0.08,x1=cx+0.42;
    const y0=yb+bh-0.12,y1=y0+0.5;
    const o=n*12,uo=n*8;
    R.fPos[o]=x0;R.fPos[o+1]=y0;R.fPos[o+2]=0;
    R.fPos[o+3]=x1;R.fPos[o+4]=y0;R.fPos[o+5]=0;
    R.fPos[o+6]=x1;R.fPos[o+7]=y1;R.fPos[o+8]=0;
    R.fPos[o+9]=x0;R.fPos[o+10]=y1;R.fPos[o+11]=0;
    R.fUv[uo]=spr.u0;R.fUv[uo+1]=spr.v0;
    R.fUv[uo+2]=spr.u1;R.fUv[uo+3]=spr.v0;
    R.fUv[uo+4]=spr.u1;R.fUv[uo+5]=spr.v1;
    R.fUv[uo+6]=spr.u0;R.fUv[uo+7]=spr.v1;
    n++;if(n>=32)break;
  }
  R.fxGeo.setDrawRange(0,n*6);
  R.fxGeo.attributes.position.needsUpdate=true;
  R.fxGeo.attributes.uv.needsUpdate=true;
}
function makeUnitMesh(){
  const MAX=96;
  const g=new THREE.BufferGeometry();
  R.uPos=new Float32Array(MAX*4*3);
  R.uUv=new Float32Array(MAX*4*2);
  const ia=new Uint16Array(MAX*6);
  for(let i=0;i<MAX;i++){const v=i*4,o=i*6;
    ia[o]=v;ia[o+1]=v+1;ia[o+2]=v+2;ia[o+3]=v;ia[o+4]=v+2;ia[o+5]=v+3}
  g.setAttribute('position',new THREE.BufferAttribute(R.uPos,3));
  g.setAttribute('uv',new THREE.BufferAttribute(R.uUv,2));
  g.setIndex(new THREE.BufferAttribute(ia,1));
  R.unitGeo=g;
  const m=new THREE.Mesh(g,R.mat);
  m.renderOrder=20;m.frustumCulled=false;
  R.scene.add(m);
}
function fillUnits(alpha){
  let n=0;
  const t2=Math.floor(S.time*3.5);
  for(const u of S.settlers){
    const cx=u.x|0,cy=u.y|0;
    if(!inMap(cx,cy)||u.inside>=0||u.inside===-2)continue;
    if(!S.visible[idx(cx,cy)]&&!S.revealAll)continue;
    const x=lerp(u.px,u.x,alpha),y=lerp(u.py,u.y,alpha);
    const wx=x*CW,wy=(S.H-y)-zig(x-0.5); // непрерывный зигзаг колонок
    const frame=(u.act==='goto')?((t2+u.id)%2):0;
    const spr=SPR['u_'+u.race+'_'+frame];
    {const sh=SPR['shadow'],so=n*12,su=n*8;
     const sx0=wx-0.42,sx1=wx+0.42,sy0=wy-0.62,sy1=wy-0.62+0.84;
     R.uPos[so]=sx0;R.uPos[so+1]=sy0;R.uPos[so+2]=0;
     R.uPos[so+3]=sx1;R.uPos[so+4]=sy0;R.uPos[so+5]=0;
     R.uPos[so+6]=sx1;R.uPos[so+7]=sy1;R.uPos[so+8]=0;
     R.uPos[so+9]=sx0;R.uPos[so+10]=sy1;R.uPos[so+11]=0;
     R.uUv[su]=sh.u0;R.uUv[su+1]=sh.v0;R.uUv[su+2]=sh.u1;R.uUv[su+3]=sh.v0;
     R.uUv[su+4]=sh.u1;R.uUv[su+5]=sh.v1;R.uUv[su+6]=sh.u0;R.uUv[su+7]=sh.v1;
     n++;if(n>=95)break;}
    const o=n*12,uo=n*8;
    const x0=wx-0.5,x1=wx+0.5,y0=wy-0.5,y1=wy+0.5;
    R.uPos[o]=x0;R.uPos[o+1]=y0;R.uPos[o+2]=0;
    R.uPos[o+3]=x1;R.uPos[o+4]=y0;R.uPos[o+5]=0;
    R.uPos[o+6]=x1;R.uPos[o+7]=y1;R.uPos[o+8]=0;
    R.uPos[o+9]=x0;R.uPos[o+10]=y1;R.uPos[o+11]=0;
    const u0=u.fx<0?spr.u1:spr.u0,u1=u.fx<0?spr.u0:spr.u1;
    R.uUv[uo]=u0;R.uUv[uo+1]=spr.v0;
    R.uUv[uo+2]=u1;R.uUv[uo+3]=spr.v0;
    R.uUv[uo+4]=u1;R.uUv[uo+5]=spr.v1;
    R.uUv[uo+6]=u0;R.uUv[uo+7]=spr.v1;
    n++;if(n>=96)break;
  }
  for(const w of S.warbands){
    if(w.done)continue;
    const ci=idx(w.x|0,w.y|0);
    if(!inMap(w.x|0,w.y|0))continue;
    if(!S.visible[ci]&&!S.revealAll)continue;
    const x=lerp(w.px,w.x,alpha),y=lerp(w.py,w.y,alpha);
    for(let k=0;k<Math.min(w.size,3);k++){
      if(n>=96)break;
      const ox=(k===1?-0.35:(k===2?0.35:0)),oy=(k>0?0.25:0);
      const wx=x*CW+ox,wy=(S.H-y)-zig(x-0.5)+oy;
      const spr=SPR['u_raider_'+((t2+k)%2)];
      const o=n*12,uo=n*8;
      const x0=wx-0.5,x1=wx+0.5,y0=wy-0.5,y1=wy+0.5;
      R.uPos[o]=x0;R.uPos[o+1]=y0;R.uPos[o+2]=0;
      R.uPos[o+3]=x1;R.uPos[o+4]=y0;R.uPos[o+5]=0;
      R.uPos[o+6]=x1;R.uPos[o+7]=y1;R.uPos[o+8]=0;
      R.uPos[o+9]=x0;R.uPos[o+10]=y1;R.uPos[o+11]=0;
      R.uUv[uo]=spr.u0;R.uUv[uo+1]=spr.v0;
      R.uUv[uo+2]=spr.u1;R.uUv[uo+3]=spr.v0;
      R.uUv[uo+4]=spr.u1;R.uUv[uo+5]=spr.v1;
      R.uUv[uo+6]=spr.u0;R.uUv[uo+7]=spr.v1;
      n++;
    }
  }
  if(S.party){
    const P=S.party;
    const hs=partyHeroes();
    const ci=idx(P.x|0,P.y|0);
    if(inMap(P.x|0,P.y|0)&&(S.visible[ci]||S.explored[ci]||S.revealAll)){
      const x=lerp(P.px,P.x,alpha),y=lerp(P.py,P.y,alpha);
      for(let k=0;k<hs.length&&n<96;k++){
        const u=hs[k];
        const wx=x*CW+(k-1)*0.35,wy=(S.H-y)-zig(x-0.5)+(k===1?0.3:0);
        const spr=SPR['u_'+u.race+'_'+((t2+k)%2)];
        const o=n*12,uo=n*8;
        const x0=wx-0.5,x1=wx+0.5,y0=wy-0.5,y1=wy+0.5;
        R.uPos[o]=x0;R.uPos[o+1]=y0;R.uPos[o+2]=0;
        R.uPos[o+3]=x1;R.uPos[o+4]=y0;R.uPos[o+5]=0;
        R.uPos[o+6]=x1;R.uPos[o+7]=y1;R.uPos[o+8]=0;
        R.uPos[o+9]=x0;R.uPos[o+10]=y1;R.uPos[o+11]=0;
        R.uUv[uo]=spr.u0;R.uUv[uo+1]=spr.v0;
        R.uUv[uo+2]=spr.u1;R.uUv[uo+3]=spr.v0;
        R.uUv[uo+4]=spr.u1;R.uUv[uo+5]=spr.v1;
        R.uUv[uo+6]=spr.u0;R.uUv[uo+7]=spr.v1;
        n++;
      }
    }
  }
  for(const sh of S.ships){
    if(n>=95)break;
    const frac=sh.t/sh.ttl;
    const spr=SPR[frac>0.62?'ship1':'ship0'];
    const wx=sh.x*CW,wy=(S.H-sh.y)-zig(sh.x-0.5);
    const bob=0.06*Math.sin(S.time*4+sh.x);
    const o=n*12,uo=n*8;
    const x0=wx-0.5,x1=wx+0.5,y0=wy-0.5+bob,y1=wy+0.5+bob;
    R.uPos[o]=x0;R.uPos[o+1]=y0;R.uPos[o+2]=0;
    R.uPos[o+3]=x1;R.uPos[o+4]=y0;R.uPos[o+5]=0;
    R.uPos[o+6]=x1;R.uPos[o+7]=y1;R.uPos[o+8]=0;
    R.uPos[o+9]=x0;R.uPos[o+10]=y1;R.uPos[o+11]=0;
    const fl=sh.dx<0;
    R.uUv[uo]=fl?spr.u1:spr.u0;R.uUv[uo+1]=spr.v0;
    R.uUv[uo+2]=fl?spr.u0:spr.u1;R.uUv[uo+3]=spr.v0;
    R.uUv[uo+4]=fl?spr.u0:spr.u1;R.uUv[uo+5]=spr.v1;
    R.uUv[uo+6]=fl?spr.u1:spr.u0;R.uUv[uo+7]=spr.v1;
    n++;
  }
  R.unitGeo.setDrawRange(0,n*6);
  R.unitGeo.attributes.position.needsUpdate=true;
  R.unitGeo.attributes.uv.needsUpdate=true;
}
