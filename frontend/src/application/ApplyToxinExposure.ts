import { resolveToxinExposure, toxinCatalog } from '../domain/toxins/index.ts';
import type { ToxinDefinition, ToxinExposureResult } from '../domain/toxins/index.ts';
import { criticalInjuryEntry, statusEffectEntry } from '../domain/conditions/index.ts';
import { CPRED_STATUS_PRESETS } from '../domain/conditions/constants.ts';
import { CPRED_CRITICAL_INJURIES } from '../domain/character/constants.ts';

/**
 * Expose one or more targets to a toxin.
 *
 * Each target rolls its own Resist Torture/Drugs check, so one dose can wipe
 * half a room and leave the rest untouched. The HP loss is written straight
 * into `health.cur` and never touches `spDamage` — armor is not involved in
 * either direction, which is the rule that separates this from combat damage.
 */

interface ExposureCharacter {
  id?: unknown;
  name?: unknown;
  bodyType?: unknown;
  health?: { cur?: unknown; max?: unknown };
  statusEffects?: unknown[];
  criticalInjuries?: { injury?: string }[];
  skills?: { name?: unknown; total?: unknown; bonus?: unknown }[];
  installedCyberware?: { code?: unknown }[];
  [extra: string]: unknown;
}

export interface ApplyToxinExposureInput {
  /** Toxin id from the campaign catalog, or a full definition. */
  toxin: string | ToxinDefinition;
  customToxins?: unknown;
  targets: ExposureCharacter[];
  situationalModifier?: number;
  /** Pre-rolled d10 per target id, for a GM who rolled at the table. */
  dice?: Record<string, number>;
  /** Critical injury the source inflicts on failure (teargas: Damaged Eye). */
  inflictedInjury?: string | null;
  source?: string;
}

export interface ToxinExposureOutcome extends ToxinExposureResult {
  characterPatch: Record<string, unknown> | null;
}

export interface ApplyToxinExposureResult {
  toxin: ToxinDefinition | null;
  outcomes: ToxinExposureOutcome[];
  chatText: string;
  error?: string;
}

export interface ApplyToxinExposureApi {
  characters?: { upsert: (character: Record<string, unknown>) => unknown };
}

export default class ApplyToxinExposure {
  private rng: () => number;

  private clock: () => Date;

  constructor({ rng = Math.random, clock = () => new Date() }: { api?: ApplyToxinExposureApi; rng?: () => number; clock?: () => Date } = {}) {
    this.rng = rng;
    this.clock = clock;
  }

  execute(input: ApplyToxinExposureInput): ApplyToxinExposureResult {
    const toxin = typeof input.toxin === 'string'
      ? toxinCatalog(input.customToxins).find(row => row.id === input.toxin) || null
      : input.toxin || null;
    if (!toxin) return { toxin: null, outcomes: [], chatText: '', error: 'Toxina desconhecida' };

    const targets = (input.targets || []).filter(target => target && target.id);
    if (!targets.length) return { toxin, outcomes: [], chatText: '', error: 'Nenhum alvo selecionado' };

    const outcomes = targets.map(target => this.exposeOne(toxin, target, input));
    const header = `TOXINA :: ${toxin.name.toUpperCase()} :: ${toxin.kind === 'drug' ? 'DROGA' : 'VENENO'} :: `
      + `Resist Torture/Drugs DV${toxin.resistDV}`;
    return {
      toxin,
      outcomes,
      chatText: [header, ...outcomes.map(outcome => outcome.summary_pt)].join('\n'),
    };
  }

  private exposeOne(
    toxin: ToxinDefinition,
    target: ExposureCharacter,
    input: ApplyToxinExposureInput,
  ): ToxinExposureOutcome {
    const targetId = String(target.id || '');
    const provided = input.dice ? input.dice[targetId] : undefined;
    const result = resolveToxinExposure({
      toxin,
      target: target as never,
      ...(Number.isFinite(Number(provided)) ? { die: Number(provided) } : {}),
      situationalModifier: input.situationalModifier,
      inflictedInjury: input.inflictedInjury ?? null,
    }, this.rng);

    if (result.immune || result.success) return { ...result, characterPatch: null };

    const patch: Record<string, unknown> = {};
    if (result.hpDamage > 0) {
      const current = Number(target.health?.cur);
      const safeCurrent = Number.isFinite(current) ? current : 0;
      patch.health = { ...(target.health || {}), cur: Math.max(0, safeCurrent - result.hpDamage) };
    }

    const statuses = this.statusesFor(toxin, result, input.source);
    if (statuses.length) {
      patch.statusEffects = [...(Array.isArray(target.statusEffects) ? target.statusEffects : []), ...statuses];
    }

    const injury = this.injuryFor(result, target, input.source);
    if (injury) {
      patch.criticalInjuries = [...(Array.isArray(target.criticalInjuries) ? target.criticalInjuries : []), injury];
    }

    return { ...result, characterPatch: Object.keys(patch).length ? patch : null };
  }

  /**
   * A failed poison check always leaves the "Envenenado" badge so the table
   * can see who is still carrying it; drugs add their own described state.
   */
  private statusesFor(toxin: ToxinDefinition, result: ToxinExposureResult, source?: string) {
    const ids = [result.statusPresetId, toxin.kind === 'poison' ? 'toxin_poisoned' : null]
      .filter((id): id is string => !!id);
    const seen = new Set<string>();
    return ids
      .filter(id => !seen.has(id) && seen.add(id))
      .map(id => CPRED_STATUS_PRESETS.find(preset => preset.id === id))
      .filter((preset): preset is NonNullable<typeof preset> => !!preset)
      .map(preset => statusEffectEntry(preset, {
        source: source || `toxina:${toxin.id}`,
        rng: this.rng,
        clock: this.clock,
      }));
  }

  private injuryFor(result: ToxinExposureResult, target: ExposureCharacter, source?: string) {
    const injuryId = result.inflictedInjury;
    const catalog = injuryId ? CPRED_CRITICAL_INJURIES[injuryId] : null;
    if (!injuryId || !catalog) return null;
    const already = (target.criticalInjuries || []).some(entry => entry && entry.injury === injuryId);
    if (already) return null;
    return criticalInjuryEntry(catalog, {
      location: 'head',
      source: source || 'toxina',
      rng: this.rng,
      clock: this.clock,
    });
  }
}
