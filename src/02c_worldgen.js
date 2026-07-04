/* ---------- ГЕНЕРАТОР МИРА (WFC + граф-скелеты) ----------
   Пайплайн: остров (море со всех сторон) -> озёра среднего пояса ->
   горные хребты-«снежинки» (тонкие цепи с отрогами, граф-entity) ->
   поле высоты (от берега к хребту) -> реки деревом parent/child по
   dual-сетке -> WFC-заполнение GRASS/FOREST/ROCK: волна идёт ОТ КОНТУРОВ
   (вода/горы/поймы) к незаполненным клеткам, вес тайла = зональный приор
   (кольца от берега, предгорья, поймы) x аффинность уже схлопнутых
   соседей (лес липнет к лесу — кластеры). Противоречий нет: правила
   мягкие, GRASS — универсальный запасной тайл.
   Все структуры остаются как entity в S.world (хребты/реки/озёра/леса). */

function genWorld(){
  const W=S.W,H=S.H,N=W*H;
  for(let attempt=0;attempt<5;attempt++){
    S.world={ranges:[],rivers:[],lakes:[],forests:[]};
    wgIsland();
    wgLakes();
    classifyWater();
    wgRidges();
    wgElevation();
    genRivers();       // реки v2 (рёберные), высоту берут из S.elev
    classifyWater();   // тупиковые пруды рек становятся озёрами
    wgFill();
    wgEntities();
    const err=wgValidate();
    if(!err)return;
    log('🌀 Картограф недоволен ('+err+') — перекладывает карту…');
  }
}

/* --- 1. остров: море по краям, суша к центру --- */
function wgIsland(){
  const W=S.W,H=S.H,N=W*H;
  const cx=W/2+((S.rng()*2-1)*W*0.06),cy=H/2+((S.rng()*2-1)*H*0.06);
  const maxR=Math.min(W,H)*0.5;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const dx=(x-cx)/maxR,dy=(y-cy)/maxR;
    const d=Math.hypot(dx,dy);
    const n=fbm(x/23,y/23,S.seed,4);
    const v=(1-d)*0.9+(n-0.5)*0.55;
    S.terr[idx(x,y)]=(v>0.18&&x>2&&y>2&&x<W-3&&y<H-3)?T.GRASS:T.WATER;
  }
  // оставить только крупнейший массив суши — «один остров»
  const comp=new Int32Array(N).fill(-1);
  const sizes=[];
  for(let i=0;i<N;i++){
    if(S.terr[i]===T.WATER||comp[i]>=0)continue;
    const id=sizes.length,q=[i];comp[i]=id;
    for(let h2=0;h2<q.length;h2++){
      const c=q[h2],x=c%W,y=(c/W)|0;
      for(const d of hexDirs(x)){
        const nx=x+d[0],ny=y+d[1];
        if(!inMap(nx,ny))continue;
        const ni=ny*W+nx;
        if(comp[ni]<0&&S.terr[ni]!==T.WATER){comp[ni]=id;q.push(ni)}
      }
    }
    sizes.push(q.length);
  }
  let big=0;for(let i2=1;i2<sizes.length;i2++)if(sizes[i2]>sizes[big])big=i2;
  for(let i=0;i<N;i++)if(comp[i]>=0&&comp[i]!==big)S.terr[i]=T.WATER;
  // поле расстояния от МОРЯ (кольца зон)
  S.distCoast=wgBfsField(i=>S.terr[i]===T.WATER);
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

/* --- 2. озёра: котловины среднего пояса, у берега почти не встречаются --- */
function wgLakes(){
  const W=S.W,H=S.H;
  let maxDc=0;for(const v of S.distCoast)if(v<32767&&v>maxDc)maxDc=v;
  const want=1+((S.rng()*3)|0);
  const placed=[];
  for(let t=0;t<200&&placed.length<want;t++){
    const x=4+((S.rng()*(W-8))|0),y=4+((S.rng()*(H-8))|0);
    const i=idx(x,y);
    if(S.terr[i]===T.WATER)continue;
    const dc=S.distCoast[i];
    if(dc<Math.max(5,maxDc*0.3)||dc>maxDc*0.75)continue; // средний пояс
    if(placed.some(p=>cheb(x,y,p.x,p.y)<14))continue;
    const r=1+((S.rng()*2)|0);
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      const nx=x+dx,ny=y+dy;
      if(inMap(nx,ny)&&cheb(nx,ny,x,y)<=r&&S.rng()<0.85)S.terr[idx(nx,ny)]=T.WATER;
    }
    placed.push({x,y});
  }
}

