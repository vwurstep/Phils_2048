/*
 * Named configurations for Phil's 2048. Plain script: defines global `Presets`.
 * Does not depend on engine.js.
 */
var Presets = (function () {
  'use strict';

  /** The four orthogonal moves. */
  function standardMoves() {
    return {
      up: { dx: 0, dy: -1 },
      down: { dx: 0, dy: 1 },
      left: { dx: -1, dy: 0 },
      right: { dx: 1, dy: 0 }
    };
  }

  /** Orthogonal plus the four diagonals. */
  function eightMoves() {
    var m = standardMoves();
    m.upleft = { dx: -1, dy: -1 };
    m.upright = { dx: 1, dy: -1 };
    m.downleft = { dx: -1, dy: 1 };
    m.downright = { dx: 1, dy: 1 };
    return m;
  }

  /** Classic spawn statistics: 90% 2, 10% 4. */
  function standardSpawn(initial, count) {
    return {
      initial: initial === undefined ? 2 : initial,
      count: count === undefined ? 1 : count,
      values: [{ value: 2, weight: 9 }, { value: 4, weight: 1 }]
    };
  }

  /** Build a preset; `opts` overrides the defaults. */
  function preset(name, width, height, opts) {
    var p = {
      name: name,
      width: width,
      height: height,
      mask: null,
      moves: standardMoves(),
      spawn: standardSpawn(),
      merge: { rule: 'equal-double' }
    };
    if (opts) Object.keys(opts).forEach(function (k) { p[k] = opts[k]; });
    return p;
  }

  return [
    preset('Classic 4x4', 4, 4),
    preset('5x5', 5, 5),
    preset('4x5', 4, 5),
    preset('Cross', 5, 5, {
      mask: [
        '.###.',
        '#####',
        '#####',
        '#####',
        '.###.'
      ]
    }),
    preset('Classic + diagonals', 4, 4, { moves: eightMoves() })
  ];
})();

if (typeof module !== 'undefined') module.exports = Presets;
