import { createCampDemo, createSiegeDemo, demoSupports } from './data/demos';
import { demoStory } from './data/story';
import { shops } from './data';
import { createProvingBattle, PROVING_OBJECTIVES } from './data/proving';
import { Assets } from './engine/assets';
import { Display } from './engine/display';
import { Game } from './engine/game';
import { Input } from './engine/input';
import { TextRenderer } from './engine/text';
import { installTouchControls } from './engine/touch';
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

  // The proving ground can be played under each objective: ?objective=seize, ?fog=1, ?seed=42.
  // ?demo=siege opens a walled courtyard with gates, mangonels and dry grass to burn.
  const params = new URLSearchParams(window.location.search);
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
