# Sultan of Two Banners — Design Document

**Status:** Draft 0.3 · 2026-10-08 · direction approved; the vertical slice (M7) is built, and paragraphs headed *As built* record what shipped and how it differs from the plan
This document is the contract the milestones are built against.

Companion documents

- [SOURCES.md](SOURCES.md): the historical ledger. Every chapter, character and support scene is mapped to sources with a confidence label.
- [DECISIONS.md](DECISIONS.md): every judgment call on history, sensitivity and engineering, with the conservative option that was chosen.

Conventions used here

- Tunable numbers live in `src/data/balance.json` (or the relevant data file), never in logic. Numbers in this document are *initial values*.
- Ledger IDs (`CH-00`, `CHR-SALAH`, `SUP-…`, `CDX-…`, `EXC-…`, `UNV-…`) are the join key between data files and SOURCES.md. A lint script enforces the join (see §14).
- Code samples are TypeScript-flavoured. Modules marked **pure** never touch the DOM, `Math.random`, or `Date.now`.

---

## Contents

1. Vision and pillars
2. Scope: slice versus full campaign
3. Technology and architecture
4. Battle rules
5. Combat
6. Classes, skills, promotion
7. Support system
8. Camp / Majlis hub
9. Dialogue, portraits, Codex, source markers
10. Enemy and ally AI
11. Campaign content plan
12. Art pipeline
13. Audio pipeline
14. Testing and quality gates
15. Milestones
16. Settings and accessibility
17. Risks and open questions

---

## 1. Vision and pillars

*Sultan of Two Banners* is a turn-based tactical RPG in the feel of the Game Boy Advance era, telling the life of Salah ad-Din Yusuf ibn Ayyub (532–589 AH / c. 1137–1193 CE) from the Arabic and Islamic sources first.

| Pillar | What it means in practice |
|---|---|
| **Source-first history** | Every chapter, character and support scene has a ledger row. Documented anecdotes are adapted faithfully and cited. Original dialogue is flagged *dramatized*. Disagreements between sources are shown in the Codex, never silently resolved. |
| **GBA-era tactics at 240×160** | 15×10 tiles of 16×16 px, integer-scaled and crisp. Grid movement, forecast screens, double attacks, terrain, weapon durability, growth-based levelling. |
| **Everything swappable** | Maps, units, classes, items, dialogue, supports and Codex entries are data. Art and audio are procedural placeholders behind a stable asset contract so real assets drop in without code changes. |
| **Restraint and dignity** | Real people on every side are portrayed as people. Defeat is "retreats wounded". No gore. No prophet or Companion is ever depicted. Scripture appears only if exactly quoted in Arabic with a correct citation, and not at all in the slice. |
| **A testable core** | Combat, EXP, promotion, supports, AI and objectives are pure, deterministic TypeScript with Vitest coverage. |

Originality: the **genre and its mechanics** are the inspiration. No names, characters, class names, item names, music, sprites, UI assets or text from any existing game are used. The weapon triangle, class tree, stat names, UI and every asset are original (see §5.3, §6, §12).

---

## 2. Scope: slice versus full campaign

The architecture is built for the full campaign; M7 delivers the **vertical slice**: Prologue plus Chapters 1–3.

The outline below was checked against the sources (SOURCES.md §3). Two adjustments came out of that check and are approved:

- **Prologue** becomes *The Boats of Tikrit* (1132, 526 AH): the best-attested event in the family's pre-history (Ayyub supplies the boats that save Zengi's routed army). The birth, the quarrel and the exile (532 AH) play as story scenes afterward.
- **Chapter 2** needs a note: Ibn Shaddad does not mention al-Babain at all, and Ibn Khallikan places the battle near Ushmunayn in Middle Egypt, not at Giza as some summaries say. Alexandria, where Saladin held the city, is the playable centrepiece; al-Babain is a stretch map.

| ID | Chapter | Years (CE / AH) | Stages | Objective(s) | Systems it introduces | Slice |
|---|---|---|---|---|---|---|
| CH-00 | Prologue: The Boats of Tikrit | 1132 / 526 (+ epilogue 532–534) | 1 map + scenes | Hold the Pass (ferry piers) | movement, terrain, triangle, danger zone, forecast, first Camp | ✔ |
| CH-01 | Damascus: The East Gate | 1154 / 549 | 1 map | Seize | orchards and light units, Talk, healer, Maydan training | ✔ |
| CH-02 | The Road to Egypt | 1163–1167 / 558–562 | 1 map (Alexandria); *stretch:* al-Babain | Defend 12 turns | structures (mangonels), Fire Thrower, Sapper, crossbows, fire, sapping, reinforcement waves | ✔ (+ stretch) |
| CH-03 | The Vizier | 1168–1169 / 564–565 | Council stage (Talk), 1 map (Bayn al-Qasrayn); *stretch:* Damietta | Persuade; then Survive 8, or burn the pavilion | recruit via Talk, rank-event promotion, ally phase, night fog | ✔ (+ stretch) |
| CH-04 – CH-FIN | see §11.2 | 1170–1193 | planned | | | later |

Slice content target: **4 battle maps + 1 council stage**, 9 support scenes, about 45 Codex entries, about 20 named historical characters (about 8 of them playable or on-map units, the rest NPCs) plus generic troops, and one fictional viewpoint unit (the Recruit, §9.5). Stretch maps are added if M7 has room.

As built (M7): the target was met, and the stretch maps (al-Babain, Damietta) were not built. The slice is **four battles and the council stage** (`CH-00`, `CH-01`, `CH-02`, `CH-03B` the council, `CH-03C` Bayn al-Qasrayn), **39 scenes** (30 of story and 9 support conversations over 6 pairs), **54 Codex entries**, 23 characters (a plate and a portrait each) and 44 unit definitions, played in order from the title screen to a closing page, with a Camp (Majlis) between chapters. Al-Babain is told in a scene (`ch02.babain`) and in the Codex. The stage letters (`CH-03B`, `CH-03C`) are battle ids, not chapter ids: the chapters are `CH-00` to `CH-03`, and a chapter is a list of steps (§3.10).

---

## 3. Technology and architecture

### 3.1 Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` on |
| Build | Vite | static output; no backend |
| Rendering | **Canvas 2D, own thin engine** (approved over Phaser) | See DECISIONS D-001. All art is palette-indexed pixel data, the logical screen is 240×160, and the core must be testable without a renderer. A custom layer is ~1k lines and removes a ~1 MB dependency. If you prefer Phaser 3, only `src/engine/` changes. |
| Tests | Vitest | pure modules only; no DOM in core tests |
| Audio | WebAudio, own synth | placeholder chiptune; real files swap in via a manifest |
| Persistence | `localStorage` | versioned JSON; in-memory fallback when storage throws |
| Node | ≥ 20 | tools and tests |

### 3.2 Repository layout

```
/
├─ docs/                    DESIGN.md · SOURCES.md · DECISIONS.md
├─ src/
│  ├─ core/                 PURE: rng, grid, pathfinding, danger, combat, exp, level,
│  │                        classes, promotion, supports, ai, objectives, events,
│  │                        fire/structures, battle, setup, army, camp, campaign, chapters
│  │                        (the story's steps), naming, dialogue, codex, save, and bot
│  │                        (the headless player the tests and the balance tool use)
│  ├─ data/                 JSON and the loaders over it: balance and campaignBalance,
│  │                        terrain, classes, skills, items, units, characters, chapters,
│  │                        supports, scenes/, codex/, maps/; battles.ts, story.ts and
│  │                        campaign.ts join them into the campaign and the demos
│  ├─ engine/               display (integer scaling), input (key/touch pad), assets
│  │                        (sprites rendered from definitions, optional overrides), bitmap
│  │                        text, window/menu/gauge drawing, game loop; later audio synth,
│  │                        storage adapter
│  ├─ scenes/               flow (title, chapters, camps and battles in order), battle,
│  │                        camp (Preparations, units, convoy, shops, talks, Maydan, class),
│  │                        story (cards, dialogue, pages), naming, title/settings/slots/Codex
│  │                        screens. Scene-specific panels (forecast, unit info) live beside
│  │                        their scene
│  └─ main.ts
├─ assets/
│  ├─ sprites/*.sprite.json palette-indexed sprite definitions (the source of truth)
│  ├─ palettes/*.json       faction and skin ramps
│  ├─ fonts/*.font.json     original 5×7 bitmap font
│  └─ music/*.song.json     tracker-style placeholder songs
├─ public/assets/
│  └─ override/             drop real art/audio here; wins over the bundled definitions
├─ out/                     tool output (PNG strips, atlas, contact sheets); git-ignored
├─ tools/
│  ├─ sprites/              kits/ (placeholder generators) · build.ts · lint.ts ·
│  │                        preview.html + preview-page.ts (served by the dev server)
│  ├─ lint-boundaries.ts    layering and purity lint
│  ├─ lint-sources.ts       data ↔ ledger join check
│  ├─ mapview.ts            a map and its spawns as text (`npx tsx tools/mapview.ts ch02-alexandria`)
│  └─ balance.run.ts        the balance tool: `npm run balance` (§14)
└─ tests/                   Vitest suites (mirror src/core)
```

Layering rules (enforced by an import-boundary lint in M1):

1. `core/` imports nothing from `data/`, `engine/`, `scenes/`, or the DOM, and uses no `Math.random`, `Date.now`, `performance.now` or timers. The import direction is `core ← data ← engine ← scenes`; `tools/lint-boundaries.ts` enforces it and runs in `npm run lint` and in the tests.
2. `engine/` never contains game rules.
3. Scenes orchestrate: they call `core/` functions and render the results.
4. Data is validated once at load (the `validate*` and `build*Table` functions of `core/`, and for the story `data/story.ts`) and typed afterwards; `tests/data.test.ts` and `tests/campaignData.test.ts` check it as a whole.

### 3.3 Determinism

- One seeded PRNG (`mulberry32`) behind an `Rng` interface: `next()`, `int(n)`, `state()`, `restore(s)`.
- A battle seeds from `hash(campaignSeed, chapterId)`. The RNG state is part of the suspend-save, so a reloaded battle plays out identically.
- Hit rolls default to **Honest** (`int(100) < hit%`). **Weighted** (`(int(100)+int(100))/2 < hit%`) is a setting. The forecast shows the nominal hit%, never a disguised figure.

### 3.4 Display pipeline

- Logical resolution **240×160**, drawn to one offscreen canvas.
- Presented at the largest **integer scale** that fits the window: `scale = max(1, floor(min(w/240, h/160)))`, centred, letterboxed. CSS `image-rendering: pixelated`; `imageSmoothingEnabled = false`.
- Device-pixel-ratio aware: the visible canvas backing store is `240·scale·dpr` where possible so scaling stays crisp on HiDPI.
- Camera scrolls in whole pixels. Map tiles are pre-rendered per chunk; only dynamic layers redraw per frame.

Screen layout (map view, 15×10 tiles of 16 px = 240×160):

```
┌──────────────────────────────────────────────┐
│ map tiles (scrolling)                        │
│                                 ┌──────────┐ │
│                                 │ unit info│ │  ← side flips so it never covers the cursor
│                                 └──────────┘ │
│ ┌────────────┐                               │
│ │ terrain    │                               │
│ └────────────┘                               │
└──────────────────────────────────────────────┘
```

### 3.5 Input

| Action | Keyboard | Touch |
|---|---|---|
| Move cursor | Arrow keys (hold to repeat) | Tap a tile; drag to pan |
| **Confirm** | `Z` | Tap the cursor tile again, or the on-screen **OK** |
| **Cancel** | `X` | On-screen **Back**, or two-finger tap |
| **Info** (unit/terrain details; previous unit in lists) | `A` | On-screen **Info** |
| **Danger** (danger zone; next unit in lists) | `S` | On-screen **Danger** |
| **Menu** (end-turn menu) | `Enter` | On-screen **Menu** |
| Pause / settings | `Esc` | On-screen cog |

Touch devices (`pointer: coarse`) show a translucent virtual pad and the five buttons above; it is hidden otherwise. All menus are fully operable by touch (tap = move highlight, tap highlighted = confirm). The five buttons correspond to the classic handheld layout (A, B, L, R, Start); I use plain names here to avoid confusion with the keyboard's `A` and `S` keys.

### 3.6 Data schemas (excerpt)

All data is JSON, validated at load by the `validate*` and `build*Table` functions of `core/` (there is no separate schema file).

```ts
type MoveType   = 'foot' | 'light' | 'mounted' | 'armored';
type WeaponKind = 'spear' | 'sabre' | 'mace'            // the Three Postures (triangle)
                | 'axe' | 'dagger'                      // melee, outside the triangle
                | 'bow' | 'crossbow' | 'javelin'        // ranged, outside the triangle
                | 'fire' | 'remedy';
type Stat       = 'hp' | 'mgt' | 'skl' | 'spd' | 'fort' | 'grd' | 'nrv' | 'bld' | 'mov';
type Stats      = Record<Stat, number>;
type Tier       = 1 | 2 | 3;
type Confidence = 'attested' | 'attested-differ' | 'inferred' | 'fictional' | 'unverified';

interface LedgerRef { ids: string[]; confidence: Confidence; note?: string }   // → SOURCES.md

interface TerrainDef {
  id: string; name: string;
  cost: Record<MoveType, number | null>;   // null = impassable
  cover: number;      // + Guard vs physical
  avoid: number;      // + evasion
  quench?: number;    // + Nerve vs fire (water)
  flammable?: boolean; heals?: number; vision?: number; tags?: string[];
}

interface ClassDef {
  id: string; line: string; tier: Tier;
  name: string;                  // common name shown by default (Pikeman, Spear Knight, …)
  historicalName?: string;       // flavour name (Kurdish Spearman, Muqaddam, …)
  moveType: MoveType;
  base: Stats;                   // class base at level 1 of this tier
  caps: Partial<Stats>;          // overrides of the tier defaults
  growthMod: Partial<Stats>;     // added to unit growths
  weapons: Partial<Record<WeaponKind, number>>;   // max grade per kind (1–5)
  skills: string[];              // 1–2 skill ids
  promotesTo?: string;           // the next tier in the same line
  promotionGain?: Partial<Stats>;
  ledger: LedgerRef;             // CLS-… (the historical anchor of the flavour name)
}

interface WeaponDef {
  id: string; name: string; kind: WeaponKind; grade: number;
  might: number; hit: number; crit: number; weight: number;
  range: [number, number]; uses: number; price: number;
  quick?: number;                                   // + Attack Speed (daggers)
  pierce?: number;                                  // ignores this much Guard (crossbows)
  effective?: Array<MoveType | 'structure'>;        // ×2 Might against these
  vsBonus?: Partial<Record<MoveType | 'structure', number>>;   // flat Might against these
  tags?: string[];                                  // 'brace', 'crush', 'breaker', 'thrown', 'ignite', …
}

interface UnitDef {
  id: string; name: string; side: 'player'|'ally'|'enemy'|'neutral';
  class: string; level: number; offset: Partial<Stats>; growth: Stats;
  weaponGrades?: Partial<Record<WeaponKind, number>>;
  inventory: string[]; skills?: string[];
  chronicled?: boolean;     // story-critical: retreats wounded, always returns
  fictional?: boolean;      // flagged in-game and in the ledger
  portrait?: string; sprite?: string;
  ledger: LedgerRef;        // MUST resolve to a CHR-… row
}
```

