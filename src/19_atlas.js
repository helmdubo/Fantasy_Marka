/* ================= ATLAS (browser only) =================
   Тайлы 28×32 на гекс (укрупнение мира ×2), здания 32px, юниты 16px
   (рисуются в полгекса — экранная плотность совпадает). */
let ATLAS=null,SPR={},ICONS={},UNIT_IMGS=null;
/* PNG-спрайты юнитов (PixelLab, вшиты сборкой в UNIT_PNG): декодируем base64
   в Image ОДИН раз до boot() — buildAtlas синхронный и рисует уже готовые. */
function loadUnitImages(){
  if(UNIT_IMGS)return Promise.resolve(UNIT_IMGS);
  const imgs={},jobs=[];
  const add=(key,b64)=>{jobs.push(new Promise((res)=>{
    const im=new Image();
    im.onload=()=>{imgs[key]=im;res()};
    im.onerror=()=>res(); // фейл декода — просто нет ключа, рендер уйдёт в ASCII-фолбэк
    im.src='data:image/png;base64,'+b64;
  }))};
  if(typeof UNIT_PNG!=='undefined')for(const race in UNIT_PNG){
    const rec=UNIT_PNG[race];
    for(const slot in rec.idle)add(race+'_idle_'+slot,rec.idle[slot]);
    for(const anim of ['walk','work']){
      if(!rec[anim])continue;
      for(const slot in rec[anim])
        rec[anim][slot].forEach((b,f)=>add(race+'_'+anim+'_'+slot+'_'+f,b));
    }
  }
  return Promise.all(jobs).then(()=>{UNIT_IMGS=imgs;return imgs});
}
function reg(name,x,y,w,h){
  SPR[name]={x,y,w,h,u0:x/ATLAS.W,u1:(x+w)/ATLAS.W,v1:1-y/ATLAS.H,v0:1-(y+h)/ATLAS.H};
}
function outlineRegion(ctx,gx,gy,w,h){
  const img=ctx.getImageData(gx,gy,w,h),d=img.data;
  const solid=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&d[(y*w+x)*4+3]>10;
  const marks=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(solid(x,y))continue;
    if(solid(x+1,y)||solid(x-1,y)||solid(x,y+1)||solid(x,y-1))marks.push([x,y]);
  }
  ctx.fillStyle=PAL.o;
  for(const[mx,my]of marks)ctx.fillRect(gx+mx,gy+my,1,1);
}
function vgradeRegion(ctx,gx,gy,w,h,amt){
  const img=ctx.getImageData(gx,gy,w,h),d=img.data;
  for(let y=0;y<h;y++){
    const f=1+amt*(1-2*y/(h-1)); // верх светлей, низ темней
    for(let x=0;x<w;x++){
      const o=(y*w+x)*4;
      if(d[o+3]<10)continue;
      d[o]=clamp(d[o]*f,0,255);d[o+1]=clamp(d[o+1]*f,0,255);d[o+2]=clamp(d[o+2]*f,0,255);
    }
  }
  ctx.putImageData(img,gx,gy);
}
function drawGrid(ctx,gx,gy,rows,map,skip){
  for(let y=0;y<rows.length;y++){const row=rows[y];
    for(let x=0;x<row.length;x++){const ch=row[x];
      if(ch==='.')continue;
      if(skip&&skip(x,y))continue;
      const col=map[ch]||'#f0f';
      ctx.fillStyle=col;ctx.fillRect(gx+x,gy+y,1,1);
    }
  }
}
/* --- Drop I v1.2: flat-top. Dual-triangle тайлы 28x32, ориентации 'r' ▶ / 'l' ◀.
   Колонки odd-q со сдвигом вниз, шаг CW=28/32; у хекса две ГОРИЗОНТАЛЬНЫЕ грани.
   Барицентрическая интерполяция трёх угловых бит; седловых неоднозначностей нет. --- */
const TRIW=28,TRIH=32;
function triCorners(orr){
  // 'r' ▶: углы [TL, BL, апекс-право]; 'l' ◀: [TR, BR, апекс-лево]
  return (orr==='r')?[[0,0],[0,TRIH],[TRIW,TRIH/2]]:[[TRIW,0],[TRIW,TRIH],[0,TRIH/2]];
}
function triBary(orr,pxx,pyy){
  const [a,b,c]=triCorners(orr);
  const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  const w0=((b[1]-c[1])*(pxx-c[0])+(c[0]-b[0])*(pyy-c[1]))/den;
  const w1=((c[1]-a[1])*(pxx-c[0])+(a[0]-c[0])*(pyy-c[1]))/den;
  return [w0,w1,1-w0-w1];
}
function triIns(orr){
  return (x,y)=>{const w=triBary(orr,x+0.5,y+0.5);
    return w[0]>=-0.045&&w[1]>=-0.045&&w[2]>=-0.045};
}
/* Декор террейна поверх шума: лес — ёлки, луга — пучки трав, скалы — валуны
   и трещины, горы — гребни и снежники, вода — гребешки волн.
   ins(x,y) — пиксель принадлежит этому террейну (маска перехода/треугольник). */
