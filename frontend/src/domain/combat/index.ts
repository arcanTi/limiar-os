import { asNumber } from '../shared/num.ts';
import { parseGearDamage, skillCanonicalName, normalizeSkills } from '../character/index.ts';
import type { CharacterSkill } from '../character/index.ts';
import { slug } from '../shared/text.ts';
import { rollD10 } from './combatDice.ts';

export interface CombatantEntry {
  side: 'pc' | 'enemy';
  initiative: number | null;
  acted: boolean;
  defeated: boolean;
}

export interface CombatState {
  active: boolean;
  round: number;
  turnIndex: number;
  order: string[];
  combatants: Record<string, CombatantEntry>;
  updatedAt: string;
}

export function defaultCombatState(now: string = new Date().toISOString()): CombatState {
  return { active: false, round: 0, turnIndex: -1, order: [], combatants: {}, updatedAt: now };
}

export function normalizeCombatant(entry: unknown, side?: string): CombatantEntry {
  const src = (entry && typeof entry === 'object' ? entry : {}) as { side?: string; initiative?: unknown; acted?: unknown; defeated?: unknown };
  const cleanSide: 'pc' | 'enemy' = ['pc', 'enemy'].includes(src.side || '') ? (src.side as 'pc' | 'enemy') : (side === 'enemy' ? 'enemy' : 'pc');
  const rawInit = src.initiative;
  const initiative = rawInit === null || rawInit === undefined || rawInit === '' ? null : asNumber(rawInit, 0, -99, 999);
  return { side: cleanSide, initiative, acted: !!src.acted, defeated: !!src.defeated };
}

export function normalizeCombatState(payload: unknown, roster: { id?: string }[] = [], now: string = new Date().toISOString()): CombatState {
  const src = (payload && typeof payload === 'object' ? payload : {}) as Partial<CombatState> & { combatants?: Record<string, unknown> };
  const rosterIds = new Set((roster || []).map(c => c && c.id).filter(Boolean) as string[]);
  const rawCombatants = src.combatants && typeof src.combatants === 'object' ? src.combatants : {};
  const combatants: Record<string, CombatantEntry> = {};
  Object.keys(rawCombatants).forEach(id => {
    if (rosterIds.size && !rosterIds.has(id)) return;
    combatants[id] = normalizeCombatant(rawCombatants[id]);
  });
  const order = (Array.isArray(src.order) ? src.order : [])
    .map(id => String(id || ''))
    .filter(id => id && combatants[id]);
  Object.keys(combatants).forEach(id => { if (!order.includes(id)) order.push(id); });
  return {
    active: !!src.active,
    round: asNumber(src.round, 0, 0, 999),
    turnIndex: asNumber(src.turnIndex, -1, -1, 999),
    order,
    combatants,
    updatedAt: src.updatedAt || now,
  };
}

export function combatStatePatch(state: unknown, roster: { id?: string }[] = [], now: string = new Date().toISOString()): { combatState: CombatState } {
  return { combatState: normalizeCombatState(state, roster, now) };
}

export function combatFirstActiveIndex(order: string[], combatants: Record<string, CombatantEntry>): number {
  const rows = Array.isArray(order) ? order : [];
  for (let i = 0; i < rows.length; i++) {
    const entry = combatants && combatants[rows[i]];
    if (entry && !entry.defeated) return i;
  }
  return -1;
}

export function currentCombatantId(state: unknown, roster: { id?: string }[] = []): string | null {
  const combatState = normalizeCombatState(state, roster);
  const id = combatState.order[combatState.turnIndex] || null;
  const entry = id ? combatState.combatants[id] : null;
  return entry && !entry.defeated ? id : null;
}

export function combatRepairedTurnIndex(state: unknown, preferredId: unknown, roster: { id?: string }[] = []): number {
  const combatState = normalizeCombatState(state, roster);
  const order = combatState.order || [];
  const combatants = combatState.combatants || {};
  const preferred = String(preferredId || '');
  if (preferred && combatants[preferred] && !combatants[preferred].defeated) {
    const idx = order.indexOf(preferred);
    if (idx >= 0) return idx;
  }
  const current = order[combatState.turnIndex];
  if (current && combatants[current] && !combatants[current].defeated) return combatState.turnIndex;
  if (!order.length) return -1;
  const start = combatState.turnIndex >= 0 && combatState.turnIndex < order.length ? combatState.turnIndex : 0;
  for (let offset = 0; offset < order.length; offset++) {
    const idx = (start + offset) % order.length;
    const entry = combatants[order[idx]];
    if (entry && !entry.defeated) return idx;
  }
  return -1;
}

