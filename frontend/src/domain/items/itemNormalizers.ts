import type { SourceType, WeaponDefinition } from './weaponTypes.ts';
import type { CyberwareDefinition, CyberwareType, InstallType, StructuredRequirement } from './cyberwareTypes.ts';
import type { ItemEffect } from './cyberwareTypes.ts';
import type { InstalledCyberwareInstance } from './installedCyberwareTypes.ts';
import type { CanonicalCatalogEntry, CanonicalRules } from './canonicalRulesTypes.ts';
import type { LegacyCatalogItem } from './legacyCatalogTypes.ts';

const asText = (value: unknown): string => String(value ?? '').trim();
const asNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const asBooleanOrNull = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;
const list = (value: unknown): string[] => Array.isArray(value) ? value.filter(Boolean).map(String) : (value ? [String(value)] : []);

export function canonicalSeedCode(entry: { code?: unknown; id?: unknown; name?: unknown } | null | undefined): string {
  return asText(entry && (entry.code || entry.id || entry.name)).toUpperCase();
}

export function normalizeSourceType(value: unknown, canonicalRules: CanonicalRules): SourceType | undefined {
  const sourceType = asText(value);
  if (!sourceType) return undefined;
  return sourceType as SourceType;
}

export function normalizeSkillName(value: unknown, canonicalRules: CanonicalRules): string {
  const raw = asText(value);
  return (canonicalRules.skillAliases && canonicalRules.skillAliases[raw]) || raw;
}

export interface ParsedDamage {
  count: number;
  sides: number;
  mod: number;
  text: string;
}

export function parseDamageString(value: unknown): ParsedDamage | null {
  const raw = asText(value);
  const match = raw.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!match) return null;
  return {
    count: Number(match[1] || 1),
    sides: Number(match[2]),
    mod: Number(match[3] || 0),
    text: `${Number(match[1] || 1)}d${Number(match[2])}${match[3] || ''}`,
  };
}

export function legacyDiceToDamage(input: LegacyCatalogItem | null | undefined): string | null {
  const direct = parseDamageString(input && (input.damage || input.dmg));
  if (direct) return direct.text;
  const count = asNumberOrNull(input && input.count);
  const sides = asNumberOrNull(input && input.sides);
  const mod = asNumberOrNull(input && (input as { mod?: unknown }).mod);
  if (!count || !sides) return null;
  return `${count}d${sides}${mod ? (mod > 0 ? `+${mod}` : String(mod)) : ''}`;
}

function profileBySeedCode(
  group: Record<string, CanonicalCatalogEntry> | undefined,
  code: string,
  name: string,
): [string, CanonicalCatalogEntry] | undefined {
  const normalizedName = asText(name).toUpperCase();
  return Object.entries(group || {}).find(([entryName, profile]) => {
    const codes = Array.isArray(profile.seedCodes) ? profile.seedCodes.map(c => asText(c).toUpperCase()) : [];
    return codes.includes(code) || entryName.toUpperCase() === code || entryName.toUpperCase() === normalizedName;
  });
}

function weaponProfileFromCanonical(
  input: LegacyCatalogItem,
  canonicalRules: CanonicalRules,
): { profileName: string; profile: CanonicalCatalogEntry } | null {
  const code = canonicalSeedCode(input);
  const name = asText(input && input.name);
  const groups = [
    canonicalRules.coreRangedWeaponProfiles,
    canonicalRules.coreMeleeWeaponProfiles,
    canonicalRules.coreWeaponCatalogCorrections,
    canonicalRules.redmasCatalogCorrections,
    canonicalRules.homebrewLimiarCatalogCorrections,
    canonicalRules.coreCyberweaponProfiles,
  ];
  for (const group of groups) {
    const match = profileBySeedCode(group, code, name);
    if (match) return { profileName: match[0], profile: match[1] };
  }
  return null;
}

