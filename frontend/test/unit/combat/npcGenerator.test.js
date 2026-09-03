import { describe, expect, it } from 'vitest';

import seed from '../../../../data/seed/limiar-seed.json';
import {
  NPC_ARCHETYPES,
  NPC_TIERS,
  NPC_TIER_CHOICES,
  NPC_WEAPON_SPECS,
  NPC_ARMOR_SPECS,
  NPC_GROUP_MAX,
  seededRng,
  weightedPick,
  brawlingDiceForBody,
  npcHpMax,
  generateNpc,
  generateNpcGroup,
  resolveTierMix,
  npcDraftFromGenerated,
  npcAttackRowToGearItem,
  npcGearFromAttackRows,
  npcStatLine,
} from '../../../src/domain/combat/npcGenerator.ts';
import { CPRED_STAT_ORDER } from '../../../src/domain/character/constants.ts';
import skillRows from '../../../../data/seed/skills.json';

const SKILL_NAMES = new Set(skillRows.map(row => row[0]));
const seedByCode = new Map(seed.items.map(item => [item.code, item]));

describe('domain/combat npcGenerator :: catalog slices', () => {
  it('every catalog weapon spec matches the seed damage, skill, ROF and magazine', () => {
    Object.values(NPC_WEAPON_SPECS).filter(spec => spec.catalog).forEach((spec) => {
      const item = seedByCode.get(spec.code);
      expect(item, spec.code).toBeTruthy();
      expect(item.damage).toBe(spec.dmg);
      expect(item.weaponSkill).toBe(spec.skill);
      expect(item.rof).toBe(spec.rof);
      expect(item.magazine ?? null).toBe(spec.magazine);
      if (spec.autofire) expect(item.autofire).toMatchObject({ enabled: true, multiplier: spec.autofire });
      else expect(item.autofire || null).toBeNull();
    });
  });

  it('every catalog armor spec matches the seed SP and penalty', () => {
    Object.values(NPC_ARMOR_SPECS).filter(spec => spec.catalog).forEach((spec) => {
      const item = seedByCode.get(spec.code);
      expect(item, spec.code).toBeTruthy();
      expect(item.armor.bodySP).toBe(spec.sp);
      expect(item.armor.headSP).toBe(spec.sp);
      expect(Math.abs(item.armor.armorPenalty.REF)).toBe(spec.penalty);
    });
  });

  it('archetype pools only reference known weapon/armor codes and known skills', () => {
    NPC_ARCHETYPES.forEach((a) => {
      a.primaryWeapons.concat(a.secondaryWeapons).forEach(row => expect(NPC_WEAPON_SPECS[row.code], a.id + ' ' + row.code).toBeTruthy());
      a.armorLadder.forEach(code => expect(NPC_ARMOR_SPECS[code], a.id + ' ' + code).toBeTruthy());
      a.supportSkills.forEach(name => expect(SKILL_NAMES.has(name), a.id + ' ' + name).toBe(true));
      expect(a.callsigns.length).toBeGreaterThanOrEqual(8);
      CPRED_STAT_ORDER.forEach(stat => expect(typeof a.stats[stat]).toBe('number'));
    });
    Object.values(NPC_WEAPON_SPECS).forEach(spec => expect(SKILL_NAMES.has(spec.skill), spec.code).toBe(true));
  });

  it('tiers escalate monotonically and the UI choice list adds "misto"', () => {
    for (let i = 1; i < NPC_TIERS.length; i++) {
      expect(NPC_TIERS[i].skillLevel).toBeGreaterThan(NPC_TIERS[i - 1].skillLevel);
      expect(NPC_TIERS[i].statBonus).toBeGreaterThanOrEqual(NPC_TIERS[i - 1].statBonus);
      expect(NPC_TIERS[i].armorShift).toBeGreaterThan(NPC_TIERS[i - 1].armorShift);
    }
    expect(NPC_TIER_CHOICES.map(t => t.id)).toEqual(['base', 'veterano', 'elite', 'chefe', 'misto']);
  });
});

