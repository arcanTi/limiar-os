// State machine for character creation. This module contains no DOM or I/O:
// each step validates a draft and reports what is still required, while the UI
// only renders that result.

import {
  CPRED_LANGUAGES,
  CPRED_ORIGIN_LANGUAGE_LEVEL,
  CPRED_ROLES,
  CPRED_SKILL_BASIC_ALLOCATION,
  CPRED_SKILL_BUDGET,
  CPRED_SKILL_BUDGET_TOTAL,
  CPRED_SKILL_CREATION_MAX,
  CPRED_SKILL_TRAINED_MIN,
  CPRED_STAT_BUDGET,
  CPRED_STAT_MAX,
  CPRED_STAT_MIN,
  CPRED_STAT_ORDER,
  CPRED_STAT_ROLL_MAX,
  CPRED_STAT_ROLL_SIDES,
  languageSkillName,
} from './constants.ts';
import { CPRED_CREATION_CASH } from './constants.ts';
import {
  addChrome,
  chromeHumanityLoss,
  chromeSpend,
  creationCashLeft,
  isChromeEnhancement,
  removeChrome,
} from './creationChrome.ts';
import type { ChromeContext, ChromeItem } from './creationChrome.ts';
import { normalizeSkills, normalizeStats, skillSpend } from './index.ts';
import { DEFAULT_SYSTEM_ID, isSystemPlayable, systemMeta } from '../campaigns/systems.ts';

export type WizardStepId = 'system' | 'identity' | 'attributes' | 'skills' | 'chrome' | 'review';

export const WIZARD_STEPS: WizardStepId[] = ['system', 'identity', 'attributes', 'skills', 'chrome', 'review'];

export const WIZARD_STEP_LABELS: Record<WizardStepId, string> = {
  system: 'Sistema',
  identity: 'Identidade',
  attributes: 'Atributos',
  skills: 'Pericias',
  chrome: 'Chrome',
  review: 'Revisao',
};

export interface WizardSkill {
  id: string;
  name: string;
  stat: string;
  level: number;
  difficult: boolean;
  baseLevel?: number;
  /** Free Cultural Origin language (level 4, costs nothing). */
  origin?: boolean;
  [extra: string]: unknown;
}

/**
 * How the attributes were produced. `points` is the Complete Package
 * (62 points, each STAT 2-8). `roll` is 1d10 per STAT with ones rerolled: no
 * budget, no 8 cap, and the sheet records how many times the player rerolled
 * so the GM can judge the result.
 */
export type StatMethod = 'points' | 'roll';

export interface WizardDraft {
  system: string;
  name: string;
  role: string;
  /** Cultural Origin language; grants `Language (X)` 4 for free. */
  originLanguage: string;
  base: Record<string, number>;
  skills: WizardSkill[];
  statMethod: StatMethod;
  /**
   * How many times each attribute was rolled (empty while using points).
   * "Roll all" counts one per attribute; a single reroll counts one for that
   * key only. Anything above one per key is a reroll the GM gets to see.
   */
  statRolled: Record<string, number>;
  /**
   * Cyberware and DLC enhancements bought from the 2.550eb creation budget.
   * Whatever is not spent here becomes the character's starting cash.
   */
  chrome: ChromeItem[];
}

export interface StepValidation {
  ok: boolean;
  /** Messages ready to display next to the relevant step. */
  errors: string[];
}

// Keep the full builder's initial 62-point attribute distribution.
const DEFAULT_BASE: Record<string, number> = {
  INT: 6, REF: 8, DEX: 6, TECH: 6, COOL: 6, WILL: 7, LUCK: 5, MOVE: 6, BODY: 8, EMP: 4,
};

