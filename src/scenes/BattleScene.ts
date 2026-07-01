import Phaser from 'phaser';
import { GridSystem, TILE_SIZE } from '@/systems/GridSystem';
import { TurnManager } from '@/systems/TurnManager';
import { UnitData, makeUnit } from '@/entities/Unit';
import { TerrainType } from '@/entities/Tile';

const MAP_LAYOUT: TerrainType[][] = [
  ['castle','plain','plain','plain','plain','forest','forest','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','castle'],
  ['plain','plain','forest','plain','plain','forest','forest','plain','plain','plain','plain','plain','plain','forest','plain','plain','plain','plain','plain','plain'],
  ['plain','plain','forest','forest','plain','plain','plain','plain','plain','mountain','mountain','plain','plain','forest','forest','plain','plain','plain','plain','plain'],
  ['plain','plain','plain','forest','plain','plain','plain','plain','mountain','mountain','mountain','plain','plain','plain','forest','plain','plain','plain','plain','plain'],
  ['plain','plain','plain','plain','plain','plain','plain','plain','plain','mountain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain'],
  ['plain','plain','plain','plain','plain','fort','plain','plain','plain','plain','plain','plain','plain','fort','plain','plain','plain','plain','plain','plain'],
  ['plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain'],
  ['plain','plain','grass','grass','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','grass','grass','plain','plain','plain'],
  ['plain','plain','grass','grass','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','grass','grass','plain','plain','plain'],
  ['plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain'],
  ['castle','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','plain','castle'],
];

const TERRAIN_TEXTURE: Record<TerrainType, string> = {
  plain:    'tile-plain',
  grass:    'tile-grass',
  forest:   'tile-forest',
  mountain: 'tile-mountain',
  fort:     'tile-fort',
  castle:   'tile-castle',
};

export class BattleScene extends Phaser.Scene {
  private grid!: GridSystem;
  private turnManager!: TurnManager;
  private units: UnitData[] = [];

  // Phaser GameObjects
  private tileSprites: Phaser.GameObjects.Image[][] = [];
  private unitSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private highlightLayer!: Phaser.GameObjects.Graphics;
  private cursorGraphic!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;

  // Interaction state
  private selectedUnit: UnitData | null = null;
  private movementRange: Set<string> = new Set();
  private cursor = { x: 0, y: 0 };

  constructor() {
    super({ key: 'BattleScene' });
  }

  create(): void {
    const cols = MAP_LAYOUT[0].length;
    const rows = MAP_LAYOUT.length;

    this.grid = new GridSystem(cols, rows, MAP_LAYOUT);
    this.turnManager = new TurnManager();

    this.buildTileMap(cols, rows);
    this.spawnUnits();
    this.setupCamera(cols, rows);
    this.setupInput();
    this.buildHUD();

    this.highlightLayer = this.add.graphics().setDepth(1);
    this.cursorGraphic = this.add.graphics().setDepth(3);

    this.turnManager.startPlayerPhase(this.units);
    this.updateHUD();
    this.drawCursor();
  }

  // ── Map rendering ──────────────────────────────────────────────────────────

  private buildTileMap(cols: number, rows: number): void {
    for (let y = 0; y < rows; y++) {
      this.tileSprites[y] = [];
      for (let x = 0; x < cols; x++) {
        const cell = this.grid.getCell(x, y)!;
        const px = x * TILE_SIZE + TILE_SIZE / 2;
        const py = y * TILE_SIZE + TILE_SIZE / 2;
        const key = TERRAIN_TEXTURE[cell.tile.terrain];
        const img = this.add.image(px, py, key).setDepth(0);
        this.tileSprites[y][x] = img;
      }
    }
  }

  // ── Unit spawning ──────────────────────────────────────────────────────────

  private spawnUnits(): void {
    this.units = [
      makeUnit('ally-1', 'Aiden', 'ally', 'Lord',   2, 9,  { hp: 24, maxHp: 24, str: 8, def: 6, mov: 6 }),
      makeUnit('ally-2', 'Serra', 'ally', 'Knight',  1, 9,  { hp: 30, maxHp: 30, str: 10, def: 10, mov: 4 }),
      makeUnit('ally-3', 'Lyra',  'ally', 'Mage',    3, 9,  { hp: 18, maxHp: 18, mag: 10, res: 5, mov: 5 }),
      makeUnit('enemy-1','Guard', 'enemy','Knight',  17, 1, { hp: 28, maxHp: 28, str: 9, def: 8, mov: 4 }),
      makeUnit('enemy-2','Scout', 'enemy','Thief',   16, 2, { hp: 20, maxHp: 20, str: 6, spd: 12, mov: 7 }),
    ];

    for (const unit of this.units) {
      const { x, y } = this.grid.gridToPixel(unit.gridX, unit.gridY);
      const key = unit.faction === 'ally' ? 'unit-ally' : 'unit-enemy';
      const img = this.add.image(x + TILE_SIZE / 2, y + TILE_SIZE / 2, key).setDepth(2);
      this.unitSprites.set(unit.id, img);
    }
  }

