# Sultan of Two Banners

A browser-based tactical RPG in the feel of the Game Boy Advance era, telling the life of **Salah ad-Din Yusuf ibn Ayyub** (532–589 AH / c. 1137–1193 CE) from the Arabic and Islamic sources first.

It takes inspiration from the *genre* and its mechanics only. All names, classes, items, art, music and text are original, and all art and audio are procedurally generated placeholders that can be replaced without code changes.

**Status:** design approved; milestones M1 (engine foundations) and M2 (combat and levelling) complete; M3 in progress (the enemy AI and the enemy phase are in). See [Progress](#progress).

## What it is

- Grid tactics at 240×160, integer-scaled and crisp, with keyboard and touch support.
- A three-way weapon triangle (the *Three Postures*) plus bows, crossbows, javelins, axes, daggers, naphtha and remedies.
- Fourteen class lines, each in three tiers, with classic-reset promotion.
- A support system, a between-chapter Camp (the *Majlis*), and a Codex that shows where sources agree and where they differ.
- Source discipline: every chapter, character and support scene is mapped to sources with a confidence label, and dramatised dialogue is always marked as such.

## Documents

| Document | Purpose |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | Systems, formulas, class tree, support design, architecture, art and audio pipelines, milestones |
| [docs/SOURCES.md](docs/SOURCES.md) | The historical ledger: chapters, characters, support scenes and Codex entries mapped to sources, with confidence labels and a verification log |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Every judgment call on history, sensitivity and engineering |

## Respect and sensitivity

No prophet or Companion is ever depicted. Scripture appears only if quoted exactly in Arabic with a correct citation, and not at all in the first slice. Defeat is "retreats wounded"; there is no gore. Real people on every side are portrayed as people, and disagreements between sources are shown rather than hidden. See [DECISIONS.md](docs/DECISIONS.md).

## Tech

TypeScript (strict), Vite, Vitest, and a thin custom Canvas 2D engine (no Phaser). No backend; saves use `localStorage`.

## Running it

Requires Node 22.12 or later.

```bash
npm install
npm run dev          # the game, at http://localhost:3000
npm test             # unit tests (Vitest)
npm run lint         # layering lint + sprite lint
npm run build        # typecheck + production build into dist/
npm run sprites:preview   # the sprite preview page, with live reload
```

Other sprite commands: `npm run sprites:gen` regenerates the placeholder sprites from the kits in `tools/sprites/kits/`, and `npm run sprites` exports PNG strips and contact sheets to `out/sprites/`.

## Playing it (M3, in progress)

One test map, the *Proving Ground*, with seven player units and five enemies. You can select a unit, see where it can move and attack, walk it across terrain at the correct cost, and then Attack, Heal or Wait. When every unit has acted, or you choose *End Turn*, the enemy phase plays: each enemy advances, attacks or heals as its AI profile decides (DESIGN §10). Objectives, and so victory and defeat, arrive later in M3.

- **Attack** offers each weapon that reaches someone, then the targets one at a time, with the forecast: damage, hit and crit chance, doubling, and expected HP for both sides. `Info` shows the working (attack speed, accuracy, evasion, cover).
- Fights play out as map animation, then the EXP bar, any level-up and weapon grades earned. Weapons wear out and break. Healers restore HP with a remedy.
- The three-way weapon triangle (Spear beats Mace, Mace beats Sabre, Sabre beats Spear) shows as ▲ and ▼ on the forecast.

| Action | Keyboard | Touch |
|---|---|---|
| Move cursor | Arrow keys | On-screen pad, or tap a tile |
| Confirm | `Z` | OK, or tap the cursor tile again |
| Cancel | `X` | Back |
| Info (unit details; forecast working) | `A` | Info |
| Danger (enemy threat range) | `S` | Danger |
| Menu (end turn) | `Enter` | Menu |

Confirm on an enemy unit shows its move and attack range. The touch pad appears on touch devices only.

## Progress

| Milestone | Scope | State |
|---|---|---|
| M1 | Renderer, tilemap, cursor, movement, attack, sprite tool, one test map | done |
| M2 | Combat forecast and resolution, levelling, weapon triangle, terrain | done |
| M3 | Enemy AI, phases, danger zone, fog, objectives | in progress: AI and enemy phase done |
| M4 | Classes, promotion, inventory, convoy, shops | planned |
| M5 | Supports, Camp, dialogue and portraits | planned |
| M6 | Save/load, Codex, title, settings, Classic/Casual | planned |
| M7 | Prologue and Chapters 1–3 with source-backed dialogue | planned |

The full README (adding chapters, units and classes, swapping art and audio) lands with M7. Each milestone ends with tests green, a production build, and a commit.
