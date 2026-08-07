// First-character wizard. A new player cannot join a campaign without a
// character, so this overlay breaks creation into validated steps and preserves
// the target campaign through completion. It mounts independently and delegates
// events from its root, following the campaigns overlay pattern.

import {
  WIZARD_STEPS,
  WIZARD_ROLES,
  createWizardDraft,
  nextStep,
  previousStep,
  setSkillLevel,
  setStat,
  skillFloor,
  skillPointsRemaining,
  skillStepCost,
  statBounds,
  statPointsRemaining,
  wizardProgress,
} from '../../domain/character/characterWizard.ts';
import { RPG_SYSTEMS, implementationLabel, isSystemPlayable } from '../../domain/campaigns/systems.ts';
import { CPRED_SKILL_BUDGET, CPRED_STAT_BUDGET, CPRED_STAT_ORDER } from '../../domain/character/constants.ts';

const esc = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// --- Presentation ---
// Tailwind utilities are compiled into the main Vite entry stylesheet. This
// view does not depend on login.css because the application entry does not import it. Class names
// stay as static strings so Tailwind can discover every variant.

const BADGE_CLASS = {
  yes: 'text-cyber-cyan border-cyber-cyan/40 bg-cyber-cyan/10',
  no: 'text-cyber-red border-cyber-red/40 bg-cyber-red/10',
  partially: 'text-cyber-gold border-cyber-gold/40 bg-cyber-gold/10',
};

const STEP_CLASS = {
  current: 'border-cyber-gold bg-cyber-gold text-cyber-bg',
  done: 'border-cyber-cyan text-cyber-cyan',
  todo: 'border-cyber-gold/30 text-cyber-text/50 bg-cyber-bg/60',
};

const FIELD_LABEL = 'block font-mono text-[10px] font-semibold tracking-[1.5px] text-cyber-gold mb-1.5';
const FIELD_INPUT = 'w-full bg-cyber-bg/60 border border-cyber-cyan/30 text-cyber-bright font-sans text-sm px-3 py-2.5 outline-none focus:border-cyber-cyan';
const STEPPER_BTN = 'w-[26px] h-[26px] flex-none grid place-items-center font-mono text-[15px] font-bold text-cyber-gold border border-cyber-gold/35 hover:bg-cyber-gold hover:text-cyber-bg';
const NUM_INPUT = 'flex-none text-center bg-cyber-bg/70 border border-cyber-gold/25 text-cyber-bright font-mono text-[13px] font-bold py-1 outline-none focus:border-cyber-cyan';

function stepper(progress) {
  return `<ol class="flex gap-1.5 list-none m-0 p-0">${WIZARD_STEPS.map((id, index) => {
    const state = index === progress.index ? 'current' : (index < progress.index ? 'done' : 'todo');
    return `<li><span class="grid place-items-center w-[26px] h-[26px] font-mono text-[11px] font-bold border ${STEP_CLASS[state]}">${index + 1}</span></li>`;
  }).join('')}</ol>`;
}

function pendingBlock(progress) {
  const shell = 'flex flex-col gap-0.5 px-[22px] py-3 font-sans text-[13px] border-t border-cyber-gold/15';
  if (progress.canAdvance) {
    return `<div data-wiz-feedback class="${shell} text-cyber-cyan bg-cyber-cyan/5">Tudo certo neste passo.</div>`;
  }
  return `<div data-wiz-feedback role="status" class="${shell} text-cyber-red bg-cyber-red/10">${
    progress.errors.map((e) => `<span>${esc(e)}</span>`).join('')}</div>`;
}

/**
 * Refresh only the validation message and the next button.
 *
 * Repainting the entire step while typing would replace the input and lose its
 * focus and caret. Text input therefore updates only these two fragments.
 */
export function refreshValidation(root, state) {
  const progress = wizardProgress(state.step, state.draft);
  const current = root.querySelector('[data-wiz-feedback]');
  if (current) current.outerHTML = pendingBlock(progress);
  const next = root.querySelector('[data-wiz-next]');
  if (next) next.disabled = !progress.canAdvance;
  return progress;
}

