# Fire Emblem S-RPG

A Fire Emblem inspired 2D pixel strategy RPG built with Phaser 3 + TypeScript.

## Stack

- **Phaser 3** — 2D game engine
- **TypeScript** — type-safe game logic
- **Vite** — dev server and bundler
- **Vitest** — unit tests for game systems
- **GitHub Pages** — live web deployment

## Development

```bash
npm install
npm run dev        # start dev server at localhost:3000
npm run typecheck  # type check only
npm test           # run unit tests
npm run build      # production build → dist/
```

## Project Structure

```
src/
  scenes/     Phaser scenes (Boot, Preload, MainMenu, Battle, Dialogue)
  systems/    Core logic (Grid, Combat, TurnManager, AI)
  entities/   Unit, Tile, Weapon data types
  ui/         HUD, menus, dialogue boxes
  data/       JSON data for maps, characters, weapons
  assets/     Sprites, tilesets, portraits, audio
docs/design/  Story, world, and gameplay design documents
```

## Milestone Progress

- [x] M1 — Playable grid with movement range (BFS), camera, HUD, basic enemy AI
- [ ] M2 — Unit movement animation and turn state machine polish
- [ ] M3 — Combat system (Hit%, Damage, Crit, weapon triangle)
- [ ] M4 — Enemy AI improvements
- [ ] M5 — Dialogue and story system
- [ ] M6 — Menus and save/load
- [ ] M7 — AI-generated assets integrated
- [ ] M8 — Electron desktop build
