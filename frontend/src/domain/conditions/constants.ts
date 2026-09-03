// Ad-hoc status-effect presets a GM can apply outside the tarot deck. Tarot
// cards carry their own inline status atoms (see domain/tarot/constants.ts)
// — this catalog is for manual application from the conditions tab.

export interface ConditionDuration {
  value: number;
  unit: 'round' | 'min' | 'hour';
}

export interface StatusPreset {
  id: string;
  label_pt: string;
  duration: ConditionDuration | null;
  modifiers: Record<string, unknown>;
}

export const CPRED_STATUS_PRESETS: StatusPreset[] = [
  { id: 'world_extra_turn', label_pt: 'Turno extra: +5 em testes, ignora Wound States, sem Death Save', duration: { value: 1, unit: 'round' }, modifiers: { actionBonus: 5, ignoreWoundState: true, skipDeathSave: true } },
  { id: 'tower_endure', label_pt: 'Ignora dor e Seriously Wounded', duration: { value: 1, unit: 'hour' }, modifiers: { ignoreSeriouslyWounded: true } },
  { id: 'manual_head_ablation', label_pt: 'Ablacao de armadura: cabeca -1 SP', duration: null, modifiers: { spAblation: { head: 1 } } },
  { id: 'manual_body_ablation', label_pt: 'Ablacao de armadura: corpo -1 SP', duration: null, modifiers: { spAblation: { body: 1 } } },
  { id: 'deadly_on_fire', label_pt: 'Deadly On Fire', duration: null, modifiers: {} },
  { id: 'facedown_lost', label_pt: 'Facedown Perdido: -2 em todas as acoes contra o oponente ate derrota-lo', duration: null, modifiers: { actionBonus: -2 } },
  { id: 'unconscious', label_pt: 'Inconsciente (estabilizado de Mortally Wounded)', duration: { value: 1, unit: 'min' }, modifiers: {} },
  // Suppressive fire after failing its WILL DV15 save. This intentionally has
  // no numeric modifier: the badge is advisory and the GM decides
  // what "suppressed" means at the table (pinned, can't advance, etc).
  { id: 'suppressed', label_pt: 'Suprimido: falhou WILL DV15 contra fogo de supressao', duration: { value: 1, unit: 'round' }, modifiers: {} },
  // Drug states from a failed Resist Torture/Drugs check. CPR describes these
  // in prose rather than as numbers, so the badge carries the narrative and
  // the GM adjudicates — except inebriation, which the book plays as a
  // straight action penalty.
  { id: 'toxin_inebriated', label_pt: 'Embriagado: -2 em todas as acoes', duration: { value: 1, unit: 'hour' }, modifiers: { actionBonus: -2 } },
  { id: 'toxin_suggestible', label_pt: 'Sugestionavel: responde a interrogatorio como se fosse verdade', duration: { value: 10, unit: 'min' }, modifiers: {} },
  { id: 'toxin_designer', label_pt: 'Droga de grife: efeito definido por quem a formulou', duration: { value: 1, unit: 'hour' }, modifiers: {} },
  { id: 'toxin_poisoned', label_pt: 'Envenenado: falhou o teste de Resist Torture/Drugs', duration: null, modifiers: {} },
];
