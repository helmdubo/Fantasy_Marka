function claimKey(j){return j.kind+':'+j.x+':'+j.y}
function rebuildJobs(){
  S.jobPool.length=0;
  if(S.isNight||S.phase==='scout')return; // до ратуши — только разведка
  const seenR=new Set();
  for(const an of influenceAnchors()){
    const R=an.r;
    for(let y=Math.max(0,an.y-R);y<=Math.min(S.H-1,an.y+R);y++)
    for(let x=Math.max(0,an.x-R);x<=Math.min(S.W-1,an.x+R);x++){
      const i=idx(x,y);
      if(seenR.has(i))continue;seenR.add(i);
      if(!S.explored[i]||S.fear[i])continue;
      // v2.2: древние руины — данжен героев (genRuinLairs), работы поселенцам нет
    }
  }
  for(let pi=0;pi<S.roadPlans.length;pi++){
    const pl=S.roadPlans[pi];
    const c=pl.cells[pl.i];
    if(!c)continue;
    const i=idx(c.x,c.y);
    const blocked=(S.terr[i]===T.FOREST&&S.terrHp[i]>0)||S.feat[i]===F.WHEAT||S.feat[i]===F.STUMP;
    S.jobPool.push({kind:blocked?'clear':'pave',x:c.x,y:c.y,adj:true,plan:pi,bridge:!!pl.bridge});
  }
  for(let bi=0;bi<S.buildings.length;bi++){
    const b=S.buildings[bi];
    if(!b.built){
      // п.1: фундамент за рекой ждёт моста — сначала мостовой план, потом снабжение
      if(b.waitBridge){
        if(S.roadPlans.some(pl=>pl.id===b.waitBridge))continue;
        b.waitBridge=null;
      }
      const miss=missingRes(b);
      if(miss)S.jobPool.push({kind:'supply',x:b.x,y:b.y,adj:true,b:bi,res:miss});
      else S.jobPool.push({kind:'build',x:b.x,y:b.y,adj:true,b:bi});
      continue}
    if(b.ruined){S.jobPool.push({kind:'repair',x:b.x,y:b.y,adj:true,b:bi});continue}
    if(!connected(b)||b.abandoned)continue;
    if(b.workerId!=null)continue;
    if(b.type==='tower')S.jobPool.push({kind:'watch',x:b.x,y:b.y,adj:true,b:bi});
    else if(b.type==='library'&&researchNext())S.jobPool.push({kind:'oper',x:b.x,y:b.y,adj:true,b:bi});
    else if(b.type==='port'&&!b.sailing)S.jobPool.push({kind:'oper',x:b.x,y:b.y,adj:true,b:bi});
    else if((b.type==='farm'||b.type==='fisher'||b.type==='lumber'||b.type==='mine')&&!b.delve&&!b.starve&&bufTotal(b)<capOf(b))
      S.jobPool.push({kind:'oper',x:b.x,y:b.y,adj:true,b:bi});
  }
  rebuildMarketFromJobs();
}
function bufTotal(b){return b.buf.food+b.buf.wood+b.buf.stone+b.buf.gems}
function holdTotal(b){return b.hold?b.hold.food+b.hold.wood+b.hold.stone+b.hold.gems:0}
function missingRes(b){
  if(!b.need)return null;
  for(const r in b.need)if((b.got[r]||0)<b.need[r])return r;
  return null;
}
function capOf(b){return CFG.BUF_CAP*(b.tier||1)}
function pickJob(u){
  if(isHauler(u)||u.hero)return null;
  const marketJob=marketSelectLaborJob(u);
  if(marketJob)return marketJob;
  // fallback на старый jobPool, если рынок ещё не собран
  let best=null,bu=-1;
  for(const j of S.jobPool){
    let base=UTIL[j.kind];
    if(!base)continue;
    if(j.bridge)base+=1.4; // мост важнее прочей дорожной рутины (п.1)
    const key=claimKey(j);
    if(S.claims.has(key))continue;
    const bad=S.badCells.get(key);
    if(bad!==undefined&&bad>=S.day)continue;
    const d=cheb(u.x|0,u.y|0,j.x,j.y);
    let util=base*(30/(8+d));
    if(j.kind==='oper'&&u.race==='dwarf'&&S.buildings[j.b].type==='mine')util*=1.5;
    util+=hash2(u.id,j.x*67+j.y,S.day)*0.4;
    if(util>bu){bu=util;best=j}
  }
  return best;
}
function assignJob(u,j){
  const path=findPath(S,u.x|0,u.y|0,j.x,j.y,j.adj);
  if(path===null){S.badCells.set(claimKey(j),S.day);return false}
  S.claims.add(claimKey(j));
  if(j._marketOfferId)u.jobMarketRef=marketReserveId(j._marketOfferId,1,u.id);
  u.job=j;u.path=path;u.pathI=0;u.act='goto';u.after='work';u.repathed=false;
  return true;
}
function releaseJob(u){
  if(u.job){S.claims.delete(claimKey(u.job));u.job=null}
  if(u.jobMarketRef){marketReleaseRef(u.jobMarketRef);u.jobMarketRef=null}
}
function jobValid(j){
  const i=idx(j.x,j.y);
  switch(j.kind){
    case 'clear':case 'pave':{const pl=S.roadPlans[j.plan];
      return !!(pl&&pl.cells[pl.i]&&pl.cells[pl.i].x===j.x&&pl.cells[pl.i].y===j.y)}
    case 'supply':{const b=S.buildings[j.b];return !!(b&&!b.built&&missingRes(b))}
    case 'build':{const b=S.buildings[j.b];return !!(b&&!b.built&&!missingRes(b))}
    case 'oper':{const b=S.buildings[j.b];
      if(!b||!b.built||b.ruined||b.workerId!=null)return false;
      if(b.type==='port')return !b.sailing;
      return !b.starve&&!b.delve&&bufTotal(b)<capOf(b)}
    case 'watch':{const b=S.buildings[j.b];return b&&b.built&&!b.ruined&&b.workerId==null}
    case 'repair':{const b=S.buildings[j.b];return b&&b.ruined}
  }
  return false;
}
function lumberNear(x,y){
  for(const b of S.buildings)if(b.built&&b.type==='lumber'&&cheb(x,y,b.x,b.y)<=5)return true;
  return false;
}

