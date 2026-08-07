import { describe, expect, it } from 'vitest';

import {
  damageScaleProfile,
  effectiveBodyForDamage,
  gorillaTungstenProfile,
  hasDamageProfile,
  ignoresHalfSpBadge,
  selectedWeaponMode,
  weaponProfile,
  weaponRuntimeAttackMod,
  weaponRuntimeQuality,
} from '../../../src/domain/items/weaponProfileEngine.ts';

import limiarSeed from '../../../../data/seed/limiar-seed.json' with { type: 'json' };

const seedItem = (code) => (limiarSeed.items || []).find((it) => it.code === code);

describe('domain/items/weaponProfileEngine', () => {
  describe('weaponProfile', () => {
    it('reads dmg/count/sides straight off an ordinary weapon item', () => {
      const profile = weaponProfile({ code: 'MEDIUM-PISTOL', dmg: '2d6', skill: 'Handgun', hands: 1 });
      expect(profile).toMatchObject({ count: 2, sides: 6, mod: 0, dmg: '2d6', skill: 'Handgun', hands: 1 });
    });

    it('reads count/sides/skill straight off the seed catalog entry (Wolvers already has its own fields)', () => {
      const wolvers = seedItem('WOLVERS');
      const profile = weaponProfile(wolvers);
      expect(profile).toMatchObject({ count: 3, sides: 6, mod: 0, skill: 'Melee Weapon', melee: true, ignoresHalfArmor: true, weaponClass: 'Heavy Melee Weapon' });
    });

    it('falls back to CYBERWEAPON_PROFILE_OVERRIDES for a bare code lookup (Wolvers)', () => {
      const profile = weaponProfile({ code: 'WOLVERS' });
      expect(profile).toMatchObject({ count: 3, sides: 6, mod: 0, skill: 'Melee Weapons', melee: true, ignoresHalfArmor: true, weaponClass: 'Heavy Melee Weapon' });
    });

    it('carries damageScale through for Gorilla Arms instead of a fixed count/sides (seed catalog shape)', () => {
      const gorilla = seedItem('GORILLA-ARMS');
      const profile = weaponProfile(gorilla);
      // The seed catalog entry's own damageScale (minEffectiveBody/maxEffectiveBody)
      // takes precedence over the CYBERWEAPON_PROFILE_OVERRIDES fallback shape.
      expect(profile.damageScale).toEqual(gorilla.damageScale);
      expect(profile.hands).toBe(1);
    });

    it('falls back to the override damageScale (minBody/maxBody) for a bare code lookup', () => {
      const profile = weaponProfile({ code: 'GORILLA-ARMS' });
      expect(profile.damageScale).toEqual([
        { maxBody: 6, count: 2, sides: 6 },
        { minBody: 7, maxBody: 10, count: 3, sides: 6 },
        { minBody: 11, count: 4, sides: 6 },
      ]);
      expect(profile.hands).toBe(2);
    });

    it('carries riders through for a weapon with a rider (Vampyres)', () => {
      const profile = weaponProfile({ code: 'VAMPYRES' });
      expect(profile.riders).toEqual([{ type: 'poison', note: 'target resists or takes direct HP' }]);
      expect(profile.attackMod).toBe(1);
      expect(profile.quality).toBe('excellent');
    });

    it('resolves a container weapon (Popup Melee Weapon) against its held weapon via resolveProduct', () => {
      const heldWeapon = { code: 'RIPPERS' };
      const resolveProduct = (code) => (code === 'RIPPERS' ? heldWeapon : null);
      const profile = weaponProfile({ code: 'POP-MELEE', container: true, heldWeapon: 'RIPPERS' }, { resolveProduct });
      expect(profile.count).toBe(2);
      expect(profile.sides).toBe(6);
      expect(profile.skill).toBe('Melee Weapons');
      expect(profile.ignoresHalfArmor).toBe(true);
      expect(profile.heldWeaponName).toBe('');
    });

    it('returns null-ish fallback profile when the container has no held weapon and no resolveProduct is given', () => {
      const profile = weaponProfile({ code: 'POP-MELEE', container: true });
      expect(profile.count).toBe(0);
      expect(profile.sides).toBe(0);
      expect(profile.container).toBe(true);
      expect(profile.instantDraw).toBe(true);
    });

    it('recurses through nested containers via resolveProduct', () => {
      const rippers = { code: 'RIPPERS' };
      const resolveProduct = (code) => (code === 'RIPPERS' ? rippers : null);
      const outer = { code: 'POP-MELEE', container: true, heldWeapon: 'RIPPERS' };
      const profile = weaponProfile(outer, { resolveProduct });
      expect(profile.count).toBe(2);
      expect(profile.sides).toBe(6);
    });
  });

  describe('hasDamageProfile', () => {
    it('is true for a weapon with count+sides', () => {
      expect(hasDamageProfile({ count: 2, sides: 6 })).toBe(true);
    });
    it('is true for a weapon with a non-empty damageScale and no fixed count/sides', () => {
      expect(hasDamageProfile({ damageScale: [{ count: 2, sides: 6 }] })).toBe(true);
    });
    it('is false for gear with no dice at all', () => {
      expect(hasDamageProfile({ name: 'Medkit' })).toBe(false);
      expect(hasDamageProfile(null)).toBe(false);
    });
  });

  describe('effectiveBodyForDamage', () => {
    it('reads BODY straight from actor.derived.effectiveStats when present', () => {
      const actor = { derived: { effectiveStats: { BODY: 8 } } };
      expect(effectiveBodyForDamage(actor)).toBe(8);
    });

    it('falls back to normalizeCharacter + derivedStats when derived stats are missing', () => {
      const actor = { base: { BODY: 5 } };
      const normalizeCharacter = (a) => ({ base: a.base });
      const derivedStats = (base) => ({ effectiveStats: { BODY: base.BODY } });
      expect(effectiveBodyForDamage(actor, { normalizeCharacter, derivedStats })).toBe(5);
    });

    it('returns 0 when nothing is injected and actor has no derived stats', () => {
      expect(effectiveBodyForDamage({ base: { BODY: 5 } })).toBe(0);
    });
  });

  describe('damageScaleProfile', () => {
    // The seed catalog entry for GORILLA-ARMS carries its own damageScale using
    // minEffectiveBody/maxEffectiveBody keys (catalog display format), which takes
    // precedence over the CYBERWEAPON_PROFILE_OVERRIDES fallback in weaponProfile.
    // damageScaleProfile itself only understands minBody/maxBody, so exercise it
    // against a bare code lookup that falls through to the override table.
    const gorillaProfile = weaponProfile({ code: 'GORILLA-ARMS' });

    it('picks the low-BODY row', () => {
      const actor = { derived: { effectiveStats: { BODY: 4 } } };
      expect(damageScaleProfile(gorillaProfile, actor)).toMatchObject({ count: 2, sides: 6, mod: 0, reason: 'BODY 4' });
    });

    it('picks the mid-BODY row', () => {
      const actor = { derived: { effectiveStats: { BODY: 8 } } };
      expect(damageScaleProfile(gorillaProfile, actor)).toMatchObject({ count: 3, sides: 6 });
    });

    it('picks the high-BODY row (no maxBody ceiling)', () => {
      const actor = { derived: { effectiveStats: { BODY: 14 } } };
      expect(damageScaleProfile(gorillaProfile, actor)).toMatchObject({ count: 4, sides: 6 });
    });

    it('returns null for a weapon with no damageScale', () => {
      expect(damageScaleProfile({ count: 2, sides: 6 }, {})).toBeNull();
    });
  });

  describe('selectedWeaponMode', () => {
    it('normalizes "heavy" (any casing/spacing) to "Heavy"', () => {
      expect(selectedWeaponMode({ selectedMode: 'heavy' })).toBe('Heavy');
      expect(selectedWeaponMode({ mode: 'HEAVY' })).toBe('Heavy');
    });
    it('normalizes "very heavy" to "Very Heavy"', () => {
      expect(selectedWeaponMode({ activeMode: 'Very Heavy' })).toBe('Very Heavy');
      expect(selectedWeaponMode({ weaponMode: 'veryheavy' })).toBe('Very Heavy');
    });
    it('returns the trimmed raw value for anything else, empty string when unset', () => {
      expect(selectedWeaponMode({ selectedMode: ' Standard ' })).toBe('Standard');
      expect(selectedWeaponMode({})).toBe('');
    });
  });

  describe('gorillaTungstenProfile', () => {
    const tungstenEnhancement = [{ type: 'weaponMode', sourceCode: 'ENH-TUNG-REIN' }];

    it('is null for weapons other than GORILLA-ARMS', () => {
      expect(gorillaTungstenProfile({ code: 'WOLVERS', enhancementEffects: tungstenEnhancement })).toBeNull();
    });
    it('is null when the tungsten enhancement is absent', () => {
      expect(gorillaTungstenProfile({ code: 'GORILLA-ARMS' })).toBeNull();
    });
    it('is null when tungsten is installed but no Heavy/Very Heavy mode is selected', () => {
      expect(gorillaTungstenProfile({ code: 'GORILLA-ARMS', enhancementEffects: tungstenEnhancement, selectedMode: 'Standard' })).toBeNull();
    });
    it('returns the Heavy tungsten profile (3d6, ROF 2)', () => {
      expect(gorillaTungstenProfile({ code: 'GORILLA-ARMS', enhancementEffects: tungstenEnhancement, selectedMode: 'Heavy' })).toMatchObject({ count: 3, sides: 6, rof: 2, mode: 'Heavy' });
    });
    it('returns the Very Heavy tungsten profile (4d6, ROF 1)', () => {
      expect(gorillaTungstenProfile({ code: 'GORILLA-ARMS', enhancementEffects: tungstenEnhancement, selectedMode: 'Very Heavy' })).toMatchObject({ count: 4, sides: 6, rof: 1, mode: 'Very Heavy' });
    });
  });

  describe('weaponRuntimeAttackMod / weaponRuntimeQuality', () => {
    const tungstenEnhancement = [{ type: 'weaponMode', sourceCode: 'ENH-TUNG-REIN' }];

    it('adds +1 attack mod and reports excellent quality when tungsten Heavy mode is active', () => {
      const weapon = { code: 'GORILLA-ARMS', attackMod: 2, quality: 'standard', enhancementEffects: tungstenEnhancement, selectedMode: 'Heavy' };
      expect(weaponRuntimeAttackMod(weapon)).toBe(3);
      expect(weaponRuntimeQuality(weapon)).toBe('excellent');
    });

    it('leaves attack mod/quality untouched when tungsten is not active', () => {
      const weapon = { attackMod: 1, quality: 'poor' };
      expect(weaponRuntimeAttackMod(weapon)).toBe(1);
      expect(weaponRuntimeQuality(weapon)).toBe('poor');
    });
  });

  describe('ignoresHalfSpBadge', () => {
    it('is true for a Melee Weapon that ignores half armor', () => {
      expect(ignoresHalfSpBadge({ ignoresHalfArmor: true, skill: 'Melee Weapon' })).toBe(true);
    });
    it('is true for Martial Arts', () => {
      expect(ignoresHalfSpBadge({ ignoresHalfArmor: true, skill: 'Martial Arts' })).toBe(true);
    });
    it('is false for Brawling even when ignoresHalfArmor is set', () => {
      expect(ignoresHalfSpBadge({ ignoresHalfArmor: true, skill: 'Brawling' })).toBe(false);
    });
    it('is false when ignoresHalfArmor is falsy', () => {
      expect(ignoresHalfSpBadge({ ignoresHalfArmor: false, skill: 'Melee Weapon' })).toBe(false);
    });
  });
});
