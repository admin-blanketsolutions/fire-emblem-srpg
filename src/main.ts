import { createTestBattle } from './data';
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
  const battle = createTestBattle();
  const scene = new BattleScene({ battle, assets, text });
  game.run(scene);
  // A handle for poking at a running battle from the browser console while developing.
  if (import.meta.env.DEV) Object.assign(window, { sultan: { battle, scene, assets } });
}

boot().catch(showFatal);