function consumeBuildingUpkeep(b,cost,label){
  // v2.1: расход идёт из ЛОКАЛЬНОГО запаса здания (b.store), а не со склада ратуши.
  // Запас пополняет складской разносчик по restock-заявке, когда припасы подходят к концу.
  for(const r in cost){
    if(((b.store&&b.store[r])||0)<cost[r]){
      if(!b.upkeepWarnDay||b.upkeepWarnDay!==S.day){
        b.upkeepWarnDay=S.day;
        log('⚠ '+CFG.BNAME[b.type]+': припасы вышли — нет '+r+' для «'+label+'», ждём разносчика.');
      }
      return false;
    }
  }
  for(const r in cost){
    b.store[r]-=cost[r];
    addResourcePopup(r,-cost[r],b.x,b.y);
  }
  return true;
}

function harvestCycle(u,b){
  const R=CFG.HARVEST_R+((b.tier||1)-1);
  const tryCells=(fn)=>{
    for(let r=1;r<=R;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
      const x=b.x+dx,y=b.y+dy;
      if(!inMap(x,y))continue;
      const got=fn(x,y,idx(x,y));
      if(got)return true;
    }
    return false;
  };
  let ok=false;
  if(b.type==='lumber'){
    ok=tryCells((x,y,i)=>{
      if(S.terr[i]!==T.FOREST||S.terrHp[i]<=0)return false;
      S.terrHp[i]--;b.buf.wood+=1+b.tier;addResourcePopup('wood',1+b.tier,b.x,b.y);
      if(S.terrHp[i]<=0){S.terr[i]=T.GRASS;S.feat[i]=F.STUMP;S.terrDirty=true;S.featDirty=true;
        S.regrow.push({i,days:15+((S.rng()*8)|0),kind:'forest'});rebuildPass()}
      return true;
    });
  }else if(b.type==='farm'){
    ok=tryCells((x,y,i)=>{
      if(S.feat[i]!==F.WHEAT||S.featHp[i]<=0)return false;
      S.featHp[i]--;b.buf.food+=1+b.tier;addResourcePopup('food',1+b.tier,b.x,b.y);
      if(S.featHp[i]<=0){S.feat[i]=F.NONE;S.featDirty=true;S.regrow.push({i,days:5,kind:'wheat'})}
      return true;
    });
  }else if(b.type==='fisher'){
    ok=tryCells((x,y,i)=>{
      if(S.feat[i]!==F.FISH)return false;
      b.buf.food+=1+b.tier;addResourcePopup('food',1+b.tier,b.x,b.y);
      if(S.waterKind[i]===1&&S.rng()<0.20){ // lake fish depletes slowly; early причалы should not die in two days
        S.featHp[i]--;
        if(S.featHp[i]<=0){S.feat[i]=F.NONE;S.featDirty=true;S.regrow.push({i,days:3,kind:'fish'})}
      }
      return true;
    });
  }else if(b.type==='mine'){
    let mtn=false;
    tryCells((x,y,i)=>{if(S.terr[i]===T.MTN||S.terr[i]===T.ROCK){mtn=true;return true}return false});
    if(mtn){
      if((b.data.oreLeft||0)<=0){ // рудное тело выбрано (п.6)
        b.abandoned=true;S.bldDirty=true;
        log('⛏ Шахта выработана до дна — штольни брошены. Теперь это дело для героев.');
        return true;
      }
      if(!consumeBuildingUpkeep(b,CFG.UPKEEP.mine,'крепь шахты'))return false;
      b.buf.stone+=1;b.data.oreLeft--;addResourcePopup('stone',1,b.x,b.y);ok=true;
      if((b.tier||1)>=CFG.MINE.gemTier)tryCells((x,y,i)=>{ // самоцветы — тир 2+ (п.6)
        if(S.feat[i]!==F.VEIN)return false;
        const ch=(u.race==='dwarf')?0.5:0.2;
        if(S.rng()<ch){b.buf.gems+=1;addResourcePopup('gems',1,b.x,b.y);S.featHp[i]--;
          if(S.featHp[i]<=0){S.feat[i]=F.NONE;S.featDirty=true;
            log('⛏ Жила у шахты выработана — гора опустела.')}}
        return true;
      });
      if(b.data.oreLeft<=0){
        b.abandoned=true;S.bldDirty=true;
        log('⛏ Шахта выработана до дна — штольни брошены. Теперь это дело для героев.');
      }
    }
  }
  if(!ok){
    b.starve=true;
    log('🕸 '+CFG.BNAME[b.type]+': окрестные угодья истощены, работа встала.');
  }
  return ok;
}
function recomputeRoadConn(){
  S.roadConn.fill(0);
  const start=idx(S.th.x,S.th.y);
  if(!S.road[start])S.road[start]=1;
  const q=[start];S.roadConn[start]=1;
  for(let h=0;h<q.length;h++){
    const c=q[h],cx=c%S.W,cy=(c/S.W)|0;
    for(const d of hexDirs(cx)){
      const nx=cx+d[0],ny=cy+d[1];
      if(!inMap(nx,ny))continue;
      const ni=idx(nx,ny);
      if(S.road[ni]&&!S.roadConn[ni]){S.roadConn[ni]=1;q.push(ni)}
    }
  }
  // log newly connected buildings
  for(const b of S.buildings){
    if(b.built&&!b.connWas&&connected(b)){b.connWas=true;
      if(b.type!=='townhall')log('⛓ Подключено к тракту: '+CFG.BNAME[b.type].toLowerCase()+'.')}
  }
}
function connected(b){return b.type==='townhall'||!!S.roadConn[idx(b.x,b.y)]}
function roadLay(pi){
  const pl=S.roadPlans[pi];if(!pl)return;
  const c=pl.cells[pl.i];
  const ci=idx(c.x,c.y);
  S.road[ci]=1;S.roadDirty=true;
  // мост: дорога легла на второй берег речного ребра — переход открыт
  if(S.riverEdges&&S.riverEdges.size)for(const d of hexDirs(c.x)){
    const nx=c.x+d[0],ny=c.y+d[1];
    if(!inMap(nx,ny)||!S.road[idx(nx,ny)])continue;
    if(S.riverEdges.has(edgeKeyCells(ci,idx(nx,ny)))){
      log('🌉 Мост наведён через реку ('+c.x+','+c.y+').');break;
    }
  }
  recomputeRoadConn();
  pl.i++;
  if(pl.i>=pl.cells.length){S.roadPlans.splice(pi,1);
    log('🛤 Дорога достроена: '+pl.name+'.')}
}
function completeJob(u){
  const j=u.job;if(!j){u.act='idle';return}
  const i=idx(j.x,j.y);
  let carry=null;
  switch(j.kind){
    case 'clear':{
      if(S.terr[i]===T.FOREST){S.terrHp[i]=0;S.terr[i]=T.GRASS;S.terrDirty=true;rebuildPass();
        S.stock.wood+=2;addResourcePopup('wood',2,j.x,j.y);computeLevels()}
      if(S.feat[i]===F.WHEAT||S.feat[i]===F.STUMP){S.feat[i]=F.NONE;S.featDirty=true}
      addSkillXp(u,'axe',0.8);roadLay(j.plan);break}
    case 'pave':addSkillXp(u,'craft',0.6);roadLay(j.plan);break;
    case 'build':{const b=S.buildings[j.b];b.work--;addSkillXp(u,'craft',1);
      if(b.work<=0)finishBuilding(b);break}
    case 'watch':{
      // v2.1: днём дозорный выходит разведывать закрытую территорию вокруг вышки.
      // Пост числится за ним (workerId остаётся), ночью — обычный дозор на месте.
      if(!S.isNight){
        const b=S.buildings[j.b];
        const fr=b?towerFrontier(b):null;
        if(fr){
          const p=findPath(S,u.x|0,u.y|0,fr.x,fr.y,false);
          if(p){u.inside=-1;u.path=p;u.pathI=0;u.act='goto';u.after='wtScout';u.wtB=j.b;return}
        }
      }
      addSkillXp(u,'vigil',0.3);u.workT=CFG.WORK.patrol;return}
    case 'repair':{const b=S.buildings[j.b];
      b.repWork=(b.repWork||2)-1;addSkillXp(u,'craft',1);
      if(b.repWork<=0){b.ruined=false;b.repWork=undefined;S.bldDirty=true;
        log('🔨 Восстановлено: '+CFG.BNAME[b.type].toLowerCase()+'.')}
      break}
    case 'oper':{
      const b=S.buildings[j.b];
      if(b.type==='port'){
        // п.3: без корабля в море не выйти — рабочий строит его на верфи
        if(!b.ship){
          if((b.shipWork||0)>0){
            b.shipWork--;
            addInfoPopup('🔨⛵',b.x,b.y,'info');
            if(b.shipWork<=0){b.ship=true;S.uiDirty=true;
              log('⛵ Корабль спущен на воду! Порт готов к морской торговле.')}
            u.workT=CFG.OPER_T/workMul(u,'build');return;
          }
          u.workT=CFG.OPER_T;return; // ждём закладки корабля (дерево на верфь)
        }
        // п.4: погрузка золота под импортный заказ
        if(b.importPlan&&(b.holdGold||0)<b.importPlan.cost){
          const take=Math.min(24,b.importPlan.cost-(b.holdGold||0),Math.floor(S.gold));
          if(take>0){S.gold-=take;b.holdGold=(b.holdGold||0)+take;
            addResourcePopup('gold',-take,b.x,b.y)}
        }
        if(sailReady(b)){
          if(!consumeBuildingUpkeep(b,CFG.UPKEEP.portSail,'подготовка доков')){u.workT=CFG.OPER_T;return}
          startPortSail(b,u); // оператор становится капитаном
          return; // keep claim & workerId & inside
        }
        u.workT=CFG.OPER_T;return; // ждём наполнения трюма/казны
      }
      if(b.type==='library'){
        // v2.1: книжник ведёт исследование — открытия новых строений
        researchCycle(u,b);
        if(researchNext()){u.workT=CFG.OPER_T/workMul(u,'oper');return}
        break; // всё открыто — работник свободен
      }
      if(b.type==='mine'||b.type==='fisher'){
        const ok=harvestCycle(u,b);
        if(ok)addSkillXp(u,b.type==='mine'?'grit':'herb',1);
        if(ok&&bufTotal(b)<capOf(b)){u.workT=CFG.OPER_T/workMul(u,'oper');return}
        if(bufTotal(b)>0&&(S.haulerId<0||bufTotal(b)>=capOf(b))){
          carry={_src:b.type};
          for(const r2 in b.buf){if(b.buf[r2]>0){carry[r2]=b.buf[r2];addResourcePopup(r2,-b.buf[r2],b.x,b.y);b.buf[r2]=0}}
          u.selfHaul=true;
        }
        break;
      }
      // farm/lumber: полевой цикл — работник у здания выбирает угодье и бежит туда
      const tgt=fieldTarget(b);
      if(!tgt){b.starve=true;b.workerId=null;
        log('🕸 '+CFG.BNAME[b.type]+': окрестные угодья истощены, работа встала.');
        break}
      const p=findPath(S,u.x|0,u.y|0,tgt.x,tgt.y,tgt.adj);
      if(!p){b.workerId=null;break}
      u.fieldB=j.b;u.fieldCell=tgt;
      u.path=p;u.pathI=0;u.act='goto';u.after='harvGo';
      return; // keep claim & workerId
    }
  }
  exitBuilding(u);
  releaseJob(u);
  if(carry){
    u.carry=carry;
    const p=findPath(S,u.x|0,u.y|0,S.th.x,S.th.y,true);
    if(p===null){u.carry=null;u.act='idle';return}
    u.path=p;u.pathI=0;u.act='goto';u.after='deposit';
  }else{
    u.act='idle';u.wanderT=0.4;
  }
}
