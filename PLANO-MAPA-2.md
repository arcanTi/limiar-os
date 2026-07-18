# PLANO-MAPA-2.md — Mesa viva: consolidar, integrar e sincronizar o mapa

> **SUPERSEDED 2026-07-18**: plano unificado em `README-PLANO.md`. Este doc
> vira referencia de detalhe (M1/M4–M8); nao atualizar checkboxes aqui.

Criado 2026-07-17. Sequencia de `PLANO-MAPA-FOUNDRY.md` (F1–F8 concluidas em
2026-07-09/10). Aquele plano construiu o "Foundry-lite" com diferencial (regua
-> ataque). Este plano transforma o mapa de feature completa em **centro da
mesa**: provado em sessao real, integrado ao combate nos dois sentidos e
sincronizado em tempo real com o resto do app, conforme os eixos E1–E3 do
`PLANO-PRODUTO.md`.

## 0. Checklist de fases

- [x] M1 — Consolidacao e prova de mesa (ship de verdade) — passos 1-3 concluidos e verificados ao vivo 2026-07-18; passo 4 (sessao real) fica como pendencia do usuario, ver secao 5
- [x] M2 — Combate vivo no mapa (turno, condicoes, cockpit pelo token) — nucleo via CM1, ver PLANO-COMBATE-MAPA.md
- [x] M3 — Sync unificado por campanha (long-poll generalizado) — 2026-07-17/18, ver PLANO-COMBATE-MAPA.md CM2
- [ ] M4 — AoE resolve (template -> dano em area)
- [ ] M5 — Touch e companion mobile
- [ ] M6 — Multi-sistema ativado (segunda campanha)
- [ ] M7 — Mesa com conteudo (tarot no mapa, journal, Nexus)
- [ ] M8 — Robustez e performance

Ordem recomendada: **M1 -> M2 -> M3 -> M4** (nucleo). M5–M8 por demanda da
mesa, apos friccao real observada em M1.

---

## 1. Estado herdado (fatos, nao planos)

Arquivos centrais hoje:

| Camada | Arquivo | Papel |
| --- | --- | --- |
| Page | `campaign-map.html` + `frontend/src/pages/campaign-map.js` | canvas 2D, toolbar, paineis, long-poll cliente |
| Dominio mapa | `frontend/src/domain/map/` | `measurementEngine`, `visionEngine`, `templateEngine`, `systemAdapter`, `mapAttackIntent` (todos puros) |
| Dominio movimento | `frontend/src/domain/movement/index.ts` | celulas, custo, alcance |
| API client | `frontend/src/infrastructure/api/campaignMaps.ts` | rotas + `waitForUpdate` |
| Backend rotas | `backend/api/campaign_maps.py` | permissao + dispatch + long-poll |
| Backend repo | `backend/repositories/campaign_maps.py` | SQLite, normalizacao, revisions |
| App raiz | `frontend/src/ui/Component.js` | `openCampaignMap()`, `consumeMapAttackIntent()`, polls fixos |
| Entrada | `frontend/src/ui/views/desktop.js` nav `map` | icone MAP abre a mesa |

Capacidades entregues: cenas, tokens (badges CPR, wound ring, recurso com
visibilidade), fog compartilhado + individual, terreno dificil, pings,
templates AoE, regua -> ataque com DV (F4), paredes/portas/LoS, iluminacao,
long-poll `/campaign-maps/:id/updates` com fallback polling 4s, QoL F8
(teclado, rotacao, elevacao, desenhos, pins, multi-select).

Dividas conhecidas (herdadas do plano 1):

- F3 marcada "sem verificacao no browser"; F5–F8 entregues em sequencia rapida
  — prova de browser incompleta.
- Reveals crescem sem limite por cena (risco anotado, mitigacao adiada).
- README.md do produto afirma que a entrada Mesa foi removida — desatualizado.
- Handoff mapa->cockpit e one-way: mapa abre combate, mas o combate nao
  devolve nada para a cena (turno, resultado, condicao).

