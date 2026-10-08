import type { AttackOption, BattleState } from '../core/battle';
import type { Forecast, SideForecast } from '../core/combat';
import type { LevelUp } from '../core/exp';
import { kindLabel, roman } from '../core/labels';
import type { ClassActionOption } from '../core/classActions';
import type { PromotionResult } from '../core/promotion';
import { STATUS_NAMES } from '../core/status';
import { STAT_ABBR, STAT_LABELS, type Stat, type Stats } from '../core/stats';
import type { TerrainDef } from '../core/terrain';
import { maxHp, type UnitInstance } from '../core/unit';
import type { WeaponDef } from '../core/weapons';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/viewport';
import type { TextRenderer, TextStyle } from '../engine/text';
import { COLORS } from '../engine/theme';
import { drawGauge, drawPanel } from '../engine/ui';

/** The windows of the battle screen. Each draws itself; none holds state. */

export interface Pen {
  readonly ctx: CanvasRenderingContext2D;
  readonly text: TextRenderer;
}

/** What the unit pages need to know: the data tables, a unit's class and its weapon. A battle has them; so does the camp. */
export type UnitSource = Pick<BattleState, 'classOf' | 'tables' | 'weaponOf'> & {
  /** The army's supports and the units it can name, if there are any to show. */
  readonly supports?: BattleState['supports'];
  readonly units?: BattleState['units'];
};

const GOLD: TextStyle = { color: COLORS.gold };
const PLAIN: TextStyle = { color: COLORS.text };
const DIM: TextStyle = { color: COLORS.textDim };

// ---------------------------------------------------------------- unit and terrain

/** The statuses on a unit as one line: "Burning, Sundered x2". */
export const statusLine = (unit: UnitInstance): string => unit.statuses.map((s) => `${STATUS_NAMES[s.id]}${s.amount > 1 ? ` x${s.amount}` : ''}`).join(', ');

export function drawUnitWindow(pen: Pen, battle: UnitSource, unit: UnitInstance, onRight: boolean): void {
  const { ctx, text } = pen;
  const classLine = unit.kind === 'structure' ? `Guard ${unit.stats.grd}` : `${battle.classOf(unit).name}  Lv ${unit.level}`;
  const statuses = statusLine(unit);
  const w = Math.max(88, text.width(unit.name) + 10, text.width(classLine) + 10, statuses ? text.width(statuses) + 10 : 0);
  const h = statuses ? 46 : 36;
  const x = onRight ? LOGICAL_WIDTH - w - 2 : 2;
  const y = 2;
  drawPanel(ctx, x, y, w, h);
  text.draw(ctx, unit.name, x + 6, y + 5, PLAIN);
  text.draw(ctx, classLine, x + 6, y + 14, DIM);
  text.draw(ctx, 'HP', x + 6, y + 24, GOLD);
  drawGauge(ctx, x + 20, y + 25, w - 60, unit.hp, maxHp(unit), 4);
  text.drawRight(ctx, `${unit.hp}/${maxHp(unit)}`, x + w - 5, y + 24, PLAIN);
  if (statuses) text.draw(ctx, statuses, x + 6, y + 34, { color: COLORS.bad });
}

export function drawTerrainWindow(pen: Pen, terrain: TerrainDef, onRight: boolean, burning = false): void {
  const { ctx, text } = pen;
  const detail = terrain.heals
    ? `Cover ${terrain.cover}  Avoid ${terrain.avoid}  Heals ${Math.round(terrain.heals * 100)}%`
    : `Cover ${terrain.cover}  Avoid ${terrain.avoid}`;
  const warning = burning ? 'Burning: 4 damage, no entry' : '';
  const w = Math.max(text.width(terrain.name), text.width(detail), text.width(warning)) + 12;
  const h = burning ? 35 : 25;
  const x = onRight ? LOGICAL_WIDTH - w - 2 : 2;
  const y = LOGICAL_HEIGHT - h - 2;
  drawPanel(ctx, x, y, w, h);
  text.draw(ctx, terrain.name, x + 6, y + 5, PLAIN);
  text.draw(ctx, detail, x + 6, y + 14, DIM);
  if (burning) text.draw(ctx, warning, x + 6, y + 24, { color: COLORS.bad });
}

