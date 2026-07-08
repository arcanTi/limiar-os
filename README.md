# Limiar OS

> A local campaign operating system for running a Cyberpunk RED table: login, roles, character sheets, campaigns, GM state, combat, cyberware, Night City Tarot, chat, and a Netrunner breach minigame in one browser app.

Local Cyberpunk RED campaign OS with persistent sheets, access control, campaign membership, combat state, cyberware rules, Night City Tarot resolution, chat, and GM/player API flows.

Limiar OS is not a generic virtual tabletop. It is a focused table tool for a Cyberpunk RED campaign, built to keep the mechanical state of play in the same place as the GM-facing controls. The app runs locally, stores campaign data in SQLite, and serves a browser interface from a small Python HTTP server.

## What it does

- Manages character sheets with stats, skills, armor, HP, SP damage, IP, notes, Trauma Team plan, gear, and installed cyberware.
- Gives the GM a persistent campaign workspace for characters, items, HQ/IP state, combat state, chat, tarot deck state, and campaign rosters.
- Uses login/session auth with three access levels: admin, GM, and player.
- Lets admins create, edit, and delete users.
- Lets GMs create public/private campaigns, invite players, and inspect campaign rosters.
- Lets players create/edit their own sheets, accept campaign invites, join public campaigns, and link one sheet per campaign.
- Lets players use player-facing flows for chat, character selection, notes, and ending their own active combat turn.
- Resolves Cyberpunk RED-style dice, skill checks, weapon damage, armor interaction, critical injuries, conditions, healing, and IP costs through dedicated rule modules.
- Applies cyberware effects to stats, skills, passive immunities, attack modifiers, weapon modes, damage, armor ablation, and healing transparency.
- Supports Night City Tarot as a persisted deck/session system with card effects resolved into damage, SP ablation, critical injuries, status effects, and GM-readable breakdowns.
- Embeds Nexus Breach, a compact Netrunner breach minigame, inside the same app surface.
- Includes a Vitest harness for domain rules, with coverage checks for dice, economy, character, and conditions modules.

## Access and campaigns

Limiar OS has role-based access:

- `admin`: all GM permissions plus user management.
- `gm`: campaign and table-master permissions.
- `player`: owns their own sheets and can join campaigns with one sheet per campaign.

Campaigns can be public or private. Public campaigns can be joined by players with one of their sheets. Private campaigns require an invite from an admin/GM. The campaign drawer shows available campaigns, notifications, pending invites, linked sheets, and player search for invitations.

An experimental campaign map/table implementation exists in the codebase (`campaign-map.html` and `/api/campaign-maps/*`), but the visible **Mesa** entry was removed from the UI while the interaction model is being reconsidered.

## How rules are applied

The rule logic is split into pure frontend domain modules and narrow backend persistence routes. The UI collects the current character, weapon, target, cyberware, tarot, and combat context, then calls the relevant domain helpers before saving the resulting state through the API.

### Character and sheet rules

Character normalization lives in `frontend/src/domain/character/`. It clamps stats, normalizes armor, parses gear damage notation, canonicalizes skills, computes skill totals, and tracks skill/IP spend. Most character data is persisted as structured JSON through the `characters` API, so new sheet fields can be saved without a database migration.

Character progression uses `frontend/src/domain/economy/`:

- Skill IP cost is `nextLevel * 10`.
- Difficult skills double that skill cost.
- Role ability IP cost is `nextRank * 30`.
- IP changes are written as ledger entries so the sheet can show history, not just the final balance.

### Dice and roll rules

Roll math lives in `frontend/src/domain/dice/`. Rolls are represented as contribution rows, not just one text string. That lets the app show where each die or modifier came from, such as base weapon damage, cyberware, critical context, or a situational roll toggle.

The dice domain:

- Parses and formats `NdM` notation.
- Expands `d100` into the pair expected by the vendored 3D dice engine.
- Caps physical dice contributions for the renderer.
- Builds readable breakdowns for the chat/combat log.

The UI owns animation and commit timing; the domain module owns the math.

### Combat rules

