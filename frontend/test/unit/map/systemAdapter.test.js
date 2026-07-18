import { describe, expect, it } from 'vitest';

import { cprAmmoBadge, cprDismissBadge, cprOnMeasureBetweenTokens, cprOnResolveTemplate, cprTokenBadges, cprWoundVisual } from '../../../src/domain/map/systemAdapter.ts';

describe('map systemAdapter (CPR): cprWoundVisual', () => {
  it('returns null when the token has no HP tracked (nothing to color)', () => {
    expect(cprWoundVisual({ hp: null, hpMax: null })).toBeNull();
    expect(cprWoundVisual({ hp: 5, hpMax: null })).toBeNull();
  });

  it('classifies full HP as healthy', () => {
    const visual = cprWoundVisual({ hp: 40, hpMax: 40 });
    expect(visual.state).toBe('healthy');
  });

  it('classifies HP at/under hpMax/2 (rounded up) as seriously wounded', () => {
    const visual = cprWoundVisual({ hp: 20, hpMax: 40 });
    expect(visual.state).toBe('seriouslyWounded');
  });

  it('classifies HP below 1 as mortally wounded', () => {
    const visual = cprWoundVisual({ hp: 0, hpMax: 40 });
    expect(visual.state).toBe('mortallyWounded');
  });

  it('gives each wound state a distinct ring color', () => {
    const colors = new Set(
      [
        { hp: 40, hpMax: 40 },
        { hp: 39, hpMax: 40 },
        { hp: 20, hpMax: 40 },
        { hp: 0, hpMax: 40 },
      ].map(vitals => cprWoundVisual(vitals).color),
    );
    expect(colors.size).toBe(4);
  });
});

describe('map systemAdapter (CPR): cprTokenBadges', () => {
  it('returns no badges for a token with no conditions', () => {
    expect(cprTokenBadges({})).toEqual([]);
  });

  it('surfaces untreated critical injuries but skips treated ones', () => {
    const badges = cprTokenBadges({
      criticalInjuries: [
        { instanceId: 'ci-1', injury: 'brokenArm', name_pt: 'Braco quebrado', location: 'body', treated: false },
        { instanceId: 'ci-2', injury: 'concussion', name_pt: 'Concussao', location: 'head', treated: true },
      ],
    });
    expect(badges).toEqual([{ kind: 'injury', id: 'ci-1', label: 'Braco quebrado', detail: 'body' }]);
  });

  it('surfaces active status effects', () => {
    const badges = cprTokenBadges({
      statusEffects: [{ instanceId: 'se-1', id: 'onFire', label_pt: 'Em chamas' }],
    });
    expect(badges).toEqual([{ kind: 'status', id: 'se-1', label: 'Em chamas' }]);
  });

  it('combines injuries and statuses in one badge list', () => {
    const badges = cprTokenBadges({
      criticalInjuries: [{ instanceId: 'ci-1', injury: 'brokenArm', name_pt: 'Braco quebrado', location: 'body', treated: false }],
      statusEffects: [{ instanceId: 'se-1', id: 'onFire', label_pt: 'Em chamas' }],
    });
    expect(badges.map(b => b.kind)).toEqual(['injury', 'status']);
  });
});

describe('map systemAdapter (CPR): cprAmmoBadge', () => {
  it('returns null when the token has no ammo-tracked weapon', () => {
    expect(cprAmmoBadge({})).toBeNull();
    expect(cprAmmoBadge({ ammo: null })).toBeNull();
    expect(cprAmmoBadge({ ammo: { weaponId: 'knife', magazine: null } })).toBeNull();
  });

  it('formats current/magazine and flags needsReload only at zero', () => {
    expect(cprAmmoBadge({ ammo: { weaponId: 'pistol', currentAmmo: 5, magazine: 12 } })).toEqual({ weaponId: 'pistol', label: '5/12', needsReload: false });
    expect(cprAmmoBadge({ ammo: { weaponId: 'pistol', currentAmmo: 0, magazine: 12 } })).toEqual({ weaponId: 'pistol', label: '0/12', needsReload: true });
  });

  it('defaults currentAmmo to a full magazine when unset (never-fired weapon)', () => {
    expect(cprAmmoBadge({ ammo: { weaponId: 'pistol', currentAmmo: null, magazine: 12 } })).toEqual({ weaponId: 'pistol', label: '12/12', needsReload: false });
  });
});

describe('map systemAdapter (CPR): cprOnMeasureBetweenTokens', () => {
  it('returns a generic attack command only for character-linked tokens', () => {
    expect(cprOnMeasureBetweenTokens({
      attackerToken: { id: 'a-token', characterId: 'a' }, targetToken: { id: 't-token', characterId: 't', name: 'Target' }, cells: 3, rangeMeters: 6,
    })).toMatchObject({ kind: 'attack', attackerCharacterId: 'a', targetCharacterId: 't', rangeMeters: 6 });
    expect(cprOnMeasureBetweenTokens({
      attackerToken: { id: 'a-token' }, targetToken: { id: 't-token', characterId: 't' }, cells: 3, rangeMeters: 6,
    })).toBeNull();
  });
});

describe('map systemAdapter (CPR): cprOnResolveTemplate', () => {
  it('extracts distinct target character ids and area metadata from the affected token list', () => {
    const command = cprOnResolveTemplate({
      template: { kind: 'circle', label: 'granada' },
      tokens: [{ id: 't1', characterId: 'mira' }, { id: 't2', characterId: 'rook' }],
    });
    expect(command).toEqual({ kind: 'aoe', targetCharacterIds: ['mira', 'rook'], areaKind: 'circle', areaLabel: 'granada' });
  });

  it('de-duplicates tokens sharing the same character', () => {
    const command = cprOnResolveTemplate({
      template: { kind: 'cone' },
      tokens: [{ id: 't1', characterId: 'mira' }, { id: 't2', characterId: 'mira' }],
    });
    expect(command.targetCharacterIds).toEqual(['mira']);
  });

  it('returns null when no affected token is linked to a character', () => {
    expect(cprOnResolveTemplate({ template: { kind: 'circle' }, tokens: [{ id: 't1' }, { id: 't2', characterId: '' }] })).toBeNull();
    expect(cprOnResolveTemplate({ template: { kind: 'circle' }, tokens: [] })).toBeNull();
  });
});

describe('map systemAdapter (CPR): cprDismissBadge', () => {
  it('marks an injury badge treated rather than deleting it', () => {
    const character = { criticalInjuries: [{ instanceId: 'ci-1', injury: 'brokenArm', name_pt: 'Braco quebrado', location: 'body', treated: false }] };
    const patch = cprDismissBadge(character, { kind: 'injury', id: 'ci-1', label: 'Braco quebrado' });
    expect(patch.criticalInjuries).toEqual([expect.objectContaining({ instanceId: 'ci-1', treated: true })]);
  });

  it('removes a status badge outright', () => {
    const character = { statusEffects: [{ instanceId: 'se-1', id: 'onFire', label_pt: 'Em chamas' }] };
    const patch = cprDismissBadge(character, { kind: 'status', id: 'se-1', label: 'Em chamas' });
    expect(patch.statusEffects).toEqual([]);
  });

  it('returns null for an unrecognized badge kind', () => {
    expect(cprDismissBadge({}, { kind: 'bogus', id: 'x', label: '' })).toBeNull();
  });
});
