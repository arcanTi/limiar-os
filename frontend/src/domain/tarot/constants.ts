// Tarot card catalog (Major Arcana + combat effects). data/seed/tarot.json is
// the source of truth (see @seed alias in vite.config.js); this array is the
// bundled default. Runtime-mutable: the backend can ship an updated deck via
// loadReferenceData, applied through setTarotCards (live-binding setter).
import tarotCards from '@seed/tarot.json';

export interface TarotAtomCondition {
  flag: string;
  equals: unknown;
}

// A card's `effects` field is a small recursive tree: `condition` atoms carry
// nested `then`/`else` atom lists, every other type is a leaf. All fields
// below are ones actually read by resolveTarotEffects/computeTarotDamage.
export interface TarotAtom {
  type: string;
  when?: TarotAtomCondition;
  then?: TarotAtom[];
  else?: TarotAtom[];
  injury?: string | null;
  location?: string;
  pool?: string;
  chooser?: string;
  count?: number;
  stackPenalty?: boolean;
  target?: string;
  amount?: number | string;
  timing?: string;
  multiplier?: number;
  bypassArmor?: boolean;
  action?: string;
  repairable?: boolean;
  ignorePenetration?: boolean;
  id?: string;
  label_pt?: string;
  duration?: { value: number; unit: string } | null;
  scope?: string;
  modifiers?: Record<string, unknown>;
  note_pt?: string;
  helperRoll?: string;
  onFail?: TarotAtom[];
  bonusDamage?: number;
  direction?: string;
}

export interface TarotCard {
  n: string;
  name: string;
  color: string;
  effect: string;
  img: string;
  fx: string;
  fxLabel: string;
  glyph: string;
  discard: string;
  effects: TarotAtom[];
}

export let LIMIAR_TAROT_CARDS: TarotCard[] = tarotCards as TarotCard[];

export function setTarotCards(cards: TarotCard[]): void {
  LIMIAR_TAROT_CARDS = cards;
}
