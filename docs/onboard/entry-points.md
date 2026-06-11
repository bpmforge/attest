# Entry Points

This inventory covers the user-facing entry points surfaced by this repo: OpenCode slash commands, npm scripts, direct install scripts, and the only in-repo HTTP fixture.

## HTTP `GET /birdhouses`
- Source: `evals/fixtures/node-onboard/server.js`
- Purpose: returns the birdhouse registry as JSON.
- Flow: `http.createServer(...)` -> `listBirdhouses()` -> `200` JSON response.

## HTTP `POST /sightings`
- Source: `evals/fixtures/node-onboard/server.js`
- Purpose: records a sighting and marks the matching birdhouse occupied.
- Flow: parse request body -> `registerSighting(...)` -> `201` JSON response.

## `/guide`
- Source: `skills/guide/SKILL.md`
- Purpose: front door concierge; routes plain-English goals to the right expert.
- Flow: usually hands off to `/security`, `/review-code`, `/sdlc onboard`, `/sdlc improve`, or task decomposition.

## `/security`
- Source: `skills/security/SKILL.md`
- Purpose: security audit entry point.
- Modes: `--quick`, `--deep`, `--fix`, `--threat-model`, `--owasp`, `--deps`.
- Flow: audit -> report in `docs/security/` -> optional verified fix loop.

## `/review-code`
- Source: `skills/review-code/SKILL.md`
- Purpose: code-health audit entry point.
- Modes: `--review`, `--debt`, `--consolidate`, `--patterns`.
- Flow: analyze repo health -> write `docs/reviews/*` report.

## `/gate`
- Source: `skills/gate/SKILL.md`
- Purpose: run the current phase gate and report gaps.
- Flow: read `docs/work/sdlc-state.md` -> run `scripts/validators/validate-phase-gate.sh <phase>`.

## `/sdlc`
- Source: `skills/sdlc/SKILL.md`
- Purpose: SDLC dispatcher for the four major workflows.
- Modes: `init`, `onboard`, `feature`, `improve`.
- Flow: routes to the appropriate subcommand and expected interview / gate sequence.

## `/sdlc init`
- Source: `commands/sdlc-init.md`
- Purpose: initialize a new project with discovery, planning, and early phase docs.
- Flow: discovery interview -> phase 0/1 docs -> design clarification before phase 3.

## `/sdlc onboard`
- Source: `commands/sdlc-onboard.md`
- Purpose: reverse engineer an existing codebase.
- Modes: `--quick`, default, `--deep`.
- Flow: landscape -> entry points -> data model -> components -> health -> docs -> inventory/gates.

## `/sdlc feature`
- Source: `commands/sdlc-feature.md`
- Purpose: add a feature to an existing system.
- Flow: feature discovery interview -> impact analysis -> design -> implementation -> verification -> docs.

## `/sdlc improve`
- Source: `commands/sdlc-improve.md`
- Purpose: audit and improve an existing system.
- Flow: discovery interview -> audits -> backlog synthesis -> user approval -> routed fixes -> re-verification.

## `/sdlc status`
- Source: `commands/sdlc-status.md`
- Purpose: report current SDLC status without running validators.
- Flow: inspect docs structure -> infer phase -> summarize completed deliverables and next action.

## `/sdlc gate`
- Source: `commands/sdlc-gate.md`
- Purpose: SDLC-aware gate check wrapper.
- Flow: read `docs/work/sdlc-state.md` -> choose phase arg -> run `scripts/validators/validate-phase-gate.sh`.

## `npm test`
- Source: `package.json` -> `scripts/test.ts`
- Purpose: full repository validation pass.
- Flow: validate tools -> validate skills -> validate agents.

## `npm run check`
- Source: `package.json` -> `scripts/test.ts`
- Purpose: alias for `npm test`.
- Flow: same as `npm test`.

## `npm run agents:check`
- Source: `package.json` -> `scripts/build-agents.mjs --check`
- Purpose: detect drift in shared agent boilerplate.
- Flow: compare inline sections against canonical block files.

## `npm run agents:fix`
- Source: `package.json` -> `scripts/build-agents.mjs --fix`
- Purpose: rewrite drifted agent boilerplate sections.
- Flow: canonicalize shared blocks in place.

## `npm run agents:compact`
- Source: `package.json` -> `scripts/build-agents.mjs --compact`
- Purpose: emit compact agent variants for small-model installs.
- Flow: write `dist/compact-agents/*.md`.

## `npm run build:claude`
- Source: `package.json` -> `scripts/build-target-claude.mjs --write`
- Purpose: generate the `claude-experts` mirror.
- Flow: copy/transform canonical files into the target repo.

## `npm run build:claude:check`
- Source: `package.json` -> `scripts/build-target-claude.mjs --check`
- Purpose: verify the `claude-experts` mirror is in sync.
- Flow: diff generated output against the target repo and fail on drift.

## `npm run evals`
- Source: `package.json` -> `scripts/run-evals.mjs`
- Purpose: deterministic eval suite for the expert system.
- Flow: run fixture checks -> write `docs/work/EVAL_RESULTS.json`.

## `npm run evals:agent`
- Source: `package.json` -> `scripts/run-evals.mjs --agent`
- Purpose: eval suite with optional `opencode run --agent` coverage.
- Flow: deterministic checks plus agent-driven checks when available.

## `./install.sh`
- Source: `install.sh`
- Purpose: install the repo into `~/.config/opencode/` or `.opencode/`.
- Flow: preflight -> copy/link content -> optional MCP/tool installs.

## `./uninstall.sh`
- Source: `uninstall.sh`
- Purpose: remove installed repo content from global or project locations.
- Flow: delete installed directories and leave caches in place.

## `./scripts/doctor.sh`
- Source: `scripts/doctor.sh`
- Purpose: install health check / diagnostics entry point referenced by the README.
- Flow: inspect environment, dependencies, and configuration health.

## `./scripts/check-tools.sh`
- Source: `scripts/check-tools.sh`
- Purpose: report which optional analysis tools are installed.
- Flow: detect optional tooling and show install guidance when missing.
