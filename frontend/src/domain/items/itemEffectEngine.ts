import { findCatalogItem } from './cyberwareInstanceUtils.ts';
import { normalizeCyberwareDefinition, normalizeSkillName } from './itemNormalizers.ts';
import { createEffectResolutionContext } from './itemEffectContext.ts';
import { normalizeItemEffect } from './itemEffectTypes.ts';
import { splitActiveEffects, effectMatchesSkill } from './itemEffectResolvers.ts';
import { validationIssue } from './itemTypes.ts';
import type { ValidationIssue } from './itemTypes.ts';
import type { ItemEffect } from './cyberwareTypes.ts';
import type { InstalledCyberwareInstance } from './installedCyberwareTypes.ts';
import type { CanonicalRules } from './canonicalRulesTypes.ts';
import type { LegacyCatalogItem } from './legacyCatalogTypes.ts';

function effectValue(effect: ItemEffect): number {
  const v = effect.value as Record<string, unknown> | number | undefined;
  if (typeof v === 'number') return v;
  if (v && typeof v.value === 'number') return v.value;
  if (v && typeof v.level === 'number') return v.level as number;
  if (v && typeof v.max === 'number') return v.max as number;
  return 0;
}

function effectCodeMatch(group: Record<string, { seedCodes?: string[] }> | undefined, code: string) {
  return Object.values(group || {}).find(row => (row.seedCodes || []).includes(code)) || null;
}

function sourceEffectsForInstance(instance: InstalledCyberwareInstance, catalog: LegacyCatalogItem[], canonicalRules: CanonicalRules): ItemEffect[] {
  const catalogItem = findCatalogItem(catalog, instance.code) || { code: instance.code };
  const def = normalizeCyberwareDefinition(catalogItem, canonicalRules);
  return (def.effects || []).map(effect => normalizeItemEffect(effect, {
    sourceCode: instance.code,
    sourceInstanceId: instance.instanceId,
  }));
}

export interface ResolveItemEffectsInput {
  character?: unknown;
  instances?: InstalledCyberwareInstance[];
  catalog?: LegacyCatalogItem[];
  canonicalRules?: CanonicalRules;
  context?: Record<string, unknown>;
}

export interface ResolvedItemEffects {
  effects: ItemEffect[];
  applied: ItemEffect[];
  suppressed: { effect: ItemEffect; reason: string }[];
  issues: ValidationIssue[];
}

export function resolveItemEffects({ character = null, instances = [], catalog = [], canonicalRules = {}, context = {} }: ResolveItemEffectsInput = {}): ResolvedItemEffects {
  const resolutionContext = createEffectResolutionContext({ character, instances, catalog, canonicalRules, context });
  const issues: ValidationIssue[] = [];
  const effects: ItemEffect[] = [];
  instances.forEach(instance => {
    const sourceEffects = sourceEffectsForInstance(instance, catalog, canonicalRules);
    sourceEffects.forEach(effect => {
      if (!effect.sourceCode) issues.push(validationIssue('error', 'effect_missing_source_code', 'ItemEffect is missing sourceCode.', { evidence: { instanceId: instance.instanceId } }));
      if (effect.type === 'contextualEffect' || effect.type === 'unknown') {
        issues.push(validationIssue('info', 'legacy_bonus_not_applied', 'Legacy/fake effect was preserved but not applied as automatic bonus.', {
          code: effect.sourceCode,
          evidence: { effectType: effect.type, condition: effect.condition || null },
        }));
      }
      effects.push(effect);
    });
  });
  const active = splitActiveEffects(effects, resolutionContext);
  return { effects, applied: active.applied, suppressed: active.suppressed, issues };
}

export interface EffectiveSkillBonus {
  skill: string;
  total: number;
  sources: { sourceCode: string; sourceInstanceId?: string; value: number; type: string }[];
}

export function getEffectiveSkillBonus(
  skillName: string,
  resolvedEffects: { applied?: ItemEffect[]; effects?: ItemEffect[] },
  context: { canonicalRules?: CanonicalRules; instances?: InstalledCyberwareInstance[]; selectedSkill?: string; instance?: { selectedSkill?: string }; situation?: Record<string, unknown> } = {},
): EffectiveSkillBonus {
  const canonicalSkill = normalizeSkillName(skillName, context.canonicalRules || {});
  const effects = (resolvedEffects.applied || resolvedEffects.effects || []).filter(effect => {
    if (effect.type === 'flatSkillBonus' || effect.type === 'conditionalSkillBonus') return effectMatchesSkill(effect, canonicalSkill, context);
    if (effect.type !== 'selectedSkillBonus') return false;
    const sourceInstance = (context.instances || []).find(instance => instance.instanceId === effect.sourceInstanceId);
    const selectedSkill = normalizeSkillName(
      context.selectedSkill || (sourceInstance && sourceInstance.selectedSkill) || (context.instance && context.instance.selectedSkill) || '',
      context.canonicalRules || {},
    );
    return selectedSkill && selectedSkill === canonicalSkill;
  });
  const total = effects.reduce((sum, effect) => sum + effectValue(effect), 0);
  return { skill: canonicalSkill, total, sources: effects.map(effect => ({ sourceCode: effect.sourceCode, sourceInstanceId: effect.sourceInstanceId, value: effectValue(effect), type: effect.type })) };
}

export interface EffectiveStat {
  stat: string;
  base: number;
  total: number;
  cap: number | null;
}

