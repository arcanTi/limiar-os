import { LIMIAR_TAROT_CARDS } from '../domain/tarot/constants.ts';
import type { TarotCard } from '../domain/tarot/constants.ts';
import { normalizeTarotOrder, normalizeTarotState, resolveTarotEffects, tarotHistoryRows } from '../domain/tarot/index.ts';
import type { TarotDrawEntry, TarotResolveContext, TarotResolveResult, TarotState } from '../domain/tarot/index.ts';

interface TarotStateApi {
  set: (state: TarotState & { updatedAt: string }) => Promise<unknown>;
}

export interface ResolveTarotDrawApi {
  tarot?: { state: TarotStateApi };
}

export interface ResolveTarotDrawInput {
  tarotState: unknown;
  force?: boolean;
  rng?: () => number;
  clock?: () => Date;
}

export interface ResolveTarotDrawResult {
  ok: boolean;
  error?: string | null;
  card?: TarotCard;
  tarotState?: TarotState;
  tarotDeck?: number[];
  tarotHistory?: (TarotDrawEntry & { color: string; fx: string })[];
}

// Draws the next card from the (already-shuffled) deck and resolves a card's
// effect tree against a combat context. FX/animation stay in the UI — this
// returns the drawn card + updated deck state; the view decides when/how to
// animate it. Persists the deck state via the injected api client.
export default class ResolveTarotDraw {
  api?: ResolveTarotDrawApi;
  rng: () => number;
  clock: () => Date;

  constructor({ api, rng = Math.random, clock = () => new Date() }: { api?: ResolveTarotDrawApi; rng?: () => number; clock?: () => Date } = {}) {
    this.api = api;
    this.rng = rng;
    this.clock = clock;
  }

  async execute({ tarotState, force = false, rng, clock }: ResolveTarotDrawInput): Promise<ResolveTarotDrawResult> {
    const roll = rng || this.rng;
    const now = clock || this.clock;
    const currentState = normalizeTarotState(tarotState, { rng: roll, clock: now });
    if (currentState.drawnThisSession && !force) return { ok: false, error: null };

    const deck = normalizeTarotOrder(currentState.order, roll);
    const idx = deck.pop() as number;
    deck.unshift(idx);
    const card = LIMIAR_TAROT_CARDS[idx] || LIMIAR_TAROT_CARDS[0];
    const ts = now().toISOString();
    const drawEntry: TarotDrawEntry = { n: card.n, name: card.name, ts };
    const historyEntry: TarotDrawEntry = { ...drawEntry, sessionId: currentState.sessionId };
    const nextState: TarotState = {
      ...currentState,
      order: deck,
      seen: currentState.seen.includes(idx) ? currentState.seen : [...currentState.seen, idx],
      drawnThisSession: drawEntry,
      history: [...currentState.history, historyEntry],
    };

    if (this.api && this.api.tarot) {
      try {
        await this.api.tarot.state.set({ ...nextState, updatedAt: now().toISOString() });
      } catch (err) {
        return { ok: false, error: 'Falha ao persistir tarot: ' + (err as Error).message };
      }
    }

    return {
      ok: true,
      card,
      tarotState: nextState,
      tarotDeck: nextState.order,
      tarotHistory: tarotHistoryRows(nextState.history),
    };
  }

  resolveEffects({ card, context }: { card: TarotCard; context: TarotResolveContext | null | undefined }): TarotResolveResult {
    return resolveTarotEffects(card, context);
  }
}
