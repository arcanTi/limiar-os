// Cyberware bought during character creation. Pure: the catalog rows arrive
// already fetched and every function returns new data, so the wizard UI only
// renders what these say.
//
// RAW (CPR p.104/110): the Complete Package buys chrome out of the same
// 2.550eb that buys everything else, surgery is free at creation, and the
// implant's Humanity cost is paid immediately — no exception for starting
// characters. DLC enhancements (Tungsten Reinforcement, Hydraulic Ram...) are
// items in their own right: each one is bought separately and can only be
// attached to a base implant that is already installed.

import { CPRED_CREATION_CASH } from './constants.ts';
import { resolveInstalledCyberware } from '../items/cyberwareInstallEngine.ts';
import type { CanonicalRules } from '../items/canonicalRulesTypes.ts';
import type { LegacyCatalogItem } from '../items/legacyCatalogTypes.ts';
import type { ValidationIssue } from '../items/itemTypes.ts';

/** Catalog categories that are implanted rather than carried. */
export const CHROME_CATEGORIES = ['NEURAL', 'OPTICS', 'AUDIO', 'INTERNAL', 'EXTERNAL', 'LIMBS', 'BORG', 'DEFENSE'];

export interface ChromeItem {
  code: string;
  name: string;
  cat: string;
  price: number;
  hcost: number;
  desc: string;
  stock: string;
  /** Base implant codes this row can be attached to (empty for base chrome). */
  attachesTo: string[];
}

function toInt(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function toText(value: unknown): string {
  return String(value == null ? '' : value).trim();
}

export function normalizeChromeItem(raw: unknown): ChromeItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const code = toText(row.code);
  if (!code) return null;
  const cat = toText(row.cat || row.category).toUpperCase();
  return {
    code,
    name: toText(row.name) || code,
    cat,
    price: Math.max(0, toInt(row.price, 0)),
    hcost: Math.max(0, toInt(row.hcost, 0)),
    desc: toText(row.desc || row.description),
    stock: toText(row.stock) || 'IN STOCK',
    attachesTo: Array.isArray(row.attachesTo) ? row.attachesTo.map(toText).filter(Boolean) : [],
  };
}

export function isChromeItem(raw: unknown): boolean {
  const item = normalizeChromeItem(raw);
  if (!item) return false;
  if (item.attachesTo.length) return true;
  return CHROME_CATEGORIES.includes(item.cat);
}

/** Installable chrome from a raw catalog, cheapest first inside each category. */
export function chromeCatalog(items: unknown): ChromeItem[] {
  const rows = (Array.isArray(items) ? items : []).filter(isChromeItem)
    .map(normalizeChromeItem).filter((item): item is ChromeItem => item !== null);
  const seen = new Set<string>();
  return rows.filter((item) => {
    if (seen.has(item.code)) return false;
    seen.add(item.code);
    return true;
  // Base implants come before the enhancements that bolt onto them: an
  // enhancement listed first reads as buyable when it is not.
  }).sort((a, b) => (
    CHROME_CATEGORIES.indexOf(a.cat) - CHROME_CATEGORIES.indexOf(b.cat)
    || Number(isChromeEnhancement(a)) - Number(isChromeEnhancement(b))
    || a.price - b.price
    || a.name.localeCompare(b.name)
  ));
}

export function isChromeEnhancement(item: ChromeItem | null | undefined): boolean {
  return !!item && item.attachesTo.length > 0;
}

/** Installed pieces this enhancement could be bolted onto. */
export function installedParentsOf(picks: ChromeItem[] | null | undefined, item: ChromeItem | null | undefined): ChromeItem[] {
  if (!item || !isChromeEnhancement(item)) return [];
  return (picks || []).filter((pick) => item.attachesTo.includes(pick.code));
}

/**
 * The enhancement already installed on `parentCode`, if any. RAW (Mission Kit
 * DLC #2): a piece of cyberware carries only one enhancement at a time, so
 * this is what a second one collides with.
 */
export function enhancementOccupant(picks: ChromeItem[] | null | undefined, parentCode: unknown): ChromeItem | null {
  const parent = toText(parentCode);
  if (!parent) return null;
  return (picks || []).find((pick) => isChromeEnhancement(pick) && pick.attachesTo.includes(parent)) || null;
}

