# Индекс модулей и топ-уровневых деклараций

Генерируется автоматически (`node build.mjs`), не редактировать руками.

## src/00_config.js

CFG: все игровые константы; таблицы T/F/RACES/LAIR_DEFS

`VERSION` · `IS_BROWSER` · `CFG` · `UTIL` · `T` · `TNAME` · `F` · `FNAME` · `RACES` · `RNAME` · `ACTNAME` · `LAIR_DEFS`

## src/01_core.js

RNG (mulberry32), шум fbm, hash, clamp/lerp, скорость по террейну

`mulberry32()` · `hashStr()` · `hash2()` · `lerp()` · `clamp()` · `vnoise()` · `fbm()` · `cheb()` · `heightOf()` · `terrainSpeed()`

## src/02_hex.js

гекс-математика flat-top odd-q: координаты, соседи, LOS, A* findPath

`CW` · `zig()` · `WXC()` · `WYCC()` · `hexDirs()` · `offToCube()` · `hexDist2()` · `cubeToOff()` · `hexLine()` · `losClear()` · `colTris()` · `findPath()`

## src/02c_worldgen.js

генератор мира: остров, хребты-графы, высота, WFC-заполнение от контуров

`genWorld()` · `wgIsland()` · `wgBfsField()` · `wgLakes()` · `wgRidges()` · `wgElevation()` · `wgFill()` · `wgEntities()` · `wgValidate()`

## src/03_state_mapgen.js

глобальное состояние S; newGame, генерация мира, spawn поселенцев

`S` · `log()` · `idx()` · `inMap()` · `newGame()` · `edgeKeyCells()` · `cellNearRiver()` · `genRivers()` · `classifyWater()` · `pickStart()` · `genFeatures()` · `genLairs()` · `computeFear()` · `rebuildPass()` · `withHeroPass()` · `placeBuilding()` · `spawnSettlers()`

## src/04_econ.js

уровни запасов, canPay/payCost

`bandIdx()` · `computeLevels()` · `canPay()` · `payCost()`

## src/05_vision.js

туман войны: stampVision, recomputeVision, exploreRing, pickHex

`pickHex()` · `markVisibleCell()` · `stampVision()` · `unitSight()` · `stampCone()` · `buildingSightRadius()` · `recomputeVision()` · `exploreRing()`

## src/06_market_core.js

примитивы рынка задач: init/add/reserve/release офферов

`MARKET_RES` · `IMPORT_COST_MULT` · `FOG_SCALE` · `MARKET_LABOR_REASON` · `initMarket()` · `marketClear()` · `marketAdd()` · `marketGet()` · `marketFree()` · `marketReserveId()` · `marketReleaseRef()` · `marketReleaseRefs()` · `marketClearRefs()`

## src/07_popups.js

DOM-попапы фидбека (+ресурс/-ресурс), прогресс-бары портов

`fmtRes()` · `worldToScreen()` · `cellToWorldAnchor()` · `popupAnchor()` · `popupHtml()` · `addPopupCell()` · `addResourcePopup()` · `addInfoPopup()` · `addStock()` · `updateOnePopup()` · `updatePopups()` · `updatePortBars()` · `clearFeedbackLayer()`

## src/08_market.js

публикация офферов (труд/ресурсы/квесты) и выбор задач юнитом

`marketPolicyBoost()` · `marketResourceLevelBoost()` · `marketLaborPriority()` · `marketPublishLaborJobs()` · `marketPublishResourceOffers()` · `marketPublishQuestOffers()` · `rebuildMarketFromJobs()` · `marketSelectLaborJob()` · `marketFindResourceOffers()` · `marketSelectSupplySource()` · `marketSelectHaulTask()`

## src/09_jobs.js

job pool: rebuildJobs, pick/assign/release, harvestCycle, дороги, completeJob

`claimKey()` · `rebuildJobs()` · `bufTotal()` · `holdTotal()` · `missingRes()` · `capOf()` · `pickJob()` · `assignJob()` · `releaseJob()` · `jobValid()` · `lumberNear()` · `consumeBuildingUpkeep()` · `harvestCycle()` · `recomputeRoadConn()` · `connected()` · `roadLay()` · `completeJob()`

## src/10_hauling.js

логистика: supply/haul/export/deposit, назначение носильщиков