export function normalizeWeaponDefinition(input: LegacyCatalogItem = {}, canonicalRules: CanonicalRules = {}): WeaponDefinition {
  const canonical = weaponProfileFromCanonical(input, canonicalRules);
  const profile: CanonicalCatalogEntry = canonical ? canonical.profile : {};
  const specialRules = list(input.specialRules || input.special || profile.special);
  const autofireRule = specialRules.find(rule => /^Autofire\s+\d+/i.test(rule));
  const autofire = input.autofire || (autofireRule ? {
    enabled: true,
    multiplier: Number((autofireRule.match(/\d+/) || [])[0]) || undefined,
  } : undefined);
  const suppressiveFire = input.suppressiveFire ?? specialRules.some(rule => /Suppressive Fire/i.test(rule));

  return {
    code: canonicalSeedCode(input),
    name: asText(input.name || canonical?.profileName || input.code || 'UNKNOWN'),
    source: asText(input.source) || undefined,
    sourceType: normalizeSourceType(input.sourceType, canonicalRules),
    kind: 'weapon',
    weaponType: asText(input.weaponType || input.weaponClass || input.type || canonical?.profileName || 'unknown'),
    weaponSkill: normalizeSkillName(input.weaponSkill || input.skill || profile.weaponSkill || profile.skill, canonicalRules),
    damage: input.damage === null ? null : (legacyDiceToDamage(input) || profile.damage || asText(input.damage) || null),
    rof: asNumberOrNull(input.rof ?? profile.rof),
    magazine: asNumberOrNull(input.magazine ?? input.mag ?? profile.magazine),
    ammoType: asText(input.ammoType || profile.ammoType) || null,
    handsRequired: (input.handsRequired ?? input.hands ?? profile.handsRequired ?? null) as number | 'varies' | null,
    concealable: asBooleanOrNull(input.concealable ?? profile.concealable),
    reachMeters: asNumberOrNull(input.reachMeters ?? profile.reachMeters) ?? undefined,
    damageScale: Array.isArray(input.damageScale || profile.damageScale) ? (input.damageScale || profile.damageScale) : undefined,
    cost: asNumberOrNull(input.cost ?? input.price ?? profile.cost),
    costCategory: asText(input.costCategory || profile.costCategory) || null,
    quality: asText(input.quality || profile.quality || 'standard').toLowerCase() || 'standard',
    exotic: !!(input.exotic || profile.exotic),
    attachmentSlots: asNumberOrNull(input.attachmentSlots),
    rangeTable: asText(input.rangeTable) || null,
    ...(autofire ? { autofire } : {}),
    suppressiveFire,
    specialRules,
    legacyDesc: asText(input.legacyDesc || input.desc) || undefined,
  };
}

function cyberwareTypeFromLegacy(input: LegacyCatalogItem): CyberwareType {
  const cat = asText(input.cat || input.category || input.chromeCat).toUpperCase();
  const weaponClass = asText(input.weaponClass);
  if (weaponClass) return 'cyberweapon';
  if (cat === 'FASHION') return 'fashionware';
  if (cat === 'NEURAL') return asText(input.name).toLowerCase().includes('chip') ? 'chipware' : 'neuralware';
  if (cat === 'OPTICS') return 'cyberoptics';
  if (cat === 'AUDIO') return 'cyberaudio';
  if (cat === 'INTERNAL') return 'internal';
  if (cat === 'EXTERNAL') return 'external';
  if (cat === 'LIMBS') {
    if (/leg|foot/i.test(asText(input.name))) return 'cyberleg';
    if (/arm|hand/i.test(asText(input.name))) return 'cyberarm';
    return 'cyberweapon';
  }
  if (cat === 'BORG') return 'borgware';
  if (cat === 'DECK') return 'cyberdeck-hardware';
  return 'unknown';
}

function installFromLegacy(value: unknown): InstallType | 'n/a' | undefined {
  const raw = asText(value).toLowerCase();
  if (!raw) return undefined;
  if (raw === 'n/a' || raw === 'n/d') return 'n/a';
  if (raw.includes('clinic') || raw.includes('clinica')) return 'clinic';
  if (raw.includes('hospital')) return 'hospital';
  if (raw.includes('shopping') || raw.includes('mall')) return 'mall';
  if (raw.includes('self')) return 'self';
  return 'unknown';
}

function addRequirementFromText(requires: StructuredRequirement[], text: unknown): void {
  const raw = asText(text);
  if (raw) requires.push({ type: 'unknown', legacyText: raw });
}

