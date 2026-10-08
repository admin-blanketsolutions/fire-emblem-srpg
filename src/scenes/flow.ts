import { settleChapter } from '../core/army';
import type { BattleState } from '../core/battle';
import { changeMode, fieldArmy, type Campaign } from '../core/campaign';
import { entriesUnlockedAt, unlock } from '../core/codex';
import { hashSeed } from '../core/rng';
import { decodeSave, encodeSave, SaveError, SaveSlots, type SavePlace } from '../core/save';
import { parseSettings, type Settings } from '../core/settings';
import type { Assets } from '../engine/assets';
import type { Game, Scene } from '../engine/game';
import type { TextRenderer } from '../engine/text';
import { shops } from '../data';
import { battleFrom, loadEnv, STORIES, type BattleSource } from '../data/battles';
import { newDemoCampaign } from '../data/demos';
import { sourceName } from '../data/sourceNames';
import { BattleScene, type BattleSceneOptions } from './battleScene';
import { CampScene } from './campScene';
import { ListScreen, type ListContent, type Row } from './listScreen';
import { CodexScene, SettingsScene, SlotsScene, TitleScene } from './menus';

/**
 * The way through the game (DESIGN §8, §3.9): the title, a campaign's camp and its battles, and
 * the screens around them. It owns the campaign in play and the settings, writes the saves, and
 * moves between scenes; the scenes themselves own nothing.
 *
 * Until the chapters exist (M7), a new campaign is the demo story: the camp army, and the siege.
 */

export interface FlowServices {
  readonly game: Game;
  readonly assets: Assets;
  readonly text: TextRenderer;
  readonly slots: SaveSlots;
  /** False when saves will not outlast the page. */
  readonly persistent: boolean;
  /** The time now, as ISO 8601, for the save list. */
  readonly now: () => string;
  /** A fresh campaign seed. */
  readonly newSeed: () => number;
  /** Builds the battle screen; tests replace it, since the real one draws on a canvas. */
  readonly battleScene?: (options: BattleSceneOptions) => Scene;
}

const DEMO_BATTLE: BattleSource = { kind: 'demo', demo: 'siege' };
const STORAGE_NOTICE = 'Saving is not available in this browser: saves last only while the page is open.';

export class GameFlow {
  settings: Settings;
  campaign: Campaign | null = null;
  /** A notice to show once on the next screen that can show one. */
  private notice: { text: string; warning: boolean } | null = null;

  constructor(private readonly s: FlowServices) {
    this.settings = parseSettings(s.slots.readSettings());
  }

  private show(scene: Scene): void {
    this.s.game.setScene(scene);
  }

  // ---------------------------------------------------------------- the title

  title(): TitleScene {
    const listing = this.s.slots.list();
    const scene = new TitleScene({
      text: this.s.text,
      canResume: listing.some((l) => l.place.kind === 'suspend' && l.state === 'ok'),
      canLoad: listing.some((l) => l.place.kind !== 'suspend' && l.state === 'ok'),
      notice: this.notice ?? (this.s.persistent ? null : { text: STORAGE_NOTICE, warning: true }),
      onResume: () => this.resume(),
      onNewGame: (mode) => this.newGame(mode),
      onLoad: () => this.show(this.slotsScene('load', () => this.show(this.title()))),
      onSettings: () => this.show(this.settingsScene(() => this.show(this.title()))),
    });
    this.notice = null;
    this.show(scene);
    return scene;
  }

  newGame(mode: Campaign['mode']): void {
    this.campaign = newDemoCampaign(mode, this.s.newSeed());
    this.camp();
  }

  // ---------------------------------------------------------------- camp

