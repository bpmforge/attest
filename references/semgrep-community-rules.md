# Semgrep Community Rule Sources

**Last updated:** 2026-04-10

Semgrep's official Registry (`p/owasp-top-ten`, `p/security-audit`, etc.) is a solid baseline, but the highest-signal rules come from independent security research firms and community contributors. This guide lists the rule sources to pull in for deep security audits, along with pinning and refresh strategy.

## Core Community Sources

### 1. Trail of Bits (HIGHEST PRIORITY)
**Repo:** https://github.com/trailofbits/semgrep-rules
**License:** AGPLv3
**Focus:** Go, Python, JavaScript/TypeScript, Dockerfile, Solidity, C/C++
**Why:** Trail of Bits is one of the top security research firms in the industry. Their rules come from real audit findings and are battle-tested against real exploits. Extremely high signal-to-noise ratio.

**Notable rule sets:**
- `go/` — Go-specific: integer overflow, sql injection, unsafe pointer, crypto misuse, goroutine leaks
- `python/` — pickle deserialization, tempfile race conditions, subprocess injection, yaml unsafe load, XXE
- `javascript/` — prototype pollution, eval, unsafe regex, XSS in templates
- `dockerfile/` — missing user, curl piped to bash, apt-get without version pinning
- `solidity/` — reentrancy, integer overflow (pre-0.8), tx.origin

**Clone command:**
```bash
git clone --depth 1 https://github.com/trailofbits/semgrep-rules \
  ~/.cache/semgrep-community/trailofbits
```

**Usage:**
```bash
semgrep scan --config ~/.cache/semgrep-community/trailofbits
```

---

### 2. elttam
**Repo:** https://github.com/elttam/semgrep-rules
**License:** MIT
**Focus:** JavaScript/TypeScript, taint tracking
**Why:** elttam is an Australian security firm with a reputation for deep JavaScript expertise. Their taint-tracking rules for Node.js/Express/Next.js catch cases the default Semgrep rules miss — especially prototype pollution sources, NoSQL injection, and SSRF variants.

**Clone command:**
```bash
git clone --depth 1 https://github.com/elttam/semgrep-rules \
  ~/.cache/semgrep-community/elttam
```

**Usage:**
```bash
semgrep scan --config ~/.cache/semgrep-community/elttam
```

---

### 3. GitLab SAST Rules
**Repo:** https://gitlab.com/gitlab-org/security-products/sast-rules
**License:** MIT
**Focus:** Multi-language — the rules that power GitLab's commercial SAST product
**Why:** GitLab maintains these rules for their paying customers, with full CWE mappings and severity levels calibrated to actual production findings. Covers languages beyond the others (PHP, Java, Scala).

**Clone command:**
```bash
git clone --depth 1 https://gitlab.com/gitlab-org/security-products/sast-rules \
  ~/.cache/semgrep-community/gitlab
```

**Usage:**
```bash
semgrep scan --config ~/.cache/semgrep-community/gitlab/<language>
```

> **Note:** GitLab rules are organized by language (`go/`, `javascript/`, `python/`, etc.). Pick the subdirectory matching the project language rather than scanning the whole repo — some rules are experimental.

---

### 4. 0xdea Rules (C/C++ ONLY)
**Repo:** https://github.com/0xdea/semgrep-rules
**License:** MIT
**Focus:** C/C++ memory safety
**Why:** Memory safety bugs in C/C++ are the single biggest source of CVEs. 0xdea's rules target classic use-after-free, double-free, integer overflow in allocations, format string bugs, and unsafe `memcpy`/`strcpy` patterns that grep can't reliably find.

**Clone command:**
```bash
git clone --depth 1 https://github.com/0xdea/semgrep-rules \
  ~/.cache/semgrep-community/0xdea
```

**Usage (only if project contains C/C++ code):**
```bash
semgrep scan --config ~/.cache/semgrep-community/0xdea
```

---

## Secondary Sources (Situational)

### 5. Ajin Abraham / NodeJsScan
**Repo:** https://github.com/ajinabraham/nodejsscan
**License:** GPLv3
**Focus:** Node.js security — extracted rules work standalone with Semgrep
**Use when:** Node.js project where elttam rules didn't catch enough.

### 6. Sourcegraph Security Rules
**Repo:** https://github.com/returntocorp/semgrep-rules (the official rules repo — also includes community contributions not in the registry)
**License:** LGPLv2
**Use when:** You want the bleeding-edge rules that haven't been promoted to the Registry yet.

---

## Rule Pinning Strategy

Community rules change. A rule update can introduce new findings on code that was clean yesterday, or (rarely) remove a rule that was catching a real issue. For repeatable audits, pin to specific commit hashes.

**Pinning file** — `.semgrep/community-rules.lock` (committed to the project):

