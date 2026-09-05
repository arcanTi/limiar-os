import { LIMIAR_TIER_COLORS } from '../view/constants.js';
import { CPRED_STAT_ORDER } from '../../domain/character/constants.ts';
import { buildBodyMap } from '../../domain/items/bodyMapEngine.ts';
import { isPurchasableProduct } from '../../domain/items/itemNormalizers.ts';
import { acquisitionMode, armorPenaltyOf, armorSp, hasWeaponStatBlock, purchaseQuantity } from '../../domain/items/marketAcquisition.ts';
import { equipWornArmor, repairWornArmor, unequipWornArmor, wornArmorSummary } from '../../domain/items/wornArmorEngine.ts';
import { gameTabStyle } from '../view/styles.js';
import { uploadedPortrait } from '../../domain/character/portrait.ts';
import {
  installAttachment,
  occupiedWeaponAttachmentSlots,
  removeAttachment,
  validateAttachmentInstallation,
  weaponAttachmentMaxSlots,
} from '../../domain/items/weaponAttachmentEngine.ts';

// First visual-market pilot: these ten catalog codes share one generated art
// direction, while every other product keeps its catalog-provided fallback.
const MARKET_ITEM_IMAGE_URLS = {
  BIOMON: '/assets/market/items/biomon.png',
  CHEMSKIN: '/assets/market/items/chemskin.png',
  'LIGHT-TAT': '/assets/market/items/light-tat.png',
  'NEURAL-LINK': '/assets/market/items/neural-link.png',
  'CHIP-SOCKET': '/assets/market/items/chip-socket.png',
  'INTERFACE-PLUGS': '/assets/market/items/interface-plugs.png',
  KERENZIKOV: '/assets/market/items/kerenzikov.png',
  SANDEVISTAN: '/assets/market/items/sandevistan.png',
  'PAIN-EDITOR': '/assets/market/items/pain-editor.png',
  CYBEREYE: '/assets/market/items/cybereye.png',
  'IMAGE-ENH': '/assets/market/items/image-enh.png',
  'LOWLIGHT-UV': '/assets/market/items/lowlight-uv.png',
  'TARGET-SCOPE': '/assets/market/items/target-scope.png',
  CYBERAUDIO: '/assets/market/items/cyberaudio.png',
  'AMP-HEARING': '/assets/market/items/amp-hearing.png',
  'RADIO-COMM': '/assets/market/items/radio-comm.png',
  'VOICE-STRESS': '/assets/market/items/voice-stress.png',
  AUDIOVOX: '/assets/market/items/audiovox.png',
  GILLS: '/assets/market/items/gills.png',
  'MUSCLE-LACE': '/assets/market/items/muscle-lace.png',
  'NASAL-FILTER': '/assets/market/items/nasal-filter.png',
  'HIDDEN-HOLSTER': '/assets/market/items/hidden-holster.png',
  'SKIN-WEAVE': '/assets/market/items/skin-weave.png',
  'SUBDERMAL-ARMOR': '/assets/market/items/subdermal-armor.png',
  CYBERARM: '/assets/market/items/cyberarm.png',
  'BIG-KNUCKS': '/assets/market/items/big-knucks.png',
  'GRAPPLE-HAND': '/assets/market/items/grapple-hand.png',
  'POPUP-GL': '/assets/market/items/popup-gl.png',
  TECHSCANNER: '/assets/market/items/techscanner.png',
  WOLVERS: '/assets/market/items/wolvers.png',
  CYBERLEG: '/assets/market/items/cyberleg.png',
  'JUMP-BOOSTER': '/assets/market/items/jump-booster.png',
  'LINEAR-SIGMA': '/assets/market/items/linear-sigma.png',
  'LINEAR-BETA': '/assets/market/items/linear-beta.png',
  MULTIOPTIC: '/assets/market/items/multioptic.png',
  'SENSOR-ARRAY': '/assets/market/items/sensor-array.png',
  'BACKUP-DRIVE': '/assets/market/items/backup-drive.png',
  'DNA-LOCK': '/assets/market/items/dna-lock.png',
  'HARD-CIRCUIT': '/assets/market/items/hard-circuit.png',
  'RANGE-UPGRADE': '/assets/market/items/range-upgrade.png',
  CHAINRIPP: '/assets/market/items/chainripp.png',
  'MANTIS-BLADE': '/assets/market/items/mantis-blade.png',
  MONOWIRE: '/assets/market/items/monowire.png',
  'REFLEX-CO': '/assets/market/items/reflex-co.png',
  'COMBAT-TAIL': '/assets/market/items/combat-tail.png',
  'SMART-GLASSES': '/assets/market/items/smart-glasses.png',
  'EMP-THREAD': '/assets/market/items/emp-thread.png',
  SKINWATCH: '/assets/market/items/skinwatch.png',
  TECHHAIR: '/assets/market/items/techhair.png',
  'BD-REC': '/assets/market/items/bd-rec.png',
  'CHEM-ANAL': '/assets/market/items/chem-anal.png',
  'MEM-CHIP': '/assets/market/items/mem-chip.png',
  'OLF-BOOST': '/assets/market/items/olf-boost.png',
  'SKILL-CHIP': '/assets/market/items/skill-chip.png',
  'TACT-BOOST': '/assets/market/items/tact-boost.png',
  'ANTI-DAZ': '/assets/market/items/anti-daz.png',
  CHYRON: '/assets/market/items/chyron.png',
  'COLOR-SH': '/assets/market/items/color-sh.png',
  'DARTGUN-EYE': '/assets/market/items/dartgun-eye.png',
  'MICRO-OPT': '/assets/market/items/micro-opt.png',
  'MICRO-VID': '/assets/market/items/micro-vid.png',
  'RAD-DET-OPT': '/assets/market/items/rad-det-opt.png',
  'TELE-OPT': '/assets/market/items/tele-opt.png',
  VIRTUALITY: '/assets/market/items/virtuality.png',
  'AUD-REC': '/assets/market/items/aud-rec.png',
  'BUG-DET': '/assets/market/items/bug-det.png',
  'HOM-TRAC': '/assets/market/items/hom-trac.png',
  'INT-AGENT': '/assets/market/items/int-agent.png',
  'LEVEL-DAMP': '/assets/market/items/level-damp.png',
  'RADAR-DET': '/assets/market/items/radar-det.png',
  'SCRAM-DESC': '/assets/market/items/scram-desc.png',
  'ENH-ANTI': '/assets/market/items/enh-anti.png',
  SNAKE: '/assets/market/items/snake.png',
  'AIR-SUPP': '/assets/market/items/air-supp.png',
  'SEX-IMPL': '/assets/market/items/sex-impl.png',
  'RAD-SON-INT': '/assets/market/items/rad-son-int.png',
  'TOX-BIND': '/assets/market/items/tox-bind.png',
  VAMPYRES: '/assets/market/items/vampyres.png',
  'SUB-POCKET': '/assets/market/items/sub-pocket.png',
  'STD-HAND': '/assets/market/items/std-hand.png',
  'STD-FOOT': '/assets/market/items/std-foot.png',
  'SKATE-FOOT': '/assets/market/items/skate-foot.png',
  'TALON-FOOT': '/assets/market/items/talon-foot.png',
  'WEB-FOOT': '/assets/market/items/web-foot.png',
  'HARD-SHIELD': '/assets/market/items/hard-shield.png',
  MEDSCAN: '/assets/market/items/medscan.png',
  'POP-MELEE': '/assets/market/items/pop-melee.png',
  'POP-SHIELD': '/assets/market/items/pop-shield.png',
  RIPPERS: '/assets/market/items/rippers.png',
  SCRATCHERS: '/assets/market/items/scratchers.png',
  'SH-CAM': '/assets/market/items/sh-cam.png',
  'SLICE-DICE': '/assets/market/items/slice-dice.png',
  'SUB-GRIP': '/assets/market/items/sub-grip.png',
  'TOOL-HAND': '/assets/market/items/tool-hand.png',
  'ART-SHOULDER': '/assets/market/items/art-shoulder.png',
  'FACE-QC': '/assets/market/items/face-qc.png',
  'QUICK-DIGITS': '/assets/market/items/quick-digits.png',
  SKYDRIVERS: '/assets/market/items/skydrivers.png',
  CYBERSPINE: '/assets/market/items/cyberspine.png',
  'CYBER-COND': '/assets/market/items/cyber-cond.png',
  'CONC-SLEEVE': '/assets/market/items/conc-sleeve.png',
  'GORILLA-ARMS': '/assets/market/items/gorilla-arms.png',
  'ENH-HYD-RAM': '/assets/market/items/enh-hyd-ram.png',
  'ENH-PNEU-ACT': '/assets/market/items/enh-pneu-act.png',
  'ENH-TUNG-REIN': '/assets/market/items/enh-tung-rein.png',
  'ENH-DBL-EDGE': '/assets/market/items/enh-dbl-edge.png',
  'ENH-MONO-EDG': '/assets/market/items/enh-mono-edg.png',
  'ENH-BARB-LIN': '/assets/market/items/enh-barb-lin.png',
  'ENH-ELECTRO': '/assets/market/items/enh-electro.png',
  'ENH-THERMAL': '/assets/market/items/enh-thermal.png',
  'TRAUMA-SILVER': '/assets/market/items/trauma-silver.png',
  'TRAUMA-GOLD': '/assets/market/items/trauma-gold.png',
  'TRAUMA-PLATINUM': '/assets/market/items/trauma-platinum.png',
  'TRAUMA-EXECUTIVE': '/assets/market/items/trauma-executive.png',
  'RADIO-SCAN-MUSIC': '/assets/market/items/radio-scan-music.png',
  CONTRACEPTIVE: '/assets/market/items/contraceptive.png',
  'CYBERDECK-ARM': '/assets/market/items/cyberdeck-arm.png',
  'POP-RANGED': '/assets/market/items/pop-ranged.png',
  'QUICK-MOUNT': '/assets/market/items/quick-mount.png',
  'GRIP-FOOT': '/assets/market/items/grip-foot.png',
  'PLASTIC-COVER': '/assets/market/items/plastic-cover.png',
  'REALSKINN-COVER': '/assets/market/items/realskinn-cover.png',
  'SUPERCHROME-COVER': '/assets/market/items/superchrome-cover.png',
  'MEDIUM-PISTOL': '/assets/market/items/medium-pistol.png',
  'HEAVY-PISTOL': '/assets/market/items/heavy-pistol.png',
  'VERY-HEAVY-PISTOL': '/assets/market/items/very-heavy-pistol.png',
  SMG: '/assets/market/items/smg.png',
  'HEAVY-SMG': '/assets/market/items/heavy-smg.png',
  SHOTGUN: '/assets/market/items/shotgun.png',
  'ASSAULT-RIFLE': '/assets/market/items/assault-rifle.png',
  'SNIPER-RIFLE': '/assets/market/items/sniper-rifle.png',
  'BOW-CROSSBOW': '/assets/market/items/bow-crossbow.png',
  'GRENADE-LAUNCHER': '/assets/market/items/grenade-launcher.png',
  'ROCKET-LAUNCHER': '/assets/market/items/rocket-launcher.png',
  'LIGHT-MELEE': '/assets/market/items/light-melee.png',
  'MEDIUM-MELEE': '/assets/market/items/medium-melee.png',
  'HEAVY-MELEE': '/assets/market/items/heavy-melee.png',
  'VERY-HEAVY-MELEE': '/assets/market/items/very-heavy-melee.png',
  'BRAWLING-BODY-LOW': '/assets/market/items/brawling-body-low.png',
  'BRAWLING-BODY-MID': '/assets/market/items/brawling-body-mid.png',
  'BRAWLING-BODY-HIGH': '/assets/market/items/brawling-body-high.png',
  'BRAWLING-BODY-SUPERHUMAN': '/assets/market/items/brawling-body-superhuman.png',
  SCOPE: '/assets/market/items/scope.png',
  'SMARTGUN-LINK': '/assets/market/items/smartgun-link.png',
  'EXTENDED-MAG': '/assets/market/items/extended-mag.png',
  'DRUM-MAG': '/assets/market/items/drum-mag.png',
  'UNDERBARREL-SHOTGUN': '/assets/market/items/underbarrel-shotgun.png',
  'UNDERBARREL-GL': '/assets/market/items/underbarrel-gl.png',
  'AMMO-M-PISTOL': '/assets/market/items/ammo-m-pistol.png',
  'AMMO-H-PISTOL': '/assets/market/items/ammo-h-pistol.png',
  'AMMO-VH-PISTOL': '/assets/market/items/ammo-vh-pistol.png',
  'AMMO-RIFLE': '/assets/market/items/ammo-rifle.png',
  'AMMO-SLUG': '/assets/market/items/ammo-slug.png',
  'AMMO-SHELL': '/assets/market/items/ammo-shell.png',
  'AMMO-ARROW': '/assets/market/items/ammo-arrow.png',
  'AMMO-GRENADE': '/assets/market/items/ammo-grenade.png',
  'AMMO-ROCKET': '/assets/market/items/ammo-rocket.png',
  'THERMAL-DAGGER': '/assets/market/items/thermal-dagger.png',
  'NATS-LONG-BARRELED-PISTOL': '/assets/market/items/nats-long-barreled-pistol.png',
  'E-TACK-RAPID-RESPONDER': '/assets/market/items/e-tack-rapid-responder.png',
  'STUN-BAYONET': '/assets/market/items/stun-bayonet.png',
  'SMART-GLOVE': '/assets/market/items/smart-glove.png',
  'HIGH-DENSITY-SHIELD': '/assets/market/items/high-density-shield.png',
  'LIGHT-METALGEAR': '/assets/market/items/light-metalgear.png',
  LEATHERS: '/assets/market/items/leathers.png',
  KEVLAR: '/assets/market/items/kevlar.png',
  'LIGHT-ARMORJACK': '/assets/market/items/light-armorjack.png',
  'BODYWEIGHT-SUIT': '/assets/market/items/bodyweight-suit.png',
  'MEDIUM-ARMORJACK': '/assets/market/items/medium-armorjack.png',
  'HEAVY-ARMORJACK': '/assets/market/items/heavy-armorjack.png',
  FLAK: '/assets/market/items/flak.png',
  METALGEAR: '/assets/market/items/metalgear.png',
  'BULLETPROOF-SHIELD': '/assets/market/items/bulletproof-shield.png',
  'SMART-EARS': '/assets/market/items/smart-ears.png',
  'CYBER-COND-INTEGRATED': '/assets/market/items/cyber-cond-integrated.png',
  'AMMO-BIOTOXIN': '/assets/market/items/ammo-biotoxin.png',
  'AMMO-POISON': '/assets/market/items/ammo-poison.png',
  'AMMO-TEARGAS': '/assets/market/items/ammo-teargas.png',
  'TOX-BELLADONNA': '/assets/market/items/tox-belladonna.png',
  'TOX-TOXIC-WASTE': '/assets/market/items/tox-toxic-waste.png',
  'TOX-ARSENIC': '/assets/market/items/tox-arsenic.png',
  'TOX-BIOTOXIN': '/assets/market/items/tox-biotoxin.png',
  'TOX-DESIGNER-POISON': '/assets/market/items/tox-designer-poison.png',
  'TOX-STONEFISH': '/assets/market/items/tox-stonefish.png',
  'TOX-ALCOHOL': '/assets/market/items/tox-alcohol.png',
  'TOX-PENTOTHAL': '/assets/market/items/tox-pentothal.png',
  'TOX-DESIGNER-DRUG': '/assets/market/items/tox-designer-drug.png',
};

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
    sheet: () => { deps.go('sheet'); deps.setState({ sheetTab: 'core' }); },
    tarot: () => { deps.go('games'); deps.setState({ gameTab: 'tarot' }); },
    nexus: () => { deps.go('games'); deps.setState({ gameTab: 'nexus' }); },
    mesa: () => deps.flash('Mesa (HQ) ainda nao tem pagina propria'),
    comms: () => deps.flash('Comms ainda nao tem pagina propria'),
  };
  const viewTitles = { desktop: tx.desktop, market: tx.market, dice: tx.dice, inventory: tx.inventory, map: tx.map, comms: tx.comms, combat: tx.combat, games: tx.miniGame, system: tx.system, sheet: tx.sheet };

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
    const isMelee = isWeapon && !!(deps.isMeleeWeapon && deps.isMeleeWeapon(g));
    const knowsReach = !!(g.melee || String(g.skill || '').trim());
    const isAttachment = String(g.kind || '').toLowerCase() === 'weaponattachment';
    const isShield = Number(g.maxHp ?? g.shieldHp) > 0;
    const shieldMaxHp = isShield ? Number(g.maxHp ?? g.shieldHp) : 0;
    const shieldCurrentHp = isShield ? Number(g.shieldHp ?? shieldMaxHp) : 0;
    const installedAttachmentCodes = Array.isArray(g.installedAttachments) ? g.installedAttachments : [];
    const attachmentHosts = isAttachment && g.qty > 0
      ? carriedGear.filter(candidate => deps.hasDamageProfile(candidate)).map(weapon => {
        const validation = validateAttachmentInstallation(weapon, g);
        return {
          id: weapon.id,
          name: weapon.name,
          enabled: validation.ok,
          reason: validation.reason || '',
          style: validation.ok ? 'lm-enh-link-btn' : 'lm-enh-link-btn lm-use-btn--off',
          install: () => validation.ok && deps.installWeaponAttachment(g.id, weapon.id),
        };
      })
      : [];
    return {
      ...g,
      dmg: isWeapon ? deps.gearDamageText(g) : '—',
      dmgColor: isWeapon ? '#c0635b' : '#3a3f33',
      // Reach is the first thing a player checks before declaring an attack,
      // so a weapon says it as a chip instead of hiding it inside the skill.
      // A row with neither a melee flag nor a skill cannot be classified, and
      // an unknown weapon gets no chip rather than a confident wrong one.
      isMeleeWeapon: isMelee,
      isRangedWeapon: isWeapon && knowsReach && !isMelee,
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
      isAttachment,
      isShield,
      shieldHpLabel: isShield ? shieldCurrentHp + '/' + shieldMaxHp + ' HP' : '',
      shieldBroken: isShield && shieldCurrentHp <= 0,
      shieldDropped: isShield && g.shieldLocation === 'dropped',
      shieldPopupLabel: isShield ? (g.cannotBeInstalledInPopupShield ? 'POPUP INCOMPATIVEL' : 'POPUP COMPATIVEL') : '',
      dropShield: () => deps.dropInventoryShield(g.id),
      repairShield: () => deps.repairInventoryShield(g.id),
      hasAttachmentHosts: attachmentHosts.length > 0,
      attachmentHosts,
      hasInstalledAttachments: installedAttachmentCodes.length > 0,
      installedAttachmentRows: installedAttachmentCodes.map(code => {
        const item = deps.products.find(product => product.code === code) || { code, name: code, kind: 'weaponAttachment' };
        const sourceWithoutAttachment = removeAttachment(g, code);
        const transferHosts = carriedGear.filter(candidate => candidate.id !== g.id && deps.hasDamageProfile(candidate)).map(candidate => {
          const validation = validateAttachmentInstallation(candidate, item);
          return {
            name: candidate.name,
            enabled: validation.ok,
            reason: validation.reason || '',
            style: validation.ok ? 'lm-enh-link-btn' : 'lm-enh-link-btn lm-use-btn--off',
            transfer: () => validation.ok && deps.transferWeaponAttachment(g.id, candidate.id, code),
          };
        });
        return {
          code,
          name: item.name || code,
          remove: () => deps.removeWeaponAttachment(g.id, code),
          transferHosts,
          hasTransferHosts: transferHosts.length > 0,
          sourceSlotsAfterRemoval: occupiedWeaponAttachmentSlots(sourceWithoutAttachment),
        };
      }),
      attachmentSlotsLabel: isWeapon ? occupiedWeaponAttachmentSlots(g) + '/' + weaponAttachmentMaxSlots(g) : '',
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
      // A full armor set covers head and body, but a player may want the vest
      // without the helmet, so each covered location gets its own control.
      isWornArmor: !!g.armorProfile,
      armorSpLabel: g.armorProfile ? String(Math.max(g.armorProfile.headSp, g.armorProfile.bodySp)) : '',
      armorPenaltyLabel: g.armorProfile && g.armorProfile.penalty ? '-' + g.armorProfile.penalty + ' REF/DEX/MOVE' : '',
      hasArmorPenalty: !!(g.armorProfile && g.armorProfile.penalty),
      armorAblatedLabel: g.spAblated ? '-' + g.spAblated + ' SP' : '',
      hasArmorAblation: !!g.spAblated,
      armorSlots: (g.armorProfile ? g.armorProfile.covers : []).map(loc => {
        const on = (g.wornAt || []).includes(loc);
        return {
          location: loc,
          label: (loc === 'head' ? 'CABECA' : 'CORPO') + ' ' + (loc === 'head' ? g.armorProfile.headSp : g.armorProfile.bodySp),
          on,
          style: 'lm-equip-btn' + (on ? ' lm-equip-btn--on' : ' lm-equip-btn--off'),
          toggle: () => deps.toggleInventoryEquip(g.id, [loc]),
        };
      }),
      use: () => deps.useInventoryGear(g.id),
      toggleEquip: () => deps.toggleInventoryEquip(g.id),
      remove: () => deps.deleteInventoryGear(g.id),
    };
  });
  // What is actually worn, straight from the inventory, so the panel can never
  // disagree with the rows above it.
  const wornArmorRows = wornArmorSummary(
    { ...activeCharacter, gear: allGear },
    (entry) => entry,
    // The sheet's own aggregate, so this panel and the SP beside it cannot
    // disagree: it already folds in both combat ablation and hand-applied
    // ablation conditions.
    derived.spAblation,
  ).map(row => ({
    ...row,
    locationLabel: row.location === 'head' ? 'CABECA' : 'CORPO',
    nameLabel: row.empty ? '— SEM ARMADURA —' : row.name,
    spLabel: row.empty ? '—' : row.currentSp + '/' + row.maxSp,
    spColor: row.empty ? '#3a3f33' : row.ablated ? '#c0635b' : '#3fe0d0',
    penaltyLabel: row.penalty ? '-' + row.penalty : '—',
    canRepair: row.ablated > 0,
    repairOne: () => deps.repairInventoryArmor(row.location, 1),
    repairAll: () => deps.repairInventoryArmor(row.location, null),
  }));
  const wornArmorAny = wornArmorRows.some(row => !row.empty);
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
  // Rows the rules engine looks up but nobody buys (the BRAWLING-BODY-* damage
  // table) would otherwise sit on the shelf priced at 0eb. The shelf is also
  // what the category chips count, so their numbers match what opens.
  const shelf = all.filter(p => isPurchasableProduct(p));
  const filtered = shelf.filter(p => {
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
    const cardSp = armorSp(p);
    if (cardSp) chips.push('+' + cardSp + ' ' + tx.sp);
    if (p.ram) chips.push('+' + p.ram + ' RAM');
    const profile = deps.weaponProfile(p);
    const isWeaponProduct = hasWeaponStatBlock(p);
    const cardMode = acquisitionMode(p);
    const packSize = purchaseQuantity(p);
    if (packSize > 1) chips.push(packSize + 'x ' + tx.perPack);
    if (isWeaponProduct && profile.dmg) chips.push(tx.dmg + ' ' + profile.dmg);
    if (isWeaponProduct && profile.skill) chips.push(tx.skill + ' ' + profile.skill);
    if (isWeaponProduct && profile.rof) chips.push(tx.rof + ' ' + profile.rof);
    if (isWeaponProduct && profile.mag) chips.push(tx.mag + ' ' + profile.mag);
    if (isWeaponProduct && profile.concealable) chips.push(tx.concealable);
    if (isWeaponProduct && deps.ignoresHalfSpBadge(profile)) chips.push(tx.halfSp);
    const fx = marketFx(pageStartIndex + i);
    const imageUrl = MARKET_ITEM_IMAGE_URLS[p.code] || p.imageUrl || '';
    const marketProduct = { ...p, imageUrl };
    return { ...marketProduct, ...fx, num: String(pageStartIndex + i + 1).padStart(2, '0'), priceLabel: deps.fmt(p.price), stockColor: stockColor(p.stock), soldout: p.stock === 'SOLD OUT', owned: cardMode === 'install' && S.owned.includes(p.code), bonusChips: chips, hasHumanityCost: cardMode === 'install', hcostLabel: p.hcostNote || ('-' + (p.hcost || 0)), hasImage: !!imageUrl, noImage: !imageUrl, open: () => deps.setState({ selected: marketProduct }) };
  });
  const cats = ['ALL', ...Array.from(new Set(shelf.map(p => p.cat || p.category).filter(Boolean)))];
  const chips = cats.map(c => ({ label: c, count: c === 'ALL' ? shelf.length : shelf.filter(p => p.cat === c).length, onClick: () => deps.setState({ marketCat: c, marketPage: 1 }), style: deps.chipStyle(S.marketCat === c) }));
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
    const isWeaponProduct = hasWeaponStatBlock(p);
    // What kind of transaction this is decides the button, the comparison
    // table, and whether the install engine is consulted at all. Merchandise
    // has no slots to fill and no Humanity to spend.
    const mode = acquisitionMode(p);
    const packSize = purchaseQuantity(p);
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
    } else if (mode === 'carry') {
      // Merchandise is not replacing anything already bolted to the body, so
      // there is no "before" column to diff against — the sheet just gains an
      // item. Show what the thing is, not what it would change.
      const row = (label, value) => cmp.push({ label, from: 'REF', to: value, arrow: '—', diffTxt: '', color: '#d6aa4e' });
      const sp = armorSp(p);
      if (sp) {
        row(tx.sp, String(sp));
        const pen = armorPenaltyOf(p);
        row(tx.armorPenalty, pen ? ['REF', 'DEX', 'MOVE'].map(k => k + ' ' + pen[k]).join(' / ') : tx.noPenalty);
      }
      if (packSize > 1) row(tx.perPack, String(packSize));
      Object.entries(deps.effectMap(p.statMod)).forEach(([k, v]) => v && row(k, '+' + v));
      Object.entries(deps.effectMap(p.skillBonus)).forEach(([k, v]) => v && row(k, '+' + v));
      if (p.ram) row('RAM', '+' + p.ram);
      (Array.isArray(p.specialRules) ? p.specialRules : []).forEach(rule => row('SPECIAL', String(rule)));
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
      const fa = armorSp(eqp), ta = armorSp(p);
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
    const isTraumaPlanProduct = mode === 'plan';
    const isCurrentTraumaPlan = isTraumaPlanProduct && deps.traumaPlanKey(activeCharacter) === p.planKey;
    // Only chrome can be "already installed". A crate of rounds bought last
    // week must not stop the next crate from being bought.
    const isEquipped = isTraumaPlanProduct ? isCurrentTraumaPlan : mode === 'install' && !!eqp && eqp.code === p.code;
    // Prerequisites are checked BEFORE the click, not after: a shop that only
    // says "nao pode ser instalado" once the money is gone teaches nothing.
    // Only real cyberware goes through the install engine — carried gear and
    // Trauma Team plans have no slots or requirements to fail.
    const goesThroughInstallEngine = mode === 'install';
    const requirementBlock = (goesThroughInstallEngine && !isEquipped && canAfford && deps.previewInstall)
      ? deps.previewInstall(p)
      : null;
    const requirementBlocked = !!(requirementBlock && !requirementBlock.ok && requirementBlock.reason === 'requirements');

    // "Saldo apos instalar" is wrong for a box of shells nobody installs.
    const balanceLabel = mode === 'install' ? tx.balanceAfterInstall : tx.balanceAfterPurchase;
    let buyLabel, buyBg, balLabel, balColor;
    let blockLabel = '', blockMessage = '';
    if (isEquipped) {
      buyLabel = tx.alreadyInstalled; buyBg = '#3a3f33'; balLabel = tx.activeUnit; balColor = '#3fe0d0';
      blockLabel = tx.alreadyInstalled; blockMessage = tx.activeUnit;
    } else if (p.stock === 'SOLD OUT') {
      buyLabel = tx.depleted; buyBg = '#3a3f33'; balLabel = tx.outOfStock; balColor = '#c0635b';
      blockLabel = tx.depleted; blockMessage = tx.outOfStock;
    } else if (!canAfford) {
      buyLabel = tx.insufficient + ' ₢'; buyBg = '#3a3f33'; balLabel = tx.shortBy + ' ' + deps.fmt(Math.abs(after)); balColor = '#c0635b';
      blockLabel = tx.insufficient; blockMessage = tx.shortBy + ' ' + deps.fmt(Math.abs(after)) + '.';
    } else if (requirementBlocked) {
      buyLabel = tx.requirementPending; buyBg = '#3a3f33'; balLabel = balanceLabel + ' ' + deps.fmt(after); balColor = '#6f7a64';
      blockLabel = tx.blockedRequirement; blockMessage = requirementBlock.message;
    } else {
      buyLabel = (isTraumaPlanProduct ? (S.lang === 'pt' ? 'ATIVAR PLANO' : 'ACTIVATE PLAN') : mode === 'carry' ? tx.addToGear : tx.install) + ' →'; buyBg = '#d6aa4e'; balLabel = balanceLabel + ' ' + deps.fmt(after); balColor = '#6f7a64';
    }
    const canInstall = !isEquipped && p.stock !== 'SOLD OUT' && canAfford && !requirementBlocked;
    const buyStyle = 'lm-market-buy-btn' + (canInstall ? ' lm-market-buy-btn--on' : ' lm-market-buy-btn--off');

    const selectedFx = marketFx(Math.max(0, idx));
    const traumaPlanStatusLabel = isCurrentTraumaPlan ? '— ACTIVE PLAN —' : '— NOT ACTIVE —';
    selected = { ...p, ...selectedFx, num: String(idx + 1).padStart(2, '0'), priceLabel: deps.fmt(p.price), stockColor: stockColor(p.stock), equippedName: mode === 'carry' ? 'CARRIED GEAR' : isTraumaPlanProduct ? traumaPlanStatusLabel : eqp ? eqp.code + ' INSTALLED' : '— NOT INSTALLED —', cmp, buyLabel, buyStyle, balLabel, balColor, hasImage: !!p.imageUrl, noImage: !p.imageUrl, hasBlock: !!blockMessage, blockLabel, blockMessage, buy: () => deps.buy(p) };
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

  // Right-rim grip: same rule as the seats - the wizard's generated card art is
  // not a face, so it falls back to initials.
  const handleTone = deps.playerRoleTone(activeCharacter.role || 'EDGERUNNER');
  const handlePortrait = uploadedPortrait(activeCharacter);
  const handleHpPct = deps.clampPct(healthMax ? healthCur / healthMax * 100 : 0);
  const handleHpColor = handleHpPct <= 25 ? '#c0635b' : handleHpPct <= 60 ? '#d6aa4e' : '#3fe0d0';

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
    topMenuOpen: !!S.topMenuOpen,
    toggleTopMenu: () => deps.setState({ topMenuOpen: !S.topMenuOpen }),
    closeTopMenu: () => deps.setState({ topMenuOpen: false }),
    backToCampaigns: () => window.location.assign('/login.html'),
    openTopMenuSettings: () => { deps.setState({ topMenuOpen: false }); deps.go('system'); },
    gmButtonLabel: S.authAuthenticated ? (S.gmAuthenticated && S.gm ? 'SAIR' : tx.gm) : 'LOGIN',
    setPlayer: () => deps.toggleRole(false), setGm: () => (S.gmAuthenticated && S.gm ? deps.logoutGm() : deps.toggleRole(true)),
    setLangEn: () => deps.setState({ lang: 'en' }), setLangPt: () => deps.setState({ lang: 'pt' }),
    langEnBtnStyle: deps.langBtnStyle(S.lang === 'en', false),
    langPtBtnStyle: deps.langBtnStyle(S.lang === 'pt', true),
    playerBtnStyle: 'lm-role-btn' + (S.gm ? '' : ' lm-role-btn--active-gold'),
    gmBtnStyle: 'lm-role-btn lm-role-btn--left' + (S.gm ? ' lm-role-btn--active-teal' : ''),
    nav,
    railOpen: S.railOpen, railCollapsed: !S.railOpen,
    openRail: () => deps.setState({ railOpen: true }), toggleRail: () => deps.setState({ railOpen: !S.railOpen }),
    railConditionCount, railHasConditions: railConditionCount > 0, notRailHasConditions: railConditionCount === 0, railConditionSummary,
    isDesktop: S.view === 'desktop', notDesktop: S.view !== 'desktop', isMarket: S.view === 'market', isDice: S.view === 'dice', isInventory: S.view === 'inventory', isMap: S.view === 'map', isCombat: S.view === 'combat', notCombat: S.view !== 'combat', isGames: S.view === 'games', isSystem: S.view === 'system', isSheet: S.view === 'sheet', notSheet: S.view !== 'sheet',
    openSheet: () => deps.setState({ sheetOpen: true }),
    closeSheet: () => deps.setState({ sheetOpen: false }),
    sheetOpen: S.sheetOpen,
    // Edge handle: a permanent grip on the right rim that pulls the operative
    // file open. It hides itself while the drawer is out so it cannot sit on
    // top of it, and stays out of the way of the campaign map view.
    sheetHandleVisible: !S.sheetOpen && S.authAuthenticated && S.view !== 'map',
    // The grip wears the operative it opens: face (or initials), class colour,
    // and a hairline of HP down its spine, so the rim says whose file this is
    // without the drawer being out.
    sheetHandleVars: '--handle-accent:' + handleTone.color + ';--handle-rgb:' + handleTone.rgb + ';'
      + '--handle-hp:' + handleHpPct + '%;--handle-hp-color:' + handleHpColor + ';',
    sheetHandlePortrait: handlePortrait,
    sheetHandleHasPortrait: handlePortrait.length > 0,
    sheetHandleNoPortrait: handlePortrait.length === 0,
    sheetHandleTag: handleTone.label,
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
    wornArmorRows,
    wornArmorAny,
    wornArmorNone: !wornArmorAny,
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
    chips, items, resultCount: filtered.length, totalCount: shelf.length,
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
    navTarotActive: S.view === 'games' && gameTab === 'tarot', navNexusActive: S.view === 'games' && gameTab === 'nexus',
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
    // Roster with a delete on every row: a fresh deployment ships the demo
    // sheets (NOVA/BYTE/IRIS) and a table usually wants them gone once it
    // actually starts playing.
    gmCharacterRows: (S.characters || []).map((character) => ({
      id: character.id,
      name: character.name || character.id,
      owner: character.ownerUsername || character.createdBy || 'sem dono',
      onDelete: () => deps.deleteGmCharacter(character.id),
    })),
    noGmCharacterRows: (S.characters || []).length === 0,
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
      qty: purchaseQuantity(p),
      equipped: false,
      rarity: LIMIAR_TIER_COLORS[p.tier] || p.rarity,
      notes: [p.example, p.special].filter(Boolean).join(' // '),
      shieldHp: p.shieldHp ?? p.maxHp ?? null,
      maxHp: p.maxHp ?? p.shieldHp ?? null,
      shieldLocation: (Number(p.shieldHp ?? p.maxHp) > 0) ? 'carried' : undefined,
      cannotBeInstalledInPopupShield: !!p.cannotBeInstalledInPopupShield,
    }, 0);
  }

  // Worn armor is not a boolean. Putting a vest on has to reach the sheet:
  // SP into `character.armor`, the REF/DEX/MOVE tax with it, and the piece's
  // own accumulated ablation into `character.spDamage` for that location.
  // Everything that is not wearable armor keeps the plain toggle.
  function toggleInventoryEquip(id, locations) {
    if (!component.ensureGm('Login do mestre necessario para alterar inventario')) return;
    const gear = component.normalizeGearList(component.activeCharacter().gear || component.gearList);
    const row = gear.find(item => item.id === id);
    if (row && Number(row.maxHp ?? row.shieldHp) > 0) {
      if (row.equipped) return component.sheetHandlers().removeShield();
      return component.sheetHandlers().equipShield(row.id);
    }
    if (row && row.armorProfile) return toggleWornArmor(row, locations);
    const next = gear.map(item => (item.id === id ? { ...item, equipped: !item.equipped } : item));
    const changed = next.find(item => item.id === id);
    updateInventoryGear(next, changed ? changed.name + (changed.equipped ? ' equipado' : ' guardado') : 'Inventario atualizado');
  }

  function dropInventoryShield(id) {
    if (!component.ensureGm('Login do mestre necessario para soltar escudo')) return;
    const active = component.activeCharacter();
    const current = component.normalizeGearList(active.gear || component.gearList);
    const row = current.find(item => item.id === id && Number(item.maxHp ?? item.shieldHp) > 0);
    if (!row) return;
    const shield = component.normalizeShield(active.shield);
    const isActive = !!shield && (shield.itemId === row.id || shield.itemId === row.code);
    const gear = current.map(item => item.id === id
      ? { ...item, equipped: false, shieldLocation: 'dropped', shieldHp: isActive ? shield.hp : item.shieldHp }
      : item);
    component.updateActiveCharacter({ gear, ...(isActive ? { shield: null } : {}) });
    component.flash(row.name + ' SOLTO :: BRACO LIVRE');
  }

  function repairInventoryShield(id) {
    if (!component.ensureGm('Login do mestre necessario para reparar escudo')) return;
    const active = component.activeCharacter();
    const current = component.normalizeGearList(active.gear || component.gearList);
    const row = current.find(item => item.id === id && Number(item.maxHp ?? item.shieldHp) > 0);
    if (!row) return;
    const maxHp = component.asNumber(row.maxHp ?? row.shieldHp, 0, 0, 999);
    const gear = current.map(item => item.id === id ? { ...item, shieldHp: maxHp } : item);
    const shield = component.normalizeShield(active.shield);
    const patch = shield && (shield.itemId === row.id || shield.itemId === row.code)
      ? { gear, shield: { ...shield, hp: maxHp, maxHp } }
      : { gear };
    component.updateActiveCharacter(patch);
    component.flash(row.name + ' REPARADO :: ' + maxHp + '/' + maxHp + ' HP');
  }

  function applyArmorPatch(result, message) {
    if (!result.ok) return component.flash(result.message || 'Nao foi possivel equipar');
    component.updateActiveCharacter({
      gear: component.normalizeGearList(result.patch.gear),
      armor: result.patch.armor,
      spDamage: result.patch.spDamage,
    });
    if (message) component.flash(message);
  }

  function toggleWornArmor(row, locations) {
    const active = component.activeCharacter();
    const character = { ...active, gear: component.normalizeGearList(active.gear || component.gearList) };
    const resolveItem = (entry) => component.gearCatalogSource(entry);
    const worn = Array.isArray(row.wornAt) ? row.wornAt : [];
    const target = locations && locations.length ? locations : null;

    // Changing armor is free between fights and expensive inside one. The cost
    // rides on the toast rather than blocking the change: it is the GM's call
    // whether the table spends it, and a shop that silently refuses teaches
    // nothing.
    const inCombat = !!(component.state.combatState && component.state.combatState.active);
    const costNote = (result) => (inCombat && result.timeCost ? ' [combate: ' + result.timeCost.label + ']' : '');

    if (worn.length && (!target || target.every(loc => worn.includes(loc)))) {
      const off = unequipWornArmor({ character, locations: target || worn, resolveItem });
      return applyArmorPatch(off, off.ok ? row.name + ' guardado' + costNote(off) : undefined);
    }
    const on = equipWornArmor({ character, itemId: row.id, locations: target, resolveItem });
    if (!on.ok) return applyArmorPatch(on);
    const swapped = (on.replaced || []).map(r => r.name).filter(Boolean);
    const where = (on.locations || []).map(loc => (loc === 'head' ? 'cabeca' : 'corpo')).join(' e ');
    return applyArmorPatch(on, row.name + ' equipado (' + where + ')' + (swapped.length ? ' — ' + swapped.join(', ') + ' removido' : '') + costNote(on));
  }

  // CPR RAW p.99: a Tech patches Stopping Power back one point at a time.
  // `amount` omitted restores the piece to full.
  function repairInventoryArmor(location, amount) {
    if (!component.ensureGm('Login do mestre necessario para alterar inventario')) return;
    const active = component.activeCharacter();
    const character = { ...active, gear: component.normalizeGearList(active.gear || component.gearList) };
    const result = repairWornArmor({
      character,
      location,
      amount,
      resolveItem: (entry) => component.gearCatalogSource(entry),
    });
    const label = location === 'head' ? 'cabeca' : 'corpo';
    if (!result.ok) {
      // The panel counts two kinds of lost SP but a Tech can only patch one.
      // Ablation coming from an active condition leaves when the condition
      // does, so say that instead of "nothing to repair" next to a damaged bar.
      const fromCondition = (active.statusEffects || []).some(s => s && s.modifiers && s.modifiers.spAblation && Number(s.modifiers.spAblation[location]) > 0);
      return component.flash(fromCondition
        ? 'SP de ' + label + ' esta reduzido por uma condicao ativa: remova a condicao'
        : (result.message || 'Nada a reparar'));
    }
    applyArmorPatch(result, 'SP de ' + label + ' reparado');
  }

  function deleteInventoryGear(id) {
    if (!component.ensureGm('Login do mestre necessario para alterar inventario')) return;
    const current = component.normalizeGearList(component.activeCharacter().gear || component.gearList);
    const removed = current.find(item => item.id === id);
    updateInventoryGear(current.filter(item => item.id !== id), removed ? removed.name + ' excluido' : 'Item excluido');
  }

  function installWeaponAttachment(attachmentId, weaponId) {
    if (!component.ensureGm('Login do mestre necessario para instalar acessorios')) return;
    const gear = component.normalizeGearList(component.activeCharacter().gear || component.gearList);
    const attachment = gear.find(item => item.id === attachmentId);
    const weapon = gear.find(item => item.id === weaponId);
    if (!attachment || !weapon || attachment.qty < 1) return component.flash('Acessorio ou arma hospedeira indisponivel');
    const result = installAttachment(weapon, attachment);
    if (!result.ok) return component.flash(result.reason || 'Instalacao incompativel');
    const next = gear.map(item => {
      if (item.id === weaponId) return result.weapon;
      if (item.id === attachmentId) return { ...item, qty: Math.max(0, item.qty - 1) };
      return item;
    });
    updateInventoryGear(next, attachment.name + ' instalado em ' + weapon.name);
  }

  function removeWeaponAttachment(weaponId, attachmentCode) {
    if (!component.ensureGm('Login do mestre necessario para remover acessorios')) return;
    const gear = component.normalizeGearList(component.activeCharacter().gear || component.gearList);
    const weapon = gear.find(item => item.id === weaponId);
    if (!weapon || !(weapon.installedAttachments || []).includes(attachmentCode)) return;
    const loose = gear.find(item => item.code === attachmentCode && item.id !== weaponId);
    const catalog = component.productByCode(attachmentCode) || { code: attachmentCode, name: attachmentCode, kind: 'weaponAttachment' };
    let next = gear.map(item => item.id === weaponId ? removeAttachment(item, attachmentCode) : item);
    if (loose) next = next.map(item => item.id === loose.id ? { ...item, qty: item.qty + 1 } : item);
    else next.push(gearFromProduct(catalog));
    updateInventoryGear(next, (catalog.name || attachmentCode) + ' removido de ' + weapon.name);
  }

  function transferWeaponAttachment(sourceWeaponId, targetWeaponId, attachmentCode) {
    if (!component.ensureGm('Login do mestre necessario para transferir acessorios')) return;
    const gear = component.normalizeGearList(component.activeCharacter().gear || component.gearList);
    const source = gear.find(item => item.id === sourceWeaponId);
    const target = gear.find(item => item.id === targetWeaponId);
    const attachment = component.productByCode(attachmentCode) || { code: attachmentCode, name: attachmentCode, kind: 'weaponAttachment' };
    if (!source || !target || !(source.installedAttachments || []).includes(attachmentCode)) return;
    const installed = installAttachment(target, attachment);
    if (!installed.ok) return component.flash(installed.reason || 'Transferencia incompativel');
    const next = gear.map(item => item.id === sourceWeaponId
      ? removeAttachment(item, attachmentCode)
      : item.id === targetWeaponId ? installed.weapon : item);
    updateInventoryGear(next, (attachment.name || attachmentCode) + ' transferido para ' + target.name);
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
    const mode = acquisitionMode(p);
    const isTraumaPlan = mode === 'plan';
    if (!isTraumaPlan && !component.ensureGm('Login do mestre necessario para alterar inventario')) return;
    if (component.state.credits < p.price || p.stock === 'SOLD OUT') return;
    // Only chrome is one-per-body. Merchandise restocks: refusing the second
    // box of rounds because the first one is on the sheet is not a rule.
    if (mode === 'install' && component.normalizeEquipped(component.state.equipped).some(it => it.code === p.code)) return;
    clearTimeout(component._tt);
    component._charactersTouched = true;

    if (mode === 'install') {
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
        // Buying a second pack of the same rounds should deepen the stack, not
        // add a second line reading "1x Rifle Ammunition" beside the first.
        const current = component.normalizeGearList(active.gear || s.gearItems);
        const qty = purchaseQuantity(p);
        const stackIndex = current.findIndex(it => it.code && it.code === p.code);
        const gear = stackIndex >= 0
          ? current.map((it, i) => (i === stackIndex ? { ...it, qty: (Number(it.qty) || 0) + qty } : it))
          : [...current, gearFromProduct(p)];
        nextCharacter = { ...active, gear, credits };
        toast = p.code + ' ADDED TO GEAR' + (qty > 1 ? ' (x' + qty + ')' : '');
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

  async function deleteGmCharacter(id) {
    if (!component.ensureGm('Login do mestre necessario para remover personagem')) return;
    if (!id) return;
    const roster = component.state.characters || [];
    const target = roster.find(c => c && c.id === id);
    const label = (target && target.name) || id;
    const ask = typeof globalThis.confirm === 'function' ? globalThis.confirm : null;
    if (ask && !ask('Remover ' + label + ' desta campanha? Nao ha desfazer.')) return;
    try {
      if (component.api()) await component.api().characters.delete(id);
      const remaining = roster.filter(c => c && c.id !== id);
      component._charactersTouched = true;
      component.setState({
        characters: remaining,
        // Dropping the active sheet would leave the whole desktop reading from
        // a character that no longer exists, so hand the selection over.
        activeCharacterId: component.state.activeCharacterId === id
          ? ((remaining[0] && remaining[0].id) || null)
          : component.state.activeCharacterId,
        gmStatus: 'Personagem removido: ' + label,
      });
    } catch (err) {
      component.setState({ gmStatus: 'Falha ao remover personagem: ' + (err.message || '') });
    }
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
    // Same idea for the tarot canvas: it only exists while this tab is mounted,
    // so a card already on the table needs its FX restarted on the way back in.
    if (tab === 'tarot') component.tarotHandlers().ensureTarotFx();
  }

  return {
    updateInventoryGear,
    addInventoryGear,
    gearFromProduct,
    toggleInventoryEquip,
    dropInventoryShield,
    repairInventoryShield,
    repairInventoryArmor,
    deleteInventoryGear,
    useInventoryGear,
    installWeaponAttachment,
    removeWeaponAttachment,
    transferWeaponAttachment,
    buy,
    onGmCharacterImageUpload,
    onGmItemImageUpload,
    createGmCharacter,
    deleteGmCharacter,
    upsertGmItem,
    deleteGmItem,
    selectGameTab,
  };
}
