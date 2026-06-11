# Validator Performance Guide

Runtime expectations and rerun-safety for `scripts/validators/`. All
validators are read-only against the audited project (they write only their
JSON result to stdout and one telemetry row to `docs/work/telemetry.jsonl`) —
every validator is safe to rerun any number of times. Costs below are for a
mid-size repo (~50k LOC) on a dev laptop.

## By class

| Class | Validators | Runtime | Cost driver |
|-------|-----------|---------|-------------|
| Doc-structure greps | most `validate-*` doc gates (architecture, tech-stack, adrs, scope, srs, user-stories, security-controls, infrastructure, observability, ux-spec, …) | < 1s | grep over a handful of docs/ files |
| Graph analyzers | circular-deps, module-boundaries-transitive, module-design | < 1s | parse one table, in-memory graph |
| Source scanners | module-boundaries, dead-code (grep half), scope, no-ascii-art | 1–10s | walks source tree; scales with file count |
| Tool-backed | dead-code (knip/ts-prune/vulture), deps audits | 5–60s | underlying tool's startup + analysis |
| Render-backed | mermaid (with mmdc installed) | ~1–3s per diagram | headless Chromium render per block; the only validator where input size dominates. `MERMAID_NO_RENDER=1` for a <1s static-only pass |
| Composite gates | phase-gate, run-handoff-gates, coverage loops | sum of members | runs the relevant subset above |

## Practical guidance

- **Rerun freely.** Idempotent by design; no caches to invalidate. The only
  side effect anywhere is the telemetry append (disable: `EXPERTS_TELEMETRY=0`).
- **In tight loops** (fix-verify cycles), run the ONE validator for the thing
  being fixed, not the whole phase gate — the gate re-runs at the end anyway.
- **validate-mermaid on large doc trees**: the render gate dominates. Run it
  scoped to the changed file (`validate-mermaid.sh path/to/file.md`) during
  iteration; full-tree render only at the gate.
- **Tool-backed validators degrade gracefully**: missing tools downgrade to
  grep fallbacks or a warning — they never block on absent tooling, so CI
  without knip/semgrep still gets the cheap checks.
- **Measured numbers beat this table**: `npm run telemetry:report` shows
  observed per-validator run counts and gap rates once data accumulates.
