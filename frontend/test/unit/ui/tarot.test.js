import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { tarotHandlers, tarotRenderVals } from '../../../src/ui/views/tarot.js';
import { LIMIAR_TAROT_CARDS } from '../../../src/domain/tarot/constants.ts';

const characters = [
  { id: 'a', name: 'Rook' },
  { id: 'b', name: 'V' },
];

const baseDeps = () => ({
  tx: { apply: 'APLICAR', rollDice: 'ROLAR', tarotCycleSeen: 'vistas', tarotResolutionTitle: 'RESOLUCAO', tarotShuffleLocked: 'bloqueado', tarotSessionCard: 'Carta atual:', tarotSessionEmpty: 'Nenhuma carta ainda' },
  tarotVictim: vi.fn(() => characters[0]),
  tarotAttacker: vi.fn(() => characters[1]),
  tarotContextFor: vi.fn(() => ({ wasMelee: true, wasRanged: false, targetHasCyberware: false, targetHasExplosive: false, autoCyberware: false, autoExplosive: false })),
  setTarotTarget: vi.fn(),
  setTarotAttacker: vi.fn(),
  setTarotContext: vi.fn(),
  updateTarotRow: vi.fn(),
  rollTarotRow: vi.fn(),
  applyTarotRow: vi.fn(),
  resolveTarotPanel: vi.fn(),
  restoreTarotSnapshot: vi.fn(),
  closeTarotResolution: vi.fn(),
  drawTarot: vi.fn(),
  discardTarot: vi.fn(),
  startNewTarotSession: vi.fn(),
  shuffleTarot: vi.fn(),
});

