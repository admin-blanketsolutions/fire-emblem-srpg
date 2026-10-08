import type { HitMode } from './combat';

/**
 * Player settings (DESIGN §16). Pure data with defaults; reading one that is missing or out of
 * range falls back to the default, so a save from an older version always loads.
 */

export const TEXT_SPEEDS = ['slow', 'normal', 'fast', 'instant'] as const;
export const BATTLE_ANIMATIONS = ['scene', 'map', 'off'] as const;
export const PORTRAIT_MODES = ['illustrated', 'names'] as const;
export const CLASS_NAME_STYLES = ['common', 'historical', 'both'] as const;
export const CAMPAIGN_MODES = ['classic', 'casual'] as const;

export interface Settings {
  readonly mode: (typeof CAMPAIGN_MODES)[number];
  readonly textSpeed: (typeof TEXT_SPEEDS)[number];
  readonly battleAnimations: (typeof BATTLE_ANIMATIONS)[number];
  /** 0 to 1. */
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly hitMode: HitMode;
  readonly guaranteedProgress: boolean;
  readonly autoEndTurn: boolean;
  readonly dangerZoneDefault: boolean;
  /** Show the ◆ (documented) and ◇ (dramatized) marks in dialogue. */
  readonly sourceMarkers: boolean;
  readonly portraits: (typeof PORTRAIT_MODES)[number];
  readonly classNames: (typeof CLASS_NAME_STYLES)[number];
  readonly screenShake: boolean;
  readonly highContrast: boolean;
  readonly largerText: boolean;
  readonly colourBlindSafe: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'classic',
  textSpeed: 'normal',
  battleAnimations: 'map',
  musicVolume: 0.6,
  sfxVolume: 0.8,
  hitMode: 'honest',
  guaranteedProgress: true,
  autoEndTurn: true,
  dangerZoneDefault: false,
  sourceMarkers: true,
  portraits: 'illustrated',
  classNames: 'common',
  screenShake: true,
  highContrast: false,
  largerText: false,
  colourBlindSafe: false,
};

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => (list.includes(value as T) ? (value as T) : fallback);
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);
const unit = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback);

/** Read settings from untrusted data: unknown keys are dropped and bad or missing values take the default. */
export function parseSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    mode: oneOf(CAMPAIGN_MODES, r.mode, d.mode),
    textSpeed: oneOf(TEXT_SPEEDS, r.textSpeed, d.textSpeed),
    battleAnimations: oneOf(BATTLE_ANIMATIONS, r.battleAnimations, d.battleAnimations),
    musicVolume: unit(r.musicVolume, d.musicVolume),
    sfxVolume: unit(r.sfxVolume, d.sfxVolume),
    hitMode: oneOf(['honest', 'weighted'] as const, r.hitMode, d.hitMode),
    guaranteedProgress: flag(r.guaranteedProgress, d.guaranteedProgress),
    autoEndTurn: flag(r.autoEndTurn, d.autoEndTurn),
    dangerZoneDefault: flag(r.dangerZoneDefault, d.dangerZoneDefault),
    sourceMarkers: flag(r.sourceMarkers, d.sourceMarkers),
    portraits: oneOf(PORTRAIT_MODES, r.portraits, d.portraits),
    classNames: oneOf(CLASS_NAME_STYLES, r.classNames, d.classNames),
    screenShake: flag(r.screenShake, d.screenShake),
    highContrast: flag(r.highContrast, d.highContrast),
    largerText: flag(r.largerText, d.largerText),
    colourBlindSafe: flag(r.colourBlindSafe, d.colourBlindSafe),
  };
}

/** Characters revealed per second by the typewriter; `Infinity` for instant. */
export function charsPerSecond(speed: Settings['textSpeed']): number {
  return speed === 'slow' ? 20 : speed === 'normal' ? 45 : speed === 'fast' ? 100 : Number.POSITIVE_INFINITY;
}
