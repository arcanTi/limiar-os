// Character wizard. A new player cannot join a campaign without a character,
// so this overlay breaks creation into validated steps and preserves the target
// campaign through completion. It mounts independently and delegates events
// from its root, following the campaigns overlay pattern.
//
// Two modes share the same steps: `first` (login-time onboarding, may be
// skipped for later) and `new` (a player already inside the app creates another
// operative; inside a campaign the new sheet replaces their seat there).

import {
  WIZARD_STEPS,
  WIZARD_ROLES,
  buyChrome,
  buyGear,
  changeStat,
  chromeBudget,
  chromeHumanityCost,
  chromeSpendTotal,
  createWizardDraft,
  creationSpend,
  gearPurchaseBlock,
  gearSpendTotal,
  lifestyleForSheet,
  nextStep,
  previousStep,
  rollStat,
  rollStats,
  sellChrome,
  sellGear,
  setLifestyleDetail,
  setLifestylePreset,
  setOriginLanguage,
  setRole,
  setSkillLevel,
  setStatMethod,
  skillBudgetView,
  skillFloor,
  skillPointsRemaining,
  skillStepCost,
  startingCash,
  statBounds,
  statChangeMessage,
  statMethodGuide,
  statPointsRemaining,
  statPointsSpent,
  statRerollCount,
  statRollCount,
  unrolledStats,
  wizardProgress,
} from '../../domain/character/characterWizard.ts';
import {
  chromeAttachments,
  chromeBlock,
  chromeBlockMessage,
  chromeCatalog,
  chromeEquipped,
  isChromeEnhancement,
} from '../../domain/character/creationChrome.ts';
import {
  gearBlockMessage,
  gearCatalog,
  gearCount,
  gearInventory,
} from '../../domain/character/creationGear.ts';
import { CPRED_LIFESTYLES, lifestyleSummary } from '../../domain/character/lifestyle.ts';
import { RPG_SYSTEMS, implementationLabel, isSystemPlayable } from '../../domain/campaigns/systems.ts';
import {
  CPRED_CREATION_CASH,
  CPRED_CREATION_FASHION_CASH,
  CPRED_CULTURAL_ORIGINS,
  CPRED_SKILL_CREATION_MAX,
  CPRED_STAT_BUDGET,
  CPRED_STAT_ORDER,
} from '../../domain/character/constants.ts';
import canonicalRules from '../../../../data/canonical/cpr-canonical-rules.json' with { type: 'json' };

export const WIZARD_MODES = ['first', 'new'];

/** Header/footer copy that differs between first access and a later new sheet. */
export function wizardCopy(mode = 'first') {
  if (mode === 'new') {
    return {
      mode,
      kicker: 'NOVO OPERATIVO // FICHA',
      ariaLabel: 'Criar um novo operativo',
      skipLabel: 'Cancelar',
      campaignNote: (name) => `Ao concluir, este operativo passa a ser o seu personagem em <strong>${esc(name)}</strong>.`,
    };
  }
  return {
    mode: 'first',
    kicker: 'PRIMEIRO ACESSO // FICHA',
    ariaLabel: 'Criar seu primeiro operativo',
    skipLabel: 'Fazer isso depois',
    campaignNote: (name) => `Ao concluir, você entra em <strong>${esc(name)}</strong>.`,
  };
}

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
const STEPPER_BTN = 'w-7 h-7 flex-none grid place-items-center font-mono text-[15px] font-bold text-cyber-gold border border-cyber-gold/35 hover:bg-cyber-gold hover:text-cyber-bg disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-cyber-gold disabled:cursor-not-allowed';
// Native number spinners fight the custom steppers, so they are hidden.
const NUM_INPUT = 'flex-none text-center bg-cyber-bg/70 border border-cyber-gold/25 text-cyber-bright font-mono text-[13px] font-bold py-1 outline-none focus:border-cyber-cyan disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
const GUIDE = 'font-sans text-xs leading-relaxed text-cyber-text/60';
const TOGGLE_BTN = 'font-mono text-[11px] font-bold tracking-[1px] px-3 py-2 border transition-colors';

function stepper(progress) {
  return `<ol class="flex gap-2 list-none m-0 p-0" aria-label="Passos">${WIZARD_STEPS.map((id, index) => {
    const state = index === progress.index ? 'current' : (index < progress.index ? 'done' : 'todo');
    return `<li><span class="grid place-items-center w-7 h-7 font-mono text-[11px] font-bold border ${STEP_CLASS[state]}" ${state === 'current' ? 'aria-current="step"' : ''}>${index + 1}</span></li>`;
  }).join('')}</ol>`;
}

/**
 * Validation strip above the footer. It exists only while something blocks
 * the step: an enabled "Continuar" is enough to say the step is fine, and the
 * budget steps already display their remaining points in the budget bar, so
 * the strip stays silent there to avoid saying the same thing twice.
 */
const BUDGET_STEPS = new Set(['attributes', 'skills']);

