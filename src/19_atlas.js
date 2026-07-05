/* ================= ATLAS (browser only) ================= */
let ATLAS=null,SPR={},ICONS={};
/* ---------- PNG-тайлсет (docs/tileset-pipeline.md) ----------
   TILESET_PNG/TILESET_MAP инжектит build.mjs из assets/. Слоты с
   непустой альфой замещают процедурные спрайты (террейн ×4 = 56×64),
   пустые/отсутствующие — фолбэк на процедурную отрисовку: атлас можно
   перерисовывать по кусочку. Реки в тайлсете без подкраски берегов:
   один слот rt_<orr>_<m> регистрируется для всех тинтов. */
let TS=null,TS_IDX=null,TS_TRIED=false;
function loadTileset(cb){
  if(TS_TRIED||typeof TILESET_PNG==='undefined'||!TILESET_PNG){TS_TRIED=true;cb();return}
  const im=new Image();
  im.onload=()=>{
    const cv=document.createElement('canvas');cv.width=im.width;cv.height=im.height;
    const ctx=cv.getContext('2d');ctx.drawImage(im,0,0);
    TS=cv;TS_IDX={};
    // v1: слоты в корне; v2 (контекстный шаблон): раскладка готового листа в out
    const slots=TILESET_MAP.slots||(TILESET_MAP.out&&TILESET_MAP.out.slots)||[];
    for(const sl of slots){
      // слот «занят», если в нём есть непрозрачные пиксели
      const d=ctx.getImageData(sl.x,sl.y,sl.w,sl.h).data;
      let used=false;
      for(let i=3;i<d.length;i+=4)if(d[i]>10){used=true;break}
      if(used)TS_IDX[sl.name]=sl;
    }
    TS_TRIED=true;cb();
  };
  im.onerror=()=>{console.warn('tileset.png не загрузился — процедурные спрайты');TS_TRIED=true;cb()};
  im.src=TILESET_PNG;
}
// рисует слот тайлсета в атлас; null = слота нет (рисуй процедурно)
function tsPlace(name,place,ctx){
  const sl=TS_IDX&&TS_IDX[name];
  if(!sl)return null;
  const p=place(sl.w,sl.h);
  ctx.drawImage(TS,sl.x,sl.y,sl.w,sl.h,p.x,p.y,sl.w,sl.h);
  return {x:p.x,y:p.y,w:sl.w,h:sl.h};
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
function drawGrid(ctx,gx,gy,rows,map){
  for(let y=0;y<rows.length;y++){const row=rows[y];
    for(let x=0;x<row.length;x++){const ch=row[x];
      if(ch==='.')continue;
      const col=map[ch]||'#f0f';
      ctx.fillStyle=col;ctx.fillRect(gx+x,gy+y,1,1);
    }
  }
}
/* --- Drop I v1.2: flat-top. Dual-triangle тайлы 14x16, ориентации 'r' ▶ / 'l' ◀.
   Колонки odd-q со сдвигом вниз, шаг CW=14/16; у хекса две ГОРИЗОНТАЛЬНЫЕ грани.
   Барицентрическая интерполяция трёх угловых бит; седловых неоднозначностей нет. --- */
const TRIW=14,TRIH=16;
function triBary(orr,pxx,pyy){
  // 'r' ▶: углы [TL, BL, апекс-право]; 'l' ◀: [TR, BR, апекс-лево]
  const P=(orr==='r')?[[0,0],[0,16],[14,8]]:[[14,0],[14,16],[0,8]];
  const [a,b,c]=P;
  const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  const w0=((b[1]-c[1])*(pxx-c[0])+(c[0]-b[0])*(pyy-c[1]))/den;
  const w1=((c[1]-a[1])*(pxx-c[0])+(a[0]-c[0])*(pyy-c[1]))/den;
  return [w0,w1,1-w0-w1];
}
function paintTriFull(ctx,x0,y0,t,orr,variant){
  for(let y=0;y<TRIH;y++)for(let x=0;x<TRIW;x++){
    const w=triBary(orr,x+0.5,y+0.5);
    if(w[0]<-0.045||w[1]<-0.045||w[2]<-0.045)continue;
    ctx.fillStyle=terrPix(t,x+variant*97,y+variant*53,S?S.seed:7);
    ctx.fillRect(x0+x,y0+y,1,1);
  }
}
function paintTriTransition(ctx,x0,y0,t,orr,bits){
  const c=[bits&1,(bits>>1)&1,(bits>>2)&1];
  const mask=new Uint8Array(TRIW*TRIH),ins=new Uint8Array(TRIW*TRIH);
  for(let y=0;y<TRIH;y++)for(let x=0;x<TRIW;x++){
    const w=triBary(orr,x+0.5,y+0.5);
    if(w[0]<-0.045||w[1]<-0.045||w[2]<-0.045)continue;
    ins[y*TRIW+x]=1;
    let v=w[0]*c[0]+w[1]*c[1]+w[2]*c[2];
    v+=hash2(x+t*31,y+bits*7+(orr==='r'?191:0),911)*0.30-0.15;
    mask[y*TRIW+x]=v>0.5?1:0;
  }
  for(let y=0;y<TRIH;y++)for(let x=0;x<TRIW;x++){
    if(!mask[y*TRIW+x])continue;
    ctx.fillStyle=terrPix(t,x+bits*13,y+bits*29,S?S.seed:7);
    ctx.fillRect(x0+x,y0+y,1,1);
  }
  ctx.fillStyle=OUTL[t];
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
function paintRoadHex(ctx,x,y,mask){
  // 6-битная маска мировых слотов N,S,NE,NW,SE,SW; спрайт 14x16 на клетку (flat-top).
  const c1=PAL.DI,c2='#7d5f40';
  const ends=[[7,0],[7,16],[14,4],[0,4],[14,12],[0,12]];
  const lit=new Uint8Array(14*16);
  const put=(px2,py2)=>{if(px2>=0&&py2>=0&&px2<14&&py2<16)lit[py2*14+px2]=1};
  const blob=(cx2,cy2)=>{for(let oy=-1;oy<=2;oy++)for(let ox=-1;ox<=2;ox++)put(cx2+ox,cy2+oy)};
  blob(6,7);
  for(let b=0;b<6;b++)if(mask&(1<<b)){
    const [ex,ey]=ends[b],steps=14;
    for(let i=0;i<=steps;i++){
      const t2=i/steps;
      blob(Math.round(6+(ex-7)*t2),Math.round(7+(ey-8)*t2));
    }
  }
  ctx.fillStyle=c1;
  for(let py2=0;py2<16;py2++)for(let px2=0;px2<14;px2++)
    if(lit[py2*14+px2])ctx.fillRect(x+px2,y+py2,1,1);
  ctx.fillStyle=c2;
  for(let i=0;i<10;i++){
    const rx=hash2(i,mask,31)*14|0,ry=hash2(mask,i,77)*16|0;
    if(lit[ry*14+rx])ctx.fillRect(x+rx,y+ry,1,1);
  }
}
/* ---------- РЕКИ (п.1, v2): русло по dual-треугольникам ----------
   Река входит через ребро треугольника, идёт через центр и выходит через
   другое ребро (границы гексов). mask — 3 бита сторон (0:c0-c1,1:c1-c2,2:c2-c0).
   tint — цвет берегов под террейн (луга/лес/скалы/горы). */
function paintRiverTri(ctx,x0,y0,orr,mask,tint){
  const P=(orr==='r')?[[0,0],[0,16],[14,8]]:[[14,0],[14,16],[0,8]];
  const C=[(P[0][0]+P[1][0]+P[2][0])/3,(P[0][1]+P[1][1]+P[2][1])/3];
  const mids=[0,1,2].map(k=>[(P[k][0]+P[(k+1)%3][0])/2,(P[k][1]+P[(k+1)%3][1])/2]);
  const ins=(px2,py2)=>{const w=triBary(orr,px2+0.5,py2+0.5);
    return w[0]>=-0.045&&w[1]>=-0.045&&w[2]>=-0.045};
  const lit=new Uint8Array(14*16);
  const put=(px2,py2)=>{if(px2>=0&&py2>=0&&px2<14&&py2<16&&ins(px2,py2))lit[py2*14+px2]=1};
  const blob=(cx2,cy2)=>{const bx=Math.round(cx2),by=Math.round(cy2);
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++)put(bx+ox,by+oy)};
  blob(C[0],C[1]);
  for(let k=0;k<3;k++)if(mask&(1<<k)){
    const [ex,ey]=mids[k],steps=12;
    // перпендикулярный изгиб: 0 на концах, чтобы русла соседних тайлов сходились
    const dx0=ex-C[0],dy0=ey-C[1],dl=Math.hypot(dx0,dy0)||1;
    const px3=-dy0/dl,py3=dx0/dl;
    const amp=(hash2(k+1,mask*3+(orr==='r'?1:0),771)*2-1)*2.0;
    for(let i=0;i<=steps;i++){
      const t2=i/steps;
      const off=Math.sin(t2*Math.PI)*amp;
      blob(C[0]+dx0*t2+px3*off,C[1]+dy0*t2+py3*off);
    }
  }
  // берега: пиксели рядом с водой, тон под террейн
  const bankC={};bankC[T.GRASS]=PAL.G1;bankC[T.FOREST]=PAL.F1;bankC[T.ROCK]=PAL.R1;bankC[T.MTN]=PAL.M1;
  bankC[T.SAND]=PAL.SA1;bankC[T.SWAMP]=PAL.SW1;bankC[T.SCRUB]=PAL.SC1;
  ctx.fillStyle=bankC[tint]||PAL.G1;
  for(let py2=0;py2<16;py2++)for(let px2=0;px2<14;px2++){
    if(lit[py2*14+px2]||!ins(px2,py2))continue;
    let near=false;
    for(const[ox,oy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const qx=px2+ox,qy=py2+oy;
      if(qx>=0&&qx<14&&qy>=0&&qy<16&&lit[qy*14+qx])near=true;
    }
    if(near)ctx.fillRect(x0+px2,y0+py2,1,1);
  }
  // вода с бликами
  for(let py2=0;py2<16;py2++)for(let px2=0;px2<14;px2++){
    if(!lit[py2*14+px2])continue;
    const h=hash2(px2+mask*7,py2+tint*13,313);
    ctx.fillStyle=h<0.12?PAL.W3:(h>0.9?PAL.W1:PAL.W2);
    ctx.fillRect(x0+px2,y0+py2,1,1);
  }
}
function paintRiverMouth(ctx,x,y){ // устье: пена впадения (8x8, оверлей)
  for(let py=0;py<8;py++)for(let px=0;px<8;px++){
    const d=Math.hypot(px-3.5,py-3.5);
    if(d>3.8)continue;
    const h=hash2(px,py,881);
    if(h<0.45){ctx.fillStyle=h<0.2?PAL.SN:PAL.W3;ctx.fillRect(x+px,y+py,1,1)}
  }
}
function paintWaterfall(ctx,x,y){ // исток: белопенный сброс (10x12, оверлей)
  for(let py=0;py<8;py++)for(let px=2;px<8;px++){
    const h=hash2(px,py,551);
    ctx.fillStyle=h<0.3?PAL.SN:(h<0.65?PAL.W3:PAL.W2);
    ctx.fillRect(x+px,y+py,1,1);
  }
  for(let px=0;px<10;px++){
    if(hash2(px,9,552)<0.7){ctx.fillStyle=PAL.SN;ctx.fillRect(x+px,y+8,1,1)}
    if(hash2(px,10,553)<0.45){ctx.fillStyle=PAL.W3;ctx.fillRect(x+px,y+9,1,1)}
  }
}
function paintBridge(ctx,x,y){
  // деревянный настил через русло; дорога рисуется поверх
  for(let py=5;py<11;py++)for(let px=0;px<14;px++){
    ctx.fillStyle=((px+ (py&1)*2)%4===0)?PAL.D:PAL.Wd;
    ctx.fillRect(x+px,y+py,1,1);
  }
  ctx.fillStyle=PAL.o;
  for(let px=0;px<14;px++){ctx.fillRect(x+px,y+4,1,1);ctx.fillRect(x+px,y+11,1,1)}
}
function paintFull(ctx,x0,y0,t,variant){
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    ctx.fillStyle=terrPix(t,x+variant*97,y+variant*53,S?S.seed:7);
    ctx.fillRect(x0+x,y0+y,1,1);
  }
}
function px(ctx,ox,oy,x,y,c){ctx.fillStyle=c;ctx.fillRect(ox+x,oy+y,1,1)}
function rect(ctx,ox,oy,x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(ox+x,oy+y,w,h)}
function paintBerry(ctx,x,y){
  rect(ctx,x,y,4,8,8,5,PAL.F2);rect(ctx,x,y,5,7,6,1,PAL.F3);rect(ctx,x,y,5,13,6,1,PAL.F1);
  px(ctx,x,y,6,9,PAL.BER);px(ctx,x,y,9,10,PAL.BER);px(ctx,x,y,7,11,PAL.BER);px(ctx,x,y,10,8,PAL.BER);
}
function paintDeadfall(ctx,x,y){
  rect(ctx,x,y,2,9,12,2,PAL.Wd);rect(ctx,x,y,2,8,12,1,PAL.w);
  rect(ctx,x,y,4,5,2,8,PAL.DI);rect(ctx,x,y,9,4,2,9,PAL.Wd);
  px(ctx,x,y,1,9,PAL.o);px(ctx,x,y,14,10,PAL.o);
}
function paintRubble(ctx,x,y){
  rect(ctx,x,y,3,9,5,4,PAL.R2);rect(ctx,x,y,3,9,5,1,PAL.R3);
  rect(ctx,x,y,9,10,4,3,PAL.R1);rect(ctx,x,y,6,6,3,3,PAL.R2);
}
function paintVein(ctx,x,y){
  px(ctx,x,y,4,4,PAL.GEM);px(ctx,x,y,5,5,PAL.GEM);
  px(ctx,x,y,10,7,PAL.GEM);px(ctx,x,y,11,6,PAL.GEM);
  px(ctx,x,y,6,11,PAL.GEM);px(ctx,x,y,7,12,PAL.GEM);
  px(ctx,x,y,12,12,PAL.GEM);px(ctx,x,y,3,9,PAL.GEM);
}
function paintFish(ctx,x,y){
  rect(ctx,x,y,3,6,5,1,PAL.W3);rect(ctx,x,y,8,9,5,1,PAL.W3);
  px(ctx,x,y,6,11,PAL.SN);px(ctx,x,y,7,12,PAL.SN);px(ctx,x,y,8,11,PAL.SN);
}
function paintRuins(ctx,x,y){
  rect(ctx,x,y,3,6,3,8,PAL.R3);rect(ctx,x,y,3,6,3,1,PAL.SN);
  rect(ctx,x,y,10,9,3,5,PAL.R2);rect(ctx,x,y,7,13,6,1,PAL.R1);
  px(ctx,x,y,11,8,PAL.R3);
}
function paintSite(ctx,x,y){
  rect(ctx,x,y,1,1,3,4,PAL.Wd);rect(ctx,x,y,12,1,3,4,PAL.Wd);
  rect(ctx,x,y,1,11,3,4,PAL.Wd);rect(ctx,x,y,12,11,3,4,PAL.Wd);
  rect(ctx,x,y,1,1,3,1,PAL.w);rect(ctx,x,y,12,1,3,1,PAL.w);
  for(let i=0;i<12;i++){px(ctx,x,y,2+i,13-i,PAL.y);px(ctx,x,y,2+i,14-i,PAL.w)}
  rect(ctx,x,y,4,6,8,3,PAL.DI);rect(ctx,x,y,4,6,8,1,'#7d5f40');
}
function paintFarm(ctx,x,y){
  for(let ry=4;ry<14;ry++){
    const c=(ry%2===0)?PAL.DI:'#5a4028';
    rect(ctx,x,y,2,ry,12,1,c);
  }
  for(let i=0;i<8;i++){
    const sx=3+((i*3)%11),sy=5+((i*5)%8);
    px(ctx,x,y,sx,sy,PAL.G3);
  }
  rect(ctx,x,y,2,3,12,1,PAL.w);
}
function paintMine(ctx,x,y){
  rect(ctx,x,y,2,6,12,9,PAL.R2);rect(ctx,x,y,3,5,10,1,PAL.R3);
  rect(ctx,x,y,4,4,8,1,PAL.R3);
  rect(ctx,x,y,6,8,4,7,PAL.k);
  rect(ctx,x,y,5,7,6,1,PAL.Wd);
  rect(ctx,x,y,5,8,1,7,PAL.Wd);rect(ctx,x,y,10,8,1,7,PAL.Wd);
}
function paintCamp(ctx,x,y){
  for(let i=0;i<5;i++){rect(ctx,x,y,3+i,10-i,1,i+1,PAL.DI);rect(ctx,x,y,8-i,10-i,1,i+1,PAL.Wd)}
  for(let i=0;i<4;i++){rect(ctx,x,y,9+i,12-i,1,i+1,PAL.Cr);rect(ctx,x,y,14-i,12-i,1,i+1,PAL.R)}
  px(ctx,x,y,5,12,PAL.y);px(ctx,x,y,6,13,PAL.r);px(ctx,x,y,5,13,PAL.r);
}
function paintDen(ctx,x,y){
  // звериное логово (п.11): тёмная нора под корягой, кости у входа
  rect(ctx,x,y,3,8,10,6,PAL.DI);rect(ctx,x,y,4,9,8,4,PAL.k);
  rect(ctx,x,y,2,7,12,1,PAL.Wd);px(ctx,x,y,2,6,PAL.Wd);px(ctx,x,y,13,6,PAL.Wd);
  px(ctx,x,y,5,13,PAL.SN);px(ctx,x,y,6,14,PAL.SN);px(ctx,x,y,10,13,PAL.SN);
  px(ctx,x,y,11,14,PAL.SN);px(ctx,x,y,8,14,PAL.SN);
}
function paintCliff(ctx,x,y){
  rect(ctx,x,y,3,7,10,8,PAL.R1);rect(ctx,x,y,4,6,8,1,PAL.R2);
  rect(ctx,x,y,5,5,5,1,PAL.R2);rect(ctx,x,y,6,9,2,2,PAL.k);
  rect(ctx,x,y,11,2,1,5,PAL.Wd);rect(ctx,x,y,12,2,3,2,PAL.Cr);
}
function paintGraves(ctx,x,y){
  rect(ctx,x,y,2,10,12,5,PAL.F1);
  const cross=(cx,cy)=>{rect(ctx,x,y,cx,cy,1,4,PAL.R3);rect(ctx,x,y,cx-1,cy+1,3,1,PAL.R3)};
  cross(4,7);cross(8,6);cross(12,8);
}
function paintFisher(ctx,x,y){
  rect(ctx,x,y,2,10,12,2,PAL.w);rect(ctx,x,y,2,12,12,1,PAL.Wd);
  rect(ctx,x,y,3,13,1,3,PAL.Wd);rect(ctx,x,y,12,13,1,3,PAL.Wd);rect(ctx,x,y,7,13,1,3,PAL.Wd);
  rect(ctx,x,y,4,4,7,6,PAL.w);
  rect(ctx,x,y,3,3,9,2,PAL.Cb);rect(ctx,x,y,4,2,7,1,PAL.Cb);rect(ctx,x,y,3,5,9,1,PAL.W1);
  rect(ctx,x,y,6,6,2,4,PAL.D);
  rect(ctx,x,y,13,8,1,4,PAL.Wd);px(ctx,x,y,13,7,PAL.r);
}
function paintLumber(ctx,x,y){
  rect(ctx,x,y,2,3,12,1,PAL.w);rect(ctx,x,y,2,4,12,2,PAL.Wd);
  rect(ctx,x,y,2,6,1,7,PAL.Wd);rect(ctx,x,y,13,6,1,7,PAL.Wd);
  rect(ctx,x,y,4,11,8,2,PAL.w);rect(ctx,x,y,5,9,6,2,PAL.Wd);rect(ctx,x,y,6,7,4,2,PAL.w);
  px(ctx,x,y,4,11,PAL.DI);px(ctx,x,y,11,11,PAL.DI);px(ctx,x,y,5,9,PAL.DI);px(ctx,x,y,10,9,PAL.DI);
  rect(ctx,x,y,3,13,10,1,PAL.o);
}
function paintPort(ctx,x,y){
  rect(ctx,x,y,1,9,14,2,PAL.w);rect(ctx,x,y,1,11,14,1,PAL.Wd);
  rect(ctx,x,y,2,12,1,4,PAL.Wd);rect(ctx,x,y,13,12,1,4,PAL.Wd);rect(ctx,x,y,7,12,1,4,PAL.Wd);
  rect(ctx,x,y,2,3,8,6,PAL.w);rect(ctx,x,y,1,2,10,2,PAL.Cb);rect(ctx,x,y,2,1,8,1,PAL.Cb);
  rect(ctx,x,y,4,5,2,4,PAL.D);
  rect(ctx,x,y,11,4,1,5,PAL.Wd);rect(ctx,x,y,12,5,3,1,PAL.Wd);px(ctx,x,y,14,6,PAL.y);
  rect(ctx,x,y,11,10,2,2,PAL.R);px(ctx,x,y,13,10,PAL.R);
}
function paintGuild(ctx,x,y){
  rect(ctx,x,y,2,4,12,10,PAL.R2);rect(ctx,x,y,2,4,12,1,PAL.R3);
  rect(ctx,x,y,1,3,14,1,PAL.R);rect(ctx,x,y,2,2,12,1,PAL.R);
  rect(ctx,x,y,6,8,4,6,PAL.k);rect(ctx,x,y,5,7,6,1,PAL.Wd);
  rect(ctx,x,y,3,5,2,2,PAL.y);rect(ctx,x,y,11,5,2,2,PAL.y);
  rect(ctx,x,y,2,14,12,1,PAL.R1);
}
function paintAdvGuild(ctx,x,y){
  rect(ctx,x,y,2,5,12,9,PAL.w);rect(ctx,x,y,2,5,12,1,PAL.Wd);
  rect(ctx,x,y,1,4,14,1,PAL.R);rect(ctx,x,y,2,3,12,1,PAL.R);rect(ctx,x,y,3,2,10,1,PAL.r);
  rect(ctx,x,y,6,9,4,5,PAL.k);rect(ctx,x,y,5,8,6,1,PAL.Wd);
  rect(ctx,x,y,3,6,2,3,PAL.Cr);px(ctx,x,y,3,6,PAL.y);px(ctx,x,y,4,7,PAL.y);
  rect(ctx,x,y,11,6,1,3,PAL.R3);px(ctx,x,y,11,5,PAL.R3);px(ctx,x,y,12,6,PAL.Wd);
  rect(ctx,x,y,2,14,12,1,PAL.Wd);
}
function paintShip(ctx,x,y,fade){
  const put=(px2,py2,c)=>{if(fade&&((px2+py2)&1))return;ctx.fillStyle=c;ctx.fillRect(x+px2,y+py2,1,1)};
  for(let i=0;i<10;i++)put(3+i,11,PAL.Wd);
  for(let i=0;i<8;i++)put(4+i,12,PAL.D);
  for(let i=0;i<6;i++)put(5+i,13,PAL.o);
  for(let yy=3;yy<=9;yy++)for(let xx=0;xx<Math.min(6,yy-1);xx++)put(7+xx,yy,PAL.SN);
  put(7,2,PAL.y);
  for(let yy=2;yy<=11;yy++)put(6,yy,PAL.Wd);
}
function paintCrafters(ctx,x,y){
  rect(ctx,x,y,2,6,12,8,PAL.R1);rect(ctx,x,y,2,6,12,1,PAL.w);
  rect(ctx,x,y,1,4,14,2,PAL.R3);rect(ctx,x,y,3,3,10,1,PAL.R3);
  rect(ctx,x,y,6,9,4,5,PAL.k);
  rect(ctx,x,y,3,8,2,2,PAL.y);rect(ctx,x,y,11,8,2,2,PAL.y);
  rect(ctx,x,y,12,1,2,3,PAL.D);px(ctx,x,y,12,0,PAL.Cb);
  px(ctx,x,y,7,12,'#ff9a3d');px(ctx,x,y,8,12,'#ffd23d');
  rect(ctx,x,y,2,14,12,1,PAL.o);
}
function paintStake(ctx,x,y){
  rect(ctx,x,y,7,6,1,7,PAL.Wd);
  rect(ctx,x,y,8,6,3,2,PAL.Cr);
  px(ctx,x,y,7,13,PAL.o);
}
function paintPennant(ctx,x,y){
  rect(ctx,x,y,3,1,1,6,PAL.Wd);
  rect(ctx,x,y,4,1,3,2,PAL.y);px(ctx,x,y,4,3,PAL.y);
}
function paintHammer(ctx,x,y,f){
  if(f===0){rect(ctx,x,y,2,3,3,2,PAL.R3);rect(ctx,x,y,4,5,2,3,PAL.Wd)}
  else{rect(ctx,x,y,4,2,2,3,PAL.R3);rect(ctx,x,y,3,5,2,3,PAL.Wd)}
  px(ctx,x,y,6,7,PAL.y);
}
function paintSmoke(ctx,x,y,f){
  const c1=PAL.SN,c2=PAL.R3;
  if(f===0){px(ctx,x,y,3,6,c2);px(ctx,x,y,4,5,c1);px(ctx,x,y,3,4,c1);px(ctx,x,y,4,3,c2);px(ctx,x,y,5,2,c1);px(ctx,x,y,4,1,c2)}
  else{px(ctx,x,y,4,6,c2);px(ctx,x,y,3,5,c1);px(ctx,x,y,4,4,c1);px(ctx,x,y,3,3,c2);px(ctx,x,y,4,2,c1);px(ctx,x,y,5,1,c2)}
}
function paintWheat(ctx,x,y){
  for(let i=0;i<6;i++){
    const sx=3+((i*2)%10),h=4+(i%3);
    rect(ctx,x,y,sx,12-h,1,h,PAL.y);
    px(ctx,x,y,sx,11-h,'#f4e08a');
  }
  rect(ctx,x,y,2,12,12,1,PAL.G1);
}
function paintStump(ctx,x,y){
  rect(ctx,x,y,4,9,3,3,PAL.Wd);rect(ctx,x,y,4,9,3,1,PAL.w);
  rect(ctx,x,y,10,11,2,2,PAL.Wd);px(ctx,x,y,10,11,PAL.w);
  px(ctx,x,y,7,13,PAL.DI);px(ctx,x,y,3,12,PAL.DI);
}
function paintWatchtower(ctx,x,y){
  rect(ctx,x,y,4,2,8,1,PAL.R);rect(ctx,x,y,5,1,6,1,PAL.R);
  rect(ctx,x,y,4,3,8,3,PAL.w);rect(ctx,x,y,4,3,8,1,PAL.Wd);
  px(ctx,x,y,6,4,PAL.k);px(ctx,x,y,9,4,PAL.k);
  rect(ctx,x,y,3,6,10,1,PAL.Wd);
  rect(ctx,x,y,4,7,1,8,PAL.Wd);rect(ctx,x,y,11,7,1,8,PAL.Wd);
  rect(ctx,x,y,5,9,6,1,PAL.Wd);rect(ctx,x,y,5,12,6,1,PAL.Wd);
  px(ctx,x,y,12,1,PAL.y);px(ctx,x,y,13,2,PAL.r);
}
function paintLibrary(ctx,x,y){
  // v2.1: библиотека — каменный корпус, синяя черепица учёных, раскрытая книга над входом
  rect(ctx,x,y,3,5,10,9,PAL.R2);rect(ctx,x,y,3,5,10,1,PAL.R3);
  rect(ctx,x,y,2,3,12,2,PAL.Cb);rect(ctx,x,y,4,2,8,1,PAL.Cb);rect(ctx,x,y,2,5,12,1,PAL.W1);
  rect(ctx,x,y,7,9,3,5,PAL.k);rect(ctx,x,y,6,8,5,1,PAL.Wd);
  rect(ctx,x,y,4,7,2,2,PAL.y);rect(ctx,x,y,11,7,2,2,PAL.y);
  rect(ctx,x,y,6,4,2,1,PAL.SN);rect(ctx,x,y,9,4,2,1,PAL.SN);px(ctx,x,y,8,4,PAL.y);
  rect(ctx,x,y,3,13,10,1,PAL.R1);
}
function paintKnowledge(ctx,x,y){
  // v2.1: башня знаний (тир 2) — шпиль с самоцветом и крылья-архивы; силуэт выше библиотеки
  rect(ctx,x,y,5,7,6,9,PAL.R2);rect(ctx,x,y,5,7,6,1,PAL.R3);
  rect(ctx,x,y,4,6,8,1,PAL.R3);
  rect(ctx,x,y,5,3,6,3,PAL.Cb);rect(ctx,x,y,6,2,4,1,PAL.Cb);
  px(ctx,x,y,7,1,PAL.GEM);px(ctx,x,y,8,1,PAL.GEM);px(ctx,x,y,7,0,PAL.GEM);px(ctx,x,y,8,0,PAL.GEM);
  rect(ctx,x,y,7,4,2,1,PAL.GEM);
  px(ctx,x,y,6,9,PAL.y);px(ctx,x,y,9,9,PAL.y);
  rect(ctx,x,y,7,13,2,3,PAL.k);rect(ctx,x,y,6,12,4,1,PAL.Wd);
  rect(ctx,x,y,2,13,3,3,PAL.R1);rect(ctx,x,y,11,13,3,3,PAL.R1);
  rect(ctx,x,y,2,13,3,1,PAL.R3);rect(ctx,x,y,11,13,3,1,PAL.R3);
  px(ctx,x,y,3,14,PAL.y);px(ctx,x,y,12,14,PAL.y);
  rect(ctx,x,y,4,16,8,1,PAL.o);
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
  ATLAS={W:256,H:1024,cur:{x:0,y:0,rowH:0}};
  if(TS)ATLAS.W=512,ATLAS.H=2048; // ×4-слоты террейна не влезают в 256×1024
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
  for(const t of [T.WATER,T.SAND,T.SWAMP,T.GRASS,T.SCRUB,T.FOREST,T.ROCK,T.MTN]){
    for(const orr of ['l','r'])
      for(let v=0;v<2;v++){
        const nm='tri'+t+'_'+orr+'_full'+v;
        const d=tsPlace(nm,place,ctx);
        if(d){reg(nm,d.x,d.y,d.w,d.h);continue}
        const p=place(TRIW,TRIH);paintTriFull(ctx,p.x,p.y,t,orr,v);reg(nm,p.x,p.y,TRIW,TRIH);
      }
  }
  for(const t of [T.SAND,T.SWAMP,T.GRASS,T.SCRUB,T.FOREST,T.ROCK,T.MTN]){
    for(const orr of ['l','r'])
      for(let bits=1;bits<7;bits++){
        const nm='tri'+t+'_'+orr+'_'+bits;
        const d=tsPlace(nm,place,ctx);
        if(d){reg(nm,d.x,d.y,d.w,d.h);continue}
        const p=place(TRIW,TRIH);paintTriTransition(ctx,p.x,p.y,t,orr,bits);reg(nm,p.x,p.y,TRIW,TRIH);
      }
  }
  // units
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
  // buildings: distinct silhouettes
  let p=place(16,16);drawGrid(ctx,p.x,p.y,G_HUT,HUT_MAPS.hut);reg('b_hut',p.x,p.y,16,16);
  p=place(16,16);drawGrid(ctx,p.x,p.y,G_HOUSE2,HOUSE2_MAP);reg('b_house2',p.x,p.y,16,16);
  p=place(16,16);drawGrid(ctx,p.x,p.y,G_TENT,TENT_MAP);reg('b_tent',p.x,p.y,16,16);
  p=place(16,16);paintFisher(ctx,p.x,p.y);reg('b_fisher',p.x,p.y,16,16);
  p=place(16,16);paintLumber(ctx,p.x,p.y);reg('b_lumber',p.x,p.y,16,16);
  p=place(16,16);drawGrid(ctx,p.x,p.y,G_TAVERN,TAVERN_MAP);
  rect(ctx,p.x,p.y,14,9,2,2,PAL.y);px(ctx,p.x,p.y,14,8,PAL.Wd);
  reg('b_tavern',p.x,p.y,16,16);
  p=place(16,16);paintFarm(ctx,p.x,p.y);
  rect(ctx,p.x,p.y,11,3,4,1,PAL.r);rect(ctx,p.x,p.y,11,4,4,3,PAL.w);px(ctx,p.x,p.y,12,5,PAL.D);
  reg('b_farm',p.x,p.y,16,16);
  p=place(8,8);paintSmoke(ctx,p.x,p.y,0);reg('fx_0',p.x,p.y,8,8);
  p=place(8,8);paintSmoke(ctx,p.x,p.y,1);reg('fx_1',p.x,p.y,8,8);
  p=place(8,8);paintHammer(ctx,p.x,p.y,0);reg('fxh_0',p.x,p.y,8,8);
  p=place(8,8);paintHammer(ctx,p.x,p.y,1);reg('fxh_1',p.x,p.y,8,8);
  p=place(16,16);paintPort(ctx,p.x,p.y);reg('b_port',p.x,p.y,16,16);
  p=place(16,16);paintGuild(ctx,p.x,p.y);reg('b_guild',p.x,p.y,16,16);
  p=place(16,16);paintAdvGuild(ctx,p.x,p.y);reg('b_advguild',p.x,p.y,16,16);
  p=place(8,8);paintPennant(ctx,p.x,p.y);reg('pennant',p.x,p.y,8,8);
  p=place(16,16);paintStake(ctx,p.x,p.y);reg('stake',p.x,p.y,16,16);
  p=place(16,16);paintCrafters(ctx,p.x,p.y);reg('b_crafters',p.x,p.y,16,16);
  p=place(16,16);paintShip(ctx,p.x,p.y,false);reg('ship0',p.x,p.y,16,16);
  p=place(16,16);paintShip(ctx,p.x,p.y,true);reg('ship1',p.x,p.y,16,16);
  p=place(16,16);
  for(let yy=0;yy<16;yy++)for(let xx=0;xx<16;xx++){
    const h=hash2(xx,yy,404);
    if(h<0.55){ctx.fillStyle=(h<0.15)?'#000000':PAL.o;ctx.fillRect(p.x+xx,p.y+yy,1,1)}
  }
  reg('ash',p.x,p.y,16,16);
  p=place(16,16);paintMine(ctx,p.x,p.y);reg('b_mine',p.x,p.y,16,16);
  p=place(16,16);paintSite(ctx,p.x,p.y);reg('b_site',p.x,p.y,16,16);
  p=place(16,17);drawGrid(ctx,p.x,p.y,G_TOWNHALL,TH_MAP);reg('b_townhall',p.x,p.y,16,17);
  // lairs
  p=place(16,12);drawGrid(ctx,p.x,p.y,G_TOWER,TOWER_MAP);reg('l_tower',p.x,p.y,16,12);
  p=place(16,15);drawGrid(ctx,p.x,p.y,G_NECRO,NECRO_MAP);reg('l_necro',p.x,p.y,16,15);
  p=place(16,16);paintCamp(ctx,p.x,p.y);reg('l_camp',p.x,p.y,16,16);
  p=place(16,16);paintDen(ctx,p.x,p.y);reg('l_den',p.x,p.y,16,16);
  p=place(16,16);paintCliff(ctx,p.x,p.y);reg('l_cliff',p.x,p.y,16,16);
  p=place(16,16);paintGraves(ctx,p.x,p.y);reg('l_graves',p.x,p.y,16,16);
  // features
  p=place(16,16);paintBerry(ctx,p.x,p.y);reg('f_1',p.x,p.y,16,16);
  p=place(16,16);paintDeadfall(ctx,p.x,p.y);reg('f_2',p.x,p.y,16,16);
  p=place(16,16);paintRubble(ctx,p.x,p.y);reg('f_3',p.x,p.y,16,16);
  p=place(16,16);paintVein(ctx,p.x,p.y);reg('f_4',p.x,p.y,16,16);
  p=place(16,16);paintFish(ctx,p.x,p.y);reg('f_5',p.x,p.y,16,16);
  p=place(16,16);paintRuins(ctx,p.x,p.y);reg('f_6',p.x,p.y,16,16);
  p=place(16,16);paintWheat(ctx,p.x,p.y);reg('f_7',p.x,p.y,16,16);
  p=place(16,16);paintStump(ctx,p.x,p.y);reg('f_8',p.x,p.y,16,16);
  p=place(16,16);paintWatchtower(ctx,p.x,p.y);reg('b_tower',p.x,p.y,16,16);
  p=place(16,16);paintLibrary(ctx,p.x,p.y);reg('b_library',p.x,p.y,16,16);
  p=place(16,17);paintKnowledge(ctx,p.x,p.y);reg('b_knowledge',p.x,p.y,16,17);
  for(let m=0;m<64;m++){p=place(14,16);paintRoadHex(ctx,p.x,p.y,m);reg('road_'+m,p.x,p.y,14,16)}
  // реки из PNG-тайлсета — один слот на маску, берега альфой (тинт не нужен)
  for(const orr of ['l','r'])
    for(let m=1;m<8;m++){
      const d=tsPlace('rt_'+orr+'_'+m,place,ctx);
      if(d)for(const t of [T.SAND,T.SWAMP,T.GRASS,T.SCRUB,T.FOREST,T.ROCK,T.MTN])
        reg('rt_'+t+'_'+orr+'_'+m,d.x,d.y,d.w,d.h);
    }
  for(const t of [T.SAND,T.SWAMP,T.GRASS,T.SCRUB,T.FOREST,T.ROCK,T.MTN])
    for(const orr of ['l','r'])
      for(let m=1;m<8;m++){
        if(SPR['rt_'+t+'_'+orr+'_'+m])continue; // уже из тайлсета
        p=place(14,16);paintRiverTri(ctx,p.x,p.y,orr,m,t);reg('rt_'+t+'_'+orr+'_'+m,p.x,p.y,14,16);
      }
  {const d=tsPlace('r_mouth',place,ctx);
   if(d)reg('r_mouth',d.x,d.y,d.w,d.h);
   else{p=place(8,8);paintRiverMouth(ctx,p.x,p.y);reg('r_mouth',p.x,p.y,8,8)}}
  {const d=tsPlace('r_falls',place,ctx);
   if(d)reg('r_falls',d.x,d.y,d.w,d.h);
   else{p=place(10,12);paintWaterfall(ctx,p.x,p.y);reg('r_falls',p.x,p.y,10,12)}}
  {const d=tsPlace('bridge',place,ctx);
   if(d)reg('bridge',d.x,d.y,d.w,d.h);
   else{p=place(14,16);paintBridge(ctx,p.x,p.y);reg('bridge',p.x,p.y,14,16)}}
  for(const k of ['b_hut','b_house2','b_tent','b_fisher','b_lumber','b_tavern','b_farm','b_mine','b_townhall','b_tower','b_port','b_guild','b_advguild','b_crafters','b_library','b_knowledge']){
    const sp=SPR[k];if(sp)outlineRegion(ctx,sp.x,sp.y,sp.w,sp.h);
  }
  ICONS={gold:paintIcon('gold'),food:paintIcon('food'),wood:paintIcon('wood'),
    stone:paintIcon('stone'),gems:paintIcon('gems'),pop:paintIcon('pop'),ammo:paintIcon('ammo')};
  S.atlasMs=performance.now()-t0;
}


/* ---------- КОНТЕКСТНЫЙ шаблон PNG-тайлсета (docs/tileset-pipeline.md) ----------
   Принцип Tilesetter: не изолированные слоты, а НЕПРЕРЫВНОЕ ПОЛОТНО.
   Для каждой пары «верхний материал на канонической подложке» рисуется
   демо-остров из смежных треугольников dual-сетки (та же геометрия, что
   в игре): плоская масочная разметка цветами материалов, все варианты
   стыков присутствуют в контексте соседей, стыки сходятся по построению.
   Художник/нейронка перерисовывает полотно ЦЕЛИКОМ (это одно изображение),
   затем «Нарезать лист» вырезает канонические треугольники по маскам и
   собирает готовый assets/tileset.png (раскладку слотов держит tilesetSlots).
   Формат tileset.png/импорт НЕ менялись — контекст только на входе. */
const TS_SCALE=4; // целевое разрешение: треугольник 14x16 -> 56x64
const TS_TW=TRIW*TS_SCALE,TS_TH=TRIH*TS_SCALE;
// пары «верх на подложке» в порядке пирога (вода -> горы)
const TS_PAIRS=[
  {u:T.SAND,l:T.WATER},{u:T.GRASS,l:T.WATER},{u:T.SWAMP,l:T.GRASS},
  {u:T.SCRUB,l:T.GRASS},{u:T.FOREST,l:T.SCRUB},{u:T.ROCK,l:T.GRASS},{u:T.MTN,l:T.ROCK}
];
// плоские цвета разметки материалов (никакого заранее нарисованного арта)
const TS_FLAT={};
function tsFlatInit(){
  TS_FLAT[T.WATER]=PAL.W2;TS_FLAT[T.SAND]=PAL.SA2;TS_FLAT[T.SWAMP]=PAL.SW2;
  TS_FLAT[T.GRASS]=PAL.G2;TS_FLAT[T.SCRUB]=PAL.SC2;TS_FLAT[T.FOREST]=PAL.F2;
  TS_FLAT[T.ROCK]=PAL.R2;TS_FLAT[T.MTN]=PAL.M2;
}
/* раскладка ВЫХОДНОГО tileset.png (её ест импортёр buildAtlas) */
function tilesetSlots(){
  const SHEET_W=1056,MX=8,MY=22;
  const slots=[];let x=MX,y=MY,rowH=0;
  const put=(name,w,h)=>{
    if(x+w+MX>SHEET_W){x=MX;y+=rowH+MY;rowH=0}
    slots.push({name,x,y,w,h});
    x+=w+MX;if(h>rowH)rowH=h;
  };
  const nl=()=>{if(x>MX){x=MX;y+=rowH+MY;rowH=0}};
  for(const t of [T.WATER,T.SAND,T.SWAMP,T.GRASS,T.SCRUB,T.FOREST,T.ROCK,T.MTN]){
    for(const orr of ['l','r']){
      for(let v=0;v<2;v++)put('tri'+t+'_'+orr+'_full'+v,TS_TW,TS_TH);
      if(t!==T.WATER)for(let b=1;b<7;b++)put('tri'+t+'_'+orr+'_'+b,TS_TW,TS_TH);
    }
    nl();
  }
  for(const orr of ['l','r'])
    for(let m=1;m<8;m++)put('rt_'+orr+'_'+m,TS_TW,TS_TH);
  put('r_mouth',8*TS_SCALE,8*TS_SCALE);
  put('r_falls',10*TS_SCALE,12*TS_SCALE);
  put('bridge',TS_TW,TS_TH);
  nl();
  return {sheetW:SHEET_W,sheetH:y,slots};
}
/* демо-паттерн пары: рваный остров U-гексов на поле GWxGH, в котором
   присутствуют ВСЕ варианты стыков (обе ориентации, маски 1..6), полные
   треугольники верха (>=2 на ориентацию) и подложки. Детерминирован. */
function tsBlobPattern(){
  const GW=11,GH=9;
  const rng=mulberry32(20260705);
  for(let att=0;att<20000;att++){
    const set=new Uint8Array(GW*GH);
    const cx2=GW/2-0.5,cy2=GH/2-0.5;
    for(let y=1;y<GH-1;y++)for(let x=1;x<GW-1;x++){
      const d=Math.hypot((x-cx2)/(GW*0.42),(y-cy2)/(GH*0.42));
      if(d+rng()*0.9-0.45<0.72)set[y*GW+x]=1;
    }
    // покрытие: соберём варианты по треугольникам
    const seen=new Set();let fullU={l:0,r:0},fullL={l:0,r:0};
    for(let x=0;x<GW-1;x++)for(let y=0;y<GH-1;y++)
      for(const tr of colTris(x,y)){
        if(tr.corners.some(c=>c[0]<0||c[1]<0||c[0]>=GW||c[1]>=GH))continue;
        const b=tr.corners.reduce((m,c,k)=>m|(set[c[1]*GW+c[0]]<<k),0);
        if(b===7)fullU[tr.or]++;
        else if(b===0)fullL[tr.or]++;
        else seen.add(tr.or+b);
      }
    let ok=fullU.l>=2&&fullU.r>=2&&fullL.l>=2&&fullL.r>=2;
    if(ok)for(const orr of ['l','r'])for(let b=1;b<7;b++)if(!seen.has(orr+b))ok=false;
    if(ok)return {GW,GH,set};
  }
  throw new Error('tsBlobPattern: покрытие не найдено');
}
// позиция треугольника (x,y,baseCol) демо-патча в пикселях листа
function tsTriPx(ox,oy,x,y,baseCol){
  return [ox+x*TS_TW, oy+y*TS_TH+((baseCol&1)?TS_TH/2:0)];
}
// углы треугольника (центры гексов) в пикселях листа — для сетки разметки
function tsCornerPx(ox,oy,cx2,cy2){
  return [ox+cx2*TS_TW, oy+cy2*TS_TH+((cx2&1)?TS_TH/2:0)];
}
// маска покрытия верхним материалом в координатах слота 56x64:
// та же барицентрическая интерполяция углов + тот же шум кромки, что у
// paintTriTransition (масштаб x4) — нарезка сходится с процедурными тайлами
function tsMaskAt(orr,bits,t,px2,py2,noise){
  if(bits===7)return true;
  if(bits===0)return false;
  const w=triBary(orr,px2/TS_SCALE+0.125,py2/TS_SCALE+0.125);
  if(w[0]<-0.045||w[1]<-0.045||w[2]<-0.045)return false;
  const c=[bits&1,(bits>>1)&1,(bits>>2)&1];
  let v=w[0]*c[0]+w[1]*c[1]+w[2]*c[2];
  if(noise)v+=hash2((px2>>2)+t*31,(py2>>2)+bits*7+(orr==='r'?191:0),911)*0.30-0.15;
  return v>0.5;
}
function tsInsideTri(orr,px2,py2){
  const w=triBary(orr,px2/TS_SCALE+0.125,py2/TS_SCALE+0.125);
  return w[0]>=-0.045&&w[1]>=-0.045&&w[2]>=-0.045;
}
function exportTilesetTemplate(returnOnly){
  tsFlatInit();
  const blob=tsBlobPattern();
  const {GW,GH,set}=blob;
  const patchW=(GW-1)*TS_TW,patchH=(GH-1)*TS_TH+TS_TH/2;
  const MX=24,MY=34;
  const sheetW=MX*2+patchW;
  const sheetH=(MY+patchH)*TS_PAIRS.length+MY;
  const mk=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;
    const g=c.getContext('2d');g.imageSmoothingEnabled=false;return [c,g]};
  const [tcv,tg]=mk(sheetW,sheetH),[mcv,mg]=mk(sheetW,sheetH);
  mg.font='11px monospace';
  const pairsMeta=[];
  TS_PAIRS.forEach((pr,pi)=>{
    const ox=MX,oy=MY+(MY+patchH)*pi;
    mg.fillStyle='#e64ae6';
    mg.fillText(TNAME[pr.u]+' ('+pr.u+') на '+TNAME[pr.l]+' ('+pr.l+') — полотно непрерывно, рисовать целиком',ox,oy-8);
    const canon={},fullsU=[],fullsL=[];
    for(let x=0;x<GW-1;x++)for(let y=0;y<GH-1;y++)
      for(const tr of colTris(x,y)){
        if(tr.corners.some(c=>c[0]<0||c[1]<0||c[0]>=GW||c[1]>=GH))continue;
        const bits=tr.corners.reduce((m,c,k)=>m|(set[c[1]*GW+c[0]]<<k),0);
        const [px2,py2]=tsTriPx(ox,oy,x,y,tr.baseCol);
        // плоская разметка: подложка всюду, верх по крисп-маске углов
        for(let yy=0;yy<TS_TH;yy++)for(let xx=0;xx<TS_TW;xx++){
          if(!tsInsideTri(tr.or,xx,yy))continue;
          tg.fillStyle=tsMaskAt(tr.or,bits,pr.u,xx,yy,false)?TS_FLAT[pr.u]:TS_FLAT[pr.l];
          tg.fillRect(px2+xx,py2+yy,1,1);
        }
        // канонические экземпляры для нарезки (по 2 полных на ориентацию)
        const rec={x,y,or:tr.or,bits,px:px2-ox,py:py2-oy};
        if(bits===7){if(fullsU.filter(f=>f.or===tr.or).length<2)fullsU.push(rec)}
        else if(bits===0){if(fullsL.filter(f=>f.or===tr.or).length<2)fullsL.push(rec)}
        else if(!canon[tr.or+bits])canon[tr.or+bits]=rec;
      }
    pairsMeta.push({u:pr.u,l:pr.l,ox,oy,canon:Object.values(canon),fullsU,fullsL});
  });
  // разметка: сетка треугольников + метки канонических слотов
  mg.strokeStyle='rgba(230,74,230,0.55)';mg.lineWidth=1;
  for(const pm of pairsMeta){
    for(let x=0;x<GW-1;x++)for(let y=0;y<GH-1;y++)
      for(const tr of colTris(x,y)){
        if(tr.corners.some(c=>c[0]<0||c[1]<0||c[0]>=GW||c[1]>=GH))continue;
        const P=tr.corners.map(c=>tsCornerPx(pm.ox,pm.oy,c[0],c[1]));
        mg.beginPath();mg.moveTo(P[0][0],P[0][1]);mg.lineTo(P[1][0],P[1][1]);mg.lineTo(P[2][0],P[2][1]);mg.closePath();mg.stroke();
      }
    mg.fillStyle='#ffffff';
    const lbl=(r,txt)=>{mg.fillText(txt,pm.ox+r.px+TS_TW/2-8,pm.oy+r.py+TS_TH/2+4)};
    for(const r of pm.canon)lbl(r,r.or+r.bits);
    pm.fullsU.forEach((r,i)=>lbl(r,'F'+r.or+i%2));
    pm.fullsL.forEach((r,i)=>lbl(r,'f'+r.or+i%2));
  }
  const map={version:2,mode:'context',scale:TS_SCALE,sheetW,sheetH,
    note:'контекстный шаблон: полотна пар «верх на подложке»; нарезка — кнопкой в игре; out — раскладка готового tileset.png',
    grid:{GW,GH,cells:Array.from(set)},
    pairs:pairsMeta.map(pm=>({u:pm.u,l:pm.l,ox:pm.ox,oy:pm.oy,
      canon:pm.canon.map(r=>({or:r.or,bits:r.bits,px:r.px,py:r.py})),
      fullsU:pm.fullsU.map(r=>({or:r.or,px:r.px,py:r.py})),
      fullsL:pm.fullsL.map(r=>({or:r.or,px:r.px,py:r.py}))})),
    out:tilesetSlots()};
  const json=JSON.stringify(map);
  if(returnOnly)return {template:tcv.toDataURL('image/png'),markup:mcv.toDataURL('image/png'),json};
  const dl=(href,fn)=>{const a=document.createElement('a');a.href=href;a.download=fn;a.click()};
  dl(tcv.toDataURL('image/png'),'tileset_template.png');
  dl(mcv.toDataURL('image/png'),'tileset_markup.png');
  dl('data:application/json;charset=utf-8,'+encodeURIComponent(json),'tileset_map.json');
  log('🎨 Контекстный шаблон скачан: '+TS_PAIRS.length+' полотен пар, разметка, карта нарезки.');
}
/* нарезка перерисованного полотна -> готовый tileset.png (раскладка out).
   Альфа тайла = маска углов с тем же шумом кромки, что в игре. */
