// Netrunning foundation (CPR RAW): NET Actions per turn derive from the
// Netrunner's Interface rank, which is the character's existing generic
// roleAbilityRank field (Interface is the Netrunner role ability — no new
// character field needed, same as every other role's signature ability).
import { CPRED_NETRUNNING_ABILITIES } from './constants.ts';
import type { NetInterfaceAbility } from './constants.ts';
export {
  BREACH_TIERS,
  breachTierOptions,
  buildBreachConfig,
  normalizeBreachTier,
} from './breachConfigEngine.ts';
export type {
  BreachConfig,
  BreachPrepAbilityId,
  BreachPrepResult,
  BreachTier,
  BreachTierId,
} from './breachConfigEngine.ts';
export {
  DEFAULT_CYBERDECK_PROGRAM_SLOTS,
  NETRUNNING_PROGRAMS,
  damageProgramRez,
  deckProgramSummary,
  netrunningProgramById,
  normalizeInstalledPrograms,
  programRunModifiers,
  repairProgramRez,
  rezzedProgramIds,
} from './programs.ts';
export type {
  DeckProgramSummary,
  InstalledNetrunningProgram,
  InstalledProgramState,
  NetrunningProgram,
  NetrunningProgramClass,
} from './programs.ts';
export {
  BLACK_ICE_BY_TIER,
  BLACK_ICE_PROGRAMS,
  blackIceById,
  blackIceOptionsForTier,
  normalizeBlackIceState,
  resolveBlackIceDamage,
  resolveNetrunnerIceAttack,
  resolveOpposedNetAttack,
  selectBlackIceForTier,
} from './blackIce.ts';
export type {
  BlackIceAttackResolution,
  BlackIceClass,
  BlackIceDamageResolution,
  BlackIceId,
  BlackIceProgram,
  BlackIceState,
  BlackIceTierSelection,
  NetrunnerIceAttackResolution,
} from './blackIce.ts';

export { CPRED_NETRUNNING_ABILITIES };
export type { NetInterfaceAbility };

export function netActionsPerTurn(interfaceRank: unknown): number {
  const rank = Math.max(0, Math.min(10, Number(interfaceRank) || 0));
  if (rank <= 0) return 0;
  if (rank <= 3) return 2;
  if (rank <= 6) return 3;
  if (rank <= 9) return 4;
  return 5;
}
