/* The interpreter.
 *
 * A program is a plain vertical list of movement blocks. There is no control
 * flow here on purpose: the ONE idea this tool teaches is that a block says
 * "change this axis by this amount, starting from wherever you already are".
 *
 *   { id, axis: 'x' | 'y', amount: <non-zero integer> }
 *
 * Coordinates are the ones a child will meet in Scratch, not screen ones:
 * x grows to the RIGHT, y grows UP. Negative y is the basement, not row 2.
 *
 * The world is a list of ORDERED stops. `picked[i]` says whether stop i is
 * done; the next stop is the first one that is not, and it is the only one the
 * platform can collect.
 *
 * Nothing here animates. It runs the whole program and returns a trace: every
 * event carries a snapshot of the world right after it happened. The UI just
 * walks that list, which is what makes "un pasito" and reset free.
 */
(function (global) {
  'use strict';

  function snapshot(st) {
    return {
      x: st.x,
      y: st.y,
      picked: st.picked.slice(),
      crashed: st.crashed,
      won: st.won
    };
  }

  function inside(world, x, y) {
    return x >= world.minX && x <= world.maxX && y >= world.minY && y <= world.maxY;
  }

  /* Stops are visited in order, and only the NEXT one counts: the platform has
   * to land EXACTLY on it. Passing over it, or over a later stop, does
   * nothing. That is deliberate: if a sweep counted, the number inside the
   * block would stop mattering and the whole point would be lost. */
  function nextStop(st) {
    for (var i = 0; i < st.picked.length; i++) if (!st.picked[i]) return i;
    return -1;
  }

  function stopAt(world, st, x, y) {
    var i = nextStop(st);
    if (i < 0) return -1;
    var s = world.stops[i];
    return s.x === x && s.y === y ? i : -1;
  }

  function allPicked(st) {
    for (var i = 0; i < st.picked.length; i++) if (!st.picked[i]) return false;
    return true;
  }

  function run(program, world) {
    var st = {
      x: world.start.x,
      y: world.start.y,
      picked: world.stops.map(function () { return false; }),
      crashed: false,
      won: false
    };

    var trace = [{ kind: 'start', state: snapshot(st) }];
    var steps = 0;

    /* The platform may start parked on top of the first stop. Nobody expects
     * to win before pressing play, but a level author can do it by accident. */
    var here = stopAt(world, st, st.x, st.y);
    if (here >= 0) {
      st.picked[here] = true;
      if (allPicked(st)) st.won = true;
      trace.push({ kind: 'pick', stop: here, at: { x: st.x, y: st.y }, state: snapshot(st) });
    }

    for (var i = 0; i < program.length && !st.crashed && !st.won; i++) {
      var b = program[i];
      var from = { x: st.x, y: st.y };
      var to = {
        x: st.x + (b.axis === 'x' ? b.amount : 0),
        y: st.y + (b.axis === 'y' ? b.amount : 0)
      };

      /* Each block moves along a single axis, so the path is monotonic and
       * checking the landing cell is enough to catch leaving the world. */
      if (!inside(world, to.x, to.y)) {
        st.crashed = true;
        trace.push({
          kind: 'crash', block: i, axis: b.axis, amount: b.amount,
          from: from, to: to, state: snapshot(st)
        });
        break;
      }

      st.x = to.x;
      st.y = to.y;
      steps += Math.abs(b.amount);
      trace.push({
        kind: 'move', block: i, axis: b.axis, amount: b.amount,
        from: from, to: to, state: snapshot(st)
      });

      var hit = stopAt(world, st, st.x, st.y);
      if (hit >= 0) {
        st.picked[hit] = true;
        if (allPicked(st)) st.won = true;
        trace.push({
          kind: 'pick', block: i, stop: hit, at: { x: st.x, y: st.y },
          state: snapshot(st)
        });
      }
    }

    if (st.won) {
      trace.push({ kind: 'win', state: snapshot(st) });
    } else if (!st.crashed) {
      trace.push({ kind: 'end', state: snapshot(st) });
    }

    return {
      trace: trace,
      won: st.won,
      crashed: st.crashed,
      blocks: program.length,
      steps: steps
    };
  }

  function starsFor(level, blocks) {
    if (blocks <= level.stars.three) return 3;
    if (blocks <= level.stars.two) return 2;
    return 1;
  }

  global.Engine = {
    run: run,
    starsFor: starsFor,
    inside: inside,
    stopAt: stopAt
  };
})(window);
