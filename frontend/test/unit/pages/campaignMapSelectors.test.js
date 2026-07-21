import { describe, expect, it } from 'vitest';

import {
  buildAttackMeasure, canEditTemplate, canMove, lightPosition, lightRadiusPx,
  liveVisionTokens, losWalls, propAt, sceneSize, templateAt, tokenAt,
  tokenRadius, tokenVisibleNow, visionRadiusPx, wallAt,
} from '../../../src/pages/campaignMapSelectors.js';

function baseState(overrides = {}) {
  return {
    canEdit: false, session: { username: 'gm' }, scene: { width: 1600, height: 1000, gridSize: 64 },
    tokens: [], templates: [], props: [], walls: [], lights: [], reveals: [],
    camera: { x: 0, y: 0, zoom: 1 },
    ...overrides,
  };
}

describe('campaignMapSelectors (ARQUITETURA 4B)', () => {
  it('sceneSize falls back to defaults when the scene is missing fields', () => {
    expect(sceneSize(baseState({ scene: null }))).toEqual({ w: 1600, h: 1000, g: 64 });
    expect(sceneSize(baseState({ scene: { width: 800, height: 600, gridSize: 32 } }))).toEqual({ w: 800, h: 600, g: 32 });
  });

  it('tokenRadius scales with grid size and token size, floored at 14', () => {
    const state = baseState();
    expect(tokenRadius(state, { size: 1 })).toBeCloseTo(64 * 0.36);
    expect(tokenRadius(state, {})).toBeGreaterThanOrEqual(14);
  });

  it('canMove/canEditTemplate: GM can always, owner can move their own, others cannot', () => {
    const gmState = baseState({ canEdit: true, session: { username: 'anyone' } });
    expect(canMove(gmState, { ownerUsername: 'someone-else' })).toBe(true);
    const playerState = baseState({ canEdit: false, session: { username: 'mira' } });
    expect(canMove(playerState, { ownerUsername: 'mira' })).toBe(true);
    expect(canMove(playerState, { ownerUsername: 'other' })).toBe(false);
    expect(canEditTemplate).toBe(canMove);
  });

  it('tokenAt hit-tests by radius and skips invisible tokens for non-GM', () => {
    const state = baseState({ tokens: [{ id: 't1', x: 0, y: 0, size: 1, visible: false }] });
    expect(tokenAt(state, { x: 0, y: 0 })).toBeNull();
    state.canEdit = true;
    expect(tokenAt(state, { x: 0, y: 0 })).toMatchObject({ id: 't1' });
  });

  it('templateAt / propAt / wallAt hit-test their own geometry', () => {
    const state = baseState({
      templates: [{ id: 'tpl', x: 100, y: 100 }],
      props: [{ id: 'p1', x: 0, y: 0, w: 10, h: 10 }],
      walls: [{ id: 'w1', x1: 0, y1: 0, x2: 100, y2: 0 }],
    });
    expect(templateAt(state, { x: 100, y: 101 })).toMatchObject({ id: 'tpl' });
    expect(templateAt(state, { x: 500, y: 500 })).toBeNull();
    expect(propAt(state, { x: 5, y: 5 })).toMatchObject({ id: 'p1' });
    expect(propAt(state, { x: 50, y: 50 })).toBeNull();
    expect(wallAt(state, { x: 50, y: 0 })).toMatchObject({ id: 'w1' });
    expect(wallAt(state, { x: 50, y: 50 })).toBeUndefined();
  });

  it('liveVisionTokens pools shared player tokens but isolates individual exploration to the owner', () => {
    const tokens = [
      { id: 'a', kind: 'player', visionDistanceUnits: 10, ownerUsername: 'mira' },
      { id: 'b', kind: 'player', visionDistanceUnits: 10, ownerUsername: 'kai' },
    ];
    const shared = baseState({ tokens, scene: { ...baseState().scene, explorationMode: 'shared' }, session: { username: 'mira' } });
    expect(liveVisionTokens(shared).map(t => t.id)).toEqual(['a', 'b']);
    const individual = baseState({ tokens, scene: { ...baseState().scene, explorationMode: 'individual' }, session: { username: 'mira' } });
    expect(liveVisionTokens(individual).map(t => t.id)).toEqual(['a']);
  });

  it('tokenVisibleNow: GM always sees hidden tokens, no-fog scene is always visible, fogged token needs a viewer in range', () => {
    expect(tokenVisibleNow(baseState({ canEdit: true }), { visible: false })).toBe(true);
    expect(tokenVisibleNow(baseState({ scene: { ...baseState().scene, fogEnabled: false } }), { x: 0, y: 0 })).toBe(true);
    const fogged = baseState({
      scene: { ...baseState().scene, fogEnabled: true },
      tokens: [{ id: 'viewer', kind: 'player', vision: 100, x: 0, y: 0 }],
    });
    expect(tokenVisibleNow(fogged, { x: 50, y: 0 })).toBe(true);
    expect(tokenVisibleNow(fogged, { x: 500, y: 0 })).toBe(false);
  });

  it('lightPosition follows a bound token, otherwise falls back to its own x/y', () => {
    const state = baseState({ tokens: [{ id: 'tok', x: 10, y: 20 }] });
    expect(lightPosition(state, { tokenId: 'tok' })).toEqual({ x: 10, y: 20 });
    expect(lightPosition(state, { x: 5, y: 6 })).toEqual({ x: 5, y: 6 });
  });

  it('lightRadiusPx and visionRadiusPx convert units to pixels via the scene grid', () => {
    const state = baseState();
    expect(lightRadiusPx(state, 0)).toBe(0);
    expect(visionRadiusPx(state, { visionDistanceUnits: null, vision: 42 })).toBe(42);
  });

  it('buildAttackMeasure returns null for self-target or an invisible target, otherwise a ready-to-confirm measure', () => {
    const state = baseState({
      scene: { ...baseState().scene, fogEnabled: false },
      tokens: [{ id: 'atk', x: 0, y: 0, characterId: 'char-a' }, { id: 'tgt', x: 64, y: 0, characterId: 'char-t' }],
    });
    const attacker = state.tokens[0], sameToken = state.tokens[0];
    expect(buildAttackMeasure(state, attacker, sameToken)).toBeNull();
    const result = buildAttackMeasure(state, attacker, state.tokens[1]);
    expect(result).toMatchObject({ attackReady: false, attackerTokenId: 'atk' });
  });
});
