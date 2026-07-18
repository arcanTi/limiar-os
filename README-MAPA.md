# README-MAPA.md — Auditoria real do motor de mapa + rota para nivel Foundry

Criado 2026-07-17. Fonte: auditoria AO VIVO no browser (servidor local, login GM
`mestre`, campanha `ts-verify-campaign`), cruzada com leitura do codigo
(`frontend/src/pages/campaign-map.js`, `backend/api/campaign_maps.py`,
`backend/repositories/campaign_maps.py`). Nada aqui e opiniao de plano: cada
item tem evidencia (comportamento observado, request de rede ou linha de
codigo).

Contexto: `PLANO-MAPA-FOUNDRY.md` marca F1–F8 como concluidas. A auditoria
mostra que o NUCLEO de dados/rotas e real e solido, mas a CAMADA DE
EXPERIENCIA tem bugs graves e ergonomia muito aquem do Foundry. E exatamente a
sensacao relatada na mesa: "generico e nao faz as coisas direito". Este
documento separa o que e verdade tecnica do que precisa ser reconstruido, e
define o mapa de melhorias.

---

## 1. O que funciona OK (verificado em execucao)

| Area | Evidencia |
| --- | --- |
| Abrir mesa por campanha (`campaign-map.html?campaign=ID`) com Bearer auth | pagina carrega, sessao validada |
| Cena: fundo por upload/URL, fit, grid, dimensoes, salvar/ativar | imagem 200 OK, form persiste |
| Seleção de token por clique no canvas | HUD atualiza, anel de selecao, form sincroniza |
| Overlay de MOVE do token selecionado | `MOVE 6q = 12m` correto (RAW 2m/celula), anel tracejado no raio certo |
| Drag de token → persistencia | `POST /token/move → 200` + bump de versao |
| Ping por duplo-clique | `POST /ping → 201`, animacao local, TTL ~10s no estado |
| Long-poll tempo real (F7) | `GET /updates?since=N` segura ate 25s; cada mutacao (ping/move) incrementa versao e acorda clientes; fallback polling 4s ativo. Implementacao do wait/notify correta (`repositories/campaign_maps.py`, `threading.Condition`) |
| Lista de tokens no painel (kind, visao, remover) | render ok |
| Centralizar camera no token | funciona |
| Encaixar (fit) manual | funciona (recupera do estado quebrado do load) |
| Projecao por audiencia no backend | rotas exigem membership; payload GM tem `canEdit` |

Leitura honesta: o BACKEND do mapa e o dominio puro (movement, measurement,
template, vision engines com vitest) estao acima da media. O problema esta
concentrado na page do canvas (render + interacao + UX).

## 2. O que esta QUEBRADO (bugs, com causa e status pos-Onda 0)

Onda 0 (2026-07-17) tratou os 6 itens abaixo. Dois eram bugs reais e foram
corrigidos; **dois eram falso-positivo da auditoria original** — a mesma
disciplina de "verificar antes de afirmar" que uso pra julgar memoria antiga
foi aplicada aqui, contra o proprio README. Reportar isso e mais importante
que proteger o diagnostico anterior.

### B1 — Fog APAGA o mapa em vez de revelar — ✓ CORRIGIDO 2026-07-17

Causa confirmada: `drawShadow()`/`clearVision()` pintavam a sombra e faziam o
`destination-out` de recorte de visao NO MESMO canvas de tudo — apagando os
PIXELS DO MAPA E DOS TOKENS, nao so a sombra. Fix: `drawShadow` agora pinta e
recorta num `shadowCanvas` OFFSCREEN dedicado (mesmo tamanho da cena em
pixels), e so entao compoe sobre o canvas principal com um unico `drawImage`.
`polygonPath`/`clearVision` ganharam um `targetCtx` opcional pra servir tanto
o canvas principal (usado por `drawLights`, inalterado) quanto o offscreen.
Verificado ao vivo: a mancha preta sumiu por completo; GM ve o mapa e os
tokens sob a area de visao com sombra fraca (~12% alpha), exatamente a
intencao original. Vista do player nao re-confirmada nesta sessao (exige
segundo login) mas o mecanismo do bug era simetrico entre papeis — a
correcao se aplica igual aos dois.

