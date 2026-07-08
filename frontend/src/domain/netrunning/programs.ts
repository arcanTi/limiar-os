export type NetrunningProgramClass = 'booster' | 'attacker' | 'defender';
export type InstalledProgramState = 'rezzed' | 'derezzed';

export interface NetrunningProgram {
  id: string;
  name: string;
  class: NetrunningProgramClass;
  subclass?: string;
  atk: number;
  def: number;
  rez: number;
  cost: number;
  effect: string;
  modifiers?: Record<string, unknown>;
}

export interface InstalledNetrunningProgram {
  id: string;
  rez: number;
  maxRez: number;
  state: InstalledProgramState;
}

export interface DeckProgramSummary {
  slotsUsed: number;
  slotLimit: number;
  overLimit: boolean;
  warning: string;
}

export const DEFAULT_CYBERDECK_PROGRAM_SLOTS = 7;

// Cyberpunk RED Core programs. The Phase 2b plan said "Nuke"; the RAW Core
// table has Nervescrub in that attacker slot, so this catalog keeps the RAW
// name and does not invent a Nuke program.
export const NETRUNNING_PROGRAMS: NetrunningProgram[] = [
  { id: 'eraser', name: 'Eraser', class: 'booster', atk: 0, def: 0, rez: 7, cost: 20, effect: '+2 to Cloak Checks while Rezzed.', modifiers: { cloakCheck: 2 } },
  { id: 'see-ya', name: 'See Ya', class: 'booster', atk: 0, def: 0, rez: 7, cost: 20, effect: '+2 to Pathfinder Checks while Rezzed.', modifiers: { pathfinderCheck: 2 } },
  { id: 'speedy-gonzalvez', name: 'Speedy Gonzalvez', class: 'booster', atk: 0, def: 0, rez: 7, cost: 100, effect: '+2 Speed while Rezzed.', modifiers: { speed: 2 } },
  { id: 'worm', name: 'Worm', class: 'booster', atk: 0, def: 0, rez: 7, cost: 50, effect: '+2 to Backdoor Checks while Rezzed.', modifiers: { backdoorCheck: 2 } },
  { id: 'banhammer', name: 'Banhammer', class: 'attacker', subclass: 'anti-program', atk: 1, def: 0, rez: 0, cost: 50, effect: 'Does 3d6 REZ to a Non-Black ICE Program, or 2d6 REZ to a Black ICE Program.' },
  { id: 'sword', name: 'Sword', class: 'attacker', subclass: 'anti-program', atk: 1, def: 0, rez: 0, cost: 50, effect: 'Does 3d6 REZ to a Black ICE Program, or 2d6 REZ to a Non-Black ICE Program.' },
  { id: 'deckkrash', name: 'DeckKRASH', class: 'attacker', subclass: 'anti-personnel', atk: 0, def: 0, rez: 0, cost: 100, effect: 'Forcibly and unsafely Jacks Out an enemy Netrunner from the Architecture.' },
  { id: 'hellbolt', name: 'Hellbolt', class: 'attacker', subclass: 'anti-personnel', atk: 2, def: 0, rez: 0, cost: 100, effect: 'Does 2d6 brain damage and ignites the enemy Netrunner unless insulated.' },
  { id: 'nervescrub', name: 'Nervescrub', class: 'attacker', subclass: 'anti-personnel', atk: 0, def: 0, rez: 0, cost: 100, effect: 'Lowers enemy Netrunner INT, REF, and DEX by 1d6 for the next hour, minimum 1.' },
  { id: 'poison-flatline', name: 'Poison Flatline', class: 'attacker', subclass: 'anti-personnel', atk: 0, def: 0, rez: 0, cost: 100, effect: 'Destroys a random Non-Black ICE Program installed on the target Cyberdeck.' },
  { id: 'superglue', name: 'Superglue', class: 'attacker', subclass: 'anti-personnel', atk: 2, def: 0, rez: 0, cost: 100, effect: 'Enemy Netrunner cannot progress deeper or Jack Out safely for 1d6 rounds.' },
  { id: 'vrizzbolt', name: 'Vrizzbolt', class: 'attacker', subclass: 'anti-personnel', atk: 1, def: 0, rez: 0, cost: 50, effect: 'Does 1d6 brain damage and lowers next-turn NET Actions by 1, minimum 2.' },
  { id: 'armor', name: 'Armor', class: 'defender', atk: 0, def: 0, rez: 7, cost: 50, effect: 'Lowers all brain damage you would receive by 4 while Rezzed; once per Netrun.', modifiers: { brainDamageReduction: 4 } },
  { id: 'flak', name: 'Flak', class: 'defender', atk: 0, def: 0, rez: 7, cost: 50, effect: 'Reduces ATK of all Non-Black ICE Attacker Programs run against you to 0; once per Netrun.', modifiers: { nonBlackIceAttackerAtkToZero: true } },
  { id: 'shield', name: 'Shield', class: 'defender', atk: 0, def: 0, rez: 7, cost: 20, effect: 'Stops the first successful Non-Black ICE Program Effect from dealing brain damage, then Derezzes.', modifiers: { stopFirstBrainDamageProgram: true } },
];