```yaml
# Semgrep community rule pinning
# Update quarterly via scripts/update-semgrep-rules.sh --bump
# After bumping, run a full audit to verify no regressions

sources:
  trailofbits:
    repo: https://github.com/trailofbits/semgrep-rules
    commit: abc123def4567890abc123def4567890abcdef12
    pinned_at: 2026-01-15
    notes: "Baseline for Q1 2026 audit cycle"

  elttam:
    repo: https://github.com/elttam/semgrep-rules
    commit: 9876543210fedcba9876543210fedcba98765432
    pinned_at: 2026-01-15

  gitlab:
    repo: https://gitlab.com/gitlab-org/security-products/sast-rules
    commit: 1122334455667788990011223344556677889900
    pinned_at: 2026-01-15

  0xdea:
    repo: https://github.com/0xdea/semgrep-rules
    commit: aabbccddeeff00112233445566778899aabbccdd
    pinned_at: 2026-01-15
```

**Enforcement** — when the agent runs a deep audit, it should:
1. Check that each cached rule source matches the pinned commit
2. If a source is at a different commit, warn: "trailofbits is at commit X, pinned commit is Y. Run `scripts/update-semgrep-rules.sh --verify` or `--bump`."
3. Do not silently use drifted rules.

---

## Quarterly Refresh

Community rules get stale. Set a calendar reminder every 90 days to:

1. Run `scripts/update-semgrep-rules.sh --check-staleness` — warns on any source that hasn't been updated upstream in > 90 days
2. Run `scripts/update-semgrep-rules.sh --bump` — pulls latest commits, updates `.semgrep/community-rules.lock`
3. Run a full audit immediately after — compare finding count against prior audit
4. If new findings appear, triage them in `docs/security/TRIAGE.md` before accepting the bump

**Staleness threshold:** warn at 90 days, fail (refuse to use) at 180 days. A rule source that hasn't been updated in 6 months is probably abandoned.

---

## Combining with Official Registry Packs

Community rules **supplement** the official packs, they don't replace them. The deep audit should run BOTH:

```bash
semgrep scan \
  --config p/owasp-top-ten \
  --config p/security-audit \
  --config p/secrets \
  --config p/<language> \
  --config p/<framework> \
  --config ~/.cache/semgrep-community/trailofbits \
  --config ~/.cache/semgrep-community/elttam \
  --config ~/.cache/semgrep-community/gitlab/<language> \
  --config .semgrep/project-rules \
  --json \
  --sarif \
  -o docs/security/semgrep-results.json
```

Expect some duplicate findings across packs (same issue caught by multiple rules). Semgrep deduplicates based on `check_id + path + line`. Keep all sources configured — duplicates are cheap, missing coverage is expensive.

---

## Per-Project Custom Rules

Community rules catch generic patterns. Every project also has **project-specific anti-patterns** — things that are unique to your codebase's architecture and conventions. Examples:

- "All database models must go through `Repository` interface, never call `db.query()` directly"
- "Auth middleware must be `requireAuth()`, not `authenticate()`"
- "Never import from `legacy/` directory in new code"
- "Session tokens must go in `httpOnly` cookies, never localStorage"

**Store these in `.semgrep/project-rules/`** — version-controlled with the project. Every time the security audit finds a new pattern manually, write a custom rule capturing it so the next audit catches it automatically. This is how the audit gets smarter over time.

See `semgrep-guide.md` § Writing Custom Rules for syntax.

---

## Licensing Notes

- **Trail of Bits** rules are **AGPLv3**. Running them to scan your code is fine. Distributing the rules bundled with a commercial product requires AGPL compliance.
- **elttam** and **GitLab** rules are **MIT** — no compliance concerns.
- **0xdea** rules are **MIT**.
- **NodeJsScan** is **GPLv3** — same as AGPL, distribution concerns, scan usage is fine.

The agent only runs these rules locally to produce findings. The rule content is not redistributed. This is equivalent to running a linter — no license conflict for the project being scanned.

---

## Known Gotchas

**Trail of Bits Python rules flag `subprocess` calls aggressively.** If your codebase uses subprocess legitimately (e.g., calling a CLI tool with validated input), expect to suppress some findings with `nosemgrep: python.lang.security.audit.dangerous-subprocess-use.dangerous-subprocess-use` comments and a justification.

**elttam taint rules require sources to be fully annotated.** If your custom middleware sanitizes input, you may need to add it as a sanitizer in a custom rule for elttam's taint tracking to recognize it.

**GitLab rules overlap heavily with `p/owasp-top-ten`.** Expect 30-50% duplicate findings on first scan. This is expected — Semgrep deduplicates by location+rule-id, so the final report won't be double-counted.

**0xdea rules are slow on large C/C++ codebases.** Pattern matching against memory-safety signatures is CPU-intensive. On a 500K LOC C++ project, expect 5-15 minutes. Run it in the deep audit tier only, never in CI.
