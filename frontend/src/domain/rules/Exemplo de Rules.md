// Canonical CPR rules reference for Limiar OS.
// Keep this in sync with data/canonical/cpr-canonical-rules.json.

export const CPR_SOURCE_TYPES = [
  'official-core',
  'official-dlc',
  'official-supplement',
  'homebrew-limiar',
  'unvalidated',
] as const;

export const CPR_OFFICIAL_STATS = [
  'INT',
  'REF',
  'DEX',
  'TECH',
  'COOL',
  'WILL',
  'LUCK',
  'MOVE',
  'BODY',
  'EMP',
] as const;

export const CPR_SKILL_ALIASES = {
  'Melee Weapons': 'Melee Weapon',
  'Weapon Tech': 'Weaponstech',
  'Weapons Tech': 'Weaponstech',
  'Photograph/Film': 'Photography/Film',
  'Street Slang': 'Streetslang',
  'Language (Street Slang)': 'Language (Streetslang)',
} as const;

export const CPR_INVALID_SKILL_LIKE_FIELDS = {
  'Evidence Collection': 'Convert to contextual effect or remove automatic bonus.',
  Disguise: 'Convert to contextual effect, or split into Acting and Wardrobe & Style only when an explicit rule says so.',
  'Pericia Selecionada (definir na instalacao)': 'Convert to selectedSkillBonus.',
  'Perception (as cegas/no escuro)': 'Convert to senseMode or conditionalSkillBonus.',
  'Perception (deteccao por radar/sonar)': 'Convert to senseMode.',
  'Athletics (natacao)': 'Convert to movementMode or conditionalSkillBonus.',
  MOVE_ao_patinar: 'Convert to movementMode.',
} as const;

export const CPR_WEAPON_QUALITY_VALUES = ['poor', 'standard', 'excellent'] as const;

export const CPR_COMBAT_RULES = {
  attackRoll: {
    formula: 'STAT + Skill + 1d10 + modifiers',
    tieRule: 'attacker must beat DV; defender wins ties in opposed melee/evasion contexts',
  },
  meleeCombat: {
    formula: 'Attacker DEX + Melee/Brawling Skill + 1d10 vs Defender DEX + Evasion + 1d10',
    reach: '2m/yds unless weapon says otherwise',
    meleeWeaponsIgnoreHalfArmor: true,
    meleeArmorRounding: 'round up defender armor half ignored; effectiveSP = ceil(SP / 2)',
  },
  brawling: {
    skill: 'Brawling',
    rof: 2,
    ignoresHalfArmor: false,
    damageByBody: [
      { maxBody: 4, damage: '1d6' },
      { minBody: 5, maxBody: 6, damage: '2d6' },
      { minBody: 7, maxBody: 10, damage: '3d6' },
      { minBody: 11, damage: '4d6' },
    ],
    cyberarmMinimumDamage: '2d6',
  },
  damage: {
    subtractArmorSPBeforeHP: true,
    ablateArmorOnlyIfDamageGetsThrough: true,
    ablationAmount: 1,
    criticalInjuryBonusDamage: 5,
    criticalInjuryBonusDamageBypassesArmor: true,
    criticalInjuryBonusDamageNotModifiedByHitLocation: true,
  },
  headAimedShot: {
    afterArmorMultiplier: 2,
    spotWeaknessOrder: 'weapon damage + Spot Weakness, subtract SP, then multiply penetrating damage by 2',
  },
  autofire: {
    baseDamage: '2d6',
    multiplierSource: 'attackMargin',
    multiplierCap: 'weapon.autofire.multiplier',
    spotWeaknessOrder: 'multiply Autofire damage first, then add Spot Weakness, then subtract SP',
  },
  rangedEvasion: {
    evasionCheckSetsDV: true,
    evasionDeclaredBeforeAttackRoll: true,
  },
  areaAttack: {
    cannotTargetHead: true,
    armorAblationLocation: 'body',
    criticalInjuryIfTwoOrMoreSixes: true,
    criticalInjuryLocation: 'body',
    separateCriticalRollPerTarget: true,
  },
  rangeDV: {
    mode: 'explicitDVRequired',
    note: 'Do not invent full Range DV Table here. Resolver accepts targetDV or evasionDV from context.',
  },
} as const;

export const CPR_CRITICAL_INJURY_RULES = {
  trigger: {
    twoOrMoreSixesOnDamage: true,
    appliesTo: ['melee', 'ranged', 'autofire', 'area'],
    bonusDamage: 5,
    bonusDamageBypassesArmor: true,
    bonusDamageAblatesArmor: false,
    bonusDamageModifiedByHitLocation: false,
    injuryInflictedEvenIfNoDamagePenetratesArmor: true,
  },
  duplicateHandling: {
    rerollIfTargetAlreadyHasSameCriticalInjury: true,
  },
  tableSelection: {
    head: 'Use head table only when attack was an Aimed Shot to the head.',
    body: 'Use body table by default.',
    area: 'Area attacks always use body table.',
  },
  areaAttackCriticals: {
    ifDamageRollHasTwoOrMoreSixes: 'every target hit receives a Body Critical Injury',
    rollCriticalSeparatelyPerTarget: true,
  },
  deathSavePenalty: {
    baseDeathSavePenaltyField: 'baseDeathSavePenalty',
    criticalInjuriesCanIncreaseBaseDeathSavePenalty: true,
  },
} as const;

