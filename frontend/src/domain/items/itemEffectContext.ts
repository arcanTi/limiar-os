import type { InstalledCyberwareInstance } from './installedCyberwareTypes.ts';
import type { CanonicalRules } from './canonicalRulesTypes.ts';

export interface EffectResolutionContextInput {
  context?: Partial<EffectResolutionContext>;
  character?: unknown;
  instances?: InstalledCyberwareInstance[];
  catalog?: unknown[];
  canonicalRules?: CanonicalRules;
  situation?: Record<string, unknown>;
  selectedSkill?: string | null;
  selectedMode?: string | null;
  attackContext?: Record<string, unknown>;
  movementContext?: Record<string, unknown>;
  senseContext?: Record<string, unknown>;
  targetContext?: Record<string, unknown>;
}

export interface EffectResolutionContext {
  character: unknown;
  instances: InstalledCyberwareInstance[];
  catalog: unknown[];
  canonicalRules: CanonicalRules;
  situation: Record<string, unknown>;
  selectedSkill: string | null;
  selectedMode: string | null;
  attackContext: Record<string, unknown>;
  movementContext: Record<string, unknown>;
  senseContext: Record<string, unknown>;
  targetContext: Record<string, unknown>;
}

export function createEffectResolutionContext(options: EffectResolutionContextInput = {}): EffectResolutionContext {
  const context = options.context || options;
  return {
    character: context.character || options.character || null,
    instances: context.instances || options.instances || [],
    catalog: context.catalog || options.catalog || [],
    canonicalRules: context.canonicalRules || options.canonicalRules || {},
    situation: context.situation || {},
    selectedSkill: context.selectedSkill || null,
    selectedMode: context.selectedMode || null,
    attackContext: context.attackContext || {},
    movementContext: context.movementContext || {},
    senseContext: context.senseContext || {},
    targetContext: context.targetContext || {},
  };
}

export function situationFlag(context: { situation?: Record<string, unknown> } | null | undefined, key: string): boolean {
  return !!(context && context.situation && context.situation[key]);
}

export function numericSituation(context: { situation?: Record<string, unknown> } | null | undefined, key: string): number | null {
  const value = context && context.situation && context.situation[key];
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