### B2 — Primeiro load caindo em zoom 5% — guarda defensiva aplicada, bug NAO reproduzido

A auditoria original observou zoom 5% uma vez. Nesta sessao, 3 reloads
limpos consecutivos da mesma cena sempre abriram em 52% (o fit correto) —
nao reproduziu. Pode ter sido um fluke do cold-start da aba de automacao, nao
um bug deterministico do app. Apliquei mesmo assim uma guarda barata e sem
risco: `fitView()` agora rejeita um rect com `width`/`height` < 50px e tenta
de novo no proximo frame (`requestAnimationFrame`) em vez de commitar um fit
degenerado. Se o race era real, isso resolve; se nao era, e uma rede de
seguranca inofensiva. Nao reivindico "confirmado corrigido" aqui.

### B3 — Painel lateral sem scroll — **FALSO POSITIVO, nao e bug**

A auditoria original mediu `overflow-y` do elemento `.side` (o wrapper
externo, `hidden`) e concluiu que a lista de tokens era inacessivel. Mas
`.panel.active` (o FILHO que realmente contem o conteudo) tem `overflow:auto`
proprio — scroll aninhado normal, sem conflito com o `hidden` do pai.
Reverificado ao vivo: `panel.scrollTop=9999` move a lista corretamente para
dentro do viewport (`listTop` saiu de 713 or, fora da tela, para 549, dentro).
Nenhuma mudanca de CSS foi feita — nao havia o que corrigir.

### B4 — Teclado (F8) nao move token — **FALSO POSITIVO, nao e bug**

A auditoria original testou a seta sem confirmar que um token estava de fato
selecionado primeiro (o clique pode ter errado o alvo no canvas). Reverificado
ao vivo desta vez com confirmacao explicita de selecao (classe `active` na
linha do token na lista) antes de apertar a tecla: `ArrowRight` moveu o token
exatamente 1 celula (800→864 px, grid=64px), com `POST /token/move`
disparado e persistido no backend. O codigo sempre funcionou; a doc antiga
media um sintoma de teste malfeito, nao do produto.

### B5 — Reveals fantasmas de tokens deletados — ✓ CORRIGIDO 2026-07-17

Causa confirmada no backend: `delete_token()`
(`backend/repositories/campaign_maps.py`) so apagava a linha de
`campaign_map_tokens`, nunca as linhas de `campaign_map_reveals` /
`campaign_map_reveals_personal` que referenciam aquele `token_id` — a
exploracao de um token deletado ficava clareando fog pra sempre, sem nenhum
dono capaz de ve-la ou limpa-la. Fix: `delete_token` agora tambem apaga os
reveals (ambas as tabelas) daquele token, dentro da mesma transacao. Testado
em `backend/tests/test_campaign_maps.py` (2 testes novos, GC + no-op quando
token nao existe); suite completa 55/55.

### B6 — Re-render por poll destroi interacao em andamento — nao reverificado, prioridade rebaixada

Nao testado nesta rodada. O mecanismo (`loadSoft()` rebuild de `innerHTML` a
cada 4s) e real no codigo, mas dado que B3 e B4 da mesma auditoria eram
falso-positivo, a severidade pratica deste item fica em duvida ate reproduzir
com um teste dirigido (ex.: clicar um botao da lista no exato instante de um
poll e confirmar perda de clique). Fica para quando a Onda 1 tocar essas
listas de qualquer forma (HUD no token substituindo boa parte do formulario).

## 3. O que esta AQUEM do padrao Foundry (funciona, mas nao compete)