function systemStep(draft) {
  return `<div class="grid grid-cols-fit-md gap-3">${RPG_SYSTEMS.map((system) => {
    const playable = isSystemPlayable(system.id);
    const selected = draft.system === system.id;
    const tone = selected
      ? 'border-cyber-cyan bg-cyber-cyan/10'
      : 'border-cyber-gold/25 bg-cyber-bg/70 hover:border-cyber-gold/60';
    const locked = playable ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed';
    return `
      <button type="button" data-wiz-system="${esc(system.id)}" ${playable ? '' : 'disabled aria-disabled="true"'}
              class="clip-all flex flex-col items-center gap-2 px-3 py-4 border transition-colors ${tone} ${locked}">
        <span class="grid place-items-center min-h-[40px] text-cyber-gold text-center font-sans leading-tight
                     [&_i]:block [&_i]:not-italic [&_i]:text-[11px] [&_i]:tracking-widest
                     [&_b]:block [&_b]:text-[15px] [&_svg]:w-8 [&_svg]:h-8">${system.mark}</span>
        <span class="font-sans text-[13px] font-bold text-cyber-bright">${esc(system.label)}</span>
        <span class="font-mono text-[9px] tracking-wider border px-1.5 py-0.5 ${BADGE_CLASS[system.implementation]}">Implementado · ${esc(implementationLabel(system.id))}</span>
      </button>`;
  }).join('')}</div>`;
}

function identityStep(draft) {
  return `
    <label class="block mb-3.5">
      <span class="${FIELD_LABEL}">Nome do operativo</span>
      <input type="text" data-wiz-name value="${esc(draft.name)}" autocomplete="off"
             placeholder="Como te chamam nas ruas?" class="${FIELD_INPUT}">
    </label>
    <label class="block mb-3.5">
      <span class="${FIELD_LABEL}">Role</span>
      <select data-wiz-role class="${FIELD_INPUT}">
        ${WIZARD_ROLES.map((role) => `<option value="${esc(role)}" ${draft.role === role ? 'selected' : ''}>${esc(role)}</option>`).join('')}
      </select>
    </label>`;
}

function budgetBar(remaining, total) {
  const tone = remaining === 0
    ? 'text-cyber-cyan bg-cyber-cyan/10 border-cyber-cyan/30'
    : 'text-cyber-red bg-cyber-red/10 border-cyber-red/30';
  return `<div data-wiz-budget class="font-sans text-[13px] font-bold border px-3 py-2.5 mb-3.5 ${tone}">
    <strong class="font-mono text-[17px]">${remaining}</strong> de ${total} pontos por distribuir
  </div>`;
}

function attributesStep(draft) {
  return `
    ${budgetBar(statPointsRemaining(draft.base), CPRED_STAT_BUDGET)}
    <div class="grid grid-cols-fit-sm gap-2">${CPRED_STAT_ORDER.map((key) => {
    const bounds = statBounds(key);
    return `
        <div class="flex items-center gap-1.5 bg-cyber-bg/55 border border-cyber-gold/15 px-2.5 py-2">
          <span class="flex-1 font-mono text-xs font-bold tracking-wider text-cyber-gold">${esc(key)}</span>
          <button type="button" data-wiz-stat-dec="${esc(key)}" aria-label="Diminuir ${esc(key)}" class="${STEPPER_BTN}">−</button>
          <input type="number" data-wiz-stat="${esc(key)}" value="${esc(draft.base[key])}" min="${bounds.min}" max="${bounds.max}" class="w-[46px] ${NUM_INPUT}">
          <button type="button" data-wiz-stat-inc="${esc(key)}" aria-label="Aumentar ${esc(key)}" class="${STEPPER_BTN}">+</button>
        </div>`;
  }).join('')}</div>`;
}

