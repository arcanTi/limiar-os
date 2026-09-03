import { asNumber } from '../../domain/shared/num.ts';
import { formatIpDate } from '../../domain/economy/index.ts';
import {
  achievementEntry,
  awardAchievementPatch,
  isEmptyAward,
  normalizeAchievementList,
  partyAchievementHistory,
  undoAchievementPatch,
} from '../../domain/progression/index.ts';

// SYS.01/CONQ // CONQUISTAS tab: what the table has earned, and the GM console
// that awards it. One award is one entry: the party form replicates the same
// id across every sheet, so the history groups it back into a single row and a
// mistaken award is undone in one gesture instead of character by character.

const EMPTY_DRAFT = { title: '', note: '', ip: '', levels: '0', scope: 'party', targetIds: [] };

export function achievementDraftFrom(state) {
  const draft = (state || {}).achievementDraft;
  return draft ? { ...EMPTY_DRAFT, ...draft } : { ...EMPTY_DRAFT };
}

export function achievementsRenderVals(state = {}, deps = {}) {
  const S = state;
  const draft = achievementDraftFrom(S);
  const characters = Array.isArray(S.characters) ? S.characters : [];
  const isParty = draft.scope !== 'individual';
  const selectedIds = Array.isArray(draft.targetIds) ? draft.targetIds : [];
  const targetIds = isParty ? characters.map(c => c.id) : selectedIds;
  const ip = asNumber(draft.ip, 0, 0, 9999);
  const levels = asNumber(draft.levels, 0, 0, 10);
  const canApply = !!String(draft.title || '').trim() && (ip > 0 || levels > 0) && targetIds.length > 0;

  const activeCharacter = characters.find(c => c.id === S.activeCharacterId) || characters[0] || {};
  const characterAchievementRows = normalizeAchievementList(activeCharacter.achievements).map(entry => ({
    id: entry.id,
    title: entry.title,
    note: entry.note,
    hasNote: !!entry.note,
    when: formatIpDate(entry.at),
    ipLabel: entry.ip > 0 ? '+' + entry.ip + ' IP' : 'SEM IP',
    levelLabel: entry.levels > 0 ? '+' + entry.levels + ' LVL' : '--',
    scopeLabel: entry.scope === 'party' ? 'PARTY' : 'INDIVIDUAL',
    scopeColor: entry.scope === 'party' ? '#3fe0d0' : '#d6aa4e',
  }));

  const partyAchievementRows = partyAchievementHistory(characters).map(row => ({
    id: row.id,
    title: row.title,
    note: row.note,
    hasNote: !!row.note,
    when: formatIpDate(row.at),
    ipLabel: row.ip > 0 ? '+' + row.ip + ' IP' : 'SEM IP',
    levelLabel: row.levels > 0 ? '+' + row.levels + ' LVL' : '--',
    scopeLabel: row.scope === 'party' ? 'PARTY' : 'INDIVIDUAL',
    membersLabel: row.memberNames.join(', '),
    memberCount: row.memberCount,
    onUndo: () => deps.undoAchievement(row.id),
  }));

  return {
    achievementTitle: draft.title,
    achievementNote: draft.note,
    achievementIp: draft.ip,
    achievementLevels: draft.levels,
    onAchievementTitle: (e) => deps.setAchievementField('title', e.target.value),
    onAchievementNote: (e) => deps.setAchievementField('note', e.target.value),
    onAchievementIp: (e) => deps.setAchievementField('ip', e.target.value),
    onAchievementLevels: (e) => deps.setAchievementField('levels', e.target.value),

    achievementScopeParty: isParty,
    achievementScopeIndividual: !isParty,
    achievementPartyBtnStyle: 'lm-ui-btn lm-ui-btn--compact' + (isParty ? ' lm-ui-btn--teal' : ' lm-ui-btn--ghost-teal'),
    achievementIndividualBtnStyle: 'lm-ui-btn lm-ui-btn--compact' + (isParty ? ' lm-ui-btn--ghost-gold' : ' lm-ui-btn--gold'),
    setAchievementScopeParty: () => deps.setAchievementField('scope', 'party'),
    setAchievementScopeIndividual: () => deps.setAchievementField('scope', 'individual'),

    achievementTargetRows: characters.map(character => {
      const checked = isParty || selectedIds.includes(character.id);
      return {
        id: character.id,
        name: character.name || character.id,
        meta: 'LVL ' + asNumber(character.level, 1, 1, 99) + ' // ' + asNumber(character.ip, 0, 0, 999999) + ' IP',
        checked,
        notChecked: !checked,
        onToggle: () => deps.toggleAchievementTarget(character.id),
      };
    }),
    noAchievementTargets: characters.length === 0,
    achievementTargetsLocked: isParty,
    achievementApplyCount: targetIds.length,
    achievementApplyLabel: 'REGISTRAR CONQUISTA // ' + targetIds.length + ' ALVO(S)',
    achievementApplyBtnStyle: 'lm-ip-award-btn' + (canApply ? ' lm-ip-award-btn--on' : ' lm-ip-award-btn--off'),
    achievementPreview: (levels > 0 ? '+' + levels + ' nivel(is)' : 'sem level up')
      + ' // ' + (ip > 0 ? '+' + ip + ' IP' : 'sem IP')
      + ' // ' + (isParty ? 'toda a party' : selectedIds.length + ' selecionado(s)'),
    applyAchievement: () => deps.applyAchievement(),
    clearAchievementDraft: () => deps.clearAchievementDraft(),
    // The two gestures a table actually repeats: everyone goes up one level,
    // or whoever is selected does. Both go through the same award path.
    quickLevelParty: () => deps.quickLevelUp('party'),
    quickLevelSelected: () => deps.quickLevelUp('individual'),

    characterAchievementRows,
    noCharacterAchievements: characterAchievementRows.length === 0,
    achievementOwnerName: activeCharacter.name || 'OPERATIVE',
    achievementOwnerLevel: asNumber(activeCharacter.level, 1, 1, 99),
    partyAchievementRows,
    noPartyAchievements: partyAchievementRows.length === 0,
  };
}

