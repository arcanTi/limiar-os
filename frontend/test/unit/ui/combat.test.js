import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { combatHandlers, combatRenderVals } from '../../../src/ui/views/combat.js';

const tx = { round: 'ROUND', turn: 'TURN', halfSp: 'HALF SP', collapseCard: 'HIDE', expandCard: 'ACTIONS', defeated: 'DEFEATED', active: 'ACTIVE', acted: 'ACTED', pending: 'PENDING', currentTurn: 'CURRENT' };

const mira = { id: 'mira', name: 'Mira', kind: 'pc', health: { cur: 27, max: 35 }, base: {}, criticalInjuries: [], statusEffects: [], gear: [] };
const rook = { id: 'rook', name: 'Rook', kind: 'pc', health: { cur: 35, max: 45 }, base: {}, criticalInjuries: [], statusEffects: [], gear: [] };

function baseCombatState() {
  return {
    active: true,
    round: 2,
    turnIndex: 0,
    order: ['mira', 'rook'],
    combatants: {
      mira: { side: 'pc', initiative: 12, acted: false, defeated: false },
      rook: { side: 'pc', initiative: 9, acted: false, defeated: false },
    },
    updatedAt: 'now',
  };
}

function renderDeps(overrides = {}) {
  return {
    tx,
    normalizeCombatState: (s) => s,
    normalizeCharacter: (c) => c,
    normalizeShield: (shield) => shield && shield.itemId ? { itemId: shield.itemId, hp: Number(shield.hp), maxHp: Number(shield.maxHp) } : null,
    currentCombatantId: (s) => s.order[s.turnIndex],
    ensureTurnTimer: vi.fn(),
    turnTimerSeconds: vi.fn(() => null),
    formatTurnTimer: (s) => String(s),
    derivedStats: () => ({ hpMax: 35, currentHeadSp: 11, headSp: 11, currentBodySp: 10, bodySp: 11 }),
    normalizeGearList: (gear) => gear || [],
    installedCyberweaponGear: () => [],
    hasDamageProfile: () => false,
    gearDamageText: () => '',
    cyberSourceBreakdown: () => [],
    ignoresHalfSpBadge: () => false,
    chipStyle: () => 'chip',
    skillCanonicalName: (name) => name,
    attackContextAvailable: () => ({ cover: false, beyond51m: false, aimedShot: false }),
    attackContextState: () => ({ cover: false, beyond51m: false, aimedShot: false }),
    toggleAttackContext: vi.fn(),
    criticalInjuryTargetOptions: () => [],
    combatTargetFor: () => '',
    setCombatTarget: vi.fn(),
    combatCheckMod: () => ({ mod: 0, sources: [] }),
    combatAttackMod: () => ({ mod: 0, sources: [], fallback: true, stat: 'REF', skillName: '' }),
    rollCombatAttack: vi.fn(),
    rollCombatDamage: vi.fn(),
    rollCombatShieldDamage: vi.fn(),
    useCombatUtility: vi.fn(),
    rollCombatCheck: vi.fn(),
    setInitiative: vi.fn(),
    rollFromRequest: vi.fn(),
    combatRef: () => 0,
    combatFacedownMod: () => 0,
    combatantSummaryName: (id) => id,
    rollCombatFacedownContested: vi.fn(),
    applyCombatFacedownLoss: vi.fn(),
    dismissCombatFacedownContest: vi.fn(),
    combatStabilizationInfo: () => ({ state: 'healthy', dv: null, allowedSkills: [] }),
    rollStabilize: vi.fn(),
    toggleDefeated: vi.fn(),
    removeCombatant: vi.fn(),
    addCombatant: vi.fn(),
    setCriticalInjuryLocation: vi.fn(),
    setCriticalInjuryTarget: vi.fn(),
    toggleCriticalInjuryAreaTarget: vi.fn(),
    rollCriticalInjuryTable: vi.fn(),
    cancelCriticalInjuryPending: vi.fn(),
    startCombat: vi.fn(),
    endCombat: vi.fn(),
    rollInitiative: vi.fn(),
    nextTurn: vi.fn(),
    endMyTurn: vi.fn(),
    prevTurn: vi.fn(),
    createCombatNpc: vi.fn(),
    setState: vi.fn(),
    ...overrides,
  };
}

