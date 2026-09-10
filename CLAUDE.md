# Phil's 2048

A personal, highly configurable variant of the game 2048. The owner (Phil) wants to
experiment with the rules: grid geometry, movement, tile spawning statistics, and more.

## Goal and phases

1. **Prototype (now):** a browser page (plain HTML/CSS/JS, no build step, no framework)
   that is playable immediately by opening `index.html` or via GitHub Pages.
   Purpose: play it, discuss the logic, iterate on the rules fast.
2. **App (later):** turn the same code into an installable app. Default route is
   PWA first (installable on phone from the browser), then wrap with Capacitor if a
   native/store app is wanted. Decision not final; see PLAN.md.

## Architecture rules (keep these)

- **Engine is separate from rendering.** `src/engine.js` contains pure game logic with
  no DOM access. `src/ui.js` renders and handles input. Never mix them.
- **Everything variable lives in a config object.** Grid shape, allowed moves, spawn
  statistics, merge rule. The engine reads the config; adding a variant means adding
  a config option, not forking the code.
- **Grid is a set of cells, not a rectangle.** Cells are `{x, y}` inside a bounding
  box with a boolean mask, so crosses, holes and odd shapes work. A "line" for a move
  is a maximal contiguous run of cells along the move direction.
- **Deterministic engine.** Randomness goes through an injectable RNG so tests can
  seed it.
- Keep it small. No dependencies unless there is a clear need.

## Working style for Claude

- The main session (Fable 5.1) is the orchestrator: it owns the architecture, the plan
  and the discussion with Phil.
- Substantial programming tasks are delegated to subagents (model `fable`); trivial,
  well-specified edits may go to `opus`. Spawn agents **economically**: give them only
  the files, config shape and acceptance criteria they need, not the whole history.
- Phil wants to be economical with tokens overall.
- Keep PLAN.md up to date when the plan changes.
- Run the engine tests (`node test/engine.test.js`) after touching engine code.
- Visual checks: headless Chrome or Playwright WebKit screenshots from Bash (see memory);
  the claude-in-chrome skill does not work here.

## Layout

```
index.html          playable page (prototype)
src/engine.js       pure game logic
src/ui.js           rendering + input (keyboard, touch swipe)
src/presets.js      named configs (classic 4x4, 5x5, cross, ...) + move-set helpers
src/panel.js        "New game" panel: move toggle, preset cards, custom grid editor
test/engine.test.js node-runnable tests, no framework
manifest.webmanifest, sw.js, icons/   PWA bits; bump CACHE in sw.js when files change
PLAN.md             the plan and open decisions
```
