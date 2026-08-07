# Auditoria 2026-07-28 — problemas a acrescentar ao docs/ROADMAP.md

> Registro historico. Para o estado atual, consulte `docs/ROADMAP.md` e
> `docs/REPOSITORY-HEALTH.md`; varios achados abaixo foram resolvidos.

Pente fino no checkout atual (`main`, working tree sujo). Cada item abaixo foi
**verificado no servidor real** ou lido no codigo, com a evidencia registrada.
Blocos prontos para colar em `docs/ROADMAP.md` nas secoes 3, 5 e 10.

Servidor de teste usado nas provas: `HOST=127.0.0.1 PORT=8791 python3 server.py`.

---

## Bloco A — acrescentar a secao 3 (riscos de codigo abertos e confirmados)

Continuar a numeracao a partir de 10 (a lista atual tem dois itens `8`, o que
tambem precisa ser corrigido).

```markdown
10. **CRITICO — o servidor estatico expoe o repositorio inteiro sem
    autenticacao.** `BaseHandler.translate_path` confina o caminho em `ROOT`,
    mas `ROOT` e a raiz do projeto: `data/limiar.db`, `backend/*.py`, `.git/` e
    `uploads/` estao todos dentro dela, e `do_GET` entrega qualquer caminho fora
    de `/api/` direto pro `SimpleHTTPRequestHandler`, sem sessao. Verificado em
    2026-07-28 num servidor real: `GET /data/limiar.db` devolveu 200 e 794 KB —
    o banco inteiro. Reabrindo o arquivo baixado: 25 tabelas, hashes PBKDF2 de
    todos os usuarios e a tabela `sessions` com tokens vivos. Um token `admin`
    tirado dali (`expires_at` em 2026-08-19) foi usado direto em
    `GET /api/users` (200) e `GET /api/session`, que respondeu
    `{"authenticated": true, "role": "admin"}`. Ou seja: takeover completo de
    admin com um unico GET nao autenticado. `GET /.git/config` (200),
    `GET /backend/security.py` (200) e listagem de diretorio em `GET /uploads/`
    (200) confirmam que nao e um caso isolado do `.db`. `HOST` tem default
    `0.0.0.0`, entao isso vale pra rede local inteira desde o primeiro boot.

11. **Autenticacao e opt-in por handler, nao no dispatcher.** `do_GET` despacha o
    dict `exact` sem nenhum `require_login()`; cada handler decide sozinho se
    checa sessao. Verificado sem token em 2026-07-28: `/api/chat`,
    `/api/combat-state`, `/api/tarot-state`, `/api/hq`, `/api/items`,
    `/api/map` e `/api/nexus-challenge` respondem 200; so `/api/characters`,
    `/api/users` e `/api/campaigns` respondem 401. Em `do_POST`, `open_routes`
    libera `/api/chat` (201 sem token), `/api/nexus-result` (200 sem token) e
    `/api/combat-state/end-turn`. O default do sistema e "aberto", e cada rota
    nova precisa lembrar de se fechar.

12. **`/api/combat-state/end-turn` nao verifica dono nenhum.** O handler so
    compara `targetId` com o combatente da vez; nao ha `require_login`, nao ha
    checagem de que o requisitante e dono daquele combatente. Qualquer cliente
    na rede — logado ou nao — encerra o turno de quem estiver jogando. O
    `README.md` descreve essa rota como "o jogador encerra o proprio turno";
    hoje ela encerra o turno de qualquer um.

13. **Chat, combate, tarot e HQ sao globais, nao por campanha.** `combat-state`,
    `tarot-state`, `hqIp` e `nexusResult` sao chaves unicas na tabela
    `settings`, e `chat_messages` e uma tabela unica sem `campaign_id` — o
    proprio `campaign_sync.py` documenta isso ("chat_messages and combat-state
    are global ... so their mutations bump every campaign"). Duas campanhas no
    mesmo servidor compartilham o mesmo log de chat, o mesmo tracker de combate
    e o mesmo estado de tarot. O modelo de campanhas do produto so existe de
    fato no mapa e no roster.

14. **Persistencia de ficha e de combate e read-modify-write sem transacao nem
    revision.** `_post_character_notes` faz `get_record` -> merge -> `upsert_record`
    em duas conexoes separadas; `_post_combat_end_turn` faz `get_setting` ->
    calcula -> `set_setting` do mesmo jeito. O mapa tem `scene.revision` e
    `expectedRevision` (secao 7 do plano), mas ficha e combate nao tem nada:
    duas escritas concorrentes perdem uma silenciosamente. Contradiz a decisao
    transversal "persistencia que representa uma unica acao do usuario deve
    confirmar todas as gravacoes".

15. **`tailwind-sheet.css` e CSS gerado, fora do git e referenciado pelo HTML.**
    `Limiar OS.dc-2.html:28` faz `<link rel="stylesheet"
    href="./tailwind-sheet.css">`; o arquivo existe no working tree (25 KB
    minificados numa linha so), nao esta versionado e nao esta no `.gitignore`.
    `npm run build` passou a depender de `build:css` (`tailwindcss -i
    src/tailwind.css -o ../tailwind-sheet.css`), mas o gate de staleness do CI
    so cobre `dist/`. Num clone limpo o link vira 404 e a camada Tailwind
    inteira some; num clone com build, o arquivo gerado nunca e comparado com
    nada. `frontend/src/tailwind.css` e `frontend/tailwind.config.js` tambem
    estao sem versionar, entao hoje nem da pra regerar o CSS a partir de um
    clone.

16. **`http.ts` descarta o corpo de erro da API e nao trata 401.**
    `if (!res.ok) throw new Error('API ' + res.status + ' ' + path)` joga fora o
    envelope `{"error":{"code","message"}}` que o backend monta com cuidado em
    `write_error`. Nenhum consumidor distingue 403 de 409 de 422 a nao ser
    parseando string, e uma sessao expirada (401) nao redireciona pro login —
    ela vira um erro generico no meio da mesa.

17. **`ruff` acusa 333 erros e nao esta em nenhum gate.** O comentario do
    `.github/workflows/ci.yml` fala em "233 pre-existing findings"; a contagem
    real em 2026-07-28 e 333. O numero cresce sem freio porque nada o mede.

18. **Higiene do repositorio.** `dist/index.js` e `dist/index2.js` estao
    versionados e nenhum HTML os referencia (so `limiar-app.js`,
    `campaign-map.js` e `login.js` sao carregados). `graphify-out/` tem 43
    arquivos versionados e 6,3 MB de saida de ferramenta de analise dentro do
    repo do produto. `docs/screenshots/*.png` foi deletado no working tree
    enquanto o `README.md` continua apontando pras tres imagens. O working tree
    carrega uma migracao pro Tailwind pela metade misturada com o resto.

19. **Upload confia no `Content-Type` declarado pelo cliente.**
    `handle_upload` deriva a extensao do header da parte multipart, sem checar
    magic bytes: qualquer conteudo entra em `uploads/` com nome `.png`. Nao ha
    cota por usuario nem coleta de asset orfao — deletar o personagem/token nao
    remove a imagem. Mitigacao existente: o CSP `sandbox; default-src 'none'`
    em `/uploads/` e a exclusao deliberada de SVG.

20. **Limites de recurso do servidor.** `ThreadingHTTPServer` cria uma thread por
    request sem teto (so os waiters de long-poll tem cap, 64 em
    `campaign_sync.py`). `handle_upload` faz `self.rfile.read(length)` com
    `_MAX_UPLOAD_BYTES` de 64 MB — 64 MB em memoria por thread concorrente. Os
    dicts de rate limit em `security.py` crescem por IP e so podam quando aquele
    mesmo IP volta, e a chave e `client_address[0]`, entao atras de qualquer
    proxy a mesa inteira divide um balde so. `db()` abre uma conexao nova por
    chamada (com `mkdir` + `PRAGMA journal_mode=WAL` a cada request) e nunca
    chama `close()`.

21. **A secao 3 do plano tem dois itens numerados `8`**, e a secao 9 diz que a
    entrega ARQUITETURA 4C deixou `ui/views/combat.js` "sem suite automatizada".
    Existe `frontend/test/unit/ui/combat.test.js` com 841 linhas e 56 casos; o
    que ele nao cobre e especificamente `rollAndApplyMapAoe`,
    `requestSuppressiveFire` e `resolveSuppressiveFireBatch`. O texto do plano
    precisa dizer isso, senao a lacuna real fica invisivel.
```

---

## Bloco B — nova fase, a ser inserida entre CORRECAO e PROVA

A ordem da secao 8 vira: ALINHAMENTO, CORRECAO, **BLINDAGEM**, PROVA,
ARQUITETURA, MOTOR, MOBILE, RAW-COMBATE, CONTEUDO, AUTH E ROBUSTEZ.

Justificativa da posicao: a fase PROVA pede uma sessao real com duas contas.
Enquanto o item 10 estiver aberto, qualquer pessoa na mesma rede da mesa le o
banco inteiro e assume a conta do GM — nao da pra chamar de "prova" uma sessao
rodada nessas condicoes.

```markdown
### Fase 2.5 — BLINDAGEM

Objetivo: fechar a superficie de exposicao antes de rodar uma sessao real com
mais de uma maquina na rede.

#### B1. Servidor estatico com allowlist

- [ ] Substituir o `translate_path` que confina em `ROOT` por uma allowlist
      explicita de raizes servidas (`dist/`, `assets/`, `styles/`, `vendor/`,
      `games/`, `uploads/` e os tres HTML de entrada mais os CSS de topo).
- [ ] Devolver 404 para qualquer caminho fora da allowlist, incluindo `data/`,
      `backend/`, `frontend/`, `.git/`, `docs/` e dotfiles.
- [ ] Desligar a listagem de diretorio (`list_directory`) para toda rota.
- [ ] Testar `GET /data/limiar.db`, `/.git/config`, `/backend/config.py`,
      `/uploads/` e um path traversal codificado — todos 404.
- [ ] Rotacionar o banco de desenvolvimento: invalidar todas as sessoes
      existentes e trocar a senha do usuario `mestre` depois do fix, porque os
      tokens atuais ja circularam em claro pela rede local.
- [ ] Mudar o default de `HOST` para `127.0.0.1` e exigir opt-in explicito para
      escutar em `0.0.0.0`.

#### B2. Autenticacao fechada por padrao

- [ ] Inverter o dispatcher: `do_GET`/`do_POST`/`do_DELETE` chamam
      `require_login()` antes de resolver a rota, com um conjunto nomeado e
      pequeno de rotas publicas (`/api/health`, `/api/meta/*`, `/api/login`,
      `/api/register`, `/api/auth/google`, `/api/password-reset-requests`).
- [ ] Fechar `/api/chat` (GET e POST), `/api/combat-state`, `/api/tarot-state`,
      `/api/hq`, `/api/items`, `/api/map`, `/api/nexus-challenge` e
      `/api/nexus-result` atras de sessao.
- [ ] Adicionar checagem de dono em `/api/combat-state/end-turn`: `require_login`
      + o combatente da vez tem que estar vinculado ao usuario da sessao (ou ser
      staff).
- [ ] Escrever um teste que enumere todas as rotas registradas e falhe se
      alguma nao estiver na lista publica nem exigir sessao — assim rota nova
      nasce fechada.

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
```

---

## Bloco C — acrescentar a Fase 9 (AUTH E ROBUSTEZ)

```markdown
#### 9D. Erros e limites

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
```

---

## Bloco D — acrescentar a secao 5, Fase 1 (ALINHAMENTO) ou a uma fase HIGIENE

```markdown
- [ ] Estender o gate de staleness do CI a `tailwind-sheet.css` (hoje so cobre
      `dist/`), ou parar de versionar CSS gerado e gera-lo no boot.
- [ ] Versionar `frontend/src/tailwind.css` e `frontend/tailwind.config.js`, ou
      reverter a migracao Tailwind pela metade que esta no working tree.
- [ ] Remover `dist/index.js` e `dist/index2.js` (nenhum HTML os carrega) ou
      documentar quem os consome.
- [ ] Tirar `graphify-out/` do versionamento (43 arquivos, 6,3 MB de saida de
      ferramenta) e adicionar ao `.gitignore`.
- [ ] Restaurar `docs/screenshots/*.png` ou tirar a secao de screenshots do
      `README.md`, que hoje aponta pra tres imagens deletadas.
- [ ] Colocar `ruff check backend` no CI, com baseline congelada nos 333 erros
      atuais e proibicao de crescer.
- [ ] Corrigir a numeracao duplicada da secao 3 (dois itens `8`).
- [ ] Corrigir a nota da secao 9 sobre ARQUITETURA 4C: `ui/views/combat.js` tem
      suite (841 linhas, 56 casos); o que falta e cobertura de
      `rollAndApplyMapAoe`, `requestSuppressiveFire` e
      `resolveSuppressiveFireBatch`.
```

---

## Bloco E — acrescentar a secao 10 (backlog vivo de friccao)

```markdown
- 2026-07-28 | auditoria de superficie: `GET /data/limiar.db` sem auth devolve o
  banco inteiro, incluindo `sessions`; token admin extraido dali autenticou em
  `/api/users` e `/api/session` | BLINDAGEM B1 | aceite: allowlist de estaticos,
  404 pra `data/`/`backend/`/`.git/`, sessoes rotacionadas, `HOST` default
  `127.0.0.1`.
- 2026-07-28 | 7 rotas GET e 3 POST respondem sem sessao; auth e decidida dentro
  de cada handler | BLINDAGEM B2 | aceite: dispatcher fecha por padrao e um
  teste enumera rotas sem gate.
- 2026-07-28 | `end-turn` nao checa dono: qualquer cliente encerra o turno de
  qualquer combatente | BLINDAGEM B2 | aceite: `require_login` + vinculo do
  combatente com a sessao.
- 2026-07-28 | chat, combat-state, tarot-state e hqIp sao globais; duas
  campanhas dividem o mesmo estado | BLINDAGEM B3 | aceite: escopo por campanha
  com migracao e teste de duas campanhas.
- 2026-07-28 | ficha e combate fazem read-modify-write sem transacao nem
  revision | BLINDAGEM B4 | aceite: transacao unica + `expectedRevision` em
  personagem, 409 tratado no cliente.
- 2026-07-28 | `tailwind-sheet.css` gerado e sem versionar, referenciado pelo
  HTML; `tailwind.css`/`tailwind.config.js` tambem fora do git; gate de CI so
  cobre `dist/` | HIGIENE | aceite: fontes versionadas e gate estendido, ou CSS
  gerado no boot.
```

---

## O que a auditoria confirmou como solido

Registrado para o plano nao gastar fase corrigindo o que ja esta certo:

- As rotas de mapa (`campaign_maps.py`, 33 handlers) passam todas por
  `_campaign_map_session` — nenhuma escapa. E o subsistema mais bem fechado.
- `map_state()` projeta audiencia no servidor de verdade: o smoke de 2026-07-21
  provou token `visible:false` ausente e HP `resourceVisibility:gm` nulo pro
  player.
- Path traversal em si esta tratado (`resolve()` + checagem de `parents`); o
  problema e o tamanho da raiz permitida, nao o escape dela.
- Uploads sao servidos com `Content-Security-Policy: sandbox; default-src
  'none'` e SVG esta excluido do allowlist com comentario explicando por que.
- `_ALLOWED_TABLES` guarda todo nome de tabela que chega em f-string; nenhuma
  concatenacao de SQL com dado de usuario.
- PBKDF2-SHA256 com 260k iteracoes e `secrets.compare_digest`, com caminho de
  migracao do formato SHA-256 antigo.
- Sanitizacao de URL/atributo no `framework/index.js` cobre `javascript:`,
  `vbscript:` e `data:` fora de imagem.
- O gate de `dist/` no CI existe e funciona — o problema e so nao ter sido
  estendido ao CSS.
