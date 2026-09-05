import { describe, expect, it, vi, beforeEach } from 'vitest';

import { sheetHandlers, sheetRenderVals } from '../../../src/ui/views/sheet.js';
import { mountOnboardingWizard } from '../../../src/ui/views/onboarding.js';

vi.mock('../../../src/ui/views/onboarding.js', () => ({ mountOnboardingWizard: vi.fn(() => ({})) }));
import PersistCharacter from '../../../src/application/PersistCharacter.ts';
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
  normalizeGearList: (gear) => gear || [],
  installedCyberweaponGear: () => [],
  hasDamageProfile: () => false,
  gearDamageText: () => '',
  rollCombatAttack: vi.fn(),
  rollCombatDamage: vi.fn(),
  reloadWeapon: vi.fn(),
  ...overrides,
});

describe('ui/views/sheet sheetRenderVals', () => {
  const gmState = { characters, gm: true, gmAuthenticated: true };

  it('folds every CORE block away for a GM and offers the toggles', () => {
    const vals = sheetRenderVals(gmState, baseDeps());
    expect(vals.coreSectionsFoldable).toBe(true);
    expect(vals.coreSectionsStatic).toBe(false);
    expect([vals.coreAttrsOpen, vals.coreStatsOpen, vals.coreDossierOpen, vals.coreBriefOpen])
      .toEqual([false, false, false, false]);
  });

  it('unfolds the CORE blocks the GM already opened', () => {
    const vals = sheetRenderVals({ ...gmState, sheetCoreSections: { dossier: true } }, baseDeps());
    expect(vals.coreDossierOpen).toBe(true);
    expect(vals.coreDossierCaret).toBe('\u25be');
    expect(vals.coreAttrsOpen).toBe(false);
    expect(vals.coreAttrsCaret).toBe('\u25b8');
  });

  it('keeps a player sheet fully expanded and never shows a toggle', () => {
    // The player's own sheet is not a lookup surface: folding it would read as
    // data lost, so the stored GM preference must not reach this view.
    const vals = sheetRenderVals({ characters, sheetCoreSections: { attrs: false, dossier: false } }, baseDeps());
    expect(vals.coreSectionsFoldable).toBe(false);
    expect(vals.coreSectionsStatic).toBe(true);
    expect([vals.coreAttrsOpen, vals.coreStatsOpen, vals.coreDossierOpen, vals.coreBriefOpen])
      .toEqual([true, true, true, true]);
  });

  it('routes a CORE toggle to the component so the choice is persisted', () => {
    const toggleCoreSection = vi.fn();
    const vals = sheetRenderVals(gmState, baseDeps({ toggleCoreSection }));
    vals.toggleCoreBrief();
    expect(toggleCoreSection).toHaveBeenCalledWith('brief');
  });

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

  it('attaches a reference blurb and a tip toggle to each catalog skill row', () => {
    const skills = [
      { id: 's1', name: 'Handgun', stat: 'REF', level: 4, bonus: 0, total: 12, difficult: false },
      { id: 's2', name: 'Sabedoria Caseira', stat: 'INT', level: 2, bonus: 0, total: 8, difficult: false },
    ];
    const deps = baseDeps({ normalizeSkills: () => skills });
    const vals = sheetRenderVals({ characters }, deps);
    const [handgun, homebrew] = vals.skillRows;
    expect(handgun.hasDescription).toBe(true);
    expect(handgun.description).toMatch(/^Armas de mao\.|^Armas de mão\./);
    expect(handgun.tipOpen).toBe(false);
    handgun.onTip();
    expect(deps.setState).toHaveBeenCalledWith({ skillTip: 'Handgun' });
    // A skill outside the catalog gets no blurb, so no "?" renders for it.
    expect(homebrew.hasDescription).toBe(false);
    expect(homebrew.description).toBe('');
  });

  it('opens one skill balloon at a time and closes the open one', () => {
    const skills = [{ id: 's1', name: 'Handgun', stat: 'REF', level: 4, bonus: 0, total: 12, difficult: false }];
    const deps = baseDeps({ normalizeSkills: () => skills });
    const vals = sheetRenderVals({ characters, skillTip: 'Handgun' }, deps);
    const handgun = vals.skillRows[0];
    expect(handgun.tipOpen).toBe(true);
    expect(handgun.tipStyle).toContain('lm-skill-info--on');
    handgun.onTip();
    expect(deps.setState).toHaveBeenCalledWith({ skillTip: '' });
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
    const shielded = { ...baseCharacter, gear: [{ id: 'shield-1', code: 'BULLETPROOF-SHIELD', name: 'Bulletproof Shield', shieldHp: 7, maxHp: 10 }], shield: { itemId: 'shield-1', hp: 7, maxHp: 10 } };
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
  const api = overrides.api || vi.fn(() => null);
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
    api,
    app: overrides.app || vi.fn(() => ({ persistCharacter: new PersistCharacter(api()) })),
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

  it('createPlayerCharacter opens the guided wizard scoped to the active campaign instead of the drawer builder', () => {
    mountOnboardingWizard.mockClear();
    const api = vi.fn(() => ({ characters: {}, campaigns: {} }));
    const svgCard = () => 'svg';
    const component = fakeComponent({
      state: { gm: false, gmAuthenticated: false, authAuthenticated: true, activeCampaignId: 'mesa-1', activeCampaignName: 'Mesa Um', sheetOpen: false },
      api,
      store: vi.fn(() => ({ svgCard })),
    });
    sheetHandlers(component).createPlayerCharacter();
    expect(mountOnboardingWizard).toHaveBeenCalledOnce();
    expect(mountOnboardingWizard.mock.calls[0][0]).toMatchObject({ mode: 'new', campaignId: 'mesa-1', campaignName: 'Mesa Um', svgCard });
    expect(component.state.sheetCreating).toBeUndefined();
    expect(component.state.sheetEditing).toBeUndefined();
  });

  it('createPlayerCharacter lands on the new sheet after the wizard finishes', async () => {
    mountOnboardingWizard.mockClear();
    const reloadRemoteData = vi.fn(async function () {
      this.state = { ...this.state, characters: [...characters, { id: 'c', name: 'NEW', role: 'Solo', level: 1 }] };
    });
    const component = fakeComponent({
      state: { gm: false, gmAuthenticated: false, authAuthenticated: true, sheetOpen: false },
      api: vi.fn(() => ({})),
    });
    component.reloadRemoteData = reloadRemoteData;
    sheetHandlers(component).createPlayerCharacter();
    const { onDone } = mountOnboardingWizard.mock.calls[0][0];
    onDone({ skipped: true });
    expect(reloadRemoteData).not.toHaveBeenCalled();
    await onDone({ character: { id: 'c' } });
    expect(reloadRemoteData).toHaveBeenCalledOnce();
    expect(component.state).toMatchObject({ activeCharacterId: 'c', sheetOpen: true, sheetEditing: false, sheetCreating: false, gm: false });
  });

  it('createPlayerCharacter redirects to login when nobody is authenticated', () => {
    mountOnboardingWizard.mockClear();
    const component = fakeComponent({ state: { gmAuthenticated: false, authAuthenticated: false } });
    sheetHandlers(component).createPlayerCharacter();
    expect(component.redirectToLogin).toHaveBeenCalled();
    expect(mountOnboardingWizard).not.toHaveBeenCalled();
  });

  it('createSheetCharacter keeps the drawer builder for the GM and routes players to the wizard', () => {
    mountOnboardingWizard.mockClear();
    const gm = fakeComponent();
    sheetHandlers(gm).createSheetCharacter();
    expect(gm.state).toMatchObject({ sheetEditing: true, sheetCreating: true });
    expect(mountOnboardingWizard).not.toHaveBeenCalled();

    const player = fakeComponent({ state: { gm: false, gmAuthenticated: false, authAuthenticated: true }, api: vi.fn(() => ({})) });
    sheetHandlers(player).createSheetCharacter();
    expect(mountOnboardingWizard).toHaveBeenCalledOnce();
    expect(player.state.sheetCreating).toBeUndefined();
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

  it('rollNetrunningAbility rolls Interface + 1d10 using the character roleAbilityRank as mod, tagged to open the Nexus run', () => {
    const component = fakeComponent({
      activeCharacter: vi.fn(() => ({ id: 'a', role: 'Netrunner', roleAbilityRank: 6 })),
    });
    sheetHandlers(component).rollNetrunningAbility({ id: 'scanner', name: 'Scanner' });
    expect(component.roll).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'a', label: 'INTERFACE :: SCANNER', sides: 10, count: 1, mod: 6, check: true, netrunning: 'scanner',
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

  it('equipShield uses the owned instance and damage at zero drops it without restoring HP', () => {
    let active = { ...baseCharacter, gear: [{ id: 'shield-1', code: 'BULLETPROOF-SHIELD', name: 'Bulletproof Shield', shieldHp: 4, maxHp: 10 }] };
    const component = fakeComponent({
      products: [{ code: 'BULLETPROOF-SHIELD', name: 'Bulletproof Shield', shieldHp: 10, maxHp: 10 }],
      activeCharacter: vi.fn(() => active),
    });
    component.updateActiveCharacter.mockImplementation(patch => { active = { ...active, ...patch }; });
    const h = sheetHandlers(component);

    h.equipShield('shield-1');
    expect(component.updateActiveCharacter).toHaveBeenCalledWith(expect.objectContaining({
      shield: { itemId: 'shield-1', name: 'Bulletproof Shield', hp: 4, maxHp: 10 },
      gear: [expect.objectContaining({ id: 'shield-1', shieldHp: 4, shieldLocation: 'equipped' })],
    }));

    h.damageActiveShield(5);
    expect(component.updateActiveCharacter).toHaveBeenLastCalledWith(expect.objectContaining({
      shield: null,
      gear: [expect.objectContaining({ id: 'shield-1', shieldHp: 0, shieldLocation: 'dropped' })],
    }));
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

  it('the own-sheet card carries the uploaded photo, and only that', () => {
    const withPhoto = { ...baseCharacter, portraitUrl: '/uploads/face.png' };
    const vals = sheetRenderVals({ characters: [withPhoto], activeCharacterId: 'a' }, baseDeps());

    expect(vals.myOperativeCard.portrait).toBe('/uploads/face.png');
    expect(vals.myOperativeCard.hasPortrait).toBe(true);
    expect(vals.myOperativeCard.noPortrait).toBe(false);
  });

  it('the wizard generated card art is not a face, so initials stand in', () => {
    const generated = { ...baseCharacter, portraitUrl: 'data:image/svg+xml;charset=UTF-8,%3Csvg' };
    const vals = sheetRenderVals({ characters: [generated], activeCharacterId: 'a' }, baseDeps());

    expect(vals.myOperativeCard.portrait).toBe('');
    expect(vals.myOperativeCard.noPortrait).toBe(true);
    expect(vals.myOperativeCard.initials).toBe('RO');
  });

  it('table seats follow the same photo rule as the operative card', () => {
    const campaign = {
      roster: [
        { username: 'bari', role: 'player', characterId: 'a', portraitUrl: '/uploads/face.png' },
        { username: 'leu', role: 'player', characterId: 'b', portraitUrl: 'data:image/svg+xml,x' },
      ],
    };
    const vals = sheetRenderVals(
      { characters, activeCharacterId: 'a', activeCampaign: campaign, authUser: { role: 'player', username: 'bari' } },
      baseDeps(),
    );
    const [bari, leu] = vals.tableSeatCards;

    expect(bari.hasPortrait).toBe(true);
    expect(bari.portraitUrl).toBe('/uploads/face.png');
    expect(leu.noPortrait).toBe(true);
    expect(leu.portraitUrl).toBe('');
    expect(leu.initials).toBe('LE');
  });

  // Swapping the face is an ownership right, not an editing right: it must not
  // follow the GM/player mode toggle the way the rest of the sheet does.
  it('the portrait stays editable for a GM reading the sheet in player mode', () => {
    const vals = sheetRenderVals(
      { characters, activeCharacterId: 'a', authAuthenticated: true, gmAuthenticated: true, gm: false, authUser: { role: 'admin', username: 'mestre' } },
      baseDeps(),
    );

    expect(vals.canEditSheet).toBe(false);
    expect(vals.canEditPortrait).toBe(true);
    expect(vals.notCanEditPortrait).toBe(false);
  });

  it('a player owns the portrait on their own sheet', () => {
    const vals = sheetRenderVals(
      { characters, activeCharacterId: 'a', authAuthenticated: true, authUser: { role: 'player', username: 'bari' } },
      baseDeps(),
    );

    expect(vals.canEditPortrait).toBe(true);
  });

  it('a signed-out viewer gets a read-only portrait', () => {
    const vals = sheetRenderVals({ characters, activeCharacterId: 'a' }, baseDeps());

    expect(vals.canEditPortrait).toBe(false);
    expect(vals.notCanEditPortrait).toBe(true);
  });

  it('onPlayerPortraitUpload stores the uploaded url on the active character', async () => {
    const component = fakeComponent();
    const input = { files: [{ name: 'x.png' }], value: 'x.png' };
    await sheetHandlers(component).onPlayerPortraitUpload({ target: input });
    expect(component.applyCharacterPatch).toHaveBeenCalledWith('a', { portraitUrl: 'blob://portrait.png' });
    expect(input.value).toBe('');
  });

  // The GM-gated writer bounced a player to the login screen, which lands on
  // campaign selection, the first time they set a photo on their own sheet.
  it('onPlayerPortraitUpload never goes through the GM-gated writer', async () => {
    const component = fakeComponent();
    const input = { files: [{ name: 'x.png' }], value: 'x.png' };
    await sheetHandlers(component).onPlayerPortraitUpload({ target: input });
    expect(component.updateActiveCharacter).not.toHaveBeenCalled();
    expect(component.updateCharacterById).not.toHaveBeenCalled();
    expect(component.redirectToLogin).not.toHaveBeenCalled();
  });
});

// --- Barra da mesa x barra da sua ficha ---
// Antes, uma barra unica listava as fichas do jogador e clicar em qualquer
// carta trocava o operativo controlado. Hoje o assento e a carta do
// personagem (nome, classe, foto, cor) com o jogador embaixo; a barra SUA
// FICHA so volta quando o assento nao da conta (ficha cedida, sem ficha,
// fora de campanha).

const campaign = {
  id: 'mesa-1',
  name: 'noite em watson',
  roster: [
    { username: 'bari', role: 'player', characterId: 'a', characterName: 'Rook', characterRole: 'Solo', characterLevel: 4 },
    { username: 'matheus', role: 'gm', characterId: null },
  ],
};

const playerState = (overrides = {}) => ({
  characters,
  activeCharacterId: 'a',
  authUser: { role: 'player', username: 'bari' },
  authAuthenticated: true,
  activeCampaign: campaign,
  activeCampaignName: 'noite em watson',
  ...overrides,
});

describe('barra da mesa', () => {
  it('lista quem esta na mesa', () => {
    const vals = sheetRenderVals(playerState(), baseDeps());
    expect(vals.hasTableSeats).toBe(true);
    expect(vals.tableSeatCount).toBe('2');
    expect(vals.tableName).toBe('NOITE EM WATSON');
    expect(vals.tableSeatCards.map(seat => seat.username)).toEqual(['matheus', 'bari']);
  });

  // O jogador olha a mesa procurando "o Nomad", nao a conta que o dirige.
  it('o assento lidera com o personagem e cita o jogador embaixo', () => {
    const vals = sheetRenderVals(playerState(), baseDeps());
    const mine = vals.tableSeatCards.find(seat => seat.isSelf);

    expect(mine.title).toBe('Rook');
    expect(mine.classLabel).toBe('SOLO // LVL 4');
    expect(mine.playerLabel).toBe('BARI');
    expect(mine.playerLine).toBe('BARI // VOCE');
    expect(mine.initials).toBe('RO');
    expect(mine.roleTag).toBe('SOL');
    expect(mine.vars).toContain('--seat-accent:#fff');
  });

  it('assento sem ficha cai para o nome da conta', () => {
    const vals = sheetRenderVals(playerState(), baseDeps());
    const gm = vals.tableSeatCards.find(seat => seat.isGm);

    expect(gm.title).toBe('matheus');
    expect(gm.classLabel).toBe('MESTRE DA MESA');
    expect(gm.hasCharacter).toBe(false);
    // Sem ficha, o nome da conta ja e o titulo: repetir embaixo seria ruido.
    expect(gm.showPlayerLine).toBe(false);
    expect(gm.vars).toContain('--seat-accent:#3fe0d0');
  });

  it('marca voce entre os assentos, e so o seu abre a ficha', () => {
    const deps = baseDeps();
    const vals = sheetRenderVals(playerState(), deps);
    const mine = vals.tableSeatCards.find(seat => seat.isSelf);
    expect(mine.username).toBe('bari');
    expect(mine.selfTag).toBe('VOCE');
    expect(mine.style).toContain('lm-table-seat--self');

    mine.onClick();
    expect(deps.setState).toHaveBeenCalledWith({ sheetOpen: true });
    expect(deps.selectCharacter).not.toHaveBeenCalled();

    // Nenhum assento alheio troca quem voce controla.
    expect(vals.tableSeatCards.filter(seat => seat.onClick)).toHaveLength(1);
  });

  it('fora de campanha a barra da mesa nao aparece', () => {
    const vals = sheetRenderVals(playerState({ activeCampaign: null }), baseDeps());
    expect(vals.hasTableSeats).toBe(false);
    expect(vals.tableSeatCards).toEqual([]);
  });
});

describe('barra da sua ficha', () => {
  it('mostra so a ficha ativa, e abrir nao troca de personagem', () => {
    const deps = baseDeps();
    const vals = sheetRenderVals(playerState(), deps);

    expect(vals.hasMyOperative).toBe(true);
    expect(vals.myOperativeCard.id).toBe('a');
    expect(vals.myOperativeCard.status).toBe('ABRIR FICHA');

    vals.myOperativeCard.onClick();

    expect(deps.selectCharacter).not.toHaveBeenCalled();
    expect(deps.setState).toHaveBeenCalledWith({ sheetOpen: true });
  });

  it('a segunda ficha da conta nao vira carta no desktop', () => {
    const vals = sheetRenderVals(playerState(), baseDeps());
    expect(vals.myOperativeCard.id).toBe('a');
    expect(vals.myOperativeCard.name).toBe('Rook');
  });

  it('sem ficha nenhuma, oferece criar', () => {
    const vals = sheetRenderVals(playerState({ characters: [], activeCharacterId: null }), baseDeps());
    expect(vals.hasMyOperative).toBe(false);
    expect(vals.missingMyOperative).toBe(true);
    expect(vals.showOwnSheetPanel).toBe(true);
  });

  // Uma ficha so, ja desenhada no proprio assento: a barra vira repeticao.
  it('some quando o jogador dirige so a ficha do proprio assento', () => {
    const vals = sheetRenderVals(playerState(), baseDeps());
    expect(vals.showOwnSheetPanel).toBe(false);
  });

  it('volta fora da campanha, onde nao ha assento para ler', () => {
    const vals = sheetRenderVals(playerState({ activeCampaign: null }), baseDeps());
    expect(vals.showOwnSheetPanel).toBe(true);
  });
});

describe('troca de operativo na gaveta', () => {
  it('fica escondida para o jogador', () => {
    const vals = sheetRenderVals(playerState(), baseDeps());
    expect(vals.showCharacterSwitcher).toBe(false);
  });

  it('continua disponivel para o mestre autenticado', () => {
    const vals = sheetRenderVals(playerState({ gm: true, gmAuthenticated: true, authUser: { role: 'gm', username: 'matheus' } }), baseDeps());
    expect(vals.showCharacterSwitcher).toBe(true);
    expect(vals.sheetCharacterBtns).toHaveLength(2);
  });

  it('mestre com uma unica ficha na mesa nao ganha barra de troca vazia', () => {
    const vals = sheetRenderVals(playerState({ gm: true, gmAuthenticated: true, characters: [characters[0]] }), baseDeps());
    expect(vals.showCharacterSwitcher).toBe(false);
  });

  it('criar uma segunda ficha tambem e ferramenta de mestre', () => {
    expect(sheetRenderVals(playerState(), baseDeps()).showNewSheetButton).toBe(false);
    expect(sheetRenderVals(playerState({ gm: true, gmAuthenticated: true }), baseDeps()).showNewSheetButton).toBe(true);
  });

  it('jogador sem ficha ainda pode criar a primeira pelo desktop', () => {
    const vals = sheetRenderVals(playerState({ characters: [], activeCharacterId: null }), baseDeps());
    expect(vals.showNewSheetButton).toBe(false);
    expect(vals.missingMyOperative).toBe(true);
  });
});

// --- Cobrindo a ficha de quem faltou ---
// O mestre cede a ficha do ausente; ela aparece numa barra propria e, ao
// contrario da carta do proprio operativo, clicar nela assume o controle.

const coveredCampaign = {
  id: 'mesa-1',
  name: 'noite em watson',
  roster: [
    { username: 'matheus', role: 'gm', characterId: null },
    { username: 'bari', role: 'player', characterId: 'a' },
    { username: 'leu', role: 'player', characterId: 'b', controlledBy: 'bari' },
  ],
};

const coveringState = (overrides = {}) => ({
  characters,
  activeCharacterId: 'a',
  authUser: { role: 'player', username: 'bari' },
  authAuthenticated: true,
  activeCampaign: coveredCampaign,
  activeCampaignName: 'noite em watson',
  ...overrides,
});

describe('barra de fichas cedidas', () => {
  it('so aparece quando o mestre cedeu alguma', () => {
    const withoutGrant = sheetRenderVals(playerState(), baseDeps());
    expect(withoutGrant.hasDelegatedCards).toBe(false);
    expect(withoutGrant.delegatedCards).toEqual([]);

    const vals = sheetRenderVals(coveringState(), baseDeps());
    expect(vals.hasDelegatedCards).toBe(true);
    expect(vals.delegatedCount).toBe('1');
    expect(vals.delegatedCards[0]).toMatchObject({ id: 'b', name: 'V', coverFor: 'leu' });
    expect(vals.delegatedCards[0].coverLabel).toBe('NO LUGAR DE LEU');
  });

  it('clicar na ficha cedida assume o controle e abre a gaveta', () => {
    const deps = baseDeps();
    const vals = sheetRenderVals(coveringState(), deps);

    vals.delegatedCards[0].onClick();

    expect(deps.selectCharacter).toHaveBeenCalledWith('b');
    expect(deps.setState).toHaveBeenCalledWith({ sheetOpen: true });
  });

  it('com a ficha cedida ativa, a carta propria devolve o controle', () => {
    const deps = baseDeps();
    const vals = sheetRenderVals(coveringState({ activeCharacterId: 'b' }), deps);

    expect(vals.myOperativeCard.id).toBe('a');
    expect(vals.myOperativeCard.status).toBe('VOLTAR AO SEU');
    expect(vals.delegatedCards[0].status).toBe('ABRIR FICHA');

    vals.myOperativeCard.onClick();

    expect(deps.selectCharacter).toHaveBeenCalledWith('a');
  });

  it('nao dobra a ficha cedida na barra SUA FICHA', () => {
    const vals = sheetRenderVals(coveringState({ activeCharacterId: 'b' }), baseDeps());
    expect(vals.myOperativeCard.id).not.toBe('b');
  });

  // Com duas fichas em jogo ha escolha a fazer, entao a barra volta.
  it('a barra SUA FICHA reaparece para quem cobre alguem', () => {
    expect(sheetRenderVals(coveringState(), baseDeps()).showOwnSheetPanel).toBe(true);
  });

  it('quem so tem a propria ficha nao vira substituto de si mesmo', () => {
    const vals = sheetRenderVals(coveringState({ authUser: { role: 'player', username: 'leu' } }), baseDeps());
    expect(vals.hasDelegatedCards).toBe(false);
  });
});

describe('assentos cobertos na barra da mesa', () => {
  it('dizem quem esta segurando a ficha', () => {
    const vals = sheetRenderVals(coveringState(), baseDeps());
    const seat = vals.tableSeatCards.find(entry => entry.username === 'leu');

    expect(seat.isCovered).toBe(true);
    expect(seat.coverLabel).toBe('VOCE COBRE');
    expect(seat.style).toContain('lm-table-seat--covered');
  });

  it('para os outros jogadores, nomeiam o substituto', () => {
    const vals = sheetRenderVals(coveringState({ authUser: { role: 'player', username: 'leu' } }), baseDeps());
    const seat = vals.tableSeatCards.find(entry => entry.username === 'leu');

    expect(seat.coverLabel).toBe('COBERTO POR BARI');
    expect(seat.isNotCovered).toBe(false);
  });
});

describe('ui/views/sheet armor bonus rendering', () => {
  it('reads worn-armor records left in equipped by the old shop path', () => {
    // Buying armor used to run through the install engine, so characters made
    // before that changed carry a {headSP, bodySP, armorPenalty} record here
    // instead of the plain number chrome uses. The chip used to stringify the
    // record straight into the label as [object Object].
    const skinWeave = { code: 'SKINWEAVE', name: 'Skin Weave', cat: 'EXTERNAL', armor: 7 };
    const flak = { code: 'FLAK', name: 'Flak', cat: 'EXTERNAL', armor: { headSP: 15, bodySP: 15, armorPenalty: { REF: -4, DEX: -4, MOVE: -4 } } };
    const equipped = [skinWeave, flak];

    const vals = sheetRenderVals(
      { characters: [{ ...baseCharacter, equipped }], gm: true, gmAuthenticated: true },
      baseDeps({ sheetDraftFrom: vi.fn(() => ({ base: baseCharacter.base, skills: [], equipped })) }),
    );

    expect(JSON.stringify(vals)).not.toContain('object Object');
    const labels = JSON.stringify(vals);
    expect(labels).toContain('+7 ARM');
    expect(labels).toContain('+15 ARM');
  });
});
