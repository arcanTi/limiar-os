#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeWeaponDefinition, parseDamageString } from '../frontend/src/domain/items/itemNormalizers.js';
import { validateWeaponDefinition } from '../frontend/src/domain/items/itemValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const canonicalRules = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/canonical/cpr-canonical-rules.json'), 'utf8'));
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/seed/limiar-seed.json'), 'utf8'));
const catalog = [...(seed.items || []), ...(seed.gear || [])];

function byCode(code) {
  const found = catalog.find(row => String(row.code || '').toUpperCase() === code);
  if (!found) throw new Error(`Missing catalog weapon ${code}`);
  return normalizeWeaponDefinition(found, canonicalRules);
}

function byName(name) {
  const found = catalog.find(row => row.name === name);
  if (!found) throw new Error(`Missing catalog weapon ${name}`);
  return normalizeWeaponDefinition(found, canonicalRules);
}

function issueTypes(def) {
  return validateWeaponDefinition(def, canonicalRules).map(issue => issue.type);
}

function assertScenario(name, condition, detail) {
  if (!condition) throw new Error(`FAIL ${name}${detail ? `\n${detail}` : ''}`);
  console.log(`PASS ${name}`);
}

function assertFullProfile(name, def) {
  const issues = issueTypes(def);
  assertScenario(`${name} full profile`, issues.length === 0, JSON.stringify(issues));
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

run('A Medium Pistol', () => {
  const def = byCode('MEDIUM-PISTOL');
  assertScenario('A', def.damage === '2d6' && def.rof === 2 && def.magazine === 12 && def.weaponSkill === 'Handgun' && def.concealable === true, JSON.stringify(def));
  assertFullProfile('A', def);
});

run('B Very Heavy Pistol', () => {
  const def = byCode('VERY-HEAVY-PISTOL');
  assertScenario('B', def.damage === '4d6' && def.rof === 1 && def.magazine === 8 && def.concealable === false, JSON.stringify(def));
  assertFullProfile('B', def);
});

run('C SMG', () => {
  const def = byCode('SMG');
  assertScenario('C', def.damage === '2d6' && def.magazine === 30 && def.autofire?.multiplier === 3 && def.suppressiveFire === true, JSON.stringify(def));
  assertFullProfile('C', def);
});

run('D Assault Rifle', () => {
  const def = byCode('ASSAULT-RIFLE');
  assertScenario('D', def.damage === '5d6' && def.magazine === 25 && def.autofire?.multiplier === 4 && def.suppressiveFire === true, JSON.stringify(def));
  assertFullProfile('D', def);
});

run('E Shotgun', () => {
  const def = byCode('SHOTGUN');
  assertScenario('E', def.damage === '5d6' && def.magazine === 4 && def.weaponSkill === 'Shoulder Arms', JSON.stringify(def));
  assertFullProfile('E', def);
});

run('F Grenade Launcher', () => {
  const def = byCode('GRENADE-LAUNCHER');
  assertScenario('F', def.damage === '6d6' && def.magazine === 2 && def.weaponSkill === 'Heavy Weapons', JSON.stringify(def));
  assertFullProfile('F', def);
});

run('G Rocket Launcher', () => {
  const def = byCode('ROCKET-LAUNCHER');
  assertScenario('G', def.damage === '8d6' && def.magazine === 1 && def.weaponSkill === 'Heavy Weapons', JSON.stringify(def));
  assertFullProfile('G', def);
});

run('H Heavy Melee', () => {
  const def = byCode('HEAVY-MELEE');
  assertScenario('H', def.damage === '3d6' && def.rof === 2 && def.weaponSkill === 'Melee Weapon', JSON.stringify(def));
  assertFullProfile('H', def);
});

run('I Very Heavy Melee', () => {
  const def = byCode('VERY-HEAVY-MELEE');
  assertScenario('I', def.damage === '4d6' && def.rof === 1 && def.weaponSkill === 'Melee Weapon', JSON.stringify(def));
  assertFullProfile('I', def);
});

run('J Smart Pistol Lullaby', () => {
  const def = byName('Smart Pistol "Lullaby"');
  const damage = parseDamageString(def.damage);
  assertScenario('J', damage && damage.mod === 0 && def.sourceType === 'homebrew-limiar' && def.damage === '2d6', JSON.stringify(def));
  assertScenario('J GM approval', catalog.find(row => row.name === 'Smart Pistol "Lullaby"')?.requiresGmApproval === true);
  assertFullProfile('J', def);
});

run('K Mono-Katana', () => {
  const def = byName('Mono-Katana');
  const damage = parseDamageString(def.damage);
  assertScenario('K', damage && damage.mod === 0 && def.sourceType === 'homebrew-limiar' && def.damage === '3d6', JSON.stringify(def));
  assertScenario('K GM approval', catalog.find(row => row.name === 'Mono-Katana')?.requiresGmApproval === true);
  assertFullProfile('K', def);
});

run('L Militech Gun if present', () => {
  const found = catalog.find(row => row.name === 'Militech Gun' || row.code === 'MILITECH-GUN');
  if (!found) {
    console.log('PASS L skipped');
    return;
  }
  const def = normalizeWeaponDefinition(found, canonicalRules);
  assertScenario('L', def.weaponType === 'Heavy Pistol' && def.damage === '3d6' && def.rof === 2 && def.magazine === 8 && def.weaponSkill === 'Handgun', JSON.stringify(def));
  assertFullProfile('L', def);
});

const failed = results.filter(result => !result.ok);
console.log(`\nCore weapon catalog verification: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
