/* Phil's 2048 - rendering and input. Depends on globals Engine and Presets. */
(function () {
  'use strict';

  var ARROWS = { up: '↑', down: '↓', left: '←', right: '→',
                 upleft: '↖', upright: '↗', downleft: '↙', downright: '↘' };
  // [column, row] in the 3x3 compass grid
  var COMPASS = { upleft: [1, 1], up: [2, 1], upright: [3, 1], left: [1, 2], right: [3, 2],
                  downleft: [1, 3], down: [2, 3], downright: [3, 3] };
  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
               w: 'up', s: 'down', a: 'left', d: 'right',
               q: 'upleft', e: 'upright', z: 'downleft', c: 'downright' };
  var PALETTE_RANKS = 10;   // .t1 .. .t10 (2 .. 1024); above that: dark
  var MIN_SWIPE = 20;       // px
  var MIN_COS = 0.5;        // ignore swipes not close to any allowed direction

  function $(id) { return document.getElementById(id); }
  var els = { board: $('board'), score: $('score'), best: $('best'), preset: $('preset'),
              newgame: $('newgame'), overlay: $('overlay'), retry: $('retry'),
              message: $('message'), movepad: $('movepad'), config: $('config') };

  var config = null, state = null, wonShown = false, msgTimer = null;

  // ---- storage --------------------------------------------------------------
  function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
  function bestKey() { return 'phils2048.best.' + config.name; }
  function best() { return parseInt(storeGet(bestKey()), 10) || 0; }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---- game -----------------------------------------------------------------
  function startGame(preset) {
    config = preset;
    state = Engine.newGame(config);
    wonShown = false;
    hideMessage();
    var wrap = els.board.parentElement;
    wrap.style.setProperty('--cols', config.width);
    wrap.style.setProperty('--rows', config.height);
    els.config.textContent = JSON.stringify(config, function (k, v) {
      return typeof v === 'function' ? v.toString() : v;
    }, 2);
    buildMovepad();
    layout();
    render();
  }

  function dispatch(dir) {
    if (!state || state.over || !config.moves[dir]) return;
    var next = Engine.move(state, dir);
    if (!next || !next.last || !next.last.moved) return;
    state = next;
    render();
  }

  // ---- rendering ------------------------------------------------------------
  function keySet(list) {
    var s = {};
    (list || []).forEach(function (p) { s[p.x + ',' + p.y] = true; });
    return s;
  }

  function tileClass(v) {
    var rank = Math.round(Math.log(v) / Math.LN2);
    if (rank < 1) rank = 1;
    return rank > PALETTE_RANKS ? 'tdark' : 't' + rank;
  }

  function render() {
    var grid = state.grid, last = state.last || {};
    var merged = keySet(last.merged), spawned = keySet(last.spawned);
    var html = '';
    for (var y = 0; y < config.height; y++) {
      for (var x = 0; x < config.width; x++) {
        var v = grid[y][x];
        if (v === null || v === undefined) { html += '<div class="hole"></div>'; continue; }
        if (!v) { html += '<div class="cell"></div>'; continue; }
        var k = x + ',' + y;
        var cls = 'tile ' + tileClass(v) + (merged[k] ? ' merged' : '') + (spawned[k] ? ' spawned' : '');
        var len = Math.min(String(v).length, 5);
        html += '<div class="cell"><div class="' + cls + '" data-len="' + len + '">' + esc(v) + '</div></div>';
      }
    }
    els.board.innerHTML = html;

    if (state.score > best()) storeSet(bestKey(), state.score);
    els.score.textContent = state.score;
    els.best.textContent = best();
    els.overlay.hidden = !state.over;

    if (state.won && !wonShown) {
      wonShown = true;
      showMessage((config.winTile || Engine.WIN_TILE || 2048) + ' reached, keep going');
    }
  }

  // Cell size drives gap and font size; board width is set by CSS.
  function layout() {
    var w = els.board.clientWidth;
    var cols = config.width;
    if (!w || !cols) return;
    var gap = Math.max(3, Math.min(10, w / (cols * 12)));
    var cell = (w - gap * (cols + 1)) / cols;
    els.board.style.setProperty('--gap', gap + 'px');
    els.board.style.setProperty('--cell', cell + 'px');
  }

  function showMessage(text) {
    clearTimeout(msgTimer);
    els.message.textContent = text;
    els.message.hidden = false;
    msgTimer = setTimeout(hideMessage, 3000);
  }
  function hideMessage() { clearTimeout(msgTimer); els.message.hidden = true; }

  function buildMovepad() {
    var names = Object.keys(config.moves);
    var compass = names.every(function (n) { return COMPASS[n]; });
    els.movepad.className = 'movepad ' + (compass ? 'compass' : 'list');
    els.movepad.innerHTML = names.map(function (n) {
      var pos = compass ? ' style="grid-area:' + COMPASS[n][1] + '/' + COMPASS[n][0] + '"' : '';
      return '<button type="button" data-dir="' + esc(n) + '" title="' + esc(n) + '"' + pos + '>' +
             (ARROWS[n] || esc(n)) + '</button>';
    }).join('');
  }

  // ---- input ----------------------------------------------------------------
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && e.target.tagName === 'SELECT') return;
    var dir = KEYS[e.key] || KEYS[String(e.key).toLowerCase()];
    if (dir && config && config.moves[dir]) { e.preventDefault(); dispatch(dir); }
  });

  // Swipe: pick the allowed move whose {dx,dy} is closest in angle (y grows downwards).
  function closestDir(dx, dy) {
    var len = Math.hypot(dx, dy);
    if (len < MIN_SWIPE) return null;
    var bestName = null, bestCos = MIN_COS;
    Object.keys(config.moves).forEach(function (n) {
      var m = config.moves[n], ml = Math.hypot(m.dx, m.dy);
      if (!ml) return;
      var cos = (dx * m.dx + dy * m.dy) / (len * ml);
      if (cos > bestCos) { bestCos = cos; bestName = n; }
    });
    return bestName;
  }

  var swipe = null;
  els.board.addEventListener('pointerdown', function (e) {
    if (!e.isPrimary) return;
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.preventDefault();
  });
  window.addEventListener('pointerup', function (e) {
    if (!swipe || e.pointerId !== swipe.id) return;
    var dir = closestDir(e.clientX - swipe.x, e.clientY - swipe.y);
    swipe = null;
    if (dir) dispatch(dir);
  });
  window.addEventListener('pointercancel', function () { swipe = null; });

  // Belt and braces for iOS: no scroll/bounce while touching the board, no pinch zoom.
  els.board.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });

  els.movepad.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) dispatch(b.getAttribute('data-dir'));
  });
  els.newgame.addEventListener('click', function () { startGame(config); });
  els.retry.addEventListener('click', function () { startGame(config); });

  els.preset.addEventListener('change', function () {
    var p = Presets[els.preset.value];
    storeSet('phils2048.preset', p.name);
    els.preset.blur();
    startGame(p);
  });

  if (window.ResizeObserver) new ResizeObserver(layout).observe(els.board);
  else window.addEventListener('resize', layout);

  // ---- boot -----------------------------------------------------------------
  Presets.forEach(function (p, i) {
    var o = document.createElement('option');
    o.value = i;
    o.textContent = p.name;
    els.preset.appendChild(o);
  });
  var savedName = storeGet('phils2048.preset');
  var idx = Presets.findIndex(function (p) { return p.name === savedName; });
  els.preset.value = idx >= 0 ? idx : 0;
  startGame(Presets[els.preset.value]);
})();
