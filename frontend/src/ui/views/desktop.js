import { LIMIAR_TIER_COLORS } from '../view/constants.js';
import { CPRED_STAT_ORDER } from '../../domain/character/constants.ts';
import { buildBodyMap } from '../../domain/items/bodyMapEngine.ts';
import { gameTabStyle } from '../view/styles.js';

const BODY_REGION_LABELS = {
  skull: 'CABECA',
  eyes: 'OLHOS',
  ears: 'OUVIDOS',
  torso: 'TORSO',
  leftArm: 'BRACO ESQ',
  rightArm: 'BRACO DIR',
  leftLeg: 'PERNA ESQ',
  rightLeg: 'PERNA DIR',
  skin: 'PELE',
  fullBody: 'FULL BODY',
};

const BODY_STATUS_LABELS = {
  online: 'ONLINE',
  offline: 'OFFLINE',
  damaged: 'DANIFICADO',
  destroyed: 'DESTRUIDO',
};

const BODY_STATUS_COLORS = {
  online: '#3fe0d0',
  offline: '#5f6a55',
  damaged: '#d6aa4e',
  destroyed: '#c0635b',
};

const BODY_ANCHORS = {
  skull: { x: 360, y: 160, side: 'left' },
  eyes: { x: 350, y: 182, side: 'left' },
  ears: { x: 396, y: 180, side: 'right' },
  torso: { x: 360, y: 340, side: 'right' },
  leftArm: { x: 150, y: 236, side: 'left' },
  rightArm: { x: 570, y: 236, side: 'right' },
  leftLeg: { x: 296, y: 594, side: 'left' },
  rightLeg: { x: 424, y: 594, side: 'right' },
  skin: { x: 360, y: 420, side: 'left' },
  fullBody: { x: 360, y: 285, side: 'right' },
};

function bodyMapViewFrom(bodyMap, openItemId, setState) {
  const stackY = { left: 44, right: 50 };
  const regions = bodyMap.regions.filter(region => region.count > 0).map(region => {
    const anchor = BODY_ANCHORS[region.id] || { x: 360, y: 250, side: 'right' };
    const side = anchor.side;
    const boxX = side === 'left' ? 18 : 512;
    const boxY = stackY[side];
    const visibleItems = region.items.slice(0, 3).map((item, itemIndex) => {
      const itemId = `${region.id}-${item.code}-${itemIndex}`;
      const open = openItemId === itemId;
      return {
        id: itemId,
        name: item.name,
        code: item.code,
        description: item.description,
        statusLabel: BODY_STATUS_LABELS[item.status] || BODY_STATUS_LABELS.online,
        statusColor: BODY_STATUS_COLORS[item.status] || BODY_STATUS_COLORS.online,
        isWeapon: item.isWeapon,
        enhancementCount: item.enhancementCount,
        hasEnhancements: item.enhancementCount > 0,
        open,
        expandMark: open ? '-' : '+',
        onClick: () => setState({ bodyMapOpenItemId: open ? '' : itemId }),
      };
    });
    const hiddenCount = Math.max(0, region.items.length - visibleItems.length);
    const guideEndX = side === 'left' ? boxX + 190 : boxX;
    const guideEndY = boxY + 24;
    stackY[side] += Math.max(82, 58 + visibleItems.length * 28 + visibleItems.filter(item => item.open).length * 48 + (hiddenCount ? 16 : 0));
    return {
      id: region.id,
      label: BODY_REGION_LABELS[region.id] || region.id.toUpperCase(),
      count: region.count,
      side,
      dotColor: BODY_STATUS_COLORS[region.worstStatus] || BODY_STATUS_COLORS.online,
      dotClass: 'lm-bodymap-dot' + (region.worstStatus === 'damaged' || region.worstStatus === 'destroyed' ? ' lm-bodymap-dot--pulse' : ''),
      guidePath: `M ${anchor.x} ${anchor.y} C ${side === 'left' ? anchor.x - 52 : anchor.x + 52} ${anchor.y}, ${guideEndX} ${guideEndY}, ${guideEndX} ${guideEndY}`,
      anchorX: anchor.x,
      anchorY: anchor.y,
      boxStyle: `left:${(boxX / 720 * 100).toFixed(3)}%;top:${(boxY / 720 * 100).toFixed(3)}%;`,
      calloutClass: `lm-bodymap-callout lm-bodymap-callout--${side}`,
      items: visibleItems,
      hiddenCount,
      hasMore: hiddenCount > 0,
    };
  });
  return { regions };
}

