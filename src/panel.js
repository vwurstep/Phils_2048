/*
 * Phil's 2048 - "New game" panel: pick a preset or design a custom grid.
 * Plain script, depends on globals Presets, window.startGame and window.currentConfig
 * (exposed by ui.js). Defines global `Panel` with open(), close(), isOpen().
 */
var Panel = (function () {
  'use strict';

  var EDITOR_SIZE = 8;            // editor is EDITOR_SIZE x EDITOR_SIZE cells
  var CUSTOM_KEY = 'phils2048.custom';
  var CUSTOMS_KEY = 'phils2048.customs';        // JSON array of played custom grids (base configs)
  var COUNTER_KEY = 'phils2048.customCounter';  // running number for unique custom names
  var BEST_PREFIX = 'phils2048.best.';
  var MOVES_KEY = 'phils2048.moves';   // 'normal' | 'diagonal'
  var DIAG_SUFFIX = ' + diagonal';
  var MIN_CELLS = 2;

  // Reuse a preset object so a custom config has exactly the same shape as a preset.
  var BASE = Presets[0];

  function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
  function storeDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---- state ---------------------------------------------------------------
  var cells = [];                 // cells[y][x] boolean
  var customs = [];               // saved custom grids, newest first (see CUSTOMS_KEY)
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

  // Crop the selection to its bounding box and build a base config like a preset
  // (standard moves, no name yet; registerCustom() names it, withMoveRule() applies the toggle).
  function buildCustomBase() {
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
    return {
      name: '',
      width: width,
      height: height,
      mask: holes ? mask : null,
      moves: Presets.standardMoves(),
      spawn: clone(BASE.spawn),
      merge: clone(BASE.merge)
    };
  }

  // ---- saved custom grids --------------------------------------------------
  function loadCustoms() {
    customs = [];
    var saved = null;
    try { saved = JSON.parse(storeGet(CUSTOMS_KEY)); } catch (e) {}
    if (Array.isArray(saved)) {
      customs = saved.filter(function (c) { return c && c.name && c.width && c.height; });
    }
  }

  function saveCustoms() { storeSet(CUSTOMS_KEY, JSON.stringify(customs)); }

  function sameShape(a, b) {
    return a.width === b.width && a.height === b.height &&
           JSON.stringify(a.mask || null) === JSON.stringify(b.mask || null);
  }

  // Return the saved entry for this shape, creating a uniquely named one if needed.
  function registerCustom(base) {
    for (var i = 0; i < customs.length; i++) if (sameShape(customs[i], base)) return customs[i];
    var n = (parseInt(storeGet(COUNTER_KEY), 10) || 0) + 1;
    storeSet(COUNTER_KEY, n);
    var entry = clone(base);
    entry.name = 'Custom ' + n + ' (' + base.width + 'x' + base.height + ')';
    customs.unshift(entry);
    saveCustoms();
    return entry;
  }

  function deleteCustom(i) {
    var entry = customs[i];
    if (!entry) return;
    customs.splice(i, 1);
    saveCustoms();
    storeDel(BEST_PREFIX + entry.name);
    storeDel(BEST_PREFIX + entry.name + DIAG_SUFFIX);
    renderCustoms();
  }

  // Put a saved shape into the editor: centred if it fits, else top-left (cropped).
  function selectShape(cfg) {
    cells = emptyCells();
    var ox = cfg.width <= EDITOR_SIZE ? Math.floor((EDITOR_SIZE - cfg.width) / 2) : 0;
    var oy = cfg.height <= EDITOR_SIZE ? Math.floor((EDITOR_SIZE - cfg.height) / 2) : 0;
    for (var y = 0; y < cfg.height && oy + y < EDITOR_SIZE; y++) {
      for (var x = 0; x < cfg.width && ox + x < EDITOR_SIZE; x++) {
        cells[oy + y][ox + x] = !cfg.mask || cfg.mask[y][x] === '#';
      }
    }
    saveCustom();
    if (els.grid) renderEditor();
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
    html += '</div>' +
      '<h3 class="panel-section" id="panel-customs-head" hidden>Your grids</h3>' +
      '<div class="cards" id="panel-customs"></div>' +
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
    els.customsHead = root.querySelector('#panel-customs-head');
    els.customs = root.querySelector('#panel-customs');
    renderCustoms();
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
    // Saved custom cards are re-rendered, so delegate from their container.
    els.customs.addEventListener('click', function (e) {
      var del = e.target.closest('.card-del');
      if (del) {
        e.stopPropagation();
        if (window.confirm('Delete this grid and its best score?')) deleteCustom(+del.getAttribute('data-custom'));
        return;
      }
      if (e.target.closest('#panel-custom-toggle')) { toggleEditor(); return; }
      var card = e.target.closest('.card[data-custom]');
      if (card) startCustom(+card.getAttribute('data-custom'));
    });
    els.customs.addEventListener('keydown', function (e) {
      var card = e.target.closest('.card[data-custom]');
      if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); startCustom(+card.getAttribute('data-custom')); }
    });

    root.querySelector('#panel-clear').addEventListener('click', function () { cells = emptyCells(); renderEditor(); });
    root.querySelector('#panel-fill').addEventListener('click', function () { fill4x4(); renderEditor(); });
    els.moves.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-rule]');
      if (b) setMoveRule(b.getAttribute('data-rule'));
    });
    els.start.addEventListener('click', function () {
      var base = buildCustomBase();
      if (!base || countSelected() < MIN_CELLS) return;
      saveCustom();
      window.startGame(withMoveRule(registerCustom(base)));
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

  function toggleEditor(show) {
    if (show === undefined) show = els.editor.hidden;
    els.editor.hidden = !show;
    els.toggle.classList.toggle('active', show);
    if (show) els.editor.scrollIntoView({ block: 'nearest' });
  }

  // Start a saved custom grid and pre-fill the editor with its shape for tweaking.
  function startCustom(i) {
    var entry = customs[i];
    if (!entry) return;
    selectShape(entry);
    window.startGame(withMoveRule(entry));
    close();
  }

  // "Your grids": saved custom cards (newest first) followed by the Custom editor card.
  function renderCustoms() {
    var html = '';
    customs.forEach(function (c, i) {
      html += '<div class="card card-saved" role="button" tabindex="0" data-custom="' + i + '">' + thumb(c) +
              '<span class="card-name">' + esc(c.name) + '</span>' +
              '<button type="button" class="card-del" data-custom="' + i + '" aria-label="Delete ' + esc(c.name) + '">&times;</button></div>';
    });
    html += '<button type="button" class="card card-custom" id="panel-custom-toggle">' +
            '<span class="thumb custom-icon">&#9998;</span><span class="card-name">Custom</span></button>';
    var wasActive = !!(els.toggle && els.toggle.classList.contains('active'));
    els.customs.innerHTML = html;
    els.customsHead.hidden = customs.length === 0;
    els.toggle = els.customs.querySelector('#panel-custom-toggle');
    els.toggle.classList.toggle('active', wasActive);
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
    loadCustoms();
    renderCustoms();
    // Open straight into the editor when a saved custom grid is running
    // (legacy "Custom WxH" names are ignored).
    var cur = window.currentConfig && window.currentConfig();
    var custom = !!cur && customs.some(function (c) {
      return cur.name === c.name || cur.name === c.name + DIAG_SUFFIX;
    });
    toggleEditor(custom);
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
