/* ================= SIM ================= */
const NAME_SYL={
  human:[['Бор','Мил','Рад','Свят','Яр','Люд'],['ислав','омир','огост','ополк','ан','ко']],
  dwarf:[['Дур','Тор','Бал','Гром','Кар','Наль'],['ин','грим','дур','бек','ди','мар']],
  elf:[['Аэл','Лит','Фин','Сель','Ним','Тар'],['арэль','иэн','дир','уил','ас','иэль']],
  troll:[['Гро','Хрум','Буг','Мок','Тур','Жвал'],['х','га','р','ыш','ло','ба']]
};
function heroName(race){
  const n=NAME_SYL[race];
  return n[0][(S.rng()*n[0].length)|0]+n[1][(S.rng()*n[1].length)|0];
}
function makeHero(u){
  const clsArr=CFG.HERO.CLSW[u.race];
  const cls=clsArr[(S.rng()*clsArr.length)|0];
  const C=CFG.HERO.CLS[cls];
  u.hero={name:heroName(u.race),cls,hp:C.hp,maxHp:C.hp,atk:C.atk,
    thief:S.rng()<CFG.HERO.THIEF[u.race]};
  u.idleDays=0;
  log('🗡 В гильдию вступает '+u.hero.name+' ('+RNAME[u.race].toLowerCase()+'-'+C.nm.toLowerCase()+(u.hero.thief?', черта «Вор»':'')+').');
}
function heroCount(){return S.settlers.filter(u=>u.hero).length}
function slotOf(uid){return S.partySlots.find(sl=>sl.heroes.indexOf(uid)>=0)}
function slotReady(sl){
  if(!sl||sl.status!=='ready')return false;
  for(const id of sl.heroes){
    const u=S.settlers.find(x=>x.id===id);
    if(!u||!u.hero||u.inside===-2||u.hero.hp<u.hero.maxHp*0.6)return false;
  }
  return true;
}
function readySlots(){return S.partySlots.filter(slotReady)}
function activeSlot(){
  let sl=S.partySlots.find(x=>x.id===S.activeSlot);
  if(!sl||!slotReady(sl))sl=readySlots()[0]||null;
  return sl;
}
function formSlot(ids){
  const hs=ids.map(id=>S.settlers.find(u=>u.id===id));
  if(hs.length!==3||hs.some(u=>!u||!u.hero))return false;
  if(hs.some(u=>slotOf(u.id))){log('🛡 Кто-то из выбранных уже состоит в пати.');return false}
  const sl={id:S.nextId++,name:'Отряд '+hs[0].hero.name,heroes:ids.slice(),status:'ready'};
  S.partySlots.push(sl);S.activeSlot=sl.id;
  log('🛡 Сформирована пати: '+sl.name+' ('+hs.map(u=>u.hero.name).join(', ')+').');
  S.uiDirty=true;return true;
}
function disbandSlot(sid){
  const i=S.partySlots.findIndex(x=>x.id===sid);
  if(i<0)return;
  log('🛡 Пати «'+S.partySlots[i].name+'» распущена.');
  S.partySlots.splice(i,1);S.uiDirty=true;
}
function breakSlotByDeath(uid){
  const sl=slotOf(uid);
  if(!sl)return;
  const i=S.partySlots.indexOf(sl);
  S.partySlots.splice(i,1);
  log('💔 Пати «'+sl.name+'» разбита гибелью товарища — выжившие свободны.');
}
function freeHeroes(){return S.settlers.filter(u=>u.hero&&u.inside!==-2&&u.hero.hp>=u.hero.maxHp*0.6)}
function arriveSettler(){
  const w={human:S.raceW.human,dwarf:S.raceW.dwarf,elf:S.raceW.elf,troll:S.raceW.troll};
  for(const b of S.buildings){
    if(!b.built)continue;
    if(b.type==='mine')w.dwarf+=6;
    else if(b.type==='fisher')w.elf+=4;
    else if(b.type==='lumber'){w.elf+=2;w.troll+=2}
    else if(b.type==='farm')w.human+=3;
  }
  const total=w.human+w.dwarf+w.elf+w.troll;
  let r=S.rng()*total,race='human';
  for(const rc of RACES){r-=w[rc];if(r<=0){race=rc;break}}
  let sx=S.th.x,sy=S.th.y;
  for(let ring=1;ring<7;ring++){
    let done=false;
    for(let a=0;a<24;a++){
      const x=S.th.x+(((S.rng()*2-1)*ring)|0),y=S.th.y+(((S.rng()*2-1)*ring)|0);
      if(inMap(x,y)&&S.pass[idx(x,y)]){sx=x;sy=y;done=true;break}
    }
    if(done)break;
  }
  S.settlers.push({id:S.nextId++,race,x:sx+0.5,y:sy+0.5,px:sx+0.5,py:sy+0.5,
    act:'idle',after:null,path:null,pathI:0,job:null,carry:null,workT:0,
    stam:CFG.STAM_MAX,inside:-1,drankToday:false,
    wallet:0,idleDays:0,worksToday:0,wanderT:S.rng()*2,fx:1,repathed:false});
  S.immigrants++;
  addInfoPopup('👣 +1',S.th.x,S.th.y,'pos');
  log('👣 К поселению прибился новый житель: '+RNAME[race].toLowerCase()+'.');
  S.uiDirty=true;
}
function leaveSettler(){
  const cand=S.settlers.filter(u=>!isHauler(u)&&u.inside<0);
  if(!cand.length)return;
  const u=cand[(S.rng()*cand.length)|0];
  releaseJob(u);
  S.settlers.splice(S.settlers.indexOf(u),1);
  addInfoPopup('👣 −1',S.th.x,S.th.y,'neg');
  log('💨 '+RNAME[u.race]+' №'+u.id+' покидает голодную Марку.');
  S.uiDirty=true;
}
function buyGear(u){
  if(!u||!u.hero)return;
  u.hero.items=u.hero.items||[];
  if(u.hero.items.length>=2||!S.showcase.length)return;
  const pref={mage:['rod','blade'],tank:['aegis','ward'],supp:['ward','aegis'],bruiser:['blade','rod']}[u.hero.cls]||['blade','ward'];
  for(const pid of pref){
    const si=S.showcase.findIndex(it=>it.id===pid);
    if(si<0)continue;
    const it=S.showcase[si];
    if(u.hero.items.some(x=>x.id===it.id))continue;
    if(u.wallet<it.price)continue;
    u.wallet-=it.price;S.gold+=it.price;S.itemsSold++;{const cb=S.buildings.find(b=>b.built&&b.type==='crafters')||S.buildings[u.inside]||S.buildings[0];if(cb){addResourcePopup('gold',it.price,cb.x,cb.y);addInfoPopup('🛡 '+it.price+'з',cb.x,cb.y,'info')}}
    S.showcase.splice(si,1);
    u.hero.items.push(it);
    u.hero.maxHp+=it.hp||0;u.hero.hp+=it.hp||0;
    log('🛒 '+u.hero.name+' покупает «'+it.name+'» за '+it.price+' з.');
    S.uiDirty=true;
    return;
  }
}
function craftDaily(){
  const cb=S.buildings.find(b=>b.built&&!b.ruined&&connected(b)&&b.type==='crafters');
  if(!cb)return;
  S.craftT=(S.craftT||0)+1;
  if(S.craftT<CFG.CRAFT_EVERY)return;
  if(S.showcase.length>=4)return;
  const affordable=CFG.ITEMS.filter(it=>S.stock.gems>=it.gems&&!S.showcase.some(x=>x.id===it.id));
  if(!affordable.length)return;
  const it=affordable[(S.rng()*affordable.length)|0];
  S.stock.gems-=it.gems;addResourcePopup('gems',-it.gems,cb.x,cb.y);S.craftT=0;
  S.showcase.push(Object.assign({},it));
  addInfoPopup('⚒ '+it.name.split(' ')[0],cb.x,cb.y,'info');
  log('⚒ Ремесленники создали «'+it.name+'» ('+it.gems+' самоцв.) — выставлено в витрину за '+it.price+' з.');
  computeLevels();
}