`startSupply()` · `supplyPick()` · `supplyDrop()` · `fieldTarget()` · `fieldHarvest()` · `fieldReturn()` · `fieldAbort()` · `deposit()` · `exportTask()` · `haulThink()` · `expPick()` · `expDrop()` · `rstPick()` · `rstDrop()` · `doPickup()` · `isHauler()` · `desiredHaulerCount()` · `assignHauler()`

## src/10b_skills.js

навыки жителей (п.9): прокачка работой, эффекты в бою героев

`SKILLS` · `SKILL_LVLS` · `skillLvl()` · `addSkillXp()` · `skillAtkBonus()` · `partyVigil()` · `partyHerbHeal()` · `topSkills()`

## src/11_settlers.js

поведение поселенца: settlerTick, разведка фронтира, отдых, arrive

`scoutAnchors()` · `findFrontier()` · `towerFrontier()` · `findRestPlace()` · `goRest()` · `enterRest()` · `exitBuilding()` · `settlerTick()` · `workMul()` · `arrive()`

## src/12_settle.js

автостроитель: siteOk, settleThink, research, стартовые площадки, апгрейды

`countB()` · `countLive()` · `countActive()` · `houseCapOf()` · `housingCap()` · `tryUpgradeHut()` · `NEAR_ROAD_TYPES` · `influenceAnchors()` · `inInfluence()` · `siteOk()` · `engineTarget()` · `researchNext()` · `typeUnlocked()` · `researchCycle()` · `tryLibraryTier2()` · `stockWorld()` · `pendingConstructionNeed()` · `stockWorldAvailable()` · `activeConstructionCount()` · `constructionCap()` · `costOf()` · `canPayWorld()` · `resScore()` · `PROD_TYPES` · `withBridgedPass()` · `tryPlace()` · `nearestRoadTarget()` · `buildRoad()` · `finishBuilding()` · `forestInInfluence()` · `anySite()` · `bestSiteScore()` · `starterCells()` · `clearStarterCell()` · `plantStarterForest()` · `ensureStarterProductionSites()` · `ensureStarterFisherSite()` · `ensureEmergencyFoodSite()` · `constructionOpen()` · `tryPlaceIfOpen()` · `ensureCoreProductionSites()` · `settleThink()` · `tryUpgrade()`

## src/13_heroes_pop.js

герои (makeHero, слоты пати), иммиграция/отток, крафт и покупка снаряжения

`NAME_SYL` · `heroName()` · `makeHero()` · `heroCount()` · `slotOf()` · `slotReady()` · `readySlots()` · `activeSlot()` · `formSlot()` · `disbandSlot()` · `breakSlotByDeath()` · `freeHeroes()` · `arriveSettler()` · `leaveSettler()` · `buyGear()` · `craftDaily()`

## src/14_port_trade.js

порт: корабли, автоимпорт; ежедневная торговля tradeDaily; сквоттеры

`shipHold()` · `portImportNeed()` · `goldLoaded()` · `sailReady()` · `returnPortShip()` · `startPortSail()` · `orderShip()` · `launchShip()` · `tradeDaily()` · `SQUATS` · `squatDaily()`

## src/15_raids.js

логовища: агро, рейды, warbandTick, грабёж

`lairsDaily()` · `launchRaid()` · `findRaidPath()` · `setAlarm()` · `warbandTick()` · `doLoot()`

## src/16_party.js

экспедиции: sendParty/sendDelve, этапы логовищ, шахтные этажи

`sendParty()` · `partyHeroes()` · `sendDelve()` · `partyTick()` · `partyArrive()` · `delveNextFloor()` · `aggroWord()` · `lairStages()` · `itemAtk()` · `clearNextStage()` · `endSlotMission()` · `goBack()`

## src/16b_battle.js

боевое ядро (п.11): ряды, цели, раунды; составы врагов

`ENEMY_DEFS` · `BATTLE_COMPS` · `battleComp()` · `makeBattle()` · `btAlive()` · `btPickTarget()` · `btStrike()` · `stepBattleRound()` · `finishBattle()` · `beginBattle()`

## src/17_daycycle.js

дань империи, смена дня onNewDay, роль поселения, главный tick(dt)

`brewDaily()` · `tributeDaily()` · `endSession()` · `computeRole()` · `onNewDay()` · `tick()` · `wakeAll()`

## src/18_sprites.js

палитра PAL и пиксельные гриды спрайтов (расы, здания)

