import {
  EFFECT_DURATION_UNITS,
  EFFECT_FLAG_SPECS,
  describeEffectModifiers,
  effectPresetCatalog,
  normalizeCustomEffect,
} from '../../domain/effects/customEffects.ts';
import { CPRED_STATUS_PRESETS } from '../../domain/conditions/constants.ts';
import { CPRED_STAT_ORDER } from '../../domain/character/constants.ts';

// EFX.01 // GM effect bench: author an effect out of the modifiers the rules
// engine actually reads, then hand it to one or more characters.

const EMPTY_DRAFT = {
  id: '', name: '', note_pt: '',
  durationValue: '', durationUnit: 'round',
  actionBonus: '', evasionMod: '', moveBonus: '', deathSaveBonus: '',
  statKey: 'REF', statValue: '',
  spHead: '', spBody: '', charges: '',
  ignoreSeriouslyWounded: false, ignoreWoundState: false, skipDeathSave: false,
};

export function effectDraftFrom(effect) {
  if (!effect) return { ...EMPTY_DRAFT };
  const modifiers = effect.modifiers || {};
  const statBonus = modifiers.statBonus || {};
  const statKey = Object.keys(statBonus)[0] || 'REF';
  const ablation = modifiers.spAblation || {};
  return {
    ...EMPTY_DRAFT,
    id: effect.id || '',
    name: effect.label_pt || '',
    note_pt: effect.note_pt || '',
    durationValue: effect.duration ? String(effect.duration.value) : '',
    durationUnit: effect.duration ? effect.duration.unit : 'round',
    actionBonus: modifiers.actionBonus == null ? '' : String(modifiers.actionBonus),
    evasionMod: modifiers.evasionMod == null ? '' : String(modifiers.evasionMod),
    moveBonus: modifiers.moveBonus == null ? '' : String(modifiers.moveBonus),
    deathSaveBonus: modifiers.deathSaveBonus == null ? '' : String(modifiers.deathSaveBonus),
    statKey,
    statValue: statBonus[statKey] == null ? '' : String(statBonus[statKey]),
    spHead: ablation.head ? String(ablation.head) : '',
    spBody: ablation.body ? String(ablation.body) : '',
    charges: modifiers.charges == null ? '' : String(modifiers.charges),
    ignoreSeriouslyWounded: !!modifiers.ignoreSeriouslyWounded,
    ignoreWoundState: !!modifiers.ignoreWoundState,
    skipDeathSave: !!modifiers.skipDeathSave,
  };
}

/** Draft (all strings, flat) -> the shape normalizeCustomEffect expects. */
export function effectFromDraft(draft) {
  const d = draft || EMPTY_DRAFT;
  return {
    id: d.id || '',
    name: d.name,
    note_pt: d.note_pt,
    duration: { value: d.durationValue, unit: d.durationUnit },
    modifiers: {
      actionBonus: d.actionBonus,
      evasionMod: d.evasionMod,
      moveBonus: d.moveBonus,
      deathSaveBonus: d.deathSaveBonus,
      statBonus: d.statValue === '' ? {} : { [d.statKey]: d.statValue },
      spAblation: { head: d.spHead, body: d.spBody },
      charges: d.charges,
      ignoreSeriouslyWounded: d.ignoreSeriouslyWounded,
      ignoreWoundState: d.ignoreWoundState,
      skipDeathSave: d.skipDeathSave,
    },
  };
}

