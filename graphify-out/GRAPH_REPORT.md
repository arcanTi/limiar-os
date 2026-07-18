# Graph Report - .  (2026-07-18)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2111 nodes · 5705 edges · 79 communities (74 shown, 5 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 197 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `aee9c34e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- validation.py
- campaign_maps.py
- index.ts
- index.ts
- three.min.js
- nexus-breach.js
- index.ts
- status
- Component
- index.ts
- upsert_campaign
- bodyMapEngine.ts
- cyberwareInstallEngine.ts
- app.py
- Component.js
- campaign-map.js
- cpr-raw.rules.test.js
- records.py
- CampaignMapRoutes
- criticalInjuryEngine.ts
- ApplyCombatDamage.ts
- cyberwareTypes.ts
- InstallCyberware.ts
- index.ts
- combatDamageEngine.ts
- itemEffectEngine.ts
- createApplication.ts
- combatTypes.ts
- index.ts
- constants.js
- systemAdapter.ts
- scripts
- catalogAuditEngine.ts
- db.py
- itemNormalizers.ts
- visionEngine.ts
- dice.js
- ResolveTarotDraw.ts
- asNumber
- onDown
- combatAttackEngine.ts
- compilerOptions
- verify-homebrew-limiar-catalog.mjs
- index.ts
- constants.ts
- BuyIpIncrease.ts
- CanonicalRules
- BaseHandler
- cprCanonicalRules.ts
- tarot.js
- verify-core-weapon-catalog.mjs
- verify-redmas-catalog.mjs
- verify-cyberware-install-engine.mjs
- campaign_sync.py
- EndTurn.ts
- hq.js
- verify-combat-engine.mjs
- verify-critical-injury-engine.mjs
- combatSequence.integration.test.js
- mapFocusIntent.ts
- mapAttackIntent.ts
- catalog-audit.golden.test.js
- combat.test.js
- i18n.ts
- rollCombatAttack.test.js
- applyCombatDamage.test.js
- toggleCyberwareEnhancement.test.js
- pre-commit

## God Nodes (most connected - your core abstractions)
1. `Component` - 166 edges
2. `db()` - 73 edges
3. `status()` - 40 edges
4. `bind()` - 38 edges
5. `CampaignMapRoutes` - 34 edges
6. `ValidationError` - 34 edges
7. `map_state()` - 33 edges
8. `drawOnce()` - 33 edges
9. `asNumber()` - 31 edges
10. `ValidationIssue` - 30 edges

## Surprising Connections (you probably didn't know these)
- `newErrorIssues()` --indirect_call--> `i()`  [INFERRED]
  frontend/src/application/InstallCyberware.ts → vendor/sarah-dice/libs/cannon.min.js
- `sortCombatOrder()` --indirect_call--> `b()`  [INFERRED]
  frontend/src/domain/combat/index.ts → vendor/sarah-dice/libs/three.min.js
- `cyberwareStatMods()` --indirect_call--> `k()`  [INFERRED]
  frontend/src/domain/cyberware/index.ts → vendor/sarah-dice/libs/three.min.js
- `reportFor()` --calls--> `validateInstalledCyberwareSet()`  [EXTRACTED]
  scripts/verify-cyberware-install-engine.mjs → frontend/src/domain/items/cyberwareInstallEngine.ts
- `validateCyberwareRequirements()` --indirect_call--> `count()`  [INFERRED]
  frontend/src/domain/items/cyberwareRequirementEngine.ts → vendor/sarah-dice/libs/three.min.js

## Import Cycles
- None detected.

## Communities (79 total, 5 thin omitted)

### Community 0 - "validation.py"
Cohesion: 0.05
Nodes (61): AuthRoutes, Auth routes: login, logout, session introspection., Verify a Google Sign-In id_token via Google's tokeninfo endpoint.      Stdlib-on, Routes for login, logout, and session introspection., _verify_google_id_token(), CommsRoutes, Comms routes: the shared player/GM chat log., Routes for the shared player/GM chat log. (+53 more)

### Community 1 - "campaign_maps.py"
Cohesion: 0.12
Nodes (72): Any, db(), Strip control characters and hard-truncate a string., sanitize_text(), activate_scene(), active_scene(), add_fog(), add_personal_reveal() (+64 more)

### Community 2 - "index.ts"
Cohesion: 0.06
Nodes (67): Campaign, CampaignDraft, CampaignInvite, campaignInviteCount(), campaignInviteFor(), CampaignMember, campaignMembershipFor(), CampaignNotification (+59 more)

