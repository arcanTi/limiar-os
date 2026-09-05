import { describe, expect, it } from 'vitest';

import {
  BREACH_CONNECTIONS,
  BREACH_TIERS,
  breachConnectionOptions,
  breachTierForDv,
  buildBreachConfig,
  normalizeBreachConnection,
} from '../../../src/domain/netrunning/breachConfigEngine.ts';

describe('domain/netrunning breachTierForDv', () => {
  it('picks the cheapest tier whose DV is at least the requested one', () => {
    expect(breachTierForDv(4)).toBe('basic');
    expect(breachTierForDv(6)).toBe('basic');
    expect(breachTierForDv(7)).toBe('standard');
    expect(breachTierForDv(8)).toBe('standard');
    expect(breachTierForDv(9)).toBe('uncommon');
    expect(breachTierForDv(10)).toBe('uncommon');
    expect(breachTierForDv(11)).toBe('advanced');
    expect(breachTierForDv(12)).toBe('advanced');
  });

  it('caps past the ladder and falls back to Standard without a usable DV', () => {
    expect(breachTierForDv(30)).toBe('advanced');
    expect(breachTierForDv(null)).toBe('standard');
    expect(breachTierForDv(undefined)).toBe('standard');
    expect(breachTierForDv('nope')).toBe('standard');
  });

  it('maps every tier DV back to that same tier', () => {
    Object.values(BREACH_TIERS).forEach(tier => {
      expect(breachTierForDv(tier.dv)).toBe(tier.id);
    });
  });
});

describe('domain/netrunning breach connection', () => {
  it('normalizes to wireless and lists the three links', () => {
    expect(normalizeBreachConnection('hardline')).toBe('hardline');
    expect(normalizeBreachConnection('REMOTE')).toBe('remote');
    expect(normalizeBreachConnection('')).toBe('wireless');
    expect(normalizeBreachConnection('satellite')).toBe('wireless');
    expect(breachConnectionOptions().map(link => link.id)).toEqual(['hardline', 'wireless', 'remote']);
  });

  it('bends the clock, the trace, the nodes and the check modifier per link', () => {
    // Interface 4 on a Standard system (Speed 4) is a dead-even contest, so
    // every difference below comes from the link alone.
    const wireless = buildBreachConfig('standard', 4, [], [], 'none', [], { connection: 'wireless' });
    const hardline = buildBreachConfig('standard', 4, [], [], 'none', [], { connection: 'hardline' });
    const remote = buildBreachConfig('standard', 4, [], [], 'none', [], { connection: 'remote' });

    expect(wireless).toMatchObject({ connection: 'wireless', timeLimit: 100, traceRate: 1, extraNodes: 2, connectionCheckMod: 0 });
    expect(hardline).toMatchObject({ connection: 'hardline', timeLimit: 110, traceRate: 0.85, extraNodes: 1, connectionCheckMod: 1 });
    expect(remote).toMatchObject({ connection: 'remote', timeLimit: 85, traceRate: 1.3, extraNodes: 3, connectionCheckMod: -2 });
    expect(remote.connectionLabel).toBe(BREACH_CONNECTIONS.remote.label);
  });
});

describe('domain/netrunning breach speed contest', () => {
  it('measures the operative against the architecture, not against zero', () => {
    // The same Interface 6 is fast on a Basic system and even on an Uncommon.
    const easy = buildBreachConfig('basic', 6, [], [], 'none');
    const even = buildBreachConfig('uncommon', 6, [], [], 'none');

    expect(easy).toMatchObject({ runnerSpeed: 6, systemSpeed: 2, speedDelta: 4, timeLimit: 136 });
    expect(even).toMatchObject({ runnerSpeed: 6, systemSpeed: 6, speedDelta: 0, timeLimit: 90, traceRate: 1.2 });
  });

  it('counts Booster Speed on the operative side and clamps the gap at six', () => {
    const booster = buildBreachConfig('standard', 4, [], ['speedy-gonzalvez'], 'none');
    expect(booster).toMatchObject({ runnerSpeed: 6, systemSpeed: 4, speedDelta: 2, timeLimit: 108 });

    // Interface 10 + 2 SPD against a Basic system's 2 would be +10.
    const capped = buildBreachConfig('basic', 10, [], ['speedy-gonzalvez'], 'none');
    expect(capped.speedDelta).toBe(6);

    // A slow operative loses the same way: Interface 1 on Advanced (Speed 8).
    const outpaced = buildBreachConfig('advanced', 1, [], [], 'none');
    expect(outpaced).toMatchObject({ speedDelta: -6, timeLimit: 56, traceRate: 1.77 });
  });
});

describe('domain/netrunning breach test DV', () => {
  it('keeps the DV the GM asked for and hardens the run past the tier ladder', () => {
    const beyond = buildBreachConfig('advanced', 8, [], [], 'none', [], { dv: 16 });
    expect(beyond).toMatchObject({
      architectureDv: 16,
      tierDv: 12,
      // -4s and +5% trace per point over the tier, plus a node every two points.
      timeLimit: 64,
      traceRate: 1.8,
      extraNodes: 4,
    });
  });

  it('gives a DV under the tier its slack back, without removing nodes', () => {
    const soft = buildBreachConfig('standard', 4, [], [], 'none', [], { dv: 7 });
    expect(soft).toMatchObject({ architectureDv: 7, timeLimit: 104, traceRate: 0.95, extraNodes: 2 });
  });

  it('falls back to the tier DV when the GM named none', () => {
    Object.values(BREACH_TIERS).forEach(tier => {
      expect(buildBreachConfig(tier.id, 4, [], [], 'none').architectureDv).toBe(tier.dv);
    });
    expect(buildBreachConfig('standard', 4, [], [], 'none', [], { dv: '' }).architectureDv).toBe(8);
  });

  it('digests the three axes for the GM preview', () => {
    const cfg = buildBreachConfig('uncommon', 8, [], [], 'none', [], { dv: 10, connection: 'remote' });
    expect(cfg.difficultyDigest).toEqual([
      'DV 10 // Uncommon',
      'SPD 8 vs 6 (+2)',
      'REMOTO // trace x1.30 // checks -2',
    ]);
  });
});
