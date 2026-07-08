import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { nexusHandlers, nexusRenderVals } from '../../../src/ui/views/nexus.js';

const baseDeps = () => ({
  sendNexusChallenge: vi.fn(),
  refreshNexusChallenge: vi.fn(),
  setNexusTarget: vi.fn(),
  setNexusConfigMode: vi.fn(),
  setNexusTier: vi.fn(),
  setNexusBlackIce: vi.fn(),
  setNexusBlackIceTargetProgram: vi.fn(),
  runNexusPrep: vi.fn(),
  finalizeNexusPrep: vi.fn(),
  triggerBlackIce: vi.fn(),
  rollBlackIceAttack: vi.fn(),
  rollNetrunnerDefense: vi.fn(),
  rollBlackIceDefense: vi.fn(),
  rollNetrunnerZapAttack: vi.fn(),
  rollNetrunnerProgramVsIce: vi.fn(),
  damageBlackIceWithZap: vi.fn(),
  damageBlackIceWithProgram: vi.fn(),
  applyBlackIceEffect: vi.fn(),
  interfaceRankFor: (character) => Number(character && character.roleAbilityRank) || 0,
  nexusPrepResults: () => [],
  refreshNexusResult: vi.fn(),
  startBreach: vi.fn(),
  breachTap: vi.fn(),
});

const characters = [
  { id: 'a', name: 'Rook', role: 'Solo', roleAbilityRank: 4 },
  { id: 'b', name: 'V', role: 'Netrunner', roleAbilityRank: 6 },
];