## 2. Decisoes tecnicas transversais (continuam valendo)

Herdadas do plano 1, sem excecao nova:

- Canvas 2D proprio, zero dependencia externa nova.
- Geometria pura em `frontend/src/domain/map/` com vitest; a page so desenha.
- Migracoes no padrao `backend/db.py` (`CREATE TABLE IF NOT EXISTS` +
  `PRAGMA table_info` -> `ALTER TABLE ADD COLUMN`).
- Documentos de cena com `id` estavel + `scene.revision`/`expectedRevision`;
  nada de last-write-wins em lista inteira.
- `map_state()` continua projecao server-side por audiencia; segredo de GM
  nunca chega ao payload do player.
- Escrita concorrente por celula segue o padrao fila do cliente
  (`terrainQueue`) — o bug de corrida do terrain-paint e o anti-exemplo.
- Sanitizacao de strings novas na storage boundary existente.
- Pointer Events para todo evento novo (base para M5).
- O mapa nunca importa `domain/combat` direto — tudo via `systemAdapter`.

---

## 3. Fases

### M1 — Consolidacao e prova de mesa (ship de verdade)

Objetivo: tirar o "completo, pouco provado" do inventario. Nenhuma feature
nova de canvas; so prova, correcao e UX de entrada/retorno.

Passo 1 — prova tecnica no browser (checklist unica, uma sessao de teste):

- [ ] F3: colocar/rotacionar/ocultar cada kind de template; celulas destacadas
      batem com `templateEngine` (conferir granada RAW: raio 10m = 5 celulas).
- [ ] F5: parede bloqueia visao; porta abre/fecha por clique; `visibleNow`
      poligonal; reveals antigos seguem funcionando.
- [ ] F6: cena escura + luz ambiente + luz de token; raios em unidades.
- [ ] F7: duas abas logadas — mutacao numa aba aparece na outra em <2s;
      derrubar o servidor e subir de novo nao trava o cliente (fallback 4s).
- [ ] F8: atalhos, rotacao, elevacao, desenhos, pins, multi-select.
- [ ] F4 fim-a-fim: medir entre tokens vinculados em combate ativo, USAR NO
      ATAQUE, rolagem com `RANGE Nm // banda // DV`.
- [ ] Rebuild disciplinado antes da prova: `dist/limiar-app.js` e
      `dist/campaign-map.js`.

Bugs achados aqui entram como sub-itens de M1 e fecham antes de M2.

Passo 2 — UX de entrada e retorno:

- Botao "MESA" por campanha na view de campanhas (`campaigns.js`), alem do
  icone MAP do desktop: abrir `campaign-map.html?campaign=<id>` da campanha
  clicada, nao da "primeira campanha achada" (`openCampaignMap()` hoje cai
  nesse fallback quando nao ha `activeCampaignId`).
- Link de retorno no header do mapa -> app raiz (`/`), preservando login.
- Empty state: campanha sem cena mostra chamada de criacao (GM) ou aviso
  "GM ainda nao preparou a mesa" (player), no lugar de canvas vazio mudo.

Passo 3 — verdade documental:

- Atualizar README.md: Mesa existe e como abrir; mapa F1–F8; login novo.
- Marcar PLANO-MAPA-FOUNDRY.md como encerrado apontando para este plano.

Passo 4 — sessao real:

- Rodar 1 sessao da campanha com o mapa aberto do inicio ao fim.
- Anotar friccao em `PLANO-MAPA-2.md` (secao 5, backlog vivo) — essa lista
  reordena M2/M4/M5.

Criterios de aceite: checklist tecnica 100%; mesa aberta por campanha
especifica; sessao real realizada com lista de friccao escrita.

### M2 — Combate vivo no mapa (mao dupla mapa <-> combate)

Objetivo: o F4 abriu o caminho mapa -> cockpit. M2 fecha o ciclo: o estado de
combate volta para a cena e o GM opera condicoes sem sair do mapa. E o coracao
do moat (E2).

