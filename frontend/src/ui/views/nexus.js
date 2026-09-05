// SYS.05 // MINI-GAMES // Nexus Breach tab: the GM's challenge setup/publish,
// the player's locked run + result reporting, and the older tap-timing
// "breach" minigame rendered alongside it. Mount/teardown of the vendored
// NexusBreach DOM widget lives here too (FX/lifecycle belongs to the view).
import {
  BREACH_TIERS,
  blackIceById,
  blackIceOptionsForTier,
  breachConnectionOptions,
  breachTierForDv,
  breachTierOptions,
  buildBreachConfig,
  normalizeBreachConnection,
  netrunningProgramById,
  normalizeInstalledPrograms,
  normalizeBlackIceState,
  resolveBlackIceDamage,
  selectBlackIceForTier,
} from '../../domain/netrunning/index.ts';
import { netActionsPerTurn } from '../../domain/netrunning/index.ts';
// Going Quiet (stealth netrunning DLC): Watchers, Quietly Jack In, Cloak
// contests against Black ICE/Watchers, and the once-per-turn Watcher Search.
import {
  QUIET_JACK_IN_NET_ACTION_COST,
  STEALTH_PREP_ABILITY_ID,
  WATCHER_PRESETS,
  advanceStealthTurn,
  breakStealth,
  buildWatcher,
  canWatcherSearch,
  cloakBonus,
  establishStealth,
  failStealthAttempt,
  markIceBypassed,
  markWatcherSearched,
  normalizeStealthState,
  normalizeWatchers,
  resolveQuietJackIn,
  resolveStealthEncounter,
  resolveWatcherSearch,
  rollNpcCheck,
  rollWatcherJackInChecks,
  rollWatcherPathfinderCheck,
  stealthStatusLabel,
  watcherPresetById,
} from '../../domain/netrunning/index.ts';

