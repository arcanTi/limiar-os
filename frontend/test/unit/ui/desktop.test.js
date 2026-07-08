import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { desktopHandlers, desktopRenderVals } from '../../../src/ui/views/desktop.js';

const tx = { desktop: 'DESKTOP', market: 'MARKET', dice: 'DICE', inventory: 'INVENTORY', map: 'MAP', comms: 'COMMS', combat: 'COMBAT', miniGame: 'MINI-GAME', system: 'SYSTEM', depleted: 'DEPLETED', equipped: 'EQUIPPED', roll: 'ROLL', dmg: 'DMG', skill: 'SKILL', rof: 'ROF', mag: 'MAG', concealable: 'CONCEALABLE', halfSp: 'HALF SP', hands: 'HANDS', req: 'REQ', alreadyInstalled: 'INSTALLED', activeUnit: 'ACTIVE', insufficient: 'SHORT', shortBy: 'SHORT BY', addToGear: 'ADD', install: 'INSTALL', balanceAfterInstall: 'BALANCE', physicsOnline: 'PHYSICS ONLINE', rngFallback: 'RNG FALLBACK' };

const mira = { id: 'mira', name: 'Mira', role: 'Solo', level: 2, roleAbilityRank: 4, ip: 30, initials: 'MI', notes: '', gear: [], credits: 500 };

function renderDeps(overrides = {}) {
  return {
    tx,
    activeCharacter: mira,
    derived: { hpMax: 35, seriouslyWounded: 10, currentHeadSp: 11, headSp: 11, currentBodySp: 11, bodySp: 11, humanityMax: 50, effectiveEmp: 5, cyberpsychosisExtreme: false, cyberpsychosisActive: false, actionPenalty: 0, naturalHealingPerRest: 2, naturalHealingMultiplier: 1 },
    eff: { BODY: 5, REF: 5 },
    healthCur: 30,
    healthMax: 35,
    hum: 45,
    ramMax: 6,
    ramUsed: 2,
    criticalInjuryRows: [],
    statusEffectRows: [],
    woundFlags: 'NENHUMA',
    healingBreakdown: 'BODY 2',
    chromeCount: 0,
    chromeEffectGroupsLength: 0,
    canEditSheet: true,
    products: [],
    gearList: [],
    clockText: () => '12:00:00',
    scanlinesDefault: true,
    auraDefault: true,
    setState: vi.fn(),
    asNumber: (v, f) => (Number.isFinite(Number(v)) ? Number(v) : f),
    normalizeGearList: (gear) => gear || [],
    installedCyberweaponGear: () => [],
    hasDamageProfile: (item) => !!(item && item.sides && item.count),
    gearDamageText: (item) => (item.dmg || ''),
    ignoresHalfSpBadge: () => false,
    effectMap: (map) => map || {},
    weaponProfile: (p) => ({ dmg: '', skill: '', rof: null, mag: null, hands: null, concealable: false, modes: [], special: '' }),
    normalizeEquipped: (equipped) => equipped || [],
    traumaPlanKey: () => 'silver',
    fmt: (n) => '₢' + n,
    fmtShort: (n) => String(n),
    clampPct: (v) => Math.max(0, Math.min(100, Math.round(v))),
    chipStyle: (a) => (a ? 'chip-on' : 'chip-off'),
    viewStyle: (a) => (a ? 'view-on' : 'view-off'),
    pageBtnStyle: (a) => (a ? 'page-on' : 'page-off'),
    dieStyle: (a) => (a ? 'die-on' : 'die-off'),
    langBtnStyle: (a) => (a ? 'lang-on' : 'lang-off'),
    toggleRow: (on) => (on ? 'row-on' : 'row-off'),
    parseGearDamage: () => null,
    roll: vi.fn(),
    triggerFileInput: vi.fn(),
    go: vi.fn(),
    toggleRole: vi.fn(),
    loginGm: vi.fn(),
    logoutGm: vi.fn(),
    closeRoll: vi.fn(),
    rollAgain: vi.fn(),
    addInventoryGear: vi.fn(),
    toggleInventoryEquip: vi.fn(),
    deleteInventoryGear: vi.fn(),
    useInventoryGear: vi.fn(),
    buy: vi.fn(),
    createGmCharacter: vi.fn(),
    upsertGmItem: vi.fn(),
    deleteGmItem: vi.fn(),
    onGmCharacterImageUpload: vi.fn(),
    onGmItemImageUpload: vi.fn(),
    selectGameTab: vi.fn(),
    ...overrides,
  };
}