/* --- 3. хребты-«снежинки»: тонкие цепи с отрогами, узлы по степени --- */
function wgRidges(){
  const W=S.W,H=S.H;
  let maxDc=0,core=-1;
  for(let i=0;i<W*H;i++)if(S.terr[i]!==T.WATER&&S.distCoast[i]>maxDc){maxDc=S.distCoast[i];core=i}
  if(core<0)return;
  const canMtn=(x,y,prev)=>{ // «тонкость»: новый пик соседствует только с хвостом цепи
    if(!inMap(x,y))return false;
    const i=idx(x,y);
    if(S.terr[i]!==T.GRASS)return false;
    if(S.distCoast[i]<Math.max(4,maxDc*0.35))return false; // хребты не лезут к морю
    for(const d of hexDirs(x)){
      const nx=x+d[0],ny=y+d[1];
      if(!inMap(nx,ny))continue;
      const ni=idx(nx,ny);
      if(S.terr[ni]===T.MTN&&ni!==prev)return false;
    }
    return true;
  };
  const growChain=(sx,sy,len,bias,attach)=>{
    const cells=[];
    let x=sx,y=sy,prev=(attach!==undefined?attach:-1);
    for(let s2=0;s2<len;s2++){
      if(!canMtn(x,y,prev))break;
      const i=idx(x,y);
      S.terr[i]=T.MTN;S.terrHp[i]=0;
      cells.push(i);prev=i;
      // следующий шаг: вглубь острова с инерцией направления
      let best=null,bv=-1e9;
      for(const d of hexDirs(x)){
        const nx=x+d[0],ny=y+d[1];
        if(!canMtn(nx,ny,prev))continue;
        let v=S.distCoast[idx(nx,ny)]+S.rng()*2.2;
        if(bias)v+=(d[0]*bias[0]+d[1]*bias[1])*1.6; // отрог держит направление
        if(v>bv){bv=v;best={x:nx,y:ny}}
      }
      if(!best)break;
      x=best.x;y=best.y;
    }
    return cells;
  };
  const mkRange=(sx,sy)=>{
    const main=growChain(sx,sy,Math.round(W/9)+((S.rng()*8)|0),null);
    if(main.length<4)return null;
    const range={cells:main.slice(),spurs:[]};
    // отроги от начала, середины и конца хребта (по форме — «снежинка»)
    for(const at of [0,(main.length*0.33)|0,(main.length*0.66)|0,main.length-1]){
      if(S.rng()<0.2)continue;
      const i=main[at],x=i%W,y=(i/W)|0;
      const dirs=hexDirs(x);
      const d0=dirs[(S.rng()*6)|0];
      const spur=growChain(x+d0[0],y+d0[1],2+((S.rng()*4)|0),d0,i);
      if(spur.length){range.cells.push(...spur);range.spurs.push(spur)}
    }
    // классификация узлов по числу гребней (1 конец / 2 промежуточный / 3+ центральный)
    range.nodes=range.cells.map(i=>{
      const x=i%W,y=(i/W)|0;
      let deg=0;
      for(const d of hexDirs(x)){
        const nx=x+d[0],ny=y+d[1];
        if(inMap(nx,ny)&&S.terr[idx(nx,ny)]===T.MTN)deg++;
      }
      return {i,deg};
    });
    S.world.ranges.push(range);
    return range;
  };
  const cx=core%W,cy=(core/W)|0;
  mkRange(cx,cy);
  // 1-2 вторичные цепи в глубинке, поодаль от главной
  const extra=1+((S.rng()*2)|0);
  for(let e=0;e<extra;e++){
    let best=-1,bv=-1;
    for(let t=0;t<300;t++){
      const x=6+((S.rng()*(W-12))|0),y=6+((S.rng()*(H-12))|0);
      const i=idx(x,y);
      if(S.terr[i]!==T.GRASS)continue;
      const dc=S.distCoast[i];
      if(dc<Math.max(5,maxDc*0.4))continue;
      let farRidge=true;
      for(const rg of S.world.ranges)for(const c of rg.cells)
        if(cheb(x,y,c%W,(c/W)|0)<10){farRidge=false;break}
      if(!farRidge)continue;
      if(dc>bv){bv=dc;best=i}
    }
    if(best>=0)mkRange(best%W,(best/W)|0);
  }
}

