# Avaliação de integridade — 2026-07-28

> Registro historico. Para metricas e nota atuais, consulte
> `docs/REPOSITORY-HEALTH.md`.

Medições sobre o commit `e4f92bb`. Tudo aqui foi medido com ferramenta ou
servidor real; onde há julgamento, ele está marcado como tal e separado do
número que o sustenta.

| Eixo | Nota | Resumo de uma linha |
| --- | --- | --- |
| Qualidade de código | **B** | Núcleo tipado e disciplinado; metade do `src` fora do type-check e 5 arquivos-deus |
| Integridade da aplicação | **B−** | Sobe limpa e sem vazamento; integridade referencial declarada mas não aplicada |
| Testes unitários | **C+** | 859 casos reais, mas o gate de cobertura mede 6,5% do frontend e reporta 92% |
| Testes de aceitação | **D** | Zero automação; a garantia é 23 smokes manuais que não repetem sozinhos |

---

## 1. Qualidade de código — B

### O que está forte

**Disciplina de tipos no que é TypeScript.** Medido em `frontend/src`:

| Métrica | Valor |
| --- | --- |
| `: any` explícito | **0** |
| `as any` | **0** |
| `@ts-ignore` / `@ts-expect-error` | **0** |
| `unknown` (a alternativa correta) | 567 |
| `strict` no tsconfig | `true` |

Zero `any` em 11 mil linhas de TS não acontece por acaso — é resultado do
refactor DDD e se sustentou.

**Build determinístico.** Dois `npm run build` seguidos produzem
`dist/limiar-app.js` byte a byte idêntico. O gate de staleness do CI é confiável
porque o build é reproduzível.

### O que está fraco

**Metade do código não é verificada por tipo.** `tsconfig` tem `allowJs: true`
com `checkJs: false`:

| Parte | Linhas | Verificada por `tsc` |
| --- | --- | --- |
| `.ts` | 11.408 | sim |
| `.js` | 10.586 | **não** |

`tsc --noEmit` verde cobre 51,9% do `src`. Toda a camada `ui/` (8.505 linhas),
`pages/` (1.681) e `framework/` (330) passa sem verificação alguma.

**Lint sem gate.** `ruff` acusa **330 achados** e não está em nenhum pipeline:

| Regra | N | Natureza |
| --- | --- | --- |
| E501 line-too-long | 239 | cosmético |
| ANN401 any-type | 16 | tipagem |
| EM101 / TRY003 | 32 | mensagens de exceção |
| B904 raise-without-from | 8 | perde a causa do erro |
| RET503 implicit-return | 6 | retorno implícito |
| S608 hardcoded-sql | 1 | revisar |
| F841 unused-variable | 1 | código morto |

72% é comprimento de linha. Os ~91 restantes são substantivos, e 8 deles
(`B904`) apagam a exceção original ao relançar — isso custa diagnóstico em
produção.

**Arquivos-deus.** Cinco arquivos concentram 7.877 linhas:

| Arquivo | Linhas |
| --- | --- |
| `ui/views/combat.js` | 1.971 |
| `ui/Component.js` | 1.755 |
| `backend/repositories/campaign_maps.py` | 1.485 |
| `domain/items/catalogAuditEngine.ts` | 1.281 |
| `ui/views/sheet.js` | 1.185 |

ARQUITETURA 4C no plano já ataca os dois primeiros.

**Código morto.** 54 exports sem nenhum consumidor e 37 usados apenas por
testes — inclui os motores órfãos que o plano já registra
(`resolveCombatAttack`, `combatAmmoEngine`). Um export testado mas nunca chamado
dá a sensação de cobertura sem entregar comportamento.

**Duplicação no template.** `Limiar OS.dc-2.html` tem 3.241 linhas, das quais
**58% não são únicas**, incluindo um bloco de ~312 linhas idêntico entre a ficha
em página cheia e a gaveta lateral. Foi exatamente essa duplicação que fez o
filtro de perícias nascer em só uma das duas superfícies.

---

## 2. Integridade da aplicação — B−

### Verificado em servidor real (`127.0.0.1:8795`)

| Verificação | Resultado |
| --- | --- |
| Boot + `/api/health` | 200 |
| Shell servido | 200 |
| `dist/limiar-app.js` | 200 |
| `tailwind-sheet.css` | 200 |
| `GET /data/limiar.db` | **404** (fechado) |
| `GET /api/characters` sem sessão | **401** (fechado) |
| Erros/tracebacks no log de boot | **0** |

| Banco | Resultado |
| --- | --- |
| `PRAGMA integrity_check` | ok |
| `journal_mode` | wal |
| `PRAGMA foreign_key_check` | **48 violações** → 0 após limpeza |