// SYS.00 // DESKTOP: the home-tile grid, top-bar vitals (HP/RAM/Humanity),
// the floating conditions rail, and the last four leaf pages that never got
// their own named view in the P10 series — Inventory (SYS.02), Market
// (SYS.07), Dice (SYS.04, including the roll-overlay display state), and
// System (SYS.08: scanline/aura toggles + the GM's raw character/item CRUD
// forms) — plus the Mini-Games tab shell (SYS.05's Tarot/Nexus switcher).
// The dice-roll ENGINE itself (roll/commitRoll/finishRoll/rollFromRequest)
// stays in Component.js — every view calls into it, same as postChat/
// ensureGm/setState. rail/characterDetailFlags read sheet.js's enriched
// criticalInjuryRows/statusEffectRows/woundFlags/healingBreakdown/
// chromeCount, forwarded in as deps (same coupling sheet.js already
// documented when it was extracted).
export function desktopRenderVals(state = {}, deps = {}) {
  const S = state;
  const tx = deps.tx || {};
  const activeCharacter = deps.activeCharacter;
  const derived = deps.derived;
  const eff = deps.eff;
  const healthCur = deps.healthCur;
  const healthMax = deps.healthMax;
  const hum = deps.hum;
  const ramMax = deps.ramMax;
  const ramUsed = deps.ramUsed;

  const isAdmin = !!(S.authUser && S.authUser.role === 'admin');
  const clock = deps.clockText(S.now);

  const nav = {
    home: () => deps.go('desktop'),
    inventory: () => deps.go('inventory'),
    map: () => deps.openCampaignMap(),
    dice: () => deps.go('dice'),
    games: () => { deps.go('games'); },
    combat: () => deps.go('combat'),
    market: () => deps.go('market'),
    system: () => deps.go('system'),
  };
  const viewTitles = { desktop: tx.desktop, market: tx.market, dice: tx.dice, inventory: tx.inventory, map: tx.map, comms: tx.comms, combat: tx.combat, games: tx.miniGame, system: tx.system };

  const railConditionLabels = [
    ...deps.criticalInjuryRows.filter(r => !r.treated).map(r => r.name_pt || r.locationLabel),
    ...deps.statusEffectRows.map(r => r.label_pt),
  ].filter(Boolean);
  const railConditionCount = railConditionLabels.length;
  const railConditionSummary = railConditionLabels.join(' · ');

  // gear (inventory, SYS.02)
  const carriedGear = deps.normalizeGearList(activeCharacter.gear || deps.gearList);
  const cyberWeaponGear = deps.installedCyberweaponGear(activeCharacter);
  const allGear = [...carriedGear, ...cyberWeaponGear];
  const inventoryWeaponTotal = allGear.filter(g => deps.hasDamageProfile(g)).length;
  const inventoryEquippedTotal = allGear.filter(g => g.equipped).length;
  const inventoryFilter = S.inventoryFilter || 'ALL';
  const inventoryFilterMatch = (item, key) => {
    if (key === 'ALL') return true;
    if (key === 'WEAPON') return deps.hasDamageProfile(item);
    if (key === 'EQUIPPED') return !!item.equipped;
    if (key === 'CONSUMABLE') return item.type.includes('CONSUMABLE') || item.type.includes('MED') || item.type.includes('GRENADE') || item.type.includes('AMMO');
    return !deps.hasDamageProfile(item) && !item.type.includes('CONSUMABLE');
  };
  const inventoryFilterStyle = (active) => 'lm-inv-filter-btn' + (active ? ' lm-inv-filter-btn--active' : '');
  const inventoryFilters = ['ALL', 'WEAPON', 'EQUIPPED', 'CONSUMABLE', 'GEAR'].map(key => ({
    label: key,
    count: allGear.filter(item => inventoryFilterMatch(item, key)).length,
    countColor: inventoryFilter === key ? '#080a07' : '#3fe0d0',
    style: inventoryFilterStyle(inventoryFilter === key),
    onClick: () => deps.setState({ inventoryFilter: key }),
  }));
  const inventoryBodyView = !!S.inventoryBodyView;
  const installedChromeForBodyMap = typeof deps.installedCyberware === 'function'
    ? deps.installedCyberware(activeCharacter)
    : deps.normalizeEquipped(activeCharacter.equipped);
  const bodyMap = buildBodyMap(installedChromeForBodyMap);
  const bodyMapView = bodyMapViewFrom(bodyMap, S.bodyMapOpenItemId || '', deps.setState);
  const bodyMapEmpty = !bodyMap.hasAnyChrome;
  const bodyMapFigureClass = 'lm-bodymap-figure' + (bodyMapEmpty ? ' lm-bodymap-figure--empty' : '');
  const bodyMapToggleStyle = inventoryFilterStyle(inventoryBodyView);
  const filteredGear = allGear.filter(item => inventoryFilterMatch(item, inventoryFilter));
  const gear = filteredGear.map(g => {
    const isWeapon = deps.hasDamageProfile(g);
    const isCyberweapon = g.source === 'cyber' || g.kind === 'cyberweapon';
    const reqWarnings = [];
    if (g.reqBody && (eff.BODY || 0) < g.reqBody) reqWarnings.push('BODY ' + (eff.BODY || 0) + '/' + g.reqBody);
    if (g.reqRef && (eff.REF || 0) < g.reqRef) reqWarnings.push('REF ' + (eff.REF || 0) + '/' + g.reqRef);
    const hasReqWarning = reqWarnings.length > 0;
    const depleted = !isWeapon && g.qty <= 0;
    const status = depleted ? tx.depleted : g.equipped ? tx.equipped : 'READY';
    const statusColor = hasReqWarning ? '#c0635b' : depleted ? '#c0635b' : g.equipped ? '#3fe0d0' : '#d6aa4e';
    const useEnabled = isWeapon || !depleted;
    return {
      ...g,
      dmg: isWeapon ? deps.gearDamageText(g) : '—',
      dmgColor: isWeapon ? '#c0635b' : '#3a3f33',
      rofLabel: g.rof != null && g.rof !== '' ? String(g.rof) : '—',
      magLabel: g.mag != null && g.mag !== '' ? String(g.mag) : '—',
      skillLabel: g.skill || '—',
      handsLabel: g.hands != null && g.hands !== '' ? String(g.hands) : '—',
      isConcealable: !!g.concealable,
      halfSp: deps.ignoresHalfSpBadge(g),
      hasEnhancements: !!g.hasEnhancements,
      enhancementSummary: g.enhancementSummary || '',
      hasReqWarning,
      reqWarning: reqWarnings.join(' / '),
      isCyberweapon,
      hasModes: Array.isArray(g.modes) && g.modes.length > 0,
      modesLabel: Array.isArray(g.modes) ? g.modes.join(' / ') : '',
      hasSpecial: !!g.special,
      qtyLabel: String(g.qty),
      useLabel: g.lastUsedAt ? 'USADO' : isWeapon ? 'DANO' : 'READY',
      useActionLabel: isWeapon ? tx.roll : 'USAR',
      status,
      statusColor,
      statusBorder: statusColor,
      hasNotes: !!g.notes,
      canManage: deps.canEditSheet && !isCyberweapon,
      cardStyle: "background:#0b0e0a;border:1px solid " + (hasReqWarning ? 'rgba(192,99,91,0.36)' : 'rgba(214,170,78,0.18)') + ";border-left:3px solid " + g.rarity + ";padding:13px;min-width:0;opacity:" + (depleted ? '.58' : '1') + ";",
      useStyle: 'lm-use-btn' + (useEnabled ? ' lm-use-btn--on' : ' lm-use-btn--off'),
      equipLabel: g.equipped ? 'GUARDAR' : 'EQUIPAR',
      equipStyle: 'lm-equip-btn' + (g.equipped ? ' lm-equip-btn--on' : ' lm-equip-btn--off'),
      use: () => deps.useInventoryGear(g.id),
      toggleEquip: () => deps.toggleInventoryEquip(g.id),
      remove: () => deps.deleteInventoryGear(g.id),
    };
  });
  const activeIp = deps.asNumber(activeCharacter.ip, 0, 0, 999999);
  const currentRank = deps.asNumber(activeCharacter.roleAbilityRank, 4, 1, 10);
  const characterDetailVitals = [
    { label: 'HP ATUAL', value: healthCur + '/' + healthMax, detail: 'LIMIAR ' + derived.seriouslyWounded, color: healthCur <= derived.seriouslyWounded ? '#c0635b' : '#3fe0d0' },
    { label: 'SP CABECA', value: derived.currentHeadSp + '/' + derived.headSp, detail: 'ARMADURA CABECA', color: derived.currentHeadSp < derived.headSp ? '#c0635b' : '#d6aa4e' },
    { label: 'SP CORPO', value: derived.currentBodySp + '/' + derived.bodySp, detail: 'ARMADURA CORPO', color: derived.currentBodySp < derived.bodySp ? '#c0635b' : '#d6aa4e' },
    { label: 'RAM', value: ramUsed + '/' + ramMax, detail: 'CHROME BUFFER', color: ramUsed > ramMax ? '#c0635b' : '#b388ff' },
    { label: 'HUMANITY', value: hum + '/' + derived.humanityMax, detail: 'EMP ' + derived.effectiveEmp, color: derived.cyberpsychosisExtreme ? '#c0635b' : derived.cyberpsychosisActive ? '#d6aa4e' : '#3fe0d0' },
    { label: 'IP', value: String(activeIp), detail: 'ROLE RANK ' + currentRank, color: '#3fe0d0' },
  ];
  const characterDetailFlags = [
    { label: 'CONDICOES', value: String(railConditionCount), detail: railConditionSummary || 'SEM ALERTAS', color: railConditionCount ? '#c0635b' : '#3fe0d0' },
    { label: 'WOUND FLAGS', value: derived.actionPenalty > 0 ? '-' + derived.actionPenalty : String(derived.actionPenalty || 0), detail: deps.woundFlags, color: derived.actionPenalty > 0 ? '#c0635b' : '#d6aa4e' },
    { label: 'NATURAL HEAL', value: '+' + derived.naturalHealingPerRest, detail: deps.healingBreakdown, color: derived.naturalHealingMultiplier > 1 ? '#3fe0d0' : '#d6aa4e' },
    { label: 'CHROME', value: String(deps.chromeCount), detail: deps.chromeEffectGroupsLength + ' EFFECT GROUPS', color: deps.chromeCount ? '#b388ff' : '#6f7a64' },
    { label: 'ARSENAL', value: String(inventoryWeaponTotal), detail: allGear.length + ' ITEMS / ' + inventoryEquippedTotal + ' EQUIPADOS', color: inventoryWeaponTotal ? '#d6aa4e' : '#6f7a64' },
    { label: 'CREDITOS', value: deps.fmtShort(activeCharacter.credits ?? S.credits), detail: 'EURODOLLARS', color: '#d6aa4e' },
  ];
  const equippedGearSummary = gear.filter(g => g.equipped).slice(0, 4);
  const hasEquippedGearSummary = equippedGearSummary.length > 0;
  const noEquippedGearSummary = !hasEquippedGearSummary;
  const inventoryDraft = S.inventoryDraft || {};
  const inventoryTypeOptions = ['WEAPON - RANGED', 'WEAPON - MELEE', 'CONSUMABLE', 'ARMOR', 'AMMO', 'DATA - QUEST', 'GEAR'].map(type => ({ value: type, label: type, selected: inventoryDraft.type === type, notSelected: inventoryDraft.type !== type }));

  // market (SYS.07)
  const q = S.marketQuery.trim().toLowerCase();
  const all = deps.products;
  const marketLayout = S.marketLayout || 'holo';
  const filtered = all.filter(p => {
    if (S.marketCat !== 'ALL' && p.cat !== S.marketCat) return false;
    if (S.marketAvail !== 'ALL' && p.stock !== S.marketAvail) return false;
    if (q && !(p.code + ' ' + p.name + ' ' + p.cat + ' ' + (p.weaponClass || '') + ' ' + (p.skill || '')).toLowerCase().includes(q)) return false;
    return true;
  });
  const pageSize = S.marketPageSize || 8;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, S.marketPage || 1), pageCount);
  const pageStartIndex = (page - 1) * pageSize;
  const pageSlice = filtered.slice(pageStartIndex, pageStartIndex + pageSize);
  const items = pageSlice.map((p, i) => {
    const chips = [];
    const statMod = deps.effectMap(p.statMod);
    const skillBonus = deps.effectMap(p.skillBonus);
    Object.keys(statMod).forEach(k => chips.push('+' + statMod[k] + ' ' + k));
    Object.keys(skillBonus).forEach(k => chips.push('+' + skillBonus[k] + ' ' + k));
    if (p.armor) chips.push('+' + p.armor + ' ARMOR');
    if (p.ram) chips.push('+' + p.ram + ' RAM');
    const profile = deps.weaponProfile(p);
    const isWeaponProduct = p.kind === 'weapon' || p.kind === 'cyberweapon';
    if (isWeaponProduct && profile.dmg) chips.push(tx.dmg + ' ' + profile.dmg);
    if (isWeaponProduct && profile.skill) chips.push(tx.skill + ' ' + profile.skill);
    if (isWeaponProduct && profile.rof) chips.push(tx.rof + ' ' + profile.rof);
    if (isWeaponProduct && profile.mag) chips.push(tx.mag + ' ' + profile.mag);
    if (isWeaponProduct && profile.concealable) chips.push(tx.concealable);
    if (isWeaponProduct && deps.ignoresHalfSpBadge(profile)) chips.push(tx.halfSp);
    const fx = marketFx(pageStartIndex + i);
    return { ...p, ...fx, num: String(pageStartIndex + i + 1).padStart(2, '0'), priceLabel: deps.fmt(p.price), stockColor: stockColor(p.stock), soldout: p.stock === 'SOLD OUT', owned: p.kind === 'weapon' || p.kind === 'trauma-plan' ? false : S.owned.includes(p.code), bonusChips: chips, hasHumanityCost: p.kind !== 'weapon' && p.kind !== 'trauma-plan', hcostLabel: p.hcostNote || ('-' + (p.hcost || 0)), hasImage: !!p.imageUrl, noImage: !p.imageUrl, open: () => deps.setState({ selected: p }) };
  });
  const cats = ['ALL', ...Array.from(new Set(all.map(p => p.cat || p.category).filter(Boolean)))];
  const chips = cats.map(c => ({ label: c, count: c === 'ALL' ? all.length : all.filter(p => p.cat === c).length, onClick: () => deps.setState({ marketCat: c, marketPage: 1 }), style: deps.chipStyle(S.marketCat === c) }));
  const marketLayoutBtns = [{ k: 'holo', l: 'HOLO' }, { k: 'spec', l: 'SPEC' }, { k: 'terminal', l: 'TERMINAL' }].map(o => ({
    label: o.l, onClick: () => deps.setState({ marketLayout: o.k }), style: deps.viewStyle(marketLayout === o.k),
  }));
  const marketPageSizeBtns = [8, 12, 24].map(n => ({
    label: String(n), onClick: () => deps.setState({ marketPageSize: n, marketPage: 1 }), style: deps.pageBtnStyle(pageSize === n, false),
  }));
  const marketAvailBtns = ['ALL', 'IN STOCK', 'LIMITED', 'SOLD OUT'].map(a => ({
    label: a, onClick: () => deps.setState({ marketAvail: a, marketPage: 1 }), style: deps.pageBtnStyle(S.marketAvail === a, false),
  }));
  const goToMarketPage = (n) => { window.scrollTo({ top: 0, behavior: 'auto' }); deps.setState({ marketPage: n }); };
  const pageBtns = Array.from({ length: pageCount }, (_, i) => i + 1).map(n => ({
    label: String(n), onClick: () => goToMarketPage(n), style: deps.pageBtnStyle(page === n, false),
  }));

  // selected detail + comparison
  let selected = null;
  if (S.selected) {
    const p = S.selected;
    const eqp = deps.normalizeEquipped(S.equipped).find(it => it.code === p.code);
    const profile = deps.weaponProfile(p);
    const isWeaponProduct = p.kind === 'weapon' || p.kind === 'cyberweapon';
    const idx = all.findIndex(x => x.code === p.code);
    const cmp = [];
    if (isWeaponProduct) {
      const req = [profile.reqBody ? 'BODY ' + profile.reqBody : '', profile.reqRef ? 'REF ' + profile.reqRef : ''].filter(Boolean).join(' / ') || '—';
      [
        [tx.dmg, profile.dmg || '—'],
        [tx.skill, profile.skill || '—'],
        [tx.rof, profile.rof != null ? profile.rof : '—'],
        [tx.mag, profile.mag != null ? profile.mag : '—'],
        [tx.hands, profile.hands != null ? profile.hands : '—'],
        [tx.concealable, profile.concealable ? 'YES' : 'NO'],
        [tx.req, req],
      ].forEach(row => cmp.push({ label: row[0], from: 'REF', to: row[1], arrow: '—', diffTxt: '', color: '#d6aa4e' }));
      if (deps.ignoresHalfSpBadge(profile)) cmp.push({ label: tx.halfSp, from: 'REF', to: 'YES', arrow: '—', diffTxt: '', color: '#d6aa4e' });
      if (profile.modes.length) cmp.push({ label: 'MODES', from: 'REF', to: profile.modes.join(' / '), arrow: '—', diffTxt: '', color: '#d6aa4e' });
      if (profile.special) cmp.push({ label: 'SPECIAL', from: 'REF', to: profile.special, arrow: '—', diffTxt: '', color: '#d6aa4e' });
      if (p.kind === 'cyberweapon') cmp.push({ label: 'HUMANITY COST', from: eqp ? '-' + (eqp.hcost || 0) : '0', to: p.hcostNote || ('-' + (p.hcost || 0)), arrow: '—', diffTxt: '', color: p.hcostNote ? '#c0635b' : '#d6aa4e' });
    } else {
      CPRED_STAT_ORDER.forEach(k => {
        const from = (eqp && eqp.statMod && eqp.statMod[k]) || 0;
        const to = (p.statMod && p.statMod[k]) || 0;
        if (from || to) { const d = to - from; cmp.push({ label: k, from: '+' + from, to: '+' + to, diff: d, arrow: d > 0 ? '▲' : d < 0 ? '▼' : '—', diffTxt: d === 0 ? '' : (d > 0 ? '+' + d : '' + d), color: d > 0 ? '#3fe0d0' : d < 0 ? '#c0635b' : '#8b8a78' }); }
      });
      const skillCmpKeys = Array.from(new Set(Object.keys(deps.effectMap(eqp && eqp.skillBonus)).concat(Object.keys(deps.effectMap(p.skillBonus)))));
      skillCmpKeys.forEach(k => {
        const from = (eqp && eqp.skillBonus && eqp.skillBonus[k]) || 0;
        const to = (p.skillBonus && p.skillBonus[k]) || 0;
        if (from || to) { const d = to - from; cmp.push({ label: k, from: '+' + from, to: '+' + to, diff: d, arrow: d > 0 ? '▲' : d < 0 ? '▼' : '—', diffTxt: d === 0 ? '' : (d > 0 ? '+' + d : '' + d), color: d > 0 ? '#3fe0d0' : d < 0 ? '#c0635b' : '#8b8a78' }); }
      });
      const fa = (eqp && eqp.armor) || 0, ta = p.armor || 0;
      if (fa || ta) { const d = ta - fa; cmp.push({ label: 'ARMOR', from: '+' + fa, to: '+' + ta, arrow: d > 0 ? '▲' : d < 0 ? '▼' : '—', diffTxt: d === 0 ? '' : (d > 0 ? '+' + d : '' + d), color: d > 0 ? '#3fe0d0' : d < 0 ? '#c0635b' : '#8b8a78' }); }
      const fr = (eqp && eqp.ram) || 0, tr = p.ram || 0;
      if (fr || tr) { const d = tr - fr; cmp.push({ label: 'RAM', from: '+' + fr, to: '+' + tr, arrow: d > 0 ? '▲' : d < 0 ? '▼' : '—', diffTxt: d === 0 ? '' : (d > 0 ? '+' + d : '' + d), color: d > 0 ? '#3fe0d0' : d < 0 ? '#c0635b' : '#8b8a78' }); }
      if (p.kind !== 'trauma-plan') {
        const fh = (eqp && eqp.hcost) || 0, th = p.hcost || 0;
        const d = th - fh; cmp.push({ label: 'HUMANITY COST', from: fh ? '-' + fh : '0', to: '-' + th, arrow: d < 0 ? '▲' : d > 0 ? '▼' : '—', diffTxt: d === 0 ? '' : (d > 0 ? '+' + d : '' + d), color: d < 0 ? '#3fe0d0' : d > 0 ? '#c0635b' : '#8b8a78' });
      }
    }

    const after = S.credits - p.price;
    const canAfford = after >= 0 && p.stock !== 'SOLD OUT';
    const isTraumaPlanProduct = p.kind === 'trauma-plan';
    const isCurrentTraumaPlan = isTraumaPlanProduct && deps.traumaPlanKey(activeCharacter) === p.planKey;
    const isEquipped = p.kind === 'weapon' ? false : isTraumaPlanProduct ? isCurrentTraumaPlan : eqp && eqp.code === p.code;
    let buyLabel, buyBg, balLabel, balColor;
    if (isEquipped) { buyLabel = tx.alreadyInstalled; buyBg = '#3a3f33'; balLabel = tx.activeUnit; balColor = '#3fe0d0'; }
    else if (p.stock === 'SOLD OUT') { buyLabel = tx.depleted; buyBg = '#3a3f33'; balLabel = tx.outOfStock; balColor = '#c0635b'; }
    else if (!canAfford) { buyLabel = tx.insufficient + ' ₢'; buyBg = '#3a3f33'; balLabel = tx.shortBy + ' ' + deps.fmt(Math.abs(after)); balColor = '#c0635b'; }
    else { buyLabel = (isTraumaPlanProduct ? (S.lang === 'pt' ? 'ATIVAR PLANO' : 'ACTIVATE PLAN') : p.kind === 'weapon' ? tx.addToGear : tx.install) + ' →'; buyBg = '#d6aa4e'; balLabel = tx.balanceAfterInstall + ' ' + deps.fmt(after); balColor = '#6f7a64'; }
    const canInstall = !isEquipped && p.stock !== 'SOLD OUT' && canAfford;
    const buyStyle = 'lm-market-buy-btn' + (canInstall ? ' lm-market-buy-btn--on' : ' lm-market-buy-btn--off');

    const selectedFx = marketFx(Math.max(0, idx));
    const traumaPlanStatusLabel = isCurrentTraumaPlan ? '— ACTIVE PLAN —' : '— NOT ACTIVE —';
    selected = { ...p, ...selectedFx, num: String(idx + 1).padStart(2, '0'), priceLabel: deps.fmt(p.price), stockColor: stockColor(p.stock), equippedName: p.kind === 'weapon' ? 'CARRIED GEAR' : isTraumaPlanProduct ? traumaPlanStatusLabel : eqp ? eqp.code + ' INSTALLED' : '— NOT INSTALLED —', cmp, buyLabel, buyStyle, balLabel, balColor, hasImage: !!p.imageUrl, noImage: !p.imageUrl, buy: () => deps.buy(p) };
  }

  // dice app (SYS.04)
  const diceOpts = [4, 6, 8, 10, 12, 20, 100];
  const diceBtns = diceOpts.map(s => ({ label: 'd' + s, onClick: () => deps.setState({ diceSides: s }), style: deps.dieStyle(S.diceSides === s) }));
  const diceCount = Math.min(20, Math.max(1, S.diceCount || 1));
  const diceLabelBase = diceCount > 1 ? diceCount + 'd' + S.diceSides : 'd' + S.diceSides;
  const diceFullLabel = diceLabelBase + (S.diceMod ? (S.diceMod > 0 ? '+' + S.diceMod : S.diceMod) : '');
  const rolls = S.rolls.map(r => ({ ...r }));

  // roll overlay (global, but only ever opened from the dice page or a roll button elsewhere)
  const rollDone = !S.rolling && !!S.lastRoll;
  const rollFaceColor = S.rolling ? '#9a9883' : '#f0ead8';
  const dieAnim = S.rolling ? 'animation:dieShake .12s linear infinite;' : '';
  const preserveDiceStage = S.rollOverlay && S.dice3dActive;
  const dice3dFallback = S.rolling && !S.dice3dActive;
  const diceStageStatus = S.dice3dActive ? tx.physicsOnline : tx.rngFallback;
  const diceStageColor = S.dice3dActive ? '#3fe0d0' : '#d6aa4e';

  // system (SYS.08)
  const scanOn = S.scanOn ?? deps.scanlinesDefault ?? true;
  const auraOn = S.auraOn ?? deps.auraDefault ?? true;
  const gmCharacterDraft = S.gmCharacterDraft || {};
  const gmItemDraft = S.gmItemDraft || {};

  // mini-games tab shell (SYS.05: Tarot / Nexus Breach switcher)
  const gameTab = S.gameTab;
  const registerPassword = S.userRegisterPassword || '';
  const registerConfirm = S.userRegisterConfirm || '';
  const registerPasswordOk = registerPassword.length >= 8;
  const registerConfirmOk = !!registerConfirm && registerPassword === registerConfirm;

  return {
    scanlines: scanOn,
    aura: auraOn,
    clock, viewTitle: viewTitles[S.view] || '',
    creditsLabel: deps.fmt(S.credits), creditsShort: deps.fmtShort(S.credits),
    activeName: activeCharacter.name || 'OPERATIVE',
    activeRole: activeCharacter.role || 'EDGERUNNER',
    activeLevel: activeCharacter.level || 1,
    activeRoleAbilityRank: activeCharacter.roleAbilityRank || 4,
    activeIp,
    activeIpPct: deps.clampPct(activeIp / 1000 * 100),
    activeInitials: activeCharacter.initials || ((activeCharacter.name || 'OP').slice(0, 2)),
    activeFile: ((activeCharacter.name || 'operative').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'operative') + '.chr',
    activeNotes: activeCharacter.notes || '',
    isAdmin,
    gmLoginOpen: S.gmLoginOpen,
    userRegisterMode: !!S.userRegisterMode,
    userLoginMode: !S.userRegisterMode,
    gmLoginUser: S.gmLoginUser,
    gmLoginPassword: S.gmLoginPassword,
    gmLoginStatus: S.gmLoginStatus,
    userRegisterUsername: S.userRegisterUsername || '',
    userRegisterPassword: registerPassword,
    userRegisterConfirm: registerConfirm,
    registerPasswordHintStyle: 'lm-auth-rule' + (registerPasswordOk ? ' lm-auth-rule--ok' : ''),
    registerConfirmHintStyle: 'lm-auth-rule' + (registerConfirmOk ? ' lm-auth-rule--ok' : (registerConfirm ? ' lm-auth-rule--bad' : '')),
    registerConfirmHint: registerConfirmOk ? 'senhas conferem' : 'confirmar senha',
    gmButtonLabel: S.authAuthenticated ? (S.gmAuthenticated && S.gm ? 'SAIR' : tx.gm) : 'LOGIN',
    setPlayer: () => deps.toggleRole(false), setGm: () => (S.gmAuthenticated && S.gm ? deps.logoutGm() : deps.toggleRole(true)),
    loginGm: () => deps.loginGm(),
    registerPlayerUser: () => deps.registerPlayerUser(),
    closeGmLogin: () => deps.setState({ gmLoginOpen: false, gmLoginStatus: '', gmLoginPassword: '', userRegisterPassword: '', userRegisterConfirm: '' }),
    showLoginMode: () => deps.setState({ userRegisterMode: false, gmLoginStatus: '' }),
    showRegisterMode: () => deps.setState({ userRegisterMode: true, gmLoginStatus: '' }),
    onGmLoginUser: (e) => deps.setState({ gmLoginUser: e.target.value }),
    onGmLoginPassword: (e) => deps.setState({ gmLoginPassword: e.target.value }),
    onUserRegisterUsername: (e) => deps.setState({ userRegisterUsername: e.target.value }),
    onUserRegisterPassword: (e) => deps.setState({ userRegisterPassword: e.target.value }),
    onUserRegisterConfirm: (e) => deps.setState({ userRegisterConfirm: e.target.value }),
    setLangEn: () => deps.setState({ lang: 'en' }), setLangPt: () => deps.setState({ lang: 'pt' }),
    langEnBtnStyle: deps.langBtnStyle(S.lang === 'en', false),
    langPtBtnStyle: deps.langBtnStyle(S.lang === 'pt', true),
    playerBtnStyle: 'lm-role-btn' + (S.gm ? '' : ' lm-role-btn--active-gold'),
    gmBtnStyle: 'lm-role-btn lm-role-btn--left' + (S.gm ? ' lm-role-btn--active-teal' : ''),
    nav,
    openSheet: () => deps.setState({ sheetOpen: true, sheetExpanded: false }),
    openSheetModal: () => deps.setState({ sheetOpen: true, sheetExpanded: true, sheetEditing: false, sheetCreating: false, sheetDraft: null, sheetTab: 'core' }),
    closeSheet: () => deps.setState({ sheetOpen: false, sheetExpanded: false }),
    sheetOpen: S.sheetOpen,
    railOpen: S.railOpen, railCollapsed: !S.railOpen,
    openRail: () => deps.setState({ railOpen: true }), toggleRail: () => deps.setState({ railOpen: !S.railOpen }),
    railConditionCount, railHasConditions: railConditionCount > 0, railConditionSummary,
    isDesktop: S.view === 'desktop', notDesktop: S.view !== 'desktop', isMarket: S.view === 'market', isDice: S.view === 'dice', isInventory: S.view === 'inventory', isMap: S.view === 'map', isCombat: S.view === 'combat', notCombat: S.view !== 'combat', isGames: S.view === 'games', isSystem: S.view === 'system',
    health: { cur: healthCur, max: healthMax, pct: deps.clampPct(healthMax ? healthCur / healthMax * 100 : 0) },
    humanity: { cur: hum, max: derived.humanityMax, pct: deps.clampPct(derived.humanityMax ? hum / derived.humanityMax * 100 : 0) },
    reputation: deps.asNumber(deps.activeCharacter.reputation, 0, 0, 10),
    humanityHumColor: derived.cyberpsychosisExtreme ? '#c0635b' : derived.cyberpsychosisActive ? '#d6aa4e' : '#3fe0d0',
    hasCyberpsychosis: !!derived.cyberpsychosisActive,
    hasCyberpsychosisExtreme: !!derived.cyberpsychosisExtreme,
    cyberpsychosisTitle: tx.cyberpsychosisTitle,
    cyberpsychosisDesc: tx.cyberpsychosisDesc,
    cyberpsychosisExtremeTitle: tx.cyberpsychosisExtremeTitle,
    cyberpsychosisExtremeDesc: tx.cyberpsychosisExtremeDesc,
    ram: { cur: ramUsed, max: ramMax, pct: deps.clampPct(ramMax ? ramUsed / ramMax * 100 : 0) },
    characterDetailVitals, characterDetailFlags, equippedGearSummary, hasEquippedGearSummary, noEquippedGearSummary,
    gear,
    inventoryFilters, inventoryTotal: allGear.length, inventoryEquippedTotal, inventoryWeaponTotal, noGear: gear.length === 0,
    inventoryBodyView,
    bodyMapView,
    bodyMapImageSrc: 'assets/bodymap/cyber-vitruvian-bodymap.png',
    bodyMapEmpty,
    bodyMapFigureClass,
    bodyMapToggleStyle,
    bodyMapToggleState: inventoryBodyView ? '[ON]' : '[OFF]',
    toggleBodyView: () => deps.setState({ inventoryBodyView: !S.inventoryBodyView }),
    // market
    chips, items, resultCount: filtered.length, totalCount: all.length,
    pageStart: filtered.length ? pageStartIndex + 1 : 0,
    pageEnd: Math.min(pageStartIndex + items.length, filtered.length),
    hasPagination: filtered.length > pageSize,
    pageBtns, marketLayoutBtns, marketPageSizeBtns, marketAvailBtns,
    isMarketHolo: marketLayout === 'holo', isMarketSpec: marketLayout === 'spec', isMarketTerminal: marketLayout === 'terminal',
    prevPage: () => goToMarketPage(Math.max(1, page - 1)),
    nextPage: () => goToMarketPage(Math.min(pageCount, page + 1)),
    prevPageStyle: deps.pageBtnStyle(false, page <= 1),
    nextPageStyle: deps.pageBtnStyle(false, page >= pageCount),
    marketQuery: S.marketQuery, onMarketQuery: (e) => deps.setState({ marketQuery: e.target.value, marketPage: 1 }),
    selected, hasSelected: !!selected, closeModal: () => deps.setState({ selected: null }), stop: (e) => e.stopPropagation(),
    // dice
    diceBtns, diceCount, diceLabel: diceFullLabel, diceModLabel: (S.diceMod > 0 ? '+' : '') + S.diceMod,
    countInc: () => deps.setState(s => ({ diceCount: Math.min(20, (s.diceCount || 1) + 1) })),
    countDec: () => deps.setState(s => ({ diceCount: Math.max(1, (s.diceCount || 1) - 1) })),
    modInc: () => deps.setState(s => ({ diceMod: s.diceMod + 1 })), modDec: () => deps.setState(s => ({ diceMod: s.diceMod - 1 })),
    rollManual: () => deps.roll({ label: diceFullLabel, sides: S.diceSides, count: diceCount, mod: S.diceMod }),
    rolls, hasRolls: rolls.length > 0, noRolls: rolls.length === 0,
    // roll overlay
    rollOverlay: S.rollOverlay, notRollOverlay: !S.rollOverlay, rolling: S.rolling, rollDone, rollFace: S.rollFace, rollFaceColor, dieAnim, lastRoll: S.lastRoll || { label: '', detail: '', total: '', color: '#f0ead8', outcome: '' },
    preserveDiceStage, dice3dActive: S.dice3dActive, dice3dReady: S.dice3dReady, dice3dFallback, diceStageStatus, diceStageColor,
    closeRoll: () => deps.closeRoll(), rollAgain: () => deps.rollAgain(),
    // mini-game tab shell
    gameTab, isTarotTab: gameTab === 'tarot', isNexusTab: gameTab === 'nexus',
    selectTarotTab: () => deps.selectGameTab('tarot'), selectNexusTab: () => deps.selectGameTab('nexus'),
    tarotTabStyle: gameTabStyle(gameTab === 'tarot', '#d6aa4e'), nexusTabStyle: gameTabStyle(gameTab === 'nexus', '#3fe0d0'),
    gamesMaxWidth: gameTab === 'nexus' ? '1480px' : '1120px',
    // system
    toggleScan: () => deps.setState({ scanOn: !scanOn }), toggleAura: () => deps.setState({ auraOn: !auraOn }),
    scanState: scanOn ? 'ON' : 'OFF', scanColor: scanOn ? '#3fe0d0' : '#6f7a64',
    auraState: auraOn ? 'ON' : 'OFF', auraColor: auraOn ? '#3fe0d0' : '#6f7a64',
    scanRowStyle: deps.toggleRow(scanOn), auraRowStyle: deps.toggleRow(auraOn),
    inventoryTypeOptions,
    inventoryDraftName: inventoryDraft.name || '',
    inventoryDraftType: inventoryDraft.type || 'WEAPON - RANGED',
    inventoryDraftQty: inventoryDraft.qty || '1',
    inventoryDraftDmg: inventoryDraft.dmg || '',
    inventoryDraftCount: inventoryDraft.count || '',
    inventoryDraftSides: inventoryDraft.sides || '',
    inventoryDraftMod: inventoryDraft.mod || '0',
    inventoryDraftNotes: inventoryDraft.notes || '',
    onInventoryDraftName: (e) => deps.setState(s => ({ inventoryDraft: { ...(s.inventoryDraft || {}), name: e.target.value } })),
    onInventoryDraftType: (e) => deps.setState(s => ({ inventoryDraft: { ...(s.inventoryDraft || {}), type: e.target.value } })),
    onInventoryDraftQty: (e) => deps.setState(s => ({ inventoryDraft: { ...(s.inventoryDraft || {}), qty: e.target.value } })),
    onInventoryDraftDmg: (e) => deps.setState(s => {
      const parsed = deps.parseGearDamage(e.target.value);
      return { inventoryDraft: { ...(s.inventoryDraft || {}), dmg: e.target.value, ...(parsed ? { count: String(parsed.count), sides: String(parsed.sides), mod: String(parsed.mod) } : {}) } };
    }),
    onInventoryDraftCount: (e) => deps.setState(s => ({ inventoryDraft: { ...(s.inventoryDraft || {}), count: e.target.value } })),
    onInventoryDraftSides: (e) => deps.setState(s => ({ inventoryDraft: { ...(s.inventoryDraft || {}), sides: e.target.value } })),
    onInventoryDraftMod: (e) => deps.setState(s => ({ inventoryDraft: { ...(s.inventoryDraft || {}), mod: e.target.value } })),
    onInventoryDraftNotes: (e) => deps.setState(s => ({ inventoryDraft: { ...(s.inventoryDraft || {}), notes: e.target.value } })),
    addInventoryGear: () => deps.addInventoryGear(),
    gmCharacterName: gmCharacterDraft.name, gmCharacterRole: gmCharacterDraft.role,
    onGmCharacterName: (e) => deps.setState(s => ({ gmCharacterDraft: { ...s.gmCharacterDraft, name: e.target.value } })),
    onGmCharacterRole: (e) => deps.setState(s => ({ gmCharacterDraft: { ...s.gmCharacterDraft, role: e.target.value } })),
    triggerGmCharacterUpload: () => deps.triggerFileInput('gm-character-upload'),
    onGmCharacterImageUpload: (e) => deps.onGmCharacterImageUpload(e),
    createGmCharacter: () => deps.createGmCharacter(),
    gmItemCode: gmItemDraft.code, gmItemName: gmItemDraft.name, gmItemCat: gmItemDraft.cat, gmItemPrice: gmItemDraft.price, gmItemDesc: gmItemDraft.desc,
    onGmItemCode: (e) => deps.setState(s => ({ gmItemDraft: { ...s.gmItemDraft, code: e.target.value } })),
    onGmItemName: (e) => deps.setState(s => ({ gmItemDraft: { ...s.gmItemDraft, name: e.target.value } })),
    onGmItemCat: (e) => deps.setState(s => ({ gmItemDraft: { ...s.gmItemDraft, cat: e.target.value } })),
    onGmItemPrice: (e) => deps.setState(s => ({ gmItemDraft: { ...s.gmItemDraft, price: e.target.value } })),
    onGmItemDesc: (e) => deps.setState(s => ({ gmItemDraft: { ...s.gmItemDraft, desc: e.target.value } })),
    triggerGmItemUpload: () => deps.triggerFileInput('gm-item-upload'),
    onGmItemImageUpload: (e) => deps.onGmItemImageUpload(e),
    upsertGmItem: () => deps.upsertGmItem(),
    deleteGmItem: () => deps.deleteGmItem(),
  };
}