### Community 3 - "index.ts"
Cohesion: 0.07
Nodes (63): CPRED_STATUS_PRESETS, BLACK_ICE_BY_ID, BLACK_ICE_BY_TIER, BlackIceAttackResolution, blackIceById(), BlackIceClass, BlackIceDamageResolution, BlackIceId (+55 more)

### Community 4 - "three.min.js"
Cohesion: 0.07
Nodes (37): mapHandlers(), mapRenderVals(), a(), c(), d(), e(), h(), i() (+29 more)

### Community 5 - "nexus-breach.js"
Cohesion: 0.08
Nodes (65): activateObjective(), activateSecondaryObjective(), activeTokens(), addLog(), allObjectivesComplete(), applyConfigToForm(), bindControls(), buildObjectives() (+57 more)

### Community 6 - "index.ts"
Cohesion: 0.08
Nodes (38): createAuthApi(), createCampaignMapsApi(), mapPath(), payloadFromId(), campaignPath(), createCampaignsApi(), createCatalogApi(), createCharactersApi() (+30 more)

### Community 7 - "status"
Cohesion: 0.11
Nodes (52): activateScene(), bind(), clearReveals(), clearTerrain(), deleteDrawing(), deleteFog(), deleteLight(), deletePin() (+44 more)

### Community 9 - "index.ts"
Cohesion: 0.10
Nodes (40): skillCanonicalName(), rollD10(), DieResult, evaluateRollTriggers(), ROLL_TRIGGERS, RollTrigger, RollTriggerResult, advanceCombatTurn() (+32 more)

### Community 10 - "upsert_campaign"
Cohesion: 0.10
Nodes (38): CampaignRoutes, Campaign routes: creation, invitations, membership and notifications., Routes for campaign access control., add_reveal(), can_access_campaign(), save_scene(), upsert_token(), get_campaign() (+30 more)

### Community 11 - "bodyMapEngine.ts"
Cohesion: 0.09
Nodes (39): CPRED_STAT_ORDER, baseRegion(), BODY_REGION_IDS, BodyItemStatus, BodyMap, BodyMapItem, BodyRegion, BodyRegionId (+31 more)

### Community 12 - "cyberwareInstallEngine.ts"
Cohesion: 0.12
Nodes (42): characterInstallRows(), ResolvedInstalledCyberware, resolveInstalledCyberware(), splitIssues(), ValidatedInstalledCyberwareSet, validateInstalledCyberwareSet(), catalogCode(), collectVirtualIncludedOptions() (+34 more)

### Community 13 - "app.py"
Cohesion: 0.08
Nodes (25): CatalogRoutes, Catalog routes: shop items and map locations., Routes for shop items and map locations., CharacterRoutes, Character routes: list, fetch, GM upsert, and player self-creation., Routes for listing, fetching, and creating characters., MultipartPart, TypedDict (+17 more)

### Community 14 - "Component.js"
Cohesion: 0.09
Nodes (38): Stats, LIMIAR_TRAUMA_PLANS, setTraumaPlans(), TraumaPlan, traumaPlanByKey(), traumaPlanKey(), CYBER_BONUS_TYPES, CyberBonusCategory (+30 more)

### Community 15 - "campaign-map.js"
Cohesion: 0.07
Nodes (43): sessionUsername(), applyScene(), byId(), canMove(), canvas, centerToken(), ctx, draw() (+35 more)

### Community 16 - "cpr-raw.rules.test.js"
Cohesion: 0.10
Nodes (38): CharacterArmor, CPRED_ARMOR_PENALTY_STATS, CpredStat, DerivedStats, DerivedStatsCharacter, DerivedStatsInputStats, deriveEffectiveEmp(), deriveStats() (+30 more)

### Community 17 - "records.py"
Cohesion: 0.08
Nodes (19): MetaRoutes, Meta routes: health check, static reference data, and i18n bundles., Routes for health checks, reference data, and i18n bundles., Shared game-state routes backed by the settings store: Nexus challenge/result, H, Routes for shared game state: nexus, HQ, tarot, and combat., StateRoutes, get_reference(), get_setting() (+11 more)

### Community 18 - "CampaignMapRoutes"
Cohesion: 0.13
Nodes (7): CampaignMapRoutes, Routes for Roll20-style maps linked to campaigns., Exception, Raised when a request payload fails schema validation., ValidationError, can_edit_campaign_map(), wait_for_map_update()