describe('ui/views/tarot tarotRenderVals', () => {
  it('reports session status from drawnThisSession', () => {
    const locked = tarotRenderVals({ tarotState: { drawnThisSession: { n: LIMIAR_TAROT_CARDS[0].n, name: LIMIAR_TAROT_CARDS[0].name } } }, baseDeps());
    expect(locked.tarotSessionLocked).toBe(true);
    expect(locked.tarotSessionStatus).toBe('Carta atual: ' + LIMIAR_TAROT_CARDS[0].name);

    const empty = tarotRenderVals({ tarotState: {} }, baseDeps());
    expect(empty.tarotSessionLocked).toBe(false);
    expect(empty.tarotSessionStatus).toBe('Nenhuma carta ainda');
  });

  it('gates reshuffle on having seen the whole deck this cycle', () => {
    const partial = tarotRenderVals({ tarotState: { seen: [0, 1] } }, baseDeps());
    expect(partial.tarotCanReshuffle).toBe(false);
    expect(partial.tarotDeckCount).toBe('2/' + LIMIAR_TAROT_CARDS.length);

    const full = tarotRenderVals({ tarotState: { seen: LIMIAR_TAROT_CARDS.map((_, i) => i) } }, baseDeps());
    expect(full.tarotCanReshuffle).toBe(true);
    expect(full.tarotShuffleTitle).toBe('');
  });

  it('falls back to a blank card shape and STANDBY fx label when nothing is drawn', () => {
    const vals = tarotRenderVals({}, baseDeps());
    expect(vals.tarotHasCurrent).toBe(false);
    expect(vals.tarotCurrent).toMatchObject({ n: '', name: '' });
    expect(vals.tarotFxLabel).toBe('FX STANDBY');
  });

  it('marks the victim/attacker options selected from deps', () => {
    const vals = tarotRenderVals({ characters }, baseDeps());
    expect(vals.tarotCharacterOptions).toEqual([
      { id: 'a', name: 'Rook', selected: true, notSelected: false },
      { id: 'b', name: 'V', selected: false, notSelected: true },
    ]);
    expect(vals.tarotAttackerOptions[1]).toMatchObject({ id: 'b', selected: true });
  });

  it('onTarotVictim/onTarotAttacker forward the selected id to deps', () => {
    const deps = baseDeps();
    const vals = tarotRenderVals({ characters }, deps);
    vals.onTarotVictim({ target: { value: 'b' } });
    expect(deps.setTarotTarget).toHaveBeenCalledWith('b');
    vals.onTarotAttacker({ target: { value: 'a' } });
    expect(deps.setTarotAttacker).toHaveBeenCalledWith('a');
  });

  it('setTarotMelee/setTarotRanged and the cyberware/explosive checkboxes patch tarotContext via deps', () => {
    const deps = baseDeps();
    const vals = tarotRenderVals({}, deps);
    vals.setTarotMelee();
    expect(deps.setTarotContext).toHaveBeenCalledWith({ attackType: 'melee' });
    vals.setTarotRanged();
    expect(deps.setTarotContext).toHaveBeenCalledWith({ attackType: 'ranged' });
    vals.onTarotCyberware({ target: { checked: true } });
    expect(deps.setTarotContext).toHaveBeenCalledWith({ targetHasCyberware: true });
    vals.onTarotExplosive({ target: { checked: false } });
    expect(deps.setTarotContext).toHaveBeenCalledWith({ targetHasExplosive: false });
  });

  it('shapes a pending damage row as roll-able and a special row as note-only', () => {
    const resolution = {
      atoms: [
        { id: 'r1', atom: { type: 'damage', amount: '2d6' }, status: 'pending', rolledTotal: null, selectedLocation: 'body' },
        { id: 'r2', atom: { type: 'special', note_pt: 'GM decide' }, status: 'skipped', rolledTotal: null },
      ],
    };
    const vals = tarotRenderVals({ tarotResolution: resolution }, baseDeps());
    expect(vals.tarotRows).toHaveLength(2);
    const [damageRow, specialRow] = vals.tarotRows;
    expect(damageRow.canRoll).toBe(true);
    expect(damageRow.canApply).toBeFalsy();
    expect(specialRow.isSpecial).toBe(true);
    expect(specialRow.canAcknowledge).toBe(false); // already skipped/locked
  });

  it('wires a row apply/roll button back through deps with its own row id', () => {
    const deps = baseDeps();
    const resolution = { atoms: [{ id: 'r1', atom: { type: 'sp', amount: 2 }, status: 'pending', selectedLocation: 'body' }] };
    const vals = tarotRenderVals({ tarotResolution: resolution }, deps);
    vals.tarotRows[0].apply();
    expect(deps.applyTarotRow).toHaveBeenCalledWith('r1');
    vals.tarotRows[0].roll();
    // sp atoms have no dice notation, so rollTarotRow shouldn't be reachable via canRoll,
    // but the button handler itself always forwards to deps regardless of gating.
    expect(deps.rollTarotRow).toHaveBeenCalledWith('r1');
  });

  it('drawTarot/forceDrawTarot/discardTarot/newTarotSession/shuffleTarot delegate to deps', () => {
    const deps = baseDeps();
    const vals = tarotRenderVals({}, deps);
    vals.drawTarot();
    expect(deps.drawTarot).toHaveBeenCalledWith();
    vals.forceDrawTarot();
    expect(deps.drawTarot).toHaveBeenCalledWith(true);
    vals.discardTarot();
    expect(deps.discardTarot).toHaveBeenCalled();
    vals.newTarotSession();
    expect(deps.startNewTarotSession).toHaveBeenCalled();
    vals.shuffleTarot();
    expect(deps.shuffleTarot).toHaveBeenCalled();
  });
});

