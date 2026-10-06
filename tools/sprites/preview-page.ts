import factionsJson from '../../assets/palettes/factions.json';
import skinsJson from '../../assets/palettes/skins.json';
import { remapFor, type PaletteSet } from '../../src/core/palettes';
import { allFrames, renderFrame, usedIndices, validateSpriteDef, type SpriteDef } from '../../src/core/sprite';
import { lintSprite, type LintIssue } from '../../src/core/spritelint';

/**
 * The sprite preview page: every definition under assets/sprites, enlarged, animated, recoloured
 * per faction and skin, with the lint results beside it. Served by the dev server
 * (`npm run sprites:preview`), so editing a .sprite.json reloads the page.
 */

const palettes: PaletteSet = { factions: factionsJson, skins: skinsJson };
const modules = import.meta.glob<unknown>('../../assets/sprites/*.sprite.json', { eager: true, import: 'default' });

type Entry = { path: string; def: SpriteDef; issues: LintIssue[] } | { path: string; def: null; issues: LintIssue[] };

const entries: Entry[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, raw]): Entry => {
    try {
      const def = validateSpriteDef(raw, path.split('/').pop() ?? path);
      return { path, def, issues: lintSprite(def) };
    } catch (e) {
      return { path, def: null, issues: [{ severity: 'error', message: (e as Error).message }] };
    }
  });

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`preview.html has no #${id}`);
  return node as T;
};
const zoomSelect = el<HTMLSelectElement>('zoom');
const factionSelect = el<HTMLSelectElement>('faction');
const skinSelect = el<HTMLSelectElement>('skin');
const bgSelect = el<HTMLSelectElement>('bg');
const problemsOnly = el<HTMLInputElement>('problems');
const filterInput = el<HTMLInputElement>('filter');
const grid = el('grid');
const summary = el('summary');

for (const name of Object.keys(palettes.factions)) factionSelect.add(new Option(name, name));
for (const name of Object.keys(palettes.skins)) skinSelect.add(new Option(name, name));
skinSelect.value = 's2';

interface Animated {
  readonly ctx: CanvasRenderingContext2D;
  readonly images: ImageData[];
  readonly fps: number;
}
let animations: Animated[] = [];

function frameImage(def: SpriteDef, set: string, index: number): ImageData {
  const remap = remapFor(palettes, factionSelect.value, skinSelect.value);
  const image = renderFrame(def, set, index, remap);
  return new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height);
}

function makeCanvas(def: SpriteDef, zoom: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = def.size[0];
  canvas.height = def.size[1];
  canvas.style.width = `${def.size[0] * zoom}px`;
  canvas.style.height = `${def.size[1] * zoom}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  return { canvas, ctx };
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function card(entry: Entry, zoom: number): HTMLElement {
  const { def, issues } = entry;
  const root = node('section', issues.some((i) => i.severity === 'error') ? 'card bad' : 'card');
  root.append(node('h2', undefined, def?.id ?? entry.path.split('/').pop()));
  if (!def) {
    appendIssues(root, issues);
    return root;
  }
  const colours = def.palette.length - 1;
  root.append(node('div', 'meta', `${def.kind} · ${def.size[0]}×${def.size[1]} · ${colours} colour${colours === 1 ? '' : 's'} · ${allFrames(def).length} frame(s)`));

  // the animation: the idle set (or the first set), at the sprite's own frame rate
  const setName = def.frames['idle'] ? 'idle' : (Object.keys(def.frames)[0] ?? '');
  const frames = def.frames[setName] ?? [];
  const anim = def.anim?.[setName];
  const order = anim?.frames ?? frames.map((_, i) => i);
  const stage = node('div', 'stage');
  const { canvas, ctx } = makeCanvas(def, zoom);
  const images = order.map((i) => frameImage(def, setName, i));
  const first = images[0];
  if (first) ctx.putImageData(first, 0, 0);
  animations.push({ ctx, images, fps: anim?.fps ?? 2 });
  stage.append(canvas, node('span', 'meta', `${setName}${images.length > 1 ? ` · ${anim?.fps ?? 2} fps` : ''}`));
  root.append(stage);

  for (const [name, list] of Object.entries(def.frames)) {
    const set = node('div', 'set');
    set.append(node('b', undefined, `${name} (${list.length})`));
    const row = node('div', 'row');
    list.forEach((_, i) => {
      const { canvas: c, ctx: cx } = makeCanvas(def, Math.max(2, Math.floor(zoom / 2)));
      cx.putImageData(frameImage(def, name, i), 0, 0);
      c.title = `${name}[${i}]`;
      row.append(c);
    });
    set.append(row);
    root.append(set);
  }

  const swatches = node('div', 'palette');
  const used = usedIndices(def);
  def.palette.forEach((color, i) => {
    if (i === 0) return;
    const sw = node('span', 'sw', i.toString(16));
    sw.style.background = color;
    const factionSlot = def.slots?.faction?.indexOf(i) ?? -1;
    const skinSlot = def.slots?.skin?.indexOf(i) ?? -1;
    if (factionSlot >= 0) sw.classList.add('slot');
    if (skinSlot >= 0) sw.classList.add('slot', 'skin');
    const notes = [color, used.has(i) ? '' : 'unused', factionSlot >= 0 ? `faction slot ${factionSlot}` : '', skinSlot >= 0 ? `skin slot ${skinSlot}` : ''];
    sw.title = `${i.toString(16)}  ${notes.filter(Boolean).join(' · ')}`;
    swatches.append(sw);
  });
  root.append(swatches);
  appendIssues(root, issues);
  return root;
}

function appendIssues(root: HTMLElement, issues: readonly LintIssue[]): void {
  const list = node('ul', 'issues');
  if (issues.length === 0) list.append(node('li', 'ok', 'lint: clean'));
  for (const issue of issues) list.append(node('li', issue.severity, `${issue.severity}: ${issue.message}`));
  root.append(list);
}

function render(): void {
  document.documentElement.style.setProperty('--bg', bgSelect.value);
  animations = [];
  grid.replaceChildren();
  const zoom = Number(zoomSelect.value);
  const needle = filterInput.value.trim().toLowerCase();
  let shown = 0;
  for (const entry of entries) {
    if (problemsOnly.checked && entry.issues.length === 0) continue;
    if (needle && !(entry.def?.id ?? entry.path).toLowerCase().includes(needle)) continue;
    grid.append(card(entry, zoom));
    shown++;
  }
  const errors = entries.reduce((n, e) => n + e.issues.filter((i) => i.severity === 'error').length, 0);
  const warnings = entries.reduce((n, e) => n + e.issues.filter((i) => i.severity === 'warning').length, 0);
  summary.textContent = `${shown} of ${entries.length} sprites · ${errors} error(s) · ${warnings} warning(s)`;
}

for (const control of [zoomSelect, factionSelect, skinSelect, bgSelect, problemsOnly]) control.addEventListener('change', render);
filterInput.addEventListener('input', render);

function tick(now: number): void {
  for (const a of animations) {
    const image = a.images[Math.floor((now * a.fps) / 1000) % a.images.length];
    if (image) a.ctx.putImageData(image, 0, 0);
  }
  requestAnimationFrame(tick);
}
render();
requestAnimationFrame(tick);
