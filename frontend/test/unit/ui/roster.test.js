import { describe, expect, it, vi } from 'vitest';

import { rosterHandlers, rosterRenderVals } from '../../../src/ui/views/roster.js';

const characters = [
  {
    id: 'rook', name: 'Rook', role: 'SOLO', level: 3, ip: 120, kind: 'pc', credits: 5000,
    ownerUsername: 'rook', health: { cur: 10, max: 40 },
    criticalInjuries: [{ instanceId: 'ci-1', name_pt: 'Braco Quebrado', location: 'body', treated: false }],
    statusEffects: [{ instanceId: 'se-1', label_pt: 'Atordoado', remaining: { value: 2, unit: 'round' } }],
    gear: [{ id: 'g-1', name: 'Heavy Pistol', qty: 1, type: 'WEAPON' }],
  },
  { id: 'ghost', name: 'Ghost', role: 'NETRUNNER', level: 2, ip: 30, kind: 'npc', health: { cur: 25, max: 25 } },
];

const deps = {
  selectCharacter: vi.fn(),
  deleteCharacter: vi.fn(),
  setState: vi.fn(),
  adjustHealth: vi.fn(),
  healFull: vi.fn(),
  adjustIp: vi.fn(),
  adjustCredits: vi.fn(),
  addInjury: vi.fn(),
  addStatus: vi.fn(),
  removeInjury: vi.fn(),
  removeStatus: vi.fn(),
  grantGear: vi.fn(),
  removeGear: vi.fn(),
  normalizeGearList: (gear) => (Array.isArray(gear) ? gear : []),
  playerRoleTone: () => ({ label: 'SOL', color: '#ff5f6d', rgb: '255,95,109' }),
  clampPct: (value) => Math.max(0, Math.min(100, Math.round(value))),
};

describe('ui/views/roster rosterRenderVals', () => {
  it('builds one card per character with health, conditions and the active flag', () => {
    const vals = rosterRenderVals({ characters, activeCharacterId: 'rook' }, deps);
    expect(vals.rosterCards).toHaveLength(2);
    const rook = vals.rosterCards[0];
    expect(rook).toMatchObject({
      name: 'Rook', level: 3, ip: 120, active: true, kindLabel: 'PJ',
      hpLabel: '10/40', hpPct: 25, hpColor: '#c0635b', conditionCount: 2, hasConditions: true,
    });
    expect(vals.rosterCards[1]).toMatchObject({ name: 'Ghost', active: false, kindLabel: 'NPC', hpColor: '#3fe0d0' });
    expect(vals.rosterSummary).toBe('2 FICHA(S) // 2 EM TELA');
  });

  it('switches the active sheet from a card, and deletes from its footer', () => {
    const vals = rosterRenderVals({ characters, activeCharacterId: 'rook' }, deps);
    vals.rosterCards[1].onSelect();
    expect(deps.selectCharacter).toHaveBeenCalledWith('ghost');
    vals.rosterCards[1].onDelete();
    expect(deps.deleteCharacter).toHaveBeenCalledWith('ghost');
  });

  it('filters by kind and by the free-text query', () => {
    const npcOnly = rosterRenderVals({ characters, rosterFilter: 'npc' }, deps);
    expect(npcOnly.rosterCards.map(c => c.id)).toEqual(['ghost']);

    const pcOnly = rosterRenderVals({ characters, rosterFilter: 'pc' }, deps);
    expect(pcOnly.rosterCards.map(c => c.id)).toEqual(['rook']);

    const byRole = rosterRenderVals({ characters, rosterQuery: '  netrunner ' }, deps);
    expect(byRole.rosterCards.map(c => c.id)).toEqual(['ghost']);

    const nothing = rosterRenderVals({ characters, rosterQuery: 'zzz' }, deps);
    expect(nothing.noRosterCards).toBe(true);
    expect(nothing.rosterSummary).toBe('2 FICHA(S) // 0 EM TELA');
  });

  it('drives the quick console from the shared amount field', () => {
    const vals = rosterRenderVals({ characters, activeCharacterId: 'rook', rosterAmount: '7' }, deps);
    vals.rosterDamage();
    expect(deps.adjustHealth).toHaveBeenCalledWith(-7);
    vals.rosterHeal();
    expect(deps.adjustHealth).toHaveBeenCalledWith(7);
    vals.rosterIpSpend();
    expect(deps.adjustIp).toHaveBeenCalledWith(-7);
    vals.rosterCreditsGain();
    expect(deps.adjustCredits).toHaveBeenCalledWith(7);
  });

  it('lists the active character removable rows and wires each remove', () => {
    const vals = rosterRenderVals({ characters, activeCharacterId: 'rook' }, deps);
    expect(vals.rosterInjuryRows[0]).toMatchObject({ instanceId: 'ci-1', stateLabel: 'ABERTA' });
    expect(vals.rosterStatusRows[0]).toMatchObject({ instanceId: 'se-1', stateLabel: '2 round' });
    expect(vals.rosterGearRows[0]).toMatchObject({ id: 'g-1', label: 'Heavy Pistol' });
    vals.rosterInjuryRows[0].onRemove();
    vals.rosterStatusRows[0].onRemove();
    vals.rosterGearRows[0].onRemove();
    expect(deps.removeInjury).toHaveBeenCalledWith('ci-1');
    expect(deps.removeStatus).toHaveBeenCalledWith('se-1');
    expect(deps.removeGear).toHaveBeenCalledWith('g-1');
  });

  it('reports empty removable lists for a character with nothing on it', () => {
    const vals = rosterRenderVals({ characters, activeCharacterId: 'ghost' }, deps);
    expect(vals.noRosterInjuries).toBe(true);
    expect(vals.noRosterStatuses).toBe(true);
    expect(vals.noRosterGear).toBe(true);
  });

  it('grants the selected catalog product and adds the selected condition', () => {
    const products = [{ id: 'p-1', code: 'HP', name: 'Heavy Pistol' }];
    const vals = rosterRenderVals({ characters, activeCharacterId: 'rook', products, rosterGrantId: 'p-1' }, deps);
    expect(vals.hasRosterGrantOptions).toBe(true);
    vals.grantRosterItem();
    expect(deps.grantGear).toHaveBeenCalledWith(products[0]);

    vals.addRosterInjury();
    expect(deps.addInjury).toHaveBeenCalled();
    vals.addRosterStatus();
    expect(deps.addStatus).toHaveBeenCalled();
  });

  it('opens by default and toggles the panel closed', () => {
    const open = rosterRenderVals({ characters }, deps);
    expect(open.rosterOpen).toBe(true);
    expect(open.rosterToggleLabel).toBe('RECOLHER');
    open.toggleRoster();
    expect(deps.setState).toHaveBeenCalledWith({ rosterOpen: false });

    const closed = rosterRenderVals({ characters, rosterOpen: false }, deps);
    expect(closed.rosterClosed).toBe(true);
    expect(closed.rosterToggleLabel).toBe('ABRIR MESA');
  });

  it('survives an empty campaign', () => {
    const vals = rosterRenderVals({}, deps);
    expect(vals.noRosterCards).toBe(true);
    expect(vals.hasRosterActive).toBe(false);
    expect(vals.hasRosterGrantOptions).toBe(false);
  });
});

