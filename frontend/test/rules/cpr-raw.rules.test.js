import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CPRED_ARMOR_PENALTY_STATS,
  CPRED_STAT_BUDGET,
  CPRED_STAT_MIN,
} from '../../src/domain/character/constants.ts';
import {
  applyHumanityRecovery,
  armorPenalty,
  cpredStatMax,
  moraleBoostRecovery,
  normalizeSkills,
  normalizeStats,
  skillSpend,
} from '../../src/domain/character/index.ts';
import {
  combatAttackMod,
  resolveFacedownContest,
  sortCombatOrder,
} from '../../src/domain/combat/index.ts';
import {
  resolveAttackCheck,
} from '../../src/domain/combat/combatAttackEngine.ts';
import {
  resolveArmorForLocation,
} from '../../src/domain/combat/combatArmorEngine.ts';
import {
  resolveStabilizationDV,
} from '../../src/domain/combat/stabilizationEngine.ts';
import {
  BREACH_TIERS,
  BLACK_ICE_BY_TIER,
  BLACK_ICE_PROGRAMS,
  CPRED_NETRUNNING_ABILITIES,
  NETRUNNING_PROGRAMS,
  blackIceById,
  buildBreachConfig,
  damageProgramRez,
  deckProgramSummary,
  normalizeInstalledPrograms,
  resolveBlackIceDamage,
  resolveNetrunnerIceAttack,
  resolveOpposedNetAttack,
  programRunModifiers,
  repairProgramRez,
  selectBlackIceForTier,
  netActionsPerTurn,
} from '../../src/domain/netrunning/index.ts';
import {
  resolveAutofireDamage,
} from '../../src/domain/combat/combatAutofireEngine.ts';
import {
  calculateBaseDeathSavePenalty,
  detectCriticalInjuryFromDamageRoll,
  getCriticalInjuryByRoll,
  resolveCriticalInjuryEffects,
} from '../../src/domain/combat/combatCriticalEngine.ts';
import {
  resolveEmpProtection,
  resolveItemEffects,
  getEffectiveStat,
} from '../../src/domain/items/itemEffectEngine.ts';
import {
  advanceConditionTime,
  aggregateConditions,
  CPRED_STATUS_PRESETS,
  durationToRounds,
  normalizeConditionDuration,
  removeStatusEffect,
  statusChargeKey,
  statusEffectEntry,
  useStatusCharge,
} from '../../src/domain/conditions/index.ts';
import {
  cyberwareHumanityLoss,
  cyberwareStatModBonus,
} from '../../src/domain/cyberware/index.ts';
import {
  deriveEffectiveEmp,
  deriveStats,
  effectiveMoveStat,
} from '../../src/domain/character/derivedStatsEngine.ts';
import {
  cellsToMeters,
  GRID_METERS_PER_CELL,
  moveRangeMeters,
  pathMovementCost,
} from '../../src/domain/movement/index.ts';
import {
  normalizeRollContributions,
  parseDiceText,
  rollBreakdownDetail,
  rollDetail,
  rollDiceMeta,
  rollNotation,
} from '../../src/domain/dice/index.ts';
import { ipCost, ipRoleCost } from '../../src/domain/economy/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const canonicalRules = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/canonical/cpr-canonical-rules.json'), 'utf8'));
const seed = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/seed/limiar-seed.json'), 'utf8'));
const catalog = seed.items || [];

function item(code) {
  const found = catalog.find(row => String(row.code || '').toUpperCase() === code);
  if (!found) throw new Error(`Missing catalog item ${code}`);
  return found;
}

function instance(code, options = {}) {
  return { code, instanceId: options.instanceId || code.toLowerCase(), ...options };
}

function resolvedEffects(instances, base = { BODY: 8 }) {
  return resolveItemEffects({
    character: { id: 'rules', base },
    instances,
    catalog,
    canonicalRules,
    context: { instances, canonicalRules },
  });
}

function derivedStatsFixture() {
  return {
    base: { INT: 5, REF: 6, DEX: 5, TECH: 4, COOL: 5, WILL: 7, LUCK: 5, MOVE: 5, BODY: 8, EMP: 3 },
    humanityLoss: 20,
    armor: {
      head: { name: 'Kevlar', sp: 7, penalty: 1 },
      body: { name: 'Light Armorjack', sp: 11, penalty: 2 },
    },
    equipped: [
      {
        code: 'MUSCLE-LACE',
        name: 'Muscle Lace',
        statMod: { BODY: 2, REF: 1 },
        hcost: 14,
        bonus: [{ type: 'healingRate', multiplier: 2, desc: 'Rapid Recovery' }],
      },
    ],
    criticalInjuries: [{ injury: 'crit_head_3', treated: false, stackPenalty: true, source: 'crit' }],
    statusEffects: [{ modifiers: { actionBonus: 1, evasionMod: -2, spAblation: { head: 1, body: 2 } } }],
    spDamage: { head: 2, body: 3 },
    health: { cur: 20 },
  };
}

describe('CPR RAW economy rules', () => {
  it('Given a skill next level, When buying it, Then IP cost is nextLevel times 10', () => {
    const nextLevel = 5;
    expect(ipCost(nextLevel, false)).toBe(nextLevel * 10);
  });

  it('Given a difficult skill next level, When buying it, Then IP cost is doubled', () => {
    // Regressão: difficult skills must cost double, not the normal skill price.
    const nextLevel = 5;
    expect(ipCost(nextLevel, true)).toBe(nextLevel * 10 * 2);
  });

  it('Given a role ability next rank, When buying it, Then IP cost is nextRank times 30', () => {
    const nextRank = 4;
    expect(ipRoleCost(nextRank)).toBe(nextRank * 30);
  });

  it('Given invalid economy levels, When buying advances, Then costs clamp to zero', () => {
    expect(ipCost(-1, true)).toBe(0);
    expect(ipRoleCost(null)).toBe(0);
  });
});

