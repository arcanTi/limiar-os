import {
  BODY_TYPES,
  CPR_TOXIN_AMMUNITION,
  TOXIN_DELIVERIES,
  TOXIN_INTENSITIES,
  intensityRow,
  normalizeToxin,
  toxinCatalog,
  toxinImmunity,
} from '../../domain/toxins/index.ts';

// TOX.01 // GM toxin bench: apply a dose to selected targets, and author the
// campaign's own toxins on top of the book's three intensity rungs.

const EMPTY_DRAFT = {
  id: '', name: '', kind: 'poison', intensity: 'mild',
  resistDV: '', damage: '', delivery: 'injected', effect_pt: '',
};

export function toxinDraftFrom(toxin) {
  if (!toxin) return { ...EMPTY_DRAFT };
  return {
    id: toxin.id || '',
    name: toxin.name || '',
    kind: toxin.kind || 'poison',
    intensity: toxin.intensity || 'mild',
    resistDV: String(toxin.resistDV ?? ''),
    damage: toxin.damage || '',
    delivery: toxin.delivery || 'injected',
    effect_pt: toxin.effect_pt || '',
  };
}

export function toxinsRenderVals(state = {}, deps = {}) {
  const S = state;
  const draft = S.toxinDraft || EMPTY_DRAFT;
  const apply = S.toxinApply || {};
  const catalog = toxinCatalog(S.toxins);
  const selectedId = apply.toxinId || (catalog[0] && catalog[0].id) || '';
  const selected = catalog.find(t => t.id === selectedId) || null;
  const selectedTargets = Array.isArray(apply.targetIds) ? apply.targetIds : [];
  const characters = Array.isArray(S.characters) ? S.characters : [];

  const toxinOptions = catalog.map(toxin => ({
    id: toxin.id,
    label: `${toxin.name} :: DV${toxin.resistDV}${toxin.damage ? ' :: ' + toxin.damage : ''}`,
    selected: toxin.id === selectedId,
    notSelected: toxin.id !== selectedId,
  }));

  // Immunity is surfaced before the roll so the GM does not waste a dose on a
  // drone and then wonder why nothing happened.
  const targetRows = characters.map(character => {
    const withCyberware = deps.installedCyberware
      ? { ...character, installedCyberware: deps.installedCyberware(character) }
      : character;
    const immunity = selected ? toxinImmunity(withCyberware, selected) : { immune: false, reason_pt: '' };
    const checked = selectedTargets.includes(character.id);
    return {
      id: character.id,
      name: character.name || character.id,
      bodyLabel: (BODY_TYPES.find(row => row.id === (character.bodyType || 'meat')) || {}).label_pt || 'Organico (meat)',
      immune: immunity.immune,
      notImmune: !immunity.immune,
      immunityReason: immunity.reason_pt,
      checked,
      notChecked: !checked,
      onToggle: () => deps.toggleToxinTarget(character.id),
    };
  });

  const intensityDefaults = intensityRow(draft.intensity);
  const preview = normalizeToxin({
    ...draft,
    resistDV: draft.resistDV === '' ? undefined : Number(draft.resistDV),
    damage: draft.damage,
  });

  const customRows = (Array.isArray(S.toxins) ? S.toxins : []).map((toxin, index) => ({
    id: toxin.id,
    label: `${toxin.name} :: DV${toxin.resistDV}${toxin.damage ? ' :: ' + toxin.damage : ''}`,
    onEdit: () => deps.editToxin(index),
    onDelete: () => deps.deleteToxin(index),
  }));

  return {
    toxinOptions,
    toxinTargetRows: targetRows,
    noToxinTargets: targetRows.length === 0,
    toxinSelectedName: selected ? selected.name : '',
    toxinSelectedSummary: selected
      ? `${selected.kind === 'drug' ? 'DROGA' : 'VENENO'} :: DV${selected.resistDV} :: ${selected.damage || 'sem dano'} :: ${selected.effect_pt}`
      : 'Nenhuma toxina selecionada',
    toxinApplyModifier: apply.modifier === undefined ? '' : String(apply.modifier),
    toxinApplyCount: selectedTargets.length,
    canApplyToxin: !!selected && selectedTargets.length > 0,
    onToxinSelect: (e) => deps.setToxinApplyField('toxinId', e.target.value),
    onToxinModifier: (e) => deps.setToxinApplyField('modifier', e.target.value),
    applyToxin: () => deps.applyToxin(),

    toxinDraftId: draft.id,
    toxinDraftName: draft.name,
    toxinDraftKind: draft.kind,
    toxinDraftIsPoison: draft.kind === 'poison',
    toxinDraftIsDrug: draft.kind === 'drug',
    toxinDraftIntensity: draft.intensity,
    toxinIntensityOptions: TOXIN_INTENSITIES.map(row => ({
      id: row.id,
      label: `${row.label_pt} (DV${row.resistDV} / ${row.damage})`,
      selected: row.id === draft.intensity,
      notSelected: row.id !== draft.intensity,
    })),
    toxinDeliveryOptions: TOXIN_DELIVERIES.map(row => ({
      id: row.id,
      label: row.label_pt,
      selected: row.id === draft.delivery,
      notSelected: row.id !== draft.delivery,
    })),
    toxinDraftResistDV: draft.resistDV,
    toxinDraftDamage: draft.damage,
    toxinDraftEffect: draft.effect_pt,
    toxinDraftDvPlaceholder: `padrao ${intensityDefaults.resistDV}`,
    toxinDraftDamagePlaceholder: `padrao ${intensityDefaults.damage || 'sem dano'}`,
    toxinDraftPreview: `${preview.name} :: DV${preview.resistDV} :: ${preview.damage || 'sem dano'}`,
    onToxinDraftName: (e) => deps.setToxinDraftField('name', e.target.value),
    onToxinDraftKind: (e) => deps.setToxinDraftField('kind', e.target.value),
    onToxinDraftIntensity: (e) => deps.setToxinDraftField('intensity', e.target.value),
    onToxinDraftDelivery: (e) => deps.setToxinDraftField('delivery', e.target.value),
    onToxinDraftResistDV: (e) => deps.setToxinDraftField('resistDV', e.target.value),
    onToxinDraftDamage: (e) => deps.setToxinDraftField('damage', e.target.value),
    onToxinDraftEffect: (e) => deps.setToxinDraftField('effect_pt', e.target.value),
    saveToxinDraft: () => deps.saveToxinDraft(),
    clearToxinDraft: () => deps.clearToxinDraft(),
    toxinCustomRows: customRows,
    noToxinCustomRows: customRows.length === 0,
    toxinAmmoRows: CPR_TOXIN_AMMUNITION.map(row => ({
      code: row.code,
      label: `${row.name} :: ${row.cost}eb :: DV${row.resistDV}${row.damage ? ' / ' + row.damage : ''}`,
      note: row.eligibleWeapons.join(', '),
    })),
  };
}

