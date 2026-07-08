import { combatIssue } from './combatTypes.ts';
import type { AttackMode, CombatIssue, WeaponCombatProfile } from './combatTypes.ts';

function isMeleeLike(weapon: WeaponCombatProfile = {}, attackMode: string = ''): boolean {
  const type = String(weapon.weaponType || '').toLowerCase();
  return attackMode === 'melee' || attackMode === 'brawling' || type.includes('melee') || type === 'brawling';
}

export function getRequiredAmmo(weapon: WeaponCombatProfile = {}, attackMode: AttackMode | string = 'singleShot'): number {
  if (isMeleeLike(weapon, attackMode)) return 0;
  const selectedMode = weapon.selectedMode || weapon.mode || attackMode;
  const mode = (weapon.weaponModes || []).find(row => row.mode === selectedMode);
  if (mode && Number(mode.ammoCost) > 0) return Number(mode.ammoCost);
  if (attackMode === 'autofire' || attackMode === 'suppressiveFirePlaceholder') return 10;
  return 1;
}

export interface AmmoState {
  currentAmmo?: number;
  magazine?: number;
}

export interface CanFireResult {
  canFire: boolean;
  requiredAmmo: number;
  needsReload: boolean;
  currentAmmo: number | null;
  issues: CombatIssue[];
}

export function canFireWeapon(weapon: WeaponCombatProfile = {}, ammoState: AmmoState | null = null, attackMode: AttackMode | string = 'singleShot'): CanFireResult {
  const requiredAmmo = getRequiredAmmo(weapon, attackMode);
  const issues: CombatIssue[] = [];
  if (!requiredAmmo) return { canFire: true, requiredAmmo, needsReload: false, currentAmmo: ammoState?.currentAmmo ?? null, issues };
  if (!ammoState) {
    issues.push(combatIssue('warning', 'ammo_state_missing', 'Ammo state was not provided.', { requiredAmmo }));
    return { canFire: true, requiredAmmo, needsReload: false, currentAmmo: null, issues };
  }
  const currentAmmo = Number(ammoState.currentAmmo ?? 0);
  const needsReload = currentAmmo < requiredAmmo;
  if (needsReload) issues.push(combatIssue('warning', 'needs_reload', 'Weapon does not have enough ammo for this attack.', { currentAmmo, requiredAmmo }));
  return { canFire: !needsReload, requiredAmmo, needsReload, currentAmmo, issues };
}

export interface SpendAmmoResult extends CanFireResult {
  ammoState: AmmoState | null;
}

export function spendAmmo(weapon: WeaponCombatProfile = {}, ammoState: AmmoState | null = null, attackMode: AttackMode | string = 'singleShot'): SpendAmmoResult {
  const check = canFireWeapon(weapon, ammoState, attackMode);
  if (!ammoState || !check.requiredAmmo) return { ...check, ammoState: ammoState || null };
  const nextAmmo = check.needsReload ? Number(ammoState.currentAmmo ?? 0) : Number(ammoState.currentAmmo ?? 0) - check.requiredAmmo;
  return {
    ...check,
    ammoState: {
      ...ammoState,
      currentAmmo: nextAmmo,
    },
  };
}

export function getAvailableAttacksThisAction(weapon: WeaponCombatProfile = {}, attackMode: AttackMode | string = 'singleShot'): number {
  if (attackMode === 'autofire' || attackMode === 'area' || attackMode === 'aimedShot' || attackMode === 'suppressiveFirePlaceholder') return 1;
  if (attackMode === 'brawling') return 2;
  return Number(weapon.rof || 1);
}