describe('CPR RAW character rules', () => {
  it('Given creation stats, When totaling them, Then the budget is read from the character constants', () => {
    // Regressão: creation budget must be checked against the CPRED budget.
    const creationStats = { INT: 6, REF: 6, DEX: 6, TECH: 6, COOL: 6, WILL: 6, LUCK: 6, MOVE: 6, BODY: 7, EMP: 7 };
    const total = Object.values(creationStats).reduce((sum, value) => sum + value, 0);
    expect(CPRED_STAT_BUDGET).toBe(62);
    expect(total).toBe(CPRED_STAT_BUDGET);
  });

  it('Given creation stat limits, When asking caps, Then normal stats cap at 8 and LUCK caps at 10', () => {
    expect(CPRED_STAT_MIN).toBe(2);
    expect(cpredStatMax('BODY')).toBe(8);
    expect(cpredStatMax('LUCK')).toBe(10);
  });

  it('Given unsafe stat input, When normalizing stats, Then runtime values are defensively clamped', () => {
    expect(normalizeStats({ BODY: 99, EMP: -4 })).toMatchObject({ BODY: 20, EMP: 0 });
  });

  it('Given armor penalties, When reading affected stats, Then REF DEX and MOVE are the penalty stats', () => {
    expect(CPRED_ARMOR_PENALTY_STATS).toEqual(['REF', 'DEX', 'MOVE']);
    expect(armorPenalty({ armor: { head: { penalty: 1 }, body: { penalty: 3 } } })).toBe(3);
  });

  it('Given stats and skills, When normalizing skills, Then totals include stat level and bonus', () => {
    const stats = normalizeStats({ REF: 8, DEX: 7, INT: 6 });
    const skills = normalizeSkills([
      { name: 'Handgun', level: 6, bonus: 1 },
      { name: 'Autofire', level: 4, difficult: true },
    ], stats);

    expect(skills.find(skill => skill.name === 'Handgun')).toMatchObject({ total: 15 });
    expect(skills.find(skill => skill.name === 'Autofire')).toMatchObject({ total: 12, difficult: true });
    expect(skillSpend(skills)).toBeGreaterThan(0);
  });

  it('Given a realistic character, When deriving stats in the domain engine, Then current RAW calculations are preserved', () => {
    const character = derivedStatsFixture();

    expect(deriveStats({ stats: character.base, character, installedCyberware: character.equipped })).toEqual({
      hpMax: 55,
      seriouslyWounded: 28,
      deathSave: 9,
      deathSaveModifier: -1,
      humanityMax: 30,
      humanityCurrent: -4,
      cyberpsychosisActive: false,
      cyberpsychosisExtreme: true,
      effectiveEmp: 0,
      armorPenalty: 2,
      headSp: 7,
      bodySp: 11,
      currentHeadSp: 4,
      currentBodySp: 6,
      shieldArmOccupied: false,
      shieldHandUnavailable: false,
      actionPenalty: 3,
      conditionActionPenalty: 1,
      woundActionPenalty: 2,
      movePenalty: 0,
      statPenalties: {},
      evasionMod: -2,
      spAblation: { head: 3, body: 5 },
      ignoreSeriouslyWounded: false,
      ignoreWoundState: false,
      skipDeathSave: false,
      bypassArmorInjuries: 1,
      naturalHealingPerRest: 24,
      naturalHealingBase: 12,
      naturalHealingMultiplier: 2,
      naturalHealingSources: ['x2 Muscle Lace'],
      effectiveStats: {
        INT: 5,
        REF: 5,
        DEX: 3,
        TECH: 4,
        COOL: 5,
        WILL: 7,
        LUCK: 5,
        MOVE: 3,
        BODY: 10,
        EMP: 3,
      },
    });
  });

  it('Given BODY and WILL, When deriving HP maximum, Then the RAW formula is 10 plus five times rounded-up average', () => {
    const derived = deriveStats({
      stats: { BODY: 8, WILL: 7, EMP: 5 },
      character: { base: { BODY: 8, WILL: 7, EMP: 5 } },
    });

    expect(derived.hpMax).toBe(50);
    expect(derived.seriouslyWounded).toBe(25);
  });

  it('Given EMP, When deriving humanity maximum, Then humanityMax is EMP times ten', () => {
    const derived = deriveStats({
      stats: { BODY: 5, WILL: 5, EMP: 6 },
      character: { base: { BODY: 5, WILL: 5, EMP: 6 }, humanityLoss: 7 },
    });

    expect(derived.humanityMax).toBe(60);
    expect(derived.humanityCurrent).toBe(53);
  });

  it('Given armor penalty, When deriving effective stats, Then only REF DEX and MOVE are penalized', () => {
    const stats = { INT: 6, REF: 6, DEX: 6, TECH: 6, COOL: 6, WILL: 6, LUCK: 6, MOVE: 6, BODY: 6, EMP: 6 };
    const derived = deriveStats({
      stats,
      character: { base: stats, armor: { head: { penalty: 1 }, body: { penalty: 2 } } },
    });

    expect(derived.armorPenalty).toBe(2);
    expect(derived.effectiveStats).toMatchObject({
      INT: 6,
      REF: 4,
      DEX: 4,
      TECH: 6,
      COOL: 6,
      WILL: 6,
      LUCK: 6,
      MOVE: 4,
      BODY: 6,
      EMP: 6,
    });
  });

  it('Given zero and negative humanity, When deriving states, Then Cyberpsychosis and Extreme stay distinct', () => {
    const atZero = deriveStats({
      stats: { BODY: 5, WILL: 5, EMP: 2 },
      character: { base: { BODY: 5, WILL: 5, EMP: 2 }, humanityLoss: 20 },
    });
    const belowZero = deriveStats({
      stats: { BODY: 5, WILL: 5, EMP: 2 },
      character: { base: { BODY: 5, WILL: 5, EMP: 2 }, humanityLoss: 21 },
    });

    expect(atZero).toMatchObject({ humanityCurrent: 0, cyberpsychosisActive: true, cyberpsychosisExtreme: false });
    expect(belowZero).toMatchObject({ humanityCurrent: -1, cyberpsychosisActive: false, cyberpsychosisExtreme: true });
  });
});

