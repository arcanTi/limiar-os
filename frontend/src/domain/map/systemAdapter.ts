// Tactical-map system adapter (PLANO-MAPA-FOUNDRY.md section 4): the map page
// never imports combat/character rules directly, it only calls hooks like
// this one. CPR is the first (and, for now, only) adapter — a future system
// (D&D, zombies...) gets its own module with the same shape, selected by
// `campaigns.system`, never new branches inside the map page itself.
//
// F2b is the first phase to use this seam (tokenBadges). Later phases
// (moveRange, measurementPolicy, onMeasureBetweenTokens) add hooks here when
// they land, not before.

import { normalizeCriticalInjuries, normalizeStatusEffects } from '../conditions/index.ts';
import { resolveStabilizationDV } from '../combat/stabilizationEngine.ts';
import type { WoundState } from '../combat/stabilizationEngine.ts';

export interface TokenBadge {
  kind: 'injury' | 'status';
  id: string;
  label: string;
  detail?: string;
}

export interface TokenAmmo {
  weaponId?: string;
  weaponName?: string;
  currentAmmo?: number | null;
  magazine?: number | null;
}

export interface TokenVitals {
  hp?: number | null;
  hpMax?: number | null;
  criticalInjuries?: unknown;
  statusEffects?: unknown;
  ammo?: TokenAmmo | null;
}

export interface AmmoBadge {
  weaponId: string;
  label: string;
  needsReload: boolean;
}

export interface WoundVisual {
  state: WoundState;
  color: string;
}

export interface MapAttackMeasurement {
  attackerToken: { id?: string; characterId?: string | null };
  targetToken: { id?: string; characterId?: string | null; name?: string };
  cells: number;
  rangeMeters: number;
}

export interface MapAttackCommand {
  kind: 'attack';
  attackerTokenId: string;
  attackerCharacterId: string;
  targetTokenId: string;
  targetCharacterId: string;
  targetName: string;
  cells: number;
  rangeMeters: number;
}

export interface MapAoeResolveContext {
  template: { kind?: string; label?: string };
  tokens: { id?: string; characterId?: string | null }[];
}

export interface MapAoeCommand {
  kind: 'aoe';
  targetCharacterIds: string[];
  areaKind: string;
  areaLabel: string;
}

// The map knows no combat implementation. CPR merely opts into the generic
// handoff when both tokens represent characters.
export function cprOnMeasureBetweenTokens(ctx: MapAttackMeasurement): MapAttackCommand | null {
  const attackerTokenId = String(ctx.attackerToken?.id || '');
  const attackerCharacterId = String(ctx.attackerToken?.characterId || '');
  const targetTokenId = String(ctx.targetToken?.id || '');
  const targetCharacterId = String(ctx.targetToken?.characterId || '');
  if (!attackerTokenId || !attackerCharacterId || !targetTokenId || !targetCharacterId || !(Number(ctx.cells) >= 0) || !(Number(ctx.rangeMeters) >= 0)) return null;
  return { kind: 'attack', attackerTokenId, attackerCharacterId, targetTokenId, targetCharacterId, targetName: String(ctx.targetToken.name || targetCharacterId), cells: Number(ctx.cells), rangeMeters: Number(ctx.rangeMeters) };
}

// Fase AREA: RESOLVER on a map template hands the map's already-filtered
// token list (inside templateCells() AND inside the acting user's visible
// audience — the map page does both checks before calling this, the adapter
// never re-derives geometry/visibility) to the system as a generic
// "who's in the blast" list. CPR just extracts distinct character ids; a
// system with no area rule at all returns null here and the map page shows
// no RESOLVER action for its templates.
export function cprOnResolveTemplate(ctx: MapAoeResolveContext): MapAoeCommand | null {
  const targetCharacterIds = Array.from(new Set((ctx.tokens || []).map(token => String(token.characterId || '')).filter(Boolean)));
  if (!targetCharacterIds.length) return null;
  return { kind: 'aoe', targetCharacterIds, areaKind: String(ctx.template?.kind || ''), areaLabel: String(ctx.template?.label || '') };
}

const WOUND_RING_COLOR: Record<WoundState, string> = {
  healthy: '#3fe0d0',
  lightlyWounded: '#d6aa4e',
  seriouslyWounded: '#e0873f',
  mortallyWounded: '#c0635b',
};

// Wound-state ring color for the HP ring (CPR RAW thresholds via
// resolveStabilizationDV — hpMax/2 rounded up is "seriously wounded", same
// rule the stabilization DV table already uses). Returns null when the token
// has no HP tracked (no ring to color).
export function cprWoundVisual(token: TokenVitals): WoundVisual | null {
  if (token.hp == null || token.hpMax == null || !token.hpMax) return null;
  const hpMax = Number(token.hpMax);
  const result = resolveStabilizationDV({
    healthCur: Number(token.hp),
    hpMax,
    seriouslyWounded: Math.ceil(hpMax / 2),
  });
  return { state: result.state, color: WOUND_RING_COLOR[result.state] };
}

// Badges for the token's lower arc: untreated critical injuries + active
// status effects. Server already suppressed these fields entirely for an
// out-of-audience viewer (F2a/F2b backend contract) — this function just
// interprets whatever arrived.
export function cprTokenBadges(token: TokenVitals): TokenBadge[] {
  const badges: TokenBadge[] = [];
  for (const injury of normalizeCriticalInjuries(token.criticalInjuries)) {
    if (injury.treated) continue;
    badges.push({ kind: 'injury', id: injury.instanceId, label: injury.name_pt, detail: injury.location });
  }
  for (const status of normalizeStatusEffects(token.statusEffects)) {
    badges.push({ kind: 'status', id: status.instanceId, label: status.label_pt });
  }
  return badges;
}

// Fase MUNICAO-NO-MAPA (G4): the token HUD ammo badge. The numbers already
// arrive resolved from map_state (backend cross-references the linked
// character's primary ammo-tracked weapon, same denormalization pattern as
// hp/criticalInjuries above) — this only formats them and derives the
// advisory needsReload flag, it doesn't pick the weapon or spend ammo.
export function cprAmmoBadge(token: TokenVitals): AmmoBadge | null {
  const ammo = token.ammo;
  if (!ammo || !ammo.weaponId || ammo.magazine == null) return null;
  const current = Number(ammo.currentAmmo ?? ammo.magazine);
  const magazine = Number(ammo.magazine);
  return { weaponId: ammo.weaponId, label: `${current}/${magazine}`, needsReload: current <= 0 };
}
