# README-PLANO.md — Plano unico do Limiar OS

Atualizado em 2026-07-18. Este documento e a fonte unica para ordem de
execucao, dependencias, criterios de aceite e status do produto.

`README-MAPA.md` continua como auditoria do motor do mapa, bugs e evidencias
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
- O produto e local-first: o servidor Python e o SQLite continuam suficientes
  para executar a mesa.
- Login por usuario e senha local e o fluxo base e deve funcionar sem servicos
  externos.
- Google Login e opcional. O SDK e as chamadas externas so podem ser ativados
  quando `GOOGLE_CLIENT_ID` estiver configurado; sua ausencia nunca pode impedir
  o login local.
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
`python3 -m http.server` nao comprova auth, API ou SQLite.

### 2.3 Regra de documentacao

- O snapshot da secao 3 sempre registra data e commit analisado.
- Contagens de testes sao evidencia datada, nao um contador permanente.
- Entregas antigas ficam na secao 4; nao permanecem misturadas ao backlog.
- O roadmap nao registra frases temporarias como "agente trabalhando agora".
- `README.md` descreve o produto executavel; este arquivo descreve o trabalho.

## 3. Snapshot verificado

Base de codigo analisada em 2026-07-18 no commit `efda3c5`, com mudancas locais
adicionais na experiencia de login e nestes documentos.

Validacao executada no snapshot:

- backend: **77 testes aprovados**;
- frontend: **49 arquivos / 623 testes aprovados**;
- TypeScript: `tsc --noEmit` aprovado;
- build Vite: aprovado em diretorio temporario;
- higiene: `git diff --check` aprovado.

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
| Nexus Breach | funcional dentro do app | ligar pins e economia |
| Documentacao | README de produto e plano unificado | manter sincronizados por entrega |

Riscos de codigo abertos e confirmados:

1. O fluxo AoE chama `applyCharacterPatch()` sem aguardar a persistencia e pode
   resolver o template antes de confirmar o dano de todos os alvos.
2. `campaign-map.js` mantem long-poll e `setInterval(loadSoft, 4000)` ao mesmo
   tempo.
3. `deleteProp()` e `damageProp()` ainda usam `confirm()`/`prompt()` nativos.
4. `mapAttackIntent`, `mapFocusIntent` e `mapAoeIntent` repetem o mesmo envelope
   de storage, expiracao e consumo.
5. `Component.js`, `ui/views/combat.js` e `pages/campaign-map.js` concentram
   orquestracao demais e precisam ser divididos por responsabilidade.
6. A pagina de login carrega recursos Google externamente mesmo quando a
   integracao nao esta configurada.

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

- [x] Reescrever `README-PLANO.md` com snapshot, riscos, fases e gates atuais.
- [x] Reescrever `README.md` com Mesa, auth local-first e Google opcional.
- [ ] Remover da criacao de campanha qualquer opcao fora do escopo Cyberpunk
      RED e manter o valor canonico do sistema definido internamente.
- [ ] Adicionar teste de criacao/edicao de campanha que prove que o sistema CPR
      nao muda durante a vida da campanha.
- [ ] Separar as mudancas locais atuais em commits tematicos: auth/login,
      campanha, assets, documentacao e bundles gerados.
- [ ] Atualizar o snapshot desta secao depois dos commits e registrar os SHAs na
      secao 9.

Aceite: produto, backend, login, Mesa e documentacao apresentam apenas
Cyberpunk RED; o working tree fica dividido em commits revisaveis.

### Fase 2 — CORRECAO

Objetivo: fechar os riscos encontrados antes de adicionar novas regras.

#### 2A. Persistencia AoE

- [ ] Fazer `applyCharacterPatch()` retornar a Promise da API e propagar falha.
- [ ] Criar comando de aplicacao em lote que calcule todos os patches antes de
      gravar.
- [ ] Aguardar a confirmacao de todos os alvos antes de marcar o template como
      resolvido.
- [ ] Em falha parcial, manter o template aberto, mostrar quais alvos falharam e
      permitir repetir somente os pendentes.
- [ ] Testar sucesso total, falha de um alvo, retry e falha ao resolver template.
- [ ] Validar no servidor real e reler personagens/template pela API.

#### 2B. Sync

- [ ] Remover o poll fixo de 4s do mapa.
- [ ] Manter fallback de 15s com backoff de 1s e cancelamento no unload.
- [ ] Fazer o mapa reagir somente aos topicos que alteram seu payload.
- [ ] Testar reconexao, troca de campanha, duas abas e queda temporaria do
      long-poll.

#### 2C. Dialogos do mapa

- [ ] Migrar remocao de prop para `openConfirmModal()`.
- [ ] Migrar dano de prop para `openPromptModal()` com validacao numerica.
- [ ] Buscar qualquer `prompt()`/`confirm()` restante no mapa e migrar para o
      mesmo componente.
- [ ] Testar confirmar, cancelar, Escape, backdrop e valor invalido.