describe('CPR RAW stabilization DVs', () => {
  it('Given full HP, When resolving stabilization, Then no stabilization is needed', () => {
    expect(resolveStabilizationDV({ healthCur: 40, hpMax: 40, seriouslyWounded: 20 })).toEqual({ state: 'healthy', dv: null, allowedSkills: [] });
  });

  it('Given HP above half but below max, When resolving stabilization, Then Lightly Wounded is DV10 for First Aid or Paramedic', () => {
    expect(resolveStabilizationDV({ healthCur: 25, hpMax: 40, seriouslyWounded: 20 })).toEqual({
      state: 'lightlyWounded', dv: 10, allowedSkills: ['First Aid', 'Paramedic'],
    });
  });

  it('Given HP at or below half but above zero, When resolving stabilization, Then Seriously Wounded is DV13 for First Aid or Paramedic', () => {
    expect(resolveStabilizationDV({ healthCur: 20, hpMax: 40, seriouslyWounded: 20 })).toEqual({
      state: 'seriouslyWounded', dv: 13, allowedSkills: ['First Aid', 'Paramedic'],
    });
    expect(resolveStabilizationDV({ healthCur: 1, hpMax: 40, seriouslyWounded: 20 }).state).toBe('seriouslyWounded');
  });

  it('Given HP below one, When resolving stabilization, Then Mortally Wounded is DV15 for Paramedic only', () => {
    expect(resolveStabilizationDV({ healthCur: 0, hpMax: 40, seriouslyWounded: 20 })).toEqual({
      state: 'mortallyWounded', dv: 15, allowedSkills: ['Paramedic'],
    });
    expect(resolveStabilizationDV({ healthCur: -3, hpMax: 40, seriouslyWounded: 20 }).allowedSkills).toEqual(['Paramedic']);
  });
});

