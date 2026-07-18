import { describe, expect, it, vi, beforeEach } from 'vitest';

import { sheetHandlers, sheetRenderVals } from '../../../src/ui/views/sheet.js';
import {
  damageProgramRez,
  deckProgramSummary,
  normalizeInstalledPrograms,
  repairProgramRez,
} from '../../../src/domain/netrunning/index.ts';

const baseCharacter = {
  id: 'a', name: 'Rook', role: 'Solo', level: 4, roleAbilityRank: 5, ip: 120,
  base: { INT: '6', REF: '8', DEX: '6', TECH: '6', COOL: '6', WILL: '7', LUCK: '5', MOVE: '6', BODY: '8', EMP: '4' },
  skills: [], criticalInjuries: [], statusEffects: [], equipped: [], gear: [], ipLog: [],
};

const characters = [baseCharacter, { id: 'b', name: 'V', role: 'Netrunner', level: 2 }];

const derived = {
  currentHeadSp: 11, headSp: 11, currentBodySp: 11, bodySp: 11,
  actionPenalty: 0, deathSaveModifier: 0, naturalHealingPerRest: 2, naturalHealingMultiplier: 1,
  naturalHealingBase: 2, naturalHealingSources: [], ignoreSeriouslyWounded: false, ignoreWoundState: false, skipDeathSave: false,
  hpMax: 35, humanityMax: 70,
};

const eff = { INT: 6, REF: 8, DEX: 6, TECH: 6, COOL: 6, WILL: 7, LUCK: 5, MOVE: 6, BODY: 8, EMP: 4 };

const baseDeps = (overrides = {}) => ({
  tx: { untreat: 'UNTREAT', treat: 'TREAT', apply: 'APPLY', rollDice: 'ROLL', noChromeInstalled: 'NO CHROME' },
  activeCharacter: baseCharacter,
  derived,
  eff,
  setState: vi.fn(),
  asNumber: (v, f, min, max) => {
    const n = Number(v);
    if (v === '' || v == null || Number.isNaN(n)) return f;
    return Math.min(max ?? n, Math.max(min ?? n, n));
  },
  cpredStatMax: () => 10,
  normalizeStats: (base) => base || {},
  normalizeEquipped: (equipped) => equipped || [],
  normalizeShield: (shield) => shield && shield.itemId ? { itemId: shield.itemId, hp: Number(shield.hp), maxHp: Number(shield.maxHp) } : null,
  normalizeInstalledPrograms,
  deckProgramSummary,
  normalizeArmor: (a) => a || {},
  normalizeSkills: (skills) => skills || [],
  skillSpend: () => 0,
  derivedStats: () => derived,
  cyberwareStatModBonus: () => ({ sources: [] }),
  skillCyberwareBonus: () => ({ total: 0, sources: [] }),
  cyberSourceBreakdown: () => [],
  roll: vi.fn(),
  installedCyberware: () => [],
  compatibleEnhancements: () => [],
  normalizeEnhancementCodes: () => [],
  cyberwareBonuses: () => ({ groups: [] }),
  immunityBadges: () => [],
  cyberwareFlagSources: () => [],
  armorTotal: () => 11,
  effectMap: () => ({}),
  installPayload: (p) => p,
  products: [],
  playerRoleTone: () => ({ label: 'SOL', color: '#fff', rgb: '0,0,0' }),
  traumaPlanKey: () => 'silver',
  traumaPlanByKey: (key) => ({ key, label: key.toUpperCase(), pt: key.toUpperCase(), color: '#fff', bg: '#000', glow: '#000' }),
  statusChargeKey: () => null,
  fmtShort: (n) => String(n),
  clampPct: (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0))),
  flash: vi.fn(),
  triggerFileInput: vi.fn(),
  sheetDraftFrom: vi.fn(() => ({ base: baseCharacter.base, skills: [], equipped: [] })),
  selectCharacter: vi.fn(),
  editSheet: vi.fn(),
  createSheetCharacter: vi.fn(),
  createPlayerCharacter: vi.fn(),
  cancelSheetEdit: vi.fn(),
  saveSheetDraft: vi.fn(),
  updateNotesField: vi.fn(),
  onPlayerPortraitUpload: vi.fn(),
  removeTraumaPlan: vi.fn(),
  useExecutiveTraumaBackup: vi.fn(),
  toggleCyberwareEnhancement: vi.fn(),
  uninstallCyberware: vi.fn(),
  buyIpIncrease: vi.fn(),
  addCriticalInjury: vi.fn(),
  addStatusEffect: vi.fn(),
  toggleCriticalInjury: vi.fn(),
  removeCriticalInjury: vi.fn(),
  useStatusCharge: vi.fn(),
  removeStatusEffect: vi.fn(),
  advanceConditionTime: vi.fn(),
  applyNaturalHealingRest: vi.fn(),
  applyHumanityTherapy: vi.fn(),
  rollMoraleBoost: vi.fn(),
  rollNetrunningAbility: vi.fn(),
  installNetrunningProgram: vi.fn(),
  removeNetrunningProgram: vi.fn(),
  damageNetrunningProgram: vi.fn(),
  repairNetrunningProgram: vi.fn(),
  equipShield: vi.fn(),
  removeShield: vi.fn(),
  damageActiveShield: vi.fn(),
  repairActiveShield: vi.fn(),
  ...overrides,
});

