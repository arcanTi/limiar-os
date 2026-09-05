// Wearing armor: the missing link between a bought piece and the SP the
// character actually rolls against.
//
// Everything downstream of `character.armor` already worked. `derivedStats`
// subtracts `spDamage` from the worn SP and taxes REF/DEX/MOVE by the penalty;
// `combatArmorEngine` layers worn armor against cyberware and ablates it. What
// never existed was anything that *wrote* `character.armor`: buying Flak put a
// row in the inventory, the EQUIPAR button flipped a boolean on that row, and
// the sheet went on reporting the default SP 11 Light Armorjack. This module
// is that write path, and the rules that go with it.
//
// Two shapes of `armor` live in the catalog and both are read here:
//   - a plain number on chrome (Skin Weave's SP 7) — an implant, never worn,
//     so it is not a wearable piece and this module returns null for it;
//   - a `{headSP, bodySP, ablates, armorPenalty:{REF,DEX,MOVE}}` record on the
//     nine wearable rows, because CPR armor covers two locations and the heavy
//     sets charge REF, DEX and MOVE for the privilege.

import type { CharacterArmor, ArmorSlot } from '../character/constants.ts';
import { armorSp, armorPenaltyOf } from './marketAcquisition.ts';

export type ArmorLocation = 'head' | 'body';

export const ARMOR_LOCATIONS: ArmorLocation[] = ['head', 'body'];

/** A wearable piece as the catalog describes it, before anyone puts it on. */
export interface WornArmorProfile {
  code: string;
  name: string;
  headSp: number;
  bodySp: number;
  /**
   * Positive magnitude. The catalog stores the tax as negative numbers per
   * stat (`{REF:-4}`); `character.armor.*.penalty` stores it as the amount to
   * subtract, and `normalizeArmor` clamps it to 0..9. Converting here keeps
   * the sign convention in one place.
   */
  penalty: number;
  /** Locations this piece is able to protect. */
  covers: ArmorLocation[];
}

interface ItemLike {
  code?: unknown;
  name?: unknown;
  kind?: unknown;
  armor?: unknown;
  category?: unknown;
  cat?: unknown;
}

function text(value: unknown): string {
  return String(value == null ? '' : value).trim();
}

