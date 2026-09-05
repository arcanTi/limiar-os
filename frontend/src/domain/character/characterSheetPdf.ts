/**
 * Build a fillable (AcroForm) PDF of a character sheet, with no dependencies.
 *
 * Why hand-rolled: the app is served under `script-src 'self'`, so no CDN can
 * be reached, and the project carries no runtime npm dependencies at all. A
 * PDF with base-14 fonts and text widgets is a small enough format to emit
 * directly (~600 lines) that pulling in a ~300 KB library to do it would cost
 * more than it saves.
 *
 * "Editable" means every number a player touches between sessions — stats, HP,
 * humanity, ammo, eddies, skill levels, notes — is a real form field, so the
 * sheet keeps working offline in any PDF reader. Values are written twice: as
 * the field's /V, and as an /AP appearance stream, because several viewers
 * (Chrome's built-in one included) ignore /NeedAppearances and would otherwise
 * show a sheet full of blanks until each field is clicked.
 *
 * This module is a renderer, not a resolver: everything it prints has to be
 * handed to it already resolved. Gear damage in particular lives in the item
 * catalog, so the caller merges the catalog into the inventory row before
 * exporting (`Component.gearCatalogSource`) — otherwise a weapon saved as a
 * bare catalog code exports with an empty DANO column.
 */

export interface SheetPdfGear {
  name?: string;
  type?: string;
  qty?: number;
  dmg?: string;
  rof?: number | string | null;
  magazine?: number | null;
  currentAmmo?: number | null;
  equipped?: boolean;
  notes?: string;
}

export interface SheetPdfArmorSlot {
  name?: string;
  sp?: number;
  penalty?: number;
}

export interface SheetPdfCyberware {
  name?: string;
  cat?: string;
  marketCat?: string;
  hcost?: number;
  location?: string | null;
  desc?: string;
}

export interface SheetPdfProgram {
  name?: string;
  class?: string;
  rez?: number;
  maxRez?: number;
  state?: string;
  effect?: string;
}

