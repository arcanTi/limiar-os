export type SourceType = 'official-core' | 'official-dlc' | 'official-supplement' | 'homebrew-limiar' | 'unvalidated';
export type WeaponQuality = 'poor' | 'standard' | 'excellent';

export interface WeaponAutofire {
  enabled: boolean;
  multiplier?: number;
}

export interface WeaponDamageScaleRow {
  minBody?: number;
  maxBody?: number;
  count?: number;
  sides?: number;
  mod?: number;
}

export interface WeaponDefinition {
  code: string;
  name: string;
  source?: string;
  sourceType?: SourceType;
  kind: 'weapon';
  weaponType: string;
  weaponSkill: string;
  damage: string | null;
  rof: number | null;
  magazine: number | null;
  ammoType: string | null;
  handsRequired: number | 'varies' | null;
  concealable: boolean | null;
  reachMeters?: number | null;
  damageScale?: WeaponDamageScaleRow[];
  cost?: number | null;
  costCategory?: string | null;
  quality?: WeaponQuality | string | null;
  exotic?: boolean;
  attachmentSlots?: number | null;
  rangeTable?: string | null;
  autofire?: WeaponAutofire;
  suppressiveFire?: boolean;
  specialRules?: string[];
  legacyDesc?: string;
  container?: boolean;
}

export const WEAPON_QUALITY_VALUES: WeaponQuality[] = ['poor', 'standard', 'excellent'];

export function isWeaponDefinition(value: unknown): value is WeaponDefinition {
  const v = value as Partial<WeaponDefinition> | null | undefined;
  return !!v && v.kind === 'weapon' && typeof v.code === 'string' && typeof v.name === 'string';
}
