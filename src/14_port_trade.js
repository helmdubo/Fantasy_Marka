function portImportCandidate(b){
  if(!b||!b.built||b.ruined||!connected(b)||b.type!=='port'||b.sailing)return null;
  for(const r of ['wood','food','stone','gems']){
    if(S.policy[r]!=='import')continue;
    const need=(r==='wood'||r==='food')?bandIdx(r)<=2:bandIdx(r)<=1;
    if(!need)continue;
    const qty=CFG.PORT_HOLD;
    const cost=qty*CFG.PRICE[r]*CFG.SEA_MARKUP*IMPORT_COST_MULT;
    if(S.gold>=cost)return {res:r,qty,cost};
  }
  return null;
}
function returnPortShip(b){
  if(!b||b.type!=='port')return;
  if(b.sailMode==='import'){
    const r=b.importRes, q=b.importQty||CFG.PORT_HOLD;
    if(r){S.stock[r]=(S.stock[r]||0)+q;addResourcePopup(r,q,b.x,b.y);}
    log('⚓ Импортный корабль вернулся: полный трюм '+q+' '+r+'.');
  }else{
    let g=0;
    for(const r in b.hold){g+=b.hold[r]*CFG.PRICE[r]*CFG.SEA_MARKUP;b.hold[r]=0}
    S.gold+=g;addResourcePopup('gold',g,b.x,b.y);S.tradeGold+=g;
    log('⚓ Корабль вернулся: выручка '+g.toFixed(0)+' з в казну.');
  }
  b.sailing=false;b.sailMode=null;b.importRes=null;b.importQty=0;b.sailLeft=0;b.sailTotal=0;b.captainId=null;b.autoSail=false;
  launchShip(b,-1);
  computeLevels();S.uiDirty=true;
}
function startPortAutoImport(b,imp){
  if(!b||!imp||b.sailing)return false;
  b.sailing=true;b.sailMode='import';b.importRes=imp.res;b.importQty=imp.qty;b.autoSail=true;b.captainId=0;
  b.sailTotal=CFG.SAIL_DAYS*(CFG.DAY+CFG.NIGHT);b.sailLeft=b.sailTotal;
  S.gold-=imp.cost;addResourcePopup('gold',-imp.cost,b.x,b.y);
  launchShip(b,1);
  log('⛵ Портовый капитан уходит за импортом: '+imp.qty+' '+imp.res+' за '+imp.cost.toFixed(0)+' з.');
  computeLevels();S.uiDirty=true;
  return true;
}
function portAutoTick(dt){
  for(const b of S.buildings){
    if(!b||b.type!=='port'||!b.sailing||!b.autoSail)continue;
    b.sailLeft=Math.max(0,(b.sailLeft||0)-dt);
    if(b.sailLeft<=0)returnPortShip(b);
  }
}
function startPortSail(b,u,mode,imp){
  b.sailing=true;
  b.sailMode=mode;
  u.sailT=CFG.SAIL_DAYS*(CFG.DAY+CFG.NIGHT);
  b.sailTotal=u.sailT;b.sailLeft=u.sailT;b.captainId=u.id;
  if(mode==='import'&&imp){
    b.importRes=imp.res;b.importQty=imp.qty;
    S.gold-=imp.cost;addResourcePopup('gold',-imp.cost,b.x,b.y);
    log('⛵ Капитан '+RNAME[u.race].toLowerCase()+' №'+u.id+' уходит за импортом: '+imp.qty+' '+imp.res+' за '+imp.cost.toFixed(0)+' з.');
  }else{
    b.importRes=null;b.importQty=0;
    log('⛵ Трюмы полны — капитан '+RNAME[u.race].toLowerCase()+' №'+u.id+' выходит в море.');
  }
  u.act='sail';
  launchShip(b,1);
}
function launchShip(port,sign){
  // v2.1: корабль идёт не по прямой оси причала, а в сторону центра моря —
  // центроида floodfill-компоненты, к которой примыкает гавань.
  let cell=null;
  for(const d of hexDirs(port.x)){
    const nx=port.x+d[0],ny=port.y+d[1];
    if(inMap(nx,ny)&&S.terr[idx(nx,ny)]===T.WATER&&S.waterKind[idx(nx,ny)]===2){cell={x:nx,y:ny};break}
  }
  if(!cell)return;
  const comp=S.waterComps&&S.waterComps[S.waterComp[idx(cell.x,cell.y)]];
  let dx=cell.x-port.x,dy=cell.y-port.y;
  if(comp&&comp.sea===2){dx=comp.cx-port.x;dy=comp.cy-port.y}
  const dl=Math.hypot(dx,dy)||1;dx/=dl;dy/=dl;
  if(sign>0)S.ships.push({x:port.x+0.5,y:port.y+0.5,dx,dy,t:0,ttl:4.5});
  else S.ships.push({x:port.x+0.5+dx*2.4,y:port.y+0.5+dy*2.4,dx:-dx,dy:-dy,t:0,ttl:4.0});
}
function tradeDaily(){
  const port=S.buildings.find(b=>b.built&&!b.ruined&&connected(b)&&b.type==='port');
  const guild=S.buildings.find(b=>b.built&&!b.ruined&&connected(b)&&b.type==='guild');
  const seaTrade=!!port,landTrade=!!guild;
  const hub=port||guild;
  const hasTrade=seaTrade||landTrade;
  if(!hasTrade)return;
  let sold=0,bought=0,woodUse=0;
  if(seaTrade&&!port.sailing){
    const imp=portImportCandidate(port);
    if(imp)startPortAutoImport(port,imp);
  }
  for(const r of ['food','wood','stone','gems']){
    if(S.policy[r]==='export'){
      const thr=(r==='food')?S.settlers.length*CFG.FOOD_DAYS[3]:CFG.BANDS[r][3];
      const ex=Math.floor(S.stock[r]-thr);
      if(ex>0){
        const q=Math.min(ex,Math.round(CFG.TRADE_Q*(seaTrade?1.5:1)));
        const g=q*CFG.PRICE[r]*(seaTrade?CFG.SEA_MARKUP:1)*(seaTrade?0.45:0.35);
        S.stock[r]-=q;addResourcePopup(r,-q,hub.x,hub.y);
        S.gold+=g;addResourcePopup('gold',g,hub.x,hub.y);
        S.tradeGold+=g;sold+=q;
        if(seaTrade&&r!=='wood')woodUse+=CFG.UPKEEP.portTradeWoodPerBatch;
      }
    }else if(S.policy[r]==='import'&&landTrade&&!seaTrade){
      if(((r==='wood'||r==='food')?bandIdx(r)<=2:bandIdx(r)<=1)){
        const q=(r==='wood'?Math.round(CFG.TRADE_Q*1.5):CFG.TRADE_Q),cost=q*CFG.PRICE[r]*IMPORT_COST_MULT;
        if(S.gold>=cost){
          S.gold-=cost;addResourcePopup('gold',-cost,guild.x,guild.y);
          S.stock[r]+=q;addResourcePopup(r,q,guild.x,guild.y);bought+=q;
        }
      }
    }
  }
  if(seaTrade&&woodUse>0){
    const use=Math.min(woodUse,Math.floor(S.stock.wood));
    if(use>0){S.stock.wood-=use;addResourcePopup('wood',-use,port.x,port.y)}
  }
  if(sold>0)log((seaTrade?'⛵':'🐎')+' Торговый рынок вывез излишки ('+sold+' ед) — казна пополнена.');
  if(bought>0)log('📦 Закуплено у королевства '+bought+' ед — из казны.');
  if(sold||bought||woodUse)computeLevels();
}
const SQUATS=[
  {id:'camp',name:'Разбойничий притон'},
  {id:'cliff',name:'Гоблинское гнездо'},
  {id:'graves',name:'Логово культистов'}];
function squatDaily(){
  for(let bi=0;bi<S.buildings.length;bi++){
    const b=S.buildings[bi];
    if(!b.abandoned||S.lairAt[idx(b.x,b.y)]>=0)continue;
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
