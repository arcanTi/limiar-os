import { asNumber } from '../../domain/shared/num.ts';
import { CPRED_CRITICAL_INJURIES } from '../../domain/character/constants.ts';
import { CPRED_STATUS_PRESETS } from '../../domain/conditions/index.ts';
import { effectPresetCatalog } from '../../domain/effects/customEffects.ts';

// SYS.01/MESA // GM roster: every sheet at this table on one screen, with the
// switch that makes one of them active. Everything the GM edits — inventory,
// market, conditions, IP — already acts on the active character, so switching
// here is what makes those tools point at the right player; the quick console
// below the grid covers the handful of edits that were not worth a round trip
// through another page (HP, IP, eddies, one condition, one item).

const ROSTER_FILTERS = [
  { key: 'all', label: 'TODOS' },
  { key: 'pc', label: 'JOGADORES' },
  { key: 'npc', label: 'NPCS' },
];

function matchesQuery(character, query) {
  if (!query) return true;
  const haystack = [character.name, character.role, character.ownerUsername]
    .map(value => String(value || '').toLowerCase())
    .join(' ');
  return haystack.includes(query);
}

function hpColorFor(pct) {
  if (pct <= 25) return '#c0635b';
  if (pct <= 60) return '#d6aa4e';
  return '#3fe0d0';
}

