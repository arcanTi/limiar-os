// One ledger of everything currently acting on a character, with provenance.
//
// deriveStats already sums the numbers, but it deliberately throws away where
// each one came from: it hands back `actionPenalty: 4` with no way to tell a
// GM that it is 2 from a Damaged Eye plus 2 from being Seriously Wounded. This
// module walks the same sources and keeps the "why" attached, so one panel can
// answer "what is affecting this player, and can I remove it?".
//
// It computes nothing new — every rule here is already applied somewhere else.
// Its job is attribution, which is why it takes the derived stats rather than
// recomputing them: a second implementation would be free to drift.

import { CPRED_CRITICAL_INJURIES } from '../character/constants.ts';
import { cyberwareBonuses, cyberwareHumanityLoss, cyberwareStatMods } from '../cyberware/index.ts';
import type { InstalledCyberwareItem } from '../cyberware/index.ts';
import { BODY_TYPES } from '../toxins/constants.ts';

export type EffectSign = 'positive' | 'negative' | 'neutral';

export type EffectScope =
  | 'action' | 'move' | 'deathSave' | 'stat' | 'evasion' | 'armor'
  | 'skill' | 'healing' | 'state' | 'immunity' | 'resource';

export type EffectSourceKind =
  | 'injury' | 'status' | 'cyberware' | 'armor' | 'wound' | 'humanity'
  | 'shield' | 'body';

export interface EffectRow {
  id: string;
  sourceKind: EffectSourceKind;
  /** What produced it: an injury name, an implant, "Ferido Grave". */
  source: string;
  label_pt: string;
  scope: EffectScope;
  stat?: string;
  /** Signed magnitude; 0 for rows that are a state rather than a number. */
  value: number;
  sign: EffectSign;
  detail?: string;
  /** Whether the GM can lift it from this panel. */
  removable: boolean;
  instanceId?: string;
  treated?: boolean;
}

export interface EffectTotals {
  action: number;
  move: number;
  deathSave: number;
  evasion: number;
  statPenalties: Record<string, number>;
}

export interface EffectDigest {
  rows: EffectRow[];
  negatives: EffectRow[];
  positives: EffectRow[];
  neutral: EffectRow[];
  totals: EffectTotals;
  headline_pt: string;
  clean: boolean;
}

interface DigestCharacter {
  criticalInjuries?: { instanceId?: string; injury?: string; treated?: boolean; location?: string; name_pt?: string; source?: string; stackPenalty?: boolean }[];
  statusEffects?: { instanceId?: string; id?: string; label_pt?: string; modifiers?: Record<string, unknown>; remaining?: unknown; source?: string }[];
  spDamage?: { head?: unknown; body?: unknown };
  armor?: { head?: { penalty?: unknown }; body?: { penalty?: unknown } };
  shield?: unknown;
  bodyType?: unknown;
  luckCurrent?: unknown;
  base?: Record<string, unknown>;
  health?: { cur?: unknown; max?: unknown };
}

interface DigestDerived {
  actionPenalty?: number;
  woundActionPenalty?: number;
  woundMovePenalty?: number;
  woundState?: string;
  deathSavesPassed?: number;
  conditionActionPenalty?: number;
  movePenalty?: number;
  deathSaveModifier?: number;
  evasionMod?: number;
  armorPenalty?: number;
  statPenalties?: Record<string, number>;
  humanityCurrent?: number;
  humanityMax?: number;
  cyberpsychosisActive?: boolean;
  cyberpsychosisExtreme?: boolean;
  ignoreSeriouslyWounded?: boolean;
  ignoreWoundState?: boolean;
  skipDeathSave?: boolean;
  naturalHealingPerRest?: number;
  naturalHealingMultiplier?: number;
  seriouslyWounded?: number;
  currentHeadSp?: number;
  currentBodySp?: number;
  headSp?: number;
  bodySp?: number;
}

