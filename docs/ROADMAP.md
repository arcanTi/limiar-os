# docs/ROADMAP.md — Plano unico do Limiar OS

Atualizado em 2026-08-06. Este documento e a fonte unica para ordem de
execucao, dependencias, criterios de aceite e status do produto.

`docs/MAP-ENGINE.md` continua como auditoria do motor do mapa, bugs e evidencias
visuais. Identificadores antigos como F1-F8, M1-M8, CM0-CM5 e G1-G12 aparecem
apenas para permitir a leitura de commits e discussoes anteriores; eles nao
dependem de documentos de plano ausentes no checkout.

Nenhum item deste plano e descartado por ser grande. Trabalho extenso deve ser
dividido nas entregas verificaveis descritas aqui, executadas na ordem indicada.

## 1. North star e escopo

> A mesa roda uma sessao inteira de Cyberpunk RED dentro do Limiar OS, sem
> depender do Foundry para ficha, combate, mapa, comunicacao ou estado da
> campanha.

Escopo confirmado:

- O produto suporta **Cyberpunk RED**. Campanhas, mapa, regras, catalogo e UI
  devem apresentar somente esse sistema.
- O produto usa FastAPI/PostgreSQL: o servidor Python e o container continuam suficientes
  para executar a mesa.
- O login e um token de acesso de 6 caracteres emitido pelo mestre dentro do
  app, e deve funcionar sem servicos externos. Senha e Google Login foram
  removidos.
- O canvas coleta contexto fisico; `systemAdapter` traduz; os modulos de dominio
  resolvem as regras; o usuario confirma a aplicacao.
- Enforcement de mesa continua advisory: a UI avisa e registra, sem substituir
  a decisao do GM.
- O projeto nao busca paridade generica com Foundry em audio, video, hex grid ou
  marketplace de modulos.
- O projeto nao se torna SaaS nesta sequencia de trabalho.
- Nenhuma dependencia pesada de renderizacao entra no mapa; Canvas 2D,
  geometria propria e assets locais continuam como base.

## 2. Como este plano deve ser executado

### 2.1 Unidade de entrega

Cada checkbox representa uma entrega que pode ser implementada, revisada,
testada e commitada sem depender de outro checkbox da mesma fase, salvo quando
a dependencia estiver escrita explicitamente.

Cada entrega deve conter:

1. contrato ou comportamento esperado;
2. alteracao de dominio/aplicacao antes da UI quando houver regra;
3. teste automatizado do caminho principal e da falha relevante;
4. build de `dist/` quando `frontend/src/` mudar;
5. verificacao no servidor real quando houver UI, auth, API ou persistencia;
6. evidencia curta no commit ou na secao 9 deste documento.

### 2.2 Gate tecnico global

Uma entrega so esta concluida quando os checks aplicaveis estiverem verdes:

```bash
python3 -m pytest backend/tests -q
cd frontend && npm test
cd frontend && npm run typecheck
cd frontend && npm run build
git diff --check
```

Para UI e persistencia, o gate inclui `python3 server.py`, `/api/health`, pagina
servida por HTTP, interacao visivel e leitura posterior do estado pela API.
`python3 -m http.server` nao comprova auth, API ou PostgreSQL.

### 2.3 Regra de documentacao

- O snapshot da secao 3 sempre registra data e commit analisado.
- Contagens de testes sao evidencia datada, nao um contador permanente.
- Entregas antigas ficam na secao 4; nao permanecem misturadas ao backlog.
- O roadmap nao registra frases temporarias como "agente trabalhando agora".
- `README.md` descreve o produto executavel; este arquivo descreve o trabalho.

## 3. Snapshot verificado

Base de codigo analisada em 2026-07-21 no commit `ed443b6`.

Validacao executada no snapshot:

- backend: **86 testes aprovados**;
- frontend: **62 arquivos / 695 testes aprovados**;
- TypeScript: `tsc --noEmit` aprovado;
- build Vite: aprovado (`frontend && npm run build`);
- higiene: gate de `dist/` do `.githooks/pre-commit` aprovado em cada commit.

Estado funcional:

| Area | Estado verificado | Proximo fechamento |
| --- | --- | --- |
| Fichas, cyberware, tarot e campanhas | operacional e persistente | robustez e mobile |
| Combate CPR | amplo, com modulos puros testados | ligar ataque single-target ao resolver central |
| Mesa/mapa | F1-F8, Onda 0 e Onda 1 implementadas | prova completa, Pointer Events e render em camadas |
| Mapa -> combate | ataque medido, foco, AoE e contexto situacional ligados | persistencia atomica do AoE |
| Municao e LUCK | cockpit e HUD do mapa implementados | validar fluxo completo em sessao |
| Sync | long-poll unificado implementado | remover poll redundante de 4s e testar reconexao |
| Auth | senha local e Google implementados | tornar Google realmente opcional e migrar sessao para cookie |
| Superficie de exposicao | estaticos por allowlist e API fechada por padrao (B1 e B2 entregues) | escopo de campanha e escrita concorrente |
| Escopo de campanha | so mapa e roster; chat, combate, tarot e HQ sao globais | BLINDAGEM B3 |
| Nexus Breach | funcional dentro do app | ligar pins e economia |
| Documentacao | README de produto e plano unificado | manter sincronizados por entrega |

Riscos de codigo abertos e confirmados:

1. ~~O fluxo AoE chama `applyCharacterPatch()` sem aguardar a persistencia e~~
   ~~pode resolver o template antes de confirmar o dano de todos os alvos.~~
   Resolvido 2026-07-20: `rollAndApplyMapAoe` (combat.js) agora aguarda
   `Promise.allSettled` de todos os patches; falha parcial mantem o template
   aberto so com os alvos pendentes; falha ao marcar resolvido nao permite
   re-rolar dano (`damageApplied` trava o retry no passo de resolver).
2. ~~`campaign-map.js` mantem long-poll e `setInterval(loadSoft, 4000)` ao~~
   ~~mesmo tempo.~~ Resolvido 2026-07-20: poll fixo trocado por fallback de
   15s com retry de 1s, cancelado no unload.
3. ~~`deleteProp()` e `damageProp()` ainda usam `confirm()`/`prompt()`~~
   ~~nativos.~~ Resolvido 2026-07-20: migrados para `openConfirmModal()`/
   `openPromptModal()`; smoke live 2026-07-21 confirmou confirmar, cancelar,
   backdrop e valor invalido.
4. ~~`mapAttackIntent`, `mapFocusIntent` e `mapAoeIntent` repetem o mesmo~~
   ~~envelope de storage, expiracao e consumo.~~ Resolvido 2026-07-20: os tres
   agora usam `domain/map/intentEnvelope.ts`; cada um so tipa e valida seu
   proprio payload.
5. `Component.js` e `ui/views/combat.js` ainda concentram orquestracao de
   combate demais (ARQUITETURA 4C pendente); `pages/campaign-map.js` ja perdeu
   selectors, sync, render, input handlers e comandos de cena/prop/token/
   luz/template para modulos dedicados (ARQUITETURA 4B, resolvido
   2026-07-21) e segue so como composition root.
6. A pagina de login carrega recursos Google externamente mesmo quando a
   integracao nao esta configurada.
7. ~~Editar uma campanha existente enviando um `system` diferente no payload~~
   ~~sobrescrevia o sistema da campanha.~~ Resolvido 2026-07-21: `upsert_campaign`
   agora ignora o `system` do payload sempre que a campanha ja existe; o valor
   gravado no banco vence, tornando o sistema imutavel apos a criacao.
8. ~~`.tool`/`.row`/`.section` em `styles/map/base.css` setavam `display`~~
   ~~sem guarda contra `[hidden]`, entao `el.hidden=true` (usado por~~
   ~~`applyScene()` pra esconder tudo com classe `master-only`) nao tinha~~
   ~~efeito visual.~~ Resolvido 2026-07-21: regra global
   `[hidden]{display:none!important}` no topo de `base.css`. Mutacao ja
   era barrada no servidor (403), mas a UI mostrava todo controle de GM
   (parede, prop, luz, fog, terreno, desenho, pin, editar cena/token) como
   clicavel pro player.
9. ~~`campaign-map.js` tinha um `ReferenceError` de temporal dead zone~~
   ~~(`canMove`/`sceneSize`/`tokenAt`/etc. usados por `pointerHandlers` e~~
   ~~`onMapKeyDown` antes do `const` que os declarava, introduzido pela~~
   ~~extracao ARQUITETURA 4B) que quebrava a avaliacao do modulo inteiro:~~
   ~~nenhuma sessao, nenhum GET de estado, nenhum long-poll, para todo~~
   ~~usuario, sem erro no servidor.~~ Resolvido 2026-07-21, achado durante o
   smoke live de CORRECAO 2B; as suites unitarias nao cobrem esse caso porque
   testam os factories isolados, sem reproduzir a ordem real do modulo.