export function nexusRenderVals(state = {}, deps = {}) {
  const S = state;
  const nexusChallenge = S.nexusChallenge || null;
  const characters = S.characters || [];
  const activeCharacterId = S.activeCharacterId;

  const challengeForActivePlayer = (cfg) => !!cfg && (!cfg.targetId || cfg.targetId === activeCharacterId);
  const nexusTargetId = S.nexusTargetId || activeCharacterId || ((characters[0] || {}).id) || null;
  const nexusTarget = characters.find(c => c.id === nexusTargetId) || characters.find(c => c.id === activeCharacterId) || {};
  const nexusTargetRank = deps.interfaceRankFor ? deps.interfaceRankFor(nexusTarget) : (Number(nexusTarget.roleAbilityRank) || 0);
  const nexusConfigMode = S.nexusConfigMode === 'custom' ? 'custom' : 'architecture';
  const nexusTier = S.nexusTier || (nexusChallenge && nexusChallenge.architectureTier) || 'standard';
  const nexusBlackIceSelection = S.nexusBlackIceId || 'auto';
  const playerHasChallenge = challengeForActivePlayer(nexusChallenge);
  const architectureChallenge = !!(nexusChallenge && nexusChallenge.architectureTier);
  const prepResults = deps.nexusPrepResults ? deps.nexusPrepResults() : (S.nexusPrepResults || []);
  const prepLimit = architectureChallenge ? netActionsPerTurn(nexusChallenge.interfaceRank || nexusTargetRank) : 0;
  const prepDone = !!S.nexusPrepFinalized || !architectureChallenge;
  const showPrepPanel = !S.gm && playerHasChallenge && architectureChallenge && !prepDone;
  const prepUsed = new Set(prepResults.map(result => result.abilityId));
  const challengeWatchers = normalizeWatchers(nexusChallenge && nexusChallenge.watchers);
  const watcherCountLabel = challengeWatchers.length ? challengeWatchers.length + ' Watcher' + (challengeWatchers.length > 1 ? 's' : '') : 'sem Watchers';
  const prepRows = [
    { id: 'backdoor', name: 'Backdoor', effect: 'sucesso: -1 script; falha por 5+: trace inicia em 10%' },
    { id: 'cloak', name: 'Cloak', effect: 'sucesso: trace x0.75; falha: trace x1.1' },
    { id: 'pathfinder', name: 'Pathfinder', effect: 'sucesso: objetivos secundarios ligados' },
    { id: 'scanner', name: 'Scanner', effect: 'sucesso: scripts revelados e -1 no auxiliar' },
    { id: STEALTH_PREP_ABILITY_ID, name: 'Quietly Jack In', effect: 'Going Quiet: +' + QUIET_JACK_IN_NET_ACTION_COST + ' NET Action; Interface+1d10 vs cada Watcher (' + watcherCountLabel + '); sucesso: stealth ativo, trace x0.5' },
  ].map(row => {
    const used = prepUsed.has(row.id);
    const exhausted = prepResults.length >= prepLimit;
    const result = prepResults.find(entry => entry.abilityId === row.id);
    return {
      ...row,
      used,
      available: !used && !exhausted && !prepDone,
      label: result ? (result.success ? 'OK +' + result.margin : 'FAIL ' + result.margin) : (exhausted ? 'SEM ACOES' : 'ROLAR'),
      style: result && result.success ? 'lm-ui-btn lm-ui-btn--teal lm-ui-btn--compact' : result ? 'lm-ui-btn lm-ui-btn--ghost-danger lm-ui-btn--compact' : 'lm-ui-btn lm-ui-btn--ghost-teal lm-ui-btn--compact',
      roll: row.id === STEALTH_PREP_ABILITY_ID ? () => deps.runQuietJackIn() : () => deps.runNexusPrep(row.id),
    };
  });
  const prepCountLabel = prepResults.length + '/' + prepLimit;
  const prepCanFinalize = showPrepPanel && prepResults.length <= prepLimit;
  const scannerRevealRows = ((nexusChallenge && nexusChallenge.revealedScripts) || []).map(row => ({
    name: row.name || 'SCRIPT',
    length: row.length || 0,
  }));
  const hasScannerReveal = scannerRevealRows.length > 0;
  const nexusDraftWatchers = normalizeWatchers(S.nexusWatchers);
  const nexusConnection = normalizeBreachConnection(S.nexusConnection);
  const nexusPreviewConfig = buildBreachConfig(nexusTier, nexusTargetRank, [], nexusTarget.netPrograms, nexusBlackIceSelection, nexusDraftWatchers, { connection: nexusConnection });
  const nexusConnectionOptions = breachConnectionOptions().map(link => ({
    id: link.id,
    label: link.label.toUpperCase() + ' // ' + link.hint,
    selected: link.id === nexusConnection,
    notSelected: link.id !== nexusConnection,
  }));
  const watcherDraft = S.nexusWatcherDraft || {};
  const draftPreset = watcherPresetById(watcherDraft.presetId) || WATCHER_PRESETS[0];
  const nexusWatcherPresetOptions = WATCHER_PRESETS.map(preset => ({
    id: preset.id,
    label: preset.name.toUpperCase() + ' // INT ' + preset.interface + (preset.pathfinder ? ' +PF ' + preset.pathfinder : ''),
    selected: preset.id === draftPreset.id,
    notSelected: preset.id !== draftPreset.id,
  }));
  const watcherLabel = (watcher) => watcher.name + ' // INT ' + watcher.interface + (watcher.pathfinder ? ' +PF ' + watcher.pathfinder : '') + ' // ' + (watcher.kind === 'demon' ? 'DEMONIO' : 'NETRUNNER');
  const nexusWatcherRows = nexusDraftWatchers.map(watcher => ({
    ...watcher,
    label: watcherLabel(watcher),
    remove: () => deps.removeNexusWatcher(watcher.id),
  }));
  const nexusPreviewProgramLabels = (nexusPreviewConfig.programModifierLabels || []).concat(nexusPreviewConfig.traceMitigation || []);
  const hasNexusPreviewProgramLabels = nexusPreviewProgramLabels.length > 0;
  const nexusBlackIceOptions = [
    { id: 'auto', label: 'AUTO // ROLAR POOL', selected: nexusBlackIceSelection === 'auto', notSelected: nexusBlackIceSelection !== 'auto' },
  ].concat(blackIceOptionsForTier(nexusTier).map(id => {
    const ice = id === 'none' ? null : blackIceById(id);
    const selected = nexusBlackIceSelection === id;
    return { id, label: id === 'none' ? 'NONE // SEM BLACK ICE' : (ice ? ice.name + ' // ' + ice.class.toUpperCase() : id), selected, notSelected: !selected };
  }));
  const nexusPreviewBlackIce = blackIceById(nexusPreviewConfig.blackIceId);
  const nexusPreviewBlackIceLabel = nexusPreviewBlackIce ? nexusPreviewBlackIce.name + ' // OCULTO ATE TRACE' : 'SEM BLACK ICE';

  const nx = nexusChallenge;
  const nexusSummary = nx ? (() => {
    const t = Math.max(0, Number(nx.timeLimit) || 0);
    const time = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    const continuity = nx.sequenceContinuity === 'linked' ? 'continuidade' : 'sem continuidade';
    const arch = nx.architectureTierLabel ? nx.architectureTierLabel + ' DV ' + nx.architectureDv + ' · ' : '';
    const programs = (nx.programModifierLabels || []).concat(nx.traceMitigation || []);
    const ice = blackIceById(nx.blackIceId);
    const showIce = ice && (S.gm || nx.blackIceRevealed || (S.nexusResult && (S.nexusResult.reason === 'trace' || Number(S.nexusResult.trace) >= 100)));
    const watchers = normalizeWatchers(nx.watchers);
    const watcherNote = watchers.length ? ' · ' + watchers.length + ' watcher' + (watchers.length > 1 ? 's' : '') : '';
    const stealthNote = nx.stealthActive ? ' · stealth' : '';
    // The link and the speed contest are difficulty the player is entitled to
    // see: they explain the clock and the trace rate right next to them.
    const linkNote = nx.connectionLabel ? nx.connectionLabel.toLowerCase() + (nx.connectionCheckMod ? ' (' + (nx.connectionCheckMod > 0 ? '+' : '') + nx.connectionCheckMod + ' nos checks)' : '') + ' · ' : '';
    const speedNote = nx.speedDelta == null ? '' : ' · spd ' + nx.runnerSpeed + 'v' + nx.systemSpeed;
    return arch + linkNote + (nx.scriptCount || '?') + ' scripts · matriz ' + nx.matrixSize + '×' + nx.matrixSize + ' · ' + time + ' · trace ' + nx.traceRate + 'x' + speedNote + ' · ' + continuity + (nx.secondaryObjectives ? ' · bônus' : '') + (programs.length ? ' · ' + programs.join(' · ') : '') + (showIce ? ' · ICE ' + ice.name : '') + watcherNote + stealthNote;
  })() : '';

  const nexusTargetName = (() => {
    const id = (nexusChallenge && nexusChallenge.targetId) || null;
    if (!id) return 'todos';
    const c = characters.find(x => x.id === id);
    return (c && c.name) || id;
  })();

  const r = S.nexusResult;
  const tracedResult = !!(r && (r.reason === 'trace' || Number(r.trace) >= 100));
  const nexusResultSummary = r ? (() => {
    const t = Math.max(0, Number(r.timeLeft) || 0);
    const time = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    const verdict = r.outcome === 'win' ? 'SISTEMA INVADIDO' : 'FALHOU' + (r.reason ? ' (' + r.reason + ')' : '');
    return (r.playerName || '?') + ' · ' + verdict + ' · ' + (r.scriptsDone != null ? r.scriptsDone + '/' + r.totalScripts + ' scripts · ' : '') + time + ' restante · trace ' + Math.round(r.trace || 0) + '%';
  })() : '';

  const g = S.game || {};
  let breachMsg = '', breachMsgColor = '#3fe0d0', breachBtnLabel = 'INITIATE BREACH', breachBtnBg = '#3fe0d0', breachAction = deps.startBreach;
  if (g.status === 'running') { breachMsg = ''; breachBtnLabel = 'BREACH'; breachBtnBg = '#d6aa4e'; breachAction = deps.breachTap; }
  else if (g.status === 'win') { breachMsg = 'ICE SHATTERED'; breachMsgColor = '#3fe0d0'; breachBtnLabel = 'RUN AGAIN'; breachBtnBg = '#3fe0d0'; breachAction = deps.startBreach; }
  else if (g.status === 'fail') { breachMsg = 'TRACE LOCKED // FAIL'; breachMsgColor = '#c0635b'; breachBtnLabel = 'RETRY'; breachBtnBg = '#c0635b'; breachAction = deps.startBreach; }
  else { breachMsg = 'STANDBY'; breachMsgColor = '#6f7a64'; }
  const breachPips = [0, 1, 2].map(i => i < (g.breaches || 0) ? '#3fe0d0' : 'rgba(63,224,208,0.15)');
  const blackIceSourceId = (S.nexusBlackIce && S.nexusBlackIce.id) || (nexusChallenge && nexusChallenge.blackIceId) || nexusPreviewConfig.blackIceId;
  const blackIceBase = blackIceById(blackIceSourceId);
  const blackIceState = normalizeBlackIceState(S.nexusBlackIce, blackIceSourceId);
  const blackIceVisible = !!(S.gm || tracedResult || (blackIceState && blackIceState.revealed) || (nexusChallenge && nexusChallenge.blackIceRevealed));
  const blackIceTarget = characters.find(c => c.id === ((nexusChallenge && nexusChallenge.targetId) || activeCharacterId)) || nexusTarget || {};
  const blackIcePrograms = normalizeInstalledPrograms(blackIceTarget.netPrograms)
    .map(program => {
      const base = netrunningProgramById(program.id);
      return {
        ...program,
        name: base ? base.name : program.id,
        label: (base ? base.name : program.id) + ' // REZ ' + program.rez + '/' + program.maxRez,
        selected: S.nexusBlackIceTargetProgramId === program.id,
        notSelected: S.nexusBlackIceTargetProgramId !== program.id,
      };
    });
  const netrunnerAttackPrograms = blackIcePrograms
    .filter(program => {
      const base = netrunningProgramById(program.id);
      return program.state !== 'derezzed' && base && base.class === 'attacker';
    })
    .map(program => ({
      ...program,
      attack: () => deps.rollNetrunnerProgramVsIce(program.id),
      damage: () => deps.damageBlackIceWithProgram(program.id),
    }));
  const blackIcePanel = {
    show: !!blackIceBase && (!!blackIceState || tracedResult || !!S.gm),
    active: !!blackIceState,
    visible: blackIceVisible,
    name: blackIceVisible && blackIceBase ? blackIceBase.name : 'BLACK ICE OCULTO',
    classLabel: blackIceVisible && blackIceBase ? blackIceBase.class.toUpperCase() : 'ICE',
    statsLabel: blackIceVisible && blackIceBase ? 'PER ' + blackIceBase.per + ' // SPD ' + blackIceBase.spd + ' // ATK ' + blackIceBase.atk + ' // DEF ' + blackIceBase.def : 'oculto ate Scanner/Eye-Dee ou trace',
    effect: blackIceVisible && blackIceBase ? blackIceBase.effect : 'O sistema tem contramedidas ocultas.',
    rezLabel: blackIceState ? blackIceState.rez + '/' + blackIceState.maxRez : (blackIceVisible && blackIceBase ? blackIceBase.rez + '/' + blackIceBase.rez : '--'),
    statusLabel: blackIceState && blackIceState.derezzed ? 'DEREZZED' : blackIceState && blackIceState.bypassed ? 'EVITADO // FORA DA INICIATIVA' : blackIceState ? 'ATIVO' : 'ARMADO',
    statusColor: blackIceState && (blackIceState.derezzed || blackIceState.bypassed) ? '#3fe0d0' : tracedResult ? '#c0635b' : '#d6aa4e',
    targetName: blackIceTarget.name || 'OPERATIVO',
    programOptions: blackIcePrograms,
    hasProgramOptions: blackIcePrograms.length > 0,
    attackPrograms: netrunnerAttackPrograms,
    hasAttackPrograms: netrunnerAttackPrograms.length > 0,
    trigger: deps.triggerBlackIce,
    rollIceAttack: deps.rollBlackIceAttack,
    rollNetrunnerDefense: deps.rollNetrunnerDefense,
    rollBlackIceDefense: deps.rollBlackIceDefense,
    rollZap: deps.rollNetrunnerZapAttack,
    damageZap: deps.damageBlackIceWithZap,
    applyIceEffect: deps.applyBlackIceEffect,
    onTargetProgram: (e) => deps.setNexusBlackIceTargetProgram(e.target.value),
  };

  // Going Quiet panel: shared by GM and player. Stealth state is local to each
  // client (like the Black ICE panel) and every resolution is posted to chat.
  const stealth = normalizeStealthState(S.nexusStealth);
  const stealthCloak = cloakBonus(blackIceTarget.netPrograms);
  const stealthRank = (nexusChallenge && Number(nexusChallenge.interfaceRank)) || (deps.interfaceRankFor ? deps.interfaceRankFor(blackIceTarget) : (Number(blackIceTarget.roleAbilityRank) || 0));
  const stealthWatcherRows = challengeWatchers.map(watcher => {
    const searchable = canWatcherSearch(stealth, watcher.id);
    return {
      ...watcher,
      label: watcherLabel(watcher),
      canSearch: !!S.gm && searchable,
      searchLabel: searchable ? 'BUSCA ATIVA' : stealth.active ? 'BUSCA USADA' : 'SEM ALVO',
      canEncounter: stealth.active,
      search: () => deps.watcherSearch(watcher.id),
      encounter: () => deps.resolveStealthVsWatcher(watcher.id),
    };
  });
  const stealthHistory = stealth.history.slice(-5).reverse();
  const stealthPanel = {
    show: !!nexusChallenge && (S.gm || playerHasChallenge) && (stealth.attempted || challengeWatchers.length > 0),
    isGm: !!S.gm,
    active: stealth.active,
    broken: !!stealth.brokenBy,
    statusLabel: stealthStatusLabel(stealth),
    statusColor: stealth.active ? '#3fe0d0' : stealth.brokenBy ? '#c0635b' : '#6f7a64',
    turnLabel: 'TURNO ' + stealth.turn,
    netrunnerLabel: (blackIceTarget.name || 'OPERATIVO') + ' // INTERFACE ' + stealthRank + ' // CLOAK +' + stealthCloak,
    watchers: stealthWatcherRows,
    hasWatchers: stealthWatcherRows.length > 0,
    canEncounterIce: stealth.active && !!blackIceBase && !(blackIceState && (blackIceState.bypassed || blackIceState.derezzed)),
    iceBypassed: !!(blackIceState && blackIceState.bypassed),
    encounterIce: deps.resolveStealthVsIce,
    controlNode: () => deps.breakNexusStealth('control'),
    breakManual: () => deps.breakNexusStealth('manual'),
    nextTurn: deps.advanceNexusTurn,
    history: stealthHistory,
    hasHistory: stealthHistory.length > 0,
  };

  return {
    isGmNexus: !!S.gm,
    gmHasChallenge: !!nexusChallenge,
    playerHasChallenge,
    showNexusGame: S.gm ? nexusConfigMode === 'custom' : playerHasChallenge && prepDone,
    nexusWaiting: !S.gm && !playerHasChallenge,
    nexusForeign: !S.gm && !!nexusChallenge && !playerHasChallenge,
    nexusConfigMode,
    nexusArchitectureMode: nexusConfigMode === 'architecture',
    nexusCustomMode: nexusConfigMode === 'custom',
    nexusModeArchitectureClass: 'lm-ui-btn lm-ui-btn--compact ' + (nexusConfigMode === 'architecture' ? 'lm-ui-btn--teal' : 'lm-ui-btn--ghost-teal'),
    nexusModeCustomClass: 'lm-ui-btn lm-ui-btn--compact ' + (nexusConfigMode === 'custom' ? 'lm-ui-btn--gold' : 'lm-ui-btn--ghost-gold'),
    setNexusArchitectureMode: () => deps.setNexusConfigMode('architecture'),
    setNexusCustomMode: () => deps.setNexusConfigMode('custom'),
    nexusTierOptions: breachTierOptions().map(tier => ({
      id: tier.id,
      label: tier.label + ' // DV ' + tier.dv,
      hint: tier.hint,
      selected: tier.id === nexusTier,
      notSelected: tier.id !== nexusTier,
    })),
    onNexusTier: (e) => deps.setNexusTier(e.target.value),
    nexusConnection,
    nexusConnectionOptions,
    onNexusConnection: (e) => deps.setNexusConnection(e.target.value),
    nexusDifficultyDigest: nexusPreviewConfig.difficultyDigest || [],
    nexusBlackIceOptions,
    onNexusBlackIce: (e) => deps.setNexusBlackIce(e.target.value),
    nexusPreviewBlackIceLabel,
    nexusWatcherPresetOptions,
    nexusWatcherRows,
    hasNexusWatchers: nexusWatcherRows.length > 0,
    nexusWatcherDraftName: watcherDraft.name || '',
    nexusWatcherDraftInterface: watcherDraft.interface == null || watcherDraft.interface === '' ? draftPreset.interface : watcherDraft.interface,
    nexusWatcherDraftPathfinder: watcherDraft.pathfinder == null || watcherDraft.pathfinder === '' ? draftPreset.pathfinder : watcherDraft.pathfinder,
    onNexusWatcherPreset: (e) => deps.setNexusWatcherPreset(e.target.value),
    onNexusWatcherName: (e) => deps.setNexusWatcherDraft('name', e.target.value),
    onNexusWatcherInterface: (e) => deps.setNexusWatcherDraft('interface', e.target.value),
    onNexusWatcherPathfinder: (e) => deps.setNexusWatcherDraft('pathfinder', e.target.value),
    addNexusWatcher: deps.addNexusWatcher,
    nexusTargetRank,
    nexusPreviewConfig,
    nexusPreviewProgramLabels,
    hasNexusPreviewProgramLabels,
    showPrepPanel,
    prepRows,
    prepCountLabel,
    prepCanFinalize,
    finalizeNexusPrep: deps.finalizeNexusPrep,
    hasScannerReveal,
    scannerRevealRows,
    sendNexusChallenge: deps.sendNexusChallenge,
    nexusSummary,
    refreshNexus: deps.refreshNexusChallenge,
    nexusRefreshLabel: playerHasChallenge ? 'ATUALIZAR DESAFIO' : 'BUSCAR DESAFIO',
    onNexusTarget: (e) => deps.setNexusTarget(e.target.value),
    nexusTargetName,
    characterOptions: characters.map(c => ({ id: c.id, name: c.name, selected: c.id === nexusTargetId, notSelected: c.id !== nexusTargetId })),
    hasNexusResult: !!S.nexusResult,
    notHasNexusResult: !S.nexusResult,
    nexusResultSummary,
    nexusResultColor: (S.nexusResult && S.nexusResult.outcome === 'win') ? '#3fe0d0' : '#c0635b',
    refreshNexusResult: deps.refreshNexusResult,
    markerPos: g.pos, zoneLo: g.zoneLo, zoneW: g.zoneW,
    breachMsg, breachMsgColor, breachBtnLabel, breachBtnBg, breachAction, breachPips,
    blackIcePanel,
    stealthPanel,
  };
}