function fakeComponent(overrides = {}) {
  return {
    state: { characters, activeCharacterId: 'a', gm: true, tarotState: {}, tarotContext: {}, ...overrides.state },
    setState: vi.fn(function (patch) {
      const next = typeof patch === 'function' ? patch(this.state) : patch;
      this.state = { ...this.state, ...next };
    }),
    ensureGm: overrides.ensureGm || vi.fn(() => true),
    flash: vi.fn(),
    tx: vi.fn(() => ({ tarotSessionCard: 'Carta atual:', tarotSessionEmpty: 'Nenhuma carta ainda', tarotTriggerLocked: 'bloqueado', tarotTriggerConfirm: 'confirmar?' })),
    api: overrides.api || vi.fn(() => null),
    app: overrides.app || vi.fn(() => null),
    activeCharacter: overrides.activeCharacter || vi.fn(() => characters[0]),
    characterById: overrides.characterById || vi.fn((id) => characters.find(c => c.id === id) || characters[0]),
    normalizeCharacter: overrides.normalizeCharacter || vi.fn((c) => ({ criticalInjuries: [], statusEffects: [], spDamage: { head: 0, body: 0 }, health: { cur: 30 }, humanityLoss: 0, ...c })),
    installedCyberware: overrides.installedCyberware || vi.fn(() => []),
    normalizeGearList: overrides.normalizeGearList || vi.fn(() => []),
    asNumber: overrides.asNumber || vi.fn((v, fallback) => (v === '' || v == null ? fallback : Number(v))),
    roll: overrides.roll || vi.fn(),
    updateCharacterById: overrides.updateCharacterById || vi.fn(),
    adjustSpDamage: overrides.adjustSpDamage || vi.fn(),
    addCriticalInjury: overrides.addCriticalInjury || vi.fn(() => ({ applied: true })),
    addStatusEffect: overrides.addStatusEffect || vi.fn(),
    empImmunitySources: overrides.empImmunitySources || vi.fn(() => []),
    skillCanonicalName: overrides.skillCanonicalName || vi.fn((s) => s),
  };
}

