import type { BattleState } from '../core/battle';
import { fitDeployment } from '../core/camp';
import { changeMode, concludeBattle, deploymentFor, launchBattle, type Campaign } from '../core/campaign';
import { applyEffects, nextBattle, stepAfter, type ChapterDef, type Step } from '../core/chapters';
import { entriesUnlockedAt, unlock } from '../core/codex';
import type { Effect } from '../core/dialogue';
import { chapterKicker } from '../core/labels';
import { hashSeed } from '../core/rng';
import { decodeSave, encodeSave, SaveError, SaveSlots, type SavePlace } from '../core/save';
import { parseSettings, type Settings } from '../core/settings';
import type { Assets } from '../engine/assets';
import { audio } from '../engine/audio';
import type { Game, Scene } from '../engine/game';
import type { TextRenderer } from '../engine/text';
import { shops } from '../data';
import { battleFrom, loadEnv, newCampaignFor, sourceOf, STORIES, STORY_UNITS, type BattleSource, type StoryId } from '../data/battles';
import { sourceName } from '../data/sourceNames';
import { BattleScene, type BattleSceneOptions } from './battleScene';
import { CampScene } from './campScene';
import { ListScreen, type ListContent, type Row } from './listScreen';
import { CodexScene, SettingsScene, SlotsScene, TitleScene } from './menus';
import { NameScene } from './nameScene';
import { CardScene, PageScene, StoryScene } from './storyScene';

