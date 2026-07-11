function sendParty(li,mode){
  if(S.party){log('⚔ Партия уже в походе.');return false}
  const L=S.lairs[li];
  if(!L||L.dead)return false;
  const sl=activeSlot();
  if(!sl){log('🛡 Нет готовой пати — сформируй её в окне отрядов (🗡 в топбаре).');return false}
  const hs=sl.heroes.map(id=>S.settlers.find(u=>u.id===id));
  if(!S.buildings.some(b=>b.built&&b.type==='advguild'&&connected(b))){
    log('⛓ Гильдия авантюристов не подключена к тракту.');return false}
  if(mode==='rob'&&!hs.some(u=>u.hero.thief)){
    log('🥷 В пати «'+sl.name+'» нет черты «Вор» — обнос невозможен.');return false}
  if(S.stock.food<CFG.HERO.provisions){log('🥖 Не хватает провианта ('+CFG.HERO.provisions+' еды).');return false}
  const p=findRaidPath(L.x,L.y);
  if(!p){log('⚔ К логову нет тропы.');return false}
  const out=p.slice().reverse();
  S.stock.food-=CFG.HERO.provisions;computeLevels();
  const trio=hs;
  sl.status='away';
  if(mode==='attack'&&L.stage>0&&!L.rehard){L.rehard=true;L.str=Math.ceil(L.str*1.1);
    log('⚠ Враг закрепился с прошлого визита — этапы стали крепче.')}
  for(const u of trio){u.inside=-2;releaseJob(u);u.carry=null;u.after=null;u.path=null;u.act='idle'}
  S.party={heroes:trio.map(u=>u.id),slot:sl.id,target:li,mode,phase:'out',gain:0,
    x:S.th.x+0.5,y:S.th.y+0.5,px:S.th.x+0.5,py:S.th.y+0.5,path:out,pathI:0};
  const MN={scout:'разведку',attack:'штурм',rob:'обнос'};
  log('⚔ Партия ('+trio.map(u=>u.hero.name).join(', ')+') выходит на '+MN[mode]+' «'+L.name+'».');
  S.uiDirty=true;
  return true;
}
function partyHeroes(){return S.party.heroes.map(id=>S.settlers.find(u=>u.id===id)).filter(Boolean)}
function sendDelve(bi){
  if(S.party){log('⚔ Партия уже в походе.');return false}
  const b=S.buildings[bi];
  if(!b||!b.built)return false;
  const mine=b.type==='mine'&&!b.ruined; // шахтный спуск по этажам
  if(mine){
    // п.6: спуск только в ЗАБРОШЕННУЮ шахту — в работающей штольни заняты артелью
    if(!b.abandoned){log('⛏ Шахта работает — герои не полезут под кирки артели. Ждите, пока она опустеет.');return false}
    if((b.delveMax||0)>=b.tier){log('⛏ Шахта выбрана до дна (тир '+b.tier+'). Глубже этажей нет.');return false}
  }else{
    // v2.2: ЛЮБОЕ заброшенное/сгоревшее здание — данжен на одну зачистку
    if(!(b.ruined||b.abandoned)){log('🏚 Здание обитаемо — зачищать нечего.');return false}
    if(b.dgnDone){log('🏚 Эти развалины уже зачищены героями.');return false}
    if(S.lairAt[idx(b.x,b.y)]>=0){log('☠ В развалинах уже засела нечисть — штурмуй логово.');return false}
  }
  const sl=activeSlot();
  if(!sl){log('🛡 Нет готовой пати — сформируй её в окне отрядов (🗡).');return false}
  const prov=mine?CFG.HERO.provisions+b.tier*2:CFG.HERO.provisions;
  if(S.stock.food<prov){log('🥖 Для вылазки нужно '+prov+' еды.');return false}
  const p=withHeroPass(()=>findPath(S,S.th.x,S.th.y,b.x,b.y,true));
  if(!p){log('⛏ К развалинам нет тропы.');return false}
  S.stock.food-=prov;computeLevels();
  const hs=sl.heroes.map(id=>S.settlers.find(u=>u.id===id));
  for(const u of hs){u.inside=-2;releaseJob(u);u.carry=null;u.after=null;u.path=null;u.act='idle'}
  sl.status='away';
  if(mine)b.delve=true;
  S.party={heroes:hs.map(u=>u.id),slot:sl.id,mineB:bi,mode:mine?'delve':'ruinsweep',phase:'out',gain:0,
    floor:b.delveMax||0,x:S.th.x+0.5,y:S.th.y+0.5,px:S.th.x+0.5,py:S.th.y+0.5,path:p,pathI:0};
  log(mine
    ?'⛏ '+sl.name+' спускается в шахту (этаж «'+CFG.DELVE[b.delveMax||0]+'», провиант '+prov+').'
    :'🏚 '+sl.name+' идёт зачищать развалины ('+CFG.BNAME[b.type].toLowerCase()+').');
  S.uiDirty=true;return true;
}
/* v2.2: зачистка развалин здания — один бой с мародёрами, разовая добыча */
function ruinSweep(){
  const P=S.party,b=S.buildings[P.mineB];
  if(!b){goBack(0);return}
  const fake={str:3+(b.tier||1)*2,id:'bld',name:'Развалины: '+CFG.BNAME[b.type]};
  beginBattle({ambushed:false,mul:1,enemy:fake},res=>{
    if(!partyHeroes().length){log('☠ Из похода не вернулся никто.');S.party=null;endSlotMission(true);S.uiDirty=true;return}
    if(res.win){
      b.dgnDone=true;
      const loot=6+(b.tier||1)*5;
      log('🏚 Развалины зачищены: в тайниках найдено '+loot+' з.');
      goBack(loot);
    }else{
      log('🏳 Партия отступает от развалин.');
      goBack(0);
    }
  });
}
function partyTick(dt){
  const P=S.party;if(!P||P.inBattle)return; // бой идёт на экране — не дёргать partyArrive
  P.px=P.x;P.py=P.y;
  const wp=P.path[P.pathI];
  if(!wp){partyArrive();return}
  const gx=wp.x+0.5,gy=wp.y+0.5;
  const dx=gx-P.x,dy=gy-P.y,d=Math.hypot(dx,dy);
  const st=CFG.HERO.speed*dt;
  if(d<=st){P.x=gx;P.y=gy;P.pathI++;if(P.pathI>=P.path.length)partyArrive()}
  else{P.x+=dx/d*st;P.y+=dy/d*st}
}
function partyArrive(){
  const P=S.party,L=S.lairs[P.target];
  if(P.phase==='back'){
    const hs=partyHeroes();
    for(const u of hs){u.inside=-1;u.x=S.th.x+0.5+(S.rng()-0.5);u.y=S.th.y+1.5;u.px=u.x;u.py=u.y;u.stam=30}
    if(P.gain>0){
      const tax=P.gain*0.3;S.gold+=tax;
      const share=P.gain*0.7/Math.max(1,hs.length);
      for(const u of hs)u.wallet+=share;
      log('🏛 Казна берёт налог '+tax.toFixed(0)+' з с добычи; герои делят остальное и идут в таверну.');
    }
    endSlotMission(false);
    for(const u of hs)buyGear(u);
    S.party=null;S.uiDirty=true;
    return;
  }
  // reached the lair
  if(P.mode==='delve'){delveNextFloor();return}
  if(P.mode==='ruinsweep'){ruinSweep();return}
  if(L.dead){goBack(0);return}
  if(P.mode==='scout'){
    L.known=true;
    let noticed=S.rng()<0.45;
    for(const u of partyHeroes())if(u.race==='elf')noticed=noticed&&(S.rng()<0.6);
    if(noticed){L.aggro=Math.min(99,L.aggro+15);
      log('👁 Разведчики замечены — «'+L.name+'» насторожилось.')}
    log('🔎 Интел: «'+L.name+'» — сила '+L.str+' мечей, сундуки: '+L.hoard.toFixed(0)+' з, настрой: '+aggroWord(L)+'.');
    goBack(0);
    return;
  }
  if(P.mode==='rob'){
    const hs=partyHeroes();
    const thieves=hs.filter(u=>u.hero.thief).length;
    if(S.rng()<0.5+0.15*thieves){
      const steal=L.hoard*0.5;L.hoard-=steal;
      L.aggro=Math.min(99,L.aggro+40);
      log('🥷 Обнос удался! Унесено '+steal.toFixed(0)+' з. «'+L.name+'» в бешенстве.');
      goBack(steal);
    }else{
      log('🥷 Обнос сорвался — стража подняла тревогу! Бой с внезапностью врага.');
      beginBattle({ambushed:true,mul:1,enemy:L},res=>{
        if(!partyHeroes().length){log('☠ Из похода не вернулся никто.');S.party=null;endSlotMission(true);S.uiDirty=true;return}
        if(res.win){const loot=L.hoard*0.4;L.hoard-=loot;
          log('⚔ Стража перебита в свалке — урвали '+loot.toFixed(0)+' з.');goBack(loot)}
        else{L.aggro=Math.min(99,L.aggro+30);goBack(0)}
      });
    }
    return;
  }
  clearNextStage();
}
function delveNextFloor(){
  const P=S.party;if(!P)return;
  const b=S.buildings[P.mineB];
  const fl=P.floor||0;
  const hs=partyHeroes();
  // подземный страж: сила растёт с глубиной и тиром
  const fake={str:5+fl*4+(b?b.tier:1)*2,id:'delve',name:CFG.DELVE[fl],hoard:0};
  beginBattle({ambushed:false,mul:1,stageIdx:fl,enemy:fake},res=>{
  if(!partyHeroes().length){log('☠ Спуск поглотил всех.');if(b)b.delve=false;S.party=null;endSlotMission(true);S.uiDirty=true;return}
  if(res.win){
    P.floor=fl+1;
    let gems=0;
    if(b&&P.floor>(b.delveMax||0)){
      gems=2+fl*2;S.stock.gems+=gems;b.delveMax=P.floor;
      if(fl>=2){const it=CFG.ITEMS[(S.rng()*CFG.ITEMS.length)|0];
        const lucky=hs[(S.rng()*hs.length)|0];
        lucky.hero.items=lucky.hero.items||[];
        if(lucky.hero.items.length<2){lucky.hero.items.push(it);
          lucky.hero.maxHp+=it.hp||0;lucky.hero.hp+=it.hp||0;
          log('✨ Артефакт из Бездны: «'+it.name+'» достаётся '+lucky.hero.name+'!')}}
      computeLevels();
    }
    log('⛏ Этаж «'+CFG.DELVE[fl]+'» зачищен'+(gems?': +'+gems+' самоцветов':' (пусто — уже выбран)')+'.');
    if(P.floor>=(b?b.tier:1)){if(b)b.delve=false;goBack(0)}
    else if(S.autoQuest){delveNextFloor()}
    else{
      const hpP=Math.round(100*hs.reduce((a,u)=>a+u.hero.hp,0)/hs.reduce((a,u)=>a+u.hero.maxHp,0));
      S.stageCard={title:'Этаж «'+CFG.DELVE[fl]+'» зачищен',next:CFG.DELVE[P.floor],gain:P.gain||0,hp:hpP,delve:true};
      S.paused=true;S.uiDirty=true;
    }
  }else{
    log('🏳 Партия бежит из шахты с этажа «'+CFG.DELVE[fl]+'».');
    if(b)b.delve=false;goBack(P.gain||0);
  }
  });
}
function aggroWord(L){return L.aggro<30?'дремлет':(L.aggro<60?'ворчит':(L.aggro<90?'злится':'в ярости'))}
function lairStages(L){return CFG.STAGES[L.id]||['Логово','Сердце']}
function itemAtk(u){return (u.hero.items||[]).reduce((a,it)=>a+(it.atk||0),0)}
function clearNextStage(){
  const P=S.party;if(!P)return;
  const L=S.lairs[P.target];
  const st=lairStages(L);
  const i=L.stage||0;
  const mulArr=[0.55,0.85,1.3];
  beginBattle({ambushed:false,mul:mulArr[Math.min(i,2)]*(st.length===2?1.15:1),stageIdx:i,enemy:L},res=>{
  if(!partyHeroes().length){log('☠ Из похода не вернулся никто.');S.party=null;endSlotMission(true);S.uiDirty=true;return}
  if(res.win){
    L.stage=i+1;
    const frac=(L.stage>=st.length)?1:(i===0?0.2:0.3);
    const part=L.hoard*frac;L.hoard-=part;P.gain=(P.gain||0)+part;
    log('⚔ Этап «'+st[i]+'» пройден за '+res.rounds+' раундов! Добыча этапа: '+part.toFixed(0)+' з.');
    if(L.stage>=st.length){
      L.dead=true;S.lairsDown++;
      if(L.squatB!==undefined){const sb=S.buildings[L.squatB];
        if(sb){sb.abandoned=false;sb.starveD=0;sb.ruined=true;S.bldDirty=true;
          log('🔨 Притон выбит — здание можно отстроить заново.')}}
      S.lairAt[idx(L.x,L.y)]=-1;
      computeFear();rebuildPass();S.featDirty=true;
      log('🏆 «'+L.name+'» пало полностью!');
      goBack(P.gain);
    }else if(S.autoQuest){clearNextStage()}
    else{
      const hs=partyHeroes();
      const hpP=Math.round(100*hs.reduce((a,u)=>a+u.hero.hp,0)/hs.reduce((a,u)=>a+u.hero.maxHp,0));
      S.stageCard={title:'Этап «'+st[i]+'» пройден',next:st[L.stage],gain:P.gain,hp:hpP};
      S.paused=true;S.uiDirty=true;
    }
  }else{
    L.aggro=Math.min(99,L.aggro+30);
    log('🏳 Партия отступает от «'+L.name+'» с этапа «'+st[i]+'»'+(res.retreat?' — тяжёлые раны':'')+'.');
    goBack(P.gain||0);
  }
  });
}
function endSlotMission(broken){
  const P=S.party;
  const sl=P?S.partySlots.find(x=>x.id===P.slot):null;
  if(sl&&!broken)sl.status='ready';
}
function goBack(gain){
  const P=S.party;
  if(!P.heroes.length){ // total party kill
    log('☠ Из похода не вернулся никто.');
    S.party=null;S.uiDirty=true;return;
  }
  const p=withHeroPass(()=>findPath(S,P.x|0,P.y|0,S.th.x,S.th.y,true));
  P.phase='back';P.gain=gain;
  if(p){P.path=p;P.pathI=0}
  else{P.path=[];P.pathI=0}
  S.uiDirty=true;
}
