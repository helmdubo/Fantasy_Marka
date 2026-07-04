/* ================= ECON ================= */
function bandIdx(res){
  if(res==='food'){
    const days=S.stock.food/Math.max(1,S.settlers.length);
    const B=CFG.FOOD_DAYS;
    for(let i=0;i<4;i++)if(days<B[i])return i;
    return 4;
  }
  const B=CFG.BANDS[res],v=S.stock[res];
  for(let i=0;i<4;i++)if(v<B[i])return i;
  return 4;
}
function computeLevels(){
  S.lvl={food:bandIdx('food'),wood:bandIdx('wood'),stone:bandIdx('stone'),gems:bandIdx('gems')};
  S.uiDirty=true;
}
function canPay(type){
  const cost=CFG.COSTS[type],gate=CFG.GATE[type];
  for(const r in gate)if(bandIdx(r)<gate[r])return false;
  for(const r in cost)if(S.stock[r]<cost[r])return false;
  return true;
}
function payCost(type){const cost=CFG.COSTS[type];for(const r in cost)S.stock[r]-=cost[r]}

