/* ---------- РЕЛЬЕФ (terrain handoff v2.0): кластеры гор, псевдовысоты, детекторы ----------
   Слой 1 (гексы) авторитетен: всё здесь — производное от S.terr.
   Кластеризация детерминирована (INV-T5): жадный порядок розетки -> тройки
   (с lookahead «не блокировать розетку 6/7») -> остаток (цепи / кольца /
   массивы / одиночки); tie-break — минимальный индекс клетки. Псевдовысоты (§5):
   ранги-источники -> chamfer-релаксация => поле E автоматически 1-Lipschitz
   (INV-T2), предгорья возникают сами. CDF-перераспределение высот (§8.2) ->
   S.elev для гидрологии. Детекторы паттернов (§7): котловины (flood fill
   равнины, замкнутой горами) и перевалы (один не-горный гекс между кластерами).
   Node-safe: никакого DOM/THREE. */

function hexAdjIdx(i){ // индексы 6 соседей гекса (в пределах карты)
  const W=S.W,x=i%W,y=(i/W)|0,out=[];
  for(const d of hexDirs(x)){
    const nx=x+d[0],ny=y+d[1];
    if(inMap(nx,ny))out.push(ny*W+nx);
  }
  return out;
}

/* --- жадная детерминированная кластеризация горных гексов (§3) ---
   isMtn(i) — предикат «гора»: истина мира ЛИБО knowledge-слой (§4), поэтому
   один и тот же код обслуживает симуляцию и прогрессивную разведку. */
function mclusterDetect(isMtn){
  const N=S.W*S.H;
  const owner=new Int16Array(N).fill(-1);
  const clusters=[];
  const claim=(cells,kind,extra)=>{
    const id=clusters.length;
    for(const c of cells)owner[c]=id;
    clusters.push(Object.assign({id,kind,cells,anchor:cells[0]},extra));
    return id;
  };
  // 1) розетки ★: гекс + все 6 соседей одного слоя, все свободны
  for(let i=0;i<N;i++){
    if(!isMtn(i)||owner[i]>=0)continue;
    const nb=hexAdjIdx(i);
    if(nb.length<6)continue;
    if(nb.some(n=>!isMtn(n)||owner[n]>=0))continue;
    claim([i].concat(nb),'rosette',{center:i,ring:nb.slice()});
  }
  // lookahead (§3, открытый вопрос решён «да»): потенциальная розетка 6/7 —
  // центр, у которого из 7 клеток известны горами >=6 и ни одна не расклеймлена.
  // Тройка, отбирающая клетку у такого кандидата, пропускается: при дальнейшей
  // разведке (или достройке) розетка ещё может материализоваться.
  const nearRosette=(c)=>{
    const cand=[c].concat(hexAdjIdx(c));
    for(const h of cand){
      const nb=hexAdjIdx(h);
      if(nb.length<6)continue;
      const cells=[h].concat(nb);
      if(cells.indexOf(c)<0)continue;
      let have=0,free=true;
      for(const q of cells){
        if(owner[q]>=0){free=false;break}
        if(isMtn(q))have++;
      }
      if(free&&have>=6)return true;
    }
    return false;
  };
  // 2) тройки ▲ (узел/седловина): 3 взаимно смежных гекса — углы одного
  // dual-треугольника; канонический перебор от минимального индекса
  for(let i=0;i<N;i++){
    if(!isMtn(i)||owner[i]>=0)continue;
    const nb=hexAdjIdx(i).filter(n=>n>i&&isMtn(n)&&owner[n]<0).sort((a,b)=>a-b);
    let done=false;
    for(let a=0;a<nb.length&&!done;a++)for(let b=a+1;b<nb.length&&!done;b++){
      const n1=nb[a],n2=nb[b];
      if(hexDist2(n1%S.W,(n1/S.W)|0,n2%S.W,(n2/S.W)|0)!==1)continue;
      if(owner[n1]>=0||owner[n2]>=0)continue;
      if(nearRosette(i)||nearRosette(n1)||nearRosette(n2))continue;
      claim([i,n1,n2],'triple',{});
      done=true;
    }
  }
  // 3) остаток: компоненты свободных горных гексов
  const seen=new Uint8Array(N);
  for(let i=0;i<N;i++){
    if(!isMtn(i)||owner[i]>=0||seen[i])continue;
    const comp=[i];seen[i]=1;
    for(let q=0;q<comp.length;q++)
      for(const n of hexAdjIdx(comp[q]))
        if(isMtn(n)&&owner[n]<0&&!seen[n]){seen[n]=1;comp.push(n)}
    comp.sort((a,b)=>a-b);
    if(comp.length===1){claim(comp,'single',{});continue}
    const deg=new Map();
    let maxDeg=0;
    for(const c of comp){
      let d=0;
      for(const n of hexAdjIdx(c))if(isMtn(n)&&owner[n]<0)d++;
      deg.set(c,d);
      if(d>maxDeg)maxDeg=d;
    }
    const ends=comp.filter(c=>deg.get(c)<=1).sort((a,b)=>a-b);
    if(maxDeg<=2&&ends.length===2){
      // цепь-хребет: полилиния по центрам от меньшего конца
      const path=[ends[0]];
      const used=new Set(path);
      while(path.length<comp.length){
        const cur=path[path.length-1];
        let nxt=-1;
        for(const n of hexAdjIdx(cur))
          if(isMtn(n)&&owner[n]<0&&!used.has(n)){nxt=n;break}
        if(nxt<0)break;
        used.add(nxt);path.push(nxt);
      }
      // «плечи»: конец цепи, смежный с занятым кластером, тянется к его якорю
      const arms=[];
      for(const e of [path[0],path[path.length-1]])
        for(const n of hexAdjIdx(e))
          if(owner[n]>=0){arms.push({from:e,to:owner[n]});break}
      claim(path,'chain',{arms});
    }else if(maxDeg===2&&ends.length===0&&comp.length>=3){
      claim(comp,'ringChain',{}); // кольцевая цепь (пограничный случай §10.2)
    }else{
      claim(comp,'massif',{});
    }
  }
  return {clusters,owner};
}

