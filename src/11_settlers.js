function scoutAnchors(){
  const a=[{x:S.th.x,y:S.th.y}];
  for(const b of S.buildings)
    if(b.built&&!b.ruined&&b.type==='tower'&&connected(b))a.push({x:b.x,y:b.y});
  return a;
}
function findFrontier(u){
  let best=null,bd=1e9;
  const R=CFG.SCOUT_R,anchors=scoutAnchors();
  for(const an of anchors){
    for(let y=Math.max(0,an.y-R);y<=Math.min(S.H-1,an.y+R);y++)
    for(let x=Math.max(0,an.x-R);x<=Math.min(S.W-1,an.x+R);x++){
      const i=idx(x,y);
      if(!S.explored[i]||!S.pass[i]||S.fear[i])continue;
      let edge=false;
      for(const d of hexDirs(x)){const nx=x+d[0],ny=y+d[1];
        if(inMap(nx,ny)&&!S.explored[idx(nx,ny)])edge=true}
      if(!edge)continue;
      const dd=cheb(u.x|0,u.y|0,x,y);
      if(dd<bd){bd=dd;best={x,y}}
    }
  }
  return best;
}
function towerFrontier(b){
  // v2.1: фронтир в радиусе влияния вышки — цель дневной разведки дозорного
  if(!b)return null;
  const R=CFG.TOWER_INFLUENCE;let best=null,bd=1e9;
  for(let y=Math.max(0,b.y-R);y<=Math.min(S.H-1,b.y+R);y++)
  for(let x=Math.max(0,b.x-R);x<=Math.min(S.W-1,b.x+R);x++){
    const i=idx(x,y);
    if(!S.explored[i]||!S.pass[i]||S.fear[i])continue;
    let edge=false;
    for(const d of hexDirs(x)){const nx=x+d[0],ny=y+d[1];
      if(inMap(nx,ny)&&!S.explored[idx(nx,ny)])edge=true}
    if(!edge)continue;
    const dd=cheb(b.x,b.y,x,y);
    if(dd<bd){bd=dd;best={x,y}}
  }
  return best;
}
function findRestPlace(u){
  if(!u)u={wallet:0,drankToday:true,x:S.th.x+0.5,y:S.th.y+0.5};
  let tav=-1;
  for(let bi=0;bi<S.buildings.length;bi++){
    const b=S.buildings[bi];
    if(b.built&&!b.ruined&&connected(b)&&b.type==='tavern'){tav=bi;break}
  }
  // п.5: в таверне пьют ЭЛЬ (сварен из зерна ферм), а не еду со склада
  if(tav>=0&&(S.buildings[tav].ale||0)>=1&&u.wallet>=CFG.DRINK_PRICE&&!u.drankToday)return tav;
  // своя лачуга: ближайший hut со свободным местом (дом тир-2 вмещает троих, п.10)
  const occ={};
  for(const o of S.settlers)if(o.inside>=0)occ[o.inside]=(occ[o.inside]||0)+1;
  let best=-1,bd=1e9;
  for(let bi=0;bi<S.buildings.length;bi++){
    const b=S.buildings[bi];
    if(!b.built||b.ruined||b.type!=='hut'||!connected(b))continue;
    if((occ[bi]||0)>=houseCapOf(b))continue;
    const d=cheb(u.x|0,u.y|0,b.x,b.y);
    if(d<bd){bd=d;best=bi}
  }
  if(best>=0)return best;
  if(tav>=0)return tav;
  return 0;
}
function goRest(u){
  const bi=findRestPlace(u),b=S.buildings[bi];
  const p=findPath(S,u.x|0,u.y|0,b.x,b.y,true);
  if(p===null){u.act='idle';u.wanderT=2;return}
  releaseJob(u);marketClearRefs(u,'haulMarketRefs',true);marketClearRefs(u,'supplyMarketRefs',true);u.carry=null;
  u.path=p;u.pathI=0;u.act='goto';u.after='rest';u.restB=bi;
}
function enterRest(u){
  if(u.hero)buyGear(u);
  const b=S.buildings[u.restB];
  u.inside=u.restB;u.act='rest';
  if(b.type==='tavern'&&!u.drankToday){
    if((b.ale||0)>=1&&u.wallet>=CFG.DRINK_PRICE){
      b.ale--;S.aleDrunk=(S.aleDrunk||0)+1;
      u.wallet-=CFG.DRINK_PRICE;S.gold+=CFG.DRINK_PRICE;
      S.tavernIncome+=CFG.DRINK_PRICE;u.drankToday=true;u.tipsy=true;
      addInfoPopup('🍺',b.x,b.y,'info');
    }
  }
}
function exitBuilding(u){
  for(const b of S.buildings)if(b.workerId===u.id)b.workerId=null;
  u.inside=-1;u.tipsy=false;
}
function settlerTick(u,dt){
  u.px=u.x;u.py=u.y;
  const RC=CFG.RACE[u.race];
  switch(u.act){
    case 'sail':{
      u.sailT-=dt;
      {const b=S.buildings[u.inside];if(b&&b.type==='port')b.sailLeft=Math.max(0,u.sailT)}
      if(u.sailT<=0){
        const b=S.buildings[u.inside];
        if(b&&b.type==='port'){
          let g=0;
          for(const r in b.hold){g+=b.hold[r]*CFG.PRICE[r]*CFG.SEA_MARKUP;b.hold[r]=0}
          S.gold+=g;addResourcePopup('gold',g,b.x,b.y);S.tradeGold+=g;b.sailing=false;b.sailLeft=0;b.sailTotal=0;b.captainId=null;
          launchShip(b,-1);addInfoPopup('⚓',b.x,b.y,'info');
          log('⚓ Корабль вернулся: выручка '+g.toFixed(0)+' з в казну.');
          computeLevels();S.uiDirty=true;
        }
        u.act='work';u.workT=CFG.OPER_T;
      }
      break;
    }
    case 'rest':{
      const b=S.buildings[u.inside];
      const rate=(b&&b.type==='tavern'&&u.tipsy)?CFG.REST_TAVERN:CFG.REST_NIGHT;
      u.stam=Math.min(CFG.STAM_MAX,u.stam+rate*dt);
      if(u.hero&&u.hero.hp<u.hero.maxHp)u.hero.hp=Math.min(u.hero.maxHp,u.hero.hp+dt*0.8);
      if(!S.isNight&&!S.alarm&&u.stam>=90){exitBuilding(u);u.act='idle';u.wanderT=0.5}
      break;
    }
    case 'idle':{
      u.wanderT-=dt;
      if(u.wanderT>0)break;
      if(S.isNight||S.alarm||u.stam<CFG.STAM_LOW){goRest(u);break}
      if(isHauler(u)){haulThink(u);break}
      if(u.hero){ // heroes lounge at the tavern between contracts
        if(S.rng()<0.5){goRest(u)}else{
          const b=S.buildings[findRestPlace()];
          for(let a=0;a<8;a++){
            const x=b.x+((S.rng()*5)|0)-2,y=b.y+((S.rng()*5)|0)-2;
            if(inMap(x,y)&&S.pass[idx(x,y)]){
              const p=findPath(S,u.x|0,u.y|0,x,y,false);
              if(p){u.path=p;u.pathI=0;u.act='goto';u.after=null}
              break;
            }
          }
        }
        u.wanderT=3+S.rng()*3;break;
      }
      const j=pickJob(u);
      if(j&&assignJob(u,j)){u.lastKind=j.kind;break}
      // no work: passive scouting or wandering
      const fr=(S.rng()<0.3*RC.scout)?findFrontier(u):null;
      let target=null,after='wander';
      if(fr){target=fr;after='scout'}
      else{
        for(let a=0;a<10;a++){
          const x=S.th.x+((S.rng()*9)|0)-4,y=S.th.y+((S.rng()*9)|0)-4;
          if(inMap(x,y)&&S.pass[idx(x,y)]){target={x,y};break}
        }
      }
      if(target){
        const p=findPath(S,u.x|0,u.y|0,target.x,target.y,false);
        if(p){u.path=p;u.pathI=0;u.act='goto';u.after=after}
      }
      u.wanderT=2+S.rng()*3;
      break;
    }
    case 'goto':{
      const wp=u.path&&u.path[u.pathI];
      if(!wp){arrive(u);break}
      const gx=wp.x+0.5,gy=wp.y+0.5;
      const dx=gx-u.x,dy=gy-u.y;
      const dist=Math.hypot(dx,dy);
      let step=CFG.WALK*RC.move*dt*(S.hungry?0.6:1)*(u.stam<CFG.STAM_LOW?0.7:1);
      if(u.carry){
        u.stam=Math.max(0,u.stam-CFG.STAM_CARRY*dt);
        if(u.race!=='troll')step*=0.5;
      }
      if(S.road[idx(u.x|0,u.y|0)])step*=CFG.ROAD_SPEED;
      else step*=terrainSpeed(u,u.x|0,u.y|0);
      if(dx!==0)u.fx=dx>0?1:-1;
      if(dist>0.01){u.dirX=dx/dist;u.dirY=dy/dist}
      if(dist<=step){u.x=gx;u.y=gy;u.pathI++;
        if(u.pathI<u.path.length){
          const nw=u.path[u.pathI];
          if(!S.pass[idx(nw.x,nw.y)]){
            if(!u.repathed&&u.job){u.repathed=true;
              const p=findPath(S,u.x|0,u.y|0,u.job.x,u.job.y,u.job.adj);
              if(p){u.path=p;u.pathI=0}else{releaseJob(u);u.act='idle'}
            }else{releaseJob(u);u.carry=null;u.act='idle'}
          }
        }
        if(u.pathI>=u.path.length)arrive(u);
      }else{u.x+=dx/dist*step;u.y+=dy/dist*step}
      break;
    }
    case 'work':{
      const isWatch=(u.job&&u.job.kind==='watch');
      if(!isWatch){
        u.stam=Math.max(0,u.stam-CFG.STAM_WORK*dt);
        if(u.stam<=0||S.isNight){
          if(u.harvesting||u.fieldB!==undefined){u.harvesting=false;fieldAbort(u)}
          else{exitBuilding(u);releaseJob(u)}
          goRest(u);break}
      }
      u.workT-=dt;
      if(u.workT<=0){
        if(u.harvesting){u.harvesting=false;fieldHarvest(u)}
        else completeJob(u);
      }
      break;
    }
  }
}
function workMul(u,kind){
  const RC=CFG.RACE[u.race];
  if(kind==='build'||kind==='repair')return RC.build;
  if(kind==='clear'&&u.race==='troll')return 1.3;
  if(kind==='oper'||kind==='ruins')return RC.work;
  return 1;
}
function arrive(u){
  const after=u.after;u.after=null;u.path=null;
  if(after==='work'){
    if(u.job&&jobValid(u.job)){
      const k=u.job.kind;
      if(k==='supply'){startSupply(u);return}
      u.act='work';
      u.workT=(k==='oper'?CFG.OPER_T:(k==='repair'?4:CFG.WORK[k]||4))/workMul(u,k);
      if((k==='oper'||k==='watch')&&u.job.b!==undefined){
        const b=S.buildings[u.job.b];
        b.workerId=u.id;
        if(k==='watch'||b.type==='mine'||b.type==='fisher'||b.type==='port'||b.type==='library')u.inside=u.job.b;
        else u.workT=0.6; // полевой: короткий сбор инструмента у здания и в поле
      }
    }
    else{releaseJob(u);u.act='idle'}
  }else if(after==='deposit'){deposit(u)}
  else if(after==='rest'){enterRest(u)}
  else if(after==='pickup'){doPickup(u)}
  else if(after==='harvGo'){u.act='work';u.workT=CFG.WORK.harvest/workMul(u,'oper');u.harvesting=true}
  else if(after==='harvBack'){fieldReturn(u)}
  else if(after==='supplySrc'){supplyPick(u)}
  else if(after==='expSrc'){expPick(u)}
  else if(after==='expDst'){expDrop(u)}
  else if(after==='supplyDst'){supplyDrop(u)}
  else if(after==='rstSrc'){rstPick(u)}
  else if(after==='rstDst'){rstDrop(u)}
  else if(after==='wtScout'){
    // v2.1: дозорный раскрыл клетку фронтира и возвращается на вышку
    exploreRing(u.x|0,u.y|0);
    if(u.race==='elf')for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const x=(u.x|0)+dx,y=(u.y|0)+dy;
      if(inMap(x,y)&&!S.explored[idx(x,y)]){S.explored[idx(x,y)]=1;S.fogDirty=true}
    }
    const b=S.buildings[u.wtB];
    const p=(b&&u.job&&u.job.kind==='watch')?findPath(S,u.x|0,u.y|0,b.x,b.y,true):null;
    if(p){u.path=p;u.pathI=0;u.act='goto';u.after='work'}
    else{if(b&&b.workerId===u.id)b.workerId=null;releaseJob(u);u.act='idle';u.wanderT=1}
  }
  else if(after==='scout'){
    exploreRing(u.x|0,u.y|0);
    if(u.race==='elf')for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const x=(u.x|0)+dx,y=(u.y|0)+dy;
      if(inMap(x,y)&&!S.explored[idx(x,y)]){S.explored[idx(x,y)]=1;S.fogDirty=true}
    }
    u.act='idle';u.wanderT=0.8;
  }
  else{u.act='idle'}
}

