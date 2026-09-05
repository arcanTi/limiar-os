import type { LegacyCatalogItem, LegacyWeaponMode } from './legacyCatalogTypes.ts';

export const WEAPON_ATTACHMENT_SLOTS: Record<string, number> = {
  SCOPE: 1,
  'SMARTGUN-LINK': 2,
  'EXTENDED-MAG': 1,
  'DRUM-MAG': 1,
  'UNDERBARREL-SHOTGUN': 2,
  'UNDERBARREL-GL': 2,
  'STUN-BAYONET': 1,
};

export const WEAPON_CLIP_CHART: Record<string, { standard: number; extended: number; drum: number }> = {
  'Medium Pistol': { standard: 12, extended: 18, drum: 36 },
  'Heavy Pistol': { standard: 8, extended: 14, drum: 28 },
  'Very Heavy Pistol': { standard: 8, extended: 14, drum: 28 },
  SMG: { standard: 30, extended: 40, drum: 50 },
  'Heavy SMG': { standard: 40, extended: 50, drum: 60 },
  Shotgun: { standard: 4, extended: 8, drum: 16 },
  'Assault Rifle': { standard: 25, extended: 35, drum: 45 },
  'Sniper Rifle': { standard: 4, extended: 8, drum: 12 },
  'Grenade Launcher': { standard: 2, extended: 4, drum: 6 },
  'Rocket Launcher': { standard: 1, extended: 2, drum: 3 },
};

export interface AttachmentValidation {
  ok: boolean;
  reason: string | null;
  occupiedSlots: number;
  maxSlots: number;
}

const codeOf = (item: LegacyCatalogItem | null | undefined): string => String(item?.code || '').trim().toUpperCase();
const skillOf = (weapon: LegacyCatalogItem): string => String(weapon.weaponSkill || weapon.skill || '').trim();
const typeOf = (weapon: LegacyCatalogItem): string => String(weapon.weaponType || weapon.weaponClass || weapon.type || '').trim();
const installedCodes = (weapon: LegacyCatalogItem): string[] => Array.isArray(weapon.installedAttachments)
  ? weapon.installedAttachments.map(code => String(code).trim().toUpperCase()).filter(Boolean)
  : [];

export function weaponAttachmentMaxSlots(weapon: LegacyCatalogItem): number {
  if (weapon.attachmentSlots != null) return Math.max(0, Number(weapon.attachmentSlots) || 0);
  return weapon.exotic ? 0 : 3;
}

export function occupiedWeaponAttachmentSlots(weapon: LegacyCatalogItem): number {
  return installedCodes(weapon).reduce((total, code) => total + (WEAPON_ATTACHMENT_SLOTS[code] || 1), 0);
}

export function validateAttachmentInstallation(weapon: LegacyCatalogItem, attachment: LegacyCatalogItem): AttachmentValidation {
  const code = codeOf(attachment);
  const installed = installedCodes(weapon);
  const maxSlots = weaponAttachmentMaxSlots(weapon);
  const occupiedSlots = occupiedWeaponAttachmentSlots(weapon);
  const fail = (reason: string): AttachmentValidation => ({ ok: false, reason, occupiedSlots, maxSlots });

  if (!WEAPON_ATTACHMENT_SLOTS[code] || String(attachment.kind || '').toLowerCase() !== 'weaponattachment') {
    return fail('O item selecionado nao e um acessorio de arma suportado.');
  }
  if (['Melee Weapon', 'Martial Arts', 'Brawling'].includes(skillOf(weapon)) || weapon.melee) {
    return fail('Armas corpo a corpo e perfis desarmados nao aceitam acessorios de arma de fogo.');
  }
  if (weapon.exotic && maxSlots === 0) {
    return fail('Armas exoticas nao aceitam acessorios sem slots liberados por uma melhoria de Tecnico.');
  }
  if (installed.includes(code)) return fail('Este acessorio ja esta instalado nesta arma.');
  if (['EXTENDED-MAG', 'DRUM-MAG'].includes(code) && installed.some(row => ['EXTENDED-MAG', 'DRUM-MAG'].includes(row))) {
    return fail('A arma ja possui uma modificacao de carregador instalada.');
  }
  if (['UNDERBARREL-SHOTGUN', 'UNDERBARREL-GL', 'STUN-BAYONET'].includes(code) && skillOf(weapon) !== 'Shoulder Arms') {
    return fail('Este acessorio exige uma arma operada com Shoulder Arms.');
  }
  const magazine = weapon.magazine ?? weapon.mag;
  if (['EXTENDED-MAG', 'DRUM-MAG'].includes(code) && (magazine == null || skillOf(weapon) === 'Archery')) {
    return fail('Esta arma nao usa um carregador compativel.');
  }
  const needed = WEAPON_ATTACHMENT_SLOTS[code];
  if (occupiedSlots + needed > maxSlots) {
    return fail(`Slots insuficientes: ${occupiedSlots}/${maxSlots} ocupados; o acessorio exige ${needed}.`);
  }
  return { ok: true, reason: null, occupiedSlots, maxSlots };
}

