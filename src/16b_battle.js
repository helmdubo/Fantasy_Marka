/* ---------- БОЕВОЕ ЯДРО (п.11) ----------
   Бой отрядов в стиле Disciples: у каждой стороны передний и задний ряд.
   Ближний боец бьёт передний ряд врага (задний — только когда передний пал),
   заклинатели бьют любой ряд, саппорт лечит. Раунды периодические.
   Одно ядро на всех: headless/autoQuest прокручивает бой мгновенно,
   в браузере экран боя (22b_battle_ui) анимирует те же раунды. */
const ENEMY_DEFS={
  goblin:    {nm:'Гоблин',          row:'front', hpW:1.0, atkW:1.0, grid:'G_GOBLIN',    map:'GOBLIN_MAP'},
  gobshaman: {nm:'Гоблин-шаман',    row:'back',  hpW:0.7, atkW:1.3, grid:'G_GOBSHAMAN', map:'GOBSHAMAN_MAP', caster:true},
  bandit:    {nm:'Разбойник',       row:'front', hpW:1.1, atkW:1.1, grid:'G_RAIDER',    map:'RAIDER_MAP'},
  skeleton:  {nm:'Скелет',          row:'front', hpW:0.9, atkW:0.9, grid:'G_SKELETON',  map:'SKELETON_MAP'},
  necromancer:{nm:'Некромант',      row:'back',  hpW:0.8, atkW:1.6, grid:'G_NECRO_U',   map:'NECRO_U_MAP', caster:true},
  beast:     {nm:'Лютый зверь',     row:'front', hpW:1.2, atkW:1.2, grid:'G_BEAST',     map:'BEAST_MAP'},
  fireatr:   {nm:'Огненный атронах',row:'back',  hpW:1.0, atkW:1.8, grid:'G_FIREATR',   map:'FIREATR_MAP', caster:true},
  magmaatr:  {nm:'Магмовый атронах',row:'front', hpW:1.6, atkW:1.2, grid:'G_MAGMAATR',  map:'MAGMAATR_MAP'},
};
// составы врагов: по типу логова и этапу (или этажу шахты для delve)
const BATTLE_COMPS={
  tower:[['bandit','bandit'],['bandit','bandit','gobshaman'],['bandit','necromancer','bandit']],
  camp:[['bandit','goblin'],['bandit','bandit','goblin']],
  den:[['beast','beast'],['beast','beast','beast']],
  cliff:[['goblin','goblin','goblin'],['goblin','gobshaman','goblin']],
  graves:[['skeleton','skeleton'],['skeleton','skeleton','necromancer'],['necromancer','skeleton','skeleton']],
  necro:[['skeleton','skeleton','necromancer'],['skeleton','necromancer','necromancer'],['necromancer','skeleton','skeleton','skeleton']],
  delve:[['goblin','goblin','goblin'],['magmaatr','goblin','goblin'],['fireatr','magmaatr']],
  ruins:[['skeleton','skeleton'],['skeleton','skeleton','necromancer']], // древние руины (v2.2)
  bld:[['bandit','goblin','goblin']], // мародёры в развалинах зданий (v2.2)
};
function battleComp(lairId,stageIdx){
  const arr=BATTLE_COMPS[lairId]||BATTLE_COMPS.camp;
  return arr[Math.min(stageIdx||0,arr.length-1)];
}
function makeBattle(opts){
  // opts:{ambushed,mul,stageIdx,enemy:{id,str,name}}
  const P=S.party,L=opts.enemy;
  const hs=partyHeroes();
  const mul=opts.mul||1;
  const stageIdx=opts.stageIdx||0;
  // кулдауны (v2.2): интерактивный бой в браузере — герой бьёт по клику,
  // когда заряд полон; враги бьют сами по своему кулдауну (заряд виден игроку)
  const CD_CLS={tank:3.0,bruiser:2.3,mage:3.4,support:2.9};
  const party=hs.map(u=>({side:'party',name:u.hero.name,cls:u.hero.cls,
    row:(u.hero.cls==='tank'||u.hero.cls==='bruiser')?'front':'back',
    hp:u.hero.hp,maxHp:u.hero.maxHp,
    atk:(u.hero.atk+itemAtk(u)+skillAtkBonus(u,stageIdx))*(u.hero.cls==='mage'?1.3:1),
    cd:0,cdMax:CD_CLS[u.hero.cls]||2.8,
    caster:u.hero.cls==='mage',healer:u.hero.cls==='support',uref:u}));
  const comp=battleComp(L.id,stageIdx);
  const ehp=L.str*6*mul, eatk=L.str*0.95*Math.sqrt(mul);
  let hpW=0,atkW=0;
  for(const k of comp){hpW+=ENEMY_DEFS[k].hpW;atkW+=ENEMY_DEFS[k].atkW}
  const enemies=comp.map(k=>{const d=ENEMY_DEFS[k];
    const hp=Math.max(3,Math.round(ehp*d.hpW/hpW));
    return {side:'enemy',name:d.nm,key:k,row:d.row,hp,maxHp:hp,
      atk:eatk*d.atkW/atkW,cd:0,cdMax:(d.caster?4.0:3.1)+(S.rng()*0.6-0.3),
      caster:!!d.caster,def:d};
  });
  return {party,enemies,round:0,over:false,win:false,retreat:false,
    ambushed:!!opts.ambushed,thief:hs.some(u=>u.hero.thief),
    vigil:partyVigil(hs),lairName:L.name,stageIdx,events:[],fleeReq:false};
}
function btAlive(arr){return arr.filter(x=>x.hp>0)}
function btPickTarget(att,foes){
  const alive=btAlive(foes);
  if(!alive.length)return null;
  if(att.caster){ // заклинатель бьёт слабейшего в любом ряду
    return alive.slice().sort((a,b)=>a.hp-b.hp)[0];
  }
  const front=alive.filter(x=>x.row==='front');
  const pool=front.length?front:alive; // ближний бой: сначала передний ряд
  return pool[(S.rng()*pool.length)|0];
}
function btStrike(bt,att,foes,mulDmg){
  if(att.healer){ // саппорт: лечит самого раненого, если есть кого
    const allies=btAlive(att.side==='party'?bt.party:bt.enemies)
      .filter(x=>x.hp<x.maxHp&&x!==att).sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp));
    if(allies.length){
      const t=allies[0],h=att.atk*1.2;
      t.hp=Math.min(t.maxHp,t.hp+h);
      bt.events.push({t:'heal',a:att.name,b:t.name,v:h});
      return;
    }
  }
  const t=btPickTarget(att,foes);
  if(!t)return;
  const dmg=att.atk*(mulDmg||1);
  t.hp-=dmg;
  bt.events.push({t:'hit',a:att.name,b:t.name,v:dmg,kill:t.hp<=0});
}
function stepBattleRound(bt){
  if(bt.over)return;
  bt.round++;bt.events.length=0;
  if(bt.fleeReq){bt.over=true;bt.retreat=true;bt.win=false;
    bt.events.push({t:'flee'});return}
  // засада: враги бьют первыми, «Дозор» отряда гасит внезапность
  if(bt.round===1&&bt.ambushed){
    const m=1.5*Math.max(0.4,1-0.12*bt.vigil);
    for(const e of btAlive(bt.enemies))btStrike(bt,e,bt.party,m);
    if(bt.vigil>0)bt.events.push({t:'note',m:'«Дозор» упреждает засаду'});
  }
  // ход отряда (вор даёт темп в первом раунде)
  const tempo=(bt.round===1&&bt.thief)?1.5:1;
  for(const h of btAlive(bt.party))btStrike(bt,h,bt.enemies,tempo);
  if(!btAlive(bt.enemies).length){bt.over=true;bt.win=true;return}
  // ход врага
  for(const e of btAlive(bt.enemies))btStrike(bt,e,bt.party);
  const alive=btAlive(bt.party);
  const hpFrac=alive.reduce((a,u)=>a+u.hp,0)/bt.party.reduce((a,u)=>a+u.maxHp,0);
  if(!alive.length||hpFrac<0.3||bt.round>=20){bt.over=true;bt.retreat=true}
}
function finishBattle(bt){
  // перенести исход на героев: HP, лечение знахаря, гибель
  for(const c of bt.party)if(c.uref&&c.uref.hero)c.uref.hero.hp=Math.max(0,c.hp);
  const hs=partyHeroes();
  if(bt.win){
    const healed=partyHerbHeal(hs);
    if(healed>=3)log('🌿 Знахарь отряда перевязывает раны (+'+healed.toFixed(0)+' HP).');
  }
  const dead=hs.filter(u=>u.hero.hp<=0);
  for(const u of dead){
    S.heroDeaths++;breakSlotByDeath(u.id);
    log('☠ '+u.hero.name+' пал в бою у «'+bt.lairName+'».');
    S.party.heroes=S.party.heroes.filter(id=>id!==u.id);
    S.settlers.splice(S.settlers.indexOf(u),1);
  }
  return {win:bt.win,rounds:bt.round,retreat:bt.retreat};
}
function beginBattle(opts,cont){
  const bt=makeBattle(opts);
  const P=S.party;
  const done=(res)=>{if(S.party)S.party.inBattle=false;cont(res)};
  if(!IS_BROWSER||S.autoQuest){
    while(!bt.over)stepBattleRound(bt);
    done(finishBattle(bt));
    return;
  }
  if(P)P.inBattle=true; // partyTick не должен снова звать partyArrive
  S.paused=true;S.uiDirty=true;
  openBattleScreen(bt,()=>done(finishBattle(bt)));
}
