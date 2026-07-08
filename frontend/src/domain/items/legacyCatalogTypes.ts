// Shapes for the raw, hand-authored catalog rows in data/seed/limiar-seed.json
// (seed.items / seed.gear / seed.characters), before normalizeWeaponDefinition/
// normalizeCyberwareDefinition turn them into the canonical WeaponDefinition/
// CyberwareDefinition shapes. This is genuinely a legacy, loosely-schematized
// format accumulated over time (several fields have 2-3 historical aliases,
// e.g. damage/dmg, magazine/mag, cat/category/chromeCat) — every field below
// is one actually read by itemNormalizers.ts and catalogAuditEngine.ts, kept
// optional/loose to match how those engines defensively coerce them.

import type { CanonicalCatalogEntry, CanonicalItemEffect, CanonicalRequirement } from './canonicalRulesTypes.ts';

export interface LegacyArmorSpec {
  headSP?: number;
  bodySP?: number;
  armorPenalty?: { REF?: number; DEX?: number; MOVE?: number; [stat: string]: number | undefined };
}

export interface LegacyWeaponMode {
  mode?: string;
  damage?: string;
  ammoCost?: number;
  [extra: string]: unknown;
}

export interface LegacyCatalogItem {
  code?: string;
  id?: string;
  name?: string;
  source?: string;
  sourceType?: string;
  kind?: string;
  type?: string;
  weaponType?: string;
  weaponClass?: string;
  weaponSkill?: string;
  skill?: string;
  damage?: string | null;
  dmg?: string;
  rof?: number | string | null;
  magazine?: number | string | null;
  mag?: number | null;
  ammoType?: string | null;
  handsRequired?: number | 'varies' | null;
  hands?: number | null;
  concealable?: boolean | null;
  reachMeters?: number;
  damageScale?: { minBody?: number; maxBody?: number; count?: number; sides?: number; mod?: number }[];
  count?: number;
  sides?: number;
  cost?: number | null;
  price?: number;
  costCategory?: string | null;
  quality?: string | null;
  exotic?: boolean;
  attachmentSlots?: number | null;
  rangeTable?: string | null;
  autofire?: { enabled: boolean; multiplier?: number } | null;
  suppressiveFire?: boolean;
  specialRules?: string[] | string;
  special?: string | string[];
  legacyDesc?: string;
  desc?: string;
  cat?: string;
  category?: string;
  chromeCat?: string;
  install?: string;
  requirements?: unknown;
  legacyRequirements?: string;
  skillBonus?: Record<string, unknown>;
  statMod?: Record<string, unknown>;
  bonus?: unknown;
  cyberwareType?: string;
  humanityLossAverage?: number | null;
  hcost?: number;
  humanityLossDice?: string | null;
  hlDice?: string;
  foundational?: boolean;
  maxInstalled?: number;
  optionSlotsProvided?: number | null;
  optionSlotsRequired?: number | null;
  slotCost?: number | { perCybereye?: number; perCyberleg?: number; perCyberarm?: number };
  cyberdeckHardwareSlotsRequired?: number | null;
  cyberdeckSlotsProvided?: number;
  bodyLocation?: string | null;
  requires?: (CanonicalRequirement | string)[];
  incompatibleWith?: string[];
  countMode?: string;
  container?: boolean;
  melee?: boolean;
  paired?: boolean;
  permitsMultiple?: boolean;
  unique?: boolean;
  parentType?: string | null;
  allowedParentTypes?: string[];
  allowedContainedTypes?: string[];
  effects?: CanonicalItemEffect[];
  effect?: CanonicalItemEffect;
  weaponProfile?: LegacyCatalogItem | CanonicalCatalogEntry;
  requiresGmApproval?: boolean;
  slots?: unknown;
  slotCapacity?: unknown;
  parentSlot?: unknown;
  parentSlots?: unknown;
  homebrew?: boolean;
  notes?: string;
  rarity?: string;
  flags?: unknown;
  ignoresArmor?: boolean;
  ignoresHalfArmor?: boolean;
  balanceNotes?: string[] | string;
  weaponModes?: LegacyWeaponMode[];
  installedAttachments?: string[];
  armor?: LegacyArmorSpec;
  shieldHp?: number;
  maxHp?: number;
  cannotBeInstalledInPopupShield?: boolean;
  builtIn?: string[];
  model?: string;
  specs?: { size?: string; [extra: string]: unknown };
  // Installed-instance fields (character.equipped rows re-use this same
  // loose shape rather than a separate type, matching runtime reality).
  instanceId?: string;
  installationId?: string;
  parentInstanceId?: string | null;
  location?: string | null;
  selectedMode?: string | null;
  activeMode?: string | null;
  mode?: string | null;
  weaponMode?: string | null;
  selectedSkill?: string | null;
  selectedWeaponCode?: string | null;
  heldWeapon?: unknown;
  installedWeapon?: unknown;
  weapon?: unknown;
  riders?: unknown[];
  attackMod?: number;
  instantDraw?: boolean;
  reqBody?: number | null;
  reqRef?: number | null;
  modes?: string[];
  tier?: string;
  attachesTo?: string | string[] | null;
  enabled?: boolean;
  damageState?: string;
  installedOptions?: string[];
  manualChoiceRequired?: boolean;
  manualChoice?: Record<string, unknown>;
  sourceLegacyPath?: string;
  migrationMetadata?: Record<string, unknown>;
  legacySource?: string;
}

export interface LegacyCharacter {
  id?: string;
  name?: string;
  base?: Record<string, unknown>;
  stats?: Record<string, unknown>;
  equipped?: LegacyCatalogItem[];
  owned?: (string | LegacyCatalogItem)[];
  installedCyberware?: LegacyCatalogItem[];
  cyberwareInstances?: LegacyCatalogItem[];
}

export interface LegacySeed {
  items?: LegacyCatalogItem[];
  gear?: LegacyCatalogItem[];
  characters?: LegacyCharacter[];
}

export interface AuditIssue {
  id?: string;
  severity: 'info' | 'warning' | 'error';
  type: string;
  collection?: string;
  path?: string;
  code?: string;
  name?: string;
  message: string;
  evidence?: unknown;
}
