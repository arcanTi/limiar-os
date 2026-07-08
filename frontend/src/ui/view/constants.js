import { skillCanonicalName } from '../../domain/character/index.ts';

// Product rarity → accent color, keyed by the catalog's costCategory tier.
export const LIMIAR_TIER_COLORS = {
  Everyday: '#9a9883',
  Costly: '#3fe0d0',
  Premium: '#d6aa4e',
  Expensive: '#c0635b',
  'Very Expensive': '#b388ff',
  Luxury: '#ff6b5f',
  'Super Luxury': '#f0ead8',
};

export function weaponRollTone(weapon) {
  const skill = skillCanonicalName(weapon && weapon.skill);
  const weaponType = String((weapon && (weapon.weaponType || weapon.weaponClass || weapon.type)) || '').toLowerCase();
  if (['Melee Weapon', 'Martial Arts'].includes(skill) || weaponType.includes('melee')) {
    return { key: 'melee', label: 'MELEE', color: '#b56cff', rgb: '181,108,255' };
  }
  if (skill === 'Brawling' || weaponType.includes('brawling')) {
    return { key: 'brawl', label: 'BRAWL', color: '#e06b4f', rgb: '224,107,79' };
  }
  if (skill === 'Handgun' || weaponType.includes('pistol') || weaponType.includes('smg')) {
    return { key: 'handgun', label: 'HANDGUN', color: '#d6aa4e', rgb: '214,170,78' };
  }
  if (['Shoulder Arms', 'Archery'].includes(skill) || weaponType.includes('rifle') || weaponType.includes('shotgun') || weaponType.includes('bow')) {
    return { key: 'ranged', label: 'RANGED', color: '#4fb7ff', rgb: '79,183,255' };
  }
  if (skill === 'Heavy Weapons' || weaponType.includes('launcher')) {
    return { key: 'heavy', label: 'HEAVY', color: '#ff5f6d', rgb: '255,95,109' };
  }
  if (skill === 'Autofire') return { key: 'auto', label: 'AUTO', color: '#9fe83c', rgb: '159,232,60' };
  return { key: 'weapon', label: 'WEAPON', color: '#3fe0d0', rgb: '63,224,208' };
}

// Colors the comms feed by what a roll/request *is* — ranged vs melee vs a
// skill test vs a GM-issued test request — independent of who sent it (that's
// the separate GM/player identity accent). Classifies off the roll's label
// text since chat messages only carry that, not the weapon object itself.
const CHAT_REQUEST_TONE = { color: '#ff9f43', rgb: '255,159,67' };
const CHAT_TEST_TONE = { color: '#8aa6ff', rgb: '138,166,255' };
const CHAT_INITIATIVE_TONE = { color: '#f0ead8', rgb: '240,234,216' };
export function chatRollTone(message) {
  if (!message) return null;
  if (message.kind === 'request') return CHAT_REQUEST_TONE;
  if (message.kind !== 'roll' || !message.roll) return null;
  const label = String(message.roll.label || '').toUpperCase();
  if (/MELEE|MARTIAL|KATANA|BLADE|SWORD|KNIFE|MONOWIRE|WOLVERS|RIPPERS|SCRATCHERS|VAMPYRES/.test(label)) return { color: '#b56cff', rgb: '181,108,255' };
  if (/BRAWL|FIST|KNUCKS|GORILLA/.test(label)) return { color: '#e06b4f', rgb: '224,107,79' };
  if (/PISTOL|SMG|HANDGUN/.test(label)) return { color: '#d6aa4e', rgb: '214,170,78' };
  if (/RIFLE|SHOTGUN|BOW|CROSSBOW|RANGED|SHOULDER/.test(label)) return { color: '#4fb7ff', rgb: '79,183,255' };
  if (/LAUNCHER|ROCKET|GRENADE|HEAVY/.test(label)) return { color: '#ff5f6d', rgb: '255,95,109' };
  if (/AUTOFIRE|\bAUTO\b/.test(label)) return { color: '#9fe83c', rgb: '159,232,60' };
  if (/INICIATIVA|INITIATIVE/.test(label)) return CHAT_INITIATIVE_TONE;
  return CHAT_TEST_TONE;
}

export function trackingToneFromLabel(label, rows = []) {
  const value = String(label || '').trim().toUpperCase();
  const tones = {
    MELEE: { label: 'MELEE', color: '#b56cff', rgb: '181,108,255' },
    BRAWL: { label: 'BRAWL', color: '#e06b4f', rgb: '224,107,79' },
    HANDGUN: { label: 'HANDGUN', color: '#d6aa4e', rgb: '214,170,78' },
    RANGED: { label: 'RANGED', color: '#4fb7ff', rgb: '79,183,255' },
    HEAVY: { label: 'HEAVY', color: '#ff5f6d', rgb: '255,95,109' },
    AUTO: { label: 'AUTO', color: '#9fe83c', rgb: '159,232,60' },
    WEAPON: { label: 'WEAPON', color: '#3fe0d0', rgb: '63,224,208' },
  };
  if (tones[value]) return tones[value];
  const sourceText = rows.map(row => row && row.source).join(' ').toLowerCase();
  if (/katana|blade|sword|knife|melee|monowire|wolvers|rippers|scratchers|vampyres/.test(sourceText)) return tones.MELEE;
  if (/brawl|fist|knucks|gorilla/.test(sourceText)) return tones.BRAWL;
  if (/pistol|smg|handgun/.test(sourceText)) return tones.HANDGUN;
  if (/rifle|shotgun|bow|crossbow/.test(sourceText)) return tones.RANGED;
  if (/launcher|rocket|grenade|heavy/.test(sourceText)) return tones.HEAVY;
  return tones.WEAPON;
}
