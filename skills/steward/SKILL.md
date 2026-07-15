---
name: steward
description: 'Project intelligence steward — audits CLAUDE.md / AGENTS.md alignment with actual codebase, captures session learnings, updates project docs. Use after major sessions or when docs feel stale.'
---

# Steward — Project Intelligence Lifecycle

Keeps project documentation aligned with reality. CLAUDE.md and AGENTS.md drift
from the actual codebase as code evolves and decisions are made in conversation
but never written down. This skill fixes that.

**Usage:**
- `/steward` — Full audit: check docs vs code, surface drift, update
- `/steward capture` — Capture learnings from this session into project docs
- `/steward audit` — Audit-only: report drift without fixing
- `/steward distill` — Per-release distillation loop: review telemetry + eval data, update rubrics/exemplars/prompts

## How It Works

### `/steward audit` — Find the Drift

```
▶ Phase 1: Reading project docs...
```
1. Read CLAUDE.md (or AGENTS.md in OpenCode projects)
2. Read README.md, package.json, any docs/*.md files referenced

```
▶ Phase 2: Checking alignment with code...
```
3. For each claim in the docs, verify against the actual codebase:
   - **Tech stack:** Does package.json match what docs say? (e.g., docs say "React 18" but package.json has "react": "^19")
   - **File structure:** Does the directory structure match what docs describe? (e.g., docs say `src/features/` but code uses `src/modules/`)
   - **Commands:** Do the documented commands actually work? (e.g., `npm run test:e2e` referenced but not in scripts)
   - **Patterns:** Do the coding standards in docs match what the code actually does? (e.g., docs say "max 150 lines per component" but 15 components exceed it)
   - **Features:** Are all documented features still present? Any undocumented features?
   - **Dependencies:** Are documented dependencies current? Any deprecated?
   - **Generated status artifacts stale? (T29.3, H7/C-1):** if the project has a `docs/work/plan.json`
     module layer and a generated `docs/work/STATUS.md`
     (`scripts/gen-status-report.mjs`), run
     `scripts/validators/validate-status-freshness.sh` — it flags the artifact
     stale when its embedded numbers mismatch a live recompute against
     `plan.json`, or the plan has a work event (a module/story closing) newer
     than the artifact's own `generatedAt`. A stale STATUS.md is exactly the
     class of drift this skill exists to catch: numbers a human trusts that no
     longer match reality. Report any stale finding under "Stale" below and
     regenerate with `node scripts/gen-status-report.mjs` as the fix, never
     hand-edit the artifact.

```
▶ Phase 3: Reporting drift...
```
4. Write `docs/STEWARD_REPORT.md`:
```markdown
# Steward Report — [date]

## Drift Found
| Doc section | What it says | What code shows | Fix |
|-------------|-------------|----------------|-----|
| Tech stack | React 18 | React 19.1.0 | Update docs |
| Test command | `npm run test:e2e` | Script doesn't exist | Add script or fix docs |
| File limit | 150 lines | 15 files exceed | Update limit or refactor |

## Undocumented
- src/features/requirements/ — new feature, not in CLAUDE.md
- AI provider dual-source (aiSettings vs ai_providers) — known tech debt, not documented

## Stale
- "Phase 4 Backlog" section references completed items
- Deployment instructions reference old container names
```

### `/steward capture` — Save Session Learnings

After a productive session, capture what was learned:

1. Read recent git history (`git log --oneline -20`)
2. Read any docs/audits/ or docs/reviews/ files created this session
3. Identify decisions, patterns, and constraints that should be in CLAUDE.md
4. Write the updates:
   - New patterns discovered → add to coding standards section
   - New features built → add to features list
   - Decisions made → add to architecture decisions section
   - Known issues found → add to known issues section
   - Commands changed → update the commands section

### `/steward` (full) — Audit + Fix

Run audit, then apply fixes:
1. Update version numbers and tech stack references
2. Add undocumented features to the features list
3. Remove stale references
4. Add session learnings
5. Commit the updates

### Cross-installation lesson intake

`docs/work/LESSONS.md` in this repo (bpm-opencode-experts, the canonical expert-system repo)
is **THE single intake table** for cross-installation lessons — field reports from other
installations, another repo's own loop escalations, anything shaped "we learned X the hard
way." This is not a preference; it is a direct fix for a fragmentation this program's VISION
names: a lesson that lands in a loose folder in another repo (an `expertlessons/LESSONS.md`,
a one-off `FIELD_REPORT.md`) and never gets merged here is a second, unmerged truth — the
next `/steward distill` pass can't distill what it never read.

When capturing or auditing lessons (`/steward`, `/steward capture`, `/steward audit`):
1. Check for lesson content living outside `docs/work/LESSONS.md` in this repo — another
   repo's lessons folder, a field-report doc, a session's ad-hoc notes.
2. Anything found there and not already present here (dedupe by `Source` + `Symptom`) gets
   ported in as a new row, preserving its original `Source` tag (e.g. `field-report:...`,
   `<repo>:<path>`) so provenance isn't lost.
3. The loose copy is left in place (never delete another repo's history) but is no longer
   the thing `/steward distill` reads — flag it in the audit report as "superseded by
   docs/work/LESSONS.md row N" so a future session doesn't treat it as a second source.
4. If a lesson is genuinely repo-specific (only makes sense in one codebase's context), it
   still gets a row here — the canonical table indexes ALL cross-installation learning, not
   just the general-purpose subset.

### `/steward distill` — The Distillation Loop (per release)

Compress operational experience into the prompt corpus — what training does
for weights, done for protocol files. Frequently-needed knowledge graduates
into prompts/exemplars where it costs zero recall calls forever; chronic
failure patterns become rubric rules. Run once per release (release-manager
step 9 reminds you), on a cloud-tier model.

```
▶ Phase 0: Memory DB hygiene (execute M5 — the one place it actually runs)
```
0. If the memory MCP is available, run the consolidation M5/MEMORY_PRIMER prescribes
   but nothing else executes (82 stores accumulate with 0 cleanup otherwise):
   a. `memory_consolidate({ dryRun: true, decayAfterDays: 30 })` — preview the merges
      (duplicates), decays (unused >30d), and clusters to summarize. Sanity-check the
      preview; if it proposes decaying something load-bearing, stop and inspect.
   b. `memory_consolidate({ dryRun: false, decayAfterDays: 30 })` — apply it.
   c. `memory_forget(...)` any memory the report or your review shows is wrong/superseded
      and not just stale (feedback-flagged `wrong`/`duplicate` entries are the candidates).
   This is DISTINCT from the prompt-corpus distillation below (that compresses agent
   prompts; this prunes the runtime memory DB). Skip silently if no memory MCP.

```
▶ Phase 1: Gather the evidence
```
1. `npm run telemetry:report` (or `node scripts/telemetry-report.mjs --days 30`) —
   token/duration distributions per agent×model, retry + escalation rates,
   validator gap rates. No data → say so and stop; the loop needs evidence.
2. Read `docs/work/EVAL_RESULTS.json` (latest eval run) and, if present,
   recent `docs/reviews/VERIFY_*.md` / challenger verdicts — where did
   verifiers reject specialist output, and why?

```
▶ Phase 2: Diagnose (per agent, worst offenders first)
```
3. For each agent with a bad signal (high retry rate, escalations, eval FAILs,
   repeated verifier rejections), classify the failure:
   - **Format failures** → the exemplar is missing or weak → update/replace
     the matching `exemplars/` file (keep the cross-domain rule)
   - **Judgment failures** (wrong severity, missed category) → tighten the
     rubric: FINDING_SCHEMA / FINDINGS_SCHEMA calibration tables, or the
     agent's Hard rules
   - **Budget failures** (truncation, timeout, escalation to bigger tier) →
     adjust CONTEXT_BUDGET tier rows / run-plan TIMEOUTS / `tier_needed`
     guidance — from the observed p95s, not guesses
   - **Recurring identical verifier feedback** → that sentence belongs IN the
     agent prompt; add it and note "distilled from <evidence> on <date>"

```
▶ Phase 3: Apply + verify
```
4. Make the edits in the CANONICAL repo (bpm-opencode-experts), one commit per
   agent touched, each commit message citing the evidence row.
5. Re-run `npm run evals` (deterministic) — protocol edits must not regress
   the golden tasks. If agent-mode eval data motivated a change, re-run that
   fixture with `--agent` to confirm the fix.
6. `npm run build:claude` + standard release flow.

**Distill rules:**
- Evidence in, opinion out — every change cites a telemetry row, eval result,
  or verifier verdict. No evidence, no edit.
- Small batches — ≤5 distilled changes per release; measure before more.
- Exemplars stay cross-domain (`exemplars/README.md` rule 2) when updated.
- The loop also PRUNES: a prompt rule that telemetry shows never fires (zero
  related failures across releases) is a token tax — flag it for removal.

**Rules:**
- Never delete information — mark stale content as `(archived)` or move to a `## Historical` section
- Every update has a reason — don't rewrite docs for style, only for accuracy
- If uncertain about a drift finding, flag it as "verify with team" rather than auto-fixing
- Write findings to disk immediately — don't accumulate
