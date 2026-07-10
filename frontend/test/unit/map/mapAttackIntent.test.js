import { describe, expect, it } from 'vitest';

import { MAP_ATTACK_INTENT_MAX_AGE_MS, createMapAttackIntent, mapTokenVisibleNow, parseMapAttackIntent } from '../../../src/domain/map/mapAttackIntent.ts';

const input = { campaignId: 'c', sceneId: 's', attackerTokenId: 'a-token', attackerCharacterId: 'a', targetTokenId: 't-token', targetCharacterId: 't', targetName: 'Target', cells: 3, rangeMeters: 6 };

describe('map attack intent', () => {
  it('is versioned and expires', () => {
    const intent = createMapAttackIntent(input, 1000);
    expect(parseMapAttackIntent(intent, 1001)).toMatchObject({ version: 1, rangeMeters: 6 });
    expect(parseMapAttackIntent(intent, 1000 + MAP_ATTACK_INTENT_MAX_AGE_MS + 1)).toBeNull();
  });

  it('uses live vision rather than explored fog for a player target check', () => {
    const map = { scene: { fogEnabled: true, explorationMode: 'individual' }, tokens: [
      { kind: 'player', ownerUsername: 'mira', vision: 100, x: 0, y: 0 },
    ] };
    expect(mapTokenVisibleNow(map, { x: 60, y: 0 }, { username: 'mira' })).toBe(true);
    expect(mapTokenVisibleNow(map, { x: 101, y: 0 }, { username: 'mira' })).toBe(false);
    expect(mapTokenVisibleNow(map, { visible: false, x: 0, y: 0 }, { username: 'mira' })).toBe(false);
  });

  it('can extend current visibility through a perceived wall-aware light without persisting exploration', () => {
    const map = { scene: { fogEnabled: true, gridSize: 64 }, tokens: [
      { id: 'mira-token', kind: 'player', vision: 80, x: 0, y: 0 },
    ], lights: [{ enabled: true, x: 60, y: 0, dimUnits: 4 }], walls: [] };
    expect(mapTokenVisibleNow(map, { x: 150, y: 0 })).toBe(true);
    expect(mapTokenVisibleNow({ ...map, walls: [{ x1: 100, y1: -30, x2: 100, y2: 30, kind: 'wall' }] }, { x: 150, y: 0 })).toBe(false);
  });
});
