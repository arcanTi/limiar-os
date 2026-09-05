export type ShieldLocation = 'carried' | 'equipped' | 'dropped';

export interface ShieldItem {
  id?: string;
  code?: string;
  name?: string;
  shieldHp?: number;
  maxHp?: number;
  shieldLocation?: ShieldLocation;
  cannotBeInstalledInPopupShield?: boolean;
  [key: string]: unknown;
}

const hp = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : fallback;
};

export function isShieldItem(item: ShieldItem | null | undefined): boolean {
  return hp(item?.maxHp ?? item?.shieldHp) > 0;
}

/** Gives a purchased shield its own durable HP instead of relying on catalog data. */
export function initializeShieldItem(item: ShieldItem): ShieldItem {
  if (!isShieldItem(item)) return item;
  const maxHp = hp(item.maxHp ?? item.shieldHp);
  return {
    ...item,
    maxHp,
    shieldHp: Math.min(maxHp, hp(item.shieldHp, maxHp)),
    shieldLocation: item.shieldLocation || 'carried',
  };
}

export function equipShieldItem(item: ShieldItem, options: { popup?: boolean } = {}): ShieldItem {
  const shield = initializeShieldItem(item);
  if (!isShieldItem(shield)) throw new Error('ITEM_NOT_SHIELD');
  if (hp(shield.shieldHp) <= 0) throw new Error('SHIELD_BROKEN');
  if (options.popup && shield.cannotBeInstalledInPopupShield) throw new Error('SHIELD_NOT_POPUP_COMPATIBLE');
  return { ...shield, shieldLocation: 'equipped' };
}

export function damageShieldItem(item: ShieldItem, damage: unknown): { item: ShieldItem; absorbed: number; overflow: number; broken: boolean } {
  const shield = initializeShieldItem(item);
  const incoming = hp(damage);
  const current = hp(shield.shieldHp);
  const absorbed = Math.min(current, incoming);
  const remaining = current - absorbed;
  return {
    item: { ...shield, shieldHp: remaining, shieldLocation: remaining ? shield.shieldLocation : 'dropped' },
    absorbed,
    overflow: incoming - absorbed,
    broken: remaining === 0,
  };
}

export function storeShieldItem(item: ShieldItem): ShieldItem {
  return { ...initializeShieldItem(item), shieldLocation: 'carried' };
}

export function dropShieldItem(item: ShieldItem): ShieldItem {
  return { ...initializeShieldItem(item), shieldLocation: 'dropped' };
}

export function repairShieldItem(item: ShieldItem, amount: unknown): ShieldItem {
  const shield = initializeShieldItem(item);
  const maxHp = hp(shield.maxHp);
  return { ...shield, shieldHp: Math.min(maxHp, hp(shield.shieldHp) + hp(amount)) };
}