Support, dialogue and Codex shapes are in §7 and §9.

### 3.7 Map format

Maps are authored as readable ASCII layers plus a small JSON header, so they are diffable and testable:

```json
{
  "id": "ch00-tikrit", "name": "The Boats of Tikrit", "ledger": "CH-00",
  "size": [20, 15], "tileset": "steppe-river", "phaseOrder": ["player","ally","enemy"],
  "fog": false, "weather": null,
  "terrain": [
    "~~~~..,,..........GG..",
    "…one string per row, one character per tile (legend in tileset)…"
  ],
  "legend": { "~": "river", ".": "plain", ",": "reeds", "G": "grove", "F": "fort", "P": "pier" },
  "spawns":  { "player": [{ "unit": "ayyub", "at": [4, 6] }], "enemy": [] },
  "reinforcements": [{ "turn": 3, "phase": "enemy", "units": [{ "def": "caliphal-archer", "at": [19, 3], "ai": { "mode": "aggressive" } }] }],
  "objectives": { "primary": { "type": "hold-the-pass", "anchors": [[3,5],[3,6],[3,7]], "leakLimit": 1, "turns": 8 } },
  "events": "ch00-tikrit.events.json"
}
```

The sample is abridged for illustration (the `terrain` rows are elided). A Tiled (`.tmj`) importer is a possible later addition; the ASCII format stays canonical.

### 3.8 Events and triggers

Event conditions: `turnStart(turn, phase)`, `unitEntersTile`, `unitDefeated(unitId|tag)`, `hpBelow`, `talk(a,b)`, `visit(tile)`, `objectiveProgress`, `allDefeated(tag)`.
Event actions: `dialogue(sceneId)`, `spawn`, `setAi`, `openGate`, `giveItem`, `recruit`, `ignite(tile)`, `flag(name)`, `unlockCodex`, `endChapter(win|lose)`.
Events are pure data; the event runner is pure and unit-tested.

As built (`core/events.ts`): events live inline in the map's `events` array. A `when` is one condition or `{ all: [...] }` / `{ any: [...] }`. Triggers (`turnStart`, `enter`, `talk`, `visit`) are offered as they happen; conditions about defeats, HP and flags are checked against the battle each time anything changes. An event fires once unless `once: false`. Applying an action can satisfy another event, so the events are asked again, up to eight rounds. `enter` events fire when a unit *finishes* its action on the tile, never mid-move, so a move that is taken back cannot trigger them. An action that cannot be carried out (`giveItem` to a full pack, `openGate` where no gate stands, `ignite` on ground that will not burn) and `unlockCodex` (the Codex arrives in M6) are recorded in `battle.unhandled` rather than failing. `promote` queues a message naming the new class; `spawn` may name a structure as well as a unit. `dialogue` and `message` actions queue text for the player (the dialogue engine arrives in M5).

### 3.9 Save system

- **Slots:** 3 manual slots + 1 autosave (chapter start) in `localStorage` under `s2b:v1:*`.
- **Suspend-save** (mid-battle): serialises the full `BattleState`: units, positions, HP, statuses, turn, phase, fog memory, dynamic terrain, objective progress, event flags, **RNG state**. In Classic mode it is consumed on load; in Casual it is kept.
- **Versioning:** every save has `schemaVersion`; migrations are pure functions with tests.
- **Resilience:** all storage calls are wrapped; if storage is unavailable (private mode, quota), the game continues with an in-memory store and shows a notice.
- Save contents are plain JSON and compressed with a tiny RLE for map layers only if size becomes a problem (not expected).

As built (M6, `core/save.ts`, `core/campaign.ts`, `engine/storage.ts`): a save holds the campaign (mode, seed, story, chapter reached, flags, Codex unlocks and the army with its convoy, dinars, fallen, supports and deployment) and, for the suspend-save, the battle's *source* (what the data layer needs to build it again: a chapter, a demo) and its snapshot. Every unit is written once and referred to by number, so a unit in both the army and the battle is one unit when the save is read back. `BattleState.snapshot()` covers everything that is not fixed by the map, the tables and the rules (DECISIONS D-030 lists it), and `restore()` re-runs nothing, so the next random draw is the one the suspended battle would have made. Reading a save checks every field and refuses unknown classes, items, stories and battles with a message that names the field; the save list shows a damaged save as damaged. Keys are `s2b:v1:slot1` to `slot3`, `s2b:v1:auto`, `s2b:v1:suspend` and `s2b:v1:settings`. The autosave is written as a chapter's battle begins; a defeat returns to it.

As built (M7): the save format is **2**. It adds the step the campaign stands at, the Recruit's name and the units that are away (`army.away`, by definition id); a format-1 save migrates to it as step 0 with the name *Recruit* and no one away, and the migration is a pure function with a test. The storage keys keep `v1`: that names the layout of the keys, and `schemaVersion` names the contents. The autosave is written **as a camp is left**, so loading it resumes in that camp with its choices made, and **as a battle begins when no camp came right before it** (the council stage follows a scene, not a camp). A defeat loads it. A camp's conversations and drills are given when the campaign *arrives* at the camp, never when a save is loaded into it, so a save cannot be used to draw them twice.

### 3.10 The story as steps (as built, M7)

A story is an ordered table of chapters (`data/chapters.json`, built and checked by `core/chapters.ts`), and a chapter is a list of **steps**. The campaign stands at one step (`campaign.chapter`, `campaign.step`) and the flow (`scenes/flow.ts`) does what the step says, then goes on to the next.

| Step | What it does |
|---|---|
| `card` | a title card: the chapter's number, name and date (AH, then the Julian month and year, per D-002) |
| `name` | the screen that names the Recruit (§9.5) |
| `scenes` | dialogue scenes, played in order; what they raise (flags, Codex entries) is kept |
| `apply` | effects on the campaign with no screen of their own: `join` a unit (`count` for generic troops), `leave`, `away` (the units that are away *from now on*; it sets the list, it does not add to it), `grant` a support pair a rank (for what happened between chapters, off the screen), `train` (the story gives a unit levels: §5.7), `give` an item to the convoy, `dinars`, `flag`, `unlock` a Codex entry |
| `camp` | the Majlis (§8), with the label of the way on (*Hold the landings*, *Into the night*, …) |
| `battle` | a map; a win goes on, a defeat goes back to the camp before it |

So a chapter is data: a new one is a few lines in `chapters.json`, a map, scenes and units, and nothing in the flow changes. The headless player (`core/bot.ts`, §14) walks the very same steps, which is how the whole slice is tested from the title to the last page without a screen.

---

## 4. Battle rules

### 4.1 Grid, movement, terrain

- Movement is Manhattan, 4-directional. A unit may pass through allied units but not enemy units; it cannot stop on an occupied tile. There is no zone of control.
- Each tile has a **cost per movement type**; a unit spends its MOV along the cheapest path.
- **Cover** adds to Guard against physical attacks. **Avoid** adds to evasion against everything. **Quench** adds to Nerve against fire.

**Terrain table (initial values).** Cost columns are Foot / Light / Mounted / Armored; `–` = impassable.

| Terrain | Foot | Light | Mtd | Arm | Cover | Avoid | Notes |
|---|---|---|---|---|---|---|---|
| Plain | 1 | 1 | 1 | 1 | 0 | 0 | |
| Road / paved street | 1 | 1 | 1 | 1 | 0 | 0 | |
| Steppe grass (dry) | 1 | 1 | 1 | 1 | 0 | 0 | flammable |
| Grove (palm / orchard) | 2 | 1 | 3 | 3 | 1 | 20 | Ghouta, Nile palm groves |
| Hill | 2 | 2 | 3 | 3 | 1 | 10 | |
| Crag | 4 | 3 | – | – | 2 | 30 | |
| Dune (sand) | 2 | 2 | 3 | 4 | 0 | 5 | |
| Reeds / marsh | 3 | 2 | 4 | – | 0 | 5 | flammable; quench +2 |
| Shallows (ford) | 3 | 2 | 3 | – | 0 | 0 | quench +2 |
| River / deep water | – | – | – | – | | | ferries and bridges only |
| Bridge | 1 | 1 | 1 | 1 | 0 | 0 | |
| Pier / ferry landing | 1 | 1 | 1 | 1 | 0 | 0 | ally crossing tiles (CH-00) |
| House / village | 1 | 1 | 2 | 2 | 1 | 10 | `visit` events |
| Tent | 1 | 1 | 1 | 1 | 0 | 5 | flammable |
| Fort / citadel floor | 1 | 1 | 1 | 1 | 2 | 20 | |
| Rampart (walkable wall-top) | 2 | 2 | – | 3 | 2 | 30 | |
| Wall | – | – | – | – | | | breachable by structures logic |
| Gate (open) | 1 | 1 | 1 | 1 | 3 | 20 | closed gates are structures (§4.6) |
| Hospice / healing tent | 1 | 1 | 1 | 1 | 0 | 0 | heals 10% max HP at start of own phase |

Light units are lightly armed skirmishers, fire throwers, healers and scribes on foot; Mounted covers all cavalry including horse archers; Armored is the Man-at-Arms line.

### 4.2 Phases and turn flow

- A turn = **Player Phase → Ally Phase → Enemy Phase** (order configurable per map; `ally` is skipped when empty).
- Start of a phase: reinforcements, tile effects (healing tents, flames), status ticks, `turnStart` events.
- A unit acts once: **move, then one action**. Menu: *Attack · Remedy · Item · Trade · Bear · Talk · Seize · Visit · Open · class action (Sap / Entrench / Mend / Counsel / Dispatch) · Wait*.
- End of Player Phase prompts automatically when no unit can act, or via Start → *End Turn*.
- After the last phase of a turn the turn counter increments; objective checks run after every action, at the end of every phase and at the end of every turn. A side with no units is skipped, unless reinforcements are due on its phase.
- A side's units are readied at the start of *its own* phase. Healing ground (the hospice) restores 10% of maximum HP, rounded up, to the units of the side whose phase begins.
- Reinforcements arrive at the start of their phase on their tile, or on the nearest free tile if it is taken. Events that fire at a turn's start run after the reinforcements.

### 4.3 Actions

| Action | Rule |
|---|---|
| **Attack** | Choose a target in weapon range after moving. Counterattacks per §5.2. Each attack (hit or miss) uses 1 weapon durability. |
| **Remedy** | Healing items (Salve, Cordial…) restore `might + ⌊SKL/2⌋` HP to an adjacent ally. EXP for the healer (§5.7). |
| **Item** | Use a consumable; equip a weapon (free; equipping does not end the action). |
| **Trade** | Swap items with an adjacent ally (free). Convoy is only reachable in Camp. |
| **Bear** | Rescue-style. Carrier's BLD must exceed the target's BLD. While carrying: carrier's SKL and SPD halved (round down), cannot use fire or remedies; carried unit cannot act and cannot be targeted. *Set down* or *give* to an adjacent unit. |
| **Talk** | Adjacent to a flagged unit; plays a scene; may recruit, give an item, or reveal information. |
| **Seize** | Lord (or the unit the objective names) on a seize tile; wins a Seize chapter. |
| **Depart** | The escorted unit on an exit tile leaves the map; wins an Escort chapter. Explicit, like Seize, so a move can still be taken back. |
| **Visit** / **Open** | Villages (reward, info); doors and chests (key or Sap). |
| **Class actions** | See §6.4. |

As built (M4, `core/classActions.ts`): the menu offers, in this order, *Seize, Depart, Attack, Heal, Item, Trade, Talk, Visit,* then each class action the unit can take from where it stands (*Sap, Entrench, Mend, Counsel, Dispatch, Decree, Open*), then *Wait*. **Item** lists the pack: a weapon is equipped (free, the action is kept), a consumable or promotion item is used (spends the action). **Trade** is free: pick up a stack, then put it on a stack in the other pack to swap, or on the first free slot to give it. **Open** needs a Gate Key and a gate beside the unit. *Bear* is not built: nothing in the slice needs it (DECISIONS D-030). After an attack with *Wheel, Skirmish* or *Pursuit* the unit is offered its bonus move (Back to stay where it is).

### 4.4 Danger-zone display

A pure function `dangerZone(state, options) → { tiles, perUnit }`.

- For each *visible* enemy unit: reachable tiles (its MOV, costs, blocked by player units) expanded by each weapon's range ring, minus tiles it cannot attack.
- `stationary` enemies and structures contribute only their fixed rings.
- `defensive` enemies not yet triggered are drawn in a **different hatch** (yellow) so surprises are never hidden; active units are red.
- Press **Danger** (`S`) to toggle all; with the cursor on an enemy, **Confirm** (`Z`) shows that unit's range alone. Selecting a player unit shows move (blue), attack (red), remedy (green) as usual.
- Honours fog: only enemies the player can currently see contribute.
- As built (`core/danger.ts`): a unit holding its post (stationary, or defensive and not yet woken) is *active* only over what its own tile can reach; a defensive unit's wider reach if it woke, and the reach of a unit that is not yet activated, is *latent*, drawn as yellow diagonal hatching (a pattern, so it does not rely on colour). `active` and `latent` never overlap.

### 4.5 Fog of war

