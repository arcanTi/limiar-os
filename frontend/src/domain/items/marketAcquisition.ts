// How a shop product is acquired — the single question the market UI has to
// answer before it can label a button or build a comparison table.
//
// The shop used to ask only "is this a weapon?", and everything that wasn't a
// weapon or a Trauma Team plan fell through to the cyberware install path. So
// a box of rifle rounds offered INSTALL, showed a HUMANITY COST row, and —
// worse — was blocked from a second purchase because the install engine
// refuses to install the same code twice. Ammunition is not chrome; a magazine
// is carried, not surgically attached.
//
// `kind` is the catalog's own word for what a row is, so it decides the mode.
// Legacy cyberware rows predate the field and carry no `kind` at all, which is
// why the fallback is `install` rather than `carry`: an unlabelled row in this
// catalog is chrome.

import type { LegacyCatalogItem } from './legacyCatalogTypes.ts';

/**
 * `install` — chrome. Runs the slot/requirement engine, costs Humanity, and
 * lands in `equipped`. One per character.
 * `carry` — merchandise. Lands in the character's gear list, stacks, has no
 * Humanity cost and no install requirements.
 * `plan` — a Trauma Team subscription. Not an object at all; it swaps a field.
 */
export type AcquisitionMode = 'install' | 'carry' | 'plan';

const CARRIED_KINDS = new Set([
  'weapon',
  'ammunition',
  'armor',
  'gear',
  'weaponattachment',
]);

type ProductLike = Partial<LegacyCatalogItem> | { kind?: unknown; armor?: unknown; packSize?: unknown } | null | undefined;

export function acquisitionMode(product: ProductLike): AcquisitionMode {
  const kind = String((product as { kind?: unknown })?.kind ?? '').trim().toLowerCase();
  if (kind === 'trauma-plan') return 'plan';
  if (CARRIED_KINDS.has(kind)) return 'carry';
  return 'install';
}

/** Chrome: the only mode that runs the install engine and spends Humanity. */
export function isInstallable(product: ProductLike): boolean {
  return acquisitionMode(product) === 'install';
}

/** Merchandise: goes to the gear list and can be bought again tomorrow. */
export function isCarried(product: ProductLike): boolean {
  return acquisitionMode(product) === 'carry';
}

export function isTraumaPlan(product: ProductLike): boolean {
  return acquisitionMode(product) === 'plan';
}

/**
 * Whether a product shows weapon stats (damage, ROF, magazine). Cyberweapons
 * are installed chrome that still fires, so this is deliberately not the same
 * question as `isCarried`.
 */
export function hasWeaponStatBlock(product: ProductLike): boolean {
  const kind = String((product as { kind?: unknown })?.kind ?? '').trim().toLowerCase();
  return kind === 'weapon' || kind === 'cyberweapon';
}

/**
 * How many units one purchase adds. Ammunition is sold by the pack — buying
 * "Rifle Ammunition" hands over 10 rounds, not one.
 */
export function purchaseQuantity(product: ProductLike): number {
  const packSize = Number((product as { packSize?: unknown })?.packSize);
  return Number.isFinite(packSize) && packSize > 0 ? packSize : 1;
}

export interface ArmorPenalty { REF: number; DEX: number; MOVE: number }

/**
 * `armor` carries two shapes in this catalog. Cyberware and gear use a plain
 * number — the SP a piece of chrome contributes. The nine wearable armor rows
 * use a structured `{headSP, bodySP, ablates, armorPenalty}` record, because
 * CPR armor covers two locations and taxes REF/DEX/MOVE.
 *
 * The shop used to read the field as a number unconditionally, so every armor
 * card advertised "+[object Object] ARMOR". Both shapes answer "how much SP",
 * so both are read here rather than at each call site.
 */
export function armorSp(product: ProductLike): number {
  const raw = (product as { armor?: unknown })?.armor;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (raw && typeof raw === 'object') {
    const layer = raw as { headSP?: unknown; bodySP?: unknown; sp?: unknown };
    return Math.max(Number(layer.bodySP) || 0, Number(layer.headSP) || 0, Number(layer.sp) || 0);
  }
  return 0;
}

/** The REF/DEX/MOVE tax a worn armor charges, or null when it charges none. */
export function armorPenaltyOf(product: ProductLike): ArmorPenalty | null {
  const raw = (product as { armor?: unknown })?.armor;
  const source = raw && typeof raw === 'object'
    ? (raw as { armorPenalty?: unknown }).armorPenalty
    : null;
  if (!source || typeof source !== 'object') return null;
  const pen = source as Record<string, unknown>;
  const penalty: ArmorPenalty = {
    REF: Number(pen.REF) || 0,
    DEX: Number(pen.DEX) || 0,
    MOVE: Number(pen.MOVE) || 0,
  };
  return (penalty.REF || penalty.DEX || penalty.MOVE) ? penalty : null;
}
