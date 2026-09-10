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
               q: 'upleft', e: 'upright', z: 'downleft', y: 'downleft', c: 'downright' };  // y: Swiss keyboards swap Y and Z
  var PALETTE_RANKS = 10;   // .t1 .. .t10 (2 .. 1024); above that: dark
  var THEMES = ['classic', 'dark', 'ocean', 'mono'];
  var SLIDE_FALLBACK_MS = 100;  // slide is 80 ms in CSS; finish anyway if transitionend never fires
  var MIN_SWIPE = 20;       // px
  var MIN_COS = 0.5;        // ignore swipes not close to any allowed direction

  function $(id) { return document.getElementById(id); }
  var els = { board: $('board'), score: $('score'), best: $('best'), configname: $('configname'),
              newgame: $('newgame'), undo: $('undo'), overlay: $('overlay'), retry: $('retry'),
              message: $('message'), movepad: $('movepad'), theme: $('theme') };
  // Tile layer: absolutely positioned over the static cells, survives board rebuilds.
  els.tiles = document.createElement('div');
  els.tiles.className = 'tiles';

  var config = null, state = null, wonShown = false, msgTimer = null;
  var history = [];           // previous states, oldest first, at most MAX_UNDO
  var MAX_UNDO = 10;

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
  // Persist the running game (board + undo history) so a reload continues where we left off.
  function snap(st) { return { grid: st.grid, score: st.score, moveCount: st.moveCount, won: st.won }; }
  function saveGame() {
    storeSet('phils2048.game', JSON.stringify({ name: config.name, state: snap(state), history: history.map(snap) }));
  }
  function restoreGame(cfg) {
    var g = null;
    try { g = JSON.parse(storeGet('phils2048.game')); } catch (e) {}
    if (!g || g.name !== cfg.name || !g.state || !g.state.grid) return false;
    var grid = g.state.grid;
    if (grid.length !== cfg.height || grid[0].length !== cfg.width) return false;
    var thaw = function (sn) { return Engine.fromGrid(cfg, sn.grid, { score: sn.score, moveCount: sn.moveCount, won: sn.won }); };
    try {
      var restored = thaw(g.state), hist = (g.history || []).map(thaw);
      startGame(cfg, restored, hist);
      return true;
    } catch (e) { return false; }
  }

  // Start a game with `preset`; `restored`/`hist` optionally continue a saved game.
  function startGame(preset, restored, hist) {
    config = preset;
    state = restored || Engine.newGame(config);
    history = hist || [];
    wonShown = !!state.won;
    hideMessage();
    // Remember the full config so a custom grid survives a reload (panel.js reads it too).
    storeSet('phils2048.lastConfig', JSON.stringify(config));
    els.configname.textContent = config.name;
    var wrap = els.board.parentElement;
    wrap.style.setProperty('--cols', config.width);
    wrap.style.setProperty('--rows', config.height);
    buildMovepad();
    buildBoard();
    layout();
    render(false);
    saveGame();
  }

  function dispatch(dir) {
    if (!state || state.over || !config.moves[dir]) return;
    var next = Engine.move(state, dir);
    if (!next || !next.last || !next.last.moved) return;
    history.push(state);
    if (history.length > MAX_UNDO) history.shift();
    state = next;
    render(true);
    saveGame();
  }

  function undo() {
    if (!history.length) return;
    state = history.pop();
    render(false);
    saveGame();
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

  // Static background: empty cells and transparent holes, plus the tile layer on top.
  function buildBoard() {
    var html = '';
    for (var y = 0; y < config.height; y++) {
      for (var x = 0; x < config.width; x++) {
        var v = state.grid[y][x];
        html += (v === null || v === undefined) ? '<div class="hole"></div>' : '<div class="cell"></div>';
      }
    }
    els.board.innerHTML = html;
    els.board.appendChild(els.tiles);
  }

  function tileHtml(x, y, v, extra) {
    var len = Math.min(String(v).length, 5);
    return '<div class="tile" style="--x:' + x + ';--y:' + y + '">' +
           '<div class="face ' + tileClass(v) + extra + '" data-len="' + len + '">' + esc(v) + '</div></div>';
  }

  // Slide animation: tiles are drawn at their pre-move cells, then moved to their
  // destinations with a CSS transition; the final grid is drawn when it ends.
  var slide = null;   // { timer } while a slide is running

  function cancelSlide() {
    if (slide) { clearTimeout(slide.timer); slide = null; }
    els.tiles.classList.remove('sliding');
  }

  function render(animate) {
    var last = state.last;
    if (animate && last && last.moved && last.tiles && last.tiles.length) startSlide(last.tiles);
    else renderFinal();
  }

  function startSlide(tiles) {
    cancelSlide();   // a slide still running is cut short: its tiles are redrawn at their end cells
    var html = '';
    tiles.forEach(function (t) { html += tileHtml(t.from.x, t.from.y, t.value, ''); });
    els.tiles.innerHTML = html;
    void els.tiles.offsetWidth;   // commit the `from` positions before transitioning
    els.tiles.classList.add('sliding');
    var kids = els.tiles.children;
    tiles.forEach(function (t, i) {
      kids[i].style.setProperty('--x', t.to.x);
      kids[i].style.setProperty('--y', t.to.y);
    });
    slide = { timer: setTimeout(renderFinal, SLIDE_FALLBACK_MS) };
  }
  els.tiles.addEventListener('transitionend', function (e) {
    if (slide && e.target.classList.contains('tile')) renderFinal();
  });

  function renderFinal() {
    cancelSlide();
    var grid = state.grid, last = state.last || {};
    var merged = keySet(last.merged), spawned = keySet(last.spawned);
    var html = '';
    for (var y = 0; y < config.height; y++) {
      for (var x = 0; x < config.width; x++) {
        var v = grid[y][x];
        if (!v) continue;
        var k = x + ',' + y;
        html += tileHtml(x, y, v, (merged[k] ? ' merged' : '') + (spawned[k] ? ' spawned' : ''));
      }
    }
    els.tiles.innerHTML = html;

    if (state.score > best()) storeSet(bestKey(), state.score);
    els.score.textContent = state.score;
    els.best.textContent = best();
    els.overlay.hidden = !state.over;
    els.undo.disabled = history.length === 0;

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

  // ---- themes ---------------------------------------------------------------
  function applyTheme(name) {
    if (THEMES.indexOf(name) < 0) name = THEMES[0];
    document.body.setAttribute('data-theme', name);
    storeSet('phils2048.theme', name);
    els.theme.value = name;
    var meta = document.querySelector('meta[name="theme-color"]');
    var bg = getComputedStyle(document.body).getPropertyValue('--bg').trim();
    if (meta && bg) meta.setAttribute('content', bg);
  }
  els.theme.addEventListener('change', function () {
    applyTheme(els.theme.value);
    els.theme.blur();
  });

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
    if (window.Panel && Panel.isOpen && Panel.isOpen()) return;   // panel owns the keys
    if (e.key === 'Backspace') { e.preventDefault(); undo(); return; }
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
  els.undo.addEventListener('click', undo);
  // "New game" opens the picker panel (panel.js); "Try again" restarts the same config.
  els.newgame.addEventListener('click', function () {
    if (window.Panel) Panel.open(); else startGame(config);
  });
  els.retry.addEventListener('click', function () { startGame(config); });

  // Public API used by panel.js.
  window.startGame = startGame;
  window.currentConfig = function () { return config; };

  // Re-measure after the first paint and after fonts/window settle: some browsers
  // (seen in Safari) report a different board width a moment after the script ran.
  function relayout() { layout(); renderFinal(); }
  window.requestAnimationFrame(function () { window.requestAnimationFrame(relayout); });
  window.addEventListener('load', relayout);
  window.addEventListener('pageshow', relayout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe(els.board);
  else window.addEventListener('resize', layout);

  // ---- boot -----------------------------------------------------------------
  applyTheme(storeGet('phils2048.theme'));
  // Restore the last played config (preset or custom), else the first preset.
  var saved = null;
  try { saved = JSON.parse(storeGet('phils2048.lastConfig')); } catch (e) {}
  var cfg = saved && saved.width && saved.height && saved.moves ? saved : Presets[0];
  if (!restoreGame(cfg)) startGame(cfg);
})();