### Community 19 - "criticalInjuryEngine.ts"
Cohesion: 0.14
Nodes (34): AttackCheckResult, countSixes(), CombatIssue, calculateBaseDeathSavePenalty(), CanonicalRulesLike, CriticalInjuryEffectsResult, injuryRows(), resolveCriticalInjuryEffects() (+26 more)

### Community 20 - "ApplyCombatDamage.ts"
Cohesion: 0.10
Nodes (30): ApplyCombatDamageApi, ApplyCombatDamageInput, ApplyCombatDamageResult, buildDice(), CharactersApi, CriticalInjuryOutcome, DamageTarget, DamageTargetHealth (+22 more)

### Community 21 - "cyberwareTypes.ts"
Cohesion: 0.09
Nodes (29): CountMode, CYBERWARE_TYPES, CyberwareDefinition, CyberwareType, InstallType, isCyberwareDefinition(), ItemEffectType, StackingRule (+21 more)

### Community 23 - "InstallCyberware.ts"
Cohesion: 0.09
Nodes (25): CharactersApi, InstallCyberwareApi, InstallCyberwareInput, InstallCyberwareResult, issueSignature(), newErrorIssues(), ProductLike, CanonicalCatalogEntry (+17 more)

### Community 24 - "index.ts"
Cohesion: 0.12
Nodes (27): rollCriticalInjuryFromTable(), CPRED_CRITICAL_INJURIES, ConditionDuration, StatusPreset, advanceConditionTime(), AggregateConditionsOptions, AggregatedConditions, conditionInstanceId() (+19 more)

### Community 25 - "combatDamageEngine.ts"
Cohesion: 0.14
Nodes (28): ablateArmor(), ArmorLocationRow, cyberArmorLayers(), locationArmor(), resolveArmorForLocation(), ResolvedArmor, providedDamageRoll(), resolveAutofireDamage() (+20 more)

### Community 26 - "itemEffectEngine.ts"
Cohesion: 0.09
Nodes (27): createEffectResolutionContext(), CyberweaponProfileResolution, effectCodeMatch(), EffectiveSkillBonus, EffectiveStat, effectValue(), getEffectiveStat(), mappedModes() (+19 more)

### Community 28 - "createApplication.ts"
Cohesion: 0.11
Nodes (20): ApplyCombatDamage, BuyIpIncrease, Application, ApplicationApi, EndTurnApi, InstallCyberware, ResolveTarotDrawApi, ActorLike (+12 more)

### Community 29 - "combatTypes.ts"
Cohesion: 0.12
Nodes (24): AmmoState, CanFireResult, canFireWeapon(), getRequiredAmmo(), isMeleeLike(), spendAmmo(), SpendAmmoResult, CombatAttackResult (+16 more)

### Community 30 - "index.ts"
Cohesion: 0.15
Nodes (24): angularDelta(), cellInShape(), normalizeAngleDeg(), templateCells(), TemplateGridConfig, TemplateKind, TemplateShape, unitsToPixels() (+16 more)

### Community 31 - "constants.js"
Cohesion: 0.17
Nodes (18): chatIsInbound(), chatRollTitle(), chatText(), DamageTone, parseDamageTrackingLine(), parseDamageTrackingMessage(), ParsedDamageTrackingLine, ParsedDamageTrackingMessage (+10 more)

### Community 32 - "systemAdapter.ts"
Cohesion: 0.10
Nodes (21): resolveStabilizationDV(), StabilizationResult, StabilizationVitals, WoundState, MapPoint, measureTokenDistance(), TokenDistance, cprOnMeasureBetweenTokens() (+13 more)

### Community 34 - "scripts"
Cohesion: 0.08
Nodes (23): devDependencies, typescript, vite, vitest, @vitest/coverage-v8, name, private, scripts (+15 more)

### Community 35 - "catalogAuditEngine.ts"
Cohesion: 0.14
Nodes (18): createCatalogAuditEngine(), runCatalogAudit(), RunCatalogAuditOptions, officialStats(), skillNames(), sourceTypes(), validateCyberwareDefinition(), validateItemAgainstCanonical() (+10 more)

### Community 36 - "db.py"
Cohesion: 0.14
Nodes (20): BaseHandler: static file serving, security headers, JSON I/O, and session/GM aut, Static configuration: paths, limits, rate windows, credentials, image types., _dict_to_insert_ignore(), _dict_to_upsert(), DomainConfig, init_db(), _insert_missing_seed_items(), load_seed_file() (+12 more)

