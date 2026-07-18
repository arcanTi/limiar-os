# PLANO-COMBATE-MAPA.md — Gaps de mecanica do COMBAT e integracao CPR no mapa

> **SUPERSEDED 2026-07-18**: plano unificado em `README-PLANO.md` (status vivo
> dos gaps G1–G12 na secao 6 de la). Este doc vira referencia de detalhe.

Criado 2026-07-17. Fonte: leitura completa de `frontend/src/domain/combat/*`
(16 modulos), `frontend/src/domain/rules/cprCanonicalRules.ts`,
`frontend/src/ui/views/combat.js` (cockpit) e `backend/api/state.py`.
Continua `PLANO-MAPA-2.md` (M2/M4) e `README-MAPA.md` (Ondas) — este documento
e o plano de MECANICA: o que o combate ja resolve, o que falta de CPR RAW, e
como cada regra passa a viver no mapa.

Decisoes de produto ja tomadas (2026-07-17):

1. **Enforcement: avisar, nunca bloquear.** O mapa mostra custo/alcance/
   turno/LOS e marca violacao em vermelho; GM e jogadores podem ignorar.
   Nenhuma mutacao e rejeitada por regra de jogo (permissao continua valendo).
2. **Supressao e cobertura destrutivel nascem JUNTO com o mapa** (template de
   area + objeto de cena com HP), nao antes nem depois.
3. **Municao ativa com HUD no token** — persistir pente por arma, gasto por
   modo de tiro, RECARREGAR como acao.
4. **LUCK primeiro; agarrao/escudo humano depois.**

---

## 1. Inventario — o que o modulo combat JA resolve

### 1a. Engines de dominio (puros, testados) — acima da media

| Engine | Cobertura RAW |
| --- | --- |
| `combatAttackEngine` | STAT+Skill+1d10+mods; aimed shot -8 automatico; oposto em melee (defenseRoll/evasionDV, defensor vence empate); DV por rangeTable custom da arma; issues estruturados |
| `combatDamageEngine` + `combatResolver` | SP por local, ablacao 1, melee/MA ignoram metade da SP (ceil), headshot x2 pos-SP, ordem Spot Weakness correta, dano nao-letal |
| `combatAutofireEngine` | 2d6 fixo x margem, cap por `weapon.autofire.multiplier` |
| `criticalInjury*` (4 modulos) | trigger 2+ seises, +5 bypass armadura, tabela head so em aimed head, reroll duplicata, imunidade por cyberware, area sempre body, crit POR ALVO em area |
| `resolveAreaAttack` | granada RAW completa (dano compartilhado opcional, crit separado por alvo) |
| `combatAmmoEngine` | custo por modo (single/autofire), canFire, spendAmmo, ataques restantes por ROF |
| `stabilizationEngine` | DV por vitals; First Aid/Paramedic; Mortally Wounded -> estabilizado |
| Death Save | d10 vs alvo com penalidade base acumulada por lesao; `skipDeathSave` por condicao |
| Facedown | COOL+REP oposto, contested numa acao, empate = nada (RAW), status `facedown_lost` manual |
| Iniciativa | d10+REF, tiebreak REF, acted/defeated, rounds, `advanceCombatTurn` |
| Escudos | HP proprio, soak, overflow para o alvo (divergencia High-Density aceita) |
| Cyberware em combate | bonus condicionais (cover/beyond51m/aimedShot), armas ciber, imunidades, Humanity |
| Brawling | dano por BODY (tabela RAW), cyberarm minimo 2d6 |

### 1b. Cockpit (UI) — o que esta LIGADO

Iniciativa com rail e dock de foco; seletor de alvo; toggles contextuais de
cyberware consumidos por rolagem; ataque com DV automatico quando ha
`mapAttackContext` (F4, com guardas de turno/alvo e consumo unico); dano com
auto-aplicacao SP->HP; fluxo de lesao critica com confirmacao do GM e 2d6
animado; tarot 3x6; Facedown contested; Estabilizar com picker; Death Save na
ficha; escudo; NPC rapido.

### 1c. Achado central — engines DESLIGADOS da UI