function requirementFromCanonicalText(text: unknown): StructuredRequirement {
  if (text && typeof text === 'object' && !Array.isArray(text)) {
    const t = text as CanonicalCatalogEntry & { type?: string; code?: string; legacyText?: string };
    return {
      ...t,
      type: (asText(t.type || 'unknown') || 'unknown') as StructuredRequirement['type'],
      code: t.code ? canonicalSeedCode(t) : undefined,
      legacyText: asText(t.legacyText) || undefined,
    } as StructuredRequirement;
  }
  const raw = asText(text);
  const stat = raw.match(/^(INT|REF|DEX|TECH|COOL|WILL|LUCK|MOVE|BODY|EMP)\s+(\d+)$/i);
  if (stat) return { type: 'requiredStat', stat: stat[1].toUpperCase(), min: Number(stat[2]), legacyText: raw };
  if (/Cyberlegs?/i.test(raw) && /two |two\b|duas|dois/i.test(raw)) return { type: 'requiredCyberwareCount', code: 'CYBERLEG', name: 'Cyberleg', count: 2, legacyText: raw };
  if (/Cyberarms?/i.test(raw) && /two |two\b|duas|dois/i.test(raw)) return { type: 'requiredCyberwareCount', code: 'CYBERARM', name: 'Cyberarm', count: 2, legacyText: raw };
  if (/Cybereyes?/i.test(raw) && /two |two\b|duas|dois/i.test(raw)) return { type: 'requiredCyberwareCount', code: 'CYBEREYE', name: 'Cybereye', count: 2, legacyText: raw };
  if (/Grafted Muscle and Bone Lace/i.test(raw) && /two |two\b|duas|dois/i.test(raw)) return { type: 'requiredCyberwareCount', code: 'MUSCLE-LACE', name: 'Grafted Muscle and Bone Lace', count: 2, legacyText: raw };
  if (/Grafted Muscle and Bone Lace/i.test(raw)) return { type: 'requiredCyberware', code: 'MUSCLE-LACE', name: 'Grafted Muscle and Bone Lace', legacyText: raw };
  if (/Neural Link/i.test(raw)) return { type: 'requiredCyberware', code: 'NEURAL-LINK', name: 'Neural Link', legacyText: raw };
  if (/Chipware Socket/i.test(raw)) return { type: 'requiredCyberware', code: 'CHIP-SOCKET', name: 'Chipware Socket', legacyText: raw };
  if (/two |two\b|duas|dois/i.test(raw)) return { type: 'requiredCyberwareCount', name: raw, count: 2, legacyText: raw };
  return { type: 'requiredCyberware', name: raw, legacyText: raw };
}

function effectsFromInvalidLegacyMap(input: LegacyCatalogItem, canonicalRules: CanonicalRules): ItemEffect[] {
  const effects: ItemEffect[] = [];
  const invalid = canonicalRules.invalidSkillLikeFields || {};
  const code = canonicalSeedCode(input);
  Object.entries(input.skillBonus || {}).forEach(([key, value]) => {
    const action = invalid[key] && invalid[key].canonicalAction;
    if (!action) {
      effects.push({ type: 'flatSkillBonus', sourceCode: code, appliesTo: [normalizeSkillName(key, canonicalRules)], value });
      return;
    }
    if (/selectedSkillBonus/.test(action)) effects.push({ type: 'selectedSkillBonus', sourceCode: code, value, condition: key });
    else if (/senseMode/.test(action)) effects.push({ type: 'senseMode', sourceCode: code, value: key, condition: action });
    else if (/movementMode/.test(action)) effects.push({ type: 'movementMode', sourceCode: code, value: key, condition: action });
    else effects.push({ type: 'contextualEffect', sourceCode: code, value: key, condition: action });
  });
  Object.entries(input.statMod || {}).forEach(([key, value]) => {
    const action = invalid[key] && invalid[key].canonicalAction;
    if (!action) {
      effects.push({ type: 'statModifier', sourceCode: code, appliesTo: [key], value });
      return;
    }
    effects.push({ type: /movementMode/.test(action) ? 'movementMode' : 'contextualEffect', sourceCode: code, value: key, condition: action });
  });
  return effects;
}

