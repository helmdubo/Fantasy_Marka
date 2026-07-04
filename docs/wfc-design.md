# Design: полноценный WFC для Fantasy Marka

Ветка: `research/full-wfc-oskar-islands`
Статус: проектирование после research. Runtime-код на этом этапе не менялся.

Этот документ фиксирует предлагаемую архитектуру полноценного WFC для `Fantasy Marka`. Он продолжает `docs/wfc-research.md` и переводит research-выводы в конкретный план реализации.

## 0. Принятое направление

Берём гибридный вариант:

> Macro skeleton остаётся процедурным: остров, море, озёра, хребты, высота и реки задаются существующим генератором. Полноценный WFC становится constraint-solving интерпретатором для биомно-топологического слоя суши.

Первый implementation milestone при этом ограничен заменой текущего `wgFill()`:

- `WATER` и `MTN` не генерируются WFC, а входят как fixed constraints.
- WFC решает слой суши между ними: луга, поймы, лесные края/ядра, скалы/предгорья.
- Результат по-прежнему пишет старый `S.terr`, чтобы renderer, pathfinding и экономика не ломались.
- Дополнительные подтипы WFC хранятся отдельно в `S.wfcKind`.

Это даёт настоящий WFC, но не отдаёт ему право ломать gameplay-инварианты.

## 1. Цели

### Must have

- Настоящий `wave/domain` на клетку.
- Hard compatibility rules по 6 направлениям hex-сетки.
- Выбор следующей клетки по минимальной entropy.
- Collapse по seed-deterministic weighted choice.
- Propagation через очередь с удалением несовместимых вариантов.
- Contradiction handling: domain пуст — это ошибка solve, а не silent fallback.
- Bounded backtracking и/или bounded full restart.
- Debug trace: collapse, entropy, propagation, contradictions, backtracks.
- Интеграция в текущий pipeline без переписывания renderer.
- Headless smoke-test должен продолжать работать.

### Should have

- Леса становятся более цельными: `forest_core` внутри, `forest_edge` снаружи.
- Скалы липнут к предгорьям, озёрам и горным контурам.
- Поймы около рек остаются более открытыми.
- Стартовые зоны не запираются лесом.
- WFC не создаёт эстетически красивую, но неиграбельную карту.

### Non-goals v1

- Не делать overlapping WFC.
- Не генерировать остров целиком через WFC.
- Не переносить WFC на dual-triangle renderer.
- Не менять `T` enum.
- Не делать новый renderer для подтипов биома.
- Не менять экономику, pathfinding, реки и здания в первом milestone.

## 2. Ограничения текущей архитектуры

Проект собирается не как ES-модули, а как обычные скрипты в общем scope. Порядок задаётся `MANIFEST` в `build.mjs`. Поэтому WFC-core должен быть обычным `src/*.js` файлом, а не импортируемым модулем.

Текущий порядок рядом с генератором:

```js
'00_config.js'
'01_core.js'
'02_hex.js'
'02c_worldgen.js'
'03_state_mapgen.js'
```

Предлагаемый порядок:

```js
'00_config.js'
'01_core.js'
'02_hex.js'
'02b_wfc_core.js'   // новый pure-ish WFC solver
'02c_worldgen.js'   // вызывает WFC вместо старого wgFill-body
'03_state_mapgen.js'
```

Причина: `02c_worldgen.js` должен видеть WFC-структуры и solver. Function declarations в общем scope hoist-ятся, но `const/let` безопаснее держать раньше фактического вызова.

## 3. Новые файлы и зоны правок

### Новый файл: `src/02b_wfc_core.js`

Ответственность:

- описание WFC tile model;
- bitmask/domain helpers;
- entropy calculation;
- observe/collapse/propagate;
- backtracking/restart;
- trace collection;
- solver API без знания конкретной игры, насколько это практично.

Предлагаемые top-level declarations:

```js
const WFC_NONE = 0;
const WFC_TRACE_LIMIT = 9000;

function wfcMakeRng(seed) {}
function wfcRngNext(rng) {}
function wfcBitCount(mask) {}
function wfcEachBit(mask, fn) {}
function wfcWeightedPick(mask, weightFn, rng) {}
function wfcEntropy(mask, weightFn) {}
function wfcBuildCompat(tileCount, rules) {}
function wfcSolve(model, opts) {}
function wfcPropagate(state, startQueue) {}
function wfcSnapshot(state, decision) {}
function wfcRestore(state, snap) {}
```

### Правка: `build.mjs`

Добавить `02b_wfc_core.js` перед `02c_worldgen.js`.

### Правка: `src/02c_worldgen.js`

- Старый body `wgFill()` вынести в `wgFillLegacy()` или оставить под `CFG.WFC_MODE === 'legacy'`.
- Новый `wgFill()` делает:
  1. build WFC model from current world skeleton;
  2. solve;
  3. write `S.terr`, `S.terrHp`, `S.wfcKind`, `S.wfcTrace`;
  4. run WFC-specific validation;
  5. если solve failed — вернуть ошибку наружу через `wgValidate()` / throw-controlled retry.

### Правка: `src/00_config.js`

Добавить флаги:

```js
WFC_MODE: 'full',      // 'full' | 'legacy'
WFC_ATTEMPTS: 4,
WFC_BACKTRACKS: 128,
WFC_TRACE: false       // runtime включается через WFC_DEBUG
```

Не обязательно именно такие имена, но нужен явный mode, чтобы можно было быстро сравнивать старый и новый генератор.

### Правка: `src/22_ui.js`

`wfcReplay()` должен понимать новый trace format:

- fixed constraints;
- entropy/collapse;
- propagation removals;
- contradictions;
- backtracks.

Старый replay можно сохранить как fallback для legacy trace.

### Правка: `src/24_headless.js`

Добавить WFC summary в headless вывод:

```text
wfc: ok steps=... propagations=... backtracks=... entropyAvg=... attempts=...
```

Если WFC упал и generator сделал retry, это должно быть видно.

## 4. Tile model v1

### Fixed pseudo-tiles

В wave удобнее включить fixed-клетки как locked domains. Тогда вода/горы участвуют в propagation как обычные constraints, но не меняются.

```js
WFIX_SEA
WFIX_LAKE
WFIX_MTN
```

Mapping:

- `S.terr[i] === T.WATER && S.waterKind[i] === 2` -> `WFIX_SEA`
- `S.terr[i] === T.WATER && S.waterKind[i] === 1` -> `WFIX_LAKE`
- `S.terr[i] === T.MTN` -> `WFIX_MTN`

### Solved biome tiles

```js
WG_OPEN          // открытый луг, основной buildable/passable слой
WG_RIVERPLAIN    // пойма, луг около реки, высокий приоритет открытости
WG_CORRIDOR      // зарезервированный проход / стартовая полоса, optional but useful
WF_EDGE          // край леса
WF_CORE          // ядро леса, должно быть окружено лесом/краем
WR_FOOTHILL      // скалы/холмы у гор
WR_LAKE_SHORE    // скальный или каменистый берег озера
```

### Output mapping в старый terrain enum

```js
WG_OPEN       -> T.GRASS
WG_RIVERPLAIN -> T.GRASS
WG_CORRIDOR   -> T.GRASS
WF_EDGE       -> T.FOREST
WF_CORE       -> T.FOREST
WR_FOOTHILL   -> T.ROCK
WR_LAKE_SHORE -> T.ROCK
WFIX_SEA      -> T.WATER
WFIX_LAKE     -> T.WATER
WFIX_MTN      -> T.MTN
```

Подтип сохраняется отдельно:

```js
S.wfcKind = new Uint8Array(N);
```

Это позволит позже рисовать разные берега/поймы/лесные края без изменения gameplay enum.

## 5. Compatibility rules v1

Hex-направления должны совпадать с `hexDirs(x)`:

```js
0: N
1: S
2: NE
3: NW
4: SE
5: SW
```

Opposite:

```js
0 <-> 1
2 <-> 5
3 <-> 4
```

