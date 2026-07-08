import { asNumber } from '../domain/shared/num.ts';
import { normalizeSkills, normalizeStats } from '../domain/character/index.ts';
import { ipCost, ipEntry, ipRoleCost } from '../domain/economy/index.ts';
import type { IpLedgerEntry } from '../domain/economy/index.ts';

interface CharactersApi {
  upsert: (character: Record<string, unknown>) => unknown;
}

export interface BuyIpIncreaseApi {
  characters?: CharactersApi;
}

interface CharacterLike {
  ip?: unknown;
  roleAbilityRank?: unknown;
  base?: Record<string, unknown>;
  skills?: unknown;
  ipLog?: IpLedgerEntry[];
  [extra: string]: unknown;
}

export interface BuyIpIncreaseInput {
  character: CharacterLike;
  kind: 'role' | 'skill';
  skillIndex?: unknown;
  ipOneRankPerSession?: boolean;
  ipRankPurchasedThisSession?: boolean;
}

interface PurchasableSkill {
  id: string;
  name: string;
  stat: string;
  level: number;
  bonus: number;
  difficult: boolean;
}

export interface BuyIpIncreaseResult {
  ok: boolean;
  error?: string | null;
  characterPatch?: Record<string, unknown>;
  statePatch?: Record<string, unknown>;
  flashMessage?: string;
}

// Orchestrates an IP purchase (Role Ability rank or a skill level). Persists
// the updated character via the injected api client; the view is responsible
// for merging the returned characterPatch/statePatch into state and flashing
// flashMessage/error.
export default class BuyIpIncrease {
  api?: BuyIpIncreaseApi;
  rng: () => number;
  clock: () => Date;

  constructor({ api, rng = Math.random, clock = () => new Date() }: { api?: BuyIpIncreaseApi; rng?: () => number; clock?: () => Date } = {}) {
    this.api = api;
    this.rng = rng;
    this.clock = clock;
  }

  execute({ character, kind, skillIndex, ipOneRankPerSession, ipRankPurchasedThisSession }: BuyIpIncreaseInput): BuyIpIncreaseResult {
    const active = character || {};
    const activeIp = asNumber(active.ip, 0, 0, 999999);

    if (kind === 'role') {
      const currentRank = asNumber(active.roleAbilityRank, 4, 1, 10);
      if (currentRank >= 10) return { ok: false, error: 'ROLE ABILITY ja esta no limite' };
      if (ipOneRankPerSession && ipRankPurchasedThisSession) return { ok: false, error: 'Limite de 1 aumento de rank por sessao ativo' };
      const nextRank = currentRank + 1;
      const cost = ipRoleCost(nextRank);
      if (activeIp < cost) return { ok: false, error: 'IP insuficiente para Role Ability Rank ' + nextRank };
      const after = activeIp - cost;
      const log = [ipEntry('spend', 'Compra Role Ability Rank ' + nextRank, -cost, after, { rng: this.rng, clock: this.clock }), ...(active.ipLog || [])];
      const characterPatch = { roleAbilityRank: nextRank, ip: after, ipLog: log };
      if (this.api?.characters) this.api.characters.upsert({ ...active, ...characterPatch });
      return {
        ok: true,
        characterPatch,
        statePatch: { ipRankPurchasedThisSession: true },
        flashMessage: 'Role Ability Rank ' + nextRank + ' comprado',
      };
    }

    const base = normalizeStats(active.base);
    const skills: PurchasableSkill[] = normalizeSkills(active.skills, base).map(s => ({ id: s.id, name: s.name, stat: s.stat, level: s.level, bonus: s.bonus, difficult: !!s.difficult }));
    const idx = asNumber(skillIndex, 0, 0, skills.length - 1);
    const skill = skills[idx];
    if (!skill) return { ok: false, error: null };
    if (skill.level >= 10) return { ok: false, error: skill.name + ' ja esta no limite' };
    const nextLevel = skill.level + 1;
    const cost = ipCost(nextLevel, skill.difficult);
    if (activeIp < cost) return { ok: false, error: 'IP insuficiente para ' + skill.name + ' LV ' + nextLevel };
    const after = activeIp - cost;
    skills[idx] = { ...skill, level: nextLevel };
    const log = [ipEntry('spend', 'Compra ' + skill.name + ' LV ' + nextLevel + (skill.difficult ? ' (x2)' : ''), -cost, after, { rng: this.rng, clock: this.clock }), ...(active.ipLog || [])];
    const characterPatch = { skills, ip: after, ipLog: log };
    if (this.api?.characters) this.api.characters.upsert({ ...active, ...characterPatch });
    return {
      ok: true,
      characterPatch,
      flashMessage: skill.name + ' LV ' + nextLevel + ' comprado',
    };
  }
}
