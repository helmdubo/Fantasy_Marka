function marketPolicyBoost(res){
  const p=S.policy&&S.policy[res];
  if(p==='import')return 1.8;
  if(p==='export')return 1.2;
  return 1.0;
}
function marketResourceLevelBoost(res){
  const lv=bandIdx(res);
  if(lv<=0)return 6;
  if(lv===1)return 3;
  if(lv===2)return 1;
  return 0;
}
function marketLaborPriority(j){
  let p=1;
  if(j.kind==='repair')p=9;
  else if(j.kind==='supply')p=8;
  else if(j.kind==='build')p=7;
  else if(j.kind==='clear')p=5;
  else if(j.kind==='pave')p=4;
  else if(j.kind==='oper')p=3;
  else if(j.kind==='watch')p=2.5;
  else if(j.kind==='ruins')p=1.5;
  if(j.b!==undefined){
    const b=S.buildings[j.b];
    if(b){
      // стартовая доктрина губернатора: лесопилка получает высокий рыночный приоритет,
      // затем еда, затем шахта. Это не ручной приказ юниту, а приоритет рынка труда.
      if(b.type==='lumber')p+=10;
      else if(b.type==='farm'||b.type==='fisher')p+=6;
      else if(b.type==='mine')p+=5;
      else if(b.type==='tower')p+=2;
      else if(b.type==='port'&&j.kind==='oper'){
        p+=4;
        if(portImportCandidate(b))p+=8;
        if(holdTotal(b)>=CFG.PORT_HOLD)p+=6;
      }
      if(j.kind==='oper'){
        if(b.type==='lumber')p+=marketResourceLevelBoost('wood');
        if(b.type==='farm'||b.type==='fisher')p+=marketResourceLevelBoost('food');
        if(b.type==='mine')p+=marketResourceLevelBoost('stone');
      }
      if(j.kind==='supply'&&j.res)p+=marketResourceLevelBoost(j.res)*0.5;
    }
  }
  if(j.kind==='pave'||j.kind==='clear')p+=1.5;
  return p;
}
function marketPublishLaborJobs(){
  for(const j of S.jobPool){
    const o=marketAdd({market:'labor',side:'incoming',reason:MARKET_LABOR_REASON[j.kind]||j.kind,
      priority:marketLaborPriority(j),amount:1,x:j.x,y:j.y,job:j});
    j.marketOfferId=o.id;
  }
}
function marketPublishResourceOffers(){
  // outgoing: центральный склад и буферы зданий
  for(const r of MARKET_RES){
    const amt=Math.floor(S.stock[r]||0);
    if(amt>0)marketAdd({market:'resource',side:'outgoing',reason:r,amount:amt,
      priority:2+marketResourceLevelBoost(r)*0.25,x:S.th.x,y:S.th.y,source:{kind:'stock',res:r}});
  }
  const sinkAmt={food:0,wood:0,stone:0,gems:0};
  for(let bi=0;bi<S.buildings.length;bi++){
    const b=S.buildings[bi];
    if(!b.built||!connected(b))continue;
    for(const r of MARKET_RES){
      const amt=Math.floor(b.buf[r]||0);
      if(amt>0){
        sinkAmt[r]+=amt;
        marketAdd({market:'resource',side:'outgoing',reason:r,amount:amt,
          priority:4+amt*0.35+(b.type==='mine'&&r==='stone'?1.5:0),x:b.x,y:b.y,source:{kind:'buf',b:bi,res:r}});
      }
    }
  }
  // incoming: ратуша принимает добычу из производственных буферов
  for(const r of MARKET_RES){
    if(sinkAmt[r]>0)marketAdd({market:'resource',side:'incoming',reason:r,amount:sinkAmt[r],
      priority:5+marketPolicyBoost(r),x:S.th.x,y:S.th.y,target:{kind:'stock',res:r}});
  }
  // incoming: пополнение локальных припасов зданий (v2.1). Заявка публикуется,
  // когда запас опускается ниже половины вместимости — это и есть балансирующий
  // контур: производство ↔ потребление построек через складского разносчика.
  for(let bi=0;bi<S.buildings.length;bi++){
    const b=S.buildings[bi];
    if(!b.built||b.ruined||b.abandoned||!connected(b))continue;
    const sd=CFG.STORE[b.type];if(!sd)continue;
    for(const r in sd){
      const cap=sd[r],have=(b.store&&b.store[r])||0;
      if(have>cap*0.5)continue;
      if(Math.floor(S.stock[r]||0)<1)continue;
      const urg=1-have/cap; // чем ближе к нулю, тем срочнее
      marketAdd({market:'resource',side:'incoming',reason:r,amount:Math.max(1,Math.ceil(cap-have)),
        priority:6+urg*5,x:b.x,y:b.y,target:{kind:'restock',b:bi,res:r}});
    }
  }
  // incoming: стройки публикуют потребность в конкретных ресурсах
  for(let bi=0;bi<S.buildings.length;bi++){
    const b=S.buildings[bi];
    if(!b||b.built||!b.need)continue;
    for(const r in b.need){
      const miss=Math.max(0,(b.need[r]||0)-(b.got[r]||0));
      if(miss>0)marketAdd({market:'resource',side:'incoming',reason:r,amount:miss,
        priority:8+marketResourceLevelBoost(r)+(b.type==='lumber'?6:(b.type==='farm'||b.type==='fisher'?3:(b.type==='mine'?2:0))),
        x:b.x,y:b.y,target:{kind:'construction',b:bi,res:r}});
    }
  }
  // incoming: порт хочет только ресурсы, разрешённые губернаторской политикой Export
  for(let bi=0;bi<S.buildings.length;bi++){
    const b=S.buildings[bi];
    if(!b.built||b.ruined||!connected(b)||b.type!=='port'||b.sailing)continue;
    const room=CFG.PORT_HOLD-holdTotal(b);
    if(room<=0)continue;
    for(const r of MARKET_RES){
      if(S.policy[r]!=='export')continue;
      const thr=(r==='food')?S.settlers.length*CFG.FOOD_DAYS[3]:CFG.BANDS[r][3];
      const ex=Math.floor((S.stock[r]||0)-thr);
      if(ex>0)marketAdd({market:'resource',side:'incoming',reason:r,amount:Math.min(ex,room),
        priority:7+marketPolicyBoost(r)+(r==='gems'?2:0),x:b.x,y:b.y,target:{kind:'port_export',b:bi,res:r}});
    }
  }
}
function marketPublishQuestOffers(){
  // Пока это диагностический рынок для будущих указов экспедиции: инспектор всё ещё запускает поход.
  for(let li=0;li<S.lairs.length;li++){
    const L=S.lairs[li];
    if(!L||L.dead)continue;
    marketAdd({market:'quest',side:'incoming',reason:'QuestTarget',amount:1,
      priority:Math.max(1,6-L.tier)+(L.known?1:0),x:L.x,y:L.y,target:{kind:'lair',li}});
  }
  for(let bi=0;bi<S.buildings.length;bi++){
    const b=S.buildings[bi];
    if(b&&b.built&&b.type==='mine'&&!b.ruined&&!b.abandoned&&(b.delveMax||0)<(b.tier||1)){
      marketAdd({market:'quest',side:'incoming',reason:'MineDelve',amount:1,
        priority:4+(b.tier||1),x:b.x,y:b.y,target:{kind:'mine_delve',b:bi}});
    }
  }
}
function rebuildMarketFromJobs(){marketClear();marketPublishLaborJobs();marketPublishResourceOffers();marketPublishQuestOffers()}
function marketSelectLaborJob(u){
  if(!S.market||!S.market.offers.length)return null;
  let best=null,bu=-1e9;
  for(const o of S.market.offers){
    if(o.market!=='labor'||o.side!=='incoming'||marketFree(o)<=0)continue;
    const j=o.job;if(!j)continue;
    const base=UTIL[j.kind];if(!base)continue;
    const key=claimKey(j);if(S.claims.has(key))continue;
    const bad=S.badCells.get(key);if(bad!==undefined&&bad>=S.day)continue;
    const d=cheb(u.x|0,u.y|0,j.x,j.y);
    let util=(o.priority||1)*2.0+base*(34/(8+d));
    if(j.kind==='oper'&&j.b!==undefined&&S.buildings[j.b]&&u.race==='dwarf'&&S.buildings[j.b].type==='mine')util*=1.25;
    if(j.kind==='oper'&&j.b!==undefined&&S.buildings[j.b]&&u.race==='troll'&&S.buildings[j.b].type==='lumber')util*=1.10;
    util+=hash2(u.id,j.x*67+j.y,S.day)*0.35;
    if(util>bu){bu=util;best=o}
  }
  if(!best)return null;
  best.job._marketOfferId=best.id;
  return best.job;
}
function marketFindResourceOffers(filter){return (S.market?S.market.offers:[]).filter(o=>o.market==='resource'&&marketFree(o)>0&&filter(o))}
function marketSelectSupplySource(u,res,targetB){
  let best=null,bv=-1e9;
  for(const o of marketFindResourceOffers(o=>o.side==='outgoing'&&o.reason===res)){
    const d=cheb(u.x|0,u.y|0,o.x,o.y);
    let v=(o.priority||1)*2-d*0.35;
    if(o.source&&o.source.kind==='stock')v+=1.2;
    if(o.source&&o.source.kind==='buf')v+=0.3;
    if(v>bv){bv=v;best=o}
  }
  return best;
}
function marketSelectHaulTask(u){
  let bestPickup=null,pickV=-1e9;
  // производство -> ратуша: забираем буферы зданий как рыночную пару outgoing(buf) + incoming(stock)
  for(const out of marketFindResourceOffers(o=>o.side==='outgoing'&&o.source&&o.source.kind==='buf')){
    const sink=marketFindResourceOffers(o=>o.side==='incoming'&&o.target&&o.target.kind==='stock'&&o.reason===out.reason)[0];
    if(!sink)continue;
    const b=S.buildings[out.source.b];if(!b||!b.built||!connected(b))continue;
    const d=cheb(u.x|0,u.y|0,b.x,b.y);
    const fullness=bufTotal(b)/Math.max(1,capOf(b));
    let v=(out.priority||1)*1.7+(sink.priority||1)+marketFree(out)*0.35+fullness*5-d*0.35;
    if(u.race==='troll')v+=1.0;
    if(v>pickV){pickV=v;bestPickup={mode:'pickup',b:out.source.b,res:out.reason,out,sink}}
  }
  let bestExport=null,expV=-1e9;
  // ратуша -> порт: экспорт по указам губернатора. В v1.4 экспорт может перебить сбор буферов,
  // иначе один складской рабочий вечно возит ферма/шахта -> ратуша и порт стоит пустой.
  for(const inc of marketFindResourceOffers(o=>o.side==='incoming'&&o.target&&o.target.kind==='port_export')){
    const src=marketFindResourceOffers(o=>o.side==='outgoing'&&o.source&&o.source.kind==='stock'&&o.reason===inc.reason)[0];
    if(!src)continue;
    const r=inc.reason;
    const thr=(r==='food')?S.settlers.length*CFG.FOOD_DAYS[3]:CFG.BANDS[r][3];
    const pressure=Math.max(0,((S.stock[r]||0)-thr)/12);
    const d=cheb(u.x|0,u.y|0,S.th.x,S.th.y);
    const port=S.buildings[inc.target.b];
    const portNeed=port?((CFG.PORT_HOLD-holdTotal(port))/Math.max(1,CFG.PORT_HOLD)):0;
    let v=(inc.priority||1)*2.6+(src.priority||1)+pressure+portNeed*6-d*0.25;
    if(r==='stone'||r==='gems')v+=2.0;
    if(v>expV){expV=v;bestExport={mode:'export',port:inc.target.b,res:r,inc,src}}
  }
  let bestRst=null,rstV=-1e9;
  // ратуша -> здание: пополнение локальных припасов (v2.1)
  for(const inc of marketFindResourceOffers(o=>o.side==='incoming'&&o.target&&o.target.kind==='restock')){
    const src=marketFindResourceOffers(o=>o.side==='outgoing'&&o.source&&o.source.kind==='stock'&&o.reason===inc.reason)[0];
    if(!src)continue;
    const tb=S.buildings[inc.target.b];if(!tb||!tb.built)continue;
    const d=cheb(u.x|0,u.y|0,S.th.x,S.th.y);
    let v=(inc.priority||1)*2.4+(src.priority||1)-d*0.25;
    if(v>rstV){rstV=v;bestRst={mode:'restock',b:inc.target.b,res:inc.reason,inc,src}}
  }
  if(bestRst&&rstV>=Math.max(pickV,expV)-1.0){
    const amt=Math.min(CFG.HAUL_TAKE,marketFree(bestRst.inc),marketFree(bestRst.src));
    if(amt>0)return {mode:'restock',b:bestRst.b,res:bestRst.res,amount:amt,refs:[marketReserveId(bestRst.inc.id,amt,u.id),marketReserveId(bestRst.src.id,amt,u.id)].filter(Boolean)};
  }
  if(bestExport&&(!bestPickup||expV>=pickV-1.0)){
    const amt=Math.min(CFG.HAUL_TAKE,marketFree(bestExport.inc),marketFree(bestExport.src));
    if(amt>0)return {mode:'export',port:bestExport.port,res:bestExport.res,amount:amt,refs:[marketReserveId(bestExport.inc.id,amt,u.id),marketReserveId(bestExport.src.id,amt,u.id)].filter(Boolean)};
  }
  if(bestPickup){
    const amt=Math.min(CFG.HAUL_TAKE,marketFree(bestPickup.out),marketFree(bestPickup.sink));
    if(amt>0)return {mode:'pickup',b:bestPickup.b,res:bestPickup.res,amount:amt,refs:[marketReserveId(bestPickup.out.id,amt,u.id),marketReserveId(bestPickup.sink.id,amt,u.id)].filter(Boolean)};
  }
  return null;
}
