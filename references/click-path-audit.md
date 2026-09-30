# Click-Path Audit — handlers that individually work but cancel each other

Static, read-only audit for the bug class that lint, types and even a live click-through miss: every function in a button's
handler works, the page renders, and the button still "does nothing" because a later call silently undoes an earlier one.
Mined from ECC `click-path-audit` (MIT, affaan-m/ECC). Use it as the **static preflight** for `ui-verifier` and as a
review pass in `frontend-design`: it finds the suspect handlers; the browser then proves them.

Real example: a "New Email" button ran `setComposeMode(true)` then `selectThread(null)`. `selectThread` also reset
`composeMode: false`. Both calls worked; the button did nothing.

## When to use / not
- USE: a user reports a button that does nothing; after editing a shared store action (audit every caller); after a refactor
  touching shared state; before release on critical flows. Live UI checks showed no error.
- NOT: API-level bugs (wrong response shape, missing endpoint) → systematic debugging; layout/styling → visual review;
  performance → profiling.

## Step 1 — map the state stores (do this FIRST; everything else depends on it)
For each store / context / reducer in scope (Zustand, Redux, Pinia, React context, signals), for every action:
`actionName → { sets: [...], resets: [...] }`. The dangerous entries are **actions that clear state they do not own**:

```
STORE emailStore
  setComposeMode(bool)   → sets {composeMode}
  selectThread(t|null)   → sets {selectedThread, messages, drafts}  RESETS {composeMode:false, composeData:null}
DANGEROUS RESETS: selectThread resets composeMode (owned by setComposeMode); reset() resets everything
```
Search aids: `grep -nE 'set\(\s*(\(?state\)?\s*=>\s*)?\(?\{'` (Zustand `set`), `createSlice|reducers:` (Redux Toolkit),
`useReducer\(`. Read each action body; a reset is any field set back to its initial/empty value that the action's name
does not promise.

## Step 2 — audit each touchpoint
For every button / toggle / submit in scope: find the handler (`onClick|onSubmit|onChange`), list its calls IN ORDER,
look each up in the Step 1 map, and check the FINAL state against what the label promises.

| # | Pattern | Signature |
|---|---------|-----------|
| 1 | Sequential undo | call A sets X; a later call B (side effect) resets X. First call was pointless |
| 2 | Async race | two un-awaited promises each `setState` the same field; the result depends on resolution order |
| 3 | Stale closure | `setCount(count+1)` twice from one captured `count` increments once (`useCallback` deps); use the functional form |
| 4 | Missing transition | the label promises "Save/Delete/Send" but the handler only validates/flags — no API call, or the endpoint is gone |
| 5 | Conditional dead path | `if (flag) { doTheThing() }` where `flag` is always false at that point |
| 6 | Effect interference | button sets `x = true`; a `useEffect` watching `x` resets it (or refetches and overwrites it) |

## Step 3 — report
One entry per bug: `CLICK-PATH-NNN [CRITICAL|HIGH|MEDIUM|LOW]` · touchpoint (label, `file:line`) · pattern # · the ordered
trace with the conflicting `RESETS` marked · expected vs actual · a specific fix. A finding without the ordered trace is
not a finding. Severity: user-visible dead action on a core flow = HIGH; data loss (a reset drops unsaved input) = HIGH.

## Scope control (this audit is expensive)
Full app: launch once after a major refactor; map the stores first, then audit page by page. Single page: after building
it or after a bug report. Store-focused: after changing a store action — audit every consumer of that action only.
Then hand each suspected handler to `ui-verifier` to reproduce it in the browser (click, assert the final state).