describe('domain/combat npcGenerator :: rng helpers', () => {
  it('seededRng is deterministic per seed and stays in [0, 1)', () => {
    const a = seededRng('esquadrao-7');
    const b = seededRng('esquadrao-7');
    const c = seededRng('esquadrao-8');
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    const seqC = Array.from({ length: 20 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    seqA.forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); });
  });

  it('weightedPick honours weights and the exclusion set', () => {
    const rows = [{ code: 'A', weight: 90 }, { code: 'B', weight: 10 }];
    expect(weightedPick(rows, () => 0.5)).toBe('A');
    expect(weightedPick(rows, () => 0.95)).toBe('B');
    expect(weightedPick(rows, () => 0.1, new Set(['A']))).toBe('B');
    expect(weightedPick(rows, () => 0.1, new Set(['A', 'B']))).toBeNull();
  });

  it('brawlingDiceForBody follows the CPR BODY steps', () => {
    expect(brawlingDiceForBody(4)).toBe('1d6');
    expect(brawlingDiceForBody(6)).toBe('2d6');
    expect(brawlingDiceForBody(10)).toBe('3d6');
    expect(brawlingDiceForBody(11)).toBe('4d6');
  });

  it('npcHpMax is the RAW formula plus the tier bonus', () => {
    expect(npcHpMax({ BODY: 6, WILL: 3 })).toBe(35);
    expect(npcHpMax({ BODY: 7, WILL: 5 })).toBe(40);
    expect(npcHpMax({ BODY: 7, WILL: 5 }, 10)).toBe(50);
  });
});

