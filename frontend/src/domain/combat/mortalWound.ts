// Mortally Wounded aggravation (CPR RAW p.176): while a character sits below
// 1 HP, every hit that still gets at least 1 point of damage through
// (Ranged or Melee) inflicts an automatic Body Critical Injury, and each such
// hit permanently raises the Death Save penalty by 1 until stabilized.
// Pure classification — the caller decides how to roll the table and where
// to persist the penalty.

export interface MortalWoundDamageInput {
  /** HP before this hit landed. */
  hpBefore: unknown;
  /** HP actually lost to this hit (after armor). */
  hpLoss: unknown;
  /** True for area / explosive damage, which RAW does not list as a trigger. */
  area?: boolean;
}

export interface MortalWoundDamageEffects {
  wasMortallyWounded: boolean;
  autoCriticalInjury: boolean;
  deathSavePenaltyDelta: number;
}

export function mortallyWoundedDamageEffects(input: MortalWoundDamageInput): MortalWoundDamageEffects {
  const hpBefore = Number(input.hpBefore) || 0;
  const hpLoss = Math.max(0, Number(input.hpLoss) || 0);
  const wasMortallyWounded = hpBefore < 1;
  const damaged = wasMortallyWounded && hpLoss >= 1;
  return {
    wasMortallyWounded,
    autoCriticalInjury: damaged && !input.area,
    deathSavePenaltyDelta: damaged ? 1 : 0,
  };
}
