import { describe, expect, it, vi } from 'vitest';

import ToggleCyberwareEnhancement from '../../../src/application/ToggleCyberwareEnhancement.ts';

function fakeApi() {
  return { characters: { upsert: vi.fn() } };
}

const GORILLA_ARMS = { code: 'GORILLA-ARMS', name: 'Gorilla Arms', enhancements: [] };
const TUNGSTEN = { code: 'ENH-TUNG-REIN', name: 'Tungsten Reinforcement', attachesTo: ['GORILLA-ARMS'] };

function character(equipped) {
  return { id: 'char-1', equipped };
}

describe('application/ToggleCyberwareEnhancement', () => {
  const normalizeEquipped = (equipped) => equipped || [];

  it('attaches a compatible enhancement to its parent', () => {
    const api = fakeApi();
    const useCase = new ToggleCyberwareEnhancement({ api });

    const result = useCase.execute({
      character: character([GORILLA_ARMS, TUNGSTEN]),
      parentCode: 'GORILLA-ARMS',
      enhancementCode: 'ENH-TUNG-REIN',
      normalizeEquipped,
    });

    expect(result.ok).toBe(true);
    const parent = result.characterPatch.equipped.find((it) => it.code === 'GORILLA-ARMS');
    expect(parent.enhancements).toEqual(['ENH-TUNG-REIN']);
    expect(result.flashMessage).toBe('Tungsten Reinforcement vinculado');
    expect(api.characters.upsert).toHaveBeenCalledTimes(1);
  });

  it('detaches an already-attached enhancement (toggle off)', () => {
    const parentWithEnhancement = { ...GORILLA_ARMS, enhancements: ['ENH-TUNG-REIN'] };
    const useCase = new ToggleCyberwareEnhancement({ api: fakeApi() });

    const result = useCase.execute({
      character: character([parentWithEnhancement, TUNGSTEN]),
      parentCode: 'GORILLA-ARMS',
      enhancementCode: 'ENH-TUNG-REIN',
      normalizeEquipped,
    });

    expect(result.ok).toBe(true);
    const parent = result.characterPatch.equipped.find((it) => it.code === 'GORILLA-ARMS');
    expect(parent.enhancements).toEqual([]);
    expect(result.flashMessage).toBe('Tungsten Reinforcement desvinculado');
  });

  it('rejects an enhancement that does not declare the given parent in attachesTo', () => {
    const api = fakeApi();
    const useCase = new ToggleCyberwareEnhancement({ api });
    const incompatibleParent = { code: 'BIG-KNUCKS', name: 'Big Knucks', enhancements: [] };

    const result = useCase.execute({
      character: character([incompatibleParent, TUNGSTEN]),
      parentCode: 'BIG-KNUCKS',
      enhancementCode: 'ENH-TUNG-REIN',
      normalizeEquipped,
    });

    expect(result).toEqual({ ok: false, error: 'Enhancement incompatível' });
    expect(api.characters.upsert).not.toHaveBeenCalled();
  });

  it('rejects when the enhancement code is not installed at all', () => {
    const useCase = new ToggleCyberwareEnhancement({ api: fakeApi() });
    const result = useCase.execute({
      character: character([GORILLA_ARMS]),
      parentCode: 'GORILLA-ARMS',
      enhancementCode: 'ENH-TUNG-REIN',
      normalizeEquipped,
    });
    expect(result).toEqual({ ok: false, error: 'Enhancement incompatível' });
  });

  it('strips the enhancement code from any other item that referenced it before re-attaching', () => {
    // Mirrors the original handler's behavior: every equipped item's
    // enhancements list is scrubbed of enhancementCode first, then re-added
    // only to the (possibly different) parent being toggled.
    const staleHolder = { code: 'OLD-PARENT', name: 'Old Parent', enhancements: ['ENH-TUNG-REIN'] };
    const useCase = new ToggleCyberwareEnhancement({ api: fakeApi() });

    const result = useCase.execute({
      character: character([GORILLA_ARMS, TUNGSTEN, staleHolder]),
      parentCode: 'GORILLA-ARMS',
      enhancementCode: 'ENH-TUNG-REIN',
      normalizeEquipped,
    });

    expect(result.ok).toBe(true);
    const old = result.characterPatch.equipped.find((it) => it.code === 'OLD-PARENT');
    expect(old.enhancements).toEqual([]);
    const parent = result.characterPatch.equipped.find((it) => it.code === 'GORILLA-ARMS');
    expect(parent.enhancements).toEqual(['ENH-TUNG-REIN']);
  });
});
