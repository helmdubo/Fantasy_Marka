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
    log:[],uiDirty:true,fogDirty:true,featDirty:true,bldDirty:true,terrDirty:true,terrFullDirty:true,reliefDirty:true,
    nextId:1,hungry:false,dbgBuilder:'—',atlasMs:0,hoverLair:-1,revealAll:false};
  genWorld();pickStart();genFeatures();genLairs();computeFear();rebuildPass();
  S.road=new Uint8Array(N);S.roadConn=new Uint8Array(N);
  // Старт с ПАЛАТКИ: поселенцы разведывают округу, затем игрок (или авто
  // в headless) выбирает место ратуши. Губернаторских указов больше нет —
  // качество стартовой зоны обеспечивает генератор + выбор игрока.
  S.phase='scout';
  placeBuilding('tent',S.th.x,S.th.y,true);
  spawnSettlers();
  for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){
    if(dx*dx+dy*dy>27)continue;
    const x=S.th.x+dx,y=S.th.y+dy;
    if(inMap(x,y))S.explored[idx(x,y)]=1;
  }
  computeLevels();recomputeVision();
  log('Императорский тракт остался позади. Здесь начинается Марка.');
  log('⛺ Переселенцы ставят палатку и расходятся на разведку ('+S.settlers.map(u=>RNAME[u.race]).join(', ')+').');
  log('👁 Выберите место для ратуши: тап по разведанной клетке луга.');
  return S;
}

