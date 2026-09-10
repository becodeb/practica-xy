/* The screen.
 *
 * Everything visible lives here: the warehouse scene, the palette, the work
 * order column, the overlays and the Scratch translator. The interpreter
 * (engine.js) knows nothing about any of it — it hands back a trace and this
 * file walks it, which is why "un pasito", reset and replay cost nothing.
 *
 * The scene is drawn with PNGs from assets/ referenced only through CSS
 * url() and inline styles, so the whole folder still opens from file:// on a
 * pendrive. Every scene element is positioned in pixels by layout(); the
 * browser then animates left/top/height between two layouts.
 */
(function (global) {
  'use strict';

  var doc = global.document;
  function $(id) { return doc.getElementById(id); }

  /* No emoji anywhere: school netbooks and kiosk browsers are missing half of
   * them. The one icon the scene needs beyond the PNGs is drawn inline. */
  var ART = {
    exitSign: '<svg viewBox="0 0 24 24"><rect x="1.5" y="1.5" width="21" height="21" rx="3" fill="#3ddc84"/><path d="M5 5h6v14H5z" fill="#0d3b22"/><path d="M11 12h8M16 9l3 3-3 3" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>'
  };

  var MAX_AMOUNT = 99;

  var STORE = 'grua.v1';

  /* Scene geometry, in cells. The beam band sits above the top row and the
   * floor strip (where the x ruler is painted) below the bottom one. */
  var BEAM_H = 0.6;
  var FLOOR_H = 0.5;
  var CELL_MAX = 120;
  var RULER_W = 36;
  var PAD = 6;

  /* Timeline. Tito walks one cell in WALK_MS; the run waits for him. */
  var WALK_MS = 650;
  var GAP_MS = 150;
  var TROLLEY_RATIO = 84 / 299;
  // Keep the cabin and sprite proportions shared by layout and animation.
  var CABIN_WIDTH = 1.18;
  var CABIN_HEIGHT = 1.22;
  var WORKER_SIZE = 0.86;
  var CABIN_SILL = 0.19;

  /* The two Spanish packs Scratch actually ships, taken from scratch-l10n
   * (editor/blocks/es.json and es-419.json). They do not just differ in one
   * word: in es-419 the axis follows the verb, in es it sits in the middle of
   * the phrase. So these are templates, not a swappable preposition.
   *
   * `set` is the sibling block, and it is here on purpose: "cambiar/sumar" is
   * relative and "fijar/dar el valor" is absolute, and that is exactly the
   * confusion this whole tool exists to prevent. */
  var SCRATCH = {
    latam: {
      label: 'Español Latinoamericano',
      change: 'cambiar %a en %n',
      set: 'fijar %a a %n'
    },
    espana: {
      label: 'Español (España)',
      change: 'sumar a %a %n',
      set: 'dar a %a el valor %n'
    }
  };

  function scratchBlock(kind, axis, num) {
    var pack = SCRATCH[state.wording] || SCRATCH.latam;
    return pack[kind].replace('%a', axis).replace('%n', num);
  }

  var state = {
    index: 0,
    level: null,
    /* The script hanging off the hat, in order. This is the program that runs. */
    program: [],
    /* Blocks dropped anywhere else in the workspace. They are real blocks the
     * child owns and their budget is spent, they simply are not plugged in, so
     * they do not run. Scratch works the same way and children read it fine:
     * if it is not attached to the hat, it does not happen. */
    loose: [],
    drag: null,
    tapAdded: false,
    result: null,
    cursor: 0,
    timer: null,
    geo: null,
    /* Which pack the kids see depends on the school's install, so the
     * translator lets the teacher match it instead of teaching a label the
     * children will never find on screen. */
    wording: 'latam',
    seq: 0
  };

  var saved = { stars: {}, seen: {} };

  function load() {
    try {
      var raw = global.localStorage.getItem(STORE);
      if (raw) {
        var p = JSON.parse(raw);
        saved.stars = p.stars || {};
        saved.seen = p.seen || {};
        /* Older saves held 'en' / 'por', a wording split that does not exist
         * in any Scratch pack. Anything unknown falls back to es-419. */
        if (p.wording && SCRATCH[p.wording]) state.wording = p.wording;
      }
    } catch (e) { /* private mode or no storage: play without progress */ }
  }

  function save() {
    try {
      global.localStorage.setItem(STORE, JSON.stringify({
        stars: saved.stars, seen: saved.seen, wording: state.wording
      }));
    } catch (e) { /* nothing to do, and never worth an error in class */ }
  }

  /* ------------------------------------------------------------ helpers */

  function cols() { var w = state.level.world; return w.maxX - w.minX + 1; }
  function rows() { var w = state.level.world; return w.maxY - w.minY + 1; }

  function usesAxis(axis) {
    return state.level.palette.some(function (p) { return p.axis === axis; });
  }

  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    global.clearTimeout(toast.t);
    toast.t = global.setTimeout(function () { el.hidden = true; }, 3600);
  }

  function starsHtml(n) {
    var out = '';
    for (var i = 0; i < 3; i++) out += '<i class="' + (i < n ? 'on' : '') + '"></i>';
    return out;
  }

  function px(n) { return Math.round(n) + 'px'; }

  function box(el, left, top, width, height) {
    if (!el) return;
    el.style.left = px(left);
    el.style.top = px(top);
    if (width != null) el.style.width = px(width);
    if (height != null) el.style.height = px(height);
  }

  /* ----------------------------------------------------------- geometry */

  /* The scene is cols + 2 columns wide (a margin column each side holds the
   * crate stacks Tito waits on) and sceneRows tall: the playable rows plus
   * headroom above and, when the grid does not reach the ground, the rows
   * down to the floor. Everything is centred inside the board. */
  function computeGeometry() {
    var w = state.level.world;
    var board = $('board');
    var boardW = board.clientWidth;
    var boardH = board.clientHeight;
    var nc = cols(), nr = rows();
    var floorRow = Math.min(w.minY, 0);
    var topRow = w.maxY + (nr === 1 ? 2 : 1);
    var sceneRows = topRow - floorRow + 1;
    var rulerW = nr > 1 ? RULER_W : 0;

    var availW = boardW - 2 * PAD - 2 * rulerW;
    var availH = boardH - 2 * PAD;
    var cell = Math.min(availW / (nc + 2), availH / (sceneRows + BEAM_H + FLOOR_H));
    // Fit all columns on narrow screens instead of clipping the end stops.
    cell = Math.max(1, Math.min(CELL_MAX, cell));

    var H = (BEAM_H + sceneRows + FLOOR_H) * cell;
    var oy = (boardH - H) / 2;
    var ox = (boardW - (nc + 2) * cell) / 2 + cell;

    var g = {
      w: w, boardW: boardW, boardH: boardH, cell: cell,
      cols: nc, rows: nr, floorRow: floorRow, topRow: topRow, sceneRows: sceneRows,
      ox: ox, oy: oy, rulerW: rulerW
    };
    g.cellLeft = function (x) { return ox + (x - w.minX) * cell; };
    g.cellTop = function (y) { return oy + (BEAM_H + (topRow - y)) * cell; };
    g.centerX = function (x) { return g.cellLeft(x) + cell / 2; };
    g.centerY = function (y) { return g.cellTop(y) + cell / 2; };
    g.groundY = g.cellTop(0) + cell;
    g.pitBottom = w.minY < 0 ? g.cellTop(w.minY) + cell : g.groundY;
    g.floorTop = g.cellTop(floorRow) + cell;
    return g;
  }

  /* -------------------------------------------------------------- scene */

  /* Builds the DOM once per level. Nothing here has a position yet; layout()
   * places it and renderWorld() moves the parts that move. */
  function renderBoard() {
    var lv = state.level;
    var w = lv.world;
    var board = $('board');
    var html = '';
    var x, y;

    html += '<div class="bg-wall"></div>';
    if (w.minY < 0) html += '<div class="bg-pit"></div>';
    html += '<div class="bg-floor"></div><div class="ground-line"></div>';

    /* Playable grid: one outlined cell per coordinate. */
    for (y = w.maxY; y >= w.minY; y--) {
      for (x = w.minX; x <= w.maxX; x++) {
        var cls = 'cell';
        if (x === 0 && y === 0) cls += ' is-origin';
        else if (y === 0 && usesAxis('x')) cls += ' is-axis-x';
        else if (x === 0 && usesAxis('y')) cls += ' is-axis-y';
        if (y === 0 && w.minY < 0) cls += ' is-ground';
        html += '<div class="' + cls + '" data-x="' + x + '" data-y="' + y + '"></div>';
      }
    }

    /* Rulers live inside the scene now: x along the painted floor strip, y
     * beside the left margin column. A degenerate axis has no ruler at all. */
    html += '<div id="ruler-x" class="ruler ruler-x" aria-hidden="true"' + (cols() > 1 ? '' : ' hidden') + '>';
    if (cols() > 1) for (x = w.minX; x <= w.maxX; x++) html += '<span class="' + (x === 0 ? 'zero' : '') + '" data-v="' + x + '">' + x + '</span>';
    html += '</div>';
    html += '<div id="ruler-y" class="ruler ruler-y" aria-hidden="true"' + (rows() > 1 ? '' : ' hidden') + '>';
    if (rows() > 1) for (y = w.maxY; y >= w.minY; y--) html += '<span class="' + (y === 0 ? 'zero' : '') + '" data-v="' + y + '">' + y + '</span>';
    html += '</div>';

    /* Crate stacks: from the floor row up to the row under the platform. */
    var floorRow = Math.min(w.minY, 0);
    lv.platforms.forEach(function (p) {
      for (y = floorRow; y < p.y; y++) {
        html += '<div class="crate" data-x="' + p.x + '" data-y="' + y + '"></div>';
      }
    });

    w.stops.forEach(function (s) {
      if (s.action === 'exit') {
        html += '<div class="exit-sign" data-x="' + s.dest.x + '" data-y="' + s.dest.y + '">' + ART.exitSign + '</div>';
      }
    });
    w.stops.forEach(function (s, idx) {
      html += '<div class="stop" data-i="' + idx + '" data-x="' + s.x + '" data-y="' + s.y + '"></div>';
    });

    html += '<svg id="trail"></svg>';
    html += '<div class="beam"></div>';
    html += '<div id="rig" class="rig">' +
      '<div class="trolley"></div>' +
      '<div class="cable cable-l"></div>' +
      '<div class="cable cable-r"></div>' +
      '<div class="spreader"></div>' +
      '</div>';
    html += '<div id="worker" class="worker"></div>';

    board.innerHTML = html;
  }

  /* Places every static element for the current board size. */
  function layout() {
    if (!state.level) return;
    var g = computeGeometry();
    state.geo = g;
    var board = $('board');
    var cell = g.cell;

    board.style.setProperty('--cell', px(cell));
    board.style.setProperty('--fw', px(cell * WORKER_SIZE));

    var wall = board.querySelector('.bg-wall');
    box(wall, 0, 0, g.boardW, g.groundY);
    var pit = board.querySelector('.bg-pit');
    if (pit) box(pit, 0, g.groundY, g.boardW, g.pitBottom - g.groundY);
    box(board.querySelector('.bg-floor'), 0, g.pitBottom, g.boardW, Math.max(0, g.boardH - g.pitBottom));
    box(board.querySelector('.ground-line'), 0, g.groundY - 1.5, g.boardW, 3);

    each('.cell', function (el) { box(el, g.cellLeft(dx(el)), g.cellTop(dy(el)), cell, cell); });
    each('.crate', function (el) { box(el, g.cellLeft(dx(el)), g.cellTop(dy(el)), cell, cell); });

    var sign = 0.35 * cell;
    each('.exit-sign', function (el) {
      box(el, g.cellLeft(dx(el)) + cell - sign - 2, g.cellTop(dy(el)) + 2, sign, sign);
    });

    var stop = 0.92 * cell;
    each('.stop', function (el) {
      box(el, g.centerX(dx(el)) - stop / 2, g.centerY(dy(el)) - stop / 2, stop, stop);
    });

    each('#ruler-x span', function (el) {
      box(el, g.cellLeft(Number(el.dataset.v)), g.floorTop, cell, FLOOR_H * cell);
    });
    each('#ruler-y span', function (el) {
      box(el, g.ox - cell - g.rulerW, g.cellTop(Number(el.dataset.v)), g.rulerW, cell);
    });

    var trail = $('trail');
    trail.setAttribute('width', Math.round(g.boardW));
    trail.setAttribute('height', Math.round(g.boardH));
    trail.setAttribute('viewBox', '0 0 ' + Math.round(g.boardW) + ' ' + Math.round(g.boardH));

    box(board.querySelector('.beam'), 0, g.oy, g.boardW, BEAM_H * cell);

    /* The rig is one column wide and moves as a whole in x; inside it the
     * trolley is fixed to the beam and the spreader slides in y. */
    var rig = $('rig');
    rig.style.top = px(g.oy);
    rig.style.width = px(cell);
    rig.style.height = px(g.boardH - g.oy);

    var tw = 1.4 * cell, th = tw * TROLLEY_RATIO;
    box(rig.querySelector('.trolley'), (cell - tw) / 2, (BEAM_H * cell - th) / 2, tw, th);

    var sw = CABIN_WIDTH * cell, sh = CABIN_HEIGHT * cell;
    var spreader = rig.querySelector('.spreader');
    spreader.style.left = px((cell - sw) / 2);
    spreader.style.width = px(sw);
    spreader.style.height = px(sh);

    var cw = 0.07 * cell;
    var cl = rig.querySelector('.cable-l');
    var cr = rig.querySelector('.cable-r');
    cl.style.left = px((cell - sw) / 2 + 0.10 * sw - cw / 2);
    cr.style.left = px((cell - sw) / 2 + 0.90 * sw - cw / 2);
    cl.style.width = cr.style.width = px(cw);
    cl.style.top = cr.style.top = px((BEAM_H * cell - th) / 2 + th);

    function each(sel, fn) { Array.prototype.forEach.call(board.querySelectorAll(sel), fn); }
    function dx(el) { return Number(el.dataset.x); }
    function dy(el) { return Number(el.dataset.y); }
  }

  /* ------------------------------------------------------ world at cursor */

  function eventsUpTo(cursor) {
    return state.result ? state.result.trace.slice(0, cursor + 1) : [];
  }

  /* Replays the trace prefix to find out where Tito is: still on his crate,
   * riding the platform, or already at his destination. Facing follows his
   * last horizontal displacement, on foot or aboard. */
  function workerStatus(events) {
    var lv = state.level;
    var stops = lv.world.stops;
    var aboard = !!lv.worker.aboard;
    var cell = aboard ? null : { x: lv.worker.x, y: lv.worker.y };
    var left = false;

    events.forEach(function (e) {
      if (e.kind === 'pick') {
        var s = stops[e.stop];
        if (s.action === 'board') {
          if (cell) left = s.x < cell.x;
          aboard = true;
          cell = null;
        } else {
          left = s.dest.x < s.x;
          aboard = false;
          cell = { x: s.dest.x, y: s.dest.y };
        }
      } else if (e.kind === 'move' && e.axis === 'x' && aboard && e.amount !== 0) {
        left = e.amount < 0;
      }
    });
    return { aboard: aboard, cell: cell, left: left };
  }

  /* Pure function of state.cursor. `instant` skips the CSS transitions, for
   * reset, level load, resize and every edit of the program. */
  function renderWorld(instant) {
    if (!state.result || !state.geo) return;
    var g = state.geo;
    var cell = g.cell;
    var board = $('board');
    var events = eventsUpTo(state.cursor);
    var ev = events[events.length - 1];
    var st = ev.state;

    if (instant) board.classList.add('no-anim');

    /* The platform and everything hanging from it. */
    var rig = $('rig');
    rig.style.left = px(g.cellLeft(st.x));
    var sh = CABIN_HEIGHT * cell;
    var spreaderTop = g.cellTop(st.y) + cell - sh - g.oy;
    rig.querySelector('.spreader').style.top = px(spreaderTop);
    var cableTop = parseFloat(rig.querySelector('.cable-l').style.top) || 0;
    var cableH = Math.max(0, spreaderTop - cableTop);
    rig.querySelector('.cable-l').style.height = px(cableH);
    rig.querySelector('.cable-r').style.height = px(cableH);
    rig.classList.toggle('is-crashed', !!st.crashed);

    /* Tito: feet on the spreader's lower bar when aboard, on his cell floor
     * when standing. The frame's feet line is 96.5% down the sprite. */
    var who = workerStatus(events);
    var worker = $('worker');
    var wx = who.aboard ? st.x : who.cell.x;
    var wy = who.aboard ? st.y : who.cell.y;
    var workerSize = Math.round(cell * WORKER_SIZE);
    var feet = g.cellTop(wy) + cell - (who.aboard ? CABIN_SILL * cell : 0);
    worker.style.left = px(g.centerX(wx) - workerSize / 2);
    worker.style.top = px(feet - 0.965 * workerSize);
    worker.classList.toggle('is-left', who.left);
    worker.classList.toggle('is-aboard', who.aboard);

    /* Only the next stop glows. */
    var next = st.picked.indexOf(false);
    Array.prototype.forEach.call(board.querySelectorAll('.stop'), function (el) {
      var i = Number(el.dataset.i);
      el.classList.toggle('is-done', !!st.picked[i]);
      el.classList.toggle('is-next', i === next);
      el.classList.toggle('is-later', !st.picked[i] && i !== next);
    });

    var paths = '';
    events.forEach(function (e) {
      if (e.kind !== 'move') return;
      paths += '<path class="seg-' + e.axis + '" d="M' +
        Math.round(g.centerX(e.from.x)) + ' ' + Math.round(g.centerY(e.from.y)) + ' L' +
        Math.round(g.centerX(e.to.x)) + ' ' + Math.round(g.centerY(e.to.y)) + '"/>';
    });
    $('trail').innerHTML = paths;

    var parts = [];
    if (usesAxis('x')) parts.push('<span class="vx">x = ' + st.x + '</span>');
    if (usesAxis('y')) parts.push('<span class="vy">y = ' + st.y + '</span>');
    $('readout').innerHTML = parts.join(' &nbsp; ');

    var current = ev.kind === 'move' || ev.kind === 'crash' || ev.kind === 'pick' ? ev.block : -1;
    Array.prototype.forEach.call(doc.querySelectorAll('#program .blk'), function (el, i) {
      el.classList.toggle('is-current', i === current && state.cursor > 0);
      el.classList.toggle('is-bad', ev.kind === 'crash' && i === current);
    });

    if (instant) {
      /* Commit the new positions before transitions come back on, or the
       * browser animates from the old ones anyway. */
      void board.offsetWidth;
      board.classList.remove('no-anim');
    }
  }

  /* ------------------------------------------------------------ palette */

  function allBlocks() { return state.program.concat(state.loose); }

  function usedFrom(paletteIndex) {
    return allBlocks().filter(function (b) { return b.from === paletteIndex; }).length;
  }

  /* Where a block lives right now, whichever list that is. */
  function findBlock(id) {
    var i = 0;
    for (i = 0; i < state.program.length; i++) if (state.program[i].id === id) return { list: state.program, i: i, b: state.program[i] };
    for (i = 0; i < state.loose.length; i++) if (state.loose[i].id === id) return { list: state.loose, i: i, b: state.loose[i] };
    return null;
  }

  function renderPalette() {
    var html = '';
    state.level.palette.forEach(function (p, i) {
      var left = p.count - usedFrom(i);
      html += '<div class="pal axis-' + p.axis + '"' + (left <= 0 ? ' data-spent' : '') +
        ' data-pal="' + i + '" role="button" tabindex="0">' +
        '<span class="code">' + scratchBlock('change', p.axis, '<span class="slot"></span>') + '</span>' +
        '<span class="count">' + left + '</span></div>';
    });
    $('palette').innerHTML = html;
  }

  /* ------------------------------------------------------------ program */

  /* The number is a real input, not a picker: it is the same affordance the
   * child will meet in Scratch five minutes later, and typing -4 themselves is
   * the exercise. The -/+ keys are there for the ones who are still slow with
   * the keyboard, and they walk straight through zero into the negatives. */

  /* type="text" and not type="number" on purpose. A number field reports an
   * empty value while "-4" is half typed, so the minus disappears from under
   * the child's fingers, and its touch keypad has no minus key at all on most
   * tablets. Text plus inputmode keeps the numeric keypad and lets the sign
   * survive; onNumInput does the filtering. */
  function blockHtml(b, chainIndex) {
    var at = chainIndex == null ? '' : ' data-i="' + chainIndex + '"';
    var slot = '<input class="num" type="text" inputmode="numeric" maxlength="4"' +
      ' data-id="' + b.id + '"' + at + ' value="' + b.amount + '" aria-label="Cuántos pasos">';
    return '<div class="blk axis-' + b.axis + '" data-id="' + b.id + '"' + at + '>' +
      '<span class="code">' + scratchBlock('change', b.axis, slot) + '</span>' +
      '<button class="step" type="button" data-dial="-1" data-id="' + b.id + '" aria-label="Uno menos">&minus;</button>' +
      '<button class="step" type="button" data-dial="1" data-id="' + b.id + '" aria-label="Uno más">+</button>' +
      '</div>';
  }

  function renderProgram() {
    /* Only the attached chain goes in #program, and in running order: the rest
     * of the app reads that list to light up the block it is executing. */
    $('program').innerHTML = state.program.map(function (b, i) { return blockHtml(b, i); }).join('');

    $('loose').innerHTML = state.loose.map(function (b) { return blockHtml(b, null); }).join('');
    state.loose.forEach(function (b) {
      var el = doc.querySelector('#loose .blk[data-id="' + b.id + '"]');
      if (el) { el.style.left = px(b.x); el.style.top = px(b.y); }
    });

    $('program-empty').hidden = state.program.length > 0 || state.loose.length > 0;
    global.Shapes.paintAll();
  }

  function numField(id) {
    return doc.querySelector('.num[data-id="' + id + '"]');
  }

  /* ------------------------------------------------------------- running */

  function compute() {
    state.result = global.Engine.run(state.program, state.level.world);
    state.cursor = 0;
    renderWorld(true);
  }

  function setPlayLabel(running) {
    $('btn-play').innerHTML = (running ? ART.pause : ART.play) +
      '<span class="label">' + (running ? 'Pausa' : 'Jugar') + '</span>';
  }

  function stopTimer() {
    if (state.timer) { global.clearTimeout(state.timer); state.timer = null; }
    setPlayLabel(false);
  }

  function cueFor(ev) {
    if (ev.kind === 'move') return ev.axis === 'x' ? 'xMove' : (ev.amount > 0 ? 'yUp' : 'yDown');
    if (ev.kind === 'pick') return 'pick';
    if (ev.kind === 'crash') return 'crash';
    if (ev.kind === 'win') return 'win';
    return null;
  }

  /* How long the run pauses on an event. A move takes longer the further it
   * goes, a pick waits for Tito to walk in or out, a win lets him jump. */
  function durationOf(ev) {
    if (ev.kind === 'move') return 160 * Math.abs(ev.amount) + 240;
    if (ev.kind === 'pick') return WALK_MS + 350;
    if (ev.kind === 'crash') return 700;
    if (ev.kind === 'win') return 1300;
    return 0;
  }

  /* CSS transition length for the parts that move on this event. */
  function transitionOf(ev) {
    if (ev.kind === 'move') return durationOf(ev);
    if (ev.kind === 'pick') return WALK_MS;
    return 0;
  }

  var animTimer = null;

  function animateWorker(cls, ms) {
    var worker = $('worker');
    global.clearTimeout(animTimer);
    worker.classList.remove('is-walking', 'is-jumping');
    void worker.offsetWidth;
    worker.classList.add(cls);
    animTimer = global.setTimeout(function () { worker.classList.remove(cls); }, ms);
  }

  function advance() {
    if (!state.result || state.cursor >= state.result.trace.length - 1) {
      stopTimer();
      return false;
    }
    state.cursor++;
    var ev = state.result.trace[state.cursor];
    var cue = cueFor(ev);
    if (cue) global.Sound.play(cue);

    $('board').style.setProperty('--dur', transitionOf(ev) + 'ms');
    renderWorld(false);

    if (ev.kind === 'pick') animateWorker('is-walking', WALK_MS);
    if (ev.kind === 'win') animateWorker('is-jumping', 1100);
    if (ev.kind === 'crash') {
      toast(ev.axis === 'x' ? '¡El carro se salió del riel!' : '¡La plataforma se pasó, no hay más cable!');
    }
    /* Closing the run here, and not on the next tick, is what makes the win
     * card appear when the child walked the program with "un pasito". */
    if (state.cursor >= state.result.trace.length - 1) {
      stopTimer();
      global.setTimeout(finish, ev.kind === 'win' ? durationOf(ev) + 200 : 380);
    }
    return true;
  }

  function finish() {
    if (!state.result || state.cursor < state.result.trace.length - 1) return;
    var last = state.result.trace[state.result.trace.length - 1];
    if (last.kind === 'win') showWin();
    else if (last.kind === 'end') toast('Se acabaron los bloques y todavía falta. Mirá dónde quedó.');
  }

  /* One event, then wait for it to play out, then the next. A chain of
   * timeouts instead of an interval because the events are not the same
   * length: a 6-step move and Tito walking in both need their own time. */
  function tick() {
    state.timer = null;
    if (!advance()) return;
    if (!state.result || state.cursor >= state.result.trace.length - 1) return;
    var ev = state.result.trace[state.cursor];
    state.timer = global.setTimeout(tick, durationOf(ev) + GAP_MS);
  }

  function play() {
    if (!state.program.length) { toast('Todavía no pusiste ningún bloque.'); return; }
    if (state.timer) { stopTimer(); return; }
    if (state.cursor >= state.result.trace.length - 1) { state.cursor = 0; renderWorld(true); }
    setPlayLabel(true);
    tick();
  }

  function stepOnce() {
    if (!state.program.length) { toast('Todavía no pusiste ningún bloque.'); return; }
    stopTimer();
    if (state.cursor >= state.result.trace.length - 1) { state.cursor = 0; renderWorld(true); return; }
    advance();
  }

  function resetRun() {
    stopTimer();
    state.cursor = 0;
    renderWorld(true);
  }

  function clearProgram() {
    stopTimer();
    state.program = [];
    state.loose = [];
    compute();
    renderPalette();
    renderProgram();
    global.Sound.play('remove');
  }

  /* -------------------------------------------------------------- levels */

  function loadLevel(i, skipIntro) {
    stopTimer();
    state.index = Math.max(0, Math.min(i, global.LEVELS.length - 1));
    state.level = global.LEVELS[state.index];
    state.program = [];
    state.loose = [];

    var phase = global.PHASES[state.level.phase];
    $('level-title').textContent = state.level.title;
    $('level-phase').textContent = phase.name;
    $('level-phase').className = 'phase-badge is-' + phase.color;
    /* The clamp has to live on a child: #hint is a flex item of the header and
     * flex blockifies -webkit-box straight into flow-root, which silently kills
     * -webkit-line-clamp. The full text is still one tap away on the speaker. */
    $('hint').innerHTML = '<span></span>';
    $('hint').firstChild.textContent = state.level.hint;
    $('hint').title = state.level.hint;
    $('stars-earned').innerHTML = starsHtml(saved.stars[state.level.id] || 0);

    renderBoard();
    layout();
    renderPalette();
    renderProgram();
    compute();

    if (!skipIntro && !saved.seen[state.level.phase]) {
      saved.seen[state.level.phase] = true;
      save();
      showIntro(state.level.phase);
    }
  }

  /* ------------------------------------------------------------ overlays */

  function closeOverlay() {
    $('overlay').hidden = true;
    $('overlay').innerHTML = '';
  }

  function openOverlay(html) {
    var ov = $('overlay');
    ov.innerHTML = '<div class="card">' + html + '</div>';
    ov.hidden = false;
  }

  function showIntro(phaseKey) {
    var p = global.PHASES[phaseKey];
    openOverlay(
      '<h2>' + p.intro.title + '</h2>' +
      p.intro.lines.map(function (l) { return '<p>' + l + '</p>'; }).join('') +
      '<div class="letter-hint">' +
        '<div class="lx"><b>X</b>los brazos abiertos<br>a los costados</div>' +
        '<div class="ly"><b>Y</b>la patita larga<br>arriba y abajo</div>' +
      '</div>' +
      '<div class="card-actions"><button class="ctrl ctrl-play" type="button" data-close>' + ART.play + '<span class="label">¡Dale!</span></button></div>'
    );
  }

  function showWin() {
    var stars = global.Engine.starsFor(state.level, state.program.length);
    var best = saved.stars[state.level.id] || 0;
    if (stars > best) { saved.stars[state.level.id] = stars; save(); }
    $('stars-earned').innerHTML = starsHtml(saved.stars[state.level.id]);

    var last = state.index >= global.LEVELS.length - 1;
    openOverlay(
      '<h2>¡Lo lograste!</h2>' +
      '<div class="stars" style="justify-content:center;margin:10px 0">' + starsHtml(stars) + '</div>' +
      '<p class="lead">Tito llegó a destino. Usaste ' + state.program.length + ' bloque' + (state.program.length === 1 ? '' : 's') +
      '. Con ' + state.level.stars.three + ' o menos te llevás las 3 estrellas.</p>' +
      '<div class="card-actions">' +
        (last ? '' : '<button class="ctrl ctrl-play" type="button" data-next>' + ART.play + '<span class="label">Siguiente nivel</span></button>') +
        '<button class="ctrl" type="button" data-retry>Probar con menos bloques</button>' +
        '<button class="ctrl" type="button" data-close>Cerrar</button>' +
      '</div>'
    );
  }

  function showLevelMap() {
    var html = '<h2>Elegí el nivel</h2><p class="lead">Nada está bloqueado: la seño elige el orden.</p><div class="level-grid">';
    var currentPhase = null;
    global.LEVELS.forEach(function (lv, i) {
      if (lv.phase !== currentPhase) {
        currentPhase = lv.phase;
        html += '<h3>' + global.PHASES[lv.phase].name + '</h3>';
      }
      html += '<button class="lvl' + (i === state.index ? ' is-current' : '') + '" type="button" data-lvl="' + i + '">' +
        lv.title + '<span class="stars">' + starsHtml(saved.stars[lv.id] || 0) + '</span></button>';
    });
    html += '</div><div class="card-actions"><button class="ctrl" type="button" data-close>Cerrar</button></div>';
    openOverlay(html);
  }

  /* ---------------------------------------------------------- traductora */

  var tr = { x: 0, y: 0 };
  var trWalkTimer = null;

  var TR_MOVES = {
    right: { axis: 'x', amount: 10, say: 'Para ir a la derecha, el carro avanza por el riel:' },
    left: { axis: 'x', amount: -10, say: 'Para ir a la izquierda, el carro va marcha atrás:' },
    up: { axis: 'y', amount: 10, say: 'Para subir, la plataforma sube por los cables:' },
    down: { axis: 'y', amount: -10, say: 'Para bajar, la plataforma baja al sótano:' }
  };

  function showTranslator() {
    tr.x = 0; tr.y = 0;
    openOverlay(
      '<h2>La Traductora de Scratch</h2>' +
      '<p class="lead">Apretá para dónde querés que camine Tito y mirá qué bloque de Scratch es.</p>' +
      '<div class="tr-stage"><div class="tr-worker worker" id="tr-worker" style="--fw:64px"></div></div>' +
      '<div class="pad">' +
        '<button class="up" type="button" data-tr="up">SUBIR</button>' +
        '<button class="left" type="button" data-tr="left">IZQ</button>' +
        '<button class="mid" type="button" data-tr="center">centro</button>' +
        '<button class="right" type="button" data-tr="right">DER</button>' +
        '<button class="down" type="button" data-tr="down">BAJAR</button>' +
      '</div>' +
      '<div class="tr-out" id="tr-out"><p class="tr-say">Tocá una flecha.</p></div>' +
      '<div class="wording">Idioma de Scratch: ' +
        '<button type="button" data-word="latam" class="' + (state.wording === 'latam' ? 'on' : '') + '">' + SCRATCH.latam.label + '</button>' +
        '<button type="button" data-word="espana" class="' + (state.wording === 'espana' ? 'on' : '') + '">' + SCRATCH.espana.label + '</button>' +
      '</div>' +
      '<div class="card-actions"><button class="ctrl" type="button" data-close>Cerrar</button></div>'
    );
  }

  function moveTrWorker(walk) {
    var el = $('tr-worker');
    if (!el) return;
    el.style.marginLeft = (tr.x - 32) + 'px';
    el.style.marginTop = (-tr.y - 32) + 'px';
    global.clearTimeout(trWalkTimer);
    el.classList.toggle('is-walking', !!walk);
    if (walk) trWalkTimer = global.setTimeout(function () { el.classList.remove('is-walking'); }, 320);
  }

  function translate(dir) {
    if (dir === 'center') {
      tr.x = 0; tr.y = 0;
      moveTrWorker(false);
      $('tr-out').innerHTML = '<p class="tr-say">Volviste al centro del escenario.</p>';
      return;
    }
    var m = TR_MOVES[dir];
    if (!m) return;

    /* Deliberately the real Scratch numbers, not the +/-1 of the levels: this
     * screen is the handover, so it has to look exactly like the block they
     * will drag five minutes later. */
    if (m.axis === 'x') tr.x = Math.max(-120, Math.min(120, tr.x + m.amount));
    else tr.y = Math.max(-40, Math.min(40, tr.y + m.amount));

    var el = $('tr-worker');
    if (el && m.axis === 'x') el.classList.toggle('is-left', m.amount < 0);
    moveTrWorker(true);
    global.Sound.play(m.axis === 'x' ? 'xMove' : (m.amount > 0 ? 'yUp' : 'yDown'));

    var here = m.axis === 'x' ? tr.x : tr.y;
    $('tr-out').innerHTML =
      '<p class="tr-say">' + m.say + '</p>' +
      '<span class="scratch-blk axis-' + m.axis + '">' +
        scratchBlock('change', m.axis, '<span class="num">' + m.amount + '</span>') + '</span>' +
      '<p class="tr-warn">No lo confundas con <b>' + scratchBlock('set', m.axis, here) + '</b>: ' +
        'ese lo manda al ' + here + ' de una, no lo mueve ' + Math.abs(m.amount) + '.</p>';
  }

  /* -------------------------------------------------------------- wiring */

  function newBlock(paletteIndex) {
    var p = state.level.palette[paletteIndex];
    if (usedFrom(paletteIndex) >= p.count) { toast('No te quedan más de ese bloque.'); return null; }
    return {
      id: 'b' + (++state.seq),
      axis: p.axis,
      /* Lands as 1, never as the answer. Writing the number is the exercise. */
      amount: 1,
      from: paletteIndex,
      x: 0,
      y: 0
    };
  }

  function refresh() {
    compute();
    renderPalette();
    renderProgram();
  }

  /* Tap-to-add is still here beside the drag: on a cheap classroom tablet a tap
   * always lands, and a child who cannot yet drag must not be locked out. */
  function addBlock(paletteIndex) {
    var b = newBlock(paletteIndex);
    if (!b) return;
    stopTimer();
    state.program.push(b);
    global.Sound.play('place');
    refresh();
  }

  function removeBlock(id) {
    var f = findBlock(id);
    if (!f) return;
    stopTimer();
    f.list.splice(f.i, 1);
    global.Sound.play('remove');
    refresh();
  }

  function clampAmount(n) {
    return Math.max(-MAX_AMOUNT, Math.min(MAX_AMOUNT, n));
  }

  /* Only the one field is touched, never the whole list: a full re-render while
   * a child is typing steals the caret mid-number. */
  function setAmount(id, value, writeBack) {
    var f = findBlock(id);
    if (!f) return;
    stopTimer();
    f.b.amount = clampAmount(value);
    if (writeBack) {
      var field = numField(id);
      if (field && field.value !== String(f.b.amount)) field.value = f.b.amount;
    }
    compute();
  }

  function dialBlock(id, delta) {
    var f = findBlock(id);
    if (!f) return;
    setAmount(id, f.b.amount + delta, true);
    global.Sound.play('place');
  }

  /* An empty box or a lone minus sign is someone halfway through typing "-4".
   * It runs as zero so the board stays honest, but the sign stays on screen. */
  function onNumInput(id, field) {
    var clean = field.value.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, '');
    if (clean !== field.value) field.value = clean;
    var n = parseInt(clean, 10);
    setAmount(id, isNaN(n) ? 0 : n, false);
  }

  /* ------------------------------------------------------------- dragging */

  /* Free drag, the way Blockly and Scratch do it: a block can be picked up from
   * the flyout or from the workspace, dropped anywhere, and it only joins the
   * script when its notch comes close enough to a plug. Anything left lying
   * around stays lying around — that idle block is a child thinking, not an
   * error to clean up for them.
   *
   * A grabbed block travels alone, without the ones under it. Scratch carries
   * the whole tail, but these programs are one to four blocks long and the
   * exercise is moving ONE leg of the trip; carrying the tail would mean a
   * child reaching for the first block walks off with the entire script. */

  var SNAP = 40;      /* how close the notch has to get to a plug */
  var GRABBED = 5;    /* past this many px it is a drag, under it a tap */

  function slotPoints() {
    /* One plug under the hat, then one under every block already in the chain. */
    var box = $('program').getBoundingClientRect();
    var pts = [];
    for (var i = 0; i <= state.program.length; i++) {
      pts.push({ index: i, x: box.left + global.Shapes.plugX(), y: box.top + i * global.Shapes.BODY });
    }
    return pts;
  }

  function nearestSlot(el) {
    var box = el.getBoundingClientRect();
    var nx = box.left + global.Shapes.plugX();
    var ny = box.top;
    var best = null;
    slotPoints().forEach(function (s) {
      var d = Math.hypot(s.x - nx, s.y - ny);
      if (d < SNAP && (!best || d < best.d)) best = { index: s.index, d: d };
    });
    return best ? best.index : null;
  }

  function showMarker(index) {
    var prog = $('program');
    var mark = doc.getElementById('drop-marker');
    if (index == null) { if (mark) mark.remove(); return; }
    if (!mark) {
      mark = doc.createElement('div');
      mark.id = 'drop-marker';
      mark.setAttribute('aria-hidden', 'true');
    }
    /* Out first: while it is in there it counts as a child and shifts every
     * index by one. */
    if (mark.parentNode) mark.remove();
    var at = prog.children[index];
    if (at) prog.insertBefore(mark, at);
    else prog.appendChild(mark);
  }

  function inside(el, cx, cy) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  }

  /* `rect` is measured by the caller, before any re-render: a node that has
   * already been replaced reports all zeros and the block flies off screen. */
  function startDrag(e, block, rect) {
    var layer = $('drag-layer');
    layer.innerHTML = blockHtml(block, null);
    var el = layer.firstChild;
    el.classList.add('is-dragging');
    global.Shapes.paint(el, 'stack');

    state.drag = {
      block: block,
      el: el,
      /* Keep the block under the same spot of the finger that grabbed it. */
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      x0: e.clientX,
      y0: e.clientY,
      moved: false,
      slot: null,
      /* Filled in by onPointerDown: a tap has to put the block back exactly
       * where it came from, not send it to the end of the script. */
      origin: null
    };
    moveDrag(e);
    doc.body.classList.add('is-dragging-block');
    global.Sound.play('place');
  }

  function moveDrag(e) {
    var d = state.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > GRABBED) d.moved = true;
    d.el.style.left = px(e.clientX - d.dx);
    d.el.style.top = px(e.clientY - d.dy);

    d.slot = d.moved ? nearestSlot(d.el) : null;
    d.el.classList.toggle('will-snap', d.slot != null);
    showMarker(d.slot);

    var bin = inside($('btn-clear'), e.clientX, e.clientY) || inside($('palette-col'), e.clientX, e.clientY);
    d.el.classList.toggle('will-drop', bin);
    $('btn-clear').classList.toggle('is-hot', bin);
  }

  function endDrag(e) {
    var d = state.drag;
    if (!d) return;
    /* Measured before the drag layer is emptied out from under it. */
    var w = d.el.offsetWidth;
    state.drag = null;
    showMarker(null);
    $('drag-layer').innerHTML = '';
    doc.body.classList.remove('is-dragging-block');
    $('btn-clear').classList.remove('is-hot');
    stopTimer();

    /* Never moved: this was a tap, not a drag. From the flyout that means
     * "give me one" and it goes to the end of the script. From the workspace it
     * means nothing at all, so the block goes back where it was standing — a
     * child who pokes the middle block must not watch it jump to the bottom. */
    if (!d.moved) {
      var o = d.origin;
      if (o.where === 'palette') { state.program.push(d.block); state.tapAdded = true; global.Sound.play('place'); }
      else if (o.where === 'chain') state.program.splice(o.index, 0, d.block);
      else state.loose.push(d.block);
      refresh();
      return;
    }

    /* Back to the flyout or into the bin: the block is gone and its budget
     * comes back, which is how a child undoes a block without a delete key. */
    if (inside($('btn-clear'), e.clientX, e.clientY) || inside($('palette-col'), e.clientX, e.clientY)) {
      global.Sound.play('remove');
      refresh();
      return;
    }

    if (d.slot != null) {
      state.program.splice(d.slot, 0, d.block);
      global.Sound.play('place');
      refresh();
      return;
    }

    var scroll = $('flow-scroll');
    var box = scroll.getBoundingClientRect();
    if (inside(scroll, e.clientX, e.clientY)) {
      /* Kept whole inside the workspace. A block half off the edge is a block
       * a child cannot grab again, and there is no scrollbar to go find it. */
      var maxX = Math.max(0, scroll.clientWidth - w);
      var maxY = Math.max(0, scroll.clientHeight - global.Shapes.BODY - global.Shapes.NOTCH_D);
      d.block.x = Math.max(0, Math.min(maxX, e.clientX - d.dx - box.left + scroll.scrollLeft));
      d.block.y = Math.max(0, Math.min(maxY, e.clientY - d.dy - box.top + scroll.scrollTop));
      state.loose.push(d.block);
      global.Sound.play('place');
      refresh();
      return;
    }

    /* Dropped off the map entirely — put it back where it was reachable. */
    global.Sound.play('remove');
    refresh();
  }

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    /* The number box and its -/+ keys are controls, not handles. */
    if (e.target.closest('.num, .step')) return;

    var pal = e.target.closest('[data-pal]');
    var blk = e.target.closest('.blk');
    var block = null;
    var rect = null;

    var origin = null;

    if (pal) {
      if (pal.hasAttribute('data-spent')) { toast('No te quedan más de ese bloque.'); return; }
      block = newBlock(Number(pal.dataset.pal));
      rect = pal.getBoundingClientRect();
      origin = { where: 'palette' };
    } else if (blk) {
      var f = findBlock(blk.dataset.id);
      if (!f) return;
      rect = blk.getBoundingClientRect();
      origin = { where: f.list === state.program ? 'chain' : 'loose', index: f.i };
      f.list.splice(f.i, 1);
      block = f.b;
      /* Take it out of the script right away so the blocks under it close the
       * gap while the child is still holding it. That is the feedback that
       * says "this one is in your hand now". */
      compute();
      renderProgram();
    }
    if (!block) return;

    e.preventDefault();
    /* A pointer tap is followed by a click. Clear the marker now so a click
     * arriving from anywhere else is never mistaken for that one. */
    state.tapAdded = false;
    startDrag(e, block, rect);
    state.drag.origin = origin;
    doc.addEventListener('pointermove', moveDrag);
    doc.addEventListener('pointerup', onPointerUp);
    doc.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerUp(e) {
    doc.removeEventListener('pointermove', moveDrag);
    doc.removeEventListener('pointerup', onPointerUp);
    doc.removeEventListener('pointercancel', onPointerUp);
    endDrag(e);
  }

  function onResize() {
    global.Shapes.paintAll();
    if (!state.level) return;
    var board = $('board');
    board.classList.add('no-anim');
    layout();
    renderWorld(true);
    void board.offsetWidth;
    board.classList.remove('no-anim');
  }

  function wire() {
    /* One surface for the flyout and the workspace both, because a block
     * behaves the same wherever it is standing. */
    ['palette', 'flow-area'].forEach(function (id) {
      $(id).addEventListener('pointerdown', onPointerDown);
    });

    /* Assistive tech activates a control with a plain click and never sends a
     * pointer at all, so the flyout has to answer that too. A finger tap fires
     * both, and tapAdded is how the second one knows it already happened. */
    $('palette').addEventListener('click', function (e) {
      var pal = e.target.closest('[data-pal]');
      if (!pal) return;
      if (state.tapAdded) { state.tapAdded = false; return; }
      addBlock(Number(pal.dataset.pal));
    });

    /* The keyboard route for the same thing, so the flyout is not drag-only. */
    $('palette').addEventListener('keydown', function (e) {
      var pal = e.target.closest('[data-pal]');
      if (!pal || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      addBlock(Number(pal.dataset.pal));
    });

    $('flow-area').addEventListener('click', function (e) {
      var dial = e.target.closest('[data-dial]');
      if (dial) dialBlock(dial.dataset.id, Number(dial.dataset.dial));
      /* Tapping the block body does nothing on purpose: the number field is
       * right there and a stray tap must not wipe what they just typed. */
    });

    $('flow-area').addEventListener('input', function (e) {
      var field = e.target.closest('.num');
      if (field) onNumInput(field.dataset.id, field);
    });

    /* Leaving the box empty would otherwise keep showing nothing while the
     * board already moved zero steps. On the way out, show what actually ran. */
    $('flow-area').addEventListener('focusout', function (e) {
      var field = e.target.closest('.num');
      if (!field) return;
      var f = findBlock(field.dataset.id);
      if (f) field.value = f.b.amount;
    });

    $('btn-play').addEventListener('click', play);
    $('btn-step').addEventListener('click', stepOnce);
    $('btn-reset').addEventListener('click', resetRun);
    $('btn-clear').addEventListener('click', clearProgram);
    $('btn-levels').addEventListener('click', showLevelMap);
    $('btn-translate').addEventListener('click', showTranslator);
    $('btn-speak').addEventListener('click', function () { global.Sound.speak(state.level.hint); });

    $('btn-sound').addEventListener('click', function () {
      var on = !global.Sound.isOn();
      global.Sound.setOn(on);
      this.classList.toggle('is-on', on);
    });

    $('overlay').addEventListener('click', function (e) {
      if (e.target === this) { closeOverlay(); return; }
      if (e.target.closest('[data-close]')) { closeOverlay(); return; }
      if (e.target.closest('[data-next]')) { closeOverlay(); loadLevel(state.index + 1); return; }
      if (e.target.closest('[data-retry]')) { closeOverlay(); clearProgram(); return; }
      var lvl = e.target.closest('[data-lvl]');
      if (lvl) { closeOverlay(); loadLevel(Number(lvl.dataset.lvl)); return; }
      var word = e.target.closest('[data-word]');
      if (word && SCRATCH[word.dataset.word]) {
        state.wording = word.dataset.word;
        save();
        renderPalette();
        renderProgram();
        showTranslator();
        return;
      }
      var t = e.target.closest('[data-tr]');
      if (t) translate(t.dataset.tr);
    });

    global.addEventListener('resize', onResize);

    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeOverlay();
    });
  }

  function start() {
    load();
    wire();
    setPlayLabel(false);
    $('btn-sound').classList.toggle('is-on', global.Sound.isOn());
    loadLevel(0);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();

  /* Exposed for tools/ui-smoke.html. */
  global.App = {
    state: state,
    loadLevel: loadLevel,
    addBlock: addBlock,
    dialBlock: dialBlock,
    findBlock: findBlock,
    play: play,
    stepOnce: stepOnce,
    translate: translate,
    showTranslator: showTranslator
  };
})(window);