describe('ui/views/tarot tarotHandlers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ensureTarotState persists a fresh (null) payload but not an existing one', async () => {
    const set = vi.fn(async () => {});
    const component = fakeComponent({ api: () => ({ tarot: { state: { set } } }) });
    await tarotHandlers(component).ensureTarotState(null);
    expect(set).toHaveBeenCalledTimes(1);
    set.mockClear();
    await tarotHandlers(component).ensureTarotState({ order: [], seen: [] });
    expect(set).not.toHaveBeenCalled();
  });

  it('saveTarotState flashes and returns null on persistence failure without allowLocal', async () => {
    const set = vi.fn(async () => { throw new Error('boom'); });
    const component = fakeComponent({ api: () => ({ tarot: { state: { set } } }) });
    const result = await tarotHandlers(component).saveTarotState({ order: [], seen: [] });
    expect(result).toBeNull();
    expect(component.flash).toHaveBeenCalledWith('Falha ao persistir taro: boom', 3200);
  });

  it('tarotSessionLocked/tarotSessionStatusLabel reflect drawnThisSession', () => {
    const card = LIMIAR_TAROT_CARDS[0];
    const component = fakeComponent({ state: { tarotState: { drawnThisSession: { n: card.n, name: card.name } } } });
    const tarot = tarotHandlers(component);
    expect(tarot.tarotSessionLocked()).toBe(true);
    expect(tarot.tarotSessionStatusLabel()).toBe('Carta atual: ' + card.name);
  });

  it('startNewTarotSession requires GM auth', async () => {
    const component = fakeComponent({ ensureGm: vi.fn(() => false) });
    await tarotHandlers(component).startNewTarotSession();
    expect(component.flash).not.toHaveBeenCalledWith('Nova sessao de taro iniciada');
  });

  it('drawTarot refuses a second draw this session unless forced', async () => {
    const card = LIMIAR_TAROT_CARDS[0];
    const component = fakeComponent({ state: { tarotState: { drawnThisSession: { n: card.n, name: card.name } }, tarotPhase: 'idle' } });
    await tarotHandlers(component).drawTarot(false);
    expect(component.flash).toHaveBeenCalledWith(expect.stringContaining('Ja existe uma carta sacada'), 3200);
    expect(component.app).not.toHaveBeenCalled();
  });

  it('drawTarot pulls a card via the resolveTarotDraw use case when idle', async () => {
    const card = { n: 'I', name: 'O MAGO', img: '', fx: 'matrix' };
    const execute = vi.fn(async () => ({ ok: true, card, tarotState: { order: ['I'], history: [] } }));
    const component = fakeComponent({ state: { tarotPhase: 'idle', tarotState: {} }, app: () => ({ resolveTarotDraw: { execute } }) });
    await tarotHandlers(component).drawTarot();
    expect(execute).toHaveBeenCalledWith({ tarotState: {}, force: false });
    expect(component.state.tarotCurrent).toEqual(card);
    expect(component.state.tarotPhase).toBe('dealing');
  });

  it('discardTarot clears the current card after the discard animation delay', () => {
    const component = fakeComponent({ state: { tarotPhase: 'shown', tarotCurrent: { n: 'I', discard: 'normal' } } });
    tarotHandlers(component).discardTarot();
    expect(component.state.tarotPhase).toBe('discarding');
    vi.advanceTimersByTime(660);
    expect(component.state.tarotCurrent).toBeNull();
    expect(component.state.tarotPhase).toBe('idle');
  });

  it('shuffleTarot refuses until the full cycle has been seen', async () => {
    const component = fakeComponent({ state: { tarotState: { seen: ['I'], order: [] } } });
    await tarotHandlers(component).shuffleTarot();
    expect(component.flash).toHaveBeenCalledWith(expect.stringContaining('22/22'), 3200);
  });

  it('setTarotTarget resets context flags and any in-progress resolution', () => {
    const component = fakeComponent({ state: { tarotContext: { targetHasCyberware: true }, tarotResolution: { atoms: [] } } });
    tarotHandlers(component).setTarotTarget('b');
    expect(component.state.tarotTargetId).toBe('b');
    expect(component.state.tarotContext.targetHasCyberware).toBeNull();
    expect(component.state.tarotResolution).toBeNull();
  });

  it('attackTypeFromWeapon infers ranged/melee from the weapon skill, falling back to context', () => {
    const component = fakeComponent({ skillCanonicalName: (s) => s, state: { tarotContext: { attackType: 'ranged' } } });
    const tarot = tarotHandlers(component);
    expect(tarot.attackTypeFromWeapon({ skill: 'Handgun' })).toBe('ranged');
    expect(tarot.attackTypeFromWeapon({ skill: 'Melee Weapon' })).toBe('melee');
    expect(tarot.attackTypeFromWeapon({ skill: 'Wardrobe & Style' })).toBe('ranged'); // falls back to state.tarotContext.attackType
  });

  it('resolveTarotPanel builds resolution rows from the current card against the victim context', () => {
    const card = { n: 'III', effects: [{ type: 'damage', amount: '2d6' }] };
    const component = fakeComponent({ state: { tarotCurrent: card, tarotTargetId: 'a' } });
    tarotHandlers(component).resolveTarotPanel();
    expect(component.state.tarotResolution.atoms).toHaveLength(1);
    expect(component.state.tarotResolution.atoms[0].atom).toMatchObject({ type: 'damage', amount: '2d6' });
    expect(component.state.tarotApplySnapshot).toMatchObject({ cardN: 'III', targetId: 'a' });
  });

  it('applyTarotRow computes HP loss through armor and marks the row applied', () => {
    const component = fakeComponent({
      characterById: () => ({ id: 'a', name: 'Rook', health: { cur: 30 }, derived: { currentBodySp: 0 } }),
    });
    component.state.tarotResolution = {
      atoms: [{ id: 'r1', atom: { type: 'damage' }, status: 'pending', damageValue: '10', selectedLocation: 'body', note: 'Dano base do ataque' }],
    };
    tarotHandlers(component).applyTarotRow('r1');
    expect(component.updateCharacterById).toHaveBeenCalledWith('a', { health: { cur: 20 } });
    const row = component.state.tarotResolution.atoms[0];
    expect(row.status).toBe('applied');
    expect(row.note).toContain('HP -10');
  });

  it('restoreTarotSnapshot reverts the target to the stored snapshot', () => {
    const component = fakeComponent({
      characterById: () => ({ id: 'a', health: { cur: 5 } }),
      state: { tarotApplySnapshot: { targetId: 'a', criticalInjuries: [], statusEffects: [], spDamage: { head: 0, body: 0 }, health: { cur: 30 }, humanityLoss: 0 } },
    });
    tarotHandlers(component).restoreTarotSnapshot();
    expect(component.updateCharacterById).toHaveBeenCalledWith('a', expect.objectContaining({ health: { cur: 30 } }));
    expect(component.state.tarotResolution).toBeNull();
  });
});
