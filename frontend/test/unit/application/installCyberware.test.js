import { describe, expect, it, vi } from 'vitest';

import InstallCyberware from '../../../src/application/InstallCyberware.ts';
import limiarSeed from '../../../../data/seed/limiar-seed.json' with { type: 'json' };

const catalog = limiarSeed.items;
const productByCode = (code) => catalog.find((it) => it.code === code);

const GORILLA_ARMS = productByCode('GORILLA-ARMS');
const BIG_KNUCKS = productByCode('BIG-KNUCKS');
// "internal" category pool has capacity 7. These 7 are distinct, requirement-free
// internal cyberware; tagging them with an explicit location (as a properly
// migrated character would have) lets the slot engine actually track pool usage.
const INTERNAL_POOL_FILLERS = ['AUDIOVOX', 'GILLS', 'MUSCLE-LACE', 'NASAL-FILTER', 'ENH-ANTI', 'AIR-SUPP', 'SEX-IMPL']
  .map((code) => ({ ...productByCode(code), location: 'internal' }));
const EIGHTH_INTERNAL_ITEM = { ...productByCode('RAD-SON-INT'), location: 'internal' };

function fakeApi() {
  return { characters: { upsert: vi.fn() } };
}

function character(equipped = []) {
  return { id: 'char-1', base: { BODY: 5, REF: 5, DEX: 5, TECH: 5, COOL: 5, WILL: 5, LUCK: 5, MOVE: 6, INT: 5, EMP: 5 }, equipped };
}

describe('application/InstallCyberware', () => {
  it('installs a plain cyberweapon with no requirements (valid install)', () => {
    const api = fakeApi();
    const useCase = new InstallCyberware({ api });

    const result = useCase.execute({ character: character([]), catalog, product: BIG_KNUCKS, credits: 1000 });

    expect(result.ok).toBe(true);
    expect(result.characterPatch.equipped).toEqual([BIG_KNUCKS]);
    expect(result.characterPatch.owned).toEqual(['BIG-KNUCKS']);
    expect(result.characterPatch.credits).toBe(1000 - BIG_KNUCKS.price);
    expect(result.humanityLossDelta).toBe(BIG_KNUCKS.hcost);
    expect(result.toast).toBe('BIG-KNUCKS INSTALLED (-' + BIG_KNUCKS.hcost + ' HUM)');
    expect(api.characters.upsert).toHaveBeenCalledTimes(1);
    expect(api.characters.upsert.mock.calls[0][0]).toMatchObject({ id: 'char-1', credits: 1000 - BIG_KNUCKS.price });
  });

  it('blocks an install whose requirement is not met (Gorilla Arms needs 2 Cyberarms)', () => {
    const api = fakeApi();
    const useCase = new InstallCyberware({ api });

    const result = useCase.execute({ character: character([]), catalog, product: GORILLA_ARMS, credits: 5000 });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/GORILLA-ARMS nao pode ser instalado/);
    expect(result.issues.some((issue) => issue.type === 'required_cyberware_count_missing')).toBe(true);
    expect(api.characters.upsert).not.toHaveBeenCalled();
  });

  it('blocks an install that overflows a slot pool (8th item into a 7-capacity internal pool)', () => {
    const api = fakeApi();
    const useCase = new InstallCyberware({ api });
    const existing = character(INTERNAL_POOL_FILLERS);

    const result = useCase.execute({ character: existing, catalog, product: EIGHTH_INTERNAL_ITEM, credits: 5000 });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/nao pode ser instalado/);
    expect(result.issues.some((issue) => issue.type === 'slot_capacity_exceeded')).toBe(true);
    expect(api.characters.upsert).not.toHaveBeenCalled();
  });

  it('does not block on a pre-existing issue already present before the install', () => {
    // A character that already has an unmet Gorilla Arms requirement (0
    // Cyberarms installed) still has pre-existing errors. Installing an
    // unrelated, requirement-free item must not be blocked by that baseline.
    const api = fakeApi();
    const useCase = new InstallCyberware({ api });
    const existing = character([GORILLA_ARMS]);

    const result = useCase.execute({ character: existing, catalog, product: BIG_KNUCKS, credits: 5000 });

    expect(result.ok).toBe(true);
  });

  it('is a silent no-op when the item is already installed', () => {
    const api = fakeApi();
    const useCase = new InstallCyberware({ api });
    const result = useCase.execute({ character: character([BIG_KNUCKS]), catalog, product: BIG_KNUCKS, credits: 5000 });
    expect(result).toEqual({ ok: false, error: null });
    expect(api.characters.upsert).not.toHaveBeenCalled();
  });

  it('is a silent no-op when credits are insufficient', () => {
    const api = fakeApi();
    const useCase = new InstallCyberware({ api });
    const result = useCase.execute({ character: character([]), catalog, product: BIG_KNUCKS, credits: 0 });
    expect(result).toEqual({ ok: false, error: null });
    expect(api.characters.upsert).not.toHaveBeenCalled();
  });

  it('is a silent no-op for an out-of-stock item', () => {
    const useCase = new InstallCyberware({ api: fakeApi() });
    const result = useCase.execute({ character: character([]), catalog, product: { ...BIG_KNUCKS, stock: 'SOLD OUT' }, credits: 5000 });
    expect(result).toEqual({ ok: false, error: null });
  });

  it('resolves the installed item through the injected resolveInstallPayload callback', () => {
    const useCase = new InstallCyberware({ api: fakeApi() });
    const resolveInstallPayload = vi.fn((product) => ({ ...product, resolved: true }));

    const result = useCase.execute({ character: character([]), catalog, product: BIG_KNUCKS, credits: 5000, resolveInstallPayload });

    expect(resolveInstallPayload).toHaveBeenCalledWith(BIG_KNUCKS);
    expect(result.characterPatch.equipped[0]).toMatchObject({ code: 'BIG-KNUCKS', resolved: true });
  });
});
