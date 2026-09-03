import { describe, expect, it, vi } from 'vitest';

import { achievementsHandlers, achievementsRenderVals } from '../../../src/ui/views/achievements.js';

const characters = [
  { id: 'rook', name: 'Rook', level: 3, ip: 100 },
  { id: 'ghost', name: 'Ghost', level: 2, ip: 40 },
];

const deps = {
  setAchievementField: vi.fn(),
  toggleAchievementTarget: vi.fn(),
  clearAchievementDraft: vi.fn(),
  applyAchievement: vi.fn(),
  quickLevelUp: vi.fn(),
  undoAchievement: vi.fn(),
};

describe('ui/views/achievements achievementsRenderVals', () => {
  it('defaults to the whole party, with every name ticked and locked', () => {
    const vals = achievementsRenderVals({ characters }, deps);
    expect(vals.achievementScopeParty).toBe(true);
    expect(vals.achievementApplyCount).toBe(2);
    expect(vals.achievementTargetsLocked).toBe(true);
    expect(vals.achievementTargetRows.every(row => row.checked)).toBe(true);
    expect(vals.achievementTargetRows[0].meta).toBe('LVL 3 // 100 IP');
  });

  it('counts only the ticked names in the individual scope', () => {
    const state = { characters, achievementDraft: { scope: 'individual', targetIds: ['ghost'] } };
    const vals = achievementsRenderVals(state, deps);
    expect(vals.achievementScopeIndividual).toBe(true);
    expect(vals.achievementApplyCount).toBe(1);
    expect(vals.achievementTargetRows.find(row => row.id === 'rook').notChecked).toBe(true);
  });

  it('enables the apply button only for a titled, non-empty award', () => {
    const empty = achievementsRenderVals({ characters }, deps);
    expect(empty.achievementApplyBtnStyle).toBe('lm-ip-award-btn lm-ip-award-btn--off');

    const titledOnly = achievementsRenderVals({ characters, achievementDraft: { title: 'Job' } }, deps);
    expect(titledOnly.achievementApplyBtnStyle).toBe('lm-ip-award-btn lm-ip-award-btn--off');

    const ready = achievementsRenderVals({ characters, achievementDraft: { title: 'Job', ip: '40' } }, deps);
    expect(ready.achievementApplyBtnStyle).toBe('lm-ip-award-btn lm-ip-award-btn--on');
  });

  it('previews what the award will actually do', () => {
    const vals = achievementsRenderVals({ characters, achievementDraft: { title: 'Job', ip: '40', levels: '1' } }, deps);
    expect(vals.achievementPreview).toBe('+1 nivel(is) // +40 IP // toda a party');
  });

  it('lists the active sheet achievements and the grouped table history', () => {
    const entry = { id: 'ach-1', title: 'Queda da Arasaka', note: 'sem baixas', at: '2026-09-03T12:00:00.000Z', ip: 50, levels: 1, scope: 'party' };
    const withHistory = [
      { ...characters[0], achievements: [entry] },
      { ...characters[1], achievements: [entry] },
    ];
    const vals = achievementsRenderVals({ characters: withHistory, activeCharacterId: 'rook' }, deps);
    expect(vals.noCharacterAchievements).toBe(false);
    expect(vals.characterAchievementRows[0]).toMatchObject({ title: 'Queda da Arasaka', ipLabel: '+50 IP', levelLabel: '+1 LVL', scopeLabel: 'PARTY' });
    expect(vals.partyAchievementRows).toHaveLength(1);
    expect(vals.partyAchievementRows[0].membersLabel).toBe('Rook, Ghost');
    vals.partyAchievementRows[0].onUndo();
    expect(deps.undoAchievement).toHaveBeenCalledWith('ach-1');
  });

  it('reports both empty states on a fresh campaign', () => {
    const vals = achievementsRenderVals({ characters }, deps);
    expect(vals.noCharacterAchievements).toBe(true);
    expect(vals.noPartyAchievements).toBe(true);
    expect(vals.noAchievementTargets).toBe(false);
  });

  it('wires the draft fields and the quick level-up buttons', () => {
    const vals = achievementsRenderVals({ characters }, deps);
    vals.onAchievementIp({ target: { value: '25' } });
    expect(deps.setAchievementField).toHaveBeenCalledWith('ip', '25');
    vals.setAchievementScopeIndividual();
    expect(deps.setAchievementField).toHaveBeenCalledWith('scope', 'individual');
    vals.quickLevelParty();
    expect(deps.quickLevelUp).toHaveBeenCalledWith('party');
    vals.quickLevelSelected();
    expect(deps.quickLevelUp).toHaveBeenCalledWith('individual');
  });
});