function toInt(value: unknown, fallback = 0): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createWizardDraft(overrides: Partial<WizardDraft> = {}): WizardDraft {
  const base = { ...DEFAULT_BASE, ...(overrides.base || {}) };
  const draft: WizardDraft = {
    system: overrides.system || DEFAULT_SYSTEM_ID,
    name: overrides.name || '',
    role: overrides.role || 'Solo',
    originLanguage: '',
    base,
    skills: overrides.skills || (normalizeSkills(null, normalizeStats(base)) as unknown as WizardSkill[]),
    statMethod: overrides.statMethod || 'points',
    statRolled: { ...(overrides.statRolled || {}) },
    chrome: [...(overrides.chrome || [])],
  };
  return overrides.originLanguage ? setOriginLanguage(draft, overrides.originLanguage) : draft;
}

// --- Cultural Origin ---

/** Replace the free origin language skill; empty string removes it. */
export function setOriginLanguage(draft: WizardDraft, language: unknown): WizardDraft {
  const chosen = String(language || '').trim();
  if (chosen && !CPRED_LANGUAGES.includes(chosen)) return draft;
  const skills = draft.skills.filter((skill) => !skill.origin);
  if (chosen) {
    const name = languageSkillName(chosen);
    const existing = skills.findIndex((skill) => skill.name === name);
    const originSkill: WizardSkill = {
      id: existing >= 0 ? skills[existing].id : 'language-' + chosen.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      stat: 'INT',
      level: Math.max(CPRED_ORIGIN_LANGUAGE_LEVEL, existing >= 0 ? toInt(skills[existing].level, 0) : 0),
      baseLevel: CPRED_ORIGIN_LANGUAGE_LEVEL,
      difficult: false,
      origin: true,
    };
    if (existing >= 0) skills[existing] = originSkill; else skills.push(originSkill);
  }
  return { ...draft, originLanguage: chosen, skills };
}

// --- Attributes ---

export function statPointsSpent(base: Record<string, unknown> = {}): number {
  return CPRED_STAT_ORDER.reduce((sum, key) => sum + toInt(base[key], 0), 0);
}

export function statPointsRemaining(base: Record<string, unknown> = {}): number {
  return CPRED_STAT_BUDGET - statPointsSpent(base);
}

/** Creation bounds: RAW caps every STAT at 8, LUCK included (p.42/78). */
export function statBounds(_key: string, method: StatMethod = 'points'): { min: number; max: number } {
  if (method === 'roll') return { min: CPRED_STAT_MIN, max: CPRED_STAT_ROLL_MAX };
  return { min: CPRED_STAT_MIN, max: CPRED_STAT_MAX };
}

/** Why a requested attribute value was not applied as typed. */
export type StatChangeReason = 'locked' | 'max' | 'min' | 'budget' | null;

export interface StatChange {
  draft: WizardDraft;
  /** Value actually stored after clamping. */
  value: number;
  reason: StatChangeReason;
}

/**
 * Apply an attribute value within its bounds and the remaining budget, and
 * say why the stored value differs from the requested one. Rolled attributes
 * are locked: the dice decide them, so manual edits are refused with `locked`.
 */
export function changeStat(draft: WizardDraft, key: string, value: unknown): StatChange {
  const untouched = { draft, value: toInt(draft.base[key], CPRED_STAT_MIN), reason: null as StatChangeReason };
  if (!(CPRED_STAT_ORDER as string[]).includes(key)) return untouched;
  if (draft.statMethod === 'roll') return { ...untouched, reason: 'locked' };
  const { min, max } = statBounds(key, draft.statMethod);
  const current = toInt(draft.base[key], min);
  const requested = toInt(value, current);
  const wanted = Math.min(max, Math.max(min, requested));
  const budgetLeft = statPointsRemaining(draft.base) + current;
  const next = Math.min(wanted, Math.max(min, budgetLeft));
  let reason: StatChangeReason = null;
  if (requested > max) reason = 'max';
  else if (requested < min) reason = 'min';
  else if (next < wanted) reason = 'budget';
  return { draft: { ...draft, base: { ...draft.base, [key]: next } }, value: next, reason };
}

export function setStat(draft: WizardDraft, key: string, value: unknown): WizardDraft {
  return changeStat(draft, key, value).draft;
}

/**
 * Switch between point buy and dice. Going back to points restores the
 * default 62-point spread, because a rolled spread is usually illegal there.
 */
