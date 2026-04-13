# Semgrep Community Rule Sources

**Last updated:** 2026-04-13
**Tested against:** Semgrep 1.159.0

Semgrep's official registry (`p/owasp-top-ten`, `p/security-audit`, etc.) is a solid
baseline, but the highest-signal rules come from independent security research firms and
community contributors. This guide documents what each source **actually contains** —
tested against real code, not aspirational. Do not add new sources without testing.

---

## Critical Usage Rule: Language Subdirectories Only

**Never point `--config` at a community repo root.**

Every community repo has non-rule YAML files at its root: GitHub Actions workflows
(`.github/workflows/*.yml`), Makefiles, CI configs, test fixtures. Semgrep treats these
as rule files, fails to parse them, and exits with code 7 (config entirely invalid —
scan does NOT run).

**Always use a language subdirectory**, e.g.:
```bash
# ✗ WRONG — exits 7, scan does not run
semgrep scan --config ~/.semgrep/rules/trailofbits

# ✓ CORRECT — scan runs
semgrep scan --config ~/.semgrep/rules/trailofbits/go
semgrep scan --config ~/.semgrep/rules/trailofbits/python
```

`scripts/semgrep-full-audit.sh` handles subdir selection automatically. Run through
the script, not manually.

---

## Semgrep Exit Codes

Understanding exit codes is required to correctly interpret scan results:

| Exit code | Meaning | Is the scan result usable? |
|-----------|---------|---------------------------|
| `0` | Ran cleanly, no findings | ✓ Yes — codebase is clean |
| `1` | Ran cleanly, findings found | ✓ Yes — normal result |
| `2` | Ran with rule warnings — some rules had YAML parse errors, scan still ran | ✓ Yes — findings are real, some rules skipped |
| `7` | Config entirely invalid — scan did NOT run | ✗ No — check your `--config` path |

**Exit code 2 is usable.** Prior documentation incorrectly treated exit 2 as broken.
It means the scan ran and produced findings; only some individual rules had parse issues.
`scripts/semgrep-full-audit.sh` treats exit codes 0, 1, and 2 as success.

---

## Community Rule Cache Location

**Canonical path:** `~/.semgrep/rules/`

```
~/.semgrep/rules/
  trailofbits/    — https://github.com/trailofbits/semgrep-rules
  elttam/         — https://github.com/elttam/semgrep-rules
  gitlab/         — https://gitlab.com/gitlab-org/security-products/sast-rules
  0xdea/          — https://github.com/0xdea/semgrep-rules
```

Install with `scripts/update-semgrep-rules.sh` (clones all four to the canonical path).
`scripts/semgrep-full-audit.sh` also checks `~/.cache/semgrep-community/` as a legacy
fallback for older installs.

---

## Source 1: Trail of Bits

**Repo:** https://github.com/trailofbits/semgrep-rules
**License:** AGPLv3
**Install path:** `~/.semgrep/rules/trailofbits/`

Trail of Bits is one of the top security research firms. Their rules come from real audit
engagements. **However, the rule content is highly specialized — not general web security.**
Know what you're getting before relying on it.

### What it actually contains (tested)

| Subdir | Rule count | What they cover |
|--------|-----------|-----------------|
| `javascript/` | 7 | Apollo/GraphQL CSRF + CORS **ONLY** — not general JS security |
| `python/` | 24 | ML library safety: pytorch/numpy/pandas unsafe deserialization, pickle |
| `go/` | 18 | **HIGH VALUE** — concurrency bugs, goroutine leaks, unsafe pointer arithmetic, ETH RPC |
| `ruby/` | 15 | Rails-specific patterns |
| `swift/` | varies | iOS-specific patterns |
| `hcl/` | 9 | Terraform/Vault hardening |
| `yaml/` | 48 | Infrastructure config: apt/yum/wget/GPG signing |
| `generic/` | 17 | SSL modes, wget flags — language-agnostic |
| `solidity/` | varies | Ethereum smart contract: reentrancy, integer overflow |

### When it helps vs. when it doesn't

**Use trailofbits/go** — genuinely high value for Go projects. Concurrency bugs,
goroutine leaks, and unsafe pointer usage that standard `p/gosec` misses.

