import { describe, expect, it } from 'vitest';

import { catalogLabel, describeInstallIssue, installBlockText } from '../../../src/domain/items/installBlockText.ts';

const CATALOG = [
  { code: 'CYBERARM', name: 'Cyberarm' },
  { code: 'NEURAL-LINK', name: 'Neural Link' },
];

const issue = (type, evidence) => ({ severity: 'error', type, message: 'Engine says something in English.', evidence });

describe('domain/items/installBlockText', () => {
  it('names the missing implant instead of repeating the engine sentence', () => {
    const line = describeInstallIssue(issue('required_cyberware_missing', { requiredCode: 'NEURAL-LINK' }), CATALOG);
    expect(line).toBe('precisa de Neural Link instalado antes');
  });

  it('falls back to the code when the catalog has no row for it', () => {
    expect(catalogLabel(CATALOG, 'MYSTERY-CHIP')).toBe('MYSTERY-CHIP');
    expect(describeInstallIssue(issue('required_cyberware_missing', { requiredCode: 'MYSTERY-CHIP' }), CATALOG))
      .toContain('MYSTERY-CHIP');
  });

  it('says how many are needed and how many are installed', () => {
    expect(describeInstallIssue(issue('required_cyberware_count_missing', { requiredCode: 'CYBERARM', requiredCount: 2, count: 1 }), CATALOG))
      .toBe('precisa de 2x Cyberarm instalado (voce tem 1)');
  });

  it('turns a stat requirement into the number the player has to reach', () => {
    expect(describeInstallIssue(issue('required_stat_missing', { stat: 'BODY', min: 8, value: 5 }), CATALOG))
      .toBe('precisa de BODY 8 (voce tem 5)');
  });

  it('explains a full slot pool with the pool that is full', () => {
    expect(describeInstallIssue(issue('slot_capacity_exceeded', { poolId: 'internal', capacity: 7, used: 8 }), CATALOG))
      .toBe('nao ha espaco livre em internal: 7 slot(s) ja ocupado(s)');
  });

  it('keeps the engine message for a rule with no player-facing wording yet', () => {
    expect(describeInstallIssue(issue('weapon_missing_rof', {}), CATALOG)).toBe('Engine says something in English.');
  });

  it('joins every reason once, dropping repeats from paired instances', () => {
    const issues = [
      issue('required_cyberware_missing', { requiredCode: 'CYBERARM' }),
      issue('required_cyberware_missing', { requiredCode: 'CYBERARM' }),
      issue('required_stat_missing', { stat: 'BODY', min: 8, value: 5 }),
    ];
    expect(installBlockText(issues, CATALOG))
      .toBe('precisa de Cyberarm instalado antes; precisa de BODY 8 (voce tem 5)');
  });

  it('survives an empty list and a missing catalog', () => {
    expect(installBlockText([], CATALOG)).toBe('');
    expect(installBlockText(null)).toBe('');
    expect(describeInstallIssue(issue('required_cyberware_missing', {}))).toBe('precisa de outro implante instalado antes');
  });
});