| # | Gap | Foundry faz | Nosso estado |
| --- | --- | --- | --- |
| A1 | Manipulacao direta | HUD contextual no token (HP, status, abrir ficha), right-click menu, drag com ghost/medida ao vivo | tudo por FORMULARIO no painel lateral; context menu bloqueado (`contextmenu` preventDefault sem menu proprio) |
| A2 | Toolbar | icones com tooltip, estados claros | letras cruas M P R A W L O T D N; tool ativa so aparece como texto no HUD |
| A3 | Feedback de movimento | animacao de deslocamento, ghost da posicao original, regua durante o drag | teleporte seco; sem custo de movimento durante drag |
| A4 | Grid | contraste adaptativo, tipos (square/hex) | linhas `rgba(...,0.14)` praticamente invisiveis sobre mapa escuro em zoom <100% |
| A5 | Zoom | suave, centrado no cursor, limites sensatos, minimap opcional | wheel centrado ok, mas botoes +/- em passo fixo aditivo; sem animacao; clamp 5%–500% |
| A6 | Input | Pointer Events, touch, pinch | SO mouse events (`mousedown/mousemove/mouseup/dblclick`) — decisao do plano ("eventos novos usam Pointer Events") NAO cumprida; touch morto; dblclick nao existe em touch |
| A7 | Criacao de token | arrastar da sidebar/compendio, nome auto-incrementado, vinculo com ator | form manual cria "Token"/"Token" identicos, `characterId null`; "tokens das fichas" existe mas o fluxo padrao e o generico |
| A8 | Dialogos | sheets/janelas proprias | `prompt()` nativo do browser para cena nova e pins |
| A9 | Visual do canvas | iluminacao com blend modes, bordas suaves, animacoes de ping/aoe polidas | flat; ping ok, resto estatico |
| A10 | Sessao do player | mesma pagina, permissao granular, tudo testado | player view NAO auditada nesta sessao (precisa segunda conta) — riscos de B1 la sao piores |

## 4. Nao verificado nesta auditoria (pendente, sem veredito)

Walls/portas (desenho + toggle + LoS), luzes (F6), templates AoE (F3, desenho
e geometria), terreno dificil (pintura), desenho livre, pins, multi-select,
regua→ataque F4 fim-a-fim (exige combate ativo + 2 tokens com `characterId`),
fog individual (F2c), sync fichas→tokens, upload de imagem, comportamento
multi-aba em tempo real (arquitetura verificada; UX visual nao), atalhos de
tool por tecla. Estes itens entram na M1 do `PLANO-MAPA-2.md` como checklist
de prova restante.

## 5. Mapa de melhorias — rumo a "melhor motor de mesa do mercado"

Principio: nao e adicionar feature nova — e RECONSTRUIR a camada de
experiencia sobre o nucleo de dados que ja esta certo. Ondas ordenadas;
cada onda tem criterio de saida mensuravel. As fases M2+ do `PLANO-MAPA-2.md`
(combate vivo, sync unificado, AoE resolve) continuam validas e entram DEPOIS
da Onda 1 — nao adianta integrar combate num canvas que apaga o mapa.

### Onda 0 — Consertar o que mente (bugs B1–B6) ✓ CONCLUIDA 2026-07-17

1. B1 fog: ✓ camada offscreen (`shadowCanvas`), composta por `drawImage`.
   Verificado ao vivo — mancha preta eliminada.
2. B2 fitView: ✓ guarda defensiva (rAF retry se rect < 50px); bug original
   nao reproduziu em 3 tentativas, entao isso e rede de seguranca, nao uma
   correcao confirmada de um bug reproduzido.
3. B3 painel: **nao era bug** — `.panel.active` ja tinha `overflow:auto`
   proprio; scroll funciona. Nenhuma mudanca de CSS feita.
4. B4 teclado: **nao era bug** — selecionar de verdade + apertar seta move o
   token e persiste (`POST /token/move`), verificado ao vivo.
5. B5 reveals: ✓ GC na delecao de token (`delete_token` apaga reveals do
   token, ambas as tabelas); 2 testes novos em
   `backend/tests/test_campaign_maps.py`.
6. B6 listas: nao reverificado — rebaixado, ver secao 2.

Saida real: 2 bugs de verdade corrigidos e testados (B1, B5); 2 suspeitas do
relatorio anterior descartadas por verificacao ao vivo (B3, B4); 1 guarda
defensiva sem bug confirmado (B2); 1 item que precisa reproducao dirigida
antes de virar trabalho (B6). Backend 55/55, frontend 565/565.

