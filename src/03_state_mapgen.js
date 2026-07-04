/* ================= STATE + MAPGEN ================= */
let S=null;
function log(msg){S.log.unshift({d:S.day,m:msg});if(S.log.length>60)S.log.pop();S.uiDirty=true}
function idx(x,y){return y*S.W+x}
function inMap(x,y){return x>=0&&y>=0&&x<S.W&&y<S.H}

function newGame(seedStr){
  const seed=hashStr(String(seedStr));
  const W=CFG.MAP_W,H=CFG.MAP_H,N=W*H;
  S={seedStr:String(seedStr),seed,rng:mulberry32(seed),W,H,
    terr:new Uint8Array(N),terrHp:new Uint8Array(N),feat:new Uint8Array(N),featHp:new Uint8Array(N),
    bld:new Int16Array(N).fill(-1),lairAt:new Int16Array(N).fill(-1),
    explored:new Uint8Array(N),visible:new Uint8Array(N),visibleAlpha:new Float32Array(N),fear:new Uint8Array(N),pass:new Uint8Array(N),
    buildings:[],lairs:[],settlers:[],regrow:[],badCells:new Map(),
    gold:CFG.START_GOLD,stock:Object.assign({},CFG.START_STOCK),lvl:{},
    time:0,day:1,speed:1,paused:false,
    th:{x:0,y:0},claims:new Set(),jobPool:[],jobT:0,visT:0,market:initMarket(),haulerIds:[],
    research:{pts:0,unlocked:{}},
    roleTally:{agr:0,fish:0,wood:0,stone:0},role:'Лагерь переселенцев',
    isNight:false,tavernIncome:0,haulerId:-1,hungryDays:0,immigrants:0,tradeGold:0,importSpent:0,
    rep:0,warbands:[],alarm:false,gameOver:null,ships:[],raidsSeen:0,lootLost:0,tributePaid:0,
    party:null,partySlots:[],heroDeaths:0,lairsDown:0,roadPlans:[],roadConn:null,showcase:[],craftT:0,stageCard:null,itemsSold:0,road:null,waterKind:null,policy:{food:'spend',wood:'import',stone:'export',gems:'export'},pin:null,
    popups:[],portBars:null,
    log:[],uiDirty:true,fogDirty:true,featDirty:true,bldDirty:true,terrDirty:true,terrFullDirty:true,
    nextId:1,hungry:false,dbgBuilder:'—',atlasMs:0,hoverLair:-1,revealAll:false};
  genTerrain();classifyWater();genRivers();pickStart();genFeatures();genLairs();computeFear();rebuildPass();
  S.road=new Uint8Array(N);S.roadConn=new Uint8Array(N);
  placeBuilding('townhall',S.th.x,S.th.y,true);
  recomputeRoadConn();
  spawnSettlers();
  for(let dy=-7;dy<=7;dy++)for(let dx=-7;dx<=7;dx++){
    if(dx*dx+dy*dy>52)continue;
    const x=S.th.x+dx,y=S.th.y+dy;
    if(inMap(x,y))S.explored[idx(x,y)]=1;
  }
  ensureStarterProductionSites();
  computeLevels();recomputeVision();settleThink();rebuildJobs();
  log('Императорский тракт остался позади. Здесь начинается Марка.');
  log('⚒ Артель размечает первые постройки — смотри значки стройплощадок.');
  log('Переселенцы разбивают лагерь у ратуши ('+S.settlers.map(u=>RNAME[u.race]).join(', ')+').');
  return S;
}