// component: the Component instance (state/setState/api/ensureGm/
// activeCharacter/_gi timer handle already live there).
export function nexusHandlers(component) {
  const challengeForActivePlayer = (cfg) => !!cfg && (!cfg.targetId || cfg.targetId === component.state.activeCharacterId);
  const architectureMode = () => component.state.nexusConfigMode !== 'custom';
  const interfaceRankFor = (character) => {
    const c = character || {};
    return String(c.role || '').toUpperCase() === 'NETRUNNER' ? (Number(c.roleAbilityRank) || 0) : (Number(c.roleAbilityRank) || 0);
  };
  const nexusPrepResults = () => Array.isArray(component.state.nexusPrepResults) ? component.state.nexusPrepResults : [];
  const targetForChallenge = () => {
    const targetId = component.state.nexusTargetId || component.state.activeCharacterId || ((component.state.characters || [])[0] || {}).id || null;
    const target = (component.state.characters || []).find(c => c.id === targetId) || null;
    return { targetId, target };
  };

  const teardownNexus = () => {
    if (window.NexusBreach && window.NexusBreach.isMounted()) window.NexusBreach.unmount();
  };

  const currentChallengeBlackIceId = () => {
    const challenge = component.state.nexusChallenge || {};
    return challenge.blackIceId || selectBlackIceForTier(challenge.architectureTier || component.state.nexusTier || 'standard', component.state.nexusBlackIceId || 'auto');
  };

  const activeBlackIceState = () => component.state.nexusBlackIce ? normalizeBlackIceState(component.state.nexusBlackIce, currentChallengeBlackIceId()) : null;

  const blackIceTarget = () => {
    const challenge = component.state.nexusChallenge || {};
    const targetId = challenge.targetId || component.state.activeCharacterId;
    return (component.state.characters || []).find(c => c.id === targetId) || component.activeCharacter();
  };

  const updateBlackIceState = (patch) => {
    const current = activeBlackIceState();
    if (!current) return null;
    const next = normalizeBlackIceState({ ...current, ...patch }, current.id);
    component.setState({ nexusBlackIce: next });
    return next;
  };

  const ensureBlackIceState = () => {
    const id = currentChallengeBlackIceId();
    if (!id) {
      component.flash && component.flash('Nenhum Black ICE armado neste desafio');
      return null;
    }
    const current = activeBlackIceState();
    if (current) return current;
    const next = normalizeBlackIceState({ revealed: true }, id);
    component.setState({ nexusBlackIce: next });
    return next;
  };

  // Going Quiet helpers. `component.random` lets tests pin the NPC dice.
  const random = () => (typeof component.random === 'function' ? component.random() : Math.random());
  const flash = (message) => { if (component.flash) component.flash(message); };
  const stealthState = () => normalizeStealthState(component.state.nexusStealth);
  const challengeWatchers = () => normalizeWatchers((component.state.nexusChallenge || {}).watchers);
  const stealthChat = (text) => component.postChat({ kind: 'text', text: 'GOING QUIET :: ' + text });
  const netrunnerStealthMod = (target) => interfaceRankFor(target) + cloakBonus(target && target.netPrograms);
  const noteAttackBreaksStealth = (label) => {
    const current = stealthState();
    if (!current.active) return;
    component.setState({ nexusStealth: breakStealth(current, 'attack', 'ataque: ' + label) });
    stealthChat('STEALTH QUEBRADO :: ataque (' + label + ')');
  };

  const programAttackDamageDice = (programId) => {
    if (programId === 'sword') return 3;
    if (programId === 'banhammer') return 2;
    return 0;
  };

  const damageBlackIce = (label, diceCount) => {
    const iceState = ensureBlackIceState();
    if (!iceState || !diceCount) return;
    component.roll({
      label,
      sides: 6,
      count: diceCount,
      mod: 0,
      skipActionPenalty: true,
      onResolved: (result) => {
        const current = activeBlackIceState() || iceState;
        const damage = Math.max(0, Number(result.total) || 0);
        const rez = Math.max(0, current.rez - damage);
        const next = updateBlackIceState({ rez, derezzed: rez <= 0, revealed: true });
        const ice = blackIceById(current.id);
        component.postChat({
          kind: 'text',
          text: 'BLACK ICE :: ' + (ice ? ice.name : current.id) + ' sofre ' + damage + ' REZ' + (next && next.derezzed ? ' :: DEREZZED' : ' :: REZ ' + (next ? next.rez : rez) + '/' + current.maxRez),
        });
      },
    });
  };

  const reportNexusResult = async (res) => {
    const ch = component.activeCharacter();
    const payload = { ...res, playerId: component.state.activeCharacterId, playerName: (ch && ch.name) || 'OPERATIVO' };
    const saved = (component.api() && component.api().nexus) ? await component.api().nexus.reportResult(payload) : payload;
    const traced = saved && (saved.reason === 'trace' || Number(saved.trace) >= 100);
    const iceId = currentChallengeBlackIceId();
    component.setState({
      nexusResult: saved,
      // The run is over: release the client-local lock so the next refresh can
      // pull whatever the GM has published since.
      nexusLocalRun: false,
      ...(traced && iceId ? { nexusBlackIce: normalizeBlackIceState({ revealed: true }, iceId) } : {}),
    });
    component.postChat({
      kind: 'text',
      text: nexusResultRawSummary(saved),
    });
  };

  // Mounts the Breach game according to role: the GM gets the editable setup
  // form; the player gets the GM's challenge with the difficulty locked.
  const mountNexus = () => {
    if (!window.NexusBreach || window.NexusBreach.isMounted()) return;
    if (component.state.gm) {
      const rootEl = document.getElementById('limiar-nexus-root');
      if (rootEl) window.NexusBreach.mount(rootEl, { showSetup: true, config: component.state.nexusChallenge });
      return;
    }
    // Player: pull the latest GM challenge from the API, then mount it locked
    // only if it is addressed to the active operative.
    const apply = (cfg) => {
      const rootEl = document.getElementById('limiar-nexus-root');
      const needsPrep = !!(cfg && cfg.architectureTier) && !component.state.nexusPrepFinalized;
      if (rootEl && challengeForActivePlayer(cfg) && !needsPrep && !window.NexusBreach.isMounted()) {
        window.NexusBreach.mount(rootEl, { showSetup: false, config: cfg, onResult: reportNexusResult });
      }
    };
    // A run the player opened from their own NET test is client-local: the
    // server has no such challenge, so asking for it would wipe the run.
    if (component.state.nexusLocalRun) { apply(component.state.nexusChallenge); return; }
    if (component.api() && component.api().nexus) {
      component.api().nexus.get().then(cfg => { component.setState({ nexusChallenge: cfg }); apply(cfg); });
    } else {
      apply(component.state.nexusChallenge);
    }
  };


  // A NET test rolled at the table (GM console request or the sheet's own
  // Interface Ability button) IS the run's entry check: the DV the GM asked
  // for picks the Architecture tier, and the roll itself seeds the matching
  // prep result, so a clean Backdoor opens the run one script lighter. The
  // config never leaves this client — the GM's published challenge, when
  // there is one, always wins.
  const launchNetTestRun = (context = {}) => {
    if (component.state.gm) return false;
    const activeId = component.state.activeCharacterId;
    if (context.actorId && activeId && context.actorId !== activeId) return false;
    if (window.NexusBreach && window.NexusBreach.isMounted()) {
      flash('Run em andamento :: teste NET rolado sem abrir novo Nexus');
      return false;
    }
    const pending = component.state.nexusChallenge;
    if (!component.state.nexusLocalRun && pending && pending.architectureTier && challengeForActivePlayer(pending) && !component.state.nexusResult) {
      flash('Desafio do mestre pendente :: abra o Nexus para joga-lo');
      return false;
    }
    const character = component.activeCharacter();
    const rank = interfaceRankFor(character);
    const tierId = breachTierForDv(context.dv);
    const requestedDv = Number(context.dv);
    const dv = Number.isFinite(requestedDv) ? requestedDv : BREACH_TIERS[tierId].dv;
    const abilityId = String(context.abilityId || '').toLowerCase();
    const connection = normalizeBreachConnection(context.connection);
    const total = Number(context.total) || 0;
    // commitRoll already applied the RAW "beat the DV, a tie fails" rule when
    // the request carried one; without a DV the tier's own DV decides.
    const success = typeof context.success === 'boolean' ? context.success : total > dv;
    // Non-prep abilities (zap, control, eye-dee, custom) are dropped by
    // buildBreachConfig's own filter — no need to branch on the id here.
    const prepResults = [{ abilityId, success, margin: total - dv, source: 'teste NET' }];
    const config = {
      ...buildBreachConfig(tierId, rank, prepResults, character && character.netPrograms, 'auto', [], { dv, connection }),
      targetId: activeId || null,
      interfaceRank: rank,
      prepRequired: false,
      prepComplete: true,
      netTest: { abilityId: abilityId || 'custom', label: context.label || 'TESTE NET', dv, total, success, connection },
    };
    component.setState({
      nexusChallenge: config,
      nexusLocalRun: true,
      nexusResult: null,
      nexusPrepResults: [],
      nexusPrepFinalized: true,
      nexusStealth: null,
      nexusBlackIce: null,
      view: 'games',
      gameTab: 'nexus',
      sheetOpen: false,
      selected: null,
    });
    teardownNexus();
    mountNexus();
    return true;
  };

  return {
    teardownNexus,
    mountNexus,
    launchNetTestRun,
    challengeForActivePlayer,
    reportNexusResult,
    interfaceRankFor,
    nexusPrepResults,

    // GM action: capture the current difficulty, tag the chosen target and
    // publish it. Publishing also clears the previous run result.
    async sendNexusChallenge() {
      if (!component.ensureGm('Login do mestre necessario para enviar desafio')) return;
      if (!architectureMode() && (!window.NexusBreach || !window.NexusBreach.isMounted())) {
        component.setState({ gmStatus: 'Abra o Nexus Breach para configurar o desafio' });
        return;
      }
      const { targetId, target } = targetForChallenge();
      const rank = interfaceRankFor(target);
      const watchers = normalizeWatchers(component.state.nexusWatchers);
      const config = architectureMode()
        ? { ...buildBreachConfig(component.state.nexusTier || 'standard', rank, [], target && target.netPrograms, component.state.nexusBlackIceId || 'auto', watchers, { connection: component.state.nexusConnection }), targetId, interfaceRank: rank, prepRequired: true }
        : { ...window.NexusBreach.readConfig(), targetId, configMode: 'custom' };
      const saved = (component.api() && component.api().nexus) ? await component.api().nexus.set(config) : config;
      component.setState({ nexusChallenge: saved, nexusResult: null, nexusPrepResults: [], nexusPrepFinalized: false, nexusStealth: null, nexusBlackIce: null, gmStatus: 'Desafio enviado para ' + ((target && target.name) || 'operativo') });
    },

    setNexusTarget: (value) => component.setState({ nexusTargetId: value }),
    setNexusBlackIce: (value) => component.setState({ nexusBlackIceId: value || 'auto' }),
    setNexusBlackIceTargetProgram: (value) => component.setState({ nexusBlackIceTargetProgramId: value || '' }),
    setNexusConfigMode(value) {
      const mode = value === 'custom' ? 'custom' : 'architecture';
      if (mode === 'architecture') teardownNexus();
      component.setState({ nexusConfigMode: mode });
      if (mode === 'custom') mountNexus();
    },
    setNexusTier: (value) => component.setState({ nexusTier: value }),
    setNexusConnection: (value) => component.setState({ nexusConnection: normalizeBreachConnection(value) }),

    // GM: Watcher roster for the next published challenge (Going Quiet).
    setNexusWatcherPreset(value) {
      const preset = watcherPresetById(value) || WATCHER_PRESETS[0];
      component.setState(s => ({ nexusWatcherDraft: { ...(s.nexusWatcherDraft || {}), presetId: preset.id, interface: preset.interface, pathfinder: preset.pathfinder } }));
    },
    setNexusWatcherDraft(field, value) {
      component.setState(s => ({ nexusWatcherDraft: { ...(s.nexusWatcherDraft || {}), [field]: value } }));
    },
    addNexusWatcher() {
      const draft = component.state.nexusWatcherDraft || {};
      const list = normalizeWatchers(component.state.nexusWatchers);
      const watcher = buildWatcher({ presetId: draft.presetId || WATCHER_PRESETS[0].id, name: draft.name, interface: draft.interface, pathfinder: draft.pathfinder }, list.length);
      if (!watcher) return flash('Watcher invalido: nome e Interface obrigatorios');
      const id = list.some(row => row.id === watcher.id) ? watcher.id + '-' + Date.now().toString(36) : watcher.id;
      component.setState({ nexusWatchers: [...list, { ...watcher, id }], nexusWatcherDraft: { ...draft, name: '' } });
    },
    removeNexusWatcher(id) {
      component.setState(s => ({ nexusWatchers: normalizeWatchers(s.nexusWatchers).filter(row => row.id !== id) }));
    },

    // Player: Quietly Jack In. Costs one NET Action from the prep budget and is
    // contested against every Watcher's Interface + 1d10 (ties favor them).
    runQuietJackIn() {
      const challenge = component.state.nexusChallenge || {};
      const rank = Number(challenge.interfaceRank) || interfaceRankFor(component.activeCharacter());
      const current = nexusPrepResults();
      const limit = netActionsPerTurn(rank);
      if (!challengeForActivePlayer(challenge)) return flash('Nenhuma architecture publicada para este operativo');
      if (component.state.nexusPrepFinalized) return flash('Preparacao ja finalizada');
      if (current.some(result => result.abilityId === STEALTH_PREP_ABILITY_ID)) return flash('Quietly Jack In ja tentado nesta conexao');
      if (current.length + QUIET_JACK_IN_NET_ACTION_COST > limit) return flash('NET Actions insuficientes para Quietly Jack In');
      const watchers = challengeWatchers();
      component.roll({
        actorId: component.state.activeCharacterId,
        label: 'GOING QUIET :: QUIETLY JACK IN',
        sides: 10,
        count: 1,
        mod: rank,
        check: true,
        onResolved: (result) => {
          const rolls = rollWatcherJackInChecks(watchers, random);
          const contest = resolveQuietJackIn(result.total, rolls);
          const best = rolls.reduce((max, roll) => Math.max(max, roll.total), 0);
          const entry = { abilityId: STEALTH_PREP_ABILITY_ID, success: contest.success, margin: (Number(result.total) || 0) - best };
          component.setState(s => ({
            nexusPrepResults: [...(s.nexusPrepResults || []), entry],
            nexusStealth: contest.success ? establishStealth(s.nexusStealth, 'jack in silencioso') : failStealthAttempt(s.nexusStealth, 'detectado ao conectar'),
          }));
          const versus = rolls.length ? rolls.map(roll => roll.name + ' ' + roll.total).join(' / ') : 'sem Watchers';
          stealthChat('QUIETLY JACK IN :: ' + result.total + ' vs ' + versus + ' :: ' + (contest.success ? 'STEALTH ATIVO' : 'DETECTADO') + ' // ' + contest.note);
        },
      });
    },

    // Hidden Netrunner meets the armed Black ICE: Interface + Cloak + 1d10 vs
    // PER + 1d10. Pass: ICE stays out of initiative. Fail: cover blown, ICE
    // attacks at once (GM uses the regular ICE ATK controls).
    resolveStealthVsIce() {
      const current = stealthState();
      if (!current.active) return flash('Stealth nao esta ativo');
      const ice = blackIceById(currentChallengeBlackIceId());
      if (!ice) return flash('Nenhum Black ICE armado neste desafio');
      const existing = activeBlackIceState();
      if (existing && existing.bypassed) return flash(ice.name + ' ja foi evitado nesta run');
      const target = blackIceTarget();
      component.roll({
        actorId: target.id,
        label: 'GOING QUIET :: CLOAK VS ' + ice.name.toUpperCase(),
        sides: 10,
        count: 1,
        mod: netrunnerStealthMod(target),
        check: true,
        skipActionPenalty: true,
        onResolved: (result) => {
          const iceRoll = rollNpcCheck(ice.id, ice.name, ice.per, random);
          const outcome = resolveStealthEncounter(result.total, iceRoll.total);
          const base = activeBlackIceState() || {};
          if (outcome.passed) {
            component.setState({
              nexusBlackIce: normalizeBlackIceState({ ...base, revealed: true, bypassed: true }, ice.id),
              nexusStealth: markIceBypassed(current, 'passou por ' + ice.name),
            });
            stealthChat('CLOAK ' + result.total + ' vs ' + ice.name + ' PER ' + iceRoll.total + ' :: ICE EVITADO, fora da iniciativa');
          } else {
            component.setState({
              nexusBlackIce: normalizeBlackIceState({ ...base, revealed: true, bypassed: false }, ice.id),
              nexusStealth: breakStealth(current, 'black-ice', ice.name + ' percebeu o Netrunner'),
            });
            stealthChat('CLOAK ' + result.total + ' vs ' + ice.name + ' PER ' + iceRoll.total + ' :: STEALTH QUEBRADO, ' + ice.name + ' ataca imediatamente');
          }
        },
      });
    },

    // Hidden Netrunner meets a Watcher: Interface + Cloak + 1d10 vs the
    // Watcher's Interface + Pathfinder + 1d10.
    resolveStealthVsWatcher(watcherId) {
      const current = stealthState();
      if (!current.active) return flash('Stealth nao esta ativo');
      const watcher = challengeWatchers().find(row => row.id === watcherId);
      if (!watcher) return flash('Watcher nao encontrado');
      const target = blackIceTarget();
      component.roll({
        actorId: target.id,
        label: 'GOING QUIET :: CLOAK VS ' + watcher.name.toUpperCase(),
        sides: 10,
        count: 1,
        mod: netrunnerStealthMod(target),
        check: true,
        skipActionPenalty: true,
        onResolved: (result) => {
          const watcherRoll = rollWatcherPathfinderCheck(watcher, random);
          const outcome = resolveStealthEncounter(result.total, watcherRoll.total);
          component.setState({
            nexusStealth: outcome.passed
              ? { ...current, history: current.history.concat('passou por ' + watcher.name).slice(-20) }
              : breakStealth(current, 'watcher', watcher.name + ' percebeu o Netrunner'),
          });
          stealthChat('CLOAK ' + result.total + ' vs ' + watcher.name + ' PATHFINDER ' + watcherRoll.total + ' :: ' + (outcome.passed ? 'PASSOU DESPERCEBIDO' : 'STEALTH QUEBRADO por ' + watcher.name));
        },
      });
    },

    // GM: Watcher Search, once per Turn per Watcher. Watcher acts (Interface +
    // Pathfinder + 1d10), Netrunner defends with Cloak, so ties keep them hidden.
    watcherSearch(watcherId) {
      if (!component.ensureGm('Login do mestre necessario para busca ativa')) return;
      const current = stealthState();
      if (!current.active) return flash('Stealth nao esta ativo: nada a buscar');
      const watcher = challengeWatchers().find(row => row.id === watcherId);
      if (!watcher) return flash('Watcher nao encontrado');
      if (!canWatcherSearch(current, watcher.id)) return flash(watcher.name + ' ja gastou a busca deste turno');
      const target = blackIceTarget();
      component.roll({
        actorId: target.id,
        label: 'GOING QUIET :: CLOAK VS BUSCA DE ' + watcher.name.toUpperCase(),
        sides: 10,
        count: 1,
        mod: netrunnerStealthMod(target),
        check: true,
        skipActionPenalty: true,
        onResolved: (result) => {
          const watcherRoll = rollWatcherPathfinderCheck(watcher, random);
          const outcome = resolveWatcherSearch(watcherRoll.total, result.total);
          const searched = markWatcherSearched(current, watcher.id, watcher.name + ' buscou (turno ' + current.turn + ')');
          component.setState({ nexusStealth: outcome.found ? breakStealth(searched, 'search', watcher.name + ' localizou o Netrunner') : searched });
          stealthChat('BUSCA ATIVA :: ' + watcher.name + ' ' + watcherRoll.total + ' vs CLOAK ' + result.total + ' :: ' + (outcome.found ? 'NETRUNNER LOCALIZADO, stealth quebrado' : 'nao encontrou'));
        },
      });
    },

    advanceNexusTurn() {
      const next = advanceStealthTurn(stealthState());
      component.setState({ nexusStealth: next });
      stealthChat('TURNO ' + next.turn + ' :: buscas dos Watchers renovadas');
    },

    // Control Nodes and attacks blow cover outright (no roll).
    breakNexusStealth(reason) {
      const current = stealthState();
      if (!current.active) return flash('Stealth nao esta ativo');
      const why = reason === 'control' ? 'Control Node assumido' : reason === 'attack' ? 'ataque' : 'quebra manual pelo mestre';
      component.setState({ nexusStealth: breakStealth(current, reason === 'control' || reason === 'attack' ? reason : 'manual', why) });
      stealthChat('STEALTH QUEBRADO :: ' + why);
    },

    runNexusPrep(abilityId) {
      const challenge = component.state.nexusChallenge || {};
      const rank = Number(challenge.interfaceRank) || interfaceRankFor(component.activeCharacter());
      // The DV is the one the run was opened with (the GM's, when they named
      // one), and the link the operative is jacked in through modifies every
      // Interface check made from inside it.
      const dv = Number(challenge.architectureDv) || 8;
      const linkMod = Number(challenge.connectionCheckMod) || 0;
      const current = nexusPrepResults();
      const limit = netActionsPerTurn(rank);
      if (!challengeForActivePlayer(challenge)) return component.flash && component.flash('Nenhuma architecture publicada para este operativo');
      if (component.state.nexusPrepFinalized) return component.flash && component.flash('Preparacao ja finalizada');
      if (current.length >= limit) return component.flash && component.flash('NET Actions de preparo esgotadas');
      if (current.some(result => result.abilityId === abilityId)) return component.flash && component.flash('Interface Ability ja usada nesta preparacao');
      const abilityName = String(abilityId || '').toUpperCase();
      component.roll({
        actorId: component.state.activeCharacterId,
        label: 'NEXUS PREP :: ' + abilityName + (linkMod ? ' (' + (linkMod > 0 ? '+' : '') + linkMod + ' ' + String(challenge.connectionLabel || challenge.connection || 'LINK').toUpperCase() + ')' : ''),
        sides: 10,
        count: 1,
        mod: rank + linkMod,
        check: true,
        dv,
        onResolved: (result) => {
          const margin = (Number(result.total) || 0) - dv;
          const entry = { abilityId, success: margin >= 0, margin };
          component.setState(s => ({ nexusPrepResults: [...(s.nexusPrepResults || []), entry] }));
          component.postChat({
            kind: 'text',
            text: 'NEXUS PREP :: ' + abilityName + ' :: ' + (entry.success ? 'SUCESSO' : 'FALHA') + ' (' + (margin >= 0 ? '+' : '') + margin + ')',
          });
        },
      });
    },

    finalizeNexusPrep() {
      const challenge = component.state.nexusChallenge || {};
      if (!challengeForActivePlayer(challenge)) return;
      const finalConfig = {
        ...buildBreachConfig(challenge.architectureTier || 'standard', challenge.interfaceRank || interfaceRankFor(component.activeCharacter()), nexusPrepResults(), component.activeCharacter().netPrograms, challenge.blackIceId || 'none', challenge.watchers, { dv: challenge.architectureDv, connection: challenge.connection }),
        targetId: challenge.targetId || null,
        interfaceRank: challenge.interfaceRank || interfaceRankFor(component.activeCharacter()),
        prepRequired: true,
        prepComplete: true,
      };
      component.setState({ nexusChallenge: finalConfig, nexusPrepFinalized: true });
      teardownNexus();
      mountNexus();
    },

    // GM action: re-pull the latest run result reported by the player.
    async refreshNexusResult() {
      if (!(component.api() && component.api().nexus)) return;
      const r = await component.api().nexus.getResult();
      const traced = r && (r.reason === 'trace' || Number(r.trace) >= 100);
      const iceId = currentChallengeBlackIceId();
      component.setState({
        nexusResult: r,
        gmStatus: r ? 'Resultado atualizado' : 'Nenhum resultado ainda',
        ...(traced && iceId ? { nexusBlackIce: normalizeBlackIceState({ revealed: true }, iceId) } : {}),
      });
    },

    // Player action: re-pull the GM challenge from the API on demand and, if on
    // the Breach tab, remount with whatever the GM currently has published.
    async refreshNexusChallenge() {
      if (!(component.api() && component.api().nexus)) return;
      const cfg = await component.api().nexus.get();
      component.setState({ nexusChallenge: cfg, nexusPrepResults: [], nexusPrepFinalized: false, nexusStealth: null, nexusBlackIce: null, gmStatus: cfg ? 'Desafio atualizado' : 'Nenhum desafio publicado' });
      if (component.state.view === 'games' && component.state.gameTab === 'nexus' && !component.state.gm) {
        teardownNexus();
        mountNexus();
      }
    },

    triggerBlackIce() {
      const next = ensureBlackIceState();
      if (!next) return;
      const ice = blackIceById(next.id);
      component.postChat({ kind: 'text', text: 'BLACK ICE DISPARADO :: ' + (ice ? ice.name : next.id) + ' // REZ ' + next.rez + '/' + next.maxRez });
    },

    rollBlackIceAttack() {
      const state = ensureBlackIceState();
      const ice = state && blackIceById(state.id);
      if (!ice) return;
      component.roll({ label: 'BLACK ICE :: ' + ice.name.toUpperCase() + ' ATK', sides: 10, count: 1, mod: ice.atk, check: true, skipActionPenalty: true });
    },

    rollNetrunnerDefense() {
      const target = blackIceTarget();
      component.roll({ actorId: target.id, label: 'NET DEFENSE :: INTERFACE', sides: 10, count: 1, mod: interfaceRankFor(target), check: true, skipActionPenalty: true });
    },

    rollBlackIceDefense() {
      const state = ensureBlackIceState();
      const ice = state && blackIceById(state.id);
      if (!ice) return;
      component.roll({ label: 'BLACK ICE :: ' + ice.name.toUpperCase() + ' DEF', sides: 10, count: 1, mod: ice.def, check: true, skipActionPenalty: true });
    },

    rollNetrunnerZapAttack() {
      const target = blackIceTarget();
      noteAttackBreaksStealth('Zap');
      component.roll({ actorId: target.id, label: 'NETRUNNER :: ZAP VS BLACK ICE', sides: 10, count: 1, mod: interfaceRankFor(target), check: true, skipActionPenalty: true });
    },

    rollNetrunnerProgramVsIce(programId) {
      const target = blackIceTarget();
      const program = netrunningProgramById(programId);
      if (!program) return;
      noteAttackBreaksStealth(program.name);
      component.roll({ actorId: target.id, label: 'NETRUNNER :: ' + program.name.toUpperCase() + ' VS BLACK ICE', sides: 10, count: 1, mod: interfaceRankFor(target) + (Number(program.atk) || 0), check: true, skipActionPenalty: true });
    },

    damageBlackIceWithZap() {
      noteAttackBreaksStealth('Zap');
      damageBlackIce('ZAP DAMAGE :: BLACK ICE REZ', 1);
    },

    damageBlackIceWithProgram(programId) {
      const program = netrunningProgramById(programId);
      const dice = programAttackDamageDice(programId);
      if (!program || !dice) {
        component.flash && component.flash('Programa sem dano anti-Black ICE automatizado');
        return;
      }
      noteAttackBreaksStealth(program.name);
      damageBlackIce(program.name.toUpperCase() + ' DAMAGE :: BLACK ICE REZ', dice);
    },

    applyBlackIceEffect() {
      const state = ensureBlackIceState();
      const ice = state && blackIceById(state.id);
      if (!ice) return;
      const target = blackIceTarget();
      const dice = ice.damageDice;
      if (!dice) {
        const resolution = resolveBlackIceDamage(ice.id, 0, target.netPrograms, component.state.nexusBlackIceTargetProgramId);
        component.postChat({ kind: 'text', text: 'BLACK ICE :: ' + ice.name + ' :: ' + resolution.note });
        return;
      }
      component.roll({
        label: 'BLACK ICE :: ' + ice.name.toUpperCase() + ' EFFECT',
        sides: 6,
        count: dice.count,
        mod: 0,
        skipActionPenalty: true,
        onResolved: (result) => {
          const resolution = resolveBlackIceDamage(ice.id, result.total, target.netPrograms, component.state.nexusBlackIceTargetProgramId);
          if (target && target.id) component.applyCharacterPatch(target.id, { netPrograms: resolution.updatedPrograms });
          component.postChat({
            kind: 'text',
            text: 'BLACK ICE :: ' + ice.name + ' :: ' + resolution.note + (resolution.mitigation.length ? ' // ' + resolution.mitigation.join(' / ') : ''),
          });
        },
      });
    },

    startBreach() {
      clearInterval(component._gi);
      component.setState({ game: { active: true, pos: 4, dir: 1, breaches: 0, status: 'running', zoneLo: 38 + Math.random() * 20, zoneW: 18, speed: 1.7 } });
      component._gi = setInterval(() => {
        const g = component.state.game;
        if (!g.active) return;
        let { pos, dir, speed } = g; pos += dir * speed;
        if (pos >= 100) { pos = 100; dir = -1; } if (pos <= 0) { pos = 0; dir = 1; }
        component.state.game = { ...g, pos, dir };
        const marker = document.querySelector('[data-limiar-breach-marker="true"]');
        if (marker) marker.style.left = pos + '%';
      }, 26);
    },

    breachTap() {
      component.setState(s => {
        const g = s.game;
        const inZone = g.pos >= g.zoneLo && g.pos <= g.zoneLo + g.zoneW;
        if (inZone) {
          const b = g.breaches + 1;
          if (b >= 3) { clearInterval(component._gi); return { game: { ...g, active: false, breaches: b, status: 'win' } }; }
          return { game: { ...g, breaches: b, zoneLo: 20 + Math.random() * 50, zoneW: Math.max(10, g.zoneW - 3), speed: g.speed + 0.5 } };
        }
        clearInterval(component._gi);
        return { game: { ...g, active: false, status: 'fail' } };
      });
    },
  };
}

function nexusResultRawSummary(result) {
  if (!result) return 'NEXUS :: sem resultado';
  const player = result.playerName || 'OPERATIVO';
  if (result.outcome === 'win') return 'NEXUS :: ' + player + ' :: SISTEMA INVADIDO';
  if (result.reason === 'trace' || Number(result.trace) >= 100) return 'NEXUS :: ' + player + ' :: RASTREADO -- gancho Black ICE fase 2c';
  return 'NEXUS :: ' + player + ' :: CONEXAO CAIU, SEM RASTREIO';
}