  camp(note?: string): CampScene {
    const campaign = this.need();
    const scene: CampScene = new CampScene({
      army: campaign.army,
      tables: loadEnv.tables,
      shops,
      assets: this.s.assets,
      text: this.s.text,
      story: this.story(),
      settings: this.settings,
      chapter: campaign.chapter,
      chapterOrder: ['CH-00', 'CH-01', 'CH-02', 'CH-03'],
      flags: campaign.flags,
      onUnlock: (id) => unlock(campaign.codex, this.story().codex, [id]),
      title: note ?? 'Camp',
      continueLabel: 'Ride to the siege',
      onContinue: () => this.beginBattle(),
      extraItems: () => [{ label: 'Codex and saves', run: () => this.show(this.campOptions(scene)) }],
    });
    this.show(scene);
    return scene;
  }

  /** The camp's records: saving, the Codex, settings, the mode, and the way back to the title. */
  campOptions(back: CampScene): ListScreen {
    const flow = this;
    const campaign = this.need();
    return new (class extends ListScreen {
      private message: string | null = null;
      protected content(): ListContent {
        const rows: Row[] = [
          { label: 'Save', choose: () => flow.show(flow.slotsScene('save', () => flow.show(this))) },
          { label: 'Codex', value: String(campaign.codex.size), choose: () => flow.show(flow.codexScene(() => flow.show(this))) },
          { label: 'Settings', choose: () => flow.show(flow.settingsScene(() => flow.show(this))) },
          {
            label: 'Mode',
            value: campaign.mode === 'classic' ? 'Classic' : 'Casual',
            about: campaign.mode === 'classic' ? 'OK to change to Casual. A Casual campaign cannot go back to Classic.' : 'A Casual campaign stays Casual.',
            choose: () => {
              const r = changeMode(campaign, 'casual');
              this.message = r.ok ? 'The campaign is now Casual.' : r.reason;
            },
          },
          { label: 'Return to title', about: 'Anything not saved is lost.', choose: () => flow.title() },
        ];
        return { title: 'Codex and saves', rows, ...(this.message ? { note: this.message } : {}) };
      }
      protected back(): void {
        flow.show(back);
      }
    })(this.s.text);
  }

  // ---------------------------------------------------------------- battle

  /** Start the chapter's battle: autosave first (DESIGN §3.9), then field the army. */
  beginBattle(): Scene {
    const campaign = this.need();
    this.writeSave({ kind: 'autosave' }, 'Chapter start');
    const chapter = campaign.chapter ?? 'CH-00';
    const battle = battleFrom(DEMO_BATTLE, { hitMode: this.settings.hitMode, guaranteedProgress: this.settings.guaranteedProgress }, hashSeed(campaign.seed, chapter));
    if (campaign.army.supports) {
      battle.supports = campaign.army.supports;
      campaign.army.supports.startChapter();
    }
    fieldArmy(battle, campaign.army);
    unlock(campaign.codex, this.story().codex, entriesUnlockedAt(this.story().codex, chapter, 'start').map((e) => e.id));
    return this.battleScene(battle, DEMO_BATTLE);
  }

  private battleScene(battle: BattleState, source: BattleSource): Scene {
    const campaign = this.need();
    const build = this.s.battleScene ?? ((options: BattleSceneOptions) => new BattleScene(options));
    const scene = build({
      battle,
      assets: this.s.assets,
      text: this.s.text,
      story: this.story(),
      settings: this.settings,
      onUnlock: (id) => unlock(campaign.codex, this.story().codex, [id]),
      onSuspend: () => this.suspend(battle, source),
      onFinish: () => this.finish(battle),
    });
    this.show(scene);
    return scene;
  }

  /** Save the battle where it stands and go to the title. */
  suspend(battle: BattleState, source: BattleSource): void {
    const campaign = this.need();
    const file = encodeSave({ kind: 'suspend', campaign, label: battle.map.name, savedAt: this.s.now(), battle: { state: battle, source } });
    const result = this.s.slots.write({ kind: 'suspend' }, file);
    this.notice = result.ok ? { text: 'Battle suspended.', warning: false } : { text: result.reason, warning: true };
    this.title();
  }

