# Expert Review Process — How It Works

A documented methodology for how the expert system reviews, plans, and remediates codebases. Written from the real experience of reviewing Flow Threat Model (~114K lines) and taking it from B- to A- in one session.

This is a repeatable process. Jarvis (or any system) can follow these steps.

---

## The Process (5 Phases)

```
Phase 1: Onboard          → Understand what exists
Phase 2: Multi-Expert Review  → Find issues from different angles
Phase 3: Prioritize & Plan    → Rank by impact, group into waves
Phase 4: Fix Loop              → Implement wave by wave, verify each
Phase 5: Re-Audit & Iterate   → Run experts again, fix what they find, repeat
```

---

## Phase 1: Onboard the Codebase

**Goal:** Understand the system before judging it.

**Detailed subprocess:**

1. **Read project metadata** (5 min)
   - CLAUDE.md (conventions, what rules the project enforces)
   - README.md (what the system does, how to run it)
   - package.json/Cargo.toml (entry point, dependencies, scripts)

2. **Scan structure** (5 min)
   - `Glob **/*.{ts,rs,py}` — count files, understand size
   - Identify entry points: `Grep "listen\|createServer\|main\(\)" src/`
   - Find tests: `Glob **/test*` or `Glob **/*.test.*`

3. **Trace ONE entry point completely** (15 min per entry point)
   - Read the file top-to-bottom
   - Follow every import 2-3 levels deep
   - Draw a Mermaid sequence diagram for the flow
   - Stop when you hit a dependency (database, external API)

4. **Map patterns** (10 min)
   - Read 3-5 files in each major directory
   - Note: import style, error handling, state management, naming

5. **Produce docs** (10 min)
   - `docs/ONBOARDING.md` with C4 diagrams, ERD, "How to Add a Feature"

**Key insight:** Don't skip this. The review needs to compare against THIS codebase's patterns, not ideal patterns. Understanding what the project INTENDED (documented in CLAUDE.md) vs what it ACTUALLY does is where findings come from.

**Artifacts produced:**
- C2 Container diagram (system architecture)
- C3 Component diagrams (backend services, frontend features)
- ERD (key entity relationships)
- ONBOARDING.md (setup, architecture, how-to guides)

---

## Phase 2: Multi-Expert Review (Parallel)

**Goal:** Find issues from multiple angles simultaneously.

**What we did:** Launched 3 expert reviews in parallel, each with a different lens:

### Expert 1: Security Auditor
**Mindset:** "Think like an attacker — what's most valuable? What's weakest?"

What they checked:
- Auth & session management (JWT validation, token rotation, session fixation)
- Input validation (Zod on all inputs? Raw req.body anywhere?)
- Secret scanning (hardcoded passwords, API keys in source)
- CSRF & CORS configuration
- Rate limiting on sensitive endpoints
- Dependency audit (`npm audit`)
- WebSocket authentication
- Setup endpoint security (can it be re-triggered?)

**What they found (Flow Threat Model):**
- CRITICAL: AI API keys stored plaintext in setup path (bypasses encryption service)
- HIGH: SSRF in public test-ai endpoint
- HIGH: JWT secret fallback to hardcoded value
- HIGH: Legacy webhook with zero authentication
- MEDIUM: Refresh tokens not rotated, session cache not invalidated

### Expert 2: Code Quality Reviewer
**Mindset:** "Could a new team member understand this in 30 minutes?"

What they checked:
- File size compliance (project enforces 150-line limit on components)
- DRY violations (copy-pasted functions across files)
- Error handling consistency (two patterns found — only 7/84 files used the standard one)
- TypeScript quality (`any` casts, `@ts-ignore`, missing types)
- console.log in production code
- Dead code and unused features
- Test coverage gaps