/** What a structure is, in a few lines: its Guard, how it stops movement, what hurts it and what it fires. */
function drawStructurePage(pen: Pen, battle: UnitSource, unit: UnitInstance, onRight: boolean): void {
  const { ctx, text } = pen;
  const def = battle.tables.structures.get(unit.defId);
  const weapon = battle.weaponOf(unit);
  const notes: string[] = [];
  notes.push(def?.crossable ? 'Horse and armour cannot cross; foot may climb it' : 'Blocks the way until it is destroyed');
  if (unit.tags.includes('gate')) notes.push('A key, Sap, an axe or a siege bolt will open it');
  if (def?.fireWeak) notes.push('Burns: fire does double damage');
  if (def?.breach) notes.push('Leaves a breach when it falls');
  if (weapon) notes.push(`Fires ${weapon.name}, range ${rangeText(weapon)}`);
  const w = 228;
  const h = 46 + notes.length * 10;
  const x = onRight ? LOGICAL_WIDTH - w - 4 : 4;
  const y = Math.round((LOGICAL_HEIGHT - h) / 2);
  drawPanel(ctx, x, y, w, h);
  text.draw(ctx, unit.name, x + 8, y + 7, PLAIN);
  text.drawRight(ctx, `Guard ${unit.stats.grd}`, x + w - 8, y + 7, PLAIN);
  text.draw(ctx, 'HP', x + 8, y + 19, GOLD);
  drawGauge(ctx, x + 24, y + 20, 100, unit.hp, maxHp(unit), 4);
  text.draw(ctx, `${unit.hp}/${maxHp(unit)}`, x + 130, y + 19, PLAIN);
  notes.forEach((note, i) => text.draw(ctx, note, x + 8, y + 33 + i * 10, i === 0 ? PLAIN : DIM));
  text.drawCentered(ctx, 'Info or Back to close', x + w / 2, y + h - 11, DIM);
}

/** The full unit page: every stat, EXP, skills and the inventory. */
export function drawInfoPage(pen: Pen, battle: UnitSource, unit: UnitInstance, onRight: boolean, hint = 'Info or Back to close'): void {
  if (unit.kind === 'structure') {
    drawStructurePage(pen, battle, unit, onRight);
    return;
  }
  const { ctx, text } = pen;
  const w = 228;
  const h = 142;
  const x = onRight ? LOGICAL_WIDTH - w - 4 : 4;
  const y = Math.round((LOGICAL_HEIGHT - h) / 2);
  drawPanel(ctx, x, y, w, h);
  const left = x + 8;
  const right = x + w - 8;
  text.draw(ctx, unit.name, left, y + 7, PLAIN);
  text.drawRight(ctx, `Lv ${unit.level}`, right, y + 7, PLAIN);
  text.draw(ctx, battle.classOf(unit).name, left, y + 17, DIM);
  if (unit.side === 'player') text.drawRight(ctx, `EXP ${unit.exp}/${battle.tables.balance.expPerLevel}`, right, y + 17, DIM);
  text.draw(ctx, 'HP', left, y + 29, GOLD);
  drawGauge(ctx, left + 16, y + 30, 56, unit.hp, maxHp(unit), 4);
  text.draw(ctx, `${unit.hp}/${maxHp(unit)}`, left + 78, y + 29, PLAIN);

  const rows: ReadonlyArray<readonly [Stat, Stat]> = [['mgt', 'grd'], ['skl', 'nrv'], ['spd', 'bld'], ['fort', 'mov']];
  rows.forEach(([a, b], i) => {
    const ry = y + 43 + i * 10;
    text.draw(ctx, STAT_LABELS[a], left, ry, GOLD);
    text.drawRight(ctx, String(unit.stats[a]), left + 54, ry, PLAIN);
    text.draw(ctx, STAT_LABELS[b], left + 62, ry, GOLD);
    text.drawRight(ctx, String(unit.stats[b]), left + 108, ry, PLAIN);
  });

  const itemX = left + 120;
  text.draw(ctx, 'Items', itemX, y + 29, GOLD);
  unit.inventory.slice(0, 5).forEach((stack, i) => {
    const name = battle.tables.weapons.get(stack.id)?.name ?? battle.tables.items.get(stack.id)?.name ?? stack.id;
    const ry = y + 43 + i * 10;
    if (i === unit.equipped) text.draw(ctx, '→', itemX - 7, ry, GOLD);
    text.draw(ctx, name, itemX, ry, PLAIN);
    text.drawRight(ctx, String(stack.uses), right, ry, DIM);
  });
  // skills, as many whole names as fit, and any statuses
  const names = unit.skills.map((id) => battle.tables.skills.get(id)?.name ?? id);
  let skills = '';
  for (const name of names) {
    const next = skills ? `${skills}, ${name}` : name;
    if (text.width(`Skills  ${next}`) > w - 16) break;
    skills = next;
  }
  text.draw(ctx, 'Skills', left, y + 97, GOLD);
  text.draw(ctx, skills || 'None', left + 40, y + 97, PLAIN);
  const statuses = statusLine(unit);
  if (statuses) {
    text.draw(ctx, 'Status', left, y + 107, GOLD);
    text.draw(ctx, statuses, left + 40, y + 107, { color: COLORS.bad });
  }
  const bonds = bondsLine(battle, unit);
  if (bonds) {
    text.draw(ctx, 'Bonds', left, y + 117, GOLD);
    text.draw(ctx, bonds, left + 40, y + 117, PLAIN);
  }
  text.drawCentered(ctx, hint ? `${unit.moveType} · ${hint}` : unit.moveType, x + w / 2, y + h - 12, DIM);
}

