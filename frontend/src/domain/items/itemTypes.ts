export { isWeaponDefinition, WEAPON_QUALITY_VALUES } from './weaponTypes.ts';
export { CYBERWARE_TYPES, isCyberwareDefinition } from './cyberwareTypes.ts';
export { CYBERWARE_DAMAGE_STATES, isInstalledCyberwareInstance } from './installedCyberwareTypes.ts';

export type IssueSeverity = 'info' | 'warning' | 'error';

export interface ValidationIssue {
  severity: IssueSeverity;
  type: string;
  code?: string;
  message: string;
  evidence?: unknown;
  [extra: string]: unknown;
}

export function validationIssue(
  severity: IssueSeverity,
  type: string,
  message: string,
  details: Record<string, unknown> = {},
): ValidationIssue {
  return {
    severity,
    type,
    message,
    ...details,
  };
}