function marketFx(index) {
  const fxIndex = index % 6;
  return {
    fxClass: fxIndex % 2 ? 'chrome-fx-alt' : '',
    fxStyle: '--fx-delay:' + (fxIndex * 0.42).toFixed(2) + 's;--fx-sweep-delay:' + (0.8 + fxIndex * 0.57).toFixed(2) + 's;--fx-static-delay:' + (fxIndex * 0.18).toFixed(2) + 's;--fx-connect-delay:' + (0.25 + fxIndex * 0.33).toFixed(2) + 's;--fx-link-speed:' + (4.6 + (fxIndex % 3) * 0.7).toFixed(1) + 's;--fx-sweep-speed:' + (8.4 + (fxIndex % 4) * 0.8).toFixed(1) + 's;--fx-static-speed:' + (1.1 + (fxIndex % 3) * 0.17).toFixed(2) + 's;--fx-connect-speed:' + (4.1 + (fxIndex % 4) * 0.55).toFixed(1) + 's;--fx-scan-speed:' + (6.2 + (fxIndex % 3) * 0.7).toFixed(1) + 's;--fx-scan-delay:' + (0.35 + fxIndex * 0.41).toFixed(2) + 's',
  };
}

function stockColor(s) {
  return s === 'IN STOCK' ? '#3fe0d0' : s === 'LIMITED' ? '#d6aa4e' : '#c0635b';
}