На v1 compatibility можно сделать симметричной. Направление понадобится позже для склонов, берегов и directed rivers, но сейчас оно не должно усложнять тайлсет.

### Матрица совместимости, концептуально

| Tile | Может соседствовать с | Не должен напрямую соседствовать с |
|---|---|---|
| `WG_OPEN` | почти со всем | `WF_CORE` напрямую нежелателен/запрещён |
| `WG_RIVERPLAIN` | `WG_OPEN`, `WG_CORRIDOR`, `WF_EDGE`, `WR_FOOTHILL` | `WF_CORE`, `WR_LAKE_SHORE` если нет озера |
| `WG_CORRIDOR` | `WG_OPEN`, `WG_RIVERPLAIN`, `WF_EDGE`, `WR_FOOTHILL` | `WF_CORE` |
| `WF_EDGE` | grass, forest, rock | fixed sea/lake/mtn через context-фильтр |
| `WF_CORE` | `WF_CORE`, `WF_EDGE` | grass, rock, fixed water/mtn |
| `WR_FOOTHILL` | grass, `WF_EDGE`, rock, fixed mtn | `WF_CORE` напрямую |
| `WR_LAKE_SHORE` | grass, rock, lake | `WF_CORE`, sea |
| `WFIX_SEA` | shore/open/rock by context | forest core |
| `WFIX_LAKE` | lake shore/open/riverplain | forest core |
| `WFIX_MTN` | foothill/open/edge | forest core |

Важно: не надо делать rules слишком строгими в первом проходе. Чем жёстче матрица, тем выше failure rate. Форма лесов должна получаться от сочетания hard rules + zone weights + validation, а не от сверххрупкого набора запретов.

## 6. Preconstraints и локальные веса

Compatibility отвечает на вопрос: «может ли A стоять рядом с B?».

Preconstraints отвечают на вопрос: «может ли этот tile вообще появиться в этой клетке?».

Weights отвечают на вопрос: «насколько tile желателен здесь?».

### Context fields

При сборке модели вычисляем контекст:

```js
ctx = {
  W, H, N,
  distCoast: S.distCoast,
  distMtn: wgBfsField(i => S.terr[i] === T.MTN),
  nearRiver: Uint8Array(N),
  adjSea: Uint8Array(N),
  adjLake: Uint8Array(N),
  adjMtn: Uint8Array(N),
  startBias: Float32Array(N),
  corridorSeed: Uint8Array(N) // optional
}
```

`nearRiver` можно получить через `cellNearRiver(x, y)`. `adjSea/adjLake/adjMtn` считаются по соседям.

### Initial domain filter

Для каждой клетки:

1. Если fixed water/mtn — domain = fixed tile.
2. Если суша:
   - всегда allow `WG_OPEN`;
   - allow `WG_RIVERPLAIN`, если `nearRiver` или рядом озеро/пойма;
   - allow `WF_EDGE`, если не на самом берегу моря и не вплотную к горе;
   - allow `WF_CORE`, если далеко от воды, реки и гор;
   - allow `WR_FOOTHILL`, если `distMtn <= k` или рядом горы;
   - allow `WR_LAKE_SHORE`, если `adjLake`;
   - allow `WG_CORRIDOR`, если клетка входит в precomputed corridor mask.

Если после фильтра domain пуст — это ошибка модели. В таком случае fallback должен быть явным: retry с ослаблением фильтра или ошибка генератора, но не молчаливый `GRASS`.

### Local weights

Для weighted collapse используется не только base weight тайла, но и локальный множитель:

```js
weightAt(i, tile) = baseWeight[tile] * zoneBoost(i, tile) * rngMicroJitter(i, tile)
```

Примеры:

- `WG_RIVERPLAIN`: высокий boost рядом с рекой.
- `WF_CORE`: boost в среднем поясе острова, penalty у воды/гор/рек.
- `WF_EDGE`: умеренный boost вокруг лесного ядра за счёт compatibility.
- `WR_FOOTHILL`: высокий boost у гор.
- `WR_LAKE_SHORE`: высокий boost рядом с озером.
- `WG_OPEN`: базовый запасной, но не silent contradiction fallback.

