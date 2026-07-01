import { UnitData } from '@/entities/Unit';

export type Phase = 'player' | 'enemy';

export class TurnManager {
  phase: Phase = 'player';
  turn: number = 1;

  startPlayerPhase(units: UnitData[]): void {
    this.phase = 'player';
    units.filter(u => u.faction === 'ally').forEach(u => {
      u.hasMoved = false;
      u.hasActed = false;
    });
  }

  startEnemyPhase(units: UnitData[]): void {
    this.phase = 'enemy';
    units.filter(u => u.faction === 'enemy').forEach(u => {
      u.hasMoved = false;
      u.hasActed = false;
    });
  }

  endPlayerPhase(units: UnitData[]): void {
    this.startEnemyPhase(units);
  }

  endEnemyPhase(units: UnitData[]): void {
    this.turn++;
    this.startPlayerPhase(units);
  }

  allAlliesDone(units: UnitData[]): boolean {
    return units.filter(u => u.faction === 'ally').every(u => u.hasMoved && u.hasActed);
  }
}
