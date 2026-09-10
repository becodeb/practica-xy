/* Block silhouettes.
 *
 * A Scratch block is not a card, it is a piece of a jigsaw: the notch on top
 * says "something belongs above me" and the tab underneath says "I continue".
 * That shape is the only thing on screen telling a child which blocks can join,
 * so it has to be a real outline and not a rounded rectangle with a bump glued
 * to it.
 *
 * The notch below is the actual scratch-blocks curve, kept to the letter so a
 * child who opens Scratch after this game meets the same silhouette. It runs
 * 36px across and 8px deep:
 *
 *      ___________
 *   __/           \__      <- cut INTO the top edge
 *
 * Blocks in a stack sit exactly BODY apart, so each tab drops into the hole of
 * the block below and the two edges disappear into one another.
 */
(function (global) {
  'use strict';

  var NOTCH_X = 16;   /* left edge -> where the notch starts */
  var NOTCH_W = 36;   /* how far the notch runs across */
  var NOTCH_D = 8;    /* how deep it bites */
  var R = 6;          /* corner radius */
  var BODY = 48;      /* every stack block is this tall */
  var HAT = 22;       /* the dome on top of "al ejecutar" */
  var DOME_W = 92;    /* how far the dome runs before the top goes flat */

  /* Traversed left to right, biting downwards. */
  var NOTCH_LTR =
    'c 2,0 3,1 4,2 l 4,4 c 1,1 2,2 4,2 h 12 c 2,0 3,-1 4,-2 l 4,-4 c 1,-1 2,-2 4,-2';

  /* Traversed right to left, bulging downwards: the same curve mirrored, which
   * is why a tab and a notch are the same 36x8 and always fit. */
  var TAB_RTL =
    'c -2,0 -3,1 -4,2 l -4,4 c -1,1 -2,2 -4,2 h -12 c -2,0 -3,-1 -4,-2 l -4,-4 c -1,-1 -2,-2 -4,-2';

  function arc(x, y) { return 'a ' + R + ',' + R + ' 0 0 1 ' + x + ',' + y; }

  /* A stack block: notch above, tab below. */
  function stack(w) {
    return [
      'M 0,' + R,
      arc(R, -R),
      'H ' + NOTCH_X,
      NOTCH_LTR,
      'H ' + (w - R),
      arc(R, R),
      'V ' + (BODY - R),
      arc(-R, R),
      'H ' + (NOTCH_X + NOTCH_W),
      TAB_RTL,
      'H ' + R,
      arc(-R, -R),
      'Z'
    ].join(' ');
  }

  /* The hat: no notch, because nothing may sit above the start of a program.
   * The dome is what says so without a word of explanation. */
  function hat(w) {
    var h = HAT + BODY;
    return [
      'M 0,' + HAT,
      'c ' + (DOME_W * 0.24) + ',' + (-HAT - 6) + ' ' + (DOME_W * 0.76) + ',' + (-HAT - 6) + ' ' + DOME_W + ',0',
      'H ' + (w - R),
      arc(R, R),
      'V ' + (h - R),
      arc(-R, R),
      'H ' + (NOTCH_X + NOTCH_W),
      TAB_RTL,
      'H ' + R,
      arc(-R, -R),
      'Z'
    ].join(' ');
  }

  /* Where the next block's notch has to land for the two to interlock. */
  function plugX() { return NOTCH_X + NOTCH_W / 2; }

  /* Draws the outline into `el`, sized to whatever the content made it.
   * The svg overflows downwards by NOTCH_D so the tab can stick out. */
  function paint(el, kind) {
    var w = Math.max(el.offsetWidth, kind === 'hat' ? DOME_W + R + 8 : NOTCH_X + NOTCH_W + R + 8);
    var h = (kind === 'hat' ? HAT + BODY : BODY) + NOTCH_D;
    var svg = el.querySelector('.shape');
    if (!svg) {
      svg = global.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'shape');
      svg.setAttribute('aria-hidden', 'true');
      svg.appendChild(global.document.createElementNS('http://www.w3.org/2000/svg', 'path'));
      el.insertBefore(svg, el.firstChild);
    }
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.firstChild.setAttribute('d', kind === 'hat' ? hat(w) : stack(w));
  }

  /* Every block on screen, repainted after the DOM settled its widths. */
  function paintAll(root) {
    var doc = global.document;
    Array.prototype.forEach.call((root || doc).querySelectorAll('.hat'), function (el) { paint(el, 'hat'); });
    Array.prototype.forEach.call((root || doc).querySelectorAll('.pal, .blk'), function (el) { paint(el, 'stack'); });
  }

  global.Shapes = {
    NOTCH_X: NOTCH_X,
    NOTCH_W: NOTCH_W,
    NOTCH_D: NOTCH_D,
    BODY: BODY,
    HAT: HAT,
    plugX: plugX,
    paint: paint,
    paintAll: paintAll
  };
})(window);