/** The supports a unit has reached, as "Pikeman C, Healer B": only ranks whose scene has been seen count. */
export function bondsLine(source: UnitSource, unit: UnitInstance): string {
  const supports = source.supports;
  if (!supports) return '';
  const out: string[] = [];
  for (const def of supports.defs.values()) {
    const partner = supports.partnerIn(def, unit.defId);
    const rank = partner ? supports.rankOf(def.id) : null;
    if (!partner || !rank) continue;
    out.push(`${source.units?.find((u) => u.defId === partner)?.name ?? partner} ${rank}`);
  }
  return out.join(', ');
}

// ---------------------------------------------------------------- weapons

/** Short descriptions of a weapon's special properties. */
export function weaponNotes(weapon: WeaponDef): string[] {
  const notes: string[] = [];
  if (weapon.effective?.length) notes.push(`x2 vs ${weapon.effective.join(', ')}`);
  for (const [target, bonus] of Object.entries(weapon.vsBonus ?? {})) notes.push(`+${bonus} vs ${target}`);
  if (weapon.pierce) notes.push(`Pierce ${weapon.pierce}`);
  if (weapon.quick) notes.push(`Quick +${weapon.quick}`);
  if (weapon.kind === 'fire') notes.push('Skill power, ignores cover');
  if (weapon.mountedOnly) notes.push('Mounted only');
  if (weapon.closeHit) notes.push(`${weapon.closeHit} Hit at range 1`);
  return notes;
}

export const rangeText = (weapon: WeaponDef): string =>
  weapon.range[0] === weapon.range[1] ? `${weapon.range[1]}` : `${weapon.range[0]}-${weapon.range[1]}`;

/** The weapon choice: the list on the left, the highlighted weapon's numbers on the right. */
export function drawWeaponSelect(pen: Pen, options: readonly AttackOption[] | ReadonlyArray<{ weapon: WeaponDef }>, uses: readonly number[], index: number, title: string): void {
  const { ctx, text } = pen;
  const listW = Math.max(...options.map((o) => text.width(o.weapon.name)), text.width(title)) + 34;
  const detailW = 112;
  const w = listW + detailW;
  const h = Math.max(options.length + 1, 5) * 10 + 8;
  const x = Math.round((LOGICAL_WIDTH - w) / 2);
  const y = LOGICAL_HEIGHT - h - 4;
  drawPanel(ctx, x, y, w, h);
  text.draw(ctx, title, x + 9, y + 5, DIM);
  options.forEach((option, i) => {
    const ry = y + 15 + i * 10;
    if (i === index) text.draw(ctx, '→', x + 4, ry, GOLD);
    text.draw(ctx, option.weapon.name, x + 12, ry, PLAIN);
    text.drawRight(ctx, String(uses[i] ?? ''), x + listW - 6, ry, DIM);
  });
  ctx.fillStyle = COLORS.panelInner;
  ctx.fillRect(x + listW, y + 5, 1, h - 10);
  const weapon = options[index]?.weapon;
  if (!weapon) return;
  const dx = x + listW + 7;
  const head = weapon.kind === 'remedy' ? `Heals ${weapon.might}` : `Might ${weapon.might}  Hit ${weapon.hit}`;
  text.draw(ctx, head, dx, y + 5, PLAIN);
  text.draw(ctx, weapon.kind === 'remedy' ? `Range ${rangeText(weapon)}` : `Crit ${weapon.crit}  Range ${rangeText(weapon)}`, dx, y + 15, PLAIN);
  text.draw(ctx, `Weight ${weapon.weight}  ${kindLabel(weapon.kind)} ${roman(weapon.grade)}`, dx, y + 25, DIM);
  weaponNotes(weapon)
    .slice(0, 2)
    .forEach((note, i) => text.draw(ctx, note, dx, y + 35 + i * 10, { color: COLORS.good }));
}

