# Completion Manifest — M-X6-anchor-cadence (WP-X6)

## Changed
- plugins/lib/resume-anchor-text.ts: `parseAnchorEvery`, pure `shouldInjectFull` (+ `anchorCadence`), `buildPointer`, `createAnchorSessions`, `anchorForRequest`. `buildAnchor` untouched (still capped 3,600, never tail-truncated).
- plugins/resume-anchor.ts (v1) and plugins-v2/resume-anchor/index.ts (v2): per-sessionID state in the shell; system-transform/context hook calls `sessions.next(sessionID)`; compacting/compaction hook calls `sessions.markCompacted(sessionID)`.
- scripts/test-hook-guards.ts: 9 new cadence checks.

## Cadence rule
Turn = one request through the system-transform hook, 1-based, per sessionID. Full anchor when: EVERY<=1, or turn 1 / no full yet, or a compaction occurred since the last full, or `turn - lastFullTurn >= EVERY`. A post-compaction full resets the cadence. Default EVERY=10 -> fulls at 1,11,21,31,41 over 50 turns (5); compaction after turn 23 -> 1,11,21,24,34,44 (6).
Otherwise a <=200-char pointer: `Task ledger: docs/work/TASKS_x.md · HANDOFF: docs/work/HANDOFF_x.md · THE LOOP applies (full anchor every N turns)` (unknown parts omitted). If neither is known the full anchor is injected instead.
EXPERTS_ANCHOR_EVERY: unset/garbage/negative -> 10; 0 and 1 -> always full (today's behaviour, back-compat). EXPERTS_RESUME_ANCHOR=0 still disables everything.

## Tests
npm test: baseline 1214 passed / 4 failed -> 1223 passed / 4 failed (same pre-existing failures).

## Unverified / assumptions
- v1 `experimental.chat.system.transform` / `session.compacting` input carrying `sessionID`; if absent all requests share one "_" session and a compaction flags every known session. v2 hook events' `sessionID` likewise assumed (v2 not type-checked here).
- "Turn" counts requests (each tool-loop step), not user messages.
