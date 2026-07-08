import {
  CPRED_CRITICAL_INJURIES,
  CPRED_STAT_ORDER,
  CPRED_STAT_BUDGET,
  CPRED_STAT_MIN,
  CPRED_ROLES,
  CPRED_SKILL_BUDGET,
  CPRED_STORY_TEMPLATE,
  CPRED_DEFAULT_ARMOR,
} from '../../domain/character/constants.ts';
import {
  CPRED_STATUS_PRESETS,
  toggleCriticalInjuryTreated as condToggleCriticalInjuryTreated,
  removeCriticalInjury as condRemoveCriticalInjury,
  removeStatusEffect as condRemoveStatusEffect,
  useStatusCharge as condUseStatusCharge,
  advanceConditionTime as condAdvanceConditionTime,
} from '../../domain/conditions/index.ts';
import { LIMIAR_TRAUMA_PLANS } from '../../domain/character/traumaPlans.ts';
import { moraleBoostRecovery as charMoraleBoostRecovery } from '../../domain/character/index.ts';
import {
  CPRED_NETRUNNING_ABILITIES,
  NETRUNNING_PROGRAMS,
  netActionsPerTurn,
  netrunningProgramById,
  programRunModifiers,
} from '../../domain/netrunning/index.ts';
import { ipCost as econIpCost, ipRoleCost as econIpRoleCost, formatIpLogRows as econFormatIpLogRows } from '../../domain/economy/index.ts';

