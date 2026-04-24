# BOUNDED_TASK_CONTRACT.md

**Canonical scope rules for every specialist agent running in Bounded Task Mode.**

Single source of truth. Every specialist agent (api-designer, db-architect, researcher, test-engineer, ux-engineer, security-auditor, code-reviewer, sre-engineer, performance-engineer, container-ops, coding-agent, frontend-design) references this file from its "Strict Scope Rules" section instead of duplicating the rules inline.

When sdlc-lead issues a HANDOFF, the prompt begins with `SDLC-TASK for <agent>:`. That phrase activates Bounded Task Mode, and these five rules apply.

---

## The Five Rules

### 1. Write-scope isolation

The HANDOFF prompt assigns one or more exclusive write directories under `CONTEXT` or `PRODUCE`. You may write ONLY inside those directories, plus:
- `docs/work/**`   — tracker and context-packet updates
- `docs/reviews/**` — completion manifests and review reports

Any file outside the assigned scope is a violation. Post-HANDOFF the orchestrator runs `scripts/validators/validate-scope.sh` to confirm. If you believe a cross-scope change is required, STOP and report it in the "Known issues / deferred" section of your Completion Manifest. Do NOT silently edit shared files (package.json, shared utilities, configuration).

### 2. No extra files beyond PRODUCE

The HANDOFF lists the exact files you must produce. Do not produce additional artifacts. Scratch notes go in `docs/work/scratch-<agent>-<date>.md` if you need them. Unused, provisional, or "maybe useful later" files are waste. A reader should be able to diff your branch and see only the PRODUCE list plus the Completion Manifest.

### 3. Verbatim completion phrase

Every HANDOFF ends with an exact completion phrase in the form:

> `<agent> done — <one-sentence summary>`

This phrase is what sdlc-lead watches for to resume. Print it EXACTLY as the HANDOFF specified. Any deviation — emojis, extra words, different punctuation — breaks the orchestrator's resume logic.

### 4. No scope expansion

If you notice an issue adjacent to your task (a typo in a nearby file, a missing test, a broken import somewhere else), DO NOT silently fix it. Document the observation under "Known issues / deferred" in your Completion Manifest. The orchestrator decides whether that observation turns into a follow-up HANDOFF — not you.

Helpfulness > compliance feels right but destroys reviewability. A HANDOFF producing "just what was asked + 3 bonus fixes" is harder to review, harder to revert, and breaks the parallel-wave coordination that assumes each module's author wrote only that module.

### 5. Stop means stop

After printing the completion phrase, STOP. Do not:
- ask "anything else?"
- volunteer follow-up work
- run additional phases of your agent's native flow
- re-verify your own output beyond what the HANDOFF specifies

The orchestrator drives the next step. Your job is done when the phrase is printed.

---

## Enforcement

Post-HANDOFF, the orchestrator runs three automated gates before accepting your output:

| Gate | Script | What it checks |
|------|--------|----------------|
| Scope | `scripts/validators/validate-scope.sh <assigned-dir>` | `git status --porcelain` confined to assigned dir(s) + always-allowed |
| Manifest | `scripts/validators/validate-completion-manifest.sh <manifest>` | Required sections present, completion phrase present |
| Coverage | `scripts/validators/validate-<relevant>.sh` | Domain-specific completeness (e.g. `validate-architecture.sh`) |

Any gate failure blocks the HANDOFF from being accepted. The orchestrator returns the failure detail to you with "REVISE" status, and you re-run with the specific gap to close.

---

## Exceptions

- `/security --deep` and `/sdlc onboard --deep` run the Ralph Wiggum inventory loop, which may legitimately produce more files than initially listed in PRODUCE. In that case the HANDOFF explicitly says "produce one artifact per row in INVENTORY.md" — follow the inventory as the PRODUCE list.
- `coding-agent` may create test files alongside implementation if the HANDOFF says "include tests." The test location must be under the assigned scope (e.g. `src/auth/` assignment implies `src/auth/__tests__/` is in-scope).
- Cross-scope shared-utility changes the HANDOFF explicitly permits must be listed by exact path in the HANDOFF's PRODUCE section. If they're not listed, you may not touch them.

Everything else: five rules, no exceptions.
