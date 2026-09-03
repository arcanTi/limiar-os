# Limiar OS

> A local campaign operating system for running a Cyberpunk RED table:
> sheets, combat, map, campaigns, chat, cyberware, Night City Tarot and
> Nexus Breach in the same app.

Limiar OS is not a generic VTT. It is a tool focused on Cyberpunk RED, built
to keep rules, mechanical state, and GM controls in the same place during a
session. The FastAPI server runs locally, persists data in PostgreSQL, and
serves the interface through the browser. Campaign updates use one
authenticated WebSocket per open campaign tab.

The technical roadmap and acceptance criteria live in [`docs/ROADMAP.md`](./docs/ROADMAP.md).
The latest evidence-based repository score lives in
[`docs/REPOSITORY-HEALTH.md`](./docs/REPOSITORY-HEALTH.md).

## Screenshots

| Login | Character sheet | Tactical Mesa |
| --- | --- | --- |
| ![Login screen](docs/screenshots/login.png) | ![Character sheet](docs/screenshots/character-sheet.png) | ![Tactical Mesa in combat](docs/screenshots/tactical-map.png) |
| Login is a single 6-character access token handed out by the GM — no password, no external service. | Full CPR operative file — attributes, Trauma Team plan, Humanity, RAM and IP tracked live. | Scene, tokens, HP rings and round/turn state, all synced to the shared combat cockpit. |

## What the system does

- Manages sheets with attributes, skills, HP, armor, SP damage, IP,
  reputation, notes, Trauma Team, gear and installed cyberware.
- Maintains public or private campaigns, members, invites and one linked
  sheet per player.
- Offers `admin`, `gm` and `player` profiles, with write routes scoped by
  role and ownership.
- Resolves rolls, attacks, damage, armor, critical injuries, conditions,
  healing, IP, LUCK and ammo through dedicated rule modules.
- Applies structured cyberware effects to attributes, skills, attacks,
  damage, armor, healing, immunities and weapon modes.
- Keeps Night City Tarot as a persistent deck and session, with effects
  translated into damage, ablation, criticals and auditable status.
- Embeds Nexus Breach as a Netrunner minigame inside the same surface.
- Includes chat, shared GM state, HQ/IP and the combat cockpit.
- Includes the **Mesa**, a per-campaign tactical map tied to combat and
  sheets.

## Product scope

Limiar OS supports **Cyberpunk RED**. The map, catalog, calculations and
interface are built for that system.

The project is local-first:

- login is a 6-character access token issued at the table, with no external provider;
- Docker Compose starts the Python server and PostgreSQL together;
- no email is ever sent: a GM reads a token out and the player types it in.

## Access and campaigns

Access control has three roles:

- `admin`: all GM permissions plus user management;
- `gm`: campaigns, Mesa and table-master controls;
- `player`: their own sheets, linked campaigns and authorized player
  actions.

Public campaigns can be discovered and joined with a player sheet. Private
campaigns require an invite. The campaigns drawer shows notifications,
invites, roster, linked sheet and the **MESA** entry.

### Character scope

A character belongs to exactly one campaign. A GM sees and manages only the
sheets of tables they run — a player's sheet never appears at another table —
and sheets created before any campaign was chosen, including the seeded
NOVA/BYTE/IRIS demo trio, live in a campaign-less bucket that the desktop shows
only when you continue without a campaign.

Staff delete a sheet from **SYSTEM → GM DATA OPS → PERSONAGENS DESTA
CAMPANHA**, which is also how a table clears the demo sheets on a fresh
install. Deletion is limited to the campaign you run; `admin` can delete any.

## Effects panel

`deriveStats` reports that a character is at `-6` to actions. The **PAINEL DE
EFEITOS**, at the top of the sheet's CONDICOES tab, says why:

```
PAINEL DE EFEITOS                                        -6 acoes

CONTRA (6)
 -2  Olho Danificado :: -2 em acoes      CABECA :: Tratamento DV13     [X]
 -2  Embriagado :: -2 em acoes           1 h :: origem: toxina:alcohol [X]
 -2  Ferido Grave :: -2 em acoes         HP 12 <= 20
 -2  Armadura :: -2 em REF, DEX e MOVE   penalidade da peca mais pesada
 -3  SP perdido :: cabeca -3 / corpo -0  atual 8/11 e 11/11
 -2  Chrome instalado :: -2 Humanidade   custo permanente

A FAVOR (1)
 +2  Toxin Binders :: +2 em Resist Torture/Drugs

EM VIGOR (sem numero)
     Envenenado                          origem: toxina:arsenic        [X]
```