export function gmEffectsRenderVals(state = {}, deps = {}) {
  const S = state;
  const draft = S.effectDraft || EMPTY_DRAFT;
  const apply = S.effectApply || {};
  const catalog = effectPresetCatalog(CPRED_STATUS_PRESETS, S.customEffects);
  const selectedId = apply.effectId || (catalog[0] && catalog[0].id) || '';
  const selected = catalog.find(row => row.id === selectedId) || null;
  const selectedTargets = Array.isArray(apply.targetIds) ? apply.targetIds : [];
  const characters = Array.isArray(S.characters) ? S.characters : [];
  const preview = normalizeCustomEffect(effectFromDraft(draft));

  return {
    effectOptions: catalog.map(row => ({
      id: row.id,
      label: (row.custom ? '* ' : '') + row.label_pt,
      selected: row.id === selectedId,
      notSelected: row.id !== selectedId,
    })),
    effectSelectedSummary: selected
      ? describeEffectModifiers(selected.modifiers) + (selected.duration ? ` :: dura ${selected.duration.value} ${selected.duration.unit}` : ' :: indefinido')
      : 'Nenhum efeito selecionado',
    effectTargetRows: characters.map(character => {
      const checked = selectedTargets.includes(character.id);
      return {
        id: character.id,
        name: character.name || character.id,
        activeCount: (character.statusEffects || []).length,
        checked,
        notChecked: !checked,
        onToggle: () => deps.toggleEffectTarget(character.id),
      };
    }),
    noEffectTargets: characters.length === 0,
    effectApplyCount: selectedTargets.length,
    onEffectSelect: (e) => deps.setEffectApplyField('effectId', e.target.value),
    applyEffect: () => deps.applyEffectToTargets(),

    effectDraftName: draft.name,
    effectDraftNote: draft.note_pt,
    effectDraftDurationValue: draft.durationValue,
    effectDurationOptions: EFFECT_DURATION_UNITS.map(row => ({
      id: row.id,
      label: row.label_pt,
      selected: row.id === draft.durationUnit,
      notSelected: row.id !== draft.durationUnit,
    })),
    effectDraftAction: draft.actionBonus,
    effectDraftEvasion: draft.evasionMod,
    effectDraftMove: draft.moveBonus,
    effectDraftDeathSave: draft.deathSaveBonus,
    effectDraftStatValue: draft.statValue,
    effectStatOptions: CPRED_STAT_ORDER.map(stat => ({
      id: stat,
      label: stat,
      selected: stat === draft.statKey,
      notSelected: stat !== draft.statKey,
    })),
    effectDraftSpHead: draft.spHead,
    effectDraftSpBody: draft.spBody,
    effectDraftCharges: draft.charges,
    effectFlagRows: EFFECT_FLAG_SPECS.map(spec => ({
      key: spec.key,
      label: spec.label_pt,
      checked: !!draft[spec.key],
      notChecked: !draft[spec.key],
      onToggle: (e) => deps.setEffectDraftField(spec.key, e.target.checked),
    })),
    // The preview is the honest answer to "what will this actually do?" — it
    // is built by the same normalizer that will be saved, so anything the
    // engine ignores is already gone from it.
    effectDraftPreview: describeEffectModifiers(preview.modifiers),
    onEffectDraftName: (e) => deps.setEffectDraftField('name', e.target.value),
    onEffectDraftNote: (e) => deps.setEffectDraftField('note_pt', e.target.value),
    onEffectDraftDurationValue: (e) => deps.setEffectDraftField('durationValue', e.target.value),
    onEffectDraftDurationUnit: (e) => deps.setEffectDraftField('durationUnit', e.target.value),
    onEffectDraftAction: (e) => deps.setEffectDraftField('actionBonus', e.target.value),
    onEffectDraftEvasion: (e) => deps.setEffectDraftField('evasionMod', e.target.value),
    onEffectDraftMove: (e) => deps.setEffectDraftField('moveBonus', e.target.value),
    onEffectDraftDeathSave: (e) => deps.setEffectDraftField('deathSaveBonus', e.target.value),
    onEffectDraftStatKey: (e) => deps.setEffectDraftField('statKey', e.target.value),
    onEffectDraftStatValue: (e) => deps.setEffectDraftField('statValue', e.target.value),
    onEffectDraftSpHead: (e) => deps.setEffectDraftField('spHead', e.target.value),
    onEffectDraftSpBody: (e) => deps.setEffectDraftField('spBody', e.target.value),
    onEffectDraftCharges: (e) => deps.setEffectDraftField('charges', e.target.value),
    saveEffectDraft: () => deps.saveEffectDraft(),
    clearEffectDraft: () => deps.clearEffectDraft(),
    customEffectRows: (Array.isArray(S.customEffects) ? S.customEffects : []).map((effect, index) => ({
      id: effect.id,
      label: effect.label_pt + ' :: ' + describeEffectModifiers(effect.modifiers),
      onEdit: () => deps.editCustomEffect(index),
      onDelete: () => deps.deleteCustomEffect(index),
    })),
    noCustomEffectRows: (Array.isArray(S.customEffects) ? S.customEffects : []).length === 0,
  };
}

export function gmEffectsHandlers(component) {
  return {
    setEffectDraftField: (key, value) => component.setState(s => ({
      effectDraft: { ...(s.effectDraft || EMPTY_DRAFT), [key]: value },
    })),
    setEffectApplyField: (key, value) => component.setState(s => ({
      effectApply: { ...(s.effectApply || {}), [key]: value },
    })),
    toggleEffectTarget: (characterId) => component.setState(s => {
      const current = Array.isArray((s.effectApply || {}).targetIds) ? s.effectApply.targetIds : [];
      const next = current.includes(characterId)
        ? current.filter(id => id !== characterId)
        : [...current, characterId];
      return { effectApply: { ...(s.effectApply || {}), targetIds: next } };
    }),
    clearEffectDraft: () => component.setState({ effectDraft: { ...EMPTY_DRAFT } }),
    editCustomEffect: (index) => component.setState(s => ({
      effectDraft: effectDraftFrom((s.customEffects || [])[index]),
    })),

    async saveEffectDraft() {
      if (!component.ensureGm('Login do mestre necessario para editar efeitos')) return;
      const draft = component.state.effectDraft || EMPTY_DRAFT;
      if (!String(draft.name || '').trim()) return component.flash('Nome do efeito obrigatorio');
      const effect = normalizeCustomEffect(effectFromDraft(draft));
      const current = Array.isArray(component.state.customEffects) ? component.state.customEffects : [];
      const index = current.findIndex(row => row && row.id === effect.id);
      const next = index >= 0
        ? current.map((row, i) => (i === index ? effect : row))
        : [...current, effect];
      await component.saveCustomEffects(next, 'Efeito salvo: ' + effect.label_pt);
      component.setState({ effectDraft: { ...EMPTY_DRAFT } });
    },

    async deleteCustomEffect(index) {
      if (!component.ensureGm('Login do mestre necessario para editar efeitos')) return;
      const current = Array.isArray(component.state.customEffects) ? component.state.customEffects : [];
      const removed = current[index];
      if (!removed) return;
      await component.saveCustomEffects(current.filter((_row, i) => i !== index), 'Efeito removido: ' + removed.label_pt);
    },

    applyEffectToTargets: () => component.applyEffectToTargets(),
  };
}
