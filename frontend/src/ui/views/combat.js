import { CPRED_CRITICAL_INJURIES, CPRED_CRITICAL_INJURY_TABLE } from '../../domain/character/constants.ts';
import { evaluateRollTriggers as combatEvaluateRollTriggers } from '../../domain/combat/constants.ts';
import {
  defaultCombatState as combatDefaultState,
  normalizeCombatant as combatNormalizeCombatant,
  normalizeCombatState as combatNormalizeState,
  combatStatePatch as combatPatch,
  combatFirstActiveIndex as combatFirstIndex,
  currentCombatantId as combatCurrentId,
  combatRepairedTurnIndex as combatRepairTurnIndex,
  sortCombatOrder as combatSortOrder,
  combatSkillRow as combatSkillLookup,
  combatAttackMod as combatAttackCalculation,
  combatCheckMod as combatCheckCalculation,
  combatDamageContributions as combatDamageRows,
  parseCombatNpcAttacks as combatParseNpcAttacks,
  resolveFacedownContest as combatResolveFacedownContest,
} from '../../domain/combat/index.ts';
import { NPC_TEMPLATES, NPC_ATTACK_SKILL_OPTIONS, npcDraftFromTemplate } from '../../domain/combat/npcTemplates.ts';
import { resolveStabilizationDV } from '../../domain/combat/stabilizationEngine.ts';
import { weaponRangeBand } from '../../domain/combat/combatAttackEngine.ts';
import { netActionsPerTurn } from '../../domain/netrunning/index.ts';
import { weaponRollTone as viewWeaponRollTone } from '../view/constants.js';