describe('CPR RAW netrunning foundation', () => {
  it('Given an Interface rank, When computing NET Actions per turn, Then RAW tiers apply', () => {
    expect(netActionsPerTurn(0)).toBe(0);
    expect(netActionsPerTurn(1)).toBe(2);
    expect(netActionsPerTurn(3)).toBe(2);
    expect(netActionsPerTurn(4)).toBe(3);
    expect(netActionsPerTurn(6)).toBe(3);
    expect(netActionsPerTurn(7)).toBe(4);
    expect(netActionsPerTurn(9)).toBe(4);
    expect(netActionsPerTurn(10)).toBe(5);
  });

  it('Given an out-of-range or missing rank, When computing NET Actions, Then it clamps to 0-10 and never goes negative', () => {
    expect(netActionsPerTurn(-3)).toBe(0);
    expect(netActionsPerTurn(99)).toBe(5);
    expect(netActionsPerTurn(undefined)).toBe(0);
  });

  it('Given the Interface Ability catalog, When reading it, Then all seven RAW abilities are present and only Zap is an attack', () => {
    const ids = CPRED_NETRUNNING_ABILITIES.map(a => a.id).sort();
    expect(ids).toEqual(['backdoor', 'cloak', 'control', 'eye-dee', 'pathfinder', 'scanner', 'zap']);
    CPRED_NETRUNNING_ABILITIES.forEach(ability => {
      expect(ability.name).toBeTruthy();
      expect(ability.desc).toBeTruthy();
      expect(ability.isAttack).toBe(ability.id === 'zap');
    });
  });

  it('Given the RAW Program catalog, When reading it, Then boosters attackers and defenders have fixed ATK DEF REZ values', () => {
    const byId = Object.fromEntries(NETRUNNING_PROGRAMS.map(program => [program.id, program]));
    expect(NETRUNNING_PROGRAMS).toHaveLength(15);
    expect(Object.keys(byId).sort()).toEqual([
      'armor', 'banhammer', 'deckkrash', 'eraser', 'flak', 'hellbolt', 'nervescrub',
      'poison-flatline', 'see-ya', 'shield', 'speedy-gonzalvez', 'superglue', 'sword',
      'vrizzbolt', 'worm',
    ]);
    expect(byId.nuke).toBeUndefined();
    expect(byId.eraser).toMatchObject({ class: 'booster', atk: 0, def: 0, rez: 7, cost: 20 });
    expect(byId['see-ya']).toMatchObject({ class: 'booster', atk: 0, def: 0, rez: 7, cost: 20 });
    expect(byId['speedy-gonzalvez']).toMatchObject({ class: 'booster', atk: 0, def: 0, rez: 7, cost: 100 });
    expect(byId.worm).toMatchObject({ class: 'booster', atk: 0, def: 0, rez: 7, cost: 50 });
    expect(byId.banhammer).toMatchObject({ class: 'attacker', subclass: 'anti-program', atk: 1, def: 0, rez: 0, cost: 50 });
    expect(byId.sword).toMatchObject({ class: 'attacker', subclass: 'anti-program', atk: 1, def: 0, rez: 0, cost: 50 });
    expect(byId.deckkrash).toMatchObject({ class: 'attacker', subclass: 'anti-personnel', atk: 0, def: 0, rez: 0, cost: 100 });
    expect(byId.hellbolt).toMatchObject({ class: 'attacker', subclass: 'anti-personnel', atk: 2, def: 0, rez: 0, cost: 100 });
    expect(byId.nervescrub).toMatchObject({ class: 'attacker', subclass: 'anti-personnel', atk: 0, def: 0, rez: 0, cost: 100 });
    expect(byId['poison-flatline']).toMatchObject({ class: 'attacker', subclass: 'anti-personnel', atk: 0, def: 0, rez: 0, cost: 100 });
    expect(byId.superglue).toMatchObject({ class: 'attacker', subclass: 'anti-personnel', atk: 2, def: 0, rez: 0, cost: 100 });
    expect(byId.vrizzbolt).toMatchObject({ class: 'attacker', subclass: 'anti-personnel', atk: 1, def: 0, rez: 0, cost: 50 });
    expect(byId.armor).toMatchObject({ class: 'defender', atk: 0, def: 0, rez: 7, cost: 50 });
    expect(byId.flak).toMatchObject({ class: 'defender', atk: 0, def: 0, rez: 7, cost: 50 });
    expect(byId.shield).toMatchObject({ class: 'defender', atk: 0, def: 0, rez: 7, cost: 20 });
  });

  it('Given installed cyberdeck programs, When normalizing and tracking REZ, Then duplicates are removed and derez is explicit', () => {
    const programs = normalizeInstalledPrograms(['armor', { id: 'armor', rez: 1 }, { id: 'shield', rez: 3 }, 'missing']);
    expect(programs).toEqual([
      { id: 'armor', rez: 7, maxRez: 7, state: 'rezzed' },
      { id: 'shield', rez: 3, maxRez: 7, state: 'rezzed' },
    ]);
    expect(deckProgramSummary(['armor', 'flak', 'shield', 'worm', 'eraser', 'see-ya', 'speedy-gonzalvez', 'sword']).overLimit).toBe(true);

    const derezzed = damageProgramRez({ id: 'armor', rez: 2, maxRez: 7, state: 'rezzed' }, 3);
    expect(derezzed).toEqual({ id: 'armor', rez: 0, maxRez: 7, state: 'derezzed' });
    expect(repairProgramRez(derezzed, 7)).toEqual({ id: 'armor', rez: 7, maxRez: 7, state: 'rezzed' });
  });

  it('Given rezzed utility Programs, When building a breach config, Then their Nexus modifiers are included before the run', () => {
    const installed = normalizeInstalledPrograms(['worm', 'speedy-gonzalvez', 'eraser', 'see-ya', 'armor', 'flak', 'shield']);
    const mods = programRunModifiers(installed);
    expect(mods.labels).toEqual(['Worm: Backdoor automatico', 'Speedy Gonzalvez: +12s', 'Eraser: trace x0.90', 'See Ya: trace x0.95']);
    expect(mods.mitigation).toEqual(['Armor: -4 brain damage', 'Flak: Non-Black ICE ATK -> 0', 'Shield: cancela primeiro dano cerebral']);

    const cfg = buildBreachConfig('standard', 6, [], installed);
    expect(cfg.scriptCount).toBe(2);
    expect(cfg.timeLimit).toBe(136);
    expect(cfg.traceRate).toBe(0.7);
    expect(cfg.prepResults).toContainEqual({ abilityId: 'backdoor', success: true, margin: 2, source: 'Worm' });
    expect(cfg.programModifierLabels).toEqual(mods.labels);
    expect(cfg.traceMitigation).toEqual(mods.mitigation);
  });

  it('Given the RAW Black ICE catalog, When reading it, Then all stat blocks and tier pools are present', () => {
    const byId = Object.fromEntries(BLACK_ICE_PROGRAMS.map(ice => [ice.id, ice]));
    expect(Object.keys(byId).sort()).toEqual([
      'asp', 'dragon', 'giant', 'hellhound', 'killer', 'kraken', 'liche', 'raven', 'sabertooth', 'scorpion', 'skunk', 'wisp',
    ]);
    expect(byId.asp).toMatchObject({ class: 'anti-personnel', per: 4, spd: 6, atk: 2, def: 2, rez: 15 });
    expect(byId.giant).toMatchObject({ class: 'anti-personnel', per: 2, spd: 2, atk: 8, def: 4, rez: 25 });
    expect(byId.hellhound).toMatchObject({ class: 'anti-personnel', per: 6, spd: 6, atk: 6, def: 2, rez: 20 });
    expect(byId.kraken).toMatchObject({ class: 'anti-personnel', per: 6, spd: 2, atk: 8, def: 4, rez: 30 });
    expect(byId.liche).toMatchObject({ class: 'anti-personnel', per: 8, spd: 2, atk: 6, def: 2, rez: 25 });
    expect(byId.raven).toMatchObject({ class: 'anti-personnel', per: 6, spd: 4, atk: 4, def: 2, rez: 15 });
    expect(byId.scorpion).toMatchObject({ class: 'anti-personnel', per: 2, spd: 6, atk: 2, def: 2, rez: 15 });
    expect(byId.skunk).toMatchObject({ class: 'anti-personnel', per: 2, spd: 4, atk: 4, def: 2, rez: 10 });
    expect(byId.wisp).toMatchObject({ class: 'anti-personnel', per: 4, spd: 4, atk: 4, def: 2, rez: 15 });
    expect(byId.dragon).toMatchObject({ class: 'anti-program', per: 6, spd: 4, atk: 6, def: 6, rez: 30 });
    expect(byId.killer).toMatchObject({ class: 'anti-program', per: 4, spd: 8, atk: 6, def: 2, rez: 20 });
    expect(byId.sabertooth).toMatchObject({ class: 'anti-program', per: 8, spd: 6, atk: 6, def: 2, rez: 25 });
    expect(BLACK_ICE_BY_TIER.basic).toEqual(['none', 'wisp']);
    expect(BLACK_ICE_BY_TIER.standard).toEqual(['asp', 'skunk']);
    expect(BLACK_ICE_BY_TIER.uncommon).toEqual(['hellhound', 'scorpion', 'raven']);
    expect(BLACK_ICE_BY_TIER.advanced).toEqual(['kraken', 'liche', 'dragon', 'killer', 'sabertooth']);
  });

  it('Given a tier and Black ICE selection, When building config, Then ICE is hidden until Scanner reveals it', () => {
    expect(selectBlackIceForTier('basic', 'none')).toBeNull();
    expect(selectBlackIceForTier('standard', 'skunk')).toBe('skunk');
    expect(selectBlackIceForTier('standard', 'auto', () => 0)).toBe('asp');
    expect(selectBlackIceForTier('standard', 'auto', () => 0.99)).toBe('skunk');

    const hidden = buildBreachConfig('standard', 6, [], [], 'skunk');
    expect(hidden.blackIceId).toBe('skunk');
    expect(hidden.blackIceRevealed).toBe(false);
    const revealed = buildBreachConfig('standard', 6, [{ abilityId: 'scanner', success: true, margin: 1 }], [], 'skunk');
    expect(revealed.blackIceId).toBe('skunk');
    expect(revealed.blackIceRevealed).toBe(true);
  });

  it('Given NET opposed checks, When resolving Black ICE and Netrunner attacks, Then ties defend and REZ can be derezzed', () => {
    expect(resolveOpposedNetAttack(14, 13)).toMatchObject({ hit: true, margin: 1 });
    expect(resolveOpposedNetAttack(14, 14)).toMatchObject({ hit: false, margin: 0 });

    const hit = resolveNetrunnerIceAttack({
      iceState: { id: 'wisp', rez: 5, maxRez: 15, revealed: true, derezzed: false },
      attackTotal: 17,
      defenseTotal: 12,
      damage: 6,
    });
    expect(hit.nextIce).toMatchObject({ id: 'wisp', rez: 0, derezzed: true });
  });

  it('Given Black ICE effects, When resolving damage, Then defenders mitigate brain damage and anti-program ICE damages Program REZ', () => {
    const brain = resolveBlackIceDamage('hellhound', 7, ['armor']);
    expect(brain).toMatchObject({ kind: 'brain', rawDamage: 7, finalDamage: 3 });
    expect(brain.mitigation).toContain('Armor -4 brain damage');

    const shielded = resolveBlackIceDamage('wisp', 5, ['shield']);
    expect(shielded.finalDamage).toBe(0);
    expect(shielded.updatedPrograms).toEqual([{ id: 'shield', rez: 0, maxRez: 7, state: 'derezzed' }]);

    const program = resolveBlackIceDamage('killer', 12, [{ id: 'worm', rez: 7, maxRez: 7, state: 'rezzed' }], 'worm');
    expect(program).toMatchObject({ kind: 'program', finalDamage: 12, targetProgramId: 'worm', targetProgramDestroyed: true });
    expect(program.updatedPrograms[0]).toEqual({ id: 'worm', rez: 0, maxRez: 7, state: 'derezzed' });
  });

  it('Given NET Architecture tiers, When reading the breach table, Then DV and base config match RAW-Gaps phase 2a', () => {
    expect(BREACH_TIERS.basic).toMatchObject({ dv: 6, matrixSize: 5, scriptCount: 2, scriptLengths: [2, 2, 3], timeLimit: 120, traceRate: 0.8, tokenSet: 'standard', sequenceContinuity: 'blocked' });
    expect(BREACH_TIERS.standard).toMatchObject({ dv: 8, matrixSize: 6, scriptCount: 3, scriptLengths: [2, 3, 3], timeLimit: 100, traceRate: 1.0, tokenSet: 'standard', sequenceContinuity: 'blocked' });
    expect(BREACH_TIERS.uncommon).toMatchObject({ dv: 10, matrixSize: 6, scriptCount: 4, scriptLengths: [3, 3, 4], timeLimit: 90, traceRate: 1.2, tokenSet: 'military', sequenceContinuity: 'linked' });
    expect(BREACH_TIERS.advanced).toMatchObject({ dv: 12, matrixSize: 7, scriptCount: 5, scriptLengths: [3, 4, 4], timeLimit: 80, traceRate: 1.5, tokenSet: 'ghost', sequenceContinuity: 'linked' });
  });

  it('Given Interface rank, When building a breach config, Then buffer time and trace are rank-modified', () => {
    const rank4 = buildBreachConfig('standard', 4, []);
    expect(rank4).toMatchObject({
      architectureTier: 'standard',
      architectureDv: 8,
      bufferSize: 7,
      timeLimit: 116,
      traceRate: 0.88,
    });

    const rank10 = buildBreachConfig('advanced', 10, []);
    expect(rank10.bufferSize).toBe(10);
    expect(rank10.timeLimit).toBe(120);
    expect(rank10.traceRate).toBe(1.05);
  });

  it('Given successful prep, When building a breach config, Then each Interface Ability modifier is applied and clamped', () => {
    const cfg = buildBreachConfig('basic', 10, [
      { abilityId: 'backdoor', success: true, margin: 4 },
      { abilityId: 'cloak', success: true, margin: 2 },
      { abilityId: 'pathfinder', success: true, margin: 1 },
      { abilityId: 'scanner', success: true, margin: 5 },
    ]);

    expect(cfg.scriptCount).toBe(1);
    expect(cfg.traceRate).toBe(0.48);
    expect(cfg.secondaryObjectives).toBe(true);
    expect(cfg.extraNodes).toBe(1);
    expect(cfg.scannerRevealed).toBe(true);
    expect(cfg.revealedScripts).toEqual([{ name: 'ACCESS', length: 2 }]);
  });

  it('Given failed prep, When building a breach config, Then failure consequences are captured', () => {
    const cfg = buildBreachConfig('standard', 10, [
      { abilityId: 'cloak', success: false, margin: -3 },
      { abilityId: 'scanner', success: false, margin: -1 },
    ]);

    expect(cfg.traceRate).toBe(0.77);
    expect(cfg.scannerRevealed).toBe(false);
    expect(cfg.scriptCount).toBe(3);
    expect(cfg.extraNodes).toBe(2);
  });
});

