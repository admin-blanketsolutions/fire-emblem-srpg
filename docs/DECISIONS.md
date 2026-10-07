# Sultan of Two Banners — Decisions Log

**Status:** v0.4 · 2026-10-06
Every place where I had to make a judgment call about history, sensitivity or engineering. Where it was a close call, I chose the **more conservative, source-backed option** and recorded it here. Entries marked **Approved** were confirmed by the project owner on 2026-10-06; the rest are policies I follow unless told otherwise.

Companion documents: [DESIGN.md](DESIGN.md) · [SOURCES.md](SOURCES.md)

| ID | Topic | Status |
|---|---|---|
| D-001 | Rendering stack | Approved |
| D-002 | Dates and calendars | Approved |
| D-003 | Names and transliteration | Policy |
| D-004 | Scripture and sacred sound | Policy |
| D-005 | Prophets and Companions | Policy |
| D-006 | The weapon triangle | Approved |
| D-007 | Violence, defeat and executions | Policy |
| D-008 | Fictional characters | Policy |
| D-009 | Sources: additions, translations, finding aids | Policy |
| D-010 | Quotations and "documented / dramatized" | Policy |
| D-011 | Disputes and partisan sources | Policy |
| D-012 | The uprising of 1169 and the Fatimid regiments | Policy |
| D-013 | Fatimids, sects and language | Policy |
| D-014 | The Franks and Crusaders | Policy |
| D-015 | Depicting Saladin and other historical Muslims | Policy |
| D-016 | Saladin's own hard moments | Policy |
| D-017 | Women in the roster | Policy |
| D-018 | Progression model: classic reset, three tiers | Approved |
| D-019 | Slice scope and the Prologue | Approved |
| D-020 | Mechanical defaults | Policy |
| D-021 | Storage and privacy | Policy |
| D-022 | Avoiding Orientalist styling | Policy |
| D-023 | Class names: common format, historical flavour | Approved (first mapping) |
| D-024 | Additional weapon types | Approved |
| D-025 | Repository, publication and commit identity | Policy |
| D-026 | Art pipeline as built (M1) | Policy |
| D-027 | No religious emblems on generic art | Policy |
| D-028 | Combat and progression as built (M2) | Policy |

---

## D-001 Rendering stack: plain Canvas 2D, not Phaser

**Context.** The brief allows Phaser 3 "or plain Canvas if you judge it simpler".
**Options.** (a) Phaser 3; (b) a thin custom Canvas 2D engine.
**Decision (approved 2026-10-06).** Canvas 2D.
**Why.** Every asset is palette-indexed pixel data at 240×160. Pixel-perfect integer scaling, palette swaps and fog dithering are simpler on a raw canvas; the game rules live in pure modules either way; and the bundle stays small. The engine surface we need (scene stack, input, bitmap text, tweens, WebAudio synth) is small.
**Consequence.** If you prefer Phaser, only `src/engine/` changes; `core/` and `data/` are unaffected.

## D-002 Dates: AH plus Julian, day-of-month only when it checks out

**Context.** Modern scholarship dates pre-1582 events in the Julian calendar. Hijri-to-Julian conversion can be off by a day. The 1897 translation's conversions are sometimes a day out. A check of weekdays against dates showed real mismatches (for example, Saladin's death).
**Decision (approved 2026-10-06).**