Combat state and combat calculations live in `frontend/src/domain/combat/` and are persisted through `/api/combat-state`.

The combat layer:

- Normalizes combatants, sides, initiative, turn order, defeated state, rounds, and active turn.
- Sorts initiative by rolled initiative, then REF as a tie breaker, then stable table order.
- Computes attack modifiers from effective stat + relevant skill + cyberware skill/stat bonuses + weapon modifiers.
- Computes generic check modifiers from effective stat + skill + cyberware bonuses.
- Treats Autofire as fixed `2d6` damage regardless of the weapon's listed damage dice.
- Builds weapon damage as contribution rows, including runtime scaling such as cyberweapon profiles and enhancement effects.
- Keeps player self end-turn narrow: players can call `/api/combat-state/end-turn`, while broad combat-state writes stay GM-only.

### Armor, wounds, and conditions

Conditions and critical injuries live in `frontend/src/domain/conditions/`. The module aggregates active penalties every time derived character stats are computed.

It applies:

- Untreated critical injury penalties.
- Action, death-save, MOVE/stat, evasion, SP ablation, and wound-state modifiers.
- Timed status effects with round/minute/hour duration conversion.
- Charge-based statuses, such as guaranteed critical charges, through explicit use actions.
- Critical injury records with source, location, treated state, and stack behavior.

Cyberware-dependent immunity checks are kept outside the pure conditions module and passed in by the UI/domain caller.

### Cyberware rules

Cyberware effects live in `frontend/src/domain/cyberware/`. Installed cyberware is treated as the source of truth for bonuses; catalog lookup and persistence stay outside the domain module.

The cyberware layer:

- Normalizes typed bonus arrays against `CYBER_BONUS_TYPES`.
- Applies stat modifiers to effective stats.
- Aggregates skill bonuses, ranged bonuses, critical damage bonuses, critical-roll effects, armor-ignore rules, armor ablation, weapon modes, cover damage, healing multipliers, nonlethal options, and passive immunities.
- Links cyberweapon enhancements to installed parent cyberware, then exposes the combined weapon profile to combat rolls.
- Produces source labels so the sheet and combat log can show why a number changed.

### Night City Tarot rules

Tarot logic lives in `frontend/src/domain/tarot/` and persists through `/api/tarot-state`.

The tarot layer:

- Maintains a normalized 22-card deck order, seen list, current session id, current session draw, and draw history.
- Resolves card effect trees against combat context flags, such as melee/ranged attack context or target conditions.
- Computes tarot damage from rolled damage, pre-armor additions, armor bypass, multipliers, target location, SP, and ablation.
- Expands multi-critical effects into individual critical injury atoms.
- Generates breakdown text that explains base damage, SP interaction, multipliers, and ablation so the GM can audit the result.

Deck state is stored as one settings-backed singleton, so a table can resume the same tarot deck/session after reloads.

### Nexus Breach rules

`games/nexus-breach/nexus-breach.js` is embedded into Limiar OS through an imperative mount/unmount wrapper. It keeps its own minigame state and exposes a GM-published challenge/result flow through `/api/nexus-challenge` and `/api/nexus-result`.

The important integration rule is that Nexus Breach is mounted inside the existing app surface without letting the main UI renderer wipe its DOM, canvas, timers, or keyboard listeners.

## Architecture

```text
Limiar OS.dc-2.html             # App shell served by the Python server
limiar-styles.css               # Main app styling
dist/limiar-app.js              # Versioned frontend build loaded by the shell

frontend/src/
  main.js                       # Composition root
  framework/index.js            # Small component mounting layer
  infrastructure/api/           # Client API modules
  infrastructure/store.js       # Client-side store/bootstrap helpers
  domain/                       # Pure rule/math modules
  ui/Component.js               # Main app UI orchestration
  ui/view/                      # View helpers/styles

backend/
  app.py                        # HTTP route dispatch and static serving
  api/                          # Auth, users, campaigns, characters, catalog, state, chat, uploads
  db.py                         # SQLite setup and seed insertion
  repositories/                 # Record/chat/campaign persistence
  security.py                   # Password hashing and session helpers

data/seed/
  limiar-seed.json              # Declarative seed data
  tarot.json, trauma-plans.json, skills.json, critical-injuries.json, i18n.json
                                 # Reference-data source of truth, imported directly by frontend/src via the @seed alias

games/nexus-breach/             # Embedded Netrunner breach minigame
vendor/sarah-dice/              # Vendored 3D dice renderer
frontend/test/                  # Vitest unit/rule tests
```

