// Cyberware bonus taxonomy. Each entry declares the attributes a bonus of that
// type carries and the UI category it groups under. Pure reference data.

export type CyberBonusCategory = 'passive' | 'toHit' | 'damage' | 'weapon';

export interface CyberBonusTypeSpec {
  attrs: string[];
  category: CyberBonusCategory;
}

export const CYBER_BONUS_TYPES: Record<string, CyberBonusTypeSpec> = {
  flashImmunity: { attrs: [], category: 'passive' },
  deafenImmunity: { attrs: [], category: 'passive' },
  empImmunity: { attrs: [], category: 'passive' },
  spinalInjuryImmunity: { attrs: [], category: 'passive' },
  healingRate: { attrs: ['multiplier'], category: 'passive' },
  rangedBonus: { attrs: ['value', 'condition'], category: 'toHit' },
  damageVsCover: { attrs: ['dice'], category: 'damage' },
  critDamage: { attrs: ['value'], category: 'damage' },
  critRoll: { attrs: ['rolls', 'keep'], category: 'damage' },
  ignoreArmor: { attrs: ['condition'], category: 'damage' },
  armorAblation: { attrs: ['value'], category: 'damage' },
  weaponMode: { attrs: ['modes', 'rof'], category: 'weapon' },
  nonLethalOption: { attrs: [], category: 'damage' },
};
