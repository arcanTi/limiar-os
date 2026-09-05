import { describe, it, expect } from 'vitest';
import { buildCharacterSheetPdf, characterSheetFileName } from '../../../src/domain/character/characterSheetPdf.ts';

function decode(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

const character = {
  id: 'rook-pc',
  name: 'ROOK',
  role: 'SOLO',
  level: 3,
  base: { INT: 6, REF: 7, DEX: 5, TECH: 4, COOL: 6, WILL: 5, LUCK: 6, MOVE: 6, BODY: 7, EMP: 4 },
  health: { cur: 28, max: 40 },
  derived: { hpMax: 40, seriouslyWounded: 20, deathSave: 7, humanityCurrent: 38, humanityMax: 40, currentHeadSp: 11, currentBodySp: 11 },
  skills: [
    { name: 'Brawling', stat: 'DEX', level: 4, total: 9 },
    { name: 'Concentration', stat: 'WILL', level: 2, total: 7 },
  ],
  gear: [{ name: 'Heavy Pistol', type: 'WEAPON', qty: 1, dmg: '3d6', notes: 'Excelente' }],
  credits: 12000,
  ip: 45,
  story: 'ORIGEM:\nNight City',
};

function parse(pdf: string) {
  const offsets = [...pdf.matchAll(/^(\d+) 0 obj$/gm)].map((m) => ({ n: Number(m[1]), at: m.index || 0 }));
  const startxref = Number((/startxref\n(\d+)/.exec(pdf) || [])[1]);
  const rows = [...pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  return { offsets, rows };
}

describe('buildCharacterSheetPdf', () => {
  it('emits a structurally valid PDF whose xref offsets point at their objects', () => {
    const pdf = decode(buildCharacterSheetPdf({ character, owner: 'rook', campaign: 'Alpha' }));
    expect(pdf.startsWith('%PDF-1.7')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);

    const { offsets, rows } = parse(pdf);
    expect(rows.length).toBe(offsets.length);
    // Every xref entry must land exactly on its own "N 0 obj" header, which is
    // what a reader follows; a byte off and the document fails to open.
    rows.forEach((offset, index) => {
      expect(pdf.slice(offset, offset + String(index + 1).length + 6)).toBe(`${index + 1} 0 obj`);
    });
  });

  it('declares every stream length as the real byte count', () => {
    const pdf = decode(buildCharacterSheetPdf({ character }));
    const streams = [...pdf.matchAll(/\/Length (\d+) >>\nstream\n/g)];
    expect(streams.length).toBeGreaterThan(0);
    streams.forEach((match) => {
      const start = (match.index || 0) + match[0].length;
      const declared = Number(match[1]);
      expect(pdf.slice(start + declared, start + declared + 9)).toBe('endstream');
    });
  });

  it('writes the character values as fillable text fields', () => {
    const pdf = decode(buildCharacterSheetPdf({ character, owner: 'rook', campaign: 'Alpha' }));
    expect(pdf).toContain('/AcroForm');
    expect(pdf).toContain('/T (identity.name) /V (ROOK)');
    expect(pdf).toContain('/T (stat.BODY) /V (7)');
    expect(pdf).toContain('/T (state.hp) /V (28)');
    expect(pdf).toContain('/T (identity.campaign) /V (Alpha)');
    expect(pdf).toContain('/T (skill.0.brawling) /V (4)');
    // Multi-line note fields carry the multiline flag, or a reader collapses
    // the story onto one clipped line.
    expect(/\/T \(notes\.story\)[^>]*\/Ff 4096/.test(pdf)).toBe(true);
  });

  it('transliterates characters the base-14 fonts cannot encode', () => {
    const pdf = decode(buildCharacterSheetPdf({ character: { ...character, name: 'MAIARA — 東京' } }));
    expect(pdf).toContain('/V (MAIARA - ??)');
  });

  it('escapes parentheses and backslashes instead of breaking the string syntax', () => {
    const pdf = decode(buildCharacterSheetPdf({ character: { ...character, name: 'V (the\\one)' } }));
    expect(pdf).toContain('/V (V \\(the\\\\one\\))');
  });

  it('paginates a full CPR skill list instead of overflowing one page', () => {
    const many = Array.from({ length: 80 }, (_, index) => ({
      name: `Skill ${index}`, stat: 'INT', level: 1, total: 5,
    }));
    const pdf = decode(buildCharacterSheetPdf({ character: { ...character, skills: many } }));
    expect(/\/Type \/Pages \/Count 4/.test(pdf)).toBe(true);
    expect(pdf).toContain('HABILIDADES \\(2/2\\)');
  });

  it('names the download after the character', () => {
    expect(characterSheetFileName({ name: 'Rook Vega' })).toBe('ficha-rook-vega.pdf');
    expect(characterSheetFileName({})).toBe('ficha-operativo.pdf');
  });
});
