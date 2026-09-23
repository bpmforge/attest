# End-design alignment matrix — opencode-experts · Shipwright · Jarvis/Foreman

**Date:** 2026-07-12 · **Owner doc** (canonical repo). The three systems must converge on ONE
end design; this matrix is the checklist. ✅ = shipped/verified · 🔶 = partial · ⬜ = planned
(owning tracker item in parentheses). Release order: **opencode v2.x → Shipwright → Foreman**.

| # | End-design capability | attest (v2.0.0) | Shipwright (23/65) | Jarvis/Foreman (master) |
|---|---|---|---|---|
| 1 | Expert library: 85 experts · 66 validators · 26 protocols, exact parity | ✅ canonical | ✅ `content/` imported (⬜ re-sync from v2.x at resume — SW-R1) | ⬜ `build:foreman` port (FM-W3) |
| 2 | Receipts-not-flags: content+hash gate receipts, two-way re-verify, signed waivers | ✅ T27.1/T27.2 | ✅ W0-05 (keyed-HMAC anchor) | 🔶 locks/logs only (FM-W3/W4) |
| 3 | Ticket lifecycle: six verbs, WIP=1, close needs manifest+verify+commits, accept maker≠verifier | ✅ tickets.mjs | ✅ W0-03/04 | ⬜ adopt plan.json + verbs (FM-A1) |
| 4 | Finding ledger + tier-aware loop budgets (stall=2→escalate; PROGRESSED converge 6 metered/12 local; REGRESSED zero-tolerance; infra free-retry) | ✅ protocol (FIX_VERIFY/MICRO_LOOP v2) · 🔶 scripted (fix-verify.mjs lacks REGRESSED/classes — OC-R4) | ⬜ W3-08 | 🔶 runItemMicroLoop passes/confidence (align classes — FM-A2) |
| 5 | Symlink/traversal-safe scope+manifest checks (containment before fs-touch) | ✅ v2 + red test | ✅ E2E · ⬜ Harbormaster W3-09 | ⬜ audit writeScope/manifest paths (FM-A3) |
| 6 | Conductor: fresh session/ticket, limit sleep-to-resume, crash supervisor, morning review queue, never self-merges | ✅ ref impl `scripts/conductor/` · ⬜ module-schema adaptation (OC-R3/T28.x) | ✅ bootstrap · ⬜ product W3-01..07 | ⬜ port for auto-build (FM-A4) |
| 7 | Local-model fitness: soft gates on doc phases, thinking-strip, prescriptive gap prompts, 12-iter budgets, maker/verifier split, escalate-and-record | 🔶 MODEL_ADAPTER + v2 budgets (O2/O3 pending — OC-R2) | ✅ FR-G5 + fitness W2-08 | ✅ merged (localFrontier + coder-expert) |
| 8 | Plan-lint: dep/cycle errors, scope-coverage + sibling-package.json warnings | ✅ scopeCoverageWarnings (advisory) | ✅ conductor `--lint` · ⬜ decomposer W5-07 | ⬜ with plan.json adoption (FM-A1) |
| 9 | Validator TS calibration + red-fixture promotion path (heuristics advisory until fixtured) | ✅ v2 (20 FPs→0) | ✅ gate/advisory split | ⬜ ValidatorRunner (FM-W3) |
| 10 | Memory wired into the loop: recall anchors fire, ACE playbook, sleep consolidation, R0 advisor | 🔶 memory skill + M30 advisor designs (OC-R1/T30.x) | ⬜ W7 (in-process by design) | 🔶 anchors wired; engine gap = SMALL_CONTEXT M-plan (FM-W5) |
| 11 | Autonomy: interactive/auto, NEVER-AUTO immutable, machine-parseable ledger, runtime-validated | ✅ O1 · ⬜ O2/O3 (OC-R2) | ⬜ W3-06 | ⬜ ApprovalQueue (FM-W2/W4) |
| 12 | Field-report intake → lessons → playbook (M29 loop) | ✅ intake merged · ⬜ T29.x automation (OC-R1) | ⬜ W7-05 | ⬜ loop-learn exists; wire to intake (FM-W6) |

**Divergence rules:** (a) protocols/validators change in THIS repo first, then flow: build:claude
→ attest-claude, import-content re-run → Shipwright, build:foreman → Foreman. (b) Runtime
mechanisms proven in Shipwright/Jarvis flow BACK as field reports (M29) before protocol edits.
(c) A capability is "aligned" only when its row is ✅ in all three AND covered by a real test in
each repo (suite/fixture/E2E — see each tracker's Test-truth section).

**Trackers:** OC-* → `docs/RELEASE_TRACKER.md` (here) · SW-* → `shipwright/docs/RELEASE_TRACKER.md`
· FM-* → `ai-assistant-agent/docs/RELEASE_TRACKER.md`.