Backend:

- `map_state()` passa a incluir, para membros, um bloco `combat` minimo da
  campanha ativa: `{active, roundNumber, turnCharacterId}` — derivado do
  estado de combate existente, projetado por audiencia (player ve quem tem o
  turno; detalhes de NPC continuam GM-only conforme F2a/F2b).
- Rota de condicao por token (GM): aplicar/remover status na ficha vinculada
  (`characterId`) reutilizando as rotas de personagem existentes — nenhuma
  regra nova no backend de mapa; o mapa so descobre o vinculo e chama a rota
  de ficha. Mutacao de ficha vinculada a token da cena incrementa a versao do
  mapa (invalidacao via long-poll ja existente).

Frontend (page + adapter, zero regra na page):

- Highlight de turno: token cujo `characterId` == `turnCharacterId` ganha
  anel/pulso distinto; badge de round no HUD. Fonte: bloco `combat` do
  `map_state` — nada de fetch paralelo.
- Context menu no token (botao direito / long-press futuro):
  - GM: aplicar/remover condicao (lista vinda de `domain/conditions` via
    adapter `tokenConditionActions()` novo no `systemAdapter`), abrir ficha,
    abrir cockpit focado no personagem.
  - Player (token proprio): abrir minha ficha, abrir cockpit no meu card.
- "Abrir cockpit pelo token" reusa o mecanismo do F4 (`mapAttackIntent`) com
  um envelope mais simples `limiar.mapFocusIntent.v1` `{campaignId,
  characterId, createdAt}` — mesmas guardas de hidratacao e expiracao.
- Badges de condicao ja existem (F2b); M2 nao redesenha, so torna acionavel.

Testes:

- Vitest do adapter novo (`tokenConditionActions`): GM vs player vs token sem
  `characterId` (menu reduzido, nunca vazio de forma silenciosa).
- Teste de projecao: player nao recebe `turnCharacterId` de combate que nao
  participa; NPC secreto continua fora do payload.
- Prova manual: aplicar Stun pelo token -> badge aparece na outra aba em <2s
  (com M3) ou <4s (polling); fim de turno no cockpit -> highlight troca.

Criterios: GM roda um round inteiro (turno, condicao, ataque medido) sem sair
do mapa, exceto para a rolagem no cockpit, que abre ja focada.

### M3 — Sync unificado por campanha (generalizar o F7)

Objetivo: um canal de atualizacao por campanha para TODO o app — mapa, chat,
combate, roster — aposentando os `setInterval` fixos do `Component.js`
(chat 3.5s, roster 5s, poll de GM). E o eixo E3 inteiro.

Design (evolucao direta do F7, mesma filosofia):

- Backend: `GET /campaigns/:id/updates?since=N` — long-poll autenticado
  Bearer, reautoriza membership antes de aguardar (identico ao contrato F7).
  Resposta: `{version, changed, topics:["map","chat","combat","roster"]}`.
  - Versao unica por campanha em memoria + set de topicos sujos desde `since`.
    Reinicio do servidor = um evento perdido, coberto pelo fallback.
  - Toda mutacao relevante (chat novo, estado de combate, ficha de membro,
    roster, mapa) chama `bump_campaign(campaign_id, topic)`. O bump do mapa
    existente passa a delegar para este (compat: rota antiga do F7 continua
    respondendo durante a transicao, lendo a mesma versao).
  - Chat global (sem campanha) mantem poll proprio por ora — decisao
    consciente: chat e da mesa/campanha ativa na pratica; se a mesa migrar o
    chat para escopo de campanha um dia, entra no canal.
- Frontend: `infrastructure/api/comms.ts` (ou modulo novo `updates.ts`) ganha
  `waitForCampaignUpdate(campaignId, since, signal)`. `Component.js` roda UM
  loop de long-poll quando ha campanha ativa; ao acordar, refaz apenas os GETs
  dos topicos sujos (`refreshChat()`, roster, combate). Fallback: os
  `setInterval` atuais viram um unico poll de seguranca de 15s, mantido
  para servidor antigo/erro repetido.
  - `AbortController` no unload e na troca de campanha (padrao F7).
  - A notificacao nunca transporta estado — invalida e refaz GET autorizado
    (mesma regra de seguranca do F7).
