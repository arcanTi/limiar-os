import type { BreachTierId } from './breachConfigEngine.ts';
import {
  damageProgramRez,
  netrunningProgramById,
  normalizeInstalledPrograms,
} from './programs.ts';
import type { InstalledNetrunningProgram } from './programs.ts';

export type BlackIceClass = 'anti-personnel' | 'anti-program';
export type BlackIceTierSelection = BlackIceId | 'auto' | 'none';

export interface BlackIceProgram {
  id: string;
  name: string;
  class: BlackIceClass;
  per: number;
  spd: number;
  atk: number;
  def: number;
  rez: number;
  cost: number;
  effect: string;
  damageDice?: { count: number; sides: 6; target: 'brain' | 'program' };
  destroysPrograms?: boolean;
}

export interface BlackIceState {
  id: BlackIceId;
  rez: number;
  maxRez: number;
  revealed: boolean;
  derezzed: boolean;
}

export interface BlackIceAttackResolution {
  hit: boolean;
  attackTotal: number;
  defenseTotal: number;
  margin: number;
  note: string;
}

export interface BlackIceDamageResolution {
  kind: 'brain' | 'program' | 'effect';
  rawDamage: number;
  finalDamage: number;
  mitigation: string[];
  updatedPrograms: InstalledNetrunningProgram[];
  targetProgramId?: string;
  targetProgramDestroyed?: boolean;
  note: string;
}

export interface NetrunnerIceAttackResolution extends BlackIceAttackResolution {
  damage: number;
  nextIce: BlackIceState;
}

export const BLACK_ICE_PROGRAMS = [
  { id: 'asp', name: 'Asp', class: 'anti-personnel', per: 4, spd: 6, atk: 2, def: 2, rez: 15, cost: 100, effect: "Destroys a single Program installed on the enemy Netrunner's Cyberdeck at random." },
  { id: 'giant', name: 'Giant', class: 'anti-personnel', per: 2, spd: 2, atk: 8, def: 4, rez: 25, cost: 1000, effect: "Does 3d6 brain damage and forcibly/unsafely Jacks Out the Netrunner.", damageDice: { count: 3, sides: 6, target: 'brain' } },
  { id: 'hellhound', name: 'Hellhound', class: 'anti-personnel', per: 6, spd: 6, atk: 6, def: 2, rez: 20, cost: 500, effect: "Does 2d6 brain damage; unless insulated, sets Cyberdeck/clothing on fire.", damageDice: { count: 2, sides: 6, target: 'brain' } },
  { id: 'kraken', name: 'Kraken', class: 'anti-personnel', per: 6, spd: 2, atk: 8, def: 4, rez: 30, cost: 1000, effect: "Does 3d6 brain damage and blocks safe progress/Jack Out until next Turn.", damageDice: { count: 3, sides: 6, target: 'brain' } },
  { id: 'liche', name: 'Liche', class: 'anti-personnel', per: 8, spd: 2, atk: 6, def: 2, rez: 25, cost: 500, effect: "Lowers enemy Netrunner INT, REF, and DEX by 1d6 for the next hour, minimum 1." },
  { id: 'raven', name: 'Raven', class: 'anti-personnel', per: 6, spd: 4, atk: 4, def: 2, rez: 15, cost: 50, effect: "Derezzes a single rezzed Defender Program at random, then does 1d6 brain damage.", damageDice: { count: 1, sides: 6, target: 'brain' } },
  { id: 'scorpion', name: 'Scorpion', class: 'anti-personnel', per: 2, spd: 6, atk: 2, def: 2, rez: 15, cost: 100, effect: "Lowers enemy Netrunner MOVE by 1d6 for the next hour, minimum 1." },
  { id: 'skunk', name: 'Skunk', class: 'anti-personnel', per: 2, spd: 4, atk: 4, def: 2, rez: 10, cost: 500, effect: "Until Derezzed, hit Netrunner makes all Slide Checks at -2." },
  { id: 'wisp', name: 'Wisp', class: 'anti-personnel', per: 4, spd: 4, atk: 4, def: 2, rez: 15, cost: 50, effect: "Does 1d6 brain damage and lowers next-Turn NET Actions by 1, minimum 2.", damageDice: { count: 1, sides: 6, target: 'brain' } },
  { id: 'dragon', name: 'Dragon', class: 'anti-program', per: 6, spd: 4, atk: 6, def: 6, rez: 30, cost: 1000, effect: "Deals 6d6 damage to a Program; if this would Derezz it, it is Destroyed instead.", damageDice: { count: 6, sides: 6, target: 'program' }, destroysPrograms: true },
  { id: 'killer', name: 'Killer', class: 'anti-program', per: 4, spd: 8, atk: 6, def: 2, rez: 20, cost: 500, effect: "Deals 4d6 damage to a Program; if this would Derezz it, it is Destroyed instead.", damageDice: { count: 4, sides: 6, target: 'program' }, destroysPrograms: true },
  { id: 'sabertooth', name: 'Sabertooth', class: 'anti-program', per: 8, spd: 6, atk: 6, def: 2, rez: 25, cost: 1000, effect: "Deals 6d6 damage to a Program; if this would Derezz it, it is Destroyed instead.", damageDice: { count: 6, sides: 6, target: 'program' }, destroysPrograms: true },
] as const satisfies readonly BlackIceProgram[];

