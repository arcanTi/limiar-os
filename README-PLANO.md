# README-PLANO.md — Plano unico do Limiar OS

Criado 2026-07-18. **Este documento substitui e unifica**:

| Doc antigo | O que era | Status |
| --- | --- | --- |
| `PLANO-PRODUTO.md` | visao de produto (eixos E1–E7) | absorvido aqui (secoes 1, 5, 8) |
| `PLANO-MAPA-FOUNDRY.md` | construcao do mapa (F1–F8) | ENCERRADO — tudo entregue; decisoes tecnicas herdadas na secao 4 |
| `PLANO-MAPA-2.md` | integracao mapa<->mesa (M1–M8) | absorvido no roadmap (secao 5) |
| `PLANO-COMBATE-MAPA.md` | mecanica CPR no mapa (G1–G12, CM0–CM5) | absorvido (secoes 5 e 6) |

`README-MAPA.md` continua vivo como **auditoria/evidencia** do motor do mapa
(bugs B1–B6, gaps A1–A10, Ondas 1–3 de qualidade) — as Ondas entram no roadmap
daqui, a evidencia fica la. Os quatro planos antigos ganham banner apontando
para este arquivo e nao recebem mais atualizacao.

Motivo da unificacao: os quatro planos descreviam o MESMO trabalho com nomes
diferentes (M2 do MAPA-2 = CM1 do COMBATE-MAPA; M4 = CM3; Onda 4 do
README-MAPA = M2/M3/M4...) e ja estavam divergindo — checkboxes atualizados
num doc e nao no outro, fases concluidas sob um nome e pendentes sob outro.
A tabela de equivalencia esta na secao 9.

---

## 1. North star e nao-objetivos

> A mesa roda a sessao inteira dentro do Limiar OS, sem abrir o Foundry.

Tudo neste plano se justifica por aproximar essa frase da realidade.

Nao-objetivos (decididos, nao esquecidos):

- Nao competir com Foundry em paridade generica (audio, video, hex grid,
  marketplace de modulos, animacoes).
- Nao virar SaaS/hosted por ora — local-first para a mesa do grupo.
- Nao adicionar dependencia externa nova (sem PixiJS, sem CDN).
- O canvas NUNCA e dono de regra de jogo — mapa coleta contexto fisico,
  adapter traduz, engine resolve, usuario confirma. Enforcement e sempre
  **advisory**: avisar, nunca bloquear.

## 2. Estado atual (inventario, verificado 2026-07-18)

Suites: **backend 63/63, frontend 578/578** (rodadas hoje, verdes).

| Modulo | Estado | Nota |
| --- | --- | --- |
| Fichas vivas, cyberware, tarot, campanhas | maduro | planos anteriores concluidos |
| Engine de combate CPR (dominio) | maduro | 16 modulos puros testados; **parte segue orfa da UI** (secao 6) |
| Cockpit de combate (UI) | maduro+ | CM0 (LUCK+municao) e CM2 (evasao-prompt, Death Save auto) entregues |
| Mapa tatico — dados/rotas/dominio | solido | F1–F8 + fixes Onda 0; nucleo acima da media (auditoria README-MAPA) |
| Mapa tatico — camada de experiencia | aquem | gaps A1–A10 do README-MAPA; Ondas 1–3 pendentes |
| Mapa <-> combate | nucleo pronto | F4 (regua->ataque), CM1 (turno, context menu, focus intent, LOS advisory) |
| Sync tempo real | **unificado** | M3 entregue: long-poll por campanha, 4 topicos; sobra so poll de seguranca 15s |
| Login/auth | rework em voo | Google Sign-In novo (`login.html`, `auth.py`) — **fora de qualquer plano ate hoje**, ver secao 7 |
| Nexus Breach | funcional | ilha — vinculo com economia e aposta da fase CONTEUDO |
| README.md do produto | **desatualizado** | ainda afirma que a entrada Mesa foi removida — corrigir na fase PROVA |

### Ja entregue (nao replanejam, so referencia)

- **F1–F8** (2026-07-09/10): pings, contrato de audiencia, badges CPR, fog
  individual, templates AoE, regua->ataque com DV, walls/portas/LoS,
  iluminacao, long-poll do mapa, QoL. Detalhe: `PLANO-MAPA-FOUNDRY.md`.
