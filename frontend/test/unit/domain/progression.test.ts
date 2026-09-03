import { describe, expect, it } from 'vitest';

import {
  achievementEntry,
  awardAchievementPatch,
  isEmptyAward,
  normalizeAchievementList,
  partyAchievementHistory,
  undoAchievementPatch,
} from '../../../src/domain/progression/index.ts';

const deps = { rng: () => 0.5, clock: () => new Date('2026-09-03T12:00:00.000Z') };

describe('domain/progression achievementEntry', () => {
  it('mints a dated entry clamped to the award limits', () => {
    const entry = achievementEntry({ title: '  Queda da Arasaka  ', ip: '80', levels: '99', scope: 'party' }, deps);
    expect(entry.title).toBe('Queda da Arasaka');
    expect(entry.ip).toBe(80);
    expect(entry.levels).toBe(10);
    expect(entry.scope).toBe('party');
    expect(entry.at).toBe('2026-09-03T12:00:00.000Z');
    expect(entry.id.startsWith('ach-')).toBe(true);
  });

  it('falls back to a titled entry and the party scope', () => {
    const entry = achievementEntry({}, deps);
    expect(entry.title).toBe('CONQUISTA');
    expect(entry.scope).toBe('party');
    expect(isEmptyAward(entry)).toBe(true);
  });

  it('treats an individual scope as such', () => {
    expect(achievementEntry({ scope: 'individual', ip: 10 }, deps).scope).toBe('individual');
  });
});

describe('domain/progression normalizeAchievementList', () => {
  it('drops junk rows and untitled entries', () => {
    const rows = normalizeAchievementList([null, 'nope', { ip: 10 }, { id: 'a1', title: 'Primeiro Job', ip: 20, levels: 1 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'a1', title: 'Primeiro Job', ip: 20, levels: 1, scope: 'party' });
  });

  it('returns an empty list for a non-array', () => {
    expect(normalizeAchievementList(undefined)).toEqual([]);
  });
});

describe('domain/progression awardAchievementPatch', () => {
  const entry = achievementEntry({ title: 'Primeiro Job', ip: 40, levels: 1 }, deps);

  it('raises level and IP and writes both ledgers', () => {
    const patch = awardAchievementPatch({ level: 2, ip: 10, ipLog: [] }, entry, deps);
    expect(patch).not.toBeNull();
    expect(patch!.level).toBe(3);
    expect(patch!.ip).toBe(50);
    expect(patch!.ipLog[0]).toMatchObject({ type: 'award', amount: 40, balanceAfter: 50 });
    expect(patch!.achievements[0].id).toBe(entry.id);
  });

  it('is a no-op when the same award is already on the sheet', () => {
    const once = awardAchievementPatch({ level: 1, ip: 0 }, entry, deps)!;
    expect(awardAchievementPatch({ ...once }, entry, deps)).toBeNull();
  });

  it('skips the IP ledger row for a level-only award', () => {
    const levelOnly = achievementEntry({ title: 'Level Up', levels: 1 }, deps);
    const patch = awardAchievementPatch({ level: 4, ip: 15, ipLog: [] }, levelOnly, deps)!;
    expect(patch.level).toBe(5);
    expect(patch.ip).toBe(15);
    expect(patch.ipLog).toHaveLength(0);
  });

  it('never pushes a character past the level ceiling', () => {
    const big = achievementEntry({ title: 'Lenda', levels: 10 }, deps);
    expect(awardAchievementPatch({ level: 95 }, big, deps)!.level).toBe(99);
  });
});

describe('domain/progression undoAchievementPatch', () => {
  const entry = achievementEntry({ title: 'Primeiro Job', ip: 40, levels: 1 }, deps);

  it('reverses level and IP and records the reversal', () => {
    const awarded = awardAchievementPatch({ level: 2, ip: 10, ipLog: [] }, entry, deps)!;
    const undone = undoAchievementPatch({ ...awarded }, entry.id, deps)!;
    expect(undone.level).toBe(2);
    expect(undone.ip).toBe(10);
    expect(undone.achievements).toHaveLength(0);
    expect(undone.ipLog[0]).toMatchObject({ type: 'revert', amount: -40, balanceAfter: 10 });
  });

  it('claws back only the IP that is still there when it was already spent', () => {
    const spent = { level: 3, ip: 15, ipLog: [], achievements: [entry] };
    const undone = undoAchievementPatch(spent, entry.id, deps)!;
    expect(undone.ip).toBe(0);
    expect(undone.ipLog[0]).toMatchObject({ amount: -15, balanceAfter: 0 });
  });

  it('never drops a character below level 1', () => {
    const deep = achievementEntry({ title: 'Erro', levels: 5 }, deps);
    expect(undoAchievementPatch({ level: 2, achievements: [deep] }, deep.id, deps)!.level).toBe(1);
  });

  it('returns null for an id nobody carries', () => {
    expect(undoAchievementPatch({ achievements: [] }, 'missing', deps)).toBeNull();
  });
});

describe('domain/progression partyAchievementHistory', () => {
  it('groups one party award into a single row carrying every member', () => {
    const entry = achievementEntry({ title: 'Queda da Arasaka', ip: 50, levels: 1 }, deps);
    const rows = partyAchievementHistory([
      { name: 'Rook', achievements: [entry] },
      { name: 'Vesper', achievements: [entry] },
      { name: 'Sem nada' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: 'Queda da Arasaka', memberCount: 2, ip: 50, levels: 1 });
    expect(rows[0].memberNames).toEqual(['Rook', 'Vesper']);
  });

  it('sorts the newest award first', () => {
    const older = achievementEntry({ title: 'Antigo', ip: 10 }, { ...deps, clock: () => new Date('2026-01-01T00:00:00.000Z') });
    const newer = achievementEntry({ title: 'Recente', ip: 10 }, deps);
    const rows = partyAchievementHistory([{ name: 'Rook', achievements: [older, newer] }]);
    expect(rows.map(row => row.title)).toEqual(['Recente', 'Antigo']);
  });
});