export function setStatMethod(draft: WizardDraft, method: StatMethod): WizardDraft {
  if (method === draft.statMethod) return draft;
  if (method === 'roll') return { ...draft, statMethod: 'roll', statRolled: {} };
  return { ...draft, statMethod: 'points', statRolled: {}, base: { ...DEFAULT_BASE } };
}

/** One 1d10 face; ones are rerolled so every STAT is at least 2. */
export function rollStatDie(rng: () => number = Math.random): number {
  for (;;) {
    const face = 1 + Math.floor(Math.max(0, Math.min(0.999999, rng())) * CPRED_STAT_ROLL_SIDES);
    if (face >= CPRED_STAT_MIN) return face;
  }
}

/** Roll one attribute; the draft moves to `roll` and that key's count grows. */
export function rollStat(draft: WizardDraft, key: string, rng: () => number = Math.random): WizardDraft {
  if (!(CPRED_STAT_ORDER as string[]).includes(key)) return draft;
  const statRolled = { ...(draft.statRolled || {}), [key]: toInt((draft.statRolled || {})[key], 0) + 1 };
  return { ...draft, statMethod: 'roll', base: { ...draft.base, [key]: rollStatDie(rng) }, statRolled };
}

/** Roll every attribute at once (one roll counted per attribute). */
export function rollStats(draft: WizardDraft, rng: () => number = Math.random): WizardDraft {
  return CPRED_STAT_ORDER.reduce((next, key) => rollStat(next, key, rng), draft);
}

/** Total dice rolled for attributes. */
export function statRollCount(draft: Pick<WizardDraft, 'statRolled'>): number {
  return CPRED_STAT_ORDER.reduce((sum, key) => sum + toInt((draft.statRolled || {})[key], 0), 0);
}

/** Rolls beyond the first for each attribute — the number the GM cares about. */
export function statRerollCount(draft: Pick<WizardDraft, 'statRolled'>): number {
  return CPRED_STAT_ORDER.reduce((sum, key) => sum + Math.max(0, toInt((draft.statRolled || {})[key], 0) - 1), 0);
}

/** Attributes never rolled yet under the `roll` method. */
export function unrolledStats(draft: Pick<WizardDraft, 'statRolled'>): string[] {
  return CPRED_STAT_ORDER.filter((key) => toInt((draft.statRolled || {})[key], 0) < 1);
}

/** Attribute step text the UI shows to explain the current method. */
export function statMethodGuide(method: StatMethod): string {
  if (method === 'roll') {
    return `REGRA DA CASA, não é o Edgerunner do livro: 1d10 cru por atributo (1 rerolado), sem tabela de Role, sem orçamento de ${CPRED_STAT_BUDGET} e sem teto de ${CPRED_STAT_MAX}. Fica registrado na ficha.`;
  }
  return `Complete Package: cada atributo vai de ${CPRED_STAT_MIN} a ${CPRED_STAT_MAX}, LUCK incluído. Distribua exatamente ${CPRED_STAT_BUDGET} pontos.`;
}

export function statChangeMessage(key: string, reason: StatChangeReason, method: StatMethod = 'points'): string {
  if (!reason) return '';
  const { min, max } = statBounds(key, method);
  if (reason === 'locked') return 'Atributos rolados não podem ser digitados. Role o dado do atributo ou volte para distribuir pontos.';
  if (reason === 'max') return `${key} não passa de ${max} na distribuição por pontos.`;
  if (reason === 'min') return `${key} não fica abaixo de ${min}.`;
  return `Sem pontos sobrando para subir ${key}: reduza outro atributo primeiro.`;
}

// --- Skills ---

export function skillPointsSpent(skills: unknown): number {
  return skillSpend(skills);
}

export function skillPointsRemaining(skills: unknown): number {
  return CPRED_SKILL_BUDGET - skillPointsSpent(skills);
}

