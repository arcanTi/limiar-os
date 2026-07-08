export type CyberwareDamageState = 'normal' | 'disabled' | 'destroyed';

export interface InstalledCyberwareInstance {
  instanceId: string;
  code: string;
  parentInstanceId?: string | null;
  location?: string | null;
  selectedMode?: string | null;
  selectedSkill?: string | null;
  selectedWeaponCode?: string | null;
  enabled?: boolean;
  damageState?: CyberwareDamageState;
  installedOptions?: string[];
  notes?: string;
  manualChoiceRequired?: boolean;
  manualChoice?: Record<string, unknown>;
  sourceLegacyPath?: string;
  migrationMetadata?: Record<string, unknown>;
  legacySource?: string;
}

export const CYBERWARE_DAMAGE_STATES: CyberwareDamageState[] = ['normal', 'disabled', 'destroyed'];

export function isInstalledCyberwareInstance(value: unknown): value is InstalledCyberwareInstance {
  const v = value as Partial<InstalledCyberwareInstance> | null | undefined;
  return !!v && typeof v.instanceId === 'string' && typeof v.code === 'string';
}
