import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runCatalogAudit } from '../../src/domain/items/catalogAuditEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const GOLDEN_DIR = path.resolve(__dirname, '../fixtures/golden');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadGolden(name) {
  return readJson(path.join(GOLDEN_DIR, `${name}.json`));
}

function issueCount(report, type) {
  return report.totals.byType[type] || 0;
}

function hasIssue(report, type, code) {
  return (report.issues || []).some(issue => issue.type === type && issue.code === code);
}

function stripGeneratedAt(report) {
  const { generatedAt, ...rest } = report;
  return rest;
}

function engineReferencesWithoutCanonicalCodes(report) {
  const { canonicalItemCodes, ...stableReferences } = report.engineReferences;
  return stableReferences;
}

describe('catalog audit golden masters', () => {
  it('runs the current catalog audit with accepted post-snapshot cleanup drift', () => {
    const seed = readJson(path.join(REPO_ROOT, 'data/seed/limiar-seed.json'));
    const canonicalRules = readJson(path.join(REPO_ROOT, 'data/canonical/cpr-canonical-rules.json'));
    const snapshot = loadGolden('after-homebrew-limiar-fix');
    const actual = runCatalogAudit({
      seed,
      canonicalRules,
      generatedAt: snapshot.generatedAt,
    });

    expect(actual.source).toBe(snapshot.source);
    expect(actual.canonicalRules).toBe(snapshot.canonicalRules);
    expect(actual.report).toBe(snapshot.report);
    expect(actual.totals.collections).toEqual(snapshot.totals.collections);
    expect(engineReferencesWithoutCanonicalCodes(actual)).toEqual(engineReferencesWithoutCanonicalCodes(snapshot));

    // Accepted catalog evolution after the 2026-07-02 snapshot:
    // the seed is now audit-clean, and canonical refs no longer reserve
    // CHAINRIPP, CONC-SLEEVE, REFLEX-CO, or SMART-GLASSES.
    expect({
      snapshotIssues: snapshot.totals.issues,
      currentIssues: actual.totals.issues,
      snapshotHistoricalIssueTypes: Object.keys(snapshot.totals.byType).sort(),
      removedCanonicalRefs: snapshot.engineReferences.canonicalItemCodes
        .filter(code => !actual.engineReferences.canonicalItemCodes.includes(code))
        .sort(),
    }).toEqual({
      snapshotIssues: 36,
      currentIssues: 0,
      snapshotHistoricalIssueTypes: [
        'cyberware_missing_slots',
        'cyberware_missing_source',
        'effect_legacy_bonus_not_applied',
        'installed_cyberware_parent_missing_legacy',
        'installed_required_cyberware_missing',
        'installed_slot_parent_missing',
        'requirements_free_text',
      ],
      removedCanonicalRefs: ['CHAINRIPP', 'CONC-SLEEVE', 'REFLEX-CO', 'SMART-GLASSES'],
    });
    expect(actual.issues).toEqual([]);
  });

  it('documents the core cyberware stage by its audit-report deltas', () => {
    const before = loadGolden('before-core-cyberware-fix');
    const after = loadGolden('after-core-cyberware-fix');

    // The recovered files are audit reports, not seed inputs; this locks the
    // historical delta validated by scripts/verify-cyberware-install-engine.mjs
    // and scripts/verify-item-effect-engine.mjs.
    expect(before.totals.issues).toBe(303);
    expect(after.totals.issues).toBe(94);
    expect(issueCount(before, 'fake_skill_converted_to_contextual_effect')).toBe(14);
    expect(issueCount(after, 'fake_skill_converted_to_contextual_effect')).toBe(0);
    expect(issueCount(before, 'installed_slot_cost_missing')).toBe(1);
    expect(issueCount(after, 'installed_slot_cost_missing')).toBe(0);
    expect(issueCount(before, 'installed_slot_cost_legacy_only')).toBe(1);
    expect(issueCount(after, 'installed_slot_cost_legacy_only')).toBe(0);
  });

  it('documents the core weapon stage by removing gear weapon profile errors', () => {
    const before = loadGolden('before-core-weapons-fix');
    const after = loadGolden('after-core-weapons-fix');

    // Weapon profile normalization is validated structurally here because the
    // snapshot pair contains audit reports, while the live profile behavior is
    // covered by scripts/verify-core-weapon-catalog.mjs.
    expect(issueCount(before, 'weapon_missing_profile')).toBe(6);
    expect(issueCount(after, 'weapon_missing_profile')).toBe(4);
    expect(issueCount(before, 'gear_weapon_non_red_damage')).toBe(2);
    expect(issueCount(after, 'gear_weapon_non_red_damage')).toBe(0);
    expect(before.totals.byCollection.gear).toBe(4);
    expect(after.totals.byCollection.gear).toBeUndefined();
  });

  it('documents that the combat engine stage left the catalog audit unchanged', () => {
    const before = loadGolden('before-combat-engine');
    const after = loadGolden('after-combat-engine');

    // Combat behavior is not reproducible from audit-report snapshots; the
    // paired reports intentionally stay identical while runtime combat checks
    // live in scripts/verify-combat-engine.mjs.
    expect(stripGeneratedAt(after)).toEqual(stripGeneratedAt(before));
    expect(after.totals.issues).toBe(90);
  });

  it('documents the critical-injury stage by removing the Cyberspine source issue', () => {
    const before = loadGolden('before-critical-injuries');
    const after = loadGolden('after-critical-injuries');

    expect(hasIssue(before, 'cyberware_missing_source', 'CYBERSPINE')).toBe(true);
    expect(hasIssue(after, 'cyberware_missing_source', 'CYBERSPINE')).toBe(false);
    expect(issueCount(before, 'cyberware_missing_source')).toBe(31);
    expect(issueCount(after, 'cyberware_missing_source')).toBe(30);
    expect(after.totals.issues).toBe(before.totals.issues - 1);
  });

  it('documents the REDmas stage by removing DLC provenance and fake-skill errors', () => {
    const before = loadGolden('before-redmas-fix');
    const after = loadGolden('after-redmas-fix');

    expect(hasIssue(before, 'fake_skill_name', 'FACE-QC')).toBe(true);
    expect(hasIssue(after, 'fake_skill_name', 'FACE-QC')).toBe(false);
    expect(hasIssue(before, 'cyberware_missing_source', 'QUICK-DIGITS')).toBe(true);
    expect(hasIssue(after, 'cyberware_missing_source', 'QUICK-DIGITS')).toBe(false);
    expect(issueCount(before, 'requirements_free_text')).toBe(18);
    expect(issueCount(after, 'requirements_free_text')).toBe(17);
    expect(after.totals.issues).toBe(81);
  });

  it('documents the homebrew Limiar stage by removing custom weapon profile errors', () => {
    const before = loadGolden('before-homebrew-limiar-fix');
    const after = loadGolden('after-homebrew-limiar-fix');

    expect(issueCount(before, 'homebrew_missing_gm_approval')).toBe(12);
    expect(issueCount(after, 'homebrew_missing_gm_approval')).toBe(0);
    expect(issueCount(before, 'weapon_missing_profile')).toBe(4);
    expect(issueCount(after, 'weapon_missing_profile')).toBe(0);
    expect(issueCount(before, 'cyberweapon_missing_rof')).toBe(4);
    expect(issueCount(after, 'cyberweapon_missing_rof')).toBe(0);
    expect(after.totals.issues).toBe(36);
  });
});