- `campaign-map.js` migra para o canal novo mantendo `waitForUpdate` antigo
  como fallback ate a limpeza final.

Testes:

- Backend: teste de bump/topicos (mutacao de chat acorda waiter com topic
  certo; membership revalidada; `since` adiantado nao trava).
- Frontend: loop com API falsa — topico `chat` refaz so chat; erro repetido
  degrada para poll de 15s sem loop quente (backoff 1s como no F7).
- Prova manual: duas abas, GM e player — mensagem de chat, troca de turno e
  movimento de token aparecem <2s; matar servidor nao trava nenhuma aba.

Criterios: zero `setInterval` de dados frequente no `Component.js` (sobram
clock/heartbeat/turn-timer local); latencia percebida da mesa <2s; mapa e app
usam o mesmo canal.

### M4 — AoE resolve (template -> dano em area)

Objetivo: fechar o ciclo de vida `untilResolved` deixado deliberadamente fora
de F3/F4. Granada/cone deixa de ser so desenho: vira fluxo de resolucao com
os tokens afetados, mantendo o principio do F4 — o usuario confirma, o canvas
nunca vira dono de regra.

Backend:

- `campaign_map_templates.lifecycle` ja existe; habilitar `untilResolved` +
  campo `resolved_at`. Template resolvido some do payload de nao-GM e aparece
  esmaecido para GM por 1 round (feedback visual), depois limpeza lazy.
- Nenhuma rota de dano nova: dano continua pelas rotas de personagem/combate
  existentes. A "resolucao" do template e so estado do documento.

Frontend:

- HUD do template (dono/GM) ganha "RESOLVER": lista tokens cuja celula esta
  em `templateCells()` E na audiencia visivel do usuario (regra F3 mantida —
  sem auto-target de token invisivel).
- Adapter novo `onResolveTemplate(ctx)` no `systemAdapter`: recebe template +
  tokens afetados, retorna intencao tipada (CPR: envelope
  `limiar.mapAoeIntent.v1` com `targetCharacterIds` + metadados da area) ou
  `null` (sistema sem regra de area).
- Cockpit: hidrata o envelope (mesmas guardas do F4 — combate ativo,
  personagens validos, expiracao), pre-seleciona os alvos e abre o fluxo de
  dano em area existente do motor CPR; ao aplicar, marca o template como
  resolvido (`expectedRevision`).
- Sem combate ativo: RESOLVER indisponivel com explicacao (mesma decisao de
  escopo do F4a).