function sliceTilesetSheet(img,M){
  const src=document.createElement('canvas');src.width=M.sheetW;src.height=M.sheetH;
  const sg=src.getContext('2d');sg.imageSmoothingEnabled=false;sg.drawImage(img,0,0);
  const out=document.createElement('canvas');out.width=M.out.sheetW;out.height=M.out.sheetH;
  const og=out.getContext('2d');
  const slotByName={};for(const sl of M.out.slots)slotByName[sl.name]=sl;
  const cut=(sx,sy,orr,bits,t,slotName,noise)=>{
    const sl=slotByName[slotName];if(!sl)return;
    const id=sg.getImageData(sx,sy,TS_TW,TS_TH);
    const d=id.data;
    for(let yy=0;yy<TS_TH;yy++)for(let xx=0;xx<TS_TW;xx++){
      const keep=bits===7?tsInsideTri(orr,xx,yy):tsMaskAt(orr,bits,t,xx,yy,noise);
      if(!keep)d[(yy*TS_TW+xx)*4+3]=0;
    }
    og.putImageData(id,sl.x,sl.y);
  };
  for(const pm of M.pairs){
    for(const r of pm.canon)
      cut(pm.ox+r.px,pm.oy+r.py,r.or,r.bits,pm.u,'tri'+pm.u+'_'+r.or+'_'+r.bits,true);
    const seenU={l:0,r:0},seenL={l:0,r:0};
    for(const r of pm.fullsU)
      cut(pm.ox+r.px,pm.oy+r.py,r.or,7,pm.u,'tri'+pm.u+'_'+r.or+'_full'+(seenU[r.or]++%2),false);
    if(pm.l===T.WATER)for(const r of pm.fullsL) // подложка первой пары даёт базовую воду
      cut(pm.ox+r.px,pm.oy+r.py,r.or,7,pm.l,'tri'+pm.l+'_'+r.or+'_full'+(seenL[r.or]++%2),false);
  }
  return out;
}
function importSheetDialog(){
  const inp=document.createElement('input');inp.type='file';inp.accept='image/png';
  inp.onchange=()=>{
    const f=inp.files&&inp.files[0];if(!f)return;
    const url=URL.createObjectURL(f);
    const im=new Image();
    im.onload=()=>{
      URL.revokeObjectURL(url);
      const M=JSON.parse(exportTilesetTemplate(true).json); // геометрия детерминирована
      if(im.width!==M.sheetW||im.height!==M.sheetH){
        log('🚫 Лист '+im.width+'x'+im.height+' не совпадает с шаблоном '+M.sheetW+'x'+M.sheetH);
        return;
      }
      const out=sliceTilesetSheet(im,M);
      const a=document.createElement('a');a.href=out.toDataURL('image/png');a.download='tileset.png';a.click();
      log('✂ Лист нарезан -> tileset.png (положи в assets/ и пересобери).');
    };
    im.src=url;
  };
  inp.click();
}
/* превью атласа: что реально нарезано (PNG-слоты видны крупными) */
function tilesetPreview(){
  const sc=Math.max(1,Math.floor(Math.min(innerWidth/ATLAS.W,(innerHeight-40)/ATLAS.H)*2)/2);
  const cv=document.createElement('canvas');
  cv.width=ATLAS.W*sc;cv.height=ATLAS.H*sc;
  cv.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-height:96vh;'+
    'z-index:61;image-rendering:pixelated;border:2px solid var(--edge);background:#1b1522;box-shadow:0 6px 0 rgba(0,0,0,.5)';
  const g=cv.getContext('2d');g.imageSmoothingEnabled=false;
  g.drawImage(ATLAS.cv,0,0,cv.width,cv.height);
  g.fillStyle='#eec658';g.font='12px monospace';
  g.fillText(TS?'PNG-тайлсет: ВКЛ ('+Object.keys(TS_IDX).length+' слотов)':'PNG-тайлсет: нет (всё процедурное)',6,14);
  document.body.appendChild(cv);
  cv.onclick=()=>cv.remove();
}