function decorTri(ctx,x0,y0,t,seed,ins){
  const put=(x,y,c)=>{if(x>=0&&y>=0&&x<TRIW&&y<TRIH&&ins(x,y)){ctx.fillStyle=c;ctx.fillRect(x0+x,y0+y,1,1)}};
  const fits=(x,y,w,h)=>{if(x<0||y<0||x+w>TRIW||y+h>TRIH)return false;
    for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(!ins(xx,yy))return false;return true};
  const rnd=(i,k)=>hash2(i,seed+k*17,809);
  if(t===T.FOREST){
    let n=0;
    for(let i=0;i<18&&n<6;i++){
      const tx=(rnd(i,1)*(TRIW-5))|0, ty=(rnd(i,2)*(TRIH-8))|0;
      if(rnd(i,3)<0.55&&fits(tx,ty,5,8)){ // ель 5×8
        put(tx+2,ty,PAL.F3);
        put(tx+1,ty+1,PAL.F3);put(tx+2,ty+1,PAL.F3);put(tx+3,ty+1,PAL.F2);
        put(tx+1,ty+2,PAL.F3);put(tx+2,ty+2,PAL.F2);put(tx+3,ty+2,PAL.F1);
        for(let k=0;k<5;k++)put(tx+k,ty+3,k<2?PAL.F3:(k<4?PAL.F2:PAL.F1));
        for(let k=0;k<5;k++)put(tx+k,ty+4,k<1?PAL.F2:(k<3?PAL.F2:PAL.F1));
        put(tx+1,ty+5,PAL.F1);put(tx+2,ty+5,PAL.F1);put(tx+3,ty+5,PAL.F1);
        put(tx+2,ty+6,PAL.D);
        put(tx+1,ty+7,PAL.F1);put(tx+3,ty+7,PAL.F1); // тень у корня
        n++;
      }else if(fits(tx,ty,3,5)){ // ёлочка 3×5
        put(tx+1,ty,PAL.F3);
        put(tx,ty+1,PAL.F3);put(tx+1,ty+1,PAL.F2);put(tx+2,ty+1,PAL.F1);
        put(tx,ty+2,PAL.F2);put(tx+1,ty+2,PAL.F2);put(tx+2,ty+2,PAL.F1);
        put(tx+1,ty+3,PAL.F1);
        put(tx+1,ty+4,PAL.D);
        n++;
      }
    }
  }else if(t===T.GRASS){
    for(let i=0;i<5;i++){
      const tx=1+(rnd(i,4)*(TRIW-2))|0, ty=1+(rnd(i,5)*(TRIH-3))|0;
      if(!ins(tx,ty))continue;
      put(tx,ty,PAL.G3);put(tx-1,ty+1,PAL.G1);put(tx+1,ty+1,PAL.G1);
      if(rnd(i,6)<0.15)put(tx,ty-1,PAL.SN); // редкий цветок
    }
  }else if(t===T.ROCK){
    for(let i=0;i<3;i++){
      const tx=(rnd(i,7)*(TRIW-4))|0, ty=(rnd(i,8)*(TRIH-3))|0;
      if(!fits(tx,ty,4,3))continue;
      for(let k=0;k<4;k++)put(tx+k,ty,PAL.R3);
      for(let k=0;k<4;k++)put(tx+k,ty+1,k===0?PAL.R3:PAL.R2);
      for(let k=0;k<4;k++)put(tx+k,ty+2,PAL.R1);
    }
    for(let i=0;i<3;i++){ // трещины
      const tx=1+(rnd(i,9)*(TRIW-4))|0,ty=1+(rnd(i,10)*(TRIH-4))|0;
      put(tx,ty,PAL.R1);put(tx+1,ty+1,PAL.R1);put(tx+1,ty+2,PAL.R1);
    }
  }else if(t===T.MTN){
    for(let i=0;i<3;i++){ // диагональные гребни
      const tx=1+(rnd(i,11)*(TRIW-8))|0,ty=1+(rnd(i,12)*(TRIH-8))|0;
      for(let k=0;k<5;k++){put(tx+k,ty+k,PAL.M2);put(tx+k,ty+k+1,PAL.M1)}
    }
    if(rnd(0,13)<0.55){ // снежник (не на каждом тайле; только целиком в маске)
      const cx2=3+(rnd(1,13)*(TRIW-11))|0,cy2=2+(rnd(2,13)*(TRIH-8))|0;
      if(fits(cx2,cy2,8,5)){
        for(let oy=0;oy<5;oy++)for(let ox=0;ox<8;ox++){
          const d=Math.abs(ox-3.5)/4+Math.abs(oy-2)/2.5;
          if(d<1&&hash2(ox+cx2,oy+cy2,seed+31)<0.85)put(cx2+ox,cy2+oy,PAL.SN);
        }
      }
    }
  }else if(t===T.WATER){
    for(let i=0;i<4;i++){ // гребешки волн
      const tx=1+(rnd(i,14)*(TRIW-6))|0,ty=1+(rnd(i,15)*(TRIH-3))|0;
      const len=2+(rnd(i,16)*3|0);
      for(let k=0;k<len;k++)put(tx+k,ty,PAL.W3);
      put(tx-1,ty+1,PAL.W1);
    }
  }
}
function paintTriFull(ctx,x0,y0,t,orr,variant){
  const ins=triIns(orr);
  for(let y=0;y<TRIH;y++)for(let x=0;x<TRIW;x++){
    if(!ins(x,y))continue;
    ctx.fillStyle=terrPix(t,x+variant*97,y+variant*53,S?S.seed:7);
    ctx.fillRect(x0+x,y0+y,1,1);
  }
  decorTri(ctx,x0,y0,t,t*29+variant*7+(orr==='r'?3:0),ins);
}
function paintTriTransition(ctx,x0,y0,t,orr,bits){
  const c=[bits&1,(bits>>1)&1,(bits>>2)&1];
  const mask=new Uint8Array(TRIW*TRIH),insArr=new Uint8Array(TRIW*TRIH);
  const insT=triIns(orr);
  for(let y=0;y<TRIH;y++)for(let x=0;x<TRIW;x++){
    if(!insT(x,y))continue;
    insArr[y*TRIW+x]=1;
    const w=triBary(orr,x+0.5,y+0.5);
    let v=w[0]*c[0]+w[1]*c[1]+w[2]*c[2];
    v+=hash2(x+t*31,y+bits*7+(orr==='r'?191:0),911)*0.30-0.15;
    mask[y*TRIW+x]=v>0.5?1:0;
  }
  for(let y=0;y<TRIH;y++)for(let x=0;x<TRIW;x++){
    if(!mask[y*TRIW+x])continue;
    ctx.fillStyle=terrPix(t,x+bits*13,y+bits*29,S?S.seed:7);
    ctx.fillRect(x0+x,y0+y,1,1);
  }
  decorTri(ctx,x0,y0,t,t*57+bits*11+(orr==='r'?5:0),(x,y)=>!!mask[y*TRIW+x]);
  ctx.fillStyle=OUTL[t];
  for(let y=0;y<TRIH;y++)for(let x=0;x<TRIW;x++){
    if(!mask[y*TRIW+x])continue;
    let edge=false;
    if(x>0&&insArr[y*TRIW+x-1]&&!mask[y*TRIW+x-1])edge=true;
    if(x<TRIW-1&&insArr[y*TRIW+x+1]&&!mask[y*TRIW+x+1])edge=true;
    if(y>0&&insArr[(y-1)*TRIW+x]&&!mask[(y-1)*TRIW+x])edge=true;
    if(y<TRIH-1&&insArr[(y+1)*TRIW+x]&&!mask[(y+1)*TRIW+x])edge=true;
    if(edge)ctx.fillRect(x0+x,y0+y,1,1);
  }
}
function paintRoadHex(ctx,x,y,mask){
  // 6-битная маска мировых слотов N,S,NE,NW,SE,SW; спрайт 28x32 на клетку (flat-top).
  const c1=PAL.DI,c2='#7d5f40',c3='#5a4028';
  const ends=[[14,0],[14,32],[28,8],[0,8],[28,24],[0,24]];
  const lit=new Uint8Array(TRIW*TRIH);
  const put=(px2,py2)=>{if(px2>=0&&py2>=0&&px2<TRIW&&py2<TRIH)lit[py2*TRIW+px2]=1};
  const blob=(cx2,cy2)=>{for(let oy=-2;oy<=3;oy++)for(let ox=-2;ox<=3;ox++)put(cx2+ox,cy2+oy)};
  blob(13,15);
  for(let b=0;b<6;b++)if(mask&(1<<b)){
    const [ex,ey]=ends[b],steps=28;
    for(let i=0;i<=steps;i++){
      const t2=i/steps;
      blob(Math.round(13+(ex-14)*t2),Math.round(15+(ey-16)*t2));
    }
  }
  ctx.fillStyle=c1;
  for(let py2=0;py2<TRIH;py2++)for(let px2=0;px2<TRIW;px2++)
    if(lit[py2*TRIW+px2])ctx.fillRect(x+px2,y+py2,1,1);
  // тёмная кромка обочины (внутри тайла; края тайла не трогаем — стыки бесшовны)
  ctx.fillStyle=c3;
  for(let py2=0;py2<TRIH;py2++)for(let px2=0;px2<TRIW;px2++){
    if(!lit[py2*TRIW+px2])continue;
    let edge=false;
    if(px2>0&&!lit[py2*TRIW+px2-1])edge=true;
    if(px2<TRIW-1&&!lit[py2*TRIW+px2+1])edge=true;
    if(py2>0&&!lit[(py2-1)*TRIW+px2])edge=true;
    if(py2<TRIH-1&&!lit[(py2+1)*TRIW+px2])edge=true;
    if(edge)ctx.fillRect(x+px2,y+py2,1,1);
  }
  // камешки и выбоины
  for(let i=0;i<26;i++){
    const rx=hash2(i,mask,31)*TRIW|0,ry=hash2(mask,i,77)*TRIH|0;
    if(lit[ry*TRIW+rx]){ctx.fillStyle=(i%3)?c2:c3;ctx.fillRect(x+rx,y+ry,1,1)}
  }
}
/* ---------- РЕКИ (v3): русло по dual-треугольникам ----------
   Река входит через ребро треугольника, идёт через центр и выходит через
   другое ребро (границы гексов). mask — 3 бита сторон (0:c0-c1,1:c1-c2,2:c2-c0).
   tint — цвет берегов под террейн; w — класс ширины от потока (1..3, §6):
   русло ~5/7/9px; v — noise-вариант меандра (§8.4, noisy edges): изгиб живёт
   внутри тайла, концы пришиты к серединам рёбер — стыки тайлов сходятся всегда. */
