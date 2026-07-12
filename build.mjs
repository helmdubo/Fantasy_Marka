#!/usr/bin/env node
// Сборщик «Дальней Марки»: склеивает src/*.js в порядке MANIFEST и
// инжектит в src/shell.html -> index.html (единственный файл для запуска в браузере).
// Дополнительно кладёт dist/game.js для headless-прогона в Node
// и обновляет docs/function-index.md (индекс топ-уровневых деклараций).
//
//   node build.mjs            # собрать index.html + dist/game.js + docs
//   node dist/game.js [seed]  # headless smoke-test (без браузера)
//   node dist/game.js seed quest  # + квест-сценарий (герои/логовища/шахты)
//
// ВАЖНО: модули — обычные скрипты в ОБЩЕМ scope (не ES-модули).
// Порядок в MANIFEST = порядок объявлений; правь код в src/, не в index.html.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');

export const MANIFEST = [
  '00_config.js',       // CFG: все игровые константы; таблицы T/F/RACES/LAIR_DEFS
  '01_core.js',         // RNG (mulberry32), шум fbm, hash, clamp/lerp, скорость по террейну
  '02_hex.js',          // гекс-математика flat-top odd-q: координаты, соседи, LOS, A* findPath
  '02c_worldgen.js',    // генератор мира: остров, хребты-графы, WFC-заполнение от контуров
  '02d_relief.js',      // рельеф v2.0: кластеры гор (розетки/тройки/цепи), псевдовысоты E, котловины/перевалы, влажность/биомы
  '02e_rivers.js',      // реки v3: flow-аккумуляция на графе треугольников, ширина от потока, стоки озёр
  '03_state_mapgen.js', // глобальное состояние S; newGame, генерация мира, spawn поселенцев
  '04_econ.js',         // уровни запасов, canPay/payCost
  '05_vision.js',       // туман войны: stampVision, recomputeVision, exploreRing, pickHex
  '06_market_core.js',  // примитивы рынка задач: init/add/reserve/release офферов
  '07_popups.js',       // DOM-попапы фидбека (+ресурс/-ресурс), прогресс-бары портов
  '08_market.js',       // публикация офферов (труд/ресурсы/квесты) и выбор задач юнитом
  '09_jobs.js',         // job pool: rebuildJobs, pick/assign/release, harvestCycle, дороги, completeJob
  '10_hauling.js',      // логистика: supply/haul/export/deposit, назначение носильщиков
  '10b_skills.js',      // навыки жителей (п.9): прокачка работой, эффекты в бою героев
  '11_settlers.js',     // поведение поселенца: settlerTick, разведка фронтира, отдых, arrive
  '12_settle.js',       // автостроитель: siteOk, settleThink, research, стартовые площадки, апгрейды
  '13_heroes_pop.js',   // герои (makeHero, слоты пати), иммиграция/отток, крафт и покупка снаряжения
  '14_port_trade.js',   // порт: корабли, автоимпорт; ежедневная торговля tradeDaily; сквоттеры
  '15_raids.js',        // логовища: агро, рейды, warbandTick, грабёж
  '16_party.js',        // экспедиции: sendParty/sendDelve, этапы логовищ, шахтные этажи
  '16b_battle.js',      // боевое ядро (п.11): ряды, цели, раунды; составы врагов
  '17_daycycle.js',     // дань империи, смена дня onNewDay, роль поселения, главный tick(dt)
  '18_sprites.js',      // палитра PAL и пиксельные гриды спрайтов (расы, здания)
  '18c_units_png.js',   // АВТОГЕНЕРИРУЕТСЯ build.mjs из assets/pixellab/characters: base64 PNG юнитов (idle/walk/work x 6 гекс-сторон)
  '19_atlas.js',        // canvas-атлас: отрисовка тайлов/зданий/иконок, buildAtlas (browser only)
  '20_render.js',       // three.js: батчи, меши террейна/дорог/зданий/юнитов, glow, fx (browser only)
  '21_fog_input.js',    // канва тумана, камера, тултип, инспектор-пик, ввод (мышь/тач/клавиатура)
  '22_ui.js',           // DOM UI: панели, дебаг, пати-окно, инспектор, updateUI
  '22b_battle_ui.js',   // экран боя (п.11, browser only): карточки рядов, лог, отступление
  '23_main.js',         // restart(seed) и boot(): игровой цикл requestAnimationFrame
  '24_headless.js',     // node smoke-test: hexSelfTest, runHeadless, questScenario
  '25_boot.js',         // точка входа: браузер -> boot(), node -> runHeadless()
];

