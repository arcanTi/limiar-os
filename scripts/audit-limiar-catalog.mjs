#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCatalogAudit } from '../frontend/src/domain/items/catalogAuditEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SEED_PATH = path.join(ROOT, 'data/seed/limiar-seed.json');
const CANONICAL_PATH = path.join(ROOT, 'data/canonical/cpr-canonical-rules.json');
const REPORT_PATH = path.join(ROOT, 'data/audit/limiar-catalog-audit.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n');
}

function printSummary(report) {
  const { totals } = report;
  console.log('Limiar catalog audit');
  console.log(`Source: ${report.source}`);
  console.log(`Canonical rules: ${report.canonicalRules}`);
  console.log(`Report: ${report.report}`);
  console.log(`Catalog rows: ${totals.collections.items} items, ${totals.collections.gear} gear, ${totals.collections.characters} characters`);
  console.log(`Issues: ${totals.issues}`);
  console.log('');
  console.log('By severity:');
  Object.entries(totals.bySeverity).sort().forEach(([severity, count]) => {
    console.log(`  ${severity}: ${count}`);
  });
  console.log('');
  console.log('By type:');
  Object.entries(totals.byType).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  console.log('');
  console.log('Top examples:');
  report.issues.slice(0, 12).forEach(issue => {
    const ref = issue.code ? `${issue.code} ` : '';
    console.log(`  [${issue.severity}] ${issue.type}: ${ref}${issue.name || ''} (${issue.path})`);
  });
}

const report = runCatalogAudit({
  seed: readJson(SEED_PATH),
  canonicalRules: readJson(CANONICAL_PATH),
  source: path.relative(ROOT, SEED_PATH),
  canonicalRulesPath: path.relative(ROOT, CANONICAL_PATH),
  reportPath: path.relative(ROOT, REPORT_PATH),
});

writeJson(REPORT_PATH, report);
printSummary(report);
