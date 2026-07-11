# Индекс модулей и топ-уровневых деклараций

Генерируется автоматически (`node build.mjs`), не редактировать руками.

## src/00_config.js

CFG: все игровые константы; таблицы T/F/RACES/LAIR_DEFS

`VERSION` · `IS_BROWSER` · `CFG` · `UTIL` · `T` · `TNAME` · `BIO` · `BIO_NAME` · `F` · `FNAME` · `RACES` · `RNAME` · `ACTNAME` · `LAIR_DEFS`

## src/01_core.js

RNG (mulberry32), шум fbm, hash, clamp/lerp, скорость по террейну

`mulberry32()` · `hashStr()` · `hash2()` · `lerp()` · `clamp()` · `vnoise()` · `fbm()` · `cheb()` · `heightOf()` · `terrainSpeed()`

## src/02_hex.js

гекс-математика flat-top odd-q: координаты, соседи, LOS, A* findPath

`CW` · `zig()` · `WXC()` · `WYCC()` · `hexDirs()` · `offToCube()` · `hexDist2()` · `cubeToOff()` · `hexLine()` · `losClear()` · `colTris()` · `findPath()`

## src/02c_worldgen.js

генератор мира: остров, хребты-графы, WFC-заполнение от контуров

`WFC_DEBUG` · `genWorld()` · `wgIsland()` · `wgBfsField()` · `wgLakes()` · `wgRidges()` · `wgFill()` · `wgEntities()` · `wgValidate()`

## src/02d_relief.js

рельеф v2.0: кластеры гор (розетки/тройки/цепи), псевдовысоты E, котловины/перевалы, влажность/биомы

`hexAdjIdx()` · `mclusterDetect()` · `reliefField()` · `detectBasins()` · `detectPasses()` · `checkValleySecrets()` · `wgPeaks()` · `wgMoisture()` · `wgRelief()`

## src/02e_rivers.js

реки v3: flow-аккумуляция на графе треугольников, ширина от потока, стоки озёр

`edgeKeyCells()` · `cellNearRiver()` · `genRivers()`

## src/03_state_mapgen.js

глобальное состояние S; newGame, генерация мира, spawn поселенцев

`S` · `log()` · `idx()` · `inMap()` · `newGame()` · `classifyWater()` · `pickStart()` · `thSiteScore()` · `placeTownhall()` · `autoPlaceTownhall()` · `genFeatures()` · `genLairs()` · `genRuinLairs()` · `computeFear()` · `rebuildPass()` · `withHeroPass()` · `placeBuilding()` · `spawnSettlers()`

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

`countB()` · `countLive()` · `countActive()` · `houseCapOf()` · `housingCap()` · `tryUpgradeHut()` · `NEAR_ROAD_TYPES` · `influenceAnchors()` · `inInfluence()` · `siteOk()` · `engineTarget()` · `researchNext()` · `typeUnlocked()` · `researchCycle()` · `tryLibraryTier2()` · `stockWorld()` · `pendingConstructionNeed()` · `stockWorldAvailable()` · `activeConstructionCount()` · `constructionCap()` · `costOf()` · `canPayWorld()` · `resScore()` · `PROD_TYPES` · `withBridgedPass()` · `tryPlace()` · `nearestRoadTarget()` · `buildRoad()` · `finishBuilding()` · `forestInInfluence()` · `anySite()` · `bestSiteScore()` · `constructionOpen()` · `tryPlaceIfOpen()` · `settleThink()` · `tryUpgrade()`

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

`sendParty()` · `partyHeroes()` · `sendDelve()` · `ruinSweep()` · `partyTick()` · `partyArrive()` · `delveNextFloor()` · `aggroWord()` · `lairStages()` · `itemAtk()` · `clearNextStage()` · `endSlotMission()` · `goBack()`

## src/16b_battle.js

боевое ядро (п.11): ряды, цели, раунды; составы врагов

`ENEMY_DEFS` · `BATTLE_COMPS` · `battleComp()` · `makeBattle()` · `btAlive()` · `btPickTarget()` · `btStrike()` · `stepBattleRound()` · `finishBattle()` · `beginBattle()`

## src/17_daycycle.js

дань империи, смена дня onNewDay, роль поселения, главный tick(dt)

`brewDaily()` · `tributeDaily()` · `endSession()` · `computeRole()` · `onNewDay()` · `tick()` · `wakeAll()`

## src/18_sprites.js

палитра PAL и пиксельные гриды спрайтов (расы, здания)

