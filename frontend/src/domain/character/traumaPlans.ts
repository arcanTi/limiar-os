// Trauma Team coverage tiers. data/seed/trauma-plans.json is the source of
// truth (see @seed alias in vite.config.js); this array is the bundled
// default. Runtime-mutable: the backend can ship an updated table via
// loadReferenceData, applied through setTraumaPlans (live-binding setter),
// same pattern as tarot cards.
import traumaPlansJson from '@seed/trauma-plans.json';

export interface TraumaPlan {
  key: string;
  label: string;
  pt: string;
  color: string;
  glow: string;
  bg: string;
  response: string;
  eta: string;
  clearance: string;
}

export let LIMIAR_TRAUMA_PLANS: TraumaPlan[] = traumaPlansJson as TraumaPlan[];

export function setTraumaPlans(plans: TraumaPlan[]): void {
  LIMIAR_TRAUMA_PLANS = plans;
}

// Deterministic fallback: hash the character id/name into a stable plan pick
// so operatives without an explicit plan always render the same tier.
export function traumaPlanKey(character: { traumaPlan?: unknown; id?: unknown; name?: unknown } | null | undefined): string {
  const raw = String((character && character.traumaPlan) || '').toLowerCase();
  if (LIMIAR_TRAUMA_PLANS.some(p => p.key === raw)) return raw;
  const source = String((character && (character.id || character.name)) || 'operative');
  const score = source.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return LIMIAR_TRAUMA_PLANS[score % LIMIAR_TRAUMA_PLANS.length].key;
}

export function traumaPlanByKey(key: unknown): TraumaPlan {
  return LIMIAR_TRAUMA_PLANS.find(p => p.key === key) || LIMIAR_TRAUMA_PLANS[0];
}
