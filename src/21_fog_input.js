function bayer4(x,y){const m=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];return (m[(y&3)*4+(x&3)]+0.5)/16}
function fogBaseAlphaAtCell(x,y){
  if(!inMap(x,y))return 1;
  const i=idx(x,y);
  if(S.revealAll)return S.visible[i]?0:0.22;
  if(S.visible[i])return 0;
  if(S.explored[i])return 0.62;
  return 1;
}
function fogAlphaAt(wx,wy,px,py){
  // (wx,wy) — three-мировая точка; клетка через pickHex
  const c=pickHex(wx,wy);
  const cx=c.x,cy=c.y;
  let base=fogBaseAlphaAtCell(cx,cy);
  if(base<=0)return 0;
  let nearest=99;
  for(let yy=cy-3;yy<=cy+3;yy++)for(let xx=cx-3;xx<=cx+3;xx++){
    if(!inMap(xx,yy))continue;
    const i=idx(xx,yy);
    if(!S.visible[i])continue;
    const dx=wx-WXC(xx),dy=wy-WYCC(xx,yy);
    const d=Math.hypot(dx,dy);
    if(d<nearest)nearest=d;
  }
  if(nearest<2.05){
    const t=clamp((nearest-0.45)/1.60,0,1);
    base*=t*t*(3-2*t);
  }
  // pixel/dithered edge, not a blurry full-screen gradient.
  base=clamp(base+(bayer4(px,py)-0.5)*0.10,0,1);
  return base;
}
const FOG_WX0=-CW,FOG_WTOP=null; // левый край канвы тумана в мировых X; верх = S.H+1
function ppt(){return 16*(R&&R.ZOOMS?R.ZOOMS[R.zoomIdx]:3)} // Drop I fix: pixels per 1 world unit; CW уже учтён в WXC/WYCC
function ensureFogLut(){
  // Пиксель->клетка (pickHex) считается ОДИН раз: геометрия канвы тумана
  // статична. Раньше pickHex звался на каждый пиксель каждой перерисовки.
  const sc=FOG_SCALE||1;
  const W=Math.ceil((S.W+2)*CW*sc),H=(S.H+2)*sc;
  if(R.fogLut&&R.fogLutW===W&&R.fogLutH===H)return;
  R.fogLutW=W;R.fogLutH=H;
  const lut=R.fogLut=new Int32Array(W*H);
  const topY=S.H+1;
  for(let py=0;py<H;py++)for(let px=0;px<W;px++){
    const wx=FOG_WX0+(px+0.5)/sc,wy=topY-(py+0.5)/sc;
    const c=pickHex(wx,wy);
    lut[py*W+px]=inMap(c.x,c.y)?idx(c.x,c.y):-1;
  }
}
function paintFog(){
  // Оптимизация: ImageData вместо 200k fillRect; евклидово смягчение кромки
  // считается только в клетках на расстоянии <=3 гексов от видимых (BFS).
  const sc=FOG_SCALE||1;
  ensureFogLut();
  const W=R.fogLutW,H=R.fogLutH;
  if(R.fogCv.width!==W||R.fogCv.height!==H){R.fogCv.width=W;R.fogCv.height=H}
  const c=R.fogCv.getContext('2d');
  const NC=S.W*S.H;
  if(!R.fogBaseA||R.fogBaseA.length!==NC){R.fogBaseA=new Float32Array(NC);R.fogEdge=new Uint8Array(NC)}
  const baseA=R.fogBaseA,edge=R.fogEdge;
  for(let i=0;i<NC;i++)
    baseA[i]=S.revealAll?(S.visible[i]?0:0.22):(S.visible[i]?0:(S.explored[i]?0.62:1));
  // кромка видимости: multi-source BFS глубиной 3 гекса
  edge.fill(0);
  const q=[];
  for(let i=0;i<NC;i++)if(S.visible[i]){edge[i]=1;q.push(i)}
  for(let head=0;head<q.length;head++){
    const cur=q[head],dcur=edge[cur];
    if(dcur>=4)continue;
    const cx2=cur%S.W,cy2=(cur/S.W)|0;
    for(const d of hexDirs(cx2)){
      const nx=cx2+d[0],ny=cy2+d[1];
      if(!inMap(nx,ny))continue;
      const ni=ny*S.W+nx;
      if(!edge[ni]){edge[ni]=dcur+1;q.push(ni)}
    }
  }
  if(!R.fogImg||R.fogImg.width!==W||R.fogImg.height!==H)R.fogImg=c.createImageData(W,H);
  const data=R.fogImg.data;
  const topY=S.H+1,lut=R.fogLut;
  let p=0;
  for(let py=0;py<H;py++)for(let px=0;px<W;px++,p+=4){
    const ci=lut[py*W+px];
    let a=ci<0?1:baseA[ci];
    if(a>0){
      if(ci>=0&&edge[ci]>1){ // рядом с видимой зоной — точное смягчение
        const wx=FOG_WX0+(px+0.5)/sc,wy=topY-(py+0.5)/sc;
        const cx2=ci%S.W,cy2=(ci/S.W)|0;
        let n2=9801;
        for(let yy=cy2-3;yy<=cy2+3;yy++)for(let xx=cx2-3;xx<=cx2+3;xx++){
          if(xx<0||yy<0||xx>=S.W||yy>=S.H)continue;
          if(!S.visible[yy*S.W+xx])continue;
          const dx=wx-WXC(xx),dy=wy-WYCC(xx,yy);
          const d2=dx*dx+dy*dy;
          if(d2<n2)n2=d2;
        }
        const nearest=Math.sqrt(n2);
        if(nearest<2.05){
          const t=clamp((nearest-0.45)/1.60,0,1);
          a*=t*t*(3-2*t);
        }
      }
      a=clamp(a+(bayer4(px,py)-0.5)*0.10,0,1);
    }
    data[p]=9;data[p+1]=7;data[p+2]=14;
    data[p+3]=a>0.015?(a*255)|0:0;
  }
  c.putImageData(R.fogImg,0,0);
  if(S.hoverLair>=0){
    const L=S.lairs[S.hoverLair];
    c.fillStyle='rgba(210,60,50,0.26)';
    for(let dy=-CFG.FEAR_R-1;dy<=CFG.FEAR_R+1;dy++)for(let dx=-CFG.FEAR_R;dx<=CFG.FEAR_R;dx++){
      const x=L.x+dx,y=L.y+dy;
      if(!inMap(x,y)||cheb(x,y,L.x,L.y)>CFG.FEAR_R)continue;
      c.fillRect(Math.round((WXC(x)-CW*0.5-FOG_WX0)*sc),Math.round((topY-(WYCC(x,y)+0.5))*sc),Math.ceil(CW*sc),sc);
    }
  }
  R.fogTex.needsUpdate=true;S.fogDirty=false;
}
function updateCam(){
  const w=R.canvas.width,h=R.canvas.height,p=ppt();
  R.cam.x=clamp(R.cam.x,-2,S.W*CW+2);R.cam.y=clamp(R.cam.y,-2,S.H+2);
  const cx=Math.round(R.cam.x*p)/p,cy=Math.round(R.cam.y*p)/p;
  const hw=w/p/2,hh=h/p/2;
  R.camera.left=cx-hw;R.camera.right=cx+hw;
  R.camera.top=cy+hh;R.camera.bottom=cy-hh;
  R.camera.updateProjectionMatrix();
}
function resize(){
  const w=window.innerWidth,h=window.innerHeight;
  R.canvas.width=w;R.canvas.height=h;
  R.renderer.setSize(w,h,false);
  updateCam();
}
function screenToCell(mx,my){
  const p=ppt();
  const wx=R.camera.left+mx/p;
  const wy=R.camera.top-my/p;
  const c=pickHex(wx,wy);
  return {cx:c.x,cy:c.y,wx,wy};
}
const WORK_LABEL={oper:'трудится',watch:'несёт дозор',build:'строит',pave:'мостит дорогу',
  clear:'расчищает трассу',supply:'несёт на стройку',ruins:'копается в руинах'};