`grep` em `ui/` + `application/`: **zero usos** de `resolveCombatAttack`,
`resolveAreaAttack` e de TODO o `combatAmmoEngine`. O cockpit rola dados via
`component.roll()` manual + `autoApplyCombatDamage`; o pipeline completo que
ja passa nos testes nunca e chamado. O plano de integracao abaixo e, em boa
parte, LIGAR o que ja existe — nao escrever regra nova.

## 2. Gaps de mecanica (ordenados por impacto na mesa)

| # | Gap | Estado hoje | Evidencia |
| --- | --- | --- | --- |
| G1 | Fogo supressivo | so o enum `suppressiveFirePlaceholder` | `combatTypes.ts:80`; armas ja declaram `suppressiveFire` |
| G2 | Cobertura RAW | "cover" atual = toggle de bonus de DANO de cyberware; nao existe cobertura com HP, destruicao, nem "nao alveja o que nao ve" | `attackContextAvailable` em `combat.js:1367` |
| G3 | LUCK | stat existe na ficha; NENHUM gasto/pool/reset em rolagem | grep LUCK: so default de NPC |
| G4 | Municao | engine completo, desligado; sem persistencia de pente atual, sem UI, sem acao RECARREGAR | grep ammoState em ui/: vazio |
| G5 | Agarrao / estrangular / escudo humano / arremesso | ausentes por completo | — |
| G6 | Economia de turno | nada conta Move Action + 1 Acao; aim/reload nao existem como acao | — |
| G7 | Evasao como fluxo | engine aceita `evasionDV`/`defenseRoll`, RAW declarada antes do ataque; na UI e so um check avulso — oposto melee resolvido "no olho" pelo GM lendo o chat | `combat.js:118` |
| G8 | Modificadores situacionais | `modifiers` aceita lista arbitraria; nao ha catalogo (escuridao, alvo imovel, na cobertura, segunda arma...) — GM soma de cabeca | `combatTypes.ts:119` |
| G9 | Mau funcionamento (poor, d10=1) | placeholder informativo | `combatAttackEngine.ts:156` |
| G10 | Death Save no inicio do turno | botao manual na ficha; nada lembra/pede quando Mortally Wounded age | — |
| G11 | Vinculo roster<->token | combate e por `characterId`; tokens podem nascer sem vinculo (auditoria: `charId null`) — F4/M2 morrem sem isso | README-MAPA A7 |
| G12 | DV de alcance generico | rangeTable so em armas com tabela custom; sem tabela geral por classe de arma | `rangeDV.mode: explicitDVRequired` |

Nao-gaps (decisoes ja aceitas): High-Density Shield HP divergente (registrado),
Facedown sem automacao de status (gate deliberado do GM), crit com confirmacao
manual (gate deliberado).

## 3. Como cada regra CPR passa a viver no mapa

Principio (mantido do F4): **o canvas nunca e dono de regra**. O mapa COLETA
contexto fisico (distancia, LOS, luz, posicao, area) e ENTREGA ao adapter; o
cockpit/engine resolve; o usuario confirma. Tudo advisory (decisao 1).

