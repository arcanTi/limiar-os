import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { combatHandlers, combatRenderVals } from '../../../src/ui/views/combat.js';
import { generateNpc, npcDraftFromGenerated } from '../../../src/domain/combat/npcGenerator.ts';
import PersistCharacter from '../../../src/application/PersistCharacter.ts';
import PersistCombatState from '../../../src/application/PersistCombatState.ts';
import CampaignMapQueries from '../../../src/application/CampaignMapQueries.ts';

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
    evasionStatusFor: () => null,
    requestEvasion: vi.fn(),
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
    pendingRollMods: () => ({ luck: 0, adHoc: 0 }),
    adjustLuckSpend: vi.fn(),
    adjustAdHocMod: vi.fn(),
    reloadWeapon: vi.fn(),
    resetLuckForSession: vi.fn(),
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
  const api = overrides.api || vi.fn(() => null);
  const defaultApp = () => ({
    persistCharacter: new PersistCharacter(api()),
    persistCombatState: new PersistCombatState(api()),
    campaignMap: new CampaignMapQueries(api()),
  });
  return {
    state: { characters: [mira, rook], gm: true, activeCharacterId: 'mira', combatState: baseCombatState(), comms: [], ...overrides.state },
    setState: vi.fn(function (patch) {
      const next = typeof patch === 'function' ? patch(this.state) : patch;
      this.state = { ...this.state, ...next };
    }),
    ensureGm: overrides.ensureGm || vi.fn(() => true),
    api,
    flash: vi.fn(),
    asNumber: (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback),
    activeCharacter: overrides.activeCharacter || vi.fn(() => mira),
    normalizeCharacter: (c) => c,
    normalizeShield: (shield) => shield && shield.itemId ? { itemId: shield.itemId, hp: Number(shield.hp), maxHp: Number(shield.maxHp) } : null,
    damageShield: (shield, amount) => ({ ...shield, hp: Math.max(0, shield.hp - Number(amount || 0)) }),
    characterById: overrides.characterById || vi.fn((id) => ({ mira, rook }[id] || mira)),
    postChat: vi.fn(async () => {}),
    roll: vi.fn(),
    app: overrides.app || vi.fn(defaultApp),
    cyberwareBonuses: overrides.cyberwareBonuses || vi.fn(() => ({ damageVsCover: [], rangedBonus: [] })),
    parseGearDamage: vi.fn(),
    addCriticalInjury: vi.fn(() => ({ applied: true })),
    derivedStats: overrides.derivedStats || vi.fn(() => ({ hpMax: 35, seriouslyWounded: 18, effectiveStats: {} })),
    cyberwareStatModBonus: vi.fn(() => ({ sources: [] })),
    skillCyberwareBonus: vi.fn(() => ({ total: 0, sources: [] })),
    cyberSourceBreakdown: vi.fn(() => []),
    stabilizeMortallyWounded: vi.fn(),
    applyCharacterPatch: overrides.applyCharacterPatch || vi.fn(),
    normalizeGearList: overrides.normalizeGearList || ((gear) => gear || []),
    normalizeStats: overrides.normalizeStats || ((base) => base || {}),
    weaponRuntimeAttackMod: vi.fn(() => 0),
    weaponRuntimeQuality: vi.fn(() => ''),
    gorillaTungstenProfile: vi.fn(() => null),
    damageScaleProfile: vi.fn(() => null),
    cyberweaponRollContext: vi.fn(() => null),
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

  // --- CM0: LUCK spend + ad-hoc modifier ---
  it('adjustLuckSpend stages a clamped spend and blocks a non-owner, non-GM player', () => {
    const mage = { ...mira, luckCurrent: 3 };
    const component = fakeComponent({ state: { characters: [mage, rook], gm: false, activeCharacterId: 'mira' } });
    const h = combatHandlers(component);

    h.adjustLuckSpend('mira', 1);
    expect(h.pendingRollMods('mira').luck).toBe(1);
    h.adjustLuckSpend('mira', 10); // clamps at luckCurrent (3), not the raw delta
    expect(h.pendingRollMods('mira').luck).toBe(3);
    h.adjustLuckSpend('mira', -10); // clamps at 0
    expect(h.pendingRollMods('mira').luck).toBe(0);

    h.adjustLuckSpend('rook', 1); // not mira's own combatant, not GM
    expect(h.pendingRollMods('rook').luck).toBe(0);
    expect(component.flash).toHaveBeenCalled();
  });

  it('consumePendingRollMods zeroes the stage and deducts spent Luck from the pool', () => {
    const mage = { ...mira, luckCurrent: 3 };
    const component = fakeComponent({ state: { characters: [mage, rook], gm: false, activeCharacterId: 'mira' } });
    const h = combatHandlers(component);
    h.adjustLuckSpend('mira', 2);
    h.adjustAdHocMod('mira', -1);

    const pending = h.consumePendingRollMods('mira');
    expect(pending).toEqual({ luck: 2, adHoc: -1 });
    expect(h.pendingRollMods('mira')).toEqual({ luck: 0, adHoc: 0 });
    expect(component.applyCharacterPatch).toHaveBeenCalledWith('mira', { luckCurrent: 1 });
  });

  it('rollCombatAttack folds staged Luck/mod into the roll and resets the stage', () => {
    const mage = { ...mira, luckCurrent: 5, gear: [] };
    const component = fakeComponent({ state: { characters: [mage, rook], gm: true, activeCharacterId: 'mira' } });
    const h = combatHandlers(component);
    h.adjustLuckSpend('mira', 2);
    h.adjustAdHocMod('mira', 1);

    h.rollCombatAttack('mira', { id: 'w1', name: 'Pistol', skill: 'Handgun' });

    expect(component.roll).toHaveBeenCalledWith(expect.objectContaining({ mod: 3 })); // 0 (fallback REF) + 2 luck + 1 mod
    expect(component.roll.mock.calls[0][0].breakdown).toEqual(expect.arrayContaining(['+2 LUCK', '+1 MOD']));
    expect(h.pendingRollMods('mira')).toEqual({ luck: 0, adHoc: 0 });
  });

  it('resetLuckForSession refreshes every PC (not NPCs) to their LUCK stat and requires GM auth', () => {
    const spent = { ...mira, base: { LUCK: 7 }, luckCurrent: 0 };
    const npc = { ...rook, id: 'ganger', kind: 'npc', base: { LUCK: 9 }, luckCurrent: 0 };
    const component = fakeComponent({
      state: { characters: [spent, npc] },
      normalizeStats: (base) => base,
    });
    const h = combatHandlers(component);

    h.resetLuckForSession();

    expect(component.applyCharacterPatch).toHaveBeenCalledWith('mira', { luckCurrent: 7 });
    expect(component.applyCharacterPatch).not.toHaveBeenCalledWith('ganger', expect.anything());

    const deniedComponent = fakeComponent({ ensureGm: vi.fn(() => false) });
    combatHandlers(deniedComponent).resetLuckForSession();
    expect(deniedComponent.applyCharacterPatch).not.toHaveBeenCalled();
  });

  // --- CM0: weapon magazine ammo ---
  it('rollCombatAttack spends ammo on fire and warns (without blocking) when the mag is empty', () => {
    const gunner = { ...mira, gear: [{ id: 'pistol', name: 'Heavy Pistol', skill: 'Handgun', magazine: 8, currentAmmo: 1 }] };
    const component = fakeComponent({
      state: { characters: [gunner, rook], gm: true, activeCharacterId: 'mira' },
      normalizeGearList: (gear) => gear,
    });
    const h = combatHandlers(component);
    const weapon = gunner.gear[0];

    h.rollCombatAttack('mira', weapon);
    expect(component.applyCharacterPatch).toHaveBeenCalledWith('mira', { gear: [{ ...weapon, currentAmmo: 0 }] });

    component.applyCharacterPatch.mockClear();
    const empty = { ...weapon, currentAmmo: 0 };
    const emptyComponent = fakeComponent({
      state: { characters: [{ ...gunner, gear: [empty] }, rook], gm: true, activeCharacterId: 'mira' },
      normalizeGearList: (gear) => gear,
    });
    const emptyHandlers = combatHandlers(emptyComponent);
    emptyHandlers.rollCombatAttack('mira', empty);
    // Advisory: the roll still happens even at 0 ammo, with a warning line.
    expect(emptyComponent.roll).toHaveBeenCalled();
    expect(emptyComponent.roll.mock.calls[0][0].breakdown.some(line => line.includes('SEM MUNICAO'))).toBe(true);
    expect(emptyComponent.applyCharacterPatch).toHaveBeenCalledWith('mira', { gear: [{ ...empty, currentAmmo: 0 }] });
  });

  it('rollCombatAttack does not touch ammo for melee/exotic gear without a magazine', () => {
    const knife = { id: 'knife', name: 'Knife', skill: 'Melee Weapon' };
    const component = fakeComponent({
      state: { characters: [{ ...mira, gear: [knife] }, rook], gm: true, activeCharacterId: 'mira' },
      normalizeGearList: (gear) => gear,
    });
    const h = combatHandlers(component);
    h.rollCombatAttack('mira', knife);
    expect(component.applyCharacterPatch).not.toHaveBeenCalled();
  });

  it('reloadWeapon refills to the magazine and is gated to the owner or GM', () => {
    const weapon = { id: 'pistol', name: 'Heavy Pistol', magazine: 8, currentAmmo: 2 };
    const component = fakeComponent({
      state: { characters: [{ ...mira, gear: [weapon] }, rook], gm: false, activeCharacterId: 'mira' },
      normalizeGearList: (gear) => gear,
    });
    const h = combatHandlers(component);

    h.reloadWeapon('mira', 'pistol');
    expect(component.applyCharacterPatch).toHaveBeenCalledWith('mira', { gear: [{ ...weapon, currentAmmo: 8 }] });

    component.applyCharacterPatch.mockClear();
    h.reloadWeapon('rook', 'pistol');
    expect(component.applyCharacterPatch).not.toHaveBeenCalled();
    expect(component.flash).toHaveBeenCalled();
  });

  // --- CM2: evasion as a prompt (G7) ---
  it('requestEvasion posts a targeted request using the DEFENDER\'s own Evasion mod and stages pendingEvasion', () => {
    const component = fakeComponent({ state: { characters: [mira, rook], gm: true, activeCharacterId: 'mira', combatState: baseCombatState() } });
    const h = combatHandlers(component);

    h.requestEvasion('mira', { id: 'knife', name: 'Knife', melee: true });

    expect(component.postChat).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'request',
      request: expect.objectContaining({ label: 'EVASAO', sides: 10, check: true, combatantId: 'rook', evasionFor: 'mira' }),
    }));
    expect(component.state.pendingEvasion.mira).toEqual(expect.objectContaining({ targetId: 'rook' }));
  });

  it('requestEvasion flashes instead of posting when the attacker has no target selected', () => {
    const soloState = { active: true, round: 1, turnIndex: 0, order: ['mira'], combatants: { mira: { side: 'pc', acted: false, defeated: false } } };
    const component = fakeComponent({ state: { characters: [mira], gm: true, activeCharacterId: 'mira', combatState: soloState } });
    const h = combatHandlers(component);

    h.requestEvasion('mira', { melee: true });

    expect(component.flash).toHaveBeenCalled();
    expect(component.postChat).not.toHaveBeenCalled();
  });

  it('applyEvasionRolls captures a matching reply by requestId; rollCombatAttack consumes it as the melee DV one-shot', () => {
    const component = fakeComponent({
      state: {
        characters: [mira, rook], gm: true, activeCharacterId: 'mira', combatState: baseCombatState(),
        pendingEvasion: { mira: { targetId: 'rook', requestId: 'req-1', expiresAt: Date.now() + 10000 } },
      },
    });
    const h = combatHandlers(component);

    h.applyEvasionRolls([{ id: 'msg-1', kind: 'roll', roll: { total: 14, evasionFor: 'mira', evasionRequestId: 'req-1' } }]);
    expect(component.state.evasionResults).toEqual({ mira: { targetId: 'rook', total: 14 } });
    expect(component.state.pendingEvasion).toEqual({});

    h.rollCombatAttack('mira', { id: 'knife', name: 'Knife', melee: true });
    expect(component.roll).toHaveBeenCalledWith(expect.objectContaining({ dv: 14 }));
    expect(component.roll.mock.calls[0][0].breakdown).toEqual(expect.arrayContaining(['EVASAO DO ALVO: 14']));
    // One-shot: a second attack has nothing left to consume.
    expect(component.state.evasionResults).toEqual({});
  });

  it('applyEvasionRolls ignores a roll tagged with a stale/mismatched requestId', () => {
    const component = fakeComponent({
      state: {
        characters: [mira, rook], gm: true, activeCharacterId: 'mira', combatState: baseCombatState(),
        pendingEvasion: { mira: { targetId: 'rook', requestId: 'req-current', expiresAt: Date.now() + 10000 } },
      },
    });
    const h = combatHandlers(component);

    h.applyEvasionRolls([{ id: 'msg-1', kind: 'roll', roll: { total: 5, evasionFor: 'mira', evasionRequestId: 'req-stale' } }]);

    expect(component.state.evasionResults || {}).toEqual({});
    expect(component.state.pendingEvasion.mira).toEqual(expect.objectContaining({ requestId: 'req-current' }));
  });

  // --- CM2: automatic Death Save prompt on turn start (G10) ---
  it('advanceTurn auto-posts a Death Save request when the incoming turn belongs to a Mortally Wounded combatant', async () => {
    const dying = { ...rook, health: { cur: 0, max: 45 } };
    const nextCombatState = { ...baseCombatState(), turnIndex: 1 };
    const component = fakeComponent({
      state: { characters: [mira, dying], gm: true, activeCharacterId: 'mira', combatState: baseCombatState() },
      app: vi.fn(() => ({ endTurn: { execute: vi.fn(async () => ({ ok: true, combatState: nextCombatState })) } })),
      derivedStats: vi.fn(() => ({ hpMax: 45, seriouslyWounded: 22, deathSave: 6, skipDeathSave: false, effectiveStats: {} })),
    });
    const h = combatHandlers(component);

    await h.advanceTurn();

    expect(component.postChat).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'request',
      request: expect.objectContaining({ label: 'DEATH SAVE', check: false, combatantId: 'rook', deathSaveTarget: 6 }),
    }));
  });

  it('advanceTurn does not auto-post a Death Save for a healthy incoming combatant', async () => {
    const nextCombatState = { ...baseCombatState(), turnIndex: 1 };
    const component = fakeComponent({
      state: { characters: [mira, rook], gm: true, activeCharacterId: 'mira', combatState: baseCombatState() },
      app: vi.fn(() => ({ endTurn: { execute: vi.fn(async () => ({ ok: true, combatState: nextCombatState })) } })),
    });
    const h = combatHandlers(component);

    await h.advanceTurn();

    expect(component.postChat).not.toHaveBeenCalled();
  });

  it('advanceTurn skips the auto Death Save when the character has skipDeathSave (e.g. a status/cyberware immunity)', async () => {
    const dying = { ...rook, health: { cur: 0, max: 45 } };
    const nextCombatState = { ...baseCombatState(), turnIndex: 1 };
    const component = fakeComponent({
      state: { characters: [mira, dying], gm: true, activeCharacterId: 'mira', combatState: baseCombatState() },
      app: vi.fn(() => ({ endTurn: { execute: vi.fn(async () => ({ ok: true, combatState: nextCombatState })) } })),
      derivedStats: vi.fn(() => ({ hpMax: 45, seriouslyWounded: 22, deathSave: 6, skipDeathSave: true, effectiveStats: {} })),
    });
    const h = combatHandlers(component);

    await h.advanceTurn();

    expect(component.postChat).not.toHaveBeenCalled();
  });

  it('advanceTurn only auto-posts the Death Save once per combatant per round even if called again', async () => {
    const dying = { ...rook, health: { cur: 0, max: 45 } };
    const nextCombatState = { ...baseCombatState(), turnIndex: 1 };
    const component = fakeComponent({
      state: { characters: [mira, dying], gm: true, activeCharacterId: 'mira', combatState: baseCombatState() },
      app: vi.fn(() => ({ endTurn: { execute: vi.fn(async () => ({ ok: true, combatState: nextCombatState })) } })),
      derivedStats: vi.fn(() => ({ hpMax: 45, seriouslyWounded: 22, deathSave: 6, skipDeathSave: false, effectiveStats: {} })),
    });
    const h = combatHandlers(component);

    await h.advanceTurn();
    await h.advanceTurn();

    const deathSaveCalls = component.postChat.mock.calls.filter(([payload]) => payload && payload.request && payload.request.label === 'DEATH SAVE');
    expect(deathSaveCalls.length).toBe(1);
  });
});

