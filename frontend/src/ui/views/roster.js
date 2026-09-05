import { asNumber } from '../../domain/shared/num.ts';
import { CPRED_CRITICAL_INJURIES } from '../../domain/character/constants.ts';
import { CPRED_STATUS_PRESETS } from '../../domain/conditions/index.ts';
import { effectPresetCatalog } from '../../domain/effects/customEffects.ts';
import { CPRED_NETRUNNING_ABILITIES } from '../../domain/netrunning/constants.ts';
import { BREACH_CONNECTIONS, breachConnectionOptions, breachTierForDv, normalizeBreachConnection } from '../../domain/netrunning/index.ts';

// SYS.01/MESA // GM roster: every sheet at this table on one screen, with the
// switch that makes one of them active. Everything the GM edits — inventory,
// market, conditions, IP — already acts on the active character, so switching
// here is what makes those tools point at the right player; the quick console
// below the grid covers the handful of edits that were not worth a round trip
// through another page (HP, IP, eddies, one condition, one item).

// Console tabs: each card's quick buttons jump straight to one of these with
// that character made active, so "give Rook an item" is two clicks.
export const ROSTER_TABS = [
  { key: 'vitals', label: 'VITAIS' },
  { key: 'cond', label: 'CONDICOES' },
  { key: 'items', label: 'ITENS' },
  { key: 'net', label: 'NET' },
];

// Free-form item types the GM can hand out without a catalog entry.
export const ROSTER_CUSTOM_ITEM_TYPES = ['GEAR', 'WEAPON', 'ARMOR', 'CONSUMABLE', 'DATA', 'KEYCARD', 'CYBERWARE'];

// CPR RAW NET Architecture DVs (floors 6/8/10/12) plus the two hard tiers.
export const ROSTER_NET_DVS = [6, 8, 10, 12, 15, 17];

export const ROSTER_NET_CUSTOM_ABILITY = 'custom';