function fakeComponent(overrides = {}) {
  const state = {
    gmAuthenticated: true,
    characters,
    activeCharacterId: 'rook',
    ...overrides,
  };
  const component = {
    state,
    flashes: [],
    patches: [],
    ensureGm: () => state.gmAuthenticated,
    flash(message) { this.flashes.push(message); },
    activeCharacter: () => state.characters.find(c => c.id === state.activeCharacterId),
    updateActiveCharacter(patch) { this.patches.push(patch); },
    normalizeGearList: (gear) => (Array.isArray(gear) ? gear : []),
    ipEntry: (type, label, amount, balanceAfter) => ({ type, label, amount, balanceAfter }),
    addCriticalInjury: vi.fn(),
    addStatusEffect: vi.fn(),
    sheetHandlers: () => ({ removeCriticalInjury: vi.fn(), removeStatusEffect: vi.fn() }),
    desktopHandlers: () => ({
      gearFromProduct: (product) => ({ id: 'new-gear', name: product.name }),
      deleteGmCharacter: vi.fn(),
    }),
  };
  return component;
}

describe('ui/views/roster rosterHandlers', () => {
  it('clamps damage at zero and healing at the maximum', () => {
    const component = fakeComponent();
    const handlers = rosterHandlers(component);
    handlers.adjustHealth(-100);
    expect(component.patches[0]).toEqual({ health: { cur: 0, max: 40 } });
    handlers.adjustHealth(100);
    expect(component.patches[1]).toEqual({ health: { cur: 40, max: 40 } });
    handlers.healFull();
    expect(component.patches[2]).toEqual({ health: { cur: 40, max: 40 } });
  });

  it('writes an IP ledger row on every IP adjustment', () => {
    const component = fakeComponent();
    rosterHandlers(component).adjustIp(25);
    expect(component.patches[0].ip).toBe(145);
    expect(component.patches[0].ipLog[0]).toMatchObject({ type: 'award', amount: 25, balanceAfter: 145 });
  });

  it('never lets an IP or eddie adjustment go negative', () => {
    const component = fakeComponent();
    const handlers = rosterHandlers(component);
    handlers.adjustIp(-999999);
    expect(component.patches[0].ip).toBe(0);
    handlers.adjustCredits(-999999);
    expect(component.patches[1]).toEqual({ credits: 0 });
  });

  it('refuses every write without a GM session', () => {
    const component = fakeComponent({ gmAuthenticated: false });
    const handlers = rosterHandlers(component);
    handlers.adjustHealth(-5);
    handlers.adjustIp(5);
    handlers.adjustCredits(5);
    handlers.healFull();
    expect(component.patches).toHaveLength(0);
  });

  it('grants a catalog product onto the active sheet gear list', () => {
    const component = fakeComponent();
    rosterHandlers(component).grantGear({ id: 'p-1', name: 'Heavy Pistol' });
    expect(component.patches[0].gear).toHaveLength(2);
    expect(component.patches[0].gear[1]).toMatchObject({ id: 'new-gear', name: 'Heavy Pistol' });
  });

  it('removes an item by id from the active sheet', () => {
    const component = fakeComponent();
    rosterHandlers(component).removeGear('g-1');
    expect(component.patches[0].gear).toEqual([]);
  });
});
