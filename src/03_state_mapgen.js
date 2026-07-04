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
    log:[],uiDirty:true,fogDirty:true,featDirty:true,bldDirty:true,terrDirty:true,
    nextId:1,hungry:false,dbgBuilder:'—',atlasMs:0,hoverLair:-1,revealAll:false};
  genTerrain();classifyWater();genRivers();classifyWater();pickStart();genFeatures();genLairs();computeFear();rebuildPass();
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
/* ---------- РЕКИ (п.1) ----------
   Река — оверлей S.river поверх суши (0 нет / 1 река / 2 исток-водопад).
   Течёт с гор по градиенту высоты (fbm) с джиттером к морю или озеру,
   реки сливаются; озеро может дать сток к морю; тупик превращается в пруд.
   Клетка реки непроходима, пока по ней не проложена дорога (мост). */
function genRivers(){
  const W=S.W,H=S.H,N=W*H;
  S.river=new Uint8Array(N);
  const elev=(x,y)=>fbm(x/17,y/17,S.seed,4);
  const flowFrom=(sx,sy,isSource)=>{
    let x=sx,y=sy,len=0;
    const own=new Set();
    while(len++<260){
      if(!inMap(x,y))break;
      const i=idx(x,y);
      if(S.terr[i]===T.WATER&&len>2)break;       // впадение в море/озеро
      if(S.river[i]&&!own.has(i))break;           // слияние с другой рекой
      if(!S.river[i])S.river[i]=(len===1&&isSource)?2:1;
      own.add(i);
      if(S.terr[i]===T.FOREST){S.terr[i]=T.GRASS;S.terrHp[i]=0} // река прорезает просеку
      // следующий шаг: минимальная высота среди доступных соседей
      let nx=x,ny=y,ne=Infinity;
      for(const d of hexDirs(x)){
        const tx=x+d[0],ty=y+d[1];
        if(!inMap(tx,ty))continue;
        const ti=idx(tx,ty);
        if(own.has(ti)||S.terr[ti]===T.MTN)continue;
        let e=elev(tx,ty)+S.rng()*0.055; // джиттер даёт меандры вместо прямой канавы
        if(S.terr[ti]===T.WATER)e-=1;    // тянемся к воде
        if(S.river[ti])e-=0.5;           // и к чужим рекам (слияние)
        if(e<ne){ne=e;nx=tx;ny=ty}
      }
      if(nx===x&&ny===y){ // тупик в низине — пруд
        S.terr[i]=T.WATER;S.terrHp[i]=0;S.river[i]=0;own.delete(i);break;
      }
      x=nx;y=ny;
      if(x<=0||y<=0||x>=W-1||y>=H-1)break;
    }
    return own.size;
  };
  // 1) горные истоки: клетки суши у подножия гор, разнесённые по карте
  const feet=[];
  for(let i=0;i<N;i++){
    if(S.terr[i]!==T.MTN)continue;
    const x=i%W,y=(i/W)|0;
    for(const d of hexDirs(x)){
      const nx=x+d[0],ny=y+d[1];
      if(!inMap(nx,ny))continue;
      const t=S.terr[idx(nx,ny)];
      if(t!==T.MTN&&t!==T.WATER){feet.push({x:nx,y:ny});break}
    }
  }
  const springs=[];
  const want=Math.max(2,Math.round(W/28)); // ~4-5 на карте 128
  let guard=0;
  while(springs.length<want&&guard++<500&&feet.length){
    const c=feet[(S.rng()*feet.length)|0];
    if(S.river[idx(c.x,c.y)])continue;
    let close=false;
    for(const s of springs)if(cheb(c.x,c.y,s.x,s.y)<Math.round(W/7))close=true;
    if(close)continue;
    if(flowFrom(c.x,c.y,true)>=5)springs.push(c);
  }
  // 2) стоки из озёр: крупное озеро изливается к морю с самой низкой кромки
  if(S.waterComps)for(let ci=0;ci<S.waterComps.length;ci++){
    const comp=S.waterComps[ci];
    if(comp.sea!==1||comp.size<8)continue;
    let best=null,be=Infinity;
    for(let i=0;i<N;i++){
      if(S.waterComp[i]!==ci)continue;
      const x=i%W,y=(i/W)|0;
      for(const d of hexDirs(x)){
        const nx=x+d[0],ny=y+d[1];
        if(!inMap(nx,ny))continue;
        const ti=idx(nx,ny);
        if(S.terr[ti]===T.WATER||S.terr[ti]===T.MTN||S.river[ti])continue;
        const e=elev(nx,ny);
        if(e<be){be=e;best={x:nx,y:ny}}
      }
    }
    if(best&&S.rng()<0.75)flowFrom(best.x,best.y,false);
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
    if(S.terr[idx(x,y)]!==T.GRASS||S.river[idx(x,y)])continue;
    let open=0,riverNear=false;
    for(const d of hexDirs(x))if(inMap(x+d[0],y+d[1])&&S.river[idx(x+d[0],y+d[1])])riverNear=true;
    if(riverNear)continue; // ратуша не прижимается к реке
    for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
      const i=idx(x+dx,y+dy);
      const t=S.terr[i];if((t===T.GRASS||t===T.FOREST)&&!S.river[i])open++;
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
    if(S.river[i])continue; // на клетках рек фичи не растут
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
        if(S.lairAt[i]>=0||S.feat[i]!==F.NONE||S.river[i])continue;
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
    let p=(t!==T.WATER&&t!==T.MTN&&S.lairAt[i]<0)?1:0;
    // п.1: река непроходима; мост (дорога на клетке реки) открывает проход
    if(p&&S.river&&S.river[i]&&!(S.road&&S.road[i]))p=0;
    S.pass[i]=p;
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

