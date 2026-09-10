/*
 * Phil's 2048 - pure game engine.
 *
 * No DOM access, no globals besides `Engine`. All randomness goes through an
 * injectable rng() that returns a float in [0, 1), so games are reproducible.
 *
 * Grid convention: grid[y][x] is null for a hole (cell not in the mask),
 * 0 for an empty playable cell, otherwise the tile value.
 * States are treated as immutable: move() returns a new state object.
 */
var Engine = (function () {
  'use strict';

  var WIN_TILE = 2048;

  // ---------------------------------------------------------------- config --

  function isPlayable(config, x, y) {
    if (x < 0 || y < 0 || x >= config.width || y >= config.height) return false;
    if (!config.mask) return true;
    return config.mask[y][x] === '#';
  }

  function validateConfig(config) {
    if (!config || !(config.width > 0) || !(config.height > 0)) {
      throw new Error('config needs positive width and height');
    }
    if (config.mask) {
      if (config.mask.length !== config.height) throw new Error('mask must have `height` rows');
      for (var y = 0; y < config.height; y++) {
        if (config.mask[y].length !== config.width) throw new Error('mask row ' + y + ' must have `width` chars');
      }
    }
    if (!config.moves || Object.keys(config.moves).length === 0) throw new Error('config.moves is empty');
    if (!config.spawn || !config.spawn.values || config.spawn.values.length === 0) throw new Error('config.spawn.values is empty');
  }

  function getVector(config, dirName) {
    var v = config.moves && config.moves[dirName];
    if (!v) throw new Error('unknown move: ' + dirName);
    if (v.dx === 0 && v.dy === 0) throw new Error('move ' + dirName + ' has a zero vector');
    return v;
  }

  /** All playable cells as {x, y}, row-major. */
  function cells(config) {
    var out = [];
    for (var y = 0; y < config.height; y++) {
      for (var x = 0; x < config.width; x++) {
        if (isPlayable(config, x, y)) out.push({ x: x, y: y });
      }
    }
    return out;
  }

  // ----------------------------------------------------------------- lines --

  // Cache: config object -> { dirName -> lines }. WeakMap so configs can be GC'd.
  var lineCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  /**
   * Lines for a direction: maximal contiguous runs of playable cells along the
   * vector. Index 0 of each line is the cell tiles slide toward (the far end).
   * A hole splits a run into two lines. Works for any integer vector.
   */
  function lines(config, dirName) {
    var cached = lineCache && lineCache.get(config);
    if (cached && cached[dirName]) return cached[dirName];

    var v = getVector(config, dirName);
    var result = [];
    cells(config).forEach(function (c) {
      // A line starts at a cell whose neighbour *in* the direction is not playable
      // (the destination end); then we walk backwards against the vector.
      if (isPlayable(config, c.x + v.dx, c.y + v.dy)) return;
      var line = [];
      var x = c.x, y = c.y;
      while (isPlayable(config, x, y)) {
        line.push({ x: x, y: y });
        x -= v.dx;
        y -= v.dy;
      }
      result.push(line);
    });

    if (lineCache) {
      if (!cached) { cached = {}; lineCache.set(config, cached); }
      cached[dirName] = result;
    }
    return result;
  }

  // ------------------------------------------------------------- sliding ----

  /**
   * Slide a 1-D line of values toward index 0 (0 = empty).
   * Rule 'equal-double': adjacent equal tiles merge into their sum, each tile
   * merges at most once per move. Returns { values, gained, mergedIdx, dest }.
   * `dest` maps each input index that held a tile to its output index (sparse
   * array: indices of empty inputs are left undefined). Two merging tiles map
   * to the same output index.
   * `mergeRule` may be the config.merge object, a rule string, or undefined.
   */
  function slideLine(values, mergeRule) {
    var rule = (mergeRule && mergeRule.rule) || mergeRule || 'equal-double';
    if (rule !== 'equal-double') throw new Error('unknown merge rule: ' + rule);

    var tiles = [], srcIdx = [];
    values.forEach(function (v, i) { if (v !== 0) { tiles.push(v); srcIdx.push(i); } });
    var out = [], gained = 0, mergedIdx = [], dest = [];
    for (var i = 0; i < tiles.length; i++) {
      if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
        var sum = tiles[i] + tiles[i + 1];
        out.push(sum);
        gained += sum;
        mergedIdx.push(out.length - 1);
        dest[srcIdx[i]] = out.length - 1;
        dest[srcIdx[i + 1]] = out.length - 1;
        i++; // skip the partner: it has merged and cannot merge again
      } else {
        out.push(tiles[i]);
        dest[srcIdx[i]] = out.length - 1;
      }
    }
    while (out.length < values.length) out.push(0);
    return { values: out, gained: gained, mergedIdx: mergedIdx, dest: dest };
  }

  /**
   * Apply a slide to a copy of the grid. Returns { grid, moved, gained, merged, tiles }.
   * `tiles` has one entry { from, to, value } per tile on the board before the
   * move (value = pre-move value, to = destination cell; merging tiles share `to`).
   */
  function slideGrid(config, grid, dirName) {
    var next = grid.map(function (row) { return row.slice(); });
    var moved = false, gained = 0, merged = [], tiles = [];
    lines(config, dirName).forEach(function (line) {
      var before = line.map(function (c) { return grid[c.y][c.x]; });
      var res = slideLine(before, config.merge);
      for (var i = 0; i < line.length; i++) {
        if (res.values[i] !== before[i]) moved = true;
        next[line[i].y][line[i].x] = res.values[i];
        if (before[i] !== 0) {
          var d = line[res.dest[i]];
          tiles.push({ from: { x: line[i].x, y: line[i].y }, to: { x: d.x, y: d.y }, value: before[i] });
        }
      }
      gained += res.gained;
      res.mergedIdx.forEach(function (i) { merged.push({ x: line[i].x, y: line[i].y }); });
    });
    return { grid: next, moved: moved, gained: gained, merged: merged, tiles: tiles };
  }

  // ------------------------------------------------------------- queries ----

  function emptyCellsOfGrid(config, grid) {
    return cells(config).filter(function (c) { return grid[c.y][c.x] === 0; });
  }

  function maxTileOfGrid(grid) {
    var max = 0;
    grid.forEach(function (row) {
      row.forEach(function (v) { if (v !== null && v > max) max = v; });
    });
    return max;
  }

  function availableMovesOfGrid(config, grid) {
    return Object.keys(config.moves).filter(function (dir) {
      return slideGrid(config, grid, dir).moved;
    });
  }

  function emptyCells(state) { return emptyCellsOfGrid(state.config, state.grid); }
  function maxTile(state) { return maxTileOfGrid(state.grid); }
  function availableMoves(state) { return availableMovesOfGrid(state.config, state.grid); }
  function canMove(state) { return availableMoves(state).length > 0; }

  // ------------------------------------------------------------- spawning ---

  function weightedValue(spawnValues, rng) {
    var total = 0;
    spawnValues.forEach(function (e) { total += e.weight; });
    var r = rng() * total;
    for (var i = 0; i < spawnValues.length; i++) {
      r -= spawnValues[i].weight;
      if (r < 0) return spawnValues[i].value;
    }
    return spawnValues[spawnValues.length - 1].value; // rounding guard
  }

  /** Place `count` tiles on empty cells of `grid` in place. Returns the cells used. */
  function spawnTiles(config, grid, count, rng) {
    var empties = emptyCellsOfGrid(config, grid);
    var spawned = [];
    for (var i = 0; i < count && empties.length > 0; i++) {
      var idx = Math.floor(rng() * empties.length);
      var c = empties.splice(idx, 1)[0];
      grid[c.y][c.x] = weightedValue(config.spawn.values, rng);
      spawned.push(c);
    }
    return spawned;
  }

  // ---------------------------------------------------------------- state ---

  function emptyLast() {
    return { dir: null, moved: false, merged: [], spawned: [], tiles: [] };
  }

  function buildState(config, grid, score, moveCount, won, last) {
    return {
      config: config,
      grid: grid,
      score: score,
      moveCount: moveCount,
      over: availableMovesOfGrid(config, grid).length === 0,
      won: won || maxTileOfGrid(grid) >= (config.winTile || WIN_TILE),
      last: last
    };
  }

  /** New state from an explicit grid (useful for tests and for restoring games). */
  function fromGrid(config, grid, extra) {
    validateConfig(config);
    extra = extra || {};
    var copy = grid.map(function (row) { return row.slice(); });
    return buildState(config, copy, extra.score || 0, extra.moveCount || 0, !!extra.won, emptyLast());
  }

  function newGame(config, rng) {
    validateConfig(config);
    rng = rng || Math.random;
    var grid = [];
    for (var y = 0; y < config.height; y++) {
      var row = [];
      for (var x = 0; x < config.width; x++) row.push(isPlayable(config, x, y) ? 0 : null);
      grid.push(row);
    }
    var spawned = spawnTiles(config, grid, config.spawn.initial, rng);
    var last = emptyLast();
    last.spawned = spawned;
    return buildState(config, grid, 0, 0, false, last);
  }

  function move(state, dirName, rng) {
    rng = rng || Math.random;
    var config = state.config;
    getVector(config, dirName); // throws on unknown direction
    var res = slideGrid(config, state.grid, dirName);

    if (!res.moved) {
      return {
        config: config, grid: state.grid, score: state.score, moveCount: state.moveCount,
        over: state.over, won: state.won,
        last: { dir: dirName, moved: false, merged: [], spawned: [], tiles: [] }
      };
    }

    var spawned = spawnTiles(config, res.grid, config.spawn.count, rng);
    var last = { dir: dirName, moved: true, merged: res.merged, spawned: spawned, tiles: res.tiles };
    return buildState(config, res.grid, state.score + res.gained, state.moveCount + 1, state.won, last);
  }

  return {
    WIN_TILE: WIN_TILE,
    newGame: newGame,
    fromGrid: fromGrid,
    move: move,
    canMove: canMove,
    availableMoves: availableMoves,
    cells: cells,
    lines: lines,
    slideLine: slideLine,
    emptyCells: emptyCells,
    maxTile: maxTile
  };
})();

if (typeof module !== 'undefined') module.exports = Engine;
