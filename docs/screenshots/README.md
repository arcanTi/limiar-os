# Screenshots

The three PNGs referenced from the project `README.md`:

- `login.png` — the login screen.
- `character-sheet.png` — an operative's character sheet (core tab).
- `tactical-map.png` — the tactical Mesa with tokens mid-combat.

They are referenced by relative path from `README.md`'s Screenshots section, so
the filenames matter.

## Keeping them honest

A screenshot is dated evidence, same as a test count. When one stops matching
what the server renders it is worse than no screenshot at all: it documents a
version of the product nobody can run.

`character-sheet.png` was regenerated on 2026-07-28, after the sheet moved to
Tailwind. The previous file still showed the old gold-tab drawer, which the
build no longer produces.

## Regenerating

There is no screenshot pipeline in the repo. These were captured by driving a
headless Chrome over the DevTools Protocol against a real `python3 server.py`,
using a throwaway account issued from the GM panel (`POST /api/users`) and
deleted afterwards. Two things matter if you redo it:

- capture at `deviceScaleFactor: 2` — the UI is dense, and at 1x it is
  unreadable once the README table scales the image down;
- delete the throwaway user, session and character when done, so the seeded
  database is left as it was.

## Known scope mismatch

`login.png` and `tactical-map.png` show the software correctly, but the *art*
in both is high fantasy: the login rotation in `assets/login/` is dragon art,
and the Mesa shot uses a fantasy world map that a GM had uploaded as the scene
background. The project README states the map, catalog and interface are built
for Cyberpunk RED. Replacing that art is a product decision rather than a
documentation fix — see `docs/ROADMAP.md`, Fase 1 (ALINHAMENTO).
