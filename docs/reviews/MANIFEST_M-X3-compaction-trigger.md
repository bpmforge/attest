# Completion Manifest — M-X3-compaction-trigger (WP-X3)

## Delivered
- `plugins/lib/compaction-trigger.ts` (new, pure): `createCompactionTrigger({thresholdFor, minGapTurns=10})` with
  `observe({sessionID, model, tokensIn, turn}) -> {action:'none'|'compact', threshold, reason}` and `noteCompaction()`;
  `resolveThreshold` / `contextWindowFor` / `createThresholdResolver` (EXPERTS_COMPACT_AT: absolute tokens, 0-1 fraction of the
  window, `0`/`off` disables; default 0.6 x `models.json models[<provider>/<model>].context_window`, exact key or `*` glob key;
  unknown -> null = disabled, logged once); `createCompactionHandler` (own per-session turn clock, dedupes message ids, writes the
  `{source:"compaction-trigger", session, turn, tokens_in, threshold, model}` telemetry row, injects the directive, requests compaction).
- Shells: `plugins/expert-hooks.ts` (v1) and `plugins-v2/expert-hooks/index.ts` (v2) call the handler next to the telemetry/stall handler and
  forward `session.compacted` so the 10-turn gap restarts from an observed compaction. `plugins/resume-anchor.ts`: comment only.
- `scripts/sync-model-limits.mjs`: new `--write-models` records LM Studio's `loaded_context_length` as `models.json` `context_window`
  (dry-run unless `--write`).
- `scripts/test-hook-guards.ts`: 12 new checks (rising fixture fires once at the threshold; no second fire within 10 turns, re-fire at 11;
  observed compaction resets the gap; unknown model + no env never fires; `EXPERTS_COMPACT_AT=0.5` and `=50000`; handler request/fallback/telemetry; wiring).

## Compaction-request mechanism (choice)
- **v1:** `client.session.summarize({path:{id}, body:{providerID, modelID}})` from the plugin input's `client` (same call as /compact;
  verified present in the installed `@opencode-ai/sdk`). `experimental.session.compacting` is compacting-time only and cannot request one.
  The resume-anchor compacting hook still fires for it. On a missing client / rejection the directive tells the model to run `/compact`.
- **v2:** same request via `ctx.client.session.summarize` or `ctx.session.summarize` (ASSUMPTION, unverified), else directive-only.
  **Preferred v2 knob is native `compaction.keep.tokens` in opencode.json**; the hook trigger is the fallback.
- Injection channel: `warn()` — the same one as TURN BUDGET / STALL DETECTED. Directive text = `compactionContext(buildAnchor(root))` (X6's text).

## Deliberate choices
- `tokens_in` for the trigger = input + cache.read + cache.write (what the model actually received; with prefix caching `input` alone under-reads).
  The telemetry row logs that sum.
- Fires at `>=` threshold. Gap is measured in completed assistant messages per session (not EXPERTS_MAX_TURNS-dependent).
- `models.json`: **no `context_window` values added.** No sourced number exists in the repo (LOCAL_LLM_GUIDE's "32k" is a recommendation, not
  the loaded window). With none, the default is disabled for that model (one-time notice) unless EXPERTS_COMPACT_AT is set.
  Populate on the Mac: `node scripts/sync-model-limits.mjs --config <opencode.json> --write --write-models`.

## Verification
- `npm test`: baseline 1239 passed / 4 failed -> 1251 passed / 4 failed (+12, same pre-existing failures).

## Unmet / VERIFY ON MAC
- Before/after `in_p95` cannot be measured here. On the Mac compare `npm run telemetry:report` `in_p95` for local coding-agent about a week after enabling.
- Real-session check that `client.session.summarize` from inside `message.updated` behaves while the loop is mid-run (the call is fire-and-forget; if
  OpenCode rejects it as busy the fallback `/compact` directive is injected instead).
- v2 payloads (`session.compacted`, summarize API) are assumptions like the rest of the v2 shells.
- `models.json` `context_window` values (see above).
