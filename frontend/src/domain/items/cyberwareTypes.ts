import type { SourceType, WeaponDefinition } from './weaponTypes.ts';

export type StructuredRequirementType =
  | 'requiredCyberware' | 'requiredCyberwareCount' | 'requiredStat' | 'requiredParentType'
  | 'requiredPairedLocation' | 'requiresFBC' | 'mutuallyExclusiveGroup' | 'gmApproval' | 'unknown';

export type ItemEffectType =
  | 'flatSkillBonus' | 'conditionalSkillBonus' | 'statModifier' | 'setEffectiveStat' | 'statCapModifier'
  | 'armorLayer' | 'speedware' | 'senseMode' | 'cyberweapon' | 'weaponMode' | 'damageVsCover'
  | 'armorAblation' | 'criticalInjuryImmunity' | 'empProtection' | 'containerSlots' | 'movementMode'
  | 'selectedSkillBonus' | 'nonLethalMode' | 'poisonOrDrugDelivery' | 'contextualEffect' | 'unknown';

export type StackingRule = 'stack' | 'doNotStack' | 'highestOnly' | 'requiresMultipleInstances';

export type CyberwareType =
  | 'fashionware' | 'neuralware' | 'chipware' | 'cyberoptics' | 'cyberaudio' | 'internal' | 'external'
  | 'cyberarm' | 'cyberleg' | 'borgware' | 'cyberdeck-hardware' | 'cyberweapon' | 'unknown';

export type InstallType = 'clinic' | 'hospital' | 'mall' | 'self' | 'unknown';
export type CountMode = 'single' | 'multiple' | 'paired' | 'container';

export interface StructuredRequirement {
  type: StructuredRequirementType;
  code?: string;
  name?: string;
  stat?: string;
  min?: number;
  count?: number;
  parentType?: string;
  group?: string;
  legacyText?: string;
}

export interface ItemEffect {
  type: ItemEffectType;
  sourceCode: string;
  sourceInstanceId?: string;
  appliesTo?: string[];
  value?: unknown;
  condition?: string;
  stackingRule?: StackingRule;
  enabledByDefault?: boolean;
  scope?: string;
  notes?: string;
}

export interface CyberwareDefinition {
  code: string;
  name: string;
  source?: string;
  sourceType?: SourceType;
  kind: 'cyberware';
  cyberwareType: CyberwareType;
  install?: InstallType | 'n/a';
  cost?: number | null;
  costCategory?: string | null;
  humanityLossAverage?: number | null;
  humanityLossDice?: string | null;
  foundational?: boolean;
  maxInstalled?: number;
  optionSlotsProvided?: number | null;
  optionSlotsRequired?: number | null;
  slotCost?: number | { perCybereye?: number; perCyberleg?: number; perCyberarm?: number };
  cyberdeckHardwareSlotsRequired?: number | null;
  bodyLocation?: string | null;
  requires?: StructuredRequirement[];
  incompatibleWith?: string[];
  countMode?: CountMode;
  permitsMultiple?: boolean;
  unique?: boolean;
  paired?: boolean;
  parentType?: string | null;
  allowedParentTypes?: string[];
  container?: boolean;
  allowedContainedTypes?: string[];
  effects?: ItemEffect[];
  legacyEffects?: ItemEffect[];
  weaponProfile?: Partial<WeaponDefinition>;
  requiresGmApproval?: boolean;
  specialRules?: string[];
  legacyDesc?: string;
  legacyRequirements?: string;
}

export const CYBERWARE_TYPES: CyberwareType[] = [
  'fashionware',
  'neuralware',
  'chipware',
  'cyberoptics',
  'cyberaudio',
  'internal',
  'external',
  'cyberarm',
  'cyberleg',
  'borgware',
  'cyberdeck-hardware',
  'cyberweapon',
  'unknown',
];

export function isCyberwareDefinition(value: unknown): value is CyberwareDefinition {
  const v = value as Partial<CyberwareDefinition> | null | undefined;
  return !!v && v.kind === 'cyberware' && typeof v.code === 'string' && typeof v.name === 'string';
}
