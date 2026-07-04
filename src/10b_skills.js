/* ---------- НАВЫКИ ЖИТЕЛЕЙ (п.9) ----------
   Работа прокачивает навыки. Навыки почти не ускоряют добычу — их главная
   ценность раскрывается в бою, когда житель становится героем. */
const SKILLS={
  axe:  {nm:'Секира'},      // лесоповал/расчистка -> атака бойцов ближнего боя
  grit: {nm:'Крепь'},       // шахта -> живучесть (+HP героя за уровень)
  craft:{nm:'Инженерия'},   // стройка/ремонт/мощение -> урон по укреплениям, +скорость стройки
  haul: {nm:'Жилы'},        // переноска/снабжение -> стойкость к засадам, +HP
  herb: {nm:'Знахарство'},  // ферма/рыбалка -> лечение отряда после боя
  vigil:{nm:'Дозор'},       // вахта/разведка -> упреждение засад
  lore: {nm:'Тайноведение'} // библиотека/руины -> урон мага, +скорость исследований
};
const SKILL_LVLS=[30,90,200,360,600]; // пороги xp уровней 1..5 (~12 xp/день работы)
function skillLvl(u,k){return (u.skills&&u.skills[k]&&u.skills[k].lvl)||0}
function addSkillXp(u,k,xp){
  if(!u||!SKILLS[k]||u.id===undefined)return;
  u.skills=u.skills||{};
  const s=u.skills[k]=u.skills[k]||{xp:0,lvl:0};
  if(s.lvl>=SKILL_LVLS.length)return;
  s.xp+=xp;
  while(s.lvl<SKILL_LVLS.length&&s.xp>=SKILL_LVLS[s.lvl]){
    s.lvl++;
    if(u.hero){ // навыки живучести сразу отражаются на герое
      if(k==='grit'){u.hero.maxHp+=3;u.hero.hp+=3}
      if(k==='haul'){u.hero.maxHp+=1;u.hero.hp+=1}
    }
    if(s.lvl>=2)log('⭐ '+RNAME[u.race]+' №'+u.id+' оттачивает навык «'+SKILLS[k].nm+'»: уровень '+s.lvl+'.');
  }
}
function skillAtkBonus(u,stageIdx){ // прибавка к атаке героя в бою
  if(!u.hero)return 0;
  const cls=u.hero.cls;
  let a=0;
  if(cls==='tank'||cls==='bruiser')a+=skillLvl(u,'axe')*0.8;
  if(cls==='mage')a+=skillLvl(u,'lore')*0.9;
  if(cls==='support')a+=skillLvl(u,'herb')*0.4;
  if(stageIdx===0)a*=(1+0.10*skillLvl(u,'craft')); // первый этап логова — укрепления
  return a;
}
function partyVigil(hs){let v=0;for(const u of hs)v=Math.max(v,skillLvl(u,'vigil'));return v}
function partyHerbHeal(hs){ // знахарь подлатывает выживших после боя
  let herb=0;for(const u of hs)herb+=skillLvl(u,'herb');
  if(herb<=0)return 0;
  let healed=0;
  for(const u of hs)if(u.hero&&u.hero.hp>0&&u.hero.hp<u.hero.maxHp){
    const h=Math.min(u.hero.maxHp-u.hero.hp,herb*1.5);
    u.hero.hp+=h;healed+=h;
  }
  return healed;
}
function topSkills(u,n){
  if(!u.skills)return [];
  return Object.entries(u.skills).filter(([k,s])=>s.lvl>0)
    .sort((a,b)=>b[1].lvl-a[1].lvl).slice(0,n||3)
    .map(([k,s])=>SKILLS[k].nm+' '+s.lvl);
}