// SYS.01 // CHARACTER: the sheet drawer — core stats, skills, conditions,
// IP purchases, installed chrome, trauma team coverage, and the
// create/edit-draft flow. Everything here reads/writes a single active
// character; combat-wide mechanics (critical injury *combat* trigger,
// attack-roll context toggles, initiative) live in Component.js pending
// the combat view extraction, and addCriticalInjury/addStatusEffect stay
// shared there too since combat and tarot both call into them directly.
export function sheetRenderVals(state = {}, deps = {}) {
  const S = state;
  const tx = deps.tx || {};
  const activeCharacter = deps.activeCharacter;
  const derived = deps.derived;
  const eff = deps.eff;

  const isPlayer = !!(S.authUser && S.authUser.role === 'player');
  const canEditSheet = (S.gmAuthenticated && S.gm) || isPlayer;
  const canSaveSheet = canEditSheet || (S.sheetEditing && S.sheetCreating && !S.gmAuthenticated);
  const canPlayerCreateSheet = S.sheetEditing && S.sheetCreating && !S.gmAuthenticated && S.authAuthenticated;

  const sheetDraft = S.sheetDraft || deps.sheetDraftFrom(activeCharacter);
  const updateSheetField = (key, value) => deps.setState(s => {
    const current = s.sheetDraft || deps.sheetDraftFrom(activeCharacter);
    return { sheetDraft: { ...current, [key]: value } };
  });
  const updateSheetBase = (key, value) => deps.setState(s => {
    const current = s.sheetDraft || deps.sheetDraftFrom(activeCharacter);
    const normalizedValue = s.sheetCreating
      ? String(deps.asNumber(value, key === 'MOVE' ? 6 : 5, CPRED_STAT_MIN, deps.cpredStatMax(key)))
      : value;
    return { sheetDraft: { ...current, base: { ...(current.base || {}), [key]: normalizedValue } } };
  });
  const updateSheetSkill = (idx, key, value) => deps.setState(s => {
    const current = s.sheetDraft || deps.sheetDraftFrom(activeCharacter);
    const skills = deps.normalizeSkills(current.skills, deps.normalizeStats(current.base)).map(skill => ({ ...skill, level: String(skill.level), bonus: String(skill.bonus) }));
    skills[idx] = { ...skills[idx], [key]: value };
    return { sheetDraft: { ...current, skills } };
  });
  const addSheetChrome = (cat, code) => deps.setState(s => {
    const current = s.sheetDraft || deps.sheetDraftFrom(activeCharacter);
    const equipped = deps.normalizeEquipped(current.equipped);
    const p = deps.products.find(item => item.code === code && item.cat === cat);
    if (p && !equipped.some(it => it.code === p.code)) equipped.push(deps.installPayload(p));
    return { sheetDraft: { ...current, equipped } };
  });
  const removeSheetChrome = (code) => deps.setState(s => {
    const current = s.sheetDraft || deps.sheetDraftFrom(activeCharacter);
    const equipped = deps.normalizeEquipped(current.equipped).filter(it => it.code !== code);
    return { sheetDraft: { ...current, equipped } };
  });

  const attrOrder = CPRED_STAT_ORDER;
  const attrList = attrOrder.map(k => {
    const statCyber = deps.cyberwareStatModBonus(k, activeCharacter);
    return {
      key: k, val: eff[k],
      onRoll: () => deps.roll({ label: k + ' CHECK', sides: 10, count: 1, mod: eff[k], check: true, breakdown: deps.cyberSourceBreakdown(statCyber.sources) }),
    };
  });
  const attrEditors = attrOrder.map(k => ({
    key: k,
    value: (sheetDraft.base && sheetDraft.base[k]) || '0',
    max: deps.cpredStatMax(k),
    onInput: (e) => updateSheetBase(k, e.target.value),
  }));
  const sheetDraftStats = deps.normalizeStats(sheetDraft.base);
  const sheetRefCharacter = S.sheetCreating ? {} : activeCharacter;
  const sheetDraftEquipped = deps.normalizeEquipped(sheetDraft.equipped);
  const sheetDerived = deps.derivedStats(sheetDraftStats, { ...sheetRefCharacter, base: sheetDraftStats, armor: sheetDraft.armor, humanityLoss: deps.asNumber(sheetDraft.humanityLoss, 0, 0, 100), equipped: sheetDraftEquipped });
  const sheetStatTotal = CPRED_STAT_ORDER.reduce((sum, key) => sum + deps.asNumber(sheetDraft.base && sheetDraft.base[key], 0, 0, 99), 0);
  const sheetStatRemaining = CPRED_STAT_BUDGET - sheetStatTotal;
  const sheetStatBudgetColor = sheetStatRemaining === 0 ? '#3fe0d0' : sheetStatRemaining > 0 ? '#d6aa4e' : '#c0635b';
  const sheetSkillSpend = deps.skillSpend(sheetDraft.skills);
  const sheetSkillRemaining = CPRED_SKILL_BUDGET - sheetSkillSpend;
  const sheetSkillBudgetColor = sheetSkillRemaining === 0 ? '#3fe0d0' : sheetSkillRemaining > 0 ? '#d6aa4e' : '#c0635b';
  const activeIp = deps.asNumber(activeCharacter.ip, 0, 0, 999999);
  const skillRows = deps.normalizeSkills(activeCharacter.skills, eff).map(skill => {
    const cyber = deps.skillCyberwareBonus(skill.name, activeCharacter);
    const statCyber = deps.cyberwareStatModBonus(skill.stat, activeCharacter);
    const total = skill.total + cyber.total;
    const cyberBreakdown = deps.cyberSourceBreakdown(statCyber.sources.concat(cyber.sources));
    return {
      ...skill,
      total,
      cyberBonus: cyber.total,
      hasCyberBonus: cyber.total !== 0,
      cyberBonusTitle: cyberBreakdown.join(' / '),
      onRoll: () => deps.roll({ label: skill.name.toUpperCase(), sides: 10, count: 1, mod: total, check: true, breakdown: cyberBreakdown }),
    };
  });
  const skillEditors = deps.normalizeSkills(sheetDraft.skills, sheetDraftStats).map((skill, idx) => ({
    ...skill,
    levelValue: String((sheetDraft.skills && sheetDraft.skills[idx] && sheetDraft.skills[idx].level) ?? skill.level),
    bonusValue: String((sheetDraft.skills && sheetDraft.skills[idx] && sheetDraft.skills[idx].bonus) ?? skill.bonus),
    statOptions: CPRED_STAT_ORDER.map(stat => ({ stat, selected: stat === skill.stat, notSelected: stat !== skill.stat })),
    minLevel: skill.defaultSkill ? 2 : 0,
    difficultLabel: skill.difficult ? 'DIFICIL x2' : 'NORMAL',
    difficultStyle: 'lm-skill-diff-btn' + (skill.difficult ? ' lm-skill-diff-btn--on' : ''),
    onName: (e) => updateSheetSkill(idx, 'name', e.target.value),
    onStat: (e) => updateSheetSkill(idx, 'stat', e.target.value),
    onLevel: (e) => updateSheetSkill(idx, 'level', e.target.value),
    onBonus: (e) => updateSheetSkill(idx, 'bonus', e.target.value),
    onDifficult: () => updateSheetSkill(idx, 'difficult', !skill.difficult),
  }));
  const splitSkillColumns = (rows) => {
    const midpoint = Math.ceil((rows || []).length / 2);
    return [
      { rows: (rows || []).slice(0, midpoint) },
      { rows: (rows || []).slice(midpoint) },
    ];
  };
  const skillRowColumns = splitSkillColumns(skillRows);
  const skillEditorColumns = splitSkillColumns(skillEditors);
  const strongestSkillRows = skillRows
    .slice()
    .sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name)))
    .slice(0, 6);
  // Netrunning tab: only a Netrunner with Interface rank > 0 sees it —
  // Interface is the Netrunner role ability, i.e. the existing generic
  // roleAbilityRank field, not a new character field.
  const isNetrunner = String(activeCharacter.role || '').toUpperCase() === 'NETRUNNER';
  const netrunnerRank = deps.asNumber(activeCharacter.roleAbilityRank, 0, 0, 10);
  const showNetrunningTab = isNetrunner && netrunnerRank > 0;
  const sheetTabKeys = ['core', 'skills', 'conditions', 'ip', 'chrome', 'netrunning', 'notes'];
  const sheetTab = sheetTabKeys.includes(S.sheetTab) ? S.sheetTab : 'core';
  const sheetTabStyle = (active) => 'lm-sheet-tab' + (active ? ' lm-sheet-tab--active' : '');
  const sheetTabs = [
    { key: 'core', label: 'CORE' },
    { key: 'skills', label: 'SKILLS' },
    { key: 'conditions', label: 'CONDICOES' },
    { key: 'ip', label: 'IP' },
    { key: 'chrome', label: 'CHROME' },
    ...(showNetrunningTab ? [{ key: 'netrunning', label: 'NETRUNNING' }] : []),
    { key: 'notes', label: 'NOTES' },
  ].map(tab => ({
    ...tab,
    style: sheetTabStyle(sheetTab === tab.key),
    onClick: () => deps.setState({ sheetTab: tab.key }),
  }));
  const purchaseBtn = (enabled) => 'lm-purchase-btn' + (enabled ? ' lm-purchase-btn--on' : ' lm-purchase-btn--off');
  const makeIpRow = (data) => {
    const capped = data.capped;
    const cost = capped ? 0 : data.cost;
    const after = activeIp - cost;
    const canBuy = !capped && activeIp >= cost && !data.locked;
    return {
      ...data,
      nextLabel: capped ? 'MAX' : data.nextLabel,
      costLabel: capped ? 'MAX' : cost + ' IP',
      costColor: capped ? '#6f7a64' : canBuy ? '#d6aa4e' : '#c0635b',
      afterLabel: capped ? '--' : 'RESTA ' + after,
      afterColor: capped ? '#6f7a64' : after >= 0 ? '#3fe0d0' : '#c0635b',
      buyLabel: capped ? 'MAX' : data.locked ? 'BLOQ' : 'COMPRAR',
      buyStyle: purchaseBtn(canBuy),
      buy: canBuy ? data.buy : (() => deps.flash(data.locked ? 'Limite de 1 aumento de rank por sessao ativo' : 'IP insuficiente')),
    };
  };
  const currentRank = deps.asNumber(activeCharacter.roleAbilityRank, 4, 1, 10);
  const ipPurchaseRows = [
    makeIpRow({
      kind: 'role',
      name: 'ROLE ABILITY RANK',
      meta: 'RANK ATUAL ' + currentRank,
      metaColor: '#3fe0d0',
      nextLabel: 'RANK ' + (currentRank + 1),
      cost: econIpRoleCost(currentRank + 1),
      capped: currentRank >= 10,
      locked: S.ipOneRankPerSession && S.ipRankPurchasedThisSession,
      buy: () => deps.buyIpIncrease('role'),
    }),
    ...deps.normalizeSkills(activeCharacter.skills, deps.normalizeStats(activeCharacter.base)).map((skill, idx) => makeIpRow({
      kind: 'skill',
      name: skill.name,
      meta: skill.stat + ' // LV ' + skill.level + (skill.difficult ? ' // DIFICIL x2' : ''),
      metaColor: skill.difficult ? '#d6aa4e' : '#6f7a64',
      nextLabel: 'LV ' + (skill.level + 1),
      cost: econIpCost(skill.level + 1, skill.difficult),
      capped: skill.level >= 10,
      locked: false,
      buy: () => deps.buyIpIncrease('skill', idx),
    })),
  ];
  const ipLogRows = econFormatIpLogRows(activeCharacter.ipLog);
  const roleOptions = CPRED_ROLES.map(role => {
    const selected = String(sheetDraft.role || '').toUpperCase() === role.toUpperCase();
    return { value: role.toUpperCase(), label: role.toUpperCase(), selected, notSelected: !selected };
  });
  const bonusToText = (it) => {
    if (!it) return '';
    const parts = [];
    const statMod = deps.effectMap(it.statMod);
    const skillBonus = deps.effectMap(it.skillBonus);
    Object.keys(statMod).forEach(k => parts.push('+' + statMod[k] + ' ' + k));
    Object.keys(skillBonus).forEach(k => parts.push('+' + skillBonus[k] + ' ' + k));
    if (it.armor) parts.push('+' + it.armor + ' ARM');
    if (it.ram) parts.push('+' + it.ram + ' RAM');
    return parts.join('  ') || '-';
  };
  const bonusToChips = (it) => {
    if (!it) return [];
    const chips = [];
    const statMod = deps.effectMap(it.statMod);
    const skillBonus = deps.effectMap(it.skillBonus);
    Object.keys(statMod).forEach(k => chips.push({ val: (statMod[k] >= 0 ? '+' : '') + statMod[k], label: k, kind: 'stat' }));
    Object.keys(skillBonus).forEach(k => chips.push({ val: (skillBonus[k] >= 0 ? '+' : '') + skillBonus[k], label: k, kind: 'skill' }));
    if (it.armor) chips.push({ val: '+' + it.armor, label: 'ARMOR', kind: 'stat' });
    if (it.ram) chips.push({ val: '+' + it.ram, label: 'RAM', kind: 'stat' });
    return chips;
  };
  const chromeCats = ['NEURAL', 'OPTICS', 'AUDIO', 'INTERNAL', 'EXTERNAL', 'LIMBS', 'DEFENSE', 'DECK'];
  const chromeStarterEditors = chromeCats.map(cat => {
    const installed = sheetDraftEquipped.filter(it => it.cat === cat).map(it => ({
      ...it,
      bonusTxt: bonusToText(it),
      remove: () => removeSheetChrome(it.code),
    }));
    const installedCodes = new Set(installed.map(it => it.code));
    const options = [{ code: '', label: '+ ADD CHROME', selected: true, notSelected: false }].concat(deps.products.filter(p => p.cat === cat && !installedCodes.has(p.code)).map(p => ({
      code: p.code,
      label: p.code + ' // HUM -' + (p.hcost || 0),
      selected: false,
      notSelected: true,
    })));
    return {
      cat,
      installed,
      noneInstalled: installed.length === 0,
      options,
      onChange: (e) => addSheetChrome(cat, e.target.value),
    };
  });
  const traumaPlan = deps.traumaPlanByKey(S.sheetEditing ? sheetDraft.traumaPlan : deps.traumaPlanKey(activeCharacter));
  const traumaPlanName = S.lang === 'pt' ? traumaPlan.pt : traumaPlan.label;
  const traumaMemberName = ((S.sheetEditing ? sheetDraft.name : activeCharacter.name) || activeCharacter.name || 'OPERATIVE').trim().toUpperCase();
  const traumaPlanCode = traumaPlan.label === 'PLATINUM' ? 'PLAT' : traumaPlan.label;
  const traumaCardStyle = "position:relative;margin-top:18px;min-height:196px;padding:18px;border:1px solid " + traumaPlan.color + "55;background:" + traumaPlan.bg + ";box-shadow:0 18px 52px rgba(0,0,0,.45),0 0 34px " + traumaPlan.glow + ";overflow:hidden;clip-path:polygon(0 0,calc(100% - 18px) 0,100% 18px,100% 100%,18px 100%,0 calc(100% - 18px));";
  const traumaPlanOptions = LIMIAR_TRAUMA_PLANS.map(plan => {
    const active = plan.key === traumaPlan.key;
    return {
      label: S.lang === 'pt' ? plan.pt : plan.label,
      onClick: () => updateSheetField('traumaPlan', plan.key),
      style: "font:700 10px 'Share Tech Mono',monospace;letter-spacing:1.5px;color:" + (active ? '#080a07' : plan.color) + ";background:" + (active ? plan.color : 'rgba(255,255,255,.03)') + ";border:1px solid " + plan.color + "66;padding:10px 8px;cursor:pointer;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;",
    };
  });
  const showRemoveTraumaPlan = !!S.gm && traumaPlan.key !== 'nocoverage';
  const showUseExecutiveBackup = !!S.gm && traumaPlan.key === 'executivo';
  const onRemoveTraumaPlan = () => deps.removeTraumaPlan();
  const onUseExecutiveBackup = () => deps.useExecutiveTraumaBackup();
  const sheetCharacterBtns = (S.characters || []).map(c => {
    const active = c.id === S.activeCharacterId && !S.sheetCreating;
    return {
      id: c.id,
      label: c.initials || (c.name || 'OP').slice(0, 2),
      name: c.name || 'OPERATIVE',
      onClick: () => deps.selectCharacter(c.id),
      style: 'lm-char-btn' + (active ? ' lm-char-btn--active' : ''),
    };
  });
  const playerCharacterCards = (S.characters || []).map(c => {
    const active = c.id === S.activeCharacterId;
    const role = c.role || 'EDGERUNNER';
    const tone = deps.playerRoleTone(role);
    const initials = String(c.initials || (c.name || 'OP').slice(0, 2)).slice(0, 2).toUpperCase();
    return {
      id: c.id,
      initials,
      name: c.name || 'OPERATIVE',
      role,
      roleTag: tone.label,
      level: c.level || 1,
      status: active ? 'ACTIVE' : 'SELECT',
      statusColor: active ? '#3fe0d0' : '#6f7a64',
      badgeBg: tone.color,
      vars: '--pc-accent:' + tone.color + ';--pc-rgb:' + tone.rgb + ';',
      onClick: () => deps.selectCharacter(c.id),
      style: 'limiar-player-card lm-player-card-btn' + (active ? ' lm-player-card-btn--active' : ''),
    };
  });
  const conditionLocation = ['head', 'body'].includes(S.conditionLocation) ? S.conditionLocation : 'body';
  const conditionLocationOptions = ['head', 'body'].map(loc => ({ value: loc, label: loc === 'head' ? 'CABECA' : 'CORPO', selected: loc === conditionLocation, notSelected: loc !== conditionLocation }));
  const filteredInjuries = Object.values(CPRED_CRITICAL_INJURIES).filter(injury => injury.location === conditionLocation);
  const selectedInjuryId = filteredInjuries.some(injury => injury.id === S.conditionInjuryId) ? S.conditionInjuryId : (filteredInjuries[0] && filteredInjuries[0].id) || '';
  const conditionInjuryOptions = filteredInjuries.map(injury => ({ value: injury.id, label: injury.name_pt + ' // ' + injury.name_en, selected: injury.id === selectedInjuryId, notSelected: injury.id !== selectedInjuryId }));
  const selectedStatusId = CPRED_STATUS_PRESETS.some(status => status.id === S.conditionStatusId) ? S.conditionStatusId : CPRED_STATUS_PRESETS[0].id;
  const conditionStatusOptions = CPRED_STATUS_PRESETS.map(status => ({ value: status.id, label: status.label_pt, selected: status.id === selectedStatusId, notSelected: status.id !== selectedStatusId }));
  const durationLabel = (duration) => {
    if (!duration) return 'INDEFINIDO';
    const unit = duration.unit === 'hour' ? 'H' : duration.unit === 'min' ? 'MIN' : 'ROD';
    return duration.value + ' ' + unit;
  };
  const criticalInjuryRows = (activeCharacter.criticalInjuries || []).map(entry => ({
    ...entry,
    locationLabel: entry.location === 'head' ? 'CABECA' : 'CORPO',
    treatedLabel: entry.treated ? 'TRATADA' : 'NAO TRATADA',
    treatedColor: entry.treated ? '#3fe0d0' : '#c0635b',
    toggleLabel: entry.treated ? tx.untreat : tx.treat,
    toggle: () => deps.toggleCriticalInjury(entry.instanceId),
    remove: () => deps.removeCriticalInjury(entry.instanceId),
  }));
  const statusEffectRows = (activeCharacter.statusEffects || []).map(entry => {
    const chargeKey = deps.statusChargeKey(entry);
    const chargeValue = chargeKey ? Math.max(0, Number((entry.modifiers || {})[chargeKey]) || 0) : 0;
    const chargeLabel = chargeKey === 'guaranteedCrit' ? 'Critico garantido x' + chargeValue : chargeKey ? 'Carga x' + chargeValue : '';
    return {
      ...entry,
      displayLabel: entry.label_pt + (chargeLabel ? ' // ' + chargeLabel : ''),
      remainingLabel: durationLabel(entry.remaining),
      hasCharges: chargeValue > 0,
      chargeLabel,
      useCharge: () => deps.useStatusCharge(entry.instanceId),
      remove: () => deps.removeStatusEffect(entry.instanceId),
    };
  });
  const conditionDeltas = [
    { label: 'SP CABECA', value: derived.currentHeadSp + '/' + derived.headSp, color: derived.currentHeadSp < derived.headSp ? '#c0635b' : '#3fe0d0' },
    { label: 'SP CORPO', value: derived.currentBodySp + '/' + derived.bodySp, color: derived.currentBodySp < derived.bodySp ? '#c0635b' : '#3fe0d0' },
    { label: tx.actionPenalty, value: derived.actionPenalty > 0 ? '-' + derived.actionPenalty : derived.actionPenalty < 0 ? '+' + Math.abs(derived.actionPenalty) : '0', color: derived.actionPenalty > 0 ? '#c0635b' : derived.actionPenalty < 0 ? '#3fe0d0' : '#d6aa4e' },
    { label: 'DEATH SAVE MOD', value: (derived.deathSaveModifier < 0 ? '' : '+') + String(derived.deathSaveModifier || 0), color: derived.deathSaveModifier < 0 ? '#c0635b' : '#d6aa4e' },
    { label: 'NATURAL HEAL / REST', value: '+' + derived.naturalHealingPerRest, color: derived.naturalHealingMultiplier > 1 ? '#3fe0d0' : '#d6aa4e' },
  ];
  // Humanity recovery (therapy + Morale Boost): GM-only tools, CPR RAW.
  const showHumanityRecovery = !!S.gm;
  const humanityTherapyAmount = S.humanityTherapyAmount ?? '';
  const onHumanityTherapyAmount = (e) => deps.setState({ humanityTherapyAmount: e.target.value });
  const applyHumanityTherapyClick = () => deps.applyHumanityTherapy(humanityTherapyAmount);
  const rollMoraleBoost1 = () => deps.rollMoraleBoost(1);
  const rollMoraleBoost4 = () => deps.rollMoraleBoost(4);
  const rollMoraleBoost9 = () => deps.rollMoraleBoost(9);
  const netActionsPerTurnValue = netActionsPerTurn(netrunnerRank);
  const netrunningAbilityRows = CPRED_NETRUNNING_ABILITIES.map(ability => ({
    id: ability.id,
    name: ability.name.toUpperCase(),
    desc: ability.desc,
    attackLabel: ability.isAttack ? tx.attack : '',
    isAttack: ability.isAttack,
    roll: () => deps.rollNetrunningAbility(ability),
  }));
  const netPrograms = deps.normalizeInstalledPrograms(activeCharacter.netPrograms);
  const netProgramSummary = deps.deckProgramSummary(netPrograms);
  const installedProgramIds = new Set(netPrograms.map(program => program.id));
  const netProgramOptions = [{ id: '', label: '+ INSTALL PROGRAM', selected: true, notSelected: false }]
    .concat(NETRUNNING_PROGRAMS.filter(program => !installedProgramIds.has(program.id)).map(program => ({
      id: program.id,
      label: program.name + ' // ' + program.class.toUpperCase() + ' // ' + program.cost + 'eb',
      selected: false,
      notSelected: true,
    })));
  const programMods = programRunModifiers(netPrograms);
  const netProgramModifierLabels = programMods.labels.concat(programMods.mitigation);
  const netProgramRows = netPrograms.map(row => {
    const program = netrunningProgramById(row.id);
    const name = program ? program.name : row.id;
    const rezColor = row.state === 'derezzed' ? '#c0635b' : row.rez < row.maxRez ? '#d6aa4e' : '#3fe0d0';
    return {
      id: row.id,
      name,
      classLabel: program ? program.class.toUpperCase() + (program.subclass ? ' // ' + program.subclass.toUpperCase() : '') : 'PROGRAM',
      statsLabel: 'ATK ' + (program ? program.atk : 0) + ' // DEF ' + (program ? program.def : 0) + ' // REZ ' + row.rez + '/' + row.maxRez,
      effect: program ? program.effect : '',
      stateLabel: row.state === 'derezzed' ? 'DEREZZED' : 'REZZED',
      rezColor,
      canTakeRezDamage: row.maxRez > 0,
      remove: () => deps.removeNetrunningProgram(row.id),
      damageOne: () => deps.damageNetrunningProgram(row.id, 1),
      repairFull: () => deps.repairNetrunningProgram(row.id, row.maxRez),
    };
  });
  const passiveStatusBadges = deps.immunityBadges(activeCharacter);
  const hasPassiveStatusBadges = passiveStatusBadges.length > 0;
  const healingBreakdown = 'BODY ' + derived.naturalHealingBase + (derived.naturalHealingMultiplier > 1 ? ' x' + derived.naturalHealingMultiplier : '') + (derived.naturalHealingSources.length ? ' // ' + deps.cyberSourceBreakdown(derived.naturalHealingSources).join(' / ') : '');
  const woundFlagSources = [
    ...deps.cyberwareFlagSources(activeCharacter, 'ignoreSeriouslyWounded'),
    ...(activeCharacter.statusEffects || []).filter(entry => entry && entry.modifiers && entry.modifiers.ignoreSeriouslyWounded).map(entry => entry.label_pt || entry.id || entry.source),
  ].filter(Boolean);
  const woundFlags = [
    derived.ignoreSeriouslyWounded ? 'IGNORA SERIOUSLY WOUNDED' + (woundFlagSources.length ? ' (' + woundFlagSources.join(', ') + ')' : '') : '',
    derived.ignoreWoundState ? 'IGNORA WOUND STATES' : '',
    derived.skipDeathSave ? 'SEM DEATH SAVE' : '',
  ].filter(Boolean).join(' // ') || 'NENHUMA';
  const installedChrome = deps.installedCyberware(activeCharacter);
  const slots = installedChrome.length ? installedChrome.map(it => {
    const attachmentRows = deps.compatibleEnhancements(activeCharacter, it).map(enh => {
      const active = deps.normalizeEnhancementCodes(it.enhancements).includes(enh.code);
      return {
        code: enh.code,
        name: enh.name || enh.code,
        active,
        label: active ? 'ON' : 'LINK',
        style: active ? 'lm-enh-link-btn lm-enh-link-btn--on' : 'lm-enh-link-btn',
        toggle: () => deps.toggleCyberwareEnhancement(activeCharacter.id, it.code, enh.code),
      };
    });
    const linkedEnhancementLabels = deps.normalizeEnhancementCodes(it.enhancements).map(code => {
      const enh = installedChrome.find(row => row.code === code);
      return enh ? (enh.name || enh.code) : code;
    });
    return {
      slot: it.cat || 'GEAR',
      code: it.code,
      name: it.name || it.code,
      bonusTxt: bonusToText(it),
      bonusChips: bonusToChips(it),
      hasBonus: bonusToChips(it).length > 0,
      border: 'rgba(214,170,78,0.22)',
      codeColor: '#d6aa4e',
      hasEnhancementControls: attachmentRows.length > 0,
      attachmentRows,
      hasLinkedEnhancements: linkedEnhancementLabels.length > 0,
      linkedEnhancementsLabel: linkedEnhancementLabels.join(' // '),
      uninstall: () => deps.uninstallCyberware(it.code),
    };
  }) : [{
    slot: 'EMPTY',
    code: '- NO CHROME -',
    name: tx.noChromeInstalled,
    bonusTxt: '',
    bonusChips: [],
    hasBonus: false,
    border: 'rgba(214,170,78,0.1)',
    codeColor: '#5f6a55',
    hasEnhancementControls: false,
    attachmentRows: [],
    hasLinkedEnhancements: false,
    linkedEnhancementsLabel: '',
    uninstall: () => {},
  }];
  const chromeCount = installedChrome.length;
  const chromeBonusCharacter = S.sheetEditing
    ? { equipped: sheetDraftEquipped }
    : activeCharacter;
  const chromeBonuses = deps.cyberwareBonuses(chromeBonusCharacter);
  const chromeEffectGroups = chromeBonuses.groups.map(group => ({
    ...group,
    effects: group.effects.map(effect => ({
      ...effect,
      sourceLabel: effect.from || effect.sourceCode || 'CHROME',
      typeLabel: String(effect.type || '').replace(/([A-Z])/g, ' $1').toUpperCase(),
    })),
  }));
  const noChromeEffects = chromeEffectGroups.length === 0;
  const armor = deps.armorTotal(activeCharacter);
  const activeShield = deps.normalizeShield(activeCharacter.shield);
  const shieldProducts = (deps.products || [])
    .filter(item => item && (Number(item.shieldHp) > 0 || Number(item.maxHp) > 0))
    .map(item => {
      const maxHp = deps.asNumber(item.shieldHp ?? item.maxHp, 0, 0, 999);
      return { ...item, shieldMaxHp: maxHp };
    })
    .filter(item => item.shieldMaxHp > 0);
  const activeShieldProduct = activeShield ? shieldProducts.find(item => item.code === activeShield.itemId) : null;
  const shieldDamageAmount = S.shieldDamageAmount ?? '';
  const shieldRepairAmount = S.shieldRepairAmount ?? '';
  const shieldHpPct = activeShield ? deps.clampPct(activeShield.hp / Math.max(1, activeShield.maxHp) * 100) : 0;
  const shieldStatusColor = !activeShield ? '#6f7a64' : activeShield.hp <= 0 ? '#c0635b' : activeShield.hp < activeShield.maxHp ? '#d6aa4e' : '#3fe0d0';
  const shieldOptions = [{ code: '', label: activeShield ? 'TROCAR ESCUDO' : 'EQUIPAR ESCUDO', selected: !activeShield, notSelected: !!activeShield }]
    .concat(shieldProducts.map(item => ({
      code: item.code,
      label: (item.name || item.code) + ' // ' + item.shieldMaxHp + ' HP',
      selected: !!activeShield && activeShield.itemId === item.code,
      notSelected: !activeShield || activeShield.itemId !== item.code,
    })));
  const shieldPanel = {
    equipped: !!activeShield,
    empty: !activeShield,
    name: activeShieldProduct ? (activeShieldProduct.name || activeShieldProduct.code) : (activeShield ? activeShield.itemId : 'SEM ESCUDO'),
    itemId: activeShield ? activeShield.itemId : '',
    hpLabel: activeShield ? activeShield.hp + '/' + activeShield.maxHp : '--',
    statusLabel: !activeShield ? 'NAO EQUIPADO' : activeShield.hp <= 0 ? 'DESTRUIDO' : 'OCUPA 1 BRACO',
    statusColor: shieldStatusColor,
    hpPct: shieldHpPct,
    options: shieldOptions,
    hasOptions: shieldProducts.length > 0,
    noOptions: shieldProducts.length === 0,
    damageAmount: shieldDamageAmount,
    repairAmount: shieldRepairAmount,
    onEquip: (e) => deps.equipShield(e.target.value),
    remove: () => deps.removeShield(),
    damageOne: () => deps.damageActiveShield(1),
    damageCustom: () => deps.damageActiveShield(shieldDamageAmount),
    repairCustom: () => deps.repairActiveShield(shieldRepairAmount),
    repairFull: () => deps.repairActiveShield(activeShield ? activeShield.maxHp : 0),
    onDamageAmount: (e) => deps.setState({ shieldDamageAmount: e.target.value }),
    onRepairAmount: (e) => deps.setState({ shieldRepairAmount: e.target.value }),
  };
  const sheetBasePanelStyle = 'position:fixed;z-index:71;max-width:96vw;background:linear-gradient(165deg,#0e120d,#080a07);overflow-y:auto;';
  const sheetPanelStyle = S.sheetExpanded
    ? sheetBasePanelStyle + 'left:50%;top:50%;width:min(1040px,96vw);max-height:92vh;transform:translate(-50%,-50%);border:1px solid rgba(214,170,78,0.38);box-shadow:0 30px 90px rgba(0,0,0,0.72),0 0 42px rgba(214,170,78,0.12);animation:overlayIn .2s ease;'
    : sheetBasePanelStyle + 'top:0;right:0;bottom:0;width:560px;border-left:1px solid rgba(214,170,78,0.35);box-shadow:-20px 0 60px rgba(0,0,0,0.6);animation:panelIn .26s cubic-bezier(.2,.7,.2,1);';

  return {
    canEditSheet, canSaveSheet, canPlayerCreateSheet,
    isGmSheet: !!S.gm,
    activeIp, activeIpPct: deps.clampPct(activeIp / 1000 * 100),
    portraitUrl: activeCharacter.portraitUrl || '',
    noPortrait: !activeCharacter.portraitUrl,
    triggerPlayerPortraitUpload: () => deps.triggerFileInput('player-portrait-upload'),
    onPlayerPortraitUpload: (e) => deps.onPlayerPortraitUpload(e),
    sheetPanelWidth: S.sheetExpanded ? 'min(1040px,96vw)' : '560px',
    sheetPanelStyle,
    sheetExpanded: !!S.sheetExpanded,
    strongestSkillRows,
    armor, shieldPanel, attrList, slots, chromeCount, skillRows, skillRowColumns,
    chromeEffectGroups, noChromeEffects,
    sheetTabs,
    sheetTabCore: sheetTab === 'core',
    sheetTabSkills: sheetTab === 'skills',
    sheetTabConditions: sheetTab === 'conditions',
    sheetTabIp: sheetTab === 'ip',
    sheetTabChrome: sheetTab === 'chrome',
    sheetTabNotes: sheetTab === 'notes',
    sheetTabNotesExisting: sheetTab === 'notes' && !S.sheetCreating,
    showHumanityRecovery, humanityTherapyAmount, onHumanityTherapyAmount, applyHumanityTherapyClick,
    rollMoraleBoost1, rollMoraleBoost4, rollMoraleBoost9,
    showNetrunningTab, sheetTabNetrunning: sheetTab === 'netrunning',
    netrunnerRank, netActionsPerTurnValue, netrunningAbilityRows,
    netProgramRows,
    noNetPrograms: netProgramRows.length === 0,
    netProgramOptions,
    hasNetProgramOptions: netProgramOptions.length > 1,
    onInstallNetProgram: (e) => deps.installNetrunningProgram(e.target.value),
    netProgramSlotLabel: netProgramSummary.slotsUsed + '/' + netProgramSummary.slotLimit + ' SLOTS',
    netProgramSlotColor: netProgramSummary.overLimit ? '#c0635b' : '#3fe0d0',
    hasNetProgramWarning: netProgramSummary.overLimit,
    netProgramWarning: netProgramSummary.warning,
    netProgramModifierLabels,
    hasNetProgramModifierLabels: netProgramModifierLabels.length > 0,
    conditionLocationOptions, conditionInjuryOptions, conditionStatusOptions,
    criticalInjuryRows, noCriticalInjuries: criticalInjuryRows.length === 0,
    statusEffectRows, noStatusEffects: statusEffectRows.length === 0,
    conditionDeltas, woundFlags, passiveStatusBadges, hasPassiveStatusBadges, healingBreakdown,
    onConditionLocation: (e) => deps.setState({ conditionLocation: e.target.value, conditionInjuryId: '' }),
    onConditionInjury: (e) => deps.setState({ conditionInjuryId: e.target.value }),
    onConditionStatus: (e) => deps.setState({ conditionStatusId: e.target.value }),
    addSelectedInjury: () => deps.addCriticalInjury(conditionLocation, selectedInjuryId),
    addSelectedStatus: () => deps.addStatusEffect(selectedStatusId),
    applyNaturalHealingRest: () => deps.applyNaturalHealingRest(activeCharacter.id),
    advanceRound: () => deps.advanceConditionTime('round'),
    advanceMinute: () => deps.advanceConditionTime('min'),
    advanceHour: () => deps.advanceConditionTime('hour'),
    ipPurchaseRows,
    ipRankLimitLabel: (S.ipOneRankPerSession ? '1 RANK/SESSAO ATIVO' : '1 RANK/SESSAO OFF') + (S.ipRankPurchasedThisSession ? ' // USADO' : ''),
    ipRankLimitStyle: 'lm-ip-rank-limit' + (S.ipOneRankPerSession ? ' lm-ip-rank-limit--active' : ' lm-ip-rank-limit--inactive'),
    toggleIpRankLimit: () => deps.setState({ ipOneRankPerSession: !S.ipOneRankPerSession }),
    ipHistoryOpen: S.ipHistoryOpen,
    ipHistoryToggleLabel: S.ipHistoryOpen ? 'FECHAR' : 'ABRIR',
    toggleIpHistory: () => deps.setState({ ipHistoryOpen: !S.ipHistoryOpen }),
    ipLogRows, noIpLog: ipLogRows.length === 0,
    sheetDerived,
    traumaLogoUrl: './assets/trauma-team-logo.png',
    traumaPlan, traumaPlanName, traumaPlanCode, traumaMemberName, traumaCardStyle, traumaPlanOptions,
    showRemoveTraumaPlan, showUseExecutiveBackup, onRemoveTraumaPlan, onUseExecutiveBackup,
    sheetCharacterBtns, playerCharacterCards,
    sheetEditing: S.sheetEditing, notSheetEditing: !S.sheetEditing, sheetCreating: S.sheetCreating,
    editSheet: () => deps.editSheet(), createSheetCharacter: () => deps.createSheetCharacter(), createPlayerCharacter: () => deps.createPlayerCharacter(), cancelSheetEdit: () => deps.cancelSheetEdit(), saveSheetDraft: () => deps.saveSheetDraft(),
    sheetName: sheetDraft.name, sheetRole: sheetDraft.role, sheetLevel: sheetDraft.level, sheetRoleAbilityRank: sheetDraft.roleAbilityRank, sheetCredits: sheetDraft.credits,
    sheetHealthCur: sheetDraft.healthCur, sheetRamUsed: sheetDraft.ramUsed, sheetHumanityLoss: sheetDraft.humanityLoss, sheetReputation: sheetDraft.reputation, sheetNotes: sheetDraft.notes,
    sheetAlliances: sheetDraft.alliances, sheetEnemies: sheetDraft.enemies, sheetPersonalTraits: sheetDraft.personalTraits, sheetHobbies: sheetDraft.hobbies,
    sheetNotesAutosaveLabel: S.sheetNotesAutosave === 'pending' ? tx.notesSaving : (S.sheetNotesAutosave === 'saved' ? tx.notesSaved : ''),
    notesStory: (S.notesDraft || {}).notes || '', notesAlliances: (S.notesDraft || {}).alliances || '', notesEnemies: (S.notesDraft || {}).enemies || '', notesPersonalTraits: (S.notesDraft || {}).personalTraits || '', notesHobbies: (S.notesDraft || {}).hobbies || '',
    onNotesStory: (e) => deps.updateNotesField('notes', e.target.value),
    onNotesAlliances: (e) => deps.updateNotesField('alliances', e.target.value),
    onNotesEnemies: (e) => deps.updateNotesField('enemies', e.target.value),
    onNotesPersonalTraits: (e) => deps.updateNotesField('personalTraits', e.target.value),
    onNotesHobbies: (e) => deps.updateNotesField('hobbies', e.target.value),
    roleOptions, chromeStarterEditors,
    sheetStatTotal, sheetStatBudget: CPRED_STAT_BUDGET, sheetStatRemaining, sheetStatBudgetColor,
    sheetSkillSpend, sheetSkillBudget: CPRED_SKILL_BUDGET, sheetSkillRemaining, sheetSkillBudgetColor,
    onSheetName: (e) => updateSheetField('name', e.target.value),
    onSheetRole: (e) => updateSheetField('role', e.target.value),
    onSheetLevel: (e) => updateSheetField('level', e.target.value),
    onSheetRoleAbilityRank: (e) => updateSheetField('roleAbilityRank', e.target.value),
    onSheetCredits: (e) => updateSheetField('credits', e.target.value),
    onSheetHealthCur: (e) => updateSheetField('healthCur', e.target.value),
    onSheetRamUsed: (e) => updateSheetField('ramUsed', e.target.value),
    onSheetHumanityLoss: (e) => updateSheetField('humanityLoss', e.target.value),
    onSheetReputation: (e) => updateSheetField('reputation', e.target.value),
    onSheetNotes: (e) => updateSheetField('notes', e.target.value),
    onSheetAlliances: (e) => updateSheetField('alliances', e.target.value),
    onSheetEnemies: (e) => updateSheetField('enemies', e.target.value),
    onSheetPersonalTraits: (e) => updateSheetField('personalTraits', e.target.value),
    onSheetHobbies: (e) => updateSheetField('hobbies', e.target.value),
    attrEditors, skillEditors, skillEditorColumns,
  };
}