export function toxinsHandlers(component) {
  return {
    installedCyberware: (character) => component.installedCyberware(character),
    setToxinDraftField: (key, value) => component.setState(s => ({
      toxinDraft: { ...(s.toxinDraft || EMPTY_DRAFT), [key]: value },
    })),
    setToxinApplyField: (key, value) => component.setState(s => ({
      toxinApply: { ...(s.toxinApply || {}), [key]: value },
    })),
    toggleToxinTarget: (characterId) => component.setState(s => {
      const current = Array.isArray((s.toxinApply || {}).targetIds) ? s.toxinApply.targetIds : [];
      const next = current.includes(characterId)
        ? current.filter(id => id !== characterId)
        : [...current, characterId];
      return { toxinApply: { ...(s.toxinApply || {}), targetIds: next } };
    }),
    clearToxinDraft: () => component.setState({ toxinDraft: { ...EMPTY_DRAFT } }),
    editToxin: (index) => component.setState(s => ({
      toxinDraft: toxinDraftFrom((s.toxins || [])[index]),
    })),

    async saveToxinDraft() {
      if (!component.ensureGm('Login do mestre necessario para editar toxinas')) return;
      const draft = component.state.toxinDraft || EMPTY_DRAFT;
      if (!String(draft.name || '').trim()) return component.flash('Nome da toxina obrigatorio');
      const toxin = normalizeToxin({
        ...draft,
        resistDV: draft.resistDV === '' ? undefined : Number(draft.resistDV),
      });
      const current = Array.isArray(component.state.toxins) ? component.state.toxins : [];
      // Same id replaces in place, so editing keeps the row's position.
      const index = current.findIndex(row => row && row.id === toxin.id);
      const next = index >= 0
        ? current.map((row, i) => (i === index ? toxin : row))
        : [...current, toxin];
      await component.saveToxins(next, 'Toxina salva: ' + toxin.name);
      component.setState({ toxinDraft: { ...EMPTY_DRAFT } });
    },

    async deleteToxin(index) {
      if (!component.ensureGm('Login do mestre necessario para editar toxinas')) return;
      const current = Array.isArray(component.state.toxins) ? component.state.toxins : [];
      const removed = current[index];
      if (!removed) return;
      await component.saveToxins(current.filter((_row, i) => i !== index), 'Toxina removida: ' + removed.name);
    },

    applyToxin: () => component.applyToxinExposure(),
  };
}
