import { describe, expect, it } from 'vitest';

import { LIMIAR_TIER_COLORS, trackingToneFromLabel, weaponRollTone, chatRollTone } from '../../../src/ui/view/constants.js';

describe('ui/view/constants', () => {
  describe('weaponRollTone', () => {
    it('tags Melee Weapon / Martial Arts skills as melee', () => {
      expect(weaponRollTone({ skill: 'Melee Weapon' })).toMatchObject({ key: 'melee', label: 'MELEE' });
      expect(weaponRollTone({ skill: 'Martial Arts' })).toMatchObject({ key: 'melee' });
    });
    it('falls back to weaponType keyword matching when skill is absent', () => {
      expect(weaponRollTone({ weaponType: 'Heavy Melee Weapon' })).toMatchObject({ key: 'melee' });
    });
    it('tags Brawling as brawl', () => {
      expect(weaponRollTone({ skill: 'Brawling' })).toMatchObject({ key: 'brawl', label: 'BRAWL' });
    });
    it('tags Handgun / pistol / smg as handgun', () => {
      expect(weaponRollTone({ skill: 'Handgun' })).toMatchObject({ key: 'handgun' });
      expect(weaponRollTone({ weaponClass: 'SMG' })).toMatchObject({ key: 'handgun' });
    });
    it('tags Shoulder Arms / Archery / rifle / shotgun / bow as ranged', () => {
      expect(weaponRollTone({ skill: 'Shoulder Arms' })).toMatchObject({ key: 'ranged' });
      expect(weaponRollTone({ skill: 'Archery' })).toMatchObject({ key: 'ranged' });
    });
    it('tags Heavy Weapons / launcher as heavy', () => {
      expect(weaponRollTone({ skill: 'Heavy Weapons' })).toMatchObject({ key: 'heavy' });
    });
    it('tags Autofire as auto', () => {
      expect(weaponRollTone({ skill: 'Autofire' })).toMatchObject({ key: 'auto' });
    });
    it('defaults to weapon for anything else', () => {
      expect(weaponRollTone({ skill: 'Persuasion' })).toMatchObject({ key: 'weapon', label: 'WEAPON' });
      expect(weaponRollTone(null)).toMatchObject({ key: 'weapon' });
    });
  });

  describe('trackingToneFromLabel', () => {
    it('resolves an exact known label', () => {
      expect(trackingToneFromLabel('MELEE')).toMatchObject({ label: 'MELEE' });
      expect(trackingToneFromLabel('handgun')).toMatchObject({ label: 'HANDGUN' });
    });
    it('infers tone from row source text when the label is unknown', () => {
      expect(trackingToneFromLabel('', [{ source: 'Wolvers' }])).toMatchObject({ label: 'MELEE' });
      expect(trackingToneFromLabel('', [{ source: 'Big Knucks' }])).toMatchObject({ label: 'BRAWL' });
      expect(trackingToneFromLabel('', [{ source: 'Gorilla Arms' }])).toMatchObject({ label: 'BRAWL' });
    });
    it('defaults to WEAPON when nothing matches', () => {
      expect(trackingToneFromLabel('', [])).toMatchObject({ label: 'WEAPON' });
    });
  });

  describe('chatRollTone', () => {
    it('colors a GM test request distinctly, independent of any roll payload', () => {
      expect(chatRollTone({ kind: 'request' })).toMatchObject({ color: '#ff9f43' });
    });
    it('classifies a roll by weapon/skill keywords in its label', () => {
      expect(chatRollTone({ kind: 'roll', roll: { label: 'MIRA :: MONO-KATANA ATAQUE' } })).toMatchObject({ color: '#b56cff' });
      expect(chatRollTone({ kind: 'roll', roll: { label: 'ROOK :: BIG KNUCKS ATAQUE' } })).toMatchObject({ color: '#e06b4f' });
      expect(chatRollTone({ kind: 'roll', roll: { label: 'MIRA :: SMART PISTOL "LULLABY" ATAQUE' } })).toMatchObject({ color: '#d6aa4e' });
      expect(chatRollTone({ kind: 'roll', roll: { label: 'VESPER :: SHOTGUN ATAQUE' } })).toMatchObject({ color: '#4fb7ff' });
    });
    it('gives non-weapon skill checks their own test tone, distinct from combat tones', () => {
      expect(chatRollTone({ kind: 'roll', roll: { label: 'SABLE :: CONCENTRATION' } })).toMatchObject({ color: '#8aa6ff' });
    });
    it('gives initiative rolls their own tone', () => {
      expect(chatRollTone({ kind: 'roll', roll: { label: 'INICIATIVA' } })).toMatchObject({ color: '#f0ead8' });
    });
    it('returns null for plain text messages, leaving identity color in charge', () => {
      expect(chatRollTone({ kind: 'text' })).toBeNull();
      expect(chatRollTone(null)).toBeNull();
    });
  });

  it('LIMIAR_TIER_COLORS maps every cost category to a color', () => {
    expect(LIMIAR_TIER_COLORS.Premium).toBe('#d6aa4e');
    expect(LIMIAR_TIER_COLORS['Very Expensive']).toBe('#b388ff');
  });
});