It gathers every live source — untreated critical injuries, status effects
(tarot, conditions, toxins), the Seriously Wounded penalty, armor penalty and
ablation, cyberware stat/skill bonuses and humanity cost, cyberpsychosis,
accelerated healing, poison immunity — into one ledger split into what is
against the character, what is for them, and what is in force without a number.

Rows that a GM can lift carry an **X**: status effects and critical injuries.
Structural facts (armor penalty, wound state, installed chrome) do not, because
removing them means changing the sheet, not clearing a condition.

The totals come from `deriveStats`, never from summing the rows. The rows are an
explanation of that number and must not be able to contradict it.

### Creating an effect

**SYSTEM → GM DATA OPS → EFEITOS** authors an effect and hands it to players.
The form only offers modifiers the conditions engine actually reads:

| Field | Effect |
| --- | --- |
| Acoes | added to every action roll |
| Evasao | added to evasion |
| MOVE | added to effective MOVE |
| Death Save | added to the Death Save |
| Atributo | added to one stat (INT, REF, DEX…) |
| SP cabeca / corpo | armor ablated |
| Cargas | uses before the effect burns out |
| Ignora Ferido Grave / estado de ferimento / Death Save | engine flags |

Values are **signed**: `+2` helps, `-2` hurts. A blank duration means
indefinite. **EFEITO REAL** previews what will actually be saved, built by the
same normalizer that saves it — so anything the engine would ignore is already
gone from the preview.

That closed vocabulary is the point. A free-text modifier would render as a
badge on the sheet and change no roll at the table; here an authored effect
becomes the same status instance a built-in preset produces, so it flows
through aggregation, duration, charges and the effects panel with no second
code path. Campaign effects appear in the sheet's ADD STATUS picker marked with
`*`, and are stored per campaign — reusing a preset id overrides it for that
table only.

## Poisons and drugs

A toxin is resisted with one **Resist Torture/Drugs** check against a fixed DV.
Failing takes the full effect; passing costs nothing. Poison damage goes
**straight to HP** — armor neither soaks it nor ablates from it — which is why
toxins never travel through the combat damage engine.

| Intensity | Resist DV | Poison damage |
| --- | --- | --- |
| Mild (Beladona, Lixo Toxico) | 11 | 1d6 direct HP |
| Strong (Arsenico) | 13 | 2d6 direct HP |
| Deadly (Biotoxina, Peixe-Pedra) | 15 | 3d6 direct HP |

Drugs use the same rungs and DVs but describe a state instead of rolling dice:
Alcool (embriaguez), Pentotal Sodico (sugestionabilidade), Droga de Grife.

**Immunity.** Poison needs meat. Each sheet carries a `CORPO / TOXINAS` field —
`meat`, `fbc` or `drone`; drones and Full Body Conversions are immune outright,
and the cockpit's DRONE template spawns immune. Nasal Filters block **inhaled**
toxins only, never injected or ingested ones. Toxin Binders add +2 to the check.

**GM bench** (SYSTEM → GM DATA OPS → TOXINAS): pick a toxin, tick the targets
— each one shows its immunity before you spend the dose — and APLICAR rolls one
check per target, writes the HP loss and status, and posts the result to chat.
The same screen authors the campaign's own toxins: name, kind, intensity, and
optionally a tuned DV and damage. Left blank, DV and dice follow the intensity.
Custom toxins are stored per campaign and never leak to another table; reusing a
book toxin's id overrides it for that table only.

**Ammunition.** Biotoxina (500eb), Veneno (100eb) and Gas Lacrimogeneo (50eb)
are sold in the market and delivered like any other item. They fit arrows and
grenades only, and deal **no weapon damage at all** — a hit hands the target
straight to the resist check. Load one from the weapon row in the combat
cockpit; the button cycles through the rounds that weapon accepts and back to
none.

## Tactical Mesa