// SYS.06 // COMBAT: turn order, per-combatant attack/damage/check rolls,
// initiative, the standard Critical Injury (2+ sixes) flow, situational
// attack-roll context toggles (cover/beyond51m/aimedShot), and NPC creation.
// addCriticalInjury/addStatusEffect stay in Component.js — shared with the
// Tarot draw flow and the sheet's Conditions tab (see sheet.js's note).
export function combatRenderVals(state = {}, deps = {}) {
  const S = state;
  const tx = deps.tx || {};

  const combatState = deps.normalizeCombatState(S.combatState);
  const combatCharacterById = new Map((S.characters || []).map(c => [c.id, deps.normalizeCharacter(c)]));
  const combatIds = combatState.order.filter(id => combatState.combatants[id]);
  Object.keys(combatState.combatants).forEach(id => { if (!combatIds.includes(id)) combatIds.push(id); });
  const currentCombatantId = deps.currentCombatantId(combatState);
  deps.ensureTurnTimer(currentCombatantId, combatState.active ? combatState.round : null);
  const combatCardFrom = (id) => {
    const character = combatCharacterById.get(id);
    const entry = combatState.combatants[id];
    if (!character || !entry) return null;
    const d = character.derived || deps.derivedStats(character.base, character);
    const critCount = (character.criticalInjuries || []).length;
    const statusCount = (character.statusEffects || []).length;
    const isCurrent = id === currentCombatantId;
    const turnTimerSeconds = isCurrent ? deps.turnTimerSeconds() : null;
    const initLabel = entry.initiative === null || entry.initiative === undefined ? '--' : String(entry.initiative);
    const defeatedStyle = entry.defeated ? 'text-decoration:line-through;text-decoration-thickness:2px;text-decoration-color:#c0635b;' : '';
    const kitGear = [...deps.normalizeGearList(character.gear || []), ...deps.installedCyberweaponGear(character)];
    const targetCandidates = deps.criticalInjuryTargetOptions(id);
    const selectedTargetId = deps.combatTargetFor(id);
    const selectedTarget = selectedTargetId ? combatCharacterById.get(selectedTargetId) : null;
    const targetShield = selectedTarget ? deps.normalizeShield(selectedTarget.shield) : null;
    const ownShield = deps.normalizeShield(character.shield);
    const weaponRows = kitGear.filter(item => deps.hasDamageProfile(item)).map(item => {
      const mod = deps.combatAttackMod(character, item);
      const cyberLabel = deps.cyberSourceBreakdown(mod.sources).join(' / ');
      const halfSpLabel = deps.ignoresHalfSpBadge(item) ? ' // ' + tx.halfSp : '';
      const enhLabel = item.enhancementSummary ? ' // ENH ' + item.enhancementSummary : '';
      const riderLabel = Array.isArray(item.riders) && item.riders.length ? ' // RIDER ' + item.riders.map(rider => rider.type || rider.note).filter(Boolean).join('/') : '';
      return {
        ...item,
        dmgLabel: deps.gearDamageText(item),
        modLabel: (mod.fallback ? 'REF' : mod.stat + ' + ' + mod.skillName) + ' = ' + mod.mod + (mod.fallback ? ' // SEM PERICIA' : '') + (cyberLabel ? ' // ' + cyberLabel : '') + halfSpLabel + enhLabel + riderLabel,
        fallback: mod.fallback,
        attack: () => deps.rollCombatAttack(id, item),
        damage: () => deps.rollCombatDamage(id, item),
        canShieldDamage: !!targetShield,
        shieldDamage: () => deps.rollCombatShieldDamage(id, item),
      };
    });
    const ctxAvail = deps.attackContextAvailable(character);
    const ctxState = deps.attackContextState();
    const attackToggles = [];
    if (ctxAvail.cover) attackToggles.push({ label: tx.ctxCover, style: deps.chipStyle(ctxState.cover), toggle: () => deps.toggleAttackContext('cover') });
    if (ctxAvail.beyond51m) attackToggles.push({ label: tx.ctxBeyond51m, style: deps.chipStyle(ctxState.beyond51m), toggle: () => deps.toggleAttackContext('beyond51m') });
    if (ctxAvail.aimedShot) attackToggles.push({ label: tx.ctxAimedShot, style: deps.chipStyle(ctxState.aimedShot), toggle: () => deps.toggleAttackContext('aimedShot') });
    // Who this combatant is aiming at — GM (or the player, for their own
    // attacks) picks it here; rollCombatAttack/rollCombatDamage read it back
    // via combatTargetFor() to label the roll, and it pre-fills the Critical
    // Injury flow's victim too.
    const targetOptions = targetCandidates.map(t => ({ id: t.id, name: t.name || t.id, selected: t.id === selectedTargetId, notSelected: t.id !== selectedTargetId }));
    const hasTargets = targetOptions.length > 0;
    const onTargetChange = (e) => deps.setCombatTarget(id, e.target.value);
    // NET Actions counter (CPR RAW): informational only, no enforcement —
    // the GM tracks/arbitrates spend, same as the rest of this cockpit.
    const netrunnerRank = String(character.role || '').toUpperCase() === 'NETRUNNER' ? (character.roleAbilityRank || 0) : 0;
    const netActions = { isNetrunner: netrunnerRank > 0, perTurn: netActionsPerTurn(netrunnerRank) };
    // Estabilizar (CPR RAW): reuses the same target picker as attacks — the
    // healer (this card) picks who they're treating, DV/allowed skill(s)
    // come from the target's current HP (combatStabilizationInfo).
    const stabInfo = selectedTargetId ? deps.combatStabilizationInfo(selectedTargetId) : { state: 'healthy', dv: null, allowedSkills: [] };
    const stabilizeTargetName = selectedTargetId ? ((S.characters || []).find(c => c.id === selectedTargetId) || {}).name || selectedTargetId : '';
    const stabilize = {
      hasTarget: !!selectedTargetId,
      targetName: stabilizeTargetName,
      needsStabilization: stabInfo.dv != null,
      stateLabel: stabInfo.state === 'mortallyWounded' ? 'MORTALLY WOUNDED' : stabInfo.state === 'seriouslyWounded' ? 'SERIOUSLY WOUNDED' : stabInfo.state === 'lightlyWounded' ? 'LIGHTLY WOUNDED' : '',
      dvLabel: stabInfo.dv != null ? 'DV ' + stabInfo.dv : '',
      canFirstAid: stabInfo.allowedSkills.includes('First Aid'),
      canParamedic: stabInfo.allowedSkills.includes('Paramedic'),
      rollFirstAid: () => deps.rollStabilize(id, selectedTargetId, 'First Aid'),
      rollParamedic: () => deps.rollStabilize(id, selectedTargetId, 'Paramedic'),
    };
    const utilityRows = kitGear.filter(item => !deps.hasDamageProfile(item) && (
      item.type.includes('CONSUMABLE') || item.type.includes('GRENADE') || item.type.includes('AMMO') || item.type.includes('MED') || item.qty > 1 || item.lastUsedAt
    )).map(item => ({
      ...item,
      qtyLabel: String(item.qty),
      hasDamage: !!(item.sides && item.count),
      damage: () => deps.rollCombatDamage(id, item),
      canShieldDamage: !!targetShield && !!(item.sides && item.count),
      shieldDamage: () => deps.rollCombatShieldDamage(id, item),
      use: () => deps.useCombatUtility(id, item.id),
    }));
    const checkNames = ['Evasion'];
    weaponRows.forEach(item => {
      const skill = deps.skillCanonicalName(item.skill);
      if (skill && !checkNames.includes(skill)) checkNames.push(skill);
    });
    const checkRows = checkNames.map(name => {
      const mod = deps.combatCheckMod(character, name);
      const cyberLabel = deps.cyberSourceBreakdown(mod.sources).join(' / ');
      return {
        name: deps.skillCanonicalName(name).toUpperCase(),
        meta: (mod.fallback ? 'REF' : mod.stat + ' + LV ' + mod.skillLevel) + ' = ' + mod.mod + (cyberLabel ? ' // ' + cyberLabel : ''),
        roll: () => deps.rollCombatCheck(id, name, deps.skillCanonicalName(name)),
      };
    });
    const hasKit = weaponRows.length || utilityRows.length || checkRows.length;
    const manuallyExpanded = (S.combatExpandedIds || []).includes(id);
    const expanded = isCurrent || manuallyExpanded;
    return {
      id,
      targetOptions,
      hasTargets,
      onTargetChange,
      expanded,
      collapsed: !expanded,
      expandLabel: expanded ? tx.collapseCard : tx.expandCard,
      toggleExpand: () => deps.setState(s => ({
        combatExpandedIds: (s.combatExpandedIds || []).includes(id)
          ? (s.combatExpandedIds || []).filter(x => x !== id)
          : [...(s.combatExpandedIds || []), id],
      })),
      name: character.name || id,
      role: character.role || (entry.side === 'enemy' ? 'NPC' : 'OPERATIVE'),
      side: entry.side === 'enemy' ? 'ENEMY' : 'PC',
      sideColor: entry.side === 'enemy' ? '#c0635b' : '#3fe0d0',
      hp: ((character.health && character.health.cur) || 0) + '/' + ((character.health && character.health.max) || d.hpMax || 0),
      hpPct: Math.max(0, Math.min(100, Math.round((((character.health && character.health.cur) || 0) / (((character.health && character.health.max) || d.hpMax || 1))) * 100))),
      headSp: d.currentHeadSp + '/' + d.headSp,
      bodySp: d.currentBodySp + '/' + d.bodySp,
      hasShield: !!ownShield,
      shieldHp: ownShield ? ownShield.hp + '/' + ownShield.maxHp : '',
      shieldStatus: ownShield ? (ownShield.hp <= 0 ? 'DESTRUIDO' : 'OCUPA BRACO') : '',
      shieldColor: ownShield && ownShield.hp <= 0 ? '#c0635b' : ownShield && ownShield.hp < ownShield.maxHp ? '#d6aa4e' : '#3fe0d0',
      conditions: critCount + 'CI / ' + statusCount + 'SE',
      psychosisLabel: d.cyberpsychosisExtreme ? 'PSICOSE EXTREMA' : d.cyberpsychosisActive ? 'PSICOSE' : '',
      hasPsychosis: !!(d.cyberpsychosisExtreme || d.cyberpsychosisActive),
      defeated: !!entry.defeated,
      defeatedLabel: entry.defeated ? tx.defeated : tx.active,
      initiativeValue: initLabel,
      initiativeInput: entry.initiative === null || entry.initiative === undefined ? '' : String(entry.initiative),
      acted: !!entry.acted,
      actedLabel: entry.acted ? tx.acted : tx.pending,
      actedColor: entry.acted ? '#3fe0d0' : '#d6aa4e',
      isCurrent,
      currentLabel: isCurrent ? tx.currentTurn : '',
      turnTimerLabel: isCurrent && turnTimerSeconds != null ? deps.formatTurnTimer(turnTimerSeconds) : '',
      turnTimerUrgent: isCurrent && turnTimerSeconds != null && turnTimerSeconds <= 10,
      turnTimerClass: 'lm-combat-turn-timer' + (isCurrent && turnTimerSeconds != null && turnTimerSeconds <= 10 ? ' lm-combat-turn-timer--urgent' : ''),
      nameStyle: "font:700 16px 'Chakra Petch',sans-serif;color:#f0ead8;letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" + defeatedStyle,
      orderNameStyle: "font:700 12px 'Chakra Petch',sans-serif;color:#f0ead8;letter-spacing:1px;max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" + defeatedStyle,
      cardStyle: "border:1px solid " + (isCurrent ? 'rgba(63,224,208,.62)' : entry.defeated ? 'rgba(192,99,91,.5)' : 'rgba(214,170,78,.22)') + ";border-left:3px solid " + (isCurrent ? '#3fe0d0' : entry.side === 'enemy' ? '#c0635b' : '#3fe0d0') + ";background:" + (isCurrent ? 'rgba(63,224,208,.075)' : '#0b0e0a') + ";padding:" + (expanded ? '13px' : '10px 13px') + ";opacity:" + (entry.defeated ? '.62' : '1') + ";box-shadow:" + (isCurrent ? '0 0 0 1px rgba(63,224,208,.18) inset' : 'none') + ";",
      orderStyle: "display:flex;flex-direction:column;align-items:center;gap:5px;min-width:104px;flex:0 0 auto;text-align:center;border:1px solid " + (isCurrent ? 'rgba(63,224,208,.5)' : 'rgba(214,170,78,.12)') + ";border-top:3px solid " + (isCurrent ? '#3fe0d0' : entry.side === 'enemy' ? '#c0635b' : '#3fe0d0') + ";background:" + (isCurrent ? 'rgba(63,224,208,.075)' : '#080a07') + ";padding:10px 8px;opacity:" + (entry.defeated ? '.58' : '1') + ";",
      weaponRows,
      utilityRows,
      checkRows,
      attackToggles,
      hasAttackToggles: attackToggles.length > 0,
      hasWeapons: weaponRows.length > 0,
      hasUtility: utilityRows.length > 0,
      hasChecks: checkRows.length > 0,
      hasKit,
      noKit: !hasKit,
      stabilize,
      netActions,
      onInitiativeInput: (e) => deps.setInitiative(id, e.target.value),
      initiativePending: combatState.active && (entry.initiative === null || entry.initiative === undefined) && character.kind !== 'npc',
      rollOwnInitiative: () => deps.rollFromRequest({ label: 'INICIATIVA', sides: 10, count: 1, mod: deps.combatRef(id), combatantId: id, initiative: true }),
      rollFacedown: () => deps.rollFromRequest({ label: 'FACEDOWN', sides: 10, count: 1, mod: deps.combatFacedownMod(id), combatantId: id }),
      canFacedownContest: !!selectedTarget,
      rollFacedownContested: () => deps.rollCombatFacedownContested(id),
      toggleDefeated: () => deps.toggleDefeated(id),
      removeCombatant: () => deps.removeCombatant(id),
    };
  };
  const combatRows = combatIds.map(id => combatCardFrom(id)).filter(Boolean);
  const ownCombatId = S.activeCharacterId;
  const ownCombatCard = combatCardFrom(ownCombatId);
  const combatPlayerCards = ownCombatCard ? [ownCombatCard] : [];
  const combatAvailablePcs = (S.characters || []).filter(c => c.kind !== 'npc' && !combatState.combatants[c.id]);
  const combatAvailableNpcs = (S.characters || []).filter(c => c.kind === 'npc' && !combatState.combatants[c.id]);
  // Checkbox-style PC picker: every player character is shown with portrait +
  // name; toggling adds/removes them from the combat roster in one tap.
  const combatPcToggleRows = (S.characters || [])
    .filter(c => c.kind !== 'npc')
    .map(c => {
      const inCombat = !!combatState.combatants[c.id];
      return {
        id: c.id,
        name: c.name || c.id,
        initials: c.initials || (c.name || 'OP').slice(0, 2),
        portraitUrl: c.portraitUrl || '',
        hasPortrait: !!c.portraitUrl,
        noPortrait: !c.portraitUrl,
        inCombat,
        notInCombat: !inCombat,
        mark: inCombat ? '✓' : '',
        style: "display:flex;align-items:center;gap:9px;width:100%;min-width:0;text-align:left;cursor:pointer;padding:7px 9px;border:1px solid "
          + (inCombat ? '#3fe0d0' : 'rgba(63,224,208,.22)')
          + ";background:" + (inCombat ? 'rgba(63,224,208,.12)' : 'rgba(63,224,208,.03)') + ";",
        toggle: () => { if (inCombat) deps.removeCombatant(c.id); else deps.addCombatant(c.id, 'pc'); },
      };
    });
  const combatHasPcs = combatPcToggleRows.length > 0;
  const combatPcOptions = [{ id: '', name: 'SELECIONE PC', selected: !S.combatAddPcId, notSelected: !!S.combatAddPcId }]
    .concat(combatAvailablePcs.map(c => ({ id: c.id, name: c.name || c.id, selected: c.id === S.combatAddPcId, notSelected: c.id !== S.combatAddPcId })));
  const combatNpcOptions = [{ id: '', name: 'SELECIONE NPC', selected: !S.combatAddNpcId, notSelected: !!S.combatAddNpcId }]
    .concat(combatAvailableNpcs.map(c => ({ id: c.id, name: c.name || c.id, selected: c.id === S.combatAddNpcId, notSelected: c.id !== S.combatAddNpcId })));
  const combatNpcDraft = S.combatNpcDraft || {};
  const combatPlayerOrderRows = combatRows.map(c => ({
    id: c.id,
    name: c.name,
    side: c.side,
    sideColor: c.sideColor,
    initiativeValue: c.initiativeValue,
    actedLabel: c.actedLabel,
    actedColor: c.actedColor,
    defeatedLabel: c.defeatedLabel,
    currentLabel: c.currentLabel,
    orderStyle: c.orderStyle,
    orderNameStyle: c.orderNameStyle,
  }));
  const currentCombatant = combatRows.find(c => c.id === currentCombatantId) || null;
  const combatRoundLabel = tx.round + ' ' + combatState.round;
  const combatTurnLabel = currentCombatant ? (tx.turn + ' :: ' + currentCombatant.name) : (tx.turn + ' :: --');
  // GM-fixed turn timer: lives once in the combat header (not per-card, so it
  // never jumps around the roster as the turn advances). tickTurnTimer()
  // already updates every element sharing data-limiar-turn-timer via
  // querySelectorAll, so this slots into the same live-update mechanism.
  const headerTimerSeconds = combatState.active && currentCombatantId ? deps.turnTimerSeconds() : null;
  const hasCombatHeaderTimer = headerTimerSeconds != null;
  const combatHeaderTimerLabel = hasCombatHeaderTimer ? deps.formatTurnTimer(headerTimerSeconds) : '';
  const combatHeaderTimerClass = 'lm-combat-turn-timer lm-combat-turn-timer--header' + (hasCombatHeaderTimer && headerTimerSeconds <= 10 ? ' lm-combat-turn-timer--urgent' : '');
  const critPending = S.critInjuryPending;
  const critInjuryPending = critPending ? {
    title: tx.critInjuryPendingTitle + ' :: ' + critPending.actorName + ' :: ' + critPending.weaponLabel,
    area: !!critPending.area,
    singleMode: !critPending.area,
    areaHint: tx.critInjuryAreaHint,
    bodyActive: critPending.location !== 'head',
    headActive: critPending.location === 'head',
    bodyClass: 'lm-ui-btn lm-ui-btn--compact ' + (critPending.location !== 'head' ? 'lm-ui-btn--danger' : 'lm-ui-btn--ghost-danger'),
    headClass: 'lm-ui-btn lm-ui-btn--compact ' + (critPending.location === 'head' ? 'lm-ui-btn--danger' : 'lm-ui-btn--ghost-danger'),
    setBody: () => deps.setCriticalInjuryLocation('body'),
    setHead: () => deps.setCriticalInjuryLocation('head'),
    targetOptions: deps.criticalInjuryTargetOptions(critPending.actorId).map(c => ({
      id: c.id, name: c.name || c.id, selected: c.id === critPending.targetId, notSelected: c.id !== critPending.targetId,
    })),
    onTargetChange: (e) => deps.setCriticalInjuryTarget(e.target.value),
    areaTargetRows: deps.criticalInjuryTargetOptions(critPending.actorId).map(c => {
      const checked = (critPending.targetIds || []).includes(c.id);
      return { id: c.id, name: c.name || c.id, checked, notChecked: !checked, toggle: () => deps.toggleCriticalInjuryAreaTarget(c.id) };
    }),
    rollLabel: tx.critInjuryRollTable,
    rollTable: () => deps.rollCriticalInjuryTable(),
    cancelLabel: tx.critInjuryCancel,
    cancel: () => deps.cancelCriticalInjuryPending(),
  } : null;
  const facedownContest = S.combatFacedownContest;
  const facedownContestPending = facedownContest ? {
    actorName: deps.combatantSummaryName(facedownContest.actorId),
    targetName: deps.combatantSummaryName(facedownContest.targetId),
    actorLine: deps.combatantSummaryName(facedownContest.actorId) + ' :: ' + facedownContest.actorRoll + ' (' + facedownContest.actorTotal + ')',
    targetLine: deps.combatantSummaryName(facedownContest.targetId) + ' :: ' + facedownContest.targetRoll + ' (' + facedownContest.targetTotal + ')',
    isTie: !facedownContest.winnerId,
    winnerName: facedownContest.winnerId ? deps.combatantSummaryName(facedownContest.winnerId) : '',
    loserName: facedownContest.loserId ? deps.combatantSummaryName(facedownContest.loserId) : '',
    canApply: !!facedownContest.loserId,
    applyLoss: () => deps.applyCombatFacedownLoss(),
    dismiss: () => deps.dismissCombatFacedownContest(),
  } : null;
  const combatRollFeed = (S.comms || []).filter(m => (m.kind === 'roll' && m.roll) || (m.kind === 'text' && /^INICIATIVA ::/.test(m.text || ''))).slice(-20).reverse().map(m => {
    if (m.kind === 'text') {
      return { name: m.sender || 'MESTRE', text: m.text || '', t: m.at || '' };
    }
    const o = m.roll.outcome ? ' / ' + m.roll.outcome : '';
    return {
      name: m.sender || 'OPERATIVO',
      text: (m.roll.label || 'ROLL') + ' :: ' + (m.roll.detail || '') + ' = ' + m.roll.total + o,
      t: m.at || '',
    };
  });

  // --- GM Cockpit: focus dock + initiative rail (battle mode only) ---
  // The dock always shows exactly one combatant's kit. It defaults to
  // whoever's turn it is, but the GM can pin a different one by clicking a
  // rail pill; an invalid/stale pin (combatant removed, defeated and combat
  // moved on) silently falls back to the current turn rather than showing
  // nothing.
  const focusCandidate = String(S.combatFocusId || '');
  const focusValid = !!focusCandidate && combatRows.some(c => c.id === focusCandidate);
  const resolvedFocusId = focusValid ? focusCandidate : (currentCombatantId || (combatRows[0] && combatRows[0].id) || '');
  const combatFocusCard = combatRows.find(c => c.id === resolvedFocusId) || null;
  const combatRailRows = combatRows.map(c => {
    const isFocused = c.id === resolvedFocusId;
    return {
      id: c.id,
      name: c.name,
      sideColor: c.sideColor,
      initiativeValue: c.initiativeValue,
      hp: c.hp,
      hpPct: c.hpPct,
      defeated: c.defeated,
      isCurrent: c.isCurrent,
      isFocused,
      actedColor: c.actedColor,
      actedLabel: c.actedLabel,
      pillStyle: "display:flex;flex-direction:column;gap:4px;min-width:112px;flex:0 0 auto;text-align:left;cursor:pointer;padding:8px 10px;border:1px solid "
        + (isFocused ? '#3fe0d0' : c.isCurrent ? 'rgba(63,224,208,.45)' : 'rgba(214,170,78,.18)')
        + ";border-left:3px solid " + c.sideColor + ";background:" + (isFocused ? 'rgba(63,224,208,.12)' : c.isCurrent ? 'rgba(63,224,208,.05)' : '#0a0c09') + ";opacity:" + (c.defeated ? '.5' : '1') + ";",
      focus: () => deps.setCombatFocus(c.id),
    };
  });
  const combatSetupMode = !!S.gm && !combatState.active;
  const combatBattleMode = !!S.gm && combatState.active;
  const combatReinforceOpen = !!S.combatReinforceOpen;
  const toggleReinforceDrawer = () => deps.setState(s => ({ combatReinforceOpen: !s.combatReinforceOpen }));

  // --- NPC builder: preset chips + structured attack rows (replaces the
  // old free-text "nome|2d6|Handgun per line" textarea) ---
  const npcTemplateChips = NPC_TEMPLATES.map(t => ({
    id: t.id,
    label: t.label,
    active: combatNpcDraft.templateId === t.id,
    style: 'lm-ui-btn lm-ui-btn--compact ' + (combatNpcDraft.templateId === t.id ? 'lm-ui-btn--danger' : 'lm-ui-btn--ghost-danger'),
    apply: () => deps.applyNpcTemplate(t.id),
  }));
  const npcAttackRowsSrc = combatNpcDraft.attackRows && combatNpcDraft.attackRows.length ? combatNpcDraft.attackRows : [{ name: '', dice: '2d6', skill: 'Handgun' }];
  const combatNpcAttackRows = npcAttackRowsSrc.map((row, idx) => ({
    idx,
    name: row.name || '',
    dice: row.dice || '',
    skill: row.skill || '',
    skillOptions: NPC_ATTACK_SKILL_OPTIONS.map(s => ({ id: s, name: s, selected: s === row.skill, notSelected: s !== row.skill })),
    onName: (e) => deps.updateNpcAttackRow(idx, 'name', e.target.value),
    onDice: (e) => deps.updateNpcAttackRow(idx, 'dice', e.target.value),
    onSkill: (e) => deps.updateNpcAttackRow(idx, 'skill', e.target.value),
    remove: () => deps.removeNpcAttackRow(idx),
    canRemove: npcAttackRowsSrc.length > 1,
  }));

  return {
    showCombatAccess: S.gm || combatState.active,
    combatState,
    combatActive: combatState.active,
    combatInactive: !combatState.active,
    combatSetupMode,
    combatBattleMode,
    combatRows,
    combatRailRows,
    combatFocusCard,
    hasCombatFocusCard: !!combatFocusCard,
    combatReinforceOpen,
    combatNoReinforceOpen: !combatReinforceOpen,
    toggleReinforceDrawer,
    combatPlayerOrderRows,
    combatPlayerCards,
    combatHasRows: combatRows.length > 0,
    combatNoRows: combatRows.length === 0,
    combatRoundLabel,
    combatTurnLabel,
    hasCombatHeaderTimer,
    combatHeaderTimerLabel,
    combatHeaderTimerClass,
    critInjuryPending,
    hasCritInjuryPending: !!critInjuryPending,
    facedownContestPending,
    hasFacedownContestPending: !!facedownContestPending,
    currentCombatantId,
    currentCombatant,
    combatHasOwnCard: combatPlayerCards.length > 0,
    combatNoOwnCard: combatPlayerCards.length === 0,
    combatPcOptions,
    combatPcToggleRows,
    combatHasPcs,
    combatNoPcs: !combatHasPcs,
    combatNpcOptions,
    combatAddPcId: S.combatAddPcId,
    combatAddNpcId: S.combatAddNpcId,
    onCombatAddPc: (e) => deps.setState({ combatAddPcId: e.target.value }),
    onCombatAddNpc: (e) => deps.setState({ combatAddNpcId: e.target.value }),
    addSelectedCombatPc: () => { if (S.combatAddPcId) { deps.addCombatant(S.combatAddPcId, 'pc'); deps.setState({ combatAddPcId: '' }); } },
    addSelectedCombatNpc: () => { if (S.combatAddNpcId) { deps.addCombatant(S.combatAddNpcId, 'enemy'); deps.setState({ combatAddNpcId: '' }); } },
    startCombat: () => deps.startCombat(),
    endCombat: () => deps.endCombat(),
    rollInitiative: () => deps.rollInitiative(),
    nextTurn: () => deps.nextTurn(),
    endMyTurn: () => deps.endMyTurn(),
    prevTurn: () => deps.prevTurn(),
    npcTemplateChips,
    combatNpcName: combatNpcDraft.name || '',
    combatNpcBody: combatNpcDraft.body || '',
    combatNpcRef: combatNpcDraft.ref || '',
    combatNpcHpMax: combatNpcDraft.hpMax || '',
    combatNpcHeadSp: combatNpcDraft.headSp || '',
    combatNpcBodySp: combatNpcDraft.bodySp || '',
    combatNpcQty: combatNpcDraft.qty || '1',
    combatNpcAttackRows,
    onCombatNpcName: (e) => deps.setState({ combatNpcDraft: { ...(S.combatNpcDraft || {}), name: e.target.value, templateId: '' } }),
    onCombatNpcBody: (e) => deps.setState({ combatNpcDraft: { ...(S.combatNpcDraft || {}), body: e.target.value } }),
    onCombatNpcRef: (e) => deps.setState({ combatNpcDraft: { ...(S.combatNpcDraft || {}), ref: e.target.value } }),
    onCombatNpcHpMax: (e) => deps.setState({ combatNpcDraft: { ...(S.combatNpcDraft || {}), hpMax: e.target.value } }),
    onCombatNpcHeadSp: (e) => deps.setState({ combatNpcDraft: { ...(S.combatNpcDraft || {}), headSp: e.target.value } }),
    onCombatNpcBodySp: (e) => deps.setState({ combatNpcDraft: { ...(S.combatNpcDraft || {}), bodySp: e.target.value } }),
    onCombatNpcQty: (e) => deps.setState({ combatNpcDraft: { ...(S.combatNpcDraft || {}), qty: e.target.value } }),
    addNpcAttackRow: () => deps.addNpcAttackRow(),
    createCombatNpc: () => deps.createCombatNpc(),
    combatRollFeed,
    combatHasRolls: combatRollFeed.length > 0,
    combatNoRolls: combatRollFeed.length === 0,
  };
}