describe('domain/combat npcGenerator :: generateNpc', () => {
  it('rolls a complete, self-consistent NPC for every archetype x tier', () => {
    NPC_ARCHETYPES.forEach((a) => {
      NPC_TIERS.forEach((t) => {
        const npc = generateNpc({ archetype: a.id, tier: t.id, seed: a.id + ':' + t.id });
        expect(npc.archetype).toBe(a.id);
        expect(npc.tier).toBe(t.id);
        expect(npc.name).toContain(a.label);
        CPRED_STAT_ORDER.forEach(stat => {
          expect(npc.stats[stat]).toBeGreaterThanOrEqual(0);
          expect(npc.stats[stat]).toBeLessThanOrEqual(10);
        });
        expect(npc.hpMax).toBe(npcHpMax(npc.stats, t.hpBonus));
        expect(npc.attacks.length).toBeGreaterThan(0);
        expect(npc.weapons.length).toBe(npc.attacks.length);
        expect(npc.armor.head.sp).toBe(npc.armor.body.sp);
        expect(NPC_ARMOR_SPECS[npc.armor.code]).toBeTruthy();
        expect(npc.tags).toContain(t.id);
        expect(npc.tags).toContain(a.id);
        expect(npc.bodyType).toBe(a.bodyType);
        // Every weapon skill the NPC swings with is on its sheet at the tier level.
        npc.weapons.forEach(w => {
          const row = npc.skills.find(s => s.name === w.skill);
          expect(row, a.id + '/' + t.id + ' ' + w.skill).toBeTruthy();
          expect(row.level).toBe(t.skillLevel);
        });
        npc.skills.forEach(s => expect(SKILL_NAMES.has(s.name), s.name).toBe(true));
      });
    });
  });

  it('is reproducible from a seed and varies across seeds', () => {
    const a = generateNpc({ archetype: 'ganger', tier: 'veterano', seed: 42 });
    const b = generateNpc({ archetype: 'ganger', tier: 'veterano', seed: 42 });
    expect(a).toEqual(b);
    const names = new Set(Array.from({ length: 12 }, (_, i) => generateNpc({ archetype: 'ganger', tier: 'base', seed: 'n' + i }).name));
    expect(names.size).toBeGreaterThan(3);
  });

  it('tiers stack on top of the archetype baseline: chefe outclasses base', () => {
    const rng = () => 0.5; // no jitter, no armor bump
    const base = generateNpc({ archetype: 'corpsec', tier: 'base', rng });
    const chefe = generateNpc({ archetype: 'corpsec', tier: 'chefe', rng });
    expect(chefe.stats.REF).toBe(base.stats.REF + 3);
    expect(chefe.stats.BODY).toBe(base.stats.BODY + 3);
    expect(chefe.stats.INT).toBe(base.stats.INT);
    expect(chefe.hpMax).toBeGreaterThan(base.hpMax);
    expect(chefe.armor.body.sp).toBeGreaterThan(base.armor.body.sp);
    expect(chefe.weapons.length).toBe(2);
    expect(chefe.name.startsWith('CHEFE ')).toBe(true);
    expect(chefe.stats.LUCK).toBeGreaterThanOrEqual(4);
  });

  it('autofire guns roll Autofire on the attack row and put both skills on the sheet', () => {
    const npc = generateNpc({ archetype: 'corpsec', tier: 'base', rng: () => 0.05 }); // first weighted pick -> Assault Rifle
    const rifle = npc.attacks.find(a => a.code === 'ASSAULT-RIFLE');
    expect(rifle).toBeTruthy();
    expect(rifle.skill).toBe('Autofire');
    expect(rifle.dice).toBe('5d6');
    expect(npc.skills.find(s => s.name === 'Autofire').level).toBe(4);
    expect(npc.skills.find(s => s.name === 'Shoulder Arms').level).toBe(4);
  });

  it('civilians can be unarmed and then fall back to a Brawling row sized by BODY', () => {
    const npc = generateNpc({ archetype: 'civil', tier: 'base', rng: () => 0.3 });
    expect(npc.weapons).toHaveLength(1);
    expect(npc.weapons[0].code).toBe('BRAWLING');
    expect(npc.attacks[0]).toMatchObject({ skill: 'Brawling', dice: brawlingDiceForBody(npc.stats.BODY) });
    // Elites are never caught unarmed regardless of the archetype chance.
    const elite = generateNpc({ archetype: 'civil', tier: 'elite', rng: () => 0.3 });
    expect(elite.weapons[0].code).not.toBe('BRAWLING');
  });

  it('drones are inorganic and use chassis plating instead of catalog armor', () => {
    const npc = generateNpc({ archetype: 'drone', tier: 'elite', seed: 'drone' });
    expect(npc.bodyType).toBe('drone');
    expect(npc.armor.code.startsWith('DRONE-PLATING')).toBe(true);
    expect(npc.tags).toContain('inorganico');
  });

  it('faction lands in the tags (slugged) and in the notes, never in the name', () => {
    const npc = generateNpc({ archetype: 'guarda', tier: 'base', faction: 'Arasaka Sec', seed: 1 });
    expect(npc.faction).toBe('ARASAKA SEC');
    expect(npc.tags).toContain('arasaka-sec');
    expect(npc.notes).toContain('ARASAKA SEC');
    expect(npc.name).not.toContain('ARASAKA');
  });

  it('falls back to guarda/base for unknown ids', () => {
    const npc = generateNpc({ archetype: 'nope', tier: 'lol', seed: 'x' });
    expect(npc.archetype).toBe('guarda');
    expect(npc.tier).toBe('base');
  });
});

describe('domain/combat npcGenerator :: groups', () => {
  it('resolveTierMix repeats a fixed tier and builds leader+mooks for misto', () => {
    expect(resolveTierMix('elite', 3, () => 0.5)).toEqual(['elite', 'elite', 'elite']);
    expect(resolveTierMix('misto', 1, () => 0.5)).toEqual(['base']);
    expect(resolveTierMix('misto', 3, () => 0.5)).toEqual(['veterano', 'base', 'base']);
    expect(resolveTierMix('misto', 5, () => 0.1)).toEqual(['elite', 'veterano', 'veterano', 'veterano', 'veterano']);
    expect(resolveTierMix('misto', 500, () => 0.9)).toHaveLength(NPC_GROUP_MAX);
  });

  it('generateNpcGroup gives every member a unique name and replays from a seed', () => {
    const squad = generateNpcGroup({ archetype: 'ganger', tier: 'misto', qty: 6, seed: 'beco-13' });
    expect(squad).toHaveLength(6);
    expect(new Set(squad.map(n => n.name)).size).toBe(6);
    expect(squad[0].tier).toBe('elite');
    expect(squad.slice(1).every(n => n.tier === 'base' || n.tier === 'veterano')).toBe(true);
    expect(squad.map(n => n.seed)).toEqual(['beco-13#1', 'beco-13#2', 'beco-13#3', 'beco-13#4', 'beco-13#5', 'beco-13#6']);
    expect(generateNpcGroup({ archetype: 'ganger', tier: 'misto', qty: 6, seed: 'beco-13' })).toEqual(squad);
  });

  it('numbers callsigns once the archetype pool is exhausted', () => {
    const big = generateNpcGroup({ archetype: 'drone', tier: 'base', qty: NPC_GROUP_MAX, seed: 'swarm' });
    expect(new Set(big.map(n => n.name)).size).toBe(NPC_GROUP_MAX);
  });
});