| Mecanica | Hoje | No mapa (alvo) |
| --- | --- | --- |
| Range -> DV | regua manual F4 | selecionar alvo ja calcula distancia token-a-token e preenche DV; **aneis de banda DV** da arma selecionada desenhados no canvas (10/25/50m...) — diferencial que Foundry nao tem |
| Linha de visao | inexistente no combate | `visionEngine` raycast atacante->alvo; sem LOS = aviso vermelho "SEM LINHA DE VISAO" na rolagem (nao bloqueia); LOS parcial sugere cobertura |
| Cobertura destrutivel (G2) | — | novo documento de cena `prop` `{x,y,w,h,hp,material}` (padrao revision igual walls); prop bloqueia LOS enquanto `hp>0`; atacar prop usa dano normal (sem ablacao); hp 0 -> vira escombro visual e libera LOS |
| Supressao (G1) | placeholder | acao no cockpit para arma `suppressiveFire`: template de area no mapa (RAW 25m/yds), lista tokens na area, rola WILL DV15 em lote por alvo, aplica marcador `suprimido` (badge F2b); quem falha gasta o proximo turno buscando cobertura — advisory, GM aplica |
| Granada / area | `resolveAreaAttack` orfao | M4 do PLANO-MAPA-2: template -> alvos -> `resolveAreaAttack` (crit por alvo, body) -> aplicar com 2 confirmacoes |
| Movimento | so overlay MOVE | budget por turno: drag durante o proprio turno desconta celulas (terreno dificil ja custa 2:1); alem do budget = trilha vermelha + aviso; RUN marca a Acao como gasta; reset em `advanceCombatTurn` |
| Iniciativa / turno | rail no cockpit | highlight no token do turno + rail overlay compacto no topo do mapa; rolar iniciativa pelo context menu; `defeated` = marcador no token e pulo automatico (ja existe no engine) |
| Melee reach | `reachMeters` no perfil (2m default) | alvo alem do reach = aviso na acao melee; adjacencia desenhada ao selecionar arma melee |
| Evasao (G7) | check avulso | fluxo oposto: atacante declara -> defensor recebe prompt no proprio device (exige canal M3) -> resultado vira `evasionDV`/`defenseRoll` do engine; timeout = DV padrao da banda |
| Aimed shot | toggle no cockpit | atalho no context menu do alvo ("mirar na cabeca") liga o toggle existente; -8 ja e automatico no engine |
| Municao (G4) | engine orfao | contador `municao atual/pente` no token HUD (Onda 1); ataque gasta via `spendAmmo` (modo certo p/ autofire); acao RECARREGAR no HUD; persistencia: `currentAmmo` por instancia de arma na ficha (rotas de personagem existentes) |
| LUCK (G3) | nada | chip "GASTAR LUCK ±N" no dialogo de rolagem do cockpit (antes de rolar, RAW); pool `luckCurrent` na ficha, reset por sessao (botao GM); depois aparece no token HUD |
| Death Save (G10) | botao na ficha | ao virar o turno para combatente Mortally Wounded, prompt automatico de Death Save (advisory — da para dispensar); resultado posta no chat |
| Estabilizar | picker de alvo | validacao advisory de adjacencia (1 celula) usando posicao dos tokens |
| Condicoes | badges F2b (leitura) | aplicar/remover via context menu do token (M2) pelas rotas de ficha existentes |
| Modificadores situacionais (G8) | GM soma de cabeca | catalogo pequeno em `canonicalRules` + **o mapa preenche sozinho o que ele sabe**: escuridao/luz (F6), alvo fora de visao parcial, elevacao, na cobertura — chips pre-marcados que o jogador confirma. E o mapa virando "a tabela de modificadores que se preenche" |
| Facedown | cockpit | context menu (social) — baixa prioridade |
| Tarot 3x6 | cockpit | overlay da carta na cena (M7, ja planejado) |
| Escudo humano / agarrao (G5) | — | fase final: token "agarrado" anexado ao agarrador (move junto), quebrar = check oposto; escudo humano redireciona hits — depois de LUCK (decisao 4) |

## 4. Fases de execucao (CM = Combate+Mapa)

Pre-requisito duro: **Onda 0 do README-MAPA** (fog/fitView/painel/teclado) —
nao integrar combate em canvas quebrado. G11 (vinculo token<->ficha) e o
primeiro entregavel tecnico de qualquer CM.

### CM0 — Fundacoes sem mapa (pode andar em paralelo com Onda 0/1) ✓ CONCLUIDA 2026-07-17

- LUCK: `luckCurrent` na ficha (`normalizeCharacter`, default = LUCK stat),
  stepper LUCK/MOD por combatente no cockpit (`pendingRollMods`,
  `adjustLuckSpend`, `adjustAdHocMod`, `consumePendingRollMods`), consumido
  por ataque/dano/check (nao por facedown/iniciativa/estabilizar — escopo
  deliberado). Botao GM "RESET LUCK" (`resetLuckForSession`) restaura o pool
  de todo PC ao valor do atributo. Verificado ao vivo: pool 5→4 ao gastar 1,
  persistido no backend (`GET /api/characters`), reset devolve a 5.
