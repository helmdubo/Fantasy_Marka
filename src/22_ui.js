/* ================= UI ================= */
function el(id){return document.getElementById(id)}
function togglePause(){S.paused=!S.paused;
  el('btnPause').textContent=S.paused?'▶':'⏸';
  el('pausemark').style.display=S.paused?'block':'none'}
function setSpeed(v){S.speed=v;
  for(const s of [1,2,4])el('spd'+s).classList.toggle('on',v===s);
  if(v===8)for(const s of [1,2,4])el('spd'+s).classList.remove('on')}
let debugBuilt=false;
function toggleDebug(){
  const d=el('debug');d.classList.toggle('hidden');
  if(!debugBuilt){buildDebug();debugBuilt=true}
}
function buildDebug(){
  const d=el('debug');
  d.innerHTML='<div class="ptitle">Отладка</div>'+
    '<div id="dbg_txt"></div>'+
    '<div style="margin-top:6px">'+
    '<button id="dbg_reveal">Снять туман</button>'+
    '<button id="dbg_grid">Сетка (G)</button>'+
    '<button id="dbg_x8">×8</button>'+
    '<button id="dbg_build">Стройка сейчас</button><br>'+
    '<button id="dbg_wood">+10 дерева</button>'+
    '<button id="dbg_food">+10 еды</button>'+
    '<button id="dbg_stone">+10 камня</button>'+
    '<button id="dbg_wfc">WFC-реплей</button>'+
    '</div>';
  el('dbg_reveal').onclick=()=>{S.revealAll=!S.revealAll;S.fogDirty=true};
  el('dbg_grid').onclick=()=>toggleGrid();
  el('dbg_x8').onclick=()=>{setSpeed(S.speed===8?1:8)};
  el('dbg_build').onclick=()=>{settleThink();S.uiDirty=true};
  el('dbg_wood').onclick=()=>{S.stock.wood+=10;computeLevels()};
  el('dbg_food').onclick=()=>{S.stock.food+=10;computeLevels()};
  el('dbg_stone').onclick=()=>{S.stock.stone+=10;computeLevels()};
  el('dbg_wfc').onclick=()=>wfcReplay();
}
/* ---------- дебаг-реплей WFC: пошаговая сборка тайлов ----------
   Перегенерирует текущий сид с записью трейса и проигрывает волну:
   контуры (вода/горы) видны сразу, клетки схлопываются в порядке волны,
   жёлтая точка — фронт; красные вспышки — релаксация (пересборка уже
   схлопнутых тайлов; классического бэктрекинга нет: правила мягкие,
   GRASS — запасной тайл, противоречия невозможны по построению). */