function baseState(overrides = {}) {
  return {
    view: 'desktop',
    credits: 500,
    owned: [],
    equipped: [],
    marketQuery: '',
    marketPageSize: 8,
    marketPage: 1,
    marketCat: 'ALL',
    marketAvail: 'ALL',
    diceSides: 20,
    diceCount: 1,
    diceMod: 0,
    rolls: [],
    inventoryDraft: {},
    gmCharacterDraft: {},
    gmItemDraft: {},
    now: new Date(),
    lang: 'en',
    ...overrides,
  };
}

describe('ui/views/desktop desktopRenderVals', () => {
  it('titles the current view and flags which page is active', () => {
    const vals = desktopRenderVals(baseState({ view: 'market' }), renderDeps());
    expect(vals.viewTitle).toBe('MARKET');
    expect(vals.isMarket).toBe(true);
    expect(vals.isDesktop).toBe(false);
  });

  it('builds character vitals and flags from the forwarded sheet data', () => {
    const vals = desktopRenderVals(baseState(), renderDeps());
    expect(vals.health).toEqual({ cur: 30, max: 35, pct: 86 });
    expect(vals.characterDetailVitals.find(v => v.label === 'IP').value).toBe('30');
    expect(vals.characterDetailFlags.find(v => v.label === 'CONDICOES').value).toBe('0');
  });

  it('filters inventory gear and gates management by canEditSheet', () => {
    const gear = [{ id: 'g1', name: 'Katana', type: 'WEAPON - MELEE', qty: 1, sides: 6, count: 3, equipped: false, rarity: '#fff' }];
    const vals = desktopRenderVals(baseState(), renderDeps({ normalizeGearList: () => gear }));
    expect(vals.gear).toHaveLength(1);
    expect(vals.gear[0].canManage).toBe(true);
    expect(vals.inventoryWeaponTotal).toBe(1);

    const locked = desktopRenderVals(baseState(), renderDeps({ normalizeGearList: () => gear, canEditSheet: false }));
    expect(locked.gear[0].canManage).toBe(false);
  });

  it('opens a non-weapon product comparison without throwing (regression: attrOrder ReferenceError)', () => {
    const product = { code: 'AIR-SUPP', name: 'Air Supply', cat: 'INTERNAL', kind: 'cyberware', stock: 'IN STOCK', price: 100, statMod: { BODY: 1 }, skillBonus: {}, armor: 0, ram: 0, hcost: 2 };
    const vals = desktopRenderVals(baseState({ selected: product }), renderDeps({ products: [product] }));
    expect(vals.selected.cmp.some(row => row.label === 'BODY')).toBe(true);
  });

  it('labels the manual dice roller and wires rollManual to the roll engine', () => {
    const roll = vi.fn();
    const vals = desktopRenderVals(baseState({ diceSides: 12, diceCount: 2, diceMod: 1 }), renderDeps({ roll }));
    expect(vals.diceLabel).toBe('2d12+1');
    vals.rollManual();
    expect(roll).toHaveBeenCalledWith({ label: '2d12+1', sides: 12, count: 2, mod: 1 });
  });

  it('toggles scanlines/aura from their current computed state', () => {
    const setState = vi.fn();
    const vals = desktopRenderVals(baseState({ scanOn: true }), renderDeps({ setState }));
    vals.toggleScan();
    expect(setState).toHaveBeenCalledWith({ scanOn: false });
  });

  it('exposes player self-registration controls in the login modal', () => {
    const registerPlayerUser = vi.fn();
    const setState = vi.fn();
    const vals = desktopRenderVals(
      baseState({ gmLoginOpen: true, userRegisterMode: true, userRegisterUsername: 'newbie', userRegisterPassword: 'password-123', userRegisterConfirm: 'password-123' }),
      renderDeps({ registerPlayerUser, setState }),
    );

    expect(vals.userRegisterMode).toBe(true);
    expect(vals.userLoginMode).toBe(false);
    expect(vals.userRegisterUsername).toBe('newbie');
    expect(vals.registerPasswordHintStyle).toContain('lm-auth-rule--ok');
    expect(vals.registerConfirmHint).toBe('senhas conferem');
    vals.registerPlayerUser();
    expect(registerPlayerUser).toHaveBeenCalled();
    vals.showLoginMode();
    expect(setState).toHaveBeenCalledWith({ userRegisterMode: false, gmLoginStatus: '' });
  });

  it('renders bodymap asset and wires clickable chrome descriptions', () => {
    const setState = vi.fn();
    const vals = desktopRenderVals(
      baseState({ inventoryBodyView: true }),
      renderDeps({
        setState,
        installedCyberware: () => [{ code: 'NEURAL-LINK', name: 'Neural Link', cat: 'NEURAL', desc: 'Base neural para plugs.' }],
      }),
    );

    expect(vals.bodyMapImageSrc).toBe('assets/bodymap/cyber-vitruvian-bodymap.png');
    expect(vals.bodyMapView.regions[0].items[0].description).toBe('Base neural para plugs.');
    vals.bodyMapView.regions[0].items[0].onClick();
    expect(setState).toHaveBeenCalledWith({ bodyMapOpenItemId: 'skull-NEURAL-LINK-0' });
  });

  it('shows the Tarot/Nexus mini-game tab shell keyed off state.gameTab', () => {
    const vals = desktopRenderVals(baseState({ gameTab: 'nexus' }), renderDeps());
    expect(vals.isNexusTab).toBe(true);
    expect(vals.isTarotTab).toBe(false);
    expect(vals.gamesMaxWidth).toBe('1480px');
  });
});

