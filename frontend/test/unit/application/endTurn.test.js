import { describe, expect, it, vi } from 'vitest';

import EndTurn from '../../../src/application/EndTurn.ts';

function fakeApi() {
  return { combat: { state: { set: vi.fn().mockResolvedValue(undefined), endTurn: vi.fn() } } };
}

const gmSession = { authAuthenticated: true, authUser: { role: 'admin' } };
const playerSession = { authAuthenticated: true, authUser: { role: 'player' } };

function state() {
  return {
    round: 1,
    turnIndex: 0,
    order: ['a', 'b'],
    combatants: { a: { side: 'pc', initiative: 10, acted: false, defeated: false }, b: { side: 'pc', initiative: 8, acted: false, defeated: false } },
  };
}

describe('application/EndTurn', () => {
  it('GM path (nextTurn button): advances the turn and persists via api.combat.state.set, no ownership check', async () => {
    const api = fakeApi();
    const clock = () => new Date('2026-07-07T12:00:00.000Z');
    const useCase = new EndTurn({ api, clock });
    const result = await useCase.execute({ session: gmSession, combatState: state(), currentId: 'a' });
    expect(result.ok).toBe(true);
    expect(result.path).toBe('gm');
    expect(result.combatState.turnIndex).toBe(1);
    expect(api.combat.state.set).toHaveBeenCalledTimes(1);
    expect(api.combat.state.set).toHaveBeenCalledWith(expect.objectContaining({ updatedAt: '2026-07-07T12:00:00.000Z' }));
    expect(api.combat.state.endTurn).not.toHaveBeenCalled();
  });

  it('player self-service path: calls the restricted endTurn endpoint and returns a chat message', async () => {
    const api = fakeApi();
    api.combat.state.endTurn.mockResolvedValue({ ...state(), turnIndex: 1 });
    const useCase = new EndTurn({ api });
    const result = await useCase.execute({
      session: playerSession, combatState: state(), currentId: 'a', activeCharacterId: 'a', requireOwnTurn: true, combatantName: 'Rook',
    });
    expect(result.ok).toBe(true);
    expect(result.path).toBe('player');
    expect(api.combat.state.endTurn).toHaveBeenCalledWith('a');
    expect(result.chatMessage).toBe('FIM DE TURNO :: Rook');
  });

  it('player self-service is a silent no-op when it is not their turn', async () => {
    const api = fakeApi();
    const useCase = new EndTurn({ api });
    const result = await useCase.execute({
      session: playerSession, combatState: state(), currentId: 'a', activeCharacterId: 'b', requireOwnTurn: true,
    });
    expect(result).toEqual({ ok: false, error: null });
    expect(api.combat.state.endTurn).not.toHaveBeenCalled();
  });

  it('reports an error when the combat backend is unavailable for the player path', async () => {
    const useCase = new EndTurn({ api: { combat: null } });
    const result = await useCase.execute({
      session: playerSession, combatState: state(), currentId: 'a', activeCharacterId: 'a', requireOwnTurn: true,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/indisponivel/);
  });

  it('reports an error when persisting the GM path fails', async () => {
    const api = fakeApi();
    api.combat.state.set.mockRejectedValue(new Error('network down'));
    const useCase = new EndTurn({ api });
    const result = await useCase.execute({ session: gmSession, combatState: state(), currentId: 'a' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/network down/);
  });

  it('a GM ending their own combatant\'s turn (requireOwnTurn) still takes the GM path, not the restricted endpoint', async () => {
    const api = fakeApi();
    const useCase = new EndTurn({ api });
    const result = await useCase.execute({
      session: gmSession, combatState: state(), currentId: 'a', activeCharacterId: 'a', requireOwnTurn: true,
    });
    expect(result.path).toBe('gm');
    expect(api.combat.state.endTurn).not.toHaveBeenCalled();
  });
});