function effectsFromCanonicalCorrection(correction: CanonicalCatalogEntry, code: string): ItemEffect[] {
  const effects: ItemEffect[] = [];
  (Array.isArray(correction.effects) ? correction.effects : []).forEach(effect => {
    effects.push({ sourceCode: code, ...effect } as ItemEffect);
  });
  if (correction.effect) effects.push({ sourceCode: code, ...correction.effect } as ItemEffect);
  (correction.flatSkillBonus || []).forEach(row => effects.push({ type: 'flatSkillBonus', sourceCode: code, appliesTo: row.skill ? [row.skill] : undefined, value: row.value } as ItemEffect));
  (correction.conditionalSkillBonus || []).forEach(row => effects.push({ type: 'conditionalSkillBonus', sourceCode: code, appliesTo: row.skill ? [row.skill] : undefined, value: row.value, condition: row.condition } as ItemEffect));
  (correction.conditionalAttackBonus || []).forEach(row => effects.push({ type: 'conditionalSkillBonus', sourceCode: code, value: row.value, condition: row.condition } as ItemEffect));
  if (correction.statModifier) effects.push({ type: 'statModifier', sourceCode: code, appliesTo: correction.statModifier.stat ? [correction.statModifier.stat] : undefined, value: correction.statModifier } as ItemEffect);
  if (correction.setEffectiveStat) effects.push({ type: 'setEffectiveStat', sourceCode: code, appliesTo: correction.setEffectiveStat.stat ? [correction.setEffectiveStat.stat] : undefined, value: correction.setEffectiveStat } as ItemEffect);
  if (correction.armorLayer) effects.push({ type: 'armorLayer', sourceCode: code, value: correction.armorLayer, stackingRule: 'doNotStack' } as ItemEffect);
  if (correction.senseMode) effects.push({ type: 'senseMode', sourceCode: code, value: correction.senseMode } as ItemEffect);
  if (correction.movementMode) effects.push({ type: 'movementMode', sourceCode: code, value: correction.movementMode } as ItemEffect);
  if (correction.empProtection) effects.push({ type: 'empProtection', sourceCode: code, value: correction.empProtection } as ItemEffect);
  return effects;
}

function correctionBySeedCode(input: LegacyCatalogItem, canonicalRules: CanonicalRules): CanonicalCatalogEntry | null {
  const match = profileBySeedCode(canonicalRules.coreCyberwareCatalogCorrections, canonicalSeedCode(input), asText(input.name))
    || profileBySeedCode(canonicalRules.homebrewLimiarCatalogCorrections, canonicalSeedCode(input), asText(input.name))
    || profileBySeedCode(canonicalRules.itemEffectCorrections, canonicalSeedCode(input), asText(input.name));
  return match ? match[1] : null;
}

function foundationBySeedCode(input: LegacyCatalogItem, canonicalRules: CanonicalRules) {
  const match = profileBySeedCode(
    canonicalRules.cyberwareFoundations as unknown as Record<string, CanonicalCatalogEntry> | undefined,
    canonicalSeedCode(input),
    asText(input.name),
  );
  return match ? match[1] : null;
}