// ---------------------------------------------------------------- the forecast

const STRIKE_MARK = { 1: '▲', 0: '', [-1]: '▼' } as const;

/** The pre-battle forecast (DESIGN §5.5), with an optional second page of the working. */
export function drawForecast(pen: Pen, battle: BattleState, fc: Forecast, a: UnitInstance, d: UnitInstance, detail: boolean, atTop: boolean): void {
  const { ctx, text } = pen;
  const w = 208;
  const h = 86;
  const x = Math.round((LOGICAL_WIDTH - w) / 2);
  const y = atTop ? 3 : LOGICAL_HEIGHT - h - 3;
  drawPanel(ctx, x, y, w, h);
  const mid = x + w / 2;
  const leftEdge = x + 8;
  const rightEdge = x + w - 8;
  const gap = 20;
  const sideColor = (s: SideForecast): TextStyle => ({ color: s.strike ? COLORS.text : COLORS.textDim });

  text.draw(ctx, `${a.name}  Lv ${a.level}`, leftEdge, y + 5, PLAIN);
  text.drawRight(ctx, `Lv ${d.level}  ${d.name}`, rightEdge, y + 5, PLAIN);
  const weaponLine = (s: SideForecast): string => `${s.weaponName ?? 'No weapon'} ${STRIKE_MARK[s.triangle]}`.trim();
  text.draw(ctx, weaponLine(fc.attacker), leftEdge, y + 15, fc.attacker.triangle === 1 ? { color: COLORS.good } : fc.attacker.triangle === -1 ? { color: COLORS.bad } : DIM);
  text.drawRight(ctx, weaponLine(fc.defender), rightEdge, y + 15, fc.defender.triangle === 1 ? { color: COLORS.good } : fc.defender.triangle === -1 ? { color: COLORS.bad } : DIM);

  const row = (label: string, left: string, right: string, rowIndex: number, leftStyle: TextStyle = PLAIN, rightStyle: TextStyle = PLAIN): void => {
    const ry = y + 27 + rowIndex * 10;
    text.drawCentered(ctx, label, mid, ry, GOLD);
    text.drawRight(ctx, left, mid - gap, ry, leftStyle);
    text.draw(ctx, right, mid + gap, ry, rightStyle);
  };
  const strikes = (s: SideForecast): string => (s.strike ? `${s.strike.damage}${s.strikes > 1 ? ` x${s.strikes}` : ''}` : '—');
  const stat = (s: SideForecast, pick: 'hit' | 'crit'): string => (s.strike ? String(s.strike[pick]) : '—');
  const hp = (s: SideForecast): string => `${s.hpNow} → ${s.hpAfter}`;
  const hpStyle = (s: SideForecast): TextStyle => (s.hpAfter <= 0 ? { color: COLORS.bad } : PLAIN);

  if (!detail) {
    row('HP', hp(fc.attacker), hp(fc.defender), 0, hpStyle(fc.attacker), hpStyle(fc.defender));
    row('DMG', strikes(fc.attacker), strikes(fc.defender), 1, sideColor(fc.attacker), sideColor(fc.defender));
    row('HIT', stat(fc.attacker, 'hit'), stat(fc.defender, 'hit'), 2, sideColor(fc.attacker), sideColor(fc.defender));
    row('CRT', stat(fc.attacker, 'crit'), stat(fc.defender, 'crit'), 3, sideColor(fc.attacker), sideColor(fc.defender));
    text.drawCentered(ctx, 'OK Fight   Back   Info Details', mid, y + h - 12, DIM);
  } else {
    const terrain = battle.terrainAt(d.x, d.y);
    row('SPD', String(fc.attacker.attackSpeed), String(fc.defender.attackSpeed), 0);
    row('ACC', String(fc.attacker.accuracy), String(fc.defender.accuracy), 1);
    row('EVA', String(fc.attacker.evasion), String(fc.defender.evasion), 2);
    text.drawCentered(ctx, `${terrain.name}: cover ${terrain.cover}, avoid ${terrain.avoid}`, mid, y + 58, DIM);
    text.drawCentered(ctx, 'Info or Back to return', mid, y + h - 12, DIM);
  }
}

