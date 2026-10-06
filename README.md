# Sultan of Two Banners

A browser-based tactical RPG in the feel of the Game Boy Advance era, telling the life of **Salah ad-Din Yusuf ibn Ayyub** (532–589 AH / c. 1137–1193 CE) from the Arabic and Islamic sources first.

It takes inspiration from the *genre* and its mechanics only. All names, classes, items, art, music and text are original, and all art and audio are procedurally generated placeholders that can be replaced without code changes.

**Status:** design approved; engine in progress (milestone M1). See [Progress](#progress).

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

## Progress

| Milestone | Scope | State |
|---|---|---|
| M1 | Renderer, tilemap, cursor, movement, attack, sprite tool, one test map | in progress |
| M2 | Combat forecast and resolution, levelling, weapon triangle, terrain | planned |
| M3 | Enemy AI, phases, danger zone, fog, objectives | planned |
| M4 | Classes, promotion, inventory, convoy, shops | planned |
| M5 | Supports, Camp, dialogue and portraits | planned |
| M6 | Save/load, Codex, title, settings, Classic/Casual | planned |
| M7 | Prologue and Chapters 1–3 with source-backed dialogue | planned |

The full README (running, adding chapters, units and classes, swapping art and audio) lands with M7.
