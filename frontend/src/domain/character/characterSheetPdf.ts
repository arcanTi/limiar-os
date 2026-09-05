/**
 * Build a fillable (AcroForm) PDF of a character sheet, with no dependencies.
 *
 * Why hand-rolled: the app is served under `script-src 'self'`, so no CDN can
 * be reached, and the project carries no runtime npm dependencies at all. A
 * PDF with base-14 fonts and text widgets is a small enough format to emit
 * directly (~400 lines) that pulling in a ~300 KB library to do it would cost
 * more than it saves.
 *
 * "Editable" means every number a player touches between sessions — stats, HP,
 * humanity, ammo, eddies, skill levels, notes — is a real form field, so the
 * sheet keeps working offline in any PDF reader. Values are written twice: as
 * the field's /V, and as an /AP appearance stream, because several viewers
 * (Chrome's built-in one included) ignore /NeedAppearances and would otherwise
 * show a sheet full of blanks until each field is clicked.
 */

export interface SheetPdfCharacter {
  id?: string;
  name?: string;
  role?: string;
  level?: number;
  base?: Record<string, unknown>;
  health?: { cur?: number; max?: number };
  derived?: Record<string, unknown>;
  skills?: { name?: string; stat?: string; level?: number; total?: number }[];
  gear?: { name?: string; type?: string; qty?: number; dmg?: string; notes?: string }[];
  credits?: number;
  ip?: number;
  reputation?: number;
  luckCurrent?: number;
  humanityLoss?: number;
  notes?: string;
  story?: string;
  ownerUsername?: string;
  [extra: string]: unknown;
}

export interface SheetPdfInput {
  character: SheetPdfCharacter;
  owner?: string;
  campaign?: string;
  generatedAt?: string;
}

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 34;
const CONTENT_W = PAGE_W - MARGIN * 2;
const STAT_ORDER = ['INT', 'REF', 'DEX', 'TECH', 'COOL', 'WILL', 'LUCK', 'MOVE', 'BODY', 'EMP'];
const SKILL_ROWS_PER_PAGE = 34;
const GEAR_ROWS = 14;

interface FieldSpec {
  name: string;
  value: string;
  x: number;
  y: number;
  w: number;
  h: number;
  multiline?: boolean;
  size?: number;
}

interface PageDraft {
  ops: string[];
  fields: FieldSpec[];
}

// ---------------------------------------------------------------- primitives

/** PDF base-14 fonts speak WinAnsi; anything outside it is transliterated. */
function toWinAnsi(value: unknown): string {
  const text = String(value == null ? '' : value)
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...');
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) || 0;
    if (code === 10 || code === 13) { out += char; continue; }
    if (code >= 32 && code <= 255) { out += char; continue; }
    const folded = char.normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += folded.length === 1 && (folded.codePointAt(0) || 0) < 256 ? folded : '?';
  }
  return out;
}

function esc(value: unknown): string {
  return toWinAnsi(value).replace(/([\\()])/g, '\\$1').replace(/\r?\n/g, '\\n');
}

