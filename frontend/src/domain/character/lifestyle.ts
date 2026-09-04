// Where the operative sleeps and what they eat when the campaign starts.
//
// RAW (CPR p.105): a starting character gets one month of Cargo Container
// housing with Kibble food for free; from the first of the following month the
// bill — 1.100eb — comes due every month. Two Roles start somewhere else: an
// Exec's Corporation covers a Corporate Conapt (their Teamwork ability), so
// only the Good Prepak lifestyle is paid, and a Nomad lives with the family
// pack and its Motorpool, whose upkeep the GM sets with the player.
//
// Only the numbers the rulebook fixes live here. Anything else is `custom`,
// where the table writes its own cost — better an explicit blank than an
// invented price.

export type LifestyleId = 'default' | 'exec' | 'nomad' | 'custom';

export interface LifestylePreset {
  id: LifestyleId;
  label: string;
  housing: string;
  food: string;
  /** Eurodollars due every month once the free month is over. */
  monthlyCost: number;
  /** Months of free housing at creation (RAW gives everyone one). */
  graceMonths: number;
  note: string;
}

export const CPRED_LIFESTYLE_GRACE_MONTHS = 1;
export const CPRED_LIFESTYLE_DEFAULT_COST = 1100;
export const CPRED_LIFESTYLE_EXEC_COST = 600;

export const CPRED_LIFESTYLES: LifestylePreset[] = [
  {
    id: 'default',
    label: 'Cargo Container + Kibble',
    housing: 'Cargo Container',
    food: 'Kibble',
    monthlyCost: CPRED_LIFESTYLE_DEFAULT_COST,
    graceMonths: CPRED_LIFESTYLE_GRACE_MONTHS,
    note: 'Padrão da criação: o primeiro mês é de graça. A partir do dia 1º do mês seguinte, 1.100eb todo mês.',
  },
  {
    id: 'exec',
    label: 'Corporate Conapt + Good Prepak',
    housing: 'Corporate Conapt (cortesia da Corporação)',
    food: 'Good Prepak',
    monthlyCost: CPRED_LIFESTYLE_EXEC_COST,
    graceMonths: CPRED_LIFESTYLE_GRACE_MONTHS,
    note: 'A Corporação paga a moradia enquanto o Exec serve a ela; o estilo de vida continua saindo do bolso: 600eb por mês.',
  },
  {
    id: 'nomad',
    label: 'Acampamento familiar + Motorpool',
    housing: 'Acampamento da família Nomad',
    food: 'Rancho da família',
    monthlyCost: 0,
    graceMonths: CPRED_LIFESTYLE_GRACE_MONTHS,
    note: 'O Nomad dorme com o pack e tira do Motorpool. O que a família cobra em troca é acerto de mesa, não tabela.',
  },
  {
    id: 'custom',
    label: 'Combinado com o mestre',
    housing: '',
    food: '',
    monthlyCost: 0,
    graceMonths: CPRED_LIFESTYLE_GRACE_MONTHS,
    note: 'Moradia e custo definidos na mesa. Escreva onde o operativo dorme e quanto isso custa por mês.',
  },
];

export function lifestylePreset(id: unknown): LifestylePreset {
  const wanted = String(id || '').trim();
  return CPRED_LIFESTYLES.find((preset) => preset.id === wanted) || CPRED_LIFESTYLES[0];
}

/** The preset a Role starts on before the player changes anything. */
export function defaultLifestyleFor(role: unknown): LifestyleId {
  const name = String(role || '').trim().toUpperCase();
  if (name === 'EXEC') return 'exec';
  if (name === 'NOMAD') return 'nomad';
  return 'default';
}

export interface LifestyleChoice {
  id: LifestyleId;
  housing: string;
  food: string;
  monthlyCost: number;
  graceMonths: number;
  note: string;
}

export function createLifestyle(role: unknown): LifestyleChoice {
  return fromPreset(defaultLifestyleFor(role));
}

export function fromPreset(id: unknown): LifestyleChoice {
  const preset = lifestylePreset(id);
  return {
    id: preset.id,
    housing: preset.housing,
    food: preset.food,
    monthlyCost: preset.monthlyCost,
    graceMonths: preset.graceMonths,
    note: preset.note,
  };
}

function clampCost(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1000000, parsed));
}

export function setLifestyleField(choice: LifestyleChoice, field: 'housing' | 'food' | 'monthlyCost', value: unknown): LifestyleChoice {
  if (field === 'monthlyCost') return { ...choice, monthlyCost: clampCost(value, choice.monthlyCost) };
  return { ...choice, [field]: String(value == null ? '' : value).slice(0, 120) };
}

/**
 * What the sheet stores. `dueFrom` is a count of free months, not a date: the
 * campaign clock belongs to the table, so the GM decides which first of the
 * month the first bill lands on.
 */
export interface LifestyleRecord {
  id: LifestyleId;
  housing: string;
  food: string;
  monthlyCost: number;
  graceMonths: number;
  note: string;
}

export function lifestyleRecord(choice: LifestyleChoice | null | undefined): LifestyleRecord {
  const source = choice || fromPreset('default');
  return {
    id: source.id,
    housing: source.housing,
    food: source.food,
    monthlyCost: Math.max(0, Number(source.monthlyCost) || 0),
    graceMonths: Math.max(0, Number(source.graceMonths) || 0),
    note: source.note,
  };
}

/** One line for the review step and the sheet header. */
export function lifestyleSummary(choice: LifestyleChoice | null | undefined): string {
  const record = lifestyleRecord(choice);
  const where = record.housing || 'Moradia a combinar';
  const food = record.food ? ` · ${record.food}` : '';
  if (!record.monthlyCost) return `${where}${food} · sem custo mensal fixo`;
  const cost = record.monthlyCost.toLocaleString('pt-BR');
  const grace = record.graceMonths === 1 ? 'primeiro mês grátis' : `${record.graceMonths} meses grátis`;
  return `${where}${food} · ${cost}eb/mês (${grace})`;
}
