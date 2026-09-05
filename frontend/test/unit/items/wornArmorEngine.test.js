import { describe, expect, it } from 'vitest';

import {
  equipWornArmor,
  isWearableArmor,
  repairWornArmor,
  unequipWornArmor,
  wornArmorProfile,
  wornArmorSummary,
} from '../../../src/domain/items/wornArmorEngine.ts';

import seed from '../../../../data/seed/limiar-seed.json';

const catalog = Object.fromEntries(seed.items.map(i => [i.code, i]));
const resolveItem = (row) => ({ ...catalog[row.code], ...row });

const gearRow = (code, extra = {}) => ({ id: code.toLowerCase(), code, name: catalog[code].name, qty: 1, ...extra });

const character = (gear, spDamage = { head: 0, body: 0 }) => ({ gear, spDamage, armor: null });

describe('domain/items/wornArmorEngine profile', () => {
  it('reads the structured armor record the nine wearable rows carry', () => {
    const flak = wornArmorProfile(catalog.FLAK);
    expect(flak).toEqual({
      code: 'FLAK', name: 'Flak', headSp: 15, bodySp: 15, penalty: 4, covers: ['head', 'body'],
    });

    const leathers = wornArmorProfile(catalog.LEATHERS);
    expect(leathers.headSp).toBe(4);
    expect(leathers.penalty).toBe(0);
  });

  it('refuses chrome: a numeric armor value is an implant, not a worn piece', () => {
    // Subdermal/skin-weave style rows carry `armor: 7`. combatArmorEngine
    // already layers those in from the installed list.
    expect(wornArmorProfile({ code: 'X', armor: 7 })).toBeNull();
    expect(wornArmorProfile({ code: 'X' })).toBeNull();
    expect(isWearableArmor(catalog.FLAK)).toBe(true);
  });

  it('covers every wearable row in the catalog', () => {
    const wearable = seed.items.filter(i => i.kind === 'armor');
    expect(wearable.length).toBe(9);
    wearable.forEach(item => {
      const profile = wornArmorProfile(item);
      expect(profile, item.code).not.toBeNull();
      expect(profile.headSp).toBeGreaterThan(0);
      expect(profile.penalty).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('domain/items/wornArmorEngine equip', () => {
  it('writes SP and penalty into character.armor — the write that never existed', () => {
    const c = character([gearRow('FLAK')]);
    const result = equipWornArmor({ character: c, itemId: 'flak', resolveItem });

    expect(result.ok).toBe(true);
    expect(result.patch.armor).toEqual({
      head: { name: 'Flak', sp: 15, penalty: 4 },
      body: { name: 'Flak', sp: 15, penalty: 4 },
    });
    expect(result.patch.gear[0].wornAt).toEqual(['head', 'body']);
    expect(result.patch.gear[0].equipped).toBe(true);
  });

  it('wears a full set on one location only when asked', () => {
    const c = character([gearRow('KEVLAR')]);
    const result = equipWornArmor({ character: c, itemId: 'kevlar', locations: ['body'], resolveItem });

    expect(result.ok).toBe(true);
    expect(result.patch.armor.body.sp).toBe(7);
    expect(result.patch.armor.head).toEqual({ name: '', sp: 0, penalty: 0 });
    expect(result.locations).toEqual(['body']);
  });

  it('holds one piece per location and takes the displaced piece off', () => {
    const c = character([
      gearRow('KEVLAR', { wornAt: ['head', 'body'], equipped: true }),
      gearRow('FLAK'),
    ]);
    const result = equipWornArmor({ character: c, itemId: 'flak', locations: ['body'], resolveItem });

    expect(result.ok).toBe(true);
    expect(result.replaced).toEqual([{ code: 'KEVLAR', name: 'Kevlar', locations: ['body'] }]);
    // Kevlar keeps the head, Flak takes the body.
    expect(result.patch.gear[0].wornAt).toEqual(['head']);
    expect(result.patch.armor.head).toEqual({ name: 'Kevlar', sp: 7, penalty: 0 });
    expect(result.patch.armor.body).toEqual({ name: 'Flak', sp: 15, penalty: 4 });
  });

  it('refuses a location the piece does not cover, and a piece already worn', () => {
    const helmetOnly = { id: 'h', code: 'HELM', name: 'Helm', armor: { headSP: 11, bodySP: 0 } };
    const c = character([helmetOnly]);
    const bad = equipWornArmor({ character: c, itemId: 'h', locations: ['body'], resolveItem: r => r });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe('location-not-covered');

    const worn = character([gearRow('FLAK', { wornAt: ['head', 'body'], equipped: true })]);
    const again = equipWornArmor({ character: worn, itemId: 'flak', resolveItem });
    expect(again.ok).toBe(false);
    expect(again.reason).toBe('already-worn');
  });

  it('refuses anything that is not wearable armor', () => {
    const c = character([{ id: 'ammo', code: 'AMMO-RIFLE', name: 'Rifle Ammunition' }]);
    const result = equipWornArmor({ character: c, itemId: 'ammo', resolveItem });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not-armor');
  });

  it('mirrors the piece\'s own ablation into the location it is worn on', () => {
    const c = character([gearRow('FLAK', { spAblated: 4 })]);
    const result = equipWornArmor({ character: c, itemId: 'flak', resolveItem });
    expect(result.patch.spDamage).toEqual({ head: 4, body: 4 });
  });
});

describe('domain/items/wornArmorEngine unequip and repair', () => {
  it('banks the location\'s ablation onto the piece, so a swap back is not a repair', () => {
    const c = character(
      [gearRow('FLAK', { wornAt: ['head', 'body'], equipped: true, spAblated: 0 })],
      { head: 0, body: 6 },
    );
    const off = unequipWornArmor({ character: c, locations: ['head', 'body'], resolveItem });

    expect(off.ok).toBe(true);
    expect(off.patch.gear[0].spAblated).toBe(6);
    expect(off.patch.gear[0].equipped).toBe(false);
    expect(off.patch.armor.body).toEqual({ name: '', sp: 0, penalty: 0 });
    expect(off.patch.spDamage).toEqual({ head: 0, body: 0 });

    // Putting it back on restores the damage rather than handing over a fresh vest.
    const back = equipWornArmor({ character: { ...c, gear: off.patch.gear }, itemId: 'flak', resolveItem });
    expect(back.patch.spDamage.body).toBe(6);
    expect(back.patch.armor.body.sp).toBe(15);
  });

  it('repairs one point at a time and never past whole', () => {
    const c = character(
      [gearRow('FLAK', { wornAt: ['head', 'body'], equipped: true, spAblated: 5 })],
      { head: 0, body: 5 },
    );

    const one = repairWornArmor({ character: c, location: 'body', amount: 1, resolveItem });
    expect(one.patch.spDamage.body).toBe(4);
    expect(one.patch.gear[0].spAblated).toBe(4);

    const full = repairWornArmor({ character: c, location: 'body', resolveItem });
    expect(full.patch.spDamage.body).toBe(0);
    expect(full.patch.gear[0].spAblated).toBe(0);

    const overshoot = repairWornArmor({ character: c, location: 'body', amount: 99, resolveItem });
    expect(overshoot.patch.spDamage.body).toBe(0);

    const nothing = repairWornArmor({ character: character([]), location: 'head', resolveItem });
    expect(nothing.ok).toBe(false);
  });

  it('summarizes what is worn where', () => {
    const c = character([
      gearRow('KEVLAR', { wornAt: ['head'], equipped: true }),
      gearRow('FLAK', { wornAt: ['body'], equipped: true, spAblated: 3 }),
    ]);
    expect(wornArmorSummary(c, resolveItem)).toEqual([
      { location: 'head', code: 'KEVLAR', name: 'Kevlar', maxSp: 7, currentSp: 7, ablated: 0, penalty: 0, empty: false },
      { location: 'body', code: 'FLAK', name: 'Flak', maxSp: 15, currentSp: 12, ablated: 3, penalty: 4, empty: false },
    ]);

    const bare = wornArmorSummary(character([]), resolveItem);
    expect(bare.every(row => row.empty && row.maxSp === 0)).toBe(true);
  });

  it('reports the damage combat wrote to the character, not just what the row banked', () => {
    // ApplyCombatDamage ablates into character.spDamage while the piece is
    // worn; gear[].spAblated is only stamped on unequip. Reading the row alone
    // showed a pristine vest beside a sheet that already said 12/15.
    const c = character(
      [gearRow('FLAK', { wornAt: ['head', 'body'], equipped: true, spAblated: 0 })],
      { head: 0, body: 3 },
    );
    const [head, body] = wornArmorSummary(c, resolveItem);
    expect(body.currentSp).toBe(12);
    expect(body.ablated).toBe(3);
    expect(head.currentSp).toBe(15);
  });

  it('never reports more damage than the piece can take', () => {
    const c = character(
      [gearRow('LEATHERS', { wornAt: ['body'], equipped: true })],
      { head: 0, body: 99 },
    );
    const body = wornArmorSummary(c, resolveItem)[1];
    expect(body.ablated).toBe(4);
    expect(body.currentSp).toBe(0);
  });
});

describe('worn armor reaches the sheet', () => {
  it('equipping Flak moves SP and the REF/DEX/MOVE tax into derived stats', async () => {
    const { deriveStats } = await import('../../../src/domain/character/derivedStatsEngine.ts');
    const base = { INT: 6, REF: 8, DEX: 7, TECH: 5, COOL: 6, WILL: 7, LUCK: 5, MOVE: 6, BODY: 8, EMP: 6 };
    const bare = { id: 'x', base, gear: [gearRow('FLAK')], spDamage: { head: 0, body: 0 } };

    // Before: the sheet falls back to the default Light Armorjack.
    const before = deriveStats({ stats: base, character: bare });
    expect(before.bodySp).toBe(11);
    expect(before.armorPenalty).toBe(0);

    const equipped = equipWornArmor({ character: bare, itemId: 'flak', resolveItem });
    const after = deriveStats({ stats: base, character: { ...bare, ...equipped.patch } });

    expect(after.headSp).toBe(15);
    expect(after.bodySp).toBe(15);
    expect(after.currentBodySp).toBe(15);
    expect(after.armorPenalty).toBe(4);
    // The tax lands on the three stats CPR charges for heavy armor.
    expect(after.effectiveStats.REF).toBe(8 - 4);
    expect(after.effectiveStats.DEX).toBe(7 - 4);
    expect(after.effectiveStats.MOVE).toBe(6 - 4);
    // and nowhere else.
    expect(after.effectiveStats.BODY).toBe(8);
    expect(after.effectiveStats.COOL).toBe(6);
  });

  it('ablation lowers current SP without touching the piece\'s rating, and repair restores it', async () => {
    const { deriveStats } = await import('../../../src/domain/character/derivedStatsEngine.ts');
    const base = { INT: 6, REF: 8, DEX: 7, TECH: 5, COOL: 6, WILL: 7, LUCK: 5, MOVE: 6, BODY: 8, EMP: 6 };
    const worn = {
      id: 'x', base,
      gear: [gearRow('FLAK', { wornAt: ['head', 'body'], equipped: true, spAblated: 6 })],
      armor: { head: { name: 'Flak', sp: 15, penalty: 4 }, body: { name: 'Flak', sp: 15, penalty: 4 } },
      spDamage: { head: 0, body: 6 },
    };

    const hurt = deriveStats({ stats: base, character: worn });
    expect(hurt.bodySp).toBe(15);
    expect(hurt.currentBodySp).toBe(9);

    const fixed = repairWornArmor({ character: worn, location: 'body', resolveItem });
    const healed = deriveStats({ stats: base, character: { ...worn, ...fixed.patch } });
    expect(healed.currentBodySp).toBe(15);
  });
});

describe('worn armor panel agrees with the sheet', () => {
  it('uses the sheet aggregate, which also counts hand-applied ablation conditions', async () => {
    const { deriveStats } = await import('../../../src/domain/character/derivedStatsEngine.ts');
    const base = { INT: 6, REF: 8, DEX: 7, TECH: 5, COOL: 6, WILL: 7, LUCK: 5, MOVE: 6, BODY: 8, EMP: 6 };
    const worn = {
      id: 'x', base,
      gear: [gearRow('FLAK', { wornAt: ['head', 'body'], equipped: true })],
      armor: { head: { name: 'Flak', sp: 15, penalty: 4 }, body: { name: 'Flak', sp: 15, penalty: 4 } },
      // 2 from combat plus 1 from a GM-applied ablation condition.
      spDamage: { head: 0, body: 2 },
      statusEffects: [{ id: 'manual_body_ablation', modifiers: { spAblation: { body: 1 } } }],
    };

    const derived = deriveStats({ stats: base, character: worn });
    expect(derived.currentBodySp).toBe(12);

    // Reading spDamage alone would say 13 and contradict the sheet.
    const naive = wornArmorSummary(worn, resolveItem)[1];
    expect(naive.currentSp).toBe(13);

    const panel = wornArmorSummary(worn, resolveItem, derived.spAblation)[1];
    expect(panel.currentSp).toBe(derived.currentBodySp);
    expect(panel.ablated).toBe(3);
  });
});