describe('ui/views/combat combatRenderVals', () => {
  it('gates combat access to the GM or an active fight', () => {
    const inactive = combatRenderVals({ gm: false, characters: [], combatState: { ...baseCombatState(), active: false } }, renderDeps());
    expect(inactive.showCombatAccess).toBe(false);

    const active = combatRenderVals({ gm: false, characters: [], combatState: baseCombatState() }, renderDeps());
    expect(active.showCombatAccess).toBe(true);

    const gm = combatRenderVals({ gm: true, characters: [], combatState: { ...baseCombatState(), active: false } }, renderDeps());
    expect(gm.showCombatAccess).toBe(true);
  });

  it('builds one roster card per combatant with HP/SP/condition summaries', () => {
    const vals = combatRenderVals({ characters: [mira, rook], combatState: baseCombatState() }, renderDeps());
    expect(vals.combatRows).toHaveLength(2);
    const miraRow = vals.combatRows.find(r => r.id === 'mira');
    expect(miraRow.hp).toBe('27/35');
    expect(miraRow.headSp).toBe('11/11');
    expect(miraRow.conditions).toBe('0CI / 0SE');
    expect(miraRow.isCurrent).toBe(true);
    expect(miraRow.side).toBe('PC');
  });

  it('shows an informational NET Actions counter only for a Netrunner combatant', () => {
    const vesper = { ...rook, id: 'vesper', name: 'Vesper', role: 'Netrunner', roleAbilityRank: 6 };
    const vals = combatRenderVals({ characters: [mira, vesper], combatState: { ...baseCombatState(), order: ['mira', 'vesper'], combatants: { mira: baseCombatState().combatants.mira, vesper: { side: 'pc', initiative: 9, acted: false, defeated: false } } } }, renderDeps());
    const miraRow = vals.combatRows.find(r => r.id === 'mira');
    expect(miraRow.netActions).toEqual({ isNetrunner: false, perTurn: 0 });
    const vesperRow = vals.combatRows.find(r => r.id === 'vesper');
    expect(vesperRow.netActions).toEqual({ isNetrunner: true, perTurn: 3 });
  });

  it('shows shield HP on combat cards and wires damage-to-shield for a shielded target', () => {
    const pistol = { id: 'pistol', name: 'Heavy Pistol', sides: 6, count: 3, skill: 'Handgun' };
    const shieldedRook = { ...rook, shield: { itemId: 'BULLETPROOF-SHIELD', hp: 6, maxHp: 10 } };
    const deps = renderDeps({
      combatTargetFor: () => 'rook',
      criticalInjuryTargetOptions: () => [shieldedRook],
      hasDamageProfile: () => true,
      gearDamageText: () => '3d6',
    });
    const vals = combatRenderVals({
      characters: [{ ...mira, gear: [pistol] }, shieldedRook],
      combatState: baseCombatState(),
    }, deps);

    const rookRow = vals.combatRows.find(r => r.id === 'rook');
    expect(rookRow).toMatchObject({ hasShield: true, shieldHp: '6/10', shieldStatus: 'OCUPA BRACO' });
    const miraRow = vals.combatRows.find(r => r.id === 'mira');
    expect(miraRow.weaponRows[0].canShieldDamage).toBe(true);
    miraRow.weaponRows[0].shieldDamage();
    expect(deps.rollCombatShieldDamage).toHaveBeenCalledWith('mira', pistol);
  });

  it('labels the round and current turn', () => {
    const vals = combatRenderVals({ characters: [mira, rook], combatState: baseCombatState() }, renderDeps());
    expect(vals.combatRoundLabel).toBe('ROUND 2');
    expect(vals.combatTurnLabel).toBe('TURN :: Mira');
  });

  it('marks PCs already in the fight in the roster toggle list', () => {
    const vals = combatRenderVals({ characters: [mira, rook], combatState: baseCombatState() }, renderDeps());
    expect(vals.combatPcToggleRows).toHaveLength(2);
    expect(vals.combatPcToggleRows.every(r => r.inCombat)).toBe(true);

    const notStarted = combatRenderVals({ characters: [mira, rook], combatState: { ...baseCombatState(), combatants: {}, order: [] } }, renderDeps());
    expect(notStarted.combatPcToggleRows.every(r => !r.inCombat)).toBe(true);
  });

  it('renders the single-target critical injury confirm panel', () => {
    const deps = renderDeps({ criticalInjuryTargetOptions: () => [rook] });
    const vals = combatRenderVals({
      characters: [mira, rook],
      combatState: baseCombatState(),
      critInjuryPending: { actorId: 'mira', actorName: 'Mira', weaponLabel: 'Katana', area: false, location: 'body', targetId: 'rook', targetIds: [] },
    }, deps);
    expect(vals.hasCritInjuryPending).toBe(true);
    expect(vals.critInjuryPending.singleMode).toBe(true);
    expect(vals.critInjuryPending.targetOptions).toEqual([{ id: 'rook', name: 'Rook', selected: true, notSelected: false }]);
  });

  it('renders the area critical injury confirm panel with per-target checkboxes', () => {
    const deps = renderDeps({ criticalInjuryTargetOptions: () => [mira, rook] });
    const vals = combatRenderVals({
      characters: [mira, rook],
      combatState: baseCombatState(),
      critInjuryPending: { actorId: 'x', actorName: 'NPC', weaponLabel: 'Grenade', area: true, location: 'body', targetId: '', targetIds: ['rook'] },
    }, deps);
    expect(vals.critInjuryPending.area).toBe(true);
    expect(vals.critInjuryPending.areaTargetRows).toEqual([
      { id: 'mira', name: 'Mira', checked: false, notChecked: true, toggle: expect.any(Function) },
      { id: 'rook', name: 'Rook', checked: true, notChecked: false, toggle: expect.any(Function) },
    ]);
  });

  it('gates setup/battle mode on gm + combatState.active', () => {
    const setup = combatRenderVals({ gm: true, characters: [mira, rook], combatState: { ...baseCombatState(), active: false } }, renderDeps());
    expect(setup.combatSetupMode).toBe(true);
    expect(setup.combatBattleMode).toBe(false);

    const battle = combatRenderVals({ gm: true, characters: [mira, rook], combatState: baseCombatState() }, renderDeps());
    expect(battle.combatSetupMode).toBe(false);
    expect(battle.combatBattleMode).toBe(true);

    const player = combatRenderVals({ gm: false, characters: [mira, rook], combatState: baseCombatState() }, renderDeps());
    expect(player.combatSetupMode).toBe(false);
    expect(player.combatBattleMode).toBe(false);
  });

  it('builds initiative rail rows in combat order and defaults the focus dock to the current turn', () => {
    const vals = combatRenderVals({ gm: true, characters: [mira, rook], combatState: baseCombatState() }, renderDeps());
    expect(vals.combatRailRows.map(r => r.id)).toEqual(['mira', 'rook']);
    expect(vals.combatRailRows.find(r => r.id === 'mira').isFocused).toBe(true);
    expect(vals.combatFocusCard.id).toBe('mira');
  });

  it('falls back to the current turn when the pinned focus id is stale/invalid', () => {
    const vals = combatRenderVals({ gm: true, characters: [mira, rook], combatState: baseCombatState(), combatFocusId: 'ghost' }, renderDeps());
    expect(vals.combatFocusCard.id).toBe('mira');
    expect(vals.combatRailRows.find(r => r.id === 'rook').isFocused).toBe(false);
  });

  it('honors a valid pinned focus id over the current turn', () => {
    const vals = combatRenderVals({ gm: true, characters: [mira, rook], combatState: baseCombatState(), combatFocusId: 'rook' }, renderDeps());
    expect(vals.combatFocusCard.id).toBe('rook');
    expect(vals.combatRailRows.find(r => r.id === 'rook').isFocused).toBe(true);
  });

  it('offers Facedown Contested only when a target is selected, wired to rollCombatFacedownContested', () => {
    const deps = renderDeps({ combatTargetFor: () => 'rook', criticalInjuryTargetOptions: () => [rook] });
    const vals = combatRenderVals({ characters: [mira, rook], combatState: baseCombatState() }, deps);
    const miraRow = vals.combatRows.find(r => r.id === 'mira');
    expect(miraRow.canFacedownContest).toBe(true);
    miraRow.rollFacedownContested();
    expect(deps.rollCombatFacedownContested).toHaveBeenCalledWith('mira');

    const noTargetDeps = renderDeps({ combatTargetFor: () => '', criticalInjuryTargetOptions: () => [] });
    const solo = combatRenderVals({ characters: [mira, rook], combatState: baseCombatState() }, noTargetDeps);
    expect(solo.combatRows.find(r => r.id === 'mira').canFacedownContest).toBe(false);
  });

  it('renders the pending Facedown contest result with an apply-to-loser action, or a tie banner', () => {
    const deps = renderDeps();
    const decided = combatRenderVals({
      characters: [mira, rook],
      combatState: baseCombatState(),
      combatFacedownContest: { actorId: 'mira', targetId: 'rook', actorRoll: 8, actorTotal: 13, targetRoll: 3, targetTotal: 5, winnerId: 'mira', loserId: 'rook' },
    }, deps);
    expect(decided.hasFacedownContestPending).toBe(true);
    expect(decided.facedownContestPending).toMatchObject({ isTie: false, canApply: true, winnerName: 'mira', loserName: 'rook' });
    decided.facedownContestPending.applyLoss();
    expect(deps.applyCombatFacedownLoss).toHaveBeenCalled();

    const tied = combatRenderVals({
      characters: [mira, rook],
      combatState: baseCombatState(),
      combatFacedownContest: { actorId: 'mira', targetId: 'rook', actorRoll: 5, actorTotal: 9, targetRoll: 7, targetTotal: 9, winnerId: null, loserId: null },
    }, deps);
    expect(tied.facedownContestPending.isTie).toBe(true);
    expect(tied.facedownContestPending.canApply).toBe(false);
  });

  it('filters the shared roll feed to rolls and initiative announcements', () => {
    const comms = [
      { kind: 'roll', roll: { label: 'ATAQUE', total: 14 }, sender: 'Mira', at: '10:00' },
      { kind: 'text', text: 'INICIATIVA :: aguardando jogadores', at: '10:01' },
      { kind: 'text', text: 'random chat', at: '10:02' },
    ];
    const vals = combatRenderVals({ characters: [], combatState: baseCombatState(), comms }, renderDeps());
    expect(vals.combatRollFeed).toHaveLength(2);
    expect(vals.combatHasRolls).toBe(true);
  });
});

