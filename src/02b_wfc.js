/* ---------- WFC-СОЛВЕР (общий для всех слоёв генерации) ----------
   Классический constraint-solver: домен-битмаска возможных тайлов на
   клетку, матрица допустимых соседств, выбор клетки с минимальной
   энтропией Шеннона, AC-4-пропагация (счётчики enabler'ов, O(1) на
   удаление), при пустом домене — бэктрекинг с лимитом откатов.
   Сетко-независим: клетки — индексы 0..n-1, соседство — колбэк.
   Работает и в Node (headless), DOM не трогает.

   wfcSolve({
     n, numTiles, neighbors(i)=>[[j,dirTag],...],
       dirTag выбирает adj-маску; обратные рёбра находятся автоматически
       (граф может иметь любую степень и один dirTag на все рёбра),
     adj[t][dirTag]=битмаска допустимых тайлов соседа via dirTag,
       симметрия обязательна: bit(adj[t][d],u) === bit(adj[u][rev d],t),
     weights(i)=>Float32Array[numTiles],   // веса зависят от позиции
     domains?: Uint16Array(n),             // стартовое сужение доменов
     pins?: Map(i->tile),
     rng, backtrackLimit,
     onCollapse?: (cell,tile,ban,tileAt)=>void, // кастом-ограничения;
       tileAt(i) = схлопнутый тайл клетки или -1 (текущее состояние)
     trace?: []                            // события {c,t}|{u:cell}|{bt:1}
   }) => Int8Array(n) | null (лимит откатов исчерпан)                  */
