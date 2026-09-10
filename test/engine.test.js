// Engine tests. Run: node test/engine.test.js  (no framework, exits non-zero on failure)
'use strict';
var assert = require('node:assert');
var Engine = require('../src/engine.js');
var Presets = require('../src/presets.js');

// --- tiny helpers -----------------------------------------------------------

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function findPreset(name) {
  var p = Presets.filter(function (p) { return p.name === name; })[0];
  assert(p, 'preset missing: ' + name);
  return p;
}

function xy(line) { return line.map(function (c) { return [c.x, c.y]; }); }

function countTiles(grid) {
  var n = 0;
  grid.forEach(function (r) { r.forEach(function (v) { if (v) n++; }); });
  return n;
}

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e.stack || e)); }
}

var classic = findPreset('Classic 4x4');
var cross = findPreset('Cross');
// Diagonal rules are a move-set applied to any layout (see Presets.eightMoves).
var diag = JSON.parse(JSON.stringify(classic));
diag.name = 'Classic 4x4 + diagonal';
diag.moves = Presets.eightMoves();

// --- slideLine ------------------------------------------------------------

test('slideLine [2,2,0,0] -> [4,0,0,0] gained 4', function () {
  var r = Engine.slideLine([2, 2, 0, 0]);
  assert.deepStrictEqual(r.values, [4, 0, 0, 0]);
  assert.strictEqual(r.gained, 4);
  assert.deepStrictEqual(r.mergedIdx, [0]);
});

test('slideLine [2,2,2,2] -> [4,4,0,0]', function () {
  var r = Engine.slideLine([2, 2, 2, 2], classic.merge);
  assert.deepStrictEqual(r.values, [4, 4, 0, 0]);
  assert.strictEqual(r.gained, 8);
  assert.deepStrictEqual(r.mergedIdx, [0, 1]);
});

test('slideLine [4,2,2,0] -> [4,4,0,0]', function () {
  var r = Engine.slideLine([4, 2, 2, 0]);
  assert.deepStrictEqual(r.values, [4, 4, 0, 0]);
  assert.strictEqual(r.gained, 4);
  assert.deepStrictEqual(r.mergedIdx, [1]);
});

test('slideLine [2,0,2,4] -> [4,4,0,0]', function () {
  var r = Engine.slideLine([2, 0, 2, 4]);
  assert.deepStrictEqual(r.values, [4, 4, 0, 0]);
  assert.strictEqual(r.gained, 4);
});

test('slideLine no double merge: [2,2,4] -> [4,4,0], not [8]', function () {
  var r = Engine.slideLine([2, 2, 4]);
  assert.deepStrictEqual(r.values, [4, 4, 0]);
  assert.strictEqual(r.gained, 4);
});

test('slideLine leaves unchanged line alone', function () {
  var r = Engine.slideLine([2, 4, 0, 0]);
  assert.deepStrictEqual(r.values, [2, 4, 0, 0]);
  assert.strictEqual(r.gained, 0);
  assert.deepStrictEqual(r.mergedIdx, []);
});

test('slideLine dest maps input indices to output indices', function () {
  var r = Engine.slideLine([2, 0, 2, 4]);
  assert.strictEqual(r.dest[0], 0);
  assert.strictEqual(r.dest[1], undefined, 'empty input has no dest');
  assert.strictEqual(r.dest[2], 0, 'merge partner shares the merge cell');
  assert.strictEqual(r.dest[3], 1);
  var u = Engine.slideLine([2, 4, 0, 0]);
  assert.strictEqual(u.dest[0], 0);
  assert.strictEqual(u.dest[1], 1);
});

test('slideLine rejects unknown merge rule', function () {
  assert.throws(function () { Engine.slideLine([2, 2], { rule: 'nope' }); });
});

// --- cells / lines --------------------------------------------------------

test('cells() on 4x4 gives 16 cells; Cross gives 21', function () {
  assert.strictEqual(Engine.cells(classic).length, 16);
  assert.strictEqual(Engine.cells(cross).length, 21);
});