describe('ui/views/combat random NPC generator', () => {
  it('render vals expose archetype/tier chips, faction and the rolled summary', () => {
    const draft = npcDraftFromGenerated(generateNpc({ archetype: 'corpsec', tier: 'elite', seed: 'ui' }));
    const deps = renderDeps({ setNpcGenOption: vi.fn() });
    const vals = combatRenderVals({
      gm: true,
      characters: [mira],
      combatState: { ...baseCombatState(), active: false },
      combatNpcDraft: draft,
      combatNpcGen: { archetype: 'corpsec', tier: 'misto', faction: 'Arasaka' },
    }, deps);
    expect(vals.npcGenArchetypeChips.map(c => c.id)).toEqual(['civil', 'guarda', 'ganger', 'policial', 'corpsec', 'solo', 'drone']);
    expect(vals.npcGenArchetypeChips.find(c => c.id === 'corpsec').active).toBe(true);
    expect(vals.npcGenTierChips.map(c => c.id)).toEqual(['base', 'veterano', 'elite', 'chefe', 'misto']);
    expect(vals.npcGenTierChips.find(c => c.id === 'misto').active).toBe(true);
    expect(vals.npcGenFaction).toBe('Arasaka');
    expect(vals.hasCombatNpcGenerated).toBe(true);
    expect(vals.combatNpcTags.map(t => t.label)).toEqual(expect.arrayContaining(['ELITE', 'CORPSEC']));
    expect(vals.combatNpcStatLine).toContain('REF ' + draft.generated.stats.REF);
    expect(vals.combatNpcArmorLabel).toBe(draft.generated.armor.body.name);
    vals.npcGenArchetypeChips.find(c => c.id === 'solo').apply();
    expect(deps.setNpcGenOption).toHaveBeenCalledWith({ archetype: 'solo' });
    vals.npcGenTierChips.find(c => c.id === 'chefe').apply();
    expect(deps.setNpcGenOption).toHaveBeenCalledWith({ tier: 'chefe' });
  });

  it('defaults the generator to guarda/base and hides the summary for a hand-built draft', () => {
    const vals = combatRenderVals({ gm: true, characters: [mira], combatState: { ...baseCombatState(), active: false }, combatNpcDraft: { name: 'X', attackRows: [] } }, renderDeps());
    expect(vals.npcGenArchetypeChips.find(c => c.active).id).toBe('guarda');
    expect(vals.npcGenTierChips.find(c => c.active).id).toBe('base');
    expect(vals.npcGenArchetypeHint).toContain('Seguranca privada');
    expect(vals.npcGenTierHint).toContain('Mook padrao');
    expect(vals.hasCombatNpcGenerated).toBe(false);
    expect(vals.combatNpcTags).toEqual([]);
    expect(vals.combatNpcStatLine).toBe('');
  });

  it('shows NPC tags on the rail pill and focus dock, none for PCs', () => {
    const goon = { ...rook, id: 'goon', name: 'GUARDA HOLT', kind: 'npc', tags: ['elite', 'guarda'] };
    const combatState = { ...baseCombatState(), order: ['mira', 'goon'], combatants: { mira: baseCombatState().combatants.mira, goon: { side: 'enemy', initiative: 5, acted: false, defeated: false } } };
    const vals = combatRenderVals({ gm: true, characters: [mira, goon], combatState, combatFocusId: 'goon' }, renderDeps());
    const pill = vals.combatRailRows.find(r => r.id === 'goon');
    expect(pill.hasTags).toBe(true);
    expect(pill.tagsLabel).toBe('ELITE · GUARDA');
    expect(vals.combatRailRows.find(r => r.id === 'mira').hasTags).toBe(false);
    expect(vals.combatFocusCard.id).toBe('goon');
    expect(vals.combatFocusCard.tagChips).toEqual([{ label: 'ELITE' }, { label: 'GUARDA' }]);
  });

  it('setNpcGenOption/rollRandomNpcDraft fill the builder draft with a generated NPC and keep QTD', () => {
    const component = fakeComponent({ state: { combatNpcDraft: { qty: '4', attackRows: [] } } });
    const h = combatHandlers(component);
    h.setNpcGenOption({ archetype: 'solo', tier: 'misto' });
    h.setNpcGenOption({ faction: 'Militech' });
    expect(component.state.combatNpcGen).toEqual({ archetype: 'solo', tier: 'misto', faction: 'Militech' });
    h.rollRandomNpcDraft();
    const draft = component.state.combatNpcDraft;
    expect(draft.name).toContain('SOLO');
    expect(draft.qty).toBe('4');
    expect(draft.templateId).toBe('');
    expect(draft.generated).toMatchObject({ archetype: 'solo', tier: 'base', faction: 'MILITECH' });
    expect(draft.generated.tags).toContain('militech');
    expect(draft.attackRows.length).toBeGreaterThan(0);
    expect(Number(draft.hpMax)).toBeGreaterThan(0);
  });

  it('spawnRandomNpcs rolls QTD distinct NPCs with stats, skills, armor and tags on the record', async () => {
    const set = vi.fn(async (s) => s);
    const component = fakeComponent({
      api: () => ({ combat: { state: { set } }, characters: { upsert: vi.fn(async (c) => c) } }),
      normalizeStats: (b) => b,
      normalizeSkills: vi.fn((skills) => skills || []),
      slug: (s) => String(s).toLowerCase().replace(/\s+/g, '-'),
      normalizeGearItem: (item, idx) => ({ ...item, id: item.id || 'gear-' + idx }),
      state: { combatNpcDraft: { qty: '3', attackRows: [] }, combatNpcGen: { archetype: 'corpsec', tier: 'elite', faction: 'Arasaka' } },
    });
    const h = combatHandlers(component);
    await h.spawnRandomNpcs();

    const npcs = component.state.characters.filter(c => c.kind === 'npc');
    expect(npcs).toHaveLength(3);
    expect(new Set(npcs.map(c => c.name)).size).toBe(3);
    npcs.forEach((npc) => {
      expect(npc.name.startsWith('ELITE CORPSEC ')).toBe(true);
      expect(npc.tags).toEqual(expect.arrayContaining(['elite', 'corpsec', 'arasaka']));
      expect(npc.npcOrigin).toMatchObject({ archetype: 'corpsec', tier: 'elite', faction: 'ARASAKA' });
      expect(npc.base.INT).toBeGreaterThan(0);
      expect(npc.base.REF).toBeGreaterThanOrEqual(8);
      expect(npc.armor.body.name).not.toBe('NPC Armor');
      expect(npc.armor.body.sp).toBeGreaterThanOrEqual(15);
      expect(npc.gear).toHaveLength(2);
      expect(npc.gear[0].code).toBeTruthy();
      expect(npc.notes).toContain('NPC aleatorio');
      expect(component.state.combatState.order).toContain(npc.id);
    });
    expect(component.normalizeSkills).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: 'Evasion', level: 4 })]), expect.any(Object));
    expect(component.flash).toHaveBeenCalledWith('3 NPCs aleatorios adicionados ao combate');
    // The squad lands in the combat state with a single write, not one per NPC.
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0].order).toEqual(expect.arrayContaining(npcs.map(c => c.id)));
  });

  it('saveCombatState adopts the revision the server answers with, so back-to-back writes do not race', async () => {
    let revision = 3;
    const set = vi.fn(async (s) => ({ ...s, revision: ++revision }));
    const component = fakeComponent({ api: () => ({ combat: { state: { set } } }) });
    const h = combatHandlers(component);
    await h.addCombatant('rook', 'pc');
    expect(component.state.combatState.revision).toBe(4);
    await h.addCombatant('mira', 'pc');
    expect(set.mock.calls[1][0].revision).toBe(4);
    expect(component.state.combatState.revision).toBe(5);
  });

  it('addCombatants adds a whole group in one write and repairs the turn index', async () => {
    const set = vi.fn(async (s) => s);
    const component = fakeComponent({
      api: () => ({ combat: { state: { set } } }),
      state: { characters: [mira, rook, { ...rook, id: 'g1' }, { ...rook, id: 'g2' }], combatState: { ...baseCombatState(), combatants: {}, order: [], turnIndex: -1 } },
    });
    const h = combatHandlers(component);
    await h.addCombatants(['g1', 'g2', '', 'g1'], 'enemy');
    expect(set).toHaveBeenCalledTimes(1);
    expect(component.state.combatState.order).toEqual(['g1', 'g2']);
    expect(component.state.combatState.combatants.g2.side).toBe('enemy');
    expect(await h.addCombatants([], 'enemy')).toBeNull();
  });

  it('createCombatNpc keeps the generated STAT block but lets the edited BODY/REF inputs win', async () => {
    const set = vi.fn(async (s) => s);
    const component = fakeComponent({
      api: () => ({ combat: { state: { set } }, characters: { upsert: vi.fn(async (c) => c) } }),
      normalizeStats: (b) => b,
      normalizeSkills: vi.fn((skills) => skills || []),
      slug: (s) => String(s).toLowerCase().replace(/\s+/g, '-'),
      normalizeGearItem: (item, idx) => ({ ...item, id: item.id || 'gear-' + idx }),
    });
    const h = combatHandlers(component);
    const draft = npcDraftFromGenerated(generateNpc({ archetype: 'ganger', tier: 'base', seed: 'edit' }));
    await h.createCombatNpc({ ...draft, body: '9', ref: '2' });
    const npc = component.state.characters.find(c => c.kind === 'npc');
    expect(npc.base.BODY).toBe(9);
    expect(npc.base.REF).toBe(2);
    expect(npc.base.INT).toBe(draft.generated.stats.INT);
    expect(npc.tags).toEqual(draft.generated.tags);
    expect(npc.bodyType).toBe('meat');
  });

  it('spawnRandomNpcs refuses without GM login', async () => {
    const component = fakeComponent({ ensureGm: vi.fn(() => false) });
    const h = combatHandlers(component);
    await h.spawnRandomNpcs();
    expect(component.state.characters.filter(c => c.kind === 'npc')).toHaveLength(0);
  });
});

