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
- Tracks progression: IP, character level, Role rank and table achievements
  awarded to the party or to one character, with an undo that reverses the
  whole award.
- Includes chat, shared GM state, HQ/IP and the combat cockpit.
- Puts the table's sheets on one GM console, with a quick-edit bench for HP,
  IP, eddies, conditions, items and directed NET checks.
- Rolls complete NPC stat blocks from an archetype crossed with a tier, from a
  seed that reproduces the whole squad.
- Exports any sheet as a fillable PDF, generated in-process with no
  dependency and no server round trip.
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

### Playing an absent player's character

A player who misses a session can have their sheet handed to someone else at
the table. From the campaign roster the GM grants control of one character to
another **member of that same campaign**; the substitute then plays it
alongside their own. The grant is not membership: the absent player keeps their
seat and their ownership, so nothing about the sheet changes hands. It has no
expiry — the GM revokes it when the player is back (migration `0008`).

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

## GM table console

**MESA // PERSONAGENS** is the GM-only band above the sheet tabs in the main
app — the table read as characters, not the tactical map. Every sheet at the
table is a card with its portrait, Role, level, IP, owner, an HP bar and a
count of untreated injuries and active effects; a search over name, Role and
owner plus a PJ/NPC filter narrows the grid.

Choosing a card makes that character **active**, which is what every other GM
tool — inventory, market, conditions, IP — is already pointing at. Under the
grid sits a quick console for the edits that were not worth a round trip
through another page, and each card's buttons jump straight to the right tab
with that character selected:

| Tab | What it does |
| --- | --- |
| VITAIS | damage, heal, heal to full, IP in or out, eddies |
| CONDICOES | apply one critical injury or one status effect, campaign effects included |
| ITENS | hand over a catalog product, or a free-form item (GEAR, WEAPON, ARMOR, CONSUMABLE, DATA, KEYCARD, CYBERWARE) |
| NET | send a NET check to one player or to the whole table |

The NET tab picks a RAW Netrunning ability (or a free label), a DV from the
architecture floors 6/8/10/12 plus the hard 15/17, and sends the roll to the
player instead of rolling for them. Only Netrunners have an Interface rank; for
anyone else the console says so before the request goes out — they roll a flat
1d10.

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

Every new player sheet is built by the guided wizard
(`frontend/src/ui/views/onboarding.js`), whose eight steps — sistema,
identidade, atributos, skills, chrome, arsenal, vida, revisao — are validated in
`frontend/src/domain/character/characterWizard.ts`. The **Chrome** step spends
the Complete Package's starting money (CPR p.42/104/105/110), and
`frontend/src/domain/character/creationChrome.ts` holds those rules:

- The operative starts with **2.550eb**. Cyberware and DLC enhancements are
  bought there, and whatever is left over becomes the sheet's cash — a sheet
  that buys no chrome starts play with the full 2.550eb.
- Surgery is free at creation, but the implant's **Humanity cost is charged
  immediately**. The loss is derived from `equipped`, so it is never written
  to the sheet as a separate number.
- An **enhancement** (Hydraulic Ram, Tungsten Reinforcement...) is a separate
  purchase that only unlocks once its base implant is installed; removing the
  base refunds the enhancements bolted to it.
