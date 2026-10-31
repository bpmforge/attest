# Completion Manifest — M-X1-stall-guard (WP-X1)

Status: COMPLETE (v2 shell unverifiable here — see below)

## Produced
- `plugins/lib/stall-guard.ts` (new, pure): `createStallGuard({warnAt=4, abortAt=6, tinyTokens=20, now, env})`, `observe()`, `stallAbortDecision()`, warn/abort message builders, shell signal helpers (`noteText`, `noteWrite`, `signals`).
- `plugins/lib/telemetry.ts`: `createAssistantMessageHandler` takes optional `stall`; warn via `warn()` (same channel as TURN BUDGET), abort logs `{source:"stall", session, turns, tokens_in_wasted, reason}` and prints `BLOCKED: repeat-output stall after N turns`. Independent of EXPERTS_TELEMETRY (row suppressed when =0).
- `plugins/lib/turn-cap.ts`: `parseMaxTurns` defaults to 150 when EXPERTS_MAX_TURNS is unset; explicit 0/garbage = off.
- `plugins/expert-hooks.ts`, `plugins-v2/expert-hooks/index.ts`: create the guard, feed text parts (`message.part.updated`) and write-tool completions, refuse tool calls after abort (ledger writes allowed, like the turn cap).
- `scripts/test-hook-guards.ts`: 16 new checks. `scripts/telemetry-report.mjs`: `## Stalls` section. `docs/work/TOKEN_OPTIMIZATION_PLAN.md`: row D1b.

## Verification
- Baseline 1214 passed / 4 failed; final 1231 passed / 3 failed (remaining: validate-vendor-provenance RED, attest-claude mode drift, mode 700 — all pre-existing).
- Fixture replay (generated from the row pattern; telemetry.jsonl is git-ignored): warn at turn 78, abort at turn 80 (<= 81).

## Notes / caveats
- Conductor exports no marker: "not under the conductor" is detected as EXPERTS_MAX_TURNS unset. Conductor `--max-turns 0` leaves it unset, so such sessions now get 150 (was uncapped).
- Assistant `info` carries no text; identical-output detection uses `message.part.updated` text parts. If absent (v2 assumption), the guard degrades to the tiny-output rule.
- Bash-driven file writes are not seen as writes (only write/edit/multiedit tools).
- VERIFY ON MAC: plugins-v2 shell is parse-checked only (not type-checked or run).
