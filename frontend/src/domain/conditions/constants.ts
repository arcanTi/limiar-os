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
  // On Fire (CPR RAW p.180): direct HP damage at the END of the burning
  // character's turn, ignoring armor and never ablating it. Putting the fire
  // out costs an Action. See conditions/turnTick.ts for the tick itself.
  { id: 'mild_on_fire', label_pt: 'Em chamas (Mild): 2 de dano direto no fim do turno; apagar custa 1 acao', duration: null, modifiers: { directHpPerTurn: 2, tick: 'end' } },
  { id: 'strong_on_fire', label_pt: 'Em chamas (Strong): 4 de dano direto no fim do turno; apagar custa 1 acao', duration: null, modifiers: { directHpPerTurn: 4, tick: 'end' } },
  { id: 'deadly_on_fire', label_pt: 'Em chamas (Deadly): 6 de dano direto no fim do turno; apagar custa 1 acao', duration: null, modifiers: { directHpPerTurn: 6, tick: 'end' } },
  // Asphyxiation / drowning / vacuum (CPR RAW p.181). Holding breath lasts
  // BODY turns — the GM sets the duration when applying; once it runs out,
  // switch to Asfixiando: BODY direct damage at the START of each turn.
  // Vacuum also drains 1d6 INT/REF/DEX at the end of the turn; INT 0 kills.
  { id: 'holding_breath', label_pt: 'Prendendo a respiracao: dura BODY turnos, depois passa a Asfixiando', duration: { value: 1, unit: 'round' }, modifiers: {} },
  { id: 'asphyxiating', label_pt: 'Asfixiando/afogando: dano direto igual ao BODY no inicio de cada turno', duration: null, modifiers: { directHpPerTurnStat: 'BODY', tick: 'start' } },
  { id: 'vacuum', label_pt: 'No vacuo: BODY de dano direto no inicio do turno e -1d6 INT/REF/DEX no fim; INT 0 mata', duration: null, modifiers: { directHpPerTurnStat: 'BODY', tick: 'start', vacuumStatDrain: true } },
  { id: 'facedown_lost', label_pt: 'Facedown Perdido: -2 em todas as acoes contra o oponente ate derrota-lo', duration: null, modifiers: { actionBonus: -2 } },
  { id: 'unconscious', label_pt: 'Inconsciente (estabilizado de Mortally Wounded)', duration: { value: 1, unit: 'min' }, modifiers: {} },
  // Ambush (CPR RAW): a defender who lost Perception vs the attackers'
  // Stealth cannot Evade anything during the surprise round.
  { id: 'surprised', label_pt: 'Surpreendido: nao pode usar Evasion nesta rodada (emboscada)', duration: { value: 1, unit: 'round' }, modifiers: { cannotEvade: true } },
  // Grapple (CPR RAW p.172): while held, Choke/Throw succeed automatically.
  // `grappledBy` names the attacker; chokeTurns/lastChokeRound track the
  // 3-consecutive-turn knock-out clause (see domain/combat/grapple.ts).
  { id: 'grappled', label_pt: 'Agarrado: o agressor pode Estrangular/Arremessar sem teste', duration: null, modifiers: { grappledBy: '', chokeTurns: 0, lastChokeRound: null } },
  { id: 'grappling', label_pt: 'Agarrando um alvo (uma mao ocupada)', duration: null, modifiers: { grappling: '' } },
  // Suppressive fire after failing the contested WILL + Concentration check
  // against the attacker's roll (see combat.js resolveSuppressiveFireBatch).
  // This intentionally has no numeric modifier: the badge is advisory and
  // the GM decides what "suppressed" means at the table (must dive for cover).
  { id: 'suppressed', label_pt: 'Suprimido: falhou WILL + Concentration contra fogo de supressao; precisa correr pra cobertura', duration: { value: 1, unit: 'round' }, modifiers: {} },
  // Drug states from a failed Resist Torture/Drugs check. CPR describes these
  // in prose rather than as numbers, so the badge carries the narrative and
  // the GM adjudicates — except inebriation, which the book plays as a
  // straight action penalty.
  { id: 'toxin_inebriated', label_pt: 'Embriagado: -2 em todas as acoes', duration: { value: 1, unit: 'hour' }, modifiers: { actionBonus: -2 } },
  { id: 'toxin_suggestible', label_pt: 'Sugestionavel: responde a interrogatorio como se fosse verdade', duration: { value: 10, unit: 'min' }, modifiers: {} },
  { id: 'toxin_designer', label_pt: 'Droga de grife: efeito definido por quem a formulou', duration: { value: 1, unit: 'hour' }, modifiers: {} },
  { id: 'toxin_poisoned', label_pt: 'Envenenado: falhou o teste de Resist Torture/Drugs', duration: null, modifiers: {} },
];
