import { DCLogic } from '../framework/index.js';
import { asNumber as numAsNumber } from '../domain/shared/num.ts';
import {
  normalizeRollContributions as diceNormalizeContributions,
  rollDiceMeta as diceRollMeta,
  rollNotation as diceRollNotation,
  rollDetail as diceRollDetail,
  rollBreakdownDetail as diceRollBreakdownDetail,
  cyberSourceBreakdown as diceCyberSourceBreakdown,
  rollFaces as diceRollFaces,
} from '../domain/dice/index.ts';
import { slug as slugText } from '../domain/shared/text.ts';
import {
  CPRED_CRITICAL_INJURIES,
  CPRED_ARMOR_PENALTY_STATS,
  setSkillRows,
} from '../domain/character/constants.ts';
import {
  normalizeStats as charNormalizeStats,
  normalizeHqIp as charNormalizeHqIp,
  normalizeArmor as charNormalizeArmor,
  normalizeShield as charNormalizeShield,
  damageShield as charDamageShield,
  repairShield as charRepairShield,
  parseGearDamage as charParseGearDamage,
  skillCanonicalName as charSkillCanonicalName,
  normalizeSkills as charNormalizeSkills,
  skillSpend as charSkillSpend,
  normalizeSpDamage as charNormalizeSpDamage,
  armorPenalty as charArmorPenalty,
  cpredStatMax as charCpredStatMax,
  applyHumanityRecovery as charApplyHumanityRecovery,
} from '../domain/character/index.ts';
import { deriveStats as charDeriveStats } from '../domain/character/derivedStatsEngine.ts';
import {
  CPRED_STATUS_PRESETS,
  normalizeConditionDuration as condNormalizeConditionDuration,
  conditionInstanceId as condInstanceId,
  normalizeCriticalInjuries as condNormalizeCriticalInjuries,
  normalizeStatusEffects as condNormalizeStatusEffects,
  aggregateConditions as condAggregateConditions,
  criticalInjuryEntry as condCriticalInjuryEntry,
  statusEffectEntry as condStatusEffectEntry,
  statusChargeKey as condStatusChargeKey,
} from '../domain/conditions/index.ts';
import {
  normalizeBonus as cyberNormalizeBonus,
  effectMap as cyberEffectMap,
  normalizeEnhancementCodes as cyberNormalizeEnhancementCodes,
  enhancementEffectLabel as cyberEnhancementLabel,
  applyCyberweaponEnhancements as cyberApplyWeaponEnhancements,
  cyberweaponEnhancementEffects as cyberWeaponEnhancementEffects,
  compatibleEnhancements as cyberCompatibleEnhancements,
  cyberwareStatMods as cyberStatMods,
  cyberwareStatModBonus as cyberStatModBonus,
  cyberwareFlagSources as cyberFlagSources,
  applyCyberwareStatMods as cyberApplyStatMods,
  skillCyberwareBonus as cyberSkillBonus,
  cyberwareBonuses as cyberBonuses,
  healingRateBonus as cyberHealingRate,
  naturalHealingPerRest as cyberNaturalHealing,
  immunityBadges as cyberImmunityBadges,
  spinalInjuryImmunitySources as cyberSpinalImmunity,
  empImmunitySources as cyberEmpImmunity,
  criticalInjuryImmunity as cyberCriticalImmunity,
  cyberwareHumanityLoss as cyberHumanityLoss,
} from '../domain/cyberware/index.ts';
import { ipEntry as econIpEntry } from '../domain/economy/index.ts';
import { setTarotCards } from '../domain/tarot/constants.ts';
import {
  weaponProfile as itemsWeaponProfile,
  hasDamageProfile as itemsHasDamageProfile,
  effectiveBodyForDamage as itemsEffectiveBodyForDamage,
  damageScaleProfile as itemsDamageScaleProfile,
  selectedWeaponMode as itemsSelectedWeaponMode,
  gorillaTungstenProfile as itemsGorillaTungstenProfile,
  weaponRuntimeAttackMod as itemsWeaponRuntimeAttackMod,
  weaponRuntimeQuality as itemsWeaponRuntimeQuality,
  ignoresHalfSpBadge as itemsIgnoresHalfSpBadge,
} from '../domain/items/weaponProfileEngine.ts';
import { LIMIAR_TRAUMA_PLANS, setTraumaPlans, traumaPlanKey as charTraumaPlanKey, traumaPlanByKey as charTraumaPlanByKey } from '../domain/character/traumaPlans.ts';
import { isAdmin as authIsAdmin, isPlayerUser as authIsPlayerUser, canManageOwnSheet as authCanManageOwnSheet } from '../domain/auth/policies.ts';
import {
  chatText as chatRollText,
  chatRollTitle as chatRollTitleText,
  parseDamageTrackingLine as chatParseDamageTrackingLine,
  parseDamageTrackingMessage as chatParseDamageTrackingMessage,
} from '../domain/chat/rollLog.ts';
import { setI18n, i18nTranslations } from '../infrastructure/i18n.ts';
import {
  damageProgramRez as netDamageProgramRez,
  deckProgramSummary as netDeckProgramSummary,
  normalizeInstalledPrograms as netNormalizeInstalledPrograms,
  repairProgramRez as netRepairProgramRez,
} from '../domain/netrunning/index.ts';
import {
  LIMIAR_TIER_COLORS,
  trackingToneFromLabel as viewTrackingToneFromLabel,
} from './view/constants.js';
import { hqHandlers, hqRenderVals } from './views/hq.js';
import { chatHandlers, chatRenderVals } from './views/chat.js';
import { mapHandlers, mapRenderVals } from './views/map.js';
import { nexusHandlers, nexusRenderVals } from './views/nexus.js';
import { tarotHandlers, tarotRenderVals } from './views/tarot.js';
import { sheetHandlers, sheetRenderVals } from './views/sheet.js';
import { combatHandlers, combatRenderVals } from './views/combat.js';
import { clearMapAttackIntent, loadMapAttackIntent, mapTokenVisibleNow } from '../domain/map/mapAttackIntent.ts';
import { clearMapFocusIntent, loadMapFocusIntent } from '../domain/map/mapFocusIntent.ts';
import { desktopHandlers, desktopRenderVals } from './views/desktop.js';
import {
  chipStyle as viewChipStyle,
  dieStyle as viewDieStyle,
  viewStyle as viewViewStyle,
  langBtnStyle as viewLangBtnStyle,
  pageBtnStyle as viewPageBtnStyle,
  toggleRow as viewToggleRow,
} from './view/styles.js';

// Inert first-paint placeholder. Real character/item/map data is loaded from the
// backend (DB, seeded from data/seed/limiar-seed.json) by reloadRemoteData() on mount.
const LimiarSeed = {
  activeCharacterId: null,
  credits: 0,
  base: { BODY: 0, REF: 0, INT: 0, TECH: 0, COOL: 0, EMP: 0 },
  equipped: [],
  owned: [],
  gearItems: [],
  health: { cur: 0, max: 0 },
  ramUsed: 0,
};

/**
 * @typedef {'preArmor'|'postArmor'|'direct'} DamageTiming
 * @typedef {{ type:'damage', amount:number|string, timing:DamageTiming, multiplier?:number, bypassArmor?:boolean, target:'victim'|'attacker' }} DamageAtom
 * @typedef {{ type:'criticalInjury', injury:string|null, count?:number, chooser?:'target'|'player'|'gm', pool?:'head'|'body', stackPenalty?:boolean, target:'victim' }} CriticalInjuryAtom
 * @typedef {{ type:'deathSave', modifier?:number, onFail:Atom[], target:'victim' }} DeathSaveAtom
 * @typedef {{ type:'humanity', amount:number|string, direction:'loss'|'gain', target:'victim'|'attacker' }} HumanityAtom
 * @typedef {{ type:'status', id:string, label_pt:string, duration:{value:number,unit:'round'|'min'|'hour'}|null, modifiers?:Object, scope:'victim'|'attacker'|'attacker-vs-victim' }} StatusAtom
 * @typedef {{ type:'sp', action:'ablate', location:'head'|'body'|'hit', amount:number, ignorePenetration?:boolean, target:'victim' }} SpAtom
 * @typedef {{ type:'cyberware', action:'disable'|'destroy', scope:'all'|'one', repairable:boolean, duration?:{value:number,unit:'round'|'min'|'hour'}, target:'victim' }} CyberwareAtom
 * @typedef {{ type:'weapon', action:'destroy'|'jam'|'lodge'|'disarm', repairable:boolean, target:'attacker'|'victim' }} WeaponAtom
 * @typedef {{ type:'locationOverride', location:'head', target:'victim' }} LocationOverrideAtom
 * @typedef {{ type:'special', id:string, note_pt:string, helperRoll?:string }} SpecialAtom
 * @typedef {{ type:'condition', when:{flag:string,equals:*}, then:Atom[], else?:Atom[] }} ConditionAtom
 * @typedef {DamageAtom|CriticalInjuryAtom|DeathSaveAtom|HumanityAtom|StatusAtom|SpAtom|CyberwareAtom|WeaponAtom|LocationOverrideAtom|SpecialAtom|ConditionAtom} Atom
 */