describe('ui/views/nexus nexusRenderVals', () => {
  it('GM without a published challenge sees the setup game and no waiting/foreign flags', () => {
    const vals = nexusRenderVals({ gm: true, characters }, baseDeps());
    expect(vals.isGmNexus).toBe(true);
    expect(vals.showNexusGame).toBe(false);
    expect(vals.nexusArchitectureMode).toBe(true);
    expect(vals.nexusWaiting).toBe(false);
    expect(vals.nexusForeign).toBe(false);
  });

  it('GM custom mode shows the manual Nexus widget fallback', () => {
    const vals = nexusRenderVals({ gm: true, characters, nexusConfigMode: 'custom' }, baseDeps());
    expect(vals.showNexusGame).toBe(true);
    expect(vals.nexusCustomMode).toBe(true);
  });

  it('player with no matching challenge is waiting', () => {
    const vals = nexusRenderVals({ gm: false, characters, activeCharacterId: 'a', nexusChallenge: null }, baseDeps());
    expect(vals.showNexusGame).toBe(false);
    expect(vals.nexusWaiting).toBe(true);
    expect(vals.nexusForeign).toBe(false);
  });

  it('player targeted by the challenge (or a broadcast) can play', () => {
    const broadcast = nexusRenderVals({ gm: false, characters, activeCharacterId: 'a', nexusChallenge: { targetId: null } }, baseDeps());
    expect(broadcast.showNexusGame).toBe(true);

    const targeted = nexusRenderVals({ gm: false, characters, activeCharacterId: 'a', nexusChallenge: { targetId: 'a' } }, baseDeps());
    expect(targeted.showNexusGame).toBe(true);
    expect(targeted.playerHasChallenge).toBe(true);
  });

  it('player not targeted by an active challenge sees it as foreign', () => {
    const vals = nexusRenderVals({ gm: false, characters, activeCharacterId: 'a', nexusChallenge: { targetId: 'b' } }, baseDeps());
    expect(vals.showNexusGame).toBe(false);
    expect(vals.nexusForeign).toBe(true);
  });

  it('summarizes the published challenge', () => {
    const vals = nexusRenderVals({
      nexusChallenge: { scriptCount: 3, matrixSize: 5, timeLimit: 90, traceRate: 2, sequenceContinuity: 'linked', secondaryObjectives: true },
    }, baseDeps());
    expect(vals.nexusSummary).toBe('3 scripts · matriz 5×5 · 1:30 · trace 2x · continuidade · bônus');
  });

  it('renders architecture tier options and prep rows for a player before the run starts', () => {
    const vals = nexusRenderVals({
      gm: false,
      characters,
      activeCharacterId: 'b',
      nexusChallenge: { targetId: 'b', architectureTier: 'standard', architectureDv: 8, interfaceRank: 6, scriptCount: 3, matrixSize: 6, timeLimit: 100, traceRate: 1, sequenceContinuity: 'blocked' },
      nexusPrepResults: [{ abilityId: 'backdoor', success: true, margin: 3 }],
    }, { ...baseDeps(), nexusPrepResults: () => [{ abilityId: 'backdoor', success: true, margin: 3 }] });

    expect(vals.showPrepPanel).toBe(true);
    expect(vals.showNexusGame).toBe(false);
    expect(vals.prepCountLabel).toBe('1/3');
    expect(vals.prepRows.find(row => row.id === 'backdoor').label).toBe('OK +3');
  });

  it('includes target cyberdeck program modifiers in the architecture preview', () => {
    const vals = nexusRenderVals({
      gm: true,
      characters: [
        characters[0],
        { ...characters[1], netPrograms: ['worm', 'speedy-gonzalvez', 'eraser'] },
      ],
      nexusTargetId: 'b',
    }, baseDeps());

    expect(vals.nexusPreviewConfig.scriptCount).toBe(2);
    expect(vals.nexusPreviewConfig.timeLimit).toBe(136);
    expect(vals.nexusPreviewConfig.programModifierLabels).toContain('Worm: Backdoor automatico');
    expect(vals.nexusPreviewProgramLabels).toContain('Eraser: trace x0.90');
    expect(vals.hasNexusPreviewProgramLabels).toBe(true);
  });

  it('renders Black ICE selection and traced confrontation controls', () => {
    const deps = baseDeps();
    const vals = nexusRenderVals({
      gm: true,
      characters: [
        characters[0],
        { ...characters[1], netPrograms: ['banhammer', 'shield'] },
      ],
      nexusTargetId: 'b',
      nexusTier: 'standard',
      nexusBlackIceId: 'skunk',
      nexusChallenge: { targetId: 'b', architectureTier: 'standard', blackIceId: 'skunk', blackIceRevealed: false },
      nexusResult: { outcome: 'fail', reason: 'trace', trace: 100 },
      nexusBlackIce: { id: 'skunk', rez: 7, maxRez: 10, revealed: true },
    }, deps);

    expect(vals.nexusPreviewBlackIceLabel).toBe('Skunk // OCULTO ATE TRACE');
    expect(vals.nexusBlackIceOptions.find(option => option.id === 'skunk').selected).toBe(true);
    vals.onNexusBlackIce({ target: { value: 'asp' } });
    expect(deps.setNexusBlackIce).toHaveBeenCalledWith('asp');
    expect(vals.blackIcePanel.show).toBe(true);
    expect(vals.blackIcePanel.name).toBe('Skunk');
    expect(vals.blackIcePanel.rezLabel).toBe('7/10');
    expect(vals.blackIcePanel.attackPrograms[0].id).toBe('banhammer');
    vals.blackIcePanel.attackPrograms[0].attack();
    vals.blackIcePanel.attackPrograms[0].damage();
    expect(deps.rollNetrunnerProgramVsIce).toHaveBeenCalledWith('banhammer');
    expect(deps.damageBlackIceWithProgram).toHaveBeenCalledWith('banhammer');
  });

  it('resolves the target name from the character list, falling back to "todos"', () => {
    const withTarget = nexusRenderVals({ characters, nexusChallenge: { targetId: 'b' } }, baseDeps());
    expect(withTarget.nexusTargetName).toBe('V');

    const broadcast = nexusRenderVals({ characters, nexusChallenge: { targetId: null } }, baseDeps());
    expect(broadcast.nexusTargetName).toBe('todos');
  });

  it('summarizes a reported result and colors it by outcome', () => {
    const win = nexusRenderVals({ nexusResult: { playerName: 'V', outcome: 'win', scriptsDone: 3, totalScripts: 3, timeLeft: 45, trace: 20 } }, baseDeps());
    expect(win.hasNexusResult).toBe(true);
    expect(win.nexusResultSummary).toBe('V · SISTEMA INVADIDO · 3/3 scripts · 0:45 restante · trace 20%');
    expect(win.nexusResultColor).toBe('#3fe0d0');

    const fail = nexusRenderVals({ nexusResult: { playerName: 'V', outcome: 'fail', reason: 'trace', timeLeft: 0, trace: 100 } }, baseDeps());
    expect(fail.nexusResultSummary).toContain('FALHOU (trace)');
    expect(fail.nexusResultColor).toBe('#c0635b');
  });

  it('onNexusTarget forwards the selected value to deps.setNexusTarget', () => {
    const deps = baseDeps();
    const vals = nexusRenderVals({ characters }, deps);
    vals.onNexusTarget({ target: { value: 'b' } });
    expect(deps.setNexusTarget).toHaveBeenCalledWith('b');
  });

  it('drives the tap-timing breach mini-game display by status', () => {
    const running = nexusRenderVals({ game: { status: 'running', breaches: 1, pos: 40 } }, baseDeps());
    expect(running.breachBtnLabel).toBe('BREACH');
    expect(running.breachPips).toEqual(['#3fe0d0', 'rgba(63,224,208,0.15)', 'rgba(63,224,208,0.15)']);

    const win = nexusRenderVals({ game: { status: 'win', breaches: 3 } }, baseDeps());
    expect(win.breachMsg).toBe('ICE SHATTERED');

    const fail = nexusRenderVals({ game: { status: 'fail', breaches: 1 } }, baseDeps());
    expect(fail.breachMsg).toBe('TRACE LOCKED // FAIL');

    const idle = nexusRenderVals({ game: {} }, baseDeps());
    expect(idle.breachMsg).toBe('STANDBY');
  });
});