> **Correção.** A primeira versão deste laudo dizia "0 órfãos". Essa checagem
> só olhou `campaign_members` e `campaign_map_tokens`, que estavam limpas. O
> `PRAGMA foreign_key_check` completo acusou **48 violações**: 24 linhas de
> `campaign_map_reveals`/`campaign_map_fog` apontando para a campanha de teste
> `sync-smoke-a`, apagada em alguma sessão anterior — resíduo exato do bug de
> `delete_token` que o histórico registra. Removidas em 2026-07-28, com backup
> do banco antes.

### O que compromete

**Integridade referencial era decorativa — corrigido em 2026-07-28.** 16 das 25
tabelas declaram `FOREIGN KEY`, mas `PRAGMA foreign_keys` estava **desligado**:
o SQLite não o liga por padrão e `db()` nunca ligava. As declarações não
impediam nada, e a prova é que o banco carregava 48 violações reais.

`db()` agora liga a PRAGMA. Isso quebrou 26 testes de imediato — todos montavam
estados impossíveis em produção (membro de campanha sem conta, cena para
campanha inexistente), corrigidos por fixtures explícitas. `_delete_user` passou
a limpar `campaign_members`/`campaign_invites`/`password_reset_requests`, que as
4 FKs sem `ON DELETE CASCADE` exigem. `test_referential_integrity.py` prende o
comportamento: remover a PRAGMA derruba 4 testes.

**Um índice para 25 tabelas.** Só `idx_users_google_sub` existe. Toda consulta
por `campaign_id` — o caminho quente do mapa e do sync — é varredura completa.
Já é o checkbox 9C do plano.

**Estado global onde o modelo diz campanha.** `chat_messages`, `combat-state`,
`tarot-state` e `hqIp` não têm escopo de campanha. Duas mesas no mesmo servidor
compartilham chat e tracker de combate. BLINDAGEM B3, aberto.

**Escrita concorrente sem proteção.** Ficha e combate são read-modify-write em
conexões separadas, sem transação e sem `expectedRevision` — que a cena do mapa
tem. Duas escritas simultâneas perdem uma em silêncio. BLINDAGEM B4, aberto.

**Erro de API não chega ao cliente.** `http.ts` faz
`throw new Error('API ' + status)` e descarta o envelope
`{error:{code,message}}` que o backend monta com cuidado. Nenhum consumidor
distingue 403 de 409, e 401 não redireciona para o login.

---

## 3. Testes unitários — C+

### Volume

| | Casos | Asserts | Densidade | Teste/código |
| --- | --- | --- | --- | --- |
| Frontend | 747 | 1.783 | 2,4 por caso | 0,39 |
| Backend | 93 | 294 | 3,2 por caso | 0,38 |

859 casos, densidade saudável. Não são testes vazios.

### O problema central: o gate mede 6,5% do frontend

`vite.config.js` limita a cobertura a quatro pastas de domínio
(`dice`, `economy`, `character`, `conditions`) e exige 85% de linhas.

| | Linhas |
| --- | --- |
| Medido pelo gate | 1.423 |
| Total de `frontend/src` | 21.994 |
| **Fração medida** | **6,5%** |

O relatório publica **92,35%**. Rodando o mesmo v8 sobre `src/**`:

| Métrica | Gate publica | Real |
| --- | --- | --- |
| Linhas | 92,35% | **57,20%** |
| Statements | — | **47,83%** |
| Branches | — | **46,62%** |
| Funções | — | **44,41%** |

O comentário no próprio `vite.config.js` conta que uma versão anterior desse
gate passava a 60% com globs obsoletos que casavam zero arquivos. O formato do
problema não mudou: o número continua verde e continua descrevendo outra coisa.

Fora da medição estão os dois maiores domínios do produto: **`combat` (1.894
linhas)** e **`items` (3.893)**.

### Cobertura real por camada

| Camada | Linhas cobertas |
| --- | --- |
| `domain/campaigns`, `movement`, `chat`, `economy`, `shared`, `auth` | 100% |
| `domain/map` | 98,7% |
| `domain/character` | 98,4% |
| `application` | 97,4% |
| `domain/netrunning` | 95,5% |
| `domain/conditions` | 90,6% |
| `domain/tarot` | 81,7% |
| `domain/items` | 76,2% |
| `domain/combat` | 70,7% |
| `domain/cyberware` | 59,1% |
| **`ui`** | **46,1%** |
| **`pages`** | **34,6%** |
| **`infrastructure`** | **29,9%** |
| **`framework`** | **11,0%** |

O núcleo puro está bem coberto. A borda — onde o usuário toca — não está.

**Três arquivos a 0%**, todos de composição: `ui/Component.js` (841 linhas
executáveis), `pages/campaign-map.js` (259), `pages/login.js` (234).