- Per-map flag, optionally per-phase (night streets, Ch. 3).
- Vision radius (tiles): Foot 3, Light 4, Mounted 4, Armored 3; **+1** on hills and ramparts, **+3** from watchtowers; chapters may apply a night penalty of −1.
- Unseen enemies are not drawn and not in the danger zone. Previously seen terrain stays drawn (explored memory); enemy positions do not.
- AI is **omniscient by default**; `ai.respectsFog` can be set per map where history calls for ambush (e.g., the Isma'ili attempts in Ch. 5). A unit that respects fog sees only what its own side can see.
- As built: allies share the player's vision; the map's `visionPenalty` (0–3) models night; vision bonuses are a terrain field (`vision`, +1 on hills and ramparts). Vision is a diamond (Manhattan radius); there is no line-of-sight blocking.

### 4.6 Structures and dynamic terrain

Structures are *units with `kind: 'structure'`*: HP, GRD, optional attack, no actions, occupy one tile, never move, can be attacked and destroyed. They cover **gates, barricades, mangonels, siege towers, rams**. This keeps pathing, danger zone and AI uniform.

| Structure | Behaviour |
|---|---|
| Closed gate | blocks movement; destroyed by attack (axes and siege-bolts deal double) or *Sap*; opens via *Open*/key/event |
| Barricade | built by a Sapper's or Engineer's *Entrench*; blocks Mounted and Armored; Foot/Light cost 2 |
| Mangonel | stationary, range 3–5, high Might; AI mode `stationary`; weak to fire |
| Siege tower / ram | like mangonel but moves 1 tile per turn on script; flammable |

**Flames** are a temporary tile overlay:

- Created by *Ignite* (fire attacks), events, or spread.
- Burn **2 turns** (3 on flammable tiles). A unit standing in flames takes **4 damage** at the end of the phase it ends on the tile. Flames block entry for non-flame-proof units.
- **Spread:** at the start of each phase every burning tile ignites adjacent *flammable* tiles with chance `spreadChance` (balance.json; `1.0` makes it deterministic in tests). A map-level `wind: N|E|S|W` biases spread (+50% downwind). This supports the Hattin brush fires; see SOURCES CH-08.

As built (M4, `core/structures.ts`, `core/battle.ts`):

- **Blocking.** A structure stops every mover, its own side included, except that *Foot* and *Light* units may climb a barricade for one extra movement point (they can pass over it, never stop on it). A structure is placed exactly where the map says, even on ground nobody could walk on (a wall segment stands on wall ground); if something is already there it takes the nearest free tile.
- **Falling.** A destroyed wall segment turns its tile into *plain* (a breach); a gate is simply gone. `terrainAt` is the battle's own view of the ground: breaches are an overlay on the map, and the scene redraws the map when the overlay changes.
- **What they are not.** A structure is no soldier: it never holds a *Rout* open, sees nothing, earns and gives no EXP (the weapon still learns), cannot be healed or talked to, and a side with nothing that can act has no phase. Fire does double Might against a structure that burns (barricade, mangonel), ignoring its Guard; axes and siege bolts double against any. A structure has no attack speed, so a quick attacker strikes it twice.
- **Siege engines** fire on their side's phase like a stationary unit (range 3 to 5); a structure on the player's side has no computer plan.
- **Flames** burn for 2 turns, 3 on dry ground, counted down once a turn. A unit (or structure) standing in them at the end of its own side's phase takes 4 damage (8 for a structure that burns) and is marked *Burning*; a side whose phase is skipped still has its flames burn when the phase would have ended. Flames block entry; a unit already in them may leave. At the start of each phase every burning tile draws once for each dry, unlit neighbour (north, east, south, west, tiles in key order) and lights it with `spreadChance`, raised by half downwind; fires lit now do not spread until the next phase. A fire weapon that hits lights the target's tile if the weapon is incendiary or the thrower has *Ignite* (*Wildfire* counts as having it, and lights the first dry tile beside the target too). *Fire Storm* strikes the neighbouring enemy who would take most for half damage, which always lands and gives no EXP.

### 4.7 Objectives

| Type | Parameters | Win | Lose |
|---|---|---|---|
| **Rout** | `ignoreTags?` | no non-ignored enemy remains | Lord retreats |
| **Seize** | `tiles[]`, `by` (`lord`/`any`/unit) | a qualifying unit uses *Seize* | Lord retreats |
| **Defend N** | `turns`, `anchor?` | end of turn N | Lord retreats; anchor tile/unit lost |
| **Hold the Pass** | `anchors[]`, `leakLimit`, `turns?` | end of turn N, or all enemies defeated | more than `leakLimit` enemies cross, or enemies hold ≥ *k* anchors at end of an enemy phase |
| **Escort** | `unit`, `exit[]` | escort reaches an exit | escort retreats |
| **Survive** | `turns` | end of turn N | Lord retreats |
| **Persuade** (Talk puzzle) | `targets[]`, `turns` | all targets recruited | turns exhausted (Ch. 3 council) |

Maps have one primary objective, optional secondary objectives (rewards), and optional extra fail conditions. Objective evaluation is pure and tested.

As built (`core/objectives.ts`):

- **Defeat is judged before victory,** so a Lord who falls on the action that would have won still loses. A unit tagged `lord` falling loses *every* objective type; a unit that leaves by an exit has *escaped*, not fallen.
- **Checkpoints:** after every action, at the end of a phase, and at the end of a turn. "The end of turn N" is decided before the counter advances, so the chapter ends on turn N.
- **Rout** and **Hold the Pass** wait for reinforcements still to come before they count the enemy as gone.
- **Hold the Pass** has `anchors`, `leakLimit` (more than this many *distinct* enemies reaching an anchor loses), `holdLimit` (enemies standing on this many anchors at the end of an enemy phase loses) and `turns`; at least one of the three is required.
- **Defend** may name an `anchor`: a unit (lost if it falls) or a tile (lost if an enemy stands on it at the end of the enemy phase).
- **Persuade** wins when every target has been recruited by a *Talk* event, and loses at the end of turn N.

### 4.8 Retreat and permadeath

Wording in all UI and text: **"retreats wounded"**. No graphic depiction; the unit flashes and fades from the map.

| Rule | Classic | Casual |
|---|---|---|
| Ordinary unit reaches 0 HP | retreats wounded and **leaves the army** (listed on the Casualty roll in Camp) | retreats wounded; **returns next chapter** |
| *Chronicled* unit (`chronicled: true`) | retreats wounded; **returns next chapter** | same |
| Lord / escort / anchor retreats | chapter fails (retry from chapter start or suspend) | same |

Chronicled units are those the sources place in later events. Historical deaths happen only as scripted story beats (e.g., Shirkuh, March 1169) and never through battle outcomes.

---

## 5. Combat

### 5.1 Stats

| Stat | Abbr | Role |
|---|---|---|
| Vigor | HP | hit points |
| Might | MGT | physical attack power (melee weapons, bows, crossbows, javelins) |
| Skill | SKL | accuracy and critical; also **fire power** ("craft") |
| Speed | SPD | evasion and follow-up attacks |
| Fortune | FORT | small accuracy/evasion bonus; critical avoidance |
| Guard | GRD | defence vs physical |
| Nerve | NRV | defence vs fire; resistance to heat and fear |
| Build | BLD | weapon load; carrying |
| Move | MOV | tiles per turn (class + unit; rarely grows) |

Level-up: for each of HP, MGT, SKL, SPD, FORT, GRD, NRV, `+1` if `rng·100 < growth` (unit growth + class `growthMod`). If a level-up gains nothing, the highest-growth stat is re-rolled once (setting: *Guaranteed progress*, default on).

### 5.2 Formulas (pure, in `core/combat.ts`)

Let A = attacker, D = defender, `W` = equipped weapon (D's weapon `Wd` only if it can reach the distance), `tri` = triangle result for A (+1 / 0 / −1), `T` = terrain on each unit's tile, `S` = support bonuses.

```
AS(u)       = SPD(u) − max(0, W(u).weight − BLD(u)) + W(u).quick
power(A)    = stat(A) + W.might·(effective(W, D) ? 2 : 1) + vsBonus(W, D) + tri     stat = MGT, or SKL for fire
defence(D)  = fire ? NRV(D) + quench(T_D)
                   : GRD(D) + cover(T_D) − pierce(W)               (fire ignores cover)
damage      = max(0, power − defence)

accuracy(A) = W.hit + 2·SKL(A) + ⌊FORT(A)/2⌋ + 10·tri + S_A.hit
evasion(D)  = 2·AS(D) + FORT(D) + avoid(T_D) + S_D.avoid
hit%        = clamp(accuracy − evasion, 0, 100)

critRate    = clamp(W.crit + ⌊SKL(A)/2⌋ + S_A.crit − FORT(D), 0, 100)
critDamage  = damage × 3

double      = AS(A) ≥ AS(D) + 4        (the same test applies to D's counter)
counter     = D has a usable weapon whose range includes the distance
```

A structure target (§4.6) has GRD and HP but no attack speed: its evasion is the terrain avoid only, and `effective` / `vsBonus` entries keyed `'structure'` apply.

Sequence: A strikes; if D survives and can counter, D strikes; then each side with `double` strikes again (A's second hit, then D's second hit). Dead units stop the sequence. Each strike (hit or miss) uses 1 durability; at 0 the weapon breaks, and a weapon with one use left cannot make a second strike.

**Random draws (fixed order, so a seed replays exactly).** For each strike: one hit roll (two, averaged, in Weighted mode), then, only if it hit and the crit chance is above 0, one crit roll. Level-ups draw one roll per growth stat in the order HP, MGT, SKL, SPD, FORT, GRD, NRV whether or not the stat is capped, then at most one re-roll for Guaranteed progress. The forecast never draws.

**Worked example** (Salah ad-Din, Young Lord Lv 3, Iron Sabre, attacks a Soldier with a Levy Spear standing in a grove):

| | Salah ad-Din | Soldier |
|---|---|---|
| Stats | MGT 6, SKL 6, SPD 7, FORT 3, GRD 3, BLD 7 | MGT 5, SKL 3, SPD 4, FORT 1, GRD 3, BLD 6 |
| Weapon | Iron Sabre (mt 5, hit 90, crit 5, wt 4) | Levy Spear (mt 5, hit 85, crit 0, wt 6) |
| Triangle | Sabre > Spear: **+1** | **−1** |
| AS | 7 | 4 |
| Accuracy | 90 + 12 + 1 + 10 = **113** | 85 + 6 + 0 − 10 = **81** |
| Evasion | 14 + 3 + 0 (plain) = **17** | 8 + 1 + 20 (grove) = **29** |
| Hit% | 113 − 29 = **84%** | 81 − 17 = **64%** |
| Power / Defence | 6 + 5 + 1 = 12 vs 3 + 1 = 4 → **8 damage** | 5 + 5 − 1 = 9 vs 3 → **6 damage** |
| Crit | 5 + 3 − 1 = **7%** (24 dmg) | 0 + 1 − 3 → **0%** |
| Double? | 7 vs 4 + 4 = 8 → no | no |

The forecast shows exactly these numbers.

### 5.3 Weapon types and the original triangle: **the Three Postures**

There are ten weapon types. Three melee families form the triangle; the other seven sit **outside** it, each with its own job. The triangle was approved as designed; bows stay outside it, and four further medieval weapon types (axe, dagger, crossbow, javelin) were added.

```
Spear (rumh) ──▶ Mace (dabbus) ──▶ Sabre (sayf) ──▶ Spear      read "A ──▶ B" as "A beats B"
```

| Attacker | Beats | Reason (shown in the Codex) |
|---|---|---|
| **Spear** | **Mace** | the point keeps a heavy swing at the end of its arc |
| **Mace** | **Sabre** | weight crushes the guard of a lighter blade |
| **Sabre** | **Spear** | inside the point, the blade is faster |

- **Advantage:** +1 Might, +10 accuracy for the winner; −1 Might, −10 accuracy for the loser. Equal or unrelated types: no change.

| Type | Range | Job | Typical stats, grade I → V | Special |
|---|---|---|---|---|
| **Spear** | 1 | triangle: beats Mace; reach | Might 5→12, Hit 85, Wt 5–9 | **Brace** (×2 vs Mounted) on Brace Spears; Cavalry Lances are mounted-only |
| **Sabre** | 1 | triangle: beats Spear; fast and accurate | Might 5→11, Hit 90, Crit 5–10, Wt 3–6 | |
| **Mace** | 1 | triangle: beats Sabre; heavy | Might 6→13, Hit 80, Wt 8–11 | **Crush** (+3 Might vs Armored) |
| **Axe** | 1 | heavy hitter; gate-breaker | Might 7→15, Hit 70–75, Crit 5–10, Wt 9–12 | **Breaker** (×2 vs structures: gates, barricades, siege engines) |
| **Dagger** | 1 | light and precise | Might 2→6, Hit 100, Crit 10–20, Wt 1–2 | **Quick** (+2 Attack Speed, so light units double more often) |
| **Bow** | 2–3 | foot and mounted archery | Might 4→10, Hit 85, Wt 3–5, Uses 40 | cannot counter adjacent attackers (the *Short Bow* is 1–2 with −10 accuracy at range 1) |
| **Crossbow** | 2 | armour-piercing, slow and heavy | Might 7→12, Hit 75, Wt 9–11, Uses 20 | **Pierce 2** (ignores 2 Guard); cannot counter adjacent attackers |
| **Javelin** | 1–2 | thrown skirmish weapon | Might 4→8, Hit 80, Wt 2–4, Uses 12 | counters at range 1 **and** 2 |
| **Fire** | 1–2 | naphtha pots and jars | Might 6→11, Hit 70, Wt 6–8, Uses 6–8 | uses **SKL** as its power stat, **ignores cover**, is reduced by **NRV** (+ water quench); *Ignite* leaves flames on the target tile |
| **Remedy** | 1 | no attack: heals | heals 8 → full | |

- **Quick, Pierce, Brace, Crush, Breaker** are data tags (`quick`, `pierce`, `effective`, `vsBonus`), so a new weapon type or variant needs data, not engine code.
- Historical anchors for each type are in SOURCES §6.2. The Three Postures reasons above are the game's own, not claims about historical doctrine.
- It is a three-way cycle, like many tactical games; the names, reasons, magnitudes and the surrounding families are this game's own (DECISIONS D-006, D-024).

### 5.4 Weapons, grades, items

- **Weapon grades I–V** per type, earned by weapon EXP (WEXP): grade thresholds `0 / 15 / 40 / 80 / 140`. Each fight in which a unit struck at least once adds 1 WEXP (2 if it made the kill); a heal adds 1 to Remedy. Only player units earn WEXP. A unit starts with at least the grade needed for its starting weapons, within its class cap. Each weapon needs a grade to equip; classes cap the grade (§6.4).
- **Durability:** each strike uses 1. Broken weapons are removed. *Mend* restores uses.
- **Inventory:** 5 slots per unit. **Convoy** (the baggage train, *athqal*): 100 slots, Camp only.
- **Currency:** dinars.

Initial item list (names original; values tunable):

| Type | Items (grade) |
|---|---|
| Spear | Levy Spear (I), Brace Spear (II), Steel-Head Spear (III), Cavalry Lance (IV, mounted only) |
| Sabre | Iron Sabre (I), Syrian Sabre (III), Curved Blade (IV) |
| Mace | Iron Mace (I), Flanged Mace (III) |
| Axe | Hatchet (I), Tabarzin (II), Halberd (III) |
| Dagger | Knife (I), Khanjar (II), Stiletto (III) |
| Bow | Short Bow (I), Composite Bow (III), Great Composite Bow (IV) |
| Crossbow | Light Crossbow (I), Frankish Crossbow (II), Winch Crossbow (III) |
| Javelin | Javelin (I), Heavy Javelin (II), Mizraq (III) |
| Fire | Naphtha Pot (I), Flame Jar (III) |
| Remedy | Salve (I), Cordial (III), Theriac (IV) |
| Consumables | Water Skin (cures Thirst), Rose-water Sherbet (heal 10 + cures Heat), **Charter of Iqta'** (promotion I→II), **Diploma of Investiture** (promotion II→III), Bandage, Gate Key |

### 5.5 Forecast screen

Opened when the cursor confirms an attack target:

```
┌──────────────────────────────────────────┐
│  Salah ad-Din  Lv3      Soldier Lv2      │
│  Iron Sabre ▲           Levy Spear ▼     │
│  HP  20 → 14            HP  18 → 10      │
│  DMG   8 ×1             DMG   6 ×1       │
│  HIT  84                HIT  64          │
│  CRT   7                CRT   0          │
│  [Z] Fight  [X] Back  [A] Details        │
└──────────────────────────────────────────┘
```

HP shown as *current → expected after the exchange if all hits land*. `▲/▼` mark triangle advantage. Details lists AS, accuracy, evasion, cover, support bonuses.

### 5.6 Battle presentation

- **Map animations** (default): attacker lunges, defender flashes, HP bar drains, numbers pop.
- **Battle scene** (setting, *deferred*): 32×32 battle sprites face each other on a ground strip with the same math; skippable with `X`. The slice ships map animation only; the battle scene needs battle sprites and is a post-slice feature (DECISIONS D-028).
- Defeat: flash and fade ("retreats wounded"); no blood effects exist in the asset set.

### 5.7 EXP, levels, caps

- **100 EXP per level.** Only player units earn EXP; a unit that is defeated earns none. Every tier runs **levels 1–20**, and promotion **resets the level to 1** (the classic model, §6.6). A unit at level 20 earns no EXP until it promotes; Tier III is the end of a line.
- Effective level for comparisons: `effLevel = level + 20·(tier − 1)`.
- `La` = actor's effective level, `Ld` = opponent's. EXP is multiplied by the actor's tier rate (Tier I ×1.0, Tier II ×0.85, Tier III ×0.7; `balance.json`) and rounded down, with a minimum of 1.

```
combat, damage dealt, no kill :  clamp(10 + 3·(Ld − La), 1, 30)
kill                          :  clamp(20 + 4·(Ld − La), 5, 70)  (+40 if boss-flagged)
combat, no damage dealt       :  1
remedy                        :  min(30, 5 + HP restored)
class action (counsel, mend…) :  8
```

- Stat caps come from the class: Tier I default 20 (HP 40), Tier II 30 (HP 60), Tier III 40 (HP 80); BLD caps are lower (14 / 20 / 26); class overrides live in data.
- **Tuning target** (checked by a balance script): in the slice a front-line unit reaches level 10 about the end of Chapter 3, and Salah ad-Din, who earns bonus EXP as the Lord, is level 10 or higher by the Chapter 3 rank event.

As built (M7), the numbers above are the engine's (`balance.json`), and the campaign differs from them in two ways:

- **The campaign's own balance** (`data/campaignBalance.json`, laid over `balance.json` by `data/campaign.ts`) sets the tier EXP rates to ×2.0, ×1.7 and ×1.4. The slice gives an army four or five fights and no ground to grind on; at ×1.0, 0.85 and 0.7 a Tier I soldier who fought through all of it ended at level 3 or 4 and the army earned 150 to 370 EXP a battle, which made a level a rare event. Now an army earns about 250 to 640 a battle, and the generic troops end the slice at levels 3 to 5. The proving ground, the demos and the engine's tests keep the engine's rates.
- **Story levels.** The tuning target above is not met by fighting and was dropped for the slice: Salah ad-Din joins at level 1 in Chapter 1, so the story *gives* him levels (`train`, §3.10): +3 at the start of Chapter 2 (he holds Alexandria as a Young Lord at level 4), +3 at the start of Chapter 3 and +3 at Shirkuh's deathbed, which brings him to level 10 for the rank event of the council, where he is promoted to Lord at level 1. The levels are rolled with a seed drawn from the campaign's, so the same campaign always trains the same Salah. A level of 10 for the rest of the army was a target for a longer story: the Charter of Iqta' goes to those the story names, and the army's levy stays Tier I through the slice.

---

## 6. Classes, skills, promotion

### 6.1 Movement types and tiers

Foot (MOV 5) · Light (MOV 6) · Mounted (MOV 7–8) · Armored (MOV 4). Terrain costs in §4.1.

There are **three tiers**. Every class belongs to a *line* of three (for example Swordsman → Blademaster → Legend). Tier I is the recruit class; Tiers II and III are promotions (§6.6). Class names use the **common English format**; each class also carries a **historical flavour name** from the sources or, where the sources give none, a flagged game label (§6.7, SOURCES §6).

### 6.2 The fourteen class lines

| Line | Tier I | Tier II | Tier III | Move (I / II / III) | Role | Historical flavour (I / II / III) |
|---|---|---|---|---|---|---|
| Lord | Young Lord | Lord | Sovereign | Foot / Mounted / Mounted | story leaders | Fata\* / Amir / Sultan |
| Soldier | Soldier | Man-at-Arms | Bulwark | Foot / Armored / Armored | levy, then the armoured front | Jundi / Ghulam Guard / Amir of the Guard\* |
| Pike | Pikeman | Spear Knight | Pike Marshal | Foot / Foot / Foot | anti-cavalry spear line | Kurdish Spearman / Muqaddam / Kurdish Amir\* |
| Sword | Swordsman | Blademaster | Legend | Foot / Foot / Foot | duelists | Jundi swordsman\* / Faris / Faris al-Muslimin |
| Axe | Axeman | Axe Knight | Warlord | Foot / Foot / Foot | heavy hitters, gate-breakers | axe-bearer\* / halberdier / Amir\* |
| Bow | Archer | Marksman | Master Archer | Foot / Foot / Foot | foot archers | bowman / —\* / —\* |
| Horse archer | Horse Archer | Horse Marksman | Steppe Lord | Mounted ×3 | mobile archers | Turkmen Horse Archer / Furusiyya Master\* / Turkmen Amir\* |
| Cavalry | Horseman | Mounted Knight | Cavalry Marshal | Mounted ×3 | shock cavalry | Mamluk Cavalry / Faris / Amir |
| Crossbow | Crossbowman | Arbalester | Crossbow Master | Foot ×3 | armour-piercing shooters | arbalist / —\* / —\* |
| Skirmish | Skirmisher | Harrier | Vanguard | Light ×3 | javelins and daggers; harassment | light-armed trooper / —\* / —\* |
| Fire | Fire Thrower | Fire Master | Master of Flames | Light ×3 | naphtha | Naffat / —\* / —\* |
| Engineer | Sapper | Engineer | Master Engineer | Foot ×3 | sieges and terrain | Najjar (*naqqab*, miner) / Muhandis\* / —\* |
| Medic | Healer | Physician | Master Physician | Light ×3 | remedies | Tabib / Hakim\* / chief physician |
| Scribe | Scribe | Counselor | Vizier | Light ×3 | support and counsel | Katib / Qadi / Wazir |

\* A game label: the flavour name is not (yet) attested in the sources read. The ledger says which are attested (SOURCES §6).

Historical characters sit where their role suggests (SOURCES §4): Ayyub is a Spear Knight, Shirkuh an Axe Knight (his halberd appears in Ibn Khallikan), Isa al-Hakkari and Ibn Shaddad are Counselors, al-Qadi al-Fadil a Counselor who becomes a Vizier, Qaraqush an Engineer, Keukburi a Horse Marksman. Salah ad-Din and his sons are Lord-line units.

### 6.3 Tier I base stats (initial)

Level-1 class bases; units add a personal offset. Order: HP · MGT · SKL · SPD · GRD · NRV · BLD · MOV (FORT is personal).

| Line (Tier I) | HP | MGT | SKL | SPD | GRD | NRV | BLD | MOV |
|---|---|---|---|---|---|---|---|---|
| Young Lord | 19 | 5 | 5 | 6 | 3 | 1 | 7 | 5 |
| Soldier | 18 | 4 | 3 | 4 | 3 | 0 | 6 | 5 |
| Pikeman | 19 | 5 | 4 | 4 | 3 | 0 | 7 | 5 |
| Swordsman | 18 | 4 | 6 | 7 | 2 | 0 | 5 | 5 |
| Axeman | 21 | 6 | 3 | 3 | 3 | 0 | 8 | 5 |
| Archer | 17 | 4 | 5 | 5 | 2 | 1 | 5 | 5 |
| Horse Archer | 17 | 4 | 5 | 7 | 2 | 1 | 5 | 7 |
| Horseman | 20 | 5 | 4 | 5 | 4 | 0 | 8 | 7 |
| Crossbowman | 18 | 5 | 4 | 3 | 3 | 0 | 7 | 5 |
| Skirmisher | 16 | 3 | 5 | 7 | 1 | 1 | 4 | 6 |
| Fire Thrower | 16 | 2 | 6 | 5 | 1 | 2 | 4 | 6 |
| Sapper | 18 | 4 | 3 | 3 | 3 | 1 | 8 | 5 |
| Healer | 15 | 1 | 4 | 4 | 1 | 4 | 4 | 6 |
| Scribe | 14 | 1 | 3 | 4 | 1 | 5 | 4 | 6 |

Stat caps: Tier I HP 40, others 20 (BLD 14) · Tier II HP 60, others 30 (BLD 20) · Tier III HP 80, others 40 (BLD 26). Class overrides live in data (for example Bulwark GRD 48, Legend SPD 44, Steppe Lord SPD 44, Master Physician NRV 46).

### 6.4 Weapon grades by tier

Maximum grade per weapon type, as I / II / III (`–` = cannot use).

| Line | Weapon grades |
|---|---|
| Lord | Sabre III/V/V · Spear II/IV/V · Bow I/II/III · Mace –/III/IV |
| Soldier | Spear III/III/IV · Sabre II/III/III · Mace I/IV/V · Axe –/II/IV |
| Pike | Spear IV/V/V · Sabre II/III/IV · Mace I/III/III · Javelin I/II/II |
| Sword | Sabre IV/V/V · Dagger II/III/IV · Spear I/II/II |
| Axe | Axe IV/V/V · Mace II/III/IV · Javelin I/II/II |
| Bow | Bow IV/V/V · Dagger I/II/II |
| Horse archer | Bow IV/V/V · Sabre II/III/IV · Javelin I/II/III |
| Cavalry | Spear III/V/V · Sabre III/IV/V · Mace I/III/IV |
| Crossbow | Crossbow IV/V/V · Dagger I/II/III |
| Skirmish | Javelin IV/V/V · Dagger II/III/IV · Bow I/II/III |
| Fire | Fire IV/V/V · Dagger I/II/II |
| Engineer | Mace III/IV/V · Axe II/III/IV · Spear II/III/III · Fire –/II/III |
| Medic | Remedy IV/V/V · Dagger I/I/II |
| Scribe | Remedy II/III/IV · Dagger I/I/II |

Individual units may override grades (for example Isa al-Hakkari is a Counselor who is also a capable swordsman).

### 6.5 Skills

Each class has one or two skills. A line has three skills (`s1`, `s2`, `s3`): Tier I has `s1`; Tier II has `s1` and `s2`; Tier III has `s2` and `s3`.

| Line | s1 | s2 | s3 |
|---|---|---|---|
| Lord | `stand-fast` | `presence` | `command`, `clemency`\* |
| Soldier | `stand-fast` | `shield-wall` | `bulwark` |
| Pike | `highlander` | `phalanx` | `counter-charge` |
| Sword | `parry` | `keen-edge` | `last-stand` |
| Axe | `heavy-blow` | `sunder` | `warcry` |
| Bow | `steady-aim` | `long-draw` | `deadeye` |
| Horse archer | `wheel` | `swift` | `skirmish` |
| Cavalry | `shock` | `presence` | `pursuit` |
| Crossbow | `piercing-bolt` | `bolt-volley` | `siege-bolt` |
| Skirmish | `elusive` | `harry` | `lightstep` |
| Fire | `ignite` | `wildfire` | `fire-storm` |
| Engineer | `sap` | `entrench` | `mend` |
| Medic | `triage` | `cure` | `renewal` |
| Scribe | `counsel` | `dispatch` | `decree` |

\* The Lord's Tier III has `command` (the upgraded `presence`) plus `clemency`, so it lists both.

| Skill | Effect (initial) |
|---|---|
| `stand-fast` | If the unit did not move this turn: +1 GRD and +10 avoid until the next phase |
| `presence` | Allies within 2 tiles: +5 accuracy, +5 avoid |
| `command` | Allies within 3 tiles: +10 accuracy, +10 avoid (replaces `presence`) |
| `clemency` | Each non-boss enemy this unit defeats adds 30 dinars of ransom to the chapter reward |
| `shield-wall` | Adjacent allies gain +1 GRD (does not stack) |
| `bulwark` | Takes 2 less damage from physical attacks (never below 0) |
| `highlander` | Hills and crags cost 1; +10 avoid on them |
| `phalanx` | +1 GRD for each adjacent ally wielding a spear (max +3) |
| `counter-charge` | Counterattacks against Mounted units always hit and gain +3 Might |
| `parry` | +10 avoid when defending against a melee attack |
| `keen-edge` | +15 crit with sabres and daggers |
| `last-stand` | Below 25% HP: +15 avoid and +10 crit |
| `heavy-blow` | +2 Might against targets with lower BLD |
| `sunder` | A hit lowers the target's GRD by 1 until the end of the next phase (stacks to −3) |
| `warcry` | At the start of the Player Phase allies within 2 tiles gain +2 MGT for that phase |
| `steady-aim` | +10 accuracy with bows and crossbows if the unit did not move |
| `long-draw` | Bow range +1 (max 4) if the unit did not move |
| `deadeye` | +20 crit with bows |
| `wheel` | After attacking (not countering) move up to 2 tiles |
| `swift` | +1 MOV |
| `skirmish` | As `wheel`, up to 3 tiles |
| `shock` | +2 Might when attacking after moving at least 4 tiles this action |
| `pursuit` | After defeating an enemy, move up to 2 tiles (once per turn) |
| `piercing-bolt` | Crossbows gain +1 Pierce |
| `bolt-volley` | +3 Might with crossbows against Armored or Mounted targets |
| `siege-bolt` | Crossbows deal ×2 Might against structures |
| `elusive` | +10 avoid |
| `harry` | A unit this unit hits loses 10 avoid until the end of the phase |
| `lightstep` | All passable terrain costs 1 |
| `ignite` | Fire attacks leave Flames on the target tile (§4.6) |
| `wildfire` | `ignite` also starts flames on one adjacent flammable tile |
| `fire-storm` | Fire attacks also strike one adjacent enemy of the target for half damage |
| `sap` | Action: deal 8 damage to an adjacent wall or gate structure; at 0 it becomes a breach (plain) |
| `entrench` | Action: place a Barricade on an adjacent empty tile (3 per chapter) |
| `mend` | Action: restore 10 uses to an adjacent ally's weapon (once per turn) |
| `triage` | Remedy heals +3 if the target is below 50% HP |
| `cure` | Remedy also clears Thirst, Heat and Burn |
| `renewal` | Adjacent allies regain 5 HP at the start of the Player Phase |
| `counsel` | Action: one ally within 3 gains +10 accuracy and +10 avoid until the end of the next enemy phase |
| `dispatch` | Action: an ally within 2 acts again (once per turn; not on Lords) |
| `decree` | Action, once per chapter: all allies gain +10 accuracy and +10 avoid until the end of the next enemy phase |

### 6.6 Promotion (the classic reset)

- **Eligibility:** level 10 or higher in the current tier, and either a promotion item or a story rank event.
- **Items:** the **Charter of Iqta'** (Tier I → II) and the **Diploma of Investiture** (Tier II → III). An *iqta'* was a revenue assignment in return for service; the diploma stands for formal investiture. Tier III is a late-campaign feature: the Diploma first appears around Chapter 8 and is rare.
- **Effect:** the unit's **level resets to 1** and EXP to 0; stats gain the line's `promotionGain`; caps rise to the new tier; **weapon EXP is kept** and the unit may use grades up to the new class's maxima; HP is fully restored; skills are replaced by the new class's skills; MOV follows the new movement type (a Young Lord's 5 becomes a Lord's 7).
- **Lord rank events:** Lord-line units promote through scripted events. In Chapter 3 the appointment as vizier unlocks Salah ad-Din's promotion to Lord; if he is below level 10 at that moment the event grants the Charter instead. The Lord → Sovereign event is planned for the middle of the campaign (to be sourced).
- **Stat gains (initial).** Order: HP · MGT · SKL · SPD · GRD · NRV · BLD · MOV. A test asserts that each Tier II and III class base equals the Tier I base plus the cumulative gains.

| Line | Tier I → II | Tier II → III |
|---|---|---|
| Lord | 11 4 4 4 4 3 3 +2 | 8 3 3 3 3 3 2 0 |
| Soldier | 6 3 2 1 5 1 5 −1 | 7 3 2 1 4 2 3 0 |
| Pike | 7 3 3 3 3 2 3 0 | 7 3 3 2 3 2 2 0 |
| Sword | 6 3 4 4 2 1 2 0 | 6 3 3 4 2 2 1 0 |
| Axe | 7 4 2 2 3 1 3 0 | 8 4 2 2 3 1 2 0 |
| Bow | 6 3 4 3 2 2 2 0 | 6 3 4 2 2 2 1 0 |
| Horse archer | 6 3 4 4 2 2 2 +1 | 6 3 3 3 2 2 1 0 |
| Cavalry | 8 4 3 3 4 2 4 +1 | 8 3 3 2 3 2 2 0 |
| Crossbow | 7 4 3 2 3 1 3 0 | 7 4 3 1 3 2 2 0 |
| Skirmish | 6 3 3 4 2 2 2 +1 | 6 2 3 4 2 2 1 0 |
| Fire | 6 2 4 3 2 2 2 0 | 6 2 4 2 2 3 1 0 |
| Engineer | 8 3 3 2 3 2 3 0 | 7 3 3 2 3 2 2 0 |
| Medic | 5 2 4 3 2 4 2 0 | 6 2 3 2 2 4 1 0 |
| Scribe | 7 2 4 3 2 4 2 0 | 6 2 3 2 2 4 1 0 |

- **Reclassing (stretch, M4 if it fits):** at the Maydan a unit may train a *secondary discipline*: it gains Grade I in another line's weapon types and that line's Tier I skill, for a fee and one Drill Token. Stats and primary class are unchanged.
- Promotion rules are unit-tested (§14).

### 6.7 Class names: the common format, and what changed

The first draft's classes were a mix of source terms and game labels (*Fata*, *Furusiyya Master*, *Master of Naphtha*, *Hakim*). They are now mapped to a familiar format, and the historical terms live on as **flavour names**:

| First draft | Now | Line | First draft | Now | Line |
|---|---|---|---|---|---|
| Fata | Young Lord | Lord | Turkmen Horse Archer | Horse Archer | Horse archer |
| Amir | Lord | Lord | Furusiyya Master | Horse Marksman | Horse archer |
| Jundi | Soldier | Soldier | Mamluk Cavalry | Horseman | Cavalry |
| Ghulam Guard | Man-at-Arms | Soldier | Faris | Mounted Knight | Cavalry |
| Kurdish Spearman | Pikeman | Pike | Naffat | Fire Thrower | Fire |
| Muqaddam | Spear Knight | Pike | Master of Naphtha | Fire Master | Fire |
| Najjar | Sapper | Engineer | Tabib | Healer | Medic |
| Muhandis | Engineer | Engineer | Hakim | Physician | Medic |
| Katib | Scribe | Scribe | Qadi | Counselor | Scribe |

New lines added for the new weapon types and the Swordsman line: **Sword, Axe, Bow, Crossbow, Skirmish**.

- **Originality.** The brief rules out copying class names from any existing game. A few natural names belong to one well-known series' class list, so I avoided them: the Sword line reads Swordsman → **Blademaster** → Legend (not *Swordmaster*), and I avoided *Paladin, Sniper, Hero, General, Mercenary* and similar. Ordinary words (Soldier, Archer, Healer) are kept because they are plain English, not anyone's property. Using *Swordmaster* anyway would be a one-word data change.
- **Display setting:** *Class names: Common / Historical / Both* (default Common). In the Codex each class entry shows its flavour name, its source (or the "game label" flag) and the caveats.

### 6.8 Historical anchors

SOURCES §6.1 holds one row per class line with the sources, the attested flavour names and the caveats; §6.2 does the same for the ten weapon types. The headline anchors:

- **Naffat → Fire Thrower:** Ibn Shaddad names "throwers of naphtha" and the Damascene caldron-maker who burned the Frankish towers at Acre.
- **Crossbowman:** Ibn Shaddad's arbalists, including the "great arbalists" and the dense mail of the Frankish infantry at Arsuf.
- **Axe Knight:** Shirkuh seizes a halberd in Ibn Khallikan; Frankish halberds and lances close the breach at Jaffa in Ibn Shaddad.
- **Skirmisher and the dagger:** Arab brigands hired by Saladin at Acre who captured sleeping Franks at dagger point; the dagger murder of Conrad of Montferrat.
- **Engineer:** miners, masons and workmen at Ascalon and Jerusalem; *najjar* (carpenter) is kept from the brief.
- **Lord:** *amir*, *sultan* and *faris* are source terms; *Fata* is a game label.

---

## 7. Support system

### 7.1 Points

Both units must be deployed and alive. At the **end of each Player Phase** for every defined pair:

| Condition | Points |
|---|---|
| Adjacent | +2 |
| Within 3 tiles (not adjacent) | +1 |
| Both attacked or were attacked within 2 tiles of each other this phase | +1 (once per phase) |
| One healed, mended or dispatched the other | +2 (once per phase) |

- **Per-chapter cap** by pair pace: `slow` 20, `normal` 30, `fast` 40.
- **Camp conversations** (Majlis) each add +10 once.
- Thresholds: **C = 20, B = 60, A = 120, Bond = 200.**

### 7.2 Ranks, scenes, and gating

- A pair reaching a threshold makes the *next scene available*; the **rank only takes effect after the scene is viewed**. Every rank therefore corresponds to a ledger-cited scene.
- A scene may also require a chapter (`availableFrom`) or a flag, so historical order is respected (e.g., "The Rebuke", 1172/3, cannot appear before Chapter 4).
- The **Bond** rank (the S-equivalent) exists only for pairs flagged `bondKind: 'kin' | 'sworn'`: family and brotherhood. Platonic pairs (e.g., companions and officers) cap at **A**.

### 7.3 Adjacent Aid (battle effect)

When a supported pair is **adjacent at the start of a combat** (either as attacker or defender), each unit gains the *rank's* bonus. If a unit has several adjacent supporters, only the best two apply.

| Rank | Accuracy | Avoid | Crit | Guard |
|---|---|---|---|---|
| C | +5 | +5 | — | — |
| B | +10 | +10 | +3 | — |
| A | +15 | +15 | +5 | +1 |
| Bond | +20 | +20 | +8 | +2 |

Per-pair `aid` overrides let family pairs favour Guard, or mentor pairs favour Crit. Pair-up/guard mechanics are **deferred**; Adjacent Aid ships first.

### 7.4 Data shape

```ts
interface SupportDef {
  id: string;                          // 'ayyub-shirkuh'
  a: string; b: string;
  pace: 'slow' | 'normal' | 'fast';
  bondKind?: 'kin' | 'sworn';          // enables the Bond rank
  scenes: Partial<Record<'C'|'B'|'A'|'Bond', {
    scene: string;                     // dialogue scene id
    ledger: string;                    // 'SUP-AYYUB-SHIRKUH-C' (must exist in SOURCES.md)
    availableFrom?: string;            // chapter id
    requiresFlags?: string[];
  }>>;
  aid?: Partial<Record<'C'|'B'|'A'|'Bond', { hit?: number; avoid?: number; crit?: number; grd?: number }>>;
}
```

As built (M5, `core/supports.ts`):

- Points are earned at the end of each **Player Phase** only, by player units still on the field: +2 adjacent, +1 within three tiles, +1 if both fought within two tiles of each other that phase (each at the place it last fought), +2 if one healed, mended or dispatched the other. A pair earns at most its pace's cap in a chapter; the cap is counted afresh when the chapter's battle begins.
- The **rank is the highest whose scene has been viewed**. A pair that has reached a threshold only has a scene *waiting*; `available` also checks the scene's `availableFrom` chapter against the chapter order and its `requiresFlags`. Pairs of friends stop at A; only `bondKind` pairs go on to Bond. Viewing adds the talk's 10 points; skipping a scene counts as viewing it (its flags still fire).
- **Adjacent Aid** is part of the forecast, so the numbers shown include it: each supported unit beside the tile where a unit fights lends the bonus of the rank they have viewed, the best two counting; a pair's own `aid` replaces the default for a rank. It applies to player units only, because only they have supports.
- The tracker belongs to the **army** and the battle is given it (`battle.supports`), so points persist from chapter to chapter; `snapshot`/`restore` make it a plain record for the save.

---

## 8. Camp / Majlis hub

Between chapters the player is in the **Majlis** (the gathering). Screens:

| Screen | Function |
|---|---|
| **Preparations** | Choose deployed units, equip, view the map and objective |
| **Armory** | Buy and sell (sell price 50%); stock per chapter in data |
| **Convoy** | Shared supply train; trade items to and from units |
| **Majlis talks** | Support conversations that are available; limited per camp (default 3); each adds +10 support points |
| **Maydan** | Training: each unit may drill once per camp for a small WEXP grant; secondary-discipline training (stretch) |
| **Class** | Promotion with a Charter of Iqta' (I→II) or a Diploma of Investiture (II→III); reclass (stretch) |
| **Codex** | Entries unlocked by chapters (§9.4) |
| **Casualty roll** | Classic mode: those who left the army, with their chapter |
| **Save** | Manual save slots; autosave runs at chapter start |
| **Begin chapter** | Autosave, then briefing and battle |

As built (M5, `core/camp.ts`, `scenes/campScene.ts`): the camp has *Preparations, Units, Convoy,* each shop, *Majlis talks, Maydan, Class,* the *Casualty roll* (once someone has left the army) and the way on. Saving, the Codex and *Begin chapter* with its autosave arrive with M6 and M7.

- **Majlis talks:** the scenes whose pair has the points, both units in the army, up to three a camp; the scene plays, and the rank takes effect when it ends.
- **Maydan:** each unit may drill once a camp for 4 weapon EXP in the kind of weapon it holds.
- **Class:** lists units that have reached level 10 and hold, or whose convoy holds, the Charter of Iqta' (Tier I) or the Diploma of Investiture (Tier II); one press promotes and shows the new stats. (The Units page does the same through *Item*.)
- **Preparations:** choose who takes the field; the Lord always goes; the map's `deployLimit` is the most.
- **Casualty roll:** who left the army under the Classic rules, and in which chapter.

As built (M7): the camp is a step of the story (§3.10). *Codex and saves* holds saving, the Codex, the settings, the mode and the way back to the title (and says how many entries are new); *Majlis talks* says how many conversations are waiting; the last entry is the way on, named by the chapter (*Hold the landings*, *Ride into the Ghouta*, *March for Egypt*, *Hold Alexandria*, *To Shirkuh's sickbed*, *Into the night*, *End of the slice*), and taking it writes the autosave. **Deployment** works from what each map asks of the army:

- A **named** player spawn (`ayyub`, `recruit`) is filled by the army's unit of that definition, who is then *required*: the list shows "must go", and he cannot be released. The Lord is always required.
- An **open** spawn (tagged `slot`) takes any unit the player chose, in the order the units joined; the number of open and named places is the map's limit, shown as *Deployed 15/15*.
- A unit that is **away** (the story sent it, `away` steps) is greyed and marked *away*; it cannot be chosen, drilled or talked to, and a named spawn it would have filled is taken off the map.
- A **reserve** spawn stands off the map until an event brings it on (`arrive`): Ayyub, who comes through the East Gate when it opens. A **guest** spawn is a unit of the map's own that stays when the army has none like it (supported; no slice map needs it). A spawn can name its **side**: an ally spawn of a unit the army has is the army's unit and stands where the map puts it, and an ally spawn the army has no unit for (Abu'l-Hayja in Stage C, the emirs of the council) is the map's own, who joins the army if he is won by Talk and the battle is won.
- The map's tags belong to the map: a unit takes the tags, side and behaviour its spawn gives it, so the Lord of one chapter is not the Lord of the next. When a battle is settled, units placed as allies are put back, and a unit won over in a battle who fell in it is not taken in (Classic).

---

## 9. Dialogue, portraits, Codex, source markers

### 9.1 Scene script

Scenes are data. A scene is a list of commands:

```ts
type Cmd =
  | { say: { who: string; text: string; kind: LineKind; src?: string[]; mood?: string } }
  | { show: { who: string; at: 'left'|'right'|'center' } }
  | { hide: string }
  | { bg: string } | { music: string | null } | { sfx: string }
  | { wait: number } | { flag: string } | { unlock: string /* codex id */ };

type LineKind = 'documented' | 'dramatized' | 'narration';
```

Text box: 224×40 px, 3 lines of ~37 characters in the 5×7 font, typewriter effect (speed setting), `Z` (Confirm) advances or completes the line, `Enter` (Menu) skips the scene, `A` (Info) opens the backlog. Portrait slots are 32×32 (placeholders), left and right.

As built (M5): `core/dialogue.ts` validates scenes and runs them (`DialogueRunner` has no clock and no canvas: it hands out the next line or pause and collects flags, unlocks and sounds); `scenes/dialoguePlayer.ts` draws them. Every command has exactly one key. A `say` line's `who` must be a character (`core/characters.ts`) or the narrator, narration is spoken only by the narrator, and a line longer than three lines of the box is split into pages at line breaks. Portraits are drawn at twice their size on the left, centre or right, the speaker lit and the others dimmed; with the *names only* setting no portrait is drawn. Backdrops are two-colour placeholders by name. *Menu* skips a scene (its flags and unlocks still happen), *Info* opens the backlog, any tap counts as Confirm. A scene may be played in battle (an event's `dialogue` action) or in camp (a support scene).

### 9.2 Source markers (the "documented / dramatized" rule)

- **Narration**: neutral voice. May state sourced facts (and cites them via `src`).
- **Documented**: a line (or scene) that **faithfully paraphrases something a source records** a person saying or doing. It carries `src` ledger IDs and shows a small ◆ in the text box corner. These lines are original paraphrases; modern copyrighted translations are never copied.
- **Dramatized**: original dialogue invented for the scene, shown with ◇. Allowed for historical figures only as flagged dramatization; it never puts doctrinal, political or quotable claims in a real person's mouth beyond what a source attests.
- A **Settings** toggle shows or hides the markers; the **Codex always lists** which scenes of a chapter are dramatized.
- **No fabricated quotes.** The data validator rejects a `say` line with `kind: 'documented'` that lacks `src`, and rejects `src` IDs that are not in the ledger.

### 9.3 Scripture and sacred content (DECISIONS D-004, D-005)

- No Qur'an or hadith text appears in the slice.
- Later, scripture may appear only through `src/data/scripture.json` entries containing `arabic` (exact text), `ref` (surah:ayah or collection with number), and `verifiedBy`. The validator rejects any other Arabic-script string except entries in `names.json` (transliterated names with Arabic script).
- No prophet and no Companion (sahaba) is depicted in art, dialogue, or sprites. Portrait/speaker IDs are checked against a deny-list (names are not: *Muhammad* is a common name; the lint checks speaker/portrait IDs, not prose).
- No adhan, takbir, or recitation as SFX or flavour.

### 9.4 Codex

Unlocked per chapter (start or end). Categories: **People · Places · Events · Terms · Sources & Disputes · Game vs History**.

```ts
interface CodexEntry {
  id: string; category: string; title: string;
  unlock: { chapter: string; at: 'start' | 'end' };
  body: string[];                       // short paragraphs
  confidence: Confidence;               // shown as a badge
  sources: string[];                    // ledger source IDs
  differ?: { claim: string; positions: { source: string; says: string }[] }[];
  dramatized?: string[];                // scene ids dramatized in this chapter
}
```

- **Badges:** Attested · Attested, sources differ · Reasonably inferred · Fictional (game-only).
- A **"Sources differ"** block always presents each position with its source (e.g., 558 vs 559 AH for the first expedition; the victim of Shirkuh's quarrel at Tikrit; whether the 1169 plot against Saladin happened as reported).
- **Game vs History** entries per chapter list exactly what the game invents (e.g., the Prologue's rear-guard skirmish).
- Partisan or late sources are flagged in the entry that uses them (e.g., Ibn al-Athir's Zengid sympathies).

As built (M6, `core/codex.ts`, `scenes/menus.ts`): an entry's id is its ledger row (`CDX-P-…`, `CDX-S-…`); the letter after `CDX-` must match the category. Entries carry `confidence` (`attested`, `attested-differ`, `inferred`, `fictional`; unverified claims never reach the Codex) except Game vs History entries, which carry none. An `attested-differ` entry must have at least one `differ` block, and every block at least two positions. Sources are ledger ids (`SRC-…`, `MOD-…`, `CH-02.E2`) and the screen shows them by name (`data/sourceNames.ts`). Campaign entries live in `src/data/codex/*.json` and are checked against the ledger by the source lint; demo entries in `src/data/test/codex.json` say that they are demos. Entries unlock at a chapter's start or end and by an event's `unlockCodex`; the reader has the six categories, each entry's badge, its paragraphs, each disputed claim with every source's position, and its sources.

As built (M7): the slice has **54 entries** (`src/data/codex/ch00.json` to `ch03.json`: 20, 7, 10 and 17) and one of sources (`sources.json`). Each chapter has a *Game vs History* entry that says what the game invents (`CDX-G-CH00` to `CDX-G-CH03`), and an entry that is disputed carries a `differ` block for every claim the sources do not agree on. An entry about a fight in which many died (the uprising of 1169, `CDX-E-UPRISING1169`) opens with a **content note**, and says that the game shows no one die in the burned quarter and does not show the aftermath. A line of an early source that is an insult is not repeated: the entry says that the source uses one, and paraphrases around it (D-012). The words of every entry are checked against the font (a glyph the font lacks would print as "?") and against the page they are drawn on (`tests/campaignText.test.ts`).

### 9.5 The fictional viewpoint unit

One fictional unit exists: **the Recruit**, a player-named levy (a Soldier) who joins in the Prologue. The Recruit is flagged *Fictional* in the unit window, the Codex and the ledger (`CHR-RECRUIT`). Generic troops (Tikrit Garrison, Caliphal Cavalry, etc.) are unnamed composites, also flagged. All named characters are historical.

As built (M7): a new game opens on **Name the Recruit** (`scenes/nameScene.ts`, `core/naming.ts`), an on-screen keyboard that the arrow keys, Confirm and a tap all work, so no physical keyboard is needed. A name has one to twelve characters, begins with a letter, and is made of Latin letters, spaces, hyphens, apostrophes and full stops: the font has no accents and no Arabic script, and a name in script would be unchecked text. A name is refused if it contains a word the project never gives to a person in the game (*prophet*, *rasul*, *nabi*, *sahaba*, *sahabi*, *companion*: the list in `core/sensitive.ts` that the data lint also uses) or the name of God; ordinary names, *Muhammad* among them, are not refused. The name is kept in the campaign and the save (`recruitName`) and replaces the Recruit's name everywhere it is shown, including in dialogue (`{recruit}`). No scene says who the Recruit is beyond a levy soldier of Tikrit.

### 9.6 Writing rules

Dignified voice; no modern idiom or modern-politics messaging; no sectarian or ethnic slurs (period insults in sources appear only in a quoted-source block with a content note); real figures on every side get human motives; battles are told with restraint; every historical claim traces to a ledger row.

---

## 10. Enemy and ally AI

Pure module `core/ai.ts`; the scene only plays the plan it returns.

### 10.1 Profile

```ts
interface AiProfile {
  mode: 'aggressive' | 'defensive' | 'stationary' | 'priority' | 'guard' | 'flee';
  aggroRange?: number;          // defensive: triggers when a player unit is within move+range+aggroRange
  priority?: TargetTag[];       // 'lord' | 'healer' | 'archer' | 'mounted' | 'lowestHp' | 'canKill' | 'armored'
  activateOnTurn?: number; activateOnFlag?: string;
  leash?: number;               // max tiles from post
  guard?: string;               // unit id or tile to protect
  avoidCounter?: boolean; respectsFog?: boolean;
}
```

### 10.2 Plan selection

```
for each active unit, in a stable order (leaders last):
  reach     = reachable tiles (MOV, costs, blocked by enemies)
  options   = every (tile ∈ reach, weapon, target in range) incl. remedy targets for healers
  if options not empty:  choose max score(option);  ties → lower exposure, shorter move, then id
  else: movement by mode
        aggressive : move toward nearest target by path cost, preferring safe tiles
        defensive  : stay unless triggered; then behave as aggressive (and return to post if leash)
        stationary : never move
        priority   : move toward highest-priority target
        guard      : stay within 2 tiles of the guarded unit/tile
        flee       : move toward the nearest exit; leave map if reached
```

```
score(option) = 100·P(kill)
              + 1.0·E[damage]                         expected damage incl. double and crit
              + 15·tagBonus(target)                   from `priority` order, Lord = highest
              − k·E[counterDamage]                    k = 0.5 (0.7 if avoidCounter)
              + 2·cover(tile) + 0.1·avoid(tile)
              − 5·exposure(tile)                      number of player units that could hit the tile
```

Weights live in `src/data/ai.json`. Healers and allied supports use a similar scoring over remedy targets. Ally-phase units use the same code with sides swapped.

**As built**, two terms were added to the formula (DECISIONS D-029):

```
              − 50·P(death)                           the attacker falls
              + 100·P(kill)  if the target is critical   the Lord, the escort, or the defended unit
```

An exact expectation (`expectOutcome`) supplies `P(kill)`, `P(death)`, `E[damage]` and `E[counterDamage]` by enumerating every hit, miss and critical hit of the strike order. Units are planned one at a time, each seeing the result of the one before; leaders and bosses go last. A unit with no option moves by mode: toward the nearest opponent by walking cost (`distanceField`), toward the exit (`flee`), within two tiles of its charge (`guard`), or home if it has strayed past its `leash`. A defensive unit wakes when an opponent comes within *move + weapon range + aggroRange* (Manhattan) or when it has been hurt, and stays awake. Units with `activateOnTurn` or `activateOnFlag` do nothing until then.

### 10.3 Behaviours at a glance

| Mode | Behaviour |
|---|---|
| Aggressive | attacks anything reachable; otherwise advances |
| Defensive | holds until a player unit enters its trigger range (shown in yellow in the danger zone) |
| Stationary | never moves; attacks only what is in range from its tile (mangonels, archers on walls) |
| Priority | like aggressive, but target order is explicit (e.g., "Lord, healer, archer") |
| Guard | protects a unit or tile |
| Flee | leaves via the exit when triggered (e.g., Zengi's rear-guard crossing in CH-00) |

---

## 11. Campaign content plan

### 11.1 Slice maps

All numbers are initial. Ledger IDs refer to SOURCES.md. Dramatized elements are marked.

#### CH-00 — The Boats of Tikrit (1132 / 526 AH)

- **Map:** 20×15. The Tigris on the west edge, three ferry piers, Tikrit's citadel on a bluff, reed banks, a dry plain, a road from the east.
- **Objective:** *Hold the Pass:* keep at least two of three piers free until the end of turn 8 while Zengi's routed troops cross (Ally Phase moves them to the boats). Fail if Ayyub retreats or enemies hold two piers at the end of an enemy phase.
- **Player:** Ayyub (Spear Knight, Tier II, Lv 4), Shirkuh (Axe Knight, Tier II, Lv 5), Tikrit Soldiers ×4, Pikemen ×2, the Recruit (Soldier, Lv 1).
- **Allies:** Zengi's rear-guard (flee-mode Soldiers ×6, Horse Archers ×2); Zengi crosses on turn 2.
- **Enemy waves** (the Caliph's ally's pursuit): T1 Horsemen ×2 + Soldiers ×4 · T3 Horse Archers ×3 · T5 Men-at-Arms ×2 + captain.
- **Tutorial beats:** movement and terrain; danger zone; forecast and the Three Postures (Spear vs a Mace-wielding Man-at-Arms); archers; healing items in the convoy.
- **Source basis:** boats, provisions, date and Usama's presence **attested** (CH-00.E3); the pursuit skirmish is **inferred/dramatized**. The Codex states this.
- **After the map:** scenes for Bihruz's reproach, *The Halberd* (support C), the night of the birth and the departure from Tikrit.

#### CH-01 — Damascus: The East Gate (1154 / 549 AH)

- **Map:** 22×16. The Ghouta orchards on the east, canals (shallows), Damascus's east wall and gate, a minaret that grants vision.
- **Objective:** *Seize* the East Gate by turn 10.
- **Player:** Shirkuh (Axe Knight), Salah ad-Din (Young Lord Lv 1, aged ~16), Ayyub (Spear Knight; he comes out through the East Gate when it opens), Soldiers ×4, Pikemen ×2, Horse Archers ×3, one Healer, the Recruit.
- **Enemy:** the Burid garrison (Soldiers ×6, Horsemen ×2).
- **Beats:** orchards favour Light and Foot; first healer; first *Talk* (a gate captain; dramatized).
- **Source basis:** siege dates, the city's transfer and Abaq's exile **attested**; Ayyub's/Shirkuh's role in the surrender **sources not yet collated** (UNV-03); the skirmishes are **inferred/dramatized**.
- **Camp:** Maydan training introduced; supports C begin.

#### CH-02 — The Road to Egypt: Alexandria (1167 / 562 AH)

- **Map:** 24×18 walled port with land and sea gates; enemy siege lines with mangonels; harbour.
- **Objective:** *Defend 12 turns*; secondary: destroy the mangonels. Reinforcement waves every 3 turns.
- **Player:** Salah ad-Din (Young Lord Lv 4), Horse Archers, Pikemen, the first **Fire Thrower** and **Sapper**, a Healer; allied Alexandrian militia (Ally Phase; dramatized).
- **Enemy:** Egyptian Soldiers and Pikemen, Frankish Horsemen and the first **Crossbowmen**, and mangonels (structures).
- **Beats:** structures (mangonels and gates), the Fire Thrower and axes against structures, sapping, Sapper barricades, crossbows against armour; supply pressure told in dialogue.
- **Source basis:** Saladin held Alexandria while Shirkuh went south; terms and departure **attested**, durations and details **differ** (CH-02.E7).
- **Stretch map:** al-Babain (18 March 1167): a short *Rout* with a scripted **feigned retreat** event (modern reconstruction; the Codex flags it).

#### CH-03 — The Vizier (1169 / 564–565 AH)

- **Stage A, scenes:** the seizure of Shawar (alternative accounts shown); Shirkuh's vizierate; the deathbed (support A available before it).
- **Stage B, The Succession (Persuade):** a talk-only council: Isa al-Hakkari and Salah ad-Din persuade the emirs (al-Mashtub, Shihab ad-Din al-Harimi, Qutb ad-Din Khusraw); Ain ad-Dawla al-Yaruqi refuses and leaves. Uses *Talk* as a puzzle with a turn limit. **Rank event:** the appointment unlocks Salah ad-Din's promotion from Young Lord to Lord (by tuning he is level 10 or higher; otherwise the event grants the Charter).
- **Stage C, Bayn al-Qasrayn (Survive 8, or burn the pavilion):** night streets between the Fatimid palaces (fog). Player: Salah ad-Din, Turan-Shah (guest), Isa, Qutb ad-Din, al-Mashtub, Pikemen and Horse Archers. Opponents: Fatimid regiments (the *Sudani* infantry, Armenian archers, city militia), portrayed with dignity (DECISIONS D-012). The aftermath is told, not shown.
- **Source basis:** attested but disputed: modern scholarship questions the plot that precipitated the fighting (CH-03.E8). The Codex presents both positions.
- **Stretch map:** Damietta (25 Oct–19 Dec 1169): *Defend*, river chain and fleets.

As built (M7), where the maps differ from the plan above (map files under `src/data/maps/`, scenes under `src/data/scenes/`; each scene and Codex entry names its ledger rows):

- **CH-00, 20×15.** *Hold the Pass* is the objective as planned, with the three piers as anchors: the enemy standing on two of them at the end of an enemy phase, or more than five different enemies reaching one, loses; holding through turn 8 (or no enemy left) wins. Waves of 6, 3 and 3 arrive at turns 1, 3 and 5 on the east edge; the third carries the captain. A granary at (4, 10) holds a cordial. Ayyub is the Lord of this chapter only.
- **CH-01, 22×16.** *Seize* the East Gate (7, 8) by turn 10; at turn 11 the Franks arrive and the chapter is lost. The gate is a structure: it falls to the player's weapons, or **opens by Talk** with the captain of the urban guard, waiting in the orchard (`openGate`; the conversation is dramatized, ledger CH-01), and three of the urban guard come over to the player's side as allies. When the gate falls, Ayyub comes through it (the `father` scene, then `arrive`). A message at turn 6 gives the reason for the clock: Mujir ad-Din has sent to the Franks.
- **CH-02, 24×18.** *Defend 12 turns* inside a walled city: a wall of ramparts and towers (the new `tower` terrain, which grants sight), a land **gate** and two wall **segments** that the mangonels break (the engines are structures too, and burn), and one **postern** in the east wall, the door the player can hold. Thirteen enemies stand before the walls with three mangonels, and waves of 4, 5 and 7 follow at turns 3, 6 and 9. Eight Alexandrian militia and pikemen hold the ramparts on the player's side. Destroying every engine does not end the siege; it gives a cordial and the Codex entry on naphtha. At turn 7 a scene of the siege plays (`ch02.siege`).
- **CH-03B, 18×12, the council.** *Persuade*: the three emirs by turn 6, by *Talk* with Isa al-Hakkari (who may win all three) or with Salah ad-Din. The fourth emir, al-Yaruqi, cannot be won: talking to him makes him strike his tents and leave. Isa's *Dispatch* lets Salah ad-Din act again. When all three are won the appointment scene plays and Salah ad-Din is promoted to Lord.
- **CH-03C, 24×16, Bayn al-Qasrayn.** *Survive 8 turns* in fog (sight reduced by 1) against ten regimental troops and waves of 4, 4 and 5 at turns 2, 4 and 6 (the last with the regiment commander), **or burn the caliph's pavilion** at the head of the square, which ends the fighting at once (`ch03.pavilion`; ledger CH-03.E14, where Imad ad-Din has Turan-Shah's naphtha-throwers set it alight and the regiments, who thought they had the caliph's leave, lose heart). The pavilion is a structure with Guard 12 and the *fireWeak* tag: spears and arrows scarcely mark it (a test pins the best blow at 6), and a naphtha pot does about 19 a strike, so the Fire Thrower must be taken (Preparations) and brought through the guard; the fire the pot lights burns it further. Abu'l-Hayja fights on the player's side as a captain who charges; Turan-Shah is in the army from the council on.

### 11.2 Later chapters (planning stubs; full ledger in SOURCES.md §3)

| ID | Chapter | Design hook |
|---|---|---|
| CH-04 | The End of an Era (1170–71) | Ayyub joins; the khutba changes and al-Adid dies; heavy dialogue, short skirmish; Qaraqush joins as palace steward |
| CH-05 | After Nur ad-Din (1174–76) | Damascus, Hama, Aleppo; Horns of Hama (fog); the attempts on Saladin's life (ambush `Survive`) |
| CH-06 | Montgisard (1177) | A *withdraw* chapter: reach the exit with the Lord; Isa is captured; Camp changes after |
| CH-07 | Years of Patience (1179–86) | Hub chapter: Marj Ayyun, Jacob's Ford, Mosul diplomacy (Talk), Kerak, the Red Sea fleet |
| CH-08 | Hattin (1187) | Heat/thirst gauge, brush fires on dry grass, Rout + Seize |
| CH-09 | Jerusalem (1187) | Siege with structures; negotiation scene with Balian; ransom terms shown with sources |
| CH-10 | Acre (1189–91) | Defend and Rout split; the Fire Thrower's showpiece (the Damascene caldron-maker) |
| CH-11 | Arsuf (1191) | Survive vs a disciplined march |
| CH-12 | Jaffa (1192) | Seize and Escort; the pilgrims scene |
| CH-FIN | Ramla and Damascus (1192–93) | Scenes-only chapter: the treaty, the Hajj plan, the last illness |

---

## 12. Art pipeline

All art is original and procedural. Real art can replace it with no code change.

### 12.1 Sprite definition (the source of truth)

Palette-indexed pixel arrays. **At most 15 colours plus transparency per sprite**: indices `0`–`f`, with `0` transparent.

```json
{
  "id": "unit.jundi",
  "kind": "map-unit",
  "size": [16, 16],
  "palette": ["#00000000", "#101018", "#e8c9a0", "#c08a5a", "#d8a21e", "#7a4a12", "…up to 15 colours…"],
  "slots": { "faction": [4, 5, 6] },
  "frames": {
    "idle": [
      ["................", "......1111......", "…16 rows of 16 hex digits…"],
      ["…second idle frame…"]
    ],
    "walk": [[ "…" ], [ "…" ], [ "…" ], [ "…" ]],
    "attack": [[ "…" ]]
  },
  "anim": { "idle": { "fps": 2, "frames": [0, 1], "loop": true } }
}
```

- **Sizes:** map units 16×16; tiles 16×16; battle sprites and portraits 32×32 (placeholders); UI frames 8×8 nine-slice; font cell 6×8 (5×7 glyph).
- **Slots:** palette indices listed in `slots.faction` (primary, secondary, trim) and `slots.skin` (light, shade) are replaced from the ramps in `assets/palettes/` **at render time**, so one sprite serves every faction and skin tone. A ramp is positional, so a slot is only trimmed from the end of its list; the colour limit applies to the sprite's own palette.
- **Compaction:** the kit generator drops palette entries a sprite never draws, so each definition lists only its own colours and the lint can flag genuinely unused ones.
- **Kits (composition):** `tools/sprites/kits/` composes the placeholders from layers (body template + headgear + weapon overlay + horse; terrain painters seeded per tile) and writes them out as ordinary sprite definitions with `npm run sprites:gen`. After that the JSON is the source of truth: edit it by hand, or replace it with real art. Regenerating overwrites hand edits, so run it only to start from scratch.

### 12.2 Tools (`tools/`)

| Command | Does |
|---|---|
| `npm run sprites:gen` | regenerates every placeholder definition in `assets/sprites/` from the kits |
| `npm run sprites` | validates and renders all definitions to one PNG strip per sprite, an `atlas.json` and contact sheets in `out/sprites/` (own minimal PNG encoder using Node `zlib`; no native deps). The strips are templates for artists; the game does not load them |
| `npm run sprites:preview` | opens `tools/sprites/preview.html` on the dev server: every sprite at 4×–16×, each frame set, animation playback, faction and skin switching, palette swatches (dots mark recolour slots) and the lint results; editing a `.sprite.json` reloads it |
| `npm run sprites:lint` | fails on a malformed definition, a wrong size for the kind, an id outside its prefix (`unit.`, `tile.`, `ui.` …) or naming a Prophet or Companion, a transparent hole in a tile, a map unit without `idle`; warns on unused or duplicate palette entries and recolour groups that are never drawn |

The lint rules live in `src/core/spritelint.ts`, so the command line, the preview page and the tests share them.

### 12.3 Replacing art

The game renders sprites from their definitions at run time. To replace one with real art, put a PNG strip in `public/assets/override/sprites/` (all frames of the sprite side by side, sets in the order they appear in the definition, each frame exactly `size[0]` wide and `size[1]` high; `out/sprites/strips/<id>.png` is a ready template) and list it in `public/assets/override/manifest.json`:

```json
{ "sprites": { "unit.pikeman": "sprites/unit.pikeman.png" } }
```

A strip of the wrong size is ignored with a console warning, so a bad file can never break the game. Overrides are full-colour and are not recoloured by faction or skin. The README (M7) documents the contract and ships a checklist per asset kind.

### 12.4 Faction palettes (placeholders)

Colours are art-direction placeholders. The Ayyubid yellow is a widely repeated tradition that I have **not** verified in the sources (SOURCES UNV-17), so it is used purely as art direction; the others are chosen for contrast.

| Faction | Primary | Secondary | Trim |
|---|---|---|---|
| Ayyubid / Nurid-Syrian (player) | `#d8a21e` ochre | `#f3e6c0` cream | `#7a4a12` umber |
| Fatimid | `#2f7d4f` green | `#f2f2e6` off-white | `#c9a64a` gold |
| Abbasid / caliphal | `#1e1e24` near-black | `#c9a64a` gold | `#8a8a94` grey |
| Zengid / Mosul–Aleppo | `#2e6f8e` teal | `#e8e2d0` | `#1e3a4a` |
| Frankish (Latin) | `#e8e4dc` white | `#b02a2a` red | `#5a5a64` |
| Byzantine (stretch) | `#5b2a86` purple | `#d8c15a` | `#2a1a3a` |

Skin ramps: five three-shade ramps spanning light to dark brown, used by all factions so every group is drawn with the full range of skin tones, with equal care for every faction.

### 12.5 Bitmap font

An original 5×7 font (`assets/fonts/majlis.font.json`): Latin letters, digits, punctuation, and the transliteration marks ʿ and ʾ. Arabic script is **not** drawn by this font. If Arabic name plates are wanted later, they are rendered once with an open-licence Arabic font (e.g., Noto Naskh Arabic, OFL) into a 1-bit sprite at build time, so the GBA look is kept.

### 12.6 UI art

Window frames use original geometric (non-calligraphic, non-figurative) border patterns. Cursor, range overlays, status icons and the Majlis background are procedural.

---

## 13. Audio pipeline

Everything is a **placeholder** behind a manifest; real assets replace entries without code changes.

- **Synth:** WebAudio, four voices in the chiptune tradition: two pulse waves (12.5 / 25 / 50% duty, built with `PeriodicWave`), one triangle, one noise. ADSR per voice; a lookahead scheduler.
- **Music format** (`assets/music/*.song.json`): tempo, instruments, patterns of note names and durations, an order list, loop points. Placeholder songs: title, camp, player phase, enemy phase, story, victory, defeat.
- **SFX** are parameter sets (waveform, pitch envelope, duration): cursor, confirm, cancel, hit, critical, miss, heal, level-up, promotion, support rank-up, fire, structure break, gate.
- **Manifest** (`public/assets/override/audio/manifest.json`): maps ids to files (`.ogg`/`.mp3`); when present, those win over synth.
- **Respect:** no adhan, takbir or recitation is synthesised or used as an effect.
- Autoplay policy: audio starts on the first user gesture; mute and volume settings persist.

As built (M6, `core/music.ts`, `engine/audio.ts`): songs are `assets/music/*.song.json` with patterns written as `NOTE:steps` tokens (`D4:2 -:2 x:4`, a step being a sixteenth), validated and timed in the core; the engine schedules notes 0.2 s ahead and loops from `loopFrom`. Sound effects are `assets/sfx/effects.json`. The override manifest is `public/assets/override/audio/manifest.json` with `music` and `sfx` maps. Ids naming the call to prayer, takbir or recitation are refused by validation. The interface sounds (move, choose, back) are played by the game loop for every scene.

---

## 14. Testing and quality gates

**Vitest** suites mirror `src/core`:

| Suite | Cases (selection) |
|---|---|
| `combat` | accuracy, evasion, crit, damage with cover, quench, pierce, effective ×2, flat vs-bonus (Crush); triangle ±; double threshold (3/4/5 difference); dagger Quick; axe Breaker and siege-bolt against structures; javelin counters at 1 and 2; bow and crossbow cannot counter adjacent; weapon use and breakage; the worked example in §5.2 |
| `exp-level` | EXP table values; kill vs non-kill; boss bonus; tier cap; level-up with a seeded RNG; guaranteed-progress re-roll; stat caps |
| `promotion` | requires level ≥ 10 and a charter, diploma or rank event; **resets level to 1 and EXP to 0**; applies gains and caps; keeps WEXP; swaps skills; restores HP; Tier II/III bases equal Tier I plus cumulative gains; no promotion past Tier III; effective level and tier EXP rates |
| `support` | point accrual per condition; per-chapter cap by pace; thresholds; gating by scene viewed; Bond only for flagged pairs; bonus cap of two supporters; Adjacent Aid in forecast |
| `ai` | kill preferred over damage; Lord priority; counter avoidance; defensive trigger; stationary never moves; guard; flee to exit; stable tie-breaks; fog toggle |
| `grid-path` | terrain costs per move type; allied pass-through; blocked by enemies; ranges and rings; danger-zone union; structures |
| `objectives` | each type's win and loss; leak counting; turn limit; compound failure |
| `events` | triggers and actions; Talk/recruit; flag logic; spawn timing |
| `fire-structures` | spread (deterministic with `spreadChance = 1`), duration, damage, wind bias; sap and breach |
| `save` | serialise/deserialise round-trip; RNG state restored; migrations; storage-failure fallback |
| `data` | schema and referential integrity (every unit/class/item/scene id resolves) |
| `ledger` | every chapter, unit, support, Codex entry has a ledger row; every `src` resolves; no main-story line cites an `UNV-` row; `documented` lines have `src` |

**Scripts:** `npm test`, `npm run build` (typecheck, then the production build), `npm run lint` (layering, the ledger join and the sprites), `npm run balance` (§14).

**Definition of done for any milestone:** tests pass, a production build succeeds, lints pass, and the milestone's acceptance list below is demonstrated.

---

As built (M5, `tools/lint-sources.ts`, run by `npm run lint`): the ledger's tables are read for the ids in their first column (a row ending in `*` stands for a family, as `CHR-GEN-*` does for generic troops). Over the campaign's story data (`characters.json`, `scenes/`, `supports.json`) it checks that every character, scene and support names rows that exist; that a documented line cites; that nothing cites an `UNV-` or `EXC-` row; that every support's scene exists and carries its `SUP-` row; and that no data file contains Arabic script. The demos' data under `src/data/test/` is checked for structure but not for rows, and says in its own text that it is not history. A slice support in the ledger with no scene written yet is reported as a warning, which becomes an error when the slice is declared complete.

As built (M7): the slice adds these suites (874 tests in 57 files in all). `chapters` checks the step table (every step kind, `away` setting rather than adding, `train` rolling the same levels for the same seed). `campaignData` checks the campaign as a whole: every unit has a class, items, colours and a sprite, every map plays, every event points at something that exists, every scene, support and Codex entry is used, and the campaign's balance is the engine's except for the pace of growth. `campaignText` checks the words against the screen: every character has a glyph in the font, every spoken line fits the dialogue box in at most three pages, every plate fits, and every battle message fits its window. `screenText` measures every line a menu shows about a chosen row (two rows fit) and every one-row line of the name screen against the real font, and `pageScene` that a page of words runs on to a second page rather than being cut off. `deployment`, `campaign` and `naming` cover the army on the field (§8), the campaign's flow and the Recruit's name. `story` plays the whole slice through the real flow (title, naming, every card, scene, camp and battle, to the last page), saving and reading back at every camp, and `stageC` pins that the pavilion yields to fire and not to steel. `npm run lint` joins the layering lint, the ledger join (`tools/lint-sources.ts`, §14 above) and the sprite lint.

**The headless player and the balance tool.** `core/bot.ts` plays the story as the flow does: it names the Recruit, passes the scenes, spends the camp (deployment sized to the map, every conversation, promotions), and plays each battle with the same AI that moves the enemy, in a stance per battle (`aggressive`, or `defensive` with an `aggroRange`); the Lord holds back, and units *Talk* and *Seize* where a map asks for it. `npm run balance` (`tools/balance.run.ts`, under its own Vitest config) plays the slice over many seeds and reports, per battle, how often it is won, how long it takes, who is lost, how far the army has levelled, how much EXP it earned and why the lost ones were lost. It is configured by environment variables: `SEEDS` (default 40), `MODE=casual`, `ONLY=CH-02` and `STANCE=defensive`. The computer plays carelessly (it sorties through the postern at Alexandria and charges at Damascus), so a win rate is a **floor** for a person and the units lost a ceiling. The slice's last run, 100 seeds, Classic, charging / holding the line:

| Battle | Won | Turns | Units lost per run | Army EXP |
|---|---|---|---|---|
| CH-00 The Boats of Tikrit | 94% / 91% | 7.9 | 3.2 / 3.0 | 614 |
| CH-01 Damascus, the East Gate | 85% / 76% | 4.3 | 0.8 / 0.6 | 250 |
| CH-02 Alexandria | 99% / 96% | 12.0 | 4.7 / 4.9 | 376 |
| CH-03B the council | 100% | 3.0 | 0 | none |
| CH-03C Bayn al-Qasrayn | 100% | 7.1 | 2.8 / 2.6 | 387 |

Alexandria costs the army most because the computer's horse archers ride out of the postern and are lost in the open. In an experiment with every unit but the Lord standing still, the army lost fewer than two a run and the Lord, who stands in the crossbows' reach, fell in about half the runs, so the siege rewards neither extreme. In Chapter 3 the computer takes the siege of the square for about seven of its eight turns: the pavilion is the earned shortcut, not something steel does in two turns (it did, before the pavilion's Guard was raised to 12).

## 15. Milestones

Each milestone ends with tests green, a production build, and a commit (the repository is initialised at M1 once you pick a folder).

| M | Scope | Acceptance |
|---|---|---|
| **M1** | Vite + TS strict + Vitest scaffold; layering lint; canvas renderer, camera, integer scaling; ASCII map loader; terrain and cost table; cursor; unit movement with range display; basic attack (no forecast); sprite tool v0 (build, preview, lint) with the first sprites and the font; one test map | Walk a unit across terrain with correct costs; attack; sprites render from definitions; preview page works; tests (grid-path) pass |
| **M2** | Combat resolution and forecast; weapon triangle and all ten weapon types; terrain cover/avoid; durability; EXP and levelling with growths; battle scene (map animation first) | The §5.2 worked example reproduced by a test; level-ups deterministic with a seed |
| **M3** | Phases (Player/Ally/Enemy); AI modes; danger zone; fog; **all objective types**; event runner | Play the test map to victory and defeat under every objective type; AI test table passes. *(Done: `tests/simulation.test.ts` plays the proving ground to a win and a loss under each of the seven; `tests/ai.test.ts` is the AI table; the proving ground can be played under any objective with `?objective=`.)* |
| **M4** | Classes (fourteen lines, three tiers), skills, promotion with the classic reset (items and rank events); inventory, convoy, shops; **structures and flames; class actions (Sap, Entrench, Mend, Ignite, Counsel, Dispatch)** | Promotion tests; shop and convoy flows; a structure/fire demo map. *(Done: `tests/promotion.test.ts`, `tests/army.test.ts`, `tests/camp.test.ts` (the camp walked with key presses), `tests/structures.test.ts`, `tests/fire.test.ts`, `tests/classActions.test.ts`, `tests/art.test.ts`; `?demo=siege` is the structure and fire demo and `?demo=camp` the camp.)* |
| **M5** | Support system; Camp / Majlis hub; dialogue and portrait engine; source markers | A support pair advances C→B in play; scenes show ◆/◇; ledger lint runs. *(Done: `tests/supports.test.ts` plays a pair from C to B over two chapters; `tests/dialogue.test.ts`, `tests/dialoguePlayer.test.ts`, `tests/majlis.test.ts`, `tests/majlisScreens.test.ts`, `tests/sources.test.ts`; `?demo=camp` has a talk waiting.)* |
| **M6** | Save/load (slots + suspend); Codex; title screen; settings; Classic/Casual; touch controls; placeholder audio | Suspend/resume reproduces RNG; Casual returns wounded units; Codex shows differ-blocks; touch playable |
| **M7** | Content: Prologue + Ch.1–3 with source-backed dialogue, supports, Codex, art placeholders; README; final lint pass | Slice playable start to finish; every line traceable; production build deployed locally. *(Done: `tests/story.test.ts` plays the whole slice through the real flow and saves and reads back at each camp; `tools/lint-sources.ts` joins every scene, support and Codex entry to the ledger; `npm run build` is clean; `npm run balance` plays it over many seeds; `?chapter=CH-02` and `?battle=CH-03C` open the slice part-way for a tester.)* |

---

## 16. Settings and accessibility

- **Mode:** Classic or Casual, chosen at New Game. Classic → Casual may be switched at any Camp; Casual → Classic is not allowed mid-campaign (it would retroactively condemn units).
- Text speed; battle animations (Scene / Map / Off); music and SFX volume; hit-roll mode (Honest / Weighted); *Guaranteed progress*; auto-end-turn; danger-zone default; source markers on/off; **portraits: illustrated / name plates only**; **class names: Common / Historical / Both**; screen-shake off; high-contrast overlays; larger-text option (doubles to 2× font in dialogue only); colour-blind-safe range colours (blue/orange instead of blue/red); remappable keys.
- Touch controls scale with screen size; all menus are reachable with one hand.

As built (M6, `scenes/menus.ts`): the settings screen shows only what the game honours: text speed, battle animations (Map or Off; Scene waits for battle sprites, D-028), music and sound volume, hit rolls and guaranteed progress (from the next battle), ending the turn when all have acted, the danger zone at the start, source marks, portraits, and colour-blind-safe ranges (orange for attack). Class-name style, screen shake, high contrast, larger text and remappable keys are not shown yet (DECISIONS D-032). The mode is chosen at New Game and changed only in camp.

---

## 17. Risks and open questions

| Risk | Mitigation |
|---|---|
| Hand-writing many pixel sprites (14 class lines × 3 tiers, ten weapon types) | Kit composition tool; the slice needs only about ten classes at Tiers I–II; Tier III art arrives with the late chapters; override path for real art |
| Source discipline slows content | Ledger lint and per-scene metadata make it mechanical |
| Arabic script rendering | Latin transliteration by default; Arabic plates rendered at build time if wanted |
| `localStorage` unavailable or full | Adapter with in-memory fallback and a visible notice |
| Scope creep in systems | Features marked *stretch* are cut first (reclassing, pair-up, Babain/Damietta maps) |
| Three tiers of reset levels make EXP pacing hard | Tier EXP rates in `balance.json`; a balance script checks the slice's level targets. *(M7: the campaign has its own faster rates, and the story gives Salah ad-Din his levels; §5.7.)* |
| The bundle grows with the campaign | The slice builds to one 542 kB script (137 kB gzipped) with all its data and placeholder art, and Vite says so; split the chapters' data and maps into lazily loaded chunks (`import()` in `data/story.ts` and `data/campaign.ts`) when the later chapters arrive, and not before |
| A person plays better than the balance tool, and worse in other ways | The tool's numbers are floors and ceilings, not forecasts; the Casual mode is there for the player who does not want a battle to cost units; the first human play-tests should read the *lost* column first |

**Decisions confirmed (2026-10-06)**

1. **Rendering:** plain Canvas 2D.
2. **Prologue:** *The Boats of Tikrit* (1132) as the playable map, with the birth and exile as story scenes.
3. **Slice size:** four battle maps plus a talk-only council stage; al-Babain and Damietta are stretch maps.
4. **Weapons:** the Three Postures stays; bows sit outside the triangle; further medieval weapon types were added (§5.3: axe, dagger, crossbow, javelin).
5. **Progression:** the classic reset; three tiers; common class names with historical flavour names (§6).
6. **Dates:** AH plus the Julian month and year; the day of the month only when the weekday check passes.

**Open items**

1. **Class names (§6.2)** are my first mapping into the common format. I avoided a few names that belong to one well-known series' class list, so the Sword line reads Swordsman → Blademaster → Legend rather than *Swordmaster*; changing it is a one-word data edit. The *Common / Historical / Both* class-name setting (§16) is not built: the historical names are in the data (`historical`) and wait for a screen to choose them.
2. **Tier III** numbers and skills are first drafts; Tier III only matters from the late chapters.
3. **Repository settings:** the GitHub repository's name and description still say "Fire Emblem" and "Phaser 3". I have not changed repository settings.
4. **Faces.** The portraits are types (age, beard, headgear, faction colours), not likenesses (ledger UNV-05), and two older men in turbans look alike in one scene (Isa and al-Harimi at the council). Real portraits drop in through the override manifest (§12.3).
5. **Balance by people.** Nobody but the computer has played the slice through yet. Chapter 0 costs a careless player a third of the army (3 of 9) and the Lord in 6 to 9 runs in a hundred; that may be too hard for a tutorial and is the first number to look at once a person has played it.
6. **The campaign after Chapter 3** (Chapters 4 to the end, §11.2) is planned in the ledger and not built; nothing in the engine stands in its way (a chapter is data, §3.10), but the later classes and Tier III have never met a map.
