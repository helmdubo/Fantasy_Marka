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
function buildTerrain(){
  // Перф: в рантайме террейн меняется только вырубкой леса (FOREST->GRASS),
  // что затрагивает ОДИН слой (FOREST): базовый, GRASS, ROCK, MTN и реки
  // статичны и строятся один раз (или по S.terrFullDirty после редких
  // губернаторских правок ландшафта).
  // Кэш плоского списка треугольников: colTris аллоцирует ~34k объектов на
  // проход — при частой перестройке слоя леса это давало GC-фризы.
  if(!R.triList){
    const arr=[];
    for(let x=-1;x<=S.W;x++)for(let y=-2;y<=S.H+1;y++){
      for(const tr of colTris(x,y)){
        const ci=tr.corners.map(c=>inMap(c[0],c[1])?idx(c[0],c[1]):-1);
        arr.push(x,y,tr.baseCol,tr.or==='r'?1:0,ci[0],ci[1],ci[2]);
      }
    }
    R.triList=new Int32Array(arr);
  }
  const TL=R.triList;
  const layerBatch=(t)=>{
    const b=makeBatch();
    for(let k=0;k<TL.length;k+=7){
      const i0=TL[k+4],i1=TL[k+5],i2=TL[k+6];
      const c0=(i0<0?T.WATER:S.terr[i0])>=t?1:0;
      const c1=(i1<0?T.WATER:S.terr[i1])>=t?1:0;
      const c2=(i2<0?T.WATER:S.terr[i2])>=t?1:0;
      const bits=c0|(c1<<1)|(c2<<2);
      if(bits===0)continue;
      const x=TL[k],y=TL[k+1],orr=TL[k+3]?'r':'l';
      const wyTop=WYCC(TL[k+2],y);
      const spr=(bits===7)?SPR['tri'+t+'_'+orr+'_full'+(hash2(x*2,y,t)<0.5?0:1)]:SPR['tri'+t+'_'+orr+'_'+bits];
      bQuad(b,WXC(x),wyTop-1,WXC(x)+CW,wyTop,spr);
    }
    return b;
  };
  const full=S.terrFullDirty||!R.terrStaticMeshes||!R.terrStaticMeshes.length;
  if(full){
    if(R.terrStaticMeshes)for(const m of R.terrStaticMeshes){R.scene.remove(m);m.geometry.dispose()}
    R.terrStaticMeshes=[];
    const base=makeBatch();
    for(let k=0;k<TL.length;k+=7){
      const x=TL[k],y=TL[k+1],orf=TL[k+3];
      const wyTop=WYCC(TL[k+2],y);
      const spr=SPR['tri0_'+(orf?'r':'l')+'_full'+(hash2(x*2+orf,y,5)<0.5?0:1)];
      bQuad(base,WXC(x),wyTop-1,WXC(x)+CW,wyTop,spr);
    }
    let m=meshFromBatch(base,1);R.scene.add(m);R.terrStaticMeshes.push(m);
    for(const [t,ord] of [[T.GRASS,2],[T.ROCK,4],[T.MTN,5]]){
      m=meshFromBatch(layerBatch(t),ord);R.scene.add(m);R.terrStaticMeshes.push(m);
    }
    // биом-тинты (степь/болотина): статичный марчинг по углам S.biome поверх лугов
    if(S.biome){
      const bb=makeBatch();
      for(const bio of [BIO.STEPPE,BIO.SWAMP]){
        for(let k=0;k<TL.length;k+=7){
          const bit=(i)=>i>=0&&S.biome[i]===bio&&S.terr[i]===T.GRASS?1:0;
          const bits=bit(TL[k+4])|(bit(TL[k+5])<<1)|(bit(TL[k+6])<<2);
          if(!bits)continue;
          const x=TL[k],y=TL[k+1],orr=TL[k+3]?'r':'l';
          const wyTop=WYCC(TL[k+2],y);
          bQuad(bb,WXC(x),wyTop-1,WXC(x)+CW,wyTop,SPR['bio'+bio+'_'+orr+'_'+bits]);
        }
      }
      m=meshFromBatch(bb,2.5);R.scene.add(m);R.terrStaticMeshes.push(m);
    }
    buildRivers();
    buildRelief();
    S.terrFullDirty=false;
  }
  if(R.terrForestMesh){R.scene.remove(R.terrForestMesh);R.terrForestMesh.geometry.dispose()}
  R.terrForestMesh=meshFromBatch(layerBatch(T.FOREST),3);
  R.scene.add(R.terrForestMesh);
  S.terrDirty=false;
}
function buildRivers(){
  // реки v3: русла по dual-треугольникам (order 6), дороги и мосты выше (order 7).
  // Ширина тайла — от накопленного потока (w1..3); noise-вариант меандра —
  // детерминированный хеш позиции (INV-T4: сигнатура та же, интерьер варьируется).
  if(R.riverMesh){R.scene.remove(R.riverMesh);R.riverMesh.geometry.dispose();R.riverMesh=null}
  if(!S.riverTris||!S.riverTris.size)return;
  const b=makeBatch();
  for(const r of S.riverTris.values()){
    if(!r.mask)continue;
    const wyTop=WYCC(r.baseCol,r.y);
    const v=hash2(r.x*3,r.y*5,911)<0.5?0:1;
    bQuad(b,WXC(r.x),wyTop-1,WXC(r.x)+CW,wyTop,SPR['rt_'+r.tint+'_'+r.or+'_'+r.mask+'_w'+(r.w||1)+'_v'+v]);
  }
  for(const r of S.riverTris.values())
    for(const ov of r.over){
      if(ov.kind==='mouth')bQuad(b,ov.wx-0.28,ov.wy-0.28,ov.wx+0.28,ov.wy+0.28,SPR['r_mouth']);
      else if(ov.kind==='falls')bQuad(b,ov.wx-0.34,ov.wy-0.4,ov.wx+0.34,ov.wy+0.4,SPR['r_falls']);
    }
  R.riverMesh=meshFromBatch(b,6);R.scene.add(R.riverMesh);
}
/* ---------- ГИПСОМЕТРИЧЕСКИЙ РЕЛЬЕФ по knowledge-слою (§4, §5) ----------
   Пояса E рисуются ТОЛЬКО по разведанным горам: кластеры пере-детектятся по
   S.explored, гора буквально «растёт из тумана» по мере разведки — открыл
   соседей хребта, маски перемарчились, пик дорос до снежника. Симуляция
   при этом читает истинное поле S.reliefE — рендер-слой чисто производный. */
