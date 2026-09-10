/*
 * Phil's 2048 - "New game" panel: pick a preset or design a custom grid.
 * Plain script, depends on globals Presets, window.startGame and window.currentConfig
 * (exposed by ui.js). Defines global `Panel` with open(), close(), isOpen().
 */
var Panel = (function () {
  'use strict';

  var EDITOR_SIZE = 8;            // editor is EDITOR_SIZE x EDITOR_SIZE cells
  var CUSTOM_KEY = 'phils2048.custom';
  var MOVES_KEY = 'phils2048.moves';   // 'normal' | 'diagonal'
  var DIAG_SUFFIX = ' + diagonal';
  var MIN_CELLS = 2;

  // Reuse a preset object so a custom config has exactly the same shape as a preset.
  var BASE = Presets[0];

  function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---- state ---------------------------------------------------------------
  var cells = [];                 // cells[y][x] boolean
  var moveRule = 'normal';        // 'normal' | 'diagonal'; applies to presets and custom grids
  var paint = null;               // { id, value } while dragging over the editor
  var els = {};

  function emptyCells() {
    var c = [];
    for (var y = 0; y < EDITOR_SIZE; y++) {
      c.push([]);
      for (var x = 0; x < EDITOR_SIZE; x++) c[y].push(false);
    }
    return c;
  }

  function loadMoveRule() {
    moveRule = storeGet(MOVES_KEY) === 'diagonal' ? 'diagonal' : 'normal';
  }

  function setMoveRule(rule) {
    moveRule = rule === 'diagonal' ? 'diagonal' : 'normal';
    storeSet(MOVES_KEY, moveRule);
    renderMoveRule();
  }

  function renderMoveRule() {
    Array.prototype.forEach.call(els.moves.children, function (b) {
      var on = b.getAttribute('data-rule') === moveRule;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // Apply the selected move rule to a config: a copy with 8 moves and a
  // " + diagonal" name suffix (so best scores stay separate), or the config as is.
  function withMoveRule(cfg) {
    if (moveRule !== 'diagonal') return cfg;
    var c = clone(cfg);
    c.name = cfg.name + DIAG_SUFFIX;
    c.moves = Presets.eightMoves();
    return c;
  }

  function loadCustom() {
    cells = emptyCells();
    var saved = null;
    try { saved = JSON.parse(storeGet(CUSTOM_KEY)); } catch (e) {}
    if (!saved) { fill4x4(); return; }
    (saved.cells || []).forEach(function (row, y) {
      if (y >= EDITOR_SIZE) return;
      String(row).split('').forEach(function (ch, x) {
        if (x < EDITOR_SIZE) cells[y][x] = ch === '#';
      });
    });
  }

  function saveCustom() {
    storeSet(CUSTOM_KEY, JSON.stringify({
      cells: cells.map(function (row) {
        return row.map(function (on) { return on ? '#' : '.'; }).join('');
      })
    }));
  }

  function fill4x4() {
    cells = emptyCells();
    var o = Math.floor((EDITOR_SIZE - 4) / 2);
    for (var y = o; y < o + 4; y++) for (var x = o; x < o + 4; x++) cells[y][x] = true;
  }

  function countSelected() {
    var n = 0;
    cells.forEach(function (row) { row.forEach(function (on) { if (on) n++; }); });
    return n;
  }

  // Crop the selection to its bounding box and build a config like a preset.
  function buildCustomConfig() {
    var minX = EDITOR_SIZE, minY = EDITOR_SIZE, maxX = -1, maxY = -1;
    for (var y = 0; y < EDITOR_SIZE; y++) for (var x = 0; x < EDITOR_SIZE; x++) {
      if (!cells[y][x]) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (maxX < 0) return null;
    var width = maxX - minX + 1, height = maxY - minY + 1, holes = false, mask = [];
    for (y = minY; y <= maxY; y++) {
      var row = '';
      for (x = minX; x <= maxX; x++) {
        row += cells[y][x] ? '#' : '.';
        if (!cells[y][x]) holes = true;
      }
      mask.push(row);
    }
    return withMoveRule({
      name: 'Custom ' + width + 'x' + height,
      width: width,
      height: height,
      mask: holes ? mask : null,
      moves: Presets.standardMoves(),
      spawn: clone(BASE.spawn),
      merge: clone(BASE.merge)
    });
  }

  // ---- markup --------------------------------------------------------------
  function thumb(p) {
    var html = '<div class="thumb" style="grid-template-columns:repeat(' + p.width + ',1fr)">';
    for (var y = 0; y < p.height; y++) for (var x = 0; x < p.width; x++) {
      var on = !p.mask || p.mask[y][x] === '#';
      html += '<i class="' + (on ? 'on' : 'off') + '"></i>';
    }
    return html + '</div>';
  }

  function build() {
    var root = document.createElement('div');
    root.id = 'panel';
    root.className = 'panel';
    root.hidden = true;
    var html = '<div class="panel-box" role="dialog" aria-label="New game">' +
      '<div class="panel-head"><h2>New game</h2>' +
      '<button type="button" class="panel-close" aria-label="Close">&times;</button></div>' +
      '<div class="moves-row"><span class="moves-label" id="panel-moves-label">Moves:</span>' +
        '<div class="seg moves-seg" id="panel-moves" role="group" aria-labelledby="panel-moves-label">' +
          '<button type="button" class="pbtn" data-rule="normal">Normal</button>' +
          '<button type="button" class="pbtn" data-rule="diagonal">Normal + diagonal</button>' +
        '</div></div>' +
      '<div class="cards">';
    Presets.forEach(function (p, i) {
      html += '<button type="button" class="card" data-preset="' + i + '">' + thumb(p) +
              '<span class="card-name">' + esc(p.name) + '</span></button>';
    });
    html += '<button type="button" class="card card-custom" id="panel-custom-toggle">' +
            '<span class="thumb custom-icon">&#9998;</span><span class="card-name">Custom</span></button>' +
            '</div>' +
      '<div class="editor" id="panel-editor" hidden>' +
        '<p class="editor-hint">Tap or drag to select cells. Empty rows and columns around the selection are trimmed.</p>' +
        '<div class="editor-grid" id="panel-grid" style="grid-template-columns:repeat(' + EDITOR_SIZE + ',1fr)"></div>' +
        '<div class="editor-row">' +
          '<button type="button" class="pbtn" id="panel-clear">Clear</button>' +
          '<button type="button" class="pbtn" id="panel-fill">Fill 4x4</button>' +
        '</div>' +
        '<button type="button" class="pbtn start" id="panel-start">Start</button>' +
      '</div>' +
    '</div>';
    root.innerHTML = html;
    document.body.appendChild(root);

    els.root = root;
    els.box = root.querySelector('.panel-box');
    els.editor = root.querySelector('#panel-editor');
    els.toggle = root.querySelector('#panel-custom-toggle');
    els.grid = root.querySelector('#panel-grid');
    els.start = root.querySelector('#panel-start');
    els.moves = root.querySelector('#panel-moves');

    var g = '';
    for (var y = 0; y < EDITOR_SIZE; y++) for (var x = 0; x < EDITOR_SIZE; x++) {
      g += '<div class="ecell" data-x="' + x + '" data-y="' + y + '"></div>';
    }
    els.grid.innerHTML = g;

    // Close: X button or tap on the dimmed backdrop.
    root.querySelector('.panel-close').addEventListener('click', close);
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) close(); });

    root.addEventListener('click', function (e) {
      var card = e.target.closest('.card[data-preset]');
      if (card) { window.startGame(withMoveRule(Presets[card.getAttribute('data-preset')])); close(); }
    });
    els.toggle.addEventListener('click', function () {
      els.editor.hidden = !els.editor.hidden;
      els.toggle.classList.toggle('active', !els.editor.hidden);
      if (!els.editor.hidden) els.editor.scrollIntoView({ block: 'nearest' });
    });

    root.querySelector('#panel-clear').addEventListener('click', function () { cells = emptyCells(); renderEditor(); });
    root.querySelector('#panel-fill').addEventListener('click', function () { fill4x4(); renderEditor(); });
    els.moves.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-rule]');
      if (b) setMoveRule(b.getAttribute('data-rule'));
    });
    els.start.addEventListener('click', function () {
      var cfg = buildCustomConfig();
      if (!cfg || countSelected() < MIN_CELLS) return;
      saveCustom();
      window.startGame(cfg);
      close();
    });

    // Painting: pointer down sets the paint value (opposite of the first cell), drag applies it.
    els.grid.addEventListener('pointerdown', function (e) {
      var c = cellAt(e);
      if (!c) return;
      e.preventDefault();
      paint = { id: e.pointerId, value: !cells[c.y][c.x] };
      setCell(c, paint.value);
    });
    els.grid.addEventListener('pointermove', function (e) {
      if (!paint || e.pointerId !== paint.id) return;
      var c = cellAt(e);
      if (c) setCell(c, paint.value);
    });
    function endPaint(e) { if (paint && e.pointerId === paint.id) { paint = null; saveCustom(); } }
    window.addEventListener('pointerup', endPaint);
    window.addEventListener('pointercancel', endPaint);
  }

  function cellAt(e) {
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || !el.classList.contains('ecell') || !els.grid.contains(el)) return null;
    return { x: +el.getAttribute('data-x'), y: +el.getAttribute('data-y') };
  }

  function setCell(c, value) {
    if (cells[c.y][c.x] === value) return;
    cells[c.y][c.x] = value;
    renderEditor();
  }

  function renderEditor() {
    var kids = els.grid.children;
    for (var y = 0; y < EDITOR_SIZE; y++) for (var x = 0; x < EDITOR_SIZE; x++) {
      kids[y * EDITOR_SIZE + x].classList.toggle('on', cells[y][x]);
    }
    var n = countSelected();
    els.start.disabled = n < MIN_CELLS;
    els.start.textContent = n < MIN_CELLS ? 'Start (select at least ' + MIN_CELLS + ' cells)' : 'Start';
  }

  // ---- API -----------------------------------------------------------------
  function isOpen() { return !!els.root && !els.root.hidden; }

  function open() {
    if (!els.root) build();
    loadMoveRule();
    renderMoveRule();
    loadCustom();
    renderEditor();
    // Open straight into the editor when a custom game is running.
    var cur = window.currentConfig && window.currentConfig();
    var custom = !!(cur && /^Custom /.test(cur.name));
    els.editor.hidden = !custom;
    els.toggle.classList.toggle('active', custom);
    els.root.hidden = false;
    els.box.scrollTop = 0;
  }

  function close() {
    if (!els.root) return;
    paint = null;
    saveCustom();
    els.root.hidden = true;
  }

  return { open: open, close: close, isOpen: isOpen, EDITOR_SIZE: EDITOR_SIZE };
})();
