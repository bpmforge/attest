# lemonade-cashbox — proof-of-signal eval fixture

A deliberately-broken money library for a kid's lemonade stand. Unlike the other
fixtures (which check "does the scanner/agent *find* a planted defect"), this one
is **outcome-based and multi-step**: the agent must actually **fix the code so a
failing test suite goes green**. That exercises the scaffold's core value — the
verify-and-iterate loop (run tests → read failures → fix → re-run) — and is hard
enough to escape the ceiling effect where every model passes.

- **`cashbox.mjs`** — six money helpers, each with a real bug. There are no
  `// BUG` labels: the agent must diagnose each failure from the test output,
  not from comments.
- **`cashbox.test.mjs`** — a zero-dependency `node:test` suite (Node ≥ 20). It
  **fails on the shipped code**; the task is to make all six tests pass without
  editing the tests.

Run the suite: `node --test cashbox.test.mjs` (exit 0 = all fixed).

> Maintainers: this code is **intentionally incorrect** — do not "fix" it in the
> canonical repo. The eval agent fixes a throwaway copy. The expected behaviour
> is fully specified by `cashbox.test.mjs`.

Off-domain theme (lemonade stand) so it never collides with a real project
domain — same G7 logic as `exemplars/`.