10. ~~`openConfirmModal()` nao fechava no Escape (so `openPromptModal()`~~
   ~~escutava, via `input.onkeydown`).~~ Resolvido 2026-07-21: `bind()` ganhou
   um listener de keydown em capture phase que fecha qualquer modal aberto,
   unificando os dois tipos.

Auditoria de superficie em 2026-07-28 (servidor real em `127.0.0.1:8791`,
`docs/AUDITORIA-2026-07-28.md` guarda as evidencias completas) acrescentou:

11. ~~**CRITICO — o servidor estatico expoe o repositorio inteiro sem
    autenticacao.**~~ Resolvido 2026-07-28 (BLINDAGEM B1): allowlist em
    `STATIC_DIRS`/`STATIC_FILES`, gate em `send_head()` antes de tocar o disco,
    `list_directory` desligado, `HOST` default `127.0.0.1`, sessoes revogadas.
    Descricao original do risco: `BaseHandler.translate_path` confina o caminho em `ROOT`,
    mas `ROOT` e a raiz do projeto: `data/limiar.db`, `backend/*.py`, `.git/` e
    `uploads/` estao todos dentro dela, e `do_GET` entrega qualquer caminho fora
    de `/api/` direto pro `SimpleHTTPRequestHandler`, sem sessao. Verificado:
    `GET /data/limiar.db` devolveu 200 e 794 KB — o banco inteiro. Reabrindo o
    arquivo baixado: 25 tabelas, hashes PBKDF2 de todos os usuarios e a tabela
    `sessions` com tokens vivos. Um token `admin` tirado dali (`expires_at` em
    2026-08-19) foi usado direto em `GET /api/users` (200) e `GET /api/session`,
    que respondeu `{"authenticated": true, "role": "admin"}`. Takeover completo
    de admin com um unico GET nao autenticado. `GET /.git/config` (200),
    `GET /backend/security.py` (200) e listagem de diretorio em `GET /uploads/`
    (200) confirmam que nao e caso isolado do `.db`. `HOST` tem default
    `0.0.0.0`, entao isso vale pra rede local inteira desde o primeiro boot.

12. ~~**Autenticacao e opt-in por handler, nao no dispatcher.**~~ Resolvido
    2026-07-28 (BLINDAGEM B2): dispatcher chama `require_login()` antes de
    resolver a rota, com `PUBLIC_GET_ROUTES`/`PUBLIC_POST_ROUTES` como unica
    saida; teste de enumeracao impede que rota nova nasca aberta. Descricao
    original do risco: `do_GET` despacha o
    dict `exact` sem nenhum `require_login()`; cada handler decide sozinho se
    checa sessao. Verificado sem token: `/api/chat`, `/api/combat-state`,
    `/api/tarot-state`, `/api/hq`, `/api/items`, `/api/map` e
    `/api/nexus-challenge` respondem 200; so `/api/characters`, `/api/users` e
    `/api/campaigns` respondem 401. Em `do_POST`, `open_routes` libera
    `/api/chat` (201 sem token), `/api/nexus-result` (200 sem token) e
    `/api/combat-state/end-turn`. O default do sistema e "aberto", e cada rota
    nova precisa lembrar de se fechar.

13. ~~**`/api/combat-state/end-turn` nao verifica dono nenhum.**~~ Resolvido
    2026-07-28 (BLINDAGEM B2): a rota exige sessao e o combatente alvo tem que
    ser um personagem do proprio usuario, ou a sessao tem que ser staff.
    Descricao original do risco: O handler so
    compara `targetId` com o combatente da vez; nao ha `require_login`, nao ha
    checagem de que o requisitante e dono daquele combatente. Qualquer cliente
    na rede — logado ou nao — encerra o turno de quem estiver jogando. O
    `README.md` descreve essa rota como "o jogador encerra o proprio turno";
    hoje ela encerra o turno de qualquer um.

