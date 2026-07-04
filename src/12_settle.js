/* ================= SETTLE (auto-builder) ================= */
function countB(type,builtOnly){let n=0;for(const b of S.buildings)if(b.type===type&&(!builtOnly||b.built))n++;return n}
// «Живые» здания типа: стройка или действующее. Заброшенные и руины НЕ считаются —
// иначе автостроитель думает, что производство есть, хотя оно мертво (п.7).
function countLive(type){let n=0;for(const b of S.buildings)if(b.type===type&&!b.abandoned&&!b.ruined)n++;return n}
// Действующие: построено, не заброшено, не руина.
function countActive(type){let n=0;for(const b of S.buildings)if(b.type===type&&b.built&&!b.abandoned&&!b.ruined)n++;return n}
function houseCapOf(b){
  if(b.type==='hut')return (b.tier||1)>=2?CFG.HOUSE2_CAP:CFG.HOUSE.hut;
  return CFG.HOUSE[b.type]||0;
}
function housingCap(){let c=0;for(const b of S.buildings)if(b.built&&!b.ruined&&connected(b))c+=houseCapOf(b);return c}
function tryUpgradeHut(){
  // п.10: лачуга -> дом (тир 2): +1 место, дерево+камень
  const b=S.buildings.find(b=>b.built&&!b.ruined&&b.type==='hut'&&(b.tier||1)<2&&connected(b));
  if(!b)return false;
  const cost=CFG.HUT2_COST;
  for(const r in cost)if(S.stock[r]<cost[r])return false;
  for(const r in cost){S.stock[r]-=cost[r];addResourcePopup(r,-cost[r],b.x,b.y)}
  b.tier=2;S.bldDirty=true;computeLevels();
  log('🏡 Лачуга перестроена в дом — теперь под крышей помещаются трое.');
  S.dbgBuilder='дом (тир 2)';
  return true;
}
const NEAR_ROAD_TYPES={hut:1,tavern:1,advguild:1,guild:1,crafters:1};
// v2.1: зона застройки = радиус ратуши (INFLUENCE) + радиусы действующих дозорных
// вышек (TOWER_INFLUENCE, на 40% меньше). Экспансия — цепочкой вышек к фронтиру.
function influenceAnchors(){
  const a=[{x:S.th.x,y:S.th.y,r:CFG.INFLUENCE}];
  for(const b of S.buildings)
    if(b.built&&!b.ruined&&b.type==='tower'&&connected(b))a.push({x:b.x,y:b.y,r:CFG.TOWER_INFLUENCE});
  return a;
}
function inInfluence(x,y){
  for(const an of influenceAnchors())if(cheb(x,y,an.x,an.y)<=an.r)return true;
  return false;
}
function siteOk(type,x,y){
  const i=idx(x,y);
  if(S.road[i])return false; // не на дороге
  const t=S.terr[i];
  const terrOk=(t===T.GRASS)||(type==='mine'&&t===T.ROCK);
  if(!terrOk||S.feat[i]!==F.NONE||S.bld[i]>=0||S.lairAt[i]>=0)return false;
  if(NEAR_ROAD_TYPES[type]){
    let nr=false;
    for(const d of hexDirs(x))
      if(inMap(x+d[0],y+d[1])&&S.road[idx(x+d[0],y+d[1])]&&S.roadConn[idx(x+d[0],y+d[1])])nr=true;
    if(!nr)return false;
  }
  if(!S.explored[i]||S.fear[i]||!S.pass[i])return false;
  if(!inInfluence(x,y))return false;
  const orth=hexDirs(x); // hex: «примыкание» = любой из 6 соседей
  if(type==='fisher'){
    let w=false;for(const d of orth)if(inMap(x+d[0],y+d[1])&&S.terr[idx(x+d[0],y+d[1])]===T.WATER)w=true;
    if(!w)return false;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)
      if(inMap(x+dx,y+dy)&&S.feat[idx(x+dx,y+dy)]===F.FISH)return true;
    return false;
  }
  if(type==='tower'){
    if(cheb(x,y,S.th.x,S.th.y)<6)return false;
    for(const b of S.buildings)if(b.type==='tower'&&cheb(x,y,b.x,b.y)<6)return false;
    return true;
  }
  if(type==='port'){
    // v2.1: гавань строится только на берегу МОРЯ (waterKind===2). Реки/озёра больше
    // не годятся: если моря в досягаемости нет, торговая труба идёт через гильдию.
    for(const d of orth){const nx=x+d[0],ny=y+d[1];
      if(inMap(nx,ny)&&S.terr[idx(nx,ny)]===T.WATER&&S.waterKind[idx(nx,ny)]===2)return true}
    return false;
  }
  if(type==='guild'||type==='advguild'){
    for(const d of orth){const nx=x+d[0],ny=y+d[1];
      if(inMap(nx,ny)&&S.road[idx(nx,ny)])return true}
    return false;
  }
  if(type==='mine'){
    let m=false,rock=0;
    for(const d of orth){const nx=x+d[0],ny=y+d[1];
      if(!inMap(nx,ny))continue;
      if(S.terr[idx(nx,ny)]===T.MTN)m=true;
      if(S.terr[idx(nx,ny)]===T.ROCK)rock++;
    }
    return m||rock>=2; // богатая шахта у гор или бедная холмовая (предгорья)
  }
  if(type==='lumber'){let f=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){if(inMap(x+dx,y+dy)&&S.terr[idx(x+dx,y+dy)]===T.FOREST&&S.terrHp[idx(x+dx,y+dy)]>0)f++}return f>=1}
  if(type==='farm'){
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)
      if(inMap(x+dx,y+dy)&&S.feat[idx(x+dx,y+dy)]===F.WHEAT)return true;
    return false;
  }
  return true; // hut, tavern
}
function engineTarget(){
  const lumberSite=anySite('lumber');
  const mineSite=anySite('mine');
  // Не резервируем дерево под несуществующую лесопилку: иначе старты с 1-2 лесными клетками
  // застревают в еде/домах и не переходят к шахте, хотя каменный двигатель уже доступен.
  if(countLive('lumber')===0&&lumberSite&&(S.noForestDays||0)<=10)return 'lumber';
  if(countLive('mine')===0&&mineSite)return 'mine';
  return null;
}
/* ---------- RESEARCH (v2.1): открытия строений в библиотеке ---------- */
function researchNext(){
  for(const t of CFG.RESEARCH.order)if(!S.research.unlocked[t])return t;
  return null;
}
function typeUnlocked(t){
  if(!CFG.RESEARCH.cost[t])return true; // базовые постройки открыты всегда
  return !!S.research.unlocked[t];
}
function researchCycle(u,b){
  const nxt=researchNext();
  if(!nxt)return;
  if(CFG.RESEARCH.tier2[nxt]&&(b.tier||1)<2){
    if(!b.t2WarnDay||b.t2WarnDay!==S.day){b.t2WarnDay=S.day;
      log('📚 Библиотека: открытие «'+CFG.BNAME[nxt]+'» требует Башни знаний (тир 2, самоцветы).')}
    return;
  }
  S.research.pts+=0.35*(u.race==='elf'?1.3:1)*(b.tier||1)*(1+0.06*skillLvl(u,'lore')); // ~6 pts/день на тире 1
  addSkillXp(u,'lore',1);
  addInfoPopup('📜',b.x,b.y,'info');
  const cost=CFG.RESEARCH.cost[nxt];
  if(S.research.pts>=cost){
    S.research.pts-=cost;
    S.research.unlocked[nxt]=true;
    log('📜 Открытие: '+CFG.BNAME[nxt].toLowerCase()+' — губернатор может выдать разрешение на стройку.');
    S.uiDirty=true;
  }
}
function tryLibraryTier2(){
  const b=S.buildings.find(b=>b.built&&!b.ruined&&b.type==='library'&&(b.tier||1)<2);
  if(!b)return false;
  const cost=CFG.RESEARCH.libTier2;
  for(const r in cost)if(S.stock[r]<cost[r])return false;
  for(const r in cost){S.stock[r]-=cost[r];addResourcePopup(r,-cost[r],b.x,b.y)}
  b.tier=2;S.bldDirty=true;computeLevels();
  log('🔮 Библиотека перестроена в Башню знаний — путь к высоким искусствам открыт.');
  S.dbgBuilder='башня знаний';
  return true;
}
function stockWorld(r){
  let v=S.stock[r]||0;
  for(const b of S.buildings)if(b.built)v+=b.buf[r]||0;
  return v;
}
function pendingConstructionNeed(r){
  let v=0;
  for(const b of S.buildings){
    if(!b||b.built||!b.need)continue;
    v+=Math.max(0,(b.need[r]||0)-(b.got&&b.got[r]||0));
  }
  return v;
}
function stockWorldAvailable(r){
  return Math.max(0,stockWorld(r)-pendingConstructionNeed(r));
}
function activeConstructionCount(){return S.buildings.filter(b=>!b.built).length}
function constructionCap(){
  // v1.9: стартовые производства доступны сразу. Ограничение — не технология,
  // а реальные ресурсы/рабочие руки. Малое поселение может иметь 4 разрешения
  // на стройку, чтобы лесопилка+шахта+ферма+причал закладывались параллельно.
  const p=S.settlers.length;
  if(p>=18)return 7;
  if(p>=10)return 5;
  return 4;
}
// Прогрессивная стоимость лесопилки: если действующих нет — бесплатно
// (артель валит лес своими топорами), дальше каждая следующая дороже.
function costOf(type){
  const base=CFG.COSTS[type]||{};
  if(type!=='lumber')return base;
  const n=countActive('lumber');
  if(n===0)return {};
  const out={};
  for(const r in base)out[r]=base[r]*n;
  return out;
}
function canPayWorld(type){
  if(!typeUnlocked(type))return false; // v2.1: строение ещё не открыто в библиотеке
  const cost=costOf(type),gate=CFG.GATE[type];
  // бесплатная нулевая лесопилка не требует и ресурсных ворот
  if(!(type==='lumber'&&countActive('lumber')===0))
    for(const r in gate)if(bandIdx(r)<gate[r])return false;
  // При параллельном строительстве нельзя считать одни и те же доски дважды.
  // Поэтому новые площадки смотрят на свободный world-stock после уже обещанных строек.
  for(const r in cost)if(stockWorldAvailable(r)<cost[r])return false;
  return true;
}
function resScore(type,x,y){
  const R=CFG.HARVEST_R;let n=0;
  for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){
    const cx=x+dx,cy=y+dy;if(!inMap(cx,cy))continue;
    const i=idx(cx,cy);
    if(type==='lumber'&&S.terr[i]===T.FOREST&&S.terrHp[i]>0)n++;
    else if(type==='farm'&&S.feat[i]===F.WHEAT)n++;
    else if(type==='fisher'&&S.feat[i]===F.FISH)n++;
    else if(type==='mine'){if(S.terr[i]===T.MTN)n++;if(S.feat[i]===F.VEIN)n+=3}
  }
  return n;
}
const PROD_TYPES={farm:1,fisher:1,lumber:1,mine:1};
// Планирование «как с мостами»: рёберные блокировки рек игнорируются,
// маршрут может пересекать реку — по нему будет размечен мост (п.1).
function withBridgedPass(fn){
  S._riverOpen=true;
  let r;
  try{r=fn()}finally{S._riverOpen=false}
  return r;
}
function tryPlace(type){
  if(!canPayWorld(type))return false;
  // v1.9: больше нет скрытого технологического резерва под один двигатель.
  // Если ресурсов хватает с учётом уже обещанных строек — можно закладывать параллельно.
  let best=null,bd=1e9;
  const tx=S.th.x,ty=S.th.y;
  const seen=new Set(); // v2.1: строим в объединённой зоне ратуши и вышек
  for(const an of influenceAnchors()){
    const R=an.r;
    for(let y=Math.max(0,an.y-R);y<=Math.min(S.H-1,an.y+R);y++)
    for(let x=Math.max(0,an.x-R);x<=Math.min(S.W-1,an.x+R);x++){
      const key=idx(x,y);
      if(seen.has(key))continue;seen.add(key);
      if(!siteOk(type,x,y))continue;
      const d=cheb(x,y,tx,ty);
      if(d<2)continue;
      let score;
      if(type==='tower')score=-d;
      else if(PROD_TYPES[type])score=-(resScore(type,x,y)*100-d);
      else score=d;
      if(score<bd){bd=score;best={x,y}}
    }
  }
  if(!best)return false;
  let p=findPath(S,tx,ty,best.x,best.y,true);
  let bridged=null;
  {
    const pb=withBridgedPass(()=>findPath(S,tx,ty,best.x,best.y,true));
    if(p===null){
      // площадка за рекой: пути нет вовсе — только через мост (п.1)
      if(pb===null)return false;
      bridged=pb;
    }else if(pb&&p.length>pb.length*2+6){
      bridged=pb; // обход реки слишком длинный — мост срезает крюк
    }
  }
  const b=placeBuilding(type,best.x,best.y,false);
  if(bridged){
    // мостовой план: приоритетная дорога от ратуши, включая клетки реки.
    // Фундамент придержан (waitBridge), пока мост не наведён — иначе
    // строитель уйдёт к площадке за рекой и заблокируется.
    const cells=bridged.filter(w=>!S.road[idx(w.x,w.y)]&&S.bld[idx(w.x,w.y)]<0);
    if(cells.length){
      const plId=S.nextId++;
      S.roadPlans.push({id:plId,cells,i:0,bridge:true,name:'мост — '+CFG.BNAME[type].toLowerCase()});
      b.waitBridge=plId;
      log('🌉 Через реку размечен мост: путь к площадке «'+CFG.BNAME[type].toLowerCase()+'».');
    }
  }
  S.dbgBuilder=CFG.BNAME[type]+' @'+best.x+','+best.y+(bridged?' (за рекой)':'');
  log('⚒ Артель закладывает: '+CFG.BNAME[type].toLowerCase()+'.');
  computeLevels();
  return true;
}
function nearestRoadTarget(x,y){
  // Ближайшая клетка действующей дорожной сети (roadConn). Тянуть каждую дорогу
  // до самой ратуши нельзя: параллельные нитки дают «паутину» (п.2).
  let best=null,bd=1e9;
  for(let cy=0;cy<S.H;cy++)for(let cx=0;cx<S.W;cx++){
    const i=idx(cx,cy);
    if(!S.road[i]||!S.roadConn[i])continue;
    const d=cheb(x,y,cx,cy);
    if(d<bd){bd=d;best={x:cx,y:cy}}
  }
  return best||{x:S.th.x,y:S.th.y};
}
function buildRoad(b){
  const tgt=nearestRoadTarget(b.x,b.y);
  let p=findPath(S,b.x,b.y,tgt.x,tgt.y,true,true);
  if(!p)p=findPath(S,b.x,b.y,tgt.x,tgt.y,true);
  if(!p)p=findPath(S,b.x,b.y,S.th.x,S.th.y,true);
  if(!p)return;
  const cells=p.filter(w=>!S.road[idx(w.x,w.y)]&&S.bld[idx(w.x,w.y)]<0);
  S.road[idx(b.x,b.y)]=1;S.roadDirty=true;
  if(!cells.length)return;
  S.roadPlans.push({cells,i:0,name:CFG.BNAME[b.type].toLowerCase()+' — тракт'});
  log('🚩 Размечен дорожный фундамент: '+CFG.BNAME[b.type].toLowerCase()+' → тракт.');
}
function finishBuilding(b){
  b.built=true;S.bldDirty=true;
  S.road[idx(b.x,b.y)]=1;S.roadDirty=true;
  recomputeRoadConn();
  if(b.type==='farm'||b.type==='fisher'||b.type==='lumber'||b.type==='mine'||b.type==='tower'||b.type==='port'||b.type==='guild'||b.type==='library'){
    buildRoad(b);
    log('🛤 Проложена дорога: '+CFG.BNAME[b.type].toLowerCase()+' — ратуша.');
  }
  // v2.1: стартовый комплект локальных припасов со склада (дальше носит разносчик)
  const sd0=CFG.STORE[b.type];
  if(sd0)for(const r in sd0){
    const take=Math.min(sd0[r],Math.floor(S.stock[r]||0));
    if(take>0){S.stock[r]-=take;b.store[r]=(b.store[r]||0)+take;addResourcePopup(r,-take,S.th.x,S.th.y)}
  }
  assignHauler();
  addInfoPopup('🏠 '+CFG.BNAME[b.type],b.x,b.y,'info');
  log('🏠 Готово: '+CFG.BNAME[b.type].toLowerCase()+'.');
  computeLevels();S.uiDirty=true;
}
function forestInInfluence(){
  let n=0;const seen=new Set();
  for(const an of influenceAnchors()){
    const R=an.r;
    for(let y=Math.max(0,an.y-R);y<=Math.min(S.H-1,an.y+R);y++)
    for(let x=Math.max(0,an.x-R);x<=Math.min(S.W-1,an.x+R);x++){
      const i=idx(x,y);
      if(seen.has(i))continue;seen.add(i);
      if(S.explored[i]&&S.terr[i]===T.FOREST&&S.terrHp[i]>0)n++;
    }
  }
  return n;
}
function anySite(type){
  const R=CFG.INFLUENCE,tx=S.th.x,ty=S.th.y;
  for(let y=Math.max(0,ty-R);y<=Math.min(S.H-1,ty+R);y++)
  for(let x=Math.max(0,tx-R);x<=Math.min(S.W-1,tx+R);x++)
    if(siteOk(type,x,y)&&cheb(x,y,tx,ty)>=2)return true;
  return false;
}
function bestSiteScore(type){
  let best=0;
  const R=CFG.INFLUENCE,tx=S.th.x,ty=S.th.y;
  for(let y=Math.max(0,ty-R);y<=Math.min(S.H-1,ty+R);y++)
  for(let x=Math.max(0,tx-R);x<=Math.min(S.W-1,tx+R);x++){
    if(siteOk(type,x,y)&&cheb(x,y,tx,ty)>=2)best=Math.max(best,resScore(type,x,y));
  }
  return best;
}



