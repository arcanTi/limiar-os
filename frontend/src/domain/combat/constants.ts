// Damage-roll dice-face patterns that trigger a combat mechanic. Real game
// rules (not presentation) — 2+ sixes = a standard Critical Injury (+5 direct
// dmg, roll on the Body/Head table); 3+ sixes also still qualifies here, so
// both rules fire together on a 3x6 — deliberate stacking, not a bug: the
// table result and the Tarot draw are independent effects.

export interface RollTrigger {
  id: string;
  face: number;
  sides: number;
  threshold: number;
  scope: string;
  label: string;
}

export const ROLL_TRIGGERS: RollTrigger[] = [
  { id: 'criticalInjury', face: 6, sides: 6, threshold: 2, scope: 'damage', label: 'CRITICAL INJURY' },
  { id: 'tarotDraw', face: 6, sides: 6, threshold: 3, scope: 'damage', label: 'NIGHT CITY TAROT' },
];

export interface DieResult {
  sides: number | null;
  value: number;
}

export interface RollTriggerResult {
  scope?: string;
  dice?: DieResult[];
}

export function evaluateRollTriggers(result: RollTriggerResult, triggers: RollTrigger[] = ROLL_TRIGGERS) {
  const scope = result && result.scope ? result.scope : 'damage';
  const dice = Array.isArray(result && result.dice) ? result.dice! : [];
  return triggers.filter(rule => rule.scope === scope).map(rule => {
    const matched = dice.filter(die => Number(die.sides) === Number(rule.sides) && Number(die.value) === Number(rule.face));
    return { rule, matched };
  }).filter(match => match.matched.length >= match.rule.threshold);
}
