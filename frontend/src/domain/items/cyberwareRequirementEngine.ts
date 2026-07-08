import { findCatalogItem, normalizeCatalogCyberware } from './cyberwareInstanceUtils.ts';
import { validationIssue } from './itemTypes.ts';
import type { ValidationIssue } from './itemTypes.ts';
import type { CyberwareDefinition, StructuredRequirement } from './cyberwareTypes.ts';
import type { InstalledCyberwareInstance } from './installedCyberwareTypes.ts';
import type { CanonicalRules } from './canonicalRulesTypes.ts';
import type { LegacyCatalogItem } from './legacyCatalogTypes.ts';

interface ParentByRequirementRow {
  pattern: RegExp;
  code: string;
  parentType: string;
}

const parentByRequirement: ParentByRequirementRow[] = [
  { pattern: /Cybereye/i, code: 'CYBEREYE', parentType: 'cyberoptics' },
  { pattern: /Cyberaudio Suite/i, code: 'CYBERAUDIO', parentType: 'cyberaudio' },
  { pattern: /Cyberarm/i, code: 'CYBERARM', parentType: 'cyberarm' },
  { pattern: /Cyberleg/i, code: 'CYBERLEG', parentType: 'cyberleg' },
  { pattern: /Neural Link/i, code: 'NEURAL-LINK', parentType: 'neuralware' },
  { pattern: /Chipware Socket/i, code: 'CHIP-SOCKET', parentType: 'chipware' },
];

function instancesByCode(instances: InstalledCyberwareInstance[], code: string): InstalledCyberwareInstance[] {
  return instances.filter(instance => instance.code === code);
}

function distinctLocations(rows: InstalledCyberwareInstance[]): Set<string> {
  return new Set(rows.map(row => row.location).filter(Boolean) as string[]);
}

function requiredParentCode(def: CyberwareDefinition): string | null {
  const structured = (def.requires || []).find(req => req.type === 'requiredParentType' && req.code);
  if (structured) return structured.code || null;
  if (def.parentType === 'cyberarm') return 'CYBERARM';
  if (def.parentType === 'cyberleg') return 'CYBERLEG';
  if (def.parentType === 'cyberoptics') return 'CYBEREYE';
  if (def.parentType === 'cyberaudio') return 'CYBERAUDIO';
  const text = [def.legacyRequirements, ...(def.requires || []).map(req => req.legacyText || req.name || req.code)].join(' ');
  const hit = parentByRequirement.find(row => row.pattern.test(text));
  return hit ? hit.code : null;
}

function requirementCode(req: StructuredRequirement): string | null {
  if (req.code) return req.code;
  const text = `${req.name || ''} ${req.legacyText || ''}`;
  const hit = parentByRequirement.find(row => row.pattern.test(text));
  if (hit) return hit.code;
  if (/Grafted Muscle and Bone Lace/i.test(text)) return 'MUSCLE-LACE';
  return null;
}

function manualChoiceIssue(instance: InstalledCyberwareInstance, issueType: string, message: string, evidence: Record<string, unknown> = {}): ValidationIssue {
  return validationIssue('warning', 'manual_choice_required', message, {
    code: instance.code,
    evidence: {
      instanceId: instance.instanceId,
      ...evidence,
      originalIssueType: issueType,
      manualChoice: instance.manualChoice || null,
      migrationMetadata: instance.migrationMetadata || null,
    },
  });
}

export function validateCyberwareParent(
  instance: InstalledCyberwareInstance,
  instances: InstalledCyberwareInstance[] = [],
  catalog: LegacyCatalogItem[] = [],
  canonicalRules: CanonicalRules = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const def = normalizeCatalogCyberware(findCatalogItem(catalog, instance.code) || { code: instance.code }, canonicalRules);
  const parentCode = requiredParentCode(def);
  if (!parentCode) return issues;
  if (!instance.parentInstanceId) {
    const allowsMeatArm = def.parentType === 'cyberarm'
      && (def.allowedParentTypes || []).some(value => /meat arm special case/i.test(value));
    if (allowsMeatArm && instance.location && ['leftArm', 'rightArm'].includes(instance.location)) return issues;
    if (instance.manualChoiceRequired === true) {
      issues.push(manualChoiceIssue(instance, 'cyberware_parent_missing_legacy', 'Cyberware parent choice is pending manual migration.', {
        code: instance.code,
        requiredParentCode: parentCode,
      }));
      return issues;
    }
    issues.push(validationIssue('warning', 'cyberware_parent_missing_legacy', 'Cyberware option requires a parent instance, but legacy install has no parentInstanceId.', {
      code: instance.code,
      evidence: { requiredParentCode: parentCode },
    }));
    return issues;
  }
  const parent = instances.find(row => row.instanceId === instance.parentInstanceId);
  if (!parent) {
    issues.push(validationIssue('error', 'cyberware_parent_not_found', 'Cyberware parentInstanceId does not exist.', {
      code: instance.code,
      evidence: { parentInstanceId: instance.parentInstanceId, requiredParentCode: parentCode },
    }));
    return issues;
  }
  if (parent.code !== parentCode) {
    issues.push(validationIssue('error', 'cyberware_parent_wrong_type', 'Cyberware option is installed under the wrong parent type.', {
      code: instance.code,
      evidence: { parentCode: parent.code, requiredParentCode: parentCode },
    }));
  }
  return issues;
}

