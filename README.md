# Sultan of Two Banners

A browser-based tactical RPG in the feel of the Game Boy Advance era, telling the life of **Salah ad-Din Yusuf ibn Ayyub** (532–589 AH / c. 1137–1193 CE) from the Arabic and Islamic sources first.

It takes inspiration from the *genre* and its mechanics only. All names, classes, items, art, music and text are original, and all art and audio are procedurally generated placeholders that can be replaced without code changes.

**Status:** the **vertical slice is built**: the Prologue and Chapters 1 to 3, playable from the title screen to a closing page, on an engine made for the whole campaign (milestones M1 to M7). The chapters after the first three are planned in the ledger and not yet built. See [Progress](#progress) and [What is not built](#what-is-not-built).

## The slice

| Chapter | Years (AH · CE) | You play | Objective |
|---|---|---|---|
| **Prologue: The Boats of Tikrit** | 526 · 1132 | Ayyub's levy at the Tigris landings, as Zengi's routed army crosses | Hold the landings until the end of turn 8; then the quarrel, the birth and the exile (scenes) |
| **1. Damascus: The East Gate** | 549 · 1154 | Shirkuh and the young Salah ad-Din, with Nur ad-Din's army before the city | Seize the East Gate by turn 10, by force or by *Talk* with the city's urban guard |
| **2. The Road to Egypt: Alexandria** | 558 to 562 · 1163 to 1167 | Salah ad-Din holds the walled port while Shirkuh is in Upper Egypt | Defend twelve turns against engines, crossbows and three waves |
| **3. The Vizier: the council** | 564 · 1169 | Isa al-Hakkari and Salah ad-Din after Shirkuh's death | Win over three emirs by *Talk* within six turns; Salah ad-Din is made Lord |
| **3. The Vizier: Bayn al-Qasrayn** | 564 · 1169 | The night streets of Cairo, in fog | Hold the square for eight turns, or burn the caliph's pavilion with the Fire Thrower |

Between chapters there are scenes, six support conversations (nine scenes) and a Camp. A fictional levy soldier, **the Recruit**, is named by you at the start; every other person is historical, and the Codex says which lines are documented and which are dramatized.

## What it is

- Grid tactics at 240×160, integer-scaled and crisp, with keyboard and touch support.
- A three-way weapon triangle (the *Three Postures*) plus bows, crossbows, javelins, axes, daggers, naphtha and remedies.
- Fourteen class lines, each in three tiers, with classic-reset promotion.
- A support system, a between-chapter Camp (the *Majlis*), and a Codex that shows where sources agree and where they differ.
- Source discipline: every chapter, character, scene and support is mapped to sources with a confidence label, and dramatized dialogue is always marked as such.

## Documents

| Document | Purpose |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | Systems, formulas, class tree, support design, architecture, art and audio pipelines, milestones; paragraphs headed *As built* say what shipped |
| [docs/SOURCES.md](docs/SOURCES.md) | The historical ledger: chapters, characters, support scenes and Codex entries mapped to sources, with confidence labels, the discrepancies found between sources, and a verification log |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Every judgment call on history, sensitivity and engineering |

## Respect and sensitivity

No prophet or Companion is ever depicted. Scripture appears only if quoted exactly in Arabic with a correct citation, and not at all in the slice. Defeat is "retreats wounded"; there is no gore. Real people on every side are portrayed as people: the Fatimid regiments of 1169 are soldiers with a reason to fear, they are given no insulting name (the early sources use one; the game does not), and the aftermath is told in the Codex with a content note and never shown. Disagreements between sources are shown rather than hidden. See [DECISIONS.md](docs/DECISIONS.md), D-004 to D-016 and D-037.

## Running it

Requires Node 22.12 or later.

```bash
npm install
npm run dev          # the game, at http://localhost:3000
npm test             # unit tests (Vitest)
npm run lint         # layering lint + source lint + sprite lint
npm run build        # typecheck + production build into dist/
npm run balance      # play the slice many times with the computer (see below)
npm run sprites:preview   # the sprite preview page, with live reload
```

Other sprite commands: `npm run sprites:gen` regenerates the placeholder sprites from the kits in `tools/sprites/kits/`, and `npm run sprites` exports PNG strips and contact sheets to `out/sprites/`.

`npm run build` writes a static site to `dist/`; any static host will serve it. The repository's GitHub workflow (`.github/workflows/deploy.yml`) runs the typecheck, the tests, the lints and the build on every push, and publishes `dist/` to GitHub Pages from `main`, with `VITE_BASE` set to the repository's name (Pages serves a site under `/<repository>/`); the workflow names the repository as it is today, so if the repository is renamed, `VITE_BASE` in the workflow changes with it.

## Playing it

The game opens on the title screen. **New game** asks for **Classic** (a unit that retreats wounded is lost, unless the story needs it) or **Casual** (everyone returns after the battle); a Classic campaign may become Casual in camp, never the reverse. Then you **name the Recruit**, on an on-screen keyboard that works with the arrow keys and Confirm, or with a tap.

- **Camp:** Preparations (who takes the field: the Lord and the people the map names *must go*; units that are *away* cannot be chosen), the units and their packs, the convoy, two shops, Majlis talks (support scenes), the Maydan (weapon drills), promotion, and **Codex and saves**: three save slots, the Codex, settings, the switch from Classic to Casual, and the way to the title. The last entry takes the way on and writes the autosave.
- **Battle:** select a unit, see where it can move and attack, and act: Attack (with the forecast and the working behind it), Heal, items, Trade, class actions (Sap, Entrench, Mend, Counsel, Dispatch, Decree, Open), Seize, Depart, Talk and Visit where the map allows. The enemy plays its phase by mode and by an exact expectation of each fight. **Suspend** on the turn menu saves the battle and returns to the title, where **Resume battle** picks it up exactly where it was. In Classic a suspend-save is used up when it is resumed.
- **After a battle:** a victory brings the army home under the campaign's rules and on to the next scene. A defeat sends the campaign back to the autosave made as the camp was left, with the army as it was.
- **The Codex** has People, Places, Events, Terms, Sources & Disputes and Game vs History. Each entry carries its confidence badge and its sources, and where the sources disagree it shows each one's position.
- **Settings** (from the title or camp) are kept between visits: text speed, battle animations, music and sound volume, hit rolls (Honest or Weighted), guaranteed progress, ending the turn when everyone has acted, the danger zone at the start, the ◆/◇ source marks (documented / dramatized), portraits, and colour-blind-safe ranges.
- **Sound** is placeholder chiptune from a small synthesiser, and starts with the first key press or tap.
- If the browser will not keep saves (private mode, storage blocked), the game says so on the title and keeps them for as long as the page is open.

| Action | Keyboard | Touch |
|---|---|---|
| Move cursor | Arrow keys | On-screen pad, or tap a tile |
| Pan the map | — | Drag |
| Confirm | `Z` | OK, or tap the cursor tile again |
| Cancel | `X` | Back |
| Info (unit details; forecast working) | `A` | Info |
| Danger (enemy threat range) | `S` | Danger |
| Menu (end turn; in a scene, skip it) | `Enter` | Menu |

Confirm on an enemy unit shows its move and attack range. The touch pad appears on touch devices only.

## Testers and the proving ground

Open the campaign part-way, with an army the computer has brought there (add `&mode=classic` and `&seed=7`):

| Address | Where it opens |
|---|---|
| `/?chapter=CH-02` | the start of a chapter (`CH-00` to `CH-03`) |
| `/?battle=CH-03C` | the camp before a battle (`CH-00`, `CH-01`, `CH-02`, `CH-03C`), or the battle itself where a scene and not a camp comes first (`CH-03B`) |

The proving ground can be played under each of the seven objectives, with or without fog of war:

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

Add `&fog=1` for fog of war and `&seed=42` for a different set of dice (not together with `?chapter=` or `?battle=`, where `seed` chooses the campaign's).

**The balance tool.** `npm run balance` has the computer play the whole slice over many seeds and reports, per battle, how often it is won, how many turns it takes, who is lost, how far the army has levelled and why a lost battle was lost. The computer plays carelessly, so a win rate is a floor and the units lost a ceiling. Settings are environment variables: `SEEDS=100`, `MODE=casual`, `ONLY=CH-02`, `STANCE=defensive` (hold the line and answer, instead of charging). The last report is in [DESIGN.md §14](docs/DESIGN.md).

**Maps as text.** `npx tsx tools/mapview.ts ch02-alexandria` prints a map, its spawns and its objective.

## How it is built

TypeScript (strict), Vite, Vitest, and a thin custom Canvas 2D engine (no Phaser). No backend; saves use `localStorage`.

```
src/core/     pure rules: combat, AI, objectives, events, camp, army, chapters, saves, the headless player.
              No DOM, no Math.random, no Date.now; every random draw comes from a seeded generator
src/data/     JSON (classes, units, maps, scenes, Codex, chapters …) and the loaders that validate it
src/engine/   the canvas, input, sprites, text, sound
src/scenes/   the screens: title, flow, battle, camp, story, naming, menus
tools/        the layering lint, the ledger lint, the sprite tools, the balance tool, mapview
tests/        Vitest suites
```

The layers run `core ← data ← engine ← scenes` and a lint enforces it (`npm run lint:boundaries`). Because the rules are pure and seeded, a battle is replayed exactly from its seed, a suspend-save resumes on the very next dice roll, and the computer can play the whole story without a screen.

## Adding content

Everything below is data. Run `npm test` and `npm run lint` after each change: the tests check that every id resolves and every map plays, and the ledger lint refuses a scene that stands on no row of [docs/SOURCES.md](docs/SOURCES.md).

**A chapter.** Add it to `src/data/chapters.json`: an `id` (a ledger id such as `CH-04`), a `title`, a `date` (AH, then the Julian month and year) and a list of **steps**: `card`, `name`, `scenes` (a list of scene ids), `apply` (effects: `join`, `leave`, `away`, `grant`, `train`, `give`, `dinars`, `flag`, `unlock`), `camp` (with a `label` for the way on) and `battle` (a map id). The ids it names must exist; the table is checked when it loads. See [DESIGN §3.10](docs/DESIGN.md).

**A map.** `src/data/maps/chNN-name.json`: an ASCII terrain grid with a legend, `spawns` for the `player`, `ally` and `enemy` sides, `reinforcements`, one `objective`, and `events` (messages, dialogue, `spawn`, `openGate`, `recruit`, `endChapter` …). A player spawn named for a unit is *that* unit and must go; one tagged `slot` is an open place for the player's choice; one tagged `reserve` waits for an `arrive` event. Print it with `tools/mapview.ts`. The map's `id` is the battle's id in `chapters.json`. See [DESIGN §3.7, §3.8, §4.7](docs/DESIGN.md).

**A unit.** `src/data/units.json`: `id`, `name`, `side`, a `class`, a `level`, small `offset`s from the class's base, `growth`, an `inventory`, a `faction` and `skin` (colours in `assets/palettes/`), and optionally `boss`, `tags`, `ai`, `chronicled` (one the sources place in later events: never lost in Classic), `playerNamed`. Its map sprite is `unit.<class>` unless it names `sprite`. A person who speaks also needs a plate and a portrait in `src/data/characters.json`.

**A class, weapon, item or skill.** `classes.json`, `weapons.json`, `items.json`, `skills.json` and `shops.json` in `src/data/`; the numbers that tune them are in `balance.json` (the engine's) and `campaignBalance.json` (the campaign's pace of growth, laid over it).

**A scene.** `src/data/scenes/<id>.scene.json`: `id`, `title`, `ledger` (the rows it stands on) and `cmds` (`bg`, `show`, `say`, `music`, `flag`, `unlock` …). Each `say` is `documented` (cites its rows in `src`), `dramatized` or `narration`. A new anecdote needs its row in the ledger *first*. See [DESIGN §9](docs/DESIGN.md).

**A support pair.** `src/data/supports.json`: the pair, and a scene for each rank (C, B, A) with its `SUP-` ledger row and the chapter it `availableFrom`.

**A Codex entry.** `src/data/codex/chNN.json`: an id that is its ledger row (`CDX-P-…` for a person), a `category`, when it unlocks, a `confidence`, its `sources`, its paragraphs and, where sources disagree, `differ` blocks with every position.

## Replacing art

The game draws every sprite from a definition in `assets/sprites/*.sprite.json` (palette-indexed pixels, recoloured by faction and skin). To replace one with real art, put a PNG strip in `public/assets/override/sprites/` and name it in `public/assets/override/manifest.json`:

```json
{ "sprites": { "unit.pikeman": "sprites/unit.pikeman.png" } }
```

A strip holds all frames of the sprite side by side, in the order of the definition, each exactly the sprite's size; `out/sprites/strips/<id>.png` (from `npm run sprites`) is a ready template. A strip of the wrong size is ignored with a console warning, so a bad file can never break the game. Overrides are full-colour and are not recoloured by faction or skin.

| Kind | Id | Size | Frames |
|---|---|---|---|
| Map units | `unit.<class>` | 16×16 | `idle` ×2, then `walk` ×2 |
| Structures and engines | `unit.gate`, `unit.pavilion`, `unit.mangonel` … | 16×16 | `idle` ×1 or ×2, as defined |
| Portraits | `portrait.<character>` | 32×32 | one |
| Terrain tiles | `tile.<terrain>` | 16×16 | one |
| Cursor and UI | `ui.*` | 16×16 | as defined |

The checklist for a replacement: the same id and size; a transparent background; no religious emblems on generic units (D-027); no portrait of a prophet or Companion, ever (D-005); and for portraits, no claim to be a likeness of a real person (ledger UNV-05). The bitmap font is `assets/fonts/majlis.font.json`; `npm run lint` checks every sprite.

## Replacing sound

Put recordings in `public/assets/override/audio/` with a `manifest.json` that maps song and sound ids to files:

```json
{ "music": { "title": "title.ogg", "camp": "camp.ogg" }, "sfx": { "hit": "hit.ogg" } }
```

A recording replaces the synthesised version of that id; anything not listed keeps the placeholder. The ids are the file names in `assets/music/` (`title`, `camp`, `player-phase`, `enemy-phase`, `story`, `victory`, `defeat`) and the entries of `assets/sfx/effects.json`. Nothing that imitates the call to prayer or recitation is used as music or as an effect (D-004).

## Progress

| Milestone | Scope | State |
|---|---|---|
| M1 | Renderer, tilemap, cursor, movement, attack, sprite tool, one test map | done |
| M2 | Combat forecast and resolution, levelling, weapon triangle, terrain | done |
| M3 | Enemy AI, phases, danger zone, fog, objectives | done |
| M4 | Classes, promotion, inventory, convoy, shops | done |
| M5 | Supports, Camp, dialogue and portraits | done |
| M6 | Save/load, Codex, title, settings, Classic/Casual | done |
| M7 | Prologue and Chapters 1–3 with source-backed dialogue, supports, Codex; this README | done |

Each milestone ended with the tests green, a production build, and a commit.

## What is not built

- **Chapters 4 to the end** (from the end of the Fatimid caliphate to Hattin, Jerusalem and the Third Crusade) are planned in [docs/SOURCES.md](docs/SOURCES.md) §3 and [docs/DESIGN.md](docs/DESIGN.md) §11.2. Nothing in the engine stands in their way, but Tier III classes have never met a map.
- The stretch maps (al-Babain, Damietta), the *Common / Historical / Both* class-name setting, reclassing and pair-up.
- Real art and audio: every sprite, portrait and sound is a placeholder.
- The balance has been tested only by the computer; the first people to play the slice will find what it could not.

## Sources and originality

The history comes from public-domain texts read in the ledger's own words (Ibn Khallikan in de Slane's translation, Ibn Shaddad in the 1897 translation, Ibn al-Athir and Imad ad-Din through the *Recueil des historiens des croisades*, and Lane-Poole as a cross-check); documented lines paraphrase them and never copy a modern translation. The genre's mechanics are the inspiration; no name, class, item, text, sprite, interface or piece of music of any existing game is used.