**Do NOT expect trailofbits/javascript to catch web vulnerabilities.** It's 7 rules, all
Apollo/GraphQL CSRF and CORS. On a general Express or Next.js app, expect 0 findings —
that's correct, not a scan failure.

**Use trailofbits/python** if your codebase uses ML libraries. Not useful for pure web Python.

### Usage

```bash
# Go projects (high value)
semgrep scan --config ~/.semgrep/rules/trailofbits/go .

# Python ML projects
semgrep scan --config ~/.semgrep/rules/trailofbits/python .
```

---

## Source 2: elttam

**Repo:** https://github.com/elttam/semgrep-rules
**License:** MIT
**Install path:** `~/.semgrep/rules/elttam/`

### What it actually contains (tested)

elttam has two collections. They serve different purposes:

**`rules/` — static SAST rules:**

| Subdir | Status | What they cover |
|--------|--------|-----------------|
| `rules/yaml/` | ✓ 16 rules | **K8s security contexts** — `no-security-context`, `run-as-non-root`, `privileged-container` — genuinely useful |
| `rules/go/` | ✓ 3 rules | Unsafe uintptr conversion, symlink attacks, sprintf format injection |
| `rules/php/` | ✓ | PHP-specific patterns |
| `rules/java/` | ✓ exit 2 (one broken rule, scan still ran) | Java patterns |
| `rules/generic/` | ✓ | Language-agnostic patterns |

**`rules-audit/` — ORM data-leak research rules:**

One rule per language. These detect potential data leaks through ORM fields — they fire
at **INFO severity** only. Useful for auditing over-exposed model fields, not for
security alerting.

| Subdir | Status | What they cover |
|--------|--------|-----------------|
| `rules-audit/javascript/` | ✓ | ORM field exposure in JS |
| `rules-audit/python/` | ✓ | ORM field exposure in Python |
| `rules-audit/go/` | ✓ | ORM field exposure in Go |
| `rules-audit/java/` | ✓ | ORM field exposure in Java |
| `rules-audit/c/` | ✓ | C patterns |
| `rules-audit/csharp/` | ✓ | C# patterns |
| `rules-audit/kotlin/` | ✓ | Kotlin patterns |

### Usage

```bash
# K8s security (concrete value)
semgrep scan --config ~/.semgrep/rules/elttam/rules/yaml .

# Go unsafe patterns
semgrep scan --config ~/.semgrep/rules/elttam/rules/go .

# ORM data leak audit (INFO only)
semgrep scan --config ~/.semgrep/rules/elttam/rules-audit/javascript .
```

---

## Source 3: GitLab SAST Rules

**Repo:** https://gitlab.com/gitlab-org/security-products/sast-rules
**License:** MIT
**Install path:** `~/.semgrep/rules/gitlab/`

The most general-purpose of the four community repos. GitLab maintains these to power
their commercial SAST product. Good signal on common web vulnerabilities.

### What it actually contains (tested)

**Working language subdirs (confirmed exit 0/1/2):**

| Subdir | Rule count | Example findings |
|--------|-----------|-----------------|
| `python/` | 68 | MD5 hash usage, `subprocess` with `shell=True`, pickle deserialization |
| `javascript/` | varies | XSS, prototype pollution, eval injection |
| `go/` | varies | SQL injection, TLS misconfiguration |
| `java/` | varies | SQL injection, XXE, deserialization |
| `c/` | varies | Buffer overflow patterns |
| `csharp/` | varies | .NET-specific patterns |
| `scala/` | varies | Scala-specific patterns |

**Subdirs that exit 7 — NEVER USE:**

```
gitlab/ci/         — CI YAML, not Semgrep rules
gitlab/mappings/   — Metadata YAML, not Semgrep rules
gitlab/qa/         — Test scaffolding, not Semgrep rules
gitlab/rules/      — Top-level config, not Semgrep rules
gitlab/scripts/    — Shell scripts, not Semgrep rules
gitlab/spec/       — RSpec specs, not Semgrep rules
```

Pointing `--config` at any of the above causes exit 7 and zero findings.
`scripts/semgrep-full-audit.sh` explicitly allowlists only the working language dirs.

### Usage

```bash
# Python — good general coverage
semgrep scan --config ~/.semgrep/rules/gitlab/python .

# Go — complements p/gosec
semgrep scan --config ~/.semgrep/rules/gitlab/go .
```

---

## Source 4: 0xdea

