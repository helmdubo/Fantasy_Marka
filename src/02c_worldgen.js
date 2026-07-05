/* ---------- ГЕНЕРАТОР МИРА v2 (полноценный WFC, docs/wfc-design.md) ----------
   Пайплайн: вороной-патчи (Poisson-диск + BFS) -> WFC №1 ролей патчей на
   нерегулярном графе (континент с морским краем по случайному азимуту) ->
   WFC №2 дискретных высот 0..6 на гексах (|Δh|<=1 — хребты и долины
   эмерджентны, solver в духе Loren Schmidt) -> WFC №3 террейна (9 тайлов,
   жёсткая матрица соседств: лес только через опушку, горы только через
   скалы) -> реки v2 по высотам -> entity -> валидация.
   Браузер: ОДНА попытка + полный трейс (S.wfcTrace) для пошагового
   просмотра (genViewer в 22_ui); фейл останавливает генерацию, о причине —
   в лог, новая попытка — кнопкой «Запуск». Headless: до 8 попыток. */

/* роли патчей (слой 1) */
const PR={SEA:0,LOW:1,WET:2,UP:3,HIGH:4,LAKE:5};
const PRNAME=['Море','Низина','Топь','Возвышенность','Нагорье','Озеро'];
/* внутренние тайлы слоя 3: T.* + узел хребта (в S.terr пишется как MTN) */
const WT_NODE=8;
const HEX_OPP=[1,0,5,4,3,2]; // встречные направления к порядку hexDirs (N,S,NE,NW,SE,SW)

function genWorld(){
  if(IS_BROWSER){ // дебаг-режим: одна попытка, трейс, стоп при фейле
    S.genError=genAttempt(true);
    if(S.genError)log('🌀 Генерация прервана: '+S.genError+'. Жми «Запуск» — новая попытка.');
    return;
  }
  for(let a=0;a<8;a++){
    S.genError=genAttempt(false);
    if(!S.genError)return;
    log('🌀 Картограф недоволен ('+S.genError+') — перекладывает карту…');
  }
}

function genAttempt(traceOn){
  const N=S.W*S.H;
  S.world={ranges:[],rivers:[],lakes:[],forests:[],ridgeNodes:[]};
  S.terr.fill(T.WATER);S.terrHp.fill(0);
  S.wfcTrace=traceOn?{stages:[]}:null;
  let err;
  if((err=wgPatches()))return err;
  if((err=wgHeights()))return err;
  if((err=wgTerrain()))return err;
  classifyWater();
  S.distCoast=wgBfsField(i=>S.terr[i]===T.WATER&&S.waterKind[i]===2);
  genRivers();
  classifyWater(); // тупиковые пруды рек становятся озёрами
  wgEntities();
  return wgValidate();
}

// multi-source BFS по гексам; seedFn(i)=true — источники (dist 0)
function wgBfsField(seedFn){
  const W=S.W,N=W*S.H;
  const d=new Int16Array(N).fill(32767);
  const q=[];
  for(let i=0;i<N;i++)if(seedFn(i)){d[i]=0;q.push(i)}
  for(let h2=0;h2<q.length;h2++){
    const c=q[h2],x=c%W,y=(c/W)|0;
    for(const dd of hexDirs(x)){
      const nx=x+dd[0],ny=y+dd[1];
      if(!inMap(nx,ny))continue;
      const ni=ny*W+nx;
      if(d[ni]>d[c]+1){d[ni]=d[c]+1;q.push(ni)}
    }
  }
  return d;
}
// соседи гекса для wfcSolve: [[j, dir 0..5], ...]
function wgHexNb(i){
  const W=S.W,x=i%W,y=(i/W)|0,out=[];
  const dirs=hexDirs(x);
  for(let d=0;d<6;d++){
    const nx=x+dirs[d][0],ny=y+dirs[d][1];
    if(inMap(nx,ny))out.push([ny*W+nx,d]);
  }
  return out;
}