/* --- 4. высота: от берега вверх к хребту (реки текут строго вниз) --- */
function wgElevation(){
  const N=S.W*S.H;
  const dr=wgBfsField(i=>S.terr[i]===T.MTN);
  let maxDc=1;for(const v of S.distCoast)if(v<32767&&v>maxDc)maxDc=v;
  S.elev=new Float32Array(N);
  for(let i=0;i<N;i++){
    if(S.terr[i]===T.WATER){S.elev[i]=0;continue}
    const ridge=dr[i]>=32767?0:Math.max(0,1-dr[i]/16);
    S.elev[i]=0.42*(S.distCoast[i]/maxDc)+0.58*ridge;
  }
}

/* --- 5. WFC-заполнение: волна от контуров, мягкие правила соседства --- */
function wgFill(){
  const W=S.W,H=S.H,N=W*H;
  let maxDc=1;for(const v of S.distCoast)if(v<32767&&v>maxDc)maxDc=v;
  const dr=wgBfsField(i=>S.terr[i]===T.MTN);
  const TILES=[T.GRASS,T.FOREST,T.ROCK];
  const fixed=new Uint8Array(N); // контуры: вода и горы уже «схлопнуты»
  for(let i=0;i<N;i++)if(S.terr[i]===T.WATER||S.terr[i]===T.MTN)fixed[i]=1;
  // зональные приоры (кольца от берега, предгорья, поймы, берега озёр)
  const prior=(i)=>{
    const x=i%W,y=(i/W)|0;
    const dc=S.distCoast[i],drr=dr[i];
    let g=1.5,f=0.52,r=0.24;
    if(dc<=5){f*=0.35;r*=(dc<=2?2.2:0.6)}         // прибрежье: луга, утёсы у кромки
    else if(drr>6){f*=1.45}                         // средний пояс: лесные кластеры
    if(drr<=3){r*=3.4;f*=0.45}                      // предгорья: скалы-холмы
    let lake=false,sea=false;
    for(const d of hexDirs(x)){
      const nx=x+d[0],ny=y+d[1];
      if(!inMap(nx,ny))continue;
      const ni=idx(nx,ny);
      if(S.terr[ni]===T.WATER)(S.waterKind[ni]===1?lake=true:sea=true);
    }
    if(lake){r*=1.6;f*=0.6}                         // скалы у озёр
    if(cellNearRiver(x,y)){g*=3.2;f*=0.4;r*=0.3}    // поймы: луга вдоль рек
    return [g,f,r];
  };
  // волна: BFS-кольца от контуров к пустым областям (приоритет по фронту)
  const order=[];
  {
    const dist=new Int16Array(N).fill(32767);
    const q=[];
    for(let i=0;i<N;i++)if(fixed[i]){dist[i]=0;q.push(i)}
    for(let h2=0;h2<q.length;h2++){
      const c=q[h2],x=c%W,y=(c/W)|0;
      for(const d of hexDirs(x)){
        const nx=x+d[0],ny=y+d[1];
        if(!inMap(nx,ny))continue;
        const ni=ny*W+nx;
        if(dist[ni]>dist[c]+1){dist[ni]=dist[c]+1;q.push(ni);order.push(ni)}
      }
    }
    // добить недостижимые (не бывает, но на всякий случай)
    for(let i=0;i<N;i++)if(!fixed[i]&&dist[i]===32767)order.push(i);
  }
  const done=new Uint8Array(N);
  for(const i of order){
    if(fixed[i]||done[i])continue;
    done[i]=1;
    const [pg,pf,pr]=prior(i);
    let wg=pg,wf=pf,wr=pr;
    const x=i%W,y=(i/W)|0;
    for(const d of hexDirs(x)){ // аффинность уже схлопнутых соседей
      const nx=x+d[0],ny=y+d[1];
      if(!inMap(nx,ny))continue;
      const t=S.terr[idx(nx,ny)];
      if(t===T.FOREST){wf*=1.6;wr*=0.75}
      else if(t===T.ROCK){wr*=1.75;wf*=0.8}
      else if(t===T.MTN){wr*=1.5;wf*=0.5}
    }
    let roll=S.rng()*(wg+wf+wr);
    let t;
    if((roll-=wg)<0)t=T.GRASS;
    else if((roll-=wf)<0)t=T.FOREST;
    else t=T.ROCK;
    S.terr[i]=t;
    if(t===T.FOREST)S.terrHp[i]=3;
  }
  // релаксация: укрупняем кластеры (одинокий лес -> луг, плотное окружение -> лес).
  // Лес станет непроходимым — нужны цельные массивы с коридорами, а не крапинки.
  for(let pass=0;pass<2;pass++){
    const snap=S.terr.slice();
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=idx(x,y);
      const t=snap[i];
      if(t!==T.GRASS&&t!==T.FOREST)continue;
      let f=0,n=0;
      for(const d of hexDirs(x)){
        const nx=x+d[0],ny=y+d[1];
        if(!inMap(nx,ny))continue;
        n++;
        if(snap[idx(nx,ny)]===T.FOREST)f++;
      }
      if(t===T.FOREST&&f<=1){S.terr[i]=T.GRASS;S.terrHp[i]=0}
      else if(t===T.GRASS&&f>=4){S.terr[i]=T.FOREST;S.terrHp[i]=3}
    }
  }
}