**Repo:** https://github.com/0xdea/semgrep-rules
**License:** MIT
**Install path:** `~/.semgrep/rules/0xdea/`

Memory safety rules for C/C++. Not useful for any other language.

### What it actually contains (tested)

| Subdir | Status | What they cover |
|--------|--------|-----------------|
| `rules/` | ✓ | Use-after-free, double-free, integer overflow in allocations, format string bugs, unsafe `memcpy`/`strcpy` |

### When to use

Only include when the project has `.c`, `.cpp`, or `.h` files. `scripts/semgrep-full-audit.sh`
checks for C/C++ files before adding this source.

**Warning:** Slow on large C/C++ codebases. On a 500K LOC C++ project, expect 5-15 minutes.
Deep audit tier only — never in CI.

### Usage

```bash
# C/C++ projects only
semgrep scan --config ~/.semgrep/rules/0xdea/rules .
```

---

## Registry Packs: Dead vs. Alive (Verified 2026-04-13)

Some registry packs return HTTP 404 (deprecated or moved to the paid tier). A 404'd pack
causes semgrep to exit 0 with an empty `results: []` — indistinguishable from "no findings"
unless you check the scan log. `scripts/semgrep-full-audit.sh` probes every pack before
using it and logs skipped packs.

### Confirmed dead (exit 7 / HTTP 404)

| Pack | Status | Replacement |
|------|--------|-------------|
| `p/cpp` | ❌ Dead — HTTP 404 | `p/c` (thin: 2 rules), **cpp-bridge rules**, 0xdea + GitLab community |
| `p/express` | ❌ Dead — HTTP 404 | `p/javascript` + `p/nodejsscan` |
| `p/nextjs` | ❌ Empty — returns `rules: []` | `p/react` + `p/javascript` |
| `p/rails` | ❌ Dead — HTTP 404 | `p/ruby` + `p/brakeman` |
| `p/gin` | ❌ Dead — HTTP 404 | `p/golang` + `p/gosec` |
| `p/spring` | ❌ Dead — HTTP 404 | `p/java` |
| `p/ci` | Meta-pack (not downloadable as static YAML) | `p/default` + `p/secrets` + language packs |

### Confirmed alive (verified working)

| Category | Packs |
|----------|-------|
| Core security | `p/owasp-top-ten`, `p/security-audit`, `p/secrets`, `p/default` |
| Languages | `p/javascript`, `p/typescript`, `p/python`, `p/golang`, `p/java`, `p/ruby`, `p/php`, `p/rust`, `p/kotlin`, `p/csharp`, `p/c`, `p/swift`, `p/scala` |
| Language-native | `p/bandit` (Python), `p/gosec` (Go), `p/brakeman` (Ruby), `p/nodejsscan` (Node.js) |
| Frameworks | `p/react`, `p/django`, `p/flask`, `p/fastapi` |
| IaC | `p/dockerfile`, `p/terraform`, `p/kubernetes`, `p/github-actions` |

### `p/nodejsscan` — important addition

`p/nodejsscan` is confirmed working and fills the gap left by dead `p/express` and `p/nextjs`.
It finds:
- Command injection via `child_process.exec(userInput)` → RCE
- SQL injection in Node.js query strings
- Hardcoded API keys and secrets

`scripts/semgrep-full-audit.sh` includes `p/nodejsscan` in Node.js framework detection.

---

## Installing Community Rules

```bash
# Clone all four sources to the canonical cache path
scripts/update-semgrep-rules.sh

# Validate which subdirs are working (uses exit code verification)
scripts/update-semgrep-rules.sh --test

# Pull latest + update the lock file
scripts/update-semgrep-rules.sh --bump

# Verify sources match pinned commits
scripts/update-semgrep-rules.sh --verify

# Check for stale sources (> 90 days since upstream commit)
scripts/update-semgrep-rules.sh --check-staleness

# Download registry packs for offline use
scripts/update-semgrep-rules.sh --cache-packs
# or directly:
scripts/cache-registry-packs.sh
```

---

## Offline / Air-Gapped Scanning

Registry packs (`p/javascript`, `p/owasp-top-ten`, etc.) require internet at scan time. For offline environments:

```bash
# 1. While online: download all registry packs as local YAML files
scripts/cache-registry-packs.sh

# 2. Run scans offline — uses cached YAML instead of hitting semgrep.dev
scripts/semgrep-full-audit.sh --offline
```

**Cache location:** `~/.semgrep/registry-cache/` (override: `SEMGREP_REGISTRY_CACHE` env var)

**Cache management:**
- `scripts/cache-registry-packs.sh --status` — show what's cached and age
- `scripts/cache-registry-packs.sh --refresh` — re-download all packs
- `scripts/cache-registry-packs.sh --prune` — remove dead/empty pack files

**Automatic cache preference:** Even without `--offline`, if a cached YAML file exists for a pack, it is used first (avoids network latency). The `--offline` flag makes cache mandatory — missing packs are skipped instead of fetched.

---

## C/C++ Bridge Rules

Since `p/cpp` is dead and `p/c` has only 2 rules, this toolchain provides custom bridge rules for C/C++ security scanning:

**Location:** `.semgrep/cpp-bridge-rules/cpp-security.yml`
**Languages:** `[c, cpp]` — fires on both `.c` and `.cpp` files
**Rule count:** 15 rules covering:

| Category | Rules | CWE |
|----------|-------|-----|
| Buffer overflow | `strcpy`, `strcat`, `sprintf`, `gets` | CWE-120 |
| Format string | `printf(var)`, `fprintf(stream, var)`, `syslog(pri, var)` | CWE-134 |
| Memory safety | Use-after-free, double-free patterns | CWE-416, CWE-415 |
| Integer overflow | `atoi` without error checking | CWE-190 |
| Command injection | `system()`, `popen()` | CWE-78 |
| Deprecated/banned | `tmpnam`, `mktemp` | CWE-377 |
| Crypto weakness | `rand()`/`srand()` for security contexts | CWE-338 |

These rules load automatically when C/C++ files are detected. Combined with 0xdea (~50 rules) and GitLab community (~20 rules), C/C++ projects get ~87 rules total — comparable to more mature language packs.

---

## Rule Pinning Strategy

Community rules change. Pin to specific commit hashes for repeatable audits.

**Pinning file** — `.semgrep/community-rules.lock` (committed to the project):

```yaml
# Semgrep community rule pinning
# Update quarterly via scripts/update-semgrep-rules.sh --bump
# After bumping, run a full audit to verify no regressions

sources:
  trailofbits:
    repo: https://github.com/trailofbits/semgrep-rules
    commit: <hash>
    pinned_at: 2026-04-13

  elttam:
    repo: https://github.com/elttam/semgrep-rules
    commit: <hash>
    pinned_at: 2026-04-13

  gitlab:
    repo: https://gitlab.com/gitlab-org/security-products/sast-rules
    commit: <hash>
    pinned_at: 2026-04-13

  0xdea:
    repo: https://github.com/0xdea/semgrep-rules
    commit: <hash>
    pinned_at: 2026-04-13
```

Run `scripts/update-semgrep-rules.sh --bump` to auto-populate real commit hashes.

---

## Quarterly Refresh

1. `scripts/update-semgrep-rules.sh --check-staleness` — warns on sources > 90 days stale
2. `scripts/update-semgrep-rules.sh --bump` — pulls latest, updates `.semgrep/community-rules.lock`
3. Run a full audit immediately after — compare finding count against prior audit
4. Triage any new findings in `docs/security/TRIAGE.md` before accepting the bump

**Staleness thresholds:** warn at 90 days, fail at 180 days.

---

## Combining with Official Registry Packs

Community rules supplement the official packs — they don't replace them.

### Polyglot Detection

`scripts/semgrep-full-audit.sh` detects **ALL** languages in a project, not just the first.
A .NET backend + React frontend gets both `p/csharp` AND `p/javascript` rules. Community
rules are also loaded for every detected language. This is critical for:

- Monorepos with multiple services in different languages
- Mobile apps with native + JS bridge code (React Native + Swift/Kotlin)
- .NET projects with JavaScript frontends
- C/C++ projects with Python bindings
- Java + Kotlin Android projects

### Language → Registry Pack + Community Rule Coverage Matrix