/* --- псевдовысоты (§5): E = max по источникам (ранг − шаги), chamfer --- */
function reliefField(det){
  const W=S.W,N=W*S.H;
  const RANK=CFG.RELIEF.RANK;
  const E=new Float32Array(N);
  for(const cl of det.clusters){
    if(cl.kind==='rosette'){
      E[cl.center]=RANK.peak;
      for(const c of cl.ring)E[c]=Math.max(E[c],RANK.ring);
    }else{
      const r=RANK[cl.kind]||RANK.single;
      for(const c of cl.cells)E[c]=Math.max(E[c],r);
    }
  }
  // chamfer-релаксация: чередующиеся проходы E=max(E, maxNeighbor−1).
  // Вода — плоский ноль (озёра плоские, §7) и не проводит рельеф.
  for(let pass=0;pass<4;pass++){
    const fwd=(pass%2===0);
    for(let k=0;k<N;k++){
      const i=fwd?k:N-1-k;
      if(S.terr[i]===T.WATER){E[i]=0;continue}
      const x=i%W,y=(i/W)|0;
      let m=E[i];
      for(const d of hexDirs(x)){
        const nx=x+d[0],ny=y+d[1];
        if(!inMap(nx,ny))continue;
        const v=E[ny*W+nx]-1;
        if(v>m)m=v;
      }
      E[i]=m;
    }
  }
  return E;
}

