import {
  collectVirtualIncludedOptions,
  createInstalledCyberwareInstance,
  findCatalogItem,
  normalizeInstalledCyberwareEntries,
  validateDuplicateInstallPolicy,
} from './cyberwareInstanceUtils.ts';
import { calculateCyberwareSlots } from './cyberwareSlotEngine.ts';
import type { SlotSummary } from './cyberwareSlotEngine.ts';
import { validateCyberwareParent, validateCyberwareRequirements } from './cyberwareRequirementEngine.ts';
import { validationIssue } from './itemTypes.ts';
import type { ValidationIssue } from './itemTypes.ts';
import { validateInstalledCyberwareInstance } from './itemValidation.ts';
import type { InstalledCyberwareInstance } from './installedCyberwareTypes.ts';
import type { CanonicalRules } from './canonicalRulesTypes.ts';
import type { LegacyCatalogItem, LegacyCharacter } from './legacyCatalogTypes.ts';

export { createInstalledCyberwareInstance };

function characterInstallRows(character: LegacyCharacter | null | undefined): LegacyCatalogItem[] {
  if (!character) return [];
  if (Array.isArray(character.installedCyberware)) return character.installedCyberware;
  if (Array.isArray(character.cyberwareInstances)) return character.cyberwareInstances;
  if (Array.isArray(character.equipped)) return character.equipped;
  return [];
}

function splitIssues(issues: ValidationIssue[]) {
  return {
    errors: issues.filter(issue => issue.severity === 'error'),
    warnings: issues.filter(issue => issue.severity === 'warning'),
    info: issues.filter(issue => issue.severity === 'info'),
  };
}

export interface ResolvedInstalledCyberware {
  instances: InstalledCyberwareInstance[];
  issues: ValidationIssue[];
  slotSummary: SlotSummary;
  requirementSummary: { issues: ValidationIssue[] };
  virtualIncludedOptions: ReturnType<typeof collectVirtualIncludedOptions>['virtualIncludedOptions'];
}

export function resolveInstalledCyberware(character: LegacyCharacter = {}, catalog: LegacyCatalogItem[] = [], canonicalRules: CanonicalRules = {}): ResolvedInstalledCyberware {
  const instances = normalizeInstalledCyberwareEntries(characterInstallRows(character), catalog, canonicalRules);
  const issues: ValidationIssue[] = [];
  instances.forEach(instance => {
    issues.push(...validateInstalledCyberwareInstance(instance, catalog));
    if (!findCatalogItem(catalog, instance.code)) {
      issues.push(validationIssue('warning', 'installed_cyberware_catalog_missing', 'Installed cyberware code is not present in catalog.', { code: instance.code }));
    }
  });
  issues.push(...validateDuplicateInstallPolicy(instances, catalog, canonicalRules));

  const slotSummary = calculateCyberwareSlots(instances, catalog, canonicalRules);
  issues.push(...slotSummary.issues);

  const requirementIssues: ValidationIssue[] = [];
  instances.forEach(instance => {
    requirementIssues.push(...validateCyberwareParent(instance, instances, catalog, canonicalRules));
    requirementIssues.push(...validateCyberwareRequirements(instance, instances, character.base || character.stats || {}, catalog, canonicalRules));
  });
  issues.push(...requirementIssues);

  const virtual = collectVirtualIncludedOptions(instances, catalog, canonicalRules);
  issues.push(...virtual.issues);

  return {
    instances,
    issues,
    slotSummary,
    requirementSummary: { issues: requirementIssues },
    virtualIncludedOptions: virtual.virtualIncludedOptions,
  };
}

export interface ValidatedInstalledCyberwareSet extends ReturnType<typeof splitIssues> {
  valid: boolean;
  instances: InstalledCyberwareInstance[];
  slotSummary: SlotSummary;
  requirementSummary: { issues: ValidationIssue[] };
  virtualIncludedOptions: ResolvedInstalledCyberware['virtualIncludedOptions'];
}

export function validateInstalledCyberwareSet(character: LegacyCharacter = {}, catalog: LegacyCatalogItem[] = [], canonicalRules: CanonicalRules = {}): ValidatedInstalledCyberwareSet {
  const resolved = resolveInstalledCyberware(character, catalog, canonicalRules);
  const grouped = splitIssues(resolved.issues);
  return {
    valid: grouped.errors.length === 0,
    errors: grouped.errors,
    warnings: grouped.warnings,
    info: grouped.info,
    instances: resolved.instances,
    slotSummary: resolved.slotSummary,
    requirementSummary: resolved.requirementSummary,
    virtualIncludedOptions: resolved.virtualIncludedOptions,
  };
}
