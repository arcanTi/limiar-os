// Tarot domain: deck normalization, damage computation, and combat-effect
// resolution. Pure — the UI owns drawing/FX/state mutation and calls these.

import { CPRED_CRITICAL_INJURIES } from '../character/constants.ts';
import { LIMIAR_TAROT_CARDS } from './constants.ts';
import type { TarotAtom, TarotCard } from './constants.ts';

export interface TarotDamageOptions {
  atoms?: (TarotAtom | { atom: TarotAtom })[];
  location?: string;
  rolledDamage?: unknown;
}

export interface TarotDamageResult {
  hpLoss: number;
  spAblated: number;
  location: string;
  breakdown: string[];
}

interface TarotVictim {
  derived?: { currentHeadSp?: number; currentBodySp?: number };
}

// Compute HP loss / SP ablation from a victim + resolved damage atoms.
export function computeTarotDamage(victim: TarotVictim | null | undefined, options: TarotDamageOptions): TarotDamageResult {
  const opts = options || {};
  const atoms = (Array.isArray(opts.atoms) ? opts.atoms : []).map(item => ('atom' in item ? item.atom : item)).filter(Boolean);
  const override = atoms.find(atom => atom.type === 'locationOverride' && ['head', 'body'].includes(atom.location || ''));
  const location = override ? override.location! : (opts.location === 'head' ? 'head' : 'body');
  const rolledDamage = Math.max(0, Number(opts.rolledDamage) || 0);
  const damageAtoms = atoms.filter(atom => atom.type === 'damage');
  const preArmorAdds = damageAtoms
    .filter(atom => atom.timing === 'preArmor')
    .reduce((sum, atom) => sum + Math.max(0, Number(atom.amount) || 0), 0);
  const multiplier = damageAtoms.reduce((value, atom) => value * Math.max(1, Number(atom.multiplier) || 1), 1);
  const direct = damageAtoms.some(atom => atom.bypassArmor || atom.timing === 'direct');
  const derived = (victim && victim.derived) || {};
  const currentSP = Math.max(0, Number(location === 'head' ? derived.currentHeadSp : derived.currentBodySp) || 0);
  const gross = rolledDamage + preArmorAdds;
  const engagedArmor = !direct;
  const afterArmor = direct ? gross : Math.max(0, gross - currentSP);
  const finalDamage = Math.max(0, Math.floor(afterArmor * multiplier));
  const spAblated = engagedArmor && currentSP > 0 && afterArmor > 0 ? 1 : 0;
  const breakdown: string[] = [];
  const baseText = preArmorAdds ? '(' + rolledDamage + '+' + preArmorAdds + ')' : String(rolledDamage);
  if (direct) breakdown.push(baseText + ' direto = ' + finalDamage);
  else breakdown.push(baseText + ' -' + currentSP + ' SP = ' + afterArmor);
  if (multiplier !== 1) breakdown.push('x' + multiplier + ' = ' + finalDamage);
  if (spAblated) breakdown.push('armadura ablada -1');
  return { hpLoss: finalDamage, spAblated, location, breakdown };
}

export interface TarotResolveContext {
  wasMelee?: boolean;
  wasRanged?: boolean;
  targetHasCyberware?: boolean;
  targetHasExplosive?: boolean;
  [flag: string]: unknown;
}

export interface TarotResolveResult {
  resolved: TarotAtom[];
  unresolved: string[];
}

// Walk a card's effect tree against a combat context, resolving conditions and
// expanding/annotating critical-injury atoms.
export function resolveTarotEffects(card: TarotCard, context: TarotResolveContext | null | undefined): TarotResolveResult {
  const ctx: TarotResolveContext = Object.assign(
    { wasMelee: false, wasRanged: false, targetHasCyberware: false, targetHasExplosive: false },
    context,
  );
  const resolved: TarotAtom[] = [];
  const unresolved: string[] = [];

  function pushResolved(atom: TarotAtom) {
    if (!atom || atom.type !== 'criticalInjury') {
      resolved.push(atom);
      return;
    }
    const count = Math.max(1, Number(atom.count) || 1);
    for (let i = 0; i < count; i++) {
      const next: TarotAtom = { ...atom };
      delete next.count;
      if (card && card.n === 'XVIII' && atom.injury === 'foreign_object' && count === 2) {
        next.location = i === 0 ? 'body' : 'head';
      }
      resolved.push(next);
    }
  }
  function walk(atom: TarotAtom) {
    if (atom.type !== 'condition') { pushResolved(atom); return; }
    if (!context || context[atom.when!.flag] === undefined) {
      unresolved.push("flag '" + atom.when!.flag + "' not in context — defaulted to " + ctx[atom.when!.flag]);
    }
    const branch = ctx[atom.when!.flag] === atom.when!.equals ? (atom.then || []) : (atom.else || []);
    branch.forEach(walk);
  }

  (card.effects || []).forEach(walk);
  const criticals = resolved.filter(atom => atom && atom.type === 'criticalInjury');
  const multiBonus = criticals.length > 1;
  criticals.forEach(atom => {
    const catalog = CPRED_CRITICAL_INJURIES[atom.injury || ''] || ({} as { bonusDamage?: number });
    atom.bonusDamage = card && card.n === 'XVI' ? 0 : multiBonus ? 5 : Math.max(0, Number(catalog.bonusDamage) || 0);
  });
  return { resolved, unresolved };
}