const UNDERBARREL_MODES: Record<string, LegacyWeaponMode> = {
  'UNDERBARREL-SHOTGUN': {
    mode: 'underbarrelShotgun', name: 'Underbarrel Shotgun', weaponType: 'Shotgun', weaponSkill: 'Shoulder Arms',
    damage: '5d6', rof: 1, magazine: 2, maxMagazine: 2, currentAmmo: 2, ammoType: 'Slug', attachmentCode: 'UNDERBARREL-SHOTGUN',
  },
  'UNDERBARREL-GL': {
    mode: 'underbarrelGrenadeLauncher', name: 'Underbarrel Grenade Launcher', weaponType: 'Grenade Launcher', weaponSkill: 'Heavy Weapons',
    damage: '6d6', rof: 1, magazine: 1, maxMagazine: 1, currentAmmo: 1, ammoType: 'Grenade', attachmentCode: 'UNDERBARREL-GL',
  },
};

/** Derives runtime stats from the unmodified catalog weapon plus persisted attachment codes. */
export function applyAttachmentEffects(baseWeapon: LegacyCatalogItem, instance: LegacyCatalogItem = baseWeapon): LegacyCatalogItem {
  const installed = installedCodes(instance);
  const rawBaseMagazine = baseWeapon.magazine ?? baseWeapon.mag ?? null;
  const baseMagazine = rawBaseMagazine == null || rawBaseMagazine === '' ? null : Number(rawBaseMagazine);
  const result: LegacyCatalogItem = {
    ...baseWeapon,
    ...instance,
    magazine: baseMagazine,
    mag: baseMagazine,
    concealable: baseWeapon.concealable,
    attackMod: Number(baseWeapon.attackMod || 0),
    installedAttachments: installed,
  };
  const chart = WEAPON_CLIP_CHART[typeOf(baseWeapon)];
  if (chart && installed.includes('DRUM-MAG')) result.magazine = result.mag = chart.drum;
  else if (chart && installed.includes('EXTENDED-MAG')) result.magazine = result.mag = chart.extended;

  if (installed.some(code => ['EXTENDED-MAG', 'DRUM-MAG', 'UNDERBARREL-SHOTGUN', 'UNDERBARREL-GL', 'STUN-BAYONET'].includes(code))) {
    result.concealable = false;
  }
  result.attackMod = Number(baseWeapon.attackMod || 0) + (installed.includes('SMARTGUN-LINK') ? 1 : 0);
  const nativeModes = Array.isArray(baseWeapon.weaponModes)
    ? baseWeapon.weaponModes.filter(mode => !mode.attachmentCode).map(mode => ({ ...mode }))
    : [];
  result.weaponModes = [...nativeModes, ...installed.map(code => UNDERBARREL_MODES[code]).filter(Boolean).map(mode => ({ ...mode }))];
  result.attachmentEffects = installed.map(code => ({
    sourceCode: code,
    type: code === 'SCOPE' ? 'snipingScope' : code === 'SMARTGUN-LINK' ? 'attackModifier' : 'weaponModification',
    value: code === 'SMARTGUN-LINK' ? 1 : true,
  }));
  return result;
}

export function installAttachment(weapon: LegacyCatalogItem, attachment: LegacyCatalogItem): { ok: boolean; weapon: LegacyCatalogItem; reason: string | null } {
  const validation = validateAttachmentInstallation(weapon, attachment);
  if (!validation.ok) return { ok: false, weapon, reason: validation.reason };
  return { ok: true, weapon: { ...weapon, installedAttachments: [...installedCodes(weapon), codeOf(attachment)] }, reason: null };
}

export function removeAttachment(weapon: LegacyCatalogItem, attachmentCode: string): LegacyCatalogItem {
  const code = String(attachmentCode || '').trim().toUpperCase();
  return { ...weapon, installedAttachments: installedCodes(weapon).filter(row => row !== code) };
}