function fakeComponent(overrides = {}) {
  return {
    state: { characters: [mira], activeCharacterId: 'mira', credits: 500, equipped: [], gmItemDraft: {}, gmCharacterDraft: {}, products: [], inventoryDraft: {}, ...overrides.state },
    setState: vi.fn(function (patch) {
      const next = typeof patch === 'function' ? patch(this.state) : patch;
      this.state = { ...this.state, ...next };
    }),
    ensureGm: overrides.ensureGm || vi.fn(() => true),
    api: overrides.api || vi.fn(() => null),
    app: overrides.app || vi.fn(() => ({})),
    flash: vi.fn(),
    asNumber: (v, f) => (Number.isFinite(Number(v)) ? Number(v) : f),
    slug: (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    parseGearDamage: vi.fn(),
    normalizeGearList: (gear) => gear || [],
    normalizeGearItem: (item) => item,
    normalizeEquipped: (e) => e || [],
    normalizeCharacter: (c) => c,
    normalizeStats: (b) => b,
    equippedCodes: (e) => (e || []).map(x => x.code),
    activeCharacter: overrides.activeCharacter || vi.fn(() => mira),
    updateActiveCharacter: vi.fn(),
    installedCyberweaponGear: () => [],
    hasDamageProfile: () => false,
    weaponProfile: (p) => ({ ...p }),
    installPayload: (p) => p,
    cyberweaponRollContext: () => null,
    uploadImage: vi.fn(async () => ({ url: 'http://img' })),
    store: () => ({ slug: (s) => String(s).toLowerCase() }),
    roll: vi.fn(),
    combatHandlers: () => ({ combatDamageContributions: vi.fn(() => []), useCombatUtility: vi.fn() }),
    nexusHandlers: () => ({ teardownNexus: vi.fn(), mountNexus: vi.fn() }),
    gearList: [],
    ...overrides,
  };
}

describe('ui/views/desktop desktopHandlers', () => {
  it('addInventoryGear requires GM and refuses an unnamed item', () => {
    const denied = fakeComponent({ ensureGm: vi.fn(() => false) });
    desktopHandlers(denied).addInventoryGear();
    expect(denied.updateActiveCharacter).not.toHaveBeenCalled();

    const component = fakeComponent({ state: { inventoryDraft: { name: '' } } });
    desktopHandlers(component).addInventoryGear();
    expect(component.flash).toHaveBeenCalledWith('Informe o nome do equipamento');
  });

  it('addInventoryGear appends a normalized item to the active character gear', () => {
    const component = fakeComponent({ state: { inventoryDraft: { name: 'Shiv', type: 'WEAPON - MELEE', qty: '1', dmg: '1d6', count: '1', sides: '6', mod: '0' } } });
    desktopHandlers(component).addInventoryGear();
    expect(component.updateActiveCharacter).toHaveBeenCalledWith(expect.objectContaining({ gear: expect.arrayContaining([expect.objectContaining({ name: 'Shiv' })]) }));
  });

  it('toggleInventoryEquip and deleteInventoryGear require GM auth', () => {
    const denied = fakeComponent({ ensureGm: vi.fn(() => false) });
    const h = desktopHandlers(denied);
    h.toggleInventoryEquip('g1');
    h.deleteInventoryGear('g1');
    expect(denied.updateActiveCharacter).not.toHaveBeenCalled();
  });

  it('buy() lets a trauma plan through without GM auth but gates gear purchases behind it', () => {
    const plan = { kind: 'trauma-plan', planKey: 'gold', price: 0, stock: 'IN STOCK', name: 'Gold' };
    const noGm = fakeComponent({ ensureGm: vi.fn(() => false), api: () => ({ characters: { upsert: vi.fn() } }) });
    desktopHandlers(noGm).buy(plan);
    expect(noGm.setState).toHaveBeenCalled();

    const gear = { kind: 'gear', code: 'X', price: 10, stock: 'IN STOCK' };
    const denied = fakeComponent({ ensureGm: vi.fn(() => false) });
    denied.setState.mockClear();
    desktopHandlers(denied).buy(gear);
    expect(denied.setState).not.toHaveBeenCalled();
  });

  it('createGmCharacter requires GM auth, a name, and persists via the api', async () => {
    const denied = fakeComponent({ ensureGm: vi.fn(() => false) });
    await desktopHandlers(denied).createGmCharacter();
    expect(denied.setState).not.toHaveBeenCalled();

    const upsert = vi.fn(async (c) => ({ ...c, credits: 12000 }));
    const component = fakeComponent({ state: { gmCharacterDraft: { name: 'New Op', role: 'Fixer' } }, api: () => ({ characters: { upsert } }) });
    await desktopHandlers(component).createGmCharacter();
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'NEW OP', role: 'FIXER' }));
    expect(component.state.gmStatus).toContain('NEW OP');
  });

  it('upsertGmItem and deleteGmItem require GM auth and touch the products list', async () => {
    const upsert = vi.fn(async (item) => item);
    const component = fakeComponent({ state: { gmItemDraft: { name: 'Widget', code: 'WID', cat: 'GEAR', price: '50' } }, api: () => ({ items: { upsert, delete: vi.fn() } }) });
    await desktopHandlers(component).upsertGmItem();
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ code: 'WID', name: 'Widget' }));
    expect(component.state.products.some(p => p.code === 'WID')).toBe(true);

    const del = vi.fn(async () => {});
    const withItem = fakeComponent({ state: { gmItemDraft: { code: 'WID' }, products: [{ code: 'WID', id: 'wid' }] }, api: () => ({ items: { delete: del } }) });
    await desktopHandlers(withItem).deleteGmItem();
    expect(del).toHaveBeenCalledWith('WID');
    expect(withItem.state.products).toHaveLength(0);
  });

  it('selectGameTab tears down Nexus when leaving it and mounts it when entering', () => {
    const component = fakeComponent();
    desktopHandlers(component).selectGameTab('tarot');
    expect(component.nexusHandlers().teardownNexus).not.toBeUndefined();
    expect(component.state.gameTab).toBe('tarot');

    const mountNexus = vi.fn();
    const teardownNexus = vi.fn();
    const withNexus = fakeComponent({ nexusHandlers: () => ({ teardownNexus, mountNexus }) });
    desktopHandlers(withNexus).selectGameTab('nexus');
    expect(mountNexus).toHaveBeenCalled();
    expect(withNexus.state.gameTab).toBe('nexus');
  });
});