export function rosterRenderVals(state = {}, deps = {}) {
  const S = state;
  const characters = Array.isArray(S.characters) ? S.characters : [];
  const query = String(S.rosterQuery || '').trim().toLowerCase();
  const filter = ROSTER_FILTERS.some(row => row.key === S.rosterFilter) ? S.rosterFilter : 'all';
  const clampPct = deps.clampPct || ((value) => Math.max(0, Math.min(100, Math.round(value))));

  const visible = characters.filter(character => {
    const isNpc = character.kind === 'npc';
    if (filter === 'pc' && isNpc) return false;
    if (filter === 'npc' && !isNpc) return false;
    return matchesQuery(character, query);
  });

  const rosterCards = visible.map(character => {
    const tone = deps.playerRoleTone(character.role || 'EDGERUNNER');
    const health = character.health || {};
    const hpMax = asNumber(health.max, 1, 1, 9999);
    const hpCur = asNumber(health.cur, hpMax, 0, hpMax);
    const hpPct = clampPct(hpCur / hpMax * 100);
    const injuries = (character.criticalInjuries || []).filter(row => !row.treated).length;
    const statuses = (character.statusEffects || []).length;
    const active = character.id === S.activeCharacterId;
    return {
      id: character.id,
      active,
      initials: String(character.initials || (character.name || 'OP')).slice(0, 2).toUpperCase(),
      name: character.name || 'OPERATIVE',
      role: character.role || 'EDGERUNNER',
      roleTag: tone.label,
      vars: '--pc-accent:' + tone.color + ';--pc-rgb:' + tone.rgb + ';',
      style: 'lm-roster-card' + (active ? ' lm-roster-card--active' : ''),
      level: asNumber(character.level, 1, 1, 99),
      ip: asNumber(character.ip, 0, 0, 999999),
      owner: character.ownerUsername || '--',
      kindLabel: character.kind === 'npc' ? 'NPC' : 'PJ',
      hpLabel: hpCur + '/' + hpMax,
      hpPct,
      hpColor: hpColorFor(hpPct),
      conditionCount: injuries + statuses,
      hasConditions: injuries + statuses > 0,
      conditionLabel: injuries + ' lesao(oes) // ' + statuses + ' efeito(s)',
      statusLabel: active ? 'ATIVO' : 'ABRIR',
      onSelect: () => deps.selectCharacter(character.id),
      onDelete: () => deps.deleteCharacter(character.id),
    };
  });

  const activeCharacter = characters.find(c => c.id === S.activeCharacterId) || characters[0] || {};
  const amount = asNumber(S.rosterAmount, 1, 1, 9999);

  const injuryCatalog = Object.values(CPRED_CRITICAL_INJURIES);
  const selectedInjuryId = injuryCatalog.some(row => row.id === S.rosterInjuryId)
    ? S.rosterInjuryId
    : (injuryCatalog[0] && injuryCatalog[0].id) || '';
  const statusCatalog = effectPresetCatalog(CPRED_STATUS_PRESETS, S.customEffects);
  const selectedStatusId = statusCatalog.some(row => row.id === S.rosterStatusId)
    ? S.rosterStatusId
    : (statusCatalog[0] && statusCatalog[0].id) || '';
  const products = Array.isArray(S.products) ? S.products : [];
  const selectedGrantId = products.some(p => p.id === S.rosterGrantId)
    ? S.rosterGrantId
    : (products[0] && products[0].id) || '';

  const gear = deps.normalizeGearList ? deps.normalizeGearList(activeCharacter.gear) : (activeCharacter.gear || []);

  const open = S.rosterOpen !== false;

  return {
    rosterOpen: open,
    rosterClosed: !open,
    toggleRoster: () => deps.setState({ rosterOpen: !open }),
    rosterToggleLabel: open ? 'RECOLHER' : 'ABRIR MESA',
    rosterCards,
    noRosterCards: rosterCards.length === 0,
    rosterCount: characters.length,
    rosterVisibleCount: rosterCards.length,
    rosterSummary: characters.length + ' FICHA(S) // ' + rosterCards.length + ' EM TELA',
    rosterQuery: S.rosterQuery || '',
    onRosterQuery: (e) => deps.setState({ rosterQuery: e.target.value }),
    clearRosterQuery: () => deps.setState({ rosterQuery: '' }),
    rosterFilterBtns: ROSTER_FILTERS.map(row => ({
      key: row.key,
      label: row.label,
      style: 'lm-roster-filter' + (row.key === filter ? ' lm-roster-filter--on' : ''),
      onClick: () => deps.setState({ rosterFilter: row.key }),
    })),

    rosterActiveName: activeCharacter.name || 'OPERATIVE',
    rosterActiveMeta: (activeCharacter.role || 'EDGERUNNER')
      + ' // LVL ' + asNumber(activeCharacter.level, 1, 1, 99)
      + ' // ' + asNumber(activeCharacter.ip, 0, 0, 999999) + ' IP',
    hasRosterActive: !!activeCharacter.id,
    rosterAmount: S.rosterAmount === undefined ? '1' : S.rosterAmount,
    onRosterAmount: (e) => deps.setState({ rosterAmount: e.target.value }),
    rosterDamage: () => deps.adjustHealth(-amount),
    rosterHeal: () => deps.adjustHealth(amount),
    rosterHealFull: () => deps.healFull(),
    rosterIpGain: () => deps.adjustIp(amount),
    rosterIpSpend: () => deps.adjustIp(-amount),
    rosterCreditsGain: () => deps.adjustCredits(amount),
    rosterCreditsSpend: () => deps.adjustCredits(-amount),

    rosterInjuryOptions: injuryCatalog.map(injury => ({
      value: injury.id,
      label: (injury.location === 'head' ? '[CABECA] ' : '[CORPO] ') + injury.name_pt,
      selected: injury.id === selectedInjuryId,
      notSelected: injury.id !== selectedInjuryId,
    })),
    onRosterInjury: (e) => deps.setState({ rosterInjuryId: e.target.value }),
    addRosterInjury: () => {
      const injury = injuryCatalog.find(row => row.id === selectedInjuryId);
      if (injury) deps.addInjury(injury.location || 'body', injury.id);
    },
    rosterStatusOptions: statusCatalog.map(status => ({
      value: status.id,
      label: (status.custom ? '* ' : '') + status.label_pt,
      selected: status.id === selectedStatusId,
      notSelected: status.id !== selectedStatusId,
    })),
    onRosterStatus: (e) => deps.setState({ rosterStatusId: e.target.value }),
    addRosterStatus: () => {
      const preset = statusCatalog.find(row => row.id === selectedStatusId);
      if (preset) deps.addStatus(preset);
    },
    rosterGrantOptions: products.map(product => ({
      value: product.id,
      label: (product.code ? product.code + ' // ' : '') + (product.name || product.id),
      selected: product.id === selectedGrantId,
      notSelected: product.id !== selectedGrantId,
    })),
    hasRosterGrantOptions: products.length > 0,
    onRosterGrant: (e) => deps.setState({ rosterGrantId: e.target.value }),
    grantRosterItem: () => {
      const product = products.find(row => row.id === selectedGrantId);
      if (product) deps.grantGear(product);
    },

    rosterInjuryRows: (activeCharacter.criticalInjuries || []).map(entry => ({
      instanceId: entry.instanceId,
      label: entry.name_pt + ' // ' + (entry.location === 'head' ? 'CABECA' : 'CORPO'),
      stateLabel: entry.treated ? 'TRATADA' : 'ABERTA',
      stateColor: entry.treated ? '#3fe0d0' : '#c0635b',
      onRemove: () => deps.removeInjury(entry.instanceId),
    })),
    rosterStatusRows: (activeCharacter.statusEffects || []).map(entry => ({
      instanceId: entry.instanceId,
      label: entry.label_pt || entry.id,
      stateLabel: entry.remaining ? entry.remaining.value + ' ' + entry.remaining.unit : 'INDEFINIDO',
      onRemove: () => deps.removeStatus(entry.instanceId),
    })),
    rosterGearRows: gear.map(item => ({
      id: item.id,
      label: item.name + (item.qty > 1 ? ' x' + item.qty : ''),
      typeLabel: item.type || 'GEAR',
      onRemove: () => deps.removeGear(item.id),
    })),
    noRosterInjuries: (activeCharacter.criticalInjuries || []).length === 0,
    noRosterStatuses: (activeCharacter.statusEffects || []).length === 0,
    noRosterGear: gear.length === 0,
  };
}