- **Onda 0** (2026-07-17): B1 fog offscreen e B5 GC de reveals corrigidos;
  B3/B4 eram falso-positivo; B2 guarda defensiva. Detalhe: `README-MAPA.md`.
- **CM0** (2026-07-17): LUCK (pool `luckCurrent`, stepper pre-rolagem, reset
  GM) + municao (`currentAmmo` por arma, gasto por modo, RECARREGAR),
  tudo advisory.
- **CM1** (2026-07-17): bloco `combat` no `map_state`, highlight de turno,
  HUD de round, context menu no token (5 acoes), `mapFocusIntent`, medir e
  usar no ataque via menu, LOS advisory; fix real: `upsert_token` nunca
  atualizava `character_id`.
- **M3** (2026-07-18): `backend/repositories/campaign_sync.py` — canal
  long-poll por campanha com topicos `map/chat/combat/roster`;
  `startCampaignSync` no `Component.js` substitui os `setInterval` de chat
  (3.5s) e roster (5s); poll de seguranca 15s; canal antigo do mapa delega
  pro mesmo modulo.
- **CM2** (2026-07-18): evasao como prompt no device do defensor
  (`kind:'request'` + M3, timeout 45s) e Death Save automatico ao virar o
  turno de Mortally Wounded.

## 3. O que NAO esta na branch (trabalho em voo, sem commit)

Branch `main` tem 3 commits; **50 arquivos em voo** (32 modificados + 18
novos) contendo TUDO desde `aee9c34`:

1. **Onda 0** — `campaign-map.js`, `repositories/campaign_maps.py` + testes.
2. **CM0 + CM1 + CM2** — `combat.js` (+262), `Component.js` (+208),
   `mapFocusIntent.ts` (novo), `campaign_maps.py`, testes (+258 no
   `combat.test.js`).
3. **M3** — `campaign_sync.py` (novo), rota em `campaigns.py`,
   `campaigns.ts`, `test_campaign_sync.py` (novo).
4. **Login Google** — `auth.py` (+132: verificacao de id_token via
   tokeninfo, `users.google_sub`, `GOOGLE_CLIENT_ID`), `login.html`,
   `login.css`, `pages/login.js`, `test_auth.py` (+175), `db.py`, `config.py`.
5. **Extracao de tema do mapa** — `styles/map/base.css` +
   `styles/map/themes/cyberpunk.css` (CSS saiu do `campaign-map.html`,
   `<link id="map-theme">`) — semente do multi-sistema/tema, feita sem
   constar em plano.
6. **dist/ rebuildado** — `limiar-app.js`, `campaign-map.js`, `index.js`,
   `index2.js` (chunk de auth compartilhado, novo), `login.js`.
7. Docs/tooling — planos, `README-MAPA.md`, `CLAUDE.md`, `graphify-out/`.

Avaliacao de suficiencia (codigo investigado, nao so docs):

- CM0/CM1/CM2/M3: **suficientes** — claims dos planos batem com o codigo
  (LUCK/ammo ligados no cockpit, sync sem `setInterval` de dados, so
  clock/heartbeat/turn-timer/anim de dado + poll de seguranca 15s), suites
  verdes, verificacao ao vivo documentada.
- M1 (prova de mesa): **NAO feito** — sem botao MESA por campanha em
  `campaigns.js`, sem empty state no mapa, sem link de retorno, README.md
  desatualizado, sessao real pendente. **Agente trabalhando nisso agora
  (2026-07-18).**
- Risco do lote: um unico bloco gigante sem commit mistura 5 entregas
  independentes. Prioridade de higiene: commitar por tema (ver secao 8).

## 4. Decisoes tecnicas transversais (imutaveis salvo decisao nova)

Herdadas de FOUNDRY/MAPA-2, continuam valendo para todo trabalho novo:

- Canvas 2D proprio; geometria pura em `frontend/src/domain/map/` com vitest;
  a page so desenha.
- Migracoes no padrao `backend/db.py` (`CREATE TABLE IF NOT EXISTS` +
  `PRAGMA table_info` -> `ALTER TABLE ADD COLUMN`).
- Documentos de cena com `id` estavel + `scene.revision`/`expectedRevision`;
  nada de last-write-wins em lista inteira (anti-exemplo: corrida do
  terrain-paint).
