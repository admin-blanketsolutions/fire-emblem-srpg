import { createProvingBattle, PROVING_OBJECTIVES } from './data/proving';
import { Assets } from './engine/assets';
import { Display } from './engine/display';
import { Game } from './engine/game';
import { Input } from './engine/input';
import { TextRenderer } from './engine/text';
import { installTouchControls } from './engine/touch';
import { BattleScene } from './scenes/battleScene';

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

  // The proving ground can be played under each objective: ?objective=seize, ?fog=1, ?seed=42
  const params = new URLSearchParams(window.location.search);
  const objective = PROVING_OBJECTIVES.find((o) => o === params.get('objective')) ?? 'rout';
  const seed = Number(params.get('seed'));
  const makeScene = (): BattleScene => {
    const battle = createProvingBattle(objective, params.has('seed') && Number.isFinite(seed) ? { seed } : undefined, params.get('fog') === '1' ? { fog: true } : undefined);
    const scene = new BattleScene({ battle, assets, text, onRestart: () => game.setScene(makeScene()) });
    // A handle for poking at a running battle from the browser console while developing.
    if (import.meta.env.DEV) Object.assign(window, { sultan: { battle, scene, assets } });
    return scene;
  };
  game.run(makeScene());
}

boot().catch(showFatal);
