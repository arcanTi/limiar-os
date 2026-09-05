import { describe, expect, it } from 'vitest';
import {
  damageShieldItem, dropShieldItem, equipShieldItem, initializeShieldItem,
  repairShieldItem, storeShieldItem,
} from '../../../src/domain/items/shieldLifecycle.ts';

describe('shield item lifecycle', () => {
  it('copies catalog HP onto the acquired instance', () => {
    expect(initializeShieldItem({ code: 'BULLETPROOF-SHIELD', maxHp: 10 })).toMatchObject({ shieldHp: 10, maxHp: 10, shieldLocation: 'carried' });
    expect(initializeShieldItem({ code: 'HIGH-DENSITY-SHIELD', shieldHp: 15, maxHp: 15 })).toMatchObject({ shieldHp: 15, maxHp: 15 });
  });

  it('equips in one arm and rejects a broken shield', () => {
    expect(equipShieldItem({ maxHp: 10, shieldHp: 7 }).shieldLocation).toBe('equipped');
    expect(() => equipShieldItem({ maxHp: 10, shieldHp: 0 })).toThrow('SHIELD_BROKEN');
  });

  it('absorbs only remaining HP, breaks at zero and exposes overflow', () => {
    expect(damageShieldItem({ maxHp: 10, shieldHp: 4, shieldLocation: 'equipped' }, 7)).toEqual({
      item: expect.objectContaining({ shieldHp: 0, maxHp: 10, shieldLocation: 'dropped' }),
      absorbed: 4, overflow: 3, broken: true,
    });
  });

  it('keeps damage while stored or dropped and repairs only up to max HP', () => {
    const damaged = { maxHp: 10, shieldHp: 3, shieldLocation: 'equipped' as const };
    expect(storeShieldItem(damaged)).toMatchObject({ shieldHp: 3, shieldLocation: 'carried' });
    expect(dropShieldItem(damaged)).toMatchObject({ shieldHp: 3, shieldLocation: 'dropped' });
    expect(repairShieldItem(damaged, 99)).toMatchObject({ shieldHp: 10, maxHp: 10 });
  });

  it('allows the normal shield in Popup Shield but rejects High-Density', () => {
    expect(equipShieldItem({ code: 'BULLETPROOF-SHIELD', maxHp: 10 }, { popup: true }).shieldLocation).toBe('equipped');
    expect(() => equipShieldItem({ code: 'HIGH-DENSITY-SHIELD', maxHp: 15, cannotBeInstalledInPopupShield: true }, { popup: true }))
      .toThrow('SHIELD_NOT_POPUP_COMPATIBLE');
  });
});