class Component extends DCLogic {
  state = {
    view: 'desktop', sheetOpen: false, sheetExpanded: false, railOpen: (typeof window !== 'undefined' && window.innerWidth >= 1100), gm: false, gmAuthenticated: false, authAuthenticated: false, authUser: null, activeCampaignId: this.props.activeCampaignId || '', activeCampaignName: '', playerReady: false, lang: 'en',
    now: new Date(),
    characters: [],
    activeCharacterId: LimiarSeed.activeCharacterId,
    products: [],
    mapLocations: [],
    gearItems: LimiarSeed.gearItems,
    credits: LimiarSeed.credits,
    base: LimiarSeed.base,
    equipped: LimiarSeed.equipped,
    owned: LimiarSeed.owned,
    health: LimiarSeed.health,
    ramUsed: LimiarSeed.ramUsed,
    marketCat: 'ALL', marketAvail: 'ALL', marketQuery: '', marketLayout: 'holo', marketPage: 1, marketPageSize: 8, selected: null,
    inventoryFilter: 'ALL',
    inventoryDraft: { name: '', type: 'WEAPON - RANGED', qty: '1', dmg: '1d6', count: '1', sides: '6', mod: '0', notes: '' },
    rolls: [], lastRoll: null, lastRollOpts: null, rollOverlay: false, rolling: false, rollFace: 0,
    dice3dActive: false, dice3dReady: false,
    diceSides: 20, diceCount: 1, diceMod: 0,
    comms: [],
    reqLabel: '', reqDv: '', reqSides: 10,
    combatState: null,
    combatAddPcId: '',
    combatAddNpcId: '',
    combatExpandedIds: [],
    // GM Cockpit (battle mode): which combatant's kit is shown in the focus
    // dock, and whether the reinforcements drawer (roster/NPC creation) is
    // open. Transient — falls back to the current turn when unset/invalid.
    combatFocusId: '',
    combatReinforceOpen: false,
    // A one-shot handoff from campaign-map.exe. It is keyed by attacker so a
    // GM's focused card cannot accidentally consume another combatant's range.
    mapAttackContexts: {},
    combatNpcDraft: { name: '', body: '5', ref: '5', hpMax: '35', headSp: '11', bodySp: '11', qty: '1', templateId: '', attackRows: [{ name: '', dice: '2d6', skill: 'Handgun' }] },
    tarotDeck: [],
    tarotState: null,
    tarotCurrent: null,
    tarotPhase: 'idle',
    tarotHistory: [],
    tarotTargetId: null,
    tarotAttackerId: null,
    tarotContext: { attackType: 'melee', targetHasCyberware: null, targetHasExplosive: null },
    // Phase 5: situational attack-roll toggles. Global like tarotContext; the
    // consumed flag(s) reset after each roll so nothing persists between attacks.
    attackContext: { cover: false, beyond51m: false, aimedShot: false },
    // Transient (not persisted) state for the standard Critical Injury flow:
    // set when a damage roll hits 2+ sixes and the GM confirms; cleared once
    // resolved. Never touches combatState/backend — same spirit as tarotContext.
    critInjuryPending: null,
    // Transient (not persisted): which combatant each attacker is currently
    // aiming at. Purely informational — this app never auto-resolves hits, so
    // picking a target just labels the attack/damage rolls and pre-fills the
    // Critical Injury flow's victim, matching how the rest of combat works.
    combatTargets: {},
    // CM2: evasion-as-prompt (G7). pendingEvasion tracks the attacker's own
    // outstanding request (cleared on answer or lazily treated as expired
    // past expiresAt); evasionResults holds the captured reply until the next
    // attack roll against that same target consumes it (one-shot).
    pendingEvasion: {},
    evasionResults: {},
    tarotResolution: null,
    tarotApplySnapshot: null,
    gmDraft: '', reply: '', readCount: 0, commsOpen: false, commsFilter: 'all',
    game: { active: false, pos: 50, dir: 1, breaches: 0, status: 'idle', zoneLo: 40, zoneW: 18, speed: 1.7 },
    gameTab: 'tarot',
    nexusChallenge: null,
    nexusResult: null,
    nexusTargetId: null,
    mapSel: 0,
    mapImageUrl: '',
    toast: null,
    scanOn: null, auraOn: null,
    gmCharacterDraft: { name: '', role: '', portraitUrl: '' },
    sheetEditing: false,
    sheetCreating: false,
    sheetDraft: null,
    sheetTab: 'core',
    hqIp: { ip: 0, log: [] },
    ipAward: { group: '', warrior: '', socializer: '', explorer: '', roleplayer: '' },
    ipOneRankPerSession: true,
    ipRankPurchasedThisSession: false,
    ipHistoryOpen: false,
    conditionLocation: 'body',
    conditionInjuryId: '',
    conditionStatusId: 'world_extra_turn',
    gmItemDraft: { code: '', name: '', cat: 'NEURAL', price: '', desc: '', imageUrl: '' },
    gmMapDraft: { name: '', threat: 'MED', imageUrl: '' },
    users: [],
    userDraft: { username: '', password: '', role: 'player', email: '' },
    gmStatus: 'Backend aguardando conexao',
  };

  componentDidMount() {
    this._clock = setInterval(() => {
      this.state.now = new Date();
      const clockEl = document.querySelector('[data-limiar-clock="true"]');
      if (clockEl) clockEl.textContent = this.clockText(this.state.now);
      else if (!(this.state.rollOverlay && this.state.rolling && this.state.dice3dActive)) this.setState({ now: this.state.now });
    }, 1000);
    this.bootstrapBackend();
    this.tarotHandlers().preloadTarotAssets();
    this.refreshChat();
    // M3 unified sync: a single long-poll per active campaign covers chat/
    // combat/roster, so the only interval left is a 15s safety net for when
    // there's no active campaign yet or the long-poll degrades (matches the
    // F7 map channel's own fallback poll).
    this.startCampaignSync();
    this._safety = setInterval(() => { this.refreshChat(); this.refreshRoster(); }, 15000);
    // Silent handshake: keep an authenticated GM session alive across long game
    // nights by refreshing it well within the server's idle window.
    this._hb = setInterval(() => this.sessionHeartbeat(), 5 * 60 * 1000);
    this._turnTimer = setInterval(() => this.combatHandlers().tickTurnTimer(), 1000);
  }
  componentWillUnmount() {
    clearInterval(this._clock); clearInterval(this._ri); clearInterval(this._gi); clearInterval(this._safety); clearInterval(this._hb); clearInterval(this._turnTimer); clearTimeout(this._tt); clearTimeout(this._diceKick);
    this.stopCampaignSync();
    if (this._diceBox && this._diceBox.clear) this._diceBox.clear();
    this.tarotHandlers().stopTarotFx();
  }
  // M3: long-poll `/campaigns/:id/updates` while there's an active campaign,
  // refetching only the topics (chat/combat/roster) the server reports dirty.
  // No active campaign yet -> idle-wait and recheck, so switching into one
  // later (e.g. after loadActiveCampaignName resolves) picks the loop up.
  async startCampaignSync() {
    if (this._syncRunning) return;
    this._syncRunning = true;
    this._syncStopped = false;
    this._syncCampaignId = '';
    this._syncVersion = 0;
    while (!this._syncStopped) {
      const campaignId = this.state.activeCampaignId;
      const waitForUpdate = this.api() && this.api().campaigns && this.api().campaigns.waitForUpdate;
      if (!campaignId || !waitForUpdate) { await this._syncDelay(2000); continue; }
      if (campaignId !== this._syncCampaignId) { this._syncCampaignId = campaignId; this._syncVersion = 0; }
      const controller = new AbortController();
      this._syncAbort = controller;
      try {
        const update = await waitForUpdate(campaignId, this._syncVersion, controller.signal);
        if (this._syncStopped) break;
        const version = Number(update && update.version) || this._syncVersion;
        if (update && update.changed) {
          this._syncVersion = version;
          await this.applyCampaignSyncTopics(Array.isArray(update.topics) ? update.topics : []);
        } else {
          this._syncVersion = Math.max(this._syncVersion, version);
        }
      } catch (_) {
        if (!this._syncStopped) await this._syncDelay(1000);
      } finally {
        if (this._syncAbort === controller) this._syncAbort = null;
      }
    }
    this._syncRunning = false;
  }
  stopCampaignSync() {
    this._syncStopped = true;
    if (this._syncAbort) this._syncAbort.abort();
  }
  _syncDelay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
  async applyCampaignSyncTopics(topics) {
    if (topics.includes('chat')) await this.refreshChat();
    if (topics.includes('roster') || topics.includes('combat')) await this.refreshRoster();
  }

  get products() {
    return this.state.products || [];
  }

  get gearList() {
    return this.normalizeGearList(this.state.gearItems || []);
  }

  async bootstrapBackend() {
    if (!this.api()) return;
    let authenticated = false;
    try {
      const session = this.api().auth ? await this.api().auth.session() : null;
      if (session && session.authenticated) {
        authenticated = true;
        const user = session.user || null;
        const staff = !!(user && ['admin', 'gm'].includes(user.role));
        this.setState({ authAuthenticated: true, authUser: user, gmAuthenticated: staff, gm: staff, gmStatus: staff ? 'Acesso mestre autenticado' : 'Player autenticado' });
      } else {
        this.setState({ authAuthenticated: false, authUser: null, gmAuthenticated: false, gm: false, gmStatus: 'Login necessario' });
        return this.redirectToLogin();
      }
    } catch (_) {
      this.setState({ gmStatus: 'Backend offline' });
    }
    await this.loadReferenceData();
    if (authenticated) {
      await this.reloadRemoteData();
      const user = this.state.authUser;
      if (user && ['admin', 'gm'].includes(user.role)) await this.loadUsers();
      if (this.state.activeCampaignId) await this.loadActiveCampaignName();
    }
  }

  async loadActiveCampaignName() {
    const api = this.api();
    if (!api?.campaigns?.list) return;
    try {
      const campaigns = await api.campaigns.list();
      const campaign = (Array.isArray(campaigns) ? campaigns : []).find((entry) => entry && entry.id === this.state.activeCampaignId);
      if (campaign) this.setState({ activeCampaignName: campaign.name || '' });
    } catch (_) { /* keep whatever name we had, non-critical */ }
  }

  redirectToLogin() {
    if (typeof window !== 'undefined') window.location.assign('/login.html');
  }

  async loadReferenceData() {
    const api = this.api();
    if (!api || !api.request) return;
    try {
      const [tarot, traumaPlans, skills, i18n] = await Promise.all([
        api.request('/reference/tarot'),
        api.request('/reference/trauma-plans'),
        api.request('/reference/skills'),
        api.request('/i18n'),
      ]);
      if (Array.isArray(tarot) && tarot.length) setTarotCards(tarot);
      if (Array.isArray(traumaPlans) && traumaPlans.length) setTraumaPlans(traumaPlans);
      if (Array.isArray(skills) && skills.length) {
        setSkillRows(skills);
      }
      if (i18n && typeof i18n === 'object') {
        setI18n(i18n);
        this.setState({});
      }
    } catch (_) {
      // HTML-embedded data already present — soft fail, no disruption to the user
    }
  }

  async sessionHeartbeat() {
    const auth = this.api() && this.api().auth;
    if (!(auth && auth.token && auth.token())) return;
    try {
      const session = await auth.session();
      const live = !!(session && session.authenticated);
      const user = live ? session.user : null;
      const staff = !!(user && ['admin', 'gm'].includes(user.role));
      if (live !== this.state.authAuthenticated || staff !== this.state.gmAuthenticated) {
        this.setState({ authAuthenticated: live, authUser: user, gmAuthenticated: staff, gm: staff && this.state.gm, gmStatus: live ? (staff ? 'Acesso mestre autenticado' : 'Player autenticado') : 'Sessao expirada' });
        if (!live) this.redirectToLogin();
      }
    } catch (_) { /* backend offline - keep current session state */ }
  }

  async loadUsers() {
    if (!(this.api() && this.api().users && this.state.gmAuthenticated)) return;
    try {
      const users = await this.api().users.list();
      this.setState({ users: Array.isArray(users) ? users : [] });
    } catch (_) {}
  }

