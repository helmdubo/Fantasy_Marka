/* ================= JOBS ================= */
/*
GOVERNOR MARKET NOTE / заметка для дальнейшей архитектуры:
Здесь введён упрощённый слой Transfer Offers, вдохновлённый рынком заявок Cities: Skylines.
Губернатор не должен микроконтролировать каждого жителя. Он меняет политики и приоритеты,
а здания/отряды/склады публикуют заявки: labor, resource, quest. AI выбирает лучшую заявку
по reason, priority, расстоянию и доступности. Старые функции маршрута/работы пока оставлены
как исполнители, но решение "что делать" идёт через market matching.
*/
const MARKET_RES=['food','wood','stone','gems'];
const IMPORT_COST_MULT=5;
const FOG_SCALE=6;
const MARKET_LABOR_REASON={build:'BuildLabor',supply:'SupplyRun',oper:'OperateLabor',watch:'WatchDuty',repair:'RepairLabor',pave:'RoadWork',clear:'ClearWork',ruins:'RuinsSearch'};
function initMarket(){return {seq:1,offers:[],byId:new Map(),stats:{labor:0,resourceIn:0,resourceOut:0,quest:0,matched:0},note:'Governor Market: simplified TransferOffer layer'}}
function marketClear(){
  if(!S.market)S.market=initMarket();
  S.market.offers.length=0;
  if(!S.market.byId)S.market.byId=new Map();
  S.market.byId.clear();
  S.market.stats={labor:0,resourceIn:0,resourceOut:0,quest:0,matched:0};
}
function marketAdd(o){
  if(!S.market)S.market=initMarket();
  o.id=S.market.seq++;
  o.reserved=0;
  o.amount=o.amount===undefined?1:o.amount;
  o.priority=o.priority===undefined?1:o.priority;
  S.market.offers.push(o);
  S.market.byId.set(o.id,o);
  if(o.market==='labor')S.market.stats.labor++;
  else if(o.market==='quest')S.market.stats.quest++;
  else if(o.market==='resource'&&o.side==='incoming')S.market.stats.resourceIn++;
  else if(o.market==='resource'&&o.side==='outgoing')S.market.stats.resourceOut++;
  return o;
}
function marketGet(id){return S.market&&S.market.byId?S.market.byId.get(id):null}
function marketFree(o){return Math.max(0,(o&&o.amount||0)-(o&&o.reserved||0))}
function marketReserveId(id,amount,who){
  const o=marketGet(id);if(!o)return null;
  const a=Math.min(amount||1,marketFree(o));
  if(a<=0)return null;
  o.reserved+=a;S.market.stats.matched++;
  return {id:o.id,amount:a,who};
}
function marketReleaseRef(ref){const o=ref&&marketGet(ref.id);if(o)o.reserved=Math.max(0,o.reserved-(ref.amount||1))}
function marketReleaseRefs(refs){if(!refs)return;for(const r of refs)marketReleaseRef(r)}
function marketClearRefs(u,field,release){if(u&&u[field]){if(release)marketReleaseRefs(u[field]);u[field]=null}}