function fakeComponent(overrides = {}) {
  return {
    state: { characters, activeCharacterId: 'a', gm: false, game: {}, ...overrides.state },
    setState: vi.fn(function (patch) {
      const next = typeof patch === 'function' ? patch(this.state) : patch;
      this.state = { ...this.state, ...next };
    }),
    ensureGm: overrides.ensureGm || vi.fn(() => true),
    api: overrides.api || vi.fn(() => null),
    activeCharacter: overrides.activeCharacter || vi.fn(() => ({ id: 'a', name: 'Rook' })),
    flash: vi.fn(),
    roll: vi.fn(),
    postChat: vi.fn(),
    applyCharacterPatch: vi.fn(),
  };
}

describe('ui/views/nexus nexusHandlers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.window = { NexusBreach: undefined };
    global.document = { getElementById: vi.fn(() => ({})), querySelector: vi.fn(() => null) };
  });
  afterEach(() => {
    vi.useRealTimers();
    delete global.window;
    delete global.document;
  });

  it('teardownNexus unmounts only when NexusBreach is mounted', () => {
    const component = fakeComponent({ state: { gm: true } });
    const unmount = vi.fn();
    window.NexusBreach = { isMounted: () => true, unmount };
    nexusHandlers(component).teardownNexus();
    expect(unmount).toHaveBeenCalled();
  });

  it('sendNexusChallenge requires GM auth', async () => {
    const component = fakeComponent({ ensureGm: vi.fn(() => false) });
    await nexusHandlers(component).sendNexusChallenge();
    expect(component.state.nexusChallenge).toBeUndefined();
  });

  it('sendNexusChallenge requires the Breach widget to be mounted', async () => {
    const component = fakeComponent({ state: { nexusConfigMode: 'custom' } });
    window.NexusBreach = { isMounted: () => false };
    await nexusHandlers(component).sendNexusChallenge();
    expect(component.state.gmStatus).toBe('Abra o Nexus Breach para configurar o desafio');
  });

  it('sendNexusChallenge publishes an Architecture config, tags the target, and clears the previous result', async () => {
    const set = vi.fn(async (cfg) => cfg);
    const component = fakeComponent({
      state: {
        characters: [characters[0], { ...characters[1], netPrograms: ['worm'] }],
        nexusTargetId: 'b',
        nexusResult: { outcome: 'win' },
        nexusBlackIceId: 'skunk',
      },
      api: () => ({ nexus: { set } }),
    });
    await nexusHandlers(component).sendNexusChallenge();
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ architectureTier: 'standard', architectureDv: 8, interfaceRank: 6, targetId: 'b', prepRequired: true, blackIceId: 'skunk' }));
    expect(component.state.nexusChallenge).toMatchObject({ scriptCount: 2, targetId: 'b', architectureTier: 'standard', blackIceId: 'skunk', programModifierLabels: ['Worm: Backdoor automatico'] });
    expect(component.state.nexusResult).toBeNull();
    expect(component.state.gmStatus).toBe('Desafio enviado para V');
  });

  it('sendNexusChallenge keeps the manual custom config fallback', async () => {
    const set = vi.fn(async (cfg) => cfg);
    const component = fakeComponent({ state: { nexusConfigMode: 'custom', nexusTargetId: 'b' }, api: () => ({ nexus: { set } }) });
    window.NexusBreach = { isMounted: () => true, readConfig: () => ({ scriptCount: 4 }) };
    await nexusHandlers(component).sendNexusChallenge();
    expect(set).toHaveBeenCalledWith({ scriptCount: 4, targetId: 'b', configMode: 'custom' });
  });

  it('setNexusTarget updates nexusTargetId', () => {
    const component = fakeComponent();
    nexusHandlers(component).setNexusTarget('b');
    expect(component.state.nexusTargetId).toBe('b');
  });

  it('setNexusConfigMode mounts custom mode and tears it down when returning to Architecture', () => {
    const component = fakeComponent({ state: { gm: true } });
    const mount = vi.fn();
    const unmount = vi.fn();
    let mounted = false;
    window.NexusBreach = { isMounted: () => mounted, mount: vi.fn(() => { mounted = true; mount(); }), unmount: vi.fn(() => { mounted = false; unmount(); }) };
    document.getElementById = vi.fn(() => ({ id: 'limiar-nexus-root' }));
    const h = nexusHandlers(component);

    h.setNexusConfigMode('custom');
    expect(component.state.nexusConfigMode).toBe('custom');
    expect(mount).toHaveBeenCalled();

    h.setNexusConfigMode('architecture');
    expect(component.state.nexusConfigMode).toBe('architecture');
    expect(unmount).toHaveBeenCalled();
  });

  it('refreshNexusResult pulls the latest result from the API', async () => {
    const component = fakeComponent({ api: () => ({ nexus: { getResult: vi.fn(async () => ({ outcome: 'fail' })) } }) });
    await nexusHandlers(component).refreshNexusResult();
    expect(component.state.nexusResult).toEqual({ outcome: 'fail' });
    expect(component.state.gmStatus).toBe('Resultado atualizado');
  });

  it('reportNexusResult tags the payload with the active character and saves it', async () => {
    const reportResult = vi.fn(async (payload) => ({ ...payload, saved: true }));
    const component = fakeComponent({ api: () => ({ nexus: { reportResult } }) });
    await nexusHandlers(component).reportNexusResult({ outcome: 'win' });
    expect(reportResult).toHaveBeenCalledWith({ outcome: 'win', playerId: 'a', playerName: 'Rook' });
    expect(component.state.nexusResult).toMatchObject({ saved: true });
    expect(component.postChat).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('SISTEMA INVADIDO') }));
  });

  it('reportNexusResult reveals armed Black ICE on trace and triggerBlackIce can arm it manually', async () => {
    const component = fakeComponent({
      state: {
        nexusChallenge: { targetId: 'a', architectureTier: 'basic', blackIceId: 'wisp' },
      },
      api: () => null,
    });
    await nexusHandlers(component).reportNexusResult({ outcome: 'fail', reason: 'trace', trace: 100 });
    expect(component.state.nexusBlackIce).toMatchObject({ id: 'wisp', rez: 15, revealed: true });

    component.state.nexusBlackIce = null;
    nexusHandlers(component).triggerBlackIce();
    expect(component.state.nexusBlackIce).toMatchObject({ id: 'wisp', rez: 15 });
    expect(component.postChat).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('BLACK ICE DISPARADO :: Wisp') }));
  });

  it('damageBlackIceWithZap rolls damage and decrements Black ICE REZ', () => {
    const component = fakeComponent({
      state: {
        nexusChallenge: { targetId: 'a', architectureTier: 'basic', blackIceId: 'wisp' },
        nexusBlackIce: { id: 'wisp', rez: 5, maxRez: 15, revealed: true },
      },
    });
    component.roll = vi.fn((opts) => opts.onResolved && opts.onResolved({ total: 6 }));
    nexusHandlers(component).damageBlackIceWithZap();
    expect(component.state.nexusBlackIce).toMatchObject({ id: 'wisp', rez: 0, derezzed: true });
  });

  it('applyBlackIceEffect updates target program REZ for anti-program ICE', () => {
    const component = fakeComponent({
      state: {
        activeCharacterId: 'b',
        characters: [characters[0], { ...characters[1], netPrograms: [{ id: 'worm', rez: 7, maxRez: 7, state: 'rezzed' }] }],
        nexusChallenge: { targetId: 'b', architectureTier: 'advanced', blackIceId: 'killer' },
        nexusBlackIce: { id: 'killer', rez: 20, maxRez: 20, revealed: true },
        nexusBlackIceTargetProgramId: 'worm',
      },
      activeCharacter: vi.fn(() => characters[1]),
    });
    component.roll = vi.fn((opts) => opts.onResolved && opts.onResolved({ total: 9 }));
    nexusHandlers(component).applyBlackIceEffect();
    expect(component.applyCharacterPatch).toHaveBeenCalledWith('b', { netPrograms: [{ id: 'worm', rez: 0, maxRez: 7, state: 'derezzed' }] });
    expect(component.postChat).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('Killer dealt 9 REZ to worm') }));
  });

  it('mountNexus mounts the GM setup form directly from state', () => {
    const component = fakeComponent({ state: { gm: true, nexusConfigMode: 'custom', nexusChallenge: { scriptCount: 3 } } });
    const mount = vi.fn();
    window.NexusBreach = { isMounted: () => false, mount };
    document.getElementById = vi.fn(() => ({ id: 'limiar-nexus-root' }));
    nexusHandlers(component).mountNexus();
    expect(mount).toHaveBeenCalledWith(expect.anything(), { showSetup: true, config: { scriptCount: 3 } });
  });

  it('runNexusPrep rolls Interface vs tier DV and stores the prep result', () => {
    const component = fakeComponent({
      state: { activeCharacterId: 'b', nexusChallenge: { targetId: 'b', architectureTier: 'standard', architectureDv: 8, interfaceRank: 6 } },
      activeCharacter: vi.fn(() => characters[1]),
    });
    component.roll = vi.fn((opts) => opts.onResolved({ total: 14 }));
    const h = nexusHandlers(component);
    h.runNexusPrep('scanner');

    expect(component.roll).toHaveBeenCalledWith(expect.objectContaining({ label: 'NEXUS PREP :: SCANNER', mod: 6, dv: 8 }));
    expect(component.state.nexusPrepResults).toEqual([{ abilityId: 'scanner', success: true, margin: 6 }]);
  });

  it('finalizeNexusPrep builds the final config and mounts the locked player run', () => {
    const component = fakeComponent({
      state: {
        activeCharacterId: 'b',
        nexusChallenge: { targetId: 'b', architectureTier: 'basic', architectureDv: 6, interfaceRank: 6, blackIceId: 'wisp' },
        nexusPrepResults: [{ abilityId: 'backdoor', success: true, margin: 2 }],
      },
      activeCharacter: vi.fn(() => ({ ...characters[1], netPrograms: ['speedy-gonzalvez'] })),
    });
    const mount = vi.fn();
    window.NexusBreach = { isMounted: () => false, mount, unmount: vi.fn() };
    document.getElementById = vi.fn(() => ({ id: 'limiar-nexus-root' }));
    nexusHandlers(component).finalizeNexusPrep();

    expect(component.state.nexusChallenge).toMatchObject({ scriptCount: 1, timeLimit: 156, prepComplete: true, blackIceId: 'wisp', programModifierLabels: ['Speedy Gonzalvez: +12s'] });
    expect(mount).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ showSetup: false, config: expect.objectContaining({ scriptCount: 1, timeLimit: 156 }) }));
  });

  it('mountNexus pulls the GM challenge for a player and mounts it locked when addressed to them', async () => {
    const get = vi.fn(async () => ({ targetId: 'a' }));
    const component = fakeComponent({ state: { gm: false, activeCharacterId: 'a' }, api: () => ({ nexus: { get } }) });
    const mount = vi.fn();
    window.NexusBreach = { isMounted: () => false, mount };
    document.getElementById = vi.fn(() => ({ id: 'limiar-nexus-root' }));
    nexusHandlers(component).mountNexus();
    await Promise.resolve();
    await Promise.resolve();
    expect(component.state.nexusChallenge).toEqual({ targetId: 'a' });
    expect(mount).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ showSetup: false, config: { targetId: 'a' } }));
  });

  it('startBreach initializes a running game and breachTap advances it toward a win', () => {
    const component = fakeComponent();
    nexusHandlers(component).startBreach();
    expect(component.state.game.status).toBe('running');

    vi.spyOn(Math, 'random').mockReturnValue(0);
    component.state.game = { ...component.state.game, pos: 40, zoneLo: 30, zoneW: 20, breaches: 2 };
    nexusHandlers(component).breachTap();
    expect(component.state.game.status).toBe('win');
    Math.random.mockRestore();
  });

  it('breachTap outside the zone fails the run', () => {
    const component = fakeComponent({ state: { game: { pos: 0, zoneLo: 50, zoneW: 10, breaches: 0 } } });
    nexusHandlers(component).breachTap();
    expect(component.state.game.status).toBe('fail');
  });
});
