#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createInstalledCyberwareInstance } from '../frontend/src/domain/items/cyberwareInstallEngine.js';
import {
  getEffectiveSkillBonus,
  getEffectiveStat,
  resolveCyberweaponProfiles,
  resolveEmpProtection,
  resolveItemEffects,
  resolveMovementModes,
  resolveSenseModes,
} from '../frontend/src/domain/items/itemEffectEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const canonicalRules = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/canonical/cpr-canonical-rules.json'), 'utf8'));
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/seed/limiar-seed.json'), 'utf8'));
const catalog = seed.items || [];

function item(code) {
  const found = catalog.find(row => String(row.code || '').toUpperCase() === code);
  if (!found) throw new Error(`Missing catalog item ${code}`);
  return found;
}

function inst(code, options = {}) {
  return createInstalledCyberwareInstance(item(code), options);
}

function resolve(instances, situation = {}, extra = {}) {
  return resolveItemEffects({
    character: { id: 'verify', base: extra.base || { BODY: 8 } },
    instances,
    catalog,
    canonicalRules,
    context: { instances, canonicalRules, situation, selectedSkill: extra.selectedSkill || null },
  });
}

function skill(instances, skillName, situation = {}, extra = {}) {
  const resolved = resolve(instances, situation, extra);
  return getEffectiveSkillBonus(skillName, resolved, { canonicalRules, instances, situation, selectedSkill: extra.selectedSkill || null });
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

run('A Amplified Hearing conditional Perception', () => {
  const amp = inst('AMP-HEARING', { instanceId: 'amp' });
  assertScenario('A off', skill([amp], 'Perception').total === 0);
  assertScenario('A on', skill([amp], 'Perception', { hearingRelevant: true }).total === 2);
});

run('B Voice Stress Analyzer conditional bonuses', () => {
  const voice = inst('VOICE-STRESS', { instanceId: 'voice' });
  assertScenario('B off', skill([voice], 'Human Perception').total === 0 && skill([voice], 'Interrogation').total === 0);
  assertScenario('B on', skill([voice], 'Human Perception', { voiceRelevant: true }).total === 2 && skill([voice], 'Interrogation', { voiceRelevant: true }).total === 2);
});

run('C AudioVox conditional voice bonuses', () => {
  const audioVox = inst('AUDIOVOX', { instanceId: 'audiovox' });
  assertScenario('C off', skill([audioVox], 'Acting').total === 0 && skill([audioVox], 'Play Instrument').total === 0);
  assertScenario('C on', skill([audioVox], 'Acting', { singingVoiceRelevant: true }).total === 2 && skill([audioVox], 'Play Instrument', { singingVoiceRelevant: true }).total === 2);
});

run('D Image Enhance flat bonuses', () => {
  const image = inst('IMAGE-ENH', { instanceId: 'image' });
  assertScenario('D', skill([image], 'Perception').total === 2 && skill([image], 'Lip Reading').total === 2 && skill([image], 'Conceal/Reveal Object').total === 2);
});

run('E Skill Chip selectedSkillBonus only', () => {
  const chip = inst('SKILL-CHIP', { instanceId: 'chip', selectedSkill: 'Stealth' });
  const resolved = resolve([chip]);
  const fakeApplied = getEffectiveSkillBonus('Pericia Selecionada (definir na instalacao)', resolved, { canonicalRules, instances: [chip] }).total;
  const selectedApplied = getEffectiveSkillBonus('Stealth', resolved, { canonicalRules, instances: [chip] }).total;
  assertScenario('E fake off', fakeApplied === 0);
  assertScenario('E selected on', selectedApplied === 3);
});

run('F Muscle and Bone Lace BODY +2 max 10', () => {
  const muscle = inst('MUSCLE-LACE', { instanceId: 'muscle' });
  const resolved = resolve([muscle], {}, { base: { BODY: 9 } });
  const body = getEffectiveStat('BODY', { BODY: 9 }, resolved, { canonicalRules, instances: [muscle] });
  assertScenario('F', body.total === 10, JSON.stringify(body));
});

run('G Linear Frame Sigma BODY 12 active', () => {
  const sigma = inst('LINEAR-SIGMA', { instanceId: 'sigma' });
  const resolved = resolve([sigma], {}, { base: { BODY: 8 } });
  const body = getEffectiveStat('BODY', { BODY: 8 }, resolved, { canonicalRules, instances: [sigma] });
  assertScenario('G', body.total === 12, JSON.stringify(body));
});

run('H Linear Frame Beta BODY 14 active', () => {
  const beta = inst('LINEAR-BETA', { instanceId: 'beta' });
  const resolved = resolve([beta], {}, { base: { BODY: 8 } });
  const body = getEffectiveStat('BODY', { BODY: 8 }, resolved, { canonicalRules, instances: [beta] });
  assertScenario('H', body.total === 14, JSON.stringify(body));
});

run('I Hardened Shielding local parent protection', () => {
  const arm = inst('CYBERARM', { instanceId: 'arm', location: 'leftArm' });
  const shield = inst('HARD-SHIELD', { instanceId: 'shield', parentInstanceId: 'arm', location: 'leftArm' });
  const targetInside = inst('TECHSCANNER', { instanceId: 'techscanner', parentInstanceId: 'arm', location: 'leftArm' });
  const other = inst('CYBEREYE', { instanceId: 'eye', location: 'leftEye' });
  const instances = [arm, shield, targetInside, other];
  const resolved = resolve(instances);
  assertScenario('I inside', resolveEmpProtection(resolved, { instances, situation: { localCyberwareTargetInstanceId: 'techscanner' } }).protected === true);
  assertScenario('I outside', resolveEmpProtection(resolved, { instances, situation: { localCyberwareTargetInstanceId: 'eye' } }).protected === false);
});

run('J Radar/Sonar returns sense mode without Perception bonus', () => {
  const radar = inst('RAD-SON-INT', { instanceId: 'radar' });
  const resolved = resolve([radar], { radarSonarScan: true });
  assertScenario('J no skill', getEffectiveSkillBonus('Perception', resolved, { canonicalRules, instances: [radar] }).total === 0);
  assertScenario('J sense', resolveSenseModes(resolved).modes.some(mode => mode.sourceCode === 'RAD-SON-INT'));
});

run('K Skate Foot returns movement mode, not fake MOVE stat', () => {
  const skate = inst('SKATE-FOOT', { instanceId: 'skate' });
  const resolved = resolve([skate], { skatingOrRollingSurface: true });
  const move = getEffectiveStat('MOVE', { MOVE: 6 }, resolved, { canonicalRules, instances: [skate] });
  assertScenario('K no stat', move.total === 6, JSON.stringify(move));
  assertScenario('K movement', resolveMovementModes(resolved).modes.some(mode => mode.sourceCode === 'SKATE-FOOT'));
});

run('L Cyberweapon profiles expose canonical ROF', () => {
  const instances = [
    inst('BIG-KNUCKS', { instanceId: 'big' }),
    inst('WOLVERS', { instanceId: 'wolv' }),
    inst('SNAKE', { instanceId: 'snake' }),
    inst('VAMPYRES', { instanceId: 'vamp' }),
  ];
  const profiles = resolveCyberweaponProfiles(instances, catalog, canonicalRules).profiles;
  const rof = Object.fromEntries(profiles.map(row => [row.sourceCode, row.profile.rof]));
  assertScenario('L', rof['BIG-KNUCKS'] === 2 && rof.WOLVERS === 2 && rof.SNAKE === 1 && rof.VAMPYRES === 2, JSON.stringify(rof));
});

const failed = results.filter(result => !result.ok);
console.log(`\nItem effect engine verification: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