describe('domain/combat npcGenerator :: builder bridges', () => {
  it('npcDraftFromGenerated seeds the editable draft plus the generated payload', () => {
    const npc = generateNpc({ archetype: 'policial', tier: 'veterano', seed: 'ncpd' });
    const draft = npcDraftFromGenerated(npc, '3');
    expect(draft).toMatchObject({ name: npc.name, body: String(npc.stats.BODY), ref: String(npc.stats.REF), hpMax: String(npc.hpMax), headSp: String(npc.armor.head.sp), bodySp: String(npc.armor.body.sp), qty: '3', templateId: '', bodyType: 'meat' });
    expect(draft.attackRows).toEqual(npc.attacks);
    expect(draft.generated.tags).toEqual(npc.tags);
    expect(draft.generated.stats).toEqual(npc.stats);
    expect(draft.generated.armor.body.name).toBe(npc.armor.body.name);
    // Copies, not references: editing the draft must not mutate the roll.
    draft.attackRows[0].name = 'x';
    expect(npc.attacks[0].name).not.toBe('x');
  });

  it('npcAttackRowToGearItem keeps the catalog profile for coded rows and degrades for typed rows', () => {
    const smg = npcAttackRowToGearItem({ name: 'SMG', dice: '2d6', skill: 'Autofire', code: 'SMG' }, 0);
    expect(smg).toMatchObject({ code: 'SMG', type: 'WEAPON - SMG', weaponClass: 'SMG', skill: 'Autofire', dmg: '2d6', count: 2, sides: 6, mod: 0, rof: 1, mag: 30, magazine: 30, ammoType: 'M Pistol', hands: 1, equipped: true, source: 'npc' });
    expect(smg.autofire).toEqual({ enabled: true, multiplier: 3 });

    const typed = npcAttackRowToGearItem({ name: 'Taco', dice: '2d6+1', skill: 'Melee Weapon' }, 1);
    expect(typed).toMatchObject({ code: '', type: 'WEAPON - NPC', weaponClass: 'NPC', dmg: '2d6+1', count: 2, sides: 6, mod: 1 });
    expect(typed.autofire).toBeUndefined();

    expect(npcAttackRowToGearItem({ name: '   ', dice: '2d6' }, 2)).toBeNull();
  });

  it('npcGearFromAttackRows skips blank rows and numbers ids by position', () => {
    const gear = npcGearFromAttackRows([{ name: 'Heavy Pistol', dice: '3d6', skill: 'Handgun', code: 'HEAVY-PISTOL' }, { name: '' }, { name: 'Faca', dice: '1d6', skill: 'Melee Weapon' }]);
    expect(gear.map(g => g.name)).toEqual(['Heavy Pistol', 'Faca']);
    expect(gear[0].id).toBe('npc-atk-0-heavy-pistol');
    expect(gear[1].id).toBe('npc-atk-2-faca');
  });

  it('npcStatLine prints the ten STATs in canonical order', () => {
    const line = npcStatLine({ INT: 3, REF: 6, DEX: 6, TECH: 2, COOL: 3, WILL: 3, LUCK: 0, MOVE: 5, BODY: 6, EMP: 3 });
    expect(line).toBe('INT 3 · REF 6 · DEX 6 · TECH 2 · COOL 3 · WILL 3 · LUCK 0 · MOVE 5 · BODY 6 · EMP 3');
    expect(npcStatLine(null)).toBe('');
  });
});
