import { describe, expect, it } from 'vitest';

import {
  armorPenalty,
  cpredStatMax,
  normalizeArmor,
  normalizeHqIp,
  normalizeSkills,
  normalizeShield,
  normalizeSpDamage,
  normalizeStats,
  parseGearDamage,
  damageShield,
  repairShield,
  skillCanonicalName,
  skillSpend,
} from '../../../src/domain/character/index.ts';

describe('domain/character', () => {
  it('normalizes stats with defaults, aliases and clamps', () => {
    expect(normalizeStats({ REF: 9, DEX: undefined, COOL: 7, WILL: undefined, BODY: 99, EMP: -4 })).toMatchObject({
      REF: 9,
      DEX: 9,
      COOL: 7,
      WILL: 7,
      BODY: 20,
      EMP: 0,
      MOVE: 6,
    });
  });

  it('normalizes HQ IP payloads defensively', () => {
    expect(normalizeHqIp({ ip: '42', log: [{ id: 'entry' }] })).toEqual({ ip: 42, log: [{ id: 'entry' }] });
    expect(normalizeHqIp({ ip: -3, log: 'bad' })).toEqual({ ip: 0, log: [] });
  });

  it('normalizes armor and reports the active armor penalty', () => {
    const armor = normalizeArmor({
      head: { name: 'Helmet', sp: '13', penalty: 1 },
      body: { name: 'Metalgear', sp: 18, penalty: 4 },
    });

    expect(armor).toEqual({
      head: { name: 'Helmet', sp: 13, penalty: 1 },
      body: { name: 'Metalgear', sp: 18, penalty: 4 },
    });
    expect(armorPenalty({ armor })).toBe(4);
  });

  it('normalizes shield HP and keeps it separate from armor SP', () => {
    expect(normalizeShield({ itemId: 'BULLETPROOF-SHIELD', hp: '12', maxHp: 10 })).toEqual({
      itemId: 'BULLETPROOF-SHIELD',
      hp: 10,
      maxHp: 10,
    });
    expect(normalizeShield({ itemId: '', hp: 10, maxHp: 10 })).toBeNull();
    expect(normalizeShield({ itemId: 'BROKEN', hp: 5, maxHp: 0 })).toBeNull();
  });

  it('degrades shields to destroyed and repairs them up to max HP', () => {
    const shield = { itemId: 'BULLETPROOF-SHIELD', hp: 4, maxHp: 10 };
    expect(damageShield(shield, 2)).toEqual({ itemId: 'BULLETPROOF-SHIELD', hp: 2, maxHp: 10 });
    expect(damageShield(shield, 99)).toEqual({ itemId: 'BULLETPROOF-SHIELD', hp: 0, maxHp: 10 });
    expect(repairShield({ ...shield, hp: 0 }, 7)).toEqual({ itemId: 'BULLETPROOF-SHIELD', hp: 7, maxHp: 10 });
    expect(repairShield(shield, 99)).toEqual({ itemId: 'BULLETPROOF-SHIELD', hp: 10, maxHp: 10 });
  });

  it('parses gear damage notation with modifier clamps', () => {
    expect(parseGearDamage('3d6+2')).toEqual({ count: 3, sides: 6, mod: 2 });
    expect(parseGearDamage('99d1000-120')).toEqual({ count: 20, sides: 100, mod: -99 });
    expect(parseGearDamage('knife')).toBeNull();
  });

  it('normalizes skills with aliases, defaults, totals and difficult spend', () => {
    expect(skillCanonicalName('Melee Weapons')).toBe('Melee Weapon');
    const stats = normalizeStats({ DEX: 8, REF: 7, INT: 6 });
    const skills = normalizeSkills([
      { name: 'Melee Weapons', level: 5, bonus: 1 },
      { name: 'Autofire', level: 4, difficult: true },
      { name: 'Perception', level: 1 },
    ], stats);

    expect(skills.find(s => s.name === 'Melee Weapon')).toMatchObject({ level: 5, bonus: 1, total: 14 });
    expect(skills.find(s => s.name === 'Autofire')).toMatchObject({ level: 4, difficult: true, total: 11 });
    expect(skills.find(s => s.name === 'Perception')).toMatchObject({ level: 2, defaultSkill: true, total: 8 });
    expect(skillSpend(skills)).toBeGreaterThan(0);
  });

  it('normalizes SP damage and exposes stat caps', () => {
    expect(normalizeSpDamage({ head: 4, body: '7' })).toEqual({ head: 4, body: 7 });
    expect(cpredStatMax('LUCK')).toBe(10);
    expect(cpredStatMax('BODY')).toBe(8);
  });
});