export function getEffectiveStat(
  statName: string,
  baseStats: Record<string, unknown> = {},
  resolvedEffects: { applied?: ItemEffect[]; effects?: ItemEffect[] },
  context: { instances?: InstalledCyberwareInstance[] } = {},
): EffectiveStat {
  const stat = String(statName || '').trim().toUpperCase();
  const base = Number(baseStats && baseStats[stat]) || 0;
  let cap = stat === 'BODY' ? 10 : Infinity;
  let value = base;
  const applied = resolvedEffects.applied || resolvedEffects.effects || [];
  applied.filter(effect => effect.type === 'statCapModifier' && (effect.appliesTo || []).includes(stat)).forEach(effect => {
    cap = Math.max(cap, Number((effect.value as { max?: number })?.max) || cap);
  });
  applied.filter(effect => effect.type === 'statModifier' && (effect.appliesTo || []).includes(stat)).forEach(effect => {
    const max = Number((effect.value as { max?: number })?.max) || cap;
    value = Math.min(max, value + effectValue(effect));
  });
  applied.filter(effect => effect.type === 'setEffectiveStat' && (effect.appliesTo || []).includes(stat)).forEach(effect => {
    const disabled = (context.instances || []).some(instance => instance.instanceId === effect.sourceInstanceId && instance.damageState === 'disabled');
    if (!disabled) value = Math.max(value, Number((effect.value as { value?: number })?.value) || effectValue(effect));
  });
  return { stat, base, total: value, cap: Number.isFinite(cap) ? cap : null };
}

export function resolveArmorLayers(resolvedEffects: { applied?: ItemEffect[]; effects?: ItemEffect[] }) {
  return {
    layers: (resolvedEffects.applied || resolvedEffects.effects || [])
      .filter(effect => effect.type === 'armorLayer')
      .map(effect => {
        const value = effect.value as { sp?: unknown; locations?: unknown; stacksWithWornArmor?: unknown; ablates?: unknown; recovery?: unknown } | undefined;
        return {
          sourceCode: effect.sourceCode,
          sourceInstanceId: effect.sourceInstanceId,
          sp: value?.sp,
          locations: value?.locations,
          stacksWithWornArmor: value?.stacksWithWornArmor,
          ablates: value?.ablates,
          recovery: value?.recovery,
        };
      }),
    issues: [] as ValidationIssue[],
  };
}

function mappedModes(resolvedEffects: { applied?: ItemEffect[]; effects?: ItemEffect[] }, type: string) {
  return (resolvedEffects.applied || resolvedEffects.effects || [])
    .filter(effect => effect.type === type)
    .map(effect => ({ sourceCode: effect.sourceCode, sourceInstanceId: effect.sourceInstanceId, value: effect.value, condition: effect.condition || null }));
}

export function resolveSenseModes(resolvedEffects: { applied?: ItemEffect[]; effects?: ItemEffect[] }) {
  return { modes: mappedModes(resolvedEffects, 'senseMode'), issues: [] as ValidationIssue[] };
}

export function resolveMovementModes(resolvedEffects: { applied?: ItemEffect[]; effects?: ItemEffect[] }) {
  return { modes: mappedModes(resolvedEffects, 'movementMode'), issues: [] as ValidationIssue[] };
}

export function resolveEmpProtection(
  resolvedEffects: { applied?: ItemEffect[]; effects?: ItemEffect[] },
  context: { situation?: Record<string, unknown>; instances?: InstalledCyberwareInstance[] } = {},
) {
  const target = context.situation && context.situation.localCyberwareTargetInstanceId;
  const protections = (resolvedEffects.applied || resolvedEffects.effects || []).filter(effect => effect.type === 'empProtection');
  const protectedEffect = protections.find(effect => {
    const source = (context.instances || []).find(instance => instance.instanceId === effect.sourceInstanceId);
    if (!source) return false;
    if (effect.scope === 'self' || (effect.value as { hardenedAgainstEmp?: boolean })?.hardenedAgainstEmp === true) {
      return target === source.instanceId;
    }
    if (!source.parentInstanceId) return false;
    if (target === source.parentInstanceId) return true;
    const targetInstance = (context.instances || []).find(instance => instance.instanceId === target);
    return !!targetInstance && targetInstance.parentInstanceId === source.parentInstanceId;
  });
  return { protected: !!protectedEffect, source: protectedEffect || null, issues: [] as ValidationIssue[] };
}

export function resolveCriticalInjuryImmunity(resolvedEffects: { applied?: ItemEffect[]; effects?: ItemEffect[] }) {
  return {
    immunities: (resolvedEffects.applied || resolvedEffects.effects || []).filter(effect => effect.type === 'criticalInjuryImmunity'),
    issues: [] as ValidationIssue[],
  };
}

export interface CyberweaponProfileResolution {
  profiles: { sourceCode: string; sourceInstanceId: string; profile: unknown }[];
  issues: ValidationIssue[];
}

export function resolveCyberweaponProfiles(
  instances: InstalledCyberwareInstance[] = [],
  catalog: LegacyCatalogItem[] = [],
  canonicalRules: CanonicalRules = {},
): CyberweaponProfileResolution {
  const issues: ValidationIssue[] = [];
  const profiles: CyberweaponProfileResolution['profiles'] = [];
  instances.forEach(instance => {
    const catalogItem = findCatalogItem(catalog, instance.code) || { code: instance.code };
    const def = normalizeCyberwareDefinition(catalogItem, canonicalRules);
    const profile = effectCodeMatch(canonicalRules.coreCyberweaponProfiles, instance.code) || def.weaponProfile;
    if (!profile) return;
    if ((profile as { container?: boolean }).container && !instance.selectedWeaponCode) {
      issues.push(validationIssue('warning', 'cyberweapon_container_unresolved', 'Cyberweapon container needs selectedWeaponCode before profile can be resolved.', { code: instance.code }));
    }
    profiles.push({
      sourceCode: instance.code,
      sourceInstanceId: instance.instanceId,
      profile,
    });
  });
  return { profiles, issues };
}