/**
 * The way through the game (DESIGN §8, §11, §3.9): the title, then the campaign's chapters step by
 * step (a card, scenes, a camp, a battle), and the screens around them. It owns the campaign in
 * play and the settings, writes the saves, and moves between scenes; the scenes themselves own
 * nothing.
 *
 * Where the campaign stands is a chapter and a step of it (`Campaign.chapter`, `Campaign.step`),
 * so a save made in camp opens in that camp, and a suspended battle in that battle.
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

const STORAGE_NOTICE = 'Saving is not available in this browser: saves last only while the page is open.';

export class GameFlow {
  settings: Settings;
  campaign: Campaign | null = null;
  /** A notice to show once on the next screen that can show one. */
  private notice: { text: string; warning: boolean } | null = null;
  /** Codex entries opened since the last camp, to say so there. */
  private fresh = 0;

  constructor(private readonly s: FlowServices) {
    this.settings = parseSettings(s.slots.readSettings());
    audio.setVolumes(this.settings.musicVolume, this.settings.sfxVolume);
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
    audio.playMusic('title');
    this.show(scene);
    return scene;
  }

  /** Begin a campaign at its first step. `story` is the campaign, or (for tests and `?demo=`) the demo. */
  newGame(mode: Campaign['mode'], story: StoryId = 'campaign'): void {
    this.campaign = newCampaignFor(story, mode, this.s.newSeed());
    this.fresh = 0;
    this.openChapter();
    this.run();
  }

  // ---------------------------------------------------------------- walking the steps

  /** The step the campaign has reached, and carry it out. */
  run(note?: string): void {
    const campaign = this.need();
    const chapter = this.chapter();
    const step = chapter?.steps[campaign.step];
    if (!chapter || !step) {
      this.endOfStory();
      return;
    }
    switch (step.kind) {
      case 'name':
        return this.nameStep();
      case 'card':
        return this.cardStep(chapter, step);
      case 'scenes':
        return this.scenesStep(step);
      case 'apply':
        applyEffects(campaign, step.do, { units: STORY_UNITS[this.storyId()], tables: loadEnv.tables, codex: this.story().codex });
        return this.advance(note);
      case 'camp':
        return void this.camp(step.label, note);
      case 'battle':
        return void this.beginBattle(step.battle);
    }
  }

  /** The next step: in this chapter, or the first of the next. Past the last, the story is over. */
  advance(note?: string): void {
    const campaign = this.need();
    const at = { chapter: campaign.chapter ?? '', step: campaign.step };
    const next = stepAfter(this.story().chapters, at);
    if (!next) {
      this.closeChapter(at.chapter);
      this.endOfStory();
      return;
    }
    if (next.chapter !== at.chapter) {
      this.closeChapter(at.chapter);
      campaign.chapter = next.chapter;
      campaign.step = 0;
      this.openChapter();
    } else {
      campaign.step = next.step;
    }
    this.run(note);
  }

  /** A chapter begins: its Codex entries for the start open. */
  private openChapter(): void {
    const campaign = this.need();
    if (campaign.chapter) this.unlockEntries(entriesUnlockedAt(this.story().codex, campaign.chapter, 'start').map((e) => e.id));
  }

  /** A chapter is over: its entries for the end open. */
  private closeChapter(id: string): void {
    this.unlockEntries(entriesUnlockedAt(this.story().codex, id, 'end').map((e) => e.id));
  }

  private unlockEntries(ids: Iterable<string>): void {
    this.fresh += unlock(this.need().codex, this.story().codex, ids).length;
  }

  private nameStep(): void {
    const campaign = this.need();
    this.show(
      new NameScene({
        text: this.s.text,
        initial: '',
        onDone: (name) => {
          campaign.recruitName = name;
          this.advance();
        },
        onBack: () => this.title(),
      }),
    );
  }

  private cardStep(chapter: ChapterDef, step: Extract<Step, { kind: 'card' }>): void {
    const own = step.title === undefined;
    audio.playMusic('story');
    this.show(
      new CardScene({
        text: this.s.text,
        ...(own ? { kicker: chapterKicker(chapter.id) } : {}),
        title: step.title ?? chapter.title,
        date: step.date ?? chapter.date,
        onDone: () => this.advance(),
      }),
    );
  }

  private scenesStep(step: Extract<Step, { kind: 'scenes' }>): void {
    const story = this.story();
    const scenes = step.scenes.map((id) => {
      const scene = story.scenes.get(id);
      if (!scene) throw new Error(`The chapter plays scene "${id}", which does not exist`);
      return scene;
    });
    audio.playMusic('story');
    this.show(
      new StoryScene({
        scenes,
        characters: story.characters,
        assets: this.s.assets,
        text: this.s.text,
        settings: this.settings,
        names: this.names(),
        onEffect: (effect) => this.sceneEffect(effect),
        onDone: () => this.advance(),
      }),
    );
  }

  private sceneEffect(effect: Effect): void {
    const campaign = this.need();
    if ('flag' in effect) campaign.flags.add(effect.flag);
    else if ('unlock' in effect) this.unlockEntries([effect.unlock]);
  }

  // ---------------------------------------------------------------- camp

  camp(label?: string, note?: string): CampScene {
    const campaign = this.need();
    const story = this.story();
    this.prepareDeployment();
    const news = this.fresh > 0 ? `Codex: ${this.fresh} new ${this.fresh === 1 ? 'entry' : 'entries'}` : undefined;
    this.fresh = 0;
    const scene: CampScene = new CampScene({
      army: campaign.army,
      tables: loadEnv.tables,
      shops,
      assets: this.s.assets,
      text: this.s.text,
      story,
      settings: this.settings,
      chapter: campaign.chapter,
      chapterOrder: [...story.chapters.keys()],
      flags: campaign.flags,
      names: this.names(),
      onUnlock: (id) => this.unlockEntries([id]),
      title: note ?? news ?? 'Camp',
      continueLabel: label ?? 'Ride on',
      onContinue: () => this.rideOut(),
      extraItems: () => [{ label: 'Codex and saves', run: () => this.show(this.campOptions(scene)) }],
    });
    audio.playMusic('camp');
    this.show(scene);
    return scene;
  }

  /** Size the deployment to the next battle's map: how many it takes, and who it cannot do without. */
  private prepareDeployment(): void {
    const campaign = this.need();
    const upcoming = nextBattle(this.story().chapters, { chapter: campaign.chapter ?? '', step: campaign.step });
    if (!upcoming) {
      fitDeployment(campaign.army, 99);
      return;
    }
    const preview = battleFrom(sourceOf(campaign.story, upcoming.battle), {}, 1, false);
    const { limit, required } = deploymentFor(preview, campaign.army);
    fitDeployment(campaign.army, limit, required);
  }

  /**
   * Leave camp. The campaign is saved as it stands, at this camp (DESIGN §3.9): a chapter lost is
   * tried again from here, with the army as it was left.
   */
  private rideOut(): void {
    this.writeSave({ kind: 'autosave' }, this.saveLabel());
    this.advance();
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

  /** Start a battle: field the army on its map, then let the first phase begin. */
  beginBattle(battleId: string): Scene {
    const campaign = this.need();
    const story = this.story();
    // a battle with no camp before it has no ride-out to save at: save as it begins
    const before = story.chapters.get(campaign.chapter ?? '')?.steps[campaign.step - 1];
    if (before?.kind !== 'camp') this.writeSave({ kind: 'autosave' }, this.saveLabel());
    const source = sourceOf(campaign.story, battleId);
    const battle = battleFrom(source, { hitMode: this.settings.hitMode, guaranteedProgress: this.settings.guaranteedProgress }, hashSeed(campaign.seed, battleId), false);
    launchBattle(campaign, battle);
    return this.battleScene(battle, source);
  }

  private battleScene(battle: BattleState, source: BattleSource): Scene {
    const build = this.s.battleScene ?? ((options: BattleSceneOptions) => new BattleScene(options));
    const scene = build({
      battle,
      assets: this.s.assets,
      text: this.s.text,
      story: this.story(),
      settings: this.settings,
      names: this.names(),
      onUnlock: (id) => this.unlockEntries([id]),
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

  /** Resume the suspended battle. In Classic the suspend-save is used up, once it has loaded. */
  resume(): void {
    const read = this.s.slots.read({ kind: 'suspend' });
    if (!read.ok) return this.fail(read.reason);
    try {
      const loaded = decodeSave(read.raw, loadEnv);
      if (!loaded.battle) return this.fail('The suspended save holds no battle.');
      if (loaded.campaign.mode === 'classic') this.s.slots.remove({ kind: 'suspend' });
      this.campaign = loaded.campaign;
      this.fresh = 0;
      this.battleScene(loaded.battle, loaded.source as BattleSource);
    } catch (error) {
      this.fail(error instanceof SaveError ? error.message : String(error));
    }
  }

  /**
   * The battle is over. A victory brings the army home under the campaign's rules (Classic or
   * Casual), keeps what the battle raised and unlocked, and goes on to the next step. A defeat
   * fails the chapter: the campaign goes back to the autosave made as the camp was left (DESIGN §4.8).
   */
  finish(battle: BattleState): void {
    const settled = concludeBattle(this.need(), battle);
    if (!settled) {
      this.load({ kind: 'autosave' }, 'Defeat · try again');
      return;
    }
    this.unlockEntries(battle.codexUnlocks);
    const lost = settled.lost.length;
    this.advance(lost > 0 ? `Victory · ${lost} lost` : 'Victory');
  }

  // ---------------------------------------------------------------- the end

  /** The last step is done: the slice's closing words, then a way to read the Codex or return to the title. */
  private endOfStory(): void {
    const campaign = this.need();
    campaign.flags.add('story-complete');
    const demo = campaign.story === 'demo';
    audio.playMusic('victory');
    this.show(
      new PageScene({
        text: this.s.text,
        title: demo ? 'The demo ends' : 'The road goes on',
        lines: demo
          ? ['This was test data, not history. The campaign begins from the title screen.']
          : [
              'Here the vertical slice ends: the Prologue and the first three chapters of the life of Salah ad-Din, from the boats at Tikrit to the streets of Cairo in 1169.',
              '',
              'Everything in it is traced to a ledger of sources, and the Codex says where the sources differ and what the game invents. The campaign that follows, from the end of the Fatimid caliphate to Hattin and Jerusalem, is planned but not yet built.',
              '',
              `Salah ad-Din was thirty-one. Your Recruit, ${campaign.recruitName}, was never a person in the histories; the rest of the army was.`,
            ],
        hint: 'OK Continue',
        onDone: () => this.show(this.endMenu()),
      }),
    );
  }

  private endMenu(): ListScreen {
    const flow = this;
    const campaign = this.need();
    return new (class extends ListScreen {
      protected content(): ListContent {
        return {
          title: 'The end of the slice',
          rows: [
            { label: 'Codex', value: String(campaign.codex.size), about: 'Read about the people, the places and where the sources disagree.', choose: () => flow.show(flow.codexScene(() => flow.show(this))) },
            { label: 'Return to title', choose: () => flow.title() },
          ],
        };
      }
      protected back(): void {
        flow.title();
      }
    })(this.s.text);
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
          const r = this.writeSave(place, this.saveLabel());
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
        audio.setVolumes(next.musicVolume, next.sfxVolume);
      },
      onBack: back,
    });
  }

  codexScene(back: () => void): CodexScene {
    const campaign = this.need();
    return new CodexScene({ text: this.s.text, codex: this.story().codex, unlocked: campaign.codex, sourceName, onBack: back });
  }

  /** Open a save from a slot or the autosave, at the step it was made at. */
  load(place: SavePlace, note?: string): void {
    const read = this.s.slots.read(place);
    if (!read.ok) return this.fail(read.reason);
    try {
      const loaded = decodeSave(read.raw, loadEnv);
      this.campaign = loaded.campaign;
      this.fresh = 0;
      this.run(note);
    } catch (error) {
      this.fail(error instanceof SaveError ? error.message : String(error));
    }
  }

  // ---------------------------------------------------------------- helpers

  /** Write the campaign (at a camp) to a place; returns an error message, or null. */
  private writeSave(place: SavePlace, label: string): string | null {
    const campaign = this.need();
    const kind = place.kind === 'suspend' ? 'suspend' : place.kind === 'autosave' ? 'autosave' : 'slot';
    const r = this.s.slots.write(place, encodeSave({ kind, campaign, label, savedAt: this.s.now() }));
    return r.ok ? null : r.reason;
  }

  /** Where the campaign stands, for the save list: the chapter's title. */
  private saveLabel(): string {
    const chapter = this.chapter();
    return chapter ? `${chapterKicker(chapter.id)} · ${chapter.title}` : 'Camp';
  }

  private storyId(): StoryId {
    const id = this.need().story;
    return id in STORIES ? (id as StoryId) : 'demo';
  }

  private story() {
    return STORIES[this.storyId()];
  }

  private chapter(): ChapterDef | undefined {
    const campaign = this.need();
    return campaign.chapter ? this.story().chapters.get(campaign.chapter) : undefined;
  }

  /** What the player named people, for the scenes. */
  private names(): Readonly<Record<string, string>> {
    return { recruit: this.need().recruitName };
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
