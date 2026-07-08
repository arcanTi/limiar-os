#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { spendAmmo } from '../frontend/src/domain/combat/combatAmmoEngine.js';
import { resolveCombatAttack } from '../frontend/src/domain/combat/combatResolver.js';
import {
  getEffectiveSkillBonus,
  resolveItemEffects,
} from '../frontend/src/domain/items/itemEffectEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const canonicalRules = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/canonical/cpr-canonical-rules.json'), 'utf8'));
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/seed/limiar-seed.json'), 'utf8'));
const catalog = [...(seed.items || []), ...(seed.gear || [])];
const REDMAS_SOURCE = '12 Days of REDmas';
const REDMAS_CODES = [
  'THERMAL-DAGGER',
  'SMART-GLOVE',
  'HIGH-DENSITY-SHIELD',
  'LIGHT-METALGEAR',
  'NATS-LONG-BARRELED-PISTOL',
  'E-TACK-RAPID-RESPONDER',
  'STUN-BAYONET',
  'FACE-QC',
  'QUICK-DIGITS',
  'SKYDRIVERS',
  'SMART-EARS',
  'CYBERSPINE',
  'CYBER-COND',
  'CYBER-COND-INTEGRATED',
];

function item(code) {
  const found = catalog.find(row => String(row.code || '').toUpperCase() === code);
  if (!found) throw new Error(`Missing REDmas catalog item ${code}`);
  return found;
}

