chore(release): v3.15.0 — incremental scanning, stall guard, OpenCode v1+v2

Measured motivation (docs/work/telemetry.jsonl, 3,141 assistant turns): 79.7M
of 214M logged input tokens — 37% — were spent on turns that produced 20 or
fewer output tokens; one 602-turn session repeated a 16-token reply from turn
~75 to the end (46.6M tokens) and nothing stopped it. Separately, every audit
re-walked the whole tree on every invocation, and every re-review after a fix
re-read the whole branch. Plan and evidence: docs/work/INCREMENTAL_SCAN_PLAN.md,
docs/work/TOKEN_OPTIMIZATION_PLAN.md §F and rows D1b–D1d.

- Scans are incremental by default. scripts/scan/collect.sh keeps a
  git-ignored ledger; /security and /review-code re-scan only files changed
  since the last full run and carry other findings forward; --full forces a
  whole tree. Reports state the scope. Full is forced every 20th increment,
  when tools/rules change, or when the ledger sha is not an ancestor of HEAD.
- Reviews are delta reviews. integration-review.mjs --since auto reviews only
  the delta since its watermark and reuses verdicts for untouched domains;
  validate-release-readiness.sh refuses a release on a delta-scope summary —
  run --since full before a release. The eight specialist agents carry the
  DELTA REVIEW block (re-check every carried citation with one grep).
- fix-verify re-scans only cited + changed files; validators cache whole-tree
  results by tree hash and accept --since; /sdlc improve and onboard use the
  ledger instead of asking.
- Harness guards: stall guard (warn at 4, abort at 6 repeated or empty
  turns), EXPERTS_MAX_TURNS defaults to 150, resume anchor every 10th turn,
  compaction requested at 60% of the model's context window (needs
  context_window in models.json: node scripts/sync-model-limits.mjs
  --config <opencode.json> --write --write-models).
- OpenCode v1 and v2: install.sh detects the major and installs the matching
  plugin set; build-agents.mjs --target opencode-v2 rewrites frontmatter.
  Built without a v2 binary — see VERIFY ON MAC in
  docs/work/TOKEN_OPTIMIZATION_PLAN.md §F before relying on v2.
- Core/full agent split is available opt-in (install.sh --core-agents):
  30 agents split, median core 11 KB, full methodology under
  agents/shared/full/ on demand. Default stays unsplit until discovery and
  on-demand reads are verified on a real OpenCode.
- models.json roles: coder Sonnet 5.5, reviewer/advisor Opus 5.5,
  challenger GPT-5.5. Run the conductor once with --model-gate warn if the
  provider spells an id differently.
- attest-claude: wave, goal and autopilot skills ported; KNOWN_MISSING_IN_CLAUDE
  is empty; regenerate and tag the sibling with the same version.

Upgrade: ./install.sh --update, then ~/.config/opencode/scripts/doctor.sh.