`PAL` · `OUTL` · `G_HUMAN` · `G_DWARF` · `G_ELF` · `G_TROLL` · `G_HUT` · `G_GOBLIN` · `GOBLIN_MAP` · `G_GOBSHAMAN` · `GOBSHAMAN_MAP` · `G_SKELETON` · `SKELETON_MAP` · `G_BEAST` · `BEAST_MAP` · `G_FIREATR` · `FIREATR_MAP` · `G_MAGMAATR` · `MAGMAATR_MAP` · `G_NECRO_U` · `NECRO_U_MAP` · `G_HOUSE2` · `HOUSE2_MAP` · `G_TOWNHALL` · `G_TOWER` · `G_NECRO` · `G_TAVERN` · `TAVERN_MAP` · `G_RAIDER` · `RAIDER_MAP` · `UNIT_MAPS` · `UNIT_GRIDS` · `HUT_MAPS` · `TH_MAP` · `TOWER_MAP` · `NECRO_MAP` · `validateSprites()` · `bobFrame()` · `terrPix()`

## src/19_atlas.js

canvas-атлас: отрисовка тайлов/зданий/иконок, buildAtlas (browser only)

`ATLAS` · `reg()` · `outlineRegion()` · `vgradeRegion()` · `drawGrid()` · `TRIW` · `triBary()` · `paintTriFull()` · `paintTriTransition()` · `paintRoadHex()` · `paintRiverTri()` · `paintRiverMouth()` · `paintWaterfall()` · `paintBridge()` · `paintFull()` · `px()` · `rect()` · `paintBerry()` · `paintDeadfall()` · `paintRubble()` · `paintVein()` · `paintFish()` · `paintRuins()` · `paintSite()` · `paintFarm()` · `paintMine()` · `paintCamp()` · `paintDen()` · `paintCliff()` · `paintGraves()` · `paintFisher()` · `paintLumber()` · `paintPort()` · `paintGuild()` · `paintAdvGuild()` · `paintShip()` · `paintCrafters()` · `paintStake()` · `paintPennant()` · `paintHammer()` · `paintSmoke()` · `paintWheat()` · `paintStump()` · `paintWatchtower()` · `paintLibrary()` · `paintKnowledge()` · `paintIcon()` · `buildAtlas()`

## src/20_render.js

three.js: батчи, меши террейна/дорог/зданий/юнитов, glow, fx (browser only)

`R` · `makeBatch()` · `bQuad()` · `meshFromBatch()` · `cellTerr()` · `buildTerrain()` · `buildRivers()` · `buildRoads()` · `buildGridOverlay()` · `toggleGrid()` · `buildStatics()` · `buildBuildings()` · `makeGlowMesh()` · `buildingOccupancy()` · `fillGlow()` · `makeFxMesh()` · `fillFx()` · `makeUnitMesh()` · `fillUnits()`

## src/21_fog_input.js

канва тумана, камера, тултип, инспектор-пик, ввод (мышь/тач/клавиатура)

`bayer4()` · `fogBaseAlphaAtCell()` · `fogAlphaAt()` · `FOG_WX0` · `ppt()` · `ensureFogLut()` · `paintFog()` · `updateCam()` · `resize()` · `screenToCell()` · `WORK_LABEL` · `updateTip()` · `KEYS` · `canvasXY()` · `hexCellOutline()` · `updatePinOutline()` · `pickPin()` · `bindInput()` · `keysPan()` · `initRender()`

## src/22_ui.js

DOM UI: панели, дебаг, пати-окно, инспектор, updateUI

`el()` · `togglePause()` · `setSpeed()` · `debugBuilt` · `toggleDebug()` · `buildDebug()` · `updateDebug()` · `PICK` · `toggleParty()` · `renderParty()` · `buildUI()` · `raceCounts()` · `ammoCount()` · `updateUI()` · `dispName()` · `updateInspector()`

## src/22b_battle_ui.js

экран боя (п.11, browser only): карточки рядов, лог, отступление

`BTUI` · `btUnitGrid()` · `btUnitCard()` · `btRender()` · `openBattleScreen()`

## src/23_main.js

restart(seed) и boot(): игровой цикл requestAnimationFrame

`restart()` · `boot()`

## src/24_headless.js

node smoke-test: hexSelfTest, runHeadless, questScenario

`hexSelfTest()` · `runHeadless()` · `tickDays()` · `tickUntilPartyDone()` · `questScenario()`

## src/25_boot.js

точка входа: браузер -> boot(), node -> runHeadless()

_нет топ-уровневых деклараций_