  // ── Camera ─────────────────────────────────────────────────────────────────

  private setupCamera(cols: number, rows: number): void {
    const mapW = cols * TILE_SIZE;
    const mapH = rows * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, mapW, mapH);
    this.cameras.main.centerOn(mapW / 2, mapH / 2);
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private setupInput(): void {
    // Mouse click on the map
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const gx = Math.floor(worldPt.x / TILE_SIZE);
      const gy = Math.floor(worldPt.y / TILE_SIZE);
      this.handleTileClick(gx, gy);
    });

    // Camera pan with middle mouse / right click drag
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && pointer.rightButtonDown()) {
        this.cameras.main.scrollX -= pointer.velocity.x / this.cameras.main.zoom;
        this.cameras.main.scrollY -= pointer.velocity.y / this.cameras.main.zoom;
      }
      // Update cursor position
      const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const gx = Math.floor(worldPt.x / TILE_SIZE);
      const gy = Math.floor(worldPt.y / TILE_SIZE);
      if (gx !== this.cursor.x || gy !== this.cursor.y) {
        this.cursor = { x: gx, y: gy };
        this.drawCursor();
        this.updateHUD();
      }
    });

    // Scroll to zoom
    this.input.on('wheel', (_p: unknown, _go: unknown, _dx: unknown, dy: number) => {
      const cam = this.cameras.main;
      cam.zoom = Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.5, 3);
    });

    // Keyboard: End Turn (E)
    const eKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    eKey.on('down', () => {
      if (this.turnManager.phase === 'player') {
        this.endPlayerPhase();
      }
    });
  }

  // ── Tile click logic ───────────────────────────────────────────────────────

  private handleTileClick(gx: number, gy: number): void {
    if (this.turnManager.phase !== 'player') return;
    if (!this.grid.getCell(gx, gy)) return;

    const clickedUnit = this.units.find(u => u.gridX === gx && u.gridY === gy);

    if (this.selectedUnit) {
      if (this.movementRange.has(`${gx},${gy}`) && !clickedUnit) {
        // Move the selected unit
        this.moveUnit(this.selectedUnit, gx, gy);
        this.selectedUnit.hasMoved = true;
        this.selectedUnit.hasActed = true;
        this.clearSelection();
      } else if (clickedUnit && clickedUnit.faction === 'ally' && !clickedUnit.hasMoved) {
        // Re-select a different ally
        this.selectUnit(clickedUnit);
      } else {
        this.clearSelection();
      }
    } else {
      if (clickedUnit && clickedUnit.faction === 'ally' && !clickedUnit.hasMoved) {
        this.selectUnit(clickedUnit);
      }
    }
  }

  private selectUnit(unit: UnitData): void {
    this.selectedUnit = unit;
    this.movementRange = this.grid.getMovementRange(unit, this.units);
    this.drawHighlights();
    this.updateHUD();
  }

  private clearSelection(): void {
    this.selectedUnit = null;
    this.movementRange = new Set();
    this.highlightLayer.clear();
  }

  private moveUnit(unit: UnitData, toX: number, toY: number): void {
    unit.gridX = toX;
    unit.gridY = toY;
    const sprite = this.unitSprites.get(unit.id)!;
    const { x, y } = this.grid.gridToPixel(toX, toY);
    this.tweens.add({
      targets: sprite,
      x: x + TILE_SIZE / 2,
      y: y + TILE_SIZE / 2,
      duration: 200,
      ease: 'Linear',
    });
    // Dim the unit sprite to show it has moved
    sprite.setAlpha(0.6);
  }

  // ── Phase management ───────────────────────────────────────────────────────

  private endPlayerPhase(): void {
    this.clearSelection();
    this.turnManager.endPlayerPhase(this.units);
    this.phaseText.setText('ENEMY PHASE').setColor('#ff6666');
    this.updateHUD();

    // Simple enemy AI: move each enemy toward the nearest ally
    this.time.delayedCall(600, () => this.runEnemyPhase());
  }

  private runEnemyPhase(): void {
    const enemies = this.units.filter(u => u.faction === 'enemy');
    let delay = 0;

    for (const enemy of enemies) {
      this.time.delayedCall(delay, () => {
        const range = this.grid.getMovementRange(enemy, this.units);
        const nearest = this.findNearestAlly(enemy);
        if (nearest) {
          const target = this.bestCellToward(nearest, range);
          if (target) this.moveUnit(enemy, target.x, target.y);
        }
        enemy.hasMoved = true;
        enemy.hasActed = true;
      });
      delay += 400;
    }

    this.time.delayedCall(delay + 400, () => {
      this.turnManager.endEnemyPhase(this.units);
      // Restore ally sprite opacity
      this.units.filter(u => u.faction === 'ally').forEach(u => {
        this.unitSprites.get(u.id)?.setAlpha(1);
      });
      this.phaseText.setText(`PLAYER PHASE — Turn ${this.turnManager.turn}`).setColor('#88ccff');
      this.updateHUD();
    });
  }

  private findNearestAlly(enemy: UnitData): UnitData | null {
    const allies = this.units.filter(u => u.faction === 'ally');
    if (!allies.length) return null;
    return allies.reduce((closest, ally) => {
      const d = Math.abs(ally.gridX - enemy.gridX) + Math.abs(ally.gridY - enemy.gridY);
      const dc = Math.abs(closest.gridX - enemy.gridX) + Math.abs(closest.gridY - enemy.gridY);
      return d < dc ? ally : closest;
    });
  }

  private bestCellToward(
    target: UnitData,
    range: Set<string>,
  ): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const key of range) {
      const [sx, sy] = key.split(',').map(Number);
      const d = Math.abs(sx - target.gridX) + Math.abs(sy - target.gridY);
      if (d < bestDist) { bestDist = d; best = { x: sx, y: sy }; }
    }
    return best;
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private drawHighlights(): void {
    this.highlightLayer.clear();
    for (const key of this.movementRange) {
      const [x, y] = key.split(',').map(Number);
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      this.highlightLayer.fillStyle(0x4488ff, 0.35).fillRect(px, py, TILE_SIZE, TILE_SIZE);
      this.highlightLayer.lineStyle(1, 0x4488ff, 0.7).strokeRect(px, py, TILE_SIZE, TILE_SIZE);
    }
  }

  private drawCursor(): void {
    this.cursorGraphic.clear();
    const px = this.cursor.x * TILE_SIZE;
    const py = this.cursor.y * TILE_SIZE;
    this.cursorGraphic.lineStyle(2, 0xffffff, 0.9).strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  }

  // ── HUD ────────────────────────────────────────────────────────────────────

  private buildHUD(): void {
    const cam = this.cameras.main;

    this.phaseText = this.add
      .text(8, 8, 'PLAYER PHASE — Turn 1', {
        fontSize: '13px', fontFamily: 'monospace', color: '#88ccff',
        stroke: '#000', strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(10);

    this.hud = this.add
      .text(8, cam.height - 60, '', {
        fontSize: '12px', fontFamily: 'monospace', color: '#ffffff',
        stroke: '#000', strokeThickness: 2, lineSpacing: 4,
      })
      .setScrollFactor(0)
      .setDepth(10);

    this.add
      .text(cam.width - 8, cam.height - 8, '[E] End Turn  |  Right-drag: Pan  |  Scroll: Zoom', {
        fontSize: '11px', fontFamily: 'monospace', color: '#888888',
      })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(10);
  }

  private updateHUD(): void {
    const cell = this.grid.getCell(this.cursor.x, this.cursor.y);
    const unit = this.units.find(u => u.gridX === this.cursor.x && u.gridY === this.cursor.y);

    const terrainLine = cell
      ? `Terrain: ${cell.tile.terrain}  DEF+${cell.tile.defense}  AVO+${cell.tile.avoid}`
      : '';
    const unitLine = unit
      ? `${unit.name} (${unit.unitClass})  HP: ${unit.stats.hp}/${unit.stats.maxHp}  MOV: ${unit.stats.mov}`
      : '';

    this.hud.setText([terrainLine, unitLine].filter(Boolean).join('\n'));
  }
}
