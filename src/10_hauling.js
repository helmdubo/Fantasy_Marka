function startSupply(u){
  const b=S.buildings[u.job.b];
  const r=missingRes(b);
  if(!r){releaseJob(u);u.act='idle';return}
  // Источник выбирается через Resource Market: склад/производственный буфер публикуют outgoing offer,
  // стройка публикует incoming offer, а работник берёт ближайшее/приоритетное совпадение.
  let offer=marketSelectSupplySource(u,r,b);
  let src=null;
  if(offer&&offer.source){
    if(offer.source.kind==='stock')src={kind:'stock',x:S.th.x,y:S.th.y,offerId:offer.id};
    else if(offer.source.kind==='buf'){const ob=S.buildings[offer.source.b];if(ob)src={kind:'buf',b:offer.source.b,x:ob.x,y:ob.y,offerId:offer.id}}
  }
  // fallback, если рынок ещё не собрался после изменения склада
  if(!src){
    let bd=1e9;
    if((S.stock[r]||0)>=1){src={kind:'stock',x:S.th.x,y:S.th.y};bd=cheb(u.x|0,u.y|0,S.th.x,S.th.y)}
    for(let bi=0;bi<S.buildings.length;bi++){
      const o=S.buildings[bi];
      if(!o.built||(o.buf[r]||0)<1)continue;
      const d=cheb(u.x|0,u.y|0,o.x,o.y);
      if(d<bd){bd=d;src={kind:'buf',b:bi,x:o.x,y:o.y}}
    }
  }
  if(!src){releaseJob(u);u.act='idle';u.wanderT=2;return}
  u.supplyB=u.job.b;u.supplyRes=r;u.supplySrc=src;
  const needAmt=Math.max(1,(b.need[r]||0)-(b.got[r]||0));
  const cap=Math.max(1,Math.round(CFG.HAUL_TAKE*CFG.RACE[u.race].carry));
  const offerRef=src.offerId?marketReserveId(src.offerId,Math.min(cap,needAmt),u.id):null;
  u.supplyMarketRefs=offerRef?[offerRef]:null;
  const p=findPath(S,u.x|0,u.y|0,src.x,src.y,true);
  if(!p){marketClearRefs(u,'supplyMarketRefs',true);releaseJob(u);u.act='idle';return}
  u.path=p;u.pathI=0;u.act='goto';u.after='supplySrc';
}
function supplyPick(u){
  const b=S.buildings[u.supplyB];
  if(!b||b.built||!missingRes(b)){releaseJob(u);u.act='idle';return}
  const r=u.supplyRes,src=u.supplySrc;
  const needAmt=(b.need[r]||0)-(b.got[r]||0);
  const cap=Math.max(1,Math.round(CFG.HAUL_TAKE*CFG.RACE[u.race].carry));
  const reserved=u.supplyMarketRefs&&u.supplyMarketRefs[0]?u.supplyMarketRefs[0].amount:cap;
  let take=0;
  if(src.kind==='stock'){take=Math.min(needAmt,cap,reserved,Math.floor(S.stock[r]));S.stock[r]-=take;addResourcePopup(r,-take,S.th.x,S.th.y)}
  else{const o=S.buildings[src.b];take=Math.min(needAmt,cap,reserved,o?Math.floor(o.buf[r]):0);if(o){o.buf[r]-=take;addResourcePopup(r,-take,o.x,o.y)}}
  if(take<=0){marketClearRefs(u,'supplyMarketRefs',true);releaseJob(u);u.act='idle';u.wanderT=1.5;return}
  u.carry={_supply:take};u.supplyAmt=take;
  computeLevels();
  const p=findPath(S,u.x|0,u.y|0,b.x,b.y,true);
  if(!p){ // вернуть взятое
    if(src.kind==='stock'){S.stock[r]+=take;addResourcePopup(r,take,S.th.x,S.th.y)}else if(S.buildings[src.b]){S.buildings[src.b].buf[r]+=take;addResourcePopup(r,take,S.buildings[src.b].x,S.buildings[src.b].y)}
    u.carry=null;marketClearRefs(u,'supplyMarketRefs',true);releaseJob(u);u.act='idle';return}
  u.path=p;u.pathI=0;u.act='goto';u.after='supplyDst';
}
function supplyDrop(u){
  const b=S.buildings[u.supplyB];
  u.carry=null;
  if(b&&!b.built){
    b.got[u.supplyRes]=(b.got[u.supplyRes]||0)+u.supplyAmt;
    addResourcePopup(u.supplyRes,u.supplyAmt,b.x,b.y);
    if(!missingRes(b))log('🧱 Фундамент обеспечен: '+CFG.BNAME[b.type].toLowerCase()+' — начинается стройка.');
  }
  u.supplyB=undefined;u.supplyAmt=0;
  marketClearRefs(u,'supplyMarketRefs',false);
  releaseJob(u);u.worksToday++;
  u.act='idle';u.wanderT=0.3;
}
function fieldTarget(b){
  const R=CFG.HARVEST_R+((b.tier||1)-1);
  let best=null,bd=1e9;
  for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){
    const x=b.x+dx,y=b.y+dy;if(!inMap(x,y))continue;
    const i=idx(x,y);
    let ok=false,adj=false;
    if(b.type==='lumber'&&S.terr[i]===T.FOREST&&S.terrHp[i]>0){ok=true;adj=true} // рубим с опушки
    if(b.type==='farm'&&S.feat[i]===F.WHEAT&&S.featHp[i]>0){ok=true;adj=false}
    if(!ok)continue;
    const d=Math.abs(dx)+Math.abs(dy);
    if(d<bd){bd=d;best={x,y,adj}}
  }
  return best;
}
function fieldHarvest(u){
  const b=S.buildings[u.fieldB];
  if(!b||!b.built||b.ruined){fieldAbort(u);return}
  const c=u.fieldCell,i=idx(c.x,c.y);
  let got=null;
  if(b.type==='lumber'&&S.terr[i]===T.FOREST&&S.terrHp[i]>0){
    S.terrHp[i]--;got={wood:1+b.tier};addSkillXp(u,'axe',1);
    if(S.terrHp[i]<=0){S.terr[i]=T.GRASS;S.feat[i]=F.STUMP;S.terrDirty=true;S.featDirty=true;
      S.regrow.push({i,days:15+((S.rng()*8)|0),kind:'forest'});rebuildPass()}
  }else if(b.type==='farm'&&S.feat[i]===F.WHEAT&&S.featHp[i]>0){
    S.featHp[i]--;got={food:1+b.tier};addSkillXp(u,'herb',1);
    if(S.featHp[i]<=0){S.feat[i]=F.NONE;S.featDirty=true;S.regrow.push({i,days:5,kind:'wheat'})}
  }
  if(!got){fieldAbort(u);return}
  u.fieldCarry=got;
  const p=findPath(S,u.x|0,u.y|0,b.x,b.y,true);
  if(!p){fieldAbort(u);return}
  u.path=p;u.pathI=0;u.act='goto';u.after='harvBack';
}
function fieldReturn(u){
  const b=S.buildings[u.fieldB];
  if(b&&u.fieldCarry){
    for(const r in u.fieldCarry){b.buf[r]+=u.fieldCarry[r];addResourcePopup(r,u.fieldCarry[r],b.x,b.y)}
    u.fieldCarry=null;
    if(b.built&&!b.ruined&&bufTotal(b)<capOf(b)&&!S.isNight&&u.stam>CFG.STAM_LOW){
      // next round
      const tgt=fieldTarget(b);
      if(tgt){
        const p=findPath(S,u.x|0,u.y|0,tgt.x,tgt.y,false);
        if(p){u.fieldCell=tgt;u.path=p;u.pathI=0;u.act='goto';u.after='harvGo';return}
      }else{b.starve=true;
        log('🕸 '+CFG.BNAME[b.type]+': окрестные угодья истощены, работа встала.')}
    }
    if(bufTotal(b)>0&&(S.haulerId<0||bufTotal(b)>=capOf(b))){
      const carry={_src:b.type};
      for(const r2 in b.buf){if(b.buf[r2]>0){carry[r2]=b.buf[r2];addResourcePopup(r2,-b.buf[r2],b.x,b.y);b.buf[r2]=0}}
      fieldAbort(u);
      u.carry=carry;u.selfHaul=true;
      const p=findPath(S,u.x|0,u.y|0,S.th.x,S.th.y,true);
      if(p){u.path=p;u.pathI=0;u.act='goto';u.after='deposit';return}
      u.carry=null;
    }
  }
  fieldAbort(u);
}
function fieldAbort(u){
  if(u.fieldB!==undefined){
    const b=S.buildings[u.fieldB];
    if(b&&b.workerId===u.id)b.workerId=null;
  }
  u.fieldB=undefined;u.fieldCell=null;u.fieldCarry=null;
  releaseJob(u);
  u.act='idle';u.wanderT=0.4;
}
function deposit(u){
  const c=u.carry;u.carry=null;
  if(!c){u.act='idle';return}
  const src=c._src;
  for(const r in c){
    if(r==='_src')continue;
    S.stock[r]+=c[r];addResourcePopup(r,c[r],S.th.x,S.th.y);
    const tax=c[r]*(CFG.PRICE[r]||0)*CFG.MARKET_TAX;S.gold+=tax;if(tax>0)addResourcePopup('gold',tax,S.th.x,S.th.y); // внутренняя рыночная пошлина губернатора
    let k=null;
    if(r==='food')k=(src==='fisher')?'fish':'agr';
    else if(r==='wood')k='wood';
    else if(r==='stone'||r==='gems')k='stone';
    if(k)S.roleTally[k]+=c[r];
  }
  if(S.gold>=CFG.WAGE){
    const th=CFG.THRIFT[u.race];
    S.gold-=CFG.WAGE;u.wallet+=CFG.WAGE*th;S.gold+=CFG.WAGE*(1-th);
  }
  addSkillXp(u,'haul',0.5);
  u.selfHaul=false;u.haulReserveAmt=0;marketClearRefs(u,'haulMarketRefs',false);u.worksToday++;u.act='idle';u.wanderT=0.3;S.uiDirty=true;
}
function exportTask(){
  const port=S.buildings.findIndex(b=>b.built&&!b.ruined&&connected(b)&&b.type==='port'&&holdTotal(b)<shipHold());
  if(port<0)return null;
  for(const r of ['gems','stone','wood','food']){
    if(S.policy[r]!=='export')continue;
    const thr=(r==='food')?S.settlers.length*CFG.FOOD_DAYS[3]:CFG.BANDS[r][3];
    if(S.stock[r]-thr>=2)return {port,res:r};
  }
  return null;
}
function haulThink(u){
  const task=marketSelectHaulTask(u);
  if(task&&task.mode==='pickup'){
    const b=S.buildings[task.b];
    const p=findPath(S,u.x|0,u.y|0,b.x,b.y,true);
    if(p===null){marketReleaseRefs(task.refs);u.wanderT=2;return}
    u.path=p;u.pathI=0;u.act='goto';u.after='pickup';u.haulB=task.b;
    u.haulReserveAmt=task.amount;u.haulMarketRefs=task.refs;
    return;
  }
  if(task&&task.mode==='restock'){
    const p=findPath(S,u.x|0,u.y|0,S.th.x,S.th.y,true);
    if(p===null){marketReleaseRefs(task.refs);u.wanderT=2;return}
    u.rstB=task.b;u.rstRes=task.res;u.rstReserveAmt=task.amount;
    u.haulMarketRefs=task.refs;
    u.path=p;u.pathI=0;u.act='goto';u.after='rstSrc';
    return;
  }
  if(task&&task.mode==='export'){
    const p=findPath(S,u.x|0,u.y|0,S.th.x,S.th.y,true);
    if(p===null){marketReleaseRefs(task.refs);u.wanderT=2;return}
    u.expPort=task.port;u.expRes=task.res;u.expReserveAmt=task.amount;
    u.haulMarketRefs=task.refs;
    u.path=p;u.pathI=0;u.act='goto';u.after='expSrc';
    return;
  }
  u.wanderT=1.5;
}
function expPick(u){
  const b=S.buildings[u.expPort];
  if(!b||b.sailing&&holdTotal(b)>=shipHold()){u.act='idle';return}
  const r=u.expRes;
  const thr=(r==='food')?S.settlers.length*CFG.FOOD_DAYS[3]:CFG.BANDS[r][3];
  const excess=Math.floor(S.stock[r]-thr);
  const cap=Math.round(CFG.HAUL_TAKE*CFG.RACE[u.race].carry);
  const reserved=u.expReserveAmt||cap;
  const room=shipHold()-holdTotal(b);
  const take=Math.max(0,Math.min(excess,cap,reserved,room));
  if(take<=0){marketClearRefs(u,'haulMarketRefs',true);u.act='idle';u.wanderT=1.5;return}
  S.stock[r]-=take;addResourcePopup(r,-take,S.th.x,S.th.y);computeLevels();
  u.carry={_exp:take};u.expAmt=take;
  const p=findPath(S,u.x|0,u.y|0,b.x,b.y,true);
  if(!p){S.stock[r]+=take;addResourcePopup(r,take,S.th.x,S.th.y);u.carry=null;marketClearRefs(u,'haulMarketRefs',true);u.act='idle';return}
  u.path=p;u.pathI=0;u.act='goto';u.after='expDst';
}
function expDrop(u){
  const b=S.buildings[u.expPort];
  u.carry=null;
  if(b&&u.expRes){
    if(!b.sailing){
      const room=Math.max(0,shipHold()-holdTotal(b));
      const drop=Math.min(room,u.expAmt||0);
      b.hold[u.expRes]=(b.hold[u.expRes]||0)+drop;if(drop>0)addResourcePopup(u.expRes,drop,b.x,b.y);
      const overflow=(u.expAmt||0)-drop;
      if(overflow>0){S.stock[u.expRes]=(S.stock[u.expRes]||0)+overflow;addResourcePopup(u.expRes,overflow,S.th.x,S.th.y)}
      if(holdTotal(b)>=shipHold())log('📦 Трюмы порта полны — ждём отплытия.');
    }else{
      S.stock[u.expRes]=(S.stock[u.expRes]||0)+(u.expAmt||0);addResourcePopup(u.expRes,u.expAmt||0,S.th.x,S.th.y);
    }
  }
  u.expPort=undefined;u.expReserveAmt=0;u.worksToday++;addSkillXp(u,'haul',0.5);
  marketClearRefs(u,'haulMarketRefs',false);
  u.act='idle';u.wanderT=0.3;S.uiDirty=true;
}
function rstPick(u){
  // v2.1: разносчик берёт со склада ратуши припасы для локального запаса здания
  const b=S.buildings[u.rstB];
  const r=u.rstRes,sd=b&&CFG.STORE[b.type];
  if(!b||!b.built||b.ruined||!sd||!sd[r]){marketClearRefs(u,'haulMarketRefs',true);u.act='idle';u.wanderT=1;return}
  const room=Math.max(0,Math.ceil(sd[r]-((b.store&&b.store[r])||0)));
  const ccap=Math.round(CFG.HAUL_TAKE*CFG.RACE[u.race].carry);
  const reserved=u.rstReserveAmt||ccap;
  const take=Math.max(0,Math.min(room,ccap,reserved,Math.floor(S.stock[r]||0)));
  if(take<=0){marketClearRefs(u,'haulMarketRefs',true);u.act='idle';u.wanderT=1.5;return}
  S.stock[r]-=take;addResourcePopup(r,-take,S.th.x,S.th.y);computeLevels();
  u.carry={_rst:take};u.rstAmt=take;
  const p=findPath(S,u.x|0,u.y|0,b.x,b.y,true);
  if(!p){S.stock[r]+=take;addResourcePopup(r,take,S.th.x,S.th.y);u.carry=null;marketClearRefs(u,'haulMarketRefs',true);u.act='idle';return}
  u.path=p;u.pathI=0;u.act='goto';u.after='rstDst';
}
function rstDrop(u){
  const b=S.buildings[u.rstB];
  u.carry=null;
  if(b&&u.rstRes){
    const sd=CFG.STORE[b.type]||{};
    const cap=sd[u.rstRes]||0,have=(b.store&&b.store[u.rstRes])||0;
    const drop=Math.max(0,Math.min(u.rstAmt||0,cap-have)); // клапан: два разносчика не переполнят запас
    if(drop>0){b.store[u.rstRes]=have+drop;addResourcePopup(u.rstRes,drop,b.x,b.y)}
    const back=(u.rstAmt||0)-drop;
    if(back>0)S.stock[u.rstRes]=(S.stock[u.rstRes]||0)+back; // излишек возвращается на склад
  }
  u.rstB=undefined;u.rstAmt=0;u.rstReserveAmt=0;u.worksToday++;
  marketClearRefs(u,'haulMarketRefs',false);
  u.act='idle';u.wanderT=0.3;S.uiDirty=true;
}
function doPickup(u){
  const b=S.buildings[u.haulB];
  if(!b||bufTotal(b)<=0){marketClearRefs(u,'haulMarketRefs',true);u.act='idle';u.wanderT=0.5;return}
  const cap=Math.round(CFG.HAUL_TAKE*CFG.RACE[u.race].carry);
  let left=Math.min(cap,u.haulReserveAmt||cap);const carry={_src:b.type};
  for(const r of ['gems','stone','wood','food']){
    if(left<=0)break;
    const take=Math.min(left,b.buf[r]);
    if(take>0){carry[r]=take;b.buf[r]-=take;addResourcePopup(r,-take,b.x,b.y);left-=take}
  }
  if(Object.keys(carry).length<=1){marketClearRefs(u,'haulMarketRefs',true);u.act='idle';u.wanderT=0.5;return}
  u.carry=carry;
  const p=findPath(S,u.x|0,u.y|0,S.th.x,S.th.y,true);
  if(p===null){u.carry=null;marketClearRefs(u,'haulMarketRefs',true);u.act='idle';return}
  u.path=p;u.pathI=0;u.act='goto';u.after='deposit';
}
function isHauler(u){return !!(u&&(S.haulerIds&&S.haulerIds.indexOf(u.id)>=0||u.id===S.haulerId))}
function desiredHaulerCount(){
  const prod=S.buildings.filter(b=>b.built&&(b.type==='farm'||b.type==='fisher'||b.type==='lumber'||b.type==='mine')).length;
  if(!prod)return 0;
  let d=1;
  if(prod>=3)d++;
  if(countB('port',true)>0||countB('guild',true)>0)d++;
  if(stockWorld('stone')+stockWorld('food')+stockWorld('wood')>220)d++;
  return Math.max(1,Math.min(d,Math.max(1,Math.floor(S.settlers.length/4))));
}
function assignHauler(){
  const prod=S.buildings.some(b=>b.built&&(b.type==='farm'||b.type==='fisher'||b.type==='lumber'||b.type==='mine'));
  if(!prod){S.haulerId=-1;S.haulerIds=[];return}
  const desired=desiredHaulerCount();
  const old=(S.haulerIds||[]).filter(id=>S.settlers.some(u=>u.id===id&&!u.hero));
  S.haulerIds=old.slice(0,desired);
  const score=u=>(CFG.RACE[u.race].carry*10)+(u.race==='troll'?8:0)+(u.race==='dwarf'?2:0)-u.idleDays*0.2;
  while(S.haulerIds.length<desired){
    const cand=S.settlers.filter(u=>!u.hero&&u.inside!==-2&&S.haulerIds.indexOf(u.id)<0)
      .sort((a,b)=>score(b)-score(a))[0];
    if(!cand)break;
    S.haulerIds.push(cand.id);
    log('📦 '+RNAME[cand.race]+' №'+cand.id+' назначен складским рабочим ратуши ('+S.haulerIds.length+'/'+desired+').');
  }
  S.haulerId=S.haulerIds[0]||-1;
}
