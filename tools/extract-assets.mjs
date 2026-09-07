/* Cuts the game artwork out of the reference sheet ("ChatGPT Image ....png")
 * and writes each piece to assets/ with the white background knocked out.
 *
 * Run once, from the project root:
 *   NODE_PATH=/path/with/node_modules node tools/extract-assets.mjs
 * It only needs the `pngjs` package (npm i pngjs). The generated PNGs are
 * committed with the project, so nobody needs to run this to play.
 *
 * Each crop box is generous on purpose; the real edges are found by trimming
 * to the non-white bounding box. Transparency comes from a flood fill that
 * starts at the crop border and eats near-white pixels, so light pixels
 * INSIDE a sprite (the silver frame, the white worker) survive. Only the
 * one-pixel ring touching the outside gets a soft alpha.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { PNG } = createRequire(import.meta.url)('pngjs');

const root = path.resolve(new URL('..', import.meta.url).pathname);
const src = fs.readdirSync(root).find((f) => /^ChatGPT Image .*\.png$/.test(f));
if (!src) throw new Error('reference sheet not found');
const sheet = PNG.sync.read(fs.readFileSync(path.join(root, src)));
const outDir = path.join(root, 'assets');
fs.mkdirSync(outDir, { recursive: true });

const WHITE_MIN = 243;
const WHITE_SPREAD = 8;

function px(img, x, y) {
  const i = (img.width * y + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}
function isWhite(r, g, b) {
  const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
  return mn >= WHITE_MIN && mx - mn <= WHITE_SPREAD;
}

function crop(img, x0, y0, x1, y1) {
  const out = new PNG({ width: x1 - x0, height: y1 - y0 });
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const [r, g, b, a] = px(img, x, y);
      const o = (out.width * (y - y0) + (x - x0)) * 4;
      out.data[o] = r; out.data[o + 1] = g; out.data[o + 2] = b; out.data[o + 3] = a;
    }
  }
  return out;
}

function trim(img) {
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const [r, g, b] = px(img, x, y);
      if (!isWhite(r, g, b)) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('empty crop');
  return crop(img, minX, minY, maxX + 1, maxY + 1);
}

/* Pads by one transparent pixel so the flood fill can always walk around. */
/* `holes` are extra seed points (in source pixels) for regions that are
 * enclosed by the sprite but should still be see-through. */
function knockout(img, holes) {
  const w = img.width + 2, h = img.height + 2;
  const out = new PNG({ width: w, height: h });
  out.data.fill(255);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const [r, g, b] = px(img, x, y);
      const o = (w * (y + 1) + (x + 1)) * 4;
      out.data[o] = r; out.data[o + 1] = g; out.data[o + 2] = b; out.data[o + 3] = 255;
    }
  }
  const outside = new Uint8Array(w * h);
  const stack = [0];
  outside[0] = 1;
  for (const [hx, hy] of holes || []) {
    const j = w * (hy + 1) + (hx + 1);
    outside[j] = 1;
    stack.push(j);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = w * ny + nx;
      if (outside[j]) continue;
      const [r, g, b] = px(out, nx, ny);
      if (isWhite(r, g, b)) { outside[j] = 1; stack.push(j); }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const j = w * y + x;
      const o = j * 4;
      if (outside[j]) { out.data[o + 3] = 0; continue; }
      let touches = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && outside[w * ny + nx]) touches = true;
      }
      if (touches) {
        const mn = Math.min(out.data[o], out.data[o + 1], out.data[o + 2]);
        out.data[o + 3] = Math.round(Math.max(0, Math.min(1, (255 - mn) / 65)) * 255);
      }
    }
  }
  return crop(out, 1, 1, w - 1, h - 1);
}

function write(name, img) {
  fs.writeFileSync(path.join(outDir, name), PNG.sync.write(img));
  console.log(name.padEnd(18), img.width + 'x' + img.height);
}

/* [name, x0, y0, x1, y1, transparent] — boxes in the 1448x1086 sheet. */
const PIECES = [
  ['bg', 40, 115, 1408, 515, false],
  ['beam.png', 40, 545, 1408, 632, true],
  ['trolley.png', 40, 740, 360, 845, true],
  ['spreader', 385, 635, 650, 985, true],
  ['crate.png', 690, 770, 955, 985, true],
  ['stop.png', 1000, 770, 1230, 985, true],
  ['worker-ref.png', 1280, 770, 1400, 985, true]
];

for (const [name, x0, y0, x1, y1, alpha] of PIECES) {
  const piece = trim(crop(sheet, x0, y0, x1, y1));
  const holes = name === 'spreader' ? [[Math.round(piece.width / 2), Math.round(piece.height * 0.7)]] : [];
  const img = alpha ? knockout(piece, holes) : piece;
  if (name === 'bg') {
    /* The wall meets the floor where the pillars' hazard bases end. Splitting
     * there lets the game put a basement pit under the floor line. */
    const floorY = Math.round(img.height * 0.745);
    write('bg-wall.png', crop(img, 0, 0, img.width, floorY));
    write('bg-floor.png', crop(img, 0, floorY, img.width, img.height));
  } else if (name === 'spreader') {
    /* The cables are drawn by the game (their length changes); only a rope
     * tile is kept so they still look like the sheet. */
    const bodyY = Math.round(img.height * 0.445);
    write('spreader.png', crop(img, 0, bodyY, img.width, img.height));
    write('cable.png', crop(img, 8, 30, 24, 130));
  } else {
    write(name, img);
  }
}

/* The worker's animation sheets, 256x256 per frame, copied as they are. */
const sheets = path.join(root, 'Human Male Model', 'Human Male Model', 'Sections', 'PNG');
for (const [from, to] of [['HMMIdleBare.png', 'worker-idle.png'], ['HMMWalkBare.png', 'worker-walk.png'], ['HMMJumpBare.png', 'worker-jump.png']]) {
  fs.copyFileSync(path.join(sheets, from), path.join(outDir, to));
  console.log(to.padEnd(18), 'copied');
}

/* The worker sprite sheets are 256x256 frames; report where the figure sits
 * inside a frame so the CSS can scale it to a cell without guessing. */
for (const f of ['HMMIdleBare.png', 'HMMWalkBare.png', 'HMMJumpBare.png', 'HMMRunBare.png']) {
  const img = PNG.sync.read(fs.readFileSync(path.join(sheets, f)));
  const n = img.width / 256;
  let minX = 256, minY = 256, maxX = -1, maxY = -1;
  for (let fr = 0; fr < n; fr++) {
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        if (px(img, fr * 256 + x, y)[3] > 0) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
  }
  console.log(f.padEnd(18), n + ' frames, figure bbox x ' + minX + '..' + maxX + ' y ' + minY + '..' + maxY);
}
