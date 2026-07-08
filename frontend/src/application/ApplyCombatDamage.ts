import { applyArmorToDamage, combatDamageContributions } from '../domain/combat/index.ts';
import type { DamageContributionRow } from '../domain/combat/index.ts';
import { evaluateRollTriggers } from '../domain/combat/constants.ts';
import { rollDiceMeta, rollFaces } from '../domain/dice/index.ts';
import type { DiceContributionInput } from '../domain/dice/index.ts';
import { criticalInjuryEntry } from '../domain/conditions/index.ts';
import type { CriticalInjuryInstance } from '../domain/conditions/index.ts';
import { CPRED_CRITICAL_INJURIES, CPRED_CRITICAL_INJURY_TABLE } from '../domain/character/constants.ts';
import type { CriticalInjuryCatalogEntry } from '../domain/character/constants.ts';
import { criticalInjuryImmunity } from '../domain/cyberware/index.ts';
import type { InstalledCyberwareItem } from '../domain/cyberware/index.ts';
import type { RuntimeWeaponProfile } from '../domain/items/weaponProfileEngine.ts';

interface DieEntry {
  value: number;
  sides: number | null;
  source: string;
  kind: string;
  reason: string;
  contributionIndex: number;
}

function buildDice(contributions: DiceContributionInput[] | undefined, faces: number[]): DieEntry[] {
  const meta = rollDiceMeta({ contributions });
  return faces.map((value, idx) => ({
    value,
    sides: meta[idx] ? meta[idx].sides : null,
    source: meta[idx] ? meta[idx].source : 'Damage',
    kind: meta[idx] ? meta[idx].kind : 'base',
    reason: meta[idx] ? meta[idx].reason : '',
    contributionIndex: meta[idx] ? meta[idx].contributionIndex : 0,
  }));
}

interface RolledCriticalInjury {
  id: string;
  sum: number;
  catalog: CriticalInjuryCatalogEntry;
}

// 2d6 table roll with the book's "Multiplas Lesoes" rule: reroll (up to 20
// attempts) until landing on an injury the target doesn't already have, then
// fall back to the rolled one rather than looping forever.
function rollCriticalInjuryFromTable(location: string, existingInjuryIds: string[] | undefined, rng: () => number): RolledCriticalInjury | null {
  const existing = new Set(existingInjuryIds || []);
  const table = CPRED_CRITICAL_INJURY_TABLE[location as 'head' | 'body'] || {};
  let id: string | null = null;
  let sum: number | null = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    sum = (1 + Math.floor(rng() * 6)) + (1 + Math.floor(rng() * 6));
    id = table[sum];
    if (!id || !existing.has(id)) break;
  }
  return id ? { id, sum: sum as number, catalog: CPRED_CRITICAL_INJURIES[id] } : null;
}

interface CharactersApi {
  upsert: (character: Record<string, unknown>) => unknown;
}

export interface ApplyCombatDamageApi {
  characters?: CharactersApi;
}

type DamageWeapon = Partial<RuntimeWeaponProfile>;

interface DamageTargetHealth {
  cur?: number;
  [extra: string]: unknown;
}

interface DamageTarget {
  equipped?: InstalledCyberwareItem[];
  criticalInjuries?: CriticalInjuryInstance[];
  health?: DamageTargetHealth;
  spDamage?: Record<string, number>;
  [extra: string]: unknown;
}

interface PrerolledResult {
  dice: DieEntry[];
  total: number;
  faces?: number[];
}

export interface ApplyCombatDamageInput {
  weapon?: DamageWeapon;
  bonusContributions?: DamageContributionRow[];
  combatOptions?: { damageProfile?: (weapon: unknown, actor: unknown) => { count: number; sides: number; mod: number; source: string; reason?: string; rof?: number | null } | null; actor?: unknown };
  actor?: unknown;
  target?: DamageTarget;
  location?: string;
  currentSp?: unknown;
  installedCyberware?: (target: DamageTarget) => InstalledCyberwareItem[];
  result?: PrerolledResult;
  rng?: () => number;
  autoResolveCriticalInjury?: boolean;
}

interface CriticalInjuryOutcome {
  entry?: CriticalInjuryInstance;
  catalog?: CriticalInjuryCatalogEntry;
  sum?: number;
  blocked?: boolean;
  sources?: string[];
}