function actor(overrides = {}) {
  return {
    id: overrides.id || 'actor',
    name: overrides.name || 'Actor',
    stats: { REF: 8, DEX: 8, BODY: 8, ...(overrides.stats || {}) },
    skills: { Handgun: 6, 'Melee Weapon': 6, Brawling: 6, 'Martial Arts': 6, Evasion: 6, ...(overrides.skills || {}) },
    hp: 40,
    maxHp: 40,
    armor: {
      head: { sp: 0, ablates: true },
      body: { sp: 0, ablates: true },
      ...(overrides.armor || {}),
    },
    installedCyberware: overrides.installedCyberware || [],
    criticalInjuries: overrides.criticalInjuries || [],
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

function hasEffect(entry, predicate) {
  return (entry.effects || []).some(predicate);
}

run('A REDmas canonical section and provenance', () => {
  const canonicalCodes = Object.keys(canonicalRules.redmasCatalogCorrections || {});
  assertScenario('A canonical count', REDMAS_CODES.every(code => canonicalCodes.includes(code)), JSON.stringify(canonicalCodes));
  const wrong = REDMAS_CODES
    .map(code => item(code))
    .filter(row => row.source !== REDMAS_SOURCE || row.sourceType !== 'official-dlc' || row.requiresGmApproval !== false);
  assertScenario('A provenance', wrong.length === 0, JSON.stringify(wrong.map(row => ({ code: row.code, source: row.source, sourceType: row.sourceType, requiresGmApproval: row.requiresGmApproval }))));
});

run('B Thermal Dagger profile and fire status hook', () => {
  const dagger = item('THERMAL-DAGGER');
  const result = resolveCombatAttack({
    attacker: actor({ id: 'attacker' }),
    target: actor({ id: 'target' }),
    weapon: dagger,
    attackMode: 'melee',
    meleeAttack: true,
    evasionDV: 10,
    attackRoll: { total: 18 },
    damageRoll: { rolls: [4, 5] },
    canonicalRules,
    catalog,
  });
  assertScenario('B profile', dagger.quality === 'excellent' && dagger.damage === '2d6' && dagger.rof === 2 && dagger.concealable === true, JSON.stringify(dagger));
  assertScenario('B status', result.hit && result.statusPending.some(row => row.type === 'Strongly On Fire' && row.sourceCode === 'THERMAL-DAGGER'), JSON.stringify(result));
});

run('C Nat Long-Barreled Pistol custom range table', () => {
  const pistol = item('NATS-LONG-BARRELED-PISTOL');
  const close = resolveCombatAttack({
    attacker: actor(),
    target: actor(),
    weapon: pistol,
    useWeaponRangeTable: true,
    rangeMeters: 5,
    attackRoll: { total: 13 },
    damageRoll: { rolls: [1, 1, 1, 1] },
    canonicalRules,
    catalog,
  });
  const mid = resolveCombatAttack({
    attacker: actor(),
    target: actor(),
    weapon: pistol,
    useWeaponRangeTable: true,
    rangeMeters: 8,
    attackRoll: { total: 13 },
    damageRoll: { rolls: [1, 1, 1, 1] },
    canonicalRules,
    catalog,
  });
  assertScenario('C profile', pistol.damage === '4d6' && pistol.rof === 1 && pistol.magazine === 8 && pistol.attachmentSlots === 3, JSON.stringify(pistol));
  assertScenario('C DV', close.defenseDV === 14 && !close.hit && mid.defenseDV === 13 && mid.hit, JSON.stringify({ close, mid }));
});

run('D E-TACK Rapid Responder burst mode', () => {
  const rapid = item('E-TACK-RAPID-RESPONDER');
  const burst = resolveCombatAttack({
    attacker: actor(),
    target: actor(),
    weapon: rapid,
    selectedMode: 'burst',
    attackRoll: { total: 18 },
    targetDV: 15,
    damageRoll: { rolls: [5, 5, 5] },
    ammoState: { currentAmmo: 3 },
    canonicalRules,
    catalog,
  });
  const lowAmmo = spendAmmo({ ...rapid, selectedMode: 'burst' }, { currentAmmo: 2 }, 'singleShot');
  assertScenario('D profile', rapid.quality === 'poor' && rapid.damage === '2d6' && rapid.magazine === 18 && rapid.installedAttachments.includes('STUN-BAYONET'), JSON.stringify(rapid));
  assertScenario('D burst', burst.damageDice === '3d6' && burst.ammo.requiredAmmo === 3 && burst.ammo.ammoState.currentAmmo === 0 && lowAmmo.needsReload, JSON.stringify({ burst, lowAmmo }));
});

run('E Stun Bayonet attachment', () => {
  const bayonet = item('STUN-BAYONET');
  assertScenario('E', bayonet.kind === 'weaponAttachment' && hasEffect(bayonet, effect => effect.type === 'weaponMode') && /Shoulder Arms/i.test((bayonet.eligible || []).join(' ')), JSON.stringify(bayonet));
});

run('F Smart Glove container', () => {
  const glove = item('SMART-GLOVE');
  assertScenario('F', glove.kind === 'gear' && glove.container === true && glove.optionSlotsProvided === 2 && glove.builtIn.includes('Subdermal Grip'), JSON.stringify(glove));
});

run('G High-Density Shield', () => {
  const shield = item('HIGH-DENSITY-SHIELD');
  assertScenario('G', shield.shieldHp === 15 && shield.maxHp === 15 && shield.cannotBeInstalledInPopupShield === true, JSON.stringify(shield));
});

run('H Light Metalgear', () => {
  const armor = item('LIGHT-METALGEAR');
  const penalty = armor.armor?.armorPenalty || {};
  assertScenario('H', armor.armor?.headSP === 16 && armor.armor?.bodySP === 16 && penalty.REF === -3 && penalty.DEX === -3 && penalty.MOVE === -3, JSON.stringify(armor));
});

run('I Face-QC has no fake Disguise bonus', () => {
  const face = item('FACE-QC');
  assertScenario('I', face.kind === 'cyberware' && face.sourceType === 'official-dlc' && !Object.prototype.hasOwnProperty.call(face.skillBonus || {}, 'Disguise') && face.additionalFaceplateCost === 100, JSON.stringify(face));
});

run('J Quick Digits multi-instance contextual bonus', () => {
  const digits = item('QUICK-DIGITS');
  const effect = (digits.effects || []).find(row => row.type === 'conditionalSkillBonus');
  const one = [{ code: 'QUICK-DIGITS', instanceId: 'digit-1' }];
  const two = [...one, { code: 'QUICK-DIGITS', instanceId: 'digit-2' }];
  const three = [...two, { code: 'QUICK-DIGITS', instanceId: 'digit-3' }];
  const skillBonus = instances => getEffectiveSkillBonus(
    'Pick Lock',
    resolveItemEffects({ character: actor(), instances, catalog, canonicalRules, context: { instances, canonicalRules } }),
    { canonicalRules, instances },
  ).total;
  assertScenario('J catalog', digits.permitsMultiple === true && effect?.stackingRule === 'requiresMultipleInstances' && effect.value === 1 && effect.appliesTo.includes('Pick Lock') && !Object.keys(digits.skillBonus || {}).some(key => /Language/i.test(key)), JSON.stringify(digits));
  assertScenario('J engine', skillBonus(one) === 0 && skillBonus(two) === 1 && skillBonus(three) === 1, JSON.stringify({ one: skillBonus(one), two: skillBonus(two), three: skillBonus(three) }));
});

run('K Skydrivers pairing and damage-vs-cover hook', () => {
  const skydrivers = item('SKYDRIVERS');
  const cover = resolveCombatAttack({
    attacker: actor({ installedCyberware: [{ code: 'SKYDRIVERS', instanceId: 'sky' }] }),
    target: actor({ id: 'cover' }),
    weapon: { code: 'BRAWLING', weaponSkill: 'Brawling', weaponType: 'Brawling' },
    attackMode: 'brawling',
    brawlingAttack: true,
    attackSkill: 'Brawling',
    attackUsesLegs: true,
    userMovedAtLeast4m: true,
    targetType: 'cover',
    evasionDV: 10,
    attackRoll: { total: 18 },
    damageRoll: { rolls: [1, 1, 1] },
    canonicalRules,
    catalog,
  }, () => 0.5);
  const character = resolveCombatAttack({
    attacker: actor({ installedCyberware: [{ code: 'SKYDRIVERS', instanceId: 'sky' }] }),
    target: actor(),
    weapon: { code: 'BRAWLING', weaponSkill: 'Brawling', weaponType: 'Brawling' },
    attackMode: 'brawling',
    brawlingAttack: true,
    attackSkill: 'Brawling',
    attackUsesLegs: true,
    userMovedAtLeast4m: true,
    targetType: 'character',
    evasionDV: 10,
    attackRoll: { total: 18 },
    damageRoll: { rolls: [1, 1, 1] },
    canonicalRules,
    catalog,
  }, () => 0.5);
  assertScenario('K profile', skydrivers.paired === true && skydrivers.optionSlotsProvidedPerLeg === 2 && skydrivers.builtIn.includes('JUMP-BOOSTER'), JSON.stringify(skydrivers));
  assertScenario('K hook', cover.damageVsCoverBonus?.expression === '3d6' && cover.damageVsCoverBonus.total === 12 && character.damageVsCoverBonus === null, JSON.stringify({ cover, character }));
});

run('L Smart Ears container', () => {
  const ears = item('SMART-EARS');
  assertScenario('L', ears.container === true && ears.uniqueWorn === true && ears.optionSlotsProvided === 2 && ears.builtIn.includes('RADIO-SCAN-MUSIC'), JSON.stringify(ears));
});

run('M CyberConductor variants', () => {
  const gear = item('CYBER-COND');
  const integrated = item('CYBER-COND-INTEGRATED');
  assertScenario('M gear', gear.kind === 'gear' && gear.container === true && gear.cyberdeckSlotsProvided === 3, JSON.stringify(gear));
  assertScenario('M integrated', integrated.kind === 'cyberware' && integrated.requiresFBC === true && integrated.unique === true && integrated.cyberdeckSlotsProvided === 3 && integrated.humanityLossDice === '4d6', JSON.stringify(integrated));
});

run('N Cyberspine remains constrained', () => {
  const spine = item('CYBERSPINE');
  const spinal = (spine.effects || []).find(effect => effect.type === 'criticalInjuryImmunity');
  const emp = (spine.effects || []).find(effect => effect.type === 'empProtection');
  assertScenario('N', spine.sourceType === 'official-dlc' && spinal?.value?.injuryIds?.includes('BODY-10-SPINAL-INJURY') && spinal?.value?.blocksBonusDamage === true && emp?.scope === 'self' && emp?.value?.globalEmpImmunity === false, JSON.stringify(spine));
});

const failed = results.filter(result => !result.ok);
console.log(`\nREDmas catalog verification: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
