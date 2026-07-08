// Core combat domain shapes. AttackContext in particular is a bag that
// accretes fields as it threads through resolveCombatAttack ->
// resolveAttackCheck -> resolveDamage/resolveAutofireDamage ->
// resolveCriticalInjuryForDamage — every optional field below is one an
// engine in this domain actually reads or writes.

import type { InstalledCyberwareInstance } from '../items/installedCyberwareTypes.ts';

export interface CombatArmorSlot {
  sp: number;
  ablates?: boolean;
}

// Minimal shape for an "active injury" reference as carried on a CombatActor
// (character.criticalInjuries) — just enough to look up the full catalog row
// by id. Distinct from CriticalInjuryTableRow (the full catalog row with
// roll/baseDeathSavePenaltyDelta), which callers only have after resolution.
export interface ActiveInjuryRef {
  id: string;
  baseDeathSavePenaltyDelta?: number;
}

export interface CombatActor {
  id?: string;
  name?: string;
  stats?: Record<string, number>;
  base?: Record<string, number>;
  skills?: Record<string, number>;
  hp?: number;
  maxHp?: number;
  armor?: { head?: CombatArmorSlot; body?: CombatArmorSlot };
  installedCyberware?: InstalledCyberwareInstance[];
  effects?: unknown[];
  inventory?: unknown[];
  criticalInjuries?: ActiveInjuryRef[];
  activeCriticalInjuries?: ActiveInjuryRef[];
  derived?: { effectiveStats?: Record<string, number> };
}

export type WeaponQuality = 'poor' | 'standard' | 'excellent' | string;

export interface WeaponCombatWeaponMode {
  mode?: string;
  damage?: string;
  ammoCost?: number;
}

export interface WeaponCombatProfile {
  code?: string;
  name?: string;
  weaponType?: string;
  weaponClass?: string;
  weaponSkill?: string;
  skill?: string;
  damage?: string | null;
  rof?: number | null;
  magazine?: number | null;
  ammoType?: string | null;
  handsRequired?: number | 'varies' | null;
  hands?: number | null;
  concealable?: boolean | null;
  quality?: WeaponQuality | null;
  exotic?: boolean;
  autofire?: { enabled: boolean; multiplier?: number };
  suppressiveFire?: boolean;
  specialRules?: string[];
  reachMeters?: number;
  damageScale?: { minEffectiveBody?: number; maxEffectiveBody?: number; minBody?: number; maxBody?: number; damage?: string; count?: number; sides?: number; mod?: number }[];
  selectedMode?: string;
  mode?: string;
  weaponModes?: WeaponCombatWeaponMode[];
  effects?: { type?: string; value?: unknown; sourceCode?: string }[];
  weaponProfile?: { container?: boolean; [key: string]: unknown };
  nonLethal?: boolean;
  doesNotCauseCriticalInjury?: boolean;
  attackMod?: number;
  rangeTable?: { custom?: boolean; rows?: { range?: string; dv?: number }[] };
}

export type AttackMode = 'singleShot' | 'melee' | 'brawling' | 'autofire' | 'area' | 'aimedShot' | 'suppressiveFirePlaceholder';

export interface RollParts {
  total?: number;
  d10?: number;
  base?: number;
  modifiers?: number;
}

export interface DamageRollInput {
  rolls?: number[];
  total?: number;
}

export interface CriticalRollAdvantage {
  rollCount: number;
  choose?: number;
  sourceCode?: string;
}

export interface AttackContext {
  attacker?: CombatActor;
  target?: CombatActor;
  weapon?: WeaponCombatProfile;
  attackMode?: AttackMode;
  attackStat?: string;
  selectedMode?: string;
  targetDV?: number;
  evasionDV?: number;
  rangeBand?: string;
  rangeMeters?: number;
  targetLocation?: 'head' | 'body';
  aimedShot?: boolean;
  autofire?: boolean;
  suppressiveFire?: boolean;
  areaAttack?: boolean;
  meleeAttack?: boolean;
  brawlingAttack?: boolean;
  martialArtsAttack?: boolean;
  modifiers?: { source?: string; type?: string; label?: string; value?: number }[] | Record<string, number> | number;
  spotWeaknessDamage?: number;
  damageRoll?: DamageRollInput;
  attackRoll?: RollParts;
  defenseRoll?: RollParts;
  ammoState?: { currentAmmo?: number; magazine?: number } | null;
  cover?: unknown;
  notes?: string[];
  useWeaponRangeTable?: boolean;
  canonicalRules?: Record<string, unknown> & { combatRules?: { damage?: { ablationAmount?: number }; brawling?: { damageByBody?: { minBody?: number; maxBody?: number; damage?: string }[] } }; criticalInjuryRules?: { trigger?: { bonusDamage?: number } }; criticalInjuryAliases?: Record<string, string> };
  catalog?: unknown[];
  criticalInjuryId?: string;
  criticalRoll?: number;
  criticalRollAdvantage?: CriticalRollAdvantage;
  selectedCriticalRollIndex?: number;
  criticalRollOptions?: { roll: number | null; injury: unknown }[];
  sharedDamageRoll?: boolean;
  criticalRollsByTarget?: Record<string, number>;
  hit?: boolean;
  attackTotal?: number | null;
  defenseDV?: number | null;
  margin?: number | null;
  targetType?: string;
  userMovedAtLeast4m?: boolean;
  attackUsesLegs?: boolean;
  attackSkill?: string;
  selectedSkill?: string;
  attackType?: string;
  hpDamage?: number;
  damagedTarget?: boolean;
}

export interface CombatIssue {
  severity: 'info' | 'warning' | 'error';
  type: string;
  message: string;
  evidence?: unknown;
}

export interface DamageResult {
  hit: boolean;
  attackTotal: number | null;
  defenseDV: number | null;
  margin: number | null;
  rawDamage: number;
  multipliedDamage?: number;
  autofireMultiplier?: number;
  damageDice: string | null;
  damageRoll?: { rolls: number[]; total: number; expression: string; issues: CombatIssue[] };
  sixesRolled: number;
  criticalTriggered: boolean;
  criticalPending?: boolean;
  criticalInjury?: unknown;
  criticalInjuryApplied?: boolean;
  criticalInjuryBlocked?: boolean;
  criticalRollOptions?: { roll: number | null; injury: unknown }[];
  criticalSuppressed?: boolean;
  criticalBonusDamage: number;
  homebrewDirectDamage?: number;
  headshotMultiplier?: number;
  damageVsCoverBonus?: { rolls: number[]; total: number; expression: string; issues: CombatIssue[] } | null;
  armorSPBefore: number;
  effectiveArmorSP: number;
  armorAblated: boolean;
  additionalAblation?: number;
  armorSPAfter: number;
  hpDamage: number;
  location: 'head' | 'body';
  armorSource?: string;
  notes: string[];
  issues: CombatIssue[];
}

export const ATTACK_MODES: AttackMode[] = [
  'singleShot',
  'melee',
  'brawling',
  'autofire',
  'area',
  'aimedShot',
  'suppressiveFirePlaceholder',
];

export function combatIssue(severity: CombatIssue['severity'], type: string, message: string, evidence: unknown = {}): CombatIssue {
  return { severity, type, message, evidence };
}
