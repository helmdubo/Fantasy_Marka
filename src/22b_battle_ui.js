/* ---------- ЭКРАН БОЯ (п.11, browser only) ----------
   Отряды стоят друг напротив друга: передний/задний ряд с каждой стороны.
   Раунды тикают сами (интервал), урон подсвечивается, есть «Отступить».
   По завершении вызывается continuation из beginBattle. */
let BTUI=null;
function btUnitGrid(c){
  if(c.side==='party')return {grid:UNIT_GRIDS[c.uref.race],map:UNIT_MAPS[c.uref.race]};
  // имена гридов/карт врагов заданы строками в ENEMY_DEFS — берём из общего scope
  const G={G_GOBLIN,G_GOBSHAMAN,G_RAIDER,G_SKELETON,G_NECRO_U,G_BEAST,G_FIREATR,G_MAGMAATR};
  const M={GOBLIN_MAP,GOBSHAMAN_MAP,RAIDER_MAP,SKELETON_MAP,NECRO_U_MAP,BEAST_MAP,FIREATR_MAP,MAGMAATR_MAP};
  return {grid:G[c.def.grid],map:M[c.def.map]};
}
function btUnitCard(c){
  const div=document.createElement('div');
  div.className='bt-unit';
  const cv=document.createElement('canvas');cv.width=16;cv.height=16;
  const ctx=cv.getContext('2d');ctx.imageSmoothingEnabled=false;
  const g=btUnitGrid(c);
  if(g.grid)drawGrid(ctx,0,0,g.grid,g.map);
  if(c.side==='enemy'){ // враг смотрит влево
    const flip=document.createElement('canvas');flip.width=16;flip.height=16;
    const fx=flip.getContext('2d');fx.imageSmoothingEnabled=false;
    fx.translate(16,0);fx.scale(-1,1);fx.drawImage(cv,0,0);
    cv.getContext('2d').clearRect(0,0,16,16);
    cv.getContext('2d').drawImage(flip,0,0);
  }
  div.appendChild(cv);
  const nm=document.createElement('div');nm.className='nm';nm.textContent=c.name;div.appendChild(nm);
  const bar=document.createElement('div');bar.className='hpbar';
  const fill=document.createElement('div');bar.appendChild(fill);div.appendChild(bar);
  c._el=div;c._hp=fill;
  return div;
}
function btRender(bt){
  for(const c of bt.party.concat(bt.enemies)){
    if(!c._el)continue;
    const f=Math.max(0,c.hp/c.maxHp);
    c._hp.style.width=(f*100).toFixed(0)+'%';
    c._hp.style.background=f<0.3?'var(--bad)':(f<0.6?'#c9b458':'var(--ok)');
    c._el.classList.toggle('dead',c.hp<=0);
  }
  const lg=el('bt_log');
  const lines=[];
  for(const e of bt.events.slice().reverse()){
    if(e.t==='hit')lines.push('<div class="e">⚔ '+e.a+' → '+e.b+': −'+e.v.toFixed(0)+(e.kill?' ☠':'')+'</div>');
    else if(e.t==='heal')lines.push('<div class="e">🌿 '+e.a+' лечит '+e.b+': +'+e.v.toFixed(0)+'</div>');
    else if(e.t==='note')lines.push('<div class="e">👁 '+e.m+'</div>');
    else if(e.t==='flee')lines.push('<div class="e">🏳 Отряд отступает!</div>');
  }
  if(lines.length)lg.innerHTML=lines.join('')+lg.innerHTML;
  while(lg.children.length>18)lg.removeChild(lg.lastChild);
  // подсветка последних целей
  for(const c of bt.party.concat(bt.enemies)){if(c._el){c._el.classList.remove('hitfx','healfx')}}
  for(const e of bt.events){
    const all=bt.party.concat(bt.enemies);
    const t=all.find(c=>c.name===e.b);
    if(t&&t._el)t._el.classList.add(e.t==='heal'?'healfx':'hitfx');
  }
}
function openBattleScreen(bt,done){
  const box=el('battle');
  el('bt_title').textContent='Бой: «'+bt.lairName+'»'+(bt.ambushed?' · засада!':'');
  for(const id of ['bt_p_front','bt_p_back','bt_e_front','bt_e_back'])el(id).innerHTML='';
  el('bt_log').innerHTML='<div class="e">Отряды сходятся…</div>';
  for(const c of bt.party)el(c.row==='front'?'bt_p_front':'bt_p_back').appendChild(btUnitCard(c));
  for(const c of bt.enemies)el(c.row==='front'?'bt_e_front':'bt_e_back').appendChild(btUnitCard(c));
  box.style.display='block';
  let speed=1;
  const fleeBtn=el('bt_flee'),fastBtn=el('bt_fast');
  fleeBtn.disabled=false;
  fleeBtn.onclick=()=>{bt.fleeReq=true;fleeBtn.disabled=true};
  fastBtn.onclick=()=>{speed=speed===1?2:1;fastBtn.classList.toggle('on',speed===2)};
  btRender(bt);
  const finish=()=>{
    clearInterval(BTUI.iv);BTUI=null;
    setTimeout(()=>{
      box.style.display='none';
      done(); // continuation из beginBattle (finishBattle внутри)
      S.uiDirty=true;
    },900);
  };
  BTUI={bt,iv:setInterval(()=>{
    if(!BTUI)return;
    for(let k=0;k<speed;k++)if(!bt.over)stepBattleRound(bt);
    btRender(bt);
    if(bt.over){
      el('bt_log').innerHTML='<div class="e">'+(bt.win?'🏆 Победа!':'🏳 Отряд отходит…')+'</div>'+el('bt_log').innerHTML;
      finish();
    }
  },850)};
}
