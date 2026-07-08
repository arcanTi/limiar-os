import { describe, expect, it, vi } from 'vitest';

import ResolveTarotDraw from '../../../src/application/ResolveTarotDraw.ts';
import { LIMIAR_TAROT_CARDS } from '../../../src/domain/tarot/constants.ts';

function fakeApi() {
  return { tarot: { state: { set: vi.fn().mockResolvedValue(undefined) } } };
}

const fullOrder = Array.from({ length: LIMIAR_TAROT_CARDS.length }, (_, i) => i);
const clock = () => new Date('2026-07-06T12:00:00.000Z');

describe('application/ResolveTarotDraw', () => {
  it('pops the last card off the deck and rotates it to the front', async () => {
    const api = fakeApi();
    const useCase = new ResolveTarotDraw({ api, rng: () => 0, clock });
    const result = await useCase.execute({ tarotState: { order: fullOrder, seen: [], sessionId: 's1', history: [] } });

    expect(result.ok).toBe(true);
    expect(result.card.name).toBe('The World'); // index 21, last in a full unshuffled order
    expect(result.tarotDeck[0]).toBe(21);
    expect(result.tarotDeck).toHaveLength(22);
    expect(result.tarotState.seen).toEqual([21]);
    expect(result.tarotState.drawnThisSession.name).toBe('The World');
    expect(api.tarot.state.set).toHaveBeenCalledTimes(1);
  });

  it('is a silent no-op when a card was already drawn this session and force is not set', async () => {
    const api = fakeApi();
    const useCase = new ResolveTarotDraw({ api, rng: () => 0, clock });
    const first = await useCase.execute({ tarotState: { order: fullOrder, seen: [], sessionId: 's1', history: [] } });
    const second = await useCase.execute({ tarotState: first.tarotState });
    expect(second).toEqual({ ok: false, error: null });
    expect(api.tarot.state.set).toHaveBeenCalledTimes(1);
  });

  it('draws again when forced, even if a card was already drawn this session', async () => {
    const api = fakeApi();
    const useCase = new ResolveTarotDraw({ api, rng: () => 0, clock });
    const first = await useCase.execute({ tarotState: { order: fullOrder, seen: [], sessionId: 's1', history: [] } });
    const second = await useCase.execute({ tarotState: first.tarotState, force: true });
    expect(second.ok).toBe(true);
    expect(second.card.name).toBe('Judgement'); // index 20, now last after the first draw rotated 21 to front
    expect(second.tarotState.seen).toEqual([21, 20]);
    expect(second.tarotState.history).toHaveLength(2);
  });

  it('reshuffles deterministically via the injected rng when the deck is missing/invalid', async () => {
    const api = fakeApi();
    const useCase = new ResolveTarotDraw({ api, rng: () => 0.999999, clock });
    const result = await useCase.execute({ tarotState: { order: [], seen: [], sessionId: 's1', history: [] } });
    expect(result.ok).toBe(true);
    expect(result.tarotDeck).toHaveLength(22);
    expect(new Set(result.tarotDeck).size).toBe(22); // still a valid permutation
  });

  it('reports an error when persistence fails', async () => {
    const api = fakeApi();
    api.tarot.state.set.mockRejectedValue(new Error('offline'));
    const useCase = new ResolveTarotDraw({ api, rng: () => 0, clock });
    const result = await useCase.execute({ tarotState: { order: fullOrder, seen: [], sessionId: 's1', history: [] } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/offline/);
  });

  it('resolveEffects delegates to the pure domain effect-tree walker', () => {
    const useCase = new ResolveTarotDraw({ api: fakeApi() });
    const card = LIMIAR_TAROT_CARDS.find(c => c.n === 'VIII'); // Strength: flat +25 preArmor damage, no conditions
    const { resolved, unresolved } = useCase.resolveEffects({ card, context: {} });
    expect(unresolved).toEqual([]);
    expect(resolved).toEqual([{ type: 'damage', amount: 25, timing: 'preArmor', target: 'victim' }]);
  });

  it('never calls Math.random/Date.now when rng/clock are injected', async () => {
    const randomSpy = vi.spyOn(Math, 'random');
    const dateSpy = vi.spyOn(Date, 'now');
    const useCase = new ResolveTarotDraw({ api: fakeApi(), rng: () => 0, clock });
    await useCase.execute({ tarotState: { order: fullOrder, seen: [], sessionId: 's1', history: [] } });
    expect(randomSpy).not.toHaveBeenCalled();
    expect(dateSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
    dateSpy.mockRestore();
  });
});
