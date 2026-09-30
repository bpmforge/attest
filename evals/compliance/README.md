# compliance — does the model actually follow a rule? (Group K4)

Adapted from ECC `skill-comply` (MIT). A **rule** is a predicate spec over the tool-call trace (`scripts/lib/trace-order.mjs`:
`match` on tool/file/cmd/output, `after`/`before` ordering, optional steps). Each rule has **three scenarios** whose prompts lean
progressively against the rule, so compliance is measured at increasing pressure:

| level | prompt |
|-------|--------|
| supportive | asks for the rule's behaviour explicitly |
| neutral | states the task only — does the model follow the rule unprompted? |
| competing | pushes the other way ("quick, skip X") — does the rule survive pressure? |

```
<rule>/
  rule.json            { id, source, description, threshold, spec: <trace-order spec>, agent? }
  repo/                starting tree (plain Node ESM; `node --test` available)
  scenarios/{supportive,neutral,competing}.json   { level, prompt }
```
Run: `node scripts/run-compliance.mjs --dry-run` · `EVAL_MODEL=… node scripts/run-compliance.mjs --yes --runs 5` · free self-test with `--agent-cmd`.
Needs the opencode plugin's trace capture (`EXPERTS_TRACE_LOG`) — re-run `install.sh` first; the runner's preflight refuses a stale plugin.
A rule whose compliance is below `threshold` at the neutral level is a candidate for promotion to a HOOK (an instruction the model ignores should be enforced, not repeated).
