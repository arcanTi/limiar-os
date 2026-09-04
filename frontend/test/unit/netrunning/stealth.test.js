import { describe, expect, it } from 'vitest';

import {
  STEALTH_TRACE_MULTIPLIER,
  WATCHER_PRESETS,
  actionBreaksStealth,
  advanceStealthTurn,
  breakStealth,
  buildBreachConfig,
  buildWatcher,
  canWatcherSearch,
  cloakBonus,
  establishStealth,
  failStealthAttempt,
  markWatcherSearched,
  normalizeBlackIceState,
  normalizeStealthState,
  normalizeWatchers,
  pathfinderBonus,
  resolveQuietJackIn,
  resolveStealthEncounter,
  resolveWatcherSearch,
  rollCheckD10,
  rollNpcCheck,
  rollWatcherJackInChecks,
  stealthStatusLabel,
} from '../../../src/domain/netrunning/index.ts';

// Deterministic RNG: each call pops the next face (1-10) from the queue.
const rngFaces = (...faces) => {
  const queue = faces.slice();
  return () => ((queue.length ? queue.shift() : 5) - 1) / 10;
};

describe('Going Quiet: Watchers', () => {
  it('Given the Demon presets, When reading them, Then Imp/Efreet/Balron carry RAW Interface and a custom enemy Netrunner exists', () => {
    expect(WATCHER_PRESETS.map(p => [p.id, p.interface])).toEqual([['imp', 3], ['efreet', 4], ['balron', 7], ['netrunner', 4]]);
    expect(WATCHER_PRESETS.filter(p => p.kind === 'demon').every(p => p.pathfinder === 0)).toBe(true);
  });

  it('Given a preset id, When building a watcher, Then missing fields fall back to the preset and ids stay unique', () => {
    const imp = buildWatcher({ presetId: 'imp' });
    expect(imp).toMatchObject({ name: 'Imp', kind: 'demon', interface: 3, pathfinder: 0 });
    const runner = buildWatcher({ presetId: 'netrunner', name: 'Ghost', interface: 7, pathfinder: 2 }, 2);
    expect(runner).toMatchObject({ id: 'netrunner-ghost-3', name: 'Ghost', kind: 'netrunner', interface: 7, pathfinder: 2 });
    expect(buildWatcher({ name: 'Nameless-no-interface' })).toBeNull();
    expect(buildWatcher({ presetId: 'balron', interface: '' })).toMatchObject({ interface: 7 });
  });

  it('Given raw rows, When normalizing, Then invalid rows drop, duplicates collapse and numbers clamp 0-10', () => {
    const rows = normalizeWatchers([
      { id: 'w1', name: 'Imp A', kind: 'demon', interface: 3 },
      { id: 'w1', name: 'dup', kind: 'demon', interface: 3 },
      { name: 'Hot', kind: 'netrunner', interface: 99, pathfinder: -4 },
      null,
      { presetId: 'nope' },
    ]);
    expect(rows.map(r => r.id)).toEqual(['w1', 'netrunner-hot-3']);
    expect(rows[1]).toMatchObject({ interface: 10, pathfinder: 0 });
  });
});

describe('Going Quiet: dice and contests', () => {
  it('Given a check d10, When it shows 10 or 1, Then it explodes or implodes like the visible roller', () => {
    expect(rollCheckD10(rngFaces(10, 4))).toMatchObject({ face: 10, extra: 4, total: 14 });
    expect(rollCheckD10(rngFaces(1, 3))).toMatchObject({ face: 1, extra: -3, total: -2 });
    expect(rollCheckD10(rngFaces(7))).toMatchObject({ face: 7, extra: 0, total: 7 });
    expect(rollNpcCheck('imp', 'Imp', 3, rngFaces(6))).toMatchObject({ total: 9, detail: '3 + 6 = 9' });
  });

  it('Given Quietly Jack In, When there are no Watchers, Then stealth is automatic', () => {
    const result = resolveQuietJackIn(4, []);
    expect(result.success).toBe(true);
    expect(result.caughtBy).toEqual([]);
  });

  it('Given Quietly Jack In, When the Netrunner must beat every Watcher, Then one tie is enough to be caught', () => {
    const watchers = [{ id: 'imp', name: 'Imp', kind: 'demon', interface: 3 }, { id: 'balron', name: 'Balron', kind: 'demon', interface: 7 }];
    const rolls = rollWatcherJackInChecks(watchers, rngFaces(6, 5));
    expect(rolls.map(r => r.total)).toEqual([9, 12]);
    expect(resolveQuietJackIn(13, rolls)).toMatchObject({ success: true, caughtBy: [] });
    expect(resolveQuietJackIn(12, rolls)).toMatchObject({ success: false, caughtBy: ['Balron'] });
    expect(resolveQuietJackIn(9, rolls).caughtBy).toEqual(['Imp', 'Balron']);
  });

  it('Given a hidden Netrunner meeting Black ICE or a Watcher, When totals tie, Then the Netrunner is spotted', () => {
    expect(resolveStealthEncounter(12, 11).passed).toBe(true);
    expect(resolveStealthEncounter(11, 11).passed).toBe(false);
    expect(resolveStealthEncounter(10, 11)).toMatchObject({ passed: false, margin: -1 });
  });

  it('Given a Watcher Search, When totals tie, Then the defending Netrunner stays hidden', () => {
    expect(resolveWatcherSearch(11, 11).found).toBe(false);
    expect(resolveWatcherSearch(12, 11).found).toBe(true);
  });

  it('Given rezzed boosters, When reading Cloak/Pathfinder bonuses, Then Eraser and See Ya add +2 only while rezzed', () => {
    expect(cloakBonus(['eraser', 'see-ya'])).toBe(2);
    expect(pathfinderBonus(['eraser', 'see-ya'])).toBe(2);
    expect(cloakBonus([{ id: 'eraser', rez: 0, maxRez: 7, state: 'derezzed' }])).toBe(0);
    expect(cloakBonus(undefined)).toBe(0);
  });
});

