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
  // v2.2: полоска заряда атаки (кулдаун) — видна и у своих, и у врагов
  const cbar=document.createElement('div');cbar.className='cdbar';
  const cfill=document.createElement('div');cbar.appendChild(cfill);div.appendChild(cbar);
  c._el=div;c._hp=fill;c._cd=cfill;
  if(c.side==='party'){ // герой бьёт по клику, когда заряд полон
    div.onclick=()=>{
      if(!BTUI||BTUI.bt.over)return;
      if(c.hp<=0||c.cd<c.cdMax)return;
      btAct(BTUI.bt,c,BTUI.bt.enemies);
    };
  }
  return div;
}
/* один акт бойца: удар/лечение, сброс заряда, проверка исхода */
function btAct(bt,att,foes){
  bt.events.length=0;
  const tempo=(att.side==='party'&&bt.thief&&!att._struck)?1.5:1; // «Вор»: темп первого удара
  att._struck=true;
  btStrike(bt,att,foes,tempo);
  att.cd=0;
  if(!btAlive(bt.enemies).length){bt.over=true;bt.win=true}
  else{
    const alive=btAlive(bt.party);
    const hpFrac=alive.reduce((a,u)=>a+u.hp,0)/bt.party.reduce((a,u)=>a+u.maxHp,0);
    if(!alive.length||hpFrac<0.3){bt.over=true;bt.retreat=true}
  }
  btRender(bt);
  bt.events.length=0; // события показаны — не дублировать в следующем рендере
}
function btRender(bt){
  for(const c of bt.party.concat(bt.enemies)){
    if(!c._el)continue;
    const f=Math.max(0,c.hp/c.maxHp);
    c._hp.style.width=(f*100).toFixed(0)+'%';
    c._hp.style.background=f<0.3?'var(--bad)':(f<0.6?'#c9b458':'var(--ok)');
    c._el.classList.toggle('dead',c.hp<=0);
    if(c._cd){
      c._cd.style.width=Math.min(100,(c.cd/c.cdMax*100)).toFixed(0)+'%';
      c._el.classList.toggle('pready',c.side==='party'&&c.hp>0&&c.cd>=c.cdMax&&!bt.over);
    }
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
  // v2.2: бой на кулдаунах. Враги бьют сами, когда их заряд полон (полоска
  // видна игроку). Герой с полным зарядом подсвечен — атакует по клику.
  // Дальше этот же каркас поедет в пошаговый режим с решениями игрока.
  const box=el('battle');
  el('bt_title').textContent='Бой: «'+bt.lairName+'»'+(bt.ambushed?' · засада!':'');
  for(const id of ['bt_p_front','bt_p_back','bt_e_front','bt_e_back'])el(id).innerHTML='';
  el('bt_log').innerHTML='<div class="e">Кликай по герою с полным зарядом (жёлтая рамка) — он атакует.</div>';
  for(const c of bt.party)el(c.row==='front'?'bt_p_front':'bt_p_back').appendChild(btUnitCard(c));
  for(const c of bt.enemies)el(c.row==='front'?'bt_e_front':'bt_e_back').appendChild(btUnitCard(c));
  box.style.display='block';
  let speed=1;
  const fleeBtn=el('bt_flee'),fastBtn=el('bt_fast');
  fleeBtn.disabled=false;
  fleeBtn.onclick=()=>{bt.fleeReq=true;fleeBtn.disabled=true};
  fastBtn.onclick=()=>{speed=speed===1?2:1;fastBtn.classList.toggle('on',speed===2)};
  // стартовые заряды: засада — враги почти заряжены («Дозор» отряда съедает
  // фору), обычный бой — лёгкий разброс; «Вор» даёт героям фору темпа
  bt.elapsed=0;bt.round=1;
  for(const e of bt.enemies)
    e.cd=bt.ambushed?e.cdMax*Math.max(0.4,1-0.12*bt.vigil):S.rng()*0.4*e.cdMax;
  for(const h of bt.party)h.cd=bt.thief?h.cdMax*0.5:0;
  if(bt.ambushed&&bt.vigil>0){bt.events=[{t:'note',m:'«Дозор» упреждает засаду'}]}
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
    if(!bt.over){
      const dt=0.1*speed;
      bt.elapsed+=dt;
      bt.round=Math.max(1,Math.ceil(bt.elapsed/3)); // «раунды» для лога/итогов
      if(bt.fleeReq){bt.over=true;bt.retreat=true;bt.events=[{t:'flee'}];btRender(bt)}
      else{
        for(const e of bt.enemies){
          if(e.hp<=0||bt.over)continue;
          e.cd=Math.min(e.cdMax,e.cd+dt);
          if(e.cd>=e.cdMax)btAct(bt,e,bt.party);
        }
        for(const h of bt.party)
          if(h.hp>0)h.cd=Math.min(h.cdMax,h.cd+dt);
        if(bt.elapsed>90&&!bt.over){bt.over=true;bt.retreat=true} // затяжной бой — отход
        btRender(bt);
      }
    }
    if(bt.over){
      el('bt_log').innerHTML='<div class="e">'+(bt.win?'🏆 Победа!':'🏳 Отряд отходит…')+'</div>'+el('bt_log').innerHTML;
      finish();
    }
  },100)};
}
