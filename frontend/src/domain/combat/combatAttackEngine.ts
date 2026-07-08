import { getEffectiveSkillBonus, resolveItemEffects } from '../items/itemEffectEngine.ts';
import { normalizeSkillName } from '../items/itemNormalizers.ts';
import { rollD10 } from './combatDice.ts';
import { combatIssue } from './combatTypes.ts';
import type { AttackContext, CombatActor, CombatIssue, RollParts } from './combatTypes.ts';

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

interface ModifierRow {
  source?: string;
  type?: string;
  label?: string;
  value?: number;
}

function modifierRows(modifiers: AttackContext['modifiers']): ModifierRow[] {
  if (Array.isArray(modifiers)) return modifiers;
  if (typeof modifiers === 'number') return [{ source: 'modifier', value: modifiers }];
  if (modifiers && typeof modifiers === 'object') return Object.entries(modifiers).map(([source, value]) => ({ source, value }));
  return [];
}

function modifierTotal(modifiers: AttackContext['modifiers']): number {
  return modifierRows(modifiers).reduce((sum, row) => sum + (Number(row.value) || 0), 0);
}

function hasAimedShotModifier(modifiers: AttackContext['modifiers']): boolean {
  return modifierRows(modifiers).some(row => /aimed/i.test(String(row.source || row.type || row.label || '')) && Number(row.value) === -8);
}

function statForAttack(context: AttackContext = {}): string {
  if (context.attackStat) return context.attackStat;
  if (context.meleeAttack || context.brawlingAttack || context.attackMode === 'melee' || context.attackMode === 'brawling') return 'DEX';
  return 'REF';
}

function skillValue(actor: CombatActor = {}, skillName: string = ''): number {
  const skills = actor.skills || {};
  const canonical = String(skillName || '').trim();
  return Number(skills[canonical] ?? skills[normalizeSkillName(canonical, {})] ?? 0) || 0;
}

function statValue(actor: CombatActor = {}, stat: string = ''): number {
  const stats = actor.stats || actor.base || {};
  return Number(stats[String(stat || '').toUpperCase()] ?? 0) || 0;
}

function itemEffectSkillBonus(context: AttackContext = {}): { total: number; sources: string[]; issues: CombatIssue[] } {
  if (!context.catalog || !context.canonicalRules || !context.attacker?.installedCyberware?.length || !context.weapon?.weaponSkill) {
    return { total: 0, sources: [], issues: [] };
  }
  const situation = {
    aimedShot: !!context.aimedShot,
    aimedShotTargetDistance: context.rangeMeters,
  };
  const resolved = resolveItemEffects({
    character: context.attacker,
    instances: context.attacker.installedCyberware || [],
    catalog: (context.catalog || []) as never[],
    canonicalRules: context.canonicalRules || {},
    context: { situation, canonicalRules: context.canonicalRules || {} },
  });
  const bonus = getEffectiveSkillBonus(context.weapon.weaponSkill, resolved, {
    canonicalRules: context.canonicalRules || {},
    instances: context.attacker.installedCyberware || [],
    situation,
  });
  return { total: bonus.total || 0, sources: bonus.sources.map(s => String(s.sourceCode || '')) || [], issues: (resolved.issues || []) as unknown as CombatIssue[] };
}

function rollTotalFromParts(parts: RollParts = {}, rng: () => number): { total: number; d10: number | null; base: number | null; modifiers: number } {
  const total = numberOrNull(parts.total);
  if (total !== null) return { total, d10: numberOrNull(parts.d10), base: numberOrNull(parts.base), modifiers: numberOrNull(parts.modifiers) || 0 };
  const d10 = numberOrNull(parts.d10) ?? rollD10(rng);
  const base = numberOrNull(parts.base) || 0;
  const modifiers = numberOrNull(parts.modifiers) || 0;
  return { total: base + d10 + modifiers, d10, base, modifiers };
}