// component: the Component instance. state/setState/api/app/ensureGm/flash/
// activeCharacter/normalizeCharacter/normalizeStats/normalizeEquipped/
// normalizeArmor/normalizeSkills/derivedStats/traumaPlanKey/equippedCodes/
// updateActiveCharacter/updateCharacterById/applyCharacterPatch/
// naturalHealingPerRest/cyberSourceBreakdown/uploadImage/store/gearList/
// canManageOwnSheet already live there (shared well beyond the sheet view).
export function sheetHandlers(component) {
  function sheetDraftFrom(character) {
    const c = component.normalizeCharacter(character || {});
    const base = c.base || {};
    const derived = component.derivedStats(base, c);
    return {
      id: c.id || '',
      name: c.name || '',
      role: c.role || 'Solo',
      level: String(c.level || 1),
      roleAbilityRank: String(c.roleAbilityRank ?? 4),
      credits: String(c.credits ?? component.state.credits ?? 0),
      healthCur: String((c.health && c.health.cur) ?? derived.hpMax),
      ramUsed: String(c.ramUsed ?? component.state.ramUsed ?? 0),
      humanityLoss: String(c.humanityLoss ?? 0),
      reputation: String(c.reputation ?? 0),
      traumaPlan: component.traumaPlanKey(c),
      notes: c.notes || '',
      alliances: c.alliances || '',
      enemies: c.enemies || '',
      personalTraits: c.personalTraits || '',
      hobbies: c.hobbies || '',
      equipped: component.normalizeEquipped(c.equipped),
      armor: component.normalizeArmor(c.armor),
      skills: component.normalizeSkills(c.skills, base).map(s => ({ ...s, level: String(s.level), bonus: String(s.bonus), difficult: !!s.difficult })),
      base: CPRED_STAT_ORDER.reduce((out, key) => ({ ...out, [key]: String(base[key] ?? 5) }), {}),
    };
  }

  // Independent of sheetDraft/sheetEditing so a player can fill these in
  // without GM login — mirrors the free-standing conditions self-removal.
  function notesFieldsFrom(character) {
    const c = character || {};
    return {
      notes: c.notes || '',
      alliances: c.alliances || '',
      enemies: c.enemies || '',
      personalTraits: c.personalTraits || '',
      hobbies: c.hobbies || '',
    };
  }

  function newSheetDraft() {
    const base = { INT: '6', REF: '8', DEX: '6', TECH: '6', COOL: '6', WILL: '7', LUCK: '5', MOVE: '6', BODY: '8', EMP: '4' };
    const derived = component.derivedStats(component.normalizeStats(base), { base, armor: CPRED_DEFAULT_ARMOR });
    return {
      id: '', name: '', role: 'Solo', level: '1', credits: '12000',
      roleAbilityRank: '4', healthCur: String(derived.hpMax), ramUsed: '0', humanityLoss: '0', traumaPlan: 'silver', notes: CPRED_STORY_TEMPLATE,
      alliances: '', enemies: '', personalTraits: '', hobbies: '',
      armor: component.normalizeArmor(CPRED_DEFAULT_ARMOR),
      equipped: [],
      skills: component.normalizeSkills(null, component.normalizeStats(base)).map(s => ({ ...s, level: String(s.level), bonus: String(s.bonus), difficult: !!s.difficult })),
      base,
    };
  }

  function selectCharacter(id) {
    const found = (component.state.characters || []).find(c => c.id === id);
    if (!found) return;
    const next = component.normalizeCharacter(found);
    component.setState({
      activeCharacterId: next.id,
      playerReady: true,
      credits: next.credits ?? component.state.credits,
      base: next.base || component.state.base,
      equipped: component.normalizeEquipped(next.equipped),
      owned: component.equippedCodes(next.equipped),
      health: next.health || component.state.health,
      ramUsed: next.ramUsed ?? 0,
      gearItems: next.gear || component.state.gearItems,
      sheetCreating: false,
      sheetDraft: component.state.sheetEditing ? sheetDraftFrom(next) : component.state.sheetDraft,
      notesDraft: notesFieldsFrom(next),
    });
  }

  function editSheet() {
    if (!component.state.gmAuthenticated && !component.canManageOwnSheet(component.activeCharacter().id)) {
      component.setState({ gmLoginOpen: true, gmLoginStatus: 'Login necessario para editar sua ficha' });
      return;
    }
    component.setState({ sheetEditing: true, sheetCreating: false, sheetDraft: sheetDraftFrom(component.activeCharacter()), sheetTab: 'core' });
  }

  function createPlayerCharacter() {
    if (!component.state.authAuthenticated) {
      component.setState({ gmLoginOpen: true, gmLoginStatus: 'Login necessario para criar ficha' });
      return;
    }
    component.setState({ sheetOpen: true, sheetExpanded: true, sheetEditing: true, sheetCreating: true, sheetDraft: newSheetDraft(), gm: false, sheetTab: 'core' });
  }

  function createSheetCharacter() {
    if (!component.state.gmAuthenticated) return createPlayerCharacter();
    component.setState({ sheetEditing: true, sheetCreating: true, sheetDraft: newSheetDraft(), sheetTab: 'core' });
  }

  function cancelSheetEdit() {
    component.setState({ sheetEditing: false, sheetCreating: false, sheetDraft: null });
  }

  async function saveSheetDraft() {
    const playerSave = !component.state.gmAuthenticated && component.state.authAuthenticated;
    if (!playerSave && !component.ensureGm('Login do mestre necessario para salvar ficha')) return;
    const d = component.state.sheetDraft || sheetDraftFrom(component.activeCharacter());
    const active = component.state.sheetCreating ? {} : component.activeCharacter();
    const name = (d.name || active.name || 'NEW OPERATIVE').trim().toUpperCase();
    const role = (d.role || active.role || 'EDGERUNNER').trim().toUpperCase();
    if (component.state.sheetCreating && !(d.name || '').trim()) {
      component.flash('Insira o nome do personagem.');
      return;
    }
    let id = d.id || active.id || (component.store().slug ? component.store().slug(name) : name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    if (playerSave && !d.id && !active.id) id = id + '-' + Date.now().toString(36);
    const base = {};
    CPRED_STAT_ORDER.forEach(k => { base[k] = component.asNumber(d.base && d.base[k], k === 'MOVE' ? 6 : 5, CPRED_STAT_MIN, component.cpredStatMax(k)); });
    const statTotal = CPRED_STAT_ORDER.reduce((sum, k) => sum + (base[k] || 0), 0);
    if (component.state.sheetCreating && statTotal !== CPRED_STAT_BUDGET) {
      component.flash('Distribua exatamente ' + CPRED_STAT_BUDGET + ' pontos de atributo. Atual: ' + statTotal + '.', 3200);
      return;
    }
    const armor = component.normalizeArmor(d.armor);
    const humanityLoss = component.asNumber(d.humanityLoss, 0, 0, 100);
    const reputation = component.asNumber(d.reputation, 0, 0, 10);
    const equipped = component.normalizeEquipped(d.equipped || active.equipped);
    const skills = component.normalizeSkills(d.skills, base).map(s => ({ id: s.id, name: s.name, stat: s.stat, level: s.level, bonus: s.bonus, difficult: !!s.difficult, total: s.total }));
    const skillSpend = component.skillSpend(skills);
    if (component.state.sheetCreating && skillSpend !== CPRED_SKILL_BUDGET) {
      component.flash('Distribua exatamente ' + CPRED_SKILL_BUDGET + ' pontos de pericia. Atual: ' + skillSpend + '.', 3200);
      return;
    }
    const derived = component.derivedStats(base, { ...active, base, armor, humanityLoss, equipped });
    const healthCur = component.asNumber(d.healthCur, derived.hpMax, 0, derived.hpMax);
    // Notes/alliances/etc are only taken from the draft on first creation — once a
    // character exists, they autosave independently (updateNotesField) and SALVAR
    // here must not clobber them with a stale snapshot taken when edit mode opened.
    const notesFields = component.state.sheetCreating ? {
      notes: d.notes || '',
      alliances: d.alliances || '',
      enemies: d.enemies || '',
      personalTraits: d.personalTraits || '',
      hobbies: d.hobbies || '',
    } : {};
    const character = {
      ...active,
      ...notesFields,
      id, name, role,
      initials: (name.slice(0, 2) || 'OP'),
      level: component.asNumber(d.level, 1, 1, 99),
      roleAbilityRank: component.asNumber(d.roleAbilityRank, 4, 1, 10),
      credits: component.asNumber(d.credits, 0, 0, 9999999),
      ip: component.asNumber(active.ip, 0, 0, 999999),
      ipLog: Array.isArray(active.ipLog) ? active.ipLog : [],
      health: { cur: healthCur, max: derived.hpMax },
      ramUsed: component.asNumber(d.ramUsed, 0, 0, 999),
      traumaPlan: component.traumaPlanKey(d),
      base,
      armor,
      humanityLoss,
      reputation,
      skills,
      derived,
      equipped,
      owned: component.equippedCodes(equipped),
      gear: active.gear || component.gearList,
      portraitUrl: active.portraitUrl || (component.store().svgCard && component.store().svgCard(name.slice(0, 2), name, role, '#3fe0d0')),
    };
    const status = component.state.sheetCreating ? component.tx().sheetCreated : component.tx().sheetSaved;
    component._charactersTouched = true;
    const savedRaw = component.api()
      ? (playerSave && component.api().characters.createPlayer ? await component.api().characters.createPlayer(character) : await component.api().characters.upsert(character))
      : character;
    const saved = component.normalizeCharacter(savedRaw);
    component.setState(s => ({
      characters: [...(s.characters || []).filter(c => c.id !== saved.id), saved],
      activeCharacterId: saved.id,
      credits: saved.credits,
      base: saved.base,
      equipped: component.normalizeEquipped(saved.equipped),
      owned: component.equippedCodes(saved.equipped),
      health: saved.health,
      ramUsed: saved.ramUsed,
      gearItems: saved.gear || s.gearItems,
      sheetEditing: false,
      sheetCreating: false,
      sheetDraft: null,
      gmStatus: status,
      toast: status,
    }));
    clearTimeout(component._tt);
    component._tt = setTimeout(() => component.setState({ toast: null }), 2400);
  }

  // Notes-tab fields (story/alliances/enemies/traits/hobbies) are editable by
  // anyone viewing an existing character's sheet — player included, no GM
  // login required — and autosave independent of sheetEditing/SALVAR, the
  // same way a player can clear their own condition without GM auth.
  function updateNotesField(key, value) {
    component.setState(s => ({ notesDraft: { ...(s.notesDraft || {}), [key]: value } }));
    scheduleNotesAutosave();
  }

  function scheduleNotesAutosave() {
    const characterId = component.activeCharacter().id;
    if (!characterId) return;
    component.setState({ sheetNotesAutosave: 'pending' });
    clearTimeout(component._notesAutosaveTimer);
    component._notesAutosaveTimer = setTimeout(async () => {
      const draft = component.state.notesDraft || {};
      const patch = {
        notes: draft.notes || '',
        alliances: draft.alliances || '',
        enemies: draft.enemies || '',
        personalTraits: draft.personalTraits || '',
        hobbies: draft.hobbies || '',
      };
      // Optimistic local update so a mid-flight roster poll doesn't stomp the
      // field before the request lands — mirrors applyCharacterPatch's shape
      // but without touching GM-gated fields (stats/credits/equipment).
      component.setState(s => ({
        characters: (s.characters || []).map(c => c.id === characterId ? { ...c, ...patch } : c),
      }));
      if (component.api() && component.api().characters.patchNotes) {
        await component.api().characters.patchNotes(characterId, patch);
      }
      component.setState({ sheetNotesAutosave: 'saved' });
      clearTimeout(component._notesAutosaveClearTimer);
      component._notesAutosaveClearTimer = setTimeout(() => {
        component.setState(s => s.sheetNotesAutosave === 'saved' ? { sheetNotesAutosave: null } : null);
      }, 2000);
    }, 900);
  }

  async function onPlayerPortraitUpload(e) {
    const file = e.target.files && e.target.files[0];
    const active = component.activeCharacter();
    const asset = await component.uploadImage(file, 'character-portrait', active.id);
    if (asset && asset.url) {
      component.updateActiveCharacter({ portraitUrl: asset.url });
      component.setState({ gmStatus: 'Player portrait uploaded' });
    }
    e.target.value = '';
  }

  // GM-only: strip a character's Trauma Team coverage entirely (e.g. missed
  // payment, contract dispute). Unlike condition removal, this isn't the
  // player's call — it revokes something they paid for.
  function removeTraumaPlan() {
    if (!component.ensureGm('Login do mestre necessario para revogar o plano trauma team')) return;
    const active = component.activeCharacter();
    component.applyCharacterPatch(active.id, { traumaPlan: 'nocoverage' });
    component.flash('TRAUMA TEAM :: PLANO REVOGADO');
  }

  // GM-only: the Executive plan's one-time revival. Restores full HP, clears
  // active injuries/status effects (new cloned body), and consumes the plan.
  function useExecutiveTraumaBackup() {
    if (!component.ensureGm('Login do mestre necessario para acionar o backup executivo')) return;
    const active = component.activeCharacter();
    if (component.traumaPlanKey(active) !== 'executivo') {
      component.flash('Personagem nao possui Plano Executivo ativo');
      return;
    }
    const derived = component.derivedStats(active.base || {}, active);
    component.applyCharacterPatch(active.id, {
      health: { ...(active.health || {}), cur: derived.hpMax, max: derived.hpMax },
      criticalInjuries: [],
      statusEffects: [],
      traumaPlan: 'nocoverage',
    });
    component.flash('BACKUP EXECUTIVO ACIONADO :: ' + (active.name || 'OPERATIVE') + ' RESTAURADO EM NOVO CORPO');
  }

  function toggleCriticalInjury(instanceId) {
    const active = component.activeCharacter();
    component.updateActiveCharacter({ criticalInjuries: condToggleCriticalInjuryTreated(active.criticalInjuries, instanceId) });
  }

  // Players remove their own conditions freely, no GM login required — once a
  // status/injury has been inflicted, clearing it is the player's call.
  function removeCriticalInjury(instanceId) {
    const active = component.activeCharacter();
    component.applyCharacterPatch(active.id, { criticalInjuries: condRemoveCriticalInjury(active.criticalInjuries, instanceId) });
  }

  function removeStatusEffect(instanceId) {
    const active = component.activeCharacter();
    component.applyCharacterPatch(active.id, { statusEffects: condRemoveStatusEffect(active.statusEffects, instanceId) });
  }

  function useStatusCharge(instanceId) {
    const active = component.activeCharacter();
    component.updateActiveCharacter({ statusEffects: condUseStatusCharge(active.statusEffects, instanceId) });
  }

  function advanceConditionTime(unit) {
    const active = component.activeCharacter();
    component.updateActiveCharacter({ statusEffects: condAdvanceConditionTime(active.statusEffects, unit) });
  }

  function applyNaturalHealingRest(targetId) {
    if (!component.ensureGm('Login do mestre necessario para aplicar cura')) return null;
    const id = targetId || component.activeCharacter().id;
    const active = component.normalizeCharacter((component.state.characters || []).find(c => c.id === id) || component.activeCharacter());
    const healing = component.naturalHealingPerRest(active);
    const max = active.health && active.health.max ? active.health.max : (active.derived && active.derived.hpMax) || healing.amount;
    const cur = active.health && active.health.cur != null ? Number(active.health.cur) || 0 : max;
    const next = Math.min(max, cur + healing.amount);
    component.updateCharacterById(active.id, { health: { ...(active.health || {}), cur: next, max } });
    const source = healing.sources.length ? ' // ' + component.cyberSourceBreakdown(healing.sources).join(' / ') : '';
    component.flash('Natural healing +' + (next - cur) + ' HP' + source);
    return { amount: next - cur, healing };
  }

  // Therapy amount is a GM-set manual value (CPR RAW leaves it to the GM's
  // judgement, no formula) — logged to chat via component.recoverHumanity,
  // never a dice roll.
  function applyHumanityTherapy(amount) {
    if (!component.ensureGm('Login do mestre necessario para aplicar terapia')) return;
    const value = component.asNumber(amount, 0, 0, 100);
    if (!value) { component.flash('Informe um valor de terapia maior que zero'); return; }
    const active = component.activeCharacter();
    component.recoverHumanity(active.id, value, { label: 'TERAPIA CLINICA', detail: 'GM aplicou terapia clinica' });
    component.setState({ humanityTherapyAmount: '' });
  }

  // Morale Boost (QG upgrade tiers, No Place Like Home): rolls the tier's
  // dice, then applies the RAW formula (moraleBoostRecovery) to the raw
  // faces — not the summed total, since Upgrade 9 keeps the higher die.
  function rollMoraleBoost(upgrade) {
    if (!component.ensureGm('Login do mestre necessario para aplicar Morale Boost')) return;
    const active = component.activeCharacter();
    const tier = [1, 4, 9].includes(upgrade) ? upgrade : 1;
    const dice = tier === 9 ? 2 : 1;
    component.roll({
      label: 'MORALE BOOST :: UPGRADE ' + tier,
      sides: 6,
      count: dice,
      mod: 0,
      skipActionPenalty: true,
      onResolved: (result) => {
        const amount = charMoraleBoostRecovery(tier, result.faces);
        component.recoverHumanity(active.id, amount, {
          label: 'MORALE BOOST :: UPGRADE ' + tier,
          detail: result.detail + ' :: +' + amount + ' HUM',
        });
      },
    });
  }

  // Interface Ability roll (CPR RAW NET Action): 1d10 + Interface rank
  // (roleAbilityRank on a Netrunner). DV/target resolution against a NET
  // Architecture is a GM call until that phase lands — this only rolls and
  // labels the check, same seam as rollFromRequest for other role rolls.
  function rollNetrunningAbility(ability) {
    const active = component.activeCharacter();
    const rank = component.asNumber(active.roleAbilityRank, 0, 0, 10);
    component.roll({
      actorId: active.id,
      label: 'INTERFACE :: ' + (ability.name || '').toUpperCase(),
      sides: 10,
      count: 1,
      mod: rank,
      check: true,
    });
  }

  function installNetrunningProgram(programId) {
    if (!programId) return;
    if (!component.ensureGm('Login do mestre necessario para instalar programa')) return;
    const program = netrunningProgramById(programId);
    if (!program) { component.flash('Programa nao encontrado no catalogo RAW'); return; }
    const active = component.activeCharacter();
    const current = component.normalizeInstalledPrograms(active.netPrograms);
    if (current.some(row => row.id === program.id)) {
      component.flash(program.name + ' ja esta instalado');
      return;
    }
    const next = component.normalizeInstalledPrograms(current.concat([{ id: program.id, rez: program.rez, maxRez: program.rez, state: 'rezzed' }]));
    component.updateActiveCharacter({ netPrograms: next });
    const summary = component.deckProgramSummary(next);
    component.flash('PROGRAMA INSTALADO :: ' + program.name + ' // ' + summary.slotsUsed + '/' + summary.slotLimit + ' slots');
  }

  function removeNetrunningProgram(programId) {
    if (!component.ensureGm('Login do mestre necessario para remover programa')) return;
    const program = netrunningProgramById(programId);
    const active = component.activeCharacter();
    const id = program ? program.id : String(programId || '').toLowerCase();
    const next = component.normalizeInstalledPrograms(active.netPrograms).filter(row => row.id !== id);
    component.updateActiveCharacter({ netPrograms: next });
    component.flash('PROGRAMA REMOVIDO :: ' + (program ? program.name : programId));
  }

  function damageNetrunningProgram(programId, amount) {
    if (!component.ensureGm('Login do mestre necessario para ajustar REZ')) return;
    const active = component.activeCharacter();
    const current = component.normalizeInstalledPrograms(active.netPrograms);
    const next = current.map(row => row.id === programId ? (component.damageProgramRez(row, amount) || row) : row);
    const changed = next.find(row => row.id === programId);
    component.updateActiveCharacter({ netPrograms: next });
    component.flash('REZ :: ' + programId + ' ' + (changed ? changed.rez + '/' + changed.maxRez + (changed.state === 'derezzed' ? ' :: DEREZZED' : '') : ''));
  }

  function repairNetrunningProgram(programId, amount) {
    if (!component.ensureGm('Login do mestre necessario para reparar REZ')) return;
    const active = component.activeCharacter();
    const current = component.normalizeInstalledPrograms(active.netPrograms);
    const next = current.map(row => row.id === programId ? (component.repairProgramRez(row, amount) || row) : row);
    const changed = next.find(row => row.id === programId);
    component.updateActiveCharacter({ netPrograms: next });
    component.flash('REZ :: ' + programId + ' ' + (changed ? changed.rez + '/' + changed.maxRez : ''));
  }

  function shieldProduct(itemId) {
    return (component.products || []).find(item => item && item.code === itemId && (Number(item.shieldHp) > 0 || Number(item.maxHp) > 0));
  }

  function equipShield(itemId) {
    if (!itemId) return;
    if (!component.ensureGm('Login do mestre necessario para equipar escudo')) return;
    const product = shieldProduct(itemId);
    if (!product) { component.flash('Escudo nao encontrado no catalogo'); return; }
    const maxHp = component.asNumber(product.shieldHp ?? product.maxHp, 0, 0, 999);
    if (!maxHp) { component.flash('Item sem HP de escudo'); return; }
    component.updateActiveCharacter({ shield: { itemId: product.code, hp: maxHp, maxHp } });
    component.flash((product.name || product.code) + ' EQUIPADO :: ESCUDO ' + maxHp + '/' + maxHp);
  }

  function removeShield() {
    if (!component.ensureGm('Login do mestre necessario para desequipar escudo')) return;
    component.updateActiveCharacter({ shield: null });
    component.flash('ESCUDO DESEQUIPADO');
  }

  function damageActiveShield(amount) {
    if (!component.ensureGm('Login do mestre necessario para degradar escudo')) return;
    const active = component.activeCharacter();
    const shield = component.normalizeShield(active.shield);
    if (!shield) { component.flash('Nenhum escudo equipado'); return; }
    const value = component.asNumber(amount, 0, 0, 999);
    if (!value) { component.flash('Informe dano de escudo maior que zero'); return; }
    const next = component.damageShield(shield, value);
    component.updateActiveCharacter({ shield: next });
    component.setState({ shieldDamageAmount: '' });
    component.flash('ESCUDO :: HP ' + next.hp + '/' + next.maxHp + (next.hp <= 0 ? ' :: DESTRUIDO' : ''));
  }

  function repairActiveShield(amount) {
    if (!component.ensureGm('Login do mestre necessario para reparar escudo')) return;
    const active = component.activeCharacter();
    const shield = component.normalizeShield(active.shield);
    if (!shield) { component.flash('Nenhum escudo equipado'); return; }
    const value = component.asNumber(amount, 0, 0, 999);
    if (!value) { component.flash('Informe reparo de escudo maior que zero'); return; }
    const next = component.repairShield(shield, value);
    component.updateActiveCharacter({ shield: next });
    component.setState({ shieldRepairAmount: '' });
    component.flash('ESCUDO :: HP ' + next.hp + '/' + next.maxHp);
  }

  function toggleCyberwareEnhancement(characterId, parentCode, enhancementCode) {
    if (!component.ensureGm('Login do mestre necessario para vincular chrome')) return;
    const current = (component.state.characters || []).find(c => c.id === characterId) || component.activeCharacter();
    const result = component.app().toggleCyberwareEnhancement.execute({
      character: current,
      parentCode,
      enhancementCode,
      normalizeEquipped: (equipped) => component.normalizeEquipped(equipped),
    });
    if (!result.ok) { component.flash(result.error); return; }
    component.setState(s => ({
      characters: (s.characters || []).map(c => c.id === current.id ? component.normalizeCharacter({ ...c, ...result.characterPatch }) : c),
      equipped: current.id === s.activeCharacterId ? component.normalizeEquipped(result.characterPatch.equipped) : s.equipped,
    }));
    component.flash(result.flashMessage);
  }

  function uninstallCyberware(code) {
    if (!component.ensureGm('Login do mestre necessario para desinstalar chrome')) return;
    const active = component.activeCharacter();
    const equipped = component.normalizeEquipped(active.equipped).filter(it => it.code !== code);
    const owned = component.equippedCodes(equipped);
    component.updateActiveCharacter({ equipped, owned });
    component.flash(code + ' DESINSTALADO');
  }

  function buyIpIncrease(kind, skillIndex) {
    if (!component.ensureGm('Login do mestre necessario para gastar IP')) return;
    const active = component.activeCharacter();
    const result = component.app().buyIpIncrease.execute({
      character: active,
      kind,
      skillIndex,
      ipOneRankPerSession: component.state.ipOneRankPerSession,
      ipRankPurchasedThisSession: component.state.ipRankPurchasedThisSession,
    });
    if (!result.ok) { if (result.error) component.flash(result.error); return; }
    component.setState(s => ({
      characters: (s.characters || []).map(c => c.id === active.id ? component.normalizeCharacter({ ...c, ...result.characterPatch }) : c),
      ...(result.statePatch || {}),
    }));
    component.flash(result.flashMessage);
  }

  return {
    sheetDraftFrom,
    notesFieldsFrom,
    newSheetDraft,
    selectCharacter,
    editSheet,
    createSheetCharacter,
    createPlayerCharacter,
    cancelSheetEdit,
    saveSheetDraft,
    updateNotesField,
    scheduleNotesAutosave,
    onPlayerPortraitUpload,
    removeTraumaPlan,
    useExecutiveTraumaBackup,
    toggleCriticalInjury,
    removeCriticalInjury,
    removeStatusEffect,
    useStatusCharge,
    advanceConditionTime,
    applyNaturalHealingRest,
    applyHumanityTherapy,
    rollMoraleBoost,
    rollNetrunningAbility,
    installNetrunningProgram,
    removeNetrunningProgram,
    damageNetrunningProgram,
    repairNetrunningProgram,
    equipShield,
    removeShield,
    damageActiveShield,
    repairActiveShield,
    toggleCyberwareEnhancement,
    uninstallCyberware,
    buyIpIncrease,
  };
}