describe('ui/views/sheet sheetRenderVals', () => {
  it('defaults to the core tab and switches on click', () => {
    const vals = sheetRenderVals({ characters }, baseDeps());
    expect(vals.sheetTabCore).toBe(true);
    const skillsTab = vals.sheetTabs.find(t => t.key === 'skills');
    skillsTab.onClick();
    expect(baseDeps().setState).not.toBe(skillsTab.onClick); // sanity: distinct fn, no throw above
  });

  it('builds attribute editors from the sheet draft with roll handlers wired', () => {
    const deps = baseDeps();
    const vals = sheetRenderVals({ characters }, deps);
    expect(vals.attrEditors).toHaveLength(10);
    expect(vals.attrEditors[0]).toMatchObject({ key: 'INT', value: '6' });
  });

  it('caps an IP purchase row at MAX once the target is capped', () => {
    const deps = baseDeps({ activeCharacter: { ...baseCharacter, roleAbilityRank: 10 } });
    const vals = sheetRenderVals({ characters }, deps);
    const roleRow = vals.ipPurchaseRows[0];
    expect(roleRow.capped).toBe(true);
    expect(roleRow.buyLabel).toBe('MAX');
  });

  it('locks the role-rank purchase when the one-rank-per-session limit was already used', () => {
    const deps = baseDeps();
    const vals = sheetRenderVals({ characters, ipOneRankPerSession: true, ipRankPurchasedThisSession: true }, deps);
    const roleRow = vals.ipPurchaseRows[0];
    expect(roleRow.buyLabel).toBe('BLOQ');
    roleRow.buy();
    expect(deps.flash).toHaveBeenCalledWith(expect.stringContaining('Limite de 1 aumento'));
  });

  it('shapes critical injury rows with GM-gated toggle/remove wired to deps', () => {
    const entry = { instanceId: 'ci1', location: 'head', treated: false, name_pt: 'Concussao' };
    const deps = baseDeps({ activeCharacter: { ...baseCharacter, criticalInjuries: [entry] } });
    const vals = sheetRenderVals({ characters }, deps);
    expect(vals.criticalInjuryRows).toHaveLength(1);
    expect(vals.criticalInjuryRows[0].locationLabel).toBe('CABECA');
    vals.criticalInjuryRows[0].toggle();
    expect(deps.toggleCriticalInjury).toHaveBeenCalledWith('ci1');
    vals.criticalInjuryRows[0].remove();
    expect(deps.removeCriticalInjury).toHaveBeenCalledWith('ci1');
  });

  it('shapes status effect rows and wires useCharge/remove', () => {
    const entry = { instanceId: 'se1', label_pt: 'On Fire', modifiers: {} };
    const deps = baseDeps({ activeCharacter: { ...baseCharacter, statusEffects: [entry] } });
    const vals = sheetRenderVals({ characters }, deps);
    expect(vals.statusEffectRows).toHaveLength(1);
    vals.statusEffectRows[0].useCharge();
    expect(deps.useStatusCharge).toHaveBeenCalledWith('se1');
    vals.statusEffectRows[0].remove();
    expect(deps.removeStatusEffect).toHaveBeenCalledWith('se1');
  });

  it('falls back to the empty-slot placeholder when no chrome is installed', () => {
    const vals = sheetRenderVals({ characters }, baseDeps());
    expect(vals.slots).toHaveLength(1);
    expect(vals.slots[0].code).toBe('- NO CHROME -');
  });

  it('lists installed chrome with uninstall wired to deps', () => {
    const chip = { code: 'BIOMON', name: 'Biomonitor', cat: 'INTERNAL', enhancements: [] };
    const deps = baseDeps({ installedCyberware: () => [chip] });
    const vals = sheetRenderVals({ characters }, deps);
    expect(vals.slots).toHaveLength(1);
    expect(vals.slots[0].code).toBe('BIOMON');
    vals.slots[0].uninstall();
    expect(deps.uninstallCyberware).toHaveBeenCalledWith('BIOMON');
  });

  it('marks the active character in the roster switcher and wires selectCharacter', () => {
    const deps = baseDeps();
    const vals = sheetRenderVals({ characters, activeCharacterId: 'a' }, deps);
    expect(vals.sheetCharacterBtns.find(b => b.id === 'a').style).toContain('--active');
    vals.sheetCharacterBtns.find(b => b.id === 'b').onClick();
    expect(deps.selectCharacter).toHaveBeenCalledWith('b');
  });

  it('shows the GM-only trauma plan actions only for a GM viewing a covered plan', () => {
    const deps = baseDeps();
    const vals = sheetRenderVals({ characters, gm: true }, deps);
    expect(vals.showRemoveTraumaPlan).toBe(true);
    vals.onRemoveTraumaPlan();
    expect(deps.removeTraumaPlan).toHaveBeenCalled();
  });

  it('shows humanity recovery tools only for a GM, wired to deps.applyHumanityTherapy/rollMoraleBoost', () => {
    const notGm = sheetRenderVals({ characters }, baseDeps());
    expect(notGm.showHumanityRecovery).toBe(false);

    const deps = baseDeps();
    const vals = sheetRenderVals({ characters, gm: true, humanityTherapyAmount: '8' }, deps);
    expect(vals.showHumanityRecovery).toBe(true);
    expect(vals.humanityTherapyAmount).toBe('8');
    vals.applyHumanityTherapyClick();
    expect(deps.applyHumanityTherapy).toHaveBeenCalledWith('8');
    vals.rollMoraleBoost9();
    expect(deps.rollMoraleBoost).toHaveBeenCalledWith(9);
  });

  it('shows the netrunning tab only for a Netrunner with Interface rank > 0, with 7 rollable abilities', () => {
    const notNetrunner = sheetRenderVals({ characters }, baseDeps());
    expect(notNetrunner.showNetrunningTab).toBe(false);
    expect(notNetrunner.sheetTabs.some(t => t.key === 'netrunning')).toBe(false);

    const rankZero = sheetRenderVals({ characters }, baseDeps({ activeCharacter: { ...baseCharacter, role: 'Netrunner', roleAbilityRank: 0 } }));
    expect(rankZero.showNetrunningTab).toBe(false);

    const deps = baseDeps({ activeCharacter: { ...baseCharacter, role: 'Netrunner', roleAbilityRank: 6 } });
    const vals = sheetRenderVals({ characters }, deps);
    expect(vals.showNetrunningTab).toBe(true);
    expect(vals.sheetTabs.some(t => t.key === 'netrunning')).toBe(true);
    expect(vals.netrunnerRank).toBe(6);
    expect(vals.netActionsPerTurnValue).toBe(3);
    expect(vals.netrunningAbilityRows).toHaveLength(7);
    vals.netrunningAbilityRows.find(a => a.id === 'zap').roll();
    expect(deps.rollNetrunningAbility).toHaveBeenCalledWith(expect.objectContaining({ id: 'zap' }));
  });

  it('renders installed cyberdeck programs with slot warnings and REZ controls', () => {
    const active = {
      ...baseCharacter,
      role: 'Netrunner',
      roleAbilityRank: 6,
      netPrograms: ['worm', 'speedy-gonzalvez', 'eraser', 'see-ya', 'armor', 'flak', 'shield', 'sword'],
    };
    const deps = baseDeps({ activeCharacter: active });
    const vals = sheetRenderVals({ characters, gm: true }, deps);

    expect(vals.netProgramRows).toHaveLength(8);
    expect(vals.netProgramSlotLabel).toBe('8/7 SLOTS');
    expect(vals.hasNetProgramWarning).toBe(true);
    expect(vals.netProgramModifierLabels).toContain('Worm: Backdoor automatico');
    vals.netProgramRows.find(row => row.id === 'armor').damageOne();
    vals.netProgramRows.find(row => row.id === 'armor').repairFull();
    vals.netProgramRows.find(row => row.id === 'armor').remove();
    vals.onInstallNetProgram({ target: { value: 'banhammer' } });
    expect(deps.damageNetrunningProgram).toHaveBeenCalledWith('armor', 1);
    expect(deps.repairNetrunningProgram).toHaveBeenCalledWith('armor', 7);
    expect(deps.removeNetrunningProgram).toHaveBeenCalledWith('armor');
    expect(deps.installNetrunningProgram).toHaveBeenCalledWith('banhammer');
  });

  it('renders equipped shield HP and wires sheet shield controls', () => {
    const shielded = { ...baseCharacter, shield: { itemId: 'BULLETPROOF-SHIELD', hp: 7, maxHp: 10 } };
    const deps = baseDeps({
      activeCharacter: shielded,
      products: [{ code: 'BULLETPROOF-SHIELD', name: 'Bulletproof Shield', shieldHp: 10, maxHp: 10 }],
    });
    const vals = sheetRenderVals({ characters, gm: true, shieldDamageAmount: '3', shieldRepairAmount: '2' }, deps);

    expect(vals.shieldPanel).toMatchObject({
      equipped: true,
      name: 'Bulletproof Shield',
      hpLabel: '7/10',
      statusLabel: 'OCUPA 1 BRACO',
    });
    vals.shieldPanel.damageOne();
    vals.shieldPanel.damageCustom();
    vals.shieldPanel.repairCustom();
    vals.shieldPanel.remove();
    expect(deps.damageActiveShield).toHaveBeenCalledWith(1);
    expect(deps.damageActiveShield).toHaveBeenCalledWith('3');
    expect(deps.repairActiveShield).toHaveBeenCalledWith('2');
    expect(deps.removeShield).toHaveBeenCalled();
  });
});