// component: the Component instance (state/setState/ensureGm/flash/postChat/
// applyCharacterPatch already live there and aren't duplicated here).
export function achievementsHandlers(component) {
  function draft() {
    return achievementDraftFrom(component.state);
  }

  function award(entry, targets) {
    const applied = [];
    targets.forEach(target => {
      const patch = awardAchievementPatch(target, entry);
      if (!patch) return;
      component.applyCharacterPatch(target.id, patch);
      applied.push(String(target.name || target.id).toUpperCase());
    });
    return applied;
  }

  function resolveTargets(scope) {
    const characters = component.state.characters || [];
    if (scope !== 'individual') return characters;
    const selected = draft().targetIds || [];
    return characters.filter(c => selected.includes(c.id));
  }

  function applyAchievement(overrides) {
    if (!component.ensureGm('Login do mestre necessario para registrar conquistas')) return;
    const current = { ...draft(), ...(overrides || {}) };
    const title = String(current.title || '').trim();
    if (!title) return component.flash('De um nome a conquista');
    const entry = achievementEntry({
      ...current,
      title,
      awardedBy: (component.state.authUser || {}).username || '',
    });
    if (isEmptyAward(entry)) return component.flash('Informe IP ou niveis para a conquista');
    const targets = resolveTargets(entry.scope);
    if (!targets.length) return component.flash('Selecione ao menos um personagem');
    const applied = award(entry, targets);
    if (!applied.length) return component.flash('Conquista ja registrada nestes personagens');
    component.postChat({
      kind: 'text',
      sender: 'SISTEMA',
      text: 'CONQUISTA :: ' + entry.title.toUpperCase()
        + ' :: ' + (entry.levels ? '+' + entry.levels + ' NIVEL // ' : '')
        + (entry.ip ? '+' + entry.ip + ' IP // ' : '')
        + applied.join(', '),
    });
    component.setState({ achievementDraft: { ...EMPTY_DRAFT } });
    component.flash('Conquista registrada: ' + entry.title);
  }

  return {
    setAchievementField: (key, value) => component.setState(s => ({
      achievementDraft: { ...achievementDraftFrom(s), [key]: value },
    })),

    toggleAchievementTarget: (characterId) => component.setState(s => {
      const current = achievementDraftFrom(s);
      const ids = Array.isArray(current.targetIds) ? current.targetIds : [];
      const targetIds = ids.includes(characterId)
        ? ids.filter(id => id !== characterId)
        : [...ids, characterId];
      // Ticking a single name is the gesture that means "this one, not the
      // whole table", so it switches the scope instead of being ignored.
      return { achievementDraft: { ...current, scope: 'individual', targetIds } };
    }),

    clearAchievementDraft: () => component.setState({ achievementDraft: { ...EMPTY_DRAFT } }),

    applyAchievement,

    // A level up needs no draft at all: an untitled one is still recorded, so
    // the history says when the table went up and who was there.
    quickLevelUp(scope) {
      const current = draft();
      const title = String(current.title || '').trim() || 'LEVEL UP';
      applyAchievement({ ...current, title, scope, levels: asNumber(current.levels, 1, 1, 10) });
    },

    undoAchievement(achievementId) {
      if (!component.ensureGm('Login do mestre necessario para desfazer conquistas')) return;
      const characters = component.state.characters || [];
      let touched = 0;
      characters.forEach(character => {
        const patch = undoAchievementPatch(character, achievementId);
        if (!patch) return;
        component.applyCharacterPatch(character.id, patch);
        touched += 1;
      });
      if (!touched) return component.flash('Conquista nao encontrada');
      component.flash('Conquista desfeita em ' + touched + ' ficha(s)');
    },
  };
}
