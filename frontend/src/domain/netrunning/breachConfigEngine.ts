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
// How the operative is jacked in. RAW rewards a cable and punishes running the
// architecture from the other side of the NET, so the link the GM picks is a
// difficulty axis of its own — trace speed, run time, extra nodes and a flat
// modifier on the NET checks themselves.
export type BreachConnectionId = 'hardline' | 'wireless' | 'remote';

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

export interface BreachConnection {
  id: BreachConnectionId;
  label: string;
  hint: string;
  traceMultiplier: number;
  timeBonus: number;
  extraNodes: number;
  checkMod: number;
}

export interface BreachPrepResult {
  abilityId: BreachPrepAbilityId | string;
  success: boolean;
  margin: number;
  source?: string;
}

// The three difficulty axes a NET test carries into the run: the DV the GM
// asked for, the link the operative is running through, and (derived) the
// speed contest between operative and architecture.
export interface BreachRunInput {
  dv?: unknown;
  connection?: unknown;
}

export interface BreachConfig {
  architectureTier: BreachTierId;
  architectureTierLabel: string;
  // The DV actually in play: the GM's own DV when they named one, otherwise
  // the tier's. Every in-run Interface check is rolled against this.
  architectureDv: number;
  tierDv: number;
  connection: BreachConnectionId;
  connectionLabel: string;
  connectionCheckMod: number;
  runnerSpeed: number;
  systemSpeed: number;
  speedDelta: number;
  difficultyDigest: string[];
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

export const BREACH_CONNECTIONS: Record<BreachConnectionId, BreachConnection> = {
  hardline: { id: 'hardline', label: 'Hardline', hint: 'cabo direto no access point', traceMultiplier: 0.85, timeBonus: 10, extraNodes: -1, checkMod: 1 },
  wireless: { id: 'wireless', label: 'Wireless', hint: 'link local, dentro do alcance', traceMultiplier: 1, timeBonus: 0, extraNodes: 0, checkMod: 0 },
  remote: { id: 'remote', label: 'Remoto', hint: 'atravessando a NET de longe', traceMultiplier: 1.3, timeBonus: -15, extraNodes: 1, checkMod: -2 },
};

// How fast the architecture itself reacts, by tier — the same 2/4/6/8 ladder
// the Black ICE SPD stats sit on. Deliberately read from the tier and not from
// the armed ICE: the ICE is rolled from a pool, and a run's clock must not
// change because the dice picked a different guard dog.
const SYSTEM_SPEED_BY_TIER: Record<BreachTierId, number> = {
  basic: 2,
  standard: 4,
  uncommon: 6,
  advanced: 8,
};

const MIN_TIME_LIMIT = 30;
const MAX_SPEED_DELTA = 6;

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

export function normalizeBreachConnection(value: unknown): BreachConnectionId {
  const key = String(value || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(BREACH_CONNECTIONS, key) ? (key as BreachConnectionId) : 'wireless';
}

export function breachConnectionOptions(): BreachConnection[] {
  return ['hardline', 'wireless', 'remote'].map(id => BREACH_CONNECTIONS[id as BreachConnectionId]);
}

// The run's difficulty is the sum of three axes:
//   * the test's DV      -> picks the tier, and any DV past the tier's own DV
//                           (or under it) bends the clock, the trace and the
//                           node count from there;
//   * speed              -> the operative's Speed (Interface + Booster programs)
//                           against the architecture's, so a fast runner buys
//                           time and a slow one bleeds it;
//   * the connection     -> hardline / wireless / remote, each with its own
//                           trace multiplier, clock bonus and check modifier.
// Everything else (prep results, installed programs, stealth) still layers on
// top of those, exactly as before.
export function buildBreachConfig(tier: unknown, interfaceRank: unknown, prepResults: BreachPrepResult[] = [], installedPrograms: unknown = [], blackIceSelection: unknown = 'auto', watchers: unknown = [], run: BreachRunInput = {}): BreachConfig {
  const tierId = normalizeBreachTier(tier);
  const base = BREACH_TIERS[tierId];
  const rank = Math.max(0, Math.min(10, Number(interfaceRank) || 0));
  const programMods = programRunModifiers(installedPrograms);
  const cleanPrep = normalizePrepResults([...programMods.prepResults, ...prepResults]);
  const connection = BREACH_CONNECTIONS[normalizeBreachConnection(run.connection)];
  const requestedDv = Number(run.dv);
  const architectureDv = run.dv === null || run.dv === undefined || run.dv === '' || !Number.isFinite(requestedDv)
    ? base.dv
    : Math.max(0, Math.round(requestedDv));
  // Positive when the GM asked for something harder than the tier's own DV,
  // which only happens past the ladder's top (Advanced DV 12).
  const dvDelta = architectureDv - base.dv;
  const runnerSpeed = rank + programMods.speedBonus;
  const systemSpeed = SYSTEM_SPEED_BY_TIER[tierId];
  const speedDelta = Math.max(-MAX_SPEED_DELTA, Math.min(MAX_SPEED_DELTA, runnerSpeed - systemSpeed));
  const baseTraceFloor = base.traceRate * 0.6;
  let scriptCount = base.scriptCount;
  let timeLimit = base.timeLimit + (speedDelta * 4) + connection.timeBonus + programMods.timeBonus - (dvDelta * 4);
  let traceRate = Math.max(baseTraceFloor, base.traceRate * (1 - (0.03 * speedDelta)));
  let extraNodes = base.extraNodes + connection.extraNodes + Math.max(0, Math.ceil(dvDelta / 2));
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
  traceRate *= connection.traceMultiplier;
  // A DV past the tier's own is a system that fights back harder, not just a
  // higher number to roll against.
  traceRate *= 1 + (0.05 * dvDelta);
  traceRate = Math.max(baseTraceFloor, traceRate);
  // Going Quiet: a silent connection keeps the system asleep, so the abstract
  // trace climbs at half speed until something breaks cover. Applied after
  // the tier floor on purpose: silence is allowed to go below "noisy minimum".
  if (stealthActive) traceRate *= STEALTH_TRACE_MULTIPLIER;
  const scriptLengths = Array.from({ length: scriptCount }, (_, index) => base.scriptLengths[index % base.scriptLengths.length]);
  const scriptNames = scannerRevealed ? scriptLengths.map((_, index) => SCRIPT_NAMES[index] || ('SCRIPT ' + (index + 1))) : [];
  const revealedScripts = scannerRevealed ? scriptLengths.map((length, index) => ({ name: scriptNames[index], length })) : [];

  const difficultyDigest = [
    'DV ' + architectureDv + ' // ' + base.label + (dvDelta ? ' (' + (dvDelta > 0 ? '+' : '') + dvDelta + ' vs tier)' : ''),
    'SPD ' + runnerSpeed + ' vs ' + systemSpeed + ' (' + (speedDelta >= 0 ? '+' : '') + speedDelta + ')',
    connection.label.toUpperCase() + ' // trace x' + connection.traceMultiplier.toFixed(2) + (connection.checkMod ? ' // checks ' + (connection.checkMod > 0 ? '+' : '') + connection.checkMod : ''),
  ];

  return {
    architectureTier: tierId,
    architectureTierLabel: base.label,
    architectureDv,
    tierDv: base.dv,
    connection: connection.id,
    connectionLabel: connection.label,
    connectionCheckMod: connection.checkMod,
    runnerSpeed,
    systemSpeed,
    speedDelta,
    difficultyDigest,
    scriptCount,
    scriptNames,
    scriptLengths,
    timeLimit: Math.max(MIN_TIME_LIMIT, Math.round(timeLimit)),
    // Buffer size is deck capacity, not pace: it stays on the Interface rank.
    bufferSize: Math.min(10, 5 + Math.ceil(rank / 2)),
    mapLayout: 'auto',
    extraNodes: Math.max(0, extraNodes),
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

// A NET test rolled at the table carries the GM's DV, not a tier name. The
// tiers are already a DV ladder (6/8/10/12), so the DV picks the cheapest tier
// that is at least as hard as what the GM asked for; anything past Advanced's
// DV 12 stays Advanced (the ladder's ceiling).
export function breachTierForDv(dv: unknown): BreachTierId {
  // Number(null) and Number('') are 0, which would silently read as "Basic";
  // a missing DV must fall back to Standard instead.
  if (dv === null || dv === undefined || dv === '') return 'standard';
  const value = Number(dv);
  if (!Number.isFinite(value)) return 'standard';
  const ladder: BreachTierId[] = ['basic', 'standard', 'uncommon', 'advanced'];
  return ladder.find(id => value <= BREACH_TIERS[id].dv) || 'advanced';
}
