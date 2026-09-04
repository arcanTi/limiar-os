// Stealth Netrunning (CPR DLC "Going Quiet"). Pure rules: who rolls what,
// what beats what, and which actions blow the Netrunner's cover. The Nexus
// view owns the dice for the Netrunner (visible roll) and asks this module to
// roll the NPC side (Watchers, Black ICE) with an injectable RNG.
//
// RAW summary:
//   - Quietly Jack In: 1 extra NET Action; Interface + 1d10 contested against
//     Interface + 1d10 of EVERY active Watcher. Netrunner must beat them all
//     (ties favor the defending Watcher).
//   - Meeting Black ICE while hidden: Interface + Cloak bonus + 1d10 vs the
//     ICE's PER + 1d10. Pass -> ICE never enters initiative, Netrunner slips
//     by. Fail -> stealth breaks and the ICE attacks immediately.
//   - Meeting a Watcher while hidden: Interface + Cloak + 1d10 vs the
//     Watcher's Interface + Pathfinder + 1d10.
//   - Taking a Control Node or attacking anything breaks stealth outright.
//   - Watcher Search: once per Turn a Watcher may spend a NET Action to scan
//     (Interface + Pathfinder + 1d10) against the Netrunner's Interface +
//     Cloak + 1d10. Netrunner defends, so ties keep the Netrunner hidden.
import { normalizeInstalledPrograms, netrunningProgramById } from './programs.ts';

export type WatcherKind = 'demon' | 'netrunner';
export type WatcherPresetId = 'imp' | 'efreet' | 'balron' | 'netrunner';
export type StealthBreakReason = 'black-ice' | 'watcher' | 'search' | 'control' | 'attack' | 'manual';

export interface NetWatcher {
  id: string;
  name: string;
  kind: WatcherKind;
  interface: number;
  pathfinder: number;
}

export interface WatcherPreset {
  id: WatcherPresetId;
  name: string;
  kind: WatcherKind;
  interface: number;
  pathfinder: number;
  hint: string;
}

export interface StealthState {
  attempted: boolean;
  active: boolean;
  brokenBy: StealthBreakReason | null;
  turn: number;
  iceBypassed: boolean;
  watcherSearches: Record<string, number>;
  history: string[];
}

export interface NpcCheckRoll {
  id: string;
  name: string;
  base: number;
  face: number;
  extra: number;
  total: number;
  detail: string;
}

export interface StealthContestResult {
  success: boolean;
  netrunnerTotal: number;
  opponents: (NpcCheckRoll & { beaten: boolean })[];
  caughtBy: string[];
  note: string;
}

export interface StealthOpposedResult {
  passed: boolean;
  netrunnerTotal: number;
  opposedTotal: number;
  margin: number;
  note: string;
}

export interface WatcherSearchResult {
  found: boolean;
  watcherTotal: number;
  netrunnerTotal: number;
  margin: number;
  note: string;
}

export const QUIET_JACK_IN_NET_ACTION_COST = 1;
export const STEALTH_TRACE_MULTIPLIER = 0.5;
export const STEALTH_PREP_ABILITY_ID = 'stealth';
export const STEALTH_BREAKING_ACTIONS: readonly string[] = ['control', 'zap', 'attack', 'program-attack'];

// Demons from the Core Book Black ICE/Demon table; their Interface is what
// they contest with. Demons run no Programs, so Pathfinder bonus stays 0.
export const WATCHER_PRESETS: readonly WatcherPreset[] = [
  { id: 'imp', name: 'Imp', kind: 'demon', interface: 3, pathfinder: 0, hint: 'demonio basico' },
  { id: 'efreet', name: 'Efreet', kind: 'demon', interface: 4, pathfinder: 0, hint: 'demonio medio' },
  { id: 'balron', name: 'Balron', kind: 'demon', interface: 7, pathfinder: 0, hint: 'demonio avancado' },
  { id: 'netrunner', name: 'Netrunner inimigo', kind: 'netrunner', interface: 4, pathfinder: 0, hint: 'Interface e bonus de Pathfinder (See Ya +2) ajustaveis' },
];

export function watcherPresetById(id: unknown): WatcherPreset | null {
  const key = String(id || '').toLowerCase();
  return WATCHER_PRESETS.find(preset => preset.id === key) || null;
}

export function buildWatcher(input: Partial<NetWatcher> & { presetId?: unknown }, index = 0): NetWatcher | null {
  const preset = watcherPresetById(input.presetId) || (input.kind === 'netrunner' ? watcherPresetById('netrunner') : null);
  const kind: WatcherKind = input.kind === 'netrunner' || (preset && preset.kind === 'netrunner') ? 'netrunner' : 'demon';
  const name = String(input.name || (preset ? preset.name : '') || '').trim();
  const iface = clampNumber(input.interface, preset ? preset.interface : NaN, 0, 10);
  if (!name || !Number.isFinite(iface)) return null;
  return {
    id: String(input.id || (kind + '-' + slug(name) + '-' + (index + 1))),
    name,
    kind,
    interface: iface,
    pathfinder: clampNumber(input.pathfinder, preset ? preset.pathfinder : 0, 0, 10),
  };
}

