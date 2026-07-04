# Дальняя Марка — правила работы с кодом

Браузерная simulation-игра одним HTML-файлом. Полная карта модулей и потока
управления — в `ARCHITECTURE.md`; индекс функций — в `docs/function-index.md`.

## Жёсткие правила

1. **НЕ редактируй `index.html`** — он генерируется. Правь модули в `src/`
   и HTML-оболочку `src/shell.html`, затем пересобирай.
2. Модули `src/*.js` — обычные скрипты в общем scope, склеиваемые по `MANIFEST`
   из `build.mjs`. **Никаких `import`/`export`** в них. Новый модуль — новый файл
   `src/NN_name.js` + строка в `MANIFEST`.
3. `index.html` коммитится в репо (пользователь запускает его одним файлом
   с телефона). После правок `src/` всегда пересобирай и коммить `index.html`
   вместе с исходниками.
4. `dist/` не коммитится (в `.gitignore`).

## Команды

```
node build.mjs                 # сборка: index.html + dist/game.js + docs/function-index.md
node dist/game.js test-1       # headless smoke-test (60 игровых дней, сводка)
node dist/game.js test-1 quest # + сценарий героев/логовищ/шахт
node --check dist/game.js      # быстрая проверка синтаксиса
```

Перед коммитом: сборка + headless-прогон обязаны проходить без исключений.

## Куда смотреть (чтобы не читать всё)

- Баланс/константы → `src/00_config.js` (`CFG`)
- Всё состояние игры → объект `S` (`src/03_state_mapgen.js`, создаётся `newGame`)
- Главный цикл симуляции → `tick(dt)` в `src/17_daycycle.js`
- ИИ поселенца → `settlerTick` в `src/11_settlers.js`
- Автостроитель → `settleThink` в `src/12_settle.js`
- Работы/логистика → `src/09_jobs.js`, `src/10_hauling.js`
- Рендер/UI трогать только для визуала: `20_render`, `21_fog_input`, `22_ui`
- Симуляция должна работать и в Node: код вне `19_atlas`/`20_render`/`21_fog_input`/
  `22_ui`/`23_main` не должен трогать `document`/`window`/`THREE` без guard-а
  `IS_BROWSER`.