/* --- детектор котловины (§7): равнина, полностью замкнутая горами --- */
function detectBasins(){
  const W=S.W,H=S.H,N=W*H;
  const out=new Uint8Array(N); // достижимо от края карты, не пересекая гор
  const q=[];
  const push=(i)=>{if(S.terr[i]!==T.MTN&&!out[i]){out[i]=1;q.push(i)}};
  for(let x=0;x<W;x++){push(idx(x,0));push(idx(x,H-1))}
  for(let y=0;y<H;y++){push(idx(0,y));push(idx(W-1,y))}
  for(let h2=0;h2<q.length;h2++)
    for(const n of hexAdjIdx(q[h2]))
      if(S.terr[n]!==T.MTN&&!out[n]){out[n]=1;q.push(n)}
  S.world.valleys=[];
  const seen=new Uint8Array(N);
  for(let i=0;i<N;i++){
    if(S.terr[i]===T.MTN||out[i]||seen[i])continue;
    const comp=[i];seen[i]=1;
    const ringSet=new Set();
    let hasLake=false;
    for(let h2=0;h2<comp.length;h2++){
      const c=comp[h2];
      if(S.terr[c]===T.WATER)hasLake=true;
      for(const n of hexAdjIdx(c)){
        if(S.terr[n]===T.MTN)ringSet.add(n);
        else if(!out[n]&&!seen[n]){seen[n]=1;comp.push(n)}
      }
    }
    comp.sort((a,b)=>a-b);
    // скрытая котловина — «секрет» (§4): открывается, когда разведано всё кольцо
    S.world.valleys.push({cells:comp,ring:[...ringSet].sort((a,b)=>a-b),
      hasLake,discovered:false});
  }
}

/* --- детектор перевала (§7): ровно один не-горный гекс между кластерами --- */
function detectPasses(det){
  const N=S.W*S.H;
  S.world.passes=[];
  const big=(id)=>id>=0&&det.clusters[id].cells.length>=3; // пики/хребты, не одиночки
  const raw=new Map(); // 'a:b' -> клетки прохода между кластерами a и b
  for(let i=0;i<N;i++){
    const t=S.terr[i];
    if(t===T.MTN||t===T.WATER)continue;
    const ids=new Set();
    for(const n of hexAdjIdx(i))
      if(S.terr[n]===T.MTN&&big(det.owner[n]))ids.add(det.owner[n]);
    if(ids.size<2)continue;
    const arr=[...ids].sort((a,b)=>a-b);
    for(let a=0;a<arr.length;a++)for(let b=a+1;b<arr.length;b++){
      const k=arr[a]+':'+arr[b];
      if(!raw.has(k))raw.set(k,[]);
      raw.get(k).push(i);
    }
  }
  for(const [k,cells] of raw){
    const ab=k.split(':');
    S.world.passes.push({a:+ab[0],b:+ab[1],cells});
  }
}

/* --- мега-вершины: достраиваем розетки ★ к хребтам-«снежинкам» --- */
function wgPeaks(){
  const W=S.W;
  let maxDc=0;for(const v of S.distCoast)if(v<32767&&v>maxDc)maxDc=v;
  const placed=[];
  const rosetteCells=(cx,cy)=>{ // 7 клеток розетки; null, если не влезает
    if(!inMap(cx,cy))return null;
    const cells=[idx(cx,cy)];
    for(const d of hexDirs(cx)){
      const nx=cx+d[0],ny=cy+d[1];
      if(!inMap(nx,ny))return null;
      cells.push(idx(nx,ny));
    }
    for(const c of cells){
      if(S.terr[c]===T.WATER)return null;
      if(S.distCoast[c]<Math.max(4,maxDc*0.3))return null;
      if(S.bld&&S.bld[c]>=0)return null;
    }
    for(const p of placed)if(cheb(cx,cy,p.x,p.y)<10)return null;
    return cells;
  };
  const tryPeak=(cx,cy)=>{
    const cells=rosetteCells(cx,cy);
    if(!cells)return false;
    for(const c of cells){S.terr[c]=T.MTN;S.terrHp[c]=0}
    placed.push({x:cx,y:cy});
    return true;
  };
  const want=1+((S.rng()*2)|0); // 1-2 пика на карту
  // 1) у концов хребтов: мега-вершина замыкает цепь (пограничный случай §10.2)
  for(const rg of S.world.ranges){
    if(placed.length>=want)break;
    for(const endI of [rg.cells[0],rg.cells[rg.cells.length-1]]){
      if(placed.length>=want)break;
      const ex=endI%W,ey=(endI/W)|0;
      let done=false;
      for(const d of hexDirs(ex)){ // центр розетки — сосед конца цепи
        if(tryPeak(ex+d[0],ey+d[1])){done=true;break}
      }
      if(done)break;
    }
  }
  // 2) добор: одиночные пики в глубинке
  for(let t=0;t<300&&placed.length<want;t++){
    const x=4+((S.rng()*(S.W-8))|0),y=4+((S.rng()*(S.H-8))|0);
    if(S.distCoast[idx(x,y)]<maxDc*0.45)continue;
    tryPeak(x,y);
  }
}