/* --- слой 1: вороной-патчи + WFC ролей на графе --- */
function wgPatches(){
  const W=S.W,H=S.H,N=W*H;
  // Poisson-диск дротиками: сайты не ближе minDist (hex-метрика)
  const sites=[];
  for(let t=0;t<1200&&sites.length<WFC.maxSites;t++){
    const x=1+((S.rng()*(W-2))|0),y=1+((S.rng()*(H-2))|0);
    let ok=true;
    for(const s2 of sites)if(hexDist2(x,y,s2.x,s2.y)<WFC.minDist){ok=false;break}
    if(ok)sites.push({x,y});
  }
  const P=sites.length;
  if(P<12)return 'мало патчей ('+P+')';
  // приписка гексов к ближайшему сайту волной (границы органично рваные)
  S.patchOf=new Int16Array(N).fill(-1);
  {
    const q=[];
    sites.forEach((s2,pi)=>{const i=idx(s2.x,s2.y);S.patchOf[i]=pi;q.push(i)});
    for(let h2=0;h2<q.length;h2++){
      const c=q[h2],x=c%W,y=(c/W)|0;
      for(const d of hexDirs(x)){
        const nx=x+d[0],ny=y+d[1];
        if(!inMap(nx,ny))continue;
        const ni=ny*W+nx;
        if(S.patchOf[ni]<0){S.patchOf[ni]=S.patchOf[c];q.push(ni)}
      }
    }
  }
  // граф патчей: смежность, размер, центроид, касание края карты
  const adjSet=[],cellsN=new Int32Array(P),cx=new Float32Array(P),cy=new Float32Array(P),border=new Uint8Array(P);
  for(let p=0;p<P;p++)adjSet.push(new Set());
  for(let i=0;i<N;i++){
    const p=S.patchOf[i],x=i%W,y=(i/W)|0;
    cellsN[p]++;cx[p]+=x;cy[p]+=y;
    if(x===0||y===0||x===W-1||y===H-1)border[p]=1;
    for(const d of hexDirs(x)){
      const nx=x+d[0],ny=y+d[1];
      if(!inMap(nx,ny))continue;
      const p2=S.patchOf[ny*W+nx];
      if(p2!==p)adjSet[p].add(p2);
    }
  }
  for(let p=0;p<P;p++){cx[p]/=cellsN[p];cy[p]/=cellsN[p]}
  const pNb=adjSet.map(s2=>[...s2].map(j=>[j,0]));
  // континент: морской азимут — с той стороны море, противоположная — глубь материка
  const az=S.rng()*Math.PI*2,ux=Math.cos(az),uy=Math.sin(az);
  const proj=new Float32Array(P);
  for(let p=0;p<P;p++)proj[p]=((cx[p]-W/2)*ux+(cy[p]-H/2)*uy)/(W/2);
  // матрица смежности ролей (симметричная): HIGH только через UP, озеро не у моря
  const ok=(a,b)=>{
    const M=[
      [1,1,1,1,0,0],  // SEA:  SEA LOW WET UP
      [1,1,1,1,0,1],  // LOW
      [1,1,1,1,0,1],  // WET
      [1,1,1,1,1,1],  // UP
      [0,0,0,1,1,0],  // HIGH: UP HIGH
      [0,1,1,1,0,0]]; // LAKE: LOW WET UP
    return M[a][b];
  };
  const adj=[];
  for(let a=0;a<6;a++){let m=0;for(let b=0;b<6;b++)if(ok(a,b))m|=1<<b;adj.push([m])}
  const pins=new Map(),domains=new Uint16Array(P).fill(63);
  for(let p=0;p<P;p++){
    if(border[p]){
      if(proj[p]>0.12)pins.set(p,PR.SEA);          // морской край
      else domains[p]=63&~(1<<PR.LAKE);            // суша уходит за карту; озёра не режем краем
    }
  }
  { // гарантия нагорий: 1-2 пина вглубь материка (HIGH сам не выживает —
    // ему нужны ВСЕ соседи UP/HIGH, поэтому сеем узлы явно, свиту строит пропагация)
    let h1=-1,bv=1e9;
    for(let p=0;p<P;p++)if(!pins.has(p)&&proj[p]<bv){bv=proj[p];h1=p}
    if(h1>=0){pins.set(h1,PR.HIGH);
      if(S.rng()<0.6){
        let h2=-1,b2=1e9;
        for(let p=0;p<P;p++){
          if(pins.has(p)||proj[p]>0)continue;
          if(hexDist2(cx[h1]|0,cy[h1]|0,cx[p]|0,cy[p]|0)<W/3)continue;
          if(proj[p]<b2){b2=proj[p];h2=p}
        }
        if(h2>=0)pins.set(h2,PR.HIGH);
      }
    }
  }
  const ev=S.wfcTrace?[]:null;
  const roles=wfcSolve({
    n:P,numTiles:6,neighbors:(p)=>pNb[p],opposite:[0],adj,
    weights:(p)=>{
      const w=new Float32Array(6);
      // море: на краю с морской стороны — щедро, вглубь — быстро затухает
      // (иначе морской клин рассекает сушу пополам)
      w[PR.SEA]=border[p]?(proj[p]>0?0.15+proj[p]*3.4:0.03):Math.max(0.03,(proj[p]-0.18)*2.2);
      w[PR.LOW]=1.35;
      w[PR.WET]=0.5;
      w[PR.UP]=1.0;
      w[PR.HIGH]=Math.max(0.04,0.16-proj[p]*0.7); // нагорья тяготеют вглубь материка
      w[PR.LAKE]=0.28;
      return w;
    },
    pins,domains,rng:S.rng,backtrackLimit:WFC.btRoles,trace:ev,
  });
  if(!roles)return 'роли патчей не сошлись';
  S.patchRole=roles;S.patchN=P;
  if(S.wfcTrace)S.wfcTrace.stages.push({k:'roles',ev});
  // валидация слоя: доля моря, связность суши, нагорья
  let seaCells=0,high=0,lakes=0;
  for(let p=0;p<P;p++){
    if(roles[p]===PR.SEA)seaCells+=cellsN[p];
    else if(roles[p]===PR.HIGH)high++;
    else if(roles[p]===PR.LAKE)lakes++;
  }
  const seaFrac=seaCells/N;
  if(seaFrac<0.10)return 'море пересохло ('+(seaFrac*100|0)+'%)';
  if(seaFrac>0.45)return 'море затопило ('+(seaFrac*100|0)+'%)';
  if(!high)return 'нет нагорья';
  if(lakes>3)return 'озёр перебор';
  { // суша (не SEA) должна быть одним массивом на графе патчей
    const seen=new Uint8Array(P);let first=-1,cnt=0,tot=0;
    for(let p=0;p<P;p++)if(roles[p]!==PR.SEA){tot++;if(first<0)first=p}
    const q=[first];seen[first]=1;
    for(let h2=0;h2<q.length;h2++){cnt++;
      for(const [j] of pNb[q[h2]])if(!seen[j]&&roles[j]!==PR.SEA){seen[j]=1;q.push(j)}
    }
    if(cnt<tot)return 'суша рассечена морем';
  }
  return null;
}