const WFC_POP=(()=>{const p=new Uint8Array(65536);for(let i=1;i<65536;i++)p[i]=p[i>>1]+(i&1);return p})();
function wfcSolve(o){
  const n=o.n,NT=o.numTiles,rng=o.rng,trace=o.trace||null;
  const FULL=(1<<NT)-1;
  /* --- соседи в плоские массивы; счётчики индексируются СЛОТОМ соседа
     (k-nbStart[i]), а не направлением: у нерегулярного графа все рёбра
     могут иметь один dirTag — направление нужно только для adj-масок --- */
  let ND=1,D=1; // ND: число dir-тегов (adj), D: макс. степень (слоты enab)
  const nbStart=new Int32Array(n+1);
  {let m=0;for(let i=0;i<n;i++){const l=o.neighbors(i);m+=l.length;
     if(l.length>D)D=l.length;
     for(const nb of l)if(nb[1]+1>ND)ND=nb[1]+1}
   nbStart[n]=m}
  const M=nbStart[n];
  const nbCell=new Int32Array(M),nbDir=new Uint8Array(M);
  {let m=0;for(let i=0;i<n;i++){nbStart[i]=m;for(const nb of o.neighbors(i)){nbCell[m]=nb[0];nbDir[m]=nb[1];m++}}}
  // обратное ребро: revSlot[k] = слот записи j->i у соседа j (для ребра k: i->j)
  const revSlot=new Int32Array(M).fill(-1),revDir=new Uint8Array(M);
  for(let i=0;i<n;i++)for(let k=nbStart[i];k<nbStart[i+1];k++){
    const j=nbCell[k];
    for(let k2=nbStart[j];k2<nbStart[j+1];k2++)
      if(nbCell[k2]===i){revSlot[k]=k2-nbStart[j];revDir[k]=nbDir[k2];break}
  }
  /* --- домены, веса, кэш энтропии --- */
  const dom=new Uint16Array(n).fill(FULL);
  const wt=new Float32Array(n*NT),wlog=new Float32Array(n*NT);
  const sumW=new Float32Array(n),sumWL=new Float32Array(n);
  for(let i=0;i<n;i++){
    const w=o.weights(i);
    for(let t=0;t<NT;t++){
      const v=Math.max(1e-6,w[t]);
      wt[i*NT+t]=v;wlog[i*NT+t]=v*Math.log(v);
      sumW[i]+=v;sumWL[i]+=v*Math.log(v);
    }
  }
  /* --- счётчики enabler'ов: enab[i,t,slot] = сколько тайлов в домене
     соседа (слот slot у клетки i) поддерживают тайл t у клетки i --- */
  const supp=new Uint8Array(NT*ND); // support-count при полном домене соседа
  for(let t=0;t<NT;t++)for(let d=0;d<ND;d++){
    let c=0;
    for(let u=0;u<NT;u++)if((o.adj[u][d]>>t)&1)c++;
    supp[t*ND+d]=c;
  }
  const enab=new Uint8Array(n*NT*D);
  for(let i=0;i<n;i++)
    for(let k=nbStart[i];k<nbStart[i+1];k++){
      const s2=k-nbStart[i],rd=revDir[k]; // dirTag ребра сосед->я
      for(let t=0;t<NT;t++)enab[(i*NT+t)*D+s2]=supp[t*ND+rd];
    }
  /* --- undo-лог и стек решений --- */
  const logC=[],logT=[],logFx=[]; // ban-события; logFx=1 если ban схлопнул клетку
  const decisions=[];             // {cell,tile,mark}
  let collapsed=0,contradiction=false,backtracks=0;
  const stackC=[],stackT=[];      // очередь пропагации
  const tileAt=(i)=>{const d2=dom[i];return WFC_POP[d2]===1?31-Math.clz32(d2):-1};
  /* --- мин-куча по энтропии (ленивая) --- */
  const heap=[];const ver=new Int32Array(n);
  const entropy=(i)=>Math.log(sumW[i])-sumWL[i]/sumW[i]+rng()*1e-4;
  const hpush=(i)=>{heap.push([entropy(i),i,ver[i]]);let k=heap.length-1;
    while(k>0){const p=(k-1)>>1;if(heap[p][0]<=heap[k][0])break;const t2=heap[p];heap[p]=heap[k];heap[k]=t2;k=p}};
  const hpop=()=>{ // до валидной вершины
    while(heap.length){
      const top=heap[0],last=heap.pop();
      if(heap.length){heap[0]=last;let k=0;
        for(;;){const a=2*k+1,b=2*k+2;let m=k;
          if(a<heap.length&&heap[a][0]<heap[m][0])m=a;
          if(b<heap.length&&heap[b][0]<heap[m][0])m=b;
          if(m===k)break;const t2=heap[m];heap[m]=heap[k];heap[k]=t2;k=m}}
      const i=top[1];
      if(top[2]===ver[i]&&WFC_POP[dom[i]]>1)return i;
    }
    return -1;
  };
  for(let i=0;i<n;i++)hpush(i);
  /* --- ban: удалить тайл из домена клетки --- */
  const ban=(i,t)=>{
    if(!((dom[i]>>t)&1)||contradiction)return;
    dom[i]&=~(1<<t);
    const pc=WFC_POP[dom[i]];
    if(pc===0){contradiction=true;dom[i]|=(1<<t);return} // откатим по логу до маркера
    sumW[i]-=wt[i*NT+t];sumWL[i]-=wlog[i*NT+t];
    ver[i]++;
    logC.push(i);logT.push(t);logFx.push(pc===1?1:0);
    stackC.push(i);stackT.push(t);
    if(pc===1){
      collapsed++;
      const tile=31-Math.clz32(dom[i]);
      if(trace)trace.push({c:i,t:tile});
      if(o.onCollapse)o.onCollapse(i,tile,ban,tileAt);
    }else hpush(i);
  };
  /* --- пропагация AC-4 --- */
  const propagate=()=>{
    while(stackC.length&&!contradiction){
      const j=stackC.pop(),u=stackT.pop();
      for(let k=nbStart[j];k<nbStart[j+1];k++){
        const i2=nbCell[k],rs=revSlot[k];
        if(rs<0)continue; // одностороннее ребро — не давит
        // u удалён у j: тайлы adj[u][dir j->i2] теряют опору у i2 (слот rs)
        let m=o.adj[u][nbDir[k]];
        while(m){
          const t=31-Math.clz32(m);m&=~(1<<t);
          const e=--enab[(i2*NT+t)*D+rs];
          if(e===0&&((dom[i2]>>t)&1))ban(i2,t);
        }
      }
    }
    stackC.length=0;stackT.length=0;
  };
  /* --- откат до маркера undo-лога --- */
  const undoTo=(mark)=>{
    while(logC.length>mark){
      const i2=logC.pop(),t=logT.pop(),fx=logFx.pop();
      if(fx){collapsed--;if(trace)trace.push({u:i2})}
      dom[i2]|=(1<<t);
      sumW[i2]+=wt[i2*NT+t];sumWL[i2]+=wlog[i2*NT+t];
      ver[i2]++;hpush(i2);
      for(let k=nbStart[i2];k<nbStart[i2+1];k++){
        const j=nbCell[k],rs=revSlot[k];
        if(rs<0)continue;
        let m=o.adj[t][nbDir[k]];
        while(m){
          const t2=31-Math.clz32(m);m&=~(1<<t2);
          enab[(j*NT+t2)*D+rs]++;
        }
      }
    }
  };
  /* стартовые сужения: domains и pins через общую механику (до решений) */
  const fail=(why)=>{if(o.stats){o.stats.backtracks=backtracks;o.stats.reason=why}return null};
  if(o.domains)for(let i=0;i<n;i++){
    let cut=FULL&~o.domains[i];
    while(cut){const t=31-Math.clz32(cut);cut&=~(1<<t);ban(i,t)}
    propagate();
    if(contradiction)return fail('init-domains@'+i); // несовместимые стартовые домены
  }
  if(o.pins)for(const [i,tile] of o.pins){
    let cut=dom[i]&~(1<<tile);
    while(cut){const t=31-Math.clz32(cut);cut&=~(1<<t);ban(i,t)}
    propagate();
    if(contradiction)return fail('init-pins@'+i);
  }
  /* --- основной цикл: observe -> propagate -> (backtrack) --- */
  const limit=o.backtrackLimit||500;
  while(collapsed<n){
    const i=hpop();
    if(i<0)break; // всё схлопнуто/куча пуста
    // взвешенный бросок по оставшимся тайлам
    let tot=0;
    for(let t=0;t<NT;t++)if((dom[i]>>t)&1)tot+=wt[i*NT+t];
    let roll=rng()*tot,tile=-1;
    for(let t=0;t<NT;t++)if((dom[i]>>t)&1){roll-=wt[i*NT+t];if(roll<=0){tile=t;break}}
    if(tile<0)for(let t=NT-1;t>=0;t--)if((dom[i]>>t)&1){tile=t;break}
    decisions.push({cell:i,tile,mark:logC.length});
    let cut=dom[i]&~(1<<tile);
    while(cut){const t=31-Math.clz32(cut);cut&=~(1<<t);ban(i,t)}
    propagate();
    while(contradiction){
      if(backtracks++>=limit)return fail('limit');
      if(trace)trace.push({bt:1});
      const dec=decisions.pop();
      if(!dec)return fail('exhausted'); // противоречие без решений — слой невыполним
      contradiction=false;
      stackC.length=0;stackT.length=0;
      undoTo(dec.mark);
      ban(dec.cell,dec.tile); // испробованный тайл запрещаем (принадлежит родителю)
      propagate();
    }
  }
  /* --- результат --- */
  const out=new Int8Array(n);
  for(let i=0;i<n;i++){
    const d2=dom[i];
    out[i]=WFC_POP[d2]===1?31-Math.clz32(d2):-1;
  }
  if(o.stats){o.stats.backtracks=backtracks}
  return out;
}