| Language | Registry Packs | Community Rules |
|----------|---------------|-----------------|
| JavaScript/TypeScript | `p/javascript`, `p/typescript`, `p/nodejsscan` | trailofbits/javascript, elttam/rules-audit/javascript, gitlab/javascript | — |
| Python | `p/python`, `p/bandit` | trailofbits/python, elttam/rules-audit/python, gitlab/python | — |
| Go | `p/golang`, `p/gosec` | trailofbits/go, elttam/rules/go, elttam/rules-audit/go, gitlab/go | — |
| Rust | `p/rust` | (no community rules currently) | **rust-security.yml** (15 rules) |
| Java | `p/java` | elttam/rules/java, elttam/rules-audit/java, gitlab/java | — |
| Kotlin | `p/kotlin`, `p/java` | elttam/rules-audit/kotlin, + all Java community rules | **kotlin-security.yml** (16 rules) |
| C# / .NET | `p/csharp` | elttam/rules-audit/csharp, gitlab/csharp | **csharp-security.yml** (20 rules) |
| C / C++ | `p/c` (**`p/cpp` is dead**) | **cpp-bridge** (15 rules), elttam/rules/c, elttam/rules-audit/c, gitlab/c, 0xdea/rules (~50 rules) | — |
| Swift | `p/swift` | trailofbits/swift | **swift-security.yml** (17 rules) |
| Ruby | `p/ruby`, `p/brakeman` | trailofbits/ruby | — |
| PHP | `p/php` | elttam/rules/php | **php-security.yml** (15 rules) |
| Scala | `p/scala` | gitlab/scala | — |

> **All languages also get:** `trailofbits/generic` (language-agnostic rules: SSL modes, wget flags, etc.)
>
> **Custom gap-filler rules** (98 total across 6 languages) load automatically from `.semgrep/custom-rules/` when the audit script detects the corresponding language. They fill OWASP Top 10 gaps in registry packs with thin coverage. See `references/semgrep-guide.md` § "Custom gap-filler rulesets" for the full inventory.

```bash
# semgrep-full-audit.sh does this automatically.
# Shown here for reference ONLY — always use the script.
semgrep scan \
  --config p/owasp-top-ten \
  --config p/security-audit \
  --config p/secrets \
  --config p/golang \
  --config p/gosec \
  --config ~/.semgrep/rules/trailofbits/go \
  --config ~/.semgrep/rules/elttam/rules/go \
  --config ~/.semgrep/rules/gitlab/go \
  --config .semgrep/project-rules \
  --metrics=off --json -o docs/security/semgrep-results.json .
```

Expect duplicate findings across packs — same issue caught by multiple rules.
Semgrep deduplicates by `check_id + path + line`, so the final count won't double.

---

## Per-Project Custom Rules

Community rules catch generic patterns. Every project has project-specific anti-patterns:

- "Auth middleware must be `requireAuth()`, not `authenticate()`"
- "Session tokens must go in `httpOnly` cookies, never localStorage"
- "Never import from `legacy/` in new code"

Store these in `.semgrep/project-rules/` — version-controlled with the project.
Every time the security audit finds a new pattern manually, capture it as a rule.
See `semgrep-guide.md` § Writing Custom Rules for syntax.

---

## Known Gotchas

**trailofbits/javascript is NOT general JavaScript security.** It's 7 rules, all
Apollo/GraphQL CSRF and CORS. Expect 0 findings on most JS codebases — that's correct.

**trailofbits/python is NOT general Python web security.** It targets ML library
safety (pytorch, numpy, pandas). For general Python web security, use `p/python`,
`p/bandit`, and `gitlab/python`.

**elttam/rules-audit fires INFO only.** These are ORM data-leak research rules —
one rule per language. They don't produce security findings, just informational
notes on potentially over-exposed model fields.

**gitlab/python is the richest community source for Python web apps.** 68 rules
covering MD5, subprocess injection, pickle deserialization, SSRF patterns. Use it.

**Never use gitlab root or non-language subdirs.** `gitlab/ci`, `gitlab/mappings`,
`gitlab/qa`, `gitlab/rules`, `gitlab/scripts`, `gitlab/spec` all exit 7 (config
parse error). The scan log will show 0 findings, but the scan never ran.

**Licensing notes:**
- Trail of Bits: AGPLv3 — running rules to scan is fine; distributing rules bundled in a commercial product requires AGPL compliance
- elttam, GitLab, 0xdea: MIT — no compliance concerns
- The agent only runs these rules locally; rule content is not redistributed