export function chromeSpend(picks: ChromeItem[] | null | undefined): number {
  return (picks || []).reduce((sum, item) => sum + Math.max(0, toInt(item && item.price, 0)), 0);
}

export function chromeHumanityLoss(picks: ChromeItem[] | null | undefined): number {
  return (picks || []).reduce((sum, item) => sum + Math.max(0, toInt(item && item.hcost, 0)), 0);
}

/**
 * Money left from the creation budget. RAW p.104: it is not a leftover to
 * discard — it is the cash the character starts play with.
 */
export function creationCashLeft(picks: ChromeItem[] | null | undefined, budget: number = CPRED_CREATION_CASH): number {
  return Math.max(0, budget) - chromeSpend(picks);
}

export type ChromeBlockReason = 'duplicate' | 'soldout' | 'funds' | 'parent' | 'occupied' | 'install' | null;

export interface ChromeBlock {
  reason: ChromeBlockReason;
  /** Engine issues when the reason is `install`. */
  issues?: ValidationIssue[];
  /** The enhancement already holding the piece, when the reason is `occupied`. */
  occupant?: ChromeItem;
}

function issueSignature(issue: ValidationIssue): string {
  return JSON.stringify([issue.type, issue.code || null, issue.evidence || null]);
}

/**
 * Install errors that a creation cart can actually be guilty of.
 *
 * The wizard buys one row per implant and never asks which arm or eye it goes
 * in, so everything the engine derives from body locations — paired limbs,
 * instance counts, slot pools — reports against a cart that is in fact legal
 * (Gorilla Arms is a single 1.000eb purchase that covers both arms). Those
 * belong to the sheet, where locations exist. What survives here are the rules
 * that hold regardless of placement: a missing prerequisite implant, an unmet
 * STAT, a unique piece bought twice, or a slot pool that is genuinely full.
 */
const CREATION_BLOCKING_ISSUES = new Set([
  'required_cyberware_missing',
  'required_stat_missing',
  'cyberware_duplicate_unique',
  'cyberware_parent_wrong_type',
  'slot_capacity_exceeded',
]);

/**
 * Errors the install engine reports for `next` that it did not already report
 * for `current` — the same rule InstallCyberware uses, so pre-existing
 * catalog-data warnings never block a purchase.
 */
function newInstallErrors(
  current: ChromeItem[],
  next: ChromeItem[],
  catalog: LegacyCatalogItem[],
  canonicalRules: CanonicalRules,
): ValidationIssue[] {
  if (!catalog.length) return [];
  const before = resolveInstalledCyberware({ equipped: current as unknown as LegacyCatalogItem[] }, catalog, canonicalRules);
  const after = resolveInstalledCyberware({ equipped: next as unknown as LegacyCatalogItem[] }, catalog, canonicalRules);
  const known = new Set(before.issues.filter((issue) => issue.severity === 'error').map(issueSignature));
  return after.issues.filter((issue) => (
    issue.severity === 'error'
    && CREATION_BLOCKING_ISSUES.has(issue.type)
    && !known.has(issueSignature(issue))
  ));
}

export interface ChromeContext {
  /** Raw catalog rows; when given, slot and requirement rules are enforced. */
  catalog?: unknown;
  canonicalRules?: CanonicalRules;
  budget?: number;
}

/** Why this item cannot be bought right now, or null when it can. */
export function chromeBlock(
  picks: ChromeItem[] | null | undefined,
  item: ChromeItem | null | undefined,
  { catalog, canonicalRules = {} as CanonicalRules, budget = CPRED_CREATION_CASH }: ChromeContext = {},
): ChromeBlock {
  const current = picks || [];
  if (!item) return { reason: 'install' };
  if (current.some((pick) => pick.code === item.code)) return { reason: 'duplicate' };
  if (item.stock === 'SOLD OUT') return { reason: 'soldout' };
  if (isChromeEnhancement(item)) {
    const parents = installedParentsOf(current, item);
    if (!parents.length) return { reason: 'parent' };
    // One enhancement per piece of cyberware at a time (Mission Kit DLC #2).
    // Only a piece that is still free can take this one.
    if (parents.every((parent) => enhancementOccupant(current, parent.code))) {
      return { reason: 'occupied', occupant: enhancementOccupant(current, parents[0].code) as ChromeItem };
    }
  }
  if (item.price > creationCashLeft(current, budget)) return { reason: 'funds' };
  const rows = (Array.isArray(catalog) ? catalog : []) as LegacyCatalogItem[];
  const issues = newInstallErrors(current, [...current, item], rows, canonicalRules);
  if (issues.length) return { reason: 'install', issues };
  return { reason: null };
}

