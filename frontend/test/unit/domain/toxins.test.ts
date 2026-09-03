import { describe, it, expect } from 'vitest';
import {
  findToxin,
  normalizeToxin,
  normalizeToxinDamage,
  resistCheckTotal,
  resolveToxinExposure,
  toxinAmmunitionFor,
  toxinCatalog,
  toxinFromAmmunition,
  toxinImmunity,
} from '../../../src/domain/toxins/index.ts';

const arsenic = findToxin(null, 'arsenic')!;
const teargas = findToxin(null, 'teargas')!;

function meat(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rook', name: 'Rook', bodyType: 'meat',
    skills: [{ name: 'Resist Torture/Drugs', total: 6, bonus: 0 }],
    installedCyberware: [],
    ...overrides,
  };
}

// Deterministic dice: hands back the queued values in order.
function seq(values: number[], sides = 10) {
  let index = 0;
  return () => {
    const value = values[Math.min(index++, values.length - 1)];
    return (value - 1) / sides + 1e-9;
  };
}

describe('toxin catalog', () => {
  it('exposes the book toxins with their table DV and dice', () => {
    expect(findToxin(null, 'belladonna')).toMatchObject({ resistDV: 11, damage: '1d6' });
    expect(findToxin(null, 'arsenic')).toMatchObject({ resistDV: 13, damage: '2d6' });
    expect(findToxin(null, 'biotoxin')).toMatchObject({ resistDV: 15, damage: '3d6' });
    // Drugs carry no dice — the effect is described, not rolled.
    expect(findToxin(null, 'alcohol')).toMatchObject({ resistDV: 11, damage: '' });
  });

  it('lets a campaign tune damage and DV away from the intensity default', () => {
    const custom = normalizeToxin({ name: 'Neurotox 9', intensity: 'strong', damage: '4d6', resistDV: 17 });
    expect(custom).toMatchObject({ id: 'neurotox-9', resistDV: 17, damage: '4d6', custom: true });
  });

  it('falls back to the intensity defaults when the GM leaves fields blank', () => {
    expect(normalizeToxin({ name: 'X', intensity: 'deadly' })).toMatchObject({ resistDV: 15, damage: '3d6' });
  });

  it('clamps nonsense instead of producing an unplayable toxin', () => {
    expect(normalizeToxin({ name: 'X', resistDV: 999 }).resistDV).toBe(30);
    expect(normalizeToxinDamage('99d99', '1d6')).toBe('10d10');
    expect(normalizeToxinDamage('lixo', '1d6')).toBe('1d6');
    expect(normalizeToxinDamage('2d6+2')).toBe('2d6+2');
  });

  it('lets a custom toxin override a book one under the same id', () => {
    const catalog = toxinCatalog([{ id: 'arsenic', name: 'Arsenico da casa', intensity: 'deadly' }]);
    const rows = catalog.filter(t => t.id === 'arsenic');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Arsenico da casa', resistDV: 15, custom: true });
  });
});

describe('immunity', () => {
  it('spares drones and full body conversions — no meat to poison', () => {
    expect(toxinImmunity({ bodyType: 'drone' }, arsenic).immune).toBe(true);
    expect(toxinImmunity({ bodyType: 'fbc' }, arsenic).immune).toBe(true);
    expect(toxinImmunity({ bodyType: 'meat' }, arsenic).immune).toBe(false);
  });

  it('blocks inhaled toxins with Nasal Filters, and only inhaled ones', () => {
    const filtered = { bodyType: 'meat', installedCyberware: [{ code: 'NASAL-FILTER' }] };
    expect(toxinImmunity(filtered, teargas).immune).toBe(true);
    expect(toxinImmunity(filtered, arsenic).immune).toBe(false);
  });
});

describe('resist check', () => {
  it('adds the Toxin Binders +2 when the skill total has not already counted it', () => {
    const plain = resistCheckTotal(meat());
    expect(plain).toMatchObject({ total: 6, binderBonus: 0 });

    const bound = resistCheckTotal(meat({ installedCyberware: [{ code: 'TOX-BIND' }] }));
    expect(bound).toMatchObject({ total: 8, binderBonus: 2 });
  });

  it('does not double-count the implant when the skill row already carries its bonus', () => {
    const target = meat({
      skills: [{ name: 'Resist Torture/Drugs', total: 8, bonus: 2 }],
      installedCyberware: [{ code: 'TOX-BIND' }],
    });
    expect(resistCheckTotal(target)).toMatchObject({ total: 8, binderBonus: 0 });
  });
});

