import { resolveAreaAttack } from '../domain/combat/combatResolver.ts';
import type { InstalledCyberwareInstance } from '../domain/items/installedCyberwareTypes.ts';
import type { ActiveInjuryRef } from '../domain/combat/combatTypes.ts';

export interface AreaAttackTarget {
  id: string;
  name?: string;
  health?: { cur?: number; max?: number };
  spDamage?: Record<string, number>;
  armor?: { head?: { sp: number }; body?: { sp: number } };
  installedCyberware?: InstalledCyberwareInstance[];
  criticalInjuries?: ActiveInjuryRef[];
}

interface CharactersApi {
  upsert: (character: Record<string, unknown>) => Promise<unknown>;
}
interface CampaignMapsApi {
  resolveTemplate: (campaignId: string, payload: Record<string, unknown>) => Promise<unknown>;
}

export interface ApplyAreaAttackApi {
  characters?: CharactersApi;
  campaignMaps?: CampaignMapsApi;
}

export interface ApplyAreaAttackInput {
  targets: AreaAttackTarget[];
  diceCount: number;
  diceSides: number;
  campaignId: string;
  templateId: string;
  expectedRevision: number;
  damageApplied?: boolean;
  api?: ApplyAreaAttackApi;
  rng?: () => number;
}

export interface AreaAttackOutcome {
  id: string;
  name?: string;
  hpLoss: number;
  ablatedDelta: number;
  criticalTriggered: boolean;
  patch: { health: { cur: number; max?: number }; spDamage: Record<string, number> };
}

export interface ApplyAreaAttackResult {
  status: 'resolved' | 'partial' | 'resolveFailed';
  damageRoll?: { rolls: number[]; total: number };
  succeeded: AreaAttackOutcome[];
  failed: { id: string; name?: string }[];
  error?: string;
}

// Area-attack application contract. Persistence is awaited per target
// (Promise.allSettled), so a
// failed applyCharacterPatch never gets silently dropped, and the template is
// only marked resolved once every included target's patch has landed. A
// caller retrying with damageApplied:true skips straight to the resolve call
// (damage already landed, never re-rolled/double-applied).
export default class ApplyAreaAttack {
  api?: ApplyAreaAttackApi;
  rng: () => number;

  constructor({ api, rng = Math.random }: { api?: ApplyAreaAttackApi; rng?: () => number } = {}) {
    this.api = api;
    this.rng = rng;
  }

  private async resolveTemplate(input: ApplyAreaAttackInput): Promise<ApplyAreaAttackResult> {
    try {
      if (this.api && this.api.campaignMaps) {
        await this.api.campaignMaps.resolveTemplate(input.campaignId, {
          templateId: input.templateId,
          expectedRevision: input.expectedRevision,
        });
      }
      return { status: 'resolved', succeeded: [], failed: [] };
    } catch (err) {
      return { status: 'resolveFailed', succeeded: [], failed: [], error: (err as Error).message };
    }
  }

  async execute(input: ApplyAreaAttackInput): Promise<ApplyAreaAttackResult> {
    if (input.damageApplied) return this.resolveTemplate(input);

    const roll = input.rng || this.rng;
    const count = input.diceCount;
    const sides = input.diceSides;
    const faces = Array.from({ length: count }, () => 1 + Math.floor(roll() * sides));
    const damageRoll = { rolls: faces, total: faces.reduce((sum, face) => sum + face, 0) };

    const contexts = input.targets.map(target => ({
      weapon: { code: 'AOE', damage: `${count}d${sides}` },
      target,
      attackRoll: { total: 999 },
      targetDV: 0,
      damageRoll,
    }));
    const results = resolveAreaAttack(contexts, roll);
    const patches = results.map((result, idx) => {
      const target = input.targets[idx];
      const hpLoss = Math.max(0, Number(result.hpDamage) || 0);
      const ablatedDelta = result.armorAblated
        ? Math.max(0, (Number(result.armorSPBefore) || 0) - (Number(result.armorSPAfter) || 0))
        : 0;
      const nextHealth = { ...target.health, cur: Math.max(0, ((target.health && target.health.cur) || 0) - hpLoss) };
      const nextSpDamage = { ...(target.spDamage || {}), body: Math.max(0, ((target.spDamage && target.spDamage.body) || 0) + ablatedDelta) };
      return { target, hpLoss, ablatedDelta, criticalTriggered: !!result.criticalTriggered, patch: { health: nextHealth, spDamage: nextSpDamage } };
    });

    const upsert = this.api && this.api.characters ? this.api.characters.upsert : null;
    const outcomes = upsert
      ? await Promise.allSettled(patches.map(p => upsert({ ...p.target, ...p.patch })))
      : patches.map(() => ({ status: 'fulfilled' as const }));
    const succeeded = patches
      .filter((_, i) => outcomes[i].status === 'fulfilled')
      .map(({ target, hpLoss, ablatedDelta, criticalTriggered, patch }) => ({ id: target.id, name: target.name, hpLoss, ablatedDelta, criticalTriggered, patch }));
    const failed = patches
      .filter((_, i) => outcomes[i].status === 'rejected')
      .map(({ target }) => ({ id: target.id, name: target.name }));

    if (failed.length) return { status: 'partial', damageRoll, succeeded, failed };

    const resolved = await this.resolveTemplate(input);
    if (resolved.status === 'resolved') return { status: 'resolved', damageRoll, succeeded, failed: [] };
    return { status: 'resolveFailed', damageRoll, succeeded, failed: [], error: resolved.error };
  }
}