test('lines() ordering, 4x4, all four directions', function () {
  var L = Engine.lines(classic, 'left');
  assert.strictEqual(L.length, 4);
  assert.deepStrictEqual(xy(L[0]), [[0, 0], [1, 0], [2, 0], [3, 0]]);

  var R = Engine.lines(classic, 'right');
  assert.strictEqual(R.length, 4);
  var row0 = R.filter(function (l) { return l[0].y === 0; })[0];
  assert.deepStrictEqual(xy(row0), [[3, 0], [2, 0], [1, 0], [0, 0]]);

  var U = Engine.lines(classic, 'up');
  assert.strictEqual(U.length, 4);
  var col0 = U.filter(function (l) { return l[0].x === 0; })[0];
  assert.deepStrictEqual(xy(col0), [[0, 0], [0, 1], [0, 2], [0, 3]]);

  var D = Engine.lines(classic, 'down');
  assert.strictEqual(D.length, 4);
  var col2 = D.filter(function (l) { return l[0].x === 2; })[0];
  assert.deepStrictEqual(xy(col2), [[2, 3], [2, 2], [2, 1], [2, 0]]);

  // every direction covers every cell exactly once
  ['left', 'right', 'up', 'down'].forEach(function (d) {
    var n = 0;
    Engine.lines(classic, d).forEach(function (l) { n += l.length; });
    assert.strictEqual(n, 16, d);
  });
});

test('lines() on Cross: top row has 3 cells, columns 0 and 4 have 3 cells', function () {
  var L = Engine.lines(cross, 'left');
  assert.strictEqual(L.length, 5);
  var top = L.filter(function (l) { return l[0].y === 0; })[0];
  assert.deepStrictEqual(xy(top), [[1, 0], [2, 0], [3, 0]]);

  var U = Engine.lines(cross, 'up');
  assert.strictEqual(U.length, 5);
  var c0 = U.filter(function (l) { return l[0].x === 0; })[0];
  var c4 = U.filter(function (l) { return l[0].x === 4; })[0];
  assert.deepStrictEqual(xy(c0), [[0, 1], [0, 2], [0, 3]]);
  assert.deepStrictEqual(xy(c4), [[4, 1], [4, 2], [4, 3]]);
  var mid = U.filter(function (l) { return l[0].x === 2; })[0];
  assert.strictEqual(mid.length, 5);
});

test('lines(): a hole in the middle of a row splits it into two lines', function () {
  var cfg = {
    name: 'holey', width: 5, height: 1, mask: ['##.##'],
    moves: { left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 } },
    spawn: { initial: 1, count: 1, values: [{ value: 2, weight: 1 }] },
    merge: { rule: 'equal-double' }
  };
  var L = Engine.lines(cfg, 'left');
  assert.strictEqual(L.length, 2);
  assert.deepStrictEqual(xy(L[0]), [[0, 0], [1, 0]]);
  assert.deepStrictEqual(xy(L[1]), [[3, 0], [4, 0]]);
  var R = Engine.lines(cfg, 'right');
  assert.deepStrictEqual(xy(R[0]), [[1, 0], [0, 0]]);
  assert.deepStrictEqual(xy(R[1]), [[4, 0], [3, 0]]);

  // a tile does not cross the hole
  var s = Engine.fromGrid(cfg, [[2, 0, null, 0, 0]]);
  s = Engine.move(s, 'right', function () { return 0; });
  assert.strictEqual(s.grid[0][1], 2);
  assert.strictEqual(s.grid[0][4], 0);
});

test('lines() diagonal on 4x4: 7 lines, corner line has length 1', function () {
  var L = Engine.lines(diag, 'downright');
  assert.strictEqual(L.length, 7);
  var main = L.filter(function (l) { return l.length === 4; });
  assert.strictEqual(main.length, 1);
  assert.deepStrictEqual(xy(main[0]), [[3, 3], [2, 2], [1, 1], [0, 0]]);
  assert.strictEqual(L.filter(function (l) { return l.length === 1; }).length, 2);
});

test('lines() throws on unknown direction', function () {
  assert.throws(function () { Engine.lines(classic, 'sideways'); });
});

// --- newGame ----------------------------------------------------------------

