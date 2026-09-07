/* Level definitions.
 *
 * Pedagogical order — the whole design is "one axis at a time, then fuse":
 *
 *   Phase T (El Carro)    - only x exists. The trolley runs along the overhead
 *                           beam, so the only thing left to learn is what + and
 *                           - mean.
 *   Phase A (El Ascensor) - only y exists. The platform goes up and down its
 *                           cables, with the basement pit making negative
 *                           numbers physical.
 *   Phase G (La Grúa)     - both axes at once, on a real plane.
 *
 * Coordinates: x grows right, y grows UP. y = 0 is the ground floor and y = -2
 * is two rows down inside the pit.
 *
 * The story: Tito, the warehouse worker, has to be carried around by the crane.
 * Every level is an ORDERED list of stops. The platform must land EXACTLY on
 * the next stop; at a `board` stop Tito walks in from the crate stack next to
 * it, at an `exit` stop he walks out onto `dest`. The level is won when the
 * last stop is done. Only the next stop is lit, so the child always knows
 * where the platform has to go now.
 *
 * There is ONE block per axis and the child writes the number, exactly like
 * Scratch. So a level is never won by tapping more blocks: it is won by
 * getting the number right. That is why the palette counts are tight — they
 * are a budget of *legs of the trip*, not of steps.
 *
 * world.stops: [{ x, y, action: 'board' | 'exit', dest?: { x, y } }], in order.
 * worker:    { aboard: true } or { x, y } — where Tito starts.
 * platforms: cells a person can stand on. Each one is drawn as a crate stack
 *            from the floor up to the row below it. They may sit in the margin
 *            column just outside the playable grid (x = minX - 1 or maxX + 1).
 * palette:   which axes are available and how many blocks of each. { axis, count }
 * stars:     maximum block count for three / two stars.
 * solution:  the intended answer. tools/check-levels.js runs it and demands a
 *            win with three stars, so a level can never drift away from it.
 */