export function normalizeWatchers(rows: unknown): NetWatcher[] {
  const list = Array.isArray(rows) ? rows : [];
  const seen = new Set<string>();
  return list.map((row, index) => buildWatcher((row || {}) as Partial<NetWatcher>, index)).filter((watcher): watcher is NetWatcher => {
    if (!watcher || seen.has(watcher.id)) return false;
    seen.add(watcher.id);
    return true;
  });
}

export function normalizeStealthState(state: Partial<StealthState> | null | undefined): StealthState {
  const src = state || {};
  const searches: Record<string, number> = {};
  Object.entries(src.watcherSearches || {}).forEach(([id, turn]) => {
    const n = Number(turn);
    if (id && Number.isFinite(n)) searches[id] = n;
  });
  const brokenBy = src.brokenBy && ['black-ice', 'watcher', 'search', 'control', 'attack', 'manual'].includes(src.brokenBy) ? src.brokenBy : null;
  return {
    attempted: !!src.attempted,
    active: !!src.active && !brokenBy,
    brokenBy,
    turn: Math.max(1, Math.floor(Number(src.turn) || 1)),
    iceBypassed: !!src.iceBypassed,
    watcherSearches: searches,
    history: Array.isArray(src.history) ? src.history.map(String).slice(-20) : [],
  };
}

// Eraser: "+2 to Cloak Checks while Rezzed". Programs expose it as a
// `cloakCheck` modifier so a future booster can stack without code here.
export function cloakBonus(programs: unknown): number {
  return sumModifier(programs, 'cloakCheck');
}

// See Ya: "+2 to Pathfinder Checks while Rezzed" — applies to enemy
// Netrunners acting as Watchers when the GM tracks their deck.
export function pathfinderBonus(programs: unknown): number {
  return sumModifier(programs, 'pathfinderCheck');
}

// CPR check die: 10 explodes (+1d10), 1 implodes (-1d10). Mirrors the visible
// roller in Component.commitRoll so NPC totals follow the same RAW.
export function rollCheckD10(random: () => number = Math.random): { face: number; extra: number; total: number; detail: string } {
  const face = d10(random);
  if (face === 10) {
    const extra = d10(random);
    return { face, extra, total: face + extra, detail: '10 + ' + extra };
  }
  if (face === 1) {
    const extra = d10(random);
    return { face, extra: -extra, total: face - extra, detail: '1 - ' + extra };
  }
  return { face, extra: 0, total: face, detail: String(face) };
}

export function rollNpcCheck(id: unknown, name: unknown, base: unknown, random: () => number = Math.random): NpcCheckRoll {
  const die = rollCheckD10(random);
  const bonus = Number(base) || 0;
  return {
    id: String(id || ''),
    name: String(name || id || 'NPC'),
    base: bonus,
    face: die.face,
    extra: die.extra,
    total: bonus + die.total,
    detail: bonus + ' + ' + die.detail + ' = ' + (bonus + die.total),
  };
}

// Quietly Jack In: Watchers contest with bare Interface (no Pathfinder yet —
// nobody is scanning, they are just listening for the connection).
export function rollWatcherJackInChecks(watchers: unknown, random: () => number = Math.random): NpcCheckRoll[] {
  return normalizeWatchers(watchers).map(watcher => rollNpcCheck(watcher.id, watcher.name, watcher.interface, random));
}

export function rollWatcherPathfinderCheck(watcher: NetWatcher, random: () => number = Math.random): NpcCheckRoll {
  return rollNpcCheck(watcher.id, watcher.name, watcher.interface + watcher.pathfinder, random);
}

export function resolveQuietJackIn(netrunnerTotal: unknown, watcherRolls: NpcCheckRoll[]): StealthContestResult {
  const total = Number(netrunnerTotal) || 0;
  const rolls = Array.isArray(watcherRolls) ? watcherRolls : [];
  const opponents = rolls.map(roll => ({ ...roll, beaten: total > roll.total }));
  const caughtBy = opponents.filter(row => !row.beaten).map(row => row.name);
  const success = caughtBy.length === 0;
  return {
    success,
    netrunnerTotal: total,
    opponents,
    caughtBy,
    note: !rolls.length
      ? 'sem Watchers ativos: conexao silenciosa automatica'
      : success
        ? 'venceu todos os Watchers: stealth estabelecido'
        : 'detectado por ' + caughtBy.join(', ') + ' (empate favorece o Watcher)',
  };
}