export function validatePairedCyberware(
  instance: InstalledCyberwareInstance,
  instances: InstalledCyberwareInstance[] = [],
  catalog: LegacyCatalogItem[] = [],
  canonicalRules: CanonicalRules = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const def = normalizeCatalogCyberware(findCatalogItem(catalog, instance.code) || { code: instance.code }, canonicalRules);
  const required = (def.requires || []).filter(req => req.type === 'requiredCyberwareCount' && Number(req.count) >= 2);
  required.forEach(req => {
    const code = requirementCode(req);
    if (!code || !['CYBEREYE', 'CYBERARM', 'CYBERLEG'].includes(code)) return;
    const rows = instancesByCode(instances, code);
    const locations = distinctLocations(rows);
    if (rows.length >= Number(req.count) && locations.size >= Number(req.count)) return;
    if (rows.length === 1 && rows[0].legacySource === 'code') {
      issues.push(validationIssue('warning', 'paired_cyberware_legacy_blocked_by_code_dedup', 'Legacy installed cyberware is deduplicated by code and cannot prove a valid pair.', {
        code: instance.code,
        evidence: { requiredCode: code, count: rows.length, distinctLocations: locations.size },
      }));
      return;
    }
    issues.push(validationIssue('error', 'paired_cyberware_requirement_missing', 'Paired cyberware requirement is not satisfied by distinct installed locations.', {
      code: instance.code,
      evidence: { requiredCode: code, requiredCount: req.count, count: rows.length, distinctLocations: locations.size },
    }));
  });
  return issues;
}

export function validateCyberwareRequirements(
  instance: InstalledCyberwareInstance,
  instances: InstalledCyberwareInstance[] = [],
  characterStats: Record<string, unknown> = {},
  catalog: LegacyCatalogItem[] = [],
  canonicalRules: CanonicalRules = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const def = normalizeCatalogCyberware(findCatalogItem(catalog, instance.code) || { code: instance.code }, canonicalRules);
  (def.requires || []).forEach(req => {
    if (req.type === 'unknown') return;
    if (req.type === 'requiredStat') {
      const statValue = Number(characterStats && characterStats[req.stat || '']) || 0;
      if (statValue < Number(req.min || 0)) {
        issues.push(validationIssue('error', 'required_stat_missing', 'Required stat minimum is not met.', {
          code: instance.code,
          evidence: { stat: req.stat, min: req.min, value: statValue },
        }));
      }
      return;
    }
    if (req.type === 'requiredCyberware') {
      const code = requirementCode(req);
      if (code && !instancesByCode(instances, code).length) {
        if (instance.manualChoiceRequired === true) {
          issues.push(manualChoiceIssue(instance, 'required_cyberware_missing', 'Required cyberware is pending manual migration choice.', {
            code: instance.code,
            requiredCode: code,
            requirement: req,
          }));
          return;
        }
        issues.push(validationIssue('error', 'required_cyberware_missing', 'Required cyberware is not installed.', {
          code: instance.code,
          evidence: { requiredCode: code, requirement: req },
        }));
      }
      return;
    }
    if (req.type === 'requiredCyberwareCount') {
      const code = requirementCode(req);
      if (!code) return;
      const count = instancesByCode(instances, code).length;
      if (count < Number(req.count || 1)) {
        if (instance.manualChoiceRequired === true) {
          issues.push(manualChoiceIssue(instance, 'required_cyberware_count_missing', 'Required cyberware count is pending manual migration choice.', {
            code: instance.code,
            requiredCode: code,
            requiredCount: req.count,
            count,
          }));
          return;
        }
        issues.push(validationIssue('error', 'required_cyberware_count_missing', 'Required cyberware instance count is not installed.', {
          code: instance.code,
          evidence: { requiredCode: code, requiredCount: req.count, count },
        }));
      }
      return;
    }
    if (req.type === 'gmApproval' && def.requiresGmApproval !== true) {
      issues.push(validationIssue('warning', 'gm_approval_missing', 'GM approval is required but not marked on the item definition.', { code: instance.code }));
    }
  });

  if ((canonicalRules.homebrewLimiarReservedItems || []).includes(instance.code) && def.requiresGmApproval !== true) {
    issues.push(validationIssue('warning', 'homebrew_missing_gm_approval', 'Homebrew Limiar item requires GM approval flag.', { code: instance.code }));
  }

  return issues.concat(validatePairedCyberware(instance, instances, catalog, canonicalRules));
}
