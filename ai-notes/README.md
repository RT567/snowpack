# ai-notes — the story of snowpack

Chronological notes for AI agents (and humans) arriving here: what this is, why it is shaped the way
it is, how it is built and deployed, and what to watch out for. Convention: `NN-topic-YYYY-MM-DD.md`,
numbered in order. Add a new dated doc when you make a significant change or decision, and keep the
newest doc's "current state" section accurate.

1. [01-architecture-2026-09-15.md](01-architecture-2026-09-15.md) — the idea, the original interaction spec, the architecture and why, data-source findings, model calibration state
2. [02-simplify-column-on-slope-2026-09-15.md](02-simplify-column-on-slope-2026-09-15.md) — stripped the interactions; one square column on a 32° slope, seams coloured by stability; then (appended, 15–16 Sep) station correction from Bureau daily obs, Snowy Hydro depth calibration, MSC reports as facts and as chips marked up against the model column, model fixes from day-by-day comparison, code review

Background research (subagent reports with sources) lives in [`../research/`](../research/).