function constructionOpen(){return activeConstructionCount()<constructionCap()}
function tryPlaceIfOpen(type){
  if(!constructionOpen())return false;
  return tryPlace(type);
}
function settleThink(){
  if(S.phase==='scout')return; // ратуша ещё не выбрана
  const L=r=>bandIdx(r);
  const fc=forestInInfluence();
  let placed=0;
  const put=(type)=>{if(tryPlaceIfOpen(type)){placed++;return true}return false};

  // 0. CORE PRODUCTION PERMITS — не технология, а одновременная стартовая повестка.
  // Если хватает ресурсов, губернатор сразу выдаёт разрешения на лесопилку, шахту,
  // ферму и рыбацкий причал. Исполняет AI через market/job layer.
  if(countLive('lumber')===0)put('lumber');
  if(countLive('mine')===0)put('mine');
  if(countLive('farm')===0)put('farm');
  if(countLive('fisher')===0)put('fisher');

  // Если стартовые четыре стройки заняли весь лимит — это нормальное состояние.
  if(!constructionOpen()){
    S.dbgBuilder='параллельные стройки '+activeConstructionCount()+'/'+constructionCap();
    return;
  }

  const foodN=countLive('farm')+countLive('fisher');
  const foodCap=1+Math.ceil(S.settlers.length/5);
  const prodN=countActive('farm')+countActive('fisher')+countActive('lumber')+countActive('mine');

  // 1. FOOD SAFETY — при просадке еды расширяем питание до жилья.
  if(L('food')<=1&&foodN<foodCap){
    const first=(countLive('fisher')<=countLive('farm'))?'fisher':'farm';
    const second=(first==='fisher')?'farm':'fisher';
    if(put(first)||put(second)){S.dbgBuilder='расширение еды';return}
  }

  // 1b. KNOWLEDGE (v2.1) — библиотека открывает таверну/порт/гильдии, закладываем рано.
  if(countB('library')===0&&prodN>=2&&put('library')){S.dbgBuilder='библиотека';return}
  {const nxt=researchNext();
   if(nxt&&CFG.RESEARCH.tier2[nxt]&&tryLibraryTier2())return}

  // 2. TRADE/EXPORT PIPE — строим раньше таверны/героев, чтобы ресурсы не забивали склад.
  const surplus=['food','wood','stone','gems'].some(r=>bandIdx(r)>=3);
  const tradePressure=surplus||stockWorld('stone')>=42||stockWorld('wood')>=48||stockWorld('food')>=S.settlers.length*7;
  if(prodN>=3&&tradePressure&&countB('port')===0&&countB('guild')===0){
    if(put('port')||put('guild')){S.dbgBuilder='торговая артерия';return}
  }

  // 2b. SHIP (п.3): порт без корабля бесполезен — закладываем при первом достатке дерева.
  {const port=S.buildings.find(b=>b.built&&!b.ruined&&b.type==='port'&&!b.ship&&!(b.shipWork>0));
   if(port&&(S.stock.wood||0)>=CFG.SHIP.cost.wood&&orderShip(port)){S.dbgBuilder='корабль на верфи';return}}

  // 3. housing, but only after production and food are not in crisis.
  // Сначала пробуем достроить лачугу до дома (п.10) — дешевле по месту, дороже по камню.
  if(housingCap()-S.settlers.length<2&&L('food')>=2){
    if(L('stone')>=2&&tryUpgradeHut())return;
    if(put('hut'))return;
    if(tryUpgradeHut())return;
  }

  // 4. production growth.
  if(L('wood')>=2){
    if(fc>=8&&countLive('lumber')<Math.min(2,1+Math.floor(fc/32))&&put('lumber'))return;
    if(L('food')<=2&&foodN<foodCap){
      const first=(countLive('farm')<=countLive('fisher'))?'farm':'fisher';
      if(put(first))return;
    }
  }
  // 4b. восстановление производства после заброса: живых зданий типа нет,
  // но угодья в зоне есть — закладываем замену (заброшенное ≠ действующее).
  // Демпфер: только если ресурс типа реально нужен (band<3) и не чаще раза в 4 дня,
  // иначе на бедных лесом сидах строитель плодит лесопилки бесконечно.
  const REBUILD_RES={mine:'stone',lumber:'wood',farm:'food',fisher:'food'};
  S.rebuildCd=S.rebuildCd||{};
  for(const t of ['mine','lumber','farm','fisher']){
    if(countLive(t)>0||countB(t)===0)continue;
    if(bandIdx(REBUILD_RES[t])>=3)continue;
    if((S.rebuildCd[t]||0)>S.day-4)continue;
    if(put(t)){S.rebuildCd[t]=S.day;S.dbgBuilder='замена заброшенного: '+t;return}
  }

  // 5. watchtower and mid-tier stone sinks. v2.1: вышки — цепочка экспансии,
  // каждая добавляет зону застройки (−40% от ратуши) и дневную разведку.
  if(prodN>=2&&countB('tower')<1+Math.floor(S.settlers.length/6)&&put('tower'))return;
  if(S.settlers.length>=5&&countB('tavern')===0&&put('tavern'))return;
  if(S.settlers.length>=8&&countB('tavern',true)>0&&countB('advguild')===0&&put('advguild'))return;
  if(countB('advguild',true)>0&&countB('crafters')===0&&stockWorld('gems')>=2&&put('crafters'))return;

  // 6. fallback trade building if no pipe was possible earlier.
  if((surplus||S.day>=18)&&countB('port')===0&&countB('guild')===0){
    if(put('port')||put('guild'))return;
  }

  // 7. tier upgrades consume stone deliberately.
  if(L('wood')>=3&&L('stone')>=2&&tryUpgrade())return;
  S.dbgBuilder=placed?('выдано разрешений: '+placed):('нужд нет ('+S.day+'д)');
}
function tryUpgrade(){
  let best=null;
  for(const b of S.buildings){
    if(!b.built||b.abandoned||b.ruined)continue;
    if(b.type!=='farm'&&b.type!=='fisher'&&b.type!=='lumber'&&b.type!=='mine')continue;
    if((b.tier||1)>=3)continue;
    if(!best||b.tier<best.tier)best=b;
  }
  if(!best)return false;
  const cost=CFG.TIER_COST[best.tier+1];
  for(const r in cost)if(S.stock[r]<cost[r])return false;
  for(const r in cost)S.stock[r]-=cost[r];
  best.tier++;
  if(best.type==='mine')best.data.oreLeft=(best.data.oreLeft||0)+CFG.MINE.orePerTier; // новые горизонты
  S.bldDirty=true;computeLevels();
  log('⭐ '+CFG.BNAME[best.type]+' расширена до тира '+best.tier+'.');
  S.dbgBuilder='апгрейд '+best.type+'→'+best.tier;
  return true;
}