## 7. Solver algorithm

### State

```js
state = {
  model,
  domain: Uint32Array(N),   // bitmask tile domain
  count: Uint8Array(N),     // number of bits in domain
  collapsed: Uint8Array(N),
  queue: Int32Array(...),
  rng,
  steps: 0,
  backtracks: 0,
  trace
}
```

Tile count v1 меньше 16, поэтому `Uint32` bitmask достаточно.

### Entropy

Для клетки `i`:

```js
sumW = Σ weightAt(i, t)
sumWL = Σ weightAt(i, t) * log(weightAt(i, t))
entropy = log(sumW) - sumWL / sumW + tinyRandomNoise
```

`tinyRandomNoise` нужен только для deterministic tie-break, чтобы не было bias по порядку скана.

### Observe

```js
function wfcObserve(state) {
  best = -1
  bestEntropy = Infinity
  for i in cells:
    if count[i] <= 1: continue
    e = entropy(i)
    if e < bestEntropy: best = i
  return best // -1 means solved
}
```

### Collapse

```js
function wfcCollapse(state, i) {
  tile = weightedPick(domain[i], t => weightAt(i, t), rng)
  before = domain[i]
  domain[i] = bit(tile)
  count[i] = 1
  push i into propagation queue
  trace collapse
}
```

### Propagation

Для каждой изменённой клетки `i` и каждого соседа `n`:

```js
allowedForNeighbor = union over t in domain[i] of compat[dir][t]
newDomain = domain[n] & allowedForNeighbor
if newDomain !== domain[n]:
  domain[n] = newDomain
  if newDomain === 0: contradiction
  push n into queue
```

Это ключевое отличие от текущего `wgFill()`: сосед не просто меняет веса, а реально удаляет невозможные варианты.

## 8. Backtracking / recovery

### Почему нужен отдельный RNG

Текущий `S.rng` — функция-closure. Её состояние неудобно snapshot-ить для backtracking. Поэтому WFC-core должен иметь собственный stateful RNG-объект:

```js
function wfcMakeRng(seed){ return {s: seed >>> 0}; }
function wfcRngNext(rng){ rng.s = ...; return value; }
```

Snapshot хранит `rng.s`, поэтому backtracking остаётся deterministic.

### Snapshot strategy v1

Карта 64x64 = 4096 клеток. `Uint32Array(4096)` ≈ 16 KB. Даже 128 snapshots — приемлемо.

На каждом observe/collapse можно сохранять snapshot:

```js
snap = {
  cell: i,
  triedMask,
  domain: state.domain.slice(),
  count: state.count.slice(),
  rngState: state.rng.s
}
```

При contradiction:

1. Вернуться к последнему snapshot.
2. Убрать из domain decision-клетки tile, который привёл к contradiction.
3. Propagate снова.
4. Если вариантов не осталось — откатиться ещё дальше.
5. Если backtracks > limit — solve failed.

### Full restart

`genWorld()` уже имеет attempts вокруг всего пайплайна. WFC может также иметь локальные attempts:

```js
for localAttempt in 0..CFG.WFC_ATTEMPTS:
  solve with seed ^ hash(localAttempt)
```

Если все локальные attempts упали — `wgValidate()` возвращает ошибку вроде `wfc contradiction` и внешний `genWorld()` пересобирает macro skeleton.

## 9. Интеграция в `wgFill()`

Текущий `wgFill()` заменить на orchestrator:

```js
function wgFill(){
  if(CFG.WFC_MODE === 'legacy') return wgFillLegacy();

  const model = wgBuildWfcModel();
  const res = wfcSolve(model, {
    seed: S.seed ^ 0x51f15e,
    maxBacktracks: CFG.WFC_BACKTRACKS,
    maxAttempts: CFG.WFC_ATTEMPTS,
    trace: WFC_DEBUG
  });

  if(!res.ok){
    S.wfcTrace = res.trace;
    S.wfcError = res.error;
    return false; // or throw controlled error caught by genWorld attempt
  }

  wgApplyWfcResult(res);
  const err = wgValidateWfcResult();
  if(err){ S.wfcError = err; return false; }
  return true;
}
```

