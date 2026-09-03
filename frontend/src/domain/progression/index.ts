// Progression domain: campaign achievements ("conquistas") and the level-up /
// IP award they carry. Pure — the UI owns persistence and state; this module
// only produces the entries and the character patches they imply.
//
// An achievement awarded to the whole party is ONE entry replicated across
// every target: the id is shared so the campaign history can group it back
// into a single row (and undo it in one gesture), while each character still
// carries its own copy of what it earned.

import { asNumber } from '../shared/num.ts';
import { ipEntry } from '../economy/index.ts';
import type { IpLedgerEntry } from '../economy/index.ts';

export const ACHIEVEMENT_MAX_LEVEL = 99;
export const ACHIEVEMENT_MAX_IP = 9999;
export const ACHIEVEMENT_MAX_LEVELS_PER_AWARD = 10;

export type AchievementScope = 'party' | 'individual';

export interface Achievement {
  id: string;
  title: string;
  note: string;
  at: string;
  ip: number;
  levels: number;
  scope: AchievementScope;
  awardedBy: string;
}

interface EntryDeps {
  rng?: () => number;
  clock?: () => Date;
}

interface CharacterLike {
  id?: unknown;
  name?: unknown;
  level?: unknown;
  ip?: unknown;
  ipLog?: IpLedgerEntry[];
  achievements?: unknown;
  [extra: string]: unknown;
}

export interface AchievementPatch {
  level: number;
  ip: number;
  ipLog: IpLedgerEntry[];
  achievements: Achievement[];
}

function normalizeScope(value: unknown): AchievementScope {
  return value === 'individual' ? 'individual' : 'party';
}

/** Coerce a stored row into a full Achievement; returns null for junk. */
export function normalizeAchievement(raw: unknown): Achievement | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const title = String(row.title || '').trim();
  if (!title) return null;
  return {
    id: String(row.id || '').trim() || title.toLowerCase().replace(/\s+/g, '-'),
    title: title.slice(0, 120),
    note: String(row.note || '').trim().slice(0, 400),
    at: typeof row.at === 'string' ? row.at : '',
    ip: asNumber(row.ip, 0, 0, ACHIEVEMENT_MAX_IP),
    levels: asNumber(row.levels, 0, 0, ACHIEVEMENT_MAX_LEVELS_PER_AWARD),
    scope: normalizeScope(row.scope),
    awardedBy: String(row.awardedBy || '').trim().slice(0, 100),
  };
}

export function normalizeAchievementList(rows: unknown): Achievement[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeAchievement).filter((row): row is Achievement => row !== null);
}

export interface AchievementDraftInput {
  title?: unknown;
  note?: unknown;
  ip?: unknown;
  levels?: unknown;
  scope?: unknown;
  awardedBy?: unknown;
}

/**
 * Mint the entry a single "aplicar conquista" gesture produces. The same
 * object is handed to every target, so the id identifies the award, not the
 * character that received it.
 */
export function achievementEntry(
  draft: AchievementDraftInput,
  { rng = Math.random, clock = () => new Date() }: EntryDeps = {},
): Achievement {
  const at = clock();
  return {
    id: 'ach-' + at.getTime().toString(36) + '-' + rng().toString(36).slice(2, 7),
    title: String(draft.title || '').trim().slice(0, 120) || 'CONQUISTA',
    note: String(draft.note || '').trim().slice(0, 400),
    at: at.toISOString(),
    ip: asNumber(draft.ip, 0, 0, ACHIEVEMENT_MAX_IP),
    levels: asNumber(draft.levels, 0, 0, ACHIEVEMENT_MAX_LEVELS_PER_AWARD),
    scope: normalizeScope(draft.scope),
    awardedBy: String(draft.awardedBy || '').trim().slice(0, 100),
  };
}

/** True when the award would change nothing — the UI refuses those. */
export function isEmptyAward(entry: Achievement): boolean {
  return entry.ip <= 0 && entry.levels <= 0;
}

function ledgerLabel(entry: Achievement): string {
  return 'Conquista: ' + entry.title + (entry.levels ? ' (+' + entry.levels + ' nivel)' : '');
}

/**
 * The patch that grants `entry` to `character`: level, IP, the IP ledger row
 * and the achievement record. Awarding the same entry twice is a no-op — the
 * id is already on the sheet — so a double click never double-pays.
 */
export function awardAchievementPatch(
  character: CharacterLike,
  entry: Achievement,
  deps: EntryDeps = {},
): AchievementPatch | null {
  const current = normalizeAchievementList(character.achievements);
  if (current.some(row => row.id === entry.id)) return null;
  const level = asNumber(character.level, 1, 1, ACHIEVEMENT_MAX_LEVEL);
  const ipBefore = asNumber(character.ip, 0, 0, 999999);
  const ipAfter = Math.min(999999, ipBefore + entry.ip);
  const ipLog = Array.isArray(character.ipLog) ? character.ipLog : [];
  return {
    level: Math.min(ACHIEVEMENT_MAX_LEVEL, level + entry.levels),
    ip: ipAfter,
    ipLog: entry.ip > 0
      ? [ipEntry('award', ledgerLabel(entry), entry.ip, ipAfter, deps), ...ipLog]
      : ipLog,
    achievements: [entry, ...current],
  };
}

/**
 * Reverse a mistaken award. IP already spent is not clawed back below zero —
 * the ledger records the reversal for what it actually took.
 */
export function undoAchievementPatch(
  character: CharacterLike,
  achievementId: string,
  deps: EntryDeps = {},
): AchievementPatch | null {
  const current = normalizeAchievementList(character.achievements);
  const entry = current.find(row => row.id === achievementId);
  if (!entry) return null;
  const level = asNumber(character.level, 1, 1, ACHIEVEMENT_MAX_LEVEL);
  const ipBefore = asNumber(character.ip, 0, 0, 999999);
  const ipAfter = Math.max(0, ipBefore - entry.ip);
  const taken = ipBefore - ipAfter;
  const ipLog = Array.isArray(character.ipLog) ? character.ipLog : [];
  return {
    level: Math.max(1, level - entry.levels),
    ip: ipAfter,
    ipLog: taken > 0
      ? [ipEntry('revert', 'Conquista desfeita: ' + entry.title, -taken, ipAfter, deps), ...ipLog]
      : ipLog,
    achievements: current.filter(row => row.id !== achievementId),
  };
}

export interface PartyAchievementRow {
  id: string;
  title: string;
  note: string;
  at: string;
  ip: number;
  levels: number;
  scope: AchievementScope;
  memberNames: string[];
  memberCount: number;
}

/**
 * Collapse every character's achievements into the campaign's history: one
 * row per award, carrying who received it.
 */
export function partyAchievementHistory(characters: unknown): PartyAchievementRow[] {
  const rows = new Map<string, PartyAchievementRow>();
  (Array.isArray(characters) ? characters : []).forEach((raw) => {
    const character = (raw || {}) as CharacterLike;
    const name = String(character.name || character.id || 'OPERATIVE');
    normalizeAchievementList(character.achievements).forEach((entry) => {
      const existing = rows.get(entry.id);
      if (existing) {
        existing.memberNames.push(name);
        existing.memberCount += 1;
        return;
      }
      rows.set(entry.id, {
        id: entry.id,
        title: entry.title,
        note: entry.note,
        at: entry.at,
        ip: entry.ip,
        levels: entry.levels,
        scope: entry.scope,
        memberNames: [name],
        memberCount: 1,
      });
    });
  });
  return [...rows.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
