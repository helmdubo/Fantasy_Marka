/* ================= HEX CORE (Drop I, flat-top) =================
   Данные и симуляция в offset-координатах (col,row), flat-top, odd-q:
   нечётные КОЛОНКИ смещены на полклетки вниз. Мир: X сжат шагом колонки CW,
   Y 1:1 по рядам. Dual-грид террейна — треугольники ◀▶ между центрами хексов;
   у треугольника вертикальное ребро, у hex-ячейки — две горизонтальные грани. */
const CW=0.875; // шаг колонки в мировых единицах (14px при 16px-тайле)
function zig(x){ // вертикальный зигзаг-оффсет колонок: 0 на чётных, 0.5 на нечётных (вниз по экрану)
  const m=((x%2)+2)%2;
  return 0.5*(m<1?m:2-m);
}
// Мировые координаты (flat-top): X сжат по колонкам, Y 1:1 по рядам с зигзагом колонок
function WXC(x){return (x+0.5)*CW}
function WYCC(x,y){return (S.H-1-y)+0.5-zig(x)}
// 6 соседей flat-top odd-q; порядок слотов мировых направлений: N,S,NE,NW,SE,SW
function hexDirs(x){
  return (x&1)
    ?[[0,-1],[0,1],[1,0],[-1,0],[1,1],[-1,1]]
    :[[0,-1],[0,1],[1,-1],[-1,-1],[1,0],[-1,0]];
}
function offToCube(x,y){const r=y-((x-(x&1))>>1);return [x,-x-r,r]}
function hexDist2(x1,y1,x2,y2){
  const a=offToCube(x1,y1),b=offToCube(x2,y2);
  return Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[2]-b[2]));
}
function cubeToOff(q,r){return {x:q,y:r+((q-(q&1))>>1)}}
function hexLine(x0,y0,x1,y1){
  const a=offToCube(x0,y0),b=offToCube(x1,y1);
  const n=Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[2]-b[2]));
  const out=[];
  for(let i=0;i<=n;i++){
    const t=n?i/n:0;
    let q=lerp(a[0],b[0],t),r=lerp(a[2],b[2],t);
    let s2=-q-r;
    let rq=Math.round(q),rr=Math.round(r),rs=Math.round(s2);
    const dq=Math.abs(rq-q),dr=Math.abs(rr-r),ds=Math.abs(rs-s2);
    if(dq>dr&&dq>ds)rq=-rr-rs;else if(dr>ds)rr=-rq-rs;
    out.push(cubeToOff(rq,rr));
  }
  return out;
}
function losClear(x0,y0,x1,y1,viewH){
  const line=hexLine(x0,y0,x1,y1);
  for(let k=1;k<line.length-1;k++){ // промежуточные хексы; конечный виден (его грань)
    const c=line[k];
    if(!inMap(c.x,c.y))continue;
    const t=S.terr[idx(c.x,c.y)];
    if(heightOf(t)>viewH)return false; // пик выше наблюдателя
    if(t===T.FOREST)return false; // сквозь лес не видно
  }
  return true;
}
function findPath(S,sx,sy,tx,ty,adjOk,orthOnly){
  // Drop I: A* по 6 hex-соседям; orthOnly сохранён в сигнатуре, но на хексе
  // все соседи равноправны — параметр игнорируется.
  const W=S.W,H=S.H,pass=S.pass;
  const inB=(x,y)=>x>=0&&y>=0&&x<W&&y<H;
  const goal=(x,y)=>{
    if(!adjOk)return x===tx&&y===ty;
    return cheb(x,y,tx,ty)<=1&&!(x===tx&&y===ty);
  };
  if(!adjOk&&(!inB(tx,ty)||!pass[ty*W+tx]))return null;
  if(goal(sx,sy))return [];
  const N=W*H;
  const g=new Float32Array(N).fill(Infinity);
  const f=new Float32Array(N).fill(Infinity);
  const came=new Int32Array(N).fill(-1);
  const closed=new Uint8Array(N);
  const open=[];
  const si=sy*W+sx;
  g[si]=0;f[si]=cheb(sx,sy,tx,ty);open.push(si);
  let iter=0;
  while(open.length&&iter++<6000){
    let bi=0;for(let i=1;i<open.length;i++)if(f[open[i]]<f[open[bi]])bi=i;
    const cur=open[bi];open[bi]=open[open.length-1];open.pop();
    const cx=cur%W,cy=(cur/W)|0;
    if(goal(cx,cy)){
      const path=[];let n=cur;
      while(n!==-1&&n!==si){path.push({x:n%W,y:(n/W)|0});n=came[n]}
      path.reverse();return path;
    }
    closed[cur]=1;
    for(const d of hexDirs(cx)){
      const nx=cx+d[0],ny=cy+d[1];
      if(!inB(nx,ny))continue;
      const ni=ny*W+nx;
      if(closed[ni]||!pass[ni])continue;
      const ng=g[cur]+1;
      if(ng<g[ni]){g[ni]=ng;f[ni]=ng+cheb(nx,ny,tx,ty);came[ni]=cur;
        if(open.indexOf(ni)<0)open.push(ni)}
    }
  }
  return null;
}