- Municao: `currentAmmo` por instancia de arma na ficha (`normalizeGearItem`),
  ligado a `combatAmmoEngine` (`canFireWeapon`/`spendAmmo`) em
  `rollCombatAttack`; HUD no card (`w.ammoLabel`, botao RECARREGAR) para
  qualquer arma com `magazine` numerico — bows/melee sem pente ficam de fora
  por decisao explicita. Bug real achado e corrigido na verificacao ao vivo:
  `weaponProfile()` runtime expunha o campo como `mag`, nao `magazine`
  (`itemNormalizers.ts`, um normalizador nao relacionado, e que fez confundir
  o nome); corrigido com alias em `normalizeGearItem`. Verificado ao vivo:
  3/12 → 2/12 apos ATTACK, 12/12 apos RECARREGAR.
- Advisory: SEM MUNICAO nao bloqueia o ataque (so aviso no breakdown),
  conforme decisao 1.
- Catalogo de modificadores situacionais (adiado): a implementacao ficou
  reduzida ao stepper MOD generico (+/-8) em vez de um catalogo nomeado
  (escuridao, alvo imovel...) — suficiente para "GM nao soma de cabeca" sem
  inventar regras especificas ainda nao pedidas; catalogo nomeado fica para
  quando a mesa pedir.
- Testes: 46 testes em `frontend/test/unit/ui/combat.test.js` (7 novos: spend
  clamping, consumo, wiring em rollCombatAttack, reset de sessao, gasto/aviso
  de municao, arma sem pente, reload). Suite completa 565/565.

### CM1 — Combate visivel no mapa (= M2 do PLANO-MAPA-2, ampliado) ✓ NUCLEO CONCLUIDO 2026-07-17

Entregue e verificado ao vivo no browser (nao so vitest/pytest):

- **Bloco `combat` no `map_state`**: `{active, roundNumber, turnCharacterId}`
  computado de `combat-state` (setting global, nao por campanha — mesmo
  design do tracker existente). `turnCharacterId` ja era nao-secreto (a rota
  `_get_combat_state` nunca teve gate de staff), entao expor de novo aqui nao
  cria vazamento novo. 3 testes (`test_campaign_maps.py`).
- **Highlight de turno**: token com `characterId===turnCharacterId` ganha
  anel dourado com glow, distinto do anel teal de selecao. Verificado ao
  vivo — vinculei um token a "vesper" (turno ativo) e o anel apareceu.
- **HUD de round**: `COMBATE ROUND N` no HUD quando `combat.active`.
  Verificado ao vivo.
- **Context menu (right-click no token)**: popup posicionado com acoes
  dinamicas por token/estado — "Abrir ficha", "Abrir cockpit" (so dono/GM),
  "Medir e usar no ataque" (so se ha um atacante selecionado com
  `characterId`), "Rolar iniciativa" (GM, so se o personagem esta no combate
  sem iniciativa), "Marcar derrotado/Reativar" (GM, toggle). Todas as 5
  acoes testadas ao vivo com sucesso.
- **Abrir ficha / Abrir cockpit**: novo par `mapFocusIntent.ts` (espelha
  `mapAttackIntent.ts` — mesmo envelope versionado em sessionStorage, mesma
  janela de expiracao) + `Component.consumeMapFocusIntent()`. 5 testes
  vitest (`mapFocusIntent.test.js`). Verificado ao vivo: "abrir ficha" abriu
  a ficha da Vesper; "abrir cockpit" navegou pro combate com o card focado.
- **"Medir e usar no ataque" (selecao de alvo sem arrastar a regua)**:
  reaproveita 100% da logica do F4 — extraida em `buildAttackMeasure()`
  compartilhada entre o drag do R e o context menu novo. Verificado ao vivo
  fim-a-fim: menu -> regua aparece -> USAR NO ATAQUE -> cockpit com alvo
  pre-selecionado.
- **LOS advisory**: `measureLosWarning()` acrescenta "SEM LINHA DE VISAO" ao
  texto da regua quando o atacante nao enxerga o alvo (raycast de
  `visionEngine`), sem bloquear nada (advisory puro). Verificado ao vivo —
  reportou corretamente um alvo fora do raio de visao.
- **Bug real achado e corrigido durante a verificacao**: `upsert_token`
  (backend) nunca incluia `character_id` no `ON CONFLICT DO UPDATE SET` —
  vincular um token JA EXISTENTE a uma ficha (exatamente o "vinculo forte"
  deste bullet) sempre falhava silenciosamente. Corrigido + teste de
  regressao.