export interface EffectDigestInput {
  character: DigestCharacter;
  derived: DigestDerived;
  installedCyberware?: InstalledCyberwareItem[];
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function signOf(value: number): EffectSign {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

const DURATION_UNITS: Record<string, string> = { round: 'rodada(s)', min: 'min', hour: 'h' };

function durationText(remaining: unknown): string {
  const row = remaining as { value?: unknown; unit?: unknown } | null;
  if (!row || row.value == null) return '';
  const unit = DURATION_UNITS[String(row.unit)] || String(row.unit || '');
  return `${num(row.value)} ${unit}`.trim();
}

// ------------------------------------------------------------------ sources

function injuryRows(character: DigestCharacter): EffectRow[] {
  const rows: EffectRow[] = [];
  (character.criticalInjuries || []).forEach((entry, index) => {
    const catalog = CPRED_CRITICAL_INJURIES[String(entry.injury)] || {};
    const name = entry.name_pt || (catalog as { name_pt?: string }).name_pt || String(entry.injury || 'Lesao');
    const mechanics = (catalog as { mechanics?: { penalties?: { scope?: string; stat?: string; value?: unknown }[] } }).mechanics || {};
    const lasting = (catalog as { lastingPenalty_pt?: string }).lastingPenalty_pt || '';
    const treatment = (catalog as { treatmentDV?: unknown }).treatmentDV;
    const detail = [
      entry.location === 'head' ? 'CABECA' : 'CORPO',
      lasting,
      treatment ? `Tratamento DV${treatment}` : '',
    ].filter(Boolean).join(' :: ');

    if (entry.treated) {
      // Treated injuries stop applying penalties but stay on the sheet, so the
      // GM can see the character is carrying scar tissue, not a live problem.
      rows.push({
        id: `injury:${entry.instanceId || index}`,
        sourceKind: 'injury',
        source: name,
        label_pt: `${name} :: tratada, sem penalidade ativa`,
        scope: 'state',
        value: 0,
        sign: 'neutral',
        detail,
        removable: true,
        instanceId: entry.instanceId,
        treated: true,
      });
      return;
    }

    const penalties = Array.isArray(mechanics.penalties) ? mechanics.penalties : [];
    if (!penalties.length) {
      rows.push({
        id: `injury:${entry.instanceId || index}`,
        sourceKind: 'injury',
        source: name,
        label_pt: `${name} :: sem modificador numerico`,
        scope: 'state',
        value: 0,
        sign: 'neutral',
        detail,
        removable: true,
        instanceId: entry.instanceId,
        treated: false,
      });
      return;
    }
    penalties.forEach((penalty, penaltyIndex) => {
      const value = -Math.abs(num(penalty.value));
      if (!value) return;
      const scope = (penalty.scope === 'stat' ? 'stat' : penalty.scope || 'action') as EffectScope;
      rows.push({
        id: `injury:${entry.instanceId || index}:${penaltyIndex}`,
        sourceKind: 'injury',
        source: name,
        label_pt: `${name} :: ${signed(value)} ${scopeLabel(scope, penalty.stat)}`,
        scope,
        ...(penalty.stat ? { stat: String(penalty.stat) } : {}),
        value,
        sign: 'negative',
        detail,
        removable: true,
        instanceId: entry.instanceId,
        treated: false,
      });
    });
  });
  return rows;
}

function scopeLabel(scope: EffectScope, stat?: unknown): string {
  switch (scope) {
    case 'action': return 'em acoes';
    case 'move': return 'em MOVE';
    case 'deathSave': return 'no Death Save';
    case 'evasion': return 'em evasao';
    case 'stat': return `em ${String(stat || 'atributo')}`;
    case 'skill': return 'na pericia';
    case 'armor': return 'de SP';
    case 'healing': return 'de cura';
    default: return '';
  }
}

function statusRows(character: DigestCharacter): EffectRow[] {
  const rows: EffectRow[] = [];
  (character.statusEffects || []).forEach((status, index) => {
    const modifiers = status.modifiers || {};
    const name = status.label_pt || String(status.id || 'Status');
    const detail = [durationText(status.remaining), status.source ? `origem: ${status.source}` : '']
      .filter(Boolean).join(' :: ');
    const base = {
      sourceKind: 'status' as const,
      source: name,
      detail,
      removable: true,
      instanceId: status.instanceId,
    };
    let emitted = 0;

    const actionBonus = num(modifiers.actionBonus) || num(modifiers.checkBonus);
    if (actionBonus) {
      rows.push({
        ...base,
        id: `status:${status.instanceId || index}:action`,
        label_pt: `${name} :: ${signed(actionBonus)} em acoes`,
        scope: 'action',
        value: actionBonus,
        sign: signOf(actionBonus),
      });
      emitted += 1;
    }
    // The three modifiers custom effects added to the status vocabulary.
    const extraScopes: [string, EffectScope, string][] = [
      ['moveBonus', 'move', 'em MOVE'],
      ['deathSaveBonus', 'deathSave', 'no Death Save'],
    ];
    extraScopes.forEach(([key, scope, text]) => {
      const value = num(modifiers[key]);
      if (!value) return;
      rows.push({
        ...base,
        id: `status:${status.instanceId || index}:${key}`,
        label_pt: `${name} :: ${signed(value)} ${text}`,
        scope,
        value,
        sign: signOf(value),
      });
      emitted += 1;
    });
    const statBonus = modifiers.statBonus as Record<string, unknown> | undefined;
    if (statBonus && typeof statBonus === 'object') {
      Object.entries(statBonus).forEach(([stat, raw]) => {
        const value = num(raw);
        if (!value) return;
        rows.push({
          ...base,
          id: `status:${status.instanceId || index}:stat-${stat}`,
          label_pt: `${name} :: ${signed(value)} em ${stat}`,
          scope: 'stat',
          stat,
          value,
          sign: signOf(value),
        });
        emitted += 1;
      });
    }
    const charges = num(modifiers.charges) || num(modifiers.guaranteedCrit);
    if (charges) {
      rows.push({
        ...base,
        id: `status:${status.instanceId || index}:charges`,
        label_pt: `${name} :: ${charges} carga(s) restante(s)`,
        scope: 'resource',
        value: 0,
        sign: 'neutral',
      });
      emitted += 1;
    }
    const evasion = num(modifiers.evasionMod) || num(modifiers.evasionVsMelee);
    if (evasion) {
      rows.push({
        ...base,
        id: `status:${status.instanceId || index}:evasion`,
        label_pt: `${name} :: ${signed(evasion)} em evasao`,
        scope: 'evasion',
        value: evasion,
        sign: signOf(evasion),
      });
      emitted += 1;
    }
    const ablation = modifiers.spAblation as { head?: unknown; body?: unknown } | undefined;
    (['head', 'body'] as const).forEach(part => {
      const amount = num(ablation?.[part]);
      if (!amount) return;
      rows.push({
        ...base,
        id: `status:${status.instanceId || index}:sp-${part}`,
        label_pt: `${name} :: -${amount} SP ${part === 'head' ? 'cabeca' : 'corpo'}`,
        scope: 'armor',
        value: -amount,
        sign: 'negative',
      });
      emitted += 1;
    });
    const flags: [string, string][] = [
      ['ignoreSeriouslyWounded', 'ignora Ferido Grave'],
      ['ignoreWoundState', 'ignora estado de ferimento'],
      ['skipDeathSave', 'dispensa Death Save'],
    ];
    flags.forEach(([key, text]) => {
      if (!modifiers[key]) return;
      rows.push({
        ...base,
        id: `status:${status.instanceId || index}:${key}`,
        label_pt: `${name} :: ${text}`,
        scope: 'state',
        value: 0,
        sign: 'positive',
      });
      emitted += 1;
    });

    // A status with no numeric modifier is still worth showing: it is a state
    // the table agreed on (suprimido, sugestionavel) and the GM adjudicates it.
    if (!emitted) {
      rows.push({
        ...base,
        id: `status:${status.instanceId || index}`,
        label_pt: name,
        scope: 'state',
        value: 0,
        sign: 'neutral',
      });
    }
  });
  return rows;
}

function woundRows(character: DigestCharacter, derived: DigestDerived): EffectRow[] {
  const rows: EffectRow[] = [];
  const woundPenalty = num(derived.woundActionPenalty);
  const mortal = derived.woundState === 'mortallyWounded';
  const source = mortal ? 'Mortalmente Ferido' : 'Ferido Grave';
  const detail = mortal ? `HP ${num(character.health?.cur)} < 1` : `HP ${num(character.health?.cur)} <= ${num(derived.seriouslyWounded)}`;
  if (woundPenalty) {
    rows.push({
      id: mortal ? 'wound:mortally' : 'wound:seriously',
      sourceKind: 'wound',
      source,
      label_pt: `${source} :: -${woundPenalty} em acoes`,
      scope: 'action',
      value: -woundPenalty,
      sign: 'negative',
      detail,
      removable: false,
    });
    const movePenalty = num(derived.woundMovePenalty);
    if (movePenalty) {
      rows.push({
        id: 'wound:mortally:move',
        sourceKind: 'wound',
        source,
        label_pt: `${source} :: MOVE -${movePenalty} (minimo 1)`,
        scope: 'move',
        value: -movePenalty,
        sign: 'negative',
        detail,
        removable: false,
      });
    }
    const passed = num(derived.deathSavesPassed);
    if (passed) {
      rows.push({
        id: 'wound:mortally:deathSave',
        sourceKind: 'wound',
        source,
        label_pt: `Death Saves passados :: -${passed} no Death Save`,
        scope: 'deathSave',
        value: -passed,
        sign: 'negative',
        detail: 'Zera ao estabilizar',
        removable: false,
      });
    }
  } else if (derived.ignoreWoundState || derived.ignoreSeriouslyWounded) {
    rows.push({
      id: 'wound:ignored',
      sourceKind: 'wound',
      source: 'Estado de ferimento',
      label_pt: 'Penalidade de ferimento ignorada',
      scope: 'state',
      value: 0,
      sign: 'positive',
      detail: 'concedido por status ou equipamento',
      removable: false,
    });
  }
  return rows;
}

function armorRows(character: DigestCharacter, derived: DigestDerived): EffectRow[] {
  const rows: EffectRow[] = [];
  const penalty = num(derived.armorPenalty);
  if (penalty) {
    rows.push({
      id: 'armor:penalty',
      sourceKind: 'armor',
      source: 'Armadura',
      label_pt: `Armadura :: -${penalty} em REF, DEX e MOVE`,
      scope: 'stat',
      value: -penalty,
      sign: 'negative',
      detail: 'penalidade da peca mais pesada',
      removable: false,
    });
  }
  const headLost = num(derived.headSp) - num(derived.currentHeadSp);
  const bodyLost = num(derived.bodySp) - num(derived.currentBodySp);
  if (headLost > 0 || bodyLost > 0) {
    rows.push({
      id: 'armor:ablation',
      sourceKind: 'armor',
      source: 'Ablacao de armadura',
      label_pt: `SP perdido :: cabeca -${Math.max(0, headLost)} / corpo -${Math.max(0, bodyLost)}`,
      scope: 'armor',
      value: -(Math.max(0, headLost) + Math.max(0, bodyLost)),
      sign: 'negative',
      detail: `atual ${num(derived.currentHeadSp)}/${num(derived.headSp)} e ${num(derived.currentBodySp)}/${num(derived.bodySp)}`,
      removable: false,
    });
  }
  if (character.shield) {
    rows.push({
      id: 'shield:arm',
      sourceKind: 'shield',
      source: 'Escudo',
      label_pt: 'Escudo ocupa um braco / mao',
      scope: 'state',
      value: 0,
      sign: 'neutral',
      detail: 'sem mao livre para armas de duas maos',
      removable: false,
    });
  }
  return rows;
}

function cyberwareRows(input: EffectDigestInput): EffectRow[] {
  const installed = input.installedCyberware || [];
  if (!installed.length) return [];
  const rows: EffectRow[] = [];

  const statMods = cyberwareStatMods(installed);
  Object.entries(statMods).forEach(([stat, value]) => {
    const amount = num(value);
    if (!amount) return;
    const from = installed.filter(item => {
      const map = (item.statMod || {}) as Record<string, unknown>;
      return Object.keys(map).some(key => key.toUpperCase() === stat.toUpperCase());
    }).map(item => item.name || item.code).join(', ');
    rows.push({
      id: `cyber:stat:${stat}`,
      sourceKind: 'cyberware',
      source: from || 'Cyberware',
      label_pt: `${from || 'Cyberware'} :: ${signed(amount)} ${stat}`,
      scope: 'stat',
      stat,
      value: amount,
      sign: signOf(amount),
      removable: false,
    });
  });

  installed.forEach(item => {
    const map = (item.skillBonus || {}) as Record<string, unknown>;
    Object.entries(map).forEach(([skill, value]) => {
      const amount = num(value);
      if (!amount) return;
      rows.push({
        id: `cyber:skill:${item.code}:${skill}`,
        sourceKind: 'cyberware',
        source: item.name || item.code || 'Cyberware',
        label_pt: `${item.name || item.code} :: ${signed(amount)} em ${skill}`,
        scope: 'skill',
        value: amount,
        sign: signOf(amount),
        removable: false,
      });
    });
  });

  const humanityCost = cyberwareHumanityLoss(installed);
  if (humanityCost) {
    rows.push({
      id: 'cyber:humanity',
      sourceKind: 'cyberware',
      source: 'Chrome instalado',
      label_pt: `Chrome instalado :: -${humanityCost} de Humanidade`,
      scope: 'state',
      value: -humanityCost,
      sign: 'negative',
      detail: 'custo permanente enquanto instalado',
      removable: false,
    });
  }

  const bonuses = cyberwareBonuses(installed);
  Object.entries(bonuses.immunities || {}).forEach(([key, effects]) => {
    (effects || []).forEach((raw, index) => {
      const effect = raw as { from?: string; sourceCode?: string };
      rows.push({
        id: `cyber:immunity:${key}:${index}`,
        sourceKind: 'cyberware',
        source: effect.from || effect.sourceCode || 'Cyberware',
        label_pt: `${effect.from || effect.sourceCode} :: imune a ${key}`,
        scope: 'immunity',
        value: 0,
        sign: 'positive',
        removable: false,
      });
    });
  });
  return rows;
}

function stateRows(character: DigestCharacter, derived: DigestDerived): EffectRow[] {
  const rows: EffectRow[] = [];
  if (derived.cyberpsychosisExtreme || derived.cyberpsychosisActive) {
    rows.push({
      id: 'humanity:cyberpsychosis',
      sourceKind: 'humanity',
      source: 'Humanidade',
      label_pt: derived.cyberpsychosisExtreme
        ? 'Cyberpsychosis extrema :: humanidade abaixo de zero'
        : 'Cyberpsychosis :: humanidade zerada',
      scope: 'state',
      value: 0,
      sign: 'negative',
      detail: `HUM ${num(derived.humanityCurrent)}/${num(derived.humanityMax)}`,
      removable: false,
    });
  }
  const healingMultiplier = num(derived.naturalHealingMultiplier, 1);
  if (healingMultiplier > 1) {
    rows.push({
      id: 'cyber:healing',
      sourceKind: 'cyberware',
      source: 'Cura acelerada',
      label_pt: `Cura natural x${healingMultiplier} :: +${num(derived.naturalHealingPerRest)} por descanso`,
      scope: 'healing',
      value: num(derived.naturalHealingPerRest),
      sign: 'positive',
      removable: false,
    });
  }
  const bodyType = String(character.bodyType || 'meat');
  if (bodyType !== 'meat') {
    const label = BODY_TYPES.find(row => row.id === bodyType)?.label_pt || bodyType;
    rows.push({
      id: 'body:inorganic',
      sourceKind: 'body',
      source: label,
      label_pt: `${label} :: imune a venenos e drogas`,
      scope: 'immunity',
      value: 0,
      sign: 'positive',
      detail: 'sem carne para envenenar',
      removable: false,
    });
  }
  if (derived.skipDeathSave) {
    rows.push({
      id: 'state:skip-death-save',
      sourceKind: 'status',
      source: 'Death Save',
      label_pt: 'Death Save dispensado',
      scope: 'state',
      value: 0,
      sign: 'positive',
      removable: false,
    });
  }
  return rows;
}

// ------------------------------------------------------------------- digest

export function characterEffectDigest(input: EffectDigestInput): EffectDigest {
  const character = input.character || {};
  const derived = input.derived || {};
  const rows = [
    ...injuryRows(character),
    ...statusRows(character),
    ...woundRows(character, derived),
    ...armorRows(character, derived),
    ...cyberwareRows(input),
    ...stateRows(character, derived),
  ];

  // Totals come from the derived stats, not from summing these rows: the rows
  // are an explanation of that number and must never contradict it.
  const totals: EffectTotals = {
    action: -num(derived.actionPenalty),
    move: -num(derived.movePenalty),
    deathSave: num(derived.deathSaveModifier),
    evasion: num(derived.evasionMod),
    statPenalties: { ...(derived.statPenalties || {}) },
  };

  const headlineParts = [
    totals.action ? `${signed(totals.action)} acoes` : '',
    totals.move ? `${signed(totals.move)} MOVE` : '',
    totals.deathSave ? `${signed(totals.deathSave)} Death Save` : '',
    totals.evasion ? `${signed(totals.evasion)} evasao` : '',
  ].filter(Boolean);

  return {
    rows,
    negatives: rows.filter(row => row.sign === 'negative'),
    positives: rows.filter(row => row.sign === 'positive'),
    neutral: rows.filter(row => row.sign === 'neutral'),
    totals,
    headline_pt: headlineParts.length ? headlineParts.join(' :: ') : 'Sem modificadores ativos',
    clean: rows.length === 0,
  };
}