const PROGRAM_BY_ID = new Map(NETRUNNING_PROGRAMS.map(program => [program.id, program]));

export function netrunningProgramById(id: unknown): NetrunningProgram | null {
  return PROGRAM_BY_ID.get(String(id || '').toLowerCase()) || null;
}

export function normalizeInstalledPrograms(programs: unknown): InstalledNetrunningProgram[] {
  const rows = Array.isArray(programs) ? programs : [];
  const seen = new Set<string>();
  return rows.map(row => {
    const src = typeof row === 'string' ? { id: row } : (row || {}) as Partial<InstalledNetrunningProgram>;
    const program = netrunningProgramById(src.id);
    if (!program || seen.has(program.id)) return null;
    seen.add(program.id);
    const maxRez = Math.max(0, program.rez);
    const rez = maxRez ? clampNumber(src.rez, maxRez, 0, maxRez) : 0;
    return {
      id: program.id,
      rez,
      maxRez,
      state: src.state === 'derezzed' || (maxRez > 0 && rez <= 0) ? 'derezzed' : 'rezzed',
    };
  }).filter(Boolean) as InstalledNetrunningProgram[];
}

export function deckProgramSummary(programs: unknown, slotLimit = DEFAULT_CYBERDECK_PROGRAM_SLOTS): DeckProgramSummary {
  const slotsUsed = normalizeInstalledPrograms(programs).length;
  const limit = clampNumber(slotLimit, DEFAULT_CYBERDECK_PROGRAM_SLOTS, 0, 99);
  return {
    slotsUsed,
    slotLimit: limit,
    overLimit: slotsUsed > limit,
    warning: slotsUsed > limit ? 'Cyberdeck acima do limite RAW de ' + limit + ' slots; GM arbitra.' : '',
  };
}

export function damageProgramRez(program: Partial<InstalledNetrunningProgram> | null | undefined, damage: unknown): InstalledNetrunningProgram | null {
  if (!program || !program.id) return null;
  const base = netrunningProgramById(program.id);
  if (!base) return null;
  const maxRez = Math.max(0, Number(program.maxRez ?? base.rez) || 0);
  const current = clampNumber(program.rez, maxRez, 0, maxRez);
  const nextRez = Math.max(0, current - Math.max(0, Number(damage) || 0));
  return { id: base.id, maxRez, rez: nextRez, state: maxRez > 0 && nextRez <= 0 ? 'derezzed' : (program.state === 'derezzed' ? 'derezzed' : 'rezzed') };
}

export function repairProgramRez(program: Partial<InstalledNetrunningProgram> | null | undefined, amount: unknown): InstalledNetrunningProgram | null {
  if (!program || !program.id) return null;
  const base = netrunningProgramById(program.id);
  if (!base) return null;
  const maxRez = Math.max(0, Number(program.maxRez ?? base.rez) || 0);
  const current = clampNumber(program.rez, maxRez, 0, maxRez);
  const nextRez = Math.min(maxRez, current + Math.max(0, Number(amount) || 0));
  return { id: base.id, maxRez, rez: nextRez, state: maxRez > 0 && nextRez <= 0 ? 'derezzed' : 'rezzed' };
}

export function rezzedProgramIds(programs: unknown): string[] {
  return normalizeInstalledPrograms(programs).filter(program => program.state !== 'derezzed').map(program => program.id);
}

export function programRunModifiers(programs: unknown): {
  prepResults: { abilityId: 'backdoor'; success: true; margin: number; source: string }[];
  timeBonus: number;
  traceMultiplier: number;
  mitigation: string[];
  labels: string[];
} {
  const ids = new Set(rezzedProgramIds(programs));
  const labels: string[] = [];
  const mitigation: string[] = [];
  const prepResults: { abilityId: 'backdoor'; success: true; margin: number; source: string }[] = [];
  let timeBonus = 0;
  let traceMultiplier = 1;

  // RAW -> Nexus adaptation for the abstract Architecture minigame:
  // +2 check boosters become softer run knobs; attackers stay inert until
  // Black ICE/program combat in Phase 2c.
  if (ids.has('worm')) {
    prepResults.push({ abilityId: 'backdoor', success: true, margin: 2, source: 'Worm' });
    labels.push('Worm: Backdoor automatico');
  }
  if (ids.has('speedy-gonzalvez')) {
    timeBonus += 12;
    labels.push('Speedy Gonzalvez: +12s');
  }
  if (ids.has('eraser')) {
    traceMultiplier *= 0.9;
    labels.push('Eraser: trace x0.90');
  }
  if (ids.has('see-ya')) {
    traceMultiplier *= 0.95;
    labels.push('See Ya: trace x0.95');
  }
  if (ids.has('armor')) mitigation.push('Armor: -4 brain damage');
  if (ids.has('flak')) mitigation.push('Flak: Non-Black ICE ATK -> 0');
  if (ids.has('shield')) mitigation.push('Shield: cancela primeiro dano cerebral');
  return { prepResults, timeBonus, traceMultiplier, mitigation, labels };
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