function updateTip(mx,my,clx,cly){
  if(clx===undefined){clx=mx;cly=my}
  const tip=document.getElementById('tip');
  const {cx,cy}=screenToCell(mx,my);
  if(!inMap(cx,cy)){tip.style.display='none';
    if(S.hoverLair!==-1){S.hoverLair=-1;S.fogDirty=true}return}
  const i=idx(cx,cy);
  let html='',hl=-1;
  if(!S.explored[i]&&!S.revealAll){
    html='<div class="t2">Неизведанные земли</div>';
  }else{
    let tn0=TNAME[S.terr[i]];
    if(S.terr[i]===T.WATER)tn0=(S.waterKind[i]===2)?'Море':'Озеро';
    html='<div class="t1">'+tn0+'</div>';
    if(cellNearRiver(cx,cy))html+='<div class="t2">🌊 у реки — на тот берег только по мосту (дорога на обоих берегах)</div>';
    if(S.terr[i]===T.FOREST&&S.terrHp[i]>0)html+='<div class="t2">древесины на '+S.terrHp[i]+' ходки</div>';
    if(S.feat[i]){html+='<div>'+FNAME[S.feat[i]]+'</div>';
      if(S.feat[i]===F.VEIN)html+='<div class="t2">добудут только гномы</div>';}
    const bi=S.bld[i];
    if(bi>=0){const b=S.buildings[bi];
      html+='<div class="t1">'+dispName(b)+(b.built?'':' — стройка')+'</div>'}
    const li=S.lairAt[i];
    if(li>=0){const L=S.lairs[li];hl=li;
      html+='<div class="warn">☠ '+L.name+' · тир '+L.tier+'</div>'}
    if(S.fear[i]&&li<0)html+='<div class="warn">зона страха — здесь не работают</div>';
    for(const u of S.settlers){
      if(u.inside<0&&(u.x|0)===cx&&(u.y|0)===cy&&(S.visible[i]||S.revealAll)){
        const act=(u.act==='work'&&u.job)?WORK_LABEL[u.job.kind]:
          (u.after==='deposit'?'несёт на склад':ACTNAME[u.act]);
        html+='<div class="t2">'+RNAME[u.race]+' — '+act+' · кошель '+u.wallet.toFixed(1)+'з</div>';
        break;
      }
    }
    html+='<div class="t2">'+cx+', '+cy+'</div>';
  }
  if(hl!==S.hoverLair){S.hoverLair=hl;S.fogDirty=true}
  tip.innerHTML=html;
  tip.style.display='block';
  const px2=Math.min(clx+16,window.innerWidth-250),py2=Math.min(cly+12,window.innerHeight-120);
  tip.style.left=px2+'px';tip.style.top=py2+'px';
}
const KEYS={};
function canvasXY(clientX,clientY){
  const r=R.canvas.getBoundingClientRect();
  return {x:(clientX-r.left)*(R.canvas.width/r.width),
          y:(clientY-r.top)*(R.canvas.height/r.height)};
}
function hexCellOutline(x,y){
  // Вороной-контур клетки: центры 6 треугольников вокруг (x,y), по углу
  const pts=[];
  for(const xx of [x-1,x])for(let yy=y-2;yy<=y+1;yy++)
    for(const tr of colTris(xx,yy))
      if(tr.corners.some(c=>c[0]===x&&c[1]===y)){
        let gx=0,gy=0;
        for(const c of tr.corners){gx+=WXC(c[0]);gy+=WYCC(c[0],c[1])}
        pts.push([gx/3,gy/3]);
      }
  const cx=WXC(x),cy=WYCC(x,y);
  pts.sort((a,b)=>Math.atan2(a[1]-cy,a[0]-cx)-Math.atan2(b[1]-cy,b[0]-cx));
  return pts;
}
function updatePinOutline(){
  if(R.pinLoop){R.scene.remove(R.pinLoop);R.pinLoop.geometry.dispose();R.pinLoop=null}
  if(!S.pin)return;
  let x,y;
  if(S.pin.kind==='bld'){const b=S.buildings[S.pin.id];if(!b)return;x=b.x;y=b.y}
  else if(S.pin.kind==='cell'){x=S.pin.x;y=S.pin.y}
  else return;
  const pts=hexCellOutline(x,y);
  if(pts.length<3)return;
  const arr=new Float32Array(pts.length*3);
  pts.forEach((p,i)=>{arr[i*3]=p[0];arr[i*3+1]=p[1];arr[i*3+2]=0});
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(arr,3));
  R.pinLoop=new THREE.LineLoop(g,new THREE.LineBasicMaterial({color:0xd05a4e,transparent:true,opacity:0.9,depthTest:false}));
  R.pinLoop.renderOrder=36;R.pinLoop.frustumCulled=false;
  R.scene.add(R.pinLoop);
}
function pickPin(mx,my){
  const {cx,cy}=screenToCell(mx,my);
  let pin=null;
  if(inMap(cx,cy)&&(S.explored[idx(cx,cy)]||S.revealAll)){
    for(const u of S.settlers){
      if(u.inside<0&&(u.x|0)===cx&&(u.y|0)===cy&&(S.visible[idx(cx,cy)]||S.revealAll)){pin={kind:'unit',id:u.id};break}
    }
    if(!pin&&S.bld[idx(cx,cy)]>=0)pin={kind:'bld',id:S.bld[idx(cx,cy)]};
    if(!pin)pin={kind:'cell',x:cx,y:cy};
  }
  S.pin=pin;S.uiDirty=true;
  updatePinOutline();
}
function bindInput(){
  const cv=R.canvas;
  cv.style.touchAction='none';
  const beginDrag=(clientX,clientY)=>{
    const p=canvasXY(clientX,clientY);
    R.drag={mx:p.x,my:p.y,cx:R.cam.x,cy:R.cam.y,moved:false};
  };
  const moveDrag=(clientX,clientY,threshold)=>{
    if(!R.drag)return;
    const p=canvasXY(clientX,clientY),pp=ppt();
    R.cam.x=R.drag.cx-(p.x-R.drag.mx)/pp;
    R.cam.y=R.drag.cy+(p.y-R.drag.my)/pp;
    if(Math.abs(p.x-R.drag.mx)+Math.abs(p.y-R.drag.my)>threshold)R.drag.moved=true;
  };
  const pinchState=(pts)=>{
    const a=pts[0],b=pts[1];
    return {d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),z:R.zoomIdx};
  };
  const updatePinch=(pts)=>{
    if(!R.pinch||pts.length<2)return;
    const a=pts[0],b=pts[1];
    const d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
    const ratio=d/R.pinch.d;
    let z=R.pinch.z;
    if(ratio>1.3)z=R.pinch.z+1;else if(ratio<0.77)z=R.pinch.z-1;
    R.zoomIdx=clamp(z,0,R.ZOOMS.length-1);
  };

  if(window.PointerEvent){
    const pts=new Map();
    const values=()=>Array.from(pts.values());
    cv.addEventListener('pointerdown',e=>{
      if(e.button!==undefined&&e.button!==0&&e.pointerType==='mouse')return;
      e.preventDefault();
      try{cv.setPointerCapture(e.pointerId)}catch(_e){}
      pts.set(e.pointerId,{clientX:e.clientX,clientY:e.clientY});
      if(pts.size===1){beginDrag(e.clientX,e.clientY);R.pinch=null}
      else if(pts.size>=2){R.drag=null;R.pinch=pinchState(values())}
    });
    cv.addEventListener('pointermove',e=>{
      const p=canvasXY(e.clientX,e.clientY);
      if(!pts.has(e.pointerId)){
        if(e.pointerType==='mouse')updateTip(p.x,p.y,e.clientX,e.clientY);
        return;
      }
      e.preventDefault();
      pts.set(e.pointerId,{clientX:e.clientX,clientY:e.clientY});
      if(pts.size===1){moveDrag(e.clientX,e.clientY,e.pointerType==='touch'?8:3)}
      else updatePinch(values());
      if(e.pointerType==='mouse')updateTip(p.x,p.y,e.clientX,e.clientY);
    });
    const endPointer=e=>{
      const had=pts.has(e.pointerId),wasDrag=R.drag,wasMoved=R.drag&&R.drag.moved;
      const p=canvasXY(e.clientX,e.clientY);
      if(had)pts.delete(e.pointerId);
      if(!had)return;
      if(pts.size===0){
        if(wasDrag&&!wasMoved)pickPin(p.x,p.y);
        R.drag=null;R.pinch=null;
      }else if(pts.size===1){
        const r=values()[0];
        beginDrag(r.clientX,r.clientY);R.pinch=null;
      }else R.pinch=pinchState(values());
    };
    cv.addEventListener('pointerup',endPointer);
    cv.addEventListener('pointercancel',endPointer);
    cv.addEventListener('lostpointercapture',e=>{if(pts.has(e.pointerId))endPointer(e)});
  }else{
    cv.addEventListener('mousedown',e=>{beginDrag(e.clientX,e.clientY)});
    cv.addEventListener('touchstart',e=>{
      e.preventDefault();
      if(e.touches.length===1){beginDrag(e.touches[0].clientX,e.touches[0].clientY);R.pinch=null}
      else if(e.touches.length===2){R.drag=null;R.pinch=pinchState([e.touches[0],e.touches[1]])}
    },{passive:false});
    cv.addEventListener('touchmove',e=>{
      e.preventDefault();
      if(e.touches.length===1&&R.drag)moveDrag(e.touches[0].clientX,e.touches[0].clientY,8);
      else if(e.touches.length===2)updatePinch([e.touches[0],e.touches[1]]);
    },{passive:false});
    cv.addEventListener('touchend',e=>{
      e.preventDefault();
      if(e.touches.length===0){
        if(R.drag&&!R.drag.moved){const t=e.changedTouches[0],p=canvasXY(t.clientX,t.clientY);pickPin(p.x,p.y)}
        R.drag=null;R.pinch=null;
      }
    },{passive:false});
    window.addEventListener('mousemove',e=>{
      const p=canvasXY(e.clientX,e.clientY);
      if(R.drag)moveDrag(e.clientX,e.clientY,3);
      if(e.target===cv||!R.drag)updateTip(p.x,p.y,e.clientX,e.clientY);
    });
    window.addEventListener('mouseup',e=>{
      if(R.drag&&!R.drag.moved&&e.target===cv){const p=canvasXY(e.clientX,e.clientY);pickPin(p.x,p.y)}
      R.drag=null;
    });
  }
  cv.addEventListener('wheel',e=>{
    e.preventDefault();
    const pc=canvasXY(e.clientX,e.clientY);
    const before=screenToCell(pc.x,pc.y);
    const old=R.zoomIdx;
    R.zoomIdx=clamp(R.zoomIdx+(e.deltaY<0?1:-1),0,R.ZOOMS.length-1);
    if(R.zoomIdx!==old){
      updateCam();
      const after=screenToCell(pc.x,pc.y);
      R.cam.x+=before.wx-after.wx;
      R.cam.y+=before.wy-after.wy;
    }
  },{passive:false});
  window.addEventListener('keydown',e=>{
    if(e.target.tagName==='INPUT'&&e.target.type==='text')return;
    KEYS[e.code]=true;
    if(e.code==='Space'){e.preventDefault();togglePause()}
    if(e.code==='Digit1')setSpeed(1);
    if(e.code==='Digit2')setSpeed(2);
    if(e.code==='Digit3')setSpeed(4);
    if(e.code==='Backquote'){e.preventDefault();toggleDebug()}
    if(e.code==='KeyG'){e.preventDefault();toggleGrid()}
  });
  window.addEventListener('keyup',e=>{KEYS[e.code]=false});
  window.addEventListener('resize',resize);
}
function keysPan(dt){
  const v=26/R.ZOOMS[R.zoomIdx]*3*dt;
  if(KEYS['KeyW']||KEYS['ArrowUp'])R.cam.y+=v;
  if(KEYS['KeyS']||KEYS['ArrowDown'])R.cam.y-=v;
  if(KEYS['KeyA']||KEYS['ArrowLeft'])R.cam.x-=v;
  if(KEYS['KeyD']||KEYS['ArrowRight'])R.cam.x+=v;
}
function initRender(){
  const canvas=document.getElementById('gl');
  R={canvas,zoomIdx:1,ZOOMS:[2,3,4],cam:{x:(S.th.x+0.5)*CW,y:(S.H-1-S.th.y)+0.5-zig(S.th.x)},
     terrStaticMeshes:[],terrForestMesh:null,featMesh:null,bldMesh:null,roadMesh:null,drag:null};
  R.renderer=new THREE.WebGLRenderer({canvas,antialias:false});
  R.renderer.setPixelRatio(1);
  R.scene=new THREE.Scene();
  R.scene.background=new THREE.Color(0x0b0910);
  R.camera=new THREE.OrthographicCamera(-1,1,1,-1,0.1,50);
  R.camera.position.z=10;
  R.tex=new THREE.CanvasTexture(ATLAS.cv);
  R.tex.magFilter=THREE.NearestFilter;R.tex.minFilter=THREE.NearestFilter;
  R.tex.generateMipmaps=false;
  R.mat=new THREE.MeshBasicMaterial({map:R.tex,transparent:true,depthTest:false,depthWrite:false});
  R.fogCv=document.createElement('canvas');R.fogCv.width=S.W*FOG_SCALE;R.fogCv.height=S.H*FOG_SCALE;
  R.fogTex=new THREE.CanvasTexture(R.fogCv);
  R.fogTex.magFilter=THREE.NearestFilter;R.fogTex.minFilter=THREE.NearestFilter;
  R.fogTex.generateMipmaps=false;
  const fmat=new THREE.MeshBasicMaterial({map:R.fogTex,transparent:true,depthTest:false,depthWrite:false});
  // Flat-top: план тумана покрывает мировой прямоугольник X∈[-CW,(W+1)*CW], Y∈[-1,H+1]
  {const pw=(S.W+2)*CW,ph=S.H+2;
   R.fog=new THREE.Mesh(new THREE.PlaneGeometry(pw,ph),fmat);
   R.fog.position.set(-CW+pw/2,(S.H+1)-ph/2,0);}
  R.fog.renderOrder=50;
  R.scene.add(R.fog);
  makeUnitMesh();
  makeFxMesh();
  makeGlowMesh();
  R.nightO=0;
  const nmat=new THREE.MeshBasicMaterial({color:0x0d1430,transparent:true,opacity:0,depthTest:false,depthWrite:false});
  R.night=new THREE.Mesh(new THREE.PlaneGeometry((S.W+4)*CW,S.H+4),nmat);
  R.night.position.set(S.W*CW/2,S.H/2,0);
  R.night.renderOrder=40;
  R.scene.add(R.night);
  bindInput();
  resize();
  buildTerrain();buildRoads();buildStatics();buildBuildings();paintFog();
}

