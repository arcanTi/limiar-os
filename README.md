# Limiar OS

> A local campaign operating system for running a Cyberpunk RED table:
> sheets, combat, map, campaigns, chat, cyberware, Night City Tarot and
> Nexus Breach in the same app.

Limiar OS is not a generic VTT. It is a tool focused on Cyberpunk RED, built
to keep rules, mechanical state, and GM controls in the same place during a
session. The server runs locally, persists data in SQLite, and serves the
interface through the browser.

The technical roadmap and acceptance criteria live in [`README-PLANO.md`](./README-PLANO.md).

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

- local user/password login works without an external provider;
- the Python server and SQLite are enough to run the table;
- Google Login is an optional integration;
- absence of Google configuration does not block local login.

## Access and campaigns

Access control has three roles:

- `admin`: all GM permissions plus user management;
- `gm`: campaigns, Mesa and table-master controls;
- `player`: their own sheets, linked campaigns and authorized player
  actions.

Public campaigns can be discovered and joined with a player sheet. Private
campaigns require an invite. The campaigns drawer shows notifications,
invites, roster, linked sheet and the **MESA** entry.

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
- per-campaign sync via long-poll.

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

`games/nexus-breach/` is mounted inside the app and uses
`/api/nexus-challenge` and `/api/nexus-result`. Its lifecycle preserves
the minigame's canvas, timers and listeners when the main UI updates.

## Architecture

```text
Limiar OS.dc-2.html             # main shell
login.html                      # login and campaign picker
campaign-map.html               # Mesa page
limiar-styles.css               # app styles
login.css                       # login styles
styles/map/                     # Cyberpunk RED Mesa styles
dist/                           # bundles served by the backend

frontend/src/
  main.js                       # app composition root
  application/                  # orchestrated use cases and mutations
  domain/                       # pure rules and math
  domain/map/                   # geometry, vision, templates and intents
  infrastructure/api/           # backend route clients
  infrastructure/session.ts     # client-side session
  pages/campaign-map.js         # Mesa controller
  pages/login.js                # login controller
  ui/Component.js               # main UI orchestration
  ui/views/                     # per-surface views and handlers

backend/
  app.py                        # HTTP dispatch and static files
  api/                          # auth, campaigns, map, chat and state
  repositories/                 # SQLite persistence
  domain/                       # backend validation
  db.py                         # schema, migrations and seed

data/seed/                      # declarative catalog and references
games/nexus-breach/             # Netrunner minigame
vendor/sarah-dice/              # vendored 3D dice
frontend/test/                  # Vitest tests
backend/tests/                  # pytest tests
```

The frontend uses Vite and ES modules. The served HTML loads files from
`dist/`; changes in `frontend/src/` only show up on the real server after
a build.

## Requirements

- Python 3.10 or newer;
- Node.js/npm to develop, test or rebuild the frontend;
- a modern browser with ES modules support.

## Running locally

Single command (builds the frontend and starts the backend, which serves
everything on one port):

```bash
./run.sh
```

Or manually, in two steps — useful when the frontend is already built:

```bash
cd frontend && npm run build && cd ..
python3 server.py
```

Open:

```text
http://127.0.0.1:8765/Limiar%20OS.dc-2.html
```

The real server serves the UI, `/api/*` and SQLite. A static server can
show HTML/CSS but proves nothing about auth, persistence or API-backed
rules.

## Local login

On a fresh database, the initial admin user is controlled by:

| Variable | Default | Purpose |
| --- | --- | --- |
| `LIMIAR_GM_USER` | `mestre` | initial admin user |
| `LIMIAR_GM_PASSWORD` | `limiar-master-2077` | initial admin password |

Set your own password before exposing the server to the network:

```bash
LIMIAR_GM_USER=mestre LIMIAR_GM_PASSWORD='change-this-password' python3 server.py
```

## Optional Google Login

Google Login is optional. To enable it, create an OAuth Client ID for Web
and start the server with:

```bash
GOOGLE_CLIENT_ID='your-client-id.apps.googleusercontent.com' python3 server.py
```

The backend validates the `id_token`, `aud`, issuer and verified email.
Without `GOOGLE_CLIENT_ID`, username/password login remains the supported
flow and the Google integration stays unavailable.

## Other environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8765` | HTTP port |
| `HOST` | `0.0.0.0` | bind address |
| `LIMIAR_SESSION_TTL` | `28800` | inactivity expiration, in seconds |
| `LIMIAR_MAX_UPLOAD_MB` | `64` | image upload limit |

Example:

```bash
HOST=127.0.0.1 PORT=9000 LIMIAR_SESSION_TTL=14400 python3 server.py
```

## Rebuilding the frontend

After changing `frontend/src/`:

```bash
cd frontend
npm run build
```

`npm run dev` serves it for Vite iteration. `python3 server.py` uses the
bundles generated in `dist/`.

## Tests

Backend:

```bash
python3 -m pip install -r requirements-dev.txt
python3 -m pytest backend/tests -q
```

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

In the snapshot verified on 2026-07-18, 77 backend tests and 623 frontend
tests passed. These counts are dated evidence; the commands above are the
source of truth for the current checkout.

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