/** RAW view of the same budget: 86 total, 26 already in the 13 basic skills. */
export function skillBudgetView(skills: unknown): { total: number; basic: number; spent: number; remaining: number } {
  const spent = skillPointsSpent(skills);
  return {
    total: CPRED_SKILL_BUDGET_TOTAL,
    basic: CPRED_SKILL_BASIC_ALLOCATION,
    spent: CPRED_SKILL_BASIC_ALLOCATION + spent,
    remaining: CPRED_SKILL_BUDGET - spent,
  };
}

/** Difficult skills cost twice as much for each level gained. */
export function skillStepCost(skill: Pick<WizardSkill, 'difficult'>): number {
  return skill && skill.difficult ? 2 : 1;
}

/**
 * Free skill floor. Default CPR skills start at level two; `skillSpend`
 * excludes that `baseLevel`, so those levels neither consume budget nor can be
 * sold back.
 */
export function skillFloor(skill: Partial<WizardSkill> | null | undefined): number {
  return Math.max(0, toInt(skill && (skill as Record<string, unknown>).baseLevel, 0));
}

export function skillCost(skill: WizardSkill): number {
  return Math.max(0, skill.level - skillFloor(skill)) * skillStepCost(skill);
}

/**
 * Creation limits (p.42/88/90): no skill above 6, and a trained skill starts at
 * 2 — level 1 is skipped in both directions, so a bump from 0 goes to 2 and a
 * bump down from 2 goes to 0. Free floors (basic 2, origin language 4) hold.
 */
export function setSkillLevel(draft: WizardDraft, skillId: string, value: unknown): WizardDraft {
  const index = draft.skills.findIndex((skill) => skill.id === skillId);
  if (index < 0) return draft;
  const skill = draft.skills[index];
  const floor = skillFloor(skill);
  const cost = skillStepCost(skill);
  let wanted = Math.max(floor, Math.min(CPRED_SKILL_CREATION_MAX, toInt(value, skill.level)));
  if (floor < CPRED_SKILL_TRAINED_MIN && wanted > 0 && wanted < CPRED_SKILL_TRAINED_MIN) {
    wanted = skill.level >= CPRED_SKILL_TRAINED_MIN ? 0 : CPRED_SKILL_TRAINED_MIN;
  }
  const spentByOthers = skillPointsSpent(draft.skills) - skillCost(skill);
  const affordableLevels = Math.max(0, Math.floor((CPRED_SKILL_BUDGET - spentByOthers) / cost));
  let next = Math.min(wanted, floor + affordableLevels);
  if (floor < CPRED_SKILL_TRAINED_MIN && next > 0 && next < CPRED_SKILL_TRAINED_MIN) next = 0;
  const skills = [...draft.skills];
  skills[index] = { ...skill, level: next };
  return { ...draft, skills };
}

// --- Chrome (cyberware bought at creation) ---

/** Install an implant if the budget, the stock and the install rules allow. */
export function buyChrome(draft: WizardDraft, item: ChromeItem | null | undefined, context: ChromeContext = {}): WizardDraft {
  const chrome = addChrome(draft.chrome, item, context);
  return chrome === draft.chrome ? draft : { ...draft, chrome };
}

/** Uninstall an implant, refunding its enhancements with it. */
export function sellChrome(draft: WizardDraft, code: unknown): WizardDraft {
  const chrome = removeChrome(draft.chrome, code);
  return chrome.length === draft.chrome.length ? draft : { ...draft, chrome };
}

export function chromeSpendTotal(draft: Pick<WizardDraft, 'chrome'>): number {
  return chromeSpend(draft.chrome);
}

/** Eurodollars the character starts play with (CPR p.104). */
export function startingCash(draft: Pick<WizardDraft, 'chrome'>): number {
  return creationCashLeft(draft.chrome);
}

/** Humanity paid for the chrome, charged at creation like any other install. */
export function chromeHumanityCost(draft: Pick<WizardDraft, 'chrome'>): number {
  return chromeHumanityLoss(draft.chrome);
}

// --- Step validation ---