export function drawHealForecast(pen: Pen, healer: UnitInstance, target: UnitInstance, weapon: WeaponDef, atTop: boolean): void {
  const { ctx, text } = pen;
  const restored = Math.min(weapon.might, maxHp(target) - target.hp);
  const w = 168;
  const h = 46;
  const x = Math.round((LOGICAL_WIDTH - w) / 2);
  const y = atTop ? 3 : LOGICAL_HEIGHT - h - 3;
  drawPanel(ctx, x, y, w, h);
  text.draw(ctx, `${healer.name} heals ${target.name}`, x + 8, y + 6, PLAIN);
  text.draw(ctx, `${weapon.name}  +${restored} HP`, x + 8, y + 16, { color: COLORS.good });
  text.draw(ctx, 'HP', x + 8, y + 27, GOLD);
  drawGauge(ctx, x + 24, y + 28, 70, target.hp + restored, maxHp(target), 4);
  text.draw(ctx, `${target.hp} → ${target.hp + restored}`, x + 100, y + 27, PLAIN);
}

// ---------------------------------------------------------------- the fight, EXP and level-ups

/** Names and HP of the two fighters, at the top of the screen during a fight. */
export function drawFightHud(pen: Pen, attacker: UnitInstance, defender: UnitInstance, hp: ReadonlyMap<string, number>): void {
  const { ctx, text } = pen;
  const panel = (unit: UnitInstance, x: number): void => {
    const w = 112;
    const shown = hp.get(unit.id) ?? unit.hp;
    drawPanel(ctx, x, 2, w, 25);
    text.draw(ctx, unit.name, x + 6, 6, PLAIN);
    text.draw(ctx, 'HP', x + 6, 16, GOLD);
    drawGauge(ctx, x + 20, 17, w - 56, shown, maxHp(unit), 4);
    text.drawRight(ctx, String(shown), x + w - 6, 16, PLAIN);
  };
  panel(attacker, 2);
  panel(defender, LOGICAL_WIDTH - 114);
}

/** The EXP bar after a fight. `shown` is the animated value between 0 and the EXP per level. */
export function drawExpWindow(pen: Pen, unit: UnitInstance, shown: number, perLevel: number, gained: number): void {
  const { ctx, text } = pen;
  const w = 156;
  const h = 32;
  const x = Math.round((LOGICAL_WIDTH - w) / 2);
  const y = LOGICAL_HEIGHT - h - 6;
  drawPanel(ctx, x, y, w, h);
  text.draw(ctx, `${unit.name}  Lv ${unit.level}`, x + 7, y + 6, PLAIN);
  text.drawRight(ctx, `+${gained}`, x + w - 7, y + 6, { color: COLORS.good });
  text.draw(ctx, 'EXP', x + 7, y + 18, GOLD);
  drawGauge(ctx, x + 30, y + 19, 90, Math.floor(shown), perLevel, 4, COLORS.exp);
  text.drawRight(ctx, String(Math.floor(shown)), x + w - 7, y + 18, PLAIN);
}

const LEVEL_GRID: ReadonlyArray<readonly Stat[]> = [
  ['hp', 'mgt', 'skl'],
  ['spd', 'fort', 'grd'],
  ['nrv', 'bld', 'mov'],
];