### Backend

Sem ferramenta de cobertura instalada — não há como medir percentual. Por
módulo, três não aparecem em teste algum: `api/catalog.py`, `api/comms.py`,
`util.py`.

### Evidência de força, não só de quantidade

Duas mutações aplicadas em `test_route_auth.py` (reabrir `/api/chat`, criar rota
sem probe) foram **ambas detectadas**. É evidência pontual, não uma campanha de
mutação — mas é mais do que a contagem de casos prova sozinha.

---

## 4. Testes de aceitação — D

### O inventário

| | Quantidade |
| --- | --- |
| Suítes E2E / browser automatizadas | **0** |
| Playwright / Puppeteer no projeto | **0** |
| Teste golden (snapshot de catálogo) | 1 arquivo, 163 linhas |
| Teste de regra RAW (`cpr-raw.rules.test.js`) | 1 arquivo, 948 linhas |
| Smokes manuais registrados no plano | 23 |
| Entregas datadas na seção 9 | 40 |

### O que isso significa

A garantia de aceitação deste produto é **humana e não repetível**. Não existe
um comando que prove que um jogador consegue entrar, criar ficha, entrar numa
mesa, rolar um ataque e ver o dano persistir. Existe um registro de 23 vezes em
que alguém provou isso à mão.

**A prática funciona** — e o registro mostra: os smokes manuais encontraram o
`ReferenceError` de TDZ que quebrava `campaign-map.js` inteiro em silêncio, o
Escape que não fechava modal, o `[hidden]` que expunha controles de GM ao
jogador, e o `characterForCombatActor` que aplicava dano zero. Nenhum desses
apareceu em teste unitário. A disciplina é boa.

**O problema é que ela não escala e não roda no CI.** Cada smoke custa uma
sessão de alguém, cobre o que a pessoa lembrou de olhar naquele dia, e não
protege contra regressão amanhã. O plano trata isso como fase (PROVA), não como
infraestrutura permanente.

Dois pontos de crédito real:

- `cpr-raw.rules.test.js` (948 linhas) é conformidade de regra contra o livro —
  é teste de aceitação de domínio, e é bom.
- O golden de catálogo trava a saída da auditoria de itens contra fixture.

O CI roda pytest, vitest, typecheck, build e o gate de `dist/`. **Não roda
cobertura nem ruff.**

---

## 5. Deriva de documentação

Contagens de teste declaradas versus reais hoje:

| Fonte | Backend | Frontend |
| --- | --- | --- |
| `README.md` | 77 | 623 |
| `docs/ROADMAP.md` §3 | 86 | 695 |
| **Real** | **103** | **756** |

Ambos os documentos se declaram "evidência datada", então isso é deriva
esperada, não erro — mas as duas datas já passaram por três commits de código.

---

## 6. As cinco ações com maior retorno

Ordenadas por (risco fechado) ÷ (esforço), não por gravidade isolada.

1. **Corrigir o escopo do gate de cobertura.** Mudar o `include` para `src/**` e
   baixar o threshold para o real (57%) com proibição de cair. Custo: minutos.
   Retorno: o número passa a significar o que aparenta. Enquanto isso não for
   feito, toda decisão baseada em "92% de cobertura" está mal informada.
2. **Ligar `PRAGMA foreign_keys = ON`** em `db()` e rodar `PRAGMA
   foreign_key_check` antes. 16 tabelas já declaram as chaves; hoje elas são
   comentário.
3. **Um teste de aceitação automatizado do caminho crítico** — registrar, criar
   ficha, entrar na mesa, rolar, persistir. O CDP headless usado para regerar o
   screenshot desta semana já prova que dá para dirigir o app sem dependência
   nova.
4. **`ruff` no CI com baseline congelada** em 330, proibido crescer. Depois
   `--fix` nos 12 automáticos e nos 8 `B904`.
5. **Fechar B3 e B4** (escopo de campanha e escrita concorrente). São os dois
   itens que corrompem dados em vez de só incomodar.

---

## 7. Julgamento final

O produto tem um **núcleo de domínio genuinamente bom**: puro, tipado sem
escapatória, com 100% de cobertura em vários módulos e um teste de conformidade
RAW de 948 linhas. Isso é raro e é o ativo do projeto.

O que falha é a **borda e a instrumentação**. A camada que o usuário toca tem
metade da cobertura do núcleo, metade do código não passa por type-check, e o
instrumento que deveria avisar sobre isso — o gate de cobertura — está
configurado de um jeito que reporta saúde onde não mediu.

O risco maior não é nenhum dos números individuais. É que **o painel de
instrumentos mostra 92% enquanto o valor é 57%**. Um projeto que sabe que está
em 57% toma decisões diferentes de um que acredita estar em 92%.
