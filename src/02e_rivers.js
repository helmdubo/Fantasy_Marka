/* ---------- РЕКИ v3 (terrain handoff v2.0 §6): flow-аккумуляция ----------
   Русла — по РЁБРАМ гексов: узлы графа = центры dual-треугольников, высота
   узла = среднее S.elev трёх углов-гексов. Priority-flood от моря вверх
   даёт каждому узлу ровно один downhill-выход и гарантирует отсутствие
   локальных минимумов (инвариант Амита: каждая река достигает стока; озёра
   дренируются через низший седловой узел => реки втекают/вытекают сами).
   Истоки: седловины троек/перевалов, периметр подножий. Поток суммируется
   вниз, конфлюэнции возникают сами (граф рек тривалентен по построению);
   ширина русла — класс w 1..3 от накопленного потока (~sqrt(flow)).
   Река не занимает клетку: она атрибут ребра смежности гексов —
   S.riverEdges блокирует переход, мост = дорога на обоих берегах (findPath).
   Контракты v2 сохранены: S.riverEdges, S.riverTris (+w), S.riverStats,
   S.world.rivers (parent/child). */

function edgeKeyCells(ai,bi){const N=S.W*S.H;return ai<bi?ai*N+bi:bi*N+ai}
function cellNearRiver(x,y){
  if(!S.riverEdges||!S.riverEdges.size)return false;
  const a=idx(x,y);
  for(const d of hexDirs(x)){
    const nx=x+d[0],ny=y+d[1];
    if(!inMap(nx,ny))continue;
    if(S.riverEdges.has(edgeKeyCells(a,idx(nx,ny))))return true;
  }
  return false;
}

