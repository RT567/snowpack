# snowpack — instructions for AI agents

## Read first
- **`ai-notes/`** — the story of this project: the idea, Rob's interaction spec, the architecture and
  why, data findings, current state. Read `ai-notes/README.md` then the newest numbered doc before
  touching anything. **Maintain it**: add a dated doc or update the current one when significant work
  lands or direction changes; that is part of finishing the work.
- **`research/`** — background research with sources (avalanche formation, forecaster reasoning,
  Australian snowpack, slab mechanics, model equations). Consult before changing model or mechanics rules.

## Shape of the code
Pure pipeline: `src/weather` (record schema + Open-Meteo adapters) → `src/snow/model.js` (hourly step)
→ `src/snow/mechanics.js` (what fails under load) → `src/scene` (Three.js) → `src/ui`. Model, mechanics
and season are DOM-free and tested with `npm test`. Do not let rendering concerns leak into `src/snow`.
`node scripts/run-fixture.mjs` runs the real 2026 season and prints the profile.

## Deploy
Vite build → GitHub Pages via `.github/workflows/deploy.yml` on push to `main`. Nothing else runs anywhere.

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->


## Build & Test

_Add your build and test commands here_

```bash
# Example:
# npm install
# npm test
```

## Architecture Overview

_Add a brief overview of your project architecture_

## Conventions & Patterns

_Add your project-specific conventions here_