function skillsStep(draft, filter) {
  const term = String(filter || '').trim().toLowerCase();
  const visible = term ? draft.skills.filter((skill) => skill.name.toLowerCase().includes(term)) : draft.skills;
  return `
    ${budgetBar(skillPointsRemaining(draft.skills), CPRED_SKILL_BUDGET)}
    <label class="block mb-3.5">
      <span class="${FIELD_LABEL}">Buscar perícia</span>
      <input type="text" data-wiz-skill-filter value="${esc(filter || '')}" autocomplete="off"
             placeholder="Ex.: Handgun, Athletics..." class="${FIELD_INPUT}">
    </label>
    <div class="grid grid-cols-fit-lg gap-2">${visible.map((skill) => {
    const floor = skillFloor(skill);
    const cost = skillStepCost(skill);
    const raised = skill.level > floor
      ? 'border-cyber-cyan/40 bg-cyber-cyan/5'
      : 'border-cyber-gold/15 bg-cyber-bg/55';
    return `
        <div class="flex items-center gap-1.5 border px-2.5 py-2 ${raised}">
          <span class="flex-1 min-w-0 flex flex-col leading-tight font-sans text-[13px] text-cyber-bright">
            <span class="truncate">${esc(skill.name)}</span>
            <em class="not-italic font-mono text-[9px] tracking-wider text-cyber-text/45">${esc(skill.stat)}${cost > 1 ? ' · x2' : ''}</em>
          </span>
          <button type="button" data-wiz-skill-dec="${esc(skill.id)}" aria-label="Diminuir ${esc(skill.name)}" class="${STEPPER_BTN}">−</button>
          <input type="number" data-wiz-skill="${esc(skill.id)}" value="${esc(skill.level)}" min="${floor}" max="10" class="w-[46px] ${NUM_INPUT}">
          <button type="button" data-wiz-skill-inc="${esc(skill.id)}" aria-label="Aumentar ${esc(skill.name)}" class="${STEPPER_BTN}">+</button>
        </div>`;
  }).join('') || '<div class="font-sans text-xs text-cyber-text/45 py-2.5">Nenhuma perícia encontrada.</div>'}</div>`;
}

function reviewStep(draft, campaignName) {
  const raised = draft.skills.filter((skill) => skill.level > skillFloor(skill));
  return `
    <div class="flex flex-col gap-1 mb-3.5">
      <strong class="font-sans text-[22px] font-bold tracking-wide text-cyber-bright">${esc(draft.name || 'SEM NOME')}</strong>
      <span class="font-mono text-[11px] font-semibold tracking-[1.5px] text-cyber-gold">${esc(draft.role)} · Cyberpunk RED</span>
    </div>
    <div class="flex flex-wrap gap-2 mb-3.5">${CPRED_STAT_ORDER.map((key) => `
      <span class="flex flex-col items-center min-w-[52px] px-2 py-1.5 bg-cyber-bg/60 border border-cyber-gold/20 font-mono text-[15px] font-bold text-cyber-bright">
        <em class="not-italic font-mono text-[9px] tracking-wider text-cyber-gold">${esc(key)}</em>${esc(draft.base[key])}
      </span>`).join('')}</div>
    <div class="flex flex-wrap gap-1.5">
      ${raised.length
    ? raised.map((skill) => `<span class="font-sans text-xs text-cyber-bright bg-cyber-cyan/10 border border-cyber-cyan/25 px-2.5 py-1">${esc(skill.name)} <em class="not-italic font-bold text-cyber-cyan">${esc(skill.level)}</em></span>`).join('')
    : '<span class="font-sans text-xs text-cyber-text/45">Nenhuma perícia acima do nível inicial.</span>'}
    </div>
    ${campaignName ? `<div class="mt-4 font-sans text-[13px] text-cyber-bright bg-cyber-gold/10 border-l-[3px] border-cyber-gold px-3 py-2.5">Ao concluir, você entra em <strong>${esc(campaignName)}</strong>.</div>` : ''}`;
}

function render(root, state) {
  const progress = wizardProgress(state.step, state.draft);
  const body = {
    system: () => systemStep(state.draft),
    identity: () => identityStep(state.draft),
    attributes: () => attributesStep(state.draft),
    skills: () => skillsStep(state.draft, state.skillFilter),
    review: () => reviewStep(state.draft, state.campaignName),
  }[state.step]();

  const footBtn = 'font-mono text-[11px] font-bold tracking-[1.5px] px-[18px] py-2.5 cursor-pointer border';

  root.innerHTML = `
    <div data-wiz-backdrop class="absolute inset-0 bg-cyber-bg/90 backdrop-blur-sm"></div>
    <section role="dialog" aria-modal="true" aria-label="Criar seu primeiro operativo"
             class="clip-all relative mx-auto top-1/2 -translate-y-1/2 w-[min(760px,calc(100vw-2rem))] max-h-[calc(100vh-3rem)]
                    flex flex-col bg-cyber-surface border border-cyber-gold/35">
      <header class="flex items-start justify-between gap-4 px-[22px] pt-5 pb-3.5 border-b border-cyber-gold/20">
        <div>
          <p class="font-mono text-[10px] font-semibold tracking-[2px] text-cyber-gold m-0 mb-1">PRIMEIRO ACESSO // FICHA</p>
          <h2 class="font-sans text-[22px] font-bold tracking-wide text-cyber-bright m-0">${esc(progress.label)}</h2>
        </div>
        ${stepper(progress)}
      </header>
      <div class="flex-1 min-h-0 overflow-y-auto px-[22px] py-4.5">${body}</div>
      ${pendingBlock(progress)}
      <footer class="flex items-center justify-between gap-3 px-[22px] py-3.5 border-t border-cyber-gold/20">
        <button type="button" data-wiz-skip class="${footBtn} border-cyber-text/20 text-cyber-text/55">Fazer isso depois</button>
        <div class="flex gap-2">
          ${progress.index > 0 ? `<button type="button" data-wiz-back class="${footBtn} border-cyber-gold text-cyber-gold">Voltar</button>` : ''}
          <button type="button" data-wiz-next ${progress.canAdvance ? '' : 'disabled'}
                  class="${footBtn} border-cyber-cyan bg-cyber-cyan text-cyber-bg disabled:opacity-35 disabled:cursor-not-allowed">
            ${progress.isLast ? 'CRIAR OPERATIVO' : 'Continuar'}
          </button>
        </div>
      </footer>
      ${state.status ? `<p class="m-0 px-[22px] pb-3.5 font-sans text-xs text-cyber-red">${esc(state.status)}</p>` : ''}
    </section>`;
}