### Onda 1 — Sentir Foundry (direct manipulation)

1. Token HUD: selecionar token mostra mini-HUD ancorado (HP editavel inline,
   badges de condicao clicaveis, botao ficha/cockpit) — substitui o
   formulario como caminho PRIMARIO; o form vira "avancado".
2. Context menu proprio (right-click / long-press futuro) no token/cena.
3. Drag rico: ghost na origem, linha + custo em q/m ao vivo (reusar
   `segmentMovementCost`), snap highlight da celula alvo, animacao curta de
   assentamento (~120ms).
4. Toolbar com icones + tooltip + atalho visivel; estado ativo obvio.
5. Grid com contraste adaptativo (cor/alpha em funcao do fundo e zoom).
6. Zoom suave (lerp) para cursor tambem nos botoes; presets (1:1, fit).
7. Nome auto-incrementado na criacao ("Guarda 1", "Guarda 2"); criacao
   arrastando da lista de fichas para o canvas.
8. Substituir prompt() por dialogos proprios.

Saida: teste cego com 1 GM acostumado a Foundry consegue montar e rodar um
encontro sem abrir o painel lateral.

### Onda 2 — Pipeline de render em camadas (fundacao de performance/visual)

Reescrever `draw()` monolitico em camadas com dirty-flags, todas offscreen e
compostas por frame (so as sujas re-renderizam):

```
background (imagem+grid, muda raro)
terrain/drawings/templates (muda em edicao)
tokens (muda em drag/estado)
lighting (radial gradients, blend)
fog/vision (poligonos, propria camada — resolve B1 estruturalmente)
overlay (selecao, regua, pings, HUD do canvas)
```

- Cache do poligono de visao por token (ja previsto no plano 1, cobrar aqui).
- rAF unico com orcamento: interacao nunca abaixo de 60fps em cena tipica
  (medir com Performance API; criterio: p95 frame < 16ms com 30 tokens,
  20 paredes, 10 luzes).
- Prepara luz colorida/blend modes estilo Foundry sem custo por frame.

### Onda 3 — Input universal

- Migrar TODA interacao do canvas para Pointer Events + `setPointerCapture`
  (cumpre a decisao registrada no plano 1).
- Touch: pan 1 dedo (tool pan)/2 dedos, pinch zoom, long-press = context
  menu, sem dependencia de dblclick (ping vira botao/gesto proprio).
- Cursores por ferramenta; hover states.

### Onda 4 — Integracao de mesa (ja planejada)

Executar M2 (combate vivo no token), M3 (sync unificado), M4 (AoE resolve)
do `PLANO-MAPA-2.md` sobre a base corrigida. A regua→ataque (F4) e o
diferencial competitivo real sobre Foundry — ela merece a base nova.

### Criterios "melhor do mercado" (regua permanente)

- Zero cliques mortos; toda acao tem feedback em <100ms.
- Fog correto nos DOIS papeis (GM sombra fraca; player explorado dim +
  visivel claro) — teste automatizado de pixel em cena sintetica.
- p95 de frame <16ms na cena de referencia.
- Fluxo principal do GM inteiro sem painel lateral.
- Touch funcional em tablet (player mode).
- Tudo offline/local, zero dependencia externa nova (mantido).

## 6. Ordem de execucao e amarração com os planos

1. Onda 0 (B1–B6) — e pre-requisito de QUALQUER outra coisa.
2. Restante da prova M1 (secao 4 acima) — com fog consertado, auditar walls/
   luz/templates/player view fica possivel de fato.
3. Onda 1 → Onda 2 → Onda 3 (UX antes de motor, motor antes de touch).
4. Onda 4 = M2/M3/M4 do PLANO-MAPA-2.

`PLANO-MAPA-2.md` segue sendo o plano de INTEGRACAO (combate/sync/conteudo);
este README e o plano de QUALIDADE DO MOTOR. M1 daquele plano fica absorvida
assim: prova tecnica → secao 4 daqui; correcoes → Onda 0; UX de entrada →
Onda 1.
