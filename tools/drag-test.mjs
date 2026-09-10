/* The drag gate: proves a block can be picked up, dropped loose, snapped into
 * the script, thrown away, and tapped — the things ui-smoke.html cannot reach
 * because a synthetic .click() never produces a pointer event.
 *
 *   NODE_PATH=/path/with/node_modules node tools/drag-test.mjs
 *
 * Same setup as tools/shot.mjs: `npm i playwright` (or playwright-core)
 * somewhere on NODE_PATH, and the system /usr/bin/chromium, so nothing is
 * downloaded. Runs against file://index.html, because opening from the file
 * system is how the app has to work in a classroom.
 *
 * Level 9 is the one used here: it is a La Grúa level, so both axes are in the
 * flyout and there is budget to spare.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
/* Either package drives the system browser; which one is on NODE_PATH depends
 * on the project the modules were borrowed from. */
const { chromium } = (() => {
  try { return require_('playwright'); } catch { return require_('playwright-core'); }
})();

const root = path.resolve(new URL('..', import.meta.url).pathname);
const url = process.argv[2] || 'file://' + path.join(root, 'index.html');

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--disable-gpu', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 820 } });

const errors = [];
page.on('pageerror', e => errors.push(String(e)));

await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => document.querySelector('#overlay [data-close]')?.click());
await page.evaluate(() => App.loadLevel(9, true));
await page.waitForTimeout(300);

let failures = 0;
function is(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FALLA'} ${name}` + (ok ? '' : ` -> ${JSON.stringify(got)}, esperaba ${JSON.stringify(want)}`));
}

const shape = () => page.evaluate(() => ({
  cadena: App.state.program.length,
  sueltos: App.state.loose.length,
  quedan: [...document.querySelectorAll('#palette .count')].map(e => e.textContent)
}));

/* Grabs 30px in and 24px down from the block's corner, so the offset is known
 * and the drop target can be aimed at the notch rather than at the cursor. */
async function drag(selector, to) {
  const box = await page.locator(selector).first().boundingBox();
  await page.mouse.move(box.x + 30, box.y + 24);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(120);
}

await drag('#palette .pal', { x: 600, y: 560 });
is('soltarlo en el vacío lo deja suelto', await shape(), { cadena: 0, sueltos: 1, quedan: ['1', '2'] });

const prog = await page.locator('#program').boundingBox();
await drag('#loose .blk', { x: prog.x + 38, y: prog.y + 26 });
is('acercarlo al sombrero lo encaja', await shape(), { cadena: 1, sueltos: 0, quedan: ['1', '2'] });

await drag('#palette .pal.axis-y', { x: prog.x + 38, y: prog.y + 48 + 26 });
is('el segundo se engancha abajo', await shape(), { cadena: 2, sueltos: 0, quedan: ['1', '1'] });
is('y en ese orden', await page.evaluate(() => App.state.program.map(b => b.axis)), ['x', 'y']);

const bin = await page.locator('#btn-clear').boundingBox();
await drag('#program .blk[data-i="0"]', { x: bin.x + 22, y: bin.y + 22 });
is('al tacho lo borra y devuelve el bloque', await shape(), { cadena: 1, sueltos: 0, quedan: ['2', '1'] });

await page.locator('#palette .pal.axis-x').click();
await page.waitForTimeout(120);
is('un toque simple sigue agregando', await shape(), { cadena: 2, sueltos: 0, quedan: ['1', '1'] });
is('el toque va al final', await page.evaluate(() => App.state.program.map(b => b.axis)), ['y', 'x']);

await page.locator('#program .num[data-i="0"]').fill('-2');
await page.waitForTimeout(80);
is('el número sigue editándose', await page.evaluate(() => App.state.program[0].amount), -2);

if (errors.length) { failures += errors.length; console.log('\nERRORES JS:\n' + errors.join('\n')); }
console.log(failures ? `\n${failures} problema(s).` : '\nTodo el arrastre pasa.');
await browser.close();
process.exit(failures ? 1 : 0);