function locationSp(record: unknown, key: 'headSP' | 'bodySP'): number {
  if (!record || typeof record !== 'object') return 0;
  const raw = (record as Record<string, unknown>)[key];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

/**
 * The piece a catalog row or inventory item describes, or null when the row is
 * not wearable armor. Chrome carrying a numeric `armor` is deliberately not
 * wearable: a Subdermal Armor implant is surgery, and `combatArmorEngine`
 * already layers it in from the installed list.
 */
export function wornArmorProfile(item: ItemLike | null | undefined): WornArmorProfile | null {
  if (!item) return null;
  // A normalized inventory row already carries the resolved profile —
  // `normalizeGearItem` computes it once against the catalog, and the raw
  // `armor` record does not survive normalization.
  const precomputed = (item as { armorProfile?: WornArmorProfile | null }).armorProfile;
  if (precomputed && Array.isArray(precomputed.covers) && precomputed.covers.length) return precomputed;
  const record = item.armor;
  if (!record || typeof record !== 'object') return null;

  const headSp = locationSp(record, 'headSP');
  const bodySp = locationSp(record, 'bodySP');
  // `armorSp` is the fallback for a record that only carries a flat `sp`.
  const flat = headSp || bodySp ? 0 : armorSp(item as { armor?: unknown });
  const head = headSp || flat;
  const body = bodySp || flat;
  if (!head && !body) return null;

  const penalty = armorPenaltyOf(item as { armor?: unknown });
  const worst = penalty ? Math.max(Math.abs(penalty.REF), Math.abs(penalty.DEX), Math.abs(penalty.MOVE)) : 0;

  const covers: ArmorLocation[] = [];
  if (head) covers.push('head');
  if (body) covers.push('body');

  return {
    code: text(item.code),
    name: text(item.name) || text(item.code) || 'Armor',
    headSp: head,
    bodySp: body,
    penalty: worst,
    covers,
  };
}

export function isWearableArmor(item: ItemLike | null | undefined): boolean {
  return wornArmorProfile(item) !== null;
}

function spFor(profile: WornArmorProfile, location: ArmorLocation): number {
  return location === 'head' ? profile.headSp : profile.bodySp;
}

// ---------------------------------------------------------------------------
// Equipping
// ---------------------------------------------------------------------------

export interface GearRow {
  id?: unknown;
  code?: unknown;
  name?: unknown;
  equipped?: unknown;
  /**
   * Which locations this row is currently worn on. Per-piece state, so a vest
   * taken off and put back on keeps its own history rather than inheriting
   * whatever the location happened to hold.
   */
  wornAt?: unknown;
  /**
   * SP this specific piece has lost. `character.spDamage` only tracks per
   * location, which cannot tell a battered vest from a fresh one once you own
   * two. Ablation is stored on the piece and mirrored to the location while
   * it is worn.
   */
  spAblated?: unknown;
  armor?: unknown;
}

export interface CharacterLike {
  armor?: Partial<CharacterArmor> | null;
  spDamage?: { head?: unknown; body?: unknown } | null;
  gear?: GearRow[] | null;
}

export type EquipRefusal =
  | 'not-armor'
  | 'unknown-item'
  | 'location-not-covered'
  | 'no-location'
  | 'already-worn';

export interface ArmorPatch {
  armor: CharacterArmor;
  spDamage: { head: number; body: number };
  gear: GearRow[];
}

export interface EquipResult {
  ok: boolean;
  reason?: EquipRefusal;
  message?: string;
  patch?: ArmorPatch;
  /** Locations the piece ended up on, for the toast. */
  locations?: ArmorLocation[];
  /** Pieces displaced from a location to make room. */
  replaced?: { code: string; name: string; locations: ArmorLocation[] }[];
  /** What the change costs when it happens mid-firefight. */
  timeCost?: ArmorTimeCost | null;
}

export interface ArmorTimeCost {
  /** Actions the change consumes. */
  actions: number;
  /** Whole rounds it takes, when one turn is not enough. */
  rounds: number;
  label: string;
}

/**
 * Changing armor in the middle of a firefight.
 *
 * CPR RED gives no printed action cost for swapping worn armor — the book
 * simply does not imagine anyone doing it under fire. These are table
 * conventions, kept here so the number is stated once and the GM can see what
 * they are agreeing to, rather than being invented differently each session:
 * taking a piece off costs an Action, putting one on costs a full Round, and a
 * straight swap costs both.
 */
export const ARMOR_SWAP_COST = { doff: { actions: 1, rounds: 0 }, don: { actions: 0, rounds: 1 } };

function timeCostFor(putOn: boolean, tookOff: boolean): ArmorTimeCost | null {
  if (!putOn && !tookOff) return null;
  const actions = tookOff ? ARMOR_SWAP_COST.doff.actions : 0;
  const rounds = putOn ? ARMOR_SWAP_COST.don.rounds : 0;
  const parts = [];
  if (actions) parts.push(actions + (actions > 1 ? ' acoes' : ' acao'));
  if (rounds) parts.push(rounds + (rounds > 1 ? ' rodadas' : ' rodada'));
  return { actions, rounds, label: parts.join(' + ') };
}

const BARE: ArmorSlot = { name: '', sp: 0, penalty: 0 };

function normalizeLocations(value: unknown): ArmorLocation[] {
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  return ARMOR_LOCATIONS.filter(loc => list.some(entry => text(entry).toLowerCase() === loc));
}

function ablationOf(row: GearRow | null | undefined): number {
  const parsed = Number(row?.spAblated);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function slotFor(profile: WornArmorProfile, location: ArmorLocation): ArmorSlot {
  return { name: profile.name, sp: spFor(profile, location), penalty: profile.penalty };
}

/**
 * Put a piece on. `locations` picks which of the covered spots to use — a set
 * that lists both head and body can still be worn as the vest alone, which is
 * what "select head or body" means for a catalog whose rows are full sets.
 * Omitting it wears everything the piece covers.
 *
 * A location holds one piece. Anything already there is taken off first and
 * keeps its own accumulated ablation, so swapping back later does not hand the
 * character a repaired vest.
 */
export function equipWornArmor(input: {
  character: CharacterLike;
  itemId: string;
  locations?: ArmorLocation[] | ArmorLocation | null;
  /** Resolves a gear row against the catalog, so SP need not be duplicated. */
  resolveItem?: (row: GearRow) => ItemLike;
}): EquipResult {
  const { character, itemId, resolveItem } = input;
  const gear = Array.isArray(character.gear) ? character.gear : [];
  const index = gear.findIndex(row => text(row?.id) === text(itemId));
  if (index < 0) return { ok: false, reason: 'unknown-item', message: 'Item nao esta no inventario.' };

  const row = gear[index];
  const source = resolveItem ? resolveItem(row) : (row as ItemLike);
  const profile = wornArmorProfile(source);
  if (!profile) return { ok: false, reason: 'not-armor', message: 'Este item nao e uma armadura vestivel.' };

  const requested = input.locations == null
    ? profile.covers
    : normalizeLocations(input.locations);
  if (!requested.length) return { ok: false, reason: 'no-location', message: 'Escolha cabeca ou corpo.' };

  const unsupported = requested.filter(loc => !profile.covers.includes(loc));
  if (unsupported.length) {
    return {
      ok: false,
      reason: 'location-not-covered',
      message: `${profile.name} nao cobre ${unsupported.join(' e ')}.`,
    };
  }

  const alreadyHere = normalizeLocations(row.wornAt);
  if (alreadyHere.length === requested.length && requested.every(loc => alreadyHere.includes(loc))) {
    return { ok: false, reason: 'already-worn', message: `${profile.name} ja esta equipado.` };
  }

  // One piece per location: take off whatever occupies the requested spots.
  const replaced: { code: string; name: string; locations: ArmorLocation[] }[] = [];
  const nextGear = gear.map((entry, i) => {
    if (i === index) return entry;
    const worn = normalizeLocations(entry?.wornAt);
    const conflict = worn.filter(loc => requested.includes(loc));
    if (!conflict.length) return entry;
    const kept = worn.filter(loc => !requested.includes(loc));
    replaced.push({ code: text(entry.code), name: text(entry.name) || text(entry.code), locations: conflict });
    return { ...entry, wornAt: kept, equipped: kept.length > 0 };
  });

  nextGear[index] = { ...row, wornAt: requested, equipped: true };

  const armor: CharacterArmor = {
    head: { ...BARE },
    body: { ...BARE },
  };
  const spDamage = { head: 0, body: 0 };
  // Rebuild both locations from what is worn after the swap, so the sheet can
  // never drift from the inventory.
  nextGear.forEach(entry => {
    const entrySource = resolveItem ? resolveItem(entry) : (entry as ItemLike);
    const entryProfile = wornArmorProfile(entrySource);
    if (!entryProfile) return;
    normalizeLocations(entry.wornAt).forEach(loc => {
      armor[loc] = slotFor(entryProfile, loc);
      spDamage[loc] = Math.min(ablationOf(entry), spFor(entryProfile, loc));
    });
  });

  return { ok: true, patch: { armor, spDamage, gear: nextGear }, locations: requested, replaced, timeCost: timeCostFor(true, replaced.length > 0) };
}

/** Take a piece off a location, banking its ablation on the piece itself. */
export function unequipWornArmor(input: {
  character: CharacterLike;
  locations: ArmorLocation[] | ArmorLocation;
  resolveItem?: (row: GearRow) => ItemLike;
}): EquipResult {
  const { character, resolveItem } = input;
  const gear = Array.isArray(character.gear) ? character.gear : [];
  const targets = normalizeLocations(input.locations);
  if (!targets.length) return { ok: false, reason: 'no-location', message: 'Escolha cabeca ou corpo.' };

  const currentDamage = {
    head: Math.max(0, Number(character.spDamage?.head) || 0),
    body: Math.max(0, Number(character.spDamage?.body) || 0),
  };

  let touched = false;
  const nextGear = gear.map(entry => {
    const worn = normalizeLocations(entry?.wornAt);
    const leaving = worn.filter(loc => targets.includes(loc));
    if (!leaving.length) return entry;
    touched = true;
    const kept = worn.filter(loc => !targets.includes(loc));
    // The piece carries away whatever the location had lost.
    const banked = Math.max(ablationOf(entry), ...leaving.map(loc => currentDamage[loc]));
    return { ...entry, wornAt: kept, equipped: kept.length > 0, spAblated: banked };
  });
  if (!touched) return { ok: false, reason: 'unknown-item', message: 'Nada equipado nesse local.' };

  const armor: CharacterArmor = { head: { ...BARE }, body: { ...BARE } };
  const spDamage = { head: 0, body: 0 };
  nextGear.forEach(entry => {
    const entrySource = resolveItem ? resolveItem(entry) : (entry as ItemLike);
    const entryProfile = wornArmorProfile(entrySource);
    if (!entryProfile) return;
    normalizeLocations(entry.wornAt).forEach(loc => {
      armor[loc] = slotFor(entryProfile, loc);
      spDamage[loc] = Math.min(ablationOf(entry), spFor(entryProfile, loc));
    });
  });

  return { ok: true, patch: { armor, spDamage, gear: nextGear }, locations: targets, timeCost: timeCostFor(false, true) };
}

/**
 * Repair worn armor. CPR RAW (p.99): a Tech patches SP back one point at a
 * time; `amount` omitted restores the piece to full. Repairs the piece and the
 * location together, so an unequipped-then-re-equipped vest stays repaired.
 */
export function repairWornArmor(input: {
  character: CharacterLike;
  location: ArmorLocation;
  amount?: number | null;
  resolveItem?: (row: GearRow) => ItemLike;
}): EquipResult {
  const { character, location, resolveItem } = input;
  if (!ARMOR_LOCATIONS.includes(location)) {
    return { ok: false, reason: 'no-location', message: 'Escolha cabeca ou corpo.' };
  }
  const gear = Array.isArray(character.gear) ? character.gear : [];
  const current = Math.max(0, Number(character.spDamage?.[location]) || 0);
  const requested = input.amount == null ? current : Math.max(0, Math.trunc(Number(input.amount) || 0));
  const healed = Math.min(current, requested);
  if (!healed) return { ok: false, reason: 'unknown-item', message: 'Nada a reparar nesse local.' };

  const nextGear = gear.map(entry => {
    if (!normalizeLocations(entry?.wornAt).includes(location)) return entry;
    return { ...entry, spAblated: Math.max(0, ablationOf(entry) - healed) };
  });

  const armor: CharacterArmor = { head: { ...BARE }, body: { ...BARE } };
  const spDamage = {
    head: Math.max(0, Number(character.spDamage?.head) || 0),
    body: Math.max(0, Number(character.spDamage?.body) || 0),
  };
  spDamage[location] = current - healed;
  nextGear.forEach(entry => {
    const entrySource = resolveItem ? resolveItem(entry) : (entry as ItemLike);
    const entryProfile = wornArmorProfile(entrySource);
    if (!entryProfile) return;
    normalizeLocations(entry.wornAt).forEach(loc => { armor[loc] = slotFor(entryProfile, loc); });
  });

  return { ok: true, patch: { armor, spDamage, gear: nextGear }, locations: [location] };
}

/**
 * What is worn where, for the inventory and sheet to render.
 *
 * `ablation` should be the sheet's own aggregate (`derived.spAblation`), which
 * sums two sources: `character.spDamage`, written by combat, and any condition
 * carrying a `modifiers.spAblation` the GM applied by hand. Recomputing from
 * `spDamage` alone lets this panel disagree with the SP printed beside it.
 * Omitting it falls back to `spDamage`, which is right for a bare character
 * record with no conditions resolved.
 */
export function wornArmorSummary(
  character: CharacterLike,
  resolveItem?: (row: GearRow) => ItemLike,
  ablation?: { head?: unknown; body?: unknown } | null,
) {
  const gear = Array.isArray(character.gear) ? character.gear : [];
  return ARMOR_LOCATIONS.map(location => {
    const entry = gear.find(row => normalizeLocations(row?.wornAt).includes(location));
    const profile = entry ? wornArmorProfile(resolveItem ? resolveItem(entry) : (entry as ItemLike)) : null;
    const maxSp = profile ? spFor(profile, location) : 0;
    // While a piece is worn, combat writes its ablation to the character's
    // `spDamage` for that location (ApplyCombatDamage), not to the gear row —
    // the row is only stamped when the piece comes off. Reading the row alone
    // makes this panel report a pristine vest while the sheet next to it shows
    // the real, lower SP. The higher of the two is the truth in both states.
    const source = ablation && ablation[location] != null ? ablation : character.spDamage;
    const live = Math.max(0, Number(source?.[location as 'head' | 'body']) || 0);
    const ablated = Math.min(Math.max(ablationOf(entry), live), maxSp);
    return {
      location,
      code: profile ? profile.code : '',
      name: profile ? profile.name : '',
      maxSp,
      currentSp: Math.max(0, maxSp - ablated),
      ablated,
      penalty: profile ? profile.penalty : 0,
      empty: !profile,
    };
  });
}