// Netrunner is the one slipping past: must beat, tie fails.
export function resolveStealthEncounter(netrunnerTotal: unknown, opposedTotal: unknown): StealthOpposedResult {
  const mine = Number(netrunnerTotal) || 0;
  const theirs = Number(opposedTotal) || 0;
  const margin = mine - theirs;
  const passed = margin > 0;
  return {
    passed,
    netrunnerTotal: mine,
    opposedTotal: theirs,
    margin,
    note: passed ? 'passou despercebido' : 'stealth quebrado (empate favorece o defensor)',
  };
}

// Watcher Search: the Watcher acts, the Netrunner defends, so ties hide.
export function resolveWatcherSearch(watcherTotal: unknown, netrunnerTotal: unknown): WatcherSearchResult {
  const theirs = Number(watcherTotal) || 0;
  const mine = Number(netrunnerTotal) || 0;
  const margin = theirs - mine;
  const found = margin > 0;
  return {
    found,
    watcherTotal: theirs,
    netrunnerTotal: mine,
    margin,
    note: found ? 'Netrunner localizado: stealth quebrado' : 'busca falhou, Netrunner segue oculto (empate favorece o Netrunner)',
  };
}

export function actionBreaksStealth(actionId: unknown): boolean {
  return STEALTH_BREAKING_ACTIONS.includes(String(actionId || '').toLowerCase());
}

export function establishStealth(state: Partial<StealthState> | null | undefined, note?: string): StealthState {
  const current = normalizeStealthState(state);
  return { ...current, attempted: true, active: true, brokenBy: null, history: pushHistory(current.history, note) };
}

export function failStealthAttempt(state: Partial<StealthState> | null | undefined, note?: string): StealthState {
  const current = normalizeStealthState(state);
  return { ...current, attempted: true, active: false, brokenBy: null, history: pushHistory(current.history, note) };
}

export function breakStealth(state: Partial<StealthState> | null | undefined, reason: StealthBreakReason, note?: string): StealthState {
  const current = normalizeStealthState(state);
  return { ...current, active: false, brokenBy: reason, history: pushHistory(current.history, note) };
}

export function markIceBypassed(state: Partial<StealthState> | null | undefined, note?: string): StealthState {
  const current = normalizeStealthState(state);
  return { ...current, iceBypassed: true, history: pushHistory(current.history, note) };
}

export function canWatcherSearch(state: Partial<StealthState> | null | undefined, watcherId: unknown): boolean {
  const current = normalizeStealthState(state);
  if (!current.active) return false;
  const last = current.watcherSearches[String(watcherId || '')];
  return !(Number.isFinite(last) && last >= current.turn);
}

export function markWatcherSearched(state: Partial<StealthState> | null | undefined, watcherId: unknown, note?: string): StealthState {
  const current = normalizeStealthState(state);
  return {
    ...current,
    watcherSearches: { ...current.watcherSearches, [String(watcherId || '')]: current.turn },
    history: pushHistory(current.history, note),
  };
}

export function advanceStealthTurn(state: Partial<StealthState> | null | undefined): StealthState {
  const current = normalizeStealthState(state);
  return { ...current, turn: current.turn + 1 };
}

export function stealthTraceMultiplier(active: unknown): number {
  return active ? STEALTH_TRACE_MULTIPLIER : 1;
}

export function stealthStatusLabel(state: Partial<StealthState> | null | undefined): string {
  const current = normalizeStealthState(state);
  if (current.active) return 'STEALTH ATIVO';
  if (current.brokenBy) return 'STEALTH QUEBRADO // ' + breakReasonLabel(current.brokenBy);
  if (current.attempted) return 'STEALTH FALHOU';
  return 'SEM STEALTH';
}

export function breakReasonLabel(reason: StealthBreakReason | null): string {
  switch (reason) {
    case 'black-ice': return 'BLACK ICE';
    case 'watcher': return 'WATCHER';
    case 'search': return 'BUSCA ATIVA';
    case 'control': return 'CONTROL NODE';
    case 'attack': return 'ATAQUE';
    case 'manual': return 'MESTRE';
    default: return '';
  }
}

function sumModifier(programs: unknown, key: string): number {
  return normalizeInstalledPrograms(programs)
    .filter(program => program.state !== 'derezzed')
    .reduce((sum, program) => {
      const base = netrunningProgramById(program.id);
      const value = base && base.modifiers ? Number(base.modifiers[key]) : 0;
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
}

function pushHistory(history: string[], note?: string): string[] {
  if (!note) return history.slice();
  return history.concat(String(note)).slice(-20);
}

function d10(random: () => number): number {
  return 1 + Math.max(0, Math.min(9, Math.floor(random() * 10)));
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'w';
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (value === '' || value == null || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