function fakeComponent(overrides = {}) {
  return {
    state: { characters: [mira, rook], gm: true, activeCharacterId: 'mira', combatState: baseCombatState(), comms: [], ...overrides.state },
    setState: vi.fn(function (patch) {
      const next = typeof patch === 'function' ? patch(this.state) : patch;
      this.state = { ...this.state, ...next };
    }),
    ensureGm: overrides.ensureGm || vi.fn(() => true),
    api: overrides.api || vi.fn(() => null),
    flash: vi.fn(),
    asNumber: (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback),
    activeCharacter: overrides.activeCharacter || vi.fn(() => mira),
    normalizeCharacter: (c) => c,
    normalizeShield: (shield) => shield && shield.itemId ? { itemId: shield.itemId, hp: Number(shield.hp), maxHp: Number(shield.maxHp) } : null,
    damageShield: (shield, amount) => ({ ...shield, hp: Math.max(0, shield.hp - Number(amount || 0)) }),
    characterById: overrides.characterById || vi.fn((id) => ({ mira, rook }[id] || mira)),
    postChat: vi.fn(async () => {}),
    roll: vi.fn(),
    app: overrides.app || vi.fn(() => ({})),
    cyberwareBonuses: overrides.cyberwareBonuses || vi.fn(() => ({ damageVsCover: [], rangedBonus: [] })),
    parseGearDamage: vi.fn(),
    addCriticalInjury: vi.fn(() => ({ applied: true })),
    derivedStats: overrides.derivedStats || vi.fn(() => ({ hpMax: 35, seriouslyWounded: 18, effectiveStats: {} })),
    cyberwareStatModBonus: vi.fn(() => ({ sources: [] })),
    skillCyberwareBonus: vi.fn(() => ({ total: 0, sources: [] })),
    cyberSourceBreakdown: vi.fn(() => []),
    stabilizeMortallyWounded: vi.fn(),
    ...overrides,
  };
}