- `map_state()` e projecao server-side por audiencia; segredo de GM nunca
  chega ao payload do player.
- Sanitizacao de strings novas na storage boundary existente.
- Pointer Events para todo evento novo (base do touch).
- O mapa nunca importa `domain/combat` direto — tudo via `systemAdapter`.
- Sync: notificacao nunca transporta estado — invalida e refaz GET
  autorizado; backoff 1s; fallback poll.
- Rebuild disciplinado de `dist/` a cada entrega.

## 5. Roadmap unificado (ordem unica, sem nomes duplicados)

Uma sequencia. Cada fase referencia o detalhe no doc de origem quando existe.

### Fase PROVA — provar a mesa de verdade (= M1, EM ANDAMENTO 2026-07-18)

Pre-requisito de tudo. Detalhe: PLANO-MAPA-2 secao M1 + README-MAPA secao 4.

- [ ] Prova tecnica restante no browser: walls/portas, luzes, templates,
      terreno, player view (segunda conta!), F4 fim-a-fim, multi-aba.
- [ ] UX de entrada/retorno: botao MESA por campanha (`campaigns.js`), link
      de retorno no header do mapa, empty state (GM cria / player avisa).
- [ ] README.md atualizado (Mesa existe; mapa F1–F8; login Google).
- [ ] 1 sessao real com o mapa do inicio ao fim; friccao anotada na secao 10.

### Fase MOTOR — camada de experiencia do mapa (= Ondas 1–3 do README-MAPA)

Reconstruir a UX sobre o nucleo de dados correto. Detalhe: README-MAPA sec. 5.

- [ ] Onda 1 — direct manipulation: token HUD (HP inline, badges clicaveis),
      drag rico (ghost + custo ao vivo), toolbar com icones, grid adaptativo,
      zoom suave, nome auto-incrementado, dialogos proprios (fim do
      `prompt()`).
- [ ] Onda 2 — render em camadas com dirty-flags (p95 frame <16ms na cena de
      referencia: 30 tokens, 20 paredes, 10 luzes).
- [ ] Onda 3 — Pointer Events em TODA interacao + touch (pan, pinch,
      long-press = context menu).

A ordem PROVA -> MOTOR pode inverter itens pontuais se a sessao real (PROVA
passo 4) apontar friccao mais urgente — friccao real > roadmap teorico.

### Fase AREA — resolver area e ambiente (= M4 + CM3)

Detalhe: PLANO-MAPA-2 M4 + PLANO-COMBATE-MAPA CM3.

- [ ] Granada: template `untilResolved` -> RESOLVER lista tokens afetados ->
      `resolveAreaAttack` (engine orfao vira motor) -> aplicar no cockpit com
      2 confirmacoes -> template marcado resolvido.
- [ ] Supressao (G1): template 25m + WILL DV15 em lote + badge `suprimido`.
- [ ] Cobertura destrutivel (G2): documento de cena `prop` com HP; bloqueia
      LOS enquanto `hp>0`; escombro visual.
- [ ] Chips situacionais preenchidos pelo mapa (luz/LOS/cobertura) — fecha
      G8 de verdade (hoje so stepper MOD generico).

### Fase MUNICAO-NO-MAPA (= CM4, pequena)

- [ ] Contador municao/pente no token HUD (persistencia do CM0 ja existe),
      RECARREGAR no HUD, aviso `needs_reload` advisory.

### Fase MOBILE — companion do jogador (= M5 / E4)

- [ ] Passo 1 (barato): ficha e combate responsivos no app raiz — HP,
      rolagens, condicoes, fim de turno em 375px.
- [ ] Passo 2: mapa leitura — toolbar colapsavel, paineis drawer, pinch/pan.
- [ ] Passo 3: escrita minima de player — mover proprio token + ping.
      GM tools continuam desktop-first (corte deliberado).

### Fase RAW-FINAL (= CM5 + gaps restantes)

- [ ] Migrar ataque single-target do `roll()` manual para
      `resolveCombatAttack` (refactor separado, so com cockpit estavel —
      liga o ultimo engine orfao grande).
- [ ] Economia de turno (G6): Move + 1 Acao, budget MOVE no drag do proprio
      turno, trilha vermelha ao exceder, reset em `advanceCombatTurn`.
- [ ] Aneis de banda DV da arma no canvas (precisa "arma selecionada" no
      mapa).
