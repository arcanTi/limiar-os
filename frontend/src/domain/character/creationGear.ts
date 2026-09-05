// Weapons, armor, ammunition and gear bought during character creation. Pure:
// the catalog rows arrive already fetched and every function returns new data.
//
// RAW (CPR p.104): the Complete Package's 2.550eb is a single pool shared with
// cyberware — buying a rifle is money that will not buy chrome, and whatever
// survives both is the character's cash. Cyberware lives in `creationChrome`
// because installing it has rules of its own; this module is a plain shop.

import { isPurchasableProduct } from '../items/itemNormalizers.ts';
import { isMeleeWeapon, weaponProfile } from '../items/weaponProfileEngine.ts';
import type { LegacyCatalogItem } from '../items/legacyCatalogTypes.ts';

/**
 * Catalog categories sold here. FASHION is settled with the GM, DEFENSE is
 * implanted (it belongs to the chrome step), and TRAUMA TEAM is a subscription
 * the sheet tracks as `traumaPlan` rather than an item in the bag.
 */
export const GEAR_CATEGORIES = ['WEAPONS', 'ARMOR', 'AMMUNITION', 'WEAPON ATTACHMENTS', 'GEAR', 'DECK'];

export interface GearItem {
  code: string;
  name: string;
  cat: string;
  /** Weapon class or item type, used as the inventory row's `type`. */
  type: string;
  price: number;
  desc: string;
  stock: string;
  dmg: string;
  /** Units in one purchase: ammunition is sold in boxes of ten (p.94/344). */
  packSize: number;
  /** Weapon facets, empty/null for anything that is not a weapon. */
  skill: string;
  rof: number | null;
  /** `1`, `2` or `varies` (melee weapons pick by BODY); empty when unknown. */
  hands: string;
  mag: number | null;
  concealable: boolean;
  /** True for anything swung or punched: Melee Weapon, Brawling, Martial Arts. */
  melee: boolean;
  /** Armor facets: Stopping Power and the REF/DEX/MOVE penalty (0 when none). */
  sp: number | null;
  armorPenalty: number;
  /** Ammunition facet: the caliber this box feeds. */
  ammoType: string;
}

interface ArmorFacet {
  sp: number | null;
  armorPenalty: number;
}

/**
 * Stopping Power and penalty from the catalog's armor block. Head and body
 * share one SP on every RAW piece, so the body value is the headline; the
 * penalty is the same number on REF, DEX and MOVE, so one integer is enough.
 */
function armorFacet(row: Record<string, unknown>): ArmorFacet {
  const armor = row.armor && typeof row.armor === 'object' ? row.armor as Record<string, unknown> : null;
  if (!armor) return { sp: null, armorPenalty: 0 };
  const sp = armor.bodySP ?? armor.headSP ?? armor.sp;
  const penalty = armor.armorPenalty && typeof armor.armorPenalty === 'object'
    ? Math.min(0, ...Object.values(armor.armorPenalty as Record<string, unknown>).map((v) => toInt(v, 0)))
    : toInt(armor.armorPenalty, 0);
  return { sp: sp == null ? null : toInt(sp, 0), armorPenalty: Math.min(0, penalty) };
}

export interface GearPick extends GearItem {
  qty: number;
}