/* --- 6. entity: леса и озёра как floodfill-кластеры --- */
function wgEntities(){
  const W=S.W,N=W*S.H;
  const seen=new Uint8Array(N);
  for(let i=0;i<N;i++){
    if(seen[i]||S.terr[i]!==T.FOREST)continue;
    const q=[i];seen[i]=1;
    for(let h2=0;h2<q.length;h2++){
      const c=q[h2],x=c%W,y=(c/W)|0;
      for(const d of hexDirs(x)){
        const nx=x+d[0],ny=y+d[1];
        if(!inMap(nx,ny))continue;
        const ni=ny*W+nx;
        if(!seen[ni]&&S.terr[ni]===T.FOREST){seen[ni]=1;q.push(ni)}
      }
    }
    if(q.length>=3)S.world.forests.push({cells:q.slice()});
  }
  if(S.waterComps)for(let ci=0;ci<S.waterComps.length;ci++)
    if(S.waterComps[ci].sea===1)S.world.lakes.push({comp:ci,size:S.waterComps[ci].size});
}

/* --- 7. валидация: инварианты мира, иначе retry --- */
function wgValidate(){
  const N=S.W*S.H;
  let land=0,forest=0,mtn=0,rock=0;
  for(let i=0;i<N;i++){
    const t=S.terr[i];
    if(t!==T.WATER)land++;
    if(t===T.FOREST)forest++;
    if(t===T.MTN)mtn++;
    if(t===T.ROCK)rock++;
  }
  const landFrac=land/N;
  if(landFrac<0.30||landFrac>0.72)return 'суша '+(landFrac*100|0)+'%';
  if(mtn<20)return 'нет хребта';
  if(forest<50)return 'мало леса';
  if(forest>land*0.42)return 'лес заполонил';
  if(rock<20)return 'мало холмов';
  if(!S.world.rivers.length&&S.riverStats.springs+S.riverStats.outflows<1)return 'нет рек';
  return null;
}