/** `stats` are the values to show: the unit's stats as they stood after this level-up. */
export function drawLevelUp(pen: Pen, unit: UnitInstance, levelUp: LevelUp, stats: Stats): void {
  const { ctx, text } = pen;
  const w = 188;
  const h = 96;
  const x = Math.round((LOGICAL_WIDTH - w) / 2);
  const y = Math.round((LOGICAL_HEIGHT - h) / 2);
  drawPanel(ctx, x, y, w, h);
  text.drawCentered(ctx, 'Level Up!', x + w / 2, y + 7, { color: COLORS.gold, shadow: COLORS.ink });
  text.drawCentered(ctx, `${unit.name}   Lv ${levelUp.levelBefore} → ${levelUp.levelAfter}`, x + w / 2, y + 19, PLAIN);
  LEVEL_GRID.forEach((cols, r) => {
    cols.forEach((stat, c) => {
      const cx = x + 12 + c * 58;
      const cy = y + 33 + r * 12;
      const gained = (levelUp.gains[stat] ?? 0) > 0;
      const value = String(stats[stat]);
      text.draw(ctx, STAT_ABBR[stat], cx, cy, GOLD);
      text.drawRight(ctx, value, cx + 36, cy, gained ? { color: COLORS.good } : PLAIN);
      if (gained) text.draw(ctx, '+1', cx + 39, cy, { color: COLORS.good });
    });
  });
  text.drawCentered(ctx, 'OK to continue', x + w / 2, y + h - 12, DIM);
}

export function drawMessage(pen: Pen, lines: readonly string[]): void {
  const { ctx, text } = pen;
  const w = Math.max(...lines.map((l) => text.width(l))) + 24;
  const h = lines.length * 11 + 14;
  const x = Math.round((LOGICAL_WIDTH - w) / 2);
  const y = Math.round((LOGICAL_HEIGHT - h) / 2);
  drawPanel(ctx, x, y, w, h);
  lines.forEach((line, i) => text.drawCentered(ctx, line, x + w / 2, y + 8 + i * 11, PLAIN));
}


/** The end of the chapter: a veil, the verdict, and why. */
export function drawOutcome(pen: Pen, result: 'won' | 'lost', reason: string, prompt: string | null): void {
  const { ctx, text } = pen;
  ctx.fillStyle = 'rgba(13, 10, 20, 0.72)';
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  const top = 46;
  ctx.fillStyle = result === 'won' ? COLORS.victory : COLORS.defeat;
  ctx.fillRect(0, top, LOGICAL_WIDTH, 1);
  ctx.fillRect(0, top + 66, LOGICAL_WIDTH, 1);
  text.drawCentered(ctx, result === 'won' ? 'Victory' : 'Defeat', LOGICAL_WIDTH / 2, top + 10, { color: result === 'won' ? COLORS.victory : COLORS.defeat, shadow: COLORS.ink, scale: 3 });
  text.wrap(reason, 200).forEach((line, i) => text.drawCentered(ctx, line, LOGICAL_WIDTH / 2, top + 38 + i * 10, PLAIN));
  if (prompt) text.drawCentered(ctx, prompt, LOGICAL_WIDTH / 2, top + 76, DIM);
}

/** Who is about to speak with whom. */
export function drawTalkPrompt(pen: Pen, speaker: UnitInstance, listener: UnitInstance, atTop: boolean): void {
  const { ctx, text } = pen;
  const line = `${speaker.name} speaks with ${listener.name}`;
  const w = text.width(line) + 24;
  const h = 34;
  const x = Math.round((LOGICAL_WIDTH - w) / 2);
  const y = atTop ? 3 : LOGICAL_HEIGHT - h - 3;
  drawPanel(ctx, x, y, w, h);
  text.drawCentered(ctx, line, x + w / 2, y + 7, PLAIN);
  text.drawCentered(ctx, 'OK Talk   Back', x + w / 2, y + 19, DIM);
}

// ---------------------------------------------------------------- items, trading and class actions