The Mesa lives in `campaign-map.html` and the `/api/campaign-maps/*`
routes. It can be opened from a campaign's **MESA** button or from the
desktop MAP icon.

Current features:

- scenes with image, grid, dimensions, scale and darkness;
- tokens with image, ownership, linked sheet, HP, conditions and ammo;
- shared or per-player fog, reveals and dynamic vision;
- walls, doors, line of sight and ambient or token-linked lights;
- difficult terrain, drawings, pins and pings;
- area templates for circle, cone, rectangle and ray;
- destructible props/cover with HP and LOS blocking;
- a ruler that sends distance, band and DV to the combat cockpit;
- round/turn state projected onto the map;
- token context menu for sheet, cockpit, measurement, initiative and
  defeated status;
- area resolution with pre-selected targets in the cockpit;
- per-campaign sync through a single WebSocket, with long-poll retained only
  as a compatibility fallback for clients without WebSocket support.

The map collects geometry and context. CPR rules live in the domain
modules and the `systemAdapter`; the canvas does not decide mechanical
outcomes on its own.

## How rules are applied

The UI collects character, weapon, target, map context, cyberware, tarot
and combat state. Pure modules compute the result, the application layer
prepares the mutation, and the API persists the state.

### Character and progression

`frontend/src/domain/character/` normalizes attributes, armor, skills,
gear and derived values. `frontend/src/domain/economy/` computes costs and
records IP history:

- skill: `next level * 10`;
- difficult skill: doubled cost;
- Role ability: `next rank * 30`.

### Dice and rolls

`frontend/src/domain/dice/` parses `NdM` notation, organizes contributions
and generates breakdowns. The UI controls animation and timing; the domain
controls the math. The 3D renderer lives in `vendor/sarah-dice/`.

### Combat

`frontend/src/domain/combat/` covers initiative, turns, checks, attacks,
damage, armor, autofire, ammo, stabilization, facedown and related rules.
Shared state uses `/api/combat-state`.

Players can end their own turn through the narrow
`/api/combat-state/end-turn` route; broad combat changes stay under GM
control.

### Injuries and conditions

`frontend/src/domain/conditions/` normalizes critical injuries and status
effects, including duration, stacks, penalties, wound state and
treatment. The origin and reason for changes stay visible on the sheet and
in the logs.

### Cyberware

`frontend/src/domain/cyberware/` resolves typed bonuses, enhancements,
immunities, cyberweapon modes, modifiers, damage, ablation and healing.
Installed cyberware is the source of truth; the catalog supplies the
structured rules.

### Night City Tarot

`frontend/src/domain/tarot/` maintains the 22 cards, deck order, history
and session. Effects produce a breakdown of damage, SP, multipliers,
ablation, criticals and status before persisting to `/api/tarot-state`.

### Nexus Breach

`frontend/games/nexus/` is mounted inside the app and uses
`/api/nexus-challenge` and `/api/nexus-result`. Its lifecycle preserves
the minigame's canvas, timers and listeners when the main UI updates.

## Architecture

```text
dist/                           # generated Vite output (ignored by Git)

frontend/
  index.html                    # main shell
  login.html                    # login and campaign picker
  campaign-map.html             # Mesa page
  games/nexus/                  # embedded Netrunner minigame
  templates/                    # shared build-time HTML partials
  src/
    main.js                     # app composition root
    application/                # orchestrated use cases and mutations
    domain/                     # pure rules and math
    domain/map/                 # geometry, vision, templates and intents
    infrastructure/api/         # backend route clients
    infrastructure/session.ts   # client-side session
    pages/                      # login and Mesa controllers
    styles/                     # main, login and Mesa styles
    ui/                         # component and per-surface views

backend/
  asgi.py                       # FastAPI composition, static files and WebSocket
  routers/                      # native auth, campaigns and Mesa HTTP contracts
  application/                  # transport-independent use cases and ports
  repositories/                 # PostgreSQL/filesystem adapters
  services/                     # external identity verification adapter
  domain/                       # backend validation
  db.py                         # PostgreSQL-only pool and transactions
  sql/postgres.sql              # clean-install PostgreSQL schema

data/seed/                      # declarative catalog and references
vendor/sarah-dice/              # vendored 3D dice
frontend/test/                  # Vitest tests
backend/tests/                  # pytest tests
```