export function validateStep(step: WizardStepId, draft: WizardDraft): StepValidation {
  const errors: string[] = [];

  if (step === 'system') {
    if (!isSystemPlayable(draft.system)) {
      errors.push(`${systemMeta(draft.system).label} ainda nao esta implementado. Escolha Cyberpunk RED para continuar.`);
    }
  }

  if (step === 'identity') {
    if (!String(draft.name || '').trim()) errors.push('Dê um nome ao seu operativo.');
    if (!String(draft.role || '').trim()) errors.push('Escolha um Role.');
    if (!String(draft.originLanguage || '').trim()) errors.push('Escolha o idioma de origem (Cultural Origin).');
  }

  if (step === 'attributes') {
    if (draft.statMethod === 'roll') {
      const missing = unrolledStats(draft);
      if (missing.length === CPRED_STAT_ORDER.length) errors.push('Role os atributos antes de continuar.');
      else if (missing.length) errors.push(`Falta rolar: ${missing.join(', ')}.`);
    } else {
      const remaining = statPointsRemaining(draft.base);
      if (remaining > 0) errors.push(`Faltam ${remaining} pontos de atributo para distribuir.`);
      if (remaining < 0) errors.push(`Você passou ${Math.abs(remaining)} pontos do orçamento de atributos.`);
    }
  }

  if (step === 'skills') {
    const remaining = skillPointsRemaining(draft.skills);
    if (remaining > 0) errors.push(`Faltam ${remaining} pontos de perícia para distribuir.`);
    if (remaining < 0) errors.push(`Você passou ${Math.abs(remaining)} pontos do orçamento de perícias.`);
  }

  if (step === 'chrome') {
    // Chrome is optional: a character may walk out of creation with 2.550eb in
    // the pocket and no implants. Only an impossible cart blocks the step.
    const spent = chromeSpendTotal(draft);
    if (spent > CPRED_CREATION_CASH) {
      errors.push(`Você passou ${spent - CPRED_CREATION_CASH}eb do orçamento de criação.`);
    }
    const orphans = draft.chrome.filter((item) => (
      isChromeEnhancement(item) && !item.attachesTo.some((code) => draft.chrome.some((pick) => pick.code === code))
    ));
    orphans.forEach((item) => errors.push(`${item.name} precisa do cyberware base instalado.`));
  }

  if (step === 'review') {
    // Review can finish only after every preceding step validates.
    WIZARD_STEPS.filter((id) => id !== 'review').forEach((id) => {
      errors.push(...validateStep(id, draft).errors);
    });
  }

  return { ok: errors.length === 0, errors };
}

export function canAdvance(step: WizardStepId, draft: WizardDraft): boolean {
  return validateStep(step, draft).ok;
}

export function stepIndex(step: WizardStepId): number {
  const index = WIZARD_STEPS.indexOf(step);
  return index < 0 ? 0 : index;
}

export function nextStep(step: WizardStepId): WizardStepId {
  return WIZARD_STEPS[Math.min(WIZARD_STEPS.length - 1, stepIndex(step) + 1)];
}

export function previousStep(step: WizardStepId): WizardStepId {
  return WIZARD_STEPS[Math.max(0, stepIndex(step) - 1)];
}

/** Furthest step the draft can reach without skipping an unmet requirement. */
export function furthestReachableStep(draft: WizardDraft): WizardStepId {
  for (const step of WIZARD_STEPS) {
    if (!canAdvance(step, draft)) return step;
  }
  return 'review';
}

export const WIZARD_ROLES = CPRED_ROLES;

export interface WizardProgress {
  step: WizardStepId;
  index: number;
  total: number;
  label: string;
  errors: string[];
  canAdvance: boolean;
  isLast: boolean;
}

export function wizardProgress(step: WizardStepId, draft: WizardDraft): WizardProgress {
  const validation = validateStep(step, draft);
  return {
    step,
    index: stepIndex(step),
    total: WIZARD_STEPS.length,
    label: WIZARD_STEP_LABELS[step],
    errors: validation.errors,
    canAdvance: validation.ok,
    isLast: step === 'review',
  };
}
