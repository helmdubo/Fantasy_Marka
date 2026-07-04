/* ================= HEADLESS (node smoke test) ================= */
function hexSelfTest(){
  const errs=[];
  // 1) стороны dual-треугольников ~равносторонние в мире
  for(const x of [4,5]){
    for(const tr of colTris(x,6)){
      const P=tr.corners.map(c=>[WXC(c[0]),WYCC(c[0],c[1])]);
      for(let k=0;k<3;k++){
        const a=P[k],b=P[(k+1)%3];
        const L=Math.hypot(a[0]-b[0],a[1]-b[1]);
        if(L<0.85||L>1.15)errs.push('tri side '+L.toFixed(3)+' x'+x+' '+tr.or);
      }
    }
  }
  // 2) угол спрайта должен попадать в центр своей клетки (сильный инвариант рендера)
  const PIX={'r':[[0,0],[0,16],[14,8]],'l':[[14,0],[14,16],[0,8]]};
  for(const x of [3,4]){
    for(const tr of colTris(x,5)){
      const wyTop=WYCC(tr.baseCol,5),wx0=WXC(x);
      for(let k=0;k<3;k++){
        const px2=wx0+PIX[tr.or][k][0]/16,py2=wyTop-PIX[tr.or][k][1]/16;
        const c=tr.corners[k];
        const dx=px2-WXC(c[0]),dy=py2-WYCC(c[0],c[1]);
        if(Math.hypot(dx,dy)>0.05)errs.push('corner map '+tr.or+' k'+k+' off '+Math.hypot(dx,dy).toFixed(3));
      }
    }
  }
  // 3) pickHex roundtrip по центрам клеток
  for(let t2=0;t2<200;t2++){
    const x=(Math.random()*S.W)|0,y=(Math.random()*S.H)|0;
    const c=pickHex(WXC(x),WYCC(x,y));
    if(c.x!==x||c.y!==y)errs.push('pickHex '+x+','+y+' -> '+c.x+','+c.y);
  }
  // 4) hexDirs взаимность и метрика
  for(let t2=0;t2<50;t2++){
    const x=2+((Math.random()*(S.W-4))|0),y=2+((Math.random()*(S.H-4))|0);
    for(const d of hexDirs(x)){
      const nx=x+d[0],ny=y+d[1];
      const back=hexDirs(nx).some(dd=>nx+dd[0]===x&&ny+dd[1]===y);
      if(!back)errs.push('dirs not mutual '+x+','+y);
      if(hexDist2(x,y,nx,ny)!==1)errs.push('dist!=1 neighbor '+x+','+y);
    }
  }
  return errs;
}
function runHeadless(){
  const errs=validateSprites();
  console.log('sprites:',errs.length?('ISSUES '+JSON.stringify(errs)):'ok');
  const hseed=(typeof process!=='undefined'&&process.argv&&process.argv[2])?process.argv[2]:'test-1';
  newGame(hseed);
  const hexErrs=hexSelfTest();
  console.log('hexgrid:',hexErrs.length?('ISSUES '+JSON.stringify(hexErrs.slice(0,5))):'ok');
  const cnt=[0,0,0,0,0];for(const t of S.terr)cnt[t]++;
  console.log('terrain:',cnt.map((n,i)=>TNAME[i]+' '+(100*n/S.terr.length).toFixed(0)+'%').join(' | '));
  {let rc=0,rs=0,br=0;for(let i2=0;i2<S.river.length;i2++){if(S.river[i2])rc++;if(S.river[i2]===2)rs++;if(S.river[i2]&&S.road[i2])br++}
   console.log('rivers: cells='+rc+' sources='+rs+' bridges='+br)}
  console.log('start:',S.th.x+','+S.th.y,'| lairs:',S.lairs.map(l=>l.id+'@'+l.x+','+l.y+' d='+cheb(l.x,l.y,S.th.x,S.th.y)).join('  '));
  console.log('settlers:',S.settlers.map(u=>u.race).join(', '));
  S.policy.wood='export';S.policy.food='export';
  const days=60;
  for(let i=0,n=days*(CFG.DAY+CFG.NIGHT)/CFG.STEP;i<n;i++)tick(CFG.STEP);
  let expl=0;for(const e of S.explored)expl+=e;
  console.log('after '+days+'d: pop='+S.settlers.length+' gold='+S.gold.toFixed(1)+
    ' food='+S.stock.food.toFixed(1)+' wood='+S.stock.wood.toFixed(1)+
    ' stone='+S.stock.stone.toFixed(1)+' gems='+S.stock.gems.toFixed(1));
  console.log('levels:',JSON.stringify(S.lvl),'hungry:',S.hungry);
  console.log('buildings:',S.buildings.map(b=>b.type+(b.built?'':'*')).join(', '));
  console.log('role:',S.role,'| explored:',(100*expl/S.explored.length).toFixed(0)+'%');
  console.log('wallets:',S.settlers.map(u=>u.race.slice(0,2)+':'+u.wallet.toFixed(1)).join(' '));
  console.log('builder note:',S.dbgBuilder);
  console.log('market:',S.market?JSON.stringify(S.market.stats):'—');
  const avgStam=S.settlers.reduce((a,u)=>a+u.stam,0)/S.settlers.length;
  const inside=S.settlers.filter(u=>u.inside>=0).length;
  let roads=0;for(const r of S.road)roads+=r;
  let sea=0,lake=0;for(let i=0;i<S.waterKind.length;i++){if(S.waterKind[i]===2)sea++;if(S.waterKind[i]===1)lake++}
  const hl=S.settlers.find(x=>x.id===S.haulerId);
  console.log('ECON: lumber='+countB('lumber',true)+' mine='+countB('mine',true)+
    ' fisher='+countB('fisher',true)+' farm='+countB('farm',true)+
    ' forestKnown='+forestInInfluence()+' mineSite='+(anySite('mine')?1:0));
  console.log('C: raids='+S.raidsSeen+' lootLost='+S.lootLost.toFixed(0)+' rep='+S.rep+
    ' tributePaid='+S.tributePaid+' ruined='+S.buildings.filter(b=>b.ruined).length+
    ' unconnected='+S.buildings.filter(b=>b.built&&!connected(b)).length+' workerLeaks='+S.buildings.filter(b=>b.workerId!=null&&!S.settlers.some(u=>u.id===b.workerId&&(u.inside>=0||u.fieldB!==undefined))).length+' roadPlansOpen='+S.roadPlans.length+' warbandsStuck='+S.warbands.filter(w=>!w.done&&S.day-w.born>3).length+' gameOver='+(S.gameOver?S.gameOver.reason:'нет'));
  console.log('M3: pop='+S.settlers.length+' immigrants='+S.immigrants+' tradeGold='+S.tradeGold.toFixed(1)+
    ' trade='+(countB('port',true)?'port':(countB('guild',true)?'guild':'—'))+
    ' tiers='+S.buildings.filter(b=>b.built&&(b.tier||1)>1).map(b=>b.type+':'+b.tier).join(',')); 
  console.log('B: roads='+roads+' sea='+sea+' lake='+lake+' haulers='+(S.haulerIds&&S.haulerIds.length?S.haulerIds.map(id=>{const u=S.settlers.find(x=>x.id===id);return u?u.race:'?'}).join('/'):'—')+
    ' bufs='+S.buildings.filter(b=>b.built).map(b=>b.type+':'+bufTotal(b)).join(','));
  console.log('A2: tavernIncome='+S.tavernIncome.toFixed(1)+' avgStam='+avgStam.toFixed(0)+' insideNow='+inside+' night='+S.isNight);
  console.log('last log:',S.log.slice(0,4).map(e=>'д'+e.d+' '+e.m).join(' // '));
  if(typeof process!=='undefined'&&process.argv[3]==='quest')questScenario();
}
function tickDays(n){for(let i=0,k=n*(CFG.DAY+CFG.NIGHT)/CFG.STEP;i<k;i++)tick(CFG.STEP)}
function tickUntilPartyDone(cap){
  let t=0;
  while(S.party&&t++<cap*10)tick(CFG.STEP);
  return !S.party;
}
function questScenario(){
  console.log('--- QUEST SCENARIO ---');
  // ensure adventurers guild
  if(countB('advguild',true)===0){
    let placed=false;
    for(let y=0;y<S.H&&!placed;y++)for(let x=0;x<S.W&&!placed;x++){
      if(siteOk('advguild',x,y)){placeBuilding('advguild',x,y,true);placed=true}
    }
    if(!placed){ // force next to townhall on any grass
      for(let y=0;y<S.H&&!placed;y++)for(let x=0;x<S.W&&!placed;x++){
        if(S.terr[idx(x,y)]===T.GRASS&&S.bld[idx(x,y)]<0&&S.pass[idx(x,y)]&&cheb(x,y,S.th.x,S.th.y)<=4){
          placeBuilding('advguild',x,y,true);placed=true}
      }
    }
    console.log('guild forced:',placed);
  }
  // recruit heroes
  let guard=0;
  while(heroCount()<3&&guard++<10){
    const c=S.settlers.find(u=>!u.hero&&u.id!==S.haulerId);
    if(!c)break;makeHero(c);
  }
  S.autoQuest=true;
  const trio=S.settlers.filter(u=>u.hero).slice(0,3).map(u=>u.id);
  formSlot(trio);
  console.log('heroes:',S.settlers.filter(u=>u.hero).map(u=>u.hero.name+'/'+u.hero.cls+(u.hero.thief?'/вор':'')).join(', '));
  const li=S.lairs.findIndex(L=>!L.dead&&L.tier===1);
  if(li<0){console.log('no t1 lair');return}
  S.stock.food=Math.max(S.stock.food,30);
  // SCOUT
  console.log('send scout:',sendParty(li,'scout'));
  console.log('scout done:',tickUntilPartyDone(600),'known:',S.lairs[li].known);
  // ATTACK
  console.log('send attack:',sendParty(li,'attack'));
  console.log('attack done:',tickUntilPartyDone(600),'lair dead:',!!S.lairs[li].dead,'deaths:',S.heroDeaths,'gold:',S.gold.toFixed(1));
  // ROB tier2 if thief alive
  const li2=S.lairs.findIndex(L=>!L.dead&&L.tier===2);
  const hasThief=freeHeroes().some(u=>u.hero.thief);
  if(li2>=0&&freeHeroes().length>=3){
    S.stock.food=Math.max(S.stock.food,30);
    console.log('send rob(t2):',sendParty(li2,'rob'),'thiefAvail:',hasThief);
    console.log('rob done:',tickUntilPartyDone(800),'hoard now:',S.lairs[li2].hoard.toFixed(0),'aggro:',S.lairs[li2].aggro.toFixed(0));
  }
  console.log('wallets:',S.settlers.filter(u=>u.hero).map(u=>u.hero.name+':'+u.wallet.toFixed(0)).join(' '));
  // пересборка слота с вором для обноса
  for(const u of S.settlers)if(u.hero){u.hero.hp=u.hero.maxHp}
  while(S.partySlots.length)disbandSlot(S.partySlots[0].id);
  const th2=S.settlers.find(u=>u.hero&&u.hero.thief);
  const rest=S.settlers.filter(u=>u.hero&&u!==th2).slice(0,2);
  if(th2&&rest.length===2)formSlot([th2.id,...rest.map(u=>u.id)]);
  const li3=S.lairs.findIndex(L=>!L.dead&&L.tier===2);
  if(li3>=0&&activeSlot()){
    S.stock.food=Math.max(S.stock.food,30);
    console.log('send rob2:',sendParty(li3,'rob'));
    console.log('rob2 done:',tickUntilPartyDone(600),'hoard:',S.lairs[li3].hoard.toFixed(0));
  }
  for(const u of S.settlers)if(u.hero){u.hero.hp=u.hero.maxHp}
  // п.6: спуск возможен только в заброшенную шахту — принудительно бросаем её
  let mi=S.buildings.findIndex(b=>b.built&&b.type==='mine'&&!b.ruined&&b.abandoned);
  if(mi<0){mi=S.buildings.findIndex(b=>b.built&&b.type==='mine'&&!b.ruined);
    if(mi>=0){S.buildings[mi].abandoned=true;console.log('mine force-abandoned for delve test')}}
  if(mi>=0&&activeSlot()){
    S.stock.food=Math.max(S.stock.food,30);
    console.log('send delve:',sendDelve(mi));
    console.log('delve done:',tickUntilPartyDone(600),'delveMax:',S.buildings[mi].delveMax,'gems:',S.stock.gems.toFixed(0));
  }
  // форс-тест ремесленников: самоцветы + гильдия + крафт + покупка
  S.stock.gems=Math.max(S.stock.gems,6);
  if(countB('crafters',true)===0){
    let pl=false;
    for(let y=0;y<S.H&&!pl;y++)for(let x=0;x<S.W&&!pl;x++){
      if(S.terr[idx(x,y)]===T.GRASS&&S.bld[idx(x,y)]<0&&!S.road[idx(x,y)]&&S.pass[idx(x,y)]&&cheb(x,y,S.th.x,S.th.y)<=4){
        placeBuilding('crafters',x,y,true);pl=true}
    }
    recomputeRoadConn();
  }
  S.craftT=CFG.CRAFT_EVERY;craftDaily();S.craftT=CFG.CRAFT_EVERY;craftDaily();
  for(const u of S.settlers)if(u.hero)u.wallet=Math.max(u.wallet,30);
  for(const u of S.settlers)if(u.hero)buyGear(u);
  console.log('showcase:',S.showcase.length,'itemsSold:',S.itemsSold,'slots:',S.partySlots.length);
  console.log('lairsDown:',S.lairsDown,'party:',S.party?'STUCK!':'clear');
}