// component: the Component instance. state/setState/api/app/ensureGm/flash/
// activeCharacter/normalizeCharacter/normalizeStats/normalizeGearList/
// normalizeGearItem/normalizeEquipped/equippedCodes/asNumber/slug/
// parseGearDamage/weaponProfile/installedCyberweaponGear/hasDamageProfile/
// gearFromProduct helpers/updateCharacterById/uploadImage/triggerFileInput/
// store/roll/app().installCyberware/nexusHandlers/tarotHandlers/
// combatHandlers already live there (shared well beyond these pages).
export function desktopHandlers(component) {
  function updateInventoryGear(gear, message) {
    const normalized = component.normalizeGearList(gear);
    component.updateActiveCharacter({ gear: normalized });
    if (message) component.flash(message);
  }

  function addInventoryGear() {
    if (!component.ensureGm('Login do mestre necessario para alterar inventario')) return;
    const draft = component.state.inventoryDraft || {};
    const name = String(draft.name || '').trim();
    if (!name) return component.flash('Informe o nome do equipamento');
    const parsed = component.parseGearDamage(draft.dmg);
    const count = component.asNumber(draft.count, parsed ? parsed.count : 0, 0, 20);
    const sides = component.asNumber(draft.sides, parsed ? parsed.sides : 0, 0, 100);
    const mod = component.asNumber(draft.mod, parsed ? parsed.mod : 0, -99, 99);
    const type = String(draft.type || 'GEAR').trim().toUpperCase();
    const item = component.normalizeGearItem({
      id: component.slug(name + '-' + Date.now().toString(36)),
      name,
      type,
      qty: component.asNumber(draft.qty, 1, 0, 999),
      dmg: draft.dmg || (count && sides ? count + 'd' + sides + (mod ? (mod > 0 ? '+' + mod : String(mod)) : '') : ''),
      count,
      sides,
      mod,
      notes: draft.notes || '',
      equipped: false,
    }, 0);
    const active = component.activeCharacter();
    const gear = [...component.normalizeGearList(active.gear || component.gearList), item];
    updateInventoryGear(gear, item.name + ' adicionado');
    component.setState({ inventoryDraft: { name: '', type: 'WEAPON - RANGED', qty: '1', dmg: '1d6', count: '1', sides: '6', mod: '0', notes: '' } });
  }

  function gearFromProduct(p) {
    const profile = component.weaponProfile(p);
    return component.normalizeGearItem({
      ...profile,
      id: component.slug((p.code || p.name || 'weapon') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)),
      code: p.code,
      name: p.name || p.code,
      type: p.weaponClass || p.cat || 'WEAPON',
      qty: 1,
      equipped: false,
      rarity: LIMIAR_TIER_COLORS[p.tier] || p.rarity,
      notes: [p.example, p.special].filter(Boolean).join(' // '),
    }, 0);
  }

  function toggleInventoryEquip(id) {
    if (!component.ensureGm('Login do mestre necessario para alterar inventario')) return;
    const gear = component.normalizeGearList(component.activeCharacter().gear || component.gearList).map(item => (
      item.id === id ? { ...item, equipped: !item.equipped } : item
    ));
    const changed = gear.find(item => item.id === id);
    updateInventoryGear(gear, changed ? changed.name + (changed.equipped ? ' equipado' : ' guardado') : 'Inventario atualizado');
  }

  function deleteInventoryGear(id) {
    if (!component.ensureGm('Login do mestre necessario para alterar inventario')) return;
    const current = component.normalizeGearList(component.activeCharacter().gear || component.gearList);
    const removed = current.find(item => item.id === id);
    updateInventoryGear(current.filter(item => item.id !== id), removed ? removed.name + ' excluido' : 'Item excluido');
  }

  function useInventoryGear(id) {
    const current = component.normalizeGearList(component.activeCharacter().gear || component.gearList);
    const actor = component.activeCharacter();
    const item = current.find(row => row.id === id) || component.installedCyberweaponGear(actor).find(row => row.id === id);
    if (!item) return;
    const isWeapon = component.hasDamageProfile(item);
    if (isWeapon) {
      component.roll({
        label: item.name.toUpperCase() + ' DMG',
        sides: item.sides,
        count: item.count,
        mod: 0,
        rollScope: 'damage',
        contributions: component.combatHandlers().combatDamageContributions(item, [], actor),
        breakdown: item.enhancementSummary ? ['ENH ' + item.enhancementSummary] : [],
        enhancementContext: component.cyberweaponRollContext(item),
      });
      return;
    }
    component.combatHandlers().useCombatUtility(component.activeCharacter().id, id);
  }

  function buy(p) {
    // Trauma Team plans are self-service — the player is buying their own
    // coverage tier, unlike gear/cyberware purchases which the GM approves.
    const isTraumaPlan = p.kind === 'trauma-plan';
    if (!isTraumaPlan && !component.ensureGm('Login do mestre necessario para alterar inventario')) return;
    if (component.state.credits < p.price || p.stock === 'SOLD OUT') return;
    if (!isTraumaPlan && p.kind !== 'weapon' && component.normalizeEquipped(component.state.equipped).some(it => it.code === p.code)) return;
    clearTimeout(component._tt);
    component._charactersTouched = true;

    if (!isTraumaPlan && p.kind !== 'weapon') {
      const active = component.activeCharacter();
      const result = component.app().installCyberware.execute({
        character: active,
        catalog: component.state.products,
        product: p,
        credits: component.state.credits,
        resolveInstallPayload: (item) => component.installPayload(item),
      });
      if (!result.ok) { if (result.error) component.flash(result.error); return; }
      component.setState(s => ({
        equipped: component.normalizeEquipped(result.characterPatch.equipped),
        owned: component.equippedCodes(result.characterPatch.equipped),
        credits: result.characterPatch.credits,
        characters: (s.characters || []).map(c => c.id === active.id ? component.normalizeCharacter({ ...c, ...result.characterPatch }) : c),
        selected: null,
        toast: result.toast,
      }));
      component._tt = setTimeout(() => component.setState({ toast: null }), 2600);
      return;
    }

    component.setState(s => {
      const credits = s.credits - p.price;
      const active = component.activeCharacter();
      let nextCharacter;
      let toast;
      if (isTraumaPlan) {
        nextCharacter = { ...active, traumaPlan: p.planKey, credits };
        toast = 'TRAUMA TEAM :: ' + (p.name || p.planKey).toUpperCase() + ' ACTIVATED';
      } else {
        const gear = [...component.normalizeGearList(active.gear || s.gearItems), gearFromProduct(p)];
        nextCharacter = { ...active, gear, credits };
        toast = p.code + ' ADDED TO GEAR';
      }
      if (component.api()) component.api().characters.upsert(nextCharacter);
      return {
        equipped: component.normalizeEquipped(nextCharacter.equipped || s.equipped),
        owned: component.equippedCodes(nextCharacter.equipped || s.equipped),
        gearItems: nextCharacter.gear || s.gearItems,
        credits,
        characters: (s.characters || []).map(c => c.id === active.id ? nextCharacter : c),
        selected: null,
        toast,
      };
    });
    component._tt = setTimeout(() => component.setState({ toast: null }), 2600);
  }

  async function onGmCharacterImageUpload(e) {
    const file = e.target.files && e.target.files[0];
    const asset = await component.uploadImage(file, 'gm-character-portrait', 'draft-character');
    if (asset && asset.url) {
      component.setState(s => ({ gmCharacterDraft: { ...s.gmCharacterDraft, portraitUrl: asset.url }, gmStatus: 'GM portrait staged' }));
    }
    e.target.value = '';
  }

  async function onGmItemImageUpload(e) {
    const file = e.target.files && e.target.files[0];
    const code = component.state.gmItemDraft.code || 'draft-item';
    const asset = await component.uploadImage(file, 'item-image', code);
    if (asset && asset.url) {
      component.setState(s => ({ gmItemDraft: { ...s.gmItemDraft, imageUrl: asset.url }, gmStatus: 'Item image staged' }));
    }
    e.target.value = '';
  }

  async function createGmCharacter() {
    if (!component.ensureGm('Login do mestre necessario para criar personagem')) return;
    const d = component.state.gmCharacterDraft;
    if (!(d.name || '').trim()) { component.flash('Nome do personagem obrigatorio.'); return; }
    const name = (d.name || 'NEW OPERATIVE').trim().toUpperCase();
    const role = (d.role || 'EDGERUNNER').trim().toUpperCase();
    const id = component.store().slug ? component.store().slug(name) : name.toLowerCase();
    const character = {
      id, name, role, level: 1, initials: name.slice(0, 2),
      credits: 12000, health: { cur: 35, max: 35 }, ramUsed: 0,
      base: { BODY: 5, REF: 5, INT: 5, TECH: 5, COOL: 5, EMP: 5 },
      equipped: [], owned: [], gear: component.gearList,
      portraitUrl: d.portraitUrl || (component.store().svgCard && component.store().svgCard(name.slice(0, 2), name, role, '#3fe0d0')),
      notes: 'Created by GM panel; ready for API persistence.',
    };
    component._charactersTouched = true;
    const saved = component.normalizeCharacter(component.api() ? await component.api().characters.upsert(character) : character);
    component.setState(s => ({
      characters: [...(s.characters || []).filter(c => c.id !== saved.id), saved],
      activeCharacterId: saved.id,
      credits: saved.credits,
      base: saved.base,
      equipped: component.normalizeEquipped(saved.equipped),
      owned: component.equippedCodes(saved.equipped),
      health: saved.health,
      ramUsed: saved.ramUsed,
      gearItems: saved.gear,
      gmCharacterDraft: { name: '', role: '', portraitUrl: '' },
      gmStatus: 'Character saved: ' + saved.name,
    }));
  }

  async function upsertGmItem() {
    if (!component.ensureGm('Login do mestre necessario para salvar item')) return;
    const d = component.state.gmItemDraft;
    if (!(d.name || '').trim()) { component.flash('Nome do item obrigatorio.'); return; }
    const code = (d.code || d.name || 'GM-ITEM').trim().toUpperCase();
    const cat = (d.cat || 'NEURAL').trim().toUpperCase();
    const payload = {
      id: component.store().slug ? component.store().slug(code) : code.toLowerCase(),
      code, name: (d.name || code).trim(), cat, category: cat,
      install: 'GM', price: Number(d.price || 0), hcost: 0, hlDice: 'GM',
      stock: 'IN STOCK', desc: d.desc || 'GM-created item. Adjust attributes, HL, and requirements before using it in campaign.',
      source: 'GM CRUD', requirements: 'Validate with GM', bonus: {}, skillBonus: {}, statMod: {}, imageUrl: d.imageUrl,
    };
    if (!payload.imageUrl && component.store().svgCard) payload.imageUrl = component.store().svgCard(payload.code, payload.name, payload.cat, '#d6aa4e');
    component._itemsTouched = true;
    const saved = component.api() ? await component.api().items.upsert(payload) : payload;
    component.setState(s => ({
      products: [...(s.products || []).filter(p => p.id !== saved.id && p.code !== saved.code), saved],
      gmStatus: 'Item saved: ' + saved.code,
    }));
  }

  async function deleteGmItem() {
    if (!component.ensureGm('Login do mestre necessario para deletar item')) return;
    const key = (component.state.gmItemDraft.code || '').trim().toUpperCase();
    if (!key) return component.setState({ gmStatus: 'Item code required' });
    component._itemsTouched = true;
    if (component.api()) await component.api().items.delete(key);
    component.setState(s => ({ products: (s.products || []).filter(p => p.code !== key && p.id !== key), gmStatus: 'Item deleted: ' + key }));
  }

  // Switch the Mini-Games tab (Tarot / Nexus Breach). Nexus mounts a vendored
  // DOM widget outside the framework's own render cycle, so switching away
  // must tear it down and switching in must (re)mount it explicitly.
  function selectGameTab(tab) {
    if (tab !== 'nexus') component.nexusHandlers().teardownNexus();
    // setState re-renders synchronously, so #limiar-nexus-root is already in
    // the DOM by the time mountNexus runs (no requestAnimationFrame needed).
    component.setState({ gameTab: tab });
    if (tab === 'nexus') component.nexusHandlers().mountNexus();
  }

  return {
    updateInventoryGear,
    addInventoryGear,
    gearFromProduct,
    toggleInventoryEquip,
    deleteInventoryGear,
    useInventoryGear,
    buy,
    onGmCharacterImageUpload,
    onGmItemImageUpload,
    createGmCharacter,
    upsertGmItem,
    deleteGmItem,
    selectGameTab,
  };
}