describe('resolveToxinExposure', () => {
  it('costs nothing on a passed check', () => {
    const result = resolveToxinExposure({ toxin: arsenic, target: meat(), die: 8 });
    expect(result).toMatchObject({ success: true, hpDamage: 0, total: 14 });
    expect(result.summary_pt).toContain('RESISTIU');
  });

  it('deals the full dice straight to HP on a failure', () => {
    // d10 = 2 -> 2 + 6 = 8, under DV 13; then 2d6 damage.
    const result = resolveToxinExposure({ toxin: arsenic, target: meat(), die: 2 }, seq([4, 5], 6));
    expect(result).toMatchObject({ success: false, hpDamage: 9, damageDice: '2d6' });
    expect(result.damageRolls).toEqual([4, 5]);
    expect(result.summary_pt).toContain('sem armadura');
  });

  it('reports immunity without rolling anything', () => {
    const result = resolveToxinExposure({ toxin: arsenic, target: meat({ bodyType: 'drone' }), die: 1 });
    expect(result).toMatchObject({ immune: true, die: null, hpDamage: 0, success: true });
  });

  it('carries the drug status through instead of damage', () => {
    const alcohol = findToxin(null, 'alcohol')!;
    const result = resolveToxinExposure({ toxin: alcohol, target: meat(), die: 1 });
    expect(result).toMatchObject({ success: false, hpDamage: 0, statusPresetId: 'toxin_inebriated' });
  });

  it('applies the GM situational modifier to the check', () => {
    const result = resolveToxinExposure({ toxin: arsenic, target: meat(), die: 6, situationalModifier: -3 });
    expect(result.total).toBe(9);
    expect(result.success).toBe(false);
  });
});

describe('toxin ammunition', () => {
  it('maps the three exotic rounds to their book profile', () => {
    expect(toxinAmmunitionFor('AMMO-BIOTOXIN')).toMatchObject({ cost: 500, resistDV: 15, damage: '3d6' });
    expect(toxinAmmunitionFor('AMMO-POISON')).toMatchObject({ cost: 100, resistDV: 13, damage: '2d6' });
    // crit_head_4 is the head table's "Olho Danificado" (Damaged Eye).
    expect(toxinAmmunitionFor('AMMO-TEARGAS')).toMatchObject({ cost: 50, resistDV: 13, inflictedInjury: 'crit_head_4' });
    expect(toxinAmmunitionFor('AMMO-RIFLE')).toBeNull();
  });

  it('never lets a toxin round add the weapon own damage', () => {
    expect(toxinAmmunitionFor('AMMO-POISON')!.dealsBaseWeaponDamage).toBe(false);
  });

  it('resolves a round through the toxin it delivers, at the round DV', () => {
    const ammo = toxinAmmunitionFor('AMMO-POISON')!;
    const toxin = toxinFromAmmunition(ammo);
    expect(toxin).toMatchObject({ resistDV: 13, damage: '2d6', delivery: 'injected' });

    const result = resolveToxinExposure({ toxin, target: meat(), die: 1 }, seq([6, 6], 6));
    expect(result).toMatchObject({ success: false, hpDamage: 12 });
  });
});

describe('eligible weapons', () => {
  it('offers toxin rounds only to bows and grenades', async () => {
    const { eligibleToxinAmmoFor } = await import('../../../src/domain/toxins/index.ts');
    const bow = eligibleToxinAmmoFor({ name: 'Militech Bow', weaponType: 'Bow' });
    expect(bow.map(r => r.code)).toEqual(['AMMO-BIOTOXIN', 'AMMO-POISON']);

    const grenade = eligibleToxinAmmoFor({ name: 'Grenade Launcher' });
    expect(grenade.map(r => r.code)).toEqual(['AMMO-BIOTOXIN', 'AMMO-POISON', 'AMMO-TEARGAS']);

    expect(eligibleToxinAmmoFor({ name: 'Heavy Pistol', weaponType: 'Handgun' })).toEqual([]);
    expect(eligibleToxinAmmoFor(null)).toEqual([]);
  });
});