The frontend uses Vite and ES modules. Vite owns all three HTML entry points;
their JavaScript entries import the styles each page needs. The backend serves
only the generated HTML, JavaScript and CSS from `dist/`, so changes only show
up on the real server after a build. `dist/` and the retired standalone
`tailwind-sheet.css` artifact are intentionally not versioned.

FastAPI is the only HTTP transport. Authentication, users, campaigns and every
route is a native `APIRouter` endpoint; the former dispatcher and handler mixins
were deleted. HTTP and WebSocket resolve sessions through the same application
service, and neither transport imports persistence adapters. PostgreSQL is the
sole database in production and tests.

Campaign events are persisted in the PostgreSQL event log. Each app process
observes that shared log and fans changes out to its local sockets, so sessions
and event versions remain coherent across replicas. PostgreSQL `LISTEN/NOTIFY`
is still a useful future latency optimization; correctness does not depend on it.

## Notas de melhoria do sistema

Atualizadas em **2026-08-06**. O repositorio esta avaliado em **8,9/10**, com
**9,5/10 em arquitetura**. Essas notas representam o estado verificado, nao uma
meta permanente. Evidencias, metricas e justificativas ficam em
[`docs/REPOSITORY-HEALTH.md`](./docs/REPOSITORY-HEALTH.md); a ordem detalhada de
execucao fica em [`docs/ROADMAP.md`](./docs/ROADMAP.md).

### Melhorias consolidadas

- PostgreSQL e obrigatorio no produto e no CI; a suite backend falha se houver
  qualquer teste ignorado.
- Os tres HTML de producao pertencem ao build Vite, e `dist/` e CSS gerado nao
  sao versionados.
- Cada entrada frontend importa apenas os estilos de sua propria superficie.
- HTTP e WebSocket usam os mesmos servicos de sessao, identidade, autorizacao e
  eventos, sem acesso direto dos transports aos repositorios.
- O SQL de identidade esta encapsulado no repositorio e a Mesa foi separada por
  agregados de persistencia.
- A ficha compartilhada possui uma base reutilizavel; novas extracoes devem
  preservar comportamento, acessibilidade e densidade de informacao.

### Proximas melhorias, por prioridade

| Prioridade | Melhoria | Criterio de aceite |
| --- | --- | --- |
| P0 | Isolar chat, combate, tarot, HQ e Nexus por campanha | Toda leitura, escrita e notificacao possui `campaign_id`; duas campanhas nao compartilham estado |
| P0 | Adicionar concorrencia otimista a ficha e ao combate | Escritas usam revisao esperada e conflitos retornam resposta explicita, sem perda silenciosa de dados |
| P1 | Substituir dicionarios livres por DTOs Pydantic graduais | Contratos de entrada e saida criticos sao tipados, validados e cobertos por testes de erro |
| P1 | Criar ports explicitos para cada agregado da Mesa | A aplicacao deixa de depender de `Any` e `__getattr__`; cada caso de uso declara somente as operacoes utilizadas |
| P1 | Continuar a decomposicao da ficha e das grandes views | Componentes menores mantem exatamente persistencia, atalhos, foco, estados visuais e regras atuais |
| P1 | Elevar cobertura de UI, framework e Nexus | Pisos de linhas, branches e funcoes sobem gradualmente no CI sem testes artificiais |
| P2 | Migrar estilos inline restantes | Estados e variacoes passam para classes coesas, sem alterar a hierarquia visual da ficha e da Mesa |
| P2 | Reduzir a baseline Ruff | Nenhum achado novo e reducao incremental dos 240 achados existentes |
| P2 | Dividir o bundle e os scripts 3D legados | Carregamento sob demanda reduz o bundle inicial sem quebrar rolagens, Nexus ou renderizacao 3D |
| P2 | Melhorar observabilidade operacional | Logs estruturados incluem requisicao, campanha, usuario e conflito sem registrar tokens ou segredos |

### Mapa de evolucao como ferramenta de RPG