  /** Resume the suspended battle. In Classic the suspend-save is used up. */
  resume(): void {
    const read = this.s.slots.takeSuspend();
    if (!read.ok) return this.fail(read.reason);
    try {
      const loaded = decodeSave(read.raw, loadEnv);
      if (!loaded.battle) return this.fail('The suspended save holds no battle.');
      this.campaign = loaded.campaign;
      this.battleScene(loaded.battle, loaded.source as BattleSource);
    } catch (error) {
      this.fail(error instanceof SaveError ? error.message : String(error));
    }
  }

  /**
   * The chapter is over. A victory brings the army home under the campaign's rules (Classic or
   * Casual), keeps what the battle unlocked, and goes to camp. A defeat fails the chapter: the
   * campaign goes back to the autosave made as it began (DESIGN §4.8).
   */
  finish(battle: BattleState): void {
    const campaign = this.need();
    const chapter = campaign.chapter ?? 'CH-00';
    if (battle.outcome?.result !== 'won') {
      this.load({ kind: 'autosave' }, 'Defeat · try again');
      return;
    }
    const settled = settleChapter(campaign.army, battle, campaign.mode, chapter);
    for (const flag of battle.flags) campaign.flags.add(flag);
    unlock(campaign.codex, this.story().codex, battle.codexUnlocks);
    unlock(campaign.codex, this.story().codex, entriesUnlockedAt(this.story().codex, chapter, 'end').map((e) => e.id));
    const lost = settled.lost.length;
    this.camp(lost > 0 ? `Victory · ${lost} lost` : 'Victory');
  }

  // ---------------------------------------------------------------- screens

  slotsScene(purpose: 'save' | 'load', back: () => void): SlotsScene {
    let note: string | null = null;
    return new SlotsScene({
      text: this.s.text,
      purpose,
      listing: () => this.s.slots.list(),
      note: () => note ?? (this.s.persistent ? null : STORAGE_NOTICE),
      onBack: back,
      onPick: (place) => {
        if (purpose === 'save') {
          const r = this.writeSave(place, this.campLabel());
          note = r ?? 'Saved.';
        } else {
          this.load(place);
        }
      },
    });
  }

  settingsScene(back: () => void): SettingsScene {
    return new SettingsScene({
      text: this.s.text,
      settings: this.settings,
      onChange: (next) => {
        this.settings = next;
        this.s.slots.writeSettings(next);
      },
      onBack: back,
    });
  }

  codexScene(back: () => void): CodexScene {
    const campaign = this.need();
    return new CodexScene({ text: this.s.text, codex: this.story().codex, unlocked: campaign.codex, sourceName, onBack: back });
  }

  /** Open a save from a slot or the autosave, into its camp. */
  load(place: SavePlace, note?: string): void {
    const read = this.s.slots.read(place);
    if (!read.ok) return this.fail(read.reason);
    try {
      const loaded = decodeSave(read.raw, loadEnv);
      this.campaign = loaded.campaign;
      this.camp(note);
    } catch (error) {
      this.fail(error instanceof SaveError ? error.message : String(error));
    }
  }

  // ---------------------------------------------------------------- helpers

  /** Write the campaign (in camp) to a place; returns an error message, or null. */
  private writeSave(place: SavePlace, label: string): string | null {
    const campaign = this.need();
    const kind = place.kind === 'suspend' ? 'suspend' : place.kind === 'autosave' ? 'autosave' : 'slot';
    const r = this.s.slots.write(place, encodeSave({ kind, campaign, label, savedAt: this.s.now() }));
    return r.ok ? null : r.reason;
  }

  private campLabel(): string {
    const chapter = this.need().chapter;
    return chapter ? `Camp · ${chapter}` : 'Camp';
  }

  private story() {
    const campaign = this.need();
    return STORIES[campaign.story as keyof typeof STORIES] ?? STORIES.demo;
  }

  private need(): Campaign {
    if (!this.campaign) throw new Error('No campaign is in play');
    return this.campaign;
  }

  private fail(reason: string): void {
    this.notice = { text: `The save could not be opened: ${reason}`, warning: true };
    this.title();
  }
}
