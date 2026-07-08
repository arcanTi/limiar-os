import { describe, expect, it, vi } from 'vitest';

import RollCombatAttack from '../../../src/application/RollCombatAttack.ts';

const sequence = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

function fakeApi() {
  return { chat: { post: vi.fn() } };
}

const actor = {
  name: 'Rook',
  derived: { effectiveStats: { REF: 6 } },
  skills: [{ name: 'Handgun', level: 2 }],
};
const weapon = { name: 'Smart Pistol', skill: 'Handgun', attackMod: 1 };
const clock = () => new Date('2026-07-06T12:00:00.000Z');

describe('application/RollCombatAttack', () => {
  it('computes the attack mod (stat + skill + weapon) and rolls 1d10 deterministically', () => {
    const useCase = new RollCombatAttack({ api: fakeApi(), rng: sequence([0.5]), clock });
    const result = useCase.execute({ actor, weapon });
    // mod = REF 6 + skill level 2 + weaponAttackMod 1 = 9; face = 1+floor(0.5*10) = 6
    expect(result.mod).toBe(9);
    expect(result.faces).toEqual([6]);
    expect(result.total).toBe(15);
    expect(result.crit).toBe(false);
    expect(result.fumble).toBe(false);
    expect(result.label).toBe('ROOK :: SMART PISTOL ATAQUE');
  });

  it('rolls a face of 10 as a critical and adds an extra 1d10 (same rng)', () => {
    const useCase = new RollCombatAttack({ api: fakeApi(), rng: sequence([0.95, 0.3]), clock });
    const result = useCase.execute({ actor, weapon });
    expect(result.faces).toEqual([10]);
    expect(result.crit).toBe(true);
    expect(result.outcome).toBe('critical');
    // rolledTotal = 10 + mod(9) = 19; extra = 1+floor(0.3*10) = 4
    expect(result.total).toBe(23);
    expect(result.detail).toContain('+ 4');
  });

  it('rolls a face of 1 as a fumble and subtracts an extra 1d10 (same rng)', () => {
    const useCase = new RollCombatAttack({ api: fakeApi(), rng: sequence([0, 0.3]), clock });
    const result = useCase.execute({ actor, weapon });
    expect(result.faces).toEqual([1]);
    expect(result.fumble).toBe(true);
    expect(result.outcome).toBe('fumble');
    // rolledTotal = 1 + 9 = 10; extra = 4
    expect(result.total).toBe(6);
  });

  it('appends the target label suffix and cyberware/context breakdown', () => {
    const useCase = new RollCombatAttack({ api: fakeApi(), rng: sequence([0.5]), clock });
    const result = useCase.execute({
      actor,
      weapon,
      ctx: { mod: 2, sources: ['+2 Kiroshi Optics'] },
      targetLabelSuffix: ' :: ALVO VESPER',
    });
    expect(result.mod).toBe(11);
    expect(result.label).toBe('ROOK :: SMART PISTOL ATAQUE :: ALVO VESPER');
    expect(result.detail).toContain('+2 (Kiroshi Optics)');
  });

  it('persists the roll to chat via the injected api, tagging role from the session', () => {
    const api = fakeApi();
    const useCase = new RollCombatAttack({ api, rng: sequence([0.5]), clock });
    useCase.execute({ actor, weapon, session: { gm: true } });
    expect(api.chat.post).toHaveBeenCalledTimes(1);
    expect(api.chat.post.mock.calls[0][0]).toMatchObject({ sender: 'Rook', role: 'gm', kind: 'roll' });
  });

  it('tags role "player" when the session is not GM', () => {
    const api = fakeApi();
    const useCase = new RollCombatAttack({ api, rng: sequence([0.5]), clock });
    useCase.execute({ actor, weapon, session: { gm: false } });
    expect(api.chat.post.mock.calls[0][0]).toMatchObject({ role: 'player' });
  });

  it('never calls Math.random when an rng is injected', () => {
    const randomSpy = vi.spyOn(Math, 'random');
    const useCase = new RollCombatAttack({ api: fakeApi(), rng: sequence([0.5]), clock });
    useCase.execute({ actor, weapon });
    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });
});
