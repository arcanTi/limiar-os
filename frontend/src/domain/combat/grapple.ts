// Grapple follow-ups (CPR RAW p.172-173). Once a Grab has landed and is
// still held, Choke and Throw need no attack roll and no opposed check:
// they succeed automatically and deal damage equal to the attacker's BODY
// straight to HP — armor SP is ignored and is not ablated.
//
// Choke has a knock-out clause: if it would take a target from more than
// 1 HP to below 0, the target is left at exactly 1 HP and Unconscious
// instead; and a Choke held for 3 consecutive turns knocks the target out
// regardless of HP. Throw ends the grapple (the target lands away from you).

export type GrappleAction = 'choke' | 'throw';

export interface GrappleActionInput {
  action: GrappleAction;
  attackerBody: unknown;
  targetHp: unknown;
  /** Consecutive Choke turns already applied before this one. */
  chokeTurns?: unknown;
  /** Combat round of the previous Choke, to detect a broken streak. */
  lastChokeRound?: unknown;
  round?: unknown;
}

export interface GrappleActionResult {
  action: GrappleAction;
  damage: number;
  hpBefore: number;
  hpAfter: number;
  unconscious: boolean;
  /** 'hp' when the knock-out clause fired, 'chokeTurns' for the 3-turn rule. */
  unconsciousReason: '' | 'hp' | 'chokeTurns';
  chokeTurns: number;
  releasesGrapple: boolean;
}

export const CHOKE_KNOCKOUT_TURNS = 3;

export function resolveGrappleAction(input: GrappleActionInput): GrappleActionResult {
  const damage = Math.max(0, Number(input.attackerBody) || 0);
  const hpBefore = Number(input.targetHp) || 0;
  const round = Number(input.round);
  const lastRound = Number(input.lastChokeRound);
  const previousTurns = Math.max(0, Number(input.chokeTurns) || 0);
  if (input.action === 'throw') {
    return {
      action: 'throw',
      damage,
      hpBefore,
      hpAfter: Math.max(0, hpBefore - damage),
      unconscious: false,
      unconsciousReason: '',
      chokeTurns: 0,
      releasesGrapple: true,
    };
  }
  // A streak only continues when the last Choke happened on the previous
  // round; a skipped round restarts the count at this Choke.
  const consecutive = Number.isFinite(round) && Number.isFinite(lastRound) && round === lastRound + 1 ? previousTurns + 1 : 1;
  const raw = hpBefore - damage;
  const knockout = hpBefore > 1 && raw < 0;
  const byTurns = consecutive >= CHOKE_KNOCKOUT_TURNS;
  return {
    action: 'choke',
    damage,
    hpBefore,
    hpAfter: knockout ? 1 : Math.max(0, raw),
    unconscious: knockout || byTurns,
    unconsciousReason: knockout ? 'hp' : byTurns ? 'chokeTurns' : '',
    chokeTurns: consecutive,
    releasesGrapple: false,
  };
}
