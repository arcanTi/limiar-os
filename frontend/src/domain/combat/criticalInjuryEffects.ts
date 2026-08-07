import { getCriticalInjuryById, normalizeCriticalInjuryId } from './criticalInjuryTables.ts';
import type { CriticalInjuryTableRow } from './criticalInjuryTables.ts';
import type { ActiveInjuryRef, AttackContext, CombatIssue } from './combatTypes.ts';

type CanonicalRulesLike = AttackContext['canonicalRules'];

function injuryRows(activeInjuries: (string | ActiveInjuryRef)[] = [], canonicalRules: CanonicalRulesLike = {}): (CriticalInjuryTableRow | ActiveInjuryRef)[] {
  return (activeInjuries || [])
    .map(row => (typeof row === 'string' ? getCriticalInjuryById(row, canonicalRules) : row))
    .filter(Boolean) as (CriticalInjuryTableRow | ActiveInjuryRef)[];
}

export function calculateBaseDeathSavePenalty(activeInjuries: (string | ActiveInjuryRef)[] = [], canonicalRules: CanonicalRulesLike = {}): number {
  return injuryRows(activeInjuries, canonicalRules).reduce((sum, injury) => sum + (Number(injury.baseDeathSavePenaltyDelta) || 0), 0);
}

export function resolveHeadshotDamageMultiplier(activeInjuries: (string | ActiveInjuryRef)[] = [], canonicalRules: CanonicalRulesLike = {}): number {
  return injuryRows(activeInjuries, canonicalRules).some(injury => normalizeCriticalInjuryId(injury.id, { canonicalRules }).id === 'HEAD-09-CRACKED-SKULL') ? 3 : 2;
}

export interface CriticalInjuryEffectsResult {
  actionPenalty: number;
  meleeAttackPenalty: number;
  rangedAttackPenalty: number;
  perceptionVisionPenalty: number;
  perceptionHearingPenalty: number;
  speechActionPenalty: number;
  movePenalty: number;
  cannotUseArm: boolean;
  cannotUseHand: boolean;
  cannotDodge: boolean;
  cannotSpeak: boolean;
  nextTurnCannotTakeAction: boolean;
  nextTurnCannotTakeMoveAction: boolean;
  repeatBonusDamageTriggers: { injuryId: string; trigger: string }[];
  baseDeathSavePenalty: number;
  headshotMultiplier: number;
  issues: CombatIssue[];
}

export function resolveCriticalInjuryEffects(activeInjuries: (string | ActiveInjuryRef)[] = [], context: { canonicalRules?: CanonicalRulesLike } = {}): CriticalInjuryEffectsResult {
  const canonicalRules = context.canonicalRules || {};
  const rows = injuryRows(activeInjuries, canonicalRules);
  const result: CriticalInjuryEffectsResult = {
    actionPenalty: 0,
    meleeAttackPenalty: 0,
    rangedAttackPenalty: 0,
    perceptionVisionPenalty: 0,
    perceptionHearingPenalty: 0,
    speechActionPenalty: 0,
    movePenalty: 0,
    cannotUseArm: false,
    cannotUseHand: false,
    cannotDodge: false,
    cannotSpeak: false,
    nextTurnCannotTakeAction: false,
    nextTurnCannotTakeMoveAction: false,
    repeatBonusDamageTriggers: [],
    baseDeathSavePenalty: calculateBaseDeathSavePenalty(rows, canonicalRules),
    headshotMultiplier: resolveHeadshotDamageMultiplier(rows, canonicalRules),
    issues: [],
  };
  rows.forEach(injury => {
    switch (injury.id) {
      case 'BODY-04-COLLAPSED-LUNG':
        result.movePenalty += -2;
        break;
      case 'BODY-08-BROKEN-LEG':
        result.movePenalty += -4;
        break;
      case 'BODY-12-DISMEMBERED-LEG':
        result.movePenalty += -6;
        result.cannotDodge = true;
        break;
      case 'BODY-09-TORN-MUSCLE':
        result.meleeAttackPenalty += -2;
        break;
      case 'BODY-02-DISMEMBERED-ARM':
      case 'BODY-06-BROKEN-ARM':
        result.cannotUseArm = true;
        break;
      case 'BODY-03-DISMEMBERED-HAND':
        result.cannotUseHand = true;
        break;
      case 'BODY-11-CRUSHED-FINGERS':
        result.cannotUseHand = true;
        break;
      case 'BODY-10-SPINAL-INJURY':
        result.nextTurnCannotTakeAction = true;
        break;
      case 'BODY-05-BROKEN-RIBS':
      case 'BODY-07-FOREIGN-OBJECT':
      case 'HEAD-07-FOREIGN-OBJECT':
        result.repeatBonusDamageTriggers.push({ injuryId: injury.id, trigger: 'moves more than 4m/yd on foot' });
        break;
      case 'HEAD-02-LOST-EYE':
        result.rangedAttackPenalty += -4;
        result.perceptionVisionPenalty += -4;
        break;
      case 'HEAD-04-DAMAGED-EYE':
        result.rangedAttackPenalty += -2;
        result.perceptionVisionPenalty += -2;
        break;
      case 'HEAD-03-BRAIN-INJURY':
      case 'HEAD-05-CONCUSSION':
        result.actionPenalty += -2;
        break;
      case 'HEAD-06-BROKEN-JAW':
        result.speechActionPenalty += -4;
        break;
      case 'HEAD-10-DAMAGED-EAR':
        result.perceptionHearingPenalty += -2;
        result.nextTurnCannotTakeMoveAction = true;
        break;
      case 'HEAD-12-LOST-EAR':
        result.perceptionHearingPenalty += -4;
        result.nextTurnCannotTakeMoveAction = true;
        break;
      case 'HEAD-11-CRUSHED-WINDPIPE':
        result.cannotSpeak = true;
        break;
      default:
        break;
    }
  });
  return result;
}