function fakeComponent(overrides = {}) {
  const component = {
    state: { gmAuthenticated: true, characters: characters.map(c => ({ ...c })), authUser: { username: 'gm1' }, ...overrides },
    flashes: [],
    chat: [],
    patches: [],
    ensureGm() { return this.state.gmAuthenticated; },
    flash(message) { this.flashes.push(message); },
    postChat(message) { this.chat.push(message); },
    setState(update) {
      const patch = typeof update === 'function' ? update(this.state) : update;
      this.state = { ...this.state, ...patch };
    },
    applyCharacterPatch(id, patch) {
      this.patches.push({ id, patch });
      this.state = {
        ...this.state,
        characters: this.state.characters.map(c => (c.id === id ? { ...c, ...patch } : c)),
      };
    },
  };
  return component;
}

describe('ui/views/achievements achievementsHandlers', () => {
  it('awards the same entry to every party member and announces it', () => {
    const component = fakeComponent();
    const handlers = achievementsHandlers(component);
    handlers.setAchievementField('title', 'Queda da Arasaka');
    handlers.setAchievementField('ip', '50');
    handlers.setAchievementField('levels', '1');
    handlers.applyAchievement();

    expect(component.patches).toHaveLength(2);
    const [rook, ghost] = component.state.characters;
    expect(rook).toMatchObject({ level: 4, ip: 150 });
    expect(ghost).toMatchObject({ level: 3, ip: 90 });
    expect(rook.achievements[0].id).toBe(ghost.achievements[0].id);
    expect(component.chat[0].text).toContain('QUEDA DA ARASAKA');
    expect(component.state.achievementDraft.title).toBe('');
  });

  it('awards only the ticked characters in the individual scope', () => {
    const component = fakeComponent();
    const handlers = achievementsHandlers(component);
    handlers.setAchievementField('title', 'Solo Run');
    handlers.setAchievementField('ip', '20');
    handlers.toggleAchievementTarget('ghost');
    handlers.applyAchievement();

    expect(component.patches).toHaveLength(1);
    expect(component.patches[0].id).toBe('ghost');
    expect(component.state.characters[0].ip).toBe(100);
  });

  it('refuses an untitled or empty award', () => {
    const component = fakeComponent();
    const handlers = achievementsHandlers(component);
    handlers.applyAchievement();
    expect(component.flashes[0]).toBe('De um nome a conquista');

    handlers.setAchievementField('title', 'Nada');
    handlers.applyAchievement();
    expect(component.flashes[1]).toBe('Informe IP ou niveis para a conquista');
    expect(component.patches).toHaveLength(0);
  });

  it('refuses an individual award with nothing ticked', () => {
    const component = fakeComponent();
    const handlers = achievementsHandlers(component);
    handlers.setAchievementField('title', 'Job');
    handlers.setAchievementField('ip', '10');
    handlers.setAchievementField('scope', 'individual');
    handlers.applyAchievement();
    expect(component.flashes[0]).toBe('Selecione ao menos um personagem');
  });

  it('levels the whole party up with no draft at all', () => {
    const component = fakeComponent();
    achievementsHandlers(component).quickLevelUp('party');
    expect(component.state.characters.map(c => c.level)).toEqual([4, 3]);
    expect(component.state.characters[0].achievements[0].title).toBe('LEVEL UP');
    expect(component.state.characters[0].achievements[0].ip).toBe(0);
  });

  it('undoes one award across every sheet that carries it', () => {
    const component = fakeComponent();
    const handlers = achievementsHandlers(component);
    handlers.setAchievementField('title', 'Errado');
    handlers.setAchievementField('ip', '30');
    handlers.setAchievementField('levels', '1');
    handlers.applyAchievement();
    const awardId = component.state.characters[0].achievements[0].id;

    handlers.undoAchievement(awardId);
    expect(component.state.characters[0]).toMatchObject({ level: 3, ip: 100, achievements: [] });
    expect(component.state.characters[1]).toMatchObject({ level: 2, ip: 40, achievements: [] });
  });

  it('refuses every write without a GM session', () => {
    const component = fakeComponent({ gmAuthenticated: false });
    const handlers = achievementsHandlers(component);
    handlers.setAchievementField('title', 'Job');
    handlers.setAchievementField('ip', '10');
    handlers.applyAchievement();
    handlers.undoAchievement('whatever');
    expect(component.patches).toHaveLength(0);
  });
});