function fakeComponent(overrides = {}) {
  return {
    state: { characters, activeCharacterId: 'a', gm: true, gmAuthenticated: true, authAuthenticated: true, ...overrides.state },
    setState: vi.fn(function (patch) {
      const next = typeof patch === 'function' ? patch(this.state) : patch;
      this.state = { ...this.state, ...next };
    }),
    ensureGm: overrides.ensureGm || vi.fn(() => true),
    redirectToLogin: overrides.redirectToLogin || vi.fn(),
    flash: vi.fn(),
    tx: vi.fn(() => ({ sheetCreated: 'CREATED', sheetSaved: 'SAVED' })),
    api: overrides.api || vi.fn(() => null),
    app: overrides.app || vi.fn(() => null),
    store: overrides.store || vi.fn(() => ({})),
    gearList: [],
    activeCharacter: overrides.activeCharacter || vi.fn(() => baseCharacter),
    characterById: overrides.characterById,
    normalizeCharacter: overrides.normalizeCharacter || vi.fn((c) => ({ criticalInjuries: [], statusEffects: [], ...c })),
    normalizeStats: (base) => base || {},
    normalizeEquipped: (e) => e || [],
    normalizeShield: (shield) => shield && shield.itemId ? { itemId: shield.itemId, hp: Number(shield.hp), maxHp: Number(shield.maxHp) } : null,
    normalizeInstalledPrograms,
    deckProgramSummary,
    normalizeArmor: (a) => a || {},
    normalizeSkills: (s) => s || [],
    skillSpend: () => 0,
    derivedStats: overrides.derivedStats || vi.fn(() => derived),
    asNumber: (v, f, min, max) => {
      const n = Number(v);
      if (v === '' || v == null || Number.isNaN(n)) return f;
      return Math.min(max ?? n, Math.max(min ?? n, n));
    },
    cpredStatMax: () => 10,
    traumaPlanKey: vi.fn(() => 'silver'),
    equippedCodes: (equipped) => (equipped || []).map(e => e.code),
    updateActiveCharacter: vi.fn(),
    updateCharacterById: vi.fn(),
    applyCharacterPatch: vi.fn(),
    naturalHealingPerRest: vi.fn(() => ({ amount: 3, sources: [] })),
    cyberSourceBreakdown: () => [],
    uploadImage: overrides.uploadImage || vi.fn(async () => ({ url: 'blob://portrait.png' })),
    normalizeGearList: (g) => g || [],
    installedCyberware: () => [],
    normalizeEnhancementCodes: (c) => c || [],
    canManageOwnSheet: overrides.canManageOwnSheet || vi.fn(() => true),
    recoverHumanity: vi.fn(),
    damageShield: (shield, amount) => ({ ...shield, hp: Math.max(0, shield.hp - Number(amount || 0)) }),
    repairShield: (shield, amount) => ({ ...shield, hp: Math.min(shield.maxHp, shield.hp + Number(amount || 0)) }),
    damageProgramRez,
    repairProgramRez,
    roll: vi.fn(),
    postChat: vi.fn(),
    ...overrides,
  };
}