function toInt(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function toText(value: unknown): string {
  return String(value == null ? '' : value).trim();
}

export function normalizeGearItem(raw: unknown): GearItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const code = toText(row.code);
  if (!code) return null;
  const profile = weaponProfile(row as LegacyCatalogItem);
  const cat = toText(row.cat || row.category).toUpperCase();
  const isWeapon = cat === 'WEAPONS' || row.kind === 'weapon';
  const skill = isWeapon ? toText(profile.skill) : '';
  const rof = isWeapon && profile.rof != null && profile.rof !== '' ? toInt(profile.rof, 0) || null : null;
  const armor = cat === 'ARMOR' ? armorFacet(row) : { sp: null, armorPenalty: 0 };
  return {
    code,
    name: toText(row.name) || code,
    cat,
    type: toText(row.weaponClass || row.type || profile.weaponClass || cat) || cat,
    price: Math.max(0, toInt(row.price, 0)),
    desc: toText(row.desc || row.description || row.legacyDesc),
    stock: toText(row.stock) || 'IN STOCK',
    dmg: toText(profile.dmg),
    packSize: Math.max(1, toInt(row.packSize, 1)),
    skill,
    rof,
    hands: isWeapon && profile.hands != null ? toText(profile.hands) : '',
    mag: isWeapon && profile.mag != null ? toInt(profile.mag, 0) || null : null,
    concealable: isWeapon && profile.concealable,
    melee: isWeapon && isMeleeWeapon(profile),
    sp: armor.sp,
    armorPenalty: armor.armorPenalty,
    ammoType: cat === 'AMMUNITION' ? toText(row.ammoType) : '',
  };
}

/**
 * A catalog row is on the shelf only if it belongs to a sold category, the
 * catalog calls it merchandise, and it carries a price. A price of zero is not
 * a free item here: it marks an entry still waiting for its cost, and a shop
 * that hands those out would quietly break the budget.
 */
export function isGearItem(raw: unknown): boolean {
  const item = normalizeGearItem(raw);
  if (!item) return false;
  if (!GEAR_CATEGORIES.includes(item.cat)) return false;
  if (!isPurchasableProduct(raw as Parameters<typeof isPurchasableProduct>[0])) return false;
  return item.price > 0;
}

export function gearCatalog(items: unknown): GearItem[] {
  const rows = (Array.isArray(items) ? items : []).filter(isGearItem)
    .map(normalizeGearItem).filter((item): item is GearItem => item !== null);
  const seen = new Set<string>();
  return rows.filter((item) => {
    if (seen.has(item.code)) return false;
    seen.add(item.code);
    return true;
  }).sort((a, b) => (
    GEAR_CATEGORIES.indexOf(a.cat) - GEAR_CATEGORIES.indexOf(b.cat)
    || a.price - b.price
    || a.name.localeCompare(b.name)
  ));
}

export type UnsellableReason = 'system-profile' | 'no-price';

export interface UnsellableGearRow {
  code: string;
  name: string;
  cat: string;
  reason: UnsellableReason;
}

/**
 * Rows in a sold category that the shop still will not sell, and why.
 * `system-profile` is deliberate (the rules engine's own lookup rows);
 * `no-price` is a catalog gap someone has to close.
 */
export function unsellableGear(items: unknown): UnsellableGearRow[] {
  return (Array.isArray(items) ? items : []).flatMap((raw) => {
    const item = normalizeGearItem(raw);
    if (!item || !GEAR_CATEGORIES.includes(item.cat)) return [];
    const merchandise = isPurchasableProduct(raw as Parameters<typeof isPurchasableProduct>[0]);
    if (merchandise && item.price > 0) return [];
    return [{
      code: item.code,
      name: item.name,
      cat: item.cat,
      reason: (merchandise ? 'no-price' : 'system-profile') as UnsellableReason,
    }];
  });
}

export function gearSpend(picks: GearPick[] | null | undefined): number {
  return (picks || []).reduce((sum, pick) => sum + Math.max(0, toInt(pick && pick.price, 0)) * Math.max(0, toInt(pick && pick.qty, 0)), 0);
}

export function gearCount(picks: GearPick[] | null | undefined): number {
  return (picks || []).reduce((sum, pick) => sum + Math.max(0, toInt(pick && pick.qty, 0)), 0);
}

export type GearBlockReason = 'soldout' | 'funds' | 'unbuyable' | null;

export interface GearContext {
  /** Money still free for this purchase (creation budget minus chrome). */
  cashLeft?: number;
}

export function gearBlock(
  picks: GearPick[] | null | undefined,
  item: GearItem | null | undefined,
  { cashLeft = 0 }: GearContext = {},
): GearBlockReason {
  if (!item) return 'unbuyable';
  if (item.price <= 0) return 'unbuyable';
  if (item.stock === 'SOLD OUT') return 'soldout';
  if (item.price > cashLeft) return 'funds';
  return null;
}