function paintRiverTri(ctx,x0,y0,orr,mask,tint,w,v){
  if(w===undefined)w=1;
  if(v===undefined)v=0;
  const P=triCorners(orr);
  const C=[(P[0][0]+P[1][0]+P[2][0])/3,(P[0][1]+P[1][1]+P[2][1])/3];
  const mids=[0,1,2].map(k=>[(P[k][0]+P[(k+1)%3][0])/2,(P[k][1]+P[(k+1)%3][1])/2]);
  const ins=triIns(orr);
  const lit=new Uint8Array(TRIW*TRIH);
  const put=(px2,py2)=>{if(px2>=0&&py2>=0&&px2<TRIW&&py2<TRIH&&ins(px2,py2))lit[py2*TRIW+px2]=1};
  const rad=2+w; // taxicab-радиус: w1 ~5px, w2 ~7px, w3 ~9px
  const blob=(cx2,cy2)=>{const bx=Math.round(cx2),by=Math.round(cy2);
    const r=rad-1;
    for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){
      if(Math.abs(ox)+Math.abs(oy)>rad)continue; // скруглённое русло
      put(bx+ox,by+oy);
    }};
  blob(C[0],C[1]);
  for(let k=0;k<3;k++)if(mask&(1<<k)){
    const [ex,ey]=mids[k],steps=24;
    // перпендикулярный изгиб: 0 на концах, чтобы русла соседних тайлов сходились;
    // амплитуда зависит от noise-варианта, узкие реки петляют сильней
    const dx0=ex-C[0],dy0=ey-C[1],dl=Math.hypot(dx0,dy0)||1;
    const px3=-dy0/dl,py3=dx0/dl;
    const amp=(hash2(k+1+v*17,mask*3+(orr==='r'?1:0),771)*2-1)*(w===1?4.0:(w===2?2.6:1.6));
    for(let i=0;i<=steps;i++){
      const t2=i/steps;
      const off=Math.sin(t2*Math.PI)*amp;
      blob(C[0]+dx0*t2+px3*off,C[1]+dy0*t2+py3*off);
    }
  }
  // берега: пиксели рядом с водой, тон под террейн
  const bankC={};bankC[T.GRASS]=PAL.G1;bankC[T.FOREST]=PAL.F1;bankC[T.ROCK]=PAL.R1;bankC[T.MTN]=PAL.M1;
  ctx.fillStyle=bankC[tint]||PAL.G1;
  for(let py2=0;py2<TRIH;py2++)for(let px2=0;px2<TRIW;px2++){
    if(lit[py2*TRIW+px2]||!ins(px2,py2))continue;
    let near=false;
    for(const[ox,oy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const qx=px2+ox,qy=py2+oy;
      if(qx>=0&&qx<TRIW&&qy>=0&&qy<TRIH&&lit[qy*TRIW+qx])near=true;
    }
    if(near)ctx.fillRect(x0+px2,y0+py2,1,1);
  }
  // вода с бликами
  for(let py2=0;py2<TRIH;py2++)for(let px2=0;px2<TRIW;px2++){
    if(!lit[py2*TRIW+px2])continue;
    const h=hash2(px2+mask*7,py2+tint*13,313);
    ctx.fillStyle=h<0.10?PAL.W3:(h>0.92?PAL.W1:PAL.W2);
    ctx.fillRect(x0+px2,y0+py2,1,1);
  }
}
/* ---------- ГИПСОМЕТРИЧЕСКИЕ ПОЯСА (§5): stacked binary passes ----------
   Один и тот же марчинг масок по порогам E (1.5, 2.5, 3.5, 4.5) — меняется
   только материал: L2 дымка предгорий (дизеринг), L3/L4 склоны, L5 снежник.
   Кромка пояса L>=3 обведена — читается как crease-линия хребта. */
