/* Headless check: every level must be beatable with exactly the solution the
 * author wrote down, that solution must fit in the palette the child is given,
 * and it must be worth three stars. On top of that the story has to hold
 * together: stops alternate board/exit the way Tito needs them, every cell he
 * stands on is a real platform, and no crate stack covers the playable grid.
 * If a level ever drifts, this fails instead of a 8-year-old discovering it
 * in class.
 *
 * Run with:  node tools/check-levels.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
vm.createContext(sandbox);

for (const f of ['js/levels.js', 'js/engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
}

const { LEVELS, PHASES, Engine } = sandbox;

let failures = 0;
function check(level, ok, message) {
  if (ok) return true;
  failures++;
  console.log(`  FALLA [${level.id}] ${message}`);
  return false;
}

function inWorld(w, c) {
  return c.x >= w.minX && c.x <= w.maxX && c.y >= w.minY && c.y <= w.maxY;
}

function same(a, b) {
  return a.x === b.x && a.y === b.y;
}

function at(c) {
  return `(${c.x},${c.y})`;
}

/* Board and exit are one step sideways, never a jump. */
function besides(a, b) {
  return a.y === b.y && Math.abs(a.x - b.x) === 1;
}

/* The palette is the real constraint of a level: there is one block per axis
 * and the child writes the number, so what the budget limits is how many legs
 * the trip may have, not how many steps. */
const MAX_AMOUNT = 99;

function fitsPalette(level) {
  const budget = level.palette.map((p) => p.count);
  for (const move of level.solution) {
    if (move.amount === 0) return `tiene un bloque de ${move.axis} en 0, que no mueve nada`;
    if (Math.abs(move.amount) > MAX_AMOUNT) return `usa ${move.amount}, que pasa el tope de ${MAX_AMOUNT}`;

    const i = level.palette.findIndex((p) => p.axis === move.axis);
    if (i < 0) return `no hay bloque de ${move.axis} en la paleta`;
    if (--budget[i] < 0) return `se queda sin bloques de ${move.axis}`;
  }
  return null;
}

/* Walks the stops the way the game will, keeping track of where Tito stands.
 * Returns the list of cells he stands on (start + every dest). */
function checkStory(level) {
  const w = level.world;
  const platforms = level.platforms || [];
  const isPlatform = (c) => platforms.some((p) => same(p, c));

  let aboard = !!level.worker.aboard;
  let standing = aboard ? null : { x: level.worker.x, y: level.worker.y };

  check(level, w.stops.length > 0, 'no hay ninguna parada');
  if (standing) {
    check(level, isPlatform(standing), `Tito arranca parado en ${at(standing)} y ahí no hay cajón`);
  }

  w.stops.forEach((s, i) => {
    check(level, inWorld(w, s), `la parada ${at(s)} queda fuera del mundo`);
    check(level, !isPlatform(s), `la parada ${at(s)} está arriba de un cajón`);
    check(level, s.action === 'board' || s.action === 'exit', `la parada ${i + 1} tiene una acción rara: ${s.action}`);

    if (aboard) {
      if (!check(level, s.action === 'exit', `Tito ya está arriba y la parada ${i + 1} le pide subir otra vez`)) return;
      check(level, !!s.dest, `la parada ${at(s)} es una bajada sin destino`);
      if (!s.dest) return;
      check(level, besides(s, s.dest), `la bajada ${at(s)} no queda al lado de ${at(s.dest)}`);
      check(level, isPlatform(s.dest), `Tito se baja en ${at(s.dest)} y ahí no hay cajón`);
      aboard = false;
      standing = s.dest;
    } else {
      if (!check(level, s.action === 'board', `Tito está parado y la parada ${i + 1} le pide bajar otra vez`)) return;
      check(level, besides(s, standing), `la subida ${at(s)} no queda al lado de Tito en ${at(standing)}`);
      aboard = true;
      standing = null;
    }
  });
}

/* A crate stack fills column x from the floor up to the row below the
 * platform. Inside the playable columns the whole stack must stay under minY,
 * or a crate would sit on a cell the platform can visit. */
function checkPlatforms(level) {
  const w = level.world;
  for (const p of level.platforms || []) {
    const inColumns = p.x >= w.minX && p.x <= w.maxX;
    const inMargin = p.x === w.minX - 1 || p.x === w.maxX + 1;
    check(level, inColumns || inMargin, `el cajón ${at(p)} queda lejos del tablero`);
    if (inColumns) {
      check(level, p.y <= w.minY, `la pila de cajones de ${at(p)} tapa el tablero`);
    }
  }
}

console.log(`Revisando ${LEVELS.length} niveles...\n`);

const seen = new Set();

for (const level of LEVELS) {
  const w = level.world;

  check(level, !seen.has(level.id), 'el id está repetido');
  seen.add(level.id);
  check(level, !!PHASES[level.phase], `la fase "${level.phase}" no existe`);
  check(level, w.minX <= w.maxX && w.minY <= w.maxY, 'el mundo está dado vuelta');
  check(level, inWorld(w, w.start), 'la plataforma arranca fuera del mundo');
  check(level, Array.isArray(w.stops), 'el mundo no tiene paradas');
  check(level, !!level.worker, 'falta decir dónde arranca Tito');
  check(level, Array.isArray(level.platforms), 'faltan los cajones');

  if (w.stops.length) {
    check(level, !same(w.stops[0], w.start), 'la primera parada está debajo de la plataforma: se gana sin jugar');
  }

  checkStory(level);
  checkPlatforms(level);

  /* A one-axis phase must really be one axis, or the "aislá X primero" idea
   * quietly breaks. */
  const axes = new Set(level.palette.map((p) => p.axis));
  if (level.phase === 'T') check(level, !axes.has('y') && w.minY === w.maxY, 'la fase del carro no puede tener eje y');
  if (level.phase === 'A') check(level, !axes.has('x') && w.minX === w.maxX, 'la fase del ascensor no puede tener eje x');
  if (level.phase === 'G') check(level, axes.has('x') && axes.has('y'), 'la fase de la grúa necesita los dos ejes');

  const short = fitsPalette(level);
  check(level, short === null, `la solución no entra en la paleta: ${short}`);

  const program = level.solution.map((m, i) => ({ id: `s${i}`, axis: m.axis, amount: m.amount }));
  const run = Engine.run(program, w);

  check(level, !run.crashed, 'la solución se sale del mundo');
  check(level, run.won, 'la solución no gana el nivel');
  check(level, Engine.starsFor(level, program.length) === 3,
    `la solución usa ${program.length} bloques y tres estrellas piden ${level.stars.three}`);
  check(level, level.stars.three <= level.stars.two, 'el umbral de 3 estrellas es mayor que el de 2');

  console.log(`  ${level.id.padEnd(4)} ${level.title.padEnd(30)} ${program.length} bloques, ${run.steps} pasos, ${w.stops.length} parada(s)`);
}

console.log('');
if (failures) {
  console.log(`${failures} problema(s). No está para dar clase.`);
  process.exit(1);
}
console.log('Todos los niveles pasan.');
