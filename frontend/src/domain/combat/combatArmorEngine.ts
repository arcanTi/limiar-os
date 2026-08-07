import { resolveArmorLayers, resolveItemEffects } from '../items/itemEffectEngine.ts';
import type { CombatActor, AttackContext } from './combatTypes.ts';

interface ArmorLocationRow {
  sp?: number;
  ablates?: boolean;
  source?: string;
}

function locationArmor(armor: Record<string, ArmorLocationRow> = {}, location = 'body') {
  const row = armor[location] || {};
  return {
    sp: Math.max(0, Number(row.sp || 0)),
    ablates: row.ablates !== false,
    source: row.source || 'wornArmor',
    stacksWithWornArmor: true,
  };
}

function cyberArmorLayers(target: CombatActor = {}, context: AttackContext = {}, location = 'body') {
  if (!context.catalog || !context.canonicalRules || !target.installedCyberware?.length) return [];
  const resolved = resolveItemEffects({
    character: target,
    instances: target.installedCyberware || [],
    catalog: (context.catalog || []) as never[],
    canonicalRules: context.canonicalRules || {},
    context: { situation: (context as { situation?: Record<string, unknown> }).situation || {}, canonicalRules: context.canonicalRules || {} },
  });
  return resolveArmorLayers(resolved).layers
    .filter(layer => (layer.locations as string[] || []).includes(location))
    .map(layer => ({
      sp: Math.max(0, Number(layer.sp || 0)),
      ablates: layer.ablates !== false,
      source: layer.sourceCode,
      stacksWithWornArmor: layer.stacksWithWornArmor !== false,
    }));
}

export interface ResolvedArmor {
  location: string;
  armorSPBefore: number;
  ablates: boolean;
  source?: string;
  layers: { sp: number; ablates: boolean; source?: string; stacksWithWornArmor: boolean }[];
}

export function resolveArmorForLocation(target: CombatActor = {}, location: string = 'body', context: AttackContext & { areaAttack?: boolean } = {}): ResolvedArmor {
  const actualLocation = context.areaAttack ? 'body' : (location || 'body');
  const worn = locationArmor((target.armor || {}) as Record<string, ArmorLocationRow>, actualLocation);
  const layers = [worn, ...cyberArmorLayers(target, context, actualLocation)];
  const nonStacking = layers.filter(layer => layer.stacksWithWornArmor === false);
  const candidates = nonStacking.length ? layers : [worn];
  const selected = candidates.slice().sort((a, b) => b.sp - a.sp)[0] || worn;
  return {
    location: actualLocation,
    armorSPBefore: selected.sp,
    ablates: selected.ablates,
    source: selected.source,
    layers,
  };
}

export function ablateArmor(armorResult: ResolvedArmor | null | undefined, amount = 1) {
  const before = Math.max(0, Number(armorResult?.armorSPBefore || 0));
  return {
    armorAblated: !!armorResult?.ablates && before > 0,
    armorSPAfter: armorResult?.ablates ? Math.max(0, before - amount) : before,
  };
}
