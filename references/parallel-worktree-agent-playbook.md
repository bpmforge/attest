# Parallel Worktree Agent Playbook

Reference for briefing multiple agents to ship separate tickets concurrently in this repo (or attest-claude, its generated sibling). Everything here was learned from real incidents dispatching parallel batches — not theoretical. Point a dispatch prompt at this file instead of re-deriving these gotchas inline each time.

---

## Isolation: work in your own worktree, never the shared clone

The shared clone (wherever the orchestrating session's `cd` lives) may have other agents actively using it, or may be left checked out on someone else's branch between turns. Never `git checkout` a branch in the shared clone. Instead:

```bash
git fetch origin main -q
git worktree add /path/to/repo-<ticket-id> -b feat/<ticket-slug> origin/main
cd /path/to/repo-<ticket-id>
npm install
```

Do all implementation, testing, and commits inside that worktree. Push/PR/merge are remote operations and are safe from anywhere. After merge + remote sync, remove the worktree:

```bash
cd /path/to/canonical/clone
git worktree remove /path/to/repo-<ticket-id> --force   # only after everything is pushed/merged
```

**Never touch another agent's worktree directory** — not to read it, and especially not to write into it, even to "fix" something. If you discover contamination or a problem in a sibling worktree, stop and flag it for the orchestrator rather than acting on it yourself.

## Never use `git stash` in a multi-worktree repo

`git stash` maintains ONE shared stash stack per repository (`.git/refs/stash`), not per-worktree. Two agents in separate worktrees of the same repo, each independently `git stash push`/`git stash pop`, are pushing to and popping from the *same* stack — a real incident this session had one agent's stash pop silently consume and drop a different agent's stash entry (clean 3-way apply against the same base commit, so no conflict was shown; the wrong agent's new files just landed as uncommitted contamination in someone else's worktree).

If you need to compare against a baseline (e.g. "what did this look like before my change"), use one of:
- A temporary throwaway worktree: `git worktree add /tmp/baseline-check <ref>`
- `git diff <ref>` or `git show <ref>:<path>` — no working-tree mutation at all

If a stash collision happens anyway: don't assume real work was lost. Check whether the affected worktree's own branch *commits* are still clean (`git log --oneline`, `git show --stat <last-commit>`) — this failure mode has so far only corrupted the uncommitted working tree, never actual commits. Restore the working tree to match its own HEAD (`git checkout -- <modified files>`, remove the specific foreign untracked paths), re-run the test suite to confirm, before telling the affected agent to resume.

## Syncing Gitea after a GitHub merge

Prefer pushing the remote ref directly, with no local checkout needed anywhere:

```bash
git fetch github main -q && git push origin github/main:main
```

## Anti-drift gate flags in an isolated worktree

`--base main` silently resolves to nothing in a fresh worktree that has no local `main` branch (only `origin/main`/`github/main` remote-tracking refs) — this produces a **false-clean** result on `validate-no-reinvent.sh`/`validate-tracker-fresh.sh`, not an error. Always use:

```bash
bash ~/.config/opencode/scripts/validators/validate-no-reinvent.sh --base origin/main .
bash ~/.config/opencode/scripts/validators/validate-tracker-fresh.sh --base origin/main .
```

## attest-claude regeneration: always pass `--out` explicitly

`node scripts/build-target-claude.mjs --check` (or `--write`) defaults `--out` to `join(ROOT, '..', 'attest-claude')` — a path relative to wherever the script is actually running from. In an isolated worktree (or any location that isn't the canonical sibling-directory layout), this resolves to the WRONG path and reports a spurious "everything missing" result. Always pass the real path explicitly:

```bash
node scripts/build-target-claude.mjs --check --out "$HOME/Code/attest-claude"
node scripts/build-target-claude.mjs --write --out "$HOME/Code/attest-claude"
```

If you maintain a local clone of attest-claude for this, keep it fetched/fast-forwarded — a stale local clone produces the same false-drift symptom (files that already merged on the remote showing as "different" against your outdated local copy). `git fetch origin main -q && git merge --ff-only origin/main` before trusting a `--check` result.

## Portability gotchas (macOS stock tools)

- **awk**: this machine's system awk (onetrueawk) has NO GNU extensions. `BEGIN{IGNORECASE=1}` is a silent no-op, not an error — use `tolower()` on both sides of a match instead. `\b` word-boundary is unsupported in awk (though it works fine in `grep -E`) — restructure with explicit `[[:space:][:punct:]]` context checks, a `split()`-then-compare approach, or move the boundary check into `grep -E` piped into awk. Verify any awk-touching fix live against the real `/usr/bin/awk`, not just by reading the pattern — `echo x | awk '/\bx\b/'` prints nothing on stock macOS awk, which is the exact silent-failure class to watch for. Also check for `/regex/i` — that's not valid onetrueawk case-insensitive syntax; it silently concatenates the match result with whatever variable named `i` is in scope (often a loop counter), which can make a check always-true instead of erroring.
- **bash**: 3.2 compat is required (macOS stock `/bin/bash`) — no `declare -A` (associative arrays), no `${var,,}` (use `tr '[:upper:]' '[:lower:]'` instead).
- **bash-version regex divergence**: some `${line//[^...]/}`-style bracket-count idioms behave differently between macOS bash 3.2 and GNU bash 5.x — verified live via a bash 5.x container producing very different match counts against the same real docs. If a check uses this pattern, verify it on both bash versions, not just the dev machine's default.

## File-size discipline

`scripts/test.ts` has a hard 400-line cap (`~/.config/opencode/scripts/validators/validate-file-size.sh`). Every new Pass module goes in its own `scripts/test-<topic>.ts` chapter file — `test.ts` only imports and calls it. If a merge with `origin/main` pushes `test.ts` over the cap (picking up another ticket's new Pass alongside yours), trim comment blocks first (the detailed rationale can live in the chapter module's own header) before considering a deeper restructure.

## Fixture convention

For any validator chained into `validate-phase-gate.sh`'s `GATE_VALIDATORS` lists (or `run-handoff-gates.sh`): `evals/fixtures/validators/<validator-name-without-.sh>/{red,green}/`. RED is mandatory — a chained validator with no red fixture fails `scripts/check-validator-fixtures.mjs` (run as part of `npm test`) unless it's on the shrink-only `GRANDFATHERED.json` list.

## CHANGELOG and the merge gate

`CHANGELOG.md` has an `[Unreleased]` section — add a one-line bullet describing your change. This is what `validate-tracker-fresh.sh --base origin/main` looks for as evidence the work was tracked, and it's one of `agents/git-expert.md`'s merge-gate conditions.

Full merge-gate condition list (run before merging, not just before opening the PR): `npm test` green, anti-drift gates (`validate-no-reinvent.sh --base origin/main`, `validate-tracker-fresh.sh --base origin/main`), and — only if you touched `agents/**.md` — `validate-handoff-discipline.sh`, `validate-persistence-block.sh`, `validate-autonomy-wiring.sh`. `validate-doc-counts.sh`/`validate-doc-catalog.sh` if you added/renamed a doc or validator. `validate-challenger-gate.sh` runs unconditionally.

## Known, disclosed, pre-existing gaps — don't try to fix these as a side quest

- `validate-challenger-gate.sh` currently gaps on `docs/reviews/SECURITY_FINDINGS.md` (missing a matching `CHALLENGE_REPORT_*.md`) — a real, standing, unrelated gap. Confirm it's unchanged by your work (same gap on `origin/main` before your branch existed) and move on.
- The GitHub Actions `test` CI job fails for reasons unrelated to feature work — missing git identity on the runner plus an unrelated `run-evals.mjs` issue, confirmed present across several consecutive merges. Not yours to fix inline; if it's blocking something specific, flag it as its own ticket.

## Independent review, every time

After implementing and before merging, dispatch a genuinely independent, fresh-context review agent (not a fork — it should share no prior context). Brief it to actually reproduce claims live: check out the pre-fix state and confirm the bug was real, check out the fix and confirm it's closed, run the fixtures/tests itself, and actively try to break the fix (edge cases the fix's own logic might not cover, false positives, bypasses). Every review dispatched under this discipline across many tickets has found at least one real, previously-undetected bug — do not skip this step or assume a particular ticket will be the exception.

## Board tickets vs. this repo's own tickets

If your dispatch prompt names a ticket ID from `bpm-agent-amplifier`'s `docs/sdlc/EXECUTION_TICKETS.md`, don't assume the ID is correct without the orchestrator confirming it against `main` — a real incident this session had a ticket survey accidentally run against a concurrent session's unmerged draft branch, producing ticket IDs (`T29.x`/`T30.x`) that didn't exist on the real board. The actual implementation work still shipped fine; only the ID label needed reconciling afterward. If you're ever unsure whether a ticket ID is real, say so in your report rather than assuming.
