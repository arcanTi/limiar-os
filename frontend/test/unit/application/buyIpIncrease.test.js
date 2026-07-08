import { describe, expect, it, vi } from 'vitest';

import BuyIpIncrease from '../../../src/application/BuyIpIncrease.ts';
import { CPRED_DEFAULT_SKILLS } from '../../../src/domain/character/constants.ts';

const skillIndex = (name) => CPRED_DEFAULT_SKILLS.findIndex((s) => s.name === name);

function fakeApi() {
  return { characters: { upsert: vi.fn() } };
}

function baseCharacter(overrides = {}) {
  return {
    id: 'char-1',
    base: { INT: 5, REF: 5, DEX: 5, TECH: 5, COOL: 5, WILL: 5, LUCK: 5, MOVE: 6, BODY: 5, EMP: 5 },
    skills: [],
    ip: 200,
    ipLog: [],
    roleAbilityRank: 4,
    ...overrides,
  };
}

describe('application/BuyIpIncrease', () => {
  const rng = () => 0.5;
  const clock = () => new Date('2026-07-06T12:00:00.000Z');

  describe('kind: role', () => {
    it('buys the next Role Ability rank, deducts IP, and persists via the api client', () => {
      const api = fakeApi();
      const useCase = new BuyIpIncrease({ api, rng, clock });
      const character = baseCharacter({ roleAbilityRank: 4, ip: 200 });

      const result = useCase.execute({ character, kind: 'role' });

      expect(result.ok).toBe(true);
      expect(result.characterPatch.roleAbilityRank).toBe(5);
      expect(result.characterPatch.ip).toBe(200 - 150); // ipRoleCost(5) = 5*30
      expect(result.characterPatch.ipLog[0]).toMatchObject({ type: 'spend', amount: -150 });
      expect(result.statePatch).toEqual({ ipRankPurchasedThisSession: true });
      expect(api.characters.upsert).toHaveBeenCalledTimes(1);
      expect(api.characters.upsert.mock.calls[0][0]).toMatchObject({ id: 'char-1', roleAbilityRank: 5 });
    });

    it('rejects when the rank is already at the cap', () => {
      const useCase = new BuyIpIncrease({ api: fakeApi(), rng, clock });
      const result = useCase.execute({ character: baseCharacter({ roleAbilityRank: 10 }), kind: 'role' });
      expect(result).toEqual({ ok: false, error: 'ROLE ABILITY ja esta no limite' });
    });

    it('rejects when the one-rank-per-session limit is active and already used', () => {
      const useCase = new BuyIpIncrease({ api: fakeApi(), rng, clock });
      const result = useCase.execute({
        character: baseCharacter(),
        kind: 'role',
        ipOneRankPerSession: true,
        ipRankPurchasedThisSession: true,
      });
      expect(result).toEqual({ ok: false, error: 'Limite de 1 aumento de rank por sessao ativo' });
    });

    it('rejects when IP is insufficient, without persisting or mutating state', () => {
      const api = fakeApi();
      const useCase = new BuyIpIncrease({ api, rng, clock });
      const result = useCase.execute({ character: baseCharacter({ roleAbilityRank: 4, ip: 10 }), kind: 'role' });
      expect(result).toEqual({ ok: false, error: 'IP insuficiente para Role Ability Rank 5' });
      expect(api.characters.upsert).not.toHaveBeenCalled();
    });
  });

  describe('kind: skill', () => {
    it('buys the next skill level for a non-difficult skill (cost = nextLevel x10)', () => {
      const idx = skillIndex('Concentration');
      const api = fakeApi();
      const useCase = new BuyIpIncrease({ api, rng, clock });
      const character = baseCharacter({ ip: 100 });

      const result = useCase.execute({ character, kind: 'skill', skillIndex: idx });

      expect(result.ok).toBe(true);
      const boughtSkill = result.characterPatch.skills[idx];
      expect(boughtSkill.name).toBe('Concentration');
      expect(boughtSkill.level).toBe(3); // Concentration defaults to level 2 (default skill)
      expect(result.characterPatch.ip).toBe(100 - 30); // ipCost(3, false) = 30
      expect(result.flashMessage).toBe('Concentration LV 3 comprado');
    });

    it('doubles the cost for a Difficult skill', () => {
      const idx = skillIndex('Martial Arts');
      const useCase = new BuyIpIncrease({ api: fakeApi(), rng, clock });
      const result = useCase.execute({ character: baseCharacter({ ip: 100 }), kind: 'skill', skillIndex: idx });
      expect(result.ok).toBe(true);
      expect(result.characterPatch.ip).toBe(100 - 20); // level 0 -> 1, cost = 1*10*2 = 20
    });

    it('rejects a skill already at level 10', () => {
      const idx = skillIndex('Concentration');
      const useCase = new BuyIpIncrease({ api: fakeApi(), rng, clock });
      const character = baseCharacter({ skills: [{ id: 'skill-concentration', name: 'Concentration', stat: 'WILL', level: 10, bonus: 0, difficult: false }] });
      const result = useCase.execute({ character, kind: 'skill', skillIndex: idx });
      expect(result).toEqual({ ok: false, error: 'Concentration ja esta no limite' });
    });

    it('rejects when IP is insufficient', () => {
      const idx = skillIndex('Concentration');
      const useCase = new BuyIpIncrease({ api: fakeApi(), rng, clock });
      const result = useCase.execute({ character: baseCharacter({ ip: 1 }), kind: 'skill', skillIndex: idx });
      expect(result).toEqual({ ok: false, error: 'IP insuficiente para Concentration LV 3' });
    });

    it('clamps an out-of-range skill index to the last skill instead of failing', () => {
      const useCase = new BuyIpIncrease({ api: fakeApi(), rng, clock });
      const result = useCase.execute({ character: baseCharacter(), kind: 'skill', skillIndex: 99999 });
      expect(result.ok).toBe(true);
      expect(result.characterPatch.skills.at(-1).level).toBe(1);
    });
  });

  it('never calls Math.random/Date.now directly (rng/clock are fully injected)', () => {
    const randomSpy = vi.spyOn(Math, 'random');
    const dateSpy = vi.spyOn(Date, 'now');
    const useCase = new BuyIpIncrease({ api: fakeApi(), rng, clock });
    useCase.execute({ character: baseCharacter(), kind: 'role' });
    expect(randomSpy).not.toHaveBeenCalled();
    expect(dateSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
    dateSpy.mockRestore();
  });
});