// component: the Component instance. Every write here goes through the same
// GM-gated character path the rest of the app uses (updateActiveCharacter /
// addCriticalInjury / addStatusEffect), so the roster adds no second way to
// mutate a sheet.
export function rosterHandlers(component) {
  function active() {
    return component.activeCharacter();
  }

  function updateGear(gear, message) {
    component.updateActiveCharacter({ gear: component.normalizeGearList(gear) });
    if (message) component.flash(message);
  }

  return {
    adjustHealth(delta) {
      if (!component.ensureGm('Login do mestre necessario para alterar HP')) return;
      const character = active();
      const health = character.health || { cur: 0, max: 0 };
      const max = asNumber(health.max, 0, 0, 9999);
      const cur = asNumber(health.cur, max, 0, max);
      const next = Math.max(0, Math.min(max, cur + delta));
      if (next === cur) return;
      component.updateActiveCharacter({ health: { ...health, cur: next } });
      component.flash(character.name + ' :: HP ' + next + '/' + max);
    },

    healFull() {
      if (!component.ensureGm('Login do mestre necessario para alterar HP')) return;
      const character = active();
      const health = character.health || { cur: 0, max: 0 };
      const max = asNumber(health.max, 0, 0, 9999);
      component.updateActiveCharacter({ health: { ...health, cur: max } });
      component.flash(character.name + ' :: HP cheio');
    },

    adjustIp(delta) {
      if (!component.ensureGm('Login do mestre necessario para alterar IP')) return;
      const character = active();
      const before = asNumber(character.ip, 0, 0, 999999);
      const after = Math.max(0, Math.min(999999, before + delta));
      if (after === before) return;
      const label = (delta > 0 ? 'Ajuste do mestre +' : 'Ajuste do mestre ') + (after - before);
      const log = [component.ipEntry(delta > 0 ? 'award' : 'spend', label, after - before, after), ...(character.ipLog || [])];
      component.updateActiveCharacter({ ip: after, ipLog: log });
      component.flash(character.name + ' :: ' + after + ' IP');
    },

    adjustCredits(delta) {
      if (!component.ensureGm('Login do mestre necessario para alterar eurodolares')) return;
      const character = active();
      const before = asNumber(character.credits, 0, 0, 99999999);
      const after = Math.max(0, before + delta);
      if (after === before) return;
      component.updateActiveCharacter({ credits: after });
      component.flash(character.name + ' :: ' + after + ' eb');
    },

    addInjury: (location, injuryId) => component.addCriticalInjury(location, injuryId, { source: 'gm-roster' }),
    addStatus: (preset) => component.addStatusEffect(preset, { source: 'gm-roster' }),
    removeInjury: (instanceId) => component.sheetHandlers().removeCriticalInjury(instanceId),
    removeStatus: (instanceId) => component.sheetHandlers().removeStatusEffect(instanceId),

    grantGear(product) {
      if (!component.ensureGm('Login do mestre necessario para dar itens')) return;
      const item = component.desktopHandlers().gearFromProduct(product);
      const character = active();
      updateGear([...component.normalizeGearList(character.gear), item], item.name + ' entregue a ' + character.name);
    },

    removeGear(gearId) {
      if (!component.ensureGm('Login do mestre necessario para remover itens')) return;
      const current = component.normalizeGearList(active().gear);
      const removed = current.find(item => item.id === gearId);
      updateGear(current.filter(item => item.id !== gearId), removed ? removed.name + ' removido' : 'Item removido');
    },

    deleteCharacter: (id) => component.desktopHandlers().deleteGmCharacter(id),
  };
}