- Every dated event shows the **AH date** and the **Julian month and year**.
- The **day of the month** is shown only when a source's weekday agrees with the converted date (SOURCES §8).
- Where weekdays disagree (Saladin's death: Wednesday 27 Safar 589, conventionally 4 March 1193 which was a Thursday), the game says "27 Safar 589 AH, early March 1193" and the Codex explains the mismatch.

**Why.** It is honest about uncertainty and never prints a precision the sources do not support.

## D-003 Names and transliteration

- Plain Latin transliteration **without diacritics**: Salah ad-Din, Baha' ad-Din ibn Shaddad, Qaraqush, al-Qadi al-Fadil. The brief's spellings (for example *Keukburi*, *Safadin*) are kept as the game spelling, with alternates (*Kokboru*, *al-Adil*) in the Codex.
- Frankish figures use conventional English forms (Raynald of Chatillon, Balian of Ibelin).
- The font includes the transliteration marks ʿ and ʾ for the Codex, but game text uses a plain apostrophe.
- Arabic script is not drawn in the slice. If name plates are wanted later, they are rendered at build time with an open-licence Arabic font into 1-bit sprites.

## D-004 Scripture and sacred sound

- **No Qur'an or hadith text appears in the slice.**
- If scripture is ever added: only through `src/data/scripture.json`, with the **exact Arabic**, a **correct reference** (surah:ayah, or collection and number), and a `verifiedBy` field; kept minimal; never as gameplay flavour or sound. The data validator rejects Arabic-script strings not in that file (apart from transliterated name plates).
- **Concrete case:** Ibn Shaddad glosses Saladin's remark about going to Egypt unwillingly with a Qur'an verse, and a reciter's last verses at his deathbed. **I omit both** in the slice and describe the anecdotes without the text (SOURCES CH-02.E3, CH-FIN.E9). I do not paraphrase scripture either.
- **No adhan, takbir or recitation** is synthesised or used as an effect (the sources describe takbir shouts at Acre; the game does not reproduce them as sound).

## D-005 Prophets and Companions

- No prophet and no Companion (*sahaba*) is depicted in art, dialogue or sprites, or ever speaks.
- Speaker and portrait IDs are checked against a deny-list in the data lint. (The lint checks IDs, not prose: *Muhammad* is also a common personal name, for example Shirkuh's son Muhammad.)
- In Codex text, the Prophet may be **named only where a source's date or custom requires it** (the Night Journey anniversary on which Jerusalem surrendered; the Hajj), as information, with the customary honorific, never as a character.

## D-006 The weapon triangle

**Context.** The brief suggested "Lance beats Sword beats Mace/Axe beats Lance" as an example and asked for an *original* design, not a clone.
**Decision (approved 2026-10-06).** A different cycle (**Spear > Mace > Sabre > Spear**) with its own reasons, different magnitudes (+1 Might, +10 accuracy), and separate layers: *Brace* (spears effective against mounted units), *Crush* (maces against armour), *Pierce*, *Quick*, *Breaker*, *Fire* and *Remedy*. Bows sit outside the triangle as separate categories, as asked, and further weapon types were added (D-024).
**Honest caveat.** Any three-way cycle is structurally the same as the genre's classic triangle. The originality is in names, reasons, magnitudes and the surrounding weapon families.

## D-007 Violence, defeat and executions

- **"Retreats wounded."** Units are never shown dying: they flash and fade. There are no blood sprites in the asset set.
- **Executions and massacres are never depicted**: Raynald after Hattin, the Templar and Hospitaller captives, the Acre hostages, the sack of Bilbays, the fighting in the quarters of Cairo. Scenes cut away before the act (for example, at the cup of sherbet) or are told in narration.
- The **Codex states these facts neutrally, with sources**, and carries a content note on the entry. It does not minimise them, and it does not use them for spectacle or for score-settling.
- Casualty figures are omitted where sources conflict or exaggerate (UNV-06).

## D-008 Fictional characters

- One fictional named unit: **the Recruit**, a player-named levy, flagged *Fictional* in-game and in SOURCES (`CHR-RECRUIT`). The rest are unnamed generic troops, also flagged.
- No fictional romances, rivals, or "friends of Saladin". The Recruit never stands in for a historical actor and never delivers a historical claim.
- All major named characters are historical.

## D-009 Sources: additions, translations, finding aids

- **Added to the brief's list:** Ibn al-Qalanisi (a contemporary Damascene eyewitness for 1148 and 1154) and Ibn Abi Tayy via Abu Shama (the Fatimid-side view). I could not access Ibn al-Qalanisi's translation this session (lending-only); I did not work around that.
- **Verification used public-domain translations** (Ibn Shaddad, Wilson and Conder, 1897; Ibn Khallikan, de Slane, 1842–71). These are older translations; the modern Richards and Gabrieli translations should be consulted for the final pass.
- **Wikipedia and web summaries are finding aids only.** They are never cited as evidence in the ledger, and claims resting on them alone are marked **WEB** and kept out of the main story until verified.
- I distinguish what I **read** from what I am **recalling or citing from secondary summaries** in every ledger row (the "Checked" column), so no row implies more verification than was done.

## D-010 Quotations and "documented / dramatized"

- **No fabricated quotes.** A line is **documented** (◆) only if it adapts something a source records being said or done, and it carries a ledger citation. Everything else spoken by a real person is **dramatized** (◇) and cannot assert a doctrinal, political or quotable claim beyond what a source supports.
- Documented lines are **my own paraphrases**. Modern copyrighted translations are never copied. Short phrases from public-domain translations may appear only when meaning-critical, with citation.
- The data validator rejects documented lines without `src`, and the Codex lists every dramatized scene per chapter.

## D-011 Disputes and partisan sources

- Where sources disagree, the Codex shows **each position with its source** and does not merge them (examples: 558 vs 559 AH; who seized Shawar; the council of 1172–73).
- **Ibn al-Athir** is flagged as a Mosul historian partial to the Zengids; **Ibn Shaddad** as an eyewitness only from 1188 and writing admiringly; **Imad ad-Din** as rhetorically inflated, especially in numbers. The flag appears wherever their material is used.
- When Ibn al-Athir and Ibn Shaddad tell different versions of the same scene (the council in Egypt), the game presents both rather than choosing.

## D-012 The uprising of 1169 and the Fatimid regiments

- The Fatimid regiments, including the *Sudani* infantry and Armenian archers, are portrayed as **professional soldiers of a court faction** defending the dynasty they served, not as caricatures.
- **Every faction is drawn with the same care and the full range of skin tones.** No racialized dialogue or descriptions.
- The Codex states that **modern scholarship questions whether the plot that triggered the fighting happened as reported**, that the traditional account leans on a letter by al-Qadi al-Fadil, that the figures are unreliable, and that civilians suffered.
- The chapter's objective is **"Survive, then Seize"**, not annihilation. The burning of the Mansura quarter and the aftermath are told, not shown. Saladin's own troops include Kurdish and Turkish regiments, and the tension among them is part of the story.
- **Before M7** I will read the primary accounts (Ibn al-Athir, Ibn Abi Tayy via Abu Shama, Maqrizi); my current ledger entry rests on a modern summary (SOURCES CH-03.E8).

## D-013 Fatimids, sects and language

- Neutral, descriptive language: "the Fatimid caliphate", "the restoration of the Abbasid khutba". No polemic.
- Period terms of abuse in the sources (for example "heretic") are omitted from game text. If one must be shown, it appears in a clearly labelled *source voice* block with a content note.
- Al-Adid is portrayed with dignity; the sources stress that the change of khutba met no opposition and that he died without being told of it.
- Isma'ili emissaries (*fida'is*) are named as the sources name them; the Codex notes that the Franks' word "Assassins" is not an Arabic-source term. The Masyaf legend is excluded (EXC-05).

## D-014 The Franks and Crusaders

- In the Arabic-source voice they are **"the Franks"** (*Ifranj*); in neutral Codex text, "Crusaders" or "Latins".
- Baldwin IV (a young king with a debilitating illness), Balian of Ibelin, Raymond III and Richard I are portrayed as the capable, complicated people the sources show. Raynald of Chatillon is portrayed as the Arabic sources do, as especially notorious, **with the specific episodes sourced** rather than a generic "villain".
- Frankish-side details come from Frankish sources and are labelled as such. No cartoonish villains; no modern-politics messaging; no "Crusader = evil / Muslim = saintly" reductions.

## D-015 Depicting Saladin and other historical Muslims

- The brief rules out depicting prophets and Companions only. Saladin and the other historical figures are **stylised, low-detail pixel characters**; no contemporary likeness is known (UNV-05), and the Codex says so.
- **Portraits: illustrated / name plates only** is a setting, for players who prefer not to see figures drawn.

## D-016 Saladin's own hard moments

The ledger and Codex include the **documented unflattering or difficult episodes**, with sources, rather than a sanitised hero:

- his reluctance to go to Egypt and his turn from youthful pleasures (IS, IKh);
- the rift with Nur ad-Din as Ibn al-Athir tells it (partisan), and Saladin's own different account (IS);
- the defeat at Montgisard and his own explanation;
- his anger at his troops after Jaffa, and the emirs' fear of punishment;
- the executions after Hattin (the captive Templars and Hospitallers; Raynald), and the execution of the young philosopher al-Suhrawardi at Aleppo (1191) at Saladin's command, which Ibn Shaddad reports and the 1897 editor, citing Ibn Khallikan, says was by strangling (IS-PPTS pp. 10–11; SOURCES CH-10.E8). A later Codex entry will give the sources' accounts;
- the strains of a coalition that was often unwilling and exhausted.

They appear in the Codex and in carefully framed scenes, never as spectacle.

## D-017 Women in the roster

- The documented companions and officers in the sources are men, so the playable roster is male. I will **not invent female characters** to compensate.
- Real women appear where the sources attest them: for example, Raymond's wife holding the castle of Tiberias (IS-PPTS p. 111 note), the young daughter of Nur ad-Din who asked Saladin for Azaz (IS-PPTS p. 75), and other women named in the Frankish and Arabic sources. This limitation is stated in the Codex.

## D-018 Progression model: classic reset, three tiers

- **Classic reset.** Promotion sets the level back to 1; every tier runs levels 1–20 (effective level = level + 20 per tier above the first). This replaces my first proposal of continuous levels.
- **Three tiers.** Every class line has a Tier I, II and III class (for example Swordsman → Blademaster → Legend). Promotion needs level 10 in the current tier and a **Charter of Iqta'** (I → II) or **Diploma of Investiture** (II → III), or a story rank event. Tier III is rare and arrives from about Chapter 8.
- Tier EXP rates (×1.0 / ×0.85 / ×0.7) and a balance script keep the pacing sane; the slice targets level 10 for the Lord by the Chapter 3 rank event.

## D-019 Slice scope and the Prologue

- The slice is **four battle maps and one talk-only council stage**: the Prologue (the Boats of Tikrit, 1132), Chapter 1 (the East Gate, 1154), Chapter 2 (Alexandria, 1167) and Chapter 3 (the Succession council and Bayn al-Qasrayn, 1169). **Al-Babain and Damietta are stretch maps.** Approved 2026-10-06.
- **The Prologue uses the one pre-1137 episode the sources document well** (Ayyub's boats at Tikrit); the birth and exile are story scenes. The pursuit skirmish is flagged as invented.
- **Chapter 1's fighting is dramatized** because the sources describe a brief siege and a largely peaceful transfer; the Codex says so.

## D-020 Mechanical defaults

- **Honest** hit rolls (single roll against the displayed hit%); a *Weighted* mode is optional.
- AI is **omniscient** by default (fog applies to the player); a per-map flag lets AI respect fog where ambush is historical.
- **Chronicled** units retreat wounded and always return; ordinary units depend on mode (Classic or Casual).
- **Guaranteed progress** on level-ups is on by default.

## D-021 Storage and privacy

- Saves live in `localStorage` only. **No telemetry, no accounts, no network at runtime** other than loading the game's own files.
- If storage is unavailable the game runs from memory and says so.

## D-022 Avoiding Orientalist styling

- Architecture, dress and objects are drawn from the period and region, not from "Arabian Nights" tropes: no exoticised harem scenes, flying carpets, mystic "Orient" soundtrack clichés, or generalised "Eastern" ornament.
- Terms in the Arabic sources are used as the sources use them. The Franks' "Assassins" label is explained rather than adopted.
- Music is a neutral chiptune placeholder rather than a pastiche of "Eastern" scales.

---

## D-023 Class names: the common format, with historical flavour

- Class names follow the **common English format** in three-tier lines (Pikeman → Spear Knight → Pike Marshal; Swordsman → Blademaster → Legend; and so on). The first draft's historical names (*Kurdish Spearman*, *Muqaddam*, *Naffat*, *Tabib*, and the rest) remain as **flavour names**, shown in the Codex and via the setting *Class names: Common / Historical / Both*.
- **Originality.** The brief rules out copying class names from any existing game. A few natural names belong to one well-known series' class list, so I avoided them: the Sword line uses *Blademaster* instead of *Swordmaster*, and I avoided *Paladin, Sniper, Hero, General, Mercenary* and similar. Plain English words (Soldier, Archer, Healer, Knight) are kept.
- **Honesty about the labels.** Flavour names that the sources do not attest (*Fata*, *Furusiyya Master*, *Hakim* and others) are flagged as game labels in SOURCES §6.1.
- This mapping is a first pass for review; renaming a class is a data edit.

## D-024 Additional weapon types

- The Three Postures (Spear, Sabre, Mace) remain the triangle (D-006). Bows stay outside it. **Four more medieval weapon types** were added, each outside the triangle with one clear job: **Axe** (heavy; Breaker against structures), **Dagger** (light, precise; Quick), **Crossbow** (slow, heavy, Pierce) and **Javelin** (thrown; counters at ranges 1 and 2). Fire (naphtha) and Remedy remain.
- Anchors from the sources: Ibn Shaddad's arbalists and halberds, Ibn Khallikan's halberd, daggers in Ibn Shaddad's accounts of the Acre brigands and the murder of Conrad of Montferrat, and a mounted javelin game in the account of Ayyub's fatal fall (SOURCES §6.2). Mace and axe as such, and the javelin as a military weapon, are *not yet attested* in the texts read and are marked to be sourced.
- Weapon types are driven by data tags (`quick`, `pierce`, `effective`, `vsBonus`), so further types need no engine changes.

## D-025 Repository, publication and commit identity

- The project is stored in the GitHub repository `admin-blanketsolutions/fire-emblem-srpg`, replacing its earlier Phaser scaffold on the owner's instruction. History is preserved: the replacement is an ordinary commit on `main`, not a force-push.
- The repository is **public** and **GitHub Pages is enabled** through a workflow, so every push to `main` publishes the built game. I kept an updated workflow rather than silently removing the deployment the owner had set up.
- Commits in this repository use a repository-local identity (the owner's name with the `blanketsolutions.net` address) so the owner's separate global work identity is not published.
- The repository's name and description still say "Fire Emblem" and "Phaser 3". I did not change repository settings; the game's own title, README and assets use only original names.

## D-026 Art pipeline as built (M1)

- **Runtime rendering.** The game renders every sprite from its JSON definition when it starts and caches the frames, rather than loading generated PNGs. This keeps one source of truth, allows faction and skin recolouring with no extra files, and means a sprite edit needs no build step beyond saving the file. The PNG strips under `out/sprites/` are an export for artists and for inspection; they are git-ignored and not shipped.
- **Overrides.** Real art replaces a sprite through `public/assets/override/manifest.json` (DESIGN §12.3). A bad override is ignored with a warning.
- **Preview.** The preview page is served by the dev server rather than written out as a static file, so it can import the same validation, lint and rendering code as the game and reload when a definition changes.
- **Hold-X fast cursor dropped.** The first draft let the player hold Cancel to move the cursor faster. Cancel also backs out of menus, so one key doing both is error-prone; held arrows already repeat at about 14 tiles a second.

## D-027 No religious emblems on generic art

- The healing-tent tile has a green band and pennant, not a cross or a crescent. I have no source for any emblem on an Ayyubid field hospital; a cross would read as Christian, and the modern medical emblems (the Red Cross and Red Crescent) date from the 1860s and 1870s. Generic terrain and unit placeholders carry no religious symbols at all; any symbol that does appear later needs its own ledger row.

## D-028 Combat and progression as built (M2)

- **The formulas are DESIGN §5.2 exactly,** and the worked example there is a test: the Young Lord and the Soldier produce 84% and 64% to hit, 8 and 6 damage, 7% and 0% crit, no double, HP 20 → 14 and 18 → 10.
- **Random draws are in a fixed order** (DESIGN §5.2) so a battle seed replays exactly and the suspend-save (M6) can restore the generator's state. Hit mode (Honest or Weighted) and *Guaranteed progress* are rules passed to the battle, not constants.
- **Who earns EXP.** Only player units earn EXP and weapon EXP, and only if they survive the fight. Enemy and ally units do not level, so their definitions need no growth rates. A player unit that is attacked and cannot answer still earns 1 EXP.
- **Rounding.** EXP after the tier rate is rounded down, minimum 1.
- **Equipping.** Choosing *Attack* offers every usable weapon that reaches at least one hostile unit from where the unit stands; choosing one equips it (the choice persists, as in the genre). The danger zone and threat range use every weapon the unit can wield, so a bow in the pack extends the displayed threat.
- **Counters** use the defender's equipped weapon only. A weapon that cannot reach the distance, a remedy, or a weapon with no uses left cannot counter.
- **Healing** is a class action using a remedy: it restores the remedy's Might in HP (never above maximum), uses one charge, spends the unit's action, and earns `min(30, 5 + HP restored)` EXP.
- **Deferred.** The 32×32 *battle scene* presentation (DESIGN §5.6) needs battle sprites and is not in the slice; map animation is. Skills, supports, structures and fire's *Ignite* arrive in later milestones; the formulas already accept support bonuses and a structure flag.
- **Data.** The proving ground now uses real classes and the §5.4 weapon list (29 items); the first Tier II and III classes arrive with promotion in M4.

## D-029 Enemy AI as built (M3, first part)

- **The planner is pure** (`core/ai.ts`): it reads the battle and returns a plan (a tile and an action) without changing anything. `BattleState` applies plans; the scene walks the unit, then plays the fight or heal. `runAiPhase` plays a whole phase headlessly for tests.
- **Scoring is DESIGN §10.2,** with the weights in `src/data/ai.json`. Kill chance, expected damage and expected counter damage are exact expectations over every hit, miss and crit in the forecast's strike order, under the battle's hit mode (Honest or Weighted), not the forecast's all-hits figure.
- **Target tags.** The first tag in the priority list is worth 1, falling linearly to 1/n for the last. A unit with no list uses `['lord']`, which is how "Lord = highest" is read; an explicit list replaces it. `lowestHp` is judged among the targets the unit is weighing this turn.
- **Exposure** counts the opposing units whose threat range covers a tile, measured on the board as it stands before the unit moves.
- **With nothing to attack,** a unit walks the cheapest path towards the nearest tile from which it could strike its chosen target (the nearest, or in priority mode the best-ranked) and stops at the furthest free tile it can reach. "Preferring safe tiles" applies to choosing between attack positions, where exposure is scored, but not to the approach, so a column on the march does not stall short of the player. Revisit if it plays badly.
- **Modes.** *Defensive* wakes when an opponent stands within its threat range plus `aggroRange` tiles, and stays awake (`triggered`). *Guard* keeps within 2 tiles of a unit or tile, and walks back when out of position. A *leash* limits both where a unit attacks from and how far it advances. *Flee* heads for the battle's exit tiles and leaves the map there (counted as escaped, not fallen); with no exit it opens the distance. `activateOnTurn` and `activateOnFlag` hold a unit until then.
- **Order and ties.** Units act in roster order with bosses and `leader`-tagged units last. Ties fall to lower exposure, a shorter move, the lower target id, then the tile, so a seed replays exactly.
- **Not yet.** `respectsFog` is accepted and ignored until fog exists; exit tiles are set on the battle until the map format gains them; the ally phase will use the same planner with the sides swapped. Until objectives are wired in, a routed army ends play on a *Defeat* banner.

## Confirmed and open

**Confirmed 2026-10-06:** Canvas 2D (D-001); date display rule (D-002); Three Postures plus added weapon types (D-006, D-024); classic reset and three tiers (D-018); slice scope and the Tikrit Prologue (D-019).

**Open:** the class-name mapping (D-023) is a first pass; Tier III numbers and skills are first drafts; the repository name and description (D-025).