14. **Chat, combate, tarot e HQ sao globais, nao por campanha.** `combat-state`,
    `tarot-state`, `hqIp` e `nexusResult` sao chaves unicas na tabela
    `settings`, e `chat_messages` e uma tabela unica sem `campaign_id` — o
    proprio `campaign_sync.py` documenta isso ("chat_messages and combat-state
    are global ... so their mutations bump every campaign"). Duas campanhas no
    mesmo servidor compartilham o mesmo log de chat, o mesmo tracker de combate
    e o mesmo estado de tarot. O modelo de campanhas do produto so existe de
    fato no mapa e no roster.

15. **Persistencia de ficha e de combate e read-modify-write sem transacao nem
    revision.** `_post_character_notes` faz `get_record` -> merge ->
    `upsert_record` em duas conexoes separadas; `_post_combat_end_turn` faz
    `get_setting` -> calcula -> `set_setting` do mesmo jeito. O mapa tem
    `scene.revision` e `expectedRevision` (secao 7), mas ficha e combate nao tem
    nada: duas escritas concorrentes perdem uma silenciosamente. Contradiz a
    decisao transversal "persistencia que representa uma unica acao do usuario
    deve confirmar todas as gravacoes".

16. ~~**CSS gerado fora do fluxo do Vite.**~~ **Resolvido em 2026-08-06.**
    `frontend/src/main.js` importa Tailwind e os estilos principais; Vite gera
    o CSS junto dos tres HTML. `dist/` e o artefato aposentado
    `tailwind-sheet.css` ficam fora do Git e sao gerados no CI/container.

17. **`http.ts` descarta o corpo de erro da API e nao trata 401.**
    `if (!res.ok) throw new Error('API ' + res.status + ' ' + path)` joga fora o
    envelope `{"error":{"code","message"}}` que o backend monta em
    `write_error`. Nenhum consumidor distingue 403 de 409 de 422 a nao ser
    parseando string, e uma sessao expirada (401) nao redireciona pro login —
    vira um erro generico no meio da mesa.

18. **`ruff` acusa 333 erros e nao esta em nenhum gate.** O comentario do
    `.github/workflows/ci.yml` fala em "233 pre-existing findings"; a contagem
    real em 2026-07-28 e 333. O numero cresce sem freio porque nada o mede.

19. ~~**Higiene do repositorio.**~~ **Resolvido em 2026-08-06.** `dist/` nao e
    mais versionado, `graphify-out/` foi removido e ignorado, as screenshots
    documentadas existem, e fontes HTML/CSS/Nexus foram consolidadas sob
    `frontend/`.

20. **Upload confia no `Content-Type` declarado pelo cliente.** `handle_upload`
    deriva a extensao do header da parte multipart, sem checar magic bytes:
    qualquer conteudo entra em `uploads/` com nome `.png`. Nao ha cota por
    usuario nem coleta de asset orfao — deletar o personagem/token nao remove a
    imagem. Mitigacao existente: o CSP `sandbox; default-src 'none'` em
    `/uploads/` e a exclusao deliberada de SVG.

21. **Limites de recurso do servidor.** `ThreadingHTTPServer` cria uma thread por
    request sem teto (so os waiters de long-poll tem cap, 64 em
    `campaign_sync.py`). `handle_upload` faz `self.rfile.read(length)` com
    `_MAX_UPLOAD_BYTES` de 64 MB — 64 MB em memoria por thread concorrente. Os
    dicts de rate limit em `security.py` crescem por IP e so podam quando aquele
    mesmo IP volta, e a chave e `client_address[0]`, entao atras de qualquer
    proxy a mesa inteira divide um balde so. `db()` abre uma conexao nova por
    chamada (com `mkdir` + `PRAGMA journal_mode=WAL` a cada request) e nunca
    chama `close()`.

22. **Divergencias do proprio plano.** A numeracao desta secao tinha dois itens
    `8` (corrigido nesta revisao). A secao 9 diz que ARQUITETURA 4C deixou
    `ui/views/combat.js` "sem suite automatizada"; existe
    `frontend/test/unit/ui/combat.test.js` com 841 linhas e 56 casos — o que ele
    nao cobre e especificamente `rollAndApplyMapAoe`, `requestSuppressiveFire` e
    `resolveSuppressiveFireBatch`.

Confirmado como solido na mesma auditoria, para nao gastar fase corrigindo o que
ja esta certo: as 33 rotas de `campaign_maps.py` passam todas por
`_campaign_map_session`; `map_state()` projeta audiencia no servidor de verdade;
o path traversal em si esta tratado (`resolve()` + checagem de `parents`) — o
problema e o tamanho da raiz permitida, nao o escape dela; uploads sao servidos
com CSP `sandbox` e SVG esta fora do allowlist; `_ALLOWED_TABLES` guarda todo
nome de tabela que chega em f-string; PBKDF2-SHA256 260k com
`secrets.compare_digest` e migracao do formato antigo; a sanitizacao de
URL/atributo em `framework/index.js` cobre `javascript:`, `vbscript:` e `data:`
fora de imagem.

## 4. Base entregue

Estas entregas existem e nao voltam ao backlog. Ajustes de regressao aparecem
na fase CORRECAO.

- [x] F1-F8: cenas, tokens, pings, audiencia, fog individual, templates AoE,
      regua com DV, paredes, portas, LOS, luzes, long-poll e QoL.
- [x] Onda 0: correcoes de fog offscreen, GC de reveals e guardas defensivas.
- [x] CM0: `luckCurrent`, gasto pre-rolagem, reset do GM, `currentAmmo`, gasto
      por modo e recarga.
- [x] CM1: estado de combate no mapa, turno destacado, HUD de round, menu do
      token, foco de ficha/cockpit e ataque medido.
- [x] M3: canal por campanha com topicos `map`, `chat`, `combat` e `roster`.
- [x] CM2: pedido de evasao no dispositivo do defensor e Death Save no inicio
      do turno Mortally Wounded.
- [x] AREA nucleo: template `untilResolved`, `resolveAreaAttack`, supressao,
      cobertura destrutivel e chips situacionais.
- [x] MUNICAO-NO-MAPA: badge de pente, recarga e aviso `needsReload` no HUD.
- [x] Onda 1 nucleo: HUD de token, drag rico, toolbar com icones, grid
      adaptativo, zoom suave, nomes incrementais e modal reutilizavel.
- [x] Entrada da Mesa por campanha, retorno para o app e empty state diferente
      para GM e player.
- [x] README do produto reconhece a Mesa como funcional.

## 5. Roadmap de execucao

A ordem abaixo e unica. Todo o escopo listado sera executado; dependencias
servem para ordenar, nao para remover trabalho.

### Fase 1 — ALINHAMENTO

Objetivo: fazer codigo, documentacao e escopo Cyberpunk RED dizerem a mesma
coisa.

- [x] Reescrever `docs/ROADMAP.md` com snapshot, riscos, fases e gates atuais.
- [x] Reescrever `README.md` com Mesa, auth local-first e Google opcional.
- [x] Decisao de produto: manter todas as opcoes de sistema visiveis na
      criacao de campanha, com badge `Implementado · Yes/No/Partially`; o
      botao "Criar campanha" fica bloqueado (disabled + guard no submit) para
      qualquer sistema com `implementation !== 'yes'`. Substitui a remocao das
      opcoes prevista originalmente — decisao explicita do usuario 2026-07-21.
- [x] Adicionar teste de criacao/edicao de campanha que prove que o sistema CPR
      nao muda durante a vida da campanha (`test_campaign_system_is_immutable_after_creation`,
      backend/tests/test_campaigns.py).
- [x] Separar as mudancas locais atuais em commits tematicos: auth/login,
      campanha, documentacao e bundles gerados (cada commit inclui o rebuild de
      `dist/` correspondente, exigido pelo gate).
- [x] Atualizar o snapshot desta secao depois dos commits e registrar os SHAs na
      secao 9.

#### 1B. Higiene de repositorio e documentacao

Aberto pela auditoria de 2026-07-28 (riscos 16, 18, 19 e 22 da secao 3).

- [x] Gerar Tailwind e `dist/` exclusivamente pelo Vite no CI/container.
- [x] Manter `frontend/src/tailwind.css` e `frontend/tailwind.config.js` como fontes.
- [x] Remover os bundles legados versionados de `dist/`.
- [x] Remover e ignorar `graphify-out/`.
- [x] Manter as tres screenshots referenciadas pelo `README.md`.
- [x] Colocar `ruff check backend` no CI, com baseline congelada nos achados
      atuais e proibicao de crescer.
- [ ] Corrigir a nota da secao 9 sobre ARQUITETURA 4C: `ui/views/combat.js` tem
      suite (841 linhas, 56 casos); o que falta e cobertura de
      `rollAndApplyMapAoe`, `requestSuppressiveFire` e
      `resolveSuppressiveFireBatch`.

Aceite: produto, backend, login, Mesa e documentacao apresentam apenas
Cyberpunk RED como sistema criavel; o working tree fica dividido em commits
revisaveis; nenhum artefato gerado ou de ferramenta fica versionado sem gate.

### Fase 2 — CORRECAO

Objetivo: fechar os riscos encontrados antes de adicionar novas regras.

#### 2A. Persistencia AoE

- [x] Fazer `applyCharacterPatch()` retornar a Promise da API e propagar falha.
- [x] Criar comando de aplicacao em lote que calcule todos os patches antes de
      gravar.
- [x] Aguardar a confirmacao de todos os alvos antes de marcar o template como
      resolvido.
- [x] Em falha parcial, manter o template aberto, mostrar quais alvos falharam e
      permitir repetir somente os pendentes.
- [x] Testar sucesso total, falha de um alvo, retry e falha ao resolver template.
      Smoke live 2026-07-21 via `window.__dcComponent` num servidor real
      (`preview_start` + console): sucesso total confirmado (dano penetra os
      11 SP de `Light Armorjack` e persiste, template resolve, revision
      0->1); falha de alvo simulada (upsert rejeitado) confirma que o
      contexto encolhe para so o alvo pendente e o template nao resolve;
      retry aplica dano so no pendente; a chamada de resolver expos um 409
      real (`TemplateRevisionConflict`, expectedRevision desatualizado), que
      seta `damageApplied` e mantem o template aberto; retry final com
      `damageApplied=true` pula a rolagem (HP inalterado) e so reenvia o
      resolve, que fecha o template (revision 1->2). `ui/views/combat.js`
      segue sem suite automatizada (view/orquestracao, ver ARQUITETURA 4C);
      cobertura unitaria fica pendente ate a extracao dos comandos AoE para
      `application/`.
- [x] Validar no servidor real e reler personagens/template pela API. Todas
      as leituras acima vieram de `GET /api/characters/:id` e
      `GET /api/campaign-maps/:id` (nao do estado local do componente).
      Fixtures de teste (`aoe-smoke-2a`, personagens e usuario `gm2a_smoketest`)
      removidas do banco apos a validacao.

#### 2B. Sync

- [x] Remover o poll fixo de 4s do mapa.
- [x] Manter fallback de 15s com backoff de 1s e cancelamento no unload.
- [x] Fazer o mapa reagir somente aos topicos que alteram seu payload (canal
      dedicado `wait_for_map_update`/`mapVersion` ja so bumpa em mutacao de
      mapa; nao usa os topicos globais map/chat/combat/roster do `campaigns.py`).
- [x] Testar reconexao, troca de campanha, duas abas e queda temporaria do
      long-poll. Smoke live 2026-07-21 com duas abas reais na mesma campanha:
      mutacao via API em uma aba apareceu na outra sem reload manual (long-poll
      completo, versao avancada, loop reconectado); troca de campanha numa aba
      abortou o long-poll antigo (`ERR_ABORTED` via `mapSync.stop()`) e abriu
      um novo scoped a campanha nova sem vazar tokens/cena da anterior; queda
      simulada do servidor gerou retries a cada ~1s (`ERR_CONNECTION_REFUSED`)
      e reconexao automatica assim que o servidor voltou, sem acao do usuario.
      Achado durante o smoke: `campaign-map.js` tinha um `ReferenceError` de
      TDZ que quebrava a pagina inteira silenciosamente para todo usuario
      (`canMove`/`sceneSize`/etc. referenciados antes do `const`, ver secao 3
      risco resolvido); corrigido antes de completar este teste.

#### 2C. Dialogos do mapa

- [x] Migrar remocao de prop para `openConfirmModal()`.
- [x] Migrar dano de prop para `openPromptModal()` com validacao numerica.
- [x] Buscar qualquer `prompt()`/`confirm()` restante no mapa e migrar para o
      mesmo componente.
- [x] Testar confirmar, cancelar, Escape, backdrop e valor invalido. Smoke
      live 2026-07-21: backdrop e cancelar fecham sem mutar; confirmar remove
      de fato e persiste no servidor; valor invalido (`-5`) bloqueado com
      "dano invalido" e HP inalterado; Escape nao fechava `openConfirmModal`
      (so `openPromptModal` escutava, via `input.onkeydown`) — corrigido com
      um listener de keydown em capture phase no `bind()`, unificado para os
      dois tipos de modal.

Aceite: nenhuma mutacao de AREA e perdida silenciosamente; o mapa usa um canal
principal com um fallback; nenhuma acao do mapa abre dialogo nativo.

### Fase 2.5 — BLINDAGEM

Objetivo: fechar a superficie de exposicao antes de rodar uma sessao real com
mais de uma maquina na rede.

Posicao justificada: a fase PROVA pede uma sessao real com duas contas em
maquinas diferentes. Enquanto o risco 11 da secao 3 estiver aberto, qualquer
pessoa na mesma rede da mesa le o banco inteiro e assume a conta do GM — nao da
pra chamar de "prova" uma sessao rodada nessas condicoes.

#### B1. Servidor estatico com allowlist

- [x] Substituir o `translate_path` que confina em `ROOT` por uma allowlist
      explicita de raizes servidas (`STATIC_DIRS`/`STATIC_FILES` em
      `backend/config.py`: `dist/`, `assets/`, `styles/`, `vendor/`, `games/`,
      `uploads/` e os tres HTML de entrada mais os CSS/JS de topo).
- [x] Devolver 404 para qualquer caminho fora da allowlist, incluindo `data/`,
      `backend/`, `frontend/`, `.git/`, `docs/` e dotfiles. O gate ficou em
      `BaseHandler.send_head()`, que roda antes de qualquer leitura de disco;
      `servable_path()` resolve `..` antes de checar a allowlist.
- [x] Desligar a listagem de diretorio (`list_directory`) para toda rota.
- [x] Testar `GET /data/limiar.db`, `/.git/config`, `/backend/config.py`,
      `/uploads/` e um path traversal codificado — todos 404
      (`backend/tests/test_static_files.py`, 9 casos, mais smoke live em
      `127.0.0.1:8792`: 9 caminhos sensiveis em 404 e 15 caminhos legitimos em
      200, incluindo arquivo real dentro de `uploads/`).
- [x] Rotacionar o banco de desenvolvimento: invalidar todas as sessoes
      existentes e trocar a senha do usuario `mestre` depois do fix, porque os
      tokens atuais ja circularam em claro pela rede local. Sessoes revogadas em
      2026-07-28 (2 sessoes `admin` apagadas, backup em
      `data/limiar.db.bak-*` antes da operacao, coberto pelo `.gitignore`);
      token vazado reconfirmado morto (401 em `/api/users`,
      `authenticated:false` em `/api/session`). **Troca da credencial do `mestre`
      pendente do operador** — `LIMIAR_MASTER_TOKEN` so semeia o admin em banco
      novo, entao use `python3 scripts/rotate-credentials.py` (hoje reemite o
      token de acesso; na epoca desta auditoria era uma senha).
- [x] Mudar o default de `HOST` para `127.0.0.1` e exigir opt-in explicito para
      escutar em `0.0.0.0`.

#### B2. Autenticacao fechada por padrao

- [x] Inverter o dispatcher: `do_GET`/`do_POST`/`do_DELETE` chamam
      `require_login()` antes de resolver a rota, com um conjunto nomeado e
      pequeno de rotas publicas (`PUBLIC_GET_ROUTES`/`PUBLIC_POST_ROUTES` em
      `backend/app.py`: health, `/api/meta/*`, `/api/session`, `/api/i18n`,
      login, logout, register, `/api/auth/google`, password-reset-requests).
      `/api/i18n` e `/api/session` continuam publicas porque a tela de login
      depende das duas antes de existir sessao.
- [x] Fechar `/api/chat` (GET e POST), `/api/combat-state`, `/api/tarot-state`,
      `/api/hq`, `/api/items`, `/api/map`, `/api/nexus-challenge` e
      `/api/nexus-result` atras de sessao. `/api/reference/*` tambem foi
      fechada na mesma passada (so `Component.js`, ja autenticado, consome).
- [x] Adicionar checagem de dono em `/api/combat-state/end-turn`:
      `require_login` + o combatente da vez tem que estar vinculado ao usuario
      da sessao (ou ser staff). `combatants` e indexado por id de personagem,
      entao a checagem reusa `_owns_character`, promovido de `CharacterRoutes`
      para `BaseHandler` por passar a ter dois consumidores. Player fora do
      proprio combatente recebe 403 `NOT_YOUR_COMBATANT`; a ordem e dono antes
      de turno, entao alvo proprio fora da vez segue em 409 `NOT_ACTIVE_TURN`.
      Coberto por `backend/tests/test_combat_end_turn.py` (5 casos).
- [x] Escrever um teste que enumere todas as rotas registradas e falhe se
      alguma nao estiver na lista publica nem exigir sessao — assim rota nova
      nasce fechada. `backend/tests/test_route_auth.py`: 49 probes contra um
      `ThreadingHTTPServer` real, mais um scan dos literais `/api/...` no
      source que falha quando uma rota nova nao tem probe. Ambos os testes
      foram validados por mutacao — reabrir `/api/chat` e adicionar uma rota
      sem probe fazem a suite falhar.

#### B3. Escopo de campanha no estado compartilhado

- [ ] Adicionar `campaign_id` a `chat_messages` com migracao
      (`ALTER TABLE ADD COLUMN`, default para a campanha existente).
- [ ] Trocar as chaves globais `combat-state`, `tarot-state`, `hqIp` e
      `nexusResult` por chaves com escopo de campanha.
- [ ] Filtrar `/api/chat`, `/api/combat-state`, `/api/tarot-state` e `/api/hq`
      pela campanha da requisicao.
- [ ] Trocar `campaign_sync.bump_all` por `bump_campaign` nesses quatro topicos.
- [ ] Testar duas campanhas simultaneas: chat, combate e tarot de uma nao
      aparecem na outra.

#### B4. Escrita concorrente

- [ ] Fazer `_post_combat_end_turn` ler e gravar dentro de uma unica transacao.
- [ ] Adotar `expectedRevision` em personagem, no mesmo formato ja usado pela
      cena, e responder 409 em conflito.
- [ ] Fazer o cliente tratar 409 de ficha com recarga e reaplicacao, sem
      sobrescrever.
- [ ] Testar duas escritas concorrentes na mesma ficha e dois `end-turn`
      simultaneos.

Aceite: um cliente sem token nao le nem escreve nada de mesa; nenhum arquivo
fora da allowlist e servido; duas campanhas no mesmo servidor nao se enxergam;
duas escritas concorrentes nao se perdem em silencio.

### Fase 3 — PROVA

Objetivo: provar uma sessao completa com GM e player reais.

- [x] Botao MESA por campanha.
- [x] Link de retorno no header do mapa.
- [x] Empty state: GM recebe instrucao de preparacao; player recebe estado de
      espera.
- [x] README descreve a Mesa.
- [x] Executar smoke GM de cenas, upload, grid, tokens, walls/portas, luzes,
      fog, terreno, props, templates e pings. Smoke live 2026-07-21 via
      `preview_start` + UI real (cliques, drags, forms): renomear cena e
      mudar grid persistiu apos reload; upload de imagem (`/api/uploads/images`)
      aplicado como fundo da cena e renderizado; token criado com nome
      incremental ("Sentinela Corp 1"); template AoE desenhado por drag e
      salvo; area oculta manual (fog) desenhada e persistida; parede e porta
      criadas por drag, porta alternou fechada/aberta; luz, prop
      (destrutivel), desenho livre, terreno dificil e pin (com modal de nota)
      todos criados e confirmados via `GET /api/campaign-maps/:id` apos
      reload completo da pagina. Nenhum bug encontrado nesta rodada (ao
      contrario de 2B/2C, que acharam o TDZ e o Escape).
- [x] Executar smoke player em segunda conta, verificando audiencia, ownership,
      movimento do proprio token, ping e ausencia de segredos do GM. Smoke
      live 2026-07-21: token GM-only com `visible:false` corretamente
      ausente do `GET /api/campaign-maps/:id` do player e HP de token
      `resourceVisibility:gm` vem null; player move e da ping no proprio
      token, persistido e confirmado via API; `POST token/move` num token
      alheio retorna 403. Achado real: `[hidden]` nao escondia controles
      master-only (ver risco 8 na secao 3 e commit `1041b63`) — corrigido.
- [x] Executar F4 fim a fim: medir no mapa, abrir cockpit, rolar ataque e salvar
      resultado. Smoke live 2026-07-21: combate ativo no turno do atacante,
      medida real (drag da ferramenta "R" entre dois tokens) gerou
      `attackReady`; "USAR NO ATAQUE" salvou o intent e navegou para o
      cockpit (`/?mapAttack=1`), que abriu direto na view de combate com
      alvo pre-selecionado; ataque rolado contra a DV da distancia medida
      (hit em total >= DV); dano rolado e aplicado automaticamente — HP do
      alvo caiu de 30 para 23 e persistiu, confirmado via
      `GET /api/characters/:id` (nao do estado local).
- [x] Executar AREA fim a fim depois da fase 2A: resolver, aplicar dano, recarregar
      e confirmar persistencia. Smoke live 2026-07-21: template `untilResolved`
      cobrindo 2 tokens com `characterId`, botao RESOLVER da lista do mapa
      disparou o handoff (`/?mapAoe=1`), cockpit abriu com o card de
      confirmacao pre-populado (2 alvos marcados), "ROLAR E APLICAR DANO"
      aplicou dano nos dois (30->12 HP cada) e marcou o template resolvido
      (`revision` 0->1) — tudo confirmado via `GET /api/characters/:id` e
      `GET /api/campaign-maps/:id`, nao do estado local.
- [x] Executar duas abas com alteracoes de map/chat/combat/roster e reconexao.
      Smoke live 2026-07-21 (canal geral do app, `startCampaignSync`/
      `applyCampaignSyncTopics` — o long-poll do mapa em si ja foi coberto
      em CORRECAO 2B): chat postado via API apareceu na segunda aba sem
      reload (topico `chat`); upsert de personagem refletiu o nome novo na
      segunda aba (topico `roster`); ativar combate via API refletiu
      ROUND 1 na segunda aba (topico `combat`, `refreshRoster` tambem busca
      `combat-state`); apos derrubar e subir o servidor de novo, a aba que
      nunca recarregou reconectou sozinha (retry de 1s do catch em
      `startCampaignSync`) e recebeu uma mensagem nova sem nenhuma acao
      manual.
- [ ] Rodar uma sessao real inteira e registrar cada friccao na secao 10.
- [ ] Transformar toda friccao observada em checkbox com dono tecnico, aceite e
      fase definida.

Aceite: uma sessao completa termina sem Foundry e sem correcao manual de banco.

### Fase 4 — ARQUITETURA

Objetivo: dividir os tres maiores pontos de concentracao sem mudar regras ou UI.

#### 4A. Intents de navegacao

- [x] Criar envelope versionado comum com `key`, `version`, `createdAt`, TTL,
      parse, save, load e clear (`domain/map/intentEnvelope.ts`).
- [x] Migrar `mapAttackIntent` com testes de compatibilidade.
- [x] Migrar `mapFocusIntent` com testes de compatibilidade.
- [x] Migrar `mapAoeIntent` com testes de compatibilidade.
- [x] Manter os payloads especificos tipados em modulos pequenos.

#### 4B. Controller do mapa

- [x] Extrair estado e seletores de `campaign-map.js`
      (`pages/campaignMapSelectors.js`: sceneSize, tokenRadius, visionRadiusPx,
      lightRadiusPx/Position, canMove/canEditTemplate, tokenAt/templateAt/
      propAt/wallAt, losWalls, liveVisionTokens, tokenVisibleNow,
      buildAttackMeasure — puros, parametrizados por `state`, sem ctx/DOM).
- [x] Extrair sync/reload/reconexao (`pages/campaignMapSync.js`; long-poll +
      fallback 15s isolados do DOM/estado da pagina, testados com fake timers).
- [x] Extrair render do canvas por camada
      (`pages/campaignMapCanvasRenderer.js`: pipeline RAF e camadas nomeadas,
      com ordem de pintura e coalescencia testadas).
- [x] Extrair Pointer/input handlers
      (`pages/campaignMapPointerHandlers.js`: hover/press/drag/release do
      canvas, com selecao, pan e ciclo de ferramentas; e
      `pages/campaignMapKeyboardHandlers.js`: atalhos, Escape e setas;
      ambos testados).
- [x] Extrair comandos persistentes de cena, token, prop, luz e template.
      Cena feita (`pages/campaignMapSceneCommands.js`: saveScene/newScene/
      activateScene/uploadMap/useImageSize, testado). Prop feita
      (`pages/campaignMapPropCommands.js`: saveProp/deleteProp/damageProp,
      testado). Token feito (`pages/campaignMapTokenCommands.js`:
      saveToken/deleteToken/syncPlayers/uploadToken, testado). Luz feita
      (`pages/campaignMapLightCommands.js`: saveLight/deleteLight/toggleLight,
      testado). Template feito (`pages/campaignMapTemplateCommands.js`:
      saveTemplatePlacement/saveTemplateEdit/deleteTemplate, testado).
- [x] Manter `pages/campaign-map.js` como composition root da pagina:
      comandos, renderizador, ciclo de dados, sync, seletores e handlers de
      input sao compostos por adapters locais; o ciclo de dados foi isolado
      em `pages/campaignMapDataRuntime.js` e testado.

#### 4C. Cockpit e Component

- [ ] Mover aplicacao AoE/supressao para comandos em `application/`.
      AoE feito (`application/ApplyAreaAttack.ts`: roll -> patch -> await
      `Promise.allSettled` -> resolve template, mesmo comportamento de
      CORRECAO 2A incluindo falha parcial e `damageApplied`; testado com 5
      casos unitarios e smoke live real — sucesso, falha parcial sem dano
      duplicado no retry, e resolucao de template). Fogo Supressivo
      (`requestSuppressiveFire`/`resolveSuppressiveFireBatch`) ainda em
      `combat.js`.
- [ ] Mover persistencia de personagem para um servico async unico.
- [ ] Separar handlers de combate por ataque, dano, condicoes, turno e recursos.
- [ ] Manter `Component.js` apenas como orquestrador de estado e views.
- [ ] Adicionar testes de contrato entre handlers e `Component`.

Aceite: cada arquivo principal tem responsabilidades nomeadas, e as suites
provam que a divisao preservou comportamento.

### Fase 5 — MOTOR

Objetivo: completar desempenho e input do mapa.

#### 5A. Render em camadas

- [ ] Criar cena de benchmark com 30 tokens, 20 paredes e 10 luzes.
- [ ] Instrumentar p50/p95 de frame, quantidade de redraws e custo por camada.
- [ ] Separar background/grid, objetos estaticos, tokens, fog/luz e overlays.
- [ ] Implementar dirty flags por camada.
- [ ] Invalidar somente as camadas afetadas por cada mutacao.
- [ ] Atingir p95 menor que 16ms na cena de referencia e registrar a medicao.

#### 5B. Pointer Events e touch

- [ ] Substituir `mousedown/mousemove/mouseup` por Pointer Events.
- [ ] Implementar pointer capture para drag de token e ferramentas.
- [ ] Implementar pan de um dedo, pinch zoom de dois dedos e cancelamento.
- [ ] Implementar long-press para menu de contexto.
- [ ] Preservar mouse, teclado, wheel zoom e atalhos existentes.
- [ ] Testar mouse, touch sintetico e viewport real de telefone.

Aceite: benchmark cumpre o budget e todas as interacoes principais usam Pointer
Events sem regressao de mouse/teclado.

### Fase 6 — MOBILE

Objetivo: entregar um companion completo para o jogador.

#### 6A. App raiz em 375px

- [ ] Ajustar shell, ficha, abas e drawers para 375px sem scroll horizontal.
- [ ] Tornar HP, rolagens, condicoes, notas e fim de turno acessiveis com uma
      mao.
- [ ] Garantir alvos de toque de pelo menos 44px nas acoes principais.
- [ ] Validar teclado virtual em inputs e textareas.

#### 6B. Mapa de leitura

- [ ] Colapsar toolbar por grupos.
- [ ] Converter painel lateral em drawer.
- [ ] Adaptar HUD, status e menu do token ao viewport.
- [ ] Usar pinch/pan implementados na fase 5B.

#### 6C. Escrita do player

- [ ] Permitir selecionar e mover somente o proprio token.
- [ ] Permitir ping e abertura da propria ficha/cockpit.
- [ ] Exibir feedback advisory de MOVE e terreno.
- [ ] Manter ferramentas de preparacao de cena exclusivas do GM.

Aceite: o jogador executa seu turno essencial em 375px sem solicitar o desktop.

### Fase 7 — RAW-COMBATE

Objetivo: ligar todos os gaps CPR restantes ao fluxo real de mesa.

#### 7A. Ataque single-target

- [ ] Criar adapter entre o estado do cockpit e `resolveCombatAttack`.
- [ ] Migrar to-hit, defesa/evasao, municao, dano, armadura e critico por etapas.
- [ ] Comparar o resultado novo com fixtures do fluxo atual.
- [ ] Remover o calculo duplicado somente depois da paridade automatizada.

#### 7B. Economia de turno

- [ ] Modelar Move + 1 Acao no estado de combate.
- [ ] Registrar deslocamento acumulado por combatente e terreno.
- [ ] Mostrar budget e trilha vermelha advisory ao exceder.
- [ ] Registrar acao usada e resetar ambos em `advanceCombatTurn`.
- [ ] Expor marcadores no cockpit e HUD do mapa.

#### 7C. Alcance e defesa

- [ ] Expor arma selecionada ao mapa.
- [ ] Desenhar aneis das bandas DV da arma.
- [ ] Implementar banda DV melee generica.
- [ ] Fazer timeout de evasao cair no DV correto.
- [ ] Implementar gate explicito do GM para pedido de evasao.
- [ ] Aplicar adjacencia advisory para Estabilizar e melee reach.

#### 7D. Interacoes corporais

- [ ] Modelar agarrar, escapar, estrangular e escudo humano.
- [ ] Persistir vinculo temporario entre tokens durante o agarramento.
- [ ] Resolver checks opostos e estados resultantes.
- [ ] Expor acoes no menu do token e no cockpit.

#### 7E. Regras complementares

- [ ] Aplicar malfunction de arma poor em d10=1.
- [ ] Integrar Facedown ao menu de contexto e ao status resultante.
- [ ] Completar UX de vinculo roster-token.
- [ ] Criar testes RAW para todos os itens desta fase.

Aceite: `resolveCombatAttack` e o pipeline oficial de single-target, e G5, G6,
G7, G9, G11 e G12 possuem UI, persistencia e testes.

### Fase 8 — CONTEUDO

Objetivo: ligar sistemas existentes a momentos visiveis da sessao.

#### 8A. Tarot no mapa

- [ ] Publicar evento efemero pelo canal de campanha no trigger 3x6.
- [ ] Renderizar overlay da carta para a audiencia correta.
- [ ] Sincronizar animacao, resumo mecanico e link para o log.
- [ ] Testar reconexao sem repetir efeito mecanico.

#### 8B. Journal

- [ ] Tipar mensagens na origem como `roll`, `damage`, `system` ou `chat`.
- [ ] Adicionar filtros e busca.
- [ ] Permitir pins de journal com link "ver no mapa".
- [ ] Preservar compatibilidade das mensagens antigas.

#### 8C. Nexus na Mesa

- [ ] Criar pin `net` com permissao e payload validado.
- [ ] Abrir Nexus Breach dentro do fluxo da campanha.
- [ ] Registrar resultado no journal/chat.
- [ ] Creditar recompensa pela economia existente de forma idempotente.
- [ ] Testar repetir/atualizar pagina sem duplicar recompensa.

Aceite: Tarot, Journal e Nexus geram eventos persistentes e auditaveis dentro
da campanha.

### Fase 9 — AUTH E ROBUSTEZ

Objetivo: completar seguranca, portabilidade e operacao prolongada.

#### 9A. Google Login opcional e local-first — CANCELADO

Superado pelo login por token de acesso: nao ha mais SDK Google, `/api/meta/config`,
senha nem `password_reset_requests`. O unico item que sobrevive e servir a fonte
localmente no login.

- [ ] Servir fonte local ou usar stack de fontes do sistema no login.

#### 9B. Cookie de sessao e CSRF

- [ ] Emitir cookie `httpOnly; SameSite=Strict` no login local e Google.
- [ ] Definir comportamento `Secure` para HTTPS sem quebrar localhost HTTP.
- [ ] Criar token CSRF separado e validar toda rota mutante.
- [ ] Migrar `http.ts` para `credentials` e remover Authorization manual.
- [ ] Migrar `session.ts` sem manter token legivel no `localStorage`.
- [ ] Revogar cookie no logout e expirar sessoes no servidor.
- [ ] Testar login, refresh, logout, CSRF ausente/invalido e duas abas.

#### 9C. Dados e operacao

- [ ] Implementar export de cena JSON com schema versionado.
- [ ] Implementar import GM-only com validacao e preview.
- [ ] Adicionar indices SQLite para consultas por campanha/cena.
- [ ] Compactar reveals sem alterar a projecao por audiencia.
- [ ] Criar backup antes de migracoes destrutivas futuras.
- [ ] Adicionar smoke de payload grande, fog e sessao prolongada.

#### 9D. Erros e limites

Aberto pela auditoria de 2026-07-28 (riscos 17, 20 e 21 da secao 3).

- [ ] Fazer `http.ts` ler o envelope `{error:{code,message}}` e expor `code` ao
      chamador, em vez de `throw new Error('API ' + status)`.
- [ ] Tratar 401 num ponto so: limpar sessao e mandar pro login.
- [ ] Validar magic bytes no upload em vez de confiar no `Content-Type` da parte.
- [ ] Criar cota por usuario e coleta de asset orfao em `uploads/`.
- [ ] Limitar as threads do servidor e fazer streaming do upload em vez de
      `rfile.read(length)` inteiro em memoria.
- [ ] Podar os dicts de rate limit por tempo, nao so no proximo hit do mesmo IP,
      e usar identidade de sessao alem do IP quando houver sessao.
- [ ] Reaproveitar conexao SQLite por thread em vez de abrir uma por chamada.

Aceite: login local funciona offline, Google e opcional, sessoes nao ficam em
`localStorage`, cenas sao portaveis, o banco possui indices verificados e todo
erro de API chega ao cliente com codigo utilizavel.

## 6. Gaps de mecanica — status vivo

| Gap | Estado em 2026-07-18 | Fechamento |
| --- | --- | --- |
| G1 supressao | implementado; smoke completo pendente | PROVA |
| G2 cobertura destrutivel | implementado; dialogs e smoke pendentes | CORRECAO/PROVA |
| G3 LUCK | fechado | entregue |
| G4 municao | fechado no cockpit e HUD | entregue |
| G5 agarrao/escudo humano | aberto | RAW-COMBATE 7D |
| G6 economia de turno | aberto | RAW-COMBATE 7B |
| G7 evasao | nucleo implementado; gate e fallback DV pendentes | RAW-COMBATE 7C |
| G8 modificadores situacionais | auto-fill de luz/LOS/cobertura implementado | PROVA |
| G9 malfunction | aberto | RAW-COMBATE 7E |
| G10 Death Save no turno | fechado | entregue |
| G11 vinculo roster-token | nucleo implementado; UX final pendente | RAW-COMBATE 7E |
| G12 DV melee generica | aberto | RAW-COMBATE 7C |

## 7. Decisoes tecnicas transversais

- Canvas 2D proprio; geometria pura em `frontend/src/domain/map/` com Vitest.
- O mapa nao importa regras de combate diretamente; usa `systemAdapter` CPR.
- Logica nova nasce em `domain/`, `application/` ou handlers especializados;
  pages e `Component` orquestram.
- Migracoes seguem `CREATE TABLE IF NOT EXISTS`, introspeccao por
  `PRAGMA table_info` e `ALTER TABLE ADD COLUMN`.
- Documentos de cena usam ID estavel, `scene.revision` e `expectedRevision`.
- `map_state()` projeta a audiencia no servidor; segredos do GM nao chegam ao
  player.
- Strings novas sao sanitizadas na storage boundary.
- Notificacao de sync invalida estado e dispara GET autorizado; nao transporta
  estado sensivel.
- Pointer Events sao obrigatorios para toda interacao nova.
- `dist/` e reconstruido na mesma entrega que altera `frontend/src/`.
- Persistencia que representa uma unica acao do usuario deve confirmar todas as
  gravacoes antes de encerrar/ocultar o fluxo visual.

## 8. Ordem resumida

1. ALINHAMENTO
2. CORRECAO
3. BLINDAGEM
4. PROVA
5. ARQUITETURA
6. MOTOR
7. MOBILE
8. RAW-COMBATE
9. CONTEUDO
10. AUTH E ROBUSTEZ

Essa ordem pode receber correcoes de regressao imediatamente, mas nenhuma fase
ou checkbox e removido. Uma friccao descoberta entra na secao 10 e recebe uma
posicao explicita nesta sequencia.

## 9. Registro de entregas

Registrar somente entregas verificadas, no formato:

```text
YYYY-MM-DD | Fase/item | commit | testes | evidencia live/API
```

- 2026-07-18 | base pre-rewrite | `efda3c5` | backend 77, frontend 623,
  typecheck/build/diff-check verdes | auditorias anteriores em `docs/MAP-ENGINE.md`
- 2026-07-18 | ALINHAMENTO docs | working tree | README e plano sincronizados |
  validacao textual e diff-check
- 2026-07-20 | CORRECAO 2C: deleteProp/damageProp migrados para modal proprio |
  working tree | backend 85, frontend 633, typecheck/build verdes | `grep`
  confirma zero `prompt()`/`confirm()` restante em `campaign-map.js`; smoke
  visual de login/delete pendente por falta de credencial de teste
- 2026-07-20 | CORRECAO 2B: poll fixo de 4s removido, fallback 15s/retry 1s |
  working tree | backend 85, frontend 633, typecheck/build verdes | smoke de
  reconexao/duas abas/queda do long-poll ainda pendente (requer sessao live)
- 2026-07-20 | CORRECAO 2A: AoE aguarda todos os patches antes de resolver
  template, retry so nos alvos pendentes | working tree | frontend 633,
  typecheck/build verdes | falta suite automatizada de `combat.js` (view sem
  testes) e smoke live com falha real de API
- 2026-07-20 | ARQUITETURA 4A: `intentEnvelope.ts` criado; mapAttackIntent,
  mapFocusIntent e mapAoeIntent migrados | working tree | frontend 639
  (+6 testes novos em `intentEnvelope.test.js`; suites existentes das tres
  intents passaram sem alteracao, provando compatibilidade), typecheck/build
  verdes
- 2026-07-20 | ARQUITETURA 4B (parcial): sync/reload extraidos para
  `pages/campaignMapSync.js` | working tree | frontend 644 (+5 testes com
  fake timers cobrindo long-poll change/erro/abort e fallback 15s/1s),
  typecheck/build verdes; `campaign-map.js` so troca chamadas por
  `mapSync.startRealtime/scheduleFallbackPoll/stop`, comportamento identico
- 2026-07-20 | ARQUITETURA 4B (parcial): comandos de cena extraidos para
  `pages/campaignMapSceneCommands.js` | working tree | frontend 653 (+9
  testes cobrindo saveScene ativa/inativa, newScene com/sem nome, activateScene,
  uploadMap sucesso/sem-arquivo/falha, useImageSize sem fonte), typecheck/build
  verdes; token/prop/luz/template ainda no arquivo da pagina
- 2026-07-20 | ARQUITETURA 4B (parcial): estado/seletores extraidos para
  `pages/campaignMapSelectors.js` | working tree | frontend 663 (+10 testes
  cobrindo sceneSize, tokenRadius, canMove/canEditTemplate, tokenAt/templateAt/
  propAt/wallAt, liveVisionTokens com modo individual, tokenVisibleNow com fog,
  lightPosition, buildAttackMeasure self-target/invisivel/valido), backend 85,
  typecheck/build verdes; `campaign-map.js` mantem os mesmos nomes de funcao
  como wrappers finos (`(...a) => selectors.x(state, ...a)`), zero mudanca de
  comportamento
- 2026-07-20 | ARQUITETURA 4B (parcial): comandos de prop extraidos para
  `pages/campaignMapPropCommands.js` | working tree | frontend 669 (+6 testes
  cobrindo save sucesso/falha, delete cancelado/confirmado com limpeza de
  selecao, damage cancelado/invalido/aplicado/destruido), backend 85,
  typecheck/build verdes
- 2026-07-21 | CORRECAO 2A | `f0fe276` | frontend 695, typecheck/build verdes |
  `rollAndApplyMapAoe` aguarda `Promise.allSettled`; `damageApplied` trava
  re-rolagem de dano em retry so-de-resolver
- 2026-07-21 | ARQUITETURA 4A+4B (fechamento) | `d727d86` | frontend 695
  (+32 testes novos: intentEnvelope + 10 modulos `campaignMapX.js`), backend 85,
  typecheck/build verdes | `campaign-map.js` reduzido a composition root;
  token/luz/template tambem extraidos nesta entrega
- 2026-07-21 | FASE 1 (redesign login) | `56fcbaa` | frontend 695,
  typecheck/build verdes | modal dedicado de nova campanha + badge
  `implementation` yes/no/partially nos cards
- 2026-07-21 | ALINHAMENTO docs | `4252b08` | working tree | README-PLANO
  sincronizado com ARQUITETURA 4A/4B e riscos resolvidos
- 2026-07-21 | FASE 1 (bloqueio de criacao fora do escopo) | `a0b4465` |
  frontend 695, typecheck/build verdes | testado ao vivo via `preview_start` +
  DOM: sistema `dnd5e` desabilita o botao e o submit handler bloqueia mesmo
  com `disabled` burlado via `requestSubmit()`; zero POST `/api/campaigns`
  disparado
- 2026-07-21 | FASE 1 (sistema imutavel apos criacao) | `ed443b6` | backend 86
  (+1 teste `test_campaign_system_is_immutable_after_creation`), frontend 695,
  typecheck/build verdes | `upsert_campaign` ignora `system` do payload quando
  a campanha ja existe
- 2026-07-21 | CORRECAO 2A (smoke live) | working tree (sem mudanca de codigo)
  | n/a | servidor real via `preview_start`, campanha/personagens/template
  descartaveis criados e apagados pela API, `window.__dcComponent` dirigindo
  `rollAndApplyMapAoe()`; sucesso total, falha de alvo, retry e um 409 real
  de `expectedRevision` cobertos; leituras de HP e template feitas via
  `GET /api/characters/:id` e `GET /api/campaign-maps/:id`, nao do estado
  local
- 2026-07-21 | fix(map): TDZ quebrava campaign-map.js inteiro | `40bdc0c` |
  frontend 695, typecheck/build verdes | achado no smoke live de CORRECAO 2B:
  `canMove`/`sceneSize`/etc. usados antes do `const`; pagina inteira
  inoperante (zero sessao/GET/long-poll) sem erro no servidor; corrigido
  reordenando os aliases antes de `canvasRenderer`/`pointerHandlers`/
  `onMapKeyDown`
- 2026-07-21 | CORRECAO 2B (smoke live) | working tree (sem mudanca de codigo
  alem do fix de TDZ acima) | frontend 695 | duas abas reais na mesma
  campanha: mutacao via API refletida sem reload manual; troca de campanha
  aborta o long-poll antigo (`ERR_ABORTED`) e abre um novo sem vazar estado;
  queda simulada do servidor gerou retries de 1s e reconexao automatica ao
  voltar
- 2026-07-21 | fix(map): Escape nao fechava modal de confirmacao | `bbe9935`
  | frontend 695, typecheck/build verdes | achado no smoke live de CORRECAO
  2C; `bind()` ganhou listener de keydown em capture phase unificando
  `openConfirmModal`/`openPromptModal`
- 2026-07-21 | CORRECAO 2C (smoke live) | working tree (sem mudanca de codigo
  alem do fix de Escape acima) | frontend 695 | backdrop/cancelar fecham sem
  mutar; confirmar remove e persiste no servidor; valor invalido (`-5`)
  bloqueado com HP inalterado; Escape corrigido e reconfirmado
- 2026-07-21 | PROVA (smoke GM) | working tree (sem mudanca de codigo) |
  n/a | cenas, upload, grid, tokens, walls/portas, luzes, fog, terreno,
  props, templates e pings testados via UI real num servidor local; tudo
  persistiu apos reload completo; nenhum bug encontrado
- 2026-07-21 | PROVA (smoke player) | `1041b63` | frontend 695,
  typecheck/build verdes | segunda conta real (GM + player, convite +
  join): audiencia projetada certo (token GM-only com `visible:false`
  ausente, HP `resourceVisibility:gm` null), player move e pinga o
  proprio token, `token/move` em token alheio retorna 403; achado real:
  `[hidden]` sem efeito visual expunha todo controle de GM ao player —
  corrigido com `[hidden]{display:none!important}` global
- 2026-07-21 | PROVA (F4 fim a fim) | working tree (sem mudanca de codigo)
  | n/a | combate real (atacante+alvo, turno ativo), medida por drag no
  mapa gerou attackReady, handoff via sessionStorage abriu o cockpit em
  `/?mapAttack=1` com alvo pre-selecionado, ataque rolado contra a DV da
  distancia medida, dano aplicado automaticamente e persistido (HP
  30->23 confirmado via API)
- 2026-07-21 | PROVA (AREA fim a fim) | working tree (sem mudanca de codigo)
  | n/a | template `untilResolved` com 2 alvos, botao RESOLVER do mapa
  disparou `/?mapAoe=1`, card de confirmacao do cockpit pre-populado,
  "ROLAR E APLICAR DANO" aplicou e persistiu dano nos dois alvos (30->12
  cada) e resolveu o template (revision 0->1), confirmado via API
- 2026-07-21 | PROVA (duas abas: map/chat/combat/roster + reconexao) |
  working tree (sem mudanca de codigo) | n/a | duas abas reais na mesma
  campanha: chat, upsert de personagem (roster) e ativacao de combate
  refletiram na segunda aba sem reload; apos derrubar/subir o servidor,
  a aba nao recarregada reconectou sozinha e recebeu mensagem nova
- 2026-07-21 | ARQUITETURA 4C (parcial): AoE extraido para
  `application/ApplyAreaAttack.ts` | `924c9f9` | frontend 700 (+5 testes),
  typecheck/build verdes | smoke live pego um bug antes do commit:
  `characterForCombatActor` nao levava `health`/`spDamage`/`name`, entao
  a rolagem real via RESOLVER nao aplicava dano nenhum (silencioso);
  corrigido incluindo os campos no shape. Reconfirmado: sucesso total,
  falha parcial sem dano duplicado no retry, resolucao de template —
  tudo via clique real nos botoes do mapa/cockpit

- 2026-09-03 | Onboarding: usabilidade do wizard de primeira ficha |
  working tree | backend 160, frontend 883, typecheck/build/diff-check verdes |
  live em servidor FastAPI + PostgreSQL de teste (`compose.test.yaml`): toggle
  "Distribuir 62 pontos" / "Rolar 1d10 por atributo" (1 rerolado, sem teto de
  8; rola tudo de uma vez ou um atributo por vez, `creation.statRolls` conta os
  dados e `creation.statRerolls` as rerolagens por atributo, exigido
  `statRolls >= 10`); grid dos atributos em `grid-cols-fit-stat` (210px) porque
  o card estourava a celula de 150px e cortava o `+`; dica explicando por
  que o `+` nao subiu (teto 8, minimo 2, orcamento zerado); faixa "Tudo certo"
  removida e mensagem de orcamento unificada na barra; espacamento `gap-3` /
  `px-6` e spinner nativo escondido; `validate_character_creation` no backend
  recusa na criacao de ficha de player STAT fora de 2-8 (2-10 rolado), soma
  > 62 por pontos, pericia > 10 ou gasto > 60 — `POST /api/player-characters`
  com todos os STATs em 10 devolveu 400 `VALIDATION_ERROR`; atualizacao de
  ficha existente nao e revalidada.
- 2026-09-03 | Onboarding: fechamento RAW da criacao (CPR p.42/45/78/88/90) |
  working tree | backend 169, frontend 897, typecheck/build/diff-check verdes |
  LUCK cai para o teto 8 na criacao (era 10); pericia 2-6 na criacao (teto 6,
  treinada nunca fica em 1: 0 -> 2 -> 0); orcamento mostrado como 86 com 26 ja
  nas 13 basicas (interno segue 60 livres, `skillBudgetView`); campo "Idioma de
  origem" na identidade grava `Language (X)` 4 gratis com flag `origin` —
  `normalizeSkills` passa a preservar pericias `Language (...)` fora do
  catalogo e `sheet.js` mantem a flag ao salvar; backend valida tudo isso so na
  criacao (`creation.originLanguage` tem que bater com a pericia marcada);
  rolagem 1d10 rotulada REGRA DA CASA (nao e o Edgerunner do livro: faltam as
  tabelas de Role p.74-76; Streetrat tambem ausente).

- 2026-09-03 | RAW: EMP, Mortally Wounded e Death Save acumulado (CPR p.80 e
  wound states) | working tree | frontend 901, typecheck/build/diff-check
  verdes | `deriveEffectiveEmp` passa de ceil para floor (44 -> 4, 39 -> 3;
  teste antigo pinnava o ceil errado); `deriveStats` ganha `woundState`:
  HP < 1 = Mortally Wounded com -4 em acoes e MOVE -6 (minimo 1), antes o
  estado sumia abaixo de 1 HP e zerava a penalidade; `effectiveMoveStat` (mapa)
  aplica o mesmo; `deathSavesPassed` no registro soma +1 ao Death Save a cada
  save passado (gravado por `recordDeathSavePassed` no cliente de quem rolou),
  zera ao estabilizar ou ao voltar a HP >= 1; painel de efeitos lista as tres
  linhas. Foco (DLC investigacao) segue fora.

## 10. Backlog vivo de friccao

Cada entrada precisa de data, reproducao, impacto, fase e criterio de aceite.

- 2026-07-17 | auditoria live encontrou B1-B6 e A1-A10 | Onda 0 corrigiu os
  bugs confirmados; os gaps de experiencia foram absorvidos em MOTOR.
- 2026-07-18 | AoE pode resolver template antes de confirmar todos os patches |
  CORRECAO 2A | resolvido em 2026-07-20: patches aguardados via
  `Promise.allSettled`, falha parcial mantem template aberto e retry so nos
  pendentes; smoke live 2026-07-21 confirmou sucesso/falha/retry/409 real no
  servidor. Falta so a suite automatizada (view sem testes, ver ARQUITETURA
  4C).
- 2026-07-18 | mapa combina long-poll e poll de 4s | CORRECAO 2B | resolvido em
  2026-07-20: poll fixo de 4s removido, fallback agora e 15s com retry de 1s
  em falha; falta rodar o smoke de reconexao/duas abas.
- 2026-07-18 | props ainda abrem dialogos nativos | CORRECAO 2C | aceite:
  todas as acoes usam o modal do mapa.
- 2026-07-18 | tres intents repetem envelope/sessionStorage | ARQUITETURA 4A |
  aceite: envelope comum com payloads tipados e compatibilidade testada.
- 2026-07-28 | auditoria de superficie: `GET /data/limiar.db` sem auth devolve o
  banco inteiro, incluindo `sessions`; token admin extraido dali autenticou em
  `/api/users` e `/api/session` | BLINDAGEM B1 | **resolvido em 2026-07-28**:
  allowlist de estaticos, 404 pra `data/`/`backend/`/`.git/`/dotfiles,
  `list_directory` desligado, `HOST` default `127.0.0.1`, sessoes revogadas e
  token vazado reconfirmado morto. Resta o operador trocar a senha do `mestre`
  com `scripts/rotate-credentials.py`.
- 2026-07-28 | 7 rotas GET e 3 POST respondem sem sessao; auth e decidida dentro
  de cada handler | BLINDAGEM B2 | **resolvido em 2026-07-28**: dispatcher
  fecha por padrao, 5 GET e 5 POST publicas nomeadas, `test_route_auth.py`
  enumera 49 probes contra servidor real e escaneia o source por rota nova sem
  probe. Smoke live: 14 rotas antes abertas em 401 anonimo e 200 com token de
  player.
- 2026-07-28 | `end-turn` nao checa dono: qualquer cliente encerra o turno de
  qualquer combatente | BLINDAGEM B2 | **resolvido em 2026-07-28**: sessao
  obrigatoria mais `_owns_character` sobre o `targetId`; 403
  `NOT_YOUR_COMBATANT` para combatente alheio, staff segue podendo encerrar
  qualquer um.
- 2026-07-28 | chat, combat-state, tarot-state e hqIp sao globais; duas
  campanhas dividem o mesmo estado | BLINDAGEM B3 | aceite: escopo por campanha
  com migracao e teste de duas campanhas.
- 2026-07-28 | ficha e combate fazem read-modify-write sem transacao nem
  revision | BLINDAGEM B4 | aceite: transacao unica + `expectedRevision` em
  personagem, 409 tratado no cliente.
- 2026-07-28 | `tailwind-sheet.css` gerado e sem versionar, referenciado pelo
  HTML; `tailwind.css`/`tailwind.config.js` tambem fora do git; gate de CI so
  cobre `dist/` | ALINHAMENTO 1B | aceite: fontes versionadas e gate estendido,
  ou CSS gerado no boot.
- 2026-07-28 | `http.ts` descarta o envelope de erro da API e nao trata 401 |
  AUTH E ROBUSTEZ 9D | aceite: `code` exposto ao chamador e 401 tratado num
  ponto so.
- 2026-07-28 | `ruff` acusa 333 erros e nao esta em nenhum gate (CI diz 233) |
  ALINHAMENTO 1B | aceite: `ruff check backend` no CI com baseline congelada.