Aceite: nenhuma mutacao de AREA e perdida silenciosamente; o mapa usa um canal
principal com um fallback; nenhuma acao do mapa abre dialogo nativo.

### Fase 3 — PROVA

Objetivo: provar uma sessao completa com GM e player reais.

- [x] Botao MESA por campanha.
- [x] Link de retorno no header do mapa.
- [x] Empty state: GM recebe instrucao de preparacao; player recebe estado de
      espera.
- [x] README descreve a Mesa.
- [ ] Executar smoke GM de cenas, upload, grid, tokens, walls/portas, luzes,
      fog, terreno, props, templates e pings.
- [ ] Executar smoke player em segunda conta, verificando audiencia, ownership,
      movimento do proprio token, ping e ausencia de segredos do GM.
- [ ] Executar F4 fim a fim: medir no mapa, abrir cockpit, rolar ataque e salvar
      resultado.
- [ ] Executar AREA fim a fim depois da fase 2A: resolver, aplicar dano, recarregar
      e confirmar persistencia.
- [ ] Executar duas abas com alteracoes de map/chat/combat/roster e reconexao.
- [ ] Rodar uma sessao real inteira e registrar cada friccao na secao 10.
- [ ] Transformar toda friccao observada em checkbox com dono tecnico, aceite e
      fase definida.

Aceite: uma sessao completa termina sem Foundry e sem correcao manual de banco.

### Fase 4 — ARQUITETURA

Objetivo: dividir os tres maiores pontos de concentracao sem mudar regras ou UI.

#### 4A. Intents de navegacao

- [ ] Criar envelope versionado comum com `key`, `version`, `createdAt`, TTL,
      parse, save, load e clear.
- [ ] Migrar `mapAttackIntent` com testes de compatibilidade.
- [ ] Migrar `mapFocusIntent` com testes de compatibilidade.
- [ ] Migrar `mapAoeIntent` com testes de compatibilidade.
- [ ] Manter os payloads especificos tipados em modulos pequenos.

#### 4B. Controller do mapa

- [ ] Extrair estado e seletores de `campaign-map.js`.
- [ ] Extrair sync/reload/reconexao.
- [ ] Extrair render do canvas por camada.
- [ ] Extrair Pointer/input handlers.
- [ ] Extrair comandos persistentes de cena, token, prop, luz e template.
- [ ] Manter `pages/campaign-map.js` como composition root da pagina.

#### 4C. Cockpit e Component

- [ ] Mover aplicacao AoE/supressao para comandos em `application/`.
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

#### 9A. Google Login opcional e local-first

- [ ] Servir fonte local ou usar stack de fontes do sistema no login.
- [ ] Consultar `/api/meta/config` antes de carregar o SDK Google.
- [ ] Injetar o SDK somente quando `GOOGLE_CLIENT_ID` existir.
- [ ] Ocultar divisor e botao Google quando a integracao estiver desligada.
- [ ] Manter usuario/senha funcional com internet bloqueada.
- [ ] Testar configurado, nao configurado, timeout e token invalido.

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

Aceite: login local funciona offline, Google e opcional, sessoes nao ficam em
`localStorage`, cenas sao portaveis e o banco possui indices verificados.

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
3. PROVA
4. ARQUITETURA
5. MOTOR
6. MOBILE
7. RAW-COMBATE
8. CONTEUDO
9. AUTH E ROBUSTEZ

Essa ordem pode receber correcoes de regressao imediatamente, mas nenhuma fase
ou checkbox e removido. Uma friccao descoberta entra na secao 10 e recebe uma
posicao explicita nesta sequencia.

## 9. Registro de entregas

Registrar somente entregas verificadas, no formato:

```text
YYYY-MM-DD | Fase/item | commit | testes | evidencia live/API
```

- 2026-07-18 | base pre-rewrite | `efda3c5` | backend 77, frontend 623,
  typecheck/build/diff-check verdes | auditorias anteriores em `README-MAPA.md`
- 2026-07-18 | ALINHAMENTO docs | working tree | README e plano sincronizados |
  validacao textual e diff-check

## 10. Backlog vivo de friccao

Cada entrada precisa de data, reproducao, impacto, fase e criterio de aceite.

- 2026-07-17 | auditoria live encontrou B1-B6 e A1-A10 | Onda 0 corrigiu os
  bugs confirmados; os gaps de experiencia foram absorvidos em MOTOR.
- 2026-07-18 | AoE pode resolver template antes de confirmar todos os patches |
  CORRECAO 2A | aceite: nenhuma falha parcial fica invisivel.
- 2026-07-18 | mapa combina long-poll e poll de 4s | CORRECAO 2B | aceite:
  long-poll principal mais fallback de 15s testado.
- 2026-07-18 | props ainda abrem dialogos nativos | CORRECAO 2C | aceite:
  todas as acoes usam o modal do mapa.
- 2026-07-18 | tres intents repetem envelope/sessionStorage | ARQUITETURA 4A |
  aceite: envelope comum com payloads tipados e compatibilidade testada.
