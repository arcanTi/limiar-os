import { describe, expect, it, vi } from 'vitest';

import ApplyAreaAttack from '../../../src/application/ApplyAreaAttack.ts';

function fakeApi() {
  return { characters: { upsert: vi.fn().mockResolvedValue(undefined) }, campaignMaps: { resolveTemplate: vi.fn().mockResolvedValue(undefined) } };
}

function target(overrides = {}) {
  return { id: 't1', name: 'Alvo Um', health: { cur: 30, max: 30 }, spDamage: { body: 0 }, armor: { head: { sp: 0 }, body: { sp: 0 } }, installedCyberware: [], criticalInjuries: [], ...overrides };
}

const baseInput = (overrides = {}) => ({
  targets: [target()],
  diceCount: 1,
  diceSides: 6,
  campaignId: 'camp1',
  templateId: 'tpl1',
  expectedRevision: 0,
  ...overrides,
});

describe('application/ApplyAreaAttack', () => {
  it('rolls damage, applies it to every target and resolves the template on full success', async () => {
    const api = fakeApi();
    const useCase = new ApplyAreaAttack({ api, rng: () => 0.99 });
    const result = await useCase.execute(baseInput());

    expect(result.status).toBe('resolved');
    expect(result.succeeded).toEqual([{
      id: 't1', name: 'Alvo Um', hpLoss: 6, ablatedDelta: 0, criticalTriggered: false,
      patch: { health: { cur: 24, max: 30 }, spDamage: { body: 0 } },
    }]);
    expect(api.characters.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', health: { cur: 24, max: 30 } }));
    expect(api.campaignMaps.resolveTemplate).toHaveBeenCalledWith('camp1', { templateId: 'tpl1', expectedRevision: 0 });
  });

  it('on partial failure, keeps only the failed targets in the result and never resolves the template', async () => {
    const api = fakeApi();
    api.characters.upsert.mockImplementation((char) => (char.id === 't2' ? Promise.reject(new Error('network')) : Promise.resolve()));
    const useCase = new ApplyAreaAttack({ api, rng: () => 0.99 });
    const result = await useCase.execute(baseInput({ targets: [target({ id: 't1' }), target({ id: 't2', name: 'Alvo Dois' })] }));

    expect(result.status).toBe('partial');
    expect(result.succeeded.map(s => s.id)).toEqual(['t1']);
    expect(result.failed).toEqual([{ id: 't2', name: 'Alvo Dois' }]);
    expect(api.campaignMaps.resolveTemplate).not.toHaveBeenCalled();
  });

  it('reports resolveFailed and keeps the succeeded damage when the resolve call itself fails', async () => {
    const api = fakeApi();
    api.campaignMaps.resolveTemplate.mockRejectedValue(new Error('revision conflict'));
    const useCase = new ApplyAreaAttack({ api, rng: () => 0.99 });
    const result = await useCase.execute(baseInput());

    expect(result.status).toBe('resolveFailed');
    expect(result.error).toBe('revision conflict');
    expect(result.succeeded).toHaveLength(1);
  });

  it('damageApplied:true skips rolling/patches entirely and only retries the resolve call', async () => {
    const api = fakeApi();
    const useCase = new ApplyAreaAttack({ api, rng: () => 0.99 });
    const result = await useCase.execute(baseInput({ damageApplied: true }));

    expect(result.status).toBe('resolved');
    expect(api.characters.upsert).not.toHaveBeenCalled();
    expect(api.campaignMaps.resolveTemplate).toHaveBeenCalledTimes(1);
  });

  it('ablates armor SP and reports the delta when the roll penetrates', async () => {
    const api = fakeApi();
    const useCase = new ApplyAreaAttack({ api, rng: () => 0.99 });
    const result = await useCase.execute(baseInput({ diceCount: 4, targets: [target({ armor: { head: { sp: 0 }, body: { sp: 5 } } })] }));

    expect(result.succeeded[0].hpLoss).toBe(19);
    expect(result.succeeded[0].ablatedDelta).toBe(1);
  });
});
