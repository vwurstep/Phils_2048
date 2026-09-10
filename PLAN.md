# Plan

## What the game is

Standard 2048: tiles slide in a direction until blocked, equal tiles that collide merge
into their sum (once per move), after every move that changed something a new tile
(2 or 4) appears on a random empty cell. Game continues past 2048; game over when no
move changes the board.

## What Phil wants to vary (the "knobs")

| Knob | Classic value | Planned variants |
|------|---------------|------------------|
| Grid geometry | 4x4 square | 5x5, 4x5, cross shape, arbitrary masks |
| Movement | 4 directions (up/down/left/right) | fewer directions, diagonals, others later |
| Spawn statistics | one tile per move, 2 (90%) or 4 (10%) | different values/probabilities, several tiles, spawn position rules |
| Merge rule | equal tiles double | to be explored later |

All knobs live in one config object. Presets are named configs.

## Phase 1: browser prototype (current)

Deliverable: `index.html` playable locally and on GitHub Pages.

Steps:
1. Engine (`src/engine.js`): grid mask, move along a direction vector, merge, spawn,
   game-over detection, score. Plus node tests.
2. UI (`src/ui.js` + `index.html`): draw the grid from the mask, tiles with colours,
   keyboard arrows + touch swipe, score, "new game", preset selector.
3. Presets: classic 4x4, 5x5, 4x5, cross.
4. Publish on GitHub Pages so it can be played on the phone.

Design decisions taken (change if you disagree):
- Plain HTML/CSS/JS, no build tooling. Fastest to deploy and easiest to wrap later.
- Non-rectangular grids: a tile slides only within its contiguous run of cells along
  the move direction. It cannot jump across a gap in the mask.
- Animations: minimal at first (tiles just re-render). Sliding animation is a later nicety.

## Known issues

- Phil saw the board cut off on the left with misplaced tiles when opening index.html on his
  MacBook (double-click, probably Safari); fixed by choosing a new layout. Not reproducible in
  headless Chrome or Playwright WebKit. A re-layout after first paint plus overflow guards
  were added as a best guess (2026-09-10); if it persists, leave it.
- Slide animation is slightly bumpy on iPhone Safari (fine on Mac). Tiles now use
  translate3d + will-change; revisit when packaging as an app.

## Phase 2: app

Options, in order of preference:
1. PWA: add a manifest + service worker, "Add to Home Screen" on iOS/Android. Same code.
2. Capacitor: wraps the same web code into a real iOS/Android app for the stores.
3. Native rewrite: only if performance or platform features demand it (unlikely).

## Phase 3: more knobs

Done so far:
- Undo (last 10 moves, Backspace key). On-screen move buttons exist in the code but are hidden.
- Fast slide animation (80 ms) driven by `state.last.tiles` from the engine.
- Four colour themes (classic, dark, ocean, mono), cycled by the header button, all colours are CSS variables.
- "New game" panel: a "Normal / Normal + diagonal" move toggle that applies to any layout,
  preset cards with shape thumbnails, plus a custom 8x8 paint editor
  (`EDITOR_SIZE` in src/panel.js) that crops to the bounding box.
- The running game (board, score, undo history) is saved in localStorage and restored on reload.

Ideas parked for later: seed sharing, spawn rules that depend on board state,
merge rules other than doubling, timed mode, statistics of games played.

## Decisions from Phil (2026-09-10)

- Target phone platform: **iPhone**. PWA on iOS Safari first, Capacitor for the App Store later.
- Repo is pushed to GitHub (vwurstep/Phils_2048) and the prototype is served via GitHub Pages.