describe('ui/views/combat combatHandlers', () => {
  beforeEach(() => {
    global.document = { querySelectorAll: vi.fn(() => []) };
    global.window = {};
  });
  afterEach(() => {
    delete global.document;
    delete global.window;
  });

  it('combatCharacter looks up by id and combatRef reads BODY-independent REF', () => {
    const component = fakeComponent({ state: { characters: [{ ...mira, base: { REF: 7 } }] } });
    const h = combatHandlers(component);
    expect(h.combatCharacter('mira').id).toBe('mira');
    expect(h.combatCharacter('ghost')).toBeNull();
    expect(h.combatRef('mira')).toBe(7);
  });

  it('combatFacedownMod is COOL + REP (CPR RAW Facedown)', () => {
    const component = fakeComponent({ state: { characters: [{ ...mira, base: { COOL: 6 }, reputation: 4 }] } });
    const h = combatHandlers(component);
    expect(h.combatFacedownMod('mira')).toBe(10);
  });

  it('combatStabilizationInfo reads DV/allowed skills from the target current HP', () => {
    const target = { ...rook, health: { cur: 0, max: 35 } };
    const component = fakeComponent({ state: { characters: [mira, target] } });
    const h = combatHandlers(component);
    expect(h.combatStabilizationInfo('rook')).toEqual({ state: 'mortallyWounded', dv: 15, allowedSkills: ['Paramedic'] });
  });

  it('rollStabilize on a Mortally Wounded target succeeds and revives to 1 HP + Inconsciente', () => {
    const healer = { ...mira, derived: { effectiveStats: { TECH: 6 } }, skills: [{ name: 'Paramedic', stat: 'TECH', level: 4 }] };
    const target = { ...rook, health: { cur: 0, max: 35 } };
    const roll = vi.fn((opts) => opts.onResolved && opts.onResolved({ success: true, total: 20 }));
    const component = fakeComponent({ state: { characters: [healer, target], gm: true }, roll });
    const h = combatHandlers(component);

    h.rollStabilize('mira', 'rook', 'Paramedic');

    expect(roll).toHaveBeenCalledWith(expect.objectContaining({ dv: 15, mod: 10 }));
    expect(component.stabilizeMortallyWounded).toHaveBeenCalledWith('rook', { source: 'stabilize:Paramedic' });
  });

  it('rollStabilize blocks First Aid on a Mortally Wounded target (Paramedic only)', () => {
    const target = { ...rook, health: { cur: 0, max: 35 } };
    const component = fakeComponent({ state: { characters: [mira, target] } });
    const h = combatHandlers(component);

    h.rollStabilize('mira', 'rook', 'First Aid');

    expect(component.roll).not.toHaveBeenCalled();
    expect(component.flash).toHaveBeenCalled();
  });

  it('rollStabilize does not revive on a failed roll', () => {
    const healer = { ...mira, derived: { effectiveStats: { TECH: 6 } }, skills: [{ name: 'Paramedic', stat: 'TECH', level: 4 }] };
    const target = { ...rook, health: { cur: 0, max: 35 } };
    const roll = vi.fn((opts) => opts.onResolved && opts.onResolved({ success: false, total: 5 }));
    const component = fakeComponent({ state: { characters: [healer, target], gm: true }, roll });
    const h = combatHandlers(component);

    h.rollStabilize('mira', 'rook', 'Paramedic');

    expect(component.stabilizeMortallyWounded).not.toHaveBeenCalled();
  });

  it('canRollCombatActor lets the GM roll for anyone but a player only for their own character', () => {
    const gm = combatHandlers(fakeComponent({ state: { gm: true, activeCharacterId: 'mira' } }));
    expect(gm.canRollCombatActor('rook')).toBe(true);

    const player = combatHandlers(fakeComponent({ state: { gm: false, activeCharacterId: 'mira' } }));
    expect(player.canRollCombatActor('mira')).toBe(true);
    expect(player.canRollCombatActor('rook')).toBe(false);
  });

  it('saveCombatState persists through the api and flashes on failure unless allowLocal is set', async () => {
    const set = vi.fn(async () => { throw new Error('offline'); });
    const component = fakeComponent({ api: () => ({ combat: { state: { set } } }) });
    const h = combatHandlers(component);

    const failed = await h.saveCombatState(baseCombatState());
    expect(failed).toBeNull();
    expect(component.flash).toHaveBeenCalled();
    expect(component.state.combatState.round).not.toBe(baseCombatState().round + 1);

    component.flash.mockClear();
    const withRound3 = { ...baseCombatState(), round: 3 };
    const saved = await h.saveCombatState(withRound3, { allowLocal: true });
    expect(saved.round).toBe(3);
    expect(component.state.combatState.round).toBe(3);
  });

  it('addCombatant and removeCombatant require GM auth', async () => {
    const deniedComponent = fakeComponent({ ensureGm: vi.fn(() => false) });
    const denied = combatHandlers(deniedComponent);
    expect(await denied.addCombatant('rook', 'pc')).toBeNull();
    expect(deniedComponent.setState).not.toHaveBeenCalled();

    const set = vi.fn(async (s) => s);
    const component = fakeComponent({ state: { combatState: { ...baseCombatState(), order: ['mira'], combatants: { mira: baseCombatState().combatants.mira } } }, api: () => ({ combat: { state: { set } } }) });
    const h = combatHandlers(component);
    await h.addCombatant('rook', 'pc');
    expect(component.state.combatState.order).toContain('rook');

    await h.removeCombatant('rook');
    expect(component.state.combatState.order).not.toContain('rook');
  });

  it('rollInitiative rolls NPCs immediately and requests player-rolled initiative for PCs', async () => {
    const npc = { id: 'npc1', name: 'Ganger', kind: 'npc', base: { REF: 5 } };
    const set = vi.fn(async (s) => s);
    const component = fakeComponent({
      state: {
        characters: [mira, npc],
        combatState: { active: false, round: 0, turnIndex: -1, order: [], combatants: { mira: { side: 'pc', initiative: null, acted: false, defeated: false }, npc1: { side: 'enemy', initiative: null, acted: false, defeated: false } }, updatedAt: 'now' },
      },
      api: () => ({ combat: { state: { set } } }),
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const h = combatHandlers(component);
    await h.rollInitiative();
    Math.random.mockRestore();

    expect(component.state.combatState.combatants.npc1.initiative).not.toBeNull();
    expect(component.state.combatState.combatants.mira.initiative).toBeNull();
    expect(component.postChat).toHaveBeenCalledWith(expect.objectContaining({ kind: 'request' }));
  });

  it('criticalInjuryTargetOptions excludes the attacker and defeated combatants', () => {
    const component = fakeComponent({
      state: {
        characters: [mira, rook],
        combatState: { ...baseCombatState(), combatants: { mira: { side: 'pc', initiative: 12, acted: false, defeated: false }, rook: { side: 'pc', initiative: 9, acted: false, defeated: true } } },
      },
    });
    const h = combatHandlers(component);
    expect(h.criticalInjuryTargetOptions('mira')).toEqual([]);
    expect(h.criticalInjuryTargetOptions('someoneElse')).toEqual([mira]);
  });

  it('applyCombatShieldDamage degrades only the target shield and reports overflow', () => {
    const shielded = { ...rook, shield: { itemId: 'BULLETPROOF-SHIELD', hp: 4, maxHp: 10 }, health: { cur: 35, max: 45 } };
    const component = fakeComponent({ state: { characters: [mira, shielded], combatState: baseCombatState() } });
    const h = combatHandlers(component);

    h.applyCombatShieldDamage('rook', 7);

    const updated = component.state.characters.find(c => c.id === 'rook');
    expect(updated.shield).toEqual({ itemId: 'BULLETPROOF-SHIELD', hp: 0, maxHp: 10 });
    expect(updated.health).toEqual({ cur: 35, max: 45 });
    expect(component.postChat).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('EXCESSO 3') }));
  });

  it('rollCombatFacedownContested requires a selected target, then rolls both sides and reports the winner', () => {
    const actor = { ...mira, base: { COOL: 5 }, reputation: 3 };
    const target = { ...rook, base: { COOL: 2 }, reputation: 1 };
    const component = fakeComponent({ state: { gm: true, characters: [actor, target], combatState: baseCombatState() } });
    const h = combatHandlers(component);

    vi.spyOn(Math, 'random').mockReturnValueOnce(0.75).mockReturnValueOnce(0.25);
    h.rollCombatFacedownContested('mira');
    Math.random.mockRestore();

    expect(component.flash).not.toHaveBeenCalled();
    expect(component.postChat).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Mira VENCE'),
    }));
    expect(component.state.combatFacedownContest).toEqual({
      actorId: 'mira', targetId: 'rook', actorRoll: 8, actorTotal: 16, targetRoll: 3, targetTotal: 6, winnerId: 'mira', loserId: 'rook',
    });
  });

  it('rollCombatFacedownContested with no other combatant flashes instead of rolling', () => {
    const component = fakeComponent({ state: { gm: true, characters: [mira], combatState: { ...baseCombatState(), order: ['mira'], combatants: { mira: baseCombatState().combatants.mira } } } });
    const h = combatHandlers(component);
    h.rollCombatFacedownContested('mira');
    expect(component.flash).toHaveBeenCalled();
    expect(component.postChat).not.toHaveBeenCalled();
  });

  it('applyCombatFacedownLoss applies facedown_lost to the loser and clears the pending contest; no-ops on a tie', () => {
    const addStatusEffect = vi.fn();
    const component = fakeComponent({
      state: { characters: [mira, rook], combatFacedownContest: { actorId: 'mira', targetId: 'rook', winnerId: 'mira', loserId: 'rook' } },
      addStatusEffect,
    });
    const h = combatHandlers(component);
    h.applyCombatFacedownLoss();
    expect(addStatusEffect).toHaveBeenCalledWith('facedown_lost', { targetId: 'rook', source: 'facedown' });
    expect(component.state.combatFacedownContest).toBeNull();

    addStatusEffect.mockClear();
    const tiedComponent = fakeComponent({
      state: { characters: [mira, rook], combatFacedownContest: { actorId: 'mira', targetId: 'rook', winnerId: null, loserId: null } },
      addStatusEffect,
    });
    combatHandlers(tiedComponent).applyCombatFacedownLoss();
    expect(addStatusEffect).not.toHaveBeenCalled();
  });

  it('dismissCombatFacedownContest clears the pending contest', () => {
    const component = fakeComponent({ state: { combatFacedownContest: { actorId: 'mira', targetId: 'rook', winnerId: 'mira', loserId: 'rook' } } });
    combatHandlers(component).dismissCombatFacedownContest();
    expect(component.state.combatFacedownContest).toBeNull();
  });

  it('toggleAttackContext flips a single situational flag without touching the others', () => {
    const component = fakeComponent({ state: { attackContext: { cover: false, beyond51m: false, aimedShot: false } } });
    const h = combatHandlers(component);
    h.toggleAttackContext('cover');
    expect(component.state.attackContext).toEqual({ cover: true, beyond51m: false, aimedShot: false });
  });

  it('cyberContextToHit only contributes chrome bonuses whose toggle is active', () => {
    const cyberwareBonuses = vi.fn(() => ({
      damageVsCover: [],
      rangedBonus: [{ condition: 'beyond51m', value: 2, from: 'Smartgun link' }, { condition: 'aimedShot', value: 3, from: 'Kiroshi' }],
    }));
    const component = fakeComponent({ state: { attackContext: { cover: false, beyond51m: true, aimedShot: false } }, cyberwareBonuses });
    const h = combatHandlers(component);
    const ctx = h.cyberContextToHit(mira);
    expect(ctx.mod).toBe(2);
    expect(ctx.sources).toEqual(['+2 Smartgun link']);
  });

  it('handleCriticalInjuryTrigger requires the GM and seeds critInjuryPending from the current target', () => {
    global.window.confirm = vi.fn(() => true);
    const component = fakeComponent({ state: { gm: true }, tx: undefined });
    component.tx = vi.fn(() => ({ critInjuryTriggerConfirm: 'confirm?' }));
    const h = combatHandlers(component);
    h.handleCriticalInjuryTrigger('mira', { name: 'Katana' });
    expect(component.state.critInjuryPending).toMatchObject({ actorId: 'mira', weaponLabel: 'Katana', area: false });
  });

  it('rollCriticalInjuryTable single mode resolves via component.roll and applies the injury on the target', () => {
    const component = fakeComponent({ state: { critInjuryPending: { area: false, targetId: 'rook', location: 'body' } } });
    component.roll = vi.fn((opts) => opts.onResolved({ total: 7 }));
    const h = combatHandlers(component);
    h.rollCriticalInjuryTable();
    expect(component.addCriticalInjury).toHaveBeenCalledWith('body', expect.any(String), expect.objectContaining({ targetId: 'rook', source: 'crit-damage', hpLossDirect: 5 }));
    expect(component.state.critInjuryPending).toBeNull();
  });

  it('setCombatFocus pins the focus dock to a specific combatant id', () => {
    const component = fakeComponent();
    const h = combatHandlers(component);
    h.setCombatFocus('rook');
    expect(component.state.combatFocusId).toBe('rook');
  });

  it('applyNpcTemplate seeds the NPC draft from a preset archetype', () => {
    const component = fakeComponent();
    const h = combatHandlers(component);
    h.applyNpcTemplate('ganger');
    expect(component.state.combatNpcDraft).toMatchObject({ name: 'GANGER', templateId: 'ganger' });
    expect(component.state.combatNpcDraft.attackRows.length).toBeGreaterThan(0);
  });

  it('addNpcAttackRow/updateNpcAttackRow/removeNpcAttackRow manage the structured attack builder', () => {
    const component = fakeComponent({ state: { combatNpcDraft: { attackRows: [{ name: 'Pistol', dice: '2d6', skill: 'Handgun' }] } } });
    const h = combatHandlers(component);
    h.addNpcAttackRow();
    expect(component.state.combatNpcDraft.attackRows).toHaveLength(2);
    h.updateNpcAttackRow(1, 'name', 'Knife');
    expect(component.state.combatNpcDraft.attackRows[1].name).toBe('Knife');
    h.removeNpcAttackRow(0);
    expect(component.state.combatNpcDraft.attackRows).toEqual([{ name: 'Knife', dice: '2d6', skill: 'Handgun' }]);
    // Never drops below one row — the builder always needs at least a blank line.
    h.removeNpcAttackRow(0);
    expect(component.state.combatNpcDraft.attackRows).toHaveLength(1);
  });

  it('createCombatNpc builds gear from structured attack rows and spawns numbered copies for qty > 1', async () => {
    const set = vi.fn(async (s) => s);
    const component = fakeComponent({
      api: () => ({ combat: { state: { set } }, characters: { upsert: vi.fn(async (c) => c) } }),
      normalizeStats: (b) => b,
      normalizeSkills: () => [],
      slug: (s) => String(s).toLowerCase().replace(/\s+/g, '-'),
      normalizeGearItem: (item, idx) => ({ ...item, id: item.id || 'gear-' + idx }),
    });
    const h = combatHandlers(component);
    await h.createCombatNpc({ name: 'Ganger', body: '6', ref: '6', hpMax: '30', headSp: '4', bodySp: '4', qty: '2', attackRows: [{ name: 'Heavy Pistol', dice: '2d6', skill: 'Handgun' }] });

    const npcs = component.state.characters.filter(c => c.kind === 'npc');
    expect(npcs.map(c => c.name)).toEqual(['GANGER 1', 'GANGER 2']);
    expect(npcs[0].gear).toHaveLength(1);
    expect(npcs[0].gear[0].name).toBe('Heavy Pistol');
    expect(component.state.combatState.order).toEqual(expect.arrayContaining([npcs[0].id, npcs[1].id]));
    expect(component.flash).toHaveBeenCalledWith('2 NPCs adicionados ao combate');
  });
});