describe('CPR RAW master armor list', () => {
  const MASTER_ARMOR_LIST = [
    { code: 'LEATHERS', sp: 4, penalty: 0, cost: 20 },
    { code: 'KEVLAR', sp: 7, penalty: 0, cost: 50 },
    { code: 'LIGHT-ARMORJACK', sp: 11, penalty: 0, cost: 100 },
    { code: 'BODYWEIGHT-SUIT', sp: 11, penalty: 0, cost: 1000 },
    { code: 'MEDIUM-ARMORJACK', sp: 12, penalty: 2, cost: 100 },
    { code: 'HEAVY-ARMORJACK', sp: 13, penalty: 2, cost: 500 },
    { code: 'FLAK', sp: 15, penalty: 4, cost: 500 },
    { code: 'LIGHT-METALGEAR', sp: 16, penalty: 3, cost: 1000 },
    { code: 'METALGEAR', sp: 18, penalty: 4, cost: 5000 },
  ];

  it.each(MASTER_ARMOR_LIST)('Given $code, When reading the catalog, Then SP $sp, penalty -$penalty and cost $cost match RAW', ({ code, sp, penalty, cost }) => {
    const row = item(code);
    expect(row.armor.headSP).toBe(sp);
    expect(row.armor.bodySP).toBe(sp);
    const expectedPenalty = penalty === 0 ? 0 : -penalty;
    expect(row.armor.armorPenalty).toEqual({ REF: expectedPenalty, DEX: expectedPenalty, MOVE: expectedPenalty });
    expect(row.cost).toBe(cost);
  });

  it('Given the Bulletproof Shield, When reading the catalog, Then it is modeled as 10 HP, not SP', () => {
    const shield = item('BULLETPROOF-SHIELD');
    expect(shield.shieldHp).toBe(10);
    expect(shield.maxHp).toBe(10);
    expect(shield.armor).toBeUndefined();
  });

  // AUDIT (RAW-Gaps-2 Fase 6, 2026-07-08): PLANO-RAW-GAPS-2.md's own Fase 1
  // prompt text says this item is 20 HP; the seed has shipped 15 HP since
  // Fase 1 landed. Could not confirm the "12 Days of REDmas" sourcebook value
  // with confidence either way — this test pins the CURRENT shipped value so
  // a future correction (whichever direction) shows up as an intentional
  // diff, not a silent drift. Flagged as an open divergence, not auto-fixed.
  it('Given the High-Density Bulletproof Shield, When reading the catalog, Then it is modeled as 15 HP (unverified against source — see audit note)', () => {
    const shield = item('HIGH-DENSITY-SHIELD');
    expect(shield.shieldHp).toBe(15);
    expect(shield.maxHp).toBe(15);
  });

  it('Given worn armor and a non-stacking cyber armor layer, When resolving armor for a location, Then only the highest SP counts (no accumulation)', () => {
    const heavyArmorjack = item('HEAVY-ARMORJACK');
    const target = {
      armor: { body: { sp: heavyArmorjack.armor.bodySP, ablates: true, source: 'HEAVY-ARMORJACK' } },
      installedCyberware: [instance('SKIN-WEAVE')],
    };
    const resolved = resolveArmorForLocation(target, 'body', { catalog, canonicalRules });

    expect(resolved.armorSPBefore).toBe(13);
    expect(resolved.armorSPBefore).not.toBe(heavyArmorjack.armor.bodySP + item('SKIN-WEAVE').armor);
  });
});