function dvFromWeaponRangeTable(context: AttackContext = {}): number | null {
  if (!context.useWeaponRangeTable || !context.weapon?.rangeTable?.custom) return null;
  const meters = numberOrNull(context.rangeMeters);
  if (meters === null) return null;
  const row = (context.weapon.rangeTable.rows || []).find(entry => {
    const match = String(entry.range || '').match(/^(\d+)-(\d+)m\/yds$/);
    if (!match) return false;
    return meters >= Number(match[1]) && meters <= Number(match[2]);
  });
  return row ? numberOrNull(row.dv) : null;
}

export interface AttackCheckResult {
  hit: boolean;
  attackTotal: number | null;
  defenseDV: number | null;
  margin: number | null;
  opposed: boolean;
  attackParts?: { total: number; d10: number | null; base: number | null; modifiers: number };
  issues: CombatIssue[];
}

export function resolveAttackCheck(context: AttackContext = {}, rng: () => number = Math.random): AttackCheckResult {
  const issues: CombatIssue[] = [];
  const weapon = context.weapon || {};
  const skillName = weapon.weaponSkill || (context.brawlingAttack ? 'Brawling' : '');
  const stat = statForAttack(context);
  const effects = itemEffectSkillBonus(context);
  issues.push(...effects.issues);
  const contextualModifiers = modifierTotal(context.modifiers);
  const needsAimedPenalty = (context.aimedShot || context.attackMode === 'aimedShot') && !hasAimedShotModifier(context.modifiers);
  const aimedShotModifier = needsAimedPenalty ? -8 : 0;
  if (needsAimedPenalty) {
    issues.push(combatIssue('info', 'aimed_shot_modifier_applied', 'Aimed Shot modifier was applied by combat resolver.', { modifier: -8 }));
  }
  const attackRoll = context.attackRoll || {};
  const attackBase = numberOrNull(attackRoll.base) ?? (statValue(context.attacker, stat) + skillValue(context.attacker, normalizeSkillName(skillName, context.canonicalRules || {})) + effects.total);
  const attackParts = rollTotalFromParts({
    ...attackRoll,
    base: attackBase,
    modifiers: (numberOrNull(attackRoll.modifiers) || 0) + contextualModifiers + aimedShotModifier,
  }, rng);

  let defenseDV: number | null = null;
  let opposed = false;
  if (context.meleeAttack || context.attackMode === 'melee' || context.brawlingAttack || context.attackMode === 'brawling') {
    opposed = true;
    defenseDV = numberOrNull(context.defenseRoll?.total) ?? numberOrNull(context.evasionDV);
    if (defenseDV === null && context.defenseRoll) {
      defenseDV = rollTotalFromParts(context.defenseRoll, rng).total;
    }
  } else if (context.evasionDV !== undefined && context.evasionDV !== null) {
    opposed = true;
    defenseDV = numberOrNull(context.evasionDV);
  } else if (context.targetDV !== undefined && context.targetDV !== null) {
    defenseDV = numberOrNull(context.targetDV);
  } else {
    defenseDV = dvFromWeaponRangeTable(context);
  }

  if (defenseDV === null) {
    issues.push(combatIssue('error', 'missing_target_dv', 'Ranged attack requires targetDV or evasionDV; melee requires defenseRoll.total or evasionDV.'));
    return { hit: false, attackTotal: attackParts.total, defenseDV: null, margin: null, opposed, attackParts, issues };
  }

  const margin = attackParts.total - defenseDV;
  const hit = opposed ? attackParts.total > defenseDV : attackParts.total >= defenseDV;
  if (weapon.quality === 'poor' && attackParts.d10 === 1) {
    issues.push(combatIssue('info', 'poor_quality_malfunction_placeholder', 'Poor quality malfunction is not resolved in this phase.', { d10: attackParts.d10 }));
  }
  return { hit, attackTotal: attackParts.total, defenseDV, margin, opposed, attackParts, issues };
}