/* --- слой 2: дискретные высоты 0..6, |Δh|<=1 (структура из локального правила) --- */
function wgHeights(){
  const W=S.W,H=S.H,N=W*H;
  const ROLE_TGT=[0,1.5,1.0,3.2,5.4,1]; // целевая высота роли
  // целевое поле: роль патча + сглаживание (склоны через границы патчей) + шум
  let tgt=new Float32Array(N);
  const isWater=new Uint8Array(N); // море и озёра — пин уровня
  for(let i=0;i<N;i++){
    const r=S.patchRole[S.patchOf[i]];
    tgt[i]=ROLE_TGT[r];
    if(r===PR.SEA||r===PR.LAKE)isWater[i]=1;
  }
  for(let pass=0;pass<6;pass++){
    const nt=new Float32Array(N);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=idx(x,y);
      if(isWater[i]){nt[i]=tgt[i];continue}
      let sum=tgt[i],n=1;
      for(const d of hexDirs(x)){
        const nx=x+d[0],ny=y+d[1];
        if(!inMap(nx,ny))continue;
        sum+=tgt[idx(nx,ny)];n++;
      }
      nt[i]=sum/n;
    }
    tgt=nt;
  }
  for(let i=0;i<N;i++)if(!isWater[i])tgt[i]+=(fbm((i%W)/9,((i/W)|0)/9,S.seed+41,3)-0.5)*1.6;
  // WFC: домен = уровень 0..6, сосед отличается максимум на 1
  const adj=[];
  for(let h=0;h<7;h++){
    let m=1<<h;
    if(h>0)m|=1<<(h-1);
    if(h<6)m|=1<<(h+1);
    adj.push([m,m,m,m,m,m]);
  }
  const pins=new Map(),domains=new Uint16Array(N).fill(127&~1); // суша: 1..6
  for(let i=0;i<N;i++)if(isWater[i]){
    const lake=S.patchRole[S.patchOf[i]]===PR.LAKE;
    domains[i]=127;pins.set(i,lake?1:0);
  }
  const ev=S.wfcTrace?[]:null;
  const res=wfcSolve({
    n:N,numTiles:7,neighbors:wgHexNb,opposite:HEX_OPP,adj,
    weights:(i)=>{
      const w=new Float32Array(7);
      for(let h=0;h<7;h++){const d=h-tgt[i];w[h]=Math.exp(-d*d/1.1)+0.02}
      return w;
    },
    pins,domains,rng:S.rng,backtrackLimit:WFC.btHeights,trace:ev,
  });
  if(!res)return 'высоты не сошлись';
  S.elevL=res;
  if(S.wfcTrace)S.wfcTrace.stages.push({k:'elev',ev});
  S.elev=new Float32Array(N);
  for(let i=0;i<N;i++)
    S.elev[i]=isWater[i]?0:res[i]/6+(fbm((i%W)/5,((i/W)|0)/5,S.seed+77,3)-0.5)*0.05;
  S.wgWater=isWater; // пригодится слою террейна
  return null;
}