describe('CPR RAW combat rules', () => {
  it('Given Autofire with a high-damage weapon, When damage resolves, Then damage dice stay fixed at canonical 2d6', () => {
    // Regressão: Autofire damage is fixed 2d6 and must not use weapon damage dice.
    const result = resolveAutofireDamage({
      hit: true,
      margin: 3,
      weapon: { code: 'RIFLE', damage: '5d6', autofire: { enabled: true, multiplier: 4 } },
      damageRoll: { rolls: [5, 5] },
      target: { armor: { body: { sp: 0, ablates: true } } },
      canonicalRules,
    });

    expect(result.damageDice).toBe(canonicalRules.combatRules.autofire.baseDamage);
    expect(result.autofireMultiplier).toBe(3);
    expect(result.rawDamage).toBe(30);
  });

  it('Given combatants with initiatives, When sorting order, Then roll wins before REF tiebreak and stable order', () => {
    const order = sortCombatOrder({
      order: ['slow', 'ref-high', 'ref-low', 'pending'],
      combatants: {
        slow: { initiative: 12 },
        'ref-high': { initiative: 14 },
        'ref-low': { initiative: 14 },
        pending: { initiative: null },
      },
    }, {
      combatRef: id => ({ 'ref-high': 8, 'ref-low': 6, slow: 10, pending: 20 }[id] || 0),
    });

    expect(order).toEqual(['ref-high', 'ref-low', 'slow', 'pending']);
  });

  it('Given an attack with stat skill cyberware and weapon modifiers, When computing attack mod, Then all sources are included', () => {
    const character = {
      base: { REF: 8 },
      derived: { effectiveStats: { REF: 8 } },
      skills: [{ name: 'Handgun', stat: 'REF', level: 6, bonus: 0 }],
    };
    const mod = combatAttackMod(character, { name: 'Excellent Pistol', skill: 'Handgun', attackMod: 1 }, {
      skillBonus: skill => skill === 'Handgun' ? { total: 2, sources: ['+2 Image Enhance'] } : { total: 0, sources: [] },
    });

    expect(mod).toMatchObject({ mod: 17, stat: 'REF', skillName: 'Handgun', skillLevel: 6 });
    expect(mod.sources).toEqual(['+2 Image Enhance', '+1 Excellent Pistol']);
  });

  it('Given opposed evasion tie, When resolving an attack check, Then the defender wins the tie', () => {
    expect(canonicalRules.combatRules.attackRoll.tieRule).toContain('defender wins ties');
    const result = resolveAttackCheck({
      attacker: { stats: { REF: 8 }, skills: { Handgun: 6 } },
      weapon: { weaponSkill: 'Handgun' },
      attackRoll: { total: 18 },
      evasionDV: 18,
    });
    expect(result.hit).toBe(false);
    expect(result.opposed).toBe(true);
  });

  it('Given fixed ranged DV tie, When resolving an attack check, Then meeting the DV hits', () => {
    const result = resolveAttackCheck({
      attacker: { stats: { REF: 8 }, skills: { Handgun: 6 } },
      weapon: { weaponSkill: 'Handgun' },
      attackRoll: { total: 15 },
      targetDV: 15,
    });
    expect(result.hit).toBe(true);
    expect(result.opposed).toBe(false);
  });

  it('Given two sixes on damage dice, When checking critical trigger, Then a critical injury is required', () => {
    const trigger = detectCriticalInjuryFromDamageRoll({ rolls: [6, 6, 2] }, { canonicalRules });
    expect(trigger).toMatchObject({
      triggered: true,
      bonusDamage: canonicalRules.criticalInjuryRules.trigger.bonusDamage,
      rollTableRequired: true,
    });
  });
});

describe('CPR RAW condition rules', () => {
  it('Given an untreated brain injury, When aggregating conditions, Then action and death-save penalties apply', () => {
    // Regressão: untreated critical injuries must affect action checks and Death Save math.
    const aggregate = aggregateConditions({ criticalInjuries: [{ injury: 'crit_head_3' }] });
    expect(aggregate.actionPenalty).toBe(2);
    expect(aggregate.deathSavePenalty).toBe(1);
  });

  it('Given a treated critical injury, When aggregating conditions, Then its penalties are ignored', () => {
    const aggregate = aggregateConditions({ criticalInjuries: [{ injury: 'crit_head_3', treated: true }] });
    expect(aggregate.actionPenalty).toBe(0);
    expect(aggregate.deathSavePenalty).toBe(0);
  });

  it('Given canonical critical injuries, When resolving effects, Then Death Save deltas come from canonical rules', () => {
    const spine = getCriticalInjuryByRoll('body', 10, canonicalRules);
    expect(spine.baseDeathSavePenaltyDelta).toBe(1);
    expect(calculateBaseDeathSavePenalty([spine], canonicalRules)).toBe(1);
    expect(resolveCriticalInjuryEffects([spine], { canonicalRules })).toMatchObject({
      baseDeathSavePenalty: 1,
      nextTurnCannotTakeAction: true,
    });
  });

  it('Given durations in rounds minutes and hours, When converting to rounds, Then canonical combat-time units are preserved', () => {
    expect(normalizeConditionDuration({ value: '3', unit: 'round' })).toEqual({ value: 3, unit: 'round' });
    expect(durationToRounds({ value: 2, unit: 'min' })).toBe(40);
    expect(durationToRounds({ value: 1, unit: 'hour' })).toBe(1200);
  });

  it('Given a charged status, When a charge is spent, Then the status decrements and expires at zero', () => {
    const status = { instanceId: 'charge', modifiers: { charges: 2 } };
    expect(statusChargeKey(status)).toBe('charges');
    expect(useStatusCharge([status], 'charge')[0].modifiers.charges).toBe(1);
    expect(useStatusCharge([{ ...status, modifiers: { charges: 1 } }], 'charge')).toEqual([]);
  });

  it('Given a wound-state immunity status, When aggregating conditions, Then wound state is ignored by flag', () => {
    const aggregate = aggregateConditions({ statusEffects: [{ modifiers: { ignoreWoundState: true } }] });
    expect(aggregate.ignoreWoundState).toBe(true);
  });

  it('Given a one-minute status, When one round advances, Then duration remains rounded in its preferred unit', () => {
    expect(advanceConditionTime([{ id: 'boost', remaining: { value: 1, unit: 'min' } }], 'round')).toEqual([
      { id: 'boost', remaining: { value: 1, unit: 'min' } },
    ]);
  });

  it('Given external critical-injury immunity, When aggregating conditions, Then the immune injury contributes no condition effects', () => {
    const aggregate = aggregateConditions({
      criticalInjuries: [{ injury: 'crit_head_3', treated: false }],
    }, {
      criticalInjuryImmunities: ['crit_head_3'],
    });

    expect(aggregate.actionPenalty).toBe(0);
    expect(aggregate.deathSavePenalty).toBe(0);
    expect(aggregate.bypassArmorInjuries).toBe(0);
  });

  it('Given a lost Facedown, When applying the preset status, Then a -2 action penalty applies until self-removed', () => {
    const preset = CPRED_STATUS_PRESETS.find(status => status.id === 'facedown_lost');
    expect(preset).toBeTruthy();
    const entry = statusEffectEntry(preset, { source: 'facedown' });
    expect(entry.modifiers).toEqual({ actionBonus: -2 });

    const aggregate = aggregateConditions({ statusEffects: [entry] });
    expect(aggregate.actionPenalty).toBe(2);

    expect(removeStatusEffect([entry], entry.instanceId)).toEqual([]);
  });
});

