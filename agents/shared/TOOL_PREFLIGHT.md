---
description: 'Reference document — read on demand, not an agent. The enforced tool-preflight + diagnose-before-retry contract for agents that run external scanners/profilers (semgrep, checkov, trivy, py-spy, lizard, jscpd, …). The scanner IS the job, so an absent tool must degrade or SKIP loudly — never run blind, never `|| true` a scan into a false clean.'
disable: true
mode: "all"
---

# Tool preflight & diagnose-before-retry

The enforced version of the "check, don't assume" reminder in
`cli-tools-present.md`, for agents whose job is running an external tool that is
**frequently not installed** (security scanners, profilers, complexity/dup
tools). Two failure modes this prevents:

- **Loop:** run `semgrep`/`py-spy`/`checkov` → `command not found` → retry blind.
- **Silent false-clean (worse):** `checkov … || true` → the scanner is missing, the
  command "succeeds" with 0 findings, and a broken gate reads as a passed one.

## Step 0 — Preflight (before Phase 1)

Probe the tools you're about to run, once, and decide up front:

```bash
for t in <the tools this run needs>; do
  command -v "$t" >/dev/null 2>&1 && echo "have: $t" || echo "MISSING: $t"
done
```

For each tool that's **missing**, do exactly one of — never a third thing:
1. **Degrade** to the named fallback and say so in the report ("semgrep absent →
   grep-based pass, lower confidence"), OR
2. **Skip loudly**: record `SKIPPED: <tool> not installed (<install cmd>)` in the
   output so a missing scanner is visibly un-run, not a clean pass.

**Forbidden:** `<scanner> … || true`. Swallowing a scanner's failure turns "the
tool didn't run" into "0 findings" — a false clean. Gate on presence instead:

```bash
# WRONG — false clean when checkov is absent or errors:
checkov -d . --output json > out.json 2>&1 || true
# RIGHT — runs only if present; absence is recorded, not hidden:
if command -v checkov >/dev/null 2>&1; then
  checkov -d . --output json > out.json 2>&1 || echo "checkov FAILED — investigate, do not treat as clean"
else
  echo "SKIPPED: checkov not installed (pip install checkov)"
fi
```
Distinguish the three states explicitly: **ran-and-clean**, **ran-and-failed**
(surface it), **not-run** (SKIPPED). Only the first is a pass.

## Diagnose before you retry

A tool command that fails is almost never fixed by running it again. Map the
error to a cause and change something; the generic 3-strike LOOP_PREVENTION still
applies, but you should rarely reach it.

| Symptom | Cause | Fix (don't re-run blind) |
|---|---|---|
| `command not found: <tool>` | not installed, or wrong binary name | preflight said MISSING → degrade or SKIP; check the real name (`ripgrep`→`rg`, `pip-audit` not `pipaudit`) |
| runs interactively / hangs | expects a TTY or a running target | add the non-interactive flag; confirm the target/server is up |
| `permission denied` / `Operation not permitted` | needs privileges (e.g. `py-spy` needs ptrace; `perf` needs `perf_event_paranoid`) | run with the documented privilege, or SKIP with that reason — don't retry identically |
| exits 0 with empty output | wrong path/glob, or nothing matched | fix the target path before concluding "clean" |
| `unknown flag` / arg error | tool version differs | `--version`, adjust flags; don't repeat the same rejected args |
| "no <manifest> found" | project doesn't use that ecosystem | that's a legitimate skip, note it — not a failure |

After diagnosing, if you still can't resolve it in **2 attempts**, STOP and record
the exact error + what you ruled out (degrade or SKIP) — never loop.

## Install/fallback hints for the common tools

| Tool | Install | Fallback if absent |
|---|---|---|
| semgrep | `pipx install semgrep` | grep for the rule patterns manually |
| checkov | `pip install checkov` | manual IaC review (hardcoded creds, open SG, public buckets) |
| trivy | `brew install trivy` | manual base-image/CVE review |
| trufflehog | `brew install trufflehog` | `git log -p \| grep -iE 'key|secret|token'`, git-secrets |
| syft / grype | `brew install syft grype` | `<pm> audit` (npm/pip/cargo) |
| py-spy | `pip install py-spy` (+ ptrace priv) | `node --prof` / cProfile / add timing logs |
| perf | Linux `linux-tools` (root) | py-spy / language profiler |
| lizard | `pip install lizard` | `radon` (Python), `wc -l` proxy, manual nesting scan |
| jscpd | `npx jscpd` | `fdupes` (file-level), manual near-dup scan |
| pip-audit / cargo audit / govulncheck | `pip install pip-audit` · `cargo install cargo-audit` · `go install golang.org/x/vuln/cmd/govulncheck@latest` | the ecosystem's own advisory DB / manual dep review |

The rule in one line: **a tool you didn't verify is present is a tool you don't
run blind — you degrade, or you SKIP loudly, and a missing scanner never reads as
a clean pass.**