function genRivers(){
  const W=S.W,H=S.H,N=W*H,N2=N*2;
  const RV=CFG.RELIEF.RIVERS;
  S.riverEdges=new Set();
  S.riverTris=new Map(); // tid -> {x,y,baseCol,or,mask,tint,w,over:[{kind,wx,wy}]}
  S.riverStats={springs:0,outflows:0,flowMax:0};
  const EK=(a,b)=>a<b?a*N+b:b*N+a;
  // --- граф треугольников dual-сетки ---
  const tris=new Map();   // tid -> rec
  const sideMap=new Map();// ключ стороны (пара гексов) -> [tid,tid]
  for(let x=0;x<W-1;x++)for(let y=0;y<H-1;y++){
    const two=colTris(x,y);
    for(let k=0;k<2;k++){
      const tr=two[k];
      if(tr.corners.some(c=>!inMap(c[0],c[1])))continue;
      const ci=tr.corners.map(c=>idx(c[0],c[1]));
      const tid=(y*W+x)*2+k;
      // высота узла = среднее углов + крошечный детерминированный джиттер
      // (несвязанная вариативность: меандры, а не идеальные прямые)
      const h=(S.elev[ci[0]]+S.elev[ci[1]]+S.elev[ci[2]])/3
        +hash2(x*2+k,y,S.seed+7)*0.004;
      const rec={tid,x,y,baseCol:tr.baseCol,or:tr.or,corners:tr.corners,ci,
        sides:[EK(ci[0],ci[1]),EK(ci[1],ci[2]),EK(ci[2],ci[0])],
        h,water:ci.some(i2=>S.terr[i2]===T.WATER),
        sea:ci.some(i2=>S.terr[i2]===T.WATER&&S.waterKind[i2]===2),
        mtnN:ci.filter(i2=>S.terr[i2]===T.MTN).length};
      tris.set(tid,rec);
      for(const sk of rec.sides){
        let arr=sideMap.get(sk);if(!arr){arr=[];sideMap.set(sk,arr)}
        arr.push(tid);
      }
    }
  }
  const neighborVia=(rec,si)=>{
    const arr=sideMap.get(rec.sides[si]);
    if(!arr)return null;
    const oid=arr[0]===rec.tid?arr[1]:arr[0];
    return oid===undefined?null:tris.get(oid);
  };
  // --- priority-flood: spill-высоты от моря вверх, down-выход у каждого узла ---
  const spill=new Float32Array(N2).fill(Infinity);
  const downTid=new Int32Array(N2).fill(-1);
  const downSide=new Int32Array(N2).fill(-1);
  const settled=new Uint8Array(N2);
  const heap=[]; // бинарная куча (spill, tid); tie-break по tid — детерминизм
  const less=(a,b)=>spill[a]<spill[b]||(spill[a]===spill[b]&&a<b);
  const hpush=(t)=>{heap.push(t);let i=heap.length-1;
    while(i>0){const p=(i-1)>>1;if(less(heap[i],heap[p])){const tmp=heap[i];heap[i]=heap[p];heap[p]=tmp;i=p}else break}};
  const hpop=()=>{const top=heap[0],last=heap.pop();
    if(heap.length){heap[0]=last;let i=0;
      for(;;){const l=i*2+1,r=l+1;let m=i;
        if(l<heap.length&&less(heap[l],heap[m]))m=l;
        if(r<heap.length&&less(heap[r],heap[m]))m=r;
        if(m===i)break;const tmp=heap[i];heap[i]=heap[m];heap[m]=tmp;i=m}}
    return top};
  for(const rec of tris.values())
    if(rec.sea){spill[rec.tid]=rec.h;hpush(rec.tid)}
  while(heap.length){
    const u=hpop();
    if(settled[u])continue;
    settled[u]=1;
    const ur=tris.get(u);
    for(let si=0;si<3;si++){
      const v=neighborVia(ur,si);
      if(!v||settled[v.tid])continue;
      const cand=Math.max(v.h,spill[u]);
      if(cand<spill[v.tid]){
        spill[v.tid]=cand;downTid[v.tid]=u;downSide[v.tid]=ur.sides[si];
        hpush(v.tid);
      }
    }
  }
  // --- истоки (§6): седловины троек/перевалов, периметр подножий ---
  const passCells=new Set();
  if(S.world.passes)for(const p of S.world.passes)for(const c of p.cells)passCells.add(c);
  const isTripleSaddle=(rec)=>{
    if(rec.mtnN!==3||!S.mtnOwner)return false;
    const o=S.mtnOwner[rec.ci[0]];
    if(o<0||S.mtnOwner[rec.ci[1]]!==o||S.mtnOwner[rec.ci[2]]!==o)return false;
    return S.world.mountains[o]&&S.world.mountains[o].kind==='triple';
  };
  const cand=[];
  for(const rec of tris.values()){
    if(rec.water||downTid[rec.tid]<0)continue;
    let pr=0;
    if(rec.mtnN===3){if(isTripleSaddle(rec))pr=3;else continue}
    else if(rec.mtnN===2)pr=2;
    else if(rec.mtnN===1)pr=1;
    if(rec.ci.some(i2=>passCells.has(i2)))pr=Math.max(pr,2.5); // седловой треугольник перевала
    if(pr===0)continue;
    cand.push({rec,score:pr*10+rec.h*3+hash2(rec.x,rec.y,S.seed+55)*2});
  }
  cand.sort((a,b)=>(b.score-a.score)||(a.rec.tid-b.rec.tid));
  // истоков заметно больше минимума: притоки одного бассейна сливаются
  // в речные системы (конфлюэнции), а не текут дублирующимися линиями
  const want=Math.max(RV.want,Math.round(W/6));
  const springs=[];
  for(const c of cand){
    if(springs.length>=want)break;
    if(springs.some(s2=>cheb(c.rec.x,c.rec.y,s2.x,s2.y)<RV.minSpacing))continue;
    springs.push(c.rec);
  }
  S.riverStats.springs=springs.length;
  // --- фаза A: накопление потока по down-путям + entity рек ---
  const flow=new Float32Array(N2);
  const nodeOwner=new Int32Array(N2).fill(-1);
  const paths=[];
  for(let rid=0;rid<springs.length;rid++){
    const ent={id:rid,kind:'spring',parent:null,end:'dead',len:0};
    S.world.rivers.push(ent);
    const path=[];
    let cur=springs[rid].tid,alive=true,guard=0;
    while(cur>=0&&guard++<600){
      flow[cur]+=1;path.push(cur);
      if(flow[cur]>S.riverStats.flowMax)S.riverStats.flowMax=flow[cur];
      const rec=tris.get(cur);
      if(alive){
        if(nodeOwner[cur]>=0&&nodeOwner[cur]!==rid){ // конфлюэнция: влились в чужое русло
          ent.parent=nodeOwner[cur];ent.end='river';alive=false;
        }else if(rec.water){
          ent.end=rec.sea?'sea':'lake';alive=false;
        }else{
          nodeOwner[cur]=rid;ent.len=path.length;
        }
      }
      cur=downTid[cur];
    }
    paths.push(path);
  }
  // --- фаза B: отрисовка рёбер с финальными ширинами (идемпотентно) ---
  const bankTint=(rec)=>{
    const cnt={};
    for(const i2 of rec.ci){const t=S.terr[i2];if(t!==T.WATER)cnt[t]=(cnt[t]||0)+1}
    let best=T.GRASS,bv=0;
    for(const t in cnt)if(cnt[t]>bv){bv=cnt[t];best=+t}
    return best;
  };
  const riverRec=(rec)=>{
    let r=S.riverTris.get(rec.tid);
    if(!r){r={x:rec.x,y:rec.y,baseCol:rec.baseCol,or:rec.or,mask:0,tint:bankTint(rec),w:1,over:[]};
      S.riverTris.set(rec.tid,r)}
    return r;
  };
  const cornerW=(c)=>[WXC(c[0]),WYCC(c[0],c[1])];
  const sideMidW=(rec,si)=>{
    const a=cornerW(rec.corners[si]),b=cornerW(rec.corners[(si+1)%3]);
    return [(a[0]+b[0])/2,(a[1]+b[1])/2];
  };
  const triCenterW=(rec)=>{
    const ps=rec.corners.map(cornerW);
    return [(ps[0][0]+ps[1][0]+ps[2][0])/3,(ps[0][1]+ps[1][1]+ps[2][1])/3];
  };
  const wClass=(f)=>f>=RV.hugeAt?3:(f>=RV.wideAt?2:1);
  const lakeExits=new Set();
  for(let rid=0;rid<paths.length;rid++){
    const path=paths[rid];
    if(path.length<2)continue;
    // водопад на горном истоке
    const src=tris.get(path[0]);
    if(src.mtnN>=1){
      const rr=riverRec(src);
      if(!rr.over.some(o=>o.kind==='falls')){
        const c=triCenterW(src);
        rr.over.push({kind:'falls',wx:c[0],wy:c[1]});
      }
    }
    for(let s2=0;s2+1<path.length;s2++){
      const u=tris.get(path[s2]),v=tris.get(path[s2+1]);
      const sk=downSide[u.tid];
      if(sk<0)break;
      const a=Math.floor(sk/N),b=sk%N;
      if(S.terr[a]===T.WATER&&S.terr[b]===T.WATER)continue; // открытая вода: канала нет
      const isNew=!S.riverEdges.has(sk);
      S.riverEdges.add(sk);
      const w=wClass(flow[v.tid]);
      const ru=riverRec(u),rvv=riverRec(v);
      ru.mask|=(1<<u.sides.indexOf(sk));
      rvv.mask|=(1<<v.sides.indexOf(sk));
      if(w>ru.w)ru.w=w;
      if(w>rvv.w)rvv.w=w;
      if(isNew){
        if(!u.water&&v.water){ // устье: пена у кромки
          const m=sideMidW(u,u.sides.indexOf(sk));
          rvv.over.push({kind:'mouth',wx:m[0],wy:m[1]});
        }
        if(u.water&&!v.water)lakeExits.add(sk); // сток озера наружу
      }
    }
  }
  S.riverStats.outflows=lakeExits.size;
}