describe('Facedown contested (CPR RAW: COOL+REP+1d10, opposed, higher total wins)', () => {
  const queuedRng = (values) => {
    const queue = values.slice();
    return () => (queue.length ? (queue.shift() - 1) / 10 : 0);
  };

  it('Given the actor rolls higher, When resolving the contest, Then the actor wins and the target loses', () => {
    const result = resolveFacedownContest('actor', 5, 'target', 2, queuedRng([8, 3]));
    expect(result).toEqual({ actorRoll: 8, actorTotal: 13, targetRoll: 3, targetTotal: 5, winnerId: 'actor', loserId: 'target' });
  });

  it('Given the target rolls higher, When resolving the contest, Then the target wins and the actor loses', () => {
    const result = resolveFacedownContest('actor', 2, 'target', 5, queuedRng([3, 8]));
    expect(result).toEqual({ actorRoll: 3, actorTotal: 5, targetRoll: 8, targetTotal: 13, winnerId: 'target', loserId: 'actor' });
  });

  it('Given both totals tie, When resolving the contest, Then nothing happens (no winner or loser)', () => {
    const result = resolveFacedownContest('actor', 4, 'target', 6, queuedRng([7, 5]));
    expect(result.actorTotal).toBe(result.targetTotal);
    expect(result.winnerId).toBeNull();
    expect(result.loserId).toBeNull();
  });
});

describe('CPR RAW movement rules (RAW-Gaps-2 Fase 4: 1 grid square = 2m)', () => {
  it('Given the grid scale, When converting cells to meters, Then 1 square is 2 meters', () => {
    expect(GRID_METERS_PER_CELL).toBe(2);
    expect(cellsToMeters(6)).toBe(12);
  });

  it('Given a Movement Action, When computing range, Then it covers MOVE squares (MOVE x 2m); Run doubles it', () => {
    expect(moveRangeMeters(6)).toBe(12);
    expect(moveRangeMeters(6, { run: true })).toBe(24);
  });

  it('Given difficult terrain, When computing movement cost, Then it costs 2m spent per 1m traveled', () => {
    expect(pathMovementCost(4, 0)).toBe(4);
    expect(pathMovementCost(4, 4)).toBe(8);
  });

  it('Given base MOVE, armor penalty and condition movePenalty, When computing effective MOVE, Then all three factors apply and it floors at zero', () => {
    expect(effectiveMoveStat({ base: { MOVE: 6 } })).toBe(6);
    expect(effectiveMoveStat({ base: { MOVE: 6 }, armor: { head: { penalty: 0 }, body: { penalty: 2 } } })).toBe(4);
    expect(effectiveMoveStat({ base: { MOVE: 6 }, armor: { head: { penalty: 0 }, body: { penalty: 9 } } })).toBe(0);
  });
});

describe('CPR RAW cyberware rules', () => {
  it('Given installed cyberware, When summing humanity loss, Then hcost values are aggregated', () => {
    expect(cyberwareHumanityLoss([
      { code: 'NEURAL-LINK', hcost: item('NEURAL-LINK').hcost },
      { code: 'MUSCLE-LACE', hcost: item('MUSCLE-LACE').hcost },
    ])).toBe(21);
  });

  it('Given Grafted Muscle and Bone Lace, When resolving stat mods, Then BODY increases up to max 10', () => {
    const instances = [instance('MUSCLE-LACE')];
    const body = getEffectiveStat('BODY', { BODY: 9 }, resolvedEffects(instances, { BODY: 9 }), {
      canonicalRules,
      instances,
    });

    expect(body).toEqual({ stat: 'BODY', base: 9, total: 10, cap: 10 });
  });

  it('Given a Linear Frame Sigma, When resolving stat mods, Then effective BODY is set to 12', () => {
    const instances = [instance('LINEAR-SIGMA')];
    expect(getEffectiveStat('BODY', { BODY: 8 }, resolvedEffects(instances), { canonicalRules, instances })).toMatchObject({
      base: 8,
      total: 12,
    });
  });

  it('Given a disabled Linear Frame, When resolving stat mods, Then setEffectiveStat no longer applies', () => {
    // Regressão: EMP-disabled linear frames must not keep their BODY value active.
    const instances = [instance('LINEAR-SIGMA', { damageState: 'disabled' })];
    expect(getEffectiveStat('BODY', { BODY: 8 }, resolvedEffects(instances), { canonicalRules, instances })).toMatchObject({
      base: 8,
      total: 8,
    });
  });

  it('Given a local EMP protection effect, When targeting cyberware, Then only the scoped item is protected', () => {
    const instances = [
      instance('CYBERSPINE', { instanceId: 'spine' }),
      instance('CYBEREYE', { instanceId: 'eye' }),
    ];
    const effects = resolvedEffects(instances);

    expect(resolveEmpProtection(effects, { instances, situation: { localCyberwareTargetInstanceId: 'spine' } }).protected).toBe(true);
    expect(resolveEmpProtection(effects, { instances, situation: { localCyberwareTargetInstanceId: 'eye' } }).protected).toBe(false);
  });

  it('Given legacy statMod cyberware, When reading stat bonus sources, Then stat mods remain source-attributed', () => {
    expect(cyberwareStatModBonus([{ code: 'TEST', name: 'Test Chrome', statMod: { REF: 1 } }], 'REF')).toEqual({
      total: 1,
      sources: ['+1 Test Chrome'],
    });
  });

  it('Given humanity loss changes EMP, When deriving current EMP, Then EMP rounds humanityCurrent / 10 up and never goes negative', () => {
    expect(deriveEffectiveEmp(30)).toBe(3);
    expect(deriveEffectiveEmp(21)).toBe(3);
    expect(deriveEffectiveEmp(20)).toBe(2);
    expect(deriveEffectiveEmp(1)).toBe(1);
    expect(deriveEffectiveEmp(0)).toBe(0);
    expect(deriveEffectiveEmp(-1)).toBe(0);
  });
});