Testes: vitest do adapter (tokens sem `characterId` listados como "fora da
ficha", nunca silenciosamente omitidos); guardas de hidratacao; prova manual
granada RAW (raio 10m, 5 celulas) com dois alvos.

Criterios: granada no mapa vira dano aplicado nas fichas com 2 confirmacoes
(RESOLVER no mapa, aplicar no cockpit) e o template se marca resolvido para
todos em <2s.

### M5 — Touch e companion mobile

Objetivo: jogador na mesa fisica opera pelo celular. Mapa e o caso caro;
comecar pelo barato (ficha) e subir.

- Passo 1 (app, fora do canvas): auditoria responsiva das views de ficha e
  combate do app raiz — o jogador precisa de HP, rolagens, condicoes e fim de
  turno no celular. Sem feature nova; so layout.
- Passo 2 (mapa, leitura): `campaign-map.html` responsivo — toolbar
  colapsavel, paineis viram drawer, canvas full-bleed; pinch-zoom e pan por
  Pointer Events (base ja existente); long-press = context menu do M2.
- Passo 3 (mapa, escrita minima de player): mover o proprio token e ping.
  Ferramentas de GM continuam desktop-first — decisao consciente, GM opera do
  notebook.
- Criterios: player faz turno completo (ver mapa, mover token, rolar ataque
  pelo cockpit, terminar turno) num viewport 375px.

### M6 — Multi-sistema ativado (segunda campanha real)

Pre-condicao de produto: existir segunda campanha de sistema diferente
(regra do PLANO-PRODUTO: pull, nao push). Trabalho tecnico ja desenhado na
secao 4 do plano 1 — aqui so o que ativa:

- Migracao `campaigns.system` (TEXT default `'cpr'`) + `campaigns.theme`;
  imutavel pos-criacao (form de edicao nao troca `system`).
- Registry de adapters no cliente (`systemAdapter.ts` -> mapa de adapters por
  system; CPR e o default). Segundo adapter minimo (ex.: zombies — badges de
  infeccao, `moveRange` proprio, `onMeasureBetweenTokens: null`).
- `unitsPerCell`/`unitLabel`/multiplicadores lidos da config do sistema em
  `domain/movement` (assinaturas ja aceitam parametro — fechar as pontas).
- Tema: CSS variables do `campaign-map.html` viram preset por `theme`.
- Criterios: campanha zombies criada, mapa funcional com unidades/badges
  proprios, e a campanha CPR intacta (zero regressao nos testes existentes).

### M7 — Mesa com conteudo (tarot, journal, Nexus)

Apostas de encantamento, cada uma pequena e independente (janelas entre fases
pesadas):

- Tarot no mapa: quando o trigger 3x6 dispara no combate, todos na cena veem
  overlay da carta (~4s, estilo ping — efemero via canal do M3, sem
  persistencia nova alem do que o tarot ja grava).
- Journal minimo: promover o chat a log com tipos (`roll`, `damage`, `system`,
  `chat`) — a mesa ja posta rolagens no chat; tipar na origem e filtrar na UI.
  Pins de cena (F8) linkaveis no log ("ver no mapa" centra a camera).
- Nexus na mesa: pin de cena tipo `net` vinculado a uma run do Nexus Breach;
  recompensa da run credita economia existente (eddies/IP) via rotas atuais.
- Criterios: cada item e demonstravel numa sessao e removivel sem cicatriz
  (feature flag simples por campanha quando fizer sentido).

### M8 — Robustez e performance

- Compactacao de reveals (merge de circulos/areas proximas) — risco herdado;
  disparo: cena com payload de reveals > ~200KB ou lag visivel de fog.
- Limite de conexoes long-poll por usuario/campanha + timeout agressivo
  (protecao do canal M3).
- Export/import de cena (JSON) para backup da mesa e para mover cenas entre
  campanhas — GM-only, validado no servidor na importacao.
- Auditoria de indices SQLite das tabelas de mapa (queries por
  `campaign_id, scene_id` dominam).
- Criterios: sessao de 4h nao degrada; export -> import reproduz a cena.

---

## 4. Riscos e mitigacoes

| Risco | Mitigacao |
| --- | --- |
| M1 revelar bugs grandes nas fases nao provadas | e o objetivo do M1 — orcamento de correcao antes de M2, nada novo em cima de base quebrada |
| Canal unico (M3) virar gargalo/loop quente | mesma disciplina do F7: backoff 1s, fallback poll 15s, notificacao sem estado |
| Corrida em escrita concorrente (condicao via token + cockpit simultaneos) | rotas de ficha existentes ja serializam; mapa nunca escreve regra, so chama rotas; documentos de cena seguem `expectedRevision` |
| Context menu (M2) crescer para "mini-Foundry" | menu e so despachante para fluxos existentes (ficha/cockpit); regra nova nao nasce no canvas |
| Escopo M5 (touch) engolir o plano | cortes explicitos: GM tools desktop-first; player = mover token + ping |
| M6 antes da segunda campanha existir | bloqueado por pre-condicao de produto, nao por vontade tecnica |

## 5. Backlog vivo de friccao (alimentado pelo M1)

Anotar aqui, com data, cada friccao observada em sessao real. Este bloco
reordena as fases — friccao real > roadmap teorico.

- 2026-07-17: auditoria tecnica no browser executada (primeira metade do M1
  passo 1). Resultado completo em `README-MAPA.md`: 6 bugs suspeitos + 10
  gaps de UX vs Foundry. Ondas 0–3 daquele README passam na frente de M2:
  nao integrar combate em cima de canvas quebrado. Prova restante do M1
  (walls/luz/templates/player view/F4) so apos Onda 0.
- 2026-07-17 (mesmo dia, sessao seguinte): Onda 0 concluida. Dos 6 bugs
  suspeitos, so 2 eram reais — B1 (fog destination-out, corrigido com
  offscreen canvas) e B5 (reveals orfaos, corrigido com GC no delete_token,
  2 testes novos). B3 (painel sem scroll) e B4 (teclado nao move token) eram
  **falso-positivo** da auditoria anterior: reverificados ao vivo com mais
  rigor (scroll funciona via `.panel.active{overflow:auto}`; seta move token
  quando ha selecao de fato confirmada) — nenhuma mudanca de codigo era
  necessaria pra esses dois. B2 (fitView 5%) nao reproduziu em 3 tentativas;
  recebeu guarda defensiva mesmo assim (rAF retry), sem reivindicar bug
  confirmado. B6 (re-render por poll) fica sem veredito, precisa reproducao
  dirigida. Licao: a auditoria original mediu elementos/estado errados em 2
  dos 6 itens — vale reverificar reivindicacoes de bug ao vivo antes de
  gastar esforco de fix, mesmo quando o relatorio anterior "parece" solido.
- 2026-07-18: M1 passos 1-3 fechados (o time tinha pulado direto pra M2/CM1
  e M3/CM2 sem fechar M1 — checklist ficou `[ ]` mas o trabalho de fato foi
  adiante; retomado e fechado antes de continuar). Passo 1 (prova tecnica
  restante do README-MAPA.md secao 4) verificado ao vivo no browser, GM e
  player: F3 templates (tool + drag + persistencia + geometria ja coberta
  por vitest), F5 paredes/portas (criacao, toggle de porta, fog/exploracao
  diferente entre GM e player confirmado), F6 luz/escuridao (darkness +
  luz ambiente compoem corretamente no canvas), F4 fim-a-fim (regua entre
  dois tokens vinculados a personagem, combate ativo, "USAR NO ATAQUE"
  abriu o cockpit ja focado no atacante com alvo pre-selecionado). Nenhum
  bug novo achado nesta rodada. Passo 2: confirmado e corrigido o bug real
  do plano original — `openCampaignMap()` (`Component.js`) so usava
  `state.activeCampaignId` se algo mais setasse esse campo, o que nunca
  acontecia, entao sempre caia no fallback de "primeira campanha
  elegivel"; fix foi adicionar botao MESA em `campaigns.js` que navega
  direto pro `campaign-map.html?campaign=<id>` da campanha selecionada,
  verificado ao vivo. Link de retorno (`backBtn`) ja existia, sem trabalho.
  Empty state novo (`emptySceneMsg` em `campaign-map.js`/`campaign-map.html`)
  para cena sem imagem, com copy diferente pra GM ("defina uma imagem") e
  player ("GM ainda nao preparou a mesa"), verificado ao vivo pro lado GM.
  Passo 3: README.md corrigido (paragrafo dizia que a Mesa tinha sido
  removida da UI — desatualizado) e PLANO-MAPA-FOUNDRY.md teve o ponteiro
  de encerramento corrigido (apontava para um `README-PLANO.md` que nao
  existe; agora aponta para este plano + `README-MAPA.md`). Passo 4
  (sessao real de mesa) continua pendente — so o usuario pode rodar uma
  sessao de verdade; friccao dessa sessao entra aqui quando acontecer.
  Suites completas sem regressao: backend 63/63, frontend 578/578.
