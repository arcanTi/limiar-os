import { combatAttackMod } from '../domain/combat/index.ts';
import type { CombatModOptions } from '../domain/combat/index.ts';
import { cyberSourceBreakdown, rollFaces } from '../domain/dice/index.ts';

interface ChatApi {
  post: (message: Record<string, unknown>) => unknown;
}

export interface RollCombatAttackApi {
  chat?: ChatApi;
}

interface ActorLike {
  name?: string;
}

interface WeaponLike {
  name?: string;
  skill?: string;
  attackMod?: number;
  quality?: string;
}

export interface RollCombatAttackInput {
  actor?: ActorLike;
  weapon?: WeaponLike;
  combatOptions?: CombatModOptions;
  ctx?: { mod?: number; sources?: string[] };
  targetLabelSuffix?: string;
  session?: { gm?: boolean };
  rng?: () => number;
}

export interface RollCombatAttackResult {
  label: string;
  detail: string;
  total: number;
  faces: number[];
  mod: number;
  crit: boolean;
  fumble: boolean;
  outcome: 'critical' | 'fumble' | '';
}

// Headless equivalent of the live, animated attack roll (Component.roll()):
// same math (attack mod, 1d10 check, crit-on-10/fumble-on-1 extra d10), but
// deterministic end-to-end via the injected rng, and it persists the result
// itself instead of waiting on Component's dice animation to settle.
export default class RollCombatAttack {
  api?: RollCombatAttackApi;
  rng: () => number;
  clock: () => Date;

  constructor({ api, rng = Math.random, clock = () => new Date() }: { api?: RollCombatAttackApi; rng?: () => number; clock?: () => Date } = {}) {
    this.api = api;
    this.rng = rng;
    this.clock = clock;
  }

  execute({ actor, weapon, combatOptions = {}, ctx = { mod: 0, sources: [] }, targetLabelSuffix = '', session = {}, rng }: RollCombatAttackInput): RollCombatAttackResult {
    const roll = rng || this.rng;
    const modResult = combatAttackMod(actor, weapon, combatOptions);
    const mod = modResult.mod + (Number(ctx.mod) || 0);
    const breakdown = cyberSourceBreakdown(modResult.sources.concat(ctx.sources || []));
    const label = (((actor && actor.name) || 'OPERATIVO') + ' :: ' + ((weapon && weapon.name) || 'ARMA') + ' ATAQUE').toUpperCase() + targetLabelSuffix;

    const { faces, total: rolledTotal, detail: rolledDetail } = rollFaces({ sides: 10, count: 1, mod }, roll);
    const crit = faces[0] === 10;
    const fumble = faces[0] === 1;
    let total = rolledTotal;
    let detail = rolledDetail;
    if (crit) {
      const extra = 1 + Math.floor(roll() * 10);
      total += extra;
      detail += ' + ' + extra;
    } else if (fumble) {
      const extra = 1 + Math.floor(roll() * 10);
      total -= extra;
      detail += ' - ' + extra;
    }
    if (breakdown.length) detail += ' // ' + breakdown.join(' // ');
    const outcome = crit ? 'critical' : fumble ? 'fumble' : '';

    const result: RollCombatAttackResult = { label, detail, total, faces, mod, crit, fumble, outcome };
    if (this.api && this.api.chat) {
      this.api.chat.post({
        sender: (actor && actor.name) || 'OPERATIVO',
        role: session.gm ? 'gm' : 'player',
        at: this.clock().toISOString(),
        kind: 'roll',
        text: '',
        roll: { label: result.label, detail: result.detail, total: result.total, outcome: result.outcome },
      });
    }
    return result;
  }
}
