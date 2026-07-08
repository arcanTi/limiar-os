// Hardcoded weapon profiles for cyberweapons whose damage/skill/class don't come
// from the product catalog (their catalog entry only carries install/cost data).

export interface CyberweaponProfileOverride {
  count: number | null;
  sides: number | null;
  mod: number;
  skill: string | null;
  melee: boolean;
  ignoresHalfArmor: boolean;
  hands: number;
  concealable: boolean;
  weaponClass: string;
  container?: boolean;
  instantDraw?: boolean;
  damageScale?: { minBody?: number; maxBody?: number; count: number; sides: number }[];
  attackMod?: number;
  quality?: string;
  riders?: { type: string; note: string }[];
  rof?: number | null;
  modes?: string[];
}

export const CYBERWEAPON_PROFILE_OVERRIDES: Record<string, CyberweaponProfileOverride> = {
  'BIG-KNUCKS': { count: 2, sides: 6, mod: 0, skill: 'Brawling', melee: true, ignoresHalfArmor: false, hands: 1, concealable: true, weaponClass: 'Medium Melee Weapon' },
  WOLVERS: { count: 3, sides: 6, mod: 0, skill: 'Melee Weapons', melee: true, ignoresHalfArmor: true, hands: 1, concealable: true, weaponClass: 'Heavy Melee Weapon' },
  'MANTIS-BLADE': { count: 3, sides: 6, mod: 0, skill: 'Melee Weapon', melee: true, ignoresHalfArmor: true, hands: 1, concealable: true, weaponClass: 'Cyberweapon' },
  MONOWIRE: { count: 4, sides: 6, mod: 0, skill: 'Melee Weapon', melee: true, ignoresHalfArmor: true, hands: 1, concealable: true, weaponClass: 'Cyberweapon' },
  SNAKE: { count: 4, sides: 6, mod: 0, skill: 'Melee Weapons', melee: true, ignoresHalfArmor: true, hands: 0, concealable: true, weaponClass: 'Very Heavy Melee Weapon' },
  VAMPYRES: { count: 1, sides: 6, mod: 0, skill: 'Melee Weapon', melee: true, ignoresHalfArmor: true, hands: 0, concealable: true, weaponClass: 'Light Melee Weapon', attackMod: 1, quality: 'excellent', riders: [{ type: 'poison', note: 'target resists or takes direct HP' }] },
  'TALON-FOOT': { count: 1, sides: 6, mod: 0, skill: 'Melee Weapons', melee: true, ignoresHalfArmor: true, hands: 0, concealable: true, weaponClass: 'Light Melee Weapon' },
  'POP-MELEE': { count: null, sides: null, mod: 0, skill: null, melee: true, ignoresHalfArmor: false, hands: 1, concealable: true, weaponClass: 'Popup Melee Weapon', container: true, instantDraw: true },
  RIPPERS: { count: 2, sides: 6, mod: 0, skill: 'Melee Weapons', melee: true, ignoresHalfArmor: true, hands: 1, concealable: true, weaponClass: 'Medium Melee Weapon' },
  SCRATCHERS: { count: 1, sides: 6, mod: 0, skill: 'Melee Weapons', melee: true, ignoresHalfArmor: true, hands: 1, concealable: true, weaponClass: 'Light Melee Weapon' },
  'SLICE-DICE': { count: 2, sides: 6, mod: 0, skill: 'Melee Weapons', melee: true, ignoresHalfArmor: true, hands: 1, concealable: true, weaponClass: 'Medium Melee Weapon' },
  'COMBAT-TAIL': { count: 3, sides: 6, mod: 0, skill: 'Melee Weapon', melee: true, ignoresHalfArmor: true, hands: 0, concealable: false, weaponClass: 'Cyberweapon' },
  'GORILLA-ARMS': { count: null, sides: null, mod: 0, skill: 'Brawling', melee: true, ignoresHalfArmor: false, hands: 2, concealable: false, weaponClass: 'Cyberweapon', damageScale: [{ maxBody: 6, count: 2, sides: 6 }, { minBody: 7, maxBody: 10, count: 3, sides: 6 }, { minBody: 11, count: 4, sides: 6 }] },
};