(function (global) {
  'use strict';

  var PHASES = {
    T: {
      key: 'T',
      name: 'El Carro',
      color: 'x',
      intro: {
        title: 'El Carro viaja en X',
        lines: [
          'El carro SOLO corre por el riel de arriba: para la derecha o marcha atrás. Nunca sube ni baja.',
          'Mirá la letra X: tiene los brazos abiertos hacia los costados. X es a los costados.',
          'Si el número es positivo va a la derecha. Si tiene un menos adelante, va marcha atrás.'
        ]
      }
    },
    A: {
      key: 'A',
      name: 'El Ascensor',
      color: 'y',
      intro: {
        title: 'El Ascensor viaja en Y',
        lines: [
          'La plataforma SOLO sube y baja colgada de los cables. Nunca se va para el costado.',
          'Mirá la letra Y: tiene una patita larga para abajo. Y es arriba y abajo.',
          'El número positivo sube hasta el techo. El negativo baja al sótano.'
        ]
      }
    },
    G: {
      key: 'G',
      name: 'La Grúa',
      color: 'xy',
      intro: {
        title: 'La Grúa usa los dos',
        lines: [
          'La grúa primero corre el carro por el riel (X) y después sube o baja la plataforma (Y).',
          'El camino rojo es el viaje en X. El camino azul es el viaje en Y.',
          'Y acordate de siempre: el número son los pasos que da desde donde YA ESTÁ, no el casillero al que va.'
        ]
      }
    }
  };

  function P(axis, count) {
    return { axis: axis, count: count };
  }

  function M(axis, amount) {
    return { axis: axis, amount: amount };
  }

  function C(x, y) {
    return { x: x, y: y };
  }

  /* A stop the platform must reach. `board`: Tito climbs in from the crate
   * next door. `exit`: Tito climbs out onto `dest`. */
  function board(x, y) {
    return { x: x, y: y, action: 'board' };
  }

  function exit(x, y, dest) {
    return { x: x, y: y, action: 'exit', dest: dest };
  }

  var RAIL = { minX: -5, maxX: 5, minY: 1, maxY: 1 };
  var SHAFT = { minX: 0, maxX: 0, minY: -3, maxY: 5 };
  var PLANE = { minX: -3, maxX: 3, minY: -3, maxY: 3 };

  function world(box, start, stops) {
    return {
      minX: box.minX, maxX: box.maxX, minY: box.minY, maxY: box.maxY,
      start: start,
      stops: stops
    };
  }

  var LEVELS = [
    /* ---------------------------------------------------------- Phase T */
    {
      id: 't1',
      phase: 'T',
      title: 'Tito cruza a la derecha',
      hint: 'Tito ya está arriba de la plataforma, en el 0. Se baja en el cajón del 4, así que la plataforma tiene que frenar en el 3, justo al lado. Escribí en el bloque cuántos pasos avanza el carro.',
      world: world(RAIL, C(0, 1), [exit(3, 1, C(4, 1))]),
      worker: { aboard: true },
      platforms: [C(4, 1)],
      palette: [P('x', 2)],
      stars: { three: 1, two: 2 },
      solution: [M('x', 3)]
    },
    {
      id: 't2',
      phase: 'T',
      title: 'Marcha atrás',
      hint: 'Ahora Tito se baja del otro lado, en el cajón del -5. La plataforma tiene que frenar en el -4. Para que el carro vaya marcha atrás, el número lleva un menos adelante.',
      world: world(RAIL, C(0, 1), [exit(-4, 1, C(-5, 1))]),
      worker: { aboard: true },
      platforms: [C(-5, 1)],
      palette: [P('x', 2)],
      stars: { three: 1, two: 2 },
      solution: [M('x', -4)]
    },
    {
      id: 't3',
      phase: 'T',
      title: 'Lo buscamos y lo llevamos',
      hint: 'Tito espera parado en el cajón del 3: la plataforma lo busca frenando en el 2. Después lo lleva hasta el cajón del -4, o sea que frena en el -3. Ojo con el segundo bloque: el carro ya no está en el 0, contá desde el 2.',
      world: world(RAIL, C(0, 1), [board(2, 1), exit(-3, 1, C(-4, 1))]),
      worker: C(3, 1),
      platforms: [C(3, 1), C(-4, 1)],
      palette: [P('x', 3)],
      stars: { three: 2, two: 3 },
      solution: [M('x', 2), M('x', -5)]
    },
    {
      id: 't4',
      phase: 'T',
      title: 'No arrancás en el cero',
      hint: 'Hoy el carro arranca en el -2 y Tito espera en el cajón del 2, así que la plataforma tiene que frenar en el 1. Si escribís 1 no llegás: el número son los pasos que da, no el número del casillero. Después llevalo al cajón del 5.',
      world: world(RAIL, C(-2, 1), [board(1, 1), exit(4, 1, C(5, 1))]),
      worker: C(2, 1),
      platforms: [C(2, 1), C(5, 1)],
      palette: [P('x', 3)],
      stars: { three: 2, two: 3 },
      solution: [M('x', 3), M('x', 3)]
    },

    /* ---------------------------------------------------------- Phase A */
    {
      id: 'a1',
      phase: 'A',
      title: 'Tito sube al tercer piso',
      hint: 'Tito ya está en la plataforma, en la planta baja (el 0). Se baja en el piso 3, donde están los cajones. Escribí cuántos pisos tiene que subir.',
      world: world(SHAFT, C(0, 0), [exit(0, 3, C(1, 3))]),
      worker: { aboard: true },
      platforms: [C(1, 3)],
      palette: [P('y', 2)],
      stars: { three: 1, two: 2 },
      solution: [M('y', 3)]
    },
    {
      id: 'a2',
      phase: 'A',
      title: 'Al sótano',
      hint: 'Tito tiene que bajar al sótano, dos pisos abajo del 0. Bajar es número negativo: escribí cuántos pisos baja la plataforma.',
      world: world(SHAFT, C(0, 0), [exit(0, -2, C(-1, -2))]),
      worker: { aboard: true },
      platforms: [C(-1, -2)],
      palette: [P('y', 2)],
      stars: { three: 1, two: 2 },
      solution: [M('y', -2)]
    },
    {
      id: 'a3',
      phase: 'A',
      title: 'Del piso 2 al sótano',
      hint: 'Tito espera en el piso 2: subí la plataforma hasta ahí para que se suba. Después bajalo al sótano, al -1. Del 2 al -1 hay más pisos de los que parece: contalos.',
      world: world(SHAFT, C(0, 0), [board(0, 2), exit(0, -1, C(1, -1))]),
      worker: C(-1, 2),
      platforms: [C(-1, 2), C(1, -1)],
      palette: [P('y', 3)],
      stars: { three: 2, two: 3 },
      solution: [M('y', 2), M('y', -3)]
    },
    {
      id: 'a4',
      phase: 'A',
      title: 'Arrancás en el subsuelo',
      hint: 'La plataforma quedó abajo de todo, en el -3, y Tito espera en el -1. Del -3 al -1 hay 2 pisos, no 1. Después subilo hasta el piso 2. Fijate bien antes de escribir.',
      world: world(SHAFT, C(0, -3), [board(0, -1), exit(0, 2, C(-1, 2))]),
      worker: C(1, -1),
      platforms: [C(1, -1), C(-1, 2)],
      palette: [P('y', 3)],
      stars: { three: 2, two: 3 },
      solution: [M('y', 2), M('y', 3)]
    },

    /* ---------------------------------------------------------- Phase G */
    {
      id: 'g1',
      phase: 'G',
      title: 'Arriba a la derecha',
      hint: 'Ahora tenés los dos bloques: el carro (x) y la plataforma (y). Tito ya está arriba y se baja en el cajón de la derecha: la plataforma tiene que frenar 3 a la derecha y 2 para arriba.',
      world: world(PLANE, C(0, 0), [exit(3, 2, C(4, 2))]),
      worker: { aboard: true },
      platforms: [C(4, 2)],
      palette: [P('x', 2), P('y', 2)],
      stars: { three: 2, two: 3 },
      solution: [M('x', 3), M('y', 2)]
    },
    {
      id: 'g2',
      phase: 'G',
      title: 'Abajo a la izquierda',
      hint: 'Esta vez Tito se baja abajo a la izquierda, en el sótano. La plataforma frena en el -3 y el -2: los dos números llevan el menos adelante.',
      world: world(PLANE, C(0, 0), [exit(-3, -2, C(-4, -2))]),
      worker: { aboard: true },
      platforms: [C(-4, -2)],
      palette: [P('x', 2), P('y', 2)],
      stars: { three: 2, two: 3 },
      solution: [M('x', -3), M('y', -2)]
    },
    {
      id: 'g3',
      phase: 'G',
      title: 'Del fondo al techo',
      hint: 'La plataforma arrancó en la esquina de abajo a la izquierda, en el -3 y el -3. Tito se baja arriba a la derecha, así que tiene que frenar en el 3 y el 3. Del -3 al 3 no hay 3 pasos: contalos en el tablero.',
      world: world(PLANE, C(-3, -3), [exit(3, 3, C(4, 3))]),
      worker: { aboard: true },
      platforms: [C(4, 3)],
      palette: [P('x', 2), P('y', 2)],
      stars: { three: 2, two: 3 },
      solution: [M('x', 6), M('y', 6)]
    },
    {
      id: 'g4',
      phase: 'G',
      title: 'La grúa completa',
      hint: 'Tito espera arriba a la izquierda: buscalo frenando en el -3 y el 2. Después llevalo hasta el cajón de abajo a la derecha, frenando en el 3 y el -3. Cada bloque cuenta desde donde quedó la plataforma, no desde el centro.',
      world: world(PLANE, C(0, 0), [board(-3, 2), exit(3, -3, C(4, -3))]),
      worker: C(-4, 2),
      platforms: [C(-4, 2), C(4, -3)],
      palette: [P('x', 3), P('y', 3)],
      stars: { three: 4, two: 5 },
      solution: [M('x', -3), M('y', 2), M('x', 6), M('y', -5)]
    }
  ];

  global.PHASES = PHASES;
  global.LEVELS = LEVELS;
})(window);