export type BlackIceId = typeof BLACK_ICE_PROGRAMS[number]['id'];

export const BLACK_ICE_BY_TIER: Record<BreachTierId, (BlackIceId | 'none')[]> = {
  basic: ['none', 'wisp'],
  standard: ['asp', 'skunk'],
  uncommon: ['hellhound', 'scorpion', 'raven'],
  advanced: ['kraken', 'liche', 'dragon', 'killer', 'sabertooth'],
};

const BLACK_ICE_BY_ID = new Map(BLACK_ICE_PROGRAMS.map(ice => [ice.id, ice]));

export function blackIceById(id: unknown): BlackIceProgram | null {
  return BLACK_ICE_BY_ID.get(String(id || '').toLowerCase() as BlackIceId) || null;
}

export function blackIceOptionsForTier(tier: unknown): (BlackIceId | 'none')[] {
  const key = String(tier || '').toLowerCase() as BreachTierId;
  return BLACK_ICE_BY_TIER[key] ? BLACK_ICE_BY_TIER[key].slice() : BLACK_ICE_BY_TIER.standard.slice();
}

export function selectBlackIceForTier(tier: unknown, selection: unknown = 'auto', random: () => number = Math.random): BlackIceId | null {
  const chosen = String(selection || 'auto').toLowerCase();
  if (chosen === 'none') return null;
  if (blackIceById(chosen)) return chosen as BlackIceId;
  const pool = blackIceOptionsForTier(tier).filter((id): id is BlackIceId => id !== 'none');
  if (!pool.length) return null;
  const index = Math.max(0, Math.min(pool.length - 1, Math.floor(random() * pool.length)));
  return pool[index];
}

export function normalizeBlackIceState(state: Partial<BlackIceState> | null | undefined, fallbackId?: unknown): BlackIceState | null {
  const ice = blackIceById((state && state.id) || fallbackId);
  if (!ice) return null;
  const maxRez = ice.rez;
  const rez = clampNumber(state && state.rez, maxRez, 0, maxRez);
  return {
    id: ice.id as BlackIceId,
    rez,
    maxRez,
    revealed: !!(state && state.revealed),
    derezzed: rez <= 0 || !!(state && state.derezzed),
  };
}

export function resolveOpposedNetAttack(attackTotal: unknown, defenseTotal: unknown): BlackIceAttackResolution {
  const attack = Number(attackTotal) || 0;
  const defense = Number(defenseTotal) || 0;
  const margin = attack - defense;
  const hit = margin > 0;
  return {
    hit,
    attackTotal: attack,
    defenseTotal: defense,
    margin,
    note: hit ? 'hit: attacker total beat defender total' : 'miss: ties go to defender',
  };
}