function wfcReplay(){
  WFC_DEBUG=true;
  restart(S.seedStr);
  WFC_DEBUG=false;
  const tr=S.wfcTrace;
  if(!tr){log('WFC-трейс пуст');return}
  const SC=Math.max(4,Math.floor(Math.min(innerWidth,innerHeight-60)/S.W));
  const cv=document.createElement('canvas');
  cv.width=S.W*SC;cv.height=S.H*SC;
  cv.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);'+
    'z-index:60;image-rendering:pixelated;border:2px solid var(--edge);box-shadow:0 6px 0 rgba(0,0,0,.5)';
  document.body.appendChild(cv);
  const ctx=cv.getContext('2d');
  const cols={};cols[T.WATER]='#2a6f92';cols[T.GRASS]='#4c8a3f';cols[T.FOREST]='#1f4526';cols[T.ROCK]='#73717c';cols[T.MTN]='#e8e8f0';
  const cell=(i,c)=>{ctx.fillStyle=c;ctx.fillRect((i%S.W)*SC,((i/S.W)|0)*SC,SC,SC)};
  ctx.fillStyle='#15101a';ctx.fillRect(0,0,cv.width,cv.height);
  for(const i of tr.fixed)cell(i,S.waterKind&&S.waterKind[i]===1?'#4899b0':cols[S.terr[i]===T.MTN?T.MTN:T.WATER]);
  let si=0,ri=0,stage=0,stop=false;
  const speed=Math.max(6,Math.round(tr.steps.length/240)); // ~4 сек на волну
  const drawRivers=()=>{
    if(!S.riverEdges)return;
    ctx.strokeStyle='#7fd4ff';ctx.lineWidth=Math.max(1,SC/4);
    const N2=S.W*S.H;
    for(const k of S.riverEdges){
      const a=Math.floor(k/N2),b=k%N2;
      ctx.beginPath();
      ctx.moveTo((a%S.W+0.5)*SC,(((a/S.W)|0)+0.5)*SC);
      ctx.lineTo((b%S.W+0.5)*SC,(((b/S.W)|0)+0.5)*SC);
      ctx.stroke();
    }
  };
  const frame=()=>{
    if(stop)return;
    if(stage===0){ // волна от контуров
      for(let k=0;k<speed&&si<tr.steps.length;k++,si++){
        const st=tr.steps[si];
        cell(st.i,cols[st.t]);
      }
      if(si<tr.steps.length){ // жёлтый фронт
        const st=tr.steps[si];
        cell(st.i,'#eec658');
      }else stage=1;
    }else if(stage===1){ // релаксация — «пересборка» тайлов, красная вспышка
      for(let k=0;k<3&&ri<tr.relax.length;k++,ri++){
        const st=tr.relax[ri];
        cell(st.i,'#d05a4e');
        setTimeout(((i2,t2)=>()=>{if(!stop)cell(i2,cols[t2])})(st.i,st.t),220);
      }
      if(ri>=tr.relax.length){stage=2;setTimeout(()=>{if(!stop){drawRivers()}},350)}
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  cv.onclick=()=>{stop=true;cv.remove()};
  log('🌀 WFC-реплей: волна от контуров; красное — релаксация; клик — закрыть.');
}
function updateDebug(fps){
  if(el('debug').classList.contains('hidden'))return;
  const st=S.stock;
  let h='<div class="row">сид <b>'+S.seedStr+'</b> · атлас <b>'+S.atlasMs.toFixed(0)+'мс</b> · fps <b>'+fps+'</b></div>';
  h+='<div class="row">казна <b>'+S.gold.toFixed(2)+'</b> · запасы: еда '+st.food.toFixed(1)+', дерево '+st.wood.toFixed(1)+', камень '+st.stone.toFixed(1)+', самоцв. '+st.gems.toFixed(1)+'</div>';
  h+='<div class="row">строитель: '+S.dbgBuilder+' · работ в пуле: '+S.jobPool.length+'</div>';
  if(S.market&&S.market.stats)h+='<div class="row">market: labor <b>'+S.market.stats.labor+'</b> · res in/out <b>'+S.market.stats.resourceIn+'/'+S.market.stats.resourceOut+'</b> · quest <b>'+S.market.stats.quest+'</b> · matched <b>'+S.market.stats.matched+'</b></div>';
  h+='<div class="row">контекст старта: '+RACES.map(r=>r+' '+S.raceW[r].toFixed(0)).join(', ')+'</div>';
  for(const u of S.settlers){
    h+='<div class="row">'+RNAME[u.race]+' · '+u.act+(u.job?'/'+u.job.kind:'')+' · кошель '+u.wallet.toFixed(2)+' · простой '+u.idleDays+'д</div>';
  }
  el('dbg_txt').innerHTML=h;
}
const PICK=new Set();
function toggleParty(show){
  const p=el('party');
  p.style.display=(show===undefined)?(p.style.display==='none'?'block':'none'):(show?'block':'none');
  if(p.style.display==='block')renderParty();
}
function renderParty(){
  const hs=S.settlers.filter(u=>u.hero);
  let sh='';
  for(const sl of S.partySlots){
    const names=sl.heroes.map(id=>{const u=S.settlers.find(x=>x.id===id);return u?u.hero.name:'†'}).join(', ');
    const rdy=slotReady(sl);
    const act=(S.activeSlot===sl.id)?' ✦':'';
    sh+='<div class="row" style="border-bottom:1px solid #2a2a3a;padding:3px 0">'+
      '<b>'+sl.name+act+'</b> <span style="color:var(--dim)">'+(sl.status==='away'?'⚔ в походе':(rdy?'готова':'раны/сборы'))+'</span><br>'+
      '<span style="font-size:11px">'+names+'</span><br>'+
      '<button class="qbtn" data-slact="use" data-sid="'+sl.id+'"'+(rdy?'':' disabled')+'>Сделать активной</button> '+
      '<button class="qbtn" data-slact="dis" data-sid="'+sl.id+'"'+(sl.status==='away'?' disabled':'')+'>Распустить</button></div>';
  }
  el('party_slots').innerHTML=sh||'<div class="row" style="color:var(--dim)">Слотов нет — выбери троих ниже.</div>';
  let hh='';
  for(const u of hs){
    const inSlot=slotOf(u.id);
    const items=(u.hero.items||[]).map(i=>i.name.split(' ')[0]).join(', ');
    hh+='<div class="row"><label style="display:flex;gap:6px;align-items:center'+(inSlot?';opacity:.5':'')+'">'+
      '<input type="checkbox" data-hid="'+u.id+'"'+(PICK.has(u.id)?' checked':'')+(inSlot||u.inside===-2?' disabled':'')+'>'+
      '<span><b>'+u.hero.name+'</b> · '+CFG.HERO.CLS[u.hero.cls].nm.toLowerCase()+(u.hero.thief?' · вор':'')+
      ' · HP '+u.hero.hp.toFixed(0)+'/'+u.hero.maxHp+(items?'<br><span style="font-size:10px;color:var(--gold)">'+items+'</span>':'')+
      (inSlot?'<br><span style="font-size:10px;color:var(--dim)">'+inSlot.name+'</span>':'')+'</span></label></div>';
  }
  el('party_heroes').innerHTML=hh||'<div class="row" style="color:var(--dim)">Героев пока нет — гильдия наймёт засидевшихся.</div>';
  el('party_form').textContent='Сформировать пати ('+PICK.size+'/3)';
  el('party_form').disabled=PICK.size!==3;
  el('party_heroes').querySelectorAll('input').forEach(cb=>{
    cb.onchange=()=>{const id=+cb.dataset.hid;
      if(cb.checked){if(PICK.size>=3){cb.checked=false;return}PICK.add(id)}else PICK.delete(id);
      renderParty()};
  });
  el('party_slots').querySelectorAll('[data-slact]').forEach(b=>{
    b.onclick=()=>{const sid=+b.dataset.sid;
      if(b.dataset.slact==='use'){S.activeSlot=sid}
      else disbandSlot(sid);
      renderParty()};
  });
}
function buildUI(){
  {const b=el('btnAutoTH');if(b)b.onclick=()=>{if(S.phase==='scout')autoPlaceTownhall()}}
  el('st_hero').onclick=()=>toggleParty();
  el('party_x').onclick=()=>toggleParty(false);
  el('party_form').onclick=()=>{
    if(PICK.size===3&&formSlot([...PICK])){PICK.clear();renderParty()}
  };
  el('sc_go').onclick=()=>{
    const c=S.stageCard;S.stageCard=null;el('stagecard').style.display='none';
    S.paused=false;
    if(c&&c.delve)delveNextFloor();else clearNextStage();
  };
  el('sc_back').onclick=()=>{
    const c=S.stageCard;S.stageCard=null;el('stagecard').style.display='none';
    S.paused=false;
    if(c&&c.delve){const b=S.buildings[S.party&&S.party.mineB];if(b)b.delve=false}
    if(S.party)goBack(S.party.gain||0);
  };
  el('ver').textContent=' · '+VERSION;
  el('ic_gold').src=ICONS.gold;el('ic_pop').src=ICONS.pop;
  const box=el('levels');box.innerHTML='';
  const addMetaRow=(id,label,value,icon)=>{
    const row=document.createElement('div');row.className='lvlrow meta';
    row.innerHTML='<span style="width:18px;text-align:center">'+(icon||'')+'</span><span class="nm">'+label+'</span><span class="amt" id="'+id+'">'+value+'</span>';
    box.appendChild(row);return row;
  };
  addMetaRow('city_day','День','1','☀');
  addMetaRow('city_pop','Жители','0/0','👥');
  for(const rc of RACES)addMetaRow('city_race_'+rc,RNAME[rc],'0','');
  addMetaRow('city_gold','Золото','0','');
  const goldRow=box.lastChild;goldRow.firstChild.innerHTML='<img src="'+ICONS.gold+'" style="width:16px;height:16px;image-rendering:pixelated">';
  const names={food:'Еда',wood:'Дерево',stone:'Камень',gems:'Самоцветы'};
  const POLM=[['spend','Т','Траты — внутреннее потребление'],['export','Э','Экспорт: нужен порт или торговая гильдия'],['import','И','Импорт: порт отправит корабль с золотом; цена ×5 к экспорту']];
  for(const r of ['food','wood','stone','gems']){
    const row=document.createElement('div');row.className='lvlrow';
    row.innerHTML='<img src="'+ICONS[r]+'"><span class="nm">'+names[r]+'</span>'+ '<span class="amt" id="lv_'+r+'">0</span>'+
      '<span class="pol" id="pol_'+r+'"></span>';
    box.appendChild(row);
    const pol=row.querySelector('.pol');
    for(const [mode,lbl,tit] of POLM){
      const b=document.createElement('button');b.className='polbtn'+(S.policy[r]===mode?' on':'');
      b.textContent=lbl;b.title=tit;
      b.onclick=()=>{
        if(mode!=='spend'&&countB('port',true)+countB('guild',true)===0){
          log('⚖ '+(mode==='export'?'Экспорт':'Импорт')+': нужен порт или торговая гильдия.');return}
        S.policy[r]=mode;
        pol.querySelectorAll('.polbtn').forEach(x=>x.classList.remove('on'));
        b.classList.add('on');
      };
      pol.appendChild(b);
    }
  }
  addMetaRow('city_ammo','Амуниция','0','');
  const ammoRow=box.lastChild;ammoRow.firstChild.innerHTML='<img src="'+ICONS.ammo+'" style="width:16px;height:16px;image-rendering:pixelated">';
  // Эти значения теперь живут в ведомости города, поэтому в topbar скрываем дубли.
  ['st_gold','st_pop','st_phase'].forEach(id=>{const node=el(id);const st=node&&node.closest?node.closest('.st'):null;if(st)st.style.display='none'});
  el('leftHead').onclick=()=>{
    const b=el('leftBody');
    const hid=b.style.display==='none';
    b.style.display=hid?'':'none';
    el('leftHead').querySelector('.car').textContent=hid?'▾':'▸';
  };
  el('btnPause').onclick=togglePause;
  el('spd1').onclick=()=>setSpeed(1);
  el('spd2').onclick=()=>setSpeed(2);
  el('spd4').onclick=()=>setSpeed(4);
  el('seed').value=S.seedStr;
  el('btnNew').onclick=()=>{
    let v=el('seed').value.trim();
    if(!v||v===S.seedStr)v=String((Math.random()*1e9)|0);
    restart(v);
  };
}
function raceCounts(){const c={human:0,dwarf:0,elf:0,troll:0};for(const u of S.settlers)c[u.race]=(c[u.race]||0)+1;return c}
function ammoCount(){let n=S.showcase?S.showcase.length:0;for(const u of S.settlers)if(u.hero&&u.hero.items)n+=u.hero.items.length;return n}
function updateUI(fps){
  {const bn=el('thbanner');if(bn)bn.style.display=(S.phase==='scout')?'block':'none'}
  el('st_gold').textContent=S.gold.toFixed(0);
  el('st_pop').textContent=S.settlers.length+'/'+housingCap();
  el('st_day').textContent=S.day;
  el('st_phase').textContent=S.isNight?'🌙':'☀';
  const cd=el('city_day');if(cd)cd.textContent=(S.isNight?'🌙 ':'☀ ')+'день '+S.day;
  const cp=el('city_pop');if(cp)cp.textContent=S.settlers.length+'/'+housingCap();
  const rc=raceCounts();for(const r of RACES){const n=el('city_race_'+r);if(n)n.textContent=rc[r]||0}
  const cg=el('city_gold');if(cg)cg.textContent=fmtRes(S.gold);
  const ca=el('city_ammo');if(ca)ca.textContent=ammoCount();
  el('st_trib').textContent='⚖ '+(S.tributeAmt||'—')+'з/'+(S.tributeDue||'—')+'д'+(S.rep<0?' · реп '+S.rep:'');
  el('st_trib').style.color=(S.rep<0)?'var(--bad)':'var(--dim)';
  el('st_alarm').style.display=S.alarm?'':'none';
  const hn=heroCount();
  el('st_hero').style.display=hn>0?'':'none';
  el('st_hero').style.cursor='pointer';
  el('st_heroN').textContent=hn+(S.party?'·⚔':'');
  el('rolename').textContent=S.role+(S.hungry?' · ГОЛОД!':'');
  for(const r of ['food','wood','stone','gems']){
    const lv=S.lvl[r]||0;
    const w=el('lv_'+r);
    if(w){w.textContent=fmtRes(S.stock[r]||0);w.style.color=CFG.LVL_COLORS[lv];}
  }
  if(S.uiDirty){
    const lb=el('logbox');
    lb.innerHTML=S.log.slice(0,8).map(e=>'<div class="e"><span class="d">д'+e.d+'</span> '+e.m+'</div>').join('');
    S.uiDirty=false;
  }
  updateInspector();
  if(S.stageCard&&el('stagecard').style.display==='none'){
    const c=S.stageCard;
    el('sc_title').textContent=c.title;
    el('sc_body').innerHTML='<div class="row">Впереди: <b>'+c.next+'</b></div>'+
      '<div class="row">Добыча при отступлении: <b>'+c.gain.toFixed(0)+' з</b></div>'+
      '<div class="row">Силы пати: <b>'+c.hp+'%</b></div>';
    el('stagecard').style.display='block';
  }
  if(S.gameOver&&!S.goShown){
    S.goShown=true;
    const g=S.gameOver;
    el('go_body').innerHTML='<div class="row">'+g.reason+'</div>'+
      '<div class="row">Прожито дней: <b>'+g.day+'</b></div>'+
      '<div class="row">Пик населения: <b>'+g.peak+'</b></div>'+
      '<div class="row">Роль: <b>'+g.role+'</b></div>'+
      '<div class="row">Разграблено набегами: <b>'+g.loot.toFixed(0)+' з</b> · дань уплачена <b>'+g.paid+'</b> раз</div>';
    el('gameover').style.display='block';
    el('go_new').onclick=()=>{el('gameover').style.display='none';S.goShown=false;
      restart(String((Math.random()*1e9)|0))};
  }
  updateDebug(fps);
}
function dispName(b){
  if(b&&b.type==='library'&&(b.tier||1)>=2)return 'Башня знаний';
  if(b&&b.type==='hut'&&(b.tier||1)>=2)return 'Дом переселенцев';
  return CFG.BNAME[b?b.type:'hut'];
}
function updateInspector(){
  const box=el('inspector');
  if(!S.pin){box.style.display='none';return}
  let h='';
  if(S.pin.kind==='unit'){
    const u=S.settlers.find(x=>x.id===S.pin.id);
    if(!u){S.pin=null;box.style.display='none';return}
    let st;
    if(u.act==='rest'){const b=S.buildings[u.inside];st='отдыхает: '+(b?dispName(b).toLowerCase():'')}
    else if(u.inside>=0){const b=S.buildings[u.inside];st='работает: '+(b?dispName(b).toLowerCase():'')}
    else if(u.act==='work'&&u.job)st=WORK_LABEL[u.job.kind];
    else if(u.after==='deposit')st='несёт на склад';
    else if(u.after==='scout')st='разведывает';
    else if(u.after==='wtScout')st='разведка дозора';
    else st=ACTNAME[u.act];
    const RC=CFG.RACE[u.race];
    let badge=(u.id===S.haulerId)?' · 📦 складской':'';
    if(u.hero)badge=' · 🗡 '+u.hero.name;
    h='<div class="hdr">'+RNAME[u.race]+' №'+u.id+badge+'</div>'+
      '<div class="row">статус: <b>'+st+'</b></div>'+
      '<div class="row">кошель: <b>'+u.wallet.toFixed(1)+' з</b> · простой: '+u.idleDays+'д</div>'+
      '<div class="row">выносливость <b>'+(u.stam|0)+'</b><div class="stambar"><div style="width:'+(u.stam|0)+'%;background:'+(u.stam<CFG.STAM_LOW?'#d05a4e':'#8fbf5a')+'"></div></div></div>'+
      '<div class="row">ход '+RC.move+' · работа '+RC.work+' · стройка '+RC.build+' · разведка '+RC.scout+'</div>'+
      (topSkills(u,3).length?'<div class="row">⭐ навыки: <b>'+topSkills(u,3).join(' · ')+'</b></div>':'')+
      (u.hero?('<div class="row">'+CFG.HERO.CLS[u.hero.cls].nm+(u.hero.thief?' · черта «Вор»':'')+' · HP <b>'+u.hero.hp.toFixed(0)+'/'+u.hero.maxHp+'</b></div>'):'');
  }else if(S.pin.kind==='bld'){
    const b=S.buildings[S.pin.id];
    if(!b){S.pin=null;box.style.display='none';return}
    const w=(b.workerId!=null)?S.settlers.find(x=>x.id===b.workerId):null;
    const bt=bufTotal(b);
    let bufs='';
    for(const r of ['food','wood','stone','gems'])if(b.buf[r]>0)bufs+=' '+r+':'+b.buf[r];
    let stLine;
    if(b.built)stLine=b.abandoned?'🕸 заброшено':(!connected(b)?'⛓ нет дороги до ратуши':(b.starve?'⚠ угодья истощены':'действует'));
    else{
      const miss=missingRes(b);
      if(miss){stLine='фундамент: '+Object.keys(b.need).map(r=>r+' '+((b.got[r]||0))+'/'+b.need[r]).join(', ')}
      else stLine='стройка: осталось '+b.work+' смен';
    }
    let extra='';
    if(b.built&&b.type==='mine'&&!b.ruined){
      const dm=b.delveMax||0;
      if(!b.abandoned){
        extra+='<div class="row">⛏ руда: <b>'+Math.max(0,b.data.oreLeft||0)+'</b>'+
          ((b.tier||1)<CFG.MINE.gemTier?' · самоцветы с тира 2':' · жила доступна')+'</div>';
      }else{
        extra+='<div class="row">⛏ штольни заброшены · глубины: '+dm+'/'+b.tier+
          (b.delve?' · <b>пати внутри</b>':'')+'</div>'+
          '<div class="row"><button class="qbtn" data-delve="'+S.pin.id+'"'+((activeSlot()&&!S.party&&dm<b.tier)?'':' disabled')+'>Спуск в шахту</button></div>';
      }
    }
    if(b.built&&b.type==='port'){
      const ht=holdTotal(b);
      const bar='▰'.repeat(Math.round(ht/shipHold()*8))+'▱'.repeat(8-Math.round(ht/shipHold()*8));
      const sailP=b.sailing&&b.sailTotal?Math.round((1-(b.sailLeft||0)/b.sailTotal)*100):0;
      let shipLine;
      if(b.ship)shipLine='⛵ корабль: <b>'+(b.sailing?'в море':'у причала')+'</b>';
      else if((b.shipWork||0)>0)shipLine='🔨 верфь: осталось <b>'+b.shipWork+'</b> смен';
      else shipLine='⚓ корабля нет — верфь ждёт '+CFG.SHIP.cost.wood+' дерева';
      extra+='<div class="row">'+shipLine+'</div>'+
        '<div class="row">трюм: '+bar+' '+ht+'/'+shipHold()+'</div>'+
        (b.importPlan?'<div class="row">📦 заказ: '+b.importPlan.qty+' '+b.importPlan.res+' · золото '+Math.floor(b.holdGold||0)+'/'+b.importPlan.cost+'</div>':'')+
        (b.sailing?'<div class="row">⛵ рейс: <b>'+sailP+'%</b><div class="stambar"><div style="width:'+sailP+'%"></div></div></div>':'')+
        '<div class="row" style="font-size:10px;color:var(--dim)">трюм наполняется и без корабля; море торгует только рейсами</div>';
    }
    if(b.built&&b.type==='tavern'){
      const ale=b.ale||0;
      extra+='<div class="row">🍺 эль: <b>'+ale+'/'+CFG.ALE.cap+'</b> · зерно: '+Math.floor(b.store.food||0)+'</div>'+
        '<div class="row" style="font-size:10px;color:var(--dim)">эль варится из зерна, которое разносчик носит с действующих ферм</div>';
    }
    if(b.built&&b.type==='crafters'){
      extra+='<div class="row">витрина: '+(S.showcase.map(i=>i.name.split(' ')[0]+' '+i.price+'з').join(', ')||'пусто')+'</div>'+
        '<div class="row" style="font-size:10px;color:var(--dim)">продано предметов: '+S.itemsSold+'</div>';
    }
    if(b.built&&b.type==='library'){
      const nxt=researchNext();
      if(nxt){
        const need2=CFG.RESEARCH.tier2[nxt]&&(b.tier||1)<2;
        extra+='<div class="row">📜 исследование: <b>'+CFG.BNAME[nxt].toLowerCase()+'</b> '+S.research.pts.toFixed(1)+'/'+CFG.RESEARCH.cost[nxt]+
          (need2?' · <span style="color:var(--bad)">нужна Башня знаний</span>':'')+'</div>';
      }else extra+='<div class="row">📜 все открытия совершены</div>';
    }
    if(b.built&&b.type==='advguild'){
      extra+='<div class="row"><button class="qbtn" id="openPartyBtn">Отряды (🗡)</button></div>';
    }
    h='<div class="hdr">'+dispName(b)+' · тир '+(b.tier||1)+'</div>'+
      '<div class="row">'+stLine+'</div>'+extra+
      '<div class="row">работник: <b>'+(w?RNAME[w.race]+' №'+w.id:'—')+'</b></div>'+
      '<div class="row">буфер: <b>'+bt+'/'+capOf(b)+'</b>'+(bufs?' ·'+bufs:'')+'</div>';
    const sd=CFG.STORE[b.type];
    if(b.built&&sd){
      let st2='';for(const r in sd)st2+=' '+r+' '+fmtRes((b.store&&b.store[r])||0)+'/'+sd[r];
      h+='<div class="row">припасы:<b>'+st2+'</b> <span style="font-size:10px;color:var(--dim)">пополняет складской</span></div>';
    }
  }else{
    const i=idx(S.pin.x,S.pin.y);
    const t=S.terr[i];
    let tn=TNAME[t];
    if(t===T.WATER)tn=(S.waterKind[i]===2)?'Море':'Озеро';
    h='<div class="hdr">'+tn+' · '+S.pin.x+','+S.pin.y+'</div>';
    if(t===T.FOREST&&S.terrHp[i]>0)h+='<div class="row">древесины: '+S.terrHp[i]+'</div>';
    if(S.feat[i])h+='<div class="row">'+FNAME[S.feat[i]]+'</div>';
    const li=S.lairAt[i];
    if(li>=0){const L=S.lairs[li];
      if(!L.dead){
        const sInfo=L.known?('сила '+L.str+' · сундуки '+L.hoard.toFixed(0)+' з'):('сила ~'+L.str);
        h+='<div class="row" style="color:var(--bad)">☠ '+L.name+' · тир '+L.tier+'</div>'+
           '<div class="row">'+sInfo+' · '+aggroWord(L)+'</div>';
        if(countB('advguild',true)>0){
          const rd=freeHeroes().length;
          let dis=false,why='провиант: '+CFG.HERO.provisions+' еды · героев готово: '+rd+'/3';
          if(S.party){dis=true;why='⚔ партия уже в походе — дождись возвращения'}
          else if(!activeSlot()){dis=true;why='нет готовой пати — 🗡 в топбаре, выбери троих'}
          else if(S.stock.food<CFG.HERO.provisions){dis=true;why='не хватает провианта: нужно '+CFG.HERO.provisions+' еды'}
          const asl=activeSlot();
          const st0=lairStages(L);
          if(L.stage>0)h+='<div class="row">⚔ этапы: пройдено '+L.stage+'/'+st0.length+'</div>';
          if(asl)h+='<div class="row">пойдёт: <b>'+asl.name+'</b></div>';
          h+='<div class="row">💰 награда: '+(L.known?('сундуки '+L.hoard.toFixed(0)+' з'):('сундуки ~'+(Math.round(L.hoard/10)*10)+' з — разведай для точности'))+' (казне 30%, героям 70%)</div>'+
             '<div class="row" style="margin-top:5px">'+
             '<button class="qbtn" data-q="scout" data-li="'+li+'"'+(dis?' disabled':'')+'>Разведка</button> '+
             '<button class="qbtn" data-q="attack" data-li="'+li+'"'+(dis?' disabled':'')+'>Штурм</button> '+
             '<button class="qbtn" data-q="rob" data-li="'+li+'"'+(dis?' disabled':'')+'>Обнос</button></div>'+
             '<div class="row">'+why+'</div>';
        }else h+='<div class="row">для походов постройте гильдию авантюристов (население 8+)</div>';
      }else h+='<div class="row">Руины павшего логова: '+L.name+'</div>';
    }
    if(S.fear[i]&&li<0)h+='<div class="row" style="color:var(--bad)">зона страха</div>';
    if(S.road[i])h+='<div class="row">дорога</div>';
  }
  if(box._h===h){box.style.display='block';return}
  box._h=h;
  box.innerHTML=h;box.style.display='block';
  box.querySelectorAll('.qbtn[data-q]').forEach(btn=>{
    btn.onclick=()=>{sendParty(+btn.dataset.li,btn.dataset.q);S.uiDirty=true;updateInspector()};
  });
  box.querySelectorAll('.qbtn[data-delve]').forEach(btn=>{
    btn.onclick=()=>{sendDelve(+btn.dataset.delve);S.uiDirty=true;updateInspector()};
  });
  const opb=box.querySelector('#openPartyBtn');
  if(opb)opb.onclick=()=>toggleParty(true);
}