// --- Deck / draw state normalization ---

// rng is injectable so callers (e.g. the application layer) get a
// deterministic shuffle in tests; defaults to Math.random.
export function shuffleTarotDeck(rng: () => number = Math.random): number[] {
  const deck = LIMIAR_TAROT_CARDS.map((_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function tarotSessionId({ rng = Math.random, clock = () => new Date() }: { rng?: () => number; clock?: () => Date } = {}): string {
  return 'tarot-session-' + clock().getTime().toString(36) + '-' + rng().toString(36).slice(2, 7);
}

export function normalizeTarotOrder(order: unknown, rng: () => number = Math.random): number[] {
  const size = LIMIAR_TAROT_CARDS.length;
  const clean = Array.isArray(order) ? order.map(n => Number(n)).filter(n => Number.isInteger(n) && n >= 0 && n < size) : [];
  const unique = [...new Set(clean)];
  if (clean.length !== size || unique.length !== size) return shuffleTarotDeck(rng);
  return clean;
}

export function normalizeTarotSeen(seen: unknown): number[] {
  const size = LIMIAR_TAROT_CARDS.length;
  const clean = Array.isArray(seen) ? seen.map(n => Number(n)).filter(n => Number.isInteger(n) && n >= 0 && n < size) : [];
  return [...new Set(clean)];
}

interface TarotDrawEntryRef {
  index?: unknown;
  idx?: unknown;
  n?: unknown;
  name?: unknown;
  ts?: string;
  sessionId?: string;
}

export function tarotCardIndexFromEntry(entry: TarotDrawEntryRef | null | undefined): number {
  if (!entry) return -1;
  const direct = Number(entry.index ?? entry.idx);
  if (Number.isInteger(direct) && direct >= 0 && direct < LIMIAR_TAROT_CARDS.length) return direct;
  const n = String(entry.n || '');
  const name = String(entry.name || '');
  return LIMIAR_TAROT_CARDS.findIndex(card => String(card.n) === n || String(card.name) === name);
}

export function tarotCardFromEntry(entry: TarotDrawEntryRef | null | undefined): TarotCard | null {
  const idx = tarotCardIndexFromEntry(entry);
  return idx >= 0 ? LIMIAR_TAROT_CARDS[idx] : null;
}

export interface TarotDrawEntry {
  n: string;
  name: string;
  ts: string;
  sessionId?: string;
}

export function normalizeTarotDrawEntry(entry: TarotDrawEntryRef | null | undefined, sessionId?: string | null, clock: () => Date = () => new Date()): TarotDrawEntry | null {
  const card = tarotCardFromEntry(entry);
  if (!card) return null;
  const out: TarotDrawEntry = {
    n: card.n,
    name: card.name,
    ts: (entry && entry.ts) || clock().toISOString(),
  };
  if (sessionId || (entry && entry.sessionId)) out.sessionId = (entry && entry.sessionId) || sessionId || undefined;
  return out;
}

export interface TarotState {
  order: number[];
  seen: number[];
  sessionId: string;
  drawnThisSession: TarotDrawEntry | null;
  history: TarotDrawEntry[];
  updatedAt: string;
}

export function normalizeTarotState(payload: unknown, { rng = Math.random, clock = () => new Date() }: { rng?: () => number; clock?: () => Date } = {}): TarotState {
  const src = (payload && typeof payload === 'object' ? payload : {}) as Partial<TarotState> & { drawnThisSession?: TarotDrawEntryRef; history?: TarotDrawEntryRef[] };
  const sessionId = String(src.sessionId || tarotSessionId({ rng, clock }));
  const order = normalizeTarotOrder(src.order, rng);
  const history = (Array.isArray(src.history) ? src.history : [])
    .map(entry => normalizeTarotDrawEntry(entry, entry && entry.sessionId, clock))
    .filter(Boolean) as TarotDrawEntry[];
  return {
    order,
    seen: normalizeTarotSeen(src.seen),
    sessionId,
    drawnThisSession: normalizeTarotDrawEntry(src.drawnThisSession, null, clock),
    history,
    updatedAt: src.updatedAt || clock().toISOString(),
  };
}

export function tarotHistoryRows(history: unknown): (TarotDrawEntry & { color: string; fx: string })[] {
  return (Array.isArray(history) ? history : []).slice().reverse().map((entry: TarotDrawEntry) => {
    const card = tarotCardFromEntry(entry) || ({} as Partial<TarotCard>);
    return {
      ...entry,
      color: card.color || '#d6aa4e',
      fx: card.fxLabel || '',
    };
  });
}

export function tarotStatePatch(state: unknown, options: { rng?: () => number; clock?: () => Date }) {
  const normalized = normalizeTarotState(state, options);
  return {
    tarotState: normalized,
    tarotDeck: normalized.order,
    tarotHistory: tarotHistoryRows(normalized.history),
  };
}
