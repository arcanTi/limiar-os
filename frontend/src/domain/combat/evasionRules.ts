// Who may roll Evasion against what (CPR RAW):
// - Melee attacks: always opposed by Evasion.
// - Ranged attacks: only a defender with REF 8+ may dodge bullets; the
//   Evasion check is declared and rolled BEFORE the attack roll and its
//   result becomes the attack's DV.
// - A surprised defender (lost Perception vs Stealth in an ambush) cannot
//   Evade at all that round.
// - Holding a Bulletproof Shield forbids Evading ranged attacks (the shield
//   takes the hit instead); a Human Shield forbids Evading shots aimed at
//   the wielder's head.
// - A dismembered leg means the character cannot dodge.

import { normalizeShield } from '../character/index.ts';
import type { CharacterShield } from '../character/index.ts';

export const RANGED_EVASION_MIN_REF = 8;

export interface EvasionDefender {
  base?: Record<string, unknown> | null;
  derived?: { effectiveStats?: Record<string, number> } | null;
  shield?: Partial<CharacterShield> | null;
  statusEffects?: { id?: string; modifiers?: Record<string, unknown> }[] | null;
  criticalInjuries?: { injury?: string; treated?: boolean }[] | null;
}

export interface EvasionAttackShape {
  ranged?: boolean;
  aimedHead?: boolean;
}

export type EvasionBlockReason = '' | 'surprised' | 'shield_ranged' | 'human_shield_head' | 'cannot_dodge' | 'ref_too_low';

export const EVASION_BLOCK_REASON_PT: Record<EvasionBlockReason, string> = {
  '': '',
  surprised: 'surpreendido: nao pode usar Evasion nesta rodada',
  shield_ranged: 'empunhando escudo balistico: nao esquiva de ataques a distancia',
  human_shield_head: 'empunhando escudo humano: nao esquiva de tiros na cabeca',
  cannot_dodge: 'lesao critica impede esquivar',
  ref_too_low: 'REF abaixo de 8: nao pode esquivar projeteis',
};

function effectiveRef(defender: EvasionDefender): number {
  const derived = defender.derived && defender.derived.effectiveStats;
  if (derived && Number.isFinite(Number(derived.REF))) return Number(derived.REF);
  return Number(defender.base && defender.base.REF) || 0;
}

const NO_DODGE_INJURIES = new Set(['crit_body_12', 'BODY-12-DISMEMBERED-LEG']);

export function evasionBlockedReason(defender: EvasionDefender | null | undefined, attack: EvasionAttackShape = {}): EvasionBlockReason {
  const d = defender || {};
  const statuses = Array.isArray(d.statusEffects) ? d.statusEffects : [];
  if (statuses.some(status => status && (status.id === 'surprised' || (status.modifiers && status.modifiers.cannotEvade)))) return 'surprised';
  const injuries = Array.isArray(d.criticalInjuries) ? d.criticalInjuries : [];
  if (injuries.some(entry => entry && !entry.treated && NO_DODGE_INJURIES.has(String(entry.injury || '')))) return 'cannot_dodge';
  const shield = normalizeShield(d.shield);
  if (attack.ranged && shield && shield.hp > 0) {
    if (shield.kind === 'human' || shield.kind === 'corpse') {
      if (attack.aimedHead) return 'human_shield_head';
    } else {
      return 'shield_ranged';
    }
  }
  if (attack.ranged && effectiveRef(d) < RANGED_EVASION_MIN_REF) return 'ref_too_low';
  return '';
}

export function canEvade(defender: EvasionDefender | null | undefined, attack: EvasionAttackShape = {}): boolean {
  return evasionBlockedReason(defender, attack) === '';
}