- Testes: +3 backend (combat block) +1 backend (fix do character_id) +5
  frontend (mapFocusIntent) = backend 59/59, frontend 570/570.

**Deferido para uma proxima leva** (nao tentado nesta sessao, para nao
apressar qualidade):

- Aneis de banda DV da arma ao redor do atacante — precisa de um conceito de
  "arma selecionada" no mapa que ainda nao existe; a DV em si ja aparece no
  cockpit via F4, so falta o anel visual no canvas.
- Advisory de movimento (budget MOVE por turno no drag, trilha vermelha ao
  exceder, reset por `advanceCombatTurn`) — precisa rastrear celulas
  movidas por token por round; escopo proprio, nao encaixado aqui pra nao
  arriscar qualidade.
- "Vinculo forte" como fluxo completo (promover "tokens das fichas" a
  caminho padrao com aviso para token de combate sem `characterId`) — o
  botao ja existe (F2b); o gap restante e so UX/aviso, baixo risco, adiado.
- Condicoes via context menu (aplicar/remover direto do token) — cortado do
  escopo original do CM1 a favor de "abrir ficha" (sheet.js ja tem aba de
  condicoes); evita duplicar uma UI de condicoes dentro do canvas.

### CM2 — Fluxos opostos e turno vivo (exige canal M3) ✓ NUCLEO CONCLUIDO 2026-07-18

**M3 (pre-requisito) entregue primeiro nesta sessao**: novo modulo
`backend/repositories/campaign_sync.py` generaliza o long-poll do F7 (que era
so-mapa) para um canal por campanha com 4 topicos (`map`/`chat`/`combat`/
`roster`) — `bump_campaign(id, topic)` bump campaign-scoped, `bump_all(topic)`
bump todas as campanhas atualmente observadas (usado por chat/combat-state/
characters, que sao GLOBAIS nesta app — nao por campanha, achado real ao
investigar: so o mapa e campaign-scoped hoje). Nova rota
`GET /api/campaigns/:id/updates?since=N` (`campaigns.py`), gated por
`is_campaign_member`. O canal antigo do mapa (`touch_map_update`/
`wait_for_map_update`) agora delega para o mesmo modulo (compat, mesma
versao). Frontend: `campaigns.ts` ganha `waitForUpdate`; `Component.js`
substitui os `setInterval` fixos de chat (3.5s) e roster (5s) por UM loop de
long-poll (`startCampaignSync`, backoff 1s no erro, igual ao F7) mais um poll
de seguranca de 15s. Verificado ao vivo: post de chat numa aba acordou o
long-poll de outra aba em ~2s (nao os 3.5s do poll antigo); `curl --max-time 8`
confirmou bloqueio real quando nada muda. Testes: 4 novos
(`backend/tests/test_campaign_sync.py`) + 63/63 backend, 578/578 frontend.

**CM2 em si** (`frontend/src/ui/views/combat.js`):

- Evasao como prompt: botao "PEDIR EVASAO" em armas melee (`weapon.melee`,
  do weaponProfile normalizado) posta um `kind:'request'` no chat visado ao
  `combatantId` do alvo, com o MOD de Evasion do PROPRIO alvo (nao 0 fixo
  como o `requestRoll` generico). Resposta do defensor volta taggeada
  (`evasionFor`/`evasionRequestId`, mesmo padrao do `initiativeFor`
  existente) e e capturada por `applyEvasionRolls` (novo listener em
  `refreshChat`, espelha `applyInitiativeRolls`). `rollCombatAttack` consome
  o resultado one-shot como `dv` do ataque melee (so quando ainda e para o
  alvo selecionado) e mostra `EVASAO DO ALVO: N` no breakdown. Timeout
  simplificado (45s): sem banda de DV para melee no motor hoje (gap G12,
  ainda nao resolvido/adiado pro CM5), entao expira mostrando
  "EVASAO EXPIROU" em vez de cair numa DV — decisao pragmatica, documentada
  aqui em vez de inventar uma tabela nao pedida.
