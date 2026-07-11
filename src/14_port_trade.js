/* ---------- ПОРТ И КОРАБЛЬ (пп. 3-4) ----------
   Порт сам по себе в море не выходит: нужен корабль. Корабль закладывается
   за дерево (дорого) и строится портовым рабочим на верфи. Трюм большой и
   наполняется экспортом/золотом под импорт ещё ДО спуска корабля на воду.
   Импорт: рабочий грузит золото из казны в трюм; вернувшийся рейс привозит
   заказанный товар. Вся морская торговля идёт только рейсами корабля. */
function shipHold(){return CFG.SHIP.hold}
function portImportNeed(){
  // какой ресурс сейчас стоит заказать морем (политика «Импорт» + дефицит)
  for(const r of ['wood','food','stone','gems']){
    if(S.policy[r]!=='import')continue;
    const need=(r==='wood'||r==='food')?bandIdx(r)<=2:bandIdx(r)<=1;
    if(!need)continue;
    const qty=CFG.SHIP.importQty[r]||12;
    const cost=Math.ceil(qty*CFG.PRICE[r]*CFG.SEA_MARKUP*IMPORT_COST_MULT);
    return {res:r,qty,cost};
  }
  return null;
}
function goldLoaded(b){return !!(b.importPlan&&(b.holdGold||0)>=b.importPlan.cost)}
function sailReady(b){
  if(!b.ship||b.sailing)return false;
  const ht=holdTotal(b);
  if(ht>=shipHold())return true;                       // трюм полон
  if(goldLoaded(b)&&ht>=shipHold()*0.5)return true;    // золото погружено, трюм наполовину
  if((b.sailWaitD||0)>=2&&(ht>0||goldLoaded(b)))return true; // груз залежался
  return false;
}
function returnPortShip(b){
  if(!b||b.type!=='port')return;
  let g=0;
  for(const r in b.hold){g+=b.hold[r]*CFG.PRICE[r]*CFG.SEA_MARKUP;b.hold[r]=0}
  let msg='⚓ Корабль вернулся';
  if(g>0){
    g=Math.round(g*10)/10;
    S.gold+=g;addResourcePopup('gold',g,b.x,b.y);S.tradeGold+=g;
    msg+=': выручка '+g.toFixed(0)+' з';
  }
  if(b.importPlan&&goldLoaded(b)){
    const ip=b.importPlan;
    S.stock[ip.res]=(S.stock[ip.res]||0)+ip.qty;
    addResourcePopup(ip.res,ip.qty,b.x,b.y);
    S.importSpent=(S.importSpent||0)+ip.cost;
    b.holdGold=0;b.importPlan=null;
    msg+=' · привёз импорт: '+ip.qty+' '+ip.res;
  }else if((b.holdGold||0)>0&&!b.importPlan){ // заказ отменён — золото в казну
    S.gold+=b.holdGold;b.holdGold=0;
  } // при живом заказе золото копится в портовой кладовой между рейсами
  log(msg+'.');
  b.sailing=false;b.sailLeft=0;b.sailTotal=0;b.captainId=null;b.sailWaitD=0;
  launchShip(b,-1);addInfoPopup('⚓',b.x,b.y,'info');
  computeLevels();S.uiDirty=true;
}
function startPortSail(b,u){
  b.sailing=true;
  u.sailT=CFG.SAIL_DAYS*(CFG.DAY+CFG.NIGHT);
  b.sailTotal=u.sailT;b.sailLeft=u.sailT;b.captainId=u.id;b.sailWaitD=0;
  u.act='sail';
  launchShip(b,1);
  addInfoPopup('⛵',b.x,b.y,'info');
  const manifest=[];
  const ht=holdTotal(b);if(ht>0)manifest.push(ht+' ед товара');
  if(b.importPlan&&goldLoaded(b))manifest.push(b.importPlan.cost+' з под импорт '+b.importPlan.res);
  log('⛵ Капитан '+RNAME[u.race].toLowerCase()+' №'+u.id+' выходит в море ('+(manifest.join(' + ')||'порожняком')+').');
}
function orderShip(b){
  // закладка корабля на верфи порта (списывается со склада сразу)
  const cost=CFG.SHIP.cost;
  for(const r in cost)if((S.stock[r]||0)<cost[r])return false;
  for(const r in cost){S.stock[r]-=cost[r];addResourcePopup(r,-cost[r],b.x,b.y)}
  b.shipWork=CFG.SHIP.work;
  log('⛵ Верфь: заложен торговый корабль ('+Object.entries(cost).map(([r,v])=>v+' '+r).join(', ')+').');
  computeLevels();S.uiDirty=true;
  return true;
}
function launchShip(port,sign){
  // v2.2: курс — В ОТКРЫТОЕ МОРЕ. Центроид морской компоненты не годится:
  // море окружает остров, его центроид — посреди суши, и корабль «отплывал»
  // вглубь берега. Вместо этого пускаем 16 лучей и берём направление с самой
  // длинной непрерывной полосой морской воды.
  let bdx=0,bdy=0,bl=-1;
  for(let a=0;a<16;a++){
    const ang=a*Math.PI/8;
    const dx=Math.cos(ang),dy=Math.sin(ang);
    let len=0;
    for(let t=1;t<=9;t+=0.5){
      const cx=Math.round(port.x+dx*t),cy=Math.round(port.y+dy*t);
      if(!inMap(cx,cy))break;
      const i=idx(cx,cy);
      if(S.terr[i]!==T.WATER||S.waterKind[i]!==2)break;
      len=t;
    }
    if(len>bl){bl=len;bdx=dx;bdy=dy}
  }
  if(bl<1)return; // открытого моря у причала нет
  const far=Math.min(3.2,bl*0.7);
  if(sign>0)S.ships.push({x:port.x+0.5,y:port.y+0.5,dx:bdx,dy:bdy,t:0,ttl:4.5});
  else S.ships.push({x:port.x+0.5+bdx*far,y:port.y+0.5+bdy*far,dx:-bdx,dy:-bdy,t:0,ttl:4.0});
}
function tradeDaily(){
  const port=S.buildings.find(b=>b.built&&!b.ruined&&connected(b)&&b.type==='port');
  const guild=S.buildings.find(b=>b.built&&!b.ruined&&connected(b)&&b.type==='guild');
  if(port){
    // заявка на импорт: заказ оформляется (хоть в рейсе), золото грузит рабочий по циклам
    if(!port.importPlan){
      const imp=portImportNeed();
      if(imp&&S.gold>=imp.cost*0.5){port.importPlan=imp;
        log('📦 Порт оформил заказ: '+imp.qty+' '+imp.res+' за '+imp.cost+' з — грузим золото.')}
    }
    // счётчик «груз залежался» — чтобы корабль не ждал полного трюма вечно
    if(!port.sailing&&(holdTotal(port)>0||goldLoaded(port)))port.sailWaitD=(port.sailWaitD||0)+1;
    else port.sailWaitD=0;
  }
  // Сухопутная гильдия: мгновенная дневная торговля (караваны). Море торгует
  // только рейсами корабля — см. порт/oper в 09_jobs.
  if(!guild)return;
  let sold=0,bought=0;
  for(const r of ['food','wood','stone','gems']){
    if(S.policy[r]==='export'){
      const thr=(r==='food')?S.settlers.length*CFG.FOOD_DAYS[3]:CFG.BANDS[r][3];
      const ex=Math.floor(S.stock[r]-thr);
      if(ex>0){
        const q=Math.min(ex,CFG.TRADE_Q);
        const g=q*CFG.PRICE[r]*0.35;
        S.stock[r]-=q;addResourcePopup(r,-q,guild.x,guild.y);
        S.gold+=g;addResourcePopup('gold',g,guild.x,guild.y);
        S.tradeGold+=g;sold+=q;
      }
    }else if(S.policy[r]==='import'&&!port){
      if(((r==='wood'||r==='food')?bandIdx(r)<=2:bandIdx(r)<=1)){
        const q=(r==='wood'?Math.round(CFG.TRADE_Q*1.5):CFG.TRADE_Q),cost=q*CFG.PRICE[r]*IMPORT_COST_MULT;
        if(S.gold>=cost){
          S.gold-=cost;addResourcePopup('gold',-cost,guild.x,guild.y);
          S.stock[r]+=q;addResourcePopup(r,q,guild.x,guild.y);bought+=q;
        }
      }
    }
  }
  if(sold>0)log('🐎 Караваны гильдии вывезли излишки ('+sold+' ед) — казна пополнена.');
  if(bought>0)log('📦 Закуплено у королевства '+bought+' ед — из казны.');
  if(sold||bought)computeLevels();
}
const SQUATS=[
  {id:'camp',name:'Разбойничий притон'},
  {id:'cliff',name:'Гоблинское гнездо'},
  {id:'graves',name:'Логово культистов'}];
function squatDaily(){
  for(let bi=0;bi<S.buildings.length;bi++){
    const b=S.buildings[bi];
    if(!b.abandoned||S.lairAt[idx(b.x,b.y)]>=0)continue;
    if(b.type==='mine')continue; // заброшенная шахта — энкаунтер для героев (п.6), не сквот
    let near=false;
    for(const L of S.lairs)if(!L.dead&&cheb(b.x,b.y,L.x,L.y)<6)near=true;
    for(const u of S.settlers)if(cheb(b.x,b.y,u.x|0,u.y|0)<=3)near=true;
    if(near||S.rng()>=0.12)continue;
    const sq=SQUATS[(S.rng()*SQUATS.length)|0];
    S.lairs.push({id:sq.id,name:sq.name+' ('+CFG.BNAME[b.type].toLowerCase()+')',
      tier:1,x:b.x,y:b.y,hoard:12,str:4,aggro:40,cd:0,squatB:bi});
    S.lairAt[idx(b.x,b.y)]=S.lairs.length-1;
    computeFear();rebuildPass();S.featDirty=true;
    log('☠ В заброшенном здании поселилась нечисть: '+sq.name.toLowerCase()+'!');
  }
}