function genTerrain(){
  const W=S.W,H=S.H,s=S.seed;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const e=fbm(x/17,y/17,s,4), m=fbm(x/13,y/13,s+9999,3);
    let t;
    if(e<0.36)t=T.WATER;
    else if(e>0.70)t=T.MTN;
    else if(e>0.64)t=T.ROCK;
    else if(m>0.56)t=T.FOREST;
    else t=T.GRASS;
    S.terr[idx(x,y)]=t;
    if(t===T.FOREST)S.terrHp[idx(x,y)]=3;
  }
}
/* ---------- РЕКИ (п.1, v2 — по границам гексов) ----------
   Река течёт по dual-сетке: входит в треугольник через ребро, проходит через
   его центр и выходит через другое ребро (референс — реки Оскара Столберга).
   Каждый переход между треугольниками пересекает сторону (пару центров гексов
   A–B) и БЛОКИРУЕТ движение между этими гексами. Клетки остаются сушей.
   Мост = дорога на обоих берегах ребра (см. findPath/riverBlocked).
   Данные: S.riverEdges (Set ключей рёбер), S.riverTris (тайлы для рендера). */
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
  const W=S.W,H=S.H,N=W*H;
  S.riverEdges=new Set();
  S.riverTris=new Map(); // tid -> {x,y,baseCol,or,mask,tint,over:[{kind,wx,wy}]}
  S.riverStats={springs:0,outflows:0};
  const EK=(a,b)=>a<b?a*N+b:b*N+a;
  const elevC=new Float32Array(N);
  for(let i=0;i<N;i++)elevC[i]=fbm((i%W)/17,((i/W)|0)/17,S.seed,4);
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
      const rec={tid,x,y,baseCol:tr.baseCol,or:tr.or,corners:tr.corners,ci,
        sides:[EK(ci[0],ci[1]),EK(ci[1],ci[2]),EK(ci[2],ci[0])],
        elev:(elevC[ci[0]]+elevC[ci[1]]+elevC[ci[2]])/3,
        water:ci.some(i2=>S.terr[i2]===T.WATER),
        mtn:ci.some(i2=>S.terr[i2]===T.MTN)};
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
  const bankTint=(rec)=>{ // цвет берегов: преобладающий сухой террейн углов
    const cnt={};
    for(const i2 of rec.ci){const t=S.terr[i2];if(t!==T.WATER)cnt[t]=(cnt[t]||0)+1}
    let best=T.GRASS,bv=0;
    for(const t in cnt)if(cnt[t]>bv){bv=cnt[t];best=+t}
    return best;
  };
  const riverRec=(rec)=>{
    let r=S.riverTris.get(rec.tid);
    if(!r){r={x:rec.x,y:rec.y,baseCol:rec.baseCol,or:rec.or,mask:0,tint:bankTint(rec),over:[]};
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
  // сторона треугольника, примыкающая к воде (для устья)
  const waterSide=(rec,skipSide)=>{
    for(let si=0;si<3;si++){
      if(si===skipSide)continue;
      const a=rec.ci[si],b=rec.ci[(si+1)%3];
      if(S.terr[a]===T.WATER||S.terr[b]===T.WATER)return si;
    }
    return -1;
  };
  const compOf=(rec)=>{ // id водной компоненты, к которой примыкает треугольник
    for(const i2 of rec.ci)if(S.terr[i2]===T.WATER)return S.waterComp[i2];
    return -1;
  };
  const flow=(startRec,kind,banComp)=>{
    let cur=startRec,entrySide=-1,len=0,placed=0;
    if(kind==='falls'){const c=triCenterW(cur);riverRec(cur).over.push({kind:'falls',wx:c[0],wy:c[1]})}
    if(kind==='out'){ // исток из озера: стартовый рукав от кромки озера
      for(let si=0;si<3;si++){
        const nb=neighborVia(cur,si);
        if(nb&&nb.water&&compOf(nb)===banComp){
          S.riverEdges.add(cur.sides[si]);
          riverRec(cur).mask|=(1<<si);
          const m=sideMidW(cur,si);
          riverRec(cur).over.push({kind:'mouth',wx:m[0],wy:m[1]});
          entrySide=si;break;
        }
      }
    }
    while(len++<300){
      // выбор стороны выхода: сосед пониже, не назад; чужая река — магнит (слияние)
      let bestSi=-1,bestNb=null,be=Infinity,merge=false;
      for(let si=0;si<3;si++){
        if(si===entrySide)continue;
        const nb=neighborVia(cur,si);
        if(!nb)continue;
        if(nb.water&&banComp>=0&&compOf(nb)===banComp)continue; // не назад в своё озеро
        const already=S.riverEdges.has(cur.sides[si]);
        let e=nb.elev+S.rng()*0.05;
        if(nb.water)e-=1;                    // к морю/озеру
        if(already||S.riverTris.has(nb.tid))e-=0.6; // слияние с чужой рекой
        if(nb.mtn)e+=0.35;                   // в горы не течём
        if(e<be){be=e;bestSi=si;bestNb=nb;merge=already||S.riverTris.has(nb.tid)}
      }
      if(bestSi<0)break; // тупик
      // пересекли сторону: блокируем ребро между гексами A-B
      S.riverEdges.add(cur.sides[bestSi]);
      riverRec(cur).mask|=(1<<bestSi);
      const nb=bestNb;
      const nbSi=nb.sides.indexOf(cur.sides[bestSi]);
      riverRec(nb).mask|=(1<<nbSi);
      placed++;
      if(merge)break; // влились в существующую реку
      if(nb.water){   // устье: пена у стороны, ведущей в воду
        const ws=waterSide(nb,-1);
        if(ws>=0){
          S.riverEdges.add(nb.sides[ws]);
          riverRec(nb).mask|=(1<<ws);
          const m=sideMidW(nb,ws);
          riverRec(nb).over.push({kind:'mouth',wx:m[0],wy:m[1]});
        }
        break;
      }
      entrySide=nbSi;cur=nb;
    }
    return placed;
  };
  // --- 1) горные истоки (водопад у подножия) ---
  const springCand=[];
  for(const rec of tris.values())
    if(rec.mtn&&!rec.water&&!rec.corners.every(c=>S.terr[idx(c[0],c[1])]===T.MTN))springCand.push(rec);
  const springs=[];
  const want=Math.max(2,Math.round(W/28));
  let guard=0;
  while(springs.length<want&&guard++<600&&springCand.length){
    const rec=springCand[(S.rng()*springCand.length)|0];
    if(S.riverTris.has(rec.tid))continue;
    let close=false;
    for(const s2 of springs)if(cheb(rec.x,rec.y,s2.x,s2.y)<Math.round(W/7))close=true;
    if(close)continue;
    if(flow(rec,'falls')>=5){springs.push(rec);S.riverStats.springs++}
  }
  // --- 2) стоки из озёр: у самой низкой сухой кромки крупного озера ---
  if(S.waterComps)for(let ci2=0;ci2<S.waterComps.length;ci2++){
    const comp=S.waterComps[ci2];
    if(comp.sea!==1||comp.size<8||S.rng()>=0.75)continue;
    let best=null,be=Infinity;
    for(const rec of tris.values()){
      if(rec.water||S.riverTris.has(rec.tid))continue;
      // треугольник, граничащий с этим озером через одну из сторон
      let touches=false;
      for(let si=0;si<3;si++){
        const nb=neighborVia(rec,si);
        if(nb&&nb.ci.some(i2=>S.terr[i2]===T.WATER&&S.waterComp[i2]===ci2))touches=true;
      }
      if(!touches)continue;
      if(rec.elev<be){be=rec.elev;best=rec}
    }
    if(best&&flow(best,'out',ci2)>=3)S.riverStats.outflows++;
  }
}
function classifyWater(){
  const W=S.W,H=S.H,N=W*H;
  S.waterKind=new Uint8Array(N);
  S.waterComp=new Int16Array(N).fill(-1); // v2.1: id floodfill-компоненты воды
  S.waterComps=[];                        // v2.1: {cx,cy,size,sea} — центроиды компонент
  const seen=new Uint8Array(N);
  for(let i=0;i<N;i++){
    if(seen[i]||S.terr[i]!==T.WATER)continue;
    const comp=[i];seen[i]=1;let touch=false;
    for(let q=0;q<comp.length;q++){
      const c=comp[q],cx=c%W,cy=(c/W)|0;
      if(cx===0||cy===0||cx===W-1||cy===H-1)touch=true;
      for(const d of hexDirs(cx)){
        const nx=cx+d[0],ny=cy+d[1];
        if(nx<0||ny<0||nx>=W||ny>=H)continue;
        const ni=ny*W+nx;
        if(!seen[ni]&&S.terr[ni]===T.WATER){seen[ni]=1;comp.push(ni)}
      }
    }
    const sea=(comp.length>=100||touch)?2:1;
    let sx=0,sy=0;
    for(const c of comp){S.waterKind[c]=sea;S.waterComp[c]=S.waterComps.length;sx+=c%W;sy+=(c/W)|0}
    S.waterComps.push({cx:sx/comp.length,cy:sy/comp.length,size:comp.length,sea});
  }
}
function pickStart(){
  const W=S.W,H=S.H;const cand=[];
  for(let y=12;y<H-12;y++)for(let x=12;x<W-12;x++){
    if(S.terr[idx(x,y)]!==T.GRASS||cellNearRiver(x,y))continue; // ратуша не прижимается к реке
    let open=0;
    for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
      const t=S.terr[idx(x+dx,y+dy)];if(t===T.GRASS||t===T.FOREST)open++;
    }
    if(open>=26)cand.push({x,y});
  }
  const p=cand.length?cand[(S.rng()*cand.length)|0]:{x:(W/2)|0,y:(H/2)|0};
  S.th.x=p.x;S.th.y=p.y;
}
function genFeatures(){
  const W=S.W,H=S.H;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=idx(x,y),t=S.terr[i];
    if(cheb(x,y,S.th.x,S.th.y)<2)continue;
    const r=S.rng();
    if(t===T.GRASS){
      const wn=vnoise(x/5,y/5,S.seed+777);
      if(wn>0.58&&r<0.8){S.feat[i]=F.WHEAT;S.featHp[i]=4}
      else if(r>0.994&&cheb(x,y,S.th.x,S.th.y)>6){S.feat[i]=F.RUINS}
    }
    else if(t===T.MTN&&r<0.08){S.feat[i]=F.VEIN;S.featHp[i]=3}
    else if(t===T.WATER&&r<0.10){
      let shore=false;for(const d of hexDirs(x)){if(inMap(x+d[0],y+d[1])&&S.terr[idx(x+d[0],y+d[1])]!==T.WATER)shore=true}
      if(shore){S.feat[i]=F.FISH;S.featHp[i]=3}
    }
  }
}
function genLairs(){
  for(const def of LAIR_DEFS){
    let placed=false;
    for(let relax=0;relax<3&&!placed;relax++){
      for(let tryn=0;tryn<600&&!placed;tryn++){
        const x=(S.rng()*S.W)|0,y=(S.rng()*S.H)|0;
        const d=cheb(x,y,S.th.x,S.th.y);
        const rmin=def.ring[0]-relax*3, rmax=def.ring[1]+relax*6;
        if(d<rmin||d>rmax)continue;
        const i=idx(x,y);
        if(S.lairAt[i]>=0||S.feat[i]!==F.NONE)continue;
        const t=S.terr[i];
        if(relax<2&&def.terr.indexOf(t)<0)continue;
        if(relax>=2&&(t===T.WATER||t===T.MTN))continue;
        let close=false;
        for(const L of S.lairs)if(cheb(x,y,L.x,L.y)<7)close=true;
        if(close)continue;
        S.lairs.push({id:def.id,name:def.name,tier:def.tier,x,y,hoard:20*def.tier,str:2+2*def.tier,aggro:S.rng()*25,cd:0});
        S.lairAt[i]=S.lairs.length-1;
        placed=true;
      }
    }
  }
}
function computeFear(){
  S.fear.fill(0);
  for(const L of S.lairs){
    for(let dy=-CFG.FEAR_R;dy<=CFG.FEAR_R;dy++)for(let dx=-CFG.FEAR_R-1;dx<=CFG.FEAR_R+1;dx++){
      const x=L.x+dx,y=L.y+dy;
      if(inMap(x,y)&&cheb(x,y,L.x,L.y)<=CFG.FEAR_R)S.fear[idx(x,y)]=1;
    }
  }
}
function rebuildPass(){
  for(let i=0;i<S.W*S.H;i++){
    const t=S.terr[i];
    S.pass[i]=(t!==T.WATER&&t!==T.MTN&&S.lairAt[i]<0)?1:0;
    // реки (п.1) блокируют РЁБРА между гексами, а не клетки — см. findPath
  }
}
function placeBuilding(type,x,y,instant){
  const b={type,x,y,built:!!instant,work:instant?0:CFG.BUILD_WORK,cd:0,data:{},buf:{food:0,wood:0,stone:0,gems:0},hold:{food:0,wood:0,stone:0,gems:0},store:{food:0,wood:0,stone:0,gems:0},sailing:false,sailMode:null,importRes:null,importQty:0,starve:false,starveD:0,abandoned:false,workerId:null,tier:1,
    need:instant?null:Object.assign({},CFG.COSTS[type]||{}),got:instant?null:{}};
  if(instant)S.road&&(S.road[idx(x,y)]=1);
  if(type==='mine'){
    let vein=false,mtn=0;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      if(!inMap(x+dx,y+dy))continue;
      if(S.feat[idx(x+dx,y+dy)]===F.VEIN)vein=true;
      if(S.terr[idx(x+dx,y+dy)]===T.MTN)mtn++;
    }
    b.data.vein=vein;
    // п.6: рудное тело конечно — зависит от размера примыкающей горы
    b.data.oreLeft=CFG.MINE.oreBase+mtn*CFG.MINE.orePerMtn;
  }
  S.buildings.push(b);
  S.bld[idx(x,y)]=S.buildings.length-1;
  rebuildPass();S.bldDirty=true;
  return b;
}
function spawnSettlers(){
  // race mix from surrounding context (radius 10)
  const w={human:6,dwarf:0,elf:0,troll:0};let deadfall=0;
  for(let dy=-10;dy<=10;dy++)for(let dx=-10;dx<=10;dx++){
    const x=S.th.x+dx,y=S.th.y+dy;if(!inMap(x,y))continue;
    const t=S.terr[idx(x,y)];
    if(t===T.MTN)w.dwarf+=1.2;
    else if(t===T.WATER)w.elf+=0.5;
    else if(t===T.FOREST)w.elf+=0.30;
    else if(t===T.ROCK){w.troll+=0.7;w.dwarf+=0.35}
    else w.human+=0.04;
    if(S.feat[idx(x,y)]===F.DEADFALL)deadfall++;
  }
  w.troll+=deadfall*1.2;
  S.raceW=w;
  const total=w.human+w.dwarf+w.elf+w.troll;
  for(let n=0;n<CFG.START_POP;n++){
    let r=S.rng()*total,race='human';
    for(const rc of RACES){r-=w[rc];if(r<=0){race=rc;break}}
    // spawn near TH
    let sx=S.th.x,sy=S.th.y;
    for(let ring=1;ring<6;ring++){
      let done=false;
      for(let a=0;a<24;a++){const x=S.th.x+(((S.rng()*2-1)*ring)|0),y=S.th.y+(((S.rng()*2-1)*ring)|0);
        if(inMap(x,y)&&S.pass[idx(x,y)]){sx=x;sy=y;done=true;break}}
      if(done)break;
    }
    S.settlers.push({id:S.nextId++,race,x:sx+0.5,y:sy+0.5,px:sx+0.5,py:sy+0.5,
      act:'idle',after:null,path:null,pathI:0,job:null,carry:null,workT:0,
      stam:CFG.STAM_MAX,inside:-1,drankToday:false,
      wallet:0,idleDays:0,worksToday:0,wanderT:S.rng()*2,fx:1,repathed:false});
  }
}

