import { describe, expect, it, vi } from 'vitest';

import { createApplication } from '../../../src/application/createApplication.ts';

const sequence = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

function fakeApi() {
  return {
    chat: { post: vi.fn() },
    characters: { upsert: vi.fn() },
    combat: { state: { set: vi.fn().mockResolvedValue(undefined), endTurn: vi.fn() } },
  };
}

const actor = {
  id: 'rook',
  name: 'Rook',
  derived: { effectiveStats: { REF: 6 } },
  skills: [{ name: 'Handgun', level: 2 }],
};
const attackWeapon = { name: 'Smart Pistol', skill: 'Handgun', attackMod: 1 };
const damageWeapon = { name: 'Smart Pistol', count: 2, sides: 6, mod: 0 };

function target() {
  return { id: 'vesper', name: 'Vesper', health: { cur: 30, max: 35 }, spDamage: { head: 0, body: 0 }, criticalInjuries: [], equipped: [] };
}

function combatState() {
  return {
    round: 1,
    turnIndex: 0,
    order: ['rook', 'vesper'],
    combatants: {
      rook: { side: 'pc', initiative: 12, acted: false, defeated: false },
      vesper: { side: 'pc', initiative: 8, acted: false, defeated: false },
    },
  };
}

const gmSession = { authAuthenticated: true, authUser: { role: 'admin' } };
const clock = () => new Date('2026-07-06T20:00:00.000Z');

// Runs a full attack -> damage -> end-turn sequence with a fixed rng and
// returns a plain snapshot of the outcome, so the whole pipeline's
// determinism can be checked by re-running it and comparing snapshots.
async function runSequence() {
  const api = fakeApi();
  const app = createApplication({ api, rng: sequence([0.5, 0.99, 0.99, 0.1]), clock });

  const attack = app.rollCombatAttack.execute({ actor, weapon: attackWeapon, session: { gm: true } });

  const damage = app.applyCombatDamage.execute({
    weapon: damageWeapon,
    target: target(),
    currentSp: 5,
    location: 'body',
  });

  const endTurn = await app.endTurn.execute({
    session: gmSession,
    combatState: combatState(),
    currentId: 'rook',
  });

  return {
    attackTotal: attack.total,
    attackFaces: attack.faces,
    damageTotal: damage.total,
    damageFaces: damage.faces,
    damageHpLoss: damage.hpLoss,
    criticalInjuryTriggered: damage.criticalInjuryTriggered,
    nextTurnIndex: endTurn.combatState.turnIndex,
    nextTurnActed: endTurn.combatState.combatants.rook.acted,
  };
}

describe('application combat sequence (attack -> damage -> end turn)', () => {
  it('produces a deterministic, internally-consistent outcome for a fixed rng', async () => {
    const result = await runSequence();

    // mod = REF 6 + skill 2 + weaponAttackMod 1 = 9; face = 1+floor(0.5*10) = 6
    expect(result.attackFaces).toEqual([6]);
    expect(result.attackTotal).toBe(15);

    // damage dice: rng 0.99,0.99 -> [6,6]; total = 12
    expect(result.damageFaces).toEqual([6, 6]);
    expect(result.damageTotal).toBe(12);
    expect(result.criticalInjuryTriggered).toBe(true); // 2 sixes
    expect(result.damageHpLoss).toBe(7); // 12 - 5 SP

    expect(result.nextTurnIndex).toBe(1);
    expect(result.nextTurnActed).toBe(true);
  });

  it('is 100% reproducible: running the sequence 3 times yields identical results', async () => {
    const first = await runSequence();
    const second = await runSequence();
    const third = await runSequence();
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it('persists every step via the injected api client (chat, target character, combat state)', async () => {
    const api = fakeApi();
    const app = createApplication({ api, rng: sequence([0.5, 0.99, 0.99, 0.1]), clock });

    app.rollCombatAttack.execute({ actor, weapon: attackWeapon, session: { gm: true } });
    app.applyCombatDamage.execute({ weapon: damageWeapon, target: target(), currentSp: 5, location: 'body' });
    await app.endTurn.execute({ session: gmSession, combatState: combatState(), currentId: 'rook' });

    expect(api.chat.post).toHaveBeenCalledTimes(1);
    expect(api.characters.upsert).toHaveBeenCalledTimes(1);
    expect(api.characters.upsert.mock.calls[0][0]).toMatchObject({ id: 'vesper', health: { cur: 23, max: 35 } });
    expect(api.combat.state.set).toHaveBeenCalledTimes(1);
  });
});
