/* ================= ATLAS (browser only) ================= */
let ATLAS=null,SPR={},ICONS={};
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
  ATLAS={W:256,H:512,cur:{x:0,y:0,rowH:0}};
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
  for(const k of ['b_hut','b_fisher','b_lumber','b_tavern','b_farm','b_mine','b_townhall','b_tower','b_port','b_guild','b_advguild','b_crafters','b_library','b_knowledge']){
    const sp=SPR[k];if(sp)outlineRegion(ctx,sp.x,sp.y,sp.w,sp.h);
  }
  ICONS={gold:paintIcon('gold'),food:paintIcon('food'),wood:paintIcon('wood'),
    stone:paintIcon('stone'),gems:paintIcon('gems'),pop:paintIcon('pop'),ammo:paintIcon('ammo')};
  S.atlasMs=performance.now()-t0;
}