/** Rough base-14 width so long names can be trimmed instead of overflowing. */
function fits(value: string, size: number, width: number): string {
  const text = toWinAnsi(value);
  const max = Math.max(1, Math.floor(width / (size * 0.5)));
  return text.length <= max ? text : text.slice(0, Math.max(1, max - 1)) + '.';
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function txt(x: number, yTop: number, value: string, size = 9, bold = false): string {
  const font = bold ? '/HelvB' : '/Helv';
  return `BT ${font} ${size} Tf ${x} ${PAGE_H - yTop} Td (${esc(value)}) Tj ET\n`;
}

function rect(x: number, yTop: number, w: number, h: number, gray: number): string {
  return `${gray} g ${x} ${PAGE_H - yTop - h} ${w} ${h} re f\n`;
}

function line(x1: number, yTop: number, x2: number): string {
  const y = PAGE_H - yTop;
  return `0.75 G 0.5 w ${x1} ${y} m ${x2} ${y} l S\n`;
}

// ------------------------------------------------------------------- layout

function sectionTitle(page: PageDraft, yTop: number, label: string): number {
  page.ops.push(rect(MARGIN, yTop - 10, CONTENT_W, 14, 0.88));
  page.ops.push('0 g\n');
  page.ops.push(txt(MARGIN + 5, yTop, label, 9, true));
  return yTop + 16;
}

function labelledField(
  page: PageDraft,
  spec: { label: string; name: string; value: string; x: number; yTop: number; w: number; h?: number; multiline?: boolean },
): void {
  const h = spec.h || 16;
  page.ops.push('0.35 g\n');
  page.ops.push(txt(spec.x, spec.yTop, spec.label, 6.5));
  page.ops.push('0 g\n');
  // Widget borders are only painted by interactive viewers, so the printable
  // rule is drawn into the page itself.
  page.ops.push(line(spec.x, spec.yTop + h + 2, spec.x + spec.w));
  page.fields.push({
    name: spec.name,
    value: spec.value,
    x: spec.x,
    y: spec.yTop + 2,
    w: spec.w,
    h,
    multiline: spec.multiline,
  });
}

function buildIdentityPage(input: SheetPdfInput): PageDraft {
  const page: PageDraft = { ops: [], fields: [] };
  const c = input.character;
  const derived = (c.derived || {}) as Record<string, unknown>;
  const base = (c.base || {}) as Record<string, unknown>;

  page.ops.push(rect(0, 0, PAGE_W, 46, 0.11));
  page.ops.push('1 g\n');
  page.ops.push(txt(MARGIN, 26, 'LIMIAR OS', 15, true));
  page.ops.push(txt(MARGIN + 96, 26, 'FICHA DE OPERATIVO - CYBERPUNK RED', 9));
  page.ops.push('0.7 g\n');
  page.ops.push(txt(MARGIN, 38, `Exportada em ${input.generatedAt || ''}`, 6.5));
  page.ops.push('0 g\n');

  let y = 68;
  y = sectionTitle(page, y, 'IDENTIDADE');
  labelledField(page, { label: 'NOME', name: 'identity.name', value: String(c.name || ''), x: MARGIN, yTop: y, w: 240 });
  labelledField(page, { label: 'PAPEL', name: 'identity.role', value: String(c.role || ''), x: MARGIN + 250, yTop: y, w: 160 });
  labelledField(page, { label: 'NIVEL', name: 'identity.level', value: String(c.level ?? ''), x: MARGIN + 420, yTop: y, w: 107 });
  y += 34;
  labelledField(page, { label: 'JOGADOR', name: 'identity.player', value: input.owner || String(c.ownerUsername || ''), x: MARGIN, yTop: y, w: 240 });
  labelledField(page, { label: 'CAMPANHA', name: 'identity.campaign', value: input.campaign || '', x: MARGIN + 250, yTop: y, w: 277 });
  y += 40;

  y = sectionTitle(page, y, 'ATRIBUTOS');
  const statW = Math.floor((CONTENT_W - 9 * 6) / 10);
  STAT_ORDER.forEach((stat, index) => {
    const x = MARGIN + index * (statW + 6);
    page.ops.push('0.35 g\n');
    page.ops.push(txt(x + 2, y, stat, 7, true));
    page.ops.push('0 g\n');
    page.fields.push({
      name: `stat.${stat}`,
      value: String(num(base[stat], 0)),
      x,
      y: y + 2,
      w: statW,
      h: 22,
      size: 12,
    });
  });
  y += 50;

  y = sectionTitle(page, y, 'ESTADO');
  const health = c.health || {};
  const cells: { label: string; name: string; value: string }[] = [
    { label: 'HP ATUAL', name: 'state.hp', value: String(num(health.cur, 0)) },
    { label: 'HP MAX', name: 'state.hpMax', value: String(num(health.max, num(derived.hpMax, 0))) },
    { label: 'FERIDO GRAVE', name: 'state.seriouslyWounded', value: String(num(derived.seriouslyWounded, 0)) },
    { label: 'DEATH SAVE', name: 'state.deathSave', value: String(num(derived.deathSave, 0)) },
    { label: 'HUMANIDADE', name: 'state.humanity', value: String(num(derived.humanityCurrent, 0)) },
    { label: 'HUM. MAX', name: 'state.humanityMax', value: String(num(derived.humanityMax, 0)) },
    { label: 'SP CABECA', name: 'state.headSp', value: String(num(derived.currentHeadSp, num(derived.headSp, 0))) },
    { label: 'SP CORPO', name: 'state.bodySp', value: String(num(derived.currentBodySp, num(derived.bodySp, 0))) },
    { label: 'SORTE', name: 'state.luck', value: String(num(c.luckCurrent, 0)) },
    { label: 'EDDIES', name: 'state.credits', value: String(num(c.credits, 0)) },
    { label: 'IP', name: 'state.ip', value: String(num(c.ip, 0)) },
    { label: 'REPUTACAO', name: 'state.reputation', value: String(num(c.reputation, 0)) },
  ];
  const cellW = Math.floor((CONTENT_W - 5 * 8) / 6);
  cells.forEach((cell, index) => {
    const col = index % 6;
    const row = Math.floor(index / 6);
    labelledField(page, {
      label: cell.label,
      name: cell.name,
      value: cell.value,
      x: MARGIN + col * (cellW + 8),
      yTop: y + row * 36,
      w: cellW,
    });
  });
  y += 36 * Math.ceil(cells.length / 6) + 12;

  y = sectionTitle(page, y, 'HISTORIA E ANOTACOES');
  page.fields.push({
    name: 'notes.story',
    value: String(c.story || c.notes || ''),
    x: MARGIN,
    y: y + 2,
    w: CONTENT_W,
    h: PAGE_H - MARGIN - (y + 2),
    multiline: true,
  });
  return page;
}

function buildSkillPage(
  skills: SheetPdfCharacter['skills'],
  pageIndex: number,
  pageCount: number,
): PageDraft {
  const page: PageDraft = { ops: [], fields: [] };
  const rows = skills || [];
  let y = sectionTitle(page, MARGIN + 8, pageCount > 1 ? `HABILIDADES (${pageIndex + 1}/${pageCount})` : 'HABILIDADES');
  const colW = Math.floor((CONTENT_W - 16) / 2);
  const rowH = 19;

  page.ops.push('0.35 g\n');
  for (let col = 0; col < 2; col += 1) {
    const x = MARGIN + col * (colW + 16);
    page.ops.push(txt(x, y - 3, 'HABILIDADE', 6.5));
    page.ops.push(txt(x + colW - 96, y - 3, 'STAT', 6.5));
    page.ops.push(txt(x + colW - 62, y - 3, 'NIVEL', 6.5));
    page.ops.push(txt(x + colW - 26, y - 3, 'TOTAL', 6.5));
  }
  page.ops.push('0 g\n');
  y += 4;

  rows.forEach((skill, index) => {
    const col = index < SKILL_ROWS_PER_PAGE ? 0 : 1;
    const row = index % SKILL_ROWS_PER_PAGE;
    const x = MARGIN + col * (colW + 16);
    const rowTop = y + row * rowH;
    page.ops.push(txt(x, rowTop + 11, fits(String(skill.name || ''), 8, colW - 104), 8));
    page.ops.push(txt(x + colW - 96, rowTop + 11, String(skill.stat || ''), 7));
    page.ops.push(line(x, rowTop + 14, x + colW));
    const slug = String(skill.name || index).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    page.fields.push({
      name: `skill.${pageIndex}.${slug}`,
      value: String(num(skill.level, 0)),
      x: x + colW - 64,
      y: rowTop,
      w: 28,
      h: 14,
      size: 8,
    });
    page.fields.push({
      name: `skilltotal.${pageIndex}.${slug}`,
      value: String(num(skill.total, 0)),
      x: x + colW - 30,
      y: rowTop,
      w: 30,
      h: 14,
      size: 8,
    });
  });
  return page;
}

function buildGearPage(character: SheetPdfCharacter): PageDraft {
  const page: PageDraft = { ops: [], fields: [] };
  let y = sectionTitle(page, MARGIN + 8, 'EQUIPAMENTO');
  const gear = (character.gear || []).slice(0, GEAR_ROWS);
  const nameW = 210;
  const typeW = 96;
  const qtyW = 40;
  const dmgW = 70;
  const notesW = CONTENT_W - nameW - typeW - qtyW - dmgW - 16;

  page.ops.push('0.35 g\n');
  page.ops.push(txt(MARGIN, y - 3, 'ITEM', 6.5));
  page.ops.push(txt(MARGIN + nameW + 4, y - 3, 'TIPO', 6.5));
  page.ops.push(txt(MARGIN + nameW + typeW + 8, y - 3, 'QTD', 6.5));
  page.ops.push(txt(MARGIN + nameW + typeW + qtyW + 12, y - 3, 'DANO', 6.5));
  page.ops.push(txt(MARGIN + nameW + typeW + qtyW + dmgW + 16, y - 3, 'NOTAS', 6.5));
  page.ops.push('0 g\n');
  y += 4;

  // Blank rows past the character's current gear: the sheet is meant to be
  // filled in by hand once it leaves the app.
  for (let index = 0; index < GEAR_ROWS; index += 1) {
    const item = gear[index] || {};
    const rowTop = y + index * 22;
    const columns: [string, string, number, number][] = [
      [`gear.${index}.name`, String(item.name || ''), MARGIN, nameW],
      [`gear.${index}.type`, String(item.type || ''), MARGIN + nameW + 4, typeW],
      [`gear.${index}.qty`, item.qty == null ? '' : String(item.qty), MARGIN + nameW + typeW + 8, qtyW],
      [`gear.${index}.dmg`, String(item.dmg || ''), MARGIN + nameW + typeW + qtyW + 12, dmgW],
      [`gear.${index}.notes`, String(item.notes || ''), MARGIN + nameW + typeW + qtyW + dmgW + 16, notesW],
    ];
    for (const [name, value, x, w] of columns) {
      page.fields.push({ name, value, x, y: rowTop, w, h: 18, size: 8 });
      page.ops.push(line(x, rowTop + 19, x + w));
    }
  }
  y += GEAR_ROWS * 22 + 10;

  y = sectionTitle(page, y, 'CYBERWARE, CONTATOS E LIVRE');
  const freeHeight = PAGE_H - MARGIN - (y + 2);
  for (let rule = 1; rule * 16 < freeHeight; rule += 1) {
    page.ops.push(line(MARGIN, y + 2 + rule * 16, MARGIN + CONTENT_W));
  }
  page.fields.push({
    name: 'notes.free',
    value: '',
    x: MARGIN,
    y: y + 2,
    w: CONTENT_W,
    h: freeHeight,
    multiline: true,
  });
  return page;
}

// -------------------------------------------------------------- PDF assembly

function appearanceStream(field: FieldSpec): string {
  const size = field.size || 9;
  const lines = field.multiline
    ? toWinAnsi(field.value).split(/\r?\n/).slice(0, Math.floor(field.h / (size + 3)))
    : [toWinAnsi(field.value)];
  let body = '/Tx BMC q BT 0 g /Helv ' + size + ' Tf\n';
  lines.forEach((text, index) => {
    const y = field.multiline
      ? field.h - size - 3 - index * (size + 3)
      : (field.h - size) / 2 + 1;
    body += `1 0 0 1 3 ${y.toFixed(2)} Tm (${esc(text)}) Tj\n`;
  });
  body += 'ET Q EMC\n';
  return body;
}

function fieldFlags(field: FieldSpec): string {
  return field.multiline ? ' /Ff 4096' : '';
}

export function buildCharacterSheetPdf(input: SheetPdfInput): Uint8Array {
  const character = input.character || {};
  const skills = character.skills || [];
  const skillPageCount = Math.max(1, Math.ceil(skills.length / (SKILL_ROWS_PER_PAGE * 2)));

  const pages: PageDraft[] = [buildIdentityPage(input)];
  for (let index = 0; index < skillPageCount; index += 1) {
    const slice = skills.slice(
      index * SKILL_ROWS_PER_PAGE * 2,
      (index + 1) * SKILL_ROWS_PER_PAGE * 2,
    );
    pages.push(buildSkillPage(slice, index, skillPageCount));
  }
  pages.push(buildGearPage(character));

  // Object numbers are assigned up front because pages reference their widgets
  // and every widget references its page back.
  const CATALOG = 1;
  const PAGES = 2;
  const HELV = 3;
  const HELV_BOLD = 4;
  const ACROFORM = 5;
  let next = 6;
  const pageRefs: number[] = [];
  const contentRefs: number[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    pageRefs.push(next++);
    contentRefs.push(next++);
  }
  const widgetRefs: number[][] = [];
  const apRefs: number[][] = [];
  pages.forEach((page) => {
    const widgets: number[] = [];
    const aps: number[] = [];
    page.fields.forEach(() => {
      widgets.push(next++);
      aps.push(next++);
    });
    widgetRefs.push(widgets);
    apRefs.push(aps);
  });

  const objects = new Map<number, string>();
  objects.set(CATALOG, `<< /Type /Catalog /Pages ${PAGES} 0 R /AcroForm ${ACROFORM} 0 R >>`);
  objects.set(
    PAGES,
    `<< /Type /Pages /Count ${pages.length} /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(' ')}] >>`,
  );
  objects.set(HELV, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.set(HELV_BOLD, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const allWidgets = widgetRefs.flat();
  objects.set(
    ACROFORM,
    '<< /Fields [' + allWidgets.map((ref) => `${ref} 0 R`).join(' ') + ']' +
      ` /NeedAppearances true /DA (/Helv 9 Tf 0 g) /DR << /Font << /Helv ${HELV} 0 R /HelvB ${HELV_BOLD} 0 R >> >> >>`,
  );

  pages.forEach((page, pageIndex) => {
    const annots = widgetRefs[pageIndex].map((ref) => `${ref} 0 R`).join(' ');
    objects.set(
      pageRefs[pageIndex],
      `<< /Type /Page /Parent ${PAGES} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}]` +
        ` /Resources << /Font << /Helv ${HELV} 0 R /HelvB ${HELV_BOLD} 0 R >> >>` +
        ` /Contents ${contentRefs[pageIndex]} 0 R /Annots [${annots}] >>`,
    );
    const stream = page.ops.join('');
    objects.set(
      contentRefs[pageIndex],
      `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    );

    page.fields.forEach((field, fieldIndex) => {
      const widget = widgetRefs[pageIndex][fieldIndex];
      const ap = apRefs[pageIndex][fieldIndex];
      const bottom = PAGE_H - field.y - field.h;
      objects.set(
        widget,
        '<< /Type /Annot /Subtype /Widget /FT /Tx' +
          ` /T (${esc(field.name)}) /V (${esc(field.value)}) /DA (/Helv ${field.size || 9} Tf 0 g)` +
          fieldFlags(field) +
          ` /Rect [${field.x} ${bottom.toFixed(2)} ${(field.x + field.w).toFixed(2)} ${(bottom + field.h).toFixed(2)}]` +
          ` /F 4 /P ${pageRefs[pageIndex]} 0 R /AP << /N ${ap} 0 R >>` +
          ' /MK << /BG [0.97 0.97 0.97] /BC [0.72 0.72 0.72] >> /Border [0 0 0.5] >>',
      );
      const appearance = appearanceStream(field);
      objects.set(
        ap,
        `<< /Type /XObject /Subtype /Form /BBox [0 0 ${field.w} ${field.h}]` +
          ` /Resources << /Font << /Helv ${HELV} 0 R >> >> /Length ${appearance.length} >>\n` +
          `stream\n${appearance}endstream`,
      );
    });
  });

  const total = next - 1;
  let body = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  for (let number = 1; number <= total; number += 1) {
    offsets[number] = body.length;
    body += `${number} 0 obj\n${objects.get(number) || '<< >>'}\nendobj\n`;
  }
  const xrefOffset = body.length;
  body += `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let number = 1; number <= total; number += 1) {
    body += `${String(offsets[number]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${total + 1} /Root ${CATALOG} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const bytes = new Uint8Array(body.length);
  for (let index = 0; index < body.length; index += 1) {
    bytes[index] = body.charCodeAt(index) & 0xff;
  }
  return bytes;
}

export function characterSheetFileName(character: SheetPdfCharacter): string {
  const slug = toWinAnsi(character.name || character.id || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `ficha-${slug || 'operativo'}.pdf`;
}