export function createWizardController({ api, campaignId = '', campaignName = '', onDone, svgCard } = {}) {
  const state = {
    step: WIZARD_STEPS[0],
    draft: createWizardDraft(),
    skillFilter: '',
    status: '',
    saving: false,
    campaignId,
    campaignName,
  };

  const handlers = {
    selectSystem(id) {
      if (!isSystemPlayable(id)) return;
      state.draft = { ...state.draft, system: id };
    },
    setName(value) { state.draft = { ...state.draft, name: value }; },
    setRole(value) { state.draft = { ...state.draft, role: value }; },
    setStat(key, value) { state.draft = setStat(state.draft, key, value); },
    bumpStat(key, delta) {
      state.draft = setStat(state.draft, key, Number(state.draft.base[key] || 0) + delta);
    },
    setSkill(id, value) { state.draft = setSkillLevel(state.draft, id, value); },
    bumpSkill(id, delta) {
      const skill = state.draft.skills.find((s) => s.id === id);
      if (skill) state.draft = setSkillLevel(state.draft, id, skill.level + delta);
    },
    setSkillFilter(value) { state.skillFilter = value; },
    back() { state.step = previousStep(state.step); },
    next() {
      if (!wizardProgress(state.step, state.draft).canAdvance) return false;
      if (state.step !== 'review') { state.step = nextStep(state.step); return false; }
      return true; // Signal that the completed draft is ready to persist.
    },
  };

  async function finish() {
    if (state.saving) return { ok: false };
    state.saving = true;
    state.status = 'Gravando sua ficha...';
    try {
      const character = await api.characters.createPlayer(buildCharacterPayload(state.draft, { svgCard }));
      const characterId = character && character.id;
      if (state.campaignId && characterId) {
        await api.campaigns.join(state.campaignId, characterId);
      }
      state.status = '';
      if (typeof onDone === 'function') onDone({ character, campaignId: state.campaignId });
      return { ok: true, character };
    } catch (error) {
      state.status = (error && error.message) || 'Nao foi possivel criar a ficha.';
      return { ok: false, error };
    } finally {
      state.saving = false;
    }
  }

  return { state, handlers, finish };
}

/**
 * Convert the wizard draft into the document expected by
 * `/api/player-characters`, using the same contract as the full builder.
 */
export function buildCharacterPayload(draft, { svgCard } = {}) {
  const name = String(draft.name || '').trim().toUpperCase();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'operativo';
  const role = String(draft.role || 'Solo').toUpperCase();
  return {
    id: `${slug}-${Date.now().toString(36)}`,
    name,
    role,
    initials: name.slice(0, 2) || 'OP',
    // Match the full builder by generating a portrait when no image was given.
    portraitUrl: typeof svgCard === 'function'
      ? svgCard(name.slice(0, 2) || 'OP', name, role, '#3fe0d0')
      : undefined,
    level: 1,
    roleAbilityRank: 4,
    base: { ...draft.base },
    skills: draft.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      stat: skill.stat,
      level: skill.level,
      bonus: skill.bonus || 0,
      difficult: !!skill.difficult,
    })),
  };
}

