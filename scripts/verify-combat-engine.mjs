#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { spendAmmo } from '../frontend/src/domain/combat/combatAmmoEngine.js';
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
    skills: { Handgun: 6, 'Shoulder Arms': 6, 'Heavy Weapons': 6, 'Melee Weapon': 6, Brawling: 6, Evasion: 6, ...(overrides.skills || {}) },
    hp: 40,
    maxHp: 40,
    armor: {
      head: { sp: 7, ablates: true },
      body: { sp: 7, ablates: true },
      ...(overrides.armor || {}),
    },
    installedCyberware: [],
    effects: [],
    inventory: [],
  };
}

function baseContext(extra = {}) {
  return {
    attacker: actor({ id: 'attacker' }),
    target: actor({ id: 'target' }),
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

run('A Medium Pistol hit', () => {
  const result = resolveCombatAttack(baseContext({ weapon: weapon('MEDIUM-PISTOL'), damageRoll: { rolls: [4, 5] } }));
  assertScenario('A', result.hit && result.hpDamage === 2 && result.armorAblated && result.armorSPAfter === 6, JSON.stringify(result));
});

run('B Medium Pistol no damage', () => {
  const result = resolveCombatAttack(baseContext({ weapon: weapon('MEDIUM-PISTOL'), damageRoll: { rolls: [2, 3] } }));
  assertScenario('B', result.hit && result.hpDamage === 0 && !result.armorAblated && result.armorSPAfter === 7, JSON.stringify(result));
});

run('C Heavy Pistol head aimed shot', () => {
  const result = resolveCombatAttack(baseContext({
    weapon: weapon('HEAVY-PISTOL'),
    attackMode: 'aimedShot',
    aimedShot: true,
    targetLocation: 'head',
    damageRoll: { rolls: [5, 5, 5] },
  }));
  assertScenario('C', result.hpDamage === 16 && !result.criticalTriggered, JSON.stringify(result));
});

run('D Critical Injury trigger', () => {
  const result = resolveCombatAttack(baseContext({
    weapon: weapon('HEAVY-PISTOL'),
    damageRoll: { rolls: [6, 6, 2] },
    target: actor({ armor: { body: { sp: 20, ablates: true } } }),
  }));
  assertScenario('D', result.criticalTriggered && result.criticalBonusDamage === 5 && result.hpDamage === 5 && !result.armorAblated, JSON.stringify(result));
});

run('E Melee Heavy Weapon halves armor', () => {
  const result = resolveCombatAttack(baseContext({
    weapon: weapon('HEAVY-MELEE'),
    attackMode: 'melee',
    meleeAttack: true,
    evasionDV: 10,
    damageRoll: { rolls: [4, 4, 4] },
    target: actor({ armor: { body: { sp: 11, ablates: true } } }),
  }));
  assertScenario('E', result.effectiveArmorSP === 6 && result.hpDamage === 6 && result.armorAblated, JSON.stringify(result));
});

run('F Brawling does not halve armor', () => {
  const result = resolveCombatAttack(baseContext({
    weapon: weapon('BRAWLING-BODY-HIGH'),
    attackMode: 'brawling',
    brawlingAttack: true,
    evasionDV: 10,
    damageRoll: { rolls: [4, 4, 4] },
    target: actor({ armor: { body: { sp: 11, ablates: true } } }),
  }));
  assertScenario('F', result.effectiveArmorSP === 11 && result.hpDamage === 1 && result.armorAblated, JSON.stringify(result));
});

run('G Autofire SMG', () => {
  const result = resolveCombatAttack(baseContext({
    weapon: weapon('SMG'),
    attackMode: 'autofire',
    attackRoll: { total: 17 },
    targetDV: 15,
    damageRoll: { rolls: [5, 5] },
  }));
  assertScenario('G', result.autofireMultiplier === 2 && result.rawDamage === 20 && result.hpDamage === 13 && result.armorAblated, JSON.stringify(result));
});

run('H Autofire cap', () => {
  const result = resolveCombatAttack(baseContext({
    weapon: weapon('ASSAULT-RIFLE'),
    attackMode: 'autofire',
    attackRoll: { total: 23 },
    targetDV: 15,
    damageRoll: { rolls: [6, 6] },
  }));
  assertScenario('H', result.autofireMultiplier === 4 && result.rawDamage === 48 && result.criticalTriggered && result.hpDamage === 46, JSON.stringify(result));
});

run('I Spot Weakness with Autofire', () => {
  const result = resolveCombatAttack(baseContext({
    weapon: weapon('SMG'),
    attackMode: 'autofire',
    attackRoll: { total: 17 },
    targetDV: 15,
    damageRoll: { rolls: [5, 5] },
    spotWeaknessDamage: 3,
  }));
  assertScenario('I', result.rawDamage === 23 && result.hpDamage === 16, JSON.stringify(result));
});

run('J Spot Weakness with head shot', () => {
  const result = resolveCombatAttack(baseContext({
    weapon: weapon('HEAVY-PISTOL'),
    attackMode: 'aimedShot',
    aimedShot: true,
    targetLocation: 'head',
    damageRoll: { rolls: [5, 5, 5] },
    spotWeaknessDamage: 3,
  }));
  assertScenario('J', result.rawDamage === 18 && result.hpDamage === 22, JSON.stringify(result));
});

run('K Ammo spending', () => {
  const pistol = spendAmmo(weapon('MEDIUM-PISTOL'), { currentAmmo: 2 }, 'singleShot');
  const auto = spendAmmo(weapon('SMG'), { currentAmmo: 30 }, 'autofire');
  const empty = spendAmmo(weapon('MEDIUM-PISTOL'), { currentAmmo: 0 }, 'singleShot');
  assertScenario('K', pistol.ammoState.currentAmmo === 1 && auto.ammoState.currentAmmo === 20 && empty.needsReload, JSON.stringify({ pistol, auto, empty }));
});

run('L Missing target DV', () => {
  const result = resolveCombatAttack(baseContext({ weapon: weapon('MEDIUM-PISTOL'), targetDV: undefined, evasionDV: undefined }));
  assertScenario('L', !result.hit && result.issues.some(issue => issue.type === 'missing_target_dv'), JSON.stringify(result));
});

run('M Evasion DV tie', () => {
  const evasionTie = resolveCombatAttack(baseContext({ weapon: weapon('MEDIUM-PISTOL'), attackRoll: { total: 18 }, targetDV: undefined, evasionDV: 18 }));
  const fixedTie = resolveCombatAttack(baseContext({ weapon: weapon('MEDIUM-PISTOL'), attackRoll: { total: 18 }, targetDV: 18, evasionDV: undefined }));
  assertScenario('M', evasionTie.hit === false && fixedTie.hit === true, JSON.stringify({ evasionTie, fixedTie }));
});

run('N Area attack structural critical', () => {
  const contexts = [
    baseContext({ weapon: weapon('GRENADE-LAUNCHER'), attackMode: 'area', areaAttack: true, targetLocation: 'head', damageRoll: { rolls: [6, 6, 3, 3, 2, 1] } }),
    baseContext({ weapon: weapon('GRENADE-LAUNCHER'), attackMode: 'area', areaAttack: true, damageRoll: { rolls: [6, 6, 3, 3, 2, 1] } }),
  ];
  const results = resolveAreaAttack(contexts);
  assertScenario('N', results.every(result => result.criticalPending && result.location === 'body' && result.armorAblated), JSON.stringify(results));
});

const failed = results.filter(result => !result.ok);
console.log(`\nCombat engine verification: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
