function brewDaily(){
  // п.5: таверна варит эль из зерна, принесённого разносчиком в её локальный
  // запас (CFG.STORE.tavern). Зерно есть, только пока действует хоть одна ферма.
  const hasFarm=countActive('farm')>0;
  for(const b of S.buildings){
    if(b.type!=='tavern'||!b.built||b.ruined||!connected(b))continue;
    b.ale=b.ale||0;
    if(!hasFarm){
      if((b.store.food||0)>0&&!b.brewWarn){b.brewWarn=true;
        log('🍺 Таверна: без действующей фермы зерна не будет — эль на исходе.')}
      continue;
    }
    b.brewWarn=false;
    const grain=Math.min(CFG.ALE.brewFood,Math.floor(b.store.food||0),
      Math.max(0,Math.ceil((CFG.ALE.cap-b.ale)/CFG.ALE.perFood)));
    if(grain<=0)continue;
    b.store.food-=grain;
    b.ale=Math.min(CFG.ALE.cap,b.ale+grain*CFG.ALE.perFood);
    addInfoPopup('🍺 +'+grain*CFG.ALE.perFood,b.x,b.y,'info');
  }
}
function tributeDaily(){
  const T=CFG.TRIBUTE;
  const due=T.every-((S.day-1)%T.every);
  const amount=Math.round(T.base+T.perDay*S.day+T.perPop*S.settlers.length);
  S.tributeDue=due;S.tributeAmt=amount;
  if(due===T.warn)log('📜 Императорский сборщик будет через '+T.warn+' дня. Дань: '+amount+' з.');
  if(due===T.every&&S.day>1){ // collection day just passed boundary
    if(S.gold>=amount){S.gold-=amount;S.tributePaid++;
      log('⚖ Дань уплачена: '+amount+' з. Империя довольна.')}
    else{S.rep--;S.uiDirty=true;
      log('⚠ Казна пуста — дань не уплачена! Репутация: '+S.rep+'.');
      if(S.rep<=-3)endSession('Императорские каратели сожгли непокорную Марку.');
    }
  }
}
function endSession(reason){
  if(S.gameOver)return;
  S.gameOver={reason,day:S.day,peak:S.peakPop||S.settlers.length,role:S.role,
    loot:S.lootLost,paid:S.tributePaid};
  S.paused=true;S.uiDirty=true;
  log('☠ '+reason);
}
function computeRole(){
  const t=S.roleTally;
  const val={stone:t.stone,fish:t.fish,wood:t.wood,agr:t.agr*0.35};
  const pairs=[['stone','Горная фактория'],['fish','Рыбацкая гавань'],['wood','Лесной приют'],['agr','Степной хутор']];
  let best=null,bv=8;
  for(const p of pairs)if(val[p[0]]>bv){bv=val[p[0]];best=p[1]}
  const role=best||'Лагерь переселенцев';
  if(role!==S.role){S.role=role;S.uiDirty=true;
    if(best)log('🏛 Поселение обретает лицо: '+role.toLowerCase()+'.')}
}
function onNewDay(){
  // food consumption
  const need=S.settlers.length*CFG.EAT;
  if(S.stock.food>=need){S.stock.food-=need;addResourcePopup('food',-need,S.th.x,S.th.y);
    if(S.hungry){S.hungry=false;log('🍞 Еды снова хватает на всех.')}}
  else{if(S.stock.food>0)addResourcePopup('food',-S.stock.food,S.th.x,S.th.y);S.stock.food=0;
    if(!S.hungry){S.hungry=true;log('⚠ Еда кончилась — жители голодают и работают вполсилы!')}}
  S.stock.food=Math.min(S.stock.food,S.settlers.length*16+24);
  // regrow
  for(let i=S.regrow.length-1;i>=0;i--){const r=S.regrow[i];r.days--;
    if(r.days<=0){
      if(r.kind==='wheat'&&S.feat[r.i]===F.NONE&&S.terr[r.i]===T.GRASS){S.feat[r.i]=F.WHEAT;S.featHp[r.i]=4;S.featDirty=true}
      else if(r.kind==='fish'&&S.feat[r.i]===F.NONE&&S.terr[r.i]===T.WATER){S.feat[r.i]=F.FISH;S.featHp[r.i]=3;S.featDirty=true}
      else if(r.kind==='forest'){ // пенёк прорастает обратно в лес (фикс дедлока дерева)
        if(S.feat[r.i]===F.STUMP&&S.terr[r.i]===T.GRASS&&S.bld[r.i]<0&&!S.road[r.i]){
          S.terr[r.i]=T.FOREST;S.terrHp[r.i]=3;S.feat[r.i]=F.NONE;
          S.terrDirty=true;S.featDirty=true;
        }
      }
      else S.featHp[r.i]=3;
      S.regrow.splice(i,1);
    }}
  for(const b of S.buildings){
    if(b.starve){b.starveD=(b.starveD||0)+1;b.starve=false}
    else if(b.workerId!=null)b.starveD=0;
    if(!b.built)b.age=(b.age||0)+1;
    if(!b.abandoned&&b.built&&(b.type==='farm'||b.type==='lumber'||b.type==='mine'||b.type==='fisher')&&b.starveD>=4){
      b.abandoned=true;S.bldDirty=true;
      log('🕸 Заброшено: '+CFG.BNAME[b.type].toLowerCase()+' — угодья мертвы, люди ушли.');
    }
    // угодья восстановились (лес вырос, поле заколосилось) — люди возвращаются.
    // Шахты не оживают: руда выбрана навсегда, это делв-энкаунтер (п.6).
    if(b.abandoned&&b.built&&!b.ruined&&(b.type==='farm'||b.type==='lumber'||b.type==='fisher')&&
      resScore(b.type,b.x,b.y)>=2){
      b.abandoned=false;b.starveD=0;b.starve=false;S.bldDirty=true;
      log('↻ Угодья ожили — '+CFG.BNAME[b.type].toLowerCase()+' снова в деле.');
    }
  }
  squatDaily();
  S.noForestDays=(forestInInfluence()===0)?(S.noForestDays||0)+1:0;
  assignHauler();

  // Daily outpost upkeep (v2.1): из локальных припасов здания, пополняемых разносчиком.
  for(const b of S.buildings){
    if(!b.built||b.ruined||!connected(b)||b.workerId==null)continue;
    if(b.type==='tower')consumeBuildingUpkeep(b,CFG.UPKEEP.towerDaily,'дозорный пост');
    else if(b.type==='library')consumeBuildingUpkeep(b,CFG.UPKEEP.libraryDaily,'паёк книжников');
  }
  brewDaily();
  tradeDaily();
  craftDaily();
  S.hungryDays=S.hungry?S.hungryDays+1:0;
  if(!S.hungry&&S.day>=4&&housingCap()-S.settlers.length>=1&&bandIdx('food')>=2){
    const foodSites=countB('farm',true)+countB('fisher',true);
    const foodOk=foodSites>=Math.max(1,Math.ceil(S.settlers.length/10))||bandIdx('food')>=3;
    let ch=(foodOk?0.18:0.06)+(countB('tavern',true)>0?0.10:0);
    if(S.rng()<ch)arriveSettler();
  }
  if(S.hungryDays>=3&&S.settlers.length>3){leaveSettler();S.hungryDays=0}
  if(countB('advguild',true)>0&&heroCount()<CFG.HERO.max){
    const c=S.settlers.find(u=>!u.hero&&!isHauler(u)&&u.idleDays>=CFG.HERO.idleDays);
    if(c)makeHero(c);
  }
  lairsDaily();
  tributeDaily();
  if(S.settlers.length<=0)endSession('Поселение опустело — Марка вернулась дикому краю.');
  // idleness
  for(const u of S.settlers){
    if(u.worksToday===0)u.idleDays++;else u.idleDays=0;
    u.worksToday=0;
  }
  computeLevels();
  // role decay + compute
  for(const k in S.roleTally)S.roleTally[k]*=0.88;
  computeRole();
  if(S.day%CFG.BUILD_EVERY===0)settleThink();
  S.uiDirty=true;
}
function tick(dt){
  if(S.gameOver)return;
  S.time+=dt;
  const cyc=CFG.DAY+CFG.NIGHT;
  const day=Math.floor(S.time/cyc)+1;
  const night=(S.time%cyc)>=CFG.DAY;
  if(night&&!S.isNight){S.isNight=true;S.uiDirty=true;
    log('🌙 Ночь опускается на Марку — жители тянутся к очагу.');rebuildJobs()}
  if(!night&&S.isNight){S.isNight=false;S.uiDirty=true;wakeAll();
    log('☀ Рассвет. Поселение просыпается.')}
  if(day!==S.day){S.day=day;onNewDay()}
  S.jobT-=dt;if(S.jobT<=0){rebuildJobs();S.jobT=1}
  S.visT-=dt;if(S.visT<=0){recomputeVision();S.visT=0.3}
  for(const u of S.settlers)settlerTick(u,dt);
  for(const b of S.buildings)if(b.cd>0)b.cd-=dt;
  for(const w of S.warbands)if(!w.done)warbandTick(w,dt);
  for(let i=S.ships.length-1;i>=0;i--){
    const sh=S.ships[i];sh.t+=dt;
    sh.x+=sh.dx*0.55*dt;sh.y+=sh.dy*0.55*dt;
    if(sh.t>=sh.ttl)S.ships.splice(i,1);
  }
  if(S.party)partyTick(dt);
  if(S.warbands.length&&S.warbands.every(w=>w.done))S.warbands.length=0;
  if(S.settlers.length>(S.peakPop||0))S.peakPop=S.settlers.length;
}
function wakeAll(){
  for(const u of S.settlers){
    if(u.act==='rest'){exitBuilding(u);u.act='idle';u.wanderT=S.rng()*1.5}
    u.drankToday=false;
  }
}

