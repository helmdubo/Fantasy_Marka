/* ================= VISION ================= */
// Пикинг: мировая точка (wx,wy в three-координатах) -> ближайший хекс
function pickHex(wx,wy){
  let best=null,bd=1e9;
  const c0=Math.floor(wx/CW-0.5);
  for(const x of [c0,c0+1,c0-1,c0+2]){
    const y0=Math.round(S.H-0.5-zig(x)-wy);
    for(let dy=-1;dy<=1;dy++){
      const y=y0+dy;
      const ddx=wx-WXC(x),ddy=wy-WYCC(x,y);
      const d=ddx*ddx+ddy*ddy;
      if(d<bd){bd=d;best={x,y}}
    }
  }
  return best;
}
function markVisibleCell(x,y,alpha){
  if(!inMap(x,y))return;
  const i=idx(x,y);
  S.visible[i]=1;
  if(S.visibleAlpha)S.visibleAlpha[i]=Math.max(S.visibleAlpha[i]||0,alpha===undefined?1:alpha);
  if(!S.explored[i]){S.explored[i]=1;S.fogDirty=true;
    if(S.terr[i]===T.MTN)S.reliefDirty=true} // knowledge-рельеф: гора дорастает
}
function stampVision(cx,cy,r,viewH){
  // 360° building/ward visibility. Kept for towers and static points only.
  if(viewH===undefined)viewH=1;
  const r2=r*r,wx0=WXC(cx),wy0=WYCC(cx,cy);
  for(let dy=-r-1;dy<=r+1;dy++)for(let dx=-r;dx<=r;dx++){
    const x=cx+dx,y=cy+dy;if(!inMap(x,y))continue;
    const wdx=WXC(x)-wx0,wdy=WYCC(x,y)-wy0;
    const d2=wdx*wdx+wdy*wdy;
    if(d2>r2+r*0.5)continue;
    if(d2>1&&!losClear(cx,cy,x,y,viewH))continue;
    markVisibleCell(x,y,1-clamp((Math.sqrt(d2)-r+1),0,1)*0.35);
  }
}
function unitSight(u){
  const t=S.terr[idx(u.x|0,u.y|0)];
  if(t===T.FOREST)return 1;
  let r=CFG.RACE[u.race].sight;
  if(t===T.ROCK)r+=1;
  if(S.isNight)r=Math.max(1,Math.ceil(r/2));
  return r;
}
function stampCone(cx,cy,dx,dy,r,viewH){
  // Cone-only personal vision: cells behind the walking direction are not revealed.
  const r2=r*r,wx0=WXC(cx),wy0=WYCC(cx,cy);
  const dl=Math.hypot(dx*CW,dy)||1;const wdirx=dx*CW/dl,wdiry=-dy/dl;
  const cosLimit=0.30; // ~145° cone; still excludes the rear hemisphere.
  for(let oy=-r-1;oy<=r+1;oy++)for(let ox=-r;ox<=r;ox++){
    const x=cx+ox,y=cy+oy;if(!inMap(x,y))continue;
    const wdx=WXC(x)-wx0,wdy=WYCC(x,y)-wy0;
    const d2=wdx*wdx+wdy*wdy;
    if(d2>r2+r*0.5)continue;
    if(d2>0){
      const dl2=Math.sqrt(d2);
      if((wdx*wdirx+wdy*wdiry)/dl2<cosLimit)continue;
    }
    if(d2>1&&!losClear(cx,cy,x,y,viewH))continue;
    markVisibleCell(x,y,1-clamp((Math.sqrt(d2)-r+1),0,1)*0.25);
  }
}
function buildingSightRadius(u,b){
  let r=Math.max(1,unitSight(u)-1);
  if(b&&b.type==='tower')return r+CFG.TOWER_SIGHT;
  // Buildings with people inside see only a small local radius; watchtower keeps full function.
  return Math.max(1,Math.ceil(r*0.5));
}
function recomputeVision(){
  S.visible.fill(0);
  if(S.visibleAlpha)S.visibleAlpha.fill(0);
  for(const u of S.settlers){
    if(u.act==='sail')continue;
    if(u.inside>=0){
      const b=S.buildings[u.inside];
      const vh=heightOf(S.terr[idx(b?b.x:0,b?b.y:0)]);
      if(b)stampVision(b.x,b.y,buildingSightRadius(u,b),b.type==='tower'?Math.max(vh,1):vh);
    }else{
      const vh=heightOf(S.terr[idx(u.x|0,u.y|0)]);
      stampCone(u.x|0,u.y|0,u.dirX||u.fx||1,u.dirY||0,unitSight(u),vh);
    }
  }
  if(S.party)stampCone(S.party.x|0,S.party.y|0,1,0,2,0);
  S.fogDirty=true;
}
function exploreRing(cx,cy){
  const cells=[[0,0]].concat(hexDirs(cx));
  for(const d of cells){
    const x=cx+d[0],y=cy+d[1];if(!inMap(x,y))continue;
    const i=idx(x,y);
    if(!S.explored[i]){S.explored[i]=1;S.fogDirty=true;
      if(S.terr[i]===T.MTN)S.reliefDirty=true}
  }
}