`PAL` · `OUTL` · `G_HUMAN` · `G_DWARF` · `G_ELF` · `G_TROLL` · `G_GOBLIN` · `GOBLIN_MAP` · `G_GOBSHAMAN` · `GOBSHAMAN_MAP` · `G_SKELETON` · `SKELETON_MAP` · `G_BEAST` · `BEAST_MAP` · `G_FIREATR` · `FIREATR_MAP` · `G_MAGMAATR` · `MAGMAATR_MAP` · `G_NECRO_U` · `NECRO_U_MAP` · `G_RAIDER` · `RAIDER_MAP` · `UNIT_MAPS` · `UNIT_GRIDS` · `G_HUT` · `G_HUT_MAP` · `G_HOUSE2` · `G_HOUSE2_MAP` · `G_TENT` · `G_TENT_MAP` · `G_TAVERN` · `G_TAVERN_MAP` · `G_TOWNHALL` · `G_TOWNHALL_MAP` · `G_FISHER` · `G_FISHER_MAP` · `G_LUMBER` · `G_LUMBER_MAP` · `G_FARM` · `G_FARM_MAP` · `G_MINE` · `G_MINE_MAP` · `G_PORT` · `G_PORT_MAP` · `G_GUILD` · `G_GUILD_MAP` · `G_ADVGUILD` · `G_ADVGUILD_MAP` · `G_CRAFTERS` · `G_CRAFTERS_MAP` · `G_LIBRARY` · `G_LIBRARY_MAP` · `G_KNOWLEDGE` · `G_KNOWLEDGE_MAP` · `G_WATCHTOWER` · `G_WATCHTOWER_MAP` · `G_SITE` · `G_SITE_MAP` · `L_TOWER` · `L_TOWER_MAP` · `L_NECRO` · `L_NECRO_MAP` · `L_CAMP` · `L_CAMP_MAP` · `L_DEN` · `L_DEN_MAP` · `L_CLIFF` · `L_CLIFF_MAP` · `L_GRAVES` · `L_GRAVES_MAP` · `F_BERRY` · `F_BERRY_MAP` · `F_DEADFALL` · `F_DEADFALL_MAP` · `F_RUBBLE` · `F_RUBBLE_MAP` · `F_VEIN` · `F_VEIN_MAP` · `F_FISH` · `F_FISH_MAP` · `F_RUINS` · `F_RUINS_MAP` · `F_WHEAT` · `F_WHEAT_MAP` · `F_STUMP` · `F_STUMP_MAP` · `G_SHIP` · `G_SHIP_MAP` · `G_STAKE` · `G_STAKE_MAP` · `G_PENNANT` · `G_PENNANT_MAP` · `G_SMOKE0` · `G_SMOKE0_MAP` · `G_SMOKE1` · `G_SMOKE1_MAP` · `G_HAMMER0` · `G_HAMMER0_MAP` · `G_HAMMER1` · `G_HAMMER1_MAP` · `validateSprites()` · `bobFrame()` · `terrPix()`

## src/18c_units_png.js

АВТОГЕНЕРИРУЕТСЯ build.mjs из assets/pixellab/characters: base64 PNG юнитов (idle/walk/work x 6 гекс-сторон)

`UNIT_PNG`

## src/19_atlas.js

canvas-атлас: отрисовка тайлов/зданий/иконок, buildAtlas (browser only)

`ATLAS` · `loadUnitImages()` · `reg()` · `outlineRegion()` · `vgradeRegion()` · `drawGrid()` · `TRIW` · `triCorners()` · `triBary()` · `triIns()` · `decorTri()` · `paintTriFull()` · `paintTriTransition()` · `paintRoadHex()` · `paintRiverTri()` · `paintReliefTri()` · `paintBiomeTri()` · `paintRiverMouth()` · `paintWaterfall()` · `paintBridge()` · `paintIcon()` · `buildAtlas()`

## src/20_render.js

three.js: батчи, меши террейна/дорог/зданий/юнитов, glow, fx (browser only)

`R` · `makeBatch()` · `bQuad()` · `meshFromBatch()` · `cellTerr()` · `buildTerrain()` · `buildRivers()` · `reliefRenderField()` · `buildRelief()` · `buildRoads()` · `buildGridOverlay()` · `toggleGrid()` · `buildStatics()` · `buildBuildings()` · `makeGlowMesh()` · `buildingOccupancy()` · `fillGlow()` · `makeFxMesh()` · `fillFx()` · `makeUnitMesh()` · `unitHexSlot()` · `unitSprPick()` · `UNIT_SCALE` · `pushUnitQuad()` · `fillUnits()`

## src/21_fog_input.js

канва тумана, камера, тултип, инспектор-пик, ввод (мышь/тач/клавиатура)

`bayer4()` · `fogBaseAlphaAtCell()` · `fogAlphaAt()` · `FOG_WX0` · `ppt()` · `ensureFogLut()` · `paintFog()` · `updateCam()` · `resize()` · `screenToCell()` · `WORK_LABEL` · `updateTip()` · `KEYS` · `canvasXY()` · `hexCellOutline()` · `updatePinOutline()` · `pickPin()` · `bindInput()` · `keysPan()` · `initRender()`

## src/22_ui.js

DOM UI: панели, дебаг, пати-окно, инспектор, updateUI

`el()` · `togglePause()` · `setSpeed()` · `debugBuilt` · `toggleDebug()` · `buildDebug()` · `wfcReplay()` · `updateDebug()` · `PICK` · `toggleParty()` · `renderParty()` · `buildUI()` · `raceCounts()` · `ammoCount()` · `updateUI()` · `dispName()` · `updateInspector()`

## src/22b_battle_ui.js

экран боя (п.11, browser only): карточки рядов, лог, отступление

`BTUI` · `btUnitGrid()` · `btUnitCard()` · `btAct()` · `btRender()` · `openBattleScreen()`

## src/23_main.js

restart(seed) и boot(): игровой цикл requestAnimationFrame

`restart()` · `boot()`

## src/24_headless.js

node smoke-test: hexSelfTest, runHeadless, questScenario

`hexSelfTest()` · `runHeadless()` · `tickDays()` · `tickUntilPartyDone()` · `questScenario()`

## src/25_boot.js

точка входа: браузер -> boot(), node -> runHeadless()

_нет топ-уровневых деклараций_
