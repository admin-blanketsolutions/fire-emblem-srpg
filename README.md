# Sultan of Two Banners

A browser-based tactical RPG in the feel of the Game Boy Advance era, telling the life of **Salah ad-Din Yusuf ibn Ayyub** (532–589 AH / c. 1137–1193 CE) from the Arabic and Islamic sources first.

It takes inspiration from the *genre* and its mechanics only. All names, classes, items, art, music and text are original, and all art and audio are procedurally generated placeholders that can be replaced without code changes.

**Status:** design approved; milestones M1 to M6 complete (engine, combat, AI and objectives, classes and the camp, supports and dialogue, saving and the Codex); M7, the first four chapters, is next. See [Progress](#progress).

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
npm run lint         # layering lint + source lint + sprite lint
npm run build        # typecheck + production build into dist/
npm run sprites:preview   # the sprite preview page, with live reload
```

Other sprite commands: `npm run sprites:gen` regenerates the placeholder sprites from the kits in `tools/sprites/kits/`, and `npm run sprites` exports PNG strips and contact sheets to `out/sprites/`.

## Playing it (M6)

The game opens on the title screen. **New game** asks for **Classic** (a unit that retreats wounded leaves the army, unless the sources place it in later events) or **Casual** (everyone returns after the battle). Until the chapters are written (M7), a campaign is the demo: an army in camp, and a siege to ride to.

- **Camp:** Preparations, the units and their packs, the convoy, two shops, Majlis talks (support scenes), the Maydan, promotion, and **Codex and saves**: three save slots, the Codex, settings, the switch from Classic to Casual (never back), and the way to the title.
- **Battle:** select a unit, see where it can move and attack, and act: Attack (with the forecast and the working behind it), Heal, items, Trade, class actions (Sap, Entrench, Mend, Counsel, Dispatch, Decree, Open), Seize, Depart, Talk and Visit where the map allows. The enemy plays its phase by mode and by an exact expectation of each fight. **Suspend** on the turn menu saves the battle and returns to the title, where **Resume battle** picks it up exactly where it was. In Classic a suspend-save is used up when it is resumed.
- **After a battle:** a victory brings the army home under the campaign's rules and back to camp. A defeat sends the campaign back to the autosave made as the battle began.
- **The Codex** has People, Places, Events, Terms, Sources & Disputes and Game vs History. Each entry carries its confidence badge and its sources, and where the sources disagree it shows each one's position.
- **Settings** (from the title or camp) are kept between visits: text speed, battle animations, music and sound volume, hit rolls (Honest or Weighted), guaranteed progress, ending the turn when everyone has acted, the danger zone at the start, the ◆/◇ source marks, portraits, and colour-blind-safe ranges.
- **Sound** is placeholder chiptune from a small synthesiser, and starts with the first key press or tap. Real recordings can replace any song or sound (see [Replacing sound](#replacing-sound)).
- If the browser will not keep saves (private mode, storage blocked), the game says so on the title and keeps them for as long as the page is open.

Test battles can still be opened directly. The proving ground can be played under each of the seven objectives, with or without fog of war:

| Address | Battle |
|---|---|
| `/?objective=rout` | Defeat all enemies |
| `/?objective=seize` | The Lord seizes the marked tile in the citadel |
| `/?objective=defend` | Defend until the end of turn 6 |
| `/?objective=hold-the-pass` | Keep the enemy from crossing the bridge until turn 6 |
| `/?objective=escort` | Take the healer to the marked exit and Depart |
| `/?objective=survive` | Survive until the end of turn 6 |
| `/?objective=persuade` | Talk the crossbowman round within 8 turns |
| `/?demo=siege` | A walled courtyard with a gate, mangonels and dry grass |
| `/?demo=camp` | The camp, then the siege |

Add `&fog=1` for fog of war and `&seed=42` for a different set of dice.

| Action | Keyboard | Touch |
|---|---|---|
| Move cursor | Arrow keys | On-screen pad, or tap a tile |
| Pan the map | — | Drag |
| Confirm | `Z` | OK, or tap the cursor tile again |
| Cancel | `X` | Back |
| Info (unit details; forecast working) | `A` | Info |
| Danger (enemy threat range) | `S` | Danger |
| Menu (end turn) | `Enter` | Menu |

Confirm on an enemy unit shows its move and attack range. The touch pad appears on touch devices only.

## Replacing sound

Put recordings in `public/assets/override/audio/` with a `manifest.json` that maps song and sound ids to files:

```json
{ "music": { "title": "title.ogg", "camp": "camp.ogg" }, "sfx": { "hit": "hit.ogg" } }
```

A recording replaces the synthesised version of that id; anything not listed keeps the placeholder. The ids are the file names in `assets/music/` (`title`, `camp`, `player-phase`, `enemy-phase`, `story`, `victory`, `defeat`) and the entries of `assets/sfx/effects.json`. Nothing that imitates the call to prayer or recitation is used as music or as an effect (DECISIONS D-004).

## Progress

| Milestone | Scope | State |
|---|---|---|
| M1 | Renderer, tilemap, cursor, movement, attack, sprite tool, one test map | done |
| M2 | Combat forecast and resolution, levelling, weapon triangle, terrain | done |
| M3 | Enemy AI, phases, danger zone, fog, objectives | done |
| M4 | Classes, promotion, inventory, convoy, shops | done |
| M5 | Supports, Camp, dialogue and portraits | done |
| M6 | Save/load, Codex, title, settings, Classic/Casual | done |
| M7 | Prologue and Chapters 1–3 with source-backed dialogue | next |

The full README (adding chapters, units and classes, swapping art and audio) lands with M7. Each milestone ends with tests green, a production build, and a commit.