A direcao de produto e permitir que uma campanha percorra preparacao, sessao,
combate, downtime e progressao dentro do Limiar OS. As possibilidades abaixo
nao sao apenas funcionalidades isoladas: cada uma deve reduzir interrupcoes na
mesa ou dar consequencia duradoura as decisoes dos personagens.

| Pilar da experiencia | Base atual | Melhoria possivel | Valor para a mesa |
| --- | --- | --- | --- |
| Sessao zero e criacao | Wizard, ficha, atributos, skills, equipamento e cyberware | Lifepath guiado, pacotes por papel, vinculos entre personagens, objetivos e acordos da campanha | O grupo inicia com personagens coerentes e ganchos que o GM consegue reutilizar |
| Ficha durante a sessao | HP, SP, municao, LUCK, Humanity, IP, condicoes, notas e rolagens | Transformar a ficha em cockpit contextual, destacando somente recursos e acoes relevantes para a cena atual | O jogador encontra seus dados criticos sem navegar por formularios durante seu turno |
| Papeis de Cyberpunk RED | Papel e rank registrados; progressao de Role Ability possui custo | Fluxos proprios para Rockerboy, Solo, Netrunner, Tech, Medtech, Media, Exec, Lawman, Fixer e Nomad | Cada papel passa a mudar a maneira de jogar, e nao apenas o texto da ficha |
| Combate tatico | Ataques, dano, armadura, criticos, condicoes, iniciativa, mapa e AoE | Unificar o ataque single-target no resolver oficial; completar economia de turno, evasao, melee, agarrar, escudo humano e malfunction | Menos calculo paralelo, menos esquecimento de regra e resolucao mais rapida |
| Movimento e ambiente | Grid, distancia, terreno, paredes, luz, fog, props e cobertura | Budget advisory de MOVE, adjacencia, bandas de alcance, perigos ambientais e interacoes de cena | Posicionamento passa a produzir decisoes sem retirar do GM a palavra final |
| Netrunning | Nexus Breach, programas e Black ICE possuem dominio proprio | Ligar NET Architectures a cenas e pins, controlar NET Actions/turnos e registrar efeitos no mundo fisico | O Netrunner joga em paralelo ao grupo sem criar uma sessao separada dentro da sessao |
| Cenas sociais e reputacao | Facedown, COOL, REP, chat e notas existem | Contatos, favores, dividas, reputacao por faccao, atitude de NPC e consequencias de dialogo | Conversa, estilo e influencia passam a ter memoria mecanica comparavel ao combate |
| Downtime e economia | Eurodollars, inventario, IP, terapia, Trauma Team e progressao | Hustles, Night Markets, reparos, fabricacao/upgrades, hospital, terapia, lifestyle e rent em um calendario de downtime | O intervalo entre missoes vira jogo e alimenta a proxima historia |
| Saude e humanidade | Ferimentos criticos, estabilizacao, tratamento, Humanity e cyberware estruturado | Linha do tempo de recuperacao, cirurgia, disponibilidade do Medtech e alertas de consequencias de Humanity | Dano e chrome continuam relevantes depois que a iniciativa termina |
| Campanha e continuidade | Campanhas, roster, convites, chat, estados compartilhados e event log | Isolar todo estado por campanha; criar journal pesquisavel, recap, objetivos, rumores e pendencias | Cada campanha preserva sua propria memoria e pode ser retomada depois de semanas |
| Ferramentas do GM | Cenas, NPC templates, tokens, segredos, permissao e controles da Mesa | Preparador de encontros, cenas reutilizaveis, clocks, frentes/faccoes e revelacao gradual de informacao | O GM prepara menos dados repetidos e improvisa sem perder rastreabilidade |
| Encerramento da sessao | IP e logs existem de forma separada | Resumo automatico revisavel, distribuicao de IP/recompensas, mudancas de reputacao e ganchos abertos | A sessao termina com consequencias claras e a proxima ja nasce preparada |
| Seguranca e conforto da mesa | Perfis, visibilidade por audiencia e controles de permissao | Linhas e veus, pausa de seguranca, conteudo oculto por jogador e ferramentas de acessibilidade | O sistema protege o ritmo e os limites do grupo sem expor escolhas privadas |
| Transparencia de regras | Breakdowns mecanicos, logs e confirmacao do usuario | Mostrar origem da regra, modificadores aplicados, override do GM e motivo registrado | O grupo entende o resultado e ainda preserva a autoridade da mesa |