export function resolveBlackIceDamage(iceId: unknown, damage: unknown, programs: unknown, targetProgramId?: unknown): BlackIceDamageResolution {
  const ice = blackIceById(iceId);
  const rawDamage = Math.max(0, Number(damage) || 0);
  const currentPrograms = normalizeInstalledPrograms(programs);
  if (!ice) {
    return { kind: 'effect', rawDamage, finalDamage: rawDamage, mitigation: [], updatedPrograms: currentPrograms, note: 'Black ICE desconhecido' };
  }

  if (ice.class === 'anti-program') {
    const target = chooseProgramTarget(currentPrograms, targetProgramId);
    if (!target) {
      return { kind: 'program', rawDamage, finalDamage: 0, mitigation: [], updatedPrograms: currentPrograms, note: ice.name + ': sem programa rezzed valido para alvo' };
    }
    const nextTarget = damageProgramRez(target, rawDamage) || target;
    const destroyed = !!ice.destroysPrograms && rawDamage >= target.rez;
    return {
      kind: 'program',
      rawDamage,
      finalDamage: rawDamage,
      mitigation: destroyed ? ['destroyed instead of derezzed'] : [],
      updatedPrograms: currentPrograms.map(program => program.id === target.id ? nextTarget : program),
      targetProgramId: target.id,
      targetProgramDestroyed: destroyed,
      note: ice.name + ' dealt ' + rawDamage + ' REZ to ' + target.id + (destroyed ? ' and destroyed it' : ''),
    };
  }

  const mitigation: string[] = [];
  let finalDamage = rawDamage;
  let updatedPrograms = currentPrograms;
  const shield = currentPrograms.find(program => program.id === 'shield' && program.state !== 'derezzed');
  if (shield && rawDamage > 0) {
    mitigation.push('Shield canceled first brain-damage Program effect and Derezzed');
    updatedPrograms = updatedPrograms.map(program => program.id === 'shield' ? { ...program, rez: 0, state: 'derezzed' } : program);
    finalDamage = 0;
  } else {
    const armor = currentPrograms.find(program => program.id === 'armor' && program.state !== 'derezzed');
    if (armor && rawDamage > 0) {
      finalDamage = Math.max(0, finalDamage - 4);
      mitigation.push('Armor -4 brain damage');
    }
  }

  if (ice.id === 'raven') {
    const defender = updatedPrograms.find(program => {
      const base = netrunningProgramById(program.id);
      return program.state !== 'derezzed' && base && base.class === 'defender';
    });
    if (defender) {
      updatedPrograms = updatedPrograms.map(program => program.id === defender.id ? { ...program, rez: 0, state: 'derezzed' } : program);
      mitigation.push('Raven Derezzed defender ' + defender.id);
    }
  }

  return {
    kind: rawDamage > 0 ? 'brain' : 'effect',
    rawDamage,
    finalDamage,
    mitigation,
    updatedPrograms,
    note: ice.name + ': ' + (rawDamage > 0 ? finalDamage + ' brain damage after mitigation' : ice.effect),
  };
}

export function resolveNetrunnerIceAttack(opts: {
  iceState: Partial<BlackIceState>;
  attackTotal: unknown;
  defenseTotal: unknown;
  damage: unknown;
}): NetrunnerIceAttackResolution {
  const state = normalizeBlackIceState(opts.iceState);
  if (!state) throw new Error('Black ICE state required');
  const opposed = resolveOpposedNetAttack(opts.attackTotal, opts.defenseTotal);
  const damage = opposed.hit ? Math.max(0, Number(opts.damage) || 0) : 0;
  const nextRez = Math.max(0, state.rez - damage);
  return {
    ...opposed,
    damage,
    nextIce: { ...state, rez: nextRez, derezzed: nextRez <= 0 },
  };
}

function chooseProgramTarget(programs: InstalledNetrunningProgram[], targetProgramId?: unknown): InstalledNetrunningProgram | null {
  const targetId = String(targetProgramId || '').toLowerCase();
  return programs.find(program => program.id === targetId && program.state !== 'derezzed')
    || programs.find(program => program.state !== 'derezzed' && program.maxRez > 0)
    || null;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