export const CPR_CORE_RANGED_WEAPON_PROFILES = {
  'Medium Pistol': { weaponSkill: 'Handgun', damage: '2d6', magazine: 12, ammoType: 'M Pistol', rof: 2, handsRequired: 1, concealable: true, cost: 50, costCategory: 'Costly' },
  'Heavy Pistol': { weaponSkill: 'Handgun', damage: '3d6', magazine: 8, ammoType: 'H Pistol', rof: 2, handsRequired: 1, concealable: true, cost: 100, costCategory: 'Premium' },
  'Very Heavy Pistol': { weaponSkill: 'Handgun', damage: '4d6', magazine: 8, ammoType: 'VH Pistol', rof: 1, handsRequired: 1, concealable: false, cost: 100, costCategory: 'Premium' },
  SMG: { weaponSkill: 'Handgun', damage: '2d6', magazine: 30, ammoType: 'M Pistol', rof: 1, handsRequired: 1, concealable: true, cost: 100, costCategory: 'Premium', special: ['Autofire 3', 'Suppressive Fire'] },
  'Heavy SMG': { weaponSkill: 'Handgun', damage: '3d6', magazine: 40, ammoType: 'H Pistol', rof: 1, handsRequired: 1, concealable: false, cost: 100, costCategory: 'Premium', special: ['Autofire 3', 'Suppressive Fire'] },
  Shotgun: { weaponSkill: 'Shoulder Arms', damage: '5d6', magazine: 4, ammoType: 'Slug', rof: 1, handsRequired: 2, concealable: false, cost: 500, costCategory: 'Expensive', special: ['Shotgun Shell compatible'] },
  'Assault Rifle': { weaponSkill: 'Shoulder Arms', damage: '5d6', magazine: 25, ammoType: 'Rifle', rof: 1, handsRequired: 2, concealable: false, cost: 500, costCategory: 'Expensive', special: ['Autofire 4', 'Suppressive Fire'] },
  'Sniper Rifle': { weaponSkill: 'Shoulder Arms', damage: '5d6', magazine: 4, ammoType: 'Rifle', rof: 1, handsRequired: 2, concealable: false, cost: 500, costCategory: 'Expensive' },
  'Bows & Crossbows': { weaponSkill: 'Archery', damage: '4d6', magazine: null, ammoType: 'Arrow', rof: 1, handsRequired: 2, concealable: false, cost: 100, costCategory: 'Premium' },
  'Grenade Launcher': { weaponSkill: 'Heavy Weapons', damage: '6d6', magazine: 2, ammoType: 'Grenade', rof: 1, handsRequired: 2, concealable: false, cost: 500, costCategory: 'Expensive', special: ['Explosive'] },
  'Rocket Launcher': { weaponSkill: 'Heavy Weapons', damage: '8d6', magazine: 1, ammoType: 'Rocket', rof: 1, handsRequired: 2, concealable: false, cost: 500, costCategory: 'Expensive', special: ['Explosive'] },
} as const;

export const CPR_CORE_MELEE_WEAPON_PROFILES = {
  'Light Melee Weapon': { weaponSkill: 'Melee Weapon', damage: '1d6', rof: 2, handsRequired: 'varies', concealable: true, cost: 50, costCategory: 'Costly' },
  'Medium Melee Weapon': { weaponSkill: 'Melee Weapon', damage: '2d6', rof: 2, handsRequired: 'varies', concealable: false, cost: 50, costCategory: 'Costly' },
  'Heavy Melee Weapon': { weaponSkill: 'Melee Weapon', damage: '3d6', rof: 2, handsRequired: 'varies', concealable: false, cost: 100, costCategory: 'Premium' },
  'Very Heavy Melee Weapon': { weaponSkill: 'Melee Weapon', damage: '4d6', rof: 1, handsRequired: 'varies', concealable: false, cost: 500, costCategory: 'Expensive' },
} as const;

export const CPR_HOMEBREW_LIMIAR_RESERVED_ITEMS = [
  'MANTIS-BLADE',
  'MONOWIRE',
  'COMBAT-TAIL',
  'GORILLA-ARMS',
  'ENH-HYD-RAM',
  'ENH-PNEU-ACT',
  'ENH-TUNG-REIN',
  'ENH-DBL-EDGE',
  'ENH-MONO-EDG',
  'ENH-BARB-LIN',
  'ENH-ELECTRO',
  'ENH-THERMAL',
] as const;

export const CPR_UNVALIDATED_ITEMS = [
] as const;

export const CPR_CANONICAL_RULES = {
  sourceTypes: CPR_SOURCE_TYPES,
  officialStats: CPR_OFFICIAL_STATS,
  skillAliases: CPR_SKILL_ALIASES,
  invalidSkillLikeFields: CPR_INVALID_SKILL_LIKE_FIELDS,
  weaponQualities: CPR_WEAPON_QUALITY_VALUES,
  combatRules: CPR_COMBAT_RULES,
  criticalInjuryRules: CPR_CRITICAL_INJURY_RULES,
  coreRangedWeaponProfiles: CPR_CORE_RANGED_WEAPON_PROFILES,
  coreMeleeWeaponProfiles: CPR_CORE_MELEE_WEAPON_PROFILES,
  homebrewLimiarReservedItems: CPR_HOMEBREW_LIMIAR_RESERVED_ITEMS,
  unvalidatedItems: CPR_UNVALIDATED_ITEMS,
} as const;

export type CprSourceType = typeof CPR_SOURCE_TYPES[number];
export type CprOfficialStat = typeof CPR_OFFICIAL_STATS[number];
export type CprWeaponQuality = typeof CPR_WEAPON_QUALITY_VALUES[number];
