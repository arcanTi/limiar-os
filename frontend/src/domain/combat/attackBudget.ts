// Attacks per Attack Action (CPR RAW p.169/170). A weapon with ROF 2 lets the
// character split two attacks across the turn — same weapon, or one per hand
// when dual wielding two ROF 2 weapons — interleaved freely with movement.
// A ROF 1 weapon (or any single-attack mode: Aimed Shot, Autofire, area,
// Suppressive Fire) consumes the entire Attack Action: no second attack this
// turn, even with another ROF 1 weapon in the other hand.

export interface AttackRecord {
  weaponId?: string;
  /** Effective attacks-per-action the weapon/mode allows (1 or 2). */
  rof: number;
}

export interface AttackBudgetResult {
  allowed: boolean;
  used: number;
  max: number;
  reason: '' | 'action_spent_by_rof1' | 'rof1_needs_full_action' | 'two_attacks_used';
}

export function attackBudget(attacksThisTurn: AttackRecord[] = [], nextRof: unknown): AttackBudgetResult {
  const rows = Array.isArray(attacksThisTurn) ? attacksThisTurn : [];
  const used = rows.length;
  const rof = Math.max(1, Math.min(2, Number(nextRof) || 1));
  if (rows.some(row => (Number(row.rof) || 1) <= 1)) {
    return { allowed: false, used, max: 1, reason: 'action_spent_by_rof1' };
  }
  if (rof === 1) {
    return used === 0
      ? { allowed: true, used, max: 1, reason: '' }
      : { allowed: false, used, max: 2, reason: 'rof1_needs_full_action' };
  }
  return used < 2
    ? { allowed: true, used, max: 2, reason: '' }
    : { allowed: false, used, max: 2, reason: 'two_attacks_used' };
}

export const ATTACK_BUDGET_REASON_PT: Record<AttackBudgetResult['reason'], string> = {
  '': '',
  action_spent_by_rof1: 'Acao de Ataque ja gasta: arma ROF 1 consome o turno inteiro',
  rof1_needs_full_action: 'Arma ROF 1 precisa da Acao de Ataque inteira; voce ja atacou neste turno',
  two_attacks_used: 'Limite de 2 ataques (ROF 2) neste turno ja usado',
};