  async reloadRemoteData() {
    if (!this.api()) return;
    try {
      const [characters, products, mapLocations, nexusChallenge, nexusResult, hqIp, tarotStateRaw, combatStateRaw] = await Promise.all([
        this.api().characters.list(),
        this.api().items.list(),
        this.api().map.list(),
        this.api().nexus ? this.api().nexus.get() : Promise.resolve(null),
        this.api().nexus ? this.api().nexus.getResult() : Promise.resolve(null),
        this.api().hq ? this.api().hq.get() : Promise.resolve(null),
        this.api().tarot && this.api().tarot.state ? this.api().tarot.state.get() : Promise.resolve(null),
        this.api().combat && this.api().combat.state ? this.api().combat.state.get() : Promise.resolve(null),
      ]);
      this._catalogProducts = products || [];
      const tarotState = await this.tarotHandlers().ensureTarotState(tarotStateRaw);
      const tarotCurrent = this.tarotHandlers().tarotCardFromEntry(tarotState.drawnThisSession);
      const normalizedCharacters = this.normalizeCharacterList(characters || []);
      const combatState = await this.combatHandlers().ensureCombatState(combatStateRaw, normalizedCharacters);
      const activeStillExists = normalizedCharacters.some(c => c.id === this.state.activeCharacterId);
      const first = normalizedCharacters[0] || {};
      const activeId = activeStillExists ? this.state.activeCharacterId : first.id;
      const active = normalizedCharacters.find(c => c.id === activeId) || first;
      this.setState({
        characters: normalizedCharacters,
        products: products || [],
        mapLocations: mapLocations || [],
        nexusChallenge,
        nexusResult,
        hqIp: this.normalizeHqIp(hqIp),
        tarotState,
        tarotDeck: tarotState.order,
        tarotHistory: this.tarotHandlers().tarotHistoryRows(tarotState.history),
        combatState,
        tarotCurrent: tarotCurrent || this.state.tarotCurrent,
        tarotPhase: tarotCurrent ? 'shown' : this.state.tarotPhase,
        activeCharacterId: activeId || this.state.activeCharacterId,
        notesDraft: this.sheetHandlers().notesFieldsFrom(active),
        credits: active.credits ?? this.state.credits,
        base: active.base || this.state.base,
        equipped: this.normalizeEquipped(active.equipped || this.state.equipped),
        owned: this.equippedCodes(active.equipped || this.state.equipped),
        health: active.health || this.state.health,
        ramUsed: active.ramUsed ?? this.state.ramUsed,
        gearItems: active.gear || this.state.gearItems,
        gmStatus: this.state.gmAuthenticated ? this.state.gmStatus : 'Backend conectado',
      });
      await this.consumeMapAttackIntent();
      await this.consumeMapFocusIntent();
    } catch (err) {
      this.setState({ gmStatus: 'Falha ao carregar backend: ' + err.message });
    }
  }