- [ ] Banda de DV melee generica (G12) — fecha o timeout de evasao caindo
      em DV; decisao de conteudo.
- [ ] Agarrao/estrangular/escudo humano (G5): token anexado, check oposto.
- [ ] Malfunction poor d10=1 (G9); Facedown via context menu; marcadores de
      acao no HUD; adjacencia advisory p/ Estabilizar e melee reach;
      avaliacao de gate GM no botao de evasao.

### Fase MULTI — segundo sistema (= M6 / E5)

Bloqueada por pre-condicao de produto: segunda campanha REAL (pull, nao push).

- [ ] Migracao `campaigns.system` (default `'cpr'`, imutavel pos-criacao) +
      `campaigns.theme`.
- [ ] Registry de adapters no cliente; segundo adapter minimo (zombies).
- [ ] `unitsPerCell`/`unitLabel`/multiplicadores da config do sistema.
- [ ] Tema por campanha — a extracao `styles/map/themes/` ja em voo e o
      primeiro passo; formalizar preset por `theme`.

### Fase CONTEUDO — encantamento (= M7 / E6+E7, janelas curtas)

- [ ] Tarot no mapa: overlay da carta no trigger 3x6 (efemero via canal M3).
- [ ] Journal: tipar chat na origem (`roll/damage/system/chat`), filtro na
      UI, pins linkaveis ("ver no mapa").
- [ ] Nexus na mesa: pin `net` -> run do Nexus Breach -> recompensa credita
      economia existente.

### Fase ROBUSTEZ (= M8, por gatilho, nao por agenda)

- [ ] Compactacao de reveals (gatilho: payload >~200KB ou lag de fog).
- [x] Limite de conexoes long-poll por usuario/campanha + timeout — semaforo
      de 64 waiters em `campaign_sync.py` (2026-07-18, junto com fix de path
      traversal).
- [ ] Export/import de cena JSON (GM-only, validado no servidor).
- [ ] Auditoria de indices SQLite (`campaign_id, scene_id`).
- [ ] **Token de sessao para cookie httpOnly** (registrado 2026-07-18,
      auditoria de infra). Hoje o token fica em `localStorage`
      (`frontend/src/infrastructure/session.ts`), legivel por qualquer XSS
      futuro. Nao e urgente sozinho — os dois vetores concretos que o
      tornariam explorable (path traversal, SVG stored-XSS) ja foram
      fechados na mesma auditoria — mas e a defesa que falta se um XSS novo
      aparecer. Escopo real: emitir cookie `httpOnly; SameSite=Strict` no
      login (`backend/api/auth.py`), middleware CSRF pra toda rota
      mutante (cookie nao viaja em header `Authorization`, entao vira
      submissao automatica — precisa de token CSRF separado), e reescrever
      `frontend/src/infrastructure/api/http.ts` + `session.ts` pra parar de
      gerenciar o token manualmente. Maior que os outros itens desta fase;
      tratar como sub-tema proprio, nao como um checkbox de uma tarde.

## 6. Gaps de mecanica — status vivo (era G1–G12)

| Gap | Status 2026-07-18 | Fase que fecha |
| --- | --- | --- |
| G1 supressao | aberto | AREA |
| G2 cobertura destrutivel | aberto | AREA |
| G3 LUCK | **FECHADO** (CM0) | — |
| G4 municao | metade: ficha/cockpit ok; falta HUD no token | MUNICAO-NO-MAPA |
| G5 agarrao/escudo humano | aberto | RAW-FINAL |
| G6 economia de turno | aberto | RAW-FINAL |
| G7 evasao como fluxo | nucleo fechado (CM2); falta gate GM + timeout->DV | RAW-FINAL |
| G8 modificadores situacionais | parcial (stepper MOD); catalogo+auto-fill pendente | AREA |
| G9 malfunction | aberto | RAW-FINAL |
| G10 Death Save no turno | **FECHADO** (CM2) | — |
| G11 vinculo roster<->token | quase: fix `upsert_token` + menu; falta UX "vinculo forte" | PROVA/MOTOR |
| G12 DV melee generica | aberto (timeout de evasao expira sem DV) | RAW-FINAL |

## 7. Desalinhamentos encontrados (codigo + graphify, 2026-07-18)