describe('CPR RAW humanity recovery rules', () => {
  it('Given avulsa humanity loss, When recovering, Then it is abated and clamped at zero', () => {
    expect(applyHumanityRecovery(20, 5)).toBe(15);
    expect(applyHumanityRecovery(4, 10)).toBe(0);
    expect(applyHumanityRecovery(0, 6)).toBe(0);
    expect(applyHumanityRecovery(20, -6)).toBe(20);
  });

  it('Given Morale Boost Upgrade 1, When rolling 1d6, Then recovery is half the die rounded down', () => {
    expect(moraleBoostRecovery(1, [5])).toBe(2);
    expect(moraleBoostRecovery(1, [6])).toBe(3);
    expect(moraleBoostRecovery(1, [1])).toBe(0);
  });

  it('Given Morale Boost Upgrade 4, When rolling 1d6, Then recovery is the flat die value', () => {
    expect(moraleBoostRecovery(4, [5])).toBe(5);
  });

  it('Given Morale Boost Upgrade 9, When rolling 2d6, Then recovery keeps the higher single die (not the sum)', () => {
    expect(moraleBoostRecovery(9, [3, 6])).toBe(6);
    expect(moraleBoostRecovery(9, [6, 6])).toBe(6);
    expect(moraleBoostRecovery(9, [2, 4])).toBe(4);
  });

  it('Given installed cyberware and avulsa humanity loss, When therapy recovers the avulsa portion, Then the cyberware hcost stays untouched', () => {
    const installedCyberware = [{ code: 'NEURAL-LINK', hcost: item('NEURAL-LINK').hcost }, { code: 'MUSCLE-LACE', hcost: item('MUSCLE-LACE').hcost }];
    const stats = { BODY: 5, WILL: 5, EMP: 6 };
    const before = deriveStats({ stats, character: { base: stats, humanityLoss: 15 }, installedCyberware });
    // humanityMax 60; loss = 15 (avulsa) + 21 (cyberware hcost) = 36 => current 24.
    expect(before.humanityCurrent).toBe(24);

    const recoveredAvulsa = applyHumanityRecovery(15, 10);
    expect(recoveredAvulsa).toBe(5);
    const after = deriveStats({ stats, character: { base: stats, humanityLoss: recoveredAvulsa }, installedCyberware });
    // Only the avulsa 15 -> 5 changed; cyberware's 21 is recomputed fresh from
    // installedCyberware every time, never stored/abated by therapy.
    expect(after.humanityCurrent).toBe(34);
  });

  it('Given a character at Cyberpsychosis, When humanity recovers above zero, Then the derived flags clear on their own', () => {
    const stats = { BODY: 5, WILL: 5, EMP: 2 };
    const atZero = deriveStats({ stats, character: { base: stats, humanityLoss: 20 } });
    expect(atZero).toMatchObject({ humanityCurrent: 0, cyberpsychosisActive: true });

    const recovered = applyHumanityRecovery(20, 3);
    const after = deriveStats({ stats, character: { base: stats, humanityLoss: recovered } });
    expect(after).toMatchObject({ humanityCurrent: 3, cyberpsychosisActive: false, cyberpsychosisExtreme: false });
  });
});

describe('CPR RAW dice rules', () => {
  it('Given NdM notation, When parsing dice text, Then count and sides are returned', () => {
    expect(parseDiceText('3d6')).toEqual({ count: 3, sides: 6 });
    expect(parseDiceText('d10')).toEqual({ count: 1, sides: 10 });
  });

  it('Given d100 notation, When building renderer notation, Then d100 expands into d100 plus d9 pair', () => {
    expect(rollNotation({ count: 1, sides: 100 })).toBe('1d100+1d9+1');
  });

  it('Given contribution rows, When normalizing roll metadata, Then physical dice cap at twenty with source metadata', () => {
    const meta = rollDiceMeta({
      contributions: [
        { count: 19, sides: 6, source: 'Weapon' },
        { count: 3, sides: 6, source: 'Bonus', kind: 'bonus' },
      ],
    });

    expect(meta).toHaveLength(20);
    expect(meta.at(-1)).toMatchObject({ source: 'Bonus', kind: 'bonus', sides: 6 });
    expect(normalizeRollContributions({ contributions: [{ count: 25, sides: 6, source: 'Too many' }] })[0]).toMatchObject({
      count: 20,
      originalCount: 20,
    });
  });

  it('Given contribution faces and extra breakdown, When formatting detail, Then source and reason remain readable', () => {
    const opts = {
      contributions: [
        { count: 2, sides: 6, source: 'Weapon', reason: 'base' },
        { count: 1, sides: 6, source: 'Cyberware', kind: 'bonus', mod: 2 },
      ],
    };
    expect(rollDetail(opts, [4, 5, 6])).toBe('Weapon [4 + 5] + Cyberware [6 + 2]');
    expect(rollBreakdownDetail('Weapon [4 + 5]', ['+2 (Cyberware)'])).toBe('Weapon [4 + 5] // +2 (Cyberware)');
  });
});
