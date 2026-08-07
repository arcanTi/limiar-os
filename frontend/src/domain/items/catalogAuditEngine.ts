import { CYBER_BONUS_TYPES } from '../cyberware/constants.ts';
import {
  CPRED_SKILL_ALIASES,
  CPRED_SKILL_ROWS,
} from '../character/constants.ts';
import {
  normalizeCyberwareDefinition,
  normalizeWeaponDefinition,
} from './itemNormalizers.ts';
import { validateInstalledCyberwareSet } from './cyberwareInstallEngine.ts';
import { resolveItemEffects } from './itemEffectEngine.ts';
import {
  validateCyberwareDefinition,
  validateItemAgainstCanonical,
  validateWeaponDefinition,
} from './itemValidation.ts';
import type { CanonicalRules } from './canonicalRulesTypes.ts';
import type { AuditIssue, LegacyCatalogItem, LegacyCharacter, LegacySeed } from './legacyCatalogTypes.ts';

interface AuditCtx {
  issues: AuditIssue[];
  collection: string;
  index: number;
  item: LegacyCatalogItem;
}

function createCatalogAuditEngine(canonicalRules: CanonicalRules) {
const CYBERWARE_CATEGORIES = new Set([
  'FASHION',
  'NEURAL',
  'OPTICS',
  'AUDIO',
  'INTERNAL',
  'EXTERNAL',
  'LIMBS',
  'BORG',
  'DECK',
  'DEFENSE',
]);
const NON_CYBERWARE_CATEGORIES = new Set(['TRAUMA TEAM']);
const RED_DAMAGE_DICE = new Set([1, 2, 3, 4, 5, 6, 8]);

const skillNames = new Set((CPRED_SKILL_ROWS as unknown[]).map((row) => (row as [string, string])[0]));
const officialStats = new Set(canonicalRules.officialStats || []);
const supportedBonusTypes = new Set(Object.keys(CYBER_BONUS_TYPES));
const sourceTypes = new Set(canonicalRules.sourceTypes || []);
const officialSourceTypes = new Set((canonicalRules.sourceTypes || []).filter(type => String(type).startsWith('official-')));
const skillAliases: Record<string, string> = { ...CPRED_SKILL_ALIASES, ...(canonicalRules.skillAliases || {}) };
const invalidSkillLikeFields = canonicalRules.invalidSkillLikeFields || {};
const homebrewReservedItems = new Set(canonicalRules.homebrewLimiarReservedItems || []);
const unvalidatedItems = new Set(canonicalRules.unvalidatedItems || []);
const REDMAS_SOURCE = '12 Days of REDmas';
const REDMAS_CODES = [
  'THERMAL-DAGGER',
  'SMART-GLOVE',
  'HIGH-DENSITY-SHIELD',
  'LIGHT-METALGEAR',
  'NATS-LONG-BARRELED-PISTOL',
  'E-TACK-RAPID-RESPONDER',
  'STUN-BAYONET',
  'FACE-QC',
  'QUICK-DIGITS',
  'SKYDRIVERS',
  'SMART-EARS',
  'CYBERSPINE',
  'CYBER-COND',
  'CYBER-COND-INTEGRATED',
];

function collectCanonicalRefs() {
  const codes = new Set<string>();
  const names = new Set<string>();
  const visitEntry = (name: string, entry: { seedCodes?: string[] } | undefined) => {
    if (name) names.add(String(name).trim().toUpperCase());
    (entry && Array.isArray(entry.seedCodes) ? entry.seedCodes : []).forEach(code => codes.add(String(code).trim().toUpperCase()));
  };
  [
    canonicalRules.cyberwareFoundations,
    canonicalRules.coreRangedWeaponProfiles,
    canonicalRules.coreMeleeWeaponProfiles,
    canonicalRules.coreCyberweaponProfiles,
    canonicalRules.itemEffectCorrections,
  ].forEach(group => {
    Object.entries(group || {}).forEach(([name, entry]) => visitEntry(name, entry));
  });
  Object.entries(canonicalRules.coreCyberwareCatalogCorrections || {}).forEach(([code, entry]) => {
    codes.add(String(code).trim().toUpperCase());
    if (entry && entry.name) names.add(String(entry.name).trim().toUpperCase());
  });
  Object.entries(canonicalRules.coreWeaponCatalogCorrections || {}).forEach(([code, entry]) => {
    codes.add(String(code).trim().toUpperCase());
    if (entry && entry.name) names.add(String(entry.name).trim().toUpperCase());
  });
  Object.entries(canonicalRules.coreArmorCatalogCorrections || {}).forEach(([code, entry]) => {
    codes.add(String(code).trim().toUpperCase());
    if (entry && entry.name) names.add(String(entry.name).trim().toUpperCase());
  });
  Object.entries(canonicalRules.redmasCatalogCorrections || {}).forEach(([code, entry]) => {
    codes.add(String(code).trim().toUpperCase());
    if (entry && entry.name) names.add(String(entry.name).trim().toUpperCase());
  });
  Object.entries(canonicalRules.homebrewLimiarCatalogCorrections || {}).forEach(([code, entry]) => {
    codes.add(String(code).trim().toUpperCase());
    if (entry && entry.name) names.add(String(entry.name).trim().toUpperCase());
  });
  (canonicalRules.homebrewLimiarReservedItems || []).forEach(code => codes.add(String(code).trim().toUpperCase()));
  (canonicalRules.unvalidatedItems || []).forEach(code => codes.add(String(code).trim().toUpperCase()));
  return { codes, names };
}

const canonicalRefs = collectCanonicalRefs();

function canonicalSkill(name: unknown): string {
  const raw = String(name || '').trim();
  return skillAliases[raw] || raw;
}

function keyOf(entry: { code?: string; id?: string; name?: string } | null | undefined): string {
  return String((entry && (entry.code || entry.id || entry.name)) || '').trim();
}

function itemPath(collection: string, index: number, suffix = ''): string {
  return `${collection}[${index}]${suffix}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isEmptyObject(value: unknown): boolean {
  return isPlainObject(value) && Object.keys(value).length === 0;
}

function categoryOf(item: LegacyCatalogItem | null | undefined): string {
  return String((item && (item.cat || item.category || item.chromeCat)) || '').trim().toUpperCase();
}

function isCyberdeckHardware(item: LegacyCatalogItem): boolean {
  const text = [
    item && item.cat,
    item && item.category,
    item && item.type,
    item && item.kind,
    item && item.install,
    item && item.specs && item.specs.size,
  ].join(' ');
  return /\b(deck|cyberdeck|hardware)\b/i.test(text);
}

function isCyberwareItem(item: LegacyCatalogItem): boolean {
  const cat = categoryOf(item);
  if (NON_CYBERWARE_CATEGORIES.has(cat)) return false;
  return CYBERWARE_CATEGORIES.has(cat)
    || /cyber|implant|neural|borg|chrome/i.test([
      item && item.source,
      item && item.install,
      item && item.desc,
      item && item.model,
    ].join(' '));
}

function isWeapon(entry: LegacyCatalogItem): boolean {
  const kind = String((entry && entry.kind) || '').trim().toLowerCase();
  const type = String((entry && entry.type) || '').trim().toLowerCase();
  if (kind === 'weaponattachment' || kind === 'ammunition') return false;
  return kind === 'weapon'
    || type.includes('weapon')
    || !!(entry && entry.weaponProfile)
    || !!(entry && entry.weaponClass)
    || !!(entry && entry.damageScale)
    || !!(entry && entry.damage)
    || !!(entry && entry.dmg)
    || !!(entry && (entry.skill || entry.count || entry.sides));
}

function parseDamage(text: unknown): { count: number; sides: number; mod: number } | null {
  const match = String(text || '').trim().match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!match) return null;
  return {
    count: Number(match[1] || 1),
    sides: Number(match[2]),
    mod: Number(match[3] || 0),
  };
}

function hasDamageProfile(entry: LegacyCatalogItem): boolean {
  if (!entry) return false;
  if (entry.weaponProfile && (entry.weaponProfile as LegacyCatalogItem).container === true) return true;
  if (entry.weaponProfile && parseDamage((entry.weaponProfile as LegacyCatalogItem).damage)) return true;
  if (entry.weaponProfile && (entry.weaponProfile as LegacyCatalogItem).damage === 'dynamic' && Array.isArray((entry.weaponProfile as LegacyCatalogItem).damageScale) && (entry.weaponProfile as LegacyCatalogItem).damageScale!.length) return true;
  if (parseDamage(entry.damage || entry.dmg)) return true;
  if (Array.isArray(entry.damageScale) && entry.damageScale.length) {
    return entry.damageScale.every(row => Number(row.count) > 0 && Number(row.sides) > 0);
  }
  return Number(entry.count) > 0 && Number(entry.sides) > 0;
}

function hasStructuredSlots(item: LegacyCatalogItem): boolean {
  return Object.prototype.hasOwnProperty.call(item || {}, 'slots')
    || Object.prototype.hasOwnProperty.call(item || {}, 'slotCost')
    || Object.prototype.hasOwnProperty.call(item || {}, 'slotCapacity')
    || Object.prototype.hasOwnProperty.call(item || {}, 'cyberdeckHardwareSlotsRequired')
    || Object.prototype.hasOwnProperty.call(item || {}, 'parentSlot')
    || Object.prototype.hasOwnProperty.call(item || {}, 'parentSlots')
    || Object.prototype.hasOwnProperty.call(item || {}, 'optionSlotsProvided')
    || Object.prototype.hasOwnProperty.call(item || {}, 'optionSlotsRequired')
    || Object.prototype.hasOwnProperty.call(item || {}, 'parentType')
    || Object.prototype.hasOwnProperty.call(item || {}, 'allowedParentTypes');
}

function isExoticOrHomebrew(entry: LegacyCatalogItem): boolean {
  const text = [
    entry && entry.exotic,
    entry && entry.homebrew,
    entry && entry.kind,
    entry && entry.type,
    entry && entry.weaponClass,
    entry && entry.source,
    entry && entry.notes,
    entry && entry.rarity,
    entry && entry.flags && JSON.stringify(entry.flags),
  ].join(' ');
  return /\b(exotic|exotica|exotico|exotica|homebrew|gm|custom)\b/i.test(text);
}

function addIssue(issues: AuditIssue[], issue: Omit<AuditIssue, 'id'>): void {
  issues.push({
    id: `${String(issues.length + 1).padStart(4, '0')}-${issue.type}`,
    ...issue,
  });
}

function auditSourceType({ issues, collection, index, item }: AuditCtx): void {
  const sourceType = String((item && item.sourceType) || '').trim();
  if (!sourceType) return;
  const validationIssues = validateItemAgainstCanonical({ code: keyOf(item), sourceType }, canonicalRules);
  if (!sourceTypes.has(sourceType)) {
    addIssue(issues, {
      severity: 'error',
      type: 'source_type_invalid',
      collection,
      path: itemPath(collection, index, '.sourceType'),
      code: keyOf(item),
      name: item.name || '',
      message: `sourceType "${sourceType}" is not permitted by canonical rules.`,
      evidence: { sourceType, permitted: [...sourceTypes], validationIssues },
    });
  }
}

function auditOfficialCanonicalRef({ issues, collection, index, item }: AuditCtx): void {
  const sourceType = String((item && item.sourceType) || '').trim();
  if (!officialSourceTypes.has(sourceType)) return;
  const code = keyOf(item).toUpperCase();
  const name = String((item && item.name) || '').trim().toUpperCase();
  if (code === 'CYBERSPINE' && sourceType === 'official-dlc') return;
  if (canonicalRefs.codes.has(code) || canonicalRefs.names.has(name)) return;
  addIssue(issues, {
    severity: 'warning',
    type: 'official_item_not_in_canonical_rules',
    collection,
    path: itemPath(collection, index),
    code: keyOf(item),
    name: item.name || '',
    message: 'item is marked official but is not present in the canonical rules package.',
    evidence: { sourceType },
  });
}

function auditHomebrewApproval({ issues, collection, index, item }: AuditCtx): void {
  const code = keyOf(item).toUpperCase();
  if (!homebrewReservedItems.has(code)) return;
  if (item.requiresGmApproval === true) return;
  const validationIssues = validateItemAgainstCanonical({ code, sourceType: item.sourceType, requiresGmApproval: item.requiresGmApproval }, canonicalRules);
  addIssue(issues, {
    severity: 'warning',
    type: 'homebrew_missing_gm_approval',
    collection,
    path: itemPath(collection, index),
    code: keyOf(item),
    name: item.name || '',
    message: 'homebrew-limiar reserved item is missing requiresGmApproval: true.',
    evidence: { expectedSourceType: 'homebrew-limiar', requiresGmApproval: item.requiresGmApproval ?? null, validationIssues },
  });
}

function auditUnvalidatedSourceType({ issues, collection, index, item }: AuditCtx): void {
  const code = keyOf(item).toUpperCase();
  const source = String((item && item.source) || '');
  const sourceType = String((item && item.sourceType) || '').trim();
  const expected = unvalidatedItems.has(code)
    || (source === String(canonicalRules.unvalidatedSourceRule && canonicalRules.unvalidatedSourceRule.sourceText || ''));
  if (!expected || !sourceType || sourceType === 'unvalidated' || sourceType === 'homebrew-limiar') return;
  addIssue(issues, {
    severity: 'warning',
    type: 'unvalidated_item_wrong_source_type',
    collection,
    path: itemPath(collection, index, '.sourceType'),
    code: keyOf(item),
    name: item.name || '',
    message: 'item should remain sourceType "unvalidated" until an explicit sourceType is defined.',
    evidence: { source, sourceType },
  });
}

function auditSkillAlias({ issues, collection, index, item, field, key, pathSuffix }: AuditCtx & { field: string; key: string; pathSuffix: string }): void {
  if (!Object.prototype.hasOwnProperty.call(skillAliases, key)) return;
  addIssue(issues, {
    severity: 'warning',
    type: 'invalid_skill_alias',
    collection,
    path: itemPath(collection, index, pathSuffix),
    code: keyOf(item),
    name: item.name || '',
    message: `"${key}" is an alias; use canonical skill "${skillAliases[key]}".`,
    evidence: { field, alias: key, canonical: skillAliases[key] },
  });
}

function auditEffectMap({ issues, collection, index, item, field, allowedKeys, type, label }: AuditCtx & { field: 'skillBonus' | 'statMod'; allowedKeys: Set<string>; type: string; label: string }): void {
  const map = item[field] as unknown;
  if (map == null || map === '' || isEmptyObject(map)) return;
  if (!isPlainObject(map)) {
    addIssue(issues, {
      severity: 'error',
      type,
      collection,
      path: itemPath(collection, index, `.${field}`),
      code: keyOf(item),
      name: item.name || '',
      message: `${label} should be an object map.`,
      evidence: { value: map },
    });
    return;
  }
  Object.keys(map).forEach(key => {
    const canonical = field === 'skillBonus' ? canonicalSkill(key) : String(key || '').trim().toUpperCase();
    if (field === 'skillBonus') {
      auditSkillAlias({ issues, collection, index, item, field, key: String(key).trim(), pathSuffix: `.${field}.${JSON.stringify(key)}` });
    }
    if (allowedKeys.has(canonical)) return;
    const invalidField = invalidSkillLikeFields[key] || null;
    const issueType = invalidField
      ? (field === 'statMod' ? 'fake_stat_name' : 'fake_skill_name')
      : type;
    addIssue(issues, {
      severity: 'error',
      type: issueType,
      collection,
      path: itemPath(collection, index, `.${field}.${JSON.stringify(key)}`),
      code: keyOf(item),
      name: item.name || '',
      message: `${label} references unsupported key "${key}".`,
      evidence: { key, canonical, value: map[key], canonicalAction: invalidField && invalidField.canonicalAction },
    });
  });
}

function auditBonusTypes({ issues, collection, index, item }: AuditCtx): void {
  const bonus = item.bonus;
  if (bonus == null || bonus === '' || isEmptyObject(bonus)) return;
  if (!Array.isArray(bonus)) {
    addIssue(issues, {
      severity: 'error',
      type: 'bonus_type_unsupported',
      collection,
      path: itemPath(collection, index, '.bonus'),
      code: keyOf(item),
      name: item.name || '',
      message: 'bonus should be an array for the current cyberware engine.',
      evidence: { value: bonus },
    });
    return;
  }
  (bonus as { type?: string }[]).forEach((effect, effectIndex) => {
    const type = String((effect && effect.type) || '').trim();
    if (supportedBonusTypes.has(type)) return;
    addIssue(issues, {
      severity: 'error',
      type: 'bonus_type_unsupported',
      collection,
      path: itemPath(collection, index, `.bonus[${effectIndex}].type`),
      code: keyOf(item),
      name: item.name || '',
      message: `bonus.type "${type || '(blank)'}" is not supported by CYBER_BONUS_TYPES.`,
      evidence: { type, supportedTypes: [...supportedBonusTypes].sort() },
    });
  });
}

function auditNormalizedEffects({ issues, collection, index, item }: AuditCtx): void {
  if (!isCyberwareItem(item)) return;
  const normalized = normalizeCyberwareDefinition(item, canonicalRules);
  (normalized.legacyEffects || []).forEach(effect => {
    addIssue(issues, {
      severity: 'info',
      type: effect.type === 'contextualEffect' || effect.type === 'unknown'
        ? 'legacy_bonus_not_applied'
        : 'fake_skill_converted_to_contextual_effect',
      collection,
      path: itemPath(collection, index),
      code: keyOf(item),
      name: item.name || '',
      message: 'Legacy/fake bonus was normalized as a non-automatic structured effect.',
      evidence: { effect },
    });
  });
}

function auditRequirements({ issues, collection, index, item }: AuditCtx): void {
  if (!Object.prototype.hasOwnProperty.call(item, 'requirements')) return;
  const value = item.requirements;
  if (typeof value === 'string' && value.trim()) {
    addIssue(issues, {
      severity: 'warning',
      type: 'requirements_free_text',
      collection,
      path: itemPath(collection, index, '.requirements'),
      code: keyOf(item),
      name: item.name || '',
      message: 'requirements is free text; the engine cannot validate or enforce it structurally.',
      evidence: { requirements: value },
    });
  } else if (value != null && value !== '' && !Array.isArray(value) && !isPlainObject(value)) {
    addIssue(issues, {
      severity: 'error',
      type: 'requirements_free_text',
      collection,
      path: itemPath(collection, index, '.requirements'),
      code: keyOf(item),
      name: item.name || '',
      message: 'requirements has an unsupported non-structured value.',
      evidence: { requirements: value },
    });
  }
}

function auditCyberware({ issues, collection, index, item }: AuditCtx): void {
  if (!isCyberwareItem(item)) return;
  const normalized = normalizeCyberwareDefinition(item, canonicalRules);
  const validationIssues = validateCyberwareDefinition(normalized, canonicalRules);
  const missing: string[] = [];
  if (!String(item.source || '').trim()) missing.push('source');
  if (!String(item.sourceType || '').trim()) missing.push('sourceType');
  if (missing.length) {
    addIssue(issues, {
      severity: missing.includes('source') ? 'error' : 'warning',
      type: 'cyberware_missing_source',
      collection,
      path: itemPath(collection, index),
      code: keyOf(item),
      name: item.name || '',
      message: `cyberware is missing ${missing.join(' and ')} provenance field(s).`,
      evidence: {
        source: item.source || '',
        sourceType: item.sourceType || '',
        cat: item.cat || item.category || '',
        normalized: { sourceType: normalized.sourceType, cyberwareType: normalized.cyberwareType },
        validationIssues,
      },
    });
  }

  const slotText = [item.requirements, item.desc, item.specs && JSON.stringify(item.specs)].join(' ');
  if (/\b(slot|slots|espaco|espacos|espaco|espacos)\b/i.test(slotText) && !hasStructuredSlots(item)) {
    addIssue(issues, {
      severity: 'warning',
      type: 'cyberware_missing_slots',
      collection,
      path: itemPath(collection, index),
      code: keyOf(item),
      name: item.name || '',
      message: 'cyberware mentions slots but has no structured slots, slotCost, or slotCapacity field.',
      evidence: {
        requirements: item.requirements || '',
        desc: item.desc || '',
        normalized: {
          optionSlotsProvided: normalized.optionSlotsProvided ?? null,
          optionSlotsRequired: normalized.optionSlotsRequired ?? null,
          legacyRequirements: normalized.legacyRequirements || '',
        },
      },
    });
  }
  if (
    isCyberdeckHardware(item)
    && Number(item.cyberdeckHardwareSlotsRequired || 0) > 0
    && (Object.prototype.hasOwnProperty.call(item, 'slots') || Object.prototype.hasOwnProperty.call(item, 'optionSlotsRequired'))
  ) {
    addIssue(issues, {
      severity: 'warning',
      type: 'cyberdeck_hardware_uses_body_slots',
      collection,
      path: itemPath(collection, index),
      code: keyOf(item),
      name: item.name || '',
      message: 'Cyberdeck Hardware must not use body cyberware slot fields.',
      evidence: {
        cyberdeckHardwareSlotsRequired: item.cyberdeckHardwareSlotsRequired,
        slots: item.slots ?? null,
        optionSlotsRequired: item.optionSlotsRequired ?? null,
      },
    });
  }

  const req = String(item.requirements || '').trim();
  if (/\b(dois|duas|two|pair|paread[oa]s?)\b/i.test(req)) {
    addIssue(issues, {
      severity: 'warning',
      type: 'paired_cyberware_dedup_risk',
      collection,
      path: itemPath(collection, index, '.requirements'),
      code: keyOf(item),
      name: item.name || '',
      message: 'paired cyberware requirement can be blocked by installed cyberware deduplication by code.',
      evidence: { requirements: req, normalizedRequirements: normalized.requires || [] },
    });
  }

  if (/\b(Cybereye|Cyberaudio Suite|Cyberarm|Cyberleg)\b/i.test(req) && !hasStructuredSlots(item)) {
    addIssue(issues, {
      severity: 'warning',
      type: 'cyberware_option_missing_parent_slot',
      collection,
      path: itemPath(collection, index, '.requirements'),
      code: keyOf(item),
      name: item.name || '',
      message: 'cyberware option names a parent install but has no structured parent slot or slot cost.',
      evidence: { requirements: req, normalizedRequirements: normalized.requires || [] },
    });
  }
}

function auditWeapon({ issues, collection, index, item }: AuditCtx): void {
  if (!isWeapon(item)) return;
  const normalized = normalizeWeaponDefinition(item, canonicalRules);
  const validationIssues = validateWeaponDefinition(normalized, canonicalRules);
  const itemProfile: LegacyCatalogItem = (item.weaponProfile as LegacyCatalogItem) || {};
  const profileContainer = itemProfile.container === true;
  const skill = canonicalSkill(item.skill || item.weaponSkill || itemProfile.weaponSkill);
  if (item.skill) {
    auditSkillAlias({ issues, collection, index, item, field: 'skill', key: String(item.skill).trim(), pathSuffix: '.skill' });
  }
  const missing: string[] = [];
  if (!hasDamageProfile(item)) missing.push('damage');
  if (!profileContainer && item.rof == null && itemProfile.rof == null) missing.push('rof');
  const melee = /melee|brawling|martial/i.test([item.type, item.weaponClass, skill].join(' '));
  const hasMagazineField = Object.prototype.hasOwnProperty.call(item, 'magazine')
    || Object.prototype.hasOwnProperty.call(item, 'mag')
    || Object.prototype.hasOwnProperty.call(itemProfile, 'magazine');
  if (!profileContainer && !melee && !hasMagazineField) missing.push('magazine');
  if (!profileContainer && (!skill || !skillNames.has(skill))) missing.push('skill');
  if (missing.length) {
    addIssue(issues, {
      severity: 'error',
      type: 'weapon_missing_profile',
      collection,
      path: itemPath(collection, index),
      code: keyOf(item),
      name: item.name || '',
      message: `weapon is missing required profile field(s): ${missing.join(', ')}.`,
      evidence: {
        damage: item.damage || item.dmg || '',
        count: item.count ?? null,
        sides: item.sides ?? null,
        damageScale: item.damageScale || null,
        rof: item.rof ?? itemProfile.rof ?? null,
        magazine: item.magazine ?? item.mag ?? itemProfile.magazine ?? null,
        skill: item.skill ?? item.weaponSkill ?? itemProfile.weaponSkill ?? null,
        normalized,
        validationIssues,
      },
    });
  }
  if (isCyberwareItem(item) && !profileContainer && item.rof == null && itemProfile.rof == null) {
    addIssue(issues, {
      severity: 'error',
      type: 'cyberweapon_missing_rof',
      collection,
      path: itemPath(collection, index, '.rof'),
      code: keyOf(item),
      name: item.name || '',
      message: 'cyberweapon is missing ROF required by the canonical cyberweapon profile checks.',
      evidence: { weaponClass: item.weaponClass || '', skill: item.skill ?? null, normalized, validationIssues },
    });
  }
}

function effectValues(item: LegacyCatalogItem, type: string): Record<string, unknown>[] {
  return (Array.isArray(item.effects) ? item.effects : [])
    .filter(effect => effect && effect.type === type)
    .map(effect => (effect.value as Record<string, unknown>) || {});
}

function auditHomebrewLimiarCatalog({ issues, collection, index, item }: AuditCtx): void {
  const code = keyOf(item).toUpperCase();
  if (!homebrewReservedItems.has(code)) return;
  if (item.sourceType !== 'homebrew-limiar') return;
  const weaponProfile: LegacyCatalogItem = (item.weaponProfile as LegacyCatalogItem) || {};
  const specialRules = [
    ...(Array.isArray(item.specialRules) ? item.specialRules : []),
    ...(Array.isArray(weaponProfile.specialRules) ? weaponProfile.specialRules : []),
  ].map(rule => String(rule || '').toLowerCase());

  if (!Array.isArray(item.balanceNotes) || !item.balanceNotes.length) {
    addIssue(issues, {
      severity: 'warning',
      type: 'homebrew_weapon_missing_balance_notes',
      collection,
      path: itemPath(collection, index, '.balanceNotes'),
      code,
      name: item.name || '',
      message: 'homebrew-limiar item needs explicit balanceNotes.',
    });
  }
  if (item.requiresGmApproval !== true) {
    addIssue(issues, {
      severity: 'warning',
      type: 'homebrew_missing_gm_approval',
      collection,
      path: itemPath(collection, index, '.requiresGmApproval'),
      code,
      name: item.name || '',
      message: 'homebrew-limiar item requires requiresGmApproval: true.',
    });
  }
  if (weaponProfile.damage && !Array.isArray(item.balanceNotes)) {
    addIssue(issues, {
      severity: 'warning',
      type: 'homebrew_weapon_damage_unbalanced_without_rule',
      collection,
      path: itemPath(collection, index, '.balanceNotes'),
      code,
      name: item.name || '',
      message: 'homebrew-limiar weapon damage needs balance notes.',
      evidence: { damage: weaponProfile.damage },
    });
  }
  const hasArmorBypassRule = specialRules.some(rule => (
    /ignore.*armor|armor.*ignore|bypass.*armor/i.test(rule)
    && !/does not ignore|do not ignore|not ignore|doesn't ignore/i.test(rule)
  ));
  if (code === 'MANTIS-BLADE' && (item.ignoresArmor === true || weaponProfile.ignoresArmor === true || hasArmorBypassRule)) {
    addIssue(issues, {
      severity: 'error',
      type: 'mantis_armor_ignore_invalid',
      collection,
      path: itemPath(collection, index, '.weaponProfile.specialRules'),
      code,
      name: item.name || '',
      message: 'Mantis Blade must not ignore full armor by default.',
    });
  }
  if (code === 'MONOWIRE' && Number(weaponProfile.rof) !== 1) {
    addIssue(issues, {
      severity: 'error',
      type: 'monowire_rof_invalid',
      collection,
      path: itemPath(collection, index, '.weaponProfile.rof'),
      code,
      name: item.name || '',
      message: 'Monowire must be ROF 1.',
      evidence: { rof: weaponProfile.rof ?? null },
    });
  }
  if (code === 'GORILLA-ARMS') {
    const statBody = item.statMod && Object.prototype.hasOwnProperty.call(item.statMod, 'BODY');
    const realBodyEffect = effectValues(item, 'statModifier').some(value => (value.stat === 'BODY' || value.appliesTo === 'BODY' || value.realBody === true));
    if (statBody || realBodyEffect) {
      addIssue(issues, {
        severity: 'error',
        type: 'gorilla_arms_real_body_modifier_invalid',
        collection,
        path: itemPath(collection, index),
        code,
        name: item.name || '',
        message: 'Gorilla Arms must not alter real BODY.',
      });
    }
  }
  if (code === 'COMBAT-TAIL') {
    const grantsExtraAction = effectValues(item, 'cyberweapon').some(value => value.grantsExtraAction === true);
    if (grantsExtraAction) {
      addIssue(issues, {
        severity: 'error',
        type: 'combat_tail_extra_action_invalid',
        collection,
        path: itemPath(collection, index, '.effects'),
        code,
        name: item.name || '',
        message: 'Combat Tail must not grant an extra action.',
      });
    }
  }
}

function auditGearWeaponRedPattern({ issues, collection, index, item }: AuditCtx): void {
  if (collection !== 'gear' || !isWeapon(item)) return;
  const parsed = parseDamage(item.damage || item.dmg);
  if (!parsed) return;
  const outsidePattern = parsed.sides !== 6 || parsed.mod !== 0 || !RED_DAMAGE_DICE.has(parsed.count);
  if (!outsidePattern || isExoticOrHomebrew(item)) return;
  addIssue(issues, {
    severity: 'warning',
    type: 'gear_weapon_non_red_damage',
    collection,
    path: itemPath(collection, index, item.damage ? '.damage' : '.dmg'),
    code: keyOf(item),
    name: item.name || '',
    message: 'gear weapon damage is outside the standard RED Nd6 pattern and is not marked exotic/homebrew.',
    evidence: { damage: item.damage || item.dmg, parsed },
  });
}

function auditCriticalInjuryTables({ issues }: { issues: AuditIssue[] }): void {
  Object.entries(canonicalRules.criticalInjuryTables || {}).forEach(([table, rows]) => {
    const seen = new Set<unknown>();
    (rows || []).forEach((row, index) => {
      if (row.roll === undefined || row.roll === null) {
        addIssue(issues, {
          severity: 'error',
          type: 'critical_table_missing_roll',
          collection: 'canonical',
          path: `criticalInjuryTables.${table}[${index}]`,
          code: (row.id as string) || '',
          name: (row.name as string) || '',
          message: 'Critical Injury table row is missing roll.',
        });
      }
      if (seen.has(row.roll)) {
        addIssue(issues, {
          severity: 'error',
          type: 'critical_table_duplicate_roll',
          collection: 'canonical',
          path: `criticalInjuryTables.${table}[${index}].roll`,
          code: (row.id as string) || '',
          name: (row.name as string) || '',
          message: 'Critical Injury table has duplicate roll.',
          evidence: { table, roll: row.roll },
        });
      }
      seen.add(row.roll);
      if (!row.id) {
        addIssue(issues, {
          severity: 'error',
          type: 'critical_injury_unknown_id',
          collection: 'canonical',
          path: `criticalInjuryTables.${table}[${index}].id`,
          code: '',
          name: (row.name as string) || '',
          message: 'Critical Injury row is missing id.',
        });
      }
      if (row.baseDeathSavePenaltyDelta === undefined) {
        addIssue(issues, {
          severity: 'error',
          type: 'critical_injury_missing_bonus_rule',
          collection: 'canonical',
          path: `criticalInjuryTables.${table}[${index}].baseDeathSavePenaltyDelta`,
          code: (row.id as string) || '',
          name: (row.name as string) || '',
          message: 'Critical Injury row is missing baseDeathSavePenaltyDelta.',
        });
      }
    });
  });
}

function auditCyberspine({ issues, seed }: { issues: AuditIssue[]; seed: LegacySeed }): void {
  const item = (seed.items || []).find(row => row.code === 'CYBERSPINE');
  if (!item) return;
  const effects = Array.isArray(item.effects) ? item.effects : [];
  const spinal = effects.find(effect => effect.type === 'criticalInjuryImmunity' && ((effect.value as { injuryIds?: string[] })?.injuryIds || []).includes('BODY-10-SPINAL-INJURY'));
  if (!spinal || (spinal.value as { blocksBonusDamage?: boolean })?.blocksBonusDamage !== true) {
    addIssue(issues, {
      severity: 'error',
      type: 'cyberspine_missing_spinal_immunity',
      collection: 'items',
      path: 'items[CYBERSPINE].effects',
      code: 'CYBERSPINE',
      name: item.name || '',
      message: 'CYBERSPINE must block BODY-10-SPINAL-INJURY and its bonus damage.',
    });
  }
  const emp = effects.find(effect => effect.type === 'empProtection');
  if (emp && (emp.value as { globalEmpImmunity?: boolean })?.globalEmpImmunity === true) {
    addIssue(issues, {
      severity: 'error',
      type: 'cyberspine_global_emp_invalid',
      collection: 'items',
      path: 'items[CYBERSPINE].effects',
      code: 'CYBERSPINE',
      name: item.name || '',
      message: 'CYBERSPINE EMP protection must not grant global EMP immunity.',
    });
  }
}

function findCatalogEntry(seed: LegacySeed, code: string): { collection: string; index: number; item: LegacyCatalogItem } | null {
  const itemIndex = (seed.items || []).findIndex(row => keyOf(row).toUpperCase() === code);
  if (itemIndex >= 0) return { collection: 'items', index: itemIndex, item: seed.items![itemIndex] };
  const gearIndex = (seed.gear || []).findIndex(row => keyOf(row).toUpperCase() === code);
  if (gearIndex >= 0) return { collection: 'gear', index: gearIndex, item: seed.gear![gearIndex] };
  return null;
}

function hasEffect(item: LegacyCatalogItem, predicate: (effect: { type?: string; value?: unknown }) => boolean): boolean {
  return (Array.isArray(item && item.effects) ? item.effects! : []).some(predicate);
}

function addRedmasIssue(issues: AuditIssue[], entry: { collection: string; index: number; item: LegacyCatalogItem } | null, type: string, message: string, evidence: Record<string, unknown> = {}): void {
  addIssue(issues, {
    severity: 'error',
    type,
    collection: entry?.collection || 'catalog',
    path: entry ? itemPath(entry.collection, entry.index) : 'redmasCatalogCorrections',
    code: keyOf(entry?.item || (evidence as { code?: string })).toUpperCase(),
    name: entry?.item?.name || '',
    message,
    evidence,
  });
}

function auditRedmasCatalog({ issues, seed }: { issues: AuditIssue[]; seed: LegacySeed }): void {
  REDMAS_CODES.forEach(code => {
    const entry = findCatalogEntry(seed, code);
    if (!entry) {
      addRedmasIssue(issues, null, 'redmas_item_missing', 'REDmas catalog item is missing from seed catalog.', { code });
      return;
    }
    const { item } = entry;
    if (String(item.source || '').trim() !== REDMAS_SOURCE) {
      addRedmasIssue(issues, entry, 'redmas_item_missing_source', 'REDmas item must use the 12 Days of REDmas source.', { expected: REDMAS_SOURCE, actual: item.source || '' });
    }
    if (String(item.sourceType || '').trim() !== 'official-dlc') {
      addRedmasIssue(issues, entry, 'redmas_item_wrong_source_type', 'REDmas item must use sourceType official-dlc.', { expected: 'official-dlc', actual: item.sourceType || '' });
    }
    if (item.requiresGmApproval !== false) {
      addRedmasIssue(issues, entry, 'redmas_item_wrong_gm_approval', 'Official REDmas item must not require GM approval.', { actual: item.requiresGmApproval ?? null });
    }
  });

  const quickDigits = findCatalogEntry(seed, 'QUICK-DIGITS');
  if (quickDigits) {
    const effect = (quickDigits.item.effects || []).find(row => row.type === 'conditionalSkillBonus');
    if (!quickDigits.item.permitsMultiple || !effect || effect.stackingRule !== 'requiresMultipleInstances' || Number(effect.value) !== 1) {
      addRedmasIssue(issues, quickDigits, 'redmas_quick_digits_missing_multi_instance_bonus', 'Quick Digits must model the +1 bonus as a non-stacking multi-instance conditional bonus.', { effect: effect || null });
    }
    const fakeLanguage = Object.keys(quickDigits.item.skillBonus || {}).some(key => /Language/i.test(key));
    if (fakeLanguage) {
      addRedmasIssue(issues, quickDigits, 'redmas_quick_digits_fake_language_skill', 'Quick Digits must not encode Language (Sign) as a fake skill bonus.', { skillBonus: quickDigits.item.skillBonus });
    }
  }

  const skydrivers = findCatalogEntry(seed, 'SKYDRIVERS');
  if (skydrivers) {
    const pairedRequirement = (skydrivers.item.requires || []).some(row => typeof row === 'object' && row.type === 'requiredPairedLocation' && row.parentType === 'cyberleg' && Number(row.count) === 2);
    const hasDamageVsCover = hasEffect(skydrivers.item, effect => effect.type === 'damageVsCover' && (effect.value as { bonusDamage?: string })?.bonusDamage === '3d6');
    if (skydrivers.item.paired !== true || !pairedRequirement || !hasDamageVsCover) {
      addRedmasIssue(issues, skydrivers, 'redmas_skydrivers_missing_pairing', 'Skydrivers must be a paired cyberleg item with the 3d6 cover-damage rule.', { paired: skydrivers.item.paired, requires: skydrivers.item.requires || [], effects: skydrivers.item.effects || [] });
    }
  }

  ['CYBER-COND', 'CYBER-COND-INTEGRATED'].forEach(code => {
    const entry = findCatalogEntry(seed, code);
    if (entry && Number(entry.item.cyberdeckSlotsProvided) !== 3) {
      addRedmasIssue(issues, entry, 'redmas_cyberconductor_missing_deck_slots', 'CyberConductor variants must provide exactly 3 cyberdeck slots.', { cyberdeckSlotsProvided: entry.item.cyberdeckSlotsProvided ?? null });
    }
  });

  const smartEars = findCatalogEntry(seed, 'SMART-EARS');
  if (smartEars && (Number(smartEars.item.optionSlotsProvided) !== 2 || !(smartEars.item.builtIn || []).includes('RADIO-SCAN-MUSIC'))) {
    addRedmasIssue(issues, smartEars, 'redmas_smart_ears_missing_container_slots', 'Smart Ears must provide 2 Cyberaudio option slots and built-in Radio Scanner/Music Player.', { optionSlotsProvided: smartEars.item.optionSlotsProvided ?? null, builtIn: smartEars.item.builtIn || [] });
  }

  const smartGlove = findCatalogEntry(seed, 'SMART-GLOVE');
  if (smartGlove && (Number(smartGlove.item.optionSlotsProvided) !== 2 || !(smartGlove.item.builtIn || []).includes('Subdermal Grip'))) {
    addRedmasIssue(issues, smartGlove, 'redmas_smart_glove_missing_builtin_subdermal_grip', 'Smart Glove must provide 2 option slots and built-in Subdermal Grip.', { optionSlotsProvided: smartGlove.item.optionSlotsProvided ?? null, builtIn: smartGlove.item.builtIn || [] });
  }

  const metalgear = findCatalogEntry(seed, 'LIGHT-METALGEAR');
  if (metalgear) {
    const armor = metalgear.item.armor;
    const penalty = armor?.armorPenalty || {};
    if (armor?.headSP !== 16 || armor?.bodySP !== 16 || penalty.REF !== -3 || penalty.DEX !== -3 || penalty.MOVE !== -3) {
      addRedmasIssue(issues, metalgear, 'redmas_light_metalgear_missing_penalty', 'Light Metalgear must be SP 16 and apply -3 to REF, DEX, and MOVE.', { armor: armor || null });
    }
  }

  const rapidResponder = findCatalogEntry(seed, 'E-TACK-RAPID-RESPONDER');
  if (rapidResponder) {
    const burst = (rapidResponder.item.weaponModes || []).find(row => row.mode === 'burst');
    if (!burst || burst.damage !== '3d6' || Number(burst.ammoCost) !== 3 || !(rapidResponder.item.installedAttachments || []).includes('STUN-BAYONET')) {
      addRedmasIssue(issues, rapidResponder, 'redmas_rapid_responder_missing_burst_mode', 'E-TACK Rapid Responder must include burst mode, 3 ammo cost, and built-in Stun Bayonet.', { burst: burst || null, installedAttachments: rapidResponder.item.installedAttachments || [] });
    }
  }

  const thermalDagger = findCatalogEntry(seed, 'THERMAL-DAGGER');
  if (thermalDagger && !hasEffect(thermalDagger.item, effect => /Strongly On Fire/i.test(String(effect.value || '')))) {
    addRedmasIssue(issues, thermalDagger, 'redmas_thermal_dagger_missing_fire_effect', 'Thermal Dagger must mark Strongly On Fire on hit.', { effects: thermalDagger.item.effects || [] });
  }
}

const MASTER_ARMOR_LIST = [
  { code: 'LEATHERS', headSP: 4, bodySP: 4, penalty: 0, cost: 20 },
  { code: 'KEVLAR', headSP: 7, bodySP: 7, penalty: 0, cost: 50 },
  { code: 'LIGHT-ARMORJACK', headSP: 11, bodySP: 11, penalty: 0, cost: 100 },
  { code: 'BODYWEIGHT-SUIT', headSP: 11, bodySP: 11, penalty: 0, cost: 1000 },
  { code: 'MEDIUM-ARMORJACK', headSP: 12, bodySP: 12, penalty: 2, cost: 100 },
  { code: 'HEAVY-ARMORJACK', headSP: 13, bodySP: 13, penalty: 2, cost: 500 },
  { code: 'FLAK', headSP: 15, bodySP: 15, penalty: 4, cost: 500 },
  { code: 'LIGHT-METALGEAR', headSP: 16, bodySP: 16, penalty: 3, cost: 1000 },
  { code: 'METALGEAR', headSP: 18, bodySP: 18, penalty: 4, cost: 5000 },
];

function auditMasterArmorList({ issues, seed }: { issues: AuditIssue[]; seed: LegacySeed }): void {
  MASTER_ARMOR_LIST.forEach(row => {
    const entry = findCatalogEntry(seed, row.code);
    if (!entry) {
      addIssue(issues, {
        severity: 'error',
        type: 'core_armor_missing',
        collection: 'catalog',
        path: 'masterArmorList',
        code: row.code,
        name: '',
        message: `Master Armor List item ${row.code} is missing from seed catalog.`,
        evidence: { code: row.code },
      });
      return;
    }
    const armor = entry.item.armor || {};
    const penalty = armor.armorPenalty || {};
    const cost = entry.item.cost ?? entry.item.price ?? null;
    const penaltyOk = ([penalty.REF, penalty.DEX, penalty.MOVE] as (number | undefined)[])
      .every(v => Number(v) === -row.penalty);
    if (armor.headSP !== row.headSP || armor.bodySP !== row.bodySP || !penaltyOk || Number(cost) !== row.cost) {
      addIssue(issues, {
        severity: 'error',
        type: 'core_armor_master_list_mismatch',
        collection: entry.collection,
        path: itemPath(entry.collection, entry.index),
        code: row.code,
        name: entry.item.name || '',
        message: `Master Armor List entry ${row.code} must be SP ${row.headSP}/${row.bodySP}, penalty -${row.penalty} to REF/DEX/MOVE, cost ${row.cost}eb.`,
        evidence: { expected: row, armor, cost },
      });
    }
  });

  const shield = findCatalogEntry(seed, 'BULLETPROOF-SHIELD');
  if (!shield) {
    addIssue(issues, {
      severity: 'error',
      type: 'core_armor_missing',
      collection: 'catalog',
      path: 'masterArmorList',
      code: 'BULLETPROOF-SHIELD',
      name: '',
      message: 'Bulletproof Shield is missing from seed catalog.',
      evidence: { code: 'BULLETPROOF-SHIELD' },
    });
  } else if (Number(shield.item.shieldHp) !== 10 || Number(shield.item.maxHp) !== 10) {
    addIssue(issues, {
      severity: 'error',
      type: 'core_armor_master_list_mismatch',
      collection: shield.collection,
      path: itemPath(shield.collection, shield.index),
      code: 'BULLETPROOF-SHIELD',
      name: shield.item.name || '',
      message: 'Bulletproof Shield must be modeled with 10 HP (not SP).',
      evidence: { shieldHp: shield.item.shieldHp ?? null, maxHp: shield.item.maxHp ?? null },
    });
  }
}

function manualChoiceKey(character: LegacyCharacter, issue: AuditIssue): string {
  const detail = (issue.evidence as Record<string, unknown>) || {};
  const instanceId = detail.instanceId || (detail.migrationMetadata as { instanceId?: string })?.instanceId || '';
  return [
    character.id || '',
    instanceId || (detail.manualChoice as { instanceId?: string })?.instanceId || issue.code || '',
    issue.code || '',
  ].join('::');
}

interface ManualChoiceEntry {
  characterId: string;
  characterName: string;
  itemCode?: string;
  instanceId: string | null;
  issueIds: string[];
  issueTypes: string[];
  originalIssueTypes: string[];
  suggestedParent: unknown;
  suggestedLocation: unknown;
  reason: string;
  path: string;
  details: Record<string, unknown>[];
}

function mergeManualChoiceEntry(entry: ManualChoiceEntry, issue: AuditIssue): ManualChoiceEntry {
  const detail = (issue.evidence as Record<string, unknown>) || {};
  const manual = (detail.manualChoice as Record<string, unknown>) || {};
  const metadata = (detail.migrationMetadata as Record<string, unknown>) || {};
  const issueIds = new Set(entry.issueIds || []);
  const issueTypes = new Set(entry.issueTypes || []);
  const originalIssueTypes = new Set(entry.originalIssueTypes || []);
  ((manual.issueIds as string[]) || (metadata.triageIssueIds as string[]) || []).forEach(id => issueIds.add(id));
  ((metadata.triageIssueTypes as string[]) || []).forEach(type => issueTypes.add(type));
  if (detail.originalIssueType) originalIssueTypes.add(detail.originalIssueType as string);
  return {
    ...entry,
    issueIds: [...issueIds],
    issueTypes: [...issueTypes],
    originalIssueTypes: [...originalIssueTypes],
    suggestedParent: entry.suggestedParent ?? manual.suggestedParent ?? null,
    suggestedLocation: entry.suggestedLocation ?? manual.suggestedLocation ?? null,
    reason: entry.reason || (manual.reason as string) || '',
    details: [...(entry.details || []), detail],
  };
}

function auditCharacter({ issues, manualChoices, collection, index, character, catalog }: {
  issues: AuditIssue[];
  manualChoices: Record<string, unknown>[];
  collection: string;
  index: number;
  character: LegacyCharacter;
  catalog: LegacyCatalogItem[];
}): void {
  const base = character.base || {};
  Object.keys(base).forEach(stat => {
    if (officialStats.has(stat)) return;
    addIssue(issues, {
      severity: 'error',
      type: 'character_unknown_stat',
      collection,
      path: itemPath(collection, index, `.base.${JSON.stringify(stat)}`),
      code: character.id || '',
      name: character.name || '',
      message: `character base stat "${stat}" is not an official stat.`,
      evidence: { stat, value: base[stat] },
    });
  });

  const codeSources: [string, (string | undefined)[]][] = [
    ['equipped', Array.isArray(character.equipped) ? character.equipped.map(item => item && item.code) : []],
    ['owned', Array.isArray(character.owned) ? character.owned.map(item => (typeof item === 'string' ? item : item && item.code)) : []],
  ];
  codeSources.forEach(([field, codes]) => {
    const counts = new Map<string, number>();
    codes.filter(Boolean).forEach(code => counts.set(code as string, (counts.get(code as string) || 0) + 1));
    counts.forEach((count, code) => {
      if (count <= 1) return;
      addIssue(issues, {
        severity: 'warning',
        type: 'character_duplicate_code_dedup_risk',
        collection,
        path: itemPath(collection, index, `.${field}`),
        code: character.id || '',
        name: character.name || '',
        message: `${field} contains duplicate code "${code}", which normalizeEquipped/equippedCodes may collapse.`,
        evidence: { itemCode: code, count },
      });
    });
  });

  const installReport = validateInstalledCyberwareSet(character, catalog, canonicalRules);
  const effectReport = resolveItemEffects({
    character,
    instances: installReport.instances,
    catalog,
    canonicalRules,
    context: { instances: installReport.instances, canonicalRules },
  });
  const groupedManualChoices = new Map<string, ManualChoiceEntry>();
  installReport.errors.concat(installReport.warnings, installReport.info).forEach(issue => {
    if (issue.type === 'manual_choice_required') {
      const detail = (issue.evidence as Record<string, unknown>) || {};
      const key = manualChoiceKey(character, issue);
      const manual = (detail.manualChoice as { suggestedParent?: unknown; suggestedLocation?: unknown; reason?: string }) || {};
      const existing: ManualChoiceEntry = groupedManualChoices.get(key) || {
        characterId: character.id || '',
        characterName: character.name || '',
        itemCode: issue.code,
        instanceId: (detail.instanceId as string) || null,
        issueIds: [],
        issueTypes: [],
        originalIssueTypes: [],
        suggestedParent: manual.suggestedParent ?? null,
        suggestedLocation: manual.suggestedLocation ?? null,
        reason: manual.reason || '',
        path: itemPath(collection, index, '.equipped'),
        details: [],
      };
      groupedManualChoices.set(key, mergeManualChoiceEntry(existing, issue));
      return;
    }
    addIssue(issues, {
      severity: issue.severity,
      type: 'installed_' + issue.type,
      collection,
      path: itemPath(collection, index, '.equipped'),
      code: character.id || '',
      name: character.name || '',
      message: issue.message,
      evidence: { itemCode: issue.code, ...(issue.evidence ? { detail: issue.evidence } : {}) },
    });
  });
  groupedManualChoices.forEach(entry => {
    const evidence = {
      manualChoice: {
        issueIds: entry.issueIds,
        issueTypes: entry.issueTypes,
        originalIssueTypes: entry.originalIssueTypes,
        suggestedParent: entry.suggestedParent,
        suggestedLocation: entry.suggestedLocation,
        reason: entry.reason,
      },
      characterId: entry.characterId,
      characterName: entry.characterName,
      itemCode: entry.itemCode,
      instanceId: entry.instanceId,
    };
    manualChoices.push({ ...evidence.manualChoice, characterId: entry.characterId, characterName: entry.characterName, itemCode: entry.itemCode, instanceId: entry.instanceId });
    addIssue(issues, {
      severity: 'info',
      type: 'installed_manual_choice_required',
      collection,
      path: entry.path,
      code: entry.characterId,
      name: entry.characterName,
      message: 'Installed cyberware has a pending manual migration choice.',
      evidence,
    });
  });
  effectReport.issues.forEach(issue => {
    addIssue(issues, {
      severity: issue.severity,
      type: 'effect_' + issue.type,
      collection,
      path: itemPath(collection, index, '.equipped'),
      code: character.id || '',
      name: character.name || '',
      message: issue.message,
      evidence: { itemCode: issue.code, ...(issue.evidence ? { detail: issue.evidence } : {}) },
    });
  });
}

function summarize(issues: AuditIssue[], seed: LegacySeed) {
  const countBy = (keyFn: (issue: AuditIssue) => string) => issues.reduce((acc: Record<string, number>, issue) => {
    const key = keyFn(issue);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const manualChoiceCount = issues.filter(issue => issue.type === 'installed_manual_choice_required').length;
  const infoNoiseCount = issues.filter(issue => issue.severity === 'info' && issue.type !== 'installed_manual_choice_required').length;
  return {
    collections: {
      items: (seed.items || []).length,
      gear: (seed.gear || []).length,
      characters: (seed.characters || []).length,
    },
    issues: issues.length,
    issueClasses: {
      trueIssues: issues.length - manualChoiceCount - infoNoiseCount,
      manualChoices: manualChoiceCount,
      infoNoise: infoNoiseCount,
    },
    bySeverity: countBy(issue => issue.severity),
    byType: countBy(issue => issue.type),
    byCollection: countBy(issue => issue.collection || ''),
  };
}

function run(seed: LegacySeed, options: { generatedAt?: string; source?: string; canonicalRulesPath?: string; reportPath?: string } = {}, now: string = new Date().toISOString()) {
  const generatedAt = options.generatedAt || now;
  const source = options.source || 'data/seed/limiar-seed.json';
  const canonicalRulesPath = options.canonicalRulesPath || 'data/canonical/cpr-canonical-rules.json';
  const reportPath = options.reportPath || 'data/audit/limiar-catalog-audit.json';
  const issues: AuditIssue[] = [];
  const manualChoices: Record<string, unknown>[] = [];

  (seed.items || []).forEach((item, index) => {
    auditSourceType({ issues, collection: 'items', index, item });
    auditOfficialCanonicalRef({ issues, collection: 'items', index, item });
    auditHomebrewApproval({ issues, collection: 'items', index, item });
    auditUnvalidatedSourceType({ issues, collection: 'items', index, item });
    auditRequirements({ issues, collection: 'items', index, item });
    auditEffectMap({
      issues,
      collection: 'items',
      index,
      item,
      field: 'skillBonus',
      allowedKeys: skillNames,
      type: 'skill_bonus_unknown_skill',
      label: 'skillBonus',
    });
    auditEffectMap({
      issues,
      collection: 'items',
      index,
      item,
      field: 'statMod',
      allowedKeys: officialStats,
      type: 'stat_mod_unknown_stat',
      label: 'statMod',
    });
    auditBonusTypes({ issues, collection: 'items', index, item });
    auditNormalizedEffects({ issues, collection: 'items', index, item });
    auditCyberware({ issues, collection: 'items', index, item });
    auditWeapon({ issues, collection: 'items', index, item });
    auditHomebrewLimiarCatalog({ issues, collection: 'items', index, item });
  });

  (seed.gear || []).forEach((item, index) => {
    auditSourceType({ issues, collection: 'gear', index, item });
    auditOfficialCanonicalRef({ issues, collection: 'gear', index, item });
    auditWeapon({ issues, collection: 'gear', index, item });
    auditGearWeaponRedPattern({ issues, collection: 'gear', index, item });
  });

  (seed.characters || []).forEach((character, index) => {
    auditCharacter({ issues, manualChoices, collection: 'characters', index, character, catalog: seed.items || [] });
  });

  auditCriticalInjuryTables({ issues });
  auditCyberspine({ issues, seed });
  auditRedmasCatalog({ issues, seed });
  auditMasterArmorList({ issues, seed });

  const report = {
    generatedAt,
    source,
    canonicalRules: canonicalRulesPath,
    report: reportPath,
    engineReferences: {
      stats: [...officialStats],
      skills: [...skillNames].sort(),
      bonusTypes: [...supportedBonusTypes].sort(),
      sourceTypes: [...sourceTypes],
      skillAliases,
      invalidSkillLikeFields: Object.keys(invalidSkillLikeFields).sort(),
      canonicalItemCodes: [...canonicalRefs.codes].sort(),
    },
    totals: summarize(issues, seed),
    manualChoices: {
      count: manualChoices.length,
      entries: manualChoices,
    },
    issues,
  };

  return report;
}

return { run };
}

export interface RunCatalogAuditOptions {
  seed: LegacySeed;
  canonicalRules: CanonicalRules;
  generatedAt?: string;
  source?: string;
  canonicalRulesPath?: string;
  reportPath?: string;
}

export function runCatalogAudit({ seed, canonicalRules, generatedAt, source, canonicalRulesPath, reportPath }: RunCatalogAuditOptions) {
  if (!seed || typeof seed !== 'object') throw new TypeError('runCatalogAudit requires a seed object.');
  if (!canonicalRules || typeof canonicalRules !== 'object') throw new TypeError('runCatalogAudit requires a canonicalRules object.');
  return createCatalogAuditEngine(canonicalRules).run(seed, {
    generatedAt,
    source,
    canonicalRulesPath,
    reportPath,
  });
}
