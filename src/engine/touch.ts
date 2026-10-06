import type { Action } from '../core/input';
import type { Input } from './input';

const CSS = `
.pad { position: fixed; inset: auto 0 0 0; display: flex; justify-content: space-between; align-items: flex-end;
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom)); pointer-events: none; z-index: 5; }
.pad .group { display: grid; gap: 6px; pointer-events: none; }
.pad .dpad { grid-template-columns: repeat(3, 52px); grid-template-rows: repeat(3, 52px); }
.pad .keys { grid-template-columns: repeat(2, 64px); }
.pad button { pointer-events: auto; touch-action: none; user-select: none; -webkit-user-select: none;
  background: rgba(35, 38, 64, 0.62); color: #f3e6c0; border: 2px solid rgba(232, 217, 168, 0.75);
  border-radius: 14px; font: 700 13px/1 system-ui, sans-serif; letter-spacing: 0.02em; }
.pad button:active, .pad button.down { background: rgba(240, 194, 74, 0.55); color: #1b1426; }
.pad .blank { visibility: hidden; }
.pad .top { position: fixed; top: calc(8px + env(safe-area-inset-top)); right: 10px; pointer-events: auto; }
`;

const DIRECTIONS: ReadonlyArray<readonly [string, Action | null]> = [
  ['', null], ['▲', 'up'], ['', null],
  ['◀', 'left'], ['', null], ['▶', 'right'],
  ['', null], ['▼', 'down'], ['', null],
];

const BUTTONS: ReadonlyArray<readonly [string, Action]> = [
  ['OK', 'confirm'],
  ['Back', 'cancel'],
  ['Info', 'info'],
  ['Danger', 'danger'],
  ['Menu', 'menu'],
];

function makeButton(label: string, action: Action | null, input: Input): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (action === null) {
    button.className = 'blank';
    button.disabled = true;
    return button;
  }
  button.setAttribute('aria-label', action);
  const down = (e: PointerEvent): void => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    button.classList.add('down');
    input.press(action);
  };
  const up = (): void => {
    button.classList.remove('down');
    input.release(action);
  };
  button.addEventListener('pointerdown', down);
  button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up);
  button.addEventListener('contextmenu', (e) => e.preventDefault());
  return button;
}

/** Show a virtual pad and the five buttons on touch devices (`pointer: coarse`); nothing elsewhere. */
export function installTouchControls(input: Input): void {
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const pad = document.createElement('div');
  pad.className = 'pad';
  const dpad = document.createElement('div');
  dpad.className = 'group dpad';
  for (const [label, action] of DIRECTIONS) dpad.append(makeButton(label, action, input));
  const keys = document.createElement('div');
  keys.className = 'group keys';
  for (const [label, action] of BUTTONS) keys.append(makeButton(label, action, input));
  pad.append(dpad, keys);
  document.body.append(pad);
}
