import { describe, expect, it } from 'vitest';

import {
  acquisitionMode,
  hasWeaponStatBlock,
  isCarried,
  isInstallable,
  isTraumaPlan,
  purchaseQuantity,
  armorSp as armorSpOf,
} from '../../../src/domain/items/marketAcquisition.ts';

import seed from '../../../../data/seed/limiar-seed.json';

describe('domain/items/marketAcquisition', () => {
  it('carries merchandise and installs chrome', () => {
    expect(acquisitionMode({ kind: 'ammunition' })).toBe('carry');
    expect(acquisitionMode({ kind: 'weapon' })).toBe('carry');
    expect(acquisitionMode({ kind: 'armor' })).toBe('carry');
    expect(acquisitionMode({ kind: 'gear' })).toBe('carry');
    expect(acquisitionMode({ kind: 'weaponAttachment' })).toBe('carry');

    expect(acquisitionMode({ kind: 'cyberware' })).toBe('install');
    expect(acquisitionMode({ kind: 'cyberweapon' })).toBe('install');
    expect(acquisitionMode({ kind: 'trauma-plan' })).toBe('plan');
  });

  it('treats an unlabelled catalog row as chrome, not merchandise', () => {
    // Legacy cyberware predates the `kind` field. Defaulting these to `carry`
    // would quietly route real chrome around the slot/Humanity engine.
    expect(acquisitionMode({ code: 'CHIP-SOCKET' })).toBe('install');
    expect(acquisitionMode({ kind: null })).toBe('install');
    expect(acquisitionMode(null)).toBe('install');
  });

  it('exposes the mode as predicates', () => {
    expect(isCarried({ kind: 'ammunition' })).toBe(true);
    expect(isInstallable({ kind: 'ammunition' })).toBe(false);
    expect(isInstallable({ kind: 'cyberware' })).toBe(true);
    expect(isTraumaPlan({ kind: 'trauma-plan' })).toBe(true);
  });

  it('keeps the weapon stat block on cyberweapons even though they install', () => {
    expect(hasWeaponStatBlock({ kind: 'cyberweapon' })).toBe(true);
    expect(hasWeaponStatBlock({ kind: 'weapon' })).toBe(true);
    expect(hasWeaponStatBlock({ kind: 'ammunition' })).toBe(false);
  });

  it('reads the pack size so one purchase hands over the whole box', () => {
    expect(purchaseQuantity({ packSize: 10 })).toBe(10);
    expect(purchaseQuantity({ packSize: 1 })).toBe(1);
    expect(purchaseQuantity({})).toBe(1);
    expect(purchaseQuantity({ packSize: 0 })).toBe(1);
    expect(purchaseQuantity({ packSize: 'x' })).toBe(1);
  });

  it('routes the real catalog: no ammunition, armor or gear reaches the install engine', () => {
    const byMode = { install: [], carry: [], plan: [] };
    seed.items.forEach(item => byMode[acquisitionMode(item)].push(item));

    const carriedCategories = new Set(byMode.carry.map(i => i.category));
    expect(carriedCategories.has('AMMUNITION')).toBe(true);
    expect(carriedCategories.has('ARMOR')).toBe(true);
    expect(carriedCategories.has('WEAPONS')).toBe(true);
    expect(carriedCategories.has('WEAPON ATTACHMENTS')).toBe(true);

    // Nothing sold by the pack should ever be an install.
    expect(byMode.install.filter(i => i.packSize)).toEqual([]);
    // Every Trauma Team plan is a subscription, never an object.
    expect(byMode.plan.every(i => i.category === 'TRAUMA TEAM')).toBe(true);
    expect(byMode.plan.length).toBe(4);
  });
});

describe('domain/items/marketAcquisition armor shapes', () => {
  it('reads SP from both the numeric and the structured armor field', async () => {
    const { armorSp, armorPenaltyOf } = await import('../../../src/domain/items/marketAcquisition.ts');

    expect(armorSp({ armor: 4 })).toBe(4);
    expect(armorSp({ armor: { headSP: 15, bodySP: 15 } })).toBe(15);
    expect(armorSp({ armor: { sp: 11 } })).toBe(11);
    expect(armorSp({})).toBe(0);
    expect(armorSp(null)).toBe(0);

    expect(armorPenaltyOf({ armor: { armorPenalty: { REF: -4, DEX: -4, MOVE: -4 } } }))
      .toEqual({ REF: -4, DEX: -4, MOVE: -4 });
    // Zero penalty is "no penalty", not a row of three zeroes.
    expect(armorPenaltyOf({ armor: { armorPenalty: { REF: 0, DEX: 0, MOVE: 0 } } })).toBeNull();
    expect(armorPenaltyOf({ armor: 7 })).toBeNull();
  });

  it('every wearable armor in the catalog reports a usable SP', () => {
    const worn = seed.items.filter(i => i.kind === 'armor');
    expect(worn.length).toBeGreaterThan(0);
    worn.forEach(item => {
      expect(armorSpOf(item)).toBeGreaterThan(0);
    });
  });
});