### Community 37 - "itemNormalizers.ts"
Cohesion: 0.26
Nodes (21): addRequirementFromText(), asBooleanOrNull(), asNumberOrNull(), asText(), canonicalSeedCode(), correctionBySeedCode(), cyberwareTypeFromLegacy(), effectsFromCanonicalCorrection() (+13 more)

### Community 38 - "visionEngine.ts"
Cohesion: 0.15
Nodes (21): blocks(), Point, pointInPolygon(), rayHit(), visionContainsPoint(), visionPolygon(), Wall, clearVision() (+13 more)

### Community 39 - "dice.js"
Cohesion: 0.16
Nodes (18): chamfer_geom(), create_d10_geometry(), create_d12_geometry(), create_d20_geometry(), create_d4_geometry(), create_d4_materials(), create_d6_geometry(), create_d8_geometry() (+10 more)

### Community 40 - "ResolveTarotDraw.ts"
Cohesion: 0.16
Nodes (13): ResolveTarotDraw, ResolveTarotDrawInput, ResolveTarotDrawResult, TarotStateApi, LIMIAR_TAROT_CARDS, setTarotCards(), TarotAtomCondition, TarotCard (+5 more)

### Community 41 - "asNumber"
Cohesion: 0.19
Nodes (15): parseGearDamage(), CYBERWEAPON_PROFILE_OVERRIDES, CyberweaponProfileOverride, damageScaleProfile(), DamageScaleProfileResult, EffectiveBodyDeps, effectiveBodyForDamage(), GorillaTungstenProfile (+7 more)

### Community 42 - "onDown"
Cohesion: 0.15
Nodes (20): bgPlacement(), canEditTemplate(), closeTokenMenu(), onDown(), onHover(), onMove(), openTokenMenu(), renderTemplateList() (+12 more)

### Community 43 - "combatAttackEngine.ts"
Cohesion: 0.23
Nodes (17): dvFromWeaponRangeTable(), hasAimedShotModifier(), itemEffectSkillBonus(), ModifierRow, modifierRows(), modifierTotal(), numberOrNull(), resolveAttackCheck() (+9 more)

### Community 44 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, allowJs, checkJs, esModuleInterop, module, moduleResolution, noEmit (+10 more)

### Community 45 - "verify-homebrew-limiar-catalog.mjs"
Cohesion: 0.12
Nodes (13): actor(), canonicalRules, combat(), __dirname, failed, __filename, inst(), item() (+5 more)

### Community 46 - "index.ts"
Cohesion: 0.20
Nodes (16): TarotAtom, normalizeTarotDrawEntry(), normalizeTarotOrder(), normalizeTarotSeen(), normalizeTarotState(), shuffleTarotDeck(), tarotCardFromEntry(), tarotCardIndexFromEntry() (+8 more)

### Community 47 - "constants.ts"
Cohesion: 0.14
Nodes (14): ArmorSlot, buildDefaultSkills(), CPRED_CRITICAL_INJURY_TABLE, CPRED_DEFAULT_ARMOR, CPRED_DEFAULT_SKILL_NAMES, CPRED_DEFAULT_SKILLS, CPRED_ROLES, CPRED_SKILL_ALIASES (+6 more)

### Community 48 - "BuyIpIncrease.ts"
Cohesion: 0.21
Nodes (13): BuyIpIncreaseApi, BuyIpIncreaseInput, BuyIpIncreaseResult, CharacterLike, CharactersApi, PurchasableSkill, formatIpDate(), formatIpLogRows() (+5 more)

### Community 49 - "CanonicalRules"
Cohesion: 0.23
Nodes (15): CanonicalRules, ItemEffect, InstalledCyberwareInstance, EffectResolutionContext, EffectResolutionContextInput, numericSituation(), situationFlag(), ResolvedItemEffects (+7 more)

### Community 50 - "BaseHandler"
Cohesion: 0.22
Nodes (4): BaseHandler, Shared HTTP plumbing for all Limiar OS routes., HTTPStatus, SimpleHTTPRequestHandler

### Community 51 - "cprCanonicalRules.ts"
Cohesion: 0.12
Nodes (15): CPR_CANONICAL_RULES, CPR_COMBAT_RULES, CPR_CORE_MELEE_WEAPON_PROFILES, CPR_CORE_RANGED_WEAPON_PROFILES, CPR_CRITICAL_INJURY_RULES, CPR_HOMEBREW_LIMIAR_RESERVED_ITEMS, CPR_INVALID_SKILL_LIKE_FIELDS, CPR_OFFICIAL_STATS (+7 more)

