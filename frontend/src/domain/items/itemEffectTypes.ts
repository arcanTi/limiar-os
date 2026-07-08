import type { ItemEffect, ItemEffectType, StackingRule } from './cyberwareTypes.ts';

export const ITEM_EFFECT_TYPES: ItemEffectType[] = [
  'flatSkillBonus',
  'conditionalSkillBonus',
  'statModifier',
  'setEffectiveStat',
  'statCapModifier',
  'armorLayer',
  'speedware',
  'senseMode',
  'cyberweapon',
  'weaponMode',
  'damageVsCover',
  'armorAblation',
  'criticalInjuryImmunity',
  'empProtection',
  'containerSlots',
  'movementMode',
  'selectedSkillBonus',
  'nonLethalMode',
  'poisonOrDrugDelivery',
  'contextualEffect',
  'unknown',
];

export type ItemEffectScope = 'character' | 'self' | 'local' | 'parent' | 'weapon' | 'sense' | 'movement' | 'armor' | 'contextual';

export const ITEM_EFFECT_SCOPES: ItemEffectScope[] = [
  'character',
  'self',
  'local',
  'parent',
  'weapon',
  'sense',
  'movement',
  'armor',
  'contextual',
];

export const STACKING_RULES: StackingRule[] = [
  'stack',
  'doNotStack',
  'highestOnly',
  'requiresMultipleInstances',
];

const scopeByType: Partial<Record<ItemEffectType, ItemEffectScope>> = {
  armorLayer: 'armor',
  senseMode: 'sense',
  movementMode: 'movement',
  cyberweapon: 'weapon',
  weaponMode: 'weapon',
  damageVsCover: 'weapon',
  armorAblation: 'weapon',
  empProtection: 'local',
  containerSlots: 'parent',
  contextualEffect: 'contextual',
  unknown: 'contextual',
};

export function defaultScopeForEffectType(type: ItemEffectType): ItemEffectScope {
  return scopeByType[type] || 'character';
}

export function defaultStackingRuleForEffectType(type: ItemEffectType): StackingRule {
  if (type === 'armorLayer' || type === 'setEffectiveStat') return 'highestOnly';
  if (type === 'empProtection' || type === 'senseMode' || type === 'movementMode') return 'doNotStack';
  return 'stack';
}

export interface RawItemEffect {
  type?: unknown;
  sourceCode?: unknown;
  sourceInstanceId?: unknown;
  appliesTo?: unknown;
  value?: unknown;
  condition?: unknown;
  stackingRule?: unknown;
  enabledByDefault?: unknown;
  scope?: unknown;
  notes?: unknown;
}

export function normalizeItemEffect(effect: RawItemEffect = {}, fallback: RawItemEffect = {}): ItemEffect {
  const type = (ITEM_EFFECT_TYPES as string[]).includes(effect.type as string) ? (effect.type as ItemEffectType) : 'unknown';
  const sourceCode = String(effect.sourceCode || fallback.sourceCode || '').trim().toUpperCase();
  return {
    type,
    sourceCode,
    sourceInstanceId: (effect.sourceInstanceId || fallback.sourceInstanceId || undefined) as string | undefined,
    appliesTo: Array.isArray(effect.appliesTo) ? effect.appliesTo.map(String) : undefined,
    value: effect.value,
    condition: (effect.condition || undefined) as string | undefined,
    stackingRule: (STACKING_RULES as string[]).includes(effect.stackingRule as string) ? (effect.stackingRule as StackingRule) : defaultStackingRuleForEffectType(type),
    enabledByDefault: effect.enabledByDefault !== false,
    scope: (ITEM_EFFECT_SCOPES as string[]).includes(effect.scope as string) ? (effect.scope as ItemEffectScope) : defaultScopeForEffectType(type),
    notes: (effect.notes || undefined) as string | undefined,
  };
}