## Runtime model

The backend is Python stdlib `http.server` plus SQLite. It serves the static app and owns persistence, auth, campaign access, and API boundaries.

Broad write routes are admin/GM-only. Player routes are deliberately narrow and ownership-checked.

- `/api/login` and `/api/logout`
- `/api/session`
- `/api/users` (admin write; admin/GM list)
- `/api/campaigns`, `/api/campaigns/:id/invite`, `/api/campaigns/:id/join`
- `/api/notifications`
- `/api/player-characters`
- `/api/chat`
- `/api/combat-state/end-turn`
- `/api/nexus-result`
- `/api/characters/:id/notes`

The frontend is built with Vite/ES modules. The served HTML loads `dist/limiar-app.js`, so source edits under `frontend/src/` are not visible in the local app until the bundle is rebuilt.

## Run locally

```bash
cd limiar-os
python3 server.py
```

Open:

```text
http://127.0.0.1:8765/Limiar%20OS.dc-2.html
```

For reverse proxy / Cloudflare / LAN access, bind remains `0.0.0.0` by default.

## Rebuild the frontend

Run this after changing anything under `frontend/src/`:

```bash
cd frontend
npm run build
```

`npm run dev` starts Vite for frontend iteration, but `server.py` serves the committed `dist/limiar-app.js` build.

## Run tests

```bash
cd frontend
npm test
npm run test:coverage
```

The current harness covers the pure domain modules in `frontend/src/domain/dice`, `economy`, `character`, and `conditions`. Golden-master fixtures from `data/audit/snapshots/` are planned, but that snapshot directory is not present in the current tree.

Backend checks use pytest with an isolated SQLite test database:

```bash
python3 -m pip install -r requirements-dev.txt
python3 -m pytest backend/tests -q
```

## Environment variables

All variables are optional for local development.

| Variable | Default | Effect |
| --- | --- | --- |
| `LIMIAR_GM_USER` | `mestre` | Seeded admin login user for a fresh database. |
| `LIMIAR_GM_PASSWORD` | `limiar-master-2077` | Seeded admin password for a fresh database. Set this before exposing the server. |
| `PORT` | `8765` | HTTP server port. |
| `HOST` | `0.0.0.0` | HTTP bind host. |
| `LIMIAR_SESSION_TTL` | `28800` | Idle session TTL in seconds. Authenticated requests slide the window forward. |
| `LIMIAR_MAX_UPLOAD_MB` | `64` | Max image upload size in MB. |

Example:

```bash
LIMIAR_GM_USER=mestre LIMIAR_GM_PASSWORD=change-this PORT=9000 LIMIAR_SESSION_TTL=14400 LIMIAR_MAX_UPLOAD_MB=64 python3 server.py
```

## Development checks

Git hooks live in `.githooks/`. Enable them once per clone:

```bash
git config core.hooksPath .githooks
```

The pre-commit hook runs backend pytest plus `cd frontend && npm test` and
`npm run typecheck`, blocking commits when either harness fails.

Useful validation commands:

```bash
cd frontend && npm run build
cd frontend && npm test
cd frontend && npm run test:coverage
python3 -m py_compile server.py backend/*.py backend/api/*.py backend/domain/*.py backend/repositories/*.py
python3 -m json.tool data/seed/limiar-seed.json >/dev/null
```

For UI and API work, validate through the real app server rather than only a static file server. A plain `python3 -m http.server` can render static assets, but it cannot prove `/api/*` behavior or SQLite persistence.

## Port cleanup

If the default port is stuck:

```bash
lsof -ti:8765 | xargs kill -9
```