describe('Going Quiet: stealth state machine', () => {
  it('Given stealth transitions, When establishing, failing and breaking, Then status labels follow', () => {
    expect(stealthStatusLabel(null)).toBe('SEM STEALTH');
    const active = establishStealth(null, 'jack in');
    expect(active).toMatchObject({ attempted: true, active: true, brokenBy: null, turn: 1, history: ['jack in'] });
    expect(stealthStatusLabel(active)).toBe('STEALTH ATIVO');
    expect(stealthStatusLabel(failStealthAttempt(null))).toBe('STEALTH FALHOU');
    const broken = breakStealth(active, 'control');
    expect(broken.active).toBe(false);
    expect(stealthStatusLabel(broken)).toBe('STEALTH QUEBRADO // CONTROL NODE');
    // A broken state cannot be reported active by a stale flag.
    expect(normalizeStealthState({ active: true, brokenBy: 'attack' }).active).toBe(false);
  });

  it('Given the stealth-breaking action list, When checking actions, Then Control Nodes and attacks break it and Scanner does not', () => {
    expect(actionBreaksStealth('control')).toBe(true);
    expect(actionBreaksStealth('zap')).toBe(true);
    expect(actionBreaksStealth('program-attack')).toBe(true);
    expect(actionBreaksStealth('scanner')).toBe(false);
  });

  it('Given Watcher Search, When used, Then it is once per Watcher per Turn and a new Turn renews it', () => {
    let state = establishStealth(null);
    expect(canWatcherSearch(state, 'imp')).toBe(true);
    state = markWatcherSearched(state, 'imp');
    expect(canWatcherSearch(state, 'imp')).toBe(false);
    expect(canWatcherSearch(state, 'balron')).toBe(true);
    state = advanceStealthTurn(state);
    expect(state.turn).toBe(2);
    expect(canWatcherSearch(state, 'imp')).toBe(true);
    expect(canWatcherSearch(breakStealth(state, 'search'), 'imp')).toBe(false);
  });

  it('Given a Black ICE state, When normalizing, Then the Going Quiet bypassed flag round-trips', () => {
    expect(normalizeBlackIceState({ bypassed: true }, 'wisp')).toMatchObject({ id: 'wisp', bypassed: true, derezzed: false });
    expect(normalizeBlackIceState({}, 'wisp').bypassed).toBe(false);
    // A cleared (null) state reads like an untouched one: full REZ, not derezzed.
    expect(normalizeBlackIceState(null, 'wisp')).toMatchObject({ rez: 15, maxRez: 15, derezzed: false });
    expect(normalizeBlackIceState(undefined, 'wisp')).toMatchObject({ rez: 15, derezzed: false });
  });
});

describe('Going Quiet: breach config', () => {
  it('Given a successful Quietly Jack In prep, When building the config, Then trace halves below the tier floor and stealth is flagged', () => {
    const loud = buildBreachConfig('standard', 4, [], [], 'none');
    const quiet = buildBreachConfig('standard', 4, [{ abilityId: 'stealth', success: true, margin: 3 }], [], 'none');
    expect(quiet.stealthActive).toBe(true);
    expect(quiet.traceRate).toBe(Math.round(loud.traceRate * STEALTH_TRACE_MULTIPLIER * 100) / 100);
    expect(quiet.traceRate).toBeLessThan(1.0 * 0.6);
    expect(quiet.prepResults.map(r => r.abilityId)).toEqual(['stealth']);
  });

  it('Given a failed Quietly Jack In, When building the config, Then nothing changes beyond the spent NET Action', () => {
    const loud = buildBreachConfig('basic', 2, [], [], 'none');
    const failed = buildBreachConfig('basic', 2, [{ abilityId: 'stealth', success: false, margin: -2 }], [], 'none');
    expect(failed.stealthActive).toBe(false);
    expect(failed.traceRate).toBe(loud.traceRate);
    expect(failed.prepResults).toEqual([{ abilityId: 'stealth', success: false, margin: -2, source: undefined }]);
  });

  it('Given GM watchers, When building the config, Then they are normalized onto the published challenge', () => {
    const cfg = buildBreachConfig('uncommon', 5, [], [], 'none', [{ presetId: 'efreet' }, { name: 'Ghost', kind: 'netrunner', interface: 6, pathfinder: 2 }]);
    expect(cfg.watchers).toEqual([
      { id: 'demon-efreet-1', name: 'Efreet', kind: 'demon', interface: 4, pathfinder: 0 },
      { id: 'netrunner-ghost-2', name: 'Ghost', kind: 'netrunner', interface: 6, pathfinder: 2 },
    ]);
    expect(buildBreachConfig('basic', 1).watchers).toEqual([]);
  });
});
