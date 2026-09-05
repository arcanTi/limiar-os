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
  gear: [{ name: 'Heavy Pistol', type: 'WEAPON', qty: 1, dmg: '3d6', magazine: 8, currentAmmo: 5, notes: 'Excelente' }],
  armor: { head: { name: 'Light Armorjack', sp: 11, penalty: 0 }, body: { name: 'Light Armorjack', sp: 11, penalty: 0 } },
  cyberware: [{ name: 'Kerenzikov', marketCat: 'NEURAL', hcost: 14, desc: '+2 em Initiative Rolls' }],
  programs: [{ name: 'Sword', class: 'attacker', rez: 0, maxRez: 0, state: 'rezzed', effect: '3d6 REZ' }],
  criticalInjuries: [{ name_pt: 'Costelas quebradas', location: 'body', treated: false, source: 'combate' }],
  statusEffects: [{ label_pt: 'Atordoado', source: 'combate', remaining: { value: 2, unit: 'round' } }],
  credits: 12000,
  ip: 45,
  story: 'ORIGEM:\nNight City',
  notes: 'Deve favores ao fixer.',
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
    expect(/\/Type \/Pages \/Count 5/.test(pdf)).toBe(true);
    expect(pdf).toContain('HABILIDADES \\(2/2\\)');
  });

  it('exports the damage and ammunition of every inventory row', () => {
    const pdf = decode(buildCharacterSheetPdf({ character }));
    expect(pdf).toContain('/T (gear.0.name) /V (Heavy Pistol)');
    expect(pdf).toContain('/T (gear.0.dmg) /V (3d6)');
    expect(pdf).toContain('/T (gear.0.ammo) /V (5/8)');
  });

  it('exports armour, chrome, programs and conditions the sheet carries', () => {
    const pdf = decode(buildCharacterSheetPdf({ character }));
    expect(pdf).toContain('/T (armor.head.name) /V (Light Armorjack)');
    expect(pdf).toContain('/T (armor.body.sp) /V (11)');
    expect(pdf).toContain('/T (cyber.0.name) /V (Kerenzikov)');
    expect(pdf).toContain('/T (cyber.0.hum) /V (14)');
    expect(pdf).toContain('/T (program.0.name) /V (Sword)');
    expect(pdf).toContain('/T (injury.0.name) /V (Costelas quebradas)');
    expect(pdf).toContain('/T (status.0.name) /V (Atordoado)');
  });

  it('keeps both the story and the notes tab instead of exporting only one', () => {
    const pdf = decode(buildCharacterSheetPdf({ character }));
    expect(pdf).toContain('/T (notes.story) /V (ORIGEM:\\nNight City\\n\\nDeve favores ao fixer.)');
  });

  it('wraps a long note over several appearance lines instead of clipping it', () => {
    const long = 'palavra '.repeat(60).trim();
    const pdf = decode(buildCharacterSheetPdf({ character: { ...character, story: long, notes: '' } }));
    // The appearance stream is what non-interactive viewers print; a single
    // Tm line there means the paragraph ran off the right edge of the box.
    const streams = [...pdf.matchAll(/\/Tx BMC q BT 0 g \/Helv [\d.]+ Tf\n((?:1 0 0 1 3 [^\n]*\n)+)ET Q EMC/g)];
    const noteLines = streams
      .map((match) => match[1].trimEnd().split('\n'))
      .filter((lines) => lines.some((entry) => entry.includes('palavra')));
    expect(noteLines.length).toBe(1);
    expect(noteLines[0].length).toBeGreaterThan(3);
  });

  it('grows the inventory table past one page instead of dropping rows', () => {
    const many = Array.from({ length: 70 }, (_, index) => ({ name: `Item ${index}`, type: 'GEAR', qty: 1 }));
    const pdf = decode(buildCharacterSheetPdf({ character: { ...character, gear: many } }));
    expect(pdf).toContain('/T (gear.69.name) /V (Item 69)');
    expect(pdf).toContain('EQUIPAMENTO \\(CONT.\\)');
  });

  it('names the download after the character', () => {
    expect(characterSheetFileName({ name: 'Rook Vega' })).toBe('ficha-rook-vega.pdf');
    expect(characterSheetFileName({})).toBe('ficha-operativo.pdf');
  });
});