- Death Save automatico: `advanceTurn` checa o novo combatente via
  `combatStabilizationInfo` (reaproveitado, ja existia p/ Estabilizar); se
  `mortallyWounded` e `!derived.skipDeathSave`, posta um `kind:'request'`
  com `deathSaveTarget` pre-calculado — mesmo mecanismo de prompt da evasao.
  Dedup por `characterId:round` (Set em memoria, mesmo padrao de
  `_initApplied`/`_endTurnApplied`).
- Verificado ao vivo (nao so vitest): PEDIR EVASAO -> chat mostra pedido com
  mod correto -> resposta simulada via POST direto -> status do card mudou
  de "AGUARDANDO EVASAO DO ALVO..." para "EVASAO DO ALVO: 14" em ~2s (M3) ->
  ATTACK confirmado enfileirando `dv:14` (breakdown "EVASAO DO ALVO: 14" no
  feed de dados 3D, rolagem final nao observada — dice físico 3D trava nesta
  sandbox de automacao, sem relacao com a mudanca: mesma lib usada por TODO
  ataque, nao so evasao). Death Save: HP do Rook zerado via API -> NEXT ->
  chat recebeu "DEATH SAVE AUTOMATICO :: ROOK esta MORTALLY WOUNDED (DV 5)"
  automaticamente, sem clique manual. Achado incidental: `Mono-Katana` (item
  custom sem entrada no catalogo `data/seed/`) nao tem `weapon.melee`, entao
  nao ganhou o botao — Gorilla Arms (cyberweapon catalogada) ganhou
  corretamente; gap de classificacao de dados pre-existente, nao
  introduzido por este trabalho, fora de escopo aqui.
- Testes: +9 em `combat.test.js` (requestEvasion, applyEvasionRolls x2,
  consumo one-shot em rollCombatAttack, advanceTurn Death Save x4).

**Deferido para proxima leva** (nao tentado, mesmo espirito do CM1): botao
GM-gated de evasao (hoje qualquer combatente que possa rolar pode pedir —
avaliar se precisa restringir), banda de DV melee generica (G12, fecha
"timeout cai na banda" de verdade), marcadores de acao (Move/Acao gasta) no
HUD do token, adjacencia advisory para Estabilizar/melee reach.

### CM3 — Area de verdade (= M4 + decisoes 2)

- Granada: template -> `resolveAreaAttack` (engine orfao vira o motor do M4).
- Supressao: template 25m + WILL DV15 em lote + badge `suprimido`.
- Cobertura destrutivel: documento `prop` com HP, LOS dinamica, escombros.
- Chips situacionais preenchidos pelo mapa (luz/LOS/cobertura) — fecha G8.

### CM4 — Municao no mapa

- Contador no token HUD (usa persistencia do CM0), RECARREGAR no HUD,
  aviso `needs_reload` na tentativa de ataque (advisory).

### CM5 — Leva RAW final

- Agarrao/estrangular/escudo humano (token anexado, check oposto).
- Malfunction de arma poor (d10=1 -> arma travada ate acao de destravar).
- Facedown via context menu.
- Avaliar rangeTable generica por classe de arma (fecha G12) — hoje so armas
  com tabela custom ganham DV automatico; decisao de conteudo, nao de codigo.

## 5. Riscos e amarras

- **Nada de regra no canvas**: supressao/cobertura/evasao entram via
  `systemAdapter` (novos hooks `onSuppressiveTemplate`, `onTargetSelected`,
  `propDamage`) — mapa generico continua generico (requisito multi-sistema).
- **Advisory e serio**: aviso ignorado NUNCA trava fluxo nem corrompe estado;
  o engine so recebe o que o usuario confirmou (mesmo padrao do F4).
- **Ligar resolvers orfaos aos poucos**: `resolveAreaAttack` entra no CM3;
  migrar o ataque single-target do `roll()` manual para `resolveCombatAttack`
  e refactor separado, so depois de CM1 estabilizar (evitar big-bang).
- **Municao é homebrew-sensivel**: modos custom de armas ciber ja declaram
  `ammoCost`; validar contra o catalogo antes de ativar gasto automatico.
- **Prompt de evasao depende de M3**: sem canal por campanha, o defensor nao
  fica sabendo em tempo util. Ordem CM2 > M3 e obrigatoria.