- **One enhancement per piece of cyberware** (Mission Kit DLC #2). A second one
  is refused naming the enhancement already in the way, in the wizard and in
  play (`ToggleCyberwareEnhancement`); swapping means detaching first. The
  backend refuses a creation payload that stacked two on one piece.
- Requirements from the install engine still apply — Kerenzikov asks for the
  Neural Link, Linear Frames ask for the BODY. What the wizard ignores are the
  rules that depend on body locations (paired limbs, slot pools): creation buys
  one row per implant and never asks which arm it goes in.
- The 800eb reserved for Fashion and Fashionware are settled with the GM: they
  buy nothing in the wizard and, per RAW, never turn into cash.

The **Arsenal** step spends what is left of that same pool on weapons, armor,
ammunition, attachments, decks and gear (`creationGear.ts`). Buying the same
item twice raises its quantity, nothing starts equipped, and the picks are
written to the sheet's `gear` inventory. Ammunition is sold the way the book
sells it (p.94/344): a box of ten for the common calibers, one at a time for
grenades and rockets, with `packSize` on the catalog row and on the inventory
line so ten rounds never read as one.

A row reaches either shelf only if the catalog calls it merchandise
(`isPurchasableProduct`) and carries a price. The `BRAWLING-BODY-*` entries are
the damage table that turns an attacker's BODY into dice — the rules engine
looks them up, nobody buys them — and the catalog already says so with
`purchasable: false`; both the creation shop and the desktop market honor that,
counts included. A remaining zero-price row is a catalog gap rather than a free
item, and `unsellableGear` reports both cases with their reason.

The **Vida** step records where the operative lives (`lifestyle.ts`, CPR
p.105). Everyone starts with a free month in a Cargo Container eating Kibble
and owes 1.100eb from the first of the next month; an Exec's Corporation covers
a Corporate Conapt so only the 600eb Good Prepak is paid, and a Nomad lives
with the family pack and its Motorpool. The preset follows the Role until the
player picks one themselves. The sheet stores housing, food, `monthlyCost` and
`graceMonths` — never a due date: the campaign calendar belongs to the table.

`validate_character_creation` mirrors the whole budget server-side, so a
hand-crafted payload cannot open a sheet with more than 2.550eb.

After creation the sheet grows through the **CONQUISTAS** tab
(`frontend/src/domain/progression/`). An award carries a title, a note, IP and
character levels, and is either *individual* or *party*: the party form writes
the same award id onto every seated sheet, so the history groups it back into
one row and a mistaken award is undone in a single gesture instead of character
by character. Each award also lands in the sheet's IP ledger, next to purchases,
so where the IP came from and where it went are the same list.

Any sheet can be downloaded as a **fillable PDF**
(`frontend/src/domain/character/characterSheetPdf.ts`). It is generated in the
browser with no dependency and no round trip: every number a player touches
between sessions — stats, HP, humanity, ammo, eddies, skill levels, notes — is
a real AcroForm field, so the sheet keeps working offline in any PDF reader.
Values are written both as `/V` and as an appearance stream, because several
viewers ignore `/NeedAppearances` and would otherwise show blanks.

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

**NPC generator.** The cockpit's reinforcements drawer rolls a complete
combat-ready block from an **archetype** — who this is: civil, guarda, ganger,
policial, corpsec, solo, drone — crossed with a **tier** — how dangerous: base,
veterano, elite, chefe, plus a group-only `misto` that puts one leader over a
base/veterano mix. Baselines follow the CPR core NPC blocks and tiers stack
fixed deltas on them, so one archetype scales from mook to boss without a
second table. All ten STATs, HP by the RAW formula, catalog armor and weapons,
a focused skill set and descriptive tags come out at once, and every random
decision goes through an injected rng — the same seed reproduces the whole
squad (`frontend/src/domain/combat/npcGenerator.ts`).

### Movement and distance

`frontend/src/domain/movement/` holds the tactical movement math: one grid cell
is two meters, a Movement Action covers MOVE cells, Run doubles that, and
difficult terrain costs two cells for every cell crossed. Cell size and the
terrain multiplier are parameters rather than constants, so the map can measure
for a different system without forking the module.

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

Chrome is not only a number on the sheet. The Humanity an implant costs is
summed from `equipped`, and EMP follows it down to the tens digit of the
remaining Humanity (p.80). `deriveStats` publishes that as
`effectiveStats.EMP`, which is what the sheet displays and what every roll —
EMP checks, Conversation, Human Perception — is made against; the spread the
player bought at creation stays untouched on `character.base`.

### Night City Tarot

`frontend/src/domain/tarot/` maintains the 22 cards, deck order, history
and session. Effects produce a breakdown of damage, SP, multipliers,
ablation, criticals and status before persisting to `/api/tarot-state`.

### Nexus Breach

`frontend/games/nexus/` is mounted inside the app and uses
`/api/nexus-challenge` and `/api/nexus-result`. Its lifecycle preserves
the minigame's canvas, timers and listeners when the main UI updates.

Stealth netrunning (DLC *Going Quiet*) lives in
`frontend/src/domain/netrunning/stealth.ts` and the Nexus tab:

- The GM adds **Watchers** (Imp/Efreet/Balron demons or an enemy Netrunner
  with Interface + Pathfinder bonus) to the published architecture.
- **Quietly Jack In** is a fifth prep row: it spends one NET Action and is
  contested (Interface + 1d10) against every Watcher; a tie favors them.
  Success halves the run's trace rate and flags `stealthActive`.
- While hidden, **Encontro com Black ICE** rolls Interface + Cloak bonus
  (Eraser) + 1d10 against the ICE's PER + 1d10. Passing marks the ICE as
  bypassed (out of initiative); failing breaks stealth and the ICE attacks.
  Watcher encounters use the Watcher's Interface + Pathfinder instead.
- Control Nodes and any attack (Zap, attacker programs) break stealth on the
  spot. The GM has a once-per-turn **Busca Ativa** per Watcher (Netrunner
  defends, so ties keep them hidden) and a **Proximo Turno** button.
- Stealth state is client-local like the Black ICE panel; every resolution
  is posted to chat with both totals.

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
    infrastructure/store.ts     # client state container
    infrastructure/download.ts  # handing generated bytes to the browser
    pages/                      # login and Mesa controllers
    styles/                     # main, login and Mesa styles
    ui/                         # component, shared view helpers and per-surface views

backend/
  asgi.py                       # FastAPI composition, static files and WebSocket
  routers/                      # native auth, campaigns and Mesa HTTP contracts
  dependencies.py               # request-scoped session and service wiring
  application/                  # transport-independent use cases and ports
  repositories/                 # PostgreSQL/filesystem adapters
  domain/                       # backend access rules and payload validation
  schemas.py                    # Pydantic request models
  security.py                   # access-token alphabet, normalization and rate limiting
  db.py                         # PostgreSQL-only pool, transactions and seeding
  migrations/                   # Alembic revisions (0001-0008)
  sql/postgres.sql              # baseline schema applied by revision 0001

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

The schema is owned by **Alembic**, not by a hand-applied SQL file: startup
runs `upgrade head` before seeding, and `backend/sql/postgres.sql` is the
baseline that revision `0001` applies. Later revisions carry the structural
decisions the product depends on — JSONB documents (`0002`), the campaign event
log (`0003`), campaign-scoped shared state (`0004`), optimistic revisions
(`0005`), access tokens (`0006`), one campaign per character (`0007`) and
character delegation (`0008`).

Campaign events are persisted in the PostgreSQL event log. Each app process
observes that shared log and fans changes out to its local sockets, so sessions
and event versions remain coherent across replicas. PostgreSQL `LISTEN/NOTIFY`
is still a useful future latency optimization; correctness does not depend on it.

## Notas de melhoria do sistema

Remedidas em **2026-09-05**: o repositorio esta em **9,0/10**, com **9,5/10 em
arquitetura**. Essas notas representam o estado verificado, nao uma meta
permanente. Evidencias, metricas e a divida que segura a nota ficam em
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
- **Estado compartilhado isolado por campanha** (migracao `0004`): chat,
  combate, tarot, HQ e Nexus escrevem sob `campaign_id`, e duas campanhas nao
  compartilham estado.
- **Concorrencia otimista** (migracao `0005`): ficha, estado de combate e cenas
  da Mesa exigem `expectedRevision` e devolvem conflito explicito em vez de
  perder escrita silenciosamente.
- **Personagem pertence a uma campanha** (migracao `0007`) e o controle
  temporario de uma ficha ausente e um grant revogavel (migracao `0008`).

### Proximas melhorias, por prioridade

| Prioridade | Melhoria | Criterio de aceite |
| --- | --- | --- |
| P1 | Substituir dicionarios livres por DTOs Pydantic graduais | Contratos de entrada e saida criticos sao tipados, validados e cobertos por testes de erro |
| P1 | Criar ports explicitos para cada agregado da Mesa | A aplicacao deixa de depender de `Any` e `__getattr__`; cada caso de uso declara somente as operacoes utilizadas |
| P1 | Continuar a decomposicao da ficha e das grandes views | Componentes menores mantem exatamente persistencia, atalhos, foco, estados visuais e regras atuais |
| P0 | Atualizar os pisos de cobertura do CI | Os pisos de `vite.config.js` (57/47/46/44, de 2026-07-28) sobem para a medicao atual (65,02/56,28/51,96/52,38) arredondada para baixo, para que uma regressao volte a falhar |
| P1 | Elevar cobertura de UI, framework e Nexus | `framework/` (11,0% de linhas), `pages/` (38,1%) e `ui/` (52,4%) sobem sem testes artificiais |
| P2 | Migrar estilos inline restantes | Estados e variacoes passam para classes coesas, sem alterar a hierarquia visual da ficha e da Mesa |
| P2 | Reduzir a baseline Ruff | Nenhum achado novo e reducao incremental dos 239 achados existentes (`scripts/ruff-baseline.json`) |
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
| Campanha e continuidade | Campanhas, roster, convites, chat, event log e todo estado compartilhado ja isolado por `campaign_id` | Journal pesquisavel, recap, objetivos, rumores e pendencias | Cada campanha preserva sua propria memoria e pode ser retomada depois de semanas |
| Ferramentas do GM | Cenas, NPC templates, tokens, segredos, permissao e controles da Mesa | Preparador de encontros, cenas reutilizaveis, clocks, frentes/faccoes e revelacao gradual de informacao | O GM prepara menos dados repetidos e improvisa sem perder rastreabilidade |
| Encerramento da sessao | IP e logs existem de forma separada | Resumo automatico revisavel, distribuicao de IP/recompensas, mudancas de reputacao e ganchos abertos | A sessao termina com consequencias claras e a proxima ja nasce preparada |
| Seguranca e conforto da mesa | Perfis, visibilidade por audiencia e controles de permissao | Linhas e veus, pausa de seguranca, conteudo oculto por jogador e ferramentas de acessibilidade | O sistema protege o ritmo e os limites do grupo sem expor escolhas privadas |
| Transparencia de regras | Breakdowns mecanicos, logs e confirmacao do usuario | Mostrar origem da regra, modificadores aplicados, override do GM e motivo registrado | O grupo entende o resultado e ainda preserva a autoridade da mesa |

### Ordem recomendada pelo ciclo de jogo

1. **Confiabilidade da campanha:** com o isolamento por `campaign_id` e a
   concorrencia otimista da ficha/combate ja entregues, resta o journal por
   campanha.
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

- Python 3.13 or newer plus Node.js/npm for the native run, which is the
  current working environment;
- Docker Engine with Docker Compose for PostgreSQL, and for the parked
  container deployment;
- a modern browser with ES modules support.

## Running locally

**The current environment is the native run on `http://127.0.0.1:8765`.** The
Compose stack is deliberately parked (`limiar-os-app-1` is stopped) — see
[Why Compose is parked](#why-compose-is-parked) before starting it again.

```bash
cp .env.example .env   # first time only; fill in the values
./run-local.sh
```

`run-local.sh` loads `.env`, rebuilds the frontend into `dist/`, refuses to
start if something else already holds the port, and serves the app at:

```text
http://127.0.0.1:8765/
```

Pass `--no-build` to skip the Vite build when only backend code changed.

`LIMIAR_DATABASE_URL` is mandatory. Startup fails instead of silently creating
SQLite when it is absent, and — unlike Compose — the native process does not
derive it from `POSTGRES_PASSWORD`, so `.env` spells it out. The database is the
standalone `limiar-dev-postgres` container on host port 55433:

```bash
docker start limiar-dev-postgres   # if it is not already up
```

The real server serves the UI, `/api/*`, WebSocket events and PostgreSQL. A
static server can show HTML/CSS but proves nothing about auth, persistence or
API-backed rules.

### Why Compose is parked

The `app` container has no source mount: `dist/` is baked into the image at
build time. A frontend rebuild on the host therefore never reaches it, and the
UI silently serves whatever bundle the image was built with.

Worse, both servers claimed port 8765 — the container on `0.0.0.0`, the native
process on `127.0.0.1`. Which one answered depended on whether the client
resolved `localhost` to IPv4 or IPv6, so the same URL served two different
builds from two different databases.

So the `app` service now sits behind the `deploy` Compose profile. A bare
`docker compose up` brings up **only PostgreSQL** and can no longer resurrect the
conflict by accident. The deployment still works — it just has to be asked for:

```bash
lsof -nP -iTCP:8765 -sTCP:LISTEN   # make sure the native process is stopped
./run.sh                           # or: docker compose --profile deploy up --build
```

`run.sh` passes the profile, refuses to start when the port is already taken, and
always passes `--build` — without it the container ships the bundle from whenever
the image was last built.

Use a URL-safe PostgreSQL password such as `openssl rand -hex 32`; Compose
constructs `LIMIAR_DATABASE_URL` from that same value, so database credentials
cannot drift between the two services. Note that Compose uses its own
`limiar-os-postgres-1` database, which has different users and access tokens
than the native `limiar-dev-postgres`.

### Disposable database policy

There is intentionally no SQLite migration/import. The PostgreSQL volume is the
only database store. To discard the entire installation, including PostgreSQL
and uploads:

```bash
docker compose down --volumes --remove-orphans
```

Without `--volumes`, PostgreSQL survives normal container recreation. With
`--volumes`, all campaigns, users, sessions and maps are permanently removed;
the next `docker compose --profile deploy up` creates schema version 1 and a
fresh admin.

`down` removes every container in the project regardless of profiles — the
parked `app` included — and it is **not** honoured by `--dry-run` in Compose v5:
the containers are really removed. That is safe without `--volumes` (the data
lives in `limiar-os_limiar-postgres`, and `docker compose up -d postgres` brings
it back intact), but do not reach for `--dry-run` expecting a preview.

None of this touches the native run: `./run-local.sh` talks to the standalone
`limiar-dev-postgres` container, whose data is in the `limiar-dev-pgdata` volume
and is untouched by `docker compose down`.

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
grep 'master account' /path/to/run-local.log   # native run: wherever you sent stdout
docker compose logs app | grep 'master account' # Compose run
```

Once the account exists, the log line is gone for good. Read the token back from
the database instead:

```bash
docker exec limiar-dev-postgres psql -U limiar -d limiar \
  -tAc "SELECT username, access_token, role FROM users ORDER BY role, username;"
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
python3 scripts/rotate-credentials.py            # native run (loads .env via run-local.sh's vars)
docker compose exec app python scripts/rotate-credentials.py  # Compose run
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

Build and hygiene — the same gates CI runs:

```bash
cd frontend && npm run build
python3 scripts/check-repository-hygiene.py   # generated artifacts stay out of Git
python3 scripts/check-architecture.py         # layer boundaries: transport -> application -> adapters
python3 scripts/ruff-baseline.py              # no new Ruff findings over the frozen baseline
sh scripts/verify-domain-catalogs.sh          # canonical catalog and rules-engine verification
git diff --check
```

The current checkout collects **194 backend tests** and **1223 frontend tests**
in 88 files, with line coverage at 65,02%. CI requires every backend test to
execute against PostgreSQL with zero skips; the commands above remain the source
of truth for each checkout.

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

`lsof` only reports sockets bound on the address it is asked about, so a Docker
container publishing on `0.0.0.0:8765` and a native process on `127.0.0.1:8765`
can coexist without either one failing to start. Check both:

```bash
lsof -nP -iTCP:8765 -sTCP:LISTEN
docker ps --format '{{.Names}}\t{{.Ports}}' | grep 8765
```

When two servers share the port, which one answers depends on whether the client
resolved IPv4 or IPv6 — `curl http://127.0.0.1:8765/` and
`curl http://localhost:8765/` can return different builds. Compare the hashed
bundle each address serves:

```bash
for h in 127.0.0.1 localhost; do
  printf '%s -> ' "$h"
  curl -s "http://$h:8765/" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1
done
```

Two different hashes means two different servers. Stop one.
