#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveEmpProtection, resolveItemEffects } from '../frontend/src/domain/items/itemEffectEngine.js';
import {
  detectCriticalInjuryFromDamageRoll,
  getCriticalInjuryByRoll,
  resolveCriticalInjuryEffects,
  resolveCriticalInjuryForDamage,
  rollCriticalInjuryAvoidingDuplicates,
} from '../frontend/src/domain/combat/combatCriticalEngine.js';
import { resolveCombatAttack, resolveAreaAttack } from '../frontend/src/domain/combat/combatResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const canonicalRules = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/canonical/cpr-canonical-rules.json'), 'utf8'));
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/seed/limiar-seed.json'), 'utf8'));
const catalog = seed.items || [];

function weapon(code) {
  const found = catalog.find(row => row.code === code);
  if (!found) throw new Error(`Missing weapon ${code}`);
  return found;
}

function actor(overrides = {}) {
  return {
    id: overrides.id || 'actor',
    name: overrides.name || 'Actor',
    stats: { REF: 8, DEX: 8, BODY: 7, ...(overrides.stats || {}) },
    skills: { Handgun: 6, 'Melee Weapon': 6, 'Heavy Weapons': 6, Evasion: 6, ...(overrides.skills || {}) },
    hp: 40,
    maxHp: 40,
    armor: {
      head: { sp: 7, ablates: true },
      body: { sp: 7, ablates: true },
      ...(overrides.armor || {}),
    },
    installedCyberware: overrides.installedCyberware || [],
    criticalInjuries: overrides.criticalInjuries || [],
  };
}

function baseContext(extra = {}) {
  return {
    attacker: actor({ id: 'attacker' }),
    target: actor({ id: 'target' }),
    weapon: weapon('HEAVY-PISTOL'),
    targetDV: 15,
    attackRoll: { total: 16 },
    canonicalRules,
    catalog,
    ...extra,
  };
}

function assertScenario(name, condition, detail) {
  if (!condition) throw new Error(`FAIL ${name}${detail ? `\n${detail}` : ''}`);
  console.log(`PASS ${name}`);
}

const results = [];
function run(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error });
    console.error(error.message);
  }
}

run('A Body table lookup', () => {
  const injury = getCriticalInjuryByRoll('body', 10, canonicalRules);
  assertScenario('A', injury.id === 'BODY-10-SPINAL-INJURY' && injury.baseDeathSavePenaltyDelta === 1, JSON.stringify(injury));
});

run('B Head table lookup', () => {
  const injury = getCriticalInjuryByRoll('head', 9, canonicalRules);
  const effects = resolveCriticalInjuryEffects([injury], { canonicalRules });
  assertScenario('B', injury.id === 'HEAD-09-CRACKED-SKULL' && effects.headshotMultiplier === 3, JSON.stringify({ injury, effects }));
});

run('C Critical trigger', () => {
  const yes = detectCriticalInjuryFromDamageRoll({ rolls: [6, 6, 2] }, { canonicalRules });
  const no = detectCriticalInjuryFromDamageRoll({ rolls: [6, 5, 2] }, { canonicalRules });
  assertScenario('C', yes.triggered === true && no.triggered === false, JSON.stringify({ yes, no }));
});

run('D Critical bonus', () => {
  const result = resolveCombatAttack(baseContext({
    damageRoll: { rolls: [6, 6, 2] },
    criticalRoll: 8,
    target: actor({ armor: { body: { sp: 20, ablates: true } } }),
  }));
  assertScenario('D', result.criticalBonusDamage === 5 && result.hpDamage === 5 && !result.armorAblated, JSON.stringify(result));
});

run('E Duplicate reroll', () => {
  const rolls = [10, 8];
  const result = rollCriticalInjuryAvoidingDuplicates('body', [{ id: 'BODY-10-SPINAL-INJURY' }], () => rolls.shift(), canonicalRules);
  assertScenario('E', result.injury.id === 'BODY-08-BROKEN-LEG', JSON.stringify(result));
});

run('F Area attack criticals', () => {
  const contexts = [
    baseContext({ target: actor({ id: 'one' }), weapon: weapon('GRENADE-LAUNCHER'), attackMode: 'area', areaAttack: true, damageRoll: { rolls: [6, 6, 3, 3, 2, 1] }, criticalRollsByTarget: { one: 8 } }),
    baseContext({ target: actor({ id: 'two' }), weapon: weapon('GRENADE-LAUNCHER'), attackMode: 'area', areaAttack: true, damageRoll: { rolls: [6, 6, 3, 3, 2, 1] }, criticalRollsByTarget: { two: 10 } }),
  ];
  const results = resolveAreaAttack(contexts);
  assertScenario('F', results[0].criticalInjury.id === 'BODY-08-BROKEN-LEG' && results[1].criticalInjury.id === 'BODY-10-SPINAL-INJURY', JSON.stringify(results));
});

