#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveCombatAttack } from '../frontend/src/domain/combat/combatResolver.js';
import { createInstalledCyberwareInstance, validateInstalledCyberwareSet } from '../frontend/src/domain/items/cyberwareInstallEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const canonicalRules = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/canonical/cpr-canonical-rules.json'), 'utf8'));
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/seed/limiar-seed.json'), 'utf8'));
const catalog = seed.items || [];
const normalizedHomebrewCodes = [
  'BIOMON',
  'CHEMSKIN',
  'LIGHT-TAT',
  'BACKUP-DRIVE',
  'DNA-LOCK',
  'HARD-CIRCUIT',
  'RANGE-UPGRADE',
  'CHAINRIPP',
  'REFLEX-CO',
  'SMART-GLASSES',
  'EMP-THREAD',
  'SKINWATCH',
  'TECHHAIR',
  'CONC-SLEEVE',
];
const officialSourceTypes = new Set(['official-core', 'official-dlc', 'official-supplement']);

function item(code) {
  const found = catalog.find(row => String(row.code || '').toUpperCase() === code);
  if (!found) throw new Error(`Missing catalog item ${code}`);
  return found;
}

function inst(code, options = {}) {
  return createInstalledCyberwareInstance(item(code), options);
}

function hasRequirement(row, code, type = 'requiredCyberware') {
  return (row.requires || []).some(req => req.type === type && req.code === code);
}

function effectValue(row, type) {
  const effect = (row.effects || []).find(entry => entry.type === type);
  return effect ? effect.value || {} : null;
}

function actor(overrides = {}) {
  return {
    id: overrides.id || 'actor',
    name: overrides.name || 'Actor',
    stats: { REF: 8, DEX: 8, BODY: 7, ...(overrides.stats || {}) },
    skills: { 'Melee Weapon': 6, Brawling: 6, 'Martial Arts': 6, Evasion: 6, ...(overrides.skills || {}) },
    hp: 40,
    maxHp: 40,
    armor: { body: { sp: 0, ablates: true }, head: { sp: 0, ablates: true }, ...(overrides.armor || {}) },
    installedCyberware: overrides.installedCyberware || [],
  };
}

function combat(extra = {}) {
  return resolveCombatAttack({
    attacker: actor(extra.attacker || {}),
    target: actor(extra.target || {}),
    weapon: extra.weapon,
    attackMode: extra.attackMode || 'melee',
    meleeAttack: extra.meleeAttack !== false,
    brawlingAttack: extra.brawlingAttack || false,
    evasionDV: 10,
    attackRoll: { total: 16 },
    damageRoll: extra.damageRoll || { rolls: [4, 4, 4] },
    canonicalRules,
    catalog,
    ...extra.context,
  });
}

function assertScenario(name, condition, detail) {
  if (!condition) throw new Error(`FAIL ${name}${detail ? `\n${detail}` : ''}`);
  console.log(`PASS ${name}`);
}