// Вшивка PNG-спрайтов юнитов (PixelLab): assets -> src/18c_units_png.js.
// idle: 6 гекс-ротаций персонажа; walk/work: кадры анимаций по направлениям.
// Файл генерируется при каждой сборке; в репо коммитится вместе с index.html.
function genUnitsPng() {
  const base = path.join(ROOT, 'assets', 'pixellab', 'characters');
  const RACES = ['human', 'dwarf', 'elf', 'troll', 'raider', 'shade'];
  const SLOTS = { n: 'north', s: 'south', ne: 'north-east', nw: 'north-west', se: 'south-east', sw: 'south-west' };
  const b64 = (p) => fs.readFileSync(p).toString('base64');
  const frames = (ad) => fs.readdirSync(ad).filter(f => f.endsWith('.png')).sort()
    .map(f => b64(path.join(ad, f)));
  const out = {};
  for (const r of RACES) {
    const dir = path.join(base, r);
    if (!fs.existsSync(dir)) continue;
    const rec = { idle: {}, walk: {}, work: {} };
    for (const [slot] of Object.entries(SLOTS)) {
      const p = path.join(dir, slot + '.png');
      if (fs.existsSync(p)) rec.idle[slot] = b64(p);
    }
    for (const anim of ['walk', 'work']) {
      for (const [slot, full] of Object.entries(SLOTS)) {
        const ad = path.join(dir, 'animations', anim, full);
        if (fs.existsSync(ad)) rec[anim][slot] = frames(ad);
      }
    }
    if (!Object.keys(rec.work).length) delete rec.work;
    out[r] = rec;
  }
  // Боевые кадры (экран боя): герои — SE (смотрят вправо), враги — SE,
  // зеркалятся при выводе (у модели прайор «атака вправо»); raider-как-bandit — SW.
  const bt = {};
  const btEntry = (dir, side) => {
    const rec = {};
    const rot = path.join(dir, side === 'south-east' ? 'se.png' : 'sw.png');
    if (fs.existsSync(rot)) rec.idle = b64(rot);
    for (const anim of ['attack', 'hurt', 'death']) {
      const ad = path.join(dir, 'animations', anim, side);
      if (fs.existsSync(ad)) rec[anim] = frames(ad);
    }
    return Object.keys(rec).length ? rec : null;
  };
  for (const r of ['human', 'dwarf', 'elf', 'troll']) {
    const e = btEntry(path.join(base, r), 'south-east');
    if (e) bt[r] = e;
  }
  { const e = btEntry(path.join(base, 'raider'), 'south-west'); if (e) bt.bandit = e; }
  const edir = path.join(ROOT, 'assets', 'pixellab', 'enemies');
  if (fs.existsSync(edir))
    for (const k of fs.readdirSync(edir)) {
      const d = path.join(edir, k);
      if (!fs.statSync(d).isDirectory()) continue;
      const e = btEntry(d, 'south-east');
      if (e) { e.flip = 1; bt[k] = e; } // SE-кадры зеркалятся: враг смотрит влево
    }
  // Здания (один стиль, 32px) и корабль
  const bld = {};
  const bdir = path.join(ROOT, 'assets', 'pixellab', 'buildings');
  if (fs.existsSync(bdir))
    for (const f of fs.readdirSync(bdir))
      if (f.endsWith('.png')) bld[f.replace('.png', '')] = b64(path.join(bdir, f));
  const shipP = path.join(ROOT, 'assets', 'pixellab', 'ship.png');
  const ship = fs.existsSync(shipP) ? b64(shipP) : null;
  const js = '/* АВТОГЕНЕРИРОВАНО build.mjs из assets/pixellab — НЕ ПРАВИТЬ РУКАМИ.\n' +
    '   UNIT_PNG: юниты карты (idle 6 ротаций + walk/work). BT_PNG: боевые кадры\n' +
    '   (idle/attack/hurt/death, одна сторона; flip=1 — зеркалить при выводе).\n' +
    '   BLD_PNG: здания 32px. SHIP_PNG: корабль. */\n' +
    'const UNIT_PNG=' + JSON.stringify(out) + ';\n' +
    'const BT_PNG=' + JSON.stringify(bt) + ';\n' +
    'const BLD_PNG=' + JSON.stringify(bld) + ';\n' +
    'const SHIP_PNG=' + JSON.stringify(ship) + ';\n';
  fs.writeFileSync(path.join(SRC, '18c_units_png.js'), js);
  return js.length;
}

function build() {
  const pngBytes = genUnitsPng();
  console.log(`units png embed: ${(pngBytes / 1024).toFixed(0)} KB`);
  const js = MANIFEST.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('');
  const shell = fs.readFileSync(path.join(SRC, 'shell.html'), 'utf8');
  const marker = '/*__GAME_JS__*/\n';
  if (!shell.includes(marker)) throw new Error('shell.html: маркер /*__GAME_JS__*/ не найден');
  const html = shell.replace(marker, js);

  fs.writeFileSync(path.join(ROOT, 'index.html'), html);
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'dist', 'game.js'), js);
  writeFunctionIndex();
  console.log(`index.html: ${html.length} bytes · dist/game.js: ${js.length} bytes · модулей: ${MANIFEST.length}`);
}

function writeFunctionIndex() {
  const out = ['# Индекс модулей и топ-уровневых деклараций', '',
    'Генерируется автоматически (`node build.mjs`), не редактировать руками.', ''];
  for (const f of MANIFEST) {
    const body = fs.readFileSync(path.join(SRC, f), 'utf8');
    const decls = [];
    for (const line of body.split('\n')) {
      const m = line.match(/^(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*))/);
      if (m) decls.push(m[1] ? m[1] + '()' : m[2].replace(/\s+/g, ''));
    }
    const note = MANIFEST_NOTES[f] || '';
    out.push(`## src/${f}`, '', note, '', decls.length ? '`' + decls.join('` · `') + '`' : '_нет топ-уровневых деклараций_', '');
  }
  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'function-index.md'), out.join('\n'));
}

// комментарии из MANIFEST — в доку
const MANIFEST_NOTES = Object.fromEntries(
  fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
    .split('\n')
    .map(l => l.match(/^\s*'([^']+)',\s*\/\/\s*(.+)$/))
    .filter(Boolean)
    .map(m => [m[1], m[2]])
);

build();
