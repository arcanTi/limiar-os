// ARQUITETURA 4B: pure state selectors extracted from campaign-map.js — no
// canvas/ctx, no `ui`/DOM writes, just reads of the page's `state` object
// (plus the query args) and domain helpers. Every function takes `state`
// explicitly as its first argument instead of closing over a page-global, so
// it can be called and tested without a document.
import { sessionUsername } from '../domain/campaigns/index.ts';
import { GRID_METERS_PER_CELL } from '../domain/movement/index.ts';
import { cprOnMeasureBetweenTokens } from '../domain/map/systemAdapter.ts';
import { measureTokenDistance } from '../domain/map/measurementEngine.ts';
import { propsToWalls, visionContainsPoint } from '../domain/map/visionEngine.ts';

export function sceneSize(state) {
  return {
    w: Number((state.scene && state.scene.width) || 1600),
    h: Number((state.scene && state.scene.height) || 1000),
    g: Number((state.scene && state.scene.gridSize) || 64),
  };
}

export function tokenRadius(state, t) {
  return Math.max(14, sceneSize(state).g * 0.36 * Number(t.size || 1));
}

export function visionRadiusPx(state, t) {
  const units = t && t.visionDistanceUnits;
  if (units != null) return Math.max(0, Number(units) || 0) / GRID_METERS_PER_CELL * sceneSize(state).g;
  return Math.max(0, Number(t && t.vision) || 0);
}

export function lightRadiusPx(state, units) {
  return Math.max(0, Number(units) || 0) / GRID_METERS_PER_CELL * sceneSize(state).g;
}

export function lightPosition(state, light) {
  const token = light.tokenId && state.tokens.find(t => t.id === light.tokenId);
  return token ? { x: token.x, y: token.y } : { x: Number(light.x) || 0, y: Number(light.y) || 0 };
}

// canMove/canEditTemplate share the same GM-or-owner rule; kept as two names
// because that's what the render/list/input call sites already say.
export function canMove(state, t) {
  return state.canEdit || t.ownerUsername === sessionUsername(state.session);
}
export const canEditTemplate = canMove;

export function tokenAt(state, p) {
  for (let i = state.tokens.length - 1; i >= 0; i--) {
    const t = state.tokens[i];
    if (t.visible === false && !state.canEdit) continue;
    if (Math.hypot(t.x - p.x, t.y - p.y) <= Math.max(tokenRadius(state, t), 18 / state.camera.zoom)) return t;
  }
  return null;
}

export function templateAt(state, p) {
  for (let i = state.templates.length - 1; i >= 0; i--) {
    const t = state.templates[i];
    if (Math.hypot(t.x - p.x, t.y - p.y) <= 14 / state.camera.zoom) return t;
  }
  return null;
}

export function propAt(state, p) {
  for (let i = state.props.length - 1; i >= 0; i--) {
    const prop = state.props[i];
    if (p.x >= prop.x && p.x <= prop.x + prop.w && p.y >= prop.y && p.y <= prop.y + prop.h) return prop;
  }
  return null;
}

export function wallAt(state, p) {
  return state.walls.find(w => {
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len = Math.hypot(dx, dy) || 1;
    const t = Math.max(0, Math.min(1, ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / (len * len)));
    return Math.hypot(p.x - (w.x1 + t * dx), p.y - (w.y1 + t * dy)) <= 10 / state.camera.zoom;
  });
}

export function losWalls(state) {
  return state.walls.concat(propsToWalls(state.props || []));
}

// F2c: `individual` exploration mode means visibleNow isn't pooled across the
// party — a non-GM viewer only gets live-vision clearing from tokens they
// own. `shared` (CPR default) keeps pooling every player token, unchanged.
export function liveVisionTokens(state) {
  const pool = state.tokens.filter(t => t.visible !== false && visionRadiusPx(state, t) > 0 && (state.canEdit || t.kind === 'player'));
  if (state.canEdit || !(state.scene && state.scene.explorationMode === 'individual')) return pool;
  const me = sessionUsername(state.session);
  return pool.filter(t => t.ownerUsername === me);
}

export function tokenVisibleNow(state, t) {
  if (!t || t.visible === false) return !!state.canEdit;
  if (!state.scene || !state.scene.fogEnabled) return true;
  const walls = losWalls(state), viewers = liveVisionTokens(state);
  if (viewers.some(v => visionContainsPoint(v, visionRadiusPx(state, v), walls, t))) return true;
  return state.lights.filter(l => l.enabled).some(l => {
    const p = lightPosition(state, l), radius = lightRadiusPx(state, l.dimUnits);
    return viewers.some(v => visionContainsPoint(v, visionRadiusPx(state, v), walls, p)) && visionContainsPoint(p, radius, walls, t);
  });
}

// Shared by the R-tool drag (release over a token) and the context-menu
// "Medir e usar no ataque" shortcut (CM1) — same validated path either way,
// the menu just skips having to drag precisely.
export function buildAttackMeasure(state, attacker, target) {
  if (!attacker || !target || target.id === attacker.id || !tokenVisibleNow(state, target)) return null;
  const distance = measureTokenDistance(attacker, target, sceneSize(state).g);
  if (!distance) return null;
  const attack = cprOnMeasureBetweenTokens({ attackerToken: attacker, targetToken: target, cells: distance.cells, rangeMeters: distance.rangeMeters });
  if (!attack) return null;
  return { from: { x: attacker.x, y: attacker.y }, to: { x: target.x, y: target.y }, attack, attackReady: false, attackerTokenId: attacker.id };
}