export interface ApplyCombatDamageResult {
  total: number;
  faces: number[];
  dice: DieEntry[];
  hpLoss: number;
  spAblated: number;
  location: string;
  criticalInjuryTriggered: boolean;
  tarotTriggered: boolean;
  criticalInjury: CriticalInjuryOutcome | null;
  characterPatch?: Record<string, unknown>;
}

// Full auto-apply damage pipeline: roll (or accept an already-rolled result),
// engage armor, deduct HP/SP from the target, and — when asked to — roll and
// apply the Critical Injury table too. Persists via the injected api client.
//
// Live wiring note: the interactive UI keeps its own GM-confirm + animated
// 2d6 roll for critical injuries (a deliberate, valuable UX gate), so
// Component invokes this with autoResolveCriticalInjury:false and handles
// the critInjuryTriggered marker through the existing confirm/roll flow.
// Headless/test callers can set it to true for a fully automated pipeline.
export default class ApplyCombatDamage {
  api?: ApplyCombatDamageApi;
  rng: () => number;
  clock: () => Date;

  constructor({ api, rng = Math.random, clock = () => new Date() }: { api?: ApplyCombatDamageApi; rng?: () => number; clock?: () => Date } = {}) {
    this.api = api;
    this.rng = rng;
    this.clock = clock;
  }

  execute({
    weapon,
    bonusContributions = [],
    combatOptions = {},
    actor,
    target,
    location = 'body',
    currentSp = 0,
    installedCyberware,
    result,
    rng,
    autoResolveCriticalInjury = false,
  }: ApplyCombatDamageInput): ApplyCombatDamageResult {
    const roll = rng || this.rng;
    let total: number, faces: number[], dice: DieEntry[], contributions: DamageContributionRow[] | undefined;
    if (result && Array.isArray(result.dice)) {
      total = result.total;
      faces = result.faces || result.dice.map(d => d.value);
      dice = result.dice;
    } else {
      contributions = combatDamageContributions(weapon, bonusContributions, combatOptions);
      const rolled = rollFaces({ contributions: contributions as DiceContributionInput[] }, roll);
      total = rolled.total;
      faces = rolled.faces;
      dice = buildDice(contributions as DiceContributionInput[], faces);
    }

    const triggers = evaluateRollTriggers({ scope: 'damage', dice });
    const criticalInjuryTriggered = triggers.some(match => match.rule.id === 'criticalInjury');
    const tarotTriggered = triggers.some(match => match.rule.id === 'tarotDraw');

    const armor = applyArmorToDamage(total, currentSp, { ignoresHalfArmor: !!(weapon && weapon.ignoresHalfArmor) });
    let hpLoss = armor.hpLoss;
    let criticalInjury: CriticalInjuryOutcome | null = null;

    if (criticalInjuryTriggered && autoResolveCriticalInjury && target) {
      const equipped = installedCyberware ? installedCyberware(target) : (target.equipped || []);
      const existingIds = (target.criticalInjuries || []).map(entry => entry.injury);
      const picked = rollCriticalInjuryFromTable(location, existingIds, roll);
      if (picked && picked.catalog) {
        const immunity = criticalInjuryImmunity(equipped, picked.id);
        if (!immunity || !immunity.blocked) {
          const entry = criticalInjuryEntry(picked.catalog, { location, source: 'crit-damage', rng: roll, clock: this.clock });
          criticalInjury = { entry, catalog: picked.catalog, sum: picked.sum };
          hpLoss += 5; // bonus damage bypasses armor, per the table
        } else {
          criticalInjury = { blocked: true, sources: immunity.sources };
        }
      }
    }

    const breakdown: ApplyCombatDamageResult = {
      total, faces, dice, hpLoss, spAblated: armor.spAblated, location,
      criticalInjuryTriggered, tarotTriggered, criticalInjury,
    };

    if (target && this.api && this.api.characters) {
      const nextHealth = { ...(target.health || {}), cur: Math.max(0, ((target.health && target.health.cur) || 0) - hpLoss) };
      const nextSpDamage = { ...(target.spDamage || {}), [location]: Math.max(0, ((target.spDamage && target.spDamage[location]) || 0) + armor.spAblated) };
      const nextCriticalInjuries = criticalInjury && criticalInjury.entry
        ? [...(target.criticalInjuries || []), criticalInjury.entry]
        : (target.criticalInjuries || []);
      const characterPatch = { health: nextHealth, spDamage: nextSpDamage, criticalInjuries: nextCriticalInjuries };
      this.api.characters.upsert({ ...target, ...characterPatch });
      breakdown.characterPatch = characterPatch;
    }

    return breakdown;
  }
}