/** The pack: every stack with its uses, the equipped weapon marked, and a line about the one highlighted. */
export function drawItemList(pen: Pen, battle: UnitSource, unit: UnitInstance, index: number, note: string | null): void {
  const { ctx, text } = pen;
  const rows = Math.max(1, unit.inventory.length);
  const w = 204;
  const stack = unit.inventory[index];
  const weapon = stack ? battle.tables.weapons.get(stack.id) : undefined;
  const item = stack ? battle.tables.items.get(stack.id) : undefined;
  const detail = weapon
    ? weapon.kind === 'remedy'
      ? `Heals ${weapon.might}  Range ${rangeText(weapon)}`
      : `${kindLabel(weapon.kind)} ${roman(weapon.grade)}  Might ${weapon.might}  Hit ${weapon.hit}  Wt ${weapon.weight}`
    : (item?.description ?? '');
  const lines = text.wrap(note ?? detail, w - 18).slice(0, 2);
  const h = rows * 10 + 32 + lines.length * 10;
  const x = Math.round((LOGICAL_WIDTH - w) / 2);
  const y = LOGICAL_HEIGHT - h - 4;
  drawPanel(ctx, x, y, w, h);
  text.draw(ctx, `${unit.name}'s pack`, x + 9, y + 5, DIM);
  if (unit.inventory.length === 0) text.draw(ctx, 'Nothing carried', x + 12, y + 16, DIM);
  unit.inventory.forEach((s, i) => {
    const ry = y + 16 + i * 10;
    const name = battle.tables.weapons.get(s.id)?.name ?? battle.tables.items.get(s.id)?.name ?? s.id;
    if (i === index) text.draw(ctx, '→', x + 4, ry, GOLD);
    text.draw(ctx, name, x + 12, ry, PLAIN);
    if (i === unit.equipped) text.draw(ctx, 'E', x + 118, ry, GOLD);
    text.drawRight(ctx, String(s.uses), x + w - 8, ry, DIM);
  });
  const fy = y + 16 + rows * 10 + 2;
  ctx.fillStyle = COLORS.panelInner;
  ctx.fillRect(x + 6, fy - 2, w - 12, 1);
  lines.forEach((line, i) => text.draw(ctx, line, x + 9, fy + 2 + i * 10, note ? { color: COLORS.bad } : DIM));
  text.draw(ctx, weapon ? 'OK Equip   Back' : 'OK Use   Back', x + 9, fy + 2 + lines.length * 10, DIM);
}

export interface TradeView {
  readonly col: 0 | 1;
  readonly row: number;
  /** The stack picked up and waiting for somewhere to go. */
  readonly held: { readonly col: 0 | 1; readonly row: number } | null;
  readonly note: string | null;
}

/** Two packs side by side: pick a stack, then pick where it goes (a stack there swaps, the first empty slot takes it). */
export function drawTrade(pen: Pen, battle: UnitSource, a: UnitInstance, b: UnitInstance, view: TradeView): void {
  const { ctx, text } = pen;
  const w = 236;
  const h = 96;
  const x = Math.round((LOGICAL_WIDTH - w) / 2);
  const y = Math.round((LOGICAL_HEIGHT - h) / 2);
  drawPanel(ctx, x, y, w, h);
  [a, b].forEach((unit, col) => {
    const cx = x + 8 + col * 118;
    text.draw(ctx, unit.name, cx + 6, y + 6, GOLD);
    for (let row = 0; row < 5; row++) {
      const stack = unit.inventory[row];
      const ry = y + 19 + row * 10;
      const here = view.col === col && view.row === row;
      const held = view.held?.col === col && view.held.row === row;
      if (here) text.draw(ctx, '→', cx, ry, GOLD);
      if (stack) {
        const name = battle.tables.weapons.get(stack.id)?.name ?? battle.tables.items.get(stack.id)?.name ?? stack.id;
        text.draw(ctx, name, cx + 7, ry, held ? { color: COLORS.gold } : PLAIN);
        if (row === unit.equipped) text.draw(ctx, 'E', cx + 80, ry, GOLD);
        text.drawRight(ctx, String(stack.uses), cx + 104, ry, DIM);
      } else {
        text.draw(ctx, row === unit.inventory.length ? '(free slot)' : '—', cx + 7, ry, DIM);
      }
    }
  });
  ctx.fillStyle = COLORS.panelInner;
  ctx.fillRect(x + w / 2, y + 5, 1, 66);
  text.drawCentered(ctx, view.note ?? (view.held ? 'Choose where it goes   Back to put it down' : 'OK Pick up a stack   Back to finish'), x + w / 2, y + h - 17, view.note ? { color: COLORS.bad } : DIM);
}