// component: the Component instance. state/setState/api/app/ensureGm/flash/
// activeCharacter/normalizeCharacter/normalizeStats/normalizeSkills/asNumber/
// slug/normalizeGearList/normalizeGearItem/updateCharacterById/postChat/roll/
// tx/derivedStats/installedCyberware/cyberwareBonuses/parseGearDamage/
// cyberweaponRollContext/cyberwareStatModBonus/skillCyberwareBonus/
// weaponRuntimeAttackMod/weaponRuntimeQuality/gorillaTungstenProfile/
// damageScaleProfile/tarotHandlers/addCriticalInjury already live there
// (shared well beyond the combat view).
export function combatHandlers(component) {
  function combatDomainOptions(extra = {}) {
    return {
      roster: component.state.characters || [],
      combatRef: (id) => combatRef(id),
      normalizeCharacter: (character) => component.normalizeCharacter(character),
      derivedStats: (base, character) => component.derivedStats(base, character),
      statBonus: (stat, character) => component.cyberwareStatModBonus(stat, character),
      skillBonus: (skill, character) => component.skillCyberwareBonus(skill, character),
      weaponAttackMod: (weapon) => component.weaponRuntimeAttackMod(weapon),
      weaponQuality: (weapon) => component.weaponRuntimeQuality(weapon),
      damageProfile: (weapon, actor) => component.gorillaTungstenProfile(weapon) || component.damageScaleProfile(weapon, actor),
      ...extra,
    };
  }
  function defaultCombatState() { return combatDefaultState(); }
  function normalizeCombatant(entry, side) { return combatNormalizeCombatant(entry, side); }
  function normalizeCombatState(payload, roster) { return combatNormalizeState(payload, roster || component.state.characters || []); }
  function combatStatePatch(state) { return combatPatch(state, component.state.characters || []); }
  async function ensureCombatState(payload, roster) {
    const isFresh = !payload;
    const state = normalizeCombatState(payload || defaultCombatState(), roster);
    const rawIds = payload && payload.combatants && typeof payload.combatants === 'object' ? Object.keys(payload.combatants) : [];
    const pruned = rawIds.length !== Object.keys(state.combatants).length;
    if ((isFresh || pruned) && component.api() && component.api().combat && component.api().combat.state) {
      try {
        await component.api().combat.state.set({ ...state, updatedAt: new Date().toISOString() });
      } catch (_) {
        // A non-GM/static session can still render; GM persistence remains the source of truth.
      }
    }
    return state;
  }
  async function saveCombatState(nextState, options = {}) {
    const state = normalizeCombatState({ ...nextState, updatedAt: new Date().toISOString() });
    const combatApi = component.api() && component.api().combat && component.api().combat.state;
    if (combatApi) {
      try {
        await combatApi.set(state);
      } catch (err) {
        if (!options.allowLocal) {
          component.flash('Falha ao persistir combate: ' + err.message, 3200);
          return null;
        }
      }
    }
    component.setState(combatStatePatch(state));
    return state;
  }
  function combatCharacter(characterId) {
    const id = String(characterId || '');
    return (component.state.characters || []).find(c => c && c.id === id) || null;
  }
  function combatRef(characterId) {
    const character = combatCharacter(characterId);
    return component.asNumber(character && character.base && character.base.REF, 0, 0, 99);
  }
  // Facedown (CPR RAW): COOL + REP + 1d10, opposed roll. Resolution (recuar
  // ou -2 em acoes ate derrotar o oponente) is a manual GM call — this only
  // rolls the check, same seam as combatRef/rollOwnInitiative.
  function combatFacedownMod(characterId) {
    const character = combatCharacter(characterId);
    const cool = component.asNumber(character && character.base && character.base.COOL, 0, 0, 99);
    const reputation = component.asNumber(character && character.reputation, 0, 0, 10);
    return cool + reputation;
  }
  // Facedown contested: rolls both sides at once (actor vs the actor's
  // selected target) and publishes both rolls + the winner to chat. Applying
  // the facedown_lost status to the loser stays a separate, explicit GM
  // action (rollCombatFacedownContested only reports the result) — the
  // loser may choose to back down instead of eating the penalty, RAW.
  function rollCombatFacedownContested(actorId) {
    if (!canRollCombatActor(actorId)) return component.flash('Voce so pode rolar pelo seu proprio combatente');
    const targetId = combatTargetFor(actorId);
    if (!targetId) return component.flash('Selecione um alvo para o Facedown');
    const result = combatResolveFacedownContest(
      actorId, combatFacedownMod(actorId),
      targetId, combatFacedownMod(targetId),
    );
    const actorName = combatantSummaryName(actorId);
    const targetName = combatantSummaryName(targetId);
    const outcome = result.winnerId ? (combatantSummaryName(result.winnerId) + ' VENCE') : 'EMPATE // NADA ACONTECE';
    component.postChat({
      kind: 'text',
      sender: 'MESTRE',
      text: 'FACEDOWN :: ' + actorName + ' ' + result.actorRoll + '+' + combatFacedownMod(actorId) + '=' + result.actorTotal
        + ' vs ' + targetName + ' ' + result.targetRoll + '+' + combatFacedownMod(targetId) + '=' + result.targetTotal
        + ' :: ' + outcome,
    });
    component.setState({ combatFacedownContest: { actorId, targetId, ...result } });
  }
  function applyCombatFacedownLoss() {
    const pending = component.state.combatFacedownContest;
    if (!pending || !pending.loserId) return;
    component.addStatusEffect('facedown_lost', { targetId: pending.loserId, source: 'facedown' });
    component.postChat({
      kind: 'text',
      sender: 'SISTEMA',
      text: combatantSummaryName(pending.loserId) + ' :: FACEDOWN PERDIDO APLICADO (-2 ate derrotar o oponente)',
    });
    component.setState({ combatFacedownContest: null });
  }
  function dismissCombatFacedownContest() {
    component.setState({ combatFacedownContest: null });
  }
  function combatFirstActiveIndex(order, combatants) { return combatFirstIndex(order, combatants); }
  function currentCombatantId(state = component.state.combatState) {
    return combatCurrentId(state, component.state.characters || []);
  }
  function combatRepairedTurnIndex(state, preferredId) {
    return combatRepairTurnIndex(state, preferredId, component.state.characters || []);
  }
  function sortCombatOrder(state) {
    return combatSortOrder(state, combatDomainOptions());
  }
  function combatantSummaryName(characterId) {
    const character = combatCharacter(characterId);
    return (character && character.name) || String(characterId || '???');
  }
  function canRollCombatActor(actorId) {
    return !!(component.state.gm || String(actorId || '') === String(component.state.activeCharacterId || ''));
  }
  function combatSkillRow(character, skillName) { return combatSkillLookup(character, skillName, combatDomainOptions()); }
  function combatAttackMod(character, weapon) {
    return combatAttackCalculation(character, weapon, combatDomainOptions());
  }
  function combatCheckMod(character, skillName) {
    return combatCheckCalculation(character, skillName, combatDomainOptions());
  }
  function combatGmRollReporter(actor) {
    if (!component.state.gm) return null;
    const sender = (actor && actor.name) || 'OPERATIVO';
    return (result) => component.postChat({
      kind: 'roll',
      sender,
      text: '',
      roll: { label: result.label, detail: result.detail, total: result.total, outcome: result.outcome },
    });
  }
  // Target name suffix for attack/damage roll labels, e.g. " :: ALVO ROOK".
  // Empty when there's no one else in the fight to aim at yet.
  function combatTargetLabelSuffix(actorId) {
    const targetId = combatTargetFor(actorId);
    if (!targetId) return '';
    const target = combatCharacter(targetId);
    return target ? ' :: ALVO ' + (target.name || targetId).toUpperCase() : '';
  }
  function rollCombatAttack(actorId, weapon) {
    if (!canRollCombatActor(actorId)) return component.flash('Voce so pode rolar pelo seu proprio combatente');
    const mapContext = (component.state.mapAttackContexts || {})[actorId] || null;
    if (mapContext) {
      const current = currentCombatantId(component.state.combatState);
      if (current !== actorId || combatTargetFor(actorId) !== mapContext.targetCharacterId) {
        component.setState(s => ({ mapAttackContexts: { ...(s.mapAttackContexts || {}), [actorId]: null } }));
        return component.flash('Medida de ataque expirou: confirme alvo e turno novamente');
      }
    }
    const range = mapContext ? weaponRangeBand(weapon, mapContext.rangeMeters) : null;
    const hasCustomRangeTable = !!(weapon && weapon.rangeTable && typeof weapon.rangeTable === 'object' && weapon.rangeTable.custom);
    if (mapContext && hasCustomRangeTable && !range) return component.flash('Esta arma nao possui uma banda valida para a distancia medida');
    const actor = combatCharacter(actorId) || component.activeCharacter();
    const mod = combatAttackMod(actor, weapon);
    const ctx = cyberContextToHit(actor);
    component.roll({
      actorId,
      check: true,
      sides: 10,
      count: 1,
      mod: mod.mod + ctx.mod,
      ...(range ? { dv: range.dv } : {}),
      breakdown: component.cyberSourceBreakdown(mod.sources.concat(ctx.sources)).concat(range ? [`RANGE ${mapContext.rangeMeters}m // ${range.range} // DV ${range.dv}`] : []),
      label: (((actor.name || 'OPERATIVO') + ' :: ' + ((weapon && weapon.name) || 'ARMA') + ' ATAQUE').toUpperCase()) + combatTargetLabelSuffix(actorId),
      onResolved: (result) => { const reporter = combatGmRollReporter(actor); if (reporter) reporter(result); if (mapContext) component.setState(s => ({ mapAttackContexts: { ...(s.mapAttackContexts || {}), [actorId]: null } })); },
    });
    // Per-roll reset: to-hit toggles are consumed by this attack.
    setAttackContext({ beyond51m: false, aimedShot: false });
  }
  function rollCombatDamage(actorId, weapon) {
    if (!canRollCombatActor(actorId)) return component.flash('Voce so pode rolar pelo seu proprio combatente');
    const actor = combatCharacter(actorId) || component.activeCharacter();
    const reporter = combatGmRollReporter(actor);
    const cover = cyberContextDamage(actor);
    const baseBreakdown = weapon && weapon.enhancementSummary ? ['ENH ' + weapon.enhancementSummary] : [];
    const contributions = combatDamageContributions(weapon, cover.contributions, actor);
    component.roll({
      actorId,
      sides: weapon && weapon.sides,
      count: weapon && weapon.count,
      mod: 0,
      rollScope: 'damage',
      contributions,
      breakdown: baseBreakdown,
      enhancementContext: component.cyberweaponRollContext(weapon),
      label: (((actor.name || 'OPERATIVO') + ' :: ' + ((weapon && weapon.name) || 'ARMA') + ' DANO').toUpperCase()) + combatTargetLabelSuffix(actorId),
      onResolved: (result) => {
        if (reporter) reporter(result);
        postDamageRollTracking(actor, result, weapon);
        autoApplyCombatDamage(actorId, weapon, result);
        evaluateRollTriggers(result, weapon).forEach(match => {
          postRollTriggerMarker(actorId, actor, match);
          // Critical Injury keeps its own GM-confirm + animated 2d6 table
          // roll (handleCriticalInjuryTrigger/rollCriticalInjuryTable) — a
          // deliberate UX gate, not replaced by the auto-apply above (which
          // only handles the base damage-vs-armor-vs-HP math).
          if (match.rule.id === 'tarotDraw') handleTarotSixTrigger(actorId, weapon);
          else if (match.rule.id === 'criticalInjury') handleCriticalInjuryTrigger(actorId, weapon);
        });
      },
    });
    // Per-roll reset: the cover toggle is consumed by this damage roll.
    setAttackContext({ cover: false });
  }

  function rollCombatShieldDamage(actorId, weapon) {
    if (!canRollCombatActor(actorId)) return component.flash('Voce so pode rolar pelo seu proprio combatente');
    const targetId = combatTargetFor(actorId);
    if (!targetId) return component.flash('Selecione um alvo com escudo');
    const target = component.normalizeCharacter(combatCharacter(targetId) || {});
    if (!component.normalizeShield(target.shield)) return component.flash('Alvo sem escudo equipado');
    const actor = combatCharacter(actorId) || component.activeCharacter();
    const reporter = combatGmRollReporter(actor);
    const cover = cyberContextDamage(actor);
    const baseBreakdown = ['ESCUDO: sem SP/ablacao'].concat(weapon && weapon.enhancementSummary ? ['ENH ' + weapon.enhancementSummary] : []);
    const contributions = combatDamageContributions(weapon, cover.contributions, actor);
    component.roll({
      actorId,
      sides: weapon && weapon.sides,
      count: weapon && weapon.count,
      mod: 0,
      rollScope: 'damage',
      contributions,
      breakdown: baseBreakdown,
      enhancementContext: component.cyberweaponRollContext(weapon),
      label: (((actor.name || 'OPERATIVO') + ' :: ' + ((weapon && weapon.name) || 'ARMA') + ' DANO NO ESCUDO').toUpperCase()) + combatTargetLabelSuffix(actorId),
      onResolved: (result) => {
        if (reporter) reporter(result);
        postDamageRollTracking(actor, result, weapon);
        applyCombatShieldDamage(target.id, result.total);
      },
    });
    setAttackContext({ cover: false });
  }

  function applyCombatShieldDamage(targetId, amount) {
    const target = component.normalizeCharacter(combatCharacter(targetId) || {});
    const shield = component.normalizeShield(target.shield);
    if (!target.id || !shield) return;
    const damage = component.asNumber(amount, 0, 0, 999);
    if (!damage) return;
    const soaked = Math.min(shield.hp, damage);
    const overflow = Math.max(0, damage - shield.hp);
    const nextShield = component.damageShield(shield, damage);
    component.setState(s => ({
      characters: (s.characters || []).map(c => c.id === target.id ? component.normalizeCharacter({ ...c, shield: nextShield }) : c),
    }));
    component.postChat({
      kind: 'text',
      sender: 'SISTEMA',
      text: (target.name || 'ALVO') + ' :: ESCUDO -' + damage + ' // HP ' + nextShield.hp + '/' + nextShield.maxHp + (nextShield.hp <= 0 ? ' // DESTRUIDO' : '') + (overflow ? ' // EXCESSO ' + overflow + ' A CRITERIO DO GM' : '') + (soaked ? ' // ABSORVIDO ' + soaked : ''),
    });
  }

  // Auto-applies HP loss + armor SP ablation from an already-rolled damage
  // result to the actor's selected target, via application/ApplyCombatDamage.
  // No-op when no target is selected (matches the pre-P9 behavior of simply
  // logging the roll for the GM to act on).
  function autoApplyCombatDamage(actorId, weapon, result) {
    const targetId = combatTargetFor(actorId);
    if (!targetId) return;
    const target = component.normalizeCharacter(combatCharacter(targetId) || {});
    if (!target.id) return;
    const location = component.state.attackContext && component.state.attackContext.aimedShot ? 'head' : 'body';
    const currentSp = location === 'head' ? target.derived.currentHeadSp : target.derived.currentBodySp;
    const applied = component.app().applyCombatDamage.execute({
      weapon,
      target,
      location,
      currentSp,
      result,
      installedCyberware: (character) => component.installedCyberware(character),
      autoResolveCriticalInjury: false,
    });
    if (!applied.characterPatch) return;
    component.setState(s => ({
      characters: (s.characters || []).map(c => c.id === target.id ? component.normalizeCharacter({ ...c, ...applied.characterPatch }) : c),
    }));
    component.postChat({
      kind: 'text',
      sender: 'SISTEMA',
      text: (target.name || 'ALVO') + ' :: HP -' + applied.hpLoss + (applied.spAblated ? ' // armadura ablada -1' : ''),
    });
  }
  function combatDamageContributions(weapon, bonusContributions, actor) {
    return combatDamageRows(weapon, bonusContributions, combatDomainOptions({ actor }));
  }
  function weaponRollTone(weapon) {
    return viewWeaponRollTone(weapon);
  }
  function postDamageRollTracking(actor, result, weapon) {
    const contributions = Array.isArray(result && result.contributions) ? result.contributions : [];
    const dice = Array.isArray(result && result.dice) ? result.dice : [];
    if (!contributions.length || !dice.length) return;
    const tone = weaponRollTone(weapon);
    const lines = contributions.map((row, idx) => {
      const rowDice = dice.filter(die => die.contributionIndex === idx);
      const faces = rowDice.map(die => die.value);
      const subtotal = faces.reduce((sum, face) => sum + face, 0) + (Number(row.mod) || 0);
      const modTxt = row.mod ? (row.mod > 0 ? '+' + row.mod : String(row.mod)) : '';
      const kind = row.kind === 'base' ? 'BASE' : 'BONUS';
      const reason = String(row.reason || '').trim();
      const repeatedBase = row.kind === 'base' && reason.toLowerCase() === 'weapon base';
      const reasonTxt = reason && !repeatedBase ? ' :: ' + reason : '';
      return row.source + ' :: ' + kind + reasonTxt + ' :: ' + row.count + 'd' + row.sides + modTxt + ' :: ROLLS ' + faces.join(', ') + ' :: SUBTOTAL ' + subtotal;
    });
    component.postChat({
      kind: 'text',
      sender: 'SISTEMA',
      text: 'DAMAGE TRACKING :: ' + tone.label + ' :: ' + ((actor && actor.name) || 'OPERATIVO') + '\n' + lines.join('\n') + '\nTOTAL :: ' + (result && result.total),
    });
  }
  function evaluateRollTriggers(result) {
    return combatEvaluateRollTriggers(result);
  }
  function postRollTriggerMarker(actorId, actor, match) {
    const rule = match.rule;
    const name = (actor && actor.name) || 'OPERATIVO';
    const dice = match.matched.map(die => die.source + ' d' + die.sides + '=' + die.value).join('; ');
    component.postChat({
      kind: 'text',
      text: rule.label + ' TRIGGER :: ' + name + ' :: ' + match.matched.length + ' qualifying dice (' + dice + ')',
    });
  }
  // GM-side auto-draw. Honors the Phase 5 session lock (drawTarot, not force).
  // Cross-client limitation: detection runs on whoever rolled; a player's 3x6
  // only posts the marker (above) so the GM notices — the confirm appears to a
  // GM client only. Same spirit as the player<->character TODO; no cross-client
  // signaling is built here.
  function handleTarotSixTrigger(actorId, weapon) {
    const tarot = component.tarotHandlers();
    if (tarot.tarotSessionLocked()) {
      component.flash(component.tx().tarotTriggerLocked, 4200);
      return;
    }
    if (!component.state.gm) return;
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(component.tx().tarotTriggerConfirm)) return;
    component.setState({
      view: 'games',
      gameTab: 'tarot',
      sheetOpen: false,
      selected: null,
      tarotAttackerId: actorId,
      tarotContext: { ...(component.state.tarotContext || {}), attackType: tarot.attackTypeFromWeapon(weapon) },
    });
    tarot.drawTarot();
  }
  function rollCombatCheck(actorId, skillName, label) {
    if (!canRollCombatActor(actorId)) return component.flash('Voce so pode rolar pelo seu proprio combatente');
    const actor = combatCharacter(actorId) || component.activeCharacter();
    const mod = combatCheckMod(actor, skillName);
    component.roll({
      actorId,
      check: true,
      sides: 10,
      count: 1,
      mod: mod.mod,
      breakdown: component.cyberSourceBreakdown(mod.sources),
      label: ((actor.name || 'OPERATIVO') + ' :: ' + (label || mod.skillName || skillName || 'TESTE')).toUpperCase(),
      onResolved: combatGmRollReporter(actor),
    });
  }
  // Stabilization DV (CPR RAW): classifies the target's current HP into
  // Lightly/Seriously/Mortally Wounded and the DV/allowed skill(s) — pure
  // lookup, the actual roll+effect lives in rollStabilize below.
  function combatStabilizationInfo(targetId) {
    const target = combatCharacter(targetId);
    if (!target) return { state: 'healthy', dv: null, allowedSkills: [] };
    const derived = component.derivedStats(target.base, target);
    const healthCur = (target.health && target.health.cur) ?? derived.hpMax;
    return resolveStabilizationDV({ healthCur, hpMax: derived.hpMax, seriouslyWounded: derived.seriouslyWounded });
  }
  // Rolls TECH + First Aid/Paramedic vs the target's stabilization DV. On a
  // success against a Mortally Wounded target, revives to 1 HP and marks
  // Inconsciente (component.stabilizeMortallyWounded) — Death Save keeps
  // working unchanged until then; nothing here automates death.
  function rollStabilize(actorId, targetId, skillName) {
    if (!canRollCombatActor(actorId)) return component.flash('Voce so pode rolar pelo seu proprio combatente');
    const actor = combatCharacter(actorId) || component.activeCharacter();
    const target = combatCharacter(targetId);
    if (!target) return component.flash('Selecione um alvo');
    const info = combatStabilizationInfo(targetId);
    if (info.dv == null) return component.flash('Alvo nao esta ferido');
    if (!info.allowedSkills.includes(skillName)) return component.flash(skillName + ' nao pode estabilizar esse estado');
    const mod = combatCheckMod(actor, skillName);
    const reporter = combatGmRollReporter(actor);
    component.roll({
      actorId,
      check: true,
      dv: info.dv,
      sides: 10,
      count: 1,
      mod: mod.mod,
      breakdown: component.cyberSourceBreakdown(mod.sources),
      label: ((actor.name || 'OPERATIVO') + ' :: ESTABILIZAR (' + skillName.toUpperCase() + ') :: ALVO ' + (target.name || targetId).toUpperCase()),
      onResolved: (result) => {
        if (reporter) reporter(result);
        if (result.success && info.state === 'mortallyWounded') {
          component.stabilizeMortallyWounded(targetId, { source: 'stabilize:' + skillName });
        }
      },
    });
  }
  function useCombatUtility(actorId, itemId) {
    if (!component.ensureGm('Login do mestre necessario para consumir equipamento')) return;
    const actor = combatCharacter(actorId);
    if (!actor) return;
    const current = component.normalizeGearList(actor.gear || []);
    const item = current.find(row => row.id === itemId);
    if (!item) return;
    const consumes = item.type.includes('CONSUMABLE') || item.type.includes('GRENADE') || item.type.includes('AMMO') || item.type.includes('MED') || item.qty > 1;
    const gear = current.map(row => row.id === itemId ? { ...row, qty: consumes ? Math.max(0, row.qty - 1) : row.qty, lastUsedAt: new Date().toISOString() } : row);
    component.updateCharacterById(actor.id, { gear });
    component.flash(item.name + (consumes ? ' usado' : ' marcado como usado'));
  }
  async function rollInitiative() {
    if (!component.ensureGm('Login do mestre necessario para rolar iniciativa')) return;
    const state = normalizeCombatState(component.state.combatState);
    const allIds = state.order.concat(Object.keys(state.combatants).filter(id => !state.order.includes(id)));
    const combatants = {};
    const pcRequests = [];
    allIds.forEach(id => {
      const entry = normalizeCombatant(state.combatants[id]);
      const character = combatCharacter(id);
      const isPc = character && character.kind !== 'npc';
      if (isPc) {
        // Player rolls their own initiative: mark pending and push a roll
        // request to comms. The result returns via chat and is folded back in
        // by applyInitiativeRolls() on the GM client.
        combatants[id] = { ...entry, initiative: null, acted: false };
        pcRequests.push(id);
      } else {
        // NPCs (and any combatant without a player character) stay GM-rolled.
        const die = 1 + Math.floor(Math.random() * 10);
        combatants[id] = { ...entry, initiative: die + combatRef(id), acted: false };
      }
    });
    const sorted = sortCombatOrder({ ...state, combatants });
    const next = { ...state, combatants, order: sorted, round: state.round < 1 ? 1 : state.round };
    next.turnIndex = combatFirstActiveIndex(next.order, next.combatants);
    // Seed the applied-set with existing roll messages so only NEW player
    // initiative rolls (posted after this request) are folded in.
    component._initApplied = new Set((component.state.comms || []).filter(m => m && m.kind === 'roll').map(m => m.id));
    const saved = await saveCombatState(next);
    if (!saved) return;
    pcRequests.forEach(id => {
      const opts = { label: 'INICIATIVA', sides: 10, count: 1, mod: combatRef(id), combatantId: id, initiative: true };
      const text = 'Pedido de INICIATIVA para ' + combatantSummaryName(id) + ' (d10 + REF)';
      component.postChat({ kind: 'request', text, request: opts });
    });
    const npcs = saved.order.filter(id => saved.combatants[id] && saved.combatants[id].initiative != null);
    const npcSummary = npcs.map(id => combatantSummaryName(id) + ' ' + saved.combatants[id].initiative).join(', ');
    component.postChat({ kind: 'text', text: 'INICIATIVA :: ' + (pcRequests.length ? 'aguardando jogadores' : '') + (npcs.length ? (pcRequests.length ? ' // ' : '') + npcSummary : '') });
  }
  // GM-only: fold player initiative rolls (posted to comms) into combat state.
  // Idempotent via the _initApplied id set seeded at request time.
  function applyInitiativeRolls(list) {
    if (!component.state.gmAuthenticated) return;
    if (!Array.isArray(list) || !list.length) return;
    const state = normalizeCombatState(component.state.combatState);
    if (!state.active) return;
    if (!component._initApplied) component._initApplied = new Set();
    const combatants = { ...state.combatants };
    let changed = false;
    list.forEach(m => {
      if (!(m && m.kind === 'roll' && m.roll && m.roll.initiativeFor)) return;
      if (component._initApplied.has(m.id)) return;
      component._initApplied.add(m.id);
      const id = m.roll.initiativeFor;
      if (!combatants[id]) return;
      combatants[id] = { ...normalizeCombatant(combatants[id]), initiative: component.asNumber(m.roll.total, 0, -99, 999), acted: false };
      changed = true;
    });
    if (!changed) return;
    const currentId = currentCombatantId(state);
    const order = sortCombatOrder({ ...state, combatants });
    const next = { ...state, combatants, order };
    next.turnIndex = combatRepairedTurnIndex(next, currentId);
    saveCombatState(next);
  }
  async function setInitiative(characterId, value) {
    if (!component.ensureGm('Login do mestre necessario para alterar iniciativa')) return;
    const id = String(characterId || '');
    const state = normalizeCombatState(component.state.combatState);
    if (!state.combatants[id]) return;
    const currentId = currentCombatantId(state);
    const clean = value === '' || value === null || value === undefined ? null : component.asNumber(value, 0, -99, 999);
    const combatants = { ...state.combatants, [id]: { ...state.combatants[id], initiative: clean } };
    const order = sortCombatOrder({ ...state, combatants });
    const next = { ...state, combatants, order };
    next.turnIndex = combatRepairedTurnIndex(next, currentId);
    await saveCombatState(next);
  }
  async function nextTurn() {
    if (!component.ensureGm('Login do mestre necessario para avancar turno')) return;
    await advanceTurn();
  }
  // Player self-service: end your own turn without GM auth, but only while
  // it's actually your combatant's turn. The server endpoint is intentionally
  // narrow: it advances only the active target, never arbitrary combat state.
  async function endMyTurn() {
    const state = normalizeCombatState(component.state.combatState);
    const currentId = currentCombatantId(state);
    if (!currentId || currentId !== component.state.activeCharacterId) return;
    if (component.state.gm) { await advanceTurn(); return; }
    const result = await component.app().endTurn.execute({
      session: { authAuthenticated: component.state.authAuthenticated, authUser: component.state.authUser },
      combatState: state,
      currentId,
      activeCharacterId: component.state.activeCharacterId,
      combatantName: combatantSummaryName(currentId),
      requireOwnTurn: true,
    });
    if (!result.ok) { if (result.error) component.flash(result.error, 3200); return; }
    if (result.combatState) component.setState(combatStatePatch(result.combatState));
    if (result.chatMessage) await component.postChat({ kind: 'text', text: result.chatMessage });
  }
  // GM-only: apply end-turn requests posted by players once their turn
  // actually still matches (guards against stale/duplicate requests).
  function applyEndTurnRequests(list) {
    if (!component.state.gmAuthenticated) return;
    if (!Array.isArray(list) || !list.length) return;
    if (!component._endTurnApplied) component._endTurnApplied = new Set();
    const state = normalizeCombatState(component.state.combatState);
    const currentId = currentCombatantId(state);
    list.forEach(m => {
      if (!(m && m.kind === 'text' && m.targetId && /^FIM DE TURNO ::/.test(m.text || ''))) return;
      if (component._endTurnApplied.has(m.id)) return;
      component._endTurnApplied.add(m.id);
      if (m.targetId === currentId) advanceTurn();
    });
  }
  // 1-minute action clock: purely a client-side visual cue (no server field
  // for it), reset whenever the current combatant or round changes.
  function ensureTurnTimer(currentId, round) {
    const key = currentId ? currentId + ':' + round : null;
    if (key !== component._turnKey) {
      component._turnKey = key;
      component._turnStart = key ? Date.now() : null;
    }
  }
  function turnTimerSeconds() {
    if (!component._turnStart) return null;
    const elapsed = Math.floor((Date.now() - component._turnStart) / 1000);
    return Math.max(0, 60 - elapsed);
  }
  function formatTurnTimer(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + ':' + String(s).padStart(2, '0');
  }
  // Ticks the visible countdown without a full rerender, mirroring the
  // clock's direct-DOM-update trick in componentDidMount.
  function tickTurnTimer() {
    const state = normalizeCombatState(component.state.combatState);
    const currentId = currentCombatantId(state);
    ensureTurnTimer(state.active ? currentId : null, state.active ? state.round : null);
    if (!currentId || !state.active) return;
    const seconds = turnTimerSeconds();
    const els = document.querySelectorAll('[data-limiar-turn-timer="true"]');
    if (els.length) els.forEach(el => {
      el.textContent = formatTurnTimer(seconds);
      el.className = 'lm-combat-turn-timer' + (seconds <= 10 ? ' lm-combat-turn-timer--urgent' : '');
    });
    else if (component.state.view === 'combat') component.setState({});
  }
  async function advanceTurn() {
    const state = normalizeCombatState(component.state.combatState);
    const currentId = currentCombatantId(state);
    const result = await component.app().endTurn.execute({
      session: { authAuthenticated: component.state.authAuthenticated, authUser: component.state.authUser },
      combatState: state,
      currentId,
    });
    if (!result.ok) { if (result.error) component.flash(result.error, 3200); return; }
    component.setState(combatStatePatch(result.combatState));
  }
  async function prevTurn() {
    if (!component.ensureGm('Login do mestre necessario para voltar turno')) return;
    const state = normalizeCombatState(component.state.combatState);
    const order = state.order;
    if (combatFirstActiveIndex(order, state.combatants) < 0) {
      await saveCombatState({ ...state, turnIndex: -1 });
      return;
    }
    const start = state.turnIndex >= 0 ? state.turnIndex : 0;
    for (let offset = 1; offset <= order.length; offset++) {
      const idx = (start - offset + order.length) % order.length;
      const entry = state.combatants[order[idx]];
      if (entry && !entry.defeated) {
        await saveCombatState({ ...state, round: Math.max(1, state.round), turnIndex: idx });
        return;
      }
    }
  }
  async function startCombat() {
    if (!component.ensureGm('Login do mestre necessario para iniciar combate')) return;
    const state = normalizeCombatState(component.state.combatState);
    const saved = await saveCombatState({ ...state, active: true });
    if (saved) component.flash('Combate iniciado');
  }
  async function endCombat() {
    if (!component.ensureGm('Login do mestre necessario para encerrar combate')) return;
    const saved = await saveCombatState({ ...defaultCombatState(), active: false });
    if (saved) component.flash('Combate encerrado');
  }
  async function addCombatant(characterId, side) {
    if (!component.ensureGm('Login do mestre necessario para alterar combate')) return null;
    const id = String(characterId || '');
    if (!id) return null;
    const state = normalizeCombatState(component.state.combatState);
    const next = {
      ...state,
      combatants: {
        ...state.combatants,
        [id]: normalizeCombatant(state.combatants[id], side),
      },
      order: state.order.includes(id) ? state.order : state.order.concat(id),
    };
    next.turnIndex = combatRepairedTurnIndex(next);
    return saveCombatState(next);
  }
  async function removeCombatant(characterId) {
    if (!component.ensureGm('Login do mestre necessario para alterar combate')) return;
    const id = String(characterId || '');
    const state = normalizeCombatState(component.state.combatState);
    const combatants = { ...state.combatants };
    delete combatants[id];
    const next = { ...state, combatants, order: state.order.filter(rowId => rowId !== id) };
    next.turnIndex = combatRepairedTurnIndex(next);
    await saveCombatState(next);
  }
  async function toggleDefeated(characterId) {
    if (!component.ensureGm('Login do mestre necessario para alterar combate')) return;
    const id = String(characterId || '');
    const state = normalizeCombatState(component.state.combatState);
    if (!state.combatants[id]) return;
    const next = {
      ...state,
      combatants: { ...state.combatants, [id]: { ...state.combatants[id], defeated: !state.combatants[id].defeated } },
    };
    next.turnIndex = combatRepairedTurnIndex(next);
    await saveCombatState(next);
  }
  function parseCombatNpcAttacks(text) {
    return combatParseNpcAttacks(text, { normalizeGearItem: (item, idx) => component.normalizeGearItem(item, idx) });
  }
  // The GM Cockpit's NPC builder collects attacks as structured rows
  // (name/dice/skill), not the old free-text "nome|2d6|Handgun per line"
  // field. Converting rows back into that pipe-delimited text lets us reuse
  // parseCombatNpcAttacks's already-tested parsing instead of duplicating it.
  function npcGearFromAttackRows(rows) {
    const text = (Array.isArray(rows) ? rows : [])
      .filter(row => row && String(row.name || '').trim())
      .map(row => [row.name, row.dice || '1d6', row.skill || 'Autofire'].join('|'))
      .join('\n');
    return parseCombatNpcAttacks(text);
  }
  function applyNpcTemplate(templateId) {
    const template = NPC_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;
    component.setState({ combatNpcDraft: npcDraftFromTemplate(template) });
  }
  function addNpcAttackRow() {
    component.setState(s => {
      const draft = s.combatNpcDraft || {};
      const rows = Array.isArray(draft.attackRows) ? draft.attackRows : [];
      return { combatNpcDraft: { ...draft, attackRows: rows.concat({ name: '', dice: '2d6', skill: 'Handgun' }) } };
    });
  }
  function removeNpcAttackRow(idx) {
    component.setState(s => {
      const draft = s.combatNpcDraft || {};
      const rows = Array.isArray(draft.attackRows) ? draft.attackRows : [];
      if (rows.length <= 1) return {};
      return { combatNpcDraft: { ...draft, attackRows: rows.filter((_, i) => i !== idx) } };
    });
  }
  function updateNpcAttackRow(idx, field, value) {
    component.setState(s => {
      const draft = s.combatNpcDraft || {};
      const rows = Array.isArray(draft.attackRows) ? draft.attackRows : [];
      return { combatNpcDraft: { ...draft, attackRows: rows.map((row, i) => i === idx ? { ...row, [field]: value } : row) } };
    });
  }
  // GM Cockpit: pin the focus dock to a specific combatant, overriding the
  // default (current turn). Validity is re-checked on every render — see
  // resolvedFocusId in combatRenderVals — so a stale pin never leaves the
  // dock empty.
  function setCombatFocus(characterId) {
    component.setState({ combatFocusId: String(characterId || '') });
  }
  async function createOneCombatNpc(src, gear) {
    const name = String(src.name || '').trim();
    const base = component.normalizeStats({ BODY: component.asNumber(src.body, 5, 1, 20), REF: component.asNumber(src.ref, 5, 1, 20), DEX: 5, TECH: 5, COOL: 5, WILL: 5, INT: 5, LUCK: 5, MOVE: 5, EMP: 5 });
    const hpMax = component.asNumber(src.hpMax, 35, 1, 999);
    const headSp = component.asNumber(src.headSp, 11, 0, 99);
    const bodySp = component.asNumber(src.bodySp, 11, 0, 99);
    const id = 'npc-' + component.slug(name) + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e4).toString(36);
    const character = component.normalizeCharacter({
      id,
      kind: 'npc',
      side: 'enemy',
      name: name.toUpperCase(),
      role: 'NPC',
      level: 1,
      initials: (name.slice(0, 2) || 'NP').toUpperCase(),
      base,
      health: { cur: hpMax, max: hpMax },
      armor: { head: { name: 'NPC Armor', sp: headSp, penalty: 0 }, body: { name: 'NPC Armor', sp: bodySp, penalty: 0 } },
      gear,
      skills: component.normalizeSkills(null, base),
      criticalInjuries: [],
      statusEffects: [],
      spDamage: { head: 0, body: 0 },
      notes: 'NPC criado pelo Modo Combate.',
    });
    const savedRaw = component.api() ? await component.api().characters.upsert(character) : character;
    const saved = component.normalizeCharacter(savedRaw);
    component._charactersTouched = true;
    component.setState(s => ({ characters: [...(s.characters || []).filter(c => c.id !== saved.id), saved] }));
    await addCombatant(saved.id, 'enemy');
    return saved;
  }
  // Spawns `qty` NPCs off one draft, numbering names when qty > 1 (e.g.
  // "GANGER 1", "GANGER 2"...) so the GM can drop a whole group into the
  // fight in one action.
  async function createCombatNpc(payload) {
    if (!component.ensureGm('Login do mestre necessario para criar NPC')) return;
    const src = payload || component.state.combatNpcDraft || {};
    const name = String(src.name || '').trim();
    if (!name) return component.flash('Informe o nome do NPC');
    const gear = npcGearFromAttackRows(src.attackRows);
    const qty = Math.max(1, Math.min(20, component.asNumber(src.qty, 1, 1, 20)));
    try {
      for (let i = 1; i <= qty; i++) {
        await createOneCombatNpc({ ...src, name: qty > 1 ? name + ' ' + i : name }, gear);
      }
      component.setState({ combatNpcDraft: { name: '', body: '5', ref: '5', hpMax: '35', headSp: '11', bodySp: '11', qty: '1', templateId: '', attackRows: [{ name: '', dice: '2d6', skill: 'Handgun' }] } });
      component.flash(qty > 1 ? qty + ' NPCs adicionados ao combate' : 'NPC adicionado ao combate');
    } catch (err) {
      component.flash('Falha ao criar NPC: ' + err.message, 3200);
    }
  }
  // Same heuristic as tarotHandlers' characterHasExplosive, but for a single weapon item —
  // used to default the Critical Injury flow into "area" mode (grenades and
  // rockets hit everyone in the blast, Body location only, per CPR RED rules).
  function weaponIsAreaEffect(weapon) {
    const text = [weapon && weapon.name, weapon && weapon.type, weapon && weapon.notes, weapon && weapon.weaponClass].filter(Boolean).join(' ').toLowerCase();
    return /\b(grenade|granada|explosive|explosivo|rocket|foguete|missile|mina)\b/.test(text);
  }
  // GM (or a player, for their own attacks) picks who a combatant is
  // currently aiming at. Purely a label on the roll — this app never
  // auto-resolves hits against a target's DV/SP, so there's nothing else to
  // wire up mechanically here.
  function setCombatTarget(actorId, targetId) {
    component.setState(s => ({ combatTargets: { ...(s.combatTargets || {}), [actorId]: targetId } }));
  }
  function combatTargetFor(actorId) {
    const picked = (component.state.combatTargets || {})[actorId];
    const candidates = criticalInjuryTargetOptions(actorId);
    if (picked && candidates.some(c => c.id === picked)) return picked;
    return candidates.length ? candidates[0].id : '';
  }
  // --- Standard Critical Injury flow (2+ sixes on a damage roll) ---
  // Other non-defeated combatants in the current fight, excluding the actor —
  // the candidate pool for "who did this damage land on".
  function criticalInjuryTargetOptions(excludeId) {
    const combatState = component.state.combatState || {};
    const combatants = combatState.combatants || {};
    const order = Array.isArray(combatState.order) ? combatState.order : [];
    return order
      .filter(id => id && String(id) !== String(excludeId) && combatants[id] && !combatants[id].defeated)
      .map(id => combatCharacter(id))
      .filter(Boolean);
  }
  function handleCriticalInjuryTrigger(actorId, weapon) {
    // Same cross-client limitation already accepted for the Tarot trigger: the
    // marker (postRollTriggerMarker, called by the caller before this) always
    // posts to chat for everyone; only a GM client actually opens the confirm
    // + resolution flow. A player's own crit just shows the marker for the GM
    // to notice and resolve manually.
    if (!component.state.gm) return;
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(component.tx().critInjuryTriggerConfirm)) return;
    const actor = combatCharacter(actorId);
    const area = weaponIsAreaEffect(weapon);
    const candidates = criticalInjuryTargetOptions(actorId);
    const targetId = combatTargetFor(actorId) || (candidates.length ? candidates[0].id : '');
    component.setState({
      critInjuryPending: {
        actorId,
        actorName: (actor && actor.name) || 'OPERATIVO',
        weaponLabel: (weapon && weapon.name) || 'ARMA',
        area,
        location: area ? 'body' : (component.state.attackContext && component.state.attackContext.aimedShot ? 'head' : 'body'),
        targetId,
        targetIds: area ? candidates.map(c => c.id) : [],
      },
    });
  }
  function setCriticalInjuryLocation(location) {
    if (!['body', 'head'].includes(location)) return;
    component.setState(s => (s.critInjuryPending ? { critInjuryPending: { ...s.critInjuryPending, location } } : {}));
  }
  function setCriticalInjuryTarget(targetId) {
    component.setState(s => (s.critInjuryPending ? { critInjuryPending: { ...s.critInjuryPending, targetId } } : {}));
  }
  function toggleCriticalInjuryAreaTarget(targetId) {
    component.setState(s => {
      if (!s.critInjuryPending) return {};
      const current = Array.isArray(s.critInjuryPending.targetIds) ? s.critInjuryPending.targetIds : [];
      const next = current.includes(targetId) ? current.filter(id => id !== targetId) : current.concat(targetId);
      return { critInjuryPending: { ...s.critInjuryPending, targetIds: next } };
    });
  }
  function cancelCriticalInjuryPending() {
    component.setState({ critInjuryPending: null });
  }
  // Picks the next catalog id this target hasn't already got (the book's
  // "Multiplas Lesoes" rule: reroll until you land on one they don't have).
  // Falls back to the rolled id after enough attempts rather than looping
  // forever once a target has accumulated most of a location's table.
  function criticalInjuryRerollId(location, targetId, rollFn) {
    const target = component.characterById(targetId);
    const existing = new Set((target.criticalInjuries || []).map(entry => entry.injury));
    let id = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const sum = rollFn();
      id = CPRED_CRITICAL_INJURY_TABLE[location] && CPRED_CRITICAL_INJURY_TABLE[location][sum];
      if (!id || !existing.has(id)) break;
    }
    return id;
  }
  function applyCriticalInjuryResult(location, targetId, sum, options) {
    const opts = options || {};
    let id = CPRED_CRITICAL_INJURY_TABLE[location] && CPRED_CRITICAL_INJURY_TABLE[location][sum];
    const target = component.characterById(targetId);
    const existing = new Set((target.criticalInjuries || []).map(entry => entry.injury));
    if (id && existing.has(id)) {
      id = criticalInjuryRerollId(location, targetId, () => {
        const faces = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
        return faces[0] + faces[1];
      }) || id;
    }
    if (!id) return;
    const catalog = CPRED_CRITICAL_INJURIES[id];
    const result = component.addCriticalInjury(location, id, { targetId, source: 'crit-damage', hpLossDirect: 5 });
    if (result && result.applied) {
      component.postChat({
        kind: 'text',
        sender: 'SISTEMA',
        text: 'LESAO CRITICA :: ' + ((target && target.name) || 'ALVO') + ' :: ' + (catalog && catalog.name_pt) + ' (+5 dano direto, ignora armadura)' + (opts.areaSource ? ' [' + opts.areaSource + ']' : ''),
      });
    }
  }
  // Kicks the 2d6 table roll(s). Single mode rolls one 2d6 for the chosen
  // target; area mode rolls one 2d6 PER selected target in a single physical
  // roll (grouped via `contributions`, same mechanism postDamageRollTracking
  // already uses to tag dice by source) so everyone's result lands together.
  function rollCriticalInjuryTable() {
    const pending = component.state.critInjuryPending;
    if (!pending) return;
    if (pending.area) {
      const targets = (pending.targetIds || []).map(id => component.characterById(id)).filter(Boolean);
      if (!targets.length) { component.flash('Selecione ao menos um alvo'); return; }
      component.roll({
        label: 'LESAO CRITICA (AREA - CORPO)',
        sides: 6,
        count: targets.length * 2,
        mod: 0,
        rollScope: 'critInjuryArea',
        contributions: targets.map(t => ({ count: 2, sides: 6, source: t.name || t.id, kind: 'base' })),
        skipActionPenalty: true,
        onResolved: (result) => {
          const dice = Array.isArray(result.dice) ? result.dice : [];
          targets.forEach((t, idx) => {
            const rowFaces = dice.filter(die => die.contributionIndex === idx).map(die => die.value);
            const sum = rowFaces.reduce((s, v) => s + v, 0);
            applyCriticalInjuryResult('body', t.id, sum, { areaSource: pending.weaponLabel });
          });
          component.setState({ critInjuryPending: null });
        },
      });
      return;
    }
    if (!pending.targetId) { component.flash('Selecione um alvo'); return; }
    component.roll({
      label: 'LESAO CRITICA (' + (pending.location === 'head' ? 'CABECA' : 'CORPO') + ')',
      sides: 6,
      count: 2,
      mod: 0,
      rollScope: 'critInjury',
      skipActionPenalty: true,
      onResolved: (result) => {
        applyCriticalInjuryResult(pending.location, pending.targetId, result.total);
        component.setState({ critInjuryPending: null });
      },
    });
  }
  // --- Phase 5: situational attack-roll context (cover / beyond 51m / aimed shot) ---
  function attackContextState() {
    const c = component.state.attackContext || {};
    return { cover: !!c.cover, beyond51m: !!c.beyond51m, aimedShot: !!c.aimedShot };
  }
  function setAttackContext(patch) {
    component.setState(s => ({ attackContext: { ...(s.attackContext || {}), ...patch } }));
  }
  function toggleAttackContext(key) {
    const cur = attackContextState();
    setAttackContext({ [key]: !cur[key] });
  }
  // Which toggles to surface for an actor: only the ones whose chrome they carry.
  function attackContextAvailable(character) {
    const chrome = component.cyberwareBonuses(character);
    return {
      cover: chrome.damageVsCover.length > 0,
      beyond51m: chrome.rangedBonus.some(b => b.condition === 'beyond51m'),
      aimedShot: chrome.rangedBonus.some(b => b.condition === 'aimedShot'),
    };
  }
  // To-hit contribution from rangedBonus chrome gated by the active toggles.
  function cyberContextToHit(character) {
    const ctx = attackContextState();
    const chrome = component.cyberwareBonuses(character);
    let mod = 0;
    const sources = [];
    chrome.rangedBonus.forEach(b => {
      const on = (b.condition === 'beyond51m' && ctx.beyond51m) || (b.condition === 'aimedShot' && ctx.aimedShot);
      if (!on) return;
      const v = Number(b.value) || 0;
      mod += v;
      sources.push((v >= 0 ? '+' : '') + v + ' ' + (b.from || b.sourceCode || ''));
    });
    return { mod, sources };
  }
  // Damage contribution from damageVsCover chrome when the cover toggle is set.
  function cyberContextDamage(character) {
    if (!attackContextState().cover) return { contributions: [] };
    const chrome = component.cyberwareBonuses(character);
    const contributions = [];
    chrome.damageVsCover.forEach(b => {
      const parsed = component.parseGearDamage(b.dice);
      if (!parsed) return;
      contributions.push({
        count: parsed.count,
        sides: parsed.sides,
        mod: parsed.mod,
        source: b.from || b.sourceCode || 'Cover bonus',
        reason: 'target behind cover',
        kind: 'bonus',
      });
    });
    return { contributions };
  }

  return {
    combatDomainOptions,
    defaultCombatState,
    normalizeCombatant,
    normalizeCombatState,
    combatStatePatch,
    ensureCombatState,
    saveCombatState,
    combatCharacter,
    combatRef,
    combatFacedownMod,
    rollCombatFacedownContested,
    applyCombatFacedownLoss,
    dismissCombatFacedownContest,
    combatFirstActiveIndex,
    currentCombatantId,
    combatRepairedTurnIndex,
    sortCombatOrder,
    combatantSummaryName,
    canRollCombatActor,
    combatSkillRow,
    combatAttackMod,
    combatCheckMod,
    combatGmRollReporter,
    combatTargetLabelSuffix,
    rollCombatAttack,
    rollCombatDamage,
    rollCombatShieldDamage,
    applyCombatShieldDamage,
    autoApplyCombatDamage,
    combatDamageContributions,
    weaponRollTone,
    postDamageRollTracking,
    evaluateRollTriggers,
    postRollTriggerMarker,
    handleTarotSixTrigger,
    rollCombatCheck,
    combatStabilizationInfo,
    rollStabilize,
    useCombatUtility,
    rollInitiative,
    applyInitiativeRolls,
    setInitiative,
    nextTurn,
    endMyTurn,
    applyEndTurnRequests,
    ensureTurnTimer,
    turnTimerSeconds,
    formatTurnTimer,
    tickTurnTimer,
    advanceTurn,
    prevTurn,
    startCombat,
    endCombat,
    addCombatant,
    removeCombatant,
    toggleDefeated,
    parseCombatNpcAttacks,
    createCombatNpc,
    applyNpcTemplate,
    addNpcAttackRow,
    removeNpcAttackRow,
    updateNpcAttackRow,
    setCombatFocus,
    weaponIsAreaEffect,
    setCombatTarget,
    combatTargetFor,
    criticalInjuryTargetOptions,
    handleCriticalInjuryTrigger,
    setCriticalInjuryLocation,
    setCriticalInjuryTarget,
    toggleCriticalInjuryAreaTarget,
    cancelCriticalInjuryPending,
    criticalInjuryRerollId,
    applyCriticalInjuryResult,
    rollCriticalInjuryTable,
    attackContextState,
    setAttackContext,
    toggleAttackContext,
    attackContextAvailable,
    cyberContextToHit,
    cyberContextDamage,
  };
}