// CPR RAW: only Netrunners have an Interface rank. Anyone else rolls a flat
// 1d10 (mod 0) and the console says so before the request goes out.
export function interfaceRankOf(character) {
  const c = character || {};
  if (!String(c.role || '').toLowerCase().includes('netrunner')) return 0;
  return asNumber(c.roleAbilityRank, 0, 0, 10);
}

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
    const portrait = String(character.portraitUrl || '').trim();
    const jumpTo = (tab) => {
      deps.selectCharacter(character.id);
      deps.setState({ rosterTab: tab, rosterOpen: true });
    };
    return {
      id: character.id,
      active,
      portrait,
      hasPortrait: portrait.length > 0,
      noPortrait: portrait.length === 0,
      onCondition: () => jumpTo('cond'),
      onItem: () => jumpTo('items'),
      onNet: () => jumpTo('net'),
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
  const tab = ROSTER_TABS.some(row => row.key === S.rosterTab) ? S.rosterTab : 'vitals';

  // Custom item draft (ITENS tab).
  const customType = ROSTER_CUSTOM_ITEM_TYPES.includes(S.rosterCustomType) ? S.rosterCustomType : 'GEAR';
  const customName = String(S.rosterCustomName || '');
  const customQty = asNumber(S.rosterCustomQty, 1, 1, 999);
  const customNotes = String(S.rosterCustomNotes || '');

  // NET test draft (NET tab).
  const netAbilityIds = [...CPRED_NETRUNNING_ABILITIES.map(row => row.id), ROSTER_NET_CUSTOM_ABILITY];
  const netAbilityId = netAbilityIds.includes(S.rosterNetAbility) ? S.rosterNetAbility : netAbilityIds[0];
  const netAbility = CPRED_NETRUNNING_ABILITIES.find(row => row.id === netAbilityId) || null;
  const netDvRaw = String(S.rosterNetDv == null ? '' : S.rosterNetDv).trim();
  const netDv = netDvRaw === '' || Number.isNaN(Number(netDvRaw)) ? null : Number(netDvRaw);
  const netLabelDraft = String(S.rosterNetLabel || '');
  const netAll = !!S.rosterNetAll;
  const pcs = characters.filter(character => character.kind !== 'npc');
  const netTargets = netAll ? pcs : (activeCharacter.id ? [activeCharacter] : []);
  const netLabel = netAbility ? netAbility.name.toUpperCase() : (netLabelDraft.trim().toUpperCase() || 'TESTE NET');
  const activeInterface = interfaceRankOf(activeCharacter);
  // The link the test is rolled through: it modifies the check itself and,
  // once the run opens, the trace and the clock (see buildBreachConfig).
  const netConnection = normalizeBreachConnection(S.rosterNetConnection);
  const netConnectionRow = BREACH_CONNECTIONS[netConnection];
  const netTierLabel = netDv == null ? null : breachTierForDv(netDv);

  return {
    rosterOpen: open,
    rosterClosed: !open,
    toggleRoster: () => deps.setState({ rosterOpen: !open }),
    rosterToggleLabel: open ? 'RECOLHER' : 'ABRIR MESA',
    rosterTabs: ROSTER_TABS.map(row => ({
      key: row.key,
      label: row.label,
      style: 'lm-roster-tab' + (row.key === tab ? ' lm-roster-tab--on' : ''),
      onClick: () => deps.setState({ rosterTab: row.key }),
    })),
    rosterTabVitals: tab === 'vitals',
    rosterTabCond: tab === 'cond',
    rosterTabItems: tab === 'items',
    rosterTabNet: tab === 'net',

    rosterCustomName: customName,
    onRosterCustomName: (e) => deps.setState({ rosterCustomName: e.target.value }),
    rosterCustomTypeOptions: ROSTER_CUSTOM_ITEM_TYPES.map(type => ({
      value: type,
      label: type,
      selected: type === customType,
      notSelected: type !== customType,
    })),
    onRosterCustomType: (e) => deps.setState({ rosterCustomType: e.target.value }),
    rosterCustomQty: S.rosterCustomQty === undefined ? '1' : S.rosterCustomQty,
    onRosterCustomQty: (e) => deps.setState({ rosterCustomQty: e.target.value }),
    rosterCustomNotes: customNotes,
    onRosterCustomNotes: (e) => deps.setState({ rosterCustomNotes: e.target.value }),
    canGrantCustomItem: customName.trim().length > 0,
    grantRosterCustomItem: () => {
      if (!customName.trim()) return;
      const granted = deps.grantCustomGear({ name: customName.trim(), type: customType, qty: customQty, notes: customNotes.trim() });
      if (granted !== false) deps.setState({ rosterCustomName: '', rosterCustomNotes: '', rosterCustomQty: '1' });
    },

    rosterNetAbilityOptions: [
      ...CPRED_NETRUNNING_ABILITIES.map(row => ({
        value: row.id,
        label: row.name.toUpperCase() + (row.isAttack ? ' // ATAQUE' : ''),
        selected: row.id === netAbilityId,
        notSelected: row.id !== netAbilityId,
      })),
      { value: ROSTER_NET_CUSTOM_ABILITY, label: 'OUTRO (rotulo livre)', selected: netAbilityId === ROSTER_NET_CUSTOM_ABILITY, notSelected: netAbilityId !== ROSTER_NET_CUSTOM_ABILITY },
    ],
    onRosterNetAbility: (e) => deps.setState({ rosterNetAbility: e.target.value }),
    rosterNetCustom: netAbilityId === ROSTER_NET_CUSTOM_ABILITY,
    rosterNetAbilityDesc: netAbility ? netAbility.desc : 'Rotulo livre: o jogador rola Interface + 1d10 com o nome que voce escrever.',
    rosterNetLabel: netLabelDraft,
    onRosterNetLabel: (e) => deps.setState({ rosterNetLabel: e.target.value }),
    rosterNetDv: netDvRaw,
    onRosterNetDv: (e) => deps.setState({ rosterNetDv: e.target.value }),
    rosterNetDvChips: ROSTER_NET_DVS.map(dv => ({
      label: 'DV ' + dv,
      style: 'lm-roster-chip' + (netDv === dv ? ' lm-roster-chip--on' : ''),
      onClick: () => deps.setState({ rosterNetDv: String(dv) }),
    })),
    rosterNetConnectionOptions: breachConnectionOptions().map(link => ({
      value: link.id,
      label: link.label.toUpperCase() + ' // ' + link.hint,
      selected: link.id === netConnection,
      notSelected: link.id !== netConnection,
    })),
    onRosterNetConnection: (e) => deps.setState({ rosterNetConnection: e.target.value }),
    rosterNetConnectionSummary: netConnectionRow.label.toUpperCase()
      + (netConnectionRow.checkMod ? ' // CHECK ' + (netConnectionRow.checkMod > 0 ? '+' : '') + netConnectionRow.checkMod : ' // CHECK +0')
      + ' // TRACE x' + netConnectionRow.traceMultiplier.toFixed(2),
    rosterNetAll: netAll,
    rosterNetAllStyle: 'lm-roster-chip' + (netAll ? ' lm-roster-chip--on' : ''),
    toggleRosterNetAll: () => deps.setState({ rosterNetAll: !netAll }),
    rosterNetTargetLabel: netAll
      ? 'TODOS OS PJS (' + pcs.length + ')'
      : (activeCharacter.name || 'OPERATIVE') + ' // INTERFACE ' + activeInterface,
    rosterNetNoInterface: !netAll && !!activeCharacter.id && activeInterface === 0,
    rosterNetPreview: netLabel + ' :: 1d10 + INTERFACE'
      + (netConnectionRow.checkMod ? ' ' + (netConnectionRow.checkMod > 0 ? '+' : '') + netConnectionRow.checkMod : '')
      + (netDv != null ? ' vs DV ' + netDv + ' // ARCHITECTURE ' + String(netTierLabel).toUpperCase() : ' (DV a criterio do mestre)'),
    canSendNetTest: netTargets.length > 0 && (netAbility != null || netLabelDraft.trim().length > 0),
    sendRosterNetTest: () => {
      if (netTargets.length === 0) return;
      if (!netAbility && !netLabelDraft.trim()) return;
      deps.requestNetTest({
        targets: netTargets.map(character => character.id),
        abilityId: netAbility ? netAbility.id : ROSTER_NET_CUSTOM_ABILITY,
        label: netLabel,
        dv: netDv,
        connection: netConnection,
      });
    },
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

    // Free-form item: no catalog row behind it, so it goes through the same
    // normalizer the sheet uses and is tagged source:'gm-custom'.
    grantCustomGear(draft) {
      if (!component.ensureGm('Login do mestre necessario para dar itens')) return false;
      const name = String((draft && draft.name) || '').trim();
      if (!name) { component.flash('Item precisa de nome'); return false; }
      const stamp = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
      const item = component.normalizeGearItem({
        id: component.slug(name) + '-' + stamp,
        name,
        type: String((draft && draft.type) || 'GEAR').toUpperCase(),
        qty: asNumber(draft && draft.qty, 1, 1, 999),
        notes: String((draft && draft.notes) || '').trim(),
        source: 'gm-custom',
      }, 0);
      const character = active();
      updateGear([...component.normalizeGearList(character.gear), item], item.name + ' entregue a ' + character.name);
      return true;
    },

    // NET test: one comms request per target, each carrying that target's
    // own Interface rank as the modifier (like initiative carries REF), so
    // the player rolls it with one tap and the result comes back tagged. The
    // link the run happens over rides along: it modifies this very check and
    // then shapes the Breach run the roll opens.
    requestNetTest(draft) {
      if (!component.ensureGm('Login do mestre necessario para pedir teste')) return false;
      const targets = Array.isArray(draft && draft.targets) ? draft.targets : [];
      if (targets.length === 0) return false;
      const label = String((draft && draft.label) || 'TESTE NET').trim().toUpperCase() || 'TESTE NET';
      const dv = draft && draft.dv != null && !Number.isNaN(Number(draft.dv)) ? Number(draft.dv) : null;
      const connection = normalizeBreachConnection(draft && draft.connection);
      const link = BREACH_CONNECTIONS[connection];
      const names = [];
      targets.forEach(id => {
        const character = component.characterById(id);
        if (!character || !character.id) return;
        const mod = interfaceRankOf(character) + link.checkMod;
        const opts = { label, sides: 10, count: 1, mod, check: true, combatantId: character.id, netrunning: draft.abilityId || ROSTER_NET_CUSTOM_ABILITY, netConnection: connection };
        if (dv != null) opts.dv = dv;
        const text = 'Pedido de teste NET para ' + (character.name || 'OPERATIVO') + ': ' + label
          + ' (Interface ' + interfaceRankOf(character) + (link.checkMod ? ' ' + (link.checkMod > 0 ? '+' : '') + link.checkMod + ' ' + link.label.toUpperCase() : '')
          + ' + 1d10' + (dv != null ? ' vs DV ' + dv : '') + ')';
        component.postChat({ kind: 'request', text, request: opts });
        names.push(character.name || 'OPERATIVO');
      });
      if (names.length) component.flash('Teste NET enviado: ' + names.join(', '));
      return names.length > 0;
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