function issueTypes(report) {
  return report.errors.concat(report.warnings, report.info).map(issue => issue.type);
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

run('A0 normalized homebrew source policy', () => {
  normalizedHomebrewCodes.forEach(code => {
    const row = item(code);
    assertScenario(`${code} source`, row.sourceType === 'homebrew-limiar' && !officialSourceTypes.has(row.sourceType), JSON.stringify({ sourceType: row.sourceType }));
    assertScenario(`${code} gm`, row.requiresGmApproval === true, JSON.stringify({ requiresGmApproval: row.requiresGmApproval }));
    assertScenario(`${code} note`, /Homebrew Limiar OS/i.test(String(row.sourceNotes || row.notes || row.validationNotes || '')), JSON.stringify({ sourceNotes: row.sourceNotes, validationNotes: row.validationNotes, notes: row.notes }));
    assertScenario(`${code} desc`, String(row.desc || row.description || '').trim().length > 0, JSON.stringify({ desc: row.desc, description: row.description }));
  });
});

run('A1 Cyberdeck hardware slots are structured', () => {
  ['BACKUP-DRIVE', 'DNA-LOCK'].forEach(code => {
    const row = item(code);
    assertScenario(`${code} no free requirements`, !String(row.requirements || '').trim(), JSON.stringify({ requirements: row.requirements }));
    assertScenario(`${code} deck slots`, row.cyberdeckHardwareSlotsRequired === 2, JSON.stringify({ cyberdeckHardwareSlotsRequired: row.cyberdeckHardwareSlotsRequired }));
    assertScenario(`${code} no body slots`, row.optionSlotsRequired === undefined && row.slots === undefined && row.slotCost === undefined, JSON.stringify({ optionSlotsRequired: row.optionSlotsRequired, slots: row.slots, slotCost: row.slotCost }));
  });
});

run('A2 validation and synergy notes are preserved outside requirements', () => {
  ['CHAINRIPP', 'REFLEX-CO'].forEach(code => {
    const row = item(code);
    assertScenario(`${code} requirements`, !String(row.requirements || '').trim(), JSON.stringify({ requirements: row.requirements }));
    assertScenario(`${code} validation note`, /Originally marked for supplement validation/i.test(String(row.validationNotes || row.sourceNotes || '')), JSON.stringify({ validationNotes: row.validationNotes, sourceNotes: row.sourceNotes }));
  });
  const techhair = item('TECHHAIR');
  const techhairReport = validateInstalledCyberwareSet({ id: 'techhair', base: { BODY: 8 }, installedCyberware: [inst('TECHHAIR', { instanceId: 'techhair', location: 'fashion' })] }, catalog, canonicalRules);
  assertScenario('TECHHAIR no free requirements', !String(techhair.requirements || '').trim(), JSON.stringify({ requirements: techhair.requirements }));
  assertScenario('TECHHAIR synergy', /Chemskin/i.test(String(techhair.synergyNotes || techhair.notes || '')), JSON.stringify({ synergyNotes: techhair.synergyNotes, notes: techhair.notes }));
  assertScenario('TECHHAIR no install block', !issueTypes(techhairReport).includes('required_cyberware_missing'), JSON.stringify(issueTypes(techhairReport)));
});

run('A Mantis Blade catalog', () => {
  const row = item('MANTIS-BLADE');
  assertScenario('A source', row.sourceType === 'homebrew-limiar' && row.requiresGmApproval === true);
  assertScenario('A profile', row.weaponProfile.damage === '3d6' && row.weaponProfile.rof === 2 && row.weaponProfile.weaponSkill === 'Melee Weapon');
  assertScenario('A concealable', row.weaponProfile.concealable === true);
  assertScenario('A armor', !(row.specialRules || []).some(rule => /ignore armor|bypass armor/i.test(rule) && !/does not|not /i.test(rule)), JSON.stringify(row.specialRules));
  assertScenario('A balance', (row.balanceNotes || []).length > 0);
});

run('B Monowire catalog', () => {
  const row = item('MONOWIRE');
  assertScenario('B source', row.sourceType === 'homebrew-limiar' && row.requiresGmApproval === true);
  assertScenario('B profile', row.weaponProfile.damage === '4d6' && row.weaponProfile.rof === 1 && row.weaponProfile.weaponSkill === 'Melee Weapon');
  assertScenario('B reach', row.weaponProfile.reachMeters === 4);
  assertScenario('B armor', !(row.specialRules || []).some(rule => /ignore armor|bypass armor/i.test(rule) && !/does not|not /i.test(rule)), JSON.stringify(row.specialRules));
  assertScenario('B balance', (row.balanceNotes || []).length > 0);
});

run('C Combat Tail catalog', () => {
  const row = item('COMBAT-TAIL');
  const cyberweapon = effectValue(row, 'cyberweapon');
  assertScenario('C source', row.sourceType === 'homebrew-limiar' && row.requiresGmApproval === true);
  assertScenario('C profile', row.weaponProfile.damage === '3d6' && row.weaponProfile.rof === 2 && row.weaponProfile.handsRequired === 0 && row.weaponProfile.concealable === false);
  assertScenario('C action', cyberweapon && cyberweapon.grantsExtraAction === false, JSON.stringify(cyberweapon));
  assertScenario('C requires', hasRequirement(row, 'NEURAL-LINK'), JSON.stringify(row.requires));
});

run('D Gorilla Arms catalog', () => {
  const row = item('GORILLA-ARMS');
  const cyberweapon = effectValue(row, 'cyberweapon');
  assertScenario('D source', row.sourceType === 'homebrew-limiar' && row.requiresGmApproval === true);
  assertScenario('D paired', row.paired === true && hasRequirement(row, 'CYBERARM', 'requiredCyberwareCount'));
  assertScenario('D profile', row.weaponProfile.weaponSkill === 'Brawling' && row.weaponProfile.rof === 2 && row.weaponProfile.damage === 'dynamic');
  assertScenario('D scale', Array.isArray(row.weaponProfile.damageScale) && row.weaponProfile.damageScale.length === 4);
  assertScenario('D body scope', cyberweapon.bodyModifierForThisWeaponOnly === 2 && cyberweapon.doesNotAffectRealBody === true, JSON.stringify(cyberweapon));
  assertScenario('D no real body', !row.statMod?.BODY && !(row.effects || []).some(effect => effect.type === 'statModifier'), JSON.stringify(row.effects));
});

run('E Hydraulic Ram catalog', () => {
  const row = item('ENH-HYD-RAM');
  const value = effectValue(row, 'damageVsCover');
  assertScenario('E requires', hasRequirement(row, 'GORILLA-ARMS'), JSON.stringify(row.requires));
  assertScenario('E cover only', value.bonusDamage === '3d6' && value.targetRestriction === 'cover_or_object_only' && /never applies against living targets/i.test(row.specialRules.join(' ')), JSON.stringify(value));
});

run('F Pneumatic Actuation catalog', () => {
  const row = item('ENH-PNEU-ACT');
  const onCritical = effectValue(row, 'weaponMode').onCritical;
  assertScenario('F requires', hasRequirement(row, 'GORILLA-ARMS'), JSON.stringify(row.requires));
  assertScenario('F direct', onCritical.extraDirectDamage === 5 && onCritical.notMultipliedByHeadshot === true && onCritical.doesNotAblateArmor === true, JSON.stringify(onCritical));
});

run('G Tungsten Reinforcement catalog', () => {
  const row = item('ENH-TUNG-REIN');
  const modes = effectValue(row, 'weaponMode').modes || [];
  assertScenario('G requires', hasRequirement(row, 'GORILLA-ARMS'), JSON.stringify(row.requires));
  assertScenario('G modes', modes.some(mode => mode.mode === 'reinforcedFast' && mode.damage === '3d6' && mode.rof === 2) && modes.some(mode => mode.mode === 'reinforcedHeavy' && mode.damage === '4d6' && mode.rof === 1), JSON.stringify(modes));
});

run('H Double-Edged catalog', () => {
  const row = item('ENH-DBL-EDGE');
  const advantage = effectValue(row, 'weaponMode').criticalRollAdvantage;
  assertScenario('H', hasRequirement(row, 'MANTIS-BLADE') && advantage.rollCount === 2 && advantage.choose === 1, JSON.stringify({ requires: row.requires, advantage }));
});

run('I Monomolecular Edge catalog', () => {
  const row = item('ENH-MONO-EDG');
  const value = effectValue(row, 'armorAblation');
  assertScenario('I', hasRequirement(row, 'MANTIS-BLADE') && value.additionalAblation === 1 && /damage penetrates armor/i.test(value.condition) && /does not ignore armor/i.test(row.specialRules.join(' ')), JSON.stringify(value));
});

run('J Barbed Line catalog', () => {
  const row = item('ENH-BARB-LIN');
  const advantage = effectValue(row, 'weaponMode').criticalRollAdvantage;
  assertScenario('J', hasRequirement(row, 'MONOWIRE') && advantage.rollCount === 3 && advantage.choose === 1, JSON.stringify({ requires: row.requires, advantage }));
});

run('K Electro-Line catalog', () => {
  const row = item('ENH-ELECTRO');
  const nonLethal = effectValue(row, 'nonLethalMode');
  const mode = effectValue(row, 'weaponMode');
  assertScenario('K', hasRequirement(row, 'MONOWIRE') && nonLethal.damage === '3d6' && nonLethal.rof === 1 && nonLethal.lethal === false && nonLethal.doesNotCauseCriticalInjury === true && mode.selectedMode === 'electroLine', JSON.stringify({ nonLethal, mode }));
});

run('L Thermal Edge catalog', () => {
  const row = item('ENH-THERMAL');
  const value = effectValue(row, 'armorAblation');
  assertScenario('L', hasRequirement(row, 'MONOWIRE') && value.additionalAblation === 1 && /damage penetrates armor/i.test(value.condition) && /does not set targets on fire by default/i.test(row.specialRules.join(' ')), JSON.stringify(value));
});

run('M Combat hooks', () => {
  const mantis = combat({ weapon: item('MANTIS-BLADE') });
  assertScenario('M mantis', mantis.damageDice === '3d6' && mantis.weapon.rof === 2, JSON.stringify(mantis));

  const monowire = combat({ weapon: item('MONOWIRE'), damageRoll: { rolls: [4, 4, 4, 4] } });
  assertScenario('M monowire', monowire.damageDice === '4d6' && monowire.weapon.rof === 1 && monowire.weapon.reachMeters === 4, JSON.stringify(monowire));

  const tail = combat({ weapon: item('COMBAT-TAIL'), context: { handsOccupied: true } });
  assertScenario('M tail', tail.hit === true && tail.weapon.handsRequired === 0, JSON.stringify(tail));

  const gorillaActor = actor({ stats: { BODY: 5 }, installedCyberware: [inst('GORILLA-ARMS', { instanceId: 'gorilla' })] });
  const gorilla = resolveCombatAttack({
    attacker: gorillaActor,
    target: actor(),
    weapon: item('GORILLA-ARMS'),
    attackMode: 'brawling',
    brawlingAttack: true,
    evasionDV: 10,
    attackRoll: { total: 16 },
    damageRoll: { rolls: [4, 4, 4] },
    canonicalRules,
    catalog,
  });
  assertScenario('M gorilla damage', gorilla.damageDice === '3d6' && gorillaActor.stats.BODY === 5, JSON.stringify(gorilla));

  const electroActor = actor({ installedCyberware: [inst('MONOWIRE', { instanceId: 'mono' }), inst('ENH-ELECTRO', { instanceId: 'electro' })] });
  const electro = resolveCombatAttack({
    attacker: electroActor,
    target: actor(),
    weapon: item('MONOWIRE'),
    selectedMode: 'electroLine',
    attackMode: 'melee',
    meleeAttack: true,
    evasionDV: 10,
    attackRoll: { total: 16 },
    damageRoll: { rolls: [6, 6, 6] },
    canonicalRules,
    catalog,
  });
  assertScenario('M electro', electro.damageDice === '3d6' && electro.weapon.rof === 1 && electro.weapon.nonLethal === true && electro.criticalTriggered === false && electro.criticalSuppressed === true, JSON.stringify(electro));
});

const failed = results.filter(result => !result.ok);
console.log(`\nHomebrew Limiar catalog verification: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