### Ordem recomendada pelo ciclo de jogo

1. **Confiabilidade da campanha:** isolamento por `campaign_id`, concorrencia da
   ficha/combate e journal por campanha.
2. **Nucleo da sessao:** ficha contextual, pipeline unico de combate, economia de
   turno, movimento advisory e reconexao sem perda de estado.
3. **Identidade de Cyberpunk RED:** acoes especificas dos papeis, Netrunning
   integrado, Facedown/reputacao e consequencias de Humanity.
4. **Vida entre missoes:** downtime, mercado, reparos, terapia, lifestyle,
   contatos, faccoes e preparacao do proximo trabalho.
5. **Fechamento e longevidade:** recap, IP, recompensas, export/backup e retomada
   clara da campanha.

O primeiro criterio de priorizacao deve ser a friccao observada em uma sessao
real completa. Uma melhoria de regras so esta pronta quando aparece no fluxo do
jogador, respeita permissoes, persiste a consequencia, sincroniza a campanha e
deixa um registro compreensivel para o GM.

### Regras para as proximas alteracoes

1. Regras de Cyberpunk RED permanecem no dominio; UI e canvas apenas coletam
   contexto e apresentam resultados.
2. Routers e WebSockets cuidam de transporte; casos de uso ficam na aplicacao e
   PostgreSQL/filesystem ficam nos adapters de infraestrutura.
3. Mudancas na ficha devem ser pequenas e verificadas no servidor real, pois ela
   e a superficie de maior permanencia e concentra os dados mais importantes do
   jogador.
4. Cada entrega precisa de teste do caminho principal e da falha relevante,
   suite PostgreSQL sem skips, typecheck, build Vite e `git diff --check`.
5. Artefatos gerados continuam fora do Git e sempre nascem no CI e no container.

## Requirements

- Docker Engine with Docker Compose for the supported deployment;
- Python 3.13 or newer for native backend development;
- Node.js/npm to develop, test or rebuild the frontend;
- a modern browser with ES modules support.

## Running locally

Copy the environment template, replace both passwords, and start the clean
PostgreSQL deployment:

```bash
cp .env.example .env
docker compose up --build
```

Use a URL-safe PostgreSQL password such as `openssl rand -hex 32`; Compose
constructs `LIMIAR_DATABASE_URL` from that same value, so database credentials
cannot drift between the two services.

Open:

```text
http://127.0.0.1:8765/Limiar%20OS.dc-2.html
```

`LIMIAR_DATABASE_URL` is mandatory in the application container. Startup fails
instead of silently creating SQLite when it is absent.

For native development, point the process at a reachable PostgreSQL database:

```bash
cd frontend && npm run build && cd ..
LIMIAR_DATABASE_URL='postgresql://limiar:password@127.0.0.1:5432/limiar' python3 server.py
```

The real server serves the UI, `/api/*`, WebSocket events and PostgreSQL. A
static server can show HTML/CSS but proves nothing about auth, persistence or
API-backed rules.

### Disposable database policy

There is intentionally no SQLite migration/import. The PostgreSQL volume is the
only database store. To discard the entire installation, including PostgreSQL
and uploads:

```bash
docker compose down --volumes --remove-orphans
```

Without `--volumes`, PostgreSQL survives normal container recreation. With
`--volumes`, all campaigns, users, sessions and maps are permanently removed;
the next `docker compose up` creates schema version 1 and a fresh admin.

## Local login

Every account is reached with one **6-character access token** — no username,
no password. Typing the token *is* logging in, and the token belongs to exactly
one account.

