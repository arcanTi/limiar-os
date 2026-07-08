import { findCatalogItem, normalizeCatalogCyberware } from './cyberwareInstanceUtils.ts';
import { validationIssue } from './itemTypes.ts';
import type { ValidationIssue } from './itemTypes.ts';
import type { CyberwareDefinition } from './cyberwareTypes.ts';
import type { InstalledCyberwareInstance } from './installedCyberwareTypes.ts';
import type { CanonicalRules } from './canonicalRulesTypes.ts';
import type { LegacyCatalogItem } from './legacyCatalogTypes.ts';

interface CategoryPoolDef {
  poolId: string;
  location: string;
  category: string;
  capacity: number;
}

const categoryPoolDefs: CategoryPoolDef[] = [
  { poolId: 'category-internal', location: 'internal', category: 'internal', capacity: 7 },
  { poolId: 'category-external', location: 'external', category: 'external', capacity: 7 },
  { poolId: 'category-fashion', location: 'fashion', category: 'fashionware', capacity: 7 },
];

interface SlotPool {
  poolId: string;
  ownerInstanceId: string | null;
  location: string | null;
  category: string;
  capacity: number;
  used: number;
  remaining: number;
  children: { instanceId: string; code: string; cost: number }[];
}

function canonicalCorrectionFor(def: { code?: string }, canonicalRules: CanonicalRules) {
  const code = def && def.code;
  return Object.values(canonicalRules.itemEffectCorrections || {}).find(row => (row.seedCodes || []).includes(code || '')) || null;
}

function poolCategoryFor(def: CyberwareDefinition): string {
  if (def.code === 'NEURAL-LINK') return 'neuralware';
  if (def.code === 'CYBEREYE') return 'cyberoptics';
  if (def.code === 'CYBERAUDIO') return 'cyberaudio';
  if (def.code === 'CYBERARM') return 'cyberarm';
  if (def.code === 'CYBERLEG') return 'cyberleg';
  return def.cyberwareType || 'unknown';
}

export interface SlotCostResult {
  cost: number;
  mode: 'none' | 'perCybereye' | 'perCyberleg' | 'perCyberarm' | 'singleParent';
  parentCode?: string;
  raw?: unknown;
  issues: ValidationIssue[];
}

export function getCyberwareSlotCost(cyberwareDefinition: CyberwareDefinition | null | undefined, canonicalRules: CanonicalRules = {}): SlotCostResult {
  const issues: ValidationIssue[] = [];
  if (!cyberwareDefinition) return { cost: 0, mode: 'none', issues };
  const directSlotCost = cyberwareDefinition.slotCost;
  if (directSlotCost && typeof directSlotCost === 'object') {
    if (directSlotCost.perCybereye) return { cost: Number(directSlotCost.perCybereye), mode: 'perCybereye', parentCode: 'CYBEREYE', raw: directSlotCost, issues };
    if (directSlotCost.perCyberleg) return { cost: Number(directSlotCost.perCyberleg), mode: 'perCyberleg', parentCode: 'CYBERLEG', raw: directSlotCost, issues };
    if (directSlotCost.perCyberarm) return { cost: Number(directSlotCost.perCyberarm), mode: 'perCyberarm', parentCode: 'CYBERARM', raw: directSlotCost, issues };
  }
  if (Number(directSlotCost) > 0) return { cost: Number(directSlotCost), mode: 'singleParent', raw: directSlotCost, issues };
  const correction = canonicalCorrectionFor(cyberwareDefinition, canonicalRules);
  if (correction && correction.slotCost) {
    const raw = correction.slotCost;
    if (Number(raw) > 0) return { cost: Number(raw), mode: 'singleParent', raw, issues };
    if (typeof raw === 'object') {
      if (raw.perCybereye) return { cost: Number(raw.perCybereye), mode: 'perCybereye', parentCode: 'CYBEREYE', raw, issues };
      if (raw.perCyberleg) return { cost: Number(raw.perCyberleg), mode: 'perCyberleg', parentCode: 'CYBERLEG', raw, issues };
      if (raw.perCyberarm) return { cost: Number(raw.perCyberarm), mode: 'perCyberarm', parentCode: 'CYBERARM', raw, issues };
    }
  }
  if (Number(cyberwareDefinition.optionSlotsRequired) > 0) {
    return { cost: Number(cyberwareDefinition.optionSlotsRequired), mode: 'singleParent', issues };
  }
  if (/\b(slot|slots)\b/i.test(cyberwareDefinition.legacyRequirements || '')) {
    issues.push(validationIssue('warning', 'slot_cost_legacy_only', 'Slot cost is only present in legacyRequirements and was not inferred.', {
      code: cyberwareDefinition.code,
      evidence: { legacyRequirements: cyberwareDefinition.legacyRequirements },
    }));
  } else if ((cyberwareDefinition.requires || []).some(req => req.type === 'requiredCyberware' || req.type === 'requiredCyberwareCount')) {
    issues.push(validationIssue('warning', 'slot_cost_missing', 'Cyberware option has parent/paired requirements but no structured slot cost.', {
      code: cyberwareDefinition.code,
    }));
  }
  return { cost: 0, mode: 'none', issues };
}