/* --- слой 3: террейн (9 тайлов, жёсткая матрица, тонкие хребты) --- */
function wgTerrain(){
  const W=S.W,H=S.H,N=W*H;
  const NT=9; // T.WATER..T.MTN + WT_NODE (узел хребта)
  // допустимые пары (неориентированные, одинаковы по всем направлениям):
  // лес только через опушку; горы только через скалы; лес/горы не у воды
  const pairs=[
    [T.WATER,T.WATER],[T.WATER,T.SAND],[T.WATER,T.GRASS],[T.WATER,T.SWAMP],[T.WATER,T.ROCK],
    [T.SAND,T.SAND],[T.SAND,T.GRASS],[T.SAND,T.SCRUB],
    [T.SWAMP,T.SWAMP],[T.SWAMP,T.GRASS],[T.SWAMP,T.SCRUB],
    [T.GRASS,T.GRASS],[T.GRASS,T.SCRUB],[T.GRASS,T.ROCK],
    [T.SCRUB,T.SCRUB],[T.SCRUB,T.FOREST],[T.SCRUB,T.ROCK],
    [T.FOREST,T.FOREST],
    [T.ROCK,T.ROCK],[T.ROCK,T.MTN],[T.ROCK,WT_NODE],
    [T.MTN,T.MTN],[T.MTN,WT_NODE],[WT_NODE,WT_NODE],
  ];
  const mask=new Uint16Array(NT);
  for(const [a,b] of pairs){mask[a]|=1<<b;mask[b]|=1<<a}
  const adj=[];
  for(let t=0;t<NT;t++)adj.push([mask[t],mask[t],mask[t],mask[t],mask[t],mask[t]]);
  // домены: сужение по уровню высоты; пляж только у кромки моря
  const seaSide=new Uint8Array(N); // гекс граничит с морской водой
  for(let i=0;i<N;i++){
    if(!S.wgWater[i])continue;
    if(S.patchRole[S.patchOf[i]]===PR.LAKE)continue;
    const x=i%W,y=(i/W)|0;
    for(const d of hexDirs(x)){
      const nx=x+d[0],ny=y+d[1];
      if(inMap(nx,ny))seaSide[ny*W+nx]=1;
    }
  }
  const B=(...ts)=>ts.reduce((m,t)=>m|1<<t,0);
  const pins=new Map(),domains=new Uint16Array(N);
  for(let i=0;i<N;i++){
    if(S.wgWater[i]){domains[i]=(1<<NT)-1;pins.set(i,T.WATER);continue}
    const h=S.elevL[i];
    if(h<=1)domains[i]=B(T.GRASS,T.SCRUB,T.SWAMP,T.FOREST)|(seaSide[i]?B(T.SAND):0);
    else if(h===2)domains[i]=B(T.GRASS,T.SCRUB,T.FOREST);
    else if(h<=4)domains[i]=B(T.GRASS,T.SCRUB,T.FOREST,T.ROCK);
    else domains[i]=B(T.GRASS,T.ROCK,T.MTN,WT_NODE);
  }
  // веса: приор роли патча x шумовые кластеры x крутизна склона
  const ROLE_W=[]; // [role][tile]
  ROLE_W[PR.SEA]=ROLE_W[PR.LAKE]=null; // запинены водой
  ROLE_W[PR.LOW] =[0,0.9,0.06,1.9,0.45,0.8,0.3,0.8,0.02];
  ROLE_W[PR.WET] =[0,0.3,2.0,1.0,0.5,0.5,0.25,0.6,0.02];
  ROLE_W[PR.UP]  =[0,0.2,0.03,1.2,0.6,1.7,0.55,1.0,0.03];
  ROLE_W[PR.HIGH]=[0,0.1,0.01,0.8,0.3,0.5,1.9,2.2,0.07];
  const steep=new Uint8Array(N);
  for(let i=0;i<N;i++){
    const x=i%W,y=(i/W)|0;let s2=0;
    for(const d of hexDirs(x)){
      const nx=x+d[0],ny=y+d[1];
      if(inMap(nx,ny)&&Math.abs(S.elevL[idx(nx,ny)]-S.elevL[i])>=1)s2++;
    }
    steep[i]=s2;
  }
  const ev=S.wfcTrace?[]:null;
  const res=wfcSolve({
    n:N,numTiles:NT,neighbors:wgHexNb,opposite:HEX_OPP,adj,
    weights:(i)=>{
      const w=new Float32Array(NT);
      if(S.wgWater[i]){w[T.WATER]=1;return w}
      const base=ROLE_W[S.patchRole[S.patchOf[i]]]||ROLE_W[PR.LOW];
      const x=i%W,y=(i/W)|0;
      for(let t=0;t<NT;t++)w[t]=base[t];
      w[T.FOREST]*=0.4+1.8*fbm(x/6.5,y/6.5,S.seed+31,3);   // лесные кластеры
      w[T.ROCK]*=(0.5+1.4*fbm(x/5,y/5,S.seed+53,3))*(1+0.25*steep[i]); // скалы на склонах
      if(S.elevL[i]===6)w[T.MTN]*=1.8;                      // гребень
      return w;
    },
    pins,domains,rng:S.rng,backtrackLimit:WFC.btTerrain,trace:ev,
    // «тонкие хребты»: у MTN максимум 2 соседних пика; узел (WT_NODE) — до 4
    onCollapse:(c,tile,ban,tileAt)=>{
      if(tile!==T.MTN&&tile!==WT_NODE)return;
      const x=c%W,y=(c/W)|0;
      for(const d of hexDirs(x)){
        const nx=x+d[0],ny=y+d[1];
        if(!inMap(nx,ny))continue;
        const nb=ny*W+nx;
        if(tileAt(nb)>=0)continue; // уже схлопнут
        let mtnN=0;
        const nbx=nb%W,nby=(nb/W)|0;
        for(const d2 of hexDirs(nbx)){
          const mx=nbx+d2[0],my=nby+d2[1];
          if(!inMap(mx,my))continue;
          const t2=tileAt(my*W+mx);
          if(t2===T.MTN||t2===WT_NODE)mtnN++;
        }
        if(mtnN>=2)ban(nb,T.MTN);
        if(mtnN>=4)ban(nb,WT_NODE);
      }
    },
  });
  if(!res)return 'террейн не сошёлся';
  if(S.wfcTrace)S.wfcTrace.stages.push({k:'terr',ev});
  for(let i=0;i<N;i++){
    const t=res[i]===WT_NODE?T.MTN:res[i];
    S.terr[i]=t;
    if(res[i]===WT_NODE)S.world.ridgeNodes.push(i);
    if(t===T.FOREST)S.terrHp[i]=3;
  }
  return null;
}

