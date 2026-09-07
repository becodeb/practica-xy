/* Screenshots of the real app, driven by Playwright over the system Chromium.
 *
 *   NODE_PATH=/path/with/node_modules node tools/shot.mjs <out-dir> [levelIndex...]
 *
 * Needs `npm i playwright` somewhere on NODE_PATH; the browser is the system
 * `/usr/bin/chromium`, so no Playwright browser download is required. Each
 * level is loaded through window.App, the phase intro is dismissed, and one
 * PNG per level is written. With the RUN=1 env var the level's own solution
 * is typed in and played, and a second capture is taken at the end of the run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(new URL('..', import.meta.url).pathname);
const outDir = process.argv[2] || '/tmp/grua-shots';
const only = process.argv.slice(3).map(Number);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });

await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForFunction(() => window.App && window.App.state.level);

const count = await page.evaluate(() => window.LEVELS.length);
const levels = only.length ? only : [...Array(count).keys()];

for (const i of levels) {
  await page.evaluate((i) => {
    localStorage.clear();
    window.App.loadLevel(i, true);
    const ov = document.getElementById('overlay');
    if (!ov.hidden) { ov.hidden = true; ov.innerHTML = ''; }
  }, i);
  await page.waitForTimeout(250);
  const id = await page.evaluate(() => window.App.state.level.id);
  await page.screenshot({ path: path.join(outDir, `${id}.png`) });
  console.log('shot', id);

  if (process.env.RUN) {
    await page.evaluate(() => {
      const lv = window.App.state.level;
      lv.solution.forEach((m) => {
        const pal = lv.palette.findIndex((p) => p.axis === m.axis);
        window.App.addBlock(pal);
      });
      lv.solution.forEach((m, k) => {
        const f = document.querySelector(`#program .num[data-i="${k}"]`);
        f.value = String(m.amount);
        f.dispatchEvent(new Event('input', { bubbles: true }));
      });
      window.App.play();
    });
    const mid = Number(process.env.RUN_MID || 0);
    if (mid) {
      await page.waitForTimeout(mid);
      await page.screenshot({ path: path.join(outDir, `${id}-mid.png`) });
    }
    await page.waitForFunction(() => !document.getElementById('overlay').hidden, null, { timeout: 30000 })
      .catch(() => console.log('  no win overlay for', id));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(outDir, `${id}-end.png`) });
    console.log('shot', id + '-end');
  }
}

await browser.close();
