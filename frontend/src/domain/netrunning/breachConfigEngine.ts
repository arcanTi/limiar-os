import { programRunModifiers } from './programs.ts';
import { selectBlackIceForTier } from './blackIce.ts';
import type { BlackIceId } from './blackIce.ts';
import { STEALTH_PREP_ABILITY_ID, STEALTH_TRACE_MULTIPLIER, normalizeWatchers } from './stealth.ts';
import type { NetWatcher } from './stealth.ts';

export type BreachTierId = 'basic' | 'standard' | 'uncommon' | 'advanced';
export type BreachTokenSet = 'standard' | 'military' | 'ghost';
export type BreachContinuity = 'blocked' | 'linked';
// `stealth` is the Going Quiet "Quietly Jack In" NET Action: it competes for
// the same prep budget as the four Core Interface Abilities.
export type BreachPrepAbilityId = 'backdoor' | 'cloak' | 'pathfinder' | 'scanner' | 'stealth';

const PREP_ABILITY_IDS: readonly string[] = ['backdoor', 'cloak', 'pathfinder', 'scanner', STEALTH_PREP_ABILITY_ID];

export interface BreachTier {
  id: BreachTierId;
  label: string;
  hint: string;
  dv: number;
  matrixSize: number;
  scriptCount: number;
  scriptLengths: number[];
  timeLimit: number;
  traceRate: number;
  tokenSet: BreachTokenSet;
  sequenceContinuity: BreachContinuity;
  extraNodes: number;
}

export interface BreachPrepResult {
  abilityId: BreachPrepAbilityId | string;
  success: boolean;
  margin: number;
  source?: string;
}

export interface BreachConfig {
  architectureTier: BreachTierId;
  architectureTierLabel: string;
  architectureDv: number;
  scriptCount: number;
  scriptNames: string[];
  scriptLengths: number[];
  timeLimit: number;
  bufferSize: number;
  mapLayout: 'auto';
  extraNodes: number;
  matrixSize: number;
  traceRate: number;
  tokenSet: BreachTokenSet;
  sequenceContinuity: BreachContinuity;
  secondaryObjectives: boolean;
  scannerRevealed: boolean;
  revealedScripts: { name: string; length: number }[];
  programModifierLabels: string[];
  traceMitigation: string[];
  blackIceId: BlackIceId | null;
  blackIceRevealed: boolean;
  prepResults: BreachPrepResult[];
  watchers: NetWatcher[];
  stealthActive: boolean;
}

const SCRIPT_NAMES = ['ACCESS', 'DATA', 'CONTROL', 'ROOT', 'WATCHDOG'];

export const BREACH_TIERS: Record<BreachTierId, BreachTier> = {
  basic: {
    id: 'basic',
    label: 'Basic',
    hint: 'casa, terminal',
    dv: 6,
    matrixSize: 5,
    scriptCount: 2,
    scriptLengths: [2, 2, 3],
    timeLimit: 120,
    traceRate: 0.8,
    tokenSet: 'standard',
    sequenceContinuity: 'blocked',
    extraNodes: 2,
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    hint: 'empresa pequena, cofre',
    dv: 8,
    matrixSize: 6,
    scriptCount: 3,
    scriptLengths: [2, 3, 3],
    timeLimit: 100,
    traceRate: 1.0,
    tokenSet: 'standard',
    sequenceContinuity: 'blocked',
    extraNodes: 2,
  },
  uncommon: {
    id: 'uncommon',
    label: 'Uncommon',
    hint: 'corp regional, delegacia',
    dv: 10,
    matrixSize: 6,
    scriptCount: 4,
    scriptLengths: [3, 3, 4],
    timeLimit: 90,
    traceRate: 1.2,
    tokenSet: 'military',
    sequenceContinuity: 'linked',
    extraNodes: 2,
  },
  advanced: {
    id: 'advanced',
    label: 'Advanced',
    hint: 'megacorp, militar',
    dv: 12,
    matrixSize: 7,
    scriptCount: 5,
    scriptLengths: [3, 4, 4],
    timeLimit: 80,
    traceRate: 1.5,
    tokenSet: 'ghost',
    sequenceContinuity: 'linked',
    extraNodes: 2,
  },
};