/** What a class action is about to do, with the target's name. */
export function drawActionPrompt(pen: Pen, lines: readonly string[], atTop: boolean): void {
  const { ctx, text } = pen;
  const w = Math.max(...lines.map((l) => text.width(l)), 100) + 24;
  const h = lines.length * 10 + 24;
  const x = Math.round((LOGICAL_WIDTH - w) / 2);
  const y = atTop ? 3 : LOGICAL_HEIGHT - h - 3;
  drawPanel(ctx, x, y, w, h);
  lines.forEach((line, i) => text.drawCentered(ctx, line, x + w / 2, y + 7 + i * 10, i === 0 ? PLAIN : DIM));
  text.drawCentered(ctx, 'OK Confirm   Back', x + w / 2, y + h - 13, DIM);
}

/** The words for an action aimed at a target, for the prompt above. */
export function actionPromptLines(battle: BattleState, actor: UnitInstance, option: ClassActionOption, target: UnitInstance | undefined): string[] {
  switch (option.id) {
    case 'sap':
      return target ? [`${actor.name} saps the ${target.name}`, `${target.hp} → ${Math.max(0, target.hp - 8)} HP, Guard ignored`] : [];
    case 'entrench':
      return [`${actor.name} raises a barricade here`, 'Blocks horse and armour; foot may climb it'];
    case 'mend': {
      const weapon = target ? battle.weaponOf(target) : null;
      return target && weapon ? [`${actor.name} mends ${target.name}'s ${weapon.name}`, '+10 uses'] : [];
    }
    case 'counsel':
      return target ? [`${actor.name} counsels ${target.name}`, '+10 Hit and Avoid until the enemy phase ends'] : [];
    case 'dispatch':
      return target ? [`${actor.name} sends ${target.name} on`, `${target.name} may move and act again`] : [];
    case 'decree':
      return [`${actor.name} issues a decree`, 'Allies: +10 Hit and Avoid until the enemy phase ends'];
    case 'open':
      return target ? [`${actor.name} opens the ${target.name}`, 'The key is used up'] : [];
  }
}

/** The new class and the stats it brought. */
export function drawPromotion(pen: Pen, result: PromotionResult): void {
  const { ctx, text } = pen;
  const w = 196;
  const h = 108;
  const x = Math.round((LOGICAL_WIDTH - w) / 2);
  const y = Math.round((LOGICAL_HEIGHT - h) / 2);
  drawPanel(ctx, x, y, w, h);
  text.drawCentered(ctx, 'Promoted!', x + w / 2, y + 7, { color: COLORS.gold, shadow: COLORS.ink });
  text.drawCentered(ctx, result.unit.name, x + w / 2, y + 19, PLAIN);
  text.drawCentered(ctx, `${result.from.name} → ${result.to.name}`, x + w / 2, y + 30, { color: COLORS.good });
  LEVEL_GRID.forEach((cols, r) => {
    cols.forEach((stat, c) => {
      const cx = x + 12 + c * 58;
      const cy = y + 45 + r * 12;
      const gain = result.after[stat] - result.before[stat];
      text.draw(ctx, STAT_ABBR[stat], cx, cy, GOLD);
      text.drawRight(ctx, String(result.after[stat]), cx + 36, cy, gain > 0 ? { color: COLORS.good } : PLAIN);
      if (gain > 0) text.draw(ctx, `+${gain}`, cx + 39, cy, { color: COLORS.good });
    });
  });
  text.drawCentered(ctx, `Level ${result.levelBefore} → 1   OK to continue`, x + w / 2, y + h - 12, DIM);
}

/** A line or two at the top of the screen: what the player can do now. */
export function drawHint(pen: Pen, lines: readonly string[]): void {
  const { ctx, text } = pen;
  const w = Math.max(...lines.map((l) => text.width(l))) + 20;
  const x = Math.round((LOGICAL_WIDTH - w) / 2);
  drawPanel(ctx, x, 3, w, lines.length * 10 + 9);
  lines.forEach((line, i) => text.drawCentered(ctx, line, x + w / 2, 8 + i * 10, i === 0 ? PLAIN : DIM));
}