export function chromeBlockMessage(block: ChromeBlock, item: ChromeItem | null | undefined): string {
  const name = (item && item.name) || 'Este implante';
  if (!block || !block.reason) return '';
  if (block.reason === 'duplicate') return `${name} já está instalado.`;
  if (block.reason === 'soldout') return `${name} está esgotado no catálogo.`;
  if (block.reason === 'funds') return `Sem eurodólares para ${name}. Remova outro implante ou fique sem ele.`;
  if (block.reason === 'parent') {
    const parents = (item && item.attachesTo.join(', ')) || 'o cyberware base';
    return `${name} é um aprimoramento: instale ${parents} primeiro.`;
  }
  if (block.reason === 'occupied') {
    const occupant = (block.occupant && block.occupant.name) || 'outro aprimoramento';
    return `Cada peça de cyberware aceita um aprimoramento por vez: ${occupant} já ocupa essa peça.`;
  }
  const detail = (block.issues || []).map((issue) => issue.message).join('; ');
  return `${name} não pode ser instalado${detail ? ': ' + detail : '.'}`;
}

export function canBuyChrome(
  picks: ChromeItem[] | null | undefined,
  item: ChromeItem | null | undefined,
  context: ChromeContext = {},
): boolean {
  return chromeBlock(picks, item, context).reason === null;
}

export function addChrome(
  picks: ChromeItem[] | null | undefined,
  item: ChromeItem | null | undefined,
  context: ChromeContext = {},
): ChromeItem[] {
  const current = picks || [];
  if (!item || !canBuyChrome(current, item, context)) return current;
  return [...current, item];
}

/**
 * Remove an implant. Enhancements only exist bolted onto a base implant, so
 * dropping the base refunds its enhancements too instead of leaving orphans.
 */
export function removeChrome(picks: ChromeItem[] | null | undefined, code: unknown): ChromeItem[] {
  const target = toText(code);
  if (!target) return picks || [];
  const kept = (picks || []).filter((item) => item.code !== target);
  return kept.filter((item) => !isChromeEnhancement(item) || item.attachesTo.some((parent) => kept.some((pick) => pick.code === parent)));
}

export interface ChromeAttachment {
  parent: ChromeItem;
  enhancements: ChromeItem[];
}

/** Bought chrome grouped as base implant + the enhancements attached to it. */
export function chromeAttachments(picks: ChromeItem[] | null | undefined): ChromeAttachment[] {
  const current = picks || [];
  return current.filter((item) => !isChromeEnhancement(item)).map((parent) => ({
    parent,
    enhancements: current.filter((item) => isChromeEnhancement(item) && item.attachesTo.includes(parent.code)),
  }));
}

export interface EquippedChromeRow {
  code: string;
  name: string;
  cat: string;
  price: number;
  hcost: number;
  enhancements: string[];
}

/**
 * The `equipped` rows a new sheet is saved with. Enhancement codes are listed
 * on their parent (the shape ToggleCyberwareEnhancement maintains later), and
 * the enhancement itself is also installed, since it is a real implant.
 */
export function chromeEquipped(picks: ChromeItem[] | null | undefined): EquippedChromeRow[] {
  const current = picks || [];
  return current.map((item) => ({
    code: item.code,
    name: item.name,
    cat: item.cat,
    price: item.price,
    hcost: item.hcost,
    enhancements: isChromeEnhancement(item) ? [] : current
      .filter((row) => isChromeEnhancement(row) && row.attachesTo.includes(item.code))
      .map((row) => row.code),
  }));
}
