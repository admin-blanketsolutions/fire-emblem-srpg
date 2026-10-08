import { runCampaign } from './core/bot';
import { stepAt } from './core/chapters';
import { botEnvFor, newCampaignFor, STORIES } from './data/battles';
import { campaignBattleIds } from './data/campaign';
import { createCampDemo, createSiegeDemo, demoSupports } from './data/demos';
import { demoStory } from './data/story';
import { shops } from './data';
import { createProvingBattle, PROVING_OBJECTIVES } from './data/proving';
import { Assets } from './engine/assets';
import { Display } from './engine/display';
import { Game } from './engine/game';
import { audio } from './engine/audio';
import { Input } from './engine/input';
import { TextRenderer } from './engine/text';
import { installTouchControls } from './engine/touch';
import { openBrowserStore } from './engine/storage';
import { SaveSlots } from './core/save';
import { GameFlow } from './scenes/flow';
import { BattleScene } from './scenes/battleScene';
import { CampScene } from './scenes/campScene';

/** Show a startup failure on the page instead of leaving a blank screen. */
function showFatal(error: unknown): void {
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;inset:0;margin:0;padding:16px;background:#1b1426;color:#f3e6c0;font:14px monospace;white-space:pre-wrap;z-index:10';
  box.textContent = `Sultan of Two Banners could not start.\n\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}`;
  document.body.append(box);
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('index.html has no <canvas id="game">');
  const display = new Display(canvas);
  const assets = await Assets.load(import.meta.env.BASE_URL);
  const text = new TextRenderer(assets.font);
  const input = new Input(display);
  installTouchControls(input);
  const game = new Game({ display, input, assets, text });
  // browsers allow sound only after the player has pressed something
  for (const event of ['keydown', 'pointerdown'] as const) window.addEventListener(event, () => audio.unlock(), { capture: true });

  const params = new URLSearchParams(window.location.search);

  // The game opens on the title screen. The address can instead go straight to a test battle:
  // the proving ground under each objective (?objective=seize, ?fog=1, ?seed=42), the siege
  // (?demo=siege) or the camp (?demo=camp).
  // For testers, the campaign can start part-way, with an army the computer has brought there:
  // ?chapter=CH-02 at the start of a chapter, ?battle=CH-03C at the camp before a battle
  // (add ?mode=classic and ?seed=7 to choose the mode and the seed).
  const startChapter = params.get('chapter');
  const startBattle = params.get('battle');
  const direct = !startChapter && !startBattle && ['objective', 'demo', 'fog', 'seed'].some((key) => params.has(key));
  if (!direct) {
    const { store, persistent } = openBrowserStore();
    const flow = new GameFlow({
      game,
      assets,
      text,
      slots: new SaveSlots(store),
      persistent,
      now: () => new Date().toISOString(),
      newSeed: () => Math.floor(Math.random() * 0x7fffffff),
    });
    game.run(flow.title());
    const target = startChapter && STORIES.campaign.chapters.has(startChapter) ? { untilChapter: startChapter } : startBattle && campaignBattleIds.has(startBattle) ? { until: startBattle } : null;
    if (target) {
      const env = botEnvFor('campaign');
      const campaign = newCampaignFor('campaign', params.get('mode') === 'classic' ? 'classic' : 'casual', Number(params.get('seed')) || 7);
      runCampaign(env, campaign, { talks: true, keepGoing: true, ...target });
      // for a battle, stop at the camp before it, where its deployment is chosen
      const before = { chapter: campaign.chapter ?? '', step: campaign.step - 1 };
      if ('until' in target && stepAt(env.chapters, before)?.kind === 'camp') campaign.step = before.step;
      flow.play(campaign);
    }
    if (import.meta.env.DEV) Object.assign(window, { sultan: { flow, assets, audio } });
    return;
  }

  const objective = PROVING_OBJECTIVES.find((o) => o === params.get('objective')) ?? 'rout';
  const seed = Number(params.get('seed'));
  const makeSiege = (): BattleScene => {
    const battle = createSiegeDemo(params.has('seed') && Number.isFinite(seed) ? { seed } : undefined);
    return new BattleScene({ battle, assets, text, story: demoStory, onRestart: () => game.setScene(makeSiege()) });
  };
  const makeScene = (): BattleScene => {
    const options = { ...(params.has('seed') && Number.isFinite(seed) ? { seed } : {}), supports: demoSupports };
    const battle =
      params.get('demo') === 'siege' ? createSiegeDemo(options) : createProvingBattle(objective, options, params.get('fog') === '1' ? { fog: true } : undefined);
    const scene = new BattleScene({ battle, assets, text, story: demoStory, onRestart: () => game.setScene(makeScene()) });
    // A handle for poking at a running battle from the browser console while developing.
    if (import.meta.env.DEV) Object.assign(window, { sultan: { battle, scene, assets } });
    return scene;
  };
  // ?demo=camp opens the camp: units, the convoy and the shops, and from there the siege demo
  if (params.get('demo') === 'camp') {
    const { army, tables } = createCampDemo();
    const camp = new CampScene({ army, tables, shops, assets, text, story: demoStory, chapter: 'CH-00', chapterOrder: ['CH-00', 'CH-01', 'CH-02', 'CH-03'], title: 'Camp', continueLabel: 'Ride to the siege', onContinue: () => game.setScene(makeSiege()) });
    if (import.meta.env.DEV) Object.assign(window, { sultan: { scene: camp, army, assets } });
    game.run(camp);
    return;
  }
  game.run(makeScene());
}

boot().catch(showFatal);