Investigacao com grep + relatorio `graphify-out/GRAPH_REPORT.md` (grafo
construido de `aee9c34` + arvore atual; 2111 nos, 5705 arestas, zero ciclo
de import — arquitetura saudavel no macro).

1. **Engines orfaos confirmados**: `resolveCombatAttack` e
   `resolveAreaAttack` tem ZERO uso em `ui/`, `application/` e `pages/`
   (so testes). No grafo, a comunidade `combatAttackEngine.ts` (43) nao tem
   aresta de chamada vinda das comunidades de UI do combate — o pipeline
   testado nunca roda em producao. Fases AREA e RAW-FINAL existem em grande
   parte para LIGAR o que ja esta pronto.
2. **Login Google fora de plano**: maior mudanca de backend em voo (+132
   linhas em `auth.py`, migracao `google_sub`, pagina nova) sem constar em
   nenhum dos 4 planos — so uma mencao de passagem no PLANO-PRODUTO. Este
   doc o registra (secao 3); falta: documentar no README.md (fase PROVA) e
   commitar como tema proprio.
3. **`Component` e god node**: 166 arestas, betweenness 0.105 — maior hub do
   grafo, ponte entre api/views/domain. M3 ja tirou os polls; mas cada fase
   nova tende a adicionar metodos nele. Regra: logica nova nasce em
   view/handler/domain, `Component` so orquestra. (Sem refactor big-bang —
   so disciplina de crescimento.)
4. **Par `mapAttackIntent`/`mapFocusIntent`**: comunidades gemeas identicas
   (0.27 cada) — padrao duplicado deliberado. Aceitavel; se nascer um
   TERCEIRO intent (ex.: `mapAoeIntent` na fase AREA), unificar num envelope
   generico versionado em vez de triplicar.
5. **`validation.py` com coesao 0.05** — graphify sugere split; baixa
   prioridade, so quando tocar nela por outro motivo.
6. **Ruido conhecido do grafo**: arestas INFERRED para `three.min.js`/
   `cannon.min.js` (vendor minificado) sao falso-positivo de inferencia;
   ignorar.
7. **Docs eram a maior desconexao**: mesmo trabalho com dois nomes (M2=CM1,
   M4=CM3, Onda 4=M2-M4), checkbox marcado num doc e aberto no outro,
   README.md do produto contradizendo o codigo. Este arquivo e a correcao;
   manter UM doc de plano daqui em diante.

## 8. Higiene (fazer antes de abrir frente nova)

- [ ] **Commitar o trabalho em voo por tema** (5 commits sugeridos: onda-0,
      cm0+cm1+cm2+m3, login-google, tema-mapa, docs) — 50 arquivos num lote
      unico e risco real de perda/confusao.
- [ ] Atualizar README.md (Mesa existe; login Google; apontar pra este
      plano).
- [ ] `graphify update .` apos cada leva (manter o grafo fresco).
- [ ] Rebuild `dist/` disciplinado a cada entrega (`limiar-app.js`,
      `campaign-map.js`, `login.js`).

## 9. Tabela de equivalencia (para ler docs/commits antigos)

| Nome antigo | Onde vive agora |
| --- | --- |
| E1 (produto) / M1 (mapa-2) | Fase PROVA |
| E2 / M2 / CM1 | entregue (secao 2) |
| E3 / M3 / pre-req CM2 | entregue (secao 2) |
| M4 / CM3 / parte de E2 | Fase AREA |
| CM4 | Fase MUNICAO-NO-MAPA |
| M5 / E4 | Fase MOBILE |
| CM5 | Fase RAW-FINAL |
| M6 / E5 | Fase MULTI |
| M7 / E6 / E7 | Fase CONTEUDO |
| M8 | Fase ROBUSTEZ |
| Ondas 1–3 (README-MAPA) | Fase MOTOR |
| Onda 0 / CM0 / CM2 | entregues (secao 2) |

## 10. Backlog vivo de friccao (alimentado pela fase PROVA)

Anotar aqui, com data, cada friccao observada em sessao real. Esta lista
reordena as fases — friccao real > roadmap teorico.

- 2026-07-17: auditoria live achou B1–B6 + A1–A10 (ver README-MAPA.md);
  Onda 0 resolveu os bugs reais; A1–A10 viraram a fase MOTOR.
- (proximas entradas da sessao real aqui)