describe('ui/views/sheet sheetHandlers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('sheetDraftFrom converts a character into stringified draft fields', () => {
    const component = fakeComponent();
    const draft = sheetHandlers(component).sheetDraftFrom(baseCharacter);
    expect(draft.name).toBe('Rook');
    expect(draft.level).toBe('4');
    expect(draft.base.INT).toBe('6');
  });

  it('editSheet requires GM auth or sheet ownership', () => {
    const component = fakeComponent({ state: { gmAuthenticated: false }, canManageOwnSheet: vi.fn(() => false) });
    sheetHandlers(component).editSheet();
    expect(component.redirectToLogin).toHaveBeenCalled();
    expect(component.state.sheetEditing).toBeUndefined();
  });

  it('editSheet opens edit mode with a fresh draft when authorized', () => {
    const component = fakeComponent();
    sheetHandlers(component).editSheet();
    expect(component.state.sheetEditing).toBe(true);
    expect(component.state.sheetTab).toBe('core');
  });

  it('cancelSheetEdit clears the draft and editing flags', () => {
    const component = fakeComponent({ state: { sheetEditing: true, sheetCreating: true, sheetDraft: { name: 'x' } } });
    sheetHandlers(component).cancelSheetEdit();
    expect(component.state).toMatchObject({ sheetEditing: false, sheetCreating: false, sheetDraft: null });
  });

  it('saveSheetDraft rejects a creation draft that misses the exact attribute point budget', async () => {
    const component = fakeComponent({
      state: { sheetCreating: true, sheetDraft: { name: 'New Op', base: { BODY: '10' } } },
      api: vi.fn(() => null),
    });
    await sheetHandlers(component).saveSheetDraft();
    expect(component.flash).toHaveBeenCalledWith(expect.stringContaining('pontos de atributo'), 3200);
  });

  it('saveSheetDraft persists an edit and clears editing state', async () => {
    const upsert = vi.fn(async (c) => c);
    const component = fakeComponent({
      state: { sheetCreating: false, sheetDraft: { id: 'a', name: 'Rook', role: 'Solo', level: '5', base: baseCharacter.base, skills: [] } },
      api: vi.fn(() => ({ characters: { upsert } })),
    });
    await sheetHandlers(component).saveSheetDraft();
    expect(upsert).toHaveBeenCalled();
    expect(component.state.sheetEditing).toBe(false);
    expect(component.state.activeCharacterId).toBe('a');
  });

  it('selectCharacter switches the active character and resets sheet-creation state', () => {
    const component = fakeComponent();
    sheetHandlers(component).selectCharacter('b');
    expect(component.state.activeCharacterId).toBe('b');
    expect(component.state.sheetCreating).toBe(false);
  });

  it('removeTraumaPlan requires GM auth and revokes coverage', () => {
    const component = fakeComponent();
    sheetHandlers(component).removeTraumaPlan();
    expect(component.applyCharacterPatch).toHaveBeenCalledWith('a', { traumaPlan: 'nocoverage' });
  });

  it('useExecutiveTraumaBackup refuses when the character has no executive plan', () => {
    const component = fakeComponent({ traumaPlanKey: vi.fn(() => 'silver') });
    sheetHandlers(component).useExecutiveTraumaBackup();
    expect(component.applyCharacterPatch).not.toHaveBeenCalled();
    expect(component.flash).toHaveBeenCalledWith('Personagem nao possui Plano Executivo ativo');
  });

  it('useExecutiveTraumaBackup restores full HP and clears conditions when active', () => {
    const component = fakeComponent({ traumaPlanKey: vi.fn(() => 'executivo') });
    sheetHandlers(component).useExecutiveTraumaBackup();
    expect(component.applyCharacterPatch).toHaveBeenCalledWith('a', expect.objectContaining({
      criticalInjuries: [], statusEffects: [], traumaPlan: 'nocoverage',
    }));
  });

  it('applyNaturalHealingRest requires GM auth and applies the healing amount', () => {
    const component = fakeComponent({
      state: { characters: [{ id: 'a', health: { cur: 20, max: 35 } }] },
      activeCharacter: vi.fn(() => ({ id: 'a', health: { cur: 20, max: 35 } })),
    });
    const result = sheetHandlers(component).applyNaturalHealingRest('a');
    expect(result.amount).toBe(3);
    expect(component.updateCharacterById).toHaveBeenCalledWith('a', { health: { cur: 23, max: 35 } });
  });

  it('applyHumanityTherapy requires GM auth, rejects a zero amount, and recovers a positive one', () => {
    const denied = fakeComponent({ ensureGm: vi.fn(() => false) });
    sheetHandlers(denied).applyHumanityTherapy('10');
    expect(denied.recoverHumanity).not.toHaveBeenCalled();

    const component = fakeComponent();
    sheetHandlers(component).applyHumanityTherapy('0');
    expect(component.recoverHumanity).not.toHaveBeenCalled();
    expect(component.flash).toHaveBeenCalled();

    sheetHandlers(component).applyHumanityTherapy('12');
    expect(component.recoverHumanity).toHaveBeenCalledWith('a', 12, expect.objectContaining({ label: 'TERAPIA CLINICA' }));
    expect(component.setState).toHaveBeenCalledWith({ humanityTherapyAmount: '' });
  });

  it('rollMoraleBoost requires GM auth and applies the RAW formula from the rolled faces', () => {
    const denied = fakeComponent({ ensureGm: vi.fn(() => false) });
    sheetHandlers(denied).rollMoraleBoost(1);
    expect(denied.roll).not.toHaveBeenCalled();

    const roll = vi.fn((opts) => opts.onResolved && opts.onResolved({ faces: [5], detail: '5' }));
    const component = fakeComponent({ roll });
    sheetHandlers(component).rollMoraleBoost(1);
    expect(roll).toHaveBeenCalledWith(expect.objectContaining({ sides: 6, count: 1 }));
    expect(component.recoverHumanity).toHaveBeenCalledWith('a', 2, expect.objectContaining({ label: 'MORALE BOOST :: UPGRADE 1' }));

    const roll9 = vi.fn((opts) => opts.onResolved && opts.onResolved({ faces: [3, 6], detail: '3 + 6' }));
    const component9 = fakeComponent({ roll: roll9 });
    sheetHandlers(component9).rollMoraleBoost(9);
    expect(roll9).toHaveBeenCalledWith(expect.objectContaining({ sides: 6, count: 2 }));
    expect(component9.recoverHumanity).toHaveBeenCalledWith('a', 6, expect.objectContaining({ label: 'MORALE BOOST :: UPGRADE 9' }));
  });

  it('rollNetrunningAbility rolls Interface + 1d10 using the character roleAbilityRank as mod', () => {
    const component = fakeComponent({
      activeCharacter: vi.fn(() => ({ id: 'a', role: 'Netrunner', roleAbilityRank: 6 })),
    });
    sheetHandlers(component).rollNetrunningAbility({ id: 'scanner', name: 'Scanner' });
    expect(component.roll).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'a', label: 'INTERFACE :: SCANNER', sides: 10, count: 1, mod: 6, check: true,
    }));
  });

  it('manages installed netrunning programs and REZ through the active character patch', () => {
    const component = fakeComponent({
      activeCharacter: vi.fn(() => ({ id: 'a', role: 'Netrunner', roleAbilityRank: 6, netPrograms: [{ id: 'armor', rez: 2, maxRez: 7, state: 'rezzed' }] })),
    });
    const h = sheetHandlers(component);

    h.installNetrunningProgram('worm');
    expect(component.updateActiveCharacter).toHaveBeenCalledWith({
      netPrograms: [
        { id: 'armor', rez: 2, maxRez: 7, state: 'rezzed' },
        { id: 'worm', rez: 7, maxRez: 7, state: 'rezzed' },
      ],
    });

    h.damageNetrunningProgram('armor', 3);
    expect(component.updateActiveCharacter).toHaveBeenCalledWith({ netPrograms: [{ id: 'armor', rez: 0, maxRez: 7, state: 'derezzed' }] });

    h.repairNetrunningProgram('armor', 7);
    expect(component.updateActiveCharacter).toHaveBeenCalledWith({ netPrograms: [{ id: 'armor', rez: 7, maxRez: 7, state: 'rezzed' }] });

    h.removeNetrunningProgram('armor');
    expect(component.updateActiveCharacter).toHaveBeenCalledWith({ netPrograms: [] });
  });

  it('uninstallCyberware removes the item from equipped and updates owned codes', () => {
    const component = fakeComponent({
      activeCharacter: vi.fn(() => ({ id: 'a', equipped: [{ code: 'BIOMON' }, { code: 'NASAL' }] })),
    });
    sheetHandlers(component).uninstallCyberware('BIOMON');
    expect(component.updateActiveCharacter).toHaveBeenCalledWith({ equipped: [{ code: 'NASAL' }], owned: ['NASAL'] });
  });

  it('equipShield installs a catalog shield at full HP and damageActiveShield degrades it', () => {
    const component = fakeComponent({
      products: [{ code: 'BULLETPROOF-SHIELD', name: 'Bulletproof Shield', shieldHp: 10, maxHp: 10 }],
      activeCharacter: vi.fn(() => ({ ...baseCharacter, shield: { itemId: 'BULLETPROOF-SHIELD', hp: 4, maxHp: 10 } })),
    });
    const h = sheetHandlers(component);

    h.equipShield('BULLETPROOF-SHIELD');
    expect(component.updateActiveCharacter).toHaveBeenCalledWith({ shield: { itemId: 'BULLETPROOF-SHIELD', hp: 10, maxHp: 10 } });

    h.damageActiveShield(5);
    expect(component.updateActiveCharacter).toHaveBeenCalledWith({ shield: { itemId: 'BULLETPROOF-SHIELD', hp: 0, maxHp: 10 } });
  });

  it('buyIpIncrease requires GM auth and applies the use-case result', () => {
    const execute = vi.fn(() => ({ ok: true, characterPatch: { ip: 90 }, statePatch: { ipRankPurchasedThisSession: true }, flashMessage: 'Compra ok' }));
    const component = fakeComponent({ app: vi.fn(() => ({ buyIpIncrease: { execute } })) });
    sheetHandlers(component).buyIpIncrease('role');
    expect(execute).toHaveBeenCalled();
    expect(component.state.ipRankPurchasedThisSession).toBe(true);
    expect(component.flash).toHaveBeenCalledWith('Compra ok');
  });

  it('toggleCyberwareEnhancement requires GM auth and applies the use-case patch', () => {
    const execute = vi.fn(() => ({ ok: true, characterPatch: { equipped: [] }, flashMessage: 'Linked' }));
    const component = fakeComponent({ app: vi.fn(() => ({ toggleCyberwareEnhancement: { execute } })) });
    sheetHandlers(component).toggleCyberwareEnhancement('a', 'BIOMON', 'ENH1');
    expect(execute).toHaveBeenCalled();
    expect(component.flash).toHaveBeenCalledWith('Linked');
  });

  it('onPlayerPortraitUpload stores the uploaded url on the active character', async () => {
    const component = fakeComponent();
    const input = { files: [{ name: 'x.png' }], value: 'x.png' };
    await sheetHandlers(component).onPlayerPortraitUpload({ target: input });
    expect(component.updateActiveCharacter).toHaveBeenCalledWith({ portraitUrl: 'blob://portrait.png' });
    expect(input.value).toBe('');
  });
});