/** Stable selector used to restore the focused field after a repaint. */
export function activeFieldSelector(documentRef) {
  const active = documentRef && documentRef.activeElement;
  if (!active || !active.getAttribute) return '';
  for (const attr of ['data-wiz-stat', 'data-wiz-skill', 'data-wiz-name', 'data-wiz-skill-filter']) {
    const value = active.getAttribute(attr);
    if (value !== null) return value ? `[${attr}="${value}"]` : `[${attr}]`;
  }
  return '';
}

export function mountOnboardingWizard({
  api,
  documentRef = globalThis.document,
  campaignId = '',
  campaignName = '',
  onDone,
  svgCard,
} = {}) {
  if (!api || !documentRef?.body) return null;
  let root = documentRef.getElementById('limiar-onboarding-wizard');
  if (!root) {
    root = documentRef.createElement('div');
    root.id = 'limiar-onboarding-wizard';
    documentRef.body.appendChild(root);
  }
  if (root.dataset.mounted === 'true') return root;
  root.dataset.mounted = 'true';
  // The root covers the screen only while mounted; dismissing it restores
  // `hidden` so the empty element cannot intercept clicks.
  root.className = 'fixed inset-0 z-[900]';
  root.hidden = false;

  const controller = createWizardController({ api, campaignId, campaignName, onDone, svgCard });

  /**
   * Repaint the step and restore focus to the field that was in use.
   *
   * Attributes and skills need a full repaint because the budget may clamp the
   * entered value. Focus restoration keeps consecutive edits usable.
   */
  function paint(focusSelector) {
    const active = focusSelector || activeFieldSelector(documentRef);
    render(root, controller.state);
    if (!active) return;
    const restored = root.querySelector(active);
    if (restored && typeof restored.focus === 'function') {
      restored.focus();
      if (typeof restored.select === 'function') restored.select();
    }
  }

  function dismiss() {
    root.dataset.mounted = 'false';
    root.innerHTML = '';
    root.hidden = true;
  }

  function close() {
    dismiss();
    if (typeof onDone === 'function') onDone({ skipped: true });
  }

  root.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const system = target.closest('[data-wiz-system]');
    if (system) { controller.handlers.selectSystem(system.getAttribute('data-wiz-system')); return paint(); }

    const statInc = target.closest('[data-wiz-stat-inc]');
    if (statInc) { controller.handlers.bumpStat(statInc.getAttribute('data-wiz-stat-inc'), 1); return paint(); }
    const statDec = target.closest('[data-wiz-stat-dec]');
    if (statDec) { controller.handlers.bumpStat(statDec.getAttribute('data-wiz-stat-dec'), -1); return paint(); }

    const skillInc = target.closest('[data-wiz-skill-inc]');
    if (skillInc) { controller.handlers.bumpSkill(skillInc.getAttribute('data-wiz-skill-inc'), 1); return paint(); }
    const skillDec = target.closest('[data-wiz-skill-dec]');
    if (skillDec) { controller.handlers.bumpSkill(skillDec.getAttribute('data-wiz-skill-dec'), -1); return paint(); }

    if (target.closest('[data-wiz-back]')) { controller.handlers.back(); return paint(); }
    if (target.closest('[data-wiz-skip]')) return close();

    if (target.closest('[data-wiz-next]')) {
      const shouldFinish = controller.handlers.next();
      paint();
      if (!shouldFinish) return undefined;
      const result = await controller.finish();
      if (result.ok) { dismiss(); return undefined; }
      return paint();
    }
    return undefined;
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    // Text fields refresh only validation to preserve the active input.
    if (target.hasAttribute('data-wiz-name')) {
      controller.handlers.setName(target.value);
      refreshValidation(root, controller.state);
      return;
    }
    if (target.hasAttribute('data-wiz-skill-filter')) { controller.handlers.setSkillFilter(target.value); return; }
    if (target.hasAttribute('data-wiz-stat')) {
      controller.handlers.setStat(target.getAttribute('data-wiz-stat'), target.value);
      paint();
      return;
    }
    if (target.hasAttribute('data-wiz-skill')) {
      controller.handlers.setSkill(target.getAttribute('data-wiz-skill'), target.value);
      paint();
    }
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.hasAttribute('data-wiz-role')) { controller.handlers.setRole(target.value); paint(); }
    if (target.hasAttribute('data-wiz-skill-filter')) paint();
  });

  paint();
  return root;
}
