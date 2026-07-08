import BuyIpIncrease from './BuyIpIncrease.ts';
import type { BuyIpIncreaseApi } from './BuyIpIncrease.ts';
import InstallCyberware from './InstallCyberware.ts';
import type { InstallCyberwareApi } from './InstallCyberware.ts';
import ToggleCyberwareEnhancement from './ToggleCyberwareEnhancement.ts';
import type { ToggleCyberwareEnhancementApi } from './ToggleCyberwareEnhancement.ts';
import RollCombatAttack from './RollCombatAttack.ts';
import type { RollCombatAttackApi } from './RollCombatAttack.ts';
import ApplyCombatDamage from './ApplyCombatDamage.ts';
import type { ApplyCombatDamageApi } from './ApplyCombatDamage.ts';
import EndTurn from './EndTurn.ts';
import type { EndTurnApi } from './EndTurn.ts';
import ResolveTarotDraw from './ResolveTarotDraw.ts';
import type { ResolveTarotDrawApi } from './ResolveTarotDraw.ts';

export type ApplicationApi =
  & BuyIpIncreaseApi
  & InstallCyberwareApi
  & ToggleCyberwareEnhancementApi
  & RollCombatAttackApi
  & ApplyCombatDamageApi
  & EndTurnApi
  & ResolveTarotDrawApi;

export interface Application {
  buyIpIncrease: BuyIpIncrease;
  installCyberware: InstallCyberware;
  toggleCyberwareEnhancement: ToggleCyberwareEnhancement;
  rollCombatAttack: RollCombatAttack;
  applyCombatDamage: ApplyCombatDamage;
  endTurn: EndTurn;
  resolveTarotDraw: ResolveTarotDraw;
}

// Factory for the application layer's use-case registry. rng/clock are
// injected here so every use case gets deterministic ids/timestamps in tests
// without touching Math.random()/Date.now() directly.
export function createApplication({ api, rng = Math.random, clock = () => new Date() }: { api?: ApplicationApi; rng?: () => number; clock?: () => Date } = {}): Application {
  return {
    buyIpIncrease: new BuyIpIncrease({ api, rng, clock }),
    installCyberware: new InstallCyberware({ api }),
    toggleCyberwareEnhancement: new ToggleCyberwareEnhancement({ api }),
    rollCombatAttack: new RollCombatAttack({ api, rng, clock }),
    applyCombatDamage: new ApplyCombatDamage({ api, rng, clock }),
    endTurn: new EndTurn({ api, clock }),
    resolveTarotDraw: new ResolveTarotDraw({ api, rng, clock }),
  };
}