export function sortCombatOrder(state: unknown, options: { roster?: { id?: string }[]; combatRef?: (id: string) => number } = {}): string[] {
  const combatState = normalizeCombatState(state, options.roster || []);
  const combatRef = typeof options.combatRef === 'function' ? options.combatRef : () => 0;
  const stable = new Map(combatState.order.map((id, idx) => [id, idx]));
  const ids = combatState.order.slice();
  Object.keys(combatState.combatants).forEach(id => { if (!stable.has(id)) { stable.set(id, ids.length); ids.push(id); } });
  return ids.sort((a, b) => {
    const ai = combatState.combatants[a] ? combatState.combatants[a].initiative : null;
    const bi = combatState.combatants[b] ? combatState.combatants[b].initiative : null;
    const aHas = ai !== null && ai !== undefined;
    const bHas = bi !== null && bi !== undefined;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas && bi !== ai) return Number(bi) - Number(ai);
    if (aHas) {
      const refDiff = combatRef(b) - combatRef(a);
      if (refDiff) return refDiff;
    }
    return (stable.get(a) || 0) - (stable.get(b) || 0);
  });
}

interface CharacterLike {
  derived?: { effectiveStats?: Record<string, number> };
  base?: Record<string, unknown>;
  skills?: unknown;
}

export function combatSkillRow(character: CharacterLike | null | undefined, skillName: unknown, options: { derivedStats?: (base: unknown, character: unknown) => { effectiveStats?: Record<string, number> } } = {}): CharacterSkill | null {
  const canonical = skillCanonicalName(skillName);
  const stats = character && character.derived && character.derived.effectiveStats
    ? character.derived.effectiveStats
    : (typeof options.derivedStats === 'function'
      ? options.derivedStats(character && character.base, character).effectiveStats
      : undefined);
  return normalizeSkills(character && character.skills, stats).find(skill => skillCanonicalName(skill.name) === canonical) || null;
}

interface WeaponLike {
  skill?: string;
  attackMod?: number;
  quality?: string;
  name?: string;
}

interface SourcedBonus {
  total?: number;
  sources: string[];
}

export interface CombatModOptions {
  normalizeCharacter?: (entry: unknown) => CharacterLike;
  derivedStats?: (base: unknown, character: unknown) => { effectiveStats?: Record<string, number> };
  weaponAttackMod?: (weapon: unknown) => number;
  weaponQuality?: (weapon: unknown) => string;
  statBonus?: (stat: string, actor: unknown) => SourcedBonus;
  skillBonus?: (skillName: string, actor: unknown) => SourcedBonus;
}

export interface CombatModResult {
  mod: number;
  stat: string;
  skillName: string;
  skillLevel: number;
  fallback: boolean;
  sources: string[];
}

export function combatAttackMod(character: unknown, weapon: WeaponLike | null | undefined, options: CombatModOptions = {}): CombatModResult {
  const normalizeCharacter = typeof options.normalizeCharacter === 'function' ? options.normalizeCharacter : (entry: unknown) => (entry || {}) as CharacterLike;
  const actor = normalizeCharacter(character || {});
  const derived = actor.derived && actor.derived.effectiveStats
    ? actor.derived.effectiveStats
    : (typeof options.derivedStats === 'function' ? options.derivedStats(actor.base, actor).effectiveStats : {}) || {};
  const weaponSkill = skillCanonicalName(weapon && weapon.skill);
  const skill = weaponSkill ? combatSkillRow(actor, weaponSkill, options) : null;
  const weaponAttackMod = typeof options.weaponAttackMod === 'function' ? options.weaponAttackMod(weapon) : asNumber(weapon && weapon.attackMod, 0, -99, 99);
  const quality = typeof options.weaponQuality === 'function' ? options.weaponQuality(weapon) : ((weapon && weapon.quality) || '');
  const weaponSources = weaponAttackMod ? [(weaponAttackMod >= 0 ? '+' : '') + weaponAttackMod + ' ' + ((weapon && weapon.name) || 'weapon') + (quality ? ' ' + quality : '')] : [];
  if (!skill) {
    const statCyber = typeof options.statBonus === 'function' ? options.statBonus('REF', actor) : { sources: [] as string[] };
    return { mod: (derived.REF || 0) + weaponAttackMod, stat: 'REF', skillName: weaponSkill || '', skillLevel: 0, fallback: true, sources: statCyber.sources.concat(weaponSources) };
  }
  const statCyber = typeof options.statBonus === 'function' ? options.statBonus(skill.stat, actor) : { sources: [] as string[] };
  const skillCyber = typeof options.skillBonus === 'function' ? options.skillBonus(skill.name, actor) : { total: 0, sources: [] as string[] };
  const sources = statCyber.sources.concat(skillCyber.sources, weaponSources);
  return { mod: (derived[skill.stat] || 0) + (Number(skill.level) || 0) + (skillCyber.total || 0) + weaponAttackMod, stat: skill.stat, skillName: skill.name, skillLevel: Number(skill.level) || 0, fallback: false, sources };
}