### Community 52 - "tarot.js"
Cohesion: 0.21
Nodes (9): parseDiceText(), computeTarotDamage(), criticalOptionsFor(), describeTarotAtom(), makeTarotRow(), tarotHandlers(), tarotRenderVals(), tarotRowId() (+1 more)

### Community 53 - "verify-core-weapon-catalog.mjs"
Cohesion: 0.15
Nodes (13): assertFullProfile(), assertScenario(), byCode(), byName(), canonicalRules, catalog, __dirname, failed (+5 more)

### Community 54 - "verify-redmas-catalog.mjs"
Cohesion: 0.13
Nodes (9): canonicalRules, catalog, __dirname, failed, __filename, REDMAS_CODES, results, ROOT (+1 more)

### Community 56 - "verify-cyberware-install-engine.mjs"
Cohesion: 0.15
Nodes (10): canonicalRules, __dirname, failed, __filename, inst(), item(), reportFor(), results (+2 more)

### Community 57 - "campaign_sync.py"
Cohesion: 0.32
Nodes (11): bump_all(), bump_campaign(), _bump_locked(), current_version(), Unified per-campaign update channel: one long-poll version counter per campaign,, Bump a global-state topic (chat/combat) for every campaign a client     has alre, wait_for_campaign_update(), test_bump_all_touches_only_campaigns_already_being_watched() (+3 more)

### Community 58 - "EndTurn.ts"
Cohesion: 0.22
Nodes (8): CombatStateApi, EndTurn, EndTurnInput, EndTurnResult, SessionSnapshot, CombatState, gmSession, playerSession

### Community 59 - "hq.js"
Cohesion: 0.27
Nodes (7): canManageOwnSheet(), isAdmin(), isPlayerUser(), normalizeHqIp(), hqHandlers(), hqRenderVals(), IP_AWARD_KEYS

### Community 60 - "verify-combat-engine.mjs"
Cohesion: 0.17
Nodes (9): actor(), baseContext(), canonicalRules, __dirname, failed, __filename, results, ROOT (+1 more)

### Community 61 - "verify-critical-injury-engine.mjs"
Cohesion: 0.18
Nodes (10): actor(), baseContext(), canonicalRules, __dirname, failed, __filename, results, ROOT (+2 more)

### Community 62 - "combatSequence.integration.test.js"
Cohesion: 0.26
Nodes (11): createApplication(), actor, attackWeapon, clock(), combatState(), damageWeapon, fakeApi(), gmSession (+3 more)

### Community 63 - "mapFocusIntent.ts"
Cohesion: 0.27
Nodes (9): clearMapFocusIntent(), createMapFocusIntent(), loadMapFocusIntent(), MapFocusIntent, MapFocusIntentMode, parseMapFocusIntent(), saveMapFocusIntent(), openCharacterFocus() (+1 more)

### Community 64 - "mapAttackIntent.ts"
Cohesion: 0.27
Nodes (9): clearMapAttackIntent(), createMapAttackIntent(), loadMapAttackIntent(), MapAttackIntent, mapTokenVisibleNow(), parseMapAttackIntent(), saveMapAttackIntent(), useMapAttack() (+1 more)

### Community 66 - "catalog-audit.golden.test.js"
Cohesion: 0.20
Nodes (6): __dirname, __filename, GOLDEN_DIR, loadGolden(), readJson(), REPO_ROOT

### Community 67 - "combat.test.js"
Cohesion: 0.33
Nodes (5): baseCombatState(), fakeComponent(), mira, rook, tx

### Community 68 - "i18n.ts"
Cohesion: 0.47
Nodes (4): I18nTable, i18nTranslations(), LIMIAR_I18N, setI18n()

## Knowledge Gaps
- **325 isolated node(s):** `name`, `private`, `version`, `type`, `build` (+320 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Component` connect `Component` to `.api`, `index.ts`, `.installPayload`, `Component.js`, `.renderVals`, `.roll`, `.normalizeCharacter`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `on()` connect `nexus-breach.js` to `.renderVals`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `resize()` connect `status` to `nexus-breach.js`, `campaign-map.js`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `status()` (e.g. with `useStatusCharge()` and `.renderVals()`) actually correct?**
  _`status()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `bind()` (e.g. with `activateScene()` and `clearReveals()`) actually correct?**
  _`bind()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _325 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `validation.py` be split into smaller, more focused modules?**
  _Cohesion score 0.051590483827853514 - nodes in this community are weakly interconnected._