describe('ui/views/combat RAW rules: ROF budget, jams, evasion gate, grapple, ticks, shields', () => {
  beforeEach(() => {
    global.document = { querySelectorAll: vi.fn(() => []) };
    global.window = {};
  });
  afterEach(() => {
    delete global.document;
    delete global.window;
  });

  const S = (extra) => ({ characters: [mira, rook], gm: true, activeCharacterId: 'mira', combatState: baseCombatState(), comms: [], ...extra });
  const pistol = { id: 'pistol', name: 'Heavy Pistol', sides: 6, count: 3, skill: 'Handgun', rof: 2 };
  const shotgun = { id: 'shotgun', name: 'Shotgun', sides: 6, count: 5, skill: 'Shoulder Arms', rof: 1 };

  it('a jammed weapon cannot attack until unjammed, and unjamming burns the Attack Action', () => {
    const applyCharacterPatch = vi.fn();
    const component = fakeComponent({ applyCharacterPatch, state: S({ characters: [{ ...mira, gear: [{ ...pistol, jammed: true }] }, rook] }) });
    const h = combatHandlers(component);
    h.rollCombatAttack('mira', { ...pistol, jammed: true });
    expect(component.roll).not.toHaveBeenCalled();
    expect(component.flash).toHaveBeenCalledWith(expect.stringContaining('travada'));
    h.unjamWeapon('mira', 'pistol');
    expect(applyCharacterPatch).toHaveBeenCalledWith('mira', { gear: [{ ...pistol, jammed: false }] });
    expect(h.attacksThisTurn('mira')).toEqual([{ weaponId: 'pistol', rof: 1 }]);
    expect(h.attackBudgetFor('mira', pistol).allowed).toBe(false);
  });

  it('a natural 1 with a poor-quality weapon jams it', () => {
    const applyCharacterPatch = vi.fn();
    const component = fakeComponent({ applyCharacterPatch, weaponRuntimeQuality: vi.fn(() => 'poor'), state: S({ characters: [{ ...mira, gear: [pistol] }, rook] }) });
    const h = combatHandlers(component);
    h.rollCombatAttack('mira', pistol);
    const opts = component.roll.mock.calls[0][0];
    opts.onResolved({ label: 'x', detail: '', total: 3, fumble: true, crit: false });
    expect(applyCharacterPatch).toHaveBeenCalledWith('mira', { gear: [{ ...pistol, jammed: true }] });
    expect(component.postChat).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('arma travada') }));
  });

  it('ROF 2 allows two attacks; a ROF 1 weapon spends the whole action (players blocked, GM warned)', () => {
    const player = fakeComponent({ state: S({ gm: false, characters: [{ ...mira, gear: [pistol, shotgun] }, rook] }) });
    const h = combatHandlers(player);
    h.rollCombatAttack('mira', pistol);
    h.rollCombatAttack('mira', pistol);
    expect(player.roll).toHaveBeenCalledTimes(2);
    expect(h.attackBudgetLabel('mira')).toContain('ATAQUES 2/2');
    h.rollCombatAttack('mira', pistol);
    expect(player.roll).toHaveBeenCalledTimes(2);
    expect(player.flash).toHaveBeenCalledWith(expect.stringContaining('Limite de 2 ataques'), 3200);

    const gm = fakeComponent({ state: S({ gm: true, characters: [{ ...mira, gear: [pistol, shotgun] }, rook] }) });
    const g = combatHandlers(gm);
    g.rollCombatAttack('mira', shotgun);
    g.rollCombatAttack('mira', pistol);
    expect(gm.roll).toHaveBeenCalledTimes(2);
    expect(gm.flash).toHaveBeenCalledWith(expect.stringContaining('GM: seguindo mesmo assim'), 3200);
  });

  it('ranged evasion is offered only when the target may dodge bullets (REF 8+), and its result replaces the range DV', () => {
    const slowRook = { ...rook, base: { REF: 7 } };
    const component = fakeComponent({ state: S({ characters: [{ ...mira, gear: [pistol] }, slowRook], combatTargets: { mira: 'rook' } }) });
    const h = combatHandlers(component);
    expect(h.canRequestRangedEvasion('mira', pistol)).toBe(false);
    h.requestEvasion('mira', pistol);
    expect(component.postChat).not.toHaveBeenCalled();
    expect(component.flash).toHaveBeenCalledWith(expect.stringContaining('REF abaixo de 8'), 3200);

    const fastRook = { ...rook, base: { REF: 8 } };
    const quick = fakeComponent({ state: S({ characters: [{ ...mira, gear: [pistol] }, fastRook], combatTargets: { mira: 'rook' }, evasionResults: { mira: { targetId: 'rook', total: 16 } } }) });
    const q = combatHandlers(quick);
    expect(q.canRequestRangedEvasion('mira', pistol)).toBe(true);
    q.rollCombatAttack('mira', pistol);
    expect(quick.roll).toHaveBeenCalledWith(expect.objectContaining({ dv: 16 }));
  });

  it('a surprised target or one hiding behind a bulletproof shield cannot evade ranged attacks', () => {
    const surprised = { ...rook, base: { REF: 9 }, statusEffects: [{ id: 'surprised', modifiers: { cannotEvade: true } }] };
    const component = fakeComponent({ state: S({ characters: [mira, surprised], combatTargets: { mira: 'rook' } }) });
    const h = combatHandlers(component);
    h.requestEvasion('mira', { id: 'knife', name: 'Knife', melee: true });
    expect(component.flash).toHaveBeenCalledWith(expect.stringContaining('surpreendido'), 3200);
    const shielded = { ...rook, base: { REF: 9 }, shield: { itemId: 'BULLETPROOF-SHIELD', hp: 10, maxHp: 10 } };
    const s = combatHandlers(fakeComponent({ state: S({ characters: [mira, shielded], combatTargets: { mira: 'rook' } }) }));
    expect(s.canRequestRangedEvasion('mira', pistol)).toBe(false);
    expect(s.evasionBlockFor('mira', { melee: true })).toBe('');
  });

  it('a held shield intercepts ranged damage instead of the target HP', () => {
    const shielded = { ...rook, shield: { itemId: 'BULLETPROOF-SHIELD', hp: 10, maxHp: 10 }, derived: { currentHeadSp: 0, currentBodySp: 0 } };
    const applyCombatDamage = { execute: vi.fn() };
    const component = fakeComponent({ app: () => ({ applyCombatDamage }), state: S({ characters: [mira, shielded], combatTargets: { mira: 'rook' } }) });
    const h = combatHandlers(component);
    h.autoApplyCombatDamage('mira', pistol, { total: 7, dice: [] });
    expect(applyCombatDamage.execute).not.toHaveBeenCalled();
    expect(component.postChat).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('INTERCEPTA O ATAQUE') }));
    expect(component.state.characters.find(c => c.id === 'rook').shield.hp).toBe(3);
  });

  it('damage on a Mortally Wounded target opens an automatic body critical', () => {
    const dying = { ...rook, health: { cur: 0, max: 45 }, derived: { currentHeadSp: 0, currentBodySp: 0 } };
    const applyCombatDamage = { execute: vi.fn(() => ({ hpLoss: 3, spAblated: 0, characterPatch: { health: { cur: 0, max: 45 }, deathSaveWoundPenalty: 1 }, mortalWoundCritical: true, mortalWoundPenaltyDelta: 1 })) };
    const component = fakeComponent({ app: () => ({ applyCombatDamage }), state: S({ characters: [mira, dying], combatTargets: { mira: 'rook' } }) });
    const h = combatHandlers(component);
    h.autoApplyCombatDamage('mira', pistol, { total: 3, dice: [] });
    expect(component.state.critInjuryPending).toMatchObject({ targetId: 'rook', location: 'body', automatic: true });
    expect(component.postChat).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('Death Save +1') }));
  });

  it('grab marks the hold, choke deals BODY direct damage automatically and tracks the streak, throw releases', () => {
    const addStatusEffect = vi.fn();
    const applyCharacterPatch = vi.fn();
    const strongMira = { ...mira, derived: { effectiveStats: { BODY: 7 } } };
    const heldRook = { ...rook, health: { cur: 20, max: 45 }, statusEffects: [{ instanceId: 'se-g', id: 'grappled', modifiers: { grappledBy: 'mira', chokeTurns: 1, lastChokeRound: 1 } }] };
    const component = fakeComponent({ addStatusEffect, applyCharacterPatch, state: S({ characters: [strongMira, heldRook], combatTargets: { mira: 'rook' } }) });
    const h = combatHandlers(component);
    expect(h.grappleVals('mira', 'rook')).toMatchObject({ canGrab: false, canChoke: true, canThrow: true, canHumanShield: true, holdingLabel: 'AGARRANDO ROOK // CHOKE x1' });
    h.chokeTarget('mira');
    const patch = applyCharacterPatch.mock.calls[0][1];
    expect(patch.health.cur).toBe(13);
    expect(patch.statusEffects[0].modifiers).toMatchObject({ chokeTurns: 2, lastChokeRound: 2 });
    expect(h.attacksThisTurn('mira')).toEqual([{ weaponId: 'grapple:choke', rof: 1 }]);

    applyCharacterPatch.mockClear();
    h.throwTarget('mira');
    const thrown = applyCharacterPatch.mock.calls[0][1];
    expect(thrown.health.cur).toBe(13);
    expect(thrown.statusEffects).toEqual([]);

    const fresh = fakeComponent({ addStatusEffect, state: S({ characters: [strongMira, rook], combatTargets: { mira: 'rook' } }) });
    combatHandlers(fresh).grabTarget('mira');
    expect(addStatusEffect).toHaveBeenCalledWith(expect.objectContaining({ id: 'grappled', modifiers: expect.objectContaining({ grappledBy: 'mira' }) }), expect.objectContaining({ targetId: 'rook' }));
    expect(addStatusEffect).toHaveBeenCalledWith(expect.objectContaining({ id: 'grappling' }), expect.objectContaining({ targetId: 'mira' }));
  });

  it('a grappled target can be used as a human shield with HP = BODY', () => {
    const applyCharacterPatch = vi.fn();
    const heldRook = { ...rook, base: { BODY: 6 }, statusEffects: [{ instanceId: 'se-g', id: 'grappled', modifiers: { grappledBy: 'mira' } }] };
    const component = fakeComponent({ applyCharacterPatch, state: S({ characters: [mira, heldRook], combatTargets: { mira: 'rook' } }) });
    combatHandlers(component).useHumanShield('mira');
    expect(applyCharacterPatch).toHaveBeenCalledWith('mira', { shield: expect.objectContaining({ kind: 'human', hp: 6, maxHp: 6, sourceCharacterId: 'rook' }) });
  });

  it('end-of-turn fire damage and start-of-turn asphyxiation are direct HP hits, applied once per round', () => {
    const applyCharacterPatch = vi.fn();
    const burning = { ...mira, statusEffects: [{ instanceId: 'se-f', id: 'strong_on_fire', label_pt: 'Em chamas', modifiers: { directHpPerTurn: 4, tick: 'end' } }] };
    const choking = { ...rook, base: { BODY: 5 }, statusEffects: [{ instanceId: 'se-a', id: 'asphyxiating', label_pt: 'Asfixiando', modifiers: { directHpPerTurnStat: 'BODY', tick: 'start' } }] };
    const component = fakeComponent({ applyCharacterPatch, state: S({ characters: [burning, choking] }) });
    const h = combatHandlers(component);
    h.applyTurnTick('mira', 'end');
    expect(applyCharacterPatch).toHaveBeenCalledWith('mira', { health: { cur: 23, max: 35 } });
    h.applyTurnTick('rook', 'start', 2);
    h.applyTurnTick('rook', 'start', 2);
    expect(applyCharacterPatch).toHaveBeenCalledTimes(2);
    expect(applyCharacterPatch).toHaveBeenLastCalledWith('rook', { health: { cur: 30, max: 45 } });
  });
});
