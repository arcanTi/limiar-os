// Shapes for data/canonical/cpr-canonical-rules.json, the hand-authored
// "ground truth" JSON the catalog audit/normalization engines check the
// legacy item catalog against. Every group below is a real top-level key in
// that file; fields are optional because each group only carries the subset
// relevant to its own purpose (a ranged-weapon profile has no `container`,
// a cyberweapon profile does, etc). Kept intentionally wide/duck-typed
// (WeaponSkill/damage/etc. reused across groups) because the engines read
// these groups interchangeably via profileBySeedCode/correctionBySeedCode.

export interface CanonicalRequirement {
  type?: string;
  code?: string;
  name?: string;
  stat?: string;
  min?: number;
  count?: number;
  parentType?: string;
  group?: string;
  legacyText?: string;
}

export interface CanonicalItemEffect {
  type?: string;
  sourceCode?: string;
  sourceInstanceId?: string;
  appliesTo?: string[];
  value?: unknown;
  condition?: string;
  stackingRule?: string;
  enabledByDefault?: boolean;
  scope?: string;
  notes?: string;
}

export interface CanonicalSkillOrStatBonusRow {
  skill?: string;
  stat?: string;
  value?: unknown;
  condition?: string;
}

// A row in coreRangedWeaponProfiles/coreMeleeWeaponProfiles, OR a correction
// entry from coreWeaponCatalogCorrections/redmasCatalogCorrections/
// homebrewLimiarCatalogCorrections/coreCyberwareCatalogCorrections, OR a
// cyberweapon profile from coreCyberweaponProfiles. All of these are read by
// the same duck-typed lookup helpers (profileBySeedCode/correctionBySeedCode
// in itemNormalizers.ts), so one wide shape mirrors how the code actually
// treats them rather than pretending each group has a narrower contract.
export interface CanonicalCatalogEntry {
  seedCodes?: string[];
  sourceType?: string;
  source?: string;
  kind?: 'weapon' | 'cyberware' | 'armor';
  quality?: string;
  exotic?: boolean;
  attachmentSlots?: number | null;
  autofire?: { enabled: boolean; multiplier?: number } | null;
  suppressiveFire?: boolean;
  specialRules?: string[] | string;
  special?: string | string[];
  code?: string;
  name?: string;
  weaponType?: string;
  weaponSkill?: string;
  skill?: string;
  skillNote?: string;
  damage?: string;
  rof?: number | string | null;
  magazine?: number | string | null;
  mag?: number;
  ammoType?: string | null;
  handsRequired?: number | 'varies' | null;
  concealable?: boolean;
  concealableNote?: string;
  reachMeters?: number;
  damageScale?: { minBody?: number; maxBody?: number; count?: number; sides?: number; mod?: number }[];
  cost?: number | null;
  costCategory?: string | null;
  desc?: string;
  effect?: CanonicalItemEffect;
  effects?: CanonicalItemEffect[];
  requiresGmApproval?: boolean;
  weaponProfile?: CanonicalCatalogEntry;
  compatibleWith?: string[] | string;
  purchasable?: boolean;
  cyberweaponProfile?: string;
  cyberwareType?: string;
  cyberwareTypeSecondary?: string;
  install?: string;
  humanityLossAverage?: number;
  humanityLossDice?: string;
  foundational?: boolean;
  optionSlotsProvided?: number;
  optionSlotsRequired?: number;
  slotCost?: number | { perCybereye?: number; perCyberleg?: number; perCyberarm?: number };
  parentType?: string;
  allowedParentTypes?: string[];
  container?: boolean;
  allowedWeapons?: string[];
  allowedContainedTypes?: string[];
  countMode?: string;
  paired?: boolean;
  unique?: boolean;
  permitsMultiple?: boolean;
  mutuallyExclusiveGroup?: string;
  includes?: unknown[];
  requires?: (CanonicalRequirement | string)[];
  flatSkillBonus?: CanonicalSkillOrStatBonusRow[];
  conditionalSkillBonus?: CanonicalSkillOrStatBonusRow[];
  conditionalAttackBonus?: CanonicalSkillOrStatBonusRow[];
  statModifier?: { stat?: string; max?: number; [k: string]: unknown };
  setEffectiveStat?: { stat?: string; value?: number; [k: string]: unknown };
  armorLayer?: unknown;
  senseMode?: unknown;
  movementMode?: unknown;
  empProtection?: unknown;
  affects?: unknown;
  limitations?: unknown;
  attachesTo?: string | string[];
  balanceNotes?: string | string[];
}

export interface CanonicalFoundationInclude {
  name?: string;
  humanityLoss?: number;
  slotCost?: number;
  whenIncludedBy?: string;
}

export interface CanonicalFoundationEntry {
  seedCodes?: string[];
  category?: string;
  foundational?: boolean;
  optionSlotsProvided?: number;
  optionSlotsAvailable?: number;
  maxInstalled?: number;
  requires?: string[];
  requiredFor?: string[];
  includes?: CanonicalFoundationInclude[];
  slotUnit?: string;
}

export interface CanonicalCriticalInjuryRow {
  roll?: number;
  id?: string;
  name?: string;
  baseDeathSavePenaltyDelta?: number;
  [extra: string]: unknown;
}

export interface CanonicalRules {
  schemaVersion?: number;
  notes?: string | string[];
  sourceTypes?: string[];
  officialStats?: string[];
  skillAliases?: Record<string, string>;
  invalidSkillLikeFields?: Record<string, { reason?: string; canonicalAction?: string }>;
  cyberwareFoundations?: Record<string, CanonicalFoundationEntry>;
  slotRules?: unknown;
  coreRangedWeaponProfiles?: Record<string, CanonicalCatalogEntry>;
  coreMeleeWeaponProfiles?: Record<string, CanonicalCatalogEntry>;
  coreCyberweaponProfiles?: Record<string, CanonicalCatalogEntry>;
  itemEffectCorrections?: Record<string, CanonicalCatalogEntry>;
  faqRules?: unknown;
  unvalidatedItems?: string[];
  unvalidatedSourceRule?: { sourceText?: string };
  homebrewLimiarReservedItems?: string[];
  homebrewLimiarReservedRule?: unknown;
  coreCyberwareCatalogCorrections?: Record<string, CanonicalCatalogEntry>;
  weaponQualities?: string[];
  coreWeaponCatalogCorrections?: Record<string, CanonicalCatalogEntry>;
  coreArmorCatalogCorrections?: Record<string, CanonicalCatalogEntry>;
  combatRules?: unknown;
  criticalInjuryRules?: unknown;
  criticalInjuryTables?: Record<string, CanonicalCriticalInjuryRow[]>;
  criticalInjuryAliases?: unknown;
  redmasCatalogCorrections?: Record<string, CanonicalCatalogEntry>;
  homebrewLimiarCatalogCorrections?: Record<string, CanonicalCatalogEntry>;
}
