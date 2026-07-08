import { normalizeSkillName } from './itemNormalizers.ts';
import { numericSituation, situationFlag } from './itemEffectContext.ts';
import type { ItemEffect } from './cyberwareTypes.ts';
import type { CanonicalRules } from './canonicalRulesTypes.ts';

interface ResolverContext {
  canonicalRules?: CanonicalRules;
  situation?: Record<string, unknown>;
}

const effectValue = (effect: ItemEffect): number => {
  if (typeof effect.value === 'number') return effect.value;
  if (effect.value && typeof (effect.value as { value?: unknown }).value === 'number') return (effect.value as { value: number }).value;
  return 0;
};

export function effectMatchesSkill(effect: ItemEffect, skillName: string, context: ResolverContext = {}): boolean {
  const canonicalSkill = normalizeSkillName(skillName, context.canonicalRules || {});
  const appliesTo = (effect.appliesTo || []).map(skill => normalizeSkillName(skill, context.canonicalRules || {}));
  return appliesTo.includes(canonicalSkill);
}

export function conditionSatisfied(effect: ItemEffect, context: ResolverContext = {}): boolean {
  const condition = String(effect.condition || '').toLowerCase();
  if (!condition) return true;
  if (condition.includes('hearing')) return situationFlag(context, 'hearingRelevant');
  if (condition.includes('singingvoicerelevant') || condition.includes('singing/voice')) return situationFlag(context, 'singingVoiceRelevant');
  if (condition.includes('voicerelevant') || condition.includes('voice/stress') || condition.includes('lie analysis')) return situationFlag(context, 'voiceRelevant');
  if (condition.includes('darkness') || condition.includes('smoke') || condition.includes('fog')) return situationFlag(context, 'darknessSmokeFogPenalty');
  if (condition.includes('swimming')) return situationFlag(context, 'swimming');
  if (condition.includes('jumping')) return situationFlag(context, 'jumping');
  if (condition.includes('climbing')) return situationFlag(context, 'climbing');
  if (condition.includes('run action') || condition.includes('suitable surface')) return situationFlag(context, 'skatingOrRollingSurface');
  if (condition.includes('aimed shot')) {
    if (!situationFlag(context, 'aimedShot')) return false;
    if (condition.includes('51')) {
      const distance = numericSituation(context, 'aimedShotTargetDistance');
      return distance !== null && distance >= 51;
    }
  }
  return true;
}

export function applyStackingRules(effects: ItemEffect[] = []): ItemEffect[] {
  const groups = new Map<string, ItemEffect[]>();
  effects.forEach(effect => {
    const key = [
      effect.type,
      (effect.appliesTo || []).join('|'),
      effect.condition || '',
      effect.stackingRule || 'stack',
      effect.value && typeof effect.value === 'object' ? JSON.stringify(effect.value) : '',
    ].join('::');
    const rows = groups.get(key) || [];
    rows.push(effect);
    groups.set(key, rows);
  });
  const applied: ItemEffect[] = [];
  groups.forEach(rows => {
    const rule = rows[0].stackingRule || 'stack';
    if (rule === 'stack') applied.push(...rows);
    else if (rule === 'doNotStack') applied.push(rows[0]);
    else if (rule === 'highestOnly') applied.push(rows.slice().sort((a, b) => effectValue(b) - effectValue(a))[0]);
    else if (rule === 'requiresMultipleInstances' && rows.length > 1) applied.push(rows[0]);
  });
  return applied;
}

export interface SuppressedEffect {
  effect: ItemEffect;
  reason: 'disabled_by_default' | 'condition_not_met';
}

export function splitActiveEffects(effects: ItemEffect[] = [], context: ResolverContext = {}): { applied: ItemEffect[]; suppressed: SuppressedEffect[] } {
  const applied: ItemEffect[] = [];
  const suppressed: SuppressedEffect[] = [];
  effects.forEach(effect => {
    if (effect.enabledByDefault === false) {
      suppressed.push({ effect, reason: 'disabled_by_default' });
      return;
    }
    if (!conditionSatisfied(effect, context)) {
      suppressed.push({ effect, reason: 'condition_not_met' });
      return;
    }
    applied.push(effect);
  });
  return { applied: applyStackingRules(applied), suppressed };
}