export interface SlotSummary {
  pools: SlotPool[];
  issues: ValidationIssue[];
}

export function calculateCyberwareSlots(
  instances: InstalledCyberwareInstance[] = [],
  catalog: LegacyCatalogItem[] = [],
  canonicalRules: CanonicalRules = {},
): SlotSummary {
  const issues: ValidationIssue[] = [];
  const pools: SlotPool[] = categoryPoolDefs.map(pool => ({ ...pool, ownerInstanceId: null, used: 0, remaining: pool.capacity, children: [] }));
  const byId = new Map(instances.map(instance => [instance.instanceId, instance]));

  instances.forEach(instance => {
    const def = normalizeCatalogCyberware(findCatalogItem(catalog, instance.code) || { code: instance.code }, canonicalRules);
    if (Number(def.optionSlotsProvided) > 0) {
      pools.push({
        poolId: `instance-${instance.instanceId}`,
        ownerInstanceId: instance.instanceId,
        location: instance.location || null,
        category: poolCategoryFor(def),
        capacity: Number(def.optionSlotsProvided),
        used: 0,
        remaining: Number(def.optionSlotsProvided),
        children: [],
      });
    }
  });

  instances.forEach(instance => {
    const def = normalizeCatalogCyberware(findCatalogItem(catalog, instance.code) || { code: instance.code }, canonicalRules);
    const slotCost = getCyberwareSlotCost(def, canonicalRules);
    issues.push(...slotCost.issues);
    if (!slotCost.cost) return;
    if (slotCost.parentCode && String(slotCost.mode || '').startsWith('per') && def.countMode === 'paired' && !instance.parentInstanceId) {
      const required = (def.requires || []).find(req => req.type === 'requiredCyberwareCount' && req.code === slotCost.parentCode);
      const requiredCount = Number(required?.count || 2);
      const parents = instances
        .filter(row => row.code === slotCost.parentCode)
        .slice(0, requiredCount);
      if (parents.length < requiredCount) {
        issues.push(validationIssue('error', 'paired_parent_slot_missing', 'Paired cyberware slot cost requires multiple valid parent instances.', {
          code: instance.code,
          evidence: { parentCode: slotCost.parentCode, requiredCount, count: parents.length },
        }));
        return;
      }
      parents.forEach(parent => {
        const parentPool = pools.find(row => row.ownerInstanceId === parent.instanceId);
        if (!parentPool) {
          issues.push(validationIssue('error', 'paired_parent_slot_pool_missing', 'Paired cyberware parent has no slot pool.', {
            code: instance.code,
            evidence: { parentCode: parent.code, parentInstanceId: parent.instanceId },
          }));
          return;
        }
        parentPool.used += slotCost.cost;
        parentPool.children.push({ instanceId: instance.instanceId, code: instance.code, cost: slotCost.cost });
      });
      return;
    }
    const pool = instance.parentInstanceId
      ? pools.find(row => row.ownerInstanceId === instance.parentInstanceId)
      : pools.find(row => !row.ownerInstanceId && row.location === instance.location);
    if (!pool) {
      if (instance.manualChoiceRequired === true) {
        issues.push(validationIssue('warning', 'manual_choice_required', 'Cyberware slot parent/location is pending manual migration choice.', {
          code: instance.code,
          evidence: {
            instanceId: instance.instanceId,
            parentInstanceId: instance.parentInstanceId || null,
            location: instance.location || null,
            originalIssueType: 'slot_parent_missing',
            manualChoice: instance.manualChoice || null,
            migrationMetadata: instance.migrationMetadata || null,
          },
        }));
        return;
      }
      issues.push(validationIssue('warning', 'slot_parent_missing', 'Cyberware option has slot cost but no matching slot pool.', {
        code: instance.code,
        evidence: { parentInstanceId: instance.parentInstanceId || null, location: instance.location || null },
      }));
      return;
    }
    if (instance.parentInstanceId && !byId.has(instance.parentInstanceId)) {
      issues.push(validationIssue('error', 'slot_parent_not_found', 'Cyberware option parentInstanceId does not exist.', {
        code: instance.code,
        evidence: { parentInstanceId: instance.parentInstanceId },
      }));
    }
    pool.used += slotCost.cost;
    pool.children.push({ instanceId: instance.instanceId, code: instance.code, cost: slotCost.cost });
  });

  pools.forEach(pool => {
    pool.remaining = pool.capacity - pool.used;
    if (pool.remaining < 0) {
      issues.push(validationIssue('error', 'slot_capacity_exceeded', 'Cyberware slot pool capacity exceeded.', {
        evidence: { poolId: pool.poolId, capacity: pool.capacity, used: pool.used },
      }));
    }
  });

  return { pools, issues };
}
