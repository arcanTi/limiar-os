#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createInstalledCyberwareInstance, validateInstalledCyberwareSet } from '../frontend/src/domain/items/cyberwareInstallEngine.js';

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

function inst(code, options = {}, existingInstances = []) {
  return createInstalledCyberwareInstance(item(code), { ...options, existingInstances });
}

function reportFor(instances, base = { BODY: 8 }, catalogOverride = catalog) {
  return validateInstalledCyberwareSet({ id: 'verify', base, installedCyberware: instances }, catalogOverride, canonicalRules);
}

function issueTypes(report) {
  return report.errors.concat(report.warnings, report.info).map(issue => issue.type);
}

function assertScenario(name, condition, detail) {
  if (!condition) {
    const suffix = detail ? `\n${detail}` : '';
    throw new Error(`FAIL ${name}${suffix}`);
  }
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

run('A two Cybereyes in distinct locations are allowed', () => {
  const left = inst('CYBEREYE', { instanceId: 'eye-left', location: 'leftEye' });
  const right = inst('CYBEREYE', { instanceId: 'eye-right', location: 'rightEye' }, [left]);
  const report = reportFor([left, right]);
  const types = issueTypes(report);
  assertScenario('A', !types.includes('cyberware_duplicate_unique') && !types.includes('paired_cyberware_requirement_missing'), JSON.stringify(types));
});

run('B Image Enhance validates paired Cybereyes and structured slot cost', () => {
  const left = inst('CYBEREYE', { instanceId: 'eye-left', location: 'leftEye' });
  const right = inst('CYBEREYE', { instanceId: 'eye-right', location: 'rightEye' }, [left]);
  const image = inst('IMAGE-ENH', { instanceId: 'image-left', location: 'leftEye', parentInstanceId: left.instanceId }, [left, right]);
  const report = reportFor([left, right, image]);
  const types = issueTypes(report);
  assertScenario('B paired', !types.includes('paired_cyberware_requirement_missing') && !types.includes('required_cyberware_count_missing'), JSON.stringify(types));
  assertScenario('B slot structured', !types.includes('slot_cost_missing') && !types.includes('slot_cost_legacy_only'), JSON.stringify(types));
});

run('C Image Enhance without Cybereye emits requirement issue', () => {
  const image = inst('IMAGE-ENH', { instanceId: 'image-orphan', location: 'leftEye' });
  const report = reportFor([image]);
  const types = issueTypes(report);
  assertScenario('C', types.includes('paired_cyberware_requirement_missing') || types.includes('required_cyberware_count_missing'), JSON.stringify(types));
});

run('D Cyberaudio Suite twice fails maxInstalled=1', () => {
  const first = inst('CYBERAUDIO', { instanceId: 'audio-1', location: 'cyberaudio' });
  const second = inst('CYBERAUDIO', { instanceId: 'audio-2', location: 'cyberaudio' }, [first]);
  const report = reportFor([first, second]);
  assertScenario('D', issueTypes(report).includes('cyberware_duplicate_unique'), JSON.stringify(issueTypes(report)));
});

run('E Cyberarm includes virtual Standard Hand', () => {
  const arm = inst('CYBERARM', { instanceId: 'arm-left', location: 'leftArm' });
  const report = reportFor([arm]);
  assertScenario('E', report.virtualIncludedOptions.some(option => option.code === 'STD-HAND'), JSON.stringify(report.virtualIncludedOptions));
});

run('F Cyberleg includes virtual Standard Foot', () => {
  const leg = inst('CYBERLEG', { instanceId: 'leg-left', location: 'leftLeg' });
  const report = reportFor([leg]);
  assertScenario('F', report.virtualIncludedOptions.some(option => option.code === 'STD-FOOT'), JSON.stringify(report.virtualIncludedOptions));
});

run('G Jump Booster validates paired Cyberlegs and consumes per-leg slots', () => {
  const left = inst('CYBERLEG', { instanceId: 'leg-left', location: 'leftLeg' });
  const right = inst('CYBERLEG', { instanceId: 'leg-right', location: 'rightLeg' }, [left]);
  const jumpLeft = inst('JUMP-BOOSTER', { instanceId: 'jump-left', location: 'leftLeg', parentInstanceId: left.instanceId }, [left, right]);
  const jumpRight = inst('JUMP-BOOSTER', { instanceId: 'jump-right', location: 'rightLeg', parentInstanceId: right.instanceId }, [left, right, jumpLeft]);
  const report = reportFor([left, right, jumpLeft, jumpRight]);
  const types = issueTypes(report);
  const leftPool = report.slotSummary.pools.find(pool => pool.ownerInstanceId === left.instanceId);
  const rightPool = report.slotSummary.pools.find(pool => pool.ownerInstanceId === right.instanceId);
  assertScenario('G paired', !types.includes('paired_cyberware_requirement_missing') && !types.includes('required_cyberware_count_missing'), JSON.stringify(types));
  assertScenario('G slots', leftPool && leftPool.used === 2 && rightPool && rightPool.used === 2, JSON.stringify(report.slotSummary.pools));
});

run('H Linear Frame Sigma without MUSCLE-LACE emits missing requirement', () => {
  const sigma = inst('LINEAR-SIGMA', { instanceId: 'sigma', location: 'internal' });
  const report = reportFor([sigma], { BODY: 8 });
  assertScenario('H', issueTypes(report).includes('required_cyberware_missing'), JSON.stringify(issueTypes(report)));
});

run('I Linear Frame Beta with one MUSCLE-LACE emits count issue', () => {
  const muscle = inst('MUSCLE-LACE', { instanceId: 'muscle-1', location: 'internal' });
  const beta = inst('LINEAR-BETA', { instanceId: 'beta', location: 'internal' }, [muscle]);
  const report = reportFor([muscle, beta], { BODY: 8 });
  assertScenario('I', issueTypes(report).includes('required_cyberware_count_missing'), JSON.stringify(issueTypes(report)));
});

run('J Homebrew reserved item with GM approval does not warn', () => {
  const mantis = inst('MANTIS-BLADE', { instanceId: 'mantis', location: 'leftArm' });
  const report = reportFor([mantis]);
  assertScenario('J', !issueTypes(report).includes('homebrew_missing_gm_approval'), JSON.stringify(issueTypes(report)));
});

run('K Gorilla Arms consumes slots from two Cyberarms', () => {
  const left = inst('CYBERARM', { instanceId: 'arm-left', location: 'leftArm' });
  const right = inst('CYBERARM', { instanceId: 'arm-right', location: 'rightArm' }, [left]);
  const gorilla = inst('GORILLA-ARMS', { instanceId: 'gorilla', location: 'pairedArms' }, [left, right]);
  const report = reportFor([left, right, gorilla]);
  const types = issueTypes(report);
  const leftPool = report.slotSummary.pools.find(pool => pool.ownerInstanceId === left.instanceId);
  const rightPool = report.slotSummary.pools.find(pool => pool.ownerInstanceId === right.instanceId);
  assertScenario('K requirements', !types.includes('paired_cyberware_requirement_missing') && !types.includes('required_cyberware_count_missing'), JSON.stringify(types));
  assertScenario('K slots', leftPool && leftPool.used === 2 && rightPool && rightPool.used === 2, JSON.stringify(report.slotSummary.pools));
});

run('L Gorilla Arms fails with one Cyberarm', () => {
  const left = inst('CYBERARM', { instanceId: 'arm-left', location: 'leftArm' });
  const gorilla = inst('GORILLA-ARMS', { instanceId: 'gorilla', location: 'pairedArms' }, [left]);
  const report = reportFor([left, gorilla]);
  const types = issueTypes(report);
  assertScenario('L', types.includes('required_cyberware_count_missing') && types.includes('paired_parent_slot_missing'), JSON.stringify(types));
});

run('M Gorilla Arms fails when either Cyberarm lacks slots', () => {
  const left = inst('CYBERARM', { instanceId: 'arm-left', location: 'leftArm' });
  const right = inst('CYBERARM', { instanceId: 'arm-right', location: 'rightArm' }, [left]);
  const gorilla = inst('GORILLA-ARMS', { instanceId: 'gorilla', location: 'pairedArms' }, [left, right]);
  const tightCatalog = catalog.map(row => row.code === 'CYBERARM' ? { ...row, optionSlotsProvided: 1 } : row);
  const report = reportFor([left, right, gorilla], { BODY: 8 }, tightCatalog);
  assertScenario('M', issueTypes(report).includes('slot_capacity_exceeded'), JSON.stringify(report.slotSummary));
});

run('N Mantis Blade and Monowire reject invalid external location', () => {
  const mantis = inst('MANTIS-BLADE', { instanceId: 'mantis', location: 'external' });
  const mono = inst('MONOWIRE', { instanceId: 'mono', location: 'external' });
  const report = reportFor([mantis, mono]);
  const parentIssues = report.warnings.concat(report.errors).filter(issue => issue.type === 'cyberware_parent_missing_legacy');
  assertScenario('N', parentIssues.length === 2, JSON.stringify(issueTypes(report)));
});

run('O Mantis Blade and Monowire allow explicit meat arm locations', () => {
  const mantis = inst('MANTIS-BLADE', { instanceId: 'mantis', location: 'leftArm' });
  const mono = inst('MONOWIRE', { instanceId: 'mono', location: 'rightArm' });
  const report = reportFor([mantis, mono]);
  assertScenario('O', !issueTypes(report).includes('cyberware_parent_missing_legacy'), JSON.stringify(issueTypes(report)));
});

const failed = results.filter(result => !result.ok);
console.log(`\nCyberware install engine verification: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
