// State machine for character creation. This module contains no DOM or I/O:
// each step validates a draft and reports what is still required, while the UI
// only renders that result.

import {
  CPRED_ROLES,
  CPRED_SKILL_BUDGET,
  CPRED_STAT_BUDGET,
  CPRED_STAT_MIN,
  CPRED_STAT_ORDER,
} from './constants.ts';
import { cpredStatMax, normalizeSkills, normalizeStats, skillSpend } from './index.ts';
import { DEFAULT_SYSTEM_ID, isSystemPlayable, systemMeta } from '../campaigns/systems.ts';

export type WizardStepId = 'system' | 'identity' | 'attributes' | 'skills' | 'review';

export const WIZARD_STEPS: WizardStepId[] = ['system', 'identity', 'attributes', 'skills', 'review'];

export const WIZARD_STEP_LABELS: Record<WizardStepId, string> = {
  system: 'Sistema',
  identity: 'Identidade',
  attributes: 'Atributos',
  skills: 'Pericias',
  review: 'Revisao',
};

export interface WizardSkill {
  id: string;
  name: string;
  stat: string;
  level: number;
  difficult: boolean;
  [extra: string]: unknown;
}

export interface WizardDraft {
  system: string;
  name: string;
  role: string;
  base: Record<string, number>;
  skills: WizardSkill[];
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
  return {
    system: overrides.system || DEFAULT_SYSTEM_ID,
    name: overrides.name || '',
    role: overrides.role || 'Solo',
    base,
    skills: overrides.skills || (normalizeSkills(null, normalizeStats(base)) as unknown as WizardSkill[]),
  };
}

// --- Attributes ---

export function statPointsSpent(base: Record<string, unknown> = {}): number {
  return CPRED_STAT_ORDER.reduce((sum, key) => sum + toInt(base[key], 0), 0);
}

export function statPointsRemaining(base: Record<string, unknown> = {}): number {
  return CPRED_STAT_BUDGET - statPointsSpent(base);
}

export function statBounds(key: string): { min: number; max: number } {
  return { min: CPRED_STAT_MIN, max: cpredStatMax(key) };
}

/**
 * Apply an attribute value within its bounds and the remaining budget. Values
 * beyond the budget are rejected so the UI can explain why it did not change.
 */
export function setStat(draft: WizardDraft, key: string, value: unknown): WizardDraft {
  if (!(CPRED_STAT_ORDER as string[]).includes(key)) return draft;
  const { min, max } = statBounds(key);
  const current = toInt(draft.base[key], min);
  const wanted = Math.min(max, Math.max(min, toInt(value, current)));
  const budgetLeft = statPointsRemaining(draft.base) + current;
  const next = Math.min(wanted, Math.max(min, budgetLeft));
  return { ...draft, base: { ...draft.base, [key]: next } };
}

// --- Skills ---

export function skillPointsSpent(skills: unknown): number {
  return skillSpend(skills);
}

export function skillPointsRemaining(skills: unknown): number {
  return CPRED_SKILL_BUDGET - skillPointsSpent(skills);
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

export function setSkillLevel(draft: WizardDraft, skillId: string, value: unknown): WizardDraft {
  const index = draft.skills.findIndex((skill) => skill.id === skillId);
  if (index < 0) return draft;
  const skill = draft.skills[index];
  const floor = skillFloor(skill);
  const cost = skillStepCost(skill);
  const wanted = Math.max(floor, Math.min(10, toInt(value, skill.level)));
  const spentByOthers = skillPointsSpent(draft.skills) - skillCost(skill);
  const affordableLevels = Math.max(0, Math.floor((CPRED_SKILL_BUDGET - spentByOthers) / cost));
  const next = Math.min(wanted, floor + affordableLevels);
  const skills = [...draft.skills];
  skills[index] = { ...skill, level: next };
  return { ...draft, skills };
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
  }

  if (step === 'attributes') {
    const remaining = statPointsRemaining(draft.base);
    if (remaining > 0) errors.push(`Faltam ${remaining} pontos de atributo para distribuir.`);
    if (remaining < 0) errors.push(`Você passou ${Math.abs(remaining)} pontos do orçamento de atributos.`);
  }

  if (step === 'skills') {
    const remaining = skillPointsRemaining(draft.skills);
    if (remaining > 0) errors.push(`Faltam ${remaining} pontos de perícia para distribuir.`);
    if (remaining < 0) errors.push(`Você passou ${Math.abs(remaining)} pontos do orçamento de perícias.`);
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