/** Short tag for the blocked card — the headline above the explanation. */
export function gearBlockLabel(reason: GearBlockReason): string {
  if (!reason) return '';
  if (reason === 'soldout') return 'ESGOTADO';
  if (reason === 'funds') return 'SEM SALDO';
  return 'SEM PREÇO';
}

/**
 * The same reason written for the tag on the card, where the item's name is
 * already on screen: what to do about it, not who it is about.
 */
export function gearBlockDetail(
  reason: GearBlockReason,
  item: GearItem | null | undefined,
  { cashLeft = 0 }: GearContext = {},
): string {
  if (!reason) return '';
  if (reason === 'soldout') return 'Esgotado no catálogo.';
  if (reason === 'funds') {
    const short = Math.max(0, Math.trunc(((item && item.price) || 0) - (Number(cashLeft) || 0)));
    return short ? `Faltam ${short}eb. Venda outra compra ou fique sem ele.` : 'Sem eurodólares para esta compra.';
  }
  return 'Sem preço no catálogo: não dá para comprar aqui.';
}

export function gearBlockMessage(reason: GearBlockReason, item: GearItem | null | undefined): string {
  const name = (item && item.name) || 'Este item';
  if (!reason) return '';
  if (reason === 'soldout') return `${name} está esgotado no catálogo.`;
  if (reason === 'funds') return `Sem eurodólares para ${name}. Venda outra coisa ou fique sem ele.`;
  return `${name} não tem preço no catálogo e não pode ser comprado aqui.`;
}

/** Buy one unit; a second unit of the same item raises its quantity. */
export function addGear(
  picks: GearPick[] | null | undefined,
  item: GearItem | null | undefined,
  context: GearContext = {},
): GearPick[] {
  const current = picks || [];
  if (!item || gearBlock(current, item, context)) return current;
  const index = current.findIndex((pick) => pick.code === item.code);
  if (index < 0) return [...current, { ...item, qty: 1 }];
  const next = [...current];
  next[index] = { ...next[index], qty: next[index].qty + 1 };
  return next;
}

/** Sell one unit back; the row disappears when the last one goes. */
export function removeGear(picks: GearPick[] | null | undefined, code: unknown): GearPick[] {
  const target = toText(code);
  const current = picks || [];
  const index = current.findIndex((pick) => pick.code === target);
  if (index < 0) return current;
  if (current[index].qty <= 1) return current.filter((_, i) => i !== index);
  const next = [...current];
  next[index] = { ...next[index], qty: next[index].qty - 1 };
  return next;
}

export interface GearRow {
  id: string;
  code: string;
  name: string;
  type: string;
  qty: number;
  price: number;
  dmg: string;
  /** Units per purchased row (10 for a box of ammunition). */
  packSize: number;
  notes: string;
  equipped: boolean;
  /** Weapon facets carried through so the sheet does not print "—" for them. */
  skill: string;
  rof: number | null;
  mag: number | null;
  hands: string;
  concealable: boolean;
  melee: boolean;
}

/**
 * Inventory rows for the new sheet, in the shape `normalizeGearList` expects.
 * Nothing starts equipped: what the operative is actually holding is a
 * decision for the table, not for the character sheet's first second.
 */
export function gearInventory(picks: GearPick[] | null | undefined): GearRow[] {
  return (picks || []).map((pick, index) => ({
    id: `${pick.code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`,
    code: pick.code,
    name: pick.name,
    type: pick.type || pick.cat,
    qty: pick.qty,
    price: pick.price,
    dmg: pick.dmg,
    packSize: pick.packSize,
    notes: pick.packSize > 1 ? `pacote com ${pick.packSize} · ${pick.desc}`.trim() : pick.desc,
    equipped: false,
    skill: pick.skill,
    rof: pick.rof,
    mag: pick.mag,
    hands: pick.hands,
    concealable: pick.concealable,
    melee: pick.melee,
  }));
}