export function normalizeBreachTier(tier: unknown): BreachTierId {
  const key = String(tier || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(BREACH_TIERS, key) ? (key as BreachTierId) : 'standard';
}

export function breachTierOptions(): BreachTier[] {
  return ['basic', 'standard', 'uncommon', 'advanced'].map(id => BREACH_TIERS[id as BreachTierId]);
}

export function buildBreachConfig(tier: unknown, interfaceRank: unknown, prepResults: BreachPrepResult[] = [], installedPrograms: unknown = [], blackIceSelection: unknown = 'auto', watchers: unknown = []): BreachConfig {
  const tierId = normalizeBreachTier(tier);
  const base = BREACH_TIERS[tierId];
  const rank = Math.max(0, Math.min(10, Number(interfaceRank) || 0));
  const programMods = programRunModifiers(installedPrograms);
  const cleanPrep = normalizePrepResults([...programMods.prepResults, ...prepResults]);
  const baseTraceFloor = base.traceRate * 0.6;
  let scriptCount = base.scriptCount;
  let timeLimit = base.timeLimit + (rank * 4) + programMods.timeBonus;
  let traceRate = Math.max(baseTraceFloor, base.traceRate * (1 - (0.03 * rank)));
  let extraNodes = base.extraNodes;
  let secondaryObjectives = false;
  let scannerRevealed = false;
  let stealthActive = false;
  const blackIceId = selectBlackIceForTier(tierId, blackIceSelection);

  cleanPrep.forEach(result => {
    if (result.abilityId === 'backdoor') {
      if (result.success) scriptCount = Math.max(1, scriptCount - 1);
    } else if (result.abilityId === 'cloak') {
      traceRate *= result.success ? 0.75 : 1.1;
    } else if (result.abilityId === 'pathfinder') {
      if (result.success) secondaryObjectives = true;
    } else if (result.abilityId === 'scanner') {
      if (result.success) {
        scannerRevealed = true;
        extraNodes = Math.max(0, extraNodes - 1);
      }
    } else if (result.abilityId === STEALTH_PREP_ABILITY_ID) {
      if (result.success) stealthActive = true;
    }
  });

  traceRate *= programMods.traceMultiplier;
  traceRate = Math.max(baseTraceFloor, traceRate);
  // Going Quiet: a silent connection keeps the system asleep, so the abstract
  // trace climbs at half speed until something breaks cover. Applied after
  // the tier floor on purpose: silence is allowed to go below "noisy minimum".
  if (stealthActive) traceRate *= STEALTH_TRACE_MULTIPLIER;
  const scriptLengths = Array.from({ length: scriptCount }, (_, index) => base.scriptLengths[index % base.scriptLengths.length]);
  const scriptNames = scannerRevealed ? scriptLengths.map((_, index) => SCRIPT_NAMES[index] || ('SCRIPT ' + (index + 1))) : [];
  const revealedScripts = scannerRevealed ? scriptLengths.map((length, index) => ({ name: scriptNames[index], length })) : [];

  return {
    architectureTier: tierId,
    architectureTierLabel: base.label,
    architectureDv: base.dv,
    scriptCount,
    scriptNames,
    scriptLengths,
    timeLimit,
    bufferSize: Math.min(10, 5 + Math.ceil(rank / 2)),
    mapLayout: 'auto',
    extraNodes,
    matrixSize: base.matrixSize,
    traceRate: roundTrace(traceRate),
    tokenSet: base.tokenSet,
    sequenceContinuity: base.sequenceContinuity,
    secondaryObjectives,
    scannerRevealed,
    revealedScripts,
    programModifierLabels: programMods.labels,
    traceMitigation: programMods.mitigation,
    blackIceId,
    blackIceRevealed: scannerRevealed,
    prepResults: cleanPrep,
    watchers: normalizeWatchers(watchers),
    stealthActive,
  };
}

function normalizePrepResults(results: BreachPrepResult[]): BreachPrepResult[] {
  const seen = new Set<string>();
  return (Array.isArray(results) ? results : []).filter(result => {
    const id = String(result && result.abilityId || '').toLowerCase();
    if (!PREP_ABILITY_IDS.includes(id) || seen.has(id)) return false;
    seen.add(id);
    result.abilityId = id;
    result.success = !!result.success;
    result.margin = Number(result.margin) || 0;
    result.source = result.source ? String(result.source) : undefined;
    return true;
  });
}

function roundTrace(value: number): number {
  return Math.round(value * 100) / 100;
}