export function combatCheckMod(character: unknown, skillName: unknown, options: CombatModOptions = {}): CombatModResult {
  const normalizeCharacter = typeof options.normalizeCharacter === 'function' ? options.normalizeCharacter : (entry: unknown) => (entry || {}) as CharacterLike;
  const actor = normalizeCharacter(character || {});
  const derived = actor.derived && actor.derived.effectiveStats
    ? actor.derived.effectiveStats
    : (typeof options.derivedStats === 'function' ? options.derivedStats(actor.base, actor).effectiveStats : {}) || {};
  const skill = combatSkillRow(actor, skillName, options);
  if (!skill) {
    const statCyber = typeof options.statBonus === 'function' ? options.statBonus('REF', actor) : { sources: [] as string[] };
    return { mod: (derived.REF || 0), stat: 'REF', skillName: skillCanonicalName(skillName), skillLevel: 0, fallback: true, sources: statCyber.sources };
  }
  const statCyber = typeof options.statBonus === 'function' ? options.statBonus(skill.stat, actor) : { sources: [] as string[] };
  const skillCyber = typeof options.skillBonus === 'function' ? options.skillBonus(skill.name, actor) : { total: 0, sources: [] as string[] };
  const sources = statCyber.sources.concat(skillCyber.sources);
  return { mod: (derived[skill.stat] || 0) + (Number(skill.level) || 0) + (skillCyber.total || 0), stat: skill.stat, skillName: skill.name, skillLevel: Number(skill.level) || 0, fallback: false, sources };
}

// Autofire always deals a flat 2d6 regardless of the weapon's listed damage
// dice or any smart-weapon scaling — a fixed rule of the firing mode itself,
// not a property of the gun. This also makes the "both dice show 6" critical
// case fall out of the normal 2+ sixes threshold for free (a 2-die pool can
// only ever reach that threshold if every die in it is a 6).
export function weaponIsAutofire(weapon: WeaponLike | null | undefined): boolean {
  return skillCanonicalName(weapon && weapon.skill) === 'Autofire';
}

export interface DamageContributionRow {
  count: number;
  sides: number;
  mod: number;
  source: string;
  reason: string;
  kind: 'base' | 'bonus';
  rof?: number | null;
}

interface DamageProfileWeapon {
  count?: number;
  sides?: number;
  mod?: number;
  name?: string;
}

export function combatDamageContributions(
  weapon: DamageProfileWeapon & WeaponLike | null | undefined,
  bonusContributions: DamageContributionRow[],
  options: { damageProfile?: (weapon: unknown, actor: unknown) => { count: number; sides: number; mod: number; source: string; reason?: string; rof?: number | null } | null; actor?: unknown } = {},
): DamageContributionRow[] {
  const autofire = weaponIsAutofire(weapon);
  const scale = !autofire && typeof options.damageProfile === 'function' ? options.damageProfile(weapon, options.actor) : null;
  const baseCount = autofire ? 2 : (scale ? scale.count : asNumber(weapon && weapon.count, 0, 0, 20));
  const baseSides = autofire ? 6 : (scale ? scale.sides : asNumber(weapon && weapon.sides, 0, 0, 100));
  const baseMod = autofire ? 0 : (scale ? scale.mod : asNumber(weapon && weapon.mod, 0, -99, 99));
  const source = scale ? scale.source : (weapon && weapon.name) || 'Weapon';
  const reason = autofire ? 'autofire (2d6 fixo)' : (scale && scale.reason ? scale.reason : 'weapon base');
  const rows: DamageContributionRow[] = [];
  if (baseCount && baseSides) {
    rows.push({
      count: baseCount,
      sides: baseSides,
      mod: baseMod,
      source,
      reason,
      kind: 'base',
      rof: scale && scale.rof,
    });
  }
  return rows.concat(Array.isArray(bonusContributions) ? bonusContributions : []);
}