**What they found:**
- `getAuthUser()` copy-pasted 29 times (shared helper existed but wasn't used)
- Two incompatible error response patterns
- 29 `any` casts in the most security-critical file (auth.ts)
- 46 `console.log` calls in production services
- 8 test files for 84+ API routes

### Expert 3: Architect & API Designer
**Mindset:** "Is this consistent, scalable, and well-structured?"

What they checked:
- API response format consistency
- HTTP method semantics (PUT vs PATCH)
- Database indexes on frequently-queried columns
- Module coupling (routes → services → repositories)
- State management patterns
- Scalability concerns (in-memory data, N+1 queries)
- API versioning strategy

**What they found:**
- 81/88 route files bypass standardized response helpers
- Repository layer exists but is completely unused (dead code)
- Missing indexes on Threat.status, Mitigation.status
- Yjs collaboration docs held in-memory only (no horizontal scaling)
- No soft delete on Project/ThreatModel (accidental deletion = data loss)

**Key insight:** Three experts find different things. Security misses code quality issues. Quality misses architecture issues. Architecture misses security issues. You need ALL THREE to get a complete picture.

---

## Phase 2b: Challenger Protocol

**Goal:** Pressure-test the expert findings before committing to a remediation plan. Catch overconfident assessments, unstated assumptions, and missing failure modes before they become expensive rework.

**When to run it:** After Phase 2 (all findings are in), before Phase 3 (before the plan is written). Also run it after Phase 3 to challenge the remediation plan itself.

**How it works:**

The `challenger` agent reads the Phase 2 findings and generates 5–8 adversarial challenges graded by severity:

| Severity | Meaning |
|----------|---------|
| FATAL | The finding or proposed fix is provably wrong — proceeding will cause harm |
| MAJOR | A significant assumption is unstated or likely false |
| MINOR | Incomplete analysis — a reasonable counter-case was not considered |
| NITPICK | Style / framing issue — doesn't affect correctness |

Each challenge must include: the specific claim being challenged, the counter-evidence or missing case, and what would have to be true for the original claim to hold.

**Rebuttal cycle:**

The specialist (or sdlc-lead) must respond to each challenge with one of:
- **DEFENDED** — the challenge was answered; original finding stands with clarification
- **CONCEDED** — the finding was wrong or overstated; must be revised before proceeding
- **DEFERRED** — acknowledged limitation; noted as a risk, not blocking

FATAL and MAJOR challenges that are not DEFENDED block the gate. CONCEDED items become mandatory revision tasks.

**Output:** `docs/work/challenger/challenge-<phase>.md`

**Practical use:**

In the ThreatForge review, running the Challenger after the security audit caught:
- A MAJOR challenge on a "CRITICAL" auth finding — the actual risk was lower because a compensating control in the nginx layer was missed
- A FATAL challenge on a proposed DB index fix — it would have caused a write-lock regression on a high-traffic table
- Three MINOR challenges that led to more precise remediation targets (file:line instead of "in this module")

**Skip condition:** `/challenge --quick` skips the rebuttal cycle and produces the challenge list only — useful for low-stakes review passes where you want the adversarial scan but don't have time for the full cycle.

---

## Phase 3: Prioritize & Plan

**Goal:** Turn 20+ findings into an actionable, ordered plan.

**What we did:**

### Step 1: Rank by severity and impact
Used the severity matrix (CRITICAL → HIGH → MEDIUM → LOW → INFO) plus a practical impact assessment: "If we don't fix this, what happens?"

### Step 2: Group into waves
Findings that touch the same files or use the same pattern go together. Independent waves can run in parallel.

```
Wave 1 — Quick wins (mechanical search-replace)
  GAP-2: Extract shared getAuthUser (29 files, same pattern)
  GAP-3: PUT → PATCH (16 routes, same change)
  GAP-8: console.log → logger (46 calls, same replacement)

Wave 2 — API standardization (largest effort)
  GAP-1: Migrate 81 route files to response helpers

Wave 3 — Architecture (schema + utility changes)
  GAP-6: Access check caching
  GAP-7: Soft delete on Project/ThreatModel

Wave 4 — Quality (tests + file decomposition)
  GAP-5: Write tests for P0 routes
  GAP-4: Decompose oversized files

Wave 5 — Scalability (infrastructure)
  GAP-9: BullMQ background job queue
```

### Step 3: Define measurable targets
Every gap gets a metric you can grep for:

| Gap | Metric | Start | Target | Command to Measure |
|-----|--------|-------|--------|-------------------|
| GAP-1 | Raw reply.status() | 712 | <100 | `grep -rn "reply\.status(" | wc -l` |
| GAP-2 | Local getAuthUser | 20 | 0 | `grep -rn "function getAuthUser" | wc -l` |
| GAP-8 | console.* in services | 15 | 0 | `grep -rn "console\." services/ | wc -l` |

**Key insight:** If you can't measure it, you can't verify it's fixed. Every gap needs a grep command.

### Step 4: Write the plan document
`docs/GAP_REMEDIATION_PLAN.md` with:
- Each gap: root cause, files affected, fix pattern, acceptance criteria
- Execution order with dependencies
- Success metrics table

---

## Phase 4: Fix Loop

**Goal:** Implement systematically, verify after each wave.

### Pattern: Parallel Agents for Mechanical Fixes

For search-replace work (Wave 1, Wave 2), we launched multiple background agents:
- Each agent gets a batch of files (10-20 per batch)
- Each follows the same replacement pattern
- All run in parallel — no file conflicts since batches don't overlap
- Type-check after each batch: `npx tsc --noEmit`

**Example — Wave 2 (API standardization):**
```
Agent A: organizations.ts, members.ts, settings.ts, users.ts (high traffic)
Agent B: auth-public.ts, api-tokens.ts, two-factor.ts, sso.ts (security)
Agent C: threat-library.ts, webhooks.ts, pipelines.ts, sequence-diagrams.ts (features)
```

Each agent:
1. Reads the file
2. Adds import: `import { sendSuccess, sendNotFound, ... } from '../utils/api-response.js'`
3. Replaces all `reply.status(N).send({...})` with the matching helper
4. Removes local `getAuthUser()` definition, imports from shared utility

### Pattern: Direct Fixes for Security Issues

Security fixes (Wave 1 Sprint 1) were done manually — too important for batch processing:
1. Read the vulnerable code
2. Understand the existing correct pattern (how ai-providers already encrypts keys)
3. Apply the same pattern to the vulnerable path
4. Type-check immediately
5. Commit and push

### Commit Strategy

One commit per wave or sprint. Each commit message lists:
- Which gaps were addressed
- Specific metrics (before/after)
- Files changed

```
fix(security): Sprint 1 — 5 security hardening fixes from expert review

S1 [CRITICAL]: AI API keys now encrypted via AIProvider table
S2 [HIGH]: JWT secret fallback only allowed in NODE_ENV=development
S3 [HIGH]: SSRF in /api/setup/test-ai blocked in production
S4 [HIGH]: Legacy webhook endpoint returns 410 Gone
S5 [MEDIUM]: Webhooks require ciWebhookSecret — 403 if missing
```

---

## Phase 5: Re-Audit & Iterate

**Goal:** Verify fixes worked. Find issues the fixes introduced. Repeat.

**What we did:** Launched the SAME 3 expert reviews again, this time with verification focus:

Each expert got:
1. The list of previous findings
2. Instruction to verify each: "FIXED" or "STILL OPEN" with evidence
3. Instruction to check for NEW issues introduced by the changes
4. **For each FIXED finding:** The commit/files that changed, so the expert knows WHERE to look
5. **Focus areas:** "These 5 files were modified — check for regressions"

### Re-Audit Preparation

For each finding that was FIXED, provide the expert:
```
Previous: CRITICAL — AI API keys stored plaintext (setup.ts:285)
Fix: Created AIProvider table with encryption (commit abc123)
Files changed: src/api/setup.ts, src/models/AIProvider.ts, migrations/add-encryption.sql
Re-audit: Verify encryption works, grep for plaintext keys elsewhere, check key rotation
```

This tells the expert EXACTLY what changed, so they can verify the fix AND check for new issues in those specific files.

### What the re-audit found:

**Verified fixed (10 items):** AI keys encrypted, JWT hardened, SSRF blocked, webhooks secured, token rotation, session invalidation, indexes added, auth typed, logger created, dead code removed.

**Still open (3 items):**
- GitLab/Bitbucket webhooks still warn-only (GitHub was fixed, others missed)
- V1 GitHub integration webhook had zero auth (different endpoint, same problem)
- Auth-public endpoints missing rate limits

**We fixed these immediately** — same session, another commit. Then measured again.

### The Fix-Verify Loop

```
Review → Plan → Fix → Re-Review → Fix remaining → Re-Review → Confident
  ↑                                    ↑
  First pass: 20 findings              Second pass: 3 new findings
                                            Fixed in real-time
```

**Key insight:** The re-audit is not optional. Fixes introduce new issues. The security auditor found that fixing GitHub webhooks exposed the fact that GitLab/Bitbucket had the same vulnerability — we'd only fixed one of three providers. Without the re-audit, two webhook endpoints would still be open.

---

## Results

### Grade Calculation

Overall Grade = weighted average:
- **Security (40%)**: 0 CRITICAL = A, 1 CRITICAL = C, 2+ = F. Each unresolved HIGH = -1 sublevel
- **Code Quality (30%)**: 0 files >300 lines & 0 `any` = A. Each 5 violations = -1 sublevel
- **Architecture (20%)**: Modular + consistent = A, mixed = C, monolithic = D
- **Test Coverage (10%)**: >80% = A, >60% = B, >40% = C, <40% = D

### Flow Threat Model Metrics

| Metric | Before | After |
|--------|--------|-------|
| Security grade | C+ (1 CRIT, 3 HIGH) | **B+** (0 CRIT, 0 HIGH) |
| API consistency | D+ (7/88 standardized) | **A-** (91/91, 95% reduction) |
| Code quality | C (29 any, 46 console.log) | **B+** (0 any, 0 console.log) |
| Architecture | B (unused repo layer) | **A-** (cache, soft deletes, job queue) |
| Test coverage | D (8 test files) | **C+** (10+ files, 46 new tests) |
| Overall | **B-** | **A-** |

### Effort

| What | Count |
|------|-------|
| Commits | ~20 |
| Files changed | 150+ |
| Lines touched | ~20,000 |
| Agents used | ~15 parallel agents across 5 waves |
| Time | 1 session |

---

## How Jarvis Can Use This

### As a Pipeline Phase

```
Phase: Expert Review
  Step 1: Onboard (read codebase, produce C4 diagrams)
  Step 2: Multi-expert review (security, quality, architecture — parallel)
  Step 3: Prioritize findings into gap plan
  Step 4: Fix waves (mechanical agents for batch work, direct for security)
  Step 5: Re-audit and iterate until confident
```

### Key Implementation Notes

1. **Experts must read before judging.** Every expert's Phase 1 is "Read CLAUDE.md, understand the codebase." Without this, findings are generic checklists, not project-specific issues.

2. **Three experts minimum.** Security, code quality, and architecture find different things. One expert misses what another catches.

3. **Measurable targets.** Every gap needs a grep command to verify it's fixed. "Improve error handling" is useless. "`reply.status()` calls < 100" is actionable.

4. **Parallel batch agents for mechanical work.** The biggest productivity gain: 3 agents each handling 20 files simultaneously for search-replace operations. One agent doing 60 files sequentially would take 3x as long.

5. **Re-audit is not optional.** Fixes introduce new issues. The fix-verify loop catches them. A second pass found 3 issues the first fix round missed.

6. **Commit per wave, not per file.** Each commit should represent a complete logical unit with before/after metrics in the message.

7. **Infrastructure first, adoption second.** Create the shared utility (api-response.ts, auth-helpers.ts, logger.ts) first, then migrate files to use it. Don't try to standardize and create the standard at the same time.

---

## Template: Gap Remediation Plan

For each gap discovered:

```markdown
### GAP-N: [Title]
**Grade:** [current] → [target]
**Metric:** [what to measure] | Start: [N] | Target: [N]

**Root Cause:** Why this happened (not just what's wrong)

**Files Affected:**
- file1.ts (N occurrences)
- file2.ts (N occurrences)

**Fix Pattern:**
[The exact transformation — before → after code]

**Acceptance Criteria:**
`grep command` returns [expected result]
```

---

## Template: Expert Review Prompt

```
You are a senior [security engineer / code reviewer / architect]
performing a [initial / follow-up] review of [project] at [path].

[For initial]: Think like [attacker / new team member / system designer].
Check these areas: [list of specific checks with file paths].
For each finding: SEVERITY, file:line, what's wrong, how to fix.

[For follow-up]: Verify these previous findings are fixed: [list].
State FIXED or STILL OPEN with evidence.
Also check for NEW issues introduced by the changes.
```