Tokens are drawn from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`: `0`, `O`, `1`, `I` and
`L` are left out so a token read aloud at the table cannot be mistyped into
someone else's account. Input is case-insensitive and separators are ignored,
so `a7k2-qf` and `A7K2QF` are the same token.

### Issuing tokens

Admins and GMs issue tokens from **SYSTEM → GM DATA OPS → EMITIR TOKEN DE
ACESSO** in the app:

- a new username mints a fresh token, shown once in full so it can be read out;
- **NOVO** on a roster row reissues a token, which immediately kills the old
  one and every session it had opened;
- with a campaign active, the invite box also puts the new account on that
  table.

A GM can only issue, reissue and delete `player` accounts; `gm` and `admin`
accounts are admin-only.

### The master account

On a fresh database the bootstrap admin is controlled by:

| Variable | Default | Purpose |
| --- | --- | --- |
| `LIMIAR_GM_USER` | `mestre` | bootstrap admin username |
| `LIMIAR_MASTER_TOKEN` | generated | bootstrap admin access token |

Leaving `LIMIAR_MASTER_TOKEN` unset is the recommended path: a random token is
generated on first boot and written once to the server log —

```bash
docker compose logs app | grep 'master account'
```

Set it explicitly only if you need a token you already know:

```bash
LIMIAR_GM_USER=mestre
LIMIAR_MASTER_TOKEN=A7K2QF
```

### What a 6-character token is and is not

Six characters over a 31-symbol alphabet is about 887 million combinations —
enough for a table, not enough to leave unguarded on the open internet. Two
rate limits carry that weight: 10 login attempts per minute per IP, plus a
deployment-wide cap of 60 per minute so spreading guesses over many addresses
does not help. Tokens are stored in plain text, on purpose, because the GM
panel has to be able to show them again; anyone with database access therefore
has every account. Run the server on the table's network or behind an
authenticating proxy, and reissue a token the moment it leaks.

## Other environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `LIMIAR_DATABASE_URL` | required | PostgreSQL URL; ASGI startup rejects an absent or non-PostgreSQL value |
| `PORT` | `8765` | HTTP port |
| `HOST` | `127.0.0.1` | bind address — set `0.0.0.0` to let other machines on the table's network reach the server |
| `LIMIAR_SESSION_TTL` | `28800` | inactivity expiration, in seconds |
| `LIMIAR_SESSION_TOUCH_INTERVAL` | `900` | minimum interval between persisted sliding-session renewals |
| `LIMIAR_MAX_UPLOAD_MB` | `64` | image upload limit |

`GET /api/health` reports `database.engine=postgresql`, the database name and
its current byte size. It also declares `sqliteImportSupported=false` so
deployment automation can reject an accidental legacy configuration.

## Rotating credentials

`LIMIAR_MASTER_TOKEN` only seeds the admin on a fresh database, so it cannot
rotate the token of an account that already exists. To revoke every session and
reissue a token, stop the server and run:

```bash
docker compose exec app python scripts/rotate-credentials.py
```

The new token is printed once. Use `--user ana` to pick another account, or
`--sessions-only` to log everyone out without touching any token.

## Rebuilding the frontend

After changing `frontend/src/`:

```bash
cd frontend
npm run build
```

`npm run dev` serves it for Vite iteration. `python3 server.py` uses the
HTML and bundles generated in `dist/`. The container and CI always generate
these artifacts from source; they must not be committed.

## Tests

Backend:

```bash
python3 -m pip install -r requirements-dev.txt
./scripts/test-backend-postgres.sh
```

The backend suite no longer has a SQLite shortcut. The script starts an
ephemeral PostgreSQL 18 database named `limiar_test`, runs every test against
it with a zero-skip gate, then removes the container and its `tmpfs` data. The
CI uses the same PostgreSQL-only, zero-skip policy. To use an already running
test database instead, set `LIMIAR_TEST_DATABASE_URL`; the fixture refuses any
database whose name does not end in `_test` before issuing its per-test
`TRUNCATE ... CASCADE`.

Frontend:

```bash
cd frontend
npm test
npm run typecheck
npm run test:coverage
```

Build and hygiene:

```bash
cd frontend && npm run build
git diff --check
```

The current checkout collects 127 backend tests and runs 763 frontend tests.
CI requires every backend test to execute against PostgreSQL with zero skips;
the commands above remain the source of truth for each checkout.

## Development hooks

Enable hooks once per clone:

```bash
git config core.hooksPath .githooks
```

The pre-commit hook runs backend pytest, frontend Vitest and TypeScript
typecheck.

## Port troubleshooting

If the port is in use, identify the process before killing it:

```bash
lsof -nP -iTCP:8765 -sTCP:LISTEN
kill <PID>
```

Confirm the PID belongs to the server you intend to stop.