/* --- влажность (§8.3): chamfer-расстояние до пресной воды + биомы --- */
function wgMoisture(){
  const W=S.W,N=W*S.H;
  const R=CFG.RELIEF.MOIST_R;
  // источники влаги: озёра (пресные) и оба берега речных рёбер
  const dist=new Int16Array(N).fill(32767);
  const q=[];
  for(let i=0;i<N;i++)
    if(S.terr[i]===T.WATER&&S.waterKind[i]===1){dist[i]=0;q.push(i)}
  if(S.riverEdges)for(const k of S.riverEdges){
    const a=Math.floor(k/N),b=k%N;
    for(const c of [a,b])
      if(dist[c]!==0&&S.terr[c]!==T.WATER){dist[c]=0;q.push(c)}
  }
  for(let h2=0;h2<q.length;h2++){
    const c=q[h2],x=c%W,y=(c/W)|0;
    for(const d of hexDirs(x)){
      const nx=x+d[0],ny=y+d[1];
      if(!inMap(nx,ny))continue;
      const ni=ny*W+nx;
      if(dist[ni]>dist[c]+1){dist[ni]=dist[c]+1;q.push(ni)}
    }
  }
  S.moist=new Float32Array(N);
  for(let i=0;i<N;i++)S.moist[i]=S.terr[i]===T.WATER?1:clamp(1-dist[i]/R,0,1);
  // биомы: 2D-таблица Уиттекера (пояс высоты E x влажность) — тайга/степь/
  // болото без новых механизмов, биом лишь двигает приоры WFC и фичи
  S.biome=new Uint8Array(N);
  for(let i=0;i<N;i++){
    const t=S.terr[i];
    if(t===T.WATER||t===T.MTN)continue;
    const E=S.reliefE[i],m=S.moist[i];
    if(E>=1.5)S.biome[i]=(m<0.25?BIO.STEPPE:(m>=0.55?BIO.TAIGA:BIO.MEADOW));
    // болото: у самой пресной воды И в низине (нижний пояс CDF-высот)
    else S.biome[i]=(m>=0.9&&S.elev[i]<0.3?BIO.SWAMP:(m<0.15?BIO.STEPPE:BIO.MEADOW));
  }
}

/* --- сборка рельефа мира: кластеры, E, CDF-высота, детекторы --- */
function wgRelief(){
  const N=S.W*S.H;
  const det=mclusterDetect(i=>S.terr[i]===T.MTN);
  S.world.mountains=det.clusters;
  S.mtnOwner=det.owner;
  S.reliefE=reliefField(det);
  detectBasins();
  detectPasses(det);
  // высота для гидрологии: прибрежный градиент + доминирующий рельеф,
  // затем CDF-перераспределение (§8.2): доля высоких поясов — дизайнерский
  // параметр (CFG.RELIEF.CDF_POW), не случайность генератора
  let maxDc=1;for(const v of S.distCoast)if(v<32767&&v>maxDc)maxDc=v;
  const raw=new Float32Array(N);
  for(let i=0;i<N;i++)
    raw[i]=S.terr[i]===T.WATER?0
      :0.30*(S.distCoast[i]/maxDc)+0.70*(S.reliefE[i]/CFG.RELIEF.RANK.peak);
  S.elev=new Float32Array(N);
  const land=[];
  for(let i=0;i<N;i++)if(S.terr[i]!==T.WATER)land.push(i);
  land.sort((a,b)=>(raw[a]-raw[b])||(a-b));
  const n1=Math.max(1,land.length-1);
  for(let k=0;k<land.length;k++){
    const p=k/n1;
    S.elev[land[k]]=1-Math.pow(1-p,CFG.RELIEF.CDF_POW);
  }
}