test('newGame places spawn.initial tiles and is reproducible with a seed', function () {
  var a = Engine.newGame(classic, mulberry32(1));
  var b = Engine.newGame(classic, mulberry32(1));
  assert.strictEqual(countTiles(a.grid), 2);
  assert.deepStrictEqual(a.grid, b.grid);
  assert.strictEqual(a.score, 0);
  assert.strictEqual(a.moveCount, 0);
  assert.strictEqual(a.over, false);
  assert.strictEqual(a.won, false);
  assert.strictEqual(a.last.dir, null);
  assert.strictEqual(a.last.moved, false);
  assert.strictEqual(a.last.spawned.length, 2);
  a.grid.forEach(function (row) { row.forEach(function (v) { assert(v === 0 || v === 2 || v === 4); }); });
});

test('newGame on Cross has null holes at the corners', function () {
  var s = Engine.newGame(cross, mulberry32(3));
  assert.strictEqual(s.grid[0][0], null);
  assert.strictEqual(s.grid[0][4], null);
  assert.strictEqual(s.grid[4][0], null);
  assert.strictEqual(s.grid[4][4], null);
  assert.notStrictEqual(s.grid[0][1], null);
});

// --- move -----------------------------------------------------------------

test('move() spawns exactly spawn.count tiles on empty cells when moved', function () {
  var s = Engine.fromGrid(classic, [
    [2, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ]);
  var n = Engine.move(s, 'right', mulberry32(42));
  assert.strictEqual(n.last.moved, true);
  assert.strictEqual(n.last.dir, 'right');
  assert.strictEqual(n.grid[0][3], 2);
  assert.strictEqual(n.last.spawned.length, 1);
  var sp = n.last.spawned[0];
  assert(!(sp.x === 3 && sp.y === 0), 'spawn must not land on the moved tile');
  assert.strictEqual(s.grid[sp.y][sp.x], 0, 'spawned on a previously empty cell');
  assert(n.grid[sp.y][sp.x] === 2 || n.grid[sp.y][sp.x] === 4);
  assert.strictEqual(countTiles(n.grid), 2);
  assert.strictEqual(n.moveCount, 1);
  assert.strictEqual(n.score, 0);
  // original state untouched
  assert.strictEqual(s.grid[0][0], 2);
  assert.strictEqual(countTiles(s.grid), 1);
});

test('move() honours spawn.count > 1 and the value weights', function () {
  var cfg = JSON.parse(JSON.stringify(classic));
  cfg.spawn.count = 2;
  var s = Engine.fromGrid(cfg, [
    [0, 0, 0, 2],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ]);
  // rng always 0.95: 0.95*10 = 9.5 falls in the weight-1 bucket -> value 4
  var n = Engine.move(s, 'left', function () { return 0.95; });
  assert.strictEqual(n.last.spawned.length, 2);
  assert.strictEqual(countTiles(n.grid), 3);
  n.last.spawned.forEach(function (c) { assert.strictEqual(n.grid[c.y][c.x], 4); });
});

test('move() with no change spawns nothing and keeps score/moveCount', function () {
  var s = Engine.fromGrid(classic, [
    [2, 4, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ], { score: 12, moveCount: 3 });
  var n = Engine.move(s, 'left', mulberry32(7));
  assert.strictEqual(n.last.moved, false);
  assert.strictEqual(n.last.dir, 'left');
  assert.deepStrictEqual(n.last.spawned, []);
  assert.deepStrictEqual(n.last.merged, []);
  assert.deepStrictEqual(n.grid, s.grid);
  assert.strictEqual(n.score, 12);
  assert.strictEqual(n.moveCount, 3);
});

test('move() scores merges and reports merged cells', function () {
  var s = Engine.fromGrid(classic, [
    [2, 2, 4, 4],
    [0, 0, 0, 0],
    [8, 0, 8, 0],
    [0, 0, 0, 0]
  ]);
  var n = Engine.move(s, 'left', mulberry32(5));
  assert.strictEqual(n.score, 4 + 8 + 16);
  assert.deepStrictEqual(n.grid[0].slice(0, 3), [4, 8, 0]);
  assert.strictEqual(n.grid[2][0], 16);
  var merged = n.last.merged.map(function (c) { return c.x + ',' + c.y; }).sort();
  assert.deepStrictEqual(merged, ['0,0', '0,2', '1,0']);
});

test('move() throws on unknown direction', function () {
  var s = Engine.newGame(classic, mulberry32(1));
  assert.throws(function () { Engine.move(s, 'upleft'); });
});

// --- last.tiles (animation data) ------------------------------------------

function tileKey(t) { return t.from.x + ',' + t.from.y + '->' + t.to.x + ',' + t.to.y + ':' + t.value; }

test('last.tiles: row [2,0,2,4] moving left reports from/to/value per tile', function () {
  var s = Engine.fromGrid(classic, [
    [2, 0, 2, 4],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ]);
  var n = Engine.move(s, 'left', mulberry32(21));
  assert.strictEqual(n.last.tiles.length, 3, 'one entry per pre-move tile');
  assert.deepStrictEqual(n.last.tiles.map(tileKey).sort(),
    ['0,0->0,0:2', '2,0->0,0:2', '3,0->1,0:4']);
});

test('last.tiles: a tile that does not move has from === to; count equals tiles before move', function () {
  var s = Engine.fromGrid(classic, [
    [2, 0, 0, 0],
    [0, 0, 4, 0],
    [0, 0, 0, 0],
    [8, 0, 0, 16]
  ]);
  var n = Engine.move(s, 'left', mulberry32(22));
  assert.strictEqual(n.last.tiles.length, countTiles(s.grid));
  var t21 = n.last.tiles.filter(function (t) { return t.from.x === 2 && t.from.y === 1; })[0];
  assert.deepStrictEqual(t21.to, { x: 0, y: 1 }, '(2,1) slides to (0,1)');
  assert.strictEqual(t21.value, 4);
  var t00 = n.last.tiles.filter(function (t) { return t.from.x === 0 && t.from.y === 0; })[0];
  assert.deepStrictEqual(t00.to, t00.from);
  assert.strictEqual(t00.value, 2);
  var t03 = n.last.tiles.filter(function (t) { return t.from.x === 0 && t.from.y === 3; })[0];
  assert.deepStrictEqual(t03.to, { x: 0, y: 3 });
  var t33 = n.last.tiles.filter(function (t) { return t.from.x === 3 && t.from.y === 3; })[0];
  assert.deepStrictEqual(t33.to, { x: 1, y: 3 });
  assert.strictEqual(t33.value, 16);
  // spawned tiles are not in the list
  n.last.spawned.forEach(function (sp) {
    assert(!n.last.tiles.some(function (t) { return t.from.x === sp.x && t.from.y === sp.y; }));
  });
});

test('last.tiles is [] on a no-op move and in newGame', function () {
  var s = Engine.fromGrid(classic, [
    [2, 4, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ]);
  var n = Engine.move(s, 'left', mulberry32(23));
  assert.strictEqual(n.last.moved, false);
  assert.deepStrictEqual(n.last.tiles, []);
  assert.deepStrictEqual(Engine.newGame(classic, mulberry32(24)).last.tiles, []);
  assert.deepStrictEqual(s.last.tiles, [], 'fromGrid too');
});

test('last.tiles: diagonal move reports the right destination', function () {
  var s = Engine.fromGrid(diag, [
    [0, 0, 0, 0],
    [0, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 2]
  ]);
  var n = Engine.move(s, 'downright', mulberry32(25));
  assert.strictEqual(n.grid[3][3], 4);
  assert.deepStrictEqual(n.last.tiles.map(tileKey).sort(),
    ['1,1->3,3:2', '3,3->3,3:2']);
});

// --- over / won -----------------------------------------------------------

test('over: full board with no merges', function () {
  var s = Engine.fromGrid(classic, [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2]
  ]);
  assert.strictEqual(s.over, true);
  assert.strictEqual(Engine.canMove(s), false);
  assert.deepStrictEqual(Engine.availableMoves(s), []);
  assert.deepStrictEqual(Engine.emptyCells(s), []);
  assert.strictEqual(Engine.maxTile(s), 4);
});

test('not over: full board with one possible merge; availableMoves is exact', function () {
  var s = Engine.fromGrid(classic, [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 8, 8]
  ]);
  assert.strictEqual(s.over, false);
  assert.deepStrictEqual(Engine.availableMoves(s).sort(), ['left', 'right']);
});

test('over becomes true after the move that fills the board', function () {
  var s = Engine.fromGrid(classic, [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [2, 4, 2, 0]
  ]);
  assert.strictEqual(s.over, false);
  // 'right' slides the last row to [0,2,4,2]; rng 0.95 spawns a 4 in the only
  // empty cell (0,3) -> [4,2,4,2]: fully alternating board, no move possible.
  var n = Engine.move(s, 'right', function () { return 0.95; });
  assert.strictEqual(n.last.moved, true);
  assert.deepStrictEqual(n.grid[3], [4, 2, 4, 2]);
  assert.strictEqual(n.over, true);
  assert.strictEqual(Engine.canMove(n), false);
});

test('won flag set when 2048 appears and persists', function () {
  var s = Engine.fromGrid(classic, [
    [1024, 1024, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ]);
  assert.strictEqual(s.won, false);
  var n = Engine.move(s, 'left', mulberry32(9));
  assert.strictEqual(n.won, true);
  assert.strictEqual(n.grid[0][0], 2048);
  assert.strictEqual(n.score, 2048);
  assert.strictEqual(Engine.maxTile(n), 2048);
  var m = Engine.move(n, 'down', mulberry32(10));
  assert.strictEqual(m.won, true);
});

// --- diagonals ------------------------------------------------------------

test('diagonal move on Classic 4x4 + diagonal slides a tile to the corner', function () {
  var s = Engine.fromGrid(diag, [
    [0, 0, 0, 0],
    [0, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ]);
  var n = Engine.move(s, 'downright', mulberry32(11));
  assert.strictEqual(n.last.moved, true);
  assert.strictEqual(n.grid[3][3], 2);
  assert.strictEqual(countTiles(n.grid), 2, 'moved tile + one spawn');
  assert.strictEqual(n.last.spawned.length, 1);
  assert(!(n.last.spawned[0].x === 3 && n.last.spawned[0].y === 3));

  var t = Engine.fromGrid(diag, [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 2, 0],
    [0, 0, 0, 2]
  ]);
  var u = Engine.move(t, 'upleft', mulberry32(12));
  assert.strictEqual(u.grid[0][0], 4, 'diagonal merge lands in the corner');
  assert.strictEqual(u.score, 4);
  assert.strictEqual(countTiles(u.grid), 2, 'merged tile + one spawn');
  assert(!(u.last.spawned[0].x === 0 && u.last.spawned[0].y === 0));
});

test('diagonal config exposes 8 moves; orthogonal ones behave as classic', function () {
  assert.deepStrictEqual(Object.keys(diag.moves).sort(),
    ['down', 'downleft', 'downright', 'left', 'right', 'up', 'upleft', 'upright']);
  var s = Engine.fromGrid(diag, [[0, 0, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  var n = Engine.move(s, 'left', mulberry32(13));
  assert.strictEqual(n.grid[0][0], 2);
});

// --- presets ----------------------------------------------------------------

test('presets have the expected shapes', function () {
  ['Classic 4x4', '5x5', '4x5', 'Cross'].forEach(findPreset);
  assert.strictEqual(Object.keys(Presets.standardMoves()).length, 4);
  assert.strictEqual(Object.keys(Presets.eightMoves()).length, 8);
  var p45 = findPreset('4x5');
  assert.strictEqual(p45.width, 4);
  assert.strictEqual(p45.height, 5);
  assert.strictEqual(Engine.cells(p45).length, 20);
  assert.strictEqual(Engine.cells(findPreset('5x5')).length, 25);
  Presets.forEach(function (p) {
    assert.strictEqual(p.merge.rule, 'equal-double', p.name);
    assert.strictEqual(p.spawn.initial, 2, p.name);
    Engine.newGame(p, mulberry32(99)); // must not throw
  });
});

// --- summary ----------------------------------------------------------------

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