export interface SheetPdfCharacter {
  id?: string;
  name?: string;
  role?: string;
  level?: number;
  roleAbilityRank?: number;
  base?: Record<string, unknown>;
  health?: { cur?: number; max?: number };
  derived?: Record<string, unknown>;
  skills?: { name?: string; stat?: string; level?: number; total?: number }[];
  gear?: SheetPdfGear[];
  armor?: { head?: SheetPdfArmorSlot; body?: SheetPdfArmorSlot };
  shield?: { itemId?: string; name?: string; kind?: string; hp?: number; maxHp?: number } | null;
  /** Installed chrome, already merged with the item catalog by the caller. */
  cyberware?: SheetPdfCyberware[];
  /** Cyberdeck programs, already resolved from their ids by the caller. */
  programs?: SheetPdfProgram[];
  criticalInjuries?: { name_pt?: string; location?: string; treated?: boolean; source?: string }[];
  statusEffects?: { label_pt?: string; source?: string; remaining?: unknown; duration?: unknown }[];
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
const BOTTOM = PAGE_H - MARGIN;
const STAT_ORDER = ['INT', 'REF', 'DEX', 'TECH', 'COOL', 'WILL', 'LUCK', 'MOVE', 'BODY', 'EMP'];
const SKILL_ROWS_PER_PAGE = 34;
/** Blank inventory lines kept past the character's gear, to fill in by hand. */
const GEAR_MIN_ROWS = 18;
const TABLE_ROW_H = 20;

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

/** A running cursor over one or more pages, so a section can spill over. */
interface Flow {
  pages: PageDraft[];
  y: number;
}

interface TableColumn {
  key: string;
  label: string;
  w: number;
  size?: number;
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

/** Rough base-14 character budget for a column of the given pixel width. */
function charBudget(size: number, width: number): number {
  return Math.max(1, Math.floor(width / (size * 0.5)));
}

/** Trim long values instead of letting them overflow their column. */
function fits(value: string, size: number, width: number): string {
  const text = toWinAnsi(value);
  const max = charBudget(size, width);
  return text.length <= max ? text : text.slice(0, Math.max(1, max - 1)) + '.';
}

/**
 * Greedy word wrap. Without it a note paragraph renders as one long line that
 * runs off the right edge of its box and is simply lost when printed.
 */
function wrapText(value: string, size: number, width: number, maxLines: number): string[] {
  const max = charBudget(size, width);
  const out: string[] = [];
  for (const paragraph of toWinAnsi(value).split(/\r?\n/)) {
    if (!paragraph.trim()) { out.push(''); continue; }
    let current = '';
    for (const word of paragraph.split(/\s+/)) {
      const piece = word.length > max ? word.slice(0, max) : word;
      if (!current) { current = piece; continue; }
      if (current.length + 1 + piece.length <= max) { current += ' ' + piece; continue; }
      out.push(current);
      current = piece;
      if (out.length >= maxLines) break;
    }
    if (current && out.length < maxLines) out.push(current);
    if (out.length >= maxLines) break;
  }
  return out.slice(0, Math.max(0, maxLines));
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value: unknown): string {
  return String(value == null ? '' : value).trim();
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

function newPage(): PageDraft {
  return { ops: [], fields: [] };
}

function flowPage(flow: Flow): PageDraft {
  return flow.pages[flow.pages.length - 1];
}

/** Break to a new page when `height` no longer fits under the current cursor. */
function flowEnsure(flow: Flow, height: number): void {
  if (flow.y + height <= BOTTOM) return;
  flow.pages.push(newPage());
  flow.y = MARGIN + 8;
}

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

/**
 * A ruled table of form fields that flows across pages. Every cell is editable
 * so a printed sheet stays usable when the party picks something up mid-run.
 */
function tableSection(
  flow: Flow,
  title: string,
  columns: TableColumn[],
  rows: Record<string, string>[],
  opts: { prefix: string; minRows?: number; gap?: number } = { prefix: 'row' },
): void {
  const gap = opts.gap == null ? 4 : opts.gap;
  const total = Math.max(rows.length, opts.minRows || 0);
  if (!total) return;

  // The heading plus at least one row has to fit, or the title would strand
  // itself at the bottom of a page with its table on the next one.
  flowEnsure(flow, 16 + 10 + TABLE_ROW_H);
  let page = flowPage(flow);
  flow.y = sectionTitle(page, flow.y, title);

  const drawHeader = (): void => {
    let x = MARGIN;
    page.ops.push('0.35 g\n');
    for (const column of columns) {
      page.ops.push(txt(x, flow.y - 3, column.label, 6.5));
      x += column.w + gap;
    }
    page.ops.push('0 g\n');
    flow.y += 4;
  };
  drawHeader();

  for (let index = 0; index < total; index += 1) {
    if (flow.y + TABLE_ROW_H > BOTTOM) {
      flow.pages.push(newPage());
      flow.y = MARGIN + 8;
      page = flowPage(flow);
      flow.y = sectionTitle(page, flow.y, `${title} (CONT.)`);
      drawHeader();
    }
    const row = rows[index] || {};
    let x = MARGIN;
    for (const column of columns) {
      const size = column.size || 8;
      page.fields.push({
        name: `${opts.prefix}.${index}.${column.key}`,
        value: text(row[column.key]),
        x,
        y: flow.y,
        w: column.w,
        h: TABLE_ROW_H - 2,
        size,
      });
      page.ops.push(line(x, flow.y + TABLE_ROW_H - 1, x + column.w));
      x += column.w + gap;
    }
    flow.y += TABLE_ROW_H;
  }
  // Clear of the last row's rule, so the next section's title bar does not
  // sit on top of it.
  flow.y += 20;
}

/** Split a fixed width into columns by weight, absorbing the rounding drift. */
function columnWidths(weights: number[], gap: number): number[] {
  const usable = CONTENT_W - gap * (weights.length - 1);
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const widths = weights.map((weight) => Math.floor((usable * weight) / sum));
  widths[widths.length - 1] += usable - widths.reduce((acc, width) => acc + width, 0);
  return widths;
}

// --------------------------------------------------------------------- pages

function buildIdentityPage(input: SheetPdfInput): PageDraft {
  const page = newPage();
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
  const [nameW, roleW, rankW, levelW] = columnWidths([200, 130, 90, 87], 10);
  labelledField(page, { label: 'NOME', name: 'identity.name', value: text(c.name), x: MARGIN, yTop: y, w: nameW });
  labelledField(page, { label: 'PAPEL', name: 'identity.role', value: text(c.role), x: MARGIN + nameW + 10, yTop: y, w: roleW });
  labelledField(page, {
    label: 'RANK DE PAPEL',
    name: 'identity.roleRank',
    value: c.roleAbilityRank == null ? '' : String(num(c.roleAbilityRank, 0)),
    x: MARGIN + nameW + roleW + 20,
    yTop: y,
    w: rankW,
  });
  labelledField(page, {
    label: 'NIVEL',
    name: 'identity.level',
    value: c.level == null ? '' : String(c.level),
    x: MARGIN + nameW + roleW + rankW + 30,
    yTop: y,
    w: levelW,
  });
  y += 34;
  labelledField(page, { label: 'JOGADOR', name: 'identity.player', value: input.owner || text(c.ownerUsername), x: MARGIN, yTop: y, w: 240 });
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
  const armor = c.armor || {};
  const cells: { label: string; name: string; value: string }[] = [
    { label: 'HP ATUAL', name: 'state.hp', value: String(num(health.cur, 0)) },
    { label: 'HP MAX', name: 'state.hpMax', value: String(num(health.max, num(derived.hpMax, 0))) },
    { label: 'FERIDO GRAVE', name: 'state.seriouslyWounded', value: String(num(derived.seriouslyWounded, 0)) },
    { label: 'DEATH SAVE', name: 'state.deathSave', value: String(num(derived.deathSave, 0)) },
    { label: 'HUMANIDADE', name: 'state.humanity', value: String(num(derived.humanityCurrent, 0)) },
    { label: 'HUM. MAX', name: 'state.humanityMax', value: String(num(derived.humanityMax, 0)) },
    { label: 'SP CABECA', name: 'state.headSp', value: String(num(derived.currentHeadSp, num(derived.headSp, num(armor.head && armor.head.sp, 0)))) },
    { label: 'SP CORPO', name: 'state.bodySp', value: String(num(derived.currentBodySp, num(derived.bodySp, num(armor.body && armor.body.sp, 0)))) },
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
  // Both fields exist on a real sheet and neither is a fallback for the other,
  // so exporting only one silently drops whatever the player wrote in the
  // other tab.
  const story = [text(c.story), text(c.notes)].filter(Boolean).join('\n\n');
  page.fields.push({
    name: 'notes.story',
    value: story,
    x: MARGIN,
    y: y + 2,
    w: CONTENT_W,
    h: BOTTOM - (y + 2),
    multiline: true,
  });
  return page;
}

function buildSkillPage(
  skills: SheetPdfCharacter['skills'],
  pageIndex: number,
  pageCount: number,
): PageDraft {
  const page = newPage();
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
    page.ops.push(txt(x, rowTop + 11, fits(text(skill.name), 8, colW - 104), 8));
    page.ops.push(txt(x + colW - 96, rowTop + 11, text(skill.stat), 7));
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

function ammoLabel(item: SheetPdfGear): string {
  const magazine = item.magazine;
  if (magazine == null || !Number.isFinite(Number(magazine))) return '';
  const current = item.currentAmmo == null ? magazine : item.currentAmmo;
  return `${num(current, 0)}/${num(magazine, 0)}`;
}

function gearRows(character: SheetPdfCharacter): Record<string, string>[] {
  return (character.gear || []).map((item) => {
    const rof = item.rof == null || item.rof === '' ? '' : `ROF ${item.rof}`;
    const notes = [item.equipped ? 'EQUIPADO' : '', rof, text(item.notes)].filter(Boolean).join(' · ');
    return {
      name: text(item.name),
      type: text(item.type),
      qty: item.qty == null ? '' : String(num(item.qty, 0)),
      dmg: text(item.dmg),
      ammo: ammoLabel(item),
      notes,
    };
  });
}

function buildGearFlow(flow: Flow, character: SheetPdfCharacter): void {
  const [nameW, typeW, qtyW, dmgW, ammoW, notesW] = columnWidths([160, 92, 26, 54, 42, 153], 4);
  tableSection(
    flow,
    'EQUIPAMENTO',
    [
      { key: 'name', label: 'ITEM', w: nameW },
      { key: 'type', label: 'TIPO', w: typeW, size: 7 },
      { key: 'qty', label: 'QTD', w: qtyW },
      { key: 'dmg', label: 'DANO', w: dmgW },
      { key: 'ammo', label: 'MUN.', w: ammoW, size: 7 },
      { key: 'notes', label: 'NOTAS', w: notesW, size: 7 },
    ],
    gearRows(character),
    { prefix: 'gear', minRows: GEAR_MIN_ROWS },
  );
}

function buildChromeFlow(flow: Flow, character: SheetPdfCharacter): void {
  const armor = character.armor || {};
  const shield = character.shield || null;

  // Armour is the one block a player re-reads every single fight; the derived
  // SP boxes on page 1 do not say which armour those numbers came from.
  flowEnsure(flow, 16 + 40);
  const page = flowPage(flow);
  flow.y = sectionTitle(page, flow.y, 'ARMADURA E ESCUDO');
  const armorW = columnWidths([180, 44, 44, 180, 44, 44], 8);
  const armorCells: { label: string; name: string; value: string }[] = [
    { label: 'CABECA', name: 'armor.head.name', value: text(armor.head && armor.head.name) },
    { label: 'SP', name: 'armor.head.sp', value: String(num(armor.head && armor.head.sp, 0)) },
    { label: 'PENAL.', name: 'armor.head.penalty', value: String(num(armor.head && armor.head.penalty, 0)) },
    { label: 'CORPO', name: 'armor.body.name', value: text(armor.body && armor.body.name) },
    { label: 'SP', name: 'armor.body.sp', value: String(num(armor.body && armor.body.sp, 0)) },
    { label: 'PENAL.', name: 'armor.body.penalty', value: String(num(armor.body && armor.body.penalty, 0)) },
  ];
  let x = MARGIN;
  armorCells.forEach((cell, index) => {
    labelledField(page, { label: cell.label, name: cell.name, value: cell.value, x, yTop: flow.y, w: armorW[index] });
    x += armorW[index] + 8;
  });
  flow.y += 34;
  const [shieldNameW, shieldKindW, shieldHpW] = columnWidths([300, 120, 107], 8);
  labelledField(page, { label: 'ESCUDO', name: 'shield.name', value: text(shield && (shield.name || shield.itemId)), x: MARGIN, yTop: flow.y, w: shieldNameW });
  labelledField(page, { label: 'TIPO', name: 'shield.kind', value: text(shield && shield.kind), x: MARGIN + shieldNameW + 8, yTop: flow.y, w: shieldKindW });
  labelledField(page, {
    label: 'HP',
    name: 'shield.hp',
    value: shield ? `${num(shield.hp, 0)}/${num(shield.maxHp, 0)}` : '',
    x: MARGIN + shieldNameW + shieldKindW + 16,
    yTop: flow.y,
    w: shieldHpW,
  });
  flow.y += 44;

  const cyberware = character.cyberware || [];
  if (cyberware.length) {
    const [nameW, catW, humW, descW] = columnWidths([150, 96, 34, 247], 4);
    tableSection(
      flow,
      'CYBERWARE INSTALADO',
      [
        { key: 'name', label: 'CHROME', w: nameW },
        { key: 'cat', label: 'CATEGORIA', w: catW, size: 7 },
        { key: 'hum', label: 'HUM.', w: humW },
        { key: 'desc', label: 'EFEITO / LOCAL', w: descW, size: 7 },
      ],
      cyberware.map((item) => ({
        name: text(item.name),
        cat: text(item.marketCat || item.cat),
        hum: item.hcost == null ? '' : String(num(item.hcost, 0)),
        desc: [text(item.location), text(item.desc)].filter(Boolean).join(' · '),
      })),
      { prefix: 'cyber' },
    );
  }

  const programs = character.programs || [];
  if (programs.length) {
    const [nameW, classW, rezW, effectW] = columnWidths([130, 80, 50, 267], 4);
    tableSection(
      flow,
      'PROGRAMAS DO CYBERDECK',
      [
        { key: 'name', label: 'PROGRAMA', w: nameW },
        { key: 'class', label: 'CLASSE', w: classW, size: 7 },
        { key: 'rez', label: 'REZ', w: rezW },
        { key: 'effect', label: 'EFEITO', w: effectW, size: 7 },
      ],
      programs.map((program) => ({
        name: text(program.name),
        class: text(program.class),
        rez: program.maxRez ? `${num(program.rez, 0)}/${num(program.maxRez, 0)}` : text(program.state),
        effect: text(program.effect),
      })),
      { prefix: 'program' },
    );
  }

  const injuries = character.criticalInjuries || [];
  if (injuries.length) {
    const [nameW, locW, treatedW, sourceW] = columnWidths([220, 80, 90, 137], 4);
    tableSection(
      flow,
      'FERIMENTOS CRITICOS',
      [
        { key: 'name', label: 'FERIMENTO', w: nameW },
        { key: 'location', label: 'LOCAL', w: locW, size: 7 },
        { key: 'treated', label: 'TRATADO', w: treatedW, size: 7 },
        { key: 'source', label: 'ORIGEM', w: sourceW, size: 7 },
      ],
      injuries.map((injury) => ({
        name: text(injury.name_pt),
        location: injury.location === 'head' ? 'CABECA' : 'CORPO',
        treated: injury.treated ? 'SIM' : 'NAO',
        source: text(injury.source),
      })),
      { prefix: 'injury' },
    );
  }

  const statuses = character.statusEffects || [];
  if (statuses.length) {
    const [nameW, sourceW, remainingW] = columnWidths([260, 130, 137], 4);
    tableSection(
      flow,
      'ESTADOS ATIVOS',
      [
        { key: 'name', label: 'ESTADO', w: nameW },
        { key: 'source', label: 'ORIGEM', w: sourceW, size: 7 },
        { key: 'remaining', label: 'DURACAO', w: remainingW, size: 7 },
      ],
      statuses.map((status) => {
        const remaining = (status.remaining || status.duration) as { value?: unknown; unit?: unknown } | null;
        return {
          name: text(status.label_pt),
          source: text(status.source),
          remaining: remaining ? `${text(remaining.value)} ${text(remaining.unit)}`.trim() : '',
        };
      }),
      { prefix: 'status' },
    );
  }

  // Whatever vertical space is left becomes ruled, writable scratch space —
  // contacts, loot, rep, whatever the table needs mid-session.
  flowEnsure(flow, 16 + 60);
  const last = flowPage(flow);
  flow.y = sectionTitle(last, flow.y, 'CONTATOS E ANOTACOES LIVRES');
  const freeHeight = BOTTOM - (flow.y + 2);
  for (let rule = 1; rule * 16 < freeHeight; rule += 1) {
    last.ops.push(line(MARGIN, flow.y + 2 + rule * 16, MARGIN + CONTENT_W));
  }
  last.fields.push({
    name: 'notes.free',
    value: '',
    x: MARGIN,
    y: flow.y + 2,
    w: CONTENT_W,
    h: freeHeight,
    multiline: true,
  });
}

// -------------------------------------------------------------- PDF assembly

function appearanceStream(field: FieldSpec): string {
  const size = field.size || 9;
  const lineHeight = size + 3;
  const lines = field.multiline
    ? wrapText(field.value, size, field.w - 6, Math.max(1, Math.floor(field.h / lineHeight)))
    : [fits(field.value, size, field.w - 6)];
  let body = '/Tx BMC q BT 0 g /Helv ' + size + ' Tf\n';
  lines.forEach((value, index) => {
    const y = field.multiline
      ? field.h - size - 3 - index * lineHeight
      : (field.h - size) / 2 + 1;
    body += `1 0 0 1 3 ${y.toFixed(2)} Tm (${esc(value)}) Tj\n`;
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

  const gearFlow: Flow = { pages: [newPage()], y: MARGIN + 8 };
  buildGearFlow(gearFlow, character);
  pages.push(...gearFlow.pages);

  const chromeFlow: Flow = { pages: [newPage()], y: MARGIN + 8 };
  buildChromeFlow(chromeFlow, character);
  pages.push(...chromeFlow.pages);

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