Текущий `genWorld()` сейчас вызывает `wgFill(); wgEntities(); const err = wgValidate();`. Его нужно слегка изменить, чтобы failure из `wgFill()` участвовал в retry:

```js
const fillOk = wgFill();
if(!fillOk){ err = S.wfcError || 'wfc failed'; retry; }
```

## 10. WFC-specific validation

Обычный `wgValidate()` считает общие пропорции мира. Для WFC нужен отдельный слой проверок.

### `wgValidateWfcResult()`

Проверки v1:

- нет клеток суши без `S.wfcKind`;
- нет `WF_CORE`, стоящего рядом с grass/rock/water/mtn;
- доля `T.FOREST` в допустимом диапазоне;
- доля `T.ROCK` в допустимом диапазоне;
- есть достаточно кандидатов для стартовой зоны;
- стартовая область не окружена forest core;
- passable land имеет крупную компоненту связности;
- near-river cells не забиты лесом;
- вокруг гор есть хотя бы часть rock/foothill;
- lake shore не полностью зарос лесом.

### Start candidate validation

Не использовать напрямую `thSiteScore()`, потому что во время `genWorld()` ещё нет нормального runtime-состояния поселения. Вместо этого сделать лёгкий аналог текущей логики `pickStart()`:

```js
function wgStartCandidateCount(){
  // grass cells, not near river hard-block, open >= threshold, forest nearby >= threshold
}
```

Если кандидатов меньше, например, 8 — WFC solve считается неудачным.

### Connectivity validation

Поскольку лес блокирует жителей, WFC должен проверять проходимые компоненты:

```js
passable = T.GRASS || T.ROCK
blocked = T.WATER || T.FOREST || T.MTN
```

Минимум:

- крупнейшая passable-компонента должна покрывать большую часть passable land;
- стартовые кандидаты должны лежать в крупнейшей компоненте;
- рядом с ресурсными зонами должны оставаться passable карманы.

Это не заменяет `rebuildPass()`, а ранняя генераторная проверка.

## 11. Debug trace v2

Новый trace format:

```js
S.wfcTrace = {
  version: 2,
  W, H,
  tiles: [{id, key, terr}],
  fixed: [{i, tile}],
  initial: [{i, mask}],          // optional sampled/limited
  observe: [{i, entropy, count}],
  collapse: [{i, tile, beforeMask}],
  propagate: [{from, to, before, after, removed}],
  contradictions: [{i, reason, maskBefore}],
  backtracks: [{toCell, bannedTile, depth}],
  stats: {steps, propagations, backtracks, attempts, maxQueue}
}
```

Trace limit обязателен. Propagation событий может быть слишком много, поэтому:

- хранить первые `WFC_TRACE_LIMIT` событий;
- stats считать полностью;
- в UI показывать aggregate, а не пытаться отрисовать каждое удаление.

### Replay UI

`wfcReplay()` v2:

1. Рисует fixed water/mtn.
2. Показывает cells с размером domain / entropy как затемнение.
3. При collapse красит клетку итоговым tile color.
4. Propagation можно показывать короткими синими/фиолетовыми вспышками.
5. Contradiction — красная вспышка.
6. Backtrack — откат нескольких клеток или отдельный маркер.

Если trace version отсутствует — использовать legacy replay.

## 12. Влияние на renderer

Первый milestone не меняет renderer.

`buildTerrain()` по-прежнему строит terrain layers из `S.terr`. Dual-triangle transition rendering продолжает работать, потому что output enum остаётся прежним.

Позже можно использовать `S.wfcKind` для визуальных вариаций:

- другой шум для `WG_RIVERPLAIN`;
- более тёмный лес для `WF_CORE`;
- edge sprites для `WF_EDGE`;
- каменистые берега озёр для `WR_LAKE_SHORE`.

