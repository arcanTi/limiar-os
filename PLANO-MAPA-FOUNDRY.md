# PLANO-MAPA-FOUNDRY.md — Mapa tatico estilo Foundry VTT

> **ENCERRADO 2026-07-18**: F1–F8 entregues. Continuacao em
> `PLANO-MAPA-2.md` (consolidacao, combate vivo, sync, conteudo); auditoria
> tecnica que motivou a continuacao em `README-MAPA.md`. Este doc fica como
> referencia historica/tecnica.

Referencia: Foundry VTT (instancia da mesa: https://foundry.pflausino.xyz). Objetivo
NAO e clonar o Foundry — e trazer para o Limiar OS as interacoes de mapa que fazem
falta na mesa, aproveitando o que ja existe e as vantagens do nosso sistema
(engine de combate CPR RAW integrada, fichas vivas, conditions).

Status: F1, F2a, F2b, F2c e F3 CONCLUIDAS (2026-07-09; F3 sem verificacao no browser
nesta sessao — extensao/preview indisponiveis). Demais fases planejadas.

## 0. Checklist de fases

- [x] F1 — Pings
- [x] F2a — Contrato de mesa (membership, audiencia, fog compartilhado)
- [x] F2b — Adapter CPR, recursos e badges de condicao
- [x] F2c — Fog individual
- [x] F3 — Templates de area (AoE)
- [x] F4 — Regua → ataque ⭐
- [x] F5 — Paredes, portas e linha de visao
- [x] F6 — Iluminacao e escuridao
- [x] F7 — Tempo real (long-poll autenticado + fallback)
- [x] F8 — QoL (menu pos-nucleo)

Requisito transversal: o modulo de mapa sera reaproveitado em N tipos de
campanha (zombies, sistema original, D&D...). Ver secao 4 — nucleo generico +
config de tema + adapter de regras por sistema. CPR e apenas o primeiro adapter.

---

## 1. Estado atual (o que ja temos)

Arquivos centrais:

| Camada | Arquivo | Papel |
| --- | --- | --- |
| Page | `campaign-map.html` + `frontend/src/pages/campaign-map.js` | canvas 2D, toolbar, paineis |
| API client | `frontend/src/infrastructure/api/campaignMaps.ts` | rotas `/campaign-maps/:id/*` |
| Dominio puro | `frontend/src/domain/movement/index.ts` | celulas, custo, alcance (testado) |
| Backend rotas | `backend/api/campaign_maps.py` | permissao + dispatch |
| Backend repo | `backend/repositories/campaign_maps.py` | SQLite, normalizacao |
| Schema | `backend/db.py` | `campaign_map_scenes/tokens/fog/reveals` |

Funcionalidades existentes:

- Cenas por campanha: fundo (upload/URL), fit, grid px, dimensoes, cena ativa.
- Tokens: drag com permissao (GM ou dono), snap, imagem circular, HP ring
  (players so veem HP de `kind=player`), visao radial, visibilidade, sync
  fichas→tokens, MOVE efetivo da ficha + overlay de alcance (Run x2).
- Fog: sombra dinamica revelada por visao (reveals persistidos) + retangulos
  manuais do GM.
- Terreno dificil por celula (RAW 2m por 1m), pintado por drag, custo aparece
  na regua (`segmentMovementCost`).
- Regua local (nao compartilhada) com custo em quadrados/metros.
- Sync por polling de 4s (`loadSoft`).
- Permissoes: `can_edit_campaign_map` = admin/gm; player move so token proprio.

## 2. Gap vs Foundry (o que falta e vale a pena)

| Feature Foundry | Temos? | Fase |
| --- | --- | --- |
| Ping (alt-click, todos veem) | nao | **F1** |
| Status effects / condicoes no token | nao | **F2** |
| Measurement templates (circulo/cone/linha) | nao | **F3** |
| Regua → contexto de ataque (DV por range) | nao (Foundry tambem nao faz nativo) | **F4** ⭐ |
| Walls + line of sight + portas | nao (visao e circulo puro) | **F5** |
| Iluminacao ambiente / darkness | parcial (`shadowOpacity` global) | **F6** |
| Tempo real (socket) | polling 4s | **F7** |
| Desenhos, pins/notas, rotacao, elevacao, multi-select, teclado | nao | **F8** |
| Hex grid, audio, video, journal, animacoes, modulos | — | fora de escopo |

## 3. Decisoes tecnicas (valem para todas as fases)

- **Canvas 2D proprio continua** — sem PixiJS/lib externa; nossos mapas sao leves
  e o projeto evita CDN/vendor pesado.
- **Geometria pura vai para `frontend/src/domain/map/`** (novo modulo), com testes
  vitest — mesmo padrao de `domain/movement`: a page so desenha.
- **Migracoes**: padrao do `backend/db.py` (`CREATE TABLE IF NOT EXISTS` +
  `PRAGMA table_info` → `ALTER TABLE ADD COLUMN`).
- **Permissoes**: reutilizar `can_edit_campaign_map` / `owner_username`. Nada de
  novo modelo de papel. A mesa, porem, exige membership aceito: `public` serve
  para descobrir/entrar na campanha, nunca para ler ou interagir no mapa. A
  criacao de campanha insere o criador como membro GM; usar o mapa exige
  `campaign_members`, inclusive para contas GM (admin operacional e excecao
  explicita, nunca um bypass acidental de `public`).
- **Polling continua ate F7** — F1–F6 precisam funcionar com polling de 4s
  (estado efemero vive no banco com TTL curto e limpeza lazy).
- **Corrida read-modify-write**: pintura de terreno continua com a fila do
  cliente (`terrainQueue`) e uma mutacao por celula; walls, lights e templates
  sao documentos/revisoes de cena, nao listas last-write-wins.
- **Sanitizacao**: labels/strings novas passam pela storage boundary existente
  (control chars ja sanitizados la).
- **Revisao de cena**: walls, lights e demais documentos de cena usam
  `scene.revision` + `expectedRevision`; nao sao listas last-write-wins. Cada
  entidade persistida tem `id` estavel. Isso evita que uma aba antiga reverta
  uma porta/luz que acabou de mudar.
- **Web first**: o produto e web de mesa. Pointer/teclado e layout responsivo
  sao a base; touch completo nao e criterio das F1--F7, mas eventos novos usam
  Pointer Events, nao handlers exclusivos de mouse.

---

## 4. Arquitetura multi-sistema (requisito de produto)

Campanhas futuras terao sistemas diferentes (zombies, sistema original, D&D,
etc.). O mapa e **nucleo reutilizavel**; regra de jogo e **plugin**. Nada de
CPR hardcoded em codigo novo do mapa.

### Nucleo generico (nao sabe qual sistema roda)

- Canvas, camera, cenas, fundos, grid, uploads, permissoes, sync (polling/SSE).
- Tokens: posicao, imagem, tamanho, dono, visibilidade, barras genericas
  (`hp/hpMax` ja e generico o bastante — "recurso principal").
- Fog/reveals, walls/LoS, luzes, pings, templates — armazenamento e geometria
  internos em celulas/pixels; **toda exibicao e regra roda em unidades do
  sistema** (metros no CPR, pes no D&D): regua, HUD, alcance de movimento,
  raio de visao, templates. A conversao unidade↔celula vem da config abaixo.

### Config por sistema (dados, nao codigo)

| Config | CPR (default atual) | Exemplo outro sistema |
| --- | --- | --- |
| `unitsPerCell` + `unitLabel` | 2 "m" | D&D: 5 "ft" |
| Multiplicador terreno dificil | 2x | zombies: 1x (sem regra) |
| Multiplicador run/dash | 2x | D&D dash: 2x |
| Tema visual | gold/teal cyberpunk | paleta por tema da campanha |

Tema = as CSS variables que `campaign-map.html` ja usa (`--gold`, `--teal`,
`--bg`...) viram preset carregado do tema da campanha; cor de grid e presets de
token junto.

O sistema e imutavel depois da criacao da campanha. A migracao introduz
`campaigns.system` (default `cpr`) e `campaigns.theme`, mas o formulario de
edicao nao troca `system`: uma mesa D&D/zombies e seus documentos de mapa nao
sao reinterpretados no meio da campanha. O valor seleciona somente adapters e
presets registrados no cliente/servidor, nunca codigo fornecido pelo banco.

### Visibilidade e fog (decisao de produto)

Seguir o modelo do Foundry, separando o que esta visivel agora do que ja foi
explorado:

- `visibleNow` e calculado para o usuario e os tokens que ele controla. Nao e
  compartilhado: se o grupo se separa, cada jogador ve apenas a sala que seu
  token consegue perceber agora.
- `explorationMode` por cena tera `shared` (default CPR) e `individual`. F2a
  entrega somente `shared`, reaproveitando os reveals atuais; `individual` e
  F2c adiada, pois exige exploracao persistida por `username`. Em ambos, a area
  explorada mas fora de `visibleNow` fica escura/dim: o mapa e conhecido, mas
  nao ha visao de acontecimentos atuais, tokens ou mudancas ali.
- O `map_state` e uma projecao server-side por audiencia, nunca o dump bruto da
  cena: membership e campos privados sao aplicados em Python. `visible:false`
  e segredo real do GM e e suprimido por inteiro para nao-GM, nem como
  `obscured`. Tokens nao-secretos fora da visao atual podem chegar redatados
  para composicao visual, sem nome, imagem, HP, conditions ou detalhes vivos.
  O navegador deriva `visibleNow` e `explored` a partir desse estado autorizado;
  isso e obscurecimento visual, nao promessa de segredo contra quem inspeciona
  o proprio cliente.
- A barra generica ganha `primaryResourceVisibility: gm|owner|party`; tokens de
  personagem usam `party` por default, e o GM pode ocultar a barra por token.
  NPCs nao expoem recurso/conditions a jogadores salvo opt-in explicito.

Walls e luz afetam somente `visibleNow`. Exploracao persistida nao e apagada por
uma parede criada depois; ela permanece como geografia escura, enquanto a linha
de visao atual e os tokens vivos continuam bloqueados.

### Alinhamento com CPR (sistema atual) — regras de movimento RAW

Estado do alinhamento metros↔regras hoje:

| Regra CPR RAW | Status |
| --- | --- |
| 1 celula = 2 m/yds (`GRID_METERS_PER_CELL`, `domain/movement`) | ✓ implementado |
| Movement Action = MOVE celulas (MOVE x 2m) — overlay de alcance no token selecionado | ✓ |
| Run = Acao Principal por Movement Action extra → dobra distancia do turno (toggle Run) | ✓ |
| Terreno dificil = 2m gastos por 1m percorrido (pintura por celula + custo na regua) | ✓ |
| Regua mostra quadrados **e metros**, com custo de terreno | ✓ |
| HUD de MOVE mostra quadrados **e metros** efetivos | ✓ ajustado 2026-07-09 |
| Visao de token em unidades do sistema | ✗ GAP — hoje em **pixels** (0–2000); migrar para metros na F5 (mudar o grid px nao pode mudar o alcance de visao) |
| Templates em unidades (granada RAW: raio 10 m/yds = 5 celulas) | F3 ja nasce assim |

### Adapter por sistema (codigo, interface estreita)

`frontend/src/domain/map/systemAdapter.ts` — o mapa so chama hooks:

- `tokenBadges(token, character)` → icones/aneis no token (CPR: wound state +
  conditions; zombies: infeccao; D&D: death saves).
- `moveRange(token, character)` → celulas (CPR: `effectiveMoveStat`; D&D:
  speed/5).
- `measurementPolicy` → unidades, regra diagonal e conversao de uma regua de
  distancia (nao custo de movimento).
- `onMeasureBetweenTokens(ctx)` → comando opcional (CPR: F4 rangeMeters→DV;
  sistema sem range table: nada). O hook retorna uma intencao tipada; a page
  nao importa o motor de combate diretamente.

Dados, ataques, fichas, dados de rolagem ficam nos domain modules de cada
sistema — o mapa nunca importa `domain/combat` direto, so via adapter.

### Persistencia

- `campaigns.system` (TEXT, default `'cpr'`) + `campaigns.theme` — migracao
  simples no padrao do db.py, quando a primeira feature precisar.
- Tabelas do mapa guardam so o generico; nenhuma coluna de regra.

### Regra de implementacao

Seam entra **quando a fase toca nela** — nao reescrever o que funciona antes:

- F1 (pings) ja e 100% generico. ✓
- F2b nasce como primeiro uso de `tokenBadges` (adapter CPR e o primeiro).
- F4 nasce como `onMeasureBetweenTokens` (adapter CPR implementa).
- `domain/movement` parametriza em F2b/F3: `GRID_METERS_PER_CELL` e o custo 2:1
  de terreno viram config de sistema com default CPR (assinaturas ja aceitam
  parametro em varios pontos).
- A regua de distancia e um modulo separado de `movement`: como no Foundry,
  medir distancia e medir custo de arrastar token sao operacoes diferentes.
  O adapter CPR usa grade quadrada equidistante (diagonal = 1 celula) como
  convencao default da mesa, nao como CPR RAW; usa distancia centro-a-centro
  para F4 enquanto tokens ocupam uma celula e nunca considera terreno dificil
  para alcance de arma. Quando houver tokens multi-celula, o adapter troca essa
  regra por borda de espaco ocupado sem alterar a regua base.

## 5. Fases

### F1 — Pings (interacao basica de mesa) — CONCLUIDA 2026-07-09

Objetivo: qualquer membro marca um ponto; todos veem em ate 4s (1 ciclo de
polling). O gesto canonico desejado e Alt+click, como a mesa Foundry; o
duplo-clique ja entregue em F1 fica como compatibilidade ate o ajuste de UX e
nunca deve disparar apos arrastar/editar uma ferramenta.

- Backend:
  - Tabela `campaign_map_pings(id, campaign_id, scene_id, username, x, y, color, created_at)`.
  - `add_ping()` no repo; limpeza lazy (DELETE pings > 60s ao inserir).
  - `map_state()` retorna pings dos ultimos ~10s.
  - Rota POST `/campaign-maps/:id/ping` — **qualquer membro** (sem check de GM).
- Frontend:
  - Duplo-clique no canvas envia ping (qualquer tool ativa).
  - Animacao: aneis expandindo ~3s + nome do autor; cor derivada do usuario.
  - Pings novos vindos do polling animam ao chegar (dedupe por id).
- Criterios: player ve ping do GM sem reload; ping some sozinho; sem botao novo
  na UI (dblclick + hint).

### F2a — Contrato de mesa: membership, audiencia e fog compartilhado — CONCLUIDA 2026-07-09

Objetivo: fechar o contrato seguro/minimo do mapa antes de expor novos dados de
ficha. F2a nao cria badges nem fog individual.

- Backend: rota exige membership aceito; `public` nao da acesso ao estado da
  mesa. `map_state()` vira projecao de audiencia e suprime por completo tokens
  `visible:false` para nao-GM. O estado compartilhado de exploracao continua nos
  reveals existentes, sem tabela por usuario nesta entrega.
- Frontend: antes de F5, o cliente deriva `visibleNow` por visao circular e
  mostra `explored` compartilhado como mapa dim. O servidor nao calcula nem
  declara o poligono fino de LoS.
- Criterios: usuario nao-membro recebe negacao; token GM-secreto nao existe no
  payload do jogador; area explorada e visao atual tem renderizacao distinta.

### F2b — Adapter CPR, recursos e badges de condicao — CONCLUIDA 2026-07-09

Objetivo: entregar o payoff visivel sobre o contrato de F2a. A page chama
`tokenBadges()` do adapter CPR, que usa `domain/conditions` + wound state; junto
`domain/movement` passa a receber `unitsPerCell`/multiplicadores configuraveis,
com default CPR.

- Backend: badges/recursos de personagens do grupo usam o contrato de F2a e
  `primaryResourceVisibility` (`party` por default). Para jogadores, details
  so sao desenhados em `visibleNow`; para NPCs, `woundState`/`conditions` nao
  sao enviados a nao-GM nesta fase. O cliente deriva o estado de visao, portanto
  nao se tenta fingir que Python validou LoS fino.
- Frontend: badges no arco inferior do token; anel muda de cor por wound state
  (estender o HP ring atual); tooltip/HUD no hover ou selecao.
- Criterios: condicao aplicada na ficha aparece no mapa em ≤4s; NPC/condicao
  fora da audiencia nao aparece no payload; barra respeita a flag de recurso.

### F2c — Fog individual — CONCLUIDA 2026-07-09

Objetivo: acrescentar o modo Foundry `individual` sem reinterpretar os reveals
compartilhados. Requer tabela de exploracao por cena + `username` e regras de
migracao/limpeza; so entra quando houver necessidade real de explorar salas
separadas sem compartilhar o historico.

### F3 — Templates de area (AoE) — CONCLUIDA 2026-07-09 (sem verificacao no browser)

Objetivo: os quatro primitives do Foundry — circulo, cone, retangulo e raio
(`line` antigo) — com preview local, documento de cena apos soltar e celulas
afetadas na grade. Uso tipico: granada (RAW: raio 10m/yds = 5 celulas), cone de
shotgun/flamethrower, raio e area retangular.

- Backend: tabela `campaign_map_templates(id, campaign_id, scene_id, kind
  circle|cone|rectangle|ray, x, y, direction_deg, distance_units, angle_deg,
  width_units, color, label, hidden, lifecycle, expires_at, owner_username,
  created_at, updated_at)`. Origem e direcao sao canonicas; limites, grid snap e
  identificadores sao validados no servidor. Rotas operam um documento por vez:
  GM edita/apaga qualquer um; player edita/apaga os proprios.
- Frontend: `domain/map/templateEngine.ts` — celulas afetadas por cada forma
  sobre o grid (puro, testado). Tool "template" com kind selecionavel; render
  translucido + celulas destacadas; origem pode mover, cone/raio podem rotacionar
  e o template pode ficar oculto, como no Foundry.
- Ciclo de vida de F3: regua/preview e local; template generico colocado e
  `manual` persiste ate seu dono/GM apagar. Nao ha auto-target: o HUD lista
  apenas tokens da audiencia ja visivel do usuario. `untilResolved` so entra
  quando existir uma acao de area com ciclo de resolucao real; F4 nao o cria,
  pois uma regua para ataque unico nao e um template de area. `untilTurnEnd`
  fica para uma futura integracao deliberada com o combate/round.
- Criterios: geometria das celulas bate com testes; todos veem apenas o que sua
  audiencia permite; templates colocados em F3 persistem manualmente ate remocao.

### F4 — Regua → ataque (integracao combate) ⭐ diferencial — CONCLUIDA 2026-07-09

Objetivo: medir de um token-controlado ate outro token e abrir o cockpit de
combate com alvo e `rangeMeters` pre-preenchidos. Ao escolher uma arma com
tabela de alcance, a propria rolagem recebe o DV daquela banda. E o diferencial
de mapa + engine na mesma casa, sem tornar o canvas dono de regras de arma.

#### Decisoes de escopo (F4a)

- O primeiro corte funciona **somente com combate ativo**. E o unico estado em
  que o player ja possui um card de combate para o qual o mapa pode voltar; fora
  de combate, a ferramenta R continua sendo apenas regua. Abrir combate livre
  para player e uma feature separada, nao um atalho escondido de F4.
- Os dois tokens precisam ter `characterId`. O token do alvo pode se chamar de
  qualquer coisa no mapa, mas `targetCharacterId` e necessario para preencher
  o seletor, dano e lesao critica do cockpit. Sem esse vinculo, a medida ainda
  aparece, mas nao oferece "usar no ataque".
- F4 nao cria `untilResolved`, nao auto-aplica dano, nao escolhe arma e nao
  altera posicao, fog, turno ou estado persistido de combate. O usuario ainda
  escolhe arma e confirma a rolagem no cockpit.
- Nenhuma rota, tabela ou campo de mapa novo: a passagem entre as duas paginas
  e estado de UX local. Isso continua sendo protecao contra erro de mesa, nao
  autoridade contra um cliente modificado.

#### Contrato de medida (fonte unica de distancia)

- Criar `frontend/src/domain/map/measurementEngine.ts`, puro e testado. Para
  tokens de uma celula, ele mede centro-a-centro em grade quadrada
  equidistante: `cells = max(abs(dxCells), abs(dyCells))`; diagonal custa uma
  celula. Retorna `cells`, `units` e `rangeMeters` (CPR: 2 m/yds por celula),
  alem dos deltas para exibicao. Tokens multi-celula continuam fora de F4;
  quando existirem, o mesmo contrato troca somente a origem pela borda ocupada.
- `drawMeasure()` deixa de usar `segmentMovementCost()` como numero principal:
  esse modulo e correto para custo de **movimento**, mas inclui terreno dificil.
  A regua de distancia usa `measurementEngine`; o custo de terreno permanece
  apenas como linha secundaria quando a medida comeca/termina em pontos livres.
- Ao iniciar a ferramenta R sobre um token controlado, a origem trava no centro
  dele. Ao soltar sobre outro token autorizado, o destino tambem trava no centro
  dele e a HUD mostra `Nq // Nm // ALVO <nome>`. Arrastar de/para espaco vazio,
  para o mesmo token, ou cancelar preserva a regua normal e nunca cria intencao.
- `measurementPolicy` e `onMeasureBetweenTokens(ctx)` entram em
  `frontend/src/domain/map/systemAdapter.ts`. A page entrega somente tokens,
  medida e contexto de audiencia; o adapter retorna uma intencao tipada ou
  `null`. O adapter CPR converte para metros; adapters sem ataque por alcance
  retornam `null`. A page nao importa `domain/combat`.

#### Handoff mapa → cockpit

- A intencao e um envelope versionado, unico e efemero em
  `sessionStorage` (`limiar.mapAttackIntent.v1`):
  `{campaignId, sceneId, attackerTokenId, attackerCharacterId, targetTokenId,
  targetCharacterId, targetName, cells, rangeMeters, createdAt}`. Nao inclui
  arma, DV, HP, condicoes, token inteiro ou dados que o mapa nao autorizou.
- O botao explicito **USAR NO ATAQUE** aparece na HUD somente para essa medida
  valida. Ele grava o envelope e navega para `/?mapAttack=1`; o bootstrap do
  app raiz le a flag, abre o cockpit e remove a flag da URL. `sessionStorage`
  e consumido uma unica vez, expira em 10 minutos e e apagado em cancelamento,
  erro de hidratacao ou apos a rolagem.
- Na hidratacao, o cockpit busca novamente `campaignMaps.get(campaignId)` e
  rejeita o envelope se a cena/tokens nao existem mais, os `characterId`s nao
  batem, o atacante nao e controlado pelo usuario (salvo GM), o alvo nao esta
  em `visibleNow`, ou o atacante nao e o combatente do turno. Essa segunda
  leitura evita usar uma medida obsoleta apos polling/movimento; continua sendo
  uma guarda client-side enquanto rolagens nao forem autoritativas no servidor.

#### Contexto no combate e DV

- Depois de validado, o app seleciona `combatTargets[attackerCharacterId] =
  targetCharacterId`, foca o card do atacante e guarda um `mapAttackContext`
  transitorio **por atacante**. Ele nao deve reutilizar o `attackContext`
  global de cover/aimed shot, para que uma medida de um personagem nao vaze para
  outro.
- Extrair de `combatAttackEngine` um helper puro/exportado que recebe
  `weapon.rangeTable` + `rangeMeters` e devolve `{rangeBand, dv}` ou `null`.
  O cockpit o chama quando renderiza cada arma: armas melee/brawling ou sem
  tabela seguem sem DV de range; arma fora de todas as bandas bloqueia a rolagem
  com explicacao, em vez de inventar DV.
- `rollCombatAttack()` relê e revalida o contexto antes de rolar. Para uma arma
  com banda valida, chama `component.roll({ check: true, dv, ... })`, inclui
  `RANGE Nm // <banda> // DV X` no label/breakdown e entrega ao GM o resultado
  ja marcado sucesso/falha. O mesmo helper alimenta `resolveAttackCheck`, para
  que UI e engine nao possam divergir. A rolagem consome somente o contexto do
  atacante; cancelar ou trocar de alvo o limpa.

#### Testes e criterios de aceite

- Vitest de `measurementEngine`: horizontal, vertical, diagonal, mesma celula,
  grid invalido e conversao 2 m/celula. Um mapa com terreno dificil prova que a
  distancia e igual com ou sem o terreno, enquanto o custo de movimento segue
  maior.
- Vitest do adapter CPR e do helper de banda: adapter sem suporte retorna
  `null`; limites inferior/superior de cada faixa retornam o DV certo; lacuna
  ou arma sem tabela nao fabrica DV. Cobrir tambem a equivalencia com
  `resolveAttackCheck`.
- Testes de hidratacao/guardas com API falsa: envelope vencido, token removido,
  alvo oculto, atacante de outro player e turno errado sao descartados; um
  envelope valido preenche o alvo e somente o atacante correto.
- Prova manual no servidor real: medir entre dois tokens vinculados durante o
  turno, acionar **USAR NO ATAQUE**, escolher arma e ver a rolagem com metros,
  banda e DV. Repetir sobre terreno dificil (mesmo DV), fora da visao e fora do
  turno (sem rolagem). Reconstruir `dist/limiar-app.js` e
  `dist/campaign-map.js` antes da prova.

### F5 — Paredes, portas e linha de visao (fase pesada) — CONCLUIDA 2026-07-09

Objetivo: visao deixa de ser circulo puro; paredes bloqueiam (Foundry walls).

- Backend: paredes sao documentos de cena com `id` estavel,
  `{id,x1,y1,x2,y2,kind:wall|door,open}`; operacoes de criar/editar/apagar e
  `/door/toggle` carregam `expectedRevision` e incrementam `scene.revision`.
  Nao usar save cego de uma lista inteira.
- Frontend: `domain/map/visionEngine.ts` — poligono de visao por raycast contra
  segmentos (raios para endpoints ± epsilon, ordenar por angulo; interseccao
  com o circulo do raio de visao). Testes: quarto fechado, porta aberta/fechada,
  sem paredes = circulo.
  - Tool "parede" (GM): clique desenha cadeia de segmentos; porta e um segmento
    marcado; clique na porta alterna aberta/fechada.
  - O raycast/poligono de LoS permanece no cliente. O servidor continua somente
    a projecao de audiencia de F2a e nao duplica a geometria em Python; antes de
    F5 a aproximacao visual e circular, depois dela e o poligono do browser.
  - Nao mutar `vision` in-place: introduzir `vision_distance_units` e versao de
    unidade. O legado `vision`/reveals continua identificado como pixels de
    cena; a leitura converte somente a visao atual por
    `px = units / unitsPerCell * gridSize`. Reveals novos persistem a geometria
    explorada em coordenadas de cena, preservando-a se o grid mudar.
  - `clearVision()` passa a clipar pelo poligono. Cache do poligono por token,
    invalidado quando token/parede muda.
  - Reveals antigos continuam circulares em pixels (aproximacao aceita), mas
    nunca sao reinterpretados como metros. A exploracao permanece dim; somente
    `visibleNow` e tokens vivos usam o poligono atual de LoS.
- Criterios: token nao ve atraves de parede; porta aberta libera visao; GM
  continua vendo tudo (sombra fraca, como hoje).

### F6 — Iluminacao e escuridao — CONCLUIDA 2026-07-09

Objetivo: cena com `darkness` (0–1) + fontes de luz, distinguindo luz ambiente
(neon, LED, lampada) de luz anexada a token/efeito (lanterna, magia, poder).

- Backend: luz e documento/revisao de cena, com
  `{id,kind:ambient|token|effect,x,y,tokenId?,brightUnits,dimUnits,color,label,enabled}`;
  `darkness` continua na cena. Luz anexada acompanha seu token; ambiente e
  criada pelo GM, e uma luz de item/efeito so pode ser alternada pelo dono do
  token ou GM via adapter.
- Frontend: luz carva a escuridao e participa de `visibleNow`, mas nao explora
  fog sozinha nem revela tokens fora da LoS/deteccao do usuario. Com F5, luz e
  visao respeitam paredes; antes dele, ambas usam circulos. Area explorada sem
  visao atual permanece dim.
- Criterios: cena escura + lanterna/neon/efeito de luz funciona; raios usam
  unidades do sistema; F6 pode operar circularmente se F5 ainda nao tiver sido
  entregue.

### F7 — Tempo real (long-poll autenticado + fallback) — CONCLUIDA 2026-07-10

Objetivo: reduzir a latencia visual sem trocar a autenticacao Bearer por uma
conexao anonima. Polling de 4s continua como caminho de seguranca.

- `GET /campaign-maps/:id/updates?since=N` e long-poll autenticado por Bearer:
  o servidor reautoriza membership antes de aguardar ate 25s por uma versao de
  mapa maior. Cada mutacao de documento, token, fog, ping, template, parede ou
  luz incrementa a versao em memoria e acorda os clientes; reinicio do servidor
  e apenas um evento perdido, coberto pelo polling.
- O cliente usa `fetch` com o header existente e `AbortController` no unload.
  A notificacao nao transporta estado: invalida e refaz o GET autorizado. Erro,
  timeout ou indisponibilidade espera 1s e tenta de novo, enquanto o polling de
  4s permanece ativo. Nao usar `EventSource`, que nao envia esse header.

### F8 — QoL (menu pos-nucleo, escolher a gosto) ✓ CONCLUIDA (2026-07-10)

- Setas movem token selecionado 1 celula (snap), Esc limpa selecao, atalhos de tool.
- Rotacao/facing e elevacao de token.
- Desenho livre do GM (polylines por cena) + texto.
- Pins/notas de cena (icone + texto, visibilidade GM/todos).
- Multi-selecao e mover em grupo (GM).

## 6. Ordem recomendada

**F1 → F2a → F2b → F3 → F4** = mapa "Foundry-lite" utilizavel em mesa com
diferencial proprio. **F2c** e opcional e nao bloqueia essa trilha. **F5 → F6
→ F7** = paridade real com Foundry. **F8** = menu.

## 7. Riscos e notas

- Reveals crescem sem limite por cena — se pesar, compactar (merge de circulos
  proximos). Fora de escopo por ora.
- `player-characters`: risco ja aceito (ver decisoes anteriores); F2 busca
  ficha no backend (server-side), nao expande o risco do cliente.
- Performance F5: raycast so recalcula em mudanca (cache por token); mapas da
  mesa sao pequenos (<200 segmentos esperados).
- Tudo offline/local — nenhuma dependencia externa nova em nenhuma fase.