function pendingBlock(progress) {
  const errors = BUDGET_STEPS.has(progress.step) ? [] : progress.errors;
  if (!errors.length) return '<div data-wiz-feedback hidden></div>';
  const shell = 'flex flex-col gap-1 px-6 py-3 font-sans text-[13px] border-t border-cyber-gold/15';
  return `<div data-wiz-feedback role="status" class="${shell} text-cyber-red bg-cyber-red/10">${
    errors.map((e) => `<span>${esc(e)}</span>`).join('')}</div>`;
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
    <div class="flex flex-col gap-5">
      <label class="block">
        <span class="${FIELD_LABEL}">Nome do operativo</span>
        <input type="text" data-wiz-name value="${esc(draft.name)}" autocomplete="off"
               placeholder="Como te chamam nas ruas?" class="${FIELD_INPUT}">
      </label>
      <label class="block">
        <span class="${FIELD_LABEL}">Role</span>
        <select data-wiz-role class="${FIELD_INPUT}">
          ${WIZARD_ROLES.map((role) => `<option value="${esc(role)}" ${draft.role === role ? 'selected' : ''}>${esc(role)}</option>`).join('')}
        </select>
        <span class="${GUIDE} block mt-1.5">A habilidade de Role começa no rank 4. Equipamento e cyberware entram depois, na ficha completa.</span>
      </label>
      <label class="block">
        <span class="${FIELD_LABEL}">Idioma de origem (Cultural Origin)</span>
        <select data-wiz-origin class="${FIELD_INPUT}">
          <option value="" ${draft.originLanguage ? '' : 'selected'}>Escolha a região e o idioma...</option>
          ${CPRED_CULTURAL_ORIGINS.map((origin) => `<optgroup label="${esc(origin.region)}">${origin.languages.map((language) => `<option value="${esc(language)}" ${draft.originLanguage === language ? 'selected' : ''}>${esc(language)}</option>`).join('')}</optgroup>`).join('')}
        </select>
        <span class="${GUIDE} block mt-1.5">Ganha Language (idioma) 4 de graça, fora dos 86 pontos de perícia. Streetslang 2 já vem nas básicas.</span>
      </label>
    </div>`;
}

/**
 * The only place a budget is announced. `remaining` is read as points still
 * to spend; the wording changes with the sign so the bar itself is the
 * validation message.
 */
function budgetBar({ remaining, total, unit, guide, spent }) {
  let tone = 'text-cyber-cyan bg-cyber-cyan/10 border-cyber-cyan/30';
  let text = `${total} ${unit} distribuídos.`;
  if (remaining > 0) {
    tone = 'text-cyber-gold bg-cyber-gold/10 border-cyber-gold/30';
    text = `<strong class="font-mono text-[17px]">${remaining}</strong> de ${total} ${unit} por distribuir`
      + (spent != null ? ` · ${spent} alocados.` : '.');
  } else if (remaining < 0) {
    tone = 'text-cyber-red bg-cyber-red/10 border-cyber-red/30';
    text = `<strong class="font-mono text-[17px]">${Math.abs(remaining)}</strong> ${unit} acima do orçamento de ${total}.`;
  }
  return `<div data-wiz-budget role="status" class="flex flex-col gap-1 border px-4 py-3 ${tone}">
    <span class="font-sans text-[13px] font-bold">${text}</span>
    ${guide ? `<span class="${GUIDE}">${esc(guide)}</span>` : ''}
  </div>`;
}

function statMethodToggle(method) {
  const on = 'border-cyber-cyan bg-cyber-cyan/15 text-cyber-cyan';
  const off = 'border-cyber-gold/30 text-cyber-text/60 hover:border-cyber-gold/60 hover:text-cyber-gold';
  return `
    <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Método dos atributos">
      <span class="${FIELD_LABEL} mb-0 mr-1">Método</span>
      <button type="button" data-wiz-stat-method="points" aria-pressed="${method === 'points'}" class="${TOGGLE_BTN} ${method === 'points' ? on : off}">DISTRIBUIR ${CPRED_STAT_BUDGET} PONTOS</button>
      <button type="button" data-wiz-stat-method="roll" aria-pressed="${method === 'roll'}" class="${TOGGLE_BTN} ${method === 'roll' ? on : off}">ROLAR 1D10 · REGRA DA CASA</button>
    </div>`;
}

function rollSummary(draft, guide) {
  const rolled = statRollCount(draft) > 0;
  const missing = unrolledStats(draft);
  const rerolls = statRerollCount(draft);
  const tone = missing.length
    ? 'text-cyber-gold bg-cyber-gold/10 border-cyber-gold/30'
    : 'text-cyber-cyan bg-cyber-cyan/10 border-cyber-cyan/30';
  let headline = 'Nenhuma rolagem ainda.';
  if (rolled && missing.length) headline = `Falta rolar ${missing.join(', ')}.`;
  else if (rolled) {
    headline = `Total <strong class="font-mono text-[17px]">${statPointsSpent(draft.base)}</strong> pontos`
      + (rerolls ? ` · ${rerolls === 1 ? '1 rerolagem' : `${rerolls} rerolagens`}` : ' · sem rerolagem') + '.';
  }
  return `<div data-wiz-budget role="status" class="flex flex-wrap items-center justify-between gap-3 border px-4 py-3 ${tone}">
    <span class="flex flex-col gap-1">
      <span class="font-sans text-[13px] font-bold">${headline}</span>
      <span class="${GUIDE}">${esc(guide)} Role tudo de uma vez ou um atributo por vez; cada rerolagem fica registrada na ficha.</span>
    </span>
    <button type="button" data-wiz-roll-stats class="${TOGGLE_BTN} border-cyber-cyan bg-cyber-cyan text-cyber-bg hover:bg-cyber-cyan/80">${rolled && !missing.length ? 'ROLAR TODOS DE NOVO' : 'ROLAR TODOS'}</button>
  </div>`;
}

function attributesStep(draft, hint) {
  const rolled = draft.statMethod === 'roll';
  const guide = statMethodGuide(draft.statMethod);
  const summary = rolled
    ? rollSummary(draft, guide)
    : budgetBar({ remaining: statPointsRemaining(draft.base), total: CPRED_STAT_BUDGET, unit: 'pontos', guide });
  return `
    <div class="flex flex-col gap-4">
      ${statMethodToggle(draft.statMethod)}
      ${summary}
      <div class="grid grid-cols-fit-stat gap-3">${CPRED_STAT_ORDER.map((key) => {
    const bounds = statBounds(key, draft.statMethod);
    const value = Number(draft.base[key] || 0);
    const times = Number((draft.statRolled || {})[key] || 0);
    const atMax = !rolled && value >= bounds.max;
    const atMin = value <= bounds.min;
    const label = `
          <span class="flex-1 min-w-0 flex flex-col leading-tight">
            <span class="font-mono text-xs font-bold tracking-wider text-cyber-gold">${esc(key)}</span>
            <em class="not-italic font-mono text-[9px] tracking-wider text-cyber-text/45 whitespace-nowrap">${rolled ? (times ? `${times}× 1d10` : 'não rolado') : `${bounds.min}–${bounds.max}`}</em>
          </span>`;
    if (rolled) {
      return `
        <div class="flex items-center gap-2 bg-cyber-bg/55 border ${times ? 'border-cyber-cyan/25' : 'border-cyber-gold/30'} px-3 py-2.5">
          ${label}
          <output data-wiz-stat-value="${esc(key)}" class="w-12 text-center font-mono text-[15px] font-bold ${times ? 'text-cyber-bright' : 'text-cyber-text/35'}">${times ? esc(value) : '—'}</output>
          <button type="button" data-wiz-roll-stat="${esc(key)}" aria-label="Rolar ${esc(key)}" title="${times ? 'Rerolar' : 'Rolar'} ${esc(key)}"
                  class="${STEPPER_BTN} w-auto px-2 text-[11px] tracking-wider ${times ? '' : 'border-cyber-cyan text-cyber-cyan'}">${times ? 'REROLAR' : 'ROLAR'}</button>
        </div>`;
    }
    return `
        <div class="flex items-center gap-2 bg-cyber-bg/55 border border-cyber-gold/15 px-3 py-2.5">
          ${label}
          <button type="button" data-wiz-stat-dec="${esc(key)}" aria-label="Diminuir ${esc(key)}" class="${STEPPER_BTN}" ${atMin ? 'disabled' : ''}>−</button>
          <input type="number" data-wiz-stat="${esc(key)}" value="${esc(value)}" min="${bounds.min}" max="${bounds.max}" class="w-12 ${NUM_INPUT}">
          <button type="button" data-wiz-stat-inc="${esc(key)}" aria-label="Aumentar ${esc(key)}" title="${atMax ? esc(`Máximo ${bounds.max}`) : ''}" class="${STEPPER_BTN}" ${atMax ? 'disabled' : ''}>+</button>
        </div>`;
  }).join('')}</div>
      ${hint ? `<p data-wiz-hint role="status" class="m-0 font-sans text-[13px] text-cyber-gold bg-cyber-gold/10 border-l-[3px] border-cyber-gold px-3 py-2">${esc(hint)}</p>` : '<p data-wiz-hint hidden></p>'}
    </div>`;
}

function skillsStep(draft, filter) {
  const term = String(filter || '').trim().toLowerCase();
  const visible = term ? draft.skills.filter((skill) => skill.name.toLowerCase().includes(term)) : draft.skills;
  const view = skillBudgetView(draft.skills);
  const guide = `${view.basic} dos ${view.total} pontos já estão nas 13 básicas em 2 (não voltam). Na criação nenhuma perícia passa de ${CPRED_SKILL_CREATION_MAX}; perícia treinada começa em 2. x2 custa 2 pontos por nível.`;
  return `
    <div class="flex flex-col gap-4">
      ${budgetBar({ remaining: view.remaining, total: view.total, unit: 'pontos', guide, spent: view.spent })}
      <label class="block">
        <span class="${FIELD_LABEL}">Buscar perícia</span>
        <input type="search" data-wiz-skill-filter value="${esc(filter || '')}" autocomplete="off"
               placeholder="Ex.: Handgun, Athletics..." class="${FIELD_INPUT}">
      </label>
      <div class="grid grid-cols-fit-lg gap-3">${visible.map((skill) => {
    const floor = skillFloor(skill);
    const cost = skillStepCost(skill);
    const raised = skill.level > floor
      ? 'border-cyber-cyan/40 bg-cyber-cyan/5'
      : 'border-cyber-gold/15 bg-cyber-bg/55';
    return `
        <div class="flex items-center gap-2 border px-3 py-2.5 ${raised}">
          <span class="flex-1 min-w-0 flex flex-col leading-tight font-sans text-[13px] text-cyber-bright">
            <span class="truncate">${esc(skill.name)}</span>
            <em class="not-italic font-mono text-[9px] tracking-wider text-cyber-text/45">${esc(skill.stat)}${cost > 1 ? ' · x2' : ''}${skill.origin ? ` · origem ${floor} grátis` : (floor > 0 ? ` · base ${floor}` : '')}</em>
          </span>
          <button type="button" data-wiz-skill-dec="${esc(skill.id)}" aria-label="Diminuir ${esc(skill.name)}" class="${STEPPER_BTN}" ${skill.level <= floor ? 'disabled' : ''}>−</button>
          <input type="number" data-wiz-skill="${esc(skill.id)}" value="${esc(skill.level)}" min="${floor}" max="${CPRED_SKILL_CREATION_MAX}" class="w-12 ${NUM_INPUT}">
          <button type="button" data-wiz-skill-inc="${esc(skill.id)}" aria-label="Aumentar ${esc(skill.name)}" title="${skill.level >= CPRED_SKILL_CREATION_MAX ? esc(`Máximo ${CPRED_SKILL_CREATION_MAX} na criação`) : ''}" class="${STEPPER_BTN}" ${skill.level >= CPRED_SKILL_CREATION_MAX ? 'disabled' : ''}>+</button>
        </div>`;
  }).join('') || '<div class="font-sans text-xs text-cyber-text/45 py-2.5">Nenhuma perícia encontrada.</div>'}</div>
    </div>`;
}

const money = (value) => Number(value || 0).toLocaleString('pt-BR');

/**
 * Money bar for the chrome step. Unlike the point budgets, an unspent
 * eurodollar is not a mistake: it is the cash the operative starts with
 * (p.104), so the bar never turns into a warning while the cart fits.
 */
/**
 * The shared creation pool. Chrome and arsenal spend the same 2.550eb, so the
 * bar always shows both sides and the money still free between them.
 */
function cashBar(draft, guide) {
  const chrome = chromeSpendTotal(draft);
  const gear = gearSpendTotal(draft);
  const spent = creationSpend(draft);
  const left = startingCash(draft);
  const humanity = chromeHumanityCost(draft);
  const over = spent > CPRED_CREATION_CASH;
  const tone = over
    ? 'text-cyber-red bg-cyber-red/10 border-cyber-red/30'
    : 'text-cyber-cyan bg-cyber-cyan/10 border-cyber-cyan/30';
  const parts = [`${money(chrome)}eb em chrome`, `${money(gear)}eb em equipamento`];
  if (humanity) parts.push(`<span class="text-cyber-red">−${humanity} HUMANITY</span>`);
  const headline = over
    ? `<strong class="font-mono text-[17px]">${money(spent - CPRED_CREATION_CASH)}eb</strong> acima do orçamento de ${money(CPRED_CREATION_CASH)}eb.`
    : `<strong class="font-mono text-[17px]">${money(left)}eb</strong> de ${money(CPRED_CREATION_CASH)}eb livres · ${parts.join(' · ')}`;
  return `<div data-wiz-budget role="status" class="flex flex-col gap-1 border px-4 py-3 ${tone}">
    <span class="font-sans text-[13px] font-bold">${headline}</span>
    <span class="${GUIDE}">${guide}</span>
  </div>`;
}

const CHROME_GUIDE = `Chrome e equipamento saem do mesmo bolso, e o que sobrar vira o dinheiro vivo inicial. A cirurgia é grátis na criação, mas a HUMANITY é cobrada na hora. Os ${money(CPRED_CREATION_FASHION_CASH)}eb de roupas e Fashionware são gastos com o mestre e não viram dinheiro.`;
const ARSENAL_GUIDE = 'Armas, armadura, munição e equipamento saem do mesmo orçamento do chrome. Nada começa equipado: quem está com o quê na mão é decisão de mesa.';

function chromeCard(item, { bought, blockedMessage }) {
  const enhancement = isChromeEnhancement(item);
  const tone = bought
    ? 'border-cyber-cyan/40 bg-cyber-cyan/5'
    : (blockedMessage ? 'border-cyber-gold/15 bg-cyber-bg/40 opacity-60' : 'border-cyber-gold/20 bg-cyber-bg/55');
  const action = bought
    ? `<button type="button" data-wiz-chrome-remove="${esc(item.code)}" class="${STEPPER_BTN} w-auto px-2 text-[10px] tracking-wider">REMOVER</button>`
    : `<button type="button" data-wiz-chrome-buy="${esc(item.code)}" ${blockedMessage ? 'disabled aria-disabled="true"' : ''}
              title="${esc(blockedMessage || '')}" class="${STEPPER_BTN} w-auto px-2 text-[10px] tracking-wider ${blockedMessage ? '' : 'border-cyber-cyan text-cyber-cyan'}">INSTALAR</button>`;
  return `
    <div class="flex items-start gap-2 border px-3 py-2.5 ${tone}">
      <span class="flex-1 min-w-0 flex flex-col leading-tight">
        <span class="font-sans text-[13px] text-cyber-bright truncate">${esc(item.name)}</span>
        <em class="not-italic font-mono text-[9px] tracking-wider text-cyber-text/45">
          ${esc(item.cat)} · ${money(item.price)}eb${item.hcost ? ` · −${item.hcost} HUM` : ''}${enhancement ? ` · aprimoramento de ${esc(item.attachesTo.join(', '))}` : ''}
        </em>
        ${item.desc ? `<em class="not-italic font-sans text-[11px] text-cyber-text/50 mt-1 line-clamp-2">${esc(item.desc)}</em>` : ''}
      </span>
      ${action}
    </div>`;
}

function chromeStep(draft, state) {
  const catalog = state.catalog || [];
  const filter = String(state.chromeFilter || '').trim().toLowerCase();
  const bought = new Set(draft.chrome.map((item) => item.code));
  const installed = chromeAttachments(draft.chrome);
  const visible = catalog.filter((item) => (
    !bought.has(item.code)
    && (!filter || item.name.toLowerCase().includes(filter) || item.cat.toLowerCase().includes(filter))
  ));
  const context = { catalog: state.rawCatalog || [], canonicalRules, budget: chromeBudget(draft) };

  let list = '';
  if (state.catalogStatus === 'loading') {
    list = '<div class="font-sans text-xs text-cyber-text/45 py-2.5">Carregando o catálogo de chrome...</div>';
  } else if (state.catalogStatus === 'error') {
    list = '<div class="font-sans text-xs text-cyber-red py-2.5">Não foi possível carregar o catálogo. Você pode criar a ficha sem chrome e instalar depois.</div>';
  } else {
    list = `<div class="grid grid-cols-fit-lg gap-3">${visible.map((item) => {
      const block = chromeBlock(draft.chrome, item, context);
      return chromeCard(item, { bought: false, blockedMessage: block.reason ? chromeBlockMessage(block, item) : '' });
    }).join('') || '<div class="font-sans text-xs text-cyber-text/45 py-2.5">Nenhum implante encontrado.</div>'}</div>`;
  }

  const installedBlock = installed.length
    ? `<section class="flex flex-col gap-2">
        <span class="${FIELD_LABEL} mb-0">Instalado · ${money(chromeSpendTotal(draft))}eb</span>
        <div class="flex flex-col gap-2">${installed.map((row) => `
          ${chromeCard(row.parent, { bought: true, blockedMessage: '' })}
          ${row.enhancements.map((enhancement) => `<div class="pl-6">${chromeCard(enhancement, { bought: true, blockedMessage: '' })}</div>`).join('')}
        `).join('')}</div>
      </section>`
    : '';

  return `
    <div class="flex flex-col gap-4">
      ${cashBar(draft, CHROME_GUIDE)}
      ${installedBlock}
      <label class="block">
        <span class="${FIELD_LABEL}">Buscar implante</span>
        <input type="search" data-wiz-chrome-filter value="${esc(state.chromeFilter || '')}" autocomplete="off"
               placeholder="Ex.: Cyberarm, Kerenzikov, OPTICS..." class="${FIELD_INPUT}">
      </label>
      ${list}
      ${state.chromeHint
    ? `<p data-wiz-hint role="status" class="m-0 font-sans text-[13px] text-cyber-gold bg-cyber-gold/10 border-l-[3px] border-cyber-gold px-3 py-2">${esc(state.chromeHint)}</p>`
    : '<p data-wiz-hint hidden></p>'}
    </div>`;
}

function gearCard(item, { qty, blockedMessage }) {
  const tone = qty
    ? 'border-cyber-cyan/40 bg-cyber-cyan/5'
    : (blockedMessage ? 'border-cyber-gold/15 bg-cyber-bg/40 opacity-60' : 'border-cyber-gold/20 bg-cyber-bg/55');
  const buy = `<button type="button" data-wiz-gear-buy="${esc(item.code)}" ${blockedMessage ? 'disabled aria-disabled="true"' : ''}
          aria-label="Comprar ${esc(item.name)}" title="${esc(blockedMessage || '')}"
          class="${STEPPER_BTN} ${blockedMessage ? '' : 'border-cyber-cyan text-cyber-cyan'}">+</button>`;
  const sell = qty
    ? `<button type="button" data-wiz-gear-remove="${esc(item.code)}" aria-label="Vender ${esc(item.name)}" class="${STEPPER_BTN}">−</button>
       <output class="w-7 text-center font-mono text-[13px] font-bold text-cyber-bright">${qty}</output>`
    : '';
  return `
    <div class="flex items-start gap-2 border px-3 py-2.5 ${tone}">
      <span class="flex-1 min-w-0 flex flex-col leading-tight">
        <span class="font-sans text-[13px] text-cyber-bright truncate">${esc(item.name)}</span>
        <em class="not-italic font-mono text-[9px] tracking-wider text-cyber-text/45">
          ${esc(item.type || item.cat)} · ${money(item.price)}eb${item.dmg ? ` · ${esc(item.dmg)}` : ''}
        </em>
        ${item.desc ? `<em class="not-italic font-sans text-[11px] text-cyber-text/50 mt-1 line-clamp-2">${esc(item.desc)}</em>` : ''}
      </span>
      ${sell}${buy}
    </div>`;
}

function arsenalStep(draft, state) {
  const catalog = state.gearCatalog || [];
  const filter = String(state.gearFilter || '').trim().toLowerCase();
  const qtyOf = (code) => (draft.gear.find((pick) => pick.code === code) || {}).qty || 0;
  const visible = catalog.filter((item) => (
    !filter || item.name.toLowerCase().includes(filter) || item.cat.toLowerCase().includes(filter) || String(item.type || '').toLowerCase().includes(filter)
  ));

  let list = '';
  if (state.catalogStatus === 'loading') {
    list = '<div class="font-sans text-xs text-cyber-text/45 py-2.5">Carregando o catálogo...</div>';
  } else if (state.catalogStatus === 'error') {
    list = '<div class="font-sans text-xs text-cyber-red py-2.5">Não foi possível carregar o catálogo. Você pode criar a ficha sem equipamento e comprar depois.</div>';
  } else {
    list = `<div class="grid grid-cols-fit-lg gap-3">${visible.map((item) => gearCard(item, {
      qty: qtyOf(item.code),
      blockedMessage: gearBlockMessage(gearPurchaseBlock(draft, item), item),
    })).join('') || '<div class="font-sans text-xs text-cyber-text/45 py-2.5">Nenhum item encontrado.</div>'}</div>`;
  }

  const bought = draft.gear.length
    ? `<section class="flex flex-col gap-2">
        <span class="${FIELD_LABEL} mb-0">Na mochila · ${gearCount(draft.gear)} ${gearCount(draft.gear) === 1 ? 'item' : 'itens'} · ${money(gearSpendTotal(draft))}eb</span>
        <div class="flex flex-wrap gap-2">${draft.gear.map((pick) => `
          <span class="font-sans text-xs text-cyber-bright bg-cyber-cyan/10 border border-cyber-cyan/25 px-2.5 py-1">
            ${esc(pick.name)}${pick.qty > 1 ? ` <em class="not-italic font-bold text-cyber-cyan">x${pick.qty}</em>` : ''}
          </span>`).join('')}</div>
      </section>`
    : '';

  return `
    <div class="flex flex-col gap-4">
      ${cashBar(draft, ARSENAL_GUIDE)}
      ${bought}
      <label class="block">
        <span class="${FIELD_LABEL}">Buscar equipamento</span>
        <input type="search" data-wiz-gear-filter value="${esc(state.gearFilter || '')}" autocomplete="off"
               placeholder="Ex.: Assault Rifle, ARMOR, Agent..." class="${FIELD_INPUT}">
      </label>
      ${list}
    </div>`;
}

function lifestyleStep(draft) {
  const lifestyle = draft.lifestyle;
  const on = 'border-cyber-cyan bg-cyber-cyan/15 text-cyber-cyan';
  const off = 'border-cyber-gold/30 text-cyber-text/60 hover:border-cyber-gold/60 hover:text-cyber-gold';
  return `
    <div class="flex flex-col gap-4">
      <div data-wiz-budget role="status" class="flex flex-col gap-1 border px-4 py-3 text-cyber-cyan bg-cyber-cyan/10 border-cyber-cyan/30">
        <span class="font-sans text-[13px] font-bold">${esc(lifestyleSummary(lifestyle))}</span>
        <span class="${GUIDE}">${esc(lifestyle.note)}</span>
      </div>
      <div class="flex flex-wrap gap-2" role="group" aria-label="Moradia inicial">
        ${CPRED_LIFESTYLES.map((preset) => `
          <button type="button" data-wiz-lifestyle="${esc(preset.id)}" aria-pressed="${lifestyle.id === preset.id}"
                  class="${TOGGLE_BTN} ${lifestyle.id === preset.id ? on : off}">${esc(preset.label.toUpperCase())}</button>`).join('')}
      </div>
      <div class="grid grid-cols-fit-lg gap-3">
        <label class="block">
          <span class="${FIELD_LABEL}">Moradia</span>
          <input type="text" data-wiz-lifestyle-housing value="${esc(lifestyle.housing)}" autocomplete="off"
                 placeholder="Onde o operativo dorme" class="${FIELD_INPUT}">
        </label>
        <label class="block">
          <span class="${FIELD_LABEL}">Alimentação</span>
          <input type="text" data-wiz-lifestyle-food value="${esc(lifestyle.food)}" autocomplete="off"
                 placeholder="Kibble, Good Prepak..." class="${FIELD_INPUT}">
        </label>
        <label class="block">
          <span class="${FIELD_LABEL}">Custo mensal (eb)</span>
          <input type="number" data-wiz-lifestyle-cost value="${esc(lifestyle.monthlyCost)}" min="0" step="50" class="${FIELD_INPUT}">
        </label>
      </div>
      <p class="m-0 ${GUIDE}">A cobrança começa depois do mês de carência, no dia 1º. A ficha guarda o valor e a carência; qual primeiro dia do mês é esse fica com o mestre.</p>
    </div>`;
}

function reviewStep(draft, campaignName, mode = 'first') {
  const raised = draft.skills.filter((skill) => skill.level > skillFloor(skill));
  const rolled = draft.statMethod === 'roll';
  const rerolls = statRerollCount(draft);
  const statNote = rolled
    ? `Atributos rolados — regra da casa (1d10 cru${rerolls ? `, ${rerolls === 1 ? '1 rerolagem' : `${rerolls} rerolagens`}` : ', sem rerolagem'}) · total ${statPointsSpent(draft.base)}`
    : `Atributos distribuídos · Complete Package ${CPRED_STAT_BUDGET} pontos`;
  const view = skillBudgetView(draft.skills);
  return `
    <div class="flex flex-col gap-5">
      <div class="flex flex-col gap-1">
        <strong class="font-sans text-[22px] font-bold tracking-wide text-cyber-bright">${esc(draft.name || 'SEM NOME')}</strong>
        <span class="font-mono text-[11px] font-semibold tracking-[1.5px] text-cyber-gold">${esc(draft.role)} · Cyberpunk RED${draft.originLanguage ? ` · Language (${esc(draft.originLanguage)}) 4` : ''}</span>
      </div>
      <section class="flex flex-col gap-2">
        <span class="${FIELD_LABEL} mb-0">${esc(statNote)}</span>
        <div class="flex flex-wrap gap-2">${CPRED_STAT_ORDER.map((key) => `
          <span class="flex flex-col items-center min-w-[52px] px-2 py-1.5 bg-cyber-bg/60 border border-cyber-gold/20 font-mono text-[15px] font-bold text-cyber-bright">
            <em class="not-italic font-mono text-[9px] tracking-wider text-cyber-gold">${esc(key)}</em>${esc(draft.base[key])}
          </span>`).join('')}</div>
      </section>
      <section class="flex flex-col gap-2">
        <span class="${FIELD_LABEL} mb-0">Perícias acima da base · ${view.spent} de ${view.total} pontos (${view.basic} nas básicas)</span>
        <div class="flex flex-wrap gap-2">
          ${raised.length
    ? raised.map((skill) => `<span class="font-sans text-xs text-cyber-bright bg-cyber-cyan/10 border border-cyber-cyan/25 px-2.5 py-1">${esc(skill.name)} <em class="not-italic font-bold text-cyber-cyan">${esc(skill.level)}</em></span>`).join('')
    : '<span class="font-sans text-xs text-cyber-text/45">Nenhuma perícia acima do nível inicial.</span>'}
        </div>
      </section>
      <section class="flex flex-col gap-2">
        <span class="${FIELD_LABEL} mb-0">Chrome instalado · ${money(chromeSpendTotal(draft))}eb${chromeHumanityCost(draft) ? ` · −${chromeHumanityCost(draft)} HUMANITY` : ''}</span>
        <div class="flex flex-wrap gap-2">
          ${draft.chrome.length
    ? draft.chrome.map((item) => `<span class="font-sans text-xs text-cyber-bright bg-cyber-cyan/10 border border-cyber-cyan/25 px-2.5 py-1">${esc(item.name)}${isChromeEnhancement(item) ? ' <em class="not-italic text-cyber-gold">aprim.</em>' : ''}</span>`).join('')
    : '<span class="font-sans text-xs text-cyber-text/45">Nenhum implante — a carne ainda manda.</span>'}
        </div>
      </section>
      <section class="flex flex-col gap-2">
        <span class="${FIELD_LABEL} mb-0">Arsenal · ${gearCount(draft.gear)} ${gearCount(draft.gear) === 1 ? 'item' : 'itens'} · ${money(gearSpendTotal(draft))}eb</span>
        <div class="flex flex-wrap gap-2">
          ${draft.gear.length
    ? draft.gear.map((pick) => `<span class="font-sans text-xs text-cyber-bright bg-cyber-cyan/10 border border-cyber-cyan/25 px-2.5 py-1">${esc(pick.name)}${pick.qty > 1 ? ` <em class="not-italic font-bold text-cyber-cyan">x${pick.qty}</em>` : ''}</span>`).join('')
    : '<span class="font-sans text-xs text-cyber-text/45">Saiu de mãos vazias.</span>'}
        </div>
        <span class="${GUIDE}">Começa com <strong class="font-mono text-cyber-gold">${money(startingCash(draft))}eb</strong> em dinheiro vivo.</span>
      </section>
      <section class="flex flex-col gap-2">
        <span class="${FIELD_LABEL} mb-0">Vida em Night City</span>
        <span class="font-sans text-[13px] text-cyber-bright">${esc(lifestyleSummary(draft.lifestyle))}</span>
      </section>
      ${campaignName ? `<div class="font-sans text-[13px] text-cyber-bright bg-cyber-gold/10 border-l-[3px] border-cyber-gold px-3 py-2.5">${wizardCopy(mode).campaignNote(campaignName)}</div>` : ''}
    </div>`;
}

function render(root, state) {
  const progress = wizardProgress(state.step, state.draft);
  const copy = wizardCopy(state.mode);
  const body = {
    system: () => systemStep(state.draft),
    identity: () => identityStep(state.draft),
    attributes: () => attributesStep(state.draft, state.hint),
    skills: () => skillsStep(state.draft, state.skillFilter),
    chrome: () => chromeStep(state.draft, state),
    arsenal: () => arsenalStep(state.draft, state),
    lifestyle: () => lifestyleStep(state.draft),
    review: () => reviewStep(state.draft, state.campaignName, state.mode),
  }[state.step]();

  const footBtn = 'font-mono text-[11px] font-bold tracking-[1.5px] px-5 py-2.5 cursor-pointer border';

  root.innerHTML = `
    <div data-wiz-backdrop class="absolute inset-0 bg-cyber-bg/90 backdrop-blur-sm"></div>
    <section role="dialog" aria-modal="true" aria-label="${copy.ariaLabel}"
             class="clip-all relative mx-auto top-1/2 -translate-y-1/2 w-[min(760px,calc(100vw-2rem))] max-h-[calc(100vh-3rem)]
                    flex flex-col bg-cyber-surface border border-cyber-gold/35">
      <header class="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-cyber-gold/20">
        <div>
          <p class="font-mono text-[10px] font-semibold tracking-[2px] text-cyber-gold m-0 mb-1">${copy.kicker}</p>
          <h2 class="font-sans text-[22px] font-bold tracking-wide text-cyber-bright m-0">${esc(progress.label)}</h2>
          <p class="font-mono text-[10px] tracking-[1px] text-cyber-text/45 m-0 mt-1">Passo ${progress.index + 1} de ${progress.total}</p>
        </div>
        ${stepper(progress)}
      </header>
      <div class="flex-1 min-h-0 overflow-y-auto px-6 py-5">${body}</div>
      ${pendingBlock(progress)}
      <footer class="flex items-center justify-between gap-3 px-6 py-4 border-t border-cyber-gold/20">
        <button type="button" data-wiz-skip class="${footBtn} border-cyber-text/20 text-cyber-text/55">${copy.skipLabel}</button>
        <div class="flex gap-2">
          ${progress.index > 0 ? `<button type="button" data-wiz-back class="${footBtn} border-cyber-gold text-cyber-gold">Voltar</button>` : ''}
          <button type="button" data-wiz-next ${progress.canAdvance ? '' : 'disabled'}
                  class="${footBtn} border-cyber-cyan bg-cyber-cyan text-cyber-bg disabled:opacity-35 disabled:cursor-not-allowed">
            ${progress.isLast ? 'CRIAR OPERATIVO' : 'Continuar'}
          </button>
        </div>
      </footer>
      ${state.status ? `<p role="alert" class="m-0 px-6 pb-4 font-sans text-xs text-cyber-red">${esc(state.status)}</p>` : ''}
    </section>`;
}

export function createWizardController({ api, campaignId = '', campaignName = '', onDone, svgCard, mode = 'first' } = {}) {
  const state = {
    mode: WIZARD_MODES.includes(mode) ? mode : 'first',
    step: WIZARD_STEPS[0],
    draft: createWizardDraft(),
    skillFilter: '',
    status: '',
    /** Transient explanation of why an attribute edit was refused. */
    hint: '',
    saving: false,
    campaignId,
    campaignName,
    /** Chrome step: normalized implants, plus the raw rows the engine needs. */
    catalog: [],
    rawCatalog: [],
    catalogStatus: 'idle',
    /** Arsenal step: weapons, armor, ammo and gear that carry a price. */
    gearCatalog: [],
    gearFilter: '',
    chromeFilter: '',
    /** Transient explanation of why an implant could not be installed. */
    chromeHint: '',
  };

  const handlers = {
    selectSystem(id) {
      if (!isSystemPlayable(id)) return;
      state.draft = { ...state.draft, system: id };
    },
    setName(value) { state.draft = { ...state.draft, name: value }; },
    // Role changes may move the operative's starting housing (Exec, Nomad).
    setRole(value) { state.draft = setRole(state.draft, value); },
    setOriginLanguage(value) { state.draft = setOriginLanguage(state.draft, value); },
    setStat(key, value) {
      const change = changeStat(state.draft, key, value);
      state.draft = change.draft;
      state.hint = statChangeMessage(key, change.reason, state.draft.statMethod);
    },
    bumpStat(key, delta) {
      handlers.setStat(key, Number(state.draft.base[key] || 0) + delta);
    },
    setStatMethod(method) {
      state.draft = setStatMethod(state.draft, method);
      state.hint = '';
    },
    rollStats(rng) {
      state.draft = rollStats(state.draft, rng);
      state.hint = '';
    },
    rollStat(key, rng) {
      state.draft = rollStat(state.draft, key, rng);
      state.hint = '';
    },
    setSkill(id, value) { state.draft = setSkillLevel(state.draft, id, value); },
    bumpSkill(id, delta) {
      const skill = state.draft.skills.find((s) => s.id === id);
      if (skill) state.draft = setSkillLevel(state.draft, id, skill.level + delta);
    },
    setSkillFilter(value) { state.skillFilter = value; },
    setChromeFilter(value) { state.chromeFilter = value; },
    buyChrome(code) {
      const item = (state.catalog || []).find((row) => row.code === code);
      const context = { catalog: state.rawCatalog, canonicalRules };
      const block = chromeBlock(state.draft.chrome, item, context);
      if (block.reason) { state.chromeHint = chromeBlockMessage(block, item); return; }
      state.draft = buyChrome(state.draft, item, context);
      state.chromeHint = '';
    },
    sellChrome(code) {
      state.draft = sellChrome(state.draft, code);
      state.chromeHint = '';
    },
    setGearFilter(value) { state.gearFilter = value; },
    buyGear(code) {
      const item = (state.gearCatalog || []).find((row) => row.code === code);
      state.draft = buyGear(state.draft, item);
    },
    sellGear(code) { state.draft = sellGear(state.draft, code); },
    setLifestylePreset(id) { state.draft = setLifestylePreset(state.draft, id); },
    setLifestyleDetail(field, value) { state.draft = setLifestyleDetail(state.draft, field, value); },
    back() { state.hint = ''; state.step = previousStep(state.step); },
    next() {
      if (!wizardProgress(state.step, state.draft).canAdvance) return false;
      state.hint = '';
      if (state.step !== 'review') { state.step = nextStep(state.step); return false; }
      return true; // Signal that the completed draft is ready to persist.
    },
  };

  /**
   * Fetch the chrome catalog once. A failure is not fatal: the step then says
   * so and the player creates the sheet without implants.
   */
  async function loadCatalog() {
    if (state.catalogStatus === 'loading' || state.catalogStatus === 'ready') return state.catalog;
    state.catalogStatus = 'loading';
    try {
      const items = await (api && api.items ? api.items.list() : Promise.resolve([]));
      state.rawCatalog = Array.isArray(items) ? items : [];
      state.catalog = chromeCatalog(state.rawCatalog);
      state.gearCatalog = gearCatalog(state.rawCatalog);
      state.catalogStatus = 'ready';
    } catch (_) {
      state.rawCatalog = [];
      state.catalog = [];
      state.gearCatalog = [];
      state.catalogStatus = 'error';
    }
    return state.catalog;
  }

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

  return { state, handlers, finish, loadCatalog };
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
    // The backend validates the spread against this method on creation, and
    // the GM can see on the sheet whether the STATs were bought or rolled.
    creation: {
      method: draft.statMethod === 'roll' ? 'roll' : 'points',
      statRolls: draft.statMethod === 'roll' ? statRollCount(draft) : 0,
      statRerolls: draft.statMethod === 'roll' ? statRerollCount(draft) : 0,
      originLanguage: draft.originLanguage || '',
    },
    // RAW p.104: chrome is paid out of the 2.550eb budget and the rest is the
    // cash the operative starts with. The implants go in installed (surgery is
    // free at creation, p.110); their Humanity cost is derived from `equipped`,
    // so it is never written here as a separate loss.
    credits: startingCash(draft),
    equipped: chromeEquipped(draft.chrome),
    owned: draft.chrome.map((item) => item.code),
    gear: gearInventory(draft.gear),
    // Housing and monthly cost so the table knows what the first of the month
    // costs this operative (p.105).
    lifestyle: lifestyleForSheet(draft),
    base: { ...draft.base },
    skills: draft.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      stat: skill.stat,
      level: skill.level,
      bonus: skill.bonus || 0,
      difficult: !!skill.difficult,
      ...(skill.origin ? { origin: true } : {}),
    })),
  };
}

/** Stable selector used to restore the focused field after a repaint. */
export function activeFieldSelector(documentRef) {
  const active = documentRef && documentRef.activeElement;
  if (!active || !active.getAttribute) return '';
  for (const attr of [
    'data-wiz-stat', 'data-wiz-skill', 'data-wiz-name', 'data-wiz-skill-filter',
    'data-wiz-chrome-filter', 'data-wiz-gear-filter',
    'data-wiz-lifestyle-housing', 'data-wiz-lifestyle-food', 'data-wiz-lifestyle-cost',
  ]) {
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
  mode = 'first',
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
  // The root covers the screen only while mounted. Dismissing removes it so
  // the next mount (e.g. a player creating another operative) starts from a
  // fresh element instead of stacking a second set of delegated listeners.
  root.className = 'fixed inset-0 z-[900]';
  root.hidden = false;

  const controller = createWizardController({ api, campaignId, campaignName, onDone, svgCard, mode });

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
    if (typeof root.remove === 'function') root.remove();
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

    const method = target.closest('[data-wiz-stat-method]');
    if (method) { controller.handlers.setStatMethod(method.getAttribute('data-wiz-stat-method')); return paint(); }
    if (target.closest('[data-wiz-roll-stats]')) { controller.handlers.rollStats(); return paint(); }
    const rollOne = target.closest('[data-wiz-roll-stat]');
    if (rollOne) { controller.handlers.rollStat(rollOne.getAttribute('data-wiz-roll-stat')); return paint(); }

    const statInc = target.closest('[data-wiz-stat-inc]');
    if (statInc) { controller.handlers.bumpStat(statInc.getAttribute('data-wiz-stat-inc'), 1); return paint(); }
    const statDec = target.closest('[data-wiz-stat-dec]');
    if (statDec) { controller.handlers.bumpStat(statDec.getAttribute('data-wiz-stat-dec'), -1); return paint(); }

    const chromeBuy = target.closest('[data-wiz-chrome-buy]');
    if (chromeBuy) { controller.handlers.buyChrome(chromeBuy.getAttribute('data-wiz-chrome-buy')); return paint(); }
    const chromeRemove = target.closest('[data-wiz-chrome-remove]');
    if (chromeRemove) { controller.handlers.sellChrome(chromeRemove.getAttribute('data-wiz-chrome-remove')); return paint(); }

    const gearBuy = target.closest('[data-wiz-gear-buy]');
    if (gearBuy) { controller.handlers.buyGear(gearBuy.getAttribute('data-wiz-gear-buy')); return paint(); }
    const gearRemove = target.closest('[data-wiz-gear-remove]');
    if (gearRemove) { controller.handlers.sellGear(gearRemove.getAttribute('data-wiz-gear-remove')); return paint(); }

    const lifestyle = target.closest('[data-wiz-lifestyle]');
    if (lifestyle) { controller.handlers.setLifestylePreset(lifestyle.getAttribute('data-wiz-lifestyle')); return paint(); }

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
    if (target.hasAttribute('data-wiz-chrome-filter')) { controller.handlers.setChromeFilter(target.value); return; }
    if (target.hasAttribute('data-wiz-gear-filter')) { controller.handlers.setGearFilter(target.value); return; }
    // Lifestyle text/number fields refresh only validation so the caret stays.
    if (target.hasAttribute('data-wiz-lifestyle-housing')) {
      controller.handlers.setLifestyleDetail('housing', target.value);
      refreshValidation(root, controller.state);
      return;
    }
    if (target.hasAttribute('data-wiz-lifestyle-food')) {
      controller.handlers.setLifestyleDetail('food', target.value);
      refreshValidation(root, controller.state);
      return;
    }
    if (target.hasAttribute('data-wiz-lifestyle-cost')) {
      controller.handlers.setLifestyleDetail('monthlyCost', target.value);
      refreshValidation(root, controller.state);
      return;
    }
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
    if (target.hasAttribute('data-wiz-origin')) { controller.handlers.setOriginLanguage(target.value); paint(); }
    if (target.hasAttribute('data-wiz-skill-filter')) paint();
    if (target.hasAttribute('data-wiz-chrome-filter')) paint();
    if (target.hasAttribute('data-wiz-gear-filter')) paint();
    if (target.hasAttribute('data-wiz-lifestyle-cost')) paint();
  });

  paint();
  // The chrome step needs the catalog, and it is three steps away: fetch it now
  // so it is already there, and repaint only if the wizard is still mounted.
  controller.loadCatalog().then(() => {
    if (root.dataset.mounted === 'true') paint();
  });
  return root;
}