run('G Cracked Skull', () => {
  const result = resolveCombatAttack(baseContext({
    attackMode: 'aimedShot',
    aimedShot: true,
    targetLocation: 'head',
    damageRoll: { rolls: [6, 6, 3] },
    criticalRoll: 5,
    target: actor({ criticalInjuries: [{ id: 'HEAD-09-CRACKED-SKULL' }] }),
  }));
  assertScenario('G', result.headshotMultiplier === 3 && result.criticalBonusDamage === 5 && result.hpDamage === 29, JSON.stringify(result));
});

run('H Spinal Injury without Cyberspine', () => {
  const injury = getCriticalInjuryByRoll('body', 10, canonicalRules);
  const critical = resolveCriticalInjuryForDamage({ rolls: [6, 6, 1] }, baseContext({ criticalRoll: 10 }));
  const effects = resolveCriticalInjuryEffects([injury], { canonicalRules });
  assertScenario('H', critical.applied && critical.bonusDamage === 5 && effects.nextTurnCannotTakeAction && effects.baseDeathSavePenalty === 1, JSON.stringify({ critical, effects }));
});

run('I Spinal Injury with active Cyberspine', () => {
  const target = actor({ installedCyberware: [{ instanceId: 'spine', code: 'CYBERSPINE', damageState: 'normal' }] });
  const result = resolveCombatAttack(baseContext({
    target,
    damageRoll: { rolls: [6, 6, 1] },
    criticalRoll: 10,
    targetDV: 15,
  }));
  assertScenario('I', result.criticalInjuryBlocked && result.criticalBonusDamage === 0 && result.issues.some(issue => issue.type === 'critical_injury_blocked_by_cyberspine'), JSON.stringify(result));
});

run('J Cyberspine does not block other injuries', () => {
  const target = actor({ installedCyberware: [{ instanceId: 'spine', code: 'CYBERSPINE', damageState: 'normal' }] });
  const result = resolveCombatAttack(baseContext({
    target,
    damageRoll: { rolls: [6, 6, 1] },
    criticalRoll: 8,
    targetDV: 15,
  }));
  assertScenario('J', !result.criticalInjuryBlocked && result.criticalInjury.id === 'BODY-08-BROKEN-LEG' && result.criticalBonusDamage === 5, JSON.stringify(result));
});

run('K Disabled Cyberspine', () => {
  const target = actor({ installedCyberware: [{ instanceId: 'spine', code: 'CYBERSPINE', damageState: 'disabled' }] });
  const result = resolveCombatAttack(baseContext({
    target,
    damageRoll: { rolls: [6, 6, 1] },
    criticalRoll: 10,
    targetDV: 15,
  }));
  assertScenario('K', !result.criticalInjuryBlocked && result.criticalBonusDamage === 5, JSON.stringify(result));
});

run('L Cyberspine EMP protection', () => {
  const instances = [{ instanceId: 'spine', code: 'CYBERSPINE', damageState: 'normal' }, { instanceId: 'eye', code: 'CYBEREYE', damageState: 'normal' }];
  const resolved = resolveItemEffects({ character: actor(), instances, catalog, canonicalRules, context: { instances, canonicalRules } });
  const self = resolveEmpProtection(resolved, { instances, situation: { localCyberwareTargetInstanceId: 'spine' } });
  const other = resolveEmpProtection(resolved, { instances, situation: { localCyberwareTargetInstanceId: 'eye' } });
  assertScenario('L', self.protected === true && other.protected === false, JSON.stringify({ self, other }));
});

run('M Critical injury penalties', () => {
  const effects = resolveCriticalInjuryEffects([
    'BODY-08-BROKEN-LEG',
    'BODY-09-TORN-MUSCLE',
    'HEAD-02-LOST-EYE',
    'HEAD-03-BRAIN-INJURY',
  ], { canonicalRules });
  assertScenario('M', effects.movePenalty === -4 && effects.meleeAttackPenalty === -2 && effects.rangedAttackPenalty === -4 && effects.perceptionVisionPenalty === -4 && effects.actionPenalty === -2, JSON.stringify(effects));
});

run('N Critical injury roll options with selected index', () => {
  const rolls = [8, 10];
  const result = resolveCombatAttack(baseContext({
    attacker: actor({ installedCyberware: [{ instanceId: 'mantis', code: 'MANTIS-BLADE' }, { instanceId: 'double-edge', code: 'ENH-DBL-EDGE' }] }),
    weapon: weapon('MANTIS-BLADE'),
    attackMode: 'melee',
    meleeAttack: true,
    evasionDV: 10,
    damageRoll: { rolls: [6, 6, 1] },
    selectedCriticalRollIndex: 1,
  }), () => rolls.shift());
  assertScenario('N options', result.criticalRollOptions.length === 2 && result.criticalRollOptions[0].roll === 8 && result.criticalRollOptions[1].roll === 10, JSON.stringify(result.criticalRollOptions));
  assertScenario('N selected', result.criticalInjury?.roll === 10 && result.criticalInjury?.id === 'BODY-10-SPINAL-INJURY', JSON.stringify(result.criticalInjury));
});

const failed = results.filter(result => !result.ok);
console.log(`\nCritical injury engine verification: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