  fmt(n) { return '\u20a2 ' + n.toLocaleString('en-US'); }
  fmtShort(n) { return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n); }
  clampPct(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }
  cpredStatMax(key) { return charCpredStatMax(key); }
  clockText(now) {
    return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
  }

  normalizeStats(base) { return charNormalizeStats(base); }
  normalizeHqIp(payload) { return charNormalizeHqIp(payload); }
  normalizeArmor(armor) { return charNormalizeArmor(armor); }
  slug(text) { return slugText(text); }
  parseGearDamage(text) { return charParseGearDamage(text); }
	  gearDamageText(item) {
	    const count = this.asNumber(item && item.count, 0, 0, 20);
	    const sides = this.asNumber(item && item.sides, 0, 0, 100);
	    const mod = this.asNumber(item && item.mod, 0, -99, 99);
	    if ((!count || !sides) && Array.isArray(item && item.damageScale) && item.damageScale.length) return 'BODY 2d6/3d6/4d6';
	    if (!count || !sides) return String((item && item.dmg) || '').trim();
	    return count + 'd' + sides + (mod ? (mod > 0 ? '+' + mod : String(mod)) : '');
	  }
  weaponProfile(item) {
    return itemsWeaponProfile(item, { resolveProduct: (code) => this.productByCode(code) });
  }
  hasDamageProfile(item) {
    return itemsHasDamageProfile(item);
  }
  effectiveBodyForDamage(actor) {
    return itemsEffectiveBodyForDamage(actor, {
      normalizeCharacter: (a) => this.normalizeCharacter(a),
      derivedStats: (base, character) => this.derivedStats(base, character),
    });
  }
  damageScaleProfile(weapon, actor) {
    return itemsDamageScaleProfile(weapon, actor, {
      normalizeCharacter: (a) => this.normalizeCharacter(a),
      derivedStats: (base, character) => this.derivedStats(base, character),
    });
  }
  selectedWeaponMode(weapon) {
    return itemsSelectedWeaponMode(weapon);
  }
  gorillaTungstenProfile(weapon) {
    return itemsGorillaTungstenProfile(weapon);
  }
  weaponRuntimeAttackMod(weapon) {
    return itemsWeaponRuntimeAttackMod(weapon);
  }
  weaponRuntimeQuality(weapon) {
    return itemsWeaponRuntimeQuality(weapon);
  }
  ignoresHalfSpBadge(item) {
    return itemsIgnoresHalfSpBadge(item);
  }
  normalizeGearItem(item, idx = 0) {
    const src = item || {};
    const profile = this.weaponProfile(src);
    const name = String(src.name || src.code || 'Gear').trim() || 'Gear';
    const type = String(src.type || src.weaponClass || src.category || 'GEAR').trim().toUpperCase();
    const qty = this.asNumber(src.qty ?? src.quantity, 1, 0, 999);
    const id = String(src.id || this.slug(name + '-' + type) + '-' + idx);
    const normalized = {
      ...profile,
      id,
      code: src.code || '',
      name,
      type,
      weaponClass: profile.weaponClass || type,
      qty,
      equipped: !!src.equipped,
      source: src.source || '',
      rarity: src.rarity || LIMIAR_TIER_COLORS[profile.tier] || (profile.sides ? '#c0635b' : type.includes('CONSUMABLE') ? '#3fe0d0' : '#d6aa4e'),
      notes: String(src.notes || src.desc || '').trim(),
      lastUsedAt: src.lastUsedAt || '',
    };
    normalized.dmg = src.dmg || this.gearDamageText(normalized);
    // Ammo tracking only applies to gear with a numeric magazine (catalog
    // data, not per-instance) — melee/bows/exotics without one are left
    // alone rather than fabricating a fake "1 round" mag. Unset instance
    // ammo defaults to a full magazine so a never-fired weapon reads loaded.
    // `weaponProfile()` names this field `mag` (RuntimeWeaponProfile); alias
    // it to `magazine` here since that's the name combatAmmoEngine/the combat
    // view expect (WeaponCombatProfile.magazine in domain/combat/combatTypes).
    normalized.magazine = profile.mag ?? null;
    normalized.currentAmmo = normalized.magazine == null
      ? null
      : (src.currentAmmo == null ? normalized.magazine : this.asNumber(src.currentAmmo, normalized.magazine, 0, normalized.magazine));
    return normalized;
  }
  normalizeGearList(gear) {
    const rows = Array.isArray(gear) ? gear : [];
    const seen = new Set();
    return rows.map((item, idx) => this.normalizeGearItem(item, idx)).map((item, idx) => {
      let id = item.id;
      if (seen.has(id)) id = id + '-' + idx;
      seen.add(id);
      return { ...item, id };
    });
  }
  installedCyberweaponGear(character) {
    return this.installedCyberware(character).filter(it => it && it.melee && this.hasDamageProfile(it)).map((it, idx) => {
      const gear = this.normalizeGearItem({
        ...it,
        id: 'cyber-' + (it.code || idx),
        type: it.weaponClass || it.marketCat || it.cat || 'CYBERWEAPON',
        qty: 1,
        equipped: true,
        rarity: '#b388ff',
        notes: it.special || it.name || '',
        source: 'cyber',
      }, idx);
      return this.applyCyberweaponEnhancements(gear, this.cyberweaponEnhancementEffects(character, it));
    });
  }
  productByCode(code) {
    const key = String(code || '').trim();
    if (!key) return null;
    const products = Array.isArray(this._catalogProducts) && this._catalogProducts.length ? this._catalogProducts : (this.state.products || []);
    return products.find(product => String(product && product.code || '').trim() === key) || null;
  }
  installPayload(item) {
    if (!item) return null;
    const catalog = this.productByCode(item.code);
    const src = catalog ? {
      ...catalog,
      enhancements: item.enhancements,
      enabled: item.enabled,
      active: item.active,
      heldWeapon: item.heldWeapon || item.installedWeapon || item.weapon,
      selectedMode: item.selectedMode || item.activeMode || item.mode || item.weaponMode || '',
    } : item;
    const profile = this.weaponProfile(src);
    const enhancements = Array.isArray(src.enhancements) ? src.enhancements.map(code => String(code || '').trim()).filter(Boolean) : [];
    return {
      code: src.code,
      cat: src.chromeCat || src.cat || src.category || 'GEAR',
      marketCat: src.cat || src.category || profile.weaponClass || '',
      name: src.name || src.code,
      bonus: this.normalizeBonus(src.bonus),
      skillBonus: this.effectMap(src.skillBonus),
      statMod: this.effectMap(src.statMod),
      armor: Number(src.armor) || 0,
      ram: Number(src.ram) || 0,
      hcost: Number(src.hcost) || 0,
      hcostNote: src.hcostNote || '',
      price: Number(src.price) || 0,
      desc: src.desc || src.description || src.legacyDesc || '',
      sourceType: src.sourceType || '',
      effects: Array.isArray(src.effects) ? src.effects : [],
      imageUrl: src.imageUrl,
      flags: { ...(src.code === 'PAIN-EDITOR' ? { ignoreSeriouslyWounded: true } : {}), ...(src.flags || {}) },
      ...profile,
      instanceId: item.instanceId || item.installationId || src.instanceId || src.installationId,
      parentInstanceId: item.parentInstanceId ?? src.parentInstanceId ?? null,
      location: item.location ?? src.location ?? src.bodyLocation ?? null,
      damageState: item.damageState || src.damageState || 'normal',
      cyberwareType: src.cyberwareType,
      enhancements,
      enabled: item.enabled !== false,
      active: item.active !== false,
      kind: src.kind || profile.kind,
    };
  }
  normalizeBonus(bonus) { return cyberNormalizeBonus(bonus); }
  effectMap(map) { return cyberEffectMap(map); }
  normalizeEquipped(equipped) {
    const rows = Array.isArray(equipped) ? equipped : Object.values(equipped || {});
    const seen = new Set();
    return rows.map((it) => this.installPayload(it)).filter((it) => {
      if (!it || !it.code || seen.has(it.code)) return false;
      seen.add(it.code);
      return true;
    });
  }
  equippedCodes(equipped) {
    return this.normalizeEquipped(equipped).map(it => it.code).filter(Boolean);
  }
  installedCyberware(character) {
    if (character && Object.prototype.hasOwnProperty.call(character, 'equipped')) return this.normalizeEquipped(character.equipped);
    return this.normalizeEquipped(this.state.equipped);
  }
  normalizeEnhancementCodes(codes) { return cyberNormalizeEnhancementCodes(codes); }
  compatibleEnhancements(character, parent) { return cyberCompatibleEnhancements(this.installedCyberware(character), parent); }
  cyberweaponEnhancementEffects(character, parent) { return cyberWeaponEnhancementEffects(this.installedCyberware(character), parent); }
  enhancementEffectLabel(effect) { return cyberEnhancementLabel(effect); }
  applyCyberweaponEnhancements(weapon, effects) { return cyberApplyWeaponEnhancements(weapon, effects); }
  cyberwareStatMods(character) { return cyberStatMods(this.installedCyberware(character)); }
  cyberwareStatModBonus(statName, character) { return cyberStatModBonus(this.installedCyberware(character), statName); }
  cyberwareFlagSources(character, flagName) { return cyberFlagSources(this.installedCyberware(character), flagName); }
  healingRateBonus(character) { return cyberHealingRate(this.installedCyberware(character)); }
  naturalHealingPerRest(character) {
    const actor = character || this.activeCharacter();
    const body = actor && actor.derived && actor.derived.effectiveStats && actor.derived.effectiveStats.BODY != null
      ? Number(actor.derived.effectiveStats.BODY) || 0
      : (this.applyCyberwareStatMods((actor && actor.base) || this.state.base, actor).BODY || 0);
    return cyberNaturalHealing(this.installedCyberware(actor), body);
  }
  immunityBadges(character) { return cyberImmunityBadges(this.installedCyberware(character)); }
  spinalInjuryImmunitySources(character) { return cyberSpinalImmunity(this.installedCyberware(character)); }
  empImmunitySources(character) { return cyberEmpImmunity(this.installedCyberware(character)); }
  criticalInjuryImmunity(character, injuryId) { return cyberCriticalImmunity(this.installedCyberware(character), injuryId); }
  applyCyberwareStatMods(stats, character) { return cyberApplyStatMods(stats, this.installedCyberware(character)); }
  skillCyberwareBonus(skillName, character) { return cyberSkillBonus(this.installedCyberware(character), skillName); }
  cyberwareBonuses(character) { return cyberBonuses(this.installedCyberware(character)); }
  armorPenalty(character) { return charArmorPenalty(character); }
  cyberwareHumanityLoss(equipped) { return cyberHumanityLoss(this.normalizeEquipped(equipped)); }
  skillCanonicalName(name) { return charSkillCanonicalName(name); }
  normalizeSkills(skills, stats) { return charNormalizeSkills(skills, stats); }
  skillSpend(skills) { return charSkillSpend(skills); }
  normalizeSpDamage(spDamage) { return charNormalizeSpDamage(spDamage); }
  normalizeShield(shield) { return charNormalizeShield(shield); }
  damageShield(shield, amount) { return charDamageShield(shield, amount); }
  repairShield(shield, amount) { return charRepairShield(shield, amount); }
  normalizeInstalledPrograms(programs) { return netNormalizeInstalledPrograms(programs); }
  deckProgramSummary(programs, limit) { return netDeckProgramSummary(programs, limit); }
  damageProgramRez(program, amount) { return netDamageProgramRez(program, amount); }
  repairProgramRez(program, amount) { return netRepairProgramRez(program, amount); }
  normalizeConditionDuration(duration) { return condNormalizeConditionDuration(duration); }
  conditionInstanceId(prefix) { return condInstanceId(prefix); }
  normalizeCriticalInjuries(injuries) { return condNormalizeCriticalInjuries(injuries); }
  normalizeStatusEffects(statuses) { return condNormalizeStatusEffects(statuses); }
  derivedStats(stats, character) {
    return charDeriveStats({ stats, character, installedCyberware: this.installedCyberware(character) });
  }
  normalizeCharacter(character) {
    const c = character || {};
    const base = this.normalizeStats(c.base);
    const armor = this.normalizeArmor(c.armor);
    const equipped = this.normalizeEquipped(c.equipped);
    const shield = this.normalizeShield(c.shield);
    const criticalInjuries = this.normalizeCriticalInjuries(c.criticalInjuries);
    const statusEffects = this.normalizeStatusEffects(c.statusEffects);
    const spDamage = this.normalizeSpDamage(c.spDamage);
    const netPrograms = this.normalizeInstalledPrograms(c.netPrograms);
    const derived = this.derivedStats(base, { ...c, base, armor, equipped, shield, criticalInjuries, statusEffects, spDamage, netPrograms });
    const healthMax = c.kind === 'npc' && c.health && c.health.max != null ? this.asNumber(c.health.max, derived.hpMax, 1, 999) : derived.hpMax;
    const healthCur = this.asNumber(c.health && c.health.cur, healthMax, 0, healthMax);
    return {
      ...c,
      id: c.id || '',
      name: c.name || 'OPERATIVE',
      role: c.role || 'EDGERUNNER',
      level: c.level || 1,
      base,
      armor,
      health: { cur: healthCur, max: healthMax },
      // CPR RAW: Luck is a pool spent 1:1 on any single roll, refreshed by
      // the GM at the start of a session (resetLuckForSession). Defaults to
      // a full pool so a character never starts a fresh session at 0.
      luckCurrent: this.asNumber(c.luckCurrent, base.LUCK, 0, base.LUCK),
      humanityLoss: this.asNumber(c.humanityLoss, 0, 0, 100),
      reputation: this.asNumber(c.reputation, 0, 0, 10),
      ip: this.asNumber(c.ip, 0, 0, 999999),
      ipLog: Array.isArray(c.ipLog) ? c.ipLog : [],
      roleAbilityRank: this.asNumber(c.roleAbilityRank, 4, 1, 10),
      equipped,
      shield,
      owned: this.equippedCodes(equipped),
      criticalInjuries,
      statusEffects,
      spDamage,
      netPrograms,
      gear: this.normalizeGearList(c.gear),
      skills: this.normalizeSkills(c.skills, base),
      derived,
    };
  }
  normalizeCharacterList(characters) {
    return (characters || []).map(c => this.normalizeCharacter(c));
  }
  effAttrs(character) {
    const target = character || this.activeCharacter();
    const b = this.applyCyberwareStatMods(target.base || this.state.base, target);
    const penalty = this.armorPenalty(target);
    CPRED_ARMOR_PENALTY_STATS.forEach(k => { b[k] = Math.max(0, (b[k] || 0) - penalty); });
    const aggregate = condAggregateConditions(target);
    Object.keys(aggregate.statPenalties).forEach(k => { b[k] = Math.max(0, (b[k] || 0) - aggregate.statPenalties[k]); });
    return b;
  }
  armorTotal(character) {
    const target = character || this.activeCharacter();
    let chromeArmor = 0;
    this.installedCyberware(target).forEach(it => { if (it) chromeArmor = Math.max(chromeArmor, Number(it.armor) || 0); });
    const worn = this.normalizeArmor(target.armor);
    return Math.max(chromeArmor, worn.head.sp || 0, worn.body.sp || 0);
  }
  ramTotal(character) { let r = 6; this.installedCyberware(character).forEach(it => { if (it) r += it.ram || 0; }); return r; }
  humanity(character) {
    const target = character || this.activeCharacter();
    return this.derivedStats(target.base, target).humanityCurrent;
  }

  go(v) {
    const combatState = this.combatHandlers().normalizeCombatState(this.state.combatState);
    if (v === 'combat' && !this.state.gm && !combatState.active) {
      this.flash(this.tx().noCombat);
      return;
    }
    // Combat rolls render inline in the combat page, not as a fullscreen
    // overlay — leaving without dismissing must not drag the overlay along
    // to the next screen.
    if (this.state.view === 'combat' && v !== 'combat' && this.state.rollOverlay) this.closeRoll();
    const patch = { view: v, sheetOpen: false, selected: null };
    if (v !== 'games') {
      clearInterval(this._gi);
      this.tarotHandlers().stopTarotFx();
      this.nexusHandlers().teardownNexus();
      patch.gameTab = 'tarot';
    }
    this.setState(patch);
  }

  async openCampaignMap() {
    const api = this.api();
    if (!api?.auth?.token() || !api?.campaigns?.list) {
      this.flash('Login necessario para abrir o mapa da campanha');
      return;
    }
    if (this.state.activeCampaignId) {
      window.location.assign('/campaign-map.html?campaign=' + encodeURIComponent(this.state.activeCampaignId));
      return;
    }
    try {
      const campaigns = await api.campaigns.list();
      const user = this.state.authUser || {};
      const isAdmin = user.role === 'admin';
      const campaign = (Array.isArray(campaigns) ? campaigns : []).find((entry) => {
        if (!entry || entry.status === 'archived') return false;
        return isAdmin
          || entry.isMember
          || entry.created_by === user.username
          || entry.createdBy === user.username;
      });
      const campaignId = String(campaign?.id || '').trim();
      if (!campaignId) {
        this.flash('Participe ou crie uma campanha antes de abrir o mapa');
        return;
      }
      window.location.assign('/campaign-map.html?campaign=' + encodeURIComponent(campaignId));
    } catch (_) {
      this.flash('Nao foi possivel abrir o mapa da campanha');
    }
  }

  async consumeMapAttackIntent() {
    if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('mapAttack')) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('mapAttack');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    const intent = loadMapAttackIntent(window.sessionStorage);
    if (!intent) return this.flash('Medida de ataque expirada');
    try {
      const mapState = await this.api().campaignMaps.get(intent.campaignId);
      const tokens = Array.isArray(mapState && mapState.tokens) ? mapState.tokens : [];
      const attacker = tokens.find(token => token && token.id === intent.attackerTokenId && token.characterId === intent.attackerCharacterId);
      const target = tokens.find(token => token && token.id === intent.targetTokenId && token.characterId === intent.targetCharacterId);
      const combat = this.combatHandlers().normalizeCombatState(this.state.combatState, this.state.characters);
      const current = this.combatHandlers().currentCombatantId(combat);
      const username = this.state.authUser && this.state.authUser.username;
      const controlled = !!this.state.gm || !!(attacker && attacker.ownerUsername === username);
      const visible = mapTokenVisibleNow(mapState || {}, target, { gm: !!this.state.gm, username });
      if (!attacker || !target || !controlled || !visible || !combat.active || current !== intent.attackerCharacterId) {
        clearMapAttackIntent(window.sessionStorage);
        return this.flash('Medida de ataque nao e mais valida');
      }
      clearMapAttackIntent(window.sessionStorage);
      this.setState(s => ({
        view: 'combat', sheetOpen: false, selected: null,
        combatFocusId: intent.attackerCharacterId,
        combatTargets: { ...(s.combatTargets || {}), [intent.attackerCharacterId]: intent.targetCharacterId },
        mapAttackContexts: { ...(s.mapAttackContexts || {}), [intent.attackerCharacterId]: intent },
      }));
    } catch (_) {
      clearMapAttackIntent(window.sessionStorage);
      this.flash('Nao foi possivel validar a medida de ataque');
    }
  }

  // CM1: "abrir ficha" / "abrir cockpit" from the map's token context menu.
  // No range/turn validation to carry like the attack intent above — just an
  // identity handoff — but same one-shot sessionStorage discipline and the
  // same second guard on hydration (a GM-only menu action reaching here for
  // a player who lost GM mode mid-flight must not silently succeed).
  async consumeMapFocusIntent() {
    if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('mapFocus')) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('mapFocus');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    const intent = loadMapFocusIntent(window.sessionStorage);
    if (!intent) return this.flash('Foco de personagem expirado');
    clearMapFocusIntent(window.sessionStorage);
    const character = (this.state.characters || []).find(c => c.id === intent.characterId);
    const username = this.state.authUser && this.state.authUser.username;
    const owns = !!character && (character.ownerUsername === username || character.createdBy === username);
    if (!character || (!this.state.gm && !owns)) return this.flash('Personagem indisponivel ou sem permissao');
    if (intent.mode === 'combat') {
      this.setState({ view: 'combat', sheetOpen: false, selected: null, combatFocusId: intent.characterId });
      return;
    }
    this.sheetHandlers().selectCharacter(intent.characterId);
    this.setState({ sheetOpen: true, sheetExpanded: true, sheetEditing: false, sheetCreating: false, sheetDraft: null, sheetTab: 'core' });
  }

  // Switch Player/GM. If we are sitting on the Breach tab, remount so the
  // correct mode (setup form vs. locked challenge) takes effect immediately.
  toggleRole(gm) {
    if (!this.state.authAuthenticated) return this.redirectToLogin();
    if (gm && !this.state.gmAuthenticated) return this.redirectToLogin();
    this.setState({ gm });
    if (this.state.view === 'games' && this.state.gameTab === 'nexus') {
      this.nexusHandlers().teardownNexus();
      this.nexusHandlers().mountNexus();
    }
  }

  async logoutGm() {
    if (this.api() && this.api().auth) await this.api().auth.logout();
    this.setState({ authAuthenticated: false, authUser: null, gmAuthenticated: false, gm: false, sheetEditing: false, sheetCreating: false, sheetDraft: null, characters: [], activeCharacterId: null, users: [], gmStatus: 'Sessao encerrada' });
    this.redirectToLogin();
  }

  ensureGm() {
    if (this.state.gmAuthenticated) return true;
    this.redirectToLogin();
    return false;
  }

  authSession() {
    return { authAuthenticated: this.state.authAuthenticated, authUser: this.state.authUser, activeCharacterId: this.state.activeCharacterId };
  }
  isAdmin() {
    return authIsAdmin(this.authSession());
  }
  isPlayerUser() {
    return authIsPlayerUser(this.authSession());
  }
  canManageOwnSheet(characterId) {
    return authCanManageOwnSheet(this.authSession(), characterId);
  }

	  activeCharacter() {
	    return this.normalizeCharacter((this.state.characters || []).find(c => c.id === this.state.activeCharacterId) || (this.state.characters || [])[0] || {});
	  }
	  characterById(id) {
	    return this.normalizeCharacter((this.state.characters || []).find(c => c.id === id) || this.activeCharacter());
	  }
	  playerRoleTone(role) {
	    const key = String(role || '').trim().toLowerCase();
	    if (key.includes('medtech')) return { label: 'MED', color: '#3fe0d0', rgb: '63,224,208' };
	    if (key.includes('netrunner')) return { label: 'NET', color: '#b56cff', rgb: '181,108,255' };
	    if (key.includes('solo')) return { label: 'SOL', color: '#ff5f6d', rgb: '255,95,109' };
	    if (key.includes('tech')) return { label: 'TEC', color: '#4fb7ff', rgb: '79,183,255' };
	    if (key.includes('fixer')) return { label: 'FIX', color: '#d6aa4e', rgb: '214,170,78' };
	    if (key.includes('nomad')) return { label: 'NOM', color: '#8fd16a', rgb: '143,209,106' };
	    if (key.includes('rocker')) return { label: 'RCK', color: '#ff6fcf', rgb: '255,111,207' };
	    if (key.includes('lawman')) return { label: 'LAW', color: '#7aa7ff', rgb: '122,167,255' };
	    if (key.includes('exec')) return { label: 'EXE', color: '#f0ead8', rgb: '240,234,216' };
	    if (key.includes('npc')) return { label: 'NPC', color: '#8b8a78', rgb: '139,138,120' };
	    return { label: 'EDG', color: '#d6aa4e', rgb: '214,170,78' };
	  }
	  api() { return this.props.api || null; }
  app() { return this.props.app || null; }
  store() { return this.props.store || {}; }
  hqHandlers() {
    if (!this._hqHandlers) this._hqHandlers = hqHandlers(this);
    return this._hqHandlers;
  }
  chatHandlers() {
    if (!this._chatHandlers) this._chatHandlers = chatHandlers(this);
    return this._chatHandlers;
  }
  mapHandlers() {
    if (!this._mapHandlers) this._mapHandlers = mapHandlers(this);
    return this._mapHandlers;
  }
  nexusHandlers() {
    if (!this._nexusHandlers) this._nexusHandlers = nexusHandlers(this);
    return this._nexusHandlers;
  }
  tarotHandlers() {
    if (!this._tarotHandlers) this._tarotHandlers = tarotHandlers(this);
    return this._tarotHandlers;
  }
  sheetHandlers() {
    if (!this._sheetHandlers) this._sheetHandlers = sheetHandlers(this);
    return this._sheetHandlers;
  }
  combatHandlers() {
    if (!this._combatHandlers) this._combatHandlers = combatHandlers(this);
    return this._combatHandlers;
  }
  desktopHandlers() {
    if (!this._desktopHandlers) this._desktopHandlers = desktopHandlers(this);
    return this._desktopHandlers;
  }
  asNumber(value, fallback, min, max) { return numAsNumber(value, fallback, min, max); }
  traumaPlanKey(character) {
    return charTraumaPlanKey(character);
  }
  traumaPlanByKey(key) {
    return charTraumaPlanByKey(key);
  }
  triggerFileInput(id) {
    const el = document.getElementById(id);
    if (el) el.click();
  }
  // Shared persistence path, no GM gate — used directly by the handful of
  // mutations a player may run on their own sheet (removing a condition).
  // Everything else goes through updateCharacterById, which gates on GM auth.
  applyCharacterPatch(characterId, patch) {
    const current = (this.state.characters || []).find(c => c.id === characterId) || this.activeCharacter();
    const next = this.normalizeCharacter({ ...current, ...patch });
    this._charactersTouched = true;
    this.setState(s => ({
      characters: (s.characters || []).map(c => c.id === next.id ? next : c),
      credits: next.id === s.activeCharacterId ? (next.credits ?? s.credits) : s.credits,
      base: next.id === s.activeCharacterId ? (next.base || s.base) : s.base,
      equipped: next.id === s.activeCharacterId ? this.normalizeEquipped(next.equipped || s.equipped) : s.equipped,
      owned: next.id === s.activeCharacterId ? this.equippedCodes(next.equipped || s.equipped) : s.owned,
      health: next.id === s.activeCharacterId ? (next.health || s.health) : s.health,
      ramUsed: next.id === s.activeCharacterId ? (next.ramUsed ?? s.ramUsed) : s.ramUsed,
      gearItems: next.id === s.activeCharacterId ? (next.gear || s.gearItems) : s.gearItems,
    }));
    if (this.api()) {
      const writer = this.state.gmAuthenticated
        ? this.api().characters.upsert
        : (this.api().characters.createPlayer || this.api().characters.upsert);
      writer(next);
    }
  }
  updateCharacterById(characterId, patch) {
    if (!this.ensureGm('Login do mestre necessario para alterar personagem')) return;
    this.applyCharacterPatch(characterId, patch);
  }
  updateActiveCharacter(patch) {
    this.updateCharacterById(this.activeCharacter().id, patch);
  }
  addCriticalInjury(location, injuryId, options) {
    const catalog = CPRED_CRITICAL_INJURIES[injuryId];
    if (!catalog) return this.flash('Lesao critica invalida');
    const opts = options || {};
    const targetId = opts.targetId || this.activeCharacter().id;
    const active = this.normalizeCharacter((this.state.characters || []).find(c => c.id === targetId) || this.activeCharacter());
    const immunity = this.criticalInjuryImmunity(active, catalog.id);
    if (immunity && immunity.blocked) {
      const source = immunity.sources.join(', ');
      this.flash(catalog.name_pt + ' bloqueada por ' + source);
      return { applied: false, blocked: true, sources: immunity.sources };
    }
    const entry = condCriticalInjuryEntry(catalog, { location, source: opts.source, stackPenalty: opts.stackPenalty });
    const hpLoss = Math.max(0, Number(opts.hpLossDirect) || 0);
    const patch = { criticalInjuries: [...(active.criticalInjuries || []), entry] };
    if (hpLoss) patch.health = { ...(active.health || {}), cur: Math.max(0, ((active.health && active.health.cur) || 0) - hpLoss) };
    this.updateCharacterById(active.id, patch);
    return { applied: true, blocked: false, entry };
  }
  addStatusEffect(presetId, options) {
    const opts = options || {};
    const preset = typeof presetId === 'object' ? presetId : CPRED_STATUS_PRESETS.find(item => item.id === presetId);
    if (!preset) return this.flash('Status invalido');
    const targetId = opts.targetId || this.activeCharacter().id;
    const active = this.normalizeCharacter((this.state.characters || []).find(c => c.id === targetId) || this.activeCharacter());
    const entry = condStatusEffectEntry(preset, { source: opts.source });
    this.updateCharacterById(active.id, { statusEffects: [...(active.statusEffects || []), entry] });
  }
  statusChargeKey(status) { return condStatusChargeKey(status); }
  // Humanity recovery (CPR RAW: therapy, Morale Boost, near-death 3d6).
  // Reduces only the stored humanityLoss scalar (never the cyberware-hcost
  // portion, which isn't stored here — see applyHumanityRecovery). Publishes
  // the result to the shared chat like other GM-applied effects.
  recoverHumanity(targetId, amount, options) {
    const opts = options || {};
    const recoverable = Math.max(0, Number(amount) || 0);
    if (!recoverable) return;
    const target = this.normalizeCharacter((this.state.characters || []).find(c => c.id === targetId) || this.activeCharacter());
    const next = charApplyHumanityRecovery(target.humanityLoss, recoverable);
    this.updateCharacterById(target.id, { humanityLoss: next });
    this.postChat({
      kind: 'roll',
      sender: 'MESTRE',
      text: '',
      roll: {
        label: (opts.label || 'RECUPERACAO DE HUMANIDADE') + ' :: ' + (target.name || targetId).toUpperCase(),
        detail: opts.detail || ('+' + recoverable + ' HUM'),
        total: recoverable,
        outcome: 'HUM +' + recoverable,
      },
    });
  }
  // Stabilization success on a Mortally Wounded target (CPR RAW): revives to
  // 1 HP and marks Inconsciente for 1 minute. Only the caller (rollStabilize)
  // decides success/DV — this just applies the fixed RAW effect.
  stabilizeMortallyWounded(targetId, options) {
    const opts = options || {};
    const target = this.normalizeCharacter((this.state.characters || []).find(c => c.id === targetId) || this.activeCharacter());
    const preset = CPRED_STATUS_PRESETS.find(item => item.id === 'unconscious');
    if (!preset) return;
    const entry = condStatusEffectEntry(preset, { source: opts.source || 'stabilize' });
    const hpMax = (target.derived && target.derived.hpMax) || (target.health && target.health.max) || 1;
    this.updateCharacterById(target.id, {
      health: { cur: 1, max: hpMax },
      statusEffects: [...(target.statusEffects || []), entry],
    });
  }
  adjustSpDamage(targetId, location, amount) {
    const target = this.normalizeCharacter((this.state.characters || []).find(c => c.id === targetId) || this.activeCharacter());
    const slot = location === 'head' ? 'head' : 'body';
    const current = this.normalizeSpDamage(target.spDamage);
    this.updateCharacterById(target.id, { spDamage: { ...current, [slot]: Math.max(0, (current[slot] || 0) + (Number(amount) || 0)) } });
  }
  async uploadImage(file, scope, ownerId) {
    if (!file) return null;
    if (!this.ensureGm('Login do mestre necessario para upload')) return null;
    if (this.api()) return this.api().uploads.image(file, { scope, ownerId });
    return { url: URL.createObjectURL(file) };
  }
  tx() {
    return i18nTranslations(this.state.lang);
  }

  // ---- Dice ----
	  canUse3dRoll(opts) {
	    const diceLib = window.DICE || (typeof DICE !== 'undefined' ? DICE : null);
	    if (!diceLib || !window.THREE || !window.CANNON || !diceLib.parse_notation) return false;
	    const parsed = diceLib.parse_notation(this.rollNotation(opts));
	    return !!(parsed && parsed.set && parsed.set.length > 0 && parsed.set.length <= 20);
	  }

	  roll(opts) {
    clearInterval(this._ri);
    clearTimeout(this._diceKick);
    const rollId = Date.now() + ':' + Math.random();
    const baseMod = Number(opts.mod) || 0;
	    const reusable = { label: opts.label, sides: opts.sides, count: opts.count || 1, mod: baseMod, check: !!opts.check };
	    if (Array.isArray(opts.contributions)) reusable.contributions = opts.contributions.map(row => ({ ...row }));
	    if (opts.rollScope) reusable.rollScope = opts.rollScope;
	    if (Array.isArray(opts.breakdown) && opts.breakdown.length) reusable.breakdown = opts.breakdown.slice();
	    if (opts.enhancementContext) reusable.enhancementContext = JSON.parse(JSON.stringify(opts.enhancementContext));
    if (opts.actorId) reusable.actorId = opts.actorId;
    if (opts.deathSaveTarget != null) reusable.deathSaveTarget = opts.deathSaveTarget;
    if (opts.dv != null) reusable.dv = opts.dv;
    if (opts.combatantId) reusable.combatantId = opts.combatantId;
    if (opts.initiative) reusable.initiative = true;
    const actor = opts.actorId
      ? ((this.state.characters || []).find(c => c.id === opts.actorId) || this.activeCharacter())
      : this.activeCharacter();
    const derived = this.derivedStats(actor.base, actor);
    const actionPenalty = reusable.check && !opts.skipActionPenalty ? (Number(derived.actionPenalty) || 0) : 0;
    const run = { ...reusable, mod: baseMod - actionPenalty, rollId, onResolved: typeof opts.onResolved === 'function' ? opts.onResolved : null };
    const tx = this.tx();
    const use3d = this.canUse3dRoll(run);
    this._rollId = rollId;
    this.setState({
      rollOverlay: true,
      rolling: true,
      rollFace: 0,
      dice3dActive: use3d,
      dice3dReady: false,
      lastRollOpts: reusable,
      lastRoll: { label: run.label, detail: this.rollNotation(run), total: '', color: '#d6aa4e', outcome: tx.rolling },
    });
    const kick = () => {
      if (this._rollId !== rollId) return;
      if (use3d && this.start3dRoll(run)) return;
      this.startFallbackRoll(run);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(kick);
    else this._diceKick = setTimeout(kick, 30);
  }
  normalizeRollContributions(opts) { return diceNormalizeContributions(opts); }
  rollDiceMeta(opts) { return diceRollMeta(opts); }
  rollNotation(opts) { return diceRollNotation(opts); }
  start3dRoll(opts) {
    const diceLib = window.DICE || (typeof DICE !== 'undefined' ? DICE : null);
    const el = document.getElementById('limiar-dice-stage');
    if (!diceLib || !window.THREE || !window.CANNON || !el) return false;
    const notation = this.rollNotation(opts);
    const parsed = diceLib.parse_notation ? diceLib.parse_notation(notation) : null;
    if (!parsed || !parsed.set || parsed.set.length === 0 || parsed.set.length > 20) return false;
    try {
      if (this._diceBox && this._diceBox.clear) this._diceBox.clear();
      el.innerHTML = '';
      this._diceContainer = el;
      this._diceBox = new diceLib.dice_box(el);
      this._diceBox.setDice(notation);
      this.state.dice3dReady = true;
      this._diceBox.start_throw(
        () => null,
        (notationResult) => this.finish3dRoll(opts, notationResult)
      );
      return true;
    } catch (err) {
      console.warn('Limiar dice 3D fallback:', err);
      return false;
    }
  }
  startFallbackRoll(opts) {
    this.setState({ dice3dActive: false, dice3dReady: false, rollFace: 1 });
    let ticks = 0;
    const meta = this.rollDiceMeta(opts);
    this._ri = setInterval(() => {
      if (this._rollId !== opts.rollId) { clearInterval(this._ri); return; }
      ticks++;
      const tickSides = meta.length ? meta[ticks % meta.length].sides : opts.sides;
      const face = 1 + Math.floor(Math.random() * tickSides);
      this.state.rollFace = face;
      const faceEl = document.querySelector('[data-limiar-roll-face="true"]');
      if (faceEl) faceEl.textContent = String(face);
      if (ticks >= 11) { clearInterval(this._ri); this.finishRoll(opts); }
    }, 55);
  }
  finish3dRoll(opts, notation) {
    if (this._rollId !== opts.rollId) return;
    const faces = notation && Array.isArray(notation.result) ? notation.result : [];
    if (!faces.length || faces[0] < 0) { this.finishRoll(opts); return; }
    const total = typeof notation.resultTotal === 'number' ? notation.resultTotal : faces.reduce((sum, v) => sum + v, 0) + (opts.mod || 0);
    const detail = this.normalizeRollContributions(opts).length
      ? this.rollDetail(opts, faces)
      : opts.sides === 100
      ? (notation.resultString || String(total)).replace(/\s*=\s*-?\d+\s*$/, '').replace(/\s+/g, ' ')
      : this.rollDetail(opts, faces);
    this.commitRoll(opts, faces, total, detail);
  }
  finishRoll(opts) {
    const { faces, total, detail } = diceRollFaces(opts);
    this.commitRoll(opts, faces, total, detail);
  }
  rollDetail(opts, faces) { return diceRollDetail(opts, faces); }
  rollBreakdownDetail(detail, breakdown) { return diceRollBreakdownDetail(detail, breakdown); }
  cyberSourceBreakdown(sources) { return diceCyberSourceBreakdown(sources); }
  randomCriticalInjury() {
    const rows = Object.values(CPRED_CRITICAL_INJURIES);
    return rows[Math.floor(Math.random() * rows.length)] || null;
  }
  resolveCyberweaponEnhancementRoll(context, dice) {
    if (!context || !Array.isArray(context.effects) || !context.effects.length) return { totalMod: 0, breakdown: [] };
    const effects = context.effects;
    const breakdown = [];
    let totalMod = 0;
    const damageDice = (Array.isArray(dice) ? dice : []).filter(die => die && die.kind === 'base');
    const isCriticalDamage = damageDice.filter(die => Number(die.sides) === 6 && Number(die.value) === 6).length >= 2;
    const sourceList = (type) => effects.filter(effect => effect.type === type).map(effect => effect.from || effect.sourceCode).filter(Boolean).join(', ');
    if (isCriticalDamage) {
      const critDamage = effects.filter(effect => effect.type === 'critDamage').reduce((sum, effect) => sum + (Number(effect.value) || 0), 0);
      if (critDamage) {
        totalMod += critDamage;
        breakdown.push('CRIT ENH +' + critDamage + ' (' + sourceList('critDamage') + ')');
      }
      const critRolls = effects.filter(effect => effect.type === 'critRoll').reduce((max, effect) => Math.max(max, Number(effect.rolls) || 1), 1);
      if (critRolls > 1) {
        const candidates = Array.from({ length: critRolls }, () => this.randomCriticalInjury()).filter(Boolean);
        const picked = candidates.slice().sort((a, b) => (Number(b.bonusDamage) || 0) - (Number(a.bonusDamage) || 0))[0];
        if (picked) breakdown.push('CRIT TABLE x' + critRolls + ' KEEP ' + picked.name_pt);
      }
    }
    if (effects.some(effect => effect.type === 'ignoreArmor' && effect.condition === 'targetSPbelow7')) breakdown.push('SP<7 => SP 0 (' + sourceList('ignoreArmor') + ')');
    const ablation = effects.filter(effect => effect.type === 'armorAblation').reduce((sum, effect) => sum + (Number(effect.value) || 0), 0);
    if (ablation) breakdown.push('ABLATE +' + ablation + ' SP (' + sourceList('armorAblation') + ')');
    const weaponModes = effects.filter(effect => effect.type === 'weaponMode');
    if (weaponModes.length) breakdown.push('MODES ' + weaponModes.flatMap(effect => Array.isArray(effect.modes) ? effect.modes : []).join('/') + ' ROF ' + (weaponModes[0].rof || '-'));
    if (effects.some(effect => effect.type === 'nonLethalOption')) breakdown.push('NONLETHAL OPTION');
    return { totalMod, breakdown };
  }
  cyberweaponRollContext(weapon) {
    const effects = Array.isArray(weapon && weapon.enhancementEffects) ? weapon.enhancementEffects : [];
    if (!effects.length) return null;
    return {
      weaponCode: weapon.code,
      weaponName: weapon.name,
      effects: effects.map(effect => ({
        type: effect.type,
        value: effect.value,
        rolls: effect.rolls,
        keep: effect.keep,
        condition: effect.condition,
        dice: effect.dice,
        modes: Array.isArray(effect.modes) ? effect.modes.slice() : undefined,
        rof: effect.rof,
        from: effect.from,
        sourceCode: effect.sourceCode,
      })),
    };
  }
  commitRoll(opts, faces, total, detail) {
    const sides = opts.sides;
    const diceMeta = this.rollDiceMeta(opts);
    const dice = faces.map((value, idx) => ({
      value,
      sides: diceMeta[idx] ? diceMeta[idx].sides : sides,
      source: diceMeta[idx] ? diceMeta[idx].source : (opts.label || 'Roll'),
      kind: diceMeta[idx] ? diceMeta[idx].kind : (opts.rollScope === 'damage' ? 'base' : 'roll'),
      reason: diceMeta[idx] ? diceMeta[idx].reason : '',
      contributionIndex: diceMeta[idx] ? diceMeta[idx].contributionIndex : 0,
    }));
	    const isCheck = !!opts.check;
	    if (isCheck && faces[0] === 10) {
      const extra = 1 + Math.floor(Math.random() * 10);
      total += extra;
      detail = detail + ' + ' + extra;
    } else if (isCheck && faces[0] === 1) {
      const extra = 1 + Math.floor(Math.random() * 10);
      total -= extra;
      detail = detail + ' - ' + extra;
    }
    const crit = isCheck && faces[0] === 10;
    const fumble = opts.check && faces[0] === 1;
    const tx = this.tx();
    let outcome = '', color = '#f0ead8';
    let success, deathSavePassed;
    if (opts.deathSaveTarget != null) {
      const ok = faces[0] !== 10 && total < opts.deathSaveTarget;
      deathSavePassed = ok;
      outcome = ok ? 'DEATH SAVE OK' : 'DEATH SAVE FALHOU';
      color = ok ? '#3fe0d0' : '#c0635b';
      detail = detail + ' < ' + opts.deathSaveTarget;
    }
    else if (crit) { outcome = tx.critical; color = '#3fe0d0'; }
    else if (fumble) { outcome = tx.fumble; color = '#c0635b'; }
    else if (opts.check && opts.dv != null) {
      const ok = total >= Number(opts.dv);
      success = ok;
      outcome = ok ? tx.success : tx.checkRolled;
      color = ok ? '#3fe0d0' : '#d6aa4e';
      detail = detail + ' vs DV ' + opts.dv;
    }
    else if (opts.check) { outcome = ''; color = '#d6aa4e'; }
    else { outcome = tx.result; color = '#d6aa4e'; }
	    const enhancementResult = this.resolveCyberweaponEnhancementRoll(opts.enhancementContext, dice);
	    if (enhancementResult.totalMod) total += enhancementResult.totalMod;
	    detail = this.rollBreakdownDetail(detail, [...enhancementResult.breakdown, ...(opts.breakdown || [])]);
	    const rec = { label: opts.label, detail, total, color, outcome };
    this.setState(s => ({ rolling: false, rollFace: opts.sides === 100 ? total : faces[0], lastRoll: rec, rolls: [{ label: opts.label, detail, total, color }, ...s.rolls].slice(0, 24) }));
    // Notify the GM of every player roll by posting the result to the shared
    // comms channel. GM rolls stay private (not broadcast).
    if (!this.state.gm) {
      const rollPayload = { label: opts.label, detail: String(detail), total, outcome };
      // Tag initiative rolls so the GM client can fold the result into the
      // shared combat state (only the GM may persist combat state).
      if (opts.initiative && opts.combatantId) rollPayload.initiativeFor = opts.combatantId;
      // CM2: tag evasion-prompt replies so the attacker's client can consume
      // this specific roll as the melee attack's DV (see combat.js applyEvasionRolls).
      if (opts.evasionFor) { rollPayload.evasionFor = opts.evasionFor; rollPayload.evasionRequestId = opts.requestId; }
      this.postChat({ kind: 'roll', text: '', roll: rollPayload });
    }
	    if (typeof opts.onResolved === 'function') {
	      try { opts.onResolved({ label: opts.label, detail: String(detail), total, faces: faces.slice(), dice, contributions: this.normalizeRollContributions(opts), scope: opts.rollScope || (opts.check ? 'check' : 'roll'), crit, fumble, success, deathSavePassed, outcome, color }); }
	      catch (err) { console.warn('Limiar roll onResolved failed:', err); }
	    }
	  }
  rollAgain() {
    if (this.state.rolling || !this.state.lastRollOpts) return;
    this.roll(this.state.lastRollOpts);
  }
  closeRoll() {
    clearInterval(this._ri);
    clearTimeout(this._diceKick);
    this._rollId = null;
    if (this._diceBox && this._diceBox.clear) this._diceBox.clear();
    this.setState({ rollOverlay: false, rolling: false, dice3dActive: false, dice3dReady: false });
  }

  flash(message, ms = 2600) {
    clearTimeout(this._tt);
    this.setState({ toast: message, gmStatus: message });
    this._tt = setTimeout(() => this.setState({ toast: null }), ms);
  }

  ipEntry(type, label, amount, balanceAfter) { return econIpEntry(type, label, amount, balanceAfter); }


  // ---- Comms (shared channel: player rolls notify the GM; the GM chats and
  // requests roll tests the same way) ----
  nowHHMM() {
    const now = this.state.now || new Date();
    return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  }
  chatText(value) {
    return chatRollText(value);
  }
  chatRollTitle(label, sender) {
    return chatRollTitleText(label, sender);
  }
  trackingToneFromLabel(label, rows = []) {
    return viewTrackingToneFromLabel(label, rows);
  }
  parseDamageTrackingLine(line) {
    return chatParseDamageTrackingLine(line);
  }
  parseDamageTrackingMessage(value) {
    return chatParseDamageTrackingMessage(value, { resolveTone: (label, rows) => this.trackingToneFromLabel(label, rows) });
  }
  async postChat(message) {
    if (!(this.api() && this.api().chat)) return;
    const active = this.activeCharacter();
    const payload = {
      sender: this.state.gm ? 'MESTRE' : (active.name || 'OPERATIVO'),
      role: this.state.gm ? 'gm' : 'player',
      at: this.nowHHMM(),
      ...message,
    };
    try { await this.api().chat.post(payload); await this.refreshChat(); }
    catch (_) { /* backend offline - skip */ }
  }
  async refreshChat() {
    if (!(this.api() && this.api().chat)) return;
    try {
      const list = await this.api().chat.list();
      if (!Array.isArray(list)) return;
      const prevLen = Array.isArray(this.state.comms) ? this.state.comms.length : 0;
      // Capture whether the user is already near the bottom of the feed before
      // the re-render. We only auto-scroll on new messages if they were already
      // following the conversation, so reading history is never interrupted.
      const feed = document.getElementById('comms-feed');
      const wasAtBottom = !feed || (feed.scrollHeight - feed.scrollTop - feed.clientHeight) < 80;
      this.setState({ comms: list });
      this.combatHandlers().applyInitiativeRolls(list);
      this.combatHandlers().applyEndTurnRequests(list);
      this.combatHandlers().applyEvasionRolls(list);
      if (list.length > prevLen && wasAtBottom) this.scrollCommsToBottom();
    } catch (_) { /* backend offline - keep current */ }
  }
  // Lightweight poll so a GM sees player characters (and live combat state)
  // created/updated after page load. Unlike reloadRemoteData() this never
  // touches active-character-derived state, so it cannot clobber a sheet the
  // user is editing. Skipped while a sheet edit/create is open as a safeguard.
  async refreshRoster() {
    if (!(this.api() && this.api().characters)) return;
    if (!this.state.authAuthenticated) return;
    if (this.state.sheetEditing || this.state.sheetCreating) return;
    try {
      const [characters, combatStateRaw] = await Promise.all([
        this.api().characters.list(),
        this.api().combat && this.api().combat.state ? this.api().combat.state.get() : Promise.resolve(null),
      ]);
      if (!Array.isArray(characters)) return;
      const normalizedCharacters = this.normalizeCharacterList(characters);
      const patch = { characters: normalizedCharacters };
      if (combatStateRaw) patch.combatState = this.combatHandlers().normalizeCombatState(combatStateRaw, normalizedCharacters);
      this.setState(patch);
    } catch (_) { /* backend offline - keep current */ }
  }
  // setState re-renders synchronously, but defer the scroll one frame so layout
  // is settled before we measure scrollHeight.
  scrollCommsToBottom() {
    const kick = () => { const el = document.getElementById('comms-feed'); if (el) el.scrollTop = el.scrollHeight; };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(kick); else kick();
  }
  // Player action: fulfil a GM roll-test request. Rolling runs the normal dice
  // pipeline, which reports the result back to the GM via commitRoll.
  rollFromRequest(opts) {
    if (!opts) return;
    this.roll({
      label: opts.label, sides: opts.sides, count: opts.count || 1, mod: opts.mod || 0, check: !!opts.check,
      ...(opts.dv != null ? { dv: opts.dv } : {}),
      ...(opts.deathSaveTarget != null ? { deathSaveTarget: opts.deathSaveTarget } : {}),
      ...(opts.combatantId ? { combatantId: opts.combatantId } : {}),
      ...(opts.initiative ? { initiative: true } : {}),
      // CM2: evasion-prompt roll requests carry evasionFor/requestId so the
      // attacker's client can match this specific reply (see commitRoll).
      ...(opts.evasionFor ? { evasionFor: opts.evasionFor, requestId: opts.requestId } : {}),
    });
  }

  // ---- styles ----
  chipStyle(a) { return viewChipStyle(a); }
  dieStyle(a) { return viewDieStyle(a); }
  viewStyle(a) { return viewViewStyle(a); }
  langBtnStyle(active, hasLeftBorder) { return viewLangBtnStyle(active, hasLeftBorder); }
  pageBtnStyle(a, disabled) { return viewPageBtnStyle(a, disabled); }
  toggleRow(on) { return viewToggleRow(on); }

  renderVals() {
    const S = this.state;
    const tx = this.tx();
    const activeCharacter = this.activeCharacter();
    const eff = this.effAttrs(activeCharacter);
    const derived = this.derivedStats(activeCharacter.base, activeCharacter);
    const healthMax = derived.hpMax || 1;
    const healthCur = this.asNumber((S.health && S.health.cur) ?? (activeCharacter.health && activeCharacter.health.cur), healthMax, 0, healthMax);
    const hum = derived.humanityCurrent;
    const ramMax = this.ramTotal(activeCharacter);
    const ramUsed = S.ramUsed ?? activeCharacter.ramUsed ?? 0;

    const sheet = sheetRenderVals(S, {
      tx,
      activeCharacter,
      derived,
      eff,
      setState: (fn) => this.setState(fn),
      asNumber: (v, f, min, max) => this.asNumber(v, f, min, max),
      cpredStatMax: (key) => this.cpredStatMax(key),
      normalizeStats: (base) => this.normalizeStats(base),
      normalizeEquipped: (equipped) => this.normalizeEquipped(equipped),
      normalizeShield: (shield) => this.normalizeShield(shield),
      normalizeInstalledPrograms: (programs) => this.normalizeInstalledPrograms(programs),
      deckProgramSummary: (programs, limit) => this.deckProgramSummary(programs, limit),
      normalizeArmor: (a) => this.normalizeArmor(a),
      normalizeSkills: (skills, stats) => this.normalizeSkills(skills, stats),
      skillSpend: (skills) => this.skillSpend(skills),
      derivedStats: (stats, character) => this.derivedStats(stats, character),
      cyberwareStatModBonus: (stat, character) => this.cyberwareStatModBonus(stat, character),
      skillCyberwareBonus: (skillName, character) => this.skillCyberwareBonus(skillName, character),
      cyberSourceBreakdown: (sources) => this.cyberSourceBreakdown(sources),
      roll: (opts) => this.roll(opts),
      installedCyberware: (character) => this.installedCyberware(character),
      compatibleEnhancements: (character, parent) => this.compatibleEnhancements(character, parent),
      normalizeEnhancementCodes: (codes) => this.normalizeEnhancementCodes(codes),
      cyberwareBonuses: (character) => this.cyberwareBonuses(character),
      immunityBadges: (character) => this.immunityBadges(character),
      cyberwareFlagSources: (character, flag) => this.cyberwareFlagSources(character, flag),
      armorTotal: (character) => this.armorTotal(character),
      effectMap: (map) => this.effectMap(map),
      installPayload: (product) => this.installPayload(product),
      products: this.products,
      playerRoleTone: (role) => this.playerRoleTone(role),
      traumaPlanKey: (character) => this.traumaPlanKey(character),
      traumaPlanByKey: (key) => this.traumaPlanByKey(key),
      statusChargeKey: (status) => this.statusChargeKey(status),
      fmtShort: (n) => this.fmtShort(n),
      clampPct: (value) => this.clampPct(value),
      triggerFileInput: (id) => this.triggerFileInput(id),
      sheetDraftFrom: (character) => this.sheetHandlers().sheetDraftFrom(character),
      selectCharacter: (id) => this.sheetHandlers().selectCharacter(id),
      editSheet: () => this.sheetHandlers().editSheet(),
      createSheetCharacter: () => this.sheetHandlers().createSheetCharacter(),
      createPlayerCharacter: () => this.sheetHandlers().createPlayerCharacter(),
      cancelSheetEdit: () => this.sheetHandlers().cancelSheetEdit(),
      saveSheetDraft: () => this.sheetHandlers().saveSheetDraft(),
      updateNotesField: (key, value) => this.sheetHandlers().updateNotesField(key, value),
      onPlayerPortraitUpload: (e) => this.sheetHandlers().onPlayerPortraitUpload(e),
      removeTraumaPlan: () => this.sheetHandlers().removeTraumaPlan(),
      useExecutiveTraumaBackup: () => this.sheetHandlers().useExecutiveTraumaBackup(),
      toggleCyberwareEnhancement: (characterId, parentCode, enhancementCode) => this.sheetHandlers().toggleCyberwareEnhancement(characterId, parentCode, enhancementCode),
      uninstallCyberware: (code) => this.sheetHandlers().uninstallCyberware(code),
      buyIpIncrease: (kind, skillIndex) => this.sheetHandlers().buyIpIncrease(kind, skillIndex),
      addCriticalInjury: (location, injuryId) => this.addCriticalInjury(location, injuryId),
      addStatusEffect: (presetId) => this.addStatusEffect(presetId),
      toggleCriticalInjury: (instanceId) => this.sheetHandlers().toggleCriticalInjury(instanceId),
      removeCriticalInjury: (instanceId) => this.sheetHandlers().removeCriticalInjury(instanceId),
      useStatusCharge: (instanceId) => this.sheetHandlers().useStatusCharge(instanceId),
      removeStatusEffect: (instanceId) => this.sheetHandlers().removeStatusEffect(instanceId),
      advanceConditionTime: (unit) => this.sheetHandlers().advanceConditionTime(unit),
      applyNaturalHealingRest: (targetId) => this.sheetHandlers().applyNaturalHealingRest(targetId),
      applyHumanityTherapy: (amount) => this.sheetHandlers().applyHumanityTherapy(amount),
      rollMoraleBoost: (upgrade) => this.sheetHandlers().rollMoraleBoost(upgrade),
      rollNetrunningAbility: (ability) => this.sheetHandlers().rollNetrunningAbility(ability),
      installNetrunningProgram: (programId) => this.sheetHandlers().installNetrunningProgram(programId),
      removeNetrunningProgram: (programId) => this.sheetHandlers().removeNetrunningProgram(programId),
      damageNetrunningProgram: (programId, amount) => this.sheetHandlers().damageNetrunningProgram(programId, amount),
      repairNetrunningProgram: (programId, amount) => this.sheetHandlers().repairNetrunningProgram(programId, amount),
      equipShield: (itemId) => this.sheetHandlers().equipShield(itemId),
      removeShield: () => this.sheetHandlers().removeShield(),
      damageActiveShield: (amount) => this.sheetHandlers().damageActiveShield(amount),
      repairActiveShield: (amount) => this.sheetHandlers().repairActiveShield(amount),
    });
    const chat = chatRenderVals(S, {
      tx,
      activeCharacterName: activeCharacter.name,
      activeCharacterId: S.activeCharacterId,
      rollFromRequest: (opts) => this.rollFromRequest(opts),
      toggleComms: () => this.chatHandlers().toggleComms(),
      closeComms: () => this.chatHandlers().closeComms(),
      setCommsFilter: (key) => this.chatHandlers().setCommsFilter(key),
      setGmDraft: (value) => this.chatHandlers().setGmDraft(value),
      sendGm: () => this.chatHandlers().sendGm(),
      setReply: (value) => this.chatHandlers().setReply(value),
      sendReply: () => this.chatHandlers().sendReply(),
      setState: (fn) => this.setState(fn),
      requestRoll: () => this.chatHandlers().requestRoll(),
    });

    const combat = combatRenderVals(S, {
      tx,
      ...this.combatHandlers(),
      normalizeCharacter: (character) => this.normalizeCharacter(character),
      normalizeShield: (shield) => this.normalizeShield(shield),
      derivedStats: (base, character) => this.derivedStats(base, character),
      normalizeGearList: (gear) => this.normalizeGearList(gear),
      installedCyberweaponGear: (character) => this.installedCyberweaponGear(character),
      hasDamageProfile: (item) => this.hasDamageProfile(item),
      gearDamageText: (item) => this.gearDamageText(item),
      cyberSourceBreakdown: (sources) => this.cyberSourceBreakdown(sources),
      ignoresHalfSpBadge: (item) => this.ignoresHalfSpBadge(item),
      chipStyle: (a) => this.chipStyle(a),
      skillCanonicalName: (name) => this.skillCanonicalName(name),
      rollFromRequest: (opts) => this.rollFromRequest(opts),
      setState: (fn) => this.setState(fn),
    });

    const tarot = tarotRenderVals(S, {
      tx,
      tarotVictim: () => this.tarotHandlers().tarotVictim(),
      tarotAttacker: () => this.tarotHandlers().tarotAttacker(),
      tarotContextFor: (victim) => this.tarotHandlers().tarotContextFor(victim),
      setTarotTarget: (id) => this.tarotHandlers().setTarotTarget(id),
      setTarotAttacker: (id) => this.tarotHandlers().setTarotAttacker(id),
      setTarotContext: (patch) => this.tarotHandlers().setTarotContext(patch),
      updateTarotRow: (rowId, patch) => this.tarotHandlers().updateTarotRow(rowId, patch),
      rollTarotRow: (rowId) => this.tarotHandlers().rollTarotRow(rowId),
      applyTarotRow: (rowId) => this.tarotHandlers().applyTarotRow(rowId),
      resolveTarotPanel: () => this.tarotHandlers().resolveTarotPanel(),
      restoreTarotSnapshot: () => this.tarotHandlers().restoreTarotSnapshot(),
      closeTarotResolution: () => this.tarotHandlers().closeTarotResolution(),
      drawTarot: (force) => this.tarotHandlers().drawTarot(force),
      discardTarot: () => this.tarotHandlers().discardTarot(),
      startNewTarotSession: () => this.tarotHandlers().startNewTarotSession(),
      shuffleTarot: () => this.tarotHandlers().shuffleTarot(),
    });

    const map = mapRenderVals(S, this.mapHandlers());
    const nexus = nexusRenderVals(S, this.nexusHandlers());
    const hq = hqRenderVals(S, this.hqHandlers());

    const desktop = desktopRenderVals(S, {
      tx,
      activeCharacter,
      derived,
      eff,
      healthCur,
      healthMax,
      hum,
      ramMax,
      ramUsed,
      criticalInjuryRows: sheet.criticalInjuryRows,
      statusEffectRows: sheet.statusEffectRows,
      woundFlags: sheet.woundFlags,
      healingBreakdown: sheet.healingBreakdown,
      chromeCount: sheet.chromeCount,
      chromeEffectGroupsLength: sheet.chromeEffectGroups.length,
      canEditSheet: sheet.canEditSheet,
      products: this.products,
      gearList: this.gearList,
      clockText: (now) => this.clockText(now),
      scanlinesDefault: this.props.scanlines,
      auraDefault: this.props.aura,
      setState: (fn) => this.setState(fn),
      asNumber: (v, f, min, max) => this.asNumber(v, f, min, max),
      normalizeGearList: (gear) => this.normalizeGearList(gear),
      installedCyberware: (character) => this.installedCyberware(character),
      installedCyberweaponGear: (character) => this.installedCyberweaponGear(character),
      hasDamageProfile: (item) => this.hasDamageProfile(item),
      gearDamageText: (item) => this.gearDamageText(item),
      ignoresHalfSpBadge: (item) => this.ignoresHalfSpBadge(item),
      effectMap: (map) => this.effectMap(map),
      weaponProfile: (item) => this.weaponProfile(item),
      normalizeEquipped: (equipped) => this.normalizeEquipped(equipped),
      traumaPlanKey: (character) => this.traumaPlanKey(character),
      fmt: (n) => this.fmt(n),
      fmtShort: (n) => this.fmtShort(n),
      clampPct: (value) => this.clampPct(value),
      chipStyle: (a) => this.chipStyle(a),
      viewStyle: (a) => this.viewStyle(a),
      pageBtnStyle: (a, disabled) => this.pageBtnStyle(a, disabled),
      dieStyle: (a) => this.dieStyle(a),
      langBtnStyle: (active, hasLeftBorder) => this.langBtnStyle(active, hasLeftBorder),
      toggleRow: (on) => this.toggleRow(on),
      parseGearDamage: (text) => this.parseGearDamage(text),
      roll: (opts) => this.roll(opts),
      triggerFileInput: (id) => this.triggerFileInput(id),
      go: (v) => this.go(v),
      openCampaignMap: () => this.openCampaignMap(),
      toggleRole: (gm) => this.toggleRole(gm),
      logoutGm: () => this.logoutGm(),
      closeRoll: () => this.closeRoll(),
      rollAgain: () => this.rollAgain(),
      addInventoryGear: () => this.desktopHandlers().addInventoryGear(),
      toggleInventoryEquip: (id) => this.desktopHandlers().toggleInventoryEquip(id),
      deleteInventoryGear: (id) => this.desktopHandlers().deleteInventoryGear(id),
      useInventoryGear: (id) => this.desktopHandlers().useInventoryGear(id),
      buy: (p) => this.desktopHandlers().buy(p),
      createGmCharacter: () => this.desktopHandlers().createGmCharacter(),
      upsertGmItem: () => this.desktopHandlers().upsertGmItem(),
      deleteGmItem: () => this.desktopHandlers().deleteGmItem(),
      onGmCharacterImageUpload: (e) => this.desktopHandlers().onGmCharacterImageUpload(e),
      onGmItemImageUpload: (e) => this.desktopHandlers().onGmItemImageUpload(e),
      selectGameTab: (tab) => this.desktopHandlers().selectGameTab(tab),
    });

    return {
      tx,
      gm: S.gm, notGm: !S.gm,
      gmAuthenticated: S.gmAuthenticated,
      authAuthenticated: S.authAuthenticated,
      authUserLabel: S.authAuthenticated && S.authUser ? (String(S.authUser.username || '').toUpperCase() + ' // ' + String(S.authUser.role || '').toUpperCase()) : 'LOGIN NECESSARIO',
      ...hq,
      ...sheet,
      derived,
      rollDeathSave: () => derived.skipDeathSave ? this.flash('Death Save ignorado por condicao ativa') : this.roll({ label: 'DEATH SAVE', sides: 10, count: 1, mod: 0, deathSaveTarget: derived.deathSave }),
      ...chat,
      ...combat,
      ...nexus,
      ...tarot,
      ...map,
      ...desktop,
      gmStatus: S.gmStatus,
      toast: S.toast,
    };
  }
}

/**
 * Pure, side-effect-free tarot effect resolver. Flattens condition atoms
 * against combat context flags. Dice strings ('3d6') are left as-is.
 * special/deathSave atoms pass through resolved intact for later phases.
 *
 * @param {Object} card  entry from LIMIAR_TAROT_CARDS (must have .effects)
 * @param {Object} [context]
 * @param {boolean} [context.wasMelee]          default false
 * @param {boolean} [context.wasRanged]         default false
 * @param {boolean} [context.targetHasCyberware]  default false
 * @param {boolean} [context.targetHasExplosive]  default false
 * @returns {{ resolved: Atom[], unresolved: string[] }}
 */

export default Component;
