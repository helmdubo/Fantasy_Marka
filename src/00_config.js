//<GAME>
'use strict';
const VERSION='Дроп I · v1.2 · Flat-Top Hex (odd-q)';
const IS_BROWSER = (typeof window!=='undefined') && (typeof document!=='undefined');

/* ================= CONFIG ================= */
const CFG={
  MAP_W:128, MAP_H:128, DAY:108, NIGHT:20, STEP:0.1,
  START_POP:5, START_GOLD:32,
  START_STOCK:{food:42,wood:42,stone:10,gems:0},
  WAGE:0.15, WALK:2.4, EAT:1,
  STAM_MAX:100, STAM_WORK:1.0, STAM_CARRY:0.3, STAM_LOW:20,
  REST_NIGHT:4.5, REST_TAVERN:9.0, DRINK_PRICE:0.3,
  RACE:{
    human:{move:1.00,work:1.00,build:1.00,scout:1.00,carry:1.0,sight:3},
    dwarf:{move:0.85,work:1.25,build:1.15,scout:0.80,carry:1.1,sight:2},
    elf:  {move:1.20,work:0.90,build:0.85,scout:1.40,carry:0.8,sight:5},
    troll:{move:0.80,work:1.00,build:1.20,scout:0.70,carry:1.6,sight:2}
  },
  BUF_CAP:9, HARVEST_R:3, OPER_T:6, HAUL_TAKE:4,
  TIER_COST:{2:{wood:18,stone:22},3:{wood:28,stone:48,gems:3}},
  HUT2_COST:{wood:8,stone:6}, HOUSE2_CAP:3, // апгрейд лачуги в дом (п.10)
  ALE:{perFood:2,cap:12,brewFood:2},        // варка эля в таверне из зерна ферм (п.5)
  SAIL_DAYS:2, SEA_MARKUP:1.45,
  // п.3: корабль — отдельная стройка порта. Дорогой, но трюм существенный.
  SHIP:{cost:{wood:28},work:5,hold:24,importQty:{food:16,wood:16,stone:12,gems:4}},
  // п.6: шахта конечна; самоцветы — только тир 2+; апгрейд тира вскрывает новую руду
  MINE:{oreBase:40,orePerMtn:5,orePerTier:35,gemTier:2},
  ITEMS:[
    {id:'blade',name:'Клинок самоцветной заточки',atk:2,hp:0,gems:2,price:14},
    {id:'ward',name:'Оберег горного сердца',atk:0,hp:6,gems:2,price:14},
    {id:'rod',name:'Жезл граней',atk:3,hp:0,gems:3,price:22},
    {id:'aegis',name:'Эгида глубин',atk:0,hp:10,gems:3,price:24}],
  CRAFT_EVERY:3,
  STAGES:{tower:['Двор','Залы','Вершина'],camp:['Частокол','Шатры'],
    cliff:['Тропа','Гнездо'],graves:['Ограда','Склепы','Алтарь'],
    necro:['Врата','Лаборатория','Шпиль']},
  DELVE:['Штольни','Глубины','Бездна'],
  PRICE:{food:0.25,wood:0.45,stone:0.35,gems:4}, TRADE_Q:12, MARKET_TAX:0.10,
  TRIBUTE:{every:24,base:10,perDay:0.20,perPop:0.45,warn:3},
  RAID:{aggroDay:[0,3.2,2.2,1.4],speed:2.2,lootBase:6,burnCh:0.6},
  HERO:{max:6,idleDays:2,provisions:6,speed:2.6,
    CLS:{tank:{nm:'Танк',hp:40,atk:3},bruiser:{nm:'Рубака',hp:26,atk:8},
         mage:{nm:'Маг',hp:18,atk:7},support:{nm:'Саппорт',hp:22,atk:4}},
    CLSW:{dwarf:['tank','bruiser'],elf:['mage','bruiser'],troll:['tank','tank','bruiser'],human:['tank','bruiser','mage','support']},
    THIEF:{human:0.15,dwarf:0.10,elf:0.25,troll:0.08}}, TOWER_SIGHT:2, ROAD_SPEED:1.25,
  VISION_BLD:2, INFLUENCE:12, TOWER_INFLUENCE:7, FEAR_R:3, SCOUT_R:12, // вышка: 12*0.6≈7 (−40%)
  THRIFT:{human:1.0,dwarf:1.5,elf:0.9,troll:0.6},
  LVL_NAMES:['Нет','Скудно','Хватает','Много','Избыток'],
  LVL_COLORS:['#d05a4e','#d0894e','#c9b458','#8fbf5a','#eec658'],
  FOOD_DAYS:[1,3,7,14],
  BANDS:{wood:[1,12,30,70],stone:[1,12,36,100],gems:[1,2,5,10]},
  WORK:{build:4,clear:5,ruins:6,patrol:3,pave:2,harvest:3},
  COSTS:{hut:{wood:6},farm:{wood:6},fisher:{wood:8},lumber:{wood:8},mine:{wood:8},tavern:{wood:14,stone:8,food:4},tower:{wood:8,food:4},port:{wood:20,stone:14},guild:{wood:8,stone:6},advguild:{wood:12,stone:10},crafters:{wood:14,stone:18,gems:1},library:{wood:26,stone:18}},
  GATE:{hut:{wood:1},farm:{wood:1},fisher:{wood:1},lumber:{wood:1},mine:{wood:1},tavern:{wood:2,stone:1,food:1},tower:{wood:2,food:1},port:{wood:2,stone:1},guild:{wood:1,stone:1},advguild:{wood:2,stone:1},crafters:{wood:2,stone:2,gems:1},library:{wood:2,stone:2}},
  BUILD_WORK:3, BUILD_EVERY:1,
  HOUSE:{townhall:3,hut:2,tavern:1},
  BNAME:{townhall:'Ратуша',hut:'Лачуга',farm:'Ферма',fisher:'Рыбацкий причал',lumber:'Лесопилка',mine:'Шахта',tavern:'Таверна',tower:'Дозорная вышка',port:'Порт',guild:'Торговая гильдия',advguild:'Гильдия авантюристов',crafters:'Гильдия ремесленников',library:'Библиотека'},
  RUINS_GOLD:8,
  UPKEEP:{mine:{wood:0.2}, portSail:{wood:1}, portTradeWoodPerBatch:0.25, towerDaily:{food:1,wood:0.25}, libraryDaily:{food:1}},
  // v2.1: локальные припасы зданий. Расход идёт из b.store; пополняет складской
  // разносчик, когда запас опускается ниже половины вместимости.
  STORE:{mine:{wood:3}, tower:{food:3,wood:2}, port:{wood:3}, library:{food:3}, tavern:{food:5}},
  // v2.1: открытия в библиотеке. Порядок фиксирован; tier2 — открытия, требующие Башни знаний.
  RESEARCH:{order:['tavern','port','guild','advguild','crafters'],
    cost:{tavern:6,port:10,guild:10,advguild:14,crafters:16},
    tier2:{advguild:1,crafters:1},
    libTier2:{stone:16,gems:3}},
};
const UTIL={oper:3.0,watch:2.4,build:2.6,repair:2.8,supply:2.7,pave:1.8,clear:1.8,ruins:1.6};
const T={WATER:0,GRASS:1,FOREST:2,ROCK:3,MTN:4};
const TNAME=['Вода','Луга','Лес','Скалы','Горы'];
const F={NONE:0,BERRY:1,DEADFALL:2,RUBBLE:3,VEIN:4,FISH:5,RUINS:6,WHEAT:7,STUMP:8};
const FNAME=['','Ягодник','Бурелом (завал)','Каменная осыпь','Самоцветная жила','Рыбное место','Древние руины','Пшеничное поле','Пеньки (вырубка)'];
const RACES=['human','dwarf','elf','troll'];
const RNAME={human:'Человек',dwarf:'Гном',elf:'Эльф',troll:'Тролль'};
const ACTNAME={idle:'без дела',goto:'в пути',work:'работает'};
const LAIR_DEFS=[
  {id:'tower', name:'Заброшенная башня', tier:1, ring:[12,20], terr:[T.GRASS]},
  {id:'camp',  name:'Лагерь в чащобе',   tier:1, ring:[13,22], terr:[T.FOREST]},
  {id:'cliff', name:'Скалистый утёс',    tier:2, ring:[20,30], terr:[T.ROCK,T.GRASS]},
  {id:'graves',name:'Заброшенное кладбище',tier:2, ring:[20,30], terr:[T.GRASS]},
  {id:'necro', name:'Башня некроманта',  tier:3, ring:[32,90], terr:[T.GRASS,T.ROCK]},
];

