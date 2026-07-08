import { validationIssue } from './itemTypes.ts';
import type { ValidationIssue } from './itemTypes.ts';
import { normalizeSkillName, parseDamageString } from './itemNormalizers.ts';
import { ITEM_EFFECT_TYPES, STACKING_RULES } from './itemEffectTypes.ts';
import type { WeaponDefinition } from './weaponTypes.ts';
import type { CyberwareDefinition } from './cyberwareTypes.ts';
import type { InstalledCyberwareInstance } from './installedCyberwareTypes.ts';
import type { CanonicalRules } from './canonicalRulesTypes.ts';
import type { LegacyCatalogItem } from './legacyCatalogTypes.ts';

const officialStats = (rules: CanonicalRules) => new Set(rules.officialStats || []);
const sourceTypes = (rules: CanonicalRules) => new Set(rules.sourceTypes || []);
const weaponQualities = (rules: CanonicalRules) => new Set(rules.weaponQualities || ['poor', 'standard', 'excellent']);
const skillNames = (rules: CanonicalRules & { skills?: string[] }) => new Set((rules.skills || []).concat([
  'Concentration', 'Conceal/Reveal Object', 'Lip Reading', 'Perception', 'Tracking',
  'Athletics', 'Contortionist', 'Dance', 'Endurance', 'Resist Torture/Drugs', 'Stealth',
  'Drive Land Vehicle', 'Pilot Air Vehicle', 'Pilot Sea Vehicle', 'Riding', 'Accounting',
  'Animal Handling', 'Bureaucracy', 'Business', 'Composition', 'Criminology', 'Cryptography',
  'Deduction', 'Education', 'Gamble', 'Language (Streetslang)', 'Library Search',
  'Local Expert (Your Home)', 'Science', 'Tactics', 'Wilderness Survival', 'Brawling',
  'Evasion', 'Martial Arts', 'Melee Weapon', 'Acting', 'Play Instrument', 'Archery',
  'Autofire', 'Handgun', 'Heavy Weapons', 'Shoulder Arms', 'Bribery', 'Conversation',
  'Human Perception', 'Interrogation', 'Persuasion', 'Personal Grooming', 'Streetwise',
  'Trading', 'Wardrobe & Style', 'Air Vehicle Tech', 'Basic Tech', 'Cybertech',
  'Demolitions', 'Electronics/Security Tech', 'First Aid', 'Forgery', 'Land Vehicle Tech',
  'Paint/Draw/Sculpt', 'Paramedic', 'Photography/Film', 'Pick Lock', 'Pick Pocket',
  'Sea Vehicle Tech', 'Weaponstech',
]));

export function validateWeaponDefinition(def: Partial<WeaponDefinition>, canonicalRules: CanonicalRules = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!def.code) issues.push(validationIssue('error', 'weapon_missing_code', 'WeaponDefinition is missing code.'));
  if (!def.name) issues.push(validationIssue('error', 'weapon_missing_name', 'WeaponDefinition is missing name.', { code: def.code }));
  if (def.sourceType && !sourceTypes(canonicalRules).has(def.sourceType)) {
    issues.push(validationIssue('error', 'source_type_invalid', 'WeaponDefinition has invalid sourceType.', { code: def.code, evidence: { sourceType: def.sourceType } }));
  }
  if (def.quality && !weaponQualities(canonicalRules).has(def.quality)) {
    issues.push(validationIssue('error', 'weapon_quality_invalid', 'WeaponDefinition has invalid quality.', { code: def.code, evidence: { quality: def.quality } }));
  }
  if (!def.damage) issues.push(validationIssue('error', 'weapon_missing_damage', 'WeaponDefinition is missing damage.', { code: def.code }));
  if (def.rof == null) issues.push(validationIssue('error', 'weapon_missing_rof', 'WeaponDefinition is missing ROF.', { code: def.code }));
  if (!def.weaponSkill) issues.push(validationIssue('error', 'weapon_missing_skill', 'WeaponDefinition is missing weaponSkill.', { code: def.code }));
  const canonicalSkill = normalizeSkillName(def.weaponSkill, canonicalRules);
  if (def.weaponSkill && !skillNames(canonicalRules).has(canonicalSkill)) {
    issues.push(validationIssue('error', 'weapon_unknown_skill', 'WeaponDefinition references unknown weaponSkill.', { code: def.code, evidence: { weaponSkill: def.weaponSkill, canonicalSkill } }));
  }
  const damage = parseDamageString(def.damage);
  if (def.damage && damage && damage.mod) {
    const hasExplanation = (def.specialRules || []).some(rule => /modifier|modificador|\+\d+|homebrew|exotic/i.test(rule));
    if (!def.exotic && def.sourceType !== 'homebrew-limiar') {
      issues.push(validationIssue('error', 'weapon_damage_modifier_not_allowed', 'Damage modifier is only allowed for exotic or homebrew-limiar weapons.', { code: def.code, evidence: { damage: def.damage } }));
    } else if (!hasExplanation) {
      issues.push(validationIssue('warning', 'weapon_damage_modifier_unexplained', 'Damage modifier needs a specialRules explanation.', { code: def.code, evidence: { damage: def.damage } }));
    }
  }
  return issues;
}