/* ---------- РЕКИ: v3 (flow-аккумуляция) живёт в 02e_rivers.js ---------- */
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
    let open=0,forest=0;
    for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
      const t=S.terr[idx(x+dx,y+dy)];
      if(t===T.GRASS)open++;else if(t===T.FOREST)forest++;
    }
    if(open>=24&&forest>=2)cand.push({x,y}); // простор лугов + лес поблизости
  }
  // прибрежный уклон: марка — заморская колония, лагерь ближе к берегу
  let best=null,bv=-1e9;
  for(const c of cand){
    const dc=S.distCoast[idx(c.x,c.y)];
    const v=-Math.abs(dc-6)*2+hash2(c.x,c.y,S.seed+99)*3;
    if(v>bv){bv=v;best=c}
  }
  const p=best||{x:(W/2)|0,y:(H/2)|0};
  S.th.x=p.x;S.th.y=p.y;
}
/* ---------- выбор места ратуши (фаза scout) ---------- */
function thSiteScore(x,y){
  const i=idx(x,y);
  if(!S.explored[i]||S.terr[i]!==T.GRASS||!S.pass[i]||S.bld[i]>=0||S.lairAt[i]>=0||S.fear[i])return -1;
  if(cellNearRiver(x,y)&&false)return -1;
  let sc=0;
  const dc=S.distCoast[i];
  sc+=Math.max(0,8-Math.abs(dc-6));            // берег недалеко (порт!)
  if(cellNearRiver(x,y))sc+=4;                  // пойма
  let open=0,forest=0,rockMtn=0,wheat=0,fish=0;
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
    const nx=x+dx,ny=y+dy;
    if(!inMap(nx,ny))continue;
    const ni=idx(nx,ny);
    const t=S.terr[ni];
    if(t===T.GRASS)open++;
    else if(t===T.FOREST)forest++;
    else if(t===T.ROCK||t===T.MTN)rockMtn++;
    if(S.feat[ni]===F.WHEAT)wheat++;
    if(S.feat[ni]===F.FISH)fish++;
  }
  if(open<18)return -1;                         // ратуше нужен простор
  sc+=open*0.25+Math.min(forest,6)*1.2+Math.min(rockMtn,4)*1.0+wheat*1.5+fish*1.5;
  return sc;
}
function placeTownhall(x,y){
  if(S.phase!=='scout')return false;
  const sc=thSiteScore(x,y);
  if(sc<0){log('🚫 Здесь ратушу не поставить: нужен разведанный простор лугов.');return false}
  // палатка сворачивается: переселенцы переезжают к ратуше
  const ti=S.buildings.findIndex(b=>b.type==='tent');
  if(ti>=0){
    const tb=S.buildings[ti];
    for(const u of S.settlers)if(u.inside===ti){u.inside=-1;u.act='idle'}
    S.bld[idx(tb.x,tb.y)]=-1;
    S.buildings.splice(ti,1);
    for(let i=0;i<S.W*S.H;i++)if(S.bld[i]>ti)S.bld[i]--;
    for(const u of S.settlers)if(u.inside>ti)u.inside--;
    S.bldDirty=true;
  }
  placeBuilding('townhall',x,y,true);
  S.th={x,y};
  recomputeRoadConn();
  for(let dy=-7;dy<=7;dy++)for(let dx=-7;dx<=7;dx++){
    if(dx*dx+dy*dy>52)continue;
    const nx=x+dx,ny=y+dy;
    if(inMap(nx,ny))S.explored[idx(nx,ny)]=1;
  }
  S.phase='play';
  computeLevels();recomputeVision();settleThink();rebuildJobs();assignHauler();
  S.fogDirty=true;S.uiDirty=true;
  log('🏛 Ратуша заложена — здесь начинается Марка!');
  log('⚒ Артель размечает первые постройки — смотри значки стройплощадок.');
  return true;
}
function autoPlaceTownhall(){
  let best=null,bv=-1;
  for(let y=1;y<S.H-1;y++)for(let x=1;x<S.W-1;x++){
    const sc=thSiteScore(x,y);
    if(sc>bv){bv=sc;best={x,y}}
  }
  if(best)return placeTownhall(best.x,best.y);
  // разведано слишком мало — подождём ещё
  return false;
}
function genFeatures(){
  const W=S.W,H=S.H;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=idx(x,y),t=S.terr[i];
    if(cheb(x,y,S.th.x,S.th.y)<2)continue;
    const r=S.rng();
    if(t===T.GRASS){
      const wn=vnoise(x/5,y/5,S.seed+777);
      const bio=S.biome?S.biome[i]:BIO.MEADOW;
      // пшеница — по биому: не на болоте, степи нужна пойма (влага)
      const wheatOk=bio!==BIO.SWAMP&&(bio!==BIO.STEPPE||(S.moist&&S.moist[i]>=0.4));
      if(wn>0.58&&r<0.8&&wheatOk){S.feat[i]=F.WHEAT;S.featHp[i]=4}
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
  // Два слоя проходимости: жители НЕ ходят сквозь стоящий лес (пеньки после
  // вырубки проходимы) — лесопилки буквально прорубают дорогу. Герои, партии
  // и рейдеры продираются через чащу (S.passHero).
  if(!S.passHero||S.passHero.length!==S.pass.length)S.passHero=new Uint8Array(S.pass.length);
  for(let i=0;i<S.W*S.H;i++){
    const t=S.terr[i];
    const base=(t!==T.WATER&&t!==T.MTN&&S.lairAt[i]<0)?1:0;
    S.passHero[i]=base;
    S.pass[i]=(base&&!(t===T.FOREST&&S.terrHp[i]>0))?1:0;
    // реки (п.1) блокируют РЁБРА между гексами, а не клетки — см. findPath
  }
}
// Пути героев/рейдеров: лес проходим
function withHeroPass(fn){
  const saved=S.pass;
  S.pass=S.passHero;
  let r;
  try{r=fn()}finally{S.pass=saved}
  return r;
}
function placeBuilding(type,x,y,instant){
  const b={type,x,y,built:!!instant,work:instant?0:CFG.BUILD_WORK,cd:0,data:{},buf:{food:0,wood:0,stone:0,gems:0},hold:{food:0,wood:0,stone:0,gems:0},store:{food:0,wood:0,stone:0,gems:0},sailing:false,sailMode:null,importRes:null,importQty:0,starve:false,starveD:0,abandoned:false,workerId:null,tier:1,
    need:instant?null:Object.assign({},costOf(type)),got:instant?null:{}};
  if(instant&&type!=='tent')S.road&&(S.road[idx(x,y)]=1);
  if(type==='mine'){
    let vein=false,mtn=0,rock=0;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      if(!inMap(x+dx,y+dy))continue;
      if(S.feat[idx(x+dx,y+dy)]===F.VEIN)vein=true;
      if(S.terr[idx(x+dx,y+dy)]===T.MTN)mtn++;
      if(S.terr[idx(x+dx,y+dy)]===T.ROCK)rock++;
    }
    b.data.vein=vein;
    // п.6: рудное тело конечно. Горная шахта богата, холмовая (предгорья) бедней.
    b.data.oreLeft=mtn>0?CFG.MINE.oreBase+mtn*CFG.MINE.orePerMtn
      :Math.round(CFG.MINE.oreBase*0.6)+rock*2;
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