/* --- entity: хребты/леса/озёра как floodfill-кластеры --- */
function wgEntities(){
  const W=S.W,N=W*S.H;
  const fill=(match)=>{
    const seen=new Uint8Array(N),out=[];
    for(let i=0;i<N;i++){
      if(seen[i]||!match(i))continue;
      const q=[i];seen[i]=1;
      for(let h2=0;h2<q.length;h2++){
        const c=q[h2],x=c%W,y=(c/W)|0;
        for(const d of hexDirs(x)){
          const nx=x+d[0],ny=y+d[1];
          if(!inMap(nx,ny))continue;
          const ni=ny*W+nx;
          if(!seen[ni]&&match(ni)){seen[ni]=1;q.push(ni)}
        }
      }
      out.push(q);
    }
    return out;
  };
  for(const cells of fill(i=>S.terr[i]===T.MTN)){
    if(cells.length<3)continue;
    const nodes=cells.map(i=>{
      const x=i%W,y=(i/W)|0;
      let deg=0;
      for(const d of hexDirs(x)){
        const nx=x+d[0],ny=y+d[1];
        if(inMap(nx,ny)&&S.terr[idx(nx,ny)]===T.MTN)deg++;
      }
      return {i,deg};
    });
    S.world.ranges.push({cells,nodes,spurs:[]});
  }
  for(const cells of fill(i=>S.terr[i]===T.FOREST))
    if(cells.length>=3)S.world.forests.push({cells});
  if(S.waterComps)for(let ci=0;ci<S.waterComps.length;ci++)
    if(S.waterComps[ci].sea===1)S.world.lakes.push({comp:ci,size:S.waterComps[ci].size});
}