export function parseCombatNpcAttacks(text: unknown, options: { normalizeGearItem?: (item: Record<string, unknown>, idx: number) => unknown } = {}): unknown[] {
  const normalizeGearItem = typeof options.normalizeGearItem === 'function' ? options.normalizeGearItem : (item: Record<string, unknown>) => item;
  return String(text || '').split('\n').map((line, idx) => {
    const parts = line.split('|').map(part => part.trim()).filter(Boolean);
    if (!parts.length) return null;
    const name = parts[0] || ('Ataque ' + (idx + 1));
    const dmg = parts[1] || '1d6';
    const parsed = parseGearDamage(dmg) || { count: 1, sides: 6, mod: 0 };
    return normalizeGearItem({
      id: 'npc-atk-' + idx + '-' + slug(name),
      name,
      type: 'WEAPON - NPC',
      weaponClass: 'NPC',
      skill: parts[2] || 'Autofire',
      dmg,
      count: parsed.count,
      sides: parsed.sides,
      mod: parsed.mod,
      qty: 1,
      equipped: true,
      source: 'npc',
      notes: parts[3] || '',
    }, idx);
  }).filter(Boolean);
}

export interface ArmorDamageResult {
  hpLoss: number;
  spAblated: number;
  effectiveSp: number;
}

// CPR RED armor math: rolled damage minus the target's current SP at the hit
// location becomes HP loss; a hit that penetrates ablates 1 SP. Melee Weapon
// and Martial Arts skills only count half the target's SP (rounded up).
export function applyArmorToDamage(rolledDamage: unknown, currentSp: unknown, options: { ignoresHalfArmor?: boolean } = {}): ArmorDamageResult {
  const sp = Math.max(0, Number(currentSp) || 0);
  const effectiveSp = options.ignoresHalfArmor ? Math.ceil(sp / 2) : sp;
  const gross = Math.max(0, Number(rolledDamage) || 0);
  const hpLoss = Math.max(0, gross - effectiveSp);
  const spAblated = effectiveSp > 0 && hpLoss > 0 ? 1 : 0;
  return { hpLoss, spAblated, effectiveSp };
}

// Advance the turn pointer: mark the current combatant as acted, find the
// next undefeated combatant in order, or — if none remain — reset every
// combatant's acted flag and start a new round. currentId is the
// already-resolved current combatant id (see currentCombatantId).
export function advanceCombatTurn(state: CombatState, currentId: string | null): CombatState {
  const combatants = { ...state.combatants };
  if (currentId && combatants[currentId]) combatants[currentId] = { ...combatants[currentId], acted: true };
  const order = state.order;
  const first = combatFirstActiveIndex(order, combatants);
  if (first < 0) return { ...state, combatants, turnIndex: -1 };
  const start = currentId ? order.indexOf(currentId) : state.turnIndex;
  for (let idx = Math.max(0, start + 1); idx < order.length; idx++) {
    const entry = combatants[order[idx]];
    if (entry && !entry.defeated) return { ...state, combatants, turnIndex: idx };
  }
  const resetCombatants: Record<string, CombatantEntry> = {};
  Object.keys(combatants).forEach(id => { resetCombatants[id] = { ...combatants[id], acted: false }; });
  return { ...state, combatants: resetCombatants, round: Math.max(1, state.round) + 1, turnIndex: combatFirstActiveIndex(order, resetCombatants) };
}

export interface FacedownContestResult {
  actorRoll: number;
  actorTotal: number;
  targetRoll: number;
  targetTotal: number;
  winnerId: string | null;
  loserId: string | null;
}

// Facedown (CPR RAW): COOL + REP + 1d10 opposed roll, higher total wins; a
// tie means nothing happens (RAW). Rolls both sides at once so the GM cockpit
// can resolve a Facedown in a single action instead of two separate rolls.
export function resolveFacedownContest(
  actorId: string,
  actorMod: unknown,
  targetId: string,
  targetMod: unknown,
  rng: () => number = Math.random,
): FacedownContestResult {
  const actorRoll = rollD10(rng);
  const targetRoll = rollD10(rng);
  const actorTotal = actorRoll + (Number(actorMod) || 0);
  const targetTotal = targetRoll + (Number(targetMod) || 0);
  if (actorTotal === targetTotal) return { actorRoll, actorTotal, targetRoll, targetTotal, winnerId: null, loserId: null };
  const actorWins = actorTotal > targetTotal;
  return {
    actorRoll,
    actorTotal,
    targetRoll,
    targetTotal,
    winnerId: actorWins ? actorId : targetId,
    loserId: actorWins ? targetId : actorId,
  };
}
