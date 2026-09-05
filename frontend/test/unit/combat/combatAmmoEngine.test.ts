import { describe, expect, it } from 'vitest';
import {
  ammunitionFitsWeapon,
  canFireWeapon,
  getRequiredAmmo,
  spendAmmo,
} from '../../../src/domain/combat/combatAmmoEngine.ts';

describe('combat ammunition', () => {
  it('spends one round per single attack and requires ten for automatic fire', () => {
    expect(spendAmmo({}, { currentAmmo: 2 }, 'singleShot').ammoState?.currentAmmo).toBe(1);
    expect(canFireWeapon({}, { currentAmmo: 9 }, 'autofire').canFire).toBe(false);
    expect(spendAmmo({}, { currentAmmo: 10 }, 'autofire').ammoState?.currentAmmo).toBe(0);
  });

  it('uses the special exotic weapon costs', () => {
    expect(getRequiredAmmo({ name: 'Pursuit Security E-TACK Rapid Responder', selectedMode: 'burst', weaponModes: [{ mode: 'burst', ammoCost: 3 }] })).toBe(3);
    expect(getRequiredAmmo({ name: 'Tsunami Arms Helix' }, 'autofire')).toBe(20);
    expect(getRequiredAmmo({ name: 'Teen Dreem', currentAmmo: 7 }, 'autofire')).toBe(7);
    expect(canFireWeapon({ name: 'Teen Dreem', currentAmmo: 1 }, { currentAmmo: 1 }, 'autofire').canFire).toBe(false);
  });

  it('distinguishes shotgun shells/slugs and special projectile calibers', () => {
    const shotgun = { ammoType: 'Slug' };
    expect(ammunitionFitsWeapon(shotgun, { code: 'AMMO-SHELL', ammoType: 'Shell', category: 'AMMUNITION' })).toBe(true);
    expect(ammunitionFitsWeapon(shotgun, { code: 'AMMO-RIFLE', ammoType: 'Rifle', category: 'AMMUNITION' })).toBe(false);
    expect(ammunitionFitsWeapon({ ammoType: 'Arrow' }, { code: 'AMMO-POISON', ammoType: 'Toxin', category: 'AMMUNITION' })).toBe(true);
    expect(ammunitionFitsWeapon({ ammoType: 'Grenade' }, { code: 'AMMO-TEARGAS', ammoType: 'Toxin', category: 'AMMUNITION' })).toBe(true);
  });
});