function paintReliefTri(ctx,x0,y0,orr,bits,L){
  const c=[bits&1,(bits>>1)&1,(bits>>2)&1];
  const mask=new Uint8Array(TRIW*TRIH),ins=new Uint8Array(TRIW*TRIH);
  for(let y=0;y<TRIH;y++)for(let x=0;x<TRIW;x++){
    const w=triBary(orr,x+0.5,y+0.5);
    if(w[0]<-0.045||w[1]<-0.045||w[2]<-0.045)continue;
    ins[y*TRIW+x]=1;
    let v=w[0]*c[0]+w[1]*c[1]+w[2]*c[2];
    if(bits!==7)v+=hash2(x+L*47,y+bits*7+(orr==='r'?191:0),913)*0.30-0.15;
    mask[y*TRIW+x]=v>0.5?1:0;
  }
  for(let y=0;y<TRIH;y++)for(let x=0;x<TRIW;x++){
    if(!mask[y*TRIW+x])continue;
    const h=hash2(x+L*31,y+bits*29,517);
    let col=null;
    if(L===2)col=h<0.34?(h<0.10?PAL.M1:PAL.R1):null;      // дымка предгорий
    else if(L===3)col=h<0.10?PAL.M2:PAL.M1;               // нижний склон
    else if(L===4)col=h<0.12?PAL.M3:PAL.M2;               // верхний склон
    else col=h<0.14?PAL.M3:PAL.SN;                        // снежник (E>=4.5)
    if(col){ctx.fillStyle=col;ctx.fillRect(x0+x,y0+y,1,1)}
  }
  if(L===3||L===4){ // диагональные гребни в стиле decorTri, тон по поясу
    const hi=(L===3)?PAL.M2:PAL.M3,lo=(L===3)?PAL.M1:PAL.M2;
    for(let i=0;i<3;i++){
      const tx=1+((hash2(i,L*7+bits,821)*(TRIW-8))|0),ty=1+((hash2(L,i*13+bits,823)*(TRIH-8))|0);
      for(let k=0;k<5;k++){
        if(mask[(ty+k)*TRIW+tx+k]){ctx.fillStyle=hi;ctx.fillRect(x0+tx+k,y0+ty+k,1,1)}
        if(ty+k+1<TRIH&&mask[(ty+k+1)*TRIW+tx+k]){ctx.fillStyle=lo;ctx.fillRect(x0+tx+k,y0+ty+k+1,1,1)}
      }
    }
  }
  if(L>=3){ // crease: тёмная кромка пояса
    ctx.fillStyle=L===5?PAL.M3:PAL.o;
    for(let y=0;y<TRIH;y++)for(let x=0;x<TRIW;x++){
      if(!mask[y*TRIW+x])continue;
      let edge=false;
      if(x>0&&ins[y*TRIW+x-1]&&!mask[y*TRIW+x-1])edge=true;
      if(x<TRIW-1&&ins[y*TRIW+x+1]&&!mask[y*TRIW+x+1])edge=true;
      if(y>0&&ins[(y-1)*TRIW+x]&&!mask[(y-1)*TRIW+x])edge=true;
      if(y<TRIH-1&&ins[(y+1)*TRIW+x]&&!mask[(y+1)*TRIW+x])edge=true;
      if(edge)ctx.fillRect(x0+x,y0+y,1,1);
    }
  }
}
/* ---------- БИОМ-ТИНТЫ (§8.3): дизеринг-оверлеи поверх лугов ---------- */
function paintBiomeTri(ctx,x0,y0,orr,bits,bio){
  const c=[bits&1,(bits>>1)&1,(bits>>2)&1];
  for(let y=0;y<TRIH;y++)for(let x=0;x<TRIW;x++){
    const w=triBary(orr,x+0.5,y+0.5);
    if(w[0]<-0.045||w[1]<-0.045||w[2]<-0.045)continue;
    let v=w[0]*c[0]+w[1]*c[1]+w[2]*c[2];
    if(bits!==7)v+=hash2(x+bio*53,y+bits*11+(orr==='r'?191:0),919)*0.30-0.15;
    if(v<=0.5)continue;
    const h=hash2(x+bio*13,y+bits*17,733);
    let col=null;
    if(bio===BIO.STEPPE)col=h<0.42?(h<0.14?PAL.St1:PAL.St2):null;     // сухостой
    else col=h<0.52?(h<0.16?PAL.W2:(h<0.34?PAL.Sw1:PAL.Sw2)):null;    // мокрая болотина
    if(col){ctx.fillStyle=col;ctx.fillRect(x0+x,y0+y,1,1)}
  }
}
function paintRiverMouth(ctx,x,y){ // устье: пена впадения (16x16, оверлей)
  for(let py=0;py<16;py++)for(let px=0;px<16;px++){
    const d=Math.hypot(px-7.5,py-7.5);
    if(d>7.6)continue;
    const h=hash2(px,py,881);
    if(h<0.45-d*0.03){ctx.fillStyle=h<0.18?PAL.SN:PAL.W3;ctx.fillRect(x+px,y+py,1,1)}
  }
}
function paintWaterfall(ctx,x,y){ // исток: белопенный сброс (20x24, оверлей)
  for(let py=0;py<17;py++){ // струи с рваным краем
    const wob=Math.round(hash2(0,py>>2,559)*2-1);
    const x0=7+wob,x1=13+wob;
    for(let px=x0;px<=x1;px++){
      const h=hash2(px,py,551);
      ctx.fillStyle=h<0.35?PAL.SN:(h<0.7?PAL.W3:PAL.W2);
      ctx.fillRect(x+px,y+py,1,1);
    }
  }
  for(let py=15;py<24;py++)for(let px=0;px<20;px++){ // пена у подножия
    const dx=(px-10)/9,dy=(py-19)/4.5;
    const d=dx*dx+dy*dy;
    if(d>1)continue;
    const h=hash2(px,py,553);
    if(h<0.8-d*0.6){ctx.fillStyle=h<0.32?PAL.SN:PAL.W3;ctx.fillRect(x+px,y+py,1,1)}
  }
}
function paintBridge(ctx,x,y,dx,dy){
  // Настил ВДОЛЬ оси дороги, пересекающей речное ребро. (dx,dy) — вектор оси
  // в пикселях тайла (y вниз): N-S (0,-1), NE-SW (7,-4), NW-SE (7,4) — те же
  // направления, что у слотов paintRoadHex. Доски поперёк хода, по бокам
  // тёмная кромка-перила; тайл 28×32 кладётся квадом CW×1 на середину ребра.
  const cx=14,cy=16;
  const L=Math.hypot(dx,dy);dx/=L;dy/=L;
  const nx=-dy,ny=dx; // поперёк хода
  const halfLen=10.5,halfW=4.5;
  for(let yy=0;yy<TRIH;yy++)for(let xx=0;xx<TRIW;xx++){
    const rx=xx+0.5-cx,ry=yy+0.5-cy;
    const u=rx*dx+ry*dy,v=rx*nx+ry*ny;
    const au=Math.abs(u),av=Math.abs(v);
    if(au>halfLen)continue;
    if(av<=halfW){ // полотно из досок
      const seam=(Math.floor(u+halfLen)%3===0);       // шов между досками
      const board=Math.floor(v+halfW)%4===1;          // блик доски
      ctx.fillStyle=seam?PAL.D:(av>halfW-1?PAL.Wd:(board?PAL.wh:PAL.w));
      ctx.fillRect(x+xx,y+yy,1,1);
    }else if(av<=halfW+1.3){ // кромка-перила с усиленными концами
      ctx.fillStyle=(au>halfLen-2)?PAL.Wd:PAL.o;
      ctx.fillRect(x+xx,y+yy,1,1);
    }
  }
}
function paintIcon(name){
  const cv=document.createElement('canvas');cv.width=12;cv.height=12;
  const c=cv.getContext('2d');
  const p=(x,y,col)=>{c.fillStyle=col;c.fillRect(x,y,1,1)};
  const r=(x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(x,y,w,h)};
  if(name==='gold'){r(3,2,6,8,PAL.y);r(2,3,8,6,PAL.y);r(4,4,2,2,'#fff2b0');r(5,3,4,1,'#fff2b0');r(4,9,5,1,'#a8842a')}
  if(name==='food'){r(5,2,2,8,PAL.G1);p(4,3,PAL.y);p(7,4,PAL.y);p(4,5,PAL.y);p(7,6,PAL.y);p(4,7,PAL.y);r(5,1,2,1,PAL.y)}
  if(name==='wood'){r(2,5,8,4,PAL.Wd);r(2,5,8,1,PAL.w);r(10,5,2,4,PAL.DI);p(10,6,PAL.w);p(11,7,PAL.w)}
  if(name==='stone'){r(3,5,6,5,PAL.R2);r(4,4,4,1,PAL.R3);r(3,9,6,1,PAL.R1);p(8,5,PAL.R3)}
  if(name==='gems'){p(5,2,PAL.GEM);p(6,2,PAL.GEM);r(4,3,5,2,PAL.GEM);r(5,5,3,2,'#3aa8a2');p(6,7,'#3aa8a2');p(6,8,'#2b807c')}
  if(name==='pop'){r(4,2,4,3,PAL.SK);r(3,5,6,4,PAL.Cb);p(4,9,PAL.D);p(7,9,PAL.D)}
  if(name==='ammo'){r(2,8,7,1,PAL.R3);r(8,7,1,3,PAL.R3);p(9,6,PAL.y);p(10,5,PAL.y);r(3,3,5,4,PAL.R1);r(4,2,3,1,PAL.R3);p(5,4,PAL.GEM)}
  return cv.toDataURL();
}
function buildAtlas(){
  const t0=performance.now();
  ATLAS={W:1024,H:2560,cur:{x:0,y:0,rowH:0}}; // 1024x2560: тайлы 28x32 + 486 PNG-юнитов 56x56 (~2310px)
  const cv=document.createElement('canvas');cv.width=ATLAS.W;cv.height=ATLAS.H;
  const ctx=cv.getContext('2d');ctx.imageSmoothingEnabled=false;
  ATLAS.cv=cv;ATLAS.ctx=ctx;SPR={};
  const place=(w,h)=>{
    if(ATLAS.cur.x+w>ATLAS.W){ATLAS.cur.x=0;ATLAS.cur.y+=ATLAS.cur.rowH;ATLAS.cur.rowH=0}
    const r={x:ATLAS.cur.x,y:ATLAS.cur.y};
    ATLAS.cur.x+=w;ATLAS.cur.rowH=Math.max(ATLAS.cur.rowH,h);
    return r;
  };
  // Drop I: dual-triangle террейн (flat-top: ◀/▶). Полные (2 варианта шума) + маски 1..6.
  for(const t of [T.WATER,T.GRASS,T.FOREST,T.ROCK,T.MTN]){
    for(const orr of ['l','r'])
      for(let v=0;v<2;v++){const p=place(TRIW,TRIH);paintTriFull(ctx,p.x,p.y,t,orr,v);reg('tri'+t+'_'+orr+'_full'+v,p.x,p.y,TRIW,TRIH)}
  }
  for(const t of [T.GRASS,T.FOREST,T.ROCK,T.MTN]){
    for(const orr of ['l','r'])
      for(let bits=1;bits<7;bits++){
        const p=place(TRIW,TRIH);paintTriTransition(ctx,p.x,p.y,t,orr,bits);reg('tri'+t+'_'+orr+'_'+bits,p.x,p.y,TRIW,TRIH);
      }
  }
  // units (16×16: на карте пол-гекса, в бою холст 16×16)
  for(const race of RACES){
    const g=UNIT_GRIDS[race],m=UNIT_MAPS[race];
    let p=place(16,16);drawGrid(ctx,p.x,p.y,g,m);
    vgradeRegion(ctx,p.x,p.y,16,16,0.20);outlineRegion(ctx,p.x,p.y,16,16);
    reg('u_'+race+'_0',p.x,p.y,16,16);
    p=place(16,16);drawGrid(ctx,p.x,p.y,bobFrame(g),m);
    vgradeRegion(ctx,p.x,p.y,16,16,0.20);outlineRegion(ctx,p.x,p.y,16,16);
    reg('u_'+race+'_1',p.x,p.y,16,16);
  }
  {const p2=place(16,16);drawGrid(ctx,p2.x,p2.y,G_RAIDER,RAIDER_MAP);
   vgradeRegion(ctx,p2.x,p2.y,16,16,0.20);outlineRegion(ctx,p2.x,p2.y,16,16);
   reg('u_raider_0',p2.x,p2.y,16,16);
   const p3=place(16,16);drawGrid(ctx,p3.x,p3.y,bobFrame(G_RAIDER),RAIDER_MAP);
   vgradeRegion(ctx,p3.x,p3.y,16,16,0.20);outlineRegion(ctx,p3.x,p3.y,16,16);
   reg('u_raider_1',p3.x,p3.y,16,16)}
  // мягкая круглая тень
  {const ps=place(16,16);const c2=ctx;
   c2.fillStyle='rgba(10,8,14,0.38)';
   c2.beginPath();c2.ellipse(ps.x+8,ps.y+8,5.2,2.4,0,0,Math.PI*2);c2.fill();
   c2.fillStyle='rgba(10,8,14,0.22)';
   c2.beginPath();c2.ellipse(ps.x+8,ps.y+8,6.6,3.1,0,0,Math.PI*2);c2.fill();
   reg('shadow',ps.x,ps.y,16,16)}
  // здания/логовища/фичи: детальные гриды 32px
  const GRIDS=[
    ['b_hut',G_HUT,G_HUT_MAP],['b_house2',G_HOUSE2,G_HOUSE2_MAP],
    ['b_tent',G_TENT,G_TENT_MAP],['b_fisher',G_FISHER,G_FISHER_MAP],
    ['b_lumber',G_LUMBER,G_LUMBER_MAP],['b_tavern',G_TAVERN,G_TAVERN_MAP],
    ['b_farm',G_FARM,G_FARM_MAP],['b_mine',G_MINE,G_MINE_MAP],
    ['b_site',G_SITE,G_SITE_MAP],['b_townhall',G_TOWNHALL,G_TOWNHALL_MAP],
    ['b_tower',G_WATCHTOWER,G_WATCHTOWER_MAP],['b_port',G_PORT,G_PORT_MAP],
    ['b_guild',G_GUILD,G_GUILD_MAP],['b_advguild',G_ADVGUILD,G_ADVGUILD_MAP],
    ['b_crafters',G_CRAFTERS,G_CRAFTERS_MAP],['b_library',G_LIBRARY,G_LIBRARY_MAP],
    ['b_knowledge',G_KNOWLEDGE,G_KNOWLEDGE_MAP],
    ['l_tower',L_TOWER,L_TOWER_MAP],['l_necro',L_NECRO,L_NECRO_MAP],
    ['l_camp',L_CAMP,L_CAMP_MAP],['l_den',L_DEN,L_DEN_MAP],
    ['l_cliff',L_CLIFF,L_CLIFF_MAP],['l_graves',L_GRAVES,L_GRAVES_MAP],
    ['f_1',F_BERRY,F_BERRY_MAP],['f_2',F_DEADFALL,F_DEADFALL_MAP],
    ['f_3',F_RUBBLE,F_RUBBLE_MAP],['f_4',F_VEIN,F_VEIN_MAP],
    ['f_5',F_FISH,F_FISH_MAP],['f_6',F_RUINS,F_RUINS_MAP],
    ['f_7',F_WHEAT,F_WHEAT_MAP],['f_8',F_STUMP,F_STUMP_MAP],
    ['stake',G_STAKE,G_STAKE_MAP],['pennant',G_PENNANT,G_PENNANT_MAP],
    ['fx_0',G_SMOKE0,G_SMOKE0_MAP],['fx_1',G_SMOKE1,G_SMOKE1_MAP],
    ['fxh_0',G_HAMMER0,G_HAMMER0_MAP],['fxh_1',G_HAMMER1,G_HAMMER1_MAP]
  ];
  for(const [k,g,m] of GRIDS){
    const w=g[0].length,h=g.length;
    const p=place(w,h);drawGrid(ctx,p.x,p.y,g,m);reg(k,p.x,p.y,w,h);
  }
  // корабль: целый и «затухающий» (дизеринг для дальнего рейса)
  {let p=place(20,20);drawGrid(ctx,p.x,p.y,G_SHIP,G_SHIP_MAP);reg('ship0',p.x,p.y,20,20);
   p=place(20,20);drawGrid(ctx,p.x,p.y,G_SHIP,G_SHIP_MAP,(x,y)=>((x+y)&1)===1);reg('ship1',p.x,p.y,20,20)}
  // пепелище (оверлей руин; разреженный — силуэт здания должен угадываться)
  {const p=place(32,32);
   for(let yy=0;yy<32;yy++)for(let xx=0;xx<32;xx++){
     const h=hash2(xx,yy,404);
     if(h<0.42){ctx.fillStyle=(h<0.10)?'#000000':PAL.o;ctx.fillRect(p.x+xx,p.y+yy,1,1)}
   }
   reg('ash',p.x,p.y,32,32)}
  for(let m=0;m<64;m++){const p=place(TRIW,TRIH);paintRoadHex(ctx,p.x,p.y,m);reg('road_'+m,p.x,p.y,TRIW,TRIH)}
  // реки v3: тинт берегов x маска x ширина потока (w1..3) x noise-вариант меандра
  for(const t of [T.GRASS,T.FOREST,T.ROCK,T.MTN])
    for(const orr of ['l','r'])
      for(let m=1;m<8;m++)
        for(let w=1;w<=3;w++)
          for(let v=0;v<2;v++){
            const p=place(TRIW,TRIH);paintRiverTri(ctx,p.x,p.y,orr,m,t,w,v);
            reg('rt_'+t+'_'+orr+'_'+m+'_w'+w+'_v'+v,p.x,p.y,TRIW,TRIH);
          }
  // гипсометрические пояса рельефа (L2..L5) и биом-тинты (степь/болотина)
  for(const L of [2,3,4,5])
    for(const orr of ['l','r'])
      for(let bits=1;bits<8;bits++){
        const p=place(TRIW,TRIH);paintReliefTri(ctx,p.x,p.y,orr,bits,L);
        reg('rl'+L+'_'+orr+'_'+bits,p.x,p.y,TRIW,TRIH);
      }
  for(const bio of [BIO.STEPPE,BIO.SWAMP])
    for(const orr of ['l','r'])
      for(let bits=1;bits<8;bits++){
        const p=place(TRIW,TRIH);paintBiomeTri(ctx,p.x,p.y,orr,bits,bio);
        reg('bio'+bio+'_'+orr+'_'+bits,p.x,p.y,TRIW,TRIH);
      }
  {let p=place(16,16);paintRiverMouth(ctx,p.x,p.y);reg('r_mouth',p.x,p.y,16,16);
   p=place(20,24);paintWaterfall(ctx,p.x,p.y);reg('r_falls',p.x,p.y,20,24);
   // мосты по осям дорог: вертикаль N-S и две диагонали (подъём/спуск вправо)
   p=place(TRIW,TRIH);paintBridge(ctx,p.x,p.y,0,-1);reg('bridge_v',p.x,p.y,TRIW,TRIH);
   p=place(TRIW,TRIH);paintBridge(ctx,p.x,p.y,7,-4);reg('bridge_ne',p.x,p.y,TRIW,TRIH);
   p=place(TRIW,TRIH);paintBridge(ctx,p.x,p.y,7,4);reg('bridge_se',p.x,p.y,TRIW,TRIH)}
  for(const k of ['b_hut','b_house2','b_tent','b_fisher','b_lumber','b_tavern','b_farm','b_mine','b_townhall','b_tower','b_port','b_guild','b_advguild','b_crafters','b_library','b_knowledge']){
    const sp=SPR[k];if(sp)outlineRegion(ctx,sp.x,sp.y,sp.w,sp.h);
  }
  // PNG-юниты PixelLab (56x56, арт 32px): idle/walk/work x 6 гекс-сторон.
  // ASCII-гриды u_* выше остаются как фолбэк (headless/фейл декода).
  if(UNIT_IMGS)for(const key in UNIT_IMGS){
    const im=UNIT_IMGS[key];
    const p2=place(im.width,im.height);
    ctx.drawImage(im,p2.x,p2.y);
    reg('up_'+key,p2.x,p2.y,im.width,im.height);
  }
  ICONS={gold:paintIcon('gold'),food:paintIcon('food'),wood:paintIcon('wood'),
    stone:paintIcon('stone'),gems:paintIcon('gems'),pop:paintIcon('pop'),ammo:paintIcon('ammo')};
  if(ATLAS.cur.y+ATLAS.cur.rowH>ATLAS.H)console.warn('[Марка] АТЛАС ПЕРЕПОЛНЕН:',ATLAS.cur.y+ATLAS.cur.rowH,'>',ATLAS.H);
  S.atlasMs=performance.now()-t0;
}