export function validateCyberwareDefinition(def: Partial<CyberwareDefinition>, canonicalRules: CanonicalRules = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!def.code) issues.push(validationIssue('error', 'cyberware_missing_code', 'CyberwareDefinition is missing code.'));
  if (!def.name) issues.push(validationIssue('error', 'cyberware_missing_name', 'CyberwareDefinition is missing name.', { code: def.code }));
  if (def.sourceType && !sourceTypes(canonicalRules).has(def.sourceType)) {
    issues.push(validationIssue('error', 'source_type_invalid', 'CyberwareDefinition has invalid sourceType.', { code: def.code, evidence: { sourceType: def.sourceType } }));
  }
  (def.effects || []).forEach(effect => {
    if (!(ITEM_EFFECT_TYPES as string[]).includes(effect.type)) {
      issues.push(validationIssue('error', 'invalid_effect_type', 'ItemEffect type is not supported.', { code: def.code, evidence: { effectType: effect.type } }));
    }
    if (!effect.sourceCode) {
      issues.push(validationIssue('error', 'effect_missing_source_code', 'ItemEffect is missing sourceCode.', { code: def.code, evidence: { effectType: effect.type } }));
    }
    if (effect.stackingRule && !(STACKING_RULES as string[]).includes(effect.stackingRule)) {
      issues.push(validationIssue('error', 'effect_invalid_stacking_rule', 'ItemEffect has unsupported stackingRule.', { code: def.code, evidence: { stackingRule: effect.stackingRule } }));
    }
    if (effect.type === 'empProtection' && effect.value && (effect.value as { globalEmpImmunity?: boolean }).globalEmpImmunity === true) {
      issues.push(validationIssue('error', 'effect_global_emp_protection_invalid', 'empProtection must not grant global EMP immunity in this phase.', { code: def.code, evidence: { value: effect.value } }));
    }
    if (effect.type === 'selectedSkillBonus' && (effect.appliesTo || []).some(target => canonicalRules.invalidSkillLikeFields && canonicalRules.invalidSkillLikeFields[target])) {
      issues.push(validationIssue('error', 'selected_skill_bonus_fixed_fake_skill', 'selectedSkillBonus must not pin a fake skill name.', { code: def.code, evidence: { appliesTo: effect.appliesTo } }));
    }
    (effect.appliesTo || []).forEach(target => {
      const skill = normalizeSkillName(target, canonicalRules);
      if (!skillNames(canonicalRules).has(skill) && !officialStats(canonicalRules).has(skill)) {
        issues.push(validationIssue('warning', 'effect_target_unknown', 'ItemEffect applies to an unknown skill/stat target.', { code: def.code, evidence: { target, effectType: effect.type } }));
      }
    });
  });
  if (def.weaponProfile && def.weaponProfile.container !== true) {
    issues.push(...validateWeaponDefinition({ code: def.code, name: def.name, ...def.weaponProfile }, canonicalRules));
  }
  return issues;
}

export function validateInstalledCyberwareInstance(instance: InstalledCyberwareInstance, catalog: LegacyCatalogItem[] = []): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!instance.instanceId) issues.push(validationIssue('error', 'installed_cyberware_missing_instance_id', 'InstalledCyberwareInstance is missing instanceId.', { code: instance.code }));
  if (!instance.code) issues.push(validationIssue('error', 'installed_cyberware_missing_code', 'InstalledCyberwareInstance is missing code.'));
  if (instance.code && catalog.length && !catalog.some(item => item && item.code === instance.code)) {
    issues.push(validationIssue('error', 'installed_cyberware_unknown_code', 'InstalledCyberwareInstance code is not present in catalog.', { code: instance.code }));
  }
  if (instance.parentInstanceId === instance.instanceId) {
    issues.push(validationIssue('error', 'installed_cyberware_self_parent', 'InstalledCyberwareInstance cannot be its own parent.', { code: instance.code, evidence: { instanceId: instance.instanceId } }));
  }
  return issues;
}

export function validateItemAgainstCanonical(def: { code?: string; sourceType?: string; requiresGmApproval?: boolean }, canonicalRules: CanonicalRules = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sourceType = def && def.sourceType;
  if (!sourceType) issues.push(validationIssue('warning', 'source_type_missing', 'Item has no sourceType.', { code: def.code }));
  if (sourceType && !sourceTypes(canonicalRules).has(sourceType)) {
    issues.push(validationIssue('error', 'source_type_invalid', 'Item sourceType is not permitted by canonical rules.', { code: def.code, evidence: { sourceType } }));
  }
  const homebrew = new Set(canonicalRules.homebrewLimiarReservedItems || []);
  if (def.code && homebrew.has(def.code) && def.requiresGmApproval !== true) {
    issues.push(validationIssue('warning', 'homebrew_missing_gm_approval', 'Homebrew Limiar item requires GM approval flag.', { code: def.code }));
  }
  return issues;
}
