import { describe, expect, it } from 'vitest';

import BuyIpIncrease from '../../../src/application/BuyIpIncrease.ts';
import InstallCyberware from '../../../src/application/InstallCyberware.ts';
import ToggleCyberwareEnhancement from '../../../src/application/ToggleCyberwareEnhancement.ts';
import RollCombatAttack from '../../../src/application/RollCombatAttack.ts';
import ApplyCombatDamage from '../../../src/application/ApplyCombatDamage.ts';
import EndTurn from '../../../src/application/EndTurn.ts';
import ResolveTarotDraw from '../../../src/application/ResolveTarotDraw.ts';
import { createApplication } from '../../../src/application/createApplication.ts';

describe('application/createApplication', () => {
  it('builds the use-case registry, injecting api/rng/clock into each', () => {
    const api = { characters: { upsert: () => {} } };
    const rng = () => 0.42;
    const clock = () => new Date('2026-01-01T00:00:00.000Z');

    const app = createApplication({ api, rng, clock });

    expect(app.buyIpIncrease).toBeInstanceOf(BuyIpIncrease);
    expect(app.installCyberware).toBeInstanceOf(InstallCyberware);
    expect(app.toggleCyberwareEnhancement).toBeInstanceOf(ToggleCyberwareEnhancement);
    expect(app.rollCombatAttack).toBeInstanceOf(RollCombatAttack);
    expect(app.applyCombatDamage).toBeInstanceOf(ApplyCombatDamage);
    expect(app.endTurn).toBeInstanceOf(EndTurn);
    expect(app.resolveTarotDraw).toBeInstanceOf(ResolveTarotDraw);
    expect(app.buyIpIncrease.api).toBe(api);
    expect(app.buyIpIncrease.rng).toBe(rng);
    expect(app.buyIpIncrease.clock).toBe(clock);
    expect(app.rollCombatAttack.rng).toBe(rng);
    expect(app.applyCombatDamage.rng).toBe(rng);
    expect(app.endTurn.clock).toBe(clock);
    expect(app.resolveTarotDraw.rng).toBe(rng);
  });

  it('defaults rng/clock to Math.random/new Date when omitted', () => {
    const app = createApplication({ api: null });
    expect(app.buyIpIncrease.rng).toBe(Math.random);
    expect(typeof app.buyIpIncrease.clock()).toBe('object');
  });
});