function reliefRenderField(){
  const det=mclusterDetect(i=>S.terr[i]===T.MTN&&(S.explored[i]||S.revealAll));
  return reliefField(det);
}
function buildRelief(){
  if(R.reliefMesh){R.scene.remove(R.reliefMesh);R.reliefMesh.geometry.dispose();R.reliefMesh=null}
  const E=reliefRenderField();
  const TL=R.triList;
  const b=makeBatch();
  for(const L of [2,3,4,5]){ // stacked binary passes: один марчинг, разные материалы
    const th=L-0.5;
    for(let k=0;k<TL.length;k+=7){
      const bit=(i)=>i>=0&&E[i]>=th?1:0;
      const bits=bit(TL[k+4])|(bit(TL[k+5])<<1)|(bit(TL[k+6])<<2);
      if(!bits)continue;
      const x=TL[k],y=TL[k+1],orr=TL[k+3]?'r':'l';
      const wyTop=WYCC(TL[k+2],y);
      bQuad(b,WXC(x),wyTop-1,WXC(x)+CW,wyTop,SPR['rl'+L+'_'+orr+'_'+bits]);
    }
  }
  R.reliefMesh=meshFromBatch(b,5.5);R.scene.add(R.reliefMesh);
  S.reliefDirty=false;
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
  // настилы мостов: речное ребро с дорогой на обоих берегах
  if(S.riverEdges&&S.riverEdges.size){
    const N2=S.W*S.H;
    for(const k of S.riverEdges){
      const a=Math.floor(k/N2),c2=k%N2;
      if(!S.road[a]||!S.road[c2])continue;
      const ax=a%S.W,ay=(a/S.W)|0,bx2=c2%S.W,by2=(c2/S.W)|0;
      const mx=(WXC(ax)+WXC(bx2))/2,my=(WYCC(ax,ay)+WYCC(bx2,by2))/2;
      // настил вдоль оси дороги между гексами: N-S либо одна из диагоналей
      let key='bridge_v';
      if(ax!==bx2){
        const rise=(WYCC(bx2,by2)-WYCC(ax,ay))*(WXC(bx2)-WXC(ax))>0; // подъём вправо
        key=rise?'bridge_ne':'bridge_se';
      }
      bQuad(b,mx-CW*0.5,my-0.5,mx+CW*0.5,my+0.5,SPR[key]);
    }
  }
  for(const pl of S.roadPlans)
    for(let k=pl.i;k<pl.cells.length;k++){
      const c=pl.cells[k];
      const cx=WXC(c.x),cy=WYCC(c.x,c.y);
      bQuad(b,cx-0.5,cy-0.5,cx+0.5,cy+0.5,SPR['stake']);
    }
  R.roadMesh=meshFromBatch(b,7);R.scene.add(R.roadMesh);
  S.roadDirty=false;
}
// Drop I: debug-оверлей сеток — как «Main grid & dual grid» у Оскара.
// Dual (красный): рёбра треугольной решётки между центрами хексов.
// Main (синий): контуры Вороной-хексов — рёбра между центрами смежных треугольников.
// Мосты (золотой): рёбра гекс-графа, пересекающие русло, — кандидаты на мост (§6).
function buildGridOverlay(){
  if(R.gridDual){R.scene.remove(R.gridDual);R.gridDual.geometry.dispose();R.gridDual=null}
  if(R.gridMain){R.scene.remove(R.gridMain);R.gridMain.geometry.dispose();R.gridMain=null}
  if(R.gridBridge){R.scene.remove(R.gridBridge);R.gridBridge.geometry.dispose();R.gridBridge=null}
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
  // рёбра гекс-графа поверх русла: пересечение дороги с рекой = мост,
  // детектится тривиально — подсвечиваем все кандидаты
  const bridge=[];
  if(S.riverEdges&&S.riverEdges.size){
    const N2=S.W*S.H;
    for(const k of S.riverEdges){
      const a=Math.floor(k/N2),c2=k%N2;
      const ax=a%S.W,ay=(a/S.W)|0,bx2=c2%S.W,by2=(c2/S.W)|0;
      if(S.terr[a]===T.WATER&&S.terr[c2]===T.WATER)continue;
      bridge.push(WXC(ax),WYCC(ax,ay),0, WXC(bx2),WYCC(bx2,by2),0);
    }
  }
  R.gridBridge=mk(bridge,0xeec658,0.8);
}
function toggleGrid(){
  S.showGrid=!S.showGrid;
  if(!R.gridDual)buildGridOverlay();
  R.gridDual.visible=R.gridMain.visible=R.gridBridge.visible=!!S.showGrid;
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
    const spr=SPR['l_'+L.id],h=spr.h/32; // 32 px на гекс
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
    const spr=bd.built?((bd.type==='library'&&(bd.tier||1)>=2)?SPR['b_knowledge']:
      ((bd.type==='hut'&&(bd.tier||1)>=2)?SPR['b_house2']:SPR['b_'+bd.type])):SPR['b_site'];
    const h=spr.h/32; // 32 px на гекс
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
    const bh=(SPR['b_'+b.type]?SPR['b_'+b.type].h:32)/32;
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
/* PNG-юниты PixelLab: спрайт по гекс-направлению движения + кадры walk/work.
   Слоты флэт-топ гекса: N, NE, SE, S, SW, NW (E/W на карте не бывает). */
function unitHexSlot(dx,dy){
  // (dx,dy) в координатах карты (x вправо, y вниз) -> мировой угол от севера
  let deg=Math.atan2(dx*CW,-dy)*180/Math.PI;
  if(deg<0)deg+=360;
  return ['n','ne','se','s','sw','nw'][(((deg+30)%360)/60)|0];
}
function unitSprPick(race,moving,working,dirX,dirY,lastSlot,id){
  let slot=lastSlot||'s';
  if(moving&&(dirX||dirY))slot=unitHexSlot(dirX,dirY);
  let key=null;
  if(moving)key='up_'+race+'_walk_'+slot+'_'+((Math.floor(S.time*10)+id)%8);
  else if(working&&SPR['up_'+race+'_work_'+slot+'_0'])
    key='up_'+race+'_work_'+slot+'_'+((Math.floor(S.time*8)+id)%9);
  if(!key||!SPR[key])key='up_'+race+'_idle_'+slot;
  const spr=SPR[key];
  return spr?{spr,slot}:null; // null -> ASCII-фолбэк
}
const UNIT_SCALE={troll:1.5}; // тролль — здоровяк: в полтора роста остальных
// квад PNG-юнита: холст 56px (арт 32px по центру), ноги ~на прежней базовой линии
function pushUnitQuad(n,wx,wy,spr,scale){
  const s=scale||1;
  const h=0.95*s,hw=0.475*s;
  const y0=wy-0.44-0.214*h,y1=y0+h;
  const o=n*12,uo=n*8;
  const x0=wx-hw,x1=wx+hw;
  R.uPos[o]=x0;R.uPos[o+1]=y0;R.uPos[o+2]=0;
  R.uPos[o+3]=x1;R.uPos[o+4]=y0;R.uPos[o+5]=0;
  R.uPos[o+6]=x1;R.uPos[o+7]=y1;R.uPos[o+8]=0;
  R.uPos[o+9]=x0;R.uPos[o+10]=y1;R.uPos[o+11]=0;
  R.uUv[uo]=spr.u0;R.uUv[uo+1]=spr.v0;
  R.uUv[uo+2]=spr.u1;R.uUv[uo+3]=spr.v0;
  R.uUv[uo+4]=spr.u1;R.uUv[uo+5]=spr.v1;
  R.uUv[uo+6]=spr.u0;R.uUv[uo+7]=spr.v1;
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
     const sx0=wx-0.22,sx1=wx+0.22,sy0=wy-0.33,sy1=wy-0.33+0.44;
     R.uPos[so]=sx0;R.uPos[so+1]=sy0;R.uPos[so+2]=0;
     R.uPos[so+3]=sx1;R.uPos[so+4]=sy0;R.uPos[so+5]=0;
     R.uPos[so+6]=sx1;R.uPos[so+7]=sy1;R.uPos[so+8]=0;
     R.uPos[so+9]=sx0;R.uPos[so+10]=sy1;R.uPos[so+11]=0;
     R.uUv[su]=sh.u0;R.uUv[su+1]=sh.v0;R.uUv[su+2]=sh.u1;R.uUv[su+3]=sh.v0;
     R.uUv[su+4]=sh.u1;R.uUv[su+5]=sh.v1;R.uUv[su+6]=sh.u0;R.uUv[su+7]=sh.v1;
     n++;if(n>=95)break;}
    const pick=unitSprPick(u.race,u.act==='goto',u.act==='work',u.dirX,u.dirY,u.sprSlot,u.id);
    if(pick){ // PNG-спрайт PixelLab: 6 гекс-сторон + кадры walk/work
      u.sprSlot=pick.slot;
      pushUnitQuad(n,wx,wy,pick.spr,UNIT_SCALE[u.race]);
      n++;if(n>=96)break;
      continue;
    }
    const o=n*12,uo=n*8;
    const x0=wx-0.27,x1=wx+0.27,y0=wy-0.5,y1=wy+0.04; // юнит прежнего размера при гексе x2
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
    const mdx=w.x-w.px,mdy=w.y-w.py;
    const moving=Math.abs(mdx)+Math.abs(mdy)>0.001;
    for(let k=0;k<Math.min(w.size,3);k++){
      if(n>=96)break;
      const ox=(k===1?-0.35:(k===2?0.35:0)),oy=(k>0?0.25:0);
      const wx=x*CW+ox,wy=(S.H-y)-zig(x-0.5)+oy;
      const pick=unitSprPick('raider',moving,false,mdx,mdy,w.sprSlot,k);
      if(pick){
        w.sprSlot=pick.slot;
        pushUnitQuad(n,wx,wy,pick.spr);
        n++;continue;
      }
      const spr=SPR['u_raider_'+((t2+k)%2)];
      const o=n*12,uo=n*8;
      const x0=wx-0.27,x1=wx+0.27,y0=wy-0.5,y1=wy+0.04; // юнит прежнего размера при гексе x2
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
      const pdx=P.x-P.px,pdy=P.y-P.py;
      const pMoving=Math.abs(pdx)+Math.abs(pdy)>0.001;
      for(let k=0;k<hs.length&&n<96;k++){
        const u=hs[k];
        const wx=x*CW+(k-1)*0.35,wy=(S.H-y)-zig(x-0.5)+(k===1?0.3:0);
        const pick=unitSprPick(u.race,pMoving,false,pdx,pdy,P.sprSlot,k);
        if(pick){
          P.sprSlot=pick.slot;
          pushUnitQuad(n,wx,wy,pick.spr,UNIT_SCALE[u.race]);
          n++;continue;
        }
        const spr=SPR['u_'+u.race+'_'+((t2+k)%2)];
        const o=n*12,uo=n*8;
        const x0=wx-0.27,x1=wx+0.27,y0=wy-0.5,y1=wy+0.04; // юнит прежнего размера при гексе x2
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
    const x0=wx-0.34,x1=wx+0.34,y0=wy-0.4+bob,y1=wy+0.28+bob;
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