/* --- валидация: инварианты мира, иначе фейл попытки --- */
function wgValidate(){
  const N=S.W*S.H;
  let water=0,sea=0,forest=0,mtn=0,rock=0,swamp=0,sand=0;
  for(let i=0;i<N;i++){
    const t=S.terr[i];
    if(t===T.WATER){water++;if(S.waterKind[i]===2)sea++}
    else if(t===T.FOREST)forest++;
    else if(t===T.MTN)mtn++;
    else if(t===T.ROCK)rock++;
    else if(t===T.SWAMP)swamp++;
    else if(t===T.SAND)sand++;
  }
  const land=N-water,landFrac=land/N;
  if(landFrac<0.5||landFrac>0.92)return 'суша '+(landFrac*100|0)+'%';
  if(!sea)return 'нет моря';
  if(mtn<12)return 'нет хребта';
  if(forest<40)return 'мало леса';
  if(forest>land*0.45)return 'лес заполонил';
  if(rock<14)return 'мало скал';
  if(swamp>land*0.10)return 'сплошная топь';
  if(sand>land*0.08)return 'сплошной пляж';
  if(!S.world.rivers.length&&S.riverStats.springs+S.riverStats.outflows<1)return 'нет рек';
  { // связность для ЖИТЕЛЕЙ (лес непроходим): крупнейший массив >= 75% проходимого
    const pass=(i)=>{const t=S.terr[i];return t!==T.WATER&&t!==T.MTN&&t!==T.FOREST};
    const seen=new Uint8Array(N);let tot=0,best=0;
    for(let i=0;i<N;i++)if(pass(i))tot++;
    for(let i=0;i<N;i++){
      if(seen[i]||!pass(i))continue;
      const q=[i];seen[i]=1;
      for(let h2=0;h2<q.length;h2++){
        const c=q[h2],x=c%S.W,y=(c/S.W)|0;
        for(const d of hexDirs(x)){
          const nx=x+d[0],ny=y+d[1];
          if(!inMap(nx,ny))continue;
          const ni=ny*S.W+nx;
          if(!seen[ni]&&pass(ni)){seen[ni]=1;q.push(ni)}
        }
      }
      if(q.length>best)best=q.length;
    }
    if(best<tot*0.75)return 'коридоры перекрыты';
  }
  return null;
}
