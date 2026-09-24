# Attribution — external skill packs

Imported 2026-09-24 into `skills/development/` for repo-wide planning, productivity,
and code-review workflows (equity-research skills are untouched and remain the
primary workflow — see `skills/README.md`).

## aihero.dev / Matt Pocock skills

- Source: https://github.com/mattpocock/skills (listed at https://www.aihero.dev/skills)
- License: MIT (Copyright (c) 2026 Matt Pocock) — see upstream `LICENSE`.
- Skills imported unprefixed (e.g. `skills/development/code-review/`).

## cursor/plugins — pstack skills

- Source: https://github.com/cursor/plugins/tree/main/pstack/skills
- License: not confirmed in the mirrored tree at import time — treat as
  "used with attribution, verify license before external redistribution."
- Skills imported with a `ps-` prefix (e.g. `skills/development/ps-blast-radius/`)
  to avoid name collisions with the aihero pack (`tdd`, `teach` exist in both).

## Not imported

Deliberately excluded as out of scope for this repo (novelty/persona skills,
TS-specific tooling this JS/JSDoc repo doesn't use, or meta "bootstrap this
skill pack into a fresh repo" skills superseded by this manual import):
aihero's `ask-matt`, `setup-matt-pocock-skills`, `migrate-to-shoehorn`,
`scaffold-exercises`, `setup-pre-commit`; pstack's `arena`, `bro`,
`make-bot-ui`, `poteto-mode`, `setup-pstack`, `swarm`,
`typescript-best-practices`.

Re-run `python3 scripts/tmp-import-external-skills.py` (kept for reference,
not part of the ongoing scripted surface) if a future skill pack update needs
re-syncing — it's idempotent per skill folder.