export function normalizeCyberwareDefinition(input: LegacyCatalogItem = {}, canonicalRules: CanonicalRules = {}): CyberwareDefinition {
  const code = canonicalSeedCode(input);
  const foundation = foundationBySeedCode(input, canonicalRules) || ({} as CanonicalCatalogEntry);
  const correction = correctionBySeedCode(input, canonicalRules) || ({} as CanonicalCatalogEntry);
  const cyberweapon = profileBySeedCode(canonicalRules.coreCyberweaponProfiles, code, asText(input.name));
  const homebrewReserved = (canonicalRules.homebrewLimiarReservedItems || []).includes(code);
  const requires: StructuredRequirement[] = [];
  (input.requires || (foundation as unknown as { requires?: unknown[] }).requires || correction.requires || []).forEach(req => requires.push(requirementFromCanonicalText(req)));
  addRequirementFromText(requires, input.requirements);
  const correctionEffects = effectsFromCanonicalCorrection(correction, code);
  const directEffects: ItemEffect[] = (Array.isArray(input.effects) ? input.effects : []).map(effect => ({ sourceCode: code, ...effect } as ItemEffect));
  if (input.effect) directEffects.push({ sourceCode: code, ...input.effect } as ItemEffect);
  const legacyDerivedEffects = effectsFromInvalidLegacyMap(input, canonicalRules);
  const effects = directEffects.length ? directEffects : (correctionEffects.length ? correctionEffects : legacyDerivedEffects);
  const legacyEffects = (directEffects.length || correctionEffects.length)
    ? legacyDerivedEffects.filter(effect => effect.type === 'contextualEffect' || effect.type === 'unknown' || effect.type === 'senseMode' || effect.type === 'movementMode')
    : legacyDerivedEffects.filter(effect => effect.type === 'contextualEffect' || effect.type === 'unknown' || effect.type === 'senseMode' || effect.type === 'movementMode');
  if (cyberweapon) effects.push({ type: 'cyberweapon', sourceCode: code, value: cyberweapon[1] } as ItemEffect);
  const directWeaponProfile = input.weaponProfile && input.weaponProfile.container
    ? { code, name: asText(input.name || code), kind: 'weapon', ...input.weaponProfile } as Partial<WeaponDefinition>
    : (input.weaponProfile ? normalizeWeaponDefinition({ ...input.weaponProfile, code, name: input.name }, canonicalRules) : undefined);

  return {
    code,
    name: asText(input.name || input.code || 'UNKNOWN'),
    source: asText(input.source) || undefined,
    sourceType: normalizeSourceType(input.sourceType, canonicalRules),
    kind: 'cyberware',
    cyberwareType: (asText(input.cyberwareType) || (cyberweapon ? 'cyberweapon' : cyberwareTypeFromLegacy(input))) as CyberwareType,
    install: installFromLegacy(input.install),
    cost: asNumberOrNull(input.cost ?? input.price),
    costCategory: asText(input.costCategory) || null,
    humanityLossAverage: asNumberOrNull(input.humanityLossAverage ?? input.hcost),
    humanityLossDice: asText(input.humanityLossDice || input.hlDice) || null,
    foundational: input.foundational ?? foundation.foundational === true,
    maxInstalled: input.maxInstalled ?? (foundation as unknown as { maxInstalled?: number }).maxInstalled,
    optionSlotsProvided: asNumberOrNull(input.optionSlotsProvided ?? (foundation as unknown as { optionSlotsProvided?: number; optionSlotsAvailable?: number }).optionSlotsProvided ?? (foundation as unknown as { optionSlotsAvailable?: number }).optionSlotsAvailable),
    optionSlotsRequired: asNumberOrNull(input.optionSlotsRequired ?? input.slotCost as number | undefined),
    slotCost: input.slotCost ?? correction.slotCost,
    cyberdeckHardwareSlotsRequired: asNumberOrNull(input.cyberdeckHardwareSlotsRequired),
    bodyLocation: asText(input.bodyLocation) || null,
    requires,
    incompatibleWith: list(input.incompatibleWith),
    countMode: (input.countMode || (input.container ? 'container' : (input.paired ? 'paired' : (['CYBEREYE', 'CYBERARM', 'CYBERLEG'].includes(code) ? 'paired' : undefined)))) as CyberwareDefinition['countMode'],
    permitsMultiple: input.permitsMultiple ?? ['CYBEREYE', 'CYBERARM', 'CYBERLEG'].includes(code),
    unique: input.unique ?? (foundation as unknown as { maxInstalled?: number }).maxInstalled === 1,
    paired: input.paired ?? ['CYBEREYE', 'CYBERARM', 'CYBERLEG'].includes(code),
    parentType: asText(input.parentType) || null,
    allowedParentTypes: list(input.allowedParentTypes),
    container: !!(input.container || (cyberweapon && cyberweapon[1].container)),
    allowedContainedTypes: list(input.allowedContainedTypes || (cyberweapon && cyberweapon[1].allowedWeapons)),
    effects,
    legacyEffects,
    weaponProfile: directWeaponProfile || (cyberweapon ? normalizeWeaponDefinition({ ...input, ...cyberweapon[1], code, name: input.name }, canonicalRules) : undefined),
    requiresGmApproval: input.requiresGmApproval ?? (homebrewReserved ? false : undefined),
    specialRules: list(input.specialRules || input.special),
    legacyDesc: asText(input.desc || input.legacyDesc) || undefined,
    legacyRequirements: asText(input.requirements || input.legacyRequirements) || undefined,
  };
}

export function normalizeInstalledCyberwareInstance(input: LegacyCatalogItem = {}): InstalledCyberwareInstance {
  const code = canonicalSeedCode(input);
  const instanceId = asText(input.instanceId || input.id || `${code || 'UNKNOWN'}-instance`);
  return {
    instanceId,
    code,
    parentInstanceId: input.parentInstanceId ?? null,
    location: input.location ?? null,
    selectedMode: input.selectedMode ?? input.activeMode ?? input.mode ?? null,
    selectedSkill: input.selectedSkill ?? null,
    selectedWeaponCode: input.selectedWeaponCode ?? null,
    enabled: input.enabled !== false,
    damageState: (input.damageState || 'normal') as InstalledCyberwareInstance['damageState'],
    installedOptions: Array.isArray(input.installedOptions) ? input.installedOptions.map(String) : [],
    manualChoiceRequired: input.manualChoiceRequired === true,
    manualChoice: input.manualChoice && typeof input.manualChoice === 'object' ? input.manualChoice : undefined,
    sourceLegacyPath: asText(input.sourceLegacyPath) || undefined,
    migrationMetadata: input.migrationMetadata && typeof input.migrationMetadata === 'object' ? input.migrationMetadata : undefined,
    notes: asText(input.notes) || undefined,
  };
}
