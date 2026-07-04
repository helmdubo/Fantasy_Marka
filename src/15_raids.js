function lairsDaily(){
  for(const w of S.warbands)if(!w.done&&S.day-w.born>=4){w.done=true;
    log('🌫 Вражеский отряд сгинул в глуши, не дойдя до цели.');
    if(!S.warbands.some(x=>!x.done))setAlarm(false)}
  for(let li=0;li<S.lairs.length;li++){
    const L=S.lairs[li];
    if(L.dead)continue;
    L.hoard+=L.tier*1.2;
    if(S.day%8===0)L.str=Math.min(4+4*L.tier,L.str+1);
    if(L.cd>0){L.cd--;continue}
    L.aggro+=CFG.RAID.aggroDay[L.tier]||1.5;
    if(L.aggro>=100)launchRaid(li);
  }
}
function launchRaid(li){
  const L=S.lairs[li];
  L.aggro=0;L.cd=6;
  const p=findRaidPath(L.x,L.y);
  if(!p){log('👁 Из логова доносится вой, но тропы к Марке нет.');return}
  S.warbands.push({li,born:S.day,x:L.x+0.5,y:L.y+0.5,px:L.x+0.5,py:L.y+0.5,
    path:p,pathI:0,phase:'toTown',loot:0,seen:false,size:1+L.tier});
  S.raidsSeen++;
  // watchtower early warning
  let early=false;
  for(const b of S.buildings)
    if(b.built&&b.type==='tower'&&b.workerId!=null&&cheb(b.x,b.y,L.x,L.y)<=CFG.INFLUENCE+4)early=true;
  if(early){setAlarm(true);log('🔔 Дозорный бьёт в колокол: из «'+L.name+'» вышел отряд!')}
}
function findRaidPath(x,y){
  // raiders ignore fear; temporary pass without fear is same grid
  const savedLair=S.lairAt[idx(x,y)];
  S.lairAt[idx(x,y)]=-1;rebuildPass();
  const p=findPath(S,x,y,S.th.x,S.th.y,true);
  S.lairAt[idx(x,y)]=savedLair;rebuildPass();
  return p;
}
function setAlarm(v){
  if(S.alarm===v)return;
  S.alarm=v;S.uiDirty=true;
  if(!v)log('🕊 Набег отбит расстоянием — жители выходят из укрытий.');
}
function warbandTick(w,dt){
  w.px=w.x;w.py=w.y;
  const path=w.path;
  if(w.pathI>=path.length){
    if(w.phase==='toTown'){doLoot(w)}
    else{ // reached home
      S.lairs[w.li].hoard+=w.loot;
      w.done=true;
      if(!S.warbands.some(x=>!x.done&&x!==w))setAlarm(false);
    }
    return;
  }
  const wp=path[w.pathI],gx=wp.x+0.5,gy=wp.y+0.5;
  const dx=gx-w.x,dy=gy-w.y,d=Math.hypot(dx,dy);
  const st=CFG.RAID.speed*dt;
  if(d<=st){w.x=gx;w.y=gy;w.pathI++}
  else{w.x+=dx/d*st;w.y+=dy/d*st}
  // detection
  const ci=idx(w.x|0,w.y|0);
  if(!w.seen&&(S.visible[ci]||S.revealAll)){
    w.seen=true;
    if(!S.alarm){setAlarm(true);
      log('🔔 Тревога! Замечен вражеский отряд из «'+S.lairs[w.li].name+'»!')}
  }
  // wound settlers caught outside
  if(w.phase==='toTown')for(const u of S.settlers){
    if(u.inside<0&&(u.x|0)===(w.x|0)&&(u.y|0)===(w.y|0)&&u.stam>0){
      u.stam=0;releaseJob(u);u.carry=null;u.after=null;u.path=null;u.act='idle';u.selfHaul=false;
      log('🩸 '+RNAME[u.race]+' №'+u.id+' ранен налётчиками!');
    }
  }
}
function doLoot(w){
  const L=S.lairs[w.li];
  let loot=0;
  const want=CFG.RAID.lootBase+Math.floor(L.str/2);
  for(const r of ['gems','stone','wood','food']){
    const take=Math.min(S.stock[r],Math.ceil(want/2));
    S.stock[r]-=take;loot+=take*(CFG.PRICE[r]*2);
    if(loot>=want)break;
  }
  const g=Math.min(S.gold*0.2,6+L.str/3);
  S.gold-=g;loot+=g;
  S.lootLost+=loot;
  if(S.rng()<CFG.RAID.burnCh){
    const targets=S.buildings.filter(b=>b.built&&!b.ruined&&b.type!=='townhall');
    if(targets.length){
      const b=targets[(S.rng()*targets.length)|0];
      b.ruined=true;
      if(b.workerId!=null){const u=S.settlers.find(x=>x.id===b.workerId);
        if(u){exitBuilding(u);releaseJob(u);u.act='idle'}}
      S.bldDirty=true;
      log('🔥 Налётчики подожгли: '+CFG.BNAME[b.type].toLowerCase()+'! Нужен ремонт.');
    }
  }
  log('💰 Отряд «'+L.name+'» разграбил склады и уходит с добычей.');
  computeLevels();
  // path back
  const back=findRaidPath(w.x|0===L.x?L.x:L.x,L.y); // recompute from town to lair
  const p=findPath(S,w.x|0,w.y|0,L.x,L.y,true);
  w.loot=loot;w.phase='back';
  if(p){w.path=p;w.pathI=0}
  else{w.done=true;S.lairs[w.li].hoard+=loot;
    if(!S.warbands.some(x=>!x.done&&x!==w))setAlarm(false)}
}
