import { normalizeCyberwareDefinition, normalizeInstalledCyberwareInstance } from './itemNormalizers.ts';
import { validationIssue } from './itemTypes.ts';
import type { ValidationIssue } from './itemTypes.ts';
import type { CyberwareDefinition } from './cyberwareTypes.ts';
import type { CyberwareDamageState, InstalledCyberwareInstance } from './installedCyberwareTypes.ts';
import type { CanonicalRules } from './canonicalRulesTypes.ts';
import type { LegacyCatalogItem } from './legacyCatalogTypes.ts';

let instanceCounter = 0;

const text = (value: unknown): string => String(value ?? '').trim();
const slug = (value: unknown): string => text(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cyberware';

export function catalogCode(value: { code?: unknown; id?: unknown; name?: unknown } | null | undefined): string {
  return text(value && (value.code || value.id || value.name)).toUpperCase();
}

export function findCatalogItem(catalog: LegacyCatalogItem[] = [], code: unknown): LegacyCatalogItem | null {
  const key = text(code).toUpperCase();
  return (catalog || []).find(item => catalogCode(item) === key) || null;
}

export function normalizeCatalogCyberware(catalogItem: LegacyCatalogItem | null | undefined, canonicalRules: CanonicalRules = {}): CyberwareDefinition {
  return normalizeCyberwareDefinition(catalogItem || {}, canonicalRules);
}

export interface CreateInstalledCyberwareOptions {
  location?: string | null;
  existingInstances?: { instanceId?: string }[];
  instanceId?: string;
  parentInstanceId?: string | null;
  selectedMode?: string | null;
  selectedSkill?: string | null;
  selectedWeaponCode?: string | null;
  enabled?: boolean;
  damageState?: CyberwareDamageState;
  installedOptions?: string[];
  notes?: string;
}

export function createInstalledCyberwareInstance(catalogItem: LegacyCatalogItem, options: CreateInstalledCyberwareOptions = {}): InstalledCyberwareInstance {
  const code = catalogCode(catalogItem);
  const location = options.location ?? null;
  const baseId = `${slug(code)}-${location ? slug(location) : 'unplaced'}`;
  const existingIds = new Set((options.existingInstances || []).map(instance => instance && instance.instanceId).filter(Boolean) as string[]);
  let instanceId = options.instanceId || `${baseId}-${++instanceCounter}`;
  while (existingIds.has(instanceId)) instanceId = `${baseId}-${++instanceCounter}`;
  return {
    instanceId,
    code,
    parentInstanceId: options.parentInstanceId ?? null,
    location,
    selectedMode: options.selectedMode ?? null,
    selectedSkill: options.selectedSkill ?? null,
    selectedWeaponCode: options.selectedWeaponCode ?? null,
    enabled: options.enabled !== false,
    damageState: options.damageState || 'normal',
    installedOptions: Array.isArray(options.installedOptions) ? options.installedOptions.map(String) : [],
    notes: options.notes || undefined,
  };
}

export function normalizeInstalledCyberwareEntry(
  entry: LegacyCatalogItem | string,
  catalog: LegacyCatalogItem[] = [],
  canonicalRules: CanonicalRules = {},
  index = 0,
): InstalledCyberwareInstance {
  const raw: LegacyCatalogItem = typeof entry === 'string' ? { code: entry } : (entry || {});
  const catalogItem = findCatalogItem(catalog, raw.code || raw.id || raw.name) || raw;
  const normalized = normalizeInstalledCyberwareInstance({
    ...raw,
    code: catalogCode(catalogItem),
    instanceId: raw.instanceId || raw.installationId || `legacy-${catalogCode(catalogItem).toLowerCase()}-${index + 1}`,
  });
  return {
    ...normalized,
    legacySource: raw.instanceId ? undefined : 'code',
  };
}

export function normalizeInstalledCyberwareEntries(
  entries: (LegacyCatalogItem | string)[] | Record<string, LegacyCatalogItem> = [],
  catalog: LegacyCatalogItem[] = [],
  canonicalRules: CanonicalRules = {},
): InstalledCyberwareInstance[] {
  return (Array.isArray(entries) ? entries : Object.values(entries || {}))
    .map((entry, index) => normalizeInstalledCyberwareEntry(entry, catalog, canonicalRules, index))
    .filter(instance => instance.code);
}

export function validateDuplicateInstallPolicy(
  instances: InstalledCyberwareInstance[] = [],
  catalog: LegacyCatalogItem[] = [],
  canonicalRules: CanonicalRules = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byCode = new Map<string, InstalledCyberwareInstance[]>();
  instances.forEach(instance => {
    const rows = byCode.get(instance.code) || [];
    rows.push(instance);
    byCode.set(instance.code, rows);
  });
  byCode.forEach((rows, code) => {
    if (rows.length <= 1) return;
    const def = normalizeCatalogCyberware(findCatalogItem(catalog, code) || { code }, canonicalRules);
    const blocked = def.unique === true || Number(def.maxInstalled) === 1;
    if (blocked) {
      issues.push(validationIssue('error', 'cyberware_duplicate_unique', 'Cyberware is unique or maxInstalled=1 and cannot be installed more than once.', {
        code,
        evidence: { count: rows.length, maxInstalled: def.maxInstalled ?? null, unique: !!def.unique },
      }));
    }
  });
  return issues;
}

export interface VirtualIncludedOption {
  code: string;
  name?: string;
  parentInstanceId: string;
  location?: string | null;
  slotCost?: number;
  humanityLoss?: number;
  virtual: true;
}

export function virtualIncludedOptionsForInstance(
  instance: InstalledCyberwareInstance,
  catalog: LegacyCatalogItem[] = [],
  canonicalRules: CanonicalRules = {},
): VirtualIncludedOption[] {
  const def = normalizeCatalogCyberware(findCatalogItem(catalog, instance.code) || { code: instance.code }, canonicalRules);
  if (instance.code === 'CYBERARM') {
    return [{ code: 'STD-HAND', name: 'Standard Hand', parentInstanceId: instance.instanceId, location: instance.location, slotCost: 0, humanityLoss: 0, virtual: true }];
  }
  if (instance.code === 'CYBERLEG') {
    return [{ code: 'STD-FOOT', name: 'Standard Foot', parentInstanceId: instance.instanceId, location: instance.location, slotCost: 0, humanityLoss: 0, virtual: true }];
  }
  const includes: VirtualIncludedOption[] = [];
  (canonicalRules.cyberwareFoundations && Object.values(canonicalRules.cyberwareFoundations) || []).forEach(foundation => {
    if (!Array.isArray(foundation.seedCodes) || !foundation.seedCodes.includes(def.code)) return;
    (foundation.includes || []).forEach(row => includes.push({
      code: '',
      ...row,
      parentInstanceId: instance.instanceId,
      location: instance.location,
      virtual: true,
    } as VirtualIncludedOption));
  });
  return includes;
}

export function collectVirtualIncludedOptions(
  instances: InstalledCyberwareInstance[] = [],
  catalog: LegacyCatalogItem[] = [],
  canonicalRules: CanonicalRules = {},
): { virtualIncludedOptions: VirtualIncludedOption[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const explicit = new Set(instances.map(instance => instance.code));
  const virtualIncludedOptions: VirtualIncludedOption[] = [];
  instances.forEach(instance => {
    virtualIncludedOptionsForInstance(instance, catalog, canonicalRules).forEach(option => {
      if (explicit.has(option.code)) {
        issues.push(validationIssue('warning', 'virtual_included_option_duplicate_explicit', 'Found explicit install for an option already included by foundational cyberware.', {
          code: option.code,
          evidence: { parentInstanceId: instance.instanceId },
        }));
        return;
      }
      virtualIncludedOptions.push(option);
    });
  });
  return { virtualIncludedOptions, issues };
}