Но это отдельный visual milestone, не часть полноценного WFC-core.

## 13. Тестовая матрица

Минимум перед merge:

```bash
node build.mjs
node dist/game.js test-1
node dist/game.js test-1 quest
```

Seed matrix для ручного/headless прогона:

```text
test-1
oskar-1
bad-north
shoreline
river-split
mountain-core
lake-shore
forest-lock
marka-001
marka-002
marka-003
stress-0001
stress-0002
stress-0003
```

Для каждого seed записывать:

- terrain percentages;
- WFC stats;
- retry/backtrack count;
- start candidate count;
- passable largest component ratio;
- 60-day headless result;
- quest scenario result хотя бы на ключевых seed.

## 14. Implementation milestones

### M1 — Core solver, не подключён к генератору

- Добавить `src/02b_wfc_core.js`.
- Добавить unit-like smoke function, вызываемую из headless только в debug/dev режиме.
- Проверить простой synthetic model 5x5.

### M2 — Подключить WFC как replacement для `wgFill()`

- Добавить `CFG.WFC_MODE`.
- Старый `wgFill()` сохранить как legacy.
- Новый `wgFill()` пишет `S.terr` и `S.wfcKind`.
- `node dist/game.js test-1` проходит.

### M3 — Validation и retry

- Добавить `wgValidateWfcResult()`.
- Добавить WFC failure в retry loop `genWorld()`.
- Добавить stats в headless.

### M4 — Debug replay v2

- Обновить `wfcReplay()`.
- Сохранить fallback для старого trace.

### M5 — Баланс тайлсета

- Отрегулировать weights/constraints.
- Прогнать seed matrix.
- Сравнить карты legacy/full.

### M6 — Optional visual subtypes

- Использовать `S.wfcKind` только для визуальных вариаций, не для gameplay.

## 15. Основные риски и меры

### Риск: WFC станет слишком строгим

Симптомы:

- много contradictions;
- frequent full restarts;
- одинаковые карты из-за слишком малого domain.

Меры:

- начать с мягкой compatibility matrix;
- делать `WG_OPEN` универсальным, но не fallback после contradiction;
- часть формы получать weights/validation, а не hard rules.

### Риск: леса сломают pathfinding

Симптомы:

- start candidate мало;
- road builder stuck;
- `unconnected` растёт в headless.

Меры:

- `WG_CORRIDOR` / open bias вокруг стартовых кандидатов;
- validation passable component;
- penalty для `WF_CORE` рядом с реками/берегом/стартовым поясом.

### Риск: WFC будет красиво, но не Oskar-like

Симптомы:

- карта выглядит как шумовые пятна;
- нет читаемых массивов/краёв/переходов.

Меры:

- edge/core тайлы;
- shore/foothill/riverplain semantic tiles;
- macro skeleton как намерение;
- позже — visual subtype renderer.

### Риск: trace слишком большой

Меры:

- hard cap на события;
- stats отдельно;
- UI replay показывает collapse прежде всего, propagation агрегировано.

## 16. Критерий готовности к реализации

Можно переходить к коду, если согласованы эти решения:

1. WFC v1 решает только biome fill, не остров/реки/горы.
2. Fixed water/mtn участвуют как locked pseudo-tiles.
3. Simple tiled model на hex-клетках, не overlapping и не dual-triangle.
4. `S.terr` остаётся старым gameplay output; `S.wfcKind` хранит подтипы.
5. Включаем `CFG.WFC_MODE`, чтобы можно было сравнить legacy/full.
6. Backtracking делаем snapshot-based, с отдельным RNG.
7. Validation считается частью WFC, а не косметическим пост-процессом.

## 17. Следующий шаг

После approval этого design:

1. создать `src/02b_wfc_core.js`;
2. обновить `build.mjs` manifest;
3. добавить legacy/full switch;
4. реализовать solver без визуальных изменений;
5. подключить к `wgFill()`;
6. прогнать headless smoke-test;
7. только затем заниматься debug replay и визуальными subtype-улучшениями.